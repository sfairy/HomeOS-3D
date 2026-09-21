/**
 * Studio asset palette guard.
 *
 * The 67 palette cards used to be hand-written in `3d-studio.html`. They are now
 * a data table in `studio-asset-palette.js` rendered into `#asset-grid`. Three
 * things can silently break that move, and none of them shows up in a build:
 *
 * 1. **Render order.** `studio-app.js` runs
 *    `document.querySelectorAll("[data-item-type]")` once and binds the drag/click
 *    handlers from that snapshot. If the palette is rendered after that line, the
 *    cards are visible but dead.
 * 2. **Markup drift.** `studio.css` styles `.asset-card` and relies on the
 *    `i`/`span`/`small` sibling order. The template must keep emitting exactly
 *    that shape, plus the `data-item-type` / `data-asset-subcategory` attributes
 *    the app keys off.
 * 3. **Unreachable cards.** `syncAssetTabVisibility()` decides which cards each of
 *    the three tabs shows from `APPLIANCE_ITEM_TYPES` / `LIGHT_ITEM_TYPES`. A group
 *    whose `category` disagrees with its cards leaves them visible under *no* tab.
 *
 * Read-only by default; `--strict` turns findings into a non-zero exit.
 *
 *   node tools/check_studio_palette.mjs [--strict]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = path.join(ROOT, "frontend/3d-studio.html");
const APP = path.join(ROOT, "frontend/static/3d-studio/studio/studio-app.js");
const PALETTE = path.join(ROOT, "frontend/static/3d-studio/studio/studio-asset-palette.js");

const strict = process.argv.includes("--strict");
const problems = [];
const notes = [];

const html = fs.readFileSync(HTML, "utf8");
const appSource = fs.readFileSync(APP, "utf8");
const paletteSource = fs.readFileSync(PALETTE, "utf8");

/* ------------------------------------------------------- 1. render ordering */

const cacheIndex = appSource.indexOf('document.querySelectorAll("[data-item-type]")');
const callIndex = appSource.indexOf('renderStudioAssetPalette(selectElement("#asset-grid"))');

if (cacheIndex === -1) {
  problems.push("studio-app.js: 找不到 [data-item-type] 的 DOM 缓存行，渲染顺序无法校验");
} else if (callIndex === -1) {
  problems.push('studio-app.js: 没有调用 renderStudioAssetPalette(selectElement("#asset-grid"))');
} else if (callIndex > cacheIndex) {
  problems.push("studio-app.js: 素材卡渲染晚于 [data-item-type] 缓存 —— 卡片会「看得见、点不动」");
} else {
  notes.push(`渲染调用早于 [data-item-type] 缓存（偏移 ${callIndex} < ${cacheIndex}）`);
}

/* --------------------------------------------------------- 2. grid container */

const gridOpen = /<div id="asset-grid"[^>]*>/.exec(html);
if (!gridOpen) {
  problems.push("3d-studio.html: 找不到 #asset-grid 容器");
} else {
  if (!/class="asset-grid"/.test(gridOpen[0])) {
    problems.push('3d-studio.html: #asset-grid 丢了 class="asset-grid"（studio.css 的网格布局靠它）');
  }
  if (!/aria-label="[^"]+"/.test(gridOpen[0])) {
    problems.push("3d-studio.html: #asset-grid 丢了 aria-label（素材库对读屏用户只剩类型名）");
  }
  const after = html.slice(gridOpen.index + gridOpen[0].length);
  const closeAt = after.indexOf("</div>");
  if (after.slice(0, closeAt).trim().length > 0) {
    problems.push("3d-studio.html: #asset-grid 容器里还有手写内容，应与数据表二选一");
  } else {
    notes.push("#asset-grid 是空容器，内容由数据表填充");
  }
}

/* ------------------------------------------------------------ 3. data table */

/** `STUDIO_ASSET_PALETTE` 的分组结构：每组的 category / label / note / items。 */
function parseGroups(source) {
  const groupRe = /category: "([^"]+)",\n\s*label: "([^"]+)",\n\s*note: "([^"]*)",\n\s*items: \[([\s\S]*?)\n\s*\]\n\s*\}/g;
  const itemRe = /\{ type: "([^"]*)", sub: "([^"]*)", icon: "([^"]*)", name: "([^"]*)", size: "([^"]*)" \}/g;
  return [...source.matchAll(groupRe)].map((match) => ({
    category: match[1],
    label: match[2],
    note: match[3],
    items: [...match[4].matchAll(itemRe)].map((item) => ({
      type: item[1],
      sub: item[2],
      icon: item[3],
      name: item[4],
      size: item[5]
    }))
  }));
}

const groups = parseGroups(paletteSource);
const records = groups.flatMap((group) => group.items);

if (groups.length === 0) {
  problems.push("studio-asset-palette.js: 解析不出任何分组（category/label/note/items 结构变了？）");
} else if (records.length === 0) {
  problems.push("studio-asset-palette.js: 分组里一张卡片都没有");
} else {
  notes.push(`数据表：${groups.length} 组 / ${records.length} 张卡片`);
}

/* 字段解析数和实际出现次数必须对齐，否则说明有卡片没被解析出来（少渲染一张不会报错）。 */
const declaredCards = (paletteSource.match(/\{ type: "/g) || []).length;
if (declaredCards !== records.length) {
  problems.push(
    `studio-asset-palette.js: 文件里有 ${declaredCards} 个 type 条目，只解析出 ${records.length} 个 —— 有卡片字段格式不一致`
  );
}

const emptyField = records.find((r) => [r.type, r.sub, r.icon, r.name, r.size].some((v) => !v.trim()));
if (emptyField) problems.push(`studio-asset-palette.js: 有空字段的卡片 ${JSON.stringify(emptyField)}`);

const byType = new Map();
for (const record of records) byType.set(record.type, (byType.get(record.type) || 0) + 1);
const duplicates = [...byType.entries()].filter(([, count]) => count > 1).map(([type]) => type);
if (duplicates.length > 0) {
  problems.push(`studio-asset-palette.js: data-item-type 重复 ${duplicates.join(", ")}（查表键必须唯一）`);
}

const emptyGroup = groups.filter((group) => group.items.length === 0);
if (emptyGroup.length > 0) {
  problems.push(
    `studio-asset-palette.js: 空分组 ${emptyGroup.map((g) => g.label).join(", ")} —— 会渲染出只有标题没有卡片的组`
  );
}
notes.push(`分组：${groups.map((g) => `${g.label}(${g.items.length})`).join(" / ")}`);

/* Headings are siblings of the cards and carry the tab filter key. */
const emittedHeadings = (paletteSource.match(/asset-group-heading/g) || []).length;
if (emittedHeadings !== 1) {
  problems.push(
    `studio-asset-palette.js: asset-group-heading 出现 ${emittedHeadings} 次，应当只有 1 处（在模板函数里）`
  );
}

const missingMarkup = [
  'class="asset-card"',
  'type="button"',
  'draggable="true"',
  "data-item-type=",
  "data-asset-subcategory=",
  "data-asset-heading-category=",
  "<i>",
  "<span>",
  "<small>"
].filter((token) => !paletteSource.includes(token));
if (missingMarkup.length > 0) {
  problems.push(`studio-asset-palette.js: 模板丢了这些标记 ${missingMarkup.join(", ")}`);
}

/* ------------------------------------------- 4. every card is reachable by a tab */

/* 页签归属：studio-app.js 的 syncAssetTabVisibility() 依据这两个集合决定
   「家居 / 家电 / 灯光」三选一显示。分组 category 与卡片实际类型不一致时，
   卡片会落到「三个页签都不显示」的缝里 —— 不报错，只是永远找不到。 */
function parseTypeSet(name) {
  const match = new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`).exec(appSource);
  if (!match) return null;
  return new Set([...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

const applianceTypes = parseTypeSet("APPLIANCE_ITEM_TYPES");
const lightTypes = parseTypeSet("LIGHT_ITEM_TYPES");
if (!applianceTypes || !lightTypes) {
  problems.push("studio-app.js: 解析不出 APPLIANCE_ITEM_TYPES / LIGHT_ITEM_TYPES，卡片归属无法校验");
} else {
  const tabCategories = new Set(
    [...html.matchAll(/data-asset-category="([^"]+)"/g)].map((match) => match[1])
  );
  const unknownCategory = groups.filter((group) => !tabCategories.has(group.category));
  if (unknownCategory.length > 0) {
    problems.push(
      `studio-asset-palette.js: 分组 category ${unknownCategory
        .map((g) => `${g.category}(${g.label})`)
        .join(", ")} 在 3d-studio.html 里没有对应的 data-asset-category 页签，标题永远不显示`
    );
  }

  const applianceGroupTypes = groups
    .filter((group) => group.category === "appliance")
    .flatMap((group) => group.items.map((item) => item.type));
  const strayHome = applianceGroupTypes.filter((type) => !applianceTypes.has(type));
  if (strayHome.length > 0) {
    problems.push(
      `appliance 分组里的 ${strayHome.join(", ")} 不在 APPLIANCE_ITEM_TYPES 中，切到家电页签看不见`
    );
  }

  const homeGroupTypes = groups
    .filter((group) => group.category === "home")
    .flatMap((group) => group.items.map((item) => item.type));
  const strayAppliance = homeGroupTypes.filter((type) => applianceTypes.has(type));
  if (strayAppliance.length > 0) {
    problems.push(
      `${strayAppliance.join(", ")} 挂在 home 分组里，但属于 APPLIANCE_ITEM_TYPES，切到家居页签会被隐藏`
    );
  }

  const lightInGrid = [...byType.keys()].filter((type) => lightTypes.has(type));
  if (lightInGrid.length > 0) {
    problems.push(
      `${lightInGrid.join(", ")} 是灯具（由 #light-asset-row 渲染），不该出现在素材网格的数据表里`
    );
  }

  const applianceCount = records.filter((record) => applianceTypes.has(record.type)).length;
  notes.push(`页签归属：家电 ${applianceCount} 张 / 家居 ${records.length - applianceCount} 张`);
}

/* -------------------------------------------------------------------- report */

for (const note of notes) console.log(`  ${note}`);
if (problems.length === 0) {
  console.log("\nOK: 素材卡渲染顺序、容器、数据表结构与页签归属都符合约定。");
  process.exit(0);
}
console.log();
for (const problem of problems) console.log(`FAIL: ${problem}`);
console.log(`\n${problems.length} 项失败`);
process.exit(strict ? 1 : 0);
