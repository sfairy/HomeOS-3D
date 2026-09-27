/**
 * 逐「门」的材质档位（3D 户型工作室里 `scene.doors` 的那批门）。
 */

/** 默认值：跟随全局风格（不覆盖任何键）。 */
export const DOOR_MATERIAL_AUTO = "auto";

/** 玻璃门型：这些门型的门扇走玻璃，只有玻璃档位能改门扇。 */
const GLASS_DOOR_TYPE_SET = new Set(["glass", "sliding-glass"]);

/**
 * 定义一个门材质档位。
 */
function defineDoorStyle(id, label, { glassOnly = false, leaf, frame, handle, glass = null }) {
  return Object.freeze({
    id: id,
    label: label,
    glassOnly: glassOnly,
    leaf: leaf ? Object.freeze(leaf) : null,
    frame: frame ? Object.freeze(frame) : null,
    handle: handle ? Object.freeze(handle) : null,
    glass: glass ? Object.freeze(glass) : null
  });
}

const DOOR_HANDLE_STEEL = { surface: "metal", color: 0x8c8f94, roughness: 0.3, metalness: 0.5 };
/** 深色门扇配的深五金：浅色门配深五金会像一道划痕，深色门配深五金才收得干净。 */
const DOOR_HANDLE_DARK = { surface: "metal", color: 0x3a3a3c, roughness: 0.3, metalness: 0.45 };

const DOOR_MATERIAL_STYLES = Object.freeze([
  // ── 木门系 ──────────────────────────────────────────────────────────────
  defineDoorStyle("door-oak", "原木门", {
    leaf: { surface: "wood", color: 0xc49a6c, roughness: 0.66, metalness: 0, repeat: 1.5 },
    frame: { surface: "wood", color: 0xb0865a, roughness: 0.6, metalness: 0 },
    handle: DOOR_HANDLE_STEEL
  }),
  defineDoorStyle("door-white", "白漆门", {
    leaf: { surface: "lacquer", color: 0xf5f3ef, roughness: 0.24, metalness: 0.04 },
    frame: { surface: "lacquer", color: 0xe7e3dc, roughness: 0.28, metalness: 0.04 },
    handle: DOOR_HANDLE_STEEL
  }),
  defineDoorStyle("door-walnut", "胡桃木门", {
    leaf: { surface: "wood", color: 0x6b4526, roughness: 0.6, metalness: 0.02, repeat: 1.5 },
    frame: { surface: "wood", color: 0x5a3a22, roughness: 0.6, metalness: 0.02 },
    handle: DOOR_HANDLE_DARK
  }),
  defineDoorStyle("door-lacquer", "深色烤漆门", {
    leaf: { surface: "lacquer", color: 0x2f3237, roughness: 0.22, metalness: 0.08 },
    frame: { surface: "lacquer", color: 0x3a3a3c, roughness: 0.24, metalness: 0.08 },
    handle: DOOR_HANDLE_DARK
  }),
  // ── 金属门 ──────────────────────────────────────────────────────────────
  defineDoorStyle("door-metal", "金属门", {
    leaf: { surface: "metal", color: 0x9aa1a8, roughness: 0.32, metalness: 0.35 },
    frame: { surface: "metal", color: 0x8c8f94, roughness: 0.3, metalness: 0.4 },
    handle: DOOR_HANDLE_STEEL
  }),
  // ── 玻璃门扇（只在玻璃门型上出现）───────────────────────────────────────
  defineDoorStyle("door-glass-clear", "清玻门", {
    glassOnly: true,
    glass: { surface: "glass", color: 0xdfeaec, opacity: 0.24, roughness: 0.08, metalness: 0.03 },
    frame: { surface: "metal", color: 0xb4babf, roughness: 0.36, metalness: 0.18 },
    handle: DOOR_HANDLE_STEEL
  }),
  defineDoorStyle("door-glass-tinted", "茶玻门", {
    glassOnly: true,
    glass: { surface: "glass", color: 0xc9b18c, opacity: 0.34, roughness: 0.1, metalness: 0.04 },
    frame: { surface: "metal", color: 0xa08558, roughness: 0.34, metalness: 0.2 },
    handle: DOOR_HANDLE_STEEL
  })
]);

/** 该门型是不是玻璃门扇（glass / sliding-glass）。 */
export function isGlassDoorType(doorType) {
  return GLASS_DOOR_TYPE_SET.has(doorType);
}

/**
 * 某门型可选的材质档位（不含「跟随全局风格」，那一项由界面统一补在最前）。
 */
export function doorMaterialOptionsFor(doorType) {
  const allowGlass = isGlassDoorType(doorType);
  return DOOR_MATERIAL_STYLES.filter(style => allowGlass || !style.glassOnly);
}

/**
 * 把任意取值归一到「该门型下合法的档位 id」。非法值一律落回 `auto` 而不是抛错：草稿里出现脏值 /
 */
export function normalizeDoorMaterial(doorType, styleValue) {
  if (typeof styleValue !== "string" || styleValue === DOOR_MATERIAL_AUTO) {
    return DOOR_MATERIAL_AUTO;
  }
  return doorMaterialOptionsFor(doorType).some(option => option.id === styleValue)
    ? styleValue
    : DOOR_MATERIAL_AUTO;
}

/** 取某个档位定义；`auto` 或非法 id 返回 null。 */
export function findDoorMaterial(doorType, styleValue) {
  const normalized = normalizeDoorMaterial(doorType, styleValue);
  if (normalized === DOOR_MATERIAL_AUTO) {
    return null;
  }
  return doorMaterialOptionsFor(doorType).find(option => option.id === normalized) || null;
}

/** 门材质 `auto` 档的显示名（与物件保持同一说法：「跟随全局风格」）。 */
export function doorMaterialAutoLabel() {
  return "跟随全局风格";
}
