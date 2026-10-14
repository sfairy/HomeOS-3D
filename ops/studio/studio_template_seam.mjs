#!/usr/bin/env node
/**
 * `studio_template_seam.mjs` —— Vue SFC **模板整段切片**工具（与 `studio_slice_*` 同一族的第三个切片维度）。
 *
 * 为什么需要它：`entries/EditorView.vue`（模板 2,630 行）与 `entries/StudioView.vue` 的模板里，
 * 绝大多数行不是 Vue 模板逻辑，而是**引擎命令式填充的静态 DOM 契约** ——
 * `<form id="image-inspector" class="inspector-form" hidden>` 这类面板由旧引擎用
 * `getElementById()` / `querySelector()` 取到后自己填/自己读，**零指令**（无 `{{ }}`、`v-*`、`@`、`:` 绑定）。
 * 这类段落可以整段搬进子组件，宿主模板只剩「装配」。
 *
 * 与 `studio_slice_extract.mjs` 的差别：
 * - 那个切的是 **TS AST**（声明 / 语句），带依赖袋与状态回写重写；
 * - 这个切的是 **模板 DOM 段落**，不产生逻辑依赖，因此**不需要 deps 袋**，
 *   唯一契约是「元素 id 在最终 DOM 里仍然唯一可查」。
 *
 * 因此本工具的两个硬保证（也是自检对账的对象）：
 * 1. **不新增包裹元素**：子组件用多根模板（fragment）渲染，DOM 结构与切片前逐字节一致，
 *    不会把 `.panel > .inspector-form` 这类子选择器打断。
 * 2. **id 不丢不重**：被搬走的 id 必须在宿主里消失、在子组件里恰好出现一次，且全仓最终 DOM 内唯一。
 *
 * 用法：
 * ```bash
 * node ops/studio/studio_template_seam.mjs --plan=ops/plans/<x>.json [--dry-run]
 * ```
 * plan JSON：
 * ```json
 * {
 *   "host": "homeos/frontend/src/studio/entries/EditorView.vue",
 *   "outDir": "homeos/frontend/src/studio/chrome/editor",
 *   "note": "为什么这么分组",
 *   "groups": [
 *     { "component": "EditorMediaInspectors", "desc": "媒体类检查器", "ids": ["image-inspector"] }
 *   ]
 * }
 * ```
 * 退出码：0 = 已写盘（或 dry-run 通过）；1 = 任何一项校验没通过（此时**不写盘**）。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, posix } from "node:path";

const ROOT = resolve(process.cwd());

const args = new Map();
for (const raw of process.argv.slice(2)) {
  if (!raw.startsWith("--")) continue;
  const eq = raw.indexOf("=");
  if (eq === -1) args.set(raw.slice(2), "true");
  else args.set(raw.slice(2, eq), raw.slice(eq + 1));
}

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const planPath = args.get("plan");
if (!planPath) fail("缺少 --plan=<plan.json>");
const dryRun = args.get("dry-run") === "true";

const plan = JSON.parse(readFileSync(resolve(ROOT, planPath), "utf8"));
if (!plan.host || !plan.outDir || !Array.isArray(plan.groups) || plan.groups.length === 0)
  fail("plan 必须含 host / outDir / groups[]");

const hostAbs = resolve(ROOT, plan.host);
if (!existsSync(hostAbs)) fail(`宿主不存在：${plan.host}`);

/** HTML 空元素：即使写成 `<img ...>`（无 `/`）也不产生闭合。 */
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr",
]);

/**
 * 模板配平对账：用「起始标签 / 结束标签」栈扫描，比数 `<tag` 与 `</tag` 的个数靠谱 ——
 * 后者会把 SVG 里 `<path>` 这类**真有闭合标签**的元素误判成自闭合，于是每次切片都误报。
 * 起始标签用 `(?:[^>"']|"[^"]*"|'[^']*')*` 吃掉属性，能正确处理 `>` 出现在属性值里的情况。
 */
function templateProblems(text, label) {
  const problems = [];
  // 注释先剥掉：注释里的 `<`、`>`（例如 `<!-- 100vh -> dvh -->`）会被标签扫描当成真标签。
  const src = text.replace(/<!--[\s\S]*?-->/g, "");
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  const stack = [];
  for (const m of src.matchAll(re)) {
    const [, closing, tag, rest] = m;
    if (closing) {
      if (stack.length === 0) {
        problems.push(`${label}：多余的 </${tag}>`);
        continue;
      }
      const expected = stack.pop();
      if (expected !== tag) problems.push(`${label}：</${tag}> 与最近的 <${expected}> 不配对`);
    } else if (VOID_TAGS.has(tag) || /\/\s*$/.test(rest)) {
      // 空元素或显式自闭合：不入栈
    } else {
      stack.push(tag);
    }
  }
  for (const unclosed of stack) problems.push(`${label}：<${unclosed}> 未闭合`);
  return problems;
}
/**
 * 单个标签在该行的「净开合数」：只统计**同名标签**，避免被其它标签干扰。
 *
 * 关键坑：**起始标签跨行**（`<dialog\n  class="...">`）时，同一行里读不到标签结尾。
 * 若把它当 0 计，`locateBlock` 的 `depth <= 0` 会在起始行就成立 → 切出一个**空段落**，
 * 而且宿主那边照样少一行、`tsc` 全绿 —— 属于典型的静默变瞎。所以读不到 `>` 就按「开」计。
 */
function tagDelta(line, tag) {
  let n = 0;
  const tokenRe = new RegExp(`<(${tag})(?=[\\s/>])`, "g");
  for (const m of line.matchAll(tokenRe)) {
    if (VOID_TAGS.has(tag)) continue;
    const after = line.slice(m.index + 1 + tag.length);
    const tail = /^(?:[^>"']|"[^"]*"|'[^']*')*>/.exec(after);
    if (tail && /\/\s*>$/.test(tail[0])) continue; // 同行显式自闭合
    n += 1;
  }
  for (const _ of line.matchAll(new RegExp(`</${tag}\\s*>`, "g"))) n -= 1;
  return n;
}

const hostLines = readFileSync(hostAbs, "utf8").split("\n");
const tplStart = hostLines.findIndex((l) => /^<template>/.test(l));
const tplEnd = hostLines.findIndex((l, i) => i > tplStart && /^<\/template>/.test(l));
if (tplStart === -1 || tplEnd === -1) fail(`${plan.host} 找不到唯一的 <template>…</template>`);

/**
 * 段落锚点：`"#some-id"`（id）或 `".some-class"`（class 令牌）。
 * 为什么不能只认 id：StudioView 的左/右栏里有一整片 `<section class="plan-panel panel-surface">`
 * 这类**没有 id 但同样零指令**的静态段落，只能按 class 定位。
 */
function anchorOf(spec) {
  if (typeof spec !== "string" || spec.length < 1) fail(`锚点不能为空：${JSON.stringify(spec)}`);
  if (spec[0] === ".") {
    if (spec.length < 2) fail(`锚点不能为空：${JSON.stringify(spec)}`);
    return { kind: "class", value: spec.slice(1) };
  }
  const value = spec[0] === "#" ? spec.slice(1) : spec; // id 允许省略 `#`（历史 plan 里都是裸 id）
  if (value.length === 0) fail(`锚点不能为空：${JSON.stringify(spec)}`);
  return { kind: "id", value };
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 起始标签匹配：class 锚点**按空格切令牌后整词比较**，不用 `\b` ——
 * `\bplan-panel\b` 会把 `class="plan-panel--collapsed"` 也吃进来（`-` 是非词字符，边界成立），
 * 于是「同一段落匹配到两次」把工具拦死；而两层意思是完全不同的东西。
 */
function matchStartLine(line, a) {
  const head = /^(\s*)<([a-zA-Z][\w-]*)(?=[\s/>])/.exec(line);
  if (!head) return null;
  if (a.kind === "id") {
    return new RegExp(`\\bid="${escapeRe(a.value)}"`).test(line)
      ? { indent: head[1], tag: head[2] }
      : null;
  }
  const cls = /\bclass="([^"]*)"/.exec(line);
  if (!cls || !cls[1].split(/\s+/).includes(a.value)) return null;
  return { indent: head[1], tag: head[2] };
}

/** 锚点在文本里出现几次（宿主残留对账 / 子组件唯一性对账共用同一口径）。 */
const countAnchor = (text, a) => {
  let n = 0;
  for (const line of text.split("\n")) if (matchStartLine(line, a)) n += 1;
  return n;
};
const describeAnchor = (a) => `${a.kind === "id" ? "id" : "class"}="${a.value}"`;

/** 在宿主模板里按锚点定位整段元素（含缩进），返回 { startLine, endLine, text, indent }（0-based，含端点）。 */
function locateBlock(spec) {
  const a = anchorOf(spec);
  const hits = [];
  for (let i = tplStart + 1; i < tplEnd; i += 1) {
    const m = matchStartLine(hostLines[i], a);
    if (m) hits.push({ i, tag: m.tag, indent: m.indent });
  }
  if (hits.length === 0) fail(`宿主模板里找不到 ${describeAnchor(a)} 的段落`);
  if (hits.length > 1)
    fail(`${describeAnchor(a)} 在宿主模板里出现 ${hits.length} 次（锚点必须唯一，先修重名）`);
  const { i, tag, indent } = hits[0];
  /**
   * 把紧贴在段落上方的**单行 HTML 注释**一起带走。
   * 否则：挂载点插在第一个段落处，而这个注释留在原位置 → 注释与它描述的 dialog 被拆到两处
   * （StudioView 的「设置灯组所属区域」注释就是这么被孤立的），下次改代码的人会照着错位的注释删东西。
   */
  let start = i;
  while (start - 1 > tplStart && /^\s*<!--.*-->\s*$/.test(hostLines[start - 1])) start -= 1;
  const leadText = start < i ? hostLines.slice(start, i) : [];
  const leadIndent = start < i ? /^\s*/.exec(hostLines[start])[0] : indent;
  let depth = 0;
  for (let j = i; j <= tplEnd; j += 1) {
    depth += tagDelta(hostLines[j], tag);
    if (depth <= 0) {
      if (depth < 0) fail(`${describeAnchor(a)} 的 <${tag}> 闭合数超出开合数（模板本身不配平）`);
      return {
        spec,
        anchor: a,
        startLine: start,
        endLine: j,
        text: [...leadText, ...hostLines.slice(i, j + 1)],
        indent: leadIndent,
        tag,
      };
    }
  }
  return fail(`${describeAnchor(a)} 的 <${tag}> 在模板范围内没有闭合`);
}

// —— 0. 幂等保护：本工具**只能对同一个宿主跑一次**（第二次时 id 已不在宿主里），
//        必须在「定位段落」之前就拦，否则第二次跑会报成「找不到 id」而看不出真实原因。
const overwrite = args.get("overwrite") === "true";
const existingComponents = plan.groups
  .map((g) => resolve(ROOT, plan.outDir, `${g.component}.vue`))
  .filter((p) => existsSync(p));
if (existingComponents.length > 0 && !overwrite)
  fail(
    `目标组件已存在（本工具不能重复执行：第二次跑时 id 已不在宿主里）：\n   - ${existingComponents
      .map((p) => posix.relative(ROOT, p))
      .join("\n   - ")}\n   确认要覆盖请加 --overwrite，且先用 git 恢复宿主。`,
  );

// —— 1. 定位所有分段，做整体规划（一次性重排行数组，避免逐组改行号导致偏移漂移）——
const planned = [];
const seenIds = new Map();
for (const group of plan.groups) {
  if (!group.component || !Array.isArray(group.ids) || group.ids.length === 0)
    fail(`groups 里有一项缺 component / ids：${JSON.stringify(group)}`);
  const blocks = group.ids.map((spec) => {
    if (seenIds.has(spec)) fail(`${spec} 在 plan 里被登记了两次（${seenIds.get(spec)} 与 ${group.component}）`);
    seenIds.set(spec, group.component);
    return locateBlock(spec);
  });
  blocks.sort((a, b) => a.startLine - b.startLine);
  for (let k = 1; k < blocks.length; k += 1) {
    if (blocks[k].startLine <= blocks[k - 1].endLine)
      fail(`${blocks[k].spec} 与 ${blocks[k - 1].spec} 的段落重叠（同一段落只能归一个组）`);
  }
  planned.push({ ...group, blocks });
}

// 跨组重叠：组内重叠已拦，但「A 组包住 B 组」时各组自洽 —— 不拦就会把同一段正文切两份。
for (let x = 0; x < planned.length; x += 1) {
  for (let y = x + 1; y < planned.length; y += 1) {
    for (const a of planned[x].blocks) {
      for (const b of planned[y].blocks) {
        if (a.startLine <= b.endLine && b.startLine <= a.endLine)
          fail(
            `跨组重叠：${planned[x].component} 的 ${a.spec} 与 ${planned[y].component} 的 ${b.spec} ` +
              `套在一起（同一段落只能归一个组，否则正文会被切两份）`,
          );
      }
    }
  }
}

// —— 2. 生成子组件文件 ——
const mkComponent = (group) => {
  const body = group.blocks.flatMap((b, i) => (i === 0 ? b.text : ["", ...b.text]));
  return [
    `<script setup lang="ts">`,
    `/**`,
    ` * ${group.desc ?? group.component}。`,
    ` *`,
    ` * 从 \`entries/${posix.basename(plan.host)}\` 模板整段切出（\`ops/studio/studio_template_seam.mjs\`）。`,
    ` * 这些段落是**引擎命令式填充的静态 DOM 契约**（\`getElementById\` / \`querySelector\`），`,
    ` * 零 Vue 指令，故无需 props / emits；用多根模板渲染，DOM 结构与切片前一致（不新增包裹元素）。`,
    ` *`,
    ` * 改动约束：元素 id 属于对外契约，重命名/删除必须同步 \`app/editor/**\` 里的取值方。`,
    ` */`,
    `</script>`,
    ``,
    `<template>`,
    ...body,
    `</template>`,
    ``,
  ].join("\n");
};

// —— 3. 重排宿主：删段落、在首个段落处插入组件标签 ——
const removed = new Set();
const inserts = new Map(); // 行号 → 要在该行**之前**插入的行数组
for (const group of planned) {
  for (const b of group.blocks) {
    for (let i = b.startLine; i <= b.endLine; i += 1) removed.add(i);
  }
  const first = group.blocks[0];
  inserts.set(first.startLine, [`${first.indent}<${group.component} />`]);
}

const nextHost = [];
for (let i = 0; i < hostLines.length; i += 1) {
  if (inserts.has(i)) nextHost.push(...inserts.get(i));
  if (removed.has(i)) continue;
  nextHost.push(hostLines[i]);
}

let hostOut = nextHost.join("\n");

// —— 4. 宿主 script setup 里挂 import（放在最后一条顶层 import 之后）——
const scriptEnd = hostLines.findIndex((l) => /^<\/script>/.test(l));
const scriptStart = hostLines.findIndex((l) => /^<script setup lang="ts">/.test(l));
if (scriptStart === -1 || scriptEnd === -1) fail(`${plan.host} 缺少 <script setup lang="ts">`);
let lastImport = -1;
for (let i = scriptStart + 1; i < scriptEnd; i += 1) {
  if (/^import\s/.test(hostLines[i]) || /^\}\s+from\s/.test(hostLines[i])) lastImport = i;
}
if (lastImport === -1) fail(`${plan.host} 的 script setup 里找不到任何 import，无法自动挂载子组件 import`);

/** 统一用 `/` 正斜杠生成相对 import；命中 `src/` 时优先用仓库约定的 `@/` 别名。 */
const relImport = (fromFile, toFile) => {
  const srcIdx = toFile.indexOf("/src/");
  const fromSrcIdx = fromFile.indexOf("/src/");
  if (srcIdx !== -1 && fromSrcIdx === srcIdx) return `@/${toFile.slice(srcIdx + 5)}`;
  const rel = posix.relative(posix.dirname(fromFile), toFile);
  return rel.startsWith(".") ? rel : `./${rel}`;
};
const importLines = planned.map(
  (g) => `import ${g.component} from "${relImport(plan.host, posix.join(plan.outDir, `${g.component}.vue`))}";`,
);

// 删除/插入后行号已偏移，import 锚点必须**重新按内容定位**，不能复用切片前的下标。
const hostLinesOut = hostOut.split("\n");
const hostTplIdx = hostLinesOut.findIndex((l) => /^<template>/.test(l));
const insertAt = (() => {
  let last = -1;
  for (let i = 1; i < hostTplIdx; i += 1) {
    if (/^import\s/.test(hostLinesOut[i]) || /^\}\s+from\s/.test(hostLinesOut[i])) last = i;
  }
  return last;
})();
if (insertAt === -1) fail("重排后找不到 import 锚点（内部错误）");
hostLinesOut.splice(insertAt + 1, 0, ...importLines);
hostOut = hostLinesOut.join("\n");

// —— 5. 对账：id 不丢不重、标签配平 ——
const problems = [];
const stripTemplate = (src) => {
  const lines = src.split("\n");
  const start = lines.findIndex((l) => /^<template>$/.test(l));
  const end = lines.findIndex((l, i) => i > start && /^<\/template>$/.test(l));
  return lines.slice(start + 1, end).join("\n");
};
const hostTpl = stripTemplate(hostOut);
for (const [spec, component] of seenIds) {
  const a = anchorOf(spec);
  if (countAnchor(hostTpl, a) !== 0)
    problems.push(`${spec} 仍在宿主模板里（应已搬进 ${component}）`);
  if (!hostTpl.includes(`<${component} />`)) problems.push(`宿主模板里没有 <${component} /> 挂载点`);
}
const components = planned.map((g) => ({ name: g.component, src: mkComponent(g) }));
for (const c of components) {
  const tpl = stripTemplate(c.src);
  for (const b of planned.find((g) => g.component === c.name).blocks) {
    const n = countAnchor(tpl, b.anchor);
    if (n !== 1) problems.push(`${c.name} 里 ${b.spec} 出现 ${n} 次（应为 1）`);
  }
  problems.push(...templateProblems(tpl, c.name));
}
for (const l of importLines) {
  if (!l.includes(`"`)) problems.push(`生成的 import 行不合法：${l}`);
}

const report = {
  host: plan.host,
  outDir: plan.outDir,
  dryRun,
  groups: planned.map((g) => ({
    component: g.component,
    anchors: g.blocks.map((b) => b.spec),
    lines: g.blocks.reduce((s, b) => s + b.text.length, 0),
  })),
  hostLines: { before: hostLines.length, after: hostOut.split("\n").length },
  movedLines: planned.reduce((s, g) => s + g.blocks.reduce((t, b) => t + b.text.length, 0), 0),
  imports: importLines,
};

/**
 * 段落不连续 = 组内其它段落会**前移到首个段落的位置**渲染。
 * 模板 DOM 顺序是有语义的（`+` / `~` / `nth-child` / 引擎遍历 `children`），
 * 所以这里不硬拦，但必须报出来让人自己确认 —— 静默改序正是这类工具最容易埋的雷。
 */
const warnings = [];
for (const g of planned) {
  for (let k = 1; k < g.blocks.length; k += 1) {
    if (g.blocks[k].startLine !== g.blocks[k - 1].endLine + 1) {
      warnings.push(
        `${g.component}：段落不连续（${g.blocks[k - 1].spec} 与 ${g.blocks[k].spec} 之间还有宿主内容），` +
          `${g.blocks[k].spec} 的渲染位置会前移到 ${g.blocks[0].spec} 处；请确认没有兄弟选择器 / children 顺序依赖`,
      );
    }
  }
}
if (warnings.length > 0) report.warnings = warnings;

if (problems.length > 0) {
  console.error(JSON.stringify({ ...report, problems }, null, 2));
  fail(`对账未通过（${problems.length} 项），未写盘`);
}

if (!dryRun) {
  mkdirSync(resolve(ROOT, plan.outDir), { recursive: true });
  for (const c of components) {
    writeFileSync(resolve(ROOT, plan.outDir, `${c.name}.vue`), c.src, "utf8");
  }
  writeFileSync(hostAbs, hostOut, "utf8");
}

console.log(JSON.stringify(report, null, 2));
console.log(
  dryRun
    ? "\n   ◇ dry-run：未写盘。"
    : `\n   ✓ 已写盘（宿主 -${report.movedLines} 行）。必跑：bun run --cwd homeos/frontend typecheck && bun run --cwd homeos/frontend check:deps && bun run kpi:studio`,
);
