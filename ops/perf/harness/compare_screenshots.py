#!/usr/bin/env python3
"""固定视口截图的像素回归。

视觉基线只接受「同一视口、同一浏览器、同一条路由」的对比；3D 画布受 GPU/动画影响，
本脚本不把它当作 0 差异门槛，动态路由的差异要人工结合 3D 指标判断。
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops

from perf_common import PERF_ROOT, result_dir, write_json


def _load(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGB")
    return image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--before", required=True)
    parser.add_argument("--after", required=True)
    parser.add_argument("--channel-threshold", type=int, default=8)
    parser.add_argument("--max-diff-pct", type=float, default=0.1)
    args = parser.parse_args()
    before_dir = PERF_ROOT / "results" / args.before / "screenshots"
    after_dir = PERF_ROOT / "results" / args.after / "screenshots"
    if not before_dir.is_dir():
        raise SystemExit(f"缺少基线截图：{before_dir}")
    results = []
    for before_path in sorted(before_dir.glob("*.png")):
        after_path = after_dir / before_path.name
        record = {"name": before_path.name, "before": str(before_path), "after": str(after_path)}
        if not after_path.is_file():
            record.update({"ok": False, "error": "missing-after"})
            results.append(record)
            continue
        before_image = _load(before_path)
        after_image = _load(after_path)
        resized = False
        if before_image.size != after_image.size:
            after_image = after_image.resize(before_image.size, Image.Resampling.LANCZOS)
            resized = True
        difference = ImageChops.difference(before_image, after_image)
        grayscale = difference.convert("L")
        histogram = grayscale.histogram()
        total = before_image.width * before_image.height
        changed = sum(histogram[args.channel_threshold + 1:])
        pct = changed / max(1, total) * 100.0
        extrema = grayscale.getextrema()
        record.update({
            "ok": pct <= args.max_diff_pct,
            "width": before_image.width,
            "height": before_image.height,
            "resizedAfter": resized,
            "changedPixels": changed,
            "changedPct": round(pct, 4),
            "maxChannelDiff": extrema[1],
            "threshold": args.channel_threshold,
        })
        results.append(record)
        print(f"{before_path.name}: {pct:.4f}% changed (max {extrema[1]})")
    failed = [record for record in results if not record.get("ok")]
    payload = {
        "before": args.before,
        "after": args.after,
        "channelThreshold": args.channel_threshold,
        "maxDiffPct": args.max_diff_pct,
        "passed": len(results) - len(failed),
        "failed": len(failed),
        "results": results,
    }
    write_json(result_dir(args.after) / "screenshots-compare.json", payload)
    if failed:
        raise SystemExit(f"视觉回归失败 {len(failed)} 张；详见 results/{args.after}/screenshots-compare.json")
    print(f"视觉回归通过（{len(results)} 张）")


if __name__ == "__main__":
    main()
