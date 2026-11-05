/**
 * 开窗器 / 窗磁的「这扇窗现在开到哪」解析（0.8.4 `window-opener.js`）。
 *
 * 同一扇窗可能有两种传感器，语义完全不同：
 * - **窗磁**（`security.windows`）：只有 open / closed，开度全场统一（`openPercent`）；
 * - **开窗器**（`environment.windowOpeners`）：具备 `current_position`，能报 0–100%。
 *
 * `motionSource` 允许把某扇窗钉死在某一路（`contact` / `opener`），
 * `auto`（默认）按「有没有位置能力 + 有没有窗磁」自动选：
 * 能报位置就信开窗器，否则只要有窗磁就信窗磁。
 *
 * 两路都在且对不上时（开窗器说开着、窗磁说关着），先记 2 秒再报冲突，
 * 避免设备刚上电的瞬时错位也弹「状态不一致」。
 */

import { lockState } from '../security/lock-state'

export interface WindowBindingLike {
  id?: any
  entityId?: any
  floorId?: any
  modelId?: any
  motionSource?: string
  openPercent?: number
  legacyModels?: Array<{ id?: any; modelId?: any }>
}

export interface WindowContactLike {
  id?: any
  floorId?: any
  modelId?: any
  doorEntityId?: any
  openPercent?: number
  duration?: number
}

export interface WindowCoverStateLike {
  position?: number | null
  positionReported?: boolean
  positionSupported?: boolean
  available?: boolean
  state?: string
  moving?: boolean
  raw?: any
}

export interface WindowPreviewStateLike {
  position?: number | null
  moving?: boolean
  preview?: boolean
}

export interface WindowOpenerResolution {
  position: number | null
  direct: boolean
  moving: boolean
  source: 'contact' | 'opener'
  contactOpen: boolean | null
  conflict: boolean
  notice: string
}

const CONFLICT_GRACE_MS = 2000

/**
 * 找出与某扇窗同层、且绑定到同一扇（含推拉组历史扇）的窗磁。
 * 选择器里只给「可动扇」，所以这里也要按 `legacyModels` 把组模型拆开匹配。
 */
export function windowContacts(
  model: WindowBindingLike | null | undefined,
  sensors: WindowContactLike[] | null | undefined,
  windowModel: WindowBindingLike | null | undefined,
): WindowContactLike[] {
  if (!model) return []
  const modelIds = new Set<string>([
    String(model.modelId ?? model.id ?? ''),
    ...(windowModel?.legacyModels || []).map((legacyModel) => String(legacyModel.modelId ?? legacyModel.id ?? '')),
  ])
  return (sensors || []).filter(
    (sensor) => sensor.floorId === model.floorId && modelIds.has(String(sensor.modelId || '')) && sensor.doorEntityId,
  )
}

export function createWindowOpenerResolver({ now = () => performance.now() }: { now?: () => number } = {}) {
  const stateByBindingId = new Map<any, { identity: string; numeric: boolean; mismatch: number | null }>()
  let lastOwner: any,
    nextDelayMs = Infinity

  function begin(owner: any, bindingIds: any[]) {
    lastOwner !== owner && (stateByBindingId.clear(), (lastOwner = owner))
    const retainedBindingIdSet = new Set(bindingIds)
    for (const trackedBindingId of stateByBindingId.keys())
      retainedBindingIdSet.has(trackedBindingId) || stateByBindingId.delete(trackedBindingId)
    nextDelayMs = Infinity
  }

  function resolve(
    opener: WindowBindingLike,
    contacts: WindowContactLike[],
    states: Record<string, any>,
    coverState: WindowCoverStateLike,
    previewState: WindowPreviewStateLike,
  ): WindowOpenerResolution {
    // 身份里带上窗磁名单：用户改了窗磁绑定，缓存的位置能力与冲突计时都要作废。
    const identity = JSON.stringify([
      opener.entityId,
      opener.floorId,
      opener.modelId,
      opener.motionSource,
      contacts.map((contact) => [contact.id, contact.doorEntityId]),
    ])
    let openerState = stateByBindingId.get(opener.id)
    ;(!openerState || openerState.identity !== identity) &&
      ((openerState = { identity: identity, numeric: false, mismatch: null }),
      stateByBindingId.set(opener.id, openerState))
    // 设备能报位置的能力位可能晚一拍才到：见过一次就记一辈子，别每帧重判。
    openerState.numeric ||=
      coverState.positionReported || coverState.positionSupported || !!coverState.raw?.coverMemory?.position

    const contactOpenValues = contacts.map((contact) => lockState(contact, states).doorOpen),
      contactOpen = contactOpenValues.some((open) => open === true)
        ? true
        : contactOpenValues.length && contactOpenValues.every((open) => open === false)
          ? false
          : null,
      source: 'contact' | 'opener' =
        opener.motionSource && opener.motionSource !== 'auto'
          ? (opener.motionSource as 'contact' | 'opener')
          : openerState.numeric || !contacts.length
            ? 'opener'
            : 'contact'
    let position: number | null = null,
      direct = false,
      moving = false
    if (source === 'contact') {
      position = contactOpen === null ? null : contactOpen ? (opener.openPercent ?? contacts[0]?.openPercent ?? 100) : 0
    } else {
      const reportedPosition = coverState.position,
        previewPosition = previewState.position ?? reportedPosition,
        effectivePosition = previewPosition ?? reportedPosition
      effectivePosition != null
        ? ((position = (effectivePosition * (opener.openPercent ?? 100)) / 100),
          (direct = true),
          (moving = !!previewState.moving))
        : coverState.positionReported && coverState.state === 'open' && (position = opener.openPercent ?? 100)
    }
    const reportedOpen =
        coverState.available && coverState.position !== null
          ? (coverState.position as number) > 0
          : coverState.positionReported && coverState.state === 'open'
            ? true
            : coverState.positionReported && coverState.state === 'closed'
              ? false
              : null,
      isMismatch =
        contactOpen !== null &&
        reportedOpen !== null &&
        contactOpen !== reportedOpen &&
        !coverState.moving &&
        !previewState.moving &&
        !previewState.preview
    isMismatch ? (openerState.mismatch ??= now()) : (openerState.mismatch = null)
    const conflict = isMismatch && now() - (openerState.mismatch as number) >= CONFLICT_GRACE_MS
    isMismatch &&
      !conflict &&
      (nextDelayMs = Math.min(nextDelayMs, (openerState.mismatch as number) + CONFLICT_GRACE_MS))
    return {
      position: position,
      direct: direct,
      moving: moving,
      source: source,
      contactOpen: contactOpen,
      conflict: conflict,
      notice: conflict ? '开窗器与窗磁状态不一致，请核对窗户或设备回报。' : '',
    }
  }

  return {
    begin: begin,
    resolve: resolve,
    nextDelay: () => Math.max(0, nextDelayMs - now()),
    clear() {
      stateByBindingId.clear()
      nextDelayMs = Infinity
    },
  }
}
