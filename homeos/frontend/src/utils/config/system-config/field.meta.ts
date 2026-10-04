/**
 * 系统配置字段元数据统一出口（barrel）
 *
 * 职责：
 * - 聚合字段 key 白名单、字段中文标签、字段提示文案的查询入口。
 * - 供编辑器与高级参数面板统一 import，避免散落引用子模块。
 *
 * 依赖：./field-keys、./field-labels、./field-hints 子模块。
 */
export { SYSTEM_CONFIG_FIELD_KEYS } from './field-keys'
export { resolveSystemConfigFieldLabel } from './field-labels'
export { systemConfigFieldHint } from './field-hints'
