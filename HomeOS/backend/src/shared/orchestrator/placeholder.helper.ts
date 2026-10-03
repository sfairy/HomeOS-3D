/**
 * 联动器占位符处理函数工厂。
 *
 * 所属模块：shared/orchestrator（联动器横切基础设施）
 * 职责：
 *   - 从 HA 状态存储提取实体引用。
 *   - 为 YAML + geekGraph 联动器（自动化 / 脚本）提供 scan/replace 占位符处理器。
 *
 * 依赖：
 *   - @homeos/shared：YAML / JSON 占位符工具。
 *   - business-exception：统一的“未找到”业务异常。
 */
import { notFound } from '../../common/utils/business-exception';
import {
  buildPlaceholderSuggestions,
  findReplaceableEntityIdsInYaml,
  replaceEntityIdsInJson,
  replaceEntityIdsInYaml,
  fingerprintScriptYaml,
} from '@homeos/shared';

/**
 * 实体引用：用于生成占位符替换建议。
 * - id：entity_id（如 light.living_room）
 * - name：friendly_name 友好名称，便于用户在 UI 上识别
 */
interface EntityRef {
  id: string;
  name: string;
}

/**
 * 从 HA 状态存储中提取实体引用列表。
 *
 * @param stateStore 提供 getAll() 的状态存储对象
 * @returns 实体引用数组（id 取 entity_id，name 取 friendly_name 属性）
 */
export function entityRefsFromStateStore(stateStore: {
  getAll(): Array<{ entity_id: string; attributes?: Record<string, unknown> }>;
}): EntityRef[] {
  return stateStore.getAll().map((e) => ({
    id: e.entity_id,
    name: String(e.attributes?.friendly_name || ''),
  }));
}

/**
 * YAML + geekGraph 联动器（自动化 / 脚本）：替换 YAML 的同时深度替换图中的占位 entity_id，
 * 并重算 yamlDigest，避免前端将图视为 stale。
 */
export function createYamlGeekPlaceholderHandlers<
  T extends {
    findOne(id: string): Promise<unknown>;
    update(id: string, data: Record<string, unknown>): Promise<unknown>;
  },
>(
  service: T,
  stateStore: { getAll(): Array<{ entity_id: string; attributes?: Record<string, unknown> }> },
  notFoundMessage: string,
  opts?: { fingerprintYaml?: (yaml: string) => string },
) {
  const entityRefs = () => entityRefsFromStateStore(stateStore);
  const fingerprint = opts?.fingerprintYaml;
  return {
    async scanPlaceholders(id: string) {
      const row = (await service.findOne(id)) as { yaml?: string } | null;
      if (!row) notFound(notFoundMessage);
      const content = String(row.yaml || '');
      const placeholders = findReplaceableEntityIdsInYaml(content);
      const suggestions = buildPlaceholderSuggestions(content, entityRefs());
      return { placeholders, suggestions, remaining: placeholders.length };
    },

    async replacePlaceholders(id: string, replacements: Record<string, string>) {
      const row = (await service.findOne(id)) as {
        yaml?: string;
        geekGraph?: unknown;
      } | null;
      if (!row) notFound(notFoundMessage);
      const map = replacements || {};
      const nextYaml = replaceEntityIdsInYaml(String(row.yaml || ''), map);
      const payload: Record<string, unknown> = { yaml: nextYaml };
      if (row.geekGraph != null && typeof row.geekGraph === 'object') {
        const nextGraph = replaceEntityIdsInJson(row.geekGraph, map) as Record<string, unknown>;
        if (fingerprint) {
          nextGraph.yamlDigest = fingerprint(nextYaml);
        }
        payload.geekGraph = nextGraph;
      }
      const updated = (await service.update(id, payload)) as Record<string, unknown>;
      const remaining = findReplaceableEntityIdsInYaml(nextYaml);
      return { ...updated, remaining: remaining.length, yaml: nextYaml };
    },
  };
}

/** 脚本占位符：与自动化相同，同步改写 yaml + geekGraph，并用脚本指纹重算 digest */
export function createScriptPlaceholderHandlers<
  T extends {
    findOne(id: string): Promise<unknown>;
    update(id: string, data: Record<string, unknown>): Promise<unknown>;
  },
>(
  service: T,
  stateStore: { getAll(): Array<{ entity_id: string; attributes?: Record<string, unknown> }> },
  notFoundMessage: string,
) {
  return createYamlGeekPlaceholderHandlers(service, stateStore, notFoundMessage, {
    fingerprintYaml: fingerprintScriptYaml,
  });
}
