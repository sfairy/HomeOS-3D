/**
 * 所属模块：backend/modules/area
 * 职责：
 *  - 区域 REST 控制器（admin/adult/child 鉴权）；
 * 关键依赖：
 *  - modules/area/service、common/crud；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { HaConnectorService } from '../ha-connector/service';
import { EntityAreaEnrichmentService } from '../state-store/entity-area-enrichment.service';
import { AreaService } from './service';

@ApiTags('areas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('areas')
/**
 * AreaController：Nest @Controller REST 控制器。
 * - 处理路由前缀下的端点（HTTP 方法 + 路径 + DTO 校验）；
 * - 鉴权：默认 JwtAuthGuard + 角色守卫（@Roles 装饰器按方法细化）；
 * - 主要调用：同域 Service + 跨域编排工具；
 * @class AreaController
 */
export class AreaController {
  constructor(
    private readonly areaService: AreaService,
    private readonly enrichment: EntityAreaEnrichmentService,
    private readonly haConnector: HaConnectorService,
  ) {}

  @ApiOperation({ summary: '列出全部房间（含实体排序）' })
  @Roles('admin', 'adult', 'child')
  @Get()
  findAll() {
    return this.areaService.findAll();
  }

  @ApiOperation({ summary: '从 HA 区域单向导入到 DB Area（不改 HA）' })
  @Roles('admin', 'adult')
  @Post('import-from-ha')
  async importFromHa(@Body() body: { seedEntities?: boolean }) {
    await this.enrichment.ensureLoaded();
    try {
      await this.haConnector.fetchEntityRegistry();
    } catch {
      /* 注册表失败时 isEntitySyncable 会放行，避免导入被阻断 */
    }
    const haAreas = this.enrichment.getCachedHaAreas().map((a) => ({
      id: a.id,
      name: a.name,
    }));
    return this.areaService.importFromHa(
      haAreas,
      (haAreaId) =>
        this.enrichment
          .getEntityIdsByAreaId(haAreaId)
          .filter((entityId) => this.haConnector.isEntitySyncable(entityId)),
      { seedEntities: body?.seedEntities !== false },
    );
  }

  @ApiOperation({ summary: '批量更新房间排序' })
  @Roles('admin', 'adult')
  @Put('sort')
  async updateSort(@Body() body: { ids?: string[] }) {
    await this.areaService.updateSort(body.ids || []);
    return { ok: true };
  }

  @ApiOperation({ summary: '获取单个房间' })
  @Roles('admin', 'adult', 'child')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.areaService.findOne(id);
  }

  @ApiOperation({ summary: '创建房间' })
  @Roles('admin', 'adult')
  @Post()
  create(
    @Body()
    body: {
      name: string;
      icon?: string;
      backgroundUrl?: string;
      haAreaId?: string | null;
      entityIds?: string[];
    },
  ) {
    return this.areaService.create(body);
  }

  @ApiOperation({ summary: '更新房间' })
  @Roles('admin', 'adult')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      icon?: string;
      backgroundUrl?: string | null;
      haAreaId?: string | null;
      sortOrder?: number;
    },
  ) {
    return this.areaService.update(id, body);
  }

  @ApiOperation({ summary: '设置房间实体列表（含排序）' })
  @Roles('admin', 'adult')
  @Put(':id/entities')
  setEntities(@Param('id') id: string, @Body() body: { entityIds?: string[] }) {
    return this.areaService.setEntities(id, body.entityIds || []);
  }

  @ApiOperation({ summary: '删除房间' })
  @Roles('admin')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.areaService.remove(id);
    return { ok: true };
  }
}
