/**
 * 安防控制器（Security Controller）
 *
 * 所属模块：security
 * 职责：暴露安防相关 REST API，包括安防事件查询、Frigate AI 检测、mmWave 存在检测、
 *      异常活动检测、家庭成员在场汇总以及危险传感器演习接口。
 * 依赖：SecurityService、FrigateService、MmWavePresenceService、AnomalyDetectionService、
 *      PresenceService、HazardDrillService、AppConfigService。
 * 路由前缀：/api/v1/security
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsString, IsOptional, IsArray, IsIn } from 'class-validator';
import { AppConfigService } from '../../shared/app-config/service';
import { parseOptionalInt } from '../../common/crud/pagination.util';
import { SecurityService } from './service';
import { FrigateService } from './surveillance/frigate.service';
import { MmWavePresenceService } from './presence/mmwave-presence.service';
import { AnomalyDetectionService } from './surveillance/anomaly-detection.service';
import { PresenceService } from './presence/service';
import { HazardDrillService } from './hazard-drill.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';

/** 批量确认告警 DTO，承载需确认（dismiss）的告警 ID 列表。 */
class AckIdsDto {
  @IsOptional()
  @IsArray({ message: 'ids 须为数组' })
  @IsString({ each: true, message: 'ids 每项须为字符串' })
  ids?: string[];
}

/** 危险演习 DTO，指定演习类型（smoke / gas / leak），未传时默认 smoke。 */
class HazardDrillDto {
  @IsOptional()
  @IsIn(['smoke', 'gas', 'leak'], { message: 'kind 须为 smoke / gas / leak' })
  kind?: 'smoke' | 'gas' | 'leak';
}

/**
 * 安防控制器
 * 提供门铃事件、Frigate AI 检测、mmWave 存在检测等数据查询接口。
 * 路由前缀：/api/v1/security
 */
@ApiTags('awareness')
@ApiBearerAuth()
@Controller('security')
export class SecurityController {
  constructor(
    private readonly securityService: SecurityService,
    private readonly frigateService: FrigateService,
    private readonly mmWaveService: MmWavePresenceService,
    private readonly anomalyDetector: AnomalyDetectionService,
    private readonly presenceService: PresenceService,
    private readonly hazardDrill: HazardDrillService,
    private readonly appConfig: AppConfigService,
  ) {}

  /** 获取安防事件列表（门铃抓拍等），由 SecurityService 从 HA 抓取并排序后返回。 */
  @ApiOperation({ summary: '获取安防事件列表' })
  @Get('events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  async getEvents() {
    return this.securityService.fetchEvents();
  }

  /** 校验门禁事件 JSONL 文件路径连通性，返回配置状态与行数。仅 admin 可访问。 */
  @ApiOperation({ summary: '校验门禁事件 JSONL 路径连通性' })
  @Get('events/validate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  validateEvents() {
    return this.securityService.validateEventsPath();
  }

  /**
   * 获取 Frigate 最近检测事件。
   * @param limit 可选返回条数上限；未传时使用配置默认值 frigateMaxEvents。
   */
  @ApiOperation({ summary: '获取 Frigate 最近检测事件' })
  @Get('frigate/events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  getFrigateEvents(@Query('limit') limit?: string) {
    const defaultLimit = this.appConfig.get('security').frigateMaxEvents;
    const parsed = parseOptionalInt(limit, defaultLimit);
    return this.frigateService.getRecentEvents(parsed > 0 ? parsed : defaultLimit);
  }

  /** 批量确认（dismiss）Frigate 检测事件，已确认事件不再出现在列表中。 */
  @ApiOperation({ summary: '确认 Frigate 检测事件' })
  @Post('frigate/ack')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  ackFrigateEvents(@Body() body: AckIdsDto) {
    return this.frigateService.ackEvents(body?.ids || []);
  }

  /** 获取家庭成员在场汇总，基于 person / device_tracker 实体聚合判定是否有人在家。 */
  @ApiOperation({ summary: '获取家庭成员在场汇总（person/device_tracker）' })
  @Get('presence/home')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  getHomePresence() {
    return this.presenceService.getHomePresenceResponse();
  }

  /** 获取 mmWave 毫米波存在检测的房间级汇总（占用/空置房间数等）。 */
  @ApiOperation({ summary: '获取 mmWave 存在检测汇总' })
  @Get('presence/summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  getMmWaveSummary() {
    return this.mmWaveService.getSummary();
  }

  /** 获取异常活动检测当前状态：房间停留、全屋静默时长与活跃告警列表。 */
  @ApiOperation({ summary: '获取异常活动检测状态' })
  @Get('anomaly/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  getAnomalyStatus() {
    return this.anomalyDetector.getStatus();
  }

  /**
   * 获取活动基线汇总（学习自 EventLog），可按 room 过滤。
   * @param room 可选房间名；提供时仅返回该房间的基线数据。
   */
  @ApiOperation({ summary: '获取活动基线汇总（学习自 EventLog）' })
  @Get('anomaly/baselines')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  getAnomalyBaselines(@Query('room') room?: string) {
    if (room) {
      return this.anomalyDetector.getBaselinesSummary().then((summary) => ({
        ...summary,
        rooms: { [room]: summary.rooms[room] || [] },
        roomCount: summary.rooms[room] ? 1 : 0,
      }));
    }
    return this.anomalyDetector.getBaselinesSummary();
  }

  /** 批量确认异常活动告警，已确认告警在条件解除前不再展示。 */
  @ApiOperation({ summary: '确认异常活动告警' })
  @Post('anomaly/ack')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  ackAnomalyAlerts(@Body() body: AckIdsDto) {
    return this.anomalyDetector.ackAlerts(body?.ids || []);
  }

  /**
   * 触发安全传感器演习（仅通知 + 紧急场景，不关阀/排风）。
   * @param body 演习类型 DTO；kind 为 'gas'/'leak'/'smoke'，未识别时降级为 'smoke'。
   */
  @ApiOperation({ summary: '安全传感器演习（仅通知+场景，不关阀）' })
  @Post('hazard/drill')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  runHazardDrill(@Body() body: HazardDrillDto) {
    const kind = body?.kind === 'gas' || body?.kind === 'leak' ? body.kind : 'smoke';
    return this.hazardDrill.runDrill(kind);
  }
}
