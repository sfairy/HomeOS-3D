/**
 * @file entity-references-index.ts
 * @module backend/src/modules/state-store
 * @brief 本地资源倒排索引构建（alert_rule / home_mode）。
 */
import type { PrismaService } from '../../shared/prisma/service';
import type { EntityReferenceItem, EntityReferenceRole } from './entity-references.types';
import {
  collectEntityPaths,
  pathLooksLikeAction,
  pathLooksLikeTrigger,
  safeParseJson,
} from './entity-references.util';

type PrismaLike = Pick<PrismaService, 'alertRule' | 'homeMode'>;

/**
 * 一次扫描本地资源，构建 entityId → references 倒排索引。
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

  const [alerts, homeModes] = await Promise.all([
    prisma.alertRule.findMany({
      select: { id: true, name: true, entityId: true, enabled: true },
      take: 500,
    }),
    prisma.homeMode.findMany({
      select: { id: true, name: true, config: true, triggers: true },
      take: 200,
    }),
  ]);

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
