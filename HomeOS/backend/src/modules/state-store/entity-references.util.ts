/**
 * 实体反向引用 — 工具函数集
 *
 * 所属模块：state-store
 * 职责：
 *  - 实体 ID 文本匹配（精确 / 包含模式，避免 light.a 误命中 light.abc）
 *  - YAML 引用检测与角色推断（trigger / condition / action / reference）
 *  - JSON 值中实体引用的路径收集与递归移除
 *  - 场景 entities 成员过滤、YAML 列表项移除
 * 依赖：@homeos/shared（extractEntityIdsFromTemplateYaml、getEntityDomain 等）
 */
import { extractEntityIdsFromTemplateYaml } from '@homeos/shared';
import type { EntityReferenceRole } from './entity-references.types';
import { escapeRegExp } from '../../common/utils/regex.util';

/** 文本是否包含完整 entity_id（避免 light.a 命中 light.abc） */
function textContainsEntityId(text: string, entityId: string): boolean {
  if (!text || !entityId) return false;
  if (text === entityId) return true;
  const re = new RegExp(`(?:^|[^A-Za-z0-9_])${escapeRegExp(entityId)}(?:[^A-Za-z0-9_]|$)`);
  return re.test(text);
}

/** YAML 中是否引用该实体（entity_id: / states()） */
export function yamlReferencesEntity(yaml: string, entityId: string): boolean {
  if (!yaml || !entityId) return false;
  try {
    return extractEntityIdsFromTemplateYaml(yaml).includes(entityId);
  } catch {
    return textContainsEntityId(yaml, entityId);
  }
}

/**
 * 粗分 YAML 区块，推断实体出现在 trigger / condition / action。
 * 解析失败时回退为 reference。
 */
export function detectYamlEntityRole(yaml: string, entityId: string): EntityReferenceRole {
  if (!yamlReferencesEntity(yaml, entityId)) return 'reference';

  // 粗分 YAML 区块边界：trigger / condition / action 三段，用于推断实体出现的角色
  const sections: Array<{ role: EntityReferenceRole; start: RegExp }> = [
    { role: 'trigger', start: /(?:^|\n)\s*(?:trigger|triggers)\s*:/i },
    { role: 'condition', start: /(?:^|\n)\s*(?:condition|conditions)\s*:/i },
    { role: 'action', start: /(?:^|\n)\s*(?:action|actions|sequence)\s*:/i },
  ];

  const hits: EntityReferenceRole[] = [];
  for (const section of sections) {
    const match = section.start.exec(yaml);
    if (!match || match.index == null) continue;
    const from = match.index;
    let to = yaml.length;
    for (const other of sections) {
      if (other.role === section.role) continue;
      other.start.lastIndex = 0;
      const next = other.start.exec(yaml.slice(from + 1));
      if (next && next.index != null) {
        const abs = from + 1 + next.index;
        if (abs > from && abs < to) to = abs;
      }
    }
    const chunk = yaml.slice(from, to);
    if (yamlReferencesEntity(chunk, entityId) || textContainsEntityId(chunk, entityId)) {
      hits.push(section.role);
    }
  }

  if (hits.includes('trigger')) return 'trigger';
  if (hits.includes('condition')) return 'condition';
  if (hits.includes('action')) return 'action';
  return 'reference';
}

/** 安全解析 JSON（JSONB 对象/数组直通；其余 → null） */
export function safeParseJson<T = unknown>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as T;
  return null;
}

/**
 * 在任意 JSON 值中收集命中路径。
 * 默认仅精确字符串相等（与 removeEntityFromJsonValue 对齐，避免列出无法 unlink 的项）。
 * YAML 步骤移除可用 contains 模式匹配模板表达式中的 entity_id。
 */
export function collectEntityPaths(
  value: unknown,
  entityId: string,
  path = '',
  out: string[] = [],
  mode: 'exact' | 'contains' = 'exact',
): string[] {
  if (value == null) return out;

  if (typeof value === 'string') {
    const hit = mode === 'exact' ? value === entityId : value === entityId || textContainsEntityId(value, entityId);
    if (hit) out.push(path || 'value');
    return out;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectEntityPaths(item, entityId, path ? `${path}[${index}]` : `[${index}]`, out, mode);
    });
    return out;
  }

  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const next = path ? `${path}.${key}` : key;
      collectEntityPaths(child, entityId, next, out, mode);
    }
  }

  return out;
}

/** YAML 列表项是否引用实体（含 states()/模板表达式） */
function yamlValueReferencesEntity(value: unknown, entityId: string): boolean {
  if (collectEntityPaths(value, entityId, '', [], 'contains').length) return true;
  try {
    return textContainsEntityId(JSON.stringify(value), entityId);
  } catch {
    return false;
  }
}

/** 路径是否像触发条件 */
export function pathLooksLikeTrigger(path: string): boolean {
  return /trigger/i.test(path);
}

/** 路径是否像动作 */
export function pathLooksLikeAction(path: string): boolean {
  return /action|service|call/i.test(path);
}

/** 实体承载字段名集合：对象中出现这些 key 且值匹配 entityId 时，视为该对象以实体为主键 */
const ENTITY_FIELD_KEYS = new Set([
  'entity_id',
  'entityId',
  'entityIds',
  'entity_ids',
  'id',
  'target',
]);

/**
 * 判断对象是否以指定实体为主键（entity_id / entityId / entityIds / id / target 字段匹配）。
 * @remarks 用于 removeEntityFromJsonValue 中对象数组项的整项移除判定。
 */
function isEntityBearingObject(value: unknown, entityId: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  for (const key of ENTITY_FIELD_KEYS) {
    const v = obj[key];
    if (typeof v === 'string' && v === entityId) return true;
    if (Array.isArray(v) && v.some((x) => String(x) === entityId)) return true;
  }
  return false;
}

/**
 * 从 JSON 值中移除实体引用：
 * - 字符串等于 entityId → 清空为 ''
 * - 字符串数组 → filter
 * - 对象数组中主实体字段匹配 → 移除整项
 * - 其余递归处理
 */
export function removeEntityFromJsonValue(
  value: unknown,
  entityId: string,
): { value: unknown; changed: boolean } {
  if (value == null) return { value, changed: false };

  if (typeof value === 'string') {
    if (value === entityId) return { value: '', changed: true };
    return { value, changed: false };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const next: unknown[] = [];
    for (const item of value) {
      if (typeof item === 'string') {
        if (item === entityId) {
          changed = true;
          continue;
        }
        next.push(item);
        continue;
      }
      if (isEntityBearingObject(item, entityId)) {
        changed = true;
        continue;
      }
      const nested = removeEntityFromJsonValue(item, entityId);
      if (nested.changed) changed = true;
      next.push(nested.value);
    }
    return { value: next, changed };
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    let changed = false;
    for (const [key, child] of Object.entries(obj)) {
      if (
        (key === 'entity_id' || key === 'entityId' || key === 'id') &&
        typeof child === 'string' &&
        child === entityId
      ) {
        out[key] = '';
        changed = true;
        continue;
      }
      if ((key === 'entityIds' || key === 'entity_ids') && Array.isArray(child)) {
        const filtered = child.filter((x) => String(x) !== entityId);
        if (filtered.length !== child.length) changed = true;
        out[key] = filtered;
        continue;
      }
      const nested = removeEntityFromJsonValue(child, entityId);
      if (nested.changed) changed = true;
      out[key] = nested.value;
    }
    return { value: out, changed };
  }

  return { value, changed: false };
}

/** YAML 联动器中承载实体引用的列表 key（trigger / condition / action / sequence） */
const YAML_LIST_KEYS = [
  'trigger',
  'triggers',
  'condition',
  'conditions',
  'action',
  'actions',
  'sequence',
] as const;

/** 从已解析的 YAML 对象中移除引用该实体的列表项，并清空匹配标量字段 */
export function removeEntityFromYamlObject(
  root: Record<string, unknown>,
  entityId: string,
): { changed: boolean; residual: boolean } {
  let changed = false;

  for (const key of YAML_LIST_KEYS) {
    if (!(key in root)) continue;
    const raw = root[key];
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const filtered = list.filter((item) => {
      if (!yamlValueReferencesEntity(item, entityId)) return true;
      changed = true;
      return false;
    });
    root[key] = filtered;
  }

  for (const [key, child] of Object.entries(root)) {
    if ((YAML_LIST_KEYS as readonly string[]).includes(key)) continue;
    const nested = removeEntityFromJsonValue(child, entityId);
    if (nested.changed) {
      changed = true;
      root[key] = nested.value;
    }
  }

  const residual = yamlValueReferencesEntity(root, entityId);
  return { changed, residual };
}

/** 从图 JSON 提取 entity_id（扫描常见字段与嵌套对象） */
const GEEK_ENTITY_KEYS = new Set([
  'entityId',
  'entity_id',
  'varSourceEntityId',
  'sceneId',
  'scriptId',
  'repeatEntityId',
  'condEntityId',
  'waitEntityId',
  'zoneId',
]);

/**
 * extractEntityIdsFromGeekGraph：函数。
 * @param args - 参见类型签名；传入 undefined 时通常按 fallback 分支或返回空值
 * @returns 见类型签名；空场景通常返回 null / [] / {} 或 undefined
 * @throws 依赖不可用或输入非法时抛出 Error 子类
 */
export function extractEntityIdsFromGeekGraph(raw: unknown): string[] {
  const out = new Set<string>();
  const walk = (node: unknown, keyHint?: string) => {
    if (node == null) return;
    if (typeof node === 'string') {
      const s = node.trim();
      if (
        s.includes('.') &&
        !s.includes(' ') &&
        (keyHint ? GEEK_ENTITY_KEYS.has(keyHint) || keyHint.endsWith('EntityId') : /^[a-z0-9_]+\.[a-z0-9_]+$/i.test(s))
      ) {
        if (/^[a-z0-9_]+\.[a-z0-9_.]+$/i.test(s)) out.add(s);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const x of node) walk(x, keyHint);
      return;
    }
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (GEEK_ENTITY_KEYS.has(k) || k.endsWith('EntityId') || k === 'entity_id') {
          walk(v, k);
        } else if (
          k === 'triggers' ||
          k === 'conditions' ||
          k === 'actions' ||
          k === 'flowNodes' ||
          k === 'data' ||
          k === 'sequenceSteps' ||
          k === 'branches' ||
          k === 'repeatActions' ||
          k === 'parallelActions' ||
          k === 'entities'
        ) {
          walk(v, k);
        } else if (typeof v === 'object') {
          walk(v, k);
        }
      }
    }
  };
  walk(raw);
  return [...out];
}

/** 场景 entities JSON：过滤掉目标实体成员（返回可写入 Prisma Json 的值） */
export function removeEntityFromSceneEntities(
  entitiesJson: unknown,
  entityId: string,
): { value: unknown; changed: boolean } {
  const parsed = safeParseJson(entitiesJson);
  if (!parsed) return { value: entitiesJson, changed: false };

  if (Array.isArray(parsed)) {
    const next = parsed.filter((item) => {
      if (typeof item === 'string') return item !== entityId;
      if (!item || typeof item !== 'object') return true;
      const row = item as Record<string, unknown>;
      const id = String(row.entityId || row.entity_id || '');
      return id !== entityId;
    });
    if (next.length === parsed.length) return { value: entitiesJson, changed: false };
    return { value: next, changed: true };
  }

  if (typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(obj, entityId)) {
      const { [entityId]: _removed, ...next } = obj;
      void _removed;
      return { value: next, changed: true };
    }
    const nested = removeEntityFromJsonValue(obj, entityId);
    if (nested.changed) return { value: nested.value, changed: true };
  }

  return { value: entitiesJson, changed: false };
}
