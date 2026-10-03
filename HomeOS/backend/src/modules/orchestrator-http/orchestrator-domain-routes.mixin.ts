/**
 * 所属模块：backend/modules/orchestrator-http
 * 职责：
 *  - 编排域路由 Mixin（同步/修复端点）；
 * 关键依赖：
 *  - shared/orchestrator/controller.util；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import {
  Body,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { AppConfigService } from '../../shared/app-config/service';
import type { CrudPaginatedResult } from '../../common/crud/pagination.util';
import { runCrudFindAll } from '../../common/crud/pagination.util';
import { ReplacePlaceholdersDto, ValidateYamlBodyDto } from '../../shared/orchestrator/dto';
import {
  findAllWithOrchestratorBlocking,
  runOrchestratorMutationWithAutoSync,
} from '../../shared/orchestrator/controller.util';
import {
  OrchestratorSyncRoutesMixin,
  type OrchestratorSyncRoutesOptions,
} from './orchestrator-sync-routes.mixin';

type OrchestratorDomainListRow = {
  haConfigId: string | null;
  runOnHa: boolean;
  enabled?: boolean;
};

/** 领域服务端口：BaseCrudService 返回 unknown[]，列表侧再断言为 DomainListRow */
type OrchestratorDomainServicePort = {
  findAll: () => Promise<unknown[]>;
  findAllPaginated: (
    pageNum: number,
    pageSize: number,
  ) => Promise<CrudPaginatedResult<unknown>>;
  findOne: (id: string) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
};

type OrchestratorPlaceholderPort = {
  scanPlaceholders: (id: string) => unknown;
  replacePlaceholders: (
    id: string,
    replacements: Record<string, string>,
  ) => unknown | Promise<unknown>;
};

/** 内置模板端口：三域 service 均继承 OrchestratorCrudServiceBase，两个方法签名一致 */
type OrchestratorBuiltinTemplatesPort = {
  getBuiltinTemplates: () => unknown;
  installBuiltinTemplate: (templateId: string) => Promise<unknown>;
};

/** 安装内置模板结果（shouldSync / 域钩子按需读取占位符、启用状态与 YAML） */
type BuiltinInstallResult = {
  id: string;
  placeholders?: string[];
  enabled?: boolean | null;
  yaml?: string | null;
};

/** 安装路由的域特有 autoSync 选项（如自动化 reloadRules），子类可覆写 builtinInstallOptions 提供 */
export type BuiltinInstallOptions = {
  label?: string;
  shouldSync?: (result: BuiltinInstallResult) => boolean;
  after?: () => Promise<void>;
};

type OrchestratorDomainRoutesOptions = OrchestratorSyncRoutesOptions & {
  blockedMsg: string;
  /** GET 列表/详情角色；传 [] 表示仅登录（template-entity 现状），默认 ['admin', 'adult'] */
  readRoles?: string[];
  /** 列表是否按 runOnHa && !haConfigId 打 blockedReason；模板实体无该字段，应关 */
  applyOrchestratorBlocking?: boolean;
  /** automation 列表需 enabled 才标 blocked */
  requireEnabled?: boolean;
  /** 幂等删除：记录已不存在时返回 { id, alreadyDeleted: true } 而非继续调用 remove */
  removeIdempotent?: boolean;
  /** 是否挂载占位符路由（GET :id/placeholders、POST :id/replace-placeholders），默认 true */
  supportPlaceholders?: boolean;
  /**
   * 内置模板路由组（GET builtin/templates + POST builtin/install/:templateId）；
   * 缺省不挂载（template-entity 域无内置模板）。
   */
  builtinTemplates?: {
    /** 列表路由角色；传 [] 表示仅登录可访问（automation 现状），默认 ['admin', 'adult'] */
    listRoles?: string[];
    /** 安装路由路径参数名（scene 历史为 'id'），默认 'templateId' */
    installParamName?: string;
  };
  /**
   * POST validate-yaml 路由；缺省不挂载（template-entity 有独立的 validate 路由）。
   */
  validateYaml?: {
    /** 空 YAML 响应工厂；默认 () => ({ valid: false, message: 'YAML 为空' })，automation 为 errors 形态 */
    emptyResult?: () => unknown;
    /** false 时请求体用内联类型（scene 现状，无 DTO 校验）；默认 true（ValidateYamlBodyDto） */
    dtoBody?: boolean;
  };
  /**
   * GET history/executions 路由；缺省不挂载。
   */
  executionHistory?: {
    /** 路由角色；传 [] 表示仅登录可访问（scene/script 现状），默认 [] */
    roles?: string[];
  };
};

/**
 * OrchestratorDomainRoutesMixin：函数。
 * @param args - 参见类型签名；传入 undefined 时通常按 fallback 分支或返回空值
 * @returns 见类型签名；空场景通常返回 null / [] / {} 或 undefined
 * @throws 依赖不可用或输入非法时抛出 Error 子类
 */
export function OrchestratorDomainRoutesMixin(options: OrchestratorDomainRoutesOptions) {
  const {
    blockedMsg,
    readRoles = ['admin', 'adult'],
    applyOrchestratorBlocking = true,
    requireEnabled = false,
    removeIdempotent = false,
    supportPlaceholders = true,
    builtinTemplates: builtinCfg,
    validateYaml: validateCfg,
    executionHistory: historyCfg,
    ...syncOptions
  } = options;
  const SyncBase = OrchestratorSyncRoutesMixin(syncOptions);

  abstract class OrchestratorDomainRoutesHost extends SyncBase {
    protected abstract readonly domainService: OrchestratorDomainServicePort;
    protected abstract readonly appConfig: AppConfigService;
    /** 保存后 HA 同步等后台任务使用的日志器（子类不再各自声明） */
    protected readonly logger = new Logger('OrchestratorDomainRoutes');

    /**
     * 创建后自动同步模板方法：mutate 创建 → 可选 HA 同步 → 可选 after。
     * 收敛三个 controller 的 runOrchestratorMutationWithAutoSync 样板。
     */
    protected createWithAutoSync<T>(opts: {
      mutate: () => Promise<T>;
      syncId: (result: T) => string;
      label?: string;
      shouldSync?: (result: T) => boolean;
      after?: () => Promise<void>;
    }): Promise<T> {
      return runOrchestratorMutationWithAutoSync({
        mutate: opts.mutate,
        cfg: this.appConfig.get('automation'),
        logger: this.logger,
        label: opts.label ?? `${options.entityLabel}保存后 HA 同步`,
        syncToHA: (id) => this.haSync.syncToHA(id),
        syncId: opts.syncId,
        shouldSync: opts.shouldSync,
        after: opts.after,
      });
    }

    /**
     * 更新后自动同步模板方法：syncToHA 用路由 id，syncId 恒返回 id。
     * @param label 覆盖默认"${entityLabel}保存后 HA 同步"（如批量启停）。
     */
    protected updateWithAutoSync<T>(
      id: string,
      opts: {
        mutate: () => Promise<T>;
        label?: string;
        shouldSync?: (result: T) => boolean;
        after?: () => Promise<void>;
      },
    ): Promise<T> {
      return runOrchestratorMutationWithAutoSync({
        mutate: opts.mutate,
        cfg: this.appConfig.get('automation'),
        logger: this.logger,
        label: opts.label ?? `${options.entityLabel}保存后 HA 同步`,
        syncToHA: () => this.haSync.syncToHA(id),
        syncId: () => id,
        shouldSync: opts.shouldSync,
        after: opts.after,
      });
    }

    /**
     * 内置模板安装后自动同步模板方法：syncId 取安装结果 id；
     * shouldSync 默认仅当无占位实体时同步（脚本/场景语义，自动化可显式覆盖）。
     */
    protected installTemplateWithAutoSync<
      T extends { id: string; placeholders?: string[] },
    >(opts: {
      mutate: () => Promise<T>;
      label?: string;
      shouldSync?: (result: T) => boolean;
      after?: () => Promise<void>;
    }): Promise<T> {
      return this.createWithAutoSync<T>({
        mutate: opts.mutate,
        label: opts.label ?? `${options.entityLabel}模板安装后 HA 同步`,
        shouldSync:
          opts.shouldSync ??
          ((r) => !(Array.isArray(r.placeholders) && r.placeholders.length > 0)),
        after: opts.after,
        syncId: (r) => r.id,
      });
    }

    @ApiOperation({ summary: `获取${options.entityLabel}列表（可选 page/limit 分页）` })
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...readRoles)
    @Get()
    async findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
      if (!applyOrchestratorBlocking) {
        return runCrudFindAll(
          page,
          limit,
          () => this.domainService.findAll(),
          (pageNum, pageSize) => this.domainService.findAllPaginated(pageNum, pageSize),
        );
      }
      return findAllWithOrchestratorBlocking({
        haSyncEnabled: this.appConfig.get('automation').haSyncEnabled,
        blockedMsg,
        page,
        limit,
        findAll: async () =>
          (await this.domainService.findAll()) as OrchestratorDomainListRow[],
        findAllPaginated: async (pageNum, pageSize) => {
          const result = await this.domainService.findAllPaginated(pageNum, pageSize);
          return {
            ...result,
            items: result.items as OrchestratorDomainListRow[],
          };
        },
        mapOptions: requireEnabled ? { requireEnabled: true } : undefined,
      });
    }

    @ApiOperation({ summary: `根据 ID 获取${options.entityLabel}详情` })
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...readRoles)
    @Get(':id')
    async findOne(@Param('id') id: string) {
      return this.domainService.findOne(id);
    }

    @ApiOperation({ summary: `删除${options.entityLabel}` })
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Delete(':id')
    async remove(@Param('id') id: string) {
      // removeIdempotent：幂等删除，记录已不存在时返回成功标记而非 404/异常
      if (removeIdempotent && !(await this.domainService.findOne(id))) {
        return { id, alreadyDeleted: true };
      }
      return this.domainService.remove(id);
    }
  }

  // 以下差异路由组按选项条件挂载：每层 extends 上一层宿主类（动态类链），
  // 未配置的组直接跳过，故 template-entity 等域的路由面与接入前保持一致。
  // 链上宿主均为 abstract（子类补齐抽象端口），故构造器类型取 abstract new。
  type DomainHostCtor = abstract new (...args: unknown[]) => OrchestratorDomainRoutesHost;
  let Host = OrchestratorDomainRoutesHost as DomainHostCtor;

  // 内置模板路由组（可选）：列表 + 安装。安装差异（label/shouldSync/after）经
  // builtinInstallOptions 钩子注入；空角色列表时 RolesGuard 对 GET 恒放行，等效仅登录。
  if (builtinCfg) {
    const listRoles = builtinCfg.listRoles ?? ['admin', 'adult'];
    const installParam = builtinCfg.installParamName ?? 'templateId';
    const Base = Host;
    abstract class BuiltinRoutesHost extends Base {
      protected abstract readonly builtinTemplates: OrchestratorBuiltinTemplatesPort;

      /** 安装路由的域特有 autoSync 选项（如自动化 reloadRules），子类可覆写 */
      protected builtinInstallOptions(): BuiltinInstallOptions {
        return {};
      }

      @ApiOperation({ summary: `获取内置${options.entityLabel}模板` })
      @UseGuards(JwtAuthGuard, RolesGuard)
      @Roles(...listRoles)
      @Get('builtin/templates')
      getBuiltinTemplates() {
        return this.builtinTemplates.getBuiltinTemplates();
      }

      @ApiOperation({ summary: `安装内置${options.entityLabel}模板` })
      @UseGuards(JwtAuthGuard, RolesGuard)
      @Roles('admin', 'adult')
      @Post(`builtin/install/:${installParam}`)
      async installBuiltinTemplate(@Param(installParam) templateId: string) {
        return this.installTemplateWithAutoSync({
          mutate: () =>
            this.builtinTemplates.installBuiltinTemplate(templateId) as Promise<BuiltinInstallResult>,
          ...this.builtinInstallOptions(),
        });
      }
    }
    Host = BuiltinRoutesHost as DomainHostCtor;
  }

  // validate-yaml 路由（可选）：空 YAML 响应形态与转发目标经配置区分；
  // 请求体按 dtoBody 选择 DTO 校验（script/automation）或内联类型（scene）两种宿主形态。
  if (validateCfg) {
    const emptyResult = validateCfg.emptyResult;
    const Base = Host;
    abstract class ValidateYamlRoutesHost extends Base {
      /** YAML 校验端口：子类构造器中绑定，如 (yaml) => this.haYamlValidate.validateScriptYaml(yaml) */
      protected abstract readonly yamlValidate: (
        yaml: string,
      ) => unknown | Promise<unknown>;

      protected runValidateYaml(body: { yaml?: string } | undefined) {
        const yaml = String(body?.yaml || '');
        if (!yaml.trim()) {
          return emptyResult ? emptyResult() : { valid: false, message: 'YAML 为空' };
        }
        return this.yamlValidate(yaml);
      }
    }
    // script / automation 形态：ValidateYamlBodyDto 经全局 ValidationPipe 校验
    abstract class ValidateYamlDtoRoutesHost extends ValidateYamlRoutesHost {
      @ApiOperation({ summary: `校验${options.entityLabel} YAML` })
      @UseGuards(JwtAuthGuard, RolesGuard)
      @Roles('admin', 'adult')
      @Post('validate-yaml')
      validateYaml(@Body() body: ValidateYamlBodyDto) {
        return this.runValidateYaml(body);
      }
    }
    // scene 形态：内联 body 类型，不经 DTO 校验（保持历史行为）
    abstract class ValidateYamlPlainRoutesHost extends ValidateYamlRoutesHost {
      @ApiOperation({ summary: `校验${options.entityLabel} YAML` })
      @UseGuards(JwtAuthGuard, RolesGuard)
      @Roles('admin', 'adult')
      @Post('validate-yaml')
      validateYaml(@Body() body: { yaml?: string }) {
        return this.runValidateYaml(body);
      }
    }
    Host = (
      validateCfg.dtoBody === false ? ValidateYamlPlainRoutesHost : ValidateYamlDtoRoutesHost
    ) as DomainHostCtor;
  }

  // history/executions 路由（可选）：委托目标（service / engine）与参数个数经端口函数区分。
  if (historyCfg) {
    const historyRoles = historyCfg.roles ?? [];
    const Base = Host;
    abstract class ExecutionHistoryRoutesHost extends Base {
      /** 执行历史端口：子类构造器中绑定（scene 忽略参数、automation 绑定 engine） */
      protected abstract readonly executionHistory: (
        automationId: string | undefined,
        limit: number | undefined,
      ) => unknown | Promise<unknown>;

      @ApiOperation({ summary: `获取${options.entityLabel}执行历史` })
      @UseGuards(JwtAuthGuard, RolesGuard)
      @Roles(...historyRoles)
      @Get('history/executions')
      getExecutionHistory(
        @Query('automationId') automationId?: string,
        @Query('limit') limit?: string,
      ) {
        return this.executionHistory(
          automationId,
          limit ? parseInt(limit, 10) : undefined,
        );
      }
    }
    Host = ExecutionHistoryRoutesHost as DomainHostCtor;
  }

  // 无占位符能力的域（如 template-entity）：跳过占位符路由挂载，路由面与接入前保持一致
  if (!supportPlaceholders) {
    return Host;
  }

  const Base = Host;
  abstract class OrchestratorPlaceholderRoutesHost extends Base {
    protected abstract readonly placeholders: OrchestratorPlaceholderPort;

    @ApiOperation({ summary: `扫描${options.entityLabel}占位实体` })
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin', 'adult')
    @Get(':id/placeholders')
    scanPlaceholders(@Param('id') id: string) {
      return this.placeholders.scanPlaceholders(id);
    }

    @ApiOperation({ summary: `替换${options.entityLabel}占位实体` })
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin', 'adult')
    @Post(':id/replace-placeholders')
    replacePlaceholders(@Param('id') id: string, @Body() body: ReplacePlaceholdersDto) {
      return this.updateWithAutoSync(id, {
        mutate: async () => {
          const row = (await this.placeholders.replacePlaceholders(
            id,
            body?.replacements || {},
          )) as {
            id?: string;
            enabled?: boolean;
            yaml?: string;
            remaining?: number;
            placeholders?: string[];
          };
          return row;
        },
        label: `${options.entityLabel}占位替换后 HA 同步`,
        // 还有 remaining 未替换占位符时，不推 HA，避免推送半成品配置
        shouldSync: (r) =>
          !(Number(r?.remaining ?? 0) > 0) &&
          !(Array.isArray(r?.placeholders) && r.placeholders.length > 0),
      });
    }
  }

  return OrchestratorPlaceholderRoutesHost as DomainHostCtor;
}
