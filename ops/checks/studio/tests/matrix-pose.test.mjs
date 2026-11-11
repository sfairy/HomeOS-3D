import { describe, expect, test } from 'bun:test'
import { createMatrixPoseTracker } from '../../../../homeos/frontend/src/studio/app/shared/util/matrix-pose.ts'
import { urlFlag } from '../../../../homeos/frontend/src/studio/app/3d-studio/render-kit/url-flags.ts'

const matrix = (seed) => ({ elements: Array.from({ length: 16 }, (_, index) => seed + index * 0.125) })

describe('matrix-pose', () => {
  test('version bumps only when elements change', () => {
    const tracker = createMatrixPoseTracker()
    const world = matrix(1)
    const projection = matrix(2)
    expect(tracker.observe(world, projection)).toBe(1)
    expect(tracker.observe(world, projection)).toBe(1)
    world.elements[3] = 9
    expect(tracker.observe(world, projection)).toBe(2)
    expect(tracker.observe(matrix(1), null)).toBe(3)
    expect(tracker.version).toBe(3)
  })

  test('key matches the legacy join format', () => {
    const tracker = createMatrixPoseTracker()
    const world = matrix(0.1)
    const projection = matrix(-3)
    tracker.observe(world, projection)
    expect(tracker.key()).toBe(world.elements.join(',') + projection.elements.join(','))
    tracker.observe(world)
    expect(tracker.key()).toBe(world.elements.join(','))
  })
})

describe('url-flags', () => {
  test('reads flags and tolerates missing location', () => {
    expect(urlFlag('anything')).toBeNull()
  })
})
