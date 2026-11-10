/**
 * 舞台 iframe 内的 GPU / 帧探针（bench_3d 与 soak_3d 共用）。
 *
 * - 纹理上传：包装 texImage2D / texSubImage2D / generateMipmap 等，按时间戳记录，
 *   用来断言「运动起止不触发整场纹理重传」（motionTexUploads）。
 * - 页面帧：包装 requestAnimationFrame，按 rAF 时间戳把同一帧内的回调耗时合并，
 *   得到「页面真的干活的帧」的间隔与工作量；静置时这个计数就是 idleFramesPerSec。
 * - 显存估算（可选，trackMemory）：跟踪纹理 / 渲染缓冲 / 缓冲区的分配与删除，
 *   按格式字节数累加；不含驱动开销与默认帧缓冲，只用于前后对比。
 *
 * 显存跟踪需要包装 bind* 调用，热路径上有额外函数调用开销，所以默认关闭，
 * 只在单独 tag 的运行里打开，避免污染帧耗时口径。
 */

export function stageProbeScript({ trackMemory = false, maxFrames = 20000 } = {}) {
  return `
(() => {
  if (window.__homeosStageProbe) return;
  const TRACK = ${trackMemory ? 'true' : 'false'};
  const MAX_FRAMES = ${Number(maxFrames) || 20000};
  const now = () => performance.now();
  const probe = window.__homeosStageProbe = {
    uploads: [],
    frames: [],
    contexts: 0,
    gpuBytes: 0,
    peakGpuBytes: 0,
    trackMemory: TRACK,
    drainFrames() { const out = this.frames; this.frames = []; return out; },
    drainUploads() { const out = this.uploads; this.uploads = []; return out; },
  };
  const wrap = (proto, name, after) => {
    const original = proto && proto[name];
    if (typeof original !== "function") return;
    proto[name] = function (...args) {
      const result = original.apply(this, args);
      try { after.call(this, args, result); } catch {}
      return result;
    };
  };
  const protos = [self.WebGLRenderingContext && WebGLRenderingContext.prototype, self.WebGL2RenderingContext && WebGL2RenderingContext.prototype].filter(Boolean);
  const UPLOADS = ["texImage2D", "texSubImage2D", "texImage3D", "texSubImage3D", "compressedTexImage2D", "texStorage2D", "texStorage3D", "generateMipmap"];
  for (const proto of protos) {
    for (const name of UPLOADS) wrap(proto, name, () => { if (probe.uploads.length < 200000) probe.uploads.push({ t: now(), n: name }); });
  }
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const context = getContext.call(this, type, ...rest);
    if (context && /webgl/.test(String(type)) && !this.__homeosProbeCounted) { this.__homeosProbeCounted = true; probe.contexts += 1; }
    return context;
  };

  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (callback) {
    return raf((timestamp) => {
      const start = now();
      try { return callback(timestamp); } finally {
        const work = now() - start;
        const last = probe.frames[probe.frames.length - 1];
        if (last && last.ts === timestamp) last.work += work;
        else {
          if (probe.frames.length >= MAX_FRAMES) probe.frames.shift();
          probe.frames.push({ ts: timestamp, work });
        }
      }
    });
  };

  if (!TRACK) return;
  const INTERNAL = { 0x8058: 4, 0x8c43: 4, 0x8051: 4, 0x881a: 8, 0x8814: 16, 0x881b: 8, 0x8815: 16, 0x8229: 1, 0x822d: 2, 0x822e: 4, 0x822b: 2, 0x822f: 4, 0x8230: 8, 0x81a5: 2, 0x81a6: 4, 0x8cac: 4, 0x88f0: 4, 0x8cad: 8, 0x8c3a: 4, 0x8059: 4, 0x8056: 2, 0x8d62: 2, 0x8057: 2, 0x8d48: 1 };
  const CHANNELS = { 0x1908: 4, 0x1907: 3, 0x190a: 2, 0x1909: 1, 0x1906: 1, 0x1903: 1, 0x8227: 2, 0x1902: 1, 0x84f9: 1 };
  const TYPE_BYTES = { 0x1401: 1, 0x1400: 1, 0x1406: 4, 0x140b: 2, 0x8d61: 2, 0x1403: 2, 0x1402: 2, 0x1405: 4, 0x1404: 4 };
  const PACKED = { 0x84fa: 4, 0x8363: 2, 0x8033: 2, 0x8034: 2, 0x8368: 4, 0x8c3b: 4, 0x8dad: 8 };
  const bytesPerPixel = (internal, format, type) => {
    if (INTERNAL[internal]) return INTERNAL[internal];
    if (PACKED[type]) return PACKED[type];
    return (CHANNELS[format] || 4) * (TYPE_BYTES[type] || 1);
  };
  const states = new WeakMap();
  const stateOf = (gl) => {
    let state = states.get(gl);
    if (!state) states.set(gl, (state = { unit: 0, textures: new Map(), renderbuffer: null, buffers: new Map() }));
    return state;
  };
  const sizes = new Map();
  const recompute = (key, entry) => {
    const previous = sizes.get(key);
    probe.gpuBytes -= previous ? previous.total : 0;
    if (entry) {
      let total = 0;
      for (const value of entry.parts.values()) total += value;
      entry.total = Math.round(total * (entry.mips ? 4 / 3 : 1));
      sizes.set(key, entry);
      probe.gpuBytes += entry.total;
    } else sizes.delete(key);
    probe.peakGpuBytes = Math.max(probe.peakGpuBytes, probe.gpuBytes);
  };
  const boundTexture = (gl, target) => {
    const state = stateOf(gl);
    const cube = target >= 0x8515 && target <= 0x851a;
    return state.textures.get(state.unit + ":" + (cube ? 0x8513 : target));
  };
  const setTexturePart = (gl, target, bytes, mips) => {
    const texture = boundTexture(gl, target);
    if (!texture) return;
    const entry = sizes.get(texture) || { parts: new Map(), mips: false, total: 0 };
    entry.parts.set(target, bytes);
    if (mips) entry.mips = true;
    recompute(texture, entry);
  };
  for (const proto of protos) {
    wrap(proto, "activeTexture", function (args) { stateOf(this).unit = args[0] - 0x84c0; });
    wrap(proto, "bindTexture", function (args) { stateOf(this).textures.set(stateOf(this).unit + ":" + args[0], args[1]); });
    wrap(proto, "bindRenderbuffer", function (args) { stateOf(this).renderbuffer = args[1]; });
    wrap(proto, "bindBuffer", function (args) { stateOf(this).buffers.set(args[0], args[1]); });
    wrap(proto, "texImage2D", function (args) {
      if (args[1] !== 0) return;
      let width, height, format, type;
      if (typeof args[3] === "number" && args.length >= 8) { width = args[3]; height = args[4]; format = args[6]; type = args[7]; }
      else { const source = args[5] || {}; width = source.videoWidth || source.naturalWidth || source.width || 0; height = source.videoHeight || source.naturalHeight || source.height || 0; format = args[3]; type = args[4]; }
      setTexturePart(this, args[0], width * height * bytesPerPixel(args[2], format, type), false);
    });
    wrap(proto, "texImage3D", function (args) {
      if (args[1] !== 0) return;
      setTexturePart(this, args[0], args[3] * args[4] * args[5] * bytesPerPixel(args[2], args[7], args[8]), false);
    });
    wrap(proto, "compressedTexImage2D", function (args) {
      const data = args[6];
      const texture = boundTexture(this, args[0]);
      if (!texture || !data) return;
      const entry = sizes.get(texture) || { parts: new Map(), mips: false, total: 0 };
      entry.parts.set(args[0] + ":" + args[1], data.byteLength || 0);
      recompute(texture, entry);
    });
    wrap(proto, "texStorage2D", function (args) {
      const faces = args[0] === 0x8513 ? 6 : 1;
      setTexturePart(this, args[0], args[3] * args[4] * faces * bytesPerPixel(args[2]), args[1] > 1);
    });
    wrap(proto, "texStorage3D", function (args) {
      setTexturePart(this, args[0], args[3] * args[4] * args[5] * bytesPerPixel(args[2]), args[1] > 1);
    });
    wrap(proto, "generateMipmap", function (args) {
      const texture = boundTexture(this, args[0]);
      const entry = texture && sizes.get(texture);
      if (entry && !entry.mips) { entry.mips = true; recompute(texture, entry); }
    });
    wrap(proto, "deleteTexture", function (args) { if (args[0]) recompute(args[0], null); });
    const storeRenderbuffer = (gl, samples, internal, width, height) => {
      const renderbuffer = stateOf(gl).renderbuffer;
      if (!renderbuffer) return;
      recompute(renderbuffer, { parts: new Map([[0, width * height * bytesPerPixel(internal) * Math.max(1, samples)]]), mips: false, total: 0 });
    };
    wrap(proto, "renderbufferStorage", function (args) { storeRenderbuffer(this, 1, args[1], args[2], args[3]); });
    wrap(proto, "renderbufferStorageMultisample", function (args) { storeRenderbuffer(this, args[1], args[2], args[3], args[4]); });
    wrap(proto, "deleteRenderbuffer", function (args) { if (args[0]) recompute(args[0], null); });
    wrap(proto, "bufferData", function (args) {
      const buffer = stateOf(this).buffers.get(args[0]);
      if (!buffer) return;
      const size = typeof args[1] === "number" ? args[1] : (args[1] && args[1].byteLength) || 0;
      recompute(buffer, { parts: new Map([[0, size]]), mips: false, total: 0 });
    });
    wrap(proto, "deleteBuffer", function (args) { if (args[0]) recompute(args[0], null); });
  }
})();
`
}

const round = (value, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null)

function percentile(sorted, pct) {
  if (!sorted.length) return null
  return sorted[Math.min(sorted.length - 1, Math.round((pct / 100) * (sorted.length - 1)))]
}

/** 帧序列统计：间隔（ts 差）与页面工作量（work）。 */
export function summarizeFrames(frames, { from = -Infinity, to = Infinity } = {}) {
  const window = frames.filter((frame) => frame.ts >= from && frame.ts <= to)
  const intervals = []
  for (let index = 1; index < window.length; index += 1) intervals.push(window[index].ts - window[index - 1].ts)
  const sortedIntervals = [...intervals].sort((a, b) => a - b)
  const works = window.map((frame) => frame.work).sort((a, b) => a - b)
  const mean = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : 0
  const variance = intervals.length
    ? intervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / intervals.length
    : 0
  const spanMs = window.length > 1 ? window[window.length - 1].ts - window[0].ts : 0
  return {
    frames: window.length,
    spanMs: round(spanMs, 0),
    intervalP50Ms: round(percentile(sortedIntervals, 50)),
    intervalP95Ms: round(percentile(sortedIntervals, 95)),
    intervalP99Ms: round(percentile(sortedIntervals, 99)),
    intervalStdMs: round(Math.sqrt(variance)),
    framesOver50Ms: intervals.filter((value) => value > 50).length,
    workP50Ms: round(percentile(works, 50)),
    workP95Ms: round(percentile(works, 95)),
    workMaxMs: round(works.length ? works[works.length - 1] : null),
  }
}

/** 时间窗内的纹理上传次数（按调用名分组）。 */
export function countUploads(uploads, from, to) {
  const byName = {}
  let total = 0
  for (const entry of uploads) {
    if (entry.t < from || entry.t > to) continue
    total += 1
    byName[entry.n] = (byName[entry.n] || 0) + 1
  }
  return { total, byName }
}

/** 长任务按「加载期（presented 之前）/ 交互期」分段。 */
export function summarizeLongTasks(
  longtasks,
  { presentedAt = null, interactionFrom = null, interactionTo = null } = {},
) {
  const pick = (list) => ({
    count: list.length,
    totalMs: round(
      list.reduce((sum, entry) => sum + entry.duration, 0),
      0,
    ),
    maxMs: round(
      list.reduce((max, entry) => Math.max(max, entry.duration), 0),
      0,
    ),
  })
  const load = presentedAt === null ? [] : longtasks.filter((entry) => entry.start <= presentedAt)
  const interaction =
    interactionFrom === null
      ? []
      : longtasks.filter((entry) => entry.start >= interactionFrom && entry.start <= (interactionTo ?? Infinity))
  return { all: pick(longtasks), load: pick(load), interaction: pick(interaction) }
}

/**
 * 在舞台画布上派发一段拖拽（frame.evaluate 内执行）。
 * durationMs <= 400 时等价于旧的 12 步短拖拽；更长时按 16ms 步长做往返正弦轨迹。
 * 返回值里的 startedAt / endedAt 是 iframe 自己的 performance.now()，与探针同一时间基。
 */
export async function dragStageCanvas(frame, durationMs = 360) {
  return frame.evaluate(async (duration) => {
    const canvases = Array.from(document.querySelectorAll('canvas'))
    const canvas =
      canvases.find((item) => {
        const box = item.getBoundingClientRect()
        if (box.width <= 500 || box.height <= 100) return false
        try {
          return !!(item.getContext('webgl2') || item.getContext('webgl'))
        } catch {
          return false
        }
      }) || canvases[canvases.length - 1]
    if (!canvas) return { applied: false, reason: 'no-canvas' }
    const rect = canvas.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return { applied: false, reason: 'zero-size-canvas' }
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const make = (type, clientX, clientY) =>
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX,
        clientY,
      })
    const startedAt = performance.now()
    canvas.dispatchEvent(make('pointerdown', x, y))
    let lastX = x
    let lastY = y
    if (duration <= 400) {
      for (let step = 1; step <= 12; step += 1) {
        lastX = x + step * 8
        lastY = y + step * 2
        canvas.dispatchEvent(make('pointermove', lastX, lastY))
        await new Promise((resolve) => setTimeout(resolve, 30))
      }
    } else {
      const amplitude = Math.min(rect.width, rect.height) * 0.25
      while (performance.now() - startedAt < duration) {
        const phase = ((performance.now() - startedAt) / 2000) * Math.PI * 2
        lastX = x + Math.sin(phase) * amplitude
        lastY = y + Math.sin(phase * 0.5) * amplitude * 0.3
        canvas.dispatchEvent(make('pointermove', lastX, lastY))
        await new Promise((resolve) => setTimeout(resolve, 16))
      }
    }
    canvas.dispatchEvent(make('pointerup', lastX, lastY))
    return {
      applied: true,
      startedAt,
      endedAt: performance.now(),
      canvas: { width: canvas.width, height: canvas.height, rect },
    }
  }, durationMs)
}

/** 读出并清空探针缓冲（frames / uploads），附带当前显存估算。 */
export async function drainStageProbe(frame) {
  return frame.evaluate(() => {
    const probe = window.__homeosStageProbe
    if (!probe) return null
    const canvases = Array.from(document.querySelectorAll('canvas')).map((canvas) => ({
      width: canvas.width,
      height: canvas.height,
      cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight,
    }))
    return {
      frames: probe.drainFrames(),
      uploads: probe.drainUploads(),
      contexts: probe.contexts,
      gpuBytes: probe.trackMemory ? probe.gpuBytes : null,
      peakGpuBytes: probe.trackMemory ? probe.peakGpuBytes : null,
      canvases,
      now: performance.now(),
    }
  })
}

/** 最小二乘斜率（每分钟增量），用于浸泡测试的增长判断。 */
export function slopePerMinute(points) {
  if (points.length < 2) return null
  const n = points.length
  const meanX = points.reduce((sum, point) => sum + point.minute, 0) / n
  const meanY = points.reduce((sum, point) => sum + point.value, 0) / n
  let numerator = 0
  let denominator = 0
  for (const point of points) {
    numerator += (point.minute - meanX) * (point.value - meanY)
    denominator += (point.minute - meanX) ** 2
  }
  return denominator ? numerator / denominator : null
}
