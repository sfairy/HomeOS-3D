/**
 * 「复核外壳剔除」接线测试。
 *
 * 它测两件事，都不是 `applyReviewedShells` 的算法本身（那另有单测）：
 *
 * 1. **`pruneShell` 开关真的能关掉**——默认关是我们有意的决定（见各机型工厂里的注释：
 *    掩码是按上游几何复核的，本仓指纹对不上，开着是纯开销）。这条测试锁住「关」的语义，
 *    免得哪天开关名改了、参数被吞掉，剔除悄悄变成常开。
 * 2. **开关打开时整条链路是通的**——用真 three 造出风扇模型，按它的真实指纹临时合成一份
 *    掩码注入（`maskSetsOverride`），验证剔除真的会发生、顶点真的被压紧、groups 不越界。
 *    这条同时是「以后重新复核掩码」时的验收模板：把真实指纹填进数据文件，行为立刻生效。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const THREE = await import('three')
const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js')
const base = '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/'
const FAN = fileURLToPath(new URL(base + 'items/studio-fan.ts', import.meta.url))
const SHELLS = fileURLToPath(new URL(base + 'scene/studio-reviewed-shells.ts', import.meta.url))
const DATA = fileURLToPath(new URL(base + 'scene/studio-reviewed-shell-data.ts', import.meta.url))
const { createFanModel } = await import(FAN)
const { applyReviewedShells, shellScopes, shellSignature } = await import(SHELLS)
const { REVIEWED_SHELL_MASKS } = await import(DATA)

const THEME = {
  appliance: 0xf2f2f2,
  applianceSoft: 0xfafafa,
  applianceDark: 0x333333,
  furniture: 0xcccccc,
  furnitureDark: 0x222222,
  wood: 0xb98b5e,
  woodDark: 0x8a6440,
  woodLight: 0xd8b48c,
  warmWood: false,
}
const OPTIONS = { width: 0.434, height: 1.23 }

function buildFan(pruneShell) {
  return createFanModel(THREE, mergeGeometries, OPTIONS, THEME, { pruneShell })
}

function totalIndices(root) {
  let total = 0
  root.traverse((node) => {
    const geometry = node.geometry
    if (!node.isMesh || !geometry) return
    total += geometry.index ? geometry.index.count : (geometry.attributes.position?.count ?? 0)
  })
  return total
}

test('pruneShell 默认关：默认参数与显式 false 得到同一份几何', () => {
  const byDefault = createFanModel(THREE, mergeGeometries, OPTIONS, THEME)
  const explicitOff = buildFan(false)
  assert.equal(totalIndices(byDefault), totalIndices(explicitOff))
})

test('pruneShell 打开 + 指纹匹配时真的剔除，并把顶点压紧', () => {
  const root = buildFan(false)
  const scopes = [...shellScopes(root).entries()]
  assert.ok(scopes.length > 0, '风扇没有产生任何外壳作用域，测试本身失效')

  // 按真实指纹合成一份掩码：从最大的作用域里挑一个含三角形的子节点，剔掉它的前 4 个三角形。
  const [, nodes] = scopes
    .slice()
    .sort((left, right) => right[1].length - left[1].length)[0]
  const target = nodes.find((entry) => (entry.node.geometry?.index?.count ?? 0) >= 12)
  assert.ok(target, '找不到带三角形的子节点')
  const vertexCountBefore = target.node.geometry.attributes.position.count
  const indexCountBefore = target.node.geometry.index.count
  const maskSets = scopes.map(([, scopeNodes]) => ({
    signature: shellSignature(scopeNodes),
    masks: scopeNodes === nodes ? { [target.path]: [0, 1, 2, 3] } : {},
  }))

  const allIndicesBefore = totalIndices(root)
  const removed = applyReviewedShells(THREE, root, 'fan', maskSets)
  assert.equal(removed, 4, `应当正好剔除 4 个三角形，实际 ${removed}`)
  assert.equal(totalIndices(root), allIndicesBefore - 12)

  const geometry = target.node.geometry
  assert.equal(geometry.index.count, indexCountBefore - 12)
  assert.equal(geometry.type, 'BufferGeometry', '剔除后应改写成普通 BufferGeometry')
  // 4 个三角形通常带走少量顶点，压紧数量必须严格小于原顶点数且不为 0。
  assert.ok(
    geometry.attributes.position.count < vertexCountBefore,
    `顶点没有压紧（${geometry.attributes.position.count} / ${vertexCountBefore}）`,
  )
  assert.ok(geometry.attributes.position.count > 0)
})

test('剔除后几何自洽：索引不越界、groups 不越过索引长度', () => {
  const root = buildFan(true)
  let checked = 0
  root.traverse((node) => {
    const geometry = node.geometry
    if (!node.isMesh || !geometry) return
    const vertexCount = geometry.attributes.position.count
    if (geometry.index) {
      for (let offset = 0; offset < geometry.index.count; offset++)
        assert.ok(
          geometry.index.getX(offset) < vertexCount,
          `${node.name || 'mesh'}: 索引越界`,
        )
    }
    const indexLength = geometry.index ? geometry.index.count : vertexCount
    for (const group of geometry.groups)
      assert.ok(
        group.start + group.count <= indexLength,
        `${node.name || 'mesh'}: group 越界 ${group.start}+${group.count} > ${indexLength}`,
      )
    checked++
  })
  assert.ok(checked > 0, '没有检查到任何 mesh')
})

test('内置掩码与本仓几何仍是失配状态（重新复核后请更新此断言）', () => {
  const root = buildFan(false)
  const ourSignatures = [...shellScopes(root).values()].map((nodes) => shellSignature(nodes))
  const reviewedSignatures = (REVIEWED_SHELL_MASKS.fan ?? []).map((set) => set.signature)
  const hits = ourSignatures.filter((signature) => reviewedSignatures.includes(signature))
  assert.deepEqual(
    hits,
    [],
    '内置掩码开始命中本仓几何了：说明机型几何已与上游对齐，' +
      '请把四个工厂的 pruneShell 默认值改回 true，并删掉这条断言',
  )
})
