import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import {
  DEFAULT_BASE_LIGHTING as DEFAULT_BASE_LIGHTING2,
  normalizeBaseLighting as normalizeBaseLighting2,
} from '../../../loaders/studio-normalization'

export function postBridgeState(runtime: StudioAppRuntime, bridgeStateName = 'ready', bridgeMessage = '') {
  !runtime.isAutoDiagramEmbed ||
    !runtime.autoDiagramComponentId ||
    window.parent === window ||
    !runtime.appCtx.studioProject ||
    window.parent.postMessage(
      {
        type: 'homeos-floorplan-auto-diagram-base-lighting-state',
        componentId: runtime.autoDiagramComponentId,
        status: bridgeStateName,
        // 失败原因由父页面直接显示在面板状态行（0.8.8 的 `data.message`）。
        ...(bridgeMessage ? { message: bridgeMessage } : {}),
        lighting: normalizeBaseLighting2(runtime.appCtx.baseLightingSettings),
        savedLighting: normalizeBaseLighting2(runtime.appCtx.studioProject.baseLighting),
        defaults: normalizeBaseLighting2(DEFAULT_BASE_LIGHTING2),
      },
      window.location.origin,
    )
}

export function postBridgeFloors(runtime: StudioAppRuntime) {
  !runtime.isAutoDiagramEmbed ||
    !runtime.autoDiagramComponentId ||
    window.parent === window ||
    !runtime.appCtx.studioProject ||
    window.parent.postMessage(
      {
        type: 'homeos-floorplan-auto-diagram-floor-state',
        componentId: runtime.autoDiagramComponentId,
        floors: runtime.appCtx.studioProject.floors.map((bridgeFloorEntry: any) => ({
          id: bridgeFloorEntry.id,
          name: bridgeFloorEntry.name,
        })),
        floorSelection:
          runtime.getPreviewFloorMode() === 'all'
            ? 'all'
            : runtime.getActiveFloor()?.id || runtime.appCtx.activeFloorId,
      },
      window.location.origin,
    )
}
