#!/usr/bin/env python3
"""后端端点基线采集：顺序 p50/p95/p99、并发 p95、RPS、响应字节、每条 SQL 数。

为什么需要它
------------
`docs/perf/2026-11-01-dual-project-performance.md` 里的后端数字（draft 并发 p95 113.8ms、
RPS 247、4.01 次 SQL/请求）全部来自本脚本的历史版本，而该脚本曾随 `ops/perf` 一起被删掉。
没有它，后续任何后端改动都只能"看着像快了"——这正是本轮先把它恢复出来的原因。

口径
----
- **顺序**：单连接依次发 N 次，得到 p50/p95/p99 与 RPS（上限由单请求延迟决定）；
- **并发**：C 个线程各发 N/C 次，得到排队后的 p50/p95（这才是用户能感知的尾延迟）；
- **SQL 数**：读一次 `/metrics` 的 `homeos_db_queries_total` 前后差值 ÷ 请求数。拿不到
  /metrics（未开鉴权 / 路径被关）时写 `null`，不伪造 0。

用法
----
```bash
# 最常用：两个默认端点 + 一个需要登录的端点
.venv-store/bin/python ops/perf/harness/bench_backend.py \
    --base-url http://127.0.0.1:18801 --label before \
    --endpoint /health/ready=health \
    --endpoint /api/v1/public/config=public-config \
    --endpoint /api/v1/projects=projects \
    --cookie "auth_token=<jwt>"

# 只看并发尾延迟
... --concurrency 32 --sequential 0
```
结果写到 `ops/perf/results/<label>/bench_backend.json`（`--out` 可覆盖）。
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import httpx
except ModuleNotFoundError:  # pragma: no cover - 环境缺失时给出可操作提示
    sys.exit("缺少 httpx：用仓库 venv 运行（node ops/lib/py.mjs ops/perf/harness/bench_backend.py …）")

REPO_ROOT = Path(__file__).resolve().parents[3]


def percentile(values: list[float], ratio: float) -> float:
    """线性插值分位（与历史报告同一实现，避免"换了算法导致数字不可比"）。

    `statistics.quantiles` 在小样本上会抛 StatisticsError，而 5 次采样恰恰是最常见的
    调试规模；这里自己算，样本数 1 时直接返回该值。
    """
    if not values:
        return 0.0
    if len(values) == 1:
        return float(values[0])
    ordered = sorted(values)
    position = (len(ordered) - 1) * ratio
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return float(ordered[lower])
    weight = position - lower
    return float(ordered[lower] * (1 - weight) + ordered[upper] * weight)


def read_db_query_counts(client: httpx.Client, base_url: str) -> dict[str, float] | None:
    """读一次 /metrics 里的 SQL 计数；不可用返回 None（不要当成 0）。"""
    try:
        response = client.get(f"{base_url}/metrics", timeout=5.0)
    except httpx.HTTPError:
        return None
    if response.status_code != 200:
        return None
    counts: dict[str, float] = {}
    for line in response.text.splitlines():
        if not line.startswith("homeos_db_queries_total{"):
            continue
        kind = line.split('kind="', 1)[-1].split('"', 1)[0]
        try:
            counts[kind] = float(line.rsplit(" ", 1)[-1])
        except ValueError:
            continue
    return counts or None


def total_statements(counts: dict[str, float] | None) -> float | None:
    if counts is None:
        return None
    return sum(counts.values())


@dataclass
class Sample:
    """单次请求的可观测结果。"""

    elapsed_ms: float
    status: int
    body_bytes: int


@dataclass
class EndpointResult:
    name: str
    path: str
    sequential: list[Sample] = field(default_factory=list)
    concurrent: list[Sample] = field(default_factory=list)
    db_statements_per_request: float | None = None
    error_statuses: dict[str, int] = field(default_factory=dict)

    def _summary(self, samples: list[Sample], wall_seconds: float) -> dict[str, Any]:
        latencies = [sample.elapsed_ms for sample in samples]
        if not latencies:
            return {"count": 0}
        body = [sample.body_bytes for sample in samples]
        return {
            "count": len(latencies),
            "p50_ms": round(percentile(latencies, 0.50), 3),
            "p95_ms": round(percentile(latencies, 0.95), 3),
            "p99_ms": round(percentile(latencies, 0.99), 3),
            "max_ms": round(max(latencies), 3),
            "mean_ms": round(statistics.fmean(latencies), 3),
            "rps": round(len(latencies) / wall_seconds, 1) if wall_seconds > 0 else 0.0,
            "body_bytes_mean": round(statistics.fmean(body)) if body else 0,
        }

    def payload(self, sequential_wall: float, concurrent_wall: float) -> dict[str, Any]:
        return {
            "name": self.name,
            "path": self.path,
            "sequential": self._summary(self.sequential, sequential_wall),
            "concurrent": {
                **self._summary(self.concurrent, concurrent_wall),
                "db_statements_per_request": (
                    round(self.db_statements_per_request, 2) if self.db_statements_per_request is not None else None
                ),
            },
            "non_2xx": self.error_statuses,
        }


def run_sequential(
    client: httpx.Client, base_url: str, path: str, count: int, headers: dict[str, str]
) -> tuple[list[Sample], float]:
    samples: list[Sample] = []
    for _ in range(count):
        started = time.perf_counter()
        try:
            response = client.get(f"{base_url}{path}", headers=headers)
            elapsed = (time.perf_counter() - started) * 1000
            samples.append(Sample(elapsed, response.status_code, len(response.content)))
        except httpx.HTTPError:
            samples.append(Sample((time.perf_counter() - started) * 1000, 0, 0))
    return samples, 0.0


def run_concurrent(
    base_url: str, path: str, total: int, concurrency: int, headers: dict[str, str], cookie: str
) -> tuple[list[Sample], float]:
    """多线程打同一个端点。每个线程一条连接，避免连接池上限把并发压成串行。"""
    samples: list[Sample] = []
    lock = threading.Lock()

    def worker(rounds: int) -> None:
        # httpx.Client 不是线程安全的共享对象：每线程一个，连接复用只发生在同一线程内。
        local_headers = dict(headers)
        if cookie:
            local_headers["Cookie"] = cookie
        with httpx.Client(timeout=30.0) as client:
            for _ in range(rounds):
                started = time.perf_counter()
                try:
                    response = client.get(f"{base_url}{path}", headers=local_headers)
                    elapsed = (time.perf_counter() - started) * 1000
                    item = Sample(elapsed, response.status_code, len(response.content))
                except httpx.HTTPError:
                    item = Sample((time.perf_counter() - started) * 1000, 0, 0)
                with lock:
                    samples.append(item)

    per_thread = max(1, total // max(1, concurrency))
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        list(pool.map(worker, [per_thread] * concurrency))
    return samples, time.perf_counter() - started


def parse_endpoint(raw: str) -> tuple[str, str]:
    """`/api/v1/projects=projects` → (path, name)；只给路径时用路径当名字。"""
    if "=" in raw:
        path, name = raw.split("=", 1)
        return path.strip(), name.strip() or path.strip()
    return raw.strip(), raw.strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="HomeOS 后端端点基线采集")
    parser.add_argument("--base-url", default="http://127.0.0.1:18801")
    parser.add_argument("--label", default="latest", help="结果子目录名（before / after-1101 …）")
    parser.add_argument("--out", default="", help="结果文件路径；留空用 ops/perf/results/<label>/")
    parser.add_argument(
        "--endpoint",
        action="append",
        default=[],
        metavar="PATH[=NAME]",
        help="要测的端点，可重复",
    )
    parser.add_argument("--cookie", default="", help="登录 Cookie（形如 auth_token=…）")
    parser.add_argument("--warmup", type=int, default=20)
    parser.add_argument("--sequential", type=int, default=100)
    parser.add_argument("--concurrency-total", type=int, default=200)
    parser.add_argument("--concurrency", type=int, default=32)
    args = parser.parse_args()

    endpoints = [parse_endpoint(raw) for raw in args.endpoint] or [parse_endpoint("/health/ready=health")]
    headers = {"Accept-Encoding": "gzip, zstd"}
    if args.cookie:
        headers["Cookie"] = args.cookie

    # 预热也走真实请求：首个请求要付 import / 连接 / 页面缓存冷启动，留在正式采样里
    # 会把 p99 拉成"冷启动耗时"，与稳态尾延迟混为一谈。
    readiness = httpx.Client(timeout=30.0)
    for path, _name in endpoints:
        try:
            readiness.get(f"{args.base_url}{path}", headers=headers)
        except httpx.HTTPError as error:
            print(f"警告：预热失败 {path}: {error}", file=sys.stderr)
    readiness.close()

    results: list[dict[str, Any]] = []
    console = httpx.Client(timeout=30.0)
    for path, name in endpoints:
        result = EndpointResult(name=name, path=path)
        for _ in range(max(0, args.warmup)):
            try:
                console.get(f"{args.base_url}{path}", headers=headers)
            except httpx.HTTPError:
                break

        before = read_db_query_counts(console, args.base_url)
        seq_wall_start = time.perf_counter()
        result.sequential, _ = run_sequential(console, args.base_url, path, max(0, args.sequential), headers)
        seq_wall = time.perf_counter() - seq_wall_start
        after_seq = read_db_query_counts(console, args.base_url)

        result.concurrent, conc_wall = run_concurrent(
            args.base_url,
            path,
            max(0, args.concurrency_total),
            max(1, args.concurrency),
            headers,
            args.cookie,
        )
        after_all = read_db_query_counts(console, args.base_url)

        # SQL 数只在顺序段计算：并发段的计数被其它线程交错，除以请求数没有意义。
        baseline, seq_end = total_statements(before), total_statements(after_seq)
        if baseline is not None and seq_end is not None and result.sequential:
            result.db_statements_per_request = (seq_end - baseline) / len(result.sequential)

        for sample in result.sequential + result.concurrent:
            if sample.status < 200 or sample.status >= 300:
                key = str(sample.status)
                result.error_statuses[key] = result.error_statuses.get(key, 0) + 1

        results.append(result.payload(seq_wall, conc_wall))
        print(
            f"{name:<28} 顺序 p50/p95/p99 "
            f"{result.sequential and round(percentile([s.elapsed_ms for s in result.sequential], 0.5), 2)}/"
            f"{round(percentile([s.elapsed_ms for s in result.sequential], 0.95), 2) if result.sequential else 0}/"
            f"{round(percentile([s.elapsed_ms for s in result.sequential], 0.99), 2) if result.sequential else 0}ms"
            f"  并发 p95 "
            f"{round(percentile([s.elapsed_ms for s in result.concurrent], 0.95), 2) if result.concurrent else 0}ms"
            f"  SQL/req {result.db_statements_per_request if result.db_statements_per_request is None else round(result.db_statements_per_request, 2)}"
            f"  non-2xx {result.error_statuses or '{}'}",
            flush=True,
        )
        _ = after_all
    console.close()

    payload = {
        "label": args.label,
        "base_url": args.base_url,
        "measured_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "config": {
            "warmup": args.warmup,
            "sequential": args.sequential,
            "concurrency_total": args.concurrency_total,
            "concurrency": args.concurrency,
        },
        "endpoints": results,
    }
    out_path = (
        Path(args.out) if args.out else REPO_ROOT / "ops" / "perf" / "results" / args.label / "bench_backend.json"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"已写入 {out_path.relative_to(REPO_ROOT) if out_path.is_relative_to(REPO_ROOT) else out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
