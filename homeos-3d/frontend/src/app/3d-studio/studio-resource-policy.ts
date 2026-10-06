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
    maxPixelRatio: 0.8,
    maxSamples: 2,
  }),
  reuseLightMatrices: true,
});
