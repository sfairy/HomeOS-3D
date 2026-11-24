#!/usr/bin/env python3
"""后端热点性能门禁：把「扇出 / 事件日志 / JSON 序列化」的成本钉成可比对的数字。

## 为什么不需要「精确毫秒」

毫秒级阈值在 CI 上必然抖（宿主机核数、是否被别的 job 抢占）。所以本门禁分成两层：

**确定性的（硬失败）** —— 同一份输入下完全可复现：

- ``fanout.emits_per_batch``：一批广播最多能序列化几次。分桶逻辑退化（逐连接 emit）
  会把它放大到连接数量级，这是最该拦住的一类回归；
- ``fanout.bytes_per_batch`` / ``eventlog.state_chars_per_row`` / ``eventlog.bytes_per_row_on_disk``：
  载荷与行字节的膨胀（例如又把整份 attributes 写回日志）；
- ``json.<case>.<candidate>.bytes``：编码结果必须与基线**完全一致** —— 一旦漂移，
  说明 ``sort_keys`` / 分隔符这类「字节级契约」被动了（ETag、syncKey 依赖它）。

**耗时（默认只报不判）** —— 用 ``--timing`` 打开，上限是基线的 ``--timing-multiplier`` 倍，
默认 4.0。它只用于抓「几十倍的灾难性回归」，不用于追求几个百分点。

## 用法

```bash
node ops/lib/py.mjs ops/checks/perf/check_backend_hotpaths.py            # 校验（确定性项）
node ops/lib/py.mjs ops/checks/perf/check_backend_hotpaths.py --timing   # 连耗时一起判
node ops/lib/py.mjs ops/checks/perf/check_backend_hotpaths.py --update   # 重新录制基线
```
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
BENCH_DIR = ROOT / "ops" / "bench"
for entry in (str(ROOT), str(BENCH_DIR)):
    if entry not in sys.path:
        sys.path.insert(0, entry)

# `ops/bench` 由上面的 `sys.path` 注入在运行期解析；静态分析看不到这一步。
import _support  # pyright: ignore[reportMissingImports]
import bench_eventlog  # pyright: ignore[reportMissingImports]
import bench_fanout  # pyright: ignore[reportMissingImports]
import bench_json  # pyright: ignore[reportMissingImports]

BASELINE_PATH = _support.BASELINE_DIR / "backend-hotpaths.json"

#: 确定性项的允许放大（字节类）。载荷瘦身会让它变小 —— 变小永远通过。
BYTES_TOLERANCE = 1.15
#: 耗时项的默认放大上限（只抓灾难性回归）。
DEFAULT_TIMING_MULTIPLIER = 4.0


class Violation(Exception):
    """一条门禁失败（消息即给人看的结论）。"""


def collect(iterations: int) -> dict[str, Any]:
    """跑一遍三个基准，返回与基线同构的结果（只保留会被比对的字段）。"""
    fanout = bench_fanout.run(200, 5, iterations)
    eventlog = bench_eventlog.run(200, 2)
    json_result = bench_json.run(iterations)
    return {
        "fanout": {
            "emits_per_batch": fanout["emits_per_batch"],
            "serializations_per_batch": fanout["serializations_per_batch"],
            "bytes_per_batch": fanout["bytes_per_batch"],
            "p95_ms": fanout["latency_ms"]["p95"],
        },
        "eventlog": {
            # 只比**确定性**的那一项：每行 JSON 列的字符数。`bytes_per_row_on_disk`
            # 随索引页分裂与行数摊薄而漂移（±15% 属正常），放在这里只会变成噪声门禁。
            "state_chars_per_row": eventlog["state_chars_per_row"],
            "p95_ms": eventlog["batch_latency_ms"]["p95"],
        },
        "json": {
            case: {candidate: values["bytes"] for candidate, values in candidates.items()}
            for case, candidates in json_result["cases"].items()
        },
        "json_p95_ms": {
            case: {candidate: values["latency_ms"]["p95"] for candidate, values in candidates.items()}
            for case, candidates in json_result["cases"].items()
        },
    }


def _check_at_most(name: str, actual: float, limit: float, *, tolerance: float = 1.0) -> None:
    if actual > limit * tolerance:
        raise Violation(f"{name}: {actual} 超过上限 {round(limit * tolerance, 3)}（基线 {limit}）")


def _check_exact(name: str, actual: Any, expected: Any) -> None:
    if actual != expected:
        raise Violation(f"{name}: {actual!r} != 基线 {expected!r}")


def verify(current: dict[str, Any], baseline: dict[str, Any], *, timing: bool, multiplier: float) -> list[str]:
    """返回失败清单（空 = 通过）；不抛异常，便于一次报全。"""
    problems: list[str] = []
    base_fanout = baseline.get("fanout", {})
    cur_fanout = current["fanout"]
    for key in ("emits_per_batch", "serializations_per_batch"):
        if key in base_fanout:
            try:
                _check_at_most(f"fanout.{key}", cur_fanout[key], float(base_fanout[key]))
            except Violation as error:
                problems.append(str(error))
    if "bytes_per_batch" in base_fanout:
        try:
            _check_at_most(
                "fanout.bytes_per_batch",
                cur_fanout["bytes_per_batch"],
                float(base_fanout["bytes_per_batch"]),
                tolerance=BYTES_TOLERANCE,
            )
        except Violation as error:
            problems.append(str(error))

    base_log = baseline.get("eventlog", {})
    cur_log = current["eventlog"]
    for key in ("state_chars_per_row",):
        if key in base_log:
            try:
                _check_at_most(f"eventlog.{key}", cur_log[key], float(base_log[key]), tolerance=BYTES_TOLERANCE)
            except Violation as error:
                problems.append(str(error))

    # 编码字节必须逐字节一致：这是 ETag / syncKey 的契约面。
    for case, candidates in baseline.get("json", {}).items():
        current_case = current["json"].get(case, {})
        for candidate, expected_bytes in candidates.items():
            if candidate not in current_case:
                continue  # orjson 缺失时该候选整体缺席，不算失败
            try:
                _check_exact(f"json.{case}.{candidate}.bytes", current_case[candidate], expected_bytes)
            except Violation as error:
                problems.append(str(error))

    if timing:
        pairs = [
            ("fanout", "p95_ms"),
            ("eventlog", "p95_ms"),
        ]
        for bench, key in pairs:
            expected = baseline.get(bench, {}).get(key)
            if expected is None:
                continue
            try:
                _check_at_most(f"{bench}.{key}", current[bench][key], float(expected), tolerance=multiplier)
            except Violation as error:
                problems.append(str(error))
        for case, candidates in baseline.get("json_p95_ms", {}).items():
            for candidate, expected in candidates.items():
                actual = current["json_p95_ms"].get(case, {}).get(candidate)
                if actual is None:
                    continue
                try:
                    _check_at_most(f"json.{case}.{candidate}.p95_ms", actual, float(expected), tolerance=multiplier)
                except Violation as error:
                    problems.append(str(error))

    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="后端热点性能门禁")
    parser.add_argument("--update", action="store_true", help="重新录制基线")
    parser.add_argument("--timing", action="store_true", help="把耗时也纳入判定（默认只打印）")
    parser.add_argument("--timing-multiplier", type=float, default=DEFAULT_TIMING_MULTIPLIER)
    parser.add_argument("--iterations", type=int, default=5)
    args = parser.parse_args(argv)

    current = collect(args.iterations)

    if args.update:
        _support.write_baseline(BASELINE_PATH, current)
        print(f"已录制基线：{BASELINE_PATH.relative_to(ROOT)}")
        return 0

    baseline = _support.load_baseline(BASELINE_PATH)
    if baseline is None:
        print(
            f"缺少基线 {BASELINE_PATH.relative_to(ROOT)}；先跑一次 --update 并提交该文件。",
            file=sys.stderr,
        )
        return 2

    problems = verify(current, baseline, timing=args.timing, multiplier=args.timing_multiplier)
    if problems:
        print("后端热点性能门禁失败：", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        print("确认改动是有意的之后，用 --update 重新录制基线。", file=sys.stderr)
        return 1

    print(
        "后端热点性能门禁通过："
        f"扇出 {current['fanout']['emits_per_batch']} 次 emit / "
        f"{current['fanout']['bytes_per_batch']} B，"
        f"日志 {current['eventlog']['state_chars_per_row']} 字符/行，"
        f"p95 扇出 {current['fanout']['p95_ms']} ms、日志 {current['eventlog']['p95_ms']} ms"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
