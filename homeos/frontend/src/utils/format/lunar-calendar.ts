/**
 * 农历计算工具模块
 * ClockWidget 和 Screensaver 共享此模块，避免 201 项十六进制数组重复定义。
 */

/** 农历年份信息表（1900-2100 每个农历年的编码数据） */
const LUNAR_YEAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, 0x04ae0,
  0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, 0x04970, 0x0a4b0,
  0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, 0x06566, 0x0d4a0, 0x0ea50,
  0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, 0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0,
  0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, 0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0,
  0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, 0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260,
  0x0f263, 0x0d950, 0x05b57, 0x056a0, 0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558,
  0x0b540, 0x0b6a0, 0x195a6, 0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46,
  0x0ab60, 0x09570, 0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5,
  0x092e0, 0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, 0x07954,
  0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, 0x05aa0, 0x076a3,
  0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, 0x0b5a0, 0x056d0, 0x055b2,
  0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, 0x14b63, 0x09370, 0x049f8, 0x04970,
  0x064b0, 0x168a6, 0x0ea50, 0x06aa0, 0x1a6c4, 0x0aae0, 0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0,
  0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, 0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50,
  0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, 0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60,
  0x0a570, 0x054e4, 0x0d160, 0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a4d0,
  0x0d150, 0x0f252, 0x0d520,
]

/** 天干：甲乙丙丁戊己庚辛壬癸 */
const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
/** 地支：子丑寅卯辰巳午未申酉戌亥 */
const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
/** 生肖（中文）：与地支一一对应 */
const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪']
/** 生肖 key（英文，与地支配对，用于图标 / 资源映射） */
const ZODIAC_KEYS = [
  'rat',
  'ox',
  'tiger',
  'rabbit',
  'dragon',
  'snake',
  'horse',
  'goat',
  'monkey',
  'rooster',
  'dog',
  'pig',
]
/** 农历月份名（1-12 月对应「正 / 二 / ... / 腊」） */
const LUNAR_MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊']
/** 农历日序名（1-30，索引 0 占位为空串） */
const LUNAR_DAYS = [
  '',
  '初一',
  '初二',
  '初三',
  '初四',
  '初五',
  '初六',
  '初七',
  '初八',
  '初九',
  '初十',
  '十一',
  '十二',
  '十三',
  '十四',
  '十五',
  '十六',
  '十七',
  '十八',
  '十九',
  '二十',
  '廿一',
  '廿二',
  '廿三',
  '廿四',
  '廿五',
  '廿六',
  '廿七',
  '廿八',
  '廿九',
  '三十',
]

/** 农历查表基准年（LUNAR_YEAR_INFO 表起始年份） */
const BASE_YEAR = 1900
/** 农历查表基准日期（公历 1900-01-31，对应农历 1900 年正月初一） */
const BASE_DATE = new Date(1900, 0, 31)

/** 取农历某年某月的天数（30 或 29） */
function monthDays(year: number, month: number) {
  return LUNAR_YEAR_INFO[year - BASE_YEAR] & (0x10000 >> month) ? 30 : 29
}

/** 取农历某年的闰月月份（0 表示无闰月） */
function leapMonth(year: number) {
  return LUNAR_YEAR_INFO[year - BASE_YEAR] & 0xf
}

/** 取农历某年闰月的天数（无闰月返回 0） */
function leapDays(year: number) {
  const lm = leapMonth(year)
  if (lm) return LUNAR_YEAR_INFO[year - BASE_YEAR] & 0x10000 ? 30 : 29
  return 0
}

/** 取农历某年的总天数（12 或 13 个月合计） */
function yearDays(year: number) {
  let sum = 348
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    sum += LUNAR_YEAR_INFO[year - BASE_YEAR] & i ? 1 : 0
  }
  return sum + leapDays(year)
}

export type LunarDate = {
  year: number
  month: number
  day: number
  isLeap: boolean
  yearName: string
  stemIdx: number
  branchIdx: number
  zodiac: string
  zodiacKey: string
  monthName: string
  dayName: string
  monthStr: string
  dayStr: string
}

/**
 * 公历日期 → 农历日期转换
 * @param {Date} date
 * @returns {{ year: number, month: number, day: number, isLeap: boolean,
 *             yearName: string, zodiac: string, monthName: string, dayName: string,
 *             monthStr: string, dayStr: string }}
 */
export function solarToLunar(date: Date): LunarDate {
  let offset = Math.floor((date.getTime() - (BASE_DATE as Date).getTime()) / 86400000)
  let year, month, day
  let isLeap = false

  for (year = BASE_YEAR; year < 2100 && offset > 0; year++) {
    const days = yearDays(year)
    if (offset < days) break
    offset -= days
  }

  const leap = leapMonth(year)
  for (month = 1; month <= 12 && offset > 0; month++) {
    if (leap > 0 && month === leap + 1 && !isLeap) {
      month--
      isLeap = true
      const d = leapDays(year)
      if (offset < d) break
      offset -= d
      isLeap = false
      continue
    }
    const d = monthDays(year, month)
    if (offset < d) break
    offset -= d
    isLeap = false
  }

  day = offset + 1
  const tgIdx = (year - 4) % 10
  const dzIdx = (year - 4) % 12

  const dzNorm = dzIdx < 0 ? dzIdx + 12 : dzIdx

  const monthName = LUNAR_MONTHS[month - 1]
  const dayName = LUNAR_DAYS[day] || ''

  return {
    year,
    month,
    day,
    isLeap,
    yearName: `${TIAN_GAN[tgIdx < 0 ? tgIdx + 10 : tgIdx]}${DI_ZHI[dzNorm]}`,
    stemIdx: tgIdx < 0 ? tgIdx + 10 : tgIdx,
    branchIdx: dzNorm,
    zodiac: ZODIAC[dzNorm],
    zodiacKey: ZODIAC_KEYS[dzNorm],
    monthName,
    dayName,
    monthStr: isLeap ? `闰${monthName}` : monthName,
    dayStr: dayName,
  }
}
