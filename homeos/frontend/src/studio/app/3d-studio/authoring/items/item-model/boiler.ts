/**
 * 物品模型分派族：boiler（取暖壁挂炉，0.8.9 新增）。
 *
 * 为什么**程序化建模**而不是加 GLB：0.8.9 的浴霸/壁挂炉面板都没有引入新资产
 * （`approved-models.js` 里查不到 `heating-boiler`），而这台设备的可见差异只在
 * 「挂墙方箱 + 顶部烟管 + 底部两根水管 + 一个小显示屏」；为它引入一个 GLB 会让
 * `check:model-names` 的三份生成物一起变，收益不成比例。
 *
 * 尺寸口径取上游图例 `0.46 × 0.25m`（宽 × 深），高度按壁挂炉常见规格 0.72m。
 * 卡片上的 `<small>` 也读这一份，避免「卡片写一套、模型是另一套」。
 *
 * 由 `items/studio-item-model.ts` 的 `buildItemModel` 按固定顺序调用；
 * 命中返回 true，否则 false。
 */
import { box, cyl } from '../mesh-shorthand'

import type { ItemModelScope } from './types'

/** 壁挂炉的默认尺寸（米）。卡片文案与模型都读这一份。 */
export const HEATING_BOILER_SIZE = Object.freeze({ width: 0.46, depth: 0.25, height: 0.72 })

export function buildBoiler(scope: ItemModelScope): boolean {
  const { itemModelNode, modelItem, furnitureSoft, furnitureLight, furnitureDark } = scope
  if (modelItem.type !== 'heating-boiler') return false

  const width = Number(modelItem.width) || HEATING_BOILER_SIZE.width
  const depth = Number(modelItem.depth) || HEATING_BOILER_SIZE.depth
  const height = Number(modelItem.height) || HEATING_BOILER_SIZE.height
  const centerY = height * 0.5

  // 机身：圆角方箱。
  box(itemModelNode, [width, height, depth], [0, centerY, 0], furnitureLight, {
    rounded: true,
    roughness: 0.34,
    metalness: 0.08,
  })
  // 前面板：稍小一圈的浅色块，制造「外壳 + 面板」的层次。
  box(
    itemModelNode,
    [width * 0.82, height * 0.72, depth * 0.06],
    [0, centerY + height * 0.04, depth * 0.5],
    furnitureSoft,
    { rounded: true, roughness: 0.28 },
  )
  // 显示屏：偏右上，带微弱自发光（运行时靠它表现「正在制热」）。
  box(
    itemModelNode,
    [width * 0.26, height * 0.12, depth * 0.04],
    [width * 0.26, centerY + height * 0.26, depth * 0.53],
    furnitureDark,
    { rounded: false, roughness: 0.2, emissive: furnitureSoft, emissiveIntensity: 0.22 },
  )
  // 顶部烟管：偏心（真实壁挂炉的烟道不居中）。
  cyl(
    itemModelNode,
    [width * 0.14, height * 0.5, width * 0.14],
    [width * 0.2, height * 0.98, -depth * 0.1],
    furnitureDark,
    { roughness: 0.5 },
  )
  // 底部两根水管：采暖出/回水，间距按机身宽的 1/3。
  for (const offset of [-width / 3, width / 3]) {
    cyl(
      itemModelNode,
      [width * 0.056, height * 0.12, width * 0.056],
      [offset, -height * 0.05, -depth * 0.24],
      furnitureDark,
      { roughness: 0.45 },
    )
  }
  return true
}
