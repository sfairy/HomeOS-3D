/**
 * 所属模块：backend/modules/template-entity
 * 职责：
 *  - 模板控制器（安装/导入/导出/预览）；
 * 关键依赖：
 *  - service.ts；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { badRequest, rethrowIfHttpException } from '../../common/utils/business-exception';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { TemplateEntityService } from './service';
import { TemplateEntityHaSyncService } from './ha-sync.service';
import { HaSyncService } from '../ha-sync/service';
import { AppConfigService } from '../../shared/app-config/service';
import { getErrorMessage } from '../../common/utils';
import { validateTemplateYamlLocal } from '../../shared/orchestrator/config.util';
import {
  TemplateRemoveFromHaDto,
  TemplateSyncFromHaDto,
} from '../../shared/orchestrator/sync.dto';
import { OrchestratorDomainRoutesMixin } from '../orchestrator-http/orchestrator-domain-routes.mixin';
import {
  ValidateTemplateYamlDto,
  CreateTemplateEntityDto,
  UpdateTemplateEntityDto,
  ImportTemplateConfigDto,
  ImportTemplateYamlDto,
  ConfigureHaConfigDirDto,
} from './dto';

/** 模板实体 REST 控制器，聚合 CRUD 与 HA 同步入口 */
@ApiTags('orchestrate')
@ApiBearerAuth()
@Controller('template-entity')
export class TemplateEntityController extends OrchestratorDomainRoutesMixin({
  entityLabel: '模板实体',
  blockedMsg: '设为 HA 执行但未同步到 Home Assistant，本地执行将失败',
  writeRoles: ['admin'],
  readRoles: ['admin', 'adult'],
  applyOrchestratorBlocking: false,
  removeIdempotent: true,
  supportPlaceholders: false,
}) {
  protected readonly domainService: TemplateEntityService;
  protected readonly appConfig: AppConfigService;

  /** @param svc 本地 CRUD 服务；@param haSync HA 同步服务；@param haSyncService 通用 HA 校验；@param appConfig 应用配置 */
  constructor(
    private readonly svc: TemplateEntityService,
    protected readonly haSync: TemplateEntityHaSyncService,
    private readonly haSyncService: HaSyncService,
    appConfig: AppConfigService,
  ) {
    super();
    this.domainService = svc;
    this.appConfig = appConfig;
  }

  /** 校验模板 YAML：先本地静态校验，再尝试 HA check_config；HA 不可达时仅返回本地结论 */
  @ApiOperation({ summary: '验证模板 YAML（本地 + HA check_config）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('validate')
  async validateYaml(@Body() body: ValidateTemplateYamlDto) {
    const yaml = body.yaml || '';
    const local = validateTemplateYamlLocal(yaml);
    if (!local.valid) return local;
    try {
      const ha = await this.haSyncService.validateTemplateYaml(yaml);
      if (ha.valid) return { valid: true, message: ha.message || '校验通过' };
      return {
        valid: true,
        message: `本地校验通过（HA check_config: ${ha.message}）`,
        haWarning: ha.message,
      };
    } catch {
      return { valid: true, message: '本地校验通过（HA 未连接，未执行 check_config）' };
    }
  }

  /** 管理员粘贴 configuration.yaml 原文导入模板实体 */
  @ApiOperation({ summary: '导入粘贴的模板 YAML' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('import-yaml')
  async importYaml(@Body() body: ImportTemplateYamlDto) {
    return this.haSync.importPastedYaml(body);
  }

  /** 从 JSON 配置包导入模板实体（含额外字段拼接） */
  @ApiOperation({ summary: '从 JSON 配置包导入模板实体' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('import-config')
  async importConfig(@Body() body: ImportTemplateConfigDto) {
    try {
      return await this.svc.importFromConfigJson(body);
    } catch (e: unknown) {
      rethrowIfHttpException(e);
      badRequest(getErrorMessage(e) || '导入失败');
    }
  }
  /** 预览从 HA 解析 YAML 的结果，用于导入前确认 */
  @ApiOperation({ summary: '预览模板同步解析结果' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('sync/resolve-preview')
  async resolvePreview(
    @Query('haConfigId') haConfigId: string,
    @Query('entity_id') entityId?: string,
  ) {
    return this.haSync.previewResolve(haConfigId, entityId);
  }

  /** 从 HA 同步单条模板实体（透传 yaml 等模板扩展字段，覆写 mixin 默认转发） */
  @ApiOperation({ summary: '从 HA 同步单条模板实体' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('sync/from-ha')
  async syncFromHa(@Body() body: TemplateSyncFromHaDto) {
    return this.haSync.syncFromHA(body.haConfigId, {
      yaml: body.yaml,
      name: body.name,
      entity_id: body.entity_id,
      type: body.type,
      yaml_source: body.yaml_source,
      yaml_complete: body.yaml_complete,
      ha_config_entry_id: body.ha_config_entry_id,
    });
  }

  /** 从 HA 移除模板实体（删除 config entry / configuration.yaml 块 / 注册表条目；需透传 ha_config_entry_id，覆写 mixin 默认转发） */
  @ApiOperation({ summary: '从 HA 移除模板实体' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('sync/remove-from-ha')
  async removeFromHa(@Body() body: TemplateRemoveFromHaDto) {
    return this.haSync.removeFromHAByConfigId(body.haConfigId, {
      haConfigEntryId: body.ha_config_entry_id || body.config_entry_id,
      entityId: body.entity_id,
      name: body.name,
    });
  }

  /** 获取 HA 配置目录状态（可读 / 可写 / SMB 凭据等） */
  @ApiOperation({ summary: '获取 HA 配置目录状态' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('ha-config/status')
  async getHaConfigStatus() {
    return this.haSync.getHaConfigStatus();
  }

  /** 按 unique_id 从 HA 配置目录读取 template 块（不更新数据库） */
  @ApiOperation({ summary: '从 HA 配置目录读取条目' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('ha-config/read')
  async readHaConfig(@Query('uniqueId') uniqueId: string) {
    return this.haSync.readFromHaConfig(uniqueId);
  }

  /** 配置 HA 配置目录路径及 SMB 凭据 */
  @ApiOperation({ summary: '配置 HA 配置目录' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('ha-config/configure')
  async configureHaConfig(@Body() body: ConfigureHaConfigDirDto) {
    return this.haSync.configureHaConfigDir(body?.path || '', {
      user: body?.user,
      password: body?.password,
    });
  }

  /** 创建模板实体；YAML 完整时按 automation 配置触发自动同步到 HA */
  @ApiOperation({ summary: '创建模板实体' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post()
  async create(@Body() body: CreateTemplateEntityDto) {
    try {
      return await this.createWithAutoSync({
        mutate: () =>
          this.svc.create(body) as Promise<{ id: string; yamlComplete?: boolean }>,
        syncId: (r) => r.id,
        shouldSync: (r) => r.yamlComplete !== false,
      });
    } catch (e: unknown) {
      rethrowIfHttpException(e);
      badRequest(getErrorMessage(e) || '创建失败');
    }
  }

  /** 更新模板实体；YAML 完整时按 automation 配置触发自动同步到 HA */
  @ApiOperation({ summary: '更新模板实体' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: UpdateTemplateEntityDto) {
    try {
      return await this.updateWithAutoSync(id, {
        mutate: () =>
          this.svc.update(id, body) as Promise<{ yamlComplete?: boolean } | null>,
        shouldSync: (r) => body.yamlComplete !== false && r?.yamlComplete !== false,
      });
    } catch (e: unknown) {
      rethrowIfHttpException(e);
      badRequest(getErrorMessage(e) || '更新失败');
    }
  }

  /** 直接写入 HA 配置目录的 configuration.yaml（不经过 Template Helper） */
  @ApiOperation({ summary: '写入 HA 配置目录' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post(':id/write-ha-config')
  async writeHaConfig(@Param('id') id: string) {
    return this.haSync.writeToHaConfig(id);
  }

  /** 从 HA 配置目录的 configuration.yaml 拉取并更新本地 */
  @ApiOperation({ summary: '从 HA 配置目录拉取' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post(':id/pull-ha-config')
  async pullHaConfig(@Param('id') id: string) {
    return this.haSync.pullFromHaConfig(id);
  }
}
