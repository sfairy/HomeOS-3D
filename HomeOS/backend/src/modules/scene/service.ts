/**
 * 场景模块 - 服务
 *
 * 职责：
 * - 场景的 CRUD 操作（继承 OrchestratorCrudService，含执行历史与内置模板三件套）
 * - 场景执行：支持本地执行（逐个调用 HA 服务）与 HA 执行（scene.turn_on）
 * - 执行历史记录与查询
 * - 内置场景模板的获取与安装
 * - 危险传感器联动场景触发
 *
 * 场景执行支持：
 * - 批量并发执行（无延迟的实体）
 * - 延迟执行（单个实体间的延迟）
 * - 执行历史记录
 *
 * 叠加取消 / 定时调度分别委托 SceneOverlayService / SceneScheduleService。
 *
 * 依赖：
 * - PrismaService：场景与执行历史持久化
 * - HaConnectorService：调用 HA 服务控制设备
 * - AppConfigService：读取执行历史上限等配置
 * - EventBusService：发布 scene.executed 事件
 * - SceneOverlayService：叠加执行快照与取消恢复
 * - SceneScheduleService：场景定时调度
 */
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { findReplaceableEntityIdsInSceneEntities } from '@homeos/shared';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/prisma/service';
import { HaConnectorService } from '../ha-connector/service';
import {
  OrchestratorCrudService,
  type BuiltinTemplateConfig,
  type ExecutionHistoryConfig,
} from '../../common/crud/orchestrator-crud.service';
import type { CrudWriteEvent } from '../../common/crud/base-crud.service';
import { BusinessException, ErrorCode, getErrorMessage } from '../../common/utils';
import { badRequest } from '../../common/utils/business-exception';
import { AppConfigService } from '../../shared/app-config/service';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { ChildModeService } from '../child-mode/service';
import {
  type SceneEntityConfig,
  builderEntitiesToHaMap,
  expandSceneEntityConfigs,
  resolveSceneEntityAction,
} from '../../shared/orchestrator/config.util';
import { executeActionSequence } from '../../shared/orchestrator/execute-action-sequence.util';
import { executeViaHaEntity } from '../../shared/orchestrator/execute-via-ha-entity.util';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { buildSceneGeekSceneGraph } from '../../shared/orchestrator/builtin-geek-graph.util';
import { dumpOrchestratorYaml } from '../../shared/orchestrator/yaml.util';
import { normalizeSceneYamlPersistPayload } from '../../shared/orchestrator/scene-yaml-persist.util';
import { normalizeGeekGraphInput } from '../../shared/orchestrator/geek-graph-input.util';
import { readJsonArray, toInputJson } from '../../common/utils/json-field.util';
import { Prisma } from '../../generated/prisma/client';
import { SCENE_BUILTIN_TEMPLATES } from './builtin-templates.data';
import {
  assertSceneExecuteAuthorized,
  assertEntityIdsExecuteAuthorized,
  collectEntityIdsFromHaYaml,
  type OrchestratorExecActor,
} from './scene-execute-acl.util';
import {
  SceneOverlayService,
  type OverlaySnapshotMap,
} from './scene-overlay.service';
import { SceneScheduleService } from './scene-schedule.service';
import type { SceneScheduleItem } from './scene-schedule.util';

/**
 * 场景服务（DI 角色：核心业务服务）。
 * 继承 OrchestratorCrudService<'scene'> 获得通用 CRUD、执行历史与内置模板能力，
 * 自行实现场景执行与危险传感器联动逻辑。
 */
@Injectable()
export class SceneService extends OrchestratorCrudService<'scene'> {
  constructor(
    prisma: PrismaService,
    private readonly haConnector: HaConnectorService,
    private readonly appConfig: AppConfigService,
    private readonly eventBus: EventBusService,
    private readonly childMode: ChildModeService,
    private readonly overlay: SceneOverlayService,
    private readonly schedule: SceneScheduleService,
  ) {
    super(prisma, { delegate: prisma.scene, modelName: 'scene' });
  }

  /** 删除场景后级联删除其定时条目，避免孤儿定时每 30s 重试已删除场景 */
  protected async afterWrite(event: CrudWriteEvent): Promise<void> {
    await super.afterWrite(event);
    if (event.op === 'remove' && event.id) {
      try {
        await this.schedule.removeSceneSchedule(event.id);
      } catch (e: unknown) {
        this.logger.warn(`删除场景定时条目失败 [${event.id}]: ${getErrorMessage(e)}`);
      }
    }
  }

  /** 场景定时条目列表（委托 SceneScheduleService） */
  async listSceneSchedules(): Promise<SceneScheduleItem[]> {
    return this.schedule.listSceneSchedules();
  }

  /** 新增 / 更新场景定时条目（委托 SceneScheduleService） */
  async upsertSceneSchedule(input: {
    sceneId: string;
    sceneName?: string;
    cron?: string;
    at?: string;
    days?: number[];
    enabled?: boolean;
  }): Promise<SceneScheduleItem> {
    return this.schedule.upsertSceneSchedule(input);
  }

  /** 删除场景定时条目（委托 SceneScheduleService） */
  async removeSceneSchedule(sceneId: string): Promise<{ removed: boolean }> {
    return this.schedule.removeSceneSchedule(sceneId);
  }

  /** 定时扫描到期场景（委托 SceneScheduleService） */
  async runScheduledScenes(): Promise<{ fired: number; failed: number }> {
    return this.schedule.runScheduledScenes();
  }

  /** 执行历史上限（从 ops.sceneExecHistoryMax 配置读取） */
  private get maxHistory() {
    return this.appConfig.get('ops').sceneExecHistoryMax;
  }

  /** 图字段名：scene 使用 geekSceneGraph（基类默认 geekGraph）。 */
  protected override graphField(): Record<string, boolean> {
    return { geekSceneGraph: true };
  }

  /** 列表查询的 Prisma 参数（按创建时间倒序；含 yaml 供列表 hint）。
   *  注意：不 select overlay——列表保持轻量，仅在需要 overlay 的接口（详情/执行路径）按需读取。 */
  protected override listFindArgs() {
    return {
      orderBy: { createdAt: 'desc' as const },
      select: { ...this.listSelect(), entities: true },
    };
  }

  /** 写入前将 entities 规范为 Prisma Json（API 以 JSON 字符串提交，toInputJson 解析为对象/数组） */
  private normalizeEntitiesInput(entities: unknown): Prisma.InputJsonValue {
    return toInputJson(entities, []);
  }

  /** 从 entities 生成场景 YAML（内置安装 / 指纹用） */
  private entitiesToYaml(name: string, entities: unknown): string {
    const map = builderEntitiesToHaMap(entities);
    return dumpOrchestratorYaml({ name, entities: map });
  }

  /**
   * 写入前规范化钩子（覆盖基类默认）：
   * - geekSceneGraph 字段规范（null → DbNull，对象 → Json；update 未传时保留库内原图）
   * - yaml 持久化契约（仅 entities 且未传 yaml 时保留库内原 yaml）
   * - entities 规范为 Prisma Json
   * overlay 为 Prisma 常规字段，随 payload 一起由基类 create/update 写入。
   */
  protected override normalizeWritePayload(
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const normalized = normalizeSceneYamlPersistPayload(
      normalizeGeekGraphInput(payload, 'geekSceneGraph'),
    );
    if (normalized.entities !== undefined) {
      normalized.entities = this.normalizeEntitiesInput(normalized.entities);
    }
    return normalized;
  }

  /** 更新写入钩子（覆盖基类默认）：scene 未传 geekSceneGraph 时保留库内原图（不清空）。 */
  protected override applyYamlChangeGraphPolicy(_payload: Record<string, unknown>): void {
    // 保留库内原图
  }

  /**
   * 查询单条场景（继承 OrchestratorCrudService）。
   * 生成的 prisma client 已包含 overlay 标量字段，findUnique 默认返回全部标量字段，
   * 详情 / 执行路径可直接读取 scene.overlay，无需再经 $queryRaw 垫片。
   */
  override async findOne(id: string) {
    return super.findOne(id);
  }

  /**
   * 执行单个场景实体（调用 HA 服务）。
   * @param config 实体配置（含 entityId / domain / service / data）
   * @returns 执行结果（成功/失败 + 错误信息）
   */
  private async executeEntity(config: SceneEntityConfig) {
    const { entityId, domain, service, data } = resolveSceneEntityAction(config);
    try {
      await this.haConnector.callService(domain, service, entityId, data);
      return { entity_id: entityId, service: `${domain}.${service}`, success: true };
    } catch (err: unknown) {
      const errMsg = getErrorMessage(err);
      this.logger.error(`场景执行失败 [${entityId}]: ${errMsg}`);
      return {
        entity_id: entityId,
        service: `${domain}.${service}`,
        success: false,
        error: errMsg,
      };
    }
  }

  /**
   * 执行场景
   *
   * 执行逻辑：
   * 1. 并发执行所有无延迟的实体
   * 2. 遇到延迟实体先执行延迟，再执行该实体
   * 3. 继续下一批无延迟实体...
   *
   * 若场景设为 runOnHa 且已同步到 HA，则直接调用 scene.turn_on 委托 HA 执行。
   * 执行完成后发布 scene.executed 事件并记录执行历史。
   *
   * @param id 场景 ID
   * @param actor 执行人（系统定时触发可省略，跳过实体级 ACL）
   * @param options.rollbackOnFailure 部分实体失败时回滚已成功实体（本地执行路径）
   * @returns 执行结果（success / executed / total / results）
   * @throws BusinessException 场景不存在或配置解析失败
   * @throws ServiceUnavailableException HA 未连接
   */
  async execute(
    id: string,
    actor?: OrchestratorExecActor,
    options?: { rollbackOnFailure?: boolean },
  ) {
    const scene = await this.findOne(id);
    if (!scene) throw new BusinessException(ErrorCode.NOT_FOUND, API_ERROR.SCENE_NOT_FOUND);

    let entityConfigs: SceneEntityConfig[];
    const sceneRecord = scene as Record<string, unknown>;
    try {
      entityConfigs = readJsonArray<SceneEntityConfig>(sceneRecord.entities, []);
    } catch {
      throw new BusinessException(ErrorCode.VALIDATION_FAILED, API_ERROR.SCENE_CONFIG_PARSE_FAILED);
    }
    if (!Array.isArray(entityConfigs)) {
      throw new BusinessException(ErrorCode.VALIDATION_FAILED, API_ERROR.SCENE_CONFIG_PARSE_FAILED);
    }

    assertSceneExecuteAuthorized(entityConfigs, actor, this.childMode);
    const yamlText = typeof sceneRecord.yaml === 'string' ? sceneRecord.yaml : '';
    if (yamlText.trim()) {
      assertEntityIdsExecuteAuthorized(
        collectEntityIdsFromHaYaml(yamlText),
        actor,
        this.childMode,
      );
    }
    if (
      findReplaceableEntityIdsInSceneEntities(
        typeof sceneRecord.entities === 'string'
          ? sceneRecord.entities
          : JSON.stringify(sceneRecord.entities ?? []),
      ).length > 0
    ) {
      badRequest(API_ERROR.ORCHESTRATOR_PLACEHOLDERS_PENDING);
    }

    const haStatus = await this.haConnector.getStatus();
    if (!haStatus.connected) {
      throw new ServiceUnavailableException(API_ERROR.HA_SCENE_NOT_CONNECTED);
    }

    // 叠加执行：执行前采集场景声明实体的快照（仅这些实体，不覆盖未声明实体），
    // 供 POST /scene/:id/cancel 在执行中恢复执行前状态；非 overlay 场景保持既有行为不变。
    const overlayMode = !!sceneRecord.overlay;
    let cancelable = false;
    if (overlayMode) {
      const snapshot = await this.overlay.captureOverlaySnapshot(entityConfigs);
      cancelable = await this.overlay.storeOverlaySnapshot(id, snapshot);
    }

    // HA 执行模式：直接调用 scene.turn_on，由 HA 端完成全部实体操作
    if (sceneRecord.runOnHa) {
      return this.executeViaHa(sceneRecord, id, overlayMode, cancelable);
    }

    // 本地执行：展开多步服务后按序列执行（支持延迟与部分失败回滚）
    const { result, errors } = await this.executeLocally(
      id,
      entityConfigs,
      overlayMode,
      cancelable,
      options,
    );
    this.recordAndNotify(id, (sceneRecord.name as string) || id, result, errors);
    return result;
  }

  /**
   * HA 执行模式：直接调用 scene.turn_on，由 HA 端完成全部实体操作。
   * 失败时补写失败执行历史（含错误摘要），避免 runOnHa 场景失败无迹可查。
   */
  private async executeViaHa(
    sceneRecord: Record<string, unknown>,
    id: string,
    overlayMode: boolean,
    cancelable: boolean,
  ) {
    if (!sceneRecord.haConfigId) {
      throw new BusinessException(ErrorCode.VALIDATION_FAILED, API_ERROR.HA_SCENE_NOT_SYNCED);
    }
    let entityId: string;
    try {
      const result = await executeViaHaEntity({
        domain: 'scene',
        haConfigId: String(sceneRecord.haConfigId),
        callService: (domain, service, eid, data) =>
          this.haConnector.callService(domain, service, eid, data),
        execFailed: API_ERROR.HA_SCENE_EXEC_FAILED,
      });
      entityId = result.entityId;
    } catch (err) {
      const sceneName = (sceneRecord.name as string) || id;
      this.recordExecution(
        { entityId: id, entityName: sceneName, success: false, executed: 0, total: 1 },
        [getErrorMessage(err)],
        { sceneId: id, sceneName },
      );
      throw err;
    }
    const sceneName = (sceneRecord.name as string) || id;
    const haResult = {
      success: true,
      executed: 1,
      total: 1,
      results: [{ entity_id: entityId, service: 'scene.turn_on', success: true }],
      ...(overlayMode ? { overlay: true, cancelable } : {}),
    };
    this.recordAndNotify(id, sceneName, haResult, []);
    return haResult;
  }

  /**
   * 本地执行：展开 climate/cover/渐变等多步服务后按序列执行（支持延迟），
   * 部分实体失败时按 rollbackOnFailure 回滚已成功实体，并采集 overlay 基线。
   * @returns 执行结果与失败错误列表（由调用方统一记录历史并发布事件）
   */
  private async executeLocally(
    id: string,
    entityConfigs: SceneEntityConfig[],
    overlayMode: boolean,
    cancelable: boolean,
    options?: { rollbackOnFailure?: boolean },
  ) {
    const expanded = entityConfigs.flatMap((cfg) => expandSceneEntityConfigs(cfg));

    // 自动回滚：执行前采集声明实体快照，供部分失败时恢复已成功实体
    const rollbackOnFailure = !!options?.rollbackOnFailure;
    let rollbackSnapshot: OverlaySnapshotMap | null = null;
    if (rollbackOnFailure) {
      rollbackSnapshot = await this.overlay.captureOverlaySnapshot(entityConfigs);
    }

    const results = await executeActionSequence(
      expanded,
      (cfg) => this.executeEntity(cfg),
      'milliseconds',
    );

    // 部分实体失败时回滚已成功实体（跳过恢复与执行前一致、或未被场景触达的实体）
    let rolledBack = 0;
    if (rollbackOnFailure && rollbackSnapshot && !results.every((r) => r.success)) {
      const successTargets = new Set(
        expanded.filter((cfg, idx) => results[idx]?.success).map((cfg) => cfg.entity_id || cfg.entityId || ''),
      );
      rolledBack = await this.overlay.rollbackEntitiesFromSnapshot(rollbackSnapshot, [...successTargets]);
      this.logger.warn(
        `场景 ${id} 部分实体执行失败,已回滚 ${rolledBack} 个已成功实体`,
      );
    }

    const result = {
      success: results.every((r) => r.success),
      executed: results.filter((r) => r.success).length,
      total: results.length,
      results,
      ...(overlayMode ? { overlay: true, cancelable } : {}),
      ...(rollbackOnFailure ? { rollback: true, rolledBack } : {}),
    };

    // 叠加执行：采集执行后目标基线，供取消接口区分「用户手动改动」与「场景设置」
    if (overlayMode) {
      await this.overlay.refreshOverlayAfterBaseline(id, entityConfigs);
    }

    const errors = result.results.filter((r) => !r.success).map((r) => r.error || '未知错误');
    return { result, errors };
  }

  /**
   * 记录执行历史并发布 scene.executed 事件。
   * @param id 场景 ID
   * @param sceneName 场景名称
   * @param result 执行结果（success / executed / total）
   * @param errors 错误信息数组
   */
  private recordAndNotify(
    id: string,
    sceneName: string,
    result: { success: boolean; executed: number; total: number },
    errors: string[],
  ) {
    this.recordExecution(
      { entityId: id, entityName: sceneName, ...result },
      errors,
      { sceneId: id, sceneName },
    );
    this.eventBus.emit('scene.executed', {
      sceneId: id,
      sceneName,
      success: result.success,
      executed: result.executed,
      total: result.total,
      executedAt: new Date().toISOString(),
    });
  }

  /**
   * 取消场景执行：恢复到该场景最近一次叠加执行前的快照，并清除快照。
   * 委托 SceneOverlayService。带 actor 时先校验场景实体 ACL（防止 child 借取消回滚
   * 管理员的锁门/布防快照）。
   */
  async cancel(id: string, actor?: OrchestratorExecActor) {
    if (actor) {
      const scene = await this.findOne(id);
      if (!scene) throw new BusinessException(ErrorCode.NOT_FOUND, API_ERROR.SCENE_NOT_FOUND);
      const sceneRecord = scene as Record<string, unknown>;
      let entityConfigs: SceneEntityConfig[];
      try {
        entityConfigs = readJsonArray<SceneEntityConfig>(sceneRecord.entities, []);
      } catch {
        throw new BusinessException(
          ErrorCode.VALIDATION_FAILED,
          API_ERROR.SCENE_CONFIG_PARSE_FAILED,
        );
      }
      assertSceneExecuteAuthorized(entityConfigs, actor, this.childMode);
    }
    return this.overlay.cancel(id);
  }

  /**
   * 内置模板配置（scene 型）：数据源 + 安装回调 + 导出附加 YAML。
   * 安装时经 buildSceneGeekSceneGraph 生成星形图画布。
   */
  protected builtinTemplateConfig(): BuiltinTemplateConfig {
    return {
      kind: 'scene',
      templates: SCENE_BUILTIN_TEMPLATES,
      notFoundMessage: '未找到内置场景模板',
      createFromTemplate: (template) => {
        const yaml = this.entitiesToYaml(template.name, template.entities);
        const geekSceneGraph =
          template.geekSceneGraph ||
          buildSceneGeekSceneGraph(template.name, template.entities, yaml);
        return this.create({
          name: template.name,
          entities: template.entities,
          yaml,
          runOnHa: false,
          geekSceneGraph,
        }) as Promise<{ id: string; entities?: unknown }>;
      },
      exportExtra: (template) => ({
        yaml: this.entitiesToYaml(template.name, template.entities),
      }),
    };
  }

  /** 执行历史配置：场景执行历史委托 + 日志标签 + 保留条数上限。 */
  protected executionHistoryConfig(): ExecutionHistoryConfig {
    return {
      delegate: this.prisma.sceneExecution,
      label: '场景',
      maxHistory: this.maxHistory,
    };
  }

  /**
   * 获取场景执行历史（以数据库为唯一数据源）。
   * @param limit 返回条数上限（缺省为 maxHistory）
   */
  async getExecutionHistory<TExtra = { sceneId: string; sceneName: string }>(
    limit?: number,
    where?: Record<string, unknown>,
  ) {
    return super.getExecutionHistory<TExtra>(limit, where);
  }

  /**
   * 危险传感器触发时执行 layout 绑定的紧急场景。
   * 监听 hazard.executeScene 事件，执行失败时发送通知。
   * @param payload 含 sceneId / source / entityId / hazard
   */
  @OnEvent('hazard.executeScene')
  async onHazardExecuteScene(payload: {
    sceneId?: string;
    source?: string;
    entityId?: string;
    hazard?: string;
  }) {
    const sceneId = String(payload?.sceneId || '').trim();
    if (!sceneId) return;
    try {
      await this.execute(sceneId);
      this.logger.warn(
        `危险传感器联动场景已执行: ${sceneId} (${payload?.hazard || payload?.source || ''})`,
      );
    } catch (err) {
      const msg = getErrorMessage(err);
      this.logger.warn(`危险传感器紧急场景执行失败 ${sceneId}: ${msg}`);
      // 执行失败时发送站内通知
      this.eventBus.emit('notification.created', {
        id: `hazard_scene_fail_${Date.now()}`,
        level: 'warn',
        message: `紧急场景执行失败：${sceneId}（${msg}）`,
        source: 'hazard',
        read: false,
        createdAt: new Date().toISOString(),
        channels: ['in_app', 'socket'],
      });
    }
  }
}
