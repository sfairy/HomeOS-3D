/**
 * 智能管家房间视图服务。
 *
 * 职责：从 HA area_registry（经 EntityAreaEnrichmentService 补全的实体区域索引）构建
 *  房间 → 设备视图，供 HomeToolsService / FastPathService 使用。
 * 依赖：EntityAreaEnrichmentService、StateStoreService。
 *
 * 说明：原「本地 DB Area 优先、HA 回退」的双真相源已移除；房间目录统一以 HA 为准，
 *  避免本地影子数据盖住 HA 中更新的区域绑定。
 */
import { Injectable } from '@nestjs/common';
import { EntityAreaEnrichmentService } from '../state-store/entity-area-enrichment.service';
import { StateStoreService } from '../state-store/service';

/** 房间内的实体引用 */
interface AgentAreaEntity {
  /** 实体 ID，形如 light.living_room */
  entityId: string;
}

/** 房间摘要：含 ID、名称、可选图标与关联实体列表 */
export interface AgentAreaSummary {
  /** 房间 ID（HA area_registry.area_id） */
  id: string;
  /** 房间名称，如“客厅”“主卧” */
  name: string;
  /** 房间图标，可选 */
  icon?: string;
  /** 房间内关联实体列表（findAll / findOne 均尽量填充，避免 N+1） */
  entities?: AgentAreaEntity[];
}

/**
 * 房间视图服务（@Injectable）。
 * 数据源为 HA area_registry 与实体区域索引。
 */
@Injectable()
export class AgentAreaService {
  constructor(
    private readonly enrichment: EntityAreaEnrichmentService,
    private readonly stateStore: StateStoreService,
  ) {}

  /**
   * 列出全部房间（含实体列表）。
   * 一次遍历带齐实体，避免调用方再逐房 findOne。
   */
  async findAll(): Promise<AgentAreaSummary[]> {
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
   * 名称匹配复用 findAll（已含实体，不再 N 次 findAll）。
   */
  async findOne(idOrName: string): Promise<AgentAreaSummary | null> {
    const trimmed = idOrName.trim();
    if (!trimmed) return null;

    const all = await this.findAll();
    const lower = trimmed.toLowerCase();
    return (
      all.find((a) => a.id === trimmed) ??
      all.find((a) => a.name.toLowerCase() === lower) ??
      all.find((a) => a.name.toLowerCase().includes(lower)) ??
      null
    );
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
