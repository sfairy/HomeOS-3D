import type { ComponentControllerElement } from "../renderer-types";
import type { PanelRenderer } from "../panel-renderer";
import { clickFocusedElement, createSwitchVisual } from "../renderer-helpers";
import { climateModeLabel as climateModeLabel2, resolveClimateDeviceType as resolveClimateDeviceType2 } from "../controls/climate";
import { syncHtmlRangeProgress as syncHtmlRangeProgress2 } from "../../shared/util/range-progress";
import { positionScaledPopupMenu } from "../../shared/util/editor-floating-layout";

export function createCapabilityDetailsControls(this: PanelRenderer, 
    capabilityEntityId: any,
    externalStateSnapshot: any,
    {
      interactive: isControlsInteractive = true,
      variant: capabilityVariant = "",
      selectLabel: selectLabel = "模式",
    } = {},
  ): ComponentControllerElement {
    const capabilityControlsSection: ComponentControllerElement = document.createElement("section");
    ((capabilityControlsSection.className =
      "hb-capability-details-controls" +
      (capabilityVariant ? " hb-capability-details-controls--" + capabilityVariant : "")),
      (capabilityControlsSection.inert = !isControlsInteractive));
    const capabilityDomain = String(capabilityEntityId || "").split(".", 1)[0];
    let capabilityEntityState = externalStateSnapshot || {
      entityId: capabilityEntityId,
      state: "unknown",
      attributes: {} as Record<string, any>,
    };
    const componentDeviceType =
        capabilityDomain === "fan"
          ? resolveClimateDeviceType2(
              {
                properties: {} as Record<string, any>,
              },
              capabilityEntityState,
              capabilityEntityId,
            )
          : "generic",
      modeLabelOverrides = {
        entityId: capabilityEntityId,
        entityMetadata: this.entityMetadata,
        entityTranslations: this.entityTranslations,
      },
      getEntityAttributes = () => capabilityEntityState?.attributes || {},
      isCapabilityUnavailable = () =>
        ["unknown", "unavailable"].includes(
          String(capabilityEntityState?.state || "").toLowerCase(),
        ),
      controlDescriptors: any = [],
      isPowerToggleCapable = ["fan", "switch", "input_boolean"].includes(capabilityDomain),
      hn2 = createSwitchVisual({
        label: "电源",
        interactive: isControlsInteractive,
        compact: capabilityVariant === "air-purifier",
        onToggle: async () => {
          if (!isControlsInteractive || isCapabilityUnavailable()) return;
          const isTurnedOff = String(capabilityEntityState?.state || "").toLowerCase() === "off",
            previousState = capabilityEntityState;
          ((capabilityEntityState = {
            ...capabilityEntityState,
            state: isTurnedOff ? "on" : "off",
          }),
            syncEntityState(capabilityEntityState));
          try {
            await this.callEntityService(
              capabilityDomain === "fan" ? "fan" : "homeassistant",
              capabilityDomain === "fan" ? (isTurnedOff ? "turn_on" : "turn_off") : "toggle",
              capabilityEntityId,
            );
          } catch (powerToggleError: any) {
            ((capabilityEntityState = previousState),
              syncEntityState(previousState),
              this.options.onError?.(powerToggleError));
          }
        },
      });
    (hn2.visual.classList.add("hb-capability-power"),
      isPowerToggleCapable && capabilityControlsSection.append(hn2.visual));
    const createSelectControl = (
        optionControlLabel: any,
        optionCandidates: any,
        activeOptionValue: any,
        optionServiceName: any,
        servicePayloadKey: any,
        optionServiceDomain = capabilityDomain,
      ) => {
        const selectOptions = [
          ...new Set<string>(
            (optionCandidates || [])
              .map((optionText: any) => String(optionText ?? "").trim())
              .filter(Boolean),
          ),
        ];
        if (
          !selectOptions.length &&
          !(
            ["electric-bed", "electric-bed-memory"].includes(capabilityVariant) &&
            capabilityDomain === "select"
          )
        )
          return;
        const optionGroupSection = document.createElement("section");
        optionGroupSection.className = "hb-capability-option-group";
        const optionGroupTitle = document.createElement("strong");
        optionGroupTitle.textContent = optionControlLabel;
        const optionGroupBox = document.createElement("div");
        if (
          ((optionGroupBox.className = "hb-capability-options"),
          ["electric-bed", "electric-bed-memory"].includes(capabilityVariant) &&
            capabilityDomain === "select")
        ) {
          const bedSelectWrapper = document.createElement("div");
          bedSelectWrapper.className = "hb-electric-bed-select";
          const bedSelectTriggerButton = document.createElement("button");
          ((bedSelectTriggerButton.type = "button"),
            (bedSelectTriggerButton.className = "hb-electric-bed-select-trigger"),
            bedSelectTriggerButton.setAttribute("aria-label", optionControlLabel),
            bedSelectTriggerButton.setAttribute("aria-haspopup", "listbox"),
            bedSelectTriggerButton.setAttribute("aria-expanded", "false"));
          const bedSelectValueLabel = document.createElement("span"),
            bedSelectArrowIcon = document.createElement("i");
          (bedSelectArrowIcon.setAttribute("aria-hidden", "true"),
            bedSelectTriggerButton.append(bedSelectValueLabel, bedSelectArrowIcon));
          const bedSelectMenu = document.createElement("div");
          ((bedSelectMenu.className = "hb-electric-bed-select-menu"),
            (bedSelectMenu.id =
              "hb-bed-select-" +
              String(this.renderNamespace || "runtime").replace(/[^a-z0-9_-]/gi, "-") +
              "-" +
              capabilityEntityId.replace(/[^a-z0-9_-]/gi, "-")),
            bedSelectMenu.setAttribute("role", "listbox"),
            bedSelectMenu.setAttribute("popover", "auto"),
            (bedSelectMenu.hidden = true),
            bedSelectTriggerButton.setAttribute("aria-controls", bedSelectMenu.id));
          let isSelectPending = false;
          const isBedSelectMenuOpen = () => {
              try {
                return bedSelectMenu.matches(":popover-open");
              } catch {
                return bedSelectMenu.dataset.open === "true";
              }
            },
            syncSelectState = () => {
              if (!isBedSelectMenuOpen() && bedSelectMenu.hidden) return;
              // 与气候下拉同一套缩放定位：0.6 倍弹窗里菜单保持视觉宽度并夹在可视区。
              positionScaledPopupMenu(bedSelectTriggerButton, bedSelectMenu, {
                minWidth: 150,
                maxHeight: 306,
                margin: 10,
                gap: 5,
              });
            },
            closeBedSelectMenu = () => {
              (isBedSelectMenuOpen() &&
                typeof bedSelectMenu.hidePopover == "function" &&
                bedSelectMenu.hidePopover(),
                (bedSelectMenu.hidden = true),
                (bedSelectMenu.dataset.open = "false"),
                bedSelectTriggerButton.setAttribute("aria-expanded", "false"));
            },
            openBedSelectMenu = (shouldRestoreFocus = false) => {
              bedSelectTriggerButton.disabled ||
                ((bedSelectMenu.hidden = false),
                typeof bedSelectMenu.showPopover == "function"
                  ? bedSelectMenu.showPopover()
                  : (bedSelectMenu.dataset.open = "true"),
                bedSelectTriggerButton.setAttribute("aria-expanded", "true"),
                syncSelectState(),
                shouldRestoreFocus &&
                  (
                    bedSelectMenu.querySelector<HTMLElement>('[aria-selected="true"]') ||
                    bedSelectMenu.querySelector<HTMLElement>('[role="option"]')
                  )?.focus());
            },
            selectBedValue = async (bedSelectedValue: any) => {
              if (
                !isControlsInteractive ||
                isSelectPending ||
                !bedSelectedValue ||
                isCapabilityUnavailable()
              )
                return;
              const previousStateOnSelect = capabilityEntityState;
              ((isSelectPending = true),
                closeBedSelectMenu(),
                (capabilityEntityState = {
                  ...capabilityEntityState,
                  state:
                    optionServiceName === "select_option"
                      ? bedSelectedValue
                      : capabilityEntityState.state,
                  attributes: {
                    ...getEntityAttributes(),
                    [servicePayloadKey]: bedSelectedValue,
                  },
                }),
                syncEntityState(capabilityEntityState));
              try {
                await this.callEntityService(
                  optionServiceDomain,
                  optionServiceName,
                  capabilityEntityId,
                  {
                    [servicePayloadKey]: bedSelectedValue,
                  },
                );
              } catch (selectError: any) {
                ((capabilityEntityState = previousStateOnSelect),
                  syncEntityState(previousStateOnSelect),
                  this.options.onError?.(selectError));
              } finally {
                ((isSelectPending = false), syncEntityState(capabilityEntityState));
              }
            },
            renderSelectOptions = (valuesList: any, bedCurrentOptionValue: any) => {
              bedSelectMenu.replaceChildren(
                ...valuesList.map((selectableValue: any) => {
                  const bedSelectOptionButton = document.createElement("button");
                  ((bedSelectOptionButton.type = "button"),
                    (bedSelectOptionButton.className = "hb-electric-bed-select-option"),
                    bedSelectOptionButton.setAttribute("role", "option"),
                    (bedSelectOptionButton.dataset.value = selectableValue),
                    (bedSelectOptionButton.textContent = selectableValue));
                  const isSelectedOption = selectableValue === String(bedCurrentOptionValue ?? "");
                  return (
                    bedSelectOptionButton.classList.toggle("active", isSelectedOption),
                    bedSelectOptionButton.setAttribute("aria-selected", String(isSelectedOption)),
                    bedSelectOptionButton.addEventListener("click", () =>
                      selectBedValue(selectableValue),
                    ),
                    bedSelectOptionButton
                  );
                }),
              );
              const selectedOptionLabel = valuesList.includes(String(bedCurrentOptionValue ?? ""))
                ? String(bedCurrentOptionValue)
                : valuesList[0] || "读取中…";
              ((bedSelectValueLabel.textContent = selectedOptionLabel),
                (bedSelectValueLabel.title = selectedOptionLabel));
            };
          (bedSelectTriggerButton.addEventListener("click", () => {
            isBedSelectMenuOpen() || bedSelectMenu.dataset.open === "true"
              ? closeBedSelectMenu()
              : openBedSelectMenu();
          }),
            bedSelectTriggerButton.addEventListener("keydown", (bedTriggerKeyEvent) => {
              ["ArrowDown", "ArrowUp", "Enter", " "].includes(bedTriggerKeyEvent.key) &&
                (bedTriggerKeyEvent.preventDefault(), openBedSelectMenu(true));
            }),
            bedSelectMenu.addEventListener("keydown", (bedMenuKeyEvent) => {
              const selectOptionButtons = [
                  ...bedSelectMenu.querySelectorAll<HTMLElement>('[role="option"]'),
                ],
                indexOf = selectOptionButtons.findIndex(
                  (selectOptionButton) => selectOptionButton === document.activeElement,
                );
              if (bedMenuKeyEvent.key === "Escape")
                (bedMenuKeyEvent.preventDefault(),
                  closeBedSelectMenu(),
                  bedSelectTriggerButton.focus());
              else {
                if (bedMenuKeyEvent.key === "ArrowDown" || bedMenuKeyEvent.key === "ArrowUp") {
                  bedMenuKeyEvent.preventDefault();
                  const navigationStep = bedMenuKeyEvent.key === "ArrowDown" ? 1 : -1;
                  selectOptionButtons[
                    (indexOf + navigationStep + selectOptionButtons.length) %
                      selectOptionButtons.length
                  ]?.focus();
                } else
                  (bedMenuKeyEvent.key === "Enter" || bedMenuKeyEvent.key === " ") &&
                    (bedMenuKeyEvent.preventDefault(), clickFocusedElement());
              }
            }),
            bedSelectMenu.addEventListener("toggle", (menuToggleEvent) => {
              const isBedMenuOpen = menuToggleEvent.newState === "open";
              ((bedSelectMenu.hidden = !isBedMenuOpen),
                (bedSelectMenu.dataset.open = String(isBedMenuOpen)),
                bedSelectTriggerButton.setAttribute("aria-expanded", String(isBedMenuOpen)),
                isBedMenuOpen && syncSelectState());
            }),
            bedSelectWrapper.append(bedSelectTriggerButton, bedSelectMenu),
            optionGroupSection.append(optionGroupTitle, bedSelectWrapper),
            capabilityControlsSection.append(optionGroupSection),
            controlDescriptors.push({
              type: "bed-select",
              service: optionServiceName,
              dataKey: servicePayloadKey,
              trigger: bedSelectTriggerButton,
              menu: bedSelectMenu,
              renderOptions: renderSelectOptions,
              closeMenu: closeBedSelectMenu,
              isPending: () => isSelectPending,
            }));
          return;
        }
        const modeButtons: any = [];
        for (const capabilityModeValue of selectOptions) {
          const modeButton = document.createElement("button");
          modeButton.type = "button";
          const modeLabelMap = {
            auto: "自动",
            sleep: "睡眠",
            favorite: "喜爱",
            none: "标准",
            manual: "手动",
            silent: "静音",
          };
          ((modeButton.textContent =
            capabilityVariant === "air-purifier" && optionControlLabel === "运行模式"
              ? (modeLabelMap as any)[capabilityModeValue.toLowerCase()] || capabilityModeValue
              : capabilityDomain === "fan" &&
                  componentDeviceType === "bath-heater" &&
                  optionControlLabel === "运行模式"
                ? climateModeLabel2(capabilityModeValue, "bath-heater", modeLabelOverrides)
                : capabilityModeValue),
            (modeButton.dataset.value = capabilityModeValue),
            modeButton.classList.toggle(
              "active",
              capabilityModeValue === String(activeOptionValue ?? ""),
            ),
            modeButton.addEventListener("click", async () => {
              if (!isControlsInteractive) return;
              modeButtons.forEach((disabledModeButton: any) => {
                disabledModeButton.disabled = true;
              });
              const previousStateOnMode = capabilityEntityState;
              ((capabilityEntityState = {
                ...capabilityEntityState,
                state:
                  optionServiceName === "select_option"
                    ? capabilityModeValue
                    : capabilityEntityState.state,
                attributes: {
                  ...getEntityAttributes(),
                  [servicePayloadKey]: capabilityModeValue,
                },
              }),
                syncEntityState(capabilityEntityState));
              try {
                await this.callEntityService(
                  optionServiceDomain,
                  optionServiceName,
                  capabilityEntityId,
                  {
                    [servicePayloadKey]: capabilityModeValue,
                  },
                );
              } catch (modeError: any) {
                ((capabilityEntityState = previousStateOnMode),
                  syncEntityState(previousStateOnMode),
                  this.options.onError?.(modeError));
              } finally {
                modeButtons.forEach((enabledModeButton: any) => {
                  enabledModeButton.disabled = false;
                });
              }
            }),
            modeButtons.push(modeButton),
            optionGroupBox.append(modeButton));
        }
        (optionGroupSection.append(optionGroupTitle, optionGroupBox),
          capabilityControlsSection.append(optionGroupSection),
          controlDescriptors.push({
            type: "options",
            service: optionServiceName,
            dataKey: servicePayloadKey,
            buttons: modeButtons,
          }));
      },
      fanSpeedPercentage = Number(getEntityAttributes().percentage);
    if (capabilityDomain === "fan" && Number.isFinite(fanSpeedPercentage)) {
      if (capabilityVariant === "air-purifier") {
        const speedGroupSection = document.createElement("section");
        speedGroupSection.className = "hb-capability-option-group hb-air-purifier-speed-group";
        const speedGroupTitle = document.createElement("strong");
        speedGroupTitle.textContent = "风速";
        const speedGroupBox = document.createElement("div");
        speedGroupBox.className = "hb-capability-options hb-air-purifier-speed-options";
        const speedPresets = [
          {
            label: "低",
            value: 33,
          },
          {
            label: "中",
            value: 66,
          },
          {
            label: "高",
            value: 100,
          },
        ].map((speedEntry) => {
          const speedPresetButton = document.createElement("button");
          return (
            (speedPresetButton.type = "button"),
            (speedPresetButton.textContent = speedEntry.label),
            (speedPresetButton.dataset.percentage = String(speedEntry.value)),
            speedPresetButton.addEventListener("click", async () => {
              if (!isControlsInteractive || isCapabilityUnavailable()) return;
              speedPresets.forEach((disabledSpeedButton) => {
                disabledSpeedButton.disabled = true;
              });
              const previousStateOnSpeed = capabilityEntityState;
              ((capabilityEntityState = {
                ...capabilityEntityState,
                attributes: {
                  ...getEntityAttributes(),
                  percentage: speedEntry.value,
                },
              }),
                syncEntityState(capabilityEntityState));
              try {
                await this.callEntityService("fan", "set_percentage", capabilityEntityId, {
                  percentage: speedEntry.value,
                });
              } catch (speedError: any) {
                ((capabilityEntityState = previousStateOnSpeed),
                  syncEntityState(previousStateOnSpeed),
                  this.options.onError?.(speedError));
              } finally {
                speedPresets.forEach((enabledSpeedButton) => {
                  enabledSpeedButton.disabled = false;
                });
              }
            }),
            speedGroupBox.append(speedPresetButton),
            speedPresetButton
          );
        });
        (speedGroupSection.append(speedGroupTitle, speedGroupBox),
          capabilityControlsSection.append(speedGroupSection),
          controlDescriptors.push({
            type: "percentage-options",
            buttons: speedPresets,
          }));
      } else {
        const fanSpeedRangeSection = document.createElement("section");
        fanSpeedRangeSection.className = "hb-capability-range-group";
        const fanSpeedRangeHeading = document.createElement("div");
        fanSpeedRangeHeading.className = "hb-capability-range-heading";
        const fanSpeedRangeTitle = document.createElement("strong");
        fanSpeedRangeTitle.textContent = "风速";
        const fanSpeedRangeOutputElement = document.createElement("output");
        fanSpeedRangeHeading.append(fanSpeedRangeTitle, fanSpeedRangeOutputElement);
        const fanSpeedRangeSlider = document.createElement("input");
        ((fanSpeedRangeSlider.type = "range"),
          /* 统一滑条观感由 main.css 的 `hos-range-ui` 提供（胶囊轨道 + 16px 圆点）。 */
          fanSpeedRangeSlider.classList.add("hos-range-ui"),
          (fanSpeedRangeSlider.min = "0"),
          (fanSpeedRangeSlider.max = "100"),
          (fanSpeedRangeSlider.step = "1"),
          (fanSpeedRangeSlider.value = String(fanSpeedPercentage)),
          syncHtmlRangeProgress2(fanSpeedRangeSlider),
          fanSpeedRangeSlider.addEventListener("input", () =>
            syncHtmlRangeProgress2(fanSpeedRangeSlider),
          ),
          fanSpeedRangeSlider.addEventListener("change", async () => {
            if (!isControlsInteractive || isCapabilityUnavailable()) return;
            fanSpeedRangeSlider.disabled = true;
            const previousStateOnFanSpeed = capabilityEntityState,
              fanSpeedValue = Number(fanSpeedRangeSlider.value);
            ((capabilityEntityState = {
              ...capabilityEntityState,
              attributes: {
                ...getEntityAttributes(),
                percentage: fanSpeedValue,
              },
            }),
              syncEntityState(capabilityEntityState));
            try {
              await this.callEntityService("fan", "set_percentage", capabilityEntityId, {
                percentage: fanSpeedValue,
              });
            } catch (fanSpeedError: any) {
              ((capabilityEntityState = previousStateOnFanSpeed),
                syncEntityState(previousStateOnFanSpeed),
                this.options.onError?.(fanSpeedError));
            } finally {
              fanSpeedRangeSlider.disabled = false;
            }
          }),
          fanSpeedRangeSection.append(fanSpeedRangeHeading, fanSpeedRangeSlider),
          capabilityControlsSection.append(fanSpeedRangeSection),
          controlDescriptors.push({
            type: "range",
            input: fanSpeedRangeSlider,
            output: fanSpeedRangeOutputElement,
            dataKey: "percentage",
          }));
      }
    }
    if (
      (capabilityDomain === "fan" &&
        createSelectControl(
          "运行模式",
          getEntityAttributes().preset_modes,
          getEntityAttributes().preset_mode,
          "set_preset_mode",
          "preset_mode",
        ),
      capabilityDomain === "select" &&
        createSelectControl(
          selectLabel,
          getEntityAttributes().options,
          capabilityEntityState?.state,
          "select_option",
          "option",
          "select",
        ),
      ["number", "input_number"].includes(capabilityDomain))
    ) {
      const rangeMinimum = Number.isFinite(Number(getEntityAttributes().min))
          ? Number(getEntityAttributes().min)
          : 0,
        rangeMaximum = Number.isFinite(Number(getEntityAttributes().max))
          ? Number(getEntityAttributes().max)
          : 100,
        rangeStep =
          Number.isFinite(Number(getEntityAttributes().step)) &&
          Number(getEntityAttributes().step) > 0
            ? Number(getEntityAttributes().step)
            : 1,
        numericRangeSection = document.createElement("section");
      numericRangeSection.className = "hb-capability-range-group";
      const numericRangeHeading = document.createElement("div");
      numericRangeHeading.className = "hb-capability-range-heading";
      const numericRangeTitle = document.createElement("strong");
      numericRangeTitle.textContent = getEntityAttributes().unit_of_measurement
        ? "数值（" + getEntityAttributes().unit_of_measurement + "）"
        : "数值";
      const numericRangeOutputElement = document.createElement("output");
      numericRangeHeading.append(numericRangeTitle, numericRangeOutputElement);
      const numericRangeSlider = document.createElement("input");
      ((numericRangeSlider.type = "range"),
        /* 统一滑条观感由 main.css 的 `hos-range-ui` 提供（胶囊轨道 + 16px 圆点）。 */
        numericRangeSlider.classList.add("hos-range-ui"),
        (numericRangeSlider.min = String(rangeMinimum)),
        (numericRangeSlider.max = String(rangeMaximum)),
        (numericRangeSlider.step = String(rangeStep)),
        (numericRangeSlider.value = String(Number(capabilityEntityState?.state) || rangeMinimum)),
        syncHtmlRangeProgress2(numericRangeSlider),
        numericRangeSlider.addEventListener("input", () =>
          syncHtmlRangeProgress2(numericRangeSlider),
        ),
        numericRangeSlider.addEventListener("change", async () => {
          if (!isControlsInteractive || isCapabilityUnavailable()) return;
          numericRangeSlider.disabled = true;
          const previousStateOnRange = capabilityEntityState,
            rangeValue = Number(numericRangeSlider.value);
          ((capabilityEntityState = {
            ...capabilityEntityState,
            state: String(rangeValue),
          }),
            syncEntityState(capabilityEntityState));
          try {
            await this.callEntityService(capabilityDomain, "set_value", capabilityEntityId, {
              value: rangeValue,
            });
          } catch (rangeError: any) {
            ((capabilityEntityState = previousStateOnRange),
              syncEntityState(previousStateOnRange),
              this.options.onError?.(rangeError));
          } finally {
            numericRangeSlider.disabled = false;
          }
        }),
        numericRangeSection.append(numericRangeHeading, numericRangeSlider),
        capabilityControlsSection.append(numericRangeSection),
        controlDescriptors.push({
          type: "range",
          input: numericRangeSlider,
          output: numericRangeOutputElement,
          dataKey: "state",
        }));
    }
    function syncEntityState(nextState: any) {
      capabilityEntityState = nextState || capabilityEntityState;
      const lowerCase = String(capabilityEntityState?.state || "").toLowerCase(),
        hasCustomVisualState =
          capabilityDomain === "fan"
            ? !["off", "unknown", "unavailable"].includes(lowerCase)
            : lowerCase === "on",
        isPowerVisualActive = capabilityVariant !== "air-purifier" || hasCustomVisualState;
      isPowerToggleCapable &&
        hn2.sync(hasCustomVisualState, {
          unavailable: isCapabilityUnavailable(),
        });
      for (const controlDescriptor of controlDescriptors)
        if (controlDescriptor.type === "options") {
          const descriptorStateValue =
            controlDescriptor.service === "select_option"
              ? capabilityEntityState?.state
              : getEntityAttributes()[controlDescriptor.dataKey];
          controlDescriptor.buttons.forEach((descriptorButton: any) =>
            descriptorButton.classList.toggle(
              "active",
              isPowerVisualActive &&
                descriptorButton.dataset.value === String(descriptorStateValue ?? ""),
            ),
          );
        } else {
          if (controlDescriptor.type === "bed-select") {
            const descriptorOptionValues = [
                ...new Set(
                  (getEntityAttributes().options || [])
                    .map((rawInputValue: any) => String(rawInputValue ?? "").trim())
                    .filter(Boolean),
                ),
              ],
              descriptorCurrentValue =
                controlDescriptor.service === "select_option"
                  ? capabilityEntityState?.state
                  : getEntityAttributes()[controlDescriptor.dataKey];
            (controlDescriptor.renderOptions(descriptorOptionValues, descriptorCurrentValue),
              (controlDescriptor.trigger.disabled =
                !isControlsInteractive ||
                controlDescriptor.isPending() ||
                !descriptorOptionValues.length ||
                isCapabilityUnavailable()),
              controlDescriptor.trigger.disabled && controlDescriptor.closeMenu());
          } else {
            if (controlDescriptor.type === "select") {
              const inputOptionValues = [
                ...new Set<string>(
                  (getEntityAttributes().options || [])
                    .map((rawInputOption: any) => String(rawInputOption ?? "").trim())
                    .filter(Boolean),
                ),
              ];
              if (inputOptionValues.length) {
                const existingOptionValues = [...controlDescriptor.input.options].map(
                  (htmlOptionEntry) => htmlOptionEntry.value,
                );
                (existingOptionValues.length !== inputOptionValues.length ||
                  existingOptionValues.some(
                    (existingValue, optionIndex) =>
                      existingValue !== inputOptionValues[optionIndex],
                  )) &&
                  controlDescriptor.input.replaceChildren(
                    ...inputOptionValues.map((inputOptionValue) => {
                      const selectOptionElement = document.createElement("option");
                      return (
                        (selectOptionElement.value = inputOptionValue),
                        (selectOptionElement.textContent = inputOptionValue),
                        selectOptionElement
                      );
                    }),
                  );
              }
              const desiredInputValue =
                controlDescriptor.service === "select_option"
                  ? capabilityEntityState?.state
                  : getEntityAttributes()[controlDescriptor.dataKey];
              (desiredInputValue != null &&
                [...controlDescriptor.input.options].some(
                  (matchingOption) => matchingOption.value === String(desiredInputValue),
                ) &&
                (controlDescriptor.input.value = String(desiredInputValue)),
                (controlDescriptor.input.disabled =
                  !isControlsInteractive ||
                  !inputOptionValues.length ||
                  isCapabilityUnavailable()));
            } else {
              if (controlDescriptor.type === "percentage-options") {
                const purifierPercentage = Number(getEntityAttributes().percentage),
                  activeSpeedPercentage =
                    purifierPercentage <= 0 || !Number.isFinite(purifierPercentage)
                      ? 0
                      : purifierPercentage <= 49
                        ? 33
                        : purifierPercentage <= 82
                          ? 66
                          : 100;
                controlDescriptor.buttons.forEach((speedButton: any) =>
                  speedButton.classList.toggle(
                    "active",
                    isPowerVisualActive &&
                      Number(speedButton.dataset.percentage) === activeSpeedPercentage,
                  ),
                );
              } else {
                if (["number", "input_number"].includes(capabilityDomain)) {
                  const speedMinimum = Number.isFinite(Number(getEntityAttributes().min))
                      ? Number(getEntityAttributes().min)
                      : 0,
                    speedMaximum = Number.isFinite(Number(getEntityAttributes().max))
                      ? Number(getEntityAttributes().max)
                      : 100,
                    speedStep =
                      Number.isFinite(Number(getEntityAttributes().step)) &&
                      Number(getEntityAttributes().step) > 0
                        ? Number(getEntityAttributes().step)
                        : 1;
                  ((controlDescriptor.input.min = String(speedMinimum)),
                    (controlDescriptor.input.max = String(speedMaximum)),
                    (controlDescriptor.input.step = String(speedStep)));
                }
                const purifierLevelValue =
                  controlDescriptor.dataKey === "state"
                    ? Number(capabilityEntityState?.state)
                    : Number(getEntityAttributes()[controlDescriptor.dataKey]);
                (Number.isFinite(purifierLevelValue) &&
                  (controlDescriptor.input.value = String(purifierLevelValue)),
                  syncHtmlRangeProgress2(controlDescriptor.input),
                  (controlDescriptor.output.textContent = Number.isFinite(purifierLevelValue)
                    ? "" + purifierLevelValue + (getEntityAttributes().unit_of_measurement || "%")
                    : "--"));
              }
            }
          }
        }
    }
    return (
      (capabilityControlsSection.syncCapabilityState = syncEntityState),
      (capabilityControlsSection.cleanupCapabilityDetails = () => {
        for (const closeableDescriptor of controlDescriptors) closeableDescriptor.closeMenu?.();
      }),
      syncEntityState(capabilityEntityState),
      capabilityControlsSection
    );
  }
