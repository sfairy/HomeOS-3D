#!/usr/bin/env bun
/**
 * 预览冒烟巡检：逐个 GLB 真实走一遍「下载 → 解析（含 Draco）→ 建场景 → 相机取景 → 画出一帧」，
 * 用像素统计判定「卡片会不会是空白」。
 *
 * 为什么不用工作室页面：336 张 `.asset-card` 需要登录态 + 后端 + 完整 app，回归时跑不动；
 * 而空白预览的真实原因只有四类——HTTP 失败、GLTF 解析失败、Draco 解压失败、场景/包围盒为空。
 * 本脚本用同一批 vendor 的 three.js / GLTFLoader / DRACOLoader 复刻运行期加载链，逐文件给出证据：
 * - `triangles`：几何三角面（0 说明只有空节点，卡片必然全空）；
 * - `bounds`：世界包围盒（空盒会让相机取景退化，画面里什么都不剩）；
 * - `coverage` / `variance`：画出后与背景不同的像素占比与亮度方差（接近 0 = 空白）。
 *
 * lite 是运行期首选变体，所以先测 lite：lite 失败但 full 成功 → 记 `lite-fail-fallback`
 * （运行期会自动回退，但压缩产物坏了必须暴露出来），两个都失败才是真正的空白预览。
 *
 * 用法：
 * ```bash
 * bun ops/checks/studio/preview_smoke.mjs                     # 全库
 * bun ops/checks/studio/preview_smoke.mjs --model sofa,basin # 指定模型
 * bun ops/checks/studio/preview_smoke.mjs --variant full      # 只测完整件
 * bun ops/checks/studio/preview_smoke.mjs --limit 20 --keep    # 试跑，保留 html
 * ```
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { collectModelVariants, listModelFiles, modelsDir } from '../../../homeos/frontend/scripts/models/lib/glb-io.mjs'
import { loadDocument } from '../../../homeos/frontend/scripts/models/lib/model-document.mjs'
import { PNG } from 'pngjs'

const require = createRequire(import.meta.url)
/**
 * 受限沙箱里 `os.cpus()` 会直接抛 ERR_SYSTEM_ERROR，而 playwright 内部在计算 hostPlatform 时
 * 必读 CPU 型号（Apple Silicon 判定）。这里给 `node:os` 的方法补一层兜底，其它信息原样透传。
 */
const os = require('node:os')
const cpus = os.cpus.bind(os)
os.cpus = () => {
  try {
    // bun 的 cpu.model 是懒加载 getter，真实 syscall 在**读属性**时才发生，
    // 所以归一化必须包在同一个 try 里，只包住 cpus() 调用是不够的。
    return cpus().map((cpu) => ({ model: String(cpu.model), speed: Number(cpu.speed) || 0 }))
  } catch {
    return [{ model: 'Apple Silicon', speed: 0 }]
  }
}
const { chromium } = require('playwright-core')

const hereDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(hereDir, '../../..')
const vendorDir = path.join(repoRoot, 'homeos/frontend/public/static/vendor')

const args = process.argv.slice(2)
const valueOf = (name) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

const onlyIds = (valueOf('model')?.split(',') ?? []).map((id) => id.trim()).filter(Boolean)
const variantFilter = valueOf('variant')
const limit = Number(valueOf('limit') ?? 0)
const outDir = path.resolve(repoRoot, valueOf('out') ?? 'docs/architecture/2026-10-23')
const shotDir = path.join(outDir, 'preview-smoke-failures')
const SIZE = 256
/** 背景色与工作室预览一致（深灰）。判定空白时以此为基准做差。 */
const BACKGROUND = [24, 26, 30]

const HARNESS = String.raw`<!doctype html>
<html lang="zh">
<head><meta charset="utf-8"><title>preview smoke</title>
<style>html,body{margin:0;background:#181a1e}canvas{display:block}</style></head>
<body>
<script type="module">
import * as THREE from '/vendor/three/0.186.1/three.module.min.js'
import { GLTFLoader } from '/vendor/three/0.186.1/GLTFLoader.js'
import { DRACOLoader } from '/vendor/three/0.186.1/DRACOLoader.js'

const SIZE = ${SIZE}
const BACKGROUND = ${JSON.stringify(BACKGROUND)}

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, alpha: false })
renderer.setPixelRatio(1)
renderer.setSize(SIZE, SIZE)
renderer.setClearColor(new THREE.Color(BACKGROUND[0] / 255, BACKGROUND[1] / 255, BACKGROUND[2] / 255), 1)
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 2.2))
const key = new THREE.DirectionalLight(0xffffff, 2.0)
key.position.set(2.5, 4, 3)
scene.add(key)
const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 200)

const draco = new DRACOLoader()
draco.setDecoderPath('/vendor/three/0.186.1/draco/')
const loader = new GLTFLoader()
loader.setDRACOLoader(draco)

/** 场景里所有可见网格的三角面数。 */
function countTriangles(root) {
  let triangles = 0
  let meshes = 0
  let visibleMeshes = 0
  root.traverse((node) => {
    if (!node.isMesh || !node.geometry) return
    meshes += 1
    let visible = node.visible
    for (let parent = node.parent; parent; parent = parent.parent) if (!parent.visible) visible = false
    if (!visible) return
    visibleMeshes += 1
    const geometry = node.geometry
    const perInstance = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3
    const instances = node.isInstancedMesh ? node.count : 1
    triangles += perInstance * instances
  })
  return { triangles: Math.round(triangles), meshes, visibleMeshes }
}

/** 把相机放到能完整框住包围盒的位置；空盒/退化盒直接判失败。 */
function frame(root) {
  const box = new THREE.Box3().setFromObject(root)
  if (box.isEmpty()) return { boundsError: 'empty-bounds' }
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  if (![size.x, size.y, size.z, center.x, center.y, center.z].every(Number.isFinite))
    return { boundsError: 'non-finite-bounds' }
  const extent = Math.max(size.x, size.y, size.z)
  if (extent <= 1e-4) return { boundsError: 'degenerate-bounds', extent }
  const radius = size.length() / 2
  const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.15
  const direction = new THREE.Vector3(0.95, 0.62, 1).normalize()
  camera.position.copy(center).addScaledVector(direction, distance)
  camera.near = Math.max(distance / 1000, 0.001)
  camera.far = distance * 4
  camera.lookAt(center)
  camera.updateProjectionMatrix()
  return {
    bounds: { min: box.min.toArray().map((v) => +v.toFixed(4)), max: box.max.toArray().map((v) => +v.toFixed(4)) },
    size: size.toArray().map((v) => +v.toFixed(4)),
  }
}

/** 读回像素：覆盖率（非背景）与亮度方差。全黑/全背景都算空白。 */
function samplePixels() {
  const gl = renderer.getContext()
  const pixels = new Uint8Array(SIZE * SIZE * 4)
  gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  let covered = 0
  let sum = 0
  let sumSq = 0
  let dark = 0
  const total = SIZE * SIZE
  for (let i = 0; i < total; i += 1) {
    const r = pixels[i * 4]
    const g = pixels[i * 4 + 1]
    const b = pixels[i * 4 + 2]
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sum += luminance
    sumSq += luminance * luminance
    if (Math.abs(r - BACKGROUND[0]) + Math.abs(g - BACKGROUND[1]) + Math.abs(b - BACKGROUND[2]) > 24) covered += 1
    if (luminance < 12) dark += 1
  }
  const mean = sum / total
  return {
    coverage: +(covered / total).toFixed(5),
    darkShare: +(dark / total).toFixed(5),
    variance: +(sumSq / total - mean * mean).toFixed(2),
    meanLuminance: +mean.toFixed(2),
  }
}

function dispose(root) {
  root.traverse((node) => {
    node.geometry?.dispose?.()
    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : []
    for (const material of materials) {
      for (const value of Object.values(material)) if (value && value.isTexture) value.dispose()
      material.dispose?.()
    }
  })
}

window.smokeLoad = async (url) => {
  const startedAt = performance.now()
  let root = null
  try {
    const gltf = await loader.loadAsync(url)
    root = gltf.scene
    if (!root) return { ok: false, error: 'gltf.scene 为空（没有默认场景）', ms: +(performance.now() - startedAt).toFixed(0) }
    const counts = countTriangles(root)
    const framed = frame(root)
    if (framed.boundsError) return { ok: false, ...counts, ...framed, error: framed.boundsError, ms: +(performance.now() - startedAt).toFixed(0) }
    scene.add(root)
    renderer.render(scene, camera)
    const pixels = samplePixels()
    scene.remove(root)
    const blank = pixels.coverage < 0.002 || pixels.variance < 1
    return {
      ok: !blank,
      error: blank ? (counts.triangles === 0 ? 'zero-triangles' : 'blank-frame') : null,
      ...counts,
      ...framed,
      ...pixels,
      ms: +(performance.now() - startedAt).toFixed(0),
    }
  } catch (error) {
    return { ok: false, error: String(error?.message || error).slice(0, 300), ms: +(performance.now() - startedAt).toFixed(0) }
  } finally {
    if (root) {
      scene.remove(root)
      dispose(root)
    }
  }
}
window.smokeReady = true
</script>
</body></html>`

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
}

/** 静态服务：`/harness.html` + `/models/*` + `/vendor/*`，不依赖后端与登录态。 */
function startServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const send = (status, body, type = 'text/plain; charset=utf-8') => {
      response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
      response.end(body)
    }
    if (url.pathname === '/' || url.pathname === '/harness.html') return send(200, HARNESS, MIME['.html'])
    const mapToDisk = (prefix, baseDir) => {
      const relative = decodeURIComponent(url.pathname.slice(prefix.length))
      const target = path.resolve(baseDir, relative)
      // 目录穿越防护：解析后必须仍在 baseDir 内。
      if (!target.startsWith(path.resolve(baseDir) + path.sep)) return null
      return target
    }
    const target =
      url.pathname.startsWith('/models/') ? mapToDisk('/models/', modelsDir)
      : url.pathname.startsWith('/vendor/') ? mapToDisk('/vendor/', vendorDir)
      : null
    if (!target) return send(404, 'not found')
    fs.readFile(target, (error, buffer) => {
      if (error) return send(404, 'not found')
      response.writeHead(200, {
        'content-type': MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-store',
        'content-length': buffer.length,
      })
      response.end(buffer)
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

const variants = collectModelVariants(listModelFiles())
let ids = [...variants.keys()].sort()
if (onlyIds.length) ids = ids.filter((id) => onlyIds.includes(id))

/** 待测变体顺序：lite 在前（运行期首选），full 在后（回退）。 */
function variantsOf(entry) {
  const ordered = []
  if (entry.lite && variantFilter !== 'full') ordered.push({ variant: 'lite', file: entry.lite })
  if (entry.full && variantFilter !== 'lite') ordered.push({ variant: 'full', file: entry.full })
  return ordered
}

const jobs = []
for (const id of ids) {
  const entry = variants.get(id)
  const variantsToTest = variantsOf(entry)
  if (!variantsToTest.length) continue
  jobs.push({ id, entry, variantsToTest })
}
const limited = limit > 0 ? jobs.slice(0, limit) : jobs

const engineRequested = valueOf('engine') ?? 'auto' // auto | browser | raster

async function launchBrowser() {
  const attempts = [
    process.env.HOMEOS_BROWSER_CHANNEL,
    'msedge',
    'chrome',
    undefined,
  ].filter((channel, index, list) => channel !== '' && list.indexOf(channel) === index)
  let lastError = null
  for (const channel of attempts) {
    try {
      return await chromium.launch({
        ...(channel ? { channel } : {}),
        headless: true,
        args: [
          '--enable-unsafe-swiftshader',
          '--use-gl=angle',
          '--use-angle=swiftshader',
          '--disable-gpu-sandbox',
          '--no-sandbox',
        ],
      })
    } catch (error) {
      lastError = error
      console.error(`[preview-smoke] 启动 ${channel ?? 'bundled chromium'} 失败：${String(error?.message || error).split('\n')[0]}`)
    }
  }
  throw lastError ?? new Error('没有可用的 Chromium/Edge 浏览器')
}

/**
 * 浏览器引擎：同一份 vendor three.js / GLTFLoader / DRACOLoader，最接近运行期。
 * 解析、贴图解码、材质问题都覆盖得到，是首选。
 */
async function createBrowserEngine() {
  const browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 420, height: 320 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const requestFailures = []
  page.on('requestfailed', (request) => {
    requestFailures.push({ url: request.url().slice(0, 300), error: (request.failure()?.errorText || '').slice(0, 160) })
  })
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300))
  })
  await page.goto(`${baseUrl}/harness.html`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForFunction(() => window.smokeReady === true, null, { timeout: 60000 })
  return {
    name: 'browser',
    note: 'playwright-core + Chromium（headless, SwiftShader），与工作室同一份 vendor three.js / GLTFLoader / DRACOLoader',
    async probe(modelId, variant, file) {
      requestFailures.length = 0
      consoleErrors.length = 0
      const result = await page.evaluate((modelUrl) => window.smokeLoad(modelUrl), `/models/${file}`)
      const row = { variant, file, ...result, httpFailures: [...requestFailures], consoleErrors: [...consoleErrors].slice(0, 3) }
      if (result.ok === false) {
        const target = path.join(shotDir, `${modelId}-${variant}.png`)
        try {
          await page.locator('canvas').screenshot({ path: target, timeout: 10000 })
          row.screenshot = path.relative(repoRoot, target)
        } catch (error) {
          row.screenshotError = String(error).slice(0, 200)
        }
      }
      return row
    },
    async close() {
      await context.close()
      await browser.close()
    },
  }
}

/** 等距视图投影（与 render_glb.mjs 一致的 yaw/pitch），只关心「画面上有没有东西」。 */
function projectIso(point, yaw, pitch) {
  const x = point[0] * Math.cos(yaw) + point[2] * Math.sin(yaw)
  const z = -point[0] * Math.sin(yaw) + point[2] * Math.cos(yaw)
  const y = point[1] * Math.cos(pitch) - z * Math.sin(pitch)
  const depth = point[1] * Math.sin(pitch) + z * Math.cos(pitch)
  return [x, y, depth]
}

/**
 * 软件光栅引擎（无浏览器时的兜底）：gltf-transform 解 Draco + 手写 Z 缓冲光栅化。
 *
 * 覆盖不到 GLTFLoader 层的问题（未知扩展、贴图解码），但「文件能不能解出来、有没有面、
 * 包围盒是否退化、画出来是不是全空」这四件事与浏览器引擎同源，足够判定空白预览。
 */
async function createRasterEngine() {
  return {
    name: 'raster',
    note: `gltf-transform 解 Draco + 软件光栅化（无 WebGL；${SIZE}×${SIZE}，与预览同底色）`,
    async probe(modelId, variant, file) {
      const startedAt = performance.now()
      const absolute = path.join(modelsDir, file)
      let doc = null
      try {
        doc = await loadDocument(absolute, { draco: true })
      } catch (error) {
        return { variant, file, ok: false, error: `解析失败：${String(error?.message || error).slice(0, 240)}`, ms: Math.round(performance.now() - startedAt) }
      }
      try {
        const root = doc.getRoot()
        const materials = root.listMaterials()
        const colors = materials.map((material) => (material.getBaseColorFactor?.() ?? [0.8, 0.8, 0.8, 1]).slice(0, 3))
        const triangles = []
        let meshes = 0
        let visibleMeshes = 0
        let min = [Infinity, Infinity, Infinity]
        let max = [-Infinity, -Infinity, -Infinity]
        for (const node of root.listNodes()) {
          const mesh = node.getMesh()
          if (!mesh) continue
          meshes += 1
          // gltf-transform 没有可见性概念；隐藏件（夹具、灯光代理）在运行期也不画，
          // 这里按名字前缀跳过，避免把「只剩隐藏代理」误判成有内容。
          if (/^(guide|proxy|collision|collider)/i.test(node.getName())) continue
          visibleMeshes += 1
          const matrix = Array.from(node.getWorldMatrix())
          for (const primitive of mesh.listPrimitives()) {
            const position = primitive.getAttribute('POSITION')
            if (!position) continue
            const positions = position.getArray()
            const index = primitive.getIndices()
            const indices = index ? index.getArray() : null
            const material = primitive.getMaterial()
            const slot = material ? materials.indexOf(material) : -1
            const count = indices ? indices.length : positions.length / 3
            const point = (vertex) => {
              const x = positions[vertex * 3]
              const y = positions[vertex * 3 + 1]
              const z = positions[vertex * 3 + 2]
              return [
                matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
                matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
                matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
              ]
            }
            for (let i = 0; i < count; i += 3) {
              const a = indices ? indices[i] : i
              const b = indices ? indices[i + 1] : i + 1
              const c = indices ? indices[i + 2] : i + 2
              const points = [point(a), point(b), point(c)]
              for (const vertex of points) {
                for (let axis = 0; axis < 3; axis += 1) {
                  min[axis] = Math.min(min[axis], vertex[axis])
                  max[axis] = Math.max(max[axis], vertex[axis])
                }
              }
              triangles.push({ points, slot })
            }
          }
        }
        const triangleCount = triangles.length
        if (!triangleCount) {
          return { variant, file, ok: false, error: 'zero-triangles', triangles: 0, meshes, visibleMeshes, ms: Math.round(performance.now() - startedAt) }
        }
        const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
        if (![...min, ...max].every(Number.isFinite) || Math.max(...size) <= 1e-4) {
          return { variant, file, ok: false, error: 'degenerate-bounds', triangles: triangleCount, size, ms: Math.round(performance.now() - startedAt) }
        }

        const yaw = -Math.PI / 4
        const pitch = -0.42
        const projected = triangles.map((triangle) => ({
          slot: triangle.slot,
          points: triangle.points.map((point) => projectIso(point, yaw, pitch)),
        }))
        let spanMinX = Infinity
        let spanMaxX = -Infinity
        let spanMinY = Infinity
        let spanMaxY = -Infinity
        for (const triangle of projected) {
          for (const point of triangle.points) {
            spanMinX = Math.min(spanMinX, point[0])
            spanMaxX = Math.max(spanMaxX, point[0])
            spanMinY = Math.min(spanMinY, point[1])
            spanMaxY = Math.max(spanMaxY, point[1])
          }
        }
        const scale = (SIZE * 0.9) / Math.max(1e-6, spanMaxX - spanMinX, spanMaxY - spanMinY)
        const offsetX = SIZE / 2 - ((spanMinX + spanMaxX) / 2) * scale
        const offsetY = SIZE / 2 + ((spanMinY + spanMaxY) / 2) * scale
        const pixels = Buffer.alloc(SIZE * SIZE * 4)
        for (let i = 0; i < SIZE * SIZE; i += 1) {
          pixels[i * 4] = BACKGROUND[0]
          pixels[i * 4 + 1] = BACKGROUND[1]
          pixels[i * 4 + 2] = BACKGROUND[2]
          pixels[i * 4 + 3] = 255
        }
        const depth = new Float32Array(SIZE * SIZE).fill(-Infinity)
        const light = [0.35, 0.82, 0.45]
        const lightLength = Math.hypot(...light)
        for (const triangle of projected) {
          const [p0, p1, p2] = triangle.points.map((point) => [
            point[0] * scale + offsetX,
            offsetY - point[1] * scale,
            point[2],
          ])
          const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1])
          if (Math.abs(area) < 1e-9) continue
          const minPX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])))
          const maxPX = Math.min(SIZE - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])))
          const minPY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])))
          const maxPY = Math.min(SIZE - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])))
          if (minPX > maxPX || minPY > maxPY) continue
          const base = (colors[triangle.slot] ?? [0.8, 0.8, 0.8]).map((value) => Math.min(255, Math.round(Math.min(1, value) * 255)))
          for (let py = minPY; py <= maxPY; py += 1) {
            for (let px = minPX; px <= maxPX; px += 1) {
              const w0 = ((p1[0] - px) * (p2[1] - py) - (p2[0] - px) * (p1[1] - py)) / area
              const w1 = ((p2[0] - px) * (p0[1] - py) - (p0[0] - px) * (p2[1] - py)) / area
              const w2 = 1 - w0 - w1
              if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue
              const z = w0 * p0[2] + w1 * p1[2] + w2 * p2[2]
              const index = py * SIZE + px
              if (z <= depth[index]) continue
              depth[index] = z
              // 法线取自三角面本身：光栅只要「有明暗层次」，不求照片级。
              const ax = triangle.points[1][0] - triangle.points[0][0]
              const ay = triangle.points[1][1] - triangle.points[0][1]
              const az = triangle.points[1][2] - triangle.points[0][2]
              const bx = triangle.points[2][0] - triangle.points[0][0]
              const by = triangle.points[2][1] - triangle.points[0][1]
              const bz = triangle.points[2][2] - triangle.points[0][2]
              let nx = ay * bz - az * by
              let ny = az * bx - ax * bz
              let nz = ax * by - ay * bx
              const length = Math.hypot(nx, ny, nz) || 1
              const shade = 0.35 + 0.65 * Math.max(0, (nx * light[0] + ny * light[1] + nz * light[2]) / (length * lightLength))
              pixels[index * 4] = Math.min(255, Math.round(base[0] * shade))
              pixels[index * 4 + 1] = Math.min(255, Math.round(base[1] * shade))
              pixels[index * 4 + 2] = Math.min(255, Math.round(base[2] * shade))
            }
          }
        }
        let covered = 0
        let sum = 0
        let sumSq = 0
        const total = SIZE * SIZE
        for (let i = 0; i < total; i += 1) {
          const r = pixels[i * 4]
          const g = pixels[i * 4 + 1]
          const b = pixels[i * 4 + 2]
          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
          sum += luminance
          sumSq += luminance * luminance
          if (Math.abs(r - BACKGROUND[0]) + Math.abs(g - BACKGROUND[1]) + Math.abs(b - BACKGROUND[2]) > 24) covered += 1
        }
        const mean = sum / total
        const coverage = +(covered / total).toFixed(5)
        const variance = +(sumSq / total - mean * mean).toFixed(2)
        const blank = coverage < 0.002 || variance < 1
        const row = {
          variant,
          file,
          ok: !blank,
          error: blank ? 'blank-frame' : null,
          triangles: triangleCount,
          meshes,
          visibleMeshes,
          bounds: { min: min.map((v) => +v.toFixed(4)), max: max.map((v) => +v.toFixed(4)) },
          size: size.map((v) => +v.toFixed(4)),
          coverage,
          variance,
          meanLuminance: +mean.toFixed(2),
          ms: Math.round(performance.now() - startedAt),
        }
        if (blank) {
          const target = path.join(shotDir, `${modelId}-${variant}.png`)
          const png = new PNG({ width: SIZE, height: SIZE })
          pixels.copy(png.data)
          fs.writeFileSync(target, PNG.sync.write(png))
          row.screenshot = path.relative(repoRoot, target)
        }
        return row
      } finally {
        await doc?.close?.()
      }
    },
    async close() {},
  }
}

const { server, port } = await startServer()
const baseUrl = `http://127.0.0.1:${port}`

let engine = null
if (engineRequested !== 'raster') {
  try {
    engine = await createBrowserEngine()
  } catch (error) {
    if (engineRequested === 'browser') {
      server.close()
      throw error
    }
    console.error(`[preview-smoke] 浏览器引擎不可用，退回软件光栅：${String(error?.message || error).split('\n')[0]}`)
  }
}
if (!engine) engine = await createRasterEngine()

const results = []
const problems = []

function classify(job, variantResults) {
  const lite = variantResults.find((result) => result.variant === 'lite')
  const full = variantResults.find((result) => result.variant === 'full')
  if (lite && full) {
    if (lite.ok && full.ok) return 'pass'
    if (!lite.ok && full.ok) return 'lite-fail-fallback'
    if (lite.ok && !full.ok) return 'full-fail-lite-ok'
    return 'blank'
  }
  if (lite) return lite.ok ? 'pass' : 'blank-lite-only'
  if (full) return full.ok ? 'pass' : 'blank'
  return 'missing'
}

fs.mkdirSync(shotDir, { recursive: true })
let index = 0
try {
  for (const job of limited) {
    index += 1
    const variantResults = []
    for (const { variant, file } of job.variantsToTest) {
      variantResults.push(await engine.probe(job.id, variant, file))
    }
    const verdict = classify(job, variantResults)
    const record = { id: job.id, verdict, variants: variantResults }
    results.push(record)
    if (verdict !== 'pass') problems.push(record)
    if (index % 25 === 0 || index === limited.length) {
      process.stdout.write(`\r巡检 ${index}/${limited.length}，问题 ${problems.length}`)
    }
  }
  process.stdout.write('\n')
} finally {
  await engine.close()
  server.close()
}

const counts = results.reduce((accumulator, record) => {
  accumulator[record.verdict] = (accumulator[record.verdict] ?? 0) + 1
  return accumulator
}, {})

const generatedAt = new Date().toISOString()
const jsonPath = path.join(outDir, 'preview-smoke.json')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt, size: SIZE, background: BACKGROUND, counts, results }, null, 2) + '\n')

/** 失败行的证据列：错误 + 面数 + 覆盖率，够判断是解析坏还是取景坏。 */
function evidenceCell(record) {
  const failing = record.variants.filter((variant) => variant.ok === false)
  return failing
    .map((variant) => {
      const bits = [`${variant.variant}: ${variant.error}`]
      if (variant.triangles !== undefined) bits.push(`tris=${variant.triangles}`)
      if (variant.coverage !== undefined) bits.push(`cover=${(variant.coverage * 100).toFixed(2)}%`)
      if (variant.ms !== undefined) bits.push(`${variant.ms}ms`)
      return bits.join(' · ')
    })
    .join('<br>')
}

const lines = []
lines.push('# 预览冒烟巡检（全库 GLB）')
lines.push('')
lines.push(`- 生成时间：${generatedAt}`)
lines.push(`- 引擎：${engine.name} —— ${engine.note}`)
lines.push(`- 判定：lite（运行期首选）先测；lite 失败但完整件可用记 \`lite-fail-fallback\`；两者都失败或画不出像素记 \`blank\`；覆盖率 <0.2% 或亮度方差 <1 视为空白`)
lines.push(`- 数据：\`${path.relative(repoRoot, jsonPath)}\``)
lines.push('')
lines.push('## 汇总')
lines.push('')
lines.push('| 结论 | 数量 | 说明 |')
lines.push('| --- | --- | --- |')
const VERDICT_NOTE = {
  pass: 'lite/完整件均可加载并画出内容',
  'lite-fail-fallback': 'lite 解析失败，运行期靠完整件回退（压缩产物需修）',
  'full-fail-lite-ok': '完整件坏，lite 可用（下载完整件会失败）',
  blank: '两个变体都画不出内容',
  'blank-lite-only': '只有 lite 且画不出内容',
  missing: '没有可测文件',
}
for (const [verdict, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  lines.push(`| ${verdict} | ${count} | ${VERDICT_NOTE[verdict] ?? ''} |`)
}
lines.push(`| **合计** | **${results.length}** | |`)
lines.push('')

if (problems.length) {
  lines.push('## 问题清单')
  lines.push('')
  lines.push('| 模型 | 结论 | 证据 | 截图 |')
  lines.push('| --- | --- | --- | --- |')
  for (const record of problems) {
    const shots = record.variants
      .filter((variant) => variant.screenshot)
      .map((variant) => `[${variant.variant}](${variant.screenshot.replace(/^docs\/architecture\/2026-10-23\//, '')})`)
      .join(' ')
    lines.push(`| ${record.id} | ${record.verdict} | ${evidenceCell(record) || '—'} | ${shots || '—'} |`)
  }
  lines.push('')
} else {
  lines.push('## 问题清单')
  lines.push('')
  lines.push('无：全部模型都能加载并画出非空画面。')
  lines.push('')
}

/** 通过件的关键指标也给一张表，方便看「能画但极小/极简」的可疑样本。 */
const suspicious = results
  .filter((record) => record.verdict === 'pass')
  .map((record) => {
    const best = record.variants.find((variant) => variant.variant === 'full' && variant.ok) ?? record.variants.find((variant) => variant.ok)
    return { id: record.id, variant: best?.variant, triangles: best?.triangles ?? 0, coverage: best?.coverage ?? 0 }
  })
  .filter((row) => row.triangles < 200 || row.coverage < 0.02)
  .sort((a, b) => a.triangles - b.triangles)
if (suspicious.length) {
  lines.push('## 可画但可疑（面数 <200 或覆盖率 <2%）')
  lines.push('')
  lines.push('| 模型 | 变体 | 三角面 | 覆盖率 |')
  lines.push('| --- | --- | --- | --- |')
  for (const row of suspicious.slice(0, 60)) {
    lines.push(`| ${row.id} | ${row.variant} | ${row.triangles} | ${(row.coverage * 100).toFixed(2)}% |`)
  }
  if (suspicious.length > 60) lines.push(`| … | | | 其余 ${suspicious.length - 60} 款见 json |`)
  lines.push('')
}

const reportPath = path.join(outDir, 'preview-smoke.md')
fs.writeFileSync(reportPath, lines.join('\n'))
console.log(JSON.stringify({ engine: engine.name, report: path.relative(repoRoot, reportPath), data: path.relative(repoRoot, jsonPath), counts, problems: problems.length }, null, 2))
/**
 * 有真空白（blank/blank-lite-only）才让 CI 失败；lite 回退只是警告。
 * 完整件坏（full-fail-lite-ok）也算问题：运行期下载完整件（导出/高清）会失败。
 */
const hardFailures = results.filter((record) => record.verdict === 'blank' || record.verdict === 'blank-lite-only' || record.verdict === 'full-fail-lite-ok')
process.exit(hardFailures.length ? 1 : 0)
