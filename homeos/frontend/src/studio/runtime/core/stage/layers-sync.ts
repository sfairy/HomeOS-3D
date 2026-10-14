/**
 * 舞台图层与布局同步：环境光层、NAS 浮层、布局度量、可见性门控。
 *
 * 从 `runtime/core/stage.ts` 的 `mountStage()` 闭包切出，依赖袋 `StageLayersSyncDeps`。
 */

import { GENERIC_DEVICE_KINDS as GENERIC_DEVICE_KINDS2, isGenericDeviceKind as isGenericDeviceKind2 } from "../../device/generic-device-catalog";
import { postHostMessage } from "./_shared";
import { vacuumStatusPresentation as vacuumStatusPresentation2 } from "../../vacuum/vacuum-map";

/** 依赖袋（宿主 `bootEditor` 作用域）：**每次调用现取**的普通对象，等价于闭包读值。
 * 本族切片只读不写（外层写入 0），所以不需要 getter / state 袋；宿主侧每个函数一个同名
 * 薄转发器，调用点零改写（函数声明保持提升语义）。族内互调留在模块内，不进依赖袋。
 */
export interface StageLayersSyncDeps {
  startupProgress: any;
  isAwaitingFloorViewAdjust: any;
  isRangeEditorOpen: any;
  mountOptions: any;
  selectedFloorId: any;
  activeModule: any;
  nasSyncSnapshot: any;
  options: any;
  deviceStates: any;
  nasStatus: any;
  collectNasBindings: any;
  waterHeaterStatusByModelType: any;
  entries: any;
  collectGenericDeviceBindings: any;
  environmentSyncSnapshot: any;
  speakerRings: any;
  collectSpeakerBindings: any;
  carCharging: any;
  airerMotion: any;
  collectCoverBindings: any;
  fanMotion: any;
  isEditing: any;
  text: any;
  focusedItemId: any;
  televisionSyncSnapshot: any;
  televisionScreens: any;
  collectTelevisionBindings: any;
  element: any;
  mediaViewportSize: any;
  containerViewportSize: any;
  mediaScale: any;
  value: any;
  configuredModuleKinds2: any;
  navigationLayerElement: any;
  floorTabsElement: any;
  toolbarElement: any;
  lightPanelSection: any;
  speakerPanel: any;
  /** ⚠ 同 `StageControlsDeps.getComputedStyle`：必须是钉死接收者的包装，不能是裸全局
   * （`deps.getComputedStyle(el)` 的 `this` 是袋对象 → 裸全局转发会 `Illegal invocation`）。 */
  getComputedStyle: any;
  presentationLayerElement: any;
  computePopupPlacement: any;
  presentationUiSignatureCache: any;
  cameraMotionSnapshot: any;
  computeFocusInset: any;
  panelDisplayMode: any;
  focusInset: any;
  renderMarkerPositions: any;
  currentModuleBindings: any;
  hasPendingStageRefresh: any;
  hasIdleIconActivity: any;
  isIdleIconHidden: any;
  isUserActive: any;
  isCameraRotating: any;
  pageBehavior: any;
  map: any;
  findBindingById: any;
  isOverviewOrAllFloors: any;
  vacuumWorkingLayerElement: any;
  markerLayerElement: any;
  restoreFocusWithin: any;
  canvasElement: any;
  outgoingGhostAnimation: any;
  lastInteractionMs: any;
}

export function syncNasOverlayCore(deps: StageLayersSyncDeps) {
    const isNasOverlayEnabled =
        deps.startupProgress > 0 && !deps.isAwaitingFloorViewAdjust && !deps.isRangeEditorOpen,
      modelRoot3 = deps.mountOptions.modelRoot,
      sceneRevision3 = deps.mountOptions.sceneRevision,
      nasSizeScale = deps.selectedFloorId === "all" ? 0.75 : 1,
      nasBrightnessScale =
        deps.selectedFloorId !== "all" &&
        (["devices", "nas", "television", "speaker", "water-heater"].includes(deps.activeModule) ||
          isGenericDeviceKind2(deps.activeModule))
          ? 1
          : 0.6;
    if (!(
      deps.nasSyncSnapshot?.root === modelRoot3 &&
      deps.nasSyncSnapshot.revision === sceneRevision3 &&
      deps.nasSyncSnapshot.config === deps.options &&
      deps.nasSyncSnapshot.states === deps.deviceStates &&
      deps.nasSyncSnapshot.enabled === isNasOverlayEnabled &&
      deps.nasSyncSnapshot.sizeScale === nasSizeScale &&
      deps.nasSyncSnapshot.brightness === nasBrightnessScale
    )) {
      ((deps.nasSyncSnapshot = {
        root: modelRoot3,
        revision: sceneRevision3,
        config: deps.options,
        states: deps.deviceStates,
        enabled: isNasOverlayEnabled,
        sizeScale: nasSizeScale,
        brightness: nasBrightnessScale,
      }),
        deps.nasStatus.sync({
          root: modelRoot3,
          revision: sceneRevision3,
          bindings: deps.collectNasBindings(),
          states: deps.deviceStates,
          enabled: isNasOverlayEnabled,
          sizeScale: nasSizeScale,
          brightness: nasBrightnessScale,
        }));
      // deps 化后 `Object.values(...)` 的元素类型退化成 unknown（宿主侧靠推断拿到的类型没了），
      // 显式收窄回「带 sync 的模型助手」——这是本轮 deps 化唯一暴露出的类型洞（6j/7a 同款）。
      for (const waterHeaterStatus of Object.values(deps.waterHeaterStatusByModelType) as Array<{ sync: (next: any) => void }>)
        waterHeaterStatus.sync({
          root: modelRoot3,
          revision: sceneRevision3,
          bindings: deps.options.environment?.waterHeaters || [],
          states: deps.deviceStates,
          enabled: isNasOverlayEnabled,
          sizeScale: nasSizeScale,
          brightness: nasBrightnessScale,
        });
      for (const statusGenericDeviceKind of GENERIC_DEVICE_KINDS2)
        deps.entries[statusGenericDeviceKind].sync({
          root: modelRoot3,
          revision: sceneRevision3,
          bindings: deps.collectGenericDeviceBindings(statusGenericDeviceKind),
          states: deps.deviceStates,
          enabled: isNasOverlayEnabled,
          sizeScale: nasSizeScale,
          brightness: nasBrightnessScale,
        });
    }
  }

export function syncEnvironmentLayersCore(deps: StageLayersSyncDeps) {
    if (deps.startupProgress === 0) return;
    const modelRoot4 = deps.mountOptions.modelRoot,
      sceneRevision4 = deps.mountOptions.sceneRevision,
      environmentRevision = deps.mountOptions.environmentRevision ?? sceneRevision4,
      document3 = deps.mountOptions.document;
    (!deps.environmentSyncSnapshot ||
      deps.environmentSyncSnapshot.root !== modelRoot4 ||
      deps.environmentSyncSnapshot.revision !== sceneRevision4 ||
      deps.environmentSyncSnapshot.environmentRevision !== environmentRevision ||
      deps.environmentSyncSnapshot.source !== document3 ||
      deps.environmentSyncSnapshot.config !== deps.options ||
      deps.environmentSyncSnapshot.states !== deps.deviceStates) &&
      (deps.speakerRings.sync({
        root: modelRoot4,
        revision: sceneRevision4,
        bindings: deps.collectSpeakerBindings(),
        states: deps.deviceStates,
      }),
      deps.carCharging.sync({
        root: modelRoot4,
        revision: environmentRevision,
        retainedRoots: deps.mountOptions.retainedModelRoots || [],
        bindings: deps.options.devices?.cars || [],
        states: deps.deviceStates,
      }),
      deps.airerMotion.sync({
        root: modelRoot4,
        revision: environmentRevision,
        bindings: deps.collectCoverBindings().filter((airerSyncBinding: any) => airerSyncBinding.airer),
        states: deps.deviceStates,
      }),
      deps.fanMotion.sync({
        root: modelRoot4,
        revision: environmentRevision,
        bindings: deps.options.environment?.fans || [],
        states: deps.deviceStates,
      }),
      (deps.environmentSyncSnapshot = {
        root: modelRoot4,
        revision: sceneRevision4,
        environmentRevision: environmentRevision,
        source: document3,
        config: deps.options,
        states: deps.deviceStates,
      }));
    const focusedModelKey =
      deps.activeModule !== "light" && !deps.isAwaitingFloorViewAdjust && !deps.isRangeEditorOpen
        ? deps.isEditing
          ? deps.text
          : deps.focusedItemId
        : "";
    (deps.televisionSyncSnapshot?.root === modelRoot4 &&
      deps.televisionSyncSnapshot.revision === sceneRevision4 &&
      deps.televisionSyncSnapshot.config === deps.options &&
      deps.televisionSyncSnapshot.states === deps.deviceStates &&
      deps.televisionSyncSnapshot.focused === focusedModelKey &&
      deps.televisionSyncSnapshot.module === deps.activeModule) ||
      ((deps.televisionSyncSnapshot = {
        root: modelRoot4,
        revision: sceneRevision4,
        config: deps.options,
        states: deps.deviceStates,
        focused: focusedModelKey,
        module: deps.activeModule,
      }),
      deps.televisionScreens.sync({
        root: modelRoot4,
        revision: sceneRevision4,
        bindings: deps.collectTelevisionBindings(),
        states: deps.deviceStates,
        focusedModel: "",
        dimStrength: 0,
      }));
  }

export function syncLayoutMetricsCore(deps: StageLayersSyncDeps) {
    const stageBoundingRect = deps.element.getBoundingClientRect(),
      width2 = deps.mediaViewportSize?.width || stageBoundingRect.width,
      height = deps.mediaViewportSize?.height || stageBoundingRect.height;
    if (!(width2 > 0 && height > 0 && stageBoundingRect.width > 0 && stageBoundingRect.height > 0))
      return;
    ((deps.containerViewportSize = {
      width: stageBoundingRect.width,
      height: stageBoundingRect.height,
    }),
      (deps.mediaScale = stageBoundingRect.width / width2));
    const stageScaleY = stageBoundingRect.height / height,
      // 触控缩放用等比 fit，避免横向/纵向非均匀 stretch 造成 UI 变形。
      uniformMediaScale = Math.min(deps.mediaScale, stageScaleY),
      hasMediaViewport = !!deps.mediaViewportSize,
      isTouchScalingEnabled = typeof deps.mountOptions < "u" && hasMediaViewport,
      width3 = isTouchScalingEnabled ? width2 : stageBoundingRect.width,
      height2 = isTouchScalingEnabled ? height : stageBoundingRect.height,
      uiScaleX = hasMediaViewport ? uniformMediaScale : 1,
      uiScaleY = hasMediaViewport ? uniformMediaScale : 1;
    ((deps.value = hasMediaViewport
      ? {
          x: uiScaleX,
          y: uiScaleY,
          width: width2,
          height: height,
        }
      : null));
    const moduleTabStride = deps.configuredModuleKinds2.length * 50 + 6,
      navigationConfig = deps.options.navigation || {},
      normalizeNavigationScale = (navigationScaleConfig: any) =>
        Number.isFinite(navigationScaleConfig?.scale)
          ? Math.max(0.5, Math.min(10, navigationScaleConfig.scale))
          : 1,
      categoryScaleFactor = 2 * normalizeNavigationScale(navigationConfig.categories),
      floorScaleFactor = 2 * normalizeNavigationScale(navigationConfig.floors),
      navigationLayerHeight = deps.navigationLayerElement.offsetHeight || 36,
      floorTabsWidth = deps.floorTabsElement.offsetWidth || 80,
      floorTabsHeight = deps.floorTabsElement.offsetHeight || 120,
      toolbarHeight = deps.toolbarElement.offsetHeight || 30,
      lightPanelWidth = deps.lightPanelSection.offsetWidth || 360,
      lightPanelHeight = deps.lightPanelSection.offsetHeight || 400,
      speakerPanelReservedHeight = deps.speakerPanel.root.hidden
        ? lightPanelHeight
        : lightPanelHeight +
          Math.max(
            0,
            parseFloat(deps.getComputedStyle(deps.speakerPanel.root).maxHeight) -
              deps.speakerPanel.root.offsetHeight,
          );
    (deps.presentationLayerElement.style.setProperty("--i3d-presentation-width", width3 + "px"),
      deps.presentationLayerElement.style.setProperty("--i3d-presentation-height", height2 + "px"),
      deps.presentationLayerElement.style.setProperty("--i3d-touch-hit-width", 44 / uiScaleX + "px"),
      deps.presentationLayerElement.style.setProperty("--i3d-touch-hit-height", 44 / uiScaleY + "px"),
      deps.presentationLayerElement.style.setProperty("--i3d-media-canvas-width", width2 + "px"),
      deps.presentationLayerElement.style.setProperty("--i3d-media-canvas-height", height + "px"),
      deps.presentationLayerElement.style.setProperty("--i3d-media-scale-x", String(uiScaleX)),
      deps.presentationLayerElement.style.setProperty("--i3d-media-scale-y", String(uiScaleY)),
      deps.presentationLayerElement.style.setProperty(
        "--i3d-navigation-scale",
        String(categoryScaleFactor),
      ),
      deps.presentationLayerElement.style.setProperty("--i3d-floor-scale", String(floorScaleFactor)),


      deps.presentationLayerElement.style.setProperty(
        "--i3d-help-scale",
        String(Math.min(4, Math.max(1, 1 / Math.max(deps.mediaScale, 0.01)))),
      ));
    const placeNavigationGroup = (
        navigationTargetElement: any,
        placementConfig: any,
        placementPercentPair: any,
        placementCenterScale: any,
        placementSpanPx: any,
        placementItemPx: any,
      ) => {
        const groupSpanX = placementSpanPx * placementCenterScale,
          groupSpanY = placementItemPx * placementCenterScale,
          clampPercent = (percentCoordinateKey: any, percentFallback: any) =>
            Number.isFinite(placementConfig?.[percentCoordinateKey])
              ? Math.max(0, Math.min(100, placementConfig[percentCoordinateKey]))
              : percentFallback,
          max = Math.max(
            12 + groupSpanX / 2,
            Math.min(
              width3 - 12 - groupSpanX / 2,
              (width3 * clampPercent("x", placementPercentPair[0])) / 100,
            ),
          ),
          navigationTopPosition = Math.max(
            12 + groupSpanY / 2,
            Math.min(
              height2 - 12 - groupSpanY / 2,
              (height2 * clampPercent("y", placementPercentPair[1])) / 100,
            ),
          );
        return (
          (navigationTargetElement.style.left = max + "px"),
          (navigationTargetElement.style.top = navigationTopPosition + "px"),
          navigationTopPosition - groupSpanY / 2
        );
      },
      navigationBottomOffset = placeNavigationGroup(
        deps.navigationLayerElement,
        navigationConfig.categories,
        [50, 94],
        categoryScaleFactor,
        moduleTabStride,
        navigationLayerHeight,
      ),
      followOffsetClamp = Number.isFinite(navigationConfig.followOffset)
        ? Math.max(0, Math.min(300, navigationConfig.followOffset))
        : 16,
      toolbarThreshold = toolbarHeight * categoryScaleFactor,
      isToolbarAboveNavigation = navigationBottomOffset >= toolbarThreshold + 12;
    ((deps.toolbarElement.style.bottom = isToolbarAboveNavigation
      ? "calc(100% + " +
        Math.min(followOffsetClamp, navigationBottomOffset - toolbarThreshold - 12) /
          categoryScaleFactor +
        "px)"
      : "auto"),
      (deps.toolbarElement.style.top = isToolbarAboveNavigation ? "auto" : "calc(100% + 8px)"),
      placeNavigationGroup(
        deps.floorTabsElement,
        navigationConfig.floors,
        [96, 50],
        floorScaleFactor,
        floorTabsWidth,
        floorTabsHeight,
      ));
    const popupDefaultTop = Math.max(12, Math.min(height * 0.56 - 400, height - 812));
    deps.presentationLayerElement.style.setProperty(
      "--i3d-navigation-bottom",
      Math.max(12, navigationBottomOffset - 50 * categoryScaleFactor) + "px",
    );
    const us2 = deps.computePopupPlacement({
      width: width3,
      height: height2,
      panelWidth: lightPanelWidth,
      panelHeight: speakerPanelReservedHeight,
      defaultTop: popupDefaultTop,
      defaultScale: 2,
      settings: deps.options.popupLayout?.general,
    });
    (deps.lightPanelSection.style.setProperty("--i3d-control-top", us2.top + "px"),
      deps.lightPanelSection.style.setProperty("--i3d-control-scale", String(us2.scale)),
      (deps.lightPanelSection.style.right = us2.right + "px"),
      Object.assign(deps.presentationLayerElement.style, {
        width: width3 + "px",
        height: height2 + "px",
        transform: isTouchScalingEnabled
          ? "scale(" + uniformMediaScale + "," + uniformMediaScale + ")"
          : "none",
      }));
    const presentationUiSignature = JSON.stringify({
      fixedUi: hasMediaViewport,
      width: width3,
      height: height2,
      uiScaleX: uiScaleX,
      uiScaleY: uiScaleY,
    });
    (typeof deps.presentationUiSignatureCache < "u" &&
      presentationUiSignature !== deps.presentationUiSignatureCache &&
      ((deps.presentationUiSignatureCache = presentationUiSignature),
      postHostMessage({
        type: "presentation-ui",
        fixedUi: hasMediaViewport,
        width: width3,
        height: height2,
        uiScaleX: uiScaleX,
        uiScaleY: uiScaleY,
        sourceWidth: width2,
        sourceHeight: height,
      })),
      deps.cameraMotionSnapshot?.focused && (deps.cameraMotionSnapshot.targetInset = deps.computeFocusInset()),
      deps.panelDisplayMode &&
        deps.panelDisplayMode !== "panel" &&
        !deps.cameraMotionSnapshot &&
        ((deps.focusInset = deps.computeFocusInset()), deps.mountOptions.setFocusViewport(deps.focusInset)),
      deps.renderMarkerPositions(true));
  }

export function syncStageVisibilityCore(deps: StageLayersSyncDeps) {
    const isFloorMotionUnrevealed =
        deps.cameraMotionSnapshot?.owner === "floor" && !deps.cameraMotionSnapshot.markersRevealed,
      stageMarkerItems = deps.currentModuleBindings(),
      stageMarkersByIdMap = new Map(
        stageMarkerItems.map((stageMarkerEntry: any) => [stageMarkerEntry.id, stageMarkerEntry]),
      ),
      some =
        !deps.isEditing &&
        !deps.isAwaitingFloorViewAdjust &&
        stageMarkerItems.some(
          (visibilityMarker: any) =>
            visibilityMarker.visible !== false &&
            visibilityMarker.buttonHidden !== true &&
            visibilityMarker.hiddenClickable === true,
        ),
      isStageConcealed =
        isFloorMotionUnrevealed ||
        deps.hasPendingStageRefresh ||
        deps.hasIdleIconActivity ||
        deps.isIdleIconHidden ||
        (deps.isUserActive && !some) ||
        (deps.isCameraRotating && deps.pageBehavior.hideIconsWhileRotating === true) ||
        !!(deps.panelDisplayMode && !["edit", "panel"].includes(deps.panelDisplayMode));
    for (const [stageMarkerId, stageMarkerElement] of deps.map) {
      const stageMarkerItem =
          stageMarkersByIdMap.get(stageMarkerId) || deps.findBindingById(stageMarkerId),
        isStageButtonHidden = !deps.isEditing && stageMarkerItem?.buttonHidden === true,
        isStageHiddenClickable =
          !deps.isEditing &&
          !deps.isAwaitingFloorViewAdjust &&
          !isStageButtonHidden &&
          stageMarkerItem?.hiddenClickable === true;
      stageMarkerElement.disabled =
        deps.cameraMotionSnapshot?.owner === "floor" ||
        isStageButtonHidden ||
        (!deps.isEditing && (deps.isOverviewOrAllFloors() || stageMarkerItem?.overviewQuip === true));
      const active =
          !deps.isEditing &&
          (stageMarkerItem?.passiveSensor ||
            (stageMarkerItem?.deviceKind === "vacuum" &&
              vacuumStatusPresentation2(stageMarkerItem, deps.deviceStates).active)),
        stageMarkerHostElement = active ? deps.vacuumWorkingLayerElement : deps.markerLayerElement;
      stageMarkerElement.parentElement !== stageMarkerHostElement &&
        stageMarkerHostElement.append(stageMarkerElement);
      const isStageMarkerIdleHidden =
        (isFloorMotionUnrevealed && active) ||
        (!active &&
          (deps.isUserActive || deps.isIdleIconHidden) &&
          !isStageHiddenClickable &&
          !deps.isEditing &&
          !deps.isAwaitingFloorViewAdjust);
      (stageMarkerElement.classList.toggle("is-hidden-clickable", isStageHiddenClickable),
        stageMarkerElement.classList.toggle("is-idle-hidden", isStageMarkerIdleHidden),
        isStageMarkerIdleHidden ||
        isStageButtonHidden ||
        (!deps.isEditing && (deps.isOverviewOrAllFloors() || stageMarkerItem?.overviewQuip === true))
          ? (deps.restoreFocusWithin(stageMarkerElement), stageMarkerElement.setAttribute("inert", ""))
          : stageMarkerElement.removeAttribute("inert"),
        (stageMarkerElement.title = isStageHiddenClickable
          ? ""
          : stageMarkerElement.getAttribute("aria-label") || ""));
    }
    (isStageConcealed
      ? (deps.restoreFocusWithin(
          deps.markerLayerElement,
          deps.lightPanelSection.classList.contains("is-open") ? deps.lightPanelSection : deps.canvasElement,
        ),
        deps.markerLayerElement.setAttribute("inert", ""))
      : deps.outgoingGhostAnimation
        ? deps.markerLayerElement.setAttribute("inert", "")
        : deps.markerLayerElement.removeAttribute("inert"),
      deps.markerLayerElement.removeAttribute("aria-hidden"),
      isStageConcealed && deps.lastInteractionMs === null
        ? (deps.lastInteractionMs = performance.now())
        : isStageConcealed || (deps.lastInteractionMs = null),
      deps.markerLayerElement.classList.toggle("is-floor-concealed", isFloorMotionUnrevealed),
      deps.markerLayerElement.classList.toggle("is-concealed", isStageConcealed));
  }
