/**
 * @module core/count-json-leaf-diff
 * @description 统计两个 JSON 可序列化值之间变更的叶子节点数量的工具。
 *
 * 用途：在实体状态 / 配置 diff 场景，量化「变化幅度」而非简单相等判断，
 * 用于决定是否触发重渲染、缓存失效或事件上报。
 *
 * 依赖：无（纯函数，输入需可 JSON 序列化） */
/** 判定值类型标签（区分 null / array / 普通 object / 标量） */
function valueKind(value: unknown) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/** 是否为普通对象（非 null、非数组） */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return valueKind(value) === 'object'
}

/** 叶子节点相等性比较（基于 JSON 序列化，保证标量与结构都可比） */
function leafEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * 递归统计两个 JSON 可序列化值之间变更的叶子节点数量。
 * 对象按字段、数组按元素递归；标量/ null 不等时计 1。
 * @param left 基线值（可为 JSON 字符串，会自动 parse）
 * @param right 当前值（可为 JSON 字符串，会自动 parse）
 * @returns 变更叶子节点数
 */
export function countJsonLeafDiff(left: unknown, right: unknown) {
  const a = typeof left === 'string' ? JSON.parse(left) : left
  const b = typeof right === 'string' ? JSON.parse(right) : right
  return walk(a, b)
}

/** 递归核心：返回 a/b 之间的变更叶子数 */
function walk(a: unknown, b: unknown): number {
  if (leafEqual(a, b)) return 0

  const aMissing = a === undefined
  const bMissing = b === undefined
  if (aMissing && bMissing) return 0

  // 一侧缺失时，对存在的一侧递归统计其叶子数（空值视为 0 变更）
  if (aMissing || bMissing) {
    const sole = aMissing ? b : a
    if (sole === null || sole === '') return sole === (aMissing ? a : b) ? 0 : 1
    const kind = valueKind(sole)
    if (kind === 'array') {
      return (sole as unknown[]).reduce(
        (n: number, item) => n + walk(aMissing ? undefined : item, bMissing ? undefined : item),
        0,
      )
    }
    if (isPlainObject(sole)) {
      return Object.keys(sole).reduce(
        (n: number, key) =>
          n + walk(aMissing ? undefined : sole[key], bMissing ? undefined : sole[key]),
        0,
      )
    }
    return 1
  }

  const kindA = valueKind(a)
  const kindB = valueKind(b)
  // 类型不同直接计 1（无法递归对齐）
  if (kindA !== kindB) return 1

  if (kindA === 'array') {
    const arrA = a as unknown[]
    const arrB = b as unknown[]
    const maxLen = Math.max(arrA.length, arrB.length)
    let count = 0
    for (let i = 0; i < maxLen; i++) {
      count += walk(arrA[i], arrB[i])
    }
    return count
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    let count = 0
    for (const key of keys) {
      count += walk(a[key], b[key])
    }
    return count
  }

  return 1
}

/**
 * 按指定顶层字段统计变更数（字段级，不递归展开）。
 * @param baseline 基线对象
 * @param current 当前对象
 * @param keys 需要比较的字段名列表
 * @returns 发生变更的字段数
 */
export function countObjectFieldDiff(
  baseline: Record<string, unknown> | null | undefined,
  current: Record<string, unknown> | null | undefined,
  keys: string[],
) {
  let count = 0
  for (const key of keys) {
    if (!leafEqual(baseline?.[key], current?.[key])) count++
  }
  return count
}
