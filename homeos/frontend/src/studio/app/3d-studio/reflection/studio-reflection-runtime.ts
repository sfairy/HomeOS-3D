/**
 * 地面反射热路径的小工具（B10）：自适应捕获帧率、持久化缓存戳。
 *
 * 背景：`studio-ground-reflections.ts` 的 capture 路径每记录一次都要构造
 * `JSON.stringify([...settings, ...stats])` 缓存戳，在 presented 相位产生可观的分配与 GC
 * （其中 `settings` 是大对象、key 顺序还可能抖动）。这里换成按 key 排序的扁平字符串，
 * 主流程只调用函数；另外把相机静止时的重捕频率从 30fps 降到 12fps。
 */

const IDLE_CAPTURE_FPS_DEFAULT = 12
const IDLE_CAPTURE_FPS_MIN = 5
const IDLE_CAPTURE_FPS_MAX = 30

/**
 * 相机/场景静止时的反射捕获帧率：此时只有灯光渐变、状态收敛等「非相机」变化在推动
 * 重捕，不需要 30fps 全速重绘。默认 12fps；`?reflection-idle-fps=30` 恢复旧行为，
 * 0/off/false 也按 30 处理（回滚开关）。
 */
let cachedIdleCaptureFps: number | null = null
export function resolveReflectionIdleCaptureFps(): number {
  if (cachedIdleCaptureFps !== null) return cachedIdleCaptureFps
  try {
    const rawValue = String(new URLSearchParams(window.location.search).get('reflection-idle-fps') || '').toLowerCase()
    if (rawValue === '0' || rawValue === 'off' || rawValue === 'false') return (cachedIdleCaptureFps = 30)
    if (!rawValue) return (cachedIdleCaptureFps = IDLE_CAPTURE_FPS_DEFAULT)
    const parsedFps = Number(rawValue)
    if (!Number.isFinite(parsedFps)) return (cachedIdleCaptureFps = IDLE_CAPTURE_FPS_DEFAULT)
    return (cachedIdleCaptureFps = Math.min(IDLE_CAPTURE_FPS_MAX, Math.max(IDLE_CAPTURE_FPS_MIN, parsedFps)))
  } catch {
    return (cachedIdleCaptureFps = IDLE_CAPTURE_FPS_DEFAULT)
  }
}

/**
 * 持久化缓存戳：替代每记录一次的 `JSON.stringify([...])`。对对象按 key 排序展开成
 * 扁平字符串（深度上限 2），浮点用 String() 保持与 JSON 一致的精度，避免对象 key
 * 顺序抖动导致缓存键失效。
 */
export function buildReflectionPersistenceStamp(parts: unknown[]): string {
  const stampEntries: string[] = []
  const flattenStampValue = (value: unknown, path: string, depth: number): void => {
    if (value === null || typeof value !== 'object') {
      stampEntries.push(path + '=' + String(value))
      return
    }
    if (depth >= 2) {
      stampEntries.push(path + '=?')
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => flattenStampValue(item, path + '[' + index + ']', depth + 1))
      return
    }
    const record = value as Record<string, unknown>
    for (const key of Object.keys(record).sort())
      flattenStampValue(record[key], path ? path + '.' + key : key, depth + 1)
  }
  parts.forEach((part, index) => flattenStampValue(part, 'p' + index, 0))
  return stampEntries.join('|')
}
