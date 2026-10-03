/**
 * 安防服务：门铃抓拍抓取 + Frigate / HA 路径校验，为安防面板控制器提供状态与事件素材。
 *
 * 所属模块：modules/security（由 SecurityModule 注入为单例）。
 * 核心职责：
 *  - 通过 HaConfigService 获取当前生效的 HA 地址与 Long-Lived Token；
 *  - 从激活 profile 布局中解析 eventsPath 指向的 JSONL（门铃事件行）；
 *  - 校验 media_path / local 目录的文件可达性，带 TTL 短缓存以避免轮询 HA IO；
 *  - 当 HA 为局域网优先模式时自动切回外网地址，掩盖内网抖动。
 * 关键依赖：ConfigService、PrismaService（读布局）、HttpService、AppConfigService（TTL 配置）、HaConfigService。
 */

/**
 * 安防服务（Security Service）
 *
 * 所属模块：security
 * 职责：从 Home Assistant 抓取门铃抓拍事件（events.jsonl），并校验文件路径连通性。
 *      HA URL 走 HaConfigService；eventsPath 只读激活 profile 布局，结果带 TTL 缓存。
 * 依赖：ConfigService（环境变量）、PrismaService（项目配置）、HttpService（HTTP 抓取）、
 *      AppConfigService（运行时配置与缓存 TTL）。
 */
import { getErrorMessage } from '../../common/utils';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../shared/prisma/service';
import { AppConfigService } from '../../shared/app-config/service';
import { HaConfigService } from '../ha-connector/ha-config.service';
import { firstValueFrom } from 'rxjs';
import { readJsonObject } from '../../common/utils/json-field.util';

/** Frigate 门铃事件结构（JSONL 单行解析后），至少包含日期与时间字段。 */
interface FrigateHaEvent {
  date: string;
  time: string;
  [key: string]: unknown;
}

/**
 * 安防服务
 *
 * DI 角色：@Injectable，由 SecurityModule 注入，提供门铃事件抓取与路径校验能力。
 */
@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);
  private configCache: { haUrl: string; eventsPath: string } | null = null;
  private configCacheTime = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly appConfig: AppConfigService,
    private readonly haConfig: HaConfigService,
  ) {}

  /** 动态配置缓存 TTL（毫秒），来自 appConfig.security.configCacheTtlMs。 */
  private get configCacheTtlMs() {
    return this.appConfig.get('security').configCacheTtlMs;
  }

  /**
   * 获取动态安全配置（当前生效的 HA URL + eventsPath）。
   * HA 地址走 HaConfigService（含局域网失败后的外网切换）；
   * eventsPath 只读激活 profile 的布局，与 HA 地址同源。
   */
  private async getDynamicConfig() {
    const { haUrl: liveHaUrl, token } = await this.haConfig.getConfig();
    const liveUrl = (liveHaUrl || this.configService.get('HA_URL') || 'http://localhost:8123').replace(
      /\/$/,
      '',
    );

    if (this.configCache && Date.now() - this.configCacheTime < this.configCacheTtlMs) {
      return { ...this.configCache, haUrl: liveUrl, token };
    }

    let eventsPath = '/local/doorbell_snapshots/events.jsonl';

    try {
      const activeProfileId =
        String(this.appConfig.get('profiles').activeProfileId || '').trim() || 'default';
      const activeRecord = await this.prisma.projectConfig.findUnique({
        where: { projectId: activeProfileId },
        select: { layout: true },
      });
      if (activeRecord?.layout) {
        const layout = readJsonObject(activeRecord.layout);
        const haConfig = layout.haConfig as { eventsPath?: string } | undefined;
        if (haConfig && 'eventsPath' in haConfig) {
          eventsPath = String(haConfig.eventsPath || '').trim();
        }
      }
    } catch (e: unknown) {
      const errMsg = getErrorMessage(e);
      this.logger.error(`读取动态安全配置出错:${errMsg}`);
    }

    this.configCache = { haUrl: liveUrl, eventsPath };
    this.configCacheTime = Date.now();
    return { ...this.configCache, token };
  }

  private haFileGetOptions(token?: string) {
    return {
      responseType: 'text' as const,
      timeout: 10_000,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      validateStatus: (status: number) => status === 200 || status === 404,
    };
  }

  /**
   * 从 HA 抓取门铃事件 JSONL 并解析为事件列表。
   * 将 /local/ 相对路径补全为完整 HA URL，兼容 video/clip/mp4/recording 字段。
   * @returns 按时间倒序排列的事件数组；抓取失败或路径为空时返回空数组。
   */
  async fetchEvents() {
    try {
      const { haUrl, eventsPath, token } = await this.getDynamicConfig();

      if (!eventsPath) {
        return [];
      }

      const eventsUrl = `${haUrl}${eventsPath}`;

      const response = await firstValueFrom(
        this.httpService.get(eventsUrl, this.haFileGetOptions(token)),
      );

        // 404 视为尚无事件，非错误
              if (response.status === 404) {
        this.logger.warn('在 HA 中未找到 events.jsonl.假设尚无事件.');
        return [];
      }

      const text = response.data;
      const lines = text.split('\n').filter((line: string) => line.trim() !== '');

      const events: FrigateHaEvent[] = lines
        .map((line: string): FrigateHaEvent | null => {
          try {
            const e = JSON.parse(line) as Record<string, unknown>;
            // 将 /local/ 开头的相对资源路径补全为完整 HA URL，供前端直接访问
                        for (const key of ['img', 'video', 'clip', 'mp4', 'recording']) {
              const val = e[key];
              if (typeof val === 'string' && val.startsWith('/local/')) {
                e[key] = `${haUrl}${val}`;
              }
            }
            // video 字段兼容：依次回退到 clip / mp4 / recording，保证前端有可播放地址
                        if (!e.video && e.clip) e.video = e.clip;
            if (!e.video && e.mp4) e.video = e.mp4;
            if (!e.video && e.recording) e.video = e.recording;
            return e as FrigateHaEvent;
          } catch {
            return null;
          }
        })
        .filter((event: FrigateHaEvent | null): event is FrigateHaEvent => event !== null);

      // 按日期+时间倒序排列，最新事件在前
            events.sort((a, b) => {
        const datetimeA = new Date(`${a.date}T${a.time}`).getTime();
        const datetimeB = new Date(`${b.date}T${b.time}`).getTime();
        return datetimeB - datetimeA;
      });

      return events;
    } catch (error: unknown) {
      this.logger.error(
        `从 HA 获取事件失败:${getErrorMessage(error)}`,
      );
      return [];
    }
  }

  /**
   * 校验 events.jsonl 路径连通性。
   * @returns 包含 ok / configured / url / lineCount / message 的校验结果。
   *          404 返回「HA 上未找到该路径文件」；空文件返回「文件为空，尚无事件」。
   */
  async validateEventsPath() {
    const { haUrl, eventsPath, token } = await this.getDynamicConfig();
    if (!eventsPath?.trim()) {
      return {
        ok: false,
        configured: false,
        message: '未配置 eventsPath，请在集成绑定中填写抓拍记录路径',
      };
    }
    const eventsUrl = `${haUrl}${eventsPath}`;
    try {
      const response = await firstValueFrom(
        this.httpService.get(eventsUrl, this.haFileGetOptions(token)),
      );
        // 404 视为尚无事件，非错误
              if (response.status === 404) {
        return { ok: false, configured: true, url: eventsUrl, message: 'HA 上未找到该路径文件' };
      }
      const lines = String(response.data || '')
        .split('\n')
        .filter((l: string) => l.trim());
      let parsed = 0;
      for (const line of lines.slice(0, 5)) {
        try {
          JSON.parse(line);
          parsed++;
        } catch {
          /* 跳过 */
        }
      }
      return {
        ok: parsed > 0 || lines.length === 0,
        configured: true,
        url: eventsUrl,
        lineCount: lines.length,
        message: lines.length === 0 ? '文件为空，尚无事件' : `连通正常，约 ${lines.length} 条记录`,
      };
    } catch (error: unknown) {
      return {
        ok: false,
        configured: true,
        url: eventsUrl,
        message: getErrorMessage(error),
      };
    }
  }
}
