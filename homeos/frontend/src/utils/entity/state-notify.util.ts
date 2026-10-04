/**
 * 判断是否应向 onStateChanged 监听器派发事件（避免乐观更新 + WS 回显重复）
 */
import type {
  EntityStateNotifyArgs,
  HaEntityState,
  ResolveListenerOldStateArgs,
} from '@/types/entity-store'

function attributesChanged(
  cached: HaEntityState | null | undefined,
  newState: HaEntityState | null | undefined,
  changedAttributes: Record<string, unknown> | undefined,
): boolean {
  if (changedAttributes != null) {
    return Object.keys(changedAttributes).length > 0
  }
  if (!cached || !newState) return false
  return cached.attributes !== newState.attributes
}

export function shouldNotifyStateChange({
  cached,
  cachedOld,
  newStateValue,
  oldState,
  newState,
  changedAttributes,
}: EntityStateNotifyArgs): boolean {
  if (!newState) return true

  const serverAttrDelta = changedAttributes != null && Object.keys(changedAttributes).length > 0
  const haReportedChange = !!(oldState && newState && oldState.state !== newState.state)
  const attrsChanged = attributesChanged(cached, newState, changedAttributes)

  // 服务端 WS delta 确认的属性变更（常见于空调调温/风速后的乐观回显）
  if (serverAttrDelta && attrsChanged) {
    return true
  }

  // 乐观更新已派发监听器：WS/REST 回显确认同一目标态时不再重复通知
  if (cached?._optimistic) {
    if (haReportedChange && newStateValue !== cachedOld) return true
    return false
  }

  const alreadyAtNewState = cachedOld === newStateValue
  const localChanged = cachedOld !== newStateValue

  if (!haReportedChange && !localChanged && attrsChanged) {
    return true
  }

  return (haReportedChange && !alreadyAtNewState) || (localChanged && !alreadyAtNewState)
}

/** 监听器 old_state：优先 HA 上报的真实旧态 */
export function resolveListenerOldState({
  haReportedChange,
  oldState,
  cached,
}: ResolveListenerOldStateArgs): HaEntityState | null {
  const haChanged = !!haReportedChange
  return (haChanged ? oldState : null) ?? cached ?? null
}

export function haStateChanged(
  oldState: HaEntityState | null | undefined,
  newState: HaEntityState | null | undefined,
): boolean {
  return !!(oldState && newState && oldState.state !== newState.state)
}
