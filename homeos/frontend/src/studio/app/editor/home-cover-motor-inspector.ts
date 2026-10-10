/** Inspector router + cover motor helpers. */
import {
  renderFlowLineInspector as renderFlowLineInspector2,
} from "./inspectors/flow-line-inspector";
import {
  normalizeFlowLine as normalizeFlowLine2,
  FLOW_LINE_FIELDS as FLOW_LINE_FIELDS2,
} from "../shared/flow-line-model";
import { renderInteraction3dInspector as renderInteraction3dInspector2 } from "../bridge/editor";
import { findComponent as findComponent2 } from "./component-tree";
import { componentLabel as componentLabel2 } from "./editor-component-collections";
import {
  clampNumber as clampNumber2,
  roundField as roundField2,
} from "./editor-utils";
import { setInspectorToggle as setInspectorToggle2, iconButtonEffectInspectorLayer as iconButtonEffectInspectorLayer2 } from "./editor-basic-inspectors";
import { renderPercentageBarInspector as renderPercentageBarInspector2 } from "./inspectors/percentage-bar-inspector";

export interface CoverMotorInspectorContext {
  [key: string]: any;
}

const coverMotorDirectionValueById = new Map<any, any>();
export function clearCoverMotorDirectionValueById() {
  coverMotorDirectionValueById.clear();
}

function syncCoverSettingsInspector(ctx: CoverMotorInspectorContext, coverComponent: any) {
  const visibleInspectorSection = [
    ctx.imageInspectorElement,
    ctx.iconButtonEffectInspectorElement,
    ctx.titleButtonInspectorElement,
    ctx.iconButtonInspectorElement,
    ctx.vacuumMapInspectorElement,
    ctx.cameraInspectorElement,
    ctx.airConditionerInspectorElement,
    ctx.timeInspectorElement,
    ctx.dateInspectorElement,
    ctx.weatherInspectorElement,
    ctx.lineChartInspectorElement,
    ctx.panelFrameInspectorFormElement,
    ctx.navigationInspectorFormElement,
  ]
    .find((inspectorForm) => inspectorForm && !inspectorForm.hidden)
    ?.querySelector(":scope > .inspector-section");
  visibleInspectorSection &&
    visibleInspectorSection.nextElementSibling !== ctx.coverSettingsInspectorElement &&
    visibleInspectorSection.insertAdjacentElement("afterend", ctx.coverSettingsInspectorElement);
  const coverKindValue = coverComponent.properties || {},
    coverKind = ["standard", "dream", "airer"].includes(coverKindValue.coverKind)
      ? coverKindValue.coverKind
      : "auto";
  for (const coverKindButtonElement of ctx.coverSettingsKindElement.querySelectorAll(
    "[data-cover-kind]",
  )) {
    const isCoverKindActive = coverKindButtonElement.dataset.coverKind === coverKind;
    (coverKindButtonElement.classList.toggle("active", isCoverKindActive),
      coverKindButtonElement.setAttribute("aria-pressed", String(isCoverKindActive)));
  }
  const coverDirection = ["left", "right"].includes(coverKindValue.coverDirection)
    ? coverKindValue.coverDirection
    : "split";
  for (const coverDirectionButtonElement of ctx.coverSettingsDirectionElement.querySelectorAll(
    "[data-cover-direction]",
  )) {
    const isCoverDirectionActive =
      coverDirectionButtonElement.dataset.coverDirection === coverDirection;
    (coverDirectionButtonElement.classList.toggle("active", isCoverDirectionActive),
      coverDirectionButtonElement.setAttribute("aria-pressed", String(isCoverDirectionActive)));
  }
  const coverMotorDirection = ["normal", "reversed"].includes(coverKindValue.coverMotorDirection)
    ? coverKindValue.coverMotorDirection
    : "auto";
  for (const coverDirectionButtonElementElement of ctx.coverSettingsMotorDirectionElement.querySelectorAll(
    "[data-cover-motor-direction]",
  )) {
    const isCoverDirectionActiveActive =
      coverDirectionButtonElementElement.dataset.coverMotorDirection === coverMotorDirection;
    (coverDirectionButtonElementElement.classList.toggle("active", isCoverDirectionActiveActive),
      coverDirectionButtonElementElement.setAttribute(
        "aria-pressed",
        String(isCoverDirectionActiveActive),
      ));
  }
}
export function runExtraLocal(ctx: CoverMotorInspectorContext, runExtraInner: any) {
  const coverMotorDirectionValueState = normalizeFlowLine2(runExtraInner?.properties);
  return [...(coverMotorDirectionValueById.get(runExtraInner?.id) || [])]
    .filter(
      ([filteredItemsState, filteredItemsValue]) =>
        JSON.stringify((coverMotorDirectionValueState as any)[filteredItemsState]) !==
        JSON.stringify(filteredItemsValue),
    )
    .map(([mappedItemsStore]) => mappedItemsStore);
}
export function coverMotorButtonElement(ctx: CoverMotorInspectorContext) {
  window.requestAnimationFrame(ctx.hasActiveProject);
  const createdInstanceConfig = ctx.removedComponent(),
    isCoverMotorActive = createdInstanceConfig?.type === "flow-line";
  renderFlowLineInspector2(ctx.navigatorElement, createdInstanceConfig, {
    document: ctx.activeProject?.document,
    entities: ctx.entities,
    pickEntity: (isCoverMotorActiveState: any, isCoverMotorActiveValue: any, isCoverMotorActiveConfig: any) =>
      ctx.onSessionsRevokeOthersConfirmButtonClick(
        isCoverMotorActiveState,
        createdInstanceConfig.id,
        isCoverMotorActiveValue,
        isCoverMotorActiveConfig,
      ),
    multipleSelected: ctx.selectedComponentIdsSet.size > 1,
    styleChangeCount: isCoverMotorActive ? runExtraLocal(ctx, createdInstanceConfig).length : 0,
    hasStyleChanges:
      isCoverMotorActive &&
      runExtraLocal(ctx, createdInstanceConfig).length > 0 &&
      ctx.findReplaceableComponents(createdInstanceConfig).length > 0,
    enhanceControls: (isCoverMotorActiveElement: any) => {
      (ctx.selectableEntities(isCoverMotorActiveElement),
        ctx.destroyDashboardPreview(isCoverMotorActiveElement),
        ctx.formatLastSeen(isCoverMotorActiveElement));
      for (const isCoverMotorActiveRef of isCoverMotorActiveElement.querySelectorAll("select"))
        isCoverMotorActiveRef.tabIndex = -1;
    },
    syncControls: (syncInspectorElement: any) => {
      for (const syncInspectorState of syncInspectorElement.querySelectorAll("select"))
        ctx.loadNavigationIconOptions(syncInspectorState);
    },
    onError: ctx.handleOperationError,
    onApplyStyle: ctx.imageAssetPointerOverEvent,
    pathEditorContext: () => (
      ctx.editorMode !== "edit" && ctx.setEditorMode("edit"),
      {
        canvas: ctx.editorRenderer?.canvas,
        host: ctx.editorRenderer?.componentHosts.get(createdInstanceConfig.id),
        container: ctx.displayDeviceCountElement,
        states: ctx.editorRenderer?.states,
        enhancePathSelect: ctx.stopHoverScroll,
        onLayoutChange: () => {
          (ctx.resizeWorkspaceCanvas(), ctx.editorRenderer?.resize());
        },
        lockTargets: [
          ctx.editorCanvasElement,
          ctx.navigatorContentElement.closest("aside"),
          ctx.navigatorElement,
          document.querySelector(".workspace-heading"),
          document.querySelector("body > header"),
        ],
      }
    ),
    onPreview: (syncInspectorValue: any, syncInspectorConfig: any) => {
      (syncInspectorConfig.properties &&
        ctx.editorRenderer?.previewComponentProperties(
          syncInspectorValue,
          syncInspectorConfig.properties,
        ),
        (syncInspectorConfig.position || syncInspectorConfig.style?.scale) &&
          ctx.editorRenderer?.previewComponentTransform(syncInspectorValue, {
            ...syncInspectorConfig.position,
            ...(syncInspectorConfig.style?.scale
              ? {
                  scale: syncInspectorConfig.style.scale,
                }
              : {}),
          }));
    },
    onChange: (syncInspectorRef: any, syncInspectorEntry: any) =>
      ctx.mutateDocument(
        (syncInspector: any) => {
          const syncInspectorRecord = findComponent2(syncInspector, syncInspectorRef)?.component;
          if (!syncInspectorRecord || syncInspectorRecord.type !== "flow-line")
            throw new Error("流水线条控件已不存在。");
          const inspectedComponentState = normalizeFlowLine2(syncInspectorRecord.properties);
          let inspectedComponent = coverMotorDirectionValueById.get(syncInspectorRef);
          inspectedComponent ||
            ((inspectedComponent = new Map()),
            coverMotorDirectionValueById.set(syncInspectorRef, inspectedComponent));
          for (const availablePropertiesName of Object.keys(syncInspectorEntry.properties || {}))
            Object.hasOwn(FLOW_LINE_FIELDS2, availablePropertiesName) &&
              !inspectedComponent.has(availablePropertiesName) &&
              inspectedComponent.set(
                availablePropertiesName,
                (inspectedComponentState as any)[availablePropertiesName],
              );
          const inspectedComponentValue = syncInspectorEntry.position?.rotation;
          for (const [isImageComponentState, isImageComponentValue] of Object.entries(
            syncInspectorEntry,
          )) {
            const isImageComponentConfig = {
              ...(isImageComponentValue as Record<string, unknown>),
            };
            (isImageComponentState === "position" &&
              Number.isFinite(inspectedComponentValue) &&
              delete isImageComponentConfig.rotation,
              (syncInspectorRecord[isImageComponentState] = {
                ...syncInspectorRecord[isImageComponentState],
                ...isImageComponentConfig,
              }));
          }
          Number.isFinite(inspectedComponentValue) &&
            ctx.setComponentsRotation(syncInspector, syncInspectorRef, inspectedComponentValue);
        },
        ctx.pageSelectElement.value,
        {
          throwOnError: true,
        },
      ),
  });
  const isImageComponent = createdInstanceConfig?.type === "ctx.image",
    isInteraction3dComponent = createdInstanceConfig?.type === "interaction3d";
  renderInteraction3dInspector2(ctx.navigatorElement, createdInstanceConfig, {
    document: ctx.activeProject?.document,
    entities: ctx.entities,
    states: ctx.editorRenderer?.states,
    pickers: ctx.editorPickers,
    enhanceControls: (controlsRoot: any) => {
      (ctx.selectableEntities(controlsRoot),
        ctx.destroyDashboardPreview(controlsRoot),
        ctx.formatLastSeen(controlsRoot));
    },
    prepareCanvas: () => {
      const activeProjectComponent = findComponent2(
        ctx.activeProject?.document,
        createdInstanceConfig.id,
      );
      if (!activeProjectComponent) throw new Error("3D 控件已不存在。");
      const componentPagePath = activeProjectComponent.page?.path || ctx.pageSelectElement.value,
        needsEditMode = ctx.editorMode !== "edit" || ctx.editorRenderer?.page?.path !== componentPagePath;
      ((ctx.pageSelectElement.value = componentPagePath),
        ctx.loadNavigationIconOptions(ctx.pageSelectElement),
        needsEditMode && ctx.setEditorMode("edit"),
        ctx.renderComponentLists(),
        ctx.syncRendererSelection());
    },
    onError: ctx.handleOperationError,
    onChange: (changes: any, { replaceProperties: shouldReplaceProperties = false } = {}) =>
      ctx.mutateDocument(
        (inspectorDraft: any) => {
          const updatedComponent = findComponent2(
            inspectorDraft,
            createdInstanceConfig.id,
          )?.component;
          if (!updatedComponent || updatedComponent.type !== "interaction3d")
            throw new Error("3D 控件已不存在。");
          for (const [changedPropertyKey, propertyValue] of Object.entries(changes))
            updatedComponent[changedPropertyKey] =
              changedPropertyKey === "properties" && shouldReplaceProperties
                ? propertyValue
                : {
                    ...updatedComponent[changedPropertyKey],
                    ...(propertyValue as Record<string, unknown>),
                  };
        },
        ctx.pageSelectElement.value,
        {
          throwOnError: true,
        },
      ),
  });
  const isFloorplanAutoDiagram = createdInstanceConfig?.type === "floorplan-auto-diagram",
    isIconButtonEffect = createdInstanceConfig?.type === "icon-button-effect",
    isTitleButton = createdInstanceConfig?.type === "title-button",
    isLightStatisticsComponent = createdInstanceConfig?.type === "light-statistics",
    isIconButtonLike = ["icon-button", "device-button", "presence-sensor"].includes(
      createdInstanceConfig?.type,
    ),
    isVacuumMap = createdInstanceConfig?.type === "vacuum-map",
    isCamera = createdInstanceConfig?.type === "camera",
    isAirConditioner = createdInstanceConfig?.type === "air-conditioner",
    isTime = createdInstanceConfig?.type === "time",
    isDate = createdInstanceConfig?.type === "date",
    isWeather = createdInstanceConfig?.type === "weather",
    isLineChart = createdInstanceConfig?.type === "line-chart",
    isEventLogWall = createdInstanceConfig?.type === "event-log-wall",
    isPanelFrame = createdInstanceConfig?.type === "percentage-bar";
  renderPercentageBarInspector2(
    ctx.navigatorElement,
    createdInstanceConfig,
    ctx.onGlobalColorPickerHexTextInputInput(createdInstanceConfig),
  );
  const isNavigationButton = createdInstanceConfig?.type === "panel-frame",
    re2 = ctx.navigationLabelTextInputElement(createdInstanceConfig),
    isGroup = createdInstanceConfig?.type === "group";
  for (const staleNavigationPreviewId of [...ctx.navigationPreviewStateByComponentId.keys()])
    (re2 && staleNavigationPreviewId === createdInstanceConfig.id) ||
      (ctx.navigationPreviewStateByComponentId.delete(staleNavigationPreviewId),
      ctx.editorRenderer?.setComponentPreviewState(staleNavigationPreviewId, "auto"));
  for (const staleEffectPreviewId of [...ctx.iconButtonEffectPreviewStateByComponentId.keys()])
    (isIconButtonEffect && staleEffectPreviewId === createdInstanceConfig.id) ||
      (ctx.iconButtonEffectPreviewStateByComponentId.delete(staleEffectPreviewId),
      ctx.editorRenderer?.setComponentPreviewState(staleEffectPreviewId, "auto"));
  for (const staleIconPreviewId of [...ctx.iconButtonPreviewStateByComponentId.keys()])
    (isIconButtonLike && staleIconPreviewId === createdInstanceConfig.id) ||
      (ctx.iconButtonPreviewStateByComponentId.delete(staleIconPreviewId),
      ctx.editorRenderer?.setComponentPreviewState(staleIconPreviewId, "auto"));
  for (const staleAirConditionerPreviewId of [...ctx.airConditionerPreviewStateByComponentId.keys()])
    (isAirConditioner && staleAirConditionerPreviewId === createdInstanceConfig.id) ||
      (ctx.airConditionerPreviewStateByComponentId.delete(staleAirConditionerPreviewId),
      ctx.editorRenderer?.setComponentPreviewState(staleAirConditionerPreviewId, "auto"));
  const hasInspector =
    isPanelFrame ||
    isCoverMotorActive ||
    isInteraction3dComponent ||
    isGroup ||
    isImageComponent ||
    isFloorplanAutoDiagram ||
    isIconButtonEffect ||
    isTitleButton ||
    isLightStatisticsComponent ||
    isIconButtonLike ||
    isVacuumMap ||
    isCamera ||
    isAirConditioner ||
    isTime ||
    isDate ||
    isWeather ||
    isLineChart ||
    isEventLogWall ||
    isNavigationButton ||
    re2;
  ((ctx.inspectorEmptyElement.hidden = hasInspector),
    isGroup &&
      (ctx.inspectorEmptyElement.querySelector("p").textContent =
        "组合支持整体移动、复制、旋转和缩放；双击组合可进入组内编辑。"),
    (ctx.imageInspectorElement.hidden = !isImageComponent),
    (ctx.floorplanAutoDiagramInspectorFormElement.hidden = !isFloorplanAutoDiagram),
    (ctx.iconButtonEffectInspectorElement.hidden = !isIconButtonEffect),
    (ctx.titleButtonInspectorElement.hidden = !isTitleButton),
    (ctx.lightStatisticsInspectorElement.hidden = !isLightStatisticsComponent),
    (ctx.iconButtonInspectorElement.hidden = !isIconButtonLike),
    (ctx.vacuumMapInspectorElement.hidden = !isVacuumMap),
    (ctx.cameraInspectorElement.hidden = !isCamera),
    (ctx.airConditionerInspectorElement.hidden = !isAirConditioner),
    (ctx.timeInspectorElement.hidden = !isTime),
    (ctx.dateInspectorElement.hidden = !isDate),
    (ctx.weatherInspectorElement.hidden = !isWeather),
    (ctx.lineChartInspectorElement.hidden = !isLineChart),
    (ctx.eventLogWallInspectorElement.hidden = !isEventLogWall),
    (ctx.panelFrameInspectorFormElement.hidden = !isNavigationButton),
    (ctx.navigationInspectorFormElement.hidden = !re2));
  const startsWith = String(createdInstanceConfig?.bindings?.entity?.entityId || "").startsWith(
    "cover.",
  );
  if (((ctx.coverSettingsInspectorElement.hidden = !hasInspector || !startsWith), !hasInspector)) {
    (ctx.runShadow(),
      (ctx.inspectorEmptyElement.querySelector("p").textContent = createdInstanceConfig
        ? "“" + componentLabel2(createdInstanceConfig) + "”的专属属性尚未实现。"
        : "选择一个控件开始编辑。"));
    return;
  }
  if ((startsWith && syncCoverSettingsInspector(ctx, createdInstanceConfig), isFloorplanAutoDiagram)) {
    const diagramProperties = createdInstanceConfig.properties || {},
      diagramPosition = createdInstanceConfig.position || {},
      diagramCanvasWidthPx = Number(ctx.activeProject.document.canvas.width || 2778),
      diagramCanvasHeightPx = Number(ctx.activeProject.document.canvas.height || 1940),
      diagramWidthPx = Number(diagramPosition.width || 100),
      diagramHeightPx = Number(diagramPosition.height || 100),
      lightLayerCount = Array.isArray(diagramProperties.lightLayers)
        ? diagramProperties.lightLayers.length
        : 0,
      isPreviewReady =
        diagramProperties.previewReady === true &&
        (diagramProperties.generated !== true || diagramProperties.previewing === true);
    ((ctx.floorplanAutoDiagramStatusElement.textContent = diagramProperties.generating
      ? "正在后台生成底图和灯组效果，请稍候…"
      : diagramProperties.generated && lightLayerCount
        ? "已生成导图，包含 " + lightLayerCount + " 个灯组。"
        : isPreviewReady
          ? "3D画面已置入仪表盘，请先确定位置、大小和视角。"
          : "尚未载入3D画面。"),
      (ctx.floorplanAutoDiagramViewToggleButtonElement.hidden = !isPreviewReady));
    const isViewMode = diagramProperties.interactionMode === "view";
    (ctx.floorplanAutoDiagramViewToggleButtonElement.classList.toggle("active", isViewMode),
      ctx.floorplanAutoDiagramViewToggleButtonElement.setAttribute("aria-pressed", String(isViewMode)),
      (ctx.floorplanAutoDiagramViewToggleButtonElement.textContent = isViewMode
        ? "完成3D视角调整"
        : "调整3D视角"),
      (ctx.floorplanAutoDiagramLabelTextInputElement.value =
        diagramProperties.label || diagramProperties.instanceName || ""),
      (ctx.floorplanAutoDiagramFolderTextInputElement.value = diagramProperties.exportFolder || ""));
    const diagramLayoutMode = diagramProperties.layoutMode === "fill" ? "fill" : "free";
    for (const layoutOptionElement of ctx.floorplanAutoDiagramLayoutElement.querySelectorAll(
      "[data-floorplan-layout]",
    )) {
      const isLayoutOptionActive =
        layoutOptionElement.dataset.floorplanLayout === diagramLayoutMode;
      (layoutOptionElement.classList.toggle("active", isLayoutOptionActive),
        layoutOptionElement.setAttribute("aria-pressed", String(isLayoutOptionActive)));
    }
    ((ctx.floorplanAutoDiagramLeftInputElement.value = roundField2(
      clampNumber2(
        ((Number(diagramPosition.x || 0) + diagramWidthPx / 2) / diagramCanvasWidthPx) * 100,
        0,
        100,
      ),
    )),
      (ctx.floorplanAutoDiagramTopInputElement.value = roundField2(
        clampNumber2(
          ((Number(diagramPosition.y || 0) + diagramHeightPx / 2) / diagramCanvasHeightPx) * 100,
          0,
          100,
        ),
      )),
      (ctx.floorplanAutoDiagramWidthInputElement.value = roundField2(
        (diagramWidthPx / diagramCanvasWidthPx) * 100,
      )),
      (ctx.floorplanAutoDiagramHeightInputElement.value = roundField2(
        (diagramHeightPx / diagramCanvasHeightPx) * 100,
      )),
      (ctx.floorplanAutoDiagramScaleInputElement.value = roundField2(
        Number(createdInstanceConfig.style?.scale || 1) * 100,
      )),
      (ctx.floorplanAutoDiagramRotationInputElement.value = roundField2(
        Number(diagramPosition.rotation || 0),
      )));
    const diagramState = ctx.floorplanAutoDiagramStateByComponentId.get(createdInstanceConfig.id),
      floors = Array.isArray(diagramState?.floors) ? diagramState.floors : [],
      selectedFloorId =
        String(diagramProperties.floorSelection || "") || String(diagramState?.selected || "");
    if (floors.length) {
      const floorOptionElements = floors.map((floor: any) =>
        Object.assign(document.createElement("option"), {
          value: floor.id,
          textContent: floor.name,
        }),
      );
      (floors.length > 1 &&
        floorOptionElements.unshift(
          Object.assign(document.createElement("option"), {
            value: "all",
            textContent: "全楼",
          }),
        ),
        ctx.floorplanAutoDiagramFloorSelectElement.replaceChildren(...floorOptionElements),
        (ctx.floorplanAutoDiagramFloorSelectElement.value = floorOptionElements.some(
          (floorOption: any) => floorOption.value === selectedFloorId,
        )
          ? selectedFloorId
          : floorOptionElements[0].value));
    } else
      ctx.floorplanAutoDiagramFloorSelectElement.replaceChildren(
        Object.assign(document.createElement("option"), {
          value: "",
          textContent: isPreviewReady ? "正在读取楼层…" : "载入3D画面后选择",
        }),
      );
    ctx.floorplanAutoDiagramFloorSelectElement.disabled =
      !isPreviewReady || floors.length === 0 || diagramProperties.generating === true;
    const cameraViewMode = diagramProperties.cameraView === "top" ? "top" : "free",
      cameraModeValue =
        diagramProperties.cameraMode === "perspective" ? "perspective" : "orthographic";
    for (const cameraViewButtonElement of ctx.floorplanAutoDiagramCameraViewElement.querySelectorAll(
      "[data-floorplan-camera-view]",
    )) {
      const isCameraViewActive =
        cameraViewButtonElement.dataset.floorplanCameraView === cameraViewMode;
      (cameraViewButtonElement.classList.toggle("active", isCameraViewActive),
        cameraViewButtonElement.setAttribute("aria-pressed", String(isCameraViewActive)));
    }
    for (const cameraModeButtonElement of ctx.floorplanAutoDiagramCameraModeElement.querySelectorAll(
      "[data-floorplan-camera-mode]",
    )) {
      const isCameraModeActive =
        cameraModeButtonElement.dataset.floorplanCameraMode === cameraModeValue;
      (cameraModeButtonElement.classList.toggle("active", isCameraModeActive),
        cameraModeButtonElement.setAttribute("aria-pressed", String(isCameraModeActive)));
    }
    ((ctx.floorplanAutoDiagramFocalLengthInputElement.value = roundField2(
      clampNumber2(Number(diagramProperties.cameraFocalLength || 50), 18, 120),
    )),
      (ctx.floorplanAutoDiagramFocalLengthInputElement.disabled =
        cameraModeValue !== "perspective" || !isPreviewReady),
      (ctx.floorplanAutoDiagramRotateTopButtonElement.disabled =
        cameraViewMode !== "top" || !isPreviewReady),
      (ctx.floorplanAutoDiagramOpenBaseLightingButtonElement.disabled = !isPreviewReady));
    for (const diagramInputElement of [
      ctx.floorplanAutoDiagramLeftInputElement,
      ctx.floorplanAutoDiagramTopInputElement,
      ctx.floorplanAutoDiagramWidthInputElement,
      ctx.floorplanAutoDiagramHeightInputElement,
      ctx.floorplanAutoDiagramScaleInputElement,
      ctx.floorplanAutoDiagramRotationInputElement,
    ])
      diagramInputElement.disabled = diagramLayoutMode === "fill";
    ((ctx.floorplanAutoDiagramOpenStudioButtonElement.disabled = diagramProperties.generating === true),
      (ctx.floorplanAutoDiagramOpenStudioButtonElement.textContent =
        diagramProperties.generated && !diagramProperties.previewing
          ? "重新调整位置和视角"
          : diagramProperties.generating
            ? "正在后台生成…"
            : isPreviewReady
              ? "确定位置大小并后台生成"
              : "载入3D画面"),
      (ctx.floorplanAutoDiagramBindingsElement.hidden = lightLayerCount === 0));
    const lightEntities = ctx.entities.filter(
        (lightEntityRecord: any) => ctx.renderNavigationIconPreview(lightEntityRecord) === "light",
      ),
      lightGroupRows = (diagramProperties.lightLayers || []).map((lightLayer: any) => {
        const layerLabelElement = document.createElement("label");
        layerLabelElement.textContent = lightLayer.note || lightLayer.name || "灯组";
        const entitySelectElement = document.createElement("select");
        entitySelectElement.dataset.floorplanLightGroupId = lightLayer.id;
        const boundLightEntityId =
            createdInstanceConfig.bindings?.["lightGroup:" + lightLayer.id]?.entityId || "",
          placeholderOptionElement = document.createElement("option");
        ((placeholderOptionElement.value = ""),
          (placeholderOptionElement.textContent = "选择实体"),
          entitySelectElement.append(placeholderOptionElement));
        for (const lightEntity of lightEntities) {
          const entityOptionElement = document.createElement("option");
          ((entityOptionElement.value = lightEntity.entityId),
            (entityOptionElement.textContent = ctx.runMode(lightEntity)),
            entitySelectElement.append(entityOptionElement));
        }
        if (
          boundLightEntityId &&
          !lightEntities.some(
            (lightEntityOption: any) => lightEntityOption.entityId === boundLightEntityId,
          )
        ) {
          const missingEntityOptionElement = document.createElement("option");
          ((missingEntityOptionElement.value = boundLightEntityId),
            (missingEntityOptionElement.textContent = boundLightEntityId),
            entitySelectElement.append(missingEntityOptionElement));
        }
        return (
          (entitySelectElement.value = boundLightEntityId),
          layerLabelElement.append(entitySelectElement),
          layerLabelElement
        );
      });
    ctx.floorplanAutoDiagramBindingListElement.replaceChildren(...lightGroupRows);
    return;
  }
  if (isIconButtonEffect) {
    const openMenuName = ctx.ibeEntityMenuElement.hidden
      ? ctx.ibeAssetMenuElement.hidden
        ? ctx.ibeIconMenuElement.hidden
          ? null
          : "ibe-icon"
        : "ibe-asset"
      : "ibe-entity";
    ctx.runShadow(openMenuName);
    const effectProperties = createdInstanceConfig.properties || {},
      effectPosition = createdInstanceConfig.position || {},
      effectCanvasWidthPx = Number(ctx.activeProject.document.canvas.width || 2778),
      effectCanvasHeightPx = Number(ctx.activeProject.document.canvas.height || 1940),
      effectWidthPx = Number(effectPosition.width || 100),
      effectHeightPx = Number(effectPosition.height || 100);
    ((ctx.ibeLabelElement.value = effectProperties.label || ""),
      setInspectorToggle2(ctx.ibeButtonVisibleElement, effectProperties.buttonVisible !== false),
      setInspectorToggle2(ctx.ibeEffectVisibleElement, effectProperties.effectVisible !== false),
      (ctx.ibeColorTemperatureRealtimeElement.checked =
        effectProperties.effectColorTemperatureRealtime !== false),
      (ctx.ibeBrightnessRealtimeElement.checked = effectProperties.effectBrightnessRealtime !== false));
    for (const realtimeCheckboxElement of [
      ctx.ibeColorTemperatureRealtimeElement,
      ctx.ibeBrightnessRealtimeElement,
    ])
      ((realtimeCheckboxElement.disabled = false),
        (realtimeCheckboxElement.title = ""),
        realtimeCheckboxElement.closest(".check-row")?.classList.remove("is-disabled"));
    (ctx.runExtraFallback(createdInstanceConfig),
      ctx.syncEffectAssetSelection(createdInstanceConfig),
      ctx.renderTitleButtonIconPreview(effectProperties.icon || ""),
      (ctx.ibeIconOffColorElement.value = effectProperties.iconOffColor || "#9aa5ad"),
      (ctx.ibeIconOnColorElement.value = effectProperties.iconOnColor || "#ffffff"),
      (ctx.ibeIconSizeElement.value = roundField2(Number(effectProperties.iconSize ?? 44))),
      (ctx.ibeButtonOffColorElement.value = effectProperties.buttonOffColor || "#17242d"),
      (ctx.ibeButtonOnColorElement.value = effectProperties.buttonOnColor || "#1f91b8"),
      (ctx.ibeButtonOpacityElement.value = roundField2(
        Number(effectProperties.buttonOpacity ?? 0.92) * 100,
      )),
      (ctx.ibeFrameColorElement.value = effectProperties.frameColor || "#dcebf2"),
      (ctx.ibeFrameWidthElement.value = roundField2(Number(effectProperties.frameWidth ?? 1.5))),
      (ctx.ibeFrameOpacityElement.value = roundField2(
        Number(effectProperties.frameOpacity ?? 0.72) * 100,
      )),
      (ctx.ibeRadiusElement.value = roundField2(Number(effectProperties.radius ?? 50))),
      (ctx.ibeGlowColorElement.value = effectProperties.glowColor || "#43c8f0"),
      (ctx.ibeGlowOffStrengthElement.value = roundField2(
        Number(effectProperties.glowOffStrength ?? 0) * 100,
      )),
      (ctx.ibeGlowOnStrengthElement.value = roundField2(
        Number(effectProperties.glowOnStrength ?? 1) * 100,
      )),
      (ctx.ibeEffectOpacityElement.value = roundField2(
        Number(effectProperties.effectOpacity ?? 1) * 100,
      )),
      (ctx.ibeEffectFadeDurationElement.value = roundField2(
        Number(effectProperties.effectFadeDuration ?? 0.52),
      )),
      (ctx.ibeEffectLeftElement.value = roundField2(Number(effectProperties.effectLeft ?? 50))),
      (ctx.ibeEffectTopElement.value = roundField2(Number(effectProperties.effectTop ?? 50))),
      (ctx.ibeEffectScaleElement.value = roundField2(Number(effectProperties.effectScale ?? 1) * 100)),
      (ctx.ibeEffectRotationElement.value = roundField2(Number(effectProperties.effectRotation ?? 0))),
      (ctx.ibeLeftElement.value = roundField2(
        clampNumber2(
          ((Number(effectPosition.x || 0) + effectWidthPx / 2) / effectCanvasWidthPx) * 100,
          0,
          100,
        ),
      )),
      (ctx.ibeTopElement.value = roundField2(
        clampNumber2(
          ((Number(effectPosition.y || 0) + effectHeightPx / 2) / effectCanvasHeightPx) * 100,
          0,
          100,
        ),
      )),
      (ctx.ibeWidthElement.value = roundField2((effectWidthPx / effectCanvasWidthPx) * 100)),
      (ctx.ibeHeightElement.value = roundField2((effectHeightPx / effectCanvasHeightPx) * 100)),
      (ctx.ibeScaleElement.value = roundField2(Number(createdInstanceConfig.style?.scale || 1) * 100)),
      (ctx.ibeRotationElement.value = roundField2(Number(effectPosition.rotation || 0))));
    const isEffectMultiSelection = ctx.selectedComponentIdsSet.size > 1;
    ((ctx.ibeWidthElement.disabled = isEffectMultiSelection),
      (ctx.ibeHeightElement.disabled = isEffectMultiSelection),
      (ctx.ibeScaleElement.disabled = false),
      (ctx.ibeRotationElement.disabled = false));
    const effectLayoutMode = effectProperties.effectLayoutMode === "fill" ? "fill" : "free";
    for (const effectLayoutOptionElement of ctx.ibeEffectLayoutOptionsElement.querySelectorAll(
      "[data-ibe-layout]",
    )) {
      const isEffectLayoutActive = effectLayoutOptionElement.dataset.ibeLayout === effectLayoutMode;
      (effectLayoutOptionElement.classList.toggle("active", isEffectLayoutActive),
        effectLayoutOptionElement.setAttribute("aria-pressed", String(isEffectLayoutActive)));
    }
    for (const effectSizeInputElement of [
      ctx.ibeEffectLeftElement,
      ctx.ibeEffectTopElement,
      ctx.ibeEffectScaleElement,
      ctx.ibeEffectRotationElement,
    ])
      effectSizeInputElement.disabled = effectLayoutMode === "fill";
    const bL2 = ctx.readEffectNaturalSize(effectProperties);
    ctx.ibeEffectSizeHintElement.textContent = bL2
      ? "原始尺寸：" +
        roundField2(bL2.width) +
        " × " +
        roundField2(bL2.height) +
        "；仅支持等比缩放。"
      : "效果图片将按原始尺寸等比缩放。";
    const effectLayerName = iconButtonEffectInspectorLayer2(
      createdInstanceConfig,
      ctx.iconButtonEffectLayerByComponentId.get(createdInstanceConfig.id),
    );
    (ctx.editorRenderer?.setComponentSelectionLayer(createdInstanceConfig.id, effectLayerName),
      ctx.iconButtonEffectPreviewStateByComponentId.has(createdInstanceConfig.id) ||
        (ctx.iconButtonEffectPreviewStateByComponentId.set(createdInstanceConfig.id, "on"),
        ctx.editorRenderer?.setComponentPreviewState(createdInstanceConfig.id, "on")));
    const effectPreviewState =
      ctx.iconButtonEffectPreviewStateByComponentId.get(createdInstanceConfig.id) || "auto";
    for (const effectPreviewStateButtonElement of ctx.ibePreviewStateElement.querySelectorAll(
      "[data-ibe-preview]",
    )) {
      const isEffectPreviewActive =
        effectPreviewStateButtonElement.dataset.ibePreview === effectPreviewState;
      (effectPreviewStateButtonElement.classList.toggle("active", isEffectPreviewActive),
        effectPreviewStateButtonElement.setAttribute(
          "aria-pressed",
          String(isEffectPreviewActive),
        ));
    }
    for (const effectLayerOptionElement of ctx.ibeLayerOptionsElement.querySelectorAll(
      "[data-ibe-layer]",
    )) {
      const isEffectLayerSelected = effectLayerOptionElement.dataset.ibeLayer === effectLayerName;
      (effectLayerOptionElement.classList.toggle("active", isEffectLayerSelected),
        effectLayerOptionElement.setAttribute("aria-pressed", String(isEffectLayerSelected)));
    }
    const isEffectLayer = effectLayerName === "effect";
    ((ctx.ibeButtonSectionElement.hidden = isEffectLayer),
      (ctx.ibeButtonTransformSectionElement.hidden = isEffectLayer),
      (ctx.ibeActionSectionElement.hidden = isEffectLayer),
      (ctx.ibeEffectSectionElement.hidden = !isEffectLayer));
    const effectReplaceableCount = ctx.findReplaceableComponents(createdInstanceConfig).length,
      effectApplyTargetCount = ctx.runAuxAlt(createdInstanceConfig).length;
    ((ctx.ibeApplyStyleElement.disabled = !effectReplaceableCount || !effectApplyTargetCount),
      (ctx.ibeApplyCountElement.textContent = effectApplyTargetCount + " 项修改"),
      (ctx.ibeApplyStyleElement.textContent = "一键应用到同类型控件"),
      ctx.syncComponentActionControls(createdInstanceConfig, ctx.ibeActionControlsElement));
    return;
  }
  if (isAirConditioner) {
    (ctx.runShadow(ctx.airConditionerEntityMenuElement.hidden ? null : "air-conditioner-entity"),
      ctx.syncAirConditionerInspector(createdInstanceConfig));
    return;
  }
  if (isTitleButton) {
    const titleMenuName = ctx.titleButtonEntityMenuElement.hidden
      ? ctx.titleButtonIconMenuElement.hidden
        ? null
        : "title-button-icon"
      : "title-button-entity";
    (ctx.runShadow(titleMenuName), ctx.syncTitleButtonInspector(createdInstanceConfig));
    return;
  }
  if (isLightStatisticsComponent) {
    const statisticsMenuName = ctx.lightStatisticsEntityMenuElement.hidden
      ? ctx.lightStatisticsActionEntityMenuElement.hidden
        ? ctx.lightStatisticsIconMenuElement.hidden
          ? null
          : "light-statistics-icon"
        : "light-statistics-action-entity"
      : "light-statistics-entity";
    (ctx.runShadow(statisticsMenuName), ctx.syncLightStatisticsInspector(createdInstanceConfig));
    return;
  }
  if (isIconButtonLike) {
    const iconButtonMenuName = ctx.iconButtonEntityMenuElement.hidden
      ? ctx.iconButtonIconMenuElement.hidden
        ? null
        : "icon-button-icon"
      : "icon-button-entity";
    (ctx.runShadow(iconButtonMenuName), ctx.syncIconButtonInspector(createdInstanceConfig));
    return;
  }
  if (isCamera) {
    (ctx.runShadow(ctx.cameraEntityMenuElement.hidden ? null : "camera-entity"),
      ctx.syncCameraInspector(createdInstanceConfig));
    return;
  }
  if (isVacuumMap) {
    (ctx.runShadow(ctx.vacuumMapEntityMenuElement.hidden ? null : "vacuum-map-entity"),
      ctx.syncVacuumMapInspector(createdInstanceConfig));
    return;
  }
  if (re2) {
    (ctx.runShadow(ctx.navigationIconMenuElement.hidden ? null : "navigation-icon"),
      ctx.syncNavigationInspector(createdInstanceConfig));
    return;
  }
  if (isTime) {
    (ctx.runShadow(), ctx.runExtraPeer(createdInstanceConfig));
    return;
  }
  if (isDate) {
    (ctx.runShadow(), ctx.syncTimeInspector(createdInstanceConfig));
    return;
  }
  if (isWeather) {
    (ctx.runShadow(), ctx.syncWeatherInspector(createdInstanceConfig));
    return;
  }
  if (isPanelFrame) {
    ctx.runShadow();
    return;
  }
  if (isLineChart) {
    (ctx.runShadow(), ctx.syncLineChartInspector(createdInstanceConfig));
    return;
  }
  if (isEventLogWall) {
    (ctx.runShadow(), ctx.syncEventLogWallInspector(createdInstanceConfig));
    return;
  }
  if (isNavigationButton) {
    (ctx.runShadow(), ctx.syncPanelFrameInspector(createdInstanceConfig));
    return;
  }
  const imageProperties = createdInstanceConfig.properties || {},
    imagePosition = createdInstanceConfig.position || {},
    imageCanvasWidthPx = Number(ctx.activeProject.document.canvas.width || 2778),
    imageCanvasHeightPx = Number(ctx.activeProject.document.canvas.height || 1940),
    imageWidthPx = Number(imagePosition.width || 100),
    imageHeightPx = Number(imagePosition.height || 100);
  ((ctx.imageTypeElement.value = "图片"),
    (ctx.imageLabelElement.value = imageProperties.label || ""),
    ctx.runExtraFallback(createdInstanceConfig),
    ctx.syncImageAssetSelection(createdInstanceConfig),
    (ctx.imageOpacityInputElement.value = roundField2(Number(imageProperties.opacity ?? 1) * 100)),
    (ctx.imageLeftInputElement.value = roundField2(
      clampNumber2(
        ((Number(imagePosition.x || 0) + imageWidthPx / 2) / imageCanvasWidthPx) * 100,
        0,
        100,
      ),
    )),
    (ctx.imageTopInputElement.value = roundField2(
      clampNumber2(
        ((Number(imagePosition.y || 0) + imageHeightPx / 2) / imageCanvasHeightPx) * 100,
        0,
        100,
      ),
    )),
    (ctx.imageScaleInputElement.value = roundField2(
      clampNumber2(Number(createdInstanceConfig.style?.scale || 1) * 100, 1, 500),
    )),
    (ctx.imageRotationInputElement.value = roundField2(Number(imagePosition.rotation || 0))));
  const imageLayoutMode = imageProperties.layoutMode === "fill" ? "fill" : "free";
  for (const imageLayoutOptionElement of ctx.imageLayoutOptionsElement.querySelectorAll(
    "[data-image-layout]",
  )) {
    const isImageLayoutActiveActive =
      imageLayoutOptionElement.dataset.imageLayout === imageLayoutMode;
    (imageLayoutOptionElement.classList.toggle("active", isImageLayoutActiveActive),
      imageLayoutOptionElement.setAttribute("aria-pressed", String(isImageLayoutActiveActive)));
  }
  const isImageLayoutActive = imageLayoutMode === "fill";
  ((ctx.imageLeftInputElement.disabled = isImageLayoutActive),
    (ctx.imageTopInputElement.disabled = isImageLayoutActive),
    (ctx.imageScaleInputElement.disabled = isImageLayoutActive),
    (ctx.imageRotationInputElement.disabled = isImageLayoutActive),
    ctx.syncComponentActionControls(createdInstanceConfig, ctx.componentActionControlsElement));
}


