/**
 * 应用配置常量定义：公开分区、schema 版本、审计存储 id、整段替换分区/字段。
 *
 * 职责：
 *   - PUBLIC_CONFIG_SECTIONS：可免鉴权下发给前端的分区白名单（不含安防/能源阈值等敏感运行参数）；
 *   - APP_CONFIG_SCHEMA_VERSION：配置结构破坏性变更时递增，用于导入/迁移时版本校验；
 *   - CONFIG_AUDIT_STORAGE_ID：配置审计日志在 RuntimeKv 表中的持久化主键；
 *   - CONFIG_REPLACE_ON_UPDATE_SECTIONS / CONFIG_REPLACE_NESTED_FIELDS：
 *     PUT 局部更新时需整段替换（非 deep merge）的分区与嵌套字段，以支持删除 Record 内键。
 * 关键依赖：无外部依赖，纯常量定义。
 */

/** 可公开（免鉴权）下发给前端的分区，不含安防/能源阈值等敏感运行参数 */
export const PUBLIC_CONFIG_SECTIONS = [
  'frontend',
  'ui',
  'screensaver',
  'weatherEffects',
  'voice',
  'voiceCommands',
] as const;

/** 配置 schema 版本号，结构发生破坏性变更时递增 */
export const APP_CONFIG_SCHEMA_VERSION = 17;

/** 配置审计持久化 RuntimeKv id */
export const CONFIG_AUDIT_STORAGE_ID = 'config-audit';

/** PUT /system/config 局部更新时整段替换（非 deep merge），以支持删除 Record 内键 */
export const CONFIG_REPLACE_ON_UPDATE_SECTIONS = [
  'envSensorMap',
  'mediaPlaylists',
  'childMode',
] as const;

/** 分区内的 Record 字段：局部更新时整段替换（非 deep merge） */
export const CONFIG_REPLACE_NESTED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  other: ['advisorTipActions'],
    voice: ['ttsAlertTemplates'],
    frontend: ['widgetPollIntervals'],
};
