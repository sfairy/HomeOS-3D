type AnyObj = Record<string, any>;
/*
 * 设备控件区块：按 HA 能力（supported_features / attribute）自动生成的详情感。
 */

import { entityDomainFromId } from "../../../../utils/entities.js";
import {
  climateModeLabel,
  resolveClimateDeviceType
} from "../../../controls/climate.js";
import { createSwitchVisual } from "../primitives.js";

export const capabilityDetailsMethods = {
  /**
   * 按实体能力清单生成详情弹窗里的控件（电源、模式选择、数值调节等）。
   */
  createCapabilityDetailsControls(this: any, 
    capabilityEntityId: any,
    capabilityInitialState: any,
    {
      interactive: capabilityInteractive = true,
      variant: capabilityVariant = "",
      selectLabel: capabilitySelectLabel = "模式"
    } = {}
  ) {
    const capabilityControlsElement: any = document.createElement("section");
    capabilityControlsElement.className =
      "hb-capability-details-controls" +
      (capabilityVariant ? " hb-capability-details-controls--" + capabilityVariant : "");
    capabilityControlsElement.inert = !capabilityInteractive;
    const capabilityDomain = entityDomainFromId(capabilityEntityId);
    let capabilityState: any = capabilityInitialState || {
      entityId: capabilityEntityId,
      state: "unknown",
      attributes: {}
    };
    const capabilityClimateDeviceType =
      capabilityDomain === "fan"
        ? resolveClimateDeviceType(
            {
              properties: {}
            },
            capabilityState,
            capabilityEntityId
          )
        : "generic";
    const translationContext: AnyObj = {
      entityId: capabilityEntityId,
      entityMetadata: this.entityMetadata,
      entityTranslations: this.entityTranslations
    };
    /**
     * 取当前状态快照里的属性表（状态可能被替换过，每次都要从最新快照读）。
     */
    const capabilityAttributes = () => capabilityState?.attributes || {};
    /**
     * 实体是否处于不可用状态：unknown / unavailable 时所有交互都不该发服务调用。
     * @returns {boolean} 是否不可用。
     */
    const isCapabilityUnavailable = () =>
      ["unknown", "unavailable"].includes(String(capabilityState?.state || "").toLowerCase());
    const capabilityControlEntries: any[] = [];
    const hasPowerSwitchControl = ["fan", "switch", "input_boolean"].includes(capabilityDomain);
    const powerSwitchVisual = (createSwitchVisual as any)({
      label: "电源",
      interactive: capabilityInteractive,
      compact: capabilityVariant === "air-purifier",
      onToggle: async () => {
        if (!capabilityInteractive || isCapabilityUnavailable()) {
          return;
        }
        const isSwitchOff = String(capabilityState?.state || "").toLowerCase() === "off";
        const switchPreviousState = capabilityState;
        capabilityState = {
          ...capabilityState,
          state: isSwitchOff ? "on" : "off"
        };
        syncCapabilityState(capabilityState);
        try {
          await this.callEntityService(
            capabilityDomain === "fan" ? "fan" : "homeassistant",
            capabilityDomain === "fan" ? (isSwitchOff ? "turn_on" : "turn_off") : "toggle",
            capabilityEntityId
          );
        } catch (powerToggleError) {
          capabilityState = switchPreviousState;
          syncCapabilityState(switchPreviousState);
          this.options.onError?.(powerToggleError);
        }
      }
    });
    powerSwitchVisual.visual.classList.add("hb-capability-power");
    if (hasPowerSwitchControl) {
      capabilityControlsElement.append(powerSwitchVisual.visual);
    }
    /**
     * 生成一个「多选一」控制组（模式、风速、摆头等）。
     */
    const createCapabilityOptionGroup = (
      optionGroupLabel: any,
      optionGroupValues: any,
      optionGroupCurrent: any,
      optionGroupService: any,
      optionGroupDataKey: any,
      optionGroupDomain: any = capabilityDomain
    ) => {
      const normalizedGroupOptions: any[] = [
        ...new Set(
          (optionGroupValues || [])
            .map((groupOptionValue: any) => String(groupOptionValue ?? "").trim())
            .filter(Boolean)
        )
      ];
      if (
        !normalizedGroupOptions.length &&
        (!["electric-bed", "electric-bed-memory"].includes(capabilityVariant) ||
          capabilityDomain !== "select")
      ) {
        return;
      }
      const optionGroupElement: any = document.createElement("section");
      optionGroupElement.className = "hb-capability-option-group";
      const optionGroupTitleElement: any = document.createElement("strong");
      optionGroupTitleElement.textContent = optionGroupLabel;
      const optionGroupOptionsElement: any = document.createElement("div");
      optionGroupOptionsElement.className = "hb-capability-options";
      if (
        ["electric-bed", "electric-bed-memory"].includes(capabilityVariant) &&
        capabilityDomain === "select"
      ) {
        const bedSelectWrapperElement: any = document.createElement("div");
        bedSelectWrapperElement.className = "hb-electric-bed-select";
        const bedSelectTriggerElement: any = document.createElement("button");
        bedSelectTriggerElement.type = "button";
        bedSelectTriggerElement.className = "hb-electric-bed-select-trigger";
        bedSelectTriggerElement.setAttribute("aria-label", optionGroupLabel);
        bedSelectTriggerElement.setAttribute("aria-haspopup", "listbox");
        bedSelectTriggerElement.setAttribute("aria-expanded", "false");
        const bedSelectValueElement: any = document.createElement("span");
        const bedSelectChevronElement: any = document.createElement("i");
        bedSelectChevronElement.setAttribute("aria-hidden", "true");
        bedSelectTriggerElement.append(bedSelectValueElement, bedSelectChevronElement);
        const bedSelectMenuElement: any = document.createElement("div");
        bedSelectMenuElement.className = "hb-electric-bed-select-menu";
        bedSelectMenuElement.id =
          "hb-bed-select-" +
          String(this.renderNamespace || "runtime").replace(/[^a-z0-9_-]/gi, "-") +
          "-" +
          capabilityEntityId.replace(/[^a-z0-9_-]/gi, "-");
        bedSelectMenuElement.setAttribute("role", "listbox");
        bedSelectMenuElement.setAttribute("popover", "auto");
        bedSelectMenuElement.hidden = true;
        bedSelectTriggerElement.setAttribute("aria-controls", bedSelectMenuElement.id);
        let isBedSelectPending = false;
        /**
         * 下拉菜单是否展开。
         */
        const isBedSelectMenuOpen = () => {
          try {
            return bedSelectMenuElement.matches(":popover-open");
          } catch {
            return bedSelectMenuElement.dataset.open === "true";
          }
        };
        /**
         * 把下拉菜单摆到触发按钮下方，下方空间不足时翻到上方。
         */
        const positionBedSelectMenu = () => {
          if (!isBedSelectMenuOpen() && bedSelectMenuElement.hidden) {
            return;
          }
          const bedSelectTriggerRect = bedSelectTriggerElement.getBoundingClientRect();
          const bedSelectViewportWidth = window.innerWidth;
          const bedSelectViewportHeight = window.innerHeight;
          const bedSelectMenuWidthPx = Math.min(
            Math.max(bedSelectTriggerRect.width, 150),
            Math.max(150, bedSelectViewportWidth - 20)
          );
          bedSelectMenuElement.style.width = bedSelectMenuWidthPx + "px";
          bedSelectMenuElement.style.maxHeight =
            Math.min(306, Math.max(96, bedSelectViewportHeight - 20)) + "px";
          const bedSelectMenuHeightPx = Math.min(bedSelectMenuElement.scrollHeight || 0, 306);
          const bedSelectSpaceBelowPx = bedSelectViewportHeight - bedSelectTriggerRect.bottom - 10;
          const bedSelectSpaceAbovePx = bedSelectTriggerRect.top - 10;
          const bedSelectMenuTopPx =
            bedSelectSpaceBelowPx < Math.min(bedSelectMenuHeightPx, 160) &&
            bedSelectSpaceAbovePx > bedSelectSpaceBelowPx
              ? Math.max(10, bedSelectTriggerRect.top - bedSelectMenuHeightPx - 5)
              : Math.min(
                  bedSelectViewportHeight - bedSelectMenuHeightPx - 10,
                  bedSelectTriggerRect.bottom + 5
                );
          bedSelectMenuElement.style.left =
            Math.max(
              10,
              Math.min(
                bedSelectTriggerRect.left,
                bedSelectViewportWidth - bedSelectMenuWidthPx - 10
              )
            ) + "px";
          bedSelectMenuElement.style.top = Math.max(10, bedSelectMenuTopPx) + "px";
        };
        /**
         * 收起下拉菜单，并同步 hidden / dataset.open / aria-expanded 三处状态。
         */
        const closeBedSelectMenu = () => {
          if (isBedSelectMenuOpen() && typeof bedSelectMenuElement.hidePopover == "function") {
            bedSelectMenuElement.hidePopover();
          }
          bedSelectMenuElement.hidden = true;
          bedSelectMenuElement.dataset.open = "false";
          bedSelectTriggerElement.setAttribute("aria-expanded", "false");
        };
        /**
         * 展开下拉菜单。
         */
        const openBedSelectMenu = (shouldFocusBedOption: any = false) => {
          if (!bedSelectTriggerElement.disabled) {
            bedSelectMenuElement.hidden = false;
            if (typeof bedSelectMenuElement.showPopover == "function") {
              bedSelectMenuElement.showPopover();
            } else {
              bedSelectMenuElement.dataset.open = "true";
            }
            bedSelectTriggerElement.setAttribute("aria-expanded", "true");
            positionBedSelectMenu();
            if (shouldFocusBedOption) {
              (
                bedSelectMenuElement.querySelector('[aria-selected="true"]') ||
                bedSelectMenuElement.querySelector('[role="option"]')
              )?.focus();
            }
          }
        };
        /**
         * 提交下拉选中的选项：先乐观更新本地状态并刷新 UI，再调用服务，失败回滚。
         */
        const selectBedOption = async (bedOptionValue: any) => {
          if (
            !capabilityInteractive ||
            isBedSelectPending ||
            !bedOptionValue ||
            isCapabilityUnavailable()
          ) {
            return;
          }
          const bedSelectRollbackState = capabilityState;
          isBedSelectPending = true;
          closeBedSelectMenu();
          capabilityState = {
            ...capabilityState,
            state: optionGroupService === "select_option" ? bedOptionValue : capabilityState.state,
            attributes: {
              ...capabilityAttributes(),
              [optionGroupDataKey]: bedOptionValue
            }
          };
          syncCapabilityState(capabilityState);
          try {
            await this.callEntityService(
              optionGroupDomain,
              optionGroupService,
              capabilityEntityId,
              {
                [optionGroupDataKey]: bedOptionValue
              }
            );
          } catch (bedSelectError) {
            capabilityState = bedSelectRollbackState;
            syncCapabilityState(bedSelectRollbackState);
            this.options.onError?.(bedSelectError);
          } finally {
            isBedSelectPending = false;
            syncCapabilityState(capabilityState);
          }
        };
        /**
         * 重绘下拉菜单的选项列表，并更新触发按钮上的当前值文案。
         */
        const renderBedSelectOptions = (bedOptionValues: any, bedSelectedValue: any) => {
          bedSelectMenuElement.replaceChildren(
            ...bedOptionValues.map((bedOptionEntry: any) => {
              const bedOptionButton: any = document.createElement("button");
              bedOptionButton.type = "button";
              bedOptionButton.className = "hb-electric-bed-select-option";
              bedOptionButton.setAttribute("role", "option");
              bedOptionButton.dataset.value = bedOptionEntry;
              bedOptionButton.textContent = bedOptionEntry;
              const isBedOptionSelected = bedOptionEntry === String(bedSelectedValue ?? "");
              bedOptionButton.classList.toggle("active", isBedOptionSelected);
              bedOptionButton.setAttribute("aria-selected", String(isBedOptionSelected));
              bedOptionButton.addEventListener("click", () => selectBedOption(bedOptionEntry));
              return bedOptionButton;
            })
          );
          const bedSelectTriggerLabel = bedOptionValues.includes(String(bedSelectedValue ?? ""))
            ? String(bedSelectedValue)
            : bedOptionValues[0] || "读取中…";
          bedSelectValueElement.textContent = bedSelectTriggerLabel;
          bedSelectValueElement.title = bedSelectTriggerLabel;
        };
        bedSelectTriggerElement.addEventListener("click", () => {
          if (isBedSelectMenuOpen() || bedSelectMenuElement.dataset.open === "true") {
            closeBedSelectMenu();
          } else {
            openBedSelectMenu();
          }
        });
        bedSelectTriggerElement.addEventListener("keydown", (bedSelectKeyEvent: any) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(bedSelectKeyEvent.key)) {
            bedSelectKeyEvent.preventDefault();
            openBedSelectMenu(true);
          }
        });
        bedSelectMenuElement.addEventListener("keydown", (bedMenuKeyEvent: any) => {
          const bedOptionButtons = [...bedSelectMenuElement.querySelectorAll('[role="option"]')];
          const bedFocusedOptionIndex = bedOptionButtons.indexOf(document.activeElement);
          if (bedMenuKeyEvent.key === "Escape") {
            bedMenuKeyEvent.preventDefault();
            closeBedSelectMenu();
            bedSelectTriggerElement.focus();
          } else if (bedMenuKeyEvent.key === "ArrowDown" || bedMenuKeyEvent.key === "ArrowUp") {
            bedMenuKeyEvent.preventDefault();
            const bedMoveDirection = bedMenuKeyEvent.key === "ArrowDown" ? 1 : -1;
            bedOptionButtons[
              (bedFocusedOptionIndex + bedMoveDirection + bedOptionButtons.length) %
                bedOptionButtons.length
            ]?.focus();
          } else if (bedMenuKeyEvent.key === "Enter" || bedMenuKeyEvent.key === " ") {
            bedMenuKeyEvent.preventDefault();
            (document.activeElement as HTMLElement | null)?.click();
          }
        });
        bedSelectMenuElement.addEventListener("toggle", (bedToggleEvent: any) => {
          const isBedMenuOpen = bedToggleEvent.newState === "open";
          bedSelectMenuElement.hidden = !isBedMenuOpen;
          bedSelectMenuElement.dataset.open = String(isBedMenuOpen);
          bedSelectTriggerElement.setAttribute("aria-expanded", String(isBedMenuOpen));
          if (isBedMenuOpen) {
            positionBedSelectMenu();
          }
        });
        bedSelectWrapperElement.append(bedSelectTriggerElement, bedSelectMenuElement);
        optionGroupElement.append(optionGroupTitleElement, bedSelectWrapperElement);
        capabilityControlsElement.append(optionGroupElement);
        capabilityControlEntries.push({
          type: "bed-select",
          service: optionGroupService,
          dataKey: optionGroupDataKey,
          trigger: bedSelectTriggerElement,
          menu: bedSelectMenuElement,
          renderOptions: renderBedSelectOptions,
          closeMenu: closeBedSelectMenu,
          isPending: () => isBedSelectPending
        });
        return;
      }
      const modeOptionButtons: any[] = [];
      for (const presetModeValue of normalizedGroupOptions as any[]) {
        const modeOptionButton: any = document.createElement("button");
        modeOptionButton.type = "button";
        const airPurifierModeLabels: AnyObj = {
          auto: "自动",
          sleep: "睡眠",
          favorite: "最爱",
          favorite_level: "最爱",
          none: "标准",
          normal: "标准",
          manual: "手动",
          low: "低",
          medium: "中",
          middle: "中",
          high: "高",
          strong: "强劲",
          turbo: "强劲",
          silent: "静音",
          quiet: "静音"
        };
        modeOptionButton.textContent =
          capabilityVariant === "air-purifier" && optionGroupLabel === "运行模式"
            ? airPurifierModeLabels[presetModeValue.toLowerCase()] || presetModeValue
            : capabilityDomain === "fan" &&
                capabilityClimateDeviceType === "bath-heater" &&
                optionGroupLabel === "运行模式"
              ? climateModeLabel(presetModeValue, "bath-heater", translationContext)
              : presetModeValue;
        modeOptionButton.dataset.value = presetModeValue;
        modeOptionButton.classList.toggle(
          "active",
          presetModeValue === String(optionGroupCurrent ?? "")
        );
        modeOptionButton.addEventListener("click", async () => {
          if (!capabilityInteractive) {
            return;
          }
          modeOptionButtons.forEach((modeButtonElement: any) => {
            modeButtonElement.disabled = true;
          });
          const modeRollbackState = capabilityState;
          capabilityState = {
            ...capabilityState,
            state: optionGroupService === "select_option" ? presetModeValue : capabilityState.state,
            attributes: {
              ...capabilityAttributes(),
              [optionGroupDataKey]: presetModeValue
            }
          };
          syncCapabilityState(capabilityState);
          try {
            await this.callEntityService(
              optionGroupDomain,
              optionGroupService,
              capabilityEntityId,
              {
                [optionGroupDataKey]: presetModeValue
              }
            );
          } catch (modeOptionError) {
            capabilityState = modeRollbackState;
            syncCapabilityState(modeRollbackState);
            this.options.onError?.(modeOptionError);
          } finally {
            modeOptionButtons.forEach((modeButtonEntry: any) => {
              modeButtonEntry.disabled = false;
            });
          }
        });
        modeOptionButtons.push(modeOptionButton);
        optionGroupOptionsElement.append(modeOptionButton);
      }
      optionGroupElement.append(optionGroupTitleElement, optionGroupOptionsElement);
      capabilityControlsElement.append(optionGroupElement);
      capabilityControlEntries.push({
        type: "options",
        service: optionGroupService,
        dataKey: optionGroupDataKey,
        buttons: modeOptionButtons
      });
    };
    const fanPercentageValue = Number(capabilityAttributes().percentage);
    if (capabilityDomain === "fan" && Number.isFinite(fanPercentageValue)) {
      if (capabilityVariant === "air-purifier") {
        const speedGroupElement: any = document.createElement("section");
        speedGroupElement.className = "hb-capability-option-group hb-air-purifier-speed-group";
        const speedGroupTitleElement: any = document.createElement("strong");
        speedGroupTitleElement.textContent = "风速";
        const speedOptionsElement: any = document.createElement("div");
        speedOptionsElement.className = "hb-capability-options hb-air-purifier-speed-options";
        const speedOptionButtons = [
          {
            label: "低",
            value: 33
          },
          {
            label: "中",
            value: 66
          },
          {
            label: "高",
            value: 100
          }
        ].map((speedOption: any) => {
          const speedOptionButton: any = document.createElement("button");
          speedOptionButton.type = "button";
          speedOptionButton.textContent = speedOption.label;
          speedOptionButton.dataset.percentage = String(speedOption.value);
          speedOptionButton.addEventListener("click", async () => {
            if (!capabilityInteractive || isCapabilityUnavailable()) {
              return;
            }
            speedOptionButtons.forEach((speedButtonElement: any) => {
              speedButtonElement.disabled = true;
            });
            const speedRollbackState = capabilityState;
            capabilityState = {
              ...capabilityState,
              attributes: {
                ...capabilityAttributes(),
                percentage: speedOption.value
              }
            };
            syncCapabilityState(capabilityState);
            try {
              await this.callEntityService("fan", "set_percentage", capabilityEntityId, {
                percentage: speedOption.value
              });
            } catch (speedOptionError) {
              capabilityState = speedRollbackState;
              syncCapabilityState(speedRollbackState);
              this.options.onError?.(speedOptionError);
            } finally {
              speedOptionButtons.forEach((speedButtonEntry: any) => {
                speedButtonEntry.disabled = false;
              });
            }
          });
          speedOptionsElement.append(speedOptionButton);
          return speedOptionButton;
        });
        speedGroupElement.append(speedGroupTitleElement, speedOptionsElement);
        capabilityControlsElement.append(speedGroupElement);
        capabilityControlEntries.push({
          type: "percentage-options",
          buttons: speedOptionButtons
        });
      } else {
        const percentageRangeGroupElement: any = document.createElement("section");
        percentageRangeGroupElement.className = "hb-capability-range-group";
        const percentageRangeHeadingElement: any = document.createElement("div");
        percentageRangeHeadingElement.className = "hb-capability-range-heading";
        const percentageRangeTitleElement: any = document.createElement("strong");
        percentageRangeTitleElement.textContent = "风速";
        const percentageRangeOutputElement: any = document.createElement("output");
        percentageRangeHeadingElement.append(
          percentageRangeTitleElement,
          percentageRangeOutputElement
        );
        const percentageRangeInputElement: any = document.createElement("input");
        percentageRangeInputElement.type = "range";
        percentageRangeInputElement.min = "0";
        percentageRangeInputElement.max = "100";
        percentageRangeInputElement.step = "1";
        percentageRangeInputElement.value = String(fanPercentageValue);
        percentageRangeInputElement.addEventListener("change", async () => {
          if (!capabilityInteractive || isCapabilityUnavailable()) {
            return;
          }
          percentageRangeInputElement.disabled = true;
          const percentageRollbackState = capabilityState;
          const nextFanPercentage = Number(percentageRangeInputElement.value);
          capabilityState = {
            ...capabilityState,
            attributes: {
              ...capabilityAttributes(),
              percentage: nextFanPercentage
            }
          };
          syncCapabilityState(capabilityState);
          try {
            await this.callEntityService("fan", "set_percentage", capabilityEntityId, {
              percentage: nextFanPercentage
            });
          } catch (percentageError) {
            capabilityState = percentageRollbackState;
            syncCapabilityState(percentageRollbackState);
            this.options.onError?.(percentageError);
          } finally {
            percentageRangeInputElement.disabled = false;
          }
        });
        percentageRangeGroupElement.append(
          percentageRangeHeadingElement,
          percentageRangeInputElement
        );
        capabilityControlsElement.append(percentageRangeGroupElement);
        capabilityControlEntries.push({
          type: "range",
          input: percentageRangeInputElement,
          output: percentageRangeOutputElement,
          dataKey: "percentage"
        });
      }
    }
    if (capabilityDomain === "fan") {
      createCapabilityOptionGroup(
        "运行模式",
        capabilityAttributes().preset_modes,
        capabilityAttributes().preset_mode,
        "set_preset_mode",
        "preset_mode"
      );
    }
    if (capabilityDomain === "select") {
      createCapabilityOptionGroup(
        capabilitySelectLabel,
        capabilityAttributes().options,
        capabilityState?.state,
        "select_option",
        "option",
        "select"
      );
    }
    if (["number", "input_number"].includes(capabilityDomain)) {
      const numberMinValue = Number.isFinite(Number(capabilityAttributes().min))
        ? Number(capabilityAttributes().min)
        : 0;
      const numberMaxValue = Number.isFinite(Number(capabilityAttributes().max))
        ? Number(capabilityAttributes().max)
        : 100;
      const numberStepValue =
        Number.isFinite(Number(capabilityAttributes().step)) &&
        Number(capabilityAttributes().step) > 0
          ? Number(capabilityAttributes().step)
          : 1;
      const numberRangeGroupElement: any = document.createElement("section");
      numberRangeGroupElement.className = "hb-capability-range-group";
      const numberRangeHeadingElement: any = document.createElement("div");
      numberRangeHeadingElement.className = "hb-capability-range-heading";
      const numberRangeTitleElement: any = document.createElement("strong");
      numberRangeTitleElement.textContent = capabilityAttributes().unit_of_measurement
        ? "数值（" + capabilityAttributes().unit_of_measurement + "）"
        : "数值";
      const numberRangeOutputElement: any = document.createElement("output");
      numberRangeHeadingElement.append(numberRangeTitleElement, numberRangeOutputElement);
      const numberRangeInputElement: any = document.createElement("input");
      numberRangeInputElement.type = "range";
      numberRangeInputElement.min = String(numberMinValue);
      numberRangeInputElement.max = String(numberMaxValue);
      numberRangeInputElement.step = String(numberStepValue);
      numberRangeInputElement.value = String(Number(capabilityState?.state) || numberMinValue);
      numberRangeInputElement.addEventListener("change", async () => {
        if (!capabilityInteractive || isCapabilityUnavailable()) {
          return;
        }
        numberRangeInputElement.disabled = true;
        const numberRollbackState = capabilityState;
        const nextNumberSetting = Number(numberRangeInputElement.value);
        capabilityState = {
          ...capabilityState,
          state: String(nextNumberSetting)
        };
        syncCapabilityState(capabilityState);
        try {
          await this.callEntityService(capabilityDomain, "set_value", capabilityEntityId, {
            value: nextNumberSetting
          });
        } catch (numberRangeError) {
          capabilityState = numberRollbackState;
          syncCapabilityState(numberRollbackState);
          this.options.onError?.(numberRangeError);
        } finally {
          numberRangeInputElement.disabled = false;
        }
      });
      numberRangeGroupElement.append(numberRangeHeadingElement, numberRangeInputElement);
      capabilityControlsElement.append(numberRangeGroupElement);
      capabilityControlEntries.push({
        type: "range",
        input: numberRangeInputElement,
        output: numberRangeOutputElement,
        dataKey: "state"
      });
    }
    /**
     * 把最新实体状态同步到「能力详情」面板的所有控件上（整体刷新，不做增删）。
     */
    function syncCapabilityState(nextCapabilityState: any) {
      capabilityState = nextCapabilityState || capabilityState;
      const normalizedCapabilityState = String(capabilityState?.state || "").toLowerCase();
      const isCapabilityActive =
        capabilityDomain === "fan"
          ? !["off", "unknown", "unavailable"].includes(normalizedCapabilityState)
          : normalizedCapabilityState === "on";
      const shouldHighlightActiveOption =
        capabilityVariant !== "air-purifier" || isCapabilityActive;
      if (hasPowerSwitchControl) {
        powerSwitchVisual.sync(isCapabilityActive, {
          unavailable: isCapabilityUnavailable()
        });
      }
      for (const controlEntry of capabilityControlEntries) {
        if (controlEntry.type === "options") {
          const activeOptionValue =
            controlEntry.service === "select_option"
              ? capabilityState?.state
              : capabilityAttributes()[controlEntry.dataKey];
          controlEntry.buttons.forEach((optionButtonElement: any) =>
            optionButtonElement.classList.toggle(
              "active",
              shouldHighlightActiveOption &&
                optionButtonElement.dataset.value === String(activeOptionValue ?? "")
            )
          );
        } else if (controlEntry.type === "bed-select") {
          const bedSelectOptionValues = [
            ...new Set(
              (capabilityAttributes().options || [])
                .map((bedOptionValueEntry: any) => String(bedOptionValueEntry ?? "").trim())
                .filter(Boolean)
            )
          ];
          const bedSelectCurrentValue =
            controlEntry.service === "select_option"
              ? capabilityState?.state
              : capabilityAttributes()[controlEntry.dataKey];
          controlEntry.renderOptions(bedSelectOptionValues, bedSelectCurrentValue);
          controlEntry.trigger.disabled =
            !capabilityInteractive ||
            controlEntry.isPending() ||
            !bedSelectOptionValues.length ||
            isCapabilityUnavailable();
          if (controlEntry.trigger.disabled) {
            controlEntry.closeMenu();
          }
        } else if (controlEntry.type === "select") {
          const selectOptionValues = [
            ...new Set(
              (capabilityAttributes().options || [])
                .map((selectOptionValue: any) => String(selectOptionValue ?? "").trim())
                .filter(Boolean)
            )
          ];
          if (selectOptionValues.length) {
            const renderedOptionValues = [...controlEntry.input.options].map(
              optionElement => optionElement.value
            );
            if (
              renderedOptionValues.length !== selectOptionValues.length ||
              renderedOptionValues.some(
                (optionValue, optionIndex) => optionValue !== selectOptionValues[optionIndex]
              )
            ) {
              controlEntry.input.replaceChildren(
                ...selectOptionValues.map((optionValueEntry: any) => {
                  const selectOptionElement: any = document.createElement("option");
                  selectOptionElement.value = optionValueEntry;
                  selectOptionElement.textContent = optionValueEntry;
                  return selectOptionElement;
                })
              );
            }
          }
          const selectCurrentValue =
            controlEntry.service === "select_option"
              ? capabilityState?.state
              : capabilityAttributes()[controlEntry.dataKey];
          if (
            selectCurrentValue != null &&
            [...controlEntry.input.options].some(
              optionElementEntry => optionElementEntry.value === String(selectCurrentValue)
            )
          ) {
            controlEntry.input.value = String(selectCurrentValue);
          }
          controlEntry.input.disabled =
            !capabilityInteractive || !selectOptionValues.length || isCapabilityUnavailable();
        } else if (controlEntry.type === "percentage-options") {
          const currentFanPercentage = Number(capabilityAttributes().percentage);
          const fanPercentageBucket =
            currentFanPercentage <= 0 || !Number.isFinite(currentFanPercentage)
              ? 0
              : currentFanPercentage <= 49
                ? 33
                : currentFanPercentage <= 82
                  ? 66
                  : 100;
          controlEntry.buttons.forEach((percentageButtonElement: any) =>
            percentageButtonElement.classList.toggle(
              "active",
              shouldHighlightActiveOption &&
                Number(percentageButtonElement.dataset.percentage) === fanPercentageBucket
            )
          );
        } else {
          if (["number", "input_number"].includes(capabilityDomain)) {
            const rangeMinValue = Number.isFinite(Number(capabilityAttributes().min))
              ? Number(capabilityAttributes().min)
              : 0;
            const rangeMaxValue = Number.isFinite(Number(capabilityAttributes().max))
              ? Number(capabilityAttributes().max)
              : 100;
            const rangeStepValue =
              Number.isFinite(Number(capabilityAttributes().step)) &&
              Number(capabilityAttributes().step) > 0
                ? Number(capabilityAttributes().step)
                : 1;
            controlEntry.input.min = String(rangeMinValue);
            controlEntry.input.max = String(rangeMaxValue);
            controlEntry.input.step = String(rangeStepValue);
          }
          const rangeDisplayValue =
            controlEntry.dataKey === "state"
              ? Number(capabilityState?.state)
              : Number(capabilityAttributes()[controlEntry.dataKey]);
          if (Number.isFinite(rangeDisplayValue)) {
            controlEntry.input.value = String(rangeDisplayValue);
          }
          controlEntry.output.textContent = Number.isFinite(rangeDisplayValue)
            ? "" + rangeDisplayValue + (capabilityAttributes().unit_of_measurement || "%")
            : "--";
        }
      }
    }
    capabilityControlsElement.syncCapabilityState = syncCapabilityState;
    capabilityControlsElement.cleanupCapabilityDetails = () => {
      for (const cleanupControlEntry of capabilityControlEntries) {
        cleanupControlEntry.closeMenu?.();
      }
    };
    syncCapabilityState(capabilityState);
    return capabilityControlsElement;
  }
};
