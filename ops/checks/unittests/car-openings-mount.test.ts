/**
 * 车辆开合件挂载的单测（`bun test`）。
 *
 * 三个约束错了都只会表现为「门不见了」或「门转错轴」，不会抛异常：
 * 1. 只挑带 `vehicleOpening` 的节点（车身替代件 `body` / `roof` 不能接）；
 * 2. 必须**克隆**而不是搬（模板是共享的，搬走会让第二台车没有门）；
 * 3. 挂上后要把车身的 `(floorId, modelId)` 写进每个可动件（控制器靠它配对）。
 */
// biome-ignore-all lint/suspicious/noExplicitAny: 测试替身刻意用 any 模拟 three 的宽松对象
import { describe, expect, test } from 'bun:test'

import {
  carOpeningsModelType,
  mountCarOpeningParts,
} from '../../../homeos/frontend/src/studio/authoring/items/studio-vehicle-models'

class FakeObject {
  children: FakeObject[] = []
  parent: FakeObject | null = null
  userData: Record<string, any>
  geometry = { disposed: false, dispose() {} }
  constructor(userData: Record<string, any> = {}) {
    this.userData = userData
  }
  add(child: FakeObject) {
    ;(child.parent = this), this.children.push(child)
    return this
  }
  remove(child: FakeObject) {
    const index = this.children.indexOf(child)
    index >= 0 && this.children.splice(index, 1)
    child.parent = null
    return this
  }
  traverse(visit: (node: any) => void) {
    visit(this)
    for (const child of this.children) child.traverse(visit)
  }
  clone(deep = false) {
    const cloned = new FakeObject({ ...this.userData, __cloned: true })
    if (deep) for (const child of this.children) cloned.add(child.clone(true))
    return cloned
  }
}

const carModel = (type = 'smallcar', floorId = 'floor-1', modelId = 'car-1') => {
  const car = new FakeObject({ environmentModelType: type, environmentFloorId: floorId, environmentModelId: modelId })
  return car
}

const openingsScene = () => {
  const scene = new FakeObject()
  scene.add(new FakeObject({ name: 'body' }))
  scene.add(new FakeObject({ name: 'roof' }))
  scene.add(new FakeObject({ vehicleOpening: 'hood', openingAxis: 'x', openingAngle: -1.06 }))
  scene.add(new FakeObject({ vehicleOpening: 'leftFront', openingAxis: 'y', openingAngle: -1.22 }))
  return scene
}

describe('carOpeningsModelType', () => {
  test('只有轿车 / SUV 有开合件', () => {
    expect(carOpeningsModelType('smallcar')).toBe('smallcar-openings')
    expect(carOpeningsModelType('suv')).toBe('suv-openings')
    expect(carOpeningsModelType('scooter')).toBe(null)
    expect(carOpeningsModelType('sofa')).toBe(null)
  })
})

describe('mountCarOpeningParts', () => {
  test('只挂带 vehicleOpening 的节点，车身替代件不接', () => {
    const car = carModel()
    const scene = openingsScene()
    expect(mountCarOpeningParts(car, scene)).toBe(2)
    expect(car.children.map((child) => child.userData.vehicleOpening)).toEqual(['hood', 'leftFront'])
    expect(car.children.some((child) => child.userData.name === 'body')).toBe(false)
  })

  test('克隆而不是搬：模板保持完整', () => {
    const car = carModel()
    const scene = openingsScene()
    mountCarOpeningParts(car, scene)
    // 模板仍有 4 个子节点（body / roof / hood / leftFront）。
    expect(scene.children).toHaveLength(4)
    expect(car.children.every((child) => child.userData.__cloned === true)).toBe(true)
  })

  test('可动件带上车身的 (floorId, modelId, type)', () => {
    const car = carModel('suv', 'floor-2', 'suv-9')
    mountCarOpeningParts(car, openingsScene())
    for (const child of car.children) {
      expect(child.userData.environmentModelType).toBe('suv')
      expect(child.userData.environmentFloorId).toBe('floor-2')
      expect(child.userData.environmentModelId).toBe('suv-9')
    }
  })

  test('重复挂载会先清掉上一批，不会叠出多层门', () => {
    const car = carModel()
    mountCarOpeningParts(car, openingsScene())
    mountCarOpeningParts(car, openingsScene())
    expect(car.children).toHaveLength(2)
    expect(car.userData.hbCarOpeningParts).toHaveLength(2)
  })

  test('没有可用部件时返回 0 且不改动车身', () => {
    const car = carModel()
    expect(mountCarOpeningParts(car, new FakeObject())).toBe(0)
    expect(car.children).toHaveLength(0)
  })

  test('缺少场景或车身时安全返回 0', () => {
    expect(mountCarOpeningParts(carModel(), null)).toBe(0)
    expect(mountCarOpeningParts(null, openingsScene())).toBe(0)
  })
})
