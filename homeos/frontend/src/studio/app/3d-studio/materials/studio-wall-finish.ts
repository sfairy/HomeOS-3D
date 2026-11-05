/**
 * 「墙面」的表面参数 —— 唯一来源。
 *
 * 为什么必须抽出这一份：墙体不是一块「只吃灯光的漆面」。`authoring/scene/studio-walls.ts`
 * 里的墙体同时具备
 * 1. 常规 PBR：`roughness 0.72` / `metalness 0` / `clearcoat 0.05`；
 * 2. **自发光 0.15（暖木 0.17）**：把墙面垫到一个基础亮度，
 *    这样墙在室内曝光下不会被看成灰面。
 *
 *    注意：0.8.2 冷色档写的是 0.025，但那一份**只对「专用墙面着色器」成立** ——
 *    `wall-trial=shader`（区域光照/轻量柔光）那条路走 `createDedicatedWallMaterial`，
 *    环境项由着色器自己给（冷色 `0.30 + 0.40*up + 0.18*key`），根本不读 emissive。
 *    物理材质这条路（编辑器、标准舞台）没有那一段，0.025 在默认冷色主题下会把整面墙
 *    压成暗褐色的一块板 —— 灯也补不回来（射灯锥形只扫到墙的一小段）。先照抄 0.025
 *    就是把「墙面亮度」从场景里抽掉。
 *    也不能反过来给到 0.30：自发光铺满整面而直射光只覆盖锥形，底色一高，射灯光斑、
 *    扇形洗墙、家具投影就全被洗平（实测直射占比只剩 7%）。0.15 是两者的平衡点。
 * 3. 竖向渐变（墙根压暗 15%）与转角压暗；
 * 4. **半透明**（`wallOpacity`，默认 0.36）：墙是「看向室内的一层膜」，
 *    跟随件只有同样半透明，才会和墙是同一个浓度（见 `wallFilmOpacity`）。
 *
 * 任何声明「跟随墙体」的构件（柱子、墙板、墙体收口…）如果只抄了墙的**颜色**、
 * 没抄这套表面参数，就一定比墙暗一档 / 浓一截 —— 这正是「选中『配墙（跟随墙体）』后
 * 柱子和墙不是一个颜色」的根因。所以这里把参数抽成常量，墙体与跟随件读同一份。
 */

/** 墙面 PBR 参数（墙板 / 柱体跟随墙体时逐项照搬）。 */
export const WALL_SURFACE_FINISH = Object.freeze({
  roughness: 0.72,
  metalness: 0,
  clearcoat: 0.05,
  clearcoatRoughness: 0.82,
})

/**
 * 墙面的自发光强度（暖木主题略高，与 `createSceneWallSideMaterial` 一致）。
 *
 * 冷色档 0.15 是「物理材质」这条路的基线。它必须存在 —— 墙是半透明膜
 * （`wallOpacity` 0.36）+ 深色背景，完全没有自发光时室内曝光下整面墙会掉成
 * 暗褐色板（0.8.2 的 0.025 只适用专用墙面着色器那条路，见文件头注释）。
 *
 * 但它也不能高：自发光是**均匀**铺满整面的底色，射灯直射只覆盖锥形里的一小段。
 * 实测 0.30 时墙面采样点的直射光贡献只占 7%（自发光把光斑洗平，墙看起来永远是一块平板）；
 * 降到 0.15 后直射/自发光接近 1:1，扇形洗墙与筒灯光斑才看得见。再往下墙根会先发黑。
 */
export function wallEmissiveIntensity(warmWood: boolean): number {
  /**
   * 0.15 → 0.11（暖木 0.17 → 0.13）。
   *
   * 自发光是均匀铺满整面的底色：它把「灯照区 / 背光区」直接往同一个亮度上抬。
   * 这一轮把舞台墙面的方向光阴影与朝向补偿补上之后，原来那 0.15 会让新增的明暗
   * 差被垫平（实测墙根先发黑的那个下限在 0.09 附近，0.11 仍在安全区内）。
   * 若后续再调，先看 `docs/analysis/2026-11-04-wall-rendering/` 里的亮/暗比。
   */
  return warmWood ? 0.13 : 0.11
}

/**
 * 「跟随墙体」的实体件（柱体）该用的单层 alpha —— 与墙的**膜厚**等价。
 *
 * 墙体是闭合壳、`side: DoubleSide`、`transparent` 且 `depthWrite: false`
 * （见 `authoring/scene/studio-walls.ts` 的 `buildWallBandMesh`）：同一像素上会先后叠到墙的近面与远面，
 * 所以墙看起来的浓度不是 `wallOpacity` 本身，而是
 *
 *     film = 1 - (1 - wallOpacity)²      // 0.36 → 0.59
 *
 * 柱体是封闭实体，只画正面一层。单层直接用 `wallOpacity`（0.36）会显得比墙**淡**一档，
 * 直接用 1.0 又会显得比墙**浓**一大截（背景越暗越明显）—— 两种都会被看成「配墙了但不是同一个色」。
 * 取等价的膜厚，柱体与墙在任何 `wallOpacity` 下浓度都一致：0% → 0，100% → 实心。
 */
export function wallFilmOpacity(wallOpacity: number): number {
  const clamped = Number.isFinite(wallOpacity) ? Math.min(1, Math.max(0, wallOpacity)) : 1
  return clamped >= 0.999 ? 1 : 1 - (1 - clamped) * (1 - clamped)
}
