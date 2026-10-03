/**
 * @file execution-history.ts
 * @module @homeos/shared/orchestrator
 * @brief 自动化 / 场景 / 脚本 / 家庭模式 / 告警统一执行历史契约（前后端共用）。
 *
 * 职责：
 *  - 维护执行记录类型枚举与中文标签映射；
 *  - 维护告警类来源的中文展示名称映射与按前缀回退策略；
 *  - 提供"原始记录 → 展示名称"统一格式化入口。
 *
 * 关键依赖：
 *  - 后端 execution-history 模块按本类型落库；
 *  - 前端执行历史列表 / 详情 / 通知中心共用本表渲染来源标签。
 *
 * 约定：
 *  - 未知来源前缀按通用规则回退（earthquake / energy / security 等）；
 *  - 完全未识别的来源原样返回，便于排查数据问题。
 */

/**
 * 执行记录类型枚举（按重要性排序）。
 *  - automation / scene / script：HA 原生可执行实体
 *  - home_mode：HomeOS 家庭模式切换
 *  - alert：告警类执行（含告警规则触发 / 跨模块联动）
 */
export const EXECUTION_RECORD_TYPES = [
  'automation',
  'scene',
  'script',
  'home_mode',
  'alert',
] as const;

/**
 * 执行记录类型字面量联合：automation（自动化）/ scene（场景）/ script（脚本）/ home_mode（家庭模式）/ alert（告警）。
 * 与 EXECUTION_RECORD_TYPES 数组保持同步，用于类型守卫与标签映射。
 */
export type ExecutionRecordType = (typeof EXECUTION_RECORD_TYPES)[number];

/**
 * 执行记录类型 → 中文标签（列表 / 详情标题用）。
 */
export const EXECUTION_TYPE_LABELS: Record<ExecutionRecordType, string> = {
  automation: '自动化',
  scene: '场景',
  script: '脚本',
  home_mode: '家庭模式',
  alert: '告警',
};

/**
 * 告警类执行历史来源 → 展示名称映射。
 * 与 notification/source 的 NOTIFICATION_SOURCE_SHORT_LABELS 部分重叠，
 * 此处保留更详细的"联动 / 监测"等语义，便于在执行历史列表中区分上下文。
 */
export const EXECUTION_ALERT_SOURCE_LABELS: Record<string, string> = {
  'alert-rule': '告警规则',
  'energy-budget': '能耗预算',
  'energy-anomaly': '能耗异常',
  'water-monitor': '用水监测',
  security: '安防联动',
  emergency: '紧急事件',
  'environment-health': '环境健康',
  'earthquake-eew': '地震预警',
  'earthquake-catalog': '震情通报',
  'device-health': '设备健康',
  'device-monitor': '设备监测',
  'schedule-reminder': '日程提醒',
  system: '系统通知',
};

const VALID_EXECUTION_RECORD_TYPES = new Set<string>(EXECUTION_RECORD_TYPES);

/**
 * 类型守卫：判断字符串是否为合法的 ExecutionRecordType。
 *
 * @param type 待校验类型字符串
 * @returns 是合法枚举值时收窄为 ExecutionRecordType
 */
export function isExecutionRecordType(type: string): type is ExecutionRecordType {
  return VALID_EXECUTION_RECORD_TYPES.has(type);
}

/**
 * 获取执行记录类型的中文标签。
 *
 * @param type 类型字符串（可为任意值，未知时原样返回）
 * @returns 中文标签或原值
 */
export function executionTypeLabel(type: string): string {
  if (isExecutionRecordType(type)) return EXECUTION_TYPE_LABELS[type];
  return type;
}

/**
 * 告警通知来源 → 执行历史展示名。
 *
 * @param source 来源 key（如 "alert-rule" / "earthquake-eew" / "advisor-tip"）
 * @returns 中文展示名；空值返回"系统告警"，未知前缀回退到通用类别
 *
 * 回退规则（按前缀匹配）：
 *  - alert-rule* → 告警规则
 *  - earthquake* → 地震预警
 *  - energy* → 能耗监测
 *  - security* / 含 linkage → 安防联动
 *  - environment* → 环境健康
 *  - water* → 用水监测
 *  - device* → 设备监测
 *  - home-mode* → 家庭模式
 */
export function executionAlertSourceLabel(source?: string | null): string {
  const src = String(source || '').trim();
  if (!src) return '系统告警';
  if (EXECUTION_ALERT_SOURCE_LABELS[src]) return EXECUTION_ALERT_SOURCE_LABELS[src];
  if (src.startsWith('alert-rule')) return '告警规则';
  if (src.startsWith('earthquake')) return '地震预警';
  if (src.startsWith('energy')) return '能耗监测';
  if (src.startsWith('security') || src.includes('linkage')) return '安防联动';
  if (src.startsWith('environment')) return '环境健康';
  if (src.startsWith('water')) return '用水监测';
  if (src.startsWith('device')) return '设备监测';
  if (src.startsWith('home-mode')) return '家庭模式';
  return src;
}

/**
 * 执行历史展示输入（前端列表渲染最小字段）。
 */
export type ExecutionHistoryDisplayInput = {
  /** 记录类型（automation / scene / script / home_mode / alert） */
  type?: string | null;
  /** 原始名称（可能为空 / 英文 key） */
  name?: string | null;
  /** 元信息（告警类记录的 source 字段） */
  meta?: { source?: string | null } | null;
};

/**
 * 统一执行历史展示名称（告警来源友好化）。
 *
 * @param record 执行历史记录（最小字段）
 * @returns 展示名；告警类优先用 source 友好化，其余返回原 name 或"未命名"
 *
 * 策略：
 *  1. type === 'alert' 优先用 meta.source；
 *  2. name 命中 EXECUTION_ALERT_SOURCE_LABELS 直接使用；
 *  3. name 为纯 key（仅 \w-）时回退到 executionAlertSourceLabel；
 *  4. 其余返回原 name 或"未命名"。
 */
export function formatExecutionHistoryName(record: ExecutionHistoryDisplayInput): string {
  const rawName = String(record.name || '').trim();
  const source = String(record.meta?.source || '').trim();

  if (record.type === 'alert') {
    if (source) return executionAlertSourceLabel(source);
    if (rawName && EXECUTION_ALERT_SOURCE_LABELS[rawName]) {
      return EXECUTION_ALERT_SOURCE_LABELS[rawName];
    }
    if (rawName && /^[\w-]+$/.test(rawName)) return executionAlertSourceLabel(rawName);
  }

  return rawName || '未命名';
}
