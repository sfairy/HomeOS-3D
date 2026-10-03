/**
 * 所属模块：backend/modules/license
 * 职责：
 *  - 许可证服务（RSA 验签+指纹绑定+缓存）；
 * 关键依赖：
 *  - shared/redis、shared/prisma；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { getErrorMessage } from '../../common/utils';
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { verify, type JwtPayload } from 'jsonwebtoken';
import { API_ERROR } from '../../common/errors/api-error-messages';
import {
  BusinessException,
  ErrorCode,
  unauthorized,
} from '../../common/utils/business-exception';
import {
  DEFAULT_LICENSE_PUBLIC_KEY,
  LICENSE_ISSUER,
  isLicenseRequiredFromEnv,
} from './license.constants';
import { generateHardwareFingerprint } from './fingerprint.util';
import {
  getLicenseJwtPath,
} from '../../common/platform/project-paths.util';

/** 计算公钥指纹（sha256 前 16 位 hex），用于与签发服务对照而非泄露密钥本体 */
function publicKeyFingerprint(pem: string): string {
  const norm = String(pem).replace(/\r\n/g, '\n').trim();
  return createHash('sha256').update(norm).digest('hex').slice(0, 16);
}

/**
 * 剥除 JWT 外网粘贴时常见的隐形噪声后再验签：
 * 空白、零宽空格(U+200B)、零宽非连接符(U+200C)、零宽连接符(U+200D)、字节顺序标记 BOM(U+FEFF)。
 */
function stripLicenseTokenNoise(token: string): string {
  return String(token || '')
    .replace(/(?:\s|\u200b|\u200c|\u200d|\uFEFF)+/g, '')
    .trim();
}

/** 许可证 JWT 自定义声明（在标准 JwtPayload 基础上扩展） */
type LicenseJwtClaims = JwtPayload & {
  key?: string;
  hwid?: string;
  expiresAt?: number | null;
  jti?: string;
  orderId?: string;
};

@Injectable()
/**
 * LicenseService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class LicenseService
 */
export class LicenseService implements OnModuleInit {
  private readonly logger = new Logger(LicenseService.name);
  private readonly jwtPath = getLicenseJwtPath();
  private readonly internalDir = join(process.cwd(), 'data', '.internal');

  private isActivated = false;
  private currentFingerprint = '';
  private currentKey: string | null = null;
  private licenseRequired = false;
  private publicKey = DEFAULT_LICENSE_PUBLIC_KEY;
  private publicKeyFp = publicKeyFingerprint(DEFAULT_LICENSE_PUBLIC_KEY);
  /** 内存中的到期时间；null=永久；undefined=未加载 */
  private expiresAtMs: number | null | undefined = undefined;
  private lastFsRecheckAt = 0;
  private static readonly FS_RECHECK_MS = 60_000;

  /** 模块初始化：解析门禁开关、公钥、硬件指纹并尝试激活 */
  onModuleInit() {
    this.licenseRequired = this.resolveLicenseRequired();
    this.assertProductionBypassSafe();
    this.publicKey = this.resolvePublicKey();
    this.publicKeyFp = publicKeyFingerprint(this.publicKey);
    this.currentFingerprint = this.buildFingerprint();
    this.logger.log(`商业授权验签公钥指纹: ${this.publicKeyFp}(须与 HomeOS-Activate /health 一致)`);
    try {
      this.ensureLicenseStoreReady();
    } catch (e) {
      this.logger.warn(
        `授权目录初始化跳过: ${e instanceof Error ? e.message : e}`,
      );
    }
    this.checkActivation();
    if (this.licenseRequired && !this.isActivated) {
      this.logger.warn('商业授权未激活:除引导/授权接口外 API 将拒绝访问.');
    } else if (!this.licenseRequired) {
      this.logger.log('LICENSE_REQUIRED 未启用,跳过商业授权门禁.');
    } else {
      this.logger.log('商业授权已激活.');
    }
  }

  /** 是否启用了商业授权门禁 */
  isLicenseRequired(): boolean {
    return this.licenseRequired;
  }

  /**
   * 激活状态对外快照：含 isActivated / licenseRequired / hwid /
   * publicKeyFingerprint / key / expiresAt，供诊断页与签发服务对照。
   */
  getActivationStatus() {
    // publicKeyFingerprint 可公开，用于与签发服务对照（非密钥本体）
    // key 为签发编号（如 HOMEOS-XXXXXXXX），不是 JWT 本体；同接口已公开 hwid，诊断页需展示编号
    return {
      isActivated: this.licenseRequired ? this.isActivated : true,
      licenseRequired: this.licenseRequired,
      hwid: this.currentFingerprint,
      publicKeyFingerprint: this.publicKeyFp,
      key: this.isActivated ? this.currentKey : null,
      expiresAt: this.isActivated
        ? this.expiresAtMs === undefined
          ? null
          : this.expiresAtMs
        : null,
    };
  }

  /** 当前是否允许业务访问（不抛错；WS / 轮询可用） */
  isAccessAllowed(): boolean {
    if (!this.licenseRequired) return true;
    this.refreshActivationIfNeeded();
    return this.isActivated;
  }

  /** Guard 调用：未启用授权或已激活则放行 */
  validateAccess(): boolean {
    if (this.isAccessAllowed()) return true;
    unauthorized(API_ERROR.LICENSE_INACTIVE);
  }

  /**
   * 激活许可证：剥除粘贴噪声 → RS256 验签 → 校验 HWID/过期 → 写入 license.jwt。
   * 写入前 ensureLicenseStoreReady 确保目录可写；非法签名返回 publicKeyFp 供对照。
   */
  activate(token: string): {
    success: true;
    message: string;
    key: string | null;
    expiresAt: number | null;
  } {
    const trimmed = stripLicenseTokenNoise(token);
    if (!trimmed) {
      throw new BadRequestException('请提供许可证 JWT');
    }
    try {
      const decoded = verify(trimmed, this.publicKey, {
        algorithms: ['RS256'],
        issuer: LICENSE_ISSUER,
      }) as LicenseJwtClaims;

      if (!decoded.hwid || decoded.hwid !== this.currentFingerprint) {
        throw new BadRequestException('许可证与当前设备不匹配（HWID）');
      }
      if (decoded.expiresAt != null && Date.now() > Number(decoded.expiresAt)) {
        throw new BadRequestException('许可证已过期');
      }

      this.ensureLicenseStoreReady();
      writeFileSync(this.jwtPath, trimmed, { encoding: 'utf8', mode: 0o600 });

      this.isActivated = true;
      this.currentKey = decoded.key ?? null;
      this.expiresAtMs =
        decoded.expiresAt == null ? null : Number(decoded.expiresAt);
      this.lastFsRecheckAt = Date.now();
      this.logger.log(`商业授权已写入并激活:${this.jwtPath}`);
      return {
        success: true,
        message: '激活成功',
        key: this.currentKey,
        expiresAt: this.expiresAtMs,
      };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      const msg = getErrorMessage(e);
      this.logger.warn(`激活失败: ${msg}`);
      if (/invalid signature/i.test(msg)) {
        throw new BadRequestException(
          `许可证无效: invalid signature（HomeOS 验签公钥指纹 ${this.publicKeyFp}；请打开签发服务 /health 核对 publicKeyFingerprint 必须相同，不同则 NAS 上 keys/ 不是配对私钥）`,
        );
      }
      throw new BadRequestException(`许可证无效: ${msg}`);
    }
  }

  /**
   * 确保 LICENSE_DIR 为可写目录。
   * 若路径被误写成普通文件（旧逻辑/手工粘贴），则改名为目录并抢救内容到 license.jwt。
   */
  private ensureLicenseStoreReady(): void {
    const dir = dirname(this.jwtPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o755 });
      return;
    }
    const st = statSync(dir);
    if (st.isDirectory()) return;
    if (!st.isFile()) {
      throw new BadRequestException(`LICENSE_DIR 路径非法（非目录）: ${dir}`);
    }
    const salvage = `${dir}.misplaced`;
    renameSync(dir, salvage);
    mkdirSync(dir, { recursive: true, mode: 0o755 });
    if (!existsSync(this.jwtPath)) {
      renameSync(salvage, this.jwtPath);
      this.logger.warn(`LICENSE_DIR 曾是文件,已迁移为 ${this.jwtPath}`);
    } else {
      this.logger.warn(`LICENSE_DIR 曾是文件,已移至 ${salvage}`);
    }
  }

  /**
   * 检查激活状态：bypass 优先 → license.jwt 不存在则未激活 →
   * 验签 + HWID 匹配 + 未过期则激活。HWID 不匹配时按门禁是否启用决定日志级别。
   */
  checkActivation(): boolean {
    if (this.isBypassActive()) {
      this.isActivated = true;
      this.currentKey = 'HOMEOS-BYPASS';
      this.expiresAtMs = null;
      this.lastFsRecheckAt = Date.now();
      this.logger.warn('商业授权已通过 ALLOW_LICENSE_BYPASS 绕过(仅 test 环境).');
      return true;
    }
    if (!existsSync(this.jwtPath)) {
      this.isActivated = false;
      this.currentKey = null;
      this.expiresAtMs = undefined;
      return false;
    }
    try {
      const token = stripLicenseTokenNoise(readFileSync(this.jwtPath, 'utf8'));
      const decoded = verify(token, this.publicKey, {
        algorithms: ['RS256'],
        issuer: LICENSE_ISSUER,
      }) as LicenseJwtClaims;
      if (!decoded.hwid || decoded.hwid !== this.currentFingerprint) {
        // 门禁关闭时仅作诊断，避免 ERROR +「跳过门禁」并排造成「授权坏了」的误导
        if (this.licenseRequired) {
          this.logger.error('许可证 HWID 与当前设备不匹配.');
        } else {
          this.logger.debug('许可证 HWID 与当前设备不匹配(门禁未启用,忽略).');
        }
        this.isActivated = false;
        this.currentKey = null;
        this.expiresAtMs = undefined;
        return false;
      }
      if (decoded.expiresAt != null && Date.now() > Number(decoded.expiresAt)) {
        this.logger.warn('许可证已过期.');
        this.isActivated = false;
        this.currentKey = null;
        this.expiresAtMs = Number(decoded.expiresAt);
        return false;
      }
      this.isActivated = true;
      this.currentKey = decoded.key ?? null;
      this.expiresAtMs =
        decoded.expiresAt == null ? null : Number(decoded.expiresAt);
      this.lastFsRecheckAt = Date.now();
      return true;
    } catch (e) {
      this.logger.error(`许可证校验失败: ${e instanceof Error ? e.message : e}`);
      this.isActivated = false;
      this.currentKey = null;
      this.expiresAtMs = undefined;
      return false;
    }
  }

  /** 到期立即失效；文件删除约每分钟复核一次 */
  private refreshActivationIfNeeded(): void {
    if (!this.isActivated) return;
    if (this.expiresAtMs != null && Date.now() > this.expiresAtMs) {
      this.logger.warn('许可证已在运行期过期.');
      this.isActivated = false;
      this.currentKey = null;
      return;
    }
    const now = Date.now();
    if (now - this.lastFsRecheckAt < LicenseService.FS_RECHECK_MS) return;
    this.lastFsRecheckAt = now;
    if (!existsSync(this.jwtPath) && !this.isBypassActive()) {
      this.logger.warn('许可证文件已移除,撤销激活状态.');
      this.isActivated = false;
      this.currentKey = null;
      this.expiresAtMs = undefined;
    }
  }

  /** 解析 LICENSE_REQUIRED：显式开关优先，未设置时 production 默认开启、其它环境默认关闭 */
  private resolveLicenseRequired(): boolean {
    return isLicenseRequiredFromEnv();
  }

  /** bypass 是否生效：仅 test 环境且 ALLOW_LICENSE_BYPASS=true 时为真 */
  private isBypassActive(): boolean {
    // 安全：bypass 仅在 test 环境且显式设置 ALLOW_LICENSE_BYPASS=true 时生效，
    // 避免 development/staging/未设置 NODE_ENV 时被意外绕过授权
    if (process.env.NODE_ENV !== 'test') return false;
    return process.env.ALLOW_LICENSE_BYPASS?.trim() === 'true';
  }

  /** 启动期断言：production 下检测到任何 bypass 变量即拒绝启动 */
  private assertProductionBypassSafe(): void {
    // 安全：production 下禁止任何 bypass 变量（含遗留的 HOMEOS_LICENSE_BYPASS），
    // 一旦检测到立即拒绝启动
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

  /** 解析验签公钥：LICENSE_PUBLIC_KEY 内联优先，其次 LICENSE_PUBLIC_KEY_PATH，回退默认内嵌公钥 */
  private resolvePublicKey(): string {
    const inline = process.env.LICENSE_PUBLIC_KEY?.trim();
    if (inline) {
      return inline.includes('BEGIN PUBLIC KEY')
        ? inline.replace(/\\n/g, '\n')
        : inline;
    }
    const keyPath = process.env.LICENSE_PUBLIC_KEY_PATH?.trim();
    if (keyPath && existsSync(keyPath)) {
      return readFileSync(keyPath, 'utf8').trim();
    }
    return DEFAULT_LICENSE_PUBLIC_KEY;
  }

  /** 构建设备指纹：bypass 时返回固定值，否则委托 fingerprint.util 跨平台生成 */
  private buildFingerprint(): string {
    const bypass =
      this.isBypassActive() ? 'HOMEOS_BYPASS_DEVICE' : null;
    return generateHardwareFingerprint({
      internalDir: this.internalDir,
      bypassFingerprint: bypass,
    });
  }
}
