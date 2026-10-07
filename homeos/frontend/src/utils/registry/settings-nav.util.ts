/**
 * 设置页侧边栏导航结构与文案映射
 *
 * 职责：
 * - 维护设置页导航分组（NAV_GROUP_LABELS）、Tab 标签（TAB_LABELS）、
 *   页面标题（PAGE_TITLE_LABELS）、页面描述（PAGE_DESC_LABELS）。
 * - 维护导航结构（NAV_STRUCTURE）、仅管理员可见 Tab（ADMIN_ONLY_TABS）、
 *   独立保存 Tab（INDEPENDENT_SAVE_TABS）。
 * - 提供分组/Tab 文案查询、Tab 合法性校验、默认 Tab 解析等工具函数。
 *
 * 依赖：无外部依赖，纯静态映射与纯函数。
 *
 * 注意：
 * - 对象 key 为分组 id / Tab id（如 connect、setup-wizard、layout），属于配置 key，不翻译。
 * - 仅面向用户的文案 value 使用简体中文。
 */
const NAV_GROUP_LABELS: Record<string, string> = {
  connect: '入门与连接',
  home: '家居配置',
  display: '界面与体验',
  automate: '自动化与安防',
  interact: '感知交互',
  system: '系统与账户',
}

const TAB_LABELS: Record<string, string> = {
  alerts: '告警规则',
  bindings: '集成绑定',
  rooms: '房间配置',
  connection: 'HA 连接',
  'smart-charge': '智能充放电',
  'life-accounts': '生活账户',
  diagnostics: '运维诊断',
  floating: '浮动组件',
  favorites: '常用设备库',
  embeds: '内嵌网页管理',
  general: '基础设置',
  layout: '仪表板编辑',
  assets: '素材库',
  'home-mode': '家庭模式',
  params: '高级参数',
  profiles: '方案与备份',
  'security-modes': '安防场景',
  'setup-wizard': '首装向导',
  voice: '语音中心',
  agent: '智能管家',
  widgets: '面板部件',
  family: '家庭状态',
  retention: '数据保留',
  devices: '绑定清理',
  license: '授权状态',
}

const PAGE_TITLE_LABELS: Record<string, string> = {
  ...TAB_LABELS,
  embeds: '内嵌网页管理',
  favorites: '常用设备库',
  floating: '浮动组件 管理',
  params: '高级运行参数',
  widgets: '面板部件管理',
  assets: '素材库管理',
  devices: '绑定清理',
}

const PAGE_DESC_LABELS: Record<string, string> = {
  alerts: '应用内通知、语音播报、地震预警与免打扰',
  bindings: '天气、摄像与安防实体映射',
  rooms: '全屋房间目录与应用范围',
  connection: 'Home Assistant 服务地址（HA 自己的内网 / 外网地址）、令牌与实体同步',
  devices: '清理 HA 中已消失、但仍被布局 / 房间 / 告警引用的实体',
  diagnostics: '系统健康、HA 连接与诊断导出',
  embeds: '在顶部导航嵌入外部网页',
  favorites: '常用设备写入布局，供总览快捷弹窗',
  floating: '浮动层：芯片与安防/环境/门锁等中心面板',
  general: '站点品牌、导航标签、底部信息栏、天气特效与显示缩放',
  layout: '仪表盘编辑器与 3D 户型图绘制入口（总览为只读展示）',
  assets: '背景图与状态图标素材管理',
  'smart-charge': '按电量自动开关充电器；屏保时开关关→开可亮屏',
  'life-accounts': '电力、燃气、水务与运营商账户绑定',
  'home-mode': '全屋模式、动作序列与自动触发',
  params: '运行阈值与集成配置',
  profiles: '多终端显示方案与备份还原',
  'security-modes': '布防 / 撤防 / 紧急求助联动序列',
  'setup-wizard': '连接 HA → 安防 → 能源 → 环境 → 户型/收藏 → 启用学习期',
  voice: '播报输出、语音交互与命令映射',
  agent: '自然语言家居控制与多轮对话',
  widgets: '右侧面板微件的添加、排序与配置',
  family: '家庭模式、勿扰、通知与儿童模式',
  license: '本机授权状态、租约与权益清单，含重连 / 重激活 / 退出',
}

/** DEFAULT_TAB：常量，取值语义见定义处。 */
export const DEFAULT_TAB = 'setup-wizard'

/**
 * 设置 Tab → 所需功能码。
 *
 * 只登记**与某个增量模块一一对应**的 Tab。刻意不登记的是聚合型 Tab（``alerts`` 一个面板里
 * 同时编排通知、语音播报与地震预警），按单个码收起会把其它已购模块的配置一起藏掉，
 * 这类面板的可用性交由后端路由门禁兜底。
 */
const TAB_FEATURES: Record<string, string> = {
  voice: 'module.voice',
  agent: 'module.agent',
  'home-mode': 'module.home_mode',
  'security-modes': 'module.security',
  'life-accounts': 'module.energy',
  'smart-charge': 'module.energy',
}

/** 查询 Tab 所需功能码；未登记（不参与门禁）返回空串 */
export function tabFeature(tabId: string) {
  return TAB_FEATURES[tabId] ?? ''
}

/**
 * 判定 Tab 是否被授权放行（仅界面显隐）。
 * @param tabId Tab id
 * @param featureAccess 功能码明细；缺省或未含该码时一律放行（fail-open，接口层 403 兜底）
 */
export function isTabFeatureGranted(tabId: string, featureAccess?: Record<string, boolean>) {
  const code = TAB_FEATURES[tabId]
  if (!code || !featureAccess) return true
  return featureAccess[code] !== false
}

/** NAV_STRUCTURE：常量集合，成员语义见定义处。 */
export const NAV_STRUCTURE = [
  { id: 'connect', tabs: ['setup-wizard', 'connection', 'bindings', 'devices'] },
  { id: 'home', tabs: ['rooms', 'life-accounts', 'smart-charge', 'favorites'] },
  { id: 'display', tabs: ['general', 'assets', 'layout', 'widgets', 'floating', 'embeds'] },
  { id: 'automate', tabs: ['home-mode', 'security-modes'] },
  { id: 'interact', tabs: ['voice', 'agent', 'alerts'] },
  {
    id: 'system',
    tabs: [
      'family',
      'profiles',
      'license',
      'retention',
      'diagnostics',
      'params',
    ],
  },
]

/** ADMIN_ONLY_TABS：常量集合，成员语义见定义处。 */
export const ADMIN_ONLY_TABS = new Set([
  'favorites',
  'layout',
  'assets',
  'widgets',
  'floating',
  'embeds',
  'connection',
  'rooms',
  'bindings',
  'voice',
  'agent',
  'setup-wizard',
  'security-modes',
  'smart-charge',
  'life-accounts',
  'home-mode',
  'alerts',
  'general',
  'profiles',
  'diagnostics',
  'params',
  'devices',
  'license',
])

const ALL_TAB_IDS = new Set(NAV_STRUCTURE.flatMap((g) => g.tabs))

/** 使用面板内独立保存，不受侧边栏「保存全部」影响 */
export const INDEPENDENT_SAVE_TABS = new Set([
  'params',
  'voice',
  'agent',
  'rooms',
  'bindings',
  'connection',
  'alerts',
  'security-modes',
  'smart-charge',
  'life-accounts',
  'home-mode',
  'retention',
])

/** 查询分组中文标签；未命中回退原始 id */
export function groupLabel(id: string) {
  return NAV_GROUP_LABELS[id] ?? id
}

/** 查询 Tab 中文标签；未命中回退原始 id */
export function tabLabel(id: string) {
  return TAB_LABELS[id] ?? id
}

/** 查询页面标题；未命中回退 Tab 标签 */
export function pageTitle(tabId: string) {
  return PAGE_TITLE_LABELS[tabId] ?? tabLabel(tabId)
}

/** 查询页面描述文案；未命中返回空字符串 */
export function pageDescription(tabId: string) {
  return PAGE_DESC_LABELS[tabId] ?? ''
}

/** 规范化 Tab：空或非法时回退 DEFAULT_TAB */
export function resolveTab(tab: string | undefined | null) {
  const raw = tab || DEFAULT_TAB
  return ALL_TAB_IDS.has(raw) ? raw : DEFAULT_TAB
}

/** 判定 Tab id 是否为合法设置页 Tab */
export function isValidSettingsTab(tab: string | undefined | null) {
  if (!tab) return false
  return ALL_TAB_IDS.has(tab)
}

/** 判定 Tab 是否仅管理员可见（先规范化再查集合） */
export function isAdminOnlyTab(tabId: string) {
  return ADMIN_ONLY_TABS.has(resolveTab(tabId))
}

/** 按角色返回默认 Tab：管理员 → setup-wizard，非管理员 → family */
export function defaultTabForRole(isAdmin = true) {
  if (isAdmin) return DEFAULT_TAB
  return 'family'
}

/** 无 ?tab= 时的默认落地页：管理员 → 首装向导，非管理员 → 家庭状态 */
export function resolveDefaultSettingsTab(opts?: { isAdmin?: boolean }): string {
  if (opts?.isAdmin === false) return defaultTabForRole(false)
  return DEFAULT_TAB
}
