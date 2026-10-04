/**
 * @file frigate.service.ts
 * @module backend/src/modules
 *
 * Frigate AI 摄像头集成服务：监控 HA 中的 Frigate 实体，
 * 维护检测事件历史与摄像头在线状态，并在配置的布防模式下
 * 将人物检测转换为 security.alarm 事件联动安防面板。
 *
 * 持久化：检测历史写入 Redis（48h TTL），已确认事件落 RuntimeKv。
 * 多实例：仅 Leader 实例处理检测以避免重复告警。
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/service';
import {
  loadDismissedIdSet,
  persistDismissedIdSet,
} from '../../../common/crud/dismissed-id-set-persist.util';
import { EventBusService } from '../../../shared/redis/event-bus.service';
import { AppConfigService } from '../../../shared/app-config/service';
import type { HaStateChangeBatchEvent, HaStateChangeEvent } from '../../../shared/types';
import { HA_EVENTS } from '../../../shared/types';
import { forEachColdBatchEvent } from '../../../shared/ha/cold-batch.util';
import { SecurityPanelService } from '../panel/security-panel.service';
import { HaWsLeaderService } from '../../ha-connector/ha-ws-leader.service';
import { parseFrigateAlarmModes } from './frigate-alarm-modes.util';
import { RedisService } from '../../../shared/redis/service';
import { getErrorMessage } from '../../../common/utils';

const FRIGATE_DISMISSED_ID = 'security-frigate-dismissed';

interface FrigateSnapshot {
  id?: string;
  entityId: string;
  camera: string;
  label: string;
  score: number;
  box: { x: number; y: number; w: number; h: number } | null;
  timestamp: string;
  snapshotUrl: string | null;
  clipUrl: string | null;
}

/**
 * Frigate AI 摄像头集成服务
 *
 * 监控 HA 中的 Frigate 传感器实体，实时追踪：
 * 1. 目标检测事件（person/car/cat/dog 等 80+ COCO 标签）
 * 2. 检测分数、边界框坐标
 * 3. 快照 URL 和录像片段 URL
 * 4. 摄像头在线/离线状态
 *
 * 兼容的 HA Frigate 实体模式：
 *   binary_sensor.frigate_*_person      → 人物检测 on/off
 *   sensor.frigate_*_detected_object    → 当前检测对象的标签名
 *   sensor.frigate_*_detection_score    → 检测置信度百分比
 *   camera.frigate_*                    → 摄像头实体（快照流）
 */
@Injectable()
export class FrigateService {
  private readonly logger = new Logger(FrigateService.name);

  /** 最近 50 条检测事件 */
  private recentEvents: FrigateSnapshot[] = [];
  /** 检测历史持久化节流定时器（高频检测下合并写入，避免每次检测全量重序列化 + Redis SET） */
  private persistTimer: NodeJS.Timeout | null = null;
  private cameraStatus = new Map<string, { online: boolean; lastEvent: string }>();
  private activeDetections = new Map<string, FrigateSnapshot>();
  private dedupTimestamps = new Map<string, number>();

  private get securityCfg() {
    return this.appConfig.get('security');
  }

  private get maxEvents() {
    return this.securityCfg.frigateMaxEvents;
  }

  private get dedupMs() {
    return this.securityCfg.frigateDedupMs;
  }

  /** 用户已确认的检测事件 */
  private dismissedIds = new Set<string>();
  /** 检测历史 Redis 键（重启后恢复最近事件） */
  private static readonly RECENT_EVENTS_KEY = 'homeos:frigate:recentEvents';

  constructor(
    private readonly eventBus: EventBusService,
    private readonly prisma: PrismaService,
    private readonly securityPanel: SecurityPanelService,
    private readonly appConfig: AppConfigService,
    private readonly haLeader: HaWsLeaderService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    this.dismissedIds = await loadDismissedIdSet(this.prisma, FRIGATE_DISMISSED_ID);
    await this.restoreRecentEvents();
  }

  /** 从 Redis 恢复最近检测事件（仅保留未过期的） */
  private async restoreRecentEvents(): Promise<void> {
    try {
      const raw = await this.redis.get(FrigateService.RECENT_EVENTS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as FrigateSnapshot[];
      if (!Array.isArray(parsed)) return;
      const valid = parsed.filter(
        (e) => e && typeof e.entityId === 'string' && typeof e.timestamp === 'string',
      );
      if (valid.length) {
        this.recentEvents = valid.slice(0, this.maxEvents);
        this.logger.log(`已恢复 Frigate 检测历史: ${this.recentEvents.length} 条`);
      }
    } catch (err) {
      this.logger.debug(`恢复 Frigate 检测历史失败: ${getErrorMessage(err)}`);
    }
  }

  /** 将检测历史写入 Redis（TTL 48h，保留 maxEvents 条）；2s 节流合并高频检测的写入 */
  private persistRecentEvents(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.redis
        .set(FrigateService.RECENT_EVENTS_KEY, JSON.stringify(this.recentEvents), 48 * 3600)
        .catch((err) => this.logger.debug(`Frigate 检测历史持久化失败: ${getErrorMessage(err)}`));
    }, 2000);
  }

  private persistDismissed() {
    persistDismissedIdSet(
      this.logger,
      'Frigate 已确认事件持久化',
      this.prisma,
      FRIGATE_DISMISSED_ID,
      this.dismissedIds,
    );
  }

  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  handleStateChange(payload: HaStateChangeBatchEvent) {
    forEachColdBatchEvent(payload, (event) => {
      // 多实例下仅 Leader 实例处理检测（去重/状态为进程内存，双副本会重复发 detection/alarm）
      if (!this.haLeader.isHaWsLeader()) return;
      const snap = { entity_id: event?.entity_id, new_state: event?.new_state };
      setImmediate(() => this._handleStateChange(snap));
    });
  }

  private _handleStateChange(event: Pick<HaStateChangeEvent, 'entity_id' | 'new_state'>) {
    const entityId: string = event?.entity_id || '';
    const state = event?.new_state?.state;
    const attrs = event?.new_state?.attributes as Record<string, unknown> | undefined;

    if (!state || !attrs) return;

    const id = entityId.toLowerCase();

    // Frigate 目标检测事件（binary_sensor 变 on）
    if (id.startsWith('binary_sensor.') && id.includes('frigate') && state === 'on') {
      this.processDetection(entityId, attrs);
    }

    // 检测分数更新
    if (id.startsWith('sensor.') && id.includes('frigate') && id.includes('score')) {
      this.processScoreUpdate(entityId, state, attrs);
    }

    // 摄像头状态
    if (id.startsWith('camera.') && id.includes('frigate')) {
      const camName = (attrs.friendly_name as string) || entityId;
      this.cameraStatus.set(camName, {
        online: state !== 'unavailable',
        lastEvent: new Date().toISOString(),
      });
    }
  }

  private processDetection(entityId: string, attrs: Record<string, unknown>) {
    const label = (attrs.device_class as string) || this.extractLabel(entityId);
    const score = parseFloat(String(attrs.confidence || attrs.score || attrs.top_score || 80));
    const camera = ((attrs.friendly_name as string) || entityId).replace(
      /_person$|_car$|_dog$|_cat$|_motion$/,
      '',
    );

    const dedupKey = `${camera}:${label}`;
    const now = Date.now();
    const last = this.dedupTimestamps.get(dedupKey);
    if (last && now - last < this.dedupMs) return;
    this.dedupTimestamps.set(dedupKey, now);

    const id = `${camera}:${label}:${now}`;
    const snapshot: FrigateSnapshot & { id: string } = {
      id,
      entityId,
      camera,
      label,
      score: Math.min(100, Math.max(0, score)),
      box: this.extractBox(attrs),
      timestamp: new Date(now).toISOString(),
      snapshotUrl: (attrs.entity_picture as string) || (attrs.snapshot_url as string) || null,
      clipUrl: (attrs.clip_url as string) || null,
    };

    this.recentEvents.unshift(snapshot);
    if (this.recentEvents.length > this.maxEvents) this.recentEvents.length = this.maxEvents;
    this.persistRecentEvents();

    this.activeDetections.set(entityId, snapshot);

    if (score > 70) {
      this.logger.log(`Frigate 检测 [${camera}]: ${label} (${score}%)`);
      this.eventBus.emit('frigate.detection', snapshot);
    }

    // 人物检测 → 同步安防（仅在配置的布防模式下）
    if (label === 'person' && score > 75) {
      const currentMode = this.securityPanel.getMode();
      const allowed = parseFrigateAlarmModes(
        this.appConfig.get('security').frigatePersonAlarmModes,
      );
      if (!allowed.length || !allowed.includes(currentMode)) return;

      this.eventBus.emit('security.alarm', {
        entityId,
        friendlyName: `${camera} 检测到人员`,
        type: 'frigate_person',
        zones: ['frigate'],
        zoneNames: `${camera}`,
        mode: currentMode,
        timestamp: snapshot.timestamp,
      });
    }
  }

  private processScoreUpdate(entityId: string, state: string, _attrs: Record<string, unknown>) {
    // 提取关联的 detection entity
    const detectionId = entityId.replace('_score', '').replace('sensor.', 'binary_sensor.');
    const existing = this.activeDetections.get(detectionId);
    if (existing) {
      existing.score = parseFloat(state) || existing.score;
    }
  }

  private extractLabel(entityId: string): string {
    const parts = entityId.replace('binary_sensor.', '').split('_');
    const knownLabels = [
      'person',
      'car',
      'dog',
      'cat',
      'bicycle',
      'motorcycle',
      'bus',
      'truck',
      'bird',
      'horse',
      'sheep',
      'cow',
      'elephant',
      'bear',
      'zebra',
      'giraffe',
      'backpack',
      'umbrella',
      'handbag',
      'tie',
      'suitcase',
      'frisbee',
      'skis',
      'snowboard',
      'sports_ball',
      'kite',
      'baseball_bat',
      'baseball_glove',
      'skateboard',
      'surfboard',
      'tennis_racket',
      'bottle',
      'wine_glass',
      'cup',
      'fork',
      'knife',
      'spoon',
      'bowl',
      'banana',
      'apple',
      'sandwich',
      'orange',
      'broccoli',
      'carrot',
      'hot_dog',
      'pizza',
      'donut',
      'cake',
      'cell_phone',
      'mouse',
      'remote',
      'keyboard',
      'laptop',
      'microwave',
      'oven',
      'toaster',
      'sink',
      'refrigerator',
      'book',
      'clock',
      'vase',
      'scissors',
      'teddy_bear',
      'hair_drier',
      'toothbrush',
    ];
    for (const label of knownLabels) {
      if (parts.includes(label)) return label;
    }
    if (parts.includes('motion')) return 'motion';
    return parts[parts.length - 1] || 'unknown';
  }

  private extractBox(attrs: Record<string, unknown>): FrigateSnapshot['box'] {
    const x = attrs.box_x ?? attrs.x ?? attrs.left;
    const y = attrs.box_y ?? attrs.y ?? attrs.top;
    const w = attrs.box_w ?? attrs.width ?? attrs.w;
    const h = attrs.box_h ?? attrs.height ?? attrs.h;
    if (x != null && y != null && w != null && h != null) {
      return { x: +x, y: +y, w: +w, h: +h };
    }
    return null;
  }

  ackEvents(ids: string[]) {
    for (const id of ids) {
      if (id?.trim()) this.dismissedIds.add(id.trim());
    }
    this.persistDismissed();
    return { ok: true, dismissed: ids.length };
  }

  /** 获取最近检测事件 */
  getRecentEvents(limit = 20): Array<FrigateSnapshot & { id: string }> {
    return this.recentEvents
      .filter((e) => !this.dismissedIds.has((e as FrigateSnapshot & { id?: string }).id || ''))
      .slice(0, limit)
      .map((e) => {
        const ev = e as FrigateSnapshot & { id?: string };
        return { ...ev, id: ev.id || `${ev.camera}:${ev.label}:${ev.timestamp}` };
      });
  }

  /** 获取活跃检测 */
  getActiveDetections() {
    const now = Date.now();
    const active: FrigateSnapshot[] = [];
    for (const snap of this.activeDetections.values()) {
      if (now - new Date(snap.timestamp).getTime() < 60_000) {
        active.push(snap);
      }
    }
    return active;
  }

  /** 获取摄像头在线汇总 */
  getCameraSummary() {
    const cameras: Array<{ name: string; online: boolean; lastEvent: string }> = [];
    for (const [name, status] of this.cameraStatus) {
      cameras.push({ name, ...status });
    }
    return {
      cameras,
      totalCameras: cameras.length,
      onlineCount: cameras.filter((c) => c.online).length,
      recentDetections: this.getRecentEvents(10),
    };
  }
}
