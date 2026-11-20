/**
 * 自然木语的墙面 / 墙顶材质（0.8.7 `natural-wood-wall-material.js` 的对应实现）。
 *
 * 与地板的关键差别：**墙不需要木纹**。0.8.7 的墙是「哑光米白 + 极弱起伏」，
 * 用木纹会让整面墙像柜门，反而假。这里只做三件事：
 * 1. 侧墙：米白、低金属度、高粗糙度、极弱的法线扰动；
 * 2. 墙顶（俯视时看到的墙厚上表面）：比侧墙亮一档，模拟顶光；
 * 3. 两者都不进 shader 的种类分支，避免和地板抢同一套纹理。
 */

type ThreeLike = {
  MeshStandardMaterial: new (params: Record<string, unknown>) => any
  Color: new (value: number | string) => any
}

export interface NaturalWoodWallOptions {
  /** 侧墙色，默认 `palette.wall`。 */
  wallColor?: number
  /** 墙顶色，默认 `palette.cream`。 */
  topColor?: number
  /** 是否透明（俯视看户型时需要）。 */
  opacity?: number
  side?: number
}

/** 自然木语的墙面主色（与 `NATURAL_WOOD_PALETTE.wall` 同值，避免循环依赖）。 */
const WALL_COLOR = 0xede7db
const WALL_TOP_COLOR = 0xe9dfce

export function createNaturalWoodWallMaterial(three: ThreeLike, options: NaturalWoodWallOptions = {}): any {
  const { wallColor = WALL_COLOR, opacity, side } = options
  const material = new three.MeshStandardMaterial({
    color: new three.Color(wallColor),
    // 墙面几乎全漫反射：粗糙度拉满才不会在聚光灯下出现一块高光。
    roughness: 0.94,
    metalness: 0,
    transparent: typeof opacity === 'number' && opacity < 1,
    opacity: typeof opacity === 'number' ? opacity : 1,
    side,
  })
  material.name = '自然木语 / 墙'
  material.userData.naturalWoodKind = 'wall'
  return material
}

export function createNaturalWoodWallTop(three: ThreeLike, options: NaturalWoodWallOptions = {}): any {
  const { topColor = WALL_TOP_COLOR, side } = options
  const material = new three.MeshStandardMaterial({
    color: new three.Color(topColor),
    // 墙顶受顶光直射，粗糙度略低一点点让明暗过渡更柔和（0.9 vs 0.94）。
    roughness: 0.9,
    metalness: 0,
    side,
  })
  material.name = '自然木语 / 墙顶'
  material.userData.naturalWoodKind = 'wallTop'
  return material
}
