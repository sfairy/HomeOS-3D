/**
 * @file system-backup.controller.ts
 * @module system/backup
 * @description 备份与还原 REST 控制器。路由前缀 system/，对外暴露定时自动备份状态、
 * 完整备份包三层摘要（UI / 联动器 / 系统参数）、手动备份生成 / 列出 / 下载 / 还原 / 删除、
 * 完整备份包导入（按分区白名单）、联动器备份导入、内置模板市场导出 / 导入分享 JSON 等接口。
 *
 * 鉴权：
 *  - JwtAuthGuard + RolesGuard + @Roles('admin')，全部接口仅管理员可访问
 *
 * 依赖：
 *  - OrchestratorBackupService：联动器表导出 / 导入
 *  - SystemBundleBackupService：完整备份包导出 / 导入
 *  - ServerBackupService：服务器备份包文件管理
 *  - AutoBackupService：定时自动备份状态
 *  - SystemTemplateMarketService：内置模板市场
 *  - ImportOrchestratorBackupDto / ImportBundleBackupDto / ImportTemplateShareDto：请求体校验
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Delete, Get, Post, Query, UseGuards } from '@nestjs/common';
import { OrchestratorBackupService } from './orchestrator-backup.service';
import { SystemBundleBackupService } from './system-bundle-backup.service';
import { ServerBackupService } from './server-backup.service';
import { AutoBackupService } from './auto-backup.service';
import { SystemTemplateMarketService } from './system-template-market.service';
import {
  ImportOrchestratorBackupDto,
  ImportBundleBackupDto,
  ImportTemplateShareDto,
} from '../dto/system.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { parseBooleanQuery } from '../../../common/utils/parse-boolean.util';

/** 完整备份包与联动器备份（路由前缀 system/backup） */
@ApiTags('system')
@ApiBearerAuth()
@Controller('system')
export class SystemBackupController {
  constructor(
    private readonly orchestratorBackup: OrchestratorBackupService,
    private readonly bundleBackup: SystemBundleBackupService,
    private readonly serverBackup: ServerBackupService,
    private readonly autoBackup: AutoBackupService,
    private readonly templateMarket: SystemTemplateMarketService,
  ) {}

  @ApiOperation({ summary: '定时自动备份状态（开关 / 保留天数 / 上次与下次执行）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('backup/auto/status')
  async autoBackupStatus() {
    return { success: true, data: this.autoBackup.getStatus() };
  }

  @ApiOperation({ summary: '完整备份包三层摘要（UI / 联动器 / 系统参数）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('backup/bundle/summary')
  async bundleBackupSummary() {
    const data = await this.bundleBackup.getBackupSummary();
    return { success: true, data };
  }

  @ApiOperation({ summary: '导出联动器与规则 JSON 备份' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('backup/orchestrator/export')
  async exportOrchestratorBackup() {
    const data = await this.orchestratorBackup.exportAll();
    return { success: true, data };
  }

  @ApiOperation({ summary: '导入联动器与规则 JSON 备份' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('backup/orchestrator/import')
  async importOrchestratorBackup(@Body() body: ImportOrchestratorBackupDto) {
    const payload =
      body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : body;
    return this.orchestratorBackup.importAll({
      ...(payload as Parameters<OrchestratorBackupService['importAll']>[0]),
      confirm: body.confirm === true || payload.confirm === true,
      dryRun: body.dryRun === true || payload.dryRun === true,
      replaceEmptyTables: true,
      schemaVersion:
        typeof body.schemaVersion === 'number'
          ? body.schemaVersion
          : typeof payload.schemaVersion === 'number'
            ? payload.schemaVersion
            : undefined,
    });
  }

  @ApiOperation({ summary: '导出完整备份包（① UI + ② 联动器 + ③ 系统参数，不含数据库）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('backup/bundle/export')
  async exportBundleBackup(
    @Query('maskSecrets') maskSecrets?: string,
    @Query('includeEventLog') includeEventLog?: string,
  ) {
    const mask = maskSecrets !== 'false';
    const bundle = await this.bundleBackup.exportBundle(mask, {
      includeEventLog: parseBooleanQuery(includeEventLog),
    });
    return { success: true, data: bundle };
  }

  @ApiOperation({ summary: '导入完整备份包（需 confirm）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('backup/bundle/import')
  async importBundleBackup(@Body() body: ImportBundleBackupDto) {
    const bundle = body.bundle ?? body.data ?? body;
    return this.bundleBackup.importBundle({
      bundle,
      appConfigMode: body.appConfigMode,
      confirm: body.confirm,
      sections: body.sections,
    });
  }

  @ApiOperation({ summary: '手动生成一份服务器备份包' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('backup/files/create')
  createServerBackup() {
    return this.serverBackup.createBackup();
  }

  @ApiOperation({ summary: '列出服务器备份目录中的备份包' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('backup/files')
  async listServerBackupFiles() {
    const data = await this.serverBackup.listFiles();
    return { success: true, data };
  }

  @ApiOperation({ summary: '下载服务器备份包到本地（返回 JSON 内容）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('backup/files/download')
  async downloadServerBackupFile(@Query('name') name: string) {
    const data = await this.serverBackup.readFileBundle(name);
    return { success: true, data };
  }

  @ApiOperation({ summary: '将本地备份包导入服务器备份目录（不触发还原）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('backup/files/import')
  async importServerBackupFile(
    @Body()
    body: {
      bundle?: unknown;
      data?: unknown;
      name?: string;
    },
  ) {
    const bundle = body?.bundle ?? body?.data ?? body;
    const data = await this.serverBackup.importLocalFile(bundle, body?.name);
    return { success: true, data };
  }

  @ApiOperation({ summary: '删除服务器备份目录中的备份包' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('backup/files')
  async deleteServerBackupFile(@Query('name') name: string) {
    const data = await this.serverBackup.deleteFile(name);
    return { success: true, data };
  }

  @ApiOperation({ summary: '从服务器备份包还原（需 confirm）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('backup/files/restore')
  async restoreServerBackupFile(
    @Body()
    body: {
      name?: string;
      confirm?: boolean;
      appConfigMode?: 'merge' | 'replace';
      sections?: string[];
    },
  ) {
    return this.serverBackup.restoreFile(String(body?.name || ''), {
      confirm: body?.confirm === true,
      appConfigMode: body?.appConfigMode,
      sections: body?.sections,
    });
  }

  @ApiOperation({ summary: '导出内置模板库（自动化/场景/脚本）为可分享 JSON' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('backup/templates/export')
  exportTemplateMarket() {
    return { success: true, data: this.templateMarket.exportTemplates() };
  }

  @ApiOperation({ summary: '导入模板分享 JSON（内置 id 复用安装，其余批量创建）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('backup/templates/import')
  importTemplateMarket(@Body() body: ImportTemplateShareDto) {
    const payload = body?.data ?? body;
    return this.templateMarket.importTemplates(payload);
  }
}
