/**
 * 控件注册表拆分后的结构守卫。
 *
 * `frontend/static/renderer/core/registry.js` 已从 5,205 行拆成 `registry/` 下的一组分片，
 * 拆分方式本身带来两个只有运行期才会暴露的静默故障：
 *   1. 某个 `components/<类型>.js` 没被 barrel import —— 注册是 import 副作用，
 *      漏一个类型不会报错，只会在页面上变成「控件尚未实现」；
 *   2. 某个分片自己 `new Map()` 又建了一张 `componentsByType` —— 两份表互不相认，
 *      注册进去的渲染器查不到。
 *
 * 这两件事一个 `rg` 看不出来，所以在这里固定下来。
 *
 * Usage:
 *   node tools/check_registry_split.mjs            # 报告（有问题时仍以 1 退出）
 *   node tools/check_registry_split.mjs --json     # 机器可读
 *
 * Checks:
 *   1. `registry/` 下每个分片都能从 `registry.js` 传递到达；`components/*.js` 还必须被
 *      barrel 直接 import（注册是 import 副作用）。
 *   2. 每个 `registerComponent("<type>"` 所在的分片都被 barrel 引入，且同一类型只注册一次。
 *   3. 全仓只有一处 `componentsByType` 的「创建」（`= new Map()`）。
 *   4. 分片里所有相对 import 都带 `?v=`，且与 barrel 同戳。
 *   5. `registry/` 内部分片不被 barrel 之外的文件引用（`cover-runtime.js` 是登记在案的例外）。
 *   6. `registerComponent(...)` 的调用只出现在 `registry/components/*.js`，helper 分片不许注册控件。
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORE = path.join(ROOT, "frontend/static/renderer/core");
const BARREL = path.join(CORE, "registry.js");
const SPLIT_DIR = path.join(CORE, "registry");
const COMPONENTS_DIR = path.join(SPLIT_DIR, "components");

const asJson = process.argv.includes("--json");
const problems = [];
const notes = [];

const read = (file) => fs.readFileSync(file, "utf8");

/**
 * 去掉注释、保留字符串的状态机剥壳。
 *
 * 结构性扫描必须走这里：`// import "./registry/components/weather.js"` 这种被注释掉的
 * import 用裸正则一样能匹配上，守卫会因此漏报（本脚本的第一版就漏了）。
 */
function codeOnly(text) {
  let out = "";
  let state = "normal";
  let lastMeaningful = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (state === "line-comment") {
      if (char === "\n") {
        state = "normal";
        out += char;
      } else {
        out += " ";
      }
      continue;
    }
    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        index += 1;
        state = "normal";
        out += "  ";
      } else {
        out += char === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (state === "single" || state === "double" || state === "template") {
      out += char;
      if (char === "\\") {
        out += next ?? "";
        index += 1;
      } else if ((state === "single" && char === "'") || (state === "double" && char === '"') || (state === "template" && char === "`")) {
        state = "normal";
      } else if (state === "template" && char === "$" && next === "{") {
        out += next;
        index += 1;
      }
      continue;
    }
    if (state === "regex") {
      out += char;
      if (char === "\\") {
        out += next ?? "";
        index += 1;
      } else if (char === "/" || char === "\n") {
        state = "normal";
      }
      continue;
    }
    if (char === "/" && next === "/") {
      state = "line-comment";
      out += "  ";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      state = "block-comment";
      out += "  ";
      index += 1;
      continue;
    }
    if (char === "'") state = "single";
    else if (char === '"') state = "double";
    else if (char === "`") state = "template";
    else if (char === "/" && /[=(,:;[!&|?{+\-*%^~]|^$/.test(lastMeaningful)) state = "regex";
    if (!/\s/.test(char)) lastMeaningful = char;
    out += char;
  }
  return out;
}

const listJs = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => name.endsWith(".js")).map((name) => path.join(dir, name))
    : [];

if (!fs.existsSync(BARREL)) {
  console.log("registry.js 不存在：这个项目可能还没拆分，跳过检查。");
  process.exit(0);
}

const barrelSource = read(BARREL);
const barrelCode = codeOnly(barrelSource);
const splitFiles = [...listJs(SPLIT_DIR), ...listJs(COMPONENTS_DIR)];
if (splitFiles.length === 0) {
  console.log("registry/ 目录为空：跳过检查。");
  process.exit(0);
}

/* -------------------------------------------------- 1. 每个分片都可从 barrel 到达 ---- */

/* `components/*.js` 必须被 barrel 直接 import（注册是 import 副作用）；
   其余分片允许只被同门分片引用，但必须能从 barrel 传递到达，否则就是死代码。 */
const localImportsOf = (file) => {
  const source = codeOnly(read(file));
  const resolved = [];
  for (const match of source.matchAll(/from\s+"(\.[^"?]+)(?:\?v=\d+)?"/g)) {
    resolved.push(path.resolve(path.dirname(file), match[1]));
  }
  for (const match of source.matchAll(/import\s+"(\.[^"?]+)(?:\?v=\d+)?"/g)) {
    resolved.push(path.resolve(path.dirname(file), match[1]));
  }
  return resolved;
};

const reachable = new Set([BARREL]);
const queue = [BARREL];
while (queue.length) {
  const file = queue.pop();
  for (const target of localImportsOf(file)) {
    if (reachable.has(target) || !fs.existsSync(target)) continue;
    reachable.add(target);
    queue.push(target);
  }
}

for (const file of splitFiles) {
  if (!reachable.has(file)) {
    problems.push(`${path.relative(CORE, file)} 无法从 registry.js 到达（注册或实现都不会生效）`);
  }
}
const componentFiles = listJs(COMPONENTS_DIR);
const directBarrelImports = new Set(
  [...barrelCode.matchAll(/import\s+"([^"]+)"/g)].map((match) => match[1].split("?")[0])
);
for (const file of componentFiles) {
  const relative = `./${path.relative(CORE, file).split(path.sep).join("/")}`;
  if (!directBarrelImports.has(relative)) {
    problems.push(`components/${path.basename(file)} 没有被 registry.js 直接 import（注册副作用不会执行）`);
  }
}
notes.push(`分片 ${splitFiles.length} 个（其中 components/${componentFiles.length}），barrel 可达分片 ${[...reachable].filter((file) => splitFiles.includes(file)).length} 个`);

/* -------------------------------------- 2. 注册点所在分片必须被 barrel 引入 ---- */

const registeredTypes = new Map();
for (const file of [...splitFiles, BARREL]) {
  const source = codeOnly(read(file));
  const relative = `./${path.relative(CORE, file).split(path.sep).join("/")}`;
  for (const match of source.matchAll(/registerComponent\(\s*"([^"]+)"/g)) {
    if (!registeredTypes.has(match[1])) registeredTypes.set(match[1], new Set());
    registeredTypes.get(match[1]).add(relative);
  }
}
for (const [type, files] of registeredTypes) {
  if (files.size > 1) {
    problems.push(`控件类型 "${type}" 被注册 ${files.size} 次：${[...files].join(", ")}（后注册者覆盖前者）`);
  }
  const only = [...files][0];
  if (only !== "./registry.js" && !directBarrelImports.has(only)) {
    problems.push(`控件类型 "${type}" 的注册在 ${only}，而该分片没被 registry.js 引入`);
  }
}
notes.push(`注册的控件类型 ${registeredTypes.size} 个`);

/* --------------------------------------------- 3. componentsByType 只能有一份 ---- */

const definitions = [];
for (const file of [...splitFiles, BARREL]) {
  const source = codeOnly(read(file));
  for (const match of source.matchAll(/componentsByType\s*=\s*new\s+Map\s*\(/g)) {
    definitions.push(`${path.relative(CORE, file)}（第 ${source.slice(0, match.index).split("\n").length} 行）`);
  }
}
if (definitions.length !== 1) {
  problems.push(
    definitions.length === 0
      ? "找不到 componentsByType 的创建（应有一份）"
      : `componentsByType 被创建了 ${definitions.length} 份：${definitions.join("、")}`
  );
} else {
  notes.push(`componentsByType 唯一定义在 ${definitions[0]}`);
}

/* ----------------------------------------------- 4. 分片 import 的版本戳一致 ---- */

const stampOf = (source, file) => {
  const stamps = new Set([...source.matchAll(/\?v=(\d{14})/g)].map((match) => match[1]));
  if (stamps.size > 1) problems.push(`${path.relative(CORE, file)} 里出现多个版本戳：${[...stamps].join(", ")}`);
  return [...stamps][0] || null;
};
const barrelStamp = stampOf(barrelCode, BARREL);
for (const file of splitFiles) {
  const source = codeOnly(read(file));
  const stamp = stampOf(source, file);
  if (stamp && barrelStamp && stamp !== barrelStamp) {
    problems.push(
      `${path.relative(CORE, file)} 的版本戳 ${stamp} 与 registry.js 的 ${barrelStamp} 不一致 —— 会各自加载一份模块`
    );
  }
  for (const match of source.matchAll(/from\s+"(\.\.?\/[^"?]+)"/g)) {
    problems.push(`${path.relative(CORE, file)} 的 import 没有版本戳：${match[1]}`);
  }
}

/* ------------------------------------ 5. 分片不许再被 barrel 之外的文件引用 ---- */

/**
 * 允许从 barrel 之外直接 import 内部分片的例外，必须写明理由。
 *
 * `cover-runtime.js` 取 `coverComponentIsDream`：`registry/cover-state.js` 是只依赖
 * utils 与 cover-direction 的叶子分片，从它取不会与注册表 barrel 成环；反过来改从
 * registry.js 取，会把全部 28 个分片（含相机、折线图等）都拉进窗帘运行时的依赖里。
 */
const INTERNAL_IMPORT_EXCEPTIONS = new Map([
  ["frontend/static/renderer/controls/cover-runtime.js", ["registry/cover-state.js"]]
]);

const otherConsumers = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(js|mjs|html)$/.test(entry.name)) continue;
    if (full === BARREL) continue;
    const source = codeOnly(read(full));
    const relative = path.relative(ROOT, full).split(path.sep).join("/");
    const allowed = INTERNAL_IMPORT_EXCEPTIONS.get(relative) || [];
    for (const match of source.matchAll(/[\w./-]*core\/registry\/(components\/)?([a-z0-9-]+)\.js/g)) {
      const target = `registry/${match[1] || ""}${match[2]}.js`;
      if (allowed.includes(target)) continue;
      otherConsumers.push(`${relative} → ${target}`);
    }
  }
};
walk(path.join(ROOT, "frontend"));
for (const file of otherConsumers) {
  problems.push(`${file}：直接引用了 registry/ 内部分片，请改从 registry.js 取或加入允许清单（附理由）`);
}

/* ------------------------------------- 6. 控件注册只许写在 components/*.js ---- */

for (const file of [...listJs(SPLIT_DIR), BARREL]) {
  const source = codeOnly(read(file));
  for (const match of source.matchAll(/registerComponent\(\s*"/g)) {
    problems.push(
      `${path.relative(CORE, file)} 里出现 registerComponent 调用（第 ${source.slice(0, match.index).split("\n").length} 行）：注册请写进 registry/components/<类型>.js`
    );
  }
}

/* ------------------------------------------------------------------- 报告 ---- */

if (asJson) {
  console.log(JSON.stringify({ problems, notes, registeredTypes: [...registeredTypes.keys()] }, null, 2));
} else {
  for (const note of notes) console.log(`  ${note}`);
  if (problems.length) {
    console.log();
    for (const problem of problems) console.log(`FAIL: ${problem}`);
    console.log(`\n${problems.length} 项问题`);
  } else {
    console.log("\nOK: 分片全部被引入、注册点唯一、componentsByType 只有一份、版本戳一致。");
  }
}
process.exit(problems.length ? 1 : 0);
