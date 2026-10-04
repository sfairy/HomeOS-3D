/**
 * @file auth-login-alert.helper.ts
 * @module backend/src/modules
 *
 * 异常登录告警辅助函数：
 * - checkNewDeviceLogin：登录成功时检测 (IP, UserAgent) 组合是否首次出现，
 *   首次出现触发 danger 级站内通知 + 外部渠道推送（按 IP 冷却，默认 24h）。
 * - fireBruteForceAlert：账户连续失败达到锁定阈值时触发一次暴力破解告警。
 *
 * 设计说明：
 * - 已知设备集合存放在 Redis（`auth:known-devices:{userId}`，成员为 IP|UA 哈希），
 *   LoginAudit 表无 userAgent 字段（无需迁移 schema），故用专用 Redis Set 记录设备指纹；
 *   Redis 不可用时跳过新设备检测（避免误报），暴力破解告警不依赖 Redis。
 * - 复用 NotificationCooldownService（DB 持久化）实现按 IP 冷却，与设备离线/低电量告警同模式。
 * - 仅调用通知服务，不改变任何登录/锁定业务逻辑。
 */
import { createHash } from 'crypto';
import type { Logger } from '@nestjs/common';
import type { RedisService } from '../../shared/redis/service';
import type { NotificationCooldownService } from '../../common/alert-support/notification-cooldown.service';
import type { Notification } from '../notification/service';

interface AuthLoginAlertDeps {
  logger: Logger;
  redis: RedisService;
  cooldownService: NotificationCooldownService;
  /** 站内通知 + 外部渠道发送入口（注入 NotificationService.notify） */
  notify: (
    level: 'danger',
    message: string,
    source: string,
    opts?: { channels?: string[] },
  ) => Promise<Notification | null>;
  /** 读取 auth 配置（含告警开关与冷却） */
  getAuthCfg: () => {
    loginAlertEnabled?: boolean;
    newDeviceAlertEnabled?: boolean;
    newDeviceAlertCooldownMin?: number;
    bruteForceAlertEnabled?: boolean;
  };
}

/** 登录安全告警投递渠道：站内 + Email + WebPush（不启用 TTS 播报） */
const ALERT_CHANNELS = ['in_app', 'email', 'webpush'];

/**
 * 新设备/新 UA 首次登录检测与告警（登录成功路径调用）。
 *
 * 判定机制：以 (IP, UserAgent) 指纹为成员维护每用户 Redis Set；
 * SISMEMBER 未命中且 SADD 成功（返回 1）即判定为首次出现。
 * 告警按 IP 冷却（默认 24h），同一 IP 更换多个 UA 不会短时轰炸。
 *
 * @param deps 告警依赖
 * @param ctx 登录上下文（username / userId / ip / userAgent）
 */
export async function checkNewDeviceLogin(
  deps: AuthLoginAlertDeps,
  ctx: { username: string; userId?: string | null; ip?: string; userAgent?: string },
): Promise<void> {
  try {
    const cfg = deps.getAuthCfg();
    if (cfg.loginAlertEnabled === false || cfg.newDeviceAlertEnabled === false) return;
    const { username, ip, userAgent } = ctx;
    // 缺 IP 或 UA 无法构成设备指纹，跳过检测
    if (!ip?.trim() || !userAgent?.trim() || !ctx.userId) return;
    // Redis 不可用（未配置/降级）时跳过检测，避免每次登录都误报"新设备"
    if (!deps.redis.isReady() || !deps.redis.getClient()) return;

    const client = deps.redis.getClient();
    if (!client) return;
    const fingerprint = `${ip.trim()}|${createHash('sha256').update(userAgent).digest('hex').slice(0, 32)}`;
    const setKey = `auth:known-devices:${ctx.userId}`;
    const isMember = await client.sismember(setKey, fingerprint);
    if (isMember) return; // 该（IP, UA）组合此前已见过
    const added = await client.sadd(setKey, fingerprint);
    if (added !== 1) return; // 并发下已由其他请求登记，不重复告警

    // 首次出现 → 按 IP 冷却后告警
    const cooldownKey = `auth:new-device:${ip.trim()}`;
    if (deps.cooldownService.isInCooldown('security', cooldownKey)) return;
    const sent = await deps.notify(
      'danger',
      `🔐 新设备登录：账户「${username}」首次从新 IP/UA 登录（IP: ${ip.trim()}，UA: ${userAgent.slice(0, 120)}）`,
      'auth-security',
      { channels: ALERT_CHANNELS },
    );
    if (sent) {
      const cooldownMin = Number(cfg.newDeviceAlertCooldownMin ?? 0);
      deps.cooldownService.setCooldown(
        'security',
        cooldownKey,
        cooldownMin > 0 ? cooldownMin : 1440,
      );
    }
  } catch (err) {
    deps.logger.warn(`新设备登录告警失败: ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * 暴力破解告警：账户连续失败达到锁定阈值时触发一次。
 *
 * 触发时机：recordFailedLoginAttempt 中写入 lockedUntil 的那一次请求（临界点），
 * 由 `lockedUntil IS NULL` 条件写保证并发下仅一次；账户锁定后失败不再自增，
 * 解锁且计数重置后再次触发才视为新一轮攻击，故无需额外冷却。
 *
 * @param deps 告警依赖
 * @param ctx 告警上下文（username / ip / attempts）
 */
export async function fireBruteForceAlert(
  deps: AuthLoginAlertDeps,
  ctx: { username: string; ip?: string; attempts: number },
): Promise<void> {
  try {
    const cfg = deps.getAuthCfg();
    if (cfg.loginAlertEnabled === false || cfg.bruteForceAlertEnabled === false) return;
    const { username, attempts, ip } = ctx;
    await deps.notify(
      'danger',
      `🚨 暴力破解告警：账户「${username}」连续 ${attempts} 次登录失败，已触发账户临时锁定${ip?.trim() ? `（IP: ${ip.trim()}）` : ''}`,
      'auth-security',
      { channels: ALERT_CHANNELS },
    );
  } catch (err) {
    deps.logger.warn(`暴力破解告警失败: ${err instanceof Error ? err.message : err}`);
  }
}
