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
from typing import Any

from .presets import collect_home_mode_target_actions, resolve_action_kind
from ..entity_execute_acl import assert_entity_targets_execute_authorized
from ..home_exec.execute_action_sequence import execute_action_sequence
from ..home_exec.snapshot_restore import build_snapshot_restore_calls
from ...core.errors import api_error, bad_request, not_found

logger = logging.getLogger("homeos.home_mode")

HA_ENTITY_FETCH_CONCURRENCY = 8


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
        await deps.call_service(domain, service, ref, action.get("service_data") or {})
        return {"entity_id": ref, "service": f"{domain}.{service}", "success": True}
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
        current = None
    if _snapshot_state_matches(current, snap):
        return "unchanged"
    await _restore_entity_from_snapshot(deps, entity_id, snap)
    return "restored"


async def _restore_mode_snapshot(deps: Any, mode: dict[str, Any]) -> dict[str, Any]:
    outcome: dict[str, Any] = {"restored": 0, "unchanged": 0, "failed": 0, "incomplete": False}
    snapshot = _read_snapshot(mode.get("deviceSnapshot"))
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

        semaphore = asyncio.Semaphore(HA_ENTITY_FETCH_CONCURRENCY)
        results: list[str] = []

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

        await asyncio.gather(*(_run(entity_id, snap) for entity_id, snap in entries))
        outcome["restored"] = sum(1 for result in results if result == "restored")
        outcome["unchanged"] = sum(1 for result in results if result == "unchanged")
        outcome["failed"] = sum(1 for result in results if result == "failed")
        outcome["incomplete"] = outcome["failed"] > 0
    except Exception as exc:
        outcome["incomplete"] = True
        deps.warn(f"解析设备快照失败: {exc}")
    return outcome


async def _fetch_entity_state(deps: Any, entity_id: str) -> dict[str, Any] | None:
    try:
        return await deps.fetch_entity_state(entity_id)
    except Exception:
        return None


class HomeModeActivateState:
    def __init__(self, getter, setter) -> None:
        self._get = getter
        self._set = setter

    def get_active_mode_id(self) -> str | None:
        return self._get()

    def set_active_mode_id(self, mode_id: str | None) -> None:
        self._set(mode_id)


async def activate_home_mode(
    state: HomeModeActivateState, deps: Any, mode_id: str, meta: dict[str, Any] | None = None
) -> dict[str, Any]:
    mode = await deps.find_mode(mode_id)
    if mode is None:
        not_found(api_error("HOME_MODE_NOT_FOUND"))

    if mode.get("isActive"):
        deps.log(f"模式 {mode['name']} 已处于激活状态,跳过重复激活")
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

    entity_configs = _read_actions(mode.get("config"))

    assert_entity_targets_execute_authorized(
        collect_home_mode_target_actions(entity_configs),
        (meta or {}).get("actor"),
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
            {
                "modeId": mode_id,
                "modeName": mode["name"],
                "source": (meta or {}).get("source") or "manual",
                "reason": (meta or {}).get("reason") or arbiter.get("reason"),
                "success": False,
            }
        )
        bad_request(api_error("HOME_MODE_LINKAGE_BLOCKED", arbiter.get("reason")))

    ha_status = await deps.get_ha_status()
    if not ha_status.get("connected"):
        deps.linkage_arbiter.release()
        deps.warn("Home Assistant 未连接,拒绝激活家庭模式")
        deps.push_trigger_log(
            {
                "modeId": mode_id,
                "modeName": mode["name"],
                "source": (meta or {}).get("source") or "manual",
                "reason": (meta or {}).get("reason") or "手动切换",
                "success": False,
            }
        )
        deps.record_execution(
            {
                "modeId": mode_id,
                "modeName": mode["name"],
                "success": False,
                "source": (meta or {}).get("source") or "manual",
                "reason": (meta or {}).get("reason") or "HA 未连接",
                "executed": 0,
                "total": len(entity_configs),
            }
        )
        return {
            "success": False,
            "modeId": mode_id,
            "modeName": mode["name"],
            "active": False,
            "error": "HA 未连接，无法激活家庭模式",
        }

    incoming_group = mode.get("exclusiveGroup") or "default"
    active_modes = await deps.list_active_modes()
    conflicting_modes = [
        active
        for active in active_modes
        if active["id"] != mode_id and (active.get("exclusiveGroup") or "default") == incoming_group
    ]
    conflict_restore: dict[str, dict[str, Any]] = {}
    for active in conflicting_modes:
        conflict_restore[active["id"]] = await _restore_mode_snapshot(deps, active)

    snapshot: dict[str, Any] = {}
    try:
        entity_ids = [c.get("entity_id") for c in entity_configs if c.get("entity_id")]
        semaphore = asyncio.Semaphore(HA_ENTITY_FETCH_CONCURRENCY)
        fetched: list[tuple[str, dict[str, Any]] | None] = []

        async def _fetch(entity_id: str) -> None:
            async with semaphore:
                state_row = await _fetch_entity_state(deps, entity_id)
                fetched.append((entity_id, state_row) if state_row else None)

        await asyncio.gather(*(_fetch(entity_id) for entity_id in entity_ids))
        for row in fetched:
            if row:
                snapshot[row[0]] = row[1]
    except Exception as exc:
        deps.warn(f"采集设备快照失败: {exc}")

    try:
        await deps.switch_active_group(conflicting_modes, conflict_restore, mode_id, snapshot)
    except Exception:
        deps.linkage_arbiter.release()
        raise
    state.set_active_mode_id(mode_id)
    deps.log(f"正在激活模式: {mode['name']}")

    sec_cfg = deps.get_security_config()
    configs_to_run = filter_home_mode_actions_for_linkage_dedupe(entity_configs, meta, sec_cfg)

    results = await execute_action_sequence(
        configs_to_run, lambda config: _execute_home_mode_action(deps, config), "milliseconds"
    )

    failed_indices = [idx for idx, result in enumerate(results) if not result.get("success")]

    retry_results: list[dict[str, Any]] = []
    if failed_indices:
        deps.warn(f"模式 {mode['name']} 有 {len(failed_indices)} 个设备执行失败,开始重试...")
        apply_max_retries = int(deps.get_apply_max_retries() or 0)
        attempt = 0
        while attempt < apply_max_retries and failed_indices:
            deps.log(
                f"重试第 {attempt + 1}/{apply_max_retries} 次,共 {len(failed_indices)} 个设备"
            )
            await asyncio.sleep(1)
            retry_batch = await asyncio.gather(
                *(_execute_home_mode_action(deps, configs_to_run[idx]) for idx in failed_indices)
            )
            still_failed: list[int] = []
            for position, original_idx in enumerate(failed_indices):
                result = retry_batch[position]
                results[original_idx] = result
                if result.get("success"):
                    retry_results.append(result)
                else:
                    still_failed.append(original_idx)
            failed_indices = still_failed
            attempt += 1

    final_success = sum(1 for result in results if result.get("success"))

    if results and final_success == 0:
        deps.warn(f"模式 {mode['name']} 全部动作失败,回滚快照并取消激活")
        rollback = await _restore_mode_snapshot(deps, {"deviceSnapshot": snapshot})
        # 回滚不完整（HA 断连 / 部分实体恢复失败）时必须保留快照：
        # 否则用户失去唯一的手动恢复依据，设备将停留在半执行状态。
        rollback_incomplete = bool(rollback.get("incomplete"))
        await deps.deactivate_in_db(mode_id, keep_snapshot=rollback_incomplete)
        if rollback_incomplete:
            await deps.notify(
                "warning",
                f"模式 {mode['name']} 激活失败且状态回滚不完整，已保留设备快照，请检查 HA 连接后手动恢复",
                "home-mode",
            )
        if state.get_active_mode_id() == mode_id:
            state.set_active_mode_id(None)
        deps.linkage_arbiter.release()

        failed_items = [
            {"entity_id": r["entity_id"], "service": r["service"], "error": r.get("error")}
            for r in results
        ]
        deps.push_trigger_log(
            {
                "modeId": mode_id,
                "modeName": mode["name"],
                "source": (meta or {}).get("source") or "manual",
                "reason": (meta or {}).get("reason") or "手动切换",
                "success": False,
            }
        )
        deps.record_execution(
            {
                "modeId": mode_id,
                "modeName": mode["name"],
                "success": False,
                "source": (meta or {}).get("source") or "manual",
                "reason": (meta or {}).get("reason") or "手动切换",
                "executed": 0,
                "total": len(results),
                "failedItems": failed_items,
            }
        )
        return {
            "success": False,
            "modeName": mode["name"],
            "executed": 0,
            "failedItems": failed_items,
            "modeId": mode_id,
            "active": False,
            "total": len(results),
            "retried": len(retry_results),
            "results": results,
            "error": "所有设备动作均失败，已恢复快照并取消激活",
        }

    await deps.emit_home_mode_event(
        "homeMode.activated",
        {
            "modeId": mode_id,
            "modeName": mode["name"],
            "results": results,
            "successCount": final_success,
            "totalCount": len(results),
            "retried": len(retry_results) > 0,
        },
    )

    deps.log(f"模式 {mode['name']} 激活完成: {final_success}/{len(results)} 成功")
    if retry_results:
        deps.log(f"  其中 {len(retry_results)} 个设备通过重试恢复")

    all_ok = all(r.get("success") for r in results)
    failed_items = [
        {"entity_id": r["entity_id"], "service": r["service"], "error": r.get("error")}
        for r in results
        if not r.get("success")
    ]
    deps.push_trigger_log(
        {
            "modeId": mode_id,
            "modeName": mode["name"],
            "source": (meta or {}).get("source") or "manual",
            "reason": (meta or {}).get("reason") or "手动切换",
            "success": all_ok,
        }
    )
    deps.record_execution(
        {
            "modeId": mode_id,
            "modeName": mode["name"],
            "success": all_ok,
            "source": (meta or {}).get("source") or "manual",
            "reason": (meta or {}).get("reason") or "手动切换",
            "executed": final_success,
            "total": len(results),
            "failedItems": failed_items or None,
        }
    )

    return {
        "success": all(r.get("success") for r in results),
        "modeName": mode["name"],
        "executed": final_success,
        "failedItems": failed_items,
        "modeId": mode_id,
        "active": True,
        "total": len(results),
        "retried": len(retry_results),
        "results": results,
    }


async def deactivate_home_mode(
    state: HomeModeActivateState, deps: Any, mode_id: str | None = None
) -> dict[str, Any]:
    target_id = mode_id or state.get_active_mode_id()
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

    active_modes = await deps.list_active_modes()
    group_ids = [
        m["id"] for m in active_modes if (m.get("exclusiveGroup") or "default") == group
    ]
    if group_ids:
        await deps.clear_group_active(group_ids, restore_outcome["incomplete"])

    still_active = await deps.find_first_active()
    state.set_active_mode_id(still_active["id"] if still_active else None)
    if not still_active:
        deps.linkage_arbiter.release()

    await deps.emit_home_mode_event(
        "homeMode.deactivated", {"modeId": prev_mode_id, "exclusiveGroup": group}
    )
    deps.push_trigger_log(
        {
            "modeId": prev_mode_id,
            "modeName": mode["name"],
            "source": "deactivate",
            "reason": f"已恢复 {restored} 个设备",
            "success": True,
        }
    )
    suffix = f";仍激活: {still_active['name']}" if still_active else ""
    deps.log(f"模式组\"{group}\"已停用({mode['name']}),恢复了 {restored} 个设备状态{suffix}")
    return {"success": True, "restored": restored, "exclusiveGroup": group}
