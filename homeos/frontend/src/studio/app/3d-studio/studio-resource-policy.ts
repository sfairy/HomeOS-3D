/**
 * 交互式预览（3D 场景）的资源策略：按设备能力给接触阴影、反射、动效定预算。
 * 桌面端（G=true）才启用这些预算，移动端走更保守的默认值。
 *
 * WaveUI-C：运动路径保持锐利/省预算；闲时/近场可升 anisotropy、反射分辨率与接触影。
 * 禁止默认 perf-low / 永久全局砍阴影。
 */
import { urlFlag } from './render-kit/url-flags'

export const interactionResourcePolicy = Object.freeze({
  contactShadows: Object.freeze({
    /** 运动 / 冷启动预算（嵌入式舞台）。 */
    resolution: 512,
    surfaceResolution: 128,
    maxSurfaceLevels: 16,
    /** 闲时升一档：脚下接触影更软，不改运动路径。 */
    idleResolution: 1024,
    idleSurfaceResolution: 256,
  }),
  reflections: Object.freeze({
    /** 运动中上限（低端/拖拽时保帧）。 */
    maxResolution: 256,
    /** 闲时 / 高端墙板：大墙面地板清晰到 512（外观设置仍可自行选 256/512/768）。 */
    idleMaxResolution: 512,
    inactiveBudget: 8388608,
    maxInactiveRecords: 2,
    insideIdleMs: 10000,
  }),
  textures: Object.freeze({
    motionAnisotropy: 4,
    idleAnisotropy: 16,
  }),
  motion: Object.freeze({
    // 桌面清晰优先；低端墙板仍可通过 appearance.motionRenderScale / performanceMode 下调。
    maxPixelRatio: 1.5,
    maxSamples: 2,
  }),
  reuseLightMatrices: true,
  /**
   * 嵌入式舞台的**静态方向光阴影**。
   *
   * 舞台没有编辑器的射灯阴影图集（`studio-shadow-atlas` 只在创作态装），以前干脆
   * 把 `shadowMap.enabled` 一起关了 —— 于是墙面是全场唯一「永远没有投影」的受体，
   * 整圈墙平得像贴图。这里只给主方向光一张 1024² 的静态图：场景重建时渲一次
   * （`shadow.autoUpdate = false` + `needsUpdate`），日常帧不产生任何额外 draw call。
   *
   * 低端设备/帧时间超预算时把 `enabled` 关掉即可整体回退（不影响编辑器）。
   */
  stageSunShadow: Object.freeze({
    enabled: true,
    mapSize: 1024,
    // VSM 在 1m 级墙面上很容易出漏光条纹：负 bias 收一点自阴影，normalBias 撑开
    // 大平面的采样偏移。
    bias: -0.0006,
    normalBias: 0.02,
  }),
})

/**
 * 反射分辨率预算：运动压到 maxResolution；闲时恢复外观档（含 512/768，不压低用户更高档）。
 * 低端设备全程卡在 maxResolution。`idleMaxResolution` 文档化为闲时目标上限参考。
 */
export function resolveReflectionResolution(isIdle: boolean, appearanceResolution: number): number {
  const { maxResolution } = interactionResourcePolicy.reflections
  if (isLowEndDevice() || !isIdle) return Math.min(appearanceResolution, maxResolution)
  return appearanceResolution
}

/** 贴图各向异性：闲时升到设备上限夹紧后的 idle 档；运动维持较低预算。 */
export function resolveTextureAnisotropy(isIdle: boolean, deviceMax = 1): number {
  const budget = isIdle
    ? interactionResourcePolicy.textures.idleAnisotropy
    : interactionResourcePolicy.textures.motionAnisotropy
  return Math.min(Math.max(1, deviceMax || 1), budget)
}

/**
 * 太阳光阴影贴图分辨率（B12）。
 *
 * 舞台沿用 `stageSunShadow` 的静态预算；编辑器默认 2048，移动端/低端设备降到 1024
 * （阴影边缘略糊，但首帧阴影图渲染成本减半）。
 */
export function resolveSunShadowMapSize(isEmbedStageMode: boolean): number {
  if (isEmbedStageMode) return interactionResourcePolicy.stageSunShadow.mapSize
  return isLowEndDevice() ? 1024 : 2048
}

/** 移动端 / 低端设备判定：粗指针、<=4GB 内存或 <=4 逻辑核都按低端处理。 */
function isLowEndDevice(): boolean {
  if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return true
  if (typeof navigator === 'undefined') return false
  const memoryGb = Number(navigator.deviceMemory)
  const logicalCores = Number(navigator.hardwareConcurrency)
  return (memoryGb > 0 && memoryGb <= 4) || (logicalCores > 0 && logicalCores <= 4)
}

/**
 * 静置渲染像素比：min(DPR, 上限) × renderScale，再整体封顶到上限（默认 2）。
 * 旧公式 min(DPR,1.6)×renderScale 在 DPR 2 + renderScale 1.5 时超采样到 2.4（原生的 1.44 倍像素），
 * 而 renderScale 1 时又只有 1.6（低于原生）。`?dpr-cap=<数字>` 改上限，`?dpr-cap=legacy` 恢复旧公式。
 */
export function idleRenderPixelRatio(renderScale: number): number {
  const devicePixelRatio = globalThis.devicePixelRatio || 1
  const flag = urlFlag('dpr-cap')
  if (flag === 'legacy') return Math.min(devicePixelRatio, 1.6) * renderScale
  const cap = Number(flag)
  const limit = flag !== null && Number.isFinite(cap) && cap >= 0.5 ? cap : 2
  return Math.min(Math.min(devicePixelRatio, limit) * renderScale, limit)
}
