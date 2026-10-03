/**
 * 安防面板控制器（Security Panel Controller）
 *
 * 所属模块：security / panel
 * 职责：暴露安防面板 REST API，包括布防/撤防、区域配置、紧急求助、
 *      事件历史查询以及离家模拟的启用/禁用/状态查询。
 * 依赖：SecurityPanelService、AwaySimulationService。
 * 路由前缀：/api/v1/security-panel
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { parseOptionalInt } from '../../../common/crud/pagination.util';
import { SecurityPanelService, SecurityZone, ArmingMode } from './security-panel.service';
import { AwaySimulationService } from '../surveillance/away-simulation.service';
import {
  ArmSecurityPanelDto,
  ConfigureSecurityZonesDto,
  SecurityEmergencyDto,
  AwaySimEnableDto,
} from './security-panel.dto';

/**
 * 安防面板控制器
 *
 * DI 角色：@Controller，全局使用 JwtAuthGuard 守卫；写操作（arm/disarm/zones/emergency/away-sim）
 * 额外加 RolesGuard 限制 admin 角色。读操作（status/events/away-sim 状态）仅需登录。
 */
@ApiTags('awareness')
@ApiBearerAuth()
@Controller('security-panel')
@UseGuards(JwtAuthGuard)
export class SecurityPanelController {
  constructor(
    private readonly securityPanel: SecurityPanelService,
    private readonly awaySim: AwaySimulationService,
  ) {}

  /** 获取安防面板当前状态：布防模式 + 所有区域配置（含传感器实体 ID，限 admin/adult）。 */
  @ApiOperation({ summary: '获取安防面板状态' })
  @UseGuards(RolesGuard)
  @Roles('admin', 'adult')
  @Get('status')
  getStatus() {
    return {
      mode: this.securityPanel.getMode(),
      zones: this.securityPanel.getZones(),
    };
  }

  /**
   * 布防安防面板。仅 admin 可调用。
   * @param body 包含 mode（disarmed/armed_home/armed_away/armed_night）与可选 zoneIds。
   */
  @ApiOperation({ summary: '布防' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('arm')
  arm(@Body() body: ArmSecurityPanelDto) {
    return this.securityPanel.arm(body.mode as ArmingMode, body.zoneIds);
  }

  /** 撤防安防面板（设置 mode=disarmed，关闭所有区域布防）。仅 admin 可调用。 */
  @ApiOperation({ summary: '撤防' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('disarm')
  disarm() {
    return this.securityPanel.disarm();
  }

  /**
   * 配置安防区域（覆盖式更新）。仅 admin 可调用。
   * @param body 包含 zones 数组，每个区域含 id/name/sensors/zoneType/roomId。
   */
  @ApiOperation({ summary: '配置安防区域' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('zones')
  configureZones(@Body() body: ConfigureSecurityZonesDto) {
    this.securityPanel.configureZones(body.zones as SecurityZone[]);
    return { success: true };
  }

  /**
   * 触发紧急求助（警报/灯光/场景联动）。仅 admin 可调用。
   * @param body 含 action 字段，未传时默认 panic。
   */
  @ApiOperation({ summary: '触发紧急事件' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('emergency')
  emergency(@Body() body: SecurityEmergencyDto) {
    return this.securityPanel.triggerEmergency(body.action || 'panic');
  }

  /**
   * 查询安防事件历史。
   * @param type 可选事件类型过滤（arm/disarm/alarm/hazard/emergency 等）
   * @param limit 可选返回条数上限
   */
  @ApiOperation({ summary: '查询安防事件历史' })
  @UseGuards(RolesGuard)
  @Roles('admin', 'adult')
  @Get('events')
  async getEvents(@Query('type') type?: string, @Query('limit') limit?: string) {
    return this.securityPanel.getEvents(type, parseOptionalInt(limit));
  }

  /** 获取离家模拟当前状态：是否启用、活跃时段、灯池/窗帘池大小等。 */
  @ApiOperation({ summary: '获取离家模拟状态' })
  @UseGuards(RolesGuard)
  @Roles('admin', 'adult')
  @Get('away-sim/status')
  awaySimStatus() {
    return this.awaySim.getStatus();
  }

  /** 获取离家模拟学习到的 hour x dow 开灯概率模式桶数据。 */
  @ApiOperation({ summary: '获取离家模拟学习模式（hour×dow 开灯概率）' })
  @UseGuards(RolesGuard)
  @Roles('admin', 'adult')
  @Get('away-sim/pattern')
  awaySimPattern() {
    return this.awaySim.getLearnedPattern();
  }

  /**
   * 启用离家模拟。仅 admin 可调用。
   * @param body 可选参数：lights 灯池、activeStartHour/activeEndHour 活跃时段。
   */
  @ApiOperation({ summary: '启用离家模拟' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('away-sim/enable')
  awaySimEnable(@Body() body: AwaySimEnableDto) {
    return this.awaySim.enable(body || {});
  }

  /** 禁用离家模拟并关闭上次点亮的灯。仅 admin 可调用。 */
  @ApiOperation({ summary: '禁用离家模拟' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('away-sim/disable')
  awaySimDisable() {
    return this.awaySim.disable();
  }
}
