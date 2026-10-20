#!/usr/bin/env python3
"""把 before/after 的 JSON 汇总成可验收的指标对比。"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from perf_common import PERF_ROOT, result_dir, write_json


def _load(label: str, name: str) -> dict[str, Any] | None:
    path = PERF_ROOT / "results" / label / name
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text("utf-8"))
    except ValueError:
        return None


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _format(value: Any, digits: int = 2) -> str:
    number = _number(value)
    if number is None:
        return "—"
    if abs(number) >= 1000:
        return f"{number:,.0f}"
    return f"{number:,.{digits}f}"


def _pct(before: Any, after: Any) -> float | None:
    first, second = _number(before), _number(after)
    if first is None or second is None or first == 0:
        return None
    return (second - first) / first * 100.0


def _row(label: str, before: Any, after: Any, digits: int = 2,
         unit: str = "", lower_is_better: bool = True) -> str:
    delta = _pct(before, after)
    delta_text = "—" if delta is None else f"{delta:+.2f}%"
    if delta is not None and not lower_is_better:
        delta_text += " (越高越好)"
    return f"| {label} | {_format(before, digits)}{unit} | {_format(after, digits)}{unit} | {delta_text} |"


def _table(title: str, rows: list[str], note: str = "") -> str:
    text = [f"## {title}", "", "| 指标 | before | after | Δ |", "| --- | ---: | ---: | ---: |"]
    text.extend(rows)
    if note:
        text.extend(["", note])
    return "\n".join(text)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--before", required=True)
    parser.add_argument("--after", required=True)
    parser.add_argument("--out", default="")
    args = parser.parse_args()
    before_backend = _load(args.before, "backend.json")
    after_backend = _load(args.after, "backend.json")
    before_frontend = _load(args.before, "frontend.json")
    after_frontend = _load(args.after, "frontend.json")
    before_3d = _load(args.before, "3d.json")
    after_3d = _load(args.after, "3d.json")
    before_bundle = _load(args.before, "bundle.json")
    after_bundle = _load(args.after, "bundle.json")

    sections: list[str] = []
    if before_backend and after_backend:
        before_start = before_backend.get("startup", {})
        after_start = after_backend.get("startup", {})
        rows = [
            _row("HomeOS 启动 wall（含 import）", before_start.get("homeos_wall_ms"), after_start.get("homeos_wall_ms"), unit=" ms"),
            _row("HomeOS 应用内启动", before_start.get("homeos_reported_ms"), after_start.get("homeos_reported_ms"), unit=" ms"),
            _row("Store 启动 wall", before_start.get("store_wall_ms"), after_start.get("store_wall_ms"), unit=" ms"),
        ]
        before_resources = before_backend.get("resources", {})
        after_resources = after_backend.get("resources", {})
        for name, label in (("homeos", "HomeOS"), ("store", "Store")):
            rows.append(_row(f"{label} 测量期 CPU 秒", before_resources.get(name, {}).get("cpu_seconds_delta"),
                             after_resources.get(name, {}).get("cpu_seconds_delta"), unit=" s"))
            rows.append(_row(f"{label} RSS 增量", before_resources.get(name, {}).get("rss_kb_delta"),
                             after_resources.get(name, {}).get("rss_kb_delta"), unit=" KB"))
        before_lag = before_backend.get("app_metrics", {}).get("loop_lag", {})
        after_lag = after_backend.get("app_metrics", {}).get("loop_lag", {})
        rows.append(_row("事件循环 lag p99", before_lag.get("p99"), after_lag.get("p99"), unit=" ms"))
        sections.append(_table("启动与资源", rows))

        for service, title in (("homeos", "HomeOS 接口"), ("store", "Store 接口")):
            before_items = {item["name"]: item for item in before_backend.get("endpoints", {}).get(service, [])}
            after_items = {item["name"]: item for item in after_backend.get("endpoints", {}).get(service, [])}
            rows = []
            for name in before_items:
                first = before_items[name]
                second = after_items.get(name)
                if not second:
                    continue
                rows.append(f"| {name} 串行 p50 | {_format(first['sequential']['p50_ms'])} ms | {_format(second['sequential']['p50_ms'])} ms | "
                            f"{_format(_pct(first['sequential']['p50_ms'], second['sequential']['p50_ms']), 2)}% |")
                rows.append(f"| {name} 串行 p95 | {_format(first['sequential']['p95_ms'])} ms | {_format(second['sequential']['p95_ms'])} ms | "
                            f"{_format(_pct(first['sequential']['p95_ms'], second['sequential']['p95_ms']), 2)}% |")
                rows.append(f"| {name} 200并发 p95 | {_format(first['concurrent']['p95_ms'])} ms | {_format(second['concurrent']['p95_ms'])} ms | "
                            f"{_format(_pct(first['concurrent']['p95_ms'], second['concurrent']['p95_ms']), 2)}% |")
                rows.append(f"| {name} 200并发 RPS | {_format(first['concurrent']['rps'])} | {_format(second['concurrent']['rps'])} | "
                            f"{_format(_pct(first['concurrent']['rps'], second['concurrent']['rps']), 2)}% |")
                db_first = (first.get("db_per_request") or {}).get("total")
                db_second = (second.get("db_per_request") or {}).get("total")
                if db_first is not None or db_second is not None:
                    rows.append(f"| {name} DB 查询/请求 | {_format(db_first, 2)} | {_format(db_second, 2)} | "
                                f"{_format(_pct(db_first, db_second), 2)}% |")
            sections.append(_table(title, rows, "串行 100 次、200 并发/32 worker；DB 为 100 次串行请求的 select/write/other 总量差。"))
    if before_frontend and after_frontend:
        before_routes = {route["name"]: route for route in before_frontend.get("routes", [])}
        after_routes = {route["name"]: route for route in after_frontend.get("routes", [])}
        rows = []
        for name in before_routes:
            first = before_routes[name].get("cold") or {}
            second = (after_routes.get(name) or {}).get("cold") or {}
            rows.append(f"| {name} LCP | {_format(first.get('lcp'))} ms | {_format(second.get('lcp'))} ms | "
                        f"{_format(_pct(first.get('lcp'), second.get('lcp')), 2)}% |")
            rows.append(f"| {name} CLS | {_format(first.get('cls'), 4)} | {_format(second.get('cls'), 4)} | "
                        f"{_format(_pct(first.get('cls'), second.get('cls')), 2)}% |")
            rows.append(f"| {name} long task 总时长 | {_format((first.get('longtasks') or {}).get('total'))} ms | "
                        f"{_format((second.get('longtasks') or {}).get('total'))} ms | "
                        f"{_format(_pct((first.get('longtasks') or {}).get('total'), (second.get('longtasks') or {}).get('total')), 2)}% |")
            rows.append(f"| {name} Event Timing p95 | {_format((first.get('events') or {}).get('p95'))} ms | "
                        f"{_format((second.get('events') or {}).get('p95'))} ms | "
                        f"{_format(_pct((first.get('events') or {}).get('p95'), (second.get('events') or {}).get('p95')), 2)}% |")
            rows.append(f"| {name} 冷开网络字节 | {_format((first.get('network') or {}).get('cdpEncodedBytes'))} B | "
                        f"{_format((second.get('network') or {}).get('cdpEncodedBytes'))} B | "
                        f"{_format(_pct((first.get('network') or {}).get('cdpEncodedBytes'), (second.get('network') or {}).get('cdpEncodedBytes')), 2)}% |")
            first_warm = before_routes[name].get("warm") or {}
            second_warm = (after_routes.get(name) or {}).get("warm") or {}
            rows.append(f"| {name} 暖导航网络字节 | {_format((first_warm.get('network') or {}).get('cdpEncodedBytes'))} B | "
                        f"{_format((second_warm.get('network') or {}).get('cdpEncodedBytes'))} B | "
                        f"{_format(_pct((first_warm.get('network') or {}).get('cdpEncodedBytes'), (second_warm.get('network') or {}).get('cdpEncodedBytes')), 2)}% |")
        sections.append(_table("前端（1440×900，Edge，实验室）", rows,
                               "LCP/CLS/Event Timing 为实验室代理；INP 真机 p75 仍待补。"))
    if before_3d and after_3d:
        first = before_3d.get("summary") or {}
        second = after_3d.get("summary") or {}
        rows = [
            _row("stage ready", before_3d.get("readyMs"), after_3d.get("readyMs"), unit=" ms"),
            _row("交互平均 FPS", first.get("averageFps"), second.get("averageFps"), lower_is_better=False),
            _row("交互帧 p95", first.get("frameP95Ms"), second.get("frameP95Ms"), unit=" ms"),
            _row("CPU 提交均值", first.get("cpuRenderAvgMs"), second.get("cpuRenderAvgMs"), unit=" ms"),
            _row("draw calls", first.get("renderCalls"), second.get("renderCalls")),
            _row("triangles", first.get("triangles"), second.get("triangles")),
            _row("geometries", first.get("geometries"), second.get("geometries")),
            _row("textures", first.get("textures"), second.get("textures")),
            _row("3D 网络字节", (before_3d.get("network") or {}).get("encodedBytes"),
                 (after_3d.get("network") or {}).get("encodedBytes"), unit=" B"),
        ]
        sections.append(_table("3D 交互渲染（直接打开 stage.html，单实例）", rows,
                               "FPS/帧 p95 只在拖拽交互后采样；contextlost 必须为 0。"))
    if before_bundle and after_bundle:
        first_metrics = before_bundle.get("metrics") or {}
        second_metrics = after_bundle.get("metrics") or {}
        rows = [
            _row("index.html", first_metrics.get("indexHtmlBytes"), second_metrics.get("indexHtmlBytes"), unit=" B"),
            _row("首屏 preload raw", first_metrics.get("preloadRawBytes"), second_metrics.get("preloadRawBytes"), unit=" B"),
            _row("首屏 preload gzip", first_metrics.get("preloadGzipBytes"), second_metrics.get("preloadGzipBytes"), unit=" B"),
            _row("入口 JS", first_metrics.get("entryJsBytes"), second_metrics.get("entryJsBytes"), unit=" B"),
            _row("首屏 CSS raw", first_metrics.get("appCssRawBytes"), second_metrics.get("appCssRawBytes"), unit=" B"),
            _row("首屏 CSS gzip", first_metrics.get("appCssGzipBytes"), second_metrics.get("appCssGzipBytes"), unit=" B"),
            _row("runtime chunk 数", first_metrics.get("runtimeChunkCount"), second_metrics.get("runtimeChunkCount")),
            _row("runtime raw", first_metrics.get("runtimeRawBytes"), second_metrics.get("runtimeRawBytes"), unit=" B"),
        ]
        sections.append(_table("构建产物体积（check_bundle_budget 口径）", rows))

    header = [
        f"# 优化前后指标对比：{args.before} → {args.after}",
        "",
        f"生成时间：{__import__('datetime').datetime.now().isoformat(timespec='seconds')}",
        "",
        "测量方式：隔离实例（18801/18802）、独立数据副本、固定 token；后端使用同一台机器上的串行/并发探针，"
        "前端使用 Microsoft Edge + Playwright 固定视口，3D 直接打开 stage.html 并读取页面自带 performance-diagnostics。"
        "真机数据不在此表中，不得用实验室数字冒充。",
        "",
    ]
    markdown = "\n".join(header + sections) + "\n"
    output = Path(args.out) if args.out else result_dir(args.after) / "compare.md"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(markdown, "utf-8")
    write_json(output.with_suffix(".json"), {
        "before": args.before,
        "after": args.after,
        "generatedAt": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "sections": sections,
    })
    print(markdown)
    print(f"对比报告：{output}")


if __name__ == "__main__":
    main()
