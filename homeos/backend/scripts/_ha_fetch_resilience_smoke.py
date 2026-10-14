"""HA 批量取状态（fetch_states / ensure_entity_states）的容错回归。

守护的故障：``fetch_states`` 曾用裸 ``asyncio.gather`` 并发拉取实体状态，未开
``return_exceptions``。单个实体一次读超时（或 5xx）就会冒泡——``gather`` 默认在首个异常处
短路，不只抛出异常，还**丢弃其余并发请求已拿到的结果**；异常穿过 ``ensure_entity_states``
的重试循环，最终在 ``api/ha.py`` 的 ``send_updates`` 里拆掉整条 runtime WebSocket：

    客户端重连、订阅的全部实体一起丢推送 —— 而真正损失的只是那一个实体的一次刷新。

同时守护 ``STATE_FETCH_RETRY_DELAYS``（共 3 轮）真的会跑：旧实现里 ``pending.clear()``
位于 ``if states:`` 之前，全量失败时 ``pending`` 被清空后立刻 break，退避一次都用不上。

不需要真实 HA、数据库或 HTTP 服务：httpx 的 AsyncClient 被替换为脚本化响应，
StateHub 用真实实现。

「跑满重试」的两个用例会把退避 patch 成 0（省约 1.6s 真实 sleep），退避数值本身另立
一条断言钉住 —— 定时用例断的是轮数，不该拿真实时钟去证明退避时长。

用法：``python scripts/_ha_fetch_resilience_smoke.py``（在 homeos/backend 下执行）。
"""

from __future__ import annotations

import asyncio

from _smoke_harness import check, ensure_backend_on_path, report

ensure_backend_on_path()

import httpx
from src.domains.ha.integration import client as client_mod
from src.domains.ha.integration import service_sync as service_sync_mod
from src.domains.ha.integration.client import HAClient, HAClientError
from src.domains.ha.integration.service import HAConnectorService
from src.domains.ha.integration.service_support import STATE_FETCH_RETRY_DELAYS
from src.domains.ha.integration.state_hub import StateHub

#: 真实退避序列（下面「跑满重试」的用例会把它 patch 成 0，省掉约 1.6s 真实 sleep）。
#: 常量本身另有独立断言 —— 否则把退避清成 0 一起改掉就没人拦了。
REAL_RETRY_DELAYS = STATE_FETCH_RETRY_DELAYS


class _Response:
    """最小 httpx.Response 替身：只需 status_code / raise_for_status / json。"""

    def __init__(self, status_code: int, payload: dict | None = None) -> None:
        self.status_code = status_code
        self._payload = payload
        self.request = httpx.Request("GET", "http://ha.local")

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            # `HTTPStatusError` 把 `response` 声明成 `httpx.Response`，本替身只做鸭子类型、
            # 不是它的子类，于是静态分析判不合格。这里按同样状态码现造一个真 Response 挂上：
            # 上层只读 `error.response.status_code`（client.py 各处 except 都是这么用的），
            # 行为与替身一致；也不为此把真实构造链拖进这个最小替身。
            raise httpx.HTTPStatusError(
                "boom",
                request=self.request,
                response=httpx.Response(self.status_code, request=self.request),
            )

    def json(self) -> dict | None:
        return self._payload


class _FakeAsyncClient:
    """把 /api/states/<id> 换成脚本化的响应/异常；counter 记录被请求的实体。"""

    def __init__(self, behavior, *, counter: list | None = None, **_: object) -> None:
        self._behavior = behavior
        self._counter = counter

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc: object) -> bool:
        return False

    async def get(self, url: str):
        entity_id = url.rsplit("/", 1)[-1]
        if self._counter is not None:
            self._counter.append(entity_id)
        return self._behavior(entity_id)


class _HttpxProxy:
    """只替换 AsyncClient，其余属性（异常类）透传真实 httpx，避免污染全局模块。"""

    def __init__(self, fake) -> None:
        self.AsyncClient = fake

    def __getattr__(self, name: str):
        return getattr(httpx, name)


def _state(entity_id: str) -> dict:
    return {"entity_id": entity_id, "state": "on", "attributes": {"friendly_name": entity_id}}


def _client() -> HAClient:
    return HAClient("http://ha.local:8123", "token-abc")


class _ServiceShim:
    """只提供 ensure_entity_states 需要的协作对象，避开真实数据库与连接池。"""

    def __init__(self, hub: StateHub, client: HAClient) -> None:
        self.state_hub = hub
        self._client = client
        self.active_connection = object()

    async def _run_database(self, _connection):
        return self.active_connection

    async def client_for(self, _connection) -> HAClient:
        return self._client

    async def ensure_entity_states(self, entity_ids: set[str]) -> None:
        """以「假 self」调用真实实现。

        本类刻意**不**继承 ``HAConnectorService``：那会连真实 ``__init__`` 与整条数据库 /
        连接池构造链一起拖进来，而这里要的就是「只补协作对象」。于是静态分析按声明类型判
        不合格 —— 这是刻意的鸭子类型替身，只在这一处显式声明；调用方按普通方法调用即可。
        """
        await HAConnectorService.ensure_entity_states(self, entity_ids)  # pyright: ignore[reportArgumentType]


def _timeout(*_args: object, **_kwargs: object):
    raise httpx.ReadTimeout("模拟读超时")


async def _main() -> None:
    real_httpx = client_mod.httpx
    expected_attempts = 1 + len(REAL_RETRY_DELAYS)

    # 0) 常量本身：3 轮（首次 + 2 次重试），退避为正且递增、单次不超过 5s。
    #    后面的用例会把它 patch 成 0 省 sleep，所以这一条必须独立钉住真实取值。
    check(
        "STATE_FETCH_RETRY_DELAYS 是「首次 + 2 次重试」的递增正退避",
        len(REAL_RETRY_DELAYS) == 2
        and all(isinstance(delay, (int, float)) for delay in REAL_RETRY_DELAYS)
        and 0 < REAL_RETRY_DELAYS[0] < REAL_RETRY_DELAYS[1] <= 5,
        f"实际={REAL_RETRY_DELAYS!r}",
    )

    try:
        # 1) 核心回归：一个实体超时，其余实体照常返回，且不冒泡异常。
        def behavior_partial(entity_id: str):
            if entity_id == "light.bad":
                raise httpx.ReadTimeout("模拟读超时")
            return _Response(200, _state(entity_id))

        client_mod.httpx = _HttpxProxy(lambda **kw: _FakeAsyncClient(behavior_partial, **kw))
        states = await _client().fetch_states({"light.good", "light.bad", "light.also_good"})
        check(
            "单实体读超时不再冒泡，其余实体状态照常返回",
            sorted(state["entity_id"] for state in states) == ["light.also_good", "light.good"],
            f"实际={[state['entity_id'] for state in states]}",
        )

        # 2) 全部失败：返回空列表而不是抛异常。
        client_mod.httpx = _HttpxProxy(lambda **kw: _FakeAsyncClient(_timeout, **kw))
        check("全部实体失败时返回空列表且不抛异常", await _client().fetch_states({"light.a", "light.b"}) == [])

        # 3) 实体已不存在（404）跳过，不影响健康实体。
        def behavior_gone(entity_id: str):
            return _Response(404) if entity_id == "light.gone" else _Response(200, _state(entity_id))

        client_mod.httpx = _HttpxProxy(lambda **kw: _FakeAsyncClient(behavior_gone, **kw))
        states = await _client().fetch_states({"light.gone", "light.ok"})
        check(
            "实体不存在(404)时跳过，健康实体不受影响",
            [state["entity_id"] for state in states] == ["light.ok"],
            f"实际={[state['entity_id'] for state in states]}",
        )

        # 4) ensure_entity_states 不抛异常，且退避重试真的跑满（旧实现只跑 1 轮）。
        #    本用例要断的是「重试了几轮」，不是「睡够没有」：退避数值本身已由上面第 0 条
        #    独立钉住，所以这里把退避清零 —— 否则两轮退避 = 1.6s 真实 sleep，白等。
        # patch 目标是 `service_sync` 而不是 `service`：`service.py` 拆分后不再转出这个常量，
        # 且 `service_sync` 是 `from .service_support import STATE_FETCH_RETRY_DELAYS`
        # —— 它拿到的是**自己的模块级绑定**，改 `service` 只会凭空造一个属性、退避照旧生效。
        service_sync_mod.STATE_FETCH_RETRY_DELAYS = (0.0, 0.0)
        attempts: list[str] = []
        client_mod.httpx = _HttpxProxy(
            lambda **kw: _FakeAsyncClient(_timeout, counter=attempts, **kw)
        )
        await _ServiceShim(StateHub(), _client()).ensure_entity_states({"light.x"})
        check(
            f"ensure_entity_states 不抛异常且重试跑满 {expected_attempts} 轮",
            len(attempts) == expected_attempts,
            f"尝试次数={len(attempts)}",
        )

        # 5) 既有语义不得丢：sensor 的 unknown 是「还没读到值」的占位，仍要重试。
        sensor_attempts: list[str] = []
        client_mod.httpx = _HttpxProxy(
            lambda **kw: _FakeAsyncClient(
                lambda entity_id: _Response(
                    200, {"entity_id": entity_id, "state": "unknown", "attributes": {}}
                ),
                counter=sensor_attempts,
                **kw,
            )
        )
        await _ServiceShim(StateHub(), _client()).ensure_entity_states({"sensor.temp"})
        check(
            f"sensor 的 unknown 占位状态仍会退避重试到 {expected_attempts} 轮",
            len(sensor_attempts) == expected_attempts,
            f"尝试次数={len(sensor_attempts)}",
        )

        # 6) 反向护栏：状态齐全时只请求一轮，不得因本次改动引入多余请求。
        ok_attempts: list[str] = []
        client_mod.httpx = _HttpxProxy(
            lambda **kw: _FakeAsyncClient(
                lambda entity_id: _Response(200, _state(entity_id)), counter=ok_attempts, **kw
            )
        )
        await _ServiceShim(StateHub(), _client()).ensure_entity_states({"light.one", "light.two"})
        check(
            "状态齐全时只请求一轮（无多余重试）",
            len(ok_attempts) == 2,
            f"请求次数={len(ok_attempts)}（期望 2）",
        )

        # 7) 对照：旧的裸 gather 写法确实会冒泡并丢弃健康结果（证明故障真实存在）。
        reached: list[str] = []

        async def boom():
            raise HAClientError("无法获取 Home Assistant 实体 light.bad：模拟读超时")

        async def healthy():
            reached.append("healthy")
            return _state("light.good")

        try:
            await asyncio.gather(boom(), healthy())
            ok_legacy, legacy_detail = False, "裸 gather 竟然没抛异常"
        except HAClientError as error:
            ok_legacy = True
            legacy_detail = f"抛 {type(error).__name__}"
        check("对照：旧的裸 gather 写法会冒泡异常（故障确实存在）", ok_legacy, legacy_detail)
    finally:
        client_mod.httpx = real_httpx
        service_sync_mod.STATE_FETCH_RETRY_DELAYS = REAL_RETRY_DELAYS


if __name__ == "__main__":
    asyncio.run(_main())
    report("HA 批量取状态容错回归通过")
