/* 户型图自动导图的 iframe 回传消息分发（ready / floor-state / stopped / error / export）。
 *
 * 从 `home/lifecycle/boot.ts` 整块搬出：661 行 iframe postMessage 处理，只读 DOM 句柄、
 * `editorCtx` 与几个纯函数，不与引导期其余状态共享可变绑定（写入都落在对象/Map 上）。
 * 依赖以单个 deps 袋注入，避免把半个闭包导出成公共类型。
 */

export function bindFloorplanAutoDiagramMessages(deps: Record<string, any>): void {
  // 依赖名见 boot.ts 的调用点；此处解构一次，正文保持与搬出前逐字一致。
  const {
    AUTO_DIAGRAM_LAYOUT_VERSION,
    applyCollectionLayerOrder2,
    clampNumber2,
    clone2,
    coverMotorButtonElement,
    createComponentFromTemplate2,
    editorCtx,
    findComponent2,
    findComponentLocation2,
    floorplanAutoDiagramFloorSelectElement,
    floorplanAutoDiagramFolderTextInputElement,
    floorplanAutoDiagramOpenStudioButtonElement,
    floorplanAutoDiagramStateByComponentId,
    floorplanAutoDiagramStatusElement,
    floorplanAutoLightingPanelElement,
    floorplanAutoLightingStatusElement,
    handleOperationError,
    lightingPayload,
    mutateDocument,
    newId2,
    normalizeBaseLighting2,
    onWindowMessage,
    openLightingPanel,
    pageSelectElement,
    removeComponent,
    renderComponentLists,
    syncSharedComponentReferenceOrder2,
  } = deps;
window.addEventListener("message", (lightingStateFrameState) => {
  if (lightingStateFrameState.origin !== window.location.origin) return;
  const data = lightingStateFrameState.data;
  if (data?.type === "homeos-floorplan-auto-diagram-base-lighting-state") {
    const lightingStateFrame = String(data.componentId || ""),
      gm4 = lightingPayload(lightingStateFrame);
    if (
      !gm4 ||
      lightingStateFrameState.source !== gm4.contentWindow ||
      lightingStateFrame !== editorCtx.baseLightingComponentId
    )
      return;
    ((data.status === "ready" || data.status === "saved") &&
      ((editorCtx.baseLightingSettings = normalizeBaseLighting2(data.savedLighting || data.lighting)),
      openLightingPanel(data.lighting || editorCtx.baseLightingSettings)),
      floorplanAutoLightingPanelElement.setAttribute("aria-busy", "false"),
      data.status === "saved"
        ? (floorplanAutoLightingStatusElement.textContent =
            "已保存，并同步到实时预览、手动导图和自动导图。")
        : data.status === "ready" &&
          (floorplanAutoLightingStatusElement.textContent = "修改会实时同步到当前3D预览。"));
    return;
  }
  if (data?.type === "homeos-floorplan-auto-diagram-ready") {
    const readyComponentId = String(data.componentId || ""),
      readyFrame = document.querySelector<HTMLIFrameElement>(
        '.hb-component[data-component-id="' +
          CSS.escape(readyComponentId) +
          '"] .hb-floorplan-auto-diagram-preview',
      );
    if (!readyFrame || lightingStateFrameState.source !== readyFrame.contentWindow) return;
    (readyFrame.classList.add("is-ready"),
      readyFrame.parentElement?.querySelector(".hb-floorplan-auto-diagram-loading")?.remove());
    const readyComponent = findComponent2(editorCtx.activeProject?.document, readyComponentId)?.component;
    if (readyComponent?.type === "floorplan-auto-diagram") {
      const reportedFloors = (Array.isArray(data.floors) ? data.floors : [])
          .map((floorEntry: any) => ({
            id: String(floorEntry?.id || ""),
            name: String(floorEntry?.name || ""),
          }))
          .filter((validFloor: any) => validFloor.id),
        reportedFloorSelection = String(data.floorSelection || "");
      floorplanAutoDiagramStateByComponentId.set(readyComponentId, {
        floors: reportedFloors,
        selected: reportedFloorSelection,
      });
      const readyProperties = readyComponent.properties || {};
      (Object.prototype.hasOwnProperty.call(readyProperties, "floorSelection") &&
        reportedFloorSelection &&
        readyProperties.floorSelection !== reportedFloorSelection &&
        mutateDocument((floorSyncDraftDocument: any) => {
          const floorSyncComponent = findComponent2(
            floorSyncDraftDocument,
            readyComponentId,
          )?.component;
          floorSyncComponent?.type === "floorplan-auto-diagram" &&
            (floorSyncComponent.properties = {
              ...(floorSyncComponent.properties || {}),
              floorSelection: reportedFloorSelection,
            });
        }),
        coverMotorButtonElement(),
        readyFrame.contentWindow!.postMessage(
          {
            type: "homeos-floorplan-auto-diagram-camera",
            componentId: readyComponentId,
            command: "restore",
            value: {
              view: readyComponent.properties?.cameraView || "free",
              mode: readyComponent.properties?.cameraMode || "orthographic",
              topRotation: Number(readyComponent.properties?.cameraTopRotation || 0),
              focalLength: Number(readyComponent.properties?.cameraFocalLength || 50),
            },
          },
          window.location.origin,
        ));
    }
    return;
  }
  if (data?.type === "homeos-floorplan-auto-diagram-floor-state") {
    const floorStateComponentId = String(data.componentId || ""),
      floorStateFrame = document.querySelector<HTMLIFrameElement>(
        '.hb-component[data-component-id="' +
          CSS.escape(floorStateComponentId) +
          '"] .hb-floorplan-auto-diagram-preview',
      );
    if (!floorStateFrame || lightingStateFrameState.source !== floorStateFrame.contentWindow)
      return;
    const floorStateFloors = (Array.isArray(data.floors) ? data.floors : [])
        .map((floorStateEntry: any) => ({
          id: String(floorStateEntry?.id || ""),
          name: String(floorStateEntry?.name || ""),
        }))
        .filter((validFloorState: any) => validFloorState.id),
      floorStateSelection = String(data.floorSelection || "");
    floorplanAutoDiagramStateByComponentId.set(floorStateComponentId, {
      floors: floorStateFloors,
      selected: floorStateSelection,
    });
    const floorStateComponent = findComponent2(
      editorCtx.activeProject?.document,
      floorStateComponentId,
    )?.component;
    (floorStateComponent?.type === "floorplan-auto-diagram" &&
      floorStateSelection &&
      floorStateComponent.properties?.floorSelection !== floorStateSelection &&
      mutateDocument((floorStateDraftDocument: any) => {
        const floorStateComponentInDraft = findComponent2(
          floorStateDraftDocument,
          floorStateComponentId,
        )?.component;
        floorStateComponentInDraft?.type === "floorplan-auto-diagram" &&
          (floorStateComponentInDraft.properties = {
            ...(floorStateComponentInDraft.properties || {}),
            floorSelection: floorStateSelection,
          });
      }),
      floorStateComponentId === editorCtx.selectedComponentId && coverMotorButtonElement());
    return;
  }
  if (data?.type === "homeos-floorplan-auto-diagram-stopped") {
    const stoppedComponentId = String(data.componentId || ""),
      stoppedFrame = document.querySelector<HTMLIFrameElement>(
        '.hb-component[data-component-id="' +
          CSS.escape(stoppedComponentId) +
          '"] .hb-floorplan-auto-diagram-preview',
      );
    if (!stoppedFrame || lightingStateFrameState.source !== stoppedFrame.contentWindow) return;
    ((floorplanAutoDiagramOpenStudioButtonElement.disabled = false),
      stoppedComponentId === editorCtx.selectedComponentId &&
        (floorplanAutoDiagramFloorSelectElement.disabled = false),
      (floorplanAutoDiagramOpenStudioButtonElement.textContent = "确定位置大小并后台生成"),
      (floorplanAutoDiagramStatusElement.textContent = data.message || "已停止本次生成。"),
      data.reason === "rename" && floorplanAutoDiagramFolderTextInputElement.focus());
    return;
  }
  if (data?.type === "homeos-floorplan-auto-diagram-error") {
    const errorComponentId = String(data.componentId || ""),
      errorFrame = document.querySelector<HTMLIFrameElement>(
        '.hb-component[data-component-id="' +
          CSS.escape(errorComponentId) +
          '"] .hb-floorplan-auto-diagram-preview',
      );
    if (!errorFrame || lightingStateFrameState.source !== errorFrame.contentWindow) return;
    ((floorplanAutoDiagramOpenStudioButtonElement.disabled = false),
      errorComponentId === editorCtx.selectedComponentId &&
        (floorplanAutoDiagramFloorSelectElement.disabled = false),
      (floorplanAutoDiagramOpenStudioButtonElement.textContent = "确定位置大小并后台生成"),
      (floorplanAutoDiagramStatusElement.textContent = data.message || "后台生成失败，请重试。"));
    return;
  }
  if (!data || data.type !== "homeos-floorplan-auto-diagram-export") return;
  const exportComponentId = String(data.componentId || ""),
    exportFrame = document.querySelector<HTMLIFrameElement>(
      '.hb-component[data-component-id="' +
        CSS.escape(exportComponentId) +
        '"] .hb-floorplan-auto-diagram-preview',
    );
  if (!exportFrame || lightingStateFrameState.source !== exportFrame.contentWindow) return;
  const manifest = data.manifest,
    exportFolderId = String(data.folderName || manifest?.exportName || "").trim(),
    exportComponentElementState = data.saved || {
      relativePath: "exports/" + exportFolderId,
      overwritten: false,
    };
  if (!exportComponentId || !manifest || !exportFolderId) return;
  ((floorplanAutoDiagramOpenStudioButtonElement.disabled = false),
    (floorplanAutoDiagramOpenStudioButtonElement.textContent = "确定位置大小并后台生成"),
    (floorplanAutoDiagramStatusElement.textContent = "已生成，正在置换到仪表盘…"));
  const exportComponentElement = exportFrame.closest<HTMLElement>(".hb-component");
  (exportComponentElement && (exportComponentElement.hidden = true),
    mutateDocument(
      (exportDraftDocument: any) => {
        let componentLocation = findComponentLocation2(exportDraftDocument, exportComponentId);
        const diagramPage = componentLocation?.component;
        if (!diagramPage || diagramPage.type !== "floorplan-auto-diagram") return null;
        const scope2 = componentLocation.scope,
          root = scope2 === "shared" && componentLocation.root,
          sharedComponents2 =
            scope2 === "shared"
              ? exportDraftDocument.sharedComponents
              : componentLocation.page?.components || componentLocation.collection,
          autoDiagramComponents: any = [],
          collectAutoDiagramComponents = (componentBranch: any) => {
            for (const branchComponent of componentBranch || [])
              (branchComponent?.properties?.autoDiagramFolder === exportFolderId &&
                autoDiagramComponents.push(branchComponent),
                collectAutoDiagramComponents(branchComponent?.children));
          };
        collectAutoDiagramComponents(sharedComponents2);
        const baseImagesByRole = new Map<string, any>(
            autoDiagramComponents
              .filter((imageCandidate: any) => imageCandidate.type === "image")
              .map((imageComponentEntry: any) => [
                imageComponentEntry.properties?.autoDiagramRole === "base"
                  ? "background-with-plan"
                  : String(imageComponentEntry.properties?.autoDiagramRole || ""),
                imageComponentEntry,
              ]),
          ),
          lightEffectsByKey = new Map<string, any>(
            autoDiagramComponents
              .filter((effectCandidate: any) => effectCandidate.type === "icon-button-effect")
              .map((lightEffectComponent: any) => {
                const effectRoleKey = String(
                    lightEffectComponent.properties?.autoDiagramRole || "light-group",
                  ),
                  effectLayerId = String(
                    lightEffectComponent.properties?.autoDiagramLayerId ||
                      lightEffectComponent.properties?.autoDiagramGroupId ||
                      "",
                  );
                return [effectRoleKey + ":" + effectLayerId, lightEffectComponent];
              }),
          );
        for (const staleComponent of autoDiagramComponents)
          removeComponent(exportDraftDocument, staleComponent.id);
        if (
          ((componentLocation = findComponentLocation2(exportDraftDocument, exportComponentId)),
          !componentLocation)
        )
          return null;
        const documentWidthPx = Number(exportDraftDocument.canvas?.width || 2778),
          documentHeightPx = Number(exportDraftDocument.canvas?.height || 1940),
          resolutionWidth = Math.max(
            1,
            Number(manifest.resolution?.width || diagramPage.position?.width || 1),
          ),
          resolutionHeight = Math.max(
            1,
            Number(manifest.resolution?.height || diagramPage.position?.height || 1),
          ),
          sourceLayoutMode = diagramPage.properties?.layoutMode === "fill" ? "fill" : "free",
          diagramPositionValue = diagramPage.position || {},
          diagramScale =
            sourceLayoutMode === "fill"
              ? 1
              : Math.max(0.01, Math.min(5, Number(diagramPage.style?.scale || 1))),
          sourceWidth =
            sourceLayoutMode === "fill"
              ? documentWidthPx
              : Number(diagramPositionValue.width || 100),
          sourceHeight =
            sourceLayoutMode === "fill"
              ? documentHeightPx
              : Number(diagramPositionValue.height || 100),
          scaledWidth = sourceWidth * diagramScale,
          scaledHeight = sourceHeight * diagramScale,
          diagramX =
            sourceLayoutMode === "fill"
              ? 0
              : Number(diagramPositionValue.x || 0) - (scaledWidth - sourceWidth) / 2,
          diagramY =
            sourceLayoutMode === "fill"
              ? 0
              : Number(diagramPositionValue.y || 0) - (scaledHeight - sourceHeight) / 2,
          diagramRotation =
            sourceLayoutMode === "fill" ? 0 : Number(diagramPositionValue.rotation || 0),
          imageLayerComponents = [
            {
              role: "background",
              file: manifest.backgroundImage,
              label: "00底图",
              visible: true,
            },
            {
              role: "floor-plan",
              file: manifest.floorPlanImage,
              label: "00户型图",
              visible: true,
            },
            {
              role: "background-with-plan",
              file: manifest.baseImage,
              label: "00底图带户型",
              visible: false,
            },
          ]
            .filter((imageSpec) => imageSpec.file)
            .map((layerSpec) => {
              const existingLayerComponent = baseImagesByRole.get(layerSpec.role),
                layerComponent = existingLayerComponent
                  ? clone2(existingLayerComponent)
                  : createComponentFromTemplate2("image", {
                      id: newId2("component"),
                      instanceName: layerSpec.label,
                      canvas: exportDraftDocument.canvas,
                    });
              return (
                (layerComponent.position = {
                  ...(layerComponent.position || {}),
                  x: diagramX,
                  y: diagramY,
                  width: scaledWidth,
                  height: scaledHeight,
                  rotation: diagramRotation,
                }),
                (layerComponent.style = {
                  ...(layerComponent.style || {}),
                  scale: 1,
                  visible: existingLayerComponent
                    ? existingLayerComponent.style?.visible !== false
                    : layerSpec.visible,
                }),
                (layerComponent.bindings = {}),
                (layerComponent.actions = {}),
                (layerComponent.properties = {
                  ...(layerComponent.properties || {}),
                  instanceName: layerSpec.label,
                  label: layerSpec.label,
                  assetId: "studio3d:" + exportFolderId + "/" + layerSpec.file,
                  naturalWidth: resolutionWidth,
                  naturalHeight: resolutionHeight,
                  opacity: 1,
                  fit: "contain",
                  layoutMode: sourceLayoutMode,
                  autoDiagramFolder: exportFolderId,
                  autoDiagramRole: layerSpec.role,
                  autoDiagramCamera: manifest.camera || null,
                }),
                layerComponent
              );
            }),
          backgroundLayer = imageLayerComponents.find(
            (backgroundCandidate) =>
              backgroundCandidate.properties?.autoDiagramRole === "background",
          ),
          floorPlanLayer = imageLayerComponents.find(
            (floorPlanCandidate) => floorPlanCandidate.properties?.autoDiagramRole === "floor-plan",
          ),
          baseWithPlanLayer = imageLayerComponents.find(
            (baseWithPlanCandidate) =>
              baseWithPlanCandidate.properties?.autoDiagramRole === "background-with-plan",
          ),
          preferredBaseLayer = baseWithPlanLayer || floorPlanLayer || backgroundLayer,
          lightGroupSpecs = (Array.isArray(manifest.groups) ? manifest.groups : [])
            .filter(
              (groupEntry: any) =>
                String(groupEntry?.id || groupEntry?.groupId || "") && groupEntry?.file,
            )
            .map((groupSpec: any) => ({
              role: "light-group",
              id: String(groupSpec.id || groupSpec.groupId || ""),
              name: String(groupSpec.name || groupSpec.note || "灯组"),
              note: String(groupSpec.note || groupSpec.name || "灯组"),
              file: groupSpec.file,
              icon: "mdi:lightbulb-outline",
              anchor: groupSpec.anchor,
            })),
          screenSpecs = (Array.isArray(manifest.screens) ? manifest.screens : [])
            .filter(
              (screenEntry: any) =>
                String(screenEntry?.id || screenEntry?.itemId || "") && screenEntry?.file,
            )
            .map((screenSpec: any) => ({
              role: "television",
              id: String(screenSpec.id || screenSpec.itemId || ""),
              name: String(screenSpec.name || "电视画面"),
              note: String(screenSpec.name || "电视画面"),
              file: screenSpec.file,
              icon: "mdi:television",
              anchor: screenSpec.anchor,
            })),
          vehicleSpecs = (Array.isArray(manifest.vehicles) ? manifest.vehicles : [])
            .filter(
              (vehicleEntry: any) =>
                String(vehicleEntry?.id || vehicleEntry?.itemId || "") && vehicleEntry?.file,
            )
            .map((vehicleSpec: any) => ({
              role: "vehicle",
              id: String(vehicleSpec.id || vehicleSpec.itemId || ""),
              name: String(vehicleSpec.name || "汽车充电"),
              note: String(vehicleSpec.name || "汽车充电"),
              file: vehicleSpec.file,
              icon: "mdi:car-electric",
              anchor: vehicleSpec.anchor,
            })),
          overlaySpecs = [...screenSpecs, ...vehicleSpecs, ...lightGroupSpecs],
          diagramCenterX = diagramX + scaledWidth / 2,
          diagramCenterY = diagramY + scaledHeight / 2,
          diagramRotationRad = (diagramRotation * Math.PI) / 180,
          overlayScale = Math.min(scaledWidth / resolutionWidth, scaledHeight / resolutionHeight),
          overlaySourceWidth = resolutionWidth * overlayScale,
          overlaySourceHeight = resolutionHeight * overlayScale,
          placedOverlayAnchors: any = [],
          placeOverlayAnchor = (overlaySpecItem: any, overlayIndex: any, overlayWidthPx: any, overlayHeightPx: any) => {
            const anchorX = Number(overlaySpecItem.anchor?.x),
              anchorY = Number(overlaySpecItem.anchor?.y),
              defaultState = {
                x: overlaySpecs.length > 1 ? (overlayIndex + 1) / (overlaySpecs.length + 1) : 0.5,
                y: 0.9,
              },
              preferredAnchor =
                Number.isFinite(anchorX) && Number.isFinite(anchorY)
                  ? {
                      x: anchorX,
                      y: anchorY,
                    }
                  : defaultState,
              anchorSpacingX = Math.max(
                0.035,
                (overlayWidthPx / Math.max(overlaySourceWidth, 1)) * 1.08,
              ),
              anchorSpacingY = Math.max(
                0.045,
                (overlayHeightPx / Math.max(overlaySourceHeight, 1)) * 1.08,
              ),
              anchorCandidates = [[0, 0]];
            for (let ringIndex = 1; ringIndex <= 4; ringIndex += 1)
              anchorCandidates.push(
                [0, -anchorSpacingY * ringIndex],
                [anchorSpacingX * ringIndex, 0],
                [0, anchorSpacingY * ringIndex],
                [-anchorSpacingX * ringIndex, 0],
                [anchorSpacingX * ringIndex, -anchorSpacingY * ringIndex],
                [anchorSpacingX * ringIndex, anchorSpacingY * ringIndex],
                [-anchorSpacingX * ringIndex, anchorSpacingY * ringIndex],
                [-anchorSpacingX * ringIndex, -anchorSpacingY * ringIndex],
              );
            let chosenAnchor: any = null;
            for (const [offsetX, offsetY] of anchorCandidates) {
              const candidateState = {
                x: clampNumber2(
                  preferredAnchor.x + offsetX,
                  anchorSpacingX / 2,
                  1 - anchorSpacingX / 2,
                ),
                y: clampNumber2(
                  preferredAnchor.y + offsetY,
                  anchorSpacingY / 2,
                  1 - anchorSpacingY / 2,
                ),
              };
              if (
                !placedOverlayAnchors.some(
                  (placedAnchor: any) =>
                    Math.abs(candidateState.x - placedAnchor.x) <
                      (anchorSpacingX + placedAnchor.spacingX) / 2 &&
                    Math.abs(candidateState.y - placedAnchor.y) <
                      (anchorSpacingY + placedAnchor.spacingY) / 2,
                )
              ) {
                chosenAnchor = candidateState;
                break;
              }
            }
            return (
              (chosenAnchor ||= {
                x: clampNumber2(defaultState.x, anchorSpacingX / 2, 1 - anchorSpacingX / 2),
                y: clampNumber2(defaultState.y, anchorSpacingY / 2, 1 - anchorSpacingY / 2),
              }),
              placedOverlayAnchors.push({
                ...chosenAnchor,
                spacingX: anchorSpacingX,
                spacingY: anchorSpacingY,
              }),
              chosenAnchor
            );
          },
          placedEffectComponents = overlaySpecs.map((overlaySpec, overlaySpecIndex) => {
            const existingEffectComponent = lightEffectsByKey.get(
                overlaySpec.role + ":" + overlaySpec.id,
              ),
              effectComponentToPlace = existingEffectComponent
                ? clone2(existingEffectComponent)
                : createComponentFromTemplate2("icon-button-effect", {
                    id: newId2("component"),
                    instanceName: overlaySpec.name,
                    canvas: exportDraftDocument.canvas,
                  }),
              savedSceneAnchor = existingEffectComponent?.properties?.autoDiagramSceneAnchor,
              sceneAnchorChanged =
                !savedSceneAnchor ||
                Math.abs(Number(savedSceneAnchor.x) - Number(overlaySpec.anchor?.x)) > 0.002 ||
                Math.abs(Number(savedSceneAnchor.y) - Number(overlaySpec.anchor?.y)) > 0.002,
              layoutVersionStale =
                !!existingEffectComponent &&
                Number(existingEffectComponent.properties?.autoDiagramLayoutVersion || 0) <
                  AUTO_DIAGRAM_LAYOUT_VERSION,
              needsLayoutRefresh =
                !existingEffectComponent ||
                layoutVersionStale ||
                (overlaySpec.role === "light-group" && sceneAnchorChanged);
            let buttonAnchor = existingEffectComponent?.properties?.autoDiagramButtonAnchor || null;
            if (needsLayoutRefresh) {
              const placedEffectWidth = Number(
                  effectComponentToPlace.position?.width || documentWidthPx * 0.075,
                ),
                placedEffectHeight = Number(
                  effectComponentToPlace.position?.height || placedEffectWidth,
                ),
                effectScale = Math.max(
                  0.01,
                  Math.min(5, Number(effectComponentToPlace.style?.scale || 1)),
                );
              buttonAnchor = placeOverlayAnchor(
                overlaySpec,
                overlaySpecIndex,
                placedEffectWidth * effectScale,
                placedEffectHeight * effectScale,
              );
              const sourceAnchorX = -overlaySourceWidth / 2 + buttonAnchor.x * overlaySourceWidth,
                sourceAnchorY = -overlaySourceHeight / 2 + buttonAnchor.y * overlaySourceHeight,
                rotatedAnchorX =
                  sourceAnchorX * Math.cos(diagramRotationRad) -
                  sourceAnchorY * Math.sin(diagramRotationRad),
                rotatedAnchorY =
                  sourceAnchorX * Math.sin(diagramRotationRad) +
                  sourceAnchorY * Math.cos(diagramRotationRad);
              effectComponentToPlace.position = {
                ...(effectComponentToPlace.position || {}),
                x: diagramCenterX + rotatedAnchorX - placedEffectWidth / 2,
                y: diagramCenterY + rotatedAnchorY - placedEffectHeight / 2,
                rotation: diagramRotation,
              };
            } else {
              if (
                Number.isFinite(Number(buttonAnchor?.x)) &&
                Number.isFinite(Number(buttonAnchor?.y))
              ) {
                const existingEffectWidth = Number(
                    effectComponentToPlace.position?.width || documentWidthPx * 0.075,
                  ),
                  existingEffectHeight = Number(
                    effectComponentToPlace.position?.height || existingEffectWidth,
                  ),
                  existingEffectScale = Math.max(
                    0.01,
                    Math.min(5, Number(effectComponentToPlace.style?.scale || 1)),
                  );
                placedOverlayAnchors.push({
                  x: Number(buttonAnchor.x),
                  y: Number(buttonAnchor.y),
                  spacingX: Math.max(
                    0.035,
                    ((existingEffectWidth * existingEffectScale) /
                      Math.max(overlaySourceWidth, 1)) *
                      1.08,
                  ),
                  spacingY: Math.max(
                    0.045,
                    ((existingEffectHeight * existingEffectScale) /
                      Math.max(overlaySourceHeight, 1)) *
                      1.08,
                  ),
                });
              }
            }
            if (
              ((effectComponentToPlace.style = {
                ...(effectComponentToPlace.style || {}),
                visible: true,
              }),
              (effectComponentToPlace.bindings = {
                ...(effectComponentToPlace.bindings || {}),
              }),
              !existingEffectComponent && overlaySpec.role === "light-group")
            ) {
              const lightGroupBinding = diagramPage.bindings?.["lightGroup:" + overlaySpec.id];
              lightGroupBinding?.entityId &&
                (effectComponentToPlace.bindings.entity = {
                  entityId: lightGroupBinding.entityId,
                });
            }
            return (
              (effectComponentToPlace.actions = Object.keys(effectComponentToPlace.actions || {})
                .length
                ? {
                    ...(effectComponentToPlace.actions || {}),
                  }
                : {
                    tap: {
                      type: "toggle",
                    },
                  }),
              (effectComponentToPlace.properties = {
                ...(effectComponentToPlace.properties || {}),
                instanceName: overlaySpec.name,
                label: overlaySpec.name,
                note: overlaySpec.note,
                icon: existingEffectComponent?.properties?.icon || overlaySpec.icon,
                effectAssetId: "studio3d:" + exportFolderId + "/" + overlaySpec.file,
                effectNaturalWidth: resolutionWidth,
                effectNaturalHeight: resolutionHeight,
                effectReferenceImageId: preferredBaseLayer?.id || "",
                effectLayoutMode: sourceLayoutMode,
                effectLeft: (diagramCenterX / documentWidthPx) * 100,
                effectTop: (diagramCenterY / documentHeightPx) * 100,
                effectScale: 1,
                effectRotation: diagramRotation,
                autoDiagramFolder: exportFolderId,
                autoDiagramRole: overlaySpec.role,
                autoDiagramLayerId: overlaySpec.id,
                autoDiagramSceneAnchor: overlaySpec.anchor || null,
                autoDiagramButtonAnchor: buttonAnchor,
                autoDiagramLayoutVersion: AUTO_DIAGRAM_LAYOUT_VERSION,
                ...(overlaySpec.role === "light-group"
                  ? {
                      autoDiagramGroupId: overlaySpec.id,
                    }
                  : {}),
              }),
              effectComponentToPlace
            );
          }),
          filteredItemsRef = [floorPlanLayer, backgroundLayer, baseWithPlanLayer].filter(Boolean),
          baseLayerComponents = [...placedEffectComponents, ...filteredItemsRef],
          removedComponentIndex = componentLocation.index;
        if (
          (componentLocation.collection.splice(removedComponentIndex, 1, ...baseLayerComponents),
          applyCollectionLayerOrder2(componentLocation.collection),
          root)
        ) {
          const mappedItemsTarget = baseLayerComponents.map(
            (mappedItemsSource) => mappedItemsSource.id,
          );
          for (const spliceResult of exportDraftDocument.pages || []) {
            const selectedPlacedId = spliceResult.sharedComponentIds || [],
              indexOf6 = selectedPlacedId.indexOf(exportComponentId);
            indexOf6 < 0 ||
              (selectedPlacedId.splice(indexOf6, 1, ...mappedItemsTarget),
              (spliceResult.sharedComponentIds = [...new Set(selectedPlacedId)]));
          }
          syncSharedComponentReferenceOrder2(exportDraftDocument);
        }
        return {
          removed: true,
          selectedId:
            (backgroundLayer || floorPlanLayer || baseWithPlanLayer || placedEffectComponents[0])
              ?.id || null,
          buttonCount: placedEffectComponents.length,
          imageCount: filteredItemsRef.length,
        };
      },
      pageSelectElement.value,
      {
        throwOnError: true,
      },
    )
      .then((selectedPlacedIdState: any) => {
        if (!selectedPlacedIdState?.removed) {
          (exportComponentElement?.isConnected && (exportComponentElement.hidden = false),
            (floorplanAutoDiagramStatusElement.textContent =
              "图片已生成，但控件置换失败，请重试。"));
          return;
        }
        const selectedId = selectedPlacedIdState.selectedId;
        ((editorCtx.selectedComponentId = selectedId),
          (editorCtx.selectedComponentIdsSet = selectedId ? new Set([selectedId]) : new Set()),
          (editorCtx.selectionAnchorComponentId = selectedId),
          editorCtx.editorRenderer?.setSelectedComponents(selectedId ? [selectedId] : [], selectedId),
          renderComponentLists(),
          coverMotorButtonElement(),
          onWindowMessage(exportComponentElementState, selectedPlacedIdState));
      })
      .catch((caughtErrorEntry: any) => {
        (exportComponentElement?.isConnected && (exportComponentElement.hidden = false),
          (floorplanAutoDiagramStatusElement.textContent = "图片已生成，但控件置换失败，请重试。"),
          handleOperationError(caughtErrorEntry));
      }));
});
}
