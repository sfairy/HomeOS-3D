/**
 * 联动健康诊断服务
 *
 * 所属模块：linkage-health（由 LinkageHealthModule 提供）
 * 职责：聚合安防、HA 同步、家庭模式、能源/天气自动联动与自动化执行情况，
 *  产出联动健康快照；并检测/消解内置自动化与家庭模式之间的重复触发冲突。
 * 依赖：
 *  - PrismaService：读取安全事件、自动化与家庭模式记录；
 *  - HaSyncService / OrchestratorHaSyncEngine：HA 同步状态与同步漂移错误；
 *  - SecurityPanelService / PresenceService：安防模式与在家成员；
 *  - HomeModeService：家庭模式触发日志；
 *  - NotificationService：告警规则历史与冲突消解通知；
 *  - EnergyAutoLinkageService：能源自动联动状态；
 *  - WeatherAutoLinkageService：天气预警联动状态；
 *  - AutomationService / AutomationEngineService：冲突自动化的禁用与规则重载。
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/service';
import { HaSyncService } from '../ha-sync/service';
import { SecurityPanelService } from '../security/panel/security-panel.service';
import { PresenceService } from '../security/presence/service';
import { HomeModeService } from '../home-mode/service';
import { OrchestratorHaSyncEngine } from '../../shared/orchestrator/ha-sync.engine';
import { NotificationService } from '../notification/service';
import { EnergyAutoLinkageService } from './auto-linkage.service';
import { WeatherAutoLinkageService } from '../weather/weather-auto-linkage.service';
import { AutomationService } from '../automation/service';
import { AutomationEngineService } from '../automation/engine.service';
import { readJsonArray, readJsonObject } from '../../common/utils/json-field.util';
import { collectEntityIdsFromHaYaml } from '../scene/scene-execute-acl.util';
import {
  expandSceneEntityConfigs,
  resolveSceneEntityAction,
  type SceneEntityConfig,
} from '../../shared/orchestrator/config.util';

/**
 * 纳入联动健康监控的"联动失败"安全事件类型集合。
 *
 * 这些 type 值为 Prisma securityEvent 表中的事件类型标识（不翻译），
 * 涵盖自动布防/撤防失败、离家模拟失败、家庭模式失败、
 * 以及能源相关联动（场景/模式/气候/热水器/室内空气）失败。
 */
const LINKAGE_EVENT_TYPES = [
  'linkage_auto_arm_failed',
  'linkage_auto_disarm_failed',
  'linkage_away_sim_failed',
  'linkage_home_mode_failed',
  'linkage_energy_scene_failed',
  'linkage_energy_mode_failed',
  'linkage_energy_climate_failed',
  'linkage_energy_water_heater_failed',
  'linkage_energy_iaq_failed',
];

/** 内置自动化模板与家庭模式易重复触发的对照 */
const BUILTIN_HOME_MODE_CONFLICTS: Array<{
  templateId: string;
  templateName: string;
  modeHints: RegExp;
  reason: string;
}> = [
  {
    templateId: 'night_mode',
    templateName: '晚安模式',
    modeHints: /睡眠|助眠|sleep|night/i,
    reason: '内置晚安自动化与睡眠类家庭模式可能在 22:00 双重关灯/布防',
  },
  {
    templateId: 'away_mode_climate',
    templateName: '离家自动节能',
    modeHints: /离家|外出|away|leave/i,
    reason: '内置离家节能自动化与离家家庭模式可能重复关空调/关灯',
  },
  {
    templateId: 'lights_off_at_midnight',
    templateName: '午夜自动关灯',
    modeHints: /睡眠|助眠|night|sleep/i,
    reason: '午夜关灯模板与睡眠模式关灯动作可能叠加',
  },
];

/**
 * 通用实体操作冲突项（kind='entity-conflict'）。
 *
 * 与内置「模板 × 家庭模式」冲突（无 kind 字段）共存于 getSnapshot().conflicts 数组，
 * 通过 kind 字段区分；涉及联动器按类型分组列出 id 与名称，便于前端直接渲染。
 */
interface EntityConflictItem {
  kind: 'entity-conflict';
  /** 被多个联动器共同操作的实体 */
  entityId: string;
  /** 冲突动作类型（自动化/脚本为 domain.service，场景为期望状态） */
  actionType?: string;
  automationIds?: string[];
  automationNames?: string[];
  sceneIds?: string[];
  sceneNames?: string[];
  scriptIds?: string[];
  scriptNames?: string[];
  reason: string;
}

/** 联动器类型 → 中文标签（冲突原因文案用） */
const LINKAGER_TYPE_LABEL: Record<string, string> = {
  automation: '自动化',
  scene: '场景',
  script: '脚本',
};

/** 占位实体过滤：内置模板安装后未映射前为 <domain>.xxx_placeholder / <domain>.placeholder，避免模板假冲突 */
const PLACEHOLDER_ENTITY_RE = /(?:_placeholder|\.placeholder)\b/i;

/** 参与通用冲突扫描的单条联动器（entityId → 动作类型集合） */
interface LinkagerEntityOps {
  type: 'automation' | 'scene' | 'script';
  id: string;
  name: string;
  ops: Map<string, Set<string>>;
}

/** 将实体 ID 列表规范为小写去空白列表（输入须为 string[]；调用方负责将图节点字段收窄为数组） */
function toEntityIdList(raw: string[]): string[] {
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const t = item.trim().toLowerCase();
      if (t) ids.push(t);
    }
  }
  return ids;
}

/** 记录 target 中实体对应的动作类型（service 或 scene state） */
function addActionType(target: Map<string, Set<string>>, entityId: string, actionType: string) {
  let types = target.get(entityId);
  if (!types) {
    types = new Set();
    target.set(entityId, types);
  }
  if (actionType) types.add(actionType);
}

/**
 * 从 geekGraph.actions（自动化/脚本流程编辑器的动作节点）提取实体操作集。
 * 仅识别 callService 实体操作节点；delay/notify/event 等节点不涉及实体争抢。
 */
function collectGeekGraphActionOps(actions: unknown, target: Map<string, Set<string>>): void {
  const list = readJsonArray(actions);
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const action = raw as Record<string, unknown>;
    if (action.type !== 'callService') continue;
    const rawEntityId = action.entityId ?? action.entity_id;
    const ids = toEntityIdList(
      typeof rawEntityId === 'string'
        ? [rawEntityId]
        : Array.isArray(rawEntityId)
          ? rawEntityId
          : [],
    );
    const service = [String(action.domain || ''), String(action.service || '')]
      .filter(Boolean)
      .join('.');
    for (const eid of ids) addActionType(target, eid, service);
  }
}

/** 从场景 geekSceneGraph.entities 提取实体操作集（entityId + 期望状态） */
function collectSceneGraphOps(entities: unknown, target: Map<string, Set<string>>): void {
  const list = readJsonArray(entities);
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const rawEntityId = row.entityId ?? row.entity_id;
    const ids = toEntityIdList(
      typeof rawEntityId === 'string'
        ? [rawEntityId]
        : Array.isArray(rawEntityId)
          ? rawEntityId
          : [],
    );
    const state = row.state != null ? String(row.state) : '';
    for (const eid of ids) addActionType(target, eid, state);
  }
}

/** 从场景 builder entities 配置提取实体操作集（按执行语义展开 climate/cover 多步动作） */
function collectSceneEntitiesOps(entities: unknown, target: Map<string, Set<string>>): void {
  const list = readJsonArray<SceneEntityConfig>(entities);
  for (const cfg of list) {
    if (!cfg || typeof cfg !== 'object') continue;
    for (const expanded of expandSceneEntityConfigs(cfg)) {
      const { entityId, service } = resolveSceneEntityAction(expanded);
      if (!entityId) continue;
      addActionType(target, entityId.toLowerCase(), service);
    }
  }
}

/** YAML 兜底：粗粒度扫描全部 entity_id（可能含触发/条件实体，仅当图缺失时使用） */
function collectYamlOps(yaml: unknown, target: Map<string, Set<string>>): void {
  for (const eid of collectEntityIdsFromHaYaml(String(yaml || ''))) {
    addActionType(target, eid, '');
  }
}

/** 统计实体冲突项涉及的联动器数量（排序用） */
function entityConflictSize(item: EntityConflictItem): number {
  return (
    (item.automationIds?.length || 0) +
    (item.sceneIds?.length || 0) +
    (item.scriptIds?.length || 0)
  );
}

/**
 * 联动健康诊断服务（可注入）。
 *
 * 提供联动健康快照（getSnapshot）与内置自动化/家庭模式冲突的检测/消解能力，
 * 用于诊断"同一动作被多个规则重复触发"这类典型联动问题。
 */
@Injectable()
export class LinkageHealthService {
  private readonly logger = new Logger(LinkageHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly haSync: HaSyncService,
    private readonly securityPanel: SecurityPanelService,
    private readonly presence: PresenceService,
    private readonly homeMode: HomeModeService,
    private readonly syncEngine: OrchestratorHaSyncEngine,
    private readonly notification: NotificationService,
    private readonly energyAutoLinkage: EnergyAutoLinkageService,
    private readonly weatherAutoLinkage: WeatherAutoLinkageService,
    private readonly automationService: AutomationService,
    private readonly automationEngine: AutomationEngineService,
  ) {}

  /**
   * 生成联动健康快照。
   *
   * 并行采集：近期联动失败事件、HA 同步状态、告警规则历史采样、内置冲突检测，
   * 再叠加同步漂移错误与家庭模式触发日志，合并出一条按时间倒序的事件时间线（最多 20 条）。
   *
   * @returns 联动健康快照，含安防、HA 同步、漂移、联动失败、模式触发、规则历史、
   *  能源/天气自动联动状态、冲突列表、事件时间线与检查时间。
   */
  async getSnapshot() {
    const [linkageFailures, haStatus, ruleHistorySample, builtinConflicts, entityConflictScan] =
      await Promise.all([
        this.prisma.securityEvent.findMany({
          where: { type: { in: LINKAGE_EVENT_TYPES } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        this.haSync.getHAStatus(),
        this.sampleRuleHistory(),
        this.detectBuiltinHomeModeConflicts(),
        this.detectEntityConflicts(),
      ]);

    const drift = this.syncEngine.getRecentSyncErrors(20);
    const modeTriggers = this.homeMode.getTriggerLogs(15);
    const linkageFailureRows = linkageFailures.map((e) => ({
      id: e.id,
      type: e.type,
      detail: e.detail,
      mode: e.mode,
      createdAt: e.createdAt.toISOString(),
    }));

    // 内置「模板 × 家庭模式」冲突 + 通用实体操作冲突（kind='entity-conflict'）合并输出，保持结构向后兼容
    const conflicts = [...builtinConflicts, ...entityConflictScan.conflicts];

    // 合并三类事件为统一时间线：联动失败 / 模式触发 / 同步漂移
    const eventTimeline = [
      ...linkageFailureRows.map((e) => ({
        at: e.createdAt,
        kind: 'linkage_failure' as const,
        label: e.detail || e.type,
        meta: e.type,
      })),
      ...modeTriggers.map((t) => ({
        at: t.executedAt,
        kind: 'mode_trigger' as const,
        label: `${t.modeName} · ${t.source}`,
        meta: t.success ? 'success' : 'failed',
      })),
      ...drift.map((d) => ({
        at: d.at || new Date().toISOString(),
        kind: 'sync_drift' as const,
        label: d.message || d.scope,
        meta: d.scope,
      })),
    ]
      .filter((e) => e.at)
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, 20);

    return {
      security: {
        mode: this.securityPanel.getMode(),
        anyoneHome: this.presence.isAnyoneHome(),
        atHomeCount: this.presence.getAtHomeCount(),
        members: this.presence.getAllMembers(),
      },
      haSync: haStatus,
      drift,
      linkageFailures: linkageFailureRows,
      modeTriggers,
      ruleHistory: ruleHistorySample,
      energyAutoLinkage: this.energyAutoLinkage.getStatus(),
      weatherAutoLinkage: this.weatherAutoLinkage.getStatus(),
      conflicts,
      // 通用实体冲突扫描统计：checked=参与比较的联动器数，skipped=解析失败/无操作实体的联动器数
      entityConflictScan: {
        checked: entityConflictScan.checked,
        skipped: entityConflictScan.skipped,
        skippedNames: entityConflictScan.skippedNames,
      },
      eventTimeline,
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * 检测内置自动化模板与家庭模式之间的重复触发冲突。
   *
   * 遍历 BUILTIN_HOME_MODE_CONFLICTS 中每个模板，匹配启用中的自动化（按 id/名称/特征正则），
   * 再与名称匹配的家庭模式两两组合，产出冲突清单（每个模板最多取 2 条自动化，
   * 总数截断到 10 条）。
   *
   * @returns 冲突数组，每项含模板 id、自动化 id/名称、家庭模式名称与冲突原因。
   *  检测失败时返回空数组并记录告警。
   */
  private async detectBuiltinHomeModeConflicts() {
    try {
      const [automations, modes] = await Promise.all([
        this.prisma.automation.findMany({
          select: { id: true, name: true, enabled: true, yaml: true },
          take: 200,
        }),
        this.prisma.homeMode.findMany({
          select: { id: true, name: true, isActive: true },
          take: 200,
        }),
      ]);
      const conflicts: Array<{
        templateId: string;
        automationId?: string;
        automationName?: string;
        modeName: string;
        reason: string;
      }> = [];

      for (const rule of BUILTIN_HOME_MODE_CONFLICTS) {
        const matchedAutos = automations.filter((a) => {
          if (!a.enabled) return false;
          const blob = `${a.name}\n${a.yaml || ''}`.toLowerCase();
          return (
            blob.includes(rule.templateId) ||
            blob.includes(rule.templateName.toLowerCase()) ||
            (rule.templateId === 'night_mode' && /22:00|晚安/.test(blob)) ||
            (rule.templateId === 'away_mode_climate' &&
              /presence\.everyoneleft|离家自动节能/.test(blob))
          );
        });
        if (!matchedAutos.length) continue;
        const matchedModes = modes.filter((m) => rule.modeHints.test(m.name || ''));
        for (const mode of matchedModes) {
          for (const auto of matchedAutos.slice(0, 2)) {
            conflicts.push({
              templateId: rule.templateId,
              automationId: auto.id,
              automationName: auto.name,
              modeName: mode.name,
              reason: rule.reason,
            });
          }
        }
      }
      return conflicts.slice(0, 10);
    } catch (err) {
      this.logger.warn(`联动冲突检测失败: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * 检测通用实体操作冲突：用户自建自动化/场景/脚本争抢同一实体。
   *
   * 算法：
   * 1. 读取 automation（仅启用）/scene/script 记录；
   * 2. 从各配置提取「实体操作集合」：geekGraph.actions（callService 节点）优先，
   *    scene 取 geekSceneGraph.entities 或 builder entities（按执行语义展开），
   *    图缺失时用 YAML 粗粒度扫描兜底（可能含触发/条件实体）；
   * 3. 按 entityId 索引所有联动器，同一实体被 ≥2 个联动器操作即产出
   *    kind='entity-conflict' 冲突项（聚合列出全部涉及联动器，避免三方冲突逐对重复）；
   * 4. 占位实体（xxx_placeholder）跳过；解析失败/无操作实体的联动器跳过并计数。
   *
   * @returns { conflicts, checked, skipped, skippedNames } 冲突清单（按涉及数降序，最多 10 条）、
   *  参与比较的联动器数、跳过数及被跳过的联动器名称。
   *  检测失败时返回空结果并记录告警。
   */
  private async detectEntityConflicts(): Promise<{
    conflicts: EntityConflictItem[];
    checked: number;
    skipped: number;
    skippedNames: string[];
  }> {
    try {
      const [automations, scenes, scripts] = await Promise.all([
        this.prisma.automation.findMany({
          select: { id: true, name: true, enabled: true, yaml: true, geekGraph: true },
          take: 200,
        }),
        this.prisma.scene.findMany({
          select: { id: true, name: true, entities: true, yaml: true, geekSceneGraph: true },
          take: 200,
        }),
        this.prisma.script.findMany({
          select: { id: true, name: true, yaml: true, geekGraph: true },
          take: 200,
        }),
      ]);

      const linkagers: LinkagerEntityOps[] = [];
      const skippedNames: string[] = [];
      let checked = 0;

      const pushLinkager = (item: LinkagerEntityOps) => {
        if (item.ops.size === 0) {
          // 无法解析出操作实体：跳过并计数（如仅有通知/调试动作的联动器）
          skippedNames.push(`${LINKAGER_TYPE_LABEL[item.type]}「${item.name || item.id}」`);
          return;
        }
        checked++;
        linkagers.push(item);
      };

      for (const a of automations) {
        // 禁用的自动化不会自动触发，不参与冲突判定
        if (!a.enabled) continue;
        const ops = new Map<string, Set<string>>();
        collectGeekGraphActionOps(readJsonObject(a.geekGraph).actions, ops);
        if (ops.size === 0) collectYamlOps(a.yaml, ops);
        pushLinkager({ type: 'automation', id: a.id, name: a.name, ops });
      }
      for (const s of scenes) {
        const ops = new Map<string, Set<string>>();
        const graph = readJsonObject(s.geekSceneGraph);
        if (Array.isArray(graph.entities)) {
          collectSceneGraphOps(graph.entities, ops);
        } else {
          collectSceneEntitiesOps(s.entities, ops);
        }
        if (ops.size === 0) collectYamlOps(s.yaml, ops);
        pushLinkager({ type: 'scene', id: s.id, name: s.name, ops });
      }
      for (const sc of scripts) {
        const ops = new Map<string, Set<string>>();
        collectGeekGraphActionOps(readJsonObject(sc.geekGraph).actions, ops);
        if (ops.size === 0) collectYamlOps(sc.yaml, ops);
        pushLinkager({ type: 'script', id: sc.id, name: sc.name, ops });
      }

      // 实体 → 涉及联动器索引（同一实体被 ≥2 个联动器操作即冲突）
      const entityIndex = new Map<
        string,
        Array<{ type: 'automation' | 'scene' | 'script'; id: string; name: string; actionTypes: Set<string> }>
      >();
      for (const l of linkagers) {
        for (const [eid, types] of l.ops) {
          if (PLACEHOLDER_ENTITY_RE.test(eid)) continue;
          let involved = entityIndex.get(eid);
          if (!involved) {
            involved = [];
            entityIndex.set(eid, involved);
          }
          involved.push({ type: l.type, id: l.id, name: l.name, actionTypes: types });
        }
      }

      const conflicts: EntityConflictItem[] = [];
      for (const [eid, involved] of entityIndex) {
        if (involved.length < 2) continue;
        const automationIds: string[] = [];
        const automationNames: string[] = [];
        const sceneIds: string[] = [];
        const sceneNames: string[] = [];
        const scriptIds: string[] = [];
        const scriptNames: string[] = [];
        const actionTypes = new Set<string>();
        for (const v of involved) {
          if (v.type === 'automation') {
            automationIds.push(v.id);
            automationNames.push(v.name);
          } else if (v.type === 'scene') {
            sceneIds.push(v.id);
            sceneNames.push(v.name);
          } else {
            scriptIds.push(v.id);
            scriptNames.push(v.name);
          }
          for (const t of v.actionTypes) actionTypes.add(t);
        }
        const item: EntityConflictItem = {
          kind: 'entity-conflict',
          entityId: eid,
          reason: `${involved
            .map((v) => `${LINKAGER_TYPE_LABEL[v.type]}「${v.name || v.id}」`)
            .join('、')}均操作实体 ${eid}`,
        };
        const firstType = [...actionTypes].find(Boolean);
        if (firstType) item.actionType = firstType;
        if (automationIds.length) {
          item.automationIds = automationIds;
          item.automationNames = automationNames;
        }
        if (sceneIds.length) {
          item.sceneIds = sceneIds;
          item.sceneNames = sceneNames;
        }
        if (scriptIds.length) {
          item.scriptIds = scriptIds;
          item.scriptNames = scriptNames;
        }
        conflicts.push(item);
      }

      // 涉及联动器越多的实体冲突越严重，优先展示；总条数截断防噪音
      conflicts.sort((a, b) => entityConflictSize(b) - entityConflictSize(a));
      return {
        conflicts: conflicts.slice(0, 10),
        checked,
        skipped: skippedNames.length,
        skippedNames: skippedNames.slice(0, 5),
      };
    } catch (err) {
      this.logger.warn(`通用实体冲突检测失败: ${(err as Error).message}`);
      return { conflicts: [], checked: 0, skipped: 0, skippedNames: [] };
    }
  }

  /**
   * 优先保留家庭模式：软禁用与模式冲突的重复自动化，并重载本地引擎。
   *
   * 流程：检测冲突 → 对每条冲突自动化调用 update 置 enabled=false（去重，每条只处理一次）
   *  → 若有成功禁用则重载自动化引擎规则 → 发送一条 info 通知告知已禁用条数。
   *
   * @returns { resolved, failed, results, remainingConflicts } 已解决/失败数量、
   *  逐条处理结果及消解后剩余的冲突清单。
   */
  async resolveBuiltinHomeModeConflicts() {
    const conflicts = await this.detectBuiltinHomeModeConflicts();
    const disabledIds = new Set<string>();
    const results: Array<{ automationId: string; automationName?: string; ok: boolean; error?: string }> =
      [];

    for (const c of conflicts) {
      if (!c.automationId || disabledIds.has(c.automationId)) continue;
      disabledIds.add(c.automationId);
      try {
        await this.automationService.update(c.automationId, { enabled: false });
        results.push({
          automationId: c.automationId,
          automationName: c.automationName,
          ok: true,
        });
      } catch (err) {
        results.push({
          automationId: c.automationId,
          automationName: c.automationName,
          ok: false,
          error: (err as Error).message,
        });
      }
    }

    if (results.some((r) => r.ok)) {
      try {
        await this.automationEngine.reloadRules();
      } catch (err) {
        this.logger.warn(`冲突消解后重载自动化引擎失败: ${(err as Error).message}`);
      }
      try {
        await this.notification.notify(
          'info',
          `已按「优先家庭模式」禁用 ${results.filter((r) => r.ok).length} 条冲突自动化`,
          'linkage-health',
        );
      } catch {
        /* 忽略 */
      }
    }

    return {
      resolved: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
      remainingConflicts: await this.detectBuiltinHomeModeConflicts(),
    };
  }

  /**
   * 采样告警规则的近期条件命中历史（最多 5 条规则）。
   *
   * @returns 规则历史采样数组；无规则或读取失败时返回空数组并记录告警。
   */
  private async sampleRuleHistory() {
    try {
      const rules = await this.notification.getRules();
      if (!rules?.length) return [];
      return rules
        .filter((r): r is typeof r & { id: string } => typeof r.id === 'string')
        .slice(0, 5)
        .map((r) => ({
          ruleId: r.id,
          ruleName: r.name,
          entries: this.notification.getRuleConditionHistory(r.id),
        }));
    } catch (err: unknown) {
      this.logger.warn(`告警规则历史采样失败: ${String(err)}`);
      return [];
    }
  }
}