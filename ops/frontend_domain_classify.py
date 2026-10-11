#!/usr/bin/env python3
"""前端「共享域 vs 叶子域」归类器（P2 每批迁移前先跑）。

## 为什么需要它

P2 最初假设每个域都能自持进 `features/<域>/`。实测（energy 批）发现多数域是
**被下层反向依赖**的共享基础设施：`stores/defaults.ts`、`shared/constants/dashboard-footer.ts`、
`shared/constants/utility-meter-presets.ts`、`composables/ui/useDashboardFooter.ts`、`App.vue`
都会 import 它们。这类域放进 `features/` 会立刻产生 `stores → features` 的分层倒置。

（P3 起根级 `constants/`、`types/` 已并入 `shared/`：新的 `shared/{constants,types}/**`
经首段 `shared` 命中 `LOWER_LAYERS`，判定口径不变；集合里保留旧的 `constants`/`types` 仅作兜底。）

判定准则（DAG 位置）：

- 入边只有 `views/` `layouts/` 或同域自身 → **叶子域** → 落 `src/features/<域>/`
- 入边出现 `stores/` `constants/` `types/` `utils/` `composables/` 或根入口
  → **共享域** → 落 `src/shared/<域>/`（`shared` 在 DAG 里位于这些层**下方**）

## 用法

```bash
python3 ops/frontend_domain_classify.py                      # 归类 src/ 下所有候选域
python3 ops/frontend_domain_classify.py --domain energy      # 只看某个域
python3 ops/frontend_domain_classify.py --bucket composables # 只看某个层的桶
```

本脚本是**分析工具**（advisory），不参与 CI 拦截；硬拦截在
`homeos/frontend/scripts/check-frontend-deps.mjs` 与 `eslint.config.js`。

**判定 ≠ 归宿**：本脚本只做「入边测试」，看不到「`components → features` 被门禁禁止」「是壳层装配点」
「消费者跨多个视图 + 多个域」这类约束，因此会对一些**有意留位**的桶给出 `LEAF` 的错误建议：
`components/{dashboard,page-shell,setup}`、`composables/{life,widget,api,auth,security,settings-kernel}`。
最终归宿以 `homeos/frontend/src/README.md` 的「Where to edit」表为准（输出末尾也会再提醒一次）。
"""

from __future__ import annotations

import argparse
import collections
import pathlib
import re
import sys

# 通用桶名 —— 这些是「按层聚合」的容器，不是域，别把它们当候选域。
GENERIC_BUCKETS = {
    "common", "base", "ui", "core", "shared", "styles", "utils", "helpers",
    "popups", "widgets", "shell", "hooks", "mixins", "types", "constants",
}

# 参与 DAG 判断的层
LAYERS = (
    "views", "features", "components", "composables", "utils",
    "stores", "constants", "types", "layouts", "services", "shared", "platform",
)

# 处于 shared 之下的层 / 根入口：出现这些入边即判为共享域
LOWER_LAYERS = {"stores", "constants", "types", "utils", "composables", "services", "platform"}
ENTRY_FILES = {"App.vue", "main.ts"}

IMPORT_RE = re.compile(r"""from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]""")


def norm(spec: str) -> str:
    return spec.replace(".ts", "").replace(".vue", "")


def layer_of(path: str) -> str:
    head = path.split("/", 1)[0]
    return head if head in LAYERS else "root"


def load(src_root: pathlib.Path):
    """返回 {相对路径: 源码}，跳过 studio 子系统与纯 re-export 兼容桩。"""
    texts: dict[str, str] = {}
    for p in sorted(src_root.rglob("*")):
        if p.suffix not in (".ts", ".vue"):
            continue
        if "studio" in p.parts or "node_modules" in p.parts:
            continue
        rel = str(p.relative_to(src_root))
        texts[rel] = p.read_text(encoding="utf-8")
    return texts


def is_compat_stub(text: str) -> bool:
    """纯 re-export 桩：只有 re-export/import 行，且全部指向 @/features 或 @/shared。

    这类文件是迁移过渡产物，不是真实消费者，必须排除，否则每个已迁域都会
    被自己的 9 个 compat 桩「伪造」出下层入边（security 批的假阳性来源）。
    """
    specs = [m.group(1) or m.group(2) or "" for m in IMPORT_RE.finditer(text)]
    if not specs:
        return False
    if not all(s.startswith(("@/features/", "@/shared/")) for s in specs):
        return False
    body = re.sub(r"/\*[\s\S]*?\*/", "", text)
    body = re.sub(r"//.*$", "", body, flags=re.MULTILINE)
    for line in body.splitlines():
        t = line.strip()
        if not t:
            continue
        if t.startswith(("import ", "export ")):
            continue
        if t in ("{", "}", "};") or t.endswith(("{", "}", "};", ",")):
            continue
        return False
    return True


def build_edges(texts: dict[str, str]) -> dict[str, set[str]]:
    edges: dict[str, set[str]] = collections.defaultdict(set)
    for src, text in texts.items():
        for m in IMPORT_RE.finditer(text):
            spec = m.group(1) or m.group(2) or ""
            if spec.startswith("@/"):
                edges[src].add(norm(spec[2:]))
    return edges


def discover_domains(src_root: pathlib.Path, only_domain: str | None, only_bucket: str | None):
    """候选域 = `src/<layered-bucket>/<name>/`，加上 `src/features/<name>/`。"""
    found: list[tuple[str, str]] = []
    buckets = (only_bucket,) if only_bucket else (
        "components", "composables", "utils", "constants", "types", "features",
    )
    for bucket in buckets:
        base = src_root / bucket
        if not base.is_dir():
            continue
        for entry in sorted(base.iterdir()):
            if not entry.is_dir() or entry.name in GENERIC_BUCKETS:
                continue
            if only_domain and entry.name != only_domain:
                continue
            found.append((entry.name, f"{bucket}/{entry.name}"))
    return found


def classify(name: str, prefix: str, texts: dict[str, str], edges: dict[str, set[str]]):
    member_paths = [p for p in texts if p == prefix or p.startswith(prefix + "/")]
    if not member_paths:
        return None
    members = {norm(p) for p in member_paths}
    # 整桶都是纯 re-export 兼容桩（如迁移后的 `composables/security`）→ 不是域，跳过。
    if all(is_compat_stub(texts[p]) for p in member_paths):
        return None

    consumers: dict[str, set[str]] = collections.defaultdict(set)
    for src, specs in edges.items():
        if norm(src) in members or is_compat_stub(texts.get(src, "")):
            continue
        for spec in specs:
            if spec in members or any(spec.startswith(m + "/") for m in members):
                consumers[src].add(spec)
    lower = sorted(
        c for c in consumers
        if layer_of(c) in LOWER_LAYERS or c in ENTRY_FILES or layer_of(c) == "root"
    )
    by_layer = collections.Counter(layer_of(c) for c in lower)
    return {
        "name": name,
        "prefix": prefix,
        "files": len(members),
        "consumers": len(consumers),
        "lower": lower,
        "by_layer": by_layer,
        "shared": bool(lower),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="前端共享域 / 叶子域归类")
    ap.add_argument("--src", default="homeos/frontend/src", help="前端 src 根目录")
    ap.add_argument("--domain", help="只分析指定域")
    ap.add_argument("--bucket", help="只分析指定层的桶（如 composables / utils）")
    args = ap.parse_args()

    src_root = pathlib.Path(args.src)
    if not src_root.is_dir():
        print(f"找不到 {src_root}（请在仓库根执行，或用 --src 指定）", file=sys.stderr)
        return 2

    texts = load(src_root)
    edges = build_edges(texts)
    rows = [r for r in (classify(n, p, texts, edges) for n, p in discover_domains(src_root, args.domain, args.bucket)) if r]
    rows.sort(key=lambda r: (not r["shared"], -r["files"]))

    print(f"src 根: {src_root}  （文件 {len(texts)}，已排除 studio 与纯 re-export 兼容桩）\n")
    print(f"{'域':26} {'文件':>5} {'外部消费者':>10}  {'下层入边分层':26} 判定")
    print("-" * 104)
    for r in rows:
        verdict = "SHARED  → src/shared/" if r["shared"] else "LEAF    → src/features/"
        by = str(dict(r["by_layer"])) if r["shared"] else "-"
        print(f"{r['prefix']:26} {r['files']:>5} {r['consumers']:>10}  {by:26} {verdict}")
        for c in r["lower"][:4]:
            print(f"{'':26} {'':>5} {'':>10}  ↳ [{layer_of(c)}] {c}")
        if len(r["lower"]) > 4:
            print(f"{'':26} {'':>5} {'':>10}  ↳ … 另有 {len(r['lower']) - 4} 个下层消费者")

    shared = [r for r in rows if r["shared"]]
    leaf = [r for r in rows if not r["shared"]]
    print(f"\n汇总：共享域 {len(shared)} 个，叶子域 {len(leaf)} 个")
    if leaf:
        print("叶子域（可进 features/）：" + "、".join(r["prefix"] for r in leaf))
    print("\n注：以上只是入边测试的启发式结论，未考虑「components → features 被门禁禁止」「壳层装配点」")
    print("    「消费者跨多个视图 + 多个域」等约束。故 components/{dashboard,page-shell,setup} 与")
    print("    composables/{life,widget,api,auth,security,settings-kernel} 被判成 LEAF，实为**有意留位**。")
    print("    最终归宿以 homeos/frontend/src/README.md 的「Where to edit」表为准。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
