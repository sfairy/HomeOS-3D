/**
 * @file config.controller.ts
 * @module system
 * @description 系统运行参数配置 REST 控制器。从原 SystemController 拆出，路由前缀 system/，
 * 对外暴露公开配置（登录前）、按角色脱敏的运行参数配置读写、配置分区重置、配置导入、
 * 数据库保留表配置、房间元数据（含 HA area 与 envSensorMap 过滤）等接口。
 *
 * 鉴权：
 *  - 公开配置接口 @Public() 跳过 JWT；其余接口 JwtAuthGuard + RolesGuard，
 *    admin 可读写全部配置，adult/child 仅返回脱敏后的可读视图
 *
 * 依赖：
 *  - AppConfigService：配置读写与导出 / 导入
 *  - AppConfigBackupService：配置备份与导入校验
 *  - EntityAreaEnrichmentService：HA area 补全，用于公开房间元数据
 *  - DatabaseRetentionService：保留表配置读写
 *  - UpdateSystemConfigDto / ResetSystemConfigDto / UpdateRetentionConfigDto / ImportAppConfigDto：请求体校验
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { AppConfigService } from '../../shared/app-config/service';
import { parsePageLimit } from '../../common/crud/pagination.util';
import {
  UpdateSystemConfigDto,
  ResetSystemConfigDto,
  UpdateRetentionConfigDto,
} from './dto/system-config.dto';
import { Public } from '../auth/public.decorator';
import { pickConfigForRole } from '../../shared/app-config/config-mask.util';
import { AppConfigBackupService } from './backup/service';
import { ImportAppConfigDto } from './dto/system.dto';
import { EntityAreaEnrichmentService } from '../state-store/entity-area-enrichment.service';
import { resolveVoiceRooms } from '../../common/alert-support/voice-command.util';
import { buildPublicRoomMetaFromHaAreas, filterEnvSensorMapToKnownAreas } from '@homeos/shared';
import { DatabaseRetentionService } from '../../common/database/retention.service';
import { RETENTION_TABLE_KEYS, type RetentionTableKey } from '../../common/database/retention-tables';
import { badRequest } from '../../common/utils/business-exception';
import { API_ERROR } from '../../common/errors/api-error-messages';

/**
 * 系统运行参数配置（从巨型 SystemController 拆出，路由保持不变）
 */
@ApiTags('system')
@ApiBearerAuth()
@Controller('system')
export class SystemConfigController {
  constructor(
    private readonly appConfig: AppConfigService,
    private readonly appConfigBackup: AppConfigBackupService,
    private readonly entityAreaEnrichment: EntityAreaEnrichmentService,
    private readonly databaseRetention: DatabaseRetentionService,
  ) {}

  @ApiOperation({ summary: '获取公开系统配置' })
  @Public()
  @Get('config/public')
  async getPublicConfig() {
    // 区域索引后台加载；公开配置不无限等待注册表（避免 HA 慢时卡登录 8–15s）
    await Promise.race([
      this.entityAreaEnrichment.ensureLoaded(),
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ]);
    const base = this.appConfig.getPublic();
    const haAreas = this.entityAreaEnrichment.getCachedHaAreas();
    const envSensorMap = filterEnvSensorMapToKnownAreas(
      this.appConfig.get('envSensorMap'),
      haAreas,
    );
    const voice = base.voice as Record<string, unknown> | undefined;
    return {
      ...base,
      haAreas,
      voice: voice
        ? {
            ...voice,
            rooms: resolveVoiceRooms(envSensorMap, haAreas).map((room) => room.label),
          }
        : voice,
      roomMeta: buildPublicRoomMetaFromHaAreas(haAreas, envSensorMap),
    };
  }

  @ApiOperation({ summary: '获取系统配置变更审计（最近 50 条）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('config-audit')
  getConfigAudit(@Query('page') page?: string, @Query('limit') limit?: string) {
    const { pageNum, pageSize } = parsePageLimit(page, limit);
    if (pageNum > 0 && pageSize > 0) {
      return this.appConfig.getAuditLogPaginated(pageNum, pageSize);
    }
    return this.appConfig.getAuditLog(50);
  }

  @ApiOperation({ summary: '导出系统运行参数（备份③）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('config/export')
  exportConfig(@Query('maskSecrets') maskSecrets?: string) {
    const mask = maskSecrets !== 'false';
    return this.appConfigBackup.export(mask);
  }

  @ApiOperation({ summary: '导入系统运行参数（merge 或 replace）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('config/import')
  async importConfig(@Body() body: ImportAppConfigDto) {
    return this.appConfigBackup.import(body);
  }

  @ApiOperation({ summary: '获取完整系统配置' })
  @UseGuards(JwtAuthGuard)
  @Get('config')
  getSystemConfig(@Req() req: Request & { user?: { role?: string } }) {
    const data = this.appConfig.getAll();
    if (req.user?.role === 'admin') {
      return { ...data, _configAudit: this.appConfig.getAuditLog(50) };
    }
    return pickConfigForRole(data as unknown as Record<string, unknown>, req.user?.role);
  }

  @ApiOperation({ summary: '更新系统配置' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Put('config')
  async updateSystemConfig(
    @Body() body: UpdateSystemConfigDto,
    @Req() req: Request & { user?: { role?: string } },
  ) {
    const { expectedUpdatedAt, ...configPatch } = body;
    await this.appConfig.update(
      configPatch as Parameters<AppConfigService['update']>[0],
      expectedUpdatedAt ? { expectedUpdatedAt } : undefined,
    );
    const data = this.appConfig.getAll();
    if (req.user?.role === 'admin') {
      return { ...data, _configAudit: this.appConfig.getAuditLog(50) };
    }
    return pickConfigForRole(data as unknown as Record<string, unknown>, req.user?.role);
  }

  @ApiOperation({ summary: '重置系统配置' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('config/reset')
  async resetSystemConfig(@Body() body: ResetSystemConfigDto) {
    return this.appConfig.reset(body?.section as Parameters<AppConfigService['reset']>[0]);
  }

  @ApiOperation({ summary: '获取数据保留策略与最近一次清理统计' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('config/retention')
  async getRetentionConfig() {
    return this.buildRetentionOverview();
  }

  @ApiOperation({ summary: '更新各表数据保留天数（写回 SystemConfig 并即时生效）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Put('config/retention')
  async updateRetentionConfig(@Body() body: UpdateRetentionConfigDto) {
    const days = body.retention ?? {};
    // 白名单校验：拒绝未知表键（1~365 数值范围由 AppConfigService 校验层负责）
    const unknown = Object.keys(days).filter(
      (k) => !RETENTION_TABLE_KEYS.includes(k as RetentionTableKey),
    );
    if (unknown.length) {
      badRequest(`${API_ERROR.RETENTION_KEYS_INVALID}: ${unknown.join(', ')}`);
    }
    await this.databaseRetention.updateRetentionPolicies(
      days as Partial<Record<RetentionTableKey, number>>,
    );
    return this.buildRetentionOverview();
  }

  /**
   * 汇总「数据保留」面板数据：
   * 各表保留策略 + 最近一次清理统计 + 各表估算行数（pg_class 统计值）。
   */
  private async buildRetentionOverview() {
    return {
      policies: this.databaseRetention.getRetentionPolicies(),
      lastCleanup: this.databaseRetention.getLastCleanupStats(),
      estimatedRows: await this.databaseRetention.estimateTableRows(),
    };
  }
}
