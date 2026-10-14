#!/usr/bin/env python3
"""静态资源门禁（第二组）：`homeos/assets` 与 `public/static/assets` 的**双向一致**。

## 为什么需要这道门禁

仓库里的静态资源分三处存放，此前只有 `design/scene` → 两端 `public/static/scene`
有同步门禁（`ops/check/verify_scene_sync.py`），另外两处**完全没有护栏**：

1. `homeos/assets/**`（内置素材：`icons` / `backgrounds` / `logo` / `sounds`）
   —— 后端按 `/icons/...`、`/backgrounds/...`、`/logo/...`、`/sounds/...` 直接伺服
   （`platform/core/asset_paths.py`），前端只写 URL 字面量。字面量写错**不会有任何报错**：
   logo 静默不显示（webpush 通知里就是一张空图）、门口机门铃没声音、灯光背景退成纯色。
2. `homeos/frontend/public/static/assets/**`（PWA 品牌资源：34 个图标 + 5 份 webmanifest）
   —— 按手持档位（`-h3` / `-h4` / `-h5`）成族生成，**漏生成一个尺寸只在真机上暴露**：
   桌面浏览器永远走默认档，iOS 16 / 17 / 18 各取各的 `apple-touch-icon`。
   本轮审计时这两处都靠人工核对（`homeos/assets` 3.7 MB / 103 个图标，
   `public/static/assets` 736 KB / 39 个文件），也就是说下一个人加图标时同样没人拦。

所以本门禁做两组双向校验 —— **引用必须落盘，落盘必须被引用**：

- 引用 → 磁盘：`/icons|/backgrounds|/logo|/sounds/<rel>` 必须存在 `homeos/assets/<rel>`；
  `/static/assets/<rel>` 必须存在 `public/static/assets/<rel>`，webmanifest 的
  `icons[].src` 还必须落在 `icons/` 目录内。
- 磁盘 → 声明：`homeos/assets` 的 `logo` / `sounds` / `backgrounds` 三个目录
  （`icons/` 见下）与 `public/static/assets` 下的每个文件都必须被引用，否则就是死资源。
- 成族完整性：每个手持档的图标尺寸集合必须与其它档位一致，且 PNG 实际像素必须等于
  webmanifest / `index.html` 声明的 `sizes`。

`homeos/assets/icons/**` 不做孤儿判定：图标目录是**枚举消费**（面板扫描目录列可选图标），
文件名不出现在任何源码里，按引用判定会把 103 个图标全判成死资源。

用法：
```bash
python3 ops/check/verify_assets.py                 # 门禁（CI 跑这条）
python3 ops/check/verify_assets.py --list          # 只打印两个根的引用/落盘统计
python3 ops/check/verify_assets.py --repo=<dir>    # 自检注入 fixture 树
```
"""

from __future__ import annotations

import argparse
import json
import re
import struct
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO))

# 遍历与读文件走共享实现（`ops/lib/scan.py`）：门禁各写一份遍历器 = 漏一个后缀就静默变绿。
from ops.lib import scan

#: 内置素材根（后端 `/icons|/backgrounds|/logo|/sounds` 的实际来源）。
BUILTIN_DIR = "homeos/assets"
#: 内置素材里「必须被引用」的子目录；`icons` 是枚举消费，见模块 docstring。
BUILTIN_OWNED_DIRS = ("backgrounds", "logo", "sounds")
#: PWA 品牌资源根（前端 `public/` 原样进产物）。
PWA_DIR = "homeos/frontend/public/static/assets"
#: 允许的图标设备档位后缀（空档 = 默认档）。
ICON_FAMILIES = ("", "-h3", "-h4", "-h5")
#: 每个设备档位必须齐备的图标尺寸（`homeos-icon-<size><family>.png`）。
ICON_SIZES = (16, 32, 48, 180, 192, 512)
#: favicon 的两个变体（`homeos-favicon<family>.<ext>`）。
FAVICON_EXTS = ("ico", "svg")
#: 只在「默认档」存在的品牌标记。
BRAND_MARKS = ("homeos-mark-white-orange.svg", "homeos-mark-black-orange.svg")

#: 引用扫描语料（相对仓库根）。故意**不含** `public/**`：产物目录里文件会引用自己，
#: 把孤儿判定变成永真的假绿。webmanifest 单独列出（它引用 `icons/`，不自指）。
CORPUS_DIRS = (
    "homeos/frontend/src",
    "homeos/frontend/scripts",
    "homeos-store/frontend/src",
    "packages/shared/src",
)
CORPUS_FILES = (
    "homeos/frontend/index.html",
    "homeos/frontend/public-static.seed.json",
)
#: 语料后缀：源码 + 样式 + HTML + JSON（清单/种子都在这儿）。
CORPUS_EXTS = scan.TS_EXTS | {".js", ".mjs", ".cjs", ".css", ".html", ".json"}

#: 内置素材 URL 引用。前置 `(?<![\w/.-])` 是必须的：否则 `/static/assets/icons/x` 会被
#: 当成 `/icons/x` 的子串命中，把所有 PWA 图标误判成内置素材缺失。
#: 路径段里允许 `/`：`icons/**` 是按域分目录的（`icons/传感器/...`）。
BUILTIN_REF = re.compile(
    r"(?<![\w/.\-])/(icons|backgrounds|logo|sounds)/[A-Za-z0-9._\u4e00-\u9fff/-]*[A-Za-z0-9._\u4e00-\u9fff-]"
)
PWA_REF = re.compile(r"/static/assets/[A-Za-z0-9._/-]+")

#: 历史遗留名：只作为「旧值 → 新值」迁移映射的键出现，不是加载路径（`.webp` 才是）。
#: 新增条目必须说明为什么该名字不可能出现在运行期，否则请修引用而不是往这里加。
LEGACY_BUILTIN_ALIASES = {
    "/backgrounds/light_on.png": "旧布局持久化值的迁移键（见 stores/ui/create-layout-persistence.ts），运行期已不再加载",
    "/backgrounds/light_off.png": "同上",
}


def load_png_size(path: Path) -> tuple[int, int] | None:
    """读 PNG 的 IHDR 像素尺寸；非 PNG / 截断返回 ``None``（不猜）。"""
    try:
        head = path.read_bytes()[:33]
    except OSError:
        return None
    if len(head) < 24 or head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    width, height = struct.unpack(">II", head[16:24])
    return int(width), int(height)


class Corpus:
    """一次遍历得到的「引用 → 出处」索引，供两个根共用。"""

    def __init__(self, repo: Path) -> None:
        paths = list(scan.walk_many([repo / item for item in CORPUS_DIRS], CORPUS_EXTS))
        for extra in CORPUS_FILES:
            path = repo / extra
            if path.is_file():
                paths.append(path)
        # webmanifest 也进语料：它引用 `icons/**`，但自身不是图标（无自指问题）。
        manifest_dir = repo / PWA_DIR / "manifest"
        if manifest_dir.is_dir():
            paths.extend(sorted(manifest_dir.glob("*.webmanifest")))
        self.paths = sorted(set(paths))
        self.builtin: dict[str, str] = {}
        self.pwa: dict[str, str] = {}
        self.manifests: list[Path] = []
        self._scan()

    def _scan(self) -> None:
        for path in self.paths:
            text = scan.read_text(path)
            if text is None:
                continue
            where = path.as_posix()
            for match in BUILTIN_REF.finditer(text):
                self.builtin.setdefault(match.group(0), where)
            for match in PWA_REF.finditer(text):
                value = match.group(0)
                if value.endswith(("/", "...")):
                    continue
                self.pwa.setdefault(value, where)
            if path.suffix == ".webmanifest":
                if path not in self.manifests:
                    self.manifests.append(path)


def rel(root: Path, path: Path) -> str:
    return scan.rel(root, path)


def builtin_files(repo: Path) -> list[Path]:
    root = repo / BUILTIN_DIR
    if not root.is_dir():
        return []
    return sorted(path for path in root.rglob("*") if path.is_file())


def pwa_files(repo: Path) -> list[Path]:
    root = repo / PWA_DIR
    if not root.is_dir():
        return []
    return sorted(path for path in root.rglob("*") if path.is_file())


def check_builtin(repo: Path, corpus: Corpus, problems: list[str]) -> int:
    """内置素材：引用必须落盘 + `logo`/`sounds`/`backgrounds` 不得有死资源。"""
    root = repo / BUILTIN_DIR
    if not root.is_dir():
        problems.append(f"内置素材根缺失：{BUILTIN_DIR}（目录改名后门禁会静默变绿，故按硬失败处理）")
        return 0

    checked = 0
    for url, where in sorted(corpus.builtin.items()):
        checked += 1
        if url in LEGACY_BUILTIN_ALIASES:
            continue
        if not (root / url.lstrip("/")).is_file():
            problems.append(
                f"{url}：引用自 {rel(repo, Path(where))}，但 {BUILTIN_DIR}{url} 不存在"
                f"（会静默降级：图片空、音效不响；旧名迁移键请加进 LEGACY_BUILTIN_ALIASES 并说明）"
            )

    referenced = set(corpus.builtin)
    for path in builtin_files(repo):
        relative = path.relative_to(root).as_posix()
        head = relative.split("/", 1)[0]
        if head not in BUILTIN_OWNED_DIRS:
            continue  # `icons/` 是枚举消费，见模块 docstring
        if f"/{relative}" not in referenced:
            problems.append(f"{BUILTIN_DIR}/{relative}：磁盘上有该素材，但全仓没有任何引用 —— 死资源，请删掉或补上引用")
    return checked


def check_pwa(repo: Path, corpus: Corpus, problems: list[str]) -> tuple[int, int]:
    """PWA 品牌资源：引用落盘 + 清单自洽 + 无死图标 + 成族完整。"""
    root = repo / PWA_DIR
    if not root.is_dir():
        problems.append(f"PWA 资源根缺失：{PWA_DIR}（目录改名后门禁会静默变绿，故按硬失败处理）")
        return 0, 0

    checked = 0
    for url, where in sorted(corpus.pwa.items()):
        checked += 1
        if not (repo / "homeos/frontend/public" / url.lstrip("/")).is_file():
            problems.append(
                f"{url}：引用自 {rel(repo, Path(where))}，但 public{url} 不存在"
                "（产物里就是 404，PWA 图标/清单会整体失效）"
            )

    # ① 清单里的图标：路径必须在 icons/ 内、落盘、且声明尺寸与 PNG 实际像素一致。
    for manifest in corpus.manifests:
        try:
            payload = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            problems.append(f"{rel(repo, manifest)}：无法解析 webmanifest（{error}）")
            continue
        for index, icon in enumerate(payload.get("icons") or []):
            src = str((icon or {}).get("src", ""))
            where = f"{rel(repo, manifest)} 的 icons[{index}]"
            if not src.startswith("/static/assets/icons/"):
                problems.append(f"{where}：src `{src}` 不在 `/static/assets/icons/` 下（清单只登记图标目录）")
                continue
            checked += 1
            target = repo / "homeos/frontend/public" / src.lstrip("/")
            if not target.is_file():
                problems.append(f"{where}：src `{src}` 指向的文件不存在")
                continue
            declared = str((icon or {}).get("sizes", "")).strip()
            actual = load_png_size(target)
            if declared and actual is not None and declared != f"{actual[0]}x{actual[1]}":
                problems.append(
                    f"{where}：`{src}` 声明 {declared}，实际像素 {actual[0]}x{actual[1]}"
                    "（重新生成图标时档位/尺寸对不上，安装到桌面就是糊图或被系统丢弃）"
                )

    # ② 磁盘 → 引用：图标与清单都不是装饰品，没人引用就是死文件。
    referenced = set(corpus.pwa)
    pwa_relative = {rel(root, path) for path in pwa_files(repo)}
    for relative in sorted(pwa_relative):
        if f"/static/assets/{relative}" not in referenced:
            problems.append(f"{PWA_DIR}/{relative}：磁盘上有该文件，但全仓没有任何引用 —— 死资源，请删掉或补上引用")

    # ③ 成族完整性：每个手持档都要有同一组尺寸，否则漏生成的档位只在真机上暴露。
    expected = (
        {f"icons/homeos-icon-{size}{family}.png" for family in ICON_FAMILIES for size in ICON_SIZES}
        | {f"icons/homeos-favicon{family}.{ext}" for family in ICON_FAMILIES for ext in FAVICON_EXTS}
        | {f"icons/{mark}" for mark in BRAND_MARKS}
    )
    for name in sorted(expected - pwa_relative):
        family = next((item for item in ICON_FAMILIES if item and item in name), "")
        icon = re.match(r"icons/homeos-icon-(\d+)", name)
        if icon:
            problems.append(
                f"{PWA_DIR}/{name}：设备档 `{family or '默认'}` 缺 {icon.group(1)}x{icon.group(1)} 图标"
                "（新增档位时漏生成一个尺寸不会有任何报错，只有真机认得出）"
            )
        elif name.endswith((".ico", ".svg")) and "favicon" in name:
            problems.append(f"{PWA_DIR}/{name}：设备档 `{family or '默认'}` 缺 favicon（favicon 也要全档齐备）")
        else:
            problems.append(f"{PWA_DIR}/{name}：品牌标记缺失（登录页/展示页的水印来源）")

    unexpected = sorted(name for name in pwa_relative if name.startswith("icons/") and name not in expected)
    for name in unexpected:
        problems.append(
            f"{PWA_DIR}/{name}：图标目录里出现了命名约定之外的档位（约定："
            "`homeos-icon-<size>[-h3|-h4|-h5].png` / `homeos-favicon[-h3|-h4|-h5].(ico|svg)` / "
            "`homeos-mark-*.svg`；新增档位请同步 ICON_FAMILIES）"
        )
    return checked, len(pwa_relative)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repo", default=str(REPO), help="仓库根（自检注入 fixture 用）")
    parser.add_argument("--list", action="store_true", help="只打印统计，不判成败")
    args = parser.parse_args(argv)

    repo = Path(args.repo).resolve()
    problems: list[str] = []
    corpus = Corpus(repo)
    builtin_checked = check_builtin(repo, corpus, problems)
    pwa_refs, pwa_disk = check_pwa(repo, corpus, problems)

    if args.list:
        print(
            f"语料 {len(corpus.paths)} 个文件；内置素材引用 {len(corpus.builtin)} 条"
            f"（落盘 {len(builtin_files(repo))} 个文件），PWA 引用 {len(corpus.pwa)} 条"
            f"（落盘 {pwa_disk} 个文件，清单 {len(corpus.manifests)} 份）"
        )
        return 0

    if problems:
        print("✗ 静态资源门禁未通过：", file=sys.stderr)
        for item in problems:
            print(f"  - {item}", file=sys.stderr)
        return 1

    print(
        f"✓ 静态资源门禁通过：内置素材 {builtin_checked} 条引用（{len(builtin_files(repo))} 个文件）全部落盘，"
        f"{'+'.join(BUILTIN_OWNED_DIRS)} 无死资源；PWA 资源 {pwa_refs} 条引用（{pwa_disk} 个文件）全部落盘，"
        f"{len(corpus.manifests)} 份清单自洽，{len(ICON_FAMILIES)} 个设备档成族完整。"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
