/**
 * 场景 HTTP 入口控制器。
 *
 * 所属模块：backend/modules/scene
 * 职责：暴露 `/scene` 下的 RESTful 接口，把请求转发给 SceneService / SceneScheduleService。
 *  CRUD 差异路由在本控制器实现，列表 / 占位符 / HA 同步等通用路由复用
 *  OrchestratorDomainRoutesMixin。
 *  执行类接口走 GuestSceneGuard：管理员/成人/儿童/访客均可执行授权场景，
 *  并按实体级 ACL 校验目标设备权限。
 * 依赖：SceneService（业务核心）、SceneHaSyncService（HA 同步）、
 *  HaSyncService（YAML 校验）、ScenePlaceholderService（占位符）、JwtAuthGuard / RolesGuard。
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GuestSceneGuard } from '../auth/guest-scene.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { AppConfigService } from '../../shared/app-config/service';
import { SceneService } from './service';
import { SceneHaSyncService } from './ha-sync.service';
import { HaSyncService } from '../ha-sync/service';
import { ScenePlaceholderService } from '../../shared/orchestrator/placeholder-service.base';
import {
  CreateSceneDto,
  UpdateSceneDto,
} from '../../shared/orchestrator/dto';
import { OrchestratorDomainRoutesMixin } from '../orchestrator-http/orchestrator-domain-routes.mixin';
import type { OrchestratorExecActor } from './scene-execute-acl.util';
import { parseBooleanQuery } from '../../common/utils/parse-boolean.util';

/** 鉴权后扩展 user 字段的 Express 请求类型，携带场景执行身份（含 role / restrictions） */
type AuthRequest = Request & { user?: OrchestratorExecActor };

@ApiTags('orchestrate')
@ApiBearerAuth()
@Controller('scene')
/**
 * SceneController：Nest @Controller REST 控制器。
 * - 处理路由前缀下的端点（HTTP 方法 + 路径 + DTO 校验）；
 * - 鉴权：默认 JwtAuthGuard + 角色守卫（@Roles 装饰器按方法细化）；
 * - 主要调用：同域 Service + 跨域编排工具；
 * @class SceneController
 */
export class SceneController extends OrchestratorDomainRoutesMixin({
  entityLabel: '场景',
  supportPullAllQuery: true,
  previewSummary: '同步前实体配置 diff 预览',
  blockedMsg: '设为 HA 执行但未同步到 Home Assistant，本地执行将失败',
  builtinTemplates: { installParamName: 'id' },
  validateYaml: { dtoBody: false },
  executionHistory: {},
}) {
  protected readonly domainService: SceneService;
  protected readonly placeholders: ScenePlaceholderService;
  protected readonly appConfig: AppConfigService;
  protected readonly builtinTemplates: SceneService;
  protected readonly yamlValidate: (yaml: string) => unknown | Promise<unknown>;
  protected readonly executionHistory: (
    automationId: string | undefined,
    limit: number | undefined,
  ) => unknown | Promise<unknown>;

  constructor(
    private readonly sceneService: SceneService,
    protected readonly haSync: SceneHaSyncService,
    private readonly haYamlValidate: HaSyncService,
    placeholders: ScenePlaceholderService,
    appConfig: AppConfigService,
  ) {
    super();
    this.domainService = sceneService;
    this.placeholders = placeholders;
    this.appConfig = appConfig;
    this.builtinTemplates = sceneService;
    this.yamlValidate = (yaml) => haYamlValidate.validateYaml(yaml);
    // 透传 automationId 查询参数作为 sceneId 过滤，避免历史路由返回全部场景执行史
    this.executionHistory = (sceneId?: string, limit?: number) =>
      sceneService.getExecutionHistory(limit, sceneId ? { sceneId } : undefined);
  }

  @ApiOperation({ summary: '获取场景定时列表' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Get('schedules')
  listSchedules() {
    return this.sceneService.listSceneSchedules();
  }

  @ApiOperation({ summary: '新增/更新场景定时（cron 5 段 或 at HH:mm + days 星期）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('schedules')
  upsertSchedule(
    @Body()
    body: {
      sceneId: string;
      sceneName?: string;
      cron?: string;
      at?: string;
      days?: number[];
      enabled?: boolean;
    },
  ) {
    return this.sceneService.upsertSceneSchedule(body);
  }

  @ApiOperation({ summary: '删除场景定时' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Delete('schedules/:sceneId')
  removeSchedule(@Param('sceneId') sceneId: string) {
    return this.sceneService.removeSceneSchedule(sceneId);
  }

  @ApiOperation({ summary: '创建新场景' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post()
  async create(@Body() body: CreateSceneDto) {
    return this.createWithAutoSync({
      mutate: () => this.sceneService.create(body) as Promise<{ id: string }>,
      syncId: (r) => r.id,
    });
  }

  @ApiOperation({ summary: '更新场景配置' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: UpdateSceneDto) {
    return this.updateWithAutoSync(id, {
      mutate: () => this.sceneService.update(id, body),
    });
  }

  @ApiOperation({ summary: '执行场景（rollbackOnFailure=1 时部分失败自动回滚已成功实体）' })
  @UseGuards(GuestSceneGuard)
  @Roles('admin', 'adult', 'child', 'guest')
  @Post(':id/execute')
  async execute(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Query('rollbackOnFailure') rollbackOnFailure?: string,
  ) {
    return this.sceneService.execute(id, req.user, {
      rollbackOnFailure:
        parseBooleanQuery(rollbackOnFailure),
    });
  }

  @ApiOperation({ summary: '取消场景执行（叠加执行场景恢复到执行前快照）' })
  @UseGuards(GuestSceneGuard)
  @Roles('admin', 'adult', 'child')
  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.sceneService.cancel(id, req.user);
  }
}
