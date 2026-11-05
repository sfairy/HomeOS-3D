/**
 * 交互式预览（3D 场景）的资源策略：按设备能力给接触阴影、反射、动效定预算。
 * 桌面端（G=true）才启用这些预算，移动端走更保守的默认值。
 */
export const interactionResourcePolicy = Object.freeze({
  contactShadows: Object.freeze({
    resolution: 512,
    surfaceResolution: 128,
    maxSurfaceLevels: 16,
  }),
  reflections: Object.freeze({
    maxResolution: 256,
    inactiveBudget: 8388608,
    maxInactiveRecords: 2,
    insideIdleMs: 10000,
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
