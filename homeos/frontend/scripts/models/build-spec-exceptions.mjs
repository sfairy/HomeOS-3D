/**
 * 生成 `specs/spec-exceptions.json`：把「已经审过的几何例外」从实测数据固化成声明。
 *
 * 为什么单独一个文件：`model-specs.json` 是可重生成的（从注册表播种），例外是**人工决策**，
 * 不能每次重播种就丢。这里把两类例外算出来写成数据文件，`build-model-specs.mjs` 再合并进去：
 *
 * 1. `dimension`：规格与原生比例冲突。按主基准轴缩放会让另一轴形变 >10%（计划 §5 规则 2），
 *    强行拉伸会把部件压扁，因此保留原生比例并在 specs 里登记偏差。
 * 2. `topology`：机械修复（位置焊接 / 退化面清理 / 平面补洞）后仍有开口或非流形边。
 *    `open-sheet`（叶片 / 布片 / 玻璃 / 地毯）是合法薄片；`solid` 件则是导出器把薄片与装饰件
 *    拆成独立壳、逐壳闭合但整件不是单一闭合体，本轮不强行重拓扑。
 *
 * 用法：
 *   bun scripts/models/build-spec-exceptions.mjs           # dry-run，打印统计
 *   bun scripts/models/build-spec-exceptions.mjs --write   # 写 specs/spec-exceptions.json
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  collectModelVariants,
  listModelFiles,
  modelsDir,
  relativeDeviation,
  repoRoot,
  round,
  specsDir,
} from './lib/glb-io.mjs'
import { loadDocument, modelStatistics, worldBounds } from './lib/model-document.mjs'

const specsFile = path.join(specsDir, 'model-specs.json')
const exceptionsFile = path.join(specsDir, 'spec-exceptions.json')

/** 与 `audit_glb_geometry.mjs` 同口径：超过 5% 才算尺寸例外。 */
const MAX_DEVIATION = 0.05

const OPEN_SHEET_REASON =
  '薄片类（叶片 / 布片 / 玻璃 / 地毯 / 挂画）按单层双面建模，开口是设计意图，不是破面'
const SOLID_REASON =
  '导出器把薄片与装饰件拆成独立壳，逐壳闭合但整件不是单一闭合体；本轮只做焊接 / 退化面清理 / 平面补洞，不强行重拓扑'

function loadSpecs() {
  const payload = JSON.parse(fs.readFileSync(specsFile, 'utf8'))
  return new Map(payload.models.map((spec) => [spec.id, spec]))
}

async function measure(relativePath) {
  const doc = await loadDocument(path.join(modelsDir, relativePath))
  const statistics = modelStatistics(doc)
  const bounds = worldBounds(doc)
  return { statistics, size: bounds.size }
}

function dimensionException({ spec, size, deviation }) {
  const axis = deviation.indexOf(Math.max(...deviation))
  const labels = ['宽', '高', '深']
  return {
    type: 'dimension',
    reason:
      `原生比例与规格冲突；实测 ${size.map((value) => value.toFixed(3)).join('×')} m ` +
      `对规格 ${spec.size.join('×')} m，${labels[axis]}轴偏差 ${(deviation[axis] * 100).toFixed(1)}%；` +
      '按主基准轴缩放会把其余轴压扁，因此保留原生比例并登记例外',
    evidence: {
      measured: size.map((value) => round(value, 4)),
      spec: spec.size,
      deviation: deviation.map((value) => round(value, 4)),
    },
    risk: '尺寸不确定',
    confidence: 0.6,
  }
}

function topologyException({ spec, statistics }) {
  const sheet = spec.topologyClass === 'open-sheet'
  return {
    type: 'topology',
    reason: sheet ? OPEN_SHEET_REASON : SOLID_REASON,
    evidence: {
      nonManifoldEdges: statistics.nonManifoldEdges,
      boundaryEdges: statistics.boundaryEdges,
      shells: statistics.shells,
    },
    risk: sheet ? '薄片例外' : '形态风格差异',
    confidence: sheet ? 0.9 : 0.7,
  }
}

async function main() {
  const write = process.argv.includes('--write')
  const specs = loadSpecs()
  const variants = collectModelVariants(listModelFiles())
  const models = {}
  const stats = { models: 0, dimension: 0, topology: 0 }

  for (const [id, spec] of [...specs].sort(([left], [right]) => left.localeCompare(right))) {
    const relative = variants.get(id)?.full ?? variants.get(id)?.lite
    if (!relative) continue
    const { statistics, size } = await measure(relative)
    const deviation = spec.size.map((value, axis) => Math.abs(relativeDeviation(size[axis], value) ?? 0))
    const exceptions = []
    if (Math.max(...deviation) > MAX_DEVIATION) {
      exceptions.push(dimensionException({ spec, size, deviation }))
    }
    if (statistics.nonManifoldEdges > 0 || statistics.boundaryEdges > 0) {
      exceptions.push(topologyException({ spec, statistics }))
    }
    if (!exceptions.length) continue
    models[id] = exceptions
    stats.models += 1
    stats.dimension += exceptions.filter((exception) => exception.type === 'dimension').length
    stats.topology += exceptions.filter((exception) => exception.type === 'topology').length
  }

  console.log(JSON.stringify(stats, null, 2))
  if (!write) {
    console.log(`dry-run：${Object.keys(models).length} 款有例外（加 --write 才落盘）`)
    return
  }
  const payload = {
    generatedAt: '2026-10-23',
    note: '几何例外声明：dimension = 规格与原生比例冲突、保留原生比例；topology = 机械修复后仍有开口或非流形边。由 build-spec-exceptions.mjs 生成，build-model-specs.mjs 合并进 model-specs.json。',
    thresholds: { maxDeviation: MAX_DEVIATION },
    models,
  }
  fs.mkdirSync(specsDir, { recursive: true })
  fs.writeFileSync(exceptionsFile, JSON.stringify(payload, null, 2) + '\n')
  console.log(`写入 ${path.relative(repoRoot, exceptionsFile)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
