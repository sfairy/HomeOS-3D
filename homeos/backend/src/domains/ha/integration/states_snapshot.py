"""全量 ``/api/states`` 快照的单飞拉取（``fetch_states`` 的批量补齐路径复用）。

为什么单独成文件：``integration/client.py`` 已经很大，再加一个方法只会继续堆高它。
这里只放一个不持有状态的动作 —— 在途请求挂在调用方实例上（``getattr``），
所以同一个 client 上的并发调用共享同一个任务，不同 client（不同 HA 实例 / 不同令牌）
之间互不影响。

为什么不在这里加 TTL 缓存：``fetch_states`` 的语义是「读到此刻的状态」，缓存会把刚变更
的实体读成旧值。只合并**同时在途**的请求，就能消掉「多块屏同时上线各拉一份全量 JSON」
这一笔最大的重复开销，而且不引入任何可观测的陈旧窗口。

鉴权异常由调用方以工厂函数注入（``auth_error``）：本模块反向导入 ``client`` 会构成
文件级循环依赖，而分层约定会直接判红。
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import Any

#: 在途任务挂在 client 上（缺省）或调用方提供的共享登记表里的键名。
_INFLIGHT_ATTR = "_states_snapshot_task"


async def fetch_all_states_single_flight(
    client: Any,
    auth_error: Callable[[], Exception],
    registry: dict[str, Any] | None = None,
) -> Any:
    """拉全量 ``/api/states``；同一 ``registry`` 上的并发调用共享同一个在途请求。

    ``registry`` 必须由调用方提供**跨实例共享**的字典（连接器级别）：``client_for``
    每次都会新建 ``HAClient``，在途任务挂在实例上就等于没有合并 —— 多块屏同时上线
    仍会各拉一份全量（实测 1455 个实体）。缺省时退回实例属性，保持单测与一次性脚本
    的既有语义。
    """
    owner = registry if registry is not None else client.__dict__
    # 按基地址分桶：同一份登记表被多条 HA 连接记录共用时（换地址 / 主备端点切换），
    # 不同实例的在途请求绝不能合并 —— 否则会把 A 的全量状态喂给 B。
    key = f"{_INFLIGHT_ATTR}:{getattr(client, 'base_url', '') or ''}"
    task = owner.get(key)
    if task is None or task.done():

        async def load() -> Any:
            async with client._http_client() as http:
                response = await http.get(
                    f"{client.base_url}/api/states",
                    headers=client.headers,
                    timeout=client.timeout,
                )
                if response.status_code in {401, 403}:
                    raise auth_error()
                response.raise_for_status()
                return response.json()

        task = asyncio.ensure_future(load())
        owner[key] = task
        # 所有等待者都被取消时任务仍会完成；兜底取一次异常，避免
        # "Task exception was never retrieved" 的日志噪音。
        task.add_done_callback(lambda finished: finished.exception() if not finished.cancelled() else None)
    return await asyncio.shield(task)
