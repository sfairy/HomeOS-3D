"""Home Assistant 长期统计读取（``recorder/statistics_during_period``）。

放在 ``platform/core/ha`` 而不是 ``domains/ha``：日志域（能耗回填）要用它，而
``domains/logs → domains/ha`` 会与既有的 ``domains/ha → domains/logs`` 形成包级循环
（``check:backend-deps`` B4）。这里只做一条 WS 命令，只依赖调用方传进来的 client，
放在下层平台包里既没有反向依赖，也不影响 ``HAClient`` 的分层。

能耗回填优先走统计：一次命令取回所有实体的统计桶，比 ``/api/history/period`` 的
原始状态流小两三个数量级；没有 ``state_class``（未生成统计）的实体不会出现在结果里，
调用方回退到历史状态差分。
"""

from __future__ import annotations

from typing import Any


async def fetch_statistics(
    client: Any,
    statistic_ids: list[str] | tuple[str, ...],
    start_time: str,
    *,
    end_time: str | None = None,
    period: str = "hour",
    types: tuple[str, ...] = ("change", "sum"),
) -> dict[str, list[dict[str, Any]]]:
    """读取统计桶，返回 ``{statistic_id: [bucket, ...]}``。

    ``client`` 需提供 ``connect_websocket()`` / ``command(ws, id, type, **payload)``
    （见 ``HAClient``）。命令不可用时异常向上抛，由调用方决定是否回退。
    """
    requested = sorted({str(item) for item in statistic_ids if str(item)})
    if not requested:
        return {}
    payload: dict[str, Any] = {
        "statistic_ids": requested,
        "start_time": start_time,
        "period": period,
        "types": list(types),
    }
    if end_time:
        payload["end_time"] = end_time
    websocket = await client.connect_websocket()
    try:
        result = await client.command(websocket, 1, "recorder/statistics_during_period", **payload)
    finally:
        await websocket.close()
    if not isinstance(result, dict):
        return {}
    return {
        str(key): [item for item in value if isinstance(item, dict)]
        for key, value in result.items()
        if isinstance(value, list)
    }


__all__ = ["fetch_statistics"]
