/**
 * 职责：
 *  - 授权客户端：向授权商店激活、心跳续租、租约恢复与能力门禁。
 * 关键依赖：
 *  - crypto（Ed25519 验签 / X25519 加密传输 / 本地凭证加密）、key-bootstrap（公钥自举）、
 *    fingerprint.util（硬件指纹即 instanceId）。
 * 约定：
 *  - 联网租约模型：激活码 + 邮箱经加密传输换取 Ed25519 签名租约，按 heartbeatIn 续期；
 *  - 不信任可变的落盘字段，每次放行都重新验签租约；
 *  - 对外方法遇非法输入显式抛出 Error / HttpException。
 */

import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { API_ERROR } from '../../common/errors/api-error-messages';
import {
  BusinessException,
  ErrorCode,
  unauthorized,
} from '../../common/utils/business-exception';
import {
  LeaseVerifier,
  LicenseCryptoError,
  LicenseTransportCipher,
  LICENSE_PRODUCT,
  SecretCipher,
  deriveKeyId,
  parseTimestamp,
} from './crypto';
import { generateHardwareFingerprint } from './fingerprint.util';
import {
  SIGNING_PUBLIC_KEY_FILENAME,
  TRANSPORT_PUBLIC_KEY_FILENAME,
  ensureClientKeys,
  keysReady,
} from './key-bootstrap';
import {
  DEFAULT_LICENSE_SERVER_URL,
  isLicenseRequiredFromEnv,
} from './license.constants';

const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000, 60_000, 300_000];
const TERMINAL_STATES = new Set<string>([
  'DEACTIVATED',
  'REVOKED',
  'INVALID',
  'CLOCK_ROLLBACK',
  'REMOTE_REJECTED',
  'INSTANCE_CHANGED',
  'INSTANCE_MISMATCH',
  'RECOVERY_REQUIRED',
]);
const RETRYABLE_TERMINAL = new Set<string>(['RECOVERY_REQUIRED', 'REMOTE_REJECTED']);
const CLOCK_SKEW_SECONDS = 300;
const DEFAULT_HEARTBEAT_SECONDS = 300;
const MANUAL_RETRY_THROTTLE_MS = 2_000;

type LicenseStatus =
  | 'UNACTIVATED'
  | 'ACTIVE'
  | 'CONNECTION_WARNING'
  | 'STARTUP_VALIDATION_REQUIRED'
  | 'LEASE_EXPIRED'
  | 'RECOVERY_RETRY'
  | 'RECOVERY_REQUIRED'
  | 'REMOTE_REJECTED'
  | 'REVOKED'
  | 'INVALID'
  | 'INSTANCE_CHANGED'
  | 'INSTANCE_MISMATCH'
  | 'CLOCK_ROLLBACK'
  | 'DEACTIVATED';

/** 落盘授权状态（data/.internal/license-state.json）。 */
interface PersistedState {
  instanceId: string;
  licenseId: string | null;
  leaseId: string | null;
  sessionId: string | null;
  leaseSequence: number;
  signedLease: string | null;
  encryptedSessionToken: string | null;
  encryptedRecoveryToken: string | null;
  encryptedActivationCode: string | null;
  activationEmail: string | null;
  activationCodeHint: string | null;
  status: LicenseStatus;
  lastError: string | null;
  featureSet: string[];
  heartbeatIntervalSeconds: number;
  leaseIssuedAt: string | null;
  leaseExpiresAt: string | null;
  lastHeartbeatAt: string | null;
  lastVerifiedAt: string | null;
  activatedAt: string | null;
  updatedAt: string;
}

/** 授权 HTTP 客户端错误：携带 HTTP 状态码与商店返回的结构化 code。 */
class LicenseClientError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly code?: string,
    readonly revoked: boolean = false,
  ) {
    super(message);
    this.name = 'LicenseClientError';
  }

  /** 仅当授权商店确认吊销时才为真。 */
  get isConfirmedRevocation(): boolean {
    if (this.statusCode !== 401 && this.statusCode !== 403) return false;
    return this.revoked || this.code === 'REVOKED' || this.code === 'LICENSE_REVOKED';
  }

  /** 被解绑：授权仍在，重新激活即可（与吊销的下一步不同）。 */
  get requiresRebind(): boolean {
    return (
      (this.statusCode === 401 || this.statusCode === 403) &&
      this.code === 'BINDING_RELEASED'
    );
  }
}

const STATUS_LABELS: Record<string, string> = {
  UNACTIVATED: '未激活',
  ACTIVE: '正常',
  CONNECTION_WARNING: '连接异常',
  STARTUP_VALIDATION_REQUIRED: '等待启动联网验证',
  LEASE_EXPIRED: '租约已到期',
  RECOVERY_RETRY: '授权会话重试中',
  RECOVERY_REQUIRED: '授权会话需人工恢复',
  REMOTE_REJECTED: '授权后台明确拒绝',
  REVOKED: '已吊销',
  INVALID: '校验无效',
  INSTANCE_CHANGED: '安装标识已变化',
  INSTANCE_MISMATCH: '安装标识不匹配',
  CLOCK_ROLLBACK: '系统时间异常',
  DEACTIVATED: '已停用',
};

@Injectable()
/**
 * LicenseService：Nest @Injectable 服务。
 * - 职责：授权激活、心跳续租、租约恢复与能力门禁；
 * - 装配：由 LicenseModule 的 providers 数组注入；
 * - 生命周期：onModuleInit 自举公钥并启动续租循环；onModuleDestroy 停止循环。
 */
export class LicenseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LicenseService.name);
  private readonly internalDir = join(process.cwd(), 'data', '.internal');
  private readonly statePath: string;
  private readonly keysDir: string;
  private readonly secretKeyPath: string;
  private readonly serverUrl: string;
  private readonly clientVersion: string;

  private licenseRequired = false;
  private bypass = false;
  private currentFingerprint = '';
  private publicKeyFingerprint: string | null = null;

  private state!: PersistedState;
  private verifier: LeaseVerifier | null = null;
  private transport: LicenseTransportCipher | null = null;
  private cipher: SecretCipher | null = null;
  private keysReady = false;

  private timer: NodeJS.Timeout | null = null;
  private failures = 0;
  private retryAt: number | null = null;
  private manualRetryAt = 0;
  private rateLimitedUntil = 0;
  private errorCode: string | null = null;
  private startupValidationPending = false;
  private observedStatus: string | null = null;

  constructor() {
    this.statePath =
      process.env.LICENSE_STATE_FILE?.trim() || join(this.internalDir, 'license-state.json');
    this.keysDir =
      process.env.APP_CLIENT_KEYS_DIR?.trim() || join(process.cwd(), 'keys', 'client');
    this.secretKeyPath =
      process.env.APP_LICENSE_CREDENTIAL_FILE?.trim() ||
      join(this.internalDir, 'license-credentials.key');
    this.serverUrl =
      (process.env.APP_LICENSE_SERVER_URL?.trim() || DEFAULT_LICENSE_SERVER_URL).replace(/\/+$/, '');
    this.clientVersion = this.resolveClientVersion();
  }

  // ── 生命周期 ──────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    this.licenseRequired = this.resolveLicenseRequired();
    this.assertProductionBypassSafe();
    this.bypass = this.isBypassActive();
    this.currentFingerprint = this.buildFingerprint();
    this.loadState();
    await this.ensureKeys();
    this.validateSavedState();
    if (!this.licenseRequired) {
      this.logger.log('LICENSE_REQUIRED 未启用,跳过商业授权门禁.');
    } else if (this.bypass) {
      this.logger.warn('商业授权已通过 ALLOW_LICENSE_BYPASS 绕过(仅 test 环境).');
    } else if (!this.isAccessAllowed()) {
      this.logger.warn('商业授权未激活:除引导/授权接口外 API 将拒绝访问.');
    } else {
      this.logger.log('商业授权已激活.');
    }
    this.startLoop();
  }

  onModuleDestroy(): void {
    this.clearTimer();
  }

  // ── 对外查询 ──────────────────────────────────────────────

  /** 是否启用了商业授权门禁 */
  isLicenseRequired(): boolean {
    return this.licenseRequired;
  }

  /** 当前是否允许业务访问（不抛错；WS / 轮询可用） */
  isAccessAllowed(): boolean {
    if (!this.licenseRequired) return true;
    if (this.bypass) return true;
    this.refreshDerivedStatus();
    return this.verifiedAccess();
  }

  /** Guard 调用：未启用授权或已激活则放行 */
  validateAccess(): boolean {
    if (this.isAccessAllowed()) return true;
    unauthorized(API_ERROR.LICENSE_INACTIVE);
  }

  /** 激活状态对外快照（v2 字段）。 */
  getActivationStatus(): Record<string, unknown> {
    this.refreshDerivedStatus();
    const allowed = !this.licenseRequired || this.bypass || this.verifiedAccess();
    const products = this.productsFromLease();
    const status = this.effectiveStatus();
    const now = Date.now();
    return {
      required: this.licenseRequired,
      allowed,
      editorAllowed: allowed,
      status,
      statusLabel: STATUS_LABELS[status] ?? status,
      instanceId: this.currentFingerprint,
      activationCodeId: this.state.licenseId,
      leaseId: this.state.leaseId,
      leaseSequence: this.state.leaseSequence,
      edition: allowed ? 'full' : null,
      features: allowed ? this.state.featureSet : [],
      products: allowed ? products : [],
      heartbeatIn: this.state.heartbeatIntervalSeconds,
      leaseIssuedAt: this.state.leaseIssuedAt,
      leaseExpiresAt: this.state.leaseExpiresAt,
      lastHeartbeatAt: this.state.lastHeartbeatAt,
      lastVerifiedAt: this.state.lastVerifiedAt,
      lastError: this.state.lastError,
      errorCode: this.effectiveErrorCode(status),
      retryable: Boolean(this.state.licenseId && !TERMINAL_STATES.has(status)),
      canRetry: Boolean(
        this.state.licenseId &&
          (!TERMINAL_STATES.has(status) || RETRYABLE_TERMINAL.has(status)) &&
          status !== 'CLOCK_ROLLBACK',
      ),
      retrying: this.timer !== null,
      retryAttempt: this.failures,
      nextRetryAt:
        this.retryAt !== null && !TERMINAL_STATES.has(status)
          ? new Date(now + Math.max(0, this.retryAt - now)).toISOString()
          : null,
      startupValidationPending: this.startupValidationPending,
      activationCodeHint: this.state.activationCodeHint,
      activationEmail: this.state.activationEmail,
      publicKeyFingerprint: this.publicKeyFingerprint,
      rateLimitedUntil: this.rateLimitedUntil > now ? new Date(this.rateLimitedUntil).toISOString() : null,
    };
  }

  // ── 激活 / 重试 ───────────────────────────────────────────

  /** 用「购买邮箱 + 激活码」向授权商店完成激活。 */
  async activate(email: string, activationCode: string): Promise<Record<string, unknown>> {
    if (!this.licenseRequired || this.bypass) return this.getActivationStatus();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const code = String(activationCode || '').trim().toUpperCase();
    if (!normalizedEmail) {
      throw new BadRequestException('请输入购买授权时使用的邮箱。');
    }
    if (!code) {
      throw new BadRequestException('请输入激活码。');
    }
    if (!(await this.ensureKeys())) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '授权公钥尚未就绪，请确认能访问授权商店后重试。',
      );
    }
    try {
      const response = await this.post('/v2/activate', {
        activationCode: code,
        instanceId: this.currentFingerprint,
        product: LICENSE_PRODUCT,
        clientVersion: this.clientVersion,
        nonce: randomBytes(18).toString('base64url'),
        email: normalizedEmail,
      });
      this.applyLease(response, {
        activationCode: code,
        email: normalizedEmail,
        hint: code.slice(0, Math.max(0, code.length - 9)),
      });
      this.recordOnlineSuccess('激活');
      this.logger.log(`商业授权激活成功: ${this.state.activationCodeHint ?? code}`);
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.recordFailure(error);
      throw this.toBusinessException(error, '激活失败');
    }
    this.startLoop();
    return this.getActivationStatus();
  }

  /** 显式重试当前实例的授权恢复。 */
  async retryNow(): Promise<Record<string, unknown>> {
    if (!this.licenseRequired || this.bypass) return this.getActivationStatus();
    if (Date.now() < this.manualRetryAt) {
      throw new BusinessException(ErrorCode.CONFLICT, '请稍候再试。');
    }
    this.manualRetryAt = Date.now() + MANUAL_RETRY_THROTTLE_MS;
    if (!this.state.licenseId) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '当前安装尚未激活，请填写购买邮箱与激活码完成激活。',
      );
    }
    if (!(await this.ensureKeys())) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '授权公钥尚未就绪，请确认能访问授权商店后重试。',
      );
    }
    try {
      if (
        this.startupValidationPending ||
        this.leaseExpired() ||
        ['LEASE_EXPIRED', 'RECOVERY_RETRY', 'RECOVERY_REQUIRED', 'REMOTE_REJECTED'].includes(
          this.state.status,
        )
      ) {
        this.state.status = 'RECOVERY_RETRY';
        this.saveState();
        await this.recover();
      } else {
        await this.heartbeat();
      }
    } catch (error) {
      this.recordFailure(error);
      throw this.toBusinessException(error, '重试失败');
    }
    this.startLoop();
    return this.getActivationStatus();
  }

  private toBusinessException(error: unknown, prefix: string): BusinessException {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof LicenseCryptoError) {
      return new BusinessException(
        ErrorCode.VALIDATION_FAILED,
        `${prefix}：${message}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (error instanceof LicenseClientError) {
      if (error.isConfirmedRevocation || error.requiresRebind || error.statusCode === 409) {
        return new BusinessException(ErrorCode.CONFLICT, `${prefix}：${message}`, HttpStatus.CONFLICT);
      }
      if (error.statusCode === 401 || error.statusCode === 403) {
        return new BusinessException(ErrorCode.UNAUTHORIZED, `${prefix}：${message}`, HttpStatus.UNAUTHORIZED);
      }
      if (error.statusCode && error.statusCode >= 500) {
        return new BusinessException(
          ErrorCode.SERVICE_UNAVAILABLE,
          `${prefix}：${message}`,
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      return new BusinessException(
        ErrorCode.VALIDATION_FAILED,
        `${prefix}：${message}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return new BusinessException(
      ErrorCode.EXTERNAL_ERROR,
      `${prefix}：${message}`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  // ── 心跳 / 恢复 / 循环 ────────────────────────────────────

  private startLoop(): void {
    this.clearTimer();
    if (!this.licenseRequired || this.bypass) return;
    if (!this.serverUrl) return;
    if (!this.state.licenseId || TERMINAL_STATES.has(this.state.status)) return;
    const immediate = this.startupValidationPending;
    this.schedule(immediate ? 0 : this.successDelayMs());
  }

  private schedule(delayMs: number): void {
    this.clearTimer();
    const wait = Math.max(0, delayMs);
    this.retryAt = Date.now() + wait;
    this.timer = setTimeout(() => {
      void this.tick();
    }, wait);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    this.timer = null;
    this.retryAt = null;
    if (!this.licenseRequired || this.bypass) return;
    if (!this.state.licenseId || TERMINAL_STATES.has(this.state.status)) return;
    if (this.rateLimitedUntil > Date.now()) {
      this.schedule(RETRY_DELAYS_MS[0]);
      return;
    }
    if (!this.keysReady) {
      const ok = await this.ensureKeys();
      if (!ok) {
        this.failures += 1;
        this.schedule(this.failureDelayMs());
        return;
      }
    }
    this.refreshDerivedStatus();
    try {
      const recover =
        this.startupValidationPending ||
        this.leaseExpired() ||
        ['LEASE_EXPIRED', 'RECOVERY_RETRY'].includes(this.state.status);
      if (recover) {
        this.state.status = 'RECOVERY_RETRY';
        this.saveState();
        await this.recover();
      } else {
        await this.heartbeat();
      }
      this.recordOnlineSuccess(recover ? '租约恢复' : '心跳');
      this.schedule(this.successDelayMs());
    } catch (error) {
      if (error instanceof LicenseClientError && error.statusCode === 429) {
        this.rateLimitedUntil = Date.now() + 120_000;
      }
      if (TERMINAL_STATES.has(this.state.status)) return;
      this.failures += 1;
      this.schedule(this.failureDelayMs());
    }
  }

  /** 心跳续租；401 时立即转租约恢复。 */
  private async heartbeat(): Promise<void> {
    if (!this.state.encryptedSessionToken) {
      return this.recover();
    }
    let sessionToken: string;
    try {
      sessionToken = this.requireCipher().decrypt(this.state.encryptedSessionToken);
    } catch {
      return this.recover();
    }
    try {
      const response = await this.post('/v2/heartbeat', {
        sessionToken,
        instanceId: this.currentFingerprint,
        leaseSequence: this.state.leaseSequence,
        clientVersion: this.clientVersion,
        nonce: randomBytes(18).toString('base64url'),
      });
      this.applyLease(response, {});
    } catch (error) {
      if (
        error instanceof LicenseClientError &&
        error.statusCode === 401 &&
        !error.isConfirmedRevocation &&
        !error.requiresRebind
      ) {
        return this.recover();
      }
      this.classifyFailure(error);
      throw error;
    }
  }

  /** 租约恢复（recoveryToken 换新会话）。 */
  private async recover(): Promise<void> {
    if (!this.state.encryptedRecoveryToken) {
      this.markFailure('没有可用的租约恢复凭证，请重新激活。', 'CREDENTIAL_MISSING');
      throw new LicenseClientError('没有可用的租约恢复凭证，请重新激活。', undefined, 'CREDENTIAL_MISSING');
    }
    let recoveryToken: string;
    try {
      recoveryToken = this.requireCipher().decrypt(this.state.encryptedRecoveryToken);
    } catch {
      this.markFailure('本机保存的租约恢复凭证无法解密，请重新激活。', 'CREDENTIAL_INVALID');
      throw new LicenseClientError('本机保存的租约恢复凭证无法解密，请重新激活。');
    }
    try {
      const response = await this.post('/v2/recover', {
        recoveryToken,
        instanceId: this.currentFingerprint,
        leaseSequence: this.state.leaseSequence,
        clientVersion: this.clientVersion,
        nonce: randomBytes(18).toString('base64url'),
      });
      this.applyLease(response, {});
    } catch (error) {
      this.classifyFailure(error);
      throw error;
    }
  }

  private classifyFailure(error: unknown): void {
    if (error instanceof LicenseClientError) {
      if (error.requiresRebind) {
        this.markStatus('INSTANCE_CHANGED', '该授权已在商店解除设备绑定，请重新激活授权。', 'INSTANCE_CHANGED');
        return;
      }
      if (error.isConfirmedRevocation) {
        this.markStatus('REVOKED', error.message, 'LICENSE_REVOKED');
        return;
      }
      if (error.statusCode === 401) {
        this.markStatus('RECOVERY_RETRY', error.message, 'RECOVERY_TOKEN_INVALID');
        return;
      }
      if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500 && ![408, 429].includes(error.statusCode)) {
        this.markStatus('REMOTE_REJECTED', error.message, 'LICENSE_REMOTE_REJECTED');
        return;
      }
    }
    this.markFailure(error instanceof Error ? error.message : String(error));
  }

  /** 网络类失败：租约仍有效则仅告警，否则标记到期。 */
  private markFailure(message: string, code?: string): void {
    let status: LicenseStatus = 'LEASE_EXPIRED';
    if (!this.leaseExpired()) status = 'CONNECTION_WARNING';
    if (['RECOVERY_RETRY', 'RECOVERY_REQUIRED', 'REMOTE_REJECTED'].includes(this.state.status)) {
      status = this.state.status as LicenseStatus;
    }
    this.markStatus(status, message, code ?? 'NETWORK_UNAVAILABLE');
  }

  private markStatus(status: LicenseStatus, message: string, code: string | null): void {
    this.state.status = status;
    this.state.lastError = message.slice(0, 1000);
    this.errorCode = code;
    this.startupValidationPending = false;
    if (TERMINAL_STATES.has(status)) this.clearTimer();
    this.saveState();
    this.recordStatus(status);
  }

  // ── HTTP ─────────────────────────────────────────────────

  private async post(path: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const transport = this.requireTransport();
    const { envelope, key } = transport.encryptRequest(payload, path);
    let response: Response;
    try {
      response = await fetch(`${this.serverUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(envelope),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new LicenseClientError('无法连接授权服务器。', undefined, 'NETWORK_UNAVAILABLE');
    }
    if (!response.ok) {
      let detail = '授权服务器拒绝请求。';
      let code: string | undefined;
      let revoked = false;
      try {
        const body = (await response.json()) as Record<string, unknown>;
        if (typeof body.detail === 'string' && body.detail) detail = body.detail;
        if (typeof body.code === 'string' && body.code) code = body.code;
        if (body.revoked === true) revoked = true;
      } catch {
        /* 保留默认文案 */
      }
      if (response.status >= 500) {
        throw new LicenseClientError(detail, response.status, 'LICENSE_SERVER_UNAVAILABLE', revoked);
      }
      if (response.status === 429) {
        throw new LicenseClientError(detail, response.status, 'LICENSE_RATE_LIMITED', revoked);
      }
      throw new LicenseClientError(detail, response.status, code, revoked);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new LicenseClientError('授权服务器响应格式无效。');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new LicenseClientError('授权服务器响应格式无效。');
    }
    return transport.decryptResponse(body as Record<string, unknown>, path, key);
  }

  // ── 租约应用与校验 ────────────────────────────────────────

  private applyLease(
    response: Record<string, unknown>,
    meta: { activationCode?: string; email?: string; hint?: string },
  ): void {
    const signedLease = typeof response.signedLease === 'string' ? response.signedLease : '';
    if (!signedLease) {
      this.markStatus('INVALID', '授权服务器未返回签名租约。', 'INVALID');
      throw new LicenseClientError('授权服务器未返回签名租约。');
    }
    let payload: Record<string, unknown>;
    try {
      payload = this.verifyLease(signedLease);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('当前实例')) {
        this.markStatus('INSTANCE_MISMATCH', message, 'INSTANCE_MISMATCH');
      } else {
        this.markStatus('INVALID', message, 'CREDENTIAL_INVALID');
      }
      throw error;
    }
    const now = new Date();
    const expiresAt = parseTimestamp(payload.expiresAt);
    const issuedAt = parseTimestamp(payload.issuedAt);
    if (issuedAt.getTime() > now.getTime() + CLOCK_SKEW_SECONDS * 1000) {
      this.markStatus('CLOCK_ROLLBACK', '授权服务器时间明显晚于本机时间，请先校准系统时间。', 'CLOCK_INVALID');
      throw new LicenseClientError('授权服务器时间明显晚于本机时间，请先校准系统时间。');
    }
    if (expiresAt.getTime() <= now.getTime()) {
      this.markStatus('INVALID', '授权服务器返回了已到期租约。', 'CREDENTIAL_INVALID');
      throw new LicenseClientError('授权服务器返回了已到期租约。');
    }
    if (
      payload.activationCodeId === this.state.licenseId &&
      Number(payload.leaseSequence) <= this.state.leaseSequence &&
      this.state.signedLease !== signedLease
    ) {
      this.markStatus('INVALID', '授权服务器返回了未递增的租约序号。', 'CREDENTIAL_INVALID');
      throw new LicenseClientError('授权服务器返回了未递增的租约序号。');
    }
    const rawFeatures = payload.features;
    const features = Array.isArray(rawFeatures)
      ? rawFeatures.filter((item): item is string => typeof item === 'string')
      : [];
    if (!Array.isArray(rawFeatures) || features.length !== rawFeatures.length) {
      this.markStatus('INVALID', '授权服务器返回的权益列表无效。', 'CREDENTIAL_INVALID');
      throw new LicenseClientError('授权服务器返回的权益列表无效。');
    }

    this.state.licenseId = String(payload.activationCodeId);
    this.state.leaseId = String(payload.leaseId);
    this.state.sessionId = String(payload.sessionId);
    this.state.leaseSequence = Number(payload.leaseSequence);
    this.state.signedLease = signedLease;
    this.state.status = 'ACTIVE';
    this.state.leaseIssuedAt = issuedAt.toISOString();
    this.state.leaseExpiresAt = expiresAt.toISOString();
    this.state.lastHeartbeatAt = now.toISOString();
    this.state.lastVerifiedAt = now.toISOString();
    this.state.lastError = null;
    this.state.featureSet = features;
    this.state.heartbeatIntervalSeconds = Math.max(
      30,
      Number.isFinite(Number(response.heartbeatIn)) ? Number(response.heartbeatIn) : DEFAULT_HEARTBEAT_SECONDS,
    );
    if (meta.activationCode) {
      this.state.encryptedActivationCode = this.requireCipher().encrypt(meta.activationCode);
      this.state.activationCodeHint = meta.hint ?? null;
    }
    if (meta.email) this.state.activationEmail = meta.email;
    if (typeof response.sessionToken === 'string' && response.sessionToken) {
      this.state.encryptedSessionToken = this.requireCipher().encrypt(response.sessionToken);
    }
    if (typeof response.recoveryToken === 'string' && response.recoveryToken) {
      this.state.encryptedRecoveryToken = this.requireCipher().encrypt(response.recoveryToken);
    }
    if (!this.state.activatedAt) this.state.activatedAt = now.toISOString();
    this.startupValidationPending = false;
    this.failures = 0;
    this.errorCode = null;
    this.saveState();
    this.recordStatus('ACTIVE');
  }

  private verifyLease(signedLease: string): Record<string, unknown> {
    const verifier = this.verifier;
    if (!verifier) throw new LicenseCryptoError('授权公钥尚未就绪。');
    return verifier.verify(signedLease, this.currentFingerprint);
  }

  /** 重新验签签名租约，而不是信任可变的落盘状态字段。 */
  private verifiedAccess(feature?: string): boolean {
    if (!this.licenseRequired || this.bypass) return true;
    if (this.state.status !== 'ACTIVE' && this.state.status !== 'CONNECTION_WARNING') return false;
    if (!(this.state.signedLease && this.state.licenseId && this.state.leaseId && this.state.sessionId)) {
      return false;
    }
    let payload: Record<string, unknown>;
    try {
      payload = this.verifyLease(this.state.signedLease);
    } catch {
      return false;
    }
    const now = new Date();
    const issuedAt = parseTimestamp(payload.issuedAt);
    const expiresAt = parseTimestamp(payload.expiresAt);
    const lastVerified = this.state.lastVerifiedAt ? new Date(this.state.lastVerifiedAt) : null;
    if (lastVerified && now.getTime() + CLOCK_SKEW_SECONDS * 1000 < lastVerified.getTime()) return false;
    if (issuedAt.getTime() > now.getTime() + CLOCK_SKEW_SECONDS * 1000) return false;
    if (expiresAt.getTime() <= now.getTime()) return false;
    if (payload.activationCodeId !== this.state.licenseId) return false;
    if (payload.leaseId !== this.state.leaseId || payload.sessionId !== this.state.sessionId) return false;
    if (Number(payload.leaseSequence) !== this.state.leaseSequence) return false;
    if (!Array.isArray(payload.features) || !payload.features.every((item) => typeof item === 'string')) {
      return false;
    }
    if (feature === undefined) return true;
    const features = payload.features as string[];
    if (features.includes('all')) return true;
    const entitlements = payload.entitlements;
    if (Array.isArray(entitlements)) {
      const active = new Set<string>();
      for (const entitlement of entitlements) {
        if (!entitlement || typeof entitlement !== 'object') continue;
        const entry = entitlement as Record<string, unknown>;
        if (typeof entry.code !== 'string') continue;
        const expiresAtRaw = entry.expiresAt;
        try {
          if (expiresAtRaw && parseTimestamp(expiresAtRaw).getTime() <= now.getTime()) continue;
        } catch {
          continue;
        }
        active.add(entry.code);
      }
      return active.has(feature);
    }
    return features.includes(feature);
  }

  // ── 状态派生 ─────────────────────────────────────────────

  private refreshDerivedStatus(): void {
    if (!this.state.licenseId) return;
    if (!this.licenseRequired || this.bypass) return;
    if (this.state.status === 'UNACTIVATED') return;
    if (TERMINAL_STATES.has(this.state.status) && this.state.status !== 'RECOVERY_REQUIRED') return;
    const lastVerified = this.state.lastVerifiedAt ? new Date(this.state.lastVerifiedAt) : null;
    const now = Date.now();
    if (lastVerified && now + CLOCK_SKEW_SECONDS * 1000 < lastVerified.getTime()) {
      this.state.status = 'CLOCK_ROLLBACK';
      this.state.lastError = '检测到系统时间回拨，请校准系统时间后重新验证授权。';
      return;
    }
    if (
      this.state.signedLease &&
      ['ACTIVE', 'CONNECTION_WARNING', 'STARTUP_VALIDATION_REQUIRED'].includes(this.state.status) &&
      this.leaseExpired()
    ) {
      this.state.status = 'LEASE_EXPIRED';
      if (!this.state.lastError) this.state.lastError = '授权租约已到期。';
      return;
    }
    if (
      this.licenseRequired &&
      this.startupValidationPending &&
      ['ACTIVE', 'CONNECTION_WARNING'].includes(this.state.status)
    ) {
      this.state.status = 'STARTUP_VALIDATION_REQUIRED';
      this.state.lastError =
        this.state.lastError || '服务重启后正在等待授权后台确认最新租约。';
    }
  }

  private effectiveStatus(): LicenseStatus {
    if (!this.licenseRequired || this.bypass) return 'ACTIVE';
    if (this.state.status === 'ACTIVE' && !this.verifiedAccess()) return 'INVALID';
    return this.state.status;
  }

  private effectiveErrorCode(status: string): string | null {
    if (this.errorCode) return this.errorCode;
    return (
      {
        RECOVERY_RETRY: 'RECOVERY_TOKEN_INVALID',
        RECOVERY_REQUIRED: 'LICENSE_REMOTE_REJECTED',
        REMOTE_REJECTED: 'LICENSE_REMOTE_REJECTED',
        REVOKED: 'LICENSE_REVOKED',
        INVALID: 'CREDENTIAL_INVALID',
        CLOCK_ROLLBACK: 'CLOCK_INVALID',
        INSTANCE_CHANGED: 'INSTANCE_CHANGED',
        INSTANCE_MISMATCH: 'INSTANCE_MISMATCH',
        LEASE_EXPIRED: 'LEASE_EXPIRED',
      } as Record<string, string>
    )[status] ?? null;
  }

  private leaseExpired(): boolean {
    if (!this.state.leaseExpiresAt) return false;
    return Date.parse(this.state.leaseExpiresAt) <= Date.now();
  }

  private productsFromLease(): Array<{ name: string; type: string; expiresAt: string | null }> {
    if (!this.state.signedLease) return [];
    let payload: Record<string, unknown>;
    try {
      payload = this.verifyLease(this.state.signedLease);
    } catch {
      return [];
    }
    const raw = payload.products;
    if (!Array.isArray(raw)) return [];
    const products: Array<{ name: string; type: string; expiresAt: string | null }> = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      if (typeof entry.name !== 'string' || !entry.name.trim()) continue;
      products.push({
        name: entry.name.trim(),
        type: typeof entry.type === 'string' ? entry.type : 'module',
        expiresAt: typeof entry.expiresAt === 'string' ? entry.expiresAt : null,
      });
    }
    return products;
  }

  private successDelayMs(): number {
    const interval = Math.max(30, this.state.heartbeatIntervalSeconds) * 1000;
    if (!this.state.leaseExpiresAt) return interval;
    const remaining = Date.parse(this.state.leaseExpiresAt) - Date.now();
    return Math.max(0, Math.min(interval, remaining));
  }

  private failureDelayMs(): number {
    return RETRY_DELAYS_MS[Math.min(this.failures, RETRY_DELAYS_MS.length - 1)];
  }

  // ── 状态存取 ─────────────────────────────────────────────

  private emptyState(): PersistedState {
    return {
      instanceId: this.currentFingerprint,
      licenseId: null,
      leaseId: null,
      sessionId: null,
      leaseSequence: 0,
      signedLease: null,
      encryptedSessionToken: null,
      encryptedRecoveryToken: null,
      encryptedActivationCode: null,
      activationEmail: null,
      activationCodeHint: null,
      status: 'UNACTIVATED',
      lastError: null,
      featureSet: [],
      heartbeatIntervalSeconds: DEFAULT_HEARTBEAT_SECONDS,
      leaseIssuedAt: null,
      leaseExpiresAt: null,
      lastHeartbeatAt: null,
      lastVerifiedAt: null,
      activatedAt: null,
      updatedAt: new Date().toISOString(),
    };
  }

  private loadState(): void {
    const empty = this.emptyState();
    let loaded: Partial<PersistedState> = {};
    if (existsSync(this.statePath)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(this.statePath, 'utf8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          loaded = parsed as Partial<PersistedState>;
        }
      } catch {
        this.logger.warn(`授权状态文件无法解析,将重新初始化:${this.statePath}`);
      }
    }
    this.state = { ...empty, ...loaded };
    this.state.featureSet = Array.isArray(this.state.featureSet) ? this.state.featureSet : [];
    if (this.state.instanceId !== this.currentFingerprint) {
      const hadLicense = Boolean(this.state.licenseId);
      this.state = { ...empty };
      this.state.status = hadLicense ? 'INSTANCE_CHANGED' : 'UNACTIVATED';
      this.state.lastError = hadLicense ? '本机安装标识已变化，需要重新激活授权。' : null;
      this.errorCode = hadLicense ? 'INSTANCE_CHANGED' : null;
      this.saveState();
      this.recordStatus(this.state.status, this.state.lastError ?? undefined);
    }
  }

  private saveState(): void {
    this.state.updatedAt = new Date().toISOString();
    try {
      mkdirSync(dirname(this.statePath), { recursive: true, mode: 0o700 });
      const temporary = `${this.statePath}.tmp`;
      writeFileSync(temporary, JSON.stringify(this.state, null, 2), { encoding: 'utf8', mode: 0o600 });
      renameSync(temporary, this.statePath);
    } catch (error) {
      this.logger.error(
        `授权状态写入失败:${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private validateSavedState(): void {
    if (!this.state.signedLease || ['UNACTIVATED', ...TERMINAL_STATES].includes(this.state.status)) {
      return;
    }
    try {
      const payload = this.verifyLease(this.state.signedLease);
      if (
        Number(payload.leaseSequence) !== this.state.leaseSequence ||
        payload.activationCodeId !== this.state.licenseId ||
        payload.leaseId !== this.state.leaseId ||
        payload.sessionId !== this.state.sessionId
      ) {
        throw new LicenseCryptoError('本地授权会话与签名租约不一致。');
      }
      const expiresAt = parseTimestamp(payload.expiresAt);
      const issuedAt = parseTimestamp(payload.issuedAt);
      const now = new Date();
      const lastVerified = this.state.lastVerifiedAt ? new Date(this.state.lastVerifiedAt) : null;
      if (
        (lastVerified && now.getTime() + CLOCK_SKEW_SECONDS * 1000 < lastVerified.getTime()) ||
        issuedAt.getTime() > now.getTime() + CLOCK_SKEW_SECONDS * 1000
      ) {
        this.state.status = 'CLOCK_ROLLBACK';
        this.state.lastError = '检测到系统时间回拨，请校准系统时间后重新验证授权。';
      } else {
        if (this.state.status !== 'RECOVERY_RETRY') {
          this.state.status = expiresAt.getTime() > now.getTime() ? 'ACTIVE' : 'LEASE_EXPIRED';
        }
        this.state.lastVerifiedAt = now.toISOString();
        this.state.lastError = null;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('当前实例')) {
        this.state.status = 'INSTANCE_CHANGED';
        this.state.lastError = '本机安装标识已变化，需要重新激活授权。';
      } else {
        this.state.status = 'INVALID';
        this.state.lastError = message;
      }
    }
    this.saveState();
    this.recordStatus(this.state.status);
    this.startupValidationPending =
      this.licenseRequired &&
      Boolean(this.state.licenseId) &&
      Boolean(this.state.signedLease) &&
      !TERMINAL_STATES.has(this.state.status);
  }

  // ── 公钥 / 密码学装配 ────────────────────────────────────

  private async ensureKeys(): Promise<boolean> {
    if (this.bypass) return true;
    try {
      await ensureClientKeys(this.keysDir, {
        licenseServerUrl: this.serverUrl,
        log: (message) => this.logger.log(message),
      });
    } catch (error) {
      this.logger.error(
        `授权公钥未就绪:${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.keysReady = keysReady(this.keysDir);
    if (this.keysReady) {
      try {
        this.buildCrypto();
      } catch (error) {
        this.keysReady = false;
        this.logger.error(
          `授权公钥装配失败:${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return this.keysReady;
  }

  private buildCrypto(): void {
    const signingPath = join(this.keysDir, SIGNING_PUBLIC_KEY_FILENAME);
    const transportPath = join(this.keysDir, TRANSPORT_PUBLIC_KEY_FILENAME);
    const signingKeyId = (process.env.APP_LICENSE_KEY_ID ?? '').trim() || deriveKeyId(signingPath);
    const transportKeyId =
      (process.env.APP_LICENSE_TRANSPORT_KEY_ID ?? '').trim() || deriveKeyId(transportPath);
    const signingSha = (process.env.APP_LICENSE_PUBLIC_KEY_SHA256 ?? '').trim() || null;
    const transportSha =
      (process.env.APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256 ?? '').trim() ||
      createHash('sha256').update(readFileSync(transportPath)).digest('hex');
    this.verifier = new LeaseVerifier(
      new Map([[signingKeyId, { path: signingPath, sha256: signingSha }]]),
      LICENSE_PRODUCT,
    );
    this.transport = new LicenseTransportCipher(transportPath, transportKeyId, transportSha);
    this.cipher = new SecretCipher(this.secretKeyPath);
    this.publicKeyFingerprint =
      createHash('sha256').update(readFileSync(signingPath)).digest('hex').slice(0, 16);
  }

  private requireTransport(): LicenseTransportCipher {
    if (!this.transport) throw new LicenseClientError('授权公钥尚未就绪。', undefined, 'KEYS_MISSING');
    return this.transport;
  }

  private requireCipher(): SecretCipher {
    if (!this.cipher) throw new LicenseClientError('授权凭证密钥尚未就绪。', undefined, 'KEYS_MISSING');
    return this.cipher;
  }

  // ── 指纹 / 门禁开关 ───────────────────────────────────────

  private buildFingerprint(): string {
    const bypass = this.isBypassActive() ? 'HOMEOS_BYPASS_DEVICE' : null;
    return generateHardwareFingerprint({
      internalDir: this.internalDir,
      bypassFingerprint: bypass,
    });
  }

  private resolveLicenseRequired(): boolean {
    return isLicenseRequiredFromEnv();
  }

  private resolveClientVersion(): string {
    const envVersion = (process.env.APP_VERSION ?? '').trim();
    if (envVersion) return envVersion;
    try {
      const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
        version?: unknown;
      };
      if (typeof pkg.version === 'string' && pkg.version.trim()) return pkg.version.trim();
    } catch {
      /* 忽略：回退到 homeos */
    }
    return 'homeos';
  }

  /** bypass 是否生效：仅 test 环境且 ALLOW_LICENSE_BYPASS=true 时为真。 */
  private isBypassActive(): boolean {
    if (process.env.NODE_ENV !== 'test') return false;
    return process.env.ALLOW_LICENSE_BYPASS?.trim() === 'true';
  }

  /** 启动期断言：production 下检测到任何 bypass 变量即拒绝启动。 */
  private assertProductionBypassSafe(): void {
    if (process.env.NODE_ENV === 'production') {
      if (
        process.env.ALLOW_LICENSE_BYPASS?.trim() === 'true' ||
        process.env.HOMEOS_LICENSE_BYPASS?.trim()
      ) {
        throw new BusinessException(
          ErrorCode.CONFIG_ERROR,
          API_ERROR.LICENSE_BYPASS_FORBIDDEN_IN_PRODUCTION,
        );
      }
    }
  }

  private recordOnlineSuccess(operation: string): void {
    this.rateLimitedUntil = 0;
    this.failures = 0;
    if (operation === '激活') this.logger.log('授权在线激活成功。');
  }

  private recordFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`授权操作失败:${message}`);
  }

  private recordStatus(status: string, reason?: string): void {
    if (this.observedStatus === status) return;
    const previous = this.observedStatus;
    this.observedStatus = status;
    const label = STATUS_LABELS[status] ?? status;
    const text =
      previous === null
        ? `授权状态：${label}`
        : `授权状态变化：${STATUS_LABELS[previous] ?? previous} → ${label}`;
    this.logger.log(reason ? `${text}；原因：${reason}` : text);
  }
}
