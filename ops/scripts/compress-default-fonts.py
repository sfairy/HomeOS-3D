#!/usr/bin/env python3
"""内置字体瘦身：把随包分发的 TTF 无损转成 WOFF2，并校验 catalog 与实际文件一致。

## 为什么做

``homeos/assets-default/fonts`` 里三款中文字体合计 52MB（``lxgw-wenkai.ttf`` 25MB、
``noto-sans-sc.ttf`` 17MB、``source-han-serif.woff2`` 9.9MB），而仪表盘选定字体后由前端
``FontFace`` 直接下载整个文件（``studio/app/shared/dashboard-fonts.ts``，20s 超时）。慢网
下这就是「选了字体但没生效」——超时回退系统字。

WOFF2 是**同字形集**的 Brotli 压缩容器：转换不做子集化，字形数、cmap、hmtx、变体轴全部
保持不变，因此没有任何视觉风险（对比「按字频裁剪字形」，那种做法遇到生僻字会掉成豆腐块）。
实测中文字体可压到原来的 40%–50%。

## 为什么不引入子集化

子集化要决定「保留哪些字」，而仪表盘字体用于**用户自定义名称**，字符集不可预知。
按常用字裁剪在真实家庭里一定会漏字（姓名、地名、品牌名），掉字比慢更糟。分片
（``unicode-range`` 拆多个文件）能同时兼顾，但需要前端按字符动态加载，属于行为改动，
不在「不降低现有功能」的范围内。这里只做无损压缩。

## 用法（仓库根）

```bash
# 1) 转换 + 回写 catalog（需要 fonttools + brotli，仅开发期）
.venv-store/bin/python -m pip install fonttools brotli
node ops/lib/py.mjs ops/scripts/compress-default-fonts.py --write

# 2) 只校验（不需要 fonttools；CI / 门禁用这一条）
node ops/lib/py.mjs ops/scripts/compress-default-fonts.py --check
```

``--check`` 断言三件事：catalog 里每个 ``file`` 都存在、``size`` 与实际字节一致、
``sha256`` 与实际内容一致。这样「换了文件忘了改 catalog」会立刻红灯，而不是等到
浏览器按 ``?v=<sha256>`` 拉到旧缓存。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FONT_DIR = ROOT / "homeos" / "assets-default" / "fonts"
CATALOG_PATH = FONT_DIR / "catalog.json"

#: 值得转换的后缀（woff2 已经是目标格式，smiley-sans 这类原本就是 woff2 的跳过）。
SOURCE_SUFFIXES = (".ttf", ".otf")


def _load_catalog() -> dict:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _font_fingerprint(path: Path) -> dict[str, int]:
    """字形数 + cmap 条目数：转换前后必须逐一相等，否则就是掉字了。"""
    from fontTools.ttLib import TTFont

    font = TTFont(str(path), lazy=True)
    try:
        return {
            "glyphs": len(font.getGlyphOrder()),
            "cmap": sum(len(table.cmap) for table in font["cmap"].tables),
            "unitsPerEm": int(font["head"].unitsPerEm),
        }
    finally:
        font.close()


def _convert(source: Path, target: Path) -> dict[str, int]:
    """无损转 WOFF2：保留全部字形表与变体轴，只换容器格式。"""
    from fontTools.ttLib import TTFont

    before = _font_fingerprint(source)
    font = TTFont(str(source))
    try:
        font.flavor = "woff2"
        font.save(str(target))
    finally:
        font.close()
    after = _font_fingerprint(target)
    if before != after:
        target.unlink(missing_ok=True)
        raise SystemExit(f"转换后字形集发生变化，已放弃：{source.name}\n  转换前 {before}\n  转换后 {after}")
    return before


def write_catalog() -> int:
    catalog = _load_catalog()
    total_before = 0
    total_after = 0
    changed = 0
    for item in catalog.get("fonts", []):
        file_name = str(item.get("file") or "")
        if not file_name:
            continue
        source = FONT_DIR / file_name
        if not source.is_file():
            print(f"跳过（文件不存在）：{file_name}", file=sys.stderr)
            continue
        if source.suffix.lower() not in SOURCE_SUFFIXES:
            continue
        target = source.with_suffix(".woff2")
        before_bytes = source.stat().st_size
        total_before += before_bytes
        _convert(source, target)
        after_bytes = target.stat().st_size
        total_after += after_bytes
        if after_bytes >= before_bytes:
            # 压缩无效（极小文件）时保留原格式，避免「为了统一命名」反而变大。
            target.unlink(missing_ok=True)
            print(f"{file_name}: woff2 反而更大，保留原文件")
            continue
        source.unlink()
        item["file"] = target.name
        item["size"] = after_bytes
        item["sha256"] = _sha256(target)
        item["note"] = "无损失 WOFF2（同字形集压缩；见 ops/scripts/compress-default-fonts.py）"
        changed += 1
        print(f"{file_name} → {target.name}: {before_bytes / 1048576:.1f}MB → {after_bytes / 1048576:.1f}MB")
    CATALOG_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已更新 {changed} 项；合计 {total_before / 1048576:.1f}MB → {total_after / 1048576:.1f}MB")
    print(f"catalog 已回写：{CATALOG_PATH.relative_to(ROOT)}")
    return 0


def check_catalog() -> int:
    catalog = _load_catalog()
    problems: list[str] = []
    total = 0
    for item in catalog.get("fonts", []):
        file_name = str(item.get("file") or "")
        if not file_name:
            problems.append(f"{item.get('id')}: 缺少 file 字段")
            continue
        path = FONT_DIR / file_name
        if not path.is_file():
            problems.append(f"{item.get('id')}: 文件不存在 {file_name}")
            continue
        actual_size = path.stat().st_size
        total += actual_size
        declared_size = int(item.get("size") or 0)
        if declared_size and declared_size != actual_size:
            problems.append(f"{file_name}: catalog size={declared_size}，实际={actual_size}")
        declared_sha = str(item.get("sha256") or "")
        if declared_sha and declared_sha != _sha256(path):
            problems.append(f"{file_name}: sha256 与 catalog 不一致（改了文件但没更新 catalog）")
    if problems:
        print("内置字体目录校验失败：", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        print("修法：重跑 `node ops/lib/py.mjs ops/scripts/compress-default-fonts.py --write`。", file=sys.stderr)
        return 1
    print(f"内置字体校验通过：{len(catalog.get('fonts', []))} 项，合计 {total / 1048576:.1f}MB")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="内置字体无损转 WOFF2 / 校验 catalog")
    parser.add_argument("--write", action="store_true", help="转换并回写 catalog（需要 fonttools + brotli）")
    parser.add_argument("--check", action="store_true", help="只校验 catalog 与实际文件一致")
    args = parser.parse_args(argv)
    if args.write:
        return write_catalog()
    return check_catalog()


if __name__ == "__main__":
    raise SystemExit(main())
