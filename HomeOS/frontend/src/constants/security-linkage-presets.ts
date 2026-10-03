/**
 * 安防跨模块联动预设与开关行
 *
 * 职责：
 * - 提供安防跨模块联动的一键启用预设（写入 `AppConfig.security`）。
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
/**
 * 安防跨模块联动一键启用预设（写入 AppConfig.security；保留供程序化启用）
 *
 * @returns 预设数组，每项包含图标、主题、标题、描述、开关配置与启停成功提示文案。
 */
export function getSecurityLinkagePresets() {
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
      description:
        '按对照表或名称规则联动：居家↔回家、离家↔离家、夜间↔睡眠；撤防默认退出家庭模式。',
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
export function getSecurityLinkageFlagRows() {
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
export function getSecurityLinkageParamRows() {
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
