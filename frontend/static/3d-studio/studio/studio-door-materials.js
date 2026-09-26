/**
 * 逐「门」的材质档位（3D 户型工作室里 `scene.doors` 的那批门）。
 *
 * 与 studio-material-styles.js 的关系：那边是**物件（家具 / 家电 / 洁具）**的逐件「材质风格」，
 * 键是物件类型（sofa / cabinet / …），由 tools/check_invariants.mjs 按物件类型词表对账；门不是
 * 物件（它是 `kind: "door"` 的建筑附件），把它塞进那张按物件类型对账的表会让「类型词表」与
 * 「可换料的东西」两件事纠缠在一起。所以门的档位单独放这一份，接口形状与那份一致，但**不参与**
 * 物件类型的覆盖校验 —— 这是刻意的分工，不是遗漏。
 *
 * 为什么门需要这个属性：门是「建筑本体里最像家具的一件」—— 同一扇门可以做成原木 / 白漆 / 胡桃 /
 * 深色烤漆 / 金属 / 玻璃，而当前的外观完全由场景主题（studioSceneStyle）决定，改不了单扇门。
 *
 * `auto` 是默认值，语义是「跟随全局风格」：**不覆盖任何键**，门照常走 architecturePalette 的
 * 取料路径，行为与加这个属性之前逐字节相同 —— 这是老草稿 / 老快照不需要数据迁移的原因。
 *
 * 档位与门型的关系（决定 `materialStyle` 落进哪一块几何）：
 *   - 实心门型（solid / double / entry / roller-shutter / frame-only）：木料 / 漆面 / 金属档位
 *     同时作用在**门扇与门套**上（frame-only 没有门扇，只作用在门套）；
 *   - 玻璃门型（glass / sliding-glass）：门扇本身就是玻璃，木料 / 漆面 / 金属档位只作用在
 *     **门套**上，玻璃档位（清玻 / 茶玻）才改门扇的玻璃色与通透度。
 * 因此木料档位对每一种门型都有效（玻璃门改门套），而玻璃档位**只在玻璃门型上出现** —— 出现在
 * 实心门上会是一档「选了没反应」的选项，那种档位宁可不要。
 *
 * 纯数据 + 纯函数：不引入 THREE、不碰 DOM，因此工作台与舞台两侧都能安全 import。
 */

/** 默认值：跟随全局风格（不覆盖任何键）。 */
export const DOOR_MATERIAL_AUTO = "auto";

/** 玻璃门型：这些门型的门扇走玻璃，只有玻璃档位能改门扇。 */
const GLASS_DOOR_TYPE_SET = new Set(["glass", "sliding-glass"]);

/**
 * 定义一个门材质档位。
 *
 * 三条配方各自独立，缺省时该部件回落到场景调色板：
 *   - `leaf`   门扇（实心门）的主料；
 *   - `frame`  门套 / 门框；
 *   - `handle` 拉手与门锁等五金（不写时回落场景的深色金属）；
 *   - `glass`  玻璃门扇用的玻璃（只有玻璃档位才有）。
 *
 * 粗糙度 / 金属度**显式写出**而不按 surface 派生：这一份刻意不依赖 studio-material-styles.js 的
 * SURFACE_* 表，避免两个模块为了几个常量互相 import。可选的 `repeat` 是质感贴图在 UV 上的平铺次数，
 * 不写由材质侧按默认的 2 次处理。
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

/** 拉手的统一钢色：五种实心档位共用一支，避免每档各写一个近似的灰。 */
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
  // 玻璃本身不贴细节图（surface: "glass" 在质感层没有画法，只用来清掉 map），色相与通透度
  // 由 color / opacity 给；门套走金属，与场景里既有的玻璃隔断同一读法。
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
 * 玻璃档位只在玻璃门型上出现，见模块头。
 */
export function doorMaterialOptionsFor(doorType) {
  const allowGlass = isGlassDoorType(doorType);
  return DOOR_MATERIAL_STYLES.filter(style => allowGlass || !style.glassOnly);
}

/**
 * 把任意取值归一到「该门型下合法的档位 id」。非法值一律落回 `auto` 而不是抛错：草稿里出现脏值 /
 * 旧值，或门型改成了玻璃门、而存的还是木料档位时，门照常显示，只是回到默认外观。
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
