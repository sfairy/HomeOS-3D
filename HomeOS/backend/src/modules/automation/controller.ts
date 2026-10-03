/**
 * 所属模块：backend/modules/automation
 * 职责：
 *  - 自动化控制器（CRUD/手动触发/执行历史/DRY RUN）；
 * 关键依赖：
 *  - service.ts、engine.service；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  Headers,
  Ip,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { parseIntParam } from '../../common/crud/pagination.util';
import { getErrorMessage } from '../../common/utils';
import { shouldAutoSyncAutomationRecord } from '../../shared/orchestrator/auto-sync.util';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { Public } from '../auth/public.decorator';
import { AppConfigService } from '../../shared/app-config/service';
import { AutomationService } from './service';
import { AutomationEngineService } from './engine.service';
import { AutomationHaSyncService } from './ha-sync.service';
import { AutomationVariableService } from './variable.service';
import { StateStoreService } from '../state-store/service';
import { AutomationPlaceholderService } from '../../shared/orchestrator/placeholder-service.base';
import { HaSyncService } from '../ha-sync/service';
import {
  CreateAutomationDto,
  UpdateAutomationDto,
  ReplacePlaceholdersDto,
} from '../../shared/orchestrator/dto';
import {
  runOrchestratorHaSyncThen,
} from '../../shared/orchestrator/controller.util';
import {
  OrchestratorDomainRoutesMixin,
  type BuiltinInstallOptions,
} from '../orchestrator-http/orchestrator-domain-routes.mixin';
import { IsArray, IsBoolean, IsOptional, IsString, IsIn } from 'class-validator';

class CreateAutomationVariableDto {
  @IsString({ message: 'key 须为字符串' })
  key!: string;
  @IsString({ message: 'name 须为字符串' })
  name!: string;
  @IsOptional()
  @IsIn(['global', 'rule'], { message: 'scope 须为 global 或 rule' })
  scope?: 'global' | 'rule';
  @IsOptional()
  @IsString({ message: 'ruleId 须为字符串' })
  ruleId?: string;
  @IsOptional()
  @IsIn(['number', 'string'], { message: 'type 须为 number 或 string' })
  type?: 'number' | 'string';
  @IsOptional()
  value?: string | number;
}

class SetAutomationVariableDto {
  @IsString({ message: 'key 须为字符串' })
  key!: string;
  @IsOptional()
  @IsIn(['global', 'rule'], { message: 'scope 须为 global 或 rule' })
  scope?: 'global' | 'rule';
  @IsOptional()
  @IsString({ message: 'ruleId 须为字符串' })
  ruleId?: string;
  @IsOptional()
  @IsIn(['set', 'add', 'concat'], { message: 'op 须为 set / add / concat' })
  op?: 'set' | 'add' | 'concat';
  @IsOptional()
  value?: string | number;
  @IsOptional()
  @IsIn(['number', 'string'], { message: 'type 须为 number 或 string' })
  type?: 'number' | 'string';
}

/** 批量启用/停用自动化请求体 */
class BatchToggleAutomationDto {
  @IsArray({ message: 'ids 须为数组' })
  @IsString({ each: true, message: 'ids 每项须为字符串' })
  ids!: string[];
  @IsBoolean({ message: 'enabled 须为布尔值' })
  enabled!: boolean;
}

/** 试运行评估请求体：按 id（已保存）或 yaml（画布草稿）评估 */
class DryRunAutomationDto {
  @IsOptional()
  @IsString({ message: 'id 须为字符串' })
  id?: string;
  @IsOptional()
  @IsString({ message: 'yaml 须为字符串' })
  yaml?: string;
}

/** 规则查重请求体 */
class CheckAutomationDuplicateDto {
  @IsOptional()
  @IsString({ message: 'yaml 须为字符串' })
  yaml?: string;
  @IsOptional()
  @IsString({ message: 'excludeId 须为字符串' })
  excludeId?: string;
}

/**
 * AutomationController：Nest @Controller REST 控制器。
 * - 处理路由前缀下的 HTTP 端点（DTO 校验 + 权限守卫）；
 * - 鉴权要求：默认 JwtAuthGuard，具体方法由 @Roles/@Public 细粒度覆盖；
 * - 主要调用：同域 Service、跨域编排工具；
 * @class AutomationController
 */
@ApiTags('orchestrate')
@ApiBearerAuth()
@Controller('automation')
export class AutomationController extends OrchestratorDomainRoutesMixin({
  entityLabel: '自动化',
  blockedMsg: '设为 HA 执行但未同步到 Home Assistant，本地引擎已跳过',
  requireEnabled: true,
  builtinTemplates: { listRoles: [] },
  validateYaml: {
    emptyResult: () => ({ valid: false, errors: [{ message: 'YAML 为空' }] }),
  },
  executionHistory: { roles: ['admin', 'adult'] },
}) {
  protected readonly domainService: AutomationService;
  protected readonly placeholders: AutomationPlaceholderService;
  protected readonly appConfig: AppConfigService;
  protected readonly builtinTemplates: AutomationService;
  protected readonly yamlValidate: (yaml: string) => unknown | Promise<unknown>;
  protected readonly executionHistory: (
    automationId: string | undefined,
    limit: number | undefined,
  ) => unknown | Promise<unknown>;

  constructor(
    private readonly automationService: AutomationService,
    private readonly automationEngine: AutomationEngineService,
    protected readonly haSync: AutomationHaSyncService,
    private readonly variableService: AutomationVariableService,
    placeholders: AutomationPlaceholderService,
    private readonly haSyncValidate: HaSyncService,
    appConfig: AppConfigService,
    private readonly stateStore: StateStoreService,
  ) {
    super();
    this.domainService = automationService;
    this.placeholders = placeholders;
    this.appConfig = appConfig;
    this.builtinTemplates = automationService;
    this.yamlValidate = (yaml) => haSyncValidate.validateAutomationYaml(yaml);
    this.executionHistory = (automationId, limit) =>
      automationEngine.getExecutionHistory(automationId, limit);
  }

  protected afterOrchestratorSync() {
    return this.automationEngine.reloadRules();
  }

  /** 安装内置模板的域特有同步策略（mixin 安装路由调用）：与保存链路一致，安装后 reloadRules */
  protected builtinInstallOptions(): BuiltinInstallOptions {
    return {
      label: '自动化保存后 HA 同步',
      // 仍含占位符时不推 HA（与 create 的 shouldAutoSyncAutomationRecord 一致）
      shouldSync: (r) =>
        !(Array.isArray(r.placeholders) && r.placeholders.length > 0) &&
        shouldAutoSyncAutomationRecord(r),
      after: () => this.automationEngine.reloadRules(),
    };
  }

  /**
   * 自动化列表：在通用列表基础上附加 HA 运行状态（最近触发时间 / 开关态）。
   * 数据来自 state-store 中 automation.<haConfigId> 实体，未同步 HA 的本地规则为 null。
   */
  @ApiOperation({ summary: '获取自动化列表（可选 page/limit 分页，含最近触发与运行状态）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Get()
  async findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    const result = await super.findAll(page, limit);
    return this.attachAutomationRuntimeState(result);
  }

  /** 为列表行附加 lastTriggered / haState，兼容数组与分页两种返回结构（原类型原样透传） */
  private attachAutomationRuntimeState<T>(result: T): T {
    const items = Array.isArray(result)
      ? result
      : Array.isArray((result as { items?: unknown[] } | null)?.items)
        ? (result as { items: unknown[] }).items
        : null;
    if (!items) return result;
    for (const item of items) {
      const target = item as Record<string, unknown>;
      const haConfigId = (item as { haConfigId?: string | null } | null)?.haConfigId;
      const entity = haConfigId ? this.stateStore.getById(`automation.${haConfigId}`) : undefined;
      const attrs = (entity?.attributes || {}) as Record<string, unknown>;
      target.lastTriggered =
        typeof attrs.last_triggered === 'string' ? attrs.last_triggered : null;
      target.haState = entity?.state ?? null;
    }
    return result;
  }

  @ApiOperation({ summary: '本地自动化引擎能力对照' })
  @UseGuards(JwtAuthGuard)
  @Get('engine/capabilities')
  getEngineCapabilities() {
    return this.automationEngine.getEngineCapabilities();
  }

  @ApiOperation({ summary: '自动化执行分析汇总' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Get('analytics/summary')
  getExecutionAnalytics(@Query('hours') hours?: string) {
    return this.automationEngine.getExecutionAnalytics(parseIntParam(hours, 168));
  }

  @ApiOperation({ summary: '列出自动化变量' })
  @UseGuards(JwtAuthGuard)
  @Get('variables')
  listVariables(@Query('scope') scope?: string, @Query('ruleId') ruleId?: string) {
    return this.variableService.list({ scope, ruleId });
  }

  @ApiOperation({ summary: '创建自动化变量' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('variables')
  createVariable(@Body() body: CreateAutomationVariableDto) {
    return this.variableService.create(body);
  }

  @ApiOperation({ summary: '设置自动化变量值' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('variables/set')
  setVariable(@Body() body: SetAutomationVariableDto) {
    return this.variableService.upsertSet(body);
  }

  @ApiOperation({ summary: '更新自动化变量' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Put('variables/:id')
  updateVariable(
    @Param('id') id: string,
    @Body() body: Partial<{ name: string; value: string | number; type: 'number' | 'string' }>,
  ) {
    return this.variableService.update(id, body);
  }

  @ApiOperation({ summary: '删除自动化变量' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Delete('variables/:id')
  removeVariable(@Param('id') id: string) {
    return this.variableService.remove(id);
  }

  @ApiOperation({ summary: '手动触发自动化' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post(':id/trigger')
  async triggerAutomation(@Param('id') id: string) {
    return this.automationEngine.triggerAutomation(id);
  }

  @ApiOperation({
    summary: '试运行评估（dry-run）：按当前状态评估触发就绪与条件满足，不执行动作',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('dry-run')
  async dryRun(@Body() body: DryRunAutomationDto) {
    return this.automationEngine.dryRunAutomation(body?.id, body?.yaml);
  }

  @ApiOperation({
    summary: '规则查重：按触发器/条件/动作签名检测语义重复的自动化',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('check-duplicate')
  async checkDuplicate(@Body() body: CheckAutomationDuplicateDto) {
    return this.automationEngine.checkAutomationDuplicate(body?.yaml, body?.excludeId);
  }

  /**
   * webhook 触发器公开端点：POST /automation/webhook/:id
   * 无需登录（供外部服务/脚本调用），匹配本地 webhook 平台触发器执行。
   * 安全措施：
   *  - 速率限制：每分钟最多 30 次（每 IP + 每 webhook_id 双维度）
   *  - 可选 HMAC 签名验证：请求头 X-HomeOS-Webhook-Signature = sha256(secret, body)
   *    （若 webhook 触发器在 YAML 中配置了 secret 字段则启用）
   */
  @ApiOperation({ summary: 'webhook 触发器入口（无需登录，含速率限制）' })
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('webhook/:id')
  async triggerWebhook(
    @Param('id') id: string,
    @Body() body?: Record<string, unknown>,
    @Headers('x-homeos-webhook-signature') signatureHeader?: string,
    @Ip() _clientIp?: string,
  ) {
    const payload = body && typeof body === 'object' ? body : {};
    // 可选 HMAC 签名校验：若 YAML 中 webhook 触发器配置了 secret 字段则校验
    const verified = this.automationEngine.verifyWebhookSignature(
      id,
      signatureHeader,
      payload,
    );
    if (!verified.ok) {
      return { triggered: 0, matched: false, error: verified.reason };
    }
    return this.automationEngine.triggerWebhook(id, payload);
  }

  /** 替换占位后需 reloadRules，并同步 HA（与保存后自动推送保持一致），覆盖 mixin 默认实现 */
  @ApiOperation({ summary: '批量替换自动化占位实体' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post(':id/replace-placeholders')
  async replacePlaceholders(@Param('id') id: string, @Body() body: ReplacePlaceholdersDto) {
    return this.updateWithAutoSync(id, {
      mutate: async () => {
        const row = (await this.placeholders.replacePlaceholders(
          id,
          body?.replacements || {},
        )) as {
          id: string;
          enabled?: boolean;
          yaml?: string;
          remaining?: number;
        };
        // 替换完后若 enabled=true：与保存/切换保持一致，派发启用事件 + loopArmed 武装
        if (row.enabled) {
          this.automationEngine.notifyAutomationEnabled(String(row.id ?? id));
        }
        return row;
      },
      shouldSync: (r) =>
        // 有 remaining 占位符时不推 HA（与创建/更新时的占位符判定保持一致）
        !(Number(r?.remaining ?? 0) > 0) &&
        shouldAutoSyncAutomationRecord(r as { enabled?: boolean; yaml?: string }),
      after: () => this.automationEngine.reloadRules(),
    });
  }

  @ApiOperation({ summary: '创建自动化' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post()
  async create(@Body() body: CreateAutomationDto) {
    const cfg = this.appConfig.get('automation');
    const enabled = body.enabled ?? true;
    return this.createWithAutoSync({
      mutate: () =>
        this.automationService.create({
          name: body.name,
          yaml: body.yaml,
          runOnHa: body.runOnHa ?? cfg.defaultRunOnHa,
          enabled,
          ...(body.geekGraph !== undefined ? { geekGraph: body.geekGraph } : {}),
        }) as Promise<{ id: string; enabled?: boolean; yaml?: string }>,
      syncId: (r) => r.id,
      shouldSync: (r) =>
        shouldAutoSyncAutomationRecord({ enabled: r.enabled ?? enabled, yaml: body.yaml }),
      after: () => this.automationEngine.reloadRules(),
    });
  }

  @ApiOperation({ summary: '更新自动化' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: UpdateAutomationDto) {
    return this.updateWithAutoSync(id, {
      mutate: async () => {
        const row = (await this.automationService.update(id, body)) as {
          id: string;
          enabled?: boolean;
          yaml?: string;
        };
        // 与 toggle / batchToggle 保持一致：只要 DB 写入的最终 enabled=true，
        // 就派发 homeos.automation.enabled 事件并武装 loopArmed（重复调用幂等）
        if (row.enabled) {
          this.automationEngine.notifyAutomationEnabled(row.id);
        }
        return row;
      },
      shouldSync: (r) => shouldAutoSyncAutomationRecord(r),
      after: () => this.automationEngine.reloadRules(),
    });
  }

  /** 删除后 reloadRules，覆盖 mixin 默认 remove */
  @ApiOperation({ summary: '删除自动化' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return runOrchestratorHaSyncThen(
      () => this.automationService.remove(id),
      () => this.automationEngine.reloadRules(),
    );
  }

  @ApiOperation({ summary: '切换自动化启用状态' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post(':id/toggle')
  async toggle(@Param('id') id: string) {
    return this.updateWithAutoSync(id, {
      mutate: async () => {
        const row = (await this.automationService.toggle(id)) as {
          id: string;
          enabled?: boolean;
          yaml?: string;
        };
        if (row.enabled) {
          this.automationEngine.notifyAutomationEnabled(row.id);
        }
        return row;
      },
      shouldSync: (r) => shouldAutoSyncAutomationRecord(r),
      after: () => this.automationEngine.reloadRules(),
    });
  }

  @ApiOperation({ summary: '批量启用/停用自动化（一键度假模式等）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult')
  @Post('batch-toggle')
  async batchToggle(@Body() body: BatchToggleAutomationDto) {
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((x) => typeof x === 'string' && x.trim() !== '')
      : [];
    const enabled = body?.enabled === true;
    // 1) 数据库层原子批量更新 enabled（含统一占位符校验；任一不合格全部回滚）
    const batchResult = await this.automationService.setEnabledBatch(ids, enabled);
    const succeeded: string[] = [...batchResult.succeeded];
    const failed: string[] = [...batchResult.failed];
    const syncErrors: string[] = [];
    // 2) HA 同步层（runOnHa）：逐条尽力而为，失败不回滚 DB，只记入 syncErrors
    for (const row of batchResult.rows) {
      try {
        if (row.enabled) {
          this.automationEngine.notifyAutomationEnabled(row.id);
        }
        if (!shouldAutoSyncAutomationRecord(row)) continue;
        await this.updateWithAutoSync(row.id, {
          mutate: async () => row as { id: string; enabled?: boolean; yaml?: string },
          label: '自动化批量启停后 HA 同步',
          shouldSync: () => true,
          // 已在步骤 1 做过 enabled 更新；此处仅利用 updateWithAutoSync 的 HA 推送链路，
          // mutate 不重复写 DB（返回传入的 row），由 afterSync 兜底 reloadRules。
        });
      } catch (e) {
        syncErrors.push(`${row.id}: ${getErrorMessage(e)}`);
      }
    }
    await this.automationEngine.reloadRules();
    return {
      succeeded,
      failed,
      syncErrors: syncErrors.length > 0 ? syncErrors : undefined,
    };
  }
}
