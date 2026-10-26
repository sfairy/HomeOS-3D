"""家庭模式激活 / 停用编排与联动去重（对齐 home-mode/actions.internals.ts）。

关键流程：
  1. 已激活跳过；解析动作配置；
  2. 用户 / Agent 触发时校验动作实体 ACL；
  3. 联动仲裁（HomeModeLinkageArbiter）；
  4. HA 连接检查；
  5. 互斥组旧模式快照恢复 + 新模式设备快照采集；
  6. 事务内原子切换 isActive；
  7. 联动去重后串行执行动作，失败按配置重试；
  8. 全部失败则回滚快照并取消激活；否则记录日志与执行历史。
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any, TypedDict

from .presets import collect_home_mode_target_actions, resolve_action_kind
from ..home_exec.execute_action_sequence import execute_action_sequence
from ..home_exec.snapshot_restore import build_snapshot_restore_calls, describe_restore_support
from ..proxy.verification import describe_service_verification
from ..security.entity_execute_acl import assert_entity_targets_execute_authorized
from ...platform.core.entity_domain import get_entity_domain
from ...platform.core.errors import api_error, bad_request, not_found

logger = logging.getLogger("homeos.home_mode")

HA_ENTITY_FETCH_CONCURRENCY = 8

#: 服务调用响应里没有目标实体时（HA 对离线 / 跳过同样返回 200）回读状态的等待时间。
#: WS 状态回推通常 <100ms，留一点余量后仍读不到就按「未确认」处理，而不是伪造成功。
HA_VERIFY_RETRY_DELAY_SECONDS = 0.25

#: 快照里记录「采集失败实体」的保留键：恢复时据此如实报告「这些设备无法恢复」。
SNAPSHOT_MISSING_KEY = "_missing"

#: 激活失败阈值：失败动作占比达到这个比例就整体回滚（此前是「全部失败才回滚」，
#: 于是 1/9 成功也会显示为「已激活」，房子停在没人预期的状态）。
MODE_ACTIVATION_FAILURE_RATIO = 0.5


def _read_actions(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError):
            bad_request(api_error("HOME_MODE_CONFIG_PARSE_FAILED"))
        if isinstance(parsed, list):
            return parsed
    bad_request(api_error("HOME_MODE_CONFIG_PARSE_FAILED"))
    return []


def _read_snapshot(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw:
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except (TypeError, ValueError):
            return {}
    return {}


def filter_home_mode_actions_for_linkage_dedupe(
    entity_configs: list[dict[str, Any]],
    meta: dict[str, Any] | None,
    sec_cfg: dict[str, Any],
) -> list[dict[str, Any]]:
    """联动去重：过滤与安防 / presence / 天气 / 能源链路重复的动作。"""
    source = (meta or {}).get("source")
    reason = str((meta or {}).get("reason") or "")
    if source == "security":
        return [c for c in entity_configs if resolve_action_kind(c) != "security"]
    if source == "trigger" and reason == "all_leave" and (
        sec_cfg.get("autoArmOnEveryoneLeft") or sec_cfg.get("autoUpgradeToAwayOnEveryoneLeft")
    ):
        return [
            c
            for c in entity_configs
            if resolve_action_kind(c) != "security"
            or str(c.get("entity_id") or "").strip() != "armed_away"
        ]
    if source == "trigger" and reason.startswith("arrive_home") and sec_cfg.get(
        "autoDisarmOnFirstHome"
    ):
        return [
            c
            for c in entity_configs
            if resolve_action_kind(c) != "security"
            or str(c.get("entity_id") or "").strip() != "armed_home"
        ]
    if source in ("weather_linkage", "energy_linkage"):
        return [c for c in entity_configs if resolve_action_kind(c) != "security"]
    return entity_configs


async def _verify_action_outcome(
    deps: Any,
    domain: str,
    service: str,
    entity_id: str,
    service_data: dict[str, Any],
    response: Any,
) -> dict[str, Any]:
    """判决一次服务调用是否真的落到设备上（三态：True / False / None）。

    HA 对「实体离线 / 被跳过」同样返回 200：只看「没抛异常」会把离线设备记成成功。
    先按响应体校验；响应里没有目标实体时回读一次状态再判定（WS 回推通常 <100ms）。
    """
    verification = describe_service_verification(domain, service, entity_id, service_data, response)
    if verification["verified"] is not None or not verification.get("supported"):
        return verification
    await asyncio.sleep(HA_VERIFY_RETRY_DELAY_SECONDS)
    state = await deps.fetch_entity_state(entity_id)
    if not state:
        # 连状态都读不到：不能断定成功，也不能断定失败，如实标「未确认」。
        return verification
    return describe_service_verification(
        domain,
        service,
        entity_id,
        service_data,
        [
            {
                "entity_id": entity_id,
                "state": state.get("state"),
                "attributes": state.get("attributes") or {},
            }
        ],
    )


def count_verified(results: list[dict[str, Any]], expected: bool | None) -> int:
    """统计「成功且校验结论为 expected」的条数。

    没有 ``verified`` 键的动作（notify / security）不参与三态统计，否则它们会被
    永远算进「未确认」，让「未确认数」失去意义。
    """
    count = 0
    for result in results:
        if not result.get("success") or "verified" not in result:
            continue
        if result.get("verified") is expected:
            count += 1
    return count


async def _execute_home_mode_action(
    deps: Any, action: dict[str, Any]
) -> dict[str, Any]:
    kind = resolve_action_kind(action)
    ref = str(action.get("entity_id") or "").strip()
    if not ref:
        return {"entity_id": "unknown", "service": "unknown", "success": False, "error": "缺少目标"}

    try:
        if kind == "notify":
            message = str(
                (action.get("service_data") or {}).get("message") or action.get("entity_id") or "家庭模式已切换"
            )
            await deps.notify("info", message, "home-mode")
            return {"entity_id": "notify:app", "service": "notify.send_message", "success": True}

        if kind == "security":
            ok = await deps.set_security_mode(ref, "home-mode")
            return {
                "entity_id": f"security:{ref}",
                "service": "security.set_mode",
                "success": bool(ok),
                "error": None if ok else "安防模式切换失败（需安防模块授权）",
            }

        domain = action.get("domain") or action.get("entity_id", "").split(".")[0]
        service = action.get("service") or "turn_on"
        service_data = action.get("service_data") or {}
        response = await deps.call_service(domain, service, ref, service_data)
        verification = await _verify_action_outcome(
            deps, domain, service, ref, service_data, response
        )
        result: dict[str, Any] = {
            "entity_id": ref,
            "service": f"{domain}.{service}",
            # 只有「确认不一致」的设备才算失败；「未确认」保持 success=True 并单独计数，
            # 否则 transition / 状态回推延迟会把正常动作误判成失败并触发整组回滚。
            "success": verification["verified"] is not False,
            "verified": verification["verified"],
        }
        if verification["verified"] is False:
            result["error"] = f"设备状态未按预期变化（{verification.get('reason') or 'unknown'}）"
        elif verification["verified"] is None and verification.get("supported"):
            result["unverified"] = True
        return result
    except Exception as exc:
        return {
            "entity_id": ref,
            "service": f"{action.get('domain') or '?'}.{action.get('service') or '?'}",
            "success": False,
            "error": str(exc),
        }


async def _restore_entity_from_snapshot(
    deps: Any, entity_id: str, snapshot: dict[str, Any]
) -> None:
    calls = build_snapshot_restore_calls(entity_id, snapshot)

    semaphore = asyncio.Semaphore(HA_ENTITY_FETCH_CONCURRENCY)

    async def _run(call: dict[str, Any]) -> None:
        async with semaphore:
            await deps.call_service(call["domain"], call["service"], call["entityId"], call["data"])

    await asyncio.gather(*(_run(call) for call in calls))


def _snapshot_state_matches(current: dict[str, Any] | None, snap: dict[str, Any]) -> bool:
    if not current or current.get("state") != snap.get("state"):
        return False
    return json.dumps(current.get("attributes"), sort_keys=True, default=str) == json.dumps(
        snap.get("attributes"), sort_keys=True, default=str
    )


async def _restore_entity_from_snapshot_if_not_changed(
    deps: Any, entity_id: str, snap: dict[str, Any]
) -> str:
    """把实体恢复到快照状态；返回 ``unchanged``（已一致）/ ``restored``（已回写）。"""
    try:
        current = await deps.fetch_entity_state(entity_id)
    except Exception:
        # 读不到当前状态时按「与快照不一致」处理，会照常回写一次 —— 但这样一来
        # 「恢复条数」里就混进了「其实没查成功」的条目，必须有日志可对账。
        logger.warning(
            '恢复快照前读取实体当前状态失败，按需要回写处理: %s', entity_id, exc_info=True
        )
        current = None
    if _snapshot_state_matches(current, snap):
        return "unchanged"
    await _restore_entity_from_snapshot(deps, entity_id, snap)
    return "restored"


async def _restore_mode_snapshot(deps: Any, mode: dict[str, Any]) -> HomeModeSnapshotOutcome:
    """把设备恢复到模式快照记录的状态，如实统计 recovered/skipped。

    ``restored + unchanged == attempted``；``skippedDomains`` 记录恢复表覆盖不到的域
    （scene / script / button 等），调用方据此判断「已恢复 N 个设备」是否名副其实。
    ``failedEntities`` / ``missingEntities`` 指名道姓列出没恢复成功的设备：
    只给一个 ``failed`` 计数时，用户无法知道该去检查哪台设备。
    """
    outcome: HomeModeSnapshotOutcome = {
        "restored": 0,
        "unchanged": 0,
        "failed": 0,
        "incomplete": False,
        "attempted": 0,
        "skippedDomains": [],
        "failedEntities": [],
        "missingEntities": [],
    }
    # 拷贝一份：``_read_snapshot`` 对 dict 直接返回原对象，pop 保留键会污染调用方的快照。
    snapshot = dict(_read_snapshot(mode.get("deviceSnapshot")))
    missing = snapshot.pop(SNAPSHOT_MISSING_KEY, [])
    outcome["missingEntities"] = (
        [str(entity_id) for entity_id in missing if isinstance(entity_id, str) and entity_id]
        if isinstance(missing, list)
        else []
    )
    if not snapshot:
        return outcome
    try:
        status = await deps.get_ha_status()
        if not status.get("connected"):
            outcome["incomplete"] = True
            return outcome
        entries = list(snapshot.items())
        if not entries:
            return outcome

        skipped_domains: set[str] = set()
        restorable: list[tuple[str, dict[str, Any]]] = []
        for entity_id, snap in entries:
            snap_row = snap if isinstance(snap, dict) else {}
            if describe_restore_support(entity_id, snap_row) == "skipped":
                skipped_domains.add(get_entity_domain(entity_id))
                continue
            restorable.append((entity_id, snap_row))
        outcome["skippedDomains"] = sorted(skipped_domains)
        outcome["attempted"] = len(restorable)
        if not restorable:
            return outcome

        semaphore = asyncio.Semaphore(HA_ENTITY_FETCH_CONCURRENCY)
        results: list[str] = []
        failed_entities: list[str] = []

        async def _run(entity_id: str, snap: dict[str, Any]) -> None:
            async with semaphore:
                try:
                    results.append(
                        await _restore_entity_from_snapshot_if_not_changed(deps, entity_id, snap)
                    )
                except Exception as exc:
                    # 恢复失败必须与「本就一致」区分开，否则会误判回滚完整而丢弃快照。
                    deps.warn(f"恢复设备 {entity_id} 到快照失败: {exc}")
                    results.append("failed")
                    failed_entities.append(entity_id)

        await asyncio.gather(*(_run(entity_id, snap) for entity_id, snap in restorable))
        outcome["restored"] = sum(1 for result in results if result == "restored")
        outcome["unchanged"] = sum(1 for result in results if result == "unchanged")
        outcome["failed"] = sum(1 for result in results if result == "failed")
        outcome["failedEntities"] = failed_entities
        outcome["incomplete"] = outcome["failed"] > 0
    except Exception as exc:
        outcome["incomplete"] = True
        deps.warn(f"解析设备快照失败: {exc}")
    return outcome


async def _fetch_entity_state(deps: Any, entity_id: str) -> dict[str, Any] | None:
    try:
        return await deps.fetch_entity_state(entity_id)
    except Exception:
        logger.debug('读取实体状态失败: %s', entity_id, exc_info=True)
        return None


class HomeModeActivateState:
    def __init__(self, getter, setter) -> None:
        self._get = getter
        self._set = setter

    def get_active_mode_id(self) -> str | None:
        return self._get()

    def set_active_mode_id(self, mode_id: str | None) -> None:
        self._set(mode_id)


_MISSING_FAILED_ITEMS: Any = object()


@dataclass(frozen=True)
class _ModeTriggerContext:
    """触发上下文：模式 id / 名称 / 来源 / 原始 reason，供日志与执行历史复用。"""

    mode_id: str
    mode_name: str
    source: str
    raw_reason: Any


@dataclass(frozen=True)
class _ExecutionOutcome:
    """执行历史里要记录的条数：总数、成功数与失败明细（缺省表示不写该键）。"""

    total: int
    executed: int
    failed_items: Any = _MISSING_FAILED_ITEMS


@dataclass
class _ActionRunState:
    """动作执行状态：待执行配置、逐条结果与当前失败下标（重试会原地改写）。"""

    configs: list[dict[str, Any]]
    results: list[dict[str, Any]]
    failed_indices: list[int]


@dataclass
class _ActivationContext:
    """激活过程的共享上下文：模式、触发方、回滚快照与执行 / 重试结果。"""

    mode: dict[str, Any]
    trigger: _ModeTriggerContext
    snapshot: dict[str, Any]
    results: list[dict[str, Any]]
    retry_results: list[dict[str, Any]]
    #: 激活时没采集到快照的实体（无法在失败 / 停用时恢复）。
    snapshot_missing: list[str] = field(default_factory=list)
    #: 执行本次激活的 security 动作之前的安防模式；中止时用它回滚。
    previous_security_mode: str | None = None
    #: 本次实际执行过的 security 动作条数（0 表示无需回滚）。
    security_action_count: int = 0
    #: 被本次激活顶掉的同组旧模式（DB 里尚未停用，只有提交成功后才停用）。
    displaced_modes: list[dict[str, Any]] = field(default_factory=list)
    #: 旧模式设备快照的恢复结果（中止时要用它判断能否回放旧模式）。
    conflict_restore: dict[str, HomeModeSnapshotOutcome] = field(default_factory=dict)


def _trigger_log_payload(
    trigger: _ModeTriggerContext, event_reason: Any, success: bool
) -> dict[str, Any]:
    """构造 push_trigger_log 的触发日志负载。"""
    return {
        "modeId": trigger.mode_id,
        "modeName": trigger.mode_name,
        "source": trigger.source,
        "reason": event_reason,
        "success": success,
    }


def _home_mode_execution_record(
    trigger: _ModeTriggerContext, event_reason: Any, success: bool, outcome: _ExecutionOutcome
) -> dict[str, Any]:
    """构造 record_execution 的执行历史负载；未给 failed_items 时不写该键。"""
    record: dict[str, Any] = {
        "modeId": trigger.mode_id,
        "modeName": trigger.mode_name,
        "success": success,
        "source": trigger.source,
        "reason": event_reason,
        "executed": outcome.executed,
        "total": outcome.total,
    }
    if outcome.failed_items is not _MISSING_FAILED_ITEMS:
        record["failedItems"] = outcome.failed_items
    return record


class HomeModeActivateResult(TypedDict, total=False):
    """家庭模式激活/幂等结果。"""

    success: bool
    modeId: str
    modeName: str
    active: bool
    alreadyActive: bool
    executed: int
    total: int
    retried: int
    results: list[Any]
    failedItems: list[Any]
    appliedCount: int
    failedCount: int
    verifiedCount: int
    unverifiedCount: int
    snapshotIncomplete: bool
    snapshotMissing: list[str]
    failedRestoreEntities: list[str]
    message: str
    error: str


class HomeModeDeactivateResult(TypedDict, total=False):
    """家庭模式停用结果。"""

    success: bool
    modeId: str
    modeName: str
    active: bool
    restored: int
    unchanged: int
    failed: int
    incomplete: bool
    restoreIncomplete: bool
    skippedDomains: list[str]
    failedEntities: list[str]
    missingEntities: list[str]
    exclusiveGroup: str
    message: str


class HomeModeSnapshotOutcome(TypedDict):
    """快照恢复计数。

    所有键总是同时写入（见 :func:`_restore_mode_snapshot`），故声明为必选：
    调用方 ``outcome["restored"]`` 才不会被判成「可能缺失的键」。

    - ``attempted``：真正尝试恢复的实体数（restored + unchanged + failed）
    - ``skippedDomains``：恢复表覆盖不到的域（scene / script / button …），
      它们不会进入 ``restored``，避免「已恢复 N 个设备」虚高。
    - ``failedEntities``：恢复失败的实体 id（用于前端点名提示）。
    - ``missingEntities``：激活时就没采集到快照的实体 id —— 它们无法恢复。
    """

    restored: int
    unchanged: int
    failed: int
    incomplete: bool
    attempted: int
    skippedDomains: list[str]
    failedEntities: list[str]
    missingEntities: list[str]


def _already_active_home_mode_result(mode: dict[str, Any], mode_id: str) -> HomeModeActivateResult:
    """重复激活时直接返回的幂等结果。"""
    return {
        "success": True,
        "modeId": mode_id,
        "modeName": mode["name"],
        "active": True,
        "alreadyActive": True,
        "executed": 0,
        "total": 0,
        "retried": 0,
        "results": [],
    }


async def _collect_device_snapshot(
    deps: Any, entity_configs: list[dict[str, Any]]
) -> tuple[dict[str, Any], list[str]]:
    """并发采集动作目标实体的当前状态，作为回滚快照。

    返回 ``(snapshot, missing)``：``missing`` 是没采集到状态的实体 —— 它们一旦被本次激活
    改过就再也恢复不回去，必须如实上报，不能悄悄从快照里消失。
    """
    snapshot: dict[str, Any] = {}
    missing: list[str] = []
    try:
        entity_ids = [
            entity_id
            for entity_id in (config_item.get("entity_id") for config_item in entity_configs)
            if isinstance(entity_id, str) and entity_id
        ]
        semaphore = asyncio.Semaphore(HA_ENTITY_FETCH_CONCURRENCY)
        fetched: list[tuple[str, dict[str, Any]] | None] = []

        async def _fetch(entity_id: str) -> None:
            async with semaphore:
                state_row = await _fetch_entity_state(deps, entity_id)
                fetched.append((entity_id, state_row) if state_row else None)
                if not state_row:
                    missing.append(entity_id)

        await asyncio.gather(*(_fetch(entity_id) for entity_id in entity_ids))
        for row in fetched:
            if row:
                snapshot[row[0]] = row[1]
    except Exception as exc:
        deps.warn(f"采集设备快照失败: {exc}")
    return snapshot, sorted(set(missing))


async def _retry_failed_home_mode_actions(
    deps: Any, mode_name: str, run: _ActionRunState
) -> list[dict[str, Any]]:
    """按配置次数串行重试失败动作（原地更新 run.results），返回重试成功的条目。"""
    retry_results: list[dict[str, Any]] = []
    if not run.failed_indices:
        return retry_results

    deps.warn(f"模式 {mode_name} 有 {len(run.failed_indices)} 个设备执行失败,开始重试...")
    apply_max_retries = int(deps.get_apply_max_retries() or 0)
    attempt = 0
    while attempt < apply_max_retries and run.failed_indices:
        deps.log(f"重试第 {attempt + 1}/{apply_max_retries} 次,共 {len(run.failed_indices)} 个设备")
        await asyncio.sleep(1)
        retry_batch = await asyncio.gather(
            *(_execute_home_mode_action(deps, run.configs[idx]) for idx in run.failed_indices)
        )
        still_failed: list[int] = []
        for position, original_idx in enumerate(run.failed_indices):
            result = retry_batch[position]
            run.results[original_idx] = result
            if result.get("success"):
                retry_results.append(result)
            else:
                still_failed.append(original_idx)
        run.failed_indices = still_failed
        attempt += 1
    return retry_results


async def _reject_home_mode_without_ha(
    deps: Any, mode: dict[str, Any], trigger: _ModeTriggerContext, total_actions: int
) -> HomeModeActivateResult:
    """HA 未连接时释放仲裁、记录日志并返回拒绝结果。"""
    deps.linkage_arbiter.release()
    deps.warn("Home Assistant 未连接,拒绝激活家庭模式")
    deps.push_trigger_log(
        _trigger_log_payload(trigger, trigger.raw_reason or "手动切换", False)
    )
    deps.record_execution(
        _home_mode_execution_record(
            trigger,
            trigger.raw_reason or "HA 未连接",
            False,
            _ExecutionOutcome(total=total_actions, executed=0),
        )
    )
    return {
        "success": False,
        "modeId": trigger.mode_id,
        "modeName": mode["name"],
        "active": False,
        "error": "HA 未连接，无法激活家庭模式",
    }


async def _reassert_displaced_modes(
    deps: Any, activation: _ActivationContext
) -> list[str]:
    """激活中止后，把被顶掉的旧模式重新落到设备上。

    两阶段提交里旧模式**从未在 DB 里被停用**（is_active 保持不变、device_snapshot 未清），
    但它们的设备快照已在执行新动作前被恢复过一次；新模式的半执行动作会覆盖其中一部分，
    所以这里按旧快照再回放一遍，让「仍然 active 的旧模式」名实相符。

    返回回放不完整的模式名列表（调用方负责告警，不能静默）。
    """
    incomplete_modes: list[str] = []
    for displaced in activation.displaced_modes:
        if not _read_snapshot(displaced.get("deviceSnapshot")):
            continue
        outcome = await _restore_mode_snapshot(deps, displaced)
        if outcome["incomplete"]:
            incomplete_modes.append(str(displaced.get("name") or displaced.get("id") or "?"))
    return incomplete_modes


async def _abort_failed_activation(
    deps: Any, state: HomeModeActivateState, activation: _ActivationContext
) -> HomeModeActivateResult:
    """动作失败超过阈值：回滚快照、撤销激活、回放被顶掉的旧模式并记录失败历史。"""
    mode = activation.mode
    trigger = activation.trigger
    snapshot = activation.snapshot
    results = activation.results
    applied_count = sum(1 for result in results if result.get("success"))
    deps.warn(
        f"模式 {mode['name']} 失败动作超过阈值({MODE_ACTIVATION_FAILURE_RATIO:.0%}),"
        f"回滚快照并取消激活({applied_count}/{len(results)} 成功)"
    )
    rollback = await _restore_mode_snapshot(deps, {"deviceSnapshot": snapshot})
    # 回滚不完整（HA 断连 / 部分实体恢复失败）时必须保留快照：
    # 否则用户失去唯一的手动恢复依据，设备将停留在半执行状态。
    rollback_incomplete = bool(rollback.get("incomplete"))
    # 新模式还没提交 is_active（见 activate_home_mode 的两阶段顺序），这里只清掉
    # 上一次激活可能残留的快照列，避免下次激活拿旧快照回滚。
    await deps.deactivate_in_db(trigger.mode_id, keep_snapshot=rollback_incomplete)
    if rollback_incomplete:
        await deps.notify(
            "warning",
            f"模式 {mode['name']} 激活失败且状态回滚不完整，已保留设备快照，请检查 HA 连接后手动恢复",
            "home-mode",
        )

    displaced_incomplete = await _reassert_displaced_modes(deps, activation)
    if displaced_incomplete:
        await deps.notify(
            "warning",
            f"模式 {mode['name']} 激活失败后，{'、'.join(displaced_incomplete)} 的设备状态未能完整回放，"
            "请检查 HA 连接",
            "home-mode",
        )

    # 安防动作也在快照之外：它改的是面板状态机，不会随设备快照回滚。
    # 不回滚就会出现「家庭模式激活失败、灯已还原，但房子已经撤防」。
    if activation.security_action_count and activation.previous_security_mode:
        try:
            restored_security = await deps.set_security_mode(
                activation.previous_security_mode, "home-mode-rollback"
            )
        except Exception as exc:
            restored_security = False
            deps.warn(f"回滚安防模式失败: {exc}")
        if not restored_security:
            await deps.notify(
                "warning",
                f"模式 {mode['name']} 激活失败，但安防模式未能回滚到 "
                f"{activation.previous_security_mode}，请手动检查安防面板",
                "home-mode",
            )

    if state.get_active_mode_id() == trigger.mode_id:
        state.set_active_mode_id(None)
    deps.linkage_arbiter.release()

    failed_items = [
        {"entity_id": r["entity_id"], "service": r["service"], "error": r.get("error")}
        for r in results
        if not r.get("success")
    ]
    event_reason = trigger.raw_reason or "手动切换"
    deps.push_trigger_log(_trigger_log_payload(trigger, event_reason, False))
    deps.record_execution(
        _home_mode_execution_record(
            trigger,
            event_reason,
            False,
            _ExecutionOutcome(
                total=len(results), executed=applied_count, failed_items=failed_items
            ),
        )
    )
    return {
        "success": False,
        "modeName": mode["name"],
        "executed": applied_count,
        "appliedCount": applied_count,
        "failedCount": len(failed_items),
        "failedItems": failed_items,
        "modeId": trigger.mode_id,
        "active": False,
        "total": len(results),
        "retried": len(activation.retry_results),
        "results": results,
        "verifiedCount": count_verified(results, True),
        "unverifiedCount": count_verified(results, None),
        "snapshotIncomplete": bool(activation.snapshot_missing),
        "snapshotMissing": list(activation.snapshot_missing),
        "failedRestoreEntities": rollback.get("failedEntities", []),
        "error": "关键设备动作失败，已恢复快照并取消激活",
    }


async def _finalize_home_mode_activation(
    deps: Any, activation: _ActivationContext, final_success: int
) -> HomeModeActivateResult:
    """记录激活成功事件 / 触发日志 / 执行历史，并返回激活结果。"""
    mode = activation.mode
    trigger = activation.trigger
    results = activation.results
    retry_results = activation.retry_results
    executed = count_verified(results, True)
    unverified = count_verified(results, None)
    snapshot_missing = list(activation.snapshot_missing)
    await deps.emit_home_mode_event(
        "homeMode.activated",
        {
            "modeId": trigger.mode_id,
            "modeName": mode["name"],
            "results": results,
            "successCount": final_success,
            "totalCount": len(results),
            "verifiedCount": executed,
            "unverifiedCount": unverified,
            "snapshotIncomplete": bool(snapshot_missing),
            "retried": len(retry_results) > 0,
        },
    )

    deps.log(f"模式 {mode['name']} 激活完成: {final_success}/{len(results)} 成功")
    if unverified:
        deps.warn(f"模式 {mode['name']} 有 {unverified} 个设备已下发但状态未确认")
    if snapshot_missing:
        await deps.notify(
            "warning",
            f"模式 {mode['name']} 有 {len(snapshot_missing)} 个设备未采集到快照，停用后无法恢复这些设备",
            "home-mode",
        )
    if retry_results:
        deps.log(f"  其中 {len(retry_results)} 个设备通过重试恢复")

    all_ok = all(r.get("success") for r in results)
    failed_items = [
        {"entity_id": r["entity_id"], "service": r["service"], "error": r.get("error")}
        for r in results
        if not r.get("success")
    ]
    event_reason = trigger.raw_reason or "手动切换"
    deps.push_trigger_log(_trigger_log_payload(trigger, event_reason, all_ok))
    deps.record_execution(
        _home_mode_execution_record(
            trigger,
            event_reason,
            all_ok,
            _ExecutionOutcome(
                total=len(results), executed=final_success, failed_items=failed_items or None
            ),
        )
    )

    return {
        "success": all_ok,
        "modeName": mode["name"],
        "executed": final_success,
        "appliedCount": final_success,
        "failedCount": len(failed_items),
        "failedItems": failed_items,
        "modeId": trigger.mode_id,
        "active": True,
        "total": len(results),
        "retried": len(retry_results),
        "results": results,
        "verifiedCount": executed,
        "unverifiedCount": unverified,
        "snapshotIncomplete": bool(snapshot_missing),
        "snapshotMissing": snapshot_missing,
    }


async def activate_home_mode(
    state: HomeModeActivateState, deps: Any, mode_id: str, meta: dict[str, Any] | None = None
) -> HomeModeActivateResult:
    """激活家庭模式。四阶段顺序本身就是行为契约，不可重排：

    ① **准入** —— 模式存在 → 未被激活 → 目标实体执行授权 → 联动仲裁 → HA 在线。
       任一步失败都要先 push 一条失败触发日志再抛错，前端靠它解释「为什么没生效」。
    ② **预快照** —— 先把同互斥组里已激活模式的设备恢复到「进入旧模式之前」，再采集
       本轮目标设备快照。旧模式此时**不**在 DB 停用、快照也不清，那是第 ④ 阶段的事。
    ③ **执行** —— 安防动作串行且先行（并发会让最终模式取决于最后一次 set_mode，且整体
       回滚后会停在「模式已切、设备已回滚」的错位态）；其余设备动作走
       `execute_action_sequence` 的开环序列，失败项再重试一次（安防不参与重试）。
    ④ **提交** —— 失败数达阈值就整体回滚并回放旧模式；否则才落库切换激活组。

    Args:
        state: 进程内「当前激活模式 id」指针（多互斥组同时激活时只指向其中之一）。
        deps: 领域依赖注入对象（DB、HA、联动仲裁器、日志、通知）。
        mode_id: 目标模式 id。
        meta: 触发元信息（`source` / `reason` / `actor`），用于触发日志与授权校验。
    """
    # ① 准入
    mode = await deps.find_mode(mode_id)
    if mode is None:
        not_found(api_error("HOME_MODE_NOT_FOUND"))

    if mode.get("isActive"):
        deps.log(f"模式 {mode['name']} 已处于激活状态,跳过重复激活")
        return _already_active_home_mode_result(mode, mode_id)

    entity_configs = _read_actions(mode.get("config"))

    assert_entity_targets_execute_authorized(
        collect_home_mode_target_actions(entity_configs),
        (meta or {}).get("actor"),
    )

    trigger = _ModeTriggerContext(
        mode_id=mode_id,
        mode_name=mode["name"],
        source=(meta or {}).get("source") or "manual",
        raw_reason=(meta or {}).get("reason"),
    )

    hm_cfg = deps.get_home_mode_config()
    arbiter = deps.linkage_arbiter.try_acquire(
        (meta or {}).get("source"),
        claim_ttl_ms=max(1, int(hm_cfg.get("linkageClaimTtlMin") or 15)) * 60_000,
        manual_lock_ms=max(0, int(hm_cfg.get("manualLockTtlMin") or 30)) * 60_000,
    )
    if not arbiter.get("ok"):
        deps.warn(f"家庭模式激活被联动仲裁拦截: {arbiter.get('reason')}")
        deps.push_trigger_log(
            _trigger_log_payload(trigger, trigger.raw_reason or arbiter.get("reason"), False)
        )
        bad_request(api_error("HOME_MODE_LINKAGE_BLOCKED", arbiter.get("reason")))

    ha_status = await deps.get_ha_status()
    if not ha_status.get("connected"):
        return await _reject_home_mode_without_ha(deps, mode, trigger, len(entity_configs))

    incoming_group = mode.get("exclusiveGroup") or "default"
    active_modes = await deps.list_active_modes()
    conflicting_modes = [
        active
        for active in active_modes
        if active["id"] != mode_id and (active.get("exclusiveGroup") or "default") == incoming_group
    ]
    # ② 预快照：恢复同组旧模式的设备，再采集本轮目标快照
    # 先把旧模式的设备恢复到「进入该模式之前」的状态，让新动作从干净状态开始。
    # 但**不**在 DB 里停用旧模式、也不清它们的快照 —— 那是 ④ 提交才做的事。
    conflict_restore: dict[str, HomeModeSnapshotOutcome] = {}
    for active in conflicting_modes:
        conflict_restore[active["id"]] = await _restore_mode_snapshot(deps, active)

    snapshot, snapshot_missing = await _collect_device_snapshot(deps, entity_configs)
    if snapshot_missing:
        # 采集不到 = 这些设备一旦被本次激活改过就恢复不回去，必须留痕并带给前端。
        deps.warn(
            f"模式 {mode['name']} 有 {len(snapshot_missing)} 个设备未采集到快照，"
            f"停用后将无法恢复: {', '.join(snapshot_missing[:5])}"
        )
        snapshot[SNAPSHOT_MISSING_KEY] = snapshot_missing

    # ③ 执行：安防先行且串行，其余设备走开环序列 + 一次失败重试
    deps.log(f"正在激活模式: {mode['name']}")

    sec_cfg = deps.get_security_config()
    configs_to_run = filter_home_mode_actions_for_linkage_dedupe(entity_configs, meta, sec_cfg)

    # 安防切换必须串行且先行：并发/夹在设备动作里时，最终模式取决于最后一次 set_mode，
    # 而且一旦后续设备动作触发整体回滚，房子会停在「模式已切、设备已回滚」的错位状态。
    security_configs = [c for c in configs_to_run if resolve_action_kind(c) == "security"]
    device_configs = [c for c in configs_to_run if resolve_action_kind(c) != "security"]
    previous_security_mode = (
        await deps.get_security_mode() if security_configs else None
    )
    security_results: list[dict[str, Any]] = []
    for config in security_configs:
        security_results.append(await _execute_home_mode_action(deps, config))

    device_results = await execute_action_sequence(
        device_configs,
        lambda config: _execute_home_mode_action(deps, config),
        "milliseconds",
    )
    results = [*security_results, *device_results]
    ordered_configs = [*security_configs, *device_configs]

    failed_indices = [idx for idx, result in enumerate(results) if not result.get("success")]
    run = _ActionRunState(
        configs=ordered_configs, results=results, failed_indices=failed_indices
    )
    # 安防动作不进入并发重试：多条 security 动作并发重试会让最终模式无法预测。
    run.failed_indices = [
        idx
        for idx in run.failed_indices
        if resolve_action_kind(ordered_configs[idx]) != "security"
    ]
    retry_results = await _retry_failed_home_mode_actions(deps, mode["name"], run)

    final_success = sum(1 for result in results if result.get("success"))

    activation = _ActivationContext(
        mode=mode,
        trigger=trigger,
        snapshot=snapshot,
        results=results,
        retry_results=retry_results,
        previous_security_mode=previous_security_mode,
        security_action_count=len(security_configs),
        displaced_modes=list(conflicting_modes),
        conflict_restore=conflict_restore,
        snapshot_missing=snapshot_missing,
    )

    failed_count = len(results) - final_success
    failed_ratio = (failed_count / len(results)) if results else 0.0
    if results and (final_success == 0 or failed_ratio >= MODE_ACTIVATION_FAILURE_RATIO):
        return await _abort_failed_activation(deps, state, activation)

    # ④ 提交：动作达到阈值才算「激活」。提交失败同样要回滚设备并回放旧模式。
    try:
        await deps.switch_active_group(conflicting_modes, conflict_restore, mode_id, snapshot)
    except Exception as exc:
        deps.warn(f"模式 {mode['name']} 切换提交失败,回滚设备: {exc}")
        return await _abort_failed_activation(deps, state, activation)

    state.set_active_mode_id(mode_id)
    return await _finalize_home_mode_activation(deps, activation, final_success)


async def deactivate_home_mode(
    state: HomeModeActivateState, deps: Any, mode_id: str | None = None
) -> HomeModeDeactivateResult:
    """停用家庭模式（或指定的某一个互斥组）。

    顺序：解析目标（缺省用内存指针，为空时退化为「优先级最高的激活模式」，因为多互斥组
    同时激活时指针只记得一个）→ 回放快照恢复设备 → 清组内激活标记 → 重算内存指针，
    无任何激活模式时释放联动仲裁。

    「恢复不完整」是唯一允许的中间态：服务端保持模式激活、保留快照，返回
    `restoreIncomplete=True` 与失败明细，前端据此给出重试入口 —— 不能假装已经退出。

    Args:
        state: 进程内「当前激活模式 id」指针。
        deps: 领域依赖注入对象。
        mode_id: 目标模式 id；`None` 表示停用当前指针指向的模式。
    """
    target_id = mode_id or state.get_active_mode_id()
    if not target_id:
        # 多互斥组场景下内存指针可能只指向其中一个；为空时退化为「优先级最高的激活模式」。
        first_active = await deps.find_first_active()
        target_id = first_active["id"] if first_active else None
    if not target_id:
        return {"success": True, "message": "无激活模式"}

    mode = await deps.find_mode(target_id)
    if mode is None:
        if state.get_active_mode_id() == target_id:
            state.set_active_mode_id(None)
        return {"success": True, "message": "无激活模式"}
    if not mode.get("isActive") and state.get_active_mode_id() != target_id:
        return {"success": True, "message": "模式未激活"}

    prev_mode_id = target_id
    group = mode.get("exclusiveGroup") or "default"
    restore_outcome = await _restore_mode_snapshot(deps, mode)
    restored = restore_outcome["restored"]
    attempted = restore_outcome["attempted"]
    failed = restore_outcome["failed"]
    skipped_domains = restore_outcome["skippedDomains"]
    failed_entities = restore_outcome["failedEntities"]
    missing_entities = restore_outcome["missingEntities"]
    restore_incomplete = bool(restore_outcome["incomplete"])

    active_modes = await deps.list_active_modes()
    group_ids = [
        m["id"] for m in active_modes if (m.get("exclusiveGroup") or "default") == group
    ]
    if group_ids and not restore_incomplete:
        await deps.clear_group_active(group_ids, restore_outcome["incomplete"])

    still_active = await deps.find_first_active()
    state.set_active_mode_id(still_active["id"] if still_active else None)
    if not still_active:
        deps.linkage_arbiter.release()

    # 多互斥组可同时激活：前端据此只移除本条，而不是清空所有激活标记。
    remaining_active_ids = [
        m["id"] for m in await deps.list_active_modes() if m["id"] != prev_mode_id
    ]

    # 恢复不完整时「已停用」是假象：模式仍是激活态、快照仍保留，用户可重试恢复。
    if restore_incomplete:
        await deps.notify(
            "warning",
            f"模式 {mode['name']} 停用未完成：{failed}/{attempted} 个设备恢复失败，已保留快照",
            "home-mode",
        )
        deps.push_trigger_log(
            {
                "modeId": prev_mode_id,
                "modeName": mode["name"],
                "source": "deactivate",
                "reason": f"恢复不完整：成功 {restored}、失败 {failed}",
                "success": False,
            }
        )
        return {
            "success": False,
            "modeId": prev_mode_id,
            "modeName": mode["name"],
            "active": True,
            "restored": restored,
            "unchanged": restore_outcome["unchanged"],
            "failed": failed,
            "incomplete": True,
            "restoreIncomplete": True,
            "skippedDomains": skipped_domains,
            "failedEntities": failed_entities,
            "missingEntities": missing_entities,
            "exclusiveGroup": group,
            "message": f"已恢复 {restored} 个设备，{failed} 个失败（快照已保留，可重试恢复）",
        }

    await deps.emit_home_mode_event(
        "homeMode.deactivated",
        {
            "modeId": prev_mode_id,
            "exclusiveGroup": group,
            "remainingActiveModeIds": remaining_active_ids,
        },
    )
    if skipped_domains:
        await deps.emit_home_mode_event(
            "homeMode.restoreIncomplete",
            {
                "modeId": prev_mode_id,
                "exclusiveGroup": group,
                "skippedDomains": skipped_domains,
                "restored": restored,
            },
        )
    restored_message = f"已恢复 {restored} 个设备"
    if skipped_domains:
        restored_message += f"，{len(skipped_domains)} 类域不支持恢复（{'/'.join(skipped_domains)}）"
    if missing_entities:
        # 激活时就没采集到快照的设备：它们的状态永远不会被恢复，必须点名而不是沉默。
        restored_message += f"，{len(missing_entities)} 个设备激活时未采集快照（无法恢复）"
        await deps.notify(
            "warning",
            f"模式 {mode['name']} 有 {len(missing_entities)} 个设备未采集过快照，已跳过恢复："
            + "、".join(missing_entities[:5]),
            "home-mode",
        )
    deps.push_trigger_log(
        {
            "modeId": prev_mode_id,
            "modeName": mode["name"],
            "source": "deactivate",
            "reason": restored_message,
            "success": True,
        }
    )
    suffix = f";仍激活: {still_active['name']}" if still_active else ""
    deps.log(f"模式组\"{group}\"已停用({mode['name']}),{restored_message}{suffix}")
    return {
        "success": True,
        "modeId": prev_mode_id,
        "modeName": mode["name"],
        "active": False,
        "restored": restored,
        "unchanged": restore_outcome["unchanged"],
        "failed": failed,
        "incomplete": False,
        "restoreIncomplete": False,
        "skippedDomains": skipped_domains,
        "failedEntities": failed_entities,
        "missingEntities": missing_entities,
        "exclusiveGroup": group,
        "message": restored_message,
    }
