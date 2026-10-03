/**
 * @file presence-persist.helper.ts
 * @module backend/src/modules
 *
 * 人员存在感知状态的持久化辅助：把 entityStates / personAggregates /
 * awayConfirmations / everyoneLeftEmitted 序列化到 RuntimeKv（presence-state）。
 * 兼容历史 members 数组格式（迁移到 entityStates 后仍可读取）。
 * 写入失败仅 warn 并把 dirty 重新置位，下个周期重试。
 */
import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../../../shared/prisma/service';
import { cloneJsonPayload, loadRuntimeKv } from '../../../shared/prisma/runtime-kv.util';

/** RuntimeKv 主键 */
const PRESENCE_CONFIG_ID = 'presence-state';

/** 单个跟踪实体的存在状态 */
export interface EntityPresenceState {
  entityId: string;
  name: string;
  source: string;
  atHome: boolean;
  lastSeen: string;
}

/** 聚合后的人员状态（多 tracker 合并到同一人） */
export interface PersonAggregateState {
  name: string;
  atHome: boolean;
}

/** 人员存在感知的持久化快照 */
interface PresencePersistedSnapshot {
  entityStates: Map<string, EntityPresenceState>;
  personAggregates: Map<string, PersonAggregateState>;
  awayConfirmations: Map<string, number>;
  everyoneLeftEmitted: boolean;
}

/**
 * 从 RuntimeKv 加载人员存在感知状态：
 * 兼容旧 members 数组格式（按 resolveMemberEntityId 还原 entityId 后迁移到 entityStates）。
 */
export async function loadPresencePersistedState(
  prisma: PrismaService,
  resolveMemberEntityId: (memberId: string) => string | null,
  logger: Logger,
): Promise<PresencePersistedSnapshot> {
  const entityStates = new Map<string, EntityPresenceState>();
  const personAggregates = new Map<string, PersonAggregateState>();
  const awayConfirmations = new Map<string, number>();
  let everyoneLeftEmitted = false;

  const data = await loadRuntimeKv<{
    entityStates?: Record<string, EntityPresenceState>;
    members?: Array<{
      id: string;
      name: string;
      source: string;
      atHome: boolean;
      lastSeen: string;
    }>;
    personAggregates?: Record<string, PersonAggregateState>;
    awayConfirmations?: Record<string, number>;
    everyoneLeftEmitted?: boolean;
  }>(prisma, PRESENCE_CONFIG_ID);

  if (data?.entityStates && typeof data.entityStates === 'object') {
    for (const [id, state] of Object.entries(data.entityStates)) {
      if (state?.entityId) entityStates.set(id, state as EntityPresenceState);
    }
  } else if (Array.isArray(data?.members)) {
    for (const m of data.members) {
      const entityId = resolveMemberEntityId(m?.id ?? '');
      if (!entityId) continue;
      entityStates.set(entityId, {
        entityId,
        name: m.name,
        source: m.source,
        atHome: m.atHome,
        lastSeen: m.lastSeen,
      });
    }
  }

  if (data?.personAggregates) {
    for (const [id, state] of Object.entries(data.personAggregates)) {
      if (state) personAggregates.set(id, state as PersonAggregateState);
    }
  }

  if (data?.awayConfirmations) {
    for (const [id, ts] of Object.entries(data.awayConfirmations)) {
      awayConfirmations.set(id, Number(ts));
    }
  }
  if (data?.everyoneLeftEmitted) everyoneLeftEmitted = true;
  logger.log(`人员状态已恢复: ${entityStates.size} 个实体`);

  return { entityStates, personAggregates, awayConfirmations, everyoneLeftEmitted };
}

/**
 * 把人员存在感知状态写入 RuntimeKv（dirty 模式：仅在有变更时写入）。
 * 写入失败时把 dirty 重新置位以便下个周期重试，避免状态丢失。
 */
export async function flushPresencePersistedState(
  prisma: PrismaService,
  snapshot: PresencePersistedSnapshot,
  dirty: { value: boolean },
  logger: Logger,
): Promise<void> {
  if (!dirty.value) return;
  dirty.value = false;
  const payload = cloneJsonPayload({
    entityStates: Object.fromEntries(snapshot.entityStates),
    personAggregates: Object.fromEntries(snapshot.personAggregates),
    awayConfirmations: Object.fromEntries(snapshot.awayConfirmations),
    everyoneLeftEmitted: snapshot.everyoneLeftEmitted,
  });
  try {
    await prisma.runtimeKv.upsert({
      where: { id: PRESENCE_CONFIG_ID },
      create: { id: PRESENCE_CONFIG_ID, data: payload },
      update: { data: payload },
    });
  } catch (err: unknown) {
    logger.warn(`人员状态写入失败,将在下次重试: ${String(err)}`);
    dirty.value = true;
  }
}
