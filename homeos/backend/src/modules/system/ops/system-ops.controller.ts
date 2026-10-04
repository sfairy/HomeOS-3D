/**
 * 外部 API / 设备健康 控制器
 *
 * 模块：system/ops
 * 职责：
 *  - 从原 SystemController 拆出，路由前缀 system/（保持向后兼容）
 *  - 外部 API：天气预警 / 日历事件 / 分时电价
 *  - 设备健康摘要
 *
 * 鉴权：JwtAuthGuard + RolesGuard，admin / adult 可访问。
 * 天气预警的 API Key 经请求头 x-openweather-key 传递，避免出现在访问日志 / Referer 中。
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { AppConfigService } from '../../../shared/app-config/service';
import { ExternalApiService } from './external-api.service';
import { DeviceHealthService } from '../device/health.service';

/**
 * 外部 API / 设备健康 控制器（从 SystemController 拆出）
 *
 * 注入 3 个 Service，分别由 SystemOpsModule / 上层模块提供。
 */
@ApiTags('system')
@ApiBearerAuth()
@Controller('system')
export class SystemOpsController {
  /**
   * @param externalApi  外部 API 集成服务
   * @param deviceHealth 设备健康服务
   * @param appConfig    应用配置（读取 external 段）
   */
  constructor(
    private readonly externalApi: ExternalApiService,
    private readonly deviceHealth: DeviceHealthService,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * 获取天气预警。
   * 经纬度优先用 query 参数，缺省回退到 external 配置；API Key 优先用请求头。
   *
   * @param lat  纬度（可选）
   * @param lon  经度（可选）
   * @param apiKey OpenWeather API Key（经 x-openweather-key 请求头传递）
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Get('external/weather-alerts')
  async getWeatherAlerts(
    @Query('lat') lat?: string,
    @Query('lon') lon?: string,
    // API Key 经请求头传递，避免出现在访问日志 / Referer 中
    @Headers('x-openweather-key') apiKey?: string,
  ) {
    const ext = this.appConfig.get('external');
    const useLat = lat ? parseFloat(lat) : ext.weatherLat;
    const useLon = lon ? parseFloat(lon) : ext.weatherLon;
    const useKey = apiKey || ext.openWeatherApiKey || process.env.OPENWEATHER_API_KEY || '';
    return this.externalApi.fetchOpenWeatherAlerts(useLat, useLon, useKey);
  }

  /** 获取已同步的日历事件列表 + 当前是否外出 + 即将到来的外出事件 */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Get('external/calendar-events')
  getCalendarEvents() {
    return this.externalApi.getCalendarEvents();
  }

  @ApiOperation({ summary: '获取当前分时电价（峰谷平）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Get('external/electricity-price')
  getElectricityPrice() {
    return this.externalApi.getCurrentPrice();
  }

  @ApiOperation({ summary: '动态电价 API：今日时段表 + 当前时段（配置后可用）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Get('external/dynamic-pricing')
  getDynamicPricing() {
    return this.externalApi.getDynamicPricing();
  }

  @ApiOperation({ summary: '立即同步一次动态电价 API' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('external/dynamic-pricing/sync')
  syncDynamicPricing() {
    return this.externalApi.syncDynamicPricing();
  }

  @ApiOperation({ summary: '设备健康摘要（离线 + 固件更新）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Get('device-health/summary')
  getDeviceHealthSummary() {
    return this.deviceHealth.getSummary();
  }
}