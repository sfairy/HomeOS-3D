/**
 * 自然木语覆盖集的单测（0.9.0 扩 17 款）。
 *
 * 覆盖集决定「这款模型要不要套木纹饰面」。漏一款的表现是**同屋木色家具里夹一件原厂色**
 * ——不会报错，只是看起来没做完。
 */
import { describe, expect, test } from 'bun:test'

import { naturalWoodModelCoverage } from '../../../homeos/frontend/src/studio/authoring/materials/natural-wood/natural-wood-materials'

/** 0.9.0 新增到配方表的模型。 */
const ADDED_IN_090 = [
  'aroma-diffuser',
  'ceiling-fan',
  'coat-rack',
  'decor-small-plant',
  'dual-monitors',
  'electric-fireplace',
  'exhaust-fan',
  'flower-anthurium',
  'flower-hydrangea',
  'folding-screen',
  'full-length-mirror',
  'projection-screen',
  'shoe-bench',
  'switch-console',
  'umbrella-stand',
  'xbox-series-x',
]

describe('naturalWoodModelCoverage', () => {
  test('0.9.0 新增模型全部纳入', () => {
    for (const itemType of ADDED_IN_090) expect(naturalWoodModelCoverage(itemType)).toBe(true)
  })

  test('0.8.9 已有的家具仍然覆盖（不回退）', () => {
    for (const itemType of ['sofa', 'bed', 'wardrobe', 'chair', 'tea-table-set', 'tvstand'])
      expect(naturalWoodModelCoverage(itemType)).toBe(true)
  })

  test('植物 / 花卉按前缀覆盖，不需要逐条登记', () => {
    expect(naturalWoodModelCoverage('plant-monstera')).toBe(true)
    expect(naturalWoodModelCoverage('flower-hydrangea')).toBe(true)
  })

  test('无关模型不受影响', () => {
    for (const itemType of ['smallcar', 'suv', 'washer', 'robotvacuum', 'bathtub'])
      expect(naturalWoodModelCoverage(itemType)).toBe(false)
  })
})
