/**
 * 仪表板底部信息栏配置类型：条目、数据源、颜色与字段选项等。
 * 用于配置仪表板底部展示的传感器/能耗/水电等实时数据条目。
 */

/** 底部信息栏颜色主题（与 Tailwind 调色板对齐） */
export type DashboardFooterColor =
  'yellow' | 'purple' | 'cyan' | 'green' | 'gold' | 'blue' | 'orange' | 'rose' | 'teal' | string

/** 底部信息栏数据源：grid=电网，gas=燃气，water=水，ct=电信，cu=联通 */
type DashboardFooterSource = 'grid' | 'gas' | 'water' | 'ct' | 'cu' | string

/** 底部信息栏单个条目配置 */
export interface DashboardFooterItem {
  id: string // 条目唯一 ID
  enabled: boolean // 是否启用
  kind: 'binding' | 'entity' | string // 条目类型：binding=数据绑定，entity=实体直读
  source: DashboardFooterSource // 数据源类型
  primaryField: string // 主字段名（从实体属性取值）
  secondaryField: string // 次字段名（从实体属性取值）
  entityId: string // 关联实体 ID
  attrName: string // 属性名（当 source 为 ct/cu 时使用）
  label: string // 主标签文案
  secondaryLabel: string // 次标签文案
  unit: string // 显示单位
  icon: string // 图标名
  color: DashboardFooterColor // 颜色主题
  showProgress: boolean // 是否展示进度条
  progressMax: number // 进度条最大值
  accountIndex?: number // 账户索引（多账户数据源时指定）
}

/** 底部信息栏整体配置 */
export interface DashboardFooterConfig {
  enabled: boolean // 是否启用底部信息栏
  items: DashboardFooterItem[] // 条目列表
}

/** 底部信息栏条目部分字段（编辑态/预览态用） */
export type DashboardFooterItemPartial = Partial<DashboardFooterItem> & {
  subLabel?: string // 子标签文案（部分视图临时扩展）
  key?: string // 渲染 key（部分视图临时扩展）
}

/** 字段下拉选项 */
export interface FooterFieldOption {
  value: string // 选项值
  label: string // 选项展示文本
}

/** 数据源下拉选项 */
export interface FooterSourceOption {
  value: string // 选项值
  label: string // 选项展示文本
}