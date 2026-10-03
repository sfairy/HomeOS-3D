/**
 * 农历展示文案格式化工具（屏保 / 日历组件共用）
 *
 * 职责：
 * - 维护生肖、农历月、农历日的中文标签映射表。
 * - 提供农历年份行（干支 + 生肖）、月日行、完整农历行的格式化函数。
 *
 * 依赖：@/utils/format/lunar-calendar 的 LunarDate 类型。
 *
 * 注意：
 * - 对象 key 为农历月/日的数值字符串或生肖 key（如 dog / dragon），属于配置 key，不翻译。
 * - 仅面向用户的文案 value 使用简体中文。
 */
import type { LunarDate } from '@/utils/format/lunar-calendar'

const ZODIAC_LABELS: Record<string, string> = {
  dog: '狗',
  dragon: '龙',
  goat: '羊',
  horse: '马',
  monkey: '猴',
  ox: '牛',
  pig: '猪',
  rabbit: '兔',
  rat: '鼠',
  rooster: '鸡',
  snake: '蛇',
  tiger: '虎',
}

const LUNAR_MONTH_LABELS: Record<string, string> = {
  '0': '正',
  '1': '二',
  '10': '冬',
  '11': '腊',
  '2': '三',
  '3': '四',
  '4': '五',
  '5': '六',
  '6': '七',
  '7': '八',
  '8': '九',
  '9': '十',
}

const LUNAR_DAY_LABELS: Record<string, string> = {
  '1': '初一',
  '10': '初十',
  '11': '十一',
  '12': '十二',
  '13': '十三',
  '14': '十四',
  '15': '十五',
  '16': '十六',
  '17': '十七',
  '18': '十八',
  '19': '十九',
  '2': '初二',
  '20': '二十',
  '21': '廿一',
  '22': '廿二',
  '23': '廿三',
  '24': '廿四',
  '25': '廿五',
  '26': '廿六',
  '27': '廿七',
  '28': '廿八',
  '29': '廿九',
  '3': '初三',
  '30': '三十',
  '4': '初四',
  '5': '初五',
  '6': '初六',
  '7': '初七',
  '8': '初八',
  '9': '初九',
}

/** 生肖中文标签；zodiacKey 缺失时回退默认「鼠」 */
function formatLunarZodiac(lunar: Pick<LunarDate, 'zodiacKey'> | null | undefined) {
  const key = lunar?.zodiacKey || 'rat'
  return ZODIAC_LABELS[key] ?? key
}

/** 农历月名（正/二/.../冬/腊）；未命中回退原始月数 */
function formatLunarMonthName(lunar: Pick<LunarDate, 'month'>) {
  return LUNAR_MONTH_LABELS[lunar.month - 1] ?? lunar.month - 1
}

/** 农历日名（初一/.../三十）；未命中回退原始日数 */
function formatLunarDayName(lunar: Pick<LunarDate, 'day'>) {
  return LUNAR_DAY_LABELS[lunar.day] ?? lunar.day
}

/** 农历年份行（干支 + 生肖） */
export function formatLunarYearLine(
  lunar: Pick<LunarDate, 'zodiacKey' | 'zodiac' | 'yearName'>,
) {
  const zodiac = formatLunarZodiac(lunar)
  const zodiacLabel = lunar.zodiac || zodiac
  return `${lunar.yearName}年（${zodiacLabel}年）`
}

/** 农历月日行 */
export function formatLunarMonthDayLine(
  lunar: Pick<LunarDate, 'month' | 'day' | 'isLeap'>,
) {
  const monthName = formatLunarMonthName(lunar)
  const dayName = formatLunarDayName(lunar)
  const month = lunar.isLeap ? `闰${monthName}` : monthName
  return `${month}月${dayName}`
}

/** 屏保完整农历行：干支年 + 月日 */
export function formatLunarFullLine(
  lunar: Pick<LunarDate, 'zodiacKey' | 'zodiac' | 'yearName' | 'month' | 'day' | 'isLeap'>,
) {
  return `${formatLunarYearLine(lunar)} · ${formatLunarMonthDayLine(lunar)}`
}
