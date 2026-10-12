import type { ComponentControllerElement } from "../renderer-types";
import type { PanelRenderer } from "../panel-renderer";
import { airerDevicePosition as airerDevicePosition2, airerPresentationPositionForState as airerPresentationPositionForState2, airerReportedPosition as airerReportedPosition2, coverPendingDisplayPosition as coverPendingDisplayPosition2, coverPositionReachedTarget as coverPositionReachedTarget2, dreamCurtainIsRetracted as dreamCurtainIsRetracted2, learnAirerPositionCalibration as learnAirerPositionCalibration2, physicalCoverState as physicalCoverState2 } from "../controls/cover-runtime";
import { applyRangeProgressCss as applyRangeProgressCss2 } from "../../shared/util/range-progress";

export function createCoverDetailsControls(this: PanelRenderer, 
    coverDetailsEntityId: any,
    coverStateObject: any,
    {
      interactive: isCoverInteractive = true,
      dream: isTilt = false,
      airer: isAirer = false,
      tilt: isTiltMode = false,
      motorReversed: isMotorReversed = false,
      positionState: positionStateOption = null,
      positionCommandEntityId: coverCommandEntityId = "",
      positionCommandState: positionCommandStateOption = null,
      motorState: motorStateOption = null,
      airerActionEntityIds: airerActionEntityIds = {},
      positionCalibration: positionCalibration = {},
      onVisualChange: onCoverVisualChange = null,
      onCurtainPositionChange: onCurtainPositionChange = null,
    }: any = {},
  ): ComponentControllerElement {
    const coverControlsPanel: ComponentControllerElement = document.createElement("section");
    ((coverControlsPanel.className = "hb-cover-details-controls"),
      (coverControlsPanel.inert = !isCoverInteractive));
    const coverPositionField = document.createElement("label");
    coverPositionField.className = "hb-cover-details-position";
    const coverPositionHeading = document.createElement("span");
    coverPositionHeading.className = "hb-cover-details-position-heading";
    const coverPositionLabel = document.createElement("strong");
    coverPositionLabel.textContent = isTilt ? "叶片角度" : isAirer ? "晾杆高度" : "开合位置";
    const coverPositionOutputElement = document.createElement("output");
    coverPositionHeading.append(coverPositionLabel, coverPositionOutputElement);
    const coverPositionSlider = document.createElement("input");
    ((coverPositionSlider.type = "range"),
      coverPositionSlider.classList.add("hb-range"),
      (coverPositionSlider.min = "0"),
      (coverPositionSlider.max = "100"),
      (coverPositionSlider.step = "1"));
    const coverPositionLegend = document.createElement("span");
    ((coverPositionLegend.className = "hb-cover-details-position-legend"),
      isTilt
        ? coverPositionLegend.append(
            Object.assign(document.createElement("small"), {
              textContent: "0 · 正向闭合",
            }),
            Object.assign(document.createElement("small"), {
              textContent: "50 · 90°打开",
            }),
            Object.assign(document.createElement("small"), {
              textContent: "100 · 反向闭合",
            }),
          )
        : isAirer
          ? coverPositionLegend.append(
              Object.assign(document.createElement("small"), {
                textContent: "下降",
              }),
              Object.assign(document.createElement("small"), {
                textContent: "升起",
              }),
            )
          : coverPositionLegend.append(
              Object.assign(document.createElement("small"), {
                textContent: "关闭",
              }),
              Object.assign(document.createElement("small"), {
                textContent: "打开",
              }),
            ),
      coverPositionField.append(coverPositionHeading, coverPositionSlider, coverPositionLegend));
    const coverActionsRow = document.createElement("div");
    coverActionsRow.className = "hb-cover-details-actions";
    const openCoverService = "open_cover",
      stopCoverService = "stop_cover",
      closeCoverService = "close_cover",
      normalizedOpenService = isMotorReversed ? openCoverService : closeCoverService,
      normalizedCloseService = isMotorReversed ? closeCoverService : openCoverService;
    let isCurtainRetractedState = dreamCurtainIsRetracted2(
      coverStateObject?.state,
      isMotorReversed,
    );
    const coverActionEntries = (
      isTilt
        ? [
            {
              label: "关闭",
              icon: "←",
              service: normalizedOpenService,
              curtainRetracted: false,
            },
            {
              label: "暂停",
              icon: "Ⅱ",
              service: stopCoverService,
            },
            {
              label: "开启",
              icon: "→",
              service: normalizedCloseService,
              curtainRetracted: true,
            },
          ]
        : isAirer
          ? [
              {
                label: "下降",
                icon: "↓",
                service: normalizedOpenService,
                action: "down",
              },
              {
                label: "暂停",
                icon: "Ⅱ",
                service: stopCoverService,
                action: "pause",
              },
              {
                label: "升起",
                icon: "↑",
                service: normalizedCloseService,
                action: "up",
              },
            ]
          : [
              {
                label: "关闭",
                icon: "←",
                service: normalizedOpenService,
              },
              {
                label: "暂停",
                icon: "Ⅱ",
                service: stopCoverService,
              },
              {
                label: "打开",
                icon: "→",
                service: normalizedCloseService,
              },
            ]
    ).map((coverAction: any) => {
      const coverActionButton = document.createElement("button");
      ((coverActionButton.type = "button"),
        (coverActionButton.dataset.coverAction = coverAction.service));
      const coverActionIcon = document.createElement("i");
      ((coverActionIcon.textContent = coverAction.icon),
        coverActionIcon.setAttribute("aria-hidden", "true"));
      const coverActionLabel = document.createElement("strong");
      return (
        (coverActionLabel.textContent = coverAction.label),
        coverActionButton.append(coverActionIcon, coverActionLabel),
        coverActionButton.addEventListener("click", async () => {
          if (isCoverInteractive) {
            (isTilt &&
              typeof coverAction.curtainRetracted == "boolean" &&
              coverControlsPanel.beginDreamCurtainMotion?.(coverAction.curtainRetracted),
              !isTilt && coverAction.service === normalizedCloseService
                ? coverControlsPanel.beginCoverMotion?.(100, "opening")
                : !isTilt && coverAction.service === normalizedOpenService
                  ? coverControlsPanel.beginCoverMotion?.(0, "closing")
                  : coverControlsPanel.stopCoverMotion?.(),
              coverActionButton.classList.add("is-pending"));
            try {
              const airerActionEntityId =
                isAirer && coverAction.action ? (airerActionEntityIds as any)[coverAction.action] : "";
              if (isAirer && coverCommandEntityId && ["up", "down"].includes(coverAction.action)) {
                const airerMoveTargetPosition = coverAction.action === "up" ? 100 : 0,
                  airerMovePosition = airerDevicePosition2(
                    airerMoveTargetPosition,
                    positionCalibration,
                  );
                await this.callEntityService("number", "set_value", coverCommandEntityId, {
                  value: airerMovePosition,
                });
              } else
                isAirer && coverAction.action === "pause"
                  ? await this.callEntityService("cover", stopCoverService, coverDetailsEntityId)
                  : airerActionEntityId
                    ? await this.callEntityService("button", "press", airerActionEntityId)
                    : await this.callEntityService(
                        "cover",
                        coverAction.service,
                        coverDetailsEntityId,
                      );
            } catch (coverActionError: any) {
              (coverControlsPanel.cancelDreamCurtainMotion?.(),
                coverControlsPanel.cancelCoverMotion?.(),
                coverControlsPanel.syncCoverState?.(coverStateObject),
                this.options.onError?.(coverActionError));
            } finally {
              coverActionButton.classList.remove("is-pending");
            }
          }
        }),
        coverActionsRow.append(coverActionButton),
        coverActionButton
      );
    });
    let coverPositionStateSnapshot = positionStateOption,
      coverPositionCommandSnapshot = positionCommandStateOption,
      coverMotorStateSnapshot = motorStateOption;
    const syncCoverDerivedState = () => {
      isAirer &&
        learnAirerPositionCalibration2(
          positionCalibration,
          coverPositionStateSnapshot?.state,
          coverPositionCommandSnapshot?.state,
          coverMotorStateSnapshot?.state,
        );
    };
    syncCoverDerivedState();
    let coverStateText = String(coverStateObject?.state || "");
    const resolveCoverPosition = (positionSourceState: any) => {
      const computedCoverPosition = isAirer
        ? airerReportedPosition2(
            coverPositionStateSnapshot,
            positionSourceState,
            positionCalibration,
          )
        : Number(
            positionSourceState?.attributes?.[
              isTiltMode ? "current_tilt_position" : "current_position"
            ],
          );
      if (Number.isFinite(computedCoverPosition)) {
        const clampedPosition = Math.max(0, Math.min(100, computedCoverPosition));
        return isAirer
          ? airerPresentationPositionForState2(
              clampedPosition,
              coverStateText || positionSourceState?.state,
              positionCalibration,
              isMotorReversed,
            )
          : clampedPosition;
      }
      return positionSourceState?.state === "open" ? 100 : 0;
    };
    let primaryCoverState = coverStateObject,
      resolvedCoverPosition = resolveCoverPosition(coverStateObject),
      displayCoverPosition = resolvedCoverPosition,
      isCoverMotionActive = false,
      coverHandleIndex = 0,
      coverMotionState: any = null,
      airerHoldPosition: any = null,
      airerHoldExpiryMs = 0,
      dreamCurtainTarget: any = null;
    const clearCoverMotionTimers = () => {
        (window.cancelAnimationFrame(coverHandleIndex), (coverHandleIndex = 0));
      },
      updateCoverPosition = (nextCoverPosition: any, coverMotionPhase = "") => {
        ((displayCoverPosition = Math.max(0, Math.min(100, Number(nextCoverPosition) || 0))),
          (coverPositionSlider.value = String(displayCoverPosition)),
          applyRangeProgressCss2(coverPositionSlider, displayCoverPosition + "%"),
          (coverPositionOutputElement.textContent = Math.round(displayCoverPosition) + "%"));
        for (const coverActionButtonElement of coverActionEntries)
          coverActionButtonElement.classList.toggle(
            "is-active",
            coverActionButtonElement.dataset.coverAction ===
              (coverMotionPhase === "opening"
                ? openCoverService
                : coverMotionPhase === "closing"
                  ? closeCoverService
                  : ""),
          );
        onCoverVisualChange?.({
          position: displayCoverPosition,
          state: coverMotionPhase,
        });
      };
    ((coverControlsPanel.setDreamCurtainRetracted = (
      retractedState,
      isCurtainMovingState = false,
    ) => {
      isTilt &&
        ((isCurtainRetractedState = !!retractedState),
        (coverPositionSlider.disabled = !isCoverInteractive),
        onCurtainPositionChange?.({
          retracted: isCurtainRetractedState,
          moving: !!isCurtainMovingState,
        }));
    }),
      (coverControlsPanel.isDreamCurtainRetracted = () => isCurtainRetractedState),
      (coverControlsPanel.beginDreamCurtainMotion = (curtainRetractedValue) => {
        isTilt &&
          ((dreamCurtainTarget = {
            target: !!curtainRetractedValue,
            expiresAt: Date.now() + 10000,
          }),
          coverControlsPanel.setDreamCurtainRetracted?.(dreamCurtainTarget.target, true));
      }),
      (coverControlsPanel.cancelDreamCurtainMotion = () => {
        dreamCurtainTarget = null;
      }),
      (coverControlsPanel.beginCoverMotion = (targetCoverPosition, coverMotionPhaseName) => {
        (clearCoverMotionTimers(), (airerHoldPosition = null), (airerHoldExpiryMs = 0));
        const motionStartPosition = displayCoverPosition,
          motionTargetPosition = Math.max(0, Math.min(100, Number(targetCoverPosition) || 0));
        coverMotionState = {
          direction: motionTargetPosition >= motionStartPosition ? 1 : -1,
          target: motionTargetPosition,
          state: coverMotionPhaseName,
          initialPosition: motionStartPosition,
          lastServerPosition: motionStartPosition,
          sawMotorRunning: false,
          ignoreStaleUntil: Date.now() + 4000,
          expiresAt: Date.now() + (isAirer ? 120000 : 10000),
        };
        const motionStartTimeMs = performance.now(),
          motionDurationMs = Math.max(
            900,
            Math.abs(motionTargetPosition - motionStartPosition) * 28,
          ),
          motionFrame = (motionTimestamp: any) => {
            const motionProgress = Math.min(
                1,
                (motionTimestamp - motionStartTimeMs) / motionDurationMs,
              ),
              motionEasing = 1 - (1 - motionProgress) ** 3;
            (updateCoverPosition(
              motionStartPosition + (motionTargetPosition - motionStartPosition) * motionEasing,
              coverMotionPhaseName,
            ),
              motionProgress < 1
                ? (coverHandleIndex = window.requestAnimationFrame(motionFrame))
                : (coverHandleIndex = 0));
          };
        (updateCoverPosition(motionStartPosition, coverMotionPhaseName),
          (coverHandleIndex = window.requestAnimationFrame(motionFrame)));
      }),
      (coverControlsPanel.stopCoverMotion = () => {
        (clearCoverMotionTimers(),
          (coverMotionState = null),
          updateCoverPosition(displayCoverPosition, ""));
      }),
      (coverControlsPanel.cancelCoverMotion = () => {
        (clearCoverMotionTimers(), (coverMotionState = null));
      }),
      (coverControlsPanel.holdCoverPosition = (holdCoverPosition) => {
        (clearCoverMotionTimers(), (airerHoldPosition = null), (airerHoldExpiryMs = 0));
        const holdTargetPosition = Math.max(0, Math.min(100, Number(holdCoverPosition) || 0)),
          holdInitialPosition = resolvedCoverPosition,
          holdDirection = holdTargetPosition >= holdInitialPosition ? 1 : -1,
          holdMotionPhase =
            isTilt || Math.abs(holdTargetPosition - holdInitialPosition) < 0.5
              ? ""
              : holdDirection > 0
                ? "opening"
                : "closing";
        ((coverMotionState = {
          direction: holdDirection,
          target: holdTargetPosition,
          state: holdMotionPhase,
          initialPosition: holdInitialPosition,
          lastServerPosition: holdInitialPosition,
          sawMotorRunning: false,
          ignoreStaleUntil: Date.now() + 4000,
          expiresAt: Date.now() + (isAirer ? 120000 : 10000),
        }),
          updateCoverPosition(holdTargetPosition, holdMotionPhase));
      }));
    const syncCoverDetails = (
      primaryStateSource: any,
      { primary: shouldUpdatePrimary = false } = {},
    ) => {
      (shouldUpdatePrimary &&
        ((primaryCoverState = primaryStateSource || primaryCoverState),
        (coverStateText = String(primaryStateSource?.state || coverStateText))),
        airerHoldPosition !== null &&
          Date.now() >= airerHoldExpiryMs &&
          ((airerHoldPosition = null), (airerHoldExpiryMs = 0)));
      const currentServerPosition =
        isAirer && airerHoldPosition !== null
          ? airerHoldPosition
          : resolveCoverPosition(primaryStateSource);
      resolvedCoverPosition = currentServerPosition;
      const serverStateText = String(primaryStateSource?.state || "");
      if (isTilt) {
        const physicalState = physicalCoverState2(serverStateText, isMotorReversed),
          isAirerCurtainRetracted = dreamCurtainIsRetracted2(serverStateText, isMotorReversed);
        if (dreamCurtainTarget && isAirerCurtainRetracted === dreamCurtainTarget.target) {
          const dreamCurtainTargetValue = dreamCurtainTarget.target;
          ((dreamCurtainTarget = null),
            coverControlsPanel.setDreamCurtainRetracted?.(dreamCurtainTargetValue, false));
        } else
          dreamCurtainTarget && Date.now() < dreamCurtainTarget.expiresAt
            ? coverControlsPanel.setDreamCurtainRetracted?.(dreamCurtainTarget.target, true)
            : ((dreamCurtainTarget = null),
              coverControlsPanel.setDreamCurtainRetracted?.(
                isAirerCurtainRetracted,
                physicalState === "opening" || physicalState === "closing",
              ));
      }
      if (!isCoverMotionActive) {
        if (coverMotionState) {
          const motionNowMs = Date.now(),
            {
              direction: motionDirection,
              target: motionTarget,
              state: motionPhase,
            } = coverMotionState,
            hasReachedTarget = coverPositionReachedTarget2(
              currentServerPosition,
              motionTarget,
              motionDirection,
            ),
            isAtBoundary =
              (motionTarget <= 0.5 && serverStateText === "closed") ||
              (motionTarget >= 99.5 && serverStateText === "open"),
            motorNumericState = Number(coverMotorStateSnapshot?.state),
            finite7 =
              isAirer &&
              coverMotionState.sawMotorRunning &&
              Number.isFinite(motorNumericState) &&
              Math.abs(motorNumericState) < 0.5;
          if (
            isAirer
              ? isAtBoundary || (finite7 && hasReachedTarget)
              : hasReachedTarget ||
                isAtBoundary ||
                (motionTarget >= 99.5 && currentServerPosition >= 99.5)
          ) {
            (clearCoverMotionTimers(),
              isAirer &&
                ((airerHoldPosition = motionTarget), (airerHoldExpiryMs = Date.now() + 120000)),
              (coverMotionState = null),
              updateCoverPosition(
                motionTarget,
                serverStateText || (motionDirection < 0 ? "closed" : "open"),
              ));
            return;
          }
          if (
            motionDirection < 0
              ? currentServerPosition < coverMotionState.lastServerPosition - 0.5 ||
                serverStateText === "closing"
              : currentServerPosition > coverMotionState.lastServerPosition + 0.5 ||
                serverStateText === "opening"
          ) {
            coverMotionState.lastServerPosition =
              motionDirection < 0
                ? Math.min(coverMotionState.lastServerPosition, currentServerPosition)
                : Math.max(coverMotionState.lastServerPosition, currentServerPosition);
            const pendingDisplayPosition = coverPendingDisplayPosition2(
              displayCoverPosition,
              currentServerPosition,
              motionDirection,
            );
            updateCoverPosition(pendingDisplayPosition, motionPhase);
            return;
          }
          if (
            motionNowMs < coverMotionState.ignoreStaleUntil ||
            (isAirer && motionNowMs < coverMotionState.expiresAt) ||
            (motionNowMs < coverMotionState.expiresAt &&
              Math.abs(currentServerPosition - coverMotionState.initialPosition) < 0.5)
          )
            return;
          (clearCoverMotionTimers(), (coverMotionState = null));
        } else clearCoverMotionTimers();
        updateCoverPosition(currentServerPosition, serverStateText);
      }
    };
    return (
      coverPositionSlider.addEventListener("pointerdown", () => {
        ((isCoverMotionActive = true), clearCoverMotionTimers(), (coverMotionState = null));
      }),
      coverPositionSlider.addEventListener("input", () => {
        ((isCoverMotionActive = true), clearCoverMotionTimers(), (coverMotionState = null));
        const sliderPositionValue = Number(coverPositionSlider.value);
        updateCoverPosition(
          sliderPositionValue,
          isTilt ? "" : sliderPositionValue > 0 ? "open" : "closed",
        );
      }),
      coverPositionSlider.addEventListener("change", async () => {
        if (((isCoverMotionActive = false), !isCoverInteractive)) return;
        const sliderTargetValue = Number(coverPositionSlider.value),
          airerDevicePosition = airerDevicePosition2(sliderTargetValue, positionCalibration);
        coverControlsPanel.holdCoverPosition!(sliderTargetValue);
        try {
          isAirer && coverCommandEntityId
            ? await this.callEntityService("number", "set_value", coverCommandEntityId, {
                value: airerDevicePosition,
              })
            : await this.callEntityService(
                "cover",
                isTiltMode ? "set_cover_tilt_position" : "set_cover_position",
                coverDetailsEntityId,
                {
                  [isTiltMode ? "tilt_position" : "position"]: sliderTargetValue,
                },
              );
        } catch (coverSyncError: any) {
          (coverControlsPanel.cancelCoverMotion!(),
            syncCoverDetails(primaryCoverState),
            this.options.onError?.(coverSyncError));
        }
      }),
      coverPositionSlider.addEventListener("pointercancel", () => {
        ((isCoverMotionActive = false), syncCoverDetails(primaryCoverState));
      }),
      coverControlsPanel.append(coverPositionField, coverActionsRow),
      (coverControlsPanel.syncCoverState = (coverStateSourceArg) =>
        syncCoverDetails(coverStateSourceArg, {
          primary: true,
        })),
      (coverControlsPanel.syncCoverPositionState = (coverPositionStateArg) => {
        ((coverPositionStateSnapshot = coverPositionStateArg || coverPositionStateSnapshot),
          syncCoverDerivedState(),
          syncCoverDetails(primaryCoverState));
      }),
      (coverControlsPanel.syncCoverPositionCommandState = (coverPositionCommandArg) => {
        ((coverPositionCommandSnapshot = coverPositionCommandArg || coverPositionCommandSnapshot),
          syncCoverDerivedState(),
          syncCoverDetails(primaryCoverState));
      }),
      (coverControlsPanel.syncAirerMotorState = (coverMotorStateArg) => {
        coverMotorStateSnapshot = coverMotorStateArg || coverMotorStateSnapshot;
        const motorStateNumber = Number(coverMotorStateSnapshot?.state);
        (coverMotionState &&
          Number.isFinite(motorStateNumber) &&
          Math.abs(motorStateNumber) >= 0.5 &&
          (coverMotionState.sawMotorRunning = true),
          syncCoverDerivedState(),
          syncCoverDetails(primaryCoverState));
      }),
      (coverControlsPanel.cleanupCoverDetails = () => {
        (clearCoverMotionTimers(),
          (coverMotionState = null),
          (dreamCurtainTarget = null),
          (isCoverMotionActive = false));
      }),
      syncCoverDetails(coverStateObject, {
        primary: true,
      }),
      coverControlsPanel
    );
  }
