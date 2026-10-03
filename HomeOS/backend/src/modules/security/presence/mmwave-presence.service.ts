/**
 * 所属模块：backend/modules/security/presence
 * 职责：
 *  - 毫米波存在感知服务；
 * 关键依赖：
 *  - shared/ha state-pipeline；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { inferRoomIdFromEntityId } from '@homeos/shared';
import { EventBusService } from '../../../shared/redis/event-bus.service';
import type { HaStateChangeBatchEvent, HaStateChangeEvent } from '../../../shared/types';
import { HA_EVENTS } from '../../../shared/types';
import { forEachColdBatchEvent } from '../../../shared/ha/cold-batch.util';

/** 单个 mmWave 传感器的实时状态 */
interface SensorPresence {
  room: string;
  entityId: string;
  sensorModel: string;
  /** 传感器原始判定（不含离场防抖） */
  rawOccupied: boolean;
  /** 对外展示：含离场防抖 */
  occupied: boolean;
  stationary: boolean;
  moving: boolean;
  distance: number | null;
  energy: number;
  lastChanged: string;
  occupiedDuration: number;
}

/**
 * mmWave 毫米波雷达房间存在检测服务
 *
 * 同房间多传感器：任一传感器 occupied → 房间有人（OR 融合）
 */
@Injectable()
export class MmWavePresenceService implements OnModuleDestroy {
  private readonly logger = new Logger(MmWavePresenceService.name);

  /** entityId → 传感器状态 */
  private readonly sensors = new Map<string, SensorPresence>();
  /** 离场防抖定时器（按 entityId） */
  private readonly offTimers = new Map<string, NodeJS.Timeout>();

  private readonly OCCUPIED_TIMEOUT = 30_000;

  constructor(private readonly eventBus: EventBusService) {}

  onModuleDestroy() {
    for (const t of this.offTimers.values()) clearTimeout(t);
    this.offTimers.clear();
    this.sensors.clear();
  }

  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  handleStateChange(payload: HaStateChangeBatchEvent) {
    forEachColdBatchEvent(payload, (event) => {
      const snap = { entity_id: event?.entity_id, new_state: event?.new_state };
      setImmediate(() => this._handleStateChange(snap));
    });
  }

  private _handleStateChange(event: Pick<HaStateChangeEvent, 'entity_id' | 'new_state'>) {
    const entityId: string = event?.entity_id || '';
    const state = event?.new_state?.state;
    const attrs = event?.new_state?.attributes as Record<string, unknown> | undefined;

    if (!state || !attrs) return;

    const model = this.identifyModel(entityId, attrs);
    if (!model) return;

    const room = this.inferRoom(entityId, attrs);
    const now = Date.now();

    const occupied =
      state === 'on' || state === 'detected' || state === 'occupied' || state === 'home';
    const moving =
      attrs.moving === true ||
      attrs.motion_detected === true ||
      state === 'moving' ||
      state === 'motion';
    const stationary =
      attrs.stationary === true ||
      attrs.still === true ||
      state === 'stationary' ||
      state === 'still';
    const distance =
      attrs.distance != null
        ? parseFloat(String(attrs.distance))
        : attrs.target_distance != null
          ? parseFloat(String(attrs.target_distance))
          : null;
    const energy =
      attrs.motion_energy != null
        ? parseFloat(String(attrs.motion_energy))
        : attrs.energy != null
          ? parseFloat(String(attrs.energy))
          : moving
            ? 100
            : 0;

    const rawOccupied = occupied || moving || stationary;
    const existing = this.sensors.get(entityId);
    const wasRoomOccupied = this.isRoomOccupied(room);

    const clearOffTimer = () => {
      const t = this.offTimers.get(entityId);
      if (t) {
        clearTimeout(t);
        this.offTimers.delete(entityId);
      }
    };

    if (rawOccupied) {
      clearOffTimer();
      const presence: SensorPresence = {
        room,
        entityId,
        sensorModel: model,
        rawOccupied: true,
        occupied: true,
        stationary,
        moving,
        distance,
        energy,
        lastChanged: new Date(now).toISOString(),
        occupiedDuration: existing?.occupiedDuration || 0,
      };
      if (existing?.lastChanged && existing.rawOccupied) {
        presence.occupiedDuration =
          (existing.occupiedDuration || 0) +
          (now - new Date(existing.lastChanged).getTime()) / 1000;
      }
      this.sensors.set(entityId, presence);

      if (!wasRoomOccupied) {
        this.logger.log(`👤 ${room} 人员入场 (${model})`);
        this.eventBus.emit('presence.roomChanged', { room, occupied: true, sensor: model });
      }
      return;
    }

    // 离场：该传感器防抖期间仍计为 occupied，直至超时或重新检测到人
    clearOffTimer();
    const debounced: SensorPresence = {
      room,
      entityId,
      sensorModel: model,
      rawOccupied: false,
      occupied: true,
      stationary: false,
      moving: false,
      distance,
      energy: 0,
      lastChanged: new Date(now).toISOString(),
      occupiedDuration: existing?.occupiedDuration || 0,
    };
    this.sensors.set(entityId, debounced);

    const offTimer = setTimeout(() => {
      const current = this.sensors.get(entityId);
      if (!current || current.rawOccupied) return;
      current.occupied = false;
      current.occupiedDuration = 0;
      this.sensors.set(entityId, current);
      this.offTimers.delete(entityId);
      if (!this.isRoomOccupied(room)) {
        this.logger.log(`🚶 ${room} 人员离场 (${model})`);
        this.eventBus.emit('presence.roomChanged', { room, occupied: false, sensor: model });
      }
    }, this.OCCUPIED_TIMEOUT);
    this.offTimers.set(entityId, offTimer);
  }

  private isRoomOccupied(room: string): boolean {
    for (const s of this.sensors.values()) {
      if (s.room === room && s.occupied) return true;
    }
    return false;
  }

  private fuseRoom(room: string) {
    const inRoom = [...this.sensors.values()].filter((s) => s.room === room);
    if (!inRoom.length) return null;
    const occupied = inRoom.some((s) => s.occupied);
    const primary = inRoom.reduce(
      (best, s) => (s.lastChanged > best.lastChanged ? s : best),
      inRoom[0],
    );
    return {
      occupied,
      stationary: occupied && inRoom.some((s) => s.stationary),
      moving: occupied && inRoom.some((s) => s.moving),
      sensorModel: primary.sensorModel,
      distance: primary.distance,
      duration: Math.round(Math.max(...inRoom.map((s) => s.occupiedDuration))),
      sensorCount: inRoom.length,
    };
  }

  private identifyModel(entityId: string, attrs: Record<string, unknown>): string | null {
    const id = entityId.toLowerCase();
    const deviceClass = (attrs.device_class as string) || '';
    const model = ((attrs.model as string) || '').toLowerCase();

    if (id.includes('ld2450') || model.includes('ld2450')) return 'ld2450';
    if (id.includes('ld2410') || model.includes('ld2410') || model.includes('hlk')) return 'ld2410';
    if (id.includes('ld1115') || model.includes('ld1115')) return 'ld1115';
    if (id.includes('fp2') || model.includes('fp2') || (id.includes('aqara') && id.includes('fp')))
      return 'aqara_fp2';
    if (id.includes('fp1') || model.includes('fp1') || model.includes('aqara_fp'))
      return 'aqara_fp1';
    if (
      id.includes('tuya') &&
      (id.includes('presence') || id.includes('mmwave') || id.includes('人体'))
    )
      return 'tuya_mmwave';

    if (id.includes('mmwave') || id.includes('presence_sensor') || id.includes('人体存在')) {
      if (deviceClass === 'motion' || deviceClass === 'occupancy' || deviceClass === 'presence')
        return 'generic_mmwave';
    }

    return null;
  }

  private inferRoom(entityId: string, _attrs: Record<string, unknown>): string {
    const fromCatalog = inferRoomIdFromEntityId(entityId);
    if (fromCatalog) return fromCatalog;
    const sensorName = entityId.replace(/^(binary_sensor|sensor)\./, '');
    return sensorName.replace(/_(presence|mmwave|occupancy|motion|ld2410|ld2450|fp1|fp2)$/i, '');
  }

  getAllRoomPresence() {
    const rooms = new Set([...this.sensors.values()].map((s) => s.room));
    const result: Record<
      string,
      {
        occupied: boolean;
        stationary: boolean;
        moving: boolean;
        sensorModel: string;
        distance: number | null;
        duration: number;
        sensorCount: number;
      }
    > = {};
    for (const room of rooms) {
      const fused = this.fuseRoom(room);
      if (fused) result[room] = fused;
    }
    return result;
  }

  getRoomPresence(room: string) {
    return this.fuseRoom(room);
  }

  getSummary() {
    const all = this.getAllRoomPresence();
    const occupied = Object.entries(all).filter(([, v]) => v.occupied);
    return {
      totalRooms: Object.keys(all).length,
      occupiedRooms: occupied.length,
      vacantRooms: Object.keys(all).length - occupied.length,
      rooms: all,
      homeOccupied: occupied.length > 0,
      timestamp: new Date().toISOString(),
    };
  }
}
