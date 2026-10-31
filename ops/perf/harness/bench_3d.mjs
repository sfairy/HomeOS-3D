#!/usr/bin/env node
/**
 * 3D 交互渲染单独测量（通过真实的 display 宿主 + iframe 舞台）。
 *
 * 为什么不再直接打开 stage.html：舞台只有在被 iframe 嵌入时才 mountStage 并进入渲染循环；
 * 顶层直接打开只会创建 renderer，renderer.info 恒为 2 calls / 1 geometry，不能代表真实 3D。
 * 这里打开 /display/<projectId>?performance-diagnostics=1，读取 iframe 内页面自带的
 * performance-diagnostics，再在舞台画布上模拟拖拽，采集交互稳定后的帧率/draw calls/内存。
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const PERF_ROOT = process.env.HOMEOS_PERF_ROOT || "/tmp/homeos-perf";
const args = process.argv.slice(2);
const labelIndex = args.indexOf("--label");
const label = labelIndex >= 0 ? args[labelIndex + 1] : "before";
const tagIndex = args.indexOf("--tag");
const tag = tagIndex >= 0 ? args[tagIndex + 1] : "";
/**
 * 追加到 display URL 的查询参数（可重复），用来对同一构建做行为 A/B，例如
 * `--query defer-reflections=1`。参数会被 runtime 按白名单透传到 stage iframe。
 */
const extraQueries = args
  .reduce((acc, arg, index) => (arg === "--query" && args[index + 1] ? [...acc, args[index + 1]] : acc), []);
const env = JSON.parse(readFileSync(join(PERF_ROOT, "env", label, "env.json"), "utf8"));
const homeosBase = `http://127.0.0.1:${env.homeos.port}`;
const outDir = join(PERF_ROOT, "results", label);
const shotDir = join(outDir, "screenshots");
mkdirSync(shotDir, { recursive: true });

// 宿主页面：iframe 的 ready 消息发到 parent，因此监听宿主的 window。
const hostInitScript = `
(() => {
  const state = window.__homeos3d = {
    startedAt: performance.now(),
    readyAt: null,
    readyPayload: null,
  };
  window.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.channel === "hb-i3d-v1" && data.type === "ready") {
      state.readyAt = performance.now();
      state.readyPayload = {
        statePatches: !!data.statePatches,
        metadataKeys: data.metadata ? Object.keys(data.metadata) : [],
      };
    }
  });
})();
`;

// 每个 frame 都注入：舞台自己的 startedAt / contextlost / longtask。
const frameInitScript = `
(() => {
  const state = window.__homeos3dFrame = {
    startedAt: performance.now(),
    contextlost: 0,
    errors: [],
    longtasks: [],
    events: [],
  };
  document.addEventListener("webglcontextlost", () => { state.contextlost += 1; }, true);
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.longtasks.push({ start: entry.startTime, duration: entry.duration });
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch (error) {
    state.errors.push(String(error));
  }
  // iframe 内的 Event Timing：交互响应只能按 iframe 自己的 interactionId 分组。
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.events.push({
          name: entry.name,
          duration: entry.duration,
          interactionId: entry.interactionId || 0,
        });
      }
    });
    observer.observe({ type: "event", buffered: true, durationThreshold: 16 });
  } catch (error) {
    state.errors.push(String(error));
  }
  window.addEventListener("error", (event) => {
    state.errors.push(String(event.message || event.error || "error"));
  }, true);
})();
`;

function makeNetworkTracker(cdp) {
  const tracker = { encodedBytes: 0, byType: {}, responses: 0, requests: 0, statuses: {}, failed: 0 };
  const requestTypes = new Map();
  cdp.on("Network.requestWillBeSent", () => { tracker.requests += 1; });
  cdp.on("Network.responseReceived", (event) => {
    tracker.responses += 1;
    tracker.statuses[event.response?.status || 0] = (tracker.statuses[event.response?.status || 0] || 0) + 1;
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

async function readDataset(frame) {
  return frame.evaluate(() => {
    const raw = document.documentElement.dataset.performanceDiagnostics || "";
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
    // 地面反射的捕获统计（captures / totalMs）挂在渲染器自己的 canvas.dataset 上：它是判断
    // 「首帧有多少张反射是在 presented 之前赶出来的」的直接证据。文档里可能有多个
    // canvas（HUD / 覆盖层），所以扫全部再取第一个带统计的。
    let reflectionStats = null;
    for (const canvasNode of document.querySelectorAll("canvas")) {
      const reflectionRaw = canvasNode.dataset.reflectionStats;
      if (!reflectionRaw) continue;
      try { reflectionStats = JSON.parse(reflectionRaw); } catch { reflectionStats = null; }
      if (reflectionStats) break;
    }
    return {
      rawLength: raw.length,
      parsed,
      reflectionStats,
      canvasCount: document.querySelectorAll("canvas").length,
      diagnosticsHud: !!document.querySelector("#performance-diagnostics"),
      state: window.__homeos3dFrame || null,
      resources: performance.getEntriesByType("resource").length,
    };
  });
}

async function findStageFrame(page) {
  // 90s：3D 冷启动在慢机/无 GPU 的 headless 上可能远超 20s；太短会把「慢」误报成「没有 iframe」。
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const frame = page.frames().find((candidate) =>
      candidate.url().includes("/api/v1/modules/interaction3d/stage.html"));
    if (frame) return frame;
    await page.waitForTimeout(250);
  }
  return null;
}

/** 阶段耗时表：把 [3D-load]/[display-load] 日志拼成「绝对时刻 + 相对上一阶段」的表。 */
const PHASE_ORDER = [
  "display:module-ready",
  "stage:module-ready",
  "stage:renderer-created",
  "stage:draft-fetched",
  "stage:stage-mounted",
  "stage:settled-frame",
  "stage:light-cache-ready",
  "stage:final-render-start",
  "stage:final-render-end",
  "stage:presented",
  "stage:presented-baked",
  "stage:entry-finished",
  "stage:reflections-ready",
  "display:first-screen-ready",
];

function buildPhaseTable(phaseTimings) {
  const rows = [];
  let previous = null;
  for (const key of PHASE_ORDER) {
    if (!(key in phaseTimings)) continue;
    const at = phaseTimings[key];
    rows.push({
      phase: key,
      atMs: at,
      deltaFromPreviousMs: previous === null ? null : Number((at - previous).toFixed(0)),
    });
    previous = at;
  }
  return rows;
}

/** 舞台实际下发的 runtime chunk 统计（script 资源按 URL 前缀归类）。 */
async function readStageChunkStats(frame) {
  return frame.evaluate(() => {
    const entries = performance.getEntriesByType("resource").filter(
      (entry) => entry.name.includes("/modules/interaction3d/") && entry.name.endsWith(".js"),
    );
    let encoded = 0;
    let transfer = 0;
    let duration = 0;
    for (const entry of entries) {
      encoded += entry.encodedBodySize || 0;
      transfer += entry.transferSize || 0;
      duration += entry.duration || 0;
    }
    return {
      moduleJsCount: entries.length,
      encodedBodyBytes: encoded,
      transferBytes: transfer,
      sumDurationsMs: Number(duration.toFixed(2)),
      slowest: [...entries]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5)
        .map((entry) => ({
          url: entry.name.split("/modules/interaction3d/").pop(),
          duration: Number((entry.duration || 0).toFixed(2)),
          encodedBodySize: entry.encodedBodySize || 0,
        })),
    };
  });
}

/**
 * 宿主页加载了哪些组件族。
 *
 * chunk 文件名是 `shared-<hash>.js`，从 network 上分不出族；注册表在族加载完成时打一条
 * `homeos:component-family:<族>` 的 performance mark，这里按前缀读回来。展示端如果按草稿
 * 裁剪生效，就只会看到文档里出现过的族（示例项目只有 3D 户型 + 日志墙 → 空数组）。
 */
async function readComponentFamilies(page) {
  return page.evaluate(() => {
    const marks = performance
      .getEntriesByType("mark")
      .filter((entry) => entry.name.startsWith("homeos:component-family:"));
    return {
      count: marks.length,
      families: marks.map((entry) => entry.name.replace("homeos:component-family:", "")),
    };
  });
}

/** iframe 内 INP：按 interactionId 分组后取 p75（与 Web 平台口径一致的高分位）。 */function summarizeFrameInp(frameState) {
  const events = frameState?.events || [];
  const perInteraction = new Map();
  for (const entry of events) {
    const key = entry.interactionId || `e${entry.duration}`;
    perInteraction.set(key, Math.max(perInteraction.get(key) || 0, entry.duration));
  }
  const ordered = [...perInteraction.values()].sort((a, b) => a - b);
  const pick = (pct) =>
    ordered.length
      ? Number(ordered[Math.min(ordered.length - 1, Math.round((pct / 100) * (ordered.length - 1)))].toFixed(2))
      : 0;
  return {
    interactionCount: ordered.length,
    p75: pick(75),
    p98: pick(98),
    max: ordered.length ? Number(ordered[ordered.length - 1].toFixed(2)) : 0,
  };
}

/**
 * 等 presented 相位（固定采样点），而不是等 renderer.info.calls>100。
 * calls 在不同渲染阶段跳变（747 / 3,068），拿它当「已呈现」会把首帧快照采到不同 pass 上。
 */
async function waitForPresented(frame, page) {
  // 与 findStageFrame 同口径：先等「真的 presented」，再判断是否可交互；20s 对冷启动不够。
  const deadline = Date.now() + 60000;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await readDataset(frame);
    } catch {
      await page.waitForTimeout(250);
      continue;
    }
    if (stagePhaseLogs.some((line) => line.includes('"phase":"presented"'))) {
      return { ok: true, phase: "presented", snapshot: last };
    }
    await page.waitForTimeout(250);
  }
  // 兜底：没有 presented 日志（例如诊断开关被关掉）时退回旧判据，并标记采样不确定。
  const calls = last?.parsed?.render?.calls ?? 0;
  return { ok: calls > 100, phase: "fallback-calls", snapshot: last };
}

/**
 * 在舞台内部派发指针事件，而不是用 page.mouse 点 iframe：
 * 展示页的 iframe 在非编辑态 pointer-events:none，鼠标事件到不了 canvas；
 * 同时 canvas 的指针监听挂在舞台自己的 canvas 上，直接 dispatch 才能断言“真实拖拽”。
 */
async function dragCanvas(frame) {
  return frame.evaluate(async () => {
    const canvases = Array.from(document.querySelectorAll("canvas"));
    // 舞台里同时存在 2D 灯光缓存画布与 WebGL 画布；必须选可见且有 WebGL 上下文的那个，
    // 否则指针事件会打到 0x0 的 render-shield 或离屏缓存上，拖拽不产生运动帧样本。
    const canvas = canvases.find((item) => {
      const box = item.getBoundingClientRect();
      if (box.width <= 500 || box.height <= 100) return false;
      try {
        return !!(item.getContext("webgl2") || item.getContext("webgl"));
      } catch {
        return false;
      }
    }) || canvases[canvases.length - 1];
    if (!canvas) return { applied: false, reason: "no-canvas" };
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return { applied: false, reason: "zero-size-canvas" };
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const make = (type, clientX, clientY) => new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      clientX,
      clientY,
    });
    canvas.dispatchEvent(make("pointerdown", x, y));
    for (let step = 1; step <= 12; step += 1) {
      canvas.dispatchEvent(make("pointermove", x + step * 8, y + step * 2));
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    canvas.dispatchEvent(make("pointerup", x + 96, y + 24));
    return { applied: true, canvas: { width: canvas.width, height: canvas.height, rect } };
  });
}

// 浏览器/renderer 崩溃时 Playwright 只会抛 "Target page ... closed"，真正原因（GPU 进程、
// renderer OOM）不会进异常。把 crash/disconnect 事件单独记进结果，报告里才能归因。
const browserDiagnostics = { pageCrash: false, browserDisconnected: false };
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--enable-precise-memory-info", "--disable-background-timer-throttling"],
});
const browserVersion = browser.version();
browser.on("disconnected", () => {
  browserDiagnostics.browserDisconnected = true;
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: "no-preference",
});
await context.addCookies([{ name: "auth_token", value: env.homeos.token, url: homeosBase }]);
await context.addInitScript(hostInitScript);
await context.addInitScript(frameInitScript);
const page = await context.newPage();
const consoleErrors = [];
const stagePhaseLogs = [];
page.on("crash", () => {
  browserDiagnostics.pageCrash = true;
});
page.on("close", () => {
  browserDiagnostics.pageClosed = true;
});
page.on("console", (message) => {
  const text = message.text();
  if (message.type() === "error") consoleErrors.push(text.slice(0, 500));
  if (text.includes("[3D-load]") || text.includes("[display-load]")) stagePhaseLogs.push(text.slice(0, 500));
});
page.on("pageerror", (error) => consoleErrors.push(String(error).slice(0, 500)));
const requestFailures = [];
page.on("requestfailed", (request) => requestFailures.push({ url: request.url().slice(0, 500), error: (request.failure()?.errorText || "").slice(0, 200) }));
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Performance.enable");
const net = makeNetworkTracker(cdp);

const displayQuery = new URLSearchParams({ "performance-diagnostics": "1" });
for (const extra of extraQueries) {
  const [key, ...rest] = extra.split("=");
  if (key) displayQuery.set(key, rest.join("="));
}
const displayUrl = `${homeosBase}/display/${encodeURIComponent(env.homeos.projectId)}?${displayQuery.toString()}`;
const result = {
  label,
  generatedAt: new Date().toISOString(),
  browser: { version: browserVersion, viewport: "1440x900", reducedMotion: "no-preference" },
  url: displayUrl,
  extraQueries,
  sceneId: env.homeos.sceneId,
  projectId: env.homeos.projectId,
  componentId: env.homeos.componentId || "",
};

function collectPhaseTimings(logs) {
  const phaseTimings = {};
  for (const line of logs) {
    const prefix = line.startsWith("[3D-load]") ? "stage" : line.startsWith("[display-load]") ? "display" : "";
    const jsonStart = line.indexOf("{");
    if (!prefix || jsonStart < 0) continue;
    try {
      const payload = JSON.parse(line.slice(jsonStart));
      if (payload.phase) phaseTimings[`${prefix}:${payload.phase}`] = payload.at;
    } catch {
      // 诊断日志不是合法 JSON 时忽略，不影响测量。
    }
  }
  return phaseTimings;
}

// 交互采样阶段可能因浏览器被关闭而中断；summary 一定在 try/finally 之后构建，
// 这样 presented 快照与 iframeReady 仍能进入预算门禁，而不是整片 SKIP。
function buildActionSummary(result) {
  const phaseTimings = result.phaseTimings || {};
  const latest = result.afterInteraction?.parsed || result.presentedSnapshot?.parsed || null;
  const presented = result.presentedSnapshot?.parsed || null;
  if (!latest) return null;
  return {
    frameSamples: latest.frame?.samples ?? 0,
    averageFps: latest.frame?.averageFps ?? null,
    medianFps: latest.frame?.medianFps ?? null,
    frameP95Ms: latest.frame?.p95Ms ?? null,
    cpuRenderAvgMs: latest.cpuRenderMs?.average ?? null,
    cpuRenderP95Ms: latest.cpuRenderMs?.p95 ?? null,
    gpuStatus: latest.gpuRenderMs?.status ?? null,
    gpuRenderAvgMs: latest.gpuRenderMs?.average ?? null,
    renderCalls: latest.render?.calls ?? null,
    triangles: latest.render?.triangles ?? null,
    lines: latest.render?.lines ?? null,
    geometries: latest.memory?.geometries ?? null,
    textures: latest.memory?.textures ?? null,
    programs: latest.memory?.programs ?? null,
    viewport: latest.viewport ?? null,
    // 固定相位（presented）统计：与稳态帧分开记，避免把不同 pass 的数字混着比。
    presentedCalls: presented?.render?.calls ?? null,
    presentedTriangles: presented?.render?.triangles ?? null,
    presentedGeometries: presented?.memory?.geometries ?? null,
    presentedTextures: presented?.memory?.textures ?? null,
    presentedPrograms: presented?.memory?.programs ?? null,
    stageModuleJsCount: result.stageChunks?.moduleJsCount ?? null,
    stageModuleJsEncodedBytes: result.stageChunks?.encodedBodyBytes ?? null,
    componentFamilyCount: result.componentFamilies?.count ?? null,
    // 首帧（presented）时已经付出的反射捕获成本：A/B 判断「推迟反射」是否真的省了工作。
    presentedReflectionCaptures: result.presentedSnapshot?.reflectionStats?.captures ?? null,
    presentedReflectionMs: result.presentedSnapshot?.reflectionStats?.totalMs ?? null,
    // 稳态反射捕获次数/耗时：这一次 A/B 就是靠它发现「推迟捕获」的开关会让反射永远不建
    // （deferred 分支 captures 恒为 0）。放进 summary 是为了能进门禁，不再靠人肉翻 JSON。
    steadyReflectionCaptures: result.afterInteraction?.reflectionStats?.captures ?? null,
    steadyReflectionMs: result.afterInteraction?.reflectionStats?.totalMs ?? null,
    iframeInpP75: result.frameInp?.p75 ?? null,
    iframeInpMax: result.frameInp?.max ?? null,
    contextlost: result.frameState?.contextlost ?? 0,
    iframeReadyMs: result.iframeReadyMs ?? null,
    moduleReadyMs: phaseTimings["stage:module-ready"] ?? null,
    rendererCreatedMs: phaseTimings["stage:renderer-created"] ?? null,
    draftFetchedMs: phaseTimings["stage:draft-fetched"] ?? null,
    stageMountedMs: phaseTimings["stage:stage-mounted"] ?? null,
    settledFrameMs: phaseTimings["stage:settled-frame"] ?? null,
    lightCacheReadyMs: phaseTimings["stage:light-cache-ready"] ?? null,
    presentedMs: phaseTimings["stage:presented"] ?? null,
    // 渐进呈现（D2）开启时，`presented` 提前到 settled-frame，灯光缓存烘焙完成的终帧记在
    // `presented-baked`。两者一起报，才能看出「提前多少」与「烘焙是否仍在同一帧预算内」。
    presentedBakedMs: phaseTimings["stage:presented-baked"] ?? null,
    entryFinishedMs: phaseTimings["stage:entry-finished"] ?? null,
    reflectionsReadyMs: phaseTimings["stage:reflections-ready"] ?? null,
    displayFirstScreenMs: phaseTimings["display:first-screen-ready"] ?? null,
    interactive: result.stageInteractive === true,
    error: result.error ?? null,
  };
}

try {
  const response = await page.goto(displayUrl, { waitUntil: "load", timeout: 90000 });
  result.httpStatus = response?.status() || 0;
  // 先拿到 iframe、再等 presented，最后才看宿主上的 is-ready：
  // headless + 软件 WebGL 冷启动时 presented 可能晚于 20s，先等 is-ready 会把「慢」误判成「没起来」。
  const frame = await findStageFrame(page);
  if (!frame) throw new Error("display 页面没有找到 3D stage iframe");
  result.stageFrameUrl = frame.url();
  result.frameFoundMs = await page.evaluate(() => Number(performance.now().toFixed(2)));
  result.stageChunks = await readStageChunkStats(frame);
  result.componentFamilies = await readComponentFamilies(page);
  const rendered = await waitForPresented(frame, page);
  result.presentedDetection = { ok: rendered.ok, phase: rendered.phase };
  result.firstRender = rendered.snapshot;
  // 固定相位快照：presented 之后立刻取一次 renderer.info，作为可比的首帧指标。
  let presentedSnapshot = null;
  try {
    presentedSnapshot = await readDataset(frame);
  } catch {
    // 采样失败时保留 null，报告里标注不可用，不用其他阶段的数字顶替。
  }
  result.presentedSnapshot = presentedSnapshot;
  // 等宿主 runtime 的可交互标记；presented 之后通常立即出现，60s 是给慢机的上限。
  try {
    await page.waitForFunction(
      () => !!document.querySelector(".hb-interaction3d-runtime.is-ready"),
      null,
      { timeout: 60000 },
    );
    result.stageInteractive = true;
  } catch {
    result.stageInteractive = false;
  }
  result.iframeReadyMs = await page.evaluate(() => Number(performance.now().toFixed(2)));
  result.readyPayload = await page.evaluate(() => window.__homeos3d?.readyPayload || null);
  if (!rendered.ok) {
    result.renderWaitWarning = "60s 内未看到 presented 相位（也未达到 calls>100 兜底判据）";
  }
  result.beforeInteraction = await readDataset(frame);
  result.dragApplied = await dragCanvas(frame);
  // 3D 页在 headless Edge 上可能在 presented 后几秒内被浏览器关闭（实测约 28s 进程退出）。
  // 采样窗口必须短：先 600ms 让帧统计起步，再 4×250ms，总计约 1.6s，确保还在同一进程内。
  await page.waitForTimeout(600);
  const samples = [];
  for (let index = 0; index < 4; index += 1) {
    await page.waitForTimeout(250);
    samples.push(await readDataset(frame));
  }
  result.interactionSamples = samples;
  result.afterInteraction = await readDataset(frame);
  result.frameState = await frame.evaluate(() => window.__homeos3dFrame || null);
  const shotPath = join(shotDir, "stage.png");
  try {
    const iframeElement = page.locator("iframe.i3d-frame").first();
    if (await iframeElement.count()) {
      await iframeElement.screenshot({ path: shotPath, timeout: 15000 });
    } else {
      await page.screenshot({ path: shotPath, fullPage: false });
    }
    result.screenshot = shotPath;
  } catch (error) {
    result.screenshotError = String(error).slice(0, 500);
    try {
      await page.screenshot({ path: shotPath, fullPage: false });
      result.screenshot = shotPath;
    } catch {
      // 保留 screenshotError。
    }
  }
  const cdpMetrics = await cdp.send("Performance.getMetrics").catch(() => ({ metrics: [] }));
  const metricMap = Object.fromEntries(cdpMetrics.metrics.map((metric) => [metric.name, metric.value]));
  result.heap = { usedJSHeapSize: metricMap.JSHeapUsedSize || 0, totalJSHeapSize: metricMap.JSHeapTotalSize || 0 };
  result.network = net;
  result.consoleErrors = consoleErrors.slice(-30);
  result.requestFailures = requestFailures.slice(-30);
  result.phaseTimings = collectPhaseTimings(stagePhaseLogs);
  result.phaseTable = buildPhaseTable(result.phaseTimings);
  result.frameInp = summarizeFrameInp(result.frameState);
} catch (error) {
  result.error = String(error).slice(0, 2000);
  result.consoleErrors = consoleErrors.slice(-30);
  result.requestFailures = requestFailures.slice(-30);
  try {
    result.failureState = await page.evaluate(() => ({
      url: location.href,
      bodyText: (document.body?.innerText || "").slice(0, 1000),
      state: window.__homeos3d || null,
      frames: Array.from(document.querySelectorAll("iframe")).map((iframe) => iframe.src),
    }));
  } catch {
    // 页面已崩溃时保留原始错误即可。
  }
} finally {
  await context.close();
  await browser.close();
}
result.browserDiagnostics = browserDiagnostics;
result.phaseTimings = collectPhaseTimings(stagePhaseLogs);
result.phaseTable = buildPhaseTable(result.phaseTimings);
result.summary = buildActionSummary(result);
const outputPath = join(outDir, tag ? `3d-${tag}.json` : "3d.json");
writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n");
console.log(`[${label}] 3D 结果：${outputPath}`);
console.log(JSON.stringify(result.summary || { error: result.error || "no summary" }, null, 2));
