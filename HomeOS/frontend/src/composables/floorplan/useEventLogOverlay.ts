/**
 * 事件日志浮层 composable
 *
 * 所属模块：户型图（floorplan）模块下的事件日志浮层。
 * 职责：
 *   1. 监听受控实体的状态变更（WS 推送 + 乐观更新回显）；
 *   2. 将状态变更转换为可读的事件条目并展示在户型图上的浮层中；
 *   3. 在挂载时通过 API 历史补水（hydrate）事件列表，并对相同指纹事件去重；
 *   4. 自动按 displayDuration 控制浮层淡出。
 *
 * 依赖：vue、entities.store、layout.store、auth.store、entities API、frontend-config、
 *   entity-derived / event-log-domains / entity-control-attr-change 等工具。
 */
import type { EntityStateListenerPayload } from '@/types/entity-store'
import { formatSecurityTime } from '@/utils/format/locale-format.util'
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useAuthStore } from '@/stores/auth.store'
import { fetchEventTimeline } from '@/services/api/entities'
import { getEventLogConfig } from '@/utils/config/frontend-config'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { formatEventLogStateLabel } from '@/constants/entity-state-labels'
import {
  EVENT_LOG_OVERLAY_DOMAINS,
  collectOverlayHydrationEntityIds,
  isEventLogOverlayDomain,
} from '@/utils/entity/event-log-domains.util'
import {
  describeAttrChange,
  parseAttrStateDiff,
  resolveEntityStateChangeMessage,
  buildOverlayEventFingerprint,
} from '@/utils/entity/control-attr-change.util'
import { usePausableStateListener } from '@/composables/entity/usePausableStateListener'
import { registerEventLogRefreshHandler } from '@/utils/bridge/store-bridge'
import type { EntitySnapshot } from '@/types/entity'

/** 浮层保留的最多事件条数（超出后会从尾部截断） */
const MAX_EVENTS = 20
/** 窗口期内相同指纹只记一条（乐观 + WS 回显 / API 补水 + 实时） */
const DEDUP_MS = 2000

/**
 * 事件日志浮层中展示的单条事件项。
 */
interface EventLogOverlayItem {
  /** 事件唯一 id（实时事件使用时间戳+随机数，历史补水使用 db-${row.id}） */
  id: string
  /** 实体 id（entity_id） */
  entityId: string
  /** 实体显示名称 */
  name: string
  /** 状态/属性变更的可读标签 */
  state: string
  /** 事件时间（已格式化） */
  timestamp: string
  /** 用于状态颜色映射的 CSS 类名 */
  colorClass: string
}

/**
 * 后端持久化事件行的原始结构（用于历史补水解析）。
 */
interface PersistedEventRow {
  id: string | number
  entityId?: string
  state?: string
  stateDiff?: string
  oldState?: unknown
  newState?: unknown
  createdAt?: string
}

/**
 * 浮层内部使用的事件结构，扩展了去重指纹与时间戳用于排序与去重。
 */
interface InternalOverlayEvent extends EventLogOverlayItem {
  /** 去重指纹，用于过滤相同事件 */
  _fp?: string | null
  /** 事件毫秒时间戳，用于排序 */
  _ts?: number
}

/**
 * 户型图事件日志浮层 composable。
 *
 * 调用场景：在户型图组件中调用，返回浮层所需的容器引用、事件列表、滚动/浮层样式。
 *
 * @returns 浮层状态与样式
 */
export function useEventLogOverlay() {
  const entitiesStore = useEntitiesStore()
  const layoutStore = useLayoutStore()
  const authStore = useAuthStore()

  /** 浮层滚动容器引用，用于滚动到顶部 */
  const scrollContainer = ref<HTMLElement | null>(null)
  /** 浮层是否可见 */
  const visible = ref(false)
  /** 事件列表（最新在前） */
  const events = ref<EventLogOverlayItem[]>([])
  /** 组件是否已挂载（防止挂载前调用 addEvent 产生无效更新） */
  const isMounted = ref(false)

  /** 自动隐藏定时器句柄 */
  let hideTimer: ReturnType<typeof setTimeout> | null = null
  /** 实体状态变更监听器的卸载函数 */
  let removeListener: (() => void) | null = null
  /** 事件日志刷新处理器的注销函数 */
  let unregisterEventLogRefresh: (() => void) | null = null

  /** 近期事件指纹 / 显示键 -> 时间戳，用于窗口期内去重 */
  const recentEventKeys = new Map<string, number>()

  /** 浮层配置（来自 layoutConfig.eventLogConfig，带兜底默认值） */
  const cfg = computed(
    () =>
      layoutStore.layoutConfig.eventLogConfig || {
        position: 'bottom-left',
        width: 320,
        maxHeight: 200,
        displayDuration: 4,
        xPct: 2,
        yPct: 80,
      },
  )

  /** 滚动容器最大高度样式 */
  const scrollStyle = computed(() => ({
    maxHeight: `${cfg.value.maxHeight || 200}px`,
  }))

  /** 浮层绝对定位样式（根据 position / custom 坐标计算） */
  const overlayStyle = computed(() => {
    const c = cfg.value
    const style: Record<string, string | number> = {
      position: 'absolute',
      zIndex: 100,
      width: `${c.width || 320}px`,
      maxHeight: `${c.maxHeight || 200}px`,
      display: 'flex',
      flexDirection: 'column',
      transition: 'opacity 0.15s ease',
      opacity: +!!visible.value,
      pointerEvents: visible.value ? 'auto' : 'none',
    }
    if (c.position === 'custom') {
      // 自定义坐标：以 xPct / yPct 定位，并依据 x 是否过半选择左/右对齐
      style.left = `${c.xPct ?? 2}%`
      style.top = `${c.yPct ?? 80}%`
      style.alignItems = (c.xPct ?? 0) > 50 ? 'flex-end' : 'flex-start'
    } else {
      // 预设位置：top/bottom + left/right 组合
      if (c.position.includes('top')) style.top = '30px'
      else style.bottom = '120px'
      if (c.position.includes('left')) {
        style.left = '30px'
        style.alignItems = 'flex-start'
      } else {
        style.right = '30px'
        style.alignItems = 'flex-end'
      }
    }
    return style
  })
  /**
   * 标记某指纹为「已见」，用于去重窗口判定。
   * @param fp 事件指纹
   */
  function markSeenFp(fp: string | null | undefined) {
    if (!fp) return
    recentEventKeys.set(fp, Date.now())
    // 容量上限保护：超过 200 条时清理过期指纹，避免内存无限增长
    if (recentEventKeys.size > 200) {
      const now = Date.now()
      for (const [k, ts] of recentEventKeys) {
        if (now - ts > DEDUP_MS) recentEventKeys.delete(k)
      }
    }
  }

  /**
   * 判断某指纹是否应被跳过（窗口期内已见过）。
   * @param fp 事件指纹
   * @returns true 表示应跳过（重复事件）
   */
  function shouldSkipFp(fp: string | null | undefined) {
    if (!fp) return true
    const last = recentEventKeys.get(fp)
    const now = Date.now()
    if (last != null && now - last < DEDUP_MS) return true
    markSeenFp(fp)
    return false
  }

  /**
   * 判断某「实体 + 标签」组合是否应跳过显示（避免同一实体短时间内重复弹出）。
   * @param entityId 实体 id
   * @param label 状态标签
   * @returns true 表示应跳过
   */
  function shouldSkipDisplay(entityId: string, label: string) {
    const key = `d|${entityId}|${label}`
    const last = recentEventKeys.get(key)
    const now = Date.now()
    if (last != null && now - last < DEDUP_MS) return true
    recentEventKeys.set(key, now)
    return false
  }

  /**
   * 格式化事件时间。
   * @param date 事件日期
   * @returns 已格式化的时间字符串
   */
  function formatEventTime(date: Date) {
    return formatSecurityTime(date)
  }

  /**
   * 根据状态/属性文本解析颜色 CSS 类名。
   * @param state 实体状态
   * @param attrText 属性变更文本（非空时优先使用属性样式）
   * @returns 颜色 CSS 类名
   */
  function resolveColorClass(state: string, attrText: string | null) {
    if (attrText) return 'log-entry__state--attr'
    if (state === 'on' || state === 'open') return 'log-entry__state--on'
    if (state === 'off' || state === 'closed') return 'log-entry__state--off'
    if (state === 'unavailable') return 'log-entry__state--alert'
    if (['cool', 'heat', 'auto', 'dry', 'fan_only', 'heat_cool'].includes(state)) {
      return 'log-entry__state--climate'
    }
    return 'log-entry__state--muted'
  }

  /**
   * 解析展示标签：有属性文本时使用属性文本，否则按实体 id + 状态映射默认标签。
   * @param eid 实体 id
   * @param state 实体状态
   * @param attrText 属性变更文本
   * @returns 展示标签
   */
  function resolveDisplayLabel(eid: string, state: string, attrText: string | null) {
    if (attrText) return attrText
    return formatEventLogStateLabel(eid, state)
  }

  /**
   * 计算浮层自动隐藏的延迟毫秒数。
   * @returns 延迟毫秒数
   */
  function displayDurationMs() {
    const sec = Number(layoutStore.layoutConfig.eventLogConfig?.displayDuration)
    return (Number.isFinite(sec) && sec > 0 ? sec : 4) * 1000
  }

  /** 按「消息停留时间」自动淡出浮层 */
  function scheduleAutoHide() {
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = setTimeout(() => {
      visible.value = false
      hideTimer = null
    }, displayDurationMs())
  }

  /** 显示浮层并启动自动隐藏计时 */
  function showOverlay() {
    visible.value = true
    scheduleAutoHide()
  }

  /**
   * 向事件日志中添加一条状态变更条目。
   *
   * 副作用：会触发浮层显示与自动隐藏计时；列表超过上限时截断。
   *
   * @param eid 实体 id
   * @param state 实体状态
   * @param attrText 属性变更文本（可选）
   * @param fp 事件指纹（可选，用于去重）
   */
  function addEvent(
    eid: string,
    state: string,
    attrText: string | null = null,
    fp: string | null = null,
  ) {
    if (!isMounted.value) return
    const label = resolveDisplayLabel(eid, state, attrText)
    if (shouldSkipDisplay(eid, label)) return
    if (fp && shouldSkipFp(fp)) return
    const name = getEntityDisplayName(eid, entitiesStore.getEntity(eid))
    const event: EventLogOverlayItem = {
      id: `${Date.now()}-${Math.random()}`,
      entityId: eid,
      name,
      state: label,
      timestamp: formatEventTime(new Date()),
      colorClass: resolveColorClass(state, attrText),
    }

    events.value.unshift(event)
    if (events.value.length > MAX_EVENTS) events.value.length = MAX_EVENTS

    showOverlay()

    // 滚动到顶部，确保最新事件可见
    nextTick(() => {
      if (scrollContainer.value) scrollContainer.value.scrollTop = 0
    })
  }
  /**
   * 从持久化的 newState 字段中提取 state 字符串。
   * @param newState 持久化的新状态（可能是字符串、JSON 字符串或对象）
   * @returns 状态字符串
   */
  function extractPersistedState(newState: unknown): string {
    if (!newState) return ''
    if (typeof newState === 'string') {
      try {
        return JSON.parse(newState).state ?? newState
      } catch {
        return newState
      }
    }
    if (typeof newState === 'object' && newState !== null) {
      return (newState as { state?: string }).state ?? String(newState)
    }
    return String(newState)
  }

  /**
   * 从持久化的 json 中提取 attributes / changed_attributes。
   * @param json 持久化数据（对象或 JSON 字符串）
   * @returns 属性对象，解析失败返回 undefined
   */
  function extractPersistedAttributes(json: unknown): EntitySnapshot['attributes'] | undefined {
    if (!json) return undefined
    if (typeof json === 'object') {
      const obj = json as {
        attributes?: EntitySnapshot['attributes']
        changed_attributes?: EntitySnapshot['attributes']
      }
      return obj.attributes || obj.changed_attributes || undefined
    }
    if (typeof json === 'string') {
      try {
        const parsed = JSON.parse(json) as {
          attributes?: EntitySnapshot['attributes']
          changed_attributes?: EntitySnapshot['attributes']
        }
        return parsed?.attributes || parsed?.changed_attributes || undefined
      } catch {
        return undefined
      }
    }
    return undefined
  }

  /**
   * 将持久化事件行格式化为浮层内部事件项。
   *
   * 调用场景：hydrateFromApi 中对每条后端事件进行解析、过滤与去重指纹生成。
   *
   * @param row 持久化事件行
   * @returns 内部事件项；不在受控 domain 或无有效内容时返回 null
   */
  function formatPersistedEvent(row: PersistedEventRow): InternalOverlayEvent | null {
    const eid = row.entityId || ''
    if (!isEventLogOverlayDomain(eid)) return null

    let state = row.state || extractPersistedState(row.newState) || ''
    const oldState =
      (typeof row.oldState === 'string' ? row.oldState : '') ||
      extractPersistedState(row.oldState) ||
      ''
    let attrText: string | null = null

    // stateDiff 以 attr: 前缀标识纯属性变更
    if (row.stateDiff?.startsWith('attr:')) {
      attrText = parseAttrStateDiff(row.stateDiff)
      if (!state) state = entitiesStore.getEntity(eid)?.state ?? ''
    } else if (state && oldState && state === oldState) {
      // 状态未变但持久化记录存在：尝试描述属性差异
      attrText = describeAttrChange(
        eid,
        extractPersistedAttributes(row.oldState),
        extractPersistedAttributes(row.newState),
      )
    }

    if (!attrText && !state) return null
    if (!attrText && state === oldState) return null

    const created = row.createdAt ? new Date(row.createdAt) : new Date()
    const name = getEntityDisplayName(eid, entitiesStore.getEntity(eid))
    const label = resolveDisplayLabel(eid, state, attrText)
    const resolved = { state, attrText, label }
    const fp = buildOverlayEventFingerprint(
      eid,
      oldState ? { state: oldState, attributes: extractPersistedAttributes(row.oldState) } : null,
      { state, attributes: extractPersistedAttributes(row.newState) },
      resolved,
    )
    markSeenFp(fp)

    return {
      id: `db-${row.id}`,
      entityId: eid,
      name,
      state: label,
      timestamp: formatEventTime(created),
      colorClass: resolveColorClass(state, attrText),
      _ts: created.getTime(),
      _fp: fp,
    }
  }
  /**
   * 从 API 历史补水中拉取事件并填充到列表。
   *
   * 调用场景：组件挂载时，以及通过 registerEventLogRefreshHandler 注册的刷新触发点。
   * 异常：未登录或 API 不可用时静默失败，仍依赖实时 WS。
   */
  async function hydrateFromApi() {
    if (!authStore.isAuthenticated) return
    try {
      const entityIds = collectOverlayHydrationEntityIds(entitiesStore, layoutStore)
      if (!entityIds.length) return

      const { data } = await fetchEventTimeline({
        params: {
          entity_ids: entityIds.join(','),
          hours: getEventLogConfig().overlayHours,
          limit: MAX_EVENTS,
          // Overlay 解析完整状态描述，请求时显式要求回传
          includeFullState: 'true',
        },
      })

      // 解析 -> 过滤空 -> 按时间升序排序
      const rows = (data?.events ?? [])
        .map((row: PersistedEventRow, index: number) =>
          formatPersistedEvent({
            id: `${row.entityId}-${row.createdAt}-${index}`,
            entityId: row.entityId,
            stateDiff: row.stateDiff,
            oldState: row.oldState,
            newState: row.newState,
            createdAt: row.createdAt,
          }),
        )
        .filter((row: InternalOverlayEvent | null): row is InternalOverlayEvent => row != null)
        .sort((a: InternalOverlayEvent, b: InternalOverlayEvent) => (a._ts ?? 0) - (b._ts ?? 0))

      // 同一次补水内按指纹去重
      const seenFp = new Set<string>()
      const unique = rows.filter((row: InternalOverlayEvent) => {
        if (!row._fp || seenFp.has(row._fp)) return false
        seenFp.add(row._fp)
        return true
      })

      if (unique.length) {
        events.value = unique.map(({ _ts, _fp, ...evt }: InternalOverlayEvent) => evt).reverse()
        // 历史补水仅预填列表与去重指纹，不弹出浮层（避免进页 / WS 重连后一直显示）
      }
    } catch {
      /* 未登录或 API 不可用时仍依赖实时 WS */
    }
  }

  /**
   * 处理实时实体状态变更（WS 推送）。
   *
   * 调用场景：usePausableStateListener 回调，订阅 EVENT_LOG_OVERLAY_DOMAINS 域的实体变更。
   *
   * @param data 实体状态变更负载
   */
  function handleStateChange(data: EntityStateListenerPayload) {
    if (!data.new_state) return

    const { entity_id, new_state, old_state } = data
    if (!entity_id || !isEventLogOverlayDomain(entity_id)) return

    const resolved = resolveEntityStateChangeMessage(
      entity_id,
      old_state,
      new_state,
      formatEventLogStateLabel,
    )
    if (!resolved) return

    const fp = buildOverlayEventFingerprint(entity_id, old_state, new_state, resolved)
    const label = resolveDisplayLabel(entity_id, resolved.state, resolved.attrText)

    // 乐观更新：直接添加事件（应由 WS 回显再次去重）
    if (new_state._optimistic) {
      addEvent(entity_id, resolved.state, resolved.attrText, fp)
      return
    }

    if (shouldSkipDisplay(entity_id, label)) return
    addEvent(entity_id, resolved.state, resolved.attrText, fp)
  }

  onMounted(() => {
    isMounted.value = true
    hydrateFromApi()
    unregisterEventLogRefresh = registerEventLogRefreshHandler(hydrateFromApi) ?? null
    removeListener = usePausableStateListener(handleStateChange, {
      domains: [...EVENT_LOG_OVERLAY_DOMAINS],
    })
  })

  onUnmounted(() => {
    isMounted.value = false
    unregisterEventLogRefresh?.()
    unregisterEventLogRefresh = null
    if (hideTimer) clearTimeout(hideTimer)
    if (removeListener) removeListener()
    recentEventKeys.clear()
  })

  return {
    scrollContainer,
    events,
    scrollStyle,
    overlayStyle,
  }
}