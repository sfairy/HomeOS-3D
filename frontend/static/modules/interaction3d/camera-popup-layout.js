/**
 * 摄像头弹窗（camera popup）的尺寸与位置计算。
 *
 * 位置：舞台页在打开摄像头预览面板前调用，结果直接写进面板的宽高与 top 偏移。
 * 对外导出：cameraPreviewRatio、cameraPopupLayout。
 * 全局约定：媒体宽高比按摄像头 ID 缓存，因为面板必须在视频 metadata 到达之前
 *   就完成布局，用上一次已知比例可避免首次打开时闪一下 16:9 的错误高度。
 * 副作用：模块级 Map 会随摄像头数量增长，但每个摄像头只存一个数字，不做清理。
 */

// 摄像头 ID → 最近一次观测到的媒体宽高比，用于首帧布局，避免尺寸跳变。
const previewRatiosByCameraId = new Map();
/**
 * 记录并读取指定摄像头的媒体宽高比。
 *
 * 传入合法比例时先写入缓存再返回，因此调用方可以用同一次调用来「上报 + 查询」；
 * 尚未观测过的摄像头返回 16:9 这一摄像头通用的默认取景比例。
 *
 * @param {string} cameraId 摄像头实体 ID。
 * @param {number} [aspectRatio] 本次观测到的宽高比；非法值不会污染缓存。
 * @returns {number} 该摄像头当前的宽高比。
 */
export function cameraPreviewRatio(cameraId, aspectRatio) {
  if (Number.isFinite(aspectRatio) && aspectRatio > 0) {
    previewRatiosByCameraId.set(cameraId, aspectRatio);
  }
  return previewRatiosByCameraId.get(cameraId) || 16 / 9;
}
/**
 * 计算摄像头弹窗面板的尺寸与纵向位置。
 *
 * 数值全部由容器尺寸推导，目的是让面板在任意屏幕上都落在「不遮挡主画面上半部」的区域内：
 * 单个面板不超过容器高度的一半，横向不超过容器宽度的 30%，两个面板并排时还要留出间距。
 *
 * @param {number} containerWidth 舞台容器宽度（px）。
 * @param {number} containerHeight 舞台容器高度（px）。
 * @param {number} [mediaAspectRatio] 媒体宽高比，默认 16:9；通常来自 cameraPreviewRatio 的缓存。
 * @param {number} [chromeHeight] 面板自身控件条高度（px），默认 58。
 * @returns {{panelWidth: number, mediaHeight: number, panelHeight: number, top: number}}
 *   面板宽、媒体区高、面板总高与距容器顶部的偏移。
 */
export function cameraPopupLayout(
  containerWidth,
  containerHeight,
  mediaAspectRatio = 16 / 9,
  chromeHeight = 58
) {
  // 媒体区最多占容器高度的一半，再扣掉上下留白（24 / 26）与控件条，得到可用高度。
  const maxPanelHeight = Math.max(1, (containerHeight - 24) / 2 - 26 - chromeHeight);
  // 27 是面板边框加内边距的最小宽度，低于它内部布局会溢出；
  // 其余三个上限分别是：不超过容器宽度的 30%、两面板并排时各占一半（减 32 为间隙）、
  // 以及在满足高度上限的前提下宽度最大能放到多少。
  const panelWidth = Math.max(
    27,
    Math.min(
      containerWidth * 0.3,
      (containerWidth - 32) / 2,
      maxPanelHeight * mediaAspectRatio + 26
    )
  );
  // 面板扣掉左右各 13px 的内边距后才是媒体区的净宽，再由宽高比反推媒体区高度。
  const mediaHeight = (panelWidth - 26) / mediaAspectRatio;
  const panelHeight = 26 + chromeHeight + mediaHeight;
  // 纵向位置取「容器 56% 处居中对齐」与「底部能放下两层面板」两个约束得到的区间内最靠上的值。
  const top = Math.max(
    12,
    Math.min(containerHeight * 0.56 - panelHeight, containerHeight - panelHeight * 2 - 12)
  );
  return {
    panelWidth: panelWidth,
    mediaHeight: mediaHeight,
    panelHeight: panelHeight,
    top: top
  };
}
