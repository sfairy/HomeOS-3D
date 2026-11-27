import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { getEntityDomain } from '@homeos/shared'
import { useLayoutStore } from '@/domain/layout/store'
import { getWholeHomeOffConfig } from '@/kernel/constants'
import { type HaEntityState } from '@/kernel/types/entity'
import { type WholeHomeOffConfig } from '@/kernel/types/whole-home-off'
import { readLocalStorage, writeLocalStorage, logger } from '@/kernel/utils/core'
import { ref, computed, onMounted } from 'vue'
import { fetchSetupChecklist, fetchSystemHealth, fetchSystemDiagnostics } from '@/kernel/http/index'

/** 全屋批量操作工具。 */

/** 全屋关闭可覆盖的配置项子集 */
type WholeHomeOffOptions = Partial<
  Pick<WholeHomeOffConfig, 'lights' | 'covers' | 'climate' | 'switches' | 'excludeEntities' | 'entityIds'>
>

/**
 * 判断实体是否应被纳入批量操作（未被排除且在白名单内）。
 * @param id 实体 id
 * @param excludeSet 排除集合
 * @param whitelist 白名单（空表示不限）
 */
function shouldIncludeEntity(id: string, excludeSet: Set<string>, whitelist: string[]) {
  if (excludeSet.has(id)) return false
  if (whitelist.length > 0 && !whitelist.includes(id)) return false
  return true
}

/**
 * 遍历实体 store，收集满足 filterFn 条件的实体 id。
 * 自动跳过 unavailable / unknown 实体，并应用排除与白名单。
 * @param filterFn 过滤函数
 * @param excludeEntities 排除实体列表
 * @param entityIds 白名单（空表示不限）
 * @returns 符合条件的实体 id 列表
 */
function collectOnEntities(
  filterFn: (key: string, e: HaEntityState) => boolean,
  { excludeEntities = [], entityIds = [] }: { excludeEntities?: string[]; entityIds?: string[] } = {},
) {
  const store = useEntitiesStore()
  const excludeSet = new Set(excludeEntities)
  const whitelist = entityIds
  const list: string[] = []
  for (const key in store.entities) {
    const e = store.entities[key]
    if (e?.state === 'unavailable' || e?.state === 'unknown') continue
    if (!shouldIncludeEntity(key, excludeSet, whitelist)) continue
    if (filterFn(key, e)) list.push(key)
  }
  return list
}

/**
 * 解析全屋关闭配置：合并 layout 配置与传入覆盖项。
 * @param overrides 覆盖项
 * @returns 合并后的配置
 */
function resolveWholeHomeOffOptions(overrides: WholeHomeOffOptions = {}) {
  let cfg = getWholeHomeOffConfig({})
  try {
    cfg = getWholeHomeOffConfig(useLayoutStore().layoutConfig)
  } catch {
    /* store 尚未就绪 */
  }
  return {
    lights: overrides.lights ?? cfg.lights,
    covers: overrides.covers ?? cfg.covers,
    climate: overrides.climate ?? cfg.climate,
    switches: overrides.switches ?? cfg.switches,
    excludeEntities: overrides.excludeEntities ?? cfg.excludeEntities,
    entityIds: overrides.entityIds ?? cfg.entityIds,
  }
}

/**
 * 获取所有处于开启状态的灯实体 id。
 * @param options 配置覆盖项
 */
function getAllLightsOn(options: WholeHomeOffOptions = {}) {
  const resolvedLightsOptions = resolveWholeHomeOffOptions(options)
  return collectOnEntities((key, e) => key.startsWith('light.') && e.state === 'on', resolvedLightsOptions)
}

/**
 * 获取所有处于打开状态的窗帘实体 id。
 * @param options 配置覆盖项
 */
function getAllCoversOpen(options: WholeHomeOffOptions = {}) {
  const resolvedCoversOptions = resolveWholeHomeOffOptions(options)
  return collectOnEntities((key, e) => key.startsWith('cover.') && e.state === 'open', resolvedCoversOptions)
}

/**
 * 获取所有非关闭状态的空调/风扇实体 id。
 * @param options 配置覆盖项
 */
function getAllClimateOn(options: WholeHomeOffOptions = {}) {
  const resolvedClimateOptions = resolveWholeHomeOffOptions(options)
  return collectOnEntities(
    (key, e) => (key.startsWith('climate.') || key.startsWith('fan.')) && e.state !== 'off',
    resolvedClimateOptions,
  )
}

/**
 * 获取所有处于开启状态的开关实体 id。
 * @param options 配置覆盖项
 */
function getAllSwitchesOn(options: WholeHomeOffOptions = {}) {
  const resolvedSwitchesOptions = resolveWholeHomeOffOptions(options)
  return collectOnEntities((key, e) => key.startsWith('switch.') && e.state === 'on', resolvedSwitchesOptions)
}

/**
 * 全屋批量关闭：灯 / 窗帘 / 空调风扇 / 开关（读取 layout.wholeHomeOff，可传参覆盖）。
 *
 * 走服务端批量接口（限并发 + 逐项结果），而不是 `Promise.allSettled` 无上限并发：
 * 大户型一次关掉上百个设备会把 HA 与连接池同时打满，失败时也只得到一个「有几条失败」
 * 的计数，无法定位是哪台设备。
 *
 * @param overrides 配置覆盖项
 * @returns { total, ok, failed } 总数、成功数、失败数
 */
/** 批量条目（与 store.callServiceBatch 的入参一致）。 */
interface BatchItem {
  domain: string
  service: string
  entityId: string
  serviceData?: Record<string, unknown>
}

/**
 * 按配置收集「需要关闭」的条目。
 *
 * 抽成独立函数是为了把四段同构的 `if (开关) for (实体) push(...)` 收敛到一处：
 * 堆在 turnOffWholeHome 里会让它迅速变长，而这段本身没有分支逻辑可言。
 */
function collectWholeHomeOffItems(overrides: WholeHomeOffOptions): BatchItem[] {
  const items: BatchItem[] = []
  if (overrides.lights) {
    for (const id of getAllLightsOn(overrides)) {
      items.push({ domain: 'light', service: 'turn_off', entityId: id })
    }
  }
  if (overrides.covers) {
    for (const id of getAllCoversOpen(overrides)) {
      items.push({ domain: 'cover', service: 'close_cover', entityId: id })
    }
  }
  if (overrides.climate) {
    for (const id of getAllClimateOn(overrides)) {
      const domain = getEntityDomain(id)
      // climate 设为 off 模式；fan 直接关闭
      const service = domain === 'climate' ? 'set_hvac_mode' : 'turn_off'
      const serviceData = domain === 'climate' ? { hvac_mode: 'off' } : undefined
      items.push({ domain, service, entityId: id, serviceData })
    }
  }
  if (overrides.switches) {
    for (const id of getAllSwitchesOn(overrides)) {
      items.push({ domain: 'switch', service: 'turn_off', entityId: id })
    }
  }
  return items
}

/**
 * 全屋批量关闭：灯 / 窗帘 / 空调风扇 / 开关（读取 layout.wholeHomeOff，可传参覆盖）。
 *
 * 走服务端批量接口（限并发 + 逐项结果），而不是 `Promise.allSettled` 无上限并发：
 * 大户型一次关掉上百个设备会把 HA 与连接池同时打满，失败时也只得到一个「有几条失败」
 * 的计数，无法定位是哪台设备。
 *
 * @param overrides 配置覆盖项
 * @returns { total, ok, failed } 总数、成功数、失败数
 */
export async function turnOffWholeHome(overrides: WholeHomeOffOptions = {}) {
  const items = collectWholeHomeOffItems(resolveWholeHomeOffOptions(overrides))
  if (!items.length) return { total: 0, ok: 0, failed: 0 }
  const summary = await useEntitiesStore().callServiceBatch(items, { quiet: true })
  return { total: summary.total, ok: summary.ok, failed: summary.failed }
}

/** - 拉取后端 SetupChecklist 状态（条目 / 完成数 / 总数 / 是否可见）； */


/** 单个清单条目：id / 标签 / 是否完成 / 提示 / 跳转路由 */
interface SetupChecklistItem {
  id: string
  label: string
  done: boolean
  hint: string
  route?: string
}

/** 清单整体状态：条目列表 + 完成进度 + 是否被服务端关闭 + 是否可见 */
interface SetupChecklistState {
  items: SetupChecklistItem[]
  completed: number
  total: number
  dismissed: boolean
  visible: boolean
}

// 本地暂缓存储 key 与 7 天时长
const SNOOZE_KEY = 'homeos_setup_checklist_snooze_until'
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 读取本地暂缓到期时间戳；读取失败返回 0（视为未暂缓）。
 */
function readSnoozeUntil(): number {
  try {
    const raw = readLocalStorage(SNOOZE_KEY)
    const n = raw ? Number(raw) : 0
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

/** 当前是否处于本地暂缓期内 */
function isSnoozed(): boolean {
  return Date.now() < readSnoozeUntil()
}

/**
 * 安装引导清单 composable。
 *
 * @returns loading 加载中标志；checklist 清单状态；showBanner 是否展示横幅；progressText 进度文案；refresh 重新拉取；dismiss 暂缓 7 天
 */
export function useSetupChecklist() {
  const loading = ref(false)
  const checklist = ref<SetupChecklistState | null>(null)
  // 本地暂缓状态（与 localStorage 同步）
  const snoozedLocally = ref(isSnoozed())

  // 横幅展示条件：服务端可见 + 未被本地或服务端暂缓
  const showBanner = computed(() => Boolean(checklist.value?.visible) && !snoozedLocally.value && !isSnoozed())

  // 进度文案：completed/total
  const progressText = computed(() => {
    if (!checklist.value) return ''
    return `${checklist.value.completed}/${checklist.value.total}`
  })

  /**
   * 重新拉取清单：同步暂缓状态后请求后端。
   * 失败时静默清空（debug 日志），不阻塞页面。
   */
  async function refresh() {
    snoozedLocally.value = isSnoozed()
    loading.value = true
    try {
      const { data } = await fetchSetupChecklist<SetupChecklistState>()
      checklist.value = data
    } catch (e) {
      logger.debug('设置清单加载失败', e)
      checklist.value = null
    } finally {
      loading.value = false
    }
  }

  /**
   * 7 天本地暂缓，不永久关闭服务端清单。
   * 写入 localStorage 暂缓到期时间，并把本地 visible 置为 false。
   */
  function dismiss() {
    const until = Date.now() + SNOOZE_MS
    try {
      writeLocalStorage(SNOOZE_KEY, String(until))
    } catch {
      /* 忽略配额 */
    }
    snoozedLocally.value = true
    if (checklist.value) {
      checklist.value = { ...checklist.value, visible: false }
    }
  }

  // 挂载时自动拉取一次清单
  onMounted(refresh)

  return {
    loading,
    checklist,
    showBanner,
    progressText,
    refresh,
    dismiss,
  }
}

/** - 提供 health / diagnostics 两个接口的并发安全加载（inflight 去重）； */

// 缓存有效期：10 秒
const TTL_MS = 10000
// 模块级缓存：单例共享给所有调用方
let healthCache: unknown = null
let diagnosticsCache: unknown = null
let healthCachedAt = 0
let diagnosticsCachedAt = 0
// 进行中的请求 Promise：用于去重并发请求
let healthInflight: Promise<unknown> | null = null
let diagnosticsInflight: Promise<unknown> | null = null
// 引用计数：health / diagnostics 并发加载时任一完成不会清掉另一仍在途的请求的 loading
const pendingCount = ref(0)
const loading = computed(() => pendingCount.value > 0)
/** 进入一次加载：pendingCount +1 */
function startLoad(): void {
  pendingCount.value += 1
}
/** 结束一次加载：pendingCount -1，下界保护 0 */
function endLoad(): void {
  pendingCount.value = Math.max(0, pendingCount.value - 1)
}

/**
 * 加载系统健康信息：复用 inflight 请求，缓存 TTL_MS 内未过期时直接返回缓存；
 * 失败时回退到旧缓存，保证 UI 不至于空。
 *
 * @param force 是否强制刷新（忽略缓存）
 */
async function loadSystemHealth({ force = false }: { force?: boolean } = {}) {
  // 已有在途请求：复用同一 Promise
  if (healthInflight) return healthInflight
  // 缓存未过期：直接返回
  if (!force && healthCache && Date.now() - healthCachedAt < TTL_MS) {
    return healthCache
  }
  startLoad()
  healthInflight = fetchSystemHealth()
    .then(({ data }) => {
      healthCache = data ?? null
      healthCachedAt = Date.now()
      return healthCache
    })
    // 失败时回退到旧缓存，避免 UI 空白
    .catch(() => healthCache)
    .finally(() => {
      endLoad()
      healthInflight = null
    })
  return healthInflight
}

/**
 * 加载系统诊断信息：复用 inflight 请求，缓存 TTL_MS 内未过期时直接返回缓存；
 * 失败时回退到旧缓存。
 *
 * @param force 是否强制刷新（忽略缓存）
 */
async function loadSystemDiagnostics({ force = false }: { force?: boolean } = {}) {
  if (diagnosticsInflight) return diagnosticsInflight
  if (!force && diagnosticsCache && Date.now() - diagnosticsCachedAt < TTL_MS) {
    return diagnosticsCache
  }
  startLoad()
  diagnosticsInflight = fetchSystemDiagnostics()
    .then(({ data }) => {
      diagnosticsCache = data ?? null
      diagnosticsCachedAt = Date.now()
      return diagnosticsCache
    })
    .catch(() => diagnosticsCache)
    .finally(() => {
      endLoad()
      diagnosticsInflight = null
    })
  return diagnosticsInflight
}

/**
 * GET /system/health 与 /system/diagnostics 轻量缓存 composable。
 * 单例：所有调用方共享同一份缓存与 loading 状态。
 *
 * @returns loading 加载中标志；loadHealth 加载健康信息；loadDiagnostics 加载诊断信息；
 *          getCachedHealth 取健康缓存；getCachedDiagnostics 取诊断缓存
 */
export function useSystemDiagnostics() {
  return {
    loading,
    loadHealth: loadSystemHealth,
    loadDiagnostics: loadSystemDiagnostics,
    getCachedHealth: () => healthCache,
    getCachedDiagnostics: () => diagnosticsCache,
  }
}
