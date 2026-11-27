/** 前端公共配置（AppPublicConfig）状态管理 */
import { ref } from 'vue'
import { logger } from '@/kernel/core/index'
import { AGENT_QUICK_PROMPTS } from '@/kernel/index'
import { SS_DEFAULTS } from '@/kernel/index'
import type { ClientPowerWakePublic } from '@homeos/shared'
// 语音告警默认矩阵单点在 ``@homeos/shared``：这里只是「公开配置还没拉到时」的一份兜底，
// 再抄一遍 14 个布尔键就等于让「后端默认值」和「前端兜底值」各走各的（见 voice-alert.ts）。
import { DEFAULT_VOICE_ALERT_RULES } from '@homeos/shared/notification/voice-alert'
import type {
  AppPublicConfig,
  ConfigChangeListener,
  ConfigSectionKey,
  EventLogRuntimeConfig,
  FrontendSection,
  WsPushPublicSection,
} from '@/kernel/frontend-config'

const defaults: AppPublicConfig = {
  frontend: {
    apiTimeoutMs: 15000,
    apiRetryMax: 2,
    haDisconnectDebounceMs: 5000,
    initialStatesWaitMs: 8000,
    entityCacheEnabled: true,
    entityCacheMaxAgeMs: 24 * 60 * 60 * 1000,
    entityCacheSaveDebounceMs: 10_000,
    rebuildChunkSize: 500,
    rebuildDebounceMs: 50,
    maxListeners: 200,
    callDedupWindowMs: 500,
    maxRemoteNotifications: 100,
    sessionRefreshHours: 6,
    widgetPollIntervals: {},
    optimisticTtlMs: 6000,
    largeEntityThreshold: 2000,
    workerDerivedThreshold: 2000,
    initStatesBatchSize: 400,
    apiRetryDelayMs: 1000,
  },
  ui: {
    scaleBaseWidth: 1366,
    scaleBaseHeight: 1024,
    accentColor: '#3b82f6',
    // 管家快捷指令：配置里带了这个键就用配置（含空数组 = 关闭），缺省用内置默认。
    // 这里显式写一份，是为了在「未登录 / 公开配置拉取失败」时面板仍有入口可用。
    agentQuickPrompts: AGENT_QUICK_PROMPTS.map((item) => ({ ...item })),
  },
  screensaver: {
    screensaverEnabled: true,
    screensaverIdleMs: 120000,
    // 几何 / 显示默认值与面板共用一份（shared/constants/screensaver-defaults），
    // 不再各抄 25 个键。
    ...SS_DEFAULTS,
  },
  voice: {
    sttMode: 'browser',
    language: 'zh-CN',
    sttEntityId: '',
    useHaConversation: false,
    ttsEnabled: true,
    ttsOutputMode: 'ha',
    ttsMediaPlayerId: '',
    ttsMediaPlayerIds: [],
    dailyAdvisorSpeak: false,
    dailyAdvisorSpeakHour: 20,
    dailyAdvisorTtsDaytime: '',
    dailyAdvisorTtsEvening: '',
    interactionMode: 'push',
    wakeWordEnabled: false,
    continuousConversation: false,
    wakeWords: ['小智'],
    ttsAlertTemplates: {},
    customTtsAlerts: [],
    entityTtsAlerts: [],
    rooms: [],
    // 与后端 DEFAULT_NOTIFICATION_CONFIG["voice"]["ttsAlerts"] 同源（见 voice-alert.ts）。
    // 展开而不是直接引用：调用方会就地改这个对象，共享单例会被跨实例改写。
    ttsAlerts: { ...DEFAULT_VOICE_ALERT_RULES },
  },
  voiceCommands: [],
  eventLog: {
    retentionDays: 7,
    maxQueryHours: 168,
    hourOptions: [3, 6, 12, 24, 48, 72, 168],
    timelineHours: 12,
    timelineLimit: 500,
    overlayHours: 2,
  },
  energy: {
    learningPeriodDays: 7,
    chartHours: 168,
  },
  security: {
    sensorAlertCooldownSec: 60,
  },
  clientPowerWake: {
    clients: [],
  },
  other: {
    advisorTipActionsBound: [],
  },
  roomMeta: {
    roomLabels: {},
    deviceGroupLabels: { other: '其他' },
  },
}

let _config: FrontendSection = { ...defaults.frontend }
let _app: AppPublicConfig = structuredClone(defaults)
let _wsPush: WsPushPublicSection = { coldEntityOnDemand: true }
let _loaded = false
const _listeners = new Set<ConfigChangeListener>()

/** 配置版本号：applyConfig / reload 后递增，供 computed 建立响应式依赖 */
export const configEpoch = ref(0)

export function getFrontendConfig(): FrontendSection {
  return _config
}

/**
 * 读取某个小组件的独立轮询间隔覆写（frontend.widgetPollIntervals[key]）。
 *
 * 用于让「高级参数 → frontend.widgetPollIntervals」真正生效：以小组件 key
 * （如 weather / homeClimateChart）为键配置毫秒间隔，命中且为合法正数时覆盖代码内置默认值。
 * 未配置或非法时返回 fallback，保持原行为。
 */
export function getWidgetPollInterval(key: string, fallback: number): number {
  const table = getFrontendConfig().widgetPollIntervals
  if (!table || typeof table !== 'object') return fallback
  const raw = (table as Record<string, unknown>)[key]
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** 读取 frontend 分区数值参数（归一化类型与 fallback） */
function getFrontendInt(key: keyof FrontendSection, fallback: number): number {
  const raw = getFrontendConfig()[key]
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function getLargeEntityThreshold(): number {
  return getFrontendInt('largeEntityThreshold', defaults.frontend.largeEntityThreshold)
}

export function getWorkerDerivedThreshold(): number {
  return getFrontendInt('workerDerivedThreshold', defaults.frontend.workerDerivedThreshold)
}

export function getMaxStateListeners(): number {
  const raw = getFrontendConfig().maxListeners
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : defaults.frontend.maxListeners
}

export function getWsPushPublicConfig(): WsPushPublicSection {
  return _wsPush
}

export function getConfigSection<K extends ConfigSectionKey>(section: K): AppPublicConfig[K] {
  return (_app[section] ?? {}) as AppPublicConfig[K]
}

export function getEventLogConfig(): EventLogRuntimeConfig {
  const cfg = _app.eventLog || defaults.eventLog
  const retentionDays = Number(cfg.retentionDays) > 0 ? Number(cfg.retentionDays) : defaults.eventLog.retentionDays
  const maxQueryHours = Number(cfg.maxQueryHours) > 0 ? Number(cfg.maxQueryHours) : retentionDays * 24
  const hourOptions =
    Array.isArray(cfg.hourOptions) && cfg.hourOptions.length
      ? cfg.hourOptions.map((h) => Number(h)).filter((h) => h > 0 && h <= maxQueryHours)
      : [3, 6, 12, 24].filter((h) => h <= maxQueryHours)
  return {
    retentionDays,
    maxQueryHours,
    hourOptions: hourOptions.length ? hourOptions : [maxQueryHours],
    timelineHours: Number(cfg.timelineHours) > 0 ? Number(cfg.timelineHours) : Math.min(12, maxQueryHours),
    timelineLimit: Number(cfg.timelineLimit) > 0 ? Number(cfg.timelineLimit) : 500,
    overlayHours: Number(cfg.overlayHours) > 0 ? Number(cfg.overlayHours) : Math.min(2, maxQueryHours),
  }
}

export function getMaxRemoteNotifications(): number {
  return getFrontendInt('maxRemoteNotifications', defaults.frontend.maxRemoteNotifications)
}

/** 订阅配置变更，返回取消订阅函数 */
export function onConfigChange(fn: ConfigChangeListener): () => void {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

function applyConfig(data: Partial<AppPublicConfig> | null | undefined): void {
  for (const section of Object.keys(defaults) as ConfigSectionKey[]) {
    const incoming = data?.[section]
    if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
      const def = defaults[section]
      if (def && typeof def === 'object' && !Array.isArray(def)) {
        Object.assign(_app[section] as object, def, incoming)
      }
    }
  }
  if (data?.eventLog && typeof data.eventLog === 'object') {
    _app.eventLog = { ...defaults.eventLog, ...data.eventLog }
  }
  if (data?.energy && typeof data.energy === 'object') {
    _app.energy = { ...defaults.energy, ...data.energy }
  }
  if (data?.security && typeof data.security === 'object') {
    _app.security = { ...defaults.security, ...data.security }
  }
  if (data?.roomMeta && typeof data.roomMeta === 'object') {
    _app.roomMeta = {
      roomLabels: { ...(defaults.roomMeta?.roomLabels || {}), ...(data.roomMeta.roomLabels || {}) },
      deviceGroupLabels: {
        ...(defaults.roomMeta?.deviceGroupLabels || {}),
        ...(data.roomMeta.deviceGroupLabels || {}),
      },
    }
  }
  if (Array.isArray(data?.haAreas)) {
    _app.haAreas = data.haAreas
      .map((area) => ({
        id: String(area?.id || '').trim(),
        name: String(area?.name || area?.id || '').trim(),
      }))
      .filter((area) => area.id)
  }
  if (data?.clientPowerWake && typeof data.clientPowerWake === 'object') {
    const incoming = data.clientPowerWake as ClientPowerWakePublic
    _app.clientPowerWake = {
      clients: Array.isArray(incoming.clients)
        ? incoming.clients
            .map((row) => ({
              id: String(row?.id || '').trim(),
              chargerSwitchEntityId: String(row?.chargerSwitchEntityId || '').trim(),
              presenceWakeEnabled: row?.presenceWakeEnabled !== false,
            }))
            .filter((row) => row.id && row.chargerSwitchEntityId && row.presenceWakeEnabled)
        : [],
    }
  }
  _config = _app.frontend
  if (data?.wsPush && typeof data.wsPush === 'object') {
    _wsPush = { ..._wsPush, ...data.wsPush }
    _app.wsPush = _wsPush
  }
  configEpoch.value += 1
  const sections = Object.keys(_app)
  for (const fn of _listeners) {
    try {
      fn(sections)
    } catch {
      /* 忽略监听器错误 */
    }
  }
}

const CONFIG_CACHE_KEY = 'homeos.publicConfig.v1'
/** 缓存有效期：过期的配置可能缺少新增字段（会退回代码默认值），但比「等待网络」好。 */
const CONFIG_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface CachedConfig {
  at: number
  data: Partial<AppPublicConfig>
}

function readCachedConfig(): Partial<AppPublicConfig> | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedConfig
    if (!parsed?.data || typeof parsed.at !== 'number') return null
    if (Date.now() - parsed.at > CONFIG_CACHE_TTL_MS) return null
    return parsed.data
  } catch {
    // 隐私模式 / 配额满 / 内容损坏：缓存只是加速手段，读不到就当作没有。
    return null
  }
}

function writeCachedConfig(data: Partial<AppPublicConfig> | null | undefined): void {
  if (!data || typeof localStorage === 'undefined') return
  try {
    const payload: CachedConfig = { at: Date.now(), data }
    localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // 写失败不影响本次运行（配置已在内存里）。
  }
}

/**
 * 用上一份公开配置**同步**预填，供启动路径决定「是否还要等第一次网络往返再挂载」。
 *
 * 为什么值得：``main.ts`` 的主应用分支原先 ``await loadFrontendConfig()`` 之后才挂载，
 * 而 axios 超时是 15s。后端冷启动 / 家庭网络抖动时，用户看到的是「外套已绘制、Vue 未挂载」
 * 的空壳。有了这一份快照，首帧可以立刻挂载，配置差异由随后的 ``loadFrontendConfig()``
 * 补齐（它会重新 apply 并触发 ``onConfigChange``）。
 *
 * 返回 ``true`` 表示已应用缓存，调用方可以立即挂载。
 */
export function primeFrontendConfigFromCache(): boolean {
  const cached = readCachedConfig()
  if (!cached) return false
  applyConfig(cached)
  return true
}

export function clearFrontendConfigCache(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(CONFIG_CACHE_KEY)
  } catch {
    // 同 readCachedConfig：缓存不可用时无需处理。
  }
}

async function fetchAndApplyPublicConfig(): Promise<FrontendSection> {
  // API 客户端同步读本模块的重试配置：静态引用 system 会形成 client → config → system → client 的值循环。
  const { fetchPublicSystemConfig } = await import('@/kernel/http/index')
  const { data } = await fetchPublicSystemConfig<Partial<AppPublicConfig>>()
  applyConfig(data)
  writeCachedConfig(data)
  _loaded = true
  return _config
}

export async function loadFrontendConfig(): Promise<FrontendSection> {
  if (_loaded) return _config
  try {
    return await fetchAndApplyPublicConfig()
  } catch {
    _loaded = true
  }
  return _config
}

export async function reloadFrontendConfig(): Promise<FrontendSection> {
  try {
    return await fetchAndApplyPublicConfig()
  } catch (err) {
    // 切回标签页时的后台刷新：后端未就绪（502/网络）属预期，降噪为 debug
    const status = (err as { response?: { status?: number } })?.response?.status
    const code = (err as { code?: string })?.code
    const transient =
      status === 502 || status === 503 || status === 504 || code === 'ERR_NETWORK' || code === 'ECONNABORTED'
    if (transient) {
      logger.debug('[前端配置] 重载已跳过(后端不可用),保留缓存配置')
    } else {
      logger.warn('[前端配置] 重载失败,保留缓存配置', err)
    }
    return _config
  }
}

export function setupFrontendConfigVisibilitySync(): () => void {
  if (typeof document === 'undefined') return () => {}
  let timer: ReturnType<typeof setTimeout> | null = null
  const onVisible = () => {
    if (document.hidden) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      reloadFrontendConfig().catch((err) => {
        logger.warn('[前端配置] 可见性重载失败', err)
      })
    }, 400)
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    if (timer) clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
