#!/usr/bin/env python3
"""近似重复代码扫描（M2 口径，只读，纯标准库）。

为什么需要它
------------
`ops/checks/check_duplicates.mjs`（jscpd）只认 **token 级完全相同** 的克隆。真实的重复往往
长这样：同一段逻辑在两侧各写一遍，只是变量名、字面量、嵌套顺序略改。这类「近似重复」抓不到，
但评审时又确实应该合并 —— 于是需要一条**只出清单、不进 CI** 的口径。

口径
----
- 窗口：连续 `WINDOW` 个「有效代码行」；
- 有效代码行 = 去掉首尾空白后仍非空、不是纯标点、不是注释、不是 import/from；
- 相似度 = 两个窗口里有效行集合的 **Jaccard**（交/并）；
- 相似度 ≥ `--threshold`（默认 0.80）记为一条近似重复。

为什么不拿它当门禁
------------------
相似度阈值天生主观：0.79 和 0.81 之间没有语义差别。把它卡在 CI 上，会培养「为了过门禁
而把代码改得更不像」的动机，恰好与目标相反。因此本脚本只产出证据，判定交给 jscpd 那条
精确口径（`bun run check:duplicates`）。

候选筛选（为什么不是 O(n²)）
----------------------------
把每个窗口切成 3 个长度为 4 的重叠行段（`[0:4]` `[3:7]` `[6:10]`）做精确哈希索引。
两个窗口若只差 1~2 行，必有一段完整重合 —— 这是鸽笼原理的直接结论，不是启发式猜测。
命中候选后再按行集合算 Jaccard 复核。

单个行段桶过大（> `--max-bucket`）时整桶跳过：那种桶里全是 `else:`` `try:` 一类样板，
比下去只会把真正有价值的重复淹掉。跳过数量会写进 `stats.skippedBuckets`，不静默吞掉。

用法
----
    .venv-store/bin/python ops/checks/dup_near.py                  # 扫描 + 写 json/markdown
    .venv-store/bin/python ops/checks/dup_near.py --report         # 只打印统计
    .venv-store/bin/python ops/checks/dup_near.py --threshold 0.9  # 收紧相似度
    .venv-store/bin/python ops/checks/dup_near.py --top 60         # markdown 里最多列几条
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = REPO_ROOT / "docs/analysis/code-duplication"

#: 与 `.jscpd.json` 的扫描根保持一致：两处口径不同会让两份报告无法互相印证。
SCAN_ROOTS = (
    "homeos/frontend/src",
    "homeos/frontend/scripts",
    "homeos/backend/src",
    "homeos-store/frontend/src",
    "homeos-store/backend/src",
    "packages/shared/src",
    "packages/shared-py",
    "ops",
)

EXTENSIONS = frozenset({".ts", ".tsx", ".js", ".mjs", ".vue", ".py"})

SKIP_DIRS = frozenset(
    {
        "node_modules",
        "dist",
        "build",
        "target",
        "out",
        "vendor",
        ".venv",
        ".venv-store",
        "__pycache__",
        ".graphflow",
        ".ruff_cache",
        ".git",
        "backups",
        "public",
        "assets",
        "assets-default",
        "data",
        "keys",
        "docs",
        "shims",
    }
)

SKIP_NAME_SUFFIXES = (".min.js", ".min.css", ".d.ts", ".generated.ts", ".pyi")

IMPORT_LINE = re.compile(
    r"^\s*(?:import\b|from\s+\S+\s+import\b|export\s+\{[^}]*\}\s+from|const\s+\w+\s*=\s*require\(|#include)"
)
COMMENT_PREFIXES = ("#", "//", "/*", "*", "*/", "<!--")
PUNCTUATION_ONLY = re.compile(r'^[\s{}\[\]();,<>:=|&+\-*/\\\'"`]+$')


@dataclass(slots=True)
class Window:
    path: str
    start: int
    end: int
    lines: tuple[str, ...]
    line_set: frozenset[str]
    fragment: str


@dataclass(slots=True)
class Match:
    path_a: str
    path_b: str
    start_a: int
    end_a: int
    start_b: int
    end_b: int
    similarity: float
    fragment: str


@dataclass(slots=True)
class Cluster:
    path_a: str
    path_b: str
    start_a: int
    end_a: int
    start_b: int
    end_b: int
    similarity: float
    windows: int = 1
    fragment: list[str] = field(default_factory=list)


def normalize_source_line(line: str) -> str | None:
    """把一行源码归一化成「有效代码行」，无效返回 None。"""
    stripped = line.strip()
    if not stripped:
        return None
    if stripped.startswith(COMMENT_PREFIXES):
        return None
    if PUNCTUATION_ONLY.match(stripped):
        return None
    if IMPORT_LINE.match(line):
        return None
    return re.sub(r"\s+", " ", stripped)


def collect_files() -> list[Path]:
    files: list[Path] = []
    for root in SCAN_ROOTS:
        base = REPO_ROOT / root
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix not in EXTENSIONS:
                continue
            if any(part in SKIP_DIRS for part in path.relative_to(REPO_ROOT).parts):
                continue
            if path.name.endswith(SKIP_NAME_SUFFIXES):
                continue
            files.append(path)
    return sorted(files)


def build_windows(window: int) -> tuple[list[Window], Counter[str]]:
    stats: Counter[str] = Counter()
    windows: list[Window] = []
    for path in collect_files():
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            stats["unreadable"] += 1
            continue
        stats["files"] += 1
        code: list[tuple[int, str]] = []
        for lineno, raw in enumerate(text.splitlines(), start=1):
            normalized = normalize_source_line(raw)
            if normalized is not None:
                code.append((lineno, normalized))
        stats["codeLines"] += len(code)
        if len(code) < window:
            continue
        rel = path.relative_to(REPO_ROOT).as_posix()
        for i in range(len(code) - window + 1):
            chunk = code[i : i + window]
            windows.append(
                Window(
                    path=rel,
                    start=chunk[0][0],
                    end=chunk[-1][0],
                    lines=tuple(item[1] for item in chunk),
                    line_set=frozenset(item[1] for item in chunk),
                    fragment="\n".join(item[1] for item in chunk),
                )
            )
    stats["windows"] = len(windows)
    return windows, stats


def band_keys(window: Window) -> list[str]:
    """3 个长度 4 的重叠行段；只差 1~2 行的两个窗口必有一段完全相同。"""
    keys = []
    for start in (0, 3, 6):
        band = "\u0000".join(window.lines[start : start + 4])
        keys.append(hashlib.blake2b(band.encode(), digest_size=12).hexdigest())
    return keys


def jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    union = len(a | b)
    return len(a & b) / union if union else 0.0


def find_matches(windows: list[Window], threshold: float, max_bucket: int) -> tuple[list[Match], Counter[str]]:
    """窗口级候选筛选 + Jaccard 复核，返回逐窗口的命中（尚未合并）。"""
    stats: Counter[str] = Counter()
    index: dict[str, list[int]] = defaultdict(list)
    for idx, window in enumerate(windows):
        for key in band_keys(window):
            index[key].append(idx)

    seen: set[tuple[int, int]] = set()
    matches: list[Match] = []

    for idx, window in enumerate(windows):
        candidates: set[int] = set()
        for key in band_keys(window):
            bucket = index[key]
            if len(bucket) < 2:
                continue
            if len(bucket) > max_bucket:
                stats["skippedBuckets"] += 1
                continue
            candidates.update(other for other in bucket if other != idx)

        for other in candidates:
            pair = (min(idx, other), max(idx, other))
            if pair in seen:
                continue
            seen.add(pair)
            stats["candidatePairs"] += 1
            peer = windows[other]
            # 同一文件内相距不到一个窗口：那是滑动窗口和它自己重叠，不是重复。
            if peer.path == window.path and abs(peer.start - window.start) < 10:
                continue
            score = jaccard(window.line_set, peer.line_set)
            if score < threshold:
                continue
            # 规范化方向：按 (路径, 起始行) 排序，避免同一对文件出现正反两行。
            if (window.path, window.start) <= (peer.path, peer.start):
                first, second = window, peer
            else:
                first, second = peer, window
            matches.append(
                Match(
                    path_a=first.path,
                    path_b=second.path,
                    start_a=first.start,
                    end_a=first.end,
                    start_b=second.start,
                    end_b=second.end,
                    similarity=round(score, 4),
                    fragment=first.fragment,
                )
            )
    stats["matches"] = len(matches)
    return matches, stats


def merge_matches(matches: list[Match], gap: int = 10) -> list[Cluster]:
    """把同一文件对内相邻的命中合并成一个簇。

    不合并的话，一个跨 400 行的重复区会变成几十条「滑动一步就报一次」的记录，
    报告读起来全是噪音，也看不出「这段一共有多少行」。
    """
    grouped: dict[tuple[str, str], list[Match]] = defaultdict(list)
    for match in matches:
        grouped[(match.path_a, match.path_b)].append(match)

    clusters: list[Cluster] = []
    for (path_a, path_b), group in grouped.items():
        group.sort(key=lambda m: (m.start_a, m.start_b))
        current: Cluster | None = None
        for match in group:
            if current is not None and match.start_a <= current.end_a + gap and match.start_b <= current.end_b + gap:
                current.end_a = max(current.end_a, match.end_a)
                current.end_b = max(current.end_b, match.end_b)
                current.windows += 1
                if match.similarity > current.similarity:
                    current.similarity = match.similarity
                    current.fragment = match.fragment.split("\n")[:4]
                continue
            current = Cluster(
                path_a=path_a,
                path_b=path_b,
                start_a=match.start_a,
                end_a=match.end_a,
                start_b=match.start_b,
                end_b=match.end_b,
                similarity=match.similarity,
                windows=1,
                fragment=match.fragment.split("\n")[:4],
            )
            clusters.append(current)

    clusters.sort(key=lambda c: (-(c.windows * (c.end_a - c.start_a + 1)), -c.similarity))
    return clusters


def render_markdown(clusters: list[Cluster], stats: Counter[str], threshold: float, window: int, top: int) -> str:
    lines = [
        "# 近似重复清单（M2 口径）",
        "",
        f"- 生成时间：{datetime.now(UTC).strftime('%Y-%m-%dT%H:%M:%SZ')}",
        f"- 窗口：连续 {window} 个有效代码行（去空行 / 注释 / 纯标点 / import）",
        f"- 相似度：行集合 Jaccard ≥ {threshold:.2f}",
        f"- 扫描：{stats['files']} 个文件 / {stats['codeLines']} 个有效代码行 / {stats['windows']} 个窗口",
        f"- 结果：{stats['clusters']} 个近似重复簇（候选对 {stats['candidatePairs']}，跳过样板桶 {stats['skippedBuckets']}）",
        "",
        "本清单**不进 CI**，仅用于人工研判；门禁口径见 `bun run check:duplicates`（jscpd 精确克隆）。",
        "",
    ]
    if not clusters:
        lines.append("未发现达到阈值的近似重复。")
        return "\n".join(lines) + "\n"

    lines += [
        "| # | 相似度 | 命中窗口 | A | B | 覆盖行数 |",
        "|---|---|---|---|---|---|",
    ]
    for i, cluster in enumerate(clusters[:top], start=1):
        lines.append(
            f"| {i} | {cluster.similarity:.2f} | {cluster.windows} | "
            f"`{cluster.path_a}:{cluster.start_a}-{cluster.end_a}` | `{cluster.path_b}:{cluster.start_b}-{cluster.end_b}` | "
            f"{cluster.end_a - cluster.start_a + 1} |"
        )
    if len(clusters) > top:
        lines.append(f"| … | | | 另有 {len(clusters) - top} 簇 | | | see `near-duplicates.json` |")

    lines += ["", "## 代表性片段", ""]
    for i, cluster in enumerate(clusters[: min(top, 8)], start=1):
        lines.append(
            f"### {i}. `{cluster.path_a}:{cluster.start_a}` ↔ `{cluster.path_b}:{cluster.start_b}`（{cluster.similarity:.2f}）"
        )
        lines.append("")
        lines.append("```text")
        lines.extend(cluster.fragment)
        lines.append("```")
        lines.append("")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="近似重复代码扫描（M2，只出清单）")
    parser.add_argument("--window", type=int, default=10, help="窗口内的有效代码行数（默认 10）")
    parser.add_argument("--threshold", type=float, default=0.8, help="行集合 Jaccard 阈值（默认 0.80）")
    parser.add_argument("--max-bucket", type=int, default=200, help="行段桶上限，超过即跳过（默认 200）")
    parser.add_argument("--top", type=int, default=60, help="markdown 最多列出的簇数（默认 60）")
    parser.add_argument("--report", action="store_true", help="只打印统计，不写文件")
    args = parser.parse_args()

    windows, window_stats = build_windows(args.window)
    matches, match_stats = find_matches(windows, args.threshold, args.max_bucket)
    clusters = merge_matches(matches)
    match_stats["clusters"] = len(clusters)
    stats = window_stats + match_stats

    print(
        f"近似重复（M2）：{stats['clusters']} 簇 / {stats['files']} 文件 / "
        f"{stats['codeLines']} 有效代码行 / 阈值 {args.threshold:.2f}"
    )
    print(f"  候选对 {stats['candidatePairs']}，命中窗口 {stats['matches']}，跳过样板桶 {stats['skippedBuckets']}")
    if args.report:
        for cluster in clusters[:20]:
            span = cluster.end_a - cluster.start_a + 1
            print(
                f"  {cluster.similarity:.2f} span={span:4d} ×{cluster.windows:3d}  "
                f"{cluster.path_a}:{cluster.start_a} <-> {cluster.path_b}:{cluster.start_b}"
            )
        return 0

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "generatedAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "window": args.window,
        "threshold": args.threshold,
        "scanRoots": list(SCAN_ROOTS),
        "stats": dict(stats),
        "clusters": [
            {
                "similarity": cluster.similarity,
                "windows": cluster.windows,
                "first": {"path": cluster.path_a, "start": cluster.start_a, "end": cluster.end_a},
                "second": {"path": cluster.path_b, "start": cluster.start_b, "end": cluster.end_b},
                "preview": cluster.fragment[:2],
            }
            for cluster in clusters
        ],
    }
    (OUTPUT_DIR / "near-duplicates.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (OUTPUT_DIR / "near-duplicates.md").write_text(
        render_markdown(clusters, stats, args.threshold, args.window, args.top), encoding="utf-8"
    )
    print(f"  已写入 {OUTPUT_DIR.relative_to(REPO_ROOT)}/near-duplicates.json 与 near-duplicates.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
