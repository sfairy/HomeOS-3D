/**
 * 平面符号与 3D 占地轮廓的**形状对账**：圆形占地的物件不能在户型图上画成方角矩形。
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isRoundFootprint, roundnessOfGlb } from "./lib/glb-footprint.mjs";
import { MODEL_DIR_BY_SPEC, MODEL_FILE_KEY_BY_SPEC, MODEL_SPECS } from "./models/model-specs.mjs";

// 仓库路径来自 paths.mjs（唯一事实来源）。
import {
  MODELS_DIR,
  STUDIO_DIR,
} from "./paths.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODELS_ROOT = path.join(MODELS_DIR);
const STUDIO_APP_JS = path.join(STUDIO_DIR, "studio-app.js");
const STUDIO_TYPES_JS = path.join(STUDIO_DIR, "studio-item-types.js");

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
