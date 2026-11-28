/**
 * 「按几何壳拆材质」的声明式规则表。
 *
 * 用途：一个 GLB 里多个**视觉上完全不同的构件共用一个材质**时，靠单色材质无法同时画对。
 * 最典型的是 `小汽车.glb`：车体 + 4 个车轮 + 2 个后视镜全部挤在 `smallcar-bodywork`
 * 一个材质里，轮胎的深色原本完全由那张拍摄贴图上色 —— 贴图一旦去掉，轮子就变成车身色。
 *
 * 判据用**几何**而不是名字 / 下标：壳的包围盒形状是数据本身，位置下标会随导出器变化。
 * 拆出来的新材质名按「`<模型>-<构件>`」命名，角色由 `studio-model-material-roles.ts`
 * 的尾词解析自动命中（`wheel` → `tyre` → 近黑 0x1F2225 / roughness 0.55），
 * 不需要额外登记 token。
 */
export const SHELL_SPLIT_RULES = Object.freeze({
  car: [
    {
      /** 新材质名（尾词决定角色，必须是可解析的构件词）。 */
      material: 'smallcar-wheel',
      /** GLB 里的兜底值，与角色配方保持一致（否则审计 C7 会报内嵌值与配方冲突）。 */
      baseColorHex: '#1F2225',
      roughness: 0.55,
      metalness: 0.02,
      predicate: 'disc',
      description: '4 个车轮：包围盒两轴相等且 > 0.4m，第三轴 < 一半（薄圆盘）',
    },
  ],
})

/**
 * 几何判据。入参是该壳的包围盒尺寸（米，任意轴序）。
 *
 * - `disc`：薄圆盘 —— 排序后 s0 ≈ s1（相对差 < 2%）、s2 < 0.5·s0、s0 ≥ 0.4m。
 *   `小汽车` 的实测值：车轮 [0.72, 0.72, 0.266] 命中；车体 [5.012, 1.99, 1.318] 与
 *   后视镜 [0.304, 0.28, 0.151] 都不命中。
 */
export function shellMatches(predicate, size) {
  const sorted = [...size].sort((left, right) => right - left)
  const [a, b, c] = sorted
  if (predicate === 'disc') {
    if (a < 0.4) return false
    if (Math.abs(a - b) / a > 0.02) return false
    return c < a * 0.5
  }
  throw new Error(`未知的壳判据：${predicate}`)
}
