/**
 * 3D 重载面包屑存储（sessionStorage `homeos:i3d-reload-breadcrumbs:v1`）。
 *
 * 舞台 iframe 重载 / bfcache 恢复后，把「上一次为什么重载」带给新实例，避免分类切换
 * 这类主动载入被误判成异常。三条不变量：写盘前必须清洗（计数走 `sanitizeCounts`）；
 * 读回的数据一律当不可信输入逐项校验；只采信 `instanceToken` 相同的条目历史。
 *
 * 从 `runtime/core/runtime.ts` 抽出，纯存储逻辑不再占用那个数千行编排宿主的行数预算。
 */
import { sanitizeCounts } from './lifecycle-counts'

const STORAGE_KEY = 'homeos:i3d-reload-breadcrumbs:v1',
  MAX_ENTRIES = 16,
  MAX_EVENTS = 8,
  MAX_RAW_LENGTH = 65536,
  MAX_SERIALIZED_LENGTH = 32768,
  EVENT_TTL_MS = 900000

interface BreadcrumbEvent {
  code: string
  at: number
  counts: Record<string, number | boolean>
}
interface Breadcrumb {
  key: string
  document: string
  events: BreadcrumbEvent[]
}
/** 读回的原始形状：字段全都可能缺失 / 类型不对，只能逐项校验。 */
type RawRecord = Record<string, unknown>

const asRecord = (value: unknown): RawRecord | null =>
  value && typeof value == 'object' && !Array.isArray(value) ? (value as RawRecord) : null

/**
 * 创建面包屑存储。
 * @param instanceToken 当前运行时实例标识（区分同一份文档的旧事件）
 * @param acceptedEventCodes 允许记录的事件码白名单
 */
export function createBreadcrumbStore(instanceToken: string, acceptedEventCodes: ReadonlySet<string>) {
  /** 读回并校验历史条目；任何异常都按「没有历史」处理。 */
  function readStoredBreadcrumbs(): Breadcrumb[] {
    try {
      const raw = window.sessionStorage?.getItem(STORAGE_KEY)
      if (!raw || raw.length > MAX_RAW_LENGTH) return []
      const parsed: unknown = JSON.parse(raw),
        readAtMs = Date.now()
      if (!Array.isArray(parsed)) return []
      return parsed
        .slice(-MAX_ENTRIES)
        .map((entry: unknown) => {
          const record = asRecord(entry),
            events = Array.isArray(record?.events) ? record.events : []
          if (typeof record?.key != 'string' || record.key.length >= 180) return null
          if (typeof record?.document != 'string' || record.document.length >= 80) return null
          const keptEvents = events
            .slice(-MAX_EVENTS)
            .map((rawEvent: unknown) => {
              const event = asRecord(rawEvent),
                at = event?.at
              if (typeof event?.code != 'string' || !acceptedEventCodes.has(event.code)) return null
              if (typeof at != 'number' || !Number.isFinite(at) || readAtMs < at || readAtMs - at > EVENT_TTL_MS)
                return null
              return { code: event.code, at, counts: sanitizeCounts(asRecord(event?.counts) ?? {}) }
            })
            .filter((event): event is BreadcrumbEvent => event !== null)
          return keptEvents.length ? { key: record.key, document: record.document, events: keptEvents } : null
        })
        .filter((entry): entry is Breadcrumb => entry !== null)
    } catch {
      return []
    }
  }

  return {
    /** 同 key、同文档实例的历史事件（跨实例不参与推断）。 */
    previous(lookupKey: string) {
      const matched = readStoredBreadcrumbs().find((candidate) => candidate.key === lookupKey)
      return matched && matched.document !== instanceToken ? matched.events : []
    },
    /** 记一条事件：非白名单码忽略，存储失败不影响本次渲染。 */
    remember(rememberKey: string, eventCode: string, eventCounts: unknown) {
      if (!acceptedEventCodes.has(eventCode)) return
      try {
        const storedBreadcrumbs = readStoredBreadcrumbs(),
          existing = storedBreadcrumbs.find((candidate) => candidate.key === rememberKey),
          events = existing?.document === instanceToken ? existing.events : []
        events.push({ code: eventCode, at: Date.now(), counts: sanitizeCounts(asRecord(eventCounts) ?? {}) })
        const remaining = storedBreadcrumbs.filter((entry) => entry.key !== rememberKey)
        remaining.push({ key: rememberKey, document: instanceToken, events: events.slice(-MAX_EVENTS) })
        const trimmed = remaining.slice(-MAX_ENTRIES)
        for (; JSON.stringify(trimmed).length > MAX_SERIALIZED_LENGTH; ) trimmed.shift()
        window.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(trimmed))
      } catch {
        /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */
      }
    },
  }
}
