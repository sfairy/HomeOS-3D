/**
 * @file hazard-config.util.ts
 * @module @homeos/shared/setup
 * @brief 危险传感器（烟感 / 燃气 / 水浸）绑定解析与安防告警消息构造。
 *
 * 职责：
 *  - 解析 haConfig 中复数数组形式的危险传感器实体 ID（hazardSmokeEntityIds 等）；
 *  - 汇总绑定摘要（HazardBindingSummary）与 entityId → kind 映射；
 *  - 检测同一实体被绑定到多个类别的冲突；
 *  - 构造安防告警消息文本与联动失败描述；
 *  - 收集安防页需实时订阅的实体（传感器 + 关阀 + 排风）。
 *
 * 关键依赖：
 *  - bindings-gaps.util.ts 调用本模块检测危险传感器绑定缺口与冲突；
 *  - 后端安防页按 collectHazardWatchedEntityIds 订阅实体状态。
 *
 * 约定：
 *  - 仅识别复数数组字段（hazardSmokeEntityIds / hazardGasEntityIds / hazardLeakEntityIds）；
 *  - 关阀 / 排风字段为单值或逗号分隔字符串，由本模块归一化为数组。
 */

/** 危险传感器实体 ID 解析（仅复数数组字段） */

/**
 * 危险传感器类别字面量联合：smoke（烟感）/ gas（燃气）/ leak（水浸）。
 * 与 hazardSmokeEntityIds / hazardGasEntityIds / hazardLeakEntityIds 三个复数数组字段一一对应。
 */
export type HazardSensorKind = 'smoke' | 'gas' | 'leak';

/**
 * 三类危险传感器的绑定汇总结果（entityId 字符串数组）。
 * 由 collectHazardBindingSummary 从 haConfig 复数数组字段解析得到，用于绑定展示与后续冲突检测。
 */
export interface HazardBindingSummary {
  smoke: string[]; /** 烟感实体 ID 列表 */
  gas: string[];   /** 燃气实体 ID 列表 */
  leak: string[];  /** 水浸实体 ID 列表 */
}

const HAZARD_BINDING_FIELDS: Array<{ kind: HazardSensorKind; plural: string }> = [
  { kind: 'smoke', plural: 'hazardSmokeEntityIds' },
  { kind: 'gas', plural: 'hazardGasEntityIds' },
  { kind: 'leak', plural: 'hazardLeakEntityIds' },
];

/**
 * 从 haConfig 中解析指定复数数组字段（如 hazardSmokeEntityIds）为去空 trim 后的 entityId 列表。
 *
 * @param haConfig  HA 配置 Record（可 null/undefined，安全兜底）
 * @param pluralKey 字段名（须为复数数组键）
 * @returns entityId 字符串数组；raw 不是数组或空时返回空数组
 */
export function parseHazardEntityIdList(
  haConfig: Record<string, unknown> | null | undefined,
  pluralKey: string,
): string[] {
  const ha = haConfig || {};
  const raw = ha[pluralKey];
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item ?? '').trim()).filter(Boolean);
}

/**
 * 汇总 haConfig 中三类危险传感器的绑定实体（烟/燃气/水浸），返回 HazardBindingSummary 结构便于后续分类处理。
 *
 * @param haConfig HA 配置 Record（可 null/undefined，返回空集合）
 * @returns 三类数组的汇总；任何一类未绑定时对应字段为空数组
 */
export function collectHazardBindingSummary(
  haConfig: Record<string, unknown> | null | undefined,
): HazardBindingSummary {
  const summary: HazardBindingSummary = { smoke: [], gas: [], leak: [] };
  for (const field of HAZARD_BINDING_FIELDS) {
    summary[field.kind] = parseHazardEntityIdList(haConfig, field.plural);
  }
  return summary;
}

/**
 * 构建 entityId → 绑定类别（烟/燃气/水浸）的快速查找 Map；用于告警事件推送时根据触发实体 ID 定位传感器种类。
 *
 * @param haConfig HA 配置 Record（可 null/undefined）
 * @returns Map<string, HazardSensorKind>；若某实体绑到多类别，写入顺序以后者（smoke < gas < leak）覆盖
 */
export function buildHazardBindingMap(
  haConfig: Record<string, unknown> | null | undefined,
): Map<string, HazardSensorKind> {
  const map = new Map<string, HazardSensorKind>();
  const summary = collectHazardBindingSummary(haConfig);
  for (const id of summary.smoke) map.set(id, 'smoke');
  for (const id of summary.gas) map.set(id, 'gas');
  for (const id of summary.leak) map.set(id, 'leak');
  return map;
}

/**
 * 判断 HA 配置中是否已绑定任一危险传感器（三类中至少存在 1 条实体）。
 *
 * @param haConfig HA 配置 Record
 * @returns 任一类非空返回 true；全部空或 null 配置返回 false
 */
export function hasAnyHazardSensorBinding(
  haConfig: Record<string, unknown> | null | undefined,
): boolean {
  const summary = collectHazardBindingSummary(haConfig);
  return summary.smoke.length > 0 || summary.gas.length > 0 || summary.leak.length > 0;
}

/**
 * 将危险传感器绑定汇总格式化为一行中文摘要（如「烟感 3、燃气 2」），用于设置页头部概览。
 *
 * @param haConfig HA 配置 Record
 * @returns 拼接后的中文摘要串；完全未绑定时返回空字符串
 */
export function formatHazardBindingSummaryText(
  haConfig: Record<string, unknown> | null | undefined,
): string {
  const summary = collectHazardBindingSummary(haConfig);
  const parts: string[] = [];
  if (summary.smoke.length) parts.push(`烟感 ${summary.smoke.length}`);
  if (summary.gas.length) parts.push(`燃气 ${summary.gas.length}`);
  if (summary.leak.length) parts.push(`水浸 ${summary.leak.length}`);
  return parts.join('、');
}

/**
 * 根据安防告警事件参数构造中文告警消息文本（含类型分支 + 联动失败说明拼接）。
 *
 * @param data.friendlyName  传感器友好名（缺省用 entityId → 再兜底「传感器」）
 * @param data.entityId      触发实体 ID（兜底展示名与外部日志关联）
 * @param data.zoneNames     区域名（通用分支括号附加）
 * @param data.message       自定义消息（type 缺省时优先使用）
 * @param data.type          告警类型：smoke / gas_leak / water_leak / 其他
 * @param data.actionFailures 联动动作失败列表（关阀/排风 等 humanize 后追加括号）
 * @returns 完整中文消息字符串；至少包含「传感器触发告警」级别文本
 */
export function formatSecurityAlarmMessage(data: {
  friendlyName?: string;
  entityId?: string;
  zoneNames?: string;
  message?: string;
  type?: string;
  actionFailures?: string[];
}): string {
  const name = data.friendlyName || data.entityId || '传感器';
  let base: string;
  if (data.type === 'smoke') base = `烟雾告警：${name} 检测到烟雾，请立即检查`;
  else if (data.type === 'gas_leak') base = `燃气泄漏：${name} 触发告警，请立即通风并检查燃气阀`;
  else if (data.type === 'water_leak') base = `漏水告警：${name} 检测到漏水，水阀已尝试自动关闭`;
  else if (data.message) base = data.message;
  else {
    const zone = data.zoneNames ? ` (${data.zoneNames})` : '';
    base = `${name} 触发告警${zone}`;
  }
  if (data.actionFailures?.length) {
    base += `（联动失败：${data.actionFailures.join('、')}）`;
  }
  return base;
}

/**
 * 同一实体被绑定到多个危险传感器类别的冲突条目（配置错误）。
 * 例如某 entityId 同时出现在 smoke 与 gas 数组中，会被本结构记录供设置页标红。
 */
export interface HazardBindingConflict {
  entityId: string;       /** 冲突的实体 ID */
  kinds: HazardSensorKind[]; /** 该实体被重复绑定到的传感器类别（长度 ≥2） */
}

/**
 * 检测 haConfig 中同一实体 ID 被绑定到多个危险传感器类别的配置冲突（如同时是烟感又当燃气）。
 *
 * @param haConfig HA 配置 Record
 * @returns 冲突条目数组；无冲突返回空（绑定缺口工具据此写入 hazard-conflict gap）
 */
export function detectHazardBindingConflicts(
  haConfig: Record<string, unknown> | null | undefined,
): HazardBindingConflict[] {
  const summary = collectHazardBindingSummary(haConfig);
  const kindByEntity = new Map<string, HazardSensorKind[]>();
  for (const kind of ['smoke', 'gas', 'leak'] as HazardSensorKind[]) {
    for (const id of summary[kind]) {
      const list = kindByEntity.get(id) || [];
      list.push(kind);
      kindByEntity.set(id, list);
    }
  }
  const conflicts: HazardBindingConflict[] = [];
  for (const [entityId, kinds] of kindByEntity) {
    if (kinds.length > 1) conflicts.push({ entityId, kinds });
  }
  return conflicts;
}

/**
 * 收集安防页需实时订阅的 HA 实体 ID（三类危险传感器 + 燃气/水阀 + 排风风扇，去重）。
 *
 * @param haConfig HA 配置 Record
 * @returns 去重后的 entityId 字符串数组；可直接作为后端 WS 网关或 HTTP 接口的订阅集合
 */
export function collectHazardWatchedEntityIds(
  haConfig: Record<string, unknown> | null | undefined,
): string[] {
  const ha = haConfig || {};
  const ids = new Set<string>();
  const summary = collectHazardBindingSummary(ha);
  for (const list of [summary.smoke, summary.gas, summary.leak]) {
    for (const id of list) ids.add(id);
  }
  const gasValve = String(ha.hazardGasValveEntityId ?? '').trim();
  const waterValve = String(ha.hazardWaterValveEntityId ?? '').trim();
  if (gasValve) ids.add(gasValve);
  if (waterValve) ids.add(waterValve);
  const fans = String(ha.hazardExhaustFanEntityIds ?? '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const fan of fans) ids.add(fan);
  return [...ids];
}

/**
 * 危险传感器告警联动动作类别：close_valve（关闭燃气/水阀）/ open_exhaust（开启排风扇）。
 * 与 HazardActionResult.ok 组合使用，用于报告联动成功/失败明细。
 */
export type HazardActionKind = 'close_valve' | 'open_exhaust';

/**
 * 单次危险传感器联动动作的执行结果（关阀或排风），供 summarizeHazardActionFailures 汇总后附加到告警消息。
 */
export interface HazardActionResult {
  target: string;           /** 目标实体 ID 或标签（humanize 后展示） */
  action: HazardActionKind; /** 联动动作类别：关阀 / 排风 */
  ok: boolean;              /** 本次调用是否成功；false 时计入失败列表 */
}

/**
 * 汇总联动动作执行结果，返回失败项的人类可读描述列表（target + 动作文案）。
 *
 * @param results 联动动作结果数组（含 ok=true/false 混合）
 * @returns 失败项的中文描述；无失败时返回空数组（可直接拼接到 formatSecurityAlarmMessage.actionFailures）
 */
export function summarizeHazardActionFailures(results: HazardActionResult[]): string[] {
  return results
    .filter((r) => !r.ok)
    .map((r) => `${r.target}(${r.action === 'close_valve' ? '关阀' : '排风'})`);
}
