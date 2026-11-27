import { getEntityDomain, resolveEntityArea } from '@homeos/shared'
import { computed, ref, toRaw, watch, type Ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  fetchEntity,
  fetchEntityReferences,
  unlinkEntityReference,
  fetchEventStats,
  fetchEvents,
} from '@/domain/api/entities'
import { getApiErrorMessage } from '@/kernel/core/index'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { hasEntityControlPopup } from '@/domain/entity/popup-registry'
import { useRouteEntityProjection } from '@/domain/entity/use-route-entity-projection'
import { useEntityProjection } from '@/domain/entity/entity'
import { getEntityDisplayName } from '@/domain/entity/derived'
import { copyTextToClipboard } from '@homeos/shared/utils/clipboard'
import { getDomainLabel } from '@/features/device/utils'
import { buildEntityAttrEntries, HVAC_ACTION_LABELS, HVAC_MODE_LABELS } from '@/domain/entity/attr-format'
import { displayClimateOperatingLabel, displayEntityStateLabel } from '@/kernel/index'
import { createFetchSequence } from '@/kernel/core/index'
import { useLayoutStore } from '@/domain/layout/store/index'
import {
  ENTITY_REFERENCE_KIND_LABELS,
  LAYOUT_ENTITY_REFERENCE_KINDS,
  SYSTEM_CONFIG_ENTITY_REFERENCE_KINDS,
  UNLINKABLE_ENTITY_REFERENCE_KINDS,
  type EntityReferenceItem,
  type EntityReferencesResponse,
} from '@/kernel/entity'
import { useSystemConfig } from '@/domain/layout/system-config-core.internals'
import type { EventLogStats, DeviceUsageReport } from '@/kernel/device'
import { readLocalStorage, writeLocalStorageJson } from '@/kernel/core/index'
import { countOfflineDevices } from '@/domain/entity/utils/device-group'
import { fetchAdvisorUsage } from '@/kernel/http/index'

/** 设备详情页视图模型 —— `features/device/DeviceDetailPage.vue` 的领域逻辑层。 */

/** 合法的详情 Tab（来自 query.tab，非法值回落 overview）。 */
const VALID_DETAIL_TABS = new Set(['overview', 'history', 'refs', 'usage', 'analytics', 'attrs'])

/**
 * 中文名称排序器：`localeCompare(name, 'zh')` 每比较一对都要重新解析 locale 规则，
 * 列表排序是 O(k log k) 次比较，必须复用同一个 Collator 实例。
 */
const zhNameCollator = new Intl.Collator('zh')

/**
 * `device_id → 归属实体集合` 索引。
 *
 * 设备详情页的「相关设备」原来订阅全局 `entityStateRevision` 后**每批都全表扫一遍**
 * （`Object.keys` 全实体 + 逐条 `getEntityDisplayName` + 每对一次 zh 排序）。
 * 而归属关系只随实体增删变化（`derivedEpoch`），与状态抖动无关：索引按 epoch 懒建，
 * 之后每批只走本设备那几条。
 */
let deviceIndexEpoch = -1
let deviceIndexByDeviceId = new Map<string, Set<string>>()

function buildDeviceEntityIndex(raw: Record<string, { attributes?: Record<string, unknown> } | undefined>) {
  const nextIndex = new Map<string, Set<string>>()
  for (const key of Object.keys(raw)) {
    const deviceId = raw[key]?.attributes?.device_id
    if (typeof deviceId !== 'string' || !deviceId) continue
    let bucket = nextIndex.get(deviceId)
    if (!bucket) nextIndex.set(deviceId, (bucket = new Set()))
    bucket.add(key)
  }
  deviceIndexByDeviceId = nextIndex
  return nextIndex
}

/**
 * 桶里的 id 是否都还在实体表里。
 *
 * `derivedEpoch` 在登出 / 重置时会回到 0，若缓存恰好也停在 0，单看 epoch 会把上一账号的
 * 索引判成有效的 —— 桶只有几条到几十条，这一次校验比全表重建便宜三个数量级。
 */
function bucketIsCurrent(bucket: Set<string> | undefined, raw: Record<string, unknown>): boolean {
  if (!bucket) return false
  for (const entityId of bucket) if (!raw[entityId]) return false
  return true
}

/** 取某设备的归属实体集合（按 epoch 懒建索引，之后每批只走本设备那几条）。 */
function deviceEntityIndex(
  epoch: number,
  raw: Record<string, { attributes?: Record<string, unknown> } | undefined>,
  deviceId: string,
): Set<string> | undefined {
  if (deviceIndexEpoch !== epoch) {
    deviceIndexEpoch = epoch
    buildDeviceEntityIndex(raw)
  }
  const bucket = deviceIndexByDeviceId.get(deviceId)
  if (bucketIsCurrent(bucket, raw)) return bucket
  // 没有桶时以「本 epoch 的索引」为准（重建也不会多出来）；只有桶失效才是跨会话残留，需重建。
  return bucket ? buildDeviceEntityIndex(raw).get(deviceId) : undefined
}

/** 属性面板不展示的噪声字段。 */
const SKIP_ATTRS = new Set([
  'friendly_name',
  'entity_picture',
  'icon',
  'access_token',
  'area_id',
  'area_name',
  'device_id',
])

export function useDeviceDetailView() {
  const route = useRoute()
  const router = useRouter()
  const entitiesStore = useEntitiesStore()
  const chrome = useChromeStore()

  const entityLoading = ref(false)
  const entityFetchError = ref('')
  const detailTab = ref('overview')

  const entityId = computed(() => String(route.query.id || '').trim())
  useRouteEntityProjection(computed(() => (entityId.value ? [entityId.value] : [])))
  const entityProjection = useEntityProjection(entityId)
  const entity = computed(() => {
    if (!entityId.value) return null
    return entityProjection.value ?? entitiesStore.getEntity(entityId.value) ?? null
  })
  const domain = computed(() => getEntityDomain(entityId.value) || '')
  const domainLabel = computed(() => getDomainLabel(domain.value))
  const entityName = computed(() => getEntityDisplayName(entityId.value, entity.value) || '设备详情')
  const unavailable = computed(() => entity.value?.state === 'unavailable' || entity.value?.state === 'unknown')
  const displayState = computed(() => {
    const state = entity.value?.state
    if (domain.value === 'climate' || domain.value === 'water_heater') {
      return displayClimateOperatingLabel(
        state,
        entity.value?.attributes as Record<string, unknown> | undefined,
        HVAC_ACTION_LABELS,
        HVAC_MODE_LABELS,
      )
    }
    return displayEntityStateLabel(entityId.value, state)
  })
  const area = computed(() => resolveEntityArea(entity.value?.attributes)?.display ?? '')
  const controllable = computed(() => entityId.value && hasEntityControlPopup(entityId.value))

  const detailStatCells = computed(() => {
    const cells = [
      { key: 'domain', label: '域', value: domainLabel.value || '—', tone: 'sky' },
      {
        key: 'state',
        label: '状态',
        value: displayState.value,
        tone: unavailable.value ? 'red' : 'green',
      },
    ]
    if (area.value) {
      cells.push({ key: 'area', label: '房间', value: area.value, tone: 'muted' })
    }
    if (controllable.value) {
      cells.push({ key: 'ctrl', label: '控制', value: '可用', tone: 'amber' })
    }
    return cells
  })

  const deviceId = computed(() => {
    const id = entity.value?.attributes?.device_id
    return typeof id === 'string' ? id : null
  })

  const relatedEntitiesAll = computed(() => {
    // 显式订阅：任意实体写入（状态/属性）都会递增 revision，保证名称能刷新；
    // `derivedEpoch` 兜底实体增删（索引只在增删时重建，不再每批全表扫描）。
    void entitiesStore.entityStateRevision
    void entitiesStore.derivedEpoch
    const device = deviceId.value
    if (!device) return [] as Array<{ id: string; name: string }>
    const raw = toRaw(entitiesStore.entities)
    const bucket = deviceEntityIndex(entitiesStore.derivedEpoch, raw, device)
    if (!bucket) return [] as Array<{ id: string; name: string }>
    const matches: Array<{ id: string; name: string }> = []
    for (const key of bucket) {
      if (key === entityId.value) continue
      const entity = raw[key]
      matches.push({
        id: key,
        name: getEntityDisplayName(key, entity) || key,
      })
    }
    return matches.sort((a, b) => zhNameCollator.compare(a.name, b.name))
  })

  const relatedEntities = computed(() => relatedEntitiesAll.value.slice(0, 8))
  const relatedEntitiesExtra = computed(() =>
    Math.max(0, relatedEntitiesAll.value.length - relatedEntities.value.length),
  )

  function buildAttrEntries(attrs: Record<string, unknown>) {
    return buildEntityAttrEntries(attrs, SKIP_ATTRS)
  }

  const attrTotalCount = computed(() => {
    const attrs = entity.value?.attributes
    if (!attrs) return 0
    return buildAttrEntries(attrs as Record<string, unknown>).length
  })

  const attrEntries = computed(() => {
    const attrs = entity.value?.attributes
    if (!attrs) return []
    return buildAttrEntries(attrs as Record<string, unknown>)
  })

  const detailTabs = computed(() => {
    const tabs: Array<{ id: string; label: string; count?: number }> = [
      { id: 'overview', label: '概览与健康' },
      { id: 'history', label: '状态历史' },
      { id: 'refs', label: '功能引用' },
      { id: 'usage', label: '使用统计' },
      { id: 'analytics', label: '深度分析' },
    ]
    if (attrTotalCount.value) {
      tabs.push({
        id: 'attrs',
        label: '属性',
        count: attrTotalCount.value,
      })
    }
    return tabs
  })

  function setDetailTab(tabId: string) {
    detailTab.value = tabId
    const query: Record<string, string> = { id: entityId.value }
    if (tabId !== 'overview') query.tab = tabId
    router.replace({ query })
  }

  function goBack() {
    if (window.history.length > 1) router.back()
    else router.push('/devices')
  }

  function openControl() {
    if (unavailable.value) {
      chrome.notify('设备离线，无法控制', 'error')
      return
    }
    chrome.openEntityControl(entityId.value)
  }

  async function copyId() {
    const ok = await copyTextToClipboard(entityId.value)
    chrome.notify(ok ? '已复制 entity_id' : '复制失败', ok ? 'success' : 'error')
  }

  async function hydrateEntity(id: string) {
    if (!id) {
      entityLoading.value = false
      entityFetchError.value = ''
      return
    }
    entityLoading.value = true
    entityFetchError.value = ''
    try {
      const result = await entitiesStore.ensureEntity(id)
      if (!result && !entitiesStore.getEntity(id) && entitiesStore.connected) {
        try {
          await fetchEntity(id)
        } catch (e) {
          entityFetchError.value = getApiErrorMessage(e, '加载设备失败')
        }
      }
    } finally {
      entityLoading.value = false
    }
  }

  watch(
    entityId,
    async (id) => {
      const tabFromQuery = String(route.query.tab || '')
      detailTab.value = VALID_DETAIL_TABS.has(tabFromQuery) ? tabFromQuery : 'overview'
      await hydrateEntity(id)
    },
    { immediate: true },
  )

  watch(
    () => route.query.tab,
    (tabFromQuery) => {
      const tab = String(tabFromQuery || '')
      if (!tab) {
        if (detailTab.value !== 'overview') detailTab.value = 'overview'
        return
      }
      if (VALID_DETAIL_TABS.has(tab) && detailTab.value !== tab) detailTab.value = tab
    },
  )

  watch(attrTotalCount, (count) => {
    if (detailTab.value === 'attrs' && !count) detailTab.value = 'overview'
  })

  return {
    // 状态
    entitiesStore,
    entityId,
    entity,
    entityLoading,
    entityFetchError,
    detailTab,
    // 派生
    entityName,
    detailStatCells,
    detailTabs,
    relatedEntities,
    relatedEntitiesExtra,
    attrEntries,
    attrTotalCount,
    controllable,
    // 动作
    setDetailTab,
    goBack,
    openControl,
    copyId,
    hydrateEntity,
  }
}

/** 设备实体引用 Composable */

/**
 * 设备实体引用 Composable。
 *
 * @param entityId 目标实体 ID（响应式），变化时自动重新加载。
 * @param visible  可选的可见性开关；为 false 时跳过请求与 watch 自动触发。
 * @returns loading / unlinkingId / error / total / items / counts / refresh / unlink。
 */
export function useDeviceEntityReferences(entityId: Ref<string>, visible?: Ref<boolean>) {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const { load: loadSystemConfig } = useSystemConfig()

  function canUnlinkItem(item: EntityReferenceItem) {
    return UNLINKABLE_ENTITY_REFERENCE_KINDS.has(item.kind)
  }

  function unlinkDisabledReason(item: EntityReferenceItem) {
    if (!UNLINKABLE_ENTITY_REFERENCE_KINDS.has(item.kind)) {
      return '此类引用暂不支持在此移除，请到对应设置页编辑'
    }
    return ''
  }

  const loading = ref(false)
  // 正在移除中的引用标识（kind:id），用于 UI 显示 loading 态
  const unlinkingId = ref('')
  const error = ref('')
  const total = ref(0)
  const items = ref<EntityReferenceItem[]>([])
  // 按 kind 分类的引用计数
  const counts = ref<EntityReferencesResponse['counts']>({})
  // 请求序号守卫，确保只有最新一次请求的结果会写入状态
  const seqGuard = createFetchSequence()

  /**
   * 将接口返回写入响应式状态。
   *
   * @param data 引用查询响应；为空时清空状态。
   */
  function applyPayload(data: EntityReferencesResponse | undefined) {
    items.value = data?.items || []
    total.value = Number(data?.total) || items.value.length
    counts.value = data?.counts || {}
  }

  /**
   * 刷新实体引用列表。
   *
   * 副作用：修改 loading / error / items / total / counts；过期序号的响应会被丢弃。
   * 调用场景：
   *   - watch 监听 entityId / visible 时自动调用。
   *   - 外部组件通过返回的 refresh 手动刷新。
   */
  async function refresh() {
    if (visible && !visible.value) return
    const id = entityId.value?.trim()
    const seq = seqGuard.next()

    if (!id) {
      items.value = []
      total.value = 0
      counts.value = {}
      error.value = ''
      return
    }

    loading.value = true
    error.value = ''
    try {
      const { data } = await fetchEntityReferences(id)
      if (!seqGuard.isCurrent(seq)) return
      applyPayload(data)
    } catch (e) {
      if (!seqGuard.isCurrent(seq)) return
      items.value = []
      total.value = 0
      counts.value = {}
      // 翻译：错误提示文案（getApiErrorMessage 默认值）
      error.value = getApiErrorMessage(e, '加载实体引用失败')
    } finally {
      if (seqGuard.isCurrent(seq)) loading.value = false
    }
  }

  /**
   * 移除指定引用。
   *
   * 流程：
   *   1) 权限校验：非 admin / adult 直接告警并返回 false。
   *   2) 弹窗二次确认（告警规则与其他类型文案不同）。
   *   3) 调用 unlinkEntityReference；服务端返回 remaining 时直接应用，否则刷新整列表。
   *   4) 联动刷新布局配置 / 系统配置（依据 kind 判断是否需要）。
   *   5) 通知用户结果。
   *
   * @param item 待移除的引用项。
   * @returns 是否成功移除。
   * 副作用：修改 unlinkingId / items / total / counts；可能触发 layoutStore.loadConfig / loadSystemConfig；chrome.notify / chrome.confirm。
   */
  async function unlink(item: EntityReferenceItem) {
    const id = entityId.value?.trim()
    if (!id) return false

    const kindLabel = ENTITY_REFERENCE_KIND_LABELS[item.kind] || item.kind
    // 二次确认：告警规则文案单独定制，其他类型走通用模板
    const ok = await chrome.confirm(
      item.kind === 'alert_rule'
        ? `确定删除告警规则「${item.name}」？此操作不可恢复。`
        : `确定从「${kindLabel} · ${item.name}」中移除对该实体的引用？`,
      '移除功能引用',
      { confirmText: '移除', type: 'danger' },
    )
    if (!ok) return false

    unlinkingId.value = `${item.kind}:${item.id}`
    try {
      const { data } = await unlinkEntityReference(id, {
        kind: item.kind,
        id: item.id,
        detail: item.detail,
      })
      if (!data?.ok) {
        // 翻译：Toast 文案（服务端 message 优先）
        chrome.notify(data?.message || '移除失败', 'error')
        return false
      }
      // 服务端若返回 remaining 直接应用，避免一次额外查询
      if (data.remaining) applyPayload(data.remaining)
      else await refresh()
      // 引用移除后，受影响的布局配置需要重新加载
      if (LAYOUT_ENTITY_REFERENCE_KINDS.has(item.kind)) {
        try {
          await layoutStore.loadConfig()
        } catch {
          // 布局刷新失败不阻断主流程，静默忽略
        }
      }
      // 引用移除后，受影响的系统配置需要重新加载
      if (SYSTEM_CONFIG_ENTITY_REFERENCE_KINDS.has(item.kind)) {
        try {
          await loadSystemConfig({ force: true })
        } catch {
          // 系统配置刷新失败不阻断主流程，静默忽略
        }
      }
      // 翻译：Toast 文案（服务端 message 优先）
      chrome.notify(data.message || '已移除引用', 'success')
      return true
    } catch (e) {
      // 翻译：Toast 文案（getApiErrorMessage 默认值）
      chrome.notify(getApiErrorMessage(e, '移除引用失败'), 'error')
      return false
    } finally {
      unlinkingId.value = ''
    }
  }

  // 监听 entityId / visible；immediate 保证初始化即拉取一次
  watch(
    [entityId, () => visible?.value],
    () => {
      void refresh()
    },
    { immediate: true },
  )

  return {
    canUnlinkItem,
    unlinkDisabledReason,
    loading,
    unlinkingId,
    error,
    total,
    items,
    counts,
    refresh,
    unlink,
  }
}

/** 设备事件统计 Composable */

/**
 * 设备事件统计 Composable。
 *
 * @param entityId 目标实体 ID（响应式）。
 * @param hours    统计时间窗口（小时），默认 168（7 天）。
 * @param visible  可选的可见性开关；为 false 时跳过请求。
 * @returns loading / error / stats / hourlyBuckets / refresh（refresh 等价于 fetchStats）。
 */
export function useDeviceEventStats(entityId: Ref<string>, hours: Ref<number> = ref(168), visible?: Ref<boolean>) {
  // 是否正在加载中
  const loading = ref(false)
  // 错误信息（空串表示无错误）
  const error = ref('')
  // 事件统计结果；无 entity_id 或加载失败时为 null
  const stats = ref<EventLogStats | null>(null)
  // 24 维小时分桶数组，索引 0~23 对应 0~23 点的事件数
  const hourlyBuckets = ref<number[]>([])
  // 请求序号守卫，确保只有最新一次请求的结果会写入状态
  const seqGuard = createFetchSequence()

  /**
   * 拉取事件统计数据并构建小时分桶。
   *
   * 副作用：会修改 loading / error / stats / hourlyBuckets；过期序号的响应会被丢弃。
   * 调用场景：
   *   - watch 监听 entityId / hours / visible 时自动调用。
   *   - 外部组件通过返回的 refresh 手动刷新。
   */
  async function fetchStats() {
    if (visible && !visible.value) return
    const id = entityId.value?.trim()
    const seq = seqGuard.next()
    if (!id) {
      stats.value = null
      hourlyBuckets.value = []
      return
    }
    loading.value = true
    error.value = ''
    try {
      // 并行拉取统计数据与原始事件，提升首屏速度
      const [statsRes, eventsRes] = await Promise.all([
        fetchEventStats({ hours: hours.value, entity_id: id }),
        fetchEvents({ entity_id: id, hours: hours.value, limit: 500 }),
      ])
      if (!seqGuard.isCurrent(seq)) return
      stats.value = statsRes.data as EventLogStats

      // 初始化 24 个桶为 0
      const buckets = new Array(24).fill(0)
      const events = eventsRes.data?.events || []
      for (const ev of events) {
        // 优先使用 createdAt，回退到 last_changed，再回退到当前时间
        const ts = new Date(ev.createdAt || ev.last_changed || Date.now())
        // 用事件发生时刻的小时数作为桶下标
        buckets[ts.getHours()]++
      }
      hourlyBuckets.value = buckets
    } catch {
      if (!seqGuard.isCurrent(seq)) return
      // 翻译：错误提示文案
      error.value = '加载事件统计失败'
      stats.value = null
      hourlyBuckets.value = []
    } finally {
      if (seqGuard.isCurrent(seq)) loading.value = false
    }
  }

  // 监听关键依赖：entityId、时间窗口、可见性，任一变化即重新加载
  watch(
    [entityId, hours, () => visible?.value],
    () => {
      if (visible && !visible.value) return
      void fetchStats()
    },
    { immediate: true },
  )

  return { loading, error, stats, hourlyBuckets, refresh: fetchStats }
}

/** 设备健康趋势 Composable */

// localStorage 中的存储 key
const STORAGE_KEY = 'homeos:device-health-trend'
// 最多保留的天数（窗口大小）
const MAX_DAYS = 14

/**
 * 单日健康快照结构。
 */
interface DeviceHealthSnapshot {
  // 日期 key，格式 YYYY-MM-DD
  day: string
  // 当日离线设备数（state 为 unavailable / unknown）
  offline: number
  // 当日低电量设备数（battery_level <= 20）
  lowBattery: number
  // 当日实体总数
  total: number
}

/**
 * 生成当天的日期 key（YYYY-MM-DD，本地时区）。
 *
 * @returns 形如 "2025-01-31" 的字符串。
 */
function todayKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 从 localStorage 读取历史快照。
 *
 * @returns 快照数组；读取或解析失败时返回空数组。
 */
function readTrend(): DeviceHealthSnapshot[] {
  try {
    const raw = readLocalStorage(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as DeviceHealthSnapshot[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * 将快照数组写入 localStorage（仅保留最近 MAX_DAYS 天）。
 *
 * @param rows 待持久化的快照数组。
 */
function writeTrend(rows: DeviceHealthSnapshot[]) {
  try {
    writeLocalStorageJson(STORAGE_KEY, rows.slice(-MAX_DAYS))
  } catch {
    // 容量超限或隐私模式等场景下静默忽略
  }
}

/**
 * 设备健康趋势 Composable。
 *
 * @returns trend（历史快照）/ current（当前快照）/ sampleToday / refresh（等价于 sampleToday）。
 */
export function useDeviceHealthTrend() {
  const entitiesStore = useEntitiesStore()
  // 初始化时立即从 localStorage 读取历史快照
  const trend = ref<DeviceHealthSnapshot[]>(readTrend())

  /**
   * 当前实体的健康快照（实时计算）。
   * 通过访问 entitiesStore.derivedEpoch 显式建立响应式依赖，
   * 一旦 store 中实体状态变化，computed 即自动重算。
   */
  const current = computed(() => {
    // 触碰 derivedEpoch 以建立响应式依赖
    void entitiesStore.derivedEpoch
    const devices = entitiesStore.entities
    const keys = Object.keys(devices)
    const offlineIds: string[] = []
    let lowBattery = 0
    for (const key of keys) {
      const d = devices[key]
      // 不可用 / 未知状态视为离线
      if (d.state === 'unavailable' || d.state === 'unknown') offlineIds.push(key)
      const level = d.attributes?.battery_level
      // battery_level 为数值且 <= 20 视为低电量
      if (typeof level === 'number' && level <= 20) lowBattery++
    }
    return {
      // 按**设备**计：趋势图的纵轴是「离线设备数」，按实体算会让一台多传感器设备
      // 贡献 5~10 个点，趋势看起来像整批掉线而实际只是几台。
      offline: countOfflineDevices(offlineIds, devices),
      lowBattery,
      total: keys.length,
    }
  })

  /**
   * 采集当天快照：用最新 current 覆盖同日记录，再截断到 MAX_DAYS 内。
   *
   * 副作用：会写入 localStorage 并更新 trend.value。
   */
  function sampleToday() {
    const day = todayKey()
    const snap = current.value
    const rows = readTrend().filter((r) => r.day !== day)
    rows.push({ day, ...snap })
    writeTrend(rows)
    trend.value = rows.slice(-MAX_DAYS)
  }

  // 组件挂载时立即采样一次，保证当天数据可用
  onMounted(() => {
    sampleToday()
  })

  return { trend, current, sampleToday, refresh: sampleToday }
}

/** 设备概览 Composable */

/**
 * 设备概览 Composable。
 *
 * @param entityId 目标实体 ID（响应式）。
 * @param visible  可见性开关；为 false 时跳过请求与 watch 自动触发。
 * @returns usageLoading / eventsLoading / usageReport / recentEvents / recentTotal / refresh。
 */
export function useDeviceOverview(entityId: Ref<string>, visible: Ref<boolean>) {
  // 用量报告加载状态
  const usageLoading = ref(false)
  // 事件列表加载状态
  const eventsLoading = ref(false)
  // 用量报告；无 entity_id 或失败时为 null
  const usageReport = ref<DeviceUsageReport | null>(null)
  const recentEvents = ref<DeviceStateHistoryEvent[]>([])
  // 最近事件总数（用于显示「还有 N 条」）
  const recentTotal = ref(0)
  // 请求序号守卫，确保只有最新一次请求的结果会写入状态
  const seqGuard = createFetchSequence()

  /**
   * 拉取用量报告（7 天窗口）。
   *
   * @param seq 当前请求序号，过期响应会被丢弃。
   * 副作用：修改 usageLoading / usageReport。
   */
  async function fetchUsage(seq: number) {
    const id = entityId.value?.trim()
    if (!id) {
      usageReport.value = null
      return
    }
    usageLoading.value = true
    try {
      const { data } = await fetchAdvisorUsage(id, { days: 7 })
      if (!seqGuard.isCurrent(seq)) return
      usageReport.value = data as DeviceUsageReport
    } catch {
      if (!seqGuard.isCurrent(seq)) return
      usageReport.value = null
    } finally {
      if (seqGuard.isCurrent(seq)) usageLoading.value = false
    }
  }

  /**
   * 拉取最近事件（168 小时窗口内最多 8 条）。
   *
   * @param seq 当前请求序号，过期响应会被丢弃。
   * 副作用：修改 eventsLoading / recentEvents / recentTotal。
   */
  async function fetchRecentEvents(seq: number) {
    const id = entityId.value?.trim()
    if (!id) {
      recentEvents.value = []
      recentTotal.value = 0
      return
    }
    eventsLoading.value = true
    try {
      const { data } = await fetchEvents({
        entity_id: id,
        hours: 168,
        limit: 8,
        page: 1,
      })
      if (!seqGuard.isCurrent(seq)) return
      recentEvents.value = (data?.events || []) as DeviceStateHistoryEvent[]
      recentTotal.value = Number(data?.total) || recentEvents.value.length
    } catch {
      if (!seqGuard.isCurrent(seq)) return
      recentEvents.value = []
      recentTotal.value = 0
    } finally {
      if (seqGuard.isCurrent(seq)) eventsLoading.value = false
    }
  }

  /**
   * 同时刷新用量与最近事件。
   *
   * 副作用：发起两个并行请求，序号一致以统一过滤。
   * 调用场景：
   *   - watch 监听 entityId / visible 时自动调用。
   *   - 外部组件通过返回的 refresh 手动刷新。
   */
  async function refresh() {
    if (!visible.value) return
    const seq = seqGuard.next()
    await Promise.all([fetchUsage(seq), fetchRecentEvents(seq)])
  }

  // 监听 entityId 与 visible；仅在有 id 且可见时刷新；immediate 保证初始化即拉取一次
  watch(
    [entityId, visible],
    ([id, isVisible]) => {
      if (id && isVisible) void refresh()
    },
    { immediate: true },
  )

  return {
    usageLoading,
    eventsLoading,
    usageReport,
    recentEvents,
    recentTotal,
    refresh,
  }
}

/** 设备状态历史 Composable */

/**
 * 设备状态历史事件结构。
 */
export interface DeviceStateHistoryEvent {
  id: number
  entityId: string
  state: string
  oldState: string
  attrText: string | null
  stateDiff: string | null
  createdAt: string
}

// 时间范围预设：value 用于持久化/UI 选择，hours 用于接口请求
// 注意：实际可选范围须按 EventLog 保留期裁剪（见 availableDeviceHistoryRanges）
const DEVICE_HISTORY_RANGES = [
  { value: '6h', label: '6小时', hours: 6 },
  { value: '24h', label: '24小时', hours: 24 },
  { value: '7d', label: '7天', hours: 168 },
  { value: '30d', label: '30天', hours: 720 },
] as const

// 时间范围 value 联合类型
export type DeviceHistoryRange = (typeof DEVICE_HISTORY_RANGES)[number]['value']

type DeviceHistoryRangeOption = (typeof DEVICE_HISTORY_RANGES)[number]

// 单次拉取的事件数上限（用于性能保护，超出时设置 truncated 标记）
const DEVICE_HISTORY_SAMPLE_LIMIT = 200

/**
 * 将时间范围 value 映射为小时数；未匹配时回退到 24 小时。
 *
 * @param range 时间范围 value（如 '6h' / '24h' / '7d' / '30d'）。
 * @returns 对应的小时数。
 */
export function hoursForRange(range: string): number {
  return DEVICE_HISTORY_RANGES.find((r) => r.value === range)?.hours ?? 24
}

/**
 * 按 EventLog 最大可查询小时数裁剪时间范围按钮。
 * 后端会对 hours 做 retention clamp；超出保留期的选项不应出现在 UI。
 */
export function availableDeviceHistoryRanges(maxQueryHours: number): DeviceHistoryRangeOption[] {
  const max = Number.isFinite(maxQueryHours) && maxQueryHours > 0 ? maxQueryHours : 24
  const fitted = DEVICE_HISTORY_RANGES.filter((r) => r.hours <= max)
  if (fitted.length) return [...fitted]
  // 极短保留期（<6h）：仍展示最短档，实际查询由后端 clamp
  return [DEVICE_HISTORY_RANGES[0]]
}

/** 若当前选择超出可查询窗口，回退到最大可用档位 */
export function clampDeviceHistoryRange(range: DeviceHistoryRange, maxQueryHours: number): DeviceHistoryRange {
  const opts = availableDeviceHistoryRanges(maxQueryHours)
  if (opts.some((r) => r.value === range)) return range
  return opts[opts.length - 1]?.value ?? '24h'
}

/**
 * 设备状态历史 Composable。
 *
 * @param entityId 目标实体 ID（响应式）。
 * @param range    时间范围 value（响应式），变化时自动重新加载。
 * @param visible  可选的可见性开关；为 false 时跳过请求与 watch 自动触发。
 * @returns loading / error / events / total / truncated / refresh。
 */
export function useDeviceStateHistory(entityId: Ref<string>, range: Ref<DeviceHistoryRange>, visible?: Ref<boolean>) {
  const loading = ref(false)
  const error = ref('')
  const events = ref<DeviceStateHistoryEvent[]>([])
  // 服务端事件总数（可能大于返回的 events 长度）
  const total = ref(0)
  // 是否被截断：total > events.length 时为 true
  const truncated = ref(false)
  // 请求序号守卫，确保只有最新一次请求的结果会写入状态
  const seqGuard = createFetchSequence()

  /**
   * 拉取状态历史事件。
   *
   * 副作用：修改 loading / error / events / total / truncated；过期序号的响应会被丢弃。
   * 调用场景：
   *   - watch 监听 entityId / range / visible 时自动调用。
   *   - 外部组件通过返回的 refresh 手动刷新。
   */
  async function refresh() {
    if (visible && !visible.value) return
    const id = entityId.value?.trim()
    const seq = seqGuard.next()
    if (!id) {
      events.value = []
      total.value = 0
      truncated.value = false
      return
    }

    loading.value = true
    error.value = ''
    try {
      const hours = hoursForRange(range.value)
      const { data } = await fetchEvents({
        entity_id: id,
        hours,
        limit: DEVICE_HISTORY_SAMPLE_LIMIT,
        page: 1,
      })
      if (!seqGuard.isCurrent(seq)) return
      events.value = (data?.events || []) as DeviceStateHistoryEvent[]
      total.value = Number(data?.total) || events.value.length
      // 实际返回数量小于总数时标记为截断，UI 提示「仅展示前 N 条」
      truncated.value = total.value > events.value.length
    } catch {
      if (!seqGuard.isCurrent(seq)) return
      // 翻译：错误提示文案
      error.value = '加载状态历史失败'
      events.value = []
      total.value = 0
      truncated.value = false
    } finally {
      if (seqGuard.isCurrent(seq)) loading.value = false
    }
  }

  // 监听关键依赖：entityId、时间范围、可见性，任一变化即重新加载；immediate 保证初始化即拉取一次
  watch(
    [entityId, range, () => visible?.value],
    () => {
      if (visible && !visible.value) return
      void refresh()
    },
    { immediate: true },
  )

  return { loading, error, events, total, truncated, refresh }
}

/** 设备使用统计 Composable */

/**
 * 设备使用统计 Composable。
 *
 * @param entityId  目标实体 ID（响应式），变化时自动重新加载。
 * @param days      统计窗口天数，默认 7。
 * @param visible   可选的可见性开关；为 false 时跳过请求（用于隐藏 Tab 时的懒加载）。
 * @returns loading / error / report / refresh（refresh 等价于内部 fetchUsage）。
 */
export function useDeviceUsageStats(entityId: Ref<string>, days: Ref<number> = ref(7), visible?: Ref<boolean>) {
  // 是否正在加载中
  const loading = ref(false)
  // 错误信息（空串表示无错误）
  const error = ref('')
  // 用量统计报告；加载失败或无 entity_id 时为 null
  const report = ref<DeviceUsageReport | null>(null)
  // 请求序号守卫，确保只有最新一次请求的结果会写入状态
  const seqGuard = createFetchSequence()

  /**
   * 拉取设备使用统计数据。
   *
   * 副作用：会修改 loading / error / report；非当前序号的响应会被丢弃。
   * 调用场景：
   *   - watch 监听 entityId / days / visible 时自动调用。
   *   - 外部组件通过返回的 refresh 手动刷新。
   */
  async function fetchUsage() {
    // 不可见时跳过请求，避免隐藏 Tab 中的浪费请求
    if (visible && !visible.value) return
    const id = entityId.value?.trim()
    const seq = seqGuard.next()
    if (!id) {
      // 无 entity_id 时清空状态
      report.value = null
      return
    }
    loading.value = true
    error.value = ''
    try {
      const { data } = await fetchAdvisorUsage(id, { days: days.value })
      // 序号过期则丢弃响应，避免旧请求覆盖新数据
      if (!seqGuard.isCurrent(seq)) return
      report.value = data as DeviceUsageReport
    } catch {
      if (!seqGuard.isCurrent(seq)) return
      // 翻译：错误提示文案
      error.value = '加载使用统计失败'
      report.value = null
    } finally {
      if (seqGuard.isCurrent(seq)) loading.value = false
    }
  }

  // 监听关键依赖：entityId、天数、可见性，任一变化即重新加载
  watch(
    [entityId, days, () => visible?.value],
    () => {
      if (visible && !visible.value) return
      void fetchUsage()
    },
    { immediate: true },
  )

  return { loading, error, report, refresh: fetchUsage }
}
