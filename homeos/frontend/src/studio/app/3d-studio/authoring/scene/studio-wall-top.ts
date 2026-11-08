/**
 * 墙顶盖面（wall top）材质。
 *
 * 从 `studio-walls.ts` 拆出来的：那边已经在文件规模棘轮（≥800 行不许再涨）的边上，
 * 而墙顶材质只依赖 `deps` 与 three，跟墙带/墙洞的几何布尔运算没有关系。
 *
 * 选项解算按「一层一个」的函数拆开，而不是全部塞进一个构造函数里 ——
 * 每个 `??` / 三元都是一条分支，堆在一起就过不了前端复杂度棘轮。
 */
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'

import type { WallSurfaceMaterialOptions } from '../types/studio-app-types'
import type { StudioWallsDeps } from './studio-walls'
import { wallEmissiveIntensity, wallFilmOpacity } from '../../materials/studio-wall-finish'

/**
 * 墙面运行时方案是否走 0.8.2 的专用墙面着色器（`?wall-trial=shader`）。
 *
 * 缺省是 `baseline`（物理材质 + 区域烘焙叠加）。专用着色器只吃它自己的环境项和
 * `plan2SurfaceLight`，半球光 / 太阳光 / 射灯一概不读 —— 区域光没烘上的时候，
 * 整面墙就是一块死黑。所以它只作为「对比旧观感」的手动开关保留。
 */
export function isWallTrialShaderEnabled(deps: StudioWallsDeps) {
  return (
    deps.isEmbedStageMode &&
    (new URLSearchParams(window.location.search).get('wall-trial') ?? deps.defaultWallRuntimeProfile)
      .split(',')
      .includes('shader')
  )
}

/**
 * 墙顶半透明膜的浓度 —— 用墙面的**等效膜厚**，不是再乘一个经验系数。
 *
 * 墙面是 `DoubleSide` 的开口壳：同一像素会先后叠到近面与远面，看起来的浓度是
 * `1-(1-a)²`；墙顶盖面是单层平面，只叠一次。以前这里写 `a * 1.08`（暖木 1.65），
 * 在 `wallOpacity = 0.3` 时墙顶 0.32、墙面 0.51 —— **墙顶天生比墙面淡一档**，
 * 俯视时能透过去看见壳内壁，现场就是「墙顶一层薄片 + 重影」。改成同一份
 * `wallFilmOpacity` 后两者浓度一致，暖木也不再需要单独放大。
 */
function resolveFilmOpacity(wallTopOpacity: number) {
  return wallFilmOpacity(wallTopOpacity)
}

/**
 * 墙顶自发光：与墙面**同一份** `wallEmissiveIntensity`（冷色 0.11 / 暖木 0.13）。
 *
 * 原来这里写的是 0.15 / 0.19，比墙身高 36% —— 注释说「与墙面同一档」，数值却不是。
 * 自发光是均匀铺满整面的底色，墙顶又几乎收不到灯（面朝上，区域灯体积的垂直衰减
 * 把它挡在外面），于是俯视时整圈墙顶永远是画面里最亮的一条，把墙身压成灰边。
 */
function resolveEmissiveIntensity(wallTopOptions: WallSurfaceMaterialOptions, warmWood: boolean) {
  if (wallTopOptions.emissiveIntensity) return wallTopOptions.emissiveIntensity * 0.3
  return wallEmissiveIntensity(warmWood)
}

/** 深度 / 多边形偏移：不透明时按标准深度写入，半透明时只写更近的片元并轻微偏移。 */
function resolveDepthSettings(wallTopOptions: WallSurfaceMaterialOptions, isWallTopOpaque: boolean) {
  const depthFunc = isWallTopOpaque ? ns2.LessEqualDepth : ns2.LessDepth
  return {
    depthWrite: wallTopOptions.depthWrite ?? isWallTopOpaque,
    depthFunc: wallTopOptions.depthFunc ?? depthFunc,
    polygonOffset: wallTopOptions.polygonOffset === true,
    polygonOffsetFactor: wallTopOptions.polygonOffsetFactor ?? -2,
    polygonOffsetUnits: wallTopOptions.polygonOffsetUnits ?? -4,
  }
}

export function createWallTopMaterial(
  deps: StudioWallsDeps,
  wallTopBaseColor: number,
  wallTopOpacity: number,
  wallTopOptions: WallSurfaceMaterialOptions = {},
) {
  const isPolygonOffset = wallTopOptions.polygonOffset === true,
    warmWood = deps.backgroundSettings().warmWood && !isPolygonOffset,
    isWallTopOpaque = wallTopOpacity >= 0.999,
    wallTopTint = new ns2.Color(wallTopOptions.topColor ?? wallTopBaseColor)
  if (isWallTrialShaderEnabled(deps) && !isPolygonOffset) wallTopTint.multiplyScalar(1.2)
  const wallTopMaterial = new ns2.MeshStandardMaterial({
    ...resolveDepthSettings(wallTopOptions, isWallTopOpaque),
    color: wallTopTint,
    roughness: 0.76,
    metalness: 0,
    transparent: !isWallTopOpaque,
    opacity: wallTopOptions.topOpacity ?? (isWallTopOpaque ? 1 : resolveFilmOpacity(wallTopOpacity)),
    side: ns2.DoubleSide,
    emissive: wallTopOptions.emissive ?? wallTopOptions.topColor ?? wallTopBaseColor,
    // 0.8.2 的 `createWallTopMaterial`：暖木 0.38 / 冷色 0.08，但那一档只对专用墙面
    // 着色器成立。物理材质这条路墙顶要跟侧面 `wallEmissiveIntensity` 齐平：写 0.08 会
    // 比墙面暗一档，俯视时整圈墙像被啃掉边；写回 0.30 又会被均匀底色把灯光洗平。
    emissiveIntensity: resolveEmissiveIntensity(wallTopOptions, warmWood),
  })
  if (!isPolygonOffset) wallTopMaterial.userData.environmentWallTop = true
  return wallTopMaterial
}
