#!/usr/bin/env python3
"""前端「死 CSS 规则块」判定器（严格版：模拟类名**如何被发射**，而不是子串是否存在）。

## 为什么不能用子串扫描

朴素做法是「类名在 .vue/.ts 里出现过就算活」。两个方向都错：

- **假活**：`.climate-card` 与 `dgm-climate-card` 是**不同**的 class token（CSS 的 class 选择器
  按空白分隔的整词匹配），可朴素子串扫描会把后者当成前者的使用点，于是死规则被「救活」。
- **假死**：`` `dgm-modal-head--${domain}` `` 这类模板串只在源码里留下静态前缀，拼出来的
  完整类名永不出现在文本里，朴素扫描会把**活规则**判死 —— 删了就是视觉回归。

本脚本只做第一件事：**枚举所有会被发射的 class token**，然后给出「可以安全删除」的规则块。
判定口径与 `scripts/check-css-classes.mjs`（`wr-*` 专项门禁）一致 —— 只删「整块死」：

    一块的**每条逗号分支**里，只要有一个参与匹配条件的 class token 不可发射（该 token 出现在
    `:is()/:not()/:has()/:where()` 之外，且它不会出现在任何元素上），这条分支就恒不匹配；
    整块所有分支都恒不匹配 → 该块可删。

含 `:is(.dead, .live)` 这类分支一律**保留**（`stripGroups` 把括号内容抹掉后不再硬依赖它）。
`@keyframes` / 纯元素选择器 / `:root` 变量块从不参与删除。

## 发射来源（五个桶）

| 桶 | 含义 | 是否可自动删 |
|---|---|---|
| `literal` | 源码字面量里出现过该整词（`class=`、`classList.add`、`:class` 的键、任何字符串字面量） | 否（活） |
| `dynamic` | 某个模板串/字符串拼接的静态前缀或后缀能拼出它 | 否（活，保守） |
| `runtime` | 框架/库**运行期自己**加上的类：Vue `<Transition name=x>` 的 `x-enter-active`、`router-link-active`、`swiper-*` … | 否（活） |
| `css-only` | 只在**其它 CSS 文件**的选择器里出现，源码里发射不到 | **否**（只报告，人工复核） |
| `nowhere` | 源码、动态前后缀、运行期命名空间、其它 CSS 全都没有 | **是**（本脚本的可删集合） |

扫描面（发射来源）刻意覆盖全部可能产出 DOM class 的地方：两个前端的 `src`/`public`、
`packages/shared`（共享组件会发射 class）、新前端源码、后端 `.py`（面板文档/SSR 模板里可能有
class 字符串）。**不扫 `.md`/文档** —— 文档里提到类名不等于发射，否则死规则会被说明文字救活。

## 四条必须守住的护栏（都踩过坑）

1. **词边界**：`.climate-card` 与 `dgm-climate-card` 是两个不同的 class（选择器按空白分隔的整词
   匹配），子串扫描会把后者的出现当成前者的使用点，于是死规则被「救活」。
2. **通用前后缀不能设高门槛**：`` `is-${tone}` `` / `"is-" + state` 是真实存在的写法，门槛设成 5
   字符就会把 `is-armed` 这类**活**状态类判死 → 删了就是视觉回归。取 3。
3. **运行期类名**：Vue 的 `<Transition>` 由 `name` prop 拼出 `${name}-enter-active` 等，源码里只有
   `name` 的字面量；漏掉这一族就是删了活规则。
4. **自指**：死类名门禁（`check-css-classes.mjs`）和它的自检夹具里写着 `wr-bar`/`wr-slider` 这类
   **假类名**，它们是「用来证明某命名空间是死的」而不是发射点。把它们算进发射来源，`wr-` 就会被
   自己续命，门禁永远红着也清不掉（`PROVEN_DEAD_NAMESPACES` + `SELF_REFERENCE_FILES` 就是为了堵它）。

## 写回的两个硬约束

* **整行对齐**：删除区间必须覆盖「选择器所在整行」（保留行首那个换行，否则上一个块的 `}` 会和下一个
  规则粘成 `}C {`）；`analyse_file` 里对此有断言。
* **原样行尾**：仓库 LF / CRLF 混存，读写都走 `newline=""`；用通用换行会让 CRLF 文件整篇变成「伪改动」，
  `git diff --numstat` 的插入行数会暴涨到上万行，掩盖真实删除量。

## 用法

    python3 ops/css_dead_classes.py                     # 报告全部 .css
    python3 ops/css_dead_classes.py --json out.json     # 同时导出机器可读结果
    python3 ops/css_dead_classes.py --apply             # 就地删除可删块（级联到收敛，最多 4 轮）
    python3 ops/css_dead_classes.py --file <相对路径>    # 只看某个样式表
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]

# 发射来源扫描面：两个前端 + 共享包 + 后端（模板/文档字符串里可能有 class）
SOURCE_ROOTS = (
    "homeos/frontend",
    "homeos-store/frontend",
    "packages/shared",
    "homeos/backend",
    "homeos-store/backend",
)
SOURCE_SUFFIXES = (
    ".vue", ".ts", ".js", ".mjs", ".cjs", ".tsx", ".jsx", ".html", ".py", ".json",
)
CSS_SUFFIXES = (".css",)
SKIP_DIRS = {"node_modules", "dist", "__pycache__", ".git", "coverage", ".venv-store"}

CLASS_TOKEN = re.compile(r"^-?[A-Za-z_][A-Za-z0-9_-]*$")
CLASS_TOKEN_STRICT = re.compile(r"(?<![A-Za-z0-9_-])(-?[A-Za-z_][A-Za-z0-9_-]*)(?![A-Za-z0-9_-])")

#: 动态拼接的静态前缀/后缀短于这个长度就当噪音丢掉（`a` + x 之类）。
#: 注意 **不能**把门槛设得太高：`` `is-${tone}` `` / `` "is-" + state `` 这类两三字符的
#: 通用状态前缀是真实存在的（`weather/LifeIndices`、`studio` 的 `presence-details` 都在用），
#: 门槛一高就会把 `is-armed` 这类**活的**状态类判死 → 删了就是视觉回归。取 3。
MIN_AFFIX = 3

#: 但「长度够」远远不够 —— 一个 4 字符的 `link`、6 字符的 `label` 会把**任意**以它开头/结尾的
#: 类名都「解释」成动态拼出来的（`cf-compare-label` 靠 `-label`、`linkage-hub-card__icon` 靠
#: `link`、`acc-hero-stat--mfa-off` 靠 `-off`），于是死规则永远救不回来。真正的动态发射，其静态
#: 部分是**带结构的长串**（BEM 的 `__`/`--`，或多段 `-`）：`` `dgm-modal-head--${domain}` ``、
#: `` `afh-nav__pill--${color}` ``、`` `charge-device-card--kind-${d}` ``。据此分两级：
STRUCTURAL_MIN_LEN = 8

#: 约定俗成的状态钩子前缀：`is-`/`has-` 是 Vue 生态通行的「状态类」写法，值往往来自后端数据或
#: 组件内部状态，静态扫不出来，但删掉就是状态样式失效。**永不参与删除**。
STATE_HOOK_PREFIXES = ("is-", "has-", "js-", "v-")


def is_structural_affix(affix: str) -> bool:
    """静态部分是否「像真的类名前缀/后缀」而不是碰巧的通用词。

    `dgm-modal-head--` / `afh-nav__pill--` / `-panel-head` → True；
    `link` / `label` / `off` / `active` / `climate` → False（这些会把死规则无限救活）。
    """
    if len(affix) < STRUCTURAL_MIN_LEN:
        return False
    return "__" in affix or "--" in affix or affix.count("-") >= 2

#: 运行期由框架/库**自己**加上的类名 —— 源码里搜不到，但元素上一定会有。
#: 漏掉它们就是「删了活规则」的经典事故：
#:   * Vue ``<Transition name="drawer">`` → 运行期加 ``drawer-enter-active`` / ``-/leave-to`` / ``-move`` …
#:     （名字由 name prop 决定，源码里的字面量只有 ``drawer``，拼出来的后缀搜不到）
#:   * vue-router 的 ``router-link-active`` / ``router-link-exact-active``
#:   * 第三方组件（swiper / echarts / leaflet / monaco / sortable 等）注入的 ``<lib>-*`` 状态类
RUNTIME_SUFFIX = re.compile(r"-(?:enter|leave|appear)(?:-(?:from|active|to))?$|-move$")
RUNTIME_PREFIXES = (
    "router-link-", "v-", "swiper-", "echarts-", "leaflet-", "monaco-",
    "sortable-", "mdc-", "vjs-", "video-js", "cdk-", "leaflet",
)

#: 不参与删除的素材：压缩/生成产物（图标字体、第三方 renderer、运行时打包件）。
#: 它们的类名由外部工具或运行期动态拼装（``icon-${name}``），逐块判死没有意义。
VENDOR_PATTERNS = (".min.css",)
VENDOR_PATH_PARTS = ("/public/static/", "/node_modules/")

#: 死 CSS 工装自身：它们**定义**「哪个命名空间是死的」（门禁正则、自检夹具里的 `wr-bar`
#: 之类假类名）。若把这些文件算作发射来源，就会出现「用证明死类名的工具自己给该命名空间
#: 续命」的自指：`wr-` 被当成活前缀，门禁一直红却永远清不掉。
SELF_REFERENCE_FILES = {
    "homeos/frontend/scripts/check-css-classes.mjs",
    "homeos/frontend/scripts/_css_classes_selftest.mjs",
    "ops/css_dead_classes.py",
}

#: 已被门禁（`check-css-classes.mjs`）证明「全仓零发射」的命名空间：`wr-*` 是早期
#: widget-renderer 外壳的残留，代码侧（`.vue/.ts/.js`、`public/`、后端模板）没有任何地方会
#: 把它加到元素上。这类类名直接判死，**不受通用前后缀干扰** —— 否则源码里一句
#: `` `${x}-head` `` 产生的后缀 `-head` 会把 `.wr-tpl-panel__head` 这种确定的死规则「救活」，
#: 于是门禁一直红着却永远清不掉（Batch C 遗留的正是这个坑）。
#: 门禁本身带「命名空间重现就放行」的护栏，两边口径始终一致。
PROVEN_DEAD_NAMESPACES = ("wr-",)


def blank_comments(text: str) -> str:
    """注释抹白（保留换行），避免注释里的括号/引号干扰解析。"""
    text = re.sub(r"/\*[\s\S]*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), text)
    text = re.sub(r"<!--[\s\S]*?-->", lambda m: re.sub(r"[^\n]", " ", m.group(0)), text)
    return text


def strip_js_comments(text: str) -> str:
    text = re.sub(r"/\*[\s\S]*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), text)
    text = re.sub(r"(?m)^\s*//.*$", "", text)
    return text


STRING_LITERAL = re.compile(
    r"""'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`""",
    re.DOTALL,
)
TEMPLATE = re.compile(r"`(?:[^`\\]|\\.)*`", re.DOTALL)
CONCAT_TAIL = re.compile(r"""(['"`])((?:[^'"`\\\n]|\\.)*)\1\s*\+\s*[A-Za-z_$]""")
CONCAT_HEAD = re.compile(r"""[A-Za-z_$][\w.$\[\]']*\s*\+\s*(['"`])((?:[^'"`\\\n]|\\.)*)\1""")


def tokens_of(text: str) -> set[str]:
    """把一段文本里所有「整词」当候选 class token（供字面量/后缀用）。"""
    return {m.group(1) for m in CLASS_TOKEN_STRICT.finditer(text) if CLASS_TOKEN.match(m.group(1))}


def iter_files(roots, suffixes):
    for rel in roots:
        base = ROOT / rel
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix not in suffixes:
                continue
            if SKIP_DIRS & set(path.parts):
                continue
            if str(path.relative_to(ROOT)) in SELF_REFERENCE_FILES:
                continue
            yield path


def collect_emitted() -> tuple[set[str], set[str], set[str], dict[str, set[str]]]:
    """返回 (字面量 token, 动态前缀, 动态后缀, CSS 里出现的 token → 文件集合)。"""
    literals: set[str] = set()
    prefixes: set[str] = set()
    suffixes: set[str] = set()
    css_tokens: dict[str, set[str]] = {}

    for path in iter_files(SOURCE_ROOTS, SOURCE_SUFFIXES):
        rel = str(path.relative_to(ROOT))
        try:
            raw = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        text = strip_js_comments(raw) if path.suffix != ".py" else raw

        for match in STRING_LITERAL.finditer(text):
            body = match.group(0)[1:-1]
            if "${" in body and match.group(0).startswith("`"):
                continue  # 带插值的模板串单独处理
            literals.update(t for t in tokens_of(body) if CLASS_TOKEN.match(t))

        # 动态拼接：模板串的静态首/尾，以及 `'lit' + x` / `x + 'lit'` 两侧的字面量
        for match in TEMPLATE.finditer(text):
            body = match.group(0)[1:-1]
            if "${" not in body:
                continue
            head = body.split("${", 1)[0]
            tail = body.rsplit("}", 1)[-1]
            for tok in tokens_of(head):
                prefixes.add(tok)
            for tok in tokens_of(tail):
                suffixes.add(tok)
        for match in CONCAT_TAIL.finditer(text):
            for tok in tokens_of(match.group(2)):
                prefixes.add(tok)
        for match in CONCAT_HEAD.finditer(text):
            for tok in tokens_of(match.group(2)):
                suffixes.add(tok)

        # 该文件里出现的 class-ish 字面量本身也算（上面的 tokens_of 已覆盖）

    for path in iter_files(SOURCE_ROOTS, CSS_SUFFIXES):
        rel = str(path.relative_to(ROOT))
        try:
            text = blank_comments(path.read_text(encoding="utf-8", errors="ignore"))
        except OSError:
            continue
        for match in re.finditer(r"\.(-?[A-Za-z_][A-Za-z0-9_-]*)", text):
            tok = match.group(1)
            css_tokens.setdefault(tok, set()).add(rel)

    return (
        literals,
        {p for p in prefixes if len(p) >= MIN_AFFIX},
        {s for s in suffixes if len(s) >= MIN_AFFIX},
        css_tokens,
    )


class Liveness:
    def __init__(self, literals, prefixes, suffixes, css_tokens):
        self.literals = literals
        self.prefixes = prefixes
        self.suffixes = suffixes
        self.css_tokens = css_tokens

    def verdict(self, token: str, own_file: str) -> str:
        if token in self.literals:
            return "literal"
        if token.startswith(STATE_HOOK_PREFIXES):
            return "state-hook"
        if token.startswith(PROVEN_DEAD_NAMESPACES):
            return "nowhere"
        if RUNTIME_SUFFIX.search(token) or token.startswith(RUNTIME_PREFIXES):
            return "runtime"
        weak = False
        for affix in self.prefixes:
            if not token.startswith(affix):
                continue
            if is_structural_affix(affix):
                return "dynamic"
            weak = True
        for affix in self.suffixes:
            if not token.endswith(affix):
                continue
            if is_structural_affix(affix):
                return "dynamic"
            weak = True
        if weak:
            # 只有「通用词级」的前后缀能解释它（`-label` / `link` / `-off`）：证据太弱，
            # 默认不删，列成待人工复核的 weak-dynamic 桶。
            return "weak-dynamic"
        others = {f for f in self.css_tokens.get(token, set()) if f != own_file}
        if others:
            return "css-only"
        return "nowhere"


def is_vendor(path: pathlib.Path) -> bool:
    rel = "/" + str(path.relative_to(ROOT))
    if path.name.endswith(VENDOR_PATTERNS):
        return True
    return any(part in rel for part in VENDOR_PATH_PARTS)


def find_blocks(text: str):
    """返回所有块（含嵌套）：selector 文本 + 花括号下标区间。"""
    blocks = []
    stack: list[list] = []
    buf = 0
    for i, ch in enumerate(text):
        if ch == "{":
            stack.append([buf, i, text[buf:i]])
            buf = i + 1
        elif ch == "}":
            if stack:
                start, brace, selector = stack.pop()
                blocks.append({"start": start, "brace": brace, "end": i, "selector": selector})
                buf = i + 1
        elif ch == ";" and not stack:
            buf = i + 1
    return blocks


def strip_groups(selector: str) -> str:
    """去掉 `(...)`/`[...]` 内容（`:is()/:not()/:has()/:where()` 与属性选择器不是硬条件）。"""
    prev = selector
    for _ in range(8):
        nxt = re.sub(r"\([^()]*\)", "", prev)
        nxt = re.sub(r"\[[^\]]*\]", "", nxt)
        if nxt == prev:
            break
        prev = nxt
    return prev


def split_top(selector: str) -> list[str]:
    out, depth, buf = [], 0, ""
    for ch in selector:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(buf)
            buf = ""
        else:
            buf += ch
    out.append(buf)
    return [b for b in out if b.strip()]


def branch_classes(branch: str) -> list[str]:
    return [
        m.group(1)
        for m in re.finditer(r"\.(-?[A-Za-z_][A-Za-z0-9_-]*)", strip_groups(branch))
    ]


def analyse_file(
    path: pathlib.Path,
    live: Liveness,
    css_only_dead: bool = False,
    weak_dynamic_dead: bool = False,
) -> tuple[str, list[dict]]:
    """返回 (文件原文, 可删块列表)。

    关键：**原文只读一次**，判定与写回都用这同一个字符串。Batch C 的教训是「分析时用一种读法
    （通用换行归一），写回时用另一种（`newline=''` 原样）」，两边字符串一旦不等长，删出来的
    就是错位切片（`gap: var(--hos` 被削掉半截那种）。这里从根上杜绝。
    """
    rel = str(path.relative_to(ROOT))
    # newline="" 原样读写：仓库里 LF / CRLF 混存，通用换行会让 CRLF 文件整篇「伪改动」。
    raw = path.read_text(encoding="utf-8", newline="")
    text = blank_comments(raw)
    deletable = []
    for block in find_blocks(text):
        selector = block["selector"].strip()
        # `@media/@supports/...` 包装块不参与；`:is(...)`/`:deep(...)` **开头的选择器要参与**
        # —— Batch C 就是漏了这类（`:is(.a, .b) .wr-xxx`），门禁一直在报却没被清掉。
        # `:root` 之类没有 class 的选择器由下面的「必须硬依赖某个 class」自然排除。
        if not selector or selector.startswith("@"):
            continue
        # 只考虑「至少有一个 class 参与硬条件」的块
        if not re.search(r"\.(-?[A-Za-z_][A-Za-z0-9_-]*)", strip_groups(selector)):
            continue
        branches = split_top(selector)
        if not branches:
            continue
        per_branch = []
        for branch in branches:
            classes = branch_classes(branch)
            # 一条分支的硬条件里，**只要有一个**类名不可发射，该分支就永远匹配不到
            # （元素上根本不会有这个类）。所以是 any 而不是 all：`.dead-x.live-y` 同样是死分支。
            bad = []
            for c in classes:
                verdict = live.verdict(c, rel)
                if verdict == "nowhere":
                    bad.append(c)
                elif verdict == "css-only" and css_only_dead:
                    # `css-only` 只是「别的 .css 里也写了这个名字」，而 CSS 选择器**不会把类名加到元素上**
                    # —— 所以它本身不构成活证据，只表示「大概率是我们自己的类、值得人工确认」。
                    # 确认（全仓反向核对命中 0）后可开开关一并清掉。
                    bad.append(c)
                elif verdict == "weak-dynamic" and weak_dynamic_dead:
                    # 只被通用词级前后缀解释（`-label`/`link`/`-off`）——默认不删。
                    bad.append(c)
            per_branch.append((branch.strip(), classes, bad))
        # 整块的**每条**逗号分支都恒不匹配 → 整块可删
        if not all(bad for _, _, bad in per_branch):
            continue

        # 删除区间 = 整个块所在的行（含选择器、花括号、行尾换行）。
        # 关键：行首的换行**必须保留** —— 否则上一个块的 `}` 会和下一个规则粘成
        # `}C {`，正是上一版把 `gap: var(--hos` 削成 `displays-...` 的成因。
        head = block["start"]
        while head < block["brace"] and text[head] in " \t\r\n":
            head += 1
        start = raw.rfind("\n", 0, head) + 1
        end = block["end"] + 1
        while end < len(raw) and raw[end] in " \t\r":
            end += 1
        if end < len(raw) and raw[end] == "\n":
            end += 1
        assert start == 0 or raw[start - 1] == "\n", (
            f"删除区间未对齐行首：{rel} :: {selector!r}"
        )
        assert end >= len(raw) or raw[end - 1] == "\n", (
            f"删除区间未对齐行尾：{rel} :: {selector!r}"
        )
        assert text[block["start"]:block["brace"]].strip() == selector, (
            f"选择器偏移与实际文本不符：{rel} :: {selector!r}"
        )
        assert text[block["end"]] == "}", f"块尾偏移不是 '}}'：{rel} :: {selector!r}"
        deletable.append({
            "file": rel,
            "selector": selector,
            "start": start,
            "end": end,
            "dead": sorted({c for _, _, bad in per_branch for c in bad}),
            "branches": len(per_branch),
        })
    return raw, deletable


def _drop_empty_wrappers(text: str) -> str:
    """删掉被掏空的 `@media`/`@supports`/`@layer` 包装块（只剩空白）。"""
    while True:
        removed = False
        for block in sorted(find_blocks(blank_comments(text)), key=lambda b: b["brace"], reverse=True):
            if not block["selector"].strip().startswith("@"):
                continue
            if text[block["brace"] + 1:block["end"]].strip():
                continue
            text = text[:block["start"]] + text[block["end"] + 1:]
            removed = True
            break
        if not removed:
            return text


def apply_deletions(path: pathlib.Path, raw: str, blocks: list[dict]) -> None:
    """按原文精确切片删除（重叠区间先合并），再清掉被掏空的 `@media` 包装。"""
    spans = sorted((b["start"], b["end"]) for b in blocks)
    merged: list[list[int]] = []
    for start, end in spans:
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    out, cursor = [], 0
    for start, end in merged:
        chunk = raw[cursor:start]
        if not chunk.endswith(("\n", "\r")) and chunk:
            # 上游块删除后不应在行中留下断口
            raise AssertionError(f"删除区间落在行中，拒绝写回：{path}")
        out.append(chunk)
        cursor = end
    out.append(raw[cursor:])
    text = _drop_empty_wrappers("".join(out))
    path.write_text(text, encoding="utf-8", newline="")


def main() -> int:
    ap = argparse.ArgumentParser(description="前端死 CSS 规则块判定器（严格版）")
    ap.add_argument("--json", help="把结果导出为 JSON")
    ap.add_argument("--apply", action="store_true", help="就地删除可删块")
    ap.add_argument("--file", help="只看某个样式表（仓库相对路径）")
    ap.add_argument(
        "--treat-css-only-as-dead",
        action="store_true",
        help="把 css-only 桶也当死类名（需先做全仓反向核对：确认没有源码/数据侧发射点）",
    )
    ap.add_argument(
        "--treat-weak-dynamic-as-dead",
        action="store_true",
        help="把 weak-dynamic 桶也当死类名（只被 -label/link/off 这类通用词级前后缀解释，需人工复核）",
    )
    args = ap.parse_args()

    literals, prefixes, suffixes, css_tokens = collect_emitted()
    live = Liveness(literals, prefixes, suffixes, css_tokens)
    print(f"发射来源：字面量 token {len(literals)} 个、动态前缀 {len(prefixes)} 个、"
          f"动态后缀 {len(suffixes)} 个、CSS 里出现过的 token {len(css_tokens)} 个\n")

    targets = sorted(
        p for p in iter_files(SOURCE_ROOTS, CSS_SUFFIXES)
        if "frontend" in str(p.relative_to(ROOT)) or "src" in p.parts
    )
    targets = [p for p in targets if not is_vendor(p)]
    if args.file:
        wanted = ROOT / args.file
        targets = [p for p in targets if p == wanted]

    results: dict[str, list[dict]] = {}
    raws: dict[str, str] = {}
    for path in targets:
        raw, blocks = analyse_file(path, live, args.treat_css_only_as_dead, args.treat_weak_dynamic_as_dead)
        if not blocks:
            continue
        rel = str(path.relative_to(ROOT))
        results[rel] = blocks
        raws[rel] = raw

    total = sum(len(b) for b in results.values())
    print(f"{'样式表':62} {'可删块':>6} {'涉及死类名':>10}")
    print("-" * 84)
    for rel, blocks in sorted(results.items(), key=lambda kv: -len(kv[1])):
        dead = {c for b in blocks for c in b["dead"]}
        print(f"{rel:62} {len(blocks):>6} {len(dead):>10}")
    print(f"\n合计可删块 {total} 个")

    review: dict[str, list[str]] = {}
    for rel, blocks in results.items():
        for token in {c for b in blocks for c in b["dead"]}:
            verdict = live.verdict(token, rel)
            if verdict != "nowhere":
                review.setdefault(verdict, []).append(token)
    if review:
        print("\n注意：下列 token 不是 nowhere 桶（本脚本不会删它们，仅提示）：")
        for verdict, toks in review.items():
            print(f"  [{verdict}] {sorted(set(toks))[:12]}")

    if args.json:
        pathlib.Path(args.json).write_text(
            json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"\n已导出 {args.json}")

    if args.apply:
        # 级联：删掉 A 文件的死块后，某个只在 A 的死块里出现过的类名会变成「哪儿都没有」，
        # 于是 B 文件里依赖它的块也可判死。逐轮收敛，最多 4 轮。
        rounds = 0
        while results and rounds < 4:
            rounds += 1
            for rel, blocks in results.items():
                apply_deletions(ROOT / rel, raws[rel], blocks)
            n = sum(len(b) for b in results.values())
            print(f"  第 {rounds} 轮：删除 {n} 个块（{len(results)} 个文件）")
            results, raws = {}, {}
            for path in targets:
                raw, blocks = analyse_file(path, live, args.treat_css_only_as_dead, args.treat_weak_dynamic_as_dead)
                if blocks:
                    rel = str(path.relative_to(ROOT))
                    results[rel] = blocks
                    raws[rel] = raw

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
