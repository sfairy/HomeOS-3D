const excludedComponentKeySet = new Set(['actions', 'bindings', 'position', 'properties', 'style'])
import { sha256 } from '../bridge/scene/sha256'
/** 未保存副本的指纹：文档签名的 SHA-256（十六进制 64 位）。 */
const RECOVERY_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/
/** `saveAttempts` 上限（上游同款：超过 16 条时保留第一条 + 最近 14 条）。 */
const MAX_RECOVERY_SAVE_ATTEMPTS = 16
export function recoveryFingerprint(recoveryDocument: any) {
  return sha256(documentSignature(recoveryDocument))
}
export function createRecoveryWriter(
  writeRecoverySnapshot: any,
  { delay: delayMs = 200, setTimer: setTimer = setTimeout, clearTimer: clearTimer = clearTimeout } = {},
) {
  let pendingSnapshot: any = null,
    timeoutId: any = null
  const flushPendingSnapshot = () => {
    timeoutId !== null && clearTimer(timeoutId), (timeoutId = null)
    const flushedSnapshot = pendingSnapshot
    ;(pendingSnapshot = null), flushedSnapshot && writeRecoverySnapshot(flushedSnapshot)
  }
  return {
    schedule(incomingSnapshot: any) {
      pendingSnapshot && pendingSnapshot.projectId !== incomingSnapshot.projectId && flushPendingSnapshot(),
        (pendingSnapshot = incomingSnapshot),
        timeoutId === null && (timeoutId = setTimer(flushPendingSnapshot, delayMs))
    },
    flush: flushPendingSnapshot,
    cancel(projectId: any) {
      !pendingSnapshot ||
        pendingSnapshot.projectId !== projectId ||
        ((pendingSnapshot = null), timeoutId !== null && clearTimer(timeoutId), (timeoutId = null))
    },
  }
}
export function editorComponentEntries(editorDocument: any) {
  const componentById = new Map(),
    orderKeys: any = [],
    collectComponent = (component: any, scope: any, pagePath: any, parentId: any = null) => {
      if (!component?.id) return
      const componentId = String(component.id)
      componentById.set(componentId, {
        component: component,
        scope: scope,
        pagePath: pagePath,
        parentId: parentId,
      }),
        orderKeys.push(scope + ':' + (pagePath || '') + ':' + (parentId || '') + ':' + componentId)
      for (const nestedComponent of component.children || [])
        collectComponent(nestedComponent, scope, pagePath, componentId)
    }
  for (const sharedComponent of editorDocument?.sharedComponents || [])
    collectComponent(sharedComponent, 'shared', '', null)
  for (const page of editorDocument?.pages || [])
    for (const pageComponent of page.components || []) collectComponent(pageComponent, 'page', page.path, null)
  return {
    entries: componentById,
    order: orderKeys,
  }
}
export function editorComponentStructure(sourceComponent: any) {
  const componentStructure: Record<string, unknown> = {}
  for (const [propertyKey, propertyValue] of Object.entries(sourceComponent || {}))
    excludedComponentKeySet.has(propertyKey) ||
      propertyKey === 'children' ||
      (componentStructure[propertyKey] = propertyValue)
  return (
    (componentStructure.children = (sourceComponent?.children || []).map((childComponent: any) => childComponent.id)),
    JSON.stringify(componentStructure)
  )
}
export function editorDocumentFrameSignature(sourceDocument: any) {
  const strippedDocument = {
    ...(sourceDocument || {}),
  }
  return (
    (strippedDocument.sharedComponents = []),
    strippedDocument.pages &&
      (strippedDocument.pages = strippedDocument.pages.map((pageEntry: any) => ({
        ...pageEntry,
        components: [] as any[],
      }))),
    documentSignature(strippedDocument)
  )
}
export function documentSignature(documentToSign: any): any {
  const normalizeAction = (actionConfig: any) => {
      if (!actionConfig || !actionConfig.type || actionConfig.type === 'none') return null
      const actionCopy = {
        ...actionConfig,
      }
      return (
        (!actionCopy.data || !Object.keys(actionCopy.data).length) && delete actionCopy.data,
        actionCopy.type !== 'navigate' && delete actionCopy.target,
        // ``domain`` / ``service`` **不能**剥：签名同时用于「脏判定 + 去重」，
        // 剥掉之后「只改动作域/服务」的编辑与会话开头的签名完全相同，
        // ``projectSummary`` 的 ``if (currentDocument === editHistoryEntry) return`` 会直接早退
        // —— 文档不落、不进 undo、不置脏，切页时静默丢失。
        canonicalizeForSignature(actionCopy)
      )
    },
    canonicalizeForSignature = (rawValue: any, parentKey = ''): any =>
      Array.isArray(rawValue)
        ? rawValue.map((arrayElement) => canonicalizeForSignature(arrayElement))
        : rawValue && typeof rawValue == 'object'
          ? Object.fromEntries(
              parentKey === 'actions'
                ? Object.keys(rawValue)
                    .sort()
                    .flatMap((actionKey) => {
                      const normalizedAction: any = normalizeAction(rawValue[actionKey])
                      return normalizedAction ? [[actionKey, normalizedAction]] : []
                    })
                : Object.keys(rawValue)
                    .sort()
                    .map((entryKey) => [entryKey, canonicalizeForSignature(rawValue[entryKey], entryKey)]),
            )
          : rawValue
  return JSON.stringify(canonicalizeForSignature(documentToSign || null))
}
export function recoveryStorageKey(storagePrefix: any, recoveryProjectId: any) {
  return '' + storagePrefix + recoveryProjectId
}
/**
 * 记录一次「保存尝试」：`{revision, fingerprint}`。
 *
 * 用途：刷新后只剩快照、服务器 revision 已经推进一格时，无法单靠 revision 判断
 * 「这份快照是不是我刚保存过的那份」。指纹能证明「本机这份内容确实已经写进过服务器」，
 * 于是可以安全地转成 `restored`（静默沿用、不再弹冲突），而不是误报冲突吓用户。
 */
export function recordRecoverySaveAttempt(
  saveAttempts: any,
  revision: any,
  recoveryDocument: any,
): Array<{ revision: any; fingerprint: string }> {
  const recordedAttempt = {
      revision: revision,
      fingerprint: recoveryFingerprint(recoveryDocument),
    },
    matchingAttempts = (Array.isArray(saveAttempts) ? saveAttempts.slice(0, 16) : []).filter(
      (attempt: any) => attempt?.revision === revision && RECOVERY_FINGERPRINT_PATTERN.test(attempt.fingerprint),
    )
  if (matchingAttempts.some((attempt: any) => attempt.fingerprint === recordedAttempt.fingerprint))
    return matchingAttempts
  return [
    ...(matchingAttempts.length >= MAX_RECOVERY_SAVE_ATTEMPTS
      ? [matchingAttempts[0], ...matchingAttempts.slice(-14)]
      : matchingAttempts),
    recordedAttempt,
  ]
}
/**
 * 刷新后判定未保存副本的四个状态（0.8.4）：
 *
 * - `discard`：项目/文档对不上，或内容与已保存完全一致 —— 快照没有价值，直接丢掉；
 * - `restore`：revision 与全局弹窗版本都没变 —— 安全恢复；
 * - `restored`：服务器 revision 正好是快照 revision + 1，指纹证明本机内容已保存成功，
 *   只是快照没来得及清理 —— 静默沿用，不再弹「要不要恢复」；
 * - `conflict`：服务器已被别处改过 —— 不允许直接恢复，只允许下载副本或丢弃。
 */
export function resolveUnsavedRecovery(
  recovery: any,
  loadedProject: any,
): { status: 'discard' | 'restore' | 'restored' | 'conflict'; recovery: any } {
  if (
    !recovery?.document ||
    recovery.projectId !== loadedProject?.projectId ||
    recovery.document.projectId !== loadedProject?.document?.projectId
  )
    return { status: 'discard', recovery: null }
  const loadedSignature = documentSignature(loadedProject.document)
  if (documentSignature(recovery.document) === loadedSignature) return { status: 'discard', recovery: null }
  const popupRevisionMatches =
    recovery.globalPopupRevision == null || recovery.globalPopupRevision === loadedProject.globalPopupRevision
  if (recovery.revision === loadedProject.revision && popupRevisionMatches)
    return { status: 'restore', recovery: recovery }
  const candidateAttempts = (Array.isArray(recovery.saveAttempts) ? recovery.saveAttempts.slice(0, 16) : []).filter(
    (attempt: any) =>
      attempt?.revision === recovery.revision &&
      Number.isSafeInteger(attempt.revision) &&
      loadedProject.revision === attempt.revision + 1 &&
      RECOVERY_FINGERPRINT_PATTERN.test(attempt.fingerprint),
  )
  const loadedFingerprint = candidateAttempts.length ? sha256(loadedSignature) : null
  return candidateAttempts.some((attempt: any) => attempt.fingerprint === loadedFingerprint)
    ? {
        status: 'restored',
        recovery: {
          ...recovery,
          revision: loadedProject.revision,
          globalPopupRevision: loadedProject.globalPopupRevision,
          saveAttempts: [],
          // 已保存的那一步不该再出现在撤销栈里（撤回去等于把服务器上的内容改回旧版）。
          undo: (Array.isArray(recovery.undo) ? recovery.undo : []).filter(
            (historyStep: any) => historyStep?.kind !== 'save',
          ),
          redo: [],
        },
      }
    : { status: 'conflict', recovery: recovery }
}
