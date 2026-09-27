/**
 * 从磁盘 GLB 直接读出**俯视占地轮廓**（不引 three，只用 Node 内置能力）。
 */
import fs from "node:fs";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const COMPONENT_UINT16 = 5123;
const COMPONENT_UINT32 = 5125;
const COMPONENT_FLOAT = 5126;

/** 每轴取样格数。48 足够分辨「圆」与「方」，又不至于把 137 件拖到几十秒。 */
const DEFAULT_GRID = 48;

function readChunks(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length < 12 || buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error(`${file}：magic 不是 glTF（不是 GLB 文件）`);
  }
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const body = buffer.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === JSON_CHUNK) json = JSON.parse(body.toString("utf8"));
    if (chunkType === BIN_CHUNK) bin = body;
    offset += 8 + chunkLength + ((4 - (chunkLength % 4)) % 4);
  }
  if (!json) throw new Error(`${file}：缺 JSON chunk`);
  return { json, bin };
}

function readVec3Accessor(json, bin, accessorIndex) {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) throw new Error("索引指向不存在的访问器");
  if (accessor.componentType !== COMPONENT_FLOAT || accessor.type !== "VEC3") {
    throw new Error("POSITION 不是 FLOAT VEC3，本读取器只认这一种");
  }
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error("访问器没有 bufferView");
  const stride = view.byteStride || 12;
  const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const values = new Float32Array(accessor.count * 3);
  for (let index = 0; index < accessor.count; index += 1) {
    const at = base + index * stride;
    values[index * 3] = bin.readFloatLE(at);
    values[index * 3 + 1] = bin.readFloatLE(at + 4);
    values[index * 3 + 2] = bin.readFloatLE(at + 8);
  }
  return values;
}

function readIndexAccessor(json, bin, accessorIndex) {
  const accessor = json.accessors?.[accessorIndex];
  const view = json.bufferViews?.[accessor.bufferView];
  const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const count = accessor.count;
  const indices = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) {
    if (accessor.componentType === COMPONENT_UINT16) {
      indices[index] = bin.readUInt16LE(base + index * 2);
    } else if (accessor.componentType === COMPONENT_UINT32) {
      indices[index] = bin.readUInt32LE(base + index * 4);
    } else {
      throw new Error("索引不是 u16 / u32");
    }
  }
  return indices;
}

/**
 * 把一个 GLB 的全部三角面读成 `[x1, z1, x2, z2, x3, z2, …]` 的俯视投影。
 */
export function readGlbFootprintTriangles(file) {
  const { json, bin } = readChunks(file);
  const triangles = [];
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      const mode = primitive.mode ?? 4;
      if (mode !== 4) continue;
      const positions = readVec3Accessor(
        json,
        bin,
        primitive.attributes?.POSITION
      );
      const indices = primitive.indices !== undefined
        ? readIndexAccessor(json, bin, primitive.indices)
        : Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
      for (let at = 0; at + 2 < indices.length; at += 3) {
        for (const vertexIndex of [indices[at], indices[at + 1], indices[at + 2]]) {
          triangles.push(positions[vertexIndex * 3], positions[vertexIndex * 3 + 2]);
        }
      }
    }
  }
  return triangles;
}

/** 三个叉积同号（含 0）则点在三角形内 —— 边界算在内，细长三角形不会漏格。 */
function pointInTriangle2d(px, pz, ax, az, bx, bz, cx, cz) {
  const edge1 = (bx - ax) * (pz - az) - (bz - az) * (px - ax);
  const edge2 = (cx - bx) * (pz - bz) - (cz - bz) * (px - bx);
  const edge3 = (ax - cx) * (pz - cz) - (az - cz) * (px - cx);
  const hasNegative = edge1 < 0 || edge2 < 0 || edge3 < 0;
  const hasPositive = edge1 > 0 || edge2 > 0 || edge3 > 0;
  return !(hasNegative && hasPositive);
}

/**
 * 把俯视轮廓栅格化，返回圆度判据。
 * @param {number[]} triangles `readGlbFootprintTriangles` 的返回值
 * @param {number} grid 每轴格数
 */
export function footprintRoundness(triangles, grid = DEFAULT_GRID) {
  if (triangles.length < 9) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let at = 0; at < triangles.length; at += 2) {
    const x = triangles[at];
    const z = triangles[at + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  if (!(spanX > 0) || !(spanZ > 0)) return null;
  // 方形格：圆度因此可以直接摆到 π/4 上比。
  const cell = Math.max(spanX, spanZ) / grid;
  const cols = Math.ceil(spanX / cell);
  const rows = Math.ceil(spanZ / cell);
  const occupied = new Set();
  for (let at = 0; at + 5 < triangles.length; at += 6) {
    const ax = triangles[at];
    const az = triangles[at + 1];
    const bx = triangles[at + 2];
    const bz = triangles[at + 3];
    const cx = triangles[at + 4];
    const cz = triangles[at + 5];
    const startCol = Math.floor((Math.min(ax, bx, cx) - minX) / cell);
    const endCol = Math.ceil((Math.max(ax, bx, cx) - minX) / cell);
    const startRow = Math.floor((Math.min(az, bz, cz) - minZ) / cell);
    const endRow = Math.ceil((Math.max(az, bz, cz) - minZ) / cell);
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
        const px = minX + (col + 0.5) * cell;
        const pz = minZ + (row + 0.5) * cell;
        if (pointInTriangle2d(px, pz, ax, az, bx, bz, cx, cz)) {
          occupied.add(row * cols + col);
        }
      }
    }
  }
  const radii = radialRadii(occupied, cols, rows, minX, minZ, cell);
  if (radii.length < 24) return null;
  const mean = radii.reduce((sum, value) => sum + value, 0) / radii.length;
  const variance =
    radii.reduce((sum, value) => sum + (value - mean) ** 2, 0) / radii.length;
  return {
    spanX,
    spanZ,
    cell,
    areaRatio: occupied.size / (cols * rows),
    radialCv: mean > 0 ? Math.sqrt(variance) / mean : null,
    radialMin: Math.min(...radii),
    radialMax: Math.max(...radii),
    occupiedCells: occupied.size
  };
}

function radialRadii(occupied, cols, rows, minX, minZ, cell) {
  let sumX = 0;
  let sumZ = 0;
  for (const key of occupied) {
    sumX += (key % cols + 0.5) * cell;
    sumZ += (Math.floor(key / cols) + 0.5) * cell;
  }
  const centerX = sumX / occupied.size + minX;
  const centerZ = sumZ / occupied.size + minZ;
  const radii = [];
  const STEPS = 72;
  const step = cell * 0.4;
  for (let index = 0; index < STEPS; index += 1) {
    const angle = (index / STEPS) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    let last = null;
    // 从质心往外扫，命中过的最后一个距离就是该方向的外沿（中空物件要的是外沿，不是第一次命中）。
    const limit = Math.max(cols, rows) * cell;
    for (let distance = step; distance < limit; distance += step) {
      const col = Math.floor((centerX + dx * distance - minX) / cell);
      const row = Math.floor((centerZ + dz * distance - minZ) / cell);
      if (col < 0 || row < 0 || col >= cols || row >= rows) break;
      if (occupied.has(row * cols + col)) last = distance;
    }
    if (last !== null) radii.push(last);
  }
  if (radii.length < 8) return [];
  return radii;
}

/**
 * 判据的阈值。两组之间的**实测间隔**（2026-09 全量 126 件）：
 */
const ROUND_AREA_RATIO_MIN = 0.7;
const ROUND_AREA_RATIO_MAX = 0.86;
const ROUND_RADIAL_CV_MAX = 0.05;

/** 判据：格数比落在圆与方的中间带、且各向半径几乎等长。 */
export function isRoundFootprint(stats) {
  if (!stats || stats.radialCv === null) return false;
  return (
    stats.areaRatio > ROUND_AREA_RATIO_MIN &&
    stats.areaRatio < ROUND_AREA_RATIO_MAX &&
    stats.radialCv < ROUND_RADIAL_CV_MAX
  );
}

/** 便捷入口：直接给 GLB 文件路径。 */
export function roundnessOfGlb(file, grid = DEFAULT_GRID) {
  return footprintRoundness(readGlbFootprintTriangles(file), grid);
}
