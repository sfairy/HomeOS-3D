/**
 * @file scene-placeholder.util.ts
 * @module @homeos/shared/orchestrator
 * @brief 场景 entities JSON 的占位实体扫描 / 推荐 / 替换。
 *
 * 职责：
 *  - 解析场景 entities JSON 数组，扫描其中的占位 / 泛化实体 ID；
 *  - 批量替换 scene entities 中的 entityId 字段；
 *  - 复用 placeholder-suggest.util 的推荐算法构建场景占位符建议。
 *
 * 关键依赖：
 *  - isPlaceholderEntityId / getEntityDomain；
 *  - placeholder-suggest.util 的 suggestEntitiesForPlaceholder（推荐算法复用）。
 *
 * 约定：
 *  - 场景 entities 字段名为 entityId（驼峰），与 HA 原生 entity_id 不同；
 *  - 解析失败返回空数组（不抛异常）。
 */
import { getEntityDomain } from '../entity/domain';
import { isPlaceholderEntityId } from '../template/entity-validate';
import {
  suggestEntitiesForPlaceholder,
  type EntityRef,
  type PlaceholderSuggestion,
} from './placeholder-suggest.util';

/** 场景实体常见泛化 entity（同域 .all / 安防面板 home） */
const SCENE_GENERIC_ENTITY_RE = /\b(?:light|switch|climate)\.all\b|\balarm_control_panel\.home\b/gi;

/** 场景 entities JSON 中的单行结构（弱类型） */
interface SceneEntityRow {
  /** 场景实体 ID（驼峰，区别于 HA 原生 entity_id） */
  entityId?: string;
  /** 实体目标状态 */
  state?: string;
  [key: string]: unknown;
}

/** 解析场景 entities JSON 为行数组，失败返回空数组 */
function parseSceneEntities(entitiesJson: string): SceneEntityRow[] {
  try {
    const parsed = JSON.parse(entitiesJson || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 扫描场景 entities JSON 中需替换的占位 / 泛化实体 ID。
 *
 * @param entitiesJson 场景 entities JSON 字符串
 * @returns 去重排序后的占位实体 ID 数组
 */
export function findReplaceableEntityIdsInSceneEntities(entitiesJson: string): string[] {
  const found = new Set<string>();
  for (const row of parseSceneEntities(entitiesJson)) {
    const id = String(row?.entityId || '').trim();
    if (!id) continue;
    if (isPlaceholderEntityId(id) || id.includes('_placeholder')) found.add(id);
  }
  for (const m of String(entitiesJson || '').matchAll(SCENE_GENERIC_ENTITY_RE)) {
    found.add(m[0]);
  }
  return [...found].sort();
}

/**
 * 批量替换场景 entities JSON 中的 entityId。
 *
 * @param entitiesJson 原 entities JSON 字符串
 * @param replacements from → to 映射（与 YAML 替换共用，不校验目标合法性）
 * @returns 新的 entities JSON 字符串（不修改原对象）
 */
export function replaceEntityIdsInSceneEntities(
  entitiesJson: string,
  replacements: Record<string, string>,
): string {
  const rows = parseSceneEntities(entitiesJson);
  const next = rows.map((row) => {
    const id = String(row?.entityId || '').trim();
    const dst = replacements[id];
    if (!id || !dst || dst === id) return row;
    return { ...row, entityId: dst };
  });
  return JSON.stringify(next);
}

/**
 * 为场景占位实体构建推荐结果列表。
 *
 * @param entitiesJson 场景 entities JSON
 * @param entities     候选实体集合
 * @returns 占位符推荐列表（hint 简化为"同域设备"或 domain 描述）
 */
export function buildScenePlaceholderSuggestions(
  entitiesJson: string,
  entities: EntityRef[],
): PlaceholderSuggestion[] {
  return findReplaceableEntityIdsInSceneEntities(entitiesJson).map((placeholder) => ({
    placeholder,
    domain: getEntityDomain(placeholder) || 'unknown',
    hint: placeholder.includes('all')
      ? '同域设备'
      : `${getEntityDomain(placeholder) || 'entity'} 实体`,
    suggestions: suggestEntitiesForPlaceholder(placeholder, entities),
  }));
}
