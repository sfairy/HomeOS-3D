/**
 * 通知 / 联动冷却持久化服务。
 *
 * 所属模块：common/alert-support。
 * 职责：为通知、能耗、水务、安防、客户端电量等场景提供"冷却期"管理，
 *   在冷却期内抑制重复告警，避免短时间内对用户造成消息轰炸。
 * 关键依赖：
 *   - PrismaService：通过 AdvisorCooldown 表持久化冷却记录。
 *   - scheduleBackgroundTask（circuit-breaker）：异步写入 DB，失败不阻塞主流程。
 *   - getErrorMessage（utils）：统一错误消息提取。
 *
 * DI 角色：@Injectable 服务，实现 OnModuleInit，在模块初始化时预加载未过期的冷却记录到 L1 缓存。
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/prisma/service';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';
import { scheduleBackgroundTask } from '../resilience/circuit-breaker.helper';
import { getErrorMessage } from '../utils';

/** 冷却 dedupKey 的命名空间前缀集合，用于批量查询 / 清理 */
const COOLDOWN_PREFIXES = [
  'notify:',
  'energy:',
  'water:',
  'security:',
  'clientPower:',
  'weather:',
] as const;

/** 冷却命名空间：与 COOLDOWN_PREFIXES 一一对应，调用方传入以隔离不同业务的冷却键 */
type CooldownNamespace = 'notify' | 'energy' | 'water' | 'security' | 'clientPower' | 'weather';

/**
 * 通知/联动冷却持久化 — 复用 AdvisorCooldown 表，dedupKey 带命名空间前缀
 *
 * 该服务维护两层存储：
 * 1. L1 内存缓存（Map）：高频读取路径直接命中内存，零 DB 开销。
 * 2. L2 Prisma / DB（AdvisorCooldown 表）：进程重启后可恢复冷却状态。
 *
 * 写入采用"先更新缓存、再异步落库"策略，确保读路径不受 DB 延迟影响。
 */
@Injectable()
export class NotificationCooldownService implements OnModuleInit {
  private readonly logger = new Logger(NotificationCooldownService.name);
  /** L1 缓存：dedupKey → cooldownUntil ms */
  private readonly cache = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * 模块初始化时预加载未过期的冷却记录到 L1 缓存。
   *
   * 策略：仅加载 cooldownUntil > now 的记录，避免拉取大量已过期数据。
   * 失败时仅 warn 不抛出，避免冷却加载失败阻断整个模块启动。
   */
  async onModuleInit() {
    try {
      const now = BigInt(Date.now());
      const rows = await this.prisma.advisorCooldown.findMany({
        where: {
          OR: COOLDOWN_PREFIXES.map((p) => ({ dedupKey: { startsWith: p } })),
          cooldownUntil: { gt: now },
        },
        take: 5000,
      });
      for (const row of rows) {
        this.cache.set(row.dedupKey, Number(row.cooldownUntil));
      }
      this.logger.log(`通知冷却记录已加载: ${rows.length} 条`);
    } catch (err) {
      // 加载失败不阻断启动，缓存会在后续 setCooldown 时逐步重建
      this.logger.warn(`加载通知冷却失败: ${getErrorMessage(err)}`);
    }
  }

  /**
   * 拼接带命名空间前缀的完整 dedupKey。
   *
   * @param namespace 冷却命名空间（如 'notify'、'energy'）
   * @param key 业务级冷却键（如实体 ID 或告警指纹）
   * @returns 形如 `notify:light.living_room` 的完整键
   */
  private fullKey(namespace: string, key: string): string {
    return `${namespace}:${key}`;
  }

  /**
   * 判断指定命名空间 + 键是否处于冷却期内。
   *
   * @param namespace 冷却命名空间
   * @param key 业务级冷却键
   * @returns true=仍在冷却中（应抑制），false=可发送
   *
   * 副作用：若发现缓存中的记录已过期，顺手删除以释放内存。
   */
  isInCooldown(namespace: CooldownNamespace, key: string): boolean {
    const fk = this.fullKey(namespace, key);
    const until = this.cache.get(fk);
    if (!until) return false;
    // 惰性清理：命中但已过期的记录直接删除
    if (Date.now() >= until) {
      this.cache.delete(fk);
      return false;
    }
    return true;
  }

  /**
   * 设置冷却期。
   *
   * @param namespace 冷却命名空间
   * @param key 业务级冷却键
   * @param minutes 冷却时长（分钟）
   *
   * 副作用：先同步更新 L1 缓存（立即可读），再通过 scheduleBackgroundTask 异步 upsert 到 DB。
   * 异步写入失败由 circuit-breaker 兜底记录，不影响主流程。
   */
  setCooldown(namespace: CooldownNamespace, key: string, minutes: number): void {
    const fk = this.fullKey(namespace, key);
    // 0 / 负数 / 非法值表示「不抑制」：仅清缓存与落库记录，避免写入无意义的冷却行
    if (!Number.isFinite(minutes) || minutes <= 0) {
      this.cache.delete(fk);
      scheduleBackgroundTask(this.logger, '通知冷却清理', () =>
        this.prisma.advisorCooldown.deleteMany({ where: { dedupKey: fk } }),
      );
      return;
    }
    const until = Date.now() + minutes * 60_000;
    // 先更新缓存，确保后续 isInCooldown 立即生效
    this.cache.set(fk, until);
    // 多副本部署：广播到其他实例同步 L1 冷却缓存，避免 Leader 漂移/事件分流后重复告警
    this.eventBus.emit(HOMEOS_EVENTS.COOLDOWN_SET, { key: fk, until });
    // 异步落库：使用 upsert 兼容首次创建与后续更新
    scheduleBackgroundTask(this.logger, '通知冷却持久化', () =>
      this.prisma.advisorCooldown.upsert({
        where: { dedupKey: fk },
        create: { dedupKey: fk, cooldownUntil: BigInt(until) },
        update: { cooldownUntil: BigInt(until), createdAt: new Date() },
      }),
    );
  }

  /**
   * 处理来自其他实例的冷却设置广播，同步本地 L1 缓存。
   *
   * 只接受更晚的过期时间，避免旧广播覆盖新设置的冷却。
   */
  @OnEvent(HOMEOS_EVENTS.COOLDOWN_SET)
  handleCooldownSet(payload?: { key?: string; until?: number }): void {
    if (!payload || typeof payload.key !== 'string' || typeof payload.until !== 'number') return;
    const current = this.cache.get(payload.key);
    if (current == null || payload.until > current) {
      this.cache.set(payload.key, payload.until);
    }
  }

  /**
   * 清理过期 notify:/energy: 冷却记录
   *
   * @returns 本次清理的记录数
   *
   * 策略：分两步——先查询最多 500 条过期记录并同步清除缓存，再批量删除 DB 行。
   * 限量 500 条避免单次事务过大。
   */
  async pruneExpired(): Promise<number> {
    const now = BigInt(Date.now());
    const expired = await this.prisma.advisorCooldown.findMany({
      where: {
        OR: COOLDOWN_PREFIXES.map((p) => ({ dedupKey: { startsWith: p } })),
        cooldownUntil: { lte: now },
      },
      select: { id: true, dedupKey: true },
      take: 500,
    });
    if (expired.length === 0) return 0;
    // 先清理缓存再删 DB，避免清理间隙读到脏数据
    for (const row of expired) {
      this.cache.delete(row.dedupKey);
    }
    await this.prisma.advisorCooldown.deleteMany({
      where: { id: { in: expired.map((r) => r.id) } },
    });
    return expired.length;
  }
}