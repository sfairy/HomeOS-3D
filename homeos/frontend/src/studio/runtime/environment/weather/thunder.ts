import { WEATHER_COLOR } from "./colors";
import type { WeatherFrame } from "./frame";

/** 首次放电前等一会儿，避免刚切到雷雨就立刻闪。 */
const FIRST_DELAY_SECONDS = 0.9;
/** 一次放电的总时长（含主闪与回闪）。 */
const FLASH_SECONDS = 0.62;
const MIN_GAP_SECONDS = 1.15;
const MAX_GAP_SECONDS = 2.15;
/** 主闪的衰减系数：越大越「啪」地一下。 */
const PRIMARY_DECAY = 26;
/** 回闪开始时间与强度：主闪之后约 80ms 的一次弱回闪，是真实雷电的关键细节。 */
const RETURN_FLASH_DELAY = 0.08;
const RETURN_FLASH_GAIN = 0.55;
const RETURN_FLASH_DECAY = 24;

const RANDOM = (from: number, to: number) => from + Math.random() * (to - from);

/** 中点位移法：反复在两端点之间插一个偏移中点，得到自然的锯齿。 */
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

/** 一条主干 + 从主干四个点各分出一条支叉。 */
function buildBolts(): number[][][] {
  const originX = RANDOM(0.18, 0.72);
  const trunk = subdivide(
    [originX, -0.035],
    [originX + RANDOM(-0.1, 0.12), RANDOM(0.4, 0.56)],
    0.045,
    5,
  );
  const branches = [7, 14, 21, 28].map((index) => {
    const fork = trunk[index];
    return subdivide(fork, [fork[0] + RANDOM(-0.07, 0.07), fork[1] + RANDOM(0.04, 0.11)], 0.014, 3);
  });
  return [trunk, ...branches];
}

/** 双闪包络：主闪 + 回闪 + 一段缓慢余辉。 */
function flashEnvelope(elapsed: number) {
  const primary = Math.exp(-elapsed * PRIMARY_DECAY);
  const returnFlash =
    elapsed > RETURN_FLASH_DELAY
      ? Math.exp(-(elapsed - RETURN_FLASH_DELAY) * RETURN_FLASH_DECAY) * RETURN_FLASH_GAIN
      : 0;
  const afterglow = Math.exp(-elapsed * 4) * 0.12;
  return Math.min(1, primary + returnFlash + afterglow);
}

function strokeBolt(frame: WeatherFrame, bolt: number[][], lineWidth: number) {
  frame.ctx.lineWidth = lineWidth;
  frame.ctx.beginPath();
  bolt.forEach(([x, y], pointIndex) =>
    pointIndex
      ? frame.ctx.lineTo(x * frame.width, y * frame.height)
      : frame.ctx.moveTo(x * frame.width, y * frame.height),
  );
  frame.ctx.stroke();
}

function drawBolts(frame: WeatherFrame, bolts: number[][][], intensity: number) {
  // 两遍叠加：先宽而暗的外晕，再细而亮的内芯。
  for (let pass = 0; pass < 2; pass++) {
    frame.ctx.globalAlpha = intensity * (pass === 0 ? 0.18 : 0.9);
    frame.ctx.shadowColor = WEATHER_COLOR;
    frame.ctx.shadowBlur = pass === 0 ? 11 : 1;
    bolts.forEach((bolt, boltIndex) =>
      strokeBolt(frame, bolt, (boltIndex === 0 ? 1.35 : 0.55) * (pass === 0 ? 3 : 1)),
    );
  }
}

export function createThunderRenderer() {
  let gapSeconds = FIRST_DELAY_SECONDS;
  let remainingSeconds = 0;
  let intensity = 0;
  let bolts: number[][][] = [];

  function reset() {
    gapSeconds = FIRST_DELAY_SECONDS;
    remainingSeconds = 0;
    intensity = 0;
    bolts = [];
  }

  return {
    /**
     * 每帧**绘制前**调用，返回当前闪光强度（0~1）。
     * 强度要供湿地反光与全屏调色共用，所以不能等画的时候才算。
     */
    advance(frame: WeatherFrame, enabled: boolean) {
      if (!enabled) {
        remainingSeconds = 0;
        intensity = 0;
        return 0;
      }
      gapSeconds -= frame.deltaSeconds;
      if (gapSeconds <= 0) {
        bolts = buildBolts();
        remainingSeconds = FLASH_SECONDS;
        gapSeconds = RANDOM(MIN_GAP_SECONDS, MAX_GAP_SECONDS);
      }
      remainingSeconds = Math.max(0, remainingSeconds - frame.deltaSeconds);
      intensity = remainingSeconds > 0 ? flashEnvelope(1 - remainingSeconds / FLASH_SECONDS) : 0;
      return intensity;
    },
    draw(frame: WeatherFrame) {
      if (intensity <= 0.004 || !bolts.length) return;
      frame.ctx.save();
      frame.ctx.strokeStyle = WEATHER_COLOR;
      frame.ctx.lineJoin = "round";
      frame.ctx.lineCap = "round";
      drawBolts(frame, bolts, intensity);
      frame.ctx.restore();
    },
    reset,
  };
}
