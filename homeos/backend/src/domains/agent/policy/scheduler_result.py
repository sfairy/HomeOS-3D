"""计划任务「动作是否真的生效」的判定口径。

单独成模块是为了让执行路径（``scheduler.py``）与多目标合并（``scheduler_action.py``）
共用同一份判定，避免两边各写一遍导致「合并后算成功、单发算失败」这种前后矛盾。
"""

from __future__ import annotations

from typing import Any


def task_result_ok(result: dict[str, Any]) -> bool:
    """动作是否真的生效。

    有 ``verification.verified == False`` 时不能记成功：HA 收下了请求但设备状态没变
    （``unavailable`` / 服务被忽略 / 状态不符）。只读 ``success`` 会把这类任务记成成功，
    用户以为定时开关照常执行，其实设备一直没动。

    ``verified is None``（无法校验）保持宽松口径：查询类工具与异步设备都会落到这里，
    把「未知」当失败会每天刷一堆假告警。
    """
    if result.get("verified") is False:
        return False
    # activate_home_mode 等会带回 unverifiedCount：未确认不得记计划任务成功。
    if int(result.get("unverifiedCount") or 0) > 0:
        return False
    if bool(result.get("success")):
        return True
    return not result.get("error") and not result.get("blocked") and "success" not in result


__all__ = ["task_result_ok"]
