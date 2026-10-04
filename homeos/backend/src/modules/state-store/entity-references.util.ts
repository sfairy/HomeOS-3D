/**
 * 实体反向引用 — 工具函数集
 *
 * 职责：
 *  - 实体 ID 文本匹配（精确 / 包含模式，避免 light.a 误命中 light.abc）
 *  - JSON 值中实体引用的路径收集与递归移除
 *  - 路径角色粗判（trigger / action）
 * 依赖：common/utils（escapeRegExp）
 */
import { escapeRegExp } from '../../common/utils/regex.util';

/** 文本是否包含完整 entity_id（避免 light.a 命中 light.abc） */
function textContainsEntityId(text: string, entityId: string): boolean {
  if (!text || !entityId) return false;
  if (text === entityId) return true;
  const re = new RegExp(`(?:^|[^A-Za-z0-9_])${escapeRegExp(entityId)}(?:[^A-Za-z0-9_]|$)`);
  return re.test(text);
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
    const hit =
      mode === 'exact' ? value === entityId : value === entityId || textContainsEntityId(value, entityId);
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
