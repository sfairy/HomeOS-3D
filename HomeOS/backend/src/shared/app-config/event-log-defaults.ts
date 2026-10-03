/**
 * 所属模块：backend/shared/app-config
 * 职责：
 *  - 事件日志默认预设常量；
 * 关键依赖：
 *  - -；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/**
 * EventLog 写入降噪相关默认常量（与 defaults / 一次性迁移共用）。
 *
 * 域级黑名单：流媒体 / 位置刷写 / 更新推送等「家史无价值」域。
 * sensor/binary_sensor 不在此列——由 resolveEventLogTier 按实体名精细筛选
 * （计量表、门窗烟感运动写；温湿度电量等连续遥测不写）。
 */
export const DEFAULT_EVENT_LOG_RECORD_BLOCK_DOMAINS = [
  'camera',
  'image',
  'update',
  'device_tracker',
  'event',
  'sun',
  'weather',
  'zone',
] as const;

/** HA 入口合并默认域（高频读数 / 位置 / 更新推送） */
export const DEFAULT_INGRESS_COALESCE_DOMAINS = [
  'sensor',
  'binary_sensor',
  'device_tracker',
  'update',
] as const;
