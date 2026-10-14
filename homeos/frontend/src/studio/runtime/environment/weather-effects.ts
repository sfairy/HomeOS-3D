/**
 * 3D 场景的天气特效层：一块盖在舞台上的 2D canvas，画雨/雪/闪电。
 *
 * 从 0.7.6 `modules/interaction3d/weather-effects.js` 语义重实现。要点：
 * - **按需出帧**：只在下雨/下雪且页面可见时才起帧循环，暂停时完全不出帧
 *   （`createDemandFrameLoop`），因此「没绑天气实体」的户型不承担任何开销。
 * - **按面积降档**：设备像素比最高 1.5，再按「画布面积不超过 240 万像素」继续压，
 *   大屏/高分屏不会把 GPU 拖垮；粒子数也随面积缩放。
 * - **尊重减弱动效**：`prefers-reduced-motion: reduce` 时只画一帧静态画面，不循环。
 * - 闪电只在 `lightning-rainy` 出现，用中点位移法随机生成树状分叉，按 0.48s 衰减。
 */
import { createDemandFrameLoop } from "@app/bridge/scene/frame-loop";

import { weatherEffectState } from "./weather-settings";

/** 单个天气态对应的粒子参数。`thunder` 打开闪电；`snowScale` 放大雪花半径。 */
type WeatherEffectPreset = {
  rain?: number;
  snow?: number;
  snowScale?: number;
  thunder?: boolean;
};

const WEATHER_EFFECT_PRESETS: Readonly<Record<string, WeatherEffectPreset>> = Object.freeze({
  rainy: { rain: 0.72 },
  snowy: { snow: 0.7, snowScale: 1.08 },
  "lightning-rainy": { rain: 1.1, thunder: true },
  "snowy-rainy": { rain: 0.65, snow: 0.75, snowScale: 1.05 },
});

/** 粒子池上限：雨滴 600、雪花 520；两种天气同时出现时也共用这一池。 */
const RAIN_PARTICLES = 600;
const SNOW_PARTICLES = 520;

/** 设备像素比上限与「画布总像素」预算。 */
const MAX_DEVICE_PIXEL_RATIO = 1.5;
const CANVAS_PIXEL_BUDGET = 2_400_000;
/** 粒子密度归一化基准面积（像素）与密度上限。 */
const DENSITY_BASE_AREA = 900_000;
const MAX_DENSITY = 1.25;
/** 单帧最大步进（秒）；标签页回前台时不会一次补上几秒的位移。 */
const MAX_STEP_SECONDS = 0.05;

const WEATHER_CANVAS_CLASS = "i3d-weather-effects";
/** 雨雪与闪电共用的暖白色。 */
const WEATHER_COLOR = "#fff6dd";
const WEATHER_COLOR_RGB_PREFIX = "rgba(255,246,221,";
const WEATHER_COLOR_RGB_SOFT = "rgba(255,246,221,.75)";
const WEATHER_COLOR_RGB_CLEAR = "rgba(255,246,221,0)";

/** 闪电参数：首次出现前等 0.9s，每次放电闪 0.48s，随后间隔 1.15~2.15s。 */
const THUNDER_FIRST_DELAY_SECONDS = 0.9;
const THUNDER_FLASH_SECONDS = 0.48;
const THUNDER_MIN_GAP_SECONDS = 1.15;
const THUNDER_MAX_GAP_SECONDS = 2.15;
/** 闪电亮度归一化窗口：闪后 0.34s 内线性衰减。 */
const THUNDER_DECAY_SECONDS = 0.34;

const RANDOM = (from: number, to: number) => from + Math.random() * (to - from);

/**
 * 挂在舞台容器上，画一层天气特效。
 *
 * @param host 舞台容器（通常是 3D 视口元素），canvas 会被 append 进去。
 */
export function createWeatherEffects(host: any) {
  const doc = host.ownerDocument || document;
  const win = doc.defaultView || window;
  const canvas = doc.createElement("canvas");
  canvas.className = WEATHER_CANVAS_CLASS;
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "2",
  });
  canvas.hidden = true;
  host.append(canvas);
  const ctx = canvas.getContext("2d");
  const reducedMotionQuery = win.matchMedia?.("(prefers-reduced-motion: reduce)");

  let reducedMotion = reducedMotionQuery?.matches === true;
  let cssWidth = 1;
  let cssHeight = 1;
  let state = "";
  let ready = false;
  let disposed = false;
  let lastFrameTimestamp: number | null = null;
  let sizeKey = "";
  let elapsedSeconds = 0;
  let thunderGapSeconds = THUNDER_FIRST_DELAY_SECONDS;
  let thunderFlash = 0;
  let thunderBolts: number[][][] = [];

  // 粒子池：前半雨滴、后半雪花，位置用 0~1 归一化，尺寸随 z 拉开层次。
  const particles: any[] = Array.from({ length: RAIN_PARTICLES + SNOW_PARTICLES }, () => ({
    x: Math.random(),
    y: Math.random(),
    z: RANDOM(0.25, 1),
    seed: RANDOM(0, Math.PI * 2),
    size: RANDOM(0.8, 3.1),
  }));

  /** 停帧：清掉待处理的 rAF/定时器，并让下一帧重新按 0 步进起算。 */
  function suspend() {
    loop.setAvailable(false);
    lastFrameTimestamp = null;
  }

  /** 起帧：只在「已启用 + 有天气态 + 画布可用 + 页面可见 + 未减弱动效」时才真的出帧。 */
  function resume() {
    if (disposed || !ctx || !ready || !state || doc.hidden || reducedMotion) return;
    loop.setAvailable(true);
    loop.wake();
  }

  /** 按容器尺寸与面积预算确定 backing store 大小与 dpr。 */
  function measure() {
    if (disposed || !ctx) return;
    const rect = host.getBoundingClientRect();
    cssWidth = Math.max(1, rect.width);
    cssHeight = Math.max(1, rect.height);
    const dpr = Math.min(
      win.devicePixelRatio || 1,
      MAX_DEVICE_PIXEL_RATIO,
      Math.sqrt(CANVAS_PIXEL_BUDGET / (cssWidth * cssHeight)),
    );
    const nextSizeKey = `${cssWidth}:${cssHeight}:${dpr}`;
    if (nextSizeKey === sizeKey) return;
    sizeKey = nextSizeKey;
    canvas.width = Math.ceil(cssWidth * dpr);
    canvas.height = Math.ceil(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (ready && state) render(0);
  }

  /** 中点位移法生成一条闪电主干，再从主干上取 4 个点各分出一条支叉。 */
  function buildThunderBolts() {
    function subdivide(from: number[], to: number[], spread: number, depth: number): number[][] {
      if (!depth) return [from, to];
      const mid = [
        (from[0] + to[0]) / 2 + RANDOM(-spread, spread),
        (from[1] + to[1]) / 2 + RANDOM(-spread * 0.2, spread * 0.2),
      ];
      return [
        ...subdivide(from, mid, spread * 0.48, depth - 1).slice(0, -1),
        ...subdivide(mid, to, spread * 0.48, depth - 1),
      ];
    }

    const originX = RANDOM(0.18, 0.72);
    const trunk = subdivide(
      [originX, -0.035],
      [originX + RANDOM(-0.1, 0.12), RANDOM(0.4, 0.56)],
      0.045,
      5,
    );
    const branches = [7, 14, 21, 28].map((index) => {
      const fork = trunk[index];
      return subdivide(
        fork,
        [fork[0] + RANDOM(-0.07, 0.07), fork[1] + RANDOM(0.04, 0.11)],
        0.014,
        3,
      );
    });
    thunderBolts = [trunk, ...branches];
  }

  /**
   * 画闪电。返回前先推进闪电计时：到点就放电（重排主干 + 点亮 flash），
   * 未到点则什么都不画 —— 所以这个函数每帧都要调用，不能只在闪光期内调。
   */
  function drawThunder(deltaSeconds: number) {
    if (!WEATHER_EFFECT_PRESETS[state]?.thunder || reducedMotion) return;
    thunderGapSeconds -= deltaSeconds;
    if (thunderGapSeconds <= 0) {
      buildThunderBolts();
      thunderFlash = THUNDER_FLASH_SECONDS;
      thunderGapSeconds = RANDOM(THUNDER_MIN_GAP_SECONDS, THUNDER_MAX_GAP_SECONDS);
    }
    thunderFlash = Math.max(0, thunderFlash - deltaSeconds);
    if (!thunderFlash) return;

    const intensity = Math.pow(
      Math.min(1, thunderFlash / THUNDER_DECAY_SECONDS),
      1.25,
    );
    const originX = thunderBolts[0][0][0];
    ctx.save();
    // 放电瞬间的天空泛白：从落点上方扩散出去的径向渐变。
    const skyGlow = ctx.createRadialGradient(
      originX * cssWidth,
      0,
      0,
      originX * cssWidth,
      0,
      cssWidth * 0.32,
    );
    skyGlow.addColorStop(0, `${WEATHER_COLOR_RGB_PREFIX}${intensity * 0.16})`);
    skyGlow.addColorStop(1, WEATHER_COLOR_RGB_CLEAR);
    ctx.fillStyle = skyGlow;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.strokeStyle = WEATHER_COLOR;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    // 两遍叠加：先宽而暗的外晕，再细而亮的内芯。
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalAlpha = intensity * (pass === 0 ? 0.18 : 0.9);
      ctx.shadowColor = WEATHER_COLOR;
      ctx.shadowBlur = pass === 0 ? 11 : 1;
      thunderBolts.forEach((bolt, boltIndex) => {
        ctx.lineWidth = (boltIndex === 0 ? 1.35 : 0.55) * (pass === 0 ? 3 : 1);
        ctx.beginPath();
        bolt.forEach(([x, y], pointIndex) =>
          pointIndex ? ctx.lineTo(x * cssWidth, y * cssHeight) : ctx.moveTo(x * cssWidth, y * cssHeight),
        );
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  /** 画一帧。`deltaSeconds` 为 0 时是「定格重绘」（尺寸变化 / 刚切到静态模式）。 */
  function render(deltaSeconds: number) {
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    const preset = WEATHER_EFFECT_PRESETS[state];
    if (!preset) return;
    // 粒子数随画布面积缩放，大屏不至于稀、小屏不至于糊。
    const density = Math.min(
      MAX_DENSITY,
      Math.sqrt((cssWidth * cssHeight) / DENSITY_BASE_AREA),
    );
    const rainCount = Math.min(RAIN_PARTICLES, Math.floor((preset.rain || 0) * 320 * density));
    const snowCount = Math.min(SNOW_PARTICLES, Math.floor((preset.snow || 0) * 300 * density));
    ctx.save();
    ctx.strokeStyle = WEATHER_COLOR;
    ctx.fillStyle = WEATHER_COLOR;
    for (let index = 0; index < rainCount; index++) {
      const drop = particles[index];
      // 斜向落下的雨丝：y 走速度，x 不变，长度随 z 拉开景深。
      drop.y += deltaSeconds * (0.52 + drop.z * 0.65);
      if (drop.y > 1.05) {
        drop.y = -0.05;
        drop.x = Math.random();
      }
      const streak = (12 + drop.z * 28) * (state === "snowy-rainy" ? 0.9 : 1);
      ctx.globalAlpha = 0.1 + drop.z * 0.27;
      ctx.lineWidth = 0.4 + drop.z * 0.9;
      ctx.beginPath();
      ctx.moveTo(drop.x * cssWidth, drop.y * cssHeight);
      ctx.lineTo(drop.x * cssWidth, drop.y * cssHeight - streak);
      ctx.stroke();
    }
    for (let index = 0; index < snowCount; index++) {
      const flake = particles[RAIN_PARTICLES + index];
      // 雪花边落边左右飘，飘的相位由 seed 固定，同一片雪花不会跳相。
      flake.y += deltaSeconds * (0.035 + flake.z * 0.085);
      flake.x += deltaSeconds * flake.z * Math.sin(elapsedSeconds * 0.8 + flake.seed) * 0.025;
      if (flake.y > 1.03) {
        flake.y = -0.03;
        flake.x = Math.random();
      }
      flake.x = (flake.x + 1.1) % 1.1;
      const centerX = flake.x * cssWidth;
      const centerY = flake.y * cssHeight;
      const radius = flake.size * flake.z * (preset.snowScale || 1);
      ctx.globalAlpha = 0.2 + flake.z * 0.45;
      if (flake.z > 0.86) {
        // 最靠近镜头的雪花画成柔光斑，避免大片硬边圆点。
        const halo = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 3.6);
        halo.addColorStop(0, WEATHER_COLOR_RGB_SOFT);
        halo.addColorStop(1, WEATHER_COLOR_RGB_CLEAR);
        ctx.fillStyle = halo;
        ctx.fillRect(centerX - radius * 4, centerY - radius * 4, radius * 8, radius * 8);
        ctx.fillStyle = WEATHER_COLOR;
      } else {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    drawThunder(deltaSeconds);
  }

  /** 帧回调：返回 0 表示继续按 rAF 出帧。不满足条件时返回 Infinity 停帧。 */
  function step(frameTimestamp: number) {
    if (disposed || !ready || !state || doc.hidden || reducedMotion) return Infinity;
    const deltaSeconds =
      lastFrameTimestamp === null
        ? 0
        : Math.min(MAX_STEP_SECONDS, (frameTimestamp - lastFrameTimestamp) / 1000);
    lastFrameTimestamp = frameTimestamp;
    elapsedSeconds += deltaSeconds;
    render(deltaSeconds);
    return 0;
  }

  const loop = createDemandFrameLoop({
    step,
    maxFps: 60,
    requestFrame: (callback: any) => win.requestAnimationFrame(callback),
    cancelFrame: (handle: any) => win.cancelAnimationFrame(handle),
  });
  loop.setAvailable(false);

  /** 后台标签页不出帧；回到前台再决定是否恢复。 */
  function onVisibilityChange() {
    suspend();
    if (!doc.hidden) resume();
  }

  /** 系统动效偏好变了：停帧、清掉闪电，再按新偏好定格重绘一帧。 */
  function onReducedMotionChange(event: any) {
    reducedMotion = event.matches === true;
    suspend();
    thunderFlash = 0;
    if (ready && state && ctx) render(0);
    resume();
  }

  const resizeObserver = new win.ResizeObserver(measure);
  resizeObserver.observe(host);
  measure();
  doc.addEventListener("visibilitychange", onVisibilityChange);
  reducedMotionQuery?.addEventListener?.("change", onReducedMotionChange);

  return {
    /**
     * 同步天气态与启用状态。
     *
     * @param input HA 状态对象/事件载荷，或预览用的 `{ state }`。
     * @param enabled 场景未授权/未就绪时传 false，画布会立刻隐藏并停帧。
     */
    update(input: any, enabled = true) {
      if (disposed) return;
      const nextState = weatherEffectState(input);
      if (nextState !== state) {
        // 换天气就重置闪电节奏，否则切到雷雨会立刻补闪一次。
        state = nextState;
        thunderGapSeconds = THUNDER_FIRST_DELAY_SECONDS;
        thunderFlash = 0;
        thunderBolts = [];
      }
      const wasEnabled = ready;
      ready = enabled === true;
      canvas.hidden = !ready || !state || !ctx;
      canvas.dataset.weather = state;
      if (canvas.hidden) {
        suspend();
        ctx?.clearRect(0, 0, cssWidth, cssHeight);
        return;
      }
      if (wasEnabled !== ready || reducedMotion) render(0);
      resume();
    },
    resize: measure,
    dispose() {
      if (disposed) return;
      suspend();
      loop.dispose();
      disposed = true;
      resizeObserver.disconnect();
      doc.removeEventListener("visibilitychange", onVisibilityChange);
      reducedMotionQuery?.removeEventListener?.("change", onReducedMotionChange);
      canvas.remove();
      particles.length = 0;
      thunderBolts = [];
    },
  };
}
