#!/usr/bin/env python3
"""JSON 序列化基准：三条候选路径的耗时与字节数。

对比的是**同一条响应**在三种实现下的成本：

- ``fastapi``：``JSONResponse(payload).body`` —— 即今天所有 ``return dict`` 路由走的标准库
  ``json.dumps``（``ensure_ascii=False``、紧凑分隔符）；
- ``encoder``：再叠一层 ``fastapi.encoders.jsonable_encoder`` —— 普通 dict 返回值的真实路径；
- ``orjson``：``orjson.dumps(payload)`` + 一个只包 ``Response`` 的 helper（引入 orjson 后的目标
  形态）。

另测 ``canonical``（``sort_keys=True``）保留路径：``projects.serialize_document`` 与
``stage_delivery`` 的稳定哈希依赖它，orjson 没有 ``sort_keys``，这条必须继续用标准库。

``orjson`` 缺失时该候选自动跳过（结果里 ``available: false``）—— 基准本身不强制安装它。

用法：
    node ops/lib/py.mjs ops/bench/bench_json.py
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Callable
from typing import Any

from _support import entity_rows, layout_document, measure, report, scene_command, timing_summary
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

try:  # 允许在未安装 orjson 的环境中跑（引入依赖前先量基线）
    import orjson
except ImportError:  # pragma: no cover - 取决于环境
    orjson = None  # type: ignore[assignment]


def _canonical_bytes(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def fixtures() -> dict[str, Any]:
    return {
        # 设置页一屏的布局文档（~400 个控件）
        "ui-config": layout_document(400),
        # 3D 场景命令（几十到几百 KB）
        "scene": scene_command(300),
        # 设备列表一页（默认 200 行）
        "entities": {"items": entity_rows(200), "total": 200, "limit": 200, "offset": 0},
    }


def _candidates() -> dict[str, Callable[[Any], bytes]]:
    candidates: dict[str, Callable[[Any], bytes]] = {
        "fastapi": lambda payload: bytes(JSONResponse(payload).body),
        "encoder": lambda payload: bytes(JSONResponse(jsonable_encoder(payload)).body),
        "canonical": _canonical_bytes,
    }
    if orjson is not None:
        candidates["orjson"] = orjson.dumps
    return candidates


def run(iterations: int) -> dict[str, Any]:
    candidates = _candidates()
    results: dict[str, Any] = {"orjson_available": orjson is not None, "cases": {}}
    for name, payload in fixtures().items():
        case: dict[str, Any] = {}
        for candidate_name, encode in candidates.items():
            # 默认参数绑定循环变量：闭包直接引用会在下一轮拿到别的 payload/encode。
            samples = measure(lambda enc=encode, pl=payload: enc(pl), iterations)
            payload_bytes = len(encode(payload))
            case[candidate_name] = {
                "bytes": payload_bytes,
                "latency_ms": timing_summary(samples),
                "mb_per_second": round(
                    (payload_bytes / (1024 * 1024)) / (max(sum(samples) / len(samples), 1e-9) / 1000.0), 2
                ),
            }
        results["cases"][name] = case
    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="JSON 序列化基准")
    parser.add_argument("--iterations", type=int, default=20)
    args = parser.parse_args(argv)
    report("json", run(args.iterations))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
