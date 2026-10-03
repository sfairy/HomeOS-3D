/**
 * 设备管理与僵尸绑定清理服务
 *
 * 所属模块：system/device
 * 职责：
 *  - 扫描「HA 中已不存在但仍被引用」的僵尸绑定，来源覆盖：
 *      layoutWidget   —— 仪表板布局 Widget（户型图热点 / 右侧与浮动面板部件 / 收藏）
 *      areaEntity     —— 房间实体绑定（AreaEntity 表）
 *      alertRule      —— 告警规则（AlertRule.entityId）
 *      deviceLifespan —— 设备寿命统计（DeviceLifespan / DeviceUsageStat 表）
 *    存活判定 = 状态库 ∪ HA 实体注册表（含禁用/隐藏）。不得只用过滤后的状态库，
 *    否则「仅同步已启用实体」会把隐藏诊断实体全部误判成僵尸。
 *  - 提供批量解绑（删除或清理对应绑定，幂等，单条失败不阻断其余）
 * 依赖：PrismaService、StateStoreService（现有实体集合）、UiConfigService（布局读写）、
 *       DeviceLifespanService（内存寿命记录清理）、HaConnectorService（注册表中文名）
 */
import { getErrorMessage } from '../../../common/utils';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../shared/prisma/service';
import type { HaEntityRegistryEntry } from '../../../shared/ha/entity-registry.util';
import { StateStoreService } from '../../state-store/service';
import { UiConfigService } from '../../ui-config/service';
import { HaConnectorService } from '../../ha-connector/service';
import { DeviceLifespanService } from './lifespan.service';
import { buildAliveEntityIdSet, shouldSkipZombieScan } from './device-management.util';

/** 僵尸绑定来源类型 */
type ZombieBindingSource = 'layoutWidget' | 'areaEntity' | 'alertRule' | 'deviceLifespan';

/** 单条僵尸绑定（供前端展示与回传解绑） */
interface ZombieBindingItem {
  /** 来源类型 */
  source: ZombieBindingSource;
  /** 引用的 HA 实体 ID（注册表与状态库均无） */
  entityId: string;
  /** 展示用实体名（HA attributes.friendly_name / 注册表 name；无中文名时为空） */
  entityName: string;
  /** 定位引用自身的 ID（解绑时用于幂等定位，如绑定行 ID / 布局坐标） */
  refId: string;
  /** 引用位置的中文描述 */
  location: string;
}

/** GET /system/devices 响应 */
interface DeviceManagementOverview {
  zombieBindings: ZombieBindingItem[];
}

/** POST /system/devices/unbind 请求体（items 为选中要解绑的僵尸绑定子集） */
export interface ZombieUnbindRequest {
  items?: ZombieBindingItem[];
}

/** 单条解绑结果 */
interface ZombieUnbindResultItem {
  source: ZombieBindingSource;
  entityId: string;
  refId: string;
  status: 'unbound' | 'skipped' | 'failed';
  message?: string;
}

/** POST /system/devices/unbind 响应 */
interface ZombieUnbindResponse {
  processed: number;
  unbound: number;
  skipped: number;
  failed: number;
  results: ZombieUnbindResultItem[];
}

@Injectable()
/**
 * DeviceManagementService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class DeviceManagementService
 */
export class DeviceManagementService {
  private readonly logger = new Logger(DeviceManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateStore: StateStoreService,
    private readonly uiConfig: UiConfigService,
    private readonly lifespan: DeviceLifespanService,
    private readonly haConnector: HaConnectorService,
  ) {}

  /** 设备管理总览：僵尸绑定（按来源分组） */
  async getDevicesOverview(): Promise<DeviceManagementOverview> {
    const zombieBindings = await this.collectZombieBindings();
    return { zombieBindings };
  }

  /**
   * 收集四类来源的僵尸绑定：本地引用 −（状态库 ∪ HA 注册表）= 差集。
   * HA 未同步完成时跳过，避免把全部绑定标成僵尸。
   */
  private async collectZombieBindings(): Promise<ZombieBindingItem[]> {
    const storeIds = this.stateStore.getAll().map((e) => e.entity_id);
    let registry: HaEntityRegistryEntry[] = [];
    try {
      registry = await this.haConnector.fetchEntityRegistry();
    } catch (err) {
      this.logger.warn(
        `加载 HA 实体注册表失败，僵尸扫描将仅对照状态库: ${getErrorMessage(err)}`,
      );
    }

    if (
      shouldSkipZombieScan({
        storeCount: storeIds.length,
        registryCount: registry.length,
        haSynced: this.stateStore.isHaSynced(),
      })
    ) {
      this.logger.warn('跳过僵尸绑定扫描: Home Assistant 尚未同步，无法判断实体是否仍存在');
      return [];
    }

    const alive = buildAliveEntityIdSet(
      storeIds,
      registry.map((entry) => entry.entity_id),
    );
    const items: ZombieBindingItem[] = [];

    await this.collectLayoutWidgetBindings(items);
    await this.collectAreaEntityBindings(items);
    await this.collectAlertRuleBindings(items);
    await this.collectDeviceLifespanBindings(items);

    const zombies = items.filter((it) => !alive.has(it.entityId));
    if (zombies.length) {
      const nameByEntity = await this.loadZombieFriendlyNameMap(
        zombies.map((z) => z.entityId),
        registry,
      );
      for (const z of zombies) {
        z.entityName = this.resolveZombieEntityName(z.entityId, z.entityName, nameByEntity);
      }
      const bySource = new Map<ZombieBindingSource, number>();
      for (const z of zombies) bySource.set(z.source, (bySource.get(z.source) || 0) + 1);
      this.logger.log(
        `僵尸绑定扫描: ${[...bySource.entries()]
          .map(([s, n]) => `${s}=${n}`)
          .join(', ')}`,
      );
    }
    return zombies;
  }

  // ---------- 僵尸绑定收集 ----------

  /** 布局 Widget 实体绑定：户型图热点（floors[].widgets）、右侧/浮动面板部件、收藏 */
  private async collectLayoutWidgetBindings(items: ZombieBindingItem[]) {
    try {
      const config = await this.prisma.projectConfig.findUnique({
        where: { projectId: 'default' },
        select: { layout: true },
      });
      if (!config?.layout) return;
      const layout = this.parseLayout(config.layout);

      // 户型图热点：widget.id = entity_id
      const floors = Array.isArray(layout.floors) ? layout.floors : [];
      floors.forEach((floor, floorIdx) => {
        if (!floor || typeof floor !== 'object') return;
        const f = floor as Record<string, unknown>;
        const floorName = String(f.name || f.id || `楼层${floorIdx + 1}`);
        const widgets = Array.isArray(f.widgets) ? f.widgets : [];
        widgets.forEach((w, wIdx) => {
          if (!w || typeof w !== 'object') return;
          const widget = w as Record<string, unknown>;
          const entityId = String(widget.id || '');
          if (!entityId.includes('.')) return;
          items.push({
            source: 'layoutWidget',
            entityId,
            entityName: String(widget.label || ''),
            refId: `floor:${floorIdx}:${wIdx}`,
            location: `仪表板布局 · ${floorName}热点${widget.label ? `「${widget.label}」` : ''}`,
          });
        });
      });

      // 右侧 / 浮动面板部件
      for (const listName of ['rightPanelWidgets', 'floatingWidgets'] as const) {
        const list = Array.isArray(layout[listName]) ? layout[listName] : [];
        list.forEach((w, wIdx) => {
          if (!w || typeof w !== 'object') return;
          const entityId = this.extractWidgetEntityId(w as Record<string, unknown>);
          if (!entityId) return;
          const widget = w as Record<string, unknown>;
          const type = String(widget.type || '部件');
          const cfg = (widget.config || {}) as Record<string, unknown>;
          const title = String(cfg.title || '');
          const refId =
            typeof widget.id === 'string' && widget.id
              ? `widget:${widget.id}`
              : `widget:${listName}:${wIdx}`;
          items.push({
            source: 'layoutWidget',
            entityId,
            entityName: title,
            refId,
            location: `面板部件 · ${title || type}（${listName === 'rightPanelWidgets' ? '右侧' : '浮动'}）`,
          });
        });
      }

      // 收藏：favoriteEntities[domain] = entityId[]
      const favorites = layout.favoriteEntities;
      if (favorites && typeof favorites === 'object') {
        for (const [domain, list] of Object.entries(favorites as Record<string, unknown>)) {
          if (!Array.isArray(list)) continue;
          for (const entityId of list) {
            if (typeof entityId !== 'string' || !entityId.includes('.')) continue;
            items.push({
              source: 'layoutWidget',
              entityId,
              entityName: '',
              refId: `favorite:${domain}`,
              location: `常用设备 · ${domain} 域收藏`,
            });
          }
        }
      }
    } catch (err) {
      this.logger.warn(`扫描布局 Widget 绑定失败: ${getErrorMessage(err)}`);
    }
  }

  /** 房间实体绑定（AreaEntity 表，含房间名） */
  private async collectAreaEntityBindings(items: ZombieBindingItem[]) {
    try {
      const rows = await this.prisma.areaEntity.findMany({
        select: { id: true, entityId: true, area: { select: { name: true } } },
        take: 2000,
      });
      for (const row of rows) {
        items.push({
          source: 'areaEntity',
          entityId: row.entityId,
          entityName: '',
          refId: row.id,
          location: `房间「${row.area?.name || '未知房间'}」实体绑定`,
        });
      }
    } catch (err) {
      this.logger.warn(`扫描房间实体绑定失败: ${getErrorMessage(err)}`);
    }
  }

  /** 告警规则（AlertRule.entityId 非空） */
  private async collectAlertRuleBindings(items: ZombieBindingItem[]) {
    try {
      const rows = await this.prisma.alertRule.findMany({
        where: { entityId: { not: null } },
        select: { id: true, name: true, entityId: true, enabled: true },
        take: 2000,
      });
      for (const row of rows) {
        if (!row.entityId) continue;
        items.push({
          source: 'alertRule',
          entityId: row.entityId,
          entityName: '',
          refId: row.id,
          location: `告警规则「${row.name || '未命名规则'}」${row.enabled ? '' : '（已停用）'}`,
        });
      }
    } catch (err) {
      this.logger.warn(`扫描告警规则绑定失败: ${getErrorMessage(err)}`);
    }
  }

  /** 设备寿命统计（DeviceLifespan 追踪记录 + DeviceUsageStat 使用统计，按 entityId 去重） */
  private async collectDeviceLifespanBindings(items: ZombieBindingItem[]) {
    try {
      const [lifespans, usageStats] = await Promise.all([
        this.prisma.deviceLifespan.findMany({
          select: { entityId: true, friendlyName: true },
          take: 2000,
        }),
        this.prisma.deviceUsageStat.findMany({
          select: { entityId: true },
          take: 5000,
        }),
      ]);
      const seen = new Set<string>();
      for (const row of lifespans) {
        seen.add(row.entityId);
        items.push({
          source: 'deviceLifespan',
          entityId: row.entityId,
          entityName: row.friendlyName || '',
          refId: `lifespan:${row.entityId}`,
          location: `设备寿命统计「${row.friendlyName || row.entityId}」`,
        });
      }
      for (const row of usageStats) {
        if (seen.has(row.entityId)) continue;
        seen.add(row.entityId);
        items.push({
          source: 'deviceLifespan',
          entityId: row.entityId,
          entityName: '',
          refId: `usage:${row.entityId}`,
          location: '设备使用统计（按天累计）',
        });
      }
    } catch (err) {
      this.logger.warn(`扫描设备寿命统计失败: ${getErrorMessage(err)}`);
    }
  }

  // ---------- 批量解绑 ----------

  /**
   * 批量解绑僵尸绑定。
   * 幂等：目标已不存在时记为 skipped；单条失败记为 failed 不阻断其余。
   * 布局 Widget 删除聚合为一次 layout 重写保存（避免逐条写库）。
   */
  async unbindZombies(req: ZombieUnbindRequest): Promise<ZombieUnbindResponse> {
    const items = Array.isArray(req?.items) ? req.items : [];
    const results: ZombieUnbindResultItem[] = [];
    const layoutRemovals: ZombieBindingItem[] = [];

    for (const item of items) {
      if (item.source === 'layoutWidget') {
        layoutRemovals.push(item);
        continue;
      }
      results.push(await this.unbindNonLayout(item));
    }

    if (layoutRemovals.length) {
      results.push(...(await this.unbindLayoutWidgets(layoutRemovals)));
    }

    const count = (status: ZombieUnbindResultItem['status']) =>
      results.filter((r) => r.status === status).length;
    return {
      processed: results.length,
      unbound: count('unbound'),
      skipped: count('skipped'),
      failed: count('failed'),
      results,
    };
  }

  /** 解绑非布局来源（房间绑定 / 告警规则 / 寿命统计），单条幂等处理 */
  private async unbindNonLayout(item: ZombieBindingItem): Promise<ZombieUnbindResultItem> {
    const base = { source: item.source, entityId: item.entityId, refId: item.refId };
    try {
      switch (item.source) {
        case 'areaEntity': {
          const { count } = await this.prisma.areaEntity.deleteMany({ where: { id: item.refId } });
          return count > 0
            ? { ...base, status: 'unbound' as const }
            : { ...base, status: 'skipped' as const, message: '房间绑定已不存在' };
        }
        case 'alertRule': {
          const { count } = await this.prisma.alertRule.deleteMany({ where: { id: item.refId } });
          return count > 0
            ? { ...base, status: 'unbound' as const }
            : { ...base, status: 'skipped' as const, message: '告警规则已不存在' };
        }
        case 'deviceLifespan': {
          await this.prisma.deviceLifespan.deleteMany({ where: { entityId: item.entityId } });
          await this.prisma.deviceUsageStat.deleteMany({ where: { entityId: item.entityId } });
          this.lifespan.removeDeviceFromMemory(item.entityId);
          return { ...base, status: 'unbound' as const };
        }
        default:
          return { ...base, status: 'failed' as const, message: `不支持的来源: ${item.source}` };
      }
    } catch (err) {
      this.logger.warn(
        `解绑失败 [${item.source}/${item.refId}/${item.entityId}]: ${getErrorMessage(err)}`,
      );
      return { ...base, status: 'failed' as const, message: '解绑失败，请重试' };
    }
  }

  /** 批量移除布局 Widget 绑定：重读最新 layout，一次定位删除后单次保存 */
  private async unbindLayoutWidgets(items: ZombieBindingItem[]): Promise<ZombieUnbindResultItem[]> {
    if (!items.length) return [];
    try {
      const config = await this.prisma.projectConfig.findUnique({
        where: { projectId: 'default' },
        select: { layout: true },
      });
      const layout = this.parseLayout(config?.layout);
      let changed = false;

      // 同一列表（楼层热点 / 面板部件）多个条目批量删除时，index 会随删除漂移；
      // 按 index 降序处理可保证先删尾部、前部索引仍然有效（id / favorite 形态不受影响）。
      const parsePos = (refId: string) => {
        const m = refId.match(/^(floor|widget):([^:]*):(\d+)$/);
        return m ? { kind: m[1], list: m[2], idx: Number(m[3]) } : null;
      };
      const sorted = [...items].sort((a, b) => {
        const pa = parsePos(a.refId);
        const pb = parsePos(b.refId);
        if (pa && pb && pa.kind === pb.kind && pa.list === pb.list) {
          return pb.idx - pa.idx;
        }
        return 0;
      });

      const results: ZombieUnbindResultItem[] = [];
      for (const item of sorted) {
        const removed = this.removeWidgetFromLayout(layout, item);
        if (removed) changed = true;
        results.push(
          removed
            ? { source: item.source, entityId: item.entityId, refId: item.refId, status: 'unbound' as const }
            : {
                source: item.source,
                entityId: item.entityId,
                refId: item.refId,
                status: 'skipped' as const,
                message: '布局中已不存在该绑定',
              },
        );
      }

      if (changed) {
        await this.uiConfig.saveConfig('default', layout);
      }

      return results;
    } catch (err) {
      this.logger.warn(
        `移除布局 Widget 失败: ${getErrorMessage(err)}`,
      );
      return items.map((item) => ({
        source: item.source,
        entityId: item.entityId,
        refId: item.refId,
        status: 'failed' as const,
        message: '布局保存失败，请重试',
      }));
    }
  }

  /**
   * 按 refId 从 layout 对象中移除对应 Widget 引用（原地修改）。
   * 支持：floor:{fi}:{wi} 热点、widget:{id 或 listName:idx} 面板部件、favorite:{domain} 收藏。
   */
  private removeWidgetFromLayout(
    layout: Record<string, unknown>,
    item: ZombieBindingItem,
  ): boolean {
    const { refId, entityId } = item;
    if (refId.startsWith('floor:')) {
      const parts = refId.split(':');
      const floor = (Array.isArray(layout.floors) ? layout.floors : [])[Number(parts[1])] as
        | Record<string, unknown>
        | undefined;
      if (!floor || !Array.isArray(floor.widgets)) return false;
      const widgets = floor.widgets as unknown[];
      const matchesEntity = (w: unknown) =>
        !!w &&
        typeof w === 'object' &&
        String((w as Record<string, unknown>).id || '') === entityId;
      const idx = Number(parts[2]);
      const targetIdx = matchesEntity(widgets[idx])
        ? idx
        : widgets.findIndex((w) => matchesEntity(w));
      if (targetIdx < 0) return false;
      widgets.splice(targetIdx, 1);
      return true;
    }
    if (refId.startsWith('favorite:')) {
      const domain = refId.slice('favorite:'.length);
      const favorites = layout.favoriteEntities as Record<string, unknown> | undefined;
      const list = favorites?.[domain];
      if (!Array.isArray(list)) return false;
      const idx = list.indexOf(entityId);
      if (idx < 0) return false;
      list.splice(idx, 1);
      return true;
    }
    if (refId.startsWith('widget:')) {
      const key = refId.slice('widget:'.length);
      // 面板部件跨 rightPanelWidgets / floatingWidgets 两列表，按 id 或 index 定位
      for (const listName of ['rightPanelWidgets', 'floatingWidgets'] as const) {
        const list = Array.isArray(layout[listName]) ? layout[listName] : [];
        const targetIdx = list.findIndex((w) => {
          if (!w || typeof w !== 'object') return false;
          const widget = w as Record<string, unknown>;
          if (typeof widget.id === 'string' && widget.id) return widget.id === key;
          return false;
        });
        const idx = targetIdx >= 0 ? targetIdx : Number(key.split(':')[1]);
        if (Number.isInteger(idx) && idx >= 0 && idx < list.length) {
          // 按 index 定位时校验确为引用该实体的部件，防误删
          const widget = list[idx] as Record<string, unknown> | undefined;
          if (widget && this.extractWidgetEntityId(widget) === entityId) {
            list.splice(idx, 1);
            return true;
          }
        }
      }
      return false;
    }
    return false;
  }

  /** 从寿命统计表、HA 注册表、事件日志收集 entityId → 中文友好名 */
  private async loadZombieFriendlyNameMap(
    entityIds: string[],
    registryRows?: HaEntityRegistryEntry[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const put = (entityId: string, name: string | undefined) => {
      if (map.has(entityId)) return;
      const usable = this.usableFriendlyName(entityId, name);
      if (usable) map.set(entityId, usable);
    };

    try {
      const registry = registryRows ?? (await this.haConnector.fetchEntityRegistry());
      for (const entry of registry) {
        put(entry.entity_id, entry.name || entry.original_name);
      }
    } catch (err) {
      this.logger.warn(
        `加载 HA 实体注册表名称失败: ${getErrorMessage(err)}`,
      );
    }

    try {
      const rows = await this.prisma.deviceLifespan.findMany({
        select: { entityId: true, friendlyName: true },
        take: 2000,
      });
      for (const row of rows) put(row.entityId, row.friendlyName);
    } catch (err) {
      this.logger.warn(
        `加载设备寿命名称映射失败: ${getErrorMessage(err)}`,
      );
    }

    const missing = entityIds.filter((id) => !map.has(id));
    if (missing.length) {
      const fromLog = await this.loadEventLogFriendlyNames(missing);
      for (const [id, name] of fromLog) put(id, name);
    }

    const stillMissing = entityIds.filter((id) => !map.has(id)).slice(0, 30);
    if (stillMissing.length) {
      const states = await Promise.all(
        stillMissing.map(async (id) => {
          try {
            const st = await this.haConnector.fetchEntityState(id);
            return { id, name: String(st?.attributes?.friendly_name || '') };
          } catch {
            return { id, name: '' };
          }
        }),
      );
      for (const row of states) put(row.id, row.name);
    }
    return map;
  }

  /** 最近一次 EventLog 状态里的 attributes.friendly_name */
  private async loadEventLogFriendlyNames(entityIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!entityIds.length) return map;
    try {
      const idSql = Prisma.join(
        entityIds.map((id) => Prisma.sql`${id}`),
        ', ',
      );
      const rows = await this.prisma.$queryRaw<Array<{ entityId: string; newState: unknown }>>(
        Prisma.sql`
          SELECT DISTINCT ON ("entityId") "entityId", "newState"
          FROM "EventLog"
          WHERE "entityId" IN (${idSql})
          ORDER BY "entityId", "createdAt" DESC
        `,
      );
      for (const row of rows) {
        const attrs =
          row.newState && typeof row.newState === 'object'
            ? ((row.newState as Record<string, unknown>).attributes as Record<string, unknown> | undefined)
            : undefined;
        const name = typeof attrs?.friendly_name === 'string' ? attrs.friendly_name : '';
        const usable = this.usableFriendlyName(row.entityId, name);
        if (usable) map.set(row.entityId, usable);
      }
    } catch (err) {
      this.logger.warn(
        `从事件日志读取友好名失败: ${getErrorMessage(err)}`,
      );
    }
    return map;
  }

  /** 不是 entity_id / object_id 的展示名才采用（HA 中文 friendly_name） */
  private usableFriendlyName(entityId: string, raw: string | undefined): string {
    const name = String(raw || '').trim();
    if (!name) return '';
    if (name === entityId) return '';
    const dot = entityId.indexOf('.');
    const objectId = dot >= 0 ? entityId.slice(dot + 1) : entityId;
    if (name === objectId) return '';
    return name;
  }

  /** 实体展示名：优先 HA 属性/注册表中文名，不要用 object_id 冒充 */
  private resolveZombieEntityName(
    entityId: string,
    hint: string | undefined,
    names: Map<string, string>,
  ): string {
    return (
      this.usableFriendlyName(entityId, hint) ||
      names.get(entityId) ||
      ''
    );
  }

  /** 解析 layout 字段为对象（JsonB 读出值恒为对象） */
  private parseLayout(layout: unknown): Record<string, unknown> {
    if (layout != null && typeof layout === 'object' && !Array.isArray(layout)) {
      return layout as Record<string, unknown>;
    }
    return {};
  }

  /** 从面板部件中提取其绑定的实体 ID（config.entityId / entity / 顶层 entityId / id 兜底） */
  private extractWidgetEntityId(widget: Record<string, unknown>): string | null {
    const cfg =
      widget.config && typeof widget.config === 'object'
        ? (widget.config as Record<string, unknown>)
        : null;
    const candidates: unknown[] = [cfg?.entityId, cfg?.entity, widget.entityId, widget.entity];
    for (const c of candidates) {
      if (typeof c === 'string' && c.includes('.')) return c;
    }
    if (typeof widget.id === 'string' && widget.id.includes('.')) return widget.id;
    return null;
  }
}
