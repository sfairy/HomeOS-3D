/**
 * 「墙面」的表面参数 —— 唯一来源。
 *
 * 为什么必须抽出这一份：墙体不是一块「只吃灯光的漆面」。`authoring/scene/studio-walls.ts`
 * 里的墙体同时具备
 * 1. 常规 PBR：`roughness 0.72` / `metalness 0` / `clearcoat 0.05`；
 * 2. **自发光 0.30（暖木 0.32）**：把墙面提亮成「明亮的一整片」，
 *    这样墙在室内曝光下不会被看成灰面；
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
});

/** 墙面的自发光强度（暖木主题略高，与 `createSceneWallSideMaterial` 一致）。 */
export function wallEmissiveIntensity(warmWood: boolean): number {
  return warmWood ? 0.32 : 0.3;
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
  const clamped = Number.isFinite(wallOpacity) ? Math.min(1, Math.max(0, wallOpacity)) : 1;
  return clamped >= 0.999 ? 1 : 1 - (1 - clamped) * (1 - clamped);
}
