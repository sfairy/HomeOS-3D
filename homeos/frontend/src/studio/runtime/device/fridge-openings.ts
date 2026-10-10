/**
 * 冰箱弹窗右上角图形的开口状态解析。
 *
 * 冰箱模型是「上冷藏室左右对开门 + 下冷冻室两层抽屉」，图形固定按这四个槽位渲染。
 * 这里从弹窗的附加实体（门磁 binary_sensor）里挑出开口实体，映射到对应槽位：
 *   - 冷藏 / 变温 → 上层对开门（left / right）
 *   - 冷冻        → 下层抽屉（top / bottom）
 * 槽位分配优先认名称里的「左/右」「上层/下层」，没有显式线索时按用户在面板里配置的顺序
 * 依次填（第一个门当左门、第一个抽屉当上层），不做字母序排序 —— 排序会把「门2」排到「门」前面。
 */

const CLOSED_OPENINGS = { left: false, right: false, top: false, bottom: false };

export type FridgeOpenings = typeof CLOSED_OPENINGS;

type OpeningSlot = "left" | "right" | "top" | "bottom";

/** 开口实体的兜底关键词：门磁类 device_class 缺失时靠名称识别「门 / 抽屉」。 */
const OPENING_TEXT_PATTERN = /(门|抽屉|door|drawer|冷藏|冷冻|fridge|freezer)/i;
const OPEN_DEVICE_CLASSES = new Set(["door", "garage_door", "opening", "window"]);
const OPEN_STATE_VALUES = new Set([
  "on",
  "open",
  "opened",
  "opening",
  "true",
  "1",
  "开",
  "打开",
  "开启",
]);

type OpeningEntry = {
  /** 用户填写的名称，仅用于槽位线索（不含实体 ID）。 */
  labelText: string;
  /** 名称 + 实体 ID，用于「冷藏 / 冷冻」分厢判断。 */
  text: string;
  hint: OpeningSlot | "";
  open: boolean;
  compartment: "upper" | "lower" | "";
};

function liveState(states: any, entityId: string) {
  const entry = states instanceof Map ? states.get(entityId) : states?.[entityId];
  return entry?.newState || entry || null;
}

/** 只认门磁类实体：binary_sensor 且 device_class 是门磁，或名称里有「门 / 抽屉」。 */
function isOpeningControl(control: any, state: any) {
  const entityId = String(control?.entityId || "");
  if (!entityId.startsWith("binary_sensor.")) return false;
  const deviceClass = String(
    state?.attributes?.device_class || state?.deviceClass || state?.device_class || "",
  ).toLowerCase();
  const text = [control?.label, control?.name, state?.attributes?.friendly_name, entityId]
    .filter(Boolean)
    .join(" ");
  return OPEN_DEVICE_CLASSES.has(deviceClass) || OPENING_TEXT_PATTERN.test(text);
}

/** 名称里显式写明的槽位。只看用户填的名称：实体 ID 里的 top / bottom 是随意的，不能当线索。 */
function slotHintOf(labelText: string): OpeningSlot | "" {
  if (/左|left/.test(labelText)) return "left";
  if (/右|right/.test(labelText)) return "right";
  if (/上层|上格|上抽屉|upper/.test(labelText)) return "top";
  if (/下层|下格|下抽屉|lower/.test(labelText)) return "bottom";
  return "";
}

function compartmentOf(text: string): OpeningEntry["compartment"] {
  if (/冷冻|freezer/.test(text)) return "lower";
  if (/冷藏|变温|fridge|refrigerator/.test(text)) return "upper";
  return "";
}

/** 按分厢把开口分成「门」和「抽屉」；没有分厢线索时按面板顺序前一半当门、后一半当抽屉。 */
function splitCompartments(entries: OpeningEntry[]) {
  const doors = entries.filter((entry) => entry.compartment === "upper");
  const drawers = entries.filter((entry) => entry.compartment === "lower");
  if (!doors.length && !drawers.length) {
    const half = Math.ceil(entries.length / 2);
    return { doors: entries.slice(0, half), drawers: entries.slice(half) };
  }
  for (const entry of entries.filter((candidate) => !candidate.compartment))
    (doors.length <= drawers.length ? doors : drawers).push(entry);
  return { doors, drawers };
}

/** 显式线索优先占位，其余按配置顺序填进空槽位。 */
function assignSlots(entries: OpeningEntry[], primary: OpeningSlot, secondary: OpeningSlot) {
  const slots: Partial<Record<OpeningSlot, OpeningEntry>> = {};
  const pending: OpeningEntry[] = [];
  for (const entry of entries) {
    if ((entry.hint === primary || entry.hint === secondary) && !slots[entry.hint]) {
      slots[entry.hint] = entry;
      continue;
    }
    pending.push(entry);
  }
  for (const entry of pending) {
    if (!slots[primary]) slots[primary] = entry;
    else if (!slots[secondary]) slots[secondary] = entry;
  }
  return slots;
}

export function resolveFridgeOpenings(item: any, states: any): FridgeOpenings {
  const controls = Array.isArray(item?.extraControls) ? item.extraControls : [];
  const openings = controls
    .map((control: any): OpeningEntry | null => {
      const state = liveState(states, control?.entityId);
      if (!isOpeningControl(control, state)) return null;
      const labelText = [control?.label, control?.name, state?.attributes?.friendly_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const text = labelText + " " + String(control?.entityId || "").toLowerCase();
      return {
        labelText,
        text,
        hint: slotHintOf(labelText),
        open: OPEN_STATE_VALUES.has(String(state?.state ?? "").trim().toLowerCase()),
        compartment: compartmentOf(text),
      };
    })
    .filter((entry: OpeningEntry | null): entry is OpeningEntry => !!entry);
  if (!openings.length) return { ...CLOSED_OPENINGS };

  const { doors, drawers } = splitCompartments(openings);
  const doorSlots = assignSlots(doors, "left", "right");
  const drawerSlots = assignSlots(drawers, "top", "bottom");
  return {
    left: !!doorSlots.left?.open,
    right: !!doorSlots.right?.open,
    top: !!drawerSlots.top?.open,
    bottom: !!drawerSlots.bottom?.open,
  };
}
