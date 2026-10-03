/**
 * @file entity-references-index.ts
 * @module backend/src/modules/state-store
 * @brief 编排资源倒排索引构建（automation/script/scene/template/alert/home_mode）。
 */
import { extractEntityIdsFromTemplateYaml } from '@homeos/shared';
import type { PrismaService } from '../../shared/prisma/service';
import type { EntityReferenceItem, EntityReferenceRole } from './entity-references.types';
import {
  collectEntityPaths,
  detectYamlEntityRole,
  extractEntityIdsFromGeekGraph,
  pathLooksLikeAction,
  pathLooksLikeTrigger,
  safeParseJson,
} from './entity-references.util';

type PrismaLike = Pick<
  PrismaService,
  'automation' | 'script' | 'scene' | 'templateEntity' | 'alertRule' | 'homeMode'
>;

/**
 * 一次扫描编排资源，构建 entityId → references 倒排索引。
 * 布局/系统配置仍由 EntityReferencesService 按实体补扫。
 */
export async function buildEntityReferencesInvertedIndex(
  prisma: PrismaLike,
): Promise<Map<string, EntityReferenceItem[]>> {
  const map = new Map<string, EntityReferenceItem[]>();
  const pushTo = (entityId: string, item: EntityReferenceItem) => {
    let list = map.get(entityId);
    if (!list) {
      list = [];
      map.set(entityId, list);
    }
    const key = `${item.kind}:${item.id}:${item.role}:${item.detail || ''}`;
    if (list.some((x) => `${x.kind}:${x.id}:${x.role}:${x.detail || ''}` === key)) return;
    list.push(item);
  };

  const [automations, scripts, scenes, templates, alerts, homeModes] = await Promise.all([
    prisma.automation.findMany({
      select: { id: true, name: true, yaml: true, geekGraph: true, enabled: true },
      take: 1000,
    }),
    prisma.script.findMany({
      select: { id: true, name: true, yaml: true, geekGraph: true },
      take: 1000,
    }),
    prisma.scene.findMany({
      select: { id: true, name: true, entities: true, geekSceneGraph: true },
      take: 1000,
    }),
    prisma.templateEntity.findMany({
      select: { id: true, name: true, yaml: true },
      take: 1000,
    }),
    prisma.alertRule.findMany({
      select: { id: true, name: true, entityId: true, enabled: true },
      take: 500,
    }),
    prisma.homeMode.findMany({
      select: { id: true, name: true, config: true, triggers: true },
      take: 200,
    }),
  ]);

  for (const row of automations) {
    let ids: string[] = [];
    try {
      ids = extractEntityIdsFromTemplateYaml(row.yaml || '');
    } catch {
      ids = [];
    }
    try {
      const fromGraph = extractEntityIdsFromGeekGraph(row.geekGraph);
      for (const eid of fromGraph) {
        if (!ids.includes(eid)) ids.push(eid);
      }
    } catch {
      /* 忽略 geekGraph 解析错误 */
    }
    for (const eid of ids) {
      pushTo(eid, {
        kind: 'automation',
        id: row.id,
        name: row.name || '未命名自动化',
        role: detectYamlEntityRole(row.yaml || '', eid),
        enabled: row.enabled,
        path: `/linkage?tab=automation&id=${encodeURIComponent(row.id)}`,
      });
    }
  }

  for (const row of scripts) {
    let ids: string[] = [];
    try {
      ids = extractEntityIdsFromTemplateYaml(row.yaml || '');
    } catch {
      ids = [];
    }
    try {
      const fromGraph = extractEntityIdsFromGeekGraph(row.geekGraph);
      for (const eid of fromGraph) {
        if (!ids.includes(eid)) ids.push(eid);
      }
    } catch {
      /* 忽略 geekGraph 解析错误 */
    }
    for (const eid of ids) {
      pushTo(eid, {
        kind: 'script',
        id: row.id,
        name: row.name || '未命名脚本',
        role: detectYamlEntityRole(row.yaml || '', eid),
        path: `/linkage?tab=script&id=${encodeURIComponent(row.id)}`,
      });
    }
  }

  for (const row of scenes) {
    const members = safeParseJson<unknown>(row.entities);
    const list = Array.isArray(members) ? members : [];
    const seen = new Set<string>();
    for (const m of list) {
      const eid =
        typeof m === 'string'
          ? m
          : m && typeof m === 'object'
            ? String(
                (m as { entity_id?: string; entityId?: string }).entity_id ||
                  (m as { entityId?: string }).entityId ||
                  '',
              )
            : '';
      if (!eid.includes('.') || seen.has(eid)) continue;
      seen.add(eid);
      pushTo(eid, {
        kind: 'scene',
        id: row.id,
        name: row.name || '未命名场景',
        role: 'member',
        path: `/linkage?tab=scene&id=${encodeURIComponent(row.id)}`,
      });
    }
    try {
      for (const eid of extractEntityIdsFromGeekGraph(row.geekSceneGraph)) {
        if (seen.has(eid)) continue;
        seen.add(eid);
        pushTo(eid, {
          kind: 'scene',
          id: row.id,
          name: row.name || '未命名场景',
          role: 'member',
          path: `/linkage?tab=scene&id=${encodeURIComponent(row.id)}`,
        });
      }
    } catch {
      /* 忽略 geekSceneGraph 解析错误 */
    }
  }

  for (const row of templates) {
    let ids: string[] = [];
    try {
      ids = extractEntityIdsFromTemplateYaml(row.yaml || '');
    } catch {
      ids = [];
    }
    for (const eid of ids) {
      pushTo(eid, {
        kind: 'template',
        id: row.id,
        name: row.name || '未命名模板',
        role: 'reference',
        path: `/linkage?tab=template&id=${encodeURIComponent(row.id)}`,
      });
    }
  }

  for (const row of alerts) {
    const eid = String(row.entityId || '').trim();
    if (!eid.includes('.')) continue;
    pushTo(eid, {
      kind: 'alert_rule',
      id: row.id,
      name: row.name || '未命名告警',
      role: 'watch',
      enabled: row.enabled,
      path: '/settings?tab=alerts',
    });
  }

  for (const row of homeModes) {
    const configObj = safeParseJson(row.config);
    const triggerObj = safeParseJson(row.triggers);
    const walkIds = new Set<string>();
    const collectFrom = (node: unknown) => {
      if (!node) return;
      if (typeof node === 'string' && node.includes('.')) walkIds.add(node);
      if (Array.isArray(node)) {
        for (const x of node) collectFrom(x);
        return;
      }
      if (typeof node === 'object') {
        for (const v of Object.values(node as Record<string, unknown>)) collectFrom(v);
      }
    };
    collectFrom(configObj);
    collectFrom(triggerObj);
    for (const eid of walkIds) {
      if (!eid.includes('.')) continue;
      const configPaths = collectEntityPaths(configObj, eid);
      const triggerPaths = collectEntityPaths(triggerObj, eid);
      let role: EntityReferenceRole = 'config';
      if (triggerPaths.length || pathLooksLikeTrigger(triggerPaths[0] || '')) role = 'trigger';
      else if (configPaths.length && pathLooksLikeAction(configPaths[0] || '')) role = 'action';
      else if (configPaths.length) role = 'config';
      else role = 'reference';
      pushTo(eid, {
        kind: 'home_mode',
        id: row.id,
        name: row.name || '家庭模式',
        role,
        path: `/settings?tab=home-mode&id=${encodeURIComponent(row.id)}`,
      });
    }
  }

  return map;
}
