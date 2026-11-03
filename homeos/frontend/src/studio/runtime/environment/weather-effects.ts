/**
 * 3D 场景的天气特效层：一块盖在舞台上的 2D canvas。
 *
 * 渲染顺序（由远到近，再由近到全屏）：
 * 天空 → 云 → 日月星（含流星）→ 雾 → 地面（湿地 → 积雪 → 水花涟漪）
 * → 风（阵风带 / 风线 / 落叶）→ 雨雪冰雹 → 闪电 → 全屏调色与暗角。
 *
 * 要点：
 * - **按需出帧**：只有当前天气需要动效且页面可见时才起帧循环，暂停时完全不出帧
 *   （`createDemandFrameLoop`），因此「没绑天气实体」的户型不承担任何开销。
 * - **按面积降档**：设备像素比最高 1.5，再按「画布面积不超过 240 万像素」继续压；
 *   运行期还有 `quality` 治理器按实测帧间隔再降一档。
 * - **尊重减弱动效**：`prefers-reduced-motion: reduce` 时只画一帧静态画面，不循环。
 * - **真实地面**：舞台发来的地板四边形在这里下发给地面层，水花因此贴地。
 */
import { createDemandFrameLoop } from "@app/bridge/scene/frame-loop";

import {
  weatherEffectKey,
  weatherWindSpeed,
  type WeatherEffectKey,
} from "@/studio/platform/weather-settings";

import { createCelestialRenderer } from "./weather/celestial";
import { createCloudRenderer } from "./weather/clouds";
import type { WeatherFrame } from "./weather/frame";
import { createFogRenderer } from "./weather/fog";
import { createGradeRenderer } from "./weather/grade";
import { createGroundRenderer } from "./weather/ground";
import { fallbackGroundQuad, type WeatherGroundQuad } from "./weather/ground-quad";
import { createParticlePool, disposeParticlePool } from "./weather/particles";
import { drawPrecipitation } from "./weather/precipitation";
import { WEATHER_EFFECT_PRESETS, type WeatherEffectPreset } from "./weather/presets";
import { createQualityGovernor } from "./weather/quality";
import { createSkyRenderer } from "./weather/sky";
import { createSpriteCache } from "./weather/sprites";
import { createThunderRenderer } from "./weather/thunder";
import { createWindRenderer } from "./weather/wind";

/** 设备像素比上限与「画布总像素」预算。 */
const MAX_DEVICE_PIXEL_RATIO = 1.5;
const CANVAS_PIXEL_BUDGET = 2_400_000;
/** 粒子密度归一化基准面积（像素）与密度上限。 */
const DENSITY_BASE_AREA = 900_000;
const MAX_DENSITY = 1.25;
/** 单帧最大步进（秒）；标签页回前台时不会一次补上几秒的位移。 */
const MAX_STEP_SECONDS = 0.05;
/** 风速归一化基准（m/s）：超过这个值就按满速处理。 */
const WIND_SPEED_BASE = 18;
/** 阵风包络：低频正弦叠一层更慢的正弦，形成「一阵一阵」的呼吸。 */
const GUST_BASE = 0.55;
const GUST_SWING = 0.45;

const WEATHER_CANVAS_CLASS = "i3d-weather-effects";

/** 低频阵风包络（0~1）。 */
function gustAt(elapsedSeconds: number) {
  return GUST_BASE + GUST_SWING * Math.sin(elapsedSeconds * 0.7 + Math.sin(elapsedSeconds * 0.23) * 1.7);
}

/** `?weatherDebug=1` 时把地面四边形描出来，便于现场校准水花落点。 */
function isGroundDebugEnabled(win: Window) {
  return win.location?.search?.includes("weatherDebug=1") === true;
}

function strokeGroundQuad(frame: WeatherFrame) {
  const { ctx, width, height, ground } = frame;
  ctx.save();
  ctx.strokeStyle = "rgba(120,220,255,0.85)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ground.forEach(([u, v], index) =>
    index ? ctx.lineTo(u * width, v * height) : ctx.moveTo(u * width, v * height),
  );
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

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

  const particles = createParticlePool();
  const sprites = createSpriteCache(doc);
  const sky = createSkyRenderer();
  const clouds = createCloudRenderer();
  const celestial = createCelestialRenderer();
  const fog = createFogRenderer(doc);
  const ground = createGroundRenderer();
  const wind = createWindRenderer();
  const thunder = createThunderRenderer();
  const grade = createGradeRenderer();
  const quality = createQualityGovernor();
  const groundDebug = isGroundDebugEnabled(win);

  let reducedMotion = reducedMotionQuery?.matches === true;
  let cssWidth = 1;
  let cssHeight = 1;
  let state: WeatherEffectKey | "" = "";
  let preset: WeatherEffectPreset | null = null;
  let windSpeed = 0;
  let ready = false;
  let disposed = false;
  let lastFrameTimestamp: number | null = null;
  let sizeKey = "";
  let elapsedSeconds = 0;
  /** 舞台投影来的真实地面；没收到过就用兜底透视带，保证预览按钮一点就有效果。 */
  let groundQuad: WeatherGroundQuad = fallbackGroundQuad();

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
    if (ready && preset) render(0);
  }

  /** 画一帧。`deltaSeconds` 为 0 时是「定格重绘」（尺寸变化 / 刚切到静态模式）。 */
  function render(deltaSeconds: number) {
    if (!ctx || !preset) return;
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    const frame: WeatherFrame = {
      ctx,
      width: cssWidth,
      height: cssHeight,
      // 粒子数随画布面积缩放，大屏不至于稀、小屏不至于糊。
      density: Math.min(MAX_DENSITY, Math.sqrt((cssWidth * cssHeight) / DENSITY_BASE_AREA)),
      deltaSeconds,
      elapsedSeconds,
      windSpeed,
      gust: gustAt(elapsedSeconds),
      quality: quality.factor,
      flash: 0,
      reducedMotion,
      ground: groundQuad,
      sprites,
      preset,
      particles,
    };
    // 闪电强度要先算：湿地反光与全屏调色都要用它，不能等画到闪电层才知道。
    frame.flash = thunder.advance(frame, preset.thunder === true);
    sky.draw(frame);
    clouds.draw(frame);
    celestial.draw(frame);
    fog.draw(frame);
    ground.draw(frame);
    wind.draw(frame);
    drawPrecipitation(frame);
    thunder.draw(frame);
    grade.draw(frame);
    if (groundDebug) strokeGroundQuad(frame);
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
    quality.sample(deltaSeconds);
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
    thunder.reset();
    if (ready && preset && ctx) render(0);
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
    update(input: unknown, enabled = true) {
      if (disposed) return;
      const nextState = weatherEffectKey(input);
      const nextWindSpeed = Math.min(1, weatherWindSpeed(input) / WIND_SPEED_BASE);
      const stateChanged = nextState !== state;
      if (stateChanged) {
        // 换天气就重置闪电节奏，否则切到雷雨会立刻补闪一次。
        state = nextState;
        preset = nextState ? WEATHER_EFFECT_PRESETS[nextState] : null;
        thunder.reset();
        celestial.reset();
      }
      windSpeed = nextWindSpeed;
      const wasEnabled = ready;
      ready = enabled === true;
      canvas.hidden = !ready || !state || !ctx;
      canvas.dataset.weather = state;
      if (canvas.hidden) {
        suspend();
        ctx?.clearRect(0, 0, cssWidth, cssHeight);
        return;
      }
      // 只在「换了天气」或「刚从隐藏/禁用回到可见」时定格重绘一帧；
      // 状态风暴里同一天气反复推送不会带来重复清屏 + 重画。
      if (stateChanged || wasEnabled !== ready) render(0);
      resume();
    },
    /**
     * 舞台投影来的真实地面四边形（0~1 归一化）。宿主每次收到 `weather-ground`
     * 就下发一次，地面层据此把水花/涟漪/湿地/积雪贴到真实地板上。
     */
    setGround(quad: WeatherGroundQuad | null) {
      if (disposed) return;
      groundQuad = quad || fallbackGroundQuad();
      // 立刻定格重绘一帧，避免转视角时水面「晚一拍」才贴上去。
      if (ready && preset && ctx) render(0);
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
      disposeParticlePool(particles);
      sprites.clear();
      sky.reset();
      fog.reset();
      thunder.reset();
      grade.reset();
      ground.reset();
      quality.reset();
    },
  };
}
