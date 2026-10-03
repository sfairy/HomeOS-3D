/**
 * @file builtin-template-meta.util.ts
 * @module @homeos/shared/orchestrator
 * @brief 内置模板列表项元数据汇总（自动化 / 场景模板卡片展示用）。
 *
 * 职责：
 *  - 从 YAML 或场景 entities JSON 中提取 domain / 关键词标签 / 占位符数量；
 *  - 输出 BuiltinTemplateListItem 供前端模板库列表渲染。
 *
 * 关键依赖：
 *  - findReplaceableEntityIdsInYaml / findReplaceableEntityIdsInSceneEntities：占位符扫描；
 *  - getEntityDomain：domain 抽取。
 *
 * 约定：
 *  - tags 最多 5 个，按"YAML 提示 → domain 中文标签"顺序合并去重；
 *  - domains 用于按 domain 过滤；placeholderCount 用于提示用户需绑定真实实体。
 */
import { getEntityDomain } from '../entity/domain';
import { findReplaceableEntityIdsInYaml } from './placeholder-suggest.util';
import { findReplaceableEntityIdsInSceneEntities } from './scene-placeholder.util';

/** 提取 YAML 中 `entity_id:` 引用的实体 ID */
const ENTITY_ID_RE = /entity_id:\s*['"]?([a-z][a-z0-9_]*\.[a-z0-9_]+)/gi;
/** 提取 YAML 中模板表达式 states()/is_state()/state_attr() 引用的实体 ID */
const STATES_REF_RE = /(?:states|is_state|state_attr)\(\s*['"]([a-z][a-z0-9_]*\.[a-z0-9_]+)['"]/g;

/**
 * HA domain → 中文标签（模板卡片标签用）。
 * 仅保留前端展示常用 domain，未命中的原样返回。
 */
const DOMAIN_CN: Record<string, string> = {
  light: '灯光',
  switch: '开关',
  climate: '空调',
  cover: '窗帘',
  binary_sensor: '传感器',
  sensor: '传感器',
  notify: '通知',
  vacuum: '扫地机',
  valve: '阀门',
  fan: '风扇',
  alarm_control_panel: '安防',
  media_player: '影音',
  scene: '场景',
  script: '脚本',
  lock: '门锁',
  person: '人员',
  zone: '区域',
  water_heater: '热水器',
  humidifier: '加湿',
};

/**
 * YAML 关键词 → 中文标签（用于推断模板场景类型）。
 * 命中顺序按数组顺序，每个正则独立 test 一次。
 */
const YAML_HINT_TAGS: Array<[RegExp, string]> = [
  [/platform:\s*time\b/i, '定时'],
  [/platform:\s*sun\b/i, '日出日落'],
  [/platform:\s*numeric_state\b/i, '数值触发'],
  [/platform:\s*zone\b/i, '地理围栏'],
  [/platform:\s*event\b/i, '事件'],
  [/motion|人体/i, '人体感应'],
  [/leak|漏水/i, '漏水'],
  [/smoke|烟感/i, '烟感'],
  [/gas|燃气/i, '燃气'],
  [/window|开窗/i, '门窗'],
  [/garage|车库/i, '车库'],
  [/irrigation|浇/i, '灌溉'],
  [/humidity|除湿|加湿/i, '湿度'],
  [/presence|到家|离家/i, '在场'],
  [/security|arm|布防|disarm/i, '安防'],
];

/**
 * 内置模板列表项（前端模板库卡片渲染数据）。
 */
export interface BuiltinTemplateListItem {
  /** 模板 ID */
  id: string;
  /** 模板名 */
  name: string;
  /** 模板描述 */
  description: string;
  /** 涉及的 domain 列表（用于过滤） */
  domains: string[];
  /** 中文标签（场景类型 + domain） */
  tags: string[];
  /** 需用户绑定的占位实体数量 */
  placeholderCount: number;
}

/** 从 YAML 文本中提取所有 entity_id 引用（含模板表达式） */
function collectEntityIdsFromText(text: string): string[] {
  const seen = new Set<string>();
  const add = (id: string) => {
    const clean = String(id || '').trim();
    if (clean.includes('.') && !seen.has(clean)) seen.add(clean);
  };
  for (const m of text.matchAll(ENTITY_ID_RE)) add(m[1]);
  for (const m of text.matchAll(STATES_REF_RE)) add(m[1]);
  return [...seen];
}

/** 从 entity_id 列表收集去重后的 domain */
function domainsFromEntityIds(ids: string[]): string[] {
  const set = new Set<string>();
  for (const id of ids) {
    const d = getEntityDomain(id);
    if (d) set.add(d);
  }
  return [...set].sort();
}

/** 把 domain 列表转为中文标签（最多 max 个） */
function domainTags(domains: string[], max = 4): string[] {
  return domains.slice(0, max).map((d) => DOMAIN_CN[d] || d);
}

/** 从 YAML 内容中扫描关键词，生成场景类型标签 */
function hintTagsFromYaml(yaml: string, max = 3): string[] {
  const tags: string[] = [];
  for (const [re, label] of YAML_HINT_TAGS) {
    if (re.test(yaml) && !tags.includes(label)) tags.push(label);
    if (tags.length >= max) break;
  }
  return tags;
}

/** 合并多组标签并去重，最多保留 5 个 */
function mergeTags(...groups: string[][]): string[] {
  const out: string[] = [];
  for (const g of groups) {
    for (const t of g) {
      if (t && !out.includes(t)) out.push(t);
    }
  }
  return out.slice(0, 5);
}

/**
 * 自动化 / 脚本内置模板列表项（含 domain 标签与占位符数量）。
 *
 * @param item 模板原始数据（id / name / description / yaml）
 * @returns 列表项元数据（domains / tags / placeholderCount）
 */
export function summarizeYamlBuiltinTemplate(item: {
  id: string;
  name: string;
  description: string;
  yaml: string;
}): BuiltinTemplateListItem {
  const yaml = item.yaml || '';
  const placeholders = findReplaceableEntityIdsInYaml(yaml);
  const domains = domainsFromEntityIds(collectEntityIdsFromText(yaml));
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    domains,
    tags: mergeTags(hintTagsFromYaml(yaml), domainTags(domains)),
    placeholderCount: placeholders.length,
  };
}

/**
 * 场景内置模板列表项。
 *
 * @param item 模板原始数据（id / name / description / entities，entities 可为 JSON 字符串或数组）
 * @returns 列表项元数据；场景模板不扫描 YAML 提示标签，仅用 domain 标签
 */
export function summarizeSceneBuiltinTemplate(item: {
  id: string;
  name: string;
  description: string;
  entities: string | unknown[];
}): BuiltinTemplateListItem {
  let entityIds: string[] = [];
  let entitiesStr = '[]';
  try {
    const arr = Array.isArray(item.entities)
      ? item.entities
      : (JSON.parse(item.entities || '[]') as unknown[]);
    entitiesStr = Array.isArray(item.entities) ? JSON.stringify(item.entities) : item.entities || '[]';
    if (Array.isArray(arr)) {
      entityIds = arr
        .map((e) => {
          if (!e || typeof e !== 'object') return '';
          const row = e as { entityId?: string; entity_id?: string };
          return String(row.entityId || row.entity_id || '');
        })
        .filter((id) => id.includes('.'));
    }
  } catch {
    entityIds = [];
  }
  const domains = domainsFromEntityIds(entityIds);
  const placeholders = findReplaceableEntityIdsInSceneEntities(entitiesStr);
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    domains,
    tags: domainTags(domains),
    placeholderCount: placeholders.length,
  };
}
