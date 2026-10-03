/**
 * @file room-context.service.ts
 * @module backend/src/modules
 *
 * 统一房间 context 总线：聚合 person/tracker、mmWave、motion 三类信号
 * 输出房间占用快照（anyoneHome + 各房间 occupied/source/lastMotionAt）。
 *
 * 信号优先级：mmWave（精确）> motion（被动红外）> person/tracker（人员位置）。
 * 仅 Leader 实例处理 HA 状态变更并广播 ROOM_CONTEXT，Follower 仅本地维护 bridged 事件。
 * 对外暴露 resolveRoom 把实体解析到房间 / HA area，供 anomaly-detection 等复用。
 */
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { resolveEntityArea } from '@homeos/shared';
import { HA_EVENTS, type HaStateChangeBatchEvent } from '../../../shared/types';
import { forEachColdBatchEvent } from '../../../shared/ha/cold-batch.util';
import { HOMEOS_EVENTS } from '../../../shared/homeos-events';
import { EventBusService } from '../../../shared/redis/event-bus.service';
import { HaWsLeaderService } from '../../ha-connector/ha-ws-leader.service';
import { PresenceService } from './service';
import { StateStoreService } from '../../state-store/service';
import { EntityAreaEnrichmentService } from '../../state-store/entity-area-enrichment.service';

/** 单个房间的上下文条目 */
interface RoomContextEntry {
  room: string;
  occupied: boolean;
  source: 'mmwave' | 'motion' | 'person' | 'unknown';
  lastMotionAt: number | null;
  updatedAt: number;
}

/** 房间上下文对外快照（含是否有人在家 + 各房间条目） */
export interface RoomContextSnapshot {
  anyoneHome: boolean;
  rooms: Record<string, RoomContextEntry>;
  updatedAt: number;
}

/**
 * 统一房间 context bus — 聚合 person/tracker、mmWave、motion
 */
@Injectable()
export class RoomContextService {
  private readonly logger = new Logger(RoomContextService.name);
  private readonly rooms = new Map<string, RoomContextEntry>();

  constructor(
    private readonly eventBus: EventBusService,
    private readonly presence: PresenceService,
    private readonly haLeader: HaWsLeaderService,
    @Inject(forwardRef(() => StateStoreService))
    private readonly stateStore: StateStoreService,
    @Inject(forwardRef(() => EntityAreaEnrichmentService))
    private readonly entityAreaEnrichment: EntityAreaEnrichmentService,
  ) {}

  @OnEvent(HOMEOS_EVENTS.PRESENCE_ROOM_CHANGED)
  handleRoomChanged(payload: { room?: string; occupied?: boolean; sensor?: string }) {
    const room = String(payload?.room || '').trim();
    if (!room) return;
    // Bridged 事件：所有副本更新本地 map；仅 leader 再广播 ROOM_CONTEXT，避免放大
    this.updateRoom(
      room,
      {
        occupied: !!payload.occupied,
        source: 'mmwave',
      },
      this.haLeader.isHaWsLeader(),
    );
  }

  @OnEvent(HOMEOS_EVENTS.PRESENCE_CHANGED)
  handlePresenceChanged() {
    if (!this.haLeader.isHaWsLeader()) return;
    this.emitContext();
  }

  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  handleStateChange(payload: HaStateChangeBatchEvent) {
    forEachColdBatchEvent(payload, (event) => {
      if (!this.haLeader.isHaWsLeader()) return;
      const eid = event?.entity_id || '';
      if (!eid.includes('motion') && !eid.startsWith('binary_sensor.')) return;
      const state = event?.new_state?.state;
      if (state !== 'on') return;
      const room = this.inferRoomFromEntity(eid, event?.new_state?.attributes);
      if (!room) return;
      const existing = this.rooms.get(room);
      this.updateRoom(room, {
        occupied: existing?.occupied ?? true,
        source: existing?.source === 'mmwave' ? 'mmwave' : 'motion',
        lastMotionAt: Date.now(),
      });
    });
  }

  /**
   * 对外暴露：将实体解析到房间 / HA area（area 优先，关键词兜底）。
   * 供 anomaly-detection 等复用，避免各处重复正则猜房间。
   */
  resolveRoom(entityId: string, attrs?: Record<string, unknown>): string | null {
    return this.inferRoomFromEntity(entityId, attrs);
  }

  private inferRoomFromEntity(entityId: string, attrs?: Record<string, unknown>): string | null {
    const stored = this.stateStore.getById(entityId);
    const enriched = stored ? this.entityAreaEnrichment.enrichEntitySync(stored) : null;
    const area = resolveEntityArea(enriched?.attributes || attrs);
    if (area?.id) return area.id;
    const name =
      `${entityId} ${String(attrs?.friendly_name || enriched?.attributes?.friendly_name || '')}`.toLowerCase();
    const keywords: Array<[RegExp, string]> = [
      [/bedroom|主卧|卧室/, 'bedroom'],
      [/living|客厅|起居室/, 'living'],
      [/kitchen|厨房/, 'kitchen'],
      [/bathroom|卫浴|卫生间|浴室/, 'bathroom'],
      [/study|书房|办公/, 'study'],
    ];
    for (const [re, room] of keywords) {
      if (re.test(name)) return room;
    }
    return null;
  }

  private updateRoom(
    room: string,
    patch: Partial<Pick<RoomContextEntry, 'occupied' | 'source' | 'lastMotionAt'>>,
    emit = true,
  ) {
    const prev = this.rooms.get(room);
    const entry: RoomContextEntry = {
      room,
      occupied: patch.occupied ?? prev?.occupied ?? false,
      source: patch.source ?? prev?.source ?? 'unknown',
      lastMotionAt: patch.lastMotionAt ?? prev?.lastMotionAt ?? null,
      updatedAt: Date.now(),
    };
    this.rooms.set(room, entry);
    if (emit) this.emitContext(room);
  }

  private emitContext(changedRoom?: string) {
    const snapshot = this.getSnapshot();
    this.eventBus.emit(HOMEOS_EVENTS.ROOM_CONTEXT, { ...snapshot, changedRoom });
  }

  getSnapshot(): RoomContextSnapshot {
    const rooms: Record<string, RoomContextEntry> = {};
    for (const [k, v] of this.rooms) rooms[k] = { ...v };
    return {
      anyoneHome: this.presence.isAnyoneHome(),
      rooms,
      updatedAt: Date.now(),
    };
  }

  getRoomContext(room?: string): RoomContextEntry | RoomContextSnapshot {
    if (room) {
      return (
        this.rooms.get(room) ?? {
          room,
          occupied: false,
          source: 'unknown',
          lastMotionAt: null,
          updatedAt: Date.now(),
        }
      );
    }
    return this.getSnapshot();
  }

  isRoomOccupied(room: string): boolean {
    return !!this.rooms.get(room)?.occupied;
  }
}
