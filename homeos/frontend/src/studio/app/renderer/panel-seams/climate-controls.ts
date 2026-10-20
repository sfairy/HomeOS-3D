import type { ComponentControllerElement } from "../renderer-types";
import type { PanelRenderer } from "../panel-renderer";
import { clickFocusedElement, mixHexColor } from "../renderer-helpers";
import { climateControlStructureKey as climateControlStructureKey2, climateEffectMode as climateEffectMode2, climateIsPoweredOn as climateIsPoweredOn2, climateIsRunning as climateIsRunning2, climateModeIcon as climateModeIcon2, climateModeLabel as climateModeLabel2, climateOperationModeValues as climateOperationModeValues2, climateOptionPresentation as climateOptionPresentation2, climatePowerCommand as climatePowerCommand2, climatePresentationMode as climatePresentationMode2, climateSwingModeLabel as climateSwingModeLabel2, normalizeClimateCapabilities as normalizeClimateCapabilities2, reconcileClimateTargetTemperature as reconcileClimateTargetTemperature2 } from "../controls/climate";
import { randomUuid as randomUuid2 } from "../../shared/util/random-id";

export function createClimateDetailsControls(this: PanelRenderer, 
    climateDetailsEntityId: any,
    climateState: any,
    {
      interactive: isClimateInteractive = true,
      onPowerChange: onClimatePowerChange = null,
      onVisualChange: onClimateVisualChange = null,
      modeColors: climateModeColors = {} as Record<string, string>,
      deviceType: climateStructureType = "air-conditioner",
    }: any = {},
  ): ComponentControllerElement {
    const climateNormalizedCapabilities = normalizeClimateCapabilities2(climateState),
      attributes2 = climateNormalizedCapabilities.attributes,
      climateEntityDomain = String(climateDetailsEntityId || "").split(".", 1)[0],
      climateModeOptionLabels = {
        entityId: climateDetailsEntityId,
        entityMetadata: this.entityMetadata,
        entityTranslations: this.entityTranslations,
      },
      climateDetailsPanel: ComponentControllerElement = document.createElement("section");
    ((climateDetailsPanel.className = "hb-climate-details-controls"),
      (climateDetailsPanel.dataset.climateDeviceType = climateStructureType),
      (climateDetailsPanel.dataset.climateStructureKey = climateControlStructureKey2(
        climateDetailsEntityId,
        climateState,
        climateStructureType,
      )),
      (climateDetailsPanel.inert = !isClimateInteractive));
    const currentTemperature = climateNormalizedCapabilities.currentTemperature,
      targetTemperature2 = climateNormalizedCapabilities.targetTemperature,
      minimumTemperature = climateNormalizedCapabilities.minimumTemperature,
      maximumTemperature = climateNormalizedCapabilities.maximumTemperature,
      temperatureStep = climateNormalizedCapabilities.temperatureStep,
      supportsTargetTemperature =
        ["climate", "water_heater"].includes(climateEntityDomain) &&
        climateNormalizedCapabilities.supportsTargetTemperature,
      isWaterHeater = climateEntityDomain === "water_heater";
    climateDetailsPanel.classList.toggle("without-temperature", !supportsTargetTemperature);
    let targetTemperatureValue = supportsTargetTemperature
        ? targetTemperature2
        : minimumTemperature,
      temperatureCommitTimer: any = null,
      temperatureSyncTimer: any = null,
      temperatureControlTimer: any = null;
    const applyCommittedTemperature = () => {
        ((temperatureCommitTimer = null),
          window.clearTimeout(temperatureSyncTimer),
          window.clearTimeout(temperatureControlTimer),
          (temperatureSyncTimer = null),
          (temperatureControlTimer = null));
      },
      commitTemperature = (nextTemperature: any) => {
        ((temperatureCommitTimer = nextTemperature),
          window.clearTimeout(temperatureSyncTimer),
          window.clearTimeout(temperatureControlTimer),
          (temperatureControlTimer = null),
          (temperatureSyncTimer = window.setTimeout(() => {
            ((temperatureCommitTimer = null), (temperatureSyncTimer = null));
          }, 8000)));
      },
      applyLocalTemperature = () => {
        (window.clearTimeout(temperatureControlTimer),
          (temperatureControlTimer = window.setTimeout(applyCommittedTemperature, 2500)));
      },
      climateThermostatSection = document.createElement("section");
    climateThermostatSection.className = "hb-climate-thermostat";
    const temperatureDecreaseButton = document.createElement("button");
    ((temperatureDecreaseButton.type = "button"),
      (temperatureDecreaseButton.className = "hb-climate-temperature-step"),
      (temperatureDecreaseButton.textContent = "−"),
      temperatureDecreaseButton.setAttribute("aria-label", "降低设定温度"));
    const temperatureDialBox = document.createElement("div");
    temperatureDialBox.className = "hb-climate-temperature-dial";
    const temperatureArcStartIcon = document.createElement("i");
    ((temperatureArcStartIcon.className = "hb-climate-arc-cap start"),
      temperatureArcStartIcon.setAttribute("aria-hidden", "true"));
    const temperatureArcEndIcon = document.createElement("i");
    ((temperatureArcEndIcon.className = "hb-climate-arc-cap end"),
      temperatureArcEndIcon.setAttribute("aria-hidden", "true"));
    const temperatureThumbButton = document.createElement("button");
    ((temperatureThumbButton.type = "button"),
      (temperatureThumbButton.className = "hb-climate-temperature-thumb"),
      temperatureThumbButton.setAttribute("aria-label", "拖动调节设定温度"));
    const temperatureContentBox = document.createElement("div");
    temperatureContentBox.className = "hb-climate-temperature-content";
    const temperatureSettingCaption = document.createElement("small");
    temperatureSettingCaption.textContent = "设定温度";
    const temperatureValueLabel = document.createElement("strong"),
      temperatureCurrentLabel = document.createElement("span");
    ((temperatureCurrentLabel.textContent = Number.isFinite(currentTemperature)
      ? "当前温度 " + currentTemperature + "°C"
      : "当前温度 --"),
      temperatureContentBox.append(
        temperatureSettingCaption,
        temperatureValueLabel,
        temperatureCurrentLabel,
      ),
      temperatureDialBox.append(
        temperatureArcStartIcon,
        temperatureArcEndIcon,
        temperatureThumbButton,
        temperatureContentBox,
      ));
    const temperatureIncreaseButton = document.createElement("button");
    ((temperatureIncreaseButton.type = "button"),
      (temperatureIncreaseButton.className = "hb-climate-temperature-step"),
      (temperatureIncreaseButton.textContent = "+"),
      temperatureIncreaseButton.setAttribute("aria-label", "提高设定温度"));
    let climateDetailsSnapshot = climateState;
    const climateEffectMode = (climateStateArg: any) =>
        climateEffectMode2(climateStateArg, climateStructureType),
      syncClimateDetails = (nextClimateState = climateDetailsSnapshot) => {
        climateDetailsSnapshot = nextClimateState || climateDetailsSnapshot;
        const climateVisualModeName = climateEffectMode(climateDetailsSnapshot),
          accentBlendAmount = Math.max(
            0,
            Math.min(
              1,
              (targetTemperatureValue - minimumTemperature) /
                Math.max(temperatureStep, maximumTemperature - minimumTemperature),
            ),
          ),
          climateDetailsAccent =
            climateVisualModeName === "cool"
              ? climateModeColors.cool || "#73c8ff"
              : climateVisualModeName === "heat"
                ? climateModeColors.heat || "#ff8a65"
                : climateModeColors.other || "#dce2e6",
          climateDarkAccentColor =
            climateVisualModeName === "off"
              ? "#65717a"
              : climateVisualModeName === "cool"
                ? mixHexColor(climateDetailsAccent, "#ffffff", accentBlendAmount * 0.32)
                : climateVisualModeName === "heat"
                  ? mixHexColor(climateDetailsAccent, "#ffffff", (1 - accentBlendAmount) * 0.3)
                  : climateDetailsAccent;
        ((climateDetailsPanel.dataset.climateVisualMode = climateVisualModeName),
          climateVisualModeName !== "off" &&
            (climateDetailsPanel.dataset.lastClimateMode = String(
              climateDetailsSnapshot?.state || "auto",
            )));
        const gn2 = mixHexColor(climateDarkAccentColor, "#11171c", 0.72);
        (climateDetailsPanel.style.setProperty("--hb-climate-accent", climateDarkAccentColor),
          climateDetailsPanel.style.setProperty("--hb-climate-accent-soft", gn2));
        const isClimateRunningState = climateIsRunning2(
          climateDetailsSnapshot,
          climateStructureType,
        );
        (climateDetailsPanel.classList.toggle("is-running", isClimateRunningState),
          onClimateVisualChange?.({
            mode: climatePresentationMode2(climateDetailsSnapshot, climateStructureType),
            visualMode: climateVisualModeName,
            running: isClimateRunningState,
            accentColor: climateDarkAccentColor,
            accentSoft: gn2,
            targetTemperature: supportsTargetTemperature ? targetTemperatureValue : null,
          }));
        const currentTemperature2 =
          normalizeClimateCapabilities2(climateDetailsSnapshot).currentTemperature;
        temperatureCurrentLabel.textContent =
          currentTemperature2 !== null ? "当前温度 " + currentTemperature2 + "°C" : "当前温度 --";
        const climateServiceStateKey = (climateServiceName: any) =>
          climateServiceName === "set_hvac_mode"
            ? climateDetailsSnapshot?.state
            : climateServiceName === "set_fan_mode"
              ? climateDetailsSnapshot?.attributes?.fan_mode
              : climateServiceName === "set_swing_mode"
                ? climateDetailsSnapshot?.attributes?.swing_mode
                : climateServiceName === "set_swing_horizontal_mode"
                  ? climateDetailsSnapshot?.attributes?.swing_horizontal_mode
                  : climateServiceName === "set_preset_mode"
                    ? climateDetailsSnapshot?.attributes?.preset_mode
                    : climateServiceName === "set_operation_mode"
                      ? climateDetailsSnapshot?.attributes?.operation_mode
                      : null;
        for (const climateServiceButton of climateDetailsPanel.querySelectorAll<HTMLElement>(
          "button[data-climate-service]",
        )) {
          const climateService = climateServiceButton.dataset.climateService,
            climateServiceValue = climateServiceStateKey(climateService);
          climateServiceButton.classList.toggle(
            "active",
            climateServiceButton.dataset.climateValue === String(climateServiceValue ?? ""),
          );
        }
        for (const climateSelectContainer of climateDetailsPanel.querySelectorAll<HTMLElement>(
          ".hb-climate-select[data-climate-service]",
        )) {
          const currentClimateServiceValue = String(
            climateServiceStateKey(climateSelectContainer.dataset.climateService) ?? "",
          );
          climateSelectContainer.dataset.currentValue = currentClimateServiceValue;
          const selectedClimateOption = Array.from(
              climateSelectContainer.querySelectorAll<HTMLElement>('[role="option"]'),
            ).find(
              (climateOptionCandidateElement) =>
                climateOptionCandidateElement.dataset.value === currentClimateServiceValue,
            ),
            climateSelectTriggerLabel = climateSelectContainer.querySelector<HTMLElement>(
              ".hb-climate-select-trigger > span",
            );
          (climateSelectTriggerLabel &&
            ((climateSelectTriggerLabel.textContent =
              selectedClimateOption?.textContent || currentClimateServiceValue || "请选择"),
            (climateSelectTriggerLabel.title = climateSelectTriggerLabel.textContent)),
            climateSelectContainer
              .querySelectorAll<HTMLElement>('[role="option"]')
              .forEach((climateOptionElement) => {
                const isClimateOptionSelected =
                  climateOptionElement.dataset.value === currentClimateServiceValue;
                (climateOptionElement.classList.toggle("active", isClimateOptionSelected),
                  climateOptionElement.setAttribute(
                    "aria-selected",
                    String(isClimateOptionSelected),
                  ));
              }));
        }
      },
      commitClimateChange = (isForcedCommit = false) => {
        temperatureValueLabel.innerHTML = supportsTargetTemperature
          ? targetTemperatureValue + "<small>°C</small>"
          : "--";
        const temperatureProgressValue =
            ((targetTemperatureValue - minimumTemperature) /
              Math.max(temperatureStep, maximumTemperature - minimumTemperature)) *
            75,
          temperatureProgress = Math.max(0, Math.min(75, temperatureProgressValue));
        (temperatureDialBox.style.setProperty(
          "--hb-climate-temperature-progress",
          temperatureProgress + "%",
        ),
          temperatureDialBox.style.setProperty(
            "--hb-climate-thumb-angle",
            225 + (temperatureProgress / 75) * 270 + "deg",
          ),
          temperatureThumbButton.setAttribute("aria-valuemin", String(minimumTemperature)),
          temperatureThumbButton.setAttribute("aria-valuemax", String(maximumTemperature)),
          temperatureThumbButton.setAttribute("aria-valuenow", String(targetTemperatureValue)),
          temperatureThumbButton.setAttribute("aria-valuetext", targetTemperatureValue + "°C"));
        const temperatureStepEpsilon = Math.max(0.001, temperatureStep / 2);
        ((temperatureDecreaseButton.disabled =
          !supportsTargetTemperature ||
          targetTemperatureValue <= minimumTemperature + temperatureStepEpsilon),
          (temperatureIncreaseButton.disabled =
            !supportsTargetTemperature ||
            targetTemperatureValue >= maximumTemperature - temperatureStepEpsilon),
          (temperatureDecreaseButton.title = "最低 " + minimumTemperature + "°C"),
          (temperatureIncreaseButton.title = "最高 " + maximumTemperature + "°C"),
          syncClimateDetails(),
          isForcedCommit &&
            (temperatureValueLabel.classList.remove("is-changing"),
            window.requestAnimationFrame(() =>
              temperatureValueLabel.classList.add("is-changing"),
            )));
      };
    let committedTemperature = targetTemperatureValue;
    const pendingTemperatures: any = [];
    let activePendingTemperature: any = null,
      previousTemperature = targetTemperatureValue,
      isStepPending = false,
      stepTimerId: any = null;
    const areTemperaturesEqual = (temperatureA: any, temperatureB: any) =>
        temperatureA !== null &&
        temperatureB !== null &&
        Math.abs(temperatureA - temperatureB) < 1e-8,
      getPendingTemperature = () => pendingTemperatures.at(-1) ?? activePendingTemperature,
      resetPendingTemperatureQueue = () => {
        const pendingTemperature = getPendingTemperature();
        pendingTemperature !== null && commitTemperature(pendingTemperature);
      },
      flushPendingTemperatures = async () => {
        if (
          (window.clearTimeout(stepTimerId),
          (stepTimerId = null),
          isStepPending || !pendingTemperatures.length)
        )
          return;
        const shift = pendingTemperatures.shift();
        if (
          ((activePendingTemperature = shift), areTemperaturesEqual(shift, committedTemperature))
        ) {
          ((activePendingTemperature = null),
            resetPendingTemperatureQueue(),
            pendingTemperatures.length &&
              (stepTimerId = window.setTimeout(flushPendingTemperatures, 220)));
          return;
        }
        isStepPending = true;
        try {
          (await this.callEntityService(
            climateEntityDomain === "climate" ? "climate" : climateEntityDomain,
            "set_temperature",
            climateDetailsEntityId,
            {
              temperature: shift,
            },
          ),
            (committedTemperature = shift),
            climateEntityDomain !== "water_heater" && onClimatePowerChange?.(true));
        } catch (temperatureCommitError: any) {
          ((pendingTemperatures.length = 0),
            applyCommittedTemperature(),
            (previousTemperature = committedTemperature),
            (targetTemperatureValue = committedTemperature),
            commitClimateChange(true),
            this.options.onError?.(temperatureCommitError));
        } finally {
          ((isStepPending = false),
            (activePendingTemperature = null),
            resetPendingTemperatureQueue(),
            pendingTemperatures.length &&
              (stepTimerId = window.setTimeout(flushPendingTemperatures, 220)));
        }
      },
      applyTemperatureChange = ({
        preserveIntermediateSteps: shouldPreserveIntermediateSteps = true,
      } = {}) => {
        const newTemperature = targetTemperatureValue;
        previousTemperature = newTemperature;
        const latestTemperatureEntry =
          pendingTemperatures.at(-1) ?? activePendingTemperature ?? committedTemperature;
        if (areTemperaturesEqual(newTemperature, latestTemperatureEntry)) {
          resetPendingTemperatureQueue();
          return;
        }
        if (shouldPreserveIntermediateSteps && isWaterHeater) {
          const at2 =
            pendingTemperatures.at(-2) ?? activePendingTemperature ?? committedTemperature;
          pendingTemperatures.length && areTemperaturesEqual(newTemperature, at2)
            ? pendingTemperatures.pop()
            : pendingTemperatures.push(newTemperature);
        } else ((pendingTemperatures.length = 0), pendingTemperatures.push(newTemperature));
        (resetPendingTemperatureQueue(),
          isStepPending ||
            (window.clearTimeout(stepTimerId),
            (stepTimerId = window.setTimeout(flushPendingTemperatures, 160))));
      },
      adjustTemperatureByStep = (stepDirection: any) => {
        if (!isClimateInteractive || !supportsTargetTemperature) return;
        const initialTemperature = targetTemperatureValue,
          temperatureStepDecimals = String(temperatureStep).split(".")[1]?.length || 0;
        ((targetTemperatureValue = Number(
          Math.max(
            minimumTemperature,
            Math.min(maximumTemperature, targetTemperatureValue + stepDirection * temperatureStep),
          ).toFixed(temperatureStepDecimals),
        )),
          targetTemperatureValue !== initialTemperature &&
            (commitClimateChange(true), applyTemperatureChange()));
      },
      temperatureFromPointer = (pointerEvent: any) => {
        const temperatureDialBounds = temperatureDialBox.getBoundingClientRect(),
          dialCenterX = temperatureDialBounds.left + temperatureDialBounds.width / 2,
          dialCenterY = temperatureDialBounds.top + temperatureDialBounds.height / 2,
          pointerOffsetX = pointerEvent.clientX - dialCenterX,
          pointerOffsetY = pointerEvent.clientY - dialCenterY,
          pointerAngleDeg =
            ((Math.atan2(pointerOffsetX, -pointerOffsetY) * 180) / Math.PI + 360) % 360;
        let normalizedAngleDeg;
        pointerAngleDeg >= 225
          ? (normalizedAngleDeg = pointerAngleDeg)
          : pointerAngleDeg <= 135
            ? (normalizedAngleDeg = pointerAngleDeg + 360)
            : (normalizedAngleDeg = pointerAngleDeg <= 180 ? 495 : 225);
        const angleRatio = Math.max(0, Math.min(1, (normalizedAngleDeg - 225) / 270)),
          dialStepDecimals = String(temperatureStep).split(".")[1]?.length || 0;
        return Number(
          (
            minimumTemperature +
            Math.round(((maximumTemperature - minimumTemperature) * angleRatio) / temperatureStep) *
              temperatureStep
          ).toFixed(dialStepDecimals),
        );
      };
    let activePointer: any = null;
    (temperatureDialBox.addEventListener(
      "pointerdown",
      (createClimateDetailsControlsPointerDownEvent) => {
        if (!isClimateInteractive || !supportsTargetTemperature) return;
        const temperatureDialRect = temperatureDialBox.getBoundingClientRect(),
          dialRadius = Math.min(temperatureDialRect.width, temperatureDialRect.height) / 2,
          hypot4 = Math.hypot(
            createClimateDetailsControlsPointerDownEvent.clientX -
              (temperatureDialRect.left + temperatureDialRect.width / 2),
            createClimateDetailsControlsPointerDownEvent.clientY -
              (temperatureDialRect.top + temperatureDialRect.height / 2),
          );
        (createClimateDetailsControlsPointerDownEvent.target !== temperatureThumbButton &&
          Math.abs(hypot4 - dialRadius) > 34) ||
          (createClimateDetailsControlsPointerDownEvent.preventDefault(),
          (activePointer = {
            pointerId: createClimateDetailsControlsPointerDownEvent.pointerId,
            previous: targetTemperatureValue,
          }),
          temperatureDialBox.setPointerCapture(
            createClimateDetailsControlsPointerDownEvent.pointerId,
          ),
          temperatureDialBox.classList.add("is-dragging"),
          (targetTemperatureValue = temperatureFromPointer(
            createClimateDetailsControlsPointerDownEvent,
          )),
          commitClimateChange());
      },
    ),
      temperatureDialBox.addEventListener(
        "pointermove",
        (createClimateDetailsControlsPointerMoveEvent) => {
          !activePointer ||
            createClimateDetailsControlsPointerMoveEvent.pointerId !== activePointer.pointerId ||
            ((targetTemperatureValue = temperatureFromPointer(
              createClimateDetailsControlsPointerMoveEvent,
            )),
            commitClimateChange());
        },
      ));
    const endTemperatureDrag = (createClimateDetailsControlsPointerUpEvent: any) => {
      if (
        !activePointer ||
        createClimateDetailsControlsPointerUpEvent.pointerId !== activePointer.pointerId
      )
        return;
      const previous = activePointer.previous;
      ((activePointer = null),
        temperatureDialBox.classList.remove("is-dragging"),
        temperatureDialBox.hasPointerCapture(
          createClimateDetailsControlsPointerUpEvent.pointerId,
        ) &&
          temperatureDialBox.releasePointerCapture(
            createClimateDetailsControlsPointerUpEvent.pointerId,
          ),
        commitClimateChange(true),
        targetTemperatureValue !== previous &&
          applyTemperatureChange({
            preserveIntermediateSteps: false,
          }));
    };
    (temperatureDialBox.addEventListener("pointerup", endTemperatureDrag),
      temperatureDialBox.addEventListener("pointercancel", endTemperatureDrag),
      (temperatureThumbButton.disabled = !supportsTargetTemperature),
      temperatureDecreaseButton.addEventListener("click", () => adjustTemperatureByStep(-1)),
      temperatureIncreaseButton.addEventListener("click", () => adjustTemperatureByStep(1)),
      commitClimateChange(),
      climateThermostatSection.append(
        temperatureDecreaseButton,
        temperatureDialBox,
        temperatureIncreaseButton,
      ),
      supportsTargetTemperature && climateDetailsPanel.append(climateThermostatSection));
    const waterHeaterControlPanel =
      climateStructureType === "water-heater" ? document.createElement("section") : null;
    waterHeaterControlPanel &&
      ((waterHeaterControlPanel.className = "hb-water-heater-control-panel"),
      (waterHeaterControlPanel.dataset.controlSource = "primary-entity"),
      climateDetailsPanel.append(waterHeaterControlPanel),
      (climateDetailsPanel.waterHeaterControlPanel = waterHeaterControlPanel));
    const createClimateDetailsGroup = ({
        label: groupLabel,
        values: optionValues,
        current: currentOptionValue,
        service: createClimateDetailsGroupServiceName,
        dataKey: servicePayloadField,
        labels: optionLabels = {},
        icons: optionIcons = {},
        className: extraClassName = "",
        domain: createClimateDetailsGroupServiceDomain = "climate",
        presentation: presentationMode = "auto",
      }: any) => {
        const normalizedOptionValues = [
          ...new Set(
            (Array.isArray(optionValues) ? optionValues : [])
              .map((rawOptionValue) => String(rawOptionValue ?? "").trim())
              .filter(Boolean),
          ),
        ];
        if (!normalizedOptionValues.length) return;
        const resolvedPresentation =
            presentationMode === "auto"
              ? climateOptionPresentation2(normalizedOptionValues, optionLabels)
              : presentationMode,
          detailsGroupElement = document.createElement("div");
        ((detailsGroupElement.className = ("hb-climate-details-group " + extraClassName).trim()),
          waterHeaterControlPanel &&
            (detailsGroupElement.dataset.controlSource = "primary-entity"));
        const detailsGroupLabel = document.createElement("strong");
        if (((detailsGroupLabel.textContent = groupLabel), resolvedPresentation === "select")) {
          detailsGroupElement.classList.add("select-options");
          const selectWrapper = document.createElement("div");
          ((selectWrapper.className = "hb-climate-select"),
            (selectWrapper.dataset.climateService = createClimateDetailsGroupServiceName),
            (selectWrapper.dataset.currentValue = String(currentOptionValue ?? "")));
          const selectTriggerButton = document.createElement("button");
          ((selectTriggerButton.type = "button"),
            (selectTriggerButton.className = "hb-climate-select-trigger"),
            selectTriggerButton.setAttribute("aria-label", groupLabel),
            selectTriggerButton.setAttribute("aria-haspopup", "listbox"),
            selectTriggerButton.setAttribute("aria-expanded", "false"),
            (selectTriggerButton.disabled = !isClimateInteractive));
          const selectTriggerLabel = document.createElement("span"),
            selectCaretIcon = document.createElement("i");
          (selectCaretIcon.setAttribute("aria-hidden", "true"),
            selectTriggerButton.append(selectTriggerLabel, selectCaretIcon));
          const selectMenuElement = document.createElement("div");
          ((selectMenuElement.className = "hb-climate-select-menu"),
            (selectMenuElement.id = "hb-climate-select-" + randomUuid2()),
            selectMenuElement.setAttribute("role", "listbox"),
            selectMenuElement.setAttribute("aria-label", groupLabel),
            selectMenuElement.setAttribute("popover", "auto"),
            (selectMenuElement.hidden = true),
            selectTriggerButton.setAttribute("aria-controls", selectMenuElement.id));
          let isMenuBusy = false;
          const isSelectMenuOpen = () => {
              try {
                return selectMenuElement.matches(":popover-open");
              } catch {
                return selectMenuElement.dataset.open === "true";
              }
            },
            applySelectValue = (selectedValue: any) => {
              const normalizedSelectedValue = String(selectedValue ?? "");
              selectWrapper.dataset.currentValue = normalizedSelectedValue;
              const selectedMenuOption = Array.from(
                selectMenuElement.querySelectorAll<HTMLElement>('[role="option"]'),
              ).find(
                (optionMatchElement) =>
                  optionMatchElement.dataset.value === normalizedSelectedValue,
              );
              ((selectTriggerLabel.textContent =
                selectedMenuOption?.textContent || normalizedSelectedValue || "请选择"),
                (selectTriggerLabel.title = selectTriggerLabel.textContent),
                selectMenuElement
                  .querySelectorAll<HTMLElement>('[role="option"]')
                  .forEach((menuOptionElement) => {
                    const isMenuOptionSelected =
                      menuOptionElement.dataset.value === normalizedSelectedValue;
                    (menuOptionElement.classList.toggle("active", isMenuOptionSelected),
                      menuOptionElement.setAttribute(
                        "aria-selected",
                        String(isMenuOptionSelected),
                      ));
                  }));
            },
            positionSelectMenu = () => {
              if (!isSelectMenuOpen() && selectMenuElement.hidden) return;
              const triggerBounds = selectTriggerButton.getBoundingClientRect(),
                innerWidth2 = window.innerWidth,
                innerHeight2 = window.innerHeight,
                menuWidth = Math.min(
                  Math.max(triggerBounds.width, 190),
                  Math.max(190, innerWidth2 - 20),
                );
              ((selectMenuElement.style.width = menuWidth + "px"),
                (selectMenuElement.style.maxHeight =
                  Math.min(360, Math.max(120, innerHeight2 - 20)) + "px"));
              const menuHeight = Math.min(selectMenuElement.scrollHeight || 0, 360),
                selectSpaceBelow = innerHeight2 - triggerBounds.bottom - 10,
                selectSpaceAbove = triggerBounds.top - 10,
                menuTop =
                  selectSpaceBelow < Math.min(menuHeight, 180) &&
                  selectSpaceAbove > selectSpaceBelow
                    ? Math.max(10, triggerBounds.top - menuHeight - 5)
                    : Math.min(innerHeight2 - menuHeight - 10, triggerBounds.bottom + 5);
              ((selectMenuElement.style.left =
                Math.max(10, Math.min(triggerBounds.left, innerWidth2 - menuWidth - 10)) + "px"),
                (selectMenuElement.style.top = Math.max(10, menuTop) + "px"));
            },
            openSelectMenu = () => {
              (isSelectMenuOpen() &&
                typeof selectMenuElement.hidePopover == "function" &&
                selectMenuElement.hidePopover(),
                (selectMenuElement.hidden = true),
                (selectMenuElement.dataset.open = "false"),
                selectTriggerButton.setAttribute("aria-expanded", "false"));
            },
            closeSelectMenu = (shouldFocusTrigger = false) => {
              selectTriggerButton.disabled ||
                isMenuBusy ||
                ((selectMenuElement.hidden = false),
                typeof selectMenuElement.showPopover == "function"
                  ? selectMenuElement.showPopover()
                  : (selectMenuElement.dataset.open = "true"),
                selectTriggerButton.setAttribute("aria-expanded", "true"),
                positionSelectMenu(),
                shouldFocusTrigger &&
                  (
                    selectMenuElement.querySelector<HTMLElement>('[aria-selected="true"]') ||
                    selectMenuElement.querySelector<HTMLElement>('[role="option"]')
                  )?.focus());
            },
            selectClimateOption = async (optionValue: any) => {
              if (!isClimateInteractive || isMenuBusy) return;
              const currentValue = selectWrapper.dataset.currentValue;
              ((isMenuBusy = true),
                (selectTriggerButton.disabled = true),
                openSelectMenu(),
                applySelectValue(optionValue));
              try {
                await this.callEntityService(
                  createClimateDetailsGroupServiceDomain,
                  createClimateDetailsGroupServiceName,
                  climateDetailsEntityId,
                  {
                    [servicePayloadField]: optionValue,
                  },
                );
                const detailsGroupOptions = {
                  ...(climateDetailsSnapshot?.attributes || {}),
                  [servicePayloadField]: optionValue,
                };
                if (createClimateDetailsGroupServiceName === "set_hvac_mode")
                  ((climateDetailsSnapshot = {
                    ...(climateDetailsSnapshot || {}),
                    state: optionValue,
                    attributes: {
                      ...detailsGroupOptions,
                      hvac_action:
                        optionValue === "cool"
                          ? "cooling"
                          : optionValue === "heat"
                            ? "heating"
                            : optionValue === "off"
                              ? "off"
                              : optionValue,
                    },
                  }),
                    onClimatePowerChange?.(optionValue !== "off"));
                else {
                  if (createClimateDetailsGroupServiceName === "set_preset_mode") {
                    const isClimateActive =
                        climateStructureType === "bath-heater" &&
                        ["idle", "standby", "待机", "关闭"].includes(
                          String(optionValue).trim().toLowerCase(),
                        ),
                      unknownStateText =
                        climateDetailsPanel.dataset.lastClimateMode ||
                        climateNormalizedCapabilities.hvacModes.find(
                          (hvacModeCandidate) => hvacModeCandidate !== "off",
                        ) ||
                        (climateEntityDomain === "fan" ? "on" : "auto"),
                      climateStateOptions = {
                        ...(climateDetailsSnapshot || {}),
                        state: isClimateActive
                          ? "off"
                          : climateIsPoweredOn2(climateDetailsSnapshot, climateStructureType)
                            ? climateDetailsSnapshot?.state
                            : unknownStateText,
                        attributes: {
                          ...detailsGroupOptions,
                          preset_mode: optionValue,
                        },
                      },
                      effectMode = climateEffectMode2(climateStateOptions, climateStructureType);
                    ((climateStateOptions.attributes.hvac_action = isClimateActive
                      ? "idle"
                      : effectMode === "cool"
                        ? "cooling"
                        : effectMode === "heat"
                          ? "heating"
                          : "fan"),
                      (climateDetailsSnapshot = climateStateOptions),
                      onClimatePowerChange?.(!isClimateActive));
                  } else
                    createClimateDetailsGroupServiceName === "set_operation_mode"
                      ? ((climateDetailsSnapshot = {
                          ...(climateDetailsSnapshot || {}),
                          state: optionValue === "off" ? "off" : "on",
                          attributes: {
                            ...detailsGroupOptions,
                            operation_mode: optionValue,
                          },
                        }),
                        onClimatePowerChange?.(optionValue !== "off"))
                      : (climateDetailsSnapshot = {
                          ...(climateDetailsSnapshot || {}),
                          attributes: detailsGroupOptions,
                        });
                }
                syncClimateDetails();
              } catch (climateUpdateError: any) {
                (applySelectValue(currentValue), this.options.onError?.(climateUpdateError));
              } finally {
                ((isMenuBusy = false), (selectTriggerButton.disabled = !isClimateInteractive));
              }
            };
          for (const climateModeValue of normalizedOptionValues) {
            const climateOptionButton = document.createElement("button");
            ((climateOptionButton.type = "button"),
              (climateOptionButton.className = "hb-climate-select-option"),
              climateOptionButton.setAttribute("role", "option"),
              (climateOptionButton.dataset.value = climateModeValue),
              (climateOptionButton.textContent =
                optionLabels[climateModeValue] || climateModeValue),
              (climateOptionButton.title = climateOptionButton.textContent),
              climateOptionButton.addEventListener("click", () =>
                selectClimateOption(climateModeValue),
              ),
              selectMenuElement.append(climateOptionButton));
          }
          (applySelectValue(String(currentOptionValue ?? "")),
            selectTriggerButton.addEventListener("click", () => {
              isSelectMenuOpen() || selectMenuElement.dataset.open === "true"
                ? openSelectMenu()
                : closeSelectMenu();
            }),
            selectTriggerButton.addEventListener("keydown", (triggerKeyEvent) => {
              ["ArrowDown", "ArrowUp", "Enter", " "].includes(triggerKeyEvent.key) &&
                (triggerKeyEvent.preventDefault(), closeSelectMenu(true));
            }),
            selectMenuElement.addEventListener("keydown", (menuKeyEvent) => {
              const menuOptions = [
                  ...selectMenuElement.querySelectorAll<HTMLElement>('[role="option"]'),
                ],
                indexOf2 = menuOptions.findIndex(
                  (menuOptionElement) => menuOptionElement === document.activeElement,
                );
              if (menuKeyEvent.key === "Escape")
                (menuKeyEvent.preventDefault(), openSelectMenu(), selectTriggerButton.focus());
              else {
                if (menuKeyEvent.key === "ArrowDown" || menuKeyEvent.key === "ArrowUp") {
                  menuKeyEvent.preventDefault();
                  const keyDirection = menuKeyEvent.key === "ArrowDown" ? 1 : -1;
                  menuOptions[
                    (indexOf2 + keyDirection + menuOptions.length) % menuOptions.length
                  ]?.focus();
                } else
                  (menuKeyEvent.key === "Enter" || menuKeyEvent.key === " ") &&
                    (menuKeyEvent.preventDefault(), clickFocusedElement());
              }
            }),
            selectMenuElement.addEventListener("toggle", (toggleEvent) => {
              const isMenuOpen = toggleEvent.newState === "open";
              ((selectMenuElement.hidden = !isMenuOpen),
                (selectMenuElement.dataset.open = String(isMenuOpen)),
                selectTriggerButton.setAttribute("aria-expanded", String(isMenuOpen)),
                isMenuOpen && positionSelectMenu());
            }),
            selectWrapper.append(selectTriggerButton, selectMenuElement),
            detailsGroupElement.append(detailsGroupLabel, selectWrapper),
            (waterHeaterControlPanel || climateDetailsPanel).append(detailsGroupElement));
          return;
        }
        const detailsOptionsWrapper = document.createElement("div");
        detailsOptionsWrapper.className = "hb-climate-details-options";
        for (const detailsOptionValue of normalizedOptionValues) {
          const detailsOptionButton = document.createElement("button");
          ((detailsOptionButton.type = "button"),
            (detailsOptionButton.dataset.climateService = createClimateDetailsGroupServiceName),
            (detailsOptionButton.dataset.climateValue = detailsOptionValue));
          const detailsOptionIcon = document.createElement("i");
          (detailsOptionIcon.setAttribute("aria-hidden", "true"),
            (detailsOptionIcon.textContent = optionIcons[detailsOptionValue] || ""));
          const detailsOptionLabel = document.createElement("span");
          ((detailsOptionLabel.textContent =
            optionLabels[detailsOptionValue] || detailsOptionValue),
            detailsOptionButton.append(detailsOptionIcon, detailsOptionLabel),
            detailsOptionButton.classList.toggle(
              "active",
              detailsOptionValue === currentOptionValue,
            ),
            detailsOptionButton.addEventListener("click", async () => {
              if (!isClimateInteractive) return;
              const isDetailActive =
                climateStructureType === "bath-heater" &&
                createClimateDetailsGroupServiceName === "set_preset_mode" &&
                ["idle", "standby", "待机", "关闭"].includes(
                  String(detailsOptionValue).trim().toLowerCase(),
                );
              detailsOptionsWrapper.querySelectorAll("button").forEach((disabledOptionButton) => {
                disabledOptionButton.disabled = true;
              });
              try {
                if (
                  (await this.callEntityService(
                    createClimateDetailsGroupServiceDomain,
                    createClimateDetailsGroupServiceName,
                    climateDetailsEntityId,
                    {
                      [servicePayloadField]: detailsOptionValue,
                    },
                  ),
                  isDetailActive)
                ) {
                  const powerCommand = climatePowerCommand2(
                    climateDetailsEntityId,
                    climateDetailsSnapshot,
                    false,
                    "bath-heater",
                  );
                  await this.callEntityService(
                    powerCommand.domain,
                    powerCommand.service,
                    climateDetailsEntityId,
                    powerCommand.data,
                  );
                }
                if (
                  (detailsOptionsWrapper
                    .querySelectorAll("button")
                    .forEach((activeOptionButton) =>
                      activeOptionButton.classList.toggle(
                        "active",
                        activeOptionButton === detailsOptionButton,
                      ),
                    ),
                  createClimateDetailsGroupServiceName === "set_hvac_mode")
                ) {
                  const hvacActionText =
                    detailsOptionValue === "cool"
                      ? "cooling"
                      : detailsOptionValue === "heat"
                        ? "heating"
                        : detailsOptionValue === "off"
                          ? "off"
                          : detailsOptionValue;
                  ((climateDetailsSnapshot = {
                    ...(climateDetailsSnapshot || {}),
                    state: detailsOptionValue,
                    attributes: {
                      ...(climateDetailsSnapshot?.attributes || {}),
                      hvac_action: hvacActionText,
                    },
                  }),
                    syncClimateDetails(),
                    onClimatePowerChange?.(detailsOptionValue !== "off"));
                } else {
                  if (createClimateDetailsGroupServiceName === "set_preset_mode") {
                    const isOptionActive = isDetailActive,
                      defaultStateText =
                        climateDetailsPanel.dataset.lastClimateMode ||
                        climateNormalizedCapabilities.hvacModes.find(
                          (hvacModeItem) => hvacModeItem !== "off",
                        ) ||
                        (climateEntityDomain === "fan" ? "on" : "auto"),
                      waterHeaterStateOptions = {
                        ...(climateDetailsSnapshot || {}),
                        state: isOptionActive
                          ? "off"
                          : climateIsPoweredOn2(climateDetailsSnapshot, climateStructureType)
                            ? climateDetailsSnapshot?.state
                            : defaultStateText,
                        attributes: {
                          ...(climateDetailsSnapshot?.attributes || {}),
                          preset_mode: detailsOptionValue,
                        },
                      },
                      waterHeaterEffectMode = climateEffectMode2(
                        waterHeaterStateOptions,
                        climateStructureType,
                      );
                    ((waterHeaterStateOptions.attributes.hvac_action = isOptionActive
                      ? "idle"
                      : waterHeaterEffectMode === "cool"
                        ? "cooling"
                        : waterHeaterEffectMode === "heat"
                          ? "heating"
                          : "fan"),
                      (climateDetailsSnapshot = waterHeaterStateOptions),
                      syncClimateDetails(),
                      onClimatePowerChange?.(!isOptionActive));
                  } else
                    createClimateDetailsGroupServiceName === "set_operation_mode" &&
                      ((climateDetailsSnapshot = {
                        ...(climateDetailsSnapshot || {}),
                        state: detailsOptionValue === "off" ? "off" : "on",
                        attributes: {
                          ...(climateDetailsSnapshot?.attributes || {}),
                          operation_mode: detailsOptionValue,
                        },
                      }),
                      syncClimateDetails(),
                      onClimatePowerChange?.(detailsOptionValue !== "off"));
                }
              } catch (waterHeaterUpdateError: any) {
                this.options.onError?.(waterHeaterUpdateError);
              } finally {
                detailsOptionsWrapper.querySelectorAll("button").forEach((enabledOptionButton) => {
                  enabledOptionButton.disabled = false;
                });
              }
            }),
            detailsOptionsWrapper.append(detailsOptionButton));
        }
        (detailsGroupElement.append(detailsGroupLabel, detailsOptionsWrapper),
          (waterHeaterControlPanel || climateDetailsPanel).append(detailsGroupElement));
      },
      operationModeValues = climateOperationModeValues2(climateState, climateStructureType),
      modeLabelEntries = Object.fromEntries(
        operationModeValues.map((modeValue) => [
          modeValue,
          climateModeLabel2(modeValue, climateStructureType, climateModeOptionLabels),
        ]),
      ),
      modeIconEntries = Object.fromEntries(
        operationModeValues.map((iconModeValue) => [
          iconModeValue,
          climateModeIcon2(iconModeValue, climateStructureType),
        ]),
      );
    createClimateDetailsGroup({
      label: "运行模式",
      values: operationModeValues,
      current: String(
        climateStructureType === "water-heater"
          ? attributes2.operation_mode || ""
          : climateState?.state || "",
      ),
      service: climateStructureType === "water-heater" ? "set_operation_mode" : "set_hvac_mode",
      dataKey: climateStructureType === "water-heater" ? "operation_mode" : "hvac_mode",
      labels: modeLabelEntries,
      icons: modeIconEntries,
      className: "mode-options",
      domain: climateStructureType === "water-heater" ? "water_heater" : "climate",
      presentation: climateOptionPresentation2(operationModeValues, modeLabelEntries),
    });
    const fanModes =
      climateEntityDomain === "climate" ? climateNormalizedCapabilities.fanModes : [];
    if (fanModes.length) {
      const fanModeLabels = {
          silent: "静音",
          low: "低",
          medium: "中",
          high: "高",
          full: "强劲",
          auto: "自动",
          1: "一档",
          2: "二档",
          3: "三档",
          4: "四档",
          5: "五档",
          6: "六档",
          7: "七档",
          max: "Max档",
        },
        autoFanMode = fanModes.find((fanModeCandidate) =>
          ["auto", "自动"].includes(String(fanModeCandidate).toLowerCase()),
        ),
        manualFanModes = fanModes.filter((fanModeOption) => fanModeOption !== autoFanMode),
        fanSliderSection = document.createElement("section");
      fanSliderSection.className = "hb-climate-fan-slider";
      const fanSliderHeading = document.createElement("span");
      fanSliderHeading.className = "hb-climate-fan-slider-heading";
      const fanSliderIcon = document.createElement("i");
      (fanSliderIcon.setAttribute("aria-hidden", "true"), (fanSliderIcon.textContent = "✾"));
      const fanSliderLabel = document.createElement("strong");
      fanSliderLabel.textContent = "风速";
      const fanSpeedBadge = document.createElement("output"),
        fanModeIndex = Math.max(0, manualFanModes.indexOf(attributes2.fan_mode));
      let committedFanModeIndex = fanModeIndex,
        isAutoFanMode = !!(autoFanMode && attributes2.fan_mode === autoFanMode),
        fan_mode = attributes2.fan_mode;
      const fanSpeedSlider = document.createElement("input");
      ((fanSpeedSlider.type = "range"),
        (fanSpeedSlider.min = "0"),
        (fanSpeedSlider.max = String(Math.max(0, manualFanModes.length - 1))),
        (fanSpeedSlider.step = "1"),
        (fanSpeedSlider.value = String(fanModeIndex)),
        (fanSpeedSlider.disabled = manualFanModes.length === 0));
      const fanModeDisplayLabel = (fanModeIndexValue: any) =>
          (fanModeLabels as any)[String(manualFanModes[fanModeIndexValue]).toLowerCase()] ||
          manualFanModes[fanModeIndexValue] ||
          "--",
        fanAutoButton = document.createElement("button");
      ((fanAutoButton.type = "button"),
        (fanAutoButton.className = "hb-climate-fan-auto"),
        (fanAutoButton.textContent = "自动"),
        (fanAutoButton.hidden = !autoFanMode),
        fanAutoButton.classList.toggle("active", isAutoFanMode));
      const resetFanSlider = () => {
        const fanSliderIndex = Number(fanSpeedSlider.value),
          fanProgressPercent =
            manualFanModes.length > 1 ? (fanSliderIndex / (manualFanModes.length - 1)) * 100 : 100;
        ((fanSpeedBadge.textContent = isAutoFanMode ? "自动" : fanModeDisplayLabel(fanSliderIndex)),
          fanSpeedSlider.style.setProperty("--hb-climate-fan-progress", fanProgressPercent + "%"));
      };
      (fanSliderHeading.append(fanSliderIcon, fanSliderLabel, fanSpeedBadge, fanAutoButton),
        fanSpeedSlider.addEventListener("input", () => {
          ((isAutoFanMode = false), fanAutoButton.classList.remove("active"), resetFanSlider());
        }),
        fanSpeedSlider.addEventListener("change", async () => {
          if (!isClimateInteractive || !manualFanModes.length) return;
          const fanSliderValue = Number(fanSpeedSlider.value),
            selectedFanMode = manualFanModes[fanSliderValue];
          ((fanSpeedSlider.disabled = true), (fanAutoButton.disabled = true));
          try {
            (await this.callEntityService("climate", "set_fan_mode", climateDetailsEntityId, {
              fan_mode: selectedFanMode,
            }),
              (committedFanModeIndex = fanSliderValue),
              (fan_mode = selectedFanMode),
              (isAutoFanMode = false));
          } catch (fanSpeedUpdateError: any) {
            ((isAutoFanMode = !!(autoFanMode && fan_mode === autoFanMode)),
              isAutoFanMode || (fanSpeedSlider.value = String(committedFanModeIndex)),
              fanAutoButton.classList.toggle("active", isAutoFanMode),
              resetFanSlider(),
              this.options.onError?.(fanSpeedUpdateError));
          } finally {
            ((fanSpeedSlider.disabled = false), (fanAutoButton.disabled = false));
          }
        }),
        fanAutoButton.addEventListener("click", async () => {
          if (!(!isClimateInteractive || !autoFanMode || fanAutoButton.disabled)) {
            ((fanSpeedSlider.disabled = true), (fanAutoButton.disabled = true));
            try {
              (await this.callEntityService("climate", "set_fan_mode", climateDetailsEntityId, {
                fan_mode: autoFanMode,
              }),
                (isAutoFanMode = true),
                (fan_mode = autoFanMode),
                fanAutoButton.classList.add("active"),
                resetFanSlider());
            } catch (fanSpeedCommitError: any) {
              this.options.onError?.(fanSpeedCommitError);
            } finally {
              ((fanSpeedSlider.disabled = manualFanModes.length === 0),
                (fanAutoButton.disabled = false));
            }
          }
        }));
      const fanSliderLegend = document.createElement("span");
      fanSliderLegend.className = "hb-climate-fan-slider-legend";
      const fanSliderMinLabel = document.createElement("small");
      fanSliderMinLabel.textContent = fanModeDisplayLabel(0);
      const fanSliderMaxLabel = document.createElement("small");
      ((fanSliderMaxLabel.textContent = fanModeDisplayLabel(manualFanModes.length - 1)),
        fanSliderLegend.append(fanSliderMinLabel, fanSliderMaxLabel),
        resetFanSlider(),
        fanSliderSection.append(fanSliderHeading, fanSpeedSlider, fanSliderLegend),
        climateDetailsPanel.append(fanSliderSection));
    }
    let fanCapabilitiesListener: any = null;
    if (climateEntityDomain === "fan" && climateNormalizedCapabilities.supportsFanPercentage) {
      const fanPercentageSection = document.createElement("section");
      fanPercentageSection.className = "hb-climate-fan-slider";
      const fanPercentageHeading = document.createElement("span");
      fanPercentageHeading.className = "hb-climate-fan-slider-heading";
      const fanPercentageIcon = document.createElement("i");
      (fanPercentageIcon.setAttribute("aria-hidden", "true"),
        (fanPercentageIcon.textContent = "✾"));
      const fanPercentageLabel = document.createElement("strong");
      fanPercentageLabel.textContent = "风速";
      const fanPercentageBadge = document.createElement("output");
      let fanSpeedPercent = Math.max(0, Math.min(100, climateNormalizedCapabilities.fanPercentage));
      const fanPercentageSlider = document.createElement("input");
      ((fanPercentageSlider.type = "range"),
        (fanPercentageSlider.min = "0"),
        (fanPercentageSlider.max = "100"),
        (fanPercentageSlider.step = String(climateNormalizedCapabilities.fanPercentageStep)),
        (fanPercentageSlider.value = String(fanSpeedPercent)));
      const syncFanPercentage = () => {
        const fanPercentageValue = Math.max(
          0,
          Math.min(100, Number(fanPercentageSlider.value) || 0),
        );
        ((fanPercentageBadge.textContent = Math.round(fanPercentageValue) + "%"),
          fanPercentageSlider.style.setProperty(
            "--hb-climate-fan-progress",
            fanPercentageValue + "%",
          ));
      };
      ((fanCapabilitiesListener = (capabilitiesPayload: any) => {
        const fanPercentage = normalizeClimateCapabilities2(capabilitiesPayload).fanPercentage;
        fanPercentage !== null &&
          ((fanSpeedPercent = Math.max(0, Math.min(100, fanPercentage))),
          (fanPercentageSlider.value = String(fanSpeedPercent)),
          syncFanPercentage());
      }),
        fanPercentageSlider.addEventListener("input", syncFanPercentage),
        fanPercentageSlider.addEventListener("change", async () => {
          if (!isClimateInteractive || fanPercentageSlider.disabled) return;
          const normalizedFanPercentage = Math.max(
            0,
            Math.min(100, Number(fanPercentageSlider.value) || 0),
          );
          fanPercentageSlider.disabled = true;
          try {
            (await this.callEntityService("fan", "set_percentage", climateDetailsEntityId, {
              percentage: normalizedFanPercentage,
            }),
              (fanSpeedPercent = normalizedFanPercentage),
              (climateDetailsSnapshot = {
                ...(climateDetailsSnapshot || {}),
                state: normalizedFanPercentage > 0 ? "on" : "off",
                attributes: {
                  ...(climateDetailsSnapshot?.attributes || {}),
                  percentage: normalizedFanPercentage,
                },
              }),
              syncClimateDetails(),
              onClimatePowerChange?.(normalizedFanPercentage > 0));
          } catch (fanPercentageError: any) {
            ((fanPercentageSlider.value = String(fanSpeedPercent)),
              syncFanPercentage(),
              this.options.onError?.(fanPercentageError));
          } finally {
            fanPercentageSlider.disabled = false;
          }
        }));
      const fanPercentageLegend = document.createElement("span");
      fanPercentageLegend.className = "hb-climate-fan-slider-legend";
      const fanPercentageOffLabel = document.createElement("small");
      fanPercentageOffLabel.textContent = "关闭";
      const fanPercentageMaxLabel = document.createElement("small");
      ((fanPercentageMaxLabel.textContent = "最大"),
        fanPercentageLegend.append(fanPercentageOffLabel, fanPercentageMaxLabel),
        fanPercentageHeading.append(fanPercentageIcon, fanPercentageLabel, fanPercentageBadge),
        syncFanPercentage(),
        fanPercentageSection.append(fanPercentageHeading, fanPercentageSlider, fanPercentageLegend),
        climateDetailsPanel.append(fanPercentageSection));
    }
    const swingModeLabels = Object.fromEntries(
      climateNormalizedCapabilities.swingModes.map((swingMode) => [
        swingMode,
        climateSwingModeLabel2(swingMode, "vertical", climateModeOptionLabels),
      ]),
    );
    createClimateDetailsGroup({
      label: climateNormalizedCapabilities.horizontalSwingModes.length ? "纵向摆风" : "摆风",
      values: climateNormalizedCapabilities.swingModes,
      current: attributes2.swing_mode,
      service: "set_swing_mode",
      dataKey: "swing_mode",
      labels: swingModeLabels,
      icons: {
        off: "—",
        vertical: "↕",
        horizontal: "↔",
        both: "✣",
      },
      className: "compact-options",
      presentation: climateOptionPresentation2(
        climateNormalizedCapabilities.swingModes,
        swingModeLabels,
        {
          inlineIcon: true,
        },
      ),
    });
    const horizontalSwingLabels = Object.fromEntries(
      climateNormalizedCapabilities.horizontalSwingModes.map((horizontalSwingMode) => [
        horizontalSwingMode,
        climateSwingModeLabel2(horizontalSwingMode, "horizontal", climateModeOptionLabels),
      ]),
    );
    createClimateDetailsGroup({
      label: "水平摆风",
      values: climateNormalizedCapabilities.horizontalSwingModes,
      current: attributes2.swing_horizontal_mode,
      service: "set_swing_horizontal_mode",
      dataKey: "swing_horizontal_mode",
      labels: horizontalSwingLabels,
      className: "compact-options",
      presentation: climateOptionPresentation2(
        climateNormalizedCapabilities.horizontalSwingModes,
        horizontalSwingLabels,
        {
          inlineIcon: true,
        },
      ),
    });
    const presetModeLabels = Object.fromEntries(
        climateNormalizedCapabilities.presetModes.map((presetMode) => [
          presetMode,
          climateModeLabel2(presetMode, climateStructureType, climateModeOptionLabels),
        ]),
      ),
      presetModeIcons = Object.fromEntries(
        climateNormalizedCapabilities.presetModes.map((presetIconMode) => [
          presetIconMode,
          climateModeIcon2(presetIconMode, climateStructureType),
        ]),
      );
    createClimateDetailsGroup({
      label: "预设模式",
      values: climateNormalizedCapabilities.presetModes,
      current: attributes2.preset_mode,
      service: "set_preset_mode",
      dataKey: "preset_mode",
      labels: presetModeLabels,
      icons: presetModeIcons,
      className: "compact-options",
      domain: climateEntityDomain === "fan" ? "fan" : "climate",
      presentation: climateOptionPresentation2(
        climateNormalizedCapabilities.presetModes,
        presetModeLabels,
        {
          inlineIcon: true,
        },
      ),
    });
    let climateStateListener: any = null;
    if (!climateDetailsPanel.childElementCount) {
      const climateLoadingSection = document.createElement("section");
      climateLoadingSection.className = "hb-climate-details-loading";
      const climateLoadingIcon = document.createElement("i");
      climateLoadingIcon.setAttribute("aria-hidden", "true");
      const climateLoadingLabel = document.createElement("strong"),
        climateLoadingHint = document.createElement("span");
      ((climateStateListener = (climateLoadingStatePayload: any) => {
        const lowerCase8 = String(climateLoadingStatePayload?.state || "")
            .trim()
            .toLowerCase(),
          isClimateLoading = !climateLoadingStatePayload || !lowerCase8 || lowerCase8 === "unknown",
          isClimateUnavailable = lowerCase8 === "unavailable";
        (climateLoadingSection.classList.toggle("is-loading", isClimateLoading),
          climateLoadingSection.classList.toggle("is-unavailable", isClimateUnavailable),
          (climateLoadingLabel.textContent = isClimateLoading
            ? "—"
            : isClimateUnavailable
              ? "设备当前不可用"
              : "暂无可用控制数据"),
          (climateLoadingHint.textContent =
            isClimateLoading || isClimateUnavailable
              ? ""
              : "请检查该实体在 Home Assistant 中提供的控制能力"));
      }),
        climateStateListener(climateState),
        climateLoadingSection.append(climateLoadingIcon, climateLoadingLabel, climateLoadingHint),
        climateDetailsPanel.append(climateLoadingSection));
    }
    return (
      (climateDetailsPanel.syncClimateGrid = () => {
        const thermostatChildren = Array.from(
            climateDetailsPanel.querySelectorAll<HTMLElement>(":scope > *"),
          ),
          thermostatElement = thermostatChildren.find((thermostatCandidateElement) =>
            thermostatCandidateElement.classList.contains("hb-climate-thermostat"),
          );
        if (!thermostatElement) return;
        const waterHeaterElement = thermostatChildren.find((waterHeaterCandidateElement) =>
            waterHeaterCandidateElement.classList.contains("is-water-heater"),
          ),
          remainingControlCount = thermostatChildren.filter(
            (controlElement) =>
              controlElement !== thermostatElement && controlElement !== waterHeaterElement,
          ).length;
        ((thermostatElement.style.gridRow = "1 / span " + Math.max(1, remainingControlCount)),
          waterHeaterElement &&
            (waterHeaterElement.style.gridRow = "1 / span " + Math.max(1, remainingControlCount)));
      }),
      climateDetailsPanel.syncClimateGrid(),
      (climateDetailsPanel.syncClimateState = (climateStateSnapshot) => {
        if (!climateStateSnapshot) return;
        ((climateDetailsSnapshot = climateStateSnapshot),
          climateStateListener?.(climateStateSnapshot),
          fanCapabilitiesListener?.(climateStateSnapshot));
        const targetTemperature3 =
            normalizeClimateCapabilities2(climateStateSnapshot).targetTemperature,
          reconciledTemperature = reconcileClimateTargetTemperature2(
            previousTemperature,
            targetTemperature3,
            temperatureCommitTimer,
            temperatureStep,
          );
        ((temperatureCommitTimer === null || reconciledTemperature.confirmed) &&
          (previousTemperature = reconciledTemperature.temperature),
          (targetTemperatureValue = previousTemperature),
          targetTemperature3 !== null &&
            (temperatureCommitTimer === null || reconciledTemperature.confirmed) &&
            (committedTemperature = targetTemperature3),
          temperatureCommitTimer !== null &&
            reconciledTemperature.confirmed &&
            (isWaterHeater ? applyLocalTemperature() : applyCommittedTemperature()),
          commitClimateChange());
      }),
      (climateDetailsPanel.cleanupClimateDetails = () => {
        (window.clearTimeout(stepTimerId),
          (stepTimerId = null),
          (pendingTemperatures.length = 0),
          (activePendingTemperature = null),
          applyCommittedTemperature());
      }),
      syncClimateDetails(),
      climateDetailsPanel
    );
  }
