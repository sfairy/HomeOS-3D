/**
 * NestJS 应用根服务：提供健康检查、版本信息、Home Assistant 与 Redis/Prisma 联通诊断等端点。
 *
 * 核心职责：
 *  - 对外暴露健康检查聚合状态（HA 连接 / Redis 就绪 / DB 连通）；
 *  - 以短 TTL 缓存 DB 探针结果，避免高频公开 /health 轮询击穿连接池；
 *  - 生成 Prometheus 文本指标（在线实体数、WS 客户端数、HA 同步延迟快照等）。
 * 关键依赖：HaConnectorService、StateStoreService、PrismaService、RedisService、WsPushGateway（可选）。
 */

import { getErrorMessage } from './common/utils';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HaConnectorService } from './modules/ha-connector/service';
import { StateStoreService } from './modules/state-store/service';
import { loadAppVersion } from './common/platform/version.util';
import { PrismaService } from './shared/prisma/service';
import { RedisService } from './shared/redis/service';
import { WsPushGateway } from './modules/ws-push/gateway';
import { formatHomeosPrometheusMetrics } from './common/observability/prometheus-metrics.util';
import {
  getHaSyncLatencySnapshots,
  getHaWsDeferredDroppedTotal,
} from './common/observability/ha-sync-latency.util';

/**
 * 应用根服务
 * 聚合 HA 连接器和状态存储的服务，提供应用级别的健康检查。
 */
@Injectable()
export class AppService {
  private readonly appVersion: string;
  private readonly logger = new Logger(AppService.name);

  /**
   * 健康检查 DB 探针缓存：/health 为无鉴权且 SkipThrottle 的公开端点，
   * 若被高频轮询（负载均衡/健康探测/恶意扫描）会反复打 `SELECT 1`，
   * 在小连接池（默认 10）下存在把池打满、拖垮正常业务查询的风险。
   * 短 TTL 缓存在保持探针时效的同时削峰；Docker HEALTHCHECK 间隔 30s > TTL，仍能拿到真实 DB 状态。
   */
  private lastDbProbe: { at: number; ok: boolean } | null = null;
  // 健康检查 DB 探针 TTL：3000ms（Docker HEALTHCHECK 默认 30s 远大于此值，仍能拿到真实状态；
  // 同时阻断恶意/误配客户端 <1s 的高频轮询击穿 Prisma 连接池）。
  private readonly DB_PROBE_TTL_MS = 3000;

  constructor(
    private readonly haConnector: HaConnectorService,
    private readonly stateStore: StateStoreService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @Optional() private readonly wsPush?: WsPushGateway,
  ) {
    this.appVersion = loadAppVersion();
  }

  /** 带短 TTL 缓存的 DB 连通性探针：避免高频健康检查击穿连接池 */
  private async probeDbHealth(): Promise<boolean> {
    const now = Date.now();
    if (this.lastDbProbe && now - this.lastDbProbe.at < this.DB_PROBE_TTL_MS) {
      return this.lastDbProbe.ok;
    }
    let ok = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      ok = false;
      this.logger.warn(
        `数据库健康检查失败: ${getErrorMessage(error)}`,
      );
    }
    this.lastDbProbe = { at: Date.now(), ok };
    return ok;
  }

  /**
   * 最小 Prometheus 文本指标（根路径 GET /metrics，不受 api/v1 前缀影响）
   */
  getPrometheusMetrics(): string {
    return formatHomeosPrometheusMetrics({
      haConnected: this.haConnector.isConnected(),
      entityCount: this.stateStore.getCount(),
      socketClients: this.wsPush?.getClientCount?.() ?? 0,
      uptimeSeconds: Math.floor(process.uptime()),
      latency: getHaSyncLatencySnapshots(),
      haWsDeferredDroppedTotal: getHaWsDeferredDroppedTotal(),
    });
  }

  /**
   * 公开健康检查（供负载均衡 / Docker HEALTHCHECK，不暴露内部拓扑）
   */
  async getPublicHealth() {
    const db_ok = await this.probeDbHealth();
    const redisConfigured = Boolean(this.config.get('REDIS_URL'));
    const redisReady = redisConfigured ? this.redis.isReady() : false;
    const redisDegraded = redisConfigured && !redisReady;
    return {
      status: db_ok && !redisDegraded ? 'ok' : 'degraded',
      redis_ok: redisConfigured ? redisReady : null,
      redis: { configured: redisConfigured, ready: redisConfigured ? redisReady : false },
      ha_registry_available:
        this.haConnector.isConnected() && !this.haConnector.isRegistryDegraded(),
      timestamp: new Date().toISOString(),
    };
  }
}
