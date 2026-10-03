/**
 * 脚本模块 - 服务
 *
 * 职责：
 * - 脚本的 CRUD 操作（继承 OrchestratorCrudService，含执行历史与内置模板三件套）
 * - 脚本执行：解析 YAML 中的 sequence，按顺序执行每个 action
 * - 执行历史记录与查询
 * - 内置脚本模板的获取与安装
 *
 * 本地执行支持：
 * - call_service：调用 HA 服务控制设备
 * - delay：延迟指定时间后继续执行
 * - event：派发 EventBus（含 notify_homeos / home_mode / debug），
 *   并对 homeos.scene|script.execute 做本地直调
 * - stop：中止后续 sequence（error: true 时记失败）
 * - choose / if / repeat / parallel / variables / wait_template / wait_for_trigger
 *
 * 依赖：
 * - PrismaService：脚本与执行历史持久化
 * - HaConnectorService：调用 HA 服务控制设备
 * - AppConfigService：读取执行历史上限等配置
 * - EventEmitter2 / SceneService：本地事件与场景执行
 * - StateStoreService：条件 / wait 读取实体状态
 */
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/prisma/service';
import { parseTimeToMs } from '../../common/utils/time-parse.util';
import { HaConnectorService } from '../ha-connector/service';
import { SceneService } from '../scene/service';
import { StateStoreService } from '../state-store/service';
import {
  OrchestratorCrudService,
  type BuiltinTemplateConfig,
  type ExecutionHistoryConfig,
} from '../../common/crud/orchestrator-crud.service';
import { BusinessException, ErrorCode, getErrorMessage } from '../../common/utils';
import { loadHaYaml } from '@homeos/shared';
import { AppConfigService } from '../../shared/app-config/service';
import {
  isScriptLocalExecutableAction,
  type ScriptActionInput,
} from './action.util';
import {
  checkAutomationConditionList,
  executeRawScriptSequence,
  type AutomationConditionDeps,
} from './local-execute.util';
import {
  automationEntityIdsOf,
  checkAutomationSunCondition,
  checkAutomationTimeCondition,
  resolveAutomationTemplateWithRuntime,
  waitForTriggers,
  type AutomationTraceStep,
} from '../automation/engine-runtime';
import type { ParsedTrigger } from '@homeos/shared';
import { executeViaHaEntity } from '../../shared/orchestrator/execute-via-ha-entity.util';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { buildScriptGeekGraphFromYaml } from '../../shared/orchestrator/builtin-geek-graph.util';
import { ChildModeService } from '../child-mode/service';
import { SCRIPT_BUILTIN_TEMPLATES } from './builtin-templates.data';
import {
  assertEntityIdsExecuteAuthorized,
  collectEntityIdsFromHaYaml,
  type OrchestratorExecActor,
} from '../scene/scene-execute-acl.util';
import { findReplaceableEntityIdsInYaml } from '@homeos/shared';
import { badRequest } from '../../common/utils/business-exception';

/** 脚本动作（HA 脚本 sequence 中的一项） */
type ScriptAction = ScriptActionInput;

/** 解析后的脚本 YAML 结构（含 sequence 动作序列） */
interface ScriptYaml {
  sequence?: ScriptAction[];
  [key: string]: unknown;
}

/**
 * 脚本服务（DI 角色：核心业务服务）。
 * 继承 OrchestratorCrudService<'script'> 获得通用 CRUD、执行历史与内置模板能力，
 * 自行实现脚本执行逻辑。
 */
@Injectable()
export class ScriptService extends OrchestratorCrudService<'script'> {
  constructor(
    prisma: PrismaService,
    private readonly haConnector: HaConnectorService,
    private readonly appConfig: AppConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly sceneService: SceneService,
    private readonly stateStore: StateStoreService,
    private readonly childMode: ChildModeService,
  ) {
    super(prisma, { delegate: prisma.script, modelName: 'script' });
  }

  /** choose 分支条件判定依赖（与自动化引擎共用判定逻辑） */
  private get scriptConditionDeps(): AutomationConditionDeps {
    const ext = this.appConfig.get('external');
    const entityStateOf = (id: string) => {
      const ent = this.stateStore.getById(id);
      return ent?.state != null ? String(ent.state) : undefined;
    };
    return {
      entityIdsOf: automationEntityIdsOf,
      entityStateOf,
      entityLastChangedMs: (id) => {
        const ent = this.stateStore.getById(id) as
          | { last_changed?: string; lastChanged?: string }
          | undefined;
        const raw = ent?.last_changed || ent?.lastChanged;
        return parseTimeToMs(raw);
      },
      entityLastUpdatedMs: (id) => {
        const ent = this.stateStore.getById(id) as
          | {
              last_updated?: string;
              lastUpdated?: string;
              last_changed?: string;
              lastChanged?: string;
            }
          | undefined;
        const raw =
          ent?.last_updated || ent?.lastUpdated || ent?.last_changed || ent?.lastChanged;
        return parseTimeToMs(raw);
      },
      getEntityAttr: (id, attr) => this.stateStore.getById(id)?.attributes?.[attr],
      checkSunCondition: (cond) =>
        checkAutomationSunCondition(
          cond,
          ext.weatherLat,
          ext.weatherLon,
          this.appConfig.getHomeTimezone(),
        ),
      checkTimeCondition: (cond) =>
        checkAutomationTimeCondition(cond, this.appConfig.getHomeTimezone()),
      resolveTemplate: (tpl) =>
        resolveAutomationTemplateWithRuntime(tpl, {}, {
          entityStateOf,
          stateStore: this.stateStore,
          haConnector: this.haConnector,
        }),
      warn: (msg) => this.logger.warn(msg),
    };
  }

  /** wait_template：带运行时 variables 上下文的模板求值 */
  private resolveScriptTemplate(tpl: string, ctx: Record<string, unknown>): Promise<boolean> {
    const entityStateOf = (id: string) => {
      const ent = this.stateStore.getById(id);
      return ent?.state != null ? String(ent.state) : undefined;
    };
    return resolveAutomationTemplateWithRuntime(tpl, ctx, {
      entityStateOf,
      stateStore: this.stateStore,
      haConnector: this.haConnector,
    });
  }

  /**
   * wait_for_trigger：轮询实体状态变化，并对 event 平台用 EventEmitter 捕获。
   * 逻辑对齐 automation createAutomationActionDeps.waitForTriggers。
   */
  private waitScriptTriggers(
    triggers: ParsedTrigger[],
    timeoutSec: number,
    trace: AutomationTraceStep[],
  ): Promise<boolean> {
    const buffer: Array<{ type: string; data: Record<string, unknown> }> = [];
    const handlers: Array<{ type: string; fn: (...args: unknown[]) => void }> = [];
    const entityStateOf = (id: string) => {
      const ent = this.stateStore.getById(id);
      return ent?.state != null ? String(ent.state) : undefined;
    };
    const entityAttrOf = (id: string, attr: string) => {
      const raw = this.stateStore.getById(id)?.attributes?.[attr];
      return raw != null ? String(raw) : undefined;
    };
    return waitForTriggers(
      {
        entityStateOf,
        entityAttrOf,
        beginEventCapture: (eventTypes) => {
          for (const type of eventTypes) {
            const fn = (...args: unknown[]) => {
              const raw = args[0];
              const data =
                raw && typeof raw === 'object'
                  ? (raw as Record<string, unknown>)
                  : { value: raw };
              buffer.push({ type, data });
            };
            this.eventEmitter.on(type, fn);
            handlers.push({ type, fn });
          }
          return () => {
            for (const h of handlers) {
              this.eventEmitter.off(h.type, h.fn);
            }
          };
        },
        consumeEvent: (eventType) => {
          const idx = buffer.findIndex((e) => e.type === eventType);
          if (idx < 0) return null;
          const [hit] = buffer.splice(idx, 1);
          return hit?.data ?? null;
        },
      },
      triggers,
      timeoutSec,
      trace,
    );
  }

  /** 执行历史上限（从 ops.scriptExecHistoryMax 配置读取） */
  private get maxHistory() {
    return this.appConfig.get('ops').scriptExecHistoryMax;
  }

  /**
   * 执行脚本
   *
   * 解析 YAML 中的动作序列（sequence），按顺序执行每个 action。
   * 本地支持 call_service / delay / event / stop / choose / repeat / parallel /
   * variables / wait_template / wait_for_trigger；device 等仍需 runOnHa。
   *
   * 若脚本设为 runOnHa 且已同步到 HA，则直接调用 script.turn_on 委托 HA 执行，
   * 可通过 variables 传入脚本变量。
   *
   * @param id 脚本 ID
   * @param variables 可选，传入脚本的变量（并入本地 templateContext）
   * @returns 执行结果（scriptId / scriptName / success / executed / total / results）
   * @throws BusinessException 脚本不存在、YAML 解析失败或无动作
   * @throws ServiceUnavailableException HA 未连接
   */
  async execute(
    id: string,
    variables?: Record<string, unknown>,
    actor?: OrchestratorExecActor,
  ) {
    const script = await this.findOne(id);
    if (!script) throw new BusinessException(ErrorCode.NOT_FOUND, API_ERROR.SCRIPT_NOT_FOUND);

    const scriptRecord = script as Record<string, unknown>;
    const yamlText = String(scriptRecord.yaml || '');
    if (findReplaceableEntityIdsInYaml(yamlText).length > 0) {
      badRequest(API_ERROR.ORCHESTRATOR_PLACEHOLDERS_PENDING);
    }
    assertEntityIdsExecuteAuthorized(
      collectEntityIdsFromHaYaml(yamlText),
      actor,
      this.childMode,
    );

    let parsed: ScriptYaml;
    try {
      parsed = loadHaYaml(yamlText) as ScriptYaml;
    } catch {
      throw new BusinessException(ErrorCode.VALIDATION_FAILED, API_ERROR.SCRIPT_YAML_PARSE_FAILED);
    }

    const actions = parsed.sequence || [];
    if (actions.length === 0) {
      throw new BusinessException(ErrorCode.VALIDATION_FAILED, API_ERROR.SCRIPT_NO_ACTIONS);
    }

    const haStatus = await this.haConnector.getStatus();
    if (!haStatus.connected) {
      throw new ServiceUnavailableException(API_ERROR.HA_SCRIPT_NOT_CONNECTED);
    }

    // HA 执行模式：直接调用 script.turn_on，由 HA 端完成全部动作
    if (scriptRecord.runOnHa) {
      return this.executeViaHa(scriptRecord, id, variables);
    }

    // 本地执行；device 等未知结构仍必须走 HA
    const hasUnsupported = actions.some((action) => !isScriptLocalExecutableAction(action));
    if (hasUnsupported) {
      throw new BusinessException(ErrorCode.VALIDATION_FAILED, API_ERROR.SCRIPT_LOCAL_UNSUPPORTED);
    }

    const { result, errors } = await this.executeLocally(
      scriptRecord,
      id,
      actions,
      variables,
      actor,
    );
    this.recordAndNotify(scriptRecord, id, result, errors);
    return result;
  }

  /**
   * HA 执行模式：直接调用 script.turn_on，由 HA 端完成全部动作。
   * 失败时补写失败执行历史（含错误摘要），避免 runOnHa 脚本失败无迹可查。
   */
  private async executeViaHa(
    scriptRecord: Record<string, unknown>,
    id: string,
    variables?: Record<string, unknown>,
  ) {
    if (!scriptRecord.haConfigId) {
      throw new BusinessException(ErrorCode.VALIDATION_FAILED, API_ERROR.HA_SCRIPT_NOT_SYNCED);
    }
    const scriptName = (scriptRecord.name as string) || id;
    let entityId: string;
    try {
      const result = await executeViaHaEntity({
        domain: 'script',
        haConfigId: String(scriptRecord.haConfigId),
        callService: (domain, service, eid, data) =>
          this.haConnector.callService(domain, service, eid, data),
        data: variables || {},
        execFailed: API_ERROR.HA_SCRIPT_EXEC_FAILED,
      });
      entityId = result.entityId;
    } catch (err) {
      this.recordExecution(
        { entityId: id, entityName: scriptName, success: false, executed: 0, total: 1 },
        [getErrorMessage(err)],
        { scriptId: id, scriptName },
      );
      throw err;
    }
    const haResult = {
      scriptId: id,
      scriptName,
      success: true,
      executed: 1,
      total: 1,
      results: [{ index: 0, service: 'script.turn_on', entity_id: entityId, success: true }],
    };
    this.recordAndNotify(scriptRecord, id, haResult, []);
    return haResult;
  }

  /**
   * 本地执行：解析 YAML sequence 后按顺序执行每个 action。
   * @returns 执行结果与失败错误列表（由调用方统一记录历史）
   */
  private async executeLocally(
    scriptRecord: Record<string, unknown>,
    id: string,
    actions: ScriptAction[],
    variables?: Record<string, unknown>,
    actor?: OrchestratorExecActor,
  ) {
    const results = await executeRawScriptSequence(actions, {
      logger: {
        log: (msg) => this.logger.log(`脚本 [${scriptRecord.name || id}] ${msg}`),
        error: (msg) => this.logger.error(msg),
      },
      haConnector: this.haConnector,
      eventEmitter: this.eventEmitter,
      // 透传 actor：homeos.scene.execute 经脚本触发时须过 scene 实体 ACL，避免 child 绕过
      sceneService: { execute: (sceneId) => this.sceneService.execute(sceneId, actor) },
      executeScript: (scriptId, vars) => this.execute(scriptId, vars, actor),
      checkConditionList: (conditions) =>
        checkAutomationConditionList(conditions, this.scriptConditionDeps),
      resolveTemplate: (tpl, ctx) => this.resolveScriptTemplate(tpl, ctx),
      waitForTriggers: (triggers, timeoutSec, trace) =>
        this.waitScriptTriggers(triggers, timeoutSec, trace),
      templateContext: { ...(variables || {}) },
    });

    const allSuccess = results.every((r) => r.success);
    this.logger.log(
      `脚本 [${scriptRecord.name || id}] 执行完成: ${results.filter((r) => r.success).length}/${results.length}`,
    );

    const result = {
      scriptId: id,
      scriptName: (scriptRecord.name as string) || id,
      success: allSuccess,
      executed: results.filter((r) => r.success).length,
      total: results.length,
      results,
    };

    const errors = results.filter((r) => !r.success).map((r) => r.error || r.service);
    return { result, errors };
  }

  /**
   * 记录脚本执行历史。
   * @param scriptRecord 脚本记录（取名称）
   * @param id 脚本 ID
   * @param result 执行结果
   * @param errors 失败动作的错误信息或服务名
   */
  private recordAndNotify(
    scriptRecord: Record<string, unknown>,
    id: string,
    result: { success: boolean; executed: number; total: number },
    errors: string[],
  ) {
    const scriptName = (scriptRecord.name as string) || id;
    this.recordExecution(
      { entityId: id, entityName: scriptName, ...result },
      errors,
      { scriptId: id, scriptName },
    );
  }

  /**
   * 获取脚本执行历史（以数据库为唯一数据源）。
   * @param limit 返回条数上限（缺省为 maxHistory）
   */
  async getExecutionHistory<TExtra = { scriptId: string; scriptName: string }>(
    limit?: number,
    where?: Record<string, unknown>,
  ) {
    return super.getExecutionHistory<TExtra>(limit, where);
  }

  /**
   * 内置模板配置（yaml 型）：数据源 + 安装回调。
   * 安装时经 buildScriptGeekGraphFromYaml 生成画布图。
   */
  protected builtinTemplateConfig(): BuiltinTemplateConfig {
    return {
      kind: 'yaml',
      templates: SCRIPT_BUILTIN_TEMPLATES,
      notFoundMessage: '未找到内置脚本模板',
      createFromTemplate: (template) => {
        const geekGraph =
          template.geekGraph || buildScriptGeekGraphFromYaml(template.name, template.yaml);
        return this.create({
          name: template.name,
          yaml: template.yaml,
          runOnHa: false,
          ...(geekGraph ? { geekGraph } : {}),
        }) as Promise<{ id: string; yaml?: string }>;
      },
    };
  }

  /** 执行历史配置：脚本执行历史委托 + 日志标签 + 保留条数上限。 */
  protected executionHistoryConfig(): ExecutionHistoryConfig {
    return {
      delegate: this.prisma.scriptExecution,
      label: '脚本',
      maxHistory: this.maxHistory,
    };
  }
}