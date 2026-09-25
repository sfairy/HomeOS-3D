/**
 * 平面符号与 3D 占地轮廓的**形状对账**：圆形占地的物件不能在户型图上画成方角矩形。
 *
 *   node tools/audit_plan_symbols.mjs              # 全量报告
 *   node tools/audit_plan_symbols.mjs --only=round # 只列「实测是圆」的那一批
 *   node tools/audit_plan_symbols.mjs --regress    # 与名单对账：缺口 / 多余，非零退出
 *
 * 为什么需要它：平面图符号是手绘的（`studio-app.js` 的 `drawPlanItem`），3D 早已换成流水线规格，
 * 两者不会互相牵引。0.9 × 0.9 的圆茶几画成方角矩形、圆桶加湿器画成方块 —— 画面上「对不上」，
 * 但浏览器零报错、单看代码也看不出来，只能逐件用眼睛过。本工具把「该画圆」变成可测的量：
 *
 *   格数比 ≈ π/4 且各向半径等长 → 圆（判据见 tools/lib/glb-footprint.mjs 的文件头）
 *
 * 名单在 `studio-item-types.js` 的 `ROUND_FOOTPRINT_ITEM_TYPES`（运行侧照它画圆）。
 * 本工具与那条不变量都用**同一份**判据，避免两处口径漂移。
 *
 * **判据的边界（判不出真假就不判，宁可漏报）**：
 *   1. 只判「纯圆」。**圆机身 + 方底座 / 坞站**这类混合轮廓（扫地机的自集尘基站、破壁机的方底座、
 *      咖啡机的方机身）会被判成「方」—— 它们的外轮廓确实以方为主，兜底矩形是对的。
 *      真出现「圆比方更主要」的混合件时，得单独给它一支复合符号，本判据测不出来。
 *   2. 派生模型键的类型测不到（`tv` → `tv_standard`、`curtain` → `curtain_*` 三件、
 *      `rounddiningtableturntable` → `rounddiningtable_turntable`），报告里会单列出来，
 *      免得看起来「全都测过了」。其中转盘圆桌另有专门的一支画圆。
 *   3. 阈值是**区间**不是点：`0.7 < 格数比 < 0.86` 且 `径向变异 < 0.05`（阈值来历见
 *      tools/lib/glb-footprint.mjs 的文件头）。贴着任一侧取，规格微调就会让判据反复跳。
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isRoundFootprint, roundnessOfGlb } from "./lib/glb-footprint.mjs";
import { MODEL_DIR_BY_SPEC, MODEL_FILE_KEY_BY_SPEC, MODEL_SPECS } from "./models/model-specs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODELS_ROOT = path.join(ROOT, "frontend", "static", "3d-studio", "models");
const STUDIO_APP_JS = path.join(ROOT, "frontend", "static", "3d-studio", "studio", "studio-app.js");
const STUDIO_TYPES_JS = path.join(ROOT, "frontend", "static", "3d-studio", "studio", "studio-item-types.js");

const args = new Set(process.argv.slice(2));
const ONLY_ROUND = args.has("--only=round");
const REGRESS = args.has("--regress");

/** 从 studio-item-types.js 取名单里的类型（唯一来源，不在这里抄一份）。 */
export function readRoundFootprintTypeNames() {
  const source = fs.readFileSync(STUDIO_TYPES_JS, "utf8");
  const start = source.indexOf("export const ROUND_FOOTPRINT_ITEM_TYPES = new Set([");
  if (start < 0) return null;
  const end = source.indexOf("]);", start);
  if (end < 0) return null;
  return new Set(
    [...source.slice(start, end).matchAll(/"([a-z_0-9]+)"/g)].map(match => match[1])
  );
}

/** 只测「会被平面图绘制」的类型：模型清单里出现、且在户型图上是要摆的物件。 */
export function measurableItemTypes() {
  const source = fs.readFileSync(STUDIO_TYPES_JS, "utf8");
  const names = new Set();
  for (const listName of ["EXTERNAL_MODEL_ITEM_TYPES", "APPLIANCE_MODEL_ITEM_TYPES"]) {
    const start = source.indexOf(`export const ${listName} = new Set([`);
    const end = source.indexOf("]);", start);
    for (const match of source.slice(start, end).matchAll(/"([a-z_0-9]+)"/g)) {
      names.add(match[1]);
    }
  }
  return [...names].filter(type => MODEL_SPECS[type]).sort();
}

/**
 * 清单里出现、却没有同名规格的类型。
 *
 * 它们是**派生模型键**那一类：`tv` 的 GLB 是 `tv_standard`、`curtain` 是 `curtain_*` 三件、
 * `rounddiningtableturntable` 是 `rounddiningtable_turntable`。本工具测不到它们，
 * 所以明确列出来 —— 免得报告看起来「全都测过了」。这几件的圆/方由各自的实际模型决定
 * （`rounddiningtableturntable` 走 ROUND_TABLE_TURNTABLE_ITEM_TYPES，另有专门的一支画圆）。
 */
export function unmeasurableItemTypes() {
  const source = fs.readFileSync(STUDIO_TYPES_JS, "utf8");
  const names = new Set();
  for (const listName of ["EXTERNAL_MODEL_ITEM_TYPES", "APPLIANCE_MODEL_ITEM_TYPES"]) {
    const start = source.indexOf(`export const ${listName} = new Set([`);
    const end = source.indexOf("]);", start);
    for (const match of source.slice(start, end).matchAll(/"([a-z_0-9]+)"/g)) {
      names.add(match[1]);
    }
  }
  return [...names].filter(type => !MODEL_SPECS[type]).sort();
}

function glbPathOf(type) {
  const dir = MODEL_DIR_BY_SPEC[type];
  const fileKey = MODEL_FILE_KEY_BY_SPEC[type] || type;
  if (!dir) return null;
  return path.join(MODELS_ROOT, dir, `${fileKey}.glb`);
}

/** 逐件实测。返回 `[{ type, stats, isRound }]`（读不到 GLB 的条目 stats 为 null）。 */
export function measureFootprints({ onlyTypes = null } = {}) {
  const types = onlyTypes || measurableItemTypes();
  const results = [];
  for (const type of types) {
    const file = glbPathOf(type);
    let stats = null;
    if (file && fs.existsSync(file)) {
      try {
        stats = roundnessOfGlb(file);
      } catch {
        stats = null;
      }
    }
    results.push({ type, file, stats, isRound: isRoundFootprint(stats) });
  }
  return results;
}

function describe(stats) {
  if (!stats) return "读不到 GLB";
  return `格数比 ${stats.areaRatio.toFixed(3)} 径向变异 ${stats.radialCv.toFixed(3)}`;
}

function main() {
  const declared = readRoundFootprintTypeNames();
  if (!declared) {
    console.error("[error] 读不到 studio-item-types.js 的 ROUND_FOOTPRINT_ITEM_TYPES");
    process.exit(1);
  }
  const results = measureFootprints();
  const measuredRound = results.filter(entry => entry.isRound);
  const measureFailed = results.filter(entry => !entry.stats);

  if (!REGRESS) {
    console.log(`测了 ${results.length} 件（流水线完整版 GLB）`);
    const unmeasurable = unmeasurableItemTypes();
    if (unmeasurable.length) {
      // 明确列出来，免得报告看起来「全都测过了」—— 这几件的 GLB 键是派生的（tv → tv_standard）。
      console.log(
        `\n测不到（清单里有、但没有同名规格，GLB 键是派生的）${unmeasurable.length} 件：` +
          `\n  ${unmeasurable.join(", ")}`
      );
    }
    if (measureFailed.length) {
      console.log(`\n读不出占地的 ${measureFailed.length} 件：`);
      for (const entry of measureFailed) {
        console.log(`  ${entry.type.padEnd(24)} ${entry.file ? "解析失败" : "没有登记子目录"}`);
      }
    }
    const roundToShow = ONLY_ROUND ? measuredRound : results;
    console.log(`\n${ONLY_ROUND ? "实测是圆" : "全部"}（${roundToShow.length}）：`);
    for (const entry of roundToShow) {
      const mark = entry.isRound ? (declared.has(entry.type) ? "圆·已在名单" : "圆·缺名单") : "方";
      console.log(`  [${mark.padEnd(9)}] ${entry.type.padEnd(22)} ${describe(entry.stats)}`);
    }
  }

  const missing = measuredRound.filter(entry => !declared.has(entry.type)).map(entry => entry.type);
  const stale = [...declared].filter(type => !measuredRound.some(entry => entry.type === type));

  if (!missing.length && !stale.length) {
    console.log("\n[ok] 名单与实测一致：圆形占地的类型都按圆画。");
    return;
  }
  if (missing.length) {
    console.log(`\n[gap] 实测是圆、名单里没有（会被画成方角矩形）：\n  ${missing.join(", ")}`);
  }
  if (stale.length) {
    console.log(`\n[gap] 名单里有、实测不是圆（名单该删）：\n  ${stale.join(", ")}`);
  }
  if (REGRESS) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
