/**
 * 所属模块：backend/shared/orchestrator
 * 职责：
 *  - YAML 模板渲染+深度合并+校验入口；
 * 关键依赖：
 *  - js-yaml, zod；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/**
 * orchestrator 配置转换工具桶（re-export）
 *
 * 原单文件（629 行）已按域拆分为四个文件，此处作为兼容桶保留全部导出符号：
 *  - automation-config.util.ts：自动化 YAML ↔ HA Config API
 *  - script-config.util.ts：脚本 YAML ↔ HA Config API
 *  - template-config.util.ts：模板实体 YAML ↔ HA Config / Config Entry Flow
 *  - scene-entity-config.util.ts：场景实体配置 → service 序列 / HA scene map
 */
export * from './automation-config.util';
export * from './script-config.util';
export * from './template-config.util';
export * from './scene-entity-config.util';
