#!/usr/bin/env bun
/**
 * 柱体「配墙」对色探针：证明「跟随墙体」的柱子渲染出来和墙是**同一个颜色**。
 *
 * 为什么需要单独一支：`material_render_probe.mjs` 量的是「发黑 / 细纹」两个缺陷，
 * 它比的是同一个模型的 before/after；而柱子的问题不是「更黑」而是「和墙不一致」——
 * 必须拿**墙**当基准量。
 *
 * 做法：同一份柱体几何、同一台相机、同一套灯，并排渲染三份材质：
 * - `legacy`：修复前的配墙材质（只抄墙的颜色，`roughness 0.66` / `metalness 0.02`、
 *   无自发光、柱础 ×0.92 柱帽 ×1.18）；
 * - `wall`：墙体基准材质（`WALL_SURFACE_FINISH` + `wallEmissiveIntensity`，
 *   与 `authoring/scene/studio-walls.ts` 同源）；
 * - `fixed`：现在的配墙配方（`materials/studio-pillar-material.ts`）。
 *
 * 指标：每根柱子覆盖像素的平均亮度。`fixed` 与 `wall` 的相对差应 ≤ 3%
 * （剩下的差只来自几何朝向），而 `legacy` 会明显偏暗 / 柱帽偏亮。
 *
 * 用法：
 * ```bash
 * bun ops/checks/studio/pillar_wall_probe.mjs            # 出 PNG + 数字
 * bun ops/checks/studio/pillar_wall_probe.mjs --check    # 阈值不过直接退出 1
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { ALL_ITEM_MODELS } from '../../../homeos/frontend/src/studio/app/3d-studio/loaders/external-models/all-item-models.ts'
import { defaultViewSettings } from '../../../homeos/frontend/src/studio/app/3d-studio/authoring/scene/studio-view-settings.ts'
import { WARM_WOOD_STYLE } from '../../../homeos/frontend/src/studio/app/3d-studio/authoring/scene/studio-scene-style.ts'
import { resolvePillarMaterialSpec } from '../../../homeos/frontend/src/studio/app/3d-studio/materials/studio-pillar-material.ts'
import {
  WALL_SURFACE_FINISH,
  wallEmissiveIntensity,
  wallFilmOpacity,
} from '../../../homeos/frontend/src/studio/app/3d-studio/materials/studio-wall-finish.ts'

const require = createRequire(import.meta.url)
const os = require('node:os')
const cpus = os.cpus.bind(os)
os.cpus = () => {
  try {
    return cpus().map((cpu) => ({ model: String(cpu.model), speed: Number(cpu.speed) || 0 }))
  } catch {
    return [{ model: 'Apple Silicon', speed: 0 }]
  }
}
const { chromium } = require('playwright-core')

const hereDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(hereDir, '../../..')
const args = process.argv.slice(2)
const valueOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : fallback
}
const baseUrl = valueOf('base', 'http://localhost:8805')
const size = Number(valueOf('size', 720))
const outDir = path.resolve(repoRoot, valueOf('out', '.tmp-viewer/pillar-probe'))
const checkMode = args.includes('--check')
const specOnly = args.includes('--spec-only')
const modelId = valueOf('model', 'pillar_round')
const paletteName = valueOf('palette', 'default')
const styleId = valueOf('style', '')
/** 配色：与运行时 `backgroundSettings()` 同一份（默认主题 / 暖木主题）。 */
const wallOpacityFromArgs = valueOf('wall-opacity', null)
const palette = {
  ...(paletteName === 'warm-wood'
    ? { ...defaultViewSettings, ...WARM_WOOD_STYLE }
    : defaultViewSettings),
  ...(wallOpacityFromArgs === null ? {} : { wallOpacity: Number(wallOpacityFromArgs) }),
  materialStyle: styleId || undefined,
}
const wallColor = Number(palette.wall ?? 0xffffff)
const emissiveIntensity = wallEmissiveIntensity(paletteName === 'warm-wood')
/**
 * 墙体实际透过率：`defaultViewSettings.wallOpacity`（0.36），拖动滑条后的值由
 * `materialLoadOptionsForItem` 实时传进调色板。墙是闭合壳（`side: DoubleSide`），
 * 一个像素会叠到两个大面，所以墙面看起来的浓度是 `wallFilmOpacity(0.36) ≈ 0.59`。
 */
const wallOpacity = Number(palette.wallOpacity)
const filmOpacity = wallFilmOpacity(wallOpacity)
const fixedSpec = resolvePillarMaterialSpec(modelId, 'body', palette)
const fixedBaseSpec = resolvePillarMaterialSpec(modelId, 'base', palette)
const fixedTrimSpec = resolvePillarMaterialSpec(modelId, 'trim', palette)

/** 修复前的配墙配方（历史行为，逐项抄自 2026-10-24 之前的 `applyWarmWoodFurnitureMaterial`）。 */
const legacySpec = {
  body: {
    color: wallColor,
    roughness: 0.66,
    metalness: 0.02,
    emissive: 0,
    emissiveIntensity: 0,
    transparent: false,
    opacity: 1,
  },
  base: {
    color: scaleHex(wallColor, 0.92),
    roughness: 0.74,
    metalness: 0.02,
    emissive: 0,
    emissiveIntensity: 0,
    transparent: false,
    opacity: 1,
  },
  trim: {
    color: scaleHex(wallColor, 1.18),
    roughness: 0.66,
    metalness: 0.02,
    emissive: 0,
    emissiveIntensity: 0,
    transparent: false,
    opacity: 1,
  },
}

function scaleHex(hex, factor) {
  const channel = (shift) =>
    Math.max(0, Math.min(255, Math.round(((hex >>> shift) & 0xff) * factor)))
  return ((channel(16) << 16) | (channel(8) << 8) | channel(0)) >>> 0
}

/**
 * 单源检查：墙体与跟随件必须读同一份表面参数。
 *
 * 有人把 `studio-walls.ts` 里的 `roughness 0.72` / `emissiveIntensity 0.30` 改回字面量，
 * 柱体就会悄悄回到「暗一档」—— 这条检查不需要浏览器，先跑它。
 */
function checkWallFinishSingleSource() {
  const wallPath = path.join(
    repoRoot,
    'homeos/frontend/src/studio/app/3d-studio/authoring/scene/studio-walls.ts',
  )
  const wallSource = fs.readFileSync(wallPath, 'utf8')
  const problems = []
  if (!wallSource.includes('WALL_SURFACE_FINISH2.roughness'))
    problems.push('studio-walls.ts 没有用 WALL_SURFACE_FINISH 的 roughness')
  if (!wallSource.includes('WALL_SURFACE_FINISH2.metalness'))
    problems.push('studio-walls.ts 没有用 WALL_SURFACE_FINISH 的 metalness')
  if (!/wallEmissiveIntensity2\(warmWood\)/.test(wallSource))
    problems.push('studio-walls.ts 没有用 wallEmissiveIntensity(warmWood)')

  /**
   * 接线守卫：配方算对了、加载器不把 `opacity` / `transparent` 传下去，柱子照样是实心的。
   * 纯规格断言看不见这一层，所以补源码检查。
   */
  const loaderSource = fs.readFileSync(
    path.join(repoRoot, 'homeos/frontend/src/studio/app/3d-studio/loaders/studio-external-models.ts'),
    'utf8',
  )
  for (const wiring of ['opacity: pillarSpec.opacity', 'transparent: pillarSpec.transparent'])
    if (!loaderSource.includes(wiring))
      problems.push(`studio-external-models.ts 没有把 ${wiring.split(':')[0]} 传给柱体材质`)

  const optionsSource = fs.readFileSync(
    path.join(
      repoRoot,
      'homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/functions/groups/scene-payload-and-floors.ts',
    ),
    'utf8',
  )
  if (!optionsSource.includes('wallOpacity: runtime.appCtx.wallOpacityValue'))
    problems.push('materialLoadOptionsForItem 没有把实时 wallOpacity 传进调色板')
  return problems
}

/** 纯规格断言：配墙档的每个槽位都与墙同色同面同膜厚；选了档位则必须离开墙色。 */
function specProblems() {
  const problems = []
  const expected = {
    roughness: WALL_SURFACE_FINISH.roughness,
    metalness: WALL_SURFACE_FINISH.metalness,
    clearcoat: WALL_SURFACE_FINISH.clearcoat,
    clearcoatRoughness: WALL_SURFACE_FINISH.clearcoatRoughness,
    emissiveIntensity,
    color: wallColor,
    emissive: wallColor,
    transparent: filmOpacity < 0.999,
    opacity: filmOpacity,
    wallFollow: true,
  }
  if (!styleId) {
    for (const [role, spec] of Object.entries({ body: fixedSpec, base: fixedBaseSpec, trim: fixedTrimSpec })) {
      for (const [key, value] of Object.entries(expected)) {
        if (spec[key] !== value)
          problems.push(`配墙档 ${role}.${key} = ${spec[key]}，墙是 ${value}`)
      }
    }
  } else if (
    fixedSpec.wallFollow ||
    fixedSpec.emissiveIntensity !== 0 ||
    fixedSpec.transparent ||
    fixedSpec.opacity !== 1
  ) {
    problems.push(`选了档位 ${styleId} 却还在跟随墙体（含半透明）`)
  }
  return problems
}

if (specOnly) {
  const problems = [...checkWallFinishSingleSource(), ...specProblems()]
  if (problems.length) {
    for (const problem of problems) console.error(`✗ ${problem}`)
    process.exit(1)
  }
  console.log(
    `✓ 配墙柱体与墙同源同色（${paletteName}${styleId ? ` / ${styleId}` : ''}）：${JSON.stringify({
      color: '#' + fixedSpec.color.toString(16).padStart(6, '0'),
      roughness: fixedSpec.roughness,
      metalness: fixedSpec.metalness,
      emissiveIntensity: fixedSpec.emissiveIntensity,
      transparent: fixedSpec.transparent,
      opacity: +fixedSpec.opacity.toFixed(3),
      wallFollow: fixedSpec.wallFollow,
    })}`,
  )
  process.exit(0)
}

const HARNESS = String.raw`<!doctype html>
<html lang="zh">
<head><meta charset="utf-8"><title>pillar wall probe</title>
<style>html,body{margin:0;background:#181a1e}canvas{display:block}</style></head>
<body>
<script type="module">
import * as THREE from '/static/vendor/three/0.186.1/three.module.min.js'
import { GLTFLoader } from '/static/vendor/three/0.186.1/GLTFLoader.js'
import { DRACOLoader } from '/static/vendor/three/0.186.1/DRACOLoader.js'

const SIZE = ${size}
const BACKGROUND = [24, 26, 30]
const WALL_FINISH = ${JSON.stringify(WALL_SURFACE_FINISH)}
const WALL_COLOR = ${wallColor}
const EMISSIVE_INTENSITY = ${emissiveIntensity}
/** 墙的实心程度（闭合壳、双面）与其等价膜厚（单层实体件应取的 alpha）。 */
const WALL_OPACITY = ${wallOpacity}
const FILM_OPACITY = ${filmOpacity}
const SPECS = ${JSON.stringify({ legacy: legacySpec, fixed: { body: fixedSpec, base: fixedBaseSpec, trim: fixedTrimSpec } })}

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false })
renderer.setPixelRatio(1)
renderer.setSize(SIZE, SIZE)
renderer.setClearColor(new THREE.Color(BACKGROUND[0] / 255, BACKGROUND[1] / 255, BACKGROUND[2] / 255), 1)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1.04
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.add(new THREE.HemisphereLight(12504556, 1515053, 1.12))
scene.add(new THREE.AmbientLight(7175581, 0.42))
const mainLight = new THREE.DirectionalLight(14543103, 2.05)
mainLight.position.set(-7, 22, 6)
scene.add(mainLight)
const fillLight = new THREE.DirectionalLight(8886724, 0.72)
fillLight.position.set(9, 7, -10)
scene.add(fillLight)
const topLight = new THREE.DirectionalLight(15791103, 0.68)
topLight.position.set(0, 16, 1)
scene.add(topLight)

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 400)
const draco = new DRACOLoader()
draco.setDecoderPath('/static/vendor/three/0.186.1/draco/')
const loader = new GLTFLoader()
loader.setDRACOLoader(draco)

/** 角色 → 配方：legacy 用历史值，fixed 用当前；wall 用墙体基准。 */
function materialFor(kind, role) {
  if (kind === 'wall') {
    // 墙是闭合壳：一次像素会先叠近面、再叠远面，所以两面都要画（DoubleSide）。
    return new THREE.MeshPhysicalMaterial({
      color: WALL_COLOR,
      roughness: WALL_FINISH.roughness,
      metalness: WALL_FINISH.metalness,
      clearcoat: WALL_FINISH.clearcoat,
      clearcoatRoughness: WALL_FINISH.clearcoatRoughness,
      emissive: WALL_COLOR,
      emissiveIntensity: EMISSIVE_INTENSITY,
      transparent: WALL_OPACITY < 0.999,
      opacity: WALL_OPACITY,
      depthWrite: WALL_OPACITY >= 0.999,
      side: THREE.DoubleSide,
    })
  }
  const spec = SPECS[kind][role]
  const common = {
    color: spec.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    emissive: spec.emissive,
    emissiveIntensity: spec.emissiveIntensity,
    transparent: spec.transparent === true,
    opacity: spec.opacity ?? 1,
    depthWrite: spec.transparent === true ? false : true,
  }
  return spec.clearcoat === undefined
    ? new THREE.MeshStandardMaterial(common)
    : new THREE.MeshPhysicalMaterial({
        ...common,
        clearcoat: spec.clearcoat,
        clearcoatRoughness: spec.clearcoatRoughness,
      })
}

/** 材质名 → 角色（pillar_round-body / pillar-quarter-trim 两种写法都认）。 */
function roleOf(name) {
  const match = String(name || '').match(/(?:^|[-_])(body|base|trim)$/)
  return match ? match[1] : 'body'
}

window.probe = async ({ url, kinds }) => {
  const gltf = await loader.loadAsync(url)
  const source = gltf.scene
  const box = new THREE.Box3().setFromObject(source)
  const sizeVector = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const extent = Math.max(sizeVector.x, sizeVector.y, sizeVector.z)
  const spacing = extent * 1.35
  const roots = []
  kinds.forEach((kind, kindIndex) => {
    const clone = source.clone(true)
    clone.traverse((node) => {
      if (!node.isMesh) return
      const role = roleOf(node.material?.name)
      node.material = materialFor(kind, role)
    })
    const group = new THREE.Group()
    const offsetX = (kindIndex - (kinds.length - 1) / 2) * spacing
    group.position.x = offsetX
    group.add(clone)
    scene.add(group)
    roots.push({ kind, offsetX })
  })
  const direction = new THREE.Vector3(0.55, 0.42, 1).normalize()
  const distance = extent * 3.4
  camera.position.copy(center).addScaledVector(direction, distance)
  camera.up.set(0, 1, 0)
  camera.lookAt(center)
  const halfWidth = extent * 0.62 + spacing
  camera.left = -halfWidth
  camera.right = halfWidth
  camera.top = halfWidth
  camera.bottom = -halfWidth
  camera.near = Math.max(distance - extent * 2, 0.01)
  camera.far = distance + extent * 2
  camera.updateProjectionMatrix()
  renderer.render(scene, camera)

  const gl = renderer.getContext()
  const pixels = new Uint8Array(SIZE * SIZE * 4)
  gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

  /** 每根柱子按其屏幕投影的 x 区间分别求平均亮度（像素坐标 y 轴翻转过，x 不受影响）。 */
  const screenOf = (offsetX) => {
    const point = new THREE.Vector3(offsetX, 0, 0)
    point.project(camera)
    return (point.x * 0.5 + 0.5) * SIZE
  }
  const centers = roots.map((root) => screenOf(root.offsetX))
  const halfBand = (spacing * 0.5 * SIZE) / (halfWidth * 2)
  const stats = roots.map(() => ({ sum: 0, count: 0, dark: 0 }))
  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      const offset = (row * SIZE + column) * 4
      const r = pixels[offset]
      const g = pixels[offset + 1]
      const b = pixels[offset + 2]
      if (Math.abs(r - BACKGROUND[0]) + Math.abs(g - BACKGROUND[1]) + Math.abs(b - BACKGROUND[2]) <= 24)
        continue
      const bandIndex = centers.findIndex((centerX) => Math.abs(column - centerX) <= halfBand)
      if (bandIndex < 0) continue
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
      stats[bandIndex].sum += luma
      stats[bandIndex].count += 1
      if (luma < 30) stats[bandIndex].dark += 1
    }
  }
  const metrics = {}
  roots.forEach((root, index) => {
    const entry = stats[index]
    metrics[root.kind] = {
      covered: entry.count,
      meanLuma: entry.count ? entry.sum / entry.count : null,
      darkRatio: entry.count ? entry.dark / entry.count : null,
    }
  })
  return { ok: true, png: renderer.domElement.toDataURL('image/png'), metrics }
}
window.probeReady = true
</script>
</body></html>`

async function launchBrowser() {
  const attempts = [process.env.HOMEOS_BROWSER_CHANNEL, 'msedge', 'chrome', undefined].filter(
    (channel, index, list) => channel !== '' && list.indexOf(channel) === index,
  )
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
      console.error(
        `[pillar-probe] 启动 ${channel ?? 'bundled chromium'} 失败：${String(error?.message || error).split('\n')[0]}`,
      )
    }
  }
  throw lastError ?? new Error('没有可用的 Chromium / Edge 浏览器')
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  const definition = ALL_ITEM_MODELS[modelId]
  const url = definition?.url ?? definition?.fallbackUrl
  if (!url) throw new Error(`注册表里没有该模型：${modelId}`)

  const browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { width: size + 80, height: size + 80 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)))
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.setContent(HARNESS, { waitUntil: 'load', timeout: 30000 })
  await page.waitForFunction('window.probeReady === true', null, { timeout: 30000 })
  const outcome = await page.evaluate((payload) => window.probe(payload), {
    url,
    kinds: ['legacy', 'wall', 'fixed'],
  })
  await browser.close()

  const label = `${modelId}__${paletteName}${styleId ? `__${styleId}` : ''}`
  if (outcome?.png) {
    fs.writeFileSync(
      path.join(outDir, `${label}.png`),
      Buffer.from(String(outcome.png).split(',')[1], 'base64'),
    )
  }
  const { legacy, wall, fixed } = outcome.metrics
  const relativeGap = (value) =>
    wall?.meanLuma ? +Math.abs(value - wall.meanLuma) / wall.meanLuma : null
  /** 颜色本身的偏差（0 = 与墙同色）：取 RGB 三通道的最大差值 / 255。 */
  const colorDelta = (color) => {
    const channels = [16, 8, 0].map((shift) => Math.abs(((color >>> shift) & 0xff) - ((wallColor >>> shift) & 0xff)))
    return Math.max(...channels) / 255
  }
  const roleDeltas = (spec) =>
    Object.fromEntries(
      Object.entries(spec).map(([role, entry]) => [role, +colorDelta(entry.color).toFixed(3)]),
    )
  const summary = {
    model: modelId,
    palette: paletteName,
    style: styleId || 'auto',
    wallColor: '#' + wallColor.toString(16).padStart(6, '0'),
    wallEmissiveIntensity: emissiveIntensity,
    legacy: { ...legacy, gapToWall: relativeGap(legacy.meanLuma), colorDelta: roleDeltas(legacySpec) },
    fixed: {
      ...fixed,
      gapToWall: relativeGap(fixed.meanLuma),
      colorDelta: roleDeltas({ body: fixedSpec, base: fixedBaseSpec, trim: fixedTrimSpec }),
    },
    wall,
  }
  fs.writeFileSync(path.join(outDir, `${label}.json`), `${JSON.stringify(summary, null, 2)}\n`)

  console.log(
    `墙基准 ${summary.wallColor}（自发光 ${emissiveIntensity}）：mean ${wall.meanLuma.toFixed(2)}`,
  )
  console.log(
    `  修复前  mean ${legacy.meanLuma.toFixed(2)}  与墙差 ${(summary.legacy.gapToWall * 100).toFixed(1)}%  色差 ${Object.entries(summary.legacy.colorDelta).map(([role, delta]) => `${role} ${(delta * 100).toFixed(1)}%`).join(' / ')}`,
  )
  console.log(
    `  修复后  mean ${fixed.meanLuma.toFixed(2)}  与墙差 ${(summary.fixed.gapToWall * 100).toFixed(1)}%  色差 ${Object.entries(summary.fixed.colorDelta).map(([role, delta]) => `${role} ${(delta * 100).toFixed(1)}%`).join(' / ')}`,
  )
  if (pageErrors.length) {
    console.log('页面错误：')
    for (const error of pageErrors.slice(0, 5)) console.log('  - ' + error)
  }
  console.log(`→ ${path.relative(repoRoot, path.join(outDir, `${label}.png`))}`)

  if (checkMode) {
    const LIMIT = 0.08
    const fixedColorDelta = Math.max(...Object.values(summary.fixed.colorDelta))
    if (fixedColorDelta > 0) {
      console.error(`✗ 配墙柱体的槽位颜色与墙色不完全一致（最大色差 ${(fixedColorDelta * 100).toFixed(1)}%）`)
      process.exit(1)
    }
    if (!(summary.fixed.gapToWall <= LIMIT)) {
      console.error(
        `✗ 配墙柱体与墙的亮度差 ${(summary.fixed.gapToWall * 100).toFixed(1)}% 超过 ${(LIMIT * 100).toFixed(0)}%`,
      )
      process.exit(1)
    }
    if (summary.fixed.gapToWall >= summary.legacy.gapToWall) {
      console.error('✗ 修复后并没有比修复前更接近墙色')
      process.exit(1)
    }
    console.log(
      `✓ 配墙柱体与墙同色（色差 0），亮度差 ${(summary.fixed.gapToWall * 100).toFixed(1)}% ≤ ${(LIMIT * 100).toFixed(0)}%`,
    )
  }
}

await main()
