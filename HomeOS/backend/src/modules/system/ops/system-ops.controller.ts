/**
 * 外部 API / 设备寿命 / 日程提醒 控制器
 *
 * 模块：system/ops
 * 职责：
 *  - 从原 SystemController 拆出，路由前缀 system/（保持向后兼容）
 *  - 外部 API：天气预警 / 日历事件 / 分时电价
 *  - 设备寿命 / 设备健康摘要
 *  - 日程提醒：今日 / 增删改查 / snooze / 预设包应用 / 清空
 *
 * 鉴权：JwtAuthGuard + RolesGuard，admin / adult 可访问。
 * 天气预警的 API Key 经请求头 x-openweather-key 传递，避免出现在访问日志 / Referer 中。
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { API_ERROR } from '../../../common/errors/api-error-messages';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { badRequest, rethrowIfHttpException } from '../../../common/utils/business-exception';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { AppConfigService } from '../../../shared/app-config/service';
import { ExternalApiService } from './external-api.service';
import { DeviceLifespanService } from '../device/lifespan.service';
import { DeviceHealthService } from '../device/health.service';
import { ScheduleReminderService } from '../lifestyle/schedule-reminder.service';
import { AddReminderDto, SnoozeReminderDto } from '../dto/system-ops.dto';

/**
 * 外部 API / 设备寿命 / 日程提醒 控制器（从 SystemController 拆出）
 *
 * 注入 5 个 Service，分别由 SystemOpsModule / 上层模块提供。
 */
@ApiTags('system')
@ApiBearerAuth()
@Controller('system')
export class SystemOpsController {
  /**
   * @param externalApi      外部 API 集成服务
   * @param lifespan         设备寿命服务
   * @param deviceHealth     设备健康服务
   * @param scheduleReminder 日程提醒服务
   * @param appConfig        应用配置（读取 external 段）
   */
  constructor(
    private readonly externalApi: ExternalApiService,
    private readonly lifespan: DeviceLifespanService,
    private readonly deviceHealth: DeviceHealthService,
    private readonly scheduleReminder: ScheduleReminderService,
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

  /** 获取设备寿命摘要 */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Get('device/lifespan')
  getDeviceLifespan() {
    return this.lifespan.getSummary();
  }

  @ApiOperation({ summary: '设备健康摘要（寿命 + 离线 + 固件更新）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Get('device-health/summary')
  getDeviceHealthSummary() {
    return this.deviceHealth.getSummary();
  }

  @ApiOperation({ summary: '获取今日日程提醒' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Get('schedule/reminders')
  getReminders() {
    return this.scheduleReminder.getTodayReminders();
  }

  /** 新增日程提醒（admin / adult） */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('schedule/reminders')
  addReminder(@Body() body: AddReminderDto) {
    return this.scheduleReminder.addSchedule(body);
  }

  @ApiOperation({ summary: '推迟日程提醒' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('schedule/reminders/snooze')
  snoozeReminder(@Body() body: SnoozeReminderDto) {
    if (!body.id) badRequest(API_ERROR.VALIDATION_ID_REQUIRED);
    return this.scheduleReminder.snooze(body.id, body.minutes || 60);
  }

  @ApiOperation({ summary: '获取全部日程提醒列表' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Get('schedule/reminders/all')
  getAllReminders() {
    return { all: this.scheduleReminder.getAllSchedules() };
  }

  @ApiOperation({ summary: '获取日程提醒预设包列表' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Get('schedule/reminders/presets')
  getReminderPresets() {
    return this.scheduleReminder.getPresets();
  }

  /**
   * 应用日程提醒预设包
   * @param presetId 预设 ID（如 waste-sorting）
   */
  @ApiOperation({ summary: '应用日程提醒预设包' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('schedule/reminders/presets/:presetId/apply')
  async applyReminderPreset(@Param('presetId') presetId: string) {
    try {
      return await this.scheduleReminder.applyPreset(presetId);
    } catch (err) {
      rethrowIfHttpException(err);
      badRequest((err as Error).message || '应用预设失败');
    }
  }
  @ApiOperation({ summary: '清除全部日程提醒' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('schedule/reminders/clear')
  clearAllReminders() {
    return this.scheduleReminder.clearAllSchedules();
  }

  /**
   * 更新日程提醒
   * @param id   提醒 ID
   * @param body 待更新字段（复用 AddReminderDto）
   * @throws BadRequestException 提醒不存在或更新失败
   */
  @ApiOperation({ summary: '更新日程提醒' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Put('schedule/reminders/:id')
  async updateReminder(@Param('id') id: string, @Body() body: AddReminderDto) {
    const updated = await this.scheduleReminder.updateSchedule(id, {
      type: body.type,
      label: body.label,
      icon: body.icon,
      frequency: body.frequency,
      dayOfWeek: body.dayOfWeek,
      customDays: body.customDays,
      time: body.time,
      color: body.color,
    });
    if (!updated) {
      badRequest(API_ERROR.SCHEDULE_UPDATE_FAILED);
    }
    return updated;
  }

  /**
   * 删除日程提醒
   * @param id 提醒 ID
   * @throws BadRequestException 删除失败
   */
  @ApiOperation({ summary: '删除日程提醒' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Delete('schedule/reminders/:id')
  async deleteReminder(@Param('id') id: string) {
    const result = await this.scheduleReminder.deleteSchedule(id);
    if (!result.success) {
      badRequest(API_ERROR.SCHEDULE_DELETE_FAILED);
    }
    return result;
  }
}