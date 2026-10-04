/**
 * 前端公共配置（AppPublicConfig）状态管理
 *
 * 职责：
 * - 维护前端公共配置的默认值（frontend / wsPush / eventLog / 等）。
 * - 提供配置的拉取、缓存、按分区订阅与变更通知（ConfigChangeListener）。
 * - 提供运行时配置查询入口（如 eventLog 运行时配置、wsPush 公共分区）。
 *
 * 依赖：
 * - vue 的 ref 响应式。
 * - @/services/api/system 的 fetchPublicSystemConfig。
 * - @/utils/core/logger 的日志。
 * - @homeos/shared 的 ClientPowerWakePublic 类型。
 * - @/types/frontend-config 的公共配置类型。
 *
 * 注意：
 * - 配置 key（apiTimeoutMs / widgetPollIntervals / ...）为配置 key，不翻译。
 */
import { ref } from 'vue'
import { fetchPublicSystemConfig } from '@/services/api/system'
import { logger } from '@/utils/core/logger'
import type { ClientPowerWakePublic } from '@homeos/shared'
import type {
  AppPublicConfig,
  ConfigChangeListener,
  ConfigSectionKey,
  EventLogRuntimeConfig,
  FrontendSection,
  WsPushPublicSection,
} from '@/types/frontend-config'

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
    screensaverEnabled: true,
    screensaverIdleMs: 120000,
    accentColor: '#3b82f6',
  },
  screensaver: {
    scale: 1.35,
    defaultMode: 'random',
    enableWeatherMode: false,
    instantEnter: true,
    instantLeave: true,
    brightness: 1,
    showBrand: true,
    showSeconds: true,
    showGregorianDate: true,
    showLunar: true,
    showWeatherIcon: true,
    showWeatherDesc: true,
    showWeatherStats: true,
    showWeatherMeta: true,
    timeSizeVw: 24,
    sepSizeVw: 17,
    secSizeVw: 7,
    metaSizeVw: 3,
    subMetaSizeVw: 2,
    brandSizePx: 22,
    weatherTempSizeVw: 22,
    weatherIconSizeVw: 10,
    weatherStatsSizePx: 15,
    brandTopVh: 5,
    contentShiftVh: 0,
  },
  weatherEffects: {
    enabled: true,
    preset: 'realistic',
    displayRoutes: ['dashboard'],
    useEntityAttributes: true,
    densityMultiplier: 0.78,
    windMultiplier: 1,
    attributeBlend: 0.92,
    starCount: 110,
    cloudLayers: 5,
    shootingStarRate: 0.00035,
    scenes: {
      clearDay: {},
      clearNight: {},
      partlyCloudy: {},
      cloudy: {},
      drizzle: {},
      rain: {},
      heavyRain: {},
      thunderstorm: {},
      snow: {},
      sleet: {},
      windy: {},
      hail: {},
      sandstorm: {},
    },
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
    ttsAlerts: {
      enabled: true,
      securityZone: true,
      securityAnomaly: true,
      safetySmoke: true,
      safetyGas: true,
      safetyWater: true,
      securityEmergency: true,
      presenceLeft: true,
      energyAnomaly: true,
      energyBudget: false,
      waterAnomaly: true,
      envMoldRisk: false,
      notificationDanger: true,
      notificationWarn: false,
    },
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
  orchestrator: {
    executionHistoryLimit: 100,
  },
  guest: {
    defaultHours: 24,
    extendHours: 24,
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
let _wsPush: WsPushPublicSection = { coldEntityOnDemand: true, roomBatchEmit: true }
let _loaded = false
const _listeners = new Set<ConfigChangeListener>()

/** 配置版本号：applyConfig / reload 后递增，供 computed 建立响应式依赖 */
export const configEpoch = ref(0)

export function getFrontendConfig(): FrontendSection {
  return _config
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
  const retentionDays =
    Number(cfg.retentionDays) > 0 ? Number(cfg.retentionDays) : defaults.eventLog.retentionDays
  const maxQueryHours =
    Number(cfg.maxQueryHours) > 0 ? Number(cfg.maxQueryHours) : retentionDays * 24
  const hourOptions =
    Array.isArray(cfg.hourOptions) && cfg.hourOptions.length
      ? cfg.hourOptions.map((h) => Number(h)).filter((h) => h > 0 && h <= maxQueryHours)
      : [3, 6, 12, 24].filter((h) => h <= maxQueryHours)
  return {
    retentionDays,
    maxQueryHours,
    hourOptions: hourOptions.length ? hourOptions : [maxQueryHours],
    timelineHours:
      Number(cfg.timelineHours) > 0 ? Number(cfg.timelineHours) : Math.min(12, maxQueryHours),
    timelineLimit: Number(cfg.timelineLimit) > 0 ? Number(cfg.timelineLimit) : 500,
    overlayHours:
      Number(cfg.overlayHours) > 0 ? Number(cfg.overlayHours) : Math.min(2, maxQueryHours),
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
        if (section === 'weatherEffects') {
          const weIn = incoming as AppPublicConfig['weatherEffects']
          const weDef = def as AppPublicConfig['weatherEffects']
          const weTarget = _app.weatherEffects
          const { scenes: incomingScenes, ...weRest } = weIn
          Object.assign(weTarget, weDef, weRest)
          if (incomingScenes && typeof incomingScenes === 'object') {
            const mergedScenes = { ...weDef.scenes }
            for (const [key, patch] of Object.entries(incomingScenes)) {
              if (patch && typeof patch === 'object') {
                mergedScenes[key as keyof typeof mergedScenes] = {
                  ...(mergedScenes[key as keyof typeof mergedScenes] || {}),
                  ...patch,
                }
              }
            }
            weTarget.scenes = mergedScenes
          }
        } else {
          Object.assign(_app[section] as object, def, incoming)
        }
      }
    }
  }
  if (data?.eventLog && typeof data.eventLog === 'object') {
    _app.eventLog = { ...defaults.eventLog, ...data.eventLog }
  }
  if (data?.energy && typeof data.energy === 'object') {
    _app.energy = { ...defaults.energy, ...data.energy }
  }
  if (data?.orchestrator && typeof data.orchestrator === 'object') {
    _app.orchestrator = { ...defaults.orchestrator, ...data.orchestrator }
  }
  if (data?.guest && typeof data.guest === 'object') {
    _app.guest = { ...defaults.guest, ...data.guest }
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

async function fetchAndApplyPublicConfig(): Promise<FrontendSection> {
  const { data } = await fetchPublicSystemConfig<Partial<AppPublicConfig>>()
  applyConfig(data)
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
      status === 502 ||
      status === 503 ||
      status === 504 ||
      code === 'ERR_NETWORK' ||
      code === 'ECONNABORTED'
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
