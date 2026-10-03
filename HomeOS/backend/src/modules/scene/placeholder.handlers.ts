/**
 * 场景模块 - 占位符处理器工厂
 *
 * 职责：为场景实体创建占位符扫描与替换的处理器。
 * 场景模板中常使用占位实体（如 light.living_placeholder），
 * 安装模板后需要将其替换为用户家中实际的实体 ID。
 *
 * 同步改写 entities + yaml（若有）+ geekSceneGraph，避免 HA 原文与图画布被清空。
 */
import {
  buildScenePlaceholderSuggestions,
  findReplaceableEntityIdsInSceneEntities,
  replaceEntityIdsInJson,
  replaceEntityIdsInSceneEntities,
  replaceEntityIdsInYaml,
} from '@homeos/shared';
import { notFound } from '../../common/utils/business-exception';
import { entityRefsFromStateStore } from '../../shared/orchestrator/placeholder.helper';
import { fingerprintSceneYaml } from '@homeos/shared';
import type { SceneService } from './service';
import type { StateStoreService } from '../state-store/service';

/**
 * 创建场景占位符处理器。
 * @param sceneService 场景服务（用于查询和更新场景的 entities / geekSceneGraph / yaml）
 * @param stateStore 状态存储服务（用于获取当前实体引用列表）
 */
export function createScenePlaceholderHandlers(
  sceneService: SceneService,
  stateStore: StateStoreService,
) {
  const entityRefs = () => entityRefsFromStateStore(stateStore);
  const notFoundMessage = '场景不存在';

  return {
    async scanPlaceholders(id: string) {
      const row = (await sceneService.findOne(id)) as { entities?: unknown } | null;
      if (!row) notFound(notFoundMessage);
      const content =
        typeof row.entities === 'string'
          ? row.entities
          : JSON.stringify(row.entities ?? []);
      const placeholders = findReplaceableEntityIdsInSceneEntities(content);
      const suggestions = buildScenePlaceholderSuggestions(content, entityRefs());
      return { placeholders, suggestions, remaining: placeholders.length };
    },

    async replacePlaceholders(id: string, replacements: Record<string, string>) {
      const row = (await sceneService.findOne(id)) as {
        entities?: unknown;
        yaml?: string | null;
        geekSceneGraph?: unknown;
      } | null;
      if (!row) notFound(notFoundMessage);
      const map = replacements || {};
      const content =
        typeof row.entities === 'string'
          ? row.entities
          : JSON.stringify(row.entities ?? []);
      const nextContent = replaceEntityIdsInSceneEntities(content, map);
      const payload: Record<string, unknown> = { entities: nextContent };
      const yamlText = typeof row.yaml === 'string' ? row.yaml : '';
      let nextYaml = '';
      if (yamlText.trim()) {
        nextYaml = replaceEntityIdsInYaml(yamlText, map);
        payload.yaml = nextYaml;
      }
      if (row.geekSceneGraph != null && typeof row.geekSceneGraph === 'object') {
        const nextGraph = replaceEntityIdsInJson(row.geekSceneGraph, map) as Record<
          string,
          unknown
        >;
        if (nextYaml) {
          nextGraph.yamlDigest = fingerprintSceneYaml(nextYaml);
        }
        payload.geekSceneGraph = nextGraph;
      }
      const updated = (await sceneService.update(id, payload)) as Record<string, unknown>;
      const remaining = findReplaceableEntityIdsInSceneEntities(nextContent);
      return { ...updated, remaining: remaining.length, entities: nextContent };
    },
  };
}
