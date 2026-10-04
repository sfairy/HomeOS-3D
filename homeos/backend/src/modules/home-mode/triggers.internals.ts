/**
 * 家庭模式触发器绑定解析与自动触发匹配 / 执行（从 home-mode.internals 拆出）。
 *
 * 职责：
 *  - parseHomeModeTriggerBindings：从数据库模式列表解析可自动触发的绑定
 *  - checkHomeModeTimeTriggers：定时轮询时间触发器（按家庭时区）
 *  - handleHomeModeStateTrigger：HA 状态变更触发（门锁解锁 / 状态匹配）
 *  - handleHomeModePresenceArrive：在场检测回家触发
 *  - handleHomeModeCalendarAway：日历外出事件触发与外出结束恢复
 *  - handleHomeModeEveryoneLeft：全员离家触发
 *  - 冷却去重：canFireHomeModeTrigger / pruneHomeModeTriggerCooldown
 *  仅由 HaWsLeader 副本执行，避免多副本重复激活。
 * 关键依赖：HaWsLeaderService（leader 判定）、PrismaService、家庭时区。
 * 由 HomeModeService 注入 triggersState / triggersDeps 后调用。
 */
import type { PrismaService } from '../../shared/prisma/service';
import type { HaStateChangeEvent } from '../../shared/types';
import { getErrorMessage } from '../../common/utils';
import type { HaWsLeaderService } from '../ha-connector/ha-ws-leader.service';
import type { ModeTrigger } from './presets';
import { homeModeMinuteKey, normalizeHomeModeTimeAt, zonedDateParts } from '@homeos/shared';
import type { HomeModeTriggerLog } from './runtime.internals';
import { readJsonArray } from '../../common/utils/json-field.util';

// ── home-mode-trigger.util ──
/**
 * 判断触发器是否可激发（冷却去重）。
 * 冷却期内返回 false 并记录上次触发时间；通过则写入当前时间戳。
 */
function canFireHomeModeTrigger(
  cooldownMap: Map<string, number>,
  key: string,
  cooldownMs: number,
): boolean {
  const last = cooldownMap.get(key) || 0;
  if (Date.now() - last < cooldownMs) return false;
  cooldownMap.set(key, Date.now());
  return true;
}

/** 清理过期冷却条目，避免 Map 无限增长 */
export function pruneHomeModeTriggerCooldown(
  cooldownMap: Map<string, number>,
  maxAgeMs = 24 * 3600_000,
) {
  const cutoff = Date.now() - maxAgeMs;
  for (const [key, ts] of cooldownMap) {
    if (ts < cutoff) cooldownMap.delete(key);
  }
}

export interface HomeModeTriggerBinding {
  modeId: string;
  modeName: string;
  trigger: ModeTrigger;
}

/** 从数据库模式列表解析可自动触发的绑定 */
export function parseHomeModeTriggerBindings(
  modes: Array<{ id: string; name: string; triggers: unknown }>,
  logger: { warn: (msg: string) => void },
): HomeModeTriggerBinding[] {
  const bindings: HomeModeTriggerBinding[] = [];
  for (const mode of modes) {
    if (!mode.triggers) continue;
    try {
      const triggers = readJsonArray<ModeTrigger>(mode.triggers, []);
      if (!Array.isArray(triggers)) continue;
      for (const trigger of triggers) {
        if (!trigger?.type || trigger.type === 'manual' || trigger.type === 'calendar_away')
          continue;
        if (trigger.enabled === false) continue;
        bindings.push({ modeId: mode.id, modeName: mode.name, trigger });
      }
    } catch {
      logger.warn(`模式 [${mode.name}] 触发器解析失败`);
    }
  }
  return bindings;
}

/**
 * 解析「离家」类模式：优先匹配 triggers 中标记 calendar_away 的模式，
 * 否则回退按名称正则匹配。
 */
function resolveCalendarAwayMode<T extends { name: string; triggers: unknown }>(
  modes: T[],
): T | undefined {
  const marked = modes.find((m) => {
    try {
      const triggers = readJsonArray<ModeTrigger>(m.triggers, []);
      return triggers.some(
        (t) => t.enabled !== false && (t.type === 'calendar_away' || t.calendarAway === true),
      );
    } catch {
      return false;
    }
  });
  if (marked) return marked;
  return modes.find((m) => /离家|away|外出|vacation/i.test(m.name));
}

// ── home-mode-triggers.helper ──
export interface HomeModeTriggersState {
  triggerBindings: HomeModeTriggerBinding[];
  cachedModes: Array<{ id: string; name: string; triggers: unknown }>;
  triggerCooldown: Map<string, number>;
  lastTimeTriggerMinute: string;
  calendarAway: boolean;
  /** 日历外出前激活的模式（外出结束后恢复） */
  preAwayModeId: string | null;
  getActiveModeId: () => string | null;
  setLastTimeTriggerMinute: (value: string) => void;
  setCalendarAway: (value: boolean) => void;
  setPreAwayModeId: (value: string | null) => void;
  getPreAwayModeId: () => string | null;
}

export interface HomeModeTriggersDeps {
  logger: { log: (msg: string) => void; warn: (msg: string) => void };
  prisma: PrismaService;
  haLeader: HaWsLeaderService;
  getTriggerCooldownMs: () => number;
  /** 家庭 IANA 时区（ops.homeTimezone） */
  getHomeTimezone?: () => string | undefined;
  activate: (
    id: string,
    meta?: { source?: HomeModeTriggerLog['source']; reason?: string },
  ) => Promise<unknown>;
  deactivate: () => Promise<unknown>;
  getActiveMode: () => Promise<{
    id: string;
    exclusiveGroup?: string | null;
    priority?: number | null;
  } | null>;
}

function canFireHomeModeTriggerKey(
  state: Pick<HomeModeTriggersState, 'triggerCooldown'>,
  deps: Pick<HomeModeTriggersDeps, 'getTriggerCooldownMs'>,
  key: string,
): boolean {
  return canFireHomeModeTrigger(state.triggerCooldown, key, deps.getTriggerCooldownMs());
}

/**
 * 触发器命中后激活目标模式。
 * 跳过：已是激活态、冷却期内、同互斥组内优先级不高于当前激活模式。
 * 通过校验后委托 deps.activate 执行激活。
 */
async function fireTriggeredHomeMode(
  state: HomeModeTriggersState,
  deps: HomeModeTriggersDeps,
  binding: HomeModeTriggerBinding,
  reason: string,
  meta?: { source?: HomeModeTriggerLog['source']; reason?: string },
) {
  if (state.getActiveModeId() === binding.modeId) return;
  if (
    !canFireHomeModeTriggerKey(state, deps, `${binding.modeId}:${binding.trigger.type}:${reason}`)
  )
    return;
  const incoming = await deps.prisma.homeMode.findUnique({ where: { id: binding.modeId } });
  if (!incoming) return;
  const active = await deps.getActiveMode();
  if (active && active.id !== binding.modeId) {
    const sameGroup =
      (incoming.exclusiveGroup || 'default') === (active.exclusiveGroup || 'default');
    if (sameGroup && (incoming.priority ?? 50) <= (active.priority ?? 50)) return;
  }
  deps.logger.log(`触发器激活模式 [${binding.modeName}]: ${reason}`);
  await deps.activate(binding.modeId, {
    source: meta?.source ?? 'trigger',
    reason: meta?.reason ?? reason,
  });
}

/**
 * 定时轮询时间触发器（每 30s 由 HomeModeService 调用）。
 * 按家庭时区计算当前分钟键，与触发器 at 字段匹配；支持星期过滤。
 * 同一分钟只检查一次（lastTimeTriggerMinute 去重），仅 leader 副本执行。
 */
export async function checkHomeModeTimeTriggers(
  state: HomeModeTriggersState,
  deps: HomeModeTriggersDeps,
) {
  if (!deps.haLeader.isHaWsLeader()) return;
  const now = new Date();
  const tz = deps.getHomeTimezone?.()?.trim() || undefined;
  const minuteKey = homeModeMinuteKey(now, tz);
  if (minuteKey === state.lastTimeTriggerMinute) return;
  state.setLastTimeTriggerMinute(minuteKey);
  const weekday = zonedDateParts(now, tz).weekday;

  for (const binding of state.triggerBindings) {
    if (binding.trigger.type !== 'time' || !binding.trigger.at) continue;
    if (typeof binding.trigger.at !== 'string') continue;
    // 星期过滤：配置了 days 且今天不在其中则跳过
    if (binding.trigger.days?.length && !binding.trigger.days.includes(weekday)) continue;
    const at = normalizeHomeModeTimeAt(binding.trigger.at.trim());
    if (at && at === minuteKey) {
      await fireTriggeredHomeMode(state, deps, binding, `time@${at}`);
    }
  }
}

/**
 * HA 状态变更触发器匹配。
 * 匹配 lock_unlock（门锁解锁）与 state（实体状态 to/from）触发器，
 * 命中后委托 fireTriggeredHomeMode 激活。仅 leader 副本执行。
 */
export async function handleHomeModeStateTrigger(
  state: HomeModeTriggersState,
  deps: HomeModeTriggersDeps,
  event: HaStateChangeEvent,
) {
  if (!deps.haLeader.isHaWsLeader()) return;
  const entityId = event.entity_id;
  const newState = event.new_state?.state;
  const oldState = event.old_state?.state;
  if (!newState || newState === oldState) return;

  for (const binding of state.triggerBindings) {
    const t = binding.trigger;
    if (t.type === 'lock_unlock' && entityId.startsWith('lock.') && newState === 'unlocked') {
      if (!t.entityId || t.entityId === entityId) {
        await fireTriggeredHomeMode(state, deps, binding, `lock_unlock:${entityId}`);
      }
    }
    if (t.type === 'state' && t.entityId === entityId) {
      if (t.to && newState !== t.to) continue;
      if (t.from && oldState !== t.from) continue;
      await fireTriggeredHomeMode(state, deps, binding, `state:${entityId}→${newState}`);
    }
  }
}

/**
 * 在场检测回家事件触发。
 * 收到 presence.changed 且 atHome=true 时，匹配 arrive_home 触发器并激活。
 * 仅 leader 副本执行。
 */
export async function handleHomeModePresenceArrive(
  state: HomeModeTriggersState,
  deps: HomeModeTriggersDeps,
  data: { atHome?: boolean; name?: string },
) {
  if (!deps.haLeader.isHaWsLeader()) return;
  if (!data.atHome) return;
  for (const binding of state.triggerBindings) {
    if (binding.trigger.type !== 'arrive_home') continue;
    await fireTriggeredHomeMode(state, deps, binding, `arrive_home:${data.name || 'member'}`);
  }
}

/**
 * handleHomeModeCalendarAway：函数。
 * @param args - 参见类型签名；传入 undefined 时通常按 fallback 分支或返回空值
 * @returns 见类型签名；空场景通常返回 null / [] / {} 或 undefined
 * @throws 依赖不可用或输入非法时抛出 Error 子类
 */
export async function handleHomeModeCalendarAway(
  state: HomeModeTriggersState,
  deps: HomeModeTriggersDeps,
  data: { away?: boolean },
) {
  if (!deps.haLeader.isHaWsLeader()) return;
  const away = !!data.away;
  // 进入外出：记录当前激活模式（仅首次），供外出结束后恢复
  if (away && !state.calendarAway) {
    state.setPreAwayModeId(state.getActiveModeId());
  }
  state.setCalendarAway(away);
  const awayMode = resolveCalendarAwayMode(state.cachedModes);
  if (!awayMode) {
    if (!away) state.setPreAwayModeId(null);
    return;
  }
  try {
    if (away) {
      if (state.getActiveModeId() !== awayMode.id) {
        deps.logger.log(`日历外出事件触发,激活模式: ${awayMode.name}`);
        await fireTriggeredHomeMode(
          state,
          deps,
          {
            modeId: awayMode.id,
            modeName: awayMode.name,
            trigger: { type: 'calendar_away', enabled: true },
          },
          'calendar_away',
          { source: 'calendar', reason: '日历外出事件' },
        );
      }
    } else {
      // 外出结束：优先恢复外出前的模式；外出前无模式或模式已删除则停用外出模式
      if (state.getActiveModeId() === awayMode.id) {
        const preAwayModeId = state.getPreAwayModeId();
        const preAwayMode =
          preAwayModeId && preAwayModeId !== awayMode.id
            ? await deps.prisma.homeMode.findUnique({ where: { id: preAwayModeId } })
            : null;
        if (preAwayMode) {
          deps.logger.log(`日历外出结束,恢复先前模式: ${preAwayMode.name}`);
          await deps.activate(preAwayMode.id, {
            source: 'calendar',
            reason: '日历外出结束，恢复先前模式',
          });
        } else {
          deps.logger.log(`日历外出结束,停用模式: ${awayMode.name}`);
          await deps.deactivate();
        }
      }
      state.setPreAwayModeId(null);
    }
  } catch (err) {
    deps.logger.warn(`日历联动模式失败: ${getErrorMessage(err)}`);
  }
}

/**
 * 全员离家事件处理。
 * 匹配 all_leave 触发器并激活对应模式。仅 leader 副本执行。
 */
export async function handleHomeModeEveryoneLeft(
  state: HomeModeTriggersState,
  deps: HomeModeTriggersDeps,
) {
  if (!deps.haLeader.isHaWsLeader()) return;
  try {
    const bindings = state.triggerBindings.filter((b) => b.trigger.type === 'all_leave');
    if (bindings.length === 0) return;
    for (const binding of bindings) {
      await fireTriggeredHomeMode(state, deps, binding, 'all_leave');
    }
  } catch (e) {
    deps.logger.warn(`自动离家模式触发失败: ${getErrorMessage(e)}`);
  }
}
