#!/usr/bin/env python3
"""端口一致性门禁：`ops/ports.mjs` 是唯一真源，其余端口面必须与它一致。

## 为什么需要这道门禁

同一组端口此前散落在**六个**地方各写一遍，且没有任何护栏：

1. `ops/dev.mjs`（源码态启动器的端口表与预检）；
2. `homeos/frontend/vite.config.ts`（HMR 端口 8805 + 后端代理目标 8801）；
3. `homeos-store/frontend/vite.config.ts`（8806 + 8802）；
4. `ops/docker/start_app.py` / `start_store.py`（容器内默认端口）与 `ops/caddy/*.Caddyfile`
   （反代监听 8803 / 8804 与上游回环 8801 / 8802）；
5. `docker-compose.*.yml` 的 `${VAR:-默认值}` 发布端口；
6. `ops/deploy/deploy.sh` 的 `publish_port <VAR> <fallback>` 兜底值。

改一处漏一处的后果都不在「报错」这一侧，而是隔着好几层的症状：本机「前端 502 / 连不上后端」、
部署后「反代指向空气」、或把端口发布成与文档不一致导致客户机连错口。**没有任何一条现有门禁看得见**
（令牌/契约/schema 都不扫端口），所以这里按「单一真源 + 出现即对账」的口径收口：

- 真源：`ops/ports.mjs` 的 `PORTS` 表（语义名 → 端口 / 归属角色）逐项与 `EXPECTED` 对账；
- 对账：每个端口面文件里出现的 **88xx 字面量**都必须落在该文件「允许集合」内（注释先抹白，
  避免文档里的「授权商店为 8806」这类说明被误判）；
- 锚点：结构性命中（vite 的 `port:` / `clientPort:` / `backendDevTarget`、compose 的
  `${VAR:-host}:container` 对、Caddy 的 `servers :<p>` 与 `reverse_proxy 127.0.0.1:<p>`、
  两个启动脚本的默认值、deploy.sh 的兜底值）必须解析到且与表一致 —— 锚点解析不到就报错，
  而不是「扫不到就放行」（门禁静默失效的典型方式）；
- `ops/dev.mjs` 额外要求**零字面量**：它只能通过 `PORTS` 的名字取端口，否则「唯一真源」会在
  启动器里重新分叉。

用法：
```bash
python3 ops/check/check_ports.py                  # 门禁（CI 跑这条）
python3 ops/check/check_ports.py --list           # 只打印真源表 + 各文件命中
python3 ops/check/check_ports.py --repo=<dir>     # 自检注入 fixture 树
```
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO))

# 遍历/注释口径走共享实现（`ops/lib/scan.py`）：各写一份就会漏一种注释写法。
from ops.lib import scan

#: 唯一真源。
PORTS_MJS = "ops/ports.mjs"

#: 真源表必须**恰好**是这些（键名、端口都逐项对账；少一个/多一个都报）。
EXPECTED: dict[str, int] = {
    "appApi": 8801,
    "storeApi": 8802,
    "appProxy": 8803,
    "storeProxy": 8804,
    "viteApp": 8805,
    "viteStore": 8806,
    "debugApp": 8811,
    "debugStore": 8812,
}

#: 真源表条目形状（`ops/ports.mjs` 的 `PORTS` 字面量）。
ENTRY_RE = re.compile(
    r"^\s{2}(\w+): \{ port: (\d+), project: '([^']+)', role: '([^']+)', description: '([^']+)' \},$",
    re.MULTILINE,
)

#: 任意 88xx 端口字面量（8800–8899）。
PORT_LITERAL_RE = re.compile(r"\b(88\d{2})\b")

#: 各端口面文件允许出现的端口集合（超出即报）；`requires` 是该文件必须命中的锚点。
SURFACES: dict[str, tuple[set[int], list[str]]] = {
    "homeos/frontend/vite.config.ts": (
        {EXPECTED["viteApp"], EXPECTED["appApi"]},
        [
            rf"const backendDevTarget = 'http://127\.0\.0\.1:{EXPECTED['appApi']}'",
            rf"^\s*port: {EXPECTED['viteApp']},$",
            rf"^\s*clientPort: {EXPECTED['viteApp']},$",
        ],
    ),
    "homeos-store/frontend/vite.config.ts": (
        {EXPECTED["viteStore"], EXPECTED["storeApi"]},
        [
            rf"^\s*port: {EXPECTED['viteStore']},$",
            rf'target: "http://127\.0\.0\.1:{EXPECTED["storeApi"]}"',
        ],
    ),
    "docker-compose.app.yml": (
        {EXPECTED["appApi"], EXPECTED["appProxy"]},
        [
            rf'"\$\{{APP_PUBLISH_PORT:-{EXPECTED["appApi"]}\}}:{EXPECTED["appApi"]}"',
            rf'"\$\{{APP_PROXY_PUBLISH_PORT:-{EXPECTED["appProxy"]}\}}:{EXPECTED["appProxy"]}"',
        ],
    ),
    "docker-compose.store.yml": (
        {EXPECTED["storeApi"], EXPECTED["storeProxy"]},
        [
            rf'"\$\{{STORE_PUBLISH_PORT:-{EXPECTED["storeApi"]}\}}:{EXPECTED["storeApi"]}"',
            rf'"\$\{{STORE_PROXY_PUBLISH_PORT:-{EXPECTED["storeProxy"]}\}}:{EXPECTED["storeProxy"]}"',
        ],
    ),
    "ops/caddy/app.Caddyfile": (
        {EXPECTED["appProxy"], EXPECTED["appApi"]},
        [
            rf"^\s*servers :{EXPECTED['appProxy']} \{{$",
            rf"^\s*reverse_proxy 127\.0\.0\.1:{EXPECTED['appApi']} \{{",
        ],
    ),
    "ops/caddy/store.Caddyfile": (
        {EXPECTED["storeProxy"], EXPECTED["storeApi"]},
        [
            rf"^\s*servers :{EXPECTED['storeProxy']} \{{$",
            rf"^\s*reverse_proxy 127\.0\.0\.1:{EXPECTED['storeApi']} \{{",
        ],
    ),
    # 主应用容器脚本会在给运维的提示里带上商店地址（跨机分拆部署要照抄），所以它允许
    # 出现 storeApi —— 这是**唯一**一处刻意的跨端端口引用，故在此显式登记。
    "ops/docker/start_app.py": (
        {EXPECTED["appApi"], EXPECTED["appProxy"], EXPECTED["storeApi"]},
        [rf'environment\.get\("APP_PORT", "{EXPECTED["appApi"]}"\)'],
    ),
    "ops/docker/start_store.py": (
        {EXPECTED["storeApi"], EXPECTED["storeProxy"]},
        [rf'setdefault\("STORE_PORT", "{EXPECTED["storeApi"]}"\)'],
    ),
    "ops/docker/proxy.py": (
        {EXPECTED["appApi"], EXPECTED["appProxy"], EXPECTED["storeApi"], EXPECTED["storeProxy"]},
        [
            rf"Caddy 监听 :{EXPECTED['appProxy']} → 反代同容器 127\.0\.0\.1:{EXPECTED['appApi']}",
            rf"Caddy 监听 :{EXPECTED['storeProxy']} → 反代同容器 127\.0\.0\.1:{EXPECTED['storeApi']}",
        ],
    ),
    "ops/deploy/deploy.sh": (
        {EXPECTED["appApi"], EXPECTED["appProxy"], EXPECTED["storeApi"], EXPECTED["storeProxy"]},
        [
            rf'publish_port APP_PUBLISH_PORT {EXPECTED["appApi"]}',
            rf'publish_port APP_PROXY_PUBLISH_PORT {EXPECTED["appProxy"]}',
            rf'publish_port STORE_PUBLISH_PORT {EXPECTED["storeApi"]}',
            rf'publish_port STORE_PROXY_PUBLISH_PORT {EXPECTED["storeProxy"]}',
        ],
    ),
}

#: 只允许通过名字取端口的文件（出现任何 88xx 字面量即报）。
NAME_ONLY_FILES = ("ops/dev.mjs",)

#: `publish_port <VAR> <默认值>` 的期望映射（deploy.sh 的兜底值必须与 compose 默认值一致）。
DEPLOY_FALLBACKS: dict[str, int] = {
    "APP_PUBLISH_PORT": EXPECTED["appApi"],
    "APP_PROXY_PUBLISH_PORT": EXPECTED["appProxy"],
    "STORE_PUBLISH_PORT": EXPECTED["storeApi"],
    "STORE_PROXY_PUBLISH_PORT": EXPECTED["storeProxy"],
}


def _strip(text: str, rel_path: str) -> str:
    """按语言抹掉**行注释与注释行**，保留字符串字面量与代码。

    刻意不走 `scan.strip_comments` 的块注释口径：那一支是**删除式**匹配，遇到
    「字符串字面量里出现 `/*` 而注释里又出现 `*/`」的文件（`vite.config.ts` 就是，
    一处注释里的路径写法让它把 147 行代码整体吞掉）会连代码一起删，锚点随之找不到。
    本门禁只需要「注释行不算数」这一档语义，所以按行处理：注释行整行抹白，
    行尾 `//`（保留 `://` 协议头）与行尾 `#` 去掉。字符串里的 `http://127.0.0.1:8801`
    因此仍然可见 —— 端口代理目标正是写在这种字面量里的。
    """
    suffix = Path(rel_path).suffix

    if suffix in {".yml", ".yaml", ".sh", ".py"} or rel_path.endswith("Caddyfile"):
        if suffix == ".py":
            # 文档字符串先整段抹白（模块契约写在里面，但那是**文本**不是代码）。
            text = re.sub(r'"""(?:.|\n)*?"""', '""', text)
        return re.sub(r"#[^\n]*", "", text)

    if suffix in {".ts", ".tsx", ".js", ".mjs", ".cjs", ".vue"}:
        lines: list[str] = []
        for line in text.splitlines():
            stripped = line.lstrip()
            if stripped.startswith(("//", "*", "/*", "*/")):
                lines.append("")
                continue
            # 行尾 `//` 注释：`(^|[^:])` 保住 `http://` 这类协议头。
            lines.append(re.sub(r"(^|[^:])//.*$", lambda match: match.group(1), line))
        return "\n".join(lines)

    return text


def parse_source_table(repo: Path) -> tuple[dict[str, int], list[str]]:
    """解析 `ops/ports.mjs` 的 `PORTS` 表。"""
    path = repo / PORTS_MJS
    text = scan.read_text(path)
    if text is None:
        return {}, [f"{PORTS_MJS} 读不到（真源文件缺失或不可读）"]

    table: dict[str, int] = {}
    for name, port, project, _role, _description in ENTRY_RE.findall(text):
        if name in table:
            return table, [f"{PORTS_MJS} 里 `{name}` 重复登记"]
        table[name] = int(port)
        if project not in {"homeos", "homeos-store"}:
            return table, [f"{PORTS_MJS} 里 `{name}` 的 project 取值异常：{project}"]

    if not table:
        return {}, [f"{PORTS_MJS} 解析不到任何端口条目（写法变了？拒绝放行）"]
    return table, []


def compare_table(table: dict[str, int]) -> list[str]:
    problems: list[str] = []
    for name, expected in EXPECTED.items():
        if name not in table:
            problems.append(f"{PORTS_MJS} 缺少端口项 `{name}`（期望 {expected}）")
        elif table[name] != expected:
            problems.append(f"{PORTS_MJS} 的 `{name}` 漂移：{table[name]} ≠ {expected}")
    for name in sorted(set(table) - set(EXPECTED)):
        problems.append(f"{PORTS_MJS} 多出未登记的端口项 `{name}`（{table[name]}）；同步登记到 check_ports.py 的 EXPECTED")
    return problems


def check_surface(repo: Path, rel_path: str, allowed: set[int], anchors: list[str]) -> list[str]:
    problems: list[str] = []
    path = repo / rel_path
    raw = scan.read_text(path)
    if raw is None:
        return [f"{rel_path} 读不到（端口面文件缺失）"]

    text = _strip(raw, rel_path)
    literals = {int(value) for value in PORT_LITERAL_RE.findall(text)}
    stray = sorted(literals - allowed)
    if stray:
        problems.append(
            f"{rel_path} 出现未在端口表内的端口：{stray}（该文件允许 {sorted(allowed)}）"
            f"；先登记到 {PORTS_MJS}，或改成从真源取值",
        )

    # 锚点在**原文**上匹配：有的锚点就写在文档注释里（`ops/docker/proxy.py` 的模块 docstring
    # 就是端口契约的说明处），抹掉注释会让它永远找不到。
    for anchor in anchors:
        if not re.search(anchor, raw, re.MULTILINE):
            problems.append(f"{rel_path} 找不到锚点 {anchor!r}（结构被改动了？门禁拒绝静默放行）")
    return problems


def check_name_only(repo: Path, rel_path: str) -> list[str]:
    raw = scan.read_text(repo / rel_path)
    if raw is None:
        return [f"{rel_path} 读不到（端口面文件缺失）"]
    literals = sorted({int(v) for v in PORT_LITERAL_RE.findall(_strip(raw, rel_path))})
    if literals:
        return [
            f"{rel_path} 直接写了端口字面量 {literals}；该文件必须只用 {PORTS_MJS} 里的名字取端口",
        ]
    return []


def check_deploy_fallbacks(repo: Path) -> list[str]:
    """deploy.sh 的 `publish_port <VAR> <默认值>` 兜底值必须与真源一致。"""
    rel_path = "ops/deploy/deploy.sh"
    raw = scan.read_text(repo / rel_path)
    if raw is None:
        return [f"{rel_path} 读不到"]
    text = _strip(raw, rel_path)

    problems: list[str] = []
    found = re.findall(r"publish_port (\w+) (\d+)", text)
    if not found:
        return [f"{rel_path} 解析不到 `publish_port <VAR> <默认值>`（写法变了？拒绝放行）"]

    # 同一变量可能被多处方括号兜底（商店端口在提示与判断里各出现一次）。用 set 收集而不是
    # 「最后一个胜出」：两处写法打架时，最后胜出的那种收法会让门禁对**真漂移**放行。
    seen: dict[str, set[int]] = {}
    for name, value in found:
        seen.setdefault(name, set()).add(int(value))

    for name, values in sorted(seen.items()):
        if len(values) > 1:
            problems.append(
                f"{rel_path} 的 `publish_port {name}` 出现不一致的兜底值 {sorted(values)}"
                f"；三处必须同值（compose 默认值 / deploy.sh 兜底值 / 真源表）",
            )

    for name, expected in DEPLOY_FALLBACKS.items():
        if name not in seen:
            problems.append(f'{rel_path} 缺少 `publish_port {name} {expected}` 的兜底值')
        elif expected not in seen[name]:
            problems.append(f"{rel_path} 的 `{name}` 兜底值漂移：{sorted(seen[name])} ≠ {expected}")
    return problems


def collect_problems(repo: Path | None = None) -> list[str]:
    root = repo or REPO
    table, problems = parse_source_table(root)
    if not table:
        return problems

    problems += compare_table(table)
    for rel_path, (allowed, anchors) in SURFACES.items():
        problems += check_surface(root, rel_path, allowed, anchors)
    for rel_path in NAME_ONLY_FILES:
        problems += check_name_only(root, rel_path)
    problems += check_deploy_fallbacks(root)
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description="端口一致性门禁（真源 ops/ports.mjs）")
    parser.add_argument("--repo", default=str(REPO), help="注入仓库根（自检用 fixture）")
    parser.add_argument("--list", action="store_true", help="只打印真源表与各端口面命中情况")
    args = parser.parse_args()

    root = Path(args.repo)
    table, parse_problems = parse_source_table(root)
    if args.list:
        print(f"端口真源 {PORTS_MJS}：")
        for name, port in sorted(table.items(), key=lambda item: item[1]):
            print(f"  {port:>5}  {name}")
        print("\n端口面：")
        for rel_path, (allowed, _anchors) in SURFACES.items():
            raw = scan.read_text(root / rel_path) or ""
            hits = sorted({int(v) for v in PORT_LITERAL_RE.findall(_strip(raw, rel_path))})
            print(f"  {rel_path}  命中 {hits}  允许 {sorted(allowed)}")
        for rel_path in NAME_ONLY_FILES:
            print(f"  {rel_path}  必须零字面量")
        if parse_problems:
            for problem in parse_problems:
                print(f"  ✗ {problem}")
        return 1 if parse_problems else 0

    problems = collect_problems(root)
    if problems:
        print("端口一致性门禁失败：")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print(f"✓ 端口一致性门禁通过：真源 {len(table)} 项，{len(SURFACES) + len(NAME_ONLY_FILES)} 个端口面 + deploy 兜底值一致。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
