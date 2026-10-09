/** Camera inspector sync — extracted from home.ts */
import { clampNumber as clampNumber2, roundField as roundField2 } from "./editor-utils";
import { setInspectorToggle as setInspectorToggle2 } from "./editor-basic-inspectors";

export interface CameraInspectorContext { [key: string]: any }

export function syncCameraInspector(ctx: CameraInspectorContext, cameraComponent: any) {
  const cameraProperties = cameraComponent.properties || {},
    cameraPosition = cameraComponent.position || {},
    cameraCanvasWidthPx = Number(ctx.activeProject.document.canvas.width || 2778),
    cameraCanvasHeightPx = Number(ctx.activeProject.document.canvas.height || 1940),
    cameraWidthPx = Number(cameraPosition.width || 100),
    cameraHeightPx = Number(cameraPosition.height || 100);
  ((ctx.cameraLabelElement.value = cameraProperties.label || ""),
    ctx.runExtraFallback(cameraComponent),
    setInspectorToggle2(ctx.cameraMediaVisibleElement, cameraProperties.mediaVisible !== false));
  const displayMode = cameraProperties.displayMode === "snapshot" ? "snapshot" : "live";
  for (const displayModeButtonElement of ctx.cameraDisplayModeOptionsElement.querySelectorAll(
    "[data-camera-display-mode]",
  )) {
    const isDisplayModeActive = displayModeButtonElement.dataset.cameraDisplayMode === displayMode;
    (displayModeButtonElement.classList.toggle("active", isDisplayModeActive),
      displayModeButtonElement.setAttribute("aria-pressed", String(isDisplayModeActive)));
  }
  const refreshIntervalValue = Number(cameraProperties.refreshInterval),
    refreshIntervalSeconds = Number.isFinite(refreshIntervalValue)
      ? Math.max(6, Math.round(refreshIntervalValue))
      : 10;
  ((ctx.cameraRefreshIntervalElement.value = String(refreshIntervalSeconds)),
    (ctx.cameraRefreshIntervalFieldElement.hidden = displayMode !== "snapshot"),
    (ctx.cameraRefreshIntervalElement.disabled = displayMode !== "snapshot"));
  const fitMode = cameraProperties.fit === "contain" ? "contain" : "fill";
  for (const fitModeButtonElement of ctx.cameraFitOptionsElement.querySelectorAll(
    "[data-camera-fit]",
  )) {
    const isFitModeActive = fitModeButtonElement.dataset.cameraFit === fitMode;
    (fitModeButtonElement.classList.toggle("active", isFitModeActive),
      fitModeButtonElement.setAttribute("aria-pressed", String(isFitModeActive)));
  }
  (setInspectorToggle2(ctx.cameraFrameVisibleElement, cameraProperties.frameVisible !== false),
    (ctx.cameraFrameColorElement.value = cameraProperties.frameColor || "#d4d4d4"),
    (ctx.cameraFrameWidthElement.value = roundField2(Number(cameraProperties.frameWidth ?? 1))));
  const cornerRadiusValue = Number(cameraProperties.radius ?? 0.04);
  ((ctx.cameraRadiusElement.value = roundField2(
    clampNumber2(cornerRadiusValue > 0.5 ? cornerRadiusValue : cornerRadiusValue * 100, 0, 50),
  )),
    (ctx.cameraFrameAngleElement.value = roundField2(Number(cameraProperties.frameAngle ?? 45))),
    (ctx.cameraFrameOpacityElement.value = roundField2(
      Number(cameraProperties.frameOpacity ?? 0.9) * 100,
    )),
    (ctx.cameraLeftElement.value = roundField2(
      clampNumber2(
        ((Number(cameraPosition.x || 0) + cameraWidthPx / 2) / cameraCanvasWidthPx) * 100,
        0,
        100,
      ),
    )),
    (ctx.cameraTopElement.value = roundField2(
      clampNumber2(
        ((Number(cameraPosition.y || 0) + cameraHeightPx / 2) / cameraCanvasHeightPx) * 100,
        0,
        100,
      ),
    )),
    (ctx.cameraWidthElement.value = roundField2((cameraWidthPx / cameraCanvasWidthPx) * 100)),
    (ctx.cameraHeightElement.value = roundField2((cameraHeightPx / cameraCanvasHeightPx) * 100)),
    (ctx.cameraScaleElement.value = roundField2(Number(cameraComponent.style?.scale || 1) * 100)),
    (ctx.cameraRotationElement.value = roundField2(Number(cameraPosition.rotation || 0))));
  const isCameraMultiSelection = ctx.selectedComponentIdsSet.size > 1;
  ((ctx.cameraWidthElement.disabled = isCameraMultiSelection),
    (ctx.cameraHeightElement.disabled = isCameraMultiSelection),
    (ctx.cameraRotationElement.disabled = false),
    (ctx.cameraScaleElement.disabled = false));
  const cameraReplaceableCount = ctx.findReplaceableComponents(cameraComponent).length,
    cameraApplyTargetCount = ctx.runAuxLower(cameraComponent).length;
  ((ctx.cameraApplyStyleElement.disabled = !cameraReplaceableCount || !cameraApplyTargetCount),
    (ctx.cameraApplyCountElement.textContent = cameraApplyTargetCount + " 项修改"),
    (ctx.cameraApplyStyleElement.textContent = "一键应用到同类型控件"));
  const componentWithTapAction = Object.prototype.hasOwnProperty.call(
    cameraComponent.actions || {},
    "tap",
  )
    ? cameraComponent
    : {
        ...cameraComponent,
        actions: {
          tap: {
            type: "more-info",
            data: {
              popupSource: "current",
            },
          },
          ...(cameraComponent.actions || {}),
        },
      };
  ctx.syncComponentActionControls(componentWithTapAction, ctx.cameraActionControlsElement);
}
