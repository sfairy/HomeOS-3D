import { entityPowerIsOn, entityToggleCommand } from './entity-power'
const switchDomainSet = new Set(['switch', 'input_boolean', 'light', 'fan'])

/** 情景动作的去重 / 订阅总线：同一个控件连点只发一条命令，弹窗里同键的开关同步 pending。 */
export function createSceneActionRequests() {
  const pendingByKey = new Map<string, object>(),
    subscribersByKey = new Map<string, Set<(state: any) => void>>()
  let disposed = false
  const publish = (actionKey: string, actionState: any) => {
    for (const subscriber of subscribersByKey.get(actionKey) || []) subscriber(actionState)
  }
  return {
    isPending: (actionKey: string) => pendingByKey.has(actionKey),
    subscribe(actionKey: string, subscriber: (state: any) => void) {
      if (disposed) return () => {}
      subscribersByKey.has(actionKey) || subscribersByKey.set(actionKey, new Set())
      const subscriberSet = subscribersByKey.get(actionKey)!
      return (
        subscriberSet.add(subscriber),
        () => {
          subscriberSet.delete(subscriber),
            !subscriberSet.size &&
              subscribersByKey.get(actionKey) === subscriberSet &&
              subscribersByKey.delete(actionKey)
        }
      )
    },
    run(actionKey: string, actionCommand: () => any) {
      if (disposed || pendingByKey.has(actionKey)) return null
      const actionToken = {}
      pendingByKey.set(actionKey, actionToken), publish(actionKey, { pending: true, error: null })
      const settleAction = (actionError: any) => {
        disposed ||
          pendingByKey.get(actionKey) !== actionToken ||
          (pendingByKey.delete(actionKey), publish(actionKey, { pending: false, error: actionError }))
      }
      let actionPromise: Promise<any>
      try {
        actionPromise = Promise.resolve(actionCommand())
      } catch (actionError) {
        actionPromise = Promise.reject(actionError)
      }
      return actionPromise.then(
        (actionResult) => (settleAction(null), actionResult),
        (actionError) => {
          throw (settleAction(actionError), actionError)
        },
      )
    },
    retain(activeKeys: Iterable<string>) {
      const activeKeySet = new Set(activeKeys)
      for (const pendingKey of pendingByKey.keys()) activeKeySet.has(pendingKey) || pendingByKey.delete(pendingKey)
      for (const subscriberKey of subscribersByKey.keys())
        activeKeySet.has(subscriberKey) || subscribersByKey.delete(subscriberKey)
    },
    dispose() {
      ;(disposed = true), pendingByKey.clear(), subscribersByKey.clear()
    },
  }
}
export function resolveSceneControlMode(controlMode: any, entityId = '') {
  return ['switch', 'scene'].includes(controlMode)
    ? controlMode
    : switchDomainSet.has(entityId.split('.')[0])
      ? 'switch'
      : 'scene'
}
function sceneModeState(stateEntityId: any, entityState: any, sceneControlMode: any) {
  const entityStateValue = entityState?.newState?.state ?? entityState?.state,
    isMomentary = resolveSceneControlMode(sceneControlMode, stateEntityId) === 'scene'
  return {
    momentary: isMomentary,
    active: !isMomentary && entityPowerIsOn(stateEntityId, entityState),
    available:
      !!stateEntityId &&
      entityStateValue != null &&
      entityStateValue !== 'unavailable' &&
      (isMomentary || entityStateValue !== 'unknown'),
  }
}
function sceneModeCommand(
  targetEntityId: any,
  stateRecord: any,
  entityControlMode: any,
): { domain: any; service: any; entityId: any; data?: any } {
  const sceneState = sceneModeState(targetEntityId, stateRecord, entityControlMode)
  if (!sceneState.available) throw new Error('情景模式关联实体不可用。')
  const entityDomain = targetEntityId.split('.')[0]
  return !sceneState.momentary && ['climate', 'media_player', 'water_heater'].includes(entityDomain)
    ? {
        ...entityToggleCommand(targetEntityId, stateRecord),
        entityId: targetEntityId,
      }
    : {
        domain: entityDomain,
        service: ['button', 'input_button'].includes(entityDomain)
          ? 'press'
          : sceneState.momentary || !sceneState.active
            ? 'turn_on'
            : 'turn_off',
        entityId: targetEntityId,
      }
}
export function bindSceneMode(hostElement: any, navigationElement: any, component: any, sceneRuntime: any) {
  const componentProperties = component.properties || {},
    boundEntityId = component.bindings?.entity?.entityId || '',
    resolvedControlMode = resolveSceneControlMode(componentProperties.controlMode, boundEntityId),
    // 0.8.4：情景控件当「弹窗入口」用时，外观与交互都要让读屏 / 键盘知道点开的是弹窗。
    isPopupEntrance = componentProperties.popupEnabled === true && typeof sceneRuntime.openScenePopup == 'function'
  let boundEntityState = sceneRuntime.states?.get(boundEntityId),
    previewState = sceneRuntime.previewState || 'auto',
    isBusy = false,
    isPulseActive = false,
    errorText = '',
    isDisposed = false,
    timeoutId: any = null
  const sceneActionRequests = sceneRuntime.sceneActionRequests,
    sceneActionKey = sceneRuntime.sceneActionKey,
    isActionPending = () => isDisposed || (sceneActionKey ? !!sceneActionRequests?.isPending(sceneActionKey) : isBusy)
  const runningAnimationSet = new Set<Animation>(),
    clampUnitValue = (opacityValue: any, fallbackOpacity: any) =>
      Number.isFinite(Number(opacityValue)) ? Math.max(0, Math.min(1, Number(opacityValue))) : fallbackOpacity,
    isAnimationEnabled = componentProperties.activationAnimation !== 'none'
  hostElement.classList.toggle('has-animation', isAnimationEnabled)
  function syncSceneModeUi() {
    if (isDisposed) return
    const currentSceneState = sceneModeState(boundEntityId, boundEntityState, resolvedControlMode),
      isActive =
        sceneRuntime.editable && previewState !== 'auto'
          ? previewState === 'on'
          : currentSceneState.available && (currentSceneState.active || isPulseActive)
    navigationElement.classList.toggle('active', isActive),
      navigationElement.style.setProperty(
        '--navigation-text-opacity',
        String(
          clampUnitValue(
            isActive ? componentProperties.textActiveOpacity : componentProperties.textIdleOpacity,
            isActive ? 0.9 : 0.4,
          ),
        ),
      ),
      navigationElement.style.setProperty(
        '--navigation-icon-opacity',
        String(
          clampUnitValue(
            isActive ? componentProperties.iconActiveOpacity : componentProperties.iconIdleOpacity,
            isActive ? 0.9 : 0.3,
          ),
        ),
      ),
      (hostElement.dataset.state = currentSceneState.available
        ? currentSceneState.active
          ? 'on'
          : 'off'
        : 'unavailable'),
      hostElement.setAttribute('aria-busy', String(isActionPending())),
      hostElement.setAttribute(
        'aria-disabled',
        String(!currentSceneState.available || isActionPending() || !!sceneRuntime.editable),
      ),
      (hostElement.tabIndex = isPopupEntrance
        ? sceneRuntime.editable
          ? -1
          : 0
        : sceneRuntime.editable || !currentSceneState.available
          ? -1
          : 0),
      isPopupEntrance
        ? (hostElement.classList.add('is-popup-entrance'), hostElement.setAttribute('aria-haspopup', 'dialog'))
        : (hostElement.classList.remove('is-popup-entrance'), hostElement.removeAttribute('aria-haspopup')),
      currentSceneState.momentary
        ? hostElement.removeAttribute('aria-pressed')
        : hostElement.setAttribute('aria-pressed', String(currentSceneState.active)),
      hostElement.classList.toggle('is-unavailable', !sceneRuntime.editable && !currentSceneState.available),
      (hostElement.title =
        errorText || (boundEntityId ? (currentSceneState.available ? '' : '关联实体不可用') : '请在编辑器中绑定实体')),
      sceneRuntime.onSceneStateChange?.({
        state: currentSceneState,
        active: isActive,
        pending: isActionPending(),
        flash: isPulseActive,
        errorMessage: errorText,
      })
  }
  function playActivationAnimation() {
    if (!isAnimationEnabled || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    for (const runningAnimation of runningAnimationSet) runningAnimation.cancel()
    runningAnimationSet.clear()
    const iconElement = navigationElement.querySelector('.hb-navigation-icon')
    if (!iconElement?.animate) return
    const iconAnimation = iconElement.animate(
      [
        {
          transform: 'translate(-50%,-50%) scale(1)',
          offset: 0,
        },
        {
          transform: 'translate(-50%,-50%) scale(.86)',
          offset: 0.18,
        },
        {
          transform: 'translate(-50%,-50%) scale(1.09)',
          offset: 0.48,
        },
        {
          transform: 'translate(-50%,-50%) scale(.98)',
          offset: 0.73,
        },
        {
          transform: 'translate(-50%,-50%) scale(1)',
          offset: 1,
        },
      ],
      {
        duration: 460,
        easing: 'ease-in-out',
      },
    )
    runningAnimationSet.add(iconAnimation),
      iconAnimation.finished.catch(() => {}).finally(() => runningAnimationSet.delete(iconAnimation))
  }
  async function handleSceneModeClick(clickEvent: any) {
    if (!sceneRuntime.editable && componentProperties.popupEnabled === true && sceneRuntime.openScenePopup) {
      clickEvent?.stopPropagation(), sceneRuntime.openScenePopup(component)
      return
    }
    if (!sceneRuntime.editable && (clickEvent?.stopPropagation(), !(isActionPending() || isDisposed)))
      try {
        const sceneCommand = sceneModeCommand(boundEntityId, boundEntityState, resolvedControlMode)
        if (
          ((isBusy = true),
          (isPulseActive = false),
          (errorText = ''),
          clearTimeout(timeoutId),
          hostElement.classList.remove('is-error'),
          syncSceneModeUi(),
          playActivationAnimation(),
          await (sceneActionRequests && sceneActionKey
            ? sceneActionRequests.run(sceneActionKey, () =>
                sceneRuntime.callEntityService(
                  sceneCommand.domain,
                  sceneCommand.service,
                  sceneCommand.entityId,
                  sceneCommand.data || {},
                ),
              )
            : sceneRuntime.callEntityService(
                sceneCommand.domain,
                sceneCommand.service,
                sceneCommand.entityId,
                sceneCommand.data || {},
              )),
          isDisposed)
        )
          return
        sceneModeState(boundEntityId, boundEntityState, resolvedControlMode).momentary &&
          isAnimationEnabled &&
          ((isPulseActive = true),
          (timeoutId = setTimeout(() => {
            ;(isPulseActive = false), syncSceneModeUi()
          }, 700)))
      } catch (commandError: any) {
        isDisposed ||
          (hostElement.classList.add('is-error'),
          (errorText = commandError.message || '情景模式触发失败'),
          sceneRuntime.onError?.(commandError))
      } finally {
        isDisposed || ((isBusy = false), syncSceneModeUi())
      }
  }
  hostElement.addEventListener('click', handleSceneModeClick)
  const sceneActionUnsubscribe =
    sceneActionRequests && sceneActionKey
      ? sceneActionRequests.subscribe(sceneActionKey, (actionState: any) => {
          isDisposed ||
            ((errorText = actionState.error?.message || ''),
            hostElement.classList.toggle('is-error', !!actionState.error),
            syncSceneModeUi())
        })
      : null
  const sceneModeController = {
    update(nextEntityState: any, nextPreviewState = previewState) {
      ;(boundEntityState = nextEntityState), (previewState = nextPreviewState), syncSceneModeUi()
    },
    destroy() {
      ;(isDisposed = true), sceneActionUnsubscribe?.(), clearTimeout(timeoutId)
      for (const activeAnimation of runningAnimationSet) activeAnimation.cancel()
      runningAnimationSet.clear(), hostElement.removeEventListener('click', handleSceneModeClick)
    },
  }
  return (
    (hostElement.sceneModeController = sceneModeController),
    sceneRuntime.cleanup?.(() => sceneModeController.destroy()),
    syncSceneModeUi(),
    sceneModeController
  )
}
