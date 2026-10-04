/**
 * HA 动态配置服务（读取顺序：env 初值 → 激活 profile 覆盖 → env 回退）。
 *
 * 职责：
 * - 提供 HA URL / 外网 URL 与 Token 的动态读取；
 * - 局域网优先，连续建连失败后自动切换外网；仅在断线重连时偶尔探测局域网以便切回；
 * - 短时内存缓存（5s）；配置变更只失效缓存，不打断当前已连通的外网会话。
 */
import { getErrorMessage } from '../../common/utils';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/prisma/service';
import { AppConfigService } from '../../shared/app-config/service';
import { isLocalhostHaUrl } from '@homeos/shared';
import { readJsonObject } from '../../common/utils/json-field.util';

type HaResolvedConfig = {
  /** 当前应使用的 HA 基址（已按 failover 选择） */
  haUrl: string;
  /** 局域网 / 首选地址 */
  haUrlPrimary: string;
  /** 外网地址（可空） */
  haUrlFallback: string;
  token: string;
  /** 当前选用主/备 */
  activeSource: 'primary' | 'fallback';
};

type LoadedHaEndpoints = {
  haUrlPrimary: string;
  haUrlFallback: string;
  token: string;
};

@Injectable()
/**
 * HaConfigService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 */
export class HaConfigService implements OnModuleInit {
  private readonly logger = new Logger(HaConfigService.name);
  private cachedEndpoints: (LoadedHaEndpoints & { at: number }) | null = null;
  private static readonly CONFIG_CACHE_MS = 5_000;
  /** 局域网连续失败多少次后切到外网 */
  private static readonly FAIL_BEFORE_FAILOVER = 2;
  /** 使用外网期间，每隔多少次重连尝试探测一次局域网 */
  private static readonly PRIMARY_PROBE_EVERY = 5;

  private preferFallback = false;
  private failStreak = 0;
  /** 最近一次从 DB/env 解析出的端点（invalidate 不清，供比对是否真的改了 HA 地址） */
  private lastLoaded: LoadedHaEndpoints | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly appConfig: AppConfigService,
  ) {}

  onModuleInit() {
    this.eventEmitter.on('SYSTEM_CONFIG_UPDATED', () => this.invalidateCache());
  }

  /**
   * 读取当前生效配置（短时缓存）。
   * REST / WS 共用此接口，确保始终打到当前 active 地址。
   */
  async getConfig(): Promise<{ haUrl: string; token: string }> {
    const runtime = await this.getRuntimeConfig();
    return { haUrl: runtime.haUrl, token: runtime.token };
  }

  /**
   * 完整运行时配置（含主备与选用来源）。
   * @param opts.reconnectAttempt 当前重连序号（用于周期探测局域网）
   */
  async getRuntimeConfig(opts?: { reconnectAttempt?: number }): Promise<HaResolvedConfig> {
    const endpoints = await this.loadEndpointsCached();
    const probePrimary =
      this.preferFallback &&
      !!endpoints.haUrlFallback &&
      !!endpoints.haUrlPrimary &&
      typeof opts?.reconnectAttempt === 'number' &&
      opts.reconnectAttempt > 0 &&
      opts.reconnectAttempt % HaConfigService.PRIMARY_PROBE_EVERY === 0;

    const useFallback =
      !probePrimary && this.preferFallback && !!endpoints.haUrlFallback;
    const haUrl = useFallback ? endpoints.haUrlFallback : endpoints.haUrlPrimary;
    return {
      haUrl,
      haUrlPrimary: endpoints.haUrlPrimary,
      haUrlFallback: endpoints.haUrlFallback,
      token: endpoints.token,
      activeSource: useFallback ? 'fallback' : 'primary',
    };
  }

  /** 建连失败：累计失败次数，达到阈值后切外网 */
  notifyConnectFailure(): void {
    this.failStreak += 1;
    void this.loadEndpointsCached().then((endpoints) => {
      if (
        !this.preferFallback &&
        endpoints.haUrlFallback &&
        this.failStreak >= HaConfigService.FAIL_BEFORE_FAILOVER
      ) {
        this.preferFallback = true;
        this.logger.warn(
          `局域网 HA 连续失败 ${this.failStreak} 次,切换到外网地址:${endpoints.haUrlFallback}`,
        );
      }
    });
  }

  /** 建连成功：清零失败计数；若回到局域网则退出 failover */
  notifyConnectSuccess(connectedUrl: string): void {
    this.failStreak = 0;
    const normalized = (connectedUrl || '').replace(/\/$/, '');
    void this.loadEndpointsCached().then((endpoints) => {
      if (normalized && endpoints.haUrlPrimary && normalized === endpoints.haUrlPrimary) {
        if (this.preferFallback) {
          this.logger.log(`局域网 HA 已恢复,切回优先地址:${endpoints.haUrlPrimary}`);
        }
        this.preferFallback = false;
      }
    });
  }

  private async loadEndpointsCached(): Promise<LoadedHaEndpoints> {
    const now = Date.now();
    if (this.cachedEndpoints && now - this.cachedEndpoints.at < HaConfigService.CONFIG_CACHE_MS) {
      const { at: _at, ...rest } = this.cachedEndpoints;
      return rest;
    }
    const resolved = await this.loadEndpoints();
    this.lastLoaded = resolved;
    this.cachedEndpoints = { ...resolved, at: now };
    return resolved;
  }

  /** 最近一次已解析的主/备地址与 Token（未加载过则为 null） */
  getLoadedEndpointsSnapshot(): LoadedHaEndpoints | null {
    return this.lastLoaded ? { ...this.lastLoaded } : null;
  }

  static sameEndpoints(
    a: Pick<LoadedHaEndpoints, 'haUrlPrimary' | 'haUrlFallback' | 'token'> | null,
    b: Pick<LoadedHaEndpoints, 'haUrlPrimary' | 'haUrlFallback' | 'token'>,
  ): boolean {
    if (!a) return false;
    return (
      a.haUrlPrimary === b.haUrlPrimary &&
      a.haUrlFallback === b.haUrlFallback &&
      a.token === b.token
    );
  }

  private async loadEndpoints(): Promise<LoadedHaEndpoints> {
    const envHaUrl = this.config.get('HA_URL', '') || '';
    const envFallback = this.config.get('HA_URL_FALLBACK', '') || '';
    const envToken = this.config.get('HA_TOKEN', '') || '';
    let haUrlPrimary = envHaUrl;
    let haUrlFallback = envFallback;
    let token = envToken;

    try {
      const activeProfileId =
        String(this.appConfig.get('profiles').activeProfileId || '').trim() || 'default';
      let resolvedFromDb = false;
      const activeRecord = await this.prisma.projectConfig.findUnique({
        where: { projectId: activeProfileId },
        select: { projectId: true, layout: true },
      });
      if (activeRecord?.layout) {
        const layout = readJsonObject(activeRecord.layout);
        const haConfig = layout.haConfig as
          | { url?: string; fallbackUrl?: string; token?: string }
          | undefined;
        if (haConfig?.url && haConfig?.token) {
          this.logger.debug(`在激活 profile ${activeProfileId} 中找到 HA 配置`);
          haUrlPrimary = haConfig.url;
          haUrlFallback = haConfig.fallbackUrl || '';
          token = haConfig.token;
          resolvedFromDb = true;
        }
      }

      if (!resolvedFromDb) {
        if (envHaUrl && envToken) {
          this.logger.log(
            `激活 profile ${activeProfileId} 未提供完整 HA 配置,回退使用环境变量 HA_URL / HA_TOKEN`,
          );
        } else {
          this.logger.warn(
            `激活 profile ${activeProfileId} 未提供完整 HA 配置,且环境变量 HA_URL / HA_TOKEN 也未完整配置;` +
              '请在激活 profile 中配置 HA 连接(URL 与 Token)',
          );
          haUrlPrimary = '';
          haUrlFallback = '';
          token = '';
        }
      }
    } catch (e: unknown) {
      const errMsg = getErrorMessage(e);
      this.logger.error(`读取动态 HA 配置出错:${errMsg}`);
    }

    haUrlPrimary = this.normalizeHaUrl(haUrlPrimary);
    haUrlFallback = this.normalizeHaUrl(haUrlFallback);
    if (haUrlFallback && haUrlFallback === haUrlPrimary) {
      haUrlFallback = '';
    }

    this.warnLocalhostInProduction(haUrlPrimary, '局域网');
    this.warnLocalhostInProduction(haUrlFallback, '外网');

    return { haUrlPrimary, haUrlFallback, token };
  }

  /**
   * 与运行时 WebSocket/REST 一致的地址规范化（去尾斜杠、HOST_IP 替换 host.docker.internal）。
   * 连接探测必须走同一路径，否则会出现「WS 已连上局域网，探测却报不可达」。
   */
  normalizeHaUrl(raw: string): string {
    let haUrl = raw?.replace(/\/$/, '') || '';
    const hostIp = this.config.get('HOST_IP', '') || '';
    if (hostIp && hostIp !== 'host.docker.internal' && haUrl.includes('host.docker.internal')) {
      const replaced = haUrl.replace('host.docker.internal', hostIp);
      this.logger.log(`HA 地址中的 host.docker.internal 已替换为 HOST_IP: ${replaced}`);
      haUrl = replaced;
    }
    return haUrl;
  }

  private warnLocalhostInProduction(haUrl: string, label: string): void {
    if (haUrl && isLocalhostHaUrl(haUrl) && process.env.NODE_ENV === 'production') {
      this.logger.warn(
        `${label} HA 地址为 ${haUrl}:Docker/生产环境内 localhost 无法访问宿主机 HA,` +
          '请改为 host.docker.internal 或宿主机 LAN IP',
      );
    }
  }

  /** 仅失效端点缓存。不断开当前外网会话、不重置 failover。 */
  invalidateCache(): void {
    this.cachedEndpoints = null;
  }

  /** HA 地址/令牌确实变更后：从局域网重新试起 */
  resetFailover(): void {
    this.preferFallback = false;
    this.failStreak = 0;
  }
}
