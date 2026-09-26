/*
 * 设备控件区块：按 HA 能力（supported_features / attribute）自动生成的详情感。
 *
 * 没有专门详情页的设备靠它兜底：把实体属性翻译成开关、滑杆、下拉与只读读数。
 */

import { entityDomainFromId } from "../../../../utils/entities.js?v=2609262312";
import {
  climateModeLabel,
  resolveClimateDeviceType
} from "../../../controls/climate.js?v=2609262312";
import { createSwitchVisual } from "../primitives.js?v=2609262312";

export const capabilityDetailsMethods = {
  /**
   * 按实体能力清单生成详情弹窗里的控件（电源、模式选择、数值调节等）。
   * 能力清单决定放哪些控件，同一函数因此服务风扇、净化器等多种设备；variant 用于同设备
   * 不同入口的样式微调，inert 用于预览态禁用交互。
   */
  createCapabilityDetailsControls(
    capabilityEntityId,
    capabilityInitialState,
    {
      interactive: capabilityInteractive = true,
      variant: capabilityVariant = "",
      selectLabel: capabilitySelectLabel = "模式"
    } = {}
  ) {
    const capabilityControlsElement = document.createElement("section");
    capabilityControlsElement.className =
      "hb-capability-details-controls" +
      (capabilityVariant ? " hb-capability-details-controls--" + capabilityVariant : "");
    capabilityControlsElement.inert = !capabilityInteractive;
    const capabilityDomain = entityDomainFromId(capabilityEntityId);
    let capabilityState = capabilityInitialState || {
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
    const translationContext = {
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
     *
     * @returns {boolean} 是否不可用。
     */
    const isCapabilityUnavailable = () =>
      ["unknown", "unavailable"].includes(String(capabilityState?.state || "").toLowerCase());
    const capabilityControlEntries = [];
    const hasPowerSwitchControl = ["fan", "switch", "input_boolean"].includes(capabilityDomain);
    const powerSwitchVisual = createSwitchVisual({
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
     * 选项先去重并去首尾空白，防止 HA 属性混入重复项导致按钮重影；电动床类的 select
     * 实体额外换成自绘下拉框（原生 select 在弹窗里样式不可控）。
     */
    const createCapabilityOptionGroup = (
      optionGroupLabel,
      optionGroupValues,
      optionGroupCurrent,
      optionGroupService,
      optionGroupDataKey,
      optionGroupDomain = capabilityDomain
    ) => {
      const normalizedGroupOptions = [
        ...new Set(
          (optionGroupValues || [])
            .map(groupOptionValue => String(groupOptionValue ?? "").trim())
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
      const optionGroupElement = document.createElement("section");
      optionGroupElement.className = "hb-capability-option-group";
      const optionGroupTitleElement = document.createElement("strong");
      optionGroupTitleElement.textContent = optionGroupLabel;
      const optionGroupOptionsElement = document.createElement("div");
      optionGroupOptionsElement.className = "hb-capability-options";
      if (
        ["electric-bed", "electric-bed-memory"].includes(capabilityVariant) &&
        capabilityDomain === "select"
      ) {
        const bedSelectWrapperElement = document.createElement("div");
        bedSelectWrapperElement.className = "hb-electric-bed-select";
        const bedSelectTriggerElement = document.createElement("button");
        bedSelectTriggerElement.type = "button";
        bedSelectTriggerElement.className = "hb-electric-bed-select-trigger";
        bedSelectTriggerElement.setAttribute("aria-label", optionGroupLabel);
        bedSelectTriggerElement.setAttribute("aria-haspopup", "listbox");
        bedSelectTriggerElement.setAttribute("aria-expanded", "false");
        const bedSelectValueElement = document.createElement("span");
        const bedSelectChevronElement = document.createElement("i");
        bedSelectChevronElement.setAttribute("aria-hidden", "true");
        bedSelectTriggerElement.append(bedSelectValueElement, bedSelectChevronElement);
        const bedSelectMenuElement = document.createElement("div");
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
         * 优先用 :popover-open 判定，老浏览器不支持该伪类时退回 dataset.open（由 toggle 事件
         * 与 open/close 函数共同维护）。
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
         * 菜单以 popover 挂在顶层、用 fixed 定位，故须按视口坐标自行计算并夹取：宽度取按钮
         * 宽度与 150px 的较大者，左右各留 10px，高度上限 306px。
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
         * 优先走原生 popover API，不支持时退化成普通定位 + dataset.open 标记；参数为真时
         * 把焦点移到当前选中项（键盘操作入口）。
         */
        const openBedSelectMenu = (shouldFocusBedOption = false) => {
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
         * 服务是异步的，不先同步 capabilityState 界面就要等一个来回才有反馈；失败时整体回滚到提交前的快照
         * 并交给 onError 走统一提示。state 只在服务是 select_option 时才覆盖，否则只写选项属性，避免污染其它能力的状态。
         */
        const selectBedOption = async bedOptionValue => {
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
         * 当前值不在候选列表里（属性刚被写坏）时显示第一项而非 undefined，列表为空时显示
         * 「读取中…」；选项按钮带 role=option 与 aria-selected，键盘可读。
         */
        const renderBedSelectOptions = (bedOptionValues, bedSelectedValue) => {
          bedSelectMenuElement.replaceChildren(
            ...bedOptionValues.map(bedOptionEntry => {
              const bedOptionButton = document.createElement("button");
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
        bedSelectTriggerElement.addEventListener("keydown", bedSelectKeyEvent => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(bedSelectKeyEvent.key)) {
            bedSelectKeyEvent.preventDefault();
            openBedSelectMenu(true);
          }
        });
        bedSelectMenuElement.addEventListener("keydown", bedMenuKeyEvent => {
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
            document.activeElement?.click();
          }
        });
        bedSelectMenuElement.addEventListener("toggle", bedToggleEvent => {
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
      const modeOptionButtons = [];
      for (const presetModeValue of normalizedGroupOptions) {
        const modeOptionButton = document.createElement("button");
        modeOptionButton.type = "button";
        // HA 各厂商的 preset_mode 写法不一（favorite / favorite_level 同义，low/medium/high
        // 与 strong/normal 也是常见档位），常见写法都列上；未收录的原样显示。
        const airPurifierModeLabels = {
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
          modeOptionButtons.forEach(modeButtonElement => {
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
            modeOptionButtons.forEach(modeButtonEntry => {
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
        const speedGroupElement = document.createElement("section");
        speedGroupElement.className = "hb-capability-option-group hb-air-purifier-speed-group";
        const speedGroupTitleElement = document.createElement("strong");
        speedGroupTitleElement.textContent = "风速";
        const speedOptionsElement = document.createElement("div");
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
        ].map(speedOption => {
          const speedOptionButton = document.createElement("button");
          speedOptionButton.type = "button";
          speedOptionButton.textContent = speedOption.label;
          speedOptionButton.dataset.percentage = String(speedOption.value);
          speedOptionButton.addEventListener("click", async () => {
            if (!capabilityInteractive || isCapabilityUnavailable()) {
              return;
            }
            speedOptionButtons.forEach(speedButtonElement => {
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
              speedOptionButtons.forEach(speedButtonEntry => {
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
        const percentageRangeGroupElement = document.createElement("section");
        percentageRangeGroupElement.className = "hb-capability-range-group";
        const percentageRangeHeadingElement = document.createElement("div");
        percentageRangeHeadingElement.className = "hb-capability-range-heading";
        const percentageRangeTitleElement = document.createElement("strong");
        percentageRangeTitleElement.textContent = "风速";
        const percentageRangeOutputElement = document.createElement("output");
        percentageRangeHeadingElement.append(
          percentageRangeTitleElement,
          percentageRangeOutputElement
        );
        const percentageRangeInputElement = document.createElement("input");
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
      const numberRangeGroupElement = document.createElement("section");
      numberRangeGroupElement.className = "hb-capability-range-group";
      const numberRangeHeadingElement = document.createElement("div");
      numberRangeHeadingElement.className = "hb-capability-range-heading";
      const numberRangeTitleElement = document.createElement("strong");
      numberRangeTitleElement.textContent = capabilityAttributes().unit_of_measurement
        ? "数值（" + capabilityAttributes().unit_of_measurement + "）"
        : "数值";
      const numberRangeOutputElement = document.createElement("output");
      numberRangeHeadingElement.append(numberRangeTitleElement, numberRangeOutputElement);
      const numberRangeInputElement = document.createElement("input");
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
     * fan 域的「开启」判定放宽为「非 off / unknown / unavailable」，其余域只认字符串 on；
     * 各控件分支都尽量只改 class / value / disabled，避免每次状态推送重建 DOM。
     */
    function syncCapabilityState(nextCapabilityState) {
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
          controlEntry.buttons.forEach(optionButtonElement =>
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
                .map(bedOptionValueEntry => String(bedOptionValueEntry ?? "").trim())
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
                .map(selectOptionValue => String(selectOptionValue ?? "").trim())
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
                ...selectOptionValues.map(optionValueEntry => {
                  const selectOptionElement = document.createElement("option");
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
          controlEntry.buttons.forEach(percentageButtonElement =>
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
