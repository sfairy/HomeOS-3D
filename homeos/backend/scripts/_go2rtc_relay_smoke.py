"""go2rtc 同源中继（``/api/v1/go2rtc/ws``）的关闭码语义回归。

守护的故障（每条都对应一次真实踩坑）：

1. **取址被拒必须是约定的终态关闭码**。``saved_camera_target`` 在 ``websocket.accept()``
   之前抛出的 ``ValueError``（未保存 / 未选 go2rtc / 已隐藏 / 类型不匹配 / 保存的是公网地址）
   曾直接冒泡成未处理异常 —— 客户端拿到的是握手失败，前端 ``{4400,4401,4403}`` 的终态语义
   失效，会按 3s→30s 退避一直重连（画面永远转圈）。现在必须落成 4403。
2. **鉴权顺序与关闭码**：origin → 4403、未登录 → 4401、授权受限 → 4403（与 ``api/ha.py``
   的 ``_runtime_websocket`` 同口径；发布包 origin 用 4400，本仓库统一为 4403）。
3. **地址只信服务端**：客户端只传 ``projectId``/``componentId``/``cameraId``，地址永远取自
   已保存的 ``go2rtcUrl`` 并再次过白名单（外网主机名 / 公网 IP / 带账号密码 / 非
   ``/stream.html`` / 缺 ``src`` 一律拒），否则这个中继就是一台开放 SSRF 代理。
4. **信令白名单**：客户端只允许 ``{"type":"mse","value":"<编解码串>"}``，其余（含
   ``{"type":"snapshot"}``）→ 4400，绝不能退化成任意帧转发器。
5. **布局取址的索引对齐**：Vue 安防页只用 go2rtc 地址的那一路，key 是 ``go2rtc:<索引>``，
   索引必须与前端 ``normalizeSecurityCameras`` 一致 —— 只给「能成为绑定项的卡位」编号，
   否则布局里存了 ``null`` / 非对象空位的机器会错位到别人那一路上（表现为该路永远取不到址）。

不需要数据库 / HA / 真实 go2rtc：``session_factory`` / ``websocket_viewer`` / origin 校验 /
上游 ``connect`` 全部打桩。

用法：``python scripts/_go2rtc_relay_smoke.py``（在 homeos/backend 下执行）。
"""

from __future__ import annotations

import asyncio
import concurrent.futures
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import src.api.go2rtc as relay  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from starlette.testclient import TestClient  # noqa: E402
from starlette.websockets import WebSocketDisconnect  # noqa: E402

failures: list[str] = []
#: 断言计数（自数，避免加/删断言后末尾的「（N 项）」变成谎言）。
checked = 0


def check(label: str, condition: bool, detail: object = "") -> None:
    global checked
    checked += 1
    print(f"  [{'PASS' if condition else 'FAIL'}] {label} {'' if condition else detail}")
    if not condition:
        failures.append(label)


CAMERA_URL = "http://192.168.1.5:1984/stream.html?src=cam1"
EXPECTED_TARGET = "ws://192.168.1.5:1984/api/ws?src=cam1"
RELAY_URL = "/api/v1/go2rtc/ws?projectId=p1&componentId=c1"


def draft_document(properties: object, component_type: str = "camera") -> str:
    return json.dumps(
        {
            "sharedComponents": [],
            "pages": [
                {"components": [{"id": "c1", "type": component_type, "properties": properties}]}
            ],
        }
    )


class FakeDraft:
    def __init__(self, document_json: str) -> None:
        self.document_json = document_json


class FakeSession:
    def __init__(self, document_json: str) -> None:
        self._document_json = document_json

    def get(self, _model: object, _key: object) -> FakeDraft:
        return FakeDraft(self._document_json)

    def __enter__(self) -> FakeSession:
        return self

    def __exit__(self, *_exc: object) -> None:
        return None


class FakeDatabase:
    def __init__(self, document_json: str) -> None:
        self._document_json = document_json

    def session_factory(self) -> FakeSession:
        return FakeSession(self._document_json)


class FakeLicense:
    def __init__(self, allow: bool = True) -> None:
        self.allow = allow

    def allows(self, *_args: object, **_kwargs: object) -> bool:
        return self.allow


class FakeUpstream:
    """替身上游：记录信令并把每一条原样回显，用例据此确定性同步。"""

    instances: list[FakeUpstream] = []
    targets: list[str] = []

    def __init__(self, target: str) -> None:
        self.target = target
        self.sent: list[str] = []
        self._echo: asyncio.Queue[str] = asyncio.Queue()
        FakeUpstream.instances.append(self)

    async def __aenter__(self) -> FakeUpstream:
        return self

    async def __aexit__(self, *_exc: object) -> bool:
        return False

    async def send(self, payload: str) -> None:
        self.sent.append(payload)
        self._echo.put_nowait(payload)

    def __aiter__(self) -> FakeUpstream:
        return self

    async def __anext__(self) -> str:
        return await self._echo.get()


def fake_connect(target: str, **_kwargs: object) -> FakeUpstream:
    FakeUpstream.targets.append(target)
    return FakeUpstream(target)


# 先打桩上游，任何一条用例都不会真的去连局域网地址。
relay.connect = fake_connect  # type: ignore[assignment]


def build_client(
    document_json: str,
    *,
    origin_ok: bool = True,
    viewer: Any = SimpleNamespace(),
    allow: bool = True,
) -> TestClient:
    relay.websocket_origin_allowed = lambda _websocket: origin_ok  # type: ignore[assignment]
    relay.websocket_viewer = lambda _websocket: viewer  # type: ignore[assignment]
    relay.require_viewer_project = lambda *_args: None  # type: ignore[assignment]
    app = FastAPI()
    app.state.database = FakeDatabase(document_json)
    app.state.license_service = FakeLicense(allow)
    app.state.ui_config = None
    app.include_router(relay.router, prefix="/api/v1")
    return TestClient(app)


SAVED = draft_document({"cameraSource": "go2rtc", "go2rtcUrl": CAMERA_URL})


def expect_close(client: TestClient, url: str, code: int, label: str) -> None:
    try:
        with client.websocket_connect(url) as socket:
            socket.receive_text()
        check(label, False, "连接未被关闭")
    except WebSocketDisconnect as disconnect:
        check(label, disconnect.code == code, f"关闭码 {disconnect.code}")


print("\n① 鉴权 / origin / 授权")
expect_close(build_client(SAVED, origin_ok=False), RELAY_URL, 4403, "origin 不允许 → 4403")
expect_close(build_client(SAVED, viewer=None), RELAY_URL, 4401, "未登录 → 4401")
expect_close(build_client(SAVED, allow=False), RELAY_URL, 4403, "授权受限 → 4403")

print("\n② 取址被拒一律 4403（不能漏成握手期未处理异常）")
expect_close(
    build_client(SAVED),
    f"{RELAY_URL}&cameraId=camera-9",
    4403,
    "2D 摄像头不该带 cameraId → 4403",
)
expect_close(
    build_client(SAVED),
    "/api/v1/go2rtc/ws?projectId=p1&componentId=nope",
    4403,
    "文档里查不到该组件 → 4403",
)
expect_close(
    build_client(draft_document({"cameraSource": "entity", "entityId": "camera.front"})),
    RELAY_URL,
    4403,
    "摄像头未选 go2rtc 来源 → 4403",
)
expect_close(
    build_client(
        draft_document(
            {"cameraSource": "go2rtc", "go2rtcUrl": "http://8.8.8.8:1984/stream.html?src=x"}
        )
    ),
    RELAY_URL,
    4403,
    "保存的是公网地址（白名单拒）→ 4403",
)
# 文档形状异常（手改过的库 / 旧版本表单）：取址阶段会踩到非对象字段。这类 AttributeError
# 一旦漏出 `_resolve_camera_target` 的捕获范围，就会变成握手期未处理异常 —— 客户端拿到的是
# 非终态关闭码，于是退避重连打转，正是本文件第 1 条守护的故障换个入口复现。
expect_close(
    build_client(
        draft_document({"security": [], "visible": True}, "interaction3d")
    ),
    f"{RELAY_URL}&cameraId=marker-1",
    4403,
    "interaction3d 的 security 不是对象 → 4403（不能漏成未处理异常）",
)
expect_close(
    build_client(
        json.dumps({"sharedComponents": [], "pages": [{"components": ["oops"]}]})
    ),
    RELAY_URL,
    4403,
    "组件项不是对象 → 4403（不能漏成未处理异常）",
)

print("\n③ 正常握手 + 信令白名单")


def with_socket(client: TestClient, body: Any) -> None:
    """包一层收尾。

    Starlette TestClient 在「已 accept 的长连端点」退出时，会把 portal 的取消当成
    ``concurrent.futures.CancelledError`` 抛给调用方（``asyncio.wait(FIRST_COMPLETED)`` +
    cancel 的泵结构都会这样，与本中继无关，最小复现端点同样如此）。这里只吞掉它，
    关闭码断言都在 ``body`` 内完成。
    """
    try:
        with client.websocket_connect(RELAY_URL) as socket:
            body(socket)
    except (asyncio.CancelledError, concurrent.futures.CancelledError):
        pass


def happy_body(socket: Any) -> None:
    signaling = json.dumps({"type": "mse", "value": "avc1.640029,mp4a.40.2"})
    socket.send_text(signaling)
    check("上游回显透传回客户端", socket.receive_text() == signaling)
    upstream = FakeUpstream.instances[-1]
    check("上游地址经白名单归一", upstream.target == EXPECTED_TARGET, upstream.target)
    check("MSE 协商原样转发", upstream.sent == [signaling], upstream.sent)


with_socket(build_client(SAVED), happy_body)


def bad_signaling_body(socket: Any) -> None:
    socket.send_text(json.dumps({"type": "snapshot"}))
    try:
        socket.receive_text()
        check("非 MSE 信令 → 4400", False, "连接未被关闭")
    except WebSocketDisconnect as disconnect:
        check("非 MSE 信令 → 4400", disconnect.code == 4400, f"关闭码 {disconnect.code}")


with_socket(build_client(SAVED), bad_signaling_body)

print("\n④ 布局取址：`go2rtc:<索引>` 只给「能成为绑定项的卡位」编号")
CAMERAS = [
    None,
    "camera.legacy",
    123,
    {"entityId": "", "go2rtcUrl": "http://192.168.1.9:1984/stream.html?src=front"},
    {"entityId": "camera.door", "go2rtcUrl": "http://192.168.1.8:1984/stream.html?src=door"},
]
check(
    "索引跳过 null / 非对象卡位",
    relay._layout_camera_go2rtc_url(CAMERAS, "go2rtc:1")
    == "http://192.168.1.9:1984/stream.html?src=front",
    relay._layout_camera_go2rtc_url(CAMERAS, "go2rtc:1"),
)
check(
    "有实体的那一路按实体 ID 命中",
    relay._layout_camera_go2rtc_url(CAMERAS, "camera.door")
    == "http://192.168.1.8:1984/stream.html?src=door",
)
check("旧数据裸字符串按实体 ID 命中", relay._layout_camera_go2rtc_url(CAMERAS, "camera.legacy") == "")
check("查不到返回 None", relay._layout_camera_go2rtc_url(CAMERAS, "go2rtc:9") is None)

print()
if failures:
    print(f"go2rtc 中继回归失败：{len(failures)} 项")
    for label in failures:
        print(f"  - {label}")
    sys.exit(1)
print(f"go2rtc 中继回归全部通过（{checked} 项）。")
