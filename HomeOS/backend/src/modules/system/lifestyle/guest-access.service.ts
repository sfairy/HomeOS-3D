/**
 * 访客管理 / 临时密码服务
 *
 * 模块：system/lifestyle
 *
 * 为智能门锁生成有时效的临时密码（写入指定槽位），到期或手动撤销时清除。
 * 通过 HA lock.set_usercode / clear_usercode 下发；元数据与密文落库，重启后恢复。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { API_ERROR } from '../../../common/errors/api-error-messages';
import { badRequest } from '../../../common/utils/business-exception';
import { AppConfigService } from '../../../shared/app-config/service';
import { HaConnectorService } from '../../ha-connector/service';
import { EventBusService } from '../../../shared/redis/event-bus.service';
import { PrismaService } from '../../../shared/prisma/service';
import { getErrorMessage } from '../../../common/utils';
import { randomInt, randomUUID } from 'crypto';
import {
  decryptGuestPassCode,
  encryptGuestPassCode,
  ensureGuestPassCryptoKey,
} from './guest-pass-crypto.util';

interface GuestPass {
  id: string;
  name: string;
  code: string;
  lockEntityId: string;
  slot: number;
  createdAt: string;
  expiresAt: string;
  active: boolean;
}

const MAX_ACTIVE_GUEST_PASSES = 100;

@Injectable()
/**
 * GuestAccessService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class GuestAccessService
 */
export class GuestAccessService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GuestAccessService.name);
  private passes = new Map<string, GuestPass>();
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly haConnector: HaConnectorService,
    private readonly eventBus: EventBusService,
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    try {
      ensureGuestPassCryptoKey();
    } catch (err) {
      this.logger.error(`访客密码加密密钥初始化失败: ${getErrorMessage(err)}`);
    }
    await this.hydrateFromDb();
  }

  onModuleDestroy() {
    for (const t of this.timers.values()) clearTimeout(t);
  }

  /** 全员离家联动：启用后自动撤销所有有效访客临时密码，避免闲置密码被滥用 */
  @OnEvent('presence.everyoneLeft')
  async onEveryoneLeft() {
    await this.revokeAllOnAway('全员离家');
  }

  /** 日历外出时段联动：外出开始时撤销访客临时密码，结束不自动恢复（由用户按需重建） */
  @OnEvent('calendar.awayChanged')
  async onCalendarAway(data: { away?: boolean }) {
    if (!data?.away) return;
    await this.revokeAllOnAway('日历外出');
  }

  private async revokeAllOnAway(reason: string) {
    if (!this.appConfig.get('other').guestPassRevokeOnAway) return;
    const ids = Array.from(this.passes.keys());
    if (!ids.length) return;
    let ok = 0;
    for (const id of ids) {
      try {
        const r = await this.revokePass(id);
        if (r.ok) ok++;
      } catch (err) {
        this.logger.debug(`离家联动撤销访客密码失败 [${id}]: ${getErrorMessage(err)}`);
      }
    }
    if (ok > 0) {
      this.eventBus.emit('guest.passRevokedOnAway', { reason, count: ok });
      this.logger.log(`${reason}:已联动撤销 ${ok}/${ids.length} 条访客临时密码`);
    }
  }

  private guestDefaultHours(): number {
    const h = Number(this.appConfig.get('other').guestPassDefaultHours);
    return Number.isFinite(h) && h > 0 ? h : 24;
  }

  private guestExtendHours(): number {
    const h = Number(this.appConfig.get('other').guestPassExtendHours);
    return Number.isFinite(h) && h > 0 ? h : 24;
  }

  private clampDurationHours(raw: number | undefined): number {
    const fallback = this.guestDefaultHours();
    const h = raw != null && Number.isFinite(Number(raw)) ? Number(raw) : fallback;
    return Math.min(168, Math.max(1, h));
  }

  private async hydrateFromDb() {
    try {
      const rows = await this.prisma.guestPass.findMany({
        where: { active: true, expiresAt: { gt: new Date() } },
        take: 500,
      });
      for (const row of rows) {
        try {
          const code = decryptGuestPassCode({
            cipher: row.codeCipher,
            iv: row.codeIv,
            tag: row.codeTag,
          });
          const pass: GuestPass = {
            id: row.id,
            name: row.name,
            code,
            lockEntityId: row.lockEntityId,
            slot: row.slot,
            createdAt: row.createdAt.toISOString(),
            expiresAt: row.expiresAt.toISOString(),
            active: true,
          };
          this.passes.set(pass.id, pass);
          this.scheduleExpiry(pass);
        } catch (err) {
          this.logger.warn(`访客密码 ${row.id} 解密失败,标记失效: ${getErrorMessage(err)}`);
          await this.prisma.guestPass
            .update({ where: { id: row.id }, data: { active: false } })
            .catch(() => undefined);
        }
      }
      this.logger.log(`已从数据库恢复 ${this.passes.size} 条访客临时密码`);
    } catch (err) {
      this.logger.error(`访客密码 hydrate 失败: ${getErrorMessage(err)}`);
    }
  }

  async createPass(opts: {
    name: string;
    lockEntityId: string;
    slot?: number;
    durationHours?: number;
    code?: string;
  }) {
    const activeCount = await this.prisma.guestPass.count({ where: { active: true } });
    if (activeCount >= MAX_ACTIVE_GUEST_PASSES || this.passes.size >= MAX_ACTIVE_GUEST_PASSES) {
      badRequest(API_ERROR.GUEST_PASS_LIMIT(MAX_ACTIVE_GUEST_PASSES));
    }
    const id = `guest_${randomUUID()}`;
    const code = opts.code || String(randomInt(100000, 999999));
    const slot = opts.slot ?? (await this.nextFreeSlot(opts.lockEntityId));
    const durationHours = this.clampDurationHours(opts.durationHours);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationHours * 3600_000);
    const sealed = encryptGuestPassCode(code);

    const pass: GuestPass = {
      id,
      name: opts.name,
      code,
      lockEntityId: opts.lockEntityId,
      slot,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      active: true,
    };

    await this.prisma.guestPass.create({
      data: {
        id,
        name: pass.name,
        lockEntityId: pass.lockEntityId,
        slot,
        codeCipher: sealed.cipher,
        codeIv: sealed.iv,
        codeTag: sealed.tag,
        createdAt: now,
        expiresAt,
        active: true,
      },
    });

    try {
      await this.setLockCode(pass);
    } catch (err) {
      await this.prisma.guestPass.delete({ where: { id } }).catch(() => undefined);
      this.logger.warn(
        `临时密码门锁写入失败已回滚: ${pass.name} (${pass.lockEntityId}): ${getErrorMessage(err)}`,
      );
      badRequest(API_ERROR.GUEST_PASS_LOCK_WRITE_FAILED);
    }

    this.passes.set(id, pass);
    this.scheduleExpiry(pass);
    this.eventBus.emit('guest.passCreated', { id, name: pass.name, expiresAt: pass.expiresAt });
    this.logger.log(`临时密码已创建: ${pass.name} (槽位${slot}, 有效至 ${pass.expiresAt})`);
    return { ...this.redact(pass), code };
  }

  async revokePass(id: string) {
    const pass = this.passes.get(id) || (await this.loadPassFromDb(id));
    if (!pass) return { ok: false, reason: '未找到' };
    await this.clearLockCode(pass);
    pass.active = false;
    this.clearTimer(id);
    this.passes.delete(id);
    await this.prisma.guestPass
      .update({ where: { id }, data: { active: false } })
      .catch(() => undefined);
    this.eventBus.emit('guest.passRevoked', { id, name: pass.name });
    this.logger.log(`临时密码已撤销: ${pass.name}`);
    return { ok: true, id };
  }

  async extendPass(id: string, hours?: number) {
    const extendH =
      hours != null && hours > 0 ? Math.min(168, Math.max(1, hours)) : this.guestExtendHours();
    const pass = this.passes.get(id) || (await this.loadPassFromDb(id));
    if (!pass || !pass.active) return { ok: false, reason: '未找到' };
    const base = Math.max(Date.now(), new Date(pass.expiresAt).getTime());
    pass.expiresAt = new Date(base + extendH * 3600_000).toISOString();
    this.clearTimer(id);
    this.scheduleExpiry(pass);
    this.passes.set(id, pass);
    await this.prisma.guestPass.update({
      where: { id },
      data: { expiresAt: new Date(pass.expiresAt), active: true },
    });
    this.eventBus.emit('guest.passExtended', { id, name: pass.name, expiresAt: pass.expiresAt });
    return { ok: true, pass: this.redact(pass) };
  }

  async extendMany(ids: string[], hours?: number) {
    const extendH =
      hours != null && hours > 0 ? Math.min(168, Math.max(1, hours)) : this.guestExtendHours();
    const results = [];
    for (const id of ids) {
      results.push(await this.extendPass(id, extendH));
    }
    return results;
  }

  async list() {
    const rows = await this.prisma.guestPass.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const out = [];
    for (const row of rows) {
      const mem = this.passes.get(row.id);
      if (mem) {
        out.push(this.redact(mem));
        continue;
      }
      try {
        const code = decryptGuestPassCode({
          cipher: row.codeCipher,
          iv: row.codeIv,
          tag: row.codeTag,
        });
        out.push(
          this.redact({
            id: row.id,
            name: row.name,
            code,
            lockEntityId: row.lockEntityId,
            slot: row.slot,
            createdAt: row.createdAt.toISOString(),
            expiresAt: row.expiresAt.toISOString(),
            active: row.active,
          }),
        );
      } catch {
        out.push({
          id: row.id,
          name: row.name,
          lockEntityId: row.lockEntityId,
          slot: row.slot,
          codeMasked: '******',
          createdAt: row.createdAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
          active: row.active,
        });
      }
    }
    return out;
  }

  private async loadPassFromDb(id: string): Promise<GuestPass | null> {
    const row = await this.prisma.guestPass.findUnique({ where: { id } });
    if (!row || !row.active) return null;
    try {
      const code = decryptGuestPassCode({
        cipher: row.codeCipher,
        iv: row.codeIv,
        tag: row.codeTag,
      });
      const pass: GuestPass = {
        id: row.id,
        name: row.name,
        code,
        lockEntityId: row.lockEntityId,
        slot: row.slot,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        active: row.active,
      };
      this.passes.set(id, pass);
      return pass;
    } catch {
      return null;
    }
  }

  private redact(p: GuestPass) {
    return {
      id: p.id,
      name: p.name,
      lockEntityId: p.lockEntityId,
      slot: p.slot,
      codeMasked: p.code.replace(/.(?=.{2})/g, '*'),
      createdAt: p.createdAt,
      expiresAt: p.expiresAt,
      active: p.active,
    };
  }

  private async nextFreeSlot(lockEntityId: string): Promise<number> {
    const used = new Set<number>();
    for (const p of this.passes.values()) {
      if (p.lockEntityId === lockEntityId) used.add(p.slot);
    }
    const rows = await this.prisma.guestPass.findMany({
      where: { lockEntityId, active: true },
      select: { slot: true },
      take: 200,
    });
    for (const r of rows) used.add(r.slot);
    let slot = 10;
    while (used.has(slot)) slot++;
    return slot;
  }

  private scheduleExpiry(pass: GuestPass) {
    const ms = new Date(pass.expiresAt).getTime() - Date.now();
    if (ms <= 0) {
      void this.revokePass(pass.id);
      return;
    }
    this.clearTimer(pass.id);
    const timer = setTimeout(
      () => {
        void this.revokePass(pass.id);
      },
      Math.min(ms, 2_147_483_647),
    );
    this.timers.set(pass.id, timer);
  }

  private clearTimer(id: string) {
    const t = this.timers.get(id);
    if (t) {
      clearTimeout(t);
      this.timers.delete(id);
    }
  }

  private async tryLockCode(
    pass: GuestPass,
    action: 'set_usercode' | 'clear_usercode',
  ): Promise<boolean> {
    const data =
      action === 'set_usercode'
        ? { code_slot: pass.slot, usercode: pass.code }
        : { code_slot: pass.slot };
    try {
      await this.haConnector.callService('lock', action, pass.lockEntityId, data);
      return true;
    } catch (err) {
      this.logger.debug(`lock.${action} 失败: ${getErrorMessage(err)}`);
    }
    const label = action === 'set_usercode' ? '写入' : '清除';
    this.logger.warn(
      `临时密码${label}门锁失败(${pass.lockEntityId}),请检查门锁集成是否支持 usercode 服务`,
    );
    return false;
  }

  private async setLockCode(pass: GuestPass) {
    const ok = await this.tryLockCode(pass, 'set_usercode');
    if (!ok) {
      badRequest(API_ERROR.GUEST_PASS_LOCK_WRITE_FAILED);
    }
  }

  private async clearLockCode(pass: GuestPass) {
    // 撤销时清除失败仅告警：本地仍须标记失效，避免「假 active」
    await this.tryLockCode(pass, 'clear_usercode');
  }
}
