/**
 * @file home-mode-draft.internals.ts
 * @module frontend/src/views
 */
/** composables：自 home-mode.internals.ts 拆出 — 草稿解析/序列化（原 home-mode-draft.util.ts） */
import { getEntityDomain, normalizeHomeModeTimeAt } from '@homeos/shared'

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
}

export interface ModeDraft {
  name: string
  icon: string
  sortOrder: number
  exclusiveGroup: string
  priority: number
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
        (kind === 'notify'
          ? 'notify'
          : kind === 'security'
            ? 'security'
            : entityId
              ? getEntityDomain(entityId)
              : ''),
      service:
        String(actionRecord.service || '') ||
        (kind === 'scene' || kind === 'script'
          ? 'turn_on'
          : kind === 'notify'
            ? 'send_message'
            : 'turn_on'),
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
          (kind === 'notify'
            ? 'notify'
            : kind === 'security'
              ? 'security'
              : getEntityDomain(action.entity_id.trim())),
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
    }
  })
}

function serializeModeTriggers(triggers: ModeTriggerDraft[] | null | undefined) {
  const list = (triggers || [])
    .filter((trigger) => {
      if (!trigger?.type || trigger.type === 'manual') return false
      if (trigger.type === 'time' && !String(trigger.at || '').trim()) return false
      if (trigger.type === 'state' && !String(trigger.to || '').trim()) return false
      if (trigger.type === 'lock_unlock' && !String(trigger.entityId || '').trim()) return false
      if (trigger.type === 'state' && !String(trigger.entityId || '').trim()) return false
      return true
    })
    .map((trigger) => {
      const item: Record<string, unknown> = { type: trigger.type }
      if (trigger.type === 'lock_unlock' || trigger.type === 'state') {
        item.entityId = trigger.entityId.trim()
      }
      if (trigger.type === 'time' && trigger.at?.trim()) {
        const normalized = normalizeHomeModeTimeAt(trigger.at.trim())
        if (normalized) item.at = normalized
      }
      if (trigger.type === 'state') {
        if (trigger.to?.trim()) item.to = trigger.to.trim()
        if (trigger.from?.trim()) item.from = trigger.from.trim()
      }
      return item
    })
  return list.length ? list : undefined
}

function emptyDraftWithName(name: string): ModeDraft {
  return {
    name,
    icon: '🏠',
    sortOrder: 0,
    exclusiveGroup: 'default',
    priority: 50,
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
