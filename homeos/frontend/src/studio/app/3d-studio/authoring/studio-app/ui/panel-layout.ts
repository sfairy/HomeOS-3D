import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { clamp as clamp2 } from '../../../plan/geometry'
import { finite as finite2 } from '../../../loaders/studio-normalization'

export function getPanelRatioLimits(runtime: StudioAppRuntime) {
  const detailsPanelRect = runtime.detailsPanelElement.getBoundingClientRect(),
    studioShellRect = runtime.studioShellElement.getBoundingClientRect(),
    panelMaxHeight = detailsPanelRect.height || Math.max(window.innerHeight - 90, 340),
    shellMaxWidth = studioShellRect.width || Math.max(window.innerWidth - 20, 860),
    resizerHeight = runtime.detailsResizerElement.parentElement?.getBoundingClientRect().height || 14,
    libraryPanelWidth = runtime.studioShellElement.querySelector('.library-panel')?.getBoundingClientRect().width || 168
  return {
    minimumHeightRatio: clamp2(320 / panelMaxHeight, 0.08, 0.5),
    maximumHeightRatio: clamp2((panelMaxHeight - resizerHeight - 170) / panelMaxHeight, 0.5, 0.94),
    minimumWidthRatio: clamp2(360 / shellMaxWidth, 0.08, 0.45),
    maximumWidthRatio: clamp2((shellMaxWidth - libraryPanelWidth - 20 - 320) / shellMaxWidth, 0.45, 0.86),
  }
}

export function applyPanelRatios(runtime: StudioAppRuntime) {
  const yl2 = runtime.getPanelRatioLimits(),
    previewPanelRatio = clamp2(
      finite2(runtime.appCtx.studioState.settings?.previewPanelRatio, 0.52),
      yl2.minimumHeightRatio,
      yl2.maximumHeightRatio,
    )
  ;(runtime.appCtx.studioState.settings.previewPanelRatio = previewPanelRatio),
    runtime.detailsPanelElement.style.setProperty('--preview-panel-height', (previewPanelRatio * 100).toFixed(2) + '%'),
    runtime.detailsResizerElement.setAttribute('aria-valuemin', String(Math.round(yl2.minimumHeightRatio * 100))),
    runtime.detailsResizerElement.setAttribute('aria-valuemax', String(Math.round(yl2.maximumHeightRatio * 100))),
    runtime.detailsResizerElement.setAttribute('aria-valuenow', String(Math.round(previewPanelRatio * 100)))
}

export function applyDetailsRatio(runtime: StudioAppRuntime) {
  const yl3 = runtime.getPanelRatioLimits(),
    detailsPanelWidthRatio = clamp2(
      finite2(runtime.appCtx.studioState.settings?.detailsPanelWidthRatio, 0.29),
      yl3.minimumWidthRatio,
      yl3.maximumWidthRatio,
    )
  ;(runtime.appCtx.studioState.settings.detailsPanelWidthRatio = detailsPanelWidthRatio),
    runtime.studioShellElement.style.setProperty(
      '--details-panel-width',
      (detailsPanelWidthRatio * 100).toFixed(2) + '%',
    )
}
