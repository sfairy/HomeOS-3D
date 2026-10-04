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

function inferActionKind(a: Record<string, unknown>): string {
  if (typeof a.kind === 'string' && a.kind) return a.kind
  const entityId = String(a.entity_id || '')
  if (entityId.startsWith('scene.')) return 'scene'
  if (entityId.startsWith('script.')) return 'script'
  if (
    a.domain === 'security' ||
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
    const a = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>
    const kind = inferActionKind(a)
    const entityId = String(a.entity_id || '')
    return {
      kind,
      entity_id: entityId,
      domain:
        String(a.domain || '') ||
        (kind === 'notify'
          ? 'notify'
          : kind === 'security'
            ? 'security'
            : entityId
              ? getEntityDomain(entityId)
              : ''),
      service:
        String(a.service || '') ||
        (kind === 'scene' || kind === 'script'
          ? 'turn_on'
          : kind === 'notify'
            ? 'send_message'
            : 'turn_on'),
      delay: a.delay ? Number(a.delay) : 0,
      service_data: a.service_data ? JSON.stringify(a.service_data, null, 2) : '',
    }
  })
}

function serializeModeActions(actions: ModeActionDraft[] | null | undefined) {
  return (actions || [])
    .filter((a) => a.entity_id?.trim())
    .map((a) => {
      const kind = a.kind || 'entity'
      const item: Record<string, unknown> = {
        kind,
        entity_id: a.entity_id.trim(),
        domain:
          a.domain?.trim() ||
          (kind === 'notify'
            ? 'notify'
            : kind === 'security'
              ? 'security'
              : getEntityDomain(a.entity_id.trim())),
        service:
          a.service?.trim() ||
          (kind === 'scene' || kind === 'script'
            ? 'turn_on'
            : kind === 'notify'
              ? 'send_message'
              : kind === 'security'
                ? 'arm'
                : 'turn_on'),
      }
      if (kind === 'notify' && !a.service_data?.trim()) {
        item.service_data = { message: a.entity_id.trim() }
      }
      const delay = Number(a.delay)
      if (delay > 0) item.delay = delay
      if (a.service_data?.trim()) {
        try {
          item.service_data = JSON.parse(a.service_data)
        } catch {
          throw new Error(`服务参数 JSON 无效：${a.entity_id}`)
        }
      }
      return item
    })
}

function parseModeTriggers(triggers: unknown): ModeTriggerDraft[] {
  return asJsonArray(triggers).map((row) => {
    const t = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>
    return {
      type: String(t.type || 'manual'),
      entityId: String(t.entityId || ''),
      at: String(t.at || ''),
      to: String(t.to || ''),
      from: String(t.from || ''),
    }
  })
}

function serializeModeTriggers(triggers: ModeTriggerDraft[] | null | undefined) {
  const list = (triggers || [])
    .filter((t) => {
      if (!t?.type || t.type === 'manual') return false
      if (t.type === 'time' && !String(t.at || '').trim()) return false
      if (t.type === 'state' && !String(t.to || '').trim()) return false
      if (t.type === 'lock_unlock' && !String(t.entityId || '').trim()) return false
      if (t.type === 'state' && !String(t.entityId || '').trim()) return false
      return true
    })
    .map((t) => {
      const item: Record<string, unknown> = { type: t.type }
      if (t.type === 'lock_unlock' || t.type === 'state') {
        item.entityId = t.entityId.trim()
      }
      if (t.type === 'time' && t.at?.trim()) {
        const normalized = normalizeHomeModeTimeAt(t.at.trim())
        if (normalized) item.at = normalized
      }
      if (t.type === 'state') {
        if (t.to?.trim()) item.to = t.to.trim()
        if (t.from?.trim()) item.from = t.from.trim()
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

export function modeRecordToDraft(m: HomeModeRecord): ModeDraft {
  return {
    name: m.name || '',
    icon: m.icon || '🏠',
    sortOrder: m.sortOrder ?? 0,
    exclusiveGroup: m.exclusiveGroup || 'default',
    priority: m.priority ?? 50,
    actions: parseModeActions(m.config),
    triggers: parseModeTriggers(m.triggers),
    isNew: false,
  }
}

export function validateModeDraft(draft: ModeDraft | null | undefined): string | null {
  if (!draft?.name?.trim()) return '请填写模式名称'
  if (!draft.actions?.length) return '请至少添加一条设备动作'
  const triggers = draft.triggers || []
  for (let i = 0; i < triggers.length; i++) {
    const t = triggers[i]
    if (!t?.type || t.type === 'manual') continue
    if (t.type === 'time') {
      if (!String(t.at || '').trim()) {
        return `触发器 ${i + 1}：定时类型需填写时间`
      }
      if (!normalizeHomeModeTimeAt(t.at)) {
        return `触发器 ${i + 1}：时间格式无效，请使用 HH:mm（如 09:30）`
      }
    }
    if (t.type === 'state') {
      if (!String(t.entityId || '').trim()) {
        return `触发器 ${i + 1}：状态触发需选择实体`
      }
      if (!String(t.to || '').trim()) {
        return `触发器 ${i + 1}：状态触发需填写「变为」目标状态`
      }
    }
    if (t.type === 'lock_unlock' && !String(t.entityId || '').trim()) {
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
