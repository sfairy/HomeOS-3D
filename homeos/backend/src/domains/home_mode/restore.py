"""快照回放与**跨互斥组设备归属仲裁**（从 ``actions.py`` 拆出）。

## 为什么需要归属仲裁

互斥组只保证「同组至多一条 isActive」（``home_modes_exclusive_active_uidx``），
不同组允许并存。但快照回放是「当前状态 ≠ 快照就无脑回写」：一组退场时会把另一组
**仍在生效**的模式刚设好的设备恢复成旧值。

典型翻车路径（默认预置即可复现）：

1. 回家（default 组）→ 灯 80%；
2. 22:30 睡眠（comfort 组）→ 快照记下「灯亮着」；
3. 出门离家（default 组）→ 全关灯；睡眠仍勾着；
4. 退出睡眠 → 回放快照把灯点亮 —— 家里没人，灯全亮。

因此回放前先问一句「这台设备现在归谁」：**归属口径是动作目标**（模式 ``config``
里实际下发的实体），不是快照键 —— 快照只是「进门前的样子」，不代表它现在在控制谁。
被其他激活模式控制的实体一律跳过，并如实回报 ``skippedOwned``，不混进「已恢复 N 个」。

回滚（激活失败还原本次半执行动作）不走归属仲裁：那时要还原的是「本次激活之前」，
同组旧模式已经恢复过一次，跳过会让半执行状态留在设备上。
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Iterable
from typing import Any, NotRequired, TypedDict

from .presets import collect_home_mode_target_actions, resolve_action_kind
from .snapshot import HA_ENTITY_FETCH_CONCURRENCY
from ..automation.exec.snapshot_restore import build_snapshot_restore_calls, describe_restore_support
from ...platform.core.entity.entity_domain import get_entity_domain

logger = logging.getLogger("homeos.home_mode")

#: 快照里记录「采集失败实体」的保留键：恢复时据此如实报告「这些设备无法恢复」。
SNAPSHOT_MISSING_KEY = "_missing"


class HomeModeSnapshotOutcome(TypedDict):
    """快照恢复计数。

    所有键总是同时写入（见 :func:`restore_mode_snapshot`），故声明为必选：
    调用方 ``outcome["restored"]`` 才不会被判成「可能缺失的键」。

    - ``attempted``：真正尝试恢复的实体数（restored + unchanged + failed）
    - ``skippedDomains``：恢复表覆盖不到的域（scene / script / button …），
      它们不会进入 ``restored``，避免「已恢复 N 个设备」虚高。
    - ``skippedOwned``：被**其他激活模式**控制的实体，按归属仲裁跳过。
    - ``ownedElsewhere``：``{entity_id: 占用者模式名}``，用于提示「谁在管这台设备」。
    - ``failedEntities``：恢复失败的实体 id（用于前端点名提示）。
    - ``missingEntities``：激活时就没采集到快照的实体 id —— 它们无法恢复。
    - ``haOffline``：HA 未连接导致根本没开始恢复（``attempted`` 为 0）。可选：
      只有离线分支才写，其他分支不出现该键。
    """

    restored: int
    unchanged: int
    failed: int
    incomplete: bool
    attempted: int
    skippedDomains: list[str]
    skippedOwned: list[str]
    ownedElsewhere: dict[str, str]
    failedEntities: list[str]
    missingEntities: list[str]
    haOffline: NotRequired[bool]


def read_snapshot(raw: Any) -> dict[str, Any]:
    """``deviceSnapshot`` → dict；容错 JSON 字符串 / 半截数据。"""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw:
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except (TypeError, ValueError) as exc:
            # 快照坏了等于「没有可回放的快照」：如实按空处理，但留痕便于排查写坏的那条记录。
            logger.warning("设备快照不是合法 JSON，按空快照处理: %s", exc)
            return {}
    return {}


def collect_owned_targets(mode: dict[str, Any]) -> set[str]:
    """模式通过动作实际控制的实体集合。

    ``notify`` 不占设备；``security`` 映射出的 ``alarm_control_panel.*`` 是合成目标
    （布防强度由 :func:`presets.is_security_downgrade` 单独裁决），不参与设备归属。
    """
    actions = mode.get("config")
    if not isinstance(actions, list):
        return set()
    return {
        target["entityId"]
        for target in collect_home_mode_target_actions(actions)
        if not target["entityId"].startswith("alarm_control_panel.")
    }


def target_covers(owned: set[str], entity_id: str) -> bool:
    """``owned`` 是否覆盖 ``entity_id``。

    三种口径都要认：精确 id、``domain.all``（HA 的整域动作）、``*``。
    快照里可能是 ``light.all``（整域快照）而占用方只点名了一盏灯：保守视为冲突，
    否则回放 ``light.all`` 会把那盏灯一起改掉。
    """
    if entity_id in owned or "*" in owned:
        return True
    domain = get_entity_domain(entity_id)
    if f"{domain}.all" in owned:
        return True
    if entity_id.endswith(".all"):
        return any(get_entity_domain(target) == domain for target in owned)
    return False


async def foreign_owned_entities(deps: Any, mode_id: str, entity_ids: Iterable[str]) -> dict[str, str]:
    """``{entity_id: 占用者模式名}``：被**其他**激活模式控制的实体。

    读激活列表失败时按「没有占用」处理并留日志：宁可回放（旧行为）也不能因为
    一次读库抖动让整次停用直接失败 —— 但必须可查。
    """
    targets = [str(entity_id) for entity_id in entity_ids if entity_id]
    if not targets:
        return {}
    try:
        active_modes = await deps.list_active_modes()
    except Exception:
        logger.warning("读取激活模式失败，跳过设备归属仲裁", exc_info=True)
        return {}
    owners: dict[str, str] = {}
    for mode in active_modes:
        if str(mode.get("id")) == str(mode_id):
            continue
        owned = collect_owned_targets(mode)
        if not owned:
            continue
        owner_name = str(mode.get("name") or mode.get("id") or "?")
        for entity_id in targets:
            if entity_id not in owners and target_covers(owned, entity_id):
                owners[entity_id] = owner_name
    return owners


async def restore_entity_from_snapshot(deps: Any, entity_id: str, snapshot: dict[str, Any]) -> None:
    calls = build_snapshot_restore_calls(entity_id, snapshot)

    semaphore = asyncio.Semaphore(HA_ENTITY_FETCH_CONCURRENCY)

    async def _run(call: dict[str, Any]) -> None:
        async with semaphore:
            await deps.call_service(call["domain"], call["service"], call["entityId"], call["data"])

    await asyncio.gather(*(_run(call) for call in calls))


def snapshot_state_matches(current: dict[str, Any] | None, snap: dict[str, Any]) -> bool:
    if not current or current.get("state") != snap.get("state"):
        return False
    return json.dumps(current.get("attributes"), sort_keys=True, default=str) == json.dumps(
        snap.get("attributes"), sort_keys=True, default=str
    )


async def restore_entity_from_snapshot_if_not_changed(deps: Any, entity_id: str, snap: dict[str, Any]) -> str:
    """把实体恢复到快照状态；返回 ``unchanged``（已一致）/ ``restored``（已回写）。"""
    try:
        current = await deps.fetch_entity_state(entity_id)
    except Exception:
        # 读不到当前状态时按「与快照不一致」处理，会照常回写一次 —— 但这样一来
        # 「恢复条数」里就混进了「其实没查成功」的条目，必须有日志可对账。
        logger.warning("恢复快照前读取实体当前状态失败，按需要回写处理: %s", entity_id, exc_info=True)
        current = None
    if snapshot_state_matches(current, snap):
        return "unchanged"
    await restore_entity_from_snapshot(deps, entity_id, snap)
    return "restored"


def _empty_outcome() -> HomeModeSnapshotOutcome:
    return {
        "restored": 0,
        "unchanged": 0,
        "failed": 0,
        "incomplete": False,
        "attempted": 0,
        "skippedDomains": [],
        "skippedOwned": [],
        "ownedElsewhere": {},
        "failedEntities": [],
        "missingEntities": [],
    }


def build_activation_preview(mode: dict[str, Any] | None, active_modes: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """激活前预览：这次激活会与哪些**仍生效**的模式改动同一批设备。

    互斥组只保证同组单一激活，跨组并存是允许的；但两个模式改到同一台设备时，
    「后激活的为准」是隐式语义。激活前把冲突点名，用户才能判断要不要先退出对方，
    而不是激活后发现灯被改了却不知道为什么。

    返回 ``{entities, conflicts, securityTarget}``：``conflicts`` 里每条含占用模式名与
    重叠的实体（按目标动作算，不是快照键 —— 快照只是「进门前的样子」）。
    """
    targets = collect_owned_targets(mode) if isinstance(mode, dict) else set()
    self_id = str((mode or {}).get("id"))
    conflicts: list[dict[str, Any]] = []
    for active in active_modes or []:
        if not isinstance(active, dict) or str(active.get("id")) == self_id:
            continue
        owned = collect_owned_targets(active)
        shared = sorted(t for t in targets if target_covers(owned, t))
        if shared:
            name = active.get("name") or active.get("id")
            conflicts.append({"modeId": active.get("id"), "modeName": name, "entities": shared})
    security = [
        action
        for action in ((mode or {}).get("config") or [])
        if isinstance(action, dict) and resolve_action_kind(action) == "security"
    ]
    return {
        "modeId": self_id or None,
        "modeName": (mode or {}).get("name"),
        "entities": sorted(targets),
        "conflicts": conflicts,
        "securityTarget": str(security[0].get("entity_id") or "").strip() if security else None,
    }


def summarize_pending_restore(modes: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """停用态但还留着设备快照的模式摘要（供 ``/modes/context`` 暴露重试入口）。

    「模式未激活 + 快照还在」只可能来自两条路径：同组顶替时旧模式恢复不完整、
    或 HA 离线时强制退出。它们都不在激活列表里，不给入口就等于快照永远不会被回放。
    """
    pending: list[dict[str, Any]] = []
    for mode in modes:
        snapshot = mode.get("deviceSnapshot")
        if not mode.get("isActive") and isinstance(snapshot, dict) and snapshot:
            name = mode.get("name") or mode["id"]
            group = mode.get("exclusiveGroup") or "default"
            pending.append({"id": mode["id"], "name": name, "entities": len(snapshot), "exclusiveGroup": group})
    return pending


async def restore_mode_snapshot(
    deps: Any, mode: dict[str, Any], *, respect_active_owners: bool = True
) -> HomeModeSnapshotOutcome:
    """把设备恢复到模式快照记录的状态，如实统计 restored / skipped。

    ``restored + unchanged == attempted``；``skippedDomains`` 记录恢复表覆盖不到的域，
    ``skippedOwned`` 记录被其他激活模式接管的实体，二者都不进 ``restored``。

    Args:
        deps: 领域依赖注入对象。
        mode: 含 ``deviceSnapshot`` 的模式字典（回滚时可只传快照）。
        respect_active_owners: 是否跳过被其他激活模式控制的实体。停用 / 顶替时为
            ``True``；激活失败回滚本次半执行动作时为 ``False``（那时要还原的是
            「本次之前」，跳过会把半执行状态留在设备上）。
    """
    outcome = _empty_outcome()
    # 拷贝一份：``read_snapshot`` 对 dict 直接返回原对象，pop 保留键会污染调用方的快照。
    snapshot = dict(read_snapshot(mode.get("deviceSnapshot")))
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
            # 标记成「HA 离线」：此时 attempted=0，直接报「0/0 个设备恢复失败」既没线索
            # 又让人以为设备真的失败了。停用流程据此给「可强制退出」的提示。
            outcome["haOffline"] = True
            return outcome

        owned_elsewhere = (
            await foreign_owned_entities(deps, str(mode.get("id") or ""), snapshot) if respect_active_owners else {}
        )
        outcome["ownedElsewhere"] = owned_elsewhere
        outcome["skippedOwned"] = sorted(owned_elsewhere)

        skipped_domains: set[str] = set()
        restorable: list[tuple[str, dict[str, Any]]] = []
        for entity_id, snap in snapshot.items():
            snap_row = snap if isinstance(snap, dict) else {}
            if entity_id in owned_elsewhere:
                continue
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
                    results.append(await restore_entity_from_snapshot_if_not_changed(deps, entity_id, snap))
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
