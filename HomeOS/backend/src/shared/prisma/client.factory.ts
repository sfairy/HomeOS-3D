/**
 * Prisma 客户端工厂：创建带连接池超时重试 + Pg adapter 的扩展 PrismaClient。
 *
 * 所属模块：shared/prisma（被 PrismaService 构造时调用）。
 * 核心职责：
 *  - 通过 resolvePgPoolConfig 生成 node-pg PoolConfig，交由 @prisma/adapter-pg 自建池，避免跨包 pg instanceof 崩坏；
 *  - 使用 $allOperations 拦截模型与 raw SQL，对 P2024（池超时）做多级线性退避重试；
 *  - 对无法识别的底层错误抛出包装过的 InfraUnavailableError，供启动探测分类。
 * 关键依赖：@prisma/adapter-pg PrismaPg、./url.util#resolvePgPoolConfig / #isPrismaPoolTimeout。
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { getErrorMessage } from '../../common/utils';
import { BusinessException, ErrorCode } from '../../common/utils/business-exception';
import { isPrismaPoolTimeout, resolvePgPoolConfig } from './url.util';

// 连接池繁忙时最大重试次数（含首次调用）：3 次（NAS 小内存部署池紧张，400/800/1200ms 线性退避；
// 过高会掩盖上游慢查询，反而让 P99 变差，故不超过 3）。
const POOL_RETRY_ATTEMPTS = 3;

/**
 * 将底层错误重新抛出为可读的「基础设施不可用」错误。
 * - 若 `getErrorMessage` 已能给出友好提示（与原始 message 不同），则包装为 `InfraUnavailableError`；
 * - 否则原样抛出，保留原始堆栈。
 *
 * @param err - 原始未知错误
 * @returns 永不返回（always throws）
 */
function rethrowFriendly(err: unknown): never {
  const friendly = getErrorMessage(err);
  // 注意：这里必须是「未加工」的原始 message，不能用 getErrorMessage —— 后者会返回
  // friendlify 之后的文案，与 friendly 恒等，导致下方比对永远成立、包装分支变成死代码。
  const raw = err instanceof Error ? err.message : String(err);
  // 友好消息与原始消息一致时说明无法识别，直接抛原始错误保留堆栈
  if (friendly === raw) throw err;
  const wrapped = new Error(friendly);
  wrapped.name = 'InfraUnavailableError';
  (wrapped as Error & { cause?: unknown }).cause = err;
  throw wrapped;
}

/**
 * 创建带连接池重试扩展的 Prisma 客户端。
 *
 * 实现要点：
 *  - `resolvePgPoolConfig()` 解析 DATABASE_URL 得到 node-pg Pool 配置；
 *  - 把配置对象传给 `PrismaPg`（由其内部 `pg` 建池），勿传入外部 `new Pool()`；
 *  - 顶层 `$allOperations` 覆盖模型 CRUD 与 raw SQL（`$allModels` 拦不到 `$queryRaw`）。
 *
 * @param onPoolBusy - 可选回调，连接池繁忙时触发（用于日志告警），参数为可读消息
 * @returns 扩展后的 Prisma 客户端（类型为 `ExtendedPrismaClient`）
 */
export function createExtendedPrismaClient(onPoolBusy?: (message: string) => void) {
  // 必须传 PoolConfig / connectionString，不能传外部 Pool 实例：
  // bun/npm 可能同时装到 pg@8.23 与 adapter-pg 嵌套的 pg@8.22，跨包 instanceof 会失败。
  const adapter = new PrismaPg(resolvePgPoolConfig());
  const client = new PrismaClient({ adapter });

  return client.$extends({
    name: 'pool-retry',
    query: {
      async $allOperations({ model, operation, args, query }) {
        for (let attempt = 1; attempt <= POOL_RETRY_ATTEMPTS; attempt++) {
          try {
            return await query(args);
          } catch (err: unknown) {
            // 非连接池超时错误，或已耗尽重试次数，立即向上抛出友好错误
            if (!isPrismaPoolTimeout(err) || attempt >= POOL_RETRY_ATTEMPTS) {
              rethrowFriendly(err);
            }
            // 线性退避：400ms / 800ms / 1200ms，避免在池满时雪崩
            const waitMs = 400 * attempt;
            const label = model ? `${model}.${operation}` : String(operation);
            onPoolBusy?.(
              `连接池繁忙 (${label})，${waitMs}ms 后重试 (${attempt}/${POOL_RETRY_ATTEMPTS})`,
            );
            await new Promise((r) => setTimeout(r, waitMs));
          }
        }
        // 理论不可达：循环内要么 return 要么 rethrowFriendly 抛出
        throw new BusinessException(ErrorCode.DB_ERROR, '连接池重试：不可达的代码路径');
      },
    },
  });
}

/** 扩展后的 Prisma 客户端类型（含 pool-retry $extends 能力） */
export type ExtendedPrismaClient = ReturnType<typeof createExtendedPrismaClient>;
