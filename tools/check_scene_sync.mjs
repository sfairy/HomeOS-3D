/**
 * Fail when a distributed copy of the scene design system no longer matches its
 * canonical source in design/scene/, or when the store's own token sheet has
 * drifted away from the scene palette.
 *
 * Usage:
 *   node tools/check_scene_sync.mjs
 *
 * Exits 1 and lists the drifting files/tokens; the fixes are always
 * `node tools/sync_scene_assets.mjs` and editing the sheet that is wrong —
 * never hand-editing a copy.
 *
 * Why this exists: the app and the store are separate Docker build contexts, so
 * each one carries its own copy of the stylesheets (see
 * tools/sync_scene_assets.mjs for the full reasoning). Copies without a guard
 * rot.
 *
 * The second check exists because the store is *not* a copy: it has its own
 * `store/static/theme.css` with its own token names (`--hb-*`), and about a
 * third of that palette is supposed to be the same colours as the scene's
 * (`design/scene/page.css`, `--hos-*`). Nothing enforced that before, which is
 * exactly how the storefront kept a whole amber-era palette while the entry
 * pages went cyan. Comparing the shared subset by value is cheap and catches
 * the actual failure mode: someone changes the brand cyan in one file.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { planFiles, rel, sync } from "./sync_scene_assets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCENE_TOKENS = path.join(ROOT, "design", "scene", "page.css");
const STORE_TOKENS = path.join(ROOT, "store", "static", "theme.css");

/**
 * 两侧必须逐字相等的令牌（去掉 `--hos-` / `--hb-` 前缀后的同名项）。
 * 只列「同一枚颜色」的部分：色面层级、字号、字体、圆角、阴影等各自独立，
 * 商店侧多出来的 `-soft` / `-line` / `-text` 派生色也是商店自己的表达。
 */
const MIRRORED_TOKENS = [
  "sky-deep",
  "sky-low",
  "sky-mid",
  "sky-high",
  "sky-haze",
  "sky-deep-rgb",
  "sky-low-rgb",
  "sky-mid-rgb",
  "sky-high-rgb",
  "sky-haze-rgb",
  "accent-rgb",
  "accent",
  "accent-bright",
  "accent-deep",
  "lumen-rgb",
  "lumen",
  "lumen-bright",
  "lumen-deep",
  "aura-rgb",
  "aura",
  "aura-bright",
  "aura-deep",
  "eco-rgb",
  "eco",
  "eco-bright",
  "eco-deep",
  "heat-rgb",
  "heat",
  "cool-rgb",
  "cool",
  "alert-rgb",
  "alert",
  "alert-bright",
  "sensor-rgb",
  "sensor",
];

/** 把 `:root { … }` 里的自定义属性读成 map；只取第一层，够用且不依赖 CSS 解析器。 */
function readRootTokens(file) {
  const css = fs.readFileSync(file, "utf8");
  const tokens = new Map();
  for (const m of css.matchAll(/(^|\n):root\s*\{([\s\S]*?)\n\}/g)) {
    // 先剥注释再按 `;` 切：块内注释本身不含分号，不先剥掉就会和它后面那条声明粘成
    // 一个「声明」，取名时 split 到的冒号跑到注释里，于是那条声明整条读不到。
    const body = m[2].replace(/\/\*[\s\S]*?\*\//g, "");
    for (const decl of body.split(";")) {
      const at = decl.indexOf(":");
      if (at === -1) continue;
      const name = decl.slice(0, at).trim();
      if (!name.startsWith("--")) continue;
      tokens.set(name, decl.slice(at + 1).trim());
    }
  }
  return tokens;
}

/** 比较用归一化：小写、去掉 rgb 三元组里的空格差异与注释。 */
function normalize(value) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function checkPaletteMirror() {
  const hos = readRootTokens(SCENE_TOKENS);
  const hb = readRootTokens(STORE_TOKENS);
  const problems = [];

  for (const key of MIRRORED_TOKENS) {
    const left = hos.get(`--hos-${key}`);
    const right = hb.get(`--hb-${key}`);
    if (left === undefined) {
      problems.push(`design/scene/page.css is missing --hos-${key}`);
      continue;
    }
    if (right === undefined) {
      problems.push(`store/static/theme.css is missing --hb-${key}`);
      continue;
    }
    if (normalize(left) !== normalize(right)) {
      problems.push(
        `--hos-${key} = ${normalize(left)}  ≠  --hb-${key} = ${normalize(right)}`,
      );
    }
  }
  return problems;
}

/**
 * 转义集必须两边一致：`frontend/static/utils/html-escape.js`（应用）与
 * `store/static/htmlsafe.js`（商店）是两份实现，因为商店是独立构建上下文
 * （`store/app.py` 只挂 `/store-static` 与 `/fonts`，拿不到 `/static`）。
 *
 * 为什么值得单独钉：转义集不一致的现场表现**不是报错**，而是「同一个值在两个页面里
 * 显示成不同的东西」—— 少转一个 `"` 就可能让属性被提前闭合，页面看着只是「布局怪」。
 * 这条检查只比映射表本身（字符 → 实体），不比包装方式：一个是 IIFE + 全局对象、一个是
 * ESM 具名导出，形态不同是刻意的，转义结果必须逐字节相同。
 */
function checkEscapeMapMirror() {
  const appFile = path.join(ROOT, "frontend", "static", "utils", "html-escape.js");
  const storeFile = path.join(ROOT, "store", "static", "htmlsafe.js");
  const problems = [];

  const readMap = (file) => {
    if (!fs.existsSync(file)) return null;
    const source = fs.readFileSync(file, "utf8");
    // 只扫 `ESCAPE_MAP = { … }` 这一块，不扫全文：模块头里就写着 `&#39;` / `&apos;`
    // 这类说明文字，全文扫会把这些当条目读进来。
    const block = source.match(/(?:ESCAPE_MAP)\s*=\s*\{([\s\S]*?)\}/);
    if (!block) return null;
    const map = new Map();
    // 键与值都可能是单引号或双引号：`'` 这一条的键写成 `"'"`（双引号包单引号），
    // 只认单引号的写法会**静默漏掉这条** —— 而漏掉的那条恰好是最容易写错的一条。
    // 引号内部不会再出现同种引号，所以用反向引用配对即可，不需要转义解析。
    for (const match of block[1].matchAll(/(["'])((?:(?!\1).)*)\1\s*:\s*(["'])((?:(?!\3).)*)\3/g)) {
      map.set(match[2], match[4]);
    }
    return map;
  };

  const appMap = readMap(appFile);
  const storeMap = readMap(storeFile);
  if (!appMap || !appMap.size) {
    problems.push("frontend/static/utils/html-escape.js 里读不到转义映射表（写法变了？）");
    return problems;
  }
  if (!storeMap || !storeMap.size) {
    problems.push("store/static/htmlsafe.js 里读不到转义映射表（写法变了？）");
    return problems;
  }

  const describe = (map) =>
    [...map].map(([raw, entity]) => `${raw}→${entity}`).sort().join(" ");
  const keys = new Set([...appMap.keys(), ...storeMap.keys()]);
  for (const raw of keys) {
    if (appMap.get(raw) !== storeMap.get(raw)) {
      problems.push(
        `转义不一致：'${raw}' 在应用侧是 ${appMap.get(raw) ?? "（未处理）"}、商店侧是 ${storeMap.get(raw) ?? "（未处理）"}`
      );
    }
  }
  if (problems.length) {
    problems.push(`  应用侧映射：${describe(appMap)}`);
    problems.push(`  商店侧映射：${describe(storeMap)}`);
  }
  return problems;
}

const { copied: drifted, unchanged, missingSource } = sync({ dryRun: true });
const paletteProblems = checkPaletteMirror();
const escapeProblems = checkEscapeMapMirror();
let failed = false;
if (missingSource.length) {
  console.error("scene design system is incomplete — canonical file(s) missing:");
  for (const file of missingSource) console.error(`  ${file}`);
  failed = true;
}

if (drifted.length) {
  console.error("scene design system copies are out of sync with design/scene:");
  for (const file of drifted) console.error(`  ${file}`);
  console.error("");
  console.error("These files are generated. Do not edit them by hand.");
  console.error("Edit design/scene/ instead, then run: node tools/sync_scene_assets.mjs");
  failed = true;
}

if (paletteProblems.length) {
  console.error("");
  console.error("store palette has drifted from the scene palette:");
  for (const line of paletteProblems) console.error(`  ${line}`);
  console.error("");
  console.error("These tokens are the same colour in both places on purpose:");
  console.error("the storefront and the entry pages must not disagree about what");
  console.error("HomeOS looks like. Change both files in the same commit.");
  failed = true;
}

if (escapeProblems.length) {
  console.error("");
  console.error("HTML escape maps have drifted apart:");
  for (const line of escapeProblems) console.error(`  ${line}`);
  console.error("");
  console.error("The app and the store ship separate escape implementations (separate");
  console.error("build contexts), so nothing but this check keeps them identical.");
  console.error("Change both files in the same commit.");
  failed = true;
}

if (failed) process.exit(1);

console.log(`scene design system in sync (${unchanged.length} files)`);
console.log(`store palette matches design/scene/page.css (${MIRRORED_TOKENS.length} tokens)`);
console.log("HTML escape map matches store/static/htmlsafe.js");
