/**
 * RuntimeKv 运行时快照持久化工具：以内存为准的 fire-and-forget 键值落库封装。
 *
 * 所属模块：shared/prisma（服务于会话吊销、License、面板计数等运行态状态）。
 * 核心职责：
 *  - resolveRuntimeKvDelegate：兼容 Prisma Proxy（顶层 / .client 嵌套）两种委托布局；
 *  - loadRuntimeKv：读取 data JSON，失败不抛错（避免启动时缺模型阻断）；
 *  - persistRuntimeKv / scheduleRuntimeKvUpsert：克隆安全载荷后按计划 upsert，失败仅告警。
 * 关键依赖：common/resilience/circuit-breaker.helper#scheduleBackgroundTask、Prisma runtimeKv 模型。
 */

import type { Prisma } from '@generated/prisma';
import type { Logger } from '@nestjs/common';
import { scheduleBackgroundTask } from '../../common/resilience/circuit-breaker.helper';

/**
 * RuntimeKv 持久化：内存为准的运行时快照（非 AppConfig）。
 * 写入 fire-and-forget，失败只告警。
 *
 * PrismaService 是 Proxy：优先 prisma.runtimeKv，拿不到再走 prisma.client.runtimeKv
 *（避免 dist 旧 client.js / 热更新撕裂时出现 `prisma.runtimeKv.upsert` TypeError）。
 */

export function cloneJsonPayload<T>(payload: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
}

type RuntimeKvUpsertArgs = {
  where: { id: string };
  create: { id: string; data: Prisma.InputJsonValue };
  update: { data: Prisma.InputJsonValue };
};

type RuntimeKvFindUnique = {
  findUnique: (args: { where: { id: string } }) => Promise<{ data: unknown } | null>;
};

type RuntimeKvUpsert = {
  upsert: (args: RuntimeKvUpsertArgs) => Promise<unknown>;
};

type RuntimeKvDelegate = RuntimeKvFindUnique & Partial<RuntimeKvUpsert>;

type RuntimeKvHolder = {
  runtimeKv?: RuntimeKvDelegate;
  client?: { runtimeKv?: RuntimeKvDelegate };
};

/**
 * 解析 RuntimeKv 委托：优先顶层 prisma.runtimeKv，回退 prisma.client.runtimeKv。
 * 由测试（test/runtime-kv.util.test.ts）直接引用，故保持导出。
 */
export function resolveRuntimeKvDelegate(prisma: RuntimeKvHolder): RuntimeKvDelegate | undefined {
  const direct = prisma.runtimeKv;
  if (direct) return direct;
  const nested = prisma.client?.runtimeKv;
  if (nested) return nested;
  return undefined;
}

/**
 * 读取指定 id 的运行时快照；失败时返回 null，避免启动期缺模型阻断。
 */
export async function loadRuntimeKv<T>(prisma: RuntimeKvHolder, id: string): Promise<T | null> {
  try {
    const kv = resolveRuntimeKvDelegate(prisma);
    if (!kv?.findUnique) return null;
    const row = await kv.findUnique({ where: { id } });
    return (row?.data ?? null) as T | null;
  } catch {
    return null;
  }
}

/** 克隆载荷后通过 scheduleBackgroundTask 异步 upsert，失败仅告警。 */
export function persistRuntimeKv(
  logger: Logger,
  label: string,
  prisma: RuntimeKvHolder,
  id: string,
  data: object,
): void {
  const payload = cloneJsonPayload(data);
  scheduleBackgroundTask(logger, label, () => {
    const kv = resolveRuntimeKvDelegate(prisma);
    if (!kv?.upsert) {
      throw new Error(
        'RuntimeKv 委托不可用：Prisma Client 未包含该模型。请重新 prisma generate，并确认 dist/backend/generated 无旧 client.js',
      );
    }
    return kv.upsert({
      where: { id },
      create: { id, data: payload },
      update: { data: payload },
    });
  });
}

/**
 * 通过 setImmediate 调度 upsert，失败由 onError 回调上报。
 */
export function scheduleRuntimeKvUpsert(
  prisma: RuntimeKvHolder,
  id: string,
  data: object,
  onError?: (err: unknown) => void,
): void {
  const payload = cloneJsonPayload(data);
  setImmediate(() => {
    const kv = resolveRuntimeKvDelegate(prisma);
    if (!kv?.upsert) {
      onError?.(
        new Error(
          'RuntimeKv 委托不可用：Prisma Client 未包含该模型。请重新 prisma generate，并确认 dist/backend/generated 无旧 client.js',
        ),
      );
      return;
    }
    kv.upsert({
      where: { id },
      create: { id, data: payload },
      update: { data: payload },
    }).catch((err) => {
      onError?.(err);
    });
  });
}
