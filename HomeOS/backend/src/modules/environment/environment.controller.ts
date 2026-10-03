/**
 * 环境域 REST 控制器
 *
 * 所属模块：environment
 * 职责：
 *  - GET /environment/health：获取各房间环境健康读数（温湿度 / 露点 / PM2.5 / CO2 / TVOC / 风险等级）
 *  - POST /environment/iaq：按上传传感器读数计算 IAQ 综合指数（admin/adult/child 可调用）
 *  - GET /environment/trend：近 N 天每日均值趋势（温湿度 + 空气质量）
 *  - GET /environment/seasonal-tips：基于最新读数与季节的动态健康提醒
 *  - GET /environment/export：导出环境趋势 CSV（带 UTF-8 BOM 便于 Excel 识别）
 *  - GET /environment/water/statistics：近 N 天每日用水量、异常计数与预测
 *
 * 依赖：
 *  - EnvironmentHealthService / IaqService / EnvironmentHistoryService / WaterMonitorService：业务逻辑
 *  - EntityAreaEnrichmentService：HA area 维度补全，用于过滤已知区域传感器映射
 *  - JwtAuthGuard / RolesGuard：JWT 鉴权与角色守卫
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EnvironmentHealthService } from './health.service';
import { IaqService } from './iaq.service';
import { EnvironmentHistoryService } from './history.service';
import { WaterMonitorService } from './water-monitor.service';
import { EntityAreaEnrichmentService } from '../state-store/entity-area-enrichment.service';
import { filterEnvSensorMapToKnownAreas, type EnvSensorMap } from '@homeos/shared';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { ComputeIaqDto } from './dto';
import { localDateKey } from '../../common/utils';

/** 解析并限制 days 查询参数，非法值回落 defaultDays */
function parseDaysQuery(raw: string | undefined, defaultDays: number, max = 90): number {
  const n = parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return defaultDays;
  return Math.min(n, max);
}

/** 环境健康 / IAQ / 历史趋势 / 用水 */
@ApiTags('environment')
@ApiBearerAuth()
@Controller('environment')
export class EnvironmentController {
  constructor(
    private readonly envHealth: EnvironmentHealthService,
    private readonly iaq: IaqService,
    private readonly envHistory: EnvironmentHistoryService,
    private readonly waterMonitor: WaterMonitorService,
    private readonly entityAreaEnrichment: EntityAreaEnrichmentService,
  ) {}

  @ApiOperation({ summary: '获取房间环境健康读数' })
  @UseGuards(JwtAuthGuard)
  @Get('health')
  async getEnvironmentHealth() {
    await this.entityAreaEnrichment.ensureLoaded();
    const haAreas = this.entityAreaEnrichment.getCachedHaAreas();
    const sensorMap = filterEnvSensorMapToKnownAreas(
      this.envHealth.getSensorMap() as EnvSensorMap,
      haAreas,
    );
    return {
      rooms: this.envHealth.getAllReadings(),
      sensorMap,
      haAreas,
      timestamp: new Date().toISOString(),
    };
  }

  @ApiOperation({ summary: '计算 IAQ 综合指数' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult', 'child')
  @Post('iaq')
  computeIaq(@Body() body: ComputeIaqDto) {
    return this.iaq.compute(body);
  }

  @ApiOperation({ summary: '获取环境变化趋势' })
  @UseGuards(JwtAuthGuard)
  @Get('trend')
  getEnvTrend(@Query('days') days = '7', @Query('room') room?: string) {
    return this.envHistory.trend(parseDaysQuery(days, 7), room);
  }

  @ApiOperation({ summary: '获取季节性环境建议' })
  @UseGuards(JwtAuthGuard)
  @Get('seasonal-tips')
  getSeasonalTips() {
    return this.envHistory.seasonalTips();
  }

  @ApiOperation({ summary: '导出环境趋势 CSV' })
  @UseGuards(JwtAuthGuard)
  @Get('export')
  async exportEnvCsv(
    @Query('days') days = '30',
    @Query('room') room: string,
    @Res() res: Response,
  ) {
    const csv = await this.envHistory.exportTrendCsv(parseDaysQuery(days, 30), room || undefined);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="env-trend-${localDateKey()}.csv"`,
    );
    res.send('\uFEFF' + csv);
  }

  @ApiOperation({ summary: '获取用水统计' })
  @UseGuards(JwtAuthGuard)
  @Get('water/statistics')
  getWaterStatistics(@Query('days') days = '30') {
    return this.waterMonitor.getStatistics(parseDaysQuery(days, 30));
  }
}
