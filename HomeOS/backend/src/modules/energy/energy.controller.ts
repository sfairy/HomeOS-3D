/**
 * @file energy.controller.ts
 * @module backend/src/modules
 *
 * 能源模块 - 控制器。
 *
 * 职责：
 * - 暴露能耗基线、阶梯电价分析、节能估算、光伏/储能监控的查询接口
 * - 暴露能耗趋势、日/月用量聚合、日环比、温度-功率关联、设备排名等查询
 * - 暴露分路用电计量（按分类名 → entity_id 列表）、能源预算设置与状态查询
 * - 暴露阶梯电价配置更新（admin）与能源时间线自愈触发接口
 *
 * 依赖：
 * - EnergyAnomalyService：能耗基线查询
 * - EnergyAnalyticsService：趋势 / 排名 / 关联分析 / 节能估算
 * - EnergySolarService：光伏/储能监控与峰谷调度
 * - TieredPricingService：阶梯电价配置与累加
 * - EnergyBudgetService：月度预算与超支告警
 * - EnergyTimelineHealService：从 HA history 回填时间线
 * - AppConfigService：解析分路 entity 与学习周期
 * - JwtAuthGuard / RolesGuard：JWT 鉴权与角色控制
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { badRequest } from '../../common/utils/business-exception';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { EnergyAnomalyService } from './anomaly.service';
import { EnergyAnalyticsService } from './analytics.service';
import { EnergySolarService } from './energy-solar.service';
import { TieredPricingService } from './tiered-pricing.service';
import { EnergyBudgetService } from './budget.service';
import { EnergyTimelineHealService } from './timeline-heal.service';
import { AppConfigService } from '../../shared/app-config/service';
import { buildCircuitMapFromEntityIds, parseCircuitEntityIds } from './circuit.util';
import { resolveEnergyChartHours } from '../../common/database/event-log-retention.util';
import {
  parseClampedInt,
  parseIntParam,
  parseOptionalInt,
} from '../../common/crud/pagination.util';
import {
  CircuitBreakdownDto,
  EnergyBudgetDto,
  UpdateTieredPricingDto,
} from './dto';

/**
 * 能源控制器（DI 角色：HTTP 入口）。
 * 路由前缀 `/energy`，全部接口需 JWT 鉴权；写操作仅 admin。
 */
@ApiTags('energy')
@ApiBearerAuth()
@Controller('energy')
export class EnergyController {
  constructor(
    private readonly energyAnomaly: EnergyAnomalyService,
    private readonly energyAnalytics: EnergyAnalyticsService,
    private readonly energySolar: EnergySolarService,
    private readonly pricing: TieredPricingService,
    private readonly energyBudget: EnergyBudgetService,
    private readonly energyHeal: EnergyTimelineHealService,
    private readonly appConfig: AppConfigService,
  ) {}

  @ApiOperation({ summary: '获取能耗基线' })
  @UseGuards(JwtAuthGuard)
  @Get('baseline')
  getEnergyBaseline(@Query('entityId') entityId: string) {
    if (!entityId) badRequest(API_ERROR.VALIDATION_ENTITY_ID_QUERY_REQUIRED);
    return this.energyAnomaly.getBaseline(entityId);
  }

  @ApiOperation({ summary: '获取阶梯电价分析' })
  @UseGuards(JwtAuthGuard)
  @Get('pricing')
  getPricing() {
    return this.pricing.getAnalysis();
  }

  @ApiOperation({ summary: '估算本月节能节省（峰谷错峰规则归因）' })
  @UseGuards(JwtAuthGuard)
  @Get('savings')
  getEnergySavings() {
    return this.energyAnalytics.getEstimatedSavings();
  }

  @ApiOperation({ summary: '光伏/储能发电监控（发电-用电-充电三流合一，日/周聚合）' })
  @UseGuards(JwtAuthGuard)
  @Get('solar')
  getSolarStatus(
    @Query('pvEntityIds') pvEntityIds?: string,
    @Query('batteryEntityId') batteryEntityId?: string,
  ) {
    // 手工配置兜底：显式传入的发电/电池实体优先于关键词自动识别
    const manualPv = (pvEntityIds || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.energySolar.getSolarOverview(manualPv, String(batteryEntityId || '').trim());
  }

  @ApiOperation({ summary: '更新阶梯电价配置' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Put('pricing')
  async updatePricing(@Body() body: UpdateTieredPricingDto) {
    await this.pricing.updateFromWidget(body);
    return this.pricing.getAnalysis();
  }

  @ApiOperation({ summary: '储能峰谷调度状态（谷充峰放，含上次决策与冷却）' })
  @UseGuards(JwtAuthGuard)
  @Get('storage-dispatch')
  getStorageDispatchStatus() {
    return this.energySolar.getStorageDispatchStatus();
  }

  @ApiOperation({ summary: '立即执行一次储能峰谷调度评估' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('storage-dispatch/run')
  runStorageDispatch() {
    return this.energySolar.storageDispatchOnce();
  }

  private resolveChartHours(hours?: string): number {
    const parsed = parseOptionalInt(hours);
    const requested =
      parsed != null && parsed > 0 ? parsed : resolveEnergyChartHours(this.appConfig.get('energy').learningPeriodDays);
    // 钳制到 1~168 小时（7 天），防止超长窗口导致取数/内存放大
    return Math.min(Math.max(requested, 1), 168);
  }

  @ApiOperation({ summary: '获取能源趋势' })
  @UseGuards(JwtAuthGuard)
  @Get('trend')
  getEnergyTrend(@Query('entityId') entityId: string, @Query('hours') hours: string) {
    if (!entityId) badRequest(API_ERROR.VALIDATION_ENTITY_ID_REQUIRED);
    return this.energyAnalytics.getTrendWithMeta(entityId, this.resolveChartHours(hours));
  }

  @ApiOperation({ summary: '能耗日用量聚合（无 Redis 回退，EnergyUsageDaily）' })
  @UseGuards(JwtAuthGuard)
  @Get('usage/daily')
  getEnergyUsageDaily(@Query('entityId') entityId: string, @Query('days') days?: string) {
    if (!entityId) badRequest(API_ERROR.VALIDATION_ENTITY_ID_REQUIRED);
    return this.energyAnalytics.getUsageDaily(entityId, parseClampedInt(days, 30, 1, 62));
  }

  @ApiOperation({ summary: '能耗月用量聚合（无 Redis 回退，EnergyUsageMonthly）' })
  @UseGuards(JwtAuthGuard)
  @Get('usage/monthly')
  getEnergyUsageMonthly(@Query('entityId') entityId: string, @Query('months') months?: string) {
    if (!entityId) badRequest(API_ERROR.VALIDATION_ENTITY_ID_REQUIRED);
    return this.energyAnalytics.getUsageMonthly(entityId, parseClampedInt(months, 12, 1, 24));
  }

  @ApiOperation({ summary: '日环比能耗对比' })
  @UseGuards(JwtAuthGuard)
  @Get('compare')
  compareDayOverDay(@Query('entityId') entityId: string) {
    if (!entityId) badRequest(API_ERROR.VALIDATION_ENTITY_ID_REQUIRED);
    return this.energyAnalytics.compareDayOverDay(entityId);
  }

  @ApiOperation({ summary: '温度与功率关联分析' })
  @UseGuards(JwtAuthGuard)
  @Get('correlate')
  correlateEnergy(
    @Query('tempEntityId') tempEntityId: string,
    @Query('powerEntityIds') powerEntityIds: string,
  ) {
    if (!tempEntityId || !powerEntityIds) badRequest(API_ERROR.VALIDATION_PARAMS_REQUIRED);
    return this.energyAnalytics.correlateTemperatureAndPower(
      tempEntityId,
      powerEntityIds.split(','),
    );
  }

  @ApiOperation({ summary: '设备能耗排名' })
  @UseGuards(JwtAuthGuard)
  @Get('ranking')
  getEnergyRanking(@Query('limit') limit: string) {
    return this.energyAnalytics.getDeviceEnergyRanking(parseIntParam(limit, 10));
  }

  @ApiOperation({ summary: '分路用电计量' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult', 'child')
  @Post('circuit-breakdown')
  async getCircuitBreakdown(@Body() body: CircuitBreakdownDto) {
    if (!body.circuitMap || Object.keys(body.circuitMap).length === 0) {
      badRequest(API_ERROR.VALIDATION_CIRCUIT_MAP_REQUIRED);
    }
    return this.energyAnalytics.getCircuitBreakdown(
      body.circuitMap,
      this.resolveChartHours(body.hours),
    );
  }

  @ApiOperation({ summary: '已配置分路用电（读取 AppConfig.energy.circuitEntityIds）' })
  @UseGuards(JwtAuthGuard)
  @Get('circuit-breakdown/configured')
  async getConfiguredCircuitBreakdown(@Query('hours') hours?: string) {
    const energy = this.appConfig.get('energy');
    const ids = parseCircuitEntityIds(energy);
    if (!ids.length) {
      return {
        configured: false,
        meterEntityId: energy.meterEntityId || '',
        circuitEntityIds: [],
        message: '未配置分路 entity，请在首装向导或高级参数中绑定',
      };
    }
    const circuitMap = buildCircuitMapFromEntityIds(ids);
    const breakdown = await this.energyAnalytics.getCircuitBreakdown(
      circuitMap,
      this.resolveChartHours(hours),
    );
    return {
      configured: true,
      meterEntityId: energy.meterEntityId || '',
      circuitEntityIds: ids,
      ...breakdown,
    };
  }

  @ApiOperation({ summary: '获取能源预算状态' })
  @UseGuards(JwtAuthGuard)
  @Get('budget')
  getEnergyBudget() {
    return this.energyBudget.getStatus();
  }

  @ApiOperation({ summary: '设置能源预算' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Put('budget')
  setEnergyBudget(@Body() body: EnergyBudgetDto) {
    return this.energyBudget.setBudget(body);
  }

  @ApiOperation({ summary: '从 HA history 自愈回填 Redis 能源时间线' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('heal')
  healEnergyTimeline(
    @Body() body: { entityId?: string; hours?: number },
    @Query('entityId') entityIdQ?: string,
    @Query('hours') hoursQ?: string,
  ) {
    const entityId = body?.entityId || entityIdQ || '';
    if (!entityId) badRequest(API_ERROR.VALIDATION_ENTITY_ID_REQUIRED);
    const hours = Number(body?.hours ?? hoursQ) || 24;
    return this.energyHeal.healFromHaHistory(entityId, hours);
  }
}
