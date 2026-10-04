/**
 * 家庭模式动作构建、预设安装与激活 / 停用执行（从 home-mode.internals 拆出）。
 *
 * 职责：封装家庭模式的核心执行逻辑（纯函数 + 依赖注入形式）——
 *  - 动作类型推断与执行目标收集（resolveActionKind / collectHomeModeTargetActions）
 *  - 联动去重：与安防 / presence 触发联动时过滤重复动作（filterHomeModeActionsForLinkageDedupe）
 *  - 预设包安装：实体键智能推荐、覆盖合并、动作 / 触发器构建（enrichHomeModePresets / buildHomeModePresetInstallPlan）
 *  - 激活 / 停用编排：ACL 校验、互斥组切换、设备快照采集与恢复、失败重试、回滚（activateHomeMode / deactivateHomeMode）
 * 关键依赖：
 *  - HaConnectorService：下发 HA 服务、采集 / 恢复设备快照
 *  - NotificationService：notify 类动作
 *  - ChildModeGate：child/guest 动作 ACL 拦截
 *  - HomeModeLinkageArbiter：联动仲裁（手动锁定 TTL）
 *  - shared/home-exec/snapshot-restore.util：快照恢复调用构建
 *  - shared/home-exec/execute-action-sequence.util：动作串行执行
 * 由 HomeModeService 注入 activateDeps 后调用。
 */
import type { AppConfigService } from '../../shared/app-config/service';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { badRequest, notFound, getErrorMessage } from '../../common/utils';
import { executeActionSequence } from '../../shared/home-exec/execute-action-sequence.util';
import type { PrismaService } from '../../shared/prisma/service';
import type { EventBusService } from '../../shared/redis/event-bus.service';
import { mapWithConcurrency } from '../../common/utils/map-with-concurrency.util';
import { readJsonArray, readJsonObject, toInputJson } from '../../common/utils/json-field.util';
import { Prisma } from '../../generated/prisma/client';
import type { HaConnectorService } from '../ha-connector/service';
import type { NotificationService } from '../notification/service';
import type { HomeModePreset, HomeModePresetAction, ModeActionKind, ModeTrigger } from './presets';
import { HOME_MODE_PRESETS } from './presets';
import { getEntityDomain, isSecurityArmingEntityId } from '@homeos/shared';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  HomeModeExecutionRecord,
  HomeModeTriggerLog,
} from './runtime.internals';
import {
  buildSnapshotRestoreCalls,
  type SnapshotEntry,
} from '../../shared/home-exec/snapshot-restore.util';
import {
  assertEntityTargetsExecuteAuthorized,
  type EntityExecTarget,
  type OrchestratorExecActor,
} from '../../common/http-security/entity-execute-acl.util';
import type { ChildModeGate } from '../command-proxy/authorization.util';

// ── home-mode-action.util ──
/** 家庭模式动作构建与分类（纯函数，从 home-mode.service 抽离） */
interface ModeAction {
  kind?: ModeActionKind;
  entity_id: string;
  domain?: string;
  service?: string;
  service_data?: Record<string, unknown>;
  delay?: number;
}

/** 动作类型推断：显式 kind 优先，否则按 entity_id 前缀 / 安防模式 id */
function resolveActionKind(action: ModeAction): ModeActionKind {
  if (action.kind) return action.kind;
  const id = action.entity_id || '';
  if (isSecurityArmingEntityId(id)) return 'security';
  if (id.startsWith('scene.')) return 'scene';
  if (id.startsWith('script.')) return 'script';
  return 'entity';
}

/** 从家庭模式动作收集执行目标（notify 跳过；security 映射为 alarm_control_panel 合成目标；保留 resolve 后有效 domain） */
function collectHomeModeTargetActions(actions: ModeAction[]): EntityExecTarget[] {
  const out: EntityExecTarget[] = [];
  const seen = new Set<string>();
  for (const action of actions) {
    const kind = resolveActionKind(action);
    if (kind === 'notify') continue;
    const ref = action.entity_id?.trim();
    if (kind === 'security') {
      // security 动作映射到 alarm_control_panel 域合成实体，让 child/guest 的
      // isChildDomainAccessDenied 命中并拒绝，避免借「激活家庭模式」绕过
      // command-proxy 对高危域（lock/alarm_control_panel/siren/valve）的拦截
      const entityId = `alarm_control_panel.${ref || 'home'}`;
      const key = entityId + '|alarm_control_panel';
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ entityId, domain: 'alarm_control_panel' });
      }
      continue;
    }
    if (!ref?.includes('.')) continue;
    // 关键修复：使用 action.domain（若配置覆写）作为实际执行 domain，而非 ref 字符串前缀
    const domain = action.domain || getEntityDomain(ref);
    const key = ref + '|' + domain;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ entityId: ref, domain });
  }
  return out;
}

/** 家庭模式激活时与 presence/安防联动去重，过滤待执行动作 */
function filterHomeModeActionsForLinkageDedupe(
  entityConfigs: ModeAction[],
  meta: { source?: string; reason?: string } | undefined,
  secCfg: {
    autoArmOnEveryoneLeft?: boolean;
    autoUpgradeToAwayOnEveryoneLeft?: boolean;
    autoDisarmOnFirstHome?: boolean;
  },
): ModeAction[] {
  if (meta?.source === 'security') {
    return entityConfigs.filter((c) => resolveActionKind(c) !== 'security');
  }
  if (
    meta?.source === 'trigger' &&
    meta?.reason === 'all_leave' &&
    (secCfg.autoArmOnEveryoneLeft || secCfg.autoUpgradeToAwayOnEveryoneLeft)
  ) {
    return entityConfigs.filter((c) => {
      if (resolveActionKind(c) !== 'security') return true;
      // presence 已/将切外出布防：跳过离家类 armed_away；保留显式撤防动作
      return c.entity_id?.trim() !== 'armed_away';
    });
  }
  if (
    meta?.source === 'trigger' &&
    String(meta?.reason || '').startsWith('arrive_home') &&
    secCfg.autoDisarmOnFirstHome
  ) {
    return entityConfigs.filter((c) => {
      if (resolveActionKind(c) !== 'security') return true;
      return c.entity_id?.trim() !== 'armed_home';
    });
  }
  // 天气/能源联动：安防布防由 security 链路负责，避免重复武装或覆盖
  if (meta?.source === 'weather_linkage' || meta?.source === 'energy_linkage') {
    return entityConfigs.filter((c) => resolveActionKind(c) !== 'security');
  }
  return entityConfigs;
}

/** 根据 HA 实体列表为预设键智能预填 entity_id */
function suggestPresetEntityOverrides(
  preset: HomeModePreset,
  entityIds: string[],
): Record<string, string> {
  const byDomain = new Map<string, string[]>();
  for (const id of entityIds) {
    const domain = getEntityDomain(id);
    if (!domain) continue;
    const list = byDomain.get(domain) || [];
    list.push(id);
    byDomain.set(domain, list);
  }
  const overrides: Record<string, string> = {};
  for (const ek of preset.entityKeys || []) {
    const ph = String(ek.placeholder || '').trim();
    const domain = getEntityDomain(ph) || 'light';
    const candidates = byDomain.get(domain) || [];
    if (!candidates.length) continue;
    const exact = candidates.find((id) => id === ph);
    if (exact) {
      overrides[ek.key] = exact;
      continue;
    }
    const hint = ek.key.replace(/_/g, '');
    const fuzzy = candidates.find((id) => {
      const tail = id.split('.')[1] || '';
      return tail.includes(hint) || hint.includes(tail) || id.toLowerCase().includes(ek.key);
    });
    if (fuzzy) {
      overrides[ek.key] = fuzzy;
      continue;
    }
    if (ph.endsWith('.all')) {
      const all = candidates.find((id) => id.endsWith('.all') || id.includes('_all'));
      if (all) overrides[ek.key] = all;
    }
  }
  return overrides;
}

/** 预设安装后仍无法解析的实体键标签 */
function getUnresolvedPresetKeys(
  preset: HomeModePreset,
  overrides: Record<string, string>,
  knownEntityIds: Set<string>,
): string[] {
  const unresolved: string[] = [];
  for (const ek of preset.entityKeys || []) {
    const val = overrides[ek.key]?.trim() || ek.placeholder?.trim() || '';
    if (!val.includes('.') || !knownEntityIds.has(val)) {
      unresolved.push(ek.label);
    }
  }
  return unresolved;
}

function resolvePresetEntityId(
  action: HomeModePresetAction,
  overrides: Record<string, string>,
): string {
  if (action.key && overrides[action.key]?.trim()) {
    return overrides[action.key].trim();
  }
  return action.entity_id;
}

/** 预设 → 模式动作列表（应用实体映射覆盖） */
function buildPresetActions(
  preset: HomeModePreset,
  overrides: Record<string, string>,
): ModeAction[] {
  const out: ModeAction[] = [];
  for (const action of preset.actions) {
    if (action.kind === 'notify') {
      out.push({
        kind: 'notify',
        entity_id: overrides[action.key || '']?.trim() || action.entity_id,
        domain: action.domain,
        service: action.service,
        service_data: action.service_data,
        delay: action.delay,
      });
      continue;
    }
    if (action.kind === 'security') {
      out.push({
        kind: 'security',
        entity_id: action.entity_id,
        domain: action.domain,
        service: action.service,
        delay: action.delay,
      });
      continue;
    }
    const entityId = resolvePresetEntityId(action, overrides);
    if (!entityId?.includes('.')) continue;
    out.push({
      kind: action.kind,
      entity_id: entityId,
      domain: action.domain || getEntityDomain(entityId),
      service: action.service,
      service_data: action.service_data,
      delay: action.delay,
    });
  }
  return out;
}

/** 预设 → 触发器列表（应用门锁实体覆盖） */
function buildPresetTriggers(
  preset: HomeModePreset,
  overrides: Record<string, string>,
): ModeTrigger[] | undefined {
  if (!preset.triggers?.length) return undefined;
  return preset.triggers.map((t) => {
    if (t.type === 'lock_unlock' && overrides.lock?.trim()) {
      return { ...t, entityId: overrides.lock.trim() };
    }
    return { ...t };
  });
}

// ── home-mode-preset.helper ──
type HomeModePresetView = HomeModePreset & {
  suggestedOverrides: Record<string, string>;
  unresolvedCount: number;
  unresolvedLabels: string[];
  existingModeId: string | null;
};

/**
 * enrichHomeModePresets：函数。
 * @param args - 参见类型签名；传入 undefined 时通常按 fallback 分支或返回空值
 * @returns 见类型签名；空场景通常返回 null / [] / {} 或 undefined
 * @throws 依赖不可用或输入非法时抛出 Error 子类
 */
export function enrichHomeModePresets(
  entityIds: string[],
  existingModes: Array<{ id: string; name: string }>,
): HomeModePresetView[] {
  const known = new Set(entityIds);
  const modeIdByName = new Map(existingModes.map((m) => [m.name, m.id]));
  return HOME_MODE_PRESETS.map((preset) => {
    const suggestedOverrides = suggestPresetEntityOverrides(preset, entityIds);
    const unresolved = getUnresolvedPresetKeys(preset, suggestedOverrides, known);
    return {
      ...preset,
      suggestedOverrides,
      unresolvedCount: unresolved.length,
      unresolvedLabels: unresolved,
      existingModeId: modeIdByName.get(preset.name) || null,
    };
  });
}

type HomeModePresetInstallPlan = {
  preset: HomeModePreset;
  actions: ReturnType<typeof buildPresetActions>;
  triggersJson: Prisma.InputJsonValue | undefined;
  config: Prisma.InputJsonValue;
  unresolvedActions: string[];
  mergedOverrides: Record<string, string>;
};

/**
 * buildHomeModePresetInstallPlan：函数。
 * @param args - 参见类型签名；传入 undefined 时通常按 fallback 分支或返回空值
 * @returns 见类型签名；空场景通常返回 null / [] / {} 或 undefined
 * @throws 依赖不可用或输入非法时抛出 Error 子类
 */
export function buildHomeModePresetInstallPlan(
  presetId: string,
  entityIds: string[],
  entityOverrides: Record<string, string> = {},
): HomeModePresetInstallPlan {
  const preset = HOME_MODE_PRESETS.find((p) => p.id === presetId);
  if (!preset) notFound(API_ERROR.HOME_MODE_PRESET_NOT_FOUND);

  const known = new Set(entityIds);
  const mergedOverrides = {
    ...suggestPresetEntityOverrides(preset, entityIds),
    ...entityOverrides,
  };
  const unresolvedActions = getUnresolvedPresetKeys(preset, mergedOverrides, known);
  const actions = buildPresetActions(preset, mergedOverrides);
  if (!actions.length) {
    notFound(API_ERROR.HOME_MODE_PRESET_ACTIONS_EMPTY);
  }

  const triggers = buildPresetTriggers(preset, mergedOverrides);
  return {
    preset,
    actions,
    config: actions as unknown as Prisma.InputJsonValue,
    triggersJson: triggers ? (triggers as unknown as Prisma.InputJsonValue) : undefined,
    unresolvedActions,
    mergedOverrides,
  };
}

// ── home-mode-activate.helper ──
export interface HomeModeActivateState {
  getActiveModeId: () => string | null;
  setActiveModeId: (id: string | null) => void;
}

export interface HomeModeActivateDeps {
  logger: { log: (msg: string) => void; warn: (msg: string) => void };
  prisma: PrismaService;
  haConnector: HaConnectorService;
  notification: NotificationService;
  eventEmitter: EventEmitter2;
  eventBus: EventBusService;
  appConfig: AppConfigService;
  childMode: ChildModeGate;
  linkageArbiter: {
    tryAcquire: (
      source: string | undefined,
      opts?: { claimTtlMs?: number; manualLockMs?: number },
    ) => { ok: true } | { ok: false; reason: string };
    release: () => void;
  };
  getApplyMaxRetries: () => number;
  pushTriggerLog: (entry: Omit<HomeModeTriggerLog, 'id' | 'executedAt'>) => void;
  recordExecution: (entry: Omit<HomeModeExecutionRecord, 'id' | 'executedAt'>) => void;
}

async function executeHomeModeAction(
  deps: HomeModeActivateDeps,
  action: ModeAction,
): Promise<{ entity_id: string; service: string; success: boolean; error?: string }> {
  const kind = resolveActionKind(action);
  const ref = action.entity_id?.trim();
  if (!ref) {
    return { entity_id: 'unknown', service: 'unknown', success: false, error: '缺少目标' };
  }

  try {
    if (kind === 'notify') {
      const message = String(action.service_data?.message ?? action.entity_id ?? '家庭模式已切换');
      await deps.notification.notify('info', message, 'home-mode');
      return { entity_id: 'notify:app', service: 'notify.send_message', success: true };
    }

    if (kind === 'security') {
      const mode = ref as 'disarmed' | 'armed_home' | 'armed_away' | 'armed_night';
      const handlerResults = await deps.eventEmitter.emitAsync('security.panel.setMode', {
        mode,
        source: 'home-mode',
      });
      const failed = handlerResults.some(
        (r: unknown) =>
          r instanceof Error ||
          (r != null &&
            typeof r === 'object' &&
            'success' in r &&
            (r as { success?: boolean }).success === false),
      );
      return {
        entity_id: `security:${mode}`,
        service: 'security.set_mode',
        success: !failed,
        error: failed ? '安防模式切换失败' : undefined,
      };
    }

    const domain = action.domain || getEntityDomain(ref);
    const service =
      action.service || (kind === 'scene' || kind === 'script' ? 'turn_on' : 'turn_on');
    await deps.haConnector.callService(domain, service, ref, action.service_data || {});
    return { entity_id: ref, service: `${domain}.${service}`, success: true };
  } catch (err: unknown) {
    const errMsg = getErrorMessage(err);
    return {
      entity_id: ref,
      service: `${action.domain || '?'}.${action.service || '?'}`,
      success: false,
      error: errMsg,
    };
  }
}

const HA_ENTITY_FETCH_CONCURRENCY = 8;

/**
 * 按快照恢复单个实体状态（并发 8 调用 HA 服务）。
 * 由 buildSnapshotRestoreCalls 将 state+attributes 转为具体服务调用序列。
 */
async function restoreEntityFromSnapshot(
  deps: Pick<HomeModeActivateDeps, 'haConnector'>,
  entityId: string,
  snap: { state?: string; attributes?: Record<string, unknown> },
) {
  const calls = buildSnapshotRestoreCalls(entityId, snap);
  await mapWithConcurrency(calls, HA_ENTITY_FETCH_CONCURRENCY, (call) =>
    deps.haConnector.callService(call.domain, call.service, call.entityId, call.data),
  );
}

/** 当前实体 state+attributes 指纹是否与快照一致 */
function snapshotStateMatches(
  current: { state?: string; attributes?: Record<string, unknown> } | null | undefined,
  snap: SnapshotEntry,
): boolean {
  if (!current || current.state !== snap.state) return false;
  return JSON.stringify(current.attributes ?? null) === JSON.stringify(snap.attributes ?? null);
}

/**
 * 单实体快照恢复（undo 目标 = 激活前 deviceSnapshot）。
 * 仅当当前 state+attributes 已与快照一致时跳过，避免无意义重复下发。
 * 不按 last_updated 跳过：模式自身动作会推高时间戳，时间门闩会把「模式改动」误判为外部变更导致停用无法还原。
 * @returns 是否实际执行了恢复
 */
async function restoreEntityFromSnapshotIfNotChanged(
  deps: Pick<HomeModeActivateDeps, 'haConnector' | 'logger'>,
  entityId: string,
  snap: SnapshotEntry,
): Promise<boolean> {
  const current = await deps.haConnector.fetchEntityState(entityId);
  if (snapshotStateMatches(current, snap)) {
    return false;
  }

  await restoreEntityFromSnapshot(deps, entityId, snap);
  return true;
}

/** 快照恢复结果：restored 为实际下发数，incomplete 表示因 HA 未连接/异常未能完整执行（此时不得丢弃快照） */
interface SnapshotRestoreOutcome {
  restored: number;
  incomplete: boolean;
}

/** 从模式快照恢复设备状态，返回恢复结果（含是否未能完整执行） */
async function restoreModeSnapshot(
  deps: HomeModeActivateDeps,
  mode: { deviceSnapshot?: unknown },
): Promise<SnapshotRestoreOutcome> {
  let restored = 0;
  let incomplete = false;
  if (!mode.deviceSnapshot || !deps.haConnector) return { restored, incomplete };
  try {
    const snapshot = readJsonObject(mode.deviceSnapshot) as Record<string, SnapshotEntry>;
    const haStatus = await deps.haConnector.getStatus();
    if (!haStatus.connected) return { restored, incomplete: true };

    const entries = Object.entries(snapshot);
    if (entries.length === 0) return { restored, incomplete };

    // 每个实体独立「读取-比较-恢复」：已与激活前快照一致则跳过。
    await mapWithConcurrency(entries, HA_ENTITY_FETCH_CONCURRENCY, async ([entityId, snap]) => {
      try {
        if (await restoreEntityFromSnapshotIfNotChanged(deps, entityId, snap)) {
          restored++;
        }
      } catch {
        incomplete = true;
        deps.logger.warn(`恢复设备状态失败: ${entityId}`);
      }
    });
  } catch (err) {
    incomplete = true;
    deps.logger.warn(`解析设备快照失败: ${getErrorMessage(err)}`);
  }
  return { restored, incomplete };
}

/**
 * 激活家庭模式（关键路径）。
 *
 * 流程：
 *  1. 已激活则跳过；解析动作配置
 *  2. ACL 校验（用户 / Agent 触发时）
 *  3. 联动仲裁（linkageArbiter.tryAcquire）
 *  4. HA 连接检查
 *  5. 互斥组旧模式快照恢复 + 新模式设备快照采集
 *  6. 事务内原子切换 isActive 标志
 *  7. 联动去重后串行执行动作，失败按配置重试
 *  8. 全部失败则回滚快照并取消激活；否则记录日志与执行历史
 *
 * @param state 激活状态端口（getActiveModeId / setActiveModeId）
 * @param deps 依赖集合
 * @param id 目标模式 ID
 * @param meta 触发元信息（source / reason / actor）
 * @returns 激活结果（含 success / executed / total / retried / results）
 */
export async function activateHomeMode(
  state: HomeModeActivateState,
  deps: HomeModeActivateDeps,
  id: string,
  meta?: { source?: HomeModeTriggerLog['source']; reason?: string; actor?: OrchestratorExecActor },
) {
  const mode = await deps.prisma.homeMode.findUnique({ where: { id } });
  if (!mode) notFound(API_ERROR.HOME_MODE_NOT_FOUND);

  // 以 DB 的 isActive 为准判断「本模式」是否已激活：activeModeId 是单标量，
  // 多互斥组可同时激活；若用 activeModeId 判重，跨组重激活会重采（已被模式改动的）快照，破坏撤销基线。
  if (mode.isActive) {
    deps.logger.log(`模式 ${mode.name} 已处于激活状态,跳过重复激活`);
    return {
      success: true,
      modeId: id,
      modeName: mode.name,
      active: true,
      alreadyActive: true,
      executed: 0,
      total: 0,
      retried: 0,
      results: [],
    };
  }

  let entityConfigs: ModeAction[];
  try {
    entityConfigs = readJsonArray<ModeAction>(mode.config, []);
  } catch {
    badRequest(API_ERROR.HOME_MODE_CONFIG_PARSE_FAILED);
  }
  if (!Array.isArray(entityConfigs)) {
    badRequest(API_ERROR.HOME_MODE_CONFIG_PARSE_FAILED);
  }

  // 用户/Agent 触发时校验动作实体 ACL（系统内部触发无 actor，跳过）
  assertEntityTargetsExecuteAuthorized(
    collectHomeModeTargetActions(entityConfigs),
    meta?.actor,
    deps.childMode,
  );

  const hmCfg = deps.appConfig.get('homeMode');
  const arbiter = deps.linkageArbiter.tryAcquire(meta?.source, {
    claimTtlMs: Math.max(1, hmCfg.linkageClaimTtlMin || 15) * 60_000,
    manualLockMs: Math.max(0, hmCfg.manualLockTtlMin || 30) * 60_000,
  });
  if (!arbiter.ok) {
    deps.logger.warn(`家庭模式激活被联动仲裁拦截: ${arbiter.reason}`);
    deps.pushTriggerLog({
      modeId: id,
      modeName: mode.name,
      source: meta?.source || 'manual',
      reason: meta?.reason || arbiter.reason,
      success: false,
    });
    badRequest(API_ERROR.HOME_MODE_LINKAGE_BLOCKED(arbiter.reason));
  }

  const haStatus = await deps.haConnector.getStatus();
  if (!haStatus.connected) {
    deps.linkageArbiter.release();
    deps.logger.warn('Home Assistant 未连接,拒绝激活家庭模式');
    deps.pushTriggerLog({
      modeId: id,
      modeName: mode.name,
      source: meta?.source || 'manual',
      reason: meta?.reason || '手动切换',
      success: false,
    });
    deps.recordExecution({
      modeId: id,
      modeName: mode.name,
      success: false,
      source: meta?.source || 'manual',
      reason: meta?.reason || 'HA 未连接',
      executed: 0,
      total: entityConfigs.length,
    });
    return {
      success: false,
      modeId: id,
      modeName: mode.name,
      active: false,
      error: 'HA 未连接，无法激活家庭模式',
    };
  }

  const incomingGroup = mode.exclusiveGroup || 'default';
  const activeModes = await deps.prisma.homeMode.findMany({
    where: { isActive: true },
    take: 50,
  });
  // 同互斥组内需要停用的旧模式；快照恢复为 HA 外部调用，须在 DB 事务外先执行
  const conflictingModes = activeModes.filter(
    (active) => active.id !== id && (active.exclusiveGroup || 'default') === incomingGroup,
  );
  const conflictRestore = new Map<string, SnapshotRestoreOutcome>();
  for (const active of conflictingModes) {
    conflictRestore.set(active.id, await restoreModeSnapshot(deps, active));
  }

  const snapshot: Record<string, unknown> = {};
  try {
    const entityIds = entityConfigs.map((c) => c.entity_id).filter(Boolean);
    const fetched = await mapWithConcurrency(
      entityIds,
      HA_ENTITY_FETCH_CONCURRENCY,
      async (eid) => {
        const s = await deps.haConnector.fetchEntityState(eid);
        return s ? ([eid, s] as const) : null;
      },
    );
    for (const row of fetched) {
      if (row) snapshot[row[0]] = row[1];
    }
  } catch (err) {
    deps.logger.warn(`采集设备快照失败: ${getErrorMessage(err)}`);
  }

  // 事务内原子切换：停用同互斥组旧模式 + 激活新模式，崩溃不会残留多个 isActive=true，
  // 重启后恢复状态与运行态一致；事务内仅含纯 DB 操作（HA 调用已在事务外完成）
  try {
    await deps.prisma.$transaction(async (tx) => {
      for (const active of conflictingModes) {
        // 旧模式快照已恢复：恢复完整时一并清除，避免残留陈旧撤销状态；
        // 未完整执行（HA 异常）则保留快照，便于后续人工恢复。
        const outcome = conflictRestore.get(active.id);
        await tx.homeMode.update({
          where: { id: active.id },
          data:
            outcome && !outcome.incomplete
              ? { isActive: false, deviceSnapshot: Prisma.DbNull }
              : { isActive: false },
        });
      }
      await tx.homeMode.update({
        where: { id },
        data: { isActive: true, deviceSnapshot: toInputJson(snapshot, {}) },
      });
    });
  } catch (err) {
    // DB 切换失败：释放已占用的联动仲裁，避免 manual 锁阻塞后续所有触发
    deps.linkageArbiter.release();
    throw err;
  }
  state.setActiveModeId(id);
  deps.logger.log(`正在激活模式: ${mode.name}`);

  const secCfg = deps.appConfig.get('security');
  const configsToRun = filterHomeModeActionsForLinkageDedupe(entityConfigs, meta, secCfg);

  const results = await executeActionSequence(
    configsToRun,
    (config) => executeHomeModeAction(deps, config),
    'milliseconds',
  );

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.length - successCount;

  let retryResults: typeof results = [];
  if (failedCount > 0) {
    deps.logger.warn(`模式 ${mode.name} 有 ${failedCount} 个设备执行失败,开始重试...`);
    const failedIndices: number[] = [];
    configsToRun.forEach((config, idx) => {
      if (!results[idx]?.success) failedIndices.push(idx);
    });

    const applyMaxRetries = deps.getApplyMaxRetries();
    for (let retry = 0; retry < applyMaxRetries && failedIndices.length > 0; retry++) {
      deps.logger.log(
        `重试第 ${retry + 1}/${applyMaxRetries} 次,共 ${failedIndices.length} 个设备`,
      );
      await new Promise((r) => setTimeout(r, 1000));

      const failedConfigs = failedIndices.map((idx) => configsToRun[idx]);
      const retryBatch = await Promise.all(
        failedConfigs.map((config) => executeHomeModeAction(deps, config)),
      );
      const retrySuccess: typeof results = [];
      const stillFailed: number[] = [];

      for (let i = 0; i < failedIndices.length; i++) {
        const originalIdx = failedIndices[i];
        const rs = retryBatch[i];
        results[originalIdx] = rs;
        if (rs.success) {
          retrySuccess.push(rs);
        } else {
          stillFailed.push(originalIdx);
        }
      }

      failedIndices.length = 0;
      failedIndices.push(...stillFailed);
      retryResults = retryResults.concat(retrySuccess);
    }
  }

  const finalSuccess = results.filter((r) => r.success).length;

  // 有动作但全部失败：回滚快照并取消激活，避免「空壳激活」
  if (results.length > 0 && finalSuccess === 0) {
    deps.logger.warn(`模式 ${mode.name} 全部动作失败,回滚快照并取消激活`);
    await restoreModeSnapshot(deps, { deviceSnapshot: snapshot });
    // 回滚的 DB 写入同样走事务，与激活流程保持一致的事务化语义
    await deps.prisma.$transaction([
      deps.prisma.homeMode.update({
        where: { id },
        data: { isActive: false, deviceSnapshot: Prisma.DbNull },
      }),
    ]);
    if (state.getActiveModeId() === id) state.setActiveModeId(null);
    // 回滚同样需释放联动仲裁占用，否则失败激活会以 manual 锁阻塞后续触发至 TTL
    deps.linkageArbiter.release();

    const failedItems = results.map((r) => ({
      entity_id: r.entity_id,
      service: r.service,
      error: r.error,
    }));
    deps.pushTriggerLog({
      modeId: id,
      modeName: mode.name,
      source: meta?.source || 'manual',
      reason: meta?.reason || '手动切换',
      success: false,
    });
    deps.recordExecution({
      modeId: id,
      modeName: mode.name,
      success: false,
      source: meta?.source || 'manual',
      reason: meta?.reason || '手动切换',
      executed: 0,
      total: results.length,
      failedItems,
    });
    return {
      success: false,
      modeName: mode.name,
      executed: 0,
      failedItems,
      modeId: id,
      active: false,
      total: results.length,
      retried: retryResults.length,
      results,
      error: '所有设备动作均失败，已恢复快照并取消激活',
    };
  }

  deps.eventBus.emit('homeMode.activated', {
    modeId: id,
    modeName: mode.name,
    results,
    successCount: finalSuccess,
    totalCount: results.length,
    retried: retryResults.length > 0,
  });

  deps.logger.log(`模式 ${mode.name} 激活完成: ${finalSuccess}/${results.length} 成功`);
  if (retryResults.length > 0) {
    deps.logger.log(`  其中 ${retryResults.length} 个设备通过重试恢复`);
  }

  // deviceSnapshot 仅保留激活前状态，供 deactivate / 互斥切换 undo；
  // 禁止用执行后 HA 状态覆盖，否则停用会「还原」到模式已应用态（空操作）。

  const allOk = results.every((r) => r.success);
  const failedItems = results
    .filter((r) => !r.success)
    .map((r) => ({
      entity_id: r.entity_id,
      service: r.service,
      error: r.error,
    }));
  deps.pushTriggerLog({
    modeId: id,
    modeName: mode.name,
    source: meta?.source || 'manual',
    reason: meta?.reason || '手动切换',
    success: allOk,
  });
  deps.recordExecution({
    modeId: id,
    modeName: mode.name,
    success: allOk,
    source: meta?.source || 'manual',
    reason: meta?.reason || '手动切换',
    executed: finalSuccess,
    total: results.length,
    failedItems: failedItems.length > 0 ? failedItems : undefined,
  });

  return {
    success: results.every((r) => r.success),
    modeName: mode.name,
    executed: finalSuccess,
    failedItems,
    modeId: id,
    active: true,
    total: results.length,
    retried: retryResults.length,
    results,
  };
}

/**
 * 停用家庭模式。
 *
 * 流程：
 *  1. 恢复设备快照（仅当前 state+attributes 与快照不一致时下发）
 *  2. 清除同互斥组内激活标志与快照（支持多组并行激活）
 *  3. 若仍有其他激活模式则切换 activeModeId，否则释放联动仲裁
 *  4. 发出 homeMode.deactivated 事件并记录触发日志
 *
 * @param state 激活状态端口
 * @param deps 依赖集合
 * @param modeId 可选，指定停用模式；缺省停用当前激活模式
 * @returns 停用结果（含 success / restored / exclusiveGroup）
 */
export async function deactivateHomeMode(
  state: HomeModeActivateState,
  deps: HomeModeActivateDeps,
  modeId?: string,
) {
  const targetId = modeId || state.getActiveModeId();
  if (!targetId) return { success: true, message: '无激活模式' };

  const mode = await deps.prisma.homeMode.findUnique({ where: { id: targetId } });
  if (!mode) {
    if (state.getActiveModeId() === targetId) state.setActiveModeId(null);
    return { success: true, message: '无激活模式' };
  }
  if (!mode.isActive && state.getActiveModeId() !== targetId) {
    return { success: true, message: '模式未激活' };
  }

  const prevModeId = targetId;
  const group = mode.exclusiveGroup || 'default';
  const restoreOutcome = await restoreModeSnapshot(deps, mode);
  const restored = restoreOutcome.restored;

  // 仅清除同互斥组内的激活标志与快照（支持多组并行激活）
  const activeModes = await deps.prisma.homeMode.findMany({
    where: { isActive: true },
    take: 50,
  });
  const groupIds = activeModes
    .filter((m) => (m.exclusiveGroup || 'default') === group)
    .map((m) => m.id);
  if (groupIds.length) {
    // 仅在快照完整恢复后才清除 deviceSnapshot：HA 离线/恢复异常时保留撤销状态，避免不可逆
    await deps.prisma.homeMode.updateMany({
      where: { id: { in: groupIds } },
      data: restoreOutcome.incomplete
        ? { isActive: false }
        : { isActive: false, deviceSnapshot: Prisma.DbNull },
    });
  }

  const stillActive = await deps.prisma.homeMode.findFirst({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  state.setActiveModeId(stillActive?.id ?? null);
  if (!stillActive) deps.linkageArbiter.release();

  deps.eventBus.emit('homeMode.deactivated', { modeId: prevModeId, exclusiveGroup: group });
  deps.pushTriggerLog({
    modeId: prevModeId,
    modeName: mode.name,
    source: 'deactivate',
    reason: `已恢复 ${restored} 个设备`,
    success: true,
  });
  deps.logger.log(
    `模式组"${group}"已停用(${mode.name}),恢复了 ${restored} 个设备状态` +
      (stillActive ? `;仍激活: ${stillActive.name}` : ''),
  );
  return { success: true, restored, exclusiveGroup: group };
}
