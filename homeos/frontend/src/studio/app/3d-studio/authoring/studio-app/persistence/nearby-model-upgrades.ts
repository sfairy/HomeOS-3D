/**
 * Q03：首帧后闲时对近场 lite→full（聚焦类型若有则优先）。
 *
 * 从 `scene-layers-and-floor-build.ts` 的 waitForSceneReady 拆出。
 */

type NearbyUpgradeRuntime = {
  appCtx: {
    selectedItems?: unknown[]
    scheduleNearbyModelUpgrades?: (() => void) | null
  }
  externalModelRegistry?: {
    modelTypeForItem?: (item: unknown) => string | null | undefined
    upgradeModelsNearCamera?: (opts: {
      camera: unknown
      root: unknown
      nearDistance: number
      maxUpgrades: number
      focusTypes: string[]
    }) => Promise<string[] | void> | undefined
  }
  requestSceneRebuild?: (opts: { force: boolean; externalModelsOnly: boolean; scope: string }) => void
}

/** 绑定近场升级调度；idle 时跑一轮，并把同一函数挂到 appCtx 供运动静止后复用。 */
export function scheduleNearbyModelUpgradesAfterReady(params: {
  runtime: NearbyUpgradeRuntime
  isSceneStable: () => boolean
  camera: unknown
  sceneRoot: unknown
}): void {
  const { runtime, isSceneStable, camera, sceneRoot } = params
  const scheduleNearbyUpgrades = () => {
    if (!isSceneStable()) return
    const focusTypes = (runtime.appCtx.selectedItems || [])
      .map((item) => runtime.externalModelRegistry?.modelTypeForItem?.(item))
      .filter(Boolean) as string[]
    runtime.externalModelRegistry
      ?.upgradeModelsNearCamera?.({
        camera,
        root: sceneRoot,
        nearDistance: 4,
        maxUpgrades: 2,
        focusTypes,
      })
      ?.then?.((upgraded: string[] | void) => {
        upgraded?.length &&
          runtime.requestSceneRebuild?.({
            force: true,
            externalModelsOnly: true,
            scope: 'items',
          })
      })
  }
  const idleWindow = globalThis.window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  }
  if (typeof idleWindow?.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(scheduleNearbyUpgrades, { timeout: 4000 })
  } else {
    globalThis.window?.setTimeout?.(scheduleNearbyUpgrades, 400)
  }
  runtime.appCtx.scheduleNearbyModelUpgrades = scheduleNearbyUpgrades
}
