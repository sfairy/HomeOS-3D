/**
 * HA 实体快照（户型图/列表等轻量引用）。
 * 仅包含展示所需的最小字段，避免在全量实体快照场景下传输冗余数据。
 */
export interface EntitySnapshot {
  state?: string // 实体状态值
  attributes?: {
    friendly_name?: string // 友好名称（HA 内置属性）
    area_id?: string // 区域 ID
    area_name?: string // 区域名称
    unit_of_measurement?: string // 计量单位
    [key: string]: unknown // 其它 HA 属性（动态扩展）
  }
}