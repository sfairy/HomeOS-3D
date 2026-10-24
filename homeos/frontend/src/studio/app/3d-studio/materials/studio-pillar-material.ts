/**
 * 柱族的材质配方（`body` / `base` / `trim` 三条槽位）。
 *
 * 从 `loaders/studio-external-models.ts` 的 `applyWarmWoodFurnitureMaterial` 里抽出：
 * 这段逻辑既决定「选了配柜档位后柱体怎么换料」，也决定「配墙档怎么跟墙」，
 * 属于**可被检查脚本直接断言的纯数据**，不该埋在 3000 行的加载器闭包里。
 *
 * ## 两条硬规则
 *
 * 1. **角色必须走角色表**。柱体 GLB 的材质名是 `pillar-body` / `pillar_quarter-trim`
 *    这种「模型名-角色」写法，旧实现的 `material-\d+-<role>` 正则一条也匹配不上，
 *    于是 `base` / `trim` 全被当成 `body`：选「浅橡木（配柜）」时柱础与柱帽拿不到柜体色，
 *    整根柱子一个色。
 *
 * 2. **配墙 = 颜色 + 表面参数 + 透过率一起抄**。墙体自带 0.30（暖木 0.32）的自发光、
 *    `clearcoat 0.05`（见 `studio-wall-finish.ts`），并且是**半透明的一层膜**
 *    （`wallOpacity`，默认 0.36）。只抄颜色的柱体会比墙暗一档；只抄颜色 + 自发光、
 *    却仍是实心的柱体，会在墙的灰膜旁边立成一根亮柱子 —— 两种都会被看成
 *    「选了配墙，柱子和墙不是一个色」。
 */
import { materialStylePresetRoleColorFor } from "./studio-material-presets";
import { defaultViewSettings } from "../authoring/scene/studio-view-settings";
import { WALL_SURFACE_FINISH, wallEmissiveIntensity, wallFilmOpacity } from "./studio-wall-finish";

export interface PillarMaterialSpec {
  /** 最终基色（十六进制，sRGB）。 */
  color: number;
  roughness: number;
  metalness: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  emissive: number;
  emissiveIntensity: number;
  /** 是否半透明（配墙档跟墙的 `wallOpacity`；选了柜体档位则是实心漆面）。 */
  transparent: boolean;
  /** 不透明度：配墙档取与墙等价的膜厚（见 `wallFilmOpacity`）。 */
  opacity: number;
  /** 该槽位是否走「配墙（跟随墙体）」：真时后续统一发光逻辑必须豁免它。 */
  wallFollow: boolean;
}

/** 柱体档位（木柜白门 / 浅橡木 / 胡桃木 / 深色烤漆）走柜体漆面参数。 */
const PILLAR_STYLE_ROUGHNESS = 0.66;
const PILLAR_STYLE_BASE_ROUGHNESS = 0.74;
const PILLAR_STYLE_METALNESS = 0.02;

export function resolvePillarMaterialSpec(
  itemType: string,
  role: string,
  palette: Record<string, unknown> | null | undefined,
): PillarMaterialSpec {
  const styleColor = materialStylePresetRoleColorFor(itemType, role, palette);
  if (typeof styleColor === "number") {
    return {
      color: styleColor >>> 0,
      roughness: role === "base" ? PILLAR_STYLE_BASE_ROUGHNESS : PILLAR_STYLE_ROUGHNESS,
      metalness: PILLAR_STYLE_METALNESS,
      emissive: 0,
      emissiveIntensity: 0,
      transparent: false,
      opacity: 1,
      wallFollow: false,
    };
  }
  /**
   * 配墙：三种槽位统一成墙色 + 墙的膜厚。仿的是同一面墙的延续 —— 柱础 / 柱帽不该有两种漆，
   * 也不该是一根实心柱。墙色缺省时退到家具色（千分之一的兜底路径，保证不出现纯白柱子）。
   */
  const wallColor = Number(palette?.wall ?? palette?.furniture ?? 0xffffff) >>> 0;
  const paletteWallOpacity = palette?.wallOpacity;
  const wallOpacity =
    typeof paletteWallOpacity === "number" && Number.isFinite(paletteWallOpacity)
      ? paletteWallOpacity
      : defaultViewSettings.wallOpacity;
  const opacity = wallFilmOpacity(wallOpacity);
  return {
    color: wallColor,
    roughness: WALL_SURFACE_FINISH.roughness,
    metalness: WALL_SURFACE_FINISH.metalness,
    clearcoat: WALL_SURFACE_FINISH.clearcoat,
    clearcoatRoughness: WALL_SURFACE_FINISH.clearcoatRoughness,
    emissive: wallColor,
    emissiveIntensity: wallEmissiveIntensity(Boolean(palette?.warmWood)),
    transparent: opacity < 0.999,
    opacity,
    wallFollow: true,
  };
}
