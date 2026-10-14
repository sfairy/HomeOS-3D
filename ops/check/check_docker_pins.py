#!/usr/bin/env python3
"""基础镜像钉版门禁：`ops/docker-pins.json` 是唯一真源，所有镜像面必须与它逐字一致。

## 为什么需要这道门禁

`Dockerfile` 里的基础镜像此前写的是裸 tag（`python:3.14-slim-bookworm` / `caddy:2.11.4-alpine`），
`docker-compose.store.public.yml` 里的公网 Caddy 也是。裸 tag 是**可变引用**：上游随时重推同一个
tag，于是「同一份源码、不同时间构建」得到不同镜像，出货给客户的私有化部署无法复现，出事也说不清
成分。这是实打实的供应链问题，而现有门禁（端口 / 令牌 / schema / 契约 / 分层）没有一条看得见它。

改了 `Dockerfile` 却漏了 compose（或反过来）是这类改动的典型失手方式：两处各自能跑，只有
「公网入口换成了另一个 Caddy」这种话没人会在构建日志里看到。

## 判据

1. **真源自身**：`ops/docker-pins.json` 的 `images` 必须**恰好**是 `python` / `caddy` 两项，
   `upstream_tag` 形如 `name:tag`（tag 不得是 `latest`），`digest` 必须是 `sha256:<64 位小写十六进制>`。
   新增基础镜像必须显式登记 —— 否则「顺手在 Dockerfile 里多一行 FROM」就是绕过本门禁的方式。
2. **镜像面逐字对账**：每个面（路径, 镜像键, 取值正则）必须**恰好命中一次**，取值必须等于
   `upstream_tag@digest`。「命中 0 次」直接报错而不是跳过（锚点删掉就变绿是门禁静默失效的典型）；
   「命中多次且互相打架」同样报错。
3. **Dockerfile 的每个 FROM 都必须走登记的镜像**：只允许 `${PYTHON_IMAGE}` / `${CADDY_IMAGE}`、
   本文件已定义的构建阶段名、`scratch`。裸写 `FROM ubuntu:24.04` 这类外部引用一律拦下 ——
   它们不会经过真源，也就没人对账。
4. **`ops/build.py` 的镜像站改写必须只丢摘要、不丢标签**：走 `--base-mirror` 时镜像站是另一个仓库，
   摘要必然不同，照搬会直接拉不到。这里直接调用真实函数断言行为（镜像站引用无 `sha256:`、
   标签保持、且**没有镜像站时不得注入任何基础镜像 build-arg** —— 否则 Dockerfile 里那份钉死的
   默认值会被静默绕过）。
5. **发布工作流不得传基础镜像覆盖参数**：`.github/workflows/*.yml` 里出现
   `--python-image` / `--caddy-image` / `--base-mirror` 即失败。镜像站是本地网络受限时的权宜手段，
   不该出现在产出正式镜像的路径上（那等于把钉版交还给调用者随手填）。

用法：
```bash
python3 ops/check/check_docker_pins.py                  # 门禁（CI 每次跑，纯离线）
python3 ops/check/check_docker_pins.py --list           # 打印真源与各镜像面命中
python3 ops/check/check_docker_pins.py --verify-remote  # 联网核对 tag 与 digest 是否仍然配对
python3 ops/check/check_docker_pins.py --repo=<dir>     # 自检注入 fixture 树
```
"""

from __future__ import annotations

import argparse
import contextlib
import importlib.util
import io
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO))

from ops.lib import scan

#: 真源。
PINS_JSON = "ops/docker-pins.json"

#: 真源必须**恰好**登记这些镜像（键名逐项对账，少一个 / 多一个都报）。
EXPECTED_KEYS: tuple[str, ...] = ("python", "caddy")

#: 摘要形态：sha256 后跟 64 位小写十六进制。
DIGEST_RE = re.compile(r"sha256:[0-9a-f]{64}")
#: tag 形态（Docker 的 tag 规则）。
TAG_RE = re.compile(r"[A-Za-z0-9_][A-Za-z0-9._-]*")

#: 镜像面：(相对路径, 镜像键, 取值正则；**必须恰好命中一次**)。
#: 只列「把完整引用写死」的地方；`ops/build.py` 现在从真源读，改由判据 4 的行为测试覆盖。
SURFACES: tuple[tuple[str, str, str], ...] = (
    ("Dockerfile", "python", r"^ARG PYTHON_IMAGE=(\S+)[ \t]*$"),
    ("Dockerfile", "caddy", r"^ARG CADDY_IMAGE=(\S+)[ \t]*$"),
    ("docker-compose.store.public.yml", "caddy", r"\$\{CADDY_IMAGE:-([^}]+)\}"),
)

#: 发布工作流里不得出现的基础镜像覆盖参数（出现即失败，理由见模块文档判据 5）。
FORBIDDEN_IN_WORKFLOWS: tuple[str, ...] = ("--python-image", "--caddy-image", "--base-mirror")

#: `pip install` 的包参数必须写成 `name==版本`（版本可以是字面量，也可以是 `${ARG}`）。
PINNED_REQ_RE = re.compile(r"^(?P<name>[A-Za-z0-9][A-Za-z0-9._-]*)==" r"(?:\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|[0-9][A-Za-z0-9.!+_-]*)$")
#: 包参数之外的 `pip install` 实参（选项、以及 `-r file` / `--index-url <url>` 的取值）。
_PIP_NOISE_RE = re.compile(r"^-|^\$\{")

WORKFLOW_GLOB = ".github/workflows"


def _strip_hash_comments(text: str) -> str:
    """剥掉 ``#`` 到行尾的注释。

    Dockerfile 与 YAML 的注释就是 ``#``，与 Python 的规则逐字相同，所以复用
    ``ops.lib.scan`` 的 Python 词法（含「字符串里的 ``#`` 不算注释」这条）而不是再写一份正则 ——
    本文件顶部那段说明里就有 ``python:3.14-slim-bookworm`` 之类的字面量，正则版会把说明文字也当
    镜像面命中，于是「锚点命中次数」失去意义。
    """
    return scan.strip_comments(text, ".py")


def read_pins(root: Path) -> tuple[dict[str, str], list[str]]:
    """读真源，返回 ``{键: tag@digest}`` 与问题清单（真源坏了也返回问题而不是抛异常）。"""
    path = root / PINS_JSON
    text = scan.read_text(path)
    if text is None:
        return {}, [f"{PINS_JSON} 读不到（真源缺失，本门禁无从对账）"]
    try:
        data = json.loads(text)
    except json.JSONDecodeError as error:
        return {}, [f"{PINS_JSON} 不是合法 JSON：{error}"]
    images = data.get("images")
    if not isinstance(images, dict):
        return {}, [f"{PINS_JSON} 缺少 `images` 对象"]

    problems: list[str] = []
    missing = [key for key in EXPECTED_KEYS if key not in images]
    extra = [key for key in images if key not in EXPECTED_KEYS]
    if missing:
        problems.append(f"{PINS_JSON} 缺少镜像项：{missing}")
    if extra:
        problems.append(f"{PINS_JSON} 多出未登记的镜像项：{extra}（新增基础镜像要同步本门禁的 EXPECTED_KEYS）")

    refs: dict[str, str] = {}
    for key in EXPECTED_KEYS:
        entry = images.get(key)
        if not isinstance(entry, dict):
            continue
        tag = entry.get("upstream_tag")
        digest = entry.get("digest")
        if not isinstance(tag, str) or not isinstance(digest, str):
            problems.append(f"{PINS_JSON} 的 `{key}` 缺少 `upstream_tag` / `digest`")
            continue
        ref, why = compose_ref(tag, digest)
        if why:
            problems.append(f"{PINS_JSON} 的 `{key}` —— {why}")
            continue
        refs[key] = ref
    return refs, problems


def compose_ref(tag: str, digest: str) -> tuple[str, str]:
    """校验 tag 与 digest 并拼成完整引用；返回 ``(引用, 问题说明)``（无问题时说明为空串）。"""
    if "@" in tag:
        return "", f"`upstream_tag` 不该带 `@`（摘要写在单独的 `digest` 字段里）：{tag!r}"
    name, separator, version = tag.partition(":")
    if not separator or not name or not version:
        return "", f"`upstream_tag` 必须是 `name:tag` 形态：{tag!r}"
    if not TAG_RE.fullmatch(version):
        return "", f"`upstream_tag` 的 tag 不合法：{version!r}"
    if version == "latest":
        return "", f"`upstream_tag` 不得用 `latest`（可变引用，等于没钉）：{tag!r}"
    if not DIGEST_RE.fullmatch(digest):
        return "", f"`digest` 必须是 `sha256:` + 64 位小写十六进制：{digest!r}"
    return f"{tag}@{digest}", ""


def check_surfaces(root: Path, refs: dict[str, str]) -> list[str]:
    problems: list[str] = []
    for rel_path, key, pattern in SURFACES:
        raw = scan.read_text(root / rel_path)
        if raw is None:
            problems.append(f"{rel_path} 读不到（镜像面缺失，本门禁无从对账）")
            continue
        if key not in refs:
            # 真源自己有问题时 already 报过了；这里不再重复报「不一致」。
            continue
        pattern_re = re.compile(pattern, re.MULTILINE)
        hits = pattern_re.findall(_strip_hash_comments(raw))
        expected = refs[key]
        if not hits:
            problems.append(f"{rel_path} 找不到 `{key}` 的镜像锚点（写法变了？门禁不接受「扫不到就放行」）")
            continue
        unique = sorted(set(hits))
        if len(unique) > 1:
            problems.append(f"{rel_path} 的 `{key}` 出现互相打架的取值：{unique}")
            continue
        if unique[0] != expected:
            problems.append(f"{rel_path} 的 `{key}` 与真源不一致：{unique[0]} ≠ {expected}")
    return problems


def check_dockerfile_froms(root: Path) -> list[str]:
    """Dockerfile 的每个 FROM 都必须走登记的镜像 / 本地阶段 / scratch。"""
    rel_path = "Dockerfile"
    raw = scan.read_text(root / rel_path)
    if raw is None:
        return [f"{rel_path} 读不到（镜像面缺失，本门禁无从对账）"]
    text = _strip_hash_comments(raw)

    problems: list[str] = []
    stages = {"scratch"}
    allowed_args = ("${PYTHON_IMAGE}", "${CADDY_IMAGE}")
    for lineno, line in scan.iter_lines(text):
        match = re.match(r"\s*FROM\s+(\S+)(?:\s+AS\s+(\S+))?", line, re.IGNORECASE)
        if not match:
            continue
        ref = match.group(1)
        alias = match.group(2)
        # 阶段名先登记再判定：`FROM base AS backend-build` 之后的 `FROM backend-build` 才合法。
        if alias:
            stages.add(alias.lower())
        if ref in allowed_args or ref.lower() in stages:
            continue
        problems.append(
            f"{rel_path}:{lineno} 的 `FROM {ref}` 绕过了真源：外部基础镜像只能通过 "
            f"{' / '.join(allowed_args)} 引入（其余只在真源里登记后才有对账）"
        )
    return problems


def check_workflows(root: Path) -> list[str]:
    """发布工作流不得用参数覆盖基础镜像（等于把钉版交还给调用者）。"""
    workflow_dir = root / WORKFLOW_GLOB
    if not workflow_dir.is_dir():
        return [f"{WORKFLOW_GLOB}/ 目录不存在（工作流校验无从进行）"]
    problems: list[str] = []
    for path in sorted(workflow_dir.glob("*.yml")) + sorted(workflow_dir.glob("*.yaml")):
        rel_path = scan.rel(root, path)
        text = _strip_hash_comments(scan.read_text(path) or "")
        for lineno, line in scan.iter_lines(text):
            for flag in FORBIDDEN_IN_WORKFLOWS:
                if re.search(rf"{re.escape(flag)}(?![-\w])", line):
                    problems.append(
                        f"{rel_path}:{lineno} 出现 `{flag}`：产出正式镜像的路径必须用真源里钉死的"
                        "基础镜像，不能由调用者临场指定引用"
                    )
    return problems


def load_build_module(root: Path):
    """以 ``root`` 为仓库根加载 ``ops/build.py``（自检注入 fixture 时也能测到真实函数体）。"""
    path = root / "ops" / "build.py"
    if not path.is_file():
        return None, f"{scan.rel(root, path)} 读不到（镜像站改写逻辑无从验证）"
    spec = importlib.util.spec_from_file_location(f"_pins_build_{abs(hash(str(root)))}", path)
    if spec is None or spec.loader is None:
        return None, f"{scan.rel(root, path)} 无法作为模块加载"
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as error:  # 加载失败本身就是一条门禁问题；ruff 的 BLE001 未启用，故不写 noqa（写了 RUF100 会报）。
        return None, f"{scan.rel(root, path)} 加载失败：{type(error).__name__}: {error}"
    return module, ""


def check_build_mirror(root: Path, refs: dict[str, str]) -> list[str]:
    """行为测试 `ops/build.py`：镜像站只丢摘要，不设镜像站时不得注入基础镜像 build-arg。"""
    module, why = load_build_module(root)
    if module is None:
        return [why]
    problems: list[str] = []
    for key in EXPECTED_KEYS:
        if key not in refs:
            continue
        try:
            official = module.base_image(key)
        except Exception as error:  # 真源读不通时给出可定位的信息（BLE001 未启用）
            problems.append(f"ops/build.py 的 base_image({key!r}) 抛错：{type(error).__name__}: {error}")
            continue
        if official != refs[key]:
            problems.append(
                f"ops/build.py 的 base_image({key!r}) 与真源不一致：{official} ≠ {refs[key]}"
                "（它必须从真源读，不能再写一份常量）"
            )

    # 镜像站改写：摘要必须丢、tag 必须留，并且**必须留下警告**（静默降级才是真问题）。
    for key in ("python", "caddy"):
        tag = refs.get(key, "").split("@", 1)[0]
        if not tag:
            continue
        name, _, version = tag.partition(":")
        captured = io.StringIO()
        with contextlib.redirect_stderr(captured), contextlib.redirect_stdout(captured):
            mirrored = module._mirrored("mirror.example", refs[key])
        noise = captured.getvalue()
        if "sha256:" in mirrored:
            problems.append(
                f"ops/build.py 的镜像站改写把上游摘要带上了：{mirrored}"
                "（镜像站是另一个仓库，摘要必然不同，照搬会直接拉不到）"
            )
        if mirrored != f"mirror.example/library/{name}:{version}":
            problems.append(f"ops/build.py 的镜像站改写结果不对：{mirrored} ≠ mirror.example/library/{name}:{version}")
        if "摘要被丢弃" not in noise:
            problems.append(
                f"ops/build.py 的镜像站改写没有就「丢掉 {key} 的摘要」发出警告"
                "（降级必须看得见，静默降级等于悄悄把钉版关了）"
            )

    # 不设镜像站时不得注入 build-arg：否则 Dockerfile 里钉死的默认值会被静默绕过。
    args = argparse.Namespace(base_mirror=None, python_image=None, caddy_image=None, pip_index=None, apt_mirror=None)
    try:
        injected = module.base_image_args(args)
    except Exception as error:  # BLE001 未启用
        problems.append(f"ops/build.py 的 base_image_args 抛错：{type(error).__name__}: {error}")
        injected = []
    for flag in ("PYTHON_IMAGE=", "CADDY_IMAGE="):
        if any(flag in item for item in injected):
            problems.append(f"ops/build.py 在没有 --base-mirror 时仍注入了 `{flag}…`（会绕过 Dockerfile 的钉版默认值）")
    return problems


def _mask_expansion_spaces(text: str) -> str:
    """把 `${...}` 展开**内部**的空格换成占位符，免得按空格分词时把一个展开切成好几块。

    `pip install ${PIP_INDEX_URL:+--index-url $PIP_INDEX_URL} "cython==${CYTHON_VERSION}"` 里，
    展开内部的空格不属于「分词边界」：不遮掉它们，判据就会把 `$PIP_INDEX_URL}` 当成一个包名。
    （能不能删掉整个展开？不能 —— `"cython==${CYTHON_VERSION}"` 的版本号就在展开里，
    删了就变成 `cython==`，反而被判成「没钉版本」。）
    """
    out: list[str] = []
    index = 0
    while index < len(text):
        if text.startswith("${", index):
            depth = 1
            end = index + 2
            while end < len(text) and depth:
                if text[end] == "{":
                    depth += 1
                elif text[end] == "}":
                    depth -= 1
                end += 1
            out.append(text[index:end].replace(" ", "\x00"))
            index = end
            continue
        out.append(text[index])
        index += 1
    return "".join(out)


def check_pip_pins(root: Path) -> list[str]:
    """Dockerfile 里每条 `pip install` 的**包参数**都必须带 `==` 精确版本。

    为什么单独一条：基础镜像摘要管不到 PyPI。`pip install setuptools`、`pip install --upgrade pip`
    这类写法每次构建都可能装到不同的版本，而 pip / setuptools / Cython 恰恰是「昨天能编、今天
    编不过」的常客（`ops/docker/compile_python.py` 直接依赖 `setuptools.command.build_ext`）。
    版本号可以来自一个字面量，也可以来自 `ARG`（`==${SETUPTOOLS_VERSION}`）—— 两种都算钉住，
    但**必须能看出是哪个版本**，所以裸包名与 `>=` / `~=` 一律拦下。
    """
    rel_path = "Dockerfile"
    raw = scan.read_text(root / rel_path)
    if raw is None:
        return [f"{rel_path} 读不到（构建期依赖无从核对）"]
    text = _strip_hash_comments(raw)

    #: 这些选项的**取值**是文件或 URL，不是包名。
    takes_value = {"-r", "--requirement", "-c", "--constraint", "-i", "--index-url", "--extra-index-url", "-f", "--find-links"}
    problems: list[str] = []
    for lineno, line in scan.iter_lines(text):
        if "pip install" not in line:
            continue
        # 只取 `pip install` 之后的部分：同一行可能既有 `pip install A` 又有别的命令。
        command = _mask_expansion_spaces(line.split("pip install", 1)[1])
        skip_next = False
        for word in (item.strip("\"'") for item in command.split()):
            if skip_next:
                skip_next = False
                continue
            if word in takes_value:
                skip_next = True
                continue
            if _PIP_NOISE_RE.match(word) or word in {"&&", "\\", "|", ";"}:
                continue
            if PINNED_REQ_RE.match(word):
                continue
            problems.append(
                f"{rel_path}:{lineno} 的 `pip install {word}` 没有钉版本：构建期工具必须写成 "
                f"`{word.split('==')[0]}==<版本>`（或 `==${{ARG}}`），否则同一份源码会随时间装出不同产物"
            )
    return problems


def collect_problems(root: Path | None = None) -> list[str]:
    repo = root or REPO
    refs, problems = read_pins(repo)
    problems += check_surfaces(repo, refs)
    problems += check_dockerfile_froms(repo)
    problems += check_pip_pins(repo)
    problems += check_workflows(repo)
    problems += check_build_mirror(repo, refs)
    if not problems and len(refs) != len(EXPECTED_KEYS):
        problems.append(f"真源只解析出 {len(refs)} 项（期望 {len(EXPECTED_KEYS)} 项）")
    return problems


# ─── 联网核对（--verify-remote） ──────────────────────────────────────────────


def _registry_coords(name: str) -> tuple[str, str] | None:
    """把镜像名拆成 ``(registry, repository)``；只支持 Docker Hub（其余返回 ``None``）。"""
    first, _, rest = name.partition("/")
    if "." in first or ":" in first or first == "localhost":
        if first in {"docker.io", "index.docker.io", "registry-1.docker.io"}:
            return "registry-1.docker.io", rest
        return None
    return "registry-1.docker.io", name if "/" in name else f"library/{name}"


def remote_digest(ref: str) -> tuple[str, str]:
    """查 ``tag`` 当前指向的 manifest list 摘要；返回 ``(摘要, 问题说明)``。"""
    tag_part, _, _ = ref.partition("@")
    name, _, tag = tag_part.rpartition(":")
    coords = _registry_coords(name)
    if coords is None:
        return "", f"{name} 不是 Docker Hub 上的镜像，本检查未实现它的认证流程"
    registry, repository = coords
    accept = ",".join(
        [
            "application/vnd.oci.image.index.v1+json",
            "application/vnd.docker.distribution.manifest.list.v2+json",
            "application/vnd.docker.distribution.manifest.v2+json",
        ]
    )
    try:
        token_url = (
            f"https://auth.docker.io/token?service=registry.docker.io&scope=repository:{repository}:pull"
        )
        with urllib.request.urlopen(token_url, timeout=30) as response:
            token = json.loads(response.read())["token"]
        request = urllib.request.Request(
            f"https://{registry}/v2/{repository}/manifests/{tag}",
            headers={"Authorization": f"Bearer {token}", "Accept": accept},
        )
        # S310 之所以要豁免：这里是 `Request` 对象，ruff 看不到 scheme，只能靠上面那个逐字写死的
        # `https://{registry}`（registry 来自 _registry_coords，不是外部输入）。
        with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310
            return response.headers.get("Docker-Content-Digest", ""), ""
    except (urllib.error.URLError, OSError, KeyError, ValueError) as error:
        return "", f"查询 {tag_part} 失败：{type(error).__name__}: {error}"


def verify_remote(root: Path | None = None) -> int:
    """联网核对真源里的 tag 与 digest 是否仍然配对。"""
    refs, problems = read_pins(root or REPO)
    if problems:
        for problem in problems:
            print(f"  - {problem}")
        return 1
    failures: list[str] = []
    skipped: list[str] = []
    for key in EXPECTED_KEYS:
        ref = refs.get(key)
        if not ref:
            continue
        current, why = remote_digest(ref)
        if why:
            skipped.append(f"{ref}：{why}")
            continue
        pinned = ref.split("@", 1)[1]
        if current != pinned:
            failures.append(
                f"{key}：上游 tag 已不再指向真源里的摘要\n"
                f"      真源 {pinned}\n      现在 {current or '（未返回 Docker-Content-Digest）'}\n"
                f"      处理：确认新摘要是你要的版本，然后同时更新 {PINS_JSON} 的 upstream_tag 与 digest"
            )
        else:
            print(f"  ✓ {key} 的 tag 与摘要仍然配对：{ref}")
    for item in skipped:
        print(f"  ! 未核对（不算通过）：{item}")
    if failures:
        print("基础镜像远程核对失败：")
        for item in failures:
            print(f"  - {item}")
        return 1
    print("✓ 基础镜像远程核对通过：真源里的 tag 与摘要仍然配对。")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="基础镜像钉版门禁（真源 ops/docker-pins.json）")
    parser.add_argument("--repo", default=str(REPO), help="注入仓库根（自检用 fixture）")
    parser.add_argument("--list", action="store_true", help="只打印真源与各镜像面命中")
    parser.add_argument("--verify-remote", action="store_true", help="联网核对 tag 与 digest 是否仍然配对")
    args = parser.parse_args()

    root = Path(args.repo)
    if args.verify_remote:
        return verify_remote(root)

    refs, parse_problems = read_pins(root)
    if args.list:
        print(f"基础镜像真源 {PINS_JSON}：")
        for key in EXPECTED_KEYS:
            print(f"  {key:<8} {refs.get(key, '（解析失败）')}")
        print("\n镜像面：")
        for rel_path, key, pattern in SURFACES:
            raw = scan.read_text(root / rel_path)
            hits = re.findall(pattern, _strip_hash_comments(raw or ""), re.MULTILINE)
            print(f"  {rel_path}  {key}  命中 {hits}")
        for problem in parse_problems:
            print(f"  ✗ {problem}")
        return 1 if parse_problems else 0

    problems = collect_problems(root)
    if problems:
        print("基础镜像钉版门禁失败：")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print(f"✓ 基础镜像钉版门禁通过：真源 {len(refs)} 项，{len(SURFACES)} 个镜像面 + Dockerfile FROM + 构建期工具钉版 + 工作流无覆盖 + 镜像站改写一致。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
