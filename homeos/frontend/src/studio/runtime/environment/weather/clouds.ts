/**
 * 云层。
 *
 * 分两种形态，这是「白云不是到处都有」的关键：
 * - **puff（团云）**：只有晴 / 晴间多云 / 大风 才画，几朵清晰的白云飘在蓝天里。
 * - **ceiling（云幕）**：阴 / 雨 / 雪 / 雷暴 用一整条压暗的灰蓝色带，不画白色团块——
 *   阴雨天的天空是「没有层次的一片灰」，硬画白团会像晴天漏了云进来。
 *
 * 两种形态都受 `overlay-caps` 的不透明度与高度上限约束：云可以看得见，
 * 但不能把下面的户型、家具与设备状态压住。
 */
import type { WeatherFrame } from "./frame";
import { CLOUD_MAX_ALPHA, CLOUD_MAX_CENTER, clampAlpha } from "./overlay-caps";
import type { WeatherCloudCoverage } from "./presets";

type CloudShape = "none" | "puff" | "ceiling";

type CloudTone = {
  shape: CloudShape;
  /** 云体颜色 `r,g,b`。 */
  rgb: string;
  /** 云体浓淡；最终还会被 `CLOUD_MAX_ALPHA` 压一道。 */
  alpha: number;
  /** 团云朵数。 */
  count: number;
  /** 每秒横向漂移（画面宽度比例）。 */
  speed: number;
  /** 云层中心最多下探到画面高度的比例。 */
  ceiling: number;
};

const CLOUD_TONES: Readonly<Record<WeatherCloudCoverage, CloudTone>> = Object.freeze({
  none: { shape: "none", rgb: "0,0,0", alpha: 0, count: 0, speed: 0, ceiling: 0 },
  // 晴 / 晴间多云：真正意义上的「白云」。
  light: { shape: "puff", rgb: "252,254,255", alpha: 0.72, count: 3, speed: 0.005, ceiling: 0.16 },
  // 多云：仍是团云，但被遮住的太阳让它偏灰一点、低一点。
  broken: { shape: "puff", rgb: "234,240,248", alpha: 0.58, count: 4, speed: 0.009, ceiling: 0.18 },
  // 阴：没有白团，只有一条压下来的灰幕。
  overcast: { shape: "ceiling", rgb: "150,160,174", alpha: 0.3, count: 0, speed: 0.008, ceiling: 0.2 },
  // 雷暴：更低更脏的青灰。
  storm: { shape: "ceiling", rgb: "74,82,102", alpha: 0.32, count: 0, speed: 0.014, ceiling: 0.22 },
});

function drawPuffs(frame: WeatherFrame, tone: CloudTone, raster: HTMLCanvasElement, density: number) {
  const { ctx, width, height } = frame;
  const count = Math.max(2, Math.round(tone.count * (0.62 + density * 0.38) * frame.quality));
  const ceiling = Math.min(CLOUD_MAX_CENTER, tone.ceiling);
  const baseAlpha = clampAlpha(tone.alpha * (0.7 + density * 0.3), CLOUD_MAX_ALPHA);
  for (let index = 0; index < count; index++) {
    // depth 决定云团大小与漂移速度：近云大而快，远云小而慢，形成视差。
    const depth = 0.45 + ((index * 0.37) % 1) * 0.55;
    const cloudWidth = width * (0.2 + depth * 0.18);
    const cloudHeight = cloudWidth * 0.5625;
    const drift =
      ((frame.elapsedSeconds * tone.speed * (0.5 + depth) + index * 0.41) % 1.35) - 0.18;
    // 贴图里的云体在纵向 ~0.65 处，所以按「云心」定位，别让云压到地平线以下。
    const centerY = height * (0.03 + ((index * 0.29) % 1) * ceiling * 0.6);
    ctx.globalAlpha = baseAlpha * (0.55 + depth * 0.45);
    ctx.drawImage(
      raster,
      drift * width - cloudWidth / 2,
      centerY - cloudHeight * 0.6,
      cloudWidth,
      cloudHeight,
    );
  }
}

/** 云幕：顶部一整条压暗的灰带，向下淡出；不出任何白色团块。 */
function drawCeiling(frame: WeatherFrame, tone: CloudTone, density: number) {
  const { ctx, width, height } = frame;
  const bandHeight = height * Math.min(CLOUD_MAX_CENTER * 1.6, tone.ceiling * 1.5);
  const alpha = clampAlpha(tone.alpha * (0.75 + density * 0.25), CLOUD_MAX_ALPHA);
  // 云幕本身几乎不动，只做极缓慢的左右呼吸，避免「死了」的观感。
  const sway = Math.sin(frame.elapsedSeconds * 0.06) * width * 0.02;
  const band = ctx.createLinearGradient(0, 0, 0, bandHeight);
  band.addColorStop(0, `rgba(${tone.rgb},${alpha})`);
  band.addColorStop(0.55, `rgba(${tone.rgb},${alpha * 0.55})`);
  band.addColorStop(1, `rgba(${tone.rgb},0)`);
  ctx.fillStyle = band;
  ctx.fillRect(sway - 4, 0, width + 8, bandHeight);
}

export function createCloudRenderer() {
  function draw(frame: WeatherFrame) {
    const coverage = frame.preset.clouds || "none";
    const tone = CLOUD_TONES[coverage];
    const density = Math.min(1, frame.preset.cloudDensity ?? 1);
    if (tone.shape === "none" || density <= 0) return;
    const { ctx } = frame;
    ctx.save();
    if (tone.shape === "puff") {
      const raster = frame.sprites.cloudSprite(coverage, tone.rgb);
      if (raster) drawPuffs(frame, tone, raster, density);
    } else {
      drawCeiling(frame, tone, density);
    }
    ctx.restore();
  }

  return { draw, reset() {} };
}
