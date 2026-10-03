/**
 * 所属模块：backend/modules/notification
 * 职责：
 *  - 通知保留策略修剪助手；
 * 关键依赖：
 *  - shared/prisma；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { PrismaService } from '../../shared/prisma/service';
import { Logger } from '@nestjs/common';

/** NotificationPruneHelper 的依赖注入接口 */
interface NotificationPruneDeps {
  logger: Logger;
  prisma: PrismaService;
  getCfg: () => { maxNotifications: number };
}

/**
 * 过期通知清理 Helper。
 * 合并并发 prune 请求，避免批量通知时重复 count/delete。
 * - 防抖：500ms 内的多个 prune 请求合并为一次
 * - 合并执行：prune 进行中的新请求标记为 needsRerun，完成后重新执行
 * - 批量删除：每次最多删除 200 条，优先已读，不足再删未读兜底
 */
export class NotificationPruneHelper {
  private pruneInFlight: Promise<void> | null = null;
  private pruneNeedsRerun = false;
  private pruneDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly PRUNE_DEBOUNCE_MS = 500;
  private static readonly PRUNE_BATCH_SIZE = 200;

  constructor(private readonly deps: NotificationPruneDeps) {}

  /** 模块销毁时清理防抖定时器，避免悬挂定时器 */
  dispose(): void {
    if (this.pruneDebounceTimer) {
      clearTimeout(this.pruneDebounceTimer);
      this.pruneDebounceTimer = null;
    }
  }

  /**
   * 调度通知条数软上限清理（防抖 500ms）。
   * 在防抖窗口内的多次调用合并为一次执行。
   */
  schedulePruneOldNotifications(): void {
    if (this.pruneDebounceTimer) return;
    this.pruneDebounceTimer = setTimeout(() => {
      this.pruneDebounceTimer = null;
      this.runPruneWhenIdle();
    }, NotificationPruneHelper.PRUNE_DEBOUNCE_MS);
  }

  private runPruneWhenIdle(): void {
    if (this.pruneInFlight) {
      this.pruneNeedsRerun = true;
      return;
    }
    this.pruneInFlight = this.runPruneCoalesced()
      .catch((err: Error) => {
        this.deps.logger.warn(`清理过期通知失败: ${err.message}`);
      })
      .finally(() => {
        this.pruneInFlight = null;
        if (this.pruneNeedsRerun) {
          this.pruneNeedsRerun = false;
          this.schedulePruneOldNotifications();
        }
      });
  }

  private async runPruneCoalesced(): Promise<void> {
    do {
      this.pruneNeedsRerun = false;
      await this.pruneOldNotifications();
    } while (this.pruneNeedsRerun);
  }

  /**
   * 执行一轮条数软上限清理。
   * 总数超过 maxNotifications 时：优先按创建时间删除已读；已读不足再删最旧未读（硬兜底）。
   * 天数硬删请用 retention.notification，勿与本逻辑混淆。
   */
  private async pruneOldNotifications() {
    const max = this.deps.getCfg().maxNotifications;
    const batch = NotificationPruneHelper.PRUNE_BATCH_SIZE;
    let totalDeleted = 0;

    for (;;) {
      const count = await this.deps.prisma.notification.count();
      if (count <= max) break;

      const toDelete = Math.min(count - max, batch);
      let oldest = await this.deps.prisma.notification.findMany({
        where: { read: true },
        orderBy: { createdAt: 'asc' },
        take: toDelete,
        select: { id: true },
      });
      // 已读不足时兜底删除最旧未读，保证硬上限
      if (oldest.length < toDelete) {
        const need = toDelete - oldest.length;
        const unread = await this.deps.prisma.notification.findMany({
          where: { read: false },
          orderBy: { createdAt: 'asc' },
          take: need,
          select: { id: true },
        });
        oldest = [...oldest, ...unread];
      }
      if (oldest.length === 0) break;

      await this.deps.prisma.notification.deleteMany({
        where: { id: { in: oldest.map((r) => r.id) } },
      });
      totalDeleted += oldest.length;
      if (oldest.length < toDelete) break;
    }

    if (totalDeleted > 0) {
      this.deps.logger.log(`自动清理 ${totalDeleted} 条通知(条数软上限,优先已读)`);
    }
  }
}
