/**
 * 农历日期解析（0.8.1 B5）的契约。
 *
 * `Intl` 的 chinese calendar 在 zh-CN 下输出的是「初一 / 十二 / 廿三 / 三十」，
 * 旧实现直接 `Number()` 得到 NaN，农历标签整块消失；这里锁住每个区间。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/renderer/controls/date-time-runtime.ts',
    import.meta.url,
  ),
)
const { formatLunarDate, parseChineseLunarDay } = await import(moduleUrl)

test('初一到初十', () => {
  const labels = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十']
  assert.deepEqual(
    labels.map((label) => parseChineseLunarDay(label)),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  )
})

test('十一到二十', () => {
  const labels = ['十一', '十二', '十五', '十九', '二十']
  assert.deepEqual(labels.map((label) => parseChineseLunarDay(label)), [11, 12, 15, 19, 20])
})

test('廿一到三十', () => {
  const labels = ['廿一', '廿三', '廿九', '三十']
  assert.deepEqual(labels.map((label) => parseChineseLunarDay(label)), [21, 23, 29, 30])
})

test('阿拉伯数字与非法输入', () => {
  assert.equal(parseChineseLunarDay('7'), 7)
  assert.equal(parseChineseLunarDay(18), 18)
  assert.ok(Number.isNaN(parseChineseLunarDay('')))
  assert.ok(Number.isNaN(parseChineseLunarDay('三一')))
  assert.ok(Number.isNaN(parseChineseLunarDay(null)))
})

test('formatLunarDate 输出拉丁数字农历日', () => {
  const lunarText = formatLunarDate(new Date(2026, 0, 1))
  if (!lunarText) return // 运行环境没有 chinese calendar：跳过（浏览器均有）
  assert.match(lunarText, /^农历/)
  assert.doesNotMatch(lunarText, /NaN/)
})
