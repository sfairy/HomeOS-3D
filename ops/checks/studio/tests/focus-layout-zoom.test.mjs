/**
 * `focusTranslationDistance`（0.8.2）的契约测试。
 *
 * 背景：放大清晰度方案让标题 / 统计 / 天气宿主带上 CSS `zoom`。`zoom` 会一起缩放
 * `style.translate` 的长度基准，所以按 CSS 像素写的位移会被放大 zoom 倍 —— 表现就是
 * 「点一下组件，页面滑过头/滑不到」，既不报错也不好截图对比。
 *
 * 这里钉死换算口径：位移要**除以** zoom，回到缩放前的坐标系；zoom 缺失/非法时按 1 处理，
 * 不能因为 `parseFloat` 拿到 `NaN` 就把位移变成 `NaNpx`（那会让整条 `translate` 失效）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/bridge/presets/focus-layout.ts',
    import.meta.url,
  ),
)
const { focusTranslationDistance } = await import(moduleUrl)

test('无 zoom（空串 / 未设置）时位移按原值', () => {
  assert.equal(focusTranslationDistance(240, 1, ''), 240)
  assert.equal(focusTranslationDistance(240, 1, undefined), 240)
  assert.equal(focusTranslationDistance(240, 1, null), 240)
})

test('zoom=2 时位移减半，zoom=3 时位移降到三分之一', () => {
  assert.equal(focusTranslationDistance(240, 1, '2'), 120)
  assert.equal(focusTranslationDistance(240, 1, '3'), 80)
})

test('zoom 与动画进度叠加：位移 = distance * amount / zoom', () => {
  assert.equal(focusTranslationDistance(240, 0.5, '2'), 60)
  assert.equal(focusTranslationDistance(100, 0.25, '1.5'), 100 * 0.25 / 1.5)
})

test('zoom 带单位或小数时按 parseFloat 语义取数值部分', () => {
  assert.equal(focusTranslationDistance(240, 1, '2.5'), 96)
  assert.equal(focusTranslationDistance(240, 1, ' 1.25 '), 192)
})

test('非法 zoom 退化成 1，绝不产生 NaNpx', () => {
  assert.equal(focusTranslationDistance(240, 1, 'normal'), 240)
  assert.equal(focusTranslationDistance(240, 1, 'auto'), 240)
  assert.equal(Number.isNaN(focusTranslationDistance(240, 1, 'garbage')), false)
  assert.equal(focusTranslationDistance(240, 1, 'garbage'), 240)
})

test('zoom=0 不会除以零：下限被夹到 0.01', () => {
  assert.equal(Number.isFinite(focusTranslationDistance(240, 1, '0')), true)
  assert.equal(focusTranslationDistance(240, 1, '0'), 240)
  assert.equal(focusTranslationDistance(240, 1, '-2'), 24000)
})
