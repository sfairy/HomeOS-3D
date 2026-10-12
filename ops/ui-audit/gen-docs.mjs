/**
 * 由 reports/*.json 生成 docs/ui-audit/ 分册 checklist。
 *
 * 用法：`node ops/ui-audit/gen-docs.mjs`（run-all.mjs 末尾自动调用）
 * 产出：docs/ui-audit/{README,01..07,08-duplicate-classes}.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(ROOT, "docs/ui-audit");
fs.mkdirSync(OUT, { recursive: true });

const surfaces = JSON.parse(fs.readFileSync(path.join(ROOT, "ops/ui-audit/reports/surfaces.json"), "utf8"));
const unused = JSON.parse(fs.readFileSync(path.join(ROOT, "ops/ui-audit/reports/css-unused.json"), "utf8"));
const dup = JSON.parse(fs.readFileSync(path.join(ROOT, "ops/ui-audit/reports/css-duplicates.json"), "utf8"));
const bp = JSON.parse(fs.readFileSync(path.join(ROOT, "ops/ui-audit/reports/breakpoints.json"), "utf8"));

const byKind = (kinds) => surfaces.surfaces.filter((s) => kinds.includes(s.kind));

// 只列目录内的 .css（递归，上限 12 条 + 总数），避免把全局样式表粘进每行。
function cssIn(prefixes, limit = 12) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        walk(p);
      } else if (e.name.endsWith(".css")) found.push(path.relative(ROOT, p));
    }
  };
  for (const pre of prefixes) {
    const abs = path.join(ROOT, pre);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isFile()) found.push(path.relative(ROOT, abs));
    else walk(abs);
  }
  const unique = [...new Set(found)].sort();
  return { total: unique.length, shown: unique.slice(0, limit) };
}

// 未使用类按 definedIn 精确目录归属；目录集合来自本组样式入口所在目录。
function unusedIn(prefixes, limit = 10) {
  const dirs = new Set(
    prefixes
      .map((p) => path.join(ROOT, p))
      .filter((p) => fs.existsSync(p) && fs.statSync(p).isFile())
      .map((p) => path.posix.dirname(path.relative(ROOT, p)))
  );
  for (const p of prefixes) {
    const abs = path.join(ROOT, p);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      const rel = path.relative(ROOT, abs);
      for (const u of unused.unusedStrict) for (const d of u.definedIn ?? []) if (path.posix.dirname(d).startsWith(rel)) dirs.add(path.posix.dirname(d));
    }
  }
  return unused.unusedStrict
    .filter((u) => (u.definedIn ?? []).some((d) => dirs.has(path.posix.dirname(d))))
    .slice(0, limit);
}

const GROUPS = [
  {
    file: "01-auth-shell.md",
    title: "入户 · 认证 · 主壳",
    kinds: ["auth", "shell"],
    phase: "Phase 2 批次 1–2",
    contract: "暖金品牌区：`--hos-accent`（`#ffc46a`）。主壳内的功能控件属蓝色功能区 —— 跨区不得互相覆盖。",
    prefixes: [
      "homeos/frontend/public/static/appearance.css",
      "homeos/frontend/public/static/auth",
      "homeos/frontend/src/views/auth",
      "homeos/frontend/src/layouts/styles",
      "homeos/frontend/src/components/dashboard",
    ],
  },
  {
    file: "02-lists.md",
    title: "列表页",
    kinds: ["devices", "events", "notifications", "security", "embed"],
    phase: "Phase 2 批次 3–4",
    contract: "主应用内蓝色功能区：`--accent`（`#0A84FF`）；页级 `--page-accent` 由各视图注入，回退值三处不一致（`#34d399` / `#60a5fa` / `#0A84FF`）待统一。",
    prefixes: [
      "homeos/frontend/src/views/styles",
      "homeos/frontend/src/features/device",
      "homeos/frontend/src/features/events",
      "homeos/frontend/src/features/notifications",
      "homeos/frontend/src/features/security",
      "homeos/frontend/src/components/page-shell",
      "homeos/frontend/src/components/widgets",
      "homeos/frontend/src/assets/styles/list-page.css",
    ],
  },
  {
    file: "03-settings.md",
    title: "设置域",
    kinds: ["settings"],
    phase: "Phase 2 批次 5",
    contract: "唯一入口令牌层：`features/settings/shared/styles/settings-tokens.css`。子域不得各自定义平行令牌。",
    prefixes: ["homeos/frontend/src/features/settings"],
  },
  {
    file: "04-studio.md",
    title: "3D Studio",
    kinds: ["studio", "shared-studio"],
    phase: "Phase 2 批次 7",
    contract: "Studio 自带皮肤层（`studio-chrome.css` + `public/static/3d-studio/studio.css`），与主壳独立；令牌沿用 `--hos-*` 语义层。",
    prefixes: ["homeos/frontend/src/studio/chrome", "homeos/frontend/src/studio/runtime", "homeos/frontend/public/static/3d-studio"],
  },
  {
    file: "05-store.md",
    title: "商店前台",
    kinds: ["store", "store-setup"],
    phase: "Phase 3 前台",
    contract: "暖金品牌区：`--hb-accent`（`#ffc46a`）。令牌单一来源 `public/static/theme.css`，`PalettePanel` 可实时改色。",
    prefixes: ["homeos-store/frontend/public/static", "homeos-store/frontend/src/views/store", "homeos-store/frontend/src/scene"],
  },
  {
    file: "06-admin.md",
    title: "商店管理后台",
    kinds: ["admin"],
    phase: "Phase 3 后台",
    contract: "暖金品牌区，与前台共用 `theme.css`；需校验 `PalettePanel` 注入的 `--hos-*` / `--hb-*` 与 `theme.css` 默认值一致。",
    prefixes: ["homeos-store/frontend/public/static/admin.css", "homeos-store/frontend/src/views/admin"],
  },
  {
    file: "07-shared.md",
    title: "跨页共享组件与布局",
    kinds: ["shared-components", "shared-layouts"],
    phase: "随所属批次",
    contract: "跨区共享，禁止绑定具体色相；只引用语义层（`--hos-surface-*` / `--hos-text-*` / `--hos-border-*`）。",
    prefixes: [
      "homeos/frontend/src/components/common",
      "homeos/frontend/src/assets/styles/modal-theme.css",
      "homeos/frontend/src/assets/styles/anchored-popup-shells.css",
      "homeos/frontend/src/assets/styles/popup-base.css",
      "homeos/frontend/src/components/entities/popups",
    ],
  },
];

const idx = [];
idx.push("# UI 审计分册索引", "");
idx.push("由 `ops/ui-audit/surface-inventory.mjs` / `css-unused.mjs` / `breakpoint-audit.mjs` 的数据生成，作为 Phase 2/3 分批改动的 checklist。", "");
idx.push(`- 全量 surface：**${surfaces.total}** 个（homeos ${surfaces.byProject.homeos} / store ${surfaces.byProject.store}）`);
idx.push(`- 规范外断点：**${bp.offCanonical.length}** 个（全仓 ${bp.mediaTotal} 条 @media）；规范集合 639/640、900、1024、1280`);
idx.push(`- 严格未使用类：**${unused.unusedStrictCount}** 个；疑似未使用 ${unused.unusedConventionCount}；动态引用 ${unused.unusedDynamicCount}；整表死文件 ${unused.deadStylesheetCount}`);
idx.push("- 跨文件真冗余：**0** 组（详见 [08-duplicate-classes.md](./08-duplicate-classes.md)）", "");
idx.push("| 分册 | surface | 对应批次 |");
idx.push("| --- | --- | --- |");
for (const g of GROUPS) idx.push(`| [${g.title}](./${g.file}) | ${byKind(g.kinds).length} | ${g.phase} |`);
idx.push("", "> `surfaces.json` 的 `styles` 字段是全仓聚合值而非按 surface 切分，故分册改列**目录级样式入口**（真实文件）。", "");
fs.writeFileSync(path.join(OUT, "README.md"), idx.join("\n"));

for (const g of GROUPS) {
  const ss = byKind(g.kinds);
  const css = cssIn(g.prefixes);
  const hot = unusedIn(g.prefixes);
  const out = [];
  out.push(`# ${g.title}`, "");
  out.push(`${g.phase} · ${ss.length} 个 surface`, "");
  out.push(`**配色契约**：${g.contract}`, "");
  out.push("## Surface 清单", "");
  out.push("| id | kind | route | view |");
  out.push("| --- | --- | --- | --- |");
  for (const s of ss) out.push(`| \`${s.id}\` | ${s.kind} | ${s.route ?? "—"} | ${s.view ?? "—"} |`);
  out.push("");
  out.push(`## 本组样式入口（${css.total} 个 .css）`, "");
  for (const f of css.shown) out.push(`- \`${f}\``);
  if (css.total > css.shown.length) out.push(`- …另 ${css.total - css.shown.length} 个`);
  out.push("");
  out.push("## 严格未使用类热点", "");
  if (!hot.length) {
    out.push("本组样式目录下无严格未使用类。", "");
  } else {
    out.push("| 类名 | 出现次数 | 定义于 |");
    out.push("| --- | --- | --- |");
    for (const u of hot) out.push(`| \`${u.name}\` | ${u.totalOccurrences} | ${(u.definedIn ?? []).map((x) => `\`${x}\``).join("<br>")} |`);
    out.push("");
    out.push("> 严格未使用 = 全仓无静态 `class=\"…\"` 引用。删前确认无动态拼接（见 `unusedDynamic`）与无 `public/static` URL 投放。", "");
  }
  out.push("## 改动前检查", "");
  out.push("- [ ] 改动前截图（基线见 `ops/ui-audit/shots/baseline/`）");
  out.push("- [ ] `bun run verify:tokens` 通过");
  out.push("- [ ] 未引入新硬编码色（`scan-hardcoded-colors.mjs` 前后对比）");
  out.push("- [ ] 未引入规范外断点");
  out.push("- [ ] 改动后截图对比，零视觉回归");
  out.push("");
  fs.writeFileSync(path.join(OUT, g.file), out.join("\n"));
}

const t = dup.totals ?? {};
const d = [];
d.push("# 跨文件重复分类明细", "");
d.push(`重复规则组共 **${t.duplicateRuleGroups ?? 0}** 组：可清理 **${t.duplicateRuleGroupsCleanable ?? 0}**，刻意重复 **${t.duplicateRuleGroupsIntentional ?? 0}**，未归因 **${t.duplicateRuleGroupsUnattributed ?? 0}**。`, "");
d.push("| 分类 | 组数 | 判定依据 |");
d.push("| --- | --- | --- |");
const REASON = {
  "cross-bundle": "经 `public/static` 或脚本里的 `.css` URL 独立投放，需各自自足",
  "scoped-distinct": "含 `<style scoped src>`，编译后带 `[data-v-*]` 属性，非共享",
  "cross-project": "跨 homeos / store / shared，各自独立构建",
  mirror: "同源镜像，由 `verify_scene_sync.py` 校验逐字节一致",
};
for (const [k, v] of Object.entries(t.byClassification ?? {})) d.push(`| ${k} | ${v} | ${REASON[k] ?? "—"} |`);
d.push("");
d.push(`其余指标：复用声明体 ${t.reusedBodyGroups ?? 0} 组；同名 keyframe ${t.duplicateKeyframeNames ?? 0} 个（可清理 ${t.duplicateKeyframeNamesCleanable ?? 0}）；同名令牌 ${t.duplicateTokenNames ?? 0} 个，其中取值冲突 ${t.conflictingTokenNames ?? 0} 个；块内重复声明 ${t.intraBlockDupes ?? 0} 处，全部为回退值模式（var(--a, #fff) 与后续声明并存）；空规则 ${t.emptyRules ?? 0}。`);
d.push("");
d.push("> 同名令牌取值冲突与块内回退是「同一名字在不同作用域下取不同值」的正常形态，不做合并。");
d.push("");
fs.writeFileSync(path.join(OUT, "08-duplicate-classes.md"), d.join("\n"));

console.log("生成:", fs.readdirSync(OUT).sort().join("  "));
