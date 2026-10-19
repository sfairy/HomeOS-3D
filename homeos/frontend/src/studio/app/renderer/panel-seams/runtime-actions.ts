import type { ComponentPayload } from "../renderer-types";
import { randomUuid } from "../../shared/util/random-id";
import { componentSupportsAction } from "../renderer-helpers";
import { coverToggleServiceForComponent as coverToggleServiceForComponent2 } from "../controls/cover-runtime";
import { entityToggleCommand as entityToggleCommand2 } from "../entity-power";
import { isVirtualEntityId as isVirtualEntityId2 } from "../../shared/virtual-entities";
import type { PanelRenderer } from "../panel-renderer";

export function bindRuntimeActions(self: PanelRenderer, actionHostElement: any, actionOptions: any) {
    let tapTimeoutId: any = null,
      holdTimeoutId: any = null,
      moveTimeoutId: any = null,
      hasLongPressed = false,
      activePointerRecord: any = null,
      lastTapRecord: any = null,
      tapCooldownUntil = 0,
      optimisticRollbackHandler: any = null,
      optimisticPreviousState: any;
    const tap = componentSupportsAction(actionOptions, actionOptions.actions?.tap)
        ? actionOptions.actions.tap
        : null,
      doubleTap = componentSupportsAction(actionOptions, actionOptions.actions?.doubleTap)
        ? actionOptions.actions.doubleTap
        : null,
      hold = componentSupportsAction(actionOptions, actionOptions.actions?.hold)
        ? actionOptions.actions.hold
        : null,
      hasTapAction = !!(tap?.type && tap.type !== "none"),
      hasDoubleTapAction = !!(doubleTap?.type && doubleTap.type !== "none"),
      hasHoldAction = !!(hold?.type && hold.type !== "none"),
      cancelHoldTimer = () => {
        self.options.onRuntimeButtonPress?.(actionHostElement);
      },
      resetTapState = () => {
        if (optimisticRollbackHandler || tap?.type !== "toggle") return;
        const bindingEntityId = actionOptions.bindings?.entity?.entityId;
        bindingEntityId &&
          !isVirtualEntityId2(bindingEntityId) &&
          ((optimisticPreviousState = self.states.get(
            self.powerEntityId(actionOptions, bindingEntityId),
          )),
          (optimisticRollbackHandler = self.applyOptimisticToggle(bindingEntityId, actionOptions)));
      },
      clearTapTimers = () => {
        (optimisticRollbackHandler?.(),
          (optimisticRollbackHandler = null),
          (optimisticPreviousState = undefined));
      },
      resetPointerState = () => {
        const rollbackHandler = optimisticRollbackHandler,
          previousEntityState = optimisticPreviousState;
        ((optimisticRollbackHandler = null),
          (optimisticPreviousState = undefined),
          hasTapAction &&
            self.runAction(actionOptions, tap, {
              optimisticAlreadyApplied: !!rollbackHandler,
              optimisticRollback: rollbackHandler,
              optimisticPreviousState: previousEntityState,
            }));
      };
    // A3：键盘激活（Enter / Space）复用 click 的二择语义，避免与 pointer click 双触发。
    // 只有 role=button + 可聚焦（tabIndex>=0）的宿主才绑定，普通组件容器仍走 pointer。
    const isKeyboardActionHost = () =>
        actionHostElement.getAttribute("role") === "button" && actionHostElement.tabIndex >= 0,
      runKeyboardActivation = () => {
        ((hasTapAction || hasDoubleTapAction) && cancelHoldTimer(),
          hasDoubleTapAction
            ? (resetTapState(),
              window.clearTimeout(tapTimeoutId),
              (tapTimeoutId = window.setTimeout(() => {
                resetPointerState();
              }, 180)))
            : hasTapAction
              ? self.runAction(actionOptions, tap)
              : hasHoldAction && self.runAction(actionOptions, hold));
      },
      handleKeyboardActivation = (keyboardEvent: any) => {
        (keyboardEvent.repeat ||
          keyboardEvent.target !== actionHostElement ||
          !isKeyboardActionHost() ||
          (keyboardEvent.key !== "Enter" &&
            keyboardEvent.key !== " " &&
            keyboardEvent.key !== "Spacebar") ||
          (keyboardEvent.preventDefault(),
          keyboardEvent.stopPropagation(),
          (hasLongPressed = false),
          runKeyboardActivation()));
      };
    ((actionHostElement.style.touchAction = "manipulation"),
      actionHostElement.addEventListener("contextmenu", (menuPointerEvent: any) =>
        menuPointerEvent.preventDefault(),
      ),
      actionHostElement.addEventListener("selectstart", (selectStartEvent: any) =>
        selectStartEvent.preventDefault(),
      ),
      actionHostElement.addEventListener("dragstart", (dragStartEvent: any) =>
        dragStartEvent.preventDefault(),
      ),
      actionHostElement.addEventListener("pointerdown", (pointerDownEvent: any) => {
        ((hasLongPressed = false),
          (activePointerRecord = {
            pointerId: pointerDownEvent.pointerId,
            pointerType: pointerDownEvent.pointerType || "mouse",
            x: pointerDownEvent.clientX,
            y: pointerDownEvent.clientY,
            moved: false,
          }),
          hasHoldAction &&
            (moveTimeoutId = window.setTimeout(() => {
              ((hasLongPressed = true),
                (lastTapRecord = null),
                window.clearTimeout(holdTimeoutId),
                cancelHoldTimer(),
                self.runAction(actionOptions, hold));
            }, 400)));
      }));
    const clearLongPressTimer = () => window.clearTimeout(moveTimeoutId);
    (actionHostElement.addEventListener("pointermove", (pointerMoveEvent: any) => {
      !activePointerRecord ||
        activePointerRecord.pointerId !== pointerMoveEvent.pointerId ||
        Math.hypot(
          pointerMoveEvent.clientX - activePointerRecord.x,
          pointerMoveEvent.clientY - activePointerRecord.y,
        ) <= 18 ||
        ((activePointerRecord.moved = true), clearLongPressTimer());
    }),
      actionHostElement.addEventListener("pointerup", (pointerUpEvent: any) => {
        clearLongPressTimer();
        const activePointerState =
          activePointerRecord?.pointerId === pointerUpEvent.pointerId ? activePointerRecord : null;
        if (
          ((activePointerRecord = null),
          !activePointerState ||
            activePointerState.pointerType === "mouse" ||
            activePointerState.moved ||
            hasLongPressed)
        )
          return;
        (pointerUpEvent.preventDefault(),
          (tapCooldownUntil = performance.now() + 700),
          (hasTapAction || hasDoubleTapAction) && cancelHoldTimer());
        const currentTimeMs = performance.now();
        if (
          hasDoubleTapAction &&
          lastTapRecord &&
          currentTimeMs - lastTapRecord.time <= 180 &&
          Math.hypot(
            pointerUpEvent.clientX - lastTapRecord.x,
            pointerUpEvent.clientY - lastTapRecord.y,
          ) <= 34
        ) {
          (window.clearTimeout(holdTimeoutId),
            clearTapTimers(),
            (lastTapRecord = null),
            self.runAction(actionOptions, doubleTap));
          return;
        }
        ((lastTapRecord = {
          time: currentTimeMs,
          x: pointerUpEvent.clientX,
          y: pointerUpEvent.clientY,
        }),
          hasDoubleTapAction
            ? (resetTapState(),
              window.clearTimeout(holdTimeoutId),
              (holdTimeoutId = window.setTimeout(() => {
                (resetPointerState(), (lastTapRecord = null));
              }, 180)))
            : (hasTapAction && self.runAction(actionOptions, tap), (lastTapRecord = null)));
      }),
      actionHostElement.addEventListener("pointercancel", () => {
        (clearLongPressTimer(), (activePointerRecord = null));
      }),
      actionHostElement.addEventListener("click", () => {
        performance.now() < tapCooldownUntil ||
          hasLongPressed ||
          ((hasTapAction || hasDoubleTapAction) && cancelHoldTimer(),
          hasDoubleTapAction
            ? (resetTapState(),
              window.clearTimeout(tapTimeoutId),
              (tapTimeoutId = window.setTimeout(() => {
                resetPointerState();
              }, 180)))
            : hasTapAction && self.runAction(actionOptions, tap));
      }),
      actionHostElement.addEventListener("dblclick", () => {
        (window.clearTimeout(tapTimeoutId),
          clearTapTimers(),
          hasDoubleTapAction && self.runAction(actionOptions, doubleTap));
      }),
      actionHostElement.addEventListener("keydown", handleKeyboardActivation),
      self.cleanups.push(() => {
        (window.clearTimeout(tapTimeoutId),
          window.clearTimeout(holdTimeoutId),
          window.clearTimeout(moveTimeoutId),
          clearTapTimers());
      }));
  }
export function runAction(self: PanelRenderer, runtimeActionComponent: any, actionPayload: any, actionRuntimeOptions: Record<string, any> = {}) {
    !actionPayload?.type ||
      actionPayload.type === "none" ||
      self.dispatchAction(runtimeActionComponent, actionPayload, actionRuntimeOptions).catch(
        (actionError) => {
          (window.HomeOSLog?.error!(actionError, {
            componentId: runtimeActionComponent.id,
            entityId: runtimeActionComponent.bindings?.entity?.entityId || "",
            phase: "component-action",
          }),
            self.options.onError?.(actionError)!);
        },
      );
  }
export function previewAction(self: PanelRenderer, actionPreviewComponent: any, previewActionPayload: any) {
    previewActionPayload?.type === "more-info" &&
      self.showActionPopup(actionPreviewComponent, previewActionPayload, {
        preview: true,
      });
  }
export async function dispatchAction(self: PanelRenderer, toggleComponentRecord: any,
    toggleActionRecord: any,
    {
      optimisticAlreadyApplied: isOptimisticAlreadyApplied = false,
      optimisticRollback: optimisticRollbackCallback = null,
      optimisticPreviousState: optimisticPreviousValue,
    }: {
      optimisticAlreadyApplied?: boolean;
      optimisticRollback?: any;
      optimisticPreviousState?: any;
    } = {},) {
    if (toggleActionRecord.type === "toggle") {
      const toggleEntityId = toggleComponentRecord.bindings?.entity?.entityId;
      if (!toggleEntityId) throw new Error("该控件没有关联实体。");
      if (isVirtualEntityId2(toggleEntityId)) {
        self.toggleVirtualEntity(toggleEntityId);
        return;
      }
      const powerEntityId5 =
          typeof self.powerEntityId == "function"
            ? self.powerEntityId(toggleComponentRecord, toggleEntityId)
            : toggleEntityId,
        toggleEntityDomain = powerEntityId5.split(".", 1)[0];
      if (["button", "script"].includes(toggleEntityDomain)) {
        const toggleServiceCommand = entityToggleCommand2(
          powerEntityId5,
          self.states.get(powerEntityId5),
          toggleComponentRecord,
        );
        await self.callEntityService(
          toggleServiceCommand.domain,
          toggleServiceCommand.service,
          powerEntityId5,
          toggleServiceCommand.data,
        );
        return;
      }
      const toggleTargetState = isOptimisticAlreadyApplied
          ? optimisticPreviousValue
          : self.states.get(powerEntityId5),
        optimisticToggle = isOptimisticAlreadyApplied
          ? optimisticRollbackCallback || (() => {})
          : self.applyOptimisticToggle(powerEntityId5, toggleComponentRecord);
      try {
        if (toggleEntityDomain === "cover") {
          const optimisticStatesMap = new Map(self.states);
          (toggleTargetState === undefined
            ? optimisticStatesMap.delete(powerEntityId5)
            : optimisticStatesMap.set(powerEntityId5, toggleTargetState),
            await self.callEntityService(
              "cover",
              coverToggleServiceForComponent2(
                toggleComponentRecord,
                self.entityMetadata,
                optimisticStatesMap,
                powerEntityId5,
              ),
              powerEntityId5,
            ));
        } else {
          if (["climate", "fan", "water_heater", "media_player"].includes(toggleEntityDomain)) {
            const runtimePowerComponent4 =
                typeof self.runtimePowerComponent == "function"
                  ? self.runtimePowerComponent(toggleComponentRecord, toggleEntityId)
                  : toggleComponentRecord,
              coverServiceCommand = entityToggleCommand2(
                powerEntityId5,
                toggleTargetState,
                runtimePowerComponent4,
              );
            await self.callEntityService(
              coverServiceCommand.domain,
              coverServiceCommand.service,
              powerEntityId5,
              coverServiceCommand.data,
            );
          } else await self.callEntityService("homeassistant", "toggle", powerEntityId5);
        }
      } catch (toggleError: any) {
        throw (optimisticToggle(), toggleError);
      }
      return;
    }
    if (toggleActionRecord.type === "more-info") {
      self.showActionPopup(toggleComponentRecord, toggleActionRecord);
      return;
    }
    if (toggleActionRecord.type === "navigate") {
      if (
        !toggleActionRecord.target ||
        !self.document?.pages?.some(
          (pageRecordCandidate: any) => pageRecordCandidate.path === toggleActionRecord.target,
        )
      )
        throw new Error("跳转的页面不存在。");
      self.navigate(toggleActionRecord.target);
    }
  }
export async function callEntityService(self: PanelRenderer, serviceDomain: any, serviceName: any, serviceEntityId: any, servicePayload: Record<string, any> = {}) {
    const serviceRequestInit: RequestInit & { hbLogContext?: ComponentPayload } = {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        domain: serviceDomain,
        service: serviceName,
        entityId: serviceEntityId,
        data: servicePayload,
        // 同一手势的幂等键：断网重发（浏览器/代理层）不会真的执行两次。
        idempotency_key: randomUuid(),
      }),
      hbLogContext: {
        entityId: serviceEntityId,
        service: serviceDomain + "." + serviceName,
        phase: "device-control",
      },
    };
    const serviceResponse = await fetch("/api/v1/ha/services/call", serviceRequestInit);
    if (!serviceResponse.ok) {
      const serviceErrorBody = await serviceResponse.json().catch(() => ({})),
        error = new Error(
          typeof serviceErrorBody.detail == "string"
            ? serviceErrorBody.detail
            : serviceErrorBody.detail?.message || "实体操作失败。",
        );
      throw window.HomeOSLog?.linkError!(error, serviceResponse)! || error;
    }
  }