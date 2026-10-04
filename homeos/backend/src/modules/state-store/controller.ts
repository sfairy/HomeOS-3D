/**
 * 实体状态 REST 控制器
 *
 * 职责：
 *  - 提供实体列表查询（分页 / 游标 / 搜索 / 域过滤 / 区域过滤 / 状态过滤）
 *  - 提供增量变更查询（基于 recentChanges 环形缓冲）
 *  - 提供实体反向引用查询与解绑
 *  - 提供批量区域更新、批量冷补全（batch/get）、单实体刷新（refresh=ha 从 HA 拉取最新）
 * 依赖：StateStoreService、EntityAreaEnrichmentService、EntityReferencesService、HaRegistryQueryService、HaEntitySyncFilterService、AppConfigService
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Post, Query, Param, UseGuards, Req } from '@nestjs/common';
import { forbidden, notFound } from '../../common/utils/business-exception';
import { StateStoreService } from './service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HaRegistryQueryService } from '../../shared/ha/entity-state-bridge.service';
import { HaEntitySyncFilterService } from '../../shared/ha/entity-sync-filter.service';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { filterEntitiesByAccess, isEntityAllowed, resolveEntityRestrictions } from '@homeos/shared';
import { AppConfigService } from '../../shared/app-config/service';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { sliceEntitiesByCursor } from './internals';
import {
  filterEntitiesByQuery,
  normalizeEntitySortFilter,
  normalizeEntityStatusFilter,
} from './internals';
import { EntityAreaEnrichmentService } from './entity-area-enrichment.service';
import { EntityReferencesService } from './entity-references.service';
import { StateStoreQueryDto, UnlinkEntityReferenceDto } from './dto';
import { parseCrudPagination } from '../../common/crud/pagination.util';
import type { HaEntity } from '../../shared/types';
import { parseBooleanQuery } from '../../common/utils/parse-boolean.util';

/**
 * 实体状态 REST 控制器
 *
 * 性能优化：
 *  - GET /entities 短时缓存（500ms），大户型频繁轮询时避免重复数组分配
 *  - 缓存按 (role, restrictions, domain, search, page, limit) 分隔
 */
@ApiTags('connect')
@ApiBearerAuth()
@Controller('entities')
export class StateStoreController {
  constructor(
    private readonly stateStore: StateStoreService,
    private readonly appConfig: AppConfigService,
    private readonly registryQuery: HaRegistryQueryService,
    private readonly entitySyncFilter: HaEntitySyncFilterService,
    private readonly entityAreaEnrichment: EntityAreaEnrichmentService,
    private readonly entityReferences: EntityReferencesService,
  ) {}

  /** GET /entities 短时缓存槽（单条，按 cacheKey 命中） */
  private restCache: { key: string; data: unknown; at: number } | null = null;

  private get restCacheTtlMs() {
    return this.appConfig.get('stateStore').restCacheTtlMs;
  }

  @ApiOperation({ summary: '获取实体列表（page/limit 或 cursor/limit 分页 + 短时缓存）' })
  @UseGuards(JwtAuthGuard)
  @Get()
  /**
   * 获取实体列表（支持 page/limit 分页或 cursor/limit 游标分页 + 500ms 短时缓存）。
   * @remarks 缓存 key 按 (role, restrictions, domain, search, status, area, sort, controllable, page, limit, cursor) 分隔。
   *          游标分页优先于页码分页（cursor 存在或 page<=0 时走游标）。
   */
  async getAllEntities(
    @Req() req: { user?: { role?: string; restrictions?: string[] } },
    @Query('domain') domain: string,
    @Query('search') search: string,
    @Query('status') status?: string,
    @Query('area') area?: string,
    @Query('sort') sort?: string,
    @Query('controllable') controllable?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const role = req.user?.role || 'anon';
    const restrictions = resolveEntityRestrictions(req.user);
    const restrictionsKey =
      restrictions === null ? '*' : restrictions.length ? [...restrictions].sort().join(',') : '';
    const cacheKey = `${role}|${restrictionsKey}|${domain || ''}|${search || ''}|${status || ''}|${area || ''}|${sort || ''}|${controllable || ''}|${page || ''}|${limit || ''}|${cursor || ''}`;
    const now = Date.now();
    if (
      this.restCache &&
      this.restCache.key === cacheKey &&
      now - this.restCache.at < this.restCacheTtlMs
    ) {
      return this.restCache.data;
    }

    let entities = filterEntitiesByAccess(this.stateStore.getAll(domain), req.user);

    if (search) {
      const lower = search.toLowerCase();
      entities = entities.filter(
        (e) =>
          e.entity_id.toLowerCase().includes(lower) ||
          String(e.attributes?.friendly_name || '')
            .toLowerCase()
            .includes(lower),
      );
    }

    entities = await this.entityAreaEnrichment.enrichEntities(entities);

    entities = filterEntitiesByQuery(entities, {
      status: normalizeEntityStatusFilter(status),
      area: area?.trim() || '',
      sort: normalizeEntitySortFilter(sort) || 'name_asc',
      controllable: parseBooleanQuery(controllable),
    });

    const { pageNum, pageSize } = parseCrudPagination(page, limit, { maxSize: 2000 });
    // 游标分页优先：cursor 存在或未指定 page 时走游标模式，避免大偏移量分页性能退化
    const useCursor = pageSize > 0 && (cursor !== undefined || pageNum <= 0);

    let result: unknown;
    if (useCursor) {
      const {
        entities: slice,
        total,
        nextCursor,
      } = sliceEntitiesByCursor(entities, cursor || undefined, pageSize);
      result = {
        count: slice.length,
        total,
        cursor: cursor || null,
        nextCursor,
        pageSize,
        entities: slice,
        haSynced: this.stateStore.isHaSynced(),
        storeTotal: this.stateStore.getCount(),
      };
    } else {
      const total = entities.length;
      const effectivePage = Math.max(1, pageNum);

      if (pageSize > 0 && effectivePage > 0) {
        const skip = (effectivePage - 1) * pageSize;
        const slice = entities.slice(skip, skip + pageSize);
        result = {
          count: slice.length,
          total,
          page: effectivePage,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
          entities: slice,
          haSynced: this.stateStore.isHaSynced(),
          storeTotal: this.stateStore.getCount(),
        };
      } else {
        result = {
          count: total,
          entities,
          haSynced: this.stateStore.isHaSynced(),
          storeTotal: this.stateStore.getCount(),
        };
      }
    }

    this.restCache = { key: cacheKey, data: result, at: now };
    return result;
  }

  @ApiOperation({
    summary: '获取自 since/lastEventId 以来的增量实体变更（基于 recentChanges 环形缓冲）',
  })
  @UseGuards(JwtAuthGuard)
  @Get('changed')
  /**
   * 获取自 since/lastEventId 以来的增量实体变更（基于 recentChanges 环形缓冲）。
   * @remarks 用于前端断线重连后补发缺失的状态变更。
   */
  async getChangedEntities(
    @Req() req: { user?: { role?: string; restrictions?: string[] } },
    @Query('since') since?: string,
    @Query('lastEventId') lastEventId?: string,
  ) {
    const sinceMs = since ? parseInt(since, 10) : 0;
    const minId = lastEventId ? parseInt(lastEventId, 10) : 0;
    const changes = this.stateStore.getRecentChangesSince(
      Number.isFinite(sinceMs) ? sinceMs : 0,
      Number.isFinite(minId) ? minId : 0,
    );
    let entities = filterEntitiesByAccess(
      changes.map((c) => c.new_state),
      req.user,
    );
    entities = await this.entityAreaEnrichment.enrichEntities(entities);
    return {
      count: entities.length,
      lastEventId: this.stateStore.getLatestChangeId(),
      timestamp: new Date().toISOString(),
      haSynced: this.stateStore.isHaSynced(),
      entities,
    };
  }

  @ApiOperation({ summary: '获取 HA 区域列表（area_registry）' })
  @UseGuards(JwtAuthGuard)
  @Get('areas/list')
  /** 获取 HA 区域列表（area_registry），附带注册表降级状态 */
  async listAreas() {
    const areas = await this.registryQuery.fetchAreaRegistry();
    const degraded = this.registryQuery.isRegistryDegraded();
    return {
      areas: areas.map((a) => ({ id: a.area_id, name: a.name || a.area_id })),
      registryDegraded: degraded,
      registryError: degraded ? this.registryQuery.getRegistryDegradedReason() : null,
    };
  }

  @ApiOperation({ summary: '查询引用该实体的功能配置（自动化/场景/绑定等）' })
  @UseGuards(JwtAuthGuard)
  @Get(':entity_id/references')
  /** 查询引用该实体的功能配置（自动化/场景/绑定等），按用户 restrictions 鉴权 */
  async getEntityReferences(
    @Req() req: { user?: { role?: string; restrictions?: string[] } },
    @Param('entity_id') entityId: string,
  ) {
    const restrictions = resolveEntityRestrictions(req.user);
    if (!isEntityAllowed(entityId, restrictions)) {
      forbidden(API_ERROR.ACCESS_ENTITY_FORBIDDEN);
    }
    return this.entityReferences.findReferences(entityId);
  }

  @ApiOperation({ summary: '从指定功能配置中移除对该实体的引用' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post(':entity_id/references/unlink')
  /** 从指定功能配置中移除对该实体的引用（admin/adult 权限） */
  async unlinkEntityReference(
    @Req() req: { user?: { role?: string; restrictions?: string[] } },
    @Param('entity_id') entityId: string,
    @Body() body: UnlinkEntityReferenceDto,
  ) {
    const restrictions = resolveEntityRestrictions(req.user);
    if (!isEntityAllowed(entityId, restrictions)) {
      forbidden(API_ERROR.ACCESS_ENTITY_FORBIDDEN);
    }
    return this.entityReferences.removeReference(entityId, {
      kind: body?.kind as never,
      id: String(body?.id || ''),
      detail: body?.detail,
    });
  }

  @ApiOperation({
    summary: '批量获取实体状态（冷补全；缺失 ID 记入 missing，始终 200）',
  })
  @UseGuards(JwtAuthGuard)
  @Post('batch/get')
  /**
   * 按 ID 批量读取缓存中的实体状态（冷实体 hydrate）。
   * @remarks 单条缺失不抛 404，统一返回 missing，避免布局陈旧引用 / 未启用生活指数刷屏。
   *          无权限的 ID 记入 forbidden，不出现在 entities。不做 refresh=ha。
   */
  async batchGetEntities(
    @Req() req: { user?: { role?: string; restrictions?: string[] } },
    @Body() body: StateStoreQueryDto,
  ) {
    const rawIds = Array.isArray(body?.entity_ids) ? body.entity_ids : [];
    const entityIds = [
      ...new Set(rawIds.map((id) => String(id || '').trim()).filter(Boolean)),
    ].slice(0, 100);
    const restrictions = resolveEntityRestrictions(req.user);
    const found: HaEntity[] = [];
    const missing: string[] = [];
    const forbiddenIds: string[] = [];

    for (const entityId of entityIds) {
      if (!isEntityAllowed(entityId, restrictions)) {
        forbiddenIds.push(entityId);
        continue;
      }
      const entity = this.stateStore.getById(entityId);
      if (!entity) {
        missing.push(entityId);
        continue;
      }
      found.push(entity);
    }

    const entities = found.length ? await this.entityAreaEnrichment.enrichEntities(found) : [];
    return {
      count: entities.length,
      entities,
      missing,
      forbidden: forbiddenIds,
    };
  }

  @ApiOperation({ summary: '批量更新实体所属房间（HA entity_registry）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('batch/area')
  /**
   * 批量更新实体所属房间（调用 HA entity_registry API）。
   * @remarks 更新后失效 REST 缓存与区域索引，并广播区域变更。
   *          无权限的实体跳过并记入 errors，不阻断其余实体的更新。
   */
  async batchUpdateEntityArea(
    @Req() req: { user?: { role?: string; restrictions?: string[] } },
    @Body() body: StateStoreQueryDto,
  ) {
    const entityIds = Array.isArray(body?.entity_ids) ? body.entity_ids.filter(Boolean) : [];
    const areaId = String(body?.area_id ?? '').trim();
    if (!entityIds.length) {
      return { success: false, message: '未指定实体', updated: 0 };
    }

    let updated = 0;
    const errors: string[] = [];
    const updatedIds: string[] = [];
    for (const entityId of entityIds) {
      if (!isEntityAllowed(entityId, resolveEntityRestrictions(req.user))) {
        errors.push(entityId);
        continue;
      }
      try {
        await this.registryQuery.updateEntityArea(entityId, areaId);
        updated++;
        updatedIds.push(entityId);
      } catch {
        errors.push(entityId);
      }
    }

    this.restCache = null;
    this.entityAreaEnrichment.invalidate();
    await this.entityAreaEnrichment.publishEntityAreaUpdates(updatedIds);
    return {
      success: updated > 0,
      updated,
      failed: errors.length,
      errors: errors.slice(0, 10),
    };
  }

  @ApiOperation({ summary: '根据 ID 获取实体状态（refresh=ha 时从 HA 拉取最新并回写缓存）' })
  @UseGuards(JwtAuthGuard)
  @Get(':entity_id')
  /**
   * 根据 ID 获取实体状态。
   * @param refresh refresh=ha 或 refresh=1 时从 HA 拉取最新状态并回写缓存（热路径）
   * @remarks 实体不在同步白名单内时返回 404；刷新成功后通过 applyStateChangedHot 回写并返回补全后状态。
   */
  async getEntity(
    @Req() req: { user?: { role?: string; restrictions?: string[] } },
    @Param('entity_id') entityId: string,
    @Query('refresh') refresh?: string,
  ) {
    const restrictions = resolveEntityRestrictions(req.user);
    if (!isEntityAllowed(entityId, restrictions)) {
      forbidden(API_ERROR.ACCESS_ENTITY_FORBIDDEN);
    }

    const shouldRefresh = refresh === 'ha' || refresh === '1';
    if (shouldRefresh) {
      const live = await this.registryQuery.fetchEntityState(entityId);
      if (live) {
        if (!this.entitySyncFilter.isEntitySyncable(entityId)) {
          notFound(API_ERROR.ENTITY_NOT_FOUND(entityId));
        }
        const cached = this.stateStore.getById(entityId);
        const [enriched] = await this.entityAreaEnrichment.enrichEntities([live]);
        this.stateStore.applyStateChangedHot({
          entity_id: entityId,
          old_state: cached ?? null,
          new_state: enriched,
          changed_at: new Date().toISOString(),
        });
        return enriched;
      }
    }

    const entity = this.stateStore.getById(entityId);
    if (!entity) {
      notFound(API_ERROR.ENTITY_NOT_FOUND(entityId));
    }
    const [enriched] = await this.entityAreaEnrichment.enrichEntities([entity]);
    return enriched;
  }
}
