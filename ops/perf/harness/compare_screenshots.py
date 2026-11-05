#!/usr/bin/env python3
"""逐像素对比两批截图（UI 一致性验证的唯一硬门槛）。

为什么必须有它
--------------
本轮所有前端改动（CSS 内联、tab bar 占位、字体子集、延迟加载）都可能悄悄改变观感。
`docs/perf` 里的历史结论全部以「0.0000% 差异 / 最大通道差 ≤ 8」作为"没改观感"的证明，
而这个脚本正是产生那些数字的工具。

WebGL 画布（3D 舞台）**不适用**逐像素：每帧着色器动画的时序不同，结果天然非确定性。
对 3D 用固定机位人工清单（day/night、开灯/关灯、单层/全层），本脚本会把这类目录
标记为 `excluded` 而不是给出假 PASS。

用法
----
```bash
.venv-store/bin/python ops/perf/harness/compare_screenshots.py \
    --before /tmp/homeos-perf/before --after /tmp/homeos-perf/after \
    --channel-threshold 8 --max-diff-pct 0.1 --exclude stage
```
退出码：0 全部在阈值内（或只有 excluded），1 有超出阈值，2 用法/环境错误。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from PIL import Image, ImageChops
except ModuleNotFoundError:  # pragma: no cover
    sys.exit("缺少 Pillow：用仓库 venv 运行（node ops/lib/py.mjs …）")


def compare_one(before: Path, after: Path, channel_threshold: int) -> dict[str, object]:
    """比较一对同名截图，返回差异统计。

    「差异像素」的定义是**任一通道差 > threshold**：只按灰度或平均差会把「整屏偏色 3 个
    通道各差 5」这种肉眼可见的变化算成 0，而那正是主题令牌改错时的典型症状。
    """
    left = Image.open(before).convert("RGB")
    right = Image.open(after).convert("RGB")
    if left.size != right.size:
        return {
            "file": before.name,
            "status": "size-mismatch",
            "before": list(left.size),
            "after": list(right.size),
        }
    diff = ImageChops.difference(left, right)
    # `getextrema()` 逐通道返回 (min, max)，最大通道差取三者最大值
    maxima = [band[1] for band in diff.getextrema()]
    max_channel = max(maxima)
    # 逐像素判定：point 把每个通道映射成 0/255，再转单通道统计非零像素
    mask = diff.convert("L").point(lambda value: 255 if value > channel_threshold else 0)
    changed = sum(1 for value in mask.getdata() if value)
    total = left.size[0] * left.size[1]
    return {
        "file": before.name,
        "status": "compared",
        "changed_pixels": changed,
        "total_pixels": total,
        "diff_pct": round(changed / total * 100, 4) if total else 0.0,
        "max_channel_diff": max_channel,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="截图逐像素对比")
    parser.add_argument("--before", required=True)
    parser.add_argument("--after", required=True)
    parser.add_argument("--channel-threshold", type=int, default=8)
    parser.add_argument("--max-diff-pct", type=float, default=0.1)
    parser.add_argument(
        "--exclude",
        action="append",
        default=["stage"],
        help="文件名包含该子串即排除（WebGL 画布天然非确定性），可重复",
    )
    parser.add_argument("--out", default="", help="结果 JSON 路径")
    args = parser.parse_args()

    before_dir = Path(args.before)
    after_dir = Path(args.after)
    if not before_dir.is_dir() or not after_dir.is_dir():
        print(f"目录不存在：{before_dir} / {after_dir}", file=sys.stderr)
        return 2

    results: list[dict[str, object]] = []
    failures: list[str] = []
    for before in sorted(before_dir.glob("*.png")):
        if any(token and token in before.name for token in args.exclude):
            results.append({"file": before.name, "status": "excluded"})
            continue
        after = after_dir / before.name
        if not after.is_file():
            results.append({"file": before.name, "status": "missing-after"})
            failures.append(before.name)
            continue

        row = compare_one(before, after, args.channel_threshold)
        if row["status"] == "size-mismatch":
            failures.append(before.name)
        elif row["status"] == "compared":
            too_many = float(row["diff_pct"]) > args.max_diff_pct
            too_bright = int(row["max_channel_diff"]) > args.channel_threshold * 4
            row["status"] = "fail" if (too_many or too_bright) else "pass"
            if row["status"] == "fail":
                failures.append(before.name)
        results.append(row)

    for row in results:
        if row["status"] == "compared":
            continue
        if row["status"] == "pass":
            print(f"PASS  {row['file']:<28} {row['diff_pct']:>7.4f}%  max {row['max_channel_diff']}")
        elif row["status"] == "excluded":
            print(f"SKIP  {row['file']:<28} 排除（非确定性画布）")
        else:
            print(f"FAIL  {row['file']:<28} {row['status']}")

    payload = {
        "channel_threshold": args.channel_threshold,
        "max_diff_pct": args.max_diff_pct,
        "results": results,
        "failures": failures,
    }
    if args.out:
        Path(args.out).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
