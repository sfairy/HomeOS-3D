/* ── 原 home-mode-draft.internals.ts 的实现 ── */
/** composables：自 home-mode.internals.ts 拆出 — 草稿解析/序列化（原 home-mode-draft.util.ts） */
import { getEntityDomain, normalizeHomeModeTimeAt } from '@homeos/shared'
import { normalizeSunOffset } from '@/features/home-mode/utils/trigger-summary.util'

export interface ModeActionDraft {
  kind: string
  entity_id: string
  domain: string
  service: string
  delay: number
  service_data: string
}

interface ModeTriggerDraft {
  type: string
  entityId: string
  at: string
  to: string
  from: string
  /** 日出/日落触发的事件（``sunrise`` / ``sunset``）；其它类型不用。 */
  event?: string
  /** 日出/日落的偏移分钟（负 = 提前），后端夹在 ±180。 */
  offsetMinutes?: number
}

export interface ModeDraft {
  name: string
  icon: string
  sortOrder: number
  exclusiveGroup: string
  priority: number
  /** 自动回落分钟数（0 = 不回落）：过渡模式到期退回「日常」，设备保持现状。 */
  settleMinutes?: number
  actions: ModeActionDraft[]
  triggers: ModeTriggerDraft[]
  isNew?: boolean
}

export interface HomeModeRecord {
  id: string
  name?: string
  icon?: string
  sortOrder?: number
  exclusiveGroup?: string
  priority?: number
  settleMinutes?: number
  config?: unknown
  triggers?: unknown
  [key: string]: unknown
}

export interface ActionTemplate {
  kind?: string
  entity_id?: string
  domain?: string
  service?: string
  delay?: number
  service_data?: string | Record<string, unknown>
  label?: string
  name?: string
  [key: string]: unknown
}

// ── home-mode-draft.util ──
function asJsonArray(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : []
}

function inferActionKind(action: Record<string, unknown>): string {
  if (typeof action.kind === 'string' && action.kind) return action.kind
  const entityId = String(action.entity_id || '')
  if (entityId.startsWith('scene.')) return 'scene'
  if (entityId.startsWith('script.')) return 'script'
  if (
    action.domain === 'security' ||
    entityId === 'disarmed' ||
    entityId === 'armed_home' ||
    entityId === 'armed_away' ||
    entityId === 'armed_night'
  ) {
    return 'security'
  }
  return 'entity'
}

function parseModeActions(config: unknown): ModeActionDraft[] {
  return asJsonArray(config).map((row) => {
    const actionRecord = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>
    const kind = inferActionKind(actionRecord)
    const entityId = String(actionRecord.entity_id || '')
    return {
      kind,
      entity_id: entityId,
      domain:
        String(actionRecord.domain || '') ||
        (kind === 'notify' ? 'notify' : kind === 'security' ? 'security' : entityId ? getEntityDomain(entityId) : ''),
      service:
        String(actionRecord.service || '') ||
        (kind === 'scene' || kind === 'script' ? 'turn_on' : kind === 'notify' ? 'send_message' : 'turn_on'),
      delay: actionRecord.delay ? Number(actionRecord.delay) : 0,
      service_data: actionRecord.service_data ? JSON.stringify(actionRecord.service_data, null, 2) : '',
    }
  })
}

function serializeModeActions(actions: ModeActionDraft[] | null | undefined) {
  return (actions || [])
    .filter((action) => action.entity_id?.trim())
    .map((action) => {
      const kind = action.kind || 'entity'
      const item: Record<string, unknown> = {
        kind,
        entity_id: action.entity_id.trim(),
        domain:
          action.domain?.trim() ||
          (kind === 'notify' ? 'notify' : kind === 'security' ? 'security' : getEntityDomain(action.entity_id.trim())),
        service:
          action.service?.trim() ||
          (kind === 'scene' || kind === 'script'
            ? 'turn_on'
            : kind === 'notify'
              ? 'send_message'
              : kind === 'security'
                ? 'arm'
                : 'turn_on'),
      }
      if (kind === 'notify' && !action.service_data?.trim()) {
        item.service_data = { message: action.entity_id.trim() }
      }
      const delay = Number(action.delay)
      if (delay > 0) item.delay = delay
      if (action.service_data?.trim()) {
        try {
          item.service_data = JSON.parse(action.service_data)
        } catch {
          throw new Error(`服务参数 JSON 无效：${action.entity_id}`)
        }
      }
      return item
    })
}

function parseModeTriggers(triggers: unknown): ModeTriggerDraft[] {
  return asJsonArray(triggers).map((row) => {
    const triggerRecord = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>
    return {
      type: String(triggerRecord.type || 'manual'),
      entityId: String(triggerRecord.entityId || ''),
      at: String(triggerRecord.at || ''),
      to: String(triggerRecord.to || ''),
      from: String(triggerRecord.from || ''),
      // 日出/日落：缺省按日出、偏移 0，保证老数据打开编辑器时 UI 不会出现空白控件。
      ...(triggerRecord.type === 'sun'
        ? {
            event: triggerRecord.event === 'sunset' ? 'sunset' : 'sunrise',
            offsetMinutes: Number(triggerRecord.offsetMinutes) || 0,
          }
        : {}),
    }
  })
}

/** 各类型触发器的必填校验（表驱动：新增类型只加一行，不给判定函数加分支）。 */
const TRIGGER_REQUIRED: Record<string, (trigger: ModeTriggerDraft) => boolean> = {
  // 日出/日落必须有事件：缺了它后端会按日出兜底，用户却以为配的是日落。
  sun: (trigger) => Boolean(String(trigger.event || '').trim()),
  time: (trigger) => Boolean(String(trigger.at || '').trim()),
  state: (trigger) => Boolean(String(trigger.to || '').trim()) && Boolean(String(trigger.entityId || '').trim()),
  lock_unlock: (trigger) => Boolean(String(trigger.entityId || '').trim()),
}

/** 触发器是否值得保存（缺关键字段的草稿不落库，否则后端会按兜底值执行）。 */
function isTriggerSerializable(trigger: ModeTriggerDraft): boolean {
  if (!trigger?.type || trigger.type === 'manual') return false
  const required = TRIGGER_REQUIRED[trigger.type]
  return required ? required(trigger) : true
}

/** 各类型触发器的字段写入（表驱动，避免一个函数里堆五六层 if）。 */
const TRIGGER_WRITERS: Record<string, (item: Record<string, unknown>, trigger: ModeTriggerDraft) => void> = {
  time: (item, trigger) => {
    const normalized = normalizeHomeModeTimeAt(trigger.at?.trim() || '')
    if (normalized) item.at = normalized
  },
  sun: (item, trigger) => {
    item.event = trigger.event === 'sunset' ? 'sunset' : 'sunrise'
    item.offsetMinutes = normalizeSunOffset(trigger.offsetMinutes)
  },
  state: (item, trigger) => {
    item.entityId = trigger.entityId.trim()
    if (trigger.to?.trim()) item.to = trigger.to.trim()
    if (trigger.from?.trim()) item.from = trigger.from.trim()
  },
  lock_unlock: (item, trigger) => {
    item.entityId = trigger.entityId.trim()
  },
}

/** 单个触发器 → 持久化形状。 */
function serializeTrigger(trigger: ModeTriggerDraft): Record<string, unknown> {
  const item: Record<string, unknown> = { type: trigger.type }
  TRIGGER_WRITERS[trigger.type]?.(item, trigger)
  return item
}

function serializeModeTriggers(triggers: ModeTriggerDraft[] | null | undefined) {
  const list = (triggers || []).filter(isTriggerSerializable).map(serializeTrigger)
  return list.length ? list : undefined
}

function emptyDraftWithName(name: string): ModeDraft {
  return {
    name,
    icon: '🏠',
    sortOrder: 0,
    exclusiveGroup: 'default',
    priority: 50,
    settleMinutes: 0,
    actions: [],
    triggers: [],
    isNew: true,
  }
}

export function modeRecordToDraft(modeRecord: HomeModeRecord): ModeDraft {
  return {
    name: modeRecord.name || '',
    icon: modeRecord.icon || '🏠',
    sortOrder: modeRecord.sortOrder ?? 0,
    exclusiveGroup: modeRecord.exclusiveGroup || 'default',
    priority: modeRecord.priority ?? 50,
    settleMinutes: modeRecord.settleMinutes ?? 0,
    actions: parseModeActions(modeRecord.config),
    triggers: parseModeTriggers(modeRecord.triggers),
    isNew: false,
  }
}

export function validateModeDraft(draft: ModeDraft | null | undefined): string | null {
  if (!draft?.name?.trim()) return '请填写模式名称'
  if (!draft.actions?.length) return '请至少添加一条设备动作'
  const triggers = draft.triggers || []
  for (let i = 0; i < triggers.length; i++) {
    const trigger = triggers[i]
    if (!trigger?.type || trigger.type === 'manual') continue
    if (trigger.type === 'time') {
      if (!String(trigger.at || '').trim()) {
        return `触发器 ${i + 1}：定时类型需填写时间`
      }
      if (!normalizeHomeModeTimeAt(trigger.at)) {
        return `触发器 ${i + 1}：时间格式无效，请使用 HH:mm（如 09:30）`
      }
    }
    if (trigger.type === 'state') {
      if (!String(trigger.entityId || '').trim()) {
        return `触发器 ${i + 1}：状态触发需选择实体`
      }
      if (!String(trigger.to || '').trim()) {
        return `触发器 ${i + 1}：状态触发需填写「变为」目标状态`
      }
    }
    if (trigger.type === 'lock_unlock' && !String(trigger.entityId || '').trim()) {
      return `触发器 ${i + 1}：门锁解锁触发需选择门锁实体`
    }
  }
  return null
}

export function buildSaveBody(draft: ModeDraft) {
  return {
    name: draft.name.trim(),
    icon: draft.icon || '🏠',
    config: serializeModeActions(draft.actions),
    triggers: serializeModeTriggers(draft.triggers),
    sortOrder: draft.sortOrder ?? 0,
    exclusiveGroup: draft.exclusiveGroup?.trim() || 'default',
    priority: Number.isFinite(Number(draft.priority)) ? Number(draft.priority) : 50,
    settleMinutes: Number.isFinite(Number(draft.settleMinutes)) ? Math.max(0, Number(draft.settleMinutes)) : 0,
  }
}

/** 草稿相对服务端记录是否有未保存变更 */
export function isDraftDirty(draft: ModeDraft | null | undefined, mode: HomeModeRecord | null | undefined) {
  if (!draft) return false
  if (draft.isNew) return true
  if (!mode) return false
  try {
    const fromDraft = buildSaveBody(draft)
    const fromServer = buildSaveBody(modeRecordToDraft(mode))
    return JSON.stringify(fromDraft) !== JSON.stringify(fromServer)
  } catch {
    return true
  }
}

export function emptyHomeModeDraft(name?: string) {
  return emptyDraftWithName(name ?? '新模式')
}
