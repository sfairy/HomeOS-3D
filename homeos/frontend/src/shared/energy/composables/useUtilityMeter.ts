/** 水电燃气抄表相对日期与剩余天数计算工具 */
import { computed, type ComputedRef, type Ref } from 'vue'
import type { HaEntityState } from '@/shared/types/entity-store'
/**
 * 计算数据日期的相对标签
 * @param {import('vue').ComputedRef<string>} dataDate - 数据日期字符串
 * @param {string} prefix - CSS 类名前缀（如 'ele', 'gas', 'w'）
 * @returns {{ relLabel, relClass }}
 */
export function useRelativeDateLabel(
  dataDate: ComputedRef<unknown> | Ref<unknown>,
  prefix: string,
) {
  const relMeta = computed(() => {
    const d = dataDate.value
    if (d == null || d === '') return { label: '', classSuffix: '' }
    const parts = String(d).split('-')
    const dataLocal = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    const todayLocal = new Date()
    todayLocal.setHours(0, 0, 0, 0)
    const df = Math.floor((todayLocal.getTime() - dataLocal.getTime()) / 86400000)
    if (df === 0) return { label: '今天', classSuffix: 'today' }
    if (df === 1) return { label: '昨天', classSuffix: 'yesterday' }
    if (df === 2) return { label: '前天', classSuffix: 'daybefore' }
    if (df <= 7) return { label: '近一周', classSuffix: 'week' }
    if (df <= 14) return { label: '近两周', classSuffix: '2week' }
    if (df <= 30) return { label: '近一月', classSuffix: 'month' }
    return { label: `${df}天前`, classSuffix: 'old' }
  })
  const relLabel = computed(() => relMeta.value.label)
  const relClass = computed(() =>
    relMeta.value.classSuffix ? `${prefix}-rel--${relMeta.value.classSuffix}` : '',
  )
  return { relLabel, relClass }
}
/**
 * 解析日期字符串，返回 { year?, month, day }
 * 支持格式：YYYY-MM-DD 或 M.D
 * @param {string} label
 * @returns {{ year?: number, month: number, day: number } | null}
 */
export function parseDateParts(label: string | null | undefined) {
  if (!label) return null
  const match = label.match(/(\d{4})-(\d{2})-(\d{2})/) || label.match(/(\d{1,2})\.(\d{1,2})/)
  if (!match) return null
  if (match.length === 4) {
    return { year: parseInt(match[1]), month: parseInt(match[2]), day: parseInt(match[3]) }
  }
  return { month: parseInt(match[1]), day: parseInt(match[2]) }
}
/**
 * 计算预估剩余天数
 * @param {Object} entity - HA 实体
 * @param {(e: Object, key: string) => unknown} getAttr - 获取属性函数
 * @param {(json: unknown) => unknown} parseJson - 解析 JSON 函数
 * @param {(state: string) => number|null} parseNum - 字符串转数字
 * @param {string} costField - 费用字段名（如 'dayEleCost'）
 * @returns {{ remDays, remDate }}
 */
export function useRemainingDays(
  entity: Ref<HaEntityState | null | undefined> | ComputedRef<HaEntityState | null | undefined>,
  getAttr: (e: HaEntityState | null | undefined, key: string) => unknown,
  parseJson: (json: unknown) => unknown,
  parseNum: (state: string | undefined) => number | null,
  costField: string,
) {
  const remDays = computed(() => {
    const rd = getAttr(entity.value, 'remaining_days')
    if (rd != null) {
      const v = parseInt(String(rd), 10)
      if (!isNaN(v) && v >= 0) return v
    }
    const b = parseNum(entity.value?.state)
    if (b == null) return '--'
    const d = parseJson(getAttr(entity.value, 'daylist'))
    if (!Array.isArray(d) || !d.length) return '--'
    const recent = d.slice(0, 30)
    let t = 0,
      v = 0
    recent.forEach((x) => {
      const row = x as Record<string, unknown>
      const c = parseFloat(String(row[costField] || row.cost || 0))
      if (c > 0) {
        t += c
        v++
      }
    })
    if (v === 0) return '--'
    const avg = t / v
    if (avg <= 0) return '--'
    return Math.floor(b / avg)
  })
  const remDate = computed(() => {
    if (remDays.value === '--' || remDays.value <= 0) return ''
    const d = new Date(Date.now() + remDays.value * 86400000)
    return `${d.getMonth() + 1}.${d.getDate()}`
  })
  return { remDays, remDate }
}
