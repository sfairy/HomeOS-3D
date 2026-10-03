/**
 * 通知模块 - 控制器
 *
 * 职责：
 * - 暴露通知列表查询、统计、标记已读、清空等 HTTP 接口
 * - 暴露全屋与用户级别的通知偏好（DND 时段、各类开关）读写接口
 * - 暴露告警规则（AlertRule）的 CRUD 与条件模拟测试接口
 *
 * 依赖：
 * - NotificationService：通知业务逻辑、入库、规则求值
 * - AppConfigService：读取 frontend / notification 配置以解析拉取条数上限
 * - JwtAuthGuard / RolesGuard：JWT 鉴权与角色（admin/adult/child）控制
 */
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { forbidden } from '../../common/utils/business-exception';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AppConfigService } from '../../shared/app-config/service';
import { resolveNotificationFetchLimit } from '../../common/alert-support/notification-channels.util';
import { parseOptionalInt } from '../../common/crud/pagination.util';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { NotificationService } from './service';
import type { AlertRule, NotificationPreferenceToggles } from './service';
import {
  UpdateNotificationSettingsDto,
  UpdateUserNotificationPreferencesDto,
  TestAlertRuleDto,
  CreateAlertRuleDto,
  UpdateAlertRuleDto,
} from './dto';
import { API_ERROR } from '../../common/errors/api-error-messages';

/**
 * 携带 JWT 解析后用户信息的请求类型。
 * - userId：当前登录用户 ID
 * - role：用户角色（admin / adult / child）
 * - notificationPrefs：JWT 中预加载的该用户通知偏好开关
 */
type AuthRequest = Request & {
  user?: {
    userId: string;
    role?: string;
    notificationPrefs?: NotificationPreferenceToggles;
    /** 实体访问前缀白名单（非 admin 用户） */
    restrictions?: string[];
  };
};

/**
 * 通知控制器（DI 角色：HTTP 入口）。
 * 路由前缀 `/notifications`，全部接口需 JWT 鉴权。
 */
@ApiTags('awareness')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * 获取通知列表。
   * @param limit 可选，期望返回条数；服务端会结合配置限制上限，避免客户端请求过大导致全量返回拖慢响应
   * @param source 可选，按通知来源过滤（前后空格会被裁剪）
   * @returns 通知数组（按创建时间倒序）
   */
  @ApiOperation({ summary: '获取通知列表' })
  @Get()
  getNotifications(
    @Req() req: AuthRequest,
    @Query('limit') limit?: string,
    @Query('source') source?: string,
  ) {
    // 限制 limit 上限，避免客户端请求过大导致全量返回拖慢响应
    const safeLimit = resolveNotificationFetchLimit(
      parseOptionalInt(limit),
      this.appConfig.get('frontend'),
      this.appConfig.get('notification'),
    );
    return this.notificationService.getNotifications(
      safeLimit,
      source?.trim() || undefined,
      req.user?.restrictions,
    );
  }

  /**
   * 获取通知统计数据（总数 / 未读 / 已投递 / 来源 / 级别 / 时间序列）。
   * @param hours 可选，统计时间窗口（小时），缺省由服务端回退到 24
   * @param source 可选，按通知来源过滤
   */
  @ApiOperation({ summary: '获取通知统计数据' })
  @UseGuards(RolesGuard)
  @Roles('admin', 'adult')
  @Get('stats')
  getStats(@Query('hours') hours?: string, @Query('source') source?: string) {
    return this.notificationService.getStats(
      parseOptionalInt(hours),
      source?.trim() || undefined,
    );
  }
  /**
   * 获取当前请求用户的通知与 DND（免打扰）设置视图。
   * 优先使用 JWT 中预加载的偏好，避免一次额外的 DB 查询。
   */
  @ApiOperation({ summary: '获取通知与 DND 设置' })
  @Get('settings')
  getSettings(@Req() req: AuthRequest) {
    return this.notificationService.getSettings(req.user?.userId, req.user?.notificationPrefs);
  }

  /**
   * 更新免打扰时段与全屋通知开关（写入系统配置）。
   * 仅 admin 角色可修改 DND 时段，非 admin 触发 forbidden。
   * @param body 设置项（任意子集）
   */
  @ApiOperation({ summary: '更新免打扰时段与通知开关（全屋偏好）' })
  @UseGuards(RolesGuard)
  @Roles('admin', 'adult')
  @Put('settings')
  updateSettings(@Req() req: AuthRequest, @Body() body: UpdateNotificationSettingsDto) {
    if ((body.dndStart != null || body.dndEnd != null) && req.user?.role !== 'admin') {
      forbidden(API_ERROR.ACCESS_NOTIFY_DND_ADMIN);
    }
    return this.notificationService.updateSettings(body, req.user?.userId, req.user?.role);
  }

  /**
   * 更新当前用户的通知开关（写入 User.preferences.notification）。
   * 修改后会作废该用户的 JWT 缓存以使新偏好立即生效。
   * 未登录（无 userId）直接 forbidden。
   */
  @ApiOperation({ summary: '更新当前用户的通知开关（写入 User.preferences）' })
  @UseGuards(RolesGuard)
  @Roles('admin', 'adult', 'child')
  @Put('preferences')
  updatePreferences(
    @Req() req: Request & { user?: { userId?: string } },
    @Body() body: UpdateUserNotificationPreferencesDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      forbidden(API_ERROR.ACCESS_LOGIN_REQUIRED);
    }
    return this.notificationService.updateUserPreferences(userId, body);
  }

  /** 将全部通知标记为已读。 */
  @ApiOperation({ summary: '全部标记为已读' })
  @Roles('admin', 'adult', 'child')
  @Post('read-all')
  markAllAsRead() {
    return this.notificationService.markAllAsRead();
  }

  /** 清空所有通知（不可恢复，限 admin / adult）。 */
  @ApiOperation({ summary: '清空所有通知' })
  @Roles('admin', 'adult')
  @Post('clear')
  async clearAll() {
    await this.notificationService.clearAll();
    return { success: true };
  }

  /**
   * 标记单条通知为已读。
   * @param id 通知 ID
   */
  @ApiOperation({ summary: '标记通知为已读' })
  @Roles('admin', 'adult', 'child')
  @Post(':id/read')
  async markAsRead(@Param('id') id: string) {
    await this.notificationService.markAsRead(id);
    return { success: true };
  }

  /** 获取全部告警规则列表（含监控实体 ID 与条件，仅 admin/adult 可见）。 */
  @ApiOperation({ summary: '获取告警规则列表' })
  @UseGuards(RolesGuard)
  @Roles('admin', 'adult')
  @Get('rules')
  async getRules() {
    return this.notificationService.getRules();
  }

  /**
   * 模拟测试告警条件（不会真正发通知，便于规则编辑时预演）。
   * @param body 包含条件表达式、状态、属性
   */
  @ApiOperation({ summary: '模拟测试告警条件' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('rules/test')
  testRule(@Body() body: TestAlertRuleDto) {
    return this.notificationService.testCondition(
      body.condition || '',
      body.state ?? '',
      body.attributes,
    );
  }

  /**
   * 创建告警规则。
   * @param rule 规则定义（名称、条件、级别、渠道、冷却等）
   */
  @ApiOperation({ summary: '创建告警规则' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('rules')
  async createRule(@Body() rule: CreateAlertRuleDto) {
    return this.notificationService.addRule(rule as AlertRule);
  }

  /**
   * 更新告警规则（部分字段）。
   * @param ruleId 规则 ID
   * @param rule 待更新字段
   */
  @ApiOperation({ summary: '更新告警规则' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Put('rules/:ruleId')
  async updateRule(@Param('ruleId') ruleId: string, @Body() rule: UpdateAlertRuleDto) {
    return this.notificationService.updateRule(ruleId, rule);
  }

  /**
   * 删除告警规则。
   * @param ruleId 规则 ID
   */
  @ApiOperation({ summary: '删除告警规则' })
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Delete('rules/:ruleId')
  async deleteRule(@Param('ruleId') ruleId: string) {
    return this.notificationService.deleteRule(ruleId);
  }
}