import { expect, test } from 'bun:test'
import { readTexturePixels } from '../../../../homeos/frontend/src/studio/app/3d-studio/render-kit/fullscreen-copy.ts'

function fakeThree(counters) {
  class Disposable {
    dispose() {
      counters.disposed++
    }
  }
  return {
    ShaderMaterial: class extends Disposable {
      constructor(options) {
        super()
        counters.materials++
        this.uniforms = options.uniforms
        this.fragmentShader = options.fragmentShader
      }
    },
    Mesh: class {},
    PlaneGeometry: class extends Disposable {},
    Scene: class {
      add() {}
    },
    OrthographicCamera: class {},
    WebGLRenderTarget: class extends Disposable {
      constructor(width, height, options) {
        super()
        counters.targets.push({ width, height, options })
      }
    },
    Vector4: class {},
  }
}

function fakeRenderer(log) {
  const state = { target: 'main', autoClear: true, scissorTest: true }
  return {
    state,
    xr: { enabled: true },
    shadowMap: { enabled: true },
    get autoClear() {
      return state.autoClear
    },
    set autoClear(value) {
      state.autoClear = value
    },
    getRenderTarget: () => state.target,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    getViewport: (v) => v,
    getScissor: (v) => v,
    getScissorTest: () => state.scissorTest,
    setViewport() {},
    setScissor() {},
    setScissorTest(value) {
      state.scissorTest = value
    },
    setRenderTarget(target) {
      state.target = target
    },
    render(scene, camera) {
      log.push({ scene, camera, source: null })
    },
    readRenderTargetPixelsAsync: async (_target, _x, _y, _w, _h, pixels) => {
      pixels[0] = 7
    },
  }
}

test('copy pass is compiled once per renderer and channel; state is restored', async () => {
  const counters = { materials: 0, disposed: 0, targets: [] }
  const three = fakeThree(counters)
  const log = []
  const renderer = fakeRenderer(log)
  const pixels = new Uint8Array(16)
  await readTexturePixels(three, renderer, 'tex-a', { width: 2, height: 2, channel: 'red', pixels })
  await readTexturePixels(three, renderer, 'tex-b', { width: 4, height: 2, channel: 'red', pixels })
  await readTexturePixels(three, renderer, 'tex-c', { width: 2, height: 2, channel: 'rgba', type: 'float', pixels })
  expect(counters.materials).toBe(2)
  expect(counters.targets.map((t) => [t.width, t.height, t.options.type])).toEqual([
    [2, 2, undefined],
    [4, 2, undefined],
    [2, 2, 'float'],
  ])
  expect(counters.disposed).toBe(3)
  expect(pixels[0]).toBe(7)
  expect(renderer.state).toEqual({ target: 'main', autoClear: true, scissorTest: true })
  expect(renderer.xr.enabled && renderer.shadowMap.enabled).toBe(true)
})
