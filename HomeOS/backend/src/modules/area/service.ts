/**
 * 所属模块：backend/modules/area
 * 职责：
 *  - 区域实体服务（持久化+HA区域映射+成员维护）；
 * 关键依赖：
 *  - shared/prisma、shared/ha；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { resolveRoomBackgroundUrl } from '@homeos/shared';
import { PrismaService } from '../../shared/prisma/service';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';
import { notFound } from '../../common/utils';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { BaseCrudService, type CrudWriteEvent } from '../../common/crud/base-crud.service';
import type { AreaGetPayload } from '../../generated/prisma/models';

/** 含实体绑定的房间记录类型（findAll / findOne / 写入返回形状） */
type AreaWithEntities = AreaGetPayload<{ include: { entities: true } }>;

@Injectable()
/**
 * AreaService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class AreaService
 */
export class AreaService extends BaseCrudService<'area'> {
  private readonly logger = new Logger(AreaService.name);

  constructor(
    prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super(prisma, { delegate: prisma.area, modelName: 'area' });
  }

  private emitUpdated(): void {
    this.eventEmitter.emit(HOMEOS_EVENTS.AREA_UPDATED);
  }

  /** 404 文案：保持既有「区域 {id} 不存在」 */
  protected override notFoundMessage(id: string): string {
    return API_ERROR.AREA_NOT_FOUND(id);
  }

  /** 列表查询：按 sortOrder 升序 + 实体按自身排序 + 上限 200（与原 findAll 一致） */
  protected override listFindArgs() {
    return {
      orderBy: { sortOrder: 'asc' },
      include: { entities: { orderBy: { sortOrder: 'asc' } } },
      take: 200,
    };
  }

  override async findAll(): Promise<AreaWithEntities[]> {
    return (await super.findAll()) as AreaWithEntities[];
  }

  override async findOne(id: string): Promise<AreaWithEntities> {
    const area = await this.delegate.findUnique({
      where: { id },
      include: { entities: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!area) notFound(API_ERROR.AREA_NOT_FOUND(id));
    return area as AreaWithEntities;
  }

  /**
   * 新建前载荷整理：icon/haAreaId 兜底、sortOrder 续尾（当前最大值 + 1）、
   * entityIds 转为嵌套创建（保留传入顺序作为实体初始排序）。
   */
  protected override async validateBeforeCreate(payload: Record<string, unknown>): Promise<void> {
    const maxSort = await this.prisma.area.aggregate({ _max: { sortOrder: true } });
    payload.icon = payload.icon || '🏠';
    payload.haAreaId = payload.haAreaId || null;
    payload.sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
    const entityIds = payload.entityIds;
    if (Array.isArray(entityIds) && entityIds.length > 0) {
      payload.entities = {
        create: entityIds.map((entityId, i) => ({ entityId, sortOrder: i })),
      };
    }
    delete payload.entityIds;
  }

  /** 写入返回关联装载：create 返回全部实体（与原实现一致不排序）；update 按实体排序返回 */
  protected override writeInclude(op: 'create' | 'update') {
    return op === 'create'
      ? { entities: true }
      : { entities: { orderBy: { sortOrder: 'asc' } } };
  }

  /** 写入成功后：创建/删除补日志，统一广播 AREA_UPDATED */
  protected override async afterWrite(event: CrudWriteEvent): Promise<void> {
    if (event.op === 'create') {
      const area = event.result as { name: string; id: string };
      this.logger.log(`区域已创建:${area.name} (${area.id})`);
    }
    if (event.op === 'remove') {
      this.logger.log(`区域已删除:${event.id}`);
    }
    this.emitUpdated();
  }

  async updateSort(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.area.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    this.emitUpdated();
  }

  async setEntities(areaId: string, entityIds: string[]) {
    await this.findOne(areaId);
    await this.prisma.areaEntity.deleteMany({ where: { areaId } });
    if (entityIds.length > 0) {
      await this.prisma.areaEntity.createMany({
        data: entityIds.map((entityId, i) => ({
          areaId,
          entityId,
          sortOrder: i,
        })),
      });
    }
    const area = await this.findOne(areaId);
    this.emitUpdated();
    return area;
  }

  /**
   * 从 HA 区域单向导入：新建未链接房间，或补齐已有房间的 haAreaId。
   * 不修改 HA 注册表。种子实体由调用方提供（应已排除 HA 禁用/隐藏项）。
   */
  async importFromHa(
    haAreas: Array<{ id: string; name: string }>,
    getEntityIds: (haAreaId: string) => string[],
    opts?: { seedEntities?: boolean },
  ): Promise<{ created: number; linked: number; total: number }> {
    const existing = await this.findAll();
    const byHa = new Map(
      existing.filter((a) => a.haAreaId).map((a) => [a.haAreaId as string, a]),
    );
    const byName = new Map(existing.map((a) => [a.name.toLowerCase(), a]));
    let created = 0;
    let linked = 0;
    const seed = opts?.seedEntities !== false;
    const maxSortAgg = await this.prisma.area.aggregate({ _max: { sortOrder: true } });
    let nextSort = (maxSortAgg._max.sortOrder ?? -1) + 1;

    for (const ha of haAreas) {
      const matched = byHa.get(ha.id) || byName.get(ha.name.toLowerCase());
      if (matched) {
        if (!matched.haAreaId) {
          await this.prisma.area.update({
            where: { id: matched.id },
            data: { haAreaId: ha.id },
          });
          linked += 1;
        }
        continue;
      }
      const entityIds = seed ? getEntityIds(ha.id) : [];
      const backgroundUrl =
        resolveRoomBackgroundUrl(ha.name) || resolveRoomBackgroundUrl(ha.id) || undefined;
      await this.prisma.area.create({
        data: {
          name: ha.name,
          icon: '🏠',
          haAreaId: ha.id,
          backgroundUrl,
          sortOrder: nextSort++,
          entities: entityIds.length
            ? {
                create: entityIds.map((entityId, i) => ({
                  entityId,
                  sortOrder: i,
                })),
              }
            : undefined,
        },
      });
      created += 1;
    }

    this.emitUpdated();
    const total = await this.prisma.area.count();
    this.logger.log(`从 HA 导入区域:新建=${created} 关联=${linked} 总计=${total}`);
    return { created, linked, total };
  }
}
