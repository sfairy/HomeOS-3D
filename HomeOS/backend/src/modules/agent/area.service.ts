/**
 * 智能管家房间视图服务。
 *
 * 所属模块：backend/modules/agent
 * 职责：优先读取 DB Area（移动端房间-设备映射），无数据时回退 HA area_registry；
 *  供 HomeToolsService / FastPathService 使用。
 * 依赖：AreaService、EntityAreaEnrichmentService、StateStoreService。
 */
import { Injectable } from '@nestjs/common';
import { AreaService } from '../area/service';
import { EntityAreaEnrichmentService } from '../state-store/entity-area-enrichment.service';
import { StateStoreService } from '../state-store/service';

/** 与原 Aura Grid AreaService 对齐的房间视图，供智能管家工具/快路径使用 */
interface AgentAreaEntity {
  /** 实体 ID，形如 light.living_room */
  entityId: string;
}

/** 房间摘要：含 ID、名称、可选图标与关联实体列表 */
export interface AgentAreaSummary {
  /** 房间 ID（DB UUID 或 HA area_id） */
  id: string;
  /** 房间名称，如“客厅”“主卧” */
  name: string;
  /** 房间图标，可选 */
  icon?: string;
  /** 关联的 HA area_id（DB 房间可选链接） */
  haAreaId?: string;
  /** 房间内关联实体列表（findAll / findOne 均尽量填充，避免 N+1） */
  entities?: AgentAreaEntity[];
}

/**
 * 房间视图服务（@Injectable）。
 * DB Area 有数据时优先；否则回退 HA。
 */
@Injectable()
export class AgentAreaService {
  constructor(
    private readonly dbAreas: AreaService,
    private readonly enrichment: EntityAreaEnrichmentService,
    private readonly stateStore: StateStoreService,
  ) {}

  /**
   * 列出全部房间（含实体列表）。
   * DB 有记录时返回竖屏房间目录；否则回退 HA。
   * 一次 findAll 带 entities，避免调用方再逐房 findOne。
   */
  async findAll(): Promise<AgentAreaSummary[]> {
    const dbRows = await this.dbAreas.findAll();
    if (dbRows.length > 0) {
      // 批量补齐「DB 无 AreaEntity 但已链 HA area」的房间，避免逐房 ensureLoaded
      const needHa = dbRows.some((a) => Boolean(a.haAreaId));
      if (needHa) await this.enrichment.ensureLoaded();

      const out: AgentAreaSummary[] = [];
      for (const a of dbRows) {
        const entityIds = await this.unionEntityIds(
          (a.entities || []).map((e) => e.entityId),
          a.haAreaId,
          false,
        );
        out.push({
          id: a.id,
          name: a.name,
          icon: a.icon || undefined,
          haAreaId: a.haAreaId || undefined,
          entities: entityIds.map((entityId) => ({ entityId })),
        });
      }
      return out;
    }
    await this.enrichment.ensureLoaded();
    const haAreas = this.enrichment.getCachedHaAreas();
    const out: AgentAreaSummary[] = [];
    for (const a of haAreas) {
      const entityIds = await this.resolveHaEntityIds(a.id, false);
      out.push({
        id: a.id,
        name: a.name,
        entities: entityIds.map((entityId) => ({ entityId })),
      });
    }
    return out;
  }

  /**
   * 按 ID 或名称查询单个房间及关联实体。
   * UUID 走单条查询；名称匹配复用 findAll（已含实体，不再 N 次 findAll）。
   */
  async findOne(idOrName: string): Promise<AgentAreaSummary | null> {
    const trimmed = idOrName.trim();
    if (!trimmed) return null;

    // UUID / 精确 id：单条查询，避免每次 findAll
    try {
      const row = await this.dbAreas.findOne(trimmed);
      const entityIds = await this.unionEntityIds(
        (row.entities || []).map((e) => e.entityId),
        row.haAreaId,
        true,
      );
      return {
        id: row.id,
        name: row.name,
        icon: row.icon || undefined,
        haAreaId: row.haAreaId || undefined,
        entities: entityIds.map((entityId) => ({ entityId })),
      };
    } catch {
      /* 非 DB id 或未找到，继续名称 / HA 匹配 */
    }

    const all = await this.findAll();
    const lower = trimmed.toLowerCase();
    return (
      all.find((a) => a.id === trimmed) ??
      all.find((a) => a.haAreaId === trimmed) ??
      all.find((a) => a.name.toLowerCase() === lower) ??
      all.find((a) => a.name.toLowerCase().includes(lower)) ??
      null
    );
  }

  /** DB 房间绑定与 HA area_registry 实体并集，避免管家漏掉未手动绑到房间的灯 */
  private async unionEntityIds(
    dbIds: string[],
    haAreaId: string | null | undefined,
    ensure: boolean,
  ): Promise<string[]> {
    const set = new Set(dbIds.filter(Boolean));
    if (haAreaId) {
      for (const id of await this.resolveHaEntityIds(haAreaId, ensure)) set.add(id);
    }
    return [...set];
  }

  private async resolveHaEntityIds(haAreaId: string, ensure = true): Promise<string[]> {
    if (ensure) await this.enrichment.ensureLoaded();
    const fromIndex = new Set(this.enrichment.getEntityIdsByAreaId(haAreaId));
    for (const e of this.stateStore.getAll()) {
      const enriched = this.enrichment.enrichEntitySync(e);
      const aid = String(enriched.attributes?.area_id || '').trim();
      if (aid === haAreaId) fromIndex.add(e.entity_id);
    }
    return [...fromIndex];
  }
}
