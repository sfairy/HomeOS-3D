/**
 * 扫地机地图可用性（0.8.1 `vacuum-map-state`）的契约测试。
 *
 * 这一组判定错了不会抛错，只会让界面停在错误状态：
 *
 * - 标定坏掉却判「可用」→ 地图与机器人的位置对不上，用户看到扫地机在墙里走；
 * - 空地图判「可用」→ 请求回来一张空白图，看起来像加载失败；
 * - `calibration_points: null` 判不可用 → 新装机器在校准生成前永远没有地图。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/app/renderer/vacuum-map-state.ts', import.meta.url),
)
const { vacuumMapAvailable, vacuumMapRequestable } = await import(moduleUrl)

const calibration = (mapPoints, vacuumPoints = mapPoints) => [
  { map: mapPoints[0], vacuum: vacuumPoints[0] },
  { map: mapPoints[1], vacuum: vacuumPoints[1] },
  { map: mapPoints[2], vacuum: vacuumPoints[2] },
]
const triangle = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 0, y: 10 },
]
const stateWith = (attributes, state = 'docked') => ({ entityId: 'image.map', state, attributes })

test('正常状态与标定：可用', () => {
  assert.equal(vacuumMapAvailable(stateWith({ calibration_points: calibration(triangle) })), true)
  // newState 包装（运行态事件）与裸状态等价
  assert.equal(
    vacuumMapAvailable({ newState: stateWith({ calibration_points: calibration(triangle) }) }),
    true,
  )
})

test('unavailable / unknown / 空地图：都不可用', () => {
  assert.equal(vacuumMapAvailable(stateWith({}, 'unavailable')), false)
  assert.equal(vacuumMapAvailable(stateWith({}, 'unknown')), false)
  assert.equal(vacuumMapAvailable(stateWith({ is_empty: true })), false)
  assert.equal(vacuumMapAvailable(stateWith({ empty_map: true })), false)
  // 空地图即使带机器人坐标也不能请求：请求回来一定是空白页。
  assert.equal(
    vacuumMapAvailable(stateWith({ is_empty: true, vacuum_position: { x: 1, y: 2 } })),
    false,
  )
})

test('标定点数不足 / 坐标非有限 / 三点共线：一律判坏', () => {
  assert.equal(vacuumMapAvailable(stateWith({ calibration_points: calibration(triangle).slice(0, 2) })), false)
  assert.equal(vacuumMapAvailable(stateWith({ calibration_points: 'bad' })), false)
  assert.equal(
    vacuumMapAvailable(
      stateWith({
        calibration_points: calibration([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: Number.NaN, y: 5 }]),
      }),
    ),
    false,
  )
  // 共线（行列式 ≈ 0）：地图与机器人坐标无法建立线性映射。
  assert.equal(
    vacuumMapAvailable(
      stateWith({
        calibration_points: calibration([
          { x: 0, y: 0 },
          { x: 5, y: 5 },
          { x: 10, y: 10 },
        ]),
      }),
    ),
    false,
  )
})

test('requestable：calibration_points 为 null 表示「校准还没生成」，仍可请求地图', () => {
  const pendingCalibration = stateWith({ calibration_points: null })
  assert.equal(vacuumMapAvailable(pendingCalibration), false, '用于坐标换算时必须判不可用')
  assert.equal(vacuumMapRequestable(pendingCalibration), true, '地图本身仍可以显示')
  // 其它状态照旧走严格判定
  assert.equal(vacuumMapRequestable(stateWith({ is_empty: true, calibration_points: null })), false)
  assert.equal(vacuumMapRequestable(stateWith({})), true)
})
