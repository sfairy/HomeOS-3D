#!/usr/bin/env python3
"""API 错误码引用率门禁：**表里的每个码都必须有真实失败点**。

背景：``errors.py`` 的 ``API_ERROR`` 是 ``apiErrorCode`` 的正查表，前端按码分派文案。
Nest 侧退役后，角色 / MFA / 访客账户 / 旧 HA 直连等能力一并下线，但它们的错误码仍留在
表里：``HA_WS_NOT_CONNECTED``、``ACCESS_CHILD_NO_WHITELIST``、``AUTH_MFA_TOTP_INVALID`` …
全仓**零引用**（本轮已按本门禁口径清掉 98 个）。这类死码有三个真实危害：

1. 看代码的人以为存在那条分支，照抄到新功能里，于是错误码永远对不上前端；
2. 前端 i18n 表没法判断哪些码是活的，只能整表照搬，翻译与文案评审被噪声淹没；
3. ``apiErrorCode`` 是**契约**，表里的码多一个不会报错，只会静默不生效。

门禁做三件事：

1. 每个 ``API_ERROR`` 键都必须在**非注释**语料里被引用（``homeos`` / ``homeos-store`` /
   ``packages`` / ``ops`` 的 ``.py/.ts/.vue/.js/.mjs/.json``，排除定义文件与门禁自身）；
2. ``_MANUAL_DYNAMIC_PREFIXES`` 里挂的码必须都还在表里 —— 删码时忘了同步这张前缀表，
   就是「动态文案反查失效」这类只在极端路径才暴露的 bug；
3. 码唯一且形如 ``UPPER_SNAKE``（拼写变体会让正查表命中不了）。

判定逻辑本身由 ``ops/check/check_error_codes_selftest.py`` 用合成副本反向压住（该红时必须红）。

用法::

    python3 ops/check/check_error_codes.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

# 复用共享遍历器（`ops/lib/scan.py`）：Python 门禁此前各写一份递归遍历 + 跳目录清单，
# 正是 JS 侧已经吃过亏的「同一件事多份实现、漏一个后缀就静默变绿」。
# 放在 sys.path 注入之后：直接以脚本方式运行时，仓库根不在 sys.path 上。
from ops.lib import scan

#: 错误码真源（相对 ``ROOT``，便于自检把 ``ROOT`` 指到临时副本）。
ERRORS_PY_REL = Path("homeos") / "backend" / "src" / "platform" / "core" / "errors.py"

#: 引用扫描的语料根：四个工程全扫，避免「后端删了、前端还在按码分派」漏检。
CORPUS_ROOTS: tuple[str, ...] = ("homeos", "homeos-store", "packages", "ops")

#: 可能引用错误码的文件后缀（跨端契约，故含前端与 JSON）。
CORPUS_SUFFIXES: frozenset[str] = scan.CODE_EXTS

#: 门禁自身（含自检）不参与引用统计：它们为了说清口径会在文档与合成样本里成串地写码名，
#: 计入语料就会变成「删了码、但门禁的散文里还留着 → 门禁自认为它活着」这类假绿。
SELF_FILES: frozenset[str] = frozenset({"check_error_codes.py", "check_error_codes_selftest.py"})

_DICT_HEAD = "API_ERROR: dict"
_MANUAL_HEAD = "_MANUAL_DYNAMIC_PREFIXES"

#: 形如 ``"CODE": ...`` 的表项行（缩进 + 键 + 冒号）。
_ENTRY_LINE = re.compile(r'^\s*"(?P<code>[A-Z][A-Z0-9_]*)"\s*:')
#: ``("中文前缀 ", "CODE"),`` 形式的手工前缀兜底项。
_MANUAL_LINE = re.compile(r'^\s*\(\s*"[^"]*"\s*,\s*"(?P<code>[A-Z][A-Z0-9_]*)"\s*\)\s*,?\s*$')
#: ``UPPER_SNAKE`` 形态的整词候选（长度 ≥3，避免误伤 ``ID``/``OK`` 这类短词）。
_CODE_TOKEN = re.compile(r"(?<![A-Za-z0-9_])[A-Z][A-Z0-9_]{2,}(?![A-Za-z0-9_])")
_UPPER_SNAKE = re.compile(r"[A-Z][A-Z0-9_]*")


def errors_path() -> Path:
    """错误码真源在**当前** ``ROOT`` 下的路径（自检会把 ``ROOT`` 指到临时副本）。"""
    return ROOT / ERRORS_PY_REL


def _bracket_region(text: str, head: str, opener: str, closer: str) -> str:
    """取出 ``head`` 所在赋值语句的括号内部。

    必须先跳到 ``=`` 再找括号：``list[tuple[str, str]] = [`` 的类型标注里也有 ``[``，
    直接取 head 之后的第一个括号会得到一个**空区间**，于是「前缀表里有没有死码」永远查不出问题
    （本门禁的自检就是靠这一条抓到了这个假绿）。
    """
    start = text.index(head)
    cursor = text.index(opener, text.index("=", start))
    depth = 0
    for index in range(cursor, len(text)):
        char = text[index]
        if char == opener:
            depth += 1
        elif char == closer:
            depth -= 1
            if depth == 0:
                return text[cursor + 1 : index]
    raise ValueError(f"{head} 的括号没有配对")


def _dict_region(text: str) -> str:
    """取出 ``API_ERROR`` 字面量的花括号内部（大括号配对，兼容嵌套的 ``{}``）。"""
    return _bracket_region(text, _DICT_HEAD, "{", "}")


def parse_api_error_keys(text: str) -> tuple[list[str], list[str]]:
    """解析 ``API_ERROR`` 的键，返回 ``(按出现顺序的码, 问题列表)``。"""
    problems: list[str] = []
    codes: list[str] = []
    for line in _dict_region(text).splitlines():
        match = _ENTRY_LINE.match(line)
        if match:
            codes.append(match.group("code"))
    seen: set[str] = set()
    duplicates: list[str] = []
    for code in codes:
        if code in seen and code not in duplicates:
            duplicates.append(code)
        seen.add(code)
    if duplicates:
        problems.append(f"API_ERROR 存在重复键：{duplicates}")
    problems.extend(
        f"错误码 {code} 不是 UPPER_SNAKE 形态" for code in codes if not _UPPER_SNAKE.fullmatch(code)
    )
    return codes, problems


def parse_manual_prefix_codes(text: str) -> list[str]:
    """解析 ``_MANUAL_DYNAMIC_PREFIXES`` 里挂的错误码（前缀表引用面）。"""
    region = _bracket_region(text, _MANUAL_HEAD, "[", "]")
    return [match.group("code") for match in _MANUAL_LINE.finditer(region)]


def strip_comments(text: str, suffix: str) -> str:
    """剥掉注释：只在注释里出现的码等于没有失败点，不算引用（口径见 ``ops/lib/scan.py``）。"""
    return scan.strip_comments(text, suffix)


def codes_in_text(text: str, suffix: str, codes: set[str]) -> set[str]:
    """返回文本（剥注释后）里被**整词**引用的码集合。"""
    stripped = strip_comments(text, suffix)
    if not stripped:
        return set()
    return set(_CODE_TOKEN.findall(stripped)) & codes


def corpus_files() -> list[Path]:
    """枚举语料文件（不含错误码定义文件与门禁自身）。"""
    files = scan.walk_many([ROOT / name for name in CORPUS_ROOTS], CORPUS_SUFFIXES)
    return [path for path in files if path != errors_path() and path.name not in SELF_FILES]


def unreferenced_codes(codes: list[str], files: list[Path]) -> list[str]:
    """返回零引用码（按表内顺序）。"""
    wanted = set(codes)
    referenced: set[str] = set()
    for path in files:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        referenced |= codes_in_text(text, path.suffix, wanted)
        if len(referenced) == len(wanted):
            break
    return [code for code in codes if code not in referenced]


def collect_problems() -> list[str]:
    """全量检查，返回问题列表（空 = 通过）。"""
    source = errors_path()
    if not source.is_file():
        return [f"找不到错误码真源：{source}"]
    text = source.read_text(encoding="utf-8")
    try:
        codes, problems = parse_api_error_keys(text)
        manual_codes = parse_manual_prefix_codes(text)
    except (ValueError, IndexError) as error:
        # 「解析不到就放行」是解析型门禁最典型的假绿来源：写法一变，它照样打印通过。
        return [f"{ERRORS_PY_REL.as_posix()} 解析失败：{error}（错误码表写法变了？）"]
    if not codes:
        return [*problems, f"{ERRORS_PY_REL.as_posix()} 里解析不到任何 API_ERROR 键（写法变了？）"]
    known = set(codes)
    for code in manual_codes:
        if code not in known:
            problems.append(
                f"_MANUAL_DYNAMIC_PREFIXES 指向已不存在的码 {code}（动态文案反查会失效）"
            )
    for code in unreferenced_codes(codes, corpus_files()):
        problems.append(f"错误码 {code} 全仓零引用：要么在真实失败点抛出，要么从表里删掉")
    return problems


def main() -> int:
    problems = collect_problems()
    if problems:
        print("✗ API 错误码门禁未通过：")
        for problem in problems:
            print(f"    - {problem}")
        return 1
    codes, _ = parse_api_error_keys(errors_path().read_text(encoding="utf-8"))
    print(f"✓ API_ERROR {len(codes)} 个码全部有真实失败点；前缀表引用的码都在表内。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
