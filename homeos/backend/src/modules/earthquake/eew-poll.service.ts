/**
 * 职责：
 *  - EEW 轮询服务（拉取源+通知+自动化联动）；
 * 关键依赖：
 *  - shared/jobs、modules/notification；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { getErrorMessage } from '../../common/utils';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { EarthquakeService } from './service';
import { EewLeaderService } from './eew-leader.service';
import {
  parseUsgsFeatureAsEew,
  parseWolfxEewHttpJson,
  resolveUsgsFeedUrl,
} from './feeds.util';

const SC_EEW_URL = 'https://api.wolfx.jp/sc_eew.json';
const CENC_EEW_URL = 'https://api.wolfx.jp/cenc_eew.json';
const DUAL_POLL_MS = 18_000;
const USGS_POLL_MS = 60_000;
const BOOT_DELAY_MS = 8_000;
const WOLFX_DOWN_FOR_USGS_MS = 60_000;

@Injectable()
/**
 * EewPollService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 */
export class EewPollService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EewPollService.name);
  private dualTimer: ReturnType<typeof setInterval> | null = null;
  private usgsTimer: ReturnType<typeof setInterval> | null = null;
  private bootTimer: ReturnType<typeof setTimeout> | null = null;
  private lastScEventId = '';
  private lastCencEventId = '';
  private lastUsgsIds = new Set<string>();

  constructor(
    private readonly http: HttpService,
    private readonly earthquake: EarthquakeService,
    private readonly eewLeader: EewLeaderService,
    private readonly jobs: JobRegistryService,
  ) {}

  onModuleInit() {
    this.bootTimer = setTimeout(() => {
      void this.pollDualSources();
      this.dualTimer = setInterval(() => {
        void this.jobs
          .run(
            'earthquake-eew-dual-poll',
            { description: 'SC EEW + CENC EEW 主动查询', intervalMs: DUAL_POLL_MS },
            () => this.pollDualSources(),
          )
          .catch(() => undefined);
      }, DUAL_POLL_MS);

      this.usgsTimer = setInterval(() => {
        void this.jobs
          .run(
            'earthquake-usgs-backup-poll',
            { description: 'USGS EEW 兜底轮询', intervalMs: USGS_POLL_MS },
            () => this.pollUsgsBackup(),
          )
          .catch(() => undefined);
      }, USGS_POLL_MS);
    }, BOOT_DELAY_MS);
  }

  onModuleDestroy() {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.dualTimer) clearInterval(this.dualTimer);
    if (this.usgsTimer) clearInterval(this.usgsTimer);
  }

  /** 状态面板刷新时立即拉一次（启用且本实例为 Leader 时才真正请求） */
  async pollNow() {
    await this.pollDualSources();
    await this.pollUsgsBackup();
  }

  private async pollDualSources() {
    if (!this.eewLeader.isEewLeader()) return;
    await this.earthquake.ensureRuntimeConfig();
    if (!this.earthquake.getRuntimeConfig().enabled) return;

    await Promise.all([this.pollScEew(), this.pollCencEew()]);
  }

  private async pollScEew() {
    try {
      const body = await this.fetchJson(SC_EEW_URL);
      this.earthquake.recordSourcePoll('sc_eew', { ok: true });
      const eew = parseWolfxEewHttpJson(body, 'sc_eew');
      if (!eew) return;
      if (eew.eventId === this.lastScEventId) return;
      this.lastScEventId = eew.eventId;
      this.earthquake.ingestEew(eew);
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      this.earthquake.recordSourcePoll('sc_eew', { ok: false, error: msg });
      this.logger.warn(`SC EEW 轮询失败: ${msg}`);
    }
  }

  private async pollCencEew() {
    try {
      const body = await this.fetchJson(CENC_EEW_URL);
      this.earthquake.recordSourcePoll('cenc_eew', { ok: true });
      const eew = parseWolfxEewHttpJson(body, 'cenc_eew');
      if (!eew) return;
      if (eew.eventId === this.lastCencEventId) return;
      this.lastCencEventId = eew.eventId;
      this.earthquake.ingestEew(eew);
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      this.earthquake.recordSourcePoll('cenc_eew', { ok: false, error: msg });
      this.logger.warn(`CENC EEW 轮询失败: ${msg}`);
    }
  }

  private async pollUsgsBackup() {
    if (!this.eewLeader.isEewLeader()) return;
    await this.earthquake.ensureRuntimeConfig();
    if (!this.earthquake.getRuntimeConfig().enabled) return;
    if (!this.earthquake.shouldUseUsgsBackup(WOLFX_DOWN_FOR_USGS_MS)) return;

    try {
      const url = resolveUsgsFeedUrl('hour');
      const body = await this.fetchJson(url);
      this.earthquake.recordSourcePoll('usgs', { ok: true });
      const features = (body as { features?: unknown[] })?.features;
      if (!Array.isArray(features)) return;

      let ingested = 0;
      for (const feature of features.slice(0, 15)) {
        const eew = parseUsgsFeatureAsEew(feature);
        if (!eew) continue;
        if (this.lastUsgsIds.has(eew.eventId)) continue;
        this.lastUsgsIds.add(eew.eventId);
        this.earthquake.ingestEew(eew);
        ingested += 1;
        if (ingested >= 3) break;
      }
      if (this.lastUsgsIds.size > 80) {
        this.lastUsgsIds = new Set([...this.lastUsgsIds].slice(-40));
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      this.earthquake.recordSourcePoll('usgs', { ok: false, error: msg });
      this.logger.warn(`USGS 兜底轮询失败: ${msg}`);
    }
  }

  private async fetchJson(url: string): Promise<unknown> {
    const response = await firstValueFrom(
      this.http.get(url, {
        timeout: 12_000,
        headers: { Accept: 'application/json' },
        responseType: 'json',
        validateStatus: (s) => s >= 200 && s < 300,
      }),
    );
    return response.data;
  }
}
