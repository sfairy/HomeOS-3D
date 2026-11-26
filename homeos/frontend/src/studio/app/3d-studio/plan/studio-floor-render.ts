/**
 * 地面分区 / 铺面色档 / 地暖盘管的**渲染规格**（0.8.9）。
 *
 * 三块计算此前各自到位但没人调用（`studio-floor-regions` / `studio-floor-finish` /
 * `studio-underfloor-heating` 只有单测引用）。本模块把它们组装成 three 能直接用的
 * 「一张分区一张板 + 一条盘管一组折线」，并保持**纯函数**边界：
 *
 * - 输入是楼层记录（文档数据）与 `toWorld` 映射，输出是数值/环，不 new 任何 three 对象；
 * - 于是「切了铺面但颜色没变」「盘管越出墙外」这两类错都能在 node 里断言。
 *
 * ## 为什么一块分区一张板
 *
 * 单张大板只能用一种材质。要让「客厅木地板 + 卫生间瓷砖」同时成立，只能按分区拆板。
 * 拆板后**必须隐藏原来的整板**（`regionReceiverKind === 'floor'` 的那张），
 * 否则两张面共面会 z-fighting，表现为地面闪烁。
 *
 * ## 盘管的显示条件
 *
 * 上游公告是「壁挂炉制热时可显示本层盘管」。本仓编辑器里没有 HA 实时状态，
 * 因此用**楼层上的显式开关** `underfloorHeating`（检查器可勾选）代替：
 * 它既是编辑时的预览，也能被运行态按锅炉状态改写 —— 语义一致，且不需要在渲染层
 * 猜设备状态。
 */

import {
  floorFinishToneKind,
  floorMaterialParams,
  floorToneForFinish,
  type FloorMaterialParams,
} from './studio-floor-finish'
import {
  normalizeFloorRegions,
  normalizeFloorTones,
  type FloorFinish,
  type FloorPoint,
  type FloorRegion,
} from './studio-floor-regions'
import { buildUnderfloorHeatingPaths } from '../authoring/scene/studio-underfloor-heating'

/** 一个分区最终要画的板。 */
export type FloorRegionPlate = {
  outline: FloorPoint[]
  holes: FloorPoint[][]
  /** 该分区实际使用的材质参数（明度/粗糙度/贴图键）。 */
  params: FloorMaterialParams
  /** 铺面类型，供渲染层挑贴图。 */
  finish: FloorFinish
}

/** 楼层记录里本模块用到的字段（避免把整份 appCtx 类型拖进来）。 */
export type FloorRenderRecord = {
  floorRegions?: unknown
  floorFinishTones?: unknown
  underfloorHeating?: unknown
}

/**
 * 解析出要画的板。
 *
 * 返回 `null` 表示「这一层没有手工分区」—— 调用方应保留原来的整板，
 * 而不是画一堆空板（空板 = 地面消失）。
 */
export function resolveFloorRegionPlates(
  floorRecord: FloorRenderRecord | null | undefined,
  sceneStyle = 'default',
): FloorRegionPlate[] | null {
  const regions = normalizeFloorRegions(floorRecord?.floorRegions)
  if (regions.length === 0) return null
  const tones = normalizeFloorTones(floorRecord?.floorFinishTones)
  return regions.map((region) => {
    const tone = floorToneForFinish(tones, region.finish, sceneStyle)
    return {
      outline: region.outline,
      holes: region.holes,
      finish: region.finish,
      params: floorMaterialParams(region.finish, tone, sceneStyle),
    }
  })
}

/**
 * 色档是否会让同一 `toneKind` 的分区一起变 —— 供 UI 提示「本层一起调整」。
 *
 * 与 `floorFinishToneKind` 同口径：`theme` 铺面跟随场景风格落的那个档。
 */
export function sharedToneKindFor(plates: readonly FloorRegionPlate[], sceneStyle = 'default'): string[] {
  const kinds = new Set<string>()
  for (const plate of plates) kinds.add(floorFinishToneKind(plate.finish, sceneStyle))
  return [...kinds]
}

/** 盘管的一条折线（世界坐标，米）。 */
export type HeatingPolyline = { points: Array<{ x: number; z: number }> }

/**
 * 盘管折线：每个分区一段蛇形，转到世界坐标。
 *
 * 与分区板共用同一份 `floorRegions`，所以「切分区域后盘管自动跟着分成两套」，
 * 不需要额外同步逻辑。
 */
export function resolveHeatingPolylines(
  floorRecord: FloorRenderRecord | null | undefined,
  toWorld: (point: FloorPoint) => { x: number; z: number },
): HeatingPolyline[] {
  const regions = normalizeFloorRegions(floorRecord?.floorRegions)
  if (regions.length === 0) return []
  const segments = buildUnderfloorHeatingPaths(regions as readonly Pick<FloorRegion, 'outline'>[])
  return segments.map((segment) => ({
    points: [toWorld(segment.from), toWorld(segment.to)],
  }))
}

/**
 * 这一层是否该画盘管。
 *
 * 三个条件缺一不可：楼层开关打开、有分区、盘管段数为正（区域太小铺不下时为空）。
 */
export function shouldRenderHeating(floorRecord: FloorRenderRecord | null | undefined, polylineCount: number): boolean {
  return floorRecord?.underfloorHeating === true && polylineCount > 0
}
