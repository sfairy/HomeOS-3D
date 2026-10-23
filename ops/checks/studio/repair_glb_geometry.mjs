#!/usr/bin/env bun
/**
 * GLB 几何机械修复（默认 dry-run，`--write` 才落盘）。
 *
 * 三件事，按顺序做，**不改材质、不改材质顺序、不重排节点**：
 * 1. **几何清理**：按位置 + 法线 + UV 焊接重复顶点（硬边/UV 缝保留）、删退化面与完全重叠面、
 *    平面边界环用中心扇形补齐、闭合壳若有向体积为负则翻面。这一层是幂等的：
 *    跑两遍，第二遍的所有计数都是 0。
 * 2. **尺寸归一**：以规格高度为主做均匀缩放；残余偏差 ≤10% 的轴再补非均匀修正；
 *    超过 10% 说明型号与规格不是同一个配置（含底座 / 龙头 / 网 / 轮组），**不拉伸**，
 *    记为 waiver 交人工判断 —— 硬拉会把圆柱拉成椭圆，比尺寸偏差更糟。
 * 3. **落地**：落地 / 台面件底面 y=0、x/z 居中；壁挂件按包围盒中心缩放、不强制落地
 *    （保留挂载原点与 `elevation` 语义）。
 *
 * 缩放与平移写入**根节点的矩阵**，不改顶点：这样动画件（排气扇转子、吊扇叶片）的
 * 局部轴心不会被烤坏，labs 共享网格也不会被分裂。
 *
 * lite 变体：由修好的完整件重新 Draco 压缩（量化 14 位位置 / 10 位法线，包围盒误差 ~0.01%），
 * 保证包围盒、三角面数、材质名与完整件一致。
 *
 * 用法（仓库根目录）：
 * ```bash
 * bun ops/checks/studio/repair_glb_geometry.mjs                    # dry-run 全量，打印将发生的操作
 * bun ops/checks/studio/repair_glb_geometry.mjs --model sofa,chair  # 限量
 * bun ops/checks/studio/repair_glb_geometry.mjs --write            # 落盘
 * bun ops/checks/studio/repair_glb_geometry.mjs --write --no-fill   # 不补洞
 * bun ops/checks/studio/repair_glb_geometry.mjs --json             # 机读报告
 * ```
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { draco } from '@gltf-transform/functions';
import {
  collectModelVariants,
  listModelFiles,
  maxAxisScale,
  multiplyMatrix,
  parseGlb,
  relativeDeviation,
  round,
  translationMatrix,
  scalingMatrix,
} from '../../../homeos/frontend/scripts/models/lib/glb-io.mjs';
import {
  loadDocument,
  modelStatistics,
  worldBounds,
  writeDocument,
} from '../../../homeos/frontend/scripts/models/lib/model-document.mjs';
import {
  DEFAULT_WELD_TOLERANCE,
  analyzeTopology,
  cleanTriangles,
  fillPlanarHoles,
  weldPrimitive,
} from '../../../homeos/frontend/scripts/models/lib/geometry-ops.mjs';

const hereDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(hereDir, '../../..');
const frontendDir = path.join(repoRoot, 'homeos/frontend');
const modelsDir = path.join(frontendDir, 'public/static/3d-studio/models');
const specsFile = path.join(frontendDir, 'scripts/models/specs/model-specs.json');
const docsDir = path.join(repoRoot, 'docs/architecture/2026-10-22');

/** 结论阈值：与计划 §1 / audit 脚本一致。 */
const TARGET_DEVIATION = 0.02;
const MAX_DEVIATION = 0.05;
const MAX_NONUNIFORM = 0.1;

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const valueOf = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

/* ------------------------------------------------------------------ *
 * 尺寸策略
 * ------------------------------------------------------------------ */

/**
 * 决定用哪种缩放把原生包围盒对到规格。
 *
 * 规则（比「按高均匀缩放」更保守，实测踩过两个坑）：
 * 1. **薄轴不缩放**：厚度小于最大边 5% 的轴（地毯 / 布帘 / 挂画 / 玻璃）不参与归一。
 *    否则一块 2 × 1.4m 的地毯会因为 1mm 的厚度差被整体缩到 1.85 × 1.29m。
 * 2. **基准轴取规格里最长的那条边**，不用固定 Y：落地灯是高度最长、地毯是宽度最长，
 *    固定按 Y 会让躺平的件全部缩错。
 * 3. 以基准轴的均匀比例算下来，各轴残余偏差 ≤10% 才允许逐轴补齐（非均匀修正）；
 *    超过 10% 说明型号/配置不是同一个东西，**不拉伸**，记为 waiver。
 *
 * @returns {{mode: 'none'|'uniform'|'per-axis'|'waiver', scale: number[], deviation: number[], reason: string, thinAxes: boolean[]}}
 */
export function decideScale(size, target) {
  if (!Array.isArray(target) || target.length !== 3) {
    return { mode: 'none', scale: [1, 1, 1], deviation: [], reason: '规格缺失', thinAxes: [false, false, false] };
  }
  const deviation = size.map((value, axis) => relativeDeviation(value, target[axis]) ?? 0);
  const longest = Math.max(...target);
  const thinAxes = target.map((value) => value < longest * 0.05);
  const scalableAxes = [0, 1, 2].filter((axis) => !thinAxes[axis]);
  if (!scalableAxes.length) {
    return { mode: 'none', scale: [1, 1, 1], deviation, reason: '三轴皆为薄片', thinAxes };
  }
  const primary = scalableAxes.reduce((best, axis) => (target[axis] > target[best] ? axis : best), scalableAxes[0]);
  const uniform = target[primary] / size[primary];
  // 薄轴的毫米级差异照常补齐（地毯 13mm → 12mm 没有视觉意义），
  // 但**不计入形变判定**：不能因为 1mm 厚度去动 2m 的幅面。
  const perAxis = [0, 1, 2].map((axis) => target[axis] / size[axis]);
  const distortion = Math.max(...scalableAxes.map((axis) => Math.abs(perAxis[axis] / uniform - 1)));
  const needed = [0, 1, 2].some((axis) => deviation[axis] > TARGET_DEVIATION);
  if (!needed) {
    return {
      mode: 'none',
      scale: [1, 1, 1],
      deviation,
      reason: `可缩放轴偏差 ≤2%（薄轴 ${thinAxes.map((thin, axis) => (thin ? 'xyz'[axis] : '')).filter(Boolean).join('') || '无'} 不参与）`,
      thinAxes,
    };
  }
  if (distortion <= MAX_NONUNIFORM) {
    const exact = perAxis.every((value) => Math.abs(value - uniform) < 0.005);
    return {
      mode: exact ? 'uniform' : 'per-axis',
      scale: perAxis,
      deviation,
      reason:
        (exact ? `按${'xyz'[primary]}轴均匀缩放 ${uniform.toFixed(4)}` : `基准 ${'xyz'[primary]} 轴 ${uniform.toFixed(4)}，逐轴补齐（最大形变 ${(distortion * 100).toFixed(1)}%）`) +
        (thinAxes.some(Boolean) ? `；薄轴 ${thinAxes.map((thin, axis) => (thin ? 'xyz'[axis] : '')).filter(Boolean).join('')} 只补厚度` : ''),
      thinAxes,
    };
  }
  return {
    mode: 'waiver',
    scale: [1, 1, 1],
    deviation,
    reason: `比例冲突：按基准轴需形变 ${(distortion * 100).toFixed(1)}% > 10%，保留原生比例待人工判定`,
    thinAxes,
  };
}

/* ------------------------------------------------------------------ *
 * 几何清理
 * ------------------------------------------------------------------ */

/** 一份 primitive 的所有顶点属性（含非标准语义，如 TANGENT / COLOR_0）。 */
function readAttributes(primitive) {
  const semantics = primitive.listSemantics();
  const attributes = new Map();
  for (const semantic of semantics) {
    const accessor = primitive.getAttribute(semantic);
    if (!accessor) continue;
    attributes.set(semantic, {
      array: accessor.getArray(),
      elementSize: accessor.getElementSize(),
      type: accessor.getType(),
      normalized: accessor.getNormalized(),
      constructor: accessor.getArray().constructor,
    });
  }
  return attributes;
}

/** 写回属性：顶点数变了就重建 accessor（保留原 type / normalized）。 */
function writeAttributes(doc, primitive, attributes, indices) {
  for (const [semantic, attribute] of attributes) {
    const accessor = doc
      .createAccessor()
      .setType(attribute.type)
      .setNormalized(attribute.normalized)
      .setArray(attribute.array);
    primitive.setAttribute(semantic, accessor);
  }
  const existing = primitive.getIndices();
  const indexAccessor = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(indices);
  if (existing) indexAccessor.setNormalized(false);
  primitive.setIndices(indexAccessor);
}

/** 按 remap 压缩所有顶点属性（保留每个目标顶点第一次写入的值）。 */
function applyRemap(attributes, remap, vertexCount) {
  const next = new Map();
  for (const [semantic, attribute] of attributes) {
    const { array, elementSize, constructor } = attribute;
    const output = new constructor(vertexCount * elementSize);
    const written = new Uint8Array(vertexCount);
    for (let vertex = 0; vertex < remap.length; vertex += 1) {
      const target = remap[vertex];
      if (written[target]) continue;
      written[target] = 1;
      for (let component = 0; component < elementSize; component += 1) {
        output[target * elementSize + component] = array[vertex * elementSize + component];
      }
    }
    next.set(semantic, { ...attribute, array: output });
  }
  return next;
}

/** 去掉没有被任何三角面引用的顶点（删除退化面之后会留下空洞顶点）。 */
function compactAttributes(attributes, indices) {
  const vertexCount = [...attributes.values()][0].array.length / [...attributes.values()][0].elementSize;
  const used = new Uint8Array(vertexCount);
  for (const index of indices) used[index] = 1;
  const remap = new Uint32Array(vertexCount);
  let next = 0;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    if (used[vertex]) remap[vertex] = next++;
    else remap[vertex] = 0xffffffff;
  }
  if (next === vertexCount) return { attributes, indices, removed: 0 };
  const nextIndices = new Uint32Array(indices.length);
  for (let index = 0; index < indices.length; index += 1) nextIndices[index] = remap[indices[index]];
  return { attributes: applyRemap(attributes, remap, next), indices: nextIndices, removed: vertexCount - next };
}

/**
 * 清理一条 primitive。
 * @returns {{attributes: Map, indices: Uint32Array, report: object}}
 */
function cleanPrimitiveData(primitive, { tolerance, fillHoles }) {
  const attributes = readAttributes(primitive);
  const position = attributes.get('POSITION');
  if (!position) return null;
  const indexAccessor = primitive.getIndices();
  const vertexCount = position.array.length / position.elementSize;
  const originalIndices = indexAccessor
    ? new Uint32Array(indexAccessor.getArray())
    : Uint32Array.from({ length: vertexCount }, (_, index) => index);
  const extraSemantics = [...attributes.keys()].filter(
    (semantic) => !['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(semantic),
  );
  const data = {
    positions: position.array,
    normals: attributes.get('NORMAL')?.array,
    uvs: attributes.get('TEXCOORD_0')?.array,
    indices: originalIndices,
  };
  const before = analyzeTopology(data, { tolerance });

  // 1) 焊接（位置 + 法线 + UV）：所有属性按同一 remap 压缩，TANGENT / COLOR_0 也不错位。
  const welded = weldPrimitive(data, { tolerance });
  let nextAttributes = applyRemap(attributes, welded.remap, welded.vertexCount);
  let nextIndices = welded.primitive.indices;

  // 2) 删退化面 / 完全重叠面（只动索引）。
  const cleaned = cleanTriangles({ positions: nextAttributes.get('POSITION').array, indices: nextIndices }, {
    mergeable: false,
  });
  nextIndices = cleaned.primitive.indices;

  // 3) 补平面洞：只在没有额外属性时做（新增顶点没有 TANGENT / COLOR 可继承）。
  let holes = { filledLoops: 0, skippedLoops: 0, addedTriangles: 0 };
  // 已经有非流形边的件不补洞：那些「边界环」多半是非流形裂缝的副产品，
  // 扇形补上去只会把非流形边越补越多（`piano` 实测 348 → 383）。
  const canFill = fillHoles && !extraSemantics.length && before.nonManifoldEdges === 0;
  if (canFill) {
    const result = fillPlanarHoles(
      {
        positions: nextAttributes.get('POSITION').array,
        normals: nextAttributes.get('NORMAL')?.array,
        uvs: nextAttributes.get('TEXCOORD_0')?.array,
        indices: nextIndices,
      },
      { tolerance, planarityTolerance: Math.max(0.0015, tolerance * 100), minLoopVertices: 4 },
    );
    // 面数预算：补洞新增三角面不得超过 this primitive 的 10%（小件另有 24 面的绝对额度）。
    // 没有这条，2m 长的出风口（26 面）会被补成 54 面（+107%），注册表口径的 10% 直接爆掉。
    const triangleBudget = Math.max(24, (nextIndices.length / 3) * 0.1);
    const overBudget = result.addedTriangles > triangleBudget;
    if (result.addedTriangles > 0 && !overBudget) {
      holes = result;
      nextIndices = result.primitive.indices;
      nextAttributes.set('POSITION', {
        ...nextAttributes.get('POSITION'),
        array: result.primitive.positions,
      });
      const normalAttribute = nextAttributes.get('NORMAL');
      if (normalAttribute && result.primitive.normals) {
        nextAttributes.set('NORMAL', { ...normalAttribute, array: result.primitive.normals });
      }
      const uvAttribute = nextAttributes.get('TEXCOORD_0');
      if (uvAttribute && result.primitive.uvs) {
        nextAttributes.set('TEXCOORD_0', { ...uvAttribute, array: result.primitive.uvs });
      }
    } else if (overBudget) {
      holes = { filledLoops: 0, skippedLoops: result.skippedLoops + result.filledLoops, addedTriangles: 0 };
    }
  }

  // 4) 压实：删面之后留下的孤立顶点一并去掉。
  const compacted = compactAttributes(nextAttributes, nextIndices);
  nextAttributes = compacted.attributes;
  nextIndices = compacted.indices;

  // 5) 闭合壳若有向体积为负 → 整体翻面（法线朝内是导出器常见错误）。
  const afterTopology = analyzeTopology(
    {
      positions: nextAttributes.get('POSITION').array,
      indices: nextIndices,
    },
    { tolerance },
  );
  let flipped = false;
  const closed = afterTopology.boundaryEdges === 0 && afterTopology.nonManifoldEdges === 0;
  if (closed && afterTopology.signedVolume < -1e-9) {
    for (let offset = 0; offset < nextIndices.length; offset += 3) {
      const swap = nextIndices[offset + 1];
      nextIndices[offset + 1] = nextIndices[offset + 2];
      nextIndices[offset + 2] = swap;
    }
    const normalAttribute = nextAttributes.get('NORMAL');
    if (normalAttribute) {
      const array = normalAttribute.array;
      for (let index = 0; index < array.length; index += 1) array[index] = -array[index];
      nextAttributes.set('NORMAL', { ...normalAttribute, array });
    }
    flipped = true;
  }

  const afterTopologyFinal = analyzeTopology(
    { positions: nextAttributes.get('POSITION').array, indices: nextIndices },
    { tolerance },
  );
  // 不回退规则：机械清理绝不允许把拓扑改坏。SimLab 那批（`piano` / `tea-bar-machine`）
  // 的「重复顶点」其实是相邻壳共用的缝合点，焊上会新造非流形边；删退化面也可能正好
  // 拆掉堵住裂缝的那片。这类件原样保留，交人工 / 后续重建处理。
  const regressed =
    afterTopologyFinal.nonManifoldEdges > before.nonManifoldEdges ||
    afterTopologyFinal.boundaryEdges > before.boundaryEdges;
  if (regressed) {
    return {
      attributes,
      indices: originalIndices,
      report: {
        before,
        after: before,
        weldedVertices: 0,
        degenerateFaces: 0,
        duplicatedFaces: 0,
        compactedVertices: 0,
        holesFilled: 0,
        holesSkipped: 0,
        flipped: false,
        reverted: true,
        revertReason: `拓扑回退：非流形 ${before.nonManifoldEdges}→${afterTopologyFinal.nonManifoldEdges}，边界 ${before.boundaryEdges}→${afterTopologyFinal.boundaryEdges}`,
      },
    };
  }

  return {
    attributes: nextAttributes,
    indices: nextIndices,
    report: {
      before,
      after: afterTopologyFinal,
      weldedVertices: welded.removedVertices,
      degenerateFaces: cleaned.degenerate,
      duplicatedFaces: cleaned.duplicated,
      compactedVertices: compacted.removed,
      holesFilled: holes.filledLoops,
      holesSkipped: holes.skippedLoops,
      flipped,
      reverted: false,
    },
  };
}
/** 把一条 primitive 的当前数组读成纯数据（含所有顶点语义）。 */
function snapshotPrimitive(primitive) {
  const attributes = readAttributes(primitive);
  const position = attributes.get('POSITION');
  if (!position) return null;
  const indexAccessor = primitive.getIndices();
  const vertexCount = position.array.length / position.elementSize;
  const indices = indexAccessor
    ? new Uint32Array(indexAccessor.getArray())
    : Uint32Array.from({ length: vertexCount }, (_, index) => index);
  return { attributes, indices };
}

/** 恢复快照（原样写回，不做任何清理）。 */
function restorePrimitive(doc, primitive, snapshot) {
  writeAttributes(doc, primitive, snapshot.attributes, snapshot.indices);
}

/** 一条 primitive 的拓扑合计（本地坐标口径）。 */
function topologyTotals(doc, tolerances) {
  const totals = { nonManifoldEdges: 0, boundaryEdges: 0, triangles: 0 };
  for (const [primitive, tolerance] of tolerances) {
    const snapshot = snapshotPrimitive(primitive);
    if (!snapshot) continue;
    const topology = analyzeTopology(
      { positions: snapshot.attributes.get('POSITION').array, indices: snapshot.indices },
      { tolerance },
    );
    totals.nonManifoldEdges += topology.nonManifoldEdges;
    totals.boundaryEdges += topology.boundaryEdges;
    totals.triangles += snapshot.indices.length / 3;
  }
  return totals;
}

/**
 * 遍历文档里的每条 primitive，清理后就地写回。
 *
 * **整件级不回退**：先记下所有 primitive 的原始数组与拓扑合计，清理后重新统计；
 * 非流形边或边界边只要有一项变多，就把整件恢复原样，一个字节都不写。
 * 机械修复的作用是「变干净」，不是「换个样子」。
 */
function cleanDocument(doc, { fillHoles }) {
  const report = {
    primitives: 0,
    weldedVertices: 0,
    degenerateFaces: 0,
    duplicatedFaces: 0,
    compactedVertices: 0,
    holesFilled: 0,
    holesSkipped: 0,
    flipped: 0,
    revertedPrimitives: 0,
    modelReverted: false,
    skipped: [],
    revertReasons: [],
  };
  const processed = new Set();
  const tolerances = new Map();
  const snapshots = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const worldScale = maxAxisScale(node.getWorldMatrix());
    const tolerance = DEFAULT_WELD_TOLERANCE / Math.max(worldScale, 1e-9);
    for (const primitive of mesh.listPrimitives()) {
      if (processed.has(primitive)) {
        if (tolerances.get(primitive) !== tolerance) {
          report.skipped.push({ node: node.getName(), reason: '共享网格的节点缩放不一致，只处理首份' });
        }
        continue;
      }
      processed.add(primitive);
      const snapshot = snapshotPrimitive(primitive);
      if (!snapshot) continue;
      snapshots.push({ primitive, snapshot, tolerance });
      tolerances.set(primitive, tolerance);
    }
  }
  const beforeTotals = topologyTotals(doc, tolerances);

  const prepared = [];
  for (const { primitive, tolerance } of snapshots) {
    const filled = cleanPrimitiveData(primitive, { tolerance, fillHoles });
    if (!filled) continue;
    // 同一份 primitive 再算一遍「只焊接不补洞」，留着做模型级面数预算的回退版本。
    const plain = filled.report.holesFilled ? cleanPrimitiveData(primitive, { tolerance, fillHoles: false }) : filled;
    prepared.push({ primitive, filled, plain });
  }
  // 模型级面数预算（计划 §1：机械修复前后三角面变化 ≤10%）。
  // 小件上「补一个 2cm² 的洞」就能让整件面数 +100%，这种补洞要整件放弃，
  // 不能靠 primitive 级预算挡 —— 出风口 26 面、落地灯 76 面都是这么被挡住的。
  const filledTriangles = prepared.reduce((sum, item) => sum + (item.filled.report.after?.triangles ?? 0), 0);
  const plainTriangles = prepared.reduce((sum, item) => sum + (item.plain.report.after?.triangles ?? 0), 0);
  const triangleGrowth = beforeTotals.triangles ? (filledTriangles - plainTriangles) / beforeTotals.triangles : 0;
  const allowFill = triangleGrowth <= 0.1;
  if (!allowFill) {
    report.revertReasons.push({
      reason: `补洞使面数 +${(triangleGrowth * 100).toFixed(1)}% > 10%，整件保留未补洞版本`,
    });
  }

  for (const item of prepared) {
    const { primitive, filled } = item;
    const result = allowFill ? item.filled : item.plain;
    report.primitives += 1;
    report.weldedVertices += result.report.weldedVertices;
    report.degenerateFaces += result.report.degenerateFaces;
    report.duplicatedFaces += result.report.duplicatedFaces;
    report.compactedVertices += result.report.compactedVertices;
    report.holesFilled += allowFill ? result.report.holesFilled : 0;
    report.holesSkipped += allowFill ? result.report.holesSkipped : result.report.holesSkipped + filled.report.holesFilled;
    report.flipped += result.report.flipped ? 1 : 0;
    if (result.report.reverted) {
      report.revertedPrimitives += 1;
      report.revertReasons.push({ reason: result.report.revertReason });
    }
    writeAttributes(doc, primitive, result.attributes, result.indices);
  }

  const afterTotals = topologyTotals(doc, tolerances);
  report.before = beforeTotals;
  report.after = afterTotals;
  if (
    afterTotals.nonManifoldEdges > beforeTotals.nonManifoldEdges ||
    afterTotals.boundaryEdges > beforeTotals.boundaryEdges
  ) {
    for (const { primitive, snapshot } of snapshots) restorePrimitive(doc, primitive, snapshot);
    report.modelReverted = true;
    report.revertReasons.push({
      reason: `整件回退：非流形 ${beforeTotals.nonManifoldEdges}→${afterTotals.nonManifoldEdges}，边界 ${beforeTotals.boundaryEdges}→${afterTotals.boundaryEdges}`,
    });
    report.weldedVertices = 0;
    report.degenerateFaces = 0;
    report.duplicatedFaces = 0;
    report.compactedVertices = 0;
    report.holesFilled = 0;
    report.flipped = 0;
    report.after = beforeTotals;
  }
  return report;
}

/* ------------------------------------------------------------------ *
 * 尺寸归一 + 落地
 * ------------------------------------------------------------------ */

function rootNodes(doc) {
  return doc.getRoot().listNodes().filter((node) => !node.getParentNode());
}

/** 对根节点左乘一个矩阵（`node.matrix = M * node.matrix`）。 */
function prependTransform(doc, matrix) {
  for (const node of rootNodes(doc)) {
    node.setMatrix(multiplyMatrix(matrix, node.getMatrix()));
  }
}

/**
 * 缩放 + 落地。
 *
 * 缩放轴心：落地/台面件用「包围盒底面中心」，避免放大后底座沉到 y<0；
 * 壁挂/吊顶件用「包围盒中心」，挂载点不动。
 */
function normalizeTransform(doc, { scale, mount }) {
  const before = worldBounds(doc);
  const pivot =
    mount === 'wall' || mount === 'ceiling'
      ? [
          (before.min[0] + before.max[0]) / 2,
          (before.min[1] + before.max[1]) / 2,
          (before.min[2] + before.max[2]) / 2,
        ]
      : [(before.min[0] + before.max[0]) / 2, before.min[1], (before.min[2] + before.max[2]) / 2];
  const scaling = scalingMatrix(scale);
  const scaleAboutPivot = multiplyMatrix(
    translationMatrix(pivot[0], pivot[1], pivot[2]),
    multiplyMatrix(scaling, translationMatrix(-pivot[0], -pivot[1], -pivot[2])),
  );
  prependTransform(doc, scaleAboutPivot);
  const afterScale = worldBounds(doc);
  if (mount === 'wall' || mount === 'ceiling') {
    // 只把水平方向居中；高度与贴墙深度保持模型原义（`elevation` 由场景决定）。
    const centerX = (afterScale.min[0] + afterScale.max[0]) / 2;
    if (Math.abs(centerX) > 1e-6) prependTransform(doc, translationMatrix(-centerX, 0, 0));
    return { grounded: false, shift: [-centerX, 0, 0] };
  }
  const shift = [
    -(afterScale.min[0] + afterScale.max[0]) / 2,
    -afterScale.min[1],
    -(afterScale.min[2] + afterScale.max[2]) / 2,
  ];
  prependTransform(doc, translationMatrix(shift[0], shift[1], shift[2]));
  return { grounded: true, shift };
}

/* ------------------------------------------------------------------ *
 * lite 重生成
 * ------------------------------------------------------------------ */

/** lite 额外要求：材质必须与完整件逐字节等价（槽位名 / 顺序 / PBR 参数）。 */
async function writeLiteGuarded(doc, litePath, { write, reference }) {
  const original = fs.existsSync(litePath) ? fs.readFileSync(litePath) : null;
  await writeLite(doc, litePath, { write });
  const expected = preservationFingerprint(reference);
  const actual = preservationFingerprint(litePath);
  // lite 比完整件多一条 KHR_draco_mesh_compression，扩展声明必然不同，其余必须一致。
  const drift = fingerprintDrift(expected, actual, { ignoreExtensions: true });
  if (!drift.length) return { drift: [], restored: false };
  if (original) fs.writeFileSync(litePath, original);
  return { drift, restored: true };
}

async function writeLite(doc, litePath, { write }) {
  doc.createExtension(KHRDracoMeshCompression).setRequired(true);
  await doc.transform(
    draco({
      method: 'edgebreaker',
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeTexcoord: 12,
      quantizeColor: 8,
      quantizeGeneric: 12,
    }),
  );
  if (write) await writeDocument(doc, litePath);
}

/* ------------------------------------------------------------------ *
 * 材质保真闸门
 * ------------------------------------------------------------------ */

/**
 * 递归规范化 JSON：键排序、空对象/空数组当 null。
 *
 * 直接比 `JSON.stringify` 会误报 —— glTF-Transform 只是把键顺序换了、把 `{}` 写成缺省，
 * 这些对渲染零影响，却会让闸门把好模型全挡下来。
 */
function canonicalJson(value) {
  if (Array.isArray(value)) return value.length ? value.map(canonicalJson) : null;
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const normalized = canonicalJson(value[key]);
      if (normalized !== null && normalized !== undefined) out[key] = normalized;
    }
    return Object.keys(out).length ? out : null;
  }
  return value;
}

/**
 * 材质的语义指纹：先把 glTF 默认值抹平再规范化。
 *
 * 写回时 glTF-Transform 会省略等于默认值的字段（`alphaMode: OPAQUE`、`doubleSided: false`、
 * `alphaCutoff: 0.5`、`baseColorFactor: [1,1,1,1]`）。省略等于默认，渲染完全一致，
 * 但字节不同 —— 所以这一段必须按「解析后的值」比，不能按原文比。
 */
function materialFingerprint(materials = []) {
  return JSON.stringify(
    canonicalJson(
      materials.map((material) => {
        const copy = JSON.parse(JSON.stringify(material));
        if (copy.alphaMode === 'OPAQUE') delete copy.alphaMode;
        if (copy.alphaCutoff === 0.5) delete copy.alphaCutoff;
        if (copy.doubleSided === false) delete copy.doubleSided;
        if (Array.isArray(copy.emissiveFactor) && copy.emissiveFactor.every((v) => v === 0)) delete copy.emissiveFactor;
        if (copy.normalTexture?.scale === 1) delete copy.normalTexture.scale;
        if (copy.occlusionTexture?.strength === 1) delete copy.occlusionTexture.strength;
        const pbr = copy.pbrMetallicRoughness;
        if (pbr) {
          if (Array.isArray(pbr.baseColorFactor) && pbr.baseColorFactor.every((v) => v === 1)) {
            delete pbr.baseColorFactor;
          }
          if (pbr.metallicFactor === 1) delete pbr.metallicFactor;
          if (pbr.roughnessFactor === 1) delete pbr.roughnessFactor;
          if (!Object.keys(pbr).length) delete copy.pbrMetallicRoughness;
        }
        return copy;
      }),
    ),
  );
}

/**
 * 取 GLB 里「绝不能变」的部分。
 *
 * 背景：glTF-Transform 读不认识的扩展只打一行 warning 就丢弃。已实测 `floor-lamp` 丢过
 * `KHR_materials_pbrSpecularGlossiness`（材质名全在、颜色全没）。所以落盘后必须回读比对，
 * 一旦漂移就**逐字节还原**，宁可这批不修也不能把颜色改掉。
 *
 * 只比语义、不比字节：键顺序、节点 matrix→TRS、补一个默认 sampler、图片 bufferView
 * 重新排布都是 glTF-Transform 的常规输出差异，不影响渲染，不该触发回滚。
 */
function preservationFingerprint(filePath) {
  const { json } = parseGlb(fs.readFileSync(filePath));
  const bufferViews = json.bufferViews ?? [];
  return {
    materials: materialFingerprint(json.materials),
    // 纹理只比「指向哪张图」；多写一个默认 sampler 不影响采样。
    textures: JSON.stringify((json.textures ?? []).map((texture) => texture.source ?? null)),
    // 图片按 mime + 字节长度比：bufferView 下标会重排，字节数才是内容证据。
    images: JSON.stringify(
      (json.images ?? []).map((image) => `${image.mimeType ?? ''}:${bufferViews[image.bufferView]?.byteLength ?? 0}`).sort(),
    ),
    // 原文件没有 sampler 时，补一个默认 sampler 属于无害差异。
    samplers: (json.samplers ?? []).length ? JSON.stringify(canonicalJson(json.samplers)) : 'none',
    extensionsUsed: JSON.stringify([...(json.extensionsUsed ?? [])].sort()),
    extensionsRequired: JSON.stringify([...(json.extensionsRequired ?? [])].sort()),
    nodeExtras: JSON.stringify(canonicalJson((json.nodes ?? []).map((node) => node.extras ?? null))),
    primitiveMaterials: JSON.stringify(
      (json.meshes ?? []).map((mesh) => (mesh.primitives ?? []).map((primitive) => primitive.material ?? null)),
    ),
  };
}

/** 比对两份指纹，返回漂移字段名列表（空数组 = 完好）。 */
function fingerprintDrift(before, after, { ignoreExtensions = false } = {}) {
  return Object.keys(before).filter((field) => {
    if (ignoreExtensions && (field === 'extensionsUsed' || field === 'extensionsRequired')) return false;
    // 原文件没写 sampler 时补一个默认值无害（`wrapS/T = REPEAT` 就是默认）。
    if (field === 'samplers' && before[field] === 'none') return false;
    return before[field] !== after[field];
  });
}

/** 写文件 + 回读校验；漂移则还原原始字节。 */
async function writeGuarded(doc, filePath) {
  const original = fs.readFileSync(filePath);
  const before = preservationFingerprint(filePath);
  await writeDocument(doc, filePath);
  const drift = fingerprintDrift(before, preservationFingerprint(filePath));
  if (!drift.length) return { drift: [], restored: false };
  fs.writeFileSync(filePath, original);
  return { drift, restored: true };
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

function loadSpecs() {
  const payload = JSON.parse(fs.readFileSync(specsFile, 'utf8'));
  return new Map(payload.models.map((spec) => [spec.id, spec]));
}

async function main() {
  const write = hasFlag('write');
  const fillHoles = !hasFlag('no-fill');
  const json = hasFlag('json');
  const only = valueOf('model')?.split(',').map((id) => id.trim()).filter(Boolean);
  const specs = loadSpecs();
  const variants = collectModelVariants(listModelFiles());
  const results = [];

  for (const [id, variantMap] of [...variants].sort(([left], [right]) => left.localeCompare(right))) {
    if (only && !only.includes(id)) continue;
    const spec = specs.get(id);
    if (!spec) {
      results.push({ id, action: 'skip', reason: 'spec 缺失' });
      continue;
    }
    const fullPath = variantMap.full ? path.join(modelsDir, variantMap.full) : null;
    const litePath = variantMap.lite ? path.join(modelsDir, variantMap.lite) : null;
    const sourcePath = fullPath ?? litePath;
    const doc = await loadDocument(sourcePath);
    try {
      const before = worldBounds(doc);
      const beforeStats = modelStatistics(doc);
      const decision = decideScale(before.size, spec.size);
      const cleanReport = cleanDocument(doc, { fillHoles: fillHoles && spec.topologyClass === 'solid' });
      let transformReport = { grounded: false, shift: [0, 0, 0] };
      if (decision.mode === 'uniform' || decision.mode === 'per-axis') {
        transformReport = normalizeTransform(doc, { scale: decision.scale, mount: spec.mount });
      } else {
        // 尺寸达标或判定 waiver 也要落地：底面 y=0、x/z 居中（壁挂件不动）。
        transformReport = normalizeTransform(doc, { scale: [1, 1, 1], mount: spec.mount });
      }
      const after = worldBounds(doc);
      const afterStats = modelStatistics(doc);
      const deviationAfter = after.size.map((value, axis) => round(relativeDeviation(value, spec.size[axis]) ?? 0, 4));
      const triangleDelta = beforeStats.triangles
        ? round((afterStats.triangles - beforeStats.triangles) / beforeStats.triangles, 4)
        : 0;
      const row = {
        id,
        name: spec.name,
        mount: spec.mount,
        topologyClass: spec.topologyClass,
        decision: decision.mode,
        reason: decision.reason,
        scale: decision.scale.map((value) => round(value, 5)),
        before: {
          size: before.size.map((value) => round(value, 4)),
          triangles: beforeStats.triangles,
          vertices: beforeStats.vertices,
          // 拓扑用**清理引擎自己的口径**（本地坐标 + 按节点缩放折算的容差）：
          // 世界坐标固定 1e-5 的焊接在缩放过之后会跨过阈值，凭空多出几条非流形边，
          // 那是量尺换了、不是模型变坏了。
          nonManifoldEdges: cleanReport.before?.nonManifoldEdges ?? beforeStats.nonManifoldEdges,
          boundaryEdges: cleanReport.before?.boundaryEdges ?? beforeStats.boundaryEdges,
          shells: beforeStats.shells,
          auditNonManifoldEdges: beforeStats.nonManifoldEdges,
          auditBoundaryEdges: beforeStats.boundaryEdges,
        },
        after: {
          size: after.size.map((value) => round(value, 4)),
          triangles: afterStats.triangles,
          vertices: afterStats.vertices,
          nonManifoldEdges: cleanReport.after?.nonManifoldEdges ?? afterStats.nonManifoldEdges,
          boundaryEdges: cleanReport.after?.boundaryEdges ?? afterStats.boundaryEdges,
          shells: afterStats.shells,
          auditNonManifoldEdges: afterStats.nonManifoldEdges,
          auditBoundaryEdges: afterStats.boundaryEdges,
        },
        specSize: spec.size,
        deviationBefore: decision.deviation.map((value) => round(value, 4)),
        deviationAfter,
        triangleDelta,
        geometry: cleanReport,
        transform: transformReport,
        wrote: false,
        liteRegenerated: false,
      };
      if (write) {
        const target = fullPath ?? litePath;
        const guard = await writeGuarded(doc, target);
        row.materialGuard = guard;
        row.wrote = !guard.restored;
        if (guard.restored) {
          // 材质漂移 = 致命，直接放弃这件，别让 lite 去覆盖一个被改坏的完整件。
          row.error = `材质/纹理漂移已回滚：${guard.drift.join(', ')}`;
          results.push(row);
          continue;
        }
        if (litePath) {
          // lite 从**修好的完整件**重出：同一份几何，只差 Draco 压缩。
          const liteDoc = await loadDocument(fullPath ?? litePath);
          const liteGuard = await writeLiteGuarded(liteDoc, litePath, { write, reference: fullPath ?? litePath });
          liteDoc.getRoot().dispose?.();
          row.liteRegenerated = !liteGuard.restored;
          row.liteGuard = liteGuard;
        }
      }
      results.push(row);
    } catch (error) {
      results.push({ id, action: 'error', reason: error.message });
    } finally {
      doc.getRoot().dispose?.();
    }
  }

  const summary = {
    models: results.length,
    scaled: results.filter((row) => row.decision === 'uniform' || row.decision === 'per-axis').length,
    exact: results.filter((row) => row.decision === 'none').length,
    waivers: results.filter((row) => row.decision === 'waiver').length,
    errors: results.filter((row) => row.action === 'error').length,
    weldedVertices: results.reduce((sum, row) => sum + (row.geometry?.weldedVertices ?? 0), 0),
    degenerateFaces: results.reduce((sum, row) => sum + (row.geometry?.degenerateFaces ?? 0), 0),
    duplicatedFaces: results.reduce((sum, row) => sum + (row.geometry?.duplicatedFaces ?? 0), 0),
    holesFilled: results.reduce((sum, row) => sum + (row.geometry?.holesFilled ?? 0), 0),
    flipped: results.reduce((sum, row) => sum + (row.geometry?.flipped ?? 0), 0),
    nonManifoldBefore: results.reduce((sum, row) => sum + (row.before?.nonManifoldEdges ?? 0), 0),
    nonManifoldAfter: results.reduce((sum, row) => sum + (row.after?.nonManifoldEdges ?? 0), 0),
    boundaryBefore: results.reduce((sum, row) => sum + (row.before?.boundaryEdges ?? 0), 0),
    boundaryAfter: results.reduce((sum, row) => sum + (row.after?.boundaryEdges ?? 0), 0),
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    mode: write ? 'write' : 'dry-run',
    fillHoles,
    thresholds: { TARGET_DEVIATION, MAX_DEVIATION, MAX_NONUNIFORM },
    summary,
    models: results,
  };

  if (json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    return;
  }
  console.log(JSON.stringify(summary, null, 2));
  if (write) {
    fs.mkdirSync(docsDir, { recursive: true });
    const reportFile = path.join(docsDir, 'glb-geometry-repair.json');
    fs.writeFileSync(reportFile, JSON.stringify(payload, null, 2) + '\n');
    console.log('写入 ' + path.relative(repoRoot, reportFile));
  } else {
    console.log('（dry-run：加 --write 才落盘）');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
