import { HISTORY_FETCH_TIMEOUT_MS as HISTORY_FETCH_TIMEOUT_MS2, cacheHistorySeries as cacheHistorySeries2, historyRequestStillRelevant as historyRequestStillRelevant2, historySeriesCacheKey as historySeriesCacheKey2 } from "../panel-caches";
import { collectComponents as collectComponents2, collectEntityIds as collectEntityIds2, lineChartRuntimeStateNeedsHydration as lineChartRuntimeStateNeedsHydration2, syncedLineChartProperties as syncedLineChartProperties2 } from "../panel-document";
import { componentHostZIndex as componentHostZIndex2 } from "../geometry/effect-geometry";
import { isDocumentHidden } from "../renderer-helpers";
import { isEventLogWallDomain } from "../controls/event-log-runtime";
import { navigateInShell } from "@/studio/platform/shell-navigation";
import { renderRegisteredComponent as renderRegisteredComponent2, vacuumMapImageSource as vacuumMapImageSource2 } from "../registry";
import { vacuumMapAvailable as vacuumMapAvailable2 } from "../vacuum-map-state";
import type { PanelRenderer } from "../panel-renderer";

export function scheduleInteraction3dPrewarm(self: PanelRenderer) {
    (clearTimeout(self.stagePrewarmTimer ?? undefined),
      !(self.options?.editable || self.destroyed || !self.document?.pages) &&
        (self.stagePrewarmTimer = setTimeout(() => {
          if (
            ((self.stagePrewarmTimer = null),
            self.destroyed || self.retainedInteraction3d || !self.canvas?.isConnected)
          )
            return;
          if (window.HomeOSDisplayBoot?.pending || document.hidden) {
            self.scheduleInteraction3dPrewarm();
            return;
          }
          const sharedComponentMapById = new Map(
              (self.document.sharedComponents || []).map((sharedComponentDefinition: any) => [
                sharedComponentDefinition.id,
                sharedComponentDefinition,
              ]),
            ),
            pageComponentsWithShared = (sourcePageRecord: any) => [
              ...(sourcePageRecord.components || []),
              ...(sourcePageRecord.sharedComponentIds || [])
                .map((sharedComponentKey: any) => sharedComponentMapById.get(sharedComponentKey))
                .filter(Boolean),
            ];
          if (
            collectComponents2(
              pageComponentsWithShared(self.page),
              (interaction3dComponent) => interaction3dComponent.type === "interaction3d",
            ).length
          )
            return;
          const prewarmPageRecord = self.document.pages
            .filter((candidatePageRecord: any) => candidatePageRecord !== self.page)
            .flatMap(pageComponentsWithShared)
            .find(
              (interaction3dPageComponent: any) =>
                interaction3dPageComponent.type === "interaction3d" &&
                interaction3dPageComponent.style?.visible !== false &&
                interaction3dPageComponent.properties?.sceneId,
            );
          if (!prewarmPageRecord) return;
          self.prewarmingStageId = prewarmPageRecord.id;
          try {
            self.renderComponent(prewarmPageRecord, self.canvas);
          } finally {
            self.prewarmingStageId = null;
          }
          const prewarmHostElement = self.componentHosts.get(prewarmPageRecord.id);
          ((prewarmHostElement.inert = true),
            (prewarmHostElement.style.opacity = "0"),
            (prewarmHostElement.style.pointerEvents = "none"),
            prewarmHostElement.setAttribute("aria-hidden", "true"),
            (self.retainedInteraction3d = {
              component: structuredClone(prewarmPageRecord),
              host: prewarmHostElement,
              timer: null as any,
              prewarmed: true,
            }));
        }, 200)));
  }
export function releaseRetainedInteraction3d(self: PanelRenderer) {
    const retainedInteraction3d = self.retainedInteraction3d;
    retainedInteraction3d &&
      ((self.retainedInteraction3d = null),
      clearTimeout(retainedInteraction3d.timer),
      self.cleanupRenderedComponent(retainedInteraction3d.component.id),
      retainedInteraction3d.host.remove());
  }
export function cleanupRenderedComponent(self: PanelRenderer, cleanupTargetComponentId: any) {
    const componentCleanupCallbacks = self.componentCleanups.get(cleanupTargetComponentId) || [];
    self.componentCleanups.delete(cleanupTargetComponentId);
    for (const cleanupRunnable of componentCleanupCallbacks.splice(0)) cleanupRunnable();
  }
export function registerRuntimeStateHandler(self: PanelRenderer, stateHandlerEntityId: any,
    stateHandlerFunction: any,
    stateHandlerComponentId: any = null,) {
    const normalizedEntityId = String(stateHandlerEntityId || "");
    if (!normalizedEntityId || typeof stateHandlerFunction != "function") return;
    (self.runtimeStateHandlers.has(normalizedEntityId) ||
      self.runtimeStateHandlers.set(normalizedEntityId, new Set()),
      self.runtimeStateHandlers.get(normalizedEntityId).add(stateHandlerFunction));
    const unregisterStateHandler = () => {
      const entityStateHandlerSet = self.runtimeStateHandlers.get(normalizedEntityId);
      (entityStateHandlerSet?.delete(stateHandlerFunction),
        entityStateHandlerSet?.size === 0 && self.runtimeStateHandlers.delete(normalizedEntityId));
    };
    stateHandlerComponentId
      ? self.registerComponentCleanup(stateHandlerComponentId, unregisterStateHandler)
      : self.cleanups.push(unregisterStateHandler);
  }
export function registerHistoryChartRefresher(self: PanelRenderer, historyRefresherFunction: any, historyRefresherComponentId: any = null) {
    if (typeof historyRefresherFunction != "function") return;
    self.historyChartRefreshers.add(historyRefresherFunction);
    const deregisterHistoryRefresher = () =>
      self.historyChartRefreshers.delete(historyRefresherFunction);
    historyRefresherComponentId
      ? self.registerComponentCleanup(historyRefresherComponentId, deregisterHistoryRefresher)
      : self.cleanups.push(deregisterHistoryRefresher);
  }
export function applyRuntimeStateHandlers(self: PanelRenderer, handledEntityId: any, entityStateSnapshot: any) {
    for (const entityStateHandler of self.runtimeStateHandlers.get(String(handledEntityId || "")) ||
      [])
      entityStateHandler(entityStateSnapshot);
  }
export function pushEventLogWallEntries(self: PanelRenderer, handledEntityId: any, previousStateEntry: any, nextStateEntry: any) {
    if (!self.eventLogWallComponentIds.size || !isEventLogWallDomain(handledEntityId)) return;
    for (const eventLogWallComponentId of self.eventLogWallComponentIds) {
      const eventLogWallHostElement = self.componentHosts.get(eventLogWallComponentId);
      if (!eventLogWallHostElement?.isConnected) continue;
      const eventLogWallProperties =
        self.componentRecords.get(eventLogWallComponentId)?.properties || {};
      if (eventLogWallProperties.enabled === false) continue;
      if (
        String(eventLogWallProperties.watchScope || "auto") === "manual" &&
        !(
          Array.isArray(eventLogWallProperties.entityIds) &&
          eventLogWallProperties.entityIds.includes(handledEntityId)
        )
      )
        continue;
      eventLogWallHostElement
        .querySelector(".hb-event-log-wall")
        ?.pushEvent?.(handledEntityId, previousStateEntry, nextStateEntry);
    }
  }
export function runtimeEntityIdsForComponent(self: PanelRenderer, runtimeEntityComponent: any) {
    const runtimeEntityIdCollection = collectEntityIds2([
        {
          ...runtimeEntityComponent,
          children: [] as any[],
        },
      ]),
      boundEntityId = runtimeEntityComponent?.bindings?.entity?.entityId || "";
    if (boundEntityId) {
      runtimeEntityIdCollection.add(boundEntityId);
      const powerEntityId2 = self.powerEntityId(runtimeEntityComponent, boundEntityId);
      powerEntityId2 && runtimeEntityIdCollection.add(powerEntityId2);
      const resolvedDeviceProfile = self.deviceProfile(boundEntityId);
      for (const roleBindingEntityId of Object.values(
        resolvedDeviceProfile?.roles || {},
      ) as string[])
        roleBindingEntityId && runtimeEntityIdCollection.add(roleBindingEntityId);
    }
    return [...runtimeEntityIdCollection]
      .map((collectedEntityId) => String(collectedEntityId || ""))
      .filter(Boolean);
  }
export function indexRuntimeComponent(self: PanelRenderer, indexedComponent: any) {
    indexedComponent.type === "event-log-wall" &&
      indexedComponent.id &&
      self.eventLogWallComponentIds.add(indexedComponent.id);
    for (const indexedEntityId of self.runtimeEntityIdsForComponent(indexedComponent))
      (self.runtimeEntityComponentIndex.has(indexedEntityId) ||
        self.runtimeEntityComponentIndex.set(indexedEntityId, new Set()),
        self.runtimeEntityComponentIndex.get(indexedEntityId).add(indexedComponent.id));
  }
export function unindexRuntimeComponent(self: PanelRenderer, unindexedComponent: any) {
    self.eventLogWallComponentIds.delete(unindexedComponent);
    for (const [indexedEntityKey, componentIndexSet] of self.runtimeEntityComponentIndex)
      (componentIndexSet.delete(unindexedComponent),
        componentIndexSet.size || self.runtimeEntityComponentIndex.delete(indexedEntityKey));
  }
export function runtimeComponentContent(self: PanelRenderer, renderHostElement: any) {
    return (
      [...(renderHostElement?.children || [])].find(
        (componentChildElement) =>
          !componentChildElement.classList.contains("hb-component") &&
          !componentChildElement.classList.contains("hb-runtime-action-hitbox") &&
          !componentChildElement.classList.contains("hb-selection-bounds") &&
          !componentChildElement.classList.contains("hb-transform-handle"),
      ) || null
    );
  }
export function refreshRuntimeComponent(self: PanelRenderer, refreshComponentId: any) {
    const refreshComponentRecord = self.componentRecords.get(refreshComponentId),
      refreshHostElement = self.componentHosts.get(refreshComponentId);
    if (!refreshComponentRecord || !refreshHostElement || !refreshHostElement.isConnected) return;
    if (refreshComponentRecord.type === "interaction3d") {
      refreshHostElement
        .querySelector(".hb-interaction3d-host")
        ?.updateInteraction3d?.(refreshComponentRecord, self.document);
      return;
    }
    self.cleanupRenderedComponent(refreshComponentId);
    const refreshRenderOptions = {
        document: self.document,
        page: self.page,
        states: self.states,
        history: self.historySeries,
        entityMetadata: self.entityMetadata,
        deviceMetadata: self.deviceMetadata,
        entityTranslations: self.entityTranslations,
        renderNamespace: self.renderNamespace,
        editable: !!self.options.editable,
        liveMedia: self.options.liveMedia !== false,
        previewState: self.componentPreviewStates.get(refreshComponentId) || "auto",
        isIconVisible: (iconVisibilityEntityId: any) => self.iconVisibilityState(iconVisibilityEntityId),
        navigate: (navigationTargetPath: any) => self.navigate(navigationTargetPath),
        callEntityService: (...serviceCallArgs: [any, any, any, any?]) =>
          self.callEntityService(...serviceCallArgs),
        openCameraPreview: (interaction3dCameraRecord: any, cameraOptions: any, cameraCallback: any) =>
          self.openInteraction3dCameraPreview(
            interaction3dCameraRecord,
            cameraOptions,
            cameraCallback,
          ),
        openVacuumDetails: (vacuumComponentRecord: any, vacuumOptions: any, vacuumCallback: any) =>
          self.openInteraction3dVacuumDetails(vacuumComponentRecord, vacuumOptions, vacuumCallback),
        runVacuumRoom: (vacuumRoomRecord: any) =>
          self.dispatchAction(
            {
              id: refreshComponentRecord.id + ":room:" + vacuumRoomRecord.id,
              type: "device-button",
              properties: {
                label: vacuumRoomRecord.label,
              },
              bindings: {
                entity: {
                  entityId: vacuumRoomRecord.entityId,
                },
              },
            },
            {
              type: "toggle",
              data: {} as Record<string, any>,
            },
          ),
        onError: (renderErrorObject: any) => self.options.onError?.(renderErrorObject),
        openEntityDetails: (eventLogWallEntityId: any) => {
          const entityId = String(eventLogWallEntityId || "").trim();
          if (!entityId) return;
          navigateInShell(`/device?id=${encodeURIComponent(entityId)}`);
        },
        registerRuntimeStateHandler: (stateHandlerEntityKey: any, stateHandlerCallback: any) =>
          self.registerRuntimeStateHandler(
            stateHandlerEntityKey,
            stateHandlerCallback,
            refreshComponentId,
          ),
        runtimeStateReady: () => self.runtimeSnapshotReady === true,
        invalidate: () => self.refreshRuntimeComponent(refreshComponentId),
        cleanup: (refreshCleanupCallback: any) =>
          self.registerComponentCleanup(refreshComponentId, refreshCleanupCallback),
      },
      refreshedComponentElement = renderRegisteredComponent2(
        self.runtimePowerComponent(refreshComponentRecord),
        refreshRenderOptions,
      ),
      refreshCanvasScale = Number(self.document.canvas.componentScale || 1);
    refreshCanvasScale !== 1 &&
      ((refreshedComponentElement.style.width = 100 / refreshCanvasScale + "%"),
      (refreshedComponentElement.style.height = 100 / refreshCanvasScale + "%"),
      (refreshedComponentElement.style.transform = "scale(" + refreshCanvasScale + ")"),
      (refreshedComponentElement.style.transformOrigin = "top left"));
    const runtimeComponentContent = self.runtimeComponentContent(refreshHostElement);
    if (
      (runtimeComponentContent
        ? runtimeComponentContent.replaceWith(refreshedComponentElement)
        : refreshHostElement.prepend(refreshedComponentElement),
      refreshComponentRecord.type === "title-button" ||
        refreshComponentRecord.type === "light-statistics")
    ) {
      const actionHitboxElement = refreshHostElement.querySelector(
        ":scope > .hb-runtime-action-hitbox",
      );
      if (actionHitboxElement) {
        const lightStatisticsSelectionBounds =
          refreshComponentRecord.type === "light-statistics"
            ? self.updateLightStatisticsSelectionBounds(
                refreshHostElement,
                refreshComponentRecord,
                actionHitboxElement,
              )
            : self.updateTitleButtonSelectionBounds(
                refreshHostElement,
                refreshComponentRecord,
                actionHitboxElement,
              );
        actionHitboxElement.hidden = !lightStatisticsSelectionBounds;
      }
    }
    if (refreshComponentRecord.type === "light-statistics") {
      const refreshActionHitboxElement =
        self.componentSelectionOverlays
          .get(refreshComponentId)
          ?.querySelector(":scope > .hb-selection-bounds") ||
        refreshHostElement.querySelector(":scope > .hb-selection-bounds");
      (refreshActionHitboxElement &&
        (self.updateLightStatisticsSelectionBounds(
          refreshHostElement,
          refreshComponentRecord,
          refreshActionHitboxElement,
        ) ||
          Object.assign(refreshActionHitboxElement.style, {
            left: "0",
            top: "0",
            width: "100%",
            height: "100%",
          }),
        self.updateTransformHandleScale(
          refreshHostElement,
          refreshComponentRecord,
          refreshActionHitboxElement,
        )),
        self.refreshMultiSelectionBounds());
    }
  }
export function refreshEditorComponent(self: PanelRenderer, editorComponentId: any) {
    if (!self.options.editable) return false;
    const editorComponentRecord = self.componentRecords.get(editorComponentId),
      editorHostElement = self.componentHosts.get(editorComponentId);
    if (!editorComponentRecord || !editorHostElement?.isConnected) return false;
    const parentElement = editorHostElement.parentElement;
    if (!parentElement) return false;
    const baseZIndex =
      parentElement === self.canvas &&
      (self.page.sharedComponentIds || []).includes(editorComponentRecord.id)
        ? 100000
        : 0;
    if (editorComponentRecord.type === "interaction3d" || editorComponentRecord.type === "group")
      return (
        self.renderComponent(
          editorComponentRecord,
          parentElement,
          baseZIndex,
          new Map([[editorComponentRecord.id, editorHostElement]]),
        ),
        self.syncSelection(),
        true
      );
    if (editorComponentRecord.type === "floorplan-auto-diagram") {
      const wantsPreviewElement =
          editorComponentRecord.properties?.previewReady === true &&
          (editorComponentRecord.properties?.generated !== true ||
            editorComponentRecord.properties?.previewing === true),
        floorplanPreviewElement = editorHostElement.querySelector(
          ".hb-floorplan-auto-diagram-preview",
        );
      if (!!floorplanPreviewElement === wantsPreviewElement) {
        const editorPosition = editorComponentRecord.position || {},
          isFillLayout =
            parentElement === self.canvas &&
            editorComponentRecord.properties?.layoutMode === "fill",
          editorLayoutPosition = isFillLayout
            ? {
                ...editorPosition,
                x: 0,
                y: 0,
                width: Number(self.document.canvas?.width || 2778),
                height: Number(self.document.canvas?.height || 1940),
                rotation: 0,
              }
            : editorPosition,
          editorComponentScale = Math.max(
            0.01,
            Math.min(5, Number(editorComponentRecord.style?.scale || 1)),
          ),
          rawZIndex = baseZIndex + Number(editorLayoutPosition.zIndex || 1),
          componentZIndex = componentHostZIndex2(
            editorComponentRecord,
            rawZIndex,
            parentElement === self.canvas,
          );
        (Object.assign(editorHostElement.style, {
          left: (editorLayoutPosition.x || 0) + "px",
          top: (editorLayoutPosition.y || 0) + "px",
          width: (editorLayoutPosition.width || 100) + "px",
          height: (editorLayoutPosition.height || 100) + "px",
          zIndex: String(componentZIndex),
          transform:
            "rotate(" +
            (editorLayoutPosition.rotation || 0) +
            "deg) scale(" +
            (isFillLayout ? 1 : editorComponentScale) +
            ")",
        }),
          editorHostElement.style.setProperty("--hb-component-z", String(componentZIndex)),
          editorHostElement.classList.toggle("layout-fill", isFillLayout));
        const floorplanHintElement = editorHostElement.querySelector(
            ".hb-floorplan-auto-diagram-preview-hint",
          ),
          isViewMode = editorComponentRecord.properties?.interactionMode === "view";
        return (
          floorplanPreviewElement?.classList.toggle("is-view-mode", isViewMode),
          floorplanPreviewElement?.classList.toggle("is-position-mode", !isViewMode),
          floorplanHintElement &&
            (floorplanHintElement.textContent = isViewMode
              ? "拖动旋转 · 右键平移 · 滚轮缩放"
              : "拖动控件调整位置，右下角调整大小"),
          self.syncSelection(),
          self.updateTransformHandleScale(editorHostElement, editorComponentRecord),
          true
        );
      }
    }
    const nextSibling = editorHostElement.nextSibling;
    self.cleanupRenderedComponent(editorComponentId);
    for (const cameraCleanupFunction of self.cameraCleanups.get(editorComponentId)?.splice(0) || [])
      cameraCleanupFunction();
    (self.cameraCleanups.delete(editorComponentId),
      self.componentEffectLayers.get(editorComponentId)?.remove(),
      self.componentEffectLayers.delete(editorComponentId),
      self.componentAirflowLayers.get(editorComponentId)?.remove(),
      self.componentAirflowLayers.delete(editorComponentId),
      editorHostElement.remove(),
      self.renderComponent(editorComponentRecord, parentElement, baseZIndex));
    const relocatedHostElement = self.componentHosts.get(editorComponentId);
    return (
      relocatedHostElement &&
        nextSibling?.parentElement === parentElement &&
        parentElement.insertBefore(relocatedHostElement, nextSibling),
      self.syncSelection(),
      true
    );
  }
export function refreshRuntimeComponents(self: PanelRenderer, dirtyEntityIds: any) {
    const affectedComponentIdSet = new Set();
    for (const dirtyEntityId of dirtyEntityIds || [])
      for (const affectedComponentId of self.runtimeEntityComponentIndex.get(
        String(dirtyEntityId || ""),
      ) || [])
        affectedComponentIdSet.add(affectedComponentId);
    if (!affectedComponentIdSet.size) return;
    const runtimeRenderableTypeSet = new Set([
        "icon-button-effect",
        "icon-button",
        "device-button",
        "navigation-button",
        "air-conditioner",
        "scene-mode",
      ]),
      affectedEntityIdSet = new Set(
        [...affectedComponentIdSet].filter((renderableTypeComponentId) =>
          runtimeRenderableTypeSet.has(self.componentRecords.get(renderableTypeComponentId)?.type),
        ),
      );
    affectedEntityIdSet.size && self.updateOptimisticToggleVisuals("", affectedEntityIdSet);
    for (const renderableComponentKey of affectedComponentIdSet) {
      const renderableComponentRecord = self.componentRecords.get(renderableComponentKey);
      if (!(
        !renderableComponentRecord ||
        runtimeRenderableTypeSet.has(renderableComponentRecord.type) ||
        ["line-chart", "camera", "vacuum-map"].includes(renderableComponentRecord.type)
      )) {
        if (renderableComponentRecord.type === "flow-line") {
          self.componentHosts
            .get(renderableComponentKey)
            ?.querySelector(".hb-flow-line")
            ?.syncFlowLineState?.(
              self.states.get(renderableComponentRecord.bindings?.entity?.entityId),
            );
          continue;
        }
        self.refreshRuntimeComponent(renderableComponentKey);
      }
    }
  }
export function applyEditorComponentUpdates(self: PanelRenderer, updatedDocument: any, updatedPagePath: any, componentUpdates: any[] = []) {
    if (!self.options.editable || !self.document || !Array.isArray(componentUpdates)) return false;
    const validComponentUpdates = componentUpdates
      .map((componentUpdateEntry) => ({
        componentId: String(componentUpdateEntry?.componentId || ""),
        component: componentUpdateEntry?.component,
      }))
      .filter(
        (validComponentUpdate) =>
          validComponentUpdate.componentId && validComponentUpdate.component,
      );
    if (
      validComponentUpdates.length !== componentUpdates.length ||
      validComponentUpdates.some(
        ({ componentId: updatedComponentId, component: updatedComponentPayload }) => {
          const existingComponentRecord = self.componentRecords.get(updatedComponentId);
          return (
            !existingComponentRecord ||
            !self.componentHosts.get(updatedComponentId)?.isConnected ||
            existingComponentRecord.type !== updatedComponentPayload.type
          );
        },
      )
    )
      return false;
    const previousEntityIdSet = new Set();
    for (const { componentId: updatedComponentKey } of validComponentUpdates) {
      const updatedComponentRecord = self.componentRecords.get(updatedComponentKey);
      for (const componentEntityId of self.runtimeEntityIdsForComponent(updatedComponentRecord))
        previousEntityIdSet.add(componentEntityId);
    }
    ((self.document = updatedDocument),
      (self.page =
        self.document.pages?.find(
          (resolvedTargetPage: any) => resolvedTargetPage.path === updatedPagePath,
        ) ||
        self.document.pages?.find(
          (fallbackPageRecord: any) => fallbackPageRecord.path === self.document.defaultPagePath,
        ) ||
        self.document.pages?.[0] ||
        null));
    for (const {
      componentId: replacedComponentId,
      component: replacedComponentPayload,
    } of validComponentUpdates) {
      const replacedComponentRecord = self.componentRecords.get(replacedComponentId);
      self.unindexRuntimeComponent(replacedComponentId);
      const { children: childComponentList, ...componentRestPayload } = replacedComponentPayload;
      for (const staleComponentKey of Object.keys(replacedComponentRecord))
        delete replacedComponentRecord[staleComponentKey];
      (Object.assign(replacedComponentRecord, structuredClone(componentRestPayload)),
        childComponentList &&
          (replacedComponentRecord.children = childComponentList.map((childComponentDefinition: any) =>
            self.componentRecords.get(childComponentDefinition.id),
          )),
        self.indexRuntimeComponent(replacedComponentRecord));
    }
    const refreshedComponentIdSet = new Set(
      validComponentUpdates.map(({ componentId: refreshedComponentId }) => refreshedComponentId),
    );
    for (const { componentId: groupRefreshComponentId } of validComponentUpdates) {
      const groupComponentRecord = self.componentRecords.get(groupRefreshComponentId);
      if (groupComponentRecord.type === "group") {
        for (const nestedComponentRecord of collectComponents2(
          groupComponentRecord.children || [],
          (nestedComponentCandidate) =>
            ["icon-button-effect", "interaction3d", "floorplan-auto-diagram"].includes(
              nestedComponentCandidate.type!,
            ),
        ))
          refreshedComponentIdSet.add(nestedComponentRecord.id!);
      }
    }
    for (const refreshableComponentId of refreshedComponentIdSet)
      self.refreshEditorComponent(refreshableComponentId);
    self.syncSelection();
    const nextEntityIdSet = new Set();
    for (const { componentId: entityRefreshComponentId } of validComponentUpdates)
      for (const refreshedEntityId of self.runtimeEntityIdsForComponent(
        self.componentRecords.get(entityRefreshComponentId),
      ))
        nextEntityIdSet.add(refreshedEntityId);
    return (
      (previousEntityIdSet.size !== nextEntityIdSet.size ||
        [...previousEntityIdSet].some(
          (missingEntityId) => !nextEntityIdSet.has(missingEntityId),
        )) &&
        self.connectRuntime(),
      true
    );
  }
export function scheduleRuntimeRender(self: PanelRenderer, scheduledEntityId: any, renderDelayMs = 120) {
    self.destroyed ||
      !self.document ||
      !scheduledEntityId ||
      (self.runtimeRenderEntityIds.add(String(scheduledEntityId)),
      window.clearTimeout(self.runtimeRenderTimer),
      (self.runtimeRenderTimer = window.setTimeout(
        () => {
          self.runtimeRenderTimer = 0;
          const scheduledEntityIds = [...self.runtimeRenderEntityIds];
          (self.runtimeRenderEntityIds.clear(),
            self.destroyed || self.refreshRuntimeComponents(scheduledEntityIds));
        },
        Math.max(0, Number(renderDelayMs) || 0),
      )));
  }
export function refreshVacuumMapEntity(self: PanelRenderer, vacuumImageEntityId: any) {
    if (
      self.options.liveMedia === false ||
      !/^(image|camera)\./.test(String(vacuumImageEntityId || ""))
    )
      return;
    const vacuumImageState = self.states.get(vacuumImageEntityId),
      vacuumImageSource = vacuumMapImageSource2(vacuumImageEntityId, vacuumImageState);
    let hasHandledVacuumImage = false;
    for (const [vacuumComponentId, vacuumRuntimeComponentRecord] of self.componentRecords) {
      if (
        vacuumRuntimeComponentRecord.type !== "vacuum-map" ||
        vacuumRuntimeComponentRecord.bindings?.entity?.entityId !== vacuumImageEntityId
      )
        continue;
      const vacuumImageElement = self.componentHosts
        .get(vacuumComponentId)
        ?.querySelector(".hb-vacuum-map-image");
      vacuumImageElement &&
        ((hasHandledVacuumImage = true), vacuumImageElement.hbSyncVacuumMap?.());
    }
    !hasHandledVacuumImage &&
      vacuumImageEntityId.startsWith("image.") &&
      vacuumMapAvailable2(vacuumImageState) &&
      self.options.liveMedia !== false &&
      self.vacuumMapEntityIds.has(vacuumImageEntityId) &&
      self.runtimeVacuumMapImagePreloader.enqueue(vacuumImageSource);
  }
export function disconnectRuntime(self: PanelRenderer) {
    (self.pauseRuntimeFlowLines(),
      (self.socketGeneration += 1),
      window.clearTimeout(self.reconnectTimer!),
      (self.reconnectTimer = null),
      window.clearTimeout(self.runtimeHydrationRetryTimer!),
      (self.runtimeHydrationRetryTimer = null));
    const socket = self.socket;
    if (
      ((self.socket = null),
      (self.runtimeSubscription = null),
      !socket || socket.readyState >= WebSocket.CLOSING)
    )
      return;
    if (socket!.readyState !== WebSocket.CONNECTING) {
      socket!.close();
      return;
    }
    let socketReconnectTimerId: any;
    const handleSocketClose = () => {
        (window.clearTimeout(socketReconnectTimerId),
          socket!.removeEventListener("open", handleSocketOpen),
          socket!.removeEventListener("close", handleSocketClose));
      },
      handleSocketOpen = () => {
        (handleSocketClose(), socket!.readyState < WebSocket.CLOSING && socket!.close());
      };
    (socket!.addEventListener("open", handleSocketOpen, {
      once: true,
    }),
      socket!.addEventListener("close", handleSocketClose, {
        once: true,
      }),
      (socketReconnectTimerId = window.setTimeout(handleSocketOpen, 12000)));
  }
export function scheduleRuntimeHydrationRetry(self: PanelRenderer, subscription: any, socketGenerationValue: any) {
    const isSubscriptionActive = () => {
      const { entityIds: pendingEntityIds, runtimeComponents: pendingRuntimeComponents } =
          subscription,
        hydrationEntityIdSet = new Set(
          collectComponents2(
            pendingRuntimeComponents,
            (lineChartComponent) => lineChartComponent.type === "line-chart",
          )
            .map((componentWithEntity) =>
              String(componentWithEntity.bindings?.entity?.entityId || ""),
            )
            .filter(Boolean),
        );
      return (
        pendingEntityIds.filter(
          (hydrationEntityId: any) =>
            hydrationEntityIdSet.has(hydrationEntityId) &&
            lineChartRuntimeStateNeedsHydration2(self.states.get(hydrationEntityId)),
        ).length > 0
      );
    };
    if (!isSubscriptionActive()) {
      (window.clearTimeout(self.runtimeHydrationRetryTimer!),
        (self.runtimeHydrationRetryTimer = null),
        (self.runtimeHydrationRetryAttempt = 0));
      return;
    }
    if (self.runtimeHydrationRetryTimer || !(self.runtimeHydrationRetryAttempt < 5)) return;
    self.runtimeHydrationRetryAttempt += 1;
    const hydrationRetryDelayMs = Math.min(
      10000,
      500 * 2 ** (self.runtimeHydrationRetryAttempt - 1),
    );
    self.runtimeHydrationRetryTimer = window.setTimeout(() => {
      ((self.runtimeHydrationRetryTimer = null),
        socketGenerationValue === self.socketGeneration &&
          !self.destroyed &&
          (isSubscriptionActive()
            ? self.connectRuntime({
                force: true,
              })
            : (self.runtimeHydrationRetryAttempt = 0)));
    }, hydrationRetryDelayMs);
  }
export function refreshHistorySeries(self: PanelRenderer) {
    if (!self.document || self.destroyed || document.visibilityState === "hidden") return;
    const join = [
      self.historyDocumentGeneration,
      self.page?.path || "",
      self.activePopupId || "",
      self.historyPopupGeneration,
    ].join(":");
    return self.historyRefreshCoordinator.request(join, () => self.refreshHistorySeriesPass());
  }
export function scheduleHistoryRetry(self: PanelRenderer) {
    if (
      self.destroyed ||
      isDocumentHidden() ||
      self.historyRetryTimer ||
      self.historyRetryAttempt >= 4
    )
      return;
    const historyRetryAttempt = self.historyRetryAttempt,
      historyRetryDelayMs = Math.min(8000, 1000 * 2 ** historyRetryAttempt);
    ((self.historyRetryAttempt += 1),
      (self.historyRetryTimer = window.setTimeout(() => {
        ((self.historyRetryTimer = 0), self.refreshHistorySeries());
      }, historyRetryDelayMs)));
  }
export async function refreshHistorySeriesPass(self: PanelRenderer) {
    if (!self.document || self.destroyed || document.visibilityState === "hidden") return;
    const historyDocumentGeneration = self.historyDocumentGeneration,
      historyPopupGeneration = self.historyPopupGeneration,
      pagePathValue = self.page?.path || "",
      historyRequestByEntityId = new Map(),
      registerHistoryRequests = (components: any, requestDefaults: any) => {
        const historyComponents = collectComponents2(
          components,
          (historyComponentFilter) =>
            historyComponentFilter.type === "line-chart" ||
            historyComponentFilter.type === "presence-sensor",
        );
        for (const historyComponent of historyComponents) {
          const historyEntityId = historyComponent.bindings?.entity?.entityId;
          if (!historyEntityId) continue;
          const isPresenceComponent = historyComponent.type === "presence-sensor",
            minUpdateInterval = Math.max(
              30,
              Math.min(
                86400,
                Number(
                  isPresenceComponent ? 300 : historyComponent.properties?.updateInterval || 600,
                ),
              ),
            ),
            minHistoryHours = Math.max(
              1,
              Math.min(
                168,
                Number(
                  isPresenceComponent
                    ? historyComponent.properties?.historyHours || 24
                    : historyComponent.properties?.hours || 24,
                ),
              ),
            ),
            existingRequest = historyRequestByEntityId.get(historyEntityId);
          historyRequestByEntityId.set(historyEntityId, {
            interval: Math.min(existingRequest?.interval ?? minUpdateInterval, minUpdateInterval),
            hours: Math.max(existingRequest?.hours ?? minHistoryHours, minHistoryHours),
            documentGeneration: historyDocumentGeneration,
            shared: !!(existingRequest?.shared || requestDefaults.shared),
            pagePath: existingRequest?.pagePath ?? requestDefaults.pagePath ?? null,
            popupId: existingRequest?.popupId ?? requestDefaults.popupId ?? null,
            popupGeneration: historyPopupGeneration,
          });
        }
      };
    (registerHistoryRequests(self.document.sharedComponents || [], {
      shared: true,
    }),
      registerHistoryRequests(self.page?.components || [], {
        pagePath: pagePathValue,
      }));
    const historyPopupEntry = self.activePopupId
        ? (self.document.customPopups || []).find(
            (historyPopupModule: any) => String(historyPopupModule.id || "") === self.activePopupId,
          )
        : null,
      pendingHistoryRequests: any[] = [];
    for (const lineChartModule of historyPopupEntry?.modules || [])
      lineChartModule.type === "line-chart" &&
        lineChartModule.entityId &&
        pendingHistoryRequests.push({
          type: "line-chart",
          bindings: {
            entity: {
              entityId: lineChartModule.entityId,
            },
          },
          properties: syncedLineChartProperties2(
            self.document,
            self.page,
            lineChartModule.entityId,
            lineChartModule.properties,
          ),
        });
    registerHistoryRequests(pendingHistoryRequests, {
      popupId: self.activePopupId || null,
    });
    const requestTimestamp = Date.now();
    let hasHistoryChanged = false,
      shouldRetryHistory = false;
    self.historyRequestPolicy.retain(new Set(historyRequestByEntityId.keys()));
    const requestEntries = [...historyRequestByEntityId],
      getHistoryRequestSnapshot = () => ({
        documentGeneration: self.historyDocumentGeneration,
        pagePath: self.page?.path || "",
        popupId: self.activePopupId || null,
        popupGeneration: self.historyPopupGeneration,
      }),
      fetchHistorySeries = async () => {
        for (; requestEntries.length;) {
          const [shift2, shift3] = requestEntries.shift()!;
          if (
            self.destroyed ||
            isDocumentHidden() ||
            !historyRequestStillRelevant2(shift3, getHistoryRequestSnapshot()) ||
            !self.historyRequestPolicy.canRequest(shift2)
          )
            continue;
          const cachedSeries = self.historySeries.get(shift2),
            cachedSeriesEntry = self.historySeriesCache.get(
              historySeriesCacheKey2(shift2, shift3.hours),
            ),
            combinedSeries = [cachedSeries, cachedSeriesEntry]
              .filter(
                (seriesEntry) =>
                  seriesEntry &&
                  seriesEntry.hours === shift3.hours &&
                  Array.isArray(seriesEntry.points),
              )
              .sort(
                (seriesEntryA, seriesEntryB) => seriesEntryB.fetchedAt - seriesEntryA.fetchedAt,
              )[0];
          if (
            combinedSeries &&
            requestTimestamp - combinedSeries.fetchedAt < shift3.interval * 1000
          ) {
            cachedSeries !== combinedSeries &&
              (self.historySeries.set(shift2, combinedSeries), (hasHistoryChanged = true));
            continue;
          }
          if (self.historyFetches.has(shift2)) continue;
          self.historyFetches.add(shift2);
          const abortController =
            typeof AbortController == "function" ? new AbortController() : null;
          abortController && self.historyAbortControllers.add(abortController);
          const historyFetchTimer = window.setTimeout(
            () => abortController?.abort(),
            HISTORY_FETCH_TIMEOUT_MS2,
          );
          try {
            const historyResponse = await fetch(
              "/api/v1/ha/history?entityId=" +
                encodeURIComponent(shift2) +
                "&hours=" +
                shift3.hours,
              {
                credentials: "same-origin",
                headers: {
                  Accept: "application/json",
                },
                ...(abortController
                  ? {
                      signal: abortController.signal,
                    }
                  : {}),
              },
            );
            if (!historyResponse.ok) {
              if (
                !historyRequestStillRelevant2(shift3, getHistoryRequestSnapshot()) ||
                self.destroyed
              )
                continue;
              shouldRetryHistory =
                Number.isFinite(
                  self.historyRequestPolicy.failure(shift2, historyResponse.status),
                ) || shouldRetryHistory;
              continue;
            }
            const json = await historyResponse.json();
            if (
              self.destroyed ||
              isDocumentHidden() ||
              !historyRequestStillRelevant2(shift3, getHistoryRequestSnapshot())
            )
              continue;
            if (!Array.isArray(json.points)) throw new Error("历史数据格式异常");
            self.historyRequestPolicy?.success(shift2);
            const historySeriesOptions = {
              points: json.points,
              hours: shift3.hours,
              fetchedAt: Date.now(),
            };
            (self.historySeries.set(shift2, historySeriesOptions),
              cacheHistorySeries2(self.historySeriesCache, shift2, historySeriesOptions),
              (hasHistoryChanged = true));
          } catch (historyFetchError: any) {
            if (
              self.destroyed ||
              isDocumentHidden() ||
              abortController?.signal.reason === "lifecycle" ||
              !historyRequestStillRelevant2(shift3, getHistoryRequestSnapshot())
            )
              continue;
            (self.historyRequestPolicy.failure(shift2),
              historyFetchError?.name === "AbortError" &&
                window.HomeOSLog?.report!("warning", "网络请求", "历史曲线请求超时", {
                  entityId: shift2,
                  phase: "history-timeout",
                  path: "/api/v1/ha/history",
                  durationMs: HISTORY_FETCH_TIMEOUT_MS2,
                })!,
              (shouldRetryHistory = true));
          } finally {
            (window.clearTimeout(historyFetchTimer),
              self.historyFetches.delete(shift2),
              self.historyAbortControllers.delete(abortController!));
          }
        }
      };
    if (
      (await Promise.all(
        Array.from(
          {
            length: Math.min(2, requestEntries.length),
          },
          () => fetchHistorySeries(),
        ),
      ),
      shouldRetryHistory && !self.destroyed
        ? self.scheduleHistoryRetry()
        : (self.historyRetryAttempt = 0),
      hasHistoryChanged && !self.destroyed)
    ) {
      self.detailsStateSync?.refreshHistory?.();
      for (const historyChartRefresher of self.historyChartRefreshers) historyChartRefresher();
    }
  }