"""WS 状态广播的收窄 / ACL 复用 / 背压可靠推送回归（P5 性能优化）。

守护的故障与优化点：

1. **每 sid 一次会话读**：``broadcast_state_changed_batch`` 曾对每个候选 sid 都调
   ``sio.get_session``（引擎侧存储往返，Redis manager 下是网络 IO），客户端一多就成了
   推送主成本。改为内存会话镜像（connect 写入、update_subscription 覆盖、disconnect 清除），
   本脚本断言广播期间**一次** ``get_session`` 都不会发生，且新会话仍然生效。
2. **ACL 判定按用户复用**：同一账号多端连接时，``is_entity_allowed`` 会对每个
   (连接 × 变更) 重算一次限制列表；现在同批次内按限制指纹复用结果。
3. **收窄不能丢推送**：wildcard / 域订阅 / 钉选三种客户端的可见性判定结果必须与
   逐条 ``is_entity_visible_to_client`` 直接计算一致；背压时钉选实体必须仍走可靠推送
   并附带 ``resync_suggested``。

不需要数据库 / HA / 真实握手：``_ws_cfg_cache`` 预置，``sio.emit`` 被替换为记录器。

用法：``python scripts/_ws_broadcast_smoke.py``（在 homeos/backend 下执行）。
"""

from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.realtime.access import is_entity_allowed
from src.realtime.gateway import RealtimeGateway
from src.realtime.subscription import is_entity_visible_to_client

#: 与 build_gateway 预置的 critical 域保持一致（light/switch/cover/climate/media_player/fan/lock）
HOT_DOMAINS = ("light", "switch", "cover", "climate", "media_player", "fan", "lock")

failures: list[str] = []


def check(label: str, condition: bool, detail: object = "") -> None:
    print(f"  [{'PASS' if condition else 'FAIL'}] {label} {'' if condition else detail}")
    if not condition:
        failures.append(label)


def build_gateway(*, cold_on_demand: bool = False) -> RealtimeGateway:
    app = SimpleNamespace(state=SimpleNamespace())
    gw = RealtimeGateway(app)
    # 预置配置缓存，跳过 _ws_config / _apply_state_config 的数据库读取
    gw._ws_cfg_cache = SimpleNamespace(
        critical_domains=["light", "switch", "cover", "climate", "media_player", "fan", "lock"],
        cold_entity_on_demand=cold_on_demand,
    )
    gw._ws_cfg_at = time.monotonic()
    gw._state_cfg_at = time.monotonic()
    return gw


def add_client(
    gw: RealtimeGateway,
    sid: str,
    *,
    user: dict[str, Any] | None = None,
    domains: Any = None,
    pinned: Any = None,
) -> None:
    session = {"user": user or {"role": "admin"}, "subscribedDomains": domains, "pinnedEntityIds": pinned}
    gw._sessions[sid] = session
    gw.connected.add(sid)
    gw._baseline_ready.add(sid)
    gw._index_subscription(sid, domains, pinned)


def change(entity_id: str, state: str) -> dict[str, Any]:
    old = {"entity_id": entity_id, "state": "off", "attributes": {"a": 1}}
    new = {"entity_id": entity_id, "state": state, "attributes": {"a": 2}}
    return {
        "entity_id": entity_id,
        "old_state": old,
        "new_state": new,
        "changed_at": "2026-10-10T00:00:00.000Z",
    }


def install_emit_recorder(gw: RealtimeGateway) -> tuple[list[tuple[str, dict[str, Any], Any]], list[str]]:
    emitted: list[tuple[str, dict[str, Any], Any]] = []
    get_session_calls: list[str] = []
    saved_sessions: list[str] = []

    async def fake_emit(event: str, data: Any = None, to: Any = None, **_: Any) -> None:
        emitted.append((event, data if isinstance(data, dict) else {}, to))

    async def fake_get_session(sid: str) -> dict[str, Any]:
        get_session_calls.append(sid)
        return gw._sessions.get(sid, {})

    async def fake_save_session(sid: str, session: dict[str, Any]) -> None:
        saved_sessions.append(sid)

    gw.sio.emit = fake_emit  # type: ignore[assignment]
    gw.sio.get_session = fake_get_session  # type: ignore[assignment]
    gw.sio.save_session = fake_save_session  # type: ignore[assignment]
    return emitted, get_session_calls


# ---------------------------------------------------------------- #
# 1. 会话镜像：广播期间不再读引擎会话
# ---------------------------------------------------------------- #

print("1. 会话镜像避免逐 sid get_session")

gw = build_gateway()
emitted, get_session_calls = install_emit_recorder(gw)
# 用非 critical 域（sensor）验证按域收窄：critical 域按设计对全部客户端广播
add_client(gw, "s-admin", domains=None)
add_client(gw, "s-motion", domains=["sensor"])
add_client(gw, "s-power", domains=["sensor.power"])

asyncio.run(gw.broadcast_state_changed_batch([change("sensor.hall", "on")]))

targets = {to for _, _, to in emitted}
check("广播覆盖 wildcard 与 sensor 订阅者", targets == {"s-admin", "s-motion"}, targets)
check("未订阅 sensor 的客户端不被打扰", "s-power" not in targets, targets)
check("广播期间未调用 get_session（镜像命中）", get_session_calls == [], get_session_calls)
check("critical 域（light）按设计广播给全部基线客户端", True)

asyncio.run(gw.broadcast_state_changed_batch([change("light.kitchen", "on")]))
check(
    "critical 域广播覆盖全部基线客户端",
    {to for _, _, to in emitted if to} == {"s-admin", "s-motion", "s-power"},
    {to for _, _, to in emitted},
)
emitted.clear()

# update_subscription 后新订阅立即生效（镜像与引擎同步）
asyncio.run(gw._on_update_subscription("s-power", {"subscribeDomains": ["sensor"]}))
emitted.clear()
asyncio.run(gw.broadcast_state_changed_batch([change("sensor.study", "on")]))
check(
    "update_subscription 后镜像同步生效",
    {to for _, _, to in emitted} == {"s-admin", "s-motion", "s-power"},
    {to for _, _, to in emitted},
)

asyncio.run(gw._on_disconnect("s-power"))
emitted.clear()
asyncio.run(gw.broadcast_state_changed_batch([change("sensor.hall", "on")]))
check("断开后镜像清除（不再推送）", "s-power" not in {to for _, _, to in emitted})

# ---------------------------------------------------------------- #
# 2. 可见性与逐条判定一致（含 ACL 复用）
# ---------------------------------------------------------------- #

print("2. 收窄结果与逐条可见性判定一致")

gw = build_gateway()
emitted, _ = install_emit_recorder(gw)
guest = {"role": "guest"}
child = {"role": "child", "restrictions": ["light.", "switch.coffee"]}
admin = {"role": "admin"}
add_client(gw, "g1", user=guest, domains=None)
add_client(gw, "c1", user=child, domains=None)
add_client(gw, "a1", user=admin, domains=None)
add_client(gw, "c2", user=child, domains=None)  # 同账号第二个连接（ACL 复用场景）

changes = [
    change("light.kitchen", "on"),
    change("climate.ac", "cool"),
    change("switch.coffee", "on"),
]

expected: dict[str, list[str]] = {}
critical_domains = set(HOT_DOMAINS)
for sid in ("g1", "c1", "a1", "c2"):
    session = gw._sessions[sid]
    user = session["user"]
    visible = []
    for item in changes:
        entity_id = item["entity_id"]
        if not is_entity_allowed(entity_id, user):
            continue
        if not is_entity_visible_to_client(entity_id, None, None, critical_domains, False):
            continue
        visible.append(entity_id)
    expected[sid] = visible

asyncio.run(gw.broadcast_state_changed_batch(changes))
actual: dict[str, list[str]] = {}
for event, data, to in emitted:
    if event != "state_changed_batch":
        continue
    actual[str(to)] = [str(row.get("entity_id")) for row in data.get("changes", [])]

for sid in ("g1", "c1", "a1", "c2"):
    check(
        f"{sid} 可见集合与逐条判定一致",
        (actual.get(sid) or []) == expected[sid],
        (actual.get(sid), expected[sid]),
    )

check("guest 收不到任何变更（未产生任何 emit）", actual.get("g1") is None, actual.get("g1"))
check(
    "child 只收到前缀允许的实体",
    actual.get("c1") == ["light.kitchen", "switch.coffee"],
    actual.get("c1"),
)
check("admin 收到全部变更", actual.get("a1") == [c["entity_id"] for c in changes], actual.get("a1"))

# ---------------------------------------------------------------- #
# 3. 钉选实体在背压下仍可靠推送
# ---------------------------------------------------------------- #

print("3. 背压下钉选实体仍可靠送达")

gw = build_gateway(cold_on_demand=True)
emitted, _ = install_emit_recorder(gw)
# 钉选的是非 critical 域实体：未钉选且未订阅 sensor 的客户端不可见
add_client(gw, "p1", domains=["climate"], pinned=["sensor.pinned"])
add_client(gw, "n1", domains=["climate"], pinned=None)
gw._is_socket_backpressured = lambda sid: True  # type: ignore[method-assign]

asyncio.run(gw.broadcast_state_changed_batch([change("sensor.pinned", "on")]))

by_sid: dict[str, list[str]] = {}
for event, _, to in emitted:
    by_sid.setdefault(str(to), []).append(event)

check("背压下钉选客户端仍收到 state_changed_batch", "state_changed_batch" in by_sid.get("p1", []), by_sid)
check("背压下同样下发 resync_suggested", "resync_suggested" in by_sid.get("p1", []), by_sid)
check("非钉选客户端不接收不可见实体", "state_changed_batch" not in by_sid.get("n1", []), by_sid)

# 非背压时钉选同样送达（不回退语义）
gw2 = build_gateway(cold_on_demand=True)
emitted2, _ = install_emit_recorder(gw2)
add_client(gw2, "p2", domains=["climate"], pinned=["sensor.pinned"])
asyncio.run(gw2.broadcast_state_changed_batch([change("sensor.pinned", "on")]))
check(
    "非背压下钉选实体正常下发",
    any(event == "state_changed_batch" and to == "p2" for event, _, to in emitted2),
    emitted2,
)

print()
if failures:
    print(f"WS 广播回归失败：{len(failures)} 项")
    for label in failures:
        print(f"  - {label}")
    sys.exit(1)
print("WS 广播回归全部通过。")
