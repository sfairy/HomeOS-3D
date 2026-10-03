/**
 * 紧急求助（SOS）预设与默认配置
 *
 * 职责：
 * - 维护紧急求助 SOS 的默认配置（`layout.securityEmergency`）。
 * - 提供四种预设档位：全屋声光 / 重点区域 / 静默通知 / 完全自定义。
 * - 提供配置规范化函数，用于把用户输入合并为合法的 SecurityEmergencyConfig。
 *
 * 依赖：`@/types/layout` 中的 `SecurityEmergencyConfig` 类型。
 *
 * 注意：
 * - `mode` 取值（full_home / key_areas / notify_only / custom）为配置 key，不翻译。
 */
import type { SecurityEmergencyConfig } from '@/types/layout'
/** 紧急求助 SOS 默认配置（layout.securityEmergency） */
const DEFAULT_SECURITY_EMERGENCY: SecurityEmergencyConfig = {
  /** full_home | key_areas | notify_only | custom */
  mode: 'full_home',
  /** 自定义动作后是否叠加内置声光 */
  appendBuiltin: false,
  /** appendBuiltin 时使用的内置档位 */
  appendMode: 'full_home',
  /** 内置声光触发时的灯光亮度百分比（1-100） */
  lightBrightnessPct: 100,
  /** 重点区域灯池；空则回退 layout.awaySimulationLightPool */
  lightPool: [],
  /** 触发后自动离家布防 */
  autoArmAway: false,
  actions: [],
  /** 无自定义动作时是否使用内置兜底 */
  useBuiltinFallback: true,
}
/** 预设应用时写入配置的字段子集 */
interface EmergencyPresetApply {
  mode: string
  appendBuiltin: boolean
  useBuiltinFallback: boolean
}
/** 紧急求助预设定义（UI 卡片展示 + 应用时写入配置） */
interface EmergencyPresetDef {
  id: string
  name: string
  description: string
  icon: string
  apply: EmergencyPresetApply
}
/** 紧急求助预设档位定义表（id 即 mode key） */
const EMERGENCY_PRESET_DEFS: EmergencyPresetDef[] = [
  {
    id: 'full_home',
    name: '全屋声光求救',
    description: '全部警报器 + 全屋灯光 100%，最大化可见度',
    icon: '🚨',
    apply: { mode: 'full_home', appendBuiltin: false, useBuiltinFallback: true },
  },
  {
    id: 'key_areas',
    name: '重点区域',
    description: '全部警报器 + 重点灯池（可复用离家模拟灯池）',
    icon: '💡',
    apply: { mode: 'key_areas', appendBuiltin: false, useBuiltinFallback: true },
  },
  {
    id: 'notify_only',
    name: '静默通知',
    description: '仅推送 / 语音 / 事件记录，不操作 HA 设备',
    icon: '🔕',
    apply: { mode: 'notify_only', appendBuiltin: false, useBuiltinFallback: false },
  },
  {
    id: 'custom',
    name: '完全自定义',
    description: '仅执行下方自定义动作，可选叠加内置声光',
    icon: '⚙️',
    apply: { mode: 'custom', appendBuiltin: false, useBuiltinFallback: false },
  },
]
/**
 * 获取紧急求助预设档位列表（浅拷贝，避免外部修改内部常量）。
 *
 * @returns 预设定义数组的浅拷贝。
 */
export function getEmergencyPresets(): EmergencyPresetDef[] {
  return EMERGENCY_PRESET_DEFS.map((preset) => ({
    id: preset.id,
    name: preset.name,
    description: preset.description,
    icon: preset.icon,
    apply: preset.apply,
  }))
}
/**
 * 规范化紧急求助配置：合并默认值、清洗数组字段、钳制亮度百分比。
 *
 * `mode` 缺失时直接采用配置默认值（`full_home`）。
 *
 * @param raw - 用户输入的部分配置；为空时使用全部默认值。
 * @returns 合并并清洗后的完整 SecurityEmergencyConfig。
 */
export function normalizeSecurityEmergency(
  raw: Partial<SecurityEmergencyConfig> = {},
): SecurityEmergencyConfig {
  const cfg: SecurityEmergencyConfig = {
    ...DEFAULT_SECURITY_EMERGENCY,
    ...raw,
    lightPool: Array.isArray(raw.lightPool) ? raw.lightPool.filter(Boolean) : [],
    actions: Array.isArray(raw.actions) ? raw.actions : [],
    lightBrightnessPct: Math.min(100, Math.max(1, Number(raw.lightBrightnessPct) || 100)),
  }
  return cfg
}
