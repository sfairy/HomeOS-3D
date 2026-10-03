/**
 * @file env-sensor-map-ha-sync.service.ts
 * @module environment
 * @description 环境传感器映射与 HA 区域同步服务。HA 连接后过滤 envSensorMap，
 * 仅保留 HA 中存在的 area_id 键，移除孤立房间条目，避免环境健康服务读到失效的传感器映射。
 *
 * 同步策略：
 *  - HA CONNECTED 事件触发，幂等去重（inflight 合并并发请求）
 *  - 仅在 envSensorMap 内容发生变化时才写回 AppConfig，减少无效持久化
 *
 * 依赖：
 *  - AppConfigService：读取 / 更新 envSensorMap 配置
 *  - EntityAreaEnrichmentService：HA area 列表来源
 */
import { getErrorMessage } from '../../common/utils';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { filterEnvSensorMapToKnownAreas, type EnvSensorMap } from '@homeos/shared';
import { AppConfigService } from '../../shared/app-config/service';
import type { AppConfigData } from '../../shared/app-config/types';
import { EntityAreaEnrichmentService } from '../state-store/entity-area-enrichment.service';
import { HA_EVENTS } from '../../shared/types';

function envSensorMapChanged(before: EnvSensorMap, after: EnvSensorMap): boolean {
  const beforeKeys = Object.keys(before).sort();
  const afterKeys = Object.keys(after).sort();
  if (beforeKeys.join('\0') !== afterKeys.join('\0')) return true;
  for (const key of afterKeys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) return true;
  }
  return false;
}

/** HA 连接后过滤 envSensorMap，移除非 area_id 键并持久化 */
@Injectable()
export class EnvSensorMapHaSyncService {
  private readonly logger = new Logger(EnvSensorMapHaSyncService.name);
  private inflight: Promise<boolean> | null = null;

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly entityAreaEnrichment: EntityAreaEnrichmentService,
  ) {}

  @OnEvent(HA_EVENTS.CONNECTED)
  onHaConnected(): void {
    void this.syncIfNeeded().catch((err: unknown) => {
      const msg = getErrorMessage(err);
      this.logger.debug(`环境传感器映射过滤跳过: ${msg}`);
    });
  }

  async syncIfNeeded(): Promise<boolean> {
    if (this.inflight) return this.inflight;
    this.inflight = this.runSync().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async runSync(): Promise<boolean> {
    await this.entityAreaEnrichment.ensureLoaded();
    const haAreas = this.entityAreaEnrichment.getCachedHaAreas();
    if (!haAreas.length) return false;

    const current = this.appConfig.get('envSensorMap') as EnvSensorMap;
    const filtered = filterEnvSensorMapToKnownAreas(current, haAreas);
    if (!envSensorMapChanged(current, filtered)) return false;

    await this.appConfig.update({
      envSensorMap: filtered as AppConfigData['envSensorMap'],
    });
    this.logger.log(`环境传感器映射已同步 HA area_id(${Object.keys(filtered).length} 个房间)`);
    return true;
  }
}
