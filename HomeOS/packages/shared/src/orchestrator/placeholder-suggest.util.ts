/**
 * @file placeholder-suggest.util.ts
 * @module @homeos/shared/orchestrator
 * @brief 占位实体 ID 扫描 / 推荐 / 批量替换工具（自动化 / 脚本 YAML 与 geekGraph JSON 共用）。
 *
 * 职责：
 *  - 在 YAML 中扫描需替换的占位 / 泛化实体 ID（如 light.all / *_placeholder / fan.kitchen_hood 等）；
 *  - 按占位符语义（motion / leak / gas ...）与 domain 给真实实体打分推荐；
 *  - 提供安全的批量替换（YAML 字符串 + JSON 深度遍历）。
 *
 * 关键依赖：
 *  - getEntityDomain：domain 提取；
 *  - findPlaceholderEntityIdsInYaml / isPlaceholderEntityId：来自 template/entity-validate。
 *
 * 安全约定：
 *  - 替换目标必须匹配合法 entity_id 正则，防 YAML 注入（用户字符串原样写入 YAML）；
 *  - YAML 替换采用引号包裹的精确匹配，避免误伤同前缀 entity_id；
 *  - JSON 替换按长 key 优先排序，避免短占位误伤长 ID 前缀。
 */
import { getEntityDomain } from '../entity/domain';
import {
  findPlaceholderEntityIdsInYaml,
  isPlaceholderEntityId,
} from '../template/entity-validate';

/**
 * 内置模板常用占位 / 泛化实体（非真实 HA 实体）。
 * 命中后纳入"需替换"集合，即使其名字不含 placeholder。
 */
const TEMPLATE_GENERIC_ENTITY_RE =
  /\b(?:light|switch|climate|cover|fan)\.all\b|\b[a-z][a-z0-9_]*\.[a-z0-9_]*placeholder\b|\bfan\.kitchen_hood\b|\bbinary_sensor\.(?:home_empty|sleeping)\b|\bvalve\.(?:water_main|gas_main)\b|\balarm_control_panel\.home\b|\bzone\.home\b|\blight\.entrance\b|\bclimate\.bedroom\b|\bnotify\.push\b/gi;

/**
 * 实体引用最小形状（推荐算法输入）。
 */
export interface EntityRef {
  /** entity_id */
  id: string;
  /** 实体显示名（用于关键词匹配加分） */
  name?: string;
}

/**
 * 单个占位符的推荐结果。
 */
export interface PlaceholderSuggestion {
  /** 占位实体 ID */
  placeholder: string;
  /** 占位 domain（unknown 表示无法识别） */
  domain: string;
  /** 占位语义中文提示（如"人体/移动传感器"） */
  hint: string;
  /** 推荐的真实 entity_id 列表（最多 limit 条） */
  suggestions: string[];
}

/**
 * 占位符关键词 → 中文语义提示。
 * 命中规则：占位 ID 包含 key 子串即视为匹配。
 */
const PLACEHOLDER_HINTS: Record<string, string> = {
  motion: '人体/移动传感器',
  leak: '水浸传感器',
  smoke: '烟感',
  gas: '燃气传感器',
  rain: '雨水传感器',
  window: '门窗传感器',
  entrance: '玄关/入口灯',
  bedroom: '卧室空调',
  garage: '车库门',
  irrigation: '灌溉开关',
  dehumidifier: '除湿机',
  humidity: '湿度传感器',
  indoor_temp: '室内温度',
  person: '人员追踪',
  home_empty: '全屋无人传感器',
  sleeping: '睡眠状态',
  water_main: '总水阀',
  gas_main: '燃气阀',
  kitchen_hood: '厨房油烟机',
  robot: '扫地机',
  illuminance: '光照传感器',
  door: '门磁',
  alert: '告警传感器',
  trigger: '触发传感器',
  temp: '温度传感器',
  all: '同域设备（可多选后批量替换）',
};

/** 根据占位符 ID 推断中文语义提示（按 PLACEHOLDER_HINTS 子串匹配，未命中回退到 domain） */
function hintForPlaceholder(id: string): string {
  const lower = id.toLowerCase();
  for (const [key, label] of Object.entries(PLACEHOLDER_HINTS)) {
    if (lower.includes(key)) return label;
  }
  return `${getEntityDomain(id) || 'entity'} 实体`;
}

/**
 * 扫描 YAML 中需替换的占位 / 泛化实体 ID。
 *
 * @param yamlStr YAML 文本
 * @returns 去重排序后的占位实体 ID 数组
 */
export function findReplaceableEntityIdsInYaml(yamlStr: string): string[] {
  const found = new Set<string>(findPlaceholderEntityIdsInYaml(yamlStr));
  if (typeof yamlStr === 'string' && yamlStr) {
    for (const m of yamlStr.matchAll(TEMPLATE_GENERIC_ENTITY_RE)) {
      found.add(m[0]);
    }
  }
  return [...found].sort();
}

/** 从占位 ID 提取用于关键词匹配的 token（去除 placeholder / 域名前缀） */
function keywordTokens(id: string): string[] {
  const part = id.split('.')[1] || id;
  return part.split(/[_\-.]+/).filter((t) => t.length > 1 && t !== 'placeholder');
}

/**
 * 为候选实体打分（基于 domain 匹配 + 关键词命中）。
 *
 * @returns 分数：-1 表示 domain 不匹配直接淘汰；0+ 表示推荐度
 */
function scoreEntity(placeholder: string, entity: EntityRef): number {
  const domain = getEntityDomain(placeholder);
  const eDomain = getEntityDomain(entity.id);
  if (domain && eDomain && domain !== eDomain) return -1;
  const keys = keywordTokens(placeholder);
  if (!keys.length) return domain === eDomain ? 1 : 0;
  const hay = `${entity.id} ${entity.name || ''}`.toLowerCase();
  let score = 0;
  for (const k of keys) {
    if (hay.includes(k)) score += 3;
  }
  if (placeholder.includes('motion') && hay.includes('motion')) score += 2;
  if (
    placeholder.includes('leak') &&
    (hay.includes('leak') || hay.includes('moisture') || hay.includes('water'))
  )
    score += 2;
  if (placeholder.includes('smoke') && hay.includes('smoke')) score += 2;
  if (placeholder.includes('gas') && hay.includes('gas')) score += 2;
  return score;
}

/**
 * 为占位实体推荐真实 entity_id（最多 limit 条）。
 *
 * @param placeholder 占位实体 ID
 * @param entities    候选实体集合
 * @param limit       最多返回条数（默认 5）
 * @returns 推荐的 entity_id 列表；无命中时回退到同 domain 实体
 *
 * 推荐策略：
 *  1. domain 不匹配直接淘汰；
 *  2. 按关键词命中数打分，取分数 > 0 的前 limit 条；
 *  3. 无高分项时回退到同 domain 的非占位实体前 limit 条。
 */
export function suggestEntitiesForPlaceholder(
  placeholder: string,
  entities: EntityRef[],
  limit = 5,
): string[] {
  if (!placeholder || !entities?.length) return [];
  const domain = getEntityDomain(placeholder);
  const scored = entities
    .map((e) => ({ id: e.id, score: scoreEntity(placeholder, e) }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const top = scored.filter((r) => r.score > 0).slice(0, limit);
  if (top.length) return top.map((r) => r.id);
  if (domain) {
    return entities
      .filter((e) => getEntityDomain(e.id) === domain && !isPlaceholderEntityId(e.id))
      .slice(0, limit)
      .map((e) => e.id);
  }
  return [];
}

/**
 * 为 YAML 中所有占位实体构建推荐结果列表。
 *
 * @param yamlStr  YAML 文本
 * @param entities 候选实体集合
 * @returns 每个占位符对应的 PlaceholderSuggestion
 */
export function buildPlaceholderSuggestions(
  yamlStr: string,
  entities: EntityRef[],
): PlaceholderSuggestion[] {
  return findReplaceableEntityIdsInYaml(yamlStr).map((placeholder) => ({
    placeholder,
    domain: getEntityDomain(placeholder) || 'unknown',
    hint: hintForPlaceholder(placeholder),
    suggestions: suggestEntitiesForPlaceholder(placeholder, entities),
  }));
}

/** 合法 HA entity_id 正则：domain.object_id（小写字母 / 数字 / 下划线） */
const ENTITY_ID_PATTERN = /^[a-z0-9_]+\.[a-z0-9_]+$/;

/**
 * 校验替换目标必须为合法 entity_id，防 YAML 注入（用户字符串原样写入 YAML）。
 *
 * @param value 待校验的替换目标
 * @throws 替换目标非法时抛错
 */
function assertSafeReplacementTarget(value: string): void {
  if (!ENTITY_ID_PATTERN.test(value)) {
    throw new Error(`占位符替换目标非法（须为合法 entity_id）: ${value}`);
  }
}

/**
 * 在 YAML 字符串中批量替换 entity_id（全局替换，避免误伤需精确匹配）。
 *
 * @param yamlStr     原始 YAML
 * @param replacements from → to 映射
 * @returns 替换后的 YAML
 *
 * 安全策略：
 *  - 替换目标先经 assertSafeReplacementTarget 校验；
 *  - 用引号包裹的精确匹配避免误伤同前缀 ID；
 *  - entity_id: 后的裸值单独再替换一次。
 */
export function replaceEntityIdsInYaml(
  yamlStr: string,
  replacements: Record<string, string>,
): string {
  let out = yamlStr;
  for (const [from, to] of Object.entries(replacements)) {
    const src = String(from || '').trim();
    const dst = String(to || '').trim();
    if (!src || !dst || src === dst) continue;
    assertSafeReplacementTarget(dst);
    const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(['"]?)${escaped}\\1`, 'g'), `$1${dst}$1`);
    out = out.replace(new RegExp(`entity_id:\\s*${escaped}\\b`, 'g'), `entity_id: ${dst}`);
  }
  return out;
}

/**
 * 规范化替换映射：去空白、跳过空 / 相等项、按 from 长度降序排序。
 * 长 key 优先，避免短占位误伤长 ID 前缀。
 */
function normalizeEntityIdReplacements(
  replacements: Record<string, string>,
): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  for (const [from, to] of Object.entries(replacements || {})) {
    const src = String(from || '').trim();
    const dst = String(to || '').trim();
    if (!src || !dst || src === dst) continue;
    assertSafeReplacementTarget(dst);
    out.push({ from: src, to: dst });
  }
  // 长 key 优先，避免短占位误伤长 ID 前缀
  out.sort((a, b) => b.from.length - a.from.length);
  return out;
}

/** 在单个字符串值上按 from→to 精确替换（含逗号分隔列表项） */
function replaceEntityIdInString(
  value: string,
  pairs: Array<{ from: string; to: string }>,
): string {
  let out = value;
  for (const { from, to } of pairs) {
    if (out === from) {
      out = to;
      continue;
    }
    // 逗号分隔的 entity_id 列表
    if (out.includes(',')) {
      out = out
        .split(',')
        .map((part) => {
          const t = part.trim();
          return t === from ? to : part;
        })
        .join(',');
    }
  }
  return out;
}

/**
 * 深度替换 JSON 中等于占位 entity_id 的字符串值（用于 geekGraph 等编辑源）。
 * 不改动 key 名；数组 / 对象递归。
 *
 * @param value        待替换的 JSON 值
 * @param replacements from → to 映射
 * @returns 替换后的新 JSON（不修改原对象）
 */
export function replaceEntityIdsInJson<T>(
  value: T,
  replacements: Record<string, string>,
): T {
  const pairs = normalizeEntityIdReplacements(replacements);
  if (!pairs.length || value == null) return value;

  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return replaceEntityIdInString(node, pairs);
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        next[k] = walk(v);
      }
      return next;
    }
    return node;
  };

  return walk(value) as T;
}
