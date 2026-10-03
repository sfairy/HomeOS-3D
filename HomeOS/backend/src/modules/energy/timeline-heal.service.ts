/**
 * @file energy/timeline-heal.service.ts
 * @module backend/src/modules
 *
 * 能源时间线自愈服务：Redis 离线 / 空窗时从 HA history 回填 timeline:entity:*。
 *
 * 工作机制：
 *  - 手动 API：healFromHaHistory 按指定 entityId 与窗口回填，供前端「自愈」按钮调用。
 *  - 自动调度：每 6 小时（cron）对配置 / 识别出的能耗实体回填最近 24h，
 *    补齐 Redis 空窗或离线时段的能耗曲线，前端图表不再出现空洞。
 *  - 分布式锁：runExclusive 防止多副本 / 多 Leader 场景下重叠回填打爆 HA history。
 *  - 回填来源：HA Recorder /api/history/period，按 last_changed 提取状态点。
 */
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '../../shared/redis/service';
import { AppConfigService } from '../../shared/app-config/service';
import { StateStoreService } from '../state-store/service';
import { HaConnectorService } from '../ha-connector/service';
import { DistributedLockService } from '../../common/resilience/distributed-lock.service';
import { getErrorMessage } from '../../common/utils';

/** 自动回填窗口（小时）：回填最近 24 小时 */
const AUTO_HEAL_HOURS = 24;

/**
 * 能源时间线自愈服务（@Injectable）。
 * 通过 HA history 与 Redis pipeline 批量 zadd 回填 timeline，避免逐点请求。
 */
@Injectable()
export class EnergyTimelineHealService {
  private readonly logger = new Logger(EnergyTimelineHealService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly haConnector: HaConnectorService,
    private readonly appConfig: AppConfigService,
    private readonly stateStore: StateStoreService,
    private readonly lock: DistributedLockService,
  ) {}

  /**
   * 自动回填调度：每 6 小时对配置/识别出的能耗实体回填最近 24h 时间线，
   * 补齐 Redis 空窗或离线时段的能耗曲线（前端图表不再出现空洞）。
   * 分布式锁防止多副本/多 Leader 场景下重叠回填打爆 HA history。
   */
  @Cron('0 */6 * * *')
  async autoHealCron() {
    try {
      await this.lock.runExclusive(
        'energy-timeline-auto-heal',
        async () => {
          const entityIds = this.collectEntityIds();
          if (!entityIds.length) return;
          const start = Date.now();
          let written = 0;
          for (const entityId of entityIds) {
            try {
              const r = await this.healFromHaHistory(entityId, AUTO_HEAL_HOURS);
              written += r.written;
            } catch (err) {
              this.logger.debug(`自动回填失败 [${entityId}]: ${getErrorMessage(err)}`);
            }
          }
          if (written > 0) {
            this.logger.log(
              `能源时间线自动回填完成: ${entityIds.length} 个实体,写入 ${written} 点(${Date.now() - start}ms)`,
            );
          }
        },
        30 * 60_000,
      );
    } catch (err) {
      if (err instanceof ConflictException) return; // 其他实例持有锁，跳过本轮
      this.logger.warn(`能源时间线自动回填失败: ${getErrorMessage(err)}`);
    }
  }

  /** 收集需要回填的能耗实体：主电表 + 分路 + 太阳能/储能/功率传感器 */
  private collectEntityIds(): string[] {
    const ids = new Set<string>();
    const energy = this.appConfig.get('energy');
    if (energy.meterEntityId?.trim()) ids.add(energy.meterEntityId.trim());
    for (const id of energy.circuitEntityIds || []) {
      if (String(id || '').trim()) ids.add(String(id).trim());
    }
    // 关键词识别太阳能/储能/功率/电表传感器（上限避免批量回填过大）
    let scanned = 0;
    for (const e of this.stateStore.getAll('sensor')) {
      if (scanned >= 200) break;
      scanned++;
      const eid = e.entity_id || '';
      if (ids.has(eid)) continue;
      if (/energy|kwh|power_meter|electricity|solar|光伏|储能|battery_power|发电|电表/i.test(eid)) {
        ids.add(eid);
      }
    }
    return [...ids].slice(0, 40);
  }

  /**
   * 从 HA Recorder 回填实体能耗时间线。
   * @returns 写入点数与跳过原因
   */
  async healFromHaHistory(
    entityId: string,
    hours = 24,
  ): Promise<{
    entityId: string;
    hours: number;
    written: number;
    redisReady: boolean;
    method: 'ha_history' | 'unavailable';
    message?: string;
  }> {
    if (!entityId) {
      return {
        entityId,
        hours,
        written: 0,
        redisReady: this.redis.isReady(),
        method: 'unavailable',
        message: 'entityId 必填',
      };
    }
    if (!this.redis.isReady()) {
      return {
        entityId,
        hours,
        written: 0,
        redisReady: false,
        method: 'unavailable',
        message: 'Redis 未就绪，无法回填时间线',
      };
    }

    const client = this.redis.getClient();
    if (!client) {
      return {
        entityId,
        hours,
        written: 0,
        redisReady: false,
        method: 'unavailable',
        message: 'Redis 客户端不可用',
      };
    }

    let history: unknown;
    try {
      history = await this.haConnector.fetchHistory([entityId], hours);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      this.logger.warn(`HA history 拉取失败: ${msg}`);
      return {
        entityId,
        hours,
        written: 0,
        redisReady: true,
        method: 'unavailable',
        message: msg,
      };
    }

    const points = this.extractPoints(entityId, history);
    if (points.length === 0) {
      return {
        entityId,
        hours,
        written: 0,
        redisReady: true,
        method: 'ha_history',
        message: 'HA 无可用历史点',
      };
    }

    const entityKey = `timeline:entity:${entityId}`;
    const timelineMax = 5000;
    const pipeline = client.pipeline();
    for (const p of points) {
      const snapshot = JSON.stringify({
        entity_id: entityId,
        state: p.state,
        last_changed: p.ts,
        source: 'energy_heal',
      });
      const score = new Date(p.ts).getTime();
      if (!Number.isFinite(score)) continue;
      pipeline.zadd(entityKey, score, snapshot);
    }
    if (timelineMax > 0) {
      pipeline.zremrangebyrank(entityKey, 0, -(timelineMax + 1));
    }
    await pipeline.exec();

    this.logger.log(`能源时间线自愈完成: ${entityId} 写入 ${points.length} 点(${hours}h)`);
    return {
      entityId,
      hours,
      written: points.length,
      redisReady: true,
      method: 'ha_history',
    };
  }

  private extractPoints(
    entityId: string,
    history: unknown,
  ): Array<{ ts: string; state: string }> {
    const out: Array<{ ts: string; state: string }> = [];
    // HA history 常见形状：[[{entity_id, state, last_changed, ...}, ...]]
    const outer = Array.isArray(history) ? history : [];
    for (const series of outer) {
      const rows = Array.isArray(series) ? series : [];
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const r = row as {
          entity_id?: string;
          state?: string;
          last_changed?: string;
          last_updated?: string;
        };
        if (r.entity_id && r.entity_id !== entityId) continue;
        const ts = r.last_changed || r.last_updated;
        if (!ts || r.state == null) continue;
        out.push({ ts: String(ts), state: String(r.state) });
      }
    }
    return out;
  }
}
