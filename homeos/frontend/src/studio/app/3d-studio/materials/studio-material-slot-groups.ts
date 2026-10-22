/**
 * 材质槽位角色族：角色 → 族（主体结构 / 软装 / …）的映射与查询；以及车辆的语义槽位归并。
 *
 * 从 `../studio/studio-app.ts` 的巨型闭包中抽出（P4 拆单体）：纯数据 + 纯函数，无闭包依赖。
 */
import {
  resolveModelFamily,
  vehicleMaterialSlotFor,
  VEHICLE_MATERIAL_SLOTS,
} from "./studio-model-material-roles";
/** 角色 → 角色族。 */
const MATERIAL_SLOT_GROUPS = [
  {
    id: "body",
    label: "主体结构",
    roles: [
      "body",
      "door",
      "drawer",
      "panel",
      "side",
      "back",
      "shelf",
      "interior",
      "frame",
      "slab",
      "top",
      "base",
      "trim",
      "leg",
      "surface",
      "wood",
      "tread",
      "handrail",
      "seat",
      "upholstery",
      "fabric",
      "cushion",
      "linen",
      "runner",
    ],
  },
  {
    id: "hardware",
    label: "五金细节",
    roles: [
      "handle",
      "metal",
      "key",
      "grating",
      "control",
      "indicator",
      "lit",
      "screen",
      "recess",
      "shadow",
      "dark",
      "light",
      "accent",
    ],
  },
  {
    id: "glass",
    label: "玻璃镜面",
    roles: ["glass", "mirror"],
  },
  {
    id: "appliance",
    label: "厨卫家电",
    roles: ["sink", "cooktop", "ceramic", "water", "sand", "rock", "fish"],
  },
  {
    id: "decor",
    label: "软装摆件",
    roles: ["pot", "soil", "foliage", "foliageSoft", "leaf", "paper", "book", "stash", "sage"],
  },
];
const MATERIAL_SLOT_GROUP_ROLE_INDEX = new Map(
  MATERIAL_SLOT_GROUPS.flatMap((slotGroup) =>
    slotGroup.roles.map((roleName) => [roleName, slotGroup]),
  ),
);
/** 槽位属于哪个角色族； */
export function materialSlotGroupOf(slotEntry: any) {
  return (
    MATERIAL_SLOT_GROUP_ROLE_INDEX.get(slotEntry.role) || { id: "other", label: "其它部件" }
  );
}

/**
 * 车辆槽位归并：同一语义部件的一族 GLB 材质收成一行（见 `VEHICLE_MATERIAL_SLOTS`）。
 *
 * 同样是车，`smallcar` 只有一个图集材质（1 行），`suv-lite` 有 11 个（4 个 `glass*`
 * 其实是车窗 / 清漆层 / 前灯罩 / 尾灯罩）。不归并时，同类物件的面板一个是 1 行、
 * 一个是 11 行，「玻璃」还会重复四遍。
 *
 * 行内再按「当前颜色 + 表面参数」分成色块（`variants`）：同一格里的材质外观一致，
 * 改色只会写到同格内的材质，不会把尾灯罩刷成车窗色。
 */
export function groupVehicleMaterialSlots(modelType: any, sortedSlotEntries: any[]) {
  if (!sortedSlotEntries?.length || resolveModelFamily(modelType) !== "vehicle")
    return sortedSlotEntries;
  const groupedEntries: any[] = [],
    groupedByKey = new Map<string, any>();
  for (const slotEntry of sortedSlotEntries) {
    const vehicleSlot = vehicleMaterialSlotFor(slotEntry.name),
      groupKey = vehicleSlot ? "slot:" + vehicleSlot.id : "material:" + slotEntry.name,
      variantKey = [
        slotEntry.color,
        slotEntry.roughness,
        slotEntry.metalness,
        slotEntry.transparent,
        slotEntry.opacity,
        slotEntry.depthWrite,
        slotEntry.overrideColor,
        slotEntry.hasAtlas,
      ].join("|");
    let groupedEntry = groupedByKey.get(groupKey);
    if (!groupedEntry) {
      groupedEntry = {
        ...slotEntry,
        name: groupKey,
        /** 语义槽位名（车身 / 车窗玻璃…）；空 = 没进表，退回逐材质一行。 */
        label: vehicleSlot?.label || "",
        role: vehicleSlot?.role || slotEntry.role,
        members: [],
        variants: [],
        hasAtlas: false,
      };
      (groupedByKey.set(groupKey, groupedEntry), groupedEntries.push(groupedEntry));
    }
    (groupedEntry.members.push(slotEntry.name),
      (groupedEntry.hasAtlas = groupedEntry.hasAtlas || slotEntry.hasAtlas),
      (groupedEntry.fromPalette = groupedEntry.fromPalette || slotEntry.fromPalette),
      (groupedEntry.slot = Math.min(groupedEntry.slot, slotEntry.slot)));
    let variant = groupedEntry.variants.find(
      (slotVariant: any) => slotVariant.key === variantKey,
    );
    if (!variant) {
      variant = { ...slotEntry, key: variantKey, names: [] };
      groupedEntry.variants.push(variant);
    }
    variant.names.push(slotEntry.name);
  }
  /**
   * 行级字段（色块、粗糙度 / 金属度滑条、复位按钮、统计）取第一格；
   * 其余分格由面板逐格出控件（见 `createMaterialSlotRow` / `createMaterialSlotVariantList`）。
   */
  const variantFieldNames = [
    "color",
    "roughness",
    "metalness",
    "transparent",
    "opacity",
    "depthWrite",
    "emissive",
    "emissiveIntensity",
    "overrideColor",
    "surfaceOverride",
    "slab",
    "hasAtlas",
  ];
  for (const groupedEntry of groupedEntries)
    for (const variantFieldName of variantFieldNames)
      groupedEntry[variantFieldName] = groupedEntry.variants[0][variantFieldName];
  const vehicleSlotOrder = new Map(
    VEHICLE_MATERIAL_SLOTS.map((vehicleSlot, slotIndex) => ["slot:" + vehicleSlot.id, slotIndex]),
  );
  return groupedEntries.sort(
    (groupedEntryA: any, groupedEntryB: any) =>
      (vehicleSlotOrder.get(groupedEntryA.name) ?? Number.MAX_SAFE_INTEGER) -
        (vehicleSlotOrder.get(groupedEntryB.name) ?? Number.MAX_SAFE_INTEGER) ||
      groupedEntryA.slot - groupedEntryB.slot,
  );
}
