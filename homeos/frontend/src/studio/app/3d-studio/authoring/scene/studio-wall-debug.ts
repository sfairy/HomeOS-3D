/**
 * 墙体分层 solo（仅开发期）。
 *
 * 墙体是「挤出面 + 独立顶盖 + （本轮新增的）底盖」拼起来的，出问题时单看整墙很难判断
 * 是哪一层漏了面 —— 比如「墙顶像空心」既可能是顶盖太淡，也可能是挤出体本身开口。
 * `?wall-debug=side` 只留侧面、`top` 只留顶盖、`soffit` 只留洞口底盖，一眼就能定位。
 *
 * 生产构建里 `import.meta.env.DEV` 是 false，整个开关会被摇掉，URL 参数不会影响线上。
 */

/** 墙体分层：侧面 / 顶盖 / 洞口底盖。 */
export type WallDebugPart = 'side' | 'top' | 'soffit'

function readDebugParts(): Set<WallDebugPart> | null {
  const isDev = import.meta.env.DEV
  if (!isDev || !(typeof window < 'u')) return null
  const raw = new URLSearchParams(window.location.search).get('wall-debug')
  if (!raw) return null
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is WallDebugPart => part === 'side' || part === 'top' || part === 'soffit')
  return parts.length ? new Set(parts) : null
}

/**
 * 该分层当前是否可见。
 *
 * 没带 `?wall-debug` 时一律可见；带参数时是**并集**语义（`side,top` 只留这两层），
 * 方便逐层截对比图。
 */
export function isWallPartVisible(part: WallDebugPart): boolean {
  const debugParts = readDebugParts()
  return !debugParts || debugParts.has(part)
}
