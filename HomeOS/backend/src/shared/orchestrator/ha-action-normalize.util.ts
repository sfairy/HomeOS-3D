/**
 * @file ha-action-normalize.util.ts
 * @module backend/src/shared/orchestrator
 */
/** HA Config API ↔ 联动器 action/sequence 格式互转 */
import { toItemList } from './yaml.util';

/** HA Config API action → 联动器 service/target 格式（单条） */
function normalizeHaActionItemFromConfig(item: unknown): unknown {
  if (!item || typeof item !== 'object') return item;
  const a = item as Record<string, unknown>;

  if (a.delay != null && !a.service && !a.action && !a.choose && !a.repeat && !a.if) {
    return { delay: a.delay };
  }

  if (a.action && !a.service) {
    const out: Record<string, unknown> = { service: a.action };
    const target = a.target as Record<string, unknown> | undefined;
    if (target?.entity_id) out.target = target;
    if (a.data) out.data = a.data;
    if (a.delay) out.delay = a.delay;
    if (a.choose) out.choose = a.choose;
    if (a.repeat) out.repeat = a.repeat;
    if (a.event) out.event = a.event;
    if (a.continue_on_error != null) out.continue_on_error = a.continue_on_error;
    return out;
  }

  return a;
}

/** 联动器 action → HA Config API action（单条，不含 choose/repeat/if 递归） */
function normalizeHaActionItemForConfig(item: unknown): unknown {
  if (!item || typeof item !== 'object') return item;
  const a = { ...(item as Record<string, unknown>) };

  if (a.delay != null && !a.service && !a.action && !a.choose && !a.repeat && !a.if) {
    return { delay: a.delay };
  }

  if (a.service && !a.action) {
    const out: Record<string, unknown> = { action: a.service };
    const target = a.target as Record<string, unknown> | undefined;
    if (target?.entity_id) out.target = { entity_id: target.entity_id };
    if (a.data) out.data = a.data;
    if (a.continue_on_error != null) out.continue_on_error = a.continue_on_error;
    return out;
  }

  return a;
}

/** HA Config API actions 列表 → 联动器格式 */
export function normalizeActionsFromHa(raw: unknown): unknown {
  return toItemList(raw).map(normalizeHaActionItemFromConfig);
}

/** 联动器 actions 列表 → HA Config API 格式（扁平，无 choose/repeat/if） */
export function normalizeActionsForHa(raw: unknown): unknown[] {
  return toItemList(raw).map((item) => {
    const normalized = normalizeHaActionItemForConfig(item);
    if (
      normalized &&
      typeof normalized === 'object' &&
      (normalized as Record<string, unknown>).delay != null &&
      !(normalized as Record<string, unknown>).action
    ) {
      return normalized;
    }
    return normalized;
  });
}

/** HA sequence item → 联动器（含 choose/repeat/parallel/if 递归） */
function normalizeSequenceItemFromHa(
  item: unknown,
  normalizeNested: (raw: unknown) => unknown[],
): unknown {
  if (!item || typeof item !== 'object') return item;
  const a = item as Record<string, unknown>;

  const base = normalizeHaActionItemFromConfig(a);
  if (base !== a) return base;

  if (a.choose) {
    return {
      choose: (a.choose as unknown[]).map((ch) => {
        if (!ch || typeof ch !== 'object') return ch;
        const c = { ...(ch as Record<string, unknown>) };
        if (c.sequence) c.sequence = normalizeNested(c.sequence);
        if (c.default) c.default = normalizeNested(c.default);
        return c;
      }),
    };
  }

  if (a.repeat && typeof a.repeat === 'object') {
    const r = { ...(a.repeat as Record<string, unknown>) };
    if (r.sequence) r.sequence = normalizeNested(r.sequence);
    return { repeat: r };
  }

  if (a.parallel) return { parallel: normalizeNested(a.parallel) };
  if (a.if) return normalizeIfFromHa(a, normalizeNested);

  return a;
}

/** 联动器 sequence item → HA Config API（含 choose/repeat/parallel/if 递归） */
function normalizeSequenceItemForHa(
  item: unknown,
  normalizeNested: (raw: unknown) => unknown[],
): unknown {
  if (!item || typeof item !== 'object') return item;
  const a = { ...(item as Record<string, unknown>) };

  const flat = normalizeHaActionItemForConfig(a);
  if (
    flat &&
    typeof flat === 'object' &&
    ((flat as Record<string, unknown>).action || (flat as Record<string, unknown>).delay != null) &&
    !a.choose &&
    !a.repeat &&
    !a.if
  ) {
    return flat;
  }

  if (a.choose) {
    return {
      choose: (a.choose as unknown[]).map((ch) => {
        if (!ch || typeof ch !== 'object') return ch;
        const c = { ...(ch as Record<string, unknown>) };
        if (c.sequence) c.sequence = normalizeNested(c.sequence);
        if (c.default) c.default = normalizeNested(c.default);
        return c;
      }),
    };
  }

  if (a.repeat && typeof a.repeat === 'object') {
    const r = { ...(a.repeat as Record<string, unknown>) };
    if (r.sequence) r.sequence = normalizeNested(r.sequence);
    return { repeat: r };
  }

  if (a.parallel) return { parallel: normalizeNested(a.parallel) };
  if (a.if) return normalizeIfForHa(a, normalizeNested);

  return a;
}

function normalizeIfFromHa(
  a: Record<string, unknown>,
  normalizeNested: (raw: unknown) => unknown[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (a.if) out.if = a.if;
  if (a.then) out.then = normalizeNested(a.then);
  if (a.else) out.else = normalizeNested(a.else);
  return out;
}

function normalizeIfForHa(
  a: Record<string, unknown>,
  normalizeNested: (raw: unknown) => unknown[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (a.if) out.if = a.if;
  if (a.then) out.then = normalizeNested(a.then);
  if (a.else) out.else = normalizeNested(a.else);
  return out;
}

/** 将 HA 动作序列归一化为 HomeOS 可接受的形态。 */
export function normalizeSequenceFromHa(raw: unknown): unknown[] {
  return toItemList(raw).map((item) => normalizeSequenceItemFromHa(item, normalizeSequenceFromHa));
}

/** 将 HomeOS 动作序列归一化为 HA 可接受的形态 */
export function normalizeSequenceForHa(raw: unknown): unknown[] {
  return toItemList(raw).map((item) => normalizeSequenceItemForHa(item, normalizeSequenceForHa));
}
