/**
 * @file presence.service.ts
 * @module backend/src/modules
 *
 * 人员存在感知服务：聚合 person / device_tracker / 门锁门磁 / mmWave 雷达
 * 判定家庭成员是否在家，并发出 presence.changed / presence.everyoneLeft 事件。
 *
 * 工作模式：
 * - 自动跟踪模式：未配置人员时跟踪全部 person/device_tracker。
 * - 配置人员模式：按 security.presencePersons 聚合多个 tracker 的状态。
 * - requireConfiguredPersons + 空配置：不跟踪任何人，避免误报全员离家。
 *
 * 离家确认：所有成员离家后需达到 awayConfirmMin 阈值才发 everyoneLeft，
 * 期间任何到家信号（门锁解锁、tracker 回家、mmWave 房间有人）都会重置确认。
 * 状态持久化到 RuntimeKv（presence-state），重启后可恢复。
 */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { EventBusService } from '../../../shared/redis/event-bus.service';
import {
  AppConfigService,
  APP_CONFIG_UPDATED,
} from '../../../shared/app-config/service';
import { PrismaService } from '../../../shared/prisma/service';
import { JobRegistryService } from '../../../shared/jobs/registry.service';
import { HaWsLeaderService } from '../../ha-connector/ha-ws-leader.service';
import { StateStoreService } from '../../state-store/service';
import { MmWavePresenceService } from './mmwave-presence.service';
import { HA_EVENTS } from '../../../shared/types';
import type { HaEntity, HaStateChangeBatchEvent } from '../../../shared/types';
import { forEachColdBatchEvent } from '../../../shared/ha/cold-batch.util';
import {
  collectPresenceEntityIds,
  computePersonAtHome,
  getPresencePersonsFromSecurity,
  type PresencePerson,
} from '@homeos/shared';
import {
  flushPresencePersistedState,
  loadPresencePersistedState,
  type EntityPresenceState,
  type PersonAggregateState,
} from './persist.helper';

interface PresenceMember {
  id: string;
  name: string;
  source: string;
  atHome: boolean;
  lastSeen: string;
  /** 配置人员可选绑定的 User.id */
  userId?: string;
}

@Injectable()
/**
 * PresenceService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 */
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  private readonly entityStates = new Map<string, EntityPresenceState>();
  /** 聚合后的人员状态（用于变更检测与事件） */
  private readonly personAggregates = new Map<string, PersonAggregateState>();
  private readonly awayConfirmations = new Map<string, number>();
  private everyoneLeftEmitted = false;

  private get AWAY_THRESHOLD_MS() {
    return this.appConfig.get('security').awayConfirmMin * 60_000;
  }

  private checkTimer: NodeJS.Timeout | null = null;
  private persistTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly eventBus: EventBusService,
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly haLeader: HaWsLeaderService,
    @Inject(forwardRef(() => StateStoreService))
    private readonly stateStore: StateStoreService,
    private readonly jobs: JobRegistryService,
    private readonly mmWave: MmWavePresenceService,
  ) {}

  async onModuleInit() {
    await this.loadPersistedState();
    this.pruneUntrackedEntities();
    this.syncPersonAggregates(false);
    this.checkTimer = setInterval(() => {
      void this.jobs.run(
        'presence-check',
        { description: '人员存在周期检查', intervalMs: 30_000 },
        () => this.periodicCheck(),
      );
    }, 30_000);
    this.persistTimer = setInterval(() => {
      void this.jobs.run(
        'presence-persist',
        { description: '人员存在状态落库', intervalMs: 15_000 },
        () => this.flushPersistedState(),
      );
    }, 15_000);
    this.logger.log('人员存在感知服务已启动');
  }

  onModuleDestroy() {
    if (this.checkTimer) clearInterval(this.checkTimer);
    if (this.persistTimer) clearInterval(this.persistTimer);
    void this.flushPersistedState();
  }

  getPresencePersons(): PresencePerson[] {
    return getPresencePersonsFromSecurity(this.appConfig.get('security'));
  }

  /** 配置的参与判定实体；空数组表示自动跟踪全部 person / device_tracker（除非 requireConfiguredPersons） */
  getConfiguredEntityIds(): string[] {
    const persons = this.getPresencePersons();
    if (persons.length > 0) return collectPresenceEntityIds(persons);
    return [];
  }

  /** 要求显式配置人员：presencePersons 为空时不自动跟踪全部 tracker */
  private requireConfiguredPersons(): boolean {
    return this.appConfig.get('security').requireConfiguredPersons === true;
  }

  /**
   * 自动跟踪模式：未配置人员且未要求显式配置时，跟踪全部 person / device_tracker。
   * requireConfiguredPersons + 空列表 → 非自动跟踪（无人被跟踪）。
   */
  isAutoTrackMode(): boolean {
    if (this.getPresencePersons().length > 0) return false;
    return !this.requireConfiguredPersons();
  }

  private isTrackableDomain(entityId: string): boolean {
    return entityId.startsWith('person.') || entityId.startsWith('device_tracker.');
  }

  shouldTrackEntity(entityId: string): boolean {
    if (!this.isTrackableDomain(entityId)) return false;
    const configured = this.getConfiguredEntityIds();
    if (configured.length === 0) {
      // requireConfiguredPersons 且无人配置：不跟踪任何人（避免误报 everyoneLeft）
      return this.isAutoTrackMode();
    }
    return configured.includes(entityId);
  }

  /**
   * 解析 HA 存在状态：仅显式 home/true 为在家，not_home/away/false 为离家；
   * unknown/unavailable 等返回 null（保持上一状态，不计入离家）。
   */
  private parseAtHomeState(state: string | undefined | null): boolean | null {
    const s = String(state ?? '')
      .toLowerCase()
      .trim();
    if (s === 'home' || s === 'true') return true;
    if (s === 'not_home' || s === 'away' || s === 'false') return false;
    return null;
  }

  private entityAtHome(entityId: string): boolean | undefined {
    return this.entityStates.get(entityId)?.atHome;
  }

  private buildAutoModeMembers(): PresenceMember[] {
    const result: PresenceMember[] = [];
    for (const state of this.entityStates.values()) {
      if (!this.shouldTrackEntity(state.entityId)) continue;
      result.push({
        id: this.entityIdToMemberId(state.entityId, state.source),
        name: state.name,
        source: state.source,
        atHome: state.atHome,
        lastSeen: state.lastSeen,
      });
    }
    return result;
  }

  private buildConfiguredPersonMembers(): PresenceMember[] {
    return this.getPresencePersons().map((person) => {
      const atHome = computePersonAtHome(person, (id) => this.entityAtHome(id));
      const lastSeen = this.computePersonLastSeen(person);
      return {
        id: `person:${person.id}`,
        name: person.name,
        source: 'configured',
        atHome,
        lastSeen,
        ...(person.userId ? { userId: person.userId } : {}),
      };
    });
  }

  private computePersonLastSeen(person: PresencePerson): string {
    let latest = '';
    for (const entityId of person.entityIds) {
      const seen = this.entityStates.get(entityId)?.lastSeen;
      if (seen && (!latest || seen > latest)) latest = seen;
    }
    return latest || new Date().toISOString();
  }

  private getTrackedMembers(): PresenceMember[] {
    if (this.isAutoTrackMode()) return this.buildAutoModeMembers();
    return this.buildConfiguredPersonMembers();
  }

  private entityIdToMemberId(entityId: string, source: string): string {
    if (source === 'device_tracker') return `tracker:${entityId}`;
    if (source === 'ha_person') return `person:${entityId}`;
    return entityId;
  }

  private resolveAggregateMemberId(memberId: string): string | null {
    if (memberId.startsWith('person:')) return memberId;
    const entityId = this.resolveMemberEntityId(memberId);
    if (!entityId) return memberId;
    const persons = this.getPresencePersons();
    if (persons.length === 0) return memberId;
    for (const person of persons) {
      if (person.entityIds.includes(entityId)) return `person:${person.id}`;
    }
    return null;
  }

  private resolveMemberEntityId(memberId: string): string | null {
    if (memberId.startsWith('person:')) {
      const rest = memberId.slice('person:'.length);
      if (rest.includes('.')) return rest;
      return null;
    }
    if (memberId.startsWith('tracker:')) return memberId.slice('tracker:'.length);
    if (memberId.includes('.')) return memberId;
    return null;
  }

  private isMemberTracked(memberId: string): boolean {
    if (this.isAutoTrackMode()) {
      const entityId = this.resolveMemberEntityId(memberId);
      if (!entityId) return true;
      return this.shouldTrackEntity(entityId);
    }
    return memberId.startsWith('person:') && this.personAggregates.has(memberId);
  }

  private async loadPersistedState() {
    const loaded = await loadPresencePersistedState(this.prisma, this.logger);
    this.entityStates.clear();
    for (const [id, state] of loaded.entityStates) this.entityStates.set(id, state);
    this.personAggregates.clear();
    for (const [id, state] of loaded.personAggregates) this.personAggregates.set(id, state);
    this.awayConfirmations.clear();
    for (const [id, ts] of loaded.awayConfirmations) this.awayConfirmations.set(id, ts);
    this.everyoneLeftEmitted = loaded.everyoneLeftEmitted;
  }

  private markDirty() {
    this.dirty = true;
  }

  private async flushPersistedState() {
    const dirtyRef = { value: this.dirty };
    await flushPresencePersistedState(
      this.prisma,
      {
        entityStates: this.entityStates,
        personAggregates: this.personAggregates,
        awayConfirmations: this.awayConfirmations,
        everyoneLeftEmitted: this.everyoneLeftEmitted,
      },
      dirtyRef,
      this.logger,
    );
    this.dirty = dirtyRef.value;
  }

  getAllMembers(): PresenceMember[] {
    return this.getTrackedMembers();
  }

  /** mmWave 房间在场融合：启用时任一房间检测到有人即视为房屋被占用（兜底 tracker 失效） */
  private mmWaveHomeOccupied(): boolean {
    if (!this.appConfig.get('security').mmWaveFusePresence) return false;
    try {
      return this.mmWave.getSummary().homeOccupied;
    } catch {
      return false;
    }
  }

  isAnyoneHome(): boolean {
    return this.getTrackedMembers().some((m) => m.atHome) || this.mmWaveHomeOccupied();
  }

  getAtHomeCount(): number {
    return this.getTrackedMembers().filter((m) => m.atHome).length;
  }

  async getHomePresenceResponse() {
    if (!this.haLeader.isHaWsLeader()) {
      await this.loadPersistedState();
    }
    const members = this.getAllMembers();
    return {
      anyoneHome: this.isAnyoneHome(),
      atHomeCount: members.filter((m) => m.atHome).length,
      members,
      entityIds: this.getConfiguredEntityIds(),
      autoMode: this.isAutoTrackMode(),
      persons: this.getPresencePersons(),
      rooms: this.mmWaveHomeOccupied() || this.appConfig.get('security').mmWaveFusePresence
        ? this.mmWave.getAllRoomPresence()
        : {},
    };
  }

  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  handleStateChanged(payload: HaStateChangeBatchEvent) {
    forEachColdBatchEvent(payload, (event) => {
      if (!this.haLeader.isHaWsLeader()) return;
      const entityId = event.entity_id;
      if (!this.shouldTrackEntity(entityId)) return;

      const newState = event.new_state?.state;

      if (entityId.startsWith('person.')) {
        this.handlePersonUpdate(entityId, newState || 'unknown', event.new_state);
      }

      if (entityId.startsWith('device_tracker.')) {
        const attrs = event.new_state?.attributes ?? {};
        const name = attrs.friendly_name || entityId.split('.')[1] || 'unknown';
        this.applyPresenceEntityUpdate(
          entityId,
          String(name),
          'device_tracker',
          newState,
        );
      }

      if (entityId.startsWith('lock.') || entityId.startsWith('binary_sensor.door')) {
        if (newState === 'unlocked' || newState === 'on') {
          this.confirmHome();
          this.logger.debug(`门锁事件:${entityId} → ${newState}`);
        }
      }
    });
  }

  @OnEvent(HA_EVENTS.INITIAL_STATES)
  handleInitialStates() {
    if (!this.haLeader.isHaWsLeader()) return;
    this.seedFromStateStore();
  }

  @OnEvent(APP_CONFIG_UPDATED)
  handleConfigUpdated(sections: string[]) {
    if (sections?.length && !sections.includes('security')) return;
    this.pruneUntrackedEntities();
    this.syncPersonAggregates(false);
    this.seedFromStateStore();
  }

  private seedFromStateStore() {
    const configured = this.getConfiguredEntityIds();
    let entities: HaEntity[];
    if (configured.length > 0) {
      entities = configured.map((id) => this.stateStore.getById(id)).filter(Boolean) as HaEntity[];
    } else if (this.isAutoTrackMode()) {
      entities = [
        ...this.stateStore.getAll('person'),
        ...this.stateStore.getAll('device_tracker'),
      ];
    } else {
      // requireConfiguredPersons 且无人配置：不播种任何 tracker
      return;
    }

    for (const entity of entities) {
      this.applyEntityState(entity.entity_id, entity);
    }
  }

  private applyEntityState(entityId: string, entity: HaEntity) {
    if (!this.shouldTrackEntity(entityId)) return;
    if (entityId.startsWith('person.')) {
      this.handlePersonUpdate(entityId, entity.state || 'unknown', entity);
      return;
    }
    if (entityId.startsWith('device_tracker.')) {
      const attrs = entity.attributes ?? {};
      const name = attrs.friendly_name || entityId.split('.')[1] || 'unknown';
      this.applyPresenceEntityUpdate(entityId, String(name), 'device_tracker', entity.state);
    }
  }

  private pruneUntrackedEntities() {
    let changed = false;
    for (const entityId of Array.from(this.entityStates.keys())) {
      if (!this.shouldTrackEntity(entityId)) {
        this.entityStates.delete(entityId);
        changed = true;
      }
    }
    const validPersonIds = new Set(this.getPresencePersons().map((p) => `person:${p.id}`));
    for (const id of Array.from(this.personAggregates.keys())) {
      if (!this.isAutoTrackMode() && !validPersonIds.has(id)) {
        this.personAggregates.delete(id);
        this.awayConfirmations.delete(id);
        changed = true;
      }
    }
    if (changed) this.markDirty();
  }

  private handlePersonUpdate(entityId: string, newState: string, newStateObj: HaEntity | null) {
    const attributes = newStateObj?.attributes ?? {};
    const rawName = attributes.friendly_name;
    const name =
      typeof rawName === 'string' && rawName.trim()
        ? rawName.trim()
        : (entityId.split('.')[1] ?? entityId);

    const applied = this.applyPresenceEntityUpdate(entityId, name, 'ha_person', newState);
    if (applied != null) {
      this.logger.debug(`实体更新: ${name} → ${applied ? '在家' : '离家'}`);
    } else {
      this.logger.debug(`实体更新: ${name} → 状态未知(${newState}),保持原判定`);
    }
  }

  /**
   * 应用存在状态；unknown/unavailable 时保留上一 atHome，不触发离家。
   * @returns 解析后的 atHome，未知则 null
   */
  private applyPresenceEntityUpdate(
    entityId: string,
    name: string,
    source: string,
    rawState: string | undefined | null,
  ): boolean | null {
    const parsed = this.parseAtHomeState(rawState);
    if (parsed === null) {
      const prev = this.entityStates.get(entityId);
      if (prev) {
        this.entityStates.set(entityId, {
          ...prev,
          name,
          lastSeen: new Date().toISOString(),
        });
        this.markDirty();
      }
      // 无历史记录时不写入（避免把 unknown 当成离家）
      return null;
    }
    this.updateEntityState(entityId, name, source, parsed);
    return parsed;
  }

  private updateEntityState(entityId: string, name: string, source: string, atHome: boolean) {
    this.entityStates.set(entityId, {
      entityId,
      name,
      source,
      atHome,
      lastSeen: new Date().toISOString(),
    });
    this.markDirty();
    this.syncPersonAggregates(true);
    if (atHome) this.confirmHome();
  }

  private syncPersonAggregates(emitEvents: boolean) {
    if (this.isAutoTrackMode()) {
      for (const state of this.entityStates.values()) {
        if (!this.shouldTrackEntity(state.entityId)) continue;
        const memberId = this.entityIdToMemberId(state.entityId, state.source);
        this.applyAggregateChange(memberId, state.name, state.atHome, emitEvents);
      }
      return;
    }

    for (const person of this.getPresencePersons()) {
      const memberId = `person:${person.id}`;
      const atHome = computePersonAtHome(person, (id) => this.entityAtHome(id));
      this.applyAggregateChange(memberId, person.name, atHome, emitEvents);
    }
  }

  private applyAggregateChange(
    memberId: string,
    name: string,
    atHome: boolean,
    emitEvents: boolean,
  ) {
    const prev = this.personAggregates.get(memberId);
    const wasHome = prev?.atHome;

    this.personAggregates.set(memberId, { name, atHome });
    this.markDirty();

    if (!emitEvents || wasHome === undefined || wasHome === atHome) return;

    this.eventBus.emit('presence.changed', {
      memberId,
      name,
      atHome,
      timestamp: new Date().toISOString(),
    });

    if (atHome) {
      this.logger.log(`🏠 ${name} 已到家`);
      this.everyoneLeftEmitted = false;
      this.awayConfirmations.delete(memberId);
    } else {
      this.logger.log(`🚶 ${name} 已离家`);
      this.startAwayConfirmation(memberId);
    }
  }

  private confirmHome() {
    this.everyoneLeftEmitted = false;
    // 门锁/门磁确认到家：清空全部离家确认计时，避免人员状态滞后时再次触发 everyoneLeft
    this.awayConfirmations.clear();
  }

  private startAwayConfirmation(memberId: string) {
    this.awayConfirmations.set(memberId, Date.now());
  }

  private periodicCheck() {
    const now = Date.now();
    const members = this.getTrackedMembers();

    // 无人被跟踪（如 requireConfiguredPersons 且未配置）：永不发出 everyoneLeft
    if (members.length === 0) {
      this.awayConfirmations.clear();
      this.everyoneLeftEmitted = false;
      return;
    }

    // mmWave 房间在场融合：tracker 全部离场但雷达仍检测到房间有人时，
    // 视为有人在家（tracker 可能失效/被遗留在家），避免误发全员离家
    const anyoneHome = members.some((m) => m.atHome) || this.mmWaveHomeOccupied();

    if (anyoneHome) {
      this.everyoneLeftEmitted = false;
      for (const [id, ts] of this.awayConfirmations) {
        if (!this.isMemberTracked(id)) {
          this.awayConfirmations.delete(id);
          continue;
        }
        if (now - ts > this.AWAY_THRESHOLD_MS * 4) this.awayConfirmations.delete(id);
      }
      return;
    }

    if (this.everyoneLeftEmitted) return;

    let latestAway = 0;
    let lastMemberName = '未知';
    for (const [id, ts] of this.awayConfirmations) {
      if (!this.isMemberTracked(id)) continue;
      if (ts > latestAway) {
        latestAway = ts;
        lastMemberName = this.personAggregates.get(id)?.name || lastMemberName;
      }
    }
    if (latestAway === 0) return;

    if (now - latestAway >= this.AWAY_THRESHOLD_MS) {
      this.everyoneLeftEmitted = true;
      this.markDirty();
      this.eventBus.emit('presence.everyoneLeft', {
        lastMember: lastMemberName,
        timestamp: new Date().toISOString(),
      });
      this.logger.log('所有成员已离家');
    }
  }

  removeMember(entityId: string) {
    const aggregateId = this.resolveAggregateMemberId(entityId);
    if (aggregateId) {
      this.personAggregates.delete(aggregateId);
      this.awayConfirmations.delete(aggregateId);
    }
    const resolved = this.resolveMemberEntityId(entityId);
    if (resolved) this.entityStates.delete(resolved);
    this.markDirty();
  }
}
