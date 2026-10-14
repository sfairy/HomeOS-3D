#!/usr/bin/env python3
"""端口一致性门禁的**注入式自检**：证明每条判据真的会红。

为什么必须有：本门禁的三类判据都可能**静默失效** ——
- 「锚点解析不到就报错」若写成「解析不到就跳过」，文件结构一变门禁照样打印 ✓；
- 「出现即对账」若允许集合写宽了（或真源解析成空表），等于什么都没守；
- 「dev.mjs 零字面量」若扫的是抹注释后的文本，注释里那几处端口会让它永远红（或被顺手删掉判据）。

所以这里把真实仓库的端口面文件复制进临时工作区，逐类注入漂移并断言命中，同时断言干净副本放行。
复制真实文件而不是手抄迷你样本：手抄样本会与真文件写法脱节，门禁改了写法自检仍然「通过」。

用法：`python3 ops/check/check_ports_selftest.py`
"""

from __future__ import annotations

import shutil
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO))

from ops.check import check_ports as gate

#: 需要复制进 fixture 的端口面文件（与 gate.SURFACES / NAME_ONLY_FILES 对齐）。
SURFACE_FILES = [
    gate.PORTS_MJS,
    *gate.SURFACES.keys(),
    *gate.NAME_ONLY_FILES,
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
    # `count=-1` 表示全部替换：同一变量名在 deploy.sh 里有多处兜底调用，只改一处时
    # 另一处仍会让锚点命中，用例会「假绿」。
    path.write_text(text.replace(old, new, count) if count > 0 else text.replace(old, new), encoding="utf-8")


def run_case(mutate_fn, fragment: str | None) -> None:
    """建干净副本 → 注入漂移 → 跑门禁；`fragment=None` 表示应当放行。"""
    with tempfile.TemporaryDirectory() as raw:
        root = Path(raw)
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
    # 自检自身的用例体不许把整轮炸掉：任何异常都记成一条失败，让 19 个用例的结果一次看全。
    # （这里刻意捕获 `Exception` 而非更窄的类型，且 ruff 的 BLE001 未启用，故不写 noqa。）
    except Exception as error:
        failures.append(f"{name} —— {type(error).__name__}: {error}")
        print(f"  FAIL {name} —— {type(error).__name__}: {error}")
    else:
        print(f"  OK   {name}")


def main() -> int:
    print("端口一致性门禁自检：")

    run("干净副本放行", lambda: run_case(lambda _root: None, None))

    # ── 判据一：真源表逐项对账 ────────────────────────────────────────────────
    run(
        "真源端口漂移 → 拦下",
        lambda: run_case(
            lambda root: mutate(root, gate.PORTS_MJS, "viteApp: { port: 8805", "viteApp: { port: 8899"),
            "viteApp",
        ),
    )
    run(
        "真源缺项 → 拦下",
        lambda: run_case(
            lambda root: mutate(root, gate.PORTS_MJS, "  debugStore: { port: 8812", "  debugStore2: { port: 8812"),
            "缺少端口项 `debugStore`",
        ),
    )
    run(
        "真源多出未登记项 → 拦下",
        lambda: run_case(
            lambda root: mutate(
                root,
                gate.PORTS_MJS,
                "  debugStore: { port: 8812",
                "  extra: { port: 8899, project: 'homeos', role: 'dev', description: '多余' },\n  debugStore: { port: 8812",
            ),
            "多出未登记的端口项",
        ),
    )
    run(
        "真源写成解析不出的形态 → 拒绝放行",
        lambda: run_case(
            # 全部条目的 `port:` 键名一起改坏：只剩一两条改坏时表还是「能解析出一部分」，
            # 命中的会是「缺少端口项」而不是「解析不到任何条目」。
            lambda root: mutate(root, gate.PORTS_MJS, "port: ", "PORT: ", count=-1),
            "解析不到任何端口条目",
        ),
    )
    run(
        "真源文件缺失 → 报读不到",
        lambda: run_case(lambda root: (root / gate.PORTS_MJS).unlink(), "读不到"),
    )

    # ── 判据二：端口面「出现即对账」+ 锚点必须在 ────────────────────────────
    run(
        "vite 出现未登记端口 → 拦下",
        lambda: run_case(
            lambda root: mutate(
                root,
                "homeos/frontend/vite.config.ts",
                "      port: 8805,",
                "      port: 8805,\n      // 临时改到一个未登记的端口\n      hmrPort: 8899,",
            ),
            "出现未在端口表内的端口",
        ),
    )
    run(
        "vite 的 port / clientPort 锚点被删 → 拦下",
        lambda: run_case(
            lambda root: mutate(root, "homeos/frontend/vite.config.ts", "      port: 8805,\n", ""),
            "找不到锚点",
        ),
    )
    run(
        "后端代理目标漂移 → 拦下",
        lambda: run_case(
            lambda root: mutate(
                root,
                "homeos-store/frontend/vite.config.ts",
                'target: "http://127.0.0.1:8802"',
                'target: "http://127.0.0.1:8898"',
            ),
            "出现未在端口表内的端口",
        ),
    )
    run(
        "compose 默认发布端口漂移 → 拦下",
        lambda: run_case(
            lambda root: mutate(
                root,
                "docker-compose.app.yml",
                '"${APP_PUBLISH_PORT:-8801}:8801"',
                '"${APP_PUBLISH_PORT:-8801}:8899"',
            ),
            "找不到锚点",
        ),
    )
    run(
        "Caddy 反代上游漂移 → 拦下",
        lambda: run_case(
            lambda root: mutate(root, "ops/caddy/app.Caddyfile", "reverse_proxy 127.0.0.1:8801 {", "reverse_proxy 127.0.0.1:8897 {"),
            "出现未在端口表内的端口",
        ),
    )
    run(
        "镜像启动脚本默认端口漂移 → 拦下",
        lambda: run_case(
            lambda root: mutate(root, "ops/docker/start_store.py", 'setdefault("STORE_PORT", "8802")', 'setdefault("STORE_PORT", "8896")'),
            "出现未在端口表内的端口",
        ),
    )

    # ── 判据三：dev.mjs 只许按名字取端口 ────────────────────────────────────
    run(
        "dev.mjs 出现端口字面量 → 拦下",
        lambda: run_case(
            lambda root: mutate(root, "ops/dev.mjs", "const HOST =", "const EXTRA_PORT = 8895;\nconst HOST ="),
            "必须只用 ops/ports.mjs 里的名字取端口",
        ),
    )
    run(
        "dev.mjs 仅在注释里提到端口 → 放行（注释不算字面量）",
        lambda: run_case(
            lambda root: mutate(root, "ops/dev.mjs", "const HOST =", "// 8894 只是注释里的说明\nconst HOST ="),
            None,
        ),
    )

    # ── 判据四：deploy.sh 兜底值 ─────────────────────────────────────────────
    run(
        "deploy.sh 兜底值漂移（该变量所有调用一起改）→ 拦下",
        lambda: run_case(
            # 换成另一个**已登记**的端口：这样不会先被「出现未登记端口」那条挡下，
            # 命中的必须是兜底值对账本身。
            lambda root: mutate(
                root,
                "ops/deploy/deploy.sh",
                "publish_port APP_PUBLISH_PORT 8801",
                "publish_port APP_PUBLISH_PORT 8803",
                count=-1,
            ),
            "兜底值漂移",
        ),
    )
    run(
        "deploy.sh 同一变量两处兜底值打架 → 拦下",
        lambda: run_case(
            # 只改其中一处：这正是「改一处漏一处」的真实形态，必须报不一致而不是被后者覆盖。
            lambda root: mutate(root, "ops/deploy/deploy.sh", "publish_port APP_PUBLISH_PORT 8801", "publish_port APP_PUBLISH_PORT 8803"),
            "出现不一致的兜底值",
        ),
    )
    run(
        "deploy.sh 该变量的兜底调用全被改名 → 拦下",
        lambda: run_case(
            lambda root: mutate(
                root,
                "ops/deploy/deploy.sh",
                "publish_port STORE_PROXY_PUBLISH_PORT 8804",
                "publish_port STORE_PROXY_PUBLISH_PORT_OLD 8804",
                count=-1,
            ),
            "缺少 `publish_port STORE_PROXY_PUBLISH_PORT 8804`",
        ),
    )

    # ── 与真实仓库对齐 ──────────────────────────────────────────────────────
    run("真实仓库当前为绿", lambda: check("真实仓库端口一致", not gate.collect_problems(REPO), "；".join(gate.collect_problems(REPO))))

    if failures:
        print("端口一致性门禁自检失败：")
        for item in failures:
            print(f"  - {item}")
        return 1
    print(f"端口一致性门禁自检通过（{checked} 项断言）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
