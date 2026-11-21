/**
 * 设备画像面板的展示口径（相对时间 / 类型标签 / 审计文案）。
 *
 * 主面板与「最近变更」卡片都要用同一套翻译，抄两份迟早会漂移（一处改成「小时前」、
 * 另一处还是「h」）。这里只放纯函数与常量，不碰 Vue 状态。
 */

export const KIND_LABELS: Record<string, string> = {
  apple_tv: 'Apple TV',
  tv: '电视',
  speaker: '音箱',
  receiver: '功放',
  ac_split: '挂机空调',
  ac_central: '中央空调',
  boiler: '壁挂炉',
  floor_heating: '地暖',
  water_heater: '热水器',
  bath_heater: '浴霸',
  unknown: '未定（自动）',
}

export const AUDIT_LABELS: Record<string, string> = {
  confirm: '确认类型',
  confirm_with_aliases: '确认并设别名',
  aliases: '修改别名',
  clear_confirmation: '撤销确认',
}

/** 相对时间：面板只关心「几分钟 / 几小时 / 几天前」，不引入日期库。 */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const stamp = Date.parse(iso)
  if (Number.isNaN(stamp)) return iso
  const diff = Date.now() - stamp
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}

/** 类型变化文案：`from → to`；两边相同只显示一个。 */
export function kindTransition(row: { fromKind?: string; toKind?: string }): string {
  const from = KIND_LABELS[row.fromKind || ''] || row.fromKind || ''
  const to = KIND_LABELS[row.toKind || ''] || row.toKind || ''
  if (!from || from === to) return to
  return `${from} → ${to}`
}
