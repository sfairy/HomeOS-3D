import type { PanelRenderer } from "../panel-renderer";
import { airflowLayerGeometry as airflowLayerGeometry2 } from "../geometry/transform-geometry";
import { componentHostZIndex as componentHostZIndex2, effectCropRectangle as effectCropRectangle2, effectCroppedLayerGeometry as effectCroppedLayerGeometry2, effectFadeDuration as effectFadeDuration2, effectReferenceImageTransform as effectReferenceImageTransform2, effectSourceDimensions as effectSourceDimensions2, normalizeIconButtonEffectComponent as normalizeIconButtonEffectComponent2 } from "../geometry/effect-geometry";
import { componentSupportsAction } from "../renderer-helpers";
import { navigateInShell } from "@/studio/platform/shell-navigation";
import { renderAirConditionerAirflowLayer as renderAirConditionerAirflowLayer2, renderIconButtonEffectLayer as renderIconButtonEffectLayer2, renderRegisteredComponent as renderRegisteredComponent2 } from "../registry";

export function renderComponent(this: PanelRenderer, 
    renderComponentRecord: any,
    renderParentElement = this.canvas,
    baseRenderZIndex = 0,
    componentIdToHostMap: any = null,
    componentIdToEffectHostMap: any = null,
  ) {
    const normalizedEffectComponent = normalizeIconButtonEffectComponent2(renderComponentRecord),
      runtimePowerComponent3 = this.runtimePowerComponent(normalizedEffectComponent),
      floorplanDiagramHostElement = [
        "camera",
        "vacuum-map",
        "floorplan-auto-diagram",
        "interaction3d",
        "group",
      ].includes(renderComponentRecord.type)
        ? componentIdToHostMap?.get(renderComponentRecord.id)
        : null;
    if (floorplanDiagramHostElement) {
      const autoDiagramPosition = renderComponentRecord.position || {},
        includes =
          renderParentElement === this.canvas &&
          ["floorplan-auto-diagram", "interaction3d"].includes(renderComponentRecord.type) &&
          renderComponentRecord.properties?.layoutMode === "fill",
        autoDiagramLayout = includes
          ? {
              ...autoDiagramPosition,
              x: 0,
              y: 0,
              width: Number(this.document.canvas?.width || 2778),
              height: Number(this.document.canvas?.height || 1940),
              rotation: 0,
            }
          : autoDiagramPosition,
        autoDiagramScale = Math.max(
          0.01,
          Math.min(5, Number(renderComponentRecord.style?.scale || 1)),
        ),
        autoDiagramZIndex = baseRenderZIndex + Number(autoDiagramLayout.zIndex || 1);
      if (
        (Object.assign(floorplanDiagramHostElement.style, {
          left: (autoDiagramLayout.x || 0) + "px",
          top: (autoDiagramLayout.y || 0) + "px",
          width: (autoDiagramLayout.width || 100) + "px",
          height: (autoDiagramLayout.height || 100) + "px",
          zIndex: String(autoDiagramZIndex),
          transform:
            "rotate(" +
            (autoDiagramLayout.rotation || 0) +
            "deg) scale(" +
            (includes ? 1 : autoDiagramScale) +
            ")",
        }),
        floorplanDiagramHostElement.style.setProperty(
          "--hb-component-z",
          String(autoDiagramZIndex),
        ),
        (floorplanDiagramHostElement.hidden = renderComponentRecord.style?.visible === false),
        floorplanDiagramHostElement.classList.toggle("layout-fill", includes),
        renderComponentRecord.type === "interaction3d" &&
          floorplanDiagramHostElement
            .querySelector(".hb-interaction3d-host")
            ?.updateInteraction3d?.(renderComponentRecord, this.document),
        renderComponentRecord.type === "floorplan-auto-diagram")
      ) {
        const isDiagramViewMode = renderComponentRecord.properties?.interactionMode === "view",
          diagramPreviewElement = floorplanDiagramHostElement.querySelector(
            ".hb-floorplan-auto-diagram-preview",
          ),
          diagramPreviewHintElement = floorplanDiagramHostElement.querySelector(
            ".hb-floorplan-auto-diagram-preview-hint",
          );
        (diagramPreviewElement?.classList.toggle("is-view-mode", isDiagramViewMode),
          diagramPreviewElement?.classList.toggle("is-position-mode", !isDiagramViewMode),
          diagramPreviewHintElement &&
            (diagramPreviewHintElement.textContent = isDiagramViewMode
              ? "拖动旋转 · 右键平移 · 滚轮缩放"
              : "拖动控件调整位置，右下角调整大小"));
      }
      (this.componentHosts.set(renderComponentRecord.id, floorplanDiagramHostElement),
        this.componentRecords.set(renderComponentRecord.id, renderComponentRecord));
      const hostParentComponentId = renderParentElement?.dataset?.componentId;
      (hostParentComponentId &&
        this.componentParentIds.set(renderComponentRecord.id, hostParentComponentId),
        this.indexRuntimeComponent(renderComponentRecord),
        floorplanDiagramHostElement.parentElement !== renderParentElement &&
          renderParentElement.append(floorplanDiagramHostElement));
      return;
    }
    const componentHostElement = document.createElement("div");
    ((componentHostElement.className =
      "hb-component hb-component-" + renderComponentRecord.type.replace(/[^a-z0-9_-]/gi, "-")),
      (componentHostElement.dataset.componentId = renderComponentRecord.id));
    const componentPosition = renderComponentRecord.position || {},
      isFillLayoutMode =
        renderParentElement === this.canvas &&
        ["image", "floorplan-auto-diagram", "interaction3d"].includes(renderComponentRecord.type) &&
        renderComponentRecord.properties?.layoutMode === "fill",
      componentLayout = isFillLayoutMode
        ? {
            ...componentPosition,
            x: 0,
            y: 0,
            width: Number(this.document.canvas?.width || 2778),
            height: Number(this.document.canvas?.height || 1940),
            rotation: 0,
          }
        : componentPosition,
      componentScaleValue = Math.max(
        0.01,
        Math.min(5, Number(renderComponentRecord.style?.scale || 1)),
      ),
      componentHostZIndex = baseRenderZIndex + Number(componentLayout.zIndex || 1),
      resolvedHostZIndex = componentHostZIndex2(
        renderComponentRecord,
        componentHostZIndex,
        renderParentElement === this.canvas,
      );
    (Object.assign(componentHostElement.style, {
      left: (componentLayout.x || 0) + "px",
      top: (componentLayout.y || 0) + "px",
      width: (componentLayout.width || 100) + "px",
      height: (componentLayout.height || 100) + "px",
      zIndex: String(resolvedHostZIndex),
      transform:
        "rotate(" +
        (componentLayout.rotation || 0) +
        "deg) scale(" +
        (isFillLayoutMode ? 1 : componentScaleValue) +
        ")",
    }),
      componentHostElement.style.setProperty("--hb-component-z", String(resolvedHostZIndex)),
      (componentHostElement.hidden = renderComponentRecord.style?.visible === false),
      renderComponentRecord.type === "flow-line" &&
        !this.options.editable &&
        (componentHostElement.style.pointerEvents = "none"),
      renderComponentRecord.type === "icon-button-effect" &&
        renderComponentRecord.properties?.buttonVisible === false &&
        renderComponentRecord.properties?.hiddenContentClickable !== true &&
        !this.options.editable &&
        (componentHostElement.style.pointerEvents = "none"),
      componentHostElement.classList.toggle("layout-fill", isFillLayoutMode),
      this.componentHosts.set(renderComponentRecord.id, componentHostElement),
      this.componentRecords.set(renderComponentRecord.id, renderComponentRecord));
    const nestedParentComponentId = renderParentElement?.dataset?.componentId;
    (nestedParentComponentId &&
      this.componentParentIds.set(renderComponentRecord.id, nestedParentComponentId),
      this.indexRuntimeComponent(renderComponentRecord));
    const componentLayerOptions = {
      document: this.document,
      page: this.page,
      states: this.states,
      history: this.historySeries,
      entityMetadata: this.entityMetadata,
      deviceMetadata: this.deviceMetadata,
      entityTranslations: this.entityTranslations,
      renderNamespace: this.renderNamespace,
      editable: !!this.options.editable,
      liveMedia: this.options.liveMedia !== false,
      previewState: this.componentPreviewStates.get(renderComponentRecord.id) || "auto",
      prewarmStage: this.prewarmingStageId === renderComponentRecord.id,
      isIconVisible: (visibilityEntityId: any) => this.iconVisibilityState(visibilityEntityId),
      navigate: (componentNavigationPath: any) => this.navigate(componentNavigationPath),
      callEntityService: (...serviceCallParameters: [any, any, any, any?]) =>
        this.callEntityService(...serviceCallParameters),
      openCameraPreview: (cameraPreviewComponent: any, cameraPreviewWidth: any, cameraPreviewHeight: any) =>
        this.openInteraction3dCameraPreview(
          cameraPreviewComponent,
          cameraPreviewWidth,
          cameraPreviewHeight,
        ),
      openVacuumDetails: (vacuumDetailsComponent: any, vacuumDetailsWidth: any, vacuumDetailsHeight: any) =>
        this.openInteraction3dVacuumDetails(
          vacuumDetailsComponent,
          vacuumDetailsWidth,
          vacuumDetailsHeight,
        ),
      runVacuumRoom: (vacuumRoomEntry: any) =>
        this.dispatchAction(
          {
            id: renderComponentRecord.id + ":room:" + vacuumRoomEntry.id,
            type: "device-button",
            properties: {
              label: vacuumRoomEntry.label,
            },
            bindings: {
              entity: {
                entityId: vacuumRoomEntry.entityId,
              },
            },
          },
          {
            type: "toggle",
            data: {} as Record<string, any>,
          },
        ),
      onError: (actionErrorObject: any) => this.options.onError?.(actionErrorObject),
      openEntityDetails: (eventLogWallEntityId: any) => {
        const entityId = String(eventLogWallEntityId || "").trim();
        if (!entityId) return;
        navigateInShell(`/device?id=${encodeURIComponent(entityId)}`);
      },
      registerRuntimeStateHandler: (componentStateEntityId: any, componentStateHandler: any) =>
        this.registerRuntimeStateHandler(
          componentStateEntityId,
          componentStateHandler,
          renderComponentRecord.id,
        ),
      runtimeStateReady: () => this.runtimeSnapshotReady === true,
      invalidate: () => this.renderComponents(true),
      cleanup: (cleanupFunction: any) => {
        ["camera", "vacuum-map"].includes(renderComponentRecord.type)
          ? (this.cameraCleanups.has(renderComponentRecord.id) ||
              this.cameraCleanups.set(renderComponentRecord.id, []),
            this.cameraCleanups.get(renderComponentRecord.id).push(cleanupFunction))
          : this.registerComponentCleanup(renderComponentRecord.id, cleanupFunction);
      },
    };
    if (renderComponentRecord.type === "icon-button-effect") {
      const renderedEffectLayerElement = renderIconButtonEffectLayer2(
        runtimePowerComponent3,
        componentLayerOptions,
      );
      if (renderedEffectLayerElement) {
        const cachedEffectLayerElement =
            componentIdToEffectHostMap?.get(renderComponentRecord.id) || null,
          activeEffectStageElement = cachedEffectLayerElement || renderedEffectLayerElement,
          effectSourceImageElement = renderedEffectLayerElement.querySelector("img"),
          effectTargetImageElement = activeEffectStageElement.querySelector("img"),
          contains = renderedEffectLayerElement.classList.contains("active");
        if (cachedEffectLayerElement && effectTargetImageElement && effectSourceImageElement) {
          activeEffectStageElement.classList.toggle(
            "awaiting-light-visual",
            renderedEffectLayerElement.classList.contains("awaiting-light-visual"),
          );
          const effectSourceName = effectSourceImageElement.dataset.effectSource || "";
          if (effectSourceName) effectTargetImageElement.dataset.effectSource = effectSourceName;
          else {
            delete effectTargetImageElement.dataset.effectSource;
            const attribute = effectSourceImageElement.getAttribute("src");
            attribute && (effectTargetImageElement.src = attribute);
          }
          ((effectTargetImageElement.alt = effectSourceImageElement.alt),
            (effectTargetImageElement.draggable = false),
            (effectTargetImageElement.decoding = "async"),
            (effectTargetImageElement.style.objectFit = effectSourceImageElement.style.objectFit),
            (effectTargetImageElement.style.mixBlendMode =
              effectSourceImageElement.style.mixBlendMode));
          for (const datasetKeyName of [
            "effectOriginalWidth",
            "effectOriginalHeight",
            "effectCropX",
            "effectCropY",
            "effectCropWidth",
            "effectCropHeight",
          ])
            effectSourceImageElement.dataset[datasetKeyName] !== undefined
              ? (effectTargetImageElement.dataset[datasetKeyName] =
                  effectSourceImageElement.dataset[datasetKeyName])
              : delete effectTargetImageElement.dataset[datasetKeyName];
        }
        const effectProperties = runtimePowerComponent3.properties || {},
          effectCanvasWidth = Number(this.document.canvas?.width || 2778),
          effectCanvasHeight = Number(this.document.canvas?.height || 1940),
          isEffectFillLayout = effectProperties.effectLayoutMode === "fill",
          isGroupedComponent = renderParentElement !== this.canvas;
        ((activeEffectStageElement.dataset.effectFor = renderComponentRecord.id),
          (activeEffectStageElement.hidden = renderComponentRecord.style?.visible === false));
        const measureNaturalSize = () => {
          const effectSourceSize = effectSourceDimensions2(
              effectProperties,
              effectTargetImageElement,
              effectCanvasWidth,
              effectCanvasHeight,
            ),
            effectCropRect = effectCropRectangle2(effectTargetImageElement, effectSourceSize),
            effectScaleRecord =
              !isEffectFillLayout && !effectSourceSize.pendingNaturalSize
                ? effectReferenceImageTransform2(
                    this.page,
                    renderComponentRecord,
                    effectSourceSize.width,
                    effectSourceSize.height,
                    effectCanvasWidth,
                    effectCanvasHeight,
                  )
                : null,
            effectScaleValue = Math.max(
              0.01,
              Math.min(5, Number(effectProperties.effectScale || 1)),
            ),
            effectLayerScale = isEffectFillLayout
              ? Math.min(
                  effectCanvasWidth / effectSourceSize.width,
                  effectCanvasHeight / effectSourceSize.height,
                )
              : (effectScaleRecord?.scale || 1) * effectScaleValue,
            effectRotationDeg = isEffectFillLayout
              ? 0
              : Number(effectProperties.effectRotation || 0),
            effectLeftRatio = Number(effectProperties.effectLeft ?? 50) / 100,
            effectTopRatio = Number(effectProperties.effectTop ?? 50) / 100,
            effectCenterX = isEffectFillLayout
              ? effectCanvasWidth / 2
              : effectCanvasWidth * effectLeftRatio,
            effectCenterY = isEffectFillLayout
              ? effectCanvasHeight / 2
              : effectCanvasHeight * effectTopRatio,
            effectLayerGeometry = effectCroppedLayerGeometry2({
              centerX: effectCenterX,
              centerY: effectCenterY,
              originalWidth: effectSourceSize.width,
              originalHeight: effectSourceSize.height,
              cropX: effectCropRect.x,
              cropY: effectCropRect.y,
              cropWidth: effectCropRect.width,
              cropHeight: effectCropRect.height,
              scale: effectLayerScale,
              rotation: effectRotationDeg,
            });
          let effectLayerRect = effectLayerGeometry;
          if (isGroupedComponent) {
            const effectLayerCenterX = effectLayerGeometry.left + effectLayerGeometry.width / 2,
              effectLayerCenterY = effectLayerGeometry.top + effectLayerGeometry.height / 2,
              effectParentComponentId = renderParentElement?.dataset?.componentId,
              worldPointToComponentLocal = effectParentComponentId
                ? this.worldPointToComponentLocal(
                    effectParentComponentId,
                    effectLayerCenterX,
                    effectLayerCenterY,
                  )
                : {
                    x: effectLayerCenterX,
                    y: effectLayerCenterY,
                  },
              componentWorldTransform = effectParentComponentId
                ? this.componentWorldTransform(effectParentComponentId)
                : {
                    scale: 1,
                    rotation: 0,
                  };
            effectLayerRect = {
              ...effectLayerGeometry,
              left: worldPointToComponentLocal.x - effectLayerGeometry.width / 2,
              top: worldPointToComponentLocal.y - effectLayerGeometry.height / 2,
              scale: effectLayerGeometry.scale / Math.max(0.0001, componentWorldTransform.scale),
              rotation: effectLayerGeometry.rotation - componentWorldTransform.rotation,
            };
          }
          return (
            Object.assign(activeEffectStageElement.style, {
              left: effectLayerRect.left + "px",
              top: effectLayerRect.top + "px",
              width: effectLayerGeometry.width + "px",
              height: effectLayerGeometry.height + "px",
              visibility: effectSourceSize.pendingNaturalSize ? "hidden" : "",
              zIndex: String(isGroupedComponent ? componentHostZIndex - 0.1 : componentHostZIndex),
              transform:
                "rotate(" + effectLayerRect.rotation + "deg) scale(" + effectLayerRect.scale + ")",
            }),
            effectSourceSize
          );
        };
        (measureNaturalSize().pendingNaturalSize &&
          effectTargetImageElement &&
          effectTargetImageElement.addEventListener(
            "load",
            () => {
              activeEffectStageElement.isConnected && measureNaturalSize();
            },
            {
              once: true,
            },
          ),
          (isGroupedComponent
            ? renderParentElement
            : isEffectFillLayout
              ? this.canvas
              : renderParentElement
          ).append(activeEffectStageElement),
          this.componentEffectLayers.set(renderComponentRecord.id, activeEffectStageElement));
        const effectSourceValue = effectTargetImageElement?.dataset.effectSource || "";
        if (
          (effectSourceValue &&
            this.runtimeEffectImageLoader.enqueue(effectTargetImageElement, effectSourceValue, {
              active: contains,
            }),
          cachedEffectLayerElement)
        ) {
          const effectFilterStyle = effectSourceImageElement?.style.filter || "none",
            propertyValue = renderedEffectLayerElement.style.getPropertyValue(
              "--hb-effect-image-opacity",
            ),
            propertyValue2 = renderedEffectLayerElement.style.getPropertyValue(
              "--hb-effect-fade-duration",
            ),
            propertyValue3 = renderedEffectLayerElement.style.getPropertyValue(
              "--hb-effect-visual-transition-duration",
            ),
            opacity = renderedEffectLayerElement.style.opacity,
            transition = renderedEffectLayerElement.style.transition;
          (effectTargetImageElement?.offsetWidth,
            effectTargetImageElement && (effectTargetImageElement.style.filter = effectFilterStyle),
            (activeEffectStageElement.style.opacity = opacity),
            (activeEffectStageElement.style.transition = transition),
            activeEffectStageElement.style.setProperty("--hb-effect-image-opacity", propertyValue),
            activeEffectStageElement.style.setProperty("--hb-effect-fade-duration", propertyValue2),
            activeEffectStageElement.style.setProperty(
              "--hb-effect-visual-transition-duration",
              propertyValue3,
            ),
            this.setEffectLayerActive(
              activeEffectStageElement,
              contains,
              effectFadeDuration2(renderComponentRecord),
            ));
        }
      }
    }
    if (renderComponentRecord.type === "air-conditioner") {
      const airflowRenderLayerElement = renderAirConditionerAirflowLayer2(
        runtimePowerComponent3,
        componentLayerOptions,
      );
      if (airflowRenderLayerElement) {
        ((airflowRenderLayerElement.dataset.airflowFor = renderComponentRecord.id),
          (airflowRenderLayerElement.hidden = renderComponentRecord.style?.visible === false));
        const isAirflowLayerGrouped = renderParentElement !== this.canvas,
          airflowLayerRect = airflowLayerGeometry2(renderComponentRecord, {
            grouped: isAirflowLayerGrouped,
          });
        (Object.assign(airflowRenderLayerElement.style, {
          left: airflowLayerRect.left + "px",
          top: airflowLayerRect.top + "px",
          width: airflowLayerRect.width + "px",
          height: airflowLayerRect.height + "px",
          zIndex: String(componentHostZIndex),
          transform:
            "rotate(" + airflowLayerRect.rotation + "deg) scale(" + airflowLayerRect.scale + ")",
        }),
          (isAirflowLayerGrouped ? componentHostElement : renderParentElement).append(
            airflowRenderLayerElement,
          ),
          this.componentAirflowLayers.set(renderComponentRecord.id, airflowRenderLayerElement));
      }
    }
    const previousChartElement =
        renderComponentRecord.type === "group"
          ? (() => {
              const groupContainerElement = document.createElement("div");
              return (
                (groupContainerElement.className = "hb-group-container"),
                groupContainerElement
              );
            })()
          : renderRegisteredComponent2(runtimePowerComponent3, componentLayerOptions),
      chartCanvasComponentScale = Number(this.document.canvas.componentScale || 1);
    if (
      (chartCanvasComponentScale !== 1 &&
        ((previousChartElement.style.width = 100 / chartCanvasComponentScale + "%"),
        (previousChartElement.style.height = 100 / chartCanvasComponentScale + "%"),
        (previousChartElement.style.transform = "scale(" + chartCanvasComponentScale + ")"),
        (previousChartElement.style.transformOrigin = "top left")),
      componentHostElement.append(previousChartElement),
      renderComponentRecord.type === "line-chart")
    ) {
      let chartElement = previousChartElement;
      const refreshChartState = () => {
        if (!chartElement?.isConnected) return;
        const refreshedChartElement = renderRegisteredComponent2(
          runtimePowerComponent3,
          componentLayerOptions,
        );
        (chartCanvasComponentScale !== 1 &&
          ((refreshedChartElement.style.width = 100 / chartCanvasComponentScale + "%"),
          (refreshedChartElement.style.height = 100 / chartCanvasComponentScale + "%"),
          (refreshedChartElement.style.transform = "scale(" + chartCanvasComponentScale + ")"),
          (refreshedChartElement.style.transformOrigin = "top left")),
          chartElement.cleanupLineChartHover?.(),
          chartElement.replaceWith(refreshedChartElement),
          (chartElement = refreshedChartElement));
      };
      (this.registerRuntimeStateHandler(
        renderComponentRecord.bindings?.entity?.entityId,
        (chartStatePayload: any) => {
          (chartElement.syncLineChartState?.(chartStatePayload),
            chartElement.classList.contains("history-loading") && refreshChartState());
        },
        renderComponentRecord.id,
      ),
        this.registerHistoryChartRefresher(refreshChartState, renderComponentRecord.id));
    }
    if (this.options.editable)
      (componentHostElement.classList.add("editable"),
        componentHostElement.addEventListener("pointerdown", (componentMoveEvent) =>
          this.startComponentMove(componentMoveEvent, renderComponentRecord, componentHostElement),
        ));
    else {
      const call = Object.prototype.hasOwnProperty.call(renderComponentRecord.actions || {}, "tap"),
        runtimeActionOptions =
          renderComponentRecord.type === "camera" &&
          renderComponentRecord.bindings?.entity?.entityId &&
          !call
            ? {
                ...renderComponentRecord,
                actions: {
                  tap: {
                    type: "more-info",
                    data: {
                      popupSource: "current",
                    },
                  },
                  ...(renderComponentRecord.actions || {}),
                },
              }
            : renderComponentRecord;
      if (
        (renderComponentRecord.type === "light-statistics" &&
          componentHostElement.classList.add("hb-runtime-fitted-hit-area"),
        renderComponentRecord.type !== "scene-mode" &&
          Object.values(runtimeActionOptions.actions || {}).some((runtimeActionDefinition) =>
            componentSupportsAction(runtimeActionOptions, runtimeActionDefinition),
          ))
      ) {
        componentHostElement.classList.add("interactive");
        let runtimeActionHitboxElement: HTMLElement = componentHostElement;
        (["title-button", "device-button", "light-statistics"].includes(
          renderComponentRecord.type,
        ) &&
          ((runtimeActionHitboxElement = document.createElement("span")),
          (runtimeActionHitboxElement.className = "hb-runtime-action-hitbox"),
          runtimeActionHitboxElement.setAttribute("aria-hidden", "true"),
          componentHostElement.classList.add("hb-runtime-fitted-hit-area"),
          componentHostElement.append(runtimeActionHitboxElement)),
          this.bindRuntimeActions(runtimeActionHitboxElement, runtimeActionOptions));
      }
    }
    renderParentElement.append(componentHostElement);
    const runtimeHitboxElement = componentHostElement.querySelector<HTMLElement>(
      ":scope > .hb-runtime-action-hitbox",
    );
    if (runtimeHitboxElement) {
      const titleButtonSelectionBounds =
        renderComponentRecord.type === "title-button"
          ? this.updateTitleButtonSelectionBounds(
              componentHostElement,
              renderComponentRecord,
              runtimeHitboxElement,
            )
          : renderComponentRecord.type === "light-statistics"
            ? this.updateLightStatisticsSelectionBounds(
                componentHostElement,
                renderComponentRecord,
                runtimeHitboxElement,
              )
            : this.updateDeviceButtonSelectionBounds(
                componentHostElement,
                renderComponentRecord,
                runtimeHitboxElement,
              );
      runtimeHitboxElement.hidden = !titleButtonSelectionBounds;
    }
    for (const childComponentRecord of renderComponentRecord.children || [])
      this.renderComponent(
        childComponentRecord,
        componentHostElement,
        0,
        componentIdToHostMap,
        componentIdToEffectHostMap,
      );
  }
