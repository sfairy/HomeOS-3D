/**
 * 「设备上报位置 → 3D 平滑跟随」的共用曲线（上游 0.8.1 `reported-motion.js`）。
 *
 * 0.8.0 里每个动画模块各自用 `(from + (to - from) * progress)` 线性插值，
 * 于是上报间隔抖动会直接变成速度抖动（晾衣架/窗帘看上去一顿一顿）。
 * 0.8.1 把三件事抽出来共用：
 *
 * 1. `motionPosition`：带 `tangent` 的三次曲线，按前后两段的斜率修正加速/减速；
 * 2. `reportedMotion`：用最近 3 个上报样本估速度，按「剩余距离 / 速度」重算时长；
 * 3. `reportInterval`：上报间隔的指数平滑，避免单次抖动被当成真实速度。
 *
 * 纯函数，不依赖 THREE，也不读时钟。
 */

export interface MotionCurve {
  from: number;
  to: number;
  start: number;
  duration: number;
  /** 0–2：0 从静止起步，1 匀速，2 追赶快结束时收尾。缺省按线性处理。 */
  tangent?: number;
}

export interface MotionSample {
  time: number;
  position: number;
}

/** 同一模型跨帧保留的速度估计与样本窗口。 */
export interface MotionReports {
  samples?: MotionSample[];
  speed?: number;
}

const SAMPLE_WINDOW = 3;
const MAX_SAMPLE_GAP_MS = 5000;
const MIN_DURATION_MS = 120;
const MAX_DURATION_MS = 5500;

/** 曲线在某时刻的位置（0–100 的百分比空间）。 */
export function motionPosition(motion: MotionCurve, timestamp: number) {
  const progress = Math.max(0, Math.min(1, (timestamp - motion.start) / motion.duration)),
    tangent = motion.tangent,
    eased =
      tangent === undefined
        ? progress
        : progress * (tangent + progress * (2 - 2 * tangent + progress * (tangent - 1)));
  return motion.from + (motion.to - motion.from) * eased;
}

/** 参考曲线在某时刻的速度（百分比 / 毫秒）。 */
function motionVelocity(motion: MotionCurve | null | undefined, timestamp: number) {
  if (!motion || timestamp >= motion.start + motion.duration) return 0;
  const progress = Math.max(0, (timestamp - motion.start) / motion.duration),
    tangent = motion.tangent === undefined ? 1 : motion.tangent,
    slope =
      tangent + progress * (4 - 4 * tangent + progress * (3 * tangent - 3));
  return ((motion.to - motion.from) / motion.duration) * slope;
}

/**
 * 根据上报序列构造下一条运动曲线。
 *
 * - `reports` 由调用方按模型持有，跨帧复用；为 `null` 时退化成纯曲线（不做速度估算）。
 * - 返回 `null` 表示位置没变，不需要动画。
 */
export function reportedMotion(
  from: number,
  to: number,
  timestamp: number,
  duration: number,
  reference: MotionCurve | null | undefined,
  reports?: MotionReports | null,
): MotionCurve | null {
  let estimatedDuration = duration;
  if (reports) {
    const direction = Math.sign(to - from);
    reports.samples ??= [];
    const latest = reports.samples.at(-1),
      gapMs = latest ? timestamp - latest.time : 0;
    // 方向翻转、时间倒流、间隔过长（设备掉线后重连）都要清空窗口：
    // 这几种情况下旧样本算出来的速度一定是错的，会把跟随动画拉成几秒。
    if (
      (!latest || !direction || gapMs <= 0 || gapMs > MAX_SAMPLE_GAP_MS ||
        Math.sign(to - latest.position) !== direction) &&
      ((reports.samples = []), (reports.speed = 0)),
      reports.samples.push({ time: timestamp, position: to }),
      reports.samples.length > SAMPLE_WINDOW && reports.samples.shift(),
      reports.samples.length > 1
    ) {
      const oldest = reports.samples[0],
        windowMs = estimatedDuration / 1.15,
        sampleSpeed = Math.abs((to - oldest.position) / (timestamp - oldest.time)),
        smoothing = 1 - Math.exp(-gapMs / Math.max(700, windowMs));
      reports.speed = reports.speed
        ? reports.speed + (sampleSpeed - reports.speed) * smoothing
        : sampleSpeed;
      // 用「剩余距离 ÷ 估计速度」重算时长，再夹在 120–5500ms：
      // 快到头时自然收尾，慢速起步时不会先冲一下再停。
      const remaining = Math.abs(to - from),
        speed = reports.speed,
        correction = (remaining - speed * windowMs * 1.25) / Math.max(1500, windowMs * 8),
        correctedSpeed = Math.max(speed * 0.6, Math.min(speed * 1.4, speed + correction));
      correctedSpeed > 0 &&
        (estimatedDuration = Math.max(
          MIN_DURATION_MS,
          Math.min(MAX_DURATION_MS, remaining / correctedSpeed),
        ));
    }
  }
  if (from === to) return null;
  const averageRate = (to - from) / estimatedDuration,
    tangent = Math.max(
      0,
      Math.min(2, motionVelocity(reference, timestamp) / averageRate),
    );
  return {
    from,
    to,
    start: timestamp,
    duration: estimatedDuration,
    tangent,
  };
}

/** 上报间隔平滑：非法间隔退回 `fallback`，合法间隔保留 30% 旧值。 */
export function reportInterval(gapMs: number, fallback = 500) {
  if (!(gapMs > 0 && gapMs <= MAX_SAMPLE_GAP_MS)) return fallback;
  const clampedGap = Math.max(80, gapMs);
  return Math.max(clampedGap, fallback * 0.7 + clampedGap * 0.3);
}
