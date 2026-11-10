import { afterEach, expect, test } from 'bun:test'
import { idleRenderPixelRatio } from '../../../../homeos/frontend/src/studio/app/3d-studio/studio-resource-policy.ts'

const original = { location: globalThis.location, devicePixelRatio: globalThis.devicePixelRatio }

function environment(search, devicePixelRatio) {
  globalThis.location = { search }
  globalThis.devicePixelRatio = devicePixelRatio
}

afterEach(() => {
  globalThis.location = original.location
  globalThis.devicePixelRatio = original.devicePixelRatio
})

test('idle pixel ratio follows the device up to 2 and never supersamples past the cap', () => {
  environment('', 2)
  expect(idleRenderPixelRatio(1)).toBe(2)
  expect(idleRenderPixelRatio(1.5)).toBe(2)
  expect(idleRenderPixelRatio(0.5)).toBe(1)
  environment('', 1.5)
  expect(idleRenderPixelRatio(1)).toBe(1.5)
  expect(idleRenderPixelRatio(1.5)).toBe(2)
  environment('', 3)
  expect(idleRenderPixelRatio(1)).toBe(2)
})

test('dpr-cap overrides the limit and legacy restores the old formula', () => {
  environment('?dpr-cap=1.6', 2)
  expect(idleRenderPixelRatio(1)).toBe(1.6)
  expect(idleRenderPixelRatio(1.5)).toBe(1.6)
  environment('?dpr-cap=legacy', 2)
  expect(idleRenderPixelRatio(1)).toBe(1.6)
  expect(idleRenderPixelRatio(1.5)).toBeCloseTo(2.4)
})
