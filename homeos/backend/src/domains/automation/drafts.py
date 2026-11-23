"""Phase-1 自动化草案：生成、修订、澄清、冲突扫描与只读发现。

设计边界（与参考实现一致）：

- 草案**只预览**：``specJson`` 不会被写进 HA，也不会自动执行；用户显式确认后才会
  由 ``prepare_apply`` / ``mark_applied`` 落成一条本机计划任务（见 ``api/automation.py``）；
- ``status`` 生命周期：``READY / CLARIFYING / BLOCKED / EXPIRED / SUPERSEDED / DISCARDED``；
- TTL **30 分钟**，后台每分钟清理一次过期草案；
- 每会话最多 **10 条**在册草案，超出淘汰最旧（``SUPERSEDED``）；
- 同一规范（``sha256(JSON(spec))``）在有效会话内幂等：返回已有草案而不是新建；
- 模板禁用：动作服务或目标里含 ``{{`` 直接拒绝（禁止把模板注入下游）；
- 高危拦截：lock / alarm_disarm / 车库门 / 燃气阀 → 永不 ``READY``（``BLOCKED``）。

输入归一化、风险判定在 :mod:`.spec`；发现与冲突扫描在 :mod:`.findings`。本模块只负责
持久化、生命周期，以及把两者组装成前端 / Agent 都能直接消费的载荷。
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import timedelta
from typing import Any

from sqlalchemy import delete, select

from .findings import read_ha_automations, read_policy_rules, read_scheduled_rules, scan_conflicts
from .landing import build_ha_automation_payload, build_task_payload, describe_landing
from .spec import (
    INTENT_SUMMARY_MAX,
    MAX_CANDIDATES,
    action_verb,
    contains_template,
    describe_trigger,
    is_high_risk,
    iso,
    merge_spec,
    naive_now,
    normalize_spec,
    sanitize_untrusted_text,
    spec_hash,
    text,
)
from ...platform.core.db.automation_models import AutomationDraft, AutomationDraftRevision

logger = logging.getLogger("homeos.automation")

DRAFT_TTL = timedelta(minutes=30)
SWEEP_INTERVAL_SECONDS = 60
#: 旧草案物理清理：每 6 小时最多一次，保留 7 天
PRUNE_INTERVAL_SECONDS = 6 * 3600
PRUNE_RETENTION_DAYS = 7
MAX_PENDING_DRAFTS_PER_SESSION = 10
#: 设备索引缓存时长：新加设备最多半分钟后即可被名称解析到
ENTITY_CACHE_SECONDS = 30

STATUS_READY = "READY"
STATUS_CLARIFYING = "CLARIFYING"
STATUS_BLOCKED = "BLOCKED"
STATUS_EXPIRED = "EXPIRED"
STATUS_SUPERSEDED = "SUPERSEDED"
STATUS_DISCARDED = "DISCARDED"
#: 已由用户确认落成计划任务（不再出现在待确认列表）
STATUS_APPLIED = "APPLIED"
#: 在册（会出现在设置页）的状态：拦截的高危草案也要能看到原因，不能静默消失
ACTIVE_STATUSES = (STATUS_READY, STATUS_CLARIFYING, STATUS_BLOCKED)
#: 列表刷新时的过期清理节流：20 秒轮询不必每次都写一遍状态
SWEEP_THROTTLE_SECONDS = 15


class AutomationDraftService:
    """草案 CRUD + 澄清 + 冲突扫描。"""

    def __init__(
        self, session_factory: Any, state_store: Any = None, scheduler: Any = None, policy: Any = None
    ) -> None:
        self._session_factory = session_factory
        self._state_store = state_store
        self._scheduler = scheduler
        self._policy = policy
        self._task: asyncio.Task[None] | None = None
        self._stop: asyncio.Event | None = None
        self._last_prune = 0.0
        self._last_sweep = 0.0
        self._entity_cache: tuple[int, float, list[dict[str, Any]]] | None = None

    # ------------------------------------------------------------------ 生命周期
    async def start(self) -> None:
        """启动过期清理循环（幂等）；失败只记日志，不影响主服务启动。"""
        if self._task is not None and not self._task.done():
            return
        self._stop = asyncio.Event()
        self._task = asyncio.create_task(self._sweeper_loop(), name="automation-draft-sweeper")

    async def stop(self) -> None:
        """停止清理循环并等待退出。"""
        if self._stop is not None:
            self._stop.set()
        task = self._task
        self._task = None
        self._stop = None
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:  # fmt: skip
                pass

    async def _sweeper_loop(self) -> None:
        while True:
            stop = self._stop
            if stop is None:
                return
            try:
                await asyncio.wait_for(stop.wait(), timeout=SWEEP_INTERVAL_SECONDS)
                return
            except TimeoutError:
                pass
            try:
                expired = await asyncio.to_thread(self.sweep_expired)
                if expired:
                    logger.info("自动化草案过期清理: %s 条", expired)
            except Exception as exc:  # fmt: skip
                logger.warning("自动化草案过期清理失败: %s", exc)
            now = time.monotonic()
            if now - self._last_prune >= PRUNE_INTERVAL_SECONDS:
                self._last_prune = now
                try:
                    removed = await asyncio.to_thread(self.prune, PRUNE_RETENTION_DAYS)
                    if removed:
                        logger.info("自动化草案历史清理: %s 条", removed)
                except Exception as exc:  # fmt: skip
                    logger.warning("自动化草案历史清理失败: %s", exc)

    # ------------------------------------------------------------------ 创建 / 修订
    def create_draft(
        self,
        spec: dict[str, Any],
        *,
        raw_prompt: str,
        session_key: str,
        channel: str = "web",
        principal_id: str | None = None,
        identity_strength: str = "NONE",
        utterance_kind: str = "RULE",
    ) -> dict[str, Any]:
        normalized = self._normalize(spec, raw_prompt)
        if contains_template(normalized):
            return {"success": False, "status": "rejected_template", "message": "动作或目标里不能包含模板语法。"}
        clarification = self._clarify(normalized, utterance_kind)
        if clarification is not None:
            return clarification
        risky = is_high_risk(normalized)
        digest = spec_hash(normalized)
        session_key = session_key or "default"
        with self._session_factory() as session:
            existing = self._find_by_hash(session, digest, session_key)
            if existing is not None:
                payload = self._payload(session, existing, created=False)
                existing_risks = is_high_risk(payload.get("spec") or {})
                if existing_risks:
                    return {
                        **payload,
                        "status": "rejected_high_risk",
                        "blocked": True,
                        "reasons": existing_risks,
                    }
                return payload
            self._enforce_pending_limit(session, session_key)
            draft = AutomationDraft(
                status=STATUS_BLOCKED if risky else self._active_status(normalized),
                raw_prompt=sanitize_untrusted_text(raw_prompt or normalized.get("intentSummary"), 500),
                target_backend=text(normalized.get("targetBackend")) or "HA",
                origin_session_key=session_key,
                origin_channel=channel or "web",
                origin_principal_id=principal_id,
                identity_strength=identity_strength or "NONE",
                expires_at=naive_now() + DRAFT_TTL,
            )
            session.add(draft)
            session.flush()
            session.add(
                AutomationDraftRevision(
                    draft_id=draft.id,
                    rev_seq=1,
                    spec_json=json.dumps(normalized, ensure_ascii=False),
                    spec_hash=digest,
                    preview_json=json.dumps(self._preview(normalized, risky), ensure_ascii=False),
                )
            )
            session.commit()
            session.refresh(draft)
            payload = self._payload(session, draft, created=True)
        if risky:
            return {**payload, "status": "rejected_high_risk", "blocked": True, "reasons": risky}
        return payload

    def revise_draft(
        self,
        draft_id: str,
        patch: dict[str, Any],
        *,
        session_key: str | None = None,
    ) -> dict[str, Any]:
        del session_key  # 草案归属由创建会话固定；修订只按 draftId 定位
        with self._session_factory() as session:
            draft = session.get(AutomationDraft, draft_id)
            if draft is None:
                return {"success": False, "message": "没有找到这份草案。"}
            if self._expire_if_stale(session, draft):
                return {"success": False, "status": STATUS_EXPIRED, "message": "草案已过期。"}
            if draft.status in (STATUS_DISCARDED, STATUS_SUPERSEDED):
                return {"success": False, "status": draft.status, "message": "草案已作废或被替代，不能继续修订。"}
            latest = self._latest_revision(session, draft)
            current = json.loads(latest.spec_json) if latest is not None else {}
            normalized = self._normalize(merge_spec(current, patch))
            if contains_template(normalized):
                return {"success": False, "status": "rejected_template", "message": "动作或目标里不能包含模板语法。"}
            clarification = self._clarify(normalized, "RULE")
            if clarification is not None:
                return clarification
            risky = is_high_risk(normalized)
            session.add(
                AutomationDraftRevision(
                    draft_id=draft.id,
                    rev_seq=draft.current_rev_seq + 1,
                    spec_json=json.dumps(normalized, ensure_ascii=False),
                    spec_hash=spec_hash(normalized),
                    preview_json=json.dumps(self._preview(normalized, risky), ensure_ascii=False),
                )
            )
            draft.current_rev_seq += 1
            draft.status = STATUS_BLOCKED if risky else self._active_status(normalized)
            session.commit()
            payload = self._payload(session, draft, created=False)
        if risky:
            return {**payload, "status": "rejected_high_risk", "blocked": True, "reasons": risky}
        return payload

    def get_draft(self, draft_id: str) -> dict[str, Any] | None:
        with self._session_factory() as session:
            draft = session.get(AutomationDraft, draft_id)
            if draft is None or draft.status in (STATUS_EXPIRED, STATUS_DISCARDED):
                return None
            if self._expire_if_stale(session, draft):
                return None
            return self._payload(session, draft, created=False)

    def list_drafts(self, session_key: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        """最近草案（前端列表用）；不返回已过期/已丢弃的。"""
        # 列表是用户最常打开的入口：先同步一次过期状态，避免后台循环未到点或进程刚启动时
        # 把已过期的草案当成「待确认」展示。前端每 20 秒轮询一次，这里按 15 秒节流，
        # 不至于每次只读请求都写一遍状态。
        if time.monotonic() - self._last_sweep >= SWEEP_THROTTLE_SECONDS:
            self._last_sweep = time.monotonic()
            try:
                self.sweep_expired()
            except Exception as exc:  # fmt: skip
                logger.warning("列表前清理过期草案失败: %s", exc)
        with self._session_factory() as session:
            query = select(AutomationDraft).where(
                AutomationDraft.status.in_(ACTIVE_STATUSES),
                AutomationDraft.expires_at > naive_now(),
            )
            if session_key:
                query = query.where(AutomationDraft.origin_session_key == session_key)
            rows = session.scalars(
                query.order_by(AutomationDraft.created_at.desc()).limit(max(1, min(200, int(limit or 50))))
            ).all()
            return [self._payload(session, row, created=False) for row in rows]

    def discard(self, draft_id: str) -> dict[str, Any]:
        with self._session_factory() as session:
            draft = session.get(AutomationDraft, draft_id)
            if draft is None:
                return {"success": False, "status": STATUS_DISCARDED, "message": "没有找到这份草案。"}
            if draft.status in ACTIVE_STATUSES:
                draft.status = STATUS_DISCARDED
                session.commit()
            return {"success": True, "status": draft.status}

    def sweep_expired(self) -> int:
        """把过期草案标记为 EXPIRED；返回处理条数。"""
        with self._session_factory() as session:
            rows = session.scalars(
                select(AutomationDraft).where(
                    AutomationDraft.status.in_(ACTIVE_STATUSES),
                    AutomationDraft.expires_at <= naive_now(),
                )
            ).all()
            for row in rows:
                row.status = STATUS_EXPIRED
            session.commit()
            return len(rows)

    def prune(self, older_than_days: int = PRUNE_RETENTION_DAYS) -> int:
        """物理清理旧草案与修订（保留最近 7 天，避免表无限增长）。"""
        cutoff = naive_now() - timedelta(days=max(1, older_than_days))
        with self._session_factory() as session:
            stale = session.scalars(select(AutomationDraft.id).where(AutomationDraft.created_at < cutoff)).all()
            if not stale:
                return 0
            session.execute(delete(AutomationDraftRevision).where(AutomationDraftRevision.draft_id.in_(stale)))
            session.execute(delete(AutomationDraft).where(AutomationDraft.id.in_(stale)))
            session.commit()
            return len(stale)

    def _block_reason(self, session: Any, draft: AutomationDraft) -> str:
        """草案为什么不能落地 / 拆分；空串表示可执行。"""
        if draft.status in (STATUS_EXPIRED, STATUS_DISCARDED, STATUS_SUPERSEDED):
            return "草案已失效，请重新生成。"
        if self._expire_if_stale(session, draft):
            return "草案已过期，请重新生成。"
        if draft.status == STATUS_BLOCKED:
            return "草案命中高危设备，已被拦截，不能落地。"
        if draft.status == STATUS_CLARIFYING:
            return "草案还有目标未解析，请先补充设备。"
        if draft.status != STATUS_READY:
            return "当前状态的草案不能操作。"
        return ""

    # ------------------------------------------------------------------ 落地为计划任务
    def prepare_apply(self, draft_id: str) -> dict[str, Any]:
        """校验草案是否可落地，并给出计划任务载荷（不写入任何东西）。

        调用方拿到 ``task`` 后交给调度器 ``create_task``，成功后再调 :meth:`mark_applied`。
        把「读取草案」与「创建任务」分开，是为了让调度器始终在事件循环里执行，而不是
        在数据库线程里被同步调用。
        """
        with self._session_factory() as session:
            draft = session.get(AutomationDraft, draft_id)
            if draft is None:
                return {"ok": False, "reason": "not_found", "message": "没有找到这份草案。"}
            if draft.status == STATUS_APPLIED:
                return {
                    "ok": False,
                    "reason": "applied",
                    "message": "这份草案已经落成计划任务，请勿重复创建。",
                    "taskId": draft.execution_id or "",
                }
            reason = self._block_reason(session, draft)
            if reason:
                return {"ok": False, "reason": draft.status.lower(), "message": reason}
            latest = self._latest_revision(session, draft)
            spec = json.loads(latest.spec_json) if latest is not None else {}
        task, error = build_task_payload(spec)
        if task is None:
            return {"ok": False, "reason": "unsupported", "message": error}
        return {
            "ok": True,
            "draftId": draft_id,
            "task": task,
            "summary": describe_landing(spec),
            "conflicts": self.conflict_report(spec),
        }

    def prepare_ha_export(self, draft_id: str) -> dict[str, Any]:
        """校验草案能否写成 HA 自动化，并给出 ``automationId`` + 配置体（不写任何东西）。

        与 :meth:`prepare_apply` 的差别只在目标形状：那边产出本机计划任务载荷，
        这边产 HA 的 ``trigger`` / ``action``。``automationId`` 由 draft_id 派生
        （``homeos_<draft_id 前 16 位>``），因此重复导出是**覆盖同一条**而不是新增。
        """
        with self._session_factory() as session:
            draft = session.get(AutomationDraft, draft_id)
            if draft is None:
                return {"ok": False, "reason": "not_found", "message": "没有找到这份草案。"}
            reason = self._block_reason(session, draft)
            if reason:
                return {"ok": False, "reason": draft.status.lower(), "message": reason}
            latest = self._latest_revision(session, draft)
            spec = json.loads(latest.spec_json) if latest is not None else {}
        automation, error = build_ha_automation_payload(spec)
        if automation is None:
            return {"ok": False, "reason": "unsupported", "message": error}
        return {
            "ok": True,
            "draftId": draft_id,
            "automationId": f"homeos_{draft_id.replace('-', '')[:16]}",
            "automation": automation,
            "conflicts": self.conflict_report(spec),
        }

    def mark_exported(self, draft_id: str, automation_id: str) -> bool:
        """记下「已导出到 HA」的执行 id（**不改状态**：草案仍可在 HomeOS 侧继续使用）。"""
        with self._session_factory() as session:
            draft = session.get(AutomationDraft, draft_id)
            if draft is None:
                return False
            draft.execution_id = text(automation_id)[:64] or None
            session.commit()
            return True

    def mark_applied(self, draft_id: str, task_id: str) -> bool:
        """把草案标记为 APPLIED 并记下计划任务 ID；重复调用是幂等的。"""
        with self._session_factory() as session:
            draft = session.get(AutomationDraft, draft_id)
            if draft is None:
                return False
            if draft.status == STATUS_APPLIED:
                return True
            if draft.status not in ACTIVE_STATUSES:
                return False
            draft.status = STATUS_APPLIED
            draft.execution_id = text(task_id)[:64] or None
            session.commit()
            return True

    def set_targets(self, draft_id: str, entity_ids: list[str]) -> dict[str, Any]:
        """直接改写草案的目标设备（设置页「编辑目标」/ 移除某个目标用）。

        与 Agent 的 revise 走同一条路径：模板禁用、高危拦截、未解析澄清全部照常生效；
        只是把可写字段收窄成 ``targets``，设置页不该能顺手改动作或触发条件。
        """
        ids: list[str] = []
        for item in entity_ids or []:
            ident = text(item)
            if ident and ident not in ids:
                ids.append(ident)
        if not ids:
            return {"success": False, "message": "至少要保留一个目标设备。"}
        payload = self.revise_draft(draft_id, {"targets": ids})
        if payload.get("success") and payload.get("blocked"):
            # revise 为兼容 Agent 把 status 覆写成 rejected_high_risk；这里回读真实状态，
            # 让设置页能照常显示「已拦截」并提供原因。
            current = self.get_draft(draft_id)
            if current is not None:
                return {**current, "blocked": True, "reasons": payload.get("reasons") or []}
        return payload

    def split_draft(self, draft_id: str) -> dict[str, Any]:
        """把多目标草案拆成「每个目标一条」的单目标草案（原草案标记为 SUPERSEDED）。

        计划任务只承载单一实体，所以多目标草案注定不能一键落地。与其让用户自己去对话里
        重说一遍，不如按目标机械拆分：拆出来的每条都是普通 READY 草案，可以逐条确认。
        """
        with self._session_factory() as session:
            draft = session.get(AutomationDraft, draft_id)
            if draft is None:
                return {"ok": False, "message": "没有找到这份草案。"}
            reason = self._block_reason(session, draft)
            if reason:
                return {"ok": False, "message": reason}
            latest = self._latest_revision(session, draft)
            spec = json.loads(latest.spec_json) if latest is not None else {}
            context = {
                "raw_prompt": draft.raw_prompt,
                "session_key": draft.origin_session_key,
                "channel": draft.origin_channel,
                "principal_id": draft.origin_principal_id,
                "identity_strength": draft.identity_strength,
            }
        targets = [
            item for item in (spec.get("targets") or []) if isinstance(item, dict) and text(item.get("entityId"))
        ]
        if len(targets) < 2:
            return {"ok": False, "message": "这份草案只有一个目标，不需要拆分。"}

        created: list[dict[str, Any]] = []
        total = len(targets)
        for index, target in enumerate(targets, start=1):
            summary = text(spec.get("intentSummary"))
            piece = {
                **spec,
                "targets": [target],
                "intentSummary": sanitize_untrusted_text(
                    f"{summary}（{index}/{total}）"
                    if summary
                    else f"{text(target.get('name')) or '目标'}（{index}/{total}）",
                    INTENT_SUMMARY_MAX,
                ),
            }
            payload = self.create_draft(
                piece,
                raw_prompt=context["raw_prompt"],
                session_key=context["session_key"],
                channel=context["channel"],
                principal_id=context["principal_id"],
                identity_strength=context["identity_strength"],
            )
            if not payload.get("success"):
                return {
                    "ok": False,
                    "message": str(payload.get("message") or "拆分失败：新草案未能创建。"),
                    "created": created,
                }
            created.append(
                {
                    "draftId": payload.get("draftId"),
                    "status": payload.get("status"),
                    "target": text(target.get("name")) or text(target.get("entityId")),
                }
            )

        with self._session_factory() as session:
            original = session.get(AutomationDraft, draft_id)
            if original is not None and original.status == STATUS_READY:
                original.status = STATUS_SUPERSEDED
                session.commit()
        return {"ok": True, "supersededId": draft_id, "items": created}

    # ------------------------------------------------------------------ 冲突 / 发现
    def conflict_report(self, spec: dict[str, Any]) -> dict[str, Any]:
        """与现有 HA 自动化 / 本机计划任务 / 家规做冲突扫描。"""
        return scan_conflicts(
            spec=spec,
            entity_meta=self._entity_meta,
            scheduled=read_scheduled_rules(self._scheduler),
            policies=read_policy_rules(self._policy),
            ha_rules=self._ha_automations(),
        )

    def discover(self, sources: list[str] | None = None) -> dict[str, Any]:
        """列出已有自动化（HA ``automation.*`` + 本机计划任务 + 家规）。"""
        wanted = {item.lower() for item in sources} if sources else {"ha", "aura"}
        rules: list[dict[str, Any]] = []
        if "ha" in wanted:
            rules.extend(self._ha_automations())
        if "aura" in wanted:
            rules.extend(read_scheduled_rules(self._scheduler))
            rules.extend(read_policy_rules(self._policy))
        unavailable = None
        if "ha" in wanted and not self._has_state_store():
            unavailable = "状态库未就绪，HA 自动化无法读取"
        return {"success": True, "rules": rules, "unavailableReason": unavailable}

    # ------------------------------------------------------------------ 内部：澄清 / 预览
    def _normalize(self, spec: dict[str, Any], raw_prompt: str = "") -> dict[str, Any]:
        normalized = normalize_spec(
            spec,
            resolve_name=self._resolve_entity_id,
            entity_name=self._entity_name,
        )
        if not text(normalized.get("intentSummary")):
            normalized["intentSummary"] = sanitize_untrusted_text(raw_prompt, INTENT_SUMMARY_MAX)
        return normalized

    def _active_status(self, spec: dict[str, Any]) -> str:
        unresolved = any(not text(item.get("entityId")) for item in (spec.get("targets") or []))
        return STATUS_CLARIFYING if unresolved else STATUS_READY

    def _clarify(self, spec: dict[str, Any], utterance_kind: str) -> dict[str, Any] | None:
        if text(utterance_kind).upper() == "AMBIGUOUS":
            return {
                "success": False,
                "status": "needs_clarification",
                "clarification": True,
                "reason": "TEMPORAL_PERSISTENCE",
                "questions": ["这是一次性执行，还是要长期生效的规则？"],
            }
        targets = spec.get("targets") or []
        resolved = [item for item in targets if text(item.get("entityId"))]
        if not resolved:
            names = [text(item.get("name")) for item in targets if text(item.get("name"))]
            questions = ["要控制哪些设备？请说出房间或设备名。"]
            candidates = self._candidate_entities(names)
            if names:
                hint = f"相近的设备有：{'、'.join(candidates)}。" if candidates else "请确认设备名称。"
                questions = [f"没有找到「{'、'.join(names)}」对应的实体。{hint}"]
            return {
                "success": False,
                "status": "needs_clarification",
                "clarification": True,
                "reason": "AMBIGUOUS_TARGET",
                "questions": questions,
                "suggestions": candidates,
            }
        action = spec.get("action") or {}
        if not text(action.get("service")) or not spec.get("triggers"):
            return {
                "success": False,
                "status": "needs_clarification",
                "clarification": True,
                "reason": "MISSING_PARAM",
                "questions": ["触发条件（什么时候）和动作（做什么）分别是什么？"],
            }
        return None

    def _preview(self, spec: dict[str, Any], risky: list[str]) -> dict[str, Any]:
        targets = spec.get("targets") or []
        action = spec.get("action") or {}
        entities = [self._preview_target(item, action) for item in targets]
        triggers = spec.get("triggers") or []
        first_trigger = triggers[0] if triggers else {}
        trigger_text = "；".join(text(item.get("description")) or describe_trigger(item) for item in triggers)
        human_diff = [
            f"触发条件：{trigger_text or '未指定'}",
            f"目标设备：{'、'.join(item.get('name') or item.get('entityId') or '未解析' for item in entities) or '无'}",
            f"执行动作：{action.get('service') or '未指定'}",
            f"生效时区：{spec.get('timezone')}，模式：{spec.get('mode')}",
        ]
        if spec.get("conditions"):
            human_diff.append(f"前置条件：{len(spec['conditions'])} 条")
        if spec.get("forDuration"):
            human_diff.append(f"持续时长：{spec['forDuration']}")

        unresolved = [item for item in entities if not item.get("entityId")]
        runtime = [
            f"目标执行后端：{spec.get('targetBackend')}（时区 {spec.get('timezone')}）。",
            "草案不会写入 Home Assistant；确认生成计划任务后才会按计划执行。",
            "草案 30 分钟后自动失效；过期后需要重新生成。",
            "本机计划任务精度为 10 秒，离线期间不会补跑漏掉的触发。",
        ]
        if unresolved:
            runtime.append(f"有 {len(unresolved)} 个目标设备未能解析为实体 ID，落地前需要确认。")
        if risky:
            runtime.append("目标命中高危设备，草案已被拦截，不能进入待确认状态。")
        task_payload, landing_error = build_task_payload(spec)
        if task_payload is None and not risky and landing_error:
            runtime.append(f"落地限制：{landing_error}")

        return {
            "targetBackend": spec.get("targetBackend"),
            "intentSummary": spec.get("intentSummary"),
            "targetEntities": entities,
            "triggerAndConditionSpec": {
                **first_trigger,
                "triggers": triggers,
                "conditions": spec.get("conditions") or [],
                "forDuration": spec.get("forDuration") or "",
                "mode": spec.get("mode"),
                "timezone": spec.get("timezone"),
            },
            "configDiff": {"before": None, "after": spec, "humanDiff": human_diff},
            "runtimeAndRestartImpact": runtime,
            "conflictAndBlindspotReport": self.conflict_report(spec),
            "highRisk": risky,
            "unresolvedTargets": unresolved,
            "landing": {
                "available": task_payload is not None,
                "reason": landing_error if task_payload is None else "",
            },
            "phase": 1,
        }

    def _preview_target(self, target: dict[str, Any], action: dict[str, Any]) -> dict[str, Any]:
        entity_id = text(target.get("entityId"))
        meta = self._entity_meta(entity_id) if entity_id else {}
        name = text(target.get("name")) or text(meta.get("name")) or entity_id
        risk = is_high_risk({"targets": [{"entityId": entity_id, "name": name}], "action": action})
        return {
            "entityId": entity_id,
            "name": name,
            "area": text(meta.get("areaName")) or text(meta.get("areaId")),
            "risk": "HIGH" if risk else "LOW",
            "resolved": bool(entity_id) and bool(meta.get("resolved")),
        }

    # ------------------------------------------------------------------ 内部：载荷 / 会话
    def _payload(self, session: Any, draft: AutomationDraft, *, created: bool) -> dict[str, Any]:
        latest = self._latest_revision(session, draft)
        spec = json.loads(latest.spec_json) if latest else {}
        preview = json.loads(latest.preview_json) if latest else {}
        if spec:
            # 旧草案的 previewJson 里没有 landing（字段后加），每次读取时按当前规则补上，
            # 免得前端要把「能不能生成计划任务」再实现一遍。
            task_payload, landing_error = build_task_payload(spec)
            preview["landing"] = {
                "available": task_payload is not None,
                "reason": landing_error if task_payload is None else "",
            }
        return {
            "success": True,
            "created": created,
            "draftId": draft.id,
            "status": draft.status,
            "revSeq": draft.current_rev_seq,
            "createdAt": iso(draft.created_at),
            "expiresAt": iso(draft.expires_at),
            "appliedTaskId": draft.execution_id or None,
            "spec": spec,
            "preview": preview,
            "rawPrompt": draft.raw_prompt,
        }

    def _latest_revision(self, session: Any, draft: AutomationDraft) -> AutomationDraftRevision | None:
        return session.scalars(
            select(AutomationDraftRevision)
            .where(AutomationDraftRevision.draft_id == draft.id)
            .order_by(AutomationDraftRevision.rev_seq.desc())
            .limit(1)
        ).first()

    def _find_by_hash(self, session: Any, digest: str, session_key: str) -> AutomationDraft | None:
        rows = session.scalars(
            select(AutomationDraft).where(
                AutomationDraft.origin_session_key == (session_key or "default"),
                AutomationDraft.status.in_(ACTIVE_STATUSES),
                AutomationDraft.expires_at > naive_now(),
            )
        ).all()
        for row in rows:
            latest = self._latest_revision(session, row)
            if latest is not None and latest.spec_hash == digest:
                return row
        return None

    def _enforce_pending_limit(self, session: Any, session_key: str) -> None:
        rows = session.scalars(
            select(AutomationDraft)
            .where(
                AutomationDraft.origin_session_key == (session_key or "default"),
                AutomationDraft.status.in_(ACTIVE_STATUSES),
                AutomationDraft.expires_at > naive_now(),
            )
            .order_by(AutomationDraft.created_at.asc())
        ).all()
        excess = len(rows) - MAX_PENDING_DRAFTS_PER_SESSION + 1
        for row in rows[: max(0, excess)]:
            row.status = STATUS_SUPERSEDED
        if excess > 0:
            session.flush()

    def _expire_if_stale(self, session: Any, draft: AutomationDraft) -> bool:
        if draft.status in ACTIVE_STATUSES and draft.expires_at <= naive_now():
            draft.status = STATUS_EXPIRED
            session.commit()
            return True
        return False

    # ------------------------------------------------------------------ 内部：实体索引
    def _has_state_store(self) -> bool:
        return callable(getattr(self._state_store, "get_all", None))

    def _entity_rows(self) -> list[dict[str, Any]]:
        """当前状态快照（30 秒缓存；设备增删后最多半分钟即可被解析到）。"""
        if not self._has_state_store():
            return []
        cached = self._entity_cache
        now = time.monotonic()
        if cached is not None and cached[0] == id(self._state_store) and now - cached[1] < ENTITY_CACHE_SECONDS:
            return cached[2]
        try:
            rows = list(self._state_store.get_all() or [])
        except Exception as exc:  # fmt: skip
            logger.debug("读取实体索引失败: %s", exc)
            return []
        rows = [row for row in rows if isinstance(row, dict)]
        self._entity_cache = (id(self._state_store), now, rows)
        return rows

    def _entity_meta(self, entity_id: str) -> dict[str, Any]:
        ident = text(entity_id)
        if not ident:
            return {"resolved": False}
        getter = getattr(self._state_store, "get", None)
        entity: dict[str, Any] | None = None
        if callable(getter):
            try:
                found = getter(ident)
                entity = found if isinstance(found, dict) else None
            except Exception:  # fmt: skip
                entity = None
        if entity is None:
            entity = next((row for row in self._entity_rows() if text(row.get("entity_id")) == ident), None)
        if entity is None:
            return {"resolved": False}
        raw_attrs = entity.get("attributes")
        attrs: dict[str, Any] = raw_attrs if isinstance(raw_attrs, dict) else {}
        return {
            "resolved": True,
            "entityId": ident,
            "name": text(attrs.get("friendly_name")) or ident,
            "areaId": text(attrs.get("area_id")),
            "areaName": text(attrs.get("area_name")) or text(attrs.get("area_id")),
            "domain": ident.split(".", 1)[0],
        }

    def _entity_name(self, entity_id: str) -> str:
        return text(self._entity_meta(entity_id).get("name"))

    def _resolve_entity_id(self, name: str) -> str:
        """设备名 → 实体 ID：先精确匹配，再唯一包含匹配；有歧义时留空交给澄清。"""
        needle = text(name).lower()
        if not needle:
            return ""
        exact: list[str] = []
        contains: list[str] = []
        for row in self._entity_rows():
            entity_id = text(row.get("entity_id"))
            raw_attrs = row.get("attributes")
            attrs: dict[str, Any] = raw_attrs if isinstance(raw_attrs, dict) else {}
            friendly = text(attrs.get("friendly_name")).lower()
            candidates = {entity_id.lower(), friendly}
            if needle in candidates:
                exact.append(entity_id)
            elif any(needle in item for item in candidates if item):
                contains.append(entity_id)
        if len(exact) == 1:
            return exact[0]
        if not exact and len(contains) == 1:
            return contains[0]
        return ""

    def _candidate_entities(self, names: list[str]) -> list[str]:
        """澄清时给用户看的相近设备名（最多 5 个）。"""
        needles = [item.lower() for item in names if text(item)]
        out: list[str] = []
        for row in self._entity_rows():
            raw_attrs = row.get("attributes")
            attrs: dict[str, Any] = raw_attrs if isinstance(raw_attrs, dict) else {}
            friendly = text(attrs.get("friendly_name"))
            if not friendly:
                continue
            lowered = friendly.lower()
            if needles and not any(needle in lowered or lowered in needle for needle in needles):
                continue
            if friendly not in out:
                out.append(friendly)
            if len(out) >= MAX_CANDIDATES:
                break
        return out

    def _ha_automations(self) -> list[dict[str, Any]]:
        if not self._has_state_store():
            return []
        try:
            entities = self._state_store.get_all("automation") or []
        except Exception as exc:  # fmt: skip
            logger.debug("读取 HA 自动化失败: %s", exc)
            return []
        return read_ha_automations(list(entities))


__all__ = [
    "ACTIVE_STATUSES",
    "DRAFT_TTL",
    "MAX_PENDING_DRAFTS_PER_SESSION",
    "PRUNE_INTERVAL_SECONDS",
    "PRUNE_RETENTION_DAYS",
    "STATUS_APPLIED",
    "STATUS_BLOCKED",
    "STATUS_CLARIFYING",
    "STATUS_DISCARDED",
    "STATUS_EXPIRED",
    "STATUS_READY",
    "STATUS_SUPERSEDED",
    "AutomationDraftService",
    "action_verb",
    "is_high_risk",
    "sanitize_untrusted_text",
]
