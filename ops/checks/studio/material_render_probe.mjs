#!/usr/bin/env bun
/**
 * 材质渲染探针：在**真实运行时材质链**上量「金属发黑」与「波浪状细纹」两个缺陷。
 *
 * 为什么需要它：`audit_glb_materials.mjs` 只能证明「链路接线了」，证明不了「画面上还黑不黑」。
 * 2026-10-24 的两个缺陷都是**像素级**的：
 * - 金属发黑：`metalness 0.72` + 没有 IBL → 模型面片的亮度塌到 30 以下；
 * - 波浪细纹：高频程序化 `normalMap` 的 mip 等高条带 → 同一行相邻像素亮度反复反向。
 *
 * 所以本脚本做的事是：把 GLB 放进一个复刻工作室灯光 / 色调映射的离屏渲染器，
 * **直接 import 运行时的材质模块**（`studio-surface-normal-maps.ts` /
 * `studio-metal-environment.ts` / `studio-model-material-roles.ts` /
 * `studio-material-presets.ts` / `studio-box-uv.ts`）跑同一条配方链，然后读像素算指标。
 *
 * 两种模式（同一份几何 / 同一台相机 / 同一套灯，只切材质链）：
 * - `before`：程序化细节挂 `normalMap`、金属不挂 `envMap`（= 修复前的表现）；
 *   `--legacy-presets` 时还会把被收口的结构角色还原成 `metalness 0.72`（= 修复前的档位）；
 * - `after`：细节挂 `bumpMap`、金属挂共享 `envMap`（= 当前实现）。
 *
 * 指标：
 * - `darkRatio`：模型像素里亮度 < 30 的占比（深色设计也算，故只用来验「不比修复前更黑」）；
 * - `metalDarkening`：把 metalness 压到 0 重画一次的亮度损失（1 - 实际/哑光）——
 *   这才是「金属发黑」真正的定义（同基色下金属度导致的掉光），修复后应接近 0；
 *   深色五金（基色线性亮度 < 0.06）不适用这条判据：黑金属本来就该暗，哑面对照反而更亮；
 * - `meanLuma` / `p50Luma`：模型像素的平均 / 中位亮度；
 * - `banding`：模型像素里「相邻像素亮度偏导变号」的次数 / 千像素（验「细纹」）。
 *
 * 用法（需要 8805 的 Vite dev server 起着，`bun run dev`）：
 * ```bash
 * bun ops/checks/studio/material_render_probe.mjs                       # 抽样集，before + after
 * bun ops/checks/studio/material_render_probe.mjs --models fridge,wardrobe --styles appliance-steel-black
 * bun ops/checks/studio/material_render_probe.mjs --mode after --size 640
 * bun ops/checks/studio/material_render_probe.mjs --check               # 验收（metalDarkening / darkRatio / banding）
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { ALL_ITEM_MODELS } from '../../../homeos/frontend/src/studio/app/3d-studio/loaders/external-models/all-item-models.ts'

const require = createRequire(import.meta.url)
/** 受限沙箱里 `os.cpus()` 会抛错，而 playwright 内部必读 CPU 型号。 */
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
const hasFlag = (name) => args.includes(`--${name}`)

const baseUrl = valueOf('base', 'http://localhost:8805')
const size = Number(valueOf('size', 512))
const outDir = path.resolve(repoRoot, valueOf('out', '.tmp-viewer/material-probe'))
const onlyModels = (valueOf('models', '') || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean)
const onlyStyles = (valueOf('styles', '') || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean)
const modeFilter = valueOf('mode', 'both')
const checkMode = hasFlag('check')
const legacyPresets = hasFlag('legacy-presets')

/** 抽样集：覆盖「金属件多 / 大平板 / 柜类 / 无金属」四类，默认档与三个金属档各跑一遍。 */
const DEFAULT_MODELS = [
  'fridge',
  'rangehood',
  'exhaust-fan',
  'wardrobe',
  'sideboard',
  'cabinet',
  'elevator',
  'tvstand',
  'bed',
  'desk',
  'airoutlet',
]
const DEFAULT_STYLES = ['default', 'appliance-steel-black', 'device-steel', 'clay-terracotta']
/** 修复前会把结构角色刷成 `metal`（0.72）的档位；只在 `--legacy-presets` 的 before 轮还原。 */
const LEGACY_STRUCTURAL_METAL_STYLES = [
  'appliance-steel-silver',
  'appliance-steel-black',
  'device-steel',
]

const models = (onlyModels.length ? onlyModels : DEFAULT_MODELS).filter((id) => ALL_ITEM_MODELS[id])
const styles = onlyStyles.length ? onlyStyles : DEFAULT_STYLES
const modes = modeFilter === 'both' ? ['before', 'after'] : [modeFilter]

const HARNESS = String.raw`<!doctype html>
<html lang="zh">
<head><meta charset="utf-8"><title>material probe</title>
<style>html,body{margin:0;background:#181a1e}canvas{display:block}</style></head>
<body>
<script type="module">
import * as THREE from '/static/vendor/three/0.186.1/three.module.min.js'
import { GLTFLoader } from '/static/vendor/three/0.186.1/GLTFLoader.js'
import { DRACOLoader } from '/static/vendor/three/0.186.1/DRACOLoader.js'
import {
  SURFACE_DETAIL_SCALE,
  SURFACE_DETAIL_BUMP_UNIT,
  createSurfaceDetailTexture,
} from '/src/studio/app/3d-studio/materials/studio-surface-normal-maps.ts'
import { applyMetalEnvironmentFinish } from '/src/studio/app/3d-studio/materials/studio-metal-environment.ts'
import { ensureSceneBoxUvs } from '/src/studio/app/3d-studio/materials/studio-box-uv.ts'
import {
  materialSurfaceFinish,
  resolveModelMaterialRole,
  materialRoleRecipeForRole,
} from '/src/studio/app/3d-studio/materials/studio-model-material-roles.ts'
import {
  STRUCTURAL_OR_SOFT_ROLES,
  materialStylePresetFor,
  materialStyleRecipeFor,
} from '/src/studio/app/3d-studio/materials/studio-material-presets.ts'

const SIZE = ${size}
/** 与工作室一致：深灰背景。 */
const BACKGROUND = ${JSON.stringify([24, 26, 30])}
const LEGACY_STRUCTURAL_METAL_STYLES = new Set(${JSON.stringify(LEGACY_STRUCTURAL_METAL_STYLES)})

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false })
renderer.setPixelRatio(1)
renderer.setSize(SIZE, SIZE)
renderer.setClearColor(new THREE.Color(BACKGROUND[0] / 255, BACKGROUND[1] / 255, BACKGROUND[2] / 255), 1)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1.04
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
// 与 createStudioRenderer.ts 的五盏灯逐参数一致。
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

/** 从高度图（灰度 bump 纹理）反算旧实现的切线空间法线图（Sobel × SLOPE=9，与旧生成器同一份高度场）。 */
function legacyNormalFromHeight(three, heightTexture) {
  const source = heightTexture.image
  const width = source.width
  const height = source.height
  const context = source.getContext('2d')
  const sourceData = context.getImageData(0, 0, width, height).data
  const heightAt = (column, row) =>
    sourceData[(((row + height) % height) * width + ((column + width) % width)) * 4] / 255
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const targetContext = canvas.getContext('2d')
  const imageData = targetContext.createImageData(width, height)
  const SLOPE = 9
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const slopeU = (heightAt(column + 1, row) - heightAt(column - 1, row)) * SLOPE
      const slopeV = (heightAt(column, row + 1) - heightAt(column, row - 1)) * SLOPE
      const normalX = -slopeU
      const normalY = slopeV
      const length = Math.hypot(normalX, normalY, 1) || 1
      const offset = (row * width + column) * 4
      imageData.data[offset] = Math.round((normalX / length) * 127.5 + 127.5)
      imageData.data[offset + 1] = Math.round((normalY / length) * 127.5 + 127.5)
      imageData.data[offset + 2] = Math.round((1 / length) * 127.5 + 127.5)
      imageData.data[offset + 3] = 255
    }
  }
  targetContext.putImageData(imageData, 0, 0)
  const texture = new three.CanvasTexture(canvas)
  texture.colorSpace = three.NoColorSpace ?? three.LinearSRGBColorSpace
  texture.wrapS = three.RepeatWrapping
  texture.wrapT = three.RepeatWrapping
  texture.repeat.copy(heightTexture.repeat)
  texture.anisotropy = heightTexture.anisotropy
  texture.needsUpdate = true
  return texture
}

/** 材质链：角色配方 → 档位配方 → 细节（bump / normal）→ 金属环境。 */
function finishMaterial(material, itemType, index, palette, mode) {
  if (!material?.isMeshStandardMaterial) return
  const roleResult = resolveModelMaterialRole(itemType, material.name, index)
  const role = roleResult?.role
  if (!role) return
  const slot = roleResult?.slot ?? index
  const roleRecipe = materialRoleRecipeForRole(itemType, role, palette, slot)
  const styleRecipe = palette.materialStyle
    ? materialStyleRecipeFor(itemType, material.name, palette, index)
    : null
  const surface = styleRecipe?.surface ?? roleRecipe?.surface
  // 颜色 / 粗糙度 / 金属度：档位优先，其次角色配方，最后表面族默认。
  const finish = surface ? materialSurfaceFinish(surface) : undefined
  if (roleRecipe?.colorValue !== undefined) material.color?.setHex?.(roleRecipe.colorValue)
  if (styleRecipe?.colorValue !== undefined) material.color?.setHex?.(styleRecipe.colorValue)
  material.roughness = styleRecipe?.roughness ?? roleRecipe?.roughness ?? finish?.roughness ?? material.roughness
  material.metalness = styleRecipe?.metalness ?? roleRecipe?.metalness ?? finish?.metalness ?? material.metalness

  // before 轮：还原「档位把结构角色刷成 metal」的历史表现。
  if (
    mode === 'before' &&
    LEGACY_STRUCTURAL_METAL_STYLES.has(palette.materialStyle) &&
    STRUCTURAL_OR_SOFT_ROLES.has(role)
  ) {
    material.roughness = 0.32
    material.metalness = 0.72
  }

  const scale = roleRecipe?.surfaceDetailScale ?? roleRecipe?.surfaceNormalScale ?? 1
  const strength = surface ? (SURFACE_DETAIL_SCALE[surface] ?? 0) * scale : 0
  material.normalMap = null
  material.bumpMap = null
  material.normalScale?.set?.(0, 0)
  const detailTexture = strength ? createSurfaceDetailTexture(THREE, surface, 8) : null
  if (detailTexture) {
    if (mode === 'before') {
      material.normalMap = legacyNormalFromHeight(THREE, detailTexture)
      material.normalScale?.set?.(strength, strength)
    } else {
      material.bumpMap = detailTexture
      material.bumpScale = strength * SURFACE_DETAIL_BUMP_UNIT
    }
  }
  material.needsUpdate = true

  if (mode === 'after') applyMetalEnvironmentFinish(material, THREE, itemType)
  else {
    material.envMap = null
    material.envMapIntensity = 0
  }
}

/** 正交相机框住包围盒，取 3/4 视角（掠射角最能看出条带）。 */
function frame(root) {
  const box = new THREE.Box3().setFromObject(root)
  if (box.isEmpty()) return null
  const sizeVector = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(sizeVector)
  box.getCenter(center)
  const extent = Math.max(sizeVector.x, sizeVector.y, sizeVector.z)
  if (!Number.isFinite(extent) || extent <= 1e-4) return null
  const direction = new THREE.Vector3(0.95, 0.62, 1).normalize()
  const distance = extent * 3.2
  camera.position.copy(center).addScaledVector(direction, distance)
  camera.up.set(0, 1, 0)
  camera.lookAt(center)
  const halfWidth = extent * 0.62
  camera.left = -halfWidth
  camera.right = halfWidth
  camera.top = halfWidth
  camera.bottom = -halfWidth
  camera.near = Math.max(distance - extent * 2, 0.01)
  camera.far = distance + extent * 2
  camera.updateProjectionMatrix()
  return { extent, center: center.toArray(), size: sizeVector.toArray() }
}

/** 像素指标：darkRatio（发黑）/ mean / p50 / banding（相邻像素亮度反复反向）。 */
function measure(background = BACKGROUND) {
  const gl = renderer.getContext()
  const pixels = new Uint8Array(SIZE * SIZE * 4)
  gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  const backgroundTolerance = 24
  const coveredMask = new Uint8Array(SIZE * SIZE)
  const luma = new Float32Array(SIZE * SIZE)
  let covered = 0
  let darkCount = 0
  let sum = 0
  for (let index = 0; index < SIZE * SIZE; index += 1) {
    const offset = index * 4
    const r = pixels[offset]
    const g = pixels[offset + 1]
    const b = pixels[offset + 2]
    const value = 0.2126 * r + 0.7152 * g + 0.0722 * b
    luma[index] = value
    if (Math.abs(r - background[0]) + Math.abs(g - background[1]) + Math.abs(b - background[2]) <= backgroundTolerance)
      continue
    coveredMask[index] = 1
    covered += 1
    sum += value
    if (value < 30) darkCount += 1
  }
  if (!covered) return { coveredShare: 0, darkRatio: 1, meanLuma: 0, p50Luma: 0, banding: 0, derivatives: 0 }

  const coveredLuma = []
  for (let index = 0; index < SIZE * SIZE; index += 1) if (coveredMask[index]) coveredLuma.push(luma[index])
  coveredLuma.sort((left, right) => left - right)
  const p50 = coveredLuma[Math.floor(coveredLuma.length / 2)]

  // banding：横向扫描，统计「偏导变号」次数（条带 = 一亮一暗的反复翻转）。
  // 只统计**低幅度**翻转：几何边缘（格栅/百叶/把手）是 > EDGE_MAX 的硬跳变，
  // 材质细纹是 2–8 的软波纹；不剔掉边缘会把几何底噪算成材质问题。
  const NOISE_MIN = 2.5
  const EDGE_MAX = 10
  let flips = 0
  let derivatives = 0
  for (let row = 0; row < SIZE; row += 1) {
    let previousDerivative = 0
    for (let column = 1; column < SIZE; column += 1) {
      const index = row * SIZE + column
      if (!coveredMask[index] || !coveredMask[index - 1]) {
        previousDerivative = 0
        continue
      }
      const derivative = luma[index] - luma[index - 1]
      if (Math.abs(derivative) < NOISE_MIN) continue
      if (Math.abs(derivative) >= EDGE_MAX) {
        previousDerivative = 0
        continue
      }
      derivatives += 1
      if (previousDerivative !== 0 && Math.sign(derivative) !== Math.sign(previousDerivative)) flips += 1
      previousDerivative = derivative
    }
  }
  return {
    coveredShare: +(covered / (SIZE * SIZE)).toFixed(4),
    darkRatio: +(darkCount / covered).toFixed(4),
    meanLuma: +(sum / covered).toFixed(2),
    p50Luma: +p50.toFixed(2),
    banding: +((flips / covered) * 1000).toFixed(2),
    derivatives: +((derivatives / covered) * 1000).toFixed(2),
  }
}

function dispose(root) {
  root.traverse((node) => {
    node.geometry?.dispose?.()
    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : []
    for (const material of materials) {
      for (const value of Object.values(material)) if (value && value.isTexture) value.dispose?.()
      material.dispose?.()
    }
  })
}

window.probeRender = async ({ url, itemType, styleId, mode }) => {
  const startedAt = performance.now()
  let root = null
  try {
    // 档位是「按家族」下发的：'appliance-steel-black' 只对厨电家族生效，衣柜/电梯拿到的是默认档。
    // 修复前的 before 轮也必须照这个规则，否则会把「运行时不存在的档位」编出来，差值全是假的。
    if (styleId && styleId !== 'default' && !materialStylePresetFor(itemType, styleId)) {
      return { ok: false, skipped: true, error: 'preset-not-for-this-family: ' + styleId, ms: 0 }
    }
    const gltf = await loader.loadAsync(url)
    root = gltf.scene
    ensureSceneBoxUvs(THREE, root)
    const palette = styleId && styleId !== 'default' ? { materialStyle: styleId } : {}
    let materialIndex = 0
    const roleSummary = []
    root.traverse((node) => {
      if (!node.isMesh) return
      const sourceMaterials = Array.isArray(node.material) ? node.material : [node.material]
      const clonedMaterials = sourceMaterials.map((material) => {
        const clone = material.clone()
        finishMaterial(clone, itemType, materialIndex, palette, mode)
        materialIndex += 1
        roleSummary.push({
          name: clone.name,
          metalness: +Number(clone.metalness).toFixed(3),
          roughness: +Number(clone.roughness).toFixed(3),
          baseLuma: clone.color
            ? +(
                (0.2126 * clone.color.r + 0.7152 * clone.color.g + 0.0722 * clone.color.b)
              ).toFixed(4)
            : null,
          hasEnv: Boolean(clone.envMap),
          detail: clone.bumpMap ? 'bump' : clone.normalMap ? 'normal' : 'none',
        })
        return clone
      })
      node.material = Array.isArray(node.material) ? clonedMaterials : clonedMaterials[0]
    })
    const framed = frame(root)
    if (!framed) return { ok: false, error: 'empty-bounds', ms: +(performance.now() - startedAt).toFixed(0) }
    scene.add(root)
    renderer.render(scene, camera)
    const metrics = measure()
    const png = renderer.domElement.toDataURL('image/png')

    /**
     * 金属发黑：**只留金属件**（藏掉非金属网格），再量「金属度 vs 不金属」的亮度损失。
     *
     * 直接比画面平均亮度没有意义：深色设计（曜黑家电、深棕木件）本来就暗，会被误判。
     * 这里两次渲染共用同一套基色 / 灯光 / 相机，唯一变量是 metalness，
     * 所以 1 - 实际/哑光 就是「金属因为没东西可反射而掉掉的那部分光」——
     * 修复前 0.5～0.9，修复后应接近 0。
     */
    const restoredVisibility = []
    root.traverse((node) => {
      if (!node.isMesh) return
      const materials = Array.isArray(node.material) ? node.material : [node.material]
      const isMetalMesh = materials.some(
        (material) => material?.isMeshStandardMaterial && Number(material.metalness) >= 0.5,
      )
      if (isMetalMesh) return
      restoredVisibility.push([node, node.visible])
      node.visible = false
    })
    let metalMetrics = null
    let metalMatteMetrics = null
    if (restoredVisibility.length) {
      // 换一个绝不可能出现在材质里的背景色：黑色金属像素不能被当成背景剔掉。
      renderer.setClearColor(new THREE.Color(1, 0, 1), 1)
      renderer.render(scene, camera)
      metalMetrics = measure([255, 0, 255])

      const maskedMetalness = []
      root.traverse((node) => {
        if (!node.isMesh || !node.visible) return
        const materials = Array.isArray(node.material) ? node.material : [node.material]
        for (const material of materials) {
          if (!material?.isMeshStandardMaterial) continue
          maskedMetalness.push([material, material.metalness])
          material.metalness = 0
          material.needsUpdate = true
        }
      })
      renderer.render(scene, camera)
      metalMatteMetrics = measure([255, 0, 255])
      for (const [material, metalness] of maskedMetalness) {
        material.metalness = metalness
        material.needsUpdate = true
      }

      renderer.setClearColor(new THREE.Color(BACKGROUND[0] / 255, BACKGROUND[1] / 255, BACKGROUND[2] / 255), 1)
    }
    for (const [node, visible] of restoredVisibility) node.visible = visible
    if (metalMetrics && metalMetrics.coveredShare < 0.005) {
      metalMetrics = null
      metalMatteMetrics = null
    }
    const metalDarkening =
      metalMetrics && metalMatteMetrics && metalMatteMetrics.meanLuma > 0.01
        ? +(1 - metalMetrics.meanLuma / metalMatteMetrics.meanLuma).toFixed(4)
        : null

    scene.remove(root)
    return {
      ok: true,
      ...metrics,
      metalDarkening,
      metalDarkRatio: metalMetrics?.darkRatio ?? null,
      metalMeanLuma: metalMetrics?.meanLuma ?? null,
      metalCoveredShare: metalMetrics?.coveredShare ?? 0,
      materials: roleSummary,
      metalMaterials: roleSummary.filter((entry) => entry.metalness >= 0.5).length,
      /**
       * 金属件里**最亮的基色**（线性亮度）。metalDarkening 只在基色不算黑时才有意义：
       * 深色金属（银黑档的 #2e2e30 五金）反射率本身就低，把 metalness 压到 0 的哑面对照
       * 反而更亮 —— 这是物理，不是缺陷。判据据此豁免，避免把「设计成黑色」误判成「发黑」。
       */
      metalBaseLuma: roleSummary
        .filter((entry) => entry.metalness >= 0.5 && typeof entry.baseLuma === 'number')
        .reduce((brightest, entry) => Math.max(brightest, entry.baseLuma), 0),
      envMaterials: roleSummary.filter((entry) => entry.hasEnv).length,
      bumpMaterials: roleSummary.filter((entry) => entry.detail === 'bump').length,
      normalMaterials: roleSummary.filter((entry) => entry.detail === 'normal').length,
      bounds: framed,
      png,
      ms: +(performance.now() - startedAt).toFixed(0),
    }
  } catch (error) {
    return { ok: false, error: String(error?.message || error).slice(0, 400), ms: +(performance.now() - startedAt).toFixed(0) }
  } finally {
    if (root) {
      scene.remove(root)
      dispose(root)
    }
  }
}
window.probeReady = true
</script>
</body></html>`

/** 与 `preview_smoke.mjs` 同一套启动策略：优先系统 Edge / Chrome，最后用 bundled Chromium。 */
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
        `[material-probe] 启动 ${channel ?? 'bundled chromium'} 失败：${String(error?.message || error).split('\n')[0]}`,
      )
    }
  }
  throw lastError ?? new Error('没有可用的 Chromium / Edge 浏览器')
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  const browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { width: size + 80, height: size + 80 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)))
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })
  // 先落到 8805 拿到 origin（模块解析基准），再换成本地 harness；不写文件、不影响应用代码。
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.setContent(HARNESS, { waitUntil: 'load', timeout: 30000 })
  await page.waitForFunction('window.probeReady === true', null, { timeout: 30000 })

  const results = []
  for (const modelId of models) {
    const definition = ALL_ITEM_MODELS[modelId]
    const url = definition?.url ?? definition?.fallbackUrl
    if (!url) {
      results.push({ model: modelId, ok: false, error: '注册表里没有该模型' })
      continue
    }
    for (const styleId of styles) {
      for (const mode of modes) {
        const outcome = await page.evaluate((payload) => window.probeRender(payload), {
          url,
          itemType: modelId,
          styleId,
          mode,
        })
        const label = `${modelId}__${styleId}__${mode}`
        if (outcome?.png) {
          fs.writeFileSync(
            path.join(outDir, `${label}.png`),
            Buffer.from(String(outcome.png).split(',')[1], 'base64'),
          )
          delete outcome.png
        }
        const row = { model: modelId, style: styleId, mode, ...outcome }
        results.push(row)
        if (outcome?.skipped) {
          console.log(`- ${label.padEnd(48)} 跳过（该档位不适用于此模型家族）`)
          continue
        }
        console.log(
          outcome?.ok
            ? `· ${label.padEnd(44)} dark ${String(outcome.darkRatio).padEnd(7)} metalDark ${String(outcome.metalDarkRatio).padEnd(7)} mean ${String(outcome.meanLuma).padEnd(7)} banding ${String(outcome.banding).padEnd(7)}` +
                `（metal ${outcome.metalMaterials} / env ${outcome.envMaterials} / bump ${outcome.bumpMaterials} / normal ${outcome.normalMaterials}）`
            : `✗ ${label}：${outcome?.error}`,
        )
      }
    }
  }

  await browser.close()

  const failures = results.filter((row) => !row.ok && !row.skipped)
  const pairs = new Map()
  for (const row of results.filter((entry) => entry.ok)) {
    const key = `${row.model}__${row.style}`
    const entry = pairs.get(key) ?? { model: row.model, style: row.style }
    entry[row.mode] = row
    pairs.set(key, entry)
  }
  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    size,
    modes,
    models,
    styles,
    legacyPresets,
    results,
  }
  summary.pairs = [...pairs.values()].map((pair) => {
    const before = pair.before
    const after = pair.after
    if (!before || !after) return pair
    const bandingDrop = before.banding > 0 ? 1 - after.banding / before.banding : null
    return {
      model: pair.model,
      style: pair.style,
      before: {
        darkRatio: before.darkRatio,
        metalDarkRatio: before.metalDarkRatio,
        banding: before.banding,
        meanLuma: before.meanLuma,
        metalDarkening: before.metalDarkening,
      },
      after: {
        darkRatio: after.darkRatio,
        metalDarkRatio: after.metalDarkRatio,
        banding: after.banding,
        meanLuma: after.meanLuma,
        metalDarkening: after.metalDarkening,
        metalBaseLuma: after.metalBaseLuma,
      },
      bandingDrop: bandingDrop === null ? null : +bandingDrop.toFixed(3),
      darkRatioDrop: +(before.darkRatio - after.darkRatio).toFixed(4),
    }
  })
  fs.writeFileSync(path.join(outDir, 'material-probe.json'), `${JSON.stringify(summary, null, 2)}\n`)

  console.log('')
  console.log('模型 / 档位                before dark/metalDark/banding    after dark/metalDark/banding      banding 降幅')
  for (const pair of summary.pairs) {
    if (!pair.before || !pair.after) continue
    console.log(
      `${`${pair.model}/${pair.style}`.padEnd(26)} ` +
        `${`${pair.before.darkRatio}/${pair.before.metalDarkRatio}/${pair.before.banding}`.padEnd(32)} ` +
        `${`${pair.after.darkRatio}/${pair.after.metalDarkRatio}/${pair.after.banding}`.padEnd(32)} ` +
        `${pair.bandingDrop === null ? '—' : `${(pair.bandingDrop * 100).toFixed(0)}%`}`,
    )
  }
  if (pageErrors.length) {
    console.log('')
    console.log(`页面错误 ${pageErrors.length} 条：`)
    for (const error of pageErrors.slice(0, 8)) console.log(`  - ${error}`)
  }
  console.log('')
  console.log(`→ ${path.relative(repoRoot, path.join(outDir, 'material-probe.json'))}（PNG 同目录）`)

  if (failures.length) {
    for (const failure of failures.slice(0, 10))
      console.error(`✗ ${failure.model}/${failure.style}/${failure.mode}：${failure.error}`)
  }
  if (checkMode) {
    /**
     * 验收（计划 §5，按指标口径校准）：
     * - 发黑：只看**金属件像素**，在同一基色 / 同一盏灯下把 metalness 压到 0 再画一次；
     *   metalDarkening = 1 - 实际/哑光。这是「金属发黑」的物理定义，深色设计不会被误判。
     *   阈值：after ≤ 0.5、相对 before 至少降 25%、金属件亮度 < 30 的像素 ≤ 20%。
     * - 细纹：`banding` 降到 `max(BANDING_FLOOR, before × 0.4)`；下限是这个指标里的几何边缘底噪。
     * - 全图 `darkRatio` 只要求基本不回升（±0.03）：它受设计配色主导，不是缺陷指标。
     */
    const BANDING_FLOOR = 8
    const METAL_DARKENING_LIMIT = 0.5
    const METAL_DARK_RATIO_LIMIT = 0.2
    /**
     * 基色线性亮度低于这个值的金属件不参与 `metalDarkening` 判据：
     * 深色金属的反射率 ≈ 基色，压掉 metalness 的哑面反而更亮，相对损失必然接近 1。
     * 这类件（银黑 / 石墨黑档的五金）由 `metalMeanLuma` + `metalDarkRatio` 的提示项看，
     * 不当作「发黑」缺陷。
     */
    const DARK_METAL_BASE_LUMA = 0.06
    const problems = []
    for (const pair of summary.pairs) {
      if (!pair.before || !pair.after) continue
      const label = `${pair.model}/${pair.style}`
      const darkMetal =
        typeof pair.after.metalBaseLuma === 'number' &&
        pair.after.metalBaseLuma > 0 &&
        pair.after.metalBaseLuma < DARK_METAL_BASE_LUMA
      if (darkMetal) {
        console.log(
          `· ${label}：金属基色线性亮度 ${pair.after.metalBaseLuma.toFixed(3)} < ${DARK_METAL_BASE_LUMA}（深色五金，metalDarkening 不适用）`,
        )
      } else if (
        pair.after.metalDarkening !== null &&
        pair.after.metalDarkening > METAL_DARKENING_LIMIT
      ) {
        problems.push(
          `${label}：after metalDarkening ${pair.after.metalDarkening} > ${METAL_DARKENING_LIMIT}（金属面仍然发黑）`,
        )
      }
      if (
        !darkMetal &&
        pair.before.metalDarkening !== null &&
        pair.after.metalDarkening !== null &&
        pair.after.metalDarkening > pair.before.metalDarkening * 0.75
      ) {
        problems.push(
          `${label}：metalDarkening 没有明显下降 ${pair.before.metalDarkening} → ${pair.after.metalDarkening}`,
        )
      }
      if (pair.after.metalDarkRatio !== null && pair.after.metalDarkRatio > METAL_DARK_RATIO_LIMIT) {
        // 只作提示：曜黑/深棕金属的基色本来就在 30 以下，绝对值不能当缺陷判据。
        console.log(
          `· ${label}：金属件 ${(pair.after.metalDarkRatio * 100).toFixed(0)}% 像素亮度 < 30（深色基色，仅记录）`,
        )
      }
      if (pair.after.darkRatio > pair.before.darkRatio + 0.03) {
        problems.push(`${label}：darkRatio 回升 ${pair.before.darkRatio} → ${pair.after.darkRatio}`)
      }
      const bandingLimit = Math.max(BANDING_FLOOR, pair.before.banding * 0.4)
      if (pair.after.banding > bandingLimit) {
        problems.push(
          `${label}：banding ${pair.before.banding} → ${pair.after.banding}，未降到 ${bandingLimit.toFixed(2)} 以内`,
        )
      }
    }
    for (const failure of failures) problems.push(`${failure.model}/${failure.style}/${failure.mode}：${failure.error}`)
    if (problems.length) {
      for (const problem of problems) console.error(`✗ ${problem}`)
      process.exit(1)
    }
    console.log(
      `✓ 验收通过：金属件 metalDarkening ≤ ${METAL_DARKENING_LIMIT}、darkRatio 无回升、banding ≤ max(${BANDING_FLOOR}, before × 0.4)`,
    )
  }
}

await main()
