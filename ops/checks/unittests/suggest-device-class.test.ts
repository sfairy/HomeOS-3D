/**
 * 占位符 → 建议 device_class 的单元测试（`bun test`）。
 *
 * 这份判据此前在 `entity-input.internals.ts` 与 `useEntityMultiSelect.ts` 各写了一遍
 * （后者是前者的子集），同一个 placeholder 在两处可能给出不同结论。收敛到
 * `shared/entity/utils/suggest-device-class.util.ts` 之后，用这里的用例把口径钉住。
 */
import { describe, expect, test } from 'bun:test'

import { inferSuggestDeviceClassFromPlaceholder } from '../../../homeos/frontend/src/shared/entity/utils/suggest-device-class.util'

describe('inferSuggestDeviceClassFromPlaceholder', () => {
  test('英文 token 命中', () => {
    expect(inferSuggestDeviceClassFromPlaceholder('选择 temperature 传感器')).toBe('temperature')
    expect(inferSuggestDeviceClassFromPlaceholder('选择humidity')).toBe('humidity')
    expect(inferSuggestDeviceClassFromPlaceholder('pm2.5 传感器')).toBe('pm25')
    expect(inferSuggestDeviceClassFromPlaceholder('co2 浓度')).toBe('carbon_dioxide')
  })

  test('中文别名命中', () => {
    expect(inferSuggestDeviceClassFromPlaceholder('选择温度传感器')).toBe('temperature')
    expect(inferSuggestDeviceClassFromPlaceholder('选择烟雾传感器')).toBe('smoke')
    expect(inferSuggestDeviceClassFromPlaceholder('选择人体存在传感器')).toBe('occupancy')
    expect(inferSuggestDeviceClassFromPlaceholder('选择一氧化碳传感器')).toBe('carbon_monoxide')
  })

  test('短英文缩写按词边界匹配，不误伤更长单词', () => {
    // 旧实现用 includes('co')，comfort / cool 会被判成一氧化碳。
    expect(inferSuggestDeviceClassFromPlaceholder('comfort level')).toBe('')
    expect(inferSuggestDeviceClassFromPlaceholder('cool mode')).toBe('')
    expect(inferSuggestDeviceClassFromPlaceholder('CO 浓度')).toBe('carbon_monoxide')
  })

  test('燃气与一氧化碳互不误判', () => {
    expect(inferSuggestDeviceClassFromPlaceholder('燃气泄漏传感器')).toBe('gas')
    expect(inferSuggestDeviceClassFromPlaceholder('甲烷传感器')).toBe('gas')
  })

  test('认不出来返回空串，不猜', () => {
    expect(inferSuggestDeviceClassFromPlaceholder('')).toBe('')
    expect(inferSuggestDeviceClassFromPlaceholder('选择实体')).toBe('')
  })
})
