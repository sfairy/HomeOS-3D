/**
 * 车辆「在家/离家」与「开合件」契约的单元测试（`bun test`）。
 *
 * 这几条纯函数错起来**不会抛异常**，只会让车停在原地不动，或者把「没匹配上」当成
 * 「已离家 / 已关闭」而误关门——两者都很难在浏览器里复现。因此把口径钉在这里：
 *
 * 1. 状态值校验：两个键必须齐全、每类 ≤16 个、单个 ≤255 字符、禁换行、去重后个数不变；
 * 2. 读数是**三态**（`true / false / null`），`null` 必须与 `false` 区分开；
 * 3. `haSource` 不一致时直接不可用，避免混用两个来源的设备目录。
 */
import { describe, expect, test } from 'bun:test'

import {
  CAR_OPENING_PARTS,
  CAR_PRESENCE_MAX_STATES,
  CAR_PRESENCE_STATE_LENGTH,
  carOpeningDisplay,
  carOpeningEntities,
  carOpeningMappingError,
  carOpeningReading,
  carPresenceDisplay,
  carPresenceMappingError,
  carPresenceReading,
  supportsCarOpenings,
} from '../../../homeos/frontend/src/studio/runtime/vehicle/vehicle'

const HA = 'ha-1'

const stateOf = (state: string, attributes: Record<string, unknown> = {}) => ({ state, attributes })

describe('CAR_OPENING_PARTS', () => {
  test('六块开合件齐全且顺序固定', () => {
    expect(Object.keys(CAR_OPENING_PARTS)).toEqual(['leftFront', 'leftRear', 'rightFront', 'rightRear', 'hood', 'tail'])
  })

  test('显示名与上游一致', () => {
    expect(CAR_OPENING_PARTS.leftFront).toBe('左前门')
    expect(CAR_OPENING_PARTS.leftRear).toBe('左后门')
    expect(CAR_OPENING_PARTS.rightFront).toBe('右前门')
    expect(CAR_OPENING_PARTS.rightRear).toBe('右后门')
    expect(CAR_OPENING_PARTS.hood).toBe('前备箱')
    expect(CAR_OPENING_PARTS.tail).toBe('后备箱')
  })

  test('只有轿车与 SUV 支持开合', () => {
    expect(supportsCarOpenings('smallcar')).toBe(true)
    expect(supportsCarOpenings('suv')).toBe(true)
    expect(supportsCarOpenings('scooter')).toBe(false)
    expect(supportsCarOpenings(undefined)).toBe(false)
  })
})

describe('carPresenceMappingError', () => {
  test('两项都未配置 = 不启用，返回空串', () => {
    expect(carPresenceMappingError({})).toBe('')
  })

  test('实体 id 非法时报实体错误', () => {
    expect(carPresenceMappingError({ presenceEntityId: 'not-an-entity' })).toBe('请选择有效的车辆在家 / 离家实体。')
    expect(carPresenceMappingError({ presenceEntityId: 'person.' + 'x'.repeat(300) })).toBe(
      '请选择有效的车辆在家 / 离家实体。',
    )
  })

  test('缺一个键或不是数组时报状态值错误', () => {
    expect(carPresenceMappingError({ presenceEntityId: 'person.a', presenceStates: { home: ['在家'] } })).toBe(
      '请填写有效的状态值，每行一个。未知和不可用状态不能用于判断。',
    )
    expect(
      carPresenceMappingError({
        presenceEntityId: 'person.a',
        presenceStates: { home: '在家', away: ['离家'] },
      }),
    ).toBe('请填写有效的状态值，每行一个。未知和不可用状态不能用于判断。')
  })

  test(`每类最多 ${CAR_PRESENCE_MAX_STATES} 个状态值`, () => {
    const tooMany = Array.from({ length: CAR_PRESENCE_MAX_STATES + 1 }, (_unused, index) => 'h' + index)
    expect(
      carPresenceMappingError({ presenceEntityId: 'person.a', presenceStates: { home: tooMany, away: ['离家'] } }),
    ).toBe(`车辆在家 / 离家各可填写最多 ${CAR_PRESENCE_MAX_STATES} 个状态值。`)
  })

  test(`单个状态值不超过 ${CAR_PRESENCE_STATE_LENGTH} 字符，且禁换行`, () => {
    expect(
      carPresenceMappingError({
        presenceEntityId: 'person.a',
        presenceStates: { home: ['x'.repeat(CAR_PRESENCE_STATE_LENGTH + 1)], away: ['离家'] },
      }),
    ).toBe('请填写有效的状态值，每行一个。未知和不可用状态不能用于判断。')
    expect(
      carPresenceMappingError({ presenceEntityId: 'person.a', presenceStates: { home: ['在\n家'], away: ['离家'] } }),
    ).toBe('请填写有效的状态值，每行一个。未知和不可用状态不能用于判断。')
  })

  test('trim 后重复要报错', () => {
    expect(
      carPresenceMappingError({
        presenceEntityId: 'person.a',
        presenceStates: { home: ['在家', ' 在家 '], away: ['离家'] },
      }),
    ).toBe('车辆在家 / 离家的状态值不能重复。')
  })

  test('合法配置返回空串', () => {
    expect(
      carPresenceMappingError({ presenceEntityId: 'person.a', presenceStates: { home: ['在家'], away: ['离家'] } }),
    ).toBe('')
  })
})

describe('carOpeningMappingError', () => {
  test('实体非法时报开合错误', () => {
    expect(carOpeningMappingError({ openingEntityId: 'bad' })).toBe('请选择有效的车辆开合状态实体。')
  })

  test('缺键报状态值错误，重复报重复', () => {
    expect(carOpeningMappingError({ openingEntityId: 'binary_sensor.d', states: { open: ['on'] } })).toBe(
      '请填写有效的状态值，每行一个。未知和不可用状态不能用于判断。',
    )
    expect(
      carOpeningMappingError({ openingEntityId: 'binary_sensor.d', states: { open: ['on', ' on'], closed: ['off'] } }),
    ).toBe('车辆开合状态的状态值不能重复。')
  })
})

describe('carPresenceReading', () => {
  test('binary_sensor presence 自动识别 on / off', () => {
    const car = { presenceEntityId: 'binary_sensor.car_presence' }
    expect(
      carPresenceReading(car, { 'binary_sensor.car_presence': stateOf('on', { device_class: 'presence' }) }, HA).home,
    ).toBe(true)
    expect(
      carPresenceReading(car, { 'binary_sensor.car_presence': stateOf('off', { device_class: 'presence' }) }, HA).home,
    ).toBe(false)
  })

  test('device_tracker 的 home / not_home 自动识别，并带出显示文字', () => {
    const car = { presenceEntityId: 'device_tracker.car' }
    const reading = carPresenceReading(car, { 'device_tracker.car': stateOf('home') }, HA)
    expect(reading.home).toBe(true)
    expect(reading.display).toBe('在家')
    expect(carPresenceReading(car, { 'device_tracker.car': stateOf('not_home') }, HA).home).toBe(false)
  })

  test('手填状态值优先于自动识别', () => {
    const car = {
      presenceEntityId: 'input_select.car',
      presenceStates: { home: ['进库'], away: ['出库'] },
    }
    expect(carPresenceReading(car, { 'input_select.car': stateOf('进库') }, HA).home).toBe(true)
    expect(carPresenceReading(car, { 'input_select.car': stateOf('出库') }, HA).home).toBe(false)
    expect(carPresenceReading(car, { 'input_select.car': stateOf('其他') }, HA).home).toBe(null)
  })

  test('实体不可用 / unknown 时返回 null 而不是 false', () => {
    const car = { presenceEntityId: 'person.a' }
    expect(carPresenceReading(car, { 'person.a': stateOf('unknown') }, HA).home).toBe(null)
    expect(carPresenceReading(car, { 'person.a': { state: 'home', available: false } }, HA).home).toBe(null)
  })

  test('haSource 不一致直接不可用', () => {
    const car = { presenceEntityId: 'person.a' }
    const reading = carPresenceReading(car, { 'person.a': { ...stateOf('home'), haSource: 'ha-2' } }, HA)
    expect(reading.available).toBe(false)
    expect(reading.home).toBe(null)
    expect(reading.raw).toBe('')
  })

  test('调用方不掌握来源（空串）时不做来源比对', () => {
    const car = { presenceEntityId: 'person.a' }
    // 实体自带来源、调用方未知 → 照常读数。
    expect(carPresenceReading(car, { 'person.a': { ...stateOf('home'), haSource: 'ha-9' } }, '').home).toBe(true)
  })

  test('映射有错时不动作', () => {
    const car = { presenceEntityId: 'person.a', presenceStates: { home: 'oops', away: ['离家'] } }
    expect(carPresenceReading(car, { 'person.a': stateOf('home') }, HA).home).toBe(null)
  })
})

describe('carOpeningReading', () => {
  test('binary_sensor door 自动识别 on / off', () => {
    const opening = { openingEntityId: 'binary_sensor.door' }
    const open = carOpeningReading(opening, { 'binary_sensor.door': stateOf('on', { device_class: 'door' }) }, HA)
    expect(open.open).toBe(true)
    expect(open.display).toBe('打开')
    expect(
      carOpeningReading(opening, { 'binary_sensor.door': stateOf('off', { device_class: 'door' }) }, HA).open,
    ).toBe(false)
  })

  test('非开合语义的 device_class 不自动识别', () => {
    const opening = { openingEntityId: 'binary_sensor.motion' }
    expect(
      carOpeningReading(opening, { 'binary_sensor.motion': stateOf('on', { device_class: 'motion' }) }, HA).open,
    ).toBe(null)
  })

  test('手填状态值与未匹配', () => {
    const opening = { openingEntityId: 'sensor.tailgate', states: { open: ['up'], closed: ['down'] } }
    expect(carOpeningReading(opening, { 'sensor.tailgate': stateOf('up') }, HA).open).toBe(true)
    expect(carOpeningReading(opening, { 'sensor.tailgate': stateOf('down') }, HA).open).toBe(false)
    expect(carOpeningReading(opening, { 'sensor.tailgate': stateOf('half') }, HA).open).toBe(null)
  })
})

describe('carOpeningEntities', () => {
  test('只收集实体合法且已绑定的开合实体；缺 states 属自动识别，仍计入', () => {
    const car = {
      openings: {
        leftFront: { openingEntityId: 'binary_sensor.lf', states: { open: ['on'], closed: ['off'] } },
        tail: { openingEntityId: 'binary_sensor.tail' }, // 缺 states → 自动识别，合法
        hood: { openingEntityId: 'bad' }, // 实体 id 非法 → 不计入
      },
    }
    expect(carOpeningEntities(car)).toEqual(['binary_sensor.lf', 'binary_sensor.tail'])
  })
})

describe('显示文字', () => {
  test('carPresenceDisplay 只对 presence 类给出标签', () => {
    expect(carPresenceDisplay('binary_sensor.p', stateOf('on', { device_class: 'presence' }))).toEqual([
      '在家',
      '在家里',
      'Home',
    ])
    expect(carPresenceDisplay('binary_sensor.m', stateOf('on', { device_class: 'motion' }))).toEqual([])
  })

  test('carOpeningDisplay 只对开合类给出标签', () => {
    expect(carOpeningDisplay('binary_sensor.d', stateOf('on', { device_class: 'garage_door' }))).toEqual([
      '打开',
      '已打开',
      '开启',
      '已开启',
    ])
    expect(carOpeningDisplay('binary_sensor.t', stateOf('on', { device_class: 'temperature' }))).toEqual([])
  })
})
