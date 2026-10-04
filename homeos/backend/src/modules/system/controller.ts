/**
 * @file controller.ts
 * @module system
 * @description 系统域核心 REST 控制器。路由前缀 system/，对外暴露运维诊断、调度作业仪表盘、
 * 统一执行历史、HA 同步延迟、运行时日志（含 SSE 订阅）、僵尸绑定扫描与解绑、状态库漂移修复、
 * 数据库保留清理、WebSocket 推送统计、后端性能建议等管理接口。
 *
 * 鉴权：
 *  - JwtAuthGuard 通用；admin 专属接口叠加 RolesGuard + @Roles('admin')，部分接口放宽到 adult
 *
 * 依赖：
 *  - SystemService：版本 / 健康状态 / 数据库体积
 *  - MoviePilotProxyService：MoviePilot 图片代理
 *  - DeviceManagementService：僵尸绑定扫描与批量解绑
 *  - HaConnectorService / StateStoreService：HA 与状态库诊断
 *  - WsPushGateway / RedisService：WebSocket 推送统计与 Redis 状态
 *  - DatabaseRetentionService：保留清理
 *  - AppConfigService / JobRegistryService：配置与调度作业仪表盘
 *  - PrismaService：运行时 KV（如漂移修复最近一次执行）
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  MessageEvent,
  Post,
  Query,
  Req,
  Res,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { parseIntParam } from '../../common/crud/pagination.util';
import { SystemService } from './service';
import { MoviePilotProxyService } from './ops/system-moviepilot-proxy.service';
import {
  DeviceManagementService,
  type ZombieUnbindRequest,
} from './device/device-management.service';
import { HaConnectorService } from '../ha-connector/service';
import { StateStoreService } from '../state-store/service';
import { WsPushGateway } from '../ws-push/gateway';
import { RedisService } from '../../shared/redis/service';
import { ConfigService } from '@nestjs/config';
import { DatabaseRetentionService } from '../../common/database/retention.service';
import { AppConfigService } from '../../shared/app-config/service';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { buildBackendPerfSuggestions } from '../../common/observability/adaptive-backend-perf.util';
import {
  getHaSyncLatencySnapshots,
  getHaWsDeferredDroppedTotal,
} from '../../common/observability/ha-sync-latency.util';
import {
  clearRuntimeLogs,
  getRuntimeLogMeta,
  matchesRuntimeLogFilter,
  queryRuntimeLogs,
  subscribeRuntimeLogs,
} from '../../common/observability/runtime-log-buffer.helper';
import { PrismaService } from '../../shared/prisma/service';
import { loadRuntimeKv } from '../../shared/prisma/runtime-kv.util';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';

function formatLocaleString(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
  locale = 'zh-CN',
): string {
  return new Date(date).toLocaleString(locale, options);
}

/**
 * 系统域核心 API（诊断/健康/执行历史/代理等）
 * 首装/备份/顾问已拆至 SystemSetupController / SystemBackupController / SystemAdvisorController。
 */
@ApiTags('system')
@ApiBearerAuth()
@Controller('system')
export class SystemController {
  constructor(
    private readonly systemService: SystemService,
    private readonly moviePilotProxy: MoviePilotProxyService,
    private readonly haConnector: HaConnectorService,
    private readonly stateStore: StateStoreService,
    private readonly wsPush: WsPushGateway,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly databaseRetention: DatabaseRetentionService,
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly deviceManagement: DeviceManagementService,
    private readonly jobs: JobRegistryService,
  ) {}

  @ApiOperation({ summary: '调度作业统一仪表盘（setInterval / Cron 心跳与耗时）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('jobs')
  getJobs() {
    return { success: true, data: this.jobs.list() };
  }

  @ApiOperation({ summary: '聚合运维诊断（HA/实体/WS/资源）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('diagnostics')
  async getDiagnostics() {
    const [host, ha] = await Promise.all([
      this.systemService.getHealth(),
      this.haConnector.getStatus(),
    ]);
    const redisConfigured = Boolean(this.config.get('REDIS_URL'));
    const retentionDays = this.databaseRetention.resolveRetentionDays();
    const staleInfo = this.stateStore.getStaleInfo();
    const entityCount = this.stateStore.getCount();
    const memoryDetail = this.stateStore.getMemoryDiagnostics();
    const driftRepairLastRun = await loadRuntimeKv<{
      startedAt?: string;
      finishedAt?: string;
      repaired?: number;
      failed?: number;
      errors?: string[];
    }>(this.prisma, 'orchestrator-drift-repair');
    return {
      timestamp: new Date().toISOString(),
      host,
      memoryDetail,
      perfSuggestions: buildBackendPerfSuggestions(
        entityCount,
        this.appConfig.get('frontend').workerDerivedThreshold,
      ),
      ha: {
        connected: ha.connected,
        version: ha.ha_version,
        wsLeader: ha.ha_ws_leader,
        wsMode: ha.ha_ws_mode,
        queueLength: ha.queue_length ?? 0,
        queueDroppedTotal: ha.queue_dropped_total ?? 0,
        reconnectCount: ha.reconnect_count ?? 0,
        registryAvailable: ha.connected && !this.haConnector.isRegistryDegraded(),
      },
      entities: { count: entityCount, stale: staleInfo.stale, syncedAt: staleInfo.syncedAt },
      websocket: { clients: this.wsPush.getClientCount() },
      haSyncLatency: getHaSyncLatencySnapshots(),
      haWsDeferredDroppedTotal: getHaWsDeferredDroppedTotal(),
      retention: {
        days: retentionDays,
        skipSensorTimeline: this.appConfig.get('ops').eventLogSkipSensorTimeline !== false,
        note: `事件/环境/用水等历史默认保留 ${retentionDays} 天；查询窗口超过保留期时图表可能不完整`,
      },
      redis: {
        configured: redisConfigured,
        ok: redisConfigured ? this.redis.isReady() : null,
        timelineReady: redisConfigured ? this.redis.isReady() : false,
      },
      driftRepairLastRun: driftRepairLastRun
        ? {
            startedAt: driftRepairLastRun.startedAt || null,
            finishedAt: driftRepairLastRun.finishedAt || null,
            repaired: Number(driftRepairLastRun.repaired) || 0,
            failed: Number(driftRepairLastRun.failed) || 0,
            errorCount: Array.isArray(driftRepairLastRun.errors)
              ? driftRepairLastRun.errors.length
              : 0,
          }
        : null,
      copyText: (() => {
        const latency = getHaSyncLatencySnapshots().filter((s) => s.count > 0);
        const latencyLine = latency.length
          ? `同步延迟: ${latency
              .slice(0, 6)
              .map((s) => `${s.stage} p99=${s.p99}ms`)
              .join(' · ')}`
          : '同步延迟: 暂无样本';
        return [
          `HomeOS 诊断 ${formatLocaleString(new Date())}`,
          `HA: ${ha.connected ? '已连接' : '未连接'} ${ha.ha_version || ''} (${ha.ha_ws_mode || 'standalone'})`,
          `实体: ${this.stateStore.getCount()}`,
          `WS 客户端: ${this.wsPush.getClientCount()}`,
          `Redis: ${redisConfigured ? (this.redis.isReady() ? '就绪' : '未连接') : '未配置'}`,
          `历史保留: ${retentionDays} 天`,
          `传感器时间线: ${this.appConfig.get('ops').eventLogSkipSensorTimeline !== false ? '跳过写入（能耗依赖 Redis/HA 降级）' : '已写入 Redis'}`,
          driftRepairLastRun?.finishedAt
            ? `漂移修复上次: ${driftRepairLastRun.finishedAt} · 修复 ${Number(driftRepairLastRun.repaired) || 0} · 失败 ${Number(driftRepairLastRun.failed) || 0}`
            : '漂移修复: 尚无运行记录',
          latencyLine,
          `HA WS 延期丢弃: ${getHaWsDeferredDroppedTotal()}`,
          `CPU: ${host.cpu}% 内存: ${host.memory}% (${host.memoryMb ?? '?'}/${host.memoryLimitMb ?? '?'} MB, RSS ${host.rssMb ?? '?'} MB) 运行: ${host.uptime}`,
          `实体缓存估算: ~${memoryDetail.estimatedEntityStoreMb} MB · recentChanges ${memoryDetail.recentChangesCount}/${memoryDetail.recentChangesMax}`,
          `DB: ${host.dbSize}`,
        ].join('\n');
      })(),
    };
  }

  @ApiOperation({ summary: '后端运行日志（进程内环形缓冲，admin）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('runtime-logs')
  getRuntimeLogs(
    @Query('limit') limit?: string,
    @Query('level') level?: string,
    @Query('q') q?: string,
    @Query('context') context?: string,
    @Query('afterId') afterId?: string,
  ) {
    return queryRuntimeLogs({
      limit: limit ? parseInt(limit, 10) : undefined,
      level,
      q,
      context,
      afterId: afterId ? parseInt(afterId, 10) : undefined,
    });
  }

  @ApiOperation({ summary: '后端运行日志 SSE 推送（admin，Cookie 鉴权）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Sse('runtime-logs/stream')
  streamRuntimeLogs(
    @Query('level') level?: string,
    @Query('q') q?: string,
    @Query('context') context?: string,
    @Query('afterId') afterId?: string,
  ): Observable<MessageEvent> {
    const filter = { level, q, context };
    const after = parseIntParam(afterId, 0);
    const HEARTBEAT_MS = 15_000;

    return new Observable<MessageEvent>((subscriber) => {
      // 先推增量缺口，再订阅实时写入
      const backlog = queryRuntimeLogs({
        ...filter,
        afterId: Number.isFinite(after) && after > 0 ? after : undefined,
        limit: 200,
      });
      for (const item of backlog.items) {
        subscriber.next({ type: 'log', data: item } as MessageEvent);
      }
      subscriber.next({
        type: 'meta',
        data: getRuntimeLogMeta(),
      } as MessageEvent);

      const unsub = subscribeRuntimeLogs((entry) => {
        if (!matchesRuntimeLogFilter(entry, filter)) return;
        subscriber.next({ type: 'log', data: entry } as MessageEvent);
      });

      const heartbeat = setInterval(() => {
        subscriber.next({
          type: 'ping',
          data: getRuntimeLogMeta(),
        } as MessageEvent);
      }, HEARTBEAT_MS);

      return () => {
        clearInterval(heartbeat);
        unsub();
      };
    });
  }

  @ApiOperation({ summary: '清空后端运行日志缓冲（admin）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('runtime-logs')
  deleteRuntimeLogs() {
    return clearRuntimeLogs();
  }

  @ApiOperation({ summary: '设备管理总览：僵尸绑定列表（按来源分组）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('devices')
  getDevicesOverview() {
    return this.deviceManagement.getDevicesOverview();
  }

  @ApiOperation({ summary: '批量解绑僵尸绑定（布局 Widget / 房间绑定 / 告警规则 / 寿命统计，幂等）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('devices/unbind')
  unbindZombies(@Body() body: ZombieUnbindRequest) {
    return this.deviceManagement.unbindZombies(body);
  }

  @ApiOperation({ summary: '获取系统版本信息' })
  @UseGuards(JwtAuthGuard)
  @Get('info')
  async getSystemInfo() {
    return await this.systemService.getSystemInfo();
  }

  @ApiOperation({ summary: '获取系统健康状态' })
  @UseGuards(JwtAuthGuard)
  @Get('health')
  async getHealth() {
    return await this.systemService.getHealth();
  }

  @ApiOperation({
    summary: '获取跨端网络与远程访问信息（内网地址 / 公网 IPv4·IPv6 / 端口回退）',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('network-info')
  async getNetworkInfo(@Req() req: Request) {
    return await this.systemService.getNetworkInfo({
      headers: req.headers as unknown as Record<string, unknown>,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('img/0')
  async proxyImage(@Query('imgurl') imgUrl: string, @Req() req: Request, @Res() res: Response) {
    if (!imgUrl) {
      return res.status(400).send('需要提供 imgurl 查询参数');
    }
    await this.moviePilotProxy.proxyImage(imgUrl, req.headers, res);
  }

}
