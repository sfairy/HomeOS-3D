/**
 * 气候弹窗标题（0.8.1 `renderer/climate.js` 的 `climateDialogTitle`）契约。
 *
 * 浴霸在 HA 里常被命名为「空调」，直接拿 label 当标题会让用户以为点错了设备；
 * 上游只对 `bath-heater` 做这条回退，空调/热水器等仍以 label 为准。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/app/renderer/controls/climate.ts', import.meta.url),
)
const { climateDialogTitle } = await import(moduleUrl)

test('有 label 时直接用 label', () => {
  assert.equal(climateDialogTitle('主卧空调', '客厅空调', 'air-conditioner'), '主卧空调')
  assert.equal(climateDialogTitle('主卫浴霸', '卫生间浴霸', 'bath-heater'), '主卫浴霸')
})

test('浴霸 label 为「空调」时回退到设备名', () => {
  assert.equal(climateDialogTitle('空调', '卫生间浴霸', 'bath-heater'), '卫生间浴霸')
})

test('浴霸 label 为「空调」且设备名缺失时回退到类型名', () => {
  const typeLabel = climateDialogTitle('空调', '', 'bath-heater')
  assert.ok(typeLabel && typeLabel !== '空调', '必须回退成类型名而不是「空调」')
  assert.equal(climateDialogTitle('空调', '   ', 'bath-heater'), typeLabel)
})

test('空调 label 为「空调」时不做回退', () => {
  assert.equal(climateDialogTitle('空调', '客厅空调', 'air-conditioner'), '空调')
})

test('label 为空/空白时回退到设备名，再回退到类型名', () => {
  assert.equal(climateDialogTitle('', '客厅空调', 'air-conditioner'), '客厅空调')
  assert.equal(climateDialogTitle('   ', '客厅空调', 'air-conditioner'), '客厅空调')
  const typeLabel = climateDialogTitle('', '', 'bath-heater')
  assert.ok(typeLabel && typeLabel.length > 0)
  assert.equal(climateDialogTitle(null, null, 'air-conditioner'), climateDialogTitle('', '', 'air-conditioner'))
})

test('默认设备类型是 air-conditioner', () => {
  assert.equal(climateDialogTitle('空调', ''), '空调')
})
