/**
 * 自动化 YAML 摘要工具。
 *
 * 所属模块：backend/modules/agent/tools
 * 职责：将自动化 YAML 压成管家可读的「触发 / 条件 / 动作」摘要（只读，不改配置）。
 *  供 HomeToolsService.explainAutomation 工具向用户解释自动化做什么。
 * 依赖：shared/orchestrator/yaml.util（YAML 解析）。
 */
import { parseOrchestratorYaml, toItemList } from '../../../shared/orchestrator/yaml.util';

/** 触发 / 条件 / 动作各类摘要在结果中最多保留的条数，避免过长 */
const MAX_ITEMS = 8;
/** 自动化 YAML 摘要片段（excerpt）最大字符数，超过则截断 */
const MAX_YAML_EXCERPT = 1800;

/** 自动化 YAML 解析后的可读摘要结构 */
type AutomationYamlSummary = {
  /** 自动化的 description 字段（可空） */
  description?: string;
  /** 自动化的 mode（single / restart / queued / parallel） */
  mode?: string;
  /** 触发器摘要列表 */
  triggers: string[];
  /** 条件摘要列表 */
  conditions: string[];
  /** 动作摘要列表 */
  actions: string[];
};

/** 把任意值收敛为对象（数组 / null / 非对象统一回退为空对象），便于后续按字段读取 */
function asRecord(item: unknown): Record<string, unknown> {
  return item && typeof item === 'object' && !Array.isArray(item)
    ? (item as Record<string, unknown>)
    : {};
}

/** 从候选值中挑出第一个有效字符串或数字，其余忽略；全部无效返回空串 */
function pickStr(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
}

/** 提取条目中的 entity_id / target.entity_id 作为指向实体的提示前缀，便于摘要中标识作用对象 */
function entityHint(item: Record<string, unknown>): string {
  const target = asRecord(item.target);
  const entity =
    pickStr(item.entity_id, item.entity, target.entity_id) ||
    (Array.isArray(item.entity_id) ? String(item.entity_id[0] || '') : '');
  return entity ? ` → ${entity}` : '';
}

/** 把单个触发器节点格式化为「类型 → 实体 (附加信息)」形式的可读字符串 */
function labelTrigger(raw: unknown): string {
  const item = asRecord(raw);
  const kind = pickStr(item.trigger, item.platform, item.type) || 'trigger';
  const extra = pickStr(item.event, item.event_type, item.at, item.offset);
  return `${kind}${entityHint(item)}${extra ? ` (${extra})` : ''}`;
}

/** 把单个动作节点格式化为可读字符串；识别 choose / repeat / delay / 普通服务调用 */
function labelAction(raw: unknown): string {
  const item = asRecord(raw);
  if (item.choose) return 'choose 分支';
  if (item.repeat) return 'repeat 循环';
  if (item.delay != null) return `delay ${pickStr(item.delay, asRecord(item.delay).seconds) || ''}`.trim();
  const service = pickStr(item.action, item.service, item.service_name);
  if (service) return `${service}${entityHint(item)}`;
  const kind = pickStr(item.type) || 'action';
  return `${kind}${entityHint(item)}`;
}

/** 把单个条件节点格式化为「类型 → 实体」形式的可读字符串 */
function labelCondition(raw: unknown): string {
  const item = asRecord(raw);
  const kind = pickStr(item.condition, item.type) || 'condition';
  return `${kind}${entityHint(item)}`;
}

/**
 * 解析自动化 YAML 并生成触发 / 条件 / 动作摘要。
 * 每类最多保留 MAX_ITEMS 条，避免长 automation 把上下文撑爆。
 * @param yaml 自动化的 YAML 字符串
 * @returns 摘要对象；解析失败时返回空数组的摘要
 */
export function summarizeAutomationYaml(yaml: string): AutomationYamlSummary {
  const obj = parseOrchestratorYaml(yaml || '');
  if (!obj) {
    return { triggers: [], conditions: [], actions: [] };
  }
  const description = pickStr(obj.description) || undefined;
  const mode = pickStr(obj.mode) || undefined;
  const triggers = toItemList(obj.triggers ?? obj.trigger)
    .slice(0, MAX_ITEMS)
    .map(labelTrigger)
    .filter(Boolean);
  const conditions = toItemList(obj.conditions ?? obj.condition)
    .slice(0, MAX_ITEMS)
    .map(labelCondition)
    .filter(Boolean);
  const actions = toItemList(obj.actions ?? obj.action ?? obj.sequence)
    .slice(0, MAX_ITEMS)
    .map(labelAction)
    .filter(Boolean);
  return { description, mode, triggers, conditions, actions };
}

/**
 * 截取 YAML 文本片段，超过 MAX_YAML_EXCERPT 时尾部追加「(已截断)」。
 * 用于向 LLM 暴露足够上下文同时避免超长。
 * @param yaml 原始 YAML 文本
 * @returns 截断后的 YAML 片段
 */
export function excerptAutomationYaml(yaml: string): string {
  const text = (yaml || '').trim();
  if (text.length <= MAX_YAML_EXCERPT) return text;
  return `${text.slice(0, MAX_YAML_EXCERPT)}\n…(已截断)`;
}

/**
 * 把摘要对象格式化为多行文本，按「说明 / 模式 / 触发 / 条件 / 动作」顺序拼接。
 * @param summary 摘要对象
 * @returns 多行文本，无任何字段时返回空串
 */
export function formatAutomationExplanation(summary: AutomationYamlSummary): string {
  const lines: string[] = [];
  if (summary.description) lines.push(`说明：${summary.description}`);
  if (summary.mode) lines.push(`模式：${summary.mode}`);
  if (summary.triggers.length) lines.push(`触发：${summary.triggers.join('；')}`);
  if (summary.conditions.length) lines.push(`条件：${summary.conditions.join('；')}`);
  if (summary.actions.length) lines.push(`动作：${summary.actions.join('；')}`);
  return lines.join('\n');
}
