/**
 * 命令代理服务（CommandProxyService）
 *
 * 所属模块：command-proxy
 * 职责：
 *  - 作为前端 REST 控制指令到 HA 的上层封装，委托 HaConnectorService 执行 callService。
 *  - HA 未连接时拦截高风险控制并返回友好错误（isDangerousHaControl）。
 *  - 幂等键去重：Redis SET NX 优先，失败回退内存 Map（防同键重复下发）。
 *  - 历史查询走 CircuitBreaker（ha-history-api），熔断时快速失败避免雪崩。
 *  - 天气预报（weather.get_forecasts + return_response）WS 失败时降级 REST 拉取。
 *  - 媒体代理：fetchMediaImage / openMediaStream 透传 HA 资源给前端。
 *  - 配置变更（APP_CONFIG_UPDATED）触发幂等清理周期重建。
 *
 * 关键依赖：HaConnectorService、AppConfigService、RedisService、JobRegistryService、
 *          CircuitBreaker、isDangerousHaControl（@homeos/shared）。
 */
import { API_ERROR } from '../../common/errors/api-error-messages';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { badRequest, rethrowIfHttpException } from '../../common/utils/business-exception';
import { HaConnectorService } from '../ha-connector/service';
import { CircuitBreaker, CircuitOpenError } from '../../common/resilience/circuit-breaker.helper';
import { OnEvent } from '@nestjs/event-emitter';
import { AppConfigService, APP_CONFIG_UPDATED } from '../../shared/app-config/service';
import { RedisService } from '../../shared/redis/service';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { isDangerousHaControl } from '@homeos/shared';

/** 天气预报读请求：WS 失败（超时 / 未连接 / 已关闭）一律回退 REST */
function shouldUseWeatherRestFallback(
  domain: string,
  service: string,
  returnResponse: boolean | undefined,
): boolean {
  return domain === 'weather' && service === 'get_forecasts' && !!returnResponse;
}

function dangerousControlBlockedMessage(entityId: string): string {
  return `Home Assistant 未连接，已拦截高风险操作（${entityId}）。请恢复 HA 连接后再试。`;
}

/**
 * 命令代理服务（DI 角色：Provider）。
 *
 * 作为 HA 连接器的上层封装，提供带错误处理、幂等去重、熔断降级的命令执行能力。
 * HA 未连接时拦截高风险控制（isDangerousHaControl）并返回友好错误，避免盲发导致
 * 用户误以为设备已动作；幂等键通过 Redis SET NX 跨副本去重，内存 Map 仅作回退。
 */
@Injectable()
export class CommandProxyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommandProxyService.name);
  private readonly historyBreaker: CircuitBreaker;
  private readonly idempotencyStore = new Map<string, number>();
  private idempotencyCleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly haConnector: HaConnectorService,
    private readonly appConfig: AppConfigService,
    private readonly redis: RedisService,
    private readonly jobs: JobRegistryService,
  ) {
    this.historyBreaker = new CircuitBreaker('ha-history-api', {
      failureThreshold: 3,
      recoveryTimeout: 30000,
      halfOpenMaxAttempts: 2,
    });
  }

  /**
   * Climate Auto Turn-on 已下沉到 HaConnector.callService，所有联动路径共用。
   */

  private get idempotencyTtlMs() {
    return this.appConfig.get('commandProxy').idempotencyTtlMs;
  }

  private get idempotencyCleanupIntervalMs() {
    return this.appConfig.get('commandProxy').idempotencyCleanupIntervalMs;
  }

  /**
   * 启动幂等记录过期清理定时器。
   * @remarks 通过 JobRegistryService 注册为可观测后台任务，清理内存 Map 中超过 2×TTL 的旧键。
   *          配置热更新时先清理旧定时器再按新间隔重建。
   */
  private startIdempotencyCleanup() {
    if (this.idempotencyCleanupTimer) {
      clearInterval(this.idempotencyCleanupTimer);
    }
    this.idempotencyCleanupTimer = setInterval(() => {
      void this.jobs.run(
        'command-idempotency-cleanup',
        {
          description: '命令幂等记录过期清理',
          intervalMs: this.idempotencyCleanupIntervalMs,
        },
        () => {
          const now = Date.now();
          const ttl = this.idempotencyTtlMs;
          for (const [key, time] of this.idempotencyStore) {
            if (now - time > ttl * 2) {
              this.idempotencyStore.delete(key);
            }
          }
        },
      );
    }, this.idempotencyCleanupIntervalMs);
  }

  /** 配置热更新：commandProxy 变更时重建幂等清理定时器以应用新间隔 */
  @OnEvent(APP_CONFIG_UPDATED)
  onConfigUpdated(keys: string[]) {
    if (keys.includes('commandProxy')) {
      this.startIdempotencyCleanup();
    }
  }

  /** 模块初始化：启动幂等记录清理定时器 */
  onModuleInit() {
    this.startIdempotencyCleanup();
  }

  /** 模块销毁：清理幂等清理定时器，避免句柄泄漏 */
  onModuleDestroy() {
    if (this.idempotencyCleanupTimer) {
      clearInterval(this.idempotencyCleanupTimer);
      this.idempotencyCleanupTimer = null;
    }
  }

  /** WS 优先；天气预报超时/失败时回退 REST（return_response） */
  private async callServiceWithFallback(dto: {
    domain: string;
    service: string;
    entity_id: string;
    service_data?: Record<string, unknown>;
    return_response?: boolean;
    idempotency_key?: string;
  }): Promise<unknown> {
    try {
      return await this.haConnector.callService(
        dto.domain,
        dto.service,
        dto.entity_id,
        dto.service_data,
        dto.return_response,
        // 幂等键下沉：断连入队 / 桥接转发携带同键，Leader 端去重防止重复执行
        dto.idempotency_key,
      );
    } catch (wsErr: unknown) {
      if (!shouldUseWeatherRestFallback(dto.domain, dto.service, dto.return_response)) throw wsErr;
      this.logger.warn(
        `[命令 REST 回退] ${dto.domain}.${dto.service} → ${dto.entity_id}(${formatServiceCallError(wsErr)})`,
      );
      return this.haConnector.callServiceViaRest(
        dto.domain,
        dto.service,
        dto.entity_id,
        { ...(dto.service_data || {}), return_response: true },
        45_000,
      );
    }
  }

  /**
   * 占用幂等键：Redis SET NX 优先（跨副本去重），失败回退内存 Map。
   * @param idempotencyKey 幂等键
   * @returns true 表示首次占用成功；false 表示键已存在（重复命令应跳过）
   * @remarks Redis 写入失败时降级为内存 Map，按 TTL 判重；调用失败后需调 releaseIdempotencyKey 释放。
   */
  private async claimIdempotencyKey(idempotencyKey: string): Promise<boolean> {
    const ttl = this.idempotencyTtlMs;
    if (this.redis.isReady()) {
      const client = this.redis.getClient();
      if (client) {
        try {
          const ok = await client.set(`homeos:cmd-idem:${idempotencyKey}`, '1', 'PX', ttl, 'NX');
          return ok === 'OK';
        } catch (e) {
          this.logger.warn(`Redis 幂等键写入失败,回退内存: ${e}`);
        }
      }
    }
    const now = Date.now();
    const lastTime = this.idempotencyStore.get(idempotencyKey);
    if (lastTime && now - lastTime < ttl) {
      return false;
    }
    this.idempotencyStore.set(idempotencyKey, now);
    return true;
  }

  /**
   * 释放幂等键：命令执行失败时回滚，允许后续重试。
   * @param idempotencyKey 幂等键
   * @remarks 同时清理内存 Map 与 Redis key；Redis 删除失败仅告警，不影响主流程。
   */
  private async releaseIdempotencyKey(idempotencyKey: string): Promise<void> {
    this.idempotencyStore.delete(idempotencyKey);
    if (!this.redis.isReady()) return;
    const client = this.redis.getClient();
    if (!client) return;
    try {
      await client.del(`homeos:cmd-idem:${idempotencyKey}`);
    } catch (e) {
      this.logger.warn(`Redis 幂等键释放失败: ${e}`);
    }
  }

  /**
   * 调用 HA 服务并返回结构化结果
   * 包含前置检查（HA 连接状态）、日志记录和错误处理。
   * @param dto.domain - 服务域（如 'light'）
   * @param dto.service - 服务名称（如 'turn_on'）
   * @param dto.entity_id - 目标实体 ID
   * @param dto.service_data - 额外服务参数（可选）
   * @param dto.return_response - 是否等待 HA 返回结果（可选）
   * @returns {success, message_id, timestamp, data}
   */
  async callService(dto: {
    domain: string;
    service: string;
    entity_id: string;
    service_data?: Record<string, unknown>;
    return_response?: boolean;
    idempotency_key?: string;
  }) {
    if (dto.idempotency_key) {
      const claimed = await this.claimIdempotencyKey(dto.idempotency_key);
      if (!claimed) {
        this.logger.debug(`幂等键命中,跳过重复命令: ${dto.idempotency_key}`);
        return {
          success: true,
          message_id: `idem-${dto.idempotency_key}`,
          timestamp: new Date().toISOString(),
          queued: false,
          skipped: true,
          data: { skipped: true, reason: 'duplicate_idempotency_key' },
        };
      }
    }

    const status = await this.haConnector.getStatus();
    if (!status.connected) {
      if (isDangerousHaControl(dto.domain, dto.service, dto.entity_id)) {
        throw new ServiceUnavailableException({
          error: dangerousControlBlockedMessage(dto.entity_id),
          ha_url: status.ha_url,
          blocked: true,
        });
      }
      this.logger.warn(
        `HA 未连接,命令将入队等待重连: ${dto.domain}.${dto.service} → ${dto.entity_id}`,
      );
    }

    try {
      const data = await this.callServiceWithFallback(dto);

      const messageId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timestamp = new Date().toISOString();
      const queued =
        data && typeof data === 'object' && !Array.isArray(data)
          ? Boolean((data as Record<string, unknown>).queued)
          : false;

      this.logger.debug(
        `[命令] ${dto.domain}.${dto.service} → ${dto.entity_id} | id: ${messageId}${queued ? ' | queued' : ''}`,
      );

      return {
        success: true,
        message_id: messageId,
        timestamp,
        queued,
        skipped: false,
        data,
      };
    } catch (e: unknown) {
      if (dto.idempotency_key) {
        await this.releaseIdempotencyKey(dto.idempotency_key);
      }
      const errMsg = formatServiceCallError(e);
      if (
        errMsg === 'HA not connected' ||
        errMsg === 'HA 未连接' ||
        errMsg === 'WebSocket 未连接'
      ) {
        throw new ServiceUnavailableException({
          error: 'HA 未连接',
          ha_url: (await this.haConnector.getStatus()).ha_url,
        });
      }
      const isForecastTimeout =
        dto.domain === 'weather' &&
        dto.service === 'get_forecasts' &&
        /timeout|超时/i.test(errMsg);
      if (isForecastTimeout) {
        this.logger.warn(
          `[命令超时] ${dto.domain}.${dto.service} → ${dto.entity_id}(HA 天气源响应慢)`,
        );
      } else {
        // Error 的 message/stack 不可枚举，JSON.stringify(e) 会得到 {}，须用 formatServiceCallError
        this.logger.error(
          `[命令错误] ${dto.domain}.${dto.service} → ${dto.entity_id || '-'} 失败:${errMsg || '未知错误'}`,
        );
      }
      rethrowIfHttpException(e);
      badRequest(API_ERROR.PROXY_HA_SERVICE_FAILED(errMsg));
    }
  }

  /**
   * 获取实体历史数据（代理到 HA 连接器）
   * 经断路器保护：HA history API 较重且易超时，连续失败时快速失败避免堆积。
   */
  async fetchHistory(entityIds: string[], hours: number) {
    try {
      return await this.historyBreaker.fire(() =>
        this.haConnector.fetchHistory(entityIds, hours),
      );
    } catch (e) {
      if (e instanceof CircuitOpenError) {
        throw new ServiceUnavailableException({
          error: 'HA 历史接口暂时不可用（断路器打开），请稍后重试',
          retryAfterSeconds: e.retryAfterSeconds,
        });
      }
      throw e;
    }
  }

  /**
   * 从服务端探测 HA 连接（用于 Docker 设置页校验容器内可达性）
   */
  async testHaConnection(url: string, token: string) {
    return this.haConnector.testHaConnection(url, token);
  }

  /**
   * 获取 HA 媒体图片（代理到 HA 连接器）
   */
  async fetchMediaImage(path: string) {
    return this.haConnector.fetchMediaImage(path);
  }

  /**
   * 打开 HA 媒体流（代理到 HA 连接器）。
   * @param path HA 媒体路径（如 /api/camera_proxy_stream/...）
   * @returns 上游 fetch Response，由控制器决定 m3u8 重写或 Readable 管道转发
   */
  async openMediaStream(path: string) {
    return this.haConnector.openMediaStream(path);
  }
}

/**
 * 将任意错误对象格式化为可读字符串。
 * @param e 错误对象（Error / 对象 / Nest HttpException 等）
 * @returns 错误描述字符串；无法识别时返回「未知错误」
 * @remarks 关键路径：Error 的 message/stack 不可枚举，JSON.stringify(e) 会得到 `{}`，
 *          必须显式读取 message / getResponse() 等字段，避免审计日志丢失错误信息。
 */
function formatServiceCallError(e: unknown): string {
  if (e instanceof Error) {
    const msg = String(e.message || '').trim();
    if (msg) return msg;
    if (e.name && e.name !== 'Error') return e.name;
  }
  if (e && typeof e === 'object') {
    const rec = e as Record<string, unknown>;
    if (typeof rec.message === 'string' && rec.message.trim()) return rec.message.trim();
    if (typeof rec.error === 'string' && rec.error.trim()) return rec.error.trim();
    if (typeof rec.code === 'string' && rec.code) return rec.code;
    // Nest HttpException.getResponse() 响应体
    if (typeof (e as { getResponse?: () => unknown }).getResponse === 'function') {
      try {
        const body = (e as { getResponse: () => unknown }).getResponse();
        if (typeof body === 'string' && body.trim()) return body.trim();
        if (body && typeof body === 'object') {
          const m = (body as { message?: unknown }).message;
          if (typeof m === 'string' && m.trim()) return m.trim();
          if (Array.isArray(m) && m.length) return m.map(String).join('；');
        }
      } catch {
        /* 忽略 */
      }
    }
    try {
      const json = JSON.stringify(e);
      if (json && json !== '{}') return json;
    } catch {
      /* 忽略 */
    }
  }
  const s = String(e);
  return s === '[object Object]' ? '未知错误' : s;
}
