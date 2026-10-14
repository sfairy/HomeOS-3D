#!/usr/bin/env python3
"""生产环境标记门禁：发行镜像必须带 ``APP_ENVIRONMENT=production``。

为什么需要它
------------
``homeos/backend/src/config.py`` 的 ``environment_is_production`` 是**单一口径**，
同时决定三件事：商业授权门禁默认是否开启（``_license_required_from_env``）、
5xx 错误信息是否脱敏（``bootstrap/exception_handlers.py``）、MCP 网关是否 fail-closed。

在本次修复之前，``NODE_ENV`` / ``LICENSE_REQUIRED`` 在 ``Dockerfile``、四个 compose、
``.env.example`` 与 ``ops/deploy/deploy.sh`` 里**全都没有设置** —— 于是发行容器里
``is_production=False``、``license_required=False``：生产环境的授权门禁与错误脱敏实际上
一直是关的，而这个事实没有任何门禁能发现（它不是一个「跑起来会报错」的缺陷，是**静默失效**）。

本门禁把「镜像层与编排层都显式声明生产标记」固化成可执行断言，并顺带钉住
「config.py 不再退回裸 ``NODE_ENV`` 字符串比较」这条口径。

用法（仓库根执行）::

    python3 ops/check/check_production_env.py            # 门禁
    python3 ops/check/check_production_env.py --selftest # 注入式自检：证明门禁会红
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

DOCKERFILE = ROOT / "Dockerfile"
CONFIG = ROOT / "homeos" / "backend" / "src" / "config.py"
ENV_EXAMPLE = ROOT / ".env.example"
COMPOSES = (
    ROOT / "docker-compose.app.yml",
    ROOT / "docker-compose.store.yml",
)

#: 生产标记的合法取值（与 config.py 的 PRODUCTION_ENV_VALUES 保持同源）。
PRODUCTION_MARKER = "APP_ENVIRONMENT=production"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def effective_lines(text: str) -> list[str]:
    """去掉整行注释后的有效配置行。

    这一步是必要的：本仓库的 Dockerfile / compose 里大量注释会**原文引用**配置项
    （例如注释里写「镜像已内置 APP_ENVIRONMENT=production」）。若不去注释，
    一句解释性注释就能让门禁通过，等于用文档换掉了断言。
    """
    return [line for line in text.splitlines() if not line.lstrip().startswith("#")]


def stage_body(text: str, stage: str) -> str | None:
    """取 ``FROM ... AS <stage>`` 到下一个 ``FROM`` 之间的**有效**正文（不含注释行）。"""
    lines = effective_lines(text)
    start = None
    for index, line in enumerate(lines):
        if re.match(rf"^\s*FROM\b.*\bAS\s+{re.escape(stage)}\s*$", line, re.IGNORECASE):
            start = index
            break
    if start is None:
        return None
    collected: list[str] = []
    for line in lines[start + 1 :]:
        if re.match(r"^\s*FROM\b", line, re.IGNORECASE):
            break
        collected.append(line)
    return "\n".join(collected)


def check_dockerfile(text: str) -> list[str]:
    problems: list[str] = []
    for stage in ("app", "store"):
        body = stage_body(text, stage)
        if body is None:
            problems.append(f"Dockerfile 里找不到 `FROM ... AS {stage}` 阶段")
            continue
        if PRODUCTION_MARKER not in body:
            problems.append(
                f"Dockerfile 的 {stage} 运行阶段缺少 ENV {PRODUCTION_MARKER}"
                "（发行镜像必须显式声明生产环境，否则授权门禁与 5xx 脱敏默认关闭）"
            )
    return problems


def check_compose(name: str, text: str) -> list[str]:
    lines = effective_lines(text)
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("APP_ENVIRONMENT:"):
            return []
    return [
        (
            f"{name} 未透出 APP_ENVIRONMENT（需在 environment: 块里给出一条 APP_ENVIRONMENT: 行）："
            "宿主无法覆盖镜像默认，也让「编排层显式声明生产」这条契约失去单点"
        )
    ]


def check_env_example(text: str) -> list[str]:
    problems: list[str] = []
    if "APP_ENVIRONMENT" not in text:
        problems.append(".env.example 未记录 APP_ENVIRONMENT（生产环境标记的唯一真源）")
    if "LICENSE_REQUIRED" not in text:
        problems.append(".env.example 未记录 LICENSE_REQUIRED（授权门禁的显式覆盖开关）")
    return problems


def check_config(text: str) -> list[str]:
    """config.py 不得再出现裸的 ``NODE_ENV`` 生产比较（必须走单一真源）。"""
    problems: list[str] = []
    if "def environment_is_production" not in text:
        problems.append("config.py 缺少 environment_is_production（生产判定的单一真源）")
    # 允许出现在 environment_is_production / environment_is_production_from 内部（回退分支），
    # 以及 docstring 里。判据：去掉函数体后再看还有没有 NODE_ENV 的取值比较。
    stripped = re.sub(
        r"def environment_is_production(_from)?\(.*?\n(?=\ndef |\nclass |\n@|\Z)",
        "",
        text,
        flags=re.DOTALL,
    )
    stray = [
        line.strip()
        for line in stripped.splitlines()
        if "NODE_ENV" in line
        and "==" in line
        and not line.strip().startswith("#")
        and '"' in line
    ]
    if stray:
        problems.append(
            "config.py 在单一真源之外仍在比较 NODE_ENV（应改调 environment_is_production）："
            + "；".join(stray)
        )
    if "is_production=environment_is_production()" not in text:
        problems.append("config.py 的 Settings.is_production 未使用 environment_is_production()")
    return problems


def collect(texts: dict[str, str]) -> list[str]:
    """纯函数：输入「文件名 → 内容」，输出问题清单（自检直接复用）。"""
    problems: list[str] = []
    problems += check_dockerfile(texts.get("Dockerfile", ""))
    for name, text in texts.items():
        if name.startswith("docker-compose."):
            problems += check_compose(name, text)
    problems += check_env_example(texts.get(".env.example", ""))
    problems += check_config(texts.get("config.py", ""))
    return problems


#: 行为探针：在**子进程**里真装配一次 Settings，验证「环境标记 → 授权门禁默认」的接线。
#: 静态字面量检查只能证明「写了 production」，证明不了「写了以后授权门禁真的会开」。
#: ``sys.modules['dotenv'] = None`` 让 ``src/__init__.py`` 的 load_env_files 静默跳过：
#: 否则本机 ``.env``（override=False）会把探针显式设置的值旁路掉，结论随开发机而变。
_BEHAVIOR_PROBE = (
    "import sys\n"
    "sys.modules['dotenv'] = None\n"
    "sys.path.insert(0, 'homeos/backend')\n"
    "from src.config import environment_is_production, _license_required_from_env\n"
    "print('HOSPROBE', int(environment_is_production()), int(_license_required_from_env()))\n"
)

#: (环境变量, 期望的 (is_production, license_required))
BEHAVIOR_CASES: tuple[tuple[dict[str, str], tuple[int, int]], ...] = (
    ({}, (0, 0)),
    ({"APP_ENVIRONMENT": "production"}, (1, 1)),
    ({"APP_ENVIRONMENT": "prod"}, (1, 1)),
    ({"APP_ENVIRONMENT": "development"}, (0, 0)),
    ({"NODE_ENV": "production"}, (1, 1)),
    ({"APP_ENVIRONMENT": "production", "LICENSE_REQUIRED": "0"}, (1, 0)),
    ({"APP_ENVIRONMENT": "development", "LICENSE_REQUIRED": "1"}, (0, 1)),
)

#: 探针要清掉的继承变量：三个都会影响结论，必须由用例显式设定或留空。
_NEUTRALIZED = ("APP_ENVIRONMENT", "NODE_ENV", "LICENSE_REQUIRED")


def behavior_check() -> list[str]:
    import os
    import subprocess

    base = {key: value for key, value in os.environ.items() if key not in _NEUTRALIZED}
    problems: list[str] = []
    for overrides, expected in BEHAVIOR_CASES:
        env = dict(base)
        env.update(overrides)
        try:
            proc = subprocess.run(
                [sys.executable, "-c", _BEHAVIOR_PROBE],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
                timeout=60,
                # 探针明确吞掉非零退出（订阅里的 import 失败也要走「没产出结果」这条
                # 诊断分支），自己解析 stdout 判成功与否。
                check=False,
            )
        except (OSError, subprocess.SubprocessError) as exc:  # pragma: no cover
            problems.append(f"行为探针无法执行：{exc}")
            continue
        got = None
        for line in proc.stdout.splitlines():
            if line.startswith("HOSPROBE "):
                parts = line.split()
                got = (int(parts[1]), int(parts[2]))
        if got is None:
            problems.append(
                f"行为探针 {overrides or '（无覆盖）'} 没有产出结果"
                f"（stderr 末尾：{proc.stderr.strip().splitlines()[-1:] or '（空）'}）"
            )
        elif got != expected:
            problems.append(
                f"行为探针 {overrides or '（无覆盖）'}：期望 (is_production, license_required)={expected}，实测 {got}"
            )
    return problems


def _load() -> dict[str, str]:
    texts: dict[str, str] = {}
    if DOCKERFILE.is_file():
        texts["Dockerfile"] = read(DOCKERFILE)
    if CONFIG.is_file():
        texts["config.py"] = read(CONFIG)
    if ENV_EXAMPLE.is_file():
        texts[".env.example"] = read(ENV_EXAMPLE)
    for compose in COMPOSES:
        if compose.is_file():
            texts[compose.name] = read(compose)
    return texts


def selftest() -> int:
    """注入式自检：把每一类缺陷注入干净基线，断言门禁都会红。"""
    baseline = _load()
    cases: list[tuple[str, dict[str, str]]] = []

    def mutated(key: str, repl: tuple[str, str]) -> dict[str, str]:
        clone = dict(baseline)
        old, new = repl
        assert old in clone[key], f"自检基线里找不到 {old!r}（{key}）"
        # 替换**全部**出现点：注释里也会引用同样的字面量，只换第一处会换到注释上，
        # 注入就落空了（门禁按有效配置行判定，注释改动不影响结果）。
        clone[key] = clone[key].replace(old, new)
        return clone

    cases.append(("基线（无注入）", baseline))
    cases.append(
        (
            "Dockerfile 两个阶段的生产标记都被改掉",
            mutated("Dockerfile", (PRODUCTION_MARKER, "APP_ENVIRONMENT=development")),
        )
    )
    cases.append(
        (
            "compose 不再透出 APP_ENVIRONMENT",
            mutated("docker-compose.app.yml", ("APP_ENVIRONMENT:", "APP_ENV_RENAMED:")),
        )
    )
    cases.append(
        (
            ".env.example 丢失生产标记记录",
            mutated(".env.example", ("APP_ENVIRONMENT", "APP_ENV_RENAMED")),
        )
    )
    cases.append(
        (
            "config.py 的 is_production 退回裸 NODE_ENV 比较",
            mutated(
                "config.py",
                (
                    "is_production=environment_is_production(),",
                    'is_production=os.getenv("NODE_ENV") == "production",',
                ),
            ),
        )
    )
    cases.append(
        (
            "config.py 丢失单一真源函数",
            mutated("config.py", ("def environment_is_production", "def _unused_marker")),
        )
    )

    failures: list[str] = []
    for index, (label, texts) in enumerate(cases):
        found = collect(texts)
        if index == 0:
            if found:
                failures.append(f"[自检] 干净基线不该报问题，却报了：{found}")
            continue
        if not found:
            failures.append(f"[自检] 注入「{label}」后门禁没有报错（门禁形同虚设）")

    if failures:
        print("生产环境门禁自检失败：")
        for item in failures:
            print(f"  - {item}")
        return 1
    print(f"生产环境门禁自检通过：{len(cases) - 1} 项注入全部被拦下。")
    return 0


def main(argv: list[str]) -> int:
    if "--selftest" in argv:
        return selftest()

    problems = collect(_load()) + behavior_check()
    if problems:
        print("生产环境标记门禁失败：")
        for problem in problems:
            print(f"  - {problem}")
        print(
            "\n口径：APP_ENVIRONMENT=production 是生产判定的唯一真源"
            "（config.py 的 environment_is_production；NODE_ENV 仅作兼容回退）。"
        )
        return 1
    print("生产环境标记门禁通过：镜像 / 编排 / .env.example / config.py 四层口径一致。")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
