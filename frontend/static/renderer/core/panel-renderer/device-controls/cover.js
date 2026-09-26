/*
 * 设备控件区块：窗帘/遮阳详情（开合位置、方向、晾衣架与梦幻帘的差异分支）。
 */

import {
  airerDevicePosition,
  airerPresentationPositionForState,
  airerReportedPosition,
  coverPendingDisplayPosition,
  coverPositionReachedTarget,
  dreamCurtainIsRetracted,
  learnAirerPositionCalibration,
  physicalCoverState
} from "../../../controls/cover-runtime.js?v=2609260900";

export const coverDetailsMethods = {
  /**
   * 构建窗帘 / 晾衣机详情弹窗的控制区（开合、位置、倾斜、电机反向、升降）。
   * 设备差异很大（梦幻帘无位置概念、晾衣机有升降与照明、部分电机接线反向），因此全部靠
   * 入参开关在构建期定分支，点击时不再判断。
   */
  createCoverDetailsControls(
    coverControlsEntityId,
    coverControlsState,
    {
      interactive: coverControlsInteractive = true,
      dream: isDreamCoverControl = false,
      airer: coverIsAirer = false,
      tilt: coverSupportsTilt = false,
      motorReversed: coverMotorReversed = false,
      positionState: coverPositionState = null,
      positionCommandEntityId: coverPositionCommandEntityId = "",
      positionCommandState: coverPositionCommandState = null,
      motorState: coverMotorState = null,
      airerActionEntityIds: coverAirerActionEntityIds = {},
      positionCalibration: coverPositionCalibration = {},
      onVisualChange: coverVisualChangeCallback = null,
      onCurtainPositionChange: curtainPositionChangeCallback = null
    } = {}
  ) {
    const coverControlsElement = document.createElement("section");
    coverControlsElement.className = "hb-cover-details-controls";
    coverControlsElement.inert = !coverControlsInteractive;
    const positionLabelElement = document.createElement("label");
    positionLabelElement.className = "hb-cover-details-position";
    const positionHeadingElement = document.createElement("span");
    positionHeadingElement.className = "hb-cover-details-position-heading";
    const positionTitleElement = document.createElement("strong");
    positionTitleElement.textContent = isDreamCoverControl
      ? "叶片角度"
      : coverIsAirer
        ? "晾杆高度"
        : "开合位置";
    const positionOutputElement = document.createElement("output");
    positionHeadingElement.append(positionTitleElement, positionOutputElement);
    const positionInputElement = document.createElement("input");
    positionInputElement.type = "range";
    positionInputElement.min = "0";
    positionInputElement.max = "100";
    positionInputElement.step = "1";
    const positionLegendElement = document.createElement("span");
    positionLegendElement.className = "hb-cover-details-position-legend";
    if (isDreamCoverControl) {
      positionLegendElement.append(
        Object.assign(document.createElement("small"), {
          textContent: "0 · 一侧闭合"
        }),
        Object.assign(document.createElement("small"), {
          textContent: "50 · 90°打开"
        }),
        Object.assign(document.createElement("small"), {
          textContent: "100 · 反向闭合"
        })
      );
    } else if (coverIsAirer) {
      positionLegendElement.append(
        Object.assign(document.createElement("small"), {
          textContent: "下降"
        }),
        Object.assign(document.createElement("small"), {
          textContent: "升起"
        })
      );
    } else {
      positionLegendElement.append(
        Object.assign(document.createElement("small"), {
          textContent: "关闭"
        }),
        Object.assign(document.createElement("small"), {
          textContent: "打开"
        })
      );
    }
    positionLabelElement.append(
      positionHeadingElement,
      positionInputElement,
      positionLegendElement
    );
    const coverActionsElement = document.createElement("div");
    coverActionsElement.className = "hb-cover-details-actions";
    const openCoverServiceName = "open_cover";
    const stopCoverServiceName = "stop_cover";
    const closeCoverServiceName = "close_cover";
    const primaryCoverService = coverMotorReversed ? openCoverServiceName : closeCoverServiceName;
    const secondaryCoverService = coverMotorReversed ? closeCoverServiceName : openCoverServiceName;
    let isCurtainRetracted = dreamCurtainIsRetracted(coverControlsState?.state, coverMotorReversed);
    /**
     * 按设备形态生成动作按钮组（关 / 暂停 / 开，晾衣机为下降 / 暂停 / 升起）。
     * 电机反向的设备把开 / 关服务对调，故按钮文案不变、下发的服务名相反；返回数组同时供
     * `renderPositionState` 高亮，顺序固定为「主 / 暂停 / 次」。
     */
    const coverActionDefinitions = (
      isDreamCoverControl
        ? [
            {
              label: "关闭",
              icon: "←",
              service: primaryCoverService,
              curtainRetracted: false
            },
            {
              label: "暂停",
              icon: "Ⅱ",
              service: stopCoverServiceName
            },
            {
              label: "开启",
              icon: "→",
              service: secondaryCoverService,
              curtainRetracted: true
            }
          ]
        : coverIsAirer
          ? [
              {
                label: "下降",
                icon: "↓",
                service: primaryCoverService,
                action: "down"
              },
              {
                label: "暂停",
                icon: "Ⅱ",
                service: stopCoverServiceName,
                action: "pause"
              },
              {
                label: "升起",
                icon: "↑",
                service: secondaryCoverService,
                action: "up"
              }
            ]
          : [
              {
                label: "关闭",
                icon: "←",
                service: primaryCoverService
              },
              {
                label: "暂停",
                icon: "Ⅱ",
                service: stopCoverServiceName
              },
              {
                label: "打开",
                icon: "→",
                service: secondaryCoverService
              }
            ]
    ).map(coverAction => {
      const coverActionButton = document.createElement("button");
      coverActionButton.type = "button";
      coverActionButton.dataset.coverAction = coverAction.service;
      const coverActionIconElement = document.createElement("i");
      coverActionIconElement.textContent = coverAction.icon;
      coverActionIconElement.setAttribute("aria-hidden", "true");
      const coverActionLabelElement = document.createElement("strong");
      coverActionLabelElement.textContent = coverAction.label;
      coverActionButton.append(coverActionIconElement, coverActionLabelElement);
      coverActionButton.addEventListener("click", async () => {
        if (coverControlsInteractive) {
          if (isDreamCoverControl && typeof coverAction.curtainRetracted == "boolean") {
            coverControlsElement.beginDreamCurtainMotion?.(coverAction.curtainRetracted);
          }
          if (!isDreamCoverControl && coverAction.service === secondaryCoverService) {
            coverControlsElement.beginCoverMotion?.(100, "opening");
          } else if (!isDreamCoverControl && coverAction.service === primaryCoverService) {
            coverControlsElement.beginCoverMotion?.(0, "closing");
          } else {
            coverControlsElement.stopCoverMotion?.();
          }
          coverActionButton.classList.add("is-pending");
          try {
            const airerActionEntityId =
              coverIsAirer && coverAction.action
                ? coverAirerActionEntityIds[coverAction.action]
                : "";
            if (
              coverIsAirer &&
              coverPositionCommandEntityId &&
              ["up", "down"].includes(coverAction.action)
            ) {
              const airerTargetPosition = coverAction.action === "up" ? 100 : 0;
              const airerDeviceTargetPosition = airerDevicePosition(
                airerTargetPosition,
                coverPositionCalibration
              );
              await this.callEntityService("number", "set_value", coverPositionCommandEntityId, {
                value: airerDeviceTargetPosition
              });
            } else if (coverIsAirer && coverAction.action === "pause") {
              await this.callEntityService("cover", stopCoverServiceName, coverControlsEntityId);
            } else if (airerActionEntityId) {
              await this.callEntityService("button", "press", airerActionEntityId);
            } else {
              await this.callEntityService("cover", coverAction.service, coverControlsEntityId);
            }
          } catch (coverActionError) {
            coverControlsElement.cancelDreamCurtainMotion?.();
            coverControlsElement.cancelCoverMotion?.();
            coverControlsElement.syncCoverState?.(coverControlsState);
            this.options.onError?.(coverActionError);
          } finally {
            coverActionButton.classList.remove("is-pending");
          }
        }
      });
      coverActionsElement.append(coverActionButton);
      return coverActionButton;
    });
    let controlPositionState = coverPositionState;
    let controlPositionCommandState = coverPositionCommandState;
    let controlMotorState = coverMotorState;
    /**
     * 触发晾衣机的位置标定学习（记录升降两端对应的设备原始值）。
     * 晾衣机的 number 指令值与实际高度不成比例，必须用实测端点反推映射；非晾衣机直接跳过。
     */
    const learnPositionCalibration = () => {
      if (coverIsAirer) {
        learnAirerPositionCalibration(
          coverPositionCalibration,
          controlPositionState?.state,
          controlPositionCommandState?.state,
          controlMotorState?.state
        );
      }
    };
    learnPositionCalibration();
    let latestCoverStateText = String(coverControlsState?.state || "");
    /**
     * 把实体状态换算成 0~100 的展示位置。
     * 晾衣机位置非线性（指令值与实际高度不成比例），走标定映射并区分收起 / 展开；普通 cover
     * 直接读 current_position（倾斜时读 current_tilt_position）；取不到数值时 open 计 100、其余计 0。
     */
    const resolvePositionFromState = positionSourceState => {
      const reportedPosition = coverIsAirer
        ? airerReportedPosition(controlPositionState, positionSourceState, coverPositionCalibration)
        : Number(
            positionSourceState?.attributes?.[
              coverSupportsTilt ? "current_tilt_position" : "current_position"
            ]
          );
      if (Number.isFinite(reportedPosition)) {
        const clampedPosition = Math.max(0, Math.min(100, reportedPosition));
        if (coverIsAirer) {
          return airerPresentationPositionForState(
            clampedPosition,
            latestCoverStateText || positionSourceState?.state,
            coverPositionCalibration,
            coverMotorReversed
          );
        } else {
          return clampedPosition;
        }
      }
      if (positionSourceState?.state === "open") {
        return 100;
      } else {
        return 0;
      }
    };
    let latestCoverEntityState = coverControlsState;
    let displayedPosition = resolvePositionFromState(coverControlsState);
    let sliderPosition = displayedPosition;
    let isPositionDragging = false;
    let motionFrameHandle = 0;
    let motionState = null;
    let heldPosition = null;
    let holdUntilMs = 0;
    let pendingCurtainTarget = null;
    /**
     * 停止位置动画帧（只清帧句柄，不改动 motionState）。
     */
    const stopMotionAnimation = () => {
      window.cancelAnimationFrame(motionFrameHandle);
      motionFrameHandle = 0;
    };
    /**
     * 渲染位置滑条与动作按钮高亮，并把位置回调给可视化层。
     * 位置夹到 0~100；按钮高亮依据本次运动方向而非服务器回报状态，点击后能立刻反馈。
     */
    const renderPositionState = (renderPositionValue, renderMotionState = "") => {
      sliderPosition = Math.max(0, Math.min(100, Number(renderPositionValue) || 0));
      positionInputElement.value = String(sliderPosition);
      positionInputElement.style.setProperty("--hb-cover-position-progress", sliderPosition + "%");
      positionOutputElement.textContent = Math.round(sliderPosition) + "%";
      for (const coverActionButtonEntry of coverActionDefinitions) {
        coverActionButtonEntry.classList.toggle(
          "is-active",
          coverActionButtonEntry.dataset.coverAction ===
            (renderMotionState === "opening"
              ? openCoverServiceName
              : renderMotionState === "closing"
                ? closeCoverServiceName
                : "")
        );
      }
      coverVisualChangeCallback?.({
        position: sliderPosition,
        state: renderMotionState
      });
    };
    coverControlsElement.setDreamCurtainRetracted = (
      curtainRetractedTarget,
      curtainMovingFlag = false
    ) => {
      if (isDreamCoverControl) {
        isCurtainRetracted = !!curtainRetractedTarget;
        positionInputElement.disabled = !coverControlsInteractive;
        curtainPositionChangeCallback?.({
          retracted: isCurtainRetracted,
          moving: !!curtainMovingFlag
        });
      }
    };
    coverControlsElement.isDreamCurtainRetracted = () => isCurtainRetracted;
    coverControlsElement.beginDreamCurtainMotion = curtainMotionTarget => {
      if (isDreamCoverControl) {
        pendingCurtainTarget = {
          target: !!curtainMotionTarget,
          expiresAt: Date.now() + 10000
        };
        coverControlsElement.setDreamCurtainRetracted?.(pendingCurtainTarget.target, true);
      }
    };
    coverControlsElement.cancelDreamCurtainMotion = () => {
      pendingCurtainTarget = null;
    };
    coverControlsElement.beginCoverMotion = (motionToPosition, motionToState) => {
      stopMotionAnimation();
      heldPosition = null;
      holdUntilMs = 0;
      const fromPosition = sliderPosition;
      const toPosition = Math.max(0, Math.min(100, Number(motionToPosition) || 0));
      motionState = {
        direction: toPosition >= fromPosition ? 1 : -1,
        target: toPosition,
        state: motionToState,
        initialPosition: fromPosition,
        lastServerPosition: fromPosition,
        sawMotorRunning: false,
        ignoreStaleUntil: Date.now() + 4000,
        expiresAt: Date.now() + (coverIsAirer ? 120000 : 10000)
      };
      const animationStartMs = performance.now();
      const animationDurationMs = Math.max(900, Math.abs(toPosition - fromPosition) * 28);
      /**
       * 位置动画的一帧：按三次缓出曲线把滑条从起点推进到目标。
       * 缓出曲线 1-(1-t)^3 前快后慢，更接近电机减速停止的手感；动画只驱动界面（真实位置仍以
       * 设备回报为准），到终点后不再排下一帧。
       */
      const animatePositionStep = frameTimestampMs => {
        const animationProgress = Math.min(
          1,
          (frameTimestampMs - animationStartMs) / animationDurationMs
        );
        const easedProgress = 1 - (1 - animationProgress) ** 3;
        renderPositionState(
          fromPosition + (toPosition - fromPosition) * easedProgress,
          motionToState
        );
        if (animationProgress < 1) {
          motionFrameHandle = window.requestAnimationFrame(animatePositionStep);
        } else {
          motionFrameHandle = 0;
        }
      };
      renderPositionState(fromPosition, motionToState);
      motionFrameHandle = window.requestAnimationFrame(animatePositionStep);
    };
    coverControlsElement.stopCoverMotion = () => {
      stopMotionAnimation();
      motionState = null;
      renderPositionState(sliderPosition, "");
    };
    coverControlsElement.cancelCoverMotion = () => {
      stopMotionAnimation();
      motionState = null;
    };
    coverControlsElement.holdCoverPosition = holdTargetPosition => {
      stopMotionAnimation();
      heldPosition = null;
      holdUntilMs = 0;
      const holdTarget = Math.max(0, Math.min(100, Number(holdTargetPosition) || 0));
      const holdFromPosition = displayedPosition;
      const holdDirection = holdTarget >= holdFromPosition ? 1 : -1;
      const holdMotionState =
        isDreamCoverControl || Math.abs(holdTarget - holdFromPosition) < 0.5
          ? ""
          : holdDirection > 0
            ? "opening"
            : "closing";
      motionState = {
        direction: holdDirection,
        target: holdTarget,
        state: holdMotionState,
        initialPosition: holdFromPosition,
        lastServerPosition: holdFromPosition,
        sawMotorRunning: false,
        ignoreStaleUntil: Date.now() + 4000,
        expiresAt: Date.now() + (coverIsAirer ? 120000 : 10000)
      };
      renderPositionState(holdTarget, holdMotionState);
    };
    /**
     * 应用一条窗帘实体状态：更新位置、运动态与梦幻帘开合状态。
     * primary 表示状态来自主实体，需顺带更新内部缓存文案。晾衣机在「保持位置」窗口内忽略服务器回报的中间值， 避免位置传感器抖动让滑条来回跳；梦幻帘「已收拢」异步生效，所以点击后的目标态要一直保留到实体真正到达，
     * 超时则放弃，避免界面永远停在乐观值上。
     */
    const applyCoverState = (coverSourceState, { primary: isPrimaryState = false } = {}) => {
      if (isPrimaryState) {
        latestCoverEntityState = coverSourceState || latestCoverEntityState;
        latestCoverStateText = String(coverSourceState?.state || latestCoverStateText);
      }
      if (heldPosition !== null && Date.now() >= holdUntilMs) {
        heldPosition = null;
        holdUntilMs = 0;
      }
      const nextPosition =
        coverIsAirer && heldPosition !== null
          ? heldPosition
          : resolvePositionFromState(coverSourceState);
      displayedPosition = nextPosition;
      const coverStateLabel = String(coverSourceState?.state || "");
      if (isDreamCoverControl) {
        const coverPhysicalState = physicalCoverState(coverStateLabel, coverMotorReversed);
        const coverIsRetractedState = dreamCurtainIsRetracted(coverStateLabel, coverMotorReversed);
        if (pendingCurtainTarget && coverIsRetractedState === pendingCurtainTarget.target) {
          const targetRetractedValue = pendingCurtainTarget.target;
          pendingCurtainTarget = null;
          coverControlsElement.setDreamCurtainRetracted?.(targetRetractedValue, false);
        } else if (pendingCurtainTarget && Date.now() < pendingCurtainTarget.expiresAt) {
          coverControlsElement.setDreamCurtainRetracted?.(pendingCurtainTarget.target, true);
        } else {
          pendingCurtainTarget = null;
          coverControlsElement.setDreamCurtainRetracted?.(
            coverIsRetractedState,
            coverPhysicalState === "opening" || coverPhysicalState === "closing"
          );
        }
      }
      if (!isPositionDragging) {
        if (motionState) {
          const frameNowMs = Date.now();
          const {
            direction: motionDirection,
            target: motionTargetPosition,
            state: motionStateName
          } = motionState;
          const reachedTarget = coverPositionReachedTarget(
            nextPosition,
            motionTargetPosition,
            motionDirection
          );
          const reachedEndpointState =
            (motionTargetPosition <= 0.5 && coverStateLabel === "closed") ||
            (motionTargetPosition >= 99.5 && coverStateLabel === "open");
          const motorSpeedValue = Number(controlMotorState?.state);
          const isMotorStopped =
            coverIsAirer &&
            motionState.sawMotorRunning &&
            Number.isFinite(motorSpeedValue) &&
            Math.abs(motorSpeedValue) < 0.5;
          if (
            coverIsAirer
              ? reachedEndpointState || (isMotorStopped && reachedTarget)
              : reachedTarget ||
                reachedEndpointState ||
                (motionTargetPosition >= 99.5 && nextPosition >= 99.5)
          ) {
            stopMotionAnimation();
            if (coverIsAirer) {
              heldPosition = motionTargetPosition;
              holdUntilMs = Date.now() + 120000;
            }
            motionState = null;
            renderPositionState(
              motionTargetPosition,
              coverStateLabel || (motionDirection < 0 ? "closed" : "open")
            );
            return;
          }
          if (
            motionDirection < 0
              ? nextPosition < motionState.lastServerPosition - 0.5 || coverStateLabel === "closing"
              : nextPosition > motionState.lastServerPosition + 0.5 || coverStateLabel === "opening"
          ) {
            motionState.lastServerPosition =
              motionDirection < 0
                ? Math.min(motionState.lastServerPosition, nextPosition)
                : Math.max(motionState.lastServerPosition, nextPosition);
            const pendingDisplayPosition = coverPendingDisplayPosition(
              sliderPosition,
              nextPosition,
              motionDirection
            );
            renderPositionState(pendingDisplayPosition, motionStateName);
            return;
          }
          if (
            frameNowMs < motionState.ignoreStaleUntil ||
            (coverIsAirer && frameNowMs < motionState.expiresAt) ||
            (frameNowMs < motionState.expiresAt &&
              Math.abs(nextPosition - motionState.initialPosition) < 0.5)
          ) {
            return;
          }
          stopMotionAnimation();
          motionState = null;
        } else {
          stopMotionAnimation();
        }
        renderPositionState(nextPosition, coverStateLabel);
      }
    };
    positionInputElement.addEventListener("pointerdown", () => {
      isPositionDragging = true;
      stopMotionAnimation();
      motionState = null;
    });
    positionInputElement.addEventListener("input", () => {
      isPositionDragging = true;
      stopMotionAnimation();
      motionState = null;
      const inputPosition = Number(positionInputElement.value);
      renderPositionState(
        inputPosition,
        isDreamCoverControl ? "" : inputPosition > 0 ? "open" : "closed"
      );
    });
    positionInputElement.addEventListener("change", async () => {
      isPositionDragging = false;
      if (!coverControlsInteractive) {
        return;
      }
      const requestedPosition = Number(positionInputElement.value);
      const deviceTargetPosition = airerDevicePosition(requestedPosition, coverPositionCalibration);
      coverControlsElement.holdCoverPosition(requestedPosition);
      try {
        if (coverIsAirer && coverPositionCommandEntityId) {
          await this.callEntityService("number", "set_value", coverPositionCommandEntityId, {
            value: deviceTargetPosition
          });
        } else {
          await this.callEntityService(
            "cover",
            coverSupportsTilt ? "set_cover_tilt_position" : "set_cover_position",
            coverControlsEntityId,
            {
              [coverSupportsTilt ? "tilt_position" : "position"]: requestedPosition
            }
          );
        }
      } catch (positionRequestError) {
        coverControlsElement.cancelCoverMotion();
        applyCoverState(latestCoverEntityState);
        this.options.onError?.(positionRequestError);
      }
    });
    positionInputElement.addEventListener("pointercancel", () => {
      isPositionDragging = false;
      applyCoverState(latestCoverEntityState);
    });
    coverControlsElement.append(positionLabelElement, coverActionsElement);
    coverControlsElement.syncCoverState = coverSyncState =>
      applyCoverState(coverSyncState, {
        primary: true
      });
    coverControlsElement.syncCoverPositionState = coverSyncPositionState => {
      controlPositionState = coverSyncPositionState || controlPositionState;
      learnPositionCalibration();
      applyCoverState(latestCoverEntityState);
    };
    coverControlsElement.syncCoverPositionCommandState = coverSyncCommandState => {
      controlPositionCommandState = coverSyncCommandState || controlPositionCommandState;
      learnPositionCalibration();
      applyCoverState(latestCoverEntityState);
    };
    coverControlsElement.syncAirerMotorState = coverSyncMotorState => {
      controlMotorState = coverSyncMotorState || controlMotorState;
      const currentMotorSpeed = Number(controlMotorState?.state);
      if (motionState && Number.isFinite(currentMotorSpeed) && Math.abs(currentMotorSpeed) >= 0.5) {
        motionState.sawMotorRunning = true;
      }
      learnPositionCalibration();
      applyCoverState(latestCoverEntityState);
    };
    coverControlsElement.cleanupCoverDetails = () => {
      stopMotionAnimation();
      motionState = null;
      pendingCurtainTarget = null;
      isPositionDragging = false;
    };
    applyCoverState(coverControlsState, {
      primary: true
    });
    return coverControlsElement;
  }
};
