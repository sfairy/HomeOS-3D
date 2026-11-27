/**
 * 窗侧绑定提示（0.8.9 `windowBindingHint`）与推拉窗旧扇 id 的单测。
 *
 * 为什么值得单独测：这条提示是「同一扇窗只允许一个动画来源」的唯一守卫 ——
 * 提示错了用户会在开窗器和窗磁两侧各配一次，运行期两个来源抢同一扇窗，
 * 表现是窗户「抖动」或动画永远不到位，现场极难定位。
 */
import { describe, expect, test } from 'bun:test'

import {
  windowBindingHint,
  windowModelIdSet,
} from '../../../homeos/frontend/src/studio/app/shared/scene/window/window-models'

const slidingGroup = {
  modelId: 'window:w1:group',
  legacyModels: [{ modelId: 'window:w1:p1' }, { modelId: 'window:w1:p2' }],
}

describe('windowModelIdSet', () => {
  test('整组 id + 旧扇 id 都算同一扇窗', () => {
    expect([...windowModelIdSet(slidingGroup)].sort()).toEqual(['window:w1:group', 'window:w1:p1', 'window:w1:p2'])
  })

  test('普通平开窗只有自身 id', () => {
    expect([...windowModelIdSet({ modelId: 'window:w2:sash' })]).toEqual(['window:w2:sash'])
  })
})

describe('windowBindingHint', () => {
  test('非窗类设备不提示', () => {
    expect(windowBindingHint(slidingGroup, 'f1', 'cover', null)).toBe('')
    expect(windowBindingHint(null, 'f1', 'window', null)).toBe('')
  })

  test('开窗器侧：对面配了窗磁 → 已配安防窗户传感器', () => {
    const properties = {
      security: { windows: [{ floorId: 'f1', modelId: 'window:w1:p1', doorEntityId: 'binary_sensor.win' }] },
    }
    expect(windowBindingHint(slidingGroup, 'f1', 'window-opener', properties)).toBe('已配安防窗户传感器')
  })

  test('窗磁侧：对面配了开窗器 → 已配开窗器', () => {
    const properties = {
      environment: { windowOpeners: [{ floorId: 'f1', modelId: 'window:w1:group', entityId: 'cover.opener' }] },
    }
    expect(windowBindingHint(slidingGroup, 'f1', 'window', properties)).toBe('已配开窗器')
  })

  test('只认本层：别的楼层的同号模型不算', () => {
    const properties = {
      security: { windows: [{ floorId: 'f2', modelId: 'window:w1:group', doorEntityId: 'binary_sensor.other' }] },
    }
    expect(windowBindingHint(slidingGroup, 'f1', 'window-opener', properties)).toBe('')
  })

  test('只配了模型没绑实体不算「已配」', () => {
    const properties = { security: { windows: [{ floorId: 'f1', modelId: 'window:w1:group' }] } }
    expect(windowBindingHint(slidingGroup, 'f1', 'window-opener', properties)).toBe('')
  })
})
