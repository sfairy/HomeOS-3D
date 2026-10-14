"""Python 门禁共用的扫描原语（``ops/lib/scan.mjs`` 的 Python 同胞）。

为什么要有这个文件：Python 侧的几道门禁（错误码引用率、``@deprecated`` 转发桩、后端分层）
各自写了一份「递归遍历 + 跳目录 + 剥注释」，而 JS 侧早就因为同一件事吃过一次亏 ——
三份遍历器里有两份漏了扩展名（``.tsx`` / 副作用 import），于是「组件里的越界引用永远看不见」。
Python 侧正在重演同一条路：漏一个后缀就是一道**静默变绿**的门禁。

一份遍历器 + 一份跳目录清单，才是「新加一门禁就自动拥有同一口径」的前提。

只依赖标准库，供 ``ops/check_*.py`` 与各自的自检复用。
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Iterator
from pathlib import Path

#: 遍历时永远跳过的目录名（依赖、产物、虚拟环境、运行时数据）。
SKIP_DIRS: frozenset[str] = frozenset(
    {
        ".git",
        ".venv",
        ".venv-store",
        "__pycache__",
        "backups",
        "build",
        "coverage",
        "data",
        "dist",
        "node_modules",
        "vendor",
    }
)

#: 后端源码后缀。
PY_EXTS: frozenset[str] = frozenset({".py"})

#: 跨语言（含前端）语料后缀 —— 错误码 / 特性码这类**跨端契约**必须按它扫。
CODE_EXTS: frozenset[str] = frozenset({".py", ".ts", ".tsx", ".vue", ".js", ".mjs", ".cjs", ".json"})

#: TypeScript / Vue 源码后缀。
TS_EXTS: frozenset[str] = frozenset({".ts", ".tsx", ".vue"})


def walk(
    root: Path,
    exts: Iterable[str],
    skip_dirs: Iterable[str] = SKIP_DIRS,
) -> list[Path]:
    """递归收集 ``root`` 下指定后缀的文件（跳过 ``skip_dirs`` 中的目录名）。

    返回**排序后**的列表：门禁输出必须稳定可 diff，否则「新增一条问题」会被淹没在
    随机顺序里。``root`` 不存在时返回空列表（由调用方自行决定这算不算失败 ——
    「目录改名后门禁静默变绿」要显式判，不能靠遍历器默认通过）。
    """
    suffix_filter = set(exts)
    skip = set(skip_dirs)
    if not root.is_dir():
        return []
    found: list[Path] = []
    _collect(root, suffix_filter, skip, found)
    found.sort()
    return found


def _collect(directory: Path, exts: set[str], skip: set[str], out: list[Path]) -> None:
    for entry in sorted(directory.iterdir(), key=lambda item: item.name):
        if entry.name in skip:
            continue
        if entry.is_dir():
            _collect(entry, exts, skip, out)
        elif entry.is_file() and entry.suffix in exts:
            out.append(entry)


def walk_many(
    roots: Iterable[Path],
    exts: Iterable[str],
    skip_dirs: Iterable[str] = SKIP_DIRS,
) -> list[Path]:
    """多根遍历（跨工程语料），结果同样排序、去重。"""
    files: list[Path] = []
    seen: set[Path] = set()
    for root in roots:
        for path in walk(root, exts, skip_dirs):
            if path not in seen:
                seen.add(path)
                files.append(path)
    files.sort()
    return files


#: Python 单行注释。
_PY_COMMENT = re.compile(r"(?m)#.*$")
#: 块注释（JS/TS/Vue 用）。
_BLOCK_COMMENT = re.compile(r"/\*[\s\S]*?\*/")
#: JS/TS 单行注释（保留 ``://`` 这类 URL 字面量与 ``http://`` 协议头）。
_JS_COMMENT = re.compile(r"(?m)(^|[^:])//.*$")


def _strip_python(text: str) -> str:
    """按 Python 词法剥注释：**字符串里**的 `#` 不是注释。

    为什么必须按词法走：正则版（`#.*$`）会把 `'#'`、`f"#{id}"` 这类字符串从中间切开，
    于是「剥注释」反而制造出半个字符串 —— 引用扫描随之漏掉或误报。
    """
    out: list[str] = []
    index = 0
    length = len(text)
    while index < length:
        char = text[index]
        if char == "#":
            while index < length and text[index] != "\n":
                index += 1
            continue
        if char in {'"', "'"}:
            triple = text[index : index + 3]
            if triple == char * 3:
                end = text.find(char * 3, index + 3)
                end = length if end == -1 else end + 3
            else:
                end = index + 1
                while end < length:
                    if text[end] == "\\":
                        end += 2
                        continue
                    if text[end] == char:
                        end += 1
                        break
                    if text[end] == "\n":
                        break
                    end += 1
            out.append(text[index:end])
            index = end
            continue
        out.append(char)
        index += 1
    return "".join(out)


def _strip_js(text: str) -> str:
    """按词法剥 JS/TS 的 `//` 与 `/* */`：字符串里的一律不算注释。

    旧实现是两条正则串联（先块注释、后行注释），而块注释正则会**从行注释里的 `/static/**`
    起头**一直吞到 147 行之后的下一个 `*/`（`vite.config.ts` 实测）—— 被吞掉的代码在门禁眼里
    等于不存在，属于「静默漏检」。按词法走一遍就不会把字符串与注释搞混。
    """
    out: list[str] = []
    index = 0
    length = len(text)
    while index < length:
        char = text[index]
        nxt = text[index + 1] if index + 1 < length else ""
        if char == "/" and nxt == "/":
            while index < length and text[index] != "\n":
                index += 1
            continue
        if char == "/" and nxt == "*":
            end = text.find("*/", index + 2)
            index = length if end == -1 else end + 2
            continue
        if char in {'"', "'", "`"}:
            end = index + 1
            while end < length:
                if text[end] == "\\":
                    end += 2
                    continue
                if text[end] == char:
                    end += 1
                    break
                if char != "`" and text[end] == "\n":
                    break
                end += 1
            out.append(text[index:end])
            index = end
            continue
        out.append(char)
        index += 1
    return "".join(out)


def strip_comments(text: str, suffix: str) -> str:
    """剥掉注释：只在注释里出现的标识符等于没有真实引用，不算命中。

    与 ``scan.mjs`` 的 ``blankComments`` 同口径（同一次词法扫描，两份实现必须一起改）；
    这里返回**删除后**的文本，因为 Python 门禁都是「整词匹配」而非「按行号报点」。
    """
    if suffix in PY_EXTS:
        return _strip_python(text)
    return _strip_js(text)


def rel(root: Path, path: Path) -> str:
    """posix 风格相对路径（门禁输出用，跨平台稳定）。"""
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def under(rel_path: str, prefix: str) -> bool:
    """``rel_path`` 是否等于 ``prefix`` 或落在 ``prefix/`` 之下。"""
    return rel_path == prefix or rel_path.startswith(f"{prefix}/")


def read_text(path: Path) -> str | None:
    """读文本；二进制 / 编码异常 / 权限问题一律返回 ``None``（调用方按「读不到就跳过」处理）。"""
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None


def iter_lines(text: str) -> Iterator[tuple[int, str]]:
    """``(行号, 行内容)``，行号从 1 开始（报点统一用它，别各写各的）。"""
    yield from enumerate(text.splitlines(), start=1)


__all__ = [
    "CODE_EXTS",
    "PY_EXTS",
    "SKIP_DIRS",
    "TS_EXTS",
    "iter_lines",
    "read_text",
    "rel",
    "strip_comments",
    "under",
    "walk",
    "walk_many",
]
