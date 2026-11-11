/**
 * 地面反射渲染目标的契约：
 * - 运动起止切换清晰度档（256 ↔ 512）时不能整批销毁重建记录（否则卡一拍、倒影消失）；
 * - 贴图短边 = 清晰度档、长边跟随画布宽高比（正方形贴图铺宽屏会横向发糊）；
 * - 受体地面不在主相机视锥内时不做整场景重捕。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// 前端源码用无扩展名的相对导入（交给 Vite 解析），Node 下补上 `.ts`；
// bun（test:studio 的运行器）自己能解析，且没有 registerHooks，只能按需动态导入。
if (!process.versions.bun) {
  const { registerHooks } = await import('node:module')
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('.') && !/\.[mc]?[jt]s$/.test(specifier)) {
        const candidate = new URL(specifier + '.ts', context.parentURL)
        if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context)
      }
      return nextResolve(specifier, context)
    },
  })
}

const frontendRoot = new URL('../../../../homeos/frontend/', import.meta.url)
const THREE = await import(new URL('public/static/vendor/three/0.187.0/three.module.min.js', frontendRoot).href)
const { createGroundReflections } = await import(
  new URL('src/studio/app/3d-studio/reflection/studio-ground-reflections.ts', frontendRoot).href
)

function createStubRenderer({ width = 1920, height = 1080 } = {}) {
  let target = null
  return {
    drawingBuffer: { width, height },
    capabilities: { maxSamples: 4, maxTextureSize: 8192 },
    xr: { enabled: false },
    shadowMap: { autoUpdate: true },
    autoClear: true,
    info: { render: { calls: 1, triangles: 2 }, programs: [] },
    renders: 0,
    getDrawingBufferSize(out) {
      return out.set(this.drawingBuffer.width, this.drawingBuffer.height)
    },
    getRenderTarget: () => target,
    setRenderTarget: (next) => {
      target = next
    },
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    getClearAlpha: () => 1,
    getClearColor: (out) => out,
    setClearColor() {},
    getScissorTest: () => false,
    setScissorTest() {},
    clear() {},
    render() {
      this.renders++
    },
  }
}

function createFixture(options = {}) {
  const scene = new THREE.Scene(),
    root = new THREE.Group(),
    floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial())
  floor.rotation.x = -Math.PI / 2
  floor.userData.regionReceiverKind = 'floor'
  root.add(floor)
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
  box.position.set(0, 0.5, 0)
  root.add(box)
  scene.add(root)
  const camera = new THREE.PerspectiveCamera(50, 1920 / 1080, 0.1, 100)
  camera.position.set(0, 6, 8)
  camera.lookAt(0, 0, 0)
  const renderer = createStubRenderer()
  const reflections = createGroundReflections({
    THREE,
    renderer,
    scene,
    getRoot: () => root,
    syncLighting() {},
    cull: false,
    ...options,
  })
  const renderFrame = () => {
    scene.updateMatrixWorld(true)
    camera.updateMatrixWorld(true)
    reflections.render(camera, { worldMatricesCurrent: true })
  }
  return { scene, root, floor, camera, renderer, reflections, renderFrame }
}

test('贴图短边 = 清晰度档，长边跟随画布宽高比', () => {
  const { reflections, renderFrame } = createFixture()
  reflections.configure({ mode: 'all', resolution: 512, strength: 0.3 })
  renderFrame()
  assert.equal(reflections.records.length, 1)
  const { map } = reflections.records[0]
  assert.equal(map.height, 512)
  assert.equal(map.width, Math.round(512 * (1920 / 1080)))
  assert.ok(reflections.stats.captures >= 1)
})

test('记录贴图只存解析后的颜色：不带 MSAA、不带深度（MSAA 目标全局共用一张）', () => {
  const { reflections, renderFrame, root, scene } = createFixture()
  for (let index = 1; index < 6; index += 1) {
    const extraFloor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial())
    extraFloor.rotation.x = -Math.PI / 2
    extraFloor.position.set(index * 0.5, 0, 0)
    extraFloor.userData.regionReceiverKind = 'floor'
    root.add(extraFloor)
  }
  scene.updateMatrixWorld(true)
  reflections.configure({ mode: 'all', resolution: 768, strength: 0.3 })
  renderFrame()
  assert.equal(reflections.records.length, 6)
  for (const { map } of reflections.records) {
    assert.equal(map.samples, 0)
    assert.equal(map.depthBuffer, false)
  }
})

test('切换清晰度档不销毁记录，捕获时原地 setSize', () => {
  const { reflections, renderFrame } = createFixture()
  reflections.configure({ mode: 'all', resolution: 512, strength: 0.3 })
  renderFrame()
  const [record] = reflections.records,
    { map } = record,
    allocations = reflections.stats.allocations,
    captures = reflections.stats.captures

  reflections.configure({ mode: 'all', resolution: 256, strength: 0.3 })
  renderFrame()
  assert.equal(reflections.records[0], record, '同一条记录')
  assert.equal(record.map, map, '同一个渲染目标')
  assert.equal(record.dead, false)
  assert.equal(reflections.stats.allocations, allocations, '没有重新分配')
  assert.ok(reflections.stats.captures > captures, '新尺寸下重新捕获')
  assert.equal(map.height, 256)
  assert.equal(map.width, Math.round(256 * (1920 / 1080)))
  const uniforms = record.overlay.material.uniforms
  assert.equal(uniforms.smoothTaps.value, 0, '256 档单次采样')
  assert.ok(Math.abs(uniforms.texelSize.value.y - 1 / 256) < 1e-9)
})

test('overlay 按预乘 alpha 输出，不再做 rgb/a 放大', () => {
  const { reflections, renderFrame } = createFixture()
  reflections.configure({ mode: 'all', resolution: 512, strength: 0.3 })
  renderFrame()
  const material = reflections.records[0].overlay.material
  assert.equal(material.premultipliedAlpha, true)
  assert.doesNotMatch(material.fragmentShader, /max\(value\.a,\.001\)/)
  assert.equal(material.uniforms.smoothTaps.value, 1, '512 档开 4 点平滑')
})

test('受体地面离开视锥时不重捕，回到视野后补捕', () => {
  const { reflections, renderFrame, camera } = createFixture()
  reflections.configure({ mode: 'all', resolution: 512, strength: 0.3 })
  renderFrame()
  const captured = reflections.stats.captures

  camera.position.set(0, 6, 8)
  camera.lookAt(0, 12, 40)
  renderFrame()
  assert.equal(reflections.records[0].onScreen, false)
  assert.equal(reflections.stats.captures, captured, '屏幕外不捕获')
  assert.equal(reflections.isPrepared(), true, '屏幕外记录不拖住 isPrepared')

  // 回到与上次捕获不同的位姿（完全相同的位姿下旧纹理仍然有效，不必重捕）。
  camera.lookAt(0.3, 0, 0)
  renderFrame()
  assert.equal(reflections.records[0].onScreen, true)
  assert.ok(reflections.stats.captures > captured, '回到视野后补捕')
})

test('记录数超过每帧预算时轮转一圈后静置：不再续帧、不再重捕', () => {
  let frameRequests = 0
  const { reflections, renderFrame, root, scene } = createFixture({
    maxCapturesPerFrame: 2,
    requestFrame: () => {
      frameRequests += 1
    },
  })
  for (let index = 1; index < 6; index += 1) {
    const extraFloor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial())
    extraFloor.rotation.x = -Math.PI / 2
    extraFloor.position.set(index * 0.5, 0, 0)
    extraFloor.userData.regionReceiverKind = 'floor'
    root.add(extraFloor)
  }
  scene.updateMatrixWorld(true)
  reflections.configure({ mode: 'all', resolution: 512, strength: 0.3 })
  renderFrame()
  assert.equal(reflections.records.length, 6)
  // 先制造一次「相机没动、整批失效」：只能按预算轮转补齐。
  reflections.setVisibleFloor('other')
  reflections.setVisibleFloor(null)
  let frames = 0
  do {
    frameRequests = 0
    renderFrame()
    frames += 1
  } while (frameRequests > 0 && frames < 20)
  assert.ok(frames < 20, `轮转应在有限帧内收敛（实际 ${frames} 帧仍在续帧）`)
  assert.ok(
    reflections.records.every((record) => record.hasCapture),
    '每条记录都已捕获',
  )
  assert.equal(reflections.isPrepared(), true)
  const settledCaptures = reflections.stats.captures
  for (let index = 0; index < 5; index += 1) renderFrame()
  assert.equal(reflections.stats.captures, settledCaptures, '静置帧不重捕')
})

test('关闭反射仍会释放全部记录', () => {
  const { reflections, renderFrame } = createFixture()
  reflections.configure({ mode: 'all', resolution: 512, strength: 0.3 })
  renderFrame()
  const [record] = reflections.records
  reflections.configure({ mode: 'off', resolution: 512, strength: 0.3 })
  assert.equal(record.dead, true)
})
