#!/usr/bin/env node
/**
 * 前端首屏 / 交互实验室测量。
 *
 * 用系统 Microsoft Edge（playwright-core，无需下载浏览器）在隔离实例上测：
 * - LCP / CLS / TBT 近似 / long task / Event Timing（INP 的实验室代理）
 * - CDP Network encoded bytes 与 PerformanceResourceTiming
 * - JS heap、DOM/iframe/canvas 数量
 * - 固定视口截图，供 compare_screenshots.py 做视觉回归
 *
 * 这不是真机数据；真机平板指标仍需在目标设备上补测。
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const PERF_ROOT = process.env.HOMEOS_PERF_ROOT || "/tmp/homeos-perf";

const args = process.argv.slice(2);
function argValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}
const label = argValue("--label") || "before";
const routeFilter = argValue("--routes").split(",").map((item) => item.trim()).filter(Boolean);
const envPath = join(PERF_ROOT, "env", label, "env.json");
const env = JSON.parse(readFileSync(envPath, "utf8"));
const homeosBase = `http://127.0.0.1:${env.homeos.port}`;
const storeBase = `http://127.0.0.1:${env.store.port}`;
const outDir = join(PERF_ROOT, "results", label);
const shotDir = join(outDir, "screenshots");
mkdirSync(shotDir, { recursive: true });

const initScript = `
(() => {
  const state = window.__homeosPerf = {
    startedAt: performance.now(),
    lcp: 0,
    cls: 0,
    longtasks: [],
    events: [],
    paint: {},
    errors: [],
    resourceCount: 0,
  };
  const observe = (type, callback, extra) => {
    try {
      const observer = new PerformanceObserver((list) => callback(list.getEntries()));
      observer.observe({ type, buffered: true, ...(extra || {}) });
    } catch (error) {
      state.errors.push(String(error));
    }
  };
  observe("largest-contentful-paint", (entries) => {
    for (const entry of entries) state.lcp = Math.max(state.lcp, entry.startTime);
  });
  observe("layout-shift", (entries) => {
    for (const entry of entries) if (!entry.hadRecentInput) state.cls += entry.value;
  });
  observe("longtask", (entries) => {
    for (const entry of entries) state.longtasks.push({ start: entry.startTime, duration: entry.duration });
  });
  observe("event", (entries) => {
    for (const entry of entries) {
      if (entry.duration >= 16) state.events.push({ name: entry.name, start: entry.startTime, duration: entry.duration });
    }
  }, { durationThreshold: 16 });
  observe("paint", (entries) => {
    for (const entry of entries) state.paint[entry.name] = entry.startTime;
  });
  window.addEventListener("error", (event) => {
    state.errors.push(String(event.message || event.error || "error"));
  }, true);
})();
`;

function routeDefinitions() {
  return [
    { name: "home", url: homeosBase + "/", auth: true, settleMs: 7000, screenshot: true },
    { name: "display", url: homeosBase + "/display/" + encodeURIComponent(env.homeos.projectId), auth: true, settleMs: 9000, screenshot: true },
    { name: "login", url: homeosBase + "/login", auth: false, settleMs: 1500, screenshot: true },
    { name: "store-home", url: storeBase + "/", auth: false, settleMs: 2000, screenshot: true },
  ];
}

function makeNetworkTracker(cdp) {
  const tracker = { encodedBytes: 0, byType: {}, responses: 0, statuses: {}, requests: 0, failed: 0 };
  const requestTypes = new Map();
  cdp.on("Network.requestWillBeSent", () => { tracker.requests += 1; });
  cdp.on("Network.responseReceived", (event) => {
    tracker.responses += 1;
    const status = event.response?.status || 0;
    tracker.statuses[status] = (tracker.statuses[status] || 0) + 1;
    requestTypes.set(event.requestId, event.type || "Other");
  });
  cdp.on("Network.loadingFinished", (event) => {
    const bytes = event.encodedDataLength || 0;
    tracker.encodedBytes += bytes;
    const type = requestTypes.get(event.requestId) || "Other";
    tracker.byType[type] = (tracker.byType[type] || 0) + bytes;
  });
  cdp.on("Network.loadingFailed", () => { tracker.failed += 1; });
  return tracker;
}

function summarizeDurations(values) {
  if (!values.length) return { count: 0, max: 0, p95: 0, total: 0 };
  const ordered = [...values].sort((a, b) => a - b);
  const pick = (pct) => ordered[Math.min(ordered.length - 1, Math.round((pct / 100) * (ordered.length - 1)))];
  return {
    count: values.length,
    max: Number(ordered[ordered.length - 1].toFixed(2)),
    p95: Number(pick(95).toFixed(2)),
    total: Number(values.reduce((sum, value) => sum + value, 0).toFixed(2)),
  };
}

async function readMetrics(page, cdp, net, consoleErrors, requestFailures) {
  let cdpMetrics = {};
  try {
    const result = await cdp.send("Performance.getMetrics");
    cdpMetrics = Object.fromEntries(result.metrics.map((metric) => [metric.name, metric.value]));
  } catch {
    // Performance domain 在极老的浏览器上可能不可用，保留 0 而不是伪造。
  }
  const payload = await page.evaluate(() => {
    const state = window.__homeosPerf || {};
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    const byInitiator = {};
    let transferBytes = 0;
    let encodedBodyBytes = 0;
    for (const entry of resources) {
      const type = entry.initiatorType || "other";
      byInitiator[type] = (byInitiator[type] || 0) + (entry.transferSize || 0);
      transferBytes += entry.transferSize || 0;
      encodedBodyBytes += entry.encodedBodySize || 0;
    }
    return {
      url: location.href,
      title: document.title,
      lcp: Number(state.lcp || 0),
      cls: Number(state.cls || 0),
      longtasks: state.longtasks || [],
      events: state.events || [],
      paint: state.paint || {},
      errors: state.errors || [],
      navigation: navigation ? {
        ttfb: Number(navigation.responseStart || 0),
        domContentLoaded: Number(navigation.domContentLoadedEventEnd || 0),
        load: Number(navigation.loadEventEnd || 0),
        duration: Number(navigation.duration || 0),
        transferSize: Number(navigation.transferSize || 0),
        encodedBodySize: Number(navigation.encodedBodySize || 0),
        type: navigation.type,
      } : null,
      resources: {
        count: resources.length,
        transferBytes,
        encodedBodyBytes,
        byInitiator,
      },
      dom: {
        nodes: document.getElementsByTagName("*").length,
        iframes: document.querySelectorAll("iframe").length,
        canvases: document.querySelectorAll("canvas").length,
        images: document.images.length,
        scripts: document.scripts.length,
      },
      heap: performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
      } : null,
    };
  });
  const longtasks = payload.longtasks.map((entry) => entry.duration);
  const events = payload.events.map((entry) => entry.duration);
  return {
    ...payload,
    lcp: Number(payload.lcp.toFixed(2)),
    cls: Number(payload.cls.toFixed(4)),
    longtasks: { ...summarizeDurations(longtasks), entries: payload.longtasks.slice(0, 50) },
    events: { ...summarizeDurations(events), entries: payload.events.slice(0, 50) },
    network: {
      cdpEncodedBytes: net.encodedBytes,
      cdpByType: net.byType,
      cdpResponses: net.responses,
      cdpRequests: net.requests,
      cdpFailed: net.failed,
      cdpStatuses: net.statuses,
      resourceTransferBytes: payload.resources.transferBytes,
      resourceEncodedBodyBytes: payload.resources.encodedBodyBytes,
      resourceCount: payload.resources.count,
      resourceByInitiator: payload.resources.byInitiator,
    },
    consoleErrors,
    requestFailures,
    jsHeapUsedBytes: cdpMetrics.JSHeapUsedSize ?? payload.heap?.usedJSHeapSize ?? 0,
    jsHeapTotalBytes: cdpMetrics.JSHeapTotalSize ?? payload.heap?.totalJSHeapSize ?? 0,
  };
}

async function runRoute(browser, route) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  if (route.auth) {
    await context.addCookies([{ name: "auth_token", value: env.homeos.token, url: homeosBase }]);
  }
  const page = await context.newPage();
  await page.addInitScript(initScript);
  page.on("crash", () => {
    console.error("[bench_frontend] page crashed:", route.name);
  });
  const consoleErrors = [];
  const requestFailures = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 500));
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error).slice(0, 500)));
  page.on("requestfailed", (request) => {
    requestFailures.push({ url: request.url().slice(0, 500), error: (request.failure()?.errorText || "").slice(0, 200) });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Performance.enable");
  const net = makeNetworkTracker(cdp);

  const result = { name: route.name, requestedUrl: route.url, cold: null, warm: null, screenshot: "" };
  try {
    await page.goto(route.url, { waitUntil: "load", timeout: 60000 });
  } catch (error) {
    result.navigationError = String(error).slice(0, 1000);
  }
  try {
    await page.waitForLoadState("networkidle", { timeout: 5000 });
  } catch {
    // 3D / 长轮询页面通常不会真正 networkidle；继续用固定 settle。
  }
  await page.waitForTimeout(route.settleMs);
  result.cold = await readMetrics(page, cdp, net, consoleErrors.slice(-20), requestFailures.slice(-20));
  if (route.screenshot) {
    const shotPath = join(shotDir, `${route.name}.png`);
    try {
      await page.screenshot({ path: shotPath, fullPage: false });
      result.screenshot = shotPath;
    } catch (error) {
      result.screenshotError = String(error).slice(0, 500);
    }
  }

  // 暖导航：同 context 再走一次，观察静态资源缓存与 API 条件请求的收益。
  net.encodedBytes = 0;
  net.byType = {};
  net.responses = 0;
  net.statuses = {};
  net.requests = 0;
  net.failed = 0;
  try {
    await page.reload({ waitUntil: "load", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(route.name === "display" || route.name === "home" ? 5000 : 1000);
    result.warm = await readMetrics(page, cdp, net, consoleErrors.slice(-20), requestFailures.slice(-20));
  } catch (error) {
    result.warmError = String(error).slice(0, 1000);
  }
  await context.close();
  return result;
}

const routes = [];
let browserVersion = "";
for (const route of routeDefinitions()) {
  if (routeFilter.length && !routeFilter.includes(route.name)) continue;
  console.log(`[${label}] 前端 ${route.name} ...`);
  // 每个路由独立浏览器：display 的 3D iframe 可能与上一个 context 的 WebGL 资源互相影响，
  // 复用同一进程会导致 renderer 被回收后整轮测量中断；冷开计时从 goto 开始，不受启动开销影响。
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--enable-precise-memory-info", "--disable-background-timer-throttling"],
  });
  if (!browserVersion) browserVersion = browser.version();
  browser.on("disconnected", () => console.error("[bench_frontend] browser disconnected:", route.name));
  try {
    routes.push(await runRoute(browser, route));
  } catch (error) {
    routes.push({ name: route.name, requestedUrl: route.url, error: String(error).slice(0, 1000) });
  } finally {
    await browser.close().catch(() => {});
  }
}
const output = {
  label,
  generatedAt: new Date().toISOString(),
  browser: { name: "chromium", channel: "msedge", version: browserVersion, viewport: "1440x900", reducedMotion: "reduce" },
  environment: { homeosBase, storeBase, projectId: env.homeos.projectId },
  routes,
};
const outputPath = join(outDir, "frontend.json");
writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(`[${label}] 前端结果：${outputPath}`);
