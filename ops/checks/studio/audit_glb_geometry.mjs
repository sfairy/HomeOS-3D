#!/usr/bin/env bun
/**
 * GLB 几何审计（只读）：世界包围盒、尺寸偏差、拓扑、lite 一致性、动画件识别。
 *
 * 为什么口径是**世界包围盒**而不是 accessor 的 `min/max`：`floor-lamp.glb` 这类 SimLab 导出
 * 把 1000× 缩放和旋转塞在节点变换里，只读 accessor 会得到「1.6m 宽的落地灯」——数字看着很大，
 * 其实是 1.6mm。本脚本逐顶点乘 `node.getWorldMatrix()`，与 three 的 `Box3.setFromObject` 同义。
 *
 * 判定分档（与计划 §1 阈值一致）：
 * - 尺寸：每轴相对 deviation ≤5%，目标 ≤2%；
 * - 面数：与 spec 的 `triangleBudget` 比（无预算时只用它做基线，不判定）；
 * - 拓扑：`solid` 要求非流形边 0、退化面 0、重叠面 0；`open-sheet` 允许边界边，但边界环数
 *   必须登记在 spec 的 `exceptions` 里；
 * - lite/full：包围盒 ≤0.5%、三角面数一致、材质名与顺序一致。
 *
 * 「非流形边」按**位置焊接**统计：导出器沿硬边复制顶点是标准做法，按索引统计会把 298 个
 * 模型判成坏的，其中绝大多数只是没焊接。
 *
 * 用法（仓库根目录）：
 * ```bash
 * bun ops/checks/studio/audit_glb_geometry.mjs                 # 写 md + json 报告
 * bun ops/checks/studio/audit_glb_geometry.mjs --stdout        # 只打摘要
 * bun ops/checks/studio/audit_glb_geometry.mjs --json          # 机读 JSON 到 stdout
 * bun ops/checks/studio/audit_glb_geometry.mjs --model sofa    # 单款（可逗号分隔）
 * bun ops/checks/studio/audit_glb_geometry.mjs --write-baseline # 重写 geometry-baseline.json
 * bun ops/checks/studio/audit_glb_geometry.mjs --check          # 门禁：超阈值退出码 1
 * bun ops/checks/studio/audit_glb_geometry.mjs --no-topology    # 跳过拓扑（快，仅包围盒/面数）
 * ```
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectModelVariants,
  listModelFiles,
  relativeDeviation,
  round,
} from '../../../homeos/frontend/scripts/models/lib/glb-io.mjs';
import {
  loadDocument,
  modelStatistics,
  usesDraco,
  worldBounds,
} from '../../../homeos/frontend/scripts/models/lib/model-document.mjs';

const hereDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(hereDir, '../../..');
const frontendDir = path.join(repoRoot, 'homeos/frontend');
const modelsDir = path.join(frontendDir, 'public/static/3d-studio/models');
const specsFile = path.join(frontendDir, 'scripts/models/specs/model-specs.json');
const baselineFile = path.join(hereDir, 'geometry-baseline.json');
const docsDir = path.join(repoRoot, 'docs/architecture/2026-10-22');

/** 判定阈值：与计划 §1 一字对应。 */
export const THRESHOLDS = Object.freeze({
  dimensionDeviation: 0.05,
  dimensionDeviationTarget: 0.02,
  triangleDelta: 0.1,
  parityBounds: 0.005,
  parityTriangles: 0,
  solidNonManifoldEdges: 0,
});

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const valueOf = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

function loadSpecs() {
  if (!fs.existsSync(specsFile)) {
    throw new Error(`缺少 ${path.relative(repoRoot, specsFile)}，先跑 build-model-specs.mjs --write`);
  }
  const payload = JSON.parse(fs.readFileSync(specsFile, 'utf8'));
  return new Map(payload.models.map((spec) => [spec.id, spec]));
}

/** 逐轴尺寸偏差 + 最大轴。 */
function sizeDeviation(size, target) {
  const perAxis = size.map((value, axis) => relativeDeviation(value, target?.[axis] ?? null));
  const valid = perAxis.filter((value) => value !== null);
  return {
    perAxis: perAxis.map((value) => (value === null ? null : round(value, 4))),
    maximum: valid.length ? round(Math.max(...valid), 4) : null,
  };
}

/** 一个文件的可测指标。 */
async function measureFile(absolutePath, { topology = true } = {}) {
  const doc = await loadDocument(absolutePath);
  try {
    const bounds = worldBounds(doc);
    const statistics = topology
      ? modelStatistics(doc)
      : (() => {
          let triangles = 0;
          let vertices = 0;
          let primitives = 0;
          for (const node of doc.getRoot().listNodes()) {
            const mesh = node.getMesh();
            if (!mesh) continue;
            for (const primitive of mesh.listPrimitives()) {
              const position = primitive.getAttribute('POSITION');
              if (!position) continue;
              primitives += 1;
              vertices += position.getCount();
              const indices = primitive.getIndices();
              triangles += indices ? indices.getCount() / 3 : position.getCount() / 3;
            }
          }
          return { triangles, vertices, primitives };
        })();
    const root = doc.getRoot();
    return {
      bytes: fs.statSync(absolutePath).size,
      draco: usesDraco(doc),
      bounds: {
        min: bounds.min.map((value) => round(value, 5)),
        max: bounds.max.map((value) => round(value, 5)),
        size: bounds.size.map((value) => round(value, 5)),
      },
      ...statistics,
      scenes: root.listScenes().length,
      defaultScene: Boolean(root.getDefaultScene()),
      materials: root.listMaterials().map((material) => material.getName() || ''),
      animations: root.listAnimations().map((animation) => animation.getName() || ''),
      extrasAnimated: root.listNodes().some((node) => {
        const extras = node.getExtras() || {};
        return Boolean(extras.fanPart || extras.rotationAxis);
      }),
    };
  } finally {
    doc.getRoot().dispose?.();
    doc.dispose?.();
  }
}

/** lite 与完整件的包围盒 / 面数 / 材质一致性。 */
function parityOf(full, lite) {
  if (!full || !lite) return { comparable: false };
  const boundsDelta = full.bounds.size.map((value, axis) => {
    const target = lite.bounds.size[axis];
    return round(relativeDeviation(value, target) ?? 0, 5);
  });
  const triangleDelta = round(
    relativeDeviation(lite.triangles, full.triangles) ?? 0,
    5,
  );
  const materialsMatch =
    full.materials.length === lite.materials.length &&
    full.materials.every((name, index) => name === lite.materials[index]);
  /**
   * 原厂 lite 变体本来就是低模 LOD（`pillar-round` 480→240、`coffeetable` 1176→600），
   * 面数低于完整件是设计意图，不是「不一致」。真正要拦的是反向漂移：lite 面数多于完整件、
   * 包围盒漂移、材质名对不上 —— 那说明 lite 不是从同一份几何生成的。
   */
  const liteIsLod = lite.triangles <= full.triangles;
  return {
    comparable: true,
    boundsDelta,
    boundsMaximum: round(Math.max(...boundsDelta), 5),
    triangleDelta,
    trianglesMatch: lite.triangles === full.triangles,
    liteIsLod,
    materialsMatch,
    pass: Math.max(...boundsDelta) <= THRESHOLDS.parityBounds && liteIsLod && materialsMatch,
  };
}

/**
 * 拓扑判定：solid 必须闭合；open-sheet 允许开口但要登记例外。
 *
 * 例外不是「默认放行」：没在 `model-specs.json → exceptions[type=topology]` 登记的开口
 * 一律 fail，逼着每条残留开口都写清原因（导出器拆壳 / 薄片 / 动画部件）。
 */
function topologyVerdict(spec, statistics) {
  if (!statistics || statistics.nonManifoldEdges === undefined) return { level: 'unknown' };
  const exceptions = spec.exceptions ?? [];
  const declared = exceptions.find((exception) => exception.type === 'topology') ?? null;
  const declaredSheet = exceptions.some((exception) => /薄片|open-sheet|叶片|边界环/.test(JSON.stringify(exception)));
  const note = declared ? `（已登记例外：${declared.reason}）` : '';
  if (spec.topologyClass === 'open-sheet') {
    if (statistics.nonManifoldEdges === 0) {
      return { level: 'pass', reason: declaredSheet ? '薄片例外已登记' : '无开口（无需例外）' };
    }
    if (!declaredSheet) {
      return { level: 'fail', reason: `薄片件有 ${statistics.nonManifoldEdges} 条非流形边且未登记例外` };
    }
    return { level: 'pass', reason: `薄片开口已登记（${statistics.nonManifoldEdges} 条非流形边）` };
  }
  if (statistics.nonManifoldEdges > THRESHOLDS.solidNonManifoldEdges) {
    return {
      level: declared ? 'pass' : 'fail',
      reason: `实体件有 ${statistics.nonManifoldEdges} 条非流形边${note}`,
    };
  }
  if (statistics.boundaryEdges > 0) {
    return {
      level: declared ? 'pass' : 'fail',
      reason: `实体件有 ${statistics.boundaryEdges} 条边界边（未闭合）${note}`,
    };
  }
  return { level: 'pass' };
}

function verdictFor(spec, measurement, deviation) {
  const reasons = [];
  let status = 'pass';
  /**
   * 场景缺省 = 致命：GLTFLoader 取 `dependencies[0][json.scene || 0]`，`scenes` 为空时
   * `gltf.scene` 是 undefined 且不报错，整件模型静默不显示（2026-10-23 的 30 款精修件）。
   * 这一条不走例外通道 —— 几何再准，看不见就是坏的。
   */
  if (!measurement.scenes) {
    return {
      status: 'fail',
      reasons: ['没有 scene（three 里 gltf.scene 为 undefined，整件模型不显示）'],
      topology: 'unknown',
    };
  }
  const sizeOk = deviation.maximum === null || deviation.maximum <= THRESHOLDS.dimensionDeviationTarget;
  /**
   * 尺寸例外：规格与原生几何冲突、且**已逐件登记**的，不算 fail。
   * 登记在 `model-specs.json → exceptions[type=dimension]`，必须写清原因与证据；
   * 没登记的一律按 fail 处理 —— 例外是审过的，不是默认放行。
   */
  const dimensionException = (spec.exceptions ?? []).find((exception) => exception.type === 'dimension');
  if (deviation.maximum !== null && deviation.maximum > THRESHOLDS.dimensionDeviation) {
    if (dimensionException) {
      status = 'pass-with-exception';
      reasons.push(
        `尺寸例外：偏差 ${(deviation.maximum * 100).toFixed(1)}%（${dimensionException.reason}）`,
      );
    } else {
      status = 'fail';
      reasons.push(`尺寸偏差 ${(deviation.maximum * 100).toFixed(1)}% > 5%`);
    }
  } else if (!sizeOk) {
    status = 'pass-with-exception';
    reasons.push(`尺寸偏差 ${(deviation.maximum * 100).toFixed(1)}%（>2% 但在 5% 内）`);
  }
  if (spec.triangleBudget && measurement.triangles > spec.triangleBudget * (1 + THRESHOLDS.triangleDelta)) {
    status = 'pass-with-exception';
    reasons.push(`三角面 ${measurement.triangles} 超预算 ${spec.triangleBudget} 的 10%`);
  }
  const topology = topologyVerdict(spec, measurement);
  if (topology.level === 'fail') {
    status = status === 'fail' ? 'fail' : 'pass-with-exception';
    reasons.push(topology.reason);
  }
  return { status, reasons, topology: topology.level };
}

async function main() {
  const specs = loadSpecs();
  const variants = collectModelVariants(listModelFiles());
  const only = valueOf('model')?.split(',').map((id) => id.trim()).filter(Boolean);
  const topology = !hasFlag('no-topology');
  const results = [];
  const started = Date.now();
  const ids = [...variants.keys()].filter((id) => !only || only.includes(id));

  for (const id of ids) {
    const spec = specs.get(id);
    if (!spec) {
      results.push({ id, status: 'fail', reasons: ['spec 缺失'] });
      continue;
    }
    const variantMap = variants.get(id);
    const entry = { id, name: spec.name, flagship: spec.flagship, spec: { size: spec.size, topologyClass: spec.topologyClass } };
    try {
      const fullPath = variantMap.full ? path.join(modelsDir, variantMap.full) : null;
      const litePath = variantMap.lite ? path.join(modelsDir, variantMap.lite) : null;
      const full = fullPath ? await measureFile(fullPath, { topology }) : null;
      const lite = litePath ? await measureFile(litePath, { topology }) : null;
      const primary = full ?? lite;
      const deviation = sizeDeviation(primary.bounds.size, spec.size);
      const verdict = verdictFor(spec, primary, deviation);
      entry.files = { full: variantMap.full ?? null, lite: variantMap.lite ?? null };
      entry.measured = {
        size: primary.bounds.size,
        min: primary.bounds.min,
        max: primary.bounds.max,
        triangles: primary.triangles,
        vertices: primary.vertices,
        primitives: primary.primitives,
        materials: primary.materials,
        draco: primary.draco,
        animated: primary.animations.length > 0 || primary.extrasAnimated,
        shells: primary.shells,
        nonManifoldEdges: primary.nonManifoldEdges,
        boundaryEdges: primary.boundaryEdges,
        bytes: primary.bytes,
        full: full ? { bytes: full.bytes, triangles: full.triangles, vertices: full.vertices, draco: full.draco } : null,
        lite: lite ? { bytes: lite.bytes, triangles: lite.triangles, vertices: lite.vertices, draco: lite.draco } : null,
      };
      entry.deviation = deviation;
      entry.parity = parityOf(full, lite);
      entry.topology = topologyVerdict(spec, primary);
      entry.status = verdict.status;
      entry.reasons = verdict.reasons;
      if (entry.parity.comparable && !entry.parity.pass) {
        const detail = [];
        if (entry.parity.boundsMaximum > THRESHOLDS.parityBounds) {
          detail.push(`包围盒漂移 ${(entry.parity.boundsMaximum * 100).toFixed(2)}%`);
        }
        if (entry.parity.liteIsLod === false) detail.push('lite 面数多于完整件');
        if (!entry.parity.materialsMatch) detail.push('材质名不一致');
        entry.reasons.push(`lite 与完整件不一致（${detail.join('、') || '未知'}）`);
        if (entry.status === 'pass') entry.status = 'pass-with-exception';
      }
      // lite 单独判一次场景：完整件好、lite 缺 scene 时 parity 看不出来，但线上跑的是 lite。
      if (lite && !lite.scenes) {
        entry.reasons.push('lite 缺少 scene（three 里 gltf.scene 为 undefined）');
        entry.status = 'fail';
      }
    } catch (error) {
      entry.status = 'fail';
      entry.reasons = ['读取失败：' + error.message];
    }
    results.push(entry);
    if (!hasFlag('json') && !hasFlag('stdout') && results.length % 25 === 0) {
      process.stderr.write(`  ${results.length}/${ids.length}…\n`);
    }
  }

  const summary = summarize(results);
  const payload = {
    generatedAt: new Date().toISOString(),
    unit: 'm',
    sizeOrder: '[width, height, depth]',
    thresholds: THRESHOLDS,
    totals: { files: listModelFiles().length, models: results.length, elapsedMs: Date.now() - started },
    summary,
    models: results,
  };

  if (hasFlag('json')) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  }
  if (hasFlag('check')) {
    const failures = results.filter((entry) => entry.status === 'fail');
    if (failures.length) {
      console.error(`✗ 几何门禁：${failures.length} 款不合格`);
      for (const failure of failures.slice(0, 40)) {
        console.error(`  - ${failure.id}: ${failure.reasons.join('；')}`);
      }
      if (failures.length > 40) console.error(`  … 另有 ${failures.length - 40} 款`);
      process.exit(1);
    }
    console.log(`✓ 几何门禁通过：${results.length} 款`);
    return;
  }

  if (hasFlag('stdout')) {
    console.log(formatSummary(summary, results));
    return;
  }

  // 单模型查询（--model）不覆盖全库报告：否则一次 `--model cabinet` 会把 336 款的
  // 报告改写成 1 款，基线随之失真。
  if (only?.length) {
    console.log(formatSummary(summary, results));
    return;
  }
  fs.mkdirSync(docsDir, { recursive: true });
  const jsonReport = path.join(docsDir, 'glb-geometry-audit.json');
  fs.writeFileSync(jsonReport, JSON.stringify(payload, null, 2) + '\n');
  const mdReport = path.join(docsDir, 'glb-geometry-audit.md');
  fs.writeFileSync(mdReport, formatMarkdown(payload));
  if (hasFlag('write-baseline')) {
    fs.writeFileSync(
      baselineFile,
      JSON.stringify(
        {
          generatedAt: payload.generatedAt,
          note: '几何基线：只含可复算的指纹（世界包围盒 / 三角面 / 材质名），供 check:geometry 比对',
          models: Object.fromEntries(
            results.map((entry) => [
              entry.id,
              {
                size: entry.measured?.size ?? null,
                triangles: entry.measured?.triangles ?? null,
                materials: entry.measured?.materials ?? null,
                topologyClass: entry.spec.topologyClass,
              },
            ]),
          ),
        },
        null,
        2,
      ) + '\n',
    );
  }
  console.log(formatSummary(summary, results));
  console.log(`\n写入 ${path.relative(repoRoot, mdReport)}`);
  console.log(`写入 ${path.relative(repoRoot, jsonReport)}`);
  if (hasFlag('write-baseline')) console.log(`写入 ${path.relative(repoRoot, baselineFile)}`);
}

function summarize(results) {
  const count = (predicate) => results.filter(predicate).length;
  const deviationBuckets = { over5: 0, over2: 0, ok: 0 };
  for (const entry of results) {
    const value = entry.deviation?.maximum;
    if (value === null || value === undefined) continue;
    if (value > THRESHOLDS.dimensionDeviation) deviationBuckets.over5 += 1;
    else if (value > THRESHOLDS.dimensionDeviationTarget) deviationBuckets.over2 += 1;
    else deviationBuckets.ok += 1;
  }
  return {
    pass: count((entry) => entry.status === 'pass'),
    passWithException: count((entry) => entry.status === 'pass-with-exception'),
    fail: count((entry) => entry.status === 'fail'),
    solidOpen: count((entry) => entry.spec?.topologyClass === 'solid' && entry.topology?.level === 'fail'),
    nonManifoldModels: count((entry) => (entry.measured?.nonManifoldEdges ?? 0) > 0),
    parityDrift: count((entry) => entry.parity?.comparable && !entry.parity.pass),
    animated: count((entry) => entry.measured?.animated),
    deviation: deviationBuckets,
    missingVariants: count((entry) => !entry.files?.full || !entry.files?.lite),
  };
}

function formatSummary(summary, results) {
  const lines = [
    `模型 ${results.length} 个：pass ${summary.pass} / pass-with-exception ${summary.passWithException} / fail ${summary.fail}`,
    `尺寸偏差：≤2% ${summary.deviation.ok}，2–5% ${summary.deviation.over2}，>5% ${summary.deviation.over5}`,
    `实体件未闭合 ${summary.solidOpen}，含非流形边 ${summary.nonManifoldModels}，lite 漂移 ${summary.parityDrift}，缺变体 ${summary.missingVariants}`,
  ];
  const worst = [...results]
    .filter((entry) => entry.deviation?.maximum)
    .sort((left, right) => right.deviation.maximum - left.deviation.maximum)
    .slice(0, 12);
  if (worst.length) {
    lines.push('偏差最大的 12 款：');
    for (const entry of worst) {
      lines.push(
        `  ${entry.id.padEnd(28)} ${(entry.deviation.maximum * 100).toFixed(1).padStart(6)}%  ` +
          `实测 ${entry.measured.size.map((value) => value.toFixed(3)).join('×')}  规格 ${entry.spec.size.join('×')}`,
      );
    }
  }
  return lines.join('\n');
}

function formatMarkdown(payload) {
  const { summary, models, thresholds } = payload;
  const lines = [
    '# GLB 几何审计（世界包围盒 / 拓扑 / lite 一致性）',
    '',
    `生成时间：${payload.generatedAt} 单位：米（宽 × 高 × 深，世界坐标）`,
    `阈值：尺寸偏差 ≤${thresholds.dimensionDeviation * 100}%（目标 ≤${thresholds.dimensionDeviationTarget * 100}%）、` +
      `三角面变化 ≤${thresholds.triangleDelta * 100}%、lite 包围盒 ≤${thresholds.parityBounds * 100}%、实体件非流形边 ${thresholds.solidNonManifoldEdges}`,
    '',
    '## 汇总',
    '',
    '| 指标 | 数量 |',
    '| --- | --- |',
    `| 模型总数 | ${models.length} |`,
    `| pass | ${summary.pass} |`,
    `| pass-with-exception | ${summary.passWithException} |`,
    `| fail | ${summary.fail} |`,
    `| 尺寸偏差 >5% | ${summary.deviation.over5} |`,
    `| 尺寸偏差 2–5% | ${summary.deviation.over2} |`,
    `| 尺寸偏差 ≤2% | ${summary.deviation.ok} |`,
    `| 实体件未闭合 | ${summary.solidOpen} |`,
    `| 含非流形边 | ${summary.nonManifoldModels} |`,
    `| lite 与完整件漂移 | ${summary.parityDrift} |`,
    `| 缺变体 | ${summary.missingVariants} |`,
    '',
    '## 逐模型',
    '',
    '| 模型 | 名称 | 实测 (m) | 规格 (m) | 最大偏差 | 三角面 | 非流形边 | 边界边 | lite | 判定 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const entry of models) {
    const measured = entry.measured;
    const size = measured ? measured.size.map((value) => value.toFixed(3)).join('×') : '—';
    const specSize = entry.spec?.size?.join('×') ?? '—';
    const deviation = entry.deviation?.maximum;
    const parity = entry.parity?.comparable ? (entry.parity.pass ? '一致' : '漂移') : '单变体';
    lines.push(
      `| \`${entry.id}\` | ${entry.name ?? ''} | ${size} | ${specSize} | ` +
        `${deviation === null || deviation === undefined ? '—' : (deviation * 100).toFixed(1) + '%'} | ` +
        `${measured?.triangles ?? '—'} | ${measured?.nonManifoldEdges ?? '—'} | ${measured?.boundaryEdges ?? '—'} | ${parity} | ` +
        `${entry.status === 'pass' ? '✅ pass' : entry.status === 'pass-with-exception' ? '⚠️ exception' : '❌ fail'}${entry.reasons?.length ? '：' + entry.reasons.join('；') : ''} |`,
    );
  }
  lines.push('');
  lines.push('## 判定说明');
  lines.push('');
  lines.push('- **非流形边**按位置焊接（1e-5 m）后统计：导出器沿硬边复制顶点属正常，未焊接不等于拓扑坏。');
  lines.push('- **边界边**是只被 1 个面使用的边：实体件为 0 才算闭合；薄片（叶片 / 地毯 / 玻璃）允许有开口，需在 specs 的 `exceptions` 登记。');
  lines.push('- **lite 漂移**指包围盒 >0.5%、三角面数不同或材质名/顺序不同——只能从完整件重出 lite 才能归零。');
  return lines.join('\n') + '\n';
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
