#!/usr/bin/env python3
"""基础镜像钉版门禁的**注入式自检**：证明每条判据真的会红。

为什么必须有：本门禁的判据全都可能**静默失效**，而且失效后的样子是「✓ 通过」——
- 「锚点必须恰好命中一次」若写成「找不到就跳过」，真源里改了值、镜像面没改的时候门禁照样绿；
- 「FROM 必须走登记的镜像」若只匹配 `${...}` 形态，添一行裸 `FROM ubuntu:24.04` 就绕过去了；
- 「工作流不得覆盖基础镜像」的正则若不排除 `--python-image-x` 这类前缀相同的长选项，会误报；
- 镜像站改写的行为测试若只断言「结果里没有 sha256:」，把标签也一起丢掉仍然通过。

所以这里把真实仓库的镜像面文件复制进临时工作区，逐类注入漂移并断言命中，同时断言干净副本放行。
复制真实文件而不是手抄迷你样本：手抄样本会与真文件写法脱节，`.gitattributes` / JSON 格式一变
自检仍然「通过」。

用法：`python3 ops/check/check_docker_pins_selftest.py`
"""

from __future__ import annotations

import shutil
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO))

from ops.check import check_docker_pins as gate

#: 需要复制进 fixture 的文件（与 gate 读的面一一对应；漏一个该面就在 fixture 里「读不到」，
#: 那会让「干净副本放行」这条基线本身失真）。
SURFACE_FILES = [
    gate.PINS_JSON,
    "Dockerfile",
    "docker-compose.store.public.yml",
    "ops/build.py",
    ".github/workflows/checks.yml",
    ".github/workflows/docker.yml",
]

failures: list[str] = []
checked = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global checked
    checked += 1
    if not condition:
        failures.append(f"{label}{f'（{detail}）' if detail else ''}")


def build_fixture(root: Path) -> None:
    for rel in SURFACE_FILES:
        source = REPO / rel
        target = root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)


def mutate(root: Path, rel: str, old: str, new: str, *, count: int = 1) -> None:
    path = root / rel
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise AssertionError(f"fixture 里找不到待改内容 {old!r}（真文件写法变了？）")
    path.write_text(text.replace(old, new, count) if count > 0 else text.replace(old, new), encoding="utf-8")


def run_case(mutate_fn, fragment: str | None) -> None:
    """建干净副本 → 注入漂移 → 跑门禁；`fragment=None` 表示应当放行。"""
    with tempfile.TemporaryDirectory() as raw:
        root = Path(raw).resolve()
        build_fixture(root)
        mutate_fn(root)
        problems = gate.collect_problems(root)
        if fragment is None:
            if problems:
                raise AssertionError(f"干净副本本应放行，却报：{'；'.join(problems)}")
            return
        joined = "；".join(problems)
        if not problems:
            raise AssertionError(f"注入漂移后门禁仍然放行（期望命中「{fragment}」）")
        if fragment not in joined:
            raise AssertionError(f"报错未命中「{fragment}」，实际：{joined}")


def run(name: str, fn) -> None:
    global checked
    checked += 1
    try:
        fn()
    # 自检自身的用例体不许把整轮炸掉：任何异常都记成一条失败，让全部用例的结果一次看全。
    # （这里刻意捕获 `Exception` 而非更窄的类型，且 ruff 的 BLE001 未启用，故不写 noqa。）
    except Exception as error:
        failures.append(f"{name} —— {type(error).__name__}: {error}")
        print(f"  FAIL {name} —— {type(error).__name__}: {error}")
    else:
        print(f"  OK   {name}")


#: 真源里 caddy 的摘要（注入漂移时用它拼出「另一个合法摘要」，不会先被形态校验挡下）。
CADDY_DIGEST = "sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b"
OTHER_DIGEST = "sha256:" + "0" * 64


def main() -> int:
    print("基础镜像钉版门禁自检：")

    run("干净副本放行", lambda: run_case(lambda _root: None, None))

    # ── 判据一：真源自身 ────────────────────────────────────────────────────
    run(
        "真源摘要被改成非法形态 → 拦下",
        lambda: run_case(
            lambda root: mutate(root, gate.PINS_JSON, CADDY_DIGEST, "sha256:abc123"),
            "64 位小写十六进制",
        ),
    )
    run(
        "真源 tag 用 latest → 拦下",
        lambda: run_case(
            lambda root: mutate(root, gate.PINS_JSON, '"upstream_tag": "caddy:2.11.4-alpine"', '"upstream_tag": "caddy:latest"'),
            "不得用 `latest`",
        ),
    )
    run(
        "真源删掉一项 → 拦下",
        lambda: run_case(
            # 连**前面的逗号**一起删：只删 caddy 那一段会留下 JSON 尾逗号，报的就不是「缺少镜像项」
            # 而是「不是合法 JSON」—— 那条判据另有专门用例（下一条）。
            lambda root: mutate(
                root,
                gate.PINS_JSON,
                f',\n    "caddy": {{\n      "upstream_tag": "caddy:2.11.4-alpine",\n      "digest": "{CADDY_DIGEST}",\n      "role": "内置反代（镜像内取静态二进制）+ 公网接入叠加文件的 caddy-public 容器"\n    }}\n',
                "\n",
            ),
            "缺少镜像项",
        ),
    )
    run(
        "真源多出未登记项 → 拦下",
        lambda: run_case(
            lambda root: mutate(
                root,
                gate.PINS_JSON,
                '  "images": {',
                '  "images": {\n    "busybox": {\n      "upstream_tag": "busybox:1.37",\n      "digest": "'
                + OTHER_DIGEST
                + '",\n      "role": "未登记"\n    },',
            ),
            "多出未登记的镜像项",
        ),
    )
    run(
        "真源文件缺失 → 报读不到",
        lambda: run_case(lambda root: (root / gate.PINS_JSON).unlink(), "读不到"),
    )
    run(
        "真源不是合法 JSON → 拦下",
        lambda: run_case(lambda root: (root / gate.PINS_JSON).write_text("{ 不是 json", encoding="utf-8"), "不是合法 JSON"),
    )

    # ── 判据二：镜像面逐字对账 ──────────────────────────────────────────────
    run(
        "Dockerfile 的 Python 摘要漂移 → 拦下",
        lambda: run_case(
            lambda root: mutate(root, "Dockerfile", "ARG PYTHON_IMAGE=python:3.14-slim-bookworm@sha256:", "ARG PYTHON_IMAGE=python:3.14-slim-bookworm@sha256:0"),
            "与真源不一致",
        ),
    )
    run(
        "Dockerfile 退回裸 tag（只改 tag 部分）→ 拦下",
        lambda: run_case(
            lambda root: mutate(
                root,
                "Dockerfile",
                "ARG CADDY_IMAGE=caddy:2.11.4-alpine@",
                "ARG CADDY_IMAGE=caddy:2.11.5-alpine@",
            ),
            "与真源不一致",
        ),
    )
    run(
        "Dockerfile 的 ARG 锚点被删 → 拦下（不许扫不到就放行）",
        lambda: run_case(lambda root: mutate(root, "Dockerfile", "ARG CADDY_IMAGE=", "ARG CADDY_IMAGE_OLD="), "找不到 `caddy` 的镜像锚点"),
    )
    run(
        "compose 的公网 Caddy 退回裸 tag → 拦下（改一处漏一处）",
        lambda: run_case(
            lambda root: mutate(
                root,
                "docker-compose.store.public.yml",
                "${CADDY_IMAGE:-caddy:2.11.4-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b}",
                "${CADDY_IMAGE:-caddy:2.11.4-alpine}",
            ),
            "与真源不一致",
        ),
    )
    run(
        "compose 的 caddy 兜底值缺失 → 拦下",
        lambda: run_case(
            lambda root: mutate(root, "docker-compose.store.public.yml", "image: ${CADDY_IMAGE:-", "image: caddy-unpinned:"),
            "找不到 `caddy` 的镜像锚点",
        ),
    )
    run(
        "镜像面文件缺失 → 报读不到",
        lambda: run_case(lambda root: (root / "docker-compose.store.public.yml").unlink(), "读不到"),
    )

    # ── 判据三：Dockerfile 的 FROM 必须走登记的镜像 ─────────────────────────
    run(
        "新增裸 FROM 外部镜像 → 拦下",
        lambda: run_case(
            lambda root: mutate(root, "Dockerfile", "FROM base AS store", "FROM ubuntu:24.04 AS extra\n\nFROM base AS store"),
            "绕过了真源",
        ),
    )
    run(
        "FROM 用了未定义的阶段名 → 拦下",
        lambda: run_case(lambda root: mutate(root, "Dockerfile", "FROM base AS store", "FROM base-typo AS store"), "绕过了真源"),
    )
    run(
        "只把 FROM 的镜像名当成普通注释提到 → 放行（注释不算）",
        lambda: run_case(lambda root: mutate(root, "Dockerfile", "FROM base AS store", "# 曾经写成 FROM ubuntu:24.04\nFROM base AS store"), None),
    )

    # ── 判据四：build.py 的镜像站改写 ───────────────────────────────────────
    run(
        "build.py 自己写死一份 tag（与真源分叉）→ 拦下",
        lambda: run_case(
            lambda root: mutate(
                root,
                "ops/build.py",
                "    pins = json.loads(PINS_FILE.read_text(encoding='utf-8'))['images']\n    return f\"{pins[key]['upstream_tag']}@{pins[key]['digest']}\"",
                "    return 'python:3.13-slim-bookworm@sha256:' + '0' * 64",
            ),
            "与真源不一致",
        ),
    )
    run(
        "build.py 的镜像站改写带上原摘要 → 拦下",
        lambda: run_case(
            lambda root: mutate(root, "ops/build.py", "    return f'{host}/library/{name}:{digestless}' if digestless else f'{host}/library/{name}'", "    return official_image"),
            "把上游摘要带上了",
        ),
    )
    run(
        "build.py 不再发出「摘要被丢弃」警告 → 拦下",
        lambda: run_case(
            # 改的是**警告内容本身**（而不是前缀的「警告」二字）：门禁认的是「摘要被丢弃」这句
            # 话说了没有。前缀改名不该算通过，这句话没了才算降级被静默。
            lambda root: mutate(root, "ops/build.py", "的基础镜像摘要被丢弃", "的基础镜像已切到镜像站"),
            "没有就「丢掉",
        ),
    )
    run(
        "build.py 无镜像站时仍注入基础镜像 build-arg → 拦下",
        lambda: run_case(
            lambda root: mutate(
                root,
                "ops/build.py",
                "    python_image = args.python_image or (_mirrored(mirror, base_image('python')) if mirror else '')",
                "    python_image = args.python_image or base_image('python')",
            ),
            "仍注入了",
        ),
    )
    run(
        "build.py 缺失 → 报读不到",
        lambda: run_case(lambda root: (root / "ops/build.py").unlink(), "读不到"),
    )

    # ── 判据六：构建期 pip 工具必须钉精确版本 ───────────────────────────────
    run(
        "Dockerfile 里 setuptools 退回裸包名 → 拦下",
        lambda: run_case(
            lambda root: mutate(root, "Dockerfile", '"setuptools==${SETUPTOOLS_VERSION}"', "setuptools"),
            "没有钉版本",
        ),
    )
    run(
        "Dockerfile 里 pip 退回裸 `--upgrade pip` → 拦下",
        lambda: run_case(
            lambda root: mutate(root, "Dockerfile", 'pip install --upgrade "pip==${PIP_VERSION}"', "pip install --upgrade pip"),
            "没有钉版本",
        ),
    )
    run(
        "Dockerfile 里 cython 改成区间约束 → 拦下",
        lambda: run_case(
            lambda root: mutate(root, "Dockerfile", '"cython==${CYTHON_VERSION}"', '"cython>=3.2"'),
            "没有钉版本",
        ),
    )
    run(
        "`-r requirements.txt` 不算未钉版本 → 放行（不得误报需求文件）",
        lambda: run_case(
            lambda root: mutate(
                root,
                "Dockerfile",
                "        -r /tmp/requirements-app.txt -r /tmp/requirements-store.txt \\",
                "        -r /tmp/requirements-app.txt -r /tmp/requirements-store.txt \\\n        --index-url https://example.invalid/simple \\",
            ),
            None,
        ),
    )

    # ── 判据五：发布工作流不得覆盖基础镜像 ──────────────────────────────────
    run(
        "工作流传 --python-image → 拦下",
        lambda: run_case(
            lambda root: mutate(
                root,
                ".github/workflows/docker.yml",
                "          python3 ops/build.py backend",
                "          python3 ops/build.py backend --python-image python:3.13-slim",
            ),
            "--python-image",
        ),
    )
    run(
        "工作流设 HOMEOS_BASE_MIRROR 之外的镜像站开关 → 拦下",
        lambda: run_case(
            lambda root: mutate(
                root,
                ".github/workflows/checks.yml",
                "      - name: Install ruff",
                "      - name: Install ruff\n        env:\n          X: y\n        run: python3 ops/build.py backend --base-mirror docker.m.daocloud.io",
            ),
            "--base-mirror",
        ),
    )
    run(
        "工作流里仅出现同前缀的长选项 → 放行（不得误报）",
        lambda: run_case(
            lambda root: mutate(
                root,
                ".github/workflows/checks.yml",
                "      - name: Install ruff",
                "      - name: Install ruff（--python-image-cache 只是名字里带前缀）",
            ),
            None,
        ),
    )
    run(
        "工作流目录缺失 → 拦下",
        lambda: run_case(lambda root: shutil.rmtree(root / ".github" / "workflows"), "工作流校验无从进行"),
    )

    # ── 与真实仓库对齐 ──────────────────────────────────────────────────────
    run(
        "真实仓库当前为绿",
        lambda: check("真实仓库基础镜像一致", not gate.collect_problems(REPO), "；".join(gate.collect_problems(REPO))),
    )

    if failures:
        print("基础镜像钉版门禁自检失败：")
        for item in failures:
            print(f"  - {item}")
        return 1
    print(f"基础镜像钉版门禁自检通过（{checked} 项断言）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
