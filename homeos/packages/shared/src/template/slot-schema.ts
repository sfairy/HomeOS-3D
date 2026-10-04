/**
 * @file slot-schema.ts
 * @module @homeos/shared/template
 * @brief 槽位持久化 payload 结构与归一化 / 恢复（前后端共用）。
 *
 * 职责：
 *  - 定义槽位 payload 结构（SlotSchemaPayload）：mapping（key→entity_id）+ slotsMeta（槽位元信息）；
 *  - 提供类型守卫 isSlotSchemaPayload 与归一化 normalizeSlotPayload（非法结构归一为空）；
 *  - 由 mapping + slotsList 构建 payload（buildSlotPayload，仅保留非空值并标记 custom）；
 *  - 从持久化 payload 恢复 slotsList + slots 映射（restoreSlotsFromPayload，内置槽位在前）。
 *
 * 关键依赖：
 *  - appliance-catalog 提供 ApplianceSlotDef 与 getBuiltinSlots（恢复时合并内置槽位）；
 *  - appliance-type-infer 调用 buildSlotPayload / restoreSlotsFromPayload 处理槽位。
 *
 * 约定：
 *  - slotsMeta 中的 custom 槽位以 _key 标识，custom_ 前缀自动判定为 custom；
 *  - restoreSlotsFromPayload 先放内置槽位，再追加未与内置 key 冲突的 custom 槽位；
 *  - slots 映射仅保留 slotsList 中存在且 mapping 有值的条目。
 */
import type { ApplianceSlotDef } from './appliance-catalog';
import { getBuiltinSlots } from './appliance-catalog';

/**
 * 槽位元信息（在 ApplianceSlotDef 基础上追加持久化字段）。
 * 用于区分「目录内置槽位」与「用户自定义槽位」，并保留持久化时的稳定 key。
 */
export interface SlotMeta extends ApplianceSlotDef {
  /** 持久化稳定 key（默认与 key 相同；custom_ 前缀表示用户自定义槽位） */
  _key?: string;
  /** 是否为用户自定义槽位；缺省时按 _key 是否以 "custom_" 开头推断 */
  custom?: boolean;
}

/**
 * 槽位持久化 Payload（前后端交互与数据库存储的统一结构）。
 * mapping 存槽位 key → HA entity_id；slotsMeta 存对应槽位元信息（含自定义标记与图标等）。
 */
export interface SlotSchemaPayload {
  /** 槽位 key → entity_id 映射（仅非空值会被存储） */
  mapping: Record<string, string>;
  /** 所有槽位的元信息（顺序即 UI 展示顺序；先放内置槽位，再追加自定义） */
  slotsMeta: SlotMeta[];
}

/**
 * 类型守卫：判断任意值是否为合法的 SlotSchemaPayload 结构。
 *
 * @param raw 待判定值（通常来自配置存储）
 * @returns true 时类型被收窄为 SlotSchemaPayload
 */
export function isSlotSchemaPayload(raw: unknown): raw is SlotSchemaPayload {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as SlotSchemaPayload;
  return !!o.mapping && typeof o.mapping === 'object' && Array.isArray(o.slotsMeta);
}

/** 仅接受带 slotsMeta 的槽位 payload；非法结构归一化为空 */
export function normalizeSlotPayload(raw: unknown): SlotSchemaPayload {
  if (!isSlotSchemaPayload(raw)) {
    return { mapping: {}, slotsMeta: [] };
  }
  return {
    mapping: { ...raw.mapping },
    slotsMeta: raw.slotsMeta.map((s) => ({ ...s })),
  };
}

/**
 * 由 mapping（key→entity_id）+ slotsList 组装持久化 payload。
 * 仅保留 mapping 中存在且非空的条目；slotsMeta 每条补齐 _key 与 custom 标记（custom_ 前缀自动视为自定义）。
 *
 * @param mapping    槽位 key → entity_id 原始映射
 * @param slotsList  当前槽位列表（内置 + 自定义合并后的顺序）
 * @returns 合法的 SlotSchemaPayload（mapping 被剪枝为仅 list 中存在的 key）
 */
export function buildSlotPayload(
  mapping: Record<string, string>,
  slotsList: SlotMeta[],
): SlotSchemaPayload {
  const cleanMapping: Record<string, string> = {};
  for (const s of slotsList) {
    const key = s._key || s.key;
    const val = mapping[key]?.trim();
    if (val) cleanMapping[key] = val;
  }
  return {
    mapping: cleanMapping,
    slotsMeta: slotsList.map((s) => ({
      key: s.key || s._key || '',
      _key: s._key || s.key,
      label: s.label,
      hint: s.hint,
      domain: s.domain,
      icon: s.icon,
      custom: s.custom ?? String(s._key || '').startsWith('custom_'),
    })),
  };
}

/** 从持久化 payload 恢复 slotsList + slots 映射 */
export function restoreSlotsFromPayload(
  payload: unknown,
  typeId: string,
): { slotsList: SlotMeta[]; slots: Record<string, string> } {
  const { mapping, slotsMeta } = normalizeSlotPayload(payload);
  const builtin = getBuiltinSlots(typeId);
  const slotsList: SlotMeta[] = [];
  const seen = new Set<string>();

  for (const def of builtin) {
    slotsList.push({ ...def, _key: def.key });
    seen.add(def.key);
  }

  for (const meta of slotsMeta) {
    const key = meta._key || meta.key;
    if (!key || seen.has(key)) continue;
    slotsList.push({
      key: meta.key || key,
      _key: key,
      label: meta.label || key,
      hint: meta.hint || '',
      domain: meta.domain || 'sensor',
      icon: meta.icon || '📌',
      custom: true,
    });
    seen.add(key);
  }

  const slots: Record<string, string> = {};
  for (const s of slotsList) {
    const k = s._key || s.key;
    if (mapping[k]) slots[k] = mapping[k];
  }

  return { slotsList, slots };
}
