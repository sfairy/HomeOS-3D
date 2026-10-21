/**
 * 画布纹理的「按样式懒生成 + 进程内缓存」。
 *
 * 壁画（`createMuralArtTexture`）与饰面墙（`createFeatureWallTexture`）原本各写一份完全
 * 同构的流程：查缓存 → 建 canvas → 取 2d 上下文（失败返回 null）→ 调绘制函数 →
 * `new CanvasTexture` → 设色彩空间/各向异性/needsUpdate → 回填缓存。差异只有尺寸、
 * 样式归一化函数与绘制函数，因此收口到这里。
 *
 * 行为等价：调用顺序、失败分支（拿不到 2d 上下文时返回 null 且**不写缓存**）、
 * 各向异性取 `min(maxAnisotropy || 1, 8)` 与写缓存时机都与两份原实现逐句一致。
 */
export function createCachedCanvasTexture(
  textureByStyle: Map<any, any>,
  threeApi: any,
  style: any,
  { width, height, maxAnisotropy = 1, paint }: any,
) {
  if (textureByStyle.has(style)) {
    return textureByStyle.get(style);
  }

  const canvasElement = document.createElement("canvas");
  canvasElement.width = width;
  canvasElement.height = height;
  const canvasCtx = canvasElement.getContext("2d");
  if (!canvasCtx) {
    return null;
  }
  paint(canvasCtx, canvasElement.width, canvasElement.height);
  const texture = new threeApi.CanvasTexture(canvasElement);
  texture.colorSpace = threeApi.SRGBColorSpace;
  texture.anisotropy = Math.min(maxAnisotropy || 1, 8);
  texture.needsUpdate = true;
  textureByStyle.set(style, texture);
  return texture;
}
