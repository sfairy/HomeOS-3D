/**
 * 安防跨模块联动预设与开关行。
 *
 * 职责：
 * - 提供安防跨模块联动的一键启用预设（写入 AppConfig.security）。
 * - 提供联动页集中开关行定义（含 presence 联动）。
 * - 提供全屋联动页的入口行定义（本页开关 + 跳转高级参数）。
 *
 * 依赖：无外部依赖，纯静态预设定义。
 *
 * 注意：
 * - `configKey` / `key` 为 AppConfig.security 中的字段名，属于配置 key，不翻译。
 * - `icon` 为 @lucide/vue 图标名，`theme` 为主题色名，均不翻译。
 * - `route` 为前端路由名，不翻译。
 */

/** 安防跨模块联动一键启用预设项 */
type SecurityLinkagePreset = {
  id: string
  icon: string
  theme: string
  title: string
  description: string
  configKey: string
  config: Record<string, boolean>
  offConfig: Record<string, boolean>
  successMessage: string
  offMessage: string
}

/** 联动开关行（写入 AppConfig.security） */
type SecurityLinkageFlagRow = { key: string; label: string; desc: string }

/** 全屋联动页入口行（跳转本页或高级参数） */
type SecurityLinkageParamRow = {
  key: string
  label: string
  desc: string
  route: string
  theme: string
}

/**
 * 安防跨模块联动一键启用预设（写入 AppConfig.security；保留供程序化启用）
 *
 * @returns 预设数组，每项包含图标、主题、标题、描述、开关配置与启停成功提示文案。
 */
export function getSecurityLinkagePresets(): SecurityLinkagePreset[] {
  return [
    {
      id: 'away_sim',
      icon: 'Lamp',
      theme: 'amber',
      title: '离家布防 → 离家模拟',
      description: '离家布防时自动启用灯光/空调模拟，与布局「离家模拟」灯池配合。',
      configKey: 'linkAwaySimOnArmAway',
      config: { linkAwaySimOnArmAway: true },
      offConfig: { linkAwaySimOnArmAway: false },
      successMessage: '已启用：离家布防时启动离家模拟',
      offMessage: '已关闭：离家布防联动模拟',
    },
    {
      id: 'home_mode_sync',
      icon: 'Home',
      theme: 'emerald',
      title: '布防/撤防 → 家庭模式',
      description: '按对照表或名称规则联动：居家↔回家、离家↔离家、夜间↔睡眠；撤防默认退出家庭模式。',
      configKey: 'linkHomeModeOnSecurityChange',
      config: { linkHomeModeOnSecurityChange: true },
      offConfig: { linkHomeModeOnSecurityChange: false },
      successMessage: '已启用：安防状态变更联动家庭模式',
      offMessage: '已关闭：安防联动家庭模式',
    },
  ]
}

/**
 * 联动页集中开关行定义（含 presence；写入 AppConfig.security）
 *
 * @returns 开关行数组，每项包含配置 key、中文标签与描述文案。
 */
export function getSecurityLinkageFlagRows(): SecurityLinkageFlagRow[] {
  return [
    {
      key: 'linkHomeModeOnSecurityChange',
      label: '布防变更 → 家庭模式',
      desc: '开启后按对照表/名称激活家庭模式；撤防默认退出模式',
    },
    {
      key: 'linkAwaySimOnArmAway',
      label: '离家布防 → 离家模拟',
      desc: '外出布防时启用灯光模拟，离开外出布防时自动关闭',
    },
    {
      key: 'autoArmOnEveryoneLeft',
      label: '全员离家自动布防',
      desc: '全员离家且当前为撤防时，自动切离家布防',
    },
    {
      key: 'autoUpgradeToAwayOnEveryoneLeft',
      label: '居家/夜间升级为离家',
      desc: '全员离家时，若当前为居家或夜间则升级为离家布防',
    },
    {
      key: 'calendarArmOnAway',
      label: '日历外出自动布防',
      desc: '日历标记外出且当前撤防时，自动切离家布防',
    },
    {
      key: 'calendarUpgradeToAway',
      label: '日历外出升级为离家',
      desc: '日历标记外出时，若当前为居家或夜间则升级为离家布防（与全员离家升级独立）',
    },
    {
      key: 'autoDisarmOnFirstHome',
      label: '首人到家自动切居家',
      desc: '首人到家时切安防「居家」（不是全撤防），与回家模式一致',
    },
  ]
}

/**
 * 全屋联动页相关入口行：本页人员判定 + 仍需在高级参数调节的阈值。
 * presence 自动布防/切居家开关已在 getSecurityLinkageFlagRows，勿再指向高级参数。
 */
export function getSecurityLinkageParamRows(): SecurityLinkageParamRow[] {
  return [
    {
      key: 'security.presencePersons',
      label: '人员在线判定',
      desc: '手动定义人员并关联多个判定实体',
      route: 'linkage',
      theme: 'sky',
    },
    {
      key: 'security.awayConfirmMin',
      label: '离家确认等待',
      desc: '全员离家后等待分钟数再触发布防，避免误触发',
      route: 'params',
      theme: 'amber',
    },
  ]
}

/** 安防模式全屋预设 */
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
