#!/usr/bin/env python3
"""Phase 0.5 行为基线：把「模式 / 解绑 / 安防 / 实时链路」里可自动观测的部分落盘。

设计原则：

1. **只读**。只发 GET 与 sqlite ``mode=ro`` 查询；布防、切模式、解绑这些动作由人工在 UI
   上点，脚本只负责「点之前 / 点之后各存一份快照」，用来对比。
2. **可复跑**。同一个 label 跑两遍会覆盖同名文件，diff 两份目录即可看出人工操作带来的变化。
3. **不猜结论**。脚本只把事实写进 ``*.json`` 并在终端打印一行摘要；判定（是否回归）由
   人对着 ``ops/perf/manual-baseline.md`` 的表格填。

采集内容：

- ``modes.json``：``GET /api/v1/modes`` 原始列表 + 按互斥组聚合的激活态（P1-1 的对账口径）。
- ``modes-active.json``：``GET /api/v1/modes/active``（顶层 spread + ``activeMode`` + ``activeModes``）。
- ``modes-context.json`` / ``modes-trigger-logs.json``：模式上下文与最近触发日志。
- ``db-modes.json``：``home_modes`` 各行的 ``isActive`` / ``exclusiveGroup`` / 快照是否存在，
  以及配置与触发器里引用 ``entityId`` 的悬空/空串统计（P0-1、P0-2 的回归指示器）。
- ``security-panel.json``：``GET /api/v1/security-panel/status``（P0-5 布防补偿的观测面）。
- ``security-presence.json``：``GET /api/v1/security/presence/summary``（P1-5）。
- ``ws-baseline.json``：新连接一次全量基线的下行分帧（字节数、帧数、chunk 数、就绪耗时），
  P1-P2「按需回放 + 分桶序列化」的前后对比就靠它。

用法：

    # 用隔离 harness 的环境（recommended：不碰生产 8801）
    .venv-store/bin/python ops/perf/harness/capture_behavior.py --label before

    # 或者直接打本机 dev server
    .venv-store/bin/python ops/perf/harness/capture_behavior.py \\
        --base-url http://127.0.0.1:8801 --cookie <auth_token> --label dev

    # 不给 --cookie 时只采集匿名可见的部分（其余端点会 401，脚本如实记录）
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any, cast

sys.path.insert(0, str(Path(__file__).resolve().parent))

from perf_common import PERF_ROOT, ROOT, json_get, result_dir, write_json

DEFAULT_BASE_URL = "http://127.0.0.1:8801"
DEFAULT_DB = ROOT / "homeos" / "data" / "homeos.db"


def _entity_refs(payload: Any) -> list[str]:
    """收集模式 config/triggers 里出现的所有 ``entityId``（含空串）。"""
    refs: list[str] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                if key == "entityId" and isinstance(value, str):
                    refs.append(value)
                else:
                    walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(payload)
    return refs


def _load_json_column(raw: Any) -> Any:
    if not raw:
        return None
    if isinstance(raw, (list, dict)):
        return raw
    try:
        return json.loads(raw)
    except TypeError, ValueError:
        return None


def capture_db(db_path: Path) -> dict[str, Any]:
    """只读打开 SQLite，取模式激活态与 entityId 引用质量。"""
    if not db_path.is_file():
        return {"ok": False, "error": f"数据库不存在：{db_path}"}
    uri = f"file:{db_path}?mode=ro"
    try:
        con = sqlite3.connect(uri, uri=True, timeout=5)
        con.row_factory = sqlite3.Row
        try:
            rows = con.execute(
                'SELECT id, name, "isActive", "exclusiveGroup", "priority", '
                '"deviceSnapshot", config, triggers FROM home_modes'
            ).fetchall()
            entity_ids = {row[0] for row in con.execute("SELECT entity_id FROM ha_entities").fetchall() if row[0]}
        finally:
            con.close()
    except sqlite3.Error as error:
        return {"ok": False, "error": f"{type(error).__name__}: {error}"}

    modes: list[dict[str, Any]] = []
    all_refs: list[str] = []
    empty_refs: list[dict[str, str]] = []
    dangling_refs: list[dict[str, str]] = []
    for row in rows:
        config = _load_json_column(row["config"])
        triggers = _load_json_column(row["triggers"])
        refs = _entity_refs(config) + _entity_refs(triggers)
        all_refs.extend(refs)
        for ref in refs:
            if not ref:
                empty_refs.append({"mode": row["name"], "modeId": row["id"]})
            elif ref not in entity_ids:
                dangling_refs.append({"mode": row["name"], "modeId": row["id"], "entityId": ref})
        modes.append(
            {
                "id": row["id"],
                "name": row["name"],
                "isActive": bool(row["isActive"]),
                "exclusiveGroup": row["exclusiveGroup"],
                "priority": row["priority"],
                "hasDeviceSnapshot": bool(row["deviceSnapshot"]),
                "deviceSnapshotBytes": len(row["deviceSnapshot"] or ""),
                "configItems": len(config) if isinstance(config, list) else 0,
                "triggerCount": len(triggers) if isinstance(triggers, list) else 0,
                "entityRefs": len(refs),
            }
        )
    active_by_group: dict[str, list[str]] = {}
    for mode in modes:
        if mode["isActive"]:
            active_by_group.setdefault(str(mode["exclusiveGroup"]), []).append(mode["name"])
    return {
        "ok": True,
        "db": str(db_path),
        "haEntityCount": len(entity_ids),
        "modes": modes,
        "activeByGroup": active_by_group,
        "groupViolations": {group: names for group, names in active_by_group.items() if len(names) > 1},
        "entityRefCount": len(all_refs),
        "emptyEntityRefs": empty_refs,
        "danglingEntityRefs": dangling_refs,
    }


def summarize_modes(payload: Any) -> dict[str, Any]:
    modes = payload if isinstance(payload, list) else []
    by_group: dict[str, list[str]] = {}
    for mode in modes:
        if isinstance(mode, dict) and mode.get("isActive"):
            key = str(mode.get("exclusiveGroup") or "default")
            by_group.setdefault(key, []).append(str(mode.get("name") or mode.get("id")))
    return {
        "total": len(modes),
        "activeTotal": sum(len(names) for names in by_group.values()),
        "activeByGroup": by_group,
        "groupViolations": {g: n for g, n in by_group.items() if len(n) > 1},
    }


async def capture_ws(base_url: str, cookie: str, timeout: float, window: float = 3.0) -> dict[str, Any]:
    """建立一次 socket.io(EIO=4 + msgpack) 连接，量取全量基线的下行分帧。

    协议细节（照抄 socket.io-client 的 msgpack 序列化，别用文本 ``40``）：

    - 客户端发出的是**裸 msgpack**（不带 engine.io 的 ``4`` 前缀）:
      ``{"type": 0, "nsp": "/"}``；
    - 服务端每个下行帧也是 msgpack dict，``type=2`` 时 ``data=[事件名, 负载]``；
    - 全量基线要么单帧 ``initial_states``，要么 ``initial_states_begin`` + N×
      ``initial_states_chunk`` + ``initial_states_end`` —— 后者就是 P1-P2 的分帧口径。
    """
    try:
        import msgpack
        from websockets.asyncio.client import connect  # type: ignore[import-not-found]
    except ModuleNotFoundError as error:
        return {"ok": False, "error": f"缺少依赖（.venv-store 应有 websockets/msgpack）：{error}"}

    ws_url = base_url.replace("https://", "wss://").replace("http://", "ws://")
    url = f"{ws_url}/socket.io/?EIO=4&transport=websocket"
    headers = {"Origin": base_url}
    if cookie:
        headers["Cookie"] = f"auth_token={cookie}"

    started = asyncio.get_running_loop().time()
    stats: dict[str, Any] = {
        "ok": False,
        "url": url,
        "authenticated": bool(cookie),
        "frames": 0,
        "bytes": 0,
        "events": {},
        "eventBytes": {},
        "baselineFrames": 0,
        "baselineBytes": 0,
        "baselineEntityCount": 0,
        "steadyFrames": 0,
        "steadyBytes": 0,
        "steadyWindowSeconds": window,
        "open_ms": 0.0,
        "first_payload_ms": 0.0,
        "baseline_ready_ms": 0.0,
        "connected": False,
        "refused": "",
    }

    def note(event: str, raw: bytes) -> None:
        stats["frames"] += 1
        stats["bytes"] += len(raw)
        stats["events"][event] = stats["events"].get(event, 0) + 1
        stats["eventBytes"][event] = stats["eventBytes"].get(event, 0) + len(raw)

    try:
        async with connect(
            url,
            additional_headers=headers,
            max_size=None,
            open_timeout=5,
            close_timeout=2,
        ) as ws:
            open_packet = await asyncio.wait_for(ws.recv(), timeout=5)
            stats["open_ms"] = round((asyncio.get_running_loop().time() - started) * 1000.0, 1)
            stats["bytes"] += len(str(open_packet).encode("utf-8"))
            # ``msgpack.dumps`` 在包里是 ``dumps = packb`` 的别名，真正的实现是编译扩展
            # ``_cmsgpack``（无 pyi），静态分析只能看到 ``Unknown | None``。运行期它恒定返回
            # bytes，这里用 cast 把「编译器不知道」这层信息补上，避免 ``ws.send`` 的参数告警。
            await ws.send(cast(bytes, msgpack.dumps({"type": 0, "nsp": "/"})))
            baseline_ready_at: float | None = None
            deadline = asyncio.get_running_loop().time() + timeout
            while asyncio.get_running_loop().time() < deadline:
                remaining = max(0.1, deadline - asyncio.get_running_loop().time())
                try:
                    message = await asyncio.wait_for(ws.recv(), timeout=remaining)
                except TimeoutError:
                    break
                now = asyncio.get_running_loop().time()
                if isinstance(message, str):
                    if message == "2":  # engine.io ping
                        await ws.send("3")
                        continue
                    if message.startswith("44"):  # socket.io connect_error
                        stats["refused"] = message[:200]
                        break
                    continue
                raw = message
                try:
                    packet = msgpack.loads(raw)
                except Exception:
                    stats["bytes"] += len(raw)
                    continue
                # socket.io 的 msgpack 帧恒为 dict（``type`` / ``nsp`` / ``data``）。真正的
                # ``unpackb`` 来自编译扩展 ``_cmsgpack``，静态分析只能看到一个解码后的标量
                # 类型（基于类型库的桩把 ``loads`` 收窄成 ``int``），这里用 isinstance 而不是
                # cast：既能消掉告警，也顺手挡掉非 dict 帧（二进制附件等），不让它崩在 .get 上。
                if not isinstance(packet, dict):
                    stats["bytes"] += len(raw)
                    continue
                packet_type = packet.get("type")
                if packet_type == 0:  # CONNECT ack（服务端确认会话）
                    stats["connected"] = True
                    stats["bytes"] += len(raw)
                    continue
                data = packet.get("data")
                event = data[0] if isinstance(data, list) and data else f"type{packet_type}"
                note(str(event), raw)
                if stats["first_payload_ms"] == 0.0:
                    stats["first_payload_ms"] = round((now - started) * 1000.0, 1)
                if baseline_ready_at is None and event in {"initial_states", "initial_states_end"}:
                    baseline_ready_at = now
                    stats["baseline_ready_ms"] = round((now - started) * 1000.0, 1)
                    stats["baselineFrames"] = stats["frames"]
                    stats["baselineBytes"] = stats["bytes"]
                    payload = data[1] if isinstance(data, list) and len(data) > 1 else {}
                    if isinstance(payload, dict):
                        stats["baselineEntityCount"] = int(payload.get("count") or 0)
                    if event == "initial_states_end":
                        continue
                    # 单帧全量：首帧即基线，直接进稳态窗口。
                if baseline_ready_at is not None:
                    if window <= 0 or now - baseline_ready_at >= window:
                        break
                    stats["steadyFrames"] += 1
                    stats["steadyBytes"] += len(raw)
        stats["ok"] = stats["baselineFrames"] > 0
    except Exception as error:
        stats["error"] = f"{type(error).__name__}: {error}"
    if not stats["ok"] and not stats.get("error"):
        stats["error"] = "连接未在超时内收到全量基线帧"
    if not stats["ok"] and stats["frames"] > 0:
        stats["error"] = "收到了帧但没有识别出全量基线（可能被拒/仅增量）"
    return stats


def _print_summary(report: dict[str, Any]) -> None:
    modes = report.get("modes", {})
    db = report.get("db", {})
    ws = report.get("ws", {})
    print(
        f"[behavior] modes: total={modes.get('total')} active={modes.get('activeTotal')} "
        f"groups={modes.get('activeByGroup')} violations={modes.get('groupViolations')}"
    )
    if db.get("ok"):
        print(
            f"[behavior] db: modes={len(db.get('modes', []))} "
            f"activeByGroup={db.get('activeByGroup')} "
            f"emptyRefs={len(db.get('emptyEntityRefs', []))} "
            f"danglingRefs={len(db.get('danglingEntityRefs', []))}"
        )
    else:
        print(f"[behavior] db: skipped ({db.get('error')})")
    if ws.get("ok"):
        print(
            f"[behavior] ws: frames={ws['frames']} bytes={ws['bytes']} "
            f"baseline={ws['baselineFrames']}帧/{ws['baselineBytes']}B "
            f"entities={ws['baselineEntityCount']} "
            f"chunks={ws['events'].get('initial_states_chunk', 0)} "
            f"ready={ws['baseline_ready_ms']}ms "
            f"steady={ws['steadyFrames']}帧/{ws['steadyBytes']}B/{ws['steadyWindowSeconds']}s"
        )
    else:
        print(f"[behavior] ws: not measured ({ws.get('error') or ws.get('refused')})")
    print(f"[behavior] 输出目录: {report.get('outDir')}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Phase 0.5 行为基线采集（只读）")
    parser.add_argument("--label", default="before", help="结果目录名，默认 before")
    parser.add_argument("--base-url", default="", help=f"默认读 harness 环境，否则 {DEFAULT_BASE_URL}")
    parser.add_argument("--cookie", default="", help="auth_token 值（隔离环境可留空自动读取）")
    parser.add_argument("--db", default="", help=f"SQLite 路径，默认 {DEFAULT_DB}")
    parser.add_argument("--out", default="", help="输出目录，默认 $PERF_ROOT/results/<label>/behavior")
    parser.add_argument("--ws-timeout", type=float, default=30.0)
    parser.add_argument(
        "--ws-window",
        type=float,
        default=3.0,
        help="全量基线之后继续收多少秒的增量（0 = 收完基线就断开）",
    )
    parser.add_argument("--skip-ws", action="store_true")
    parser.add_argument("--skip-db", action="store_true")
    args = parser.parse_args(argv)

    base_url = args.base_url
    cookie = args.cookie
    db_path = Path(args.db) if args.db else DEFAULT_DB
    if not base_url:
        env_file = PERF_ROOT / "env" / args.label / "env.json"
        if env_file.is_file():
            env_data = json.loads(env_file.read_text("utf-8"))
            base_url = f"http://127.0.0.1:{env_data['homeos']['port']}"
            cookie = cookie or str(env_data["homeos"].get("token") or "")
            data_dir = env_data["homeos"].get("dataDir")
            if data_dir:
                db_path = Path(data_dir) / "homeos.db"
        else:
            base_url = DEFAULT_BASE_URL
    base_url = base_url.rstrip("/")

    out_dir = Path(args.out) if args.out else result_dir(args.label) / "behavior"
    out_dir.mkdir(parents=True, exist_ok=True)

    endpoints = {
        "modes.json": "/api/v1/modes",
        "modes-active.json": "/api/v1/modes/active",
        "modes-context.json": "/api/v1/modes/context",
        "modes-trigger-logs.json": "/api/v1/modes/trigger-logs",
        "security-panel.json": "/api/v1/security-panel/status",
        "security-presence.json": "/api/v1/security/presence/summary",
        "health-ready.json": "/health/ready",
    }
    responses: dict[str, dict[str, Any]] = {}
    for filename, path in endpoints.items():
        result = json_get(base_url + path, cookie=cookie, timeout=20)
        responses[filename] = {
            "path": path,
            "status": result["status"],
            "ok": result["ok"],
            "elapsed_ms": round(result["elapsed_ms"], 1),
            "bytes": result["bytes"],
            "error": result["error"],
        }
        write_json(
            out_dir / filename,
            result["json"]
            if result["json"] is not None
            else {
                "status": result["status"],
                "error": result["error"],
                "body": result["body"][:2000].decode("utf-8", "replace"),
            },
        )

    report: dict[str, Any] = {
        "outDir": str(out_dir),
        "baseUrl": base_url,
        "authenticated": bool(cookie),
        "endpoints": responses,
        "modes": summarize_modes(
            json.loads((out_dir / "modes.json").read_text("utf-8")) if responses["modes.json"]["ok"] else []
        ),
    }
    active_payload = (
        json.loads((out_dir / "modes-active.json").read_text("utf-8")) if responses["modes-active.json"]["ok"] else None
    )
    report["activeResponse"] = {
        "hasActiveMode": bool(isinstance(active_payload, dict) and active_payload.get("activeMode")),
        "activeModesCount": len(active_payload.get("activeModes") or []) if isinstance(active_payload, dict) else 0,
    }
    report["db"] = {"ok": False, "error": "skipped"} if args.skip_db else capture_db(db_path)
    if args.skip_ws:
        report["ws"] = {"ok": False, "error": "skipped"}
    else:
        report["ws"] = asyncio.run(capture_ws(base_url, cookie, args.ws_timeout, window=args.ws_window))

    # 单独落盘，方便两次采集直接 diff 这两个文件（清单里按名字引用）。
    write_json(out_dir / "db-modes.json", report["db"])
    write_json(out_dir / "ws-baseline.json", report["ws"])
    write_json(out_dir / "summary.json", report)
    _print_summary(report)

    failed = [name for name, item in responses.items() if not item["ok"]]
    if failed:
        print(f"[behavior] 未采集成功（按 401/超时对照）: {', '.join(failed)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
