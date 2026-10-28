/**
 * 标签配置补丁（0.8.1 `createLabelConfigPatch` / `applyLabelConfigPatch`）的契约测试。
 *
 * 这条通道的存在意义是：编辑端改一个标签不该让舞台重建整份配置。补丁一旦「少打」
 * 或「打错位置」，舞台就会停在旧标签上且没有任何报错 —— 所以这里锁三类契约：
 *
 * 1. 白名单外的东西一律返回 `null`（调用方必须退回整份配置）；
 * 2. 打出来的补丁必须能把 A 精确变成 B；
 * 3. 补丁无法安全应用时必须返回 `null`，不能「尽力而为」。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const MODULE = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/runtime/core/state-update-plan.ts',
    import.meta.url,
  ),
)

const { createLabelConfigPatch, applyLabelConfigPatch } = await import(MODULE)

function baseDocument() {
  return {
    floorSelection: 'all',
    properties: {
      lightingMode: 'region',
      devices: {
        nas: [{ id: 'nas-1', floorId: 'f1', label: 'NAS', x: 1, y: 2 }],
        vacuums: [
          {
            id: 'vac-1',
            floorId: 'f1',
            label: '扫地机',
            shortcuts: [{ id: 'short-1', size: 1.5, label: '回充' }],
          },
        ],
      },
      environment: {
        airers: [{ id: 'airer-1', floorId: 'f1', label: '晾衣架', tirePressure: { mode: 'both' } }],
        curtains: [{ id: 'curtain-1', floorId: 'f1', label: '窗帘' }],
      },
      security: {
        cameras: [{ id: 'cam-1', floorId: 'f1', label: '门口' }],
      },
    },
  }
}

function changed(mutate) {
  const previousDocument = baseDocument()
  const nextDocument = structuredClone(previousDocument)
  mutate(nextDocument.properties)
  return { previousDocument, nextDocument }
}

test('相同文档返回 null', () => {
  const previousDocument = baseDocument()
  assert.equal(createLabelConfigPatch(previousDocument, structuredClone(previousDocument)), null)
})

test('只改标签字段时打出集合路径 + 条目下标 + 变更表', () => {
  const { previousDocument, nextDocument } = changed((properties) => {
    properties.devices.nas[0].label = '存储'
    properties.devices.nas[0].x = 3
  })
  const patches = createLabelConfigPatch(previousDocument, nextDocument)
  assert.ok(patches)
  assert.equal(patches.length, 1)
  assert.deepEqual(patches[0].collection, ['devices', 'nas'])
  assert.equal(patches[0].index, 0)
  assert.equal(patches[0].id, 'nas-1')
  assert.equal(patches[0].floorId, 'f1')
  assert.deepEqual(
    patches[0].changes.map((change) => [change.path, change.value]),
    [
      [['label'], '存储'],
      [['x'], 3],
    ],
  )
})

test('胎压子字段走 tirePressure 白名单', () => {
  const { previousDocument, nextDocument } = changed((properties) => {
    properties.environment.airers[0].tirePressure = { mode: 'front' }
  })
  const patches = createLabelConfigPatch(previousDocument, nextDocument)
  assert.ok(patches)
  assert.deepEqual(patches[0].changes, [{ path: ['tirePressure', 'mode'], value: 'front' }])
})

test('删除标签字段会记成 remove', () => {
  const { previousDocument, nextDocument } = changed((properties) => {
    delete properties.security.cameras[0].label
  })
  const patches = createLabelConfigPatch(previousDocument, nextDocument)
  assert.ok(patches)
  assert.deepEqual(patches[0].changes, [{ path: ['label'], remove: true }])
})

test('白名单外的字段变更返回 null（调用方退回整份配置）', () => {
  const { previousDocument, nextDocument } = changed((properties) => {
    properties.environment.curtains[0].entityId = 'cover.other'
  })
  assert.equal(createLabelConfigPatch(previousDocument, nextDocument), null)
})

test('集合结构变化（条目增删）返回 null', () => {
  const { previousDocument, nextDocument } = changed((properties) => {
    properties.devices.nas.push({ id: 'nas-2', floorId: 'f1', label: '第二台' })
  })
  assert.equal(createLabelConfigPatch(previousDocument, nextDocument), null)
})

test('properties 之外的字段变化返回 null', () => {
  const previousDocument = baseDocument()
  const nextDocument = structuredClone(previousDocument)
  nextDocument.floorSelection = 'f1'
  assert.equal(createLabelConfigPatch(previousDocument, nextDocument), null)
})

test('补丁能把 A 精确变成 B', () => {
  const { previousDocument, nextDocument } = changed((properties) => {
    properties.devices.nas[0].label = '存储'
    properties.devices.nas[0].labelHidden = true
    properties.environment.airers[0].tirePressure = { mode: 'rear', opacity: 0.5 }
  })
  const patches = createLabelConfigPatch(previousDocument, nextDocument)
  assert.ok(patches)
  // 应用侧吃的是 `properties`（上游 stage.js 的 `v219 = structuredClone(properties)`）。
  const patched = applyLabelConfigPatch(previousDocument.properties, patches)
  assert.deepEqual(patched, nextDocument.properties)
})

test('补丁能改扫地机快捷键（devices.vacuums.<i>.shortcuts）', () => {
  const { previousDocument, nextDocument } = changed((properties) => {
    properties.devices.vacuums[0].shortcuts[0].label = '回家'
  })
  const patches = createLabelConfigPatch(previousDocument, nextDocument)
  assert.ok(patches)
  // 应用侧吃的是 `properties`（上游 stage.js 的 `v219 = structuredClone(properties)`）。
  const patched = applyLabelConfigPatch(previousDocument.properties, patches)
  assert.deepEqual(patched, nextDocument.properties)
})

test('补丁与文档不匹配时返回 null，而不是尽力而为', () => {
  const { previousDocument, nextDocument } = changed((properties) => {
    properties.devices.nas[0].label = '存储'
  })
  const patches = createLabelConfigPatch(previousDocument, nextDocument)
  assert.ok(patches)
  // id 对不上
  assert.equal(
    applyLabelConfigPatch(
      { devices: { nas: [{ ...previousDocument.properties.devices.nas[0], id: 'other' }] } },
      patches,
    ),
    null,
  )
  // 越界下标
  assert.equal(applyLabelConfigPatch(previousDocument.properties, [{ ...patches[0], index: 9 }]), null)
  // 非法路径（原型链）
  assert.equal(
    applyLabelConfigPatch(previousDocument, [
      { ...patches[0], collection: ['devices', '__proto__', 'nas'] },
    ]),
    null,
  )
  // 空补丁
  assert.equal(applyLabelConfigPatch(previousDocument.properties, []), null)
})

test('补丁不会改到原文档', () => {
  const { previousDocument, nextDocument } = changed((properties) => {
    properties.devices.nas[0].label = '存储'
  })
  const snapshot = structuredClone(previousDocument)
  const patches = createLabelConfigPatch(previousDocument, nextDocument)
  const patched = applyLabelConfigPatch(previousDocument.properties, patches)
  assert.notEqual(patched, previousDocument.properties)
  assert.deepEqual(previousDocument, snapshot)
})

// ── 舞台侧「只刷受影响的标签」──────────────────────────────────────────────
const { labelPatchAffects } = await import(MODULE)

test('labelPatchAffects：楼层为空影响所有楼层，有楼层只影响本层', () => {
  assert.equal(labelPatchAffects([{ id: 'a' }], { id: 'a', floorId: 'f2' }), true)
  assert.equal(labelPatchAffects([{ id: 'a', floorId: 'f1' }], { id: 'a', floorId: 'f2' }), false)
  assert.equal(labelPatchAffects([{ id: 'a', floorId: 'f1' }], { id: 'a', floorId: 'f1' }), true)
})

test('labelPatchAffects：复合 id 按后缀匹配', () => {
  const patches = [{ id: 'curtain-1', floorId: 'f1' }]
  assert.equal(labelPatchAffects(patches, { id: 'cover:curtain-1', floorId: 'f1' }), true)
  assert.equal(labelPatchAffects(patches, { id: 'cover:curtain-10', floorId: 'f1' }), false)
  assert.equal(labelPatchAffects(patches, { id: 'vacuum:curtain-1', floorId: 'f1' }), true)
})

test('labelPatchAffects：没有 id 的补丁条目影响全部（宁可多刷）', () => {
  assert.equal(labelPatchAffects([{ floorId: 'f1' }], { id: 'anything', floorId: 'f1' }), true)
  assert.equal(labelPatchAffects([{}], { id: 'anything', floorId: 'f9' }), true)
})

test('labelPatchAffects：空补丁或空条目不影响任何标签', () => {
  assert.equal(labelPatchAffects([], { id: 'a', floorId: 'f1' }), false)
  assert.equal(labelPatchAffects([{ id: 'a' }], null), false)
})
