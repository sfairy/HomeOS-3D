#!/usr/bin/env python3
"""运行期 Python 依赖锁的生成与校验（`requirements.lock` 的单一入口）。

为什么需要这个锁
----------------
两个后端的 `requirements.txt` 全是 `>=` 开区间，而 `Dockerfile` 顶部花了大段篇幅钉死
基础镜像摘要与 pip / setuptools / cython 的版本，理由正是「同一份源码在不同时间构建出的
镜像应当一致」。运行期依赖恰恰是这条链上唯一没被钉住的一环：`fastapi>=0.143` 今天装
0.143.2、下个月装到 0.150，镜像里跑的是哪一份只能靠构建日期猜。

**为什么是一个合并锁，而不是每个后端各一个**
镜像的 `base` 阶段把两个 `requirements.txt` 装进**同一层**（app / store 两个运行镜像共用），
所以真正被安装的是两份要求的并集。若拆成两个各自独立解析的锁，两份锁对同一个公共依赖
（pydantic / starlette / httpx …）**各自**钉一个版本：只重新生成其中一个，就会让并集里出现
两个不同的 pin，pip 直接 `ResolutionImpossible` —— 这是构建期才炸、且症状指向「某个传递依赖
冲突」的坑。一个合并锁从结构上不可能产生这种冲突，也与实际安装命令逐字对应。

`requirements.txt` 仍是**开发期的真源**（`pip install -r requirements.txt` 走开区间），
`requirements.lock` 是**构建期的唯一安装输入**（Dockerfile 只 COPY 它）。

一致性怎么保证
--------------
生成时把两份 `requirements.txt` 的 sha256 指纹写进锁的头部（`inputs-sha256:`）。
`verify` 重算指纹并比对 —— 于是「改了 requirements.txt 忘了重新生成锁」会被立刻抓住，
而不需要联网重新解析（重新解析本身不可靠：PyPI 上新版本一发，未改动输入的锁也会「不一致」）。

用法：
    python3 ops/ci/python_lock.py verify      # CI 与本地都能跑，不联网
    python3 ops/ci/python_lock.py generate    # 重新生成（需要 uv 与网络）
"""

from __future__ import annotations

import argparse
import hashlib
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LOCK_PATH = REPO_ROOT / "requirements.lock"

#: 参与并集的两个真源。顺序即指纹口径的一部分，**不要重排**（重排会让已有锁的指纹失配，
#: 而那只是噪音，不是真问题）。
INPUTS = (
    "homeos/backend/requirements.txt",
    "homeos-store/backend/requirements.txt",
)

FINGERPRINT_PREFIX = "# inputs-sha256: "
#: 目标解释器与平台。锁必须覆盖两个架构的 linux 镜像，因此走 uv 的 universal 解析：
#: 平台专属依赖（uvloop / watchfiles / PyYAML）会带上环境标记，其余解析成唯一 pin。
PYTHON_VERSION = "3.14"

#: 传给 uv 的既有参数。`--no-emit-index-url` 是**必须**的：锁里一旦写死 index-url，
#: Dockerfile 的 `--pip-index`（镜像站）覆盖就失效了，构建会去连可能不通的 pypi.org。
UV_FLAGS = (
    "pip",
    "compile",
    "--universal",
    f"--python-version={PYTHON_VERSION}",
    "--generate-hashes",
    "--no-annotate",
    "--no-emit-index-url",
)

_HEADER = """\
# HomeOS 运行期 Python 依赖锁 —— 构建期安装运行期依赖的**唯一**输入。
#
# 由 `python3 ops/ci/python_lock.py generate` 从下面这些真源生成，请勿手改：
#   - homeos/backend/requirements.txt
#   - homeos-store/backend/requirements.txt
# 合并成一份的原因（两个后端装进镜像的同一层，拆开会产生互相冲突的 pin）见脚本 docstring。
#
# 为什么每个依赖都带 --hash：镜像里用 `pip install --require-hashes` 安装，任何 pin 或
# 哈希对不上都会直接构建失败 —— 供应链校验不留「警告后继续」的口子。
# 锁里没有 index-url：Dockerfile 的 `--pip-index` 要能把它换到镜像站。
#
# 校验（不联网）：python3 ops/ci/python_lock.py verify —— CI 的 checks 工作流会跑。
"""

_REQUIREMENT_RE = re.compile(r"^(?P<name>[A-Za-z0-9][A-Za-z0-9._-]*)\s*(?P<rest>.*)$")
_PIN_RE = re.compile(r"^(?P<name>[A-Za-z0-9][A-Za-z0-9._-]*)==(?P<version>[^\s;\\]+)\s*(?:;.*)?$")
_HASH_RE = re.compile(r"^--hash=sha256:[0-9a-f]{64}$")
_FINGERPRINT_RE = re.compile(r"^# inputs-sha256: (?P<digest>[0-9a-f]{64})$")


def normalize(name: str) -> str:
    """PEP 503 归一化：`Pillow` / `pillow_heif` / `pillow.heif` 视为同一个名字。"""
    return re.sub(r"[-_.]+", "-", name).lower()


def fingerprint() -> str:
    """两份真源的内容指纹。口径：逐份 `路径\\0内容\\0` 依次喂进 sha256。"""
    digest = hashlib.sha256()
    for relative in INPUTS:
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update((REPO_ROOT / relative).read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def declared_requirements() -> list[tuple[str, str]]:
    """读两份真源里的顶层依赖，返回 `[(归一化名, 原始行)]`（保留原始行供报错引用）。"""
    declared: list[tuple[str, str]] = []
    for relative in INPUTS:
        for raw in (REPO_ROOT / relative).read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith(("#", "-")):
                continue
            # 行内注释：requirements.txt 里只有整行注释，但这里一并容忍 `pkg>=1  # 说明`。
            line = line.split(" #", 1)[0].strip()
            if not line:
                continue
            match = _REQUIREMENT_RE.match(line)
            if not match:
                raise SystemExit(f"无法解析 {relative} 里的依赖行：{raw}")
            declared.append((normalize(match.group("name")), f"{relative}: {raw.strip()}"))
    return declared


def read_lock() -> tuple[str | None, str]:
    """返回 `(指纹, 正文)`；文件不存在时指纹为 None。"""
    if not LOCK_PATH.exists():
        return None, ""
    text = LOCK_PATH.read_text(encoding="utf-8")
    digest = None
    for line in text.splitlines():
        match = _FINGERPRINT_RE.match(line.strip())
        if match:
            digest = match.group("digest")
            break
    return digest, text


def pinned_names(text: str) -> dict[str, str]:
    """锁里 `名 → 版本` 的映射（用于「真源里的顶层依赖是否都被钉住」）。"""
    pinned: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", "--")):
            continue
        body = stripped.removesuffix("\\").strip()
        match = _PIN_RE.match(body)
        if match:
            pinned[normalize(match.group("name"))] = match.group("version")
    return pinned


def check_structure(text: str) -> list[str]:
    """逐行检查：每个 pin 必须精确版本 + 至少一条 sha256 哈希；不得出现 index-url。"""
    problems: list[str] = []
    pending: tuple[str, int] | None = None
    hashes = 0

    def flush() -> None:
        nonlocal pending, hashes
        if pending is not None and hashes == 0:
            problems.append(f"第 {pending[1]} 行 {pending[0]} 没有 --hash，--require-hashes 会拒绝安装")
        pending, hashes = None, 0

    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("--hash="):
            # 续行同样以 ` \` 结尾：先去掉续行符再比对。
            if not _HASH_RE.match(line.removesuffix("\\").strip()):
                problems.append(f"第 {lineno} 行的哈希格式不对：{line}")
            hashes += 1
            continue
        if line.startswith("--"):
            problems.append(
                f"第 {lineno} 行出现 pip 选项（{line}）：锁里不允许 index-url / find-links，否则镜像站覆盖会失效"
            )
            continue
        flush()
        body = line.removesuffix("\\").strip()
        if not _PIN_RE.match(body):
            problems.append(f"第 {lineno} 行不是 `名字==版本[; 标记]`：{line}")
            continue
        pending = (body.split(" ", 1)[0], lineno)
    flush()
    return problems


def verify() -> int:
    digest, text = read_lock()
    if digest is None:
        if not LOCK_PATH.exists():
            print(f"[python-lock] 缺少 {LOCK_PATH.relative_to(REPO_ROOT)}")
        else:
            print(f"[python-lock] {LOCK_PATH.relative_to(REPO_ROOT)} 头部没有 {FINGERPRINT_PREFIX}<sha256>")
        print("[python-lock] 生成：python3 ops/ci/python_lock.py generate")
        return 1

    problems: list[str] = []

    expected = fingerprint()
    if digest != expected:
        problems.append(
            "锁与 requirements.txt 不一致（inputs-sha256 失配）。\n"
            "      改了 requirements.txt 却没重新生成锁 —— 生成：python3 ops/ci/python_lock.py generate"
        )

    problems.extend(check_structure(text))

    pinned = pinned_names(text)
    missing = [(name, origin) for name, origin in declared_requirements() if name not in pinned]
    for name, origin in missing:
        problems.append(f"顶层依赖 {name} 不在锁里（来自 {origin}）")

    if problems:
        print(f"[python-lock] {LOCK_PATH.relative_to(REPO_ROOT)} 校验失败：")
        for problem in problems:
            print(f"    - {problem}")
        return 1

    print(
        f"[python-lock] 校验通过：{len(pinned)} 个依赖已钉版本并带哈希，"
        f"指纹与 requirements.txt 一致（{expected[:12]}…）"
    )
    return 0


def generate() -> int:
    uv = shutil.which("uv")
    if uv is None:
        print("[python-lock] 需要 uv：pip install uv（或见 https://docs.astral.sh/uv/）")
        return 1

    command = [uv, *UV_FLAGS, f"--output-file={LOCK_PATH.name}", *INPUTS]
    print("[python-lock] " + " ".join(command))
    result = subprocess.run(command, cwd=REPO_ROOT, check=False)
    if result.returncode != 0:
        print("[python-lock] uv 解析失败，锁未改动")
        return result.returncode

    # 指纹写进头部（uv 自己的头会记录本次命令，保留在上半部分，便于回溯用的哪一版 uv）。
    text = LOCK_PATH.read_text(encoding="utf-8")
    LOCK_PATH.write_text(f"{_HEADER}{FINGERPRINT_PREFIX}{fingerprint()}\n\n{text}", encoding="utf-8")
    print(f"[python-lock] 已写出 {LOCK_PATH.relative_to(REPO_ROOT)}（{len(pinned_names(text))} 个依赖）")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("action", choices=("verify", "generate"), nargs="?", default="verify")
    args = parser.parse_args()
    return verify() if args.action == "verify" else generate()


if __name__ == "__main__":
    sys.exit(main())
