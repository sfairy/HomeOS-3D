/**
 * 能耗弹窗「服务端 vs 属性」数据源选择的回归测试。
 *
 * ## 被钉住的 bug
 *
 * 选择规则曾经包含一条「服务端条目比属性少就用属性」，理由是「属性更全」。实测反例很常见：
 *
 * - SGCC 集成的 `daylist` 属性是**上一个自然月**的整月表（31 条）；
 * - 服务端日聚合是**近 30 天**窗口（30 条）。
 *
 * 属性多 1 条就抢走数据源 → 用户翻到本月，日历整片是 `--`，而列表里显示的是上个月日期。
 * 电力卡与燃气卡同时中招（两者都走 `createUtilityMeterLists`）。
 *
 * 正确规则：服务端有数据就以它为准（它是实时写的），只在服务端为空时回退属性；
 * 多账户时仍用属性（服务端只有「全家合计」，套到每个户号会串数）。
 */
import { describe, expect, test } from 'bun:test'

import { preferServerList } from '../../../homeos/frontend/src/features/energy/composables/utility-meter-popup.lists.internals'
import {
  parseGasDayItem,
  parseGasMonthItem,
  parseGridDayItem,
  parseGridMonthItem,
} from '../../../homeos/frontend/src/domain/energy/model/composables/utility-meter-parse-helpers'

type Row = Record<string, unknown>

/** 服务端：近 30 天（2026-10-26 → 2026-11-24）。字段名是中性的 `usage`（电/气/水共用）。 */
function serverWindow(): Row[] {
  return Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 9, 26 + i))
    return { day: date.toISOString().slice(0, 10), usage: 10 + (i % 7) }
  })
}

/** 属性：SGCC 的 `daylist` 是上一个自然月的整月表（31 条）。 */
function attributeLastMonth(): Row[] {
  return Array.from({ length: 31 }, (_, i) => ({
    day: `2026-10-${String(i + 1).padStart(2, '0')}`,
    dayEleNum: 5,
    dayEleCost: 3.5,
  }))
}

describe('preferServerList', () => {
  test('属性更长时仍然用服务端（这是修复的那个 bug）', () => {
    const merged = preferServerList(attributeLastMonth(), serverWindow(), true) as Row[]
    expect(merged).toHaveLength(30)
    // 关键断言：结果里必须含 11 月 —— 属性优先时这里是 0 条
    expect(merged.filter((row) => String(row.day).startsWith('2026-11')).length).toBeGreaterThan(0)
  })

  test('修复前的判据会丢掉本月（证明这是真 bug 而不是假想）', () => {
    const attr = attributeLastMonth()
    const server = serverWindow()
    // 旧规则：服务端比属性短就用属性
    const old = server.length < attr.length ? attr : server
    expect(old.filter((row) => String(row.day).startsWith('2026-11'))).toHaveLength(0)
  })

  test('服务端为空时回退属性', () => {
    const merged = preferServerList(attributeLastMonth(), [], true) as Row[]
    expect(merged).toHaveLength(31)
  })

  test('多账户（serverWins=false）时属性优先 —— 服务端只有全家合计', () => {
    const merged = preferServerList(attributeLastMonth(), serverWindow(), false) as Row[]
    expect(merged).toHaveLength(31)
  })

  test('多账户但属性为空时仍用服务端', () => {
    const merged = preferServerList(null, serverWindow(), false) as Row[]
    expect(merged).toHaveLength(30)
  })

  test('同一天的属性费用字段被合并进服务端条目', () => {
    const attr = [{ day: '2026-11-20', dayEleCost: 7.25 }]
    const server = [{ day: '2026-11-20', usage: 12 }]
    const [row] = preferServerList(attr, server, true) as Row[]
    expect(row.usage).toBe(12) // 用量取服务端
    expect(row.dayEleCost).toBe(7.25) // 费用取属性（服务端没有）
  })

  test('服务端条目本身优先于属性里的同名键', () => {
    const attr = [{ day: '2026-11-20', usage: 999 }]
    const server = [{ day: '2026-11-20', usage: 12 }]
    const [row] = preferServerList(attr, server, true) as Row[]
    expect(row.usage).toBe(12)
  })
})

/**
 * 字段名契约：服务端聚合条目必须能被**三种**能源卡的解析器读懂。
 *
 * ## 被钉住的 bug
 *
 * 服务端条目原本写的是电力专有字段名（`dayEleNum` / `monthEleNum`）。电力卡正常，
 * 但燃气 / 水的解析器只认 `usage` / `cycleTotalVolume` —— 于是燃气卡把每一天都解析成
 * 0（日历重新变回整片 `--`）。更隐蔽的是合并属性条目之后：日期来自服务端窗口，用量却
 * 被属性里那份（上个自然月的）`usage` 盖住，列表数字和日期对不上。
 */
describe('服务端条目的字段名契约', () => {
  const serverDayItem = { day: '2026-11-23', usage: 0.79 }
  const serverMonthItem = { month: '2026-11', usage: 14.88 }

  test('燃气日/月解析器读得懂服务端条目', () => {
    expect(parseGasDayItem(serverDayItem)._usage).toBe(0.79)
    expect(parseGasMonthItem(serverMonthItem)._usage).toBe(14.88)
  })

  test('电力日/月解析器读得懂服务端条目', () => {
    expect(parseGridDayItem(serverDayItem)._usage).toBe(0.79)
    expect(parseGridMonthItem(serverMonthItem)._usage).toBe(14.88)
  })

  test('合并后服务端 usage 压过属性里的电力字段名', () => {
    // 属性那一行是上个月的整月表；日期来自服务端窗口，用量必须是服务端的值。
    const [row] = preferServerList([{ day: '2026-11-23', dayEleNum: 999 }], [serverDayItem], true) as Row[]
    expect(parseGridDayItem(row)._usage).toBe(0.79)
    expect(parseGasDayItem(row)._usage).toBe(0.79)
  })

  test('燃气的 readingTime 日期键也能对齐（费用不会丢）', () => {
    // 燃气 / 水表的日明细用 `readingTime` 而不是 `day`。合并匹配不上的话，
    // 服务端条目拿不到属性里的 `amount`，日历费用列会整片 `--`。
    const attr = [{ readingTime: '2026-11-23', cycleTotalValues: 1.42 }]
    const server = [{ day: '2026-11-23', usage: 0.79 }]
    const [row] = preferServerList(attr, server, true) as Row[]
    const parsed = parseGasDayItem(row)
    expect(parsed._usage).toBe(0.79) // 用量取服务端
    expect(parsed._cost).toBe(1.42) // 费用取属性
  })
})
