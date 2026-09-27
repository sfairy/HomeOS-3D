/**
 * 摄像头弹窗（camera popup）的尺寸与位置计算。
 */

const previewRatiosByCameraId = new Map();
/**
 * 记录并读取指定摄像头的媒体宽高比：传入合法比例时先写缓存再返回，同一次调用即「上报 + 查询」；
 */
export function cameraPreviewRatio(cameraId, aspectRatio) {
  if (Number.isFinite(aspectRatio) && aspectRatio > 0) {
    previewRatiosByCameraId.set(cameraId, aspectRatio);
  }
  return previewRatiosByCameraId.get(cameraId) || 16 / 9;
}
/**
 * 计算摄像头弹窗面板的尺寸与纵向位置。
 */
export function cameraPopupLayout(
  containerWidth,
  containerHeight,
  mediaAspectRatio = 16 / 9,
  chromeHeight = 58
) {
  // 媒体区最多占容器高度的一半，再扣掉上下留白（24 / 26）与控件条，得到可用高度。
  const maxPanelHeight = Math.max(1, (containerHeight - 24) / 2 - 26 - chromeHeight);
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
