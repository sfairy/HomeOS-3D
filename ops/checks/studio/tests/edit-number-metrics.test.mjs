/**
 * 数字输入框步进/回写的契约测试（0.8.1 `studio-edit-metrics` 新增，`editNumberText` 等）。
 *
 * 两个失败模式都属于「点了没反应 / 显示奇怪」，不抛异常：
 * - 原生 `stepUp()` 在值为空、越界或 step 非法时**抛异常**，旧代码 `catch { return false }`
 *   把异常吞掉，用户把输入框清空后再点 ± 就完全静止；
 * - 回写时用 `toFixed(2)`，用户看到 `2.70`，再步进时又按字符串重新解析，误差越滚越大。
 *
 * 这里把纯函数语义钉死：空值以 min（无 min 时 0）起算、结果夹在 [min, max]、
 * 显示文本最多 6 位小数且去尾随 0、显示文本没变时沿用记住的数值。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const METRICS = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/studio-edit-metrics.ts',
    import.meta.url,
  ),
)
const WIDGETS = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/ui/studio-widgets.ts',
    import.meta.url,
  ),
)
const INSPECTOR = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/functions/refreshStudioUiInner.ts',
    import.meta.url,
  ),
)
const { editNumberText, steppedNumber, rememberNumberValue, numberEditValue } = await import(METRICS)

test('editNumberText：最多 6 位小数，去掉尾随 0', () => {
  assert.equal(editNumberText(2.7), '2.7')
  assert.equal(editNumberText(2), '2')
  assert.equal(editNumberText(2.7000000000000002), '2.7')
  assert.equal(editNumberText(0.30000000000000004), '0.3')
  assert.equal(editNumberText(1 / 3), '0.333333')
  assert.equal(editNumberText('1.50'), '1.5')
  assert.equal(editNumberText(-0), '0')
  assert.equal(editNumberText(0.0000004), '0')
})

test('steppedNumber：加减一步并夹在 [min, max] 内', () => {
  assert.equal(steppedNumber(2, 0.05, 1), 2.05)
  assert.equal(steppedNumber(2, 0.05, -1), 1.95)
  assert.equal(steppedNumber(0.3, 0.05, 1), 0.35)
  assert.equal(steppedNumber(0.1 + 0.2, 0.05, 1, -1, 1), 0.35)
  assert.equal(steppedNumber(0.5, 0.05, -1, 0.5, 3), 0.5, '下界必须夹住')
  assert.equal(steppedNumber(2.98, 0.05, 1, 0, 3), 3, '上界必须夹住')
  assert.equal(steppedNumber(1, 0.05, -1, -Infinity, Infinity), 0.95)
})

test('steppedNumber：非法输入返回 null（调用方据此不写回输入框）', () => {
  assert.equal(steppedNumber(Number.NaN, 0.05, 1), null)
  assert.equal(steppedNumber(Infinity, 0.05, 1), null)
  assert.equal(steppedNumber(1, 0, 1), null)
  assert.equal(steppedNumber(1, -0.05, 1), null)
})

test('rememberNumberValue / numberEditValue：显示没变就沿用记住的数值', () => {
  const input = { value: '2.7' }
  rememberNumberValue(input, 2.7)
  assert.equal(numberEditValue(input), 2.7)
  // 用户改了显示文本：缓存必须失效，按新文本解析。
  input.value = '3.1'
  assert.equal(numberEditValue(input), 3.1)
  // 再记一次，后面又按新值走。
  rememberNumberValue(input, 3.1)
  assert.equal(numberEditValue(input), 3.1)
  input.value = '2.70'
  assert.equal(numberEditValue(input), 2.7, '文本被重排但语义相同也应重新解析')
})

test('rememberNumberValue：非法输入不写缓存', () => {
  const input = { value: '1' }
  rememberNumberValue(input, Number.NaN)
  input.value = '1'
  assert.equal(numberEditValue(input), 1)
  rememberNumberValue(null, 5)
  assert.ok(Number.isNaN(numberEditValue(null)), 'null 输入按 Number(undefined) 处理，不抛异常')
})

test('± 步进器不再依赖原生 stepUp 的异常分支', () => {
  const source = readFileSync(WIDGETS, 'utf8')
  const performStep = source.slice(source.indexOf('const performStep'))
  assert.ok(performStep, '找不到 ± 步进实现')
  const body = performStep.slice(0, performStep.indexOf('return (', 10))
  assert.doesNotMatch(body, /\.stepUp\(\)|\.stepDown\(\)/, '不得再走原生 stepUp/stepDown')
  assert.match(body, /numberEditValue\(numberInput\)/)
  assert.match(body, /steppedNumber\(/)
  assert.match(body, /editNumberText\(nextValue\)/)
  assert.match(body, /rememberNumberValue\(numberInput, nextValue\)/)
})

test('检查器数字回写统一走 editNumberText + memo', () => {
  const source = readFileSync(INSPECTOR, 'utf8')
  assert.match(source, /setControlValue\(controlElement, editNumberText\(numericValue\)\)/)
  assert.match(source, /rememberNumberValue\(controlElement, numericValue\)/)
  for (const field of [
    '#wall-height',
    '#wall-thickness',
    '#window-width',
    '#window-height',
    '#window-sill',
    '#door-width',
    '#door-height',
    '#item-width',
    '#item-height',
    '#item-depth',
    '#item-x',
    '#item-y',
    '#item-elevation',
    '#item-rotation',
  ])
    assert.match(
      source,
      new RegExp(`setNumericControlValue\\(\\s*selectElement\\("${field}"\\)`),
      `${field} 仍走 toFixed 回写`,
    )
})
