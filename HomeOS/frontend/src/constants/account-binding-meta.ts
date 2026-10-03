/**
 * 生活账户绑定元数据
 *
 * 职责：
 * - 转发 @homeos/shared 中的账户绑定常量与工具函数（标签、分类、路由解析等）。
 * - 维护生活账户页面的子 Tab 配置（电网 / 燃气 / 水务 / 电信 / 联通）。
 * - 提供各类账户在 UI 上的字段元数据（标签、占位提示、约定 entity_id 前缀等）。
 * - 暴露便捷函数，用于把账户源 ID 翻译为中文展示文案，或拼装缺失账户的提示信息。
 *
 * 依赖：@homeos/shared 中维护的账户绑定基础常量与工具函数。
 *
 * 注意：
 * - Tab `id` 与字段映射的 key（grid / gas / water / ct / cu）为能源类别配置 key，不翻译。
 * - `prefix` 为 HA entity_id 约定前缀，`labelClass` / `prefixClass` 为 CSS 类名，均不翻译。
 * - `accent` 为 CSS 颜色值，不翻译。
 */
import { ACCOUNT_BINDING_SOURCE_LABELS } from '@homeos/shared'
import { ENERGY_CONVENTION_PREFIX } from '@/constants/energy-fields'

export {
  ACCOUNT_BINDING_SOURCE_LABELS,
  collectFooterAccountSources,
} from '@homeos/shared'

/**
 * 生活账户子 Tab（公用事业 + 运营商）
 *
 * - `id`：账户分类 key，对应 ENERGY_CATEGORIES / COMM 账户分类，作为配置 key 不翻译。
 * - `label`：Tab 显示文案（简体中文）。
 * - `emoji`：Tab 图标。
 * - `accent`：Tab 强调色（CSS 颜色值，保持原样）。
 */
export const ACCOUNT_BINDING_TABS = [
  { id: 'grid', label: '电网', emoji: '⚡', accent: '#fbbf24' },
  { id: 'gas', label: '燃气', emoji: '🔥', accent: '#fb923c' },
  { id: 'water', label: '水务', emoji: '💧', accent: '#22d3ee' },
  { id: 'ct', label: '电信', emoji: '📱', accent: '#c084fc' },
  { id: 'cu', label: '联通', emoji: '📶', accent: '#a78bfa' },
] as const

/** AccountBindingFieldMeta：类型定义，字段语义见声明。 */
export interface AccountBindingFieldMeta {
  /** 状态栏 / Tab 辅助文案 */
  label: string
  /** 户号输入框标签 */
  accountLabel: string
  /** 标签的 CSS 类名（颜色色调） */
  labelClass: string
  /** 输入框占位提示文案 */
  placeholder: string
  /** 前缀图标的 CSS 类名（颜色色调） */
  prefixClass: string
  /** HA entity_id 约定前缀（如 `sensor.ele_`） */
  prefix: string
}

/**
 * 约定命名模式下的账户字段元数据
 *
 * key 为账户分类（grid / gas / water / ct / cu），value 为该类账户在 UI 上的字段配置。
 */
export const ACCOUNT_BINDING_FIELD_META: Record<string, AccountBindingFieldMeta> = {
  grid: {
    label: '电网账户',
    accountLabel: '电网户号',
    labelClass: 'text-amber-400/90',
    placeholder: '每行一个户号，或粘贴逗号分隔多个号码',
    prefixClass: 'text-amber-400',
    prefix: `sensor.${ENERGY_CONVENTION_PREFIX.grid}_`,
  },
  gas: {
    label: '燃气账户',
    accountLabel: '燃气户号',
    labelClass: 'text-orange-400/90',
    placeholder: '每行一个账号，或粘贴逗号分隔多个号码',
    prefixClass: 'text-orange-400',
    prefix: `sensor.${ENERGY_CONVENTION_PREFIX.gas}_`,
  },
  water: {
    label: '水务账户',
    accountLabel: '水务户号',
    labelClass: 'text-cyan-400/90',
    placeholder: '每行一个账号，或粘贴逗号分隔多个号码',
    prefixClass: 'text-cyan-400',
    prefix: `sensor.${ENERGY_CONVENTION_PREFIX.water}_`,
  },
  ct: {
    label: '电信账户',
    accountLabel: '电信账号',
    labelClass: 'text-purple-400/90',
    placeholder: '每行一个账号，或粘贴逗号分隔多个号码',
    prefixClass: 'text-purple-400',
    prefix: `sensor.${ENERGY_CONVENTION_PREFIX.ct}_`,
  },
  cu: {
    label: '联通账户',
    accountLabel: '联通账号',
    labelClass: 'text-violet-400/90',
    placeholder: '每行一个账号，或粘贴逗号分隔多个号码',
    prefixClass: 'text-violet-400',
    prefix: `sensor.${ENERGY_CONVENTION_PREFIX.cu}_`,
  },
}

/** 账户源下拉选项：由 ACCOUNT_BINDING_SOURCE_LABELS 转换为 { value, label } 数组 */
export const ACCOUNT_BINDING_SOURCE_OPTIONS = Object.entries(ACCOUNT_BINDING_SOURCE_LABELS).map(
  ([value, label]) => ({ value, label }),
)

/**
 * 把账户源 ID 数组格式化为中文标签字符串（用「、」连接）。
 *
 * @param sources - 账户源 ID 数组（如 `['grid', 'gas']`）。
 * @returns 形如「电网、燃气」的中文标签串；未命中的 source 回退为原始值。
 */
function formatAccountBindingLabels(sources: string[]): string {
  return sources.map((s) => ACCOUNT_BINDING_SOURCE_LABELS[s] || s).join('、')
}

/**
 * 缺失账户配置时的提示文案
 *
 * @param sources - 缺失的账户源 ID 数组。
 * @returns 提示用户前往生活账户配置对应账户的文案；sources 为空时给出通用提示。
 */
export function formatMissingAccountBindingHint(sources: string[]): string {
  const labels = formatAccountBindingLabels(sources)
  if (!labels.length) {
    return '底部信息栏引用了账户绑定字段，请在生活账户中配置账户用量'
  }
  return `请在生活账户中配置：${labels}`
}
