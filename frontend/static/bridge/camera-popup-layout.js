/**
 * 摄像头弹窗（camera popup）的尺寸与位置计算。
 *
 * 舞台页打开摄像头预览面板前调用，结果写进面板宽高与 top 偏移。对外导出 cameraPreviewRatio、
 * cameraPopupLayout。媒体宽高比按摄像头 ID 缓存：面板必须在视频 metadata 到达前完成布局，用
 * 上一次已知比例可避免首次打开时闪一下 16:9 的错误高度。
 */

// 摄像头 ID → 最近一次观测到的媒体宽高比，用于首帧布局，避免尺寸跳变。
const previewRatiosByCameraId = new Map();
/**
 * 记录并读取指定摄像头的媒体宽高比：传入合法比例时先写缓存再返回，同一次调用即「上报 + 查询」；
 * 未观测过的摄像头返回 16:9 这一通用默认取景比例。
 */
export function cameraPreviewRatio(cameraId, aspectRatio) {
  if (Number.isFinite(aspectRatio) && aspectRatio > 0) {
    previewRatiosByCameraId.set(cameraId, aspectRatio);
  }
  return previewRatiosByCameraId.get(cameraId) || 16 / 9;
}
/**
 * 计算摄像头弹窗面板的尺寸与纵向位置。
 * 数值全部由容器尺寸推导，让面板在任意屏幕上都不遮挡主画面上半部：单面板不超过容器高度的一半、
 * 横向不超过宽度的 30%，并排时留间距。
 */
export function cameraPopupLayout(
  containerWidth,
  containerHeight,
  mediaAspectRatio = 16 / 9,
  chromeHeight = 58
) {
  // 媒体区最多占容器高度的一半，再扣掉上下留白（24 / 26）与控件条，得到可用高度。
  const maxPanelHeight = Math.max(1, (containerHeight - 24) / 2 - 26 - chromeHeight);
  // 27 是面板边框加内边距的最小宽度，低于它会溢出；上限为容器宽度 30%、并排时各占一半（减 32 间隙），以及满足高度上限下的最大宽度。
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
