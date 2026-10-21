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
    lcpElement: "",
    lcpUrl: "",
    cls: 0,
    longtasks: [],
    events: [],
    interactions: [],
    paint: {},
    errors: [],
    resourceCount: 0,
  };
  // 把 LCP 元素描述成可复用的选择器，便于把「首屏最大元素」与 3D/DOM 结构对上号。
  const describeElement = (element) => {
    if (!element || !element.tagName) return "";
    const parts = [element.tagName.toLowerCase()];
    if (element.id) parts.push("#" + element.id);
    const classes = String(element.className || "").split(/\\s+/).filter(Boolean).slice(0, 3);
    if (classes.length) parts.push("." + classes.join("."));
    if (element.getAttribute) {
      const role = element.getAttribute("role");
      if (role) parts.push('[role="' + role + '"]');
    }
    return parts.join("");
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
    for (const entry of entries) {
      if (entry.startTime >= state.lcp) {
        state.lcp = entry.startTime;
        state.lcpElement = describeElement(entry.element);
        state.lcpUrl = entry.url || "";
      }
    }
  });
  observe("layout-shift", (entries) => {
    for (const entry of entries) if (!entry.hadRecentInput) state.cls += entry.value;
  });
  observe("longtask", (entries) => {
    for (const entry of entries) state.longtasks.push({ start: entry.startTime, duration: entry.duration });
  });
  // Event Timing：保留 interactionId，才能按「真实交互」分组算 INP（同一交互的多个事件不重复计）。
  observe("event", (entries) => {
    for (const entry of entries) {
      state.events.push({
        name: entry.name,
        start: entry.startTime,
        duration: entry.duration,
        interactionId: entry.interactionId || 0,
      });
    }
  }, { durationThreshold: 16 });
  observe("paint", (entries) => {
    for (const entry of entries) state.paint[entry.name] = entry.startTime;
  });
  window.addEventListener("error", (event) => {
    state.errors.push(String(event.message || event.error || "error"));
  }, true);

  // 合成交互延迟：输入事件派发 -> 连续 rAF 之间的时间差。
  // 这是实验室代理，不等同真机 INP；真机 INP 仍需目标设备采集。
  window.__homeosPerfBeginInteraction = () => {
    const interaction = { start: performance.now(), frames: [], selector: "" };
    state.interaction = interaction;
    const tick = () => {
      if (state.interaction !== interaction) return;
      interaction.frames.push(performance.now());
      if (interaction.frames.length < 8) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return interaction.start;
  };
  window.__homeosPerfEndInteraction = (selector) => {
    const interaction = state.interaction;
    if (!interaction) return null;
    state.interaction = null;
    if (selector) interaction.selector = selector;
    // total 必须由采样窗口内的帧时间戳推出，不能用调用本函数的时间：
    // 调用方为了等满 8 帧会先 sleep，那个 sleep 不是交互延迟。
    const lastFrame = interaction.frames.length ? interaction.frames[interaction.frames.length - 1] : null;
    state.interactions.push({
      selector: interaction.selector,
      start: interaction.start,
      total: lastFrame === null ? null : Number((lastFrame - interaction.start).toFixed(2)),
      firstFrame: interaction.frames.length ? Number((interaction.frames[0] - interaction.start).toFixed(2)) : null,
      frameCount: interaction.frames.length,
    });
    return state.interactions[state.interactions.length - 1];
  };
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
    // 渲染阻塞资源：ResourceTiming 的 renderBlockingStatus（Chrome 107+）。
    const firstPaint = state.paint && state.paint["first-contentful-paint"] ? state.paint["first-contentful-paint"] : 0;
    const blockingResources = resources
      .filter((entry) => entry.renderBlockingStatus === "blocking")
      .map((entry) => ({
        url: entry.name,
        start: Number((entry.startTime || 0).toFixed(2)),
        duration: Number((entry.duration || 0).toFixed(2)),
        transferSize: entry.transferSize || 0,
        beforeFcp: firstPaint ? entry.startTime < firstPaint : null,
      }))
      .sort((a, b) => b.duration - a.duration);
    // 最慢请求：定位首屏关键路径上的长耗时资源（含 API）。
    const slowestResources = [...resources]
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10)
      .map((entry) => ({
        url: entry.name,
        initiatorType: entry.initiatorType || "other",
        start: Number((entry.startTime || 0).toFixed(2)),
        duration: Number((entry.duration || 0).toFixed(2)),
        transferSize: entry.transferSize || 0,
      }));
    return {
      url: location.href,
      title: document.title,
      lcp: Number(state.lcp || 0),
      lcpElement: state.lcpElement || "",
      lcpUrl: state.lcpUrl || "",
      cls: Number(state.cls || 0),
      longtasks: state.longtasks || [],
      events: state.events || [],
      interactions: state.interactions || [],
      paint: state.paint || {},
      errors: state.errors || [],
      blockingResources,
      slowestResources,
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
  // INP：按 interactionId 取每次交互的最长事件，再取 p75 / p98（与 Web Vitals 口径一致的高分位）。
  const perInteraction = new Map();
  for (const entry of payload.events) {
    const key = entry.interactionId || `e${entry.start}`;
    perInteraction.set(key, Math.max(perInteraction.get(key) || 0, entry.duration));
  }
  const interactionDurations = [...perInteraction.values()].sort((a, b) => a - b);
  const percentile = (ordered, pct) =>
    ordered.length ? Number(ordered[Math.min(ordered.length - 1, Math.round((pct / 100) * (ordered.length - 1)))].toFixed(2)) : 0;
  const longTasksOver50 = longtasks.filter((duration) => duration > 50);
  return {
    ...payload,
    lcp: Number(payload.lcp.toFixed(2)),
    cls: Number(payload.cls.toFixed(4)),
    longTasksOver50Count: longTasksOver50.length,
    longTasksOver50TotalMs: Number(longTasksOver50.reduce((sum, duration) => sum + duration, 0).toFixed(1)),
    longtasks: { ...summarizeDurations(longtasks), entries: payload.longtasks.slice(0, 50) },
    events: { ...summarizeDurations(events), entries: payload.events.slice(0, 50) },
    inp: {
      interactionCount: interactionDurations.length,
      p75: percentile(interactionDurations, 75),
      p98: percentile(interactionDurations, 98),
      max: interactionDurations.length ? Number(interactionDurations[interactionDurations.length - 1].toFixed(2)) : 0,
    },
    blockingResources: {
      count: payload.blockingResources.length,
      beforeFcp: payload.blockingResources.filter((entry) => entry.beforeFcp === true).length,
      totalTransferBytes: payload.blockingResources.reduce((sum, entry) => sum + entry.transferSize, 0),
      entries: payload.blockingResources.slice(0, 20),
    },
    slowestResources: payload.slowestResources,
    syntheticInteraction: payload.interactions.length ? payload.interactions[payload.interactions.length - 1] : null,
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

  // 交互延迟：用 Playwright 的真实鼠标输入（CDP Input.dispatchMouseEvent，事件为 trusted），
  // 才能同时拿到 Event Timing 的 interactionId（INP 口径）和 rAF 帧时间。
  // 只在冷开页面（warm reload 之前）取一次，避免把弹窗/路由变化带进后续测量。
  try {
    const interacted = await page.evaluate(() => {
      const x = Math.round(window.innerWidth / 2);
      const y = Math.round(window.innerHeight / 2);
      const target = document.elementFromPoint(x, y);
      if (!target) return { skipped: "no-element" };
      const tag = target.tagName ? target.tagName.toLowerCase() : "";
      // 锚点会导航，跳过；其余元素（卡片 / iframe / 空白容器）只触发本地处理器。
      if (tag === "a") return { skipped: "anchor" };
      const classes = String(target.className || "").split(/\s+/).filter(Boolean).slice(0, 3);
      const selector = [tag, target.id ? `#${target.id}` : "", classes.length ? `.${classes.join(".")}` : ""].join("");
      window.__homeosPerfBeginInteraction();
      return { selector, x, y };
    });
    if (interacted && !interacted.skipped) {
      const urlBefore = page.url();
      await page.mouse.move(interacted.x, interacted.y);
      await page.mouse.down();
      await page.mouse.up();
      // 等满 8 帧的采样窗口（约 133 ms），再取记录值；不足时也不伪造。
      await page.waitForTimeout(250);
      result.syntheticInteraction = await page.evaluate(
        (selector) => window.__homeosPerfEndInteraction(selector),
        interacted.selector,
      );
      if (page.url() !== urlBefore) {
        result.syntheticInteraction.navigatedTo = page.url();
      }
      // 交互发生在 cold 采样之后，因此 INP 必须重算一次才能包含这次真实输入。
      const inpAfter = await page.evaluate(() => {
        const events = (window.__homeosPerf?.events) || [];
        const perInteraction = new Map();
        for (const entry of events) {
          const key = entry.interactionId || `e${entry.duration}`;
          perInteraction.set(key, Math.max(perInteraction.get(key) || 0, entry.duration));
        }
        const ordered = [...perInteraction.values()].sort((a, b) => a - b);
        const pick = (pct) => ordered.length
          ? Number(ordered[Math.min(ordered.length - 1, Math.round((pct / 100) * (ordered.length - 1)))].toFixed(2))
          : 0;
        return {
          interactionCount: ordered.length,
          p75: pick(75),
          p98: pick(98),
          max: ordered.length ? Number(ordered[ordered.length - 1].toFixed(2)) : 0,
        };
      });
      if (result.cold) {
        result.cold.inpBeforeInteraction = result.cold.inp;
        result.cold.inp = inpAfter;
      }
    } else {
      result.syntheticInteraction = interacted || null;
    }
  } catch (error) {
    result.syntheticInteractionError = String(error).slice(0, 500);
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
