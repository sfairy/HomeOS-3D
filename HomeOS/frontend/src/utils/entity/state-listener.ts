/** 实体状态监听注册表 + 批量派发 */
import { describeAttrChange } from './control-attr-change.util'
import type { EntityStateListenerFlushDeps, EntityStateListenerFn, EntityStateListenerLogger, EntityStateListenerPayload, RegisterStateListenerOptions } from '@/types/entity-store'
import { logger } from '@/utils/core/logger'
import { getEntityDomain } from '@homeos/shared'

// ── entity-state-listener-registry.util ──
/**
 * 实体状态监听器索引注册表：按 entity_id / domain 定向派发，避免 O(batch × listeners) 全量广播
 */

const WILDCARD = '*'
const DOMAIN_PREFIX = '@domain:'

const byEntity = new Map<string, Set<EntityStateListenerFn>>()
const listenerKeys = new Map<EntityStateListenerFn, Set<string>>()

function ensureSet(key: string): Set<EntityStateListenerFn> {
  let set = byEntity.get(key)
  if (!set) {
    set = new Set<EntityStateListenerFn>()
    byEntity.set(key, set)
  }
  return set
}

function domainKey(domain: string): string {
  return `${DOMAIN_PREFIX}${domain}`
}

function normalizeKeys(
  entityIds: string | string[] | undefined | null,
  domains: string[] | undefined | null,
): Set<string> {
  const keys = new Set<string>()
  if (Array.isArray(domains) && domains.length > 0) {
    for (const d of domains) {
      if (d) keys.add(domainKey(d))
    }
  }
  if (entityIds == null || entityIds === '') {
    if (!keys.size) keys.add(WILDCARD)
    return keys
  }
  const arr = Array.isArray(entityIds) ? entityIds : [entityIds]
  for (const id of arr) {
    if (id) keys.add(id)
  }
  if (!keys.size) keys.add(WILDCARD)
  return keys
}

/** registerStateListener：函数，按签名入参返回处理结果。 */
export function registerStateListener(
  fn: EntityStateListenerFn,
  options: RegisterStateListenerOptions = {},
): () => void {
  if (typeof fn !== 'function') return () => {}
  unregisterStateListener(fn)
  const keys = normalizeKeys(options.entityIds, options.domains)
  listenerKeys.set(fn, keys)
  for (const key of keys) {
    ensureSet(key).add(fn)
  }
  return () => unregisterStateListener(fn)
}

function unregisterStateListener(fn: EntityStateListenerFn): void {
  const keys = listenerKeys.get(fn)
  if (!keys) return
  for (const key of keys) {
    byEntity.get(key)?.delete(fn)
    if (byEntity.get(key)?.size === 0) byEntity.delete(key)
  }
  listenerKeys.delete(fn)
}

/** 向一组监听器派发 payload（跳过已通知过的，单条异常不阻断其余派发） */
function dispatchToSet(
  set: Set<EntityStateListenerFn> | undefined,
  payload: EntityStateListenerPayload,
  notified: Set<EntityStateListenerFn>,
  logger: EntityStateListenerLogger | undefined,
): void {
  if (!set) return
  for (const fn of set) {
    if (notified.has(fn)) continue
    notified.add(fn)
    try {
      fn(payload)
    } catch (e) {
      logger?.error?.('状态监听器错误:', e)
    }
  }
}

/** dispatchStateListener：函数，按签名入参返回处理结果。 */
export function dispatchStateListener(
  payload: EntityStateListenerPayload,
  logger: EntityStateListenerLogger | undefined,
): void {
  const entityId = payload?.entity_id
  const notified = new Set<EntityStateListenerFn>()

  dispatchToSet(byEntity.get(WILDCARD), payload, notified, logger)

  if (entityId) {
    dispatchToSet(byEntity.get(entityId), payload, notified, logger)
    const domain = getEntityDomain(entityId)
    if (domain) {
      dispatchToSet(byEntity.get(domainKey(domain)), payload, notified, logger)
    }
  }
}

/** stateListenerPayloadFingerprint：函数，按签名入参返回处理结果。 */
export function stateListenerPayloadFingerprint(payload: EntityStateListenerPayload): string {
  const eid = payload?.entity_id ?? ''
  const oldS = payload?.old_state
  const newS = payload?.new_state
  const attrText = describeAttrChange(eid, oldS?.attributes, newS?.attributes)
  if (attrText) return `${eid}|attr|${attrText}`
  return `${eid}|state|${oldS?.state ?? ''}|${newS?.state ?? ''}`
}

function notificationFingerprint(payload: EntityStateListenerPayload): string {
  return stateListenerPayloadFingerprint(payload)
}

/**
 * 批内去重：仅折叠与上一条完全相同的通知，保留同实体连续不同变更。
 */
function dedupeNotificationBatch(
  batch: EntityStateListenerPayload[],
): EntityStateListenerPayload[] {
  const out: EntityStateListenerPayload[] = []
  let lastFp = ''
  for (let i = 0; i < batch.length; i++) {
    const payload = batch[i]
    if (!payload?.entity_id) continue
    const fp = notificationFingerprint(payload)
    if (fp === lastFp) continue
    out.push(payload)
    lastFp = fp
  }
  return out
}

function dispatchBatchNotifications(
  batch: EntityStateListenerPayload[],
  logger: EntityStateListenerLogger | undefined,
): void {
  const deduped = dedupeNotificationBatch(batch)
  for (const payload of deduped) {
    dispatchStateListener(payload, logger)
  }
}

/** getStateListenerCount：函数，按签名入参返回处理结果。 */
export function getStateListenerCount(): number {
  return listenerKeys.size
}

/** getStateListenerStats：函数，按签名入参返回处理结果。 */
export function getStateListenerStats(): {
  total: number
  global: number
  indexed: number
  domainScoped: number
  indexBuckets: number
} {
  let global = 0
  let indexed = 0
  let domainScoped = 0
  for (const keys of listenerKeys.values()) {
    if (keys.size === 1 && keys.has(WILDCARD)) {
      global++
    } else if ([...keys].every((k) => k.startsWith(DOMAIN_PREFIX))) {
      domainScoped++
    } else {
      indexed++
    }
  }
  return {
    total: listenerKeys.size,
    global,
    indexed,
    domainScoped,
    indexBuckets: byEntity.size,
  }
}

// ── entity-state-listener-batch.util ──
let pendingNotifications: EntityStateListenerPayload[] = []
let flushScheduled = false
let listenersPaused = false
let onPageVisible: (() => void) | null = null

const raf =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (fn: () => void) => setTimeout(fn, 16)

let flushDeps: EntityStateListenerFlushDeps | null = null

const FALLBACK_FLUSH_DEPS: EntityStateListenerFlushDeps = { logger }

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      listenersPaused = true
      return
    }
    listenersPaused = false
    onPageVisible?.()
    if (pendingNotifications.length) resumeListenerFlush()
  })
}

function getFlushDeps(): EntityStateListenerFlushDeps {
  return flushDeps || FALLBACK_FLUSH_DEPS
}

function rememberFlushDeps(deps: EntityStateListenerFlushDeps | null | undefined): void {
  if (deps) flushDeps = deps
}

function resumeListenerFlush(): void {
  if (!pendingNotifications.length || listenersPaused) return
  scheduleListenerFlush(getFlushDeps())
}

function flushListenerNotifications(): void {
  flushScheduled = false
  if (listenersPaused || !pendingNotifications.length) return

  const batch = pendingNotifications
  pendingNotifications = []
  dispatchBatchNotifications(batch, getFlushDeps().logger)
}

function scheduleListenerFlush(deps: EntityStateListenerFlushDeps): void {
  rememberFlushDeps(deps)
  if (flushScheduled || listenersPaused) return
  flushScheduled = true
  raf(flushListenerNotifications)
}

/** enqueueStateListenerNotifications：函数，按签名入参返回处理结果。 */
export function enqueueStateListenerNotifications(
  deps: EntityStateListenerFlushDeps,
  notifications: EntityStateListenerPayload[],
): void {
  if (!notifications?.length) return
  rememberFlushDeps(deps)
  pendingNotifications.push(...notifications)
  if (listenersPaused) return
  scheduleListenerFlush(deps)
}

/**
 * 单条更新路径：关键域即时通知，sensor 等走 rAF 合并
 */
export function notifyStateListener(
  deps: EntityStateListenerFlushDeps,
  payload: EntityStateListenerPayload,
  opts: { immediate?: boolean } = {},
): void {
  if (opts.immediate) {
    dispatchStateListener(payload, deps.logger)
    return
  }
  enqueueStateListenerNotifications(deps, [payload])
}

/** setStateListenerVisibilityHandler：函数，按签名入参返回处理结果。 */
export function setStateListenerVisibilityHandler(fn: (() => void) | null): void {
  onPageVisible = fn
}

/** getPendingListenerCount：函数，按签名入参返回处理结果。 */
export function getPendingListenerCount(): number {
  return pendingNotifications.length
}
