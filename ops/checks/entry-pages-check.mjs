#!/usr/bin/env node
/**
 * 入户页「首帧即最终形态」的一次性验证（不是常驻工具）。
 *
 * 用系统 Edge（playwright-core，无需下载浏览器）在手机 / 平板两档视口 + 4x CPU + Slow 3G 下：
 *   1. 从页面出现起累计 CLS（只算非输入引起的 layout-shift）；
 *   2. 记录动效档位 `html[data-hos-motion]`、`data-glass-effect`、`data-styles-ready`；
 *   3. 检查触摸档下 `.hos-panel` 的 backdrop-filter 必须是 none；
 *   4. 检查 `.hos-scene` 是定位层（不参与 dock 的高度竞争）；
 *   5. 报告「面板出现时刻 / 面板高度 / dock 是否溢出」。
 *
 * 判读方式：
 *   · `cls_after`（占位壳揭掉之后的累计位移）应当 < 0.02；
 *   · `panelH` 出现后到稳定不变，说明没有「骨架 → 面板」那一次替换；
 *   · `motion` 手机=frozen / 平板=ambient / 桌面=full；
 *   · `backdrop` 在触摸设备上必须是 none（否则首帧跑了一次实时模糊）。
 *
 * 用法：node ops/checks/entry-pages-check.mjs [--base=http://127.0.0.1:8801] [--store-base=http://127.0.0.1:8802]
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const homeosBase = argValue("base", "http://127.0.0.1:8801");
const storeBase = argValue("store-base", "http://127.0.0.1:8802");

const PAGES = [
  { label: "app-login", url: `${homeosBase}/login`, reveal: "mounted" },
  { label: "app-reset", url: `${homeosBase}/reset-password`, reveal: "mounted" },
  { label: "store-login", url: `${storeBase}/user/authentication/login`, reveal: "shell" },
  { label: "store-register", url: `${storeBase}/user/authentication/register`, reveal: "shell" },
  { label: "store-forget", url: `${storeBase}/user/authentication/forget`, reveal: "shell" },
  { label: "store-setup", url: `${storeBase}/setup`, reveal: "shell" },
  { label: "store-admin", url: `${storeBase}/admin`, reveal: "shell" },
];

/** 手机 412×823（近似 Moto G4），平板 820×1180（iPad Air 竖屏），桌面 1440×900（回归对照）。 */
const VIEWPORTS = [
  { label: "phone", width: 412, height: 823, isMobile: true, hasTouch: true },
  { label: "tablet", width: 820, height: 1180, isMobile: true, hasTouch: true },
  { label: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false },
];

const initScript = `
(() => {
  window.__cls = 0;
  window.__shifts = [];
  window.__resetCls = () => { window.__cls = 0; window.__shifts = []; };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue;
      window.__cls += entry.value;
      window.__shifts.push({ value: Number(entry.value.toFixed(4)), at: Math.round(entry.startTime) });
    }
  }).observe({ type: "layout-shift", buffered: true });
})();
`;

const probe = () => {
  const html = document.documentElement;
  const panel = document.querySelector(".hos-page > .hos-dock > .hos-panel");
  const scene = document.querySelector(".hos-page > .hos-scene");
  const style = panel ? getComputedStyle(panel) : null;
  const sceneStyle = scene ? getComputedStyle(scene) : null;
  const dock = document.querySelector(".hos-page > .hos-dock");
  const shell = document.getElementById("store-boot-shell");
  return {
    motion: html.getAttribute("data-hos-motion"),
    glass: html.getAttribute("data-glass-effect"),
    stylesReady: html.getAttribute("data-styles-ready"),
    mounted: html.getAttribute("data-homeos-mounted"),
    panelExists: Boolean(panel),
    panelH: panel ? Math.round(panel.getBoundingClientRect().height) : null,
    panelBackdrop: style ? style.backdropFilter || style.webkitBackdropFilter : null,
    scenePosition: sceneStyle ? sceneStyle.position : null,
    steps: document.querySelectorAll(".hos-steps__item").length,
    shellVisible: Boolean(shell) && getComputedStyle(shell).display !== "none",
    dock: dock ? { scrollHeight: dock.scrollHeight, clientHeight: dock.clientHeight } : null,
    cls: Number(window.__cls.toFixed(4)),
    shifts: window.__shifts,
  };
};

async function waitFor(tab, predicate, timeoutMs) {
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt < timeoutMs) {
    last = await tab.evaluate(probe);
    if (predicate(last)) return { state: last, waitedMs: Date.now() - startedAt };
    await tab.waitForTimeout(100);
  }
  return { state: last, waitedMs: Date.now() - startedAt };
}

const rows = [];
for (const viewport of VIEWPORTS) {
  for (const page of PAGES) {
    const browser = await chromium.launch({
      channel: "msedge",
      headless: true,
      args: ["--disable-background-timer-throttling"],
    });
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
      deviceScaleFactor: 2,
      reducedMotion: "no-preference",
      userAgent:
        viewport.label === "phone"
          ? "Mozilla/5.0 (Linux; Android 13; Motorola Moto G4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36"
          : "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
    await context.addInitScript(initScript);
    const tab = await context.newPage();
    const cdp = await context.newCDPSession(tab);
    // 4x CPU + Slow 3G：把「慢机型」的可视窗口放大。
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (400 * 1024) / 8,
      uploadThroughput: (400 * 1024) / 8,
    });
    try {
      await tab.goto(page.url, { waitUntil: "domcontentloaded", timeout: 60000 });
      // 等「用户第一次真正看见页面」：占位壳揭掉（商店）或组件挂载（主应用）。
      const visible = await waitFor(
        tab,
        (state) =>
          state.panelExists &&
          (page.reveal === "shell" ? !state.shellVisible : state.mounted === "1"),
        25000,
      );
      const beforeReset = visible.state?.cls ?? 0;
      // 占位壳是**不透明覆盖层**：它下面的位移用户看不到。这里把计时复位，
      // 只统计「揭幕之后」的位移 —— 那才是用户会看见的跳动。
      await tab.evaluate(() => window.__resetCls?.());
      await tab.waitForTimeout(2000);
      const settled = await tab.evaluate(probe);
      rows.push({
        viewport: viewport.label,
        page: page.label,
        appearedMs: visible.waitedMs,
        clsBeforeReveal: beforeReset,
        ...settled,
      });
    } catch (error) {
      rows.push({ viewport: viewport.label, page: page.label, error: String(error).slice(0, 200) });
    } finally {
      await browser.close().catch(() => {});
    }
  }
}

const lines = rows.map((row) => {
  if (row.error) return `${row.viewport.padEnd(6)} ${row.page.padEnd(15)} ERROR ${row.error}`;
  return [
    `${row.viewport.padEnd(6)} ${row.page.padEnd(15)}`,
    `appeared=${row.appearedMs}ms`,
    `cls_after=${row.cls}`,
    `cls_before=${row.clsBeforeReveal}`,
    `motion=${row.motion}`,
    `glass=${row.glass}`,
    `backdrop=${row.panelBackdrop}`,
    `scene=${row.scenePosition}`,
    `steps=${row.steps}`,
    `panelH=${row.panelH}`,
    `dock=${row.dock ? `${row.dock.scrollHeight}/${row.dock.clientHeight}` : "null"}`,
    `shifts=${JSON.stringify(row.shifts)}`,
  ].join(" ");
});
console.log(lines.join("\n"));
