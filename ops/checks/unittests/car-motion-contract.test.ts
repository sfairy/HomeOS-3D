/**
 * 车辆驶离 / 开合控制器的单测。
 *
 * 用一套极小的 three 替身（`position` / `quaternion` / `rotation` / `traverse`），
 * 这样能直接断言「车停在哪儿、可见不可见、门转到多少弧度」——这三件事在真实场景里
 * 靠肉眼很难分清「是没动」还是「动错了方向」。
 */
// biome-ignore-all lint/suspicious/noExplicitAny: 测试替身刻意用 any 模拟 three 的宽松对象
import { describe, expect, test } from 'bun:test'

import {
  CAR_PRESENCE_AWAY_MS,
  CAR_PRESENCE_HOME_MS,
  carPresenceDistance,
  carPresenceDuration,
  carPresenceEase,
  createCarPresence,
} from '../../../homeos/frontend/src/studio/runtime/vehicle/car-presence'
import {
  CAR_OPENING_DOOR_MS,
  CAR_OPENING_LID_MS,
  carOpeningDuration,
  carOpeningEase,
  createCarOpeningMotion,
} from '../../../homeos/frontend/src/studio/runtime/vehicle/car-openings'

/** 三维向量替身：只实现控制器用到的那几个方法。 */
class FakeVector {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}
  clone() {
    return new FakeVector(this.x, this.y, this.z)
  }
  copy(other: FakeVector) {
    ;(this.x = other.x), (this.y = other.y), (this.z = other.z)
    return this
  }
  set(x: number, y: number, z: number) {
    ;(this.x = x), (this.y = y), (this.z = z)
    return this
  }
  equals(other: FakeVector) {
    return this.x === other.x && this.y === other.y && this.z === other.z
  }
  /** 替身里把「按四元数旋转」简化成绕 Y 轴的 yaw。 */
  applyQuaternion(quaternion: { yaw: number }) {
    const cos = Math.cos(quaternion.yaw),
      sin = Math.sin(quaternion.yaw),
      nextX = this.x * cos + this.z * sin,
      nextZ = -this.x * sin + this.z * cos
    ;(this.x = nextX), (this.z = nextZ)
    return this
  }
  addScaledVector(direction: FakeVector, scale: number) {
    ;(this.x += direction.x * scale), (this.y += direction.y * scale), (this.z += direction.z * scale)
    return this
  }
}

class FakeObject {
  position: FakeVector
  quaternion = { yaw: 0 }
  rotation: { x: number; y: number }
  visible = true
  userData: Record<string, any>
  parent: FakeObject | null = null
  children: FakeObject[] = []
  constructor(userData: Record<string, any> = {}, axis: 'x' | 'y' = 'y') {
    this.userData = userData
    this.position = new FakeVector()
    this.rotation = { x: 0, y: 0 }
    this.axisForTest = axis
  }
  private axisForTest: 'x' | 'y'
  add(child: FakeObject) {
    ;(child.parent = this), this.children.push(child)
    return this
  }
  traverse(visit: (node: any) => void) {
    visit(this)
    for (const child of this.children) child.traverse(visit)
  }
  updateMatrix() {
    this.userData.matrixUpdates = (this.userData.matrixUpdates || 0) + 1
  }
  updateWorldMatrix() {
    this.updateMatrix()
  }
}

const carModel = (floorId = 'floor-1', modelId = 'car-1', type = 'smallcar') => {
  const sceneRoot = new FakeObject()
  const car = new FakeObject({
    environmentModelType: type,
    environmentFloorId: floorId,
    environmentModelId: modelId,
  })
  sceneRoot.add(car)
  return { sceneRoot, car }
}

const carBinding = (overrides: Record<string, any> = {}) => ({
  id: 'car-binding-1',
  floorId: 'floor-1',
  modelId: 'car-1',
  presenceEntityId: 'person.owner',
  ...overrides,
})

const stateStore = (states: Record<string, any>) => {
  const store: Record<string, any> = {}
  for (const [entityId, state] of Object.entries(states)) store[entityId] = { state, available: true, haSource: 'ha-1' }
  return store
}

describe('carPresence 数值口径', () => {
  test('位移 = clamp(车长 × 1.1, 1.2, 6)', () => {
    expect(carPresenceDistance(4.8)).toBeCloseTo(5.28, 6)
    expect(carPresenceDistance(0.5)).toBe(1.2)
    expect(carPresenceDistance(20)).toBe(6)
    expect(carPresenceDistance(null)).toBeCloseTo(4.8 * 1.1, 6)
  })

  test('时长 = (驶离 1350 / 回来 1600) × √|Δ|', () => {
    expect(carPresenceDuration(0, 1)).toBeCloseTo(CAR_PRESENCE_AWAY_MS, 6)
    expect(carPresenceDuration(1, 0)).toBeCloseTo(CAR_PRESENCE_HOME_MS, 6)
    expect(carPresenceDuration(0, 1)).toBeLessThan(carPresenceDuration(1, 0))
  })

  test('缓动两端为 0 / 1，中点为 0.5', () => {
    expect(carPresenceEase(0)).toBe(0)
    expect(carPresenceEase(1)).toBe(1)
    expect(carPresenceEase(0.5)).toBeCloseTo(0.5, 6)
  })
})

describe('createCarPresence', () => {
  const setup = () => {
    const rendered: any[] = []
    const controller = createCarPresence({
      requestFrame: () => {},
      setRenderObjects: (objects) => rendered.push(objects),
      vehicleLength: () => 4.8,
      now: () => 0,
    })
    return { controller, rendered }
  }

  test('首次 sync 直接落位（进页面时不播驶离动画），之后的状态变化才补间', () => {
    const { controller } = setup()
    const { sceneRoot, car } = carModel()
    const home = stateStore({ 'person.owner': 'home' })
    const away = stateStore({ 'person.owner': 'not_home' })
    controller.sync({
      root: sceneRoot,
      bindings: [carBinding()],
      states: home,
      haSource: 'ha-1',
      sceneId: 's1',
      time: 0,
    })
    expect(controller.nextDelay()).toBe(Infinity)
    expect(car.visible).toBe(true)

    // 状态变化 → 开始补间。
    controller.sync({
      root: sceneRoot,
      bindings: [carBinding()],
      states: away,
      haSource: 'ha-1',
      sceneId: 's1',
      time: 10,
    })
    expect(controller.nextDelay()).toBe(0)
    controller.tick(100000)
    // 到位即隐藏，且落到「本位 + 前方 × 位移」。
    expect(car.visible).toBe(false)
    expect(car.position.z).toBeCloseTo(4.8 * 1.1, 5)
    expect(controller.nextDelay()).toBe(Infinity)

    // 返回：补间一开始就逐步变可见（progress 略小于 1 即不再隐藏）。
    controller.sync({
      root: sceneRoot,
      bindings: [carBinding()],
      states: home,
      haSource: 'ha-1',
      sceneId: 's1',
      time: 200000,
    })
    expect(controller.nextDelay()).toBe(0)
    controller.tick(200000 + CAR_PRESENCE_HOME_MS / 2)
    expect(car.visible).toBe(true)
    expect(car.position.z).toBeGreaterThan(0)
    expect(car.position.z).toBeLessThan(4.8 * 1.1)
    controller.tick(400000)
    expect(car.position.z).toBeCloseTo(0, 6)
  })

  test('编辑态直接落位、不补间', () => {
    const { controller } = setup()
    const { sceneRoot, car } = carModel()
    controller.sync({
      root: sceneRoot,
      bindings: [carBinding()],
      states: stateStore({ 'person.owner': 'not_home' }),
      haSource: 'ha-1',
      sceneId: 's1',
      editing: true,
      time: 0,
    })
    // 编辑态：progress 强制 0，车留在原位且可见。
    expect(car.visible).toBe(true)
    expect(controller.nextDelay()).toBe(Infinity)
  })

  test('读数未匹配（null）时保持上次判定，不把车开走', () => {
    const { controller } = setup()
    const { sceneRoot, car } = carModel()
    controller.sync({
      root: sceneRoot,
      bindings: [carBinding()],
      states: stateStore({ 'person.owner': 'home' }),
      haSource: 'ha-1',
      sceneId: 's1',
      time: 0,
    })
    controller.sync({
      root: sceneRoot,
      bindings: [carBinding()],
      states: stateStore({ 'person.owner': 'unknown' }),
      haSource: 'ha-1',
      sceneId: 's1',
      time: 10,
    })
    expect(car.visible).toBe(true)
  })

  test('haSource 变化会重建状态（不沿用旧补间）', () => {
    const { controller } = setup()
    const { sceneRoot } = carModel()
    const home = stateStore({ 'person.owner': 'home' })
    controller.sync({
      root: sceneRoot,
      bindings: [carBinding()],
      states: home,
      haSource: 'ha-1',
      sceneId: 's1',
      time: 0,
    })
    // 换来源：不沿用旧补间，直接按新来源落位（这里仍是 in-home，静止）。
    controller.sync({
      root: sceneRoot,
      bindings: [carBinding()],
      states: home,
      haSource: 'ha-2',
      sceneId: 's1',
      time: 10,
    })
    expect(controller.nextDelay()).toBe(Infinity)
  })

  test('只有 smallcar / suv / scooter 进索引，其它环境模型不动', () => {
    const { controller } = setup()
    const { sceneRoot, car } = carModel()
    const sofa = new FakeObject({
      environmentModelType: 'sofa',
      environmentFloorId: 'floor-1',
      environmentModelId: 'sofa-1',
    })
    sceneRoot.add(sofa)
    controller.sync({
      root: sceneRoot,
      bindings: [carBinding()],
      states: stateStore({ 'person.owner': 'not_home' }),
      haSource: 'ha-1',
      sceneId: 's1',
      time: 0,
    })
    controller.tick(100000)
    expect(car.visible).toBe(false)
    expect(sofa.visible).toBe(true)
    expect(sofa.position.z).toBe(0)
  })

  test('没有配置在家/离家的绑定直接跳过（热路径）', () => {
    const { controller } = setup()
    const { sceneRoot } = carModel()
    expect(
      controller.sync({
        root: sceneRoot,
        bindings: [{ floorId: 'floor-1', modelId: 'car-1' }],
        states: {},
        haSource: 'ha-1',
        sceneId: 's1',
      }),
    ).toBe(false)
    expect(controller.nextDelay()).toBe(Infinity)
  })
})

describe('carOpening 数值口径', () => {
  test('舱盖 730ms、车门 530ms', () => {
    expect(carOpeningDuration('hood')).toBe(CAR_OPENING_LID_MS)
    expect(carOpeningDuration('tail')).toBe(CAR_OPENING_LID_MS)
    for (const doorPart of ['leftFront', 'leftRear', 'rightFront', 'rightRear'])
      expect(carOpeningDuration(doorPart)).toBe(CAR_OPENING_DOOR_MS)
  })

  test('缓动与驶离动画同一曲线', () => {
    expect(carOpeningEase(0)).toBe(0)
    expect(carOpeningEase(1)).toBe(1)
    expect(carOpeningEase(0.5)).toBeCloseTo(0.5, 6)
  })
})

describe('createCarOpeningMotion', () => {
  const setupOpeningsModel = () => {
    const sceneRoot = new FakeObject()
    const openingsRoot = new FakeObject({
      environmentModelType: 'smallcar',
      environmentFloorId: 'floor-1',
      environmentModelId: 'car-1',
    })
    const hood = new FakeObject({ vehicleOpening: 'hood', openingAxis: 'x', openingAngle: -1.064650843716541 }, 'x')
    const leftFront = new FakeObject(
      { vehicleOpening: 'leftFront', openingAxis: 'y', openingAngle: -1.2217304763960306 },
      'y',
    )
    const body = new FakeObject({})
    openingsRoot.add(body).add(hood).add(leftFront)
    sceneRoot.add(openingsRoot)
    return { sceneRoot, hood, leftFront }
  }

  test('打开时按 openingAngle 插值，关闭回到 0', () => {
    const motion = createCarOpeningMotion({ now: () => 0 })
    const { sceneRoot, hood } = setupOpeningsModel()
    const binding = {
      id: 'car-binding-1',
      floorId: 'floor-1',
      modelId: 'car-1',
      openings: { hood: { openingEntityId: 'binary_sensor.hood', states: { open: ['on'], closed: ['off'] } } },
    }
    // 先建立「关闭」基准（首次 sync 直接落位，不补间）。
    motion.sync({
      root: sceneRoot,
      bindings: [binding],
      states: { 'binary_sensor.hood': { state: 'off', available: true, haSource: 'ha-1' } },
      haSource: 'ha-1',
      sceneId: 's1',
      time: 0,
    })
    expect(motion.nextDelay()).toBe(Infinity)

    // 关闭 → 打开：开始补间。
    motion.sync({
      root: sceneRoot,
      bindings: [binding],
      states: { 'binary_sensor.hood': { state: 'on', available: true, haSource: 'ha-1' } },
      haSource: 'ha-1',
      sceneId: 's1',
      time: 10,
    })
    expect(motion.nextDelay()).toBe(0)
    motion.tick(100000)
    expect(hood.rotation.x).toBeCloseTo(-1.064650843716541, 6)
    expect(motion.nextDelay()).toBe(Infinity)

    motion.sync({
      root: sceneRoot,
      bindings: [binding],
      states: { 'binary_sensor.hood': { state: 'off', available: true, haSource: 'ha-1' } },
      haSource: 'ha-1',
      sceneId: 's1',
      time: 200000,
    })
    motion.tick(300000)
    expect(hood.rotation.x).toBe(0)
  })

  test('只有轿车/SUV 的开合件被索引', () => {
    const motion = createCarOpeningMotion({ now: () => 0 })
    const { sceneRoot, hood } = setupOpeningsModel()
    // 把车型改成电瓶车：不应参与开合。
    sceneRoot.children[0]!.userData.environmentModelType = 'scooter'
    motion.sync({
      root: sceneRoot,
      bindings: [
        {
          id: 'car-binding-1',
          floorId: 'floor-1',
          modelId: 'car-1',
          openings: { hood: { openingEntityId: 'binary_sensor.hood', states: { open: ['on'], closed: ['off'] } } },
        },
      ],
      states: { 'binary_sensor.hood': { state: 'on', available: true, haSource: 'ha-1' } },
      haSource: 'ha-1',
      sceneId: 's1',
      time: 0,
    })
    expect(motion.nextDelay()).toBe(Infinity)
    expect(hood.rotation.x).toBe(0)
  })

  test('未配置或配置有错的部件不动作', () => {
    const motion = createCarOpeningMotion({ now: () => 0 })
    const { sceneRoot, hood } = setupOpeningsModel()
    motion.sync({
      root: sceneRoot,
      bindings: [
        {
          id: 'car-binding-1',
          floorId: 'floor-1',
          modelId: 'car-1',
          openings: { hood: { openingEntityId: 'bad-id', states: { open: ['on'], closed: ['off'] } } },
        },
      ],
      states: { 'binary_sensor.hood': { state: 'on', available: true, haSource: 'ha-1' } },
      haSource: 'ha-1',
      sceneId: 's1',
      time: 0,
    })
    expect(hood.rotation.x).toBe(0)
    expect(motion.nextDelay()).toBe(Infinity)
  })

  test('编辑态预览按 parts 直接落位', () => {
    const motion = createCarOpeningMotion({ now: () => 0 })
    const { sceneRoot, leftFront } = setupOpeningsModel()
    motion.sync({
      root: sceneRoot,
      bindings: [{ id: 'car-binding-1', floorId: 'floor-1', modelId: 'car-1' }],
      states: {},
      haSource: 'ha-1',
      sceneId: 's1',
      editing: true,
      preview: { id: 'car-binding-1', parts: { leftFront: true } },
      time: 0,
    })
    expect(leftFront.rotation.y).toBeCloseTo(-1.2217304763960306, 6)
  })
})
