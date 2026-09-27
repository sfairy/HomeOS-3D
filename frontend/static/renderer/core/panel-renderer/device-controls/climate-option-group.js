/**
 * 温控选项组（模式 / 风速 / 摆风 / 预设）控件的构建：内联按钮或自定义下拉二选一。
 *
 * 从 climate.js 拆出来：那一份只留设备详情控制区的编排，而这一份是「一组选项怎么画」的 450 行细节
 *（呈现形式由 climateOptionPresentation 按选项数量与文案长度决定；原生 select 满足不了样式与弹层
 * 定位，所以用 popover + listbox 手工实现并补齐键盘操作）。
 * 它原本是外层方法里的闭包，用到 12 个外层局部（要挂载的两个容器、实体与能力、变更回调、错误提示
 * 等）；外提时把这 12 个名字加成解构参数，调用点用 ...climateOptionGroupContext 展开传入 ——
 * 函数体一字未改，依赖关系反而在签名上写明了。
 */


import { randomUuid } from "../../../../utils/random-id.js?v=2609271208";
import {
  climateEffectMode,
  climateIsPoweredOn,
  climateOptionPresentation,
  climatePowerCommand,

} from "../../../controls/climate.js?v=2609271208";
     /**
      * 创建一组温控选项控件（模式 / 风速 / 摆风 / 预设等）。
      * 呈现形式由 climateOptionPresentation 按「选项数量与文案长度」自动决定：少量短文案用内联按钮，多或长 则用自定义下拉 —— 原生 select 无法满足样式与弹层定位需求，所以用 popover + listbox 角色手工实现并补齐
      * 键盘操作。取值列表去重后为空则整组不渲染，避免出现空区块。
      */

export function createClimateOptionGroup({
      label: optionLabel,
      values: optionValuesInput,
      current: optionCurrentValue,
      service: optionService,
      dataKey: optionDataKey,
      labels: optionLabels = {},
      icons: optionIcons = {},
      className: optionClassName = "",
      domain: optionDomain = "climate",
      presentation: optionPresentation = "auto",
      waterHeaterPanelElement,
      climateControlsInteractive,
      climateControlsEntityId,
      latestClimateEntityState,
      climatePowerChangeCallback,
      climateDeviceType,
      climateControlsElement,
      climateCapabilities,
      climateEntityDomain,
      renderClimateControls,
    }){
      const optionValues = [
        ...new Set(
          (Array.isArray(optionValuesInput) ? optionValuesInput : [])
            .map(optionValueInput => String(optionValueInput ?? "").trim())
            .filter(Boolean)
        )
      ];
      if (!optionValues.length) {
        return;
      }
      const presentationMode =
        optionPresentation === "auto"
          ? climateOptionPresentation(optionValues, optionLabels)
          : optionPresentation;
      const climateOptionGroupElement = document.createElement("div");
      climateOptionGroupElement.className = ("hb-climate-details-group " + optionClassName).trim();
      if (waterHeaterPanelElement) {
        climateOptionGroupElement.dataset.controlSource = "primary-entity";
      }
      const climateOptionGroupTitleElement = document.createElement("strong");
      climateOptionGroupTitleElement.textContent = optionLabel;
      if (presentationMode === "select") {
        climateOptionGroupElement.classList.add("select-options");
        const climateSelectContainerElement = document.createElement("div");
        climateSelectContainerElement.className = "hb-climate-select";
        climateSelectContainerElement.dataset.climateService = optionService;
        climateSelectContainerElement.dataset.currentValue = String(optionCurrentValue ?? "");
        const selectTriggerElement = document.createElement("button");
        selectTriggerElement.type = "button";
        selectTriggerElement.className = "hb-climate-select-trigger";
        selectTriggerElement.setAttribute("aria-label", optionLabel);
        selectTriggerElement.setAttribute("aria-haspopup", "listbox");
        selectTriggerElement.setAttribute("aria-expanded", "false");
        selectTriggerElement.disabled = !climateControlsInteractive;
        const selectTriggerLabelElement = document.createElement("span");
        const selectChevronElement = document.createElement("i");
        selectChevronElement.setAttribute("aria-hidden", "true");
        selectTriggerElement.append(selectTriggerLabelElement, selectChevronElement);
        const selectMenuElement = document.createElement("div");
        selectMenuElement.className = "hb-climate-select-menu";
        selectMenuElement.id = "hb-climate-select-" + randomUuid();
        selectMenuElement.setAttribute("role", "listbox");
        selectMenuElement.setAttribute("aria-label", optionLabel);
        selectMenuElement.setAttribute("popover", "auto");
        selectMenuElement.hidden = true;
        selectTriggerElement.setAttribute("aria-controls", selectMenuElement.id);
        let isSelectRequestPending = false;
        /**
         * 判断下拉菜单当前是否展开。
         * 优先用 :popover-open 伪类；不支持 popover 的环境走兼容分支读 dataset.open 标记，
         * 避免整个方法抛错导致菜单彻底不可用。
         */
        const isSelectMenuOpen = () => {
          try {
            return selectMenuElement.matches(":popover-open");
          } catch {
            return selectMenuElement.dataset.open === "true";
          }
        };
        /**
         * 把下拉当前值渲染到触发器文案与菜单项的选中态上。
         * 显示文案优先取对应菜单项文本（可能已本地化），找不到才退回原始值，保证未在 labels
         * 登记的取值也能显示。
         */
        const renderSelectValue = selectValueOption => {
          const currentSelectValueText = String(selectValueOption ?? "");
          climateSelectContainerElement.dataset.currentValue = currentSelectValueText;
          const selectedMenuOptionElement = Array.from(
            selectMenuElement.querySelectorAll('[role="option"]')
          ).find(menuOptionSearch => menuOptionSearch.dataset.value === currentSelectValueText);
          selectTriggerLabelElement.textContent =
            selectedMenuOptionElement?.textContent || currentSelectValueText || "请选择";
          selectTriggerLabelElement.title = selectTriggerLabelElement.textContent;
          selectMenuElement.querySelectorAll('[role="option"]').forEach(menuOptionToggle => {
            const isMenuOptionSelected = menuOptionToggle.dataset.value === currentSelectValueText;
            menuOptionToggle.classList.toggle("active", isMenuOptionSelected);
            menuOptionToggle.setAttribute("aria-selected", String(isMenuOptionSelected));
          });
        };
        /**
         * 计算并设置下拉菜单的尺寸与位置（空间不足时向上翻转）。
         * 用 fixed 定位并夹进取视口：宽度取触发器宽度与 190px 的较大值、高度上限 360px；
         * 下方容不下且上方更宽裕时向上弹；最后把 left/top 夹进视口内 10px，避免贴边或溢出。
         *
         * 为什么不与编辑器侧那 11 处下拉共用 `shared/menu-positioning.js`：这里有三处手感是它
         * 没有的 —— 宽度**下限** 190px、翻转阈值用 `min(内容高, 180)` 且要求上方更宽裕、不翻转时
         * 把 top 也夹进视口。共享实现要长出三个开关才能表达，而那三个开关只服务这一个调用点；
         * 强行合并会改掉长菜单贴底时的翻转时机（本文件在展示页上），得靠视觉验证兜。故保留分叉。
         */
        const positionSelectMenu = () => {
          if (!isSelectMenuOpen() && selectMenuElement.hidden) {
            return;
          }
          const triggerRect = selectTriggerElement.getBoundingClientRect();
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          const menuWidthPx = Math.min(
            Math.max(triggerRect.width, 190),
            Math.max(190, viewportWidth - 20)
          );
          selectMenuElement.style.width = menuWidthPx + "px";
          selectMenuElement.style.maxHeight =
            Math.min(360, Math.max(120, viewportHeight - 20)) + "px";
          const menuHeightPx = Math.min(selectMenuElement.scrollHeight || 0, 360);
          const spaceBelowPx = viewportHeight - triggerRect.bottom - 10;
          const spaceAbovePx = triggerRect.top - 10;
          const menuTopPx =
            spaceBelowPx < Math.min(menuHeightPx, 180) && spaceAbovePx > spaceBelowPx
              ? Math.max(10, triggerRect.top - menuHeightPx - 5)
              : Math.min(viewportHeight - menuHeightPx - 10, triggerRect.bottom + 5);
          selectMenuElement.style.left =
            Math.max(10, Math.min(triggerRect.left, viewportWidth - menuWidthPx - 10)) + "px";
          selectMenuElement.style.top = Math.max(10, menuTopPx) + "px";
        };
        /**
         * 关闭下拉菜单，并同步 hidden 标记与 aria-expanded。
         */
        const closeSelectMenu = () => {
          if (isSelectMenuOpen() && typeof selectMenuElement.hidePopover == "function") {
            selectMenuElement.hidePopover();
          }
          selectMenuElement.hidden = true;
          selectMenuElement.dataset.open = "false";
          selectTriggerElement.setAttribute("aria-expanded", "false");
        };
        /**
         * 打开下拉菜单并完成定位，必要时把焦点移入选项。
         *
         * 触发器禁用或有请求在途时不打开，避免在提交过程中切换取值。
         */
        const openSelectMenu = (shouldFocusFirstOption = false) => {
          if (!selectTriggerElement.disabled && !isSelectRequestPending) {
            selectMenuElement.hidden = false;
            if (typeof selectMenuElement.showPopover == "function") {
              selectMenuElement.showPopover();
            } else {
              selectMenuElement.dataset.open = "true";
            }
            selectTriggerElement.setAttribute("aria-expanded", "true");
            positionSelectMenu();
            if (shouldFocusFirstOption) {
              (
                selectMenuElement.querySelector('[aria-selected="true"]') ||
                selectMenuElement.querySelector('[role="option"]')
              )?.focus();
            }
          }
        };
        /**
         * 提交下拉选中的取值：先乐观刷新触发器文案，再调用服务，失败时回滚显示。
         * 成功后必须把结果合并进 latestClimateEntityState：状态推送总晚于服务返回，不合并的话紧接着的 renderClimateControls 会按旧状态把刚选中的模式改回去。合并时还要补齐派生字段 —— hvac_mode 同步 state 与
         * hvac_action（否则配色不对），浴霸预设的「待机/关闭」折算成 off，水暖的 operation_mode 映射成 on/off。
         */
        const commitSelectOption = async committedOptionValue => {
          if (!climateControlsInteractive || isSelectRequestPending) {
            return;
          }
          const previousSelectValue = climateSelectContainerElement.dataset.currentValue;
          isSelectRequestPending = true;
          selectTriggerElement.disabled = true;
          closeSelectMenu();
          renderSelectValue(committedOptionValue);
          try {
            await this.callEntityService(optionDomain, optionService, climateControlsEntityId, {
              [optionDataKey]: committedOptionValue
            });
            const nextClimateAttributes = {
              ...(latestClimateEntityState?.attributes || {}),
              [optionDataKey]: committedOptionValue
            };
            if (optionService === "set_hvac_mode") {
              latestClimateEntityState = {
                ...(latestClimateEntityState || {}),
                state: committedOptionValue,
                attributes: {
                  ...nextClimateAttributes,
                  hvac_action:
                    committedOptionValue === "cool"
                      ? "cooling"
                      : committedOptionValue === "heat"
                        ? "heating"
                        : committedOptionValue === "off"
                          ? "off"
                          : committedOptionValue
                }
              };
              climatePowerChangeCallback?.(committedOptionValue !== "off");
            } else if (optionService === "set_preset_mode") {
              const isStandbyPreset =
                climateDeviceType === "bath-heater" &&
                ["idle", "standby", "待机", "关闭"].includes(
                  String(committedOptionValue).trim().toLowerCase()
                );
              const fallbackClimateMode =
                climateControlsElement.dataset.lastClimateMode ||
                climateCapabilities.hvacModes.find(
                  fallbackModeCandidate => fallbackModeCandidate !== "off"
                ) ||
                (climateEntityDomain === "fan" ? "on" : "auto");
              const nextPresetClimateState = {
                ...(latestClimateEntityState || {}),
                state: isStandbyPreset
                  ? "off"
                  : climateIsPoweredOn(latestClimateEntityState, climateDeviceType)
                    ? latestClimateEntityState?.state
                    : fallbackClimateMode,
                attributes: {
                  ...nextClimateAttributes,
                  preset_mode: committedOptionValue
                }
              };
              const presetEffectMode = climateEffectMode(nextPresetClimateState, climateDeviceType);
              nextPresetClimateState.attributes.hvac_action = isStandbyPreset
                ? "idle"
                : presetEffectMode === "cool"
                  ? "cooling"
                  : presetEffectMode === "heat"
                    ? "heating"
                    : "fan";
              latestClimateEntityState = nextPresetClimateState;
              climatePowerChangeCallback?.(!isStandbyPreset);
            } else if (optionService === "set_operation_mode") {
              latestClimateEntityState = {
                ...(latestClimateEntityState || {}),
                state: committedOptionValue === "off" ? "off" : "on",
                attributes: {
                  ...nextClimateAttributes,
                  operation_mode: committedOptionValue
                }
              };
              climatePowerChangeCallback?.(committedOptionValue !== "off");
            } else {
              latestClimateEntityState = {
                ...(latestClimateEntityState || {}),
                attributes: nextClimateAttributes
              };
            }
            renderClimateControls();
          } catch (selectRequestError) {
            renderSelectValue(previousSelectValue);
            this.options.onError?.(selectRequestError);
          } finally {
            isSelectRequestPending = false;
            selectTriggerElement.disabled = !climateControlsInteractive;
          }
        };
        for (const optionButtonValue of optionValues) {
          const climateSelectOptionElement = document.createElement("button");
          climateSelectOptionElement.type = "button";
          climateSelectOptionElement.className = "hb-climate-select-option";
          climateSelectOptionElement.setAttribute("role", "option");
          climateSelectOptionElement.dataset.value = optionButtonValue;
          climateSelectOptionElement.textContent =
            optionLabels[optionButtonValue] || optionButtonValue;
          climateSelectOptionElement.title = climateSelectOptionElement.textContent;
          climateSelectOptionElement.addEventListener("click", () =>
            commitSelectOption(optionButtonValue)
          );
          selectMenuElement.append(climateSelectOptionElement);
        }
        renderSelectValue(String(optionCurrentValue ?? ""));
        selectTriggerElement.addEventListener("click", () => {
          if (isSelectMenuOpen() || selectMenuElement.dataset.open === "true") {
            closeSelectMenu();
          } else {
            openSelectMenu();
          }
        });
        selectTriggerElement.addEventListener("keydown", triggerKeyEvent => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(triggerKeyEvent.key)) {
            triggerKeyEvent.preventDefault();
            openSelectMenu(true);
          }
        });
        selectMenuElement.addEventListener("keydown", menuKeyEvent => {
          const menuOptionElements = [...selectMenuElement.querySelectorAll('[role="option"]')];
          const focusedOptionIndex = menuOptionElements.indexOf(document.activeElement);
          if (menuKeyEvent.key === "Escape") {
            menuKeyEvent.preventDefault();
            closeSelectMenu();
            selectTriggerElement.focus();
          } else if (menuKeyEvent.key === "ArrowDown" || menuKeyEvent.key === "ArrowUp") {
            menuKeyEvent.preventDefault();
            const menuStepDirection = menuKeyEvent.key === "ArrowDown" ? 1 : -1;
            menuOptionElements[
              (focusedOptionIndex + menuStepDirection + menuOptionElements.length) %
                menuOptionElements.length
            ]?.focus();
          } else if (menuKeyEvent.key === "Enter" || menuKeyEvent.key === " ") {
            menuKeyEvent.preventDefault();
            document.activeElement?.click();
          }
        });
        selectMenuElement.addEventListener("toggle", menuToggleEvent => {
          const isMenuVisible = menuToggleEvent.newState === "open";
          selectMenuElement.hidden = !isMenuVisible;
          selectMenuElement.dataset.open = String(isMenuVisible);
          selectTriggerElement.setAttribute("aria-expanded", String(isMenuVisible));
          if (isMenuVisible) {
            positionSelectMenu();
          }
        });
        climateSelectContainerElement.append(selectTriggerElement, selectMenuElement);
        climateOptionGroupElement.append(
          climateOptionGroupTitleElement,
          climateSelectContainerElement
        );
        (waterHeaterPanelElement || climateControlsElement).append(climateOptionGroupElement);
        return;
      }
      const inlineOptionsElement = document.createElement("div");
      inlineOptionsElement.className = "hb-climate-details-options";
      for (const inlineOptionValue of optionValues) {
        const inlineOptionButton = document.createElement("button");
        inlineOptionButton.type = "button";
        inlineOptionButton.dataset.climateService = optionService;
        inlineOptionButton.dataset.climateValue = inlineOptionValue;
        const inlineOptionIconElement = document.createElement("i");
        inlineOptionIconElement.setAttribute("aria-hidden", "true");
        inlineOptionIconElement.textContent = optionIcons[inlineOptionValue] || "";
        const inlineOptionLabelElement = document.createElement("span");
        inlineOptionLabelElement.textContent = optionLabels[inlineOptionValue] || inlineOptionValue;
        inlineOptionButton.append(inlineOptionIconElement, inlineOptionLabelElement);
        inlineOptionButton.classList.toggle("active", inlineOptionValue === optionCurrentValue);
        inlineOptionButton.addEventListener("click", async () => {
          if (!climateControlsInteractive) {
            return;
          }
          const isStandbyOption =
            climateDeviceType === "bath-heater" &&
            optionService === "set_preset_mode" &&
            ["idle", "standby", "待机", "关闭"].includes(
              String(inlineOptionValue).trim().toLowerCase()
            );
          inlineOptionsElement.querySelectorAll("button").forEach(inlineOptionElement => {
            inlineOptionElement.disabled = true;
          });
          try {
            await this.callEntityService(optionDomain, optionService, climateControlsEntityId, {
              [optionDataKey]: inlineOptionValue
            });
            if (isStandbyOption) {
              const powerCommandRequest = climatePowerCommand(
                climateControlsEntityId,
                latestClimateEntityState,
                false,
                "bath-heater"
              );
              await this.callEntityService(
                powerCommandRequest.domain,
                powerCommandRequest.service,
                climateControlsEntityId,
                powerCommandRequest.data
              );
            }
            inlineOptionsElement
              .querySelectorAll("button")
              .forEach(inlineButtonElement =>
                inlineButtonElement.classList.toggle(
                  "active",
                  inlineButtonElement === inlineOptionButton
                )
              );
            if (optionService === "set_hvac_mode") {
              const hvacAction =
                inlineOptionValue === "cool"
                  ? "cooling"
                  : inlineOptionValue === "heat"
                    ? "heating"
                    : inlineOptionValue === "off"
                      ? "off"
                      : inlineOptionValue;
              latestClimateEntityState = {
                ...(latestClimateEntityState || {}),
                state: inlineOptionValue,
                attributes: {
                  ...(latestClimateEntityState?.attributes || {}),
                  hvac_action: hvacAction
                }
              };
              renderClimateControls();
              climatePowerChangeCallback?.(inlineOptionValue !== "off");
            } else if (optionService === "set_preset_mode") {
              const isStandbyOptionValue = isStandbyOption;
              const fallbackModeValue =
                climateControlsElement.dataset.lastClimateMode ||
                climateCapabilities.hvacModes.find(
                  fallbackModeOption => fallbackModeOption !== "off"
                ) ||
                (climateEntityDomain === "fan" ? "on" : "auto");
              const nextPresetStateValue = {
                ...(latestClimateEntityState || {}),
                state: isStandbyOptionValue
                  ? "off"
                  : climateIsPoweredOn(latestClimateEntityState, climateDeviceType)
                    ? latestClimateEntityState?.state
                    : fallbackModeValue,
                attributes: {
                  ...(latestClimateEntityState?.attributes || {}),
                  preset_mode: inlineOptionValue
                }
              };
              const presetEffectModeValue = climateEffectMode(
                nextPresetStateValue,
                climateDeviceType
              );
              nextPresetStateValue.attributes.hvac_action = isStandbyOptionValue
                ? "idle"
                : presetEffectModeValue === "cool"
                  ? "cooling"
                  : presetEffectModeValue === "heat"
                    ? "heating"
                    : "fan";
              latestClimateEntityState = nextPresetStateValue;
              renderClimateControls();
              climatePowerChangeCallback?.(!isStandbyOptionValue);
            } else if (optionService === "set_operation_mode") {
              latestClimateEntityState = {
                ...(latestClimateEntityState || {}),
                state: inlineOptionValue === "off" ? "off" : "on",
                attributes: {
                  ...(latestClimateEntityState?.attributes || {}),
                  operation_mode: inlineOptionValue
                }
              };
              renderClimateControls();
              climatePowerChangeCallback?.(inlineOptionValue !== "off");
            }
          } catch (optionRequestError) {
            this.options.onError?.(optionRequestError);
          } finally {
            inlineOptionsElement.querySelectorAll("button").forEach(disabledButtonElement => {
              disabledButtonElement.disabled = false;
            });
          }
        });
        inlineOptionsElement.append(inlineOptionButton);
      }
      climateOptionGroupElement.append(climateOptionGroupTitleElement, inlineOptionsElement);
      (waterHeaterPanelElement || climateControlsElement).append(climateOptionGroupElement);
    }
