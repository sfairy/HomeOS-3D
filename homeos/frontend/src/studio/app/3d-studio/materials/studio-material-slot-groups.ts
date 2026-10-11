/**
 * 材质槽位角色族：角色 → 族（主体结构 / 软装 / …）的映射与查询。
 *
 * 从 `../studio/studio-app.ts` 的巨型闭包中抽出（P4 拆单体）：纯数据 + 纯函数，无闭包依赖。
 */
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
