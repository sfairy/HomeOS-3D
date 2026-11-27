/**
 * GPU 崩溃熔断与「兼容模式」（0.8.6）。
 *
 * 为什么需要它：浏览器（实测 Edge 157）的 GPU 进程会因为单次提交过长 / 驱动问题被
 * 看门狗杀掉，之后整个进程以 `--use-gl=disabled` 重启 —— 从那一刻起 WebGL 直接不可用，
 * 用户看到的是「3D 白屏 + 控制台刷 WebGL context 创建失败」，重开页面也只是从头再崩一遍。
 * 这种情况下继续按「最高画质」引导是没意义的：应用得先能跑起来。
 *
 * 策略：
 * 1. 把「GL 不可用」「上下文丢失」记成带时间的**事件**（localStorage，跨页面存活）；
 * 2. 短窗口内连续出现 = 判定为崩溃循环，**下一次引导自动进兼容模式**；
 * 3. 兼容模式只砍可选项（像素比、反射分辨率、阴影图尺寸、着色器预热、阴影烘焙节奏），
 *    不改场景内容与交互 —— 画质下降，但 3D 仍然可用；
 * 4. `?studio-compat=1` 强制开启（没有崩溃也能用），`?studio-compat=0` 强制关闭并清空
 *    事件记录（用户自己修好了浏览器 / 换了机器时的出口）。
 *
 * 只缓存「事件」不缓存「结论」：判定每次现算，浏览器重启后 GL 恢复即自动退出兼容模式。
 */
import { urlFlag } from './render-kit/url-flags'

export type StudioGpuIncidentKind = 'webgl-unavailable' | 'context-lost'

export interface StudioGpuIncident {
  at: number
  kind: StudioGpuIncidentKind
}

/** 事件记录的存储键；带版本后缀，格式变更时旧记录自然失效。 */
const INCIDENTS_STORAGE_KEY = 'homeos.studio.gpu-incidents.v1'
/** 超过一天的事件不再参与判定（昨天的崩溃不该影响今天的启动）。 */
const INCIDENT_TTL_MS = 24 * 60 * 60 * 1000
/** 崩溃循环的判定窗口与阈值：10 分钟内 ≥2 次即认为「同一环境反复崩」。 */
const CRASH_LOOP_WINDOW_MS = 10 * 60 * 1000
const CRASH_LOOP_THRESHOLD = 2
/** 同一页面内重复上报的去抖（一次引导可能同时命中多个事件源）。 */
const DUPLICATE_INCIDENT_WINDOW_MS = 5 * 1000

/**
 * 兼容模式判定结果缓存（见 `resolveCompatDecision`）。
 *
 * 为什么缓存：`isStudioCompatMode()` 在 `computeRenderPixelRatio` 等**每帧**都会走的路径上，
 * 现读 localStorage + JSON.parse 是每帧一次分配；写入（`?studio-compat=0` 的清理）更不该每帧做。
 * 5s 的 TTL 对分钟级的崩溃熔断完全够用，记录新事件时再主动失效。
 */
let cachedDecision: { active: boolean; source: 'url' | 'crash-loop' | null } | null = null
let cachedDecisionAt = 0
let urlResetApplied = false

const DECISION_CACHE_MS = 5000

/** 让下一次判定重算（新事件写入 / 手动清理后调用）。 */
function invalidateCompatDecision(): void {
  cachedDecision = null
}

const COMPAT_DISABLED_FLAGS = ['0', 'false', 'off']
const COMPAT_ENABLED_FLAGS = ['1', 'true', 'on']

function readFlag(): string | null {
  try {
    return (urlFlag('studio-compat') || '').toLowerCase() || null
  } catch {
    return null
  }
}

function isUrlForcedOff(): boolean {
  const flag = readFlag()
  return flag !== null && COMPAT_DISABLED_FLAGS.includes(flag)
}

function isUrlForcedOn(): boolean {
  const flag = readFlag()
  return flag !== null && COMPAT_ENABLED_FLAGS.includes(flag)
}

/** localStorage 在隐私模式 / 禁用存储时会抛异常：任何失败都按「没有记录」处理。 */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** 单条记录 → 事件；非法 / 过期返回 null（坏数据不该让整个判定抛异常）。 */
function toIncident(entry: unknown, now: number): StudioGpuIncident | null {
  if (!entry || typeof entry !== 'object') return null
  const record = entry as Partial<StudioGpuIncident>
  const at = Number(record.at)
  const kind = record.kind
  if (!Number.isFinite(at) || now - at > INCIDENT_TTL_MS) return null
  if (kind !== 'webgl-unavailable' && kind !== 'context-lost') return null
  return { at, kind }
}

function parseIncidents(raw: string | null): StudioGpuIncident[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const now = Date.now()
    const incidents: StudioGpuIncident[] = []
    for (const entry of parsed) {
      const incident = toIncident(entry, now)
      if (incident) incidents.push(incident)
    }
    return incidents
  } catch {
    return []
  }
}

/** 读取仍在有效期内的崩溃事件（新 → 旧）。 */
export function readStudioGpuIncidents(): StudioGpuIncident[] {
  const store = storage()
  if (!store) return []
  try {
    return parseIncidents(store.getItem(INCIDENTS_STORAGE_KEY)).sort((left, right) => right.at - left.at)
  } catch {
    return []
  }
}

/**
 * 记录一次 GPU 相关故障。同一秒内重复上报（例如引导里多个探测点同时失败）只留一条。
 * 写入失败静默：熔断是「锦上添花」，不能因为它让引导报错。
 */
export function recordStudioGpuIncident(kind: StudioGpuIncidentKind): void {
  const store = storage()
  if (!store) return
  const now = Date.now()
  const incidents = readStudioGpuIncidents()
  const isDuplicate = incidents.some(
    (incident) => incident.kind === kind && now - incident.at < DUPLICATE_INCIDENT_WINDOW_MS,
  )
  if (isDuplicate) return
  try {
    store.setItem(INCIDENTS_STORAGE_KEY, JSON.stringify([{ at: now, kind }, ...incidents].slice(0, 20)))
  } catch {
    /* 配额满 / 被禁用：放弃这次记录 */
  }
  // 新事件可能刚好跨过熔断阈值：让下一次判定立刻重算，不等 TTL。
  invalidateCompatDecision()
}

/** 清空崩溃事件（用户显式关闭兼容模式时调用，等价于「我认为已经修好了」）。 */
export function clearStudioGpuIncidents(): void {
  try {
    storage()?.removeItem(INCIDENTS_STORAGE_KEY)
  } catch {
    /* 清不掉就让它自然过期 */
  }
  invalidateCompatDecision()
}

/** 窗口内连续崩溃 → true。 */
export function isStudioGpuCrashLoop(): boolean {
  const now = Date.now()
  const recent = readStudioGpuIncidents().filter((incident) => now - incident.at <= CRASH_LOOP_WINDOW_MS)
  return recent.length >= CRASH_LOOP_THRESHOLD
}

/**
 * 兼容模式判定结果（带短 TTL 缓存）。
 */
function resolveCompatDecision(): { active: boolean; source: 'url' | 'crash-loop' | null } {
  const now = Date.now()
  if (cachedDecision && now - cachedDecisionAt < DECISION_CACHE_MS) return cachedDecision
  let decision: { active: boolean; source: 'url' | 'crash-loop' | null }
  if (isUrlForcedOff()) {
    // 硬关闭 = 用户认为自己已经修好了：清一次事件，避免下次引导又被自动熔断。
    if (!urlResetApplied) {
      urlResetApplied = true
      clearStudioGpuIncidents()
    }
    decision = { active: false, source: null }
  } else if (isUrlForcedOn()) {
    decision = { active: true, source: 'url' }
  } else {
    const isLoop = isStudioGpuCrashLoop()
    decision = { active: isLoop, source: isLoop ? 'crash-loop' : null }
  }
  cachedDecision = decision
  cachedDecisionAt = now
  return decision
}

/** 当前是否处于兼容模式（结论按 5s 缓存，见 `resolveCompatDecision`）。 */
export function isStudioCompatMode(): boolean {
  return resolveCompatDecision().active
}

/** 兼容模式来源，供日志 / 提示区分「用户强制」与「自动熔断」。 */
export function studioCompatModeSource(): 'url' | 'crash-loop' | null {
  return resolveCompatDecision().source
}

/** 兼容模式下给用户看的一句话（含退出方式）。 */
export const STUDIO_COMPAT_NOTICE =
  '已启用 3D 兼容模式：画质已降低以避免 GPU 反复崩溃（像素比 / 反射 / 阴影图 / 着色器预热）。浏览器修好后加 ?studio-compat=0 可恢复完整画质。'

/**
 * 兼容模式下的像素比上限。
 *
 * 像素面积是 GPU 压力最直接的一阶项（DPR 2 → 4 倍像素），先压到 1；
 * 其余预算（反射、阴影）各自在自己的策略函数里收口。
 */
export const STUDIO_COMPAT_MAX_PIXEL_RATIO = 1

/** 兼容模式下的太阳光阴影图尺寸上限。 */
export const STUDIO_COMPAT_SUN_SHADOW_MAP_SIZE = 1024

/** 兼容模式下的地面反射清晰度上限（256 是反射链路最省的档位）。 */
export const STUDIO_COMPAT_REFLECTION_RESOLUTION = 256

/**
 * 兼容模式下一次 `sync` 允许烘焙几层接触阴影。
 *
 * 编辑器此前是 `Infinity`：多层户型的冷启动会在**一帧**里连做 N 次全屏烘焙
 * （每层一次 1024² 颜色 + 表面图集），这正是 GPU 看门狗最容易超时的地方。
 * 拆到多帧对最终画质没有影响（控制器会把剩余楼层放回待办并 requestFrame）。
 */
export const STUDIO_COMPAT_CAPTURES_PER_SYNC = 1
