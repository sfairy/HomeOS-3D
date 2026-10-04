/**
 * 安防模式全屋预设
 *
 * 职责：
 * - 维护四种安防模式（armed_away / armed_home / armed_night / disarmed）的
 *   预设元数据（名称、描述）与动作模板。
 * - 供设置页「安防模式」一键套用预设，写入 `layout.securityModes[].actions`。
 *
 * 依赖：无外部依赖，纯静态预设。
 *
 * 注意：
 * - 生活方式相关的设备动作已迁移至「家庭模式」管理，安防场景预设默认动作留空，
 *   避免与家庭模式重复配置（双写）。
 * - 模式 key（armed_away 等）为 HA `alarm_control_panel` 标准 state 值，不翻译。
 */
type SecurityModePresetMeta = { name: string; description: string }
/** 安防模式预设动作：对应一条 HA service 调用 */
type SecurityModePresetAction = {
  service?: string
  entity_id?: string
  service_data?: Record<string, unknown>
  [key: string]: unknown
}

/** 各安防模式的预设元数据（中文名 + 说明文案），key 为 HA alarm state */
const PRESET_META: Record<string, SecurityModePresetMeta> = {
  armed_away: {
    name: '标准离家',
    description: '设备情景由「家庭模式·离家」负责；此处仅适合外围设备（警号、摄像等）',
  },
  armed_home: {
    name: '标准居家',
    description: '设备情景由「家庭模式·回家」负责；此处仅适合外围设备（室内区需设为 interior）',
  },
  armed_night: {
    name: '标准夜间',
    description: '设备情景由「家庭模式·睡眠」负责；此处仅适合外围设备',
  },
  disarmed: {
    name: '标准撤防',
    description: '关闭安防告警；回家请用「居家」。设备情景交给家庭模式，勿在此重复配置',
  },
}
/** 生活方式动作已迁至家庭模式；安防场景预设默认空，避免双写 */
const PRESET_ACTIONS: Record<string, SecurityModePresetAction[]> = {
  armed_away: [],
  armed_home: [],
  armed_night: [],
  disarmed: [],
}
/** 模式 key → 预设 ID 映射，用于写入 layout 时的唯一标识 */
const PRESET_IDS: Record<string, string> = {
  armed_away: 'standard_away',
  armed_home: 'standard_home',
  armed_night: 'standard_night',
  disarmed: 'standard_disarm',
}
/**
 * 四模式全屋预设（layout.securityModes[].actions 模板；默认空，避免与家庭模式重复）
 *
 * 遍历四种安防模式，组装预设对象（id / name / description / actions）。
 * 动作数组中的 `service_data` 会被浅拷贝，避免外部修改污染内部常量。
 *
 * @returns 模式 key → 预设对象 的映射表。
 */
export function getSecurityModePresets() {
  const presets: Record<
    string,
    {
      id: string
      name: string
      description: string
      actions: SecurityModePresetAction[]
    }
  > = {}
  for (const modeKey of Object.keys(PRESET_ACTIONS)) {
    presets[modeKey] = {
      id: PRESET_IDS[modeKey],
      name: PRESET_META[modeKey].name,
      description: PRESET_META[modeKey].description,
      actions: PRESET_ACTIONS[modeKey].map((a) => ({
        ...a,
        service_data: a.service_data ? { ...a.service_data } : undefined,
      })),
    }
  }
  return presets
}
