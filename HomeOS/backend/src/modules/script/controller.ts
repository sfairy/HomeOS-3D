/**
 * 脚本 HTTP 入口控制器。
 *
 * 所属模块：backend/modules/script
 * 职责：暴露 `/script` 下的 RESTful 接口，把请求转发给 ScriptService。
 *  CRUD 差异路由在本控制器实现，列表 / 占位符 / HA 同步等通用路由复用
 *  OrchestratorDomainRoutesMixin。
 *  执行接口（POST /script/:id/execute）支持传入 variables，按角色（admin/adult/child）
 *  与实体级 ACL 校验后由 ScriptService 本地执行。
 * 依赖：ScriptService（业务核心）、ScriptHaSyncService（HA 同步）、
 *  HaSyncService（YAML 校验）、ScriptPlaceholderService（占位符）、JwtAuthGuard / RolesGuard。
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { AppConfigService } from '../../shared/app-config/service';
import { ScriptService } from './service';
import { ScriptHaSyncService } from './ha-sync.service';
import { HaSyncService } from '../ha-sync/service';
import { ScriptPlaceholderService } from '../../shared/orchestrator/placeholder-service.base';
import {
  CreateScriptDto,
  UpdateScriptDto,
  RunScriptDto,
} from '../../shared/orchestrator/dto';
import { OrchestratorDomainRoutesMixin } from '../orchestrator-http/orchestrator-domain-routes.mixin';
import type { OrchestratorExecActor } from '../scene/scene-execute-acl.util';

/** 鉴权后扩展 user 字段的 Express 请求类型，携带脚本执行身份（含 role / restrictions） */
type AuthRequest = Request & { user?: OrchestratorExecActor };

@ApiTags('orchestrate')
@ApiBearerAuth()
@Controller('script')
/**
 * ScriptController：Nest @Controller REST 控制器。
 * - 处理路由前缀下的端点（HTTP 方法 + 路径 + DTO 校验）；
 * - 鉴权：默认 JwtAuthGuard + 角色守卫（@Roles 装饰器按方法细化）；
 * - 主要调用：同域 Service + 跨域编排工具；
 * @class ScriptController
 */
export class ScriptController extends OrchestratorDomainRoutesMixin({
  entityLabel: '脚本',
  blockedMsg: '设为 HA 执行但未同步到 Home Assistant，本地执行将失败',
  builtinTemplates: {},
  validateYaml: {},
  executionHistory: {},
}) {
  protected readonly domainService: ScriptService;
  protected readonly placeholders: ScriptPlaceholderService;
  protected readonly appConfig: AppConfigService;
  protected readonly builtinTemplates: ScriptService;
  protected readonly yamlValidate: (yaml: string) => unknown | Promise<unknown>;
  protected readonly executionHistory: (
    automationId: string | undefined,
    limit: number | undefined,
  ) => unknown | Promise<unknown>;

  constructor(
    private readonly scriptService: ScriptService,
    protected readonly haSync: ScriptHaSyncService,
    private readonly haYamlValidate: HaSyncService,
    placeholders: ScriptPlaceholderService,
    appConfig: AppConfigService,
  ) {
    super();
    this.domainService = scriptService;
    this.placeholders = placeholders;
    this.appConfig = appConfig;
    this.builtinTemplates = scriptService;
    this.yamlValidate = (yaml) => haYamlValidate.validateScriptYaml(yaml);
    this.executionHistory = (scriptId?: string, limit?: number) =>
      scriptService.getExecutionHistory(limit, scriptId ? { scriptId } : undefined);
  }

  @ApiOperation({ summary: '创建脚本' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post()
  async create(@Body() body: CreateScriptDto) {
    return this.createWithAutoSync({
      mutate: () => this.scriptService.create(body) as Promise<{ id: string }>,
      syncId: (r) => r.id,
    });
  }

  @ApiOperation({ summary: '更新脚本' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: UpdateScriptDto) {
    return this.updateWithAutoSync(id, {
      mutate: () => this.scriptService.update(id, body),
    });
  }

  @ApiOperation({ summary: '执行脚本' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult', 'child')
  @Post(':id/execute')
  async execute(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body?: RunScriptDto,
  ) {
    return this.scriptService.execute(id, body?.variables, req.user);
  }
}
