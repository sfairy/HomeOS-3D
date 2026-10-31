/* 户型图自动导图 iframe 的桥接消息（楼层/灯光/相机/生成）。
 * 从 `studio-app/boot.ts` 整块搬出：读 `appCtx`、相机与导出句柄，写 `appCtx.*` 与 DOM。 */
export function bindAutoDiagramMessages(deps: Record<string, any>): void {
  const {
    DEFAULT_BASE_LIGHTING2, appCtx, applyBaseLighting, applyCameraFocalLength, applyCameraState,
    autoDiagramComponentId, baseLightControlsElement, cameraSettings, clamp2, confirmLightingDialog,
    exportDialogElement, exportFolderNameInput, exportHeightInput, exportLockRatioInput, exportWidthInput,
    finite2, generateExportBundle, getActiveFloor, getCameraFocalLength, getCameraTopRotation,
    isAutoDiagramEmbed, openLightingDialog, postBridgeFloors, postBridgeState, refreshCanvasSizeUi,
    refreshSceneRender, saveBaseLightingEdit, selectPreviewFloor, setCameraMode, setCameraView
  } = deps;
window.addEventListener("message", (bridgeMessageEvent) => {
  if (
    !isAutoDiagramEmbed ||
    bridgeMessageEvent.origin !== window.location.origin ||
    bridgeMessageEvent.source !== window.parent
  )
    return;
  const data2 = bridgeMessageEvent.data;
  if (!(!data2 || data2.componentId !== autoDiagramComponentId)) {
    if (data2.type === "homeos-floorplan-auto-diagram-floor") {
      if (data2.command === "set-floor") {
        const bridgeFloorRecord = appCtx.studioProject.floors.find(
            (bridgeFloor: any) => bridgeFloor.id === data2.value,
          ),
          bridgeFloorId =
            data2.value === "all" && appCtx.studioProject.floors.length > 1
              ? "all"
              : bridgeFloorRecord?.id || getActiveFloor()?.id || appCtx.activeFloorId;
        (selectPreviewFloor(bridgeFloorId), postBridgeFloors());
      }
      return;
    }
    if (data2.type === "homeos-floorplan-auto-diagram-base-lighting") {
      data2.command === "request-state"
        ? ((baseLightControlsElement.hidden = true),
          applyBaseLighting(appCtx.studioProject.baseLighting),
          postBridgeState("ready"))
        : data2.command === "preview"
          ? ((baseLightControlsElement.hidden = true),
            applyBaseLighting(data2.lighting),
            postBridgeState("preview"))
          : data2.command === "reset"
            ? ((baseLightControlsElement.hidden = true),
              applyBaseLighting(DEFAULT_BASE_LIGHTING2),
              postBridgeState("preview"))
            : data2.command === "save"
              ? ((baseLightControlsElement.hidden = true),
                applyBaseLighting(data2.lighting),
                confirmLightingDialog(),
                postBridgeState("saved"))
              : data2.command === "cancel" || data2.command === "close"
                ? (openLightingDialog(), postBridgeState("cancelled"))
                : saveBaseLightingEdit();
      return;
    }
    if (data2.type === "homeos-floorplan-auto-diagram-camera") {
      const ut6 = cameraSettings();
      if (data2.command === "restore") {
        const bridgeCameraState = data2.value || {};
        ((ut6.cameraMode =
          bridgeCameraState.mode === "perspective" ? "perspective" : "orthographic"),
          (ut6.cameraView = bridgeCameraState.view === "top" ? "top" : "free"),
          (ut6.cameraTopRotation =
            (((Math.round(finite2(bridgeCameraState.topRotation, 0) / 90) * 90) % 360) + 360) %
            360),
          (ut6.cameraFocalLength = clamp2(finite2(bridgeCameraState.focalLength, 50), 18, 120)),
          bridgeCameraState.snapshot
            ? applyCameraState(
                bridgeCameraState.snapshot,
                bridgeCameraState.snapshot.viewportAspect,
              )
            : (setCameraMode(ut6.cameraMode, {
                preserveView: true,
              }),
              setCameraView(ut6.cameraView, {
                force: true,
              }),
              applyCameraFocalLength()));
      } else
        data2.command === "set-view"
          ? ((ut6.cameraView = data2.value === "top" ? "top" : "free"),
            setCameraView(ut6.cameraView))
          : data2.command === "set-mode"
            ? ((ut6.cameraMode = data2.value === "perspective" ? "perspective" : "orthographic"),
              setCameraMode(ut6.cameraMode))
            : data2.command === "rotate-top"
              ? ((ut6.cameraView = "top"),
                (ut6.cameraTopRotation = (getCameraTopRotation() + 90) % 360),
                setCameraView("top", {
                  force: true,
                }))
              : data2.command === "set-focal-length" &&
                ((ut6.cameraFocalLength = clamp2(
                  finite2(data2.value, getCameraFocalLength()),
                  18,
                  120,
                )),
                applyCameraFocalLength());
      refreshSceneRender();
      return;
    }
    if (data2.type === "homeos-floorplan-auto-diagram-generate" && !appCtx.isInteractionLocked) {
      for (const bridgeCameraStateExportFileCheckbox of exportDialogElement.querySelectorAll(
        "input[data-export-file]",
      ))
        bridgeCameraStateExportFileCheckbox.checked = true;
      ((exportFolderNameInput.value = String(data2.folderName || "").trim()),
        (exportWidthInput.value = String(
          Math.round(clamp2(finite2(data2.width, exportWidthInput.value), 320, 4096)),
        )),
        (exportHeightInput.value = String(
          Math.round(clamp2(finite2(data2.height, exportHeightInput.value), 320, 4096)),
        )),
        (exportLockRatioInput.checked = true),
        refreshCanvasSizeUi(),
        generateExportBundle());
    }
  }
});
}
