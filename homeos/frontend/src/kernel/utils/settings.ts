import { snapToSliderStep } from '@/kernel/utils/ui/index'
import { roomTabEmoji as sharedRoomTabEmoji } from '@homeos/shared'

/** 设置页滑块步长语义（与 SettingsRangeField 配合） */


/** SETTINGS_RANGE_STEP：对象常量，字段 / 方法语义见定义处。 */
export const SETTINGS_RANGE_STEP = {
  /** 像素 · 大屏布局宽度 */
  layoutWidth: 10,
  /** 像素 · 侧栏/消息墙等中等尺寸 */
  panelPx: 5,
  /** 亮度/百分比 20–100 */
  brightnessPct: 5,
  /** 小时 0–23 */
  hour: 1,
} as const

/** 根据 step 推断显示小数位 */
function rangeStepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0
  const s = String(step)
  const dot = s.indexOf('.')
  if (dot < 0) return 0
  return s.length - dot - 1
}

/** 按步长格式化展示（去掉多余尾零，如 0.850000 → 0.85） */
export function formatRangeDisplayValue(value: number, min: number, max: number, step: number): string {
  const n = snapToRangeStep(value, min, max, step)
  const d = rangeStepDecimals(step)
  if (d === 0) return String(Math.round(n))
  return n
    .toFixed(d)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '')
}

/** 按步长吸附并消除浮点误差 */
export function snapToRangeStep(value: number, min: number, max: number, step: number): number {
  return snapToSliderStep(value, min, max, step)
}

/** 房间引用徽章工具 */
type RoomRefBadgeKey = 'env'

/** 房间能力徽章：含 key、显示文案与悬浮提示 */
type RoomRefBadge = {
  key: RoomRefBadgeKey
  label: string
  title?: string
}

/** 环境传感器属性 key 集合（任一非空即视为已绑定环境能力） */
const SENSOR_KEYS = ['temperature', 'humidity', 'pm25', 'co2', 'tvoc'] as const

/**
 * 判定房间是否绑定了环境传感器。
 *
 * @param entry 房间配置项（如环境映射表的一行）；标记为 _hidden 视为未绑定
 * @returns true 表示存在任一环境传感器字段
 */
export function roomHasEnvSensors(entry: Record<string, unknown> | null | undefined): boolean {
  if (!entry || typeof entry !== 'object') return false
  if (entry._hidden) return false
  return SENSOR_KEYS.some((k) => String(entry[k] || '').trim())
}

/**
 * 根据房间已具备的能力生成徽章列表。
 *
 * @param opts.hasEnv 是否绑定环境传感器
 * @returns 徽章数组（当前仅环境能力）
 */
export function buildRoomReferenceBadges(opts: { hasEnv?: boolean }): RoomRefBadge[] {
  const badges: RoomRefBadge[] = []
  if (opts.hasEnv) {
    badges.push({
      key: 'env',
      label: '环境',
      title: '已绑定环境传感器，环境健康面板可用',
    })
  }
  return badges
}

/** 设置页 Tab emoji 图标工具 */


/** 安防模式 Tab emoji：key 为 HA alarm_control_panel state */
const SECURITY_MODE_TAB_EMOJI: Record<string, string> = {
  armed_away: '🛡️',
  armed_home: '🏠',
  armed_night: '🌙',
  disarmed: '🔓',
  emergency: '🆘',
}

/** 家庭模式 lucide key / 历史配置 → emoji */
const HOME_MODE_TAB_EMOJI: Record<string, string> = {
  '🏠': '🏠',
  '🚪': '🚪',
  '🌙': '🌙',
  '🎬': '🎬',
  '🍽': '🍽️',
  '🌴': '🌴',
  '🚗': '🚗',
  'door-open': '🚪',
  'door-closed': '🚪',
  moon: '🌙',
  film: '🎬',
  utensils: '🍽️',
  palmtree: '🌴',
  users: '👥',
  vacuum: '🤖',
  home: '🏠',
}

/**
 * 环境房间 Tab emoji：转发 @homeos/shared 的 roomTabEmoji。
 *
 * @param roomId 房间 area_id
 * @returns 对应的房间 emoji 字符
 */
export function envRoomTabEmoji(roomId: string) {
  return sharedRoomTabEmoji(roomId)
}

/**
 * 解析家庭模式 Tab emoji：优先查映射表，未命中回退「🏠」。
 *
 * @param icon 输入图标配置（lucide key 或已有 emoji）
 * @returns 对应的 emoji 字符
 */
export function resolveHomeModeTabEmoji(icon: string | null | undefined) {
  const raw = String(icon || '🏠').trim()
  if (HOME_MODE_TAB_EMOJI[raw]) return HOME_MODE_TAB_EMOJI[raw]
  return '🏠'
}

/**
 * 解析安防模式 Tab emoji：按 HA alarm state 查表，未命中回退「🛡️」。
 *
 * @param key 安防模式 key（armed_away / disarmed / ...）
 * @returns 对应的 emoji 字符
 */
export function securityModeTabEmoji(key: string) {
  return SECURITY_MODE_TAB_EMOJI[key] || '🛡️'
}
