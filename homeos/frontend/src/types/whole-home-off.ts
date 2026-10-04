/**
 * 全屋关闭（Whole Home Off）配置类型：按角色与设备域批量关断。
 * 用于一键关闭指定域（灯/窗帘/空调/开关）的所有设备，支持按角色排除。
 */
import type { HomeRole } from '@homeos/shared'

/** 全屋关闭适用的角色：admin=管理员，adult=成人，child=儿童，guest=访客（契约见 @homeos/shared HomeRole） */
export type WholeHomeOffRole = HomeRole

/** 全屋关闭配置 */
export interface WholeHomeOffConfig {
  enabled: boolean // 是否启用全屋关闭
  lights: boolean // 是否关闭灯具
  covers: boolean // 是否关闭窗帘
  climate: boolean // 是否关闭空调/气候设备
  switches: boolean // 是否关闭开关
  roles: WholeHomeOffRole[] // 允许触发的角色列表
  excludeEntities: string[] // 排除实体 ID 列表（不关闭）
  entityIds: string[] // 目标实体 ID 列表（显式指定时仅操作这些实体）
}

/** 布局配置中全屋关闭的部分字段（合并用） */
export interface LayoutWithWholeHomeOff {
  wholeHomeOff?: Partial<WholeHomeOffConfig> // 全屋关闭配置（部分字段）
}