import { airflowLayerGeometry as airflowLayerGeometry2 } from "../geometry/transform-geometry";
import { coverComponentIsDream as coverComponentIsDream2, iconButtonEffectLightVisualAwaiting as iconButtonEffectLightVisualAwaiting2, renderAirConditionerAirflowLayer as renderAirConditionerAirflowLayer2, renderRegisteredComponent as renderRegisteredComponent2 } from "../registry";
import { coverMotorIsReversedForComponent as coverMotorIsReversedForComponent2, runtimeCoverStateIsActive as runtimeCoverStateIsActive2, runtimeEntityStateIsActive as runtimeEntityStateIsActive2 } from "../controls/cover-runtime";
import { effectFadeDuration as effectFadeDuration2 } from "../geometry/effect-geometry";
import { entityPowerIsOn as entityPowerIsOn2, optimisticToggleState as optimisticToggleState2 } from "../entity-power";
import type { PanelRenderer } from "../panel-renderer";

export function optimisticStateIsConfirmed(self: PanelRenderer, optimisticEntityId: any, optimisticInputPayload: any) {
    const pendingOptimisticState = self.pendingOptimisticStates.get(
      String(optimisticEntityId || ""),
    );
    if (!pendingOptimisticState) return true;
    if (Date.now() >= pendingOptimisticState.expiresAt)
      return (self.pendingOptimisticStates.delete(String(optimisticEntityId || "")), true);
    const matchingEffectComponent = [...self.componentRecords.values()].find(
      (effectComponentRecord) => {
        const componentEntityIdValue = effectComponentRecord.bindings?.entity?.entityId;
        return (
          componentEntityIdValue &&
          self.powerEntityId(effectComponentRecord, componentEntityIdValue) ===
            String(optimisticEntityId)
        );
      },
    );
    return entityPowerIsOn2(
      String(optimisticEntityId || ""),
      optimisticInputPayload?.newState || optimisticInputPayload,
      matchingEffectComponent || {},
    ) === pendingOptimisticState.desiredActive
      ? pendingOptimisticState.desiredActive === true &&
        matchingEffectComponent?.type === "icon-button-effect" &&
        iconButtonEffectLightVisualAwaiting2(matchingEffectComponent, {
          states: new Map([
            [
              String(optimisticEntityId || ""),
              optimisticInputPayload?.newState || optimisticInputPayload,
            ],
          ]),
        })
        ? false
        : (self.rememberLightVisualState?.(optimisticEntityId, optimisticInputPayload),
          self.pendingOptimisticStates.delete(String(optimisticEntityId || "")),
          true)
      : false;
  }
export function updateOptimisticToggleVisuals(self: PanelRenderer, optimisticToggleEntityId: any, componentIdFilterSet: any = null) {
    for (const [optimisticComponentId, optimisticComponentRecord] of self.componentRecords) {
      const optimisticEntityIdValue = optimisticComponentRecord.bindings?.entity?.entityId,
        powerEntityId3 = optimisticEntityIdValue
          ? self.powerEntityId(optimisticComponentRecord, optimisticEntityIdValue)
          : "";
      if (
        !optimisticEntityIdValue ||
        (componentIdFilterSet
          ? !componentIdFilterSet.has(optimisticComponentId)
          : powerEntityId3 !== optimisticToggleEntityId)
      )
        continue;
      if (optimisticComponentRecord.type === "scene-mode") {
        self.componentHosts
          .get(optimisticComponentId)
          ?.querySelector(".hb-scene-mode")
          ?.sceneModeController?.update(
            self.states.get(optimisticEntityIdValue),
            self.componentPreviewStates.get(optimisticComponentId) || "auto",
          );
        continue;
      }
      if (
        ![
          "icon-button-effect",
          "icon-button",
          "device-button",
          "navigation-button",
          "air-conditioner",
        ].includes(optimisticComponentRecord.type)
      )
        continue;
      const optimisticEntityState = self.states.get(powerEntityId3),
        startsWith = String(powerEntityId3 || "").startsWith("cover."),
        isCoverDream =
          startsWith &&
          coverComponentIsDream2(
            optimisticComponentRecord,
            powerEntityId3,
            optimisticEntityState,
            self.entityMetadata,
          ),
        runtimePowerComponent = self.runtimePowerComponent(
          optimisticComponentRecord,
          optimisticEntityIdValue,
        ),
        isActiveStateDesired = startsWith
          ? isCoverDream
            ? runtimeEntityStateIsActive2(optimisticEntityState)
            : runtimeCoverStateIsActive2(optimisticEntityState)
          : entityPowerIsOn2(powerEntityId3, optimisticEntityState, runtimePowerComponent),
        previewStateText = self.componentPreviewStates.get(optimisticComponentId) || "auto",
        isStateOptimistic =
          previewStateText === "on"
            ? true
            : previewStateText === "off"
              ? false
              : startsWith &&
                  coverMotorIsReversedForComponent2(
                    optimisticComponentRecord,
                    self.entityMetadata,
                    self.states,
                    powerEntityId3,
                  )
                ? !isActiveStateDesired
                : isActiveStateDesired,
        optimisticHostElement = self.componentHosts.get(optimisticComponentId);
      if (
        (self.cleanupRenderedComponent(optimisticComponentId),
        optimisticHostElement && optimisticComponentRecord.type === "icon-button-effect")
      ) {
        const existingEffectLayerElement = optimisticHostElement.querySelector(
            ":scope > .hb-icon-button-effect",
          ),
          effectLayerRenderOptions = {
            document: self.document,
            page: self.page,
            states: self.states,
            history: self.historySeries,
            entityMetadata: self.entityMetadata,
            deviceMetadata: self.deviceMetadata,
            entityTranslations: self.entityTranslations,
            renderNamespace: self.renderNamespace,
            editable: !!self.options.editable,
            editorWorkspace: self.options.editorWorkspace === true,
            liveMedia: self.options.liveMedia !== false,
            previewState: self.componentPreviewStates.get(optimisticComponentId) || "auto",
            isIconVisible: (iconVisibilityEntityKey: any) =>
              self.iconVisibilityState(iconVisibilityEntityKey),
            navigate: (navigationPathValue: any) => self.navigate(navigationPathValue),
            invalidate: () =>
              self.updateOptimisticToggleVisuals("", new Set([optimisticComponentId])),
            cleanup: (effectCleanupCallback: any) =>
              self.registerComponentCleanup(optimisticComponentId, effectCleanupCallback),
          },
          newEffectLayerElement = renderRegisteredComponent2(
            runtimePowerComponent,
            effectLayerRenderOptions,
          ),
          effectCanvasScale = Number(self.document.canvas.componentScale || 1);
        (effectCanvasScale !== 1 &&
          ((newEffectLayerElement.style.width = 100 / effectCanvasScale + "%"),
          (newEffectLayerElement.style.height = 100 / effectCanvasScale + "%"),
          (newEffectLayerElement.style.transform = "scale(" + effectCanvasScale + ")"),
          (newEffectLayerElement.style.transformOrigin = "top left")),
          existingEffectLayerElement
            ? existingEffectLayerElement.replaceWith(newEffectLayerElement)
            : optimisticHostElement.prepend(newEffectLayerElement));
      }
      if (
        optimisticHostElement &&
        ["icon-button", "device-button", "navigation-button"].includes(
          optimisticComponentRecord.type,
        )
      ) {
        const existingConditionerElement =
            optimisticComponentRecord.type === "navigation-button"
              ? optimisticHostElement.querySelector(":scope > .hb-navigation-button")
              : optimisticHostElement.querySelector(":scope > .hb-icon-button"),
          conditionerRenderOptions = {
            document: self.document,
            page: self.page,
            states: self.states,
            history: self.historySeries,
            entityMetadata: self.entityMetadata,
            deviceMetadata: self.deviceMetadata,
            entityTranslations: self.entityTranslations,
            renderNamespace: self.renderNamespace,
            editable: !!self.options.editable,
            editorWorkspace: self.options.editorWorkspace === true,
            liveMedia: self.options.liveMedia !== false,
            previewState: self.componentPreviewStates.get(optimisticComponentId) || "auto",
            isIconVisible: (conditionerIconEntityId: any) =>
              self.iconVisibilityState(conditionerIconEntityId),
            navigate: (conditionerNavigationPath: any) => self.navigate(conditionerNavigationPath),
            invalidate: () =>
              self.updateOptimisticToggleVisuals("", new Set([optimisticComponentId])),
            cleanup: (conditionerCleanupCallback: any) =>
              self.registerComponentCleanup(optimisticComponentId, conditionerCleanupCallback),
          },
          newConditionerElement = renderRegisteredComponent2(
            runtimePowerComponent,
            conditionerRenderOptions,
          ),
          conditionerCanvasScale = Number(self.document.canvas.componentScale || 1);
        if (
          (conditionerCanvasScale !== 1 &&
            ((newConditionerElement.style.width = 100 / conditionerCanvasScale + "%"),
            (newConditionerElement.style.height = 100 / conditionerCanvasScale + "%"),
            (newConditionerElement.style.transform = "scale(" + conditionerCanvasScale + ")"),
            (newConditionerElement.style.transformOrigin = "top left")),
          existingConditionerElement
            ? existingConditionerElement.replaceWith(newConditionerElement)
            : optimisticHostElement.prepend(newConditionerElement),
          optimisticComponentRecord.type === "device-button")
        ) {
          const conditionerActionHitboxElement = optimisticHostElement.querySelector(
            ":scope > .hb-runtime-action-hitbox",
          );
          conditionerActionHitboxElement &&
            (conditionerActionHitboxElement.hidden = !self.updateDeviceButtonSelectionBounds(
              optimisticHostElement,
              optimisticComponentRecord,
              conditionerActionHitboxElement,
            ));
        }
      }
      if (optimisticHostElement && optimisticComponentRecord.type === "air-conditioner") {
        const airflowRenderOptions = {
            document: self.document,
            page: self.page,
            states: self.states,
            history: self.historySeries,
            entityMetadata: self.entityMetadata,
            deviceMetadata: self.deviceMetadata,
            entityTranslations: self.entityTranslations,
            renderNamespace: self.renderNamespace,
            editable: !!self.options.editable,
            editorWorkspace: self.options.editorWorkspace === true,
            liveMedia: self.options.liveMedia !== false,
            previewState: self.componentPreviewStates.get(optimisticComponentId) || "auto",
            isIconVisible: (airflowIconEntityId: any) => self.iconVisibilityState(airflowIconEntityId),
            navigate: (airflowNavigationPath: any) => self.navigate(airflowNavigationPath),
            invalidate: () =>
              self.updateOptimisticToggleVisuals("", new Set([optimisticComponentId])),
            cleanup: (airflowCleanupCallback: any) =>
              self.registerComponentCleanup(optimisticComponentId, airflowCleanupCallback),
          },
          existingAirflowElement = optimisticHostElement.querySelector(
            ":scope > .hb-air-conditioner",
          ),
          newAirflowElement = renderRegisteredComponent2(
            runtimePowerComponent,
            airflowRenderOptions,
          ),
          airflowCanvasScale = Number(self.document.canvas.componentScale || 1);
        (airflowCanvasScale !== 1 &&
          ((newAirflowElement.style.width = 100 / airflowCanvasScale + "%"),
          (newAirflowElement.style.height = 100 / airflowCanvasScale + "%"),
          (newAirflowElement.style.transform = "scale(" + airflowCanvasScale + ")"),
          (newAirflowElement.style.transformOrigin = "top left")),
          existingAirflowElement
            ? existingAirflowElement.replaceWith(newAirflowElement)
            : optimisticHostElement.prepend(newAirflowElement),
          self.componentAirflowLayers.get(optimisticComponentId)?.remove(),
          self.componentAirflowLayers.delete(optimisticComponentId));
        const airflowLayerElement = renderAirConditionerAirflowLayer2(
          runtimePowerComponent,
          airflowRenderOptions,
        );
        if (airflowLayerElement) {
          const isAirflowGrouped = optimisticHostElement.parentElement !== self.canvas,
            airflowGeometry = airflowLayerGeometry2(optimisticComponentRecord, {
              grouped: isAirflowGrouped,
            }),
            airflowZIndex = Number(
              optimisticHostElement.style.getPropertyValue("--hb-component-z") ||
                optimisticComponentRecord.position?.zIndex ||
                1,
            );
          ((airflowLayerElement.dataset.airflowFor = optimisticComponentId),
            (airflowLayerElement.hidden = optimisticComponentRecord.style?.visible === false),
            Object.assign(airflowLayerElement.style, {
              left: airflowGeometry.left + "px",
              top: airflowGeometry.top + "px",
              width: airflowGeometry.width + "px",
              height: airflowGeometry.height + "px",
              zIndex: String(airflowZIndex),
              transform:
                "rotate(" + airflowGeometry.rotation + "deg) scale(" + airflowGeometry.scale + ")",
            }),
            isAirflowGrouped
              ? optimisticHostElement.append(airflowLayerElement)
              : self.canvas.insertBefore(airflowLayerElement, optimisticHostElement),
            self.componentAirflowLayers.set(optimisticComponentId, airflowLayerElement),
            self.options.editable &&
              self.selectedComponentIds.size === 1 &&
              self.selectedComponentId === optimisticComponentId &&
              self.componentSelectionLayers.get(optimisticComponentId) === "airflow" &&
              self.syncSelection());
        }
      }
      if (optimisticComponentRecord.type !== "icon-button-effect") continue;
      const componentEffectLayerElement = self.componentEffectLayers.get(optimisticComponentId);
      (self.syncEffectLayerLightVisual(optimisticComponentRecord, componentEffectLayerElement),
        self.setEffectLayerActive(
          componentEffectLayerElement,
          isStateOptimistic,
          effectFadeDuration2(optimisticComponentRecord),
        ));
    }
  }
export function applyOptimisticToggle(self: PanelRenderer, optimisticToggleTarget: any, optimisticComponent: any = null) {
    const optimisticEntityIdString = optimisticToggleTarget,
      powerEntityId4 = self.powerEntityId(optimisticComponent, optimisticEntityIdString),
      optimisticStateRecord = self.states.get(powerEntityId4),
      optimisticStatePayload = optimisticStateRecord?.newState ||
        optimisticStateRecord || {
          entityId: powerEntityId4,
          attributes: {} as Record<string, any>,
        },
      startsWith2 = String(powerEntityId4 || "").startsWith("cover."),
      isDreamCover =
        startsWith2 &&
        coverComponentIsDream2(
          optimisticComponent,
          powerEntityId4,
          optimisticStateRecord,
          self.entityMetadata,
        ),
      runtimePowerComponent2 = self.runtimePowerComponent(
        optimisticComponent,
        optimisticEntityIdString,
      ),
      isCoverOpen = !(startsWith2
        ? isDreamCover
          ? runtimeEntityStateIsActive2(optimisticStateRecord)
          : runtimeCoverStateIsActive2(optimisticStateRecord)
        : entityPowerIsOn2(powerEntityId4, optimisticStateRecord, runtimePowerComponent2)),
      coverTogglePayload = startsWith2
        ? {
            ...optimisticStatePayload,
            state: isCoverOpen ? "open" : "closed",
            ...(isDreamCover
              ? {}
              : {
                  attributes: {
                    ...(optimisticStatePayload.attributes || {}),
                    current_position: isCoverOpen ? 100 : 0,
                  },
                }),
          }
        : optimisticToggleState2(powerEntityId4, optimisticStatePayload, runtimePowerComponent2);
    if (isCoverOpen && String(powerEntityId4 || "").startsWith("light.")) {
      const cachedLightVisualState = self.cachedLightVisualState(powerEntityId4);
      cachedLightVisualState?.attributes &&
        (coverTogglePayload.attributes = {
          ...(coverTogglePayload.attributes || {}),
          ...cachedLightVisualState.attributes,
        });
    }
    const confirmedOptimisticState = optimisticStateRecord?.newState
        ? {
            ...optimisticStateRecord,
            newState: coverTogglePayload,
          }
        : coverTogglePayload,
      optimisticEntityKey = String(powerEntityId4 || ""),
      optimisticPendingRecord = {
        desiredActive: isCoverOpen,
        expiresAt: Date.now() + 8000,
      };
    self.pendingOptimisticStates.set(optimisticEntityKey, optimisticPendingRecord);
    const optimisticTimeoutId = window.setTimeout(() => {
      self.pendingOptimisticStates.get(optimisticEntityKey) === optimisticPendingRecord &&
        (self.pendingOptimisticStates.delete(optimisticEntityKey),
        self.states.get(powerEntityId4) === confirmedOptimisticState &&
          (optimisticStateRecord === undefined
            ? self.states.delete(powerEntityId4)
            : self.states.set(powerEntityId4, optimisticStateRecord),
          self.updateOptimisticToggleVisuals(powerEntityId4)));
    }, 8000);
    return (
      self.states.set(powerEntityId4, confirmedOptimisticState),
      self.updateOptimisticToggleVisuals(powerEntityId4),
      () => {
        (window.clearTimeout(optimisticTimeoutId),
          self.pendingOptimisticStates.get(optimisticEntityKey) === optimisticPendingRecord &&
            self.pendingOptimisticStates.delete(optimisticEntityKey),
          self.states.get(powerEntityId4) === confirmedOptimisticState &&
            (optimisticStateRecord === undefined
              ? self.states.delete(powerEntityId4)
              : self.states.set(powerEntityId4, optimisticStateRecord),
            self.updateOptimisticToggleVisuals(powerEntityId4)));
      }
    );
  }