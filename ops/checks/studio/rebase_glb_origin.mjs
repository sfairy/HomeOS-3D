#!/usr/bin/env bun
/**
 * GLB 原点重定基（默认 dry-run）：把几何沿 Y 平移，让「原点」落在应有的锚点上。
 *
 * ## 为什么用节点平移而不是改顶点
 *
 * 同一个 `min.y` 偏移既可以改 POSITION 顶点，也可以改根节点的 `translation`。后者：
 * - 只动 JSON chunk，**BIN 与 Draco 流逐字节保留**（lite 解压重压会让小文件膨胀，实测过 127%）；
 * - 与 `scaleBasis` 无关（缩放按包围盒算，平移不改包围盒尺寸）；
 * - 可逆、可审计（`extras.homeosOriginRebaseY` 记录做过的量，重复运行会跳过）。
 *
 * ## 什么时候该用
 *
 * 判据是**同类模型的一致性**，不是单个模型好看与否：
 * - 291 个地面 / 台面件的几何都从 `y=0` 起，只有 `shower` 从 3.15cm 起 → 悬空；
 * - 34 个挂墙件的几何都从 `y=0` 起，只有 `wallcabinet` 从 1.3775m 起 → 「离地」字段
 *   对它是偏移量而不是绝对高度。
 *
 * 两者都在 `NEGATIVE_ELEVATION_ITEM_TYPES` 里靠「允许负离地」绕过 —— 那是症状，不是修复。
 *
 * ## 注意
 *
 * 重定基会**改变存量场景里该模型的视觉位置**（原点变了，而场景存的是原点坐标）。
 * 这里只对「本来就摆错」的模型执行，并在表里逐条写清位移量与原因。
 *
 * 用法：
 * ```bash
 * bun ops/checks/studio/rebase_glb_origin.mjs            # dry-run
 * bun ops/checks/studio/rebase_glb_origin.mjs --write    # 落盘
 * ```
 */

import path from 'node:path'
import {
  collectModelVariants,
  listModelFiles,
  modelsDir,
  patchGlbJson,
  repoRoot,
} from '../../../homeos/frontend/scripts/models/lib/glb-io.mjs'

/**
 * 重定基表：`模型 id → 沿 Y 下移的量（米）`。
 *
 * 值 = 实测 `min.y`（重定基后该模型的几何从 `y=0` 起）。新增条目必须同时给出：
 * 实测 `min.y` 的来源、同类模型的一致性证据、以及是否需要同步改目录默认 `elevation`。
 */
const REBASES = Object.freeze({
  shower: {
    y: 0.0315,
    reason: '几何从 3.15cm 起，地面件应贴地；其余 291 个地面/台面件都是从 y=0 起',
    catalogElevation: null,
  },
  wallcabinet: {
    y: 1.3775,
    reason:
      '挂柜把安装高度（1.3775m）烘进了几何；其余 34 个挂墙件都从 y=0 起、靠 elevation 抬高。' +
      '重定基后由目录默认 elevation 1.3775 保持原来挂高',
    catalogElevation: 1.3775,
  },
})

const write = process.argv.includes('--write')
const only = (() => {
  const index = process.argv.indexOf('--model')
  return index >= 0 ? process.argv[index + 1] : undefined
})()

/** 取该 GLB 的世界 `min.y`：单节点模型下 = 各 primitive accessor 的 min[1] 最小值。 */
function localMinY(json) {
  let min = Infinity
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.listPrimitives?.() ?? mesh.primitives ?? []) {
      const accessorIndex = primitive.attributes?.POSITION
      const accessor = json.accessors?.[accessorIndex]
      if (accessor?.min) min = Math.min(min, accessor.min[1])
    }
  }
  return min
}

/** 场景根节点（重定基只落在它们身上）。 */
function rootNodes(json) {
  const indices = new Set()
  for (const scene of json.scenes ?? []) for (const index of scene.nodes ?? []) indices.add(index)
  return [...indices].map((index) => json.nodes[index]).filter(Boolean)
}

const variants = collectModelVariants(listModelFiles())
const targets = [...variants.keys()]
  .filter((id) => REBASES[id])
  .filter((id) => !only || id === only)
  .sort()

if (!targets.length) {
  console.log(`没有待重定基的模型${only ? `（${only} 不在表里）` : ''}`)
  process.exit(0)
}

let changed = 0
for (const id of targets) {
  const rule = REBASES[id]
  for (const [kind, relativePath] of Object.entries(variants.get(id))) {
    const absolute = path.join(modelsDir, relativePath)
    const result = patchGlbJson(
      absolute,
      (json) => {
        const nodes = rootNodes(json)
        if (!nodes.length) return false
        if (nodes.some((node) => node.extras?.homeosOriginRebaseY !== undefined)) {
          console.log(`  ${relativePath}：已重定基过，跳过`)
          return false
        }
        const minY = localMinY(json)
        if (!Number.isFinite(minY)) throw new Error(`${relativePath}：读不到 POSITION min`)
        // 断言「待修的量」与表里登记的一致，防止资产被换掉后静默平移错值。
        if (Math.abs(minY - rule.y) > 0.002) {
          throw new Error(`${relativePath}：实测 min.y=${minY}，与表里登记的 ${rule.y} 不符，中止`)
        }
        for (const node of nodes) {
          const [tx, ty, tz] = node.translation ?? [0, 0, 0]
          node.translation = [+tx.toFixed(6), +(ty - rule.y).toFixed(6), +tz.toFixed(6)]
          node.extras = { ...(node.extras ?? {}), homeosOriginRebaseY: rule.y }
        }
        return true
      },
      { dryRun: !write },
    )
    console.log(
      `  ${relativePath}（${kind}）：${result.changed ? '下移 ' + rule.y + 'm' : '无需改动'}` +
        (result.changed ? `，${result.bytesBefore} → ${result.bytesAfter} 字节` : ''),
    )
    if (result.changed) changed += 1
  }
}

console.log(`\n${write ? '已落盘' : 'dry-run'}：${changed} 个文件待改。仓库根 ${path.relative(repoRoot, modelsDir)}`)
for (const id of targets) console.log(`  · ${id}：${REBASES[id].reason}`)
if (!write) console.log('\n（加 --write 才落盘）')
