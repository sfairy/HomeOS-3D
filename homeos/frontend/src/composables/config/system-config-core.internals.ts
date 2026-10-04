/**
 * 系统配置核心组合式函数
 * 
 * 职责：提供系统配置的加载、保存、元数据管理等核心功能
 * 依赖：
 *   - @/services/api/system - 系统配置 API 服务
 *   - @/types/system-config - 系统配置类型定义
 *   - @/utils/core/poll-scheduler - 共享请求调度
 *   - vue - 响应式系统
 * 
 * 功能模块：
 *   - useSystemConfig - 系统配置的加载与保存
 *   - getSectionMeta / getSectionLabels - 配置分区元数据
 *   - getSectionCategories - 配置分类信息
 *   - isSystemConfigConflictError - 冲突错误检测
 */
import { fetchSystemConfig, updateSystemConfig } from '@/services/api/system'
import type { NotifyType } from '@/types/notify'
import type { SystemConfig, SystemConfigLoadOptions, SystemConfigPatch, SystemConfigSaveOptions } from '@/types/system-config'
import { invalidateSharedFetch, sharedFetch } from '@/utils/core/poll-scheduler'
import { Bell, Box, Brain, Cog, Database, DollarSign, Droplets, Home, Layout, Leaf, Monitor, Moon, Plug, Radio, Server, Shield, Sun, Zap } from '@lucide/vue'
import type { Component } from 'vue'
import { ref } from 'vue'

type SectionMetaStatic = {
  icon: Component
  color: string
  bg: string
  accent: string
  desc?: string
}

// ── useSystemConfig ──
let cachedConfig: SystemConfig | null = null
let loadEpoch = 0

/** 全局响应式配置引用，所有使用 useSystemConfig 的组件共享，配置更新后自动响应 */
export const systemConfigRef = ref<SystemConfig | null>(cachedConfig)

/** 与后端 CONFIG_REPLACE_ON_UPDATE_SECTIONS 对齐：整段替换以支持删除 Record 内键 */
const CONFIG_REPLACE_SECTIONS = new Set(['envSensorMap', 'mediaPlaylists'])

/** 与后端 CONFIG_REPLACE_NESTED_FIELDS 对齐 */
const CONFIG_REPLACE_NESTED: Record<string, Set<string>> = {
  other: new Set(['advisorTipActions']),
  voice: new Set(['ttsAlertTemplates']),
  frontend: new Set(['widgetPollIntervals']),
}

function mergeConfigPatch(base: SystemConfig | null, patch: SystemConfigPatch): SystemConfig {
  // 动态分区键写入；顶层 SystemConfig 已去掉 index signature，避免整表被稀释为 unknown
  const out = { ...(base || {}) } as SystemConfig & Record<string, unknown>
  for (const [key, val] of Object.entries(patch || {})) {
    if (CONFIG_REPLACE_SECTIONS.has(key)) {
      out[key] = val && typeof val === 'object' && !Array.isArray(val) ? structuredClone(val) : val
      continue
    }
    if (val && typeof val === 'object' && !Array.isArray(val) && CONFIG_REPLACE_NESTED[key]) {
      const nested = CONFIG_REPLACE_NESTED[key]
      const section = {
        ...(out[key] && typeof out[key] === 'object' ? (out[key] as Record<string, unknown>) : {}),
      }
      for (const [nk, nv] of Object.entries(val as Record<string, unknown>)) {
        if (nested.has(nk)) {
          section[nk] =
            nv && typeof nv === 'object' && !Array.isArray(nv) ? structuredClone(nv) : nv
        } else if (
          nv &&
          typeof nv === 'object' &&
          !Array.isArray(nv) &&
          section[nk] &&
          typeof section[nk] === 'object' &&
          !Array.isArray(section[nk])
        ) {
          section[nk] = {
            ...(section[nk] as Record<string, unknown>),
            ...(nv as Record<string, unknown>),
          }
        } else {
          section[nk] = nv
        }
      }
      out[key] = section
      continue
    }
    if (
      val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      out[key] &&
      typeof out[key] === 'object' &&
      !Array.isArray(out[key])
    ) {
      out[key] = { ...(out[key] as Record<string, unknown>), ...(val as Record<string, unknown>) }
    } else {
      out[key] = val
    }
  }
  return out
}

/** 局部更新运行参数并合并全局缓存（默认附带乐观锁 revision） */
export async function fetchSystemConfigFresh(): Promise<SystemConfig | null> {
  invalidateSharedFetch('system:config')
  const { data } = await fetchSystemConfig()
  cachedConfig = data ?? null
  systemConfigRef.value = cachedConfig
  return cachedConfig
}

let patchQueue: Promise<unknown> = Promise.resolve()

async function applySystemConfigResponse(partial: SystemConfigPatch, data: unknown) {
  invalidateSharedFetch('system:config')
  if (data && typeof data === 'object') {
    cachedConfig = data as SystemConfig
    systemConfigRef.value = cachedConfig
  } else if (partial && typeof partial === 'object') {
    cachedConfig = mergeConfigPatch(cachedConfig, partial)
    systemConfigRef.value = cachedConfig
  }
  return cachedConfig
}

async function sendSystemConfigPatch(partial: SystemConfigPatch, opts: SystemConfigSaveOptions) {
  const body: Record<string, unknown> = { ...(partial || {}) }
  if (!opts.skipRevisionCheck) {
    const rev = opts.expectedUpdatedAt ?? cachedConfig?._configUpdatedAt
    if (rev) body.expectedUpdatedAt = rev
  }
  const { data } = await updateSystemConfig(body)
  return applySystemConfigResponse(partial, data)
}

/** 局部更新运行参数并合并全局缓存（默认附带乐观锁 revision） */
export async function patchSystemConfig(
  partial: SystemConfigPatch,
  opts: SystemConfigSaveOptions = {},
) {
  const run = async () => {
    try {
      return await sendSystemConfigPatch(partial, opts)
    } catch (e) {
      if (opts.skipRevisionCheck || !isSystemConfigConflictError(e)) throw e
      await fetchSystemConfigFresh()
      return await sendSystemConfigPatch(partial, { ...opts, expectedUpdatedAt: undefined })
    }
  }
  const queued: Promise<SystemConfig | null> = patchQueue.then(run, run)
  patchQueue = queued.then(
    () => undefined,
    () => undefined,
  )
  return queued
}

export function isSystemConfigConflictError(e: unknown): boolean {
  return (e as { response?: { status?: number } })?.response?.status === 409
}

/** 409 冲突时清空缓存、从服务端重新拉取并提示；返回 true 表示已处理冲突 */
export async function handleSystemConfigPatchError(
  e: unknown,
  uiStore: { notify: (msg: string, type?: NotifyType, duration?: number) => void },
): Promise<boolean> {
  if (!isSystemConfigConflictError(e)) return false
  loadEpoch++
  try {
    const { data } = await fetchSystemConfig()
    cachedConfig = data ?? null
    systemConfigRef.value = cachedConfig
  } catch {
    cachedConfig = null
    systemConfigRef.value = null
  }
  uiStore.notify('配置已被其他终端修改，已重新加载', 'warning')
  return true
}

/** 全局 /system/config 缓存（多面板共享） */
export function useSystemConfig() {
  const loading = ref(false)

  async function load({ force = false }: SystemConfigLoadOptions = {}) {
    if (!force && cachedConfig) return cachedConfig

    if (force) {
      return fetchSystemConfigFresh()
    }

    loading.value = true
    const epoch = ++loadEpoch
    try {
      const data = await sharedFetch(
        'system:config',
        async () => {
          const { data: resp } = await fetchSystemConfig()
          return resp ?? null
        },
        5000,
      )
      if (epoch !== loadEpoch) return cachedConfig
      cachedConfig = data
      systemConfigRef.value = cachedConfig
      return cachedConfig
    } finally {
      if (epoch === loadEpoch) loading.value = false
    }
  }

  async function save(config: SystemConfigPatch, opts?: SystemConfigSaveOptions) {
    return patchSystemConfig(config, opts)
  }

  function getConfigUpdatedAt() {
    return cachedConfig?._configUpdatedAt ?? null
  }

  function getCached() {
    return cachedConfig
  }

  function invalidate() {
    loadEpoch++
    cachedConfig = null
    systemConfigRef.value = null
    invalidateSharedFetch('system:config')
  }

  return {
    loading,
    load,
    save,
    patch: patchSystemConfig,
    fetchFresh: fetchSystemConfigFresh,
    getCached,
    getConfigUpdatedAt,
    invalidate,
  }
}

// ── useSystemConfigMeta ──
const SECTION_LABELS: Record<string, string> = {
  notification: '通知推送',
  security: '安防阈值',
  water: '用水监测',
  iaq: '室内空气质量',
  energy: '能源监测',
  pricing: '阶梯/固定电价',
  other: '其它参数',
  frontend: '前端性能',
  ui: '界面墙板',
  screensaver: '锁屏屏保',
  external: '外部集成',
  haConnector: 'HA连接运维',
  ops: '运维调优',
  stateStore: '状态存储',
  wsPush: '实时推送',
  commandProxy: '命令代理',
  webrtc: 'WebRTC / TURN',
  homeMode: '家庭模式引擎',
  circadian: '昼夜节律照明',
  childMode: '儿童模式',
}

const SECTION_DESCS: Record<string, string> = {
  notification: '通知容量与设备冷却（免打扰与总开关在告警规则页）',
  security: '安防检测与异常阈值（presence 自动布防等在安防联动页）',
  water: '漏水与超量用水监控',
  iaq: '霉变预警冷却与空气质量联动',
  childMode: '白名单、时间窗与每日媒体时长',
  energy: '能耗监测与基线学习（电表绑定见首装向导）',
  pricing: '峰谷时段、年阶梯或固定单价',
  other: '通用运行参数（保留天数统一在「数据保留」页管理）',
  frontend: '渲染帧率与加载性能（会话刷新在访问控制页）',
  ui: '墙板展示与交互',
  screensaver: '锁屏元素尺寸、显隐与预览',
  external: '第三方 API 集成（TTS 音箱在语音中心）',
  haConnector: '重连退避、命令队列、入口合并与断连 REST 补同步',
  ops: '数据库清理节奏与 EventLog 时间线缓存（持久化筛选在连接页）',
  stateStore: 'L1/Redis 写入、断连陈旧阈值与 REST 缓存',
  wsPush: '关键域即时推、sensor 批推与断线回放',
  commandProxy: '命令幂等与去重',
  webrtc: '跨网摄像头 TURN/STUN（与 HA ICE 合并）',
  homeMode: '触发冷却与执行历史上限',
  circadian: '节律照明（天气实体在集成绑定）',
}

const SECTION_META_STATIC: Record<string, SectionMetaStatic> = {
  notification: { icon: Bell, color: 'text-sky-400', bg: 'bg-sky-500/10', accent: '#38bdf8' },
  security: { icon: Shield, color: 'text-red-400', bg: 'bg-red-500/10', accent: '#f87171' },
  water: { icon: Droplets, color: 'text-cyan-400', bg: 'bg-cyan-500/10', accent: '#22d3ee' },
  energy: { icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10', accent: '#fbbf24' },
  pricing: {
    icon: DollarSign,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    accent: '#34d399',
  },
  other: { icon: Box, color: 'text-gray-400', bg: 'bg-white/5', accent: '#94a3b8' },
  frontend: { icon: Monitor, color: 'text-cyan-400', bg: 'bg-cyan-500/10', accent: '#22d3ee' },
  ui: { icon: Layout, color: 'text-indigo-400', bg: 'bg-indigo-500/10', accent: '#818cf8' },
  screensaver: { icon: Moon, color: 'text-violet-300', bg: 'bg-violet-500/10', accent: '#a78bfa' },
  external: { icon: Plug, color: 'text-orange-400', bg: 'bg-orange-500/10', accent: '#fb923c' },
  haConnector: { icon: Plug, color: 'text-blue-400', bg: 'bg-blue-500/10', accent: '#60a5fa' },
  ops: { icon: Server, color: 'text-slate-400', bg: 'bg-slate-500/10', accent: '#94a3b8' },
  stateStore: {
    icon: Database,
    color: 'text-indigo-300',
    bg: 'bg-indigo-500/10',
    accent: '#818cf8',
  },
  wsPush: { icon: Radio, color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', accent: '#e879f9' },
  commandProxy: { icon: Shield, color: 'text-rose-300', bg: 'bg-rose-500/10', accent: '#fb7185' },
  webrtc: { icon: Radio, color: 'text-teal-300', bg: 'bg-teal-500/10', accent: '#2dd4bf' },
  homeMode: { icon: Home, color: 'text-orange-300', bg: 'bg-orange-500/10', accent: '#fdba74' },
  circadian: { icon: Sun, color: 'text-yellow-300', bg: 'bg-yellow-500/10', accent: '#facc15' },
}

const DEFAULT_SECTION_META_STATIC: SectionMetaStatic = {
  icon: Cog,
  color: 'text-gray-400',
  bg: 'bg-white/5',
  accent: '#0A84FF',
}

/** 与设置顶栏六组（connect / home / display / automate / interact / system）对齐 */
const SECTION_CATEGORY_DEFS = [
  {
    id: 'connect',
    label: '入门与连接',
    desc: 'Home Assistant 连接、状态存储与实时推送',
    accent: '#60a5fa',
    icon: Home,
    sections: ['haConnector', 'stateStore', 'wsPush', 'commandProxy', 'webrtc'],
  },
  {
    id: 'home',
    label: '家居配置',
    desc: '能源、空气质量、阶梯电价与用水',
    accent: '#34d399',
    icon: Leaf,
    sections: ['energy', 'iaq', 'pricing', 'water'],
  },
  {
    id: 'display',
    label: '界面与体验',
    desc: '前端性能、墙板与屏保',
    accent: '#818cf8',
    icon: Layout,
    sections: ['frontend', 'ui', 'screensaver'],
  },
  {
    id: 'automate',
    label: '自动化与安防',
    desc: '家庭模式、安防阈值与节律照明',
    accent: '#c084fc',
    icon: Cog,
    sections: ['homeMode', 'circadian', 'security'],
  },
  {
    id: 'interact',
    label: '感知交互',
    desc: '通知、儿童模式与外部集成',
    accent: '#fbbf24',
    icon: Brain,
    sections: ['notification', 'childMode', 'external'],
  },
  {
    id: 'system',
    label: '系统与账户',
    desc: '运维清理与底层运行参数',
    accent: '#94a3b8',
    icon: Server,
    sections: ['ops', 'other'],
  },
]

export function getSectionLabels() {
  return { ...SECTION_LABELS }
}

function getSectionMeta() {
  const meta: Record<string, SectionMetaStatic & { desc?: string }> = {}
  for (const [key, staticMeta] of Object.entries(SECTION_META_STATIC)) {
    meta[key] = {
      ...staticMeta,
      desc: SECTION_DESCS[key],
    }
  }
  return meta
}

function getDefaultSectionMeta() {
  return {
    ...DEFAULT_SECTION_META_STATIC,
    desc: '运行参数',
  }
}

export function getSectionCategories() {
  return SECTION_CATEGORY_DEFS.map((cat) => ({
    id: cat.id,
    label: cat.label,
    desc: cat.desc,
    accent: cat.accent,
    icon: cat.icon,
    sections: cat.sections,
  }))
}

const SECTION_TO_CATEGORY = Object.fromEntries(
  SECTION_CATEGORY_DEFS.flatMap((cat) => cat.sections.map((sk) => [sk, cat.id])),
)

export function sectionMeta(key: string) {
  return getSectionMeta()[key] || getDefaultSectionMeta()
}

export function categoryForSection(sectionKey: string) {
  const cat = SECTION_TO_CATEGORY[sectionKey]
  if (cat) return cat
  return SECTION_CATEGORY_DEFS[0].id
}
