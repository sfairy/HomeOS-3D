"""计划任务的动作执行：单目标直发，多目标逐个下发后合并。

多设备规则（「每天 22:00 关客厅灯带和射灯」）本来就该是一条任务；拆成 N 条只会让用户
分别维护 N 个时间。调度器在这里按 ``entity_ids`` 逐个调用 ``control_device``，每个实体
仍然单独走实体 ACL / 服务白名单 / 高危 denylist / 状态校验，只是把结论合并成一次任务结果。
"""

from __future__ import annotations

from typing import Any

from .scheduler_result import task_result_ok

#: 合并失败信息里最多列出的设备条数
MAX_FAILURE_LINES = 5


def control_targets(action_args: dict[str, Any]) -> list[str]:
    """从动作参数里取出要控制的实体列表（多目标任务用 ``entity_ids``）。"""
    raw = action_args.get("entity_ids")
    if isinstance(raw, list):
        ids = [str(item).strip() for item in raw if str(item).strip()]
        if ids:
            return list(dict.fromkeys(ids))
    single = str(action_args.get("entity_id") or "").strip()
    return [single] if single else []


def aggregate_control(results: list[dict[str, Any]], targets: list[str]) -> dict[str, Any]:
    """多目标控制的合并结果：全部生效才算成功，失败项逐条列出（有上限）。"""
    failures = [
        f"{targets[index] if index < len(targets) else '?'}: {item.get('message') or item.get('error') or '失败'}"
        for index, item in enumerate(results)
        if not task_result_ok(item)
    ]
    aggregated: dict[str, Any] = {
        "success": not failures,
        "entity_ids": targets,
        "total": len(targets),
        "okCount": len(results) - len(failures),
        "results": results,
    }
    if failures:
        aggregated["message"] = f"{len(failures)} 台设备未生效：" + "；".join(failures[:MAX_FAILURE_LINES])
        aggregated["blocked"] = any(bool(item.get("blocked")) for item in results)
    unverified = sum(int(item.get("unverifiedCount") or 0) for item in results)
    if unverified:
        aggregated["unverifiedCount"] = unverified
    if any(item.get("verified") is False for item in results):
        aggregated["verified"] = False
    return aggregated


async def run_action(tools: Any, action_tool: str, action_args: dict[str, Any], actor: Any) -> Any:
    """执行任务动作；``control_device`` + 多实体时逐个下发并合并。"""
    targets = control_targets(action_args)
    if action_tool != "control_device" or len(targets) <= 1:
        return await tools.execute(action_tool, {k: v for k, v in action_args.items() if k != "entity_ids"}, actor)
    results: list[dict[str, Any]] = []
    for entity_id in targets:
        args = {k: v for k, v in action_args.items() if k != "entity_ids"}
        args["entity_id"] = entity_id
        raw = await tools.execute(action_tool, args, actor)
        results.append(raw if isinstance(raw, dict) else {"raw": raw})
    return aggregate_control(results, targets)


__all__ = ["aggregate_control", "control_targets", "run_action"]
