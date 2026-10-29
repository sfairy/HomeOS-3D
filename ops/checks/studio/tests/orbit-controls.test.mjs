/**
 * OrbitControls 包装（0.8.1 B6）的契约。
 *
 * vendor 里没有 rotateSmoothing 这几个字段，直接赋值不生效。这里锁住包装层：
 * 平滑按 dt 消费、阈值丢弃微小残留、damping 帧率无关。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/studio-orbit-controls.ts',
    import.meta.url,
  ),
)
const { createStudioOrbitControls } = await import(moduleUrl)

class FakeOrbitControls {
  constructor(camera, domElement) {
    this.camera = camera
    this.domElement = domElement
    this.dampingFactor = 0.22
    this.theta = 0
    this.phi = 0
    this.dampingSeen = []
    this.disposed = false
    this._rotateLeft = (angle) => {
      this.theta += angle
    }
    this._rotateUp = (angle) => {
      this.phi += angle
    }
    this.update = () => {
      this.dampingSeen.push(this.dampingFactor)
      return true
    }
  }

  dispose() {
    this.disposed = true
  }
}

const domElement = { addEventListener() {}, removeEventListener() {} }

test('平滑：首次 update 只消费部分增量，后续帧继续追', () => {
  const controls = createStudioOrbitControls(FakeOrbitControls, {}, domElement, {
    rotateSmoothing: 8,
    rotateSmoothingThreshold: 0,
    touchDragThreshold: 0,
  })
  controls._rotateLeft(1)
  controls.update(1 / 60)
  const afterFirstFrame = controls.theta
  assert.ok(afterFirstFrame > 0 && afterFirstFrame < 1)
  controls.update(1 / 60)
  assert.ok(controls.theta > afterFirstFrame)
  assert.equal(controls.rotateSmoothing, 8)
})

test('damping 帧率无关：120Hz 两帧的衰减约等于 60Hz 一帧', () => {
  const fast = createStudioOrbitControls(FakeOrbitControls, {}, domElement, {
    rotateSmoothing: 0,
    rotateSmoothingThreshold: 0,
    touchDragThreshold: 0,
  })
  const slow = createStudioOrbitControls(FakeOrbitControls, {}, domElement, {
    rotateSmoothing: 0,
    rotateSmoothingThreshold: 0,
    touchDragThreshold: 0,
  })
  fast.update(1 / 120)
  fast.update(1 / 120)
  slow.update(1 / 60)
  const fastFactor = fast.dampingSeen[1]
  const slowFactor = slow.dampingSeen[0]
  assert.ok(
    Math.abs((1 - fastFactor) ** 2 - (1 - slowFactor)) < 0.0001,
  )
  // 调用后恢复 vendor 的原始值，不污染后续帧。
  assert.equal(fast.dampingFactor, 0.22)
})

test('旋转阈值：小于阈值的残留不会持续推动相机', () => {
  const controls = createStudioOrbitControls(FakeOrbitControls, {}, domElement, {
    rotateSmoothing: 8,
    rotateSmoothingThreshold: 1e-6,
    touchDragThreshold: 0,
  })
  controls._rotateLeft(1e-12)
  controls.update(1 / 60)
  const afterFirst = controls.theta
  controls.update(1 / 60)
  assert.equal(controls.theta, afterFirst)
  assert.equal(controls.rotateSmoothingThreshold, 1e-6)
})
