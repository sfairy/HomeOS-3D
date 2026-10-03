/**
 * @file auth.service.ts
 * @module backend/src/modules
 */
import { getErrorMessage } from '../../common/utils';
import { Injectable, Logger } from '@nestjs/common';
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from '../../common/utils/business-exception';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../shared/prisma/service';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { GuestShareCodeService } from './guest-share-code.service';
import { TokenVersionCacheService } from '../../common/http-security/token-version-cache.service';
import { SessionRevocationService } from '../../common/http-security/session-revocation.service';
import { AppConfigService } from '../../shared/app-config/service';
import { assertPasswordPolicy } from '../../common/http-security/cookie-cors.util';
import { API_ERROR } from '../../common/errors/api-error-messages';
import {
  getSessionCookieMaxAgeMs as getSessionCookieMaxAgeMsUtil,
  getSessionExpireDays as getSessionExpireDaysUtil,
  getSessionExpiresIn as getSessionExpiresInUtil,
  signAccessToken as signAccessTokenUtil,
} from './session.util';
import {
  recordLoginAudit as recordLoginAuditHelper,
  getLoginAudit as getLoginAuditHelper,
} from './login-audit.helper';
import {
  checkNewDeviceLogin as checkNewDeviceLoginHelper,
  fireBruteForceAlert as fireBruteForceAlertHelper,
} from './login-alert.helper';
import { RedisService } from '../../shared/redis/service';
import { NotificationCooldownService } from '../../common/alert-support/notification-cooldown.service';
import { NotificationService } from '../notification/service';
import {
  listUsers as listUsersHelper,
  createUser as createUserHelper,
  updateUser as updateUserHelper,
  deleteUser as deleteUserHelper,
} from './user-admin.helper';
import {
  generateGuestToken as generateGuestTokenHelper,
  exchangeGuestCode as exchangeGuestCodeHelper,
  verifyGuestToken as verifyGuestTokenHelper,
  guestLogin as guestLoginHelper,
} from './guest.helper';
import {
  getMfaStatus as getMfaStatusHelper,
  startMfaSetup as startMfaSetupHelper,
  confirmMfaSetup as confirmMfaSetupHelper,
  disableMfa as disableMfaHelper,
  loginWithMfa as loginWithMfaHelper,
  userRequiresMfa as userRequiresMfaHelper,
} from './mfa.helper';
import {
  getUserPreferences as getUserPreferencesUtil,
  updateUserPreferences as updateUserPreferencesUtil,
} from './preferences.util';
import type { UpdateUserPreferencesDto } from './dto/user-preferences.dto';

/**
 * 预生成的 bcrypt 哈希，用于用户不存在时执行一次 dummy 比较，
 * 使响应时间与用户存在时一致，避免用户名枚举时序侧信道。
 */
const DUMMY_HASH =
  '$2b$10$GFL.8CarZJXuw3Y/ET6tdeDLd6RNRvtr97RgsTNv4oteETp9w4Laq';

/** 认证服务门面：委托 auth-* helper/util */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** external_url 缓存有效期：/auth/status 高频轮询，避免每次都查 DB */
  private static readonly EXTERNAL_URL_TTL_MS = 30_000;
  /** external_url 内存缓存 */
  private externalUrlCache: { value: string; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly guestShareCodes: GuestShareCodeService,
    private readonly tokenVersionCache: TokenVersionCacheService,
    private readonly sessionRevocation: SessionRevocationService,
    private readonly appConfig: AppConfigService,
    private readonly redis: RedisService,
    private readonly cooldownService: NotificationCooldownService,
    private readonly notificationService: NotificationService,
  ) {}

  private get authCfg() {
    return this.appConfig.get('auth');
  }

  private get loginAuditDeps() {
    return { prisma: this.prisma, logger: this.logger };
  }

  private get loginAlertDeps() {
    return {
      logger: this.logger,
      redis: this.redis,
      cooldownService: this.cooldownService,
      notify: (
        level: 'danger',
        message: string,
        source: string,
        opts?: { channels?: string[] },
      ) => this.notificationService.notify(level, message, source, undefined, opts),
      getAuthCfg: () => this.authCfg,
    };
  }

  private get guestDeps() {
    return { jwtService: this.jwtService, guestShareCodes: this.guestShareCodes };
  }

  private get userAdminDeps() {
    return { prisma: this.prisma };
  }

  private get preferencesDeps() {
    return { prisma: this.prisma, logger: this.logger };
  }

  private get mfaDeps() {
    return {
      prisma: this.prisma,
      invalidateUserSessions: (userId: string) => this.revokeUserSessions(userId),
      recordLoginAudit: (
        username: string,
        userId: string | null | undefined,
        ip: string | undefined,
        success: boolean,
        reason?: string,
      ) => this.recordLoginAudit(username, userId, ip, success, reason),
      validateUser: (username: string, pass: string, ip?: string, userAgent?: string) =>
        this.validateUser(username, pass, ip, userAgent),
      recordFailedLoginAttempt: (userId: string, username: string, ip?: string) =>
        this.recordFailedLoginAttempt(userId, username, ip),
      login: (
        user: { id: string; username: string; role: string },
        opts?: { mfaVerified?: boolean },
      ) => this.login(user, opts),
    };
  }

  getSessionExpireDays(): number {
    return getSessionExpireDaysUtil(this.authCfg?.sessionExpireDays);
  }

  getSessionExpiresIn(): `${number}d` {
    return getSessionExpiresInUtil(this.getSessionExpireDays());
  }

  getSessionCookieMaxAgeMs(): number {
    return getSessionCookieMaxAgeMsUtil(this.getSessionExpireDays());
  }

  private signAccessToken(payload: Record<string, unknown>): string {
    return signAccessTokenUtil(this.jwtService, payload, this.getSessionExpiresIn());
  }

  async countUsers() {
    return this.prisma.user.count();
  }

  /**
   * 首装唯一入口：仅当 User 表为空时可调用。
   * 用户名来自安装界面；角色固定为 admin（不由客户端指定）。
   */
  async registerFirstUser(username: string, pass: string) {
    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      badRequest(API_ERROR.AUTH_USERNAME_REQUIRED);
    }
    assertPasswordPolicy(pass);
    const hashedPassword = await bcrypt.hash(pass, 10);
    // Serializable 事务确保 count 检查与 create 原子化，避免并发 setup 创建多个管理员
    return this.prisma.$transaction(
      async (tx) => {
        const userCount = await tx.user.count();
        if (userCount > 0) {
          forbidden(API_ERROR.AUTH_SYSTEM_INITIALIZED);
        }
        return tx.user.create({
          data: { username: normalizedUsername, password: hashedPassword, role: 'admin' },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async updateProfile(
    userId: string,
    data: { username?: string; password?: string; currentPassword?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) notFound(API_ERROR.AUTH_USER_NOT_FOUND);

    const updateData: {
      username?: string;
      password?: string;
      tokenVersion?: { increment: number };
    } = {};
    if (data.username) updateData.username = data.username;
    if (data.password) {
      assertPasswordPolicy(data.password);
      if (!data.currentPassword?.trim()) {
        badRequest(API_ERROR.AUTH_NEED_CURRENT_PASSWORD);
      }
      if (!(await bcrypt.compare(data.currentPassword, user.password))) {
        unauthorized(API_ERROR.AUTH_PASSWORD_WRONG);
      }
      updateData.password = await bcrypt.hash(data.password, 10);
      updateData.tokenVersion = { increment: 1 };
    }
    const updated = await this.prisma.user.update({ where: { id: userId }, data: updateData });
    if (updateData.tokenVersion) {
      this.tokenVersionCache.invalidate(userId);
    }
    return updated;
  }

  private async buildTokenPayload(
    user: { id: string; username: string; role: string },
    opts?: { mfaVerified?: boolean },
  ) {
    let restrictions: string[] | undefined;
    let tokenVersion = 0;
    try {
      const row = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { preferences: true, tokenVersion: true },
      });
      tokenVersion = row?.tokenVersion ?? 0;
      if (user.role !== 'admin') {
        const prefs = (row?.preferences || {}) as Record<string, unknown>;
        if (Array.isArray(prefs.entityRestrictions) && prefs.entityRestrictions.length > 0) {
          restrictions = prefs.entityRestrictions as string[];
        }
      }
    } catch (e) {
      this.logger.debug(
        `构建 Token 时读取用户偏好失败 [${user.id}]: ${e instanceof Error ? e.message : e}`,
      );
    }
    return {
      username: user.username,
      sub: user.id,
      role: user.role,
      tv: tokenVersion,
      jti: randomUUID(),
      ...(opts?.mfaVerified ? { mfa: true } : {}),
      ...(restrictions ? { restrictions } : {}),
    };
  }

  async revokeUserSessions(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    this.tokenVersionCache.invalidate(userId);
  }

  /**
   * 仅吊销当前 token 对应的会话（按 jti），不影响该用户其它设备。
   * 用于登出：登出哪台设备就只让哪台失效。token 无效/过期则静默忽略。
   */
  async revokeSessionByToken(token: string): Promise<void> {
    try {
      const payload = (await this.jwtService.verifyAsync(token)) as {
        sub?: string;
        jti?: string;
        exp?: number;
        role?: string;
      };
      const nowSec = Math.floor(Date.now() / 1000);
      const ttl = (payload.exp ?? nowSec) - nowSec;
      // token 已过期则本就无效，无需吊销
      if (ttl <= 0) return;
      // 访客 token 无 jti，使用 sub（guest:tokenId）作为黑名单 key，使其可被登出吊销
      const isGuest = payload.role === 'guest';
      const revokeKey = payload.jti || (isGuest ? payload.sub : undefined);
      if (revokeKey) {
        const persisted = await this.sessionRevocation.revoke(revokeKey, ttl);
        // Redis 不可用/写入失败：jti 黑名单未生效 → 回退到 tokenVersion 全设备失效，
        // 确保服务端确实登出（牺牲"仅当前设备"语义换取登出可靠性）
        // 访客无 User 记录，无法走 tokenVersion 回退，仅依赖黑名单
        if (!persisted && payload.sub && !isGuest) {
          await this.revokeUserSessions(payload.sub);
        }
        return;
      }
      // 无 jti 且非访客：无法按会话吊销
    } catch {
      // 令牌无效或已过期：无需吊销
    }
  }

  async login(
    user: { id: string; username: string; role: string },
    opts?: { mfaVerified?: boolean },
  ) {
    const payload = await this.buildTokenPayload(user, opts);
    return {
      access_token: this.signAccessToken(payload),
      username: user.username,
      role: user.role,
      restrictions: Array.isArray(payload.restrictions) ? payload.restrictions : [],
      // 远程访问地址下发给原生端 / 已配对终端，便于漫游后免二次登录取回入口
      external_url: await this.getExternalUrl(),
    };
  }

  /**
   * 读取「远程访问地址」（layout.externalUrl）。
   *
   * 带 30s 内存缓存：`/auth/status` 会被前端高频轮询，逐次查 DB 不值得。
   * 失败时返回空串，绝不抛错（登录 / 状态接口不能被网络配置问题拖垮）。
   * @returns 远程访问地址
   */
  async getExternalUrl(): Promise<string> {
    const now = Date.now();
    if (
      this.externalUrlCache &&
      now - this.externalUrlCache.at < AuthService.EXTERNAL_URL_TTL_MS
    ) {
      return this.externalUrlCache.value;
    }
    let value = '';
    try {
      const profileId =
        String(this.appConfig.get('profiles')?.activeProfileId || '').trim() || 'default';
      const config = await this.prisma.projectConfig.findUnique({
        where: { projectId: profileId },
      });
      const layout = config?.layout as { externalUrl?: unknown } | null | undefined;
      value = layout?.externalUrl == null ? '' : String(layout.externalUrl).trim();
    } catch (e: unknown) {
      this.logger.warn(
        `读取 external_url 失败: ${getErrorMessage(e)}`,
      );
    }
    this.externalUrlCache = { value, at: now };
    return value;
  }

  async refresh(user: { userId: string; username: string; role: string; mfa?: boolean }) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { username: true, role: true, totpEnabled: true },
    });
    if (!dbUser) {
      unauthorized(API_ERROR.AUTH_USER_OR_SESSION_INVALID);
    }
    // 无论角色，只要账户启用了 TOTP，滑动续期就必须经过 MFA 复核（与登录路径强制策略一致）
    if (dbUser.totpEnabled && user.mfa !== true) {
      unauthorized(API_ERROR.AUTH_MFA_RELOGIN_REQUIRED);
    }
    const payload = await this.buildTokenPayload(
      {
        id: user.userId,
        username: dbUser.username,
        role: dbUser.role,
      },
      { mfaVerified: user.mfa === true },
    );
    return {
      access_token: this.signAccessToken(payload),
      username: dbUser.username,
      role: dbUser.role,
      restrictions: Array.isArray(payload.restrictions) ? payload.restrictions : [],
    };
  }

  async validateUser(username: string, pass: string, ip?: string, userAgent?: string) {
    const user = (await this.prisma.user.findUnique({ where: { username } })) as {
      id: string;
      username: string;
      password: string;
      role: string;
      lockedUntil?: Date;
      failedLoginAttempts?: number;
    };
    const now = new Date();

    if (user?.lockedUntil && user.lockedUntil > now) {
      await this.recordLoginAudit(username, user.id, ip, false, 'account_locked');
      forbidden(API_ERROR.AUTH_ACCOUNT_LOCKED);
    }

    if (user?.lockedUntil && user.lockedUntil <= now) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: null, failedLoginAttempts: 0 },
      });
    }

    if (user && (await bcrypt.compare(pass, user.password))) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
      await this.recordLoginAudit(username, user.id, ip, true);
      // 登录成功：检测新设备/新 UA 首次登录，异常时发出 danger 告警（不阻塞登录流程）
      await this.checkNewDeviceLogin(username, user.id, ip, userAgent);
      const { password, ...result } = user;
      void password;
      return result;
    }

    if (user) {
      const { lockedUntil } = await this.recordFailedLoginAttempt(user.id, username, ip);
      await this.recordLoginAudit(
        username,
        user.id,
        ip,
        false,
        lockedUntil ? 'invalid_password_locked' : 'invalid_password',
      );
    } else {
      // 用户不存在时执行一次 dummy bcrypt 比较，使响应时间与用户存在时一致，避免用户名枚举
      await bcrypt.compare(pass, DUMMY_HASH);
      await this.recordLoginAudit(username, null, ip, false, 'invalid_credentials');
    }

    unauthorized(API_ERROR.AUTH_INVALID_CREDENTIALS);
  }

  /**
   * 原子地累加失败登录次数并在达到阈值时锁定账户。
   *
   * 使用 updateMany 的 WHERE 条件（failedLoginAttempts < 阈值）实现原子自增，
   * 避免并发请求「先读后写」绕过锁定。达到阈值时同步写入 lockedUntil。
   * 供 validateUser 与 MFA 失败路径共用。
   *
   * 达到阈值（触发锁定）的那一次请求会顺带发出暴力破解告警——
   * 由 `lockedUntil IS NULL` 条件写保证并发下仅触发一次；锁定后不再重复。
   */
  private async recordFailedLoginAttempt(
    userId: string,
    username: string,
    ip?: string,
  ): Promise<{ lockedUntil: Date | null }> {
    const { lockoutMaxAttempts, lockoutMinutes } = this.authCfg;
    // 仅当未达锁定阈值时才自增；并发下达到阈值的请求不会重复自增
    await this.prisma.user.updateMany({
      where: { id: userId, failedLoginAttempts: { lt: lockoutMaxAttempts } },
      data: { failedLoginAttempts: { increment: 1 } },
    });
    // 读取自增后的最新值，判断是否触发锁定
    const after = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { failedLoginAttempts: true, lockedUntil: true },
    });
    const attempts = after?.failedLoginAttempts ?? lockoutMaxAttempts;
    const lockedUntil =
      attempts >= lockoutMaxAttempts && !after?.lockedUntil
        ? new Date(Date.now() + lockoutMinutes * 60_000)
        : null;
    if (lockedUntil) {
      // 条件写入 lockedUntil，避免覆盖已存在的锁定时间
      await this.prisma.user.updateMany({
        where: { id: userId, lockedUntil: null },
        data: { lockedUntil },
      });
      // 连续失败达到阈值 → 暴力破解告警（不阻塞锁定流程）
      await this.fireBruteForceAlert(username, ip, attempts);
    }
    return { lockedUntil };
  }

  /**
   * 新设备/新 UA 首次登录检测与告警（委托 login-alert.helper）。
   * 仅做检测与通知，不改变登录流程。
   */
  private checkNewDeviceLogin(
    username: string,
    userId: string | null | undefined,
    ip: string | undefined,
    userAgent?: string,
  ) {
    return checkNewDeviceLoginHelper(this.loginAlertDeps, { username, userId, ip, userAgent });
  }

  /** 暴力破解告警（委托 login-alert.helper）。 */
  private fireBruteForceAlert(username: string, ip: string | undefined, attempts: number) {
    return fireBruteForceAlertHelper(this.loginAlertDeps, { username, ip, attempts });
  }

  private async recordLoginAudit(
    username: string,
    userId: string | null | undefined,
    ip: string | undefined,
    success: boolean,
    reason?: string,
  ) {
    return recordLoginAuditHelper(this.loginAuditDeps, username, userId, ip, success, reason);
  }

  async getLoginAudit(limit = 50, page = 1) {
    return getLoginAuditHelper(this.loginAuditDeps, limit, page);
  }

  async verifyToken(token: string): Promise<{
    username: string;
    sub: string;
    role: string;
    restrictions?: string[];
  }> {
    const payload = (await this.jwtService.verifyAsync(token)) as {
      username: string;
      sub: string;
      role?: string;
      restrictions?: string[];
      tv?: number;
      jti?: string;
    };
    // 访客 token 无 jti，使用 sub（guest:tokenId）作为黑名单 key
    const revokeKey = payload.jti || (payload.role === 'guest' ? payload.sub : undefined);
    if (revokeKey && (await this.sessionRevocation.isRevoked(revokeKey))) {
      unauthorized(API_ERROR.AUTH_SESSION_EXPIRED);
    }
    if (payload.role === 'guest') {
      return {
        username: payload.username,
        sub: payload.sub,
        role: 'guest',
        restrictions: Array.isArray(payload.restrictions) ? payload.restrictions : undefined,
      };
    }
    const tokenVersion = typeof payload.tv === 'number' ? payload.tv : 0;
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { tokenVersion: true, username: true, role: true, preferences: true },
    });
    if (!user) unauthorized(API_ERROR.AUTH_USER_OR_SESSION_INVALID);
    if (tokenVersion !== user.tokenVersion) {
      unauthorized(API_ERROR.AUTH_SESSION_EXPIRED);
    }
    let restrictions: string[] | undefined;
    const userRole = user.role || payload.role || 'user';
    if (userRole !== 'admin') {
      const prefs = (user.preferences || {}) as Record<string, unknown>;
      if (Array.isArray(prefs.entityRestrictions) && prefs.entityRestrictions.length > 0) {
        restrictions = prefs.entityRestrictions as string[];
      }
    }
    return {
      username: user.username || payload.username,
      sub: payload.sub,
      role: userRole,
      restrictions,
    };
  }

  async generateGuestToken(
    issuerId: string,
    validHours = 8,
    restrictions?: string[],
    allowedSceneIds?: string[],
  ) {
    return generateGuestTokenHelper(
      this.guestDeps,
      issuerId,
      validHours,
      restrictions,
      allowedSceneIds,
    );
  }

  async exchangeGuestCode(code: string) {
    return exchangeGuestCodeHelper(this.guestDeps, code);
  }

  verifyGuestToken(token: string) {
    return verifyGuestTokenHelper(this.guestDeps, token);
  }

  guestLogin(token: string) {
    return guestLoginHelper(this.guestDeps, token);
  }

  async getUserPreferences(userId: string) {
    return getUserPreferencesUtil(this.preferencesDeps, userId);
  }

  async updateUserPreferences(userId: string, prefs: UpdateUserPreferencesDto) {
    const result = await updateUserPreferencesUtil(
      this.preferencesDeps,
      userId,
      prefs as Record<string, unknown>,
    );
    this.tokenVersionCache.invalidate(userId);
    return result;
  }

  async listUsers() {
    return listUsersHelper(this.userAdminDeps);
  }

  async createUser(data: {
    username: string;
    password: string;
    role?: string;
    entityRestrictions?: string[];
  }) {
    return createUserHelper(this.userAdminDeps, data);
  }

  async updateUser(
    userId: string,
    data: { username?: string; password?: string; role?: string; entityRestrictions?: string[] },
    actorRole: string,
  ) {
    const result = await updateUserHelper(this.userAdminDeps, userId, data, actorRole);
    if (data.password || data.role || data.entityRestrictions !== undefined) {
      this.tokenVersionCache.invalidate(userId);
    }
    return result;
  }

  async deleteUser(userId: string, actorId: string) {
    const result = await deleteUserHelper(this.userAdminDeps, userId, actorId);
    this.tokenVersionCache.invalidate(userId);
    return result;
  }

  async getMfaStatus(userId: string) {
    return getMfaStatusHelper(this.mfaDeps, userId);
  }

  async startMfaSetup(userId: string) {
    return startMfaSetupHelper(this.mfaDeps, userId);
  }

  async confirmMfaSetup(userId: string, code: string) {
    return confirmMfaSetupHelper(this.mfaDeps, userId, code);
  }

  async disableMfa(userId: string, code: string) {
    return disableMfaHelper(this.mfaDeps, userId, code);
  }

  async loginWithMfa(username: string, pass: string, code: string, ip?: string, userAgent?: string) {
    return loginWithMfaHelper(this.mfaDeps, username, pass, code, ip, userAgent);
  }

  userRequiresMfa(user: { id: string; role?: string; totpEnabled?: boolean }) {
    return userRequiresMfaHelper(user);
  }
}
