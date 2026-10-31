#!/usr/bin/env node
/**
 * UI/UX 视觉回归门禁：对稳定的公开认证页做固定视口截图，
 * 与基线逐像素比较，避免布局/样式改动造成静默回归。
 *
 * 用法：
 *   node ops/checks/frontend/audit-uiux-visual.mjs            # 比较基线
 *   node ops/checks/frontend/audit-uiux-visual.mjs --update   # 重建基线
 *
 * 环境变量：UIUX_VISUAL_BASE_HOMEOS / UIUX_VISUAL_BASE_STORE / UIUX_VISUAL_EDGE
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const { PNG } = require("pngjs");

const root = resolve(import.meta.dirname, "../../..");
const evidence = join(root, "docs/analysis/2026-10-31-dual-project-uiux/evidence");
const baselineDir = join(evidence, "visual-baseline");
const currentDir = join(evidence, "after/visual-current");
const reportPath = join(evidence, "after/visual-diff.json");
const update = process.argv.includes("--update");

const EDGE = process.env.UIUX_VISUAL_EDGE
  || "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const HOMEOS = process.env.UIUX_VISUAL_BASE_HOMEOS || "http://127.0.0.1:8801";
const STORE = process.env.UIUX_VISUAL_BASE_STORE || "http://127.0.0.1:8802";

const TARGETS = [
  { app: "homeos", name: "homeos-login", url: HOMEOS + "/login", width: 1440, height: 900 },
  { app: "homeos", name: "homeos-login-mobile", url: HOMEOS + "/login", width: 390, height: 844 },
  { app: "homeos", name: "homeos-reset-password", url: HOMEOS + "/reset-password", width: 1440, height: 900 },
  { app: "store", name: "store-login", url: STORE + "/user/authentication/login", width: 1440, height: 900 },
  { app: "store", name: "store-login-mobile", url: STORE + "/user/authentication/login", width: 390, height: 844 },
  { app: "store", name: "store-register", url: STORE + "/user/authentication/register", width: 1440, height: 900 },
];

const PIXEL_THRESHOLD = 16;
const RATIO_LIMIT = 0.002;

function compare(baselineFile, currentFile) {
  const baseline = PNG.sync.read(readFileSync(baselineFile));
  const current = PNG.sync.read(readFileSync(currentFile));
  if (baseline.width !== current.width || baseline.height !== current.height) {
    return { different: true, reason: "尺寸变化", ratio: 1, diffPixels: baseline.width * baseline.height };
  }
  const diff = new PNG({ width: current.width, height: current.height });
  let diffPixels = 0;
  for (let i = 0; i < current.data.length; i += 4) {
    const delta = Math.max(
      Math.abs(current.data[i] - baseline.data[i]),
      Math.abs(current.data[i + 1] - baseline.data[i + 1]),
      Math.abs(current.data[i + 2] - baseline.data[i + 2]),
    );
    if (delta > PIXEL_THRESHOLD) {
      diffPixels += 1;
      diff.data[i] = 255;
      diff.data[i + 1] = 70;
      diff.data[i + 2] = 70;
      diff.data[i + 3] = 255;
    } else {
      diff.data[i] = baseline.data[i];
      diff.data[i + 1] = baseline.data[i + 1];
      diff.data[i + 2] = baseline.data[i + 2];
      diff.data[i + 3] = 255;
    }
  }
  const ratio = diffPixels / (current.width * current.height);
  return { different: ratio > RATIO_LIMIT, reason: ratio > RATIO_LIMIT ? "像素差异超阈值" : "通过", ratio, diffPixels, diff };
}

mkdirSync(currentDir, { recursive: true });
if (update) mkdirSync(baselineDir, { recursive: true });

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const results = [];
let failed = 0;
try {
  for (const target of TARGETS) {
    const context = await browser.newContext({
      viewport: { width: target.width, height: target.height },
      locale: "zh-CN",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.evaluate(() => document.fonts?.ready?.catch?.(() => {}));
    await page.waitForTimeout(500);
    const currentFile = join(currentDir, target.name + ".png");
    await page.screenshot({ path: currentFile, animations: "disabled", caret: "hide" });
    await context.close();

    const baselineFile = join(baselineDir, target.name + ".png");
    let result;
    if (update || !existsSync(baselineFile)) {
      if (!update && !existsSync(baselineFile)) {
        result = { status: "missing-baseline" };
      } else {
        mkdirSync(dirname(baselineFile), { recursive: true });
        writeFileSync(baselineFile, readFileSync(currentFile));
        result = { status: "baseline-written", ratio: 0 };
      }
    } else {
      const comparison = compare(baselineFile, currentFile);
      if (comparison.different) {
        failed += 1;
        writeFileSync(join(currentDir, target.name + ".diff.png"), PNG.sync.write(comparison.diff));
      }
      result = {
        status: comparison.different ? "different" : "pass",
        ratio: Number(comparison.ratio.toFixed(5)),
        diffPixels: comparison.diffPixels,
      };
    }
    results.push({ ...target, ...result, pageErrors });
    console.log(`[${result.status}] ${target.name} ratio=${result.ratio ?? "-"} errors=${pageErrors.length}`);
  }
} finally {
  await browser.close();
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), update, failed, targets: results }, null, 2));
if (failed > 0) {
  console.error(`${failed} 个视觉回归超出阈值；确认改动符合预期后运行 --update 重建基线。`);
  process.exit(1);
}
console.log(`视觉检查完成：${results.length} 个目标，证据 ${reportPath}`);
