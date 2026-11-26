/**
 * 浏览器手势 → 相机的单测（0.8.9）。
 *
 * 这些数学错了不会抛异常，只会让「拖动画布」的方向反了、或者缩放把镜头推进地板。
 * 所以断言的是**方向与夹取**，不是具体坐标：坐标会随视角变化，方向不会。
 */
import { describe, expect, test } from 'bun:test'

import {
  VIEW_CAMERA_MAX_DISTANCE,
  VIEW_CAMERA_MIN_DISTANCE,
  VIEW_CAMERA_MIN_POLAR,
  applyViewGestureIntent,
  cameraDistance,
  panCamera,
  rotateCamera,
  zoomCamera,
} from '../../../homeos/frontend/src/studio/runtime/core/stage/view-camera'

/** 一个「从斜上方看原点」的相机。 */
function orbit() {
  return {
    position: { x: 0, y: 10, z: 10 },
    target: { x: 0, y: 0, z: 0 },
  }
}

describe('距离', () => {
  test('斜上方的距离是斜边', () => {
    expect(cameraDistance(orbit())).toBeCloseTo(Math.hypot(10, 10), 6)
  })
})

describe('rotateCamera', () => {
  test('水平旋转保持距离与高度不变', () => {
    const camera = orbit()
    const before = { distance: cameraDistance(camera), y: camera.position.y }
    rotateCamera(camera, Math.PI / 4, 0)
    expect(cameraDistance(camera)).toBeCloseTo(before.distance, 6)
    expect(camera.position.y).toBeCloseTo(before.y, 6)
  })

  test('转到 180° 后位置回到镜像侧（不是原地不动）', () => {
    const camera = orbit()
    rotateCamera(camera, Math.PI, 0)
    // 起点在 (0,10,10)，绕 Y 转 π 后应落在 z 负侧。
    expect(camera.position.z).toBeLessThan(0)
    expect(Math.abs(camera.position.x)).toBeLessThan(1e-6)
  })

  test('俯仰被夹到地面之上（不会翻到地下）', () => {
    const camera = orbit()
    // 疯狂往下压：仍然必须在目标上方。
    for (let step = 0; step < 40; step += 1) rotateCamera(camera, 0, 0.2)
    expect(camera.position.y).toBeGreaterThan(0)
    const polar = Math.acos(camera.position.y / cameraDistance(camera))
    expect(polar).toBeGreaterThanOrEqual(VIEW_CAMERA_MIN_POLAR - 1e-6)
  })

  test('距离为 0 时不做任何事（无法确定方位角）', () => {
    const degenerate = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }
    expect(rotateCamera(degenerate, 1, 1)).toBe(false)
  })

  test('非有限增量被拒绝', () => {
    expect(rotateCamera(orbit(), Number.NaN, 0)).toBe(false)
  })
})

describe('panCamera', () => {
  test('相机与目标一起移动（相对位置不变）', () => {
    const camera = orbit()
    const offsetBefore = {
      x: camera.position.x - camera.target.x,
      y: camera.position.y - camera.target.y,
      z: camera.position.z - camera.target.z,
    }
    panCamera(camera, 3, 2)
    expect(camera.position.x - camera.target.x).toBeCloseTo(offsetBefore.x, 6)
    expect(camera.position.y - camera.target.y).toBeCloseTo(offsetBefore.y, 6)
    expect(camera.position.z - camera.target.z).toBeCloseTo(offsetBefore.z, 6)
  })

  test('平移只在地面上（高度不变）', () => {
    const camera = orbit()
    const y = camera.position.y
    panCamera(camera, 5, 5)
    expect(camera.position.y).toBeCloseTo(y, 6)
    expect(camera.target.y).toBeCloseTo(0, 6)
  })

  test('向右拖 → 画面沿相机右方向移动（不是沿世界 X）', () => {
    // 相机在 +z 侧看向原点：它的「右」是世界 -x 方向（从相机看出去，右手边是 -x）。
    const camera = orbit()
    panCamera(camera, 1, 0)
    expect(camera.target.x).toBeLessThan(0)
  })

  test('向下拖 → 画布跟随手指下移（镜头沿视线前进）', () => {
    const camera = orbit()
    const zBefore = camera.target.z
    panCamera(camera, 0, 1)
    // 相机在 +z 看向原点：视线方向是 -z。镜头前进会让远处的物体看起来向下移，
    // 正好是「画布跟着手指往下走」。
    expect(camera.target.z).toBeLessThan(zBefore)
  })

  test('相机在正上方（水平距离为 0）时不做任何事', () => {
    const top = { position: { x: 0, y: 10, z: 0 }, target: { x: 0, y: 0, z: 0 } }
    expect(panCamera(top, 1, 1)).toBe(false)
  })
})

describe('zoomCamera', () => {
  test('factor > 1 拉远、< 1 拉近', () => {
    const far = orbit()
    const nearer = orbit()
    zoomCamera(far, 2)
    zoomCamera(nearer, 0.5)
    expect(cameraDistance(far)).toBeGreaterThan(cameraDistance(orbit()))
    expect(cameraDistance(nearer)).toBeLessThan(cameraDistance(orbit()))
  })

  test('夹到最近距离（不会穿进墙体）', () => {
    const camera = orbit()
    for (let step = 0; step < 60; step += 1) zoomCamera(camera, 0.5)
    expect(cameraDistance(camera)).toBeCloseTo(VIEW_CAMERA_MIN_DISTANCE, 6)
  })

  test('夹到最远距离（户型不会缩成一个点）', () => {
    const camera = orbit()
    for (let step = 0; step < 60; step += 1) zoomCamera(camera, 2)
    expect(cameraDistance(camera)).toBeCloseTo(VIEW_CAMERA_MAX_DISTANCE, 6)
  })

  test('已在极限时返回 false（避免无意义重绘）', () => {
    const camera = orbit()
    for (let step = 0; step < 60; step += 1) zoomCamera(camera, 0.5)
    expect(zoomCamera(camera, 0.5)).toBe(false)
  })

  test('非法 factor 被拒绝', () => {
    expect(zoomCamera(orbit(), 0)).toBe(false)
    expect(zoomCamera(orbit(), -1)).toBe(false)
    expect(zoomCamera(orbit(), Number.NaN)).toBe(false)
  })

  test('缩放保持方向（相机仍在同一射线上）', () => {
    const camera = orbit()
    zoomCamera(camera, 0.5)
    expect(camera.position.x).toBeCloseTo(0, 6)
    expect(camera.position.y / camera.position.z).toBeCloseTo(1, 6)
  })
})

describe('applyViewGestureIntent', () => {
  test('按 kind 分派', () => {
    const rotate = orbit()
    applyViewGestureIntent(rotate, { kind: 'rotate', dx: 0.3, dy: 0, scale: 1 })
    expect(rotate.position.z).not.toBeCloseTo(10, 3)

    const pan = orbit()
    applyViewGestureIntent(pan, { kind: 'pan', dx: 2, dy: 0, scale: 1 })
    expect(pan.target.x).not.toBeCloseTo(0, 3)

    const zoom = orbit()
    applyViewGestureIntent(zoom, { kind: 'zoom', dx: 0, dy: 0, scale: 0.5 })
    expect(cameraDistance(zoom)).toBeLessThan(cameraDistance(orbit()))
  })
})
