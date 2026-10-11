/**
 * 同步 input[type=range] 的进度 CSS 变量，使轨道填充与拇指位置一致。
 * WebKit 下 studio / 全局 range 样式都靠这些变量画「左侧填充、右侧灰槽」。
 */
export function syncHtmlRangeProgress(input: HTMLInputElement | null | undefined) {
  if (!input) return "0%";
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const span = max - min;
  const pct =
    !Number.isFinite(value) || !Number.isFinite(span) || span === 0
      ? 0
      : Math.max(0, Math.min(100, ((value - min) / span) * 100));
  return applyRangeProgressCss(input, pct + "%");
}

/** 写入灯光 / 窗帘 / 全局 range 共用的进度变量（窗帘另写 --hb-cover-position-progress）。 */
export function applyRangeProgressCss(
  input: HTMLInputElement | null | undefined,
  progressCss: string,
) {
  if (!input) return "0%";
  const css = progressCss.endsWith("%") ? progressCss : `${progressCss}%`;
  input.style.setProperty("--hb-light-slider-progress", css);
  input.style.setProperty("--hb-cover-position-progress", css);
  input.style.setProperty("--progress-pct", css);
  input.style.setProperty("--progress", css);
  input.style.setProperty("--range-progress", css);
  return css;
}
