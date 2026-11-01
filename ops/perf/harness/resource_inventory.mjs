#!/usr/bin/env node
/**
 * 一次性资源清单探针（2026-11-01）。只读：按 encodedBodySize 排序列出首屏下载的资源。
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const PERF_ROOT = process.env.HOMEOS_PERF_ROOT || "/tmp/homeos-perf";
const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
};
const label = argValue("--label") || "before-1101";
const only = argValue("--route") || "home";
const env = JSON.parse(readFileSync(join(PERF_ROOT, "env", label, "env.json"), "utf8"));
const homeosBase = `http://127.0.0.1:${env.homeos.port}`;
const storeBase = `http://127.0.0.1:${env.store.port}`;

const targets = {
  home: { url: homeosBase + "/", auth: true, settle: 7000 },
  display: { url: homeosBase + "/display/" + encodeURIComponent(env.homeos.projectId), auth: true, settle: 9000 },
  login: { url: homeosBase + "/login", auth: false, settle: 2000 },
  store: { url: storeBase + "/", auth: false, settle: 3000 },
};

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--enable-precise-memory-info"],
});
const out = {};
for (const [name, target] of Object.entries(targets)) {
  if (only !== "all" && only !== name) continue;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  if (target.auth) {
    await context.addCookies([{ name: "auth_token", value: env.homeos.token, url: homeosBase }]);
  }
  const page = await context.newPage();
  // 记录 4xx/5xx：冷开时的 404（实体已被 HA 删除）与 409（HA 未连接）都只在这个
  // 层面看得见 —— ResourceTiming 里它们也是 200 字节级的小请求，从体积上发现不了。
  const failures = [];
  page.on("response", (response) => {
    if (response.status() < 400) return;
    failures.push({
      status: response.status(),
      method: response.request().method(),
      url: response.url().replace(target.url.replace(/\/$/, ""), "").slice(0, 160),
    });
  });
  await page.goto(target.url, { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(target.settle);
  const rows = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => ({
        name: entry.name.replace(location.origin, ""),
        initiator: entry.initiatorType,
        encoded: entry.encodedBodySize || 0,
        transfer: entry.transferSize || 0,
        duration: Number((entry.duration || 0).toFixed(1)),
        blocking: entry.renderBlockingStatus || "",
      }))
      .sort((a, b) => b.encoded - a.encoded),
  );
  const byGroup = {};
  for (const row of rows) {
    const key = row.name.includes("/static/assets/")
      ? "assets"
      : row.name.includes("chunks/")
        ? "stage-chunks"
        : row.name.includes("/static/")
          ? "static"
          : row.initiator;
    byGroup[key] = (byGroup[key] || 0) + row.encoded;
  }
  out[name] = {
    count: rows.length,
    totalEncoded: rows.reduce((sum, row) => sum + row.encoded, 0),
    totalTransfer: rows.reduce((sum, row) => sum + row.transfer, 0),
    byGroup,
    failures,
    top: rows.slice(0, 25),
  };
  await context.close();
}
await browser.close();
const dir = join(PERF_ROOT, "results", label);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `resources-${only}.json`), JSON.stringify(out, null, 1));
for (const [name, data] of Object.entries(out)) {
  console.log(`=== ${name}: ${data.count} resources, encoded ${data.totalEncoded}B, transfer ${data.totalTransfer}B`);
  if (data.failures.length) {
    console.log(`  ${data.failures.length} 个 4xx/5xx：`);
    for (const failure of data.failures.slice(0, 12)) {
      console.log(`    ${failure.status} ${failure.method} ${failure.url}`);
    }
  }
  console.log(" groups", JSON.stringify(data.byGroup));
  for (const row of data.top.slice(0, 14)) {
    console.log(`  ${String(row.encoded).padStart(8)}B  ${String(row.transfer).padStart(8)}B  ${row.initiator.padEnd(12)}  ${row.name.slice(0, 90)}`);
  }
}
