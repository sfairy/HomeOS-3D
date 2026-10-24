/**
 * 加载期的**盒式（box）平面 UV**：给没有 `TEXCOORD_0` 的模型补一套 UV。
 *
 * 为什么需要它：外部模型库 645/660 个 GLB 根本没有 UV（建模时只出纯色），
 * 而程序化法线图（`studio-surface-normal-maps.ts`）必须采样 UV。逐模型回导出 UV
 * 不现实，所以在**加载期**给每个没有 UV 的几何体补一套：按三角面法线选主轴，
 * 用另外两个轴的坐标当 UV（就是建模软件里的 box mapping）。
 *
 * 三条边界：
 * 1. **只补缺 UV 的几何体**：已有 UV（图集 / 石材板）一律不动，那些贴图另有布局。
 * 2. **UV 单位是米**：纹理重复次数由表面族的 `texture.repeat` 决定，
 *    同一张木纹在所有柜子上疏密一致；不在这里按几何尺寸缩放。
 * 3. **进模板几何体、不进 GLB**：补的是 `BufferAttribute`，和文件 / 基线无关。
 */

/** 模型坐标若是厘米导出（家具里很常见），先折算到米，否则木纹会被铺成 100 倍密。 */
const CENTIMETER_HEURISTIC_THRESHOLD = 40;

/**
 * 节点世界缩放 → UV 单位换算。
 *
 * 几何体本地坐标未必是米：出口风的 GLB 是**英寸**建模（本地 78.74 长），靠节点上的
 * `25.4 × 0.001` 折算到 2.0m。只看几何体包围盒的话 78.74 > 40 会被当成「厘米」，
 * 于是 UV 变成 0.787（应为 2.0），法线图铺成 2.5 倍粗 —— 大平板上的拉丝纹理全是
 * 一二厘米宽的粗条。节点上既然有缩放，就以它为准；只有缩放恰好是 1 时才退回
 * 包围盒猜测（那种模型是「坐标本身就是厘米、没有节点缩放」的老导出）。
 */
function resolveUnitScale(boundingBox: any, worldScale: number | null | undefined) {
  if (typeof worldScale === "number" && Number.isFinite(worldScale) && worldScale > 0) {
    if (Math.abs(worldScale - 1) > 1e-6) return worldScale;
  }
  if (!boundingBox) return 1;
  const longestSide = Math.max(
    boundingBox.max.x - boundingBox.min.x,
    boundingBox.max.y - boundingBox.min.y,
    boundingBox.max.z - boundingBox.min.z,
  );
  return longestSide > CENTIMETER_HEURISTIC_THRESHOLD ? 0.01 : 1;
}

/** 单个几何体补盒式 UV；返回是否真的写入了 `uv` 属性（已有 UV / 无三角面时返回 false）。 */
function ensureBoxUv(threeApi: any, geometry: any, worldScale?: number | null): boolean {
  const position = geometry?.attributes?.position;
  if (!position || geometry.attributes.uv || geometry.userData?.homeosBoxUv) return false;

  const vertexCount = position.count;
  const index = geometry.index;
  const triangleCount = Math.floor((index ? index.count : vertexCount) / 3);
  if (triangleCount <= 0) return false;

  // 盒子 UV 用的是几何体的本地坐标；先算出「本地单位 → 米」的换算。
  if (!geometry.boundingBox) geometry.computeBoundingBox?.();
  const unitScale = resolveUnitScale(geometry.boundingBox ?? null, worldScale);

  const uvs = new Float32Array(vertexCount * 2);
  const assigned = new Uint8Array(vertexCount);
  const vertexIndexAt = (offset: number) => (index ? index.getX(offset) : offset);
  const point = {
    ax: 0, ay: 0, az: 0,
    bx: 0, by: 0, bz: 0,
    cx: 0, cy: 0, cz: 0,
  };

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offsets = [triangle * 3, triangle * 3 + 1, triangle * 3 + 2];
    const vertexIndices = offsets.map(vertexIndexAt);
    const [a, b, c] = vertexIndices;
    point.ax = position.getX(a); point.ay = position.getY(a); point.az = position.getZ(a);
    point.bx = position.getX(b); point.by = position.getY(b); point.bz = position.getZ(b);
    point.cx = position.getX(c); point.cy = position.getY(c); point.cz = position.getZ(c);

    // 面法线的三个分量里绝对值最大的那个轴就是投影方向（box mapping 的标准做法）。
    const edge1x = point.bx - point.ax, edge1y = point.by - point.ay, edge1z = point.bz - point.az;
    const edge2x = point.cx - point.ax, edge2y = point.cy - point.ay, edge2z = point.cz - point.az;
    const normalX = Math.abs(edge1y * edge2z - edge1z * edge2y);
    const normalY = Math.abs(edge1z * edge2x - edge1x * edge2z);
    const normalZ = Math.abs(edge1x * edge2y - edge1y * edge2x);
    const dominantAxis = normalX >= normalY && normalX >= normalZ ? 0 : normalY >= normalZ ? 1 : 2;

    for (const vertexIndex of vertexIndices) {
      // 共享顶点会被多个面写到：让第一个面说了算，避免同一顶点在面之间抖动。
      if (assigned[vertexIndex]) continue;
      const x = position.getX(vertexIndex);
      const y = position.getY(vertexIndex);
      const z = position.getZ(vertexIndex);
      const u = dominantAxis === 0 ? z : x;
      const v = dominantAxis === 1 ? z : y;
      uvs[vertexIndex * 2] = u * unitScale;
      uvs[vertexIndex * 2 + 1] = v * unitScale;
      assigned[vertexIndex] = 1;
    }
  }

  let assignedCount = 0;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    if (assigned[vertex]) {
      assignedCount += 1;
      continue;
    }
    // 没有三角面用到的顶点（孤立点 / 退化面）也要有合法 UV，否则整块属性都不完整。
    uvs[vertex * 2] = position.getX(vertex) * unitScale;
    uvs[vertex * 2 + 1] = position.getZ(vertex) * unitScale;
  }
  if (!assignedCount) return false;

  geometry.setAttribute("uv", new threeApi.BufferAttribute(uvs, 2));
  geometry.userData = { ...(geometry.userData || {}), homeosBoxUv: true };
  return true;
}

/** 遍历场景里所有网格几何体补 UV；返回补了多少个（供调试 / 单测）。 */
export function ensureSceneBoxUvs(threeApi: any, scene: any): number {
  let patched = 0;
  // 世界矩阵要先算好：UV 的单位换算取自节点世界缩放（英寸 / 厘米导出的模型全靠它）。
  scene?.updateMatrixWorld?.(true);
  const worldScaleVector = threeApi?.Vector3 ? new threeApi.Vector3() : null;
  scene?.traverse?.((node: any) => {
    if (!node?.isMesh || !node.geometry) return;
    const worldScale = worldScaleVector
      ? node.getWorldScale
        ? node.getWorldScale(worldScaleVector)
        : worldScaleVector.set(1, 1, 1)
      : null;
    const uniformScale = worldScale
      ? (Math.abs(worldScale.x) + Math.abs(worldScale.y) + Math.abs(worldScale.z)) / 3
      : null;
    if (ensureBoxUv(threeApi, node.geometry, uniformScale)) patched += 1;
  });
  return patched;
}
