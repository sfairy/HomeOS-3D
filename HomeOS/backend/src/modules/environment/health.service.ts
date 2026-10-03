/**
 * @file health.service.ts
 * @module environment
 * @description 环境健康监测服务。订阅 HA 状态变更，按房间聚合温湿度 / PM2.5 / CO2 / TVOC 读数，
 * 实时计算露点温度、霉菌滋生风险与 IAQ 综合指数，并按冷却时间窗推送 ENV_MOLD_RISK / ENV_IAQ_THRESHOLD 事件。
 *
 * 关键策略：
 *  - 房间识别：envSensorMap 显式绑定优先，其次 area_id，再次实体 ID 关键词推断
 *  - 温度归一化：华氏读数自动换算为摄氏，避免单位不一致污染历史数据
 *  - 露点使用 Magnus 公式；rh=0 钳到 0.1 防止 log(0) 产生 NaN
 *  - 风险等级：Lv1 提示 / Lv2 高风险 / Lv3 极度潮湿；Lv2+ 才发事件
 *  - IAQ 超阈值事件按 emitCooldown 节流，避免高频告警
 *
 * 依赖：
 *  - AppConfigService：envSensorMap / iaq 配置（含告警冷却与阈值）
 *  - EntityAreaEnrichmentService：HA area 列表，用于按 area_id 解析房间
 *  - EnvironmentHistoryService：每次读数更新内存最新值，供趋势与季节性建议消费
 *  - IaqService：综合指数计算
 *  - EventBusService：跨实例广播霉菌 / IAQ 阈值事件
 *  - HaStateChangeRouterService：按订阅分发 HA 状态变更，过滤非环境域事件
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  inferRoomIdFromEntityId,
  isRoomHiddenInMap,
  findHaAreaForCatalogRoom,
} from '@homeos/shared';
import {
  AppConfigService,
  APP_CONFIG_UPDATED,
} from '../../shared/app-config/service';
import { EntityAreaEnrichmentService } from '../state-store/entity-area-enrichment.service';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { HaStateChangeRouterService } from '../../shared/ha/state-change-router.service';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';
import { EnvironmentHistoryService } from './history.service';
import { IaqService } from './iaq.service';
import { HA_EVENTS } from '../../shared/types';
import type { HaStateChangeBatchEvent } from '../../shared/types';
import { forEachColdBatchEvent } from '../../shared/ha/cold-batch.util';

interface RoomReading {
  temperature: number | null;
  humidity: number | null;
  pm25: number | null;
  co2: number | null;
  tvoc: number | null;
  dewPoint: number | null;
  lastUpdated: number;
}

/**
 * 环境健康监测服务
 *
 * 实时计算房间露点温度，预警霉菌滋生风险。
 */
@Injectable()
export class EnvironmentHealthService implements OnModuleInit {
  private readonly logger = new Logger(EnvironmentHealthService.name);
  private rooms = new Map<string, RoomReading>();
  private lastEmit = new Map<string, number>();
  private lastIaqEmit = new Map<string, number>();

  private get emitCooldown() {
    return this.appConfig.get('iaq').moldAlertCooldownMin * 60_000;
  }

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly history: EnvironmentHistoryService,
    private readonly eventBus: EventBusService,
    private readonly iaqService: IaqService,
    private readonly stateRouter: HaStateChangeRouterService,
    private readonly entityAreaEnrichment: EntityAreaEnrichmentService,
  ) {}

  private readonly MAGNUS_A = 17.27;
  private readonly MAGNUS_B = 237.7;

  onModuleInit() {
    this.logger.log('环境健康监测已启动');
  }

  @OnEvent(APP_CONFIG_UPDATED)
  onConfigUpdated(sections: string[]) {
    if (!Array.isArray(sections) || !sections.includes('envSensorMap')) return;
    this.rooms.clear();
    this.lastEmit.clear();
    this.lastIaqEmit.clear();
  }

  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  handleStateChange(payload: HaStateChangeBatchEvent) {
    forEachColdBatchEvent(payload, (event) => {
    if (!this.stateRouter.shouldProcess('environment', event)) return;
    const entityId = event.entity_id;
    const state = event.new_state?.state;
    const attrs = event.new_state?.attributes as Record<string, unknown> | undefined;
    if (!state || !attrs) return;

    const deviceClass = attrs.device_class as string | undefined;
    const areaId = typeof attrs.area_id === 'string' ? attrs.area_id : undefined;
    const roomId = this.resolveRoom(entityId, areaId);
    if (!roomId) return;

    let reading = this.rooms.get(roomId);
    if (!reading) {
      reading = {
        temperature: null,
        humidity: null,
        pm25: null,
        co2: null,
        tvoc: null,
        dewPoint: null,
        lastUpdated: 0,
      };
      this.rooms.set(roomId, reading);
    }

    const val = parseFloat(state);
    if (isNaN(val)) return;

    const sensorRole = this.resolveSensorRole(entityId, roomId);
    const metric =
      sensorRole ??
      (deviceClass === 'temperature'
        ? 'temperature'
        : deviceClass === 'humidity'
          ? 'humidity'
          : deviceClass === 'pm25' || deviceClass === 'pm2_5'
            ? 'pm25'
            : deviceClass === 'carbon_dioxide'
              ? 'co2'
              : deviceClass === 'volatile_organic_compounds' || deviceClass === 'voc'
                ? 'tvoc'
                : null);
    if (!metric) return;

    if (metric === 'temperature') {
      reading.temperature = this.normalizeTemperatureCelsius(
        val,
        attrs.unit_of_measurement ?? attrs.native_unit_of_measurement,
      );
    } else if (metric === 'humidity') {
      reading.humidity = val;
    } else if (metric === 'pm25') {
      reading.pm25 = val;
    } else if (metric === 'co2') {
      reading.co2 = val;
    } else if (metric === 'tvoc') {
      reading.tvoc = val;
    } else return;

    reading.lastUpdated = Date.now();

    if (reading.temperature != null && reading.humidity != null) {
      reading.dewPoint = this.calcDewPoint(reading.temperature, reading.humidity);
      const risk = this.evaluateRisk(reading.temperature, reading.humidity, reading.dewPoint);
      const iaqResult = this.iaqService.compute({
        pm25: reading.pm25,
        co2: reading.co2,
        tvoc: reading.tvoc,
        temperature: reading.temperature,
        humidity: reading.humidity,
      });
      if (risk) {
        const now = Date.now();
        const last = this.lastEmit.get(roomId) || 0;
        if (now - last >= this.emitCooldown) {
          this.lastEmit.set(roomId, now);
          this.logger.warn(
            `霉菌风险 [${roomId}] Lv${risk.level}: T=${reading.temperature}°C RH=${reading.humidity}% Td=${reading.dewPoint.toFixed(1)}°C - ${risk.message}`,
          );
          if (risk.level >= 2) {
            this.eventBus.emit(HOMEOS_EVENTS.ENV_MOLD_RISK, {
              roomId,
              level: risk.level,
              message: risk.message,
              temperature: reading.temperature,
              humidity: reading.humidity,
              dewPoint: reading.dewPoint,
            });
          }
        }
      }
      this.history.updateReading(roomId, {
        temperature: reading.temperature,
        humidity: reading.humidity,
        dewPoint: reading.dewPoint,
        pm25: reading.pm25 ?? undefined,
        co2: reading.co2 ?? undefined,
        tvoc: reading.tvoc ?? undefined,
        iaqScore: iaqResult.iaq ?? undefined,
        moldRisk:
          risk?.level == null
            ? undefined
            : risk.level === 1
              ? 'medium'
              : 'high',
      });
      this.maybeEmitIaqThreshold(roomId, iaqResult.iaq);
    } else if (reading.pm25 != null || reading.co2 != null || reading.tvoc != null) {
      const iaqResult = this.iaqService.compute({
        pm25: reading.pm25,
        co2: reading.co2,
        tvoc: reading.tvoc,
        temperature: reading.temperature,
        humidity: reading.humidity,
      });
      this.history.updateReading(roomId, {
        pm25: reading.pm25 ?? undefined,
        co2: reading.co2 ?? undefined,
        tvoc: reading.tvoc ?? undefined,
        iaqScore: iaqResult.iaq ?? undefined,
      });
      this.maybeEmitIaqThreshold(roomId, iaqResult.iaq);
    }
    });
  }

  private maybeEmitIaqThreshold(roomId: string, iaq: number | null | undefined) {
    if (iaq == null) return;
    const threshold = this.appConfig.get('iaq').iaqAlertThreshold ?? 60;
    if (iaq <= threshold) return;
    const now = Date.now();
    const last = this.lastIaqEmit.get(roomId) || 0;
    if (now - last < this.emitCooldown) return;
    this.lastIaqEmit.set(roomId, now);
    this.eventBus.emit(HOMEOS_EVENTS.ENV_IAQ_THRESHOLD, {
      roomId,
      iaq,
      threshold,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 将 HA 温度读数统一为摄氏度（°F / Fahrenheit → °C）。
   * 未标注单位时原样返回，避免误伤已是摄氏的传感器。
   */
  private normalizeTemperatureCelsius(val: number, unitRaw: unknown): number {
    const unit = String(unitRaw || '')
      .toLowerCase()
      .replace(/\s/g, '');
    if (
      unit === '°f' ||
      unit === 'f' ||
      unit === 'fahrenheit' ||
      unit.includes('°f')
    ) {
      return Math.round((((val - 32) * 5) / 9) * 10) / 10;
    }
    return val;
  }

  /** 判断实体在 envSensorMap 中的角色 */
  private resolveSensorRole(
    entityId: string,
    roomId: string,
  ): 'temperature' | 'humidity' | 'pm25' | 'co2' | 'tvoc' | null {
    const sensors = this.appConfig.get('envSensorMap')[roomId];
    if (!sensors) return null;
    if (sensors.temperature === entityId) return 'temperature';
    if (sensors.humidity === entityId) return 'humidity';
    if (sensors.pm25 === entityId) return 'pm25';
    if (sensors.co2 === entityId) return 'co2';
    if (sensors.tvoc === entityId) return 'tvoc';
    return null;
  }

  calcDewPoint(temp: number, rh: number): number {
    // rh=0 时 Math.log(0)=-Infinity 会使露点变成 NaN 泄漏进历史读取，钳到 (0.1, 100]
    const clampedRh = Math.min(Math.max(rh, 0.1), 100);
    const a = this.MAGNUS_A;
    const b = this.MAGNUS_B;
    const gamma = Math.log(clampedRh / 100) + (a * temp) / (b + temp);
    return (b * gamma) / (a - gamma);
  }

  private evaluateRisk(
    temp: number,
    rh: number,
    dewPoint: number,
  ): { level: number; message: string } | null {
    const delta = temp - dewPoint;

    if (rh > 85) {
      return { level: 3, message: '极度潮湿，霉菌高发风险！建议立即除湿' };
    }
    if (rh > 75) {
      return {
        level: 2,
        message: `湿度偏高 (${rh}%)，露点差 ${delta.toFixed(1)}°C，持续将滋生霉菌`,
      };
    }
    if (rh > 65 && delta < 3) {
      return { level: 1, message: `露点接近室温 (差 ${delta.toFixed(1)}°C)，注意通风防潮` };
    }
    if (delta < 1.5) {
      return { level: 2, message: '结露风险！墙壁可能凝结水珠' };
    }
    return null;
  }

  private resolveRoom(entityId: string, areaId?: string): string | null {
    const map = this.appConfig.get('envSensorMap');
    for (const [roomId, sensors] of Object.entries(map)) {
      if (!sensors || isRoomHiddenInMap(map, roomId)) continue;
      if (
        sensors.temperature === entityId ||
        sensors.humidity === entityId ||
        sensors.pm25 === entityId ||
        sensors.co2 === entityId ||
        sensors.tvoc === entityId
      ) {
        return roomId;
      }
    }

    const trimmedAreaId = String(areaId || '').trim();
    if (trimmedAreaId && !isRoomHiddenInMap(map, trimmedAreaId)) {
      return trimmedAreaId;
    }

    const inferred = inferRoomIdFromEntityId(entityId);
    if (!inferred || isRoomHiddenInMap(map, inferred)) return null;

    const haAreas = this.entityAreaEnrichment.getCachedHaAreas();
    const haArea = haAreas.length ? findHaAreaForCatalogRoom(inferred, haAreas) : undefined;
    if (haArea && !isRoomHiddenInMap(map, haArea.id)) return haArea.id;

    return inferred;
  }

  getSensorMap() {
    const map = this.appConfig.get('envSensorMap');
    const visible: Record<string, unknown> = {};
    for (const [roomId, entry] of Object.entries(map)) {
      if (!isRoomHiddenInMap(map, roomId)) visible[roomId] = entry;
    }
    return visible;
  }

  getAllReadings() {
    const map = this.appConfig.get('envSensorMap');
    const result: Record<
      string,
      {
        temperature: number | null;
        humidity: number | null;
        pm25: number | null;
        co2: number | null;
        tvoc: number | null;
        dewPoint: number | null;
        risk: string;
      }
    > = {};
    for (const [room, r] of this.rooms) {
      if (isRoomHiddenInMap(map, room)) continue;
      if (r.temperature != null && r.humidity != null && r.dewPoint != null) {
        const risk = this.evaluateRisk(r.temperature, r.humidity, r.dewPoint);
        result[room] = {
          temperature: r.temperature,
          humidity: r.humidity,
          pm25: r.pm25,
          co2: r.co2,
          tvoc: r.tvoc,
          dewPoint: Math.round(r.dewPoint * 10) / 10,
          risk: risk ? `Lv${risk.level}` : 'safe',
        };
      } else if (r.pm25 != null || r.co2 != null || r.tvoc != null) {
        result[room] = {
          temperature: r.temperature,
          humidity: r.humidity,
          pm25: r.pm25,
          co2: r.co2,
          tvoc: r.tvoc,
          dewPoint: r.dewPoint,
          risk: 'partial',
        };
      }
    }
    return result;
  }
}
