const positiveOr = (candidate: any, fallback: any) =>
  Number.isFinite(Number(candidate)) && Number(candidate) > 0 ? Number(candidate) : fallback;
export function interaction3dPreviewSize(element: any, board: any, boardWidth: any, boardHeight: any) {
  const isFill = element.properties?.layoutMode === "fill",
    sourceSize = isFill ? board?.canvas : element.position,
    width = positiveOr(sourceSize?.width, isFill ? 2778 : 100),
    height = positiveOr(sourceSize?.height, isFill ? 1940 : 100),
    scale = Math.min(positiveOr(boardWidth, 0) / width, positiveOr(boardHeight, 0) / height);
  return {
    width: width * scale,
    height: height * scale,
    aspectRatio: width / height,
  };
}
/**
 * 统一 3D 配置预览的尺寸观察入口：ResizeObserver + rAF 节流，
 * 避免多个编辑器各自裸用 ResizeObserver 在窗口尺寸变化时触发布局抖动 / 警告。
 * 返回句柄的 `disconnect()` 会同时取消挂起的动画帧。
 */
export function observeInteraction3dPreview(
  targetElement: any,
  onResize: () => void,
  view: any = globalThis,
) {
  let animationFrameId: number | null = null;
  let isDisconnected = false;
  const resizeObserver = new view.ResizeObserver(() => {
    if (animationFrameId === null) {
      animationFrameId = view.requestAnimationFrame(() => {
        animationFrameId = null;
        if (!isDisconnected) onResize();
      });
    }
  });
  resizeObserver.observe(targetElement);
  return {
    disconnect() {
      isDisconnected = true;
      resizeObserver.disconnect();
      if (animationFrameId !== null) view.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    },
  };
}
