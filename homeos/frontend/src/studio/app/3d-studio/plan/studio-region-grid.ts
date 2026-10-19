/**
 * 区域灯光空间网格（0.7.8 `studio-region-grid`）。
 *
 * 把每层楼的区域灯投影到 8×8 的 2D 网格，shader 里先查网格拿到候选
 * 灯索引，再只遍历候选灯，避免每像素遍历全部灯槽。
 * 网格纹理每行 = `1 + capacity` 个 float：
 *   [0] 候选数量，[1..] 候选灯槽索引（-1 表示空位）。
 */

/** 网格边长（格子数），需与 shader 里的常量保持一致。 */
export const REGION_GRID_SIZE = 8;

/**
 * 填充区域灯网格。
 *
 * @param slots           灯槽数组（`{ center, extent, axis }`）
 * @param lightCount      本层有效灯数
 * @param capacity        灯槽容量（对齐到 16）
 * @param gridData        网格 Float32Array，长度 `capacity + 1) * REGION_GRID_SIZE²`
 * @param gridBounds      输出 `Vector4(minX, minZ, 1/width, 1/depth)`
 * @returns 是否成功填充；存在非有限值时返回 false
 */
export function fillRegionGrid(
  slots: any,
  lightCount: any,
  capacity: any,
  gridData: Float32Array,
  gridBounds: any,
): boolean {
  const projectedRects: number[][] = [];
  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxZ = -Infinity;
  for (let slotIndex = 0; slotIndex < lightCount; slotIndex++) {
    const { center, extent, axis } = slots[slotIndex];
    if (center.w < 0.00001) continue;
    // 线光源（strip）沿 z 轴展开，需要把长度算进矩形范围。
    const halfWidth =
        Math.max(extent.x, 0.001) +
        (axis.z > 0.5 && axis.z < 1.5 ? Math.max(extent.z, 0.001) : 0),
      halfDepth = Math.max(extent.z, 0.001),
      projectedHalfWidth = Math.abs(axis.x) * halfWidth + Math.abs(axis.y) * halfDepth,
      projectedHalfDepth = Math.abs(axis.y) * halfWidth + Math.abs(axis.x) * halfDepth,
      epsilon =
        Math.max(1, Math.abs(center.x), Math.abs(center.z), projectedHalfWidth, projectedHalfDepth) *
        0.00001,
      rect = [
        center.x - projectedHalfWidth - epsilon,
        center.z - projectedHalfDepth - epsilon,
        center.x + projectedHalfWidth + epsilon,
        center.z + projectedHalfDepth + epsilon,
        slotIndex,
      ];
    if (!rect.every(Number.isFinite)) return false;
    projectedRects.push(rect);
    ((minX = Math.min(minX, rect[0])),
      (minZ = Math.min(minZ, rect[1])),
      (maxX = Math.max(maxX, rect[2])),
      (maxZ = Math.max(maxZ, rect[3])));
  }

  gridData.fill(0);
  if (!projectedRects.length) {
    gridBounds.set(0, 0, 1, 1);
    return true;
  }

  const stride = REGION_GRID_SIZE + 1,
    scaleX = REGION_GRID_SIZE / Math.max(maxX - minX, 0.001),
    scaleZ = REGION_GRID_SIZE / Math.max(maxZ - minZ, 0.001);
  gridBounds.set(minX, minZ, scaleX, scaleZ);
  const toCell = (value: number) =>
    Math.max(0, Math.min(REGION_GRID_SIZE - 1, Math.floor(value)));

  for (const [left, bottom, right, top, slotIndex] of projectedRects)
    for (
      let cellZ = toCell((bottom - minZ) * scaleZ);
      cellZ <= toCell((top - minZ) * scaleZ);
      cellZ++
    )
      for (
        let cellX = toCell((left - minX) * scaleX);
        cellX <= toCell((right - minX) * scaleX);
        cellX++
      ) {
        // 每行首列存候选数量，后续列按数量追加灯槽索引。
        const rowOffset = (cellZ * REGION_GRID_SIZE + cellX) * stride;
        gridData[rowOffset + ++gridData[rowOffset]] = slotIndex;
      }
  return true;
}
