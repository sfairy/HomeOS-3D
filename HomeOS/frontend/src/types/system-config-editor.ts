/**
 * 高级运行参数编辑器：分区 / 字段结构。
 * 用于系统配置编辑器的动态表单渲染与序列化。
 */

/** 配置字段类型：string=字符串，number=数值，boolean=布尔，password=密码，array=数组，object=对象，entity=实体，entity-list=实体列表，select=下拉选择 */
type SystemConfigFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'password'
  | 'array'
  | 'object'
  | 'entity'
  | 'entity-list'
  | 'select'

/** 可编辑配置字段 */
export interface EditableConfigField {
  key: string // 字段 key
  type: SystemConfigFieldType | string // 字段类型
  value: string | number | boolean // 字段值
  isMasked?: boolean // 是否脱敏显示（password 类型）
}

/** 可编辑配置分区 */
export interface EditableConfigSection {
  key: string // 分区 key
  label: string // 分区展示名称
  fields: EditableConfigField[] // 字段列表
}

/** fromEditableSections 序列化结果：sectionKey -> fieldKey -> value */
export type EditableConfigSnapshot = Record<string, Record<string, unknown>>

/** 待保存字段 key（格式：sectionKey:fieldKey） */
export type SystemConfigPendingFieldKey = `${string}:${string}`