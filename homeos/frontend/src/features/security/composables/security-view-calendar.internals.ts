/**
 * @file security-view-calendar.internals.ts
 * @module frontend/src/features/security/composables
 */
/** 安防页日历：纯日期网格 / 同一天判定（不依赖 Vue） */

export type SecurityCalendarDay = {
  day: number
  isCurrentMonth: boolean
  date: Date
}

/**
 * 构造某月的日历天数网格：含上月末尾、本月全部、下月开头，只补齐最后一周。
 */
export function buildSecurityCalendarDays(year: number, month: number): SecurityCalendarDay[] {
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()
  const days: SecurityCalendarDay[] = []

  for (let offset = firstWeekday - 1; offset >= 0; offset--) {
    const day = daysInPrevMonth - offset
    days.push({
      day,
      isCurrentMonth: false,
      date: new Date(year, month - 1, day),
    })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    days.push({ day, isCurrentMonth: true, date: new Date(year, month, day) })
  }
  const remaining = (7 - (days.length % 7)) % 7
  for (let day = 1; day <= remaining; day++) {
    days.push({
      day,
      isCurrentMonth: false,
      date: new Date(year, month + 1, day),
    })
  }
  return days
}

/** 判断两个日期是否同一天（缺任一参数视为 false）。 */
export function isSameCalendarDay(left: Date | null | undefined, right: Date | null | undefined): boolean {
  return Boolean(
    left &&
      right &&
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate(),
  )
}
