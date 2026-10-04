/**
 * 职责：
 *  - 事件日志控制器（历史/时间线/统计/对比/管理清理）；
 * 关键依赖：
 *  - event-log/service.ts、report.service、auth guards；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Delete, Get, Query, Req, UseGuards } from '@nestjs/common';
import { forbidden } from '../../../common/utils/business-exception';
import { parseIntParam } from '../../../common/crud/pagination.util';
import { EventLogService } from './service';
import { ReportCompareService } from './report.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { isEntityAllowed } from '@homeos/shared';
import { resolveEventLogRestrictions } from './util';
import { parseBooleanQuery } from '../../../common/utils/parse-boolean.util';

/**
 * 事件日志 REST 控制器
 *
 * 职责：
 *  - 提供事件历史查询（分页 + 时间窗口 + 实体/域过滤）
 *  - 提供时间线部件查询（按实体列表）
 *  - 提供事件统计（按域 / 实体 / 时间聚合）
 *  - 提供查询元数据与全量清理（admin）
 * 依赖：EventLogService（委托到 EventLogQueryService）
 */

/**
 * 事件日志控制器
 *
 * DI 角色：@Controller('events')，由 StateStoreModule 注册。所有查询按 JWT restrictions
 * 实施实体级 ACL；无权访问的实体返回 403。全量清理需 admin 角色。
 */
@ApiTags('connect')
@ApiBearerAuth()
@Controller('events')
export class EventLogController {
  constructor(
    private readonly eventLogService: EventLogService,
    private readonly reportCompare: ReportCompareService,
  ) {}

  @ApiOperation({ summary: '事件历史查询元数据（保留天数与可选回溯窗口）' })
  @UseGuards(JwtAuthGuard)
  @Get('meta')
  /** 事件历史查询元数据（保留天数与可选回溯窗口） */
  getMeta() {
    return this.eventLogService.getQueryMeta();
  }

  @ApiOperation({ summary: '查询事件历史' })
  @UseGuards(JwtAuthGuard)
  @Get()
  /**
   * 查询事件历史（支持 entity_id / domain / hours / limit / page 参数）。
   * @remarks 按 restrictions 鉴权；无权查看指定实体时返回 403。
   */
  async getHistory(
    @Req() req: { user?: { role?: string; restrictions?: string[] } },
    @Query('entity_id') entityId?: string,
    @Query('domain') domain?: string,
    @Query('hours') hours?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    const restrictions = resolveEventLogRestrictions(req.user);
    if (entityId && !isEntityAllowed(entityId, restrictions)) {
      forbidden('无权查看该实体的事件');
    }
    const meta = this.eventLogService.getQueryMeta();
    return this.eventLogService.queryHistory(
      entityId,
      parseIntParam(hours, meta.maxQueryHours),
      parseIntParam(limit, 20),
      parseIntParam(page, 1),
      restrictions,
      domain?.trim() || undefined,
    );
  }

  @ApiOperation({ summary: '时间线部件：按实体列表查询近期变更' })
  @UseGuards(JwtAuthGuard)
  @Get('timeline')
  /**
   * 时间线部件：按 entity_ids（逗号分隔）查询近期变更。
   * @remarks entity_ids 经去重与 ACL 过滤后传入服务层。
   */
  async getTimeline(
    @Req() req: { user?: { role?: string; restrictions?: string[] } },
    @Query('entity_ids') entityIds: string,
    @Query('hours') hours?: string,
    @Query('limit') limit?: string,
    @Query('includeFullState') includeFullState?: string,
  ) {
    const restrictions = resolveEventLogRestrictions(req.user);
    const ids = entityIds
      ? entityIds
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : [];
    const meta = this.eventLogService.getQueryMeta();
    return this.eventLogService.queryTimelineEvents(
      ids,
      parseIntParam(hours, meta.timelineHours),
      parseIntParam(limit, meta.timelineLimit),
      restrictions,
      parseBooleanQuery(includeFullState),
    );
  }

  @ApiOperation({ summary: '获取事件统计' })
  @UseGuards(JwtAuthGuard)
  @Get('stats')
  /** 获取事件统计（按域 / 实体 / 时间聚合），按 restrictions 鉴权 */
  async getStats(
    @Req() req: { user?: { role?: string; restrictions?: string[] } },
    @Query('hours') hours?: string,
    @Query('entity_id') entityId?: string,
    @Query('domain') domain?: string,
  ) {
    const restrictions = resolveEventLogRestrictions(req.user);
    const meta = this.eventLogService.getQueryMeta();
    if (entityId && !isEntityAllowed(entityId, restrictions)) {
      forbidden('无权查看该实体的事件统计');
    }
    return this.eventLogService.getStats(
      parseIntParam(hours, meta.maxQueryHours),
      restrictions,
      entityId,
      domain?.trim() || undefined,
    );
  }

  @ApiOperation({ summary: '统计报表：周期对比（本周vs上周 / 本月vs上月）' })
  @UseGuards(JwtAuthGuard)
  @Get('reports/compare')
  /**
   * 统计报表周期对比：按 metric 聚合 EventLog / EnergyHourlyBaseline 相关源 / EnvironmentRecord /
   * DeviceUsageStat，返回当前周期与上一周期的按天序列、汇总差额与设备/房间横向对比。
   * @param metric energy | environment | events | device
   * @param granularity week | month
   * @param entity_ids 可选逗号分隔实体过滤（events / energy / device 生效）
   * @param field environment 子字段（temperature | humidity | iaq）
   */
  async getReportCompare(
    @Req() req: { user?: { role?: string; restrictions?: string[] } },
    @Query('metric') metric?: string,
    @Query('granularity') granularity?: string,
    @Query('entity_ids') entityIds?: string,
    @Query('field') field?: string,
  ) {
    const restrictions = resolveEventLogRestrictions(req.user);
    const ids = entityIds
      ? entityIds
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined;
    if (ids?.length && restrictions !== null) {
      for (const id of ids) {
        if (!isEntityAllowed(id, restrictions)) {
          forbidden('无权查看该实体的报表数据');
        }
      }
    }
    return this.reportCompare.compare({
      metric:
        metric === 'energy' || metric === 'environment' || metric === 'device'
          ? metric
          : 'events',
      granularity: granularity === 'month' ? 'month' : 'week',
      entityIds: ids,
      field: field === 'humidity' || field === 'iaq' ? field : 'temperature',
      restrictions,
    });
  }

  @ApiOperation({ summary: '清空全部事件历史（admin，不可恢复）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete()
  /** 清空全部事件历史（admin，不可恢复） */
  clearAll() {
    return this.eventLogService.clearAllRecords();
  }
}
