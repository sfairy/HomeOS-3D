/**
 * 通知 / 联动冷却服务。
 *
 * 职责：为通知、安防、客户端电量、天气等场景提供"冷却期"管理，
 *   在冷却期内抑制重复告警，避免短时间内对用户造成消息轰炸。
 * 关键依赖：
 *   - EventBusService：多实例间广播冷却设置，Leader 漂移/事件分流后仍能抑制重复告警。
 *
 * 存储策略：纯进程内 L1 缓存（Map）+ 事件总线广播。冷却为短时抑制语义，
 *   进程重启后自行重建，无需 DB 持久化。
 *
 * DI 角色：@Injectable 服务。
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';

/** 冷却 dedupKey 的命名空间前缀集合，用于批量清理 */
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
 * 通知/联动冷却 — dedupKey 带命名空间前缀，进程内缓存 + 事件总线广播。
 */
@Injectable()
export class NotificationCooldownService {
  private readonly logger = new Logger(NotificationCooldownService.name);
  /** L1 缓存：dedupKey → cooldownUntil ms */
  private readonly cache = new Map<string, number>();

  constructor(private readonly eventBus: EventBusService) {}

  /**
   * 拼接带命名空间前缀的完整 dedupKey。
   *
   * @param namespace 冷却命名空间（如 'notify'、'weather'）
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
   * 副作用：更新 L1 缓存后通过事件总线广播到其他实例。
   */
  setCooldown(namespace: CooldownNamespace, key: string, minutes: number): void {
    const fk = this.fullKey(namespace, key);
    // 0 / 负数 / 非法值表示「不抑制」：清除缓存记录
    if (!Number.isFinite(minutes) || minutes <= 0) {
      this.cache.delete(fk);
      this.eventBus.emit(HOMEOS_EVENTS.COOLDOWN_SET, { key: fk, until: 0 });
      return;
    }
    const until = Date.now() + minutes * 60_000;
    // 先更新缓存，确保后续 isInCooldown 立即生效
    this.cache.set(fk, until);
    // 多副本部署：广播到其他实例同步 L1 冷却缓存，避免 Leader 漂移/事件分流后重复告警
    this.eventBus.emit(HOMEOS_EVENTS.COOLDOWN_SET, { key: fk, until });
  }

  /**
   * 处理来自其他实例的冷却设置广播，同步本地 L1 缓存。
   *
   * 只接受更晚的过期时间，避免旧广播覆盖新设置的冷却。
   */
  @OnEvent(HOMEOS_EVENTS.COOLDOWN_SET)
  handleCooldownSet(payload?: { key?: string; until?: number }): void {
    if (!payload || typeof payload.key !== 'string' || typeof payload.until !== 'number') return;
    if (payload.until <= 0) {
      this.cache.delete(payload.key);
      return;
    }
    const current = this.cache.get(payload.key);
    if (current == null || payload.until > current) {
      this.cache.set(payload.key, payload.until);
    }
  }

  /**
   * 清理过期的 notify:/energy:/water:/security:/clientPower:/weather: 冷却记录
   *
   * @returns 本次清理的记录数
   */
  pruneExpired(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, until] of this.cache) {
      const hasKnownPrefix = COOLDOWN_PREFIXES.some((p) => key.startsWith(p));
      if (hasKnownPrefix && until <= now) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed) this.logger.debug(`清理过期冷却记录 ${removed} 条`);
    return removed;
  }
}
