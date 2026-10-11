/**
 * 全屋关闭（Whole Home Off）配置类型：按设备域批量关断。
 * 用于一键关闭指定域（灯/窗帘/空调/开关）的所有设备，支持排除与限定实体。
 *
 * 角色：HomeOS 是单一管理员模型（后端 `security/auth_context.py`：只存在 admin 一种角色），
 * 因此这里**不设角色维度** —— 是否可见由功能总开关 `enabled` 决定，能力边界由后端
 * 登录会话（`require_user`）把关。历史上的 `roles` 字段已移除，`normalizeWholeHomeOff`
 * 会在下次读写时把存量 JSON 里的该字段一并丢弃。
 */

/** 全屋关闭配置 */
export interface WholeHomeOffConfig {
  enabled: boolean // 是否启用全屋关闭
  lights: boolean // 是否关闭灯具
  covers: boolean // 是否关闭窗帘
  climate: boolean // 是否关闭空调/气候设备
  switches: boolean // 是否关闭开关
  excludeEntities: string[] // 排除实体 ID 列表（不关闭）
  entityIds: string[] // 目标实体 ID 列表（显式指定时仅操作这些实体）
}

/** 布局配置中全屋关闭的部分字段（合并用） */
export interface LayoutWithWholeHomeOff {
  wholeHomeOff?: Partial<WholeHomeOffConfig> // 全屋关闭配置（部分字段）
}
