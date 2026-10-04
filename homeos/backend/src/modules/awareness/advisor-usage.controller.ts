/**
 * @file advisor-usage.controller.ts
 * @module awareness
 * @description 顾问「设备使用统计」REST 控制器（路由前缀 system/，与 HEAD
 * system-advisor.controller.ts 中 usage 相关接口保持一致）。
 * 仅暴露：使用报告 / 使用汇总 / 单设备使用统计 / 清除统计 / 遗忘设备。
 *
 * 鉴权：
 *  - JwtAuthGuard 通用；清除统计接口叠加 RolesGuard + @Roles('admin', 'adult')
 *
 * 说明：每日建议、推荐、配置洞察、执行建议等接口依赖已移除的能源 / 环境 / 联动栈，
 * 故不在此恢复。
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { parseOptionalInt } from '../../common/crud/pagination.util';
import { AdvisorUsageService } from './advisor-usage.service';

/** 顾问设备使用统计（路由前缀 system/） */
@ApiTags('awareness')
@ApiBearerAuth()
@Controller('system')
export class AdvisorUsageController {
  constructor(private readonly advisor: AdvisorUsageService) {}

  @ApiOperation({ summary: '获取设备使用报告' })
  @UseGuards(JwtAuthGuard)
  @Get('advisor/report')
  getUsageReport() {
    return this.advisor.getUsageReport();
  }

  @ApiOperation({ summary: '获取设备使用统计汇总' })
  @UseGuards(JwtAuthGuard)
  @Get('advisor/usage/summary')
  getUsageSummary(@Query('days') days?: string) {
    return this.advisor.getUsageSummary(parseOptionalInt(days, 7));
  }

  @ApiOperation({ summary: '获取单设备使用统计' })
  @UseGuards(JwtAuthGuard)
  @Get('advisor/usage/:entityId')
  getEntityUsage(@Param('entityId') entityId: string, @Query('days') days?: string) {
    return this.advisor.getEntityUsage(entityId, parseOptionalInt(days, 7));
  }

  @ApiOperation({ summary: '清除设备使用统计记录' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('advisor/report/clear')
  clearUsageReport() {
    return this.advisor.clearUsageStats();
  }

  @ApiOperation({ summary: '检测可能遗忘开启的设备' })
  @UseGuards(JwtAuthGuard)
  @Get('advisor/forgotten')
  getForgottenDevices() {
    return this.advisor.getForgottenDevices();
  }
}
