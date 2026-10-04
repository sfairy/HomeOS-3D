/**
 * 职责：
 *  - 游客分享码签发/校验（AES-GCM 签名）；
 * 关键依赖：
 *  - crypto、AppConfigService；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../shared/prisma/service';
import { BusinessException, ErrorCode } from '../../common/utils';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { randomBytes } from 'crypto';

/** 访客 JWT 载荷（不含 exp，兑换时按剩余 TTL 签发） */
export type GuestSharePayload = {
  sub: string;
  role: 'guest';
  iss: string;
  restrictions: string[];
  allowedSceneIds: string[];
};

/**
 * 访客分享短码：PG 持久化 code → payload，避免 JWT 明文落库。
 */
@Injectable()
export class GuestShareCodeService implements OnModuleInit {
  private readonly logger = new Logger(GuestShareCodeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /** 模块初始化时清理一次过期短码 */
  async onModuleInit() {
    await this.pruneExpired();
  }

  /**
   * 注册访客短码：先生成随机 hex 短码，
   * 与 payload、过期时间一起写入 GuestShareCode 表。
   */
  async register(payload: GuestSharePayload, validHours: number): Promise<string> {
    await this.pruneExpired();
    const code = randomBytes(12).toString('hex');
    const expiresAt = new Date(Date.now() + validHours * 3600_000);
    await this.prisma.guestShareCode.create({
      data: { code, payload, expiresAt },
    });
    this.logger.debug(`访客短码已注册,有效期 ${validHours}h`);
    return code;
  }

  /**
   * 兑换短码为访客 JWT：事务内查询并删除短码（一次性消费），
   * 校验载荷合法性后按剩余 TTL（至少 60s）重新签发 JWT。
   */
  async exchange(code: string): Promise<string> {
    if (!code?.trim()) {
      throw new BusinessException(
        ErrorCode.VALIDATION_FAILED,
        API_ERROR.AUTH_GUEST_SHARE_CODE_MISSING,
      );
    }
    await this.pruneExpired();
    const trimmed = code.trim();

    const entry = await this.prisma.$transaction(async (tx) => {
      const row = await tx.guestShareCode.findUnique({ where: { code: trimmed } });
      if (!row) return null;
      if (row.expiresAt.getTime() < Date.now()) {
        await tx.guestShareCode.delete({ where: { code: trimmed } });
        return null;
      }
      await tx.guestShareCode.delete({ where: { code: trimmed } });
      return row;
    });

    if (!entry) {
      throw new BusinessException(ErrorCode.NOT_FOUND, API_ERROR.AUTH_GUEST_SHARE_CODE_INVALID);
    }
    if (!entry.payload || typeof entry.payload !== 'object' || Array.isArray(entry.payload)) {
      throw new BusinessException(
        ErrorCode.VALIDATION_FAILED,
        API_ERROR.AUTH_GUEST_SHARE_CODE_PAYLOAD_INVALID,
      );
    }
    const remainingSec = Math.max(60, Math.floor((entry.expiresAt.getTime() - Date.now()) / 1000));
    return this.jwtService.sign(entry.payload as GuestSharePayload, { expiresIn: remainingSec });
  }

  /** 清理过期短码：删除 expiresAt 已过去的记录，删除失败仅 warn 不影响主流程 */
  private async pruneExpired(): Promise<void> {
    try {
      const result = await this.prisma.guestShareCode.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (result.count > 0) {
        this.logger.debug(`已清理 ${result.count} 条过期访客短码`);
      }
    } catch (err) {
      this.logger.warn(`清理访客短码失败: ${(err as Error).message}`);
    }
  }
}
