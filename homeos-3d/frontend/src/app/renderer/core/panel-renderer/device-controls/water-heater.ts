type AnyObj = Record<string, any>;
/*
 * 设备控件区块：热水器详情扩展（模式、目标温度与保温设置在 climate 之外的补充控件）。
 */

import { resolveStateEntry } from "../../../../utils/state-entry.js";
import { climateModeLabel } from "../../../controls/climate.js";
import {
  relatedEntityLabel,
  relatedEntityNeedsConfirmation,
  relatedEntityOptions,
  relatedEntitySelectService,
  relatedPopupContext,
  selectedRelatedEntities
} from "../../../../shared/related-entities.js";
import { confirmAction } from "../../../../shared/ui-confirm.js";
import {
  relatedWaterHeaterEntities,
  waterHeaterRelatedEntityLabel
} from "../../../controls/cover-runtime.js";

export const waterHeaterDetailsMethods = {
  /**
   * 构建热水器详情弹窗的扩展区（同设备上的照明、杀菌、循环等附加实体）。
   */
  createWaterHeaterExtensionControls(this: any, 
    extensionsEntityId: any,
    {
      component: extensionComponent = null,
      interactive: extensionsInteractive = true,
      excludedEntityIds: extensionExcludedEntityIds = []
    }: AnyObj = {}
  ) {
    const extensionPopupContext = extensionComponent
      ? relatedPopupContext(
          extensionComponent,
          this.entityMetadata,
          this.deviceMetadata,
          this.states
        )
      : null;
    const extensionSelectedEntities = extensionComponent
      ? selectedRelatedEntities(
          extensionComponent,
          this.entityMetadata,
          this.deviceMetadata,
          this.states
        )
      : null;
    const excludedEntityIdSet = new Set(extensionExcludedEntityIds);
    /**
     * 需要渲染成扩展控件的关联实体列表。
     */
    const extensionRelatedEntities = (
      extensionSelectedEntities === null
        ? relatedWaterHeaterEntities(this.entityMetadata, extensionsEntityId)
        : extensionSelectedEntities
    ).filter((relatedEntityEntry: any) => !excludedEntityIdSet.has(relatedEntityEntry.entityId));
    const primaryEntityMetadata =
      extensionPopupContext?.primary || this.entityMetadata.get(extensionsEntityId);
    if (!extensionRelatedEntities.length) {
      return null;
    }
    const extensionsElement: any = document.createElement("section");
    extensionsElement.className =
      "hb-related-entity-extensions hb-water-heater-extensions" +
      (extensionPopupContext?.deviceType ? " is-" + extensionPopupContext.deviceType : "");
    extensionsElement.dataset.controlSource =
      extensionSelectedEntities === null ? "automatic-device" : "user-selected";
    const stateHandlersByEntityId = new Map<any, any>();
    /**
     * 取扩展区某实体的状态，从未收到过状态时返回 unknown 占位对象。
     */
    const getExtensionEntityState = (handlerTargetEntityId: any) => {
      const extensionStateRecord: any = (this.states.get(handlerTargetEntityId) as any);
      return (
        resolveStateEntry(extensionStateRecord, {
          entityId: handlerTargetEntityId,
          state: "unknown",
          attributes: {}
        })
      );
    };
    /**
     * 注册扩展控件的状态回调（同一实体可挂多个）。
     */
    const registerExtensionStateHandler = (registeredHandlerEntityId: any, entityStateHandler: any) => {
      if (!stateHandlersByEntityId.has(registeredHandlerEntityId)) {
        stateHandlersByEntityId.set(registeredHandlerEntityId, []);
      }
      stateHandlersByEntityId.get(registeredHandlerEntityId).push(entityStateHandler);
    };
    const extensionGridElement: any = document.createElement("div");
    extensionGridElement.className = "hb-water-heater-extension-grid";
    for (const relatedEntityRecord of extensionRelatedEntities) {
      const relatedEntityId = relatedEntityRecord.entityId;
      const relatedEntityDomain = String(relatedEntityRecord.domain || "");
      const relatedEntityLabelText = extensionPopupContext
        ? relatedEntityLabel(extensionPopupContext, relatedEntityRecord)
        : waterHeaterRelatedEntityLabel(primaryEntityMetadata, relatedEntityRecord);
      if (["light", "switch", "input_boolean", "fan"].includes(relatedEntityDomain)) {
        const toggleButtonElement: any = document.createElement("button");
        toggleButtonElement.type = "button";
        toggleButtonElement.className = "hb-water-heater-extension-toggle";
        const toggleIconElement: any = document.createElement("i");
        toggleIconElement.setAttribute("aria-hidden", "true");
        const toggleTextElement: any = document.createElement("span");
        const toggleLabelElement: any = document.createElement("strong");
        toggleLabelElement.textContent = relatedEntityLabelText;
        const toggleStateElement: any = document.createElement("small");
        toggleTextElement.append(toggleLabelElement, toggleStateElement);
        toggleButtonElement.append(toggleIconElement, toggleTextElement);
        let toggleEntityState: any = getExtensionEntityState(relatedEntityId);
        let isTogglePending = false;
        /**
         * 渲染扩展区里的开关类控件（灯 / 开关 / 输入布尔 / 风扇）。
         */
        const renderExtensionToggle = (toggleSourceState: any = toggleEntityState) => {
          toggleEntityState = toggleSourceState || toggleEntityState;
          const toggleStateText: any = String(toggleEntityState?.state || "").toLowerCase();
          const isToggleUnavailable = ["unknown", "unavailable"].includes(toggleStateText);
          const isToggleOn = toggleStateText === "on";
          toggleButtonElement.classList.toggle("is-on", isToggleOn && !isToggleUnavailable);
          toggleButtonElement.classList.toggle("is-unavailable", isToggleUnavailable);
          toggleButtonElement.disabled =
            !extensionsInteractive || isTogglePending || isToggleUnavailable;
          toggleButtonElement.setAttribute("aria-pressed", String(isToggleOn));
          toggleButtonElement.setAttribute("aria-busy", String(isTogglePending));
          toggleStateElement.textContent = isToggleUnavailable
            ? "不可用"
            : isToggleOn
              ? "已开启"
              : "已关闭";
        };
        toggleButtonElement.addEventListener("click", async () => {
          if (
            !extensionsInteractive ||
            isTogglePending ||
            toggleButtonElement.classList.contains("is-unavailable")
          ) {
            return;
          }
          const toggleStateBeforeChange: any = toggleEntityState;
          const nextToggleIsOn = String(toggleEntityState?.state || "").toLowerCase() !== "on";
          isTogglePending = true;
          renderExtensionToggle({
            ...(toggleEntityState || {}),
            state: nextToggleIsOn ? "on" : "off"
          });
          try {
            await this.callEntityService("homeassistant", "toggle", relatedEntityId);
          } catch (toggleRequestError) {
            renderExtensionToggle(toggleStateBeforeChange);
            this.options.onError?.(toggleRequestError);
          } finally {
            isTogglePending = false;
            renderExtensionToggle(toggleEntityState);
          }
        });
        renderExtensionToggle(toggleEntityState);
        registerExtensionStateHandler(relatedEntityId, renderExtensionToggle);
        extensionGridElement.append(toggleButtonElement);
      } else if (["select", "input_select"].includes(relatedEntityDomain)) {
        const extensionSelectElement: any = document.createElement("div");
        extensionSelectElement.className = "hb-water-heater-extension-select";
        const extensionSelectLabelElement: any = document.createElement("span");
        extensionSelectLabelElement.textContent = relatedEntityLabelText;
        extensionSelectLabelElement.title = relatedEntityLabelText;
        const extensionSelectTriggerElement: any = document.createElement("button");
        extensionSelectTriggerElement.type = "button";
        extensionSelectTriggerElement.className = "hb-related-select-trigger";
        extensionSelectTriggerElement.setAttribute("aria-label", relatedEntityLabelText);
        extensionSelectTriggerElement.setAttribute("aria-haspopup", "listbox");
        extensionSelectTriggerElement.setAttribute("aria-expanded", "false");
        const extensionSelectValueElement: any = document.createElement("span");
        const extensionSelectChevronElement: any = document.createElement("i");
        extensionSelectChevronElement.setAttribute("aria-hidden", "true");
        extensionSelectTriggerElement.append(
          extensionSelectValueElement,
          extensionSelectChevronElement
        );
        const extensionSelectMenuElement: any = document.createElement("div");
        extensionSelectMenuElement.className = "hb-related-select-menu";
        extensionSelectMenuElement.id =
          "hb-related-select-" +
          String(this.renderNamespace || "runtime").replace(/[^a-z0-9_-]/gi, "-") +
          "-" +
          relatedEntityId.replace(/[^a-z0-9_-]/gi, "-");
        extensionSelectMenuElement.setAttribute("role", "listbox");
        extensionSelectMenuElement.setAttribute("popover", "auto");
        extensionSelectMenuElement.hidden = true;
        extensionSelectTriggerElement.setAttribute("aria-controls", extensionSelectMenuElement.id);
        let extensionSelectState: any = getExtensionEntityState(relatedEntityId);
        let extensionSelectedValue = String(extensionSelectState?.state || "");
        let isExtensionSelectPending = false;
        let lastOptionsSignature = "";
        let selectOptions: any[] = [];
        const selectLabelContext: AnyObj = {
          entityId: relatedEntityId,
          entityMetadata: this.entityMetadata,
          entityTranslations: this.entityTranslations,
          attributes: ["options", "option"]
        };
        /**
         * 把扩展下拉的取值格式化成展示文案。
         */
        const formatOptionLabel = (optionLabelValue: any) =>
          extensionPopupContext?.deviceType === "bath-heater"
            ? climateModeLabel(optionLabelValue, "bath-heater", selectLabelContext)
            : String(optionLabelValue || "");
        /**
         * 判断扩展下拉菜单是否展开。
         */
        const isExtensionMenuOpen = () => {
          try {
            return extensionSelectMenuElement.matches(":popover-open");
          } catch {
            return extensionSelectMenuElement.dataset.open === "true";
          }
        };
        /**
         * 计算并设置扩展下拉菜单的尺寸与位置（空间不足时向上翻转）。
         */
        const positionExtensionMenu = () => {
          if (!isExtensionMenuOpen() && extensionSelectMenuElement.hidden) {
            return;
          }
          const extensionTriggerRect = extensionSelectTriggerElement.getBoundingClientRect();
          const extensionViewportWidth = window.innerWidth;
          const extensionViewportHeight = window.innerHeight;
          const extensionMenuWidthPx = Math.min(
            Math.max(extensionTriggerRect.width, 132),
            Math.max(132, extensionViewportWidth - 16)
          );
          extensionSelectMenuElement.style.width = extensionMenuWidthPx + "px";
          extensionSelectMenuElement.style.maxHeight =
            Math.min(216, Math.max(88, extensionViewportHeight - 16)) + "px";
          const extensionMenuHeightPx = Math.min(extensionSelectMenuElement.scrollHeight || 0, 216);
          const extensionSpaceBelow = extensionViewportHeight - extensionTriggerRect.bottom - 8;
          const extensionSpaceAbove = extensionTriggerRect.top - 8;
          const extensionMenuTop =
            extensionSpaceBelow < Math.min(extensionMenuHeightPx, 140) &&
            extensionSpaceAbove > extensionSpaceBelow
              ? Math.max(8, extensionTriggerRect.top - extensionMenuHeightPx - 4)
              : Math.min(
                  extensionViewportHeight - extensionMenuHeightPx - 8,
                  extensionTriggerRect.bottom + 4
                );
          extensionSelectMenuElement.style.left =
            Math.max(
              8,
              Math.min(extensionTriggerRect.left, extensionViewportWidth - extensionMenuWidthPx - 8)
            ) + "px";
          extensionSelectMenuElement.style.top = Math.max(8, extensionMenuTop) + "px";
        };
        /**
         * 关闭扩展下拉菜单并同步无障碍状态。
         */
        const closeExtensionMenu = () => {
          if (
            isExtensionMenuOpen() &&
            typeof extensionSelectMenuElement.hidePopover == "function"
          ) {
            extensionSelectMenuElement.hidePopover();
          }
          extensionSelectMenuElement.hidden = true;
          extensionSelectMenuElement.dataset.open = "false";
          extensionSelectTriggerElement.setAttribute("aria-expanded", "false");
        };
        /**
         * 打开扩展下拉菜单并完成定位，必要时聚焦选项。
         */
        const openExtensionMenu = (shouldFocusFirst: any = false) => {
          if (!extensionSelectTriggerElement.disabled) {
            extensionSelectMenuElement.hidden = false;
            if (typeof extensionSelectMenuElement.showPopover == "function") {
              extensionSelectMenuElement.showPopover();
            } else {
              extensionSelectMenuElement.dataset.open = "true";
            }
            extensionSelectTriggerElement.setAttribute("aria-expanded", "true");
            positionExtensionMenu();
            if (shouldFocusFirst) {
              (
                extensionSelectMenuElement.querySelector('[aria-selected="true"]') ||
                extensionSelectMenuElement.querySelector('[role="option"]')
              )?.focus();
            }
          }
        };
        /**
         * 提交扩展下拉选中的取值：乐观渲染 → 调用对应选项服务 → 失败回滚。
         */
        const commitExtensionOption = async (extensionOptionValue: any) => {
          if (!extensionsInteractive || isExtensionSelectPending || !extensionOptionValue) {
            return;
          }
          const previousExtensionState: any = extensionSelectState;
          isExtensionSelectPending = true;
          closeExtensionMenu();
          renderExtensionSelect({
            ...(extensionSelectState || {}),
            state: extensionOptionValue,
            attributes: {
              ...(extensionSelectState?.attributes || {}),
              options: selectOptions
            }
          });
          try {
            const extensionSelectService = relatedEntitySelectService(relatedEntityDomain);
            if (!extensionSelectService) {
              throw new Error("实体 " + relatedEntityId + " 不支持选项服务。");
            }
            await this.callEntityService(
              extensionSelectService.domain,
              extensionSelectService.service,
              relatedEntityId,
              {
                option: extensionOptionValue
              }
            );
            extensionSelectedValue = extensionOptionValue;
          } catch (extensionSelectRequestError) {
            renderExtensionSelect(previousExtensionState);
            this.options.onError?.(extensionSelectRequestError);
          } finally {
            isExtensionSelectPending = false;
            renderExtensionSelect(extensionSelectState);
          }
        };
        /**
         * 重建扩展下拉的选项列表。
         */
        const renderExtensionOptions = (extensionOptions: any, extensionOptionsCurrent: any) => {
          extensionSelectMenuElement.replaceChildren(
            ...extensionOptions.map((extensionOptionLabelValue: any) => {
              const selectOptionButtonElement: any = document.createElement("button");
              selectOptionButtonElement.type = "button";
              selectOptionButtonElement.className = "hb-related-select-option";
              selectOptionButtonElement.setAttribute("role", "option");
              selectOptionButtonElement.dataset.value = extensionOptionLabelValue;
              selectOptionButtonElement.textContent = formatOptionLabel(extensionOptionLabelValue);
              selectOptionButtonElement.title = selectOptionButtonElement.textContent;
              const isExtensionOptionSelected =
                extensionOptionLabelValue === extensionOptionsCurrent;
              selectOptionButtonElement.classList.toggle("active", isExtensionOptionSelected);
              selectOptionButtonElement.setAttribute(
                "aria-selected",
                String(isExtensionOptionSelected)
              );
              selectOptionButtonElement.addEventListener("click", () =>
                commitExtensionOption(extensionOptionLabelValue)
              );
              return selectOptionButtonElement;
            })
          );
        };
        /**
         * 渲染扩展区的下拉（select / input_select）控件。
         */
        const renderExtensionSelect = (extensionSelectSourceState: any = extensionSelectState) => {
          extensionSelectState = extensionSelectSourceState || extensionSelectState;
          const extensionCurrentValueText = String(extensionSelectState?.state || "");
          const extensionOptionsList = relatedEntityOptions(
            relatedEntityRecord,
            extensionSelectState
          );
          selectOptions = extensionOptionsList;
          const extensionOptionsSignature = JSON.stringify(extensionOptionsList);
          if (extensionOptionsSignature !== lastOptionsSignature) {
            lastOptionsSignature = extensionOptionsSignature;
            renderExtensionOptions(extensionOptionsList, extensionCurrentValueText);
          } else {
            for (const extensionOptionElement of extensionSelectMenuElement.querySelectorAll(
              '[role="option"]'
            )) {
              const isExtensionValueSelected =
                extensionOptionElement.dataset.value === extensionCurrentValueText;
              extensionOptionElement.classList.toggle("active", isExtensionValueSelected);
              extensionOptionElement.setAttribute(
                "aria-selected",
                String(isExtensionValueSelected)
              );
            }
          }
          if (
            extensionCurrentValueText &&
            !["unknown", "unavailable"].includes(extensionCurrentValueText.toLowerCase())
          ) {
            extensionSelectedValue = extensionCurrentValueText;
          }
          extensionSelectValueElement.textContent = extensionSelectedValue
            ? formatOptionLabel(extensionSelectedValue)
            : extensionOptionsList.length
              ? formatOptionLabel(extensionOptionsList[0])
              : "无选项";
          extensionSelectValueElement.title = extensionSelectValueElement.textContent;
          extensionSelectTriggerElement.disabled =
            !extensionsInteractive ||
            isExtensionSelectPending ||
            !extensionOptionsList.length ||
            extensionCurrentValueText.toLowerCase() === "unavailable";
        };
        extensionSelectTriggerElement.addEventListener("click", () => {
          if (isExtensionMenuOpen() || extensionSelectMenuElement.dataset.open === "true") {
            closeExtensionMenu();
          } else {
            openExtensionMenu();
          }
        });
        extensionSelectTriggerElement.addEventListener("keydown", (extensionTriggerKeyEvent: any) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(extensionTriggerKeyEvent.key)) {
            extensionTriggerKeyEvent.preventDefault();
            openExtensionMenu(true);
          }
        });
        extensionSelectMenuElement.addEventListener("keydown", (extensionMenuKeyEvent: any) => {
          const extensionOptionElements = [
            ...extensionSelectMenuElement.querySelectorAll('[role="option"]')
          ];
          const extensionFocusedIndex = extensionOptionElements.indexOf(document.activeElement);
          if (extensionMenuKeyEvent.key === "Escape") {
            extensionMenuKeyEvent.preventDefault();
            closeExtensionMenu();
            extensionSelectTriggerElement.focus();
          } else if (
            extensionMenuKeyEvent.key === "ArrowDown" ||
            extensionMenuKeyEvent.key === "ArrowUp"
          ) {
            extensionMenuKeyEvent.preventDefault();
            const extensionStepDirection = extensionMenuKeyEvent.key === "ArrowDown" ? 1 : -1;
            extensionOptionElements[
              (extensionFocusedIndex + extensionStepDirection + extensionOptionElements.length) %
                extensionOptionElements.length
            ]?.focus();
          } else if (extensionMenuKeyEvent.key === "Enter" || extensionMenuKeyEvent.key === " ") {
            extensionMenuKeyEvent.preventDefault();
            (document.activeElement as HTMLElement | null)?.click();
          }
        });
        extensionSelectMenuElement.addEventListener("toggle", (extensionMenuToggleEvent: any) => {
          const isExtensionMenuVisible = extensionMenuToggleEvent.newState === "open";
          extensionSelectMenuElement.hidden = !isExtensionMenuVisible;
          extensionSelectMenuElement.dataset.open = String(isExtensionMenuVisible);
          extensionSelectTriggerElement.setAttribute(
            "aria-expanded",
            String(isExtensionMenuVisible)
          );
          if (isExtensionMenuVisible) {
            positionExtensionMenu();
          }
        });
        extensionSelectElement.append(
          extensionSelectLabelElement,
          extensionSelectTriggerElement,
          extensionSelectMenuElement
        );
        renderExtensionSelect(extensionSelectState);
        registerExtensionStateHandler(relatedEntityId, renderExtensionSelect);
        extensionGridElement.append(extensionSelectElement);
      } else if (["number", "input_number"].includes(relatedEntityDomain)) {
        const numberControlElement: any = document.createElement("div");
        numberControlElement.className = "hb-water-heater-extension-number";
        const numberLabelElement: any = document.createElement("span");
        numberLabelElement.textContent = relatedEntityLabelText;
        const numberStepperElement: any = document.createElement("span");
        const decrementButton = document.createElement("button");
        decrementButton.type = "button";
        decrementButton.textContent = "−";
        const numberOutputElement: any = document.createElement("output");
        const incrementButton = document.createElement("button");
        incrementButton.type = "button";
        incrementButton.textContent = "+";
        numberStepperElement.append(decrementButton, numberOutputElement, incrementButton);
        numberControlElement.append(numberLabelElement, numberStepperElement);
        let numberEntityState: any = getExtensionEntityState(relatedEntityId);
        let numericValue = Number(numberEntityState?.state);
        let isSteppingPending = false;
        /**
         * 解析数字实体的取值边界与步长，属性缺失时退回 0~100、步长 1。
         */
        const resolveNumberBounds = () => {
          const numberAttributes = numberEntityState?.attributes || {};
          const numberMinimum = Number(numberAttributes.min);
          const numberMaximum = Number(numberAttributes.max);
          const numberStep = Math.max(0.001, Number(numberAttributes.step) || 1);
          return {
            minimum: Number.isFinite(numberMinimum) ? numberMinimum : 0,
            maximum: Number.isFinite(numberMaximum) ? numberMaximum : 100,
            step: numberStep
          };
        };
        /**
         * 渲染扩展区的数字步进器：显示数值与单位，并按可用性禁用加减按钮。
         */
        const renderNumberControl = (numberSourceState: any = numberEntityState) => {
          numberEntityState = numberSourceState || numberEntityState;
          const stateNumber = Number(numberEntityState?.state);
          const isNumberUnavailable =
            !Number.isFinite(stateNumber) ||
            ["unknown", "unavailable"].includes(
              String(numberEntityState?.state || "").toLowerCase()
            );
          if (!isNumberUnavailable) {
            numericValue = stateNumber;
          }
          const numberUnit = String(numberEntityState?.attributes?.unit_of_measurement || "");
          numberOutputElement.textContent = isNumberUnavailable
            ? "--"
            : "" + stateNumber + numberUnit;
          decrementButton.disabled =
            !extensionsInteractive || isSteppingPending || isNumberUnavailable;
          incrementButton.disabled =
            !extensionsInteractive || isSteppingPending || isNumberUnavailable;
        };
        /**
         * 按步长调整数字实体并通过 set_value 下发。
         */
        const stepNumber = async (stepDirection: any) => {
          if (!extensionsInteractive || isSteppingPending || !Number.isFinite(numericValue)) {
            return;
          }
          const {
            minimum: boundMinimum,
            maximum: boundMaximum,
            step: boundStep
          } = resolveNumberBounds();
          const numberDecimals = String(boundStep).split(".")[1]?.length || 0;
          const nextNumberValue = Number(
            Math.max(
              boundMinimum,
              Math.min(boundMaximum, numericValue + stepDirection * boundStep)
            ).toFixed(numberDecimals)
          );
          if (nextNumberValue === numericValue) {
            return;
          }
          const previousNumberState: any = numberEntityState;
          isSteppingPending = true;
          renderNumberControl({
            ...(numberEntityState || {}),
            state: String(nextNumberValue)
          });
          try {
            await this.callEntityService(relatedEntityDomain, "set_value", relatedEntityId, {
              value: nextNumberValue
            });
            numericValue = nextNumberValue;
          } catch (numberRequestError) {
            renderNumberControl(previousNumberState);
            this.options.onError?.(numberRequestError);
          } finally {
            isSteppingPending = false;
            renderNumberControl(numberEntityState);
          }
        };
        decrementButton.addEventListener("click", () => stepNumber(-1));
        incrementButton.addEventListener("click", () => stepNumber(1));
        renderNumberControl(numberEntityState);
        registerExtensionStateHandler(relatedEntityId, renderNumberControl);
        extensionGridElement.append(numberControlElement);
      } else if (relatedEntityDomain === "button") {
        const actionButtonElement: any = document.createElement("button");
        actionButtonElement.type = "button";
        actionButtonElement.className = "hb-water-heater-extension-action";
        actionButtonElement.textContent = relatedEntityLabelText;
        let isActionPending = false;
        /**
         * 渲染扩展区按钮类控件的可用性。
         */
        const renderActionButton = (actionSourceState: any) => {
          const isActionUnavailable =
            String(actionSourceState?.state || "").toLowerCase() === "unavailable";
          actionButtonElement.disabled =
            !extensionsInteractive || isActionPending || isActionUnavailable;
        };
        actionButtonElement.addEventListener("click", async () => {
          if (
            !extensionsInteractive ||
            isActionPending ||
            actionButtonElement.disabled
          ) {
            return;
          }
          if (relatedEntityNeedsConfirmation(relatedEntityRecord)) {
            const confirmedAction = await confirmAction({
              kicker: "DANGER ZONE",
              title: "确认执行",
              message: "确认执行「" + relatedEntityLabelText + "」吗？",
              detail: "这是一项可能不可逆的操作，请确认后再继续。",
              confirmLabel: "确认执行",
              tone: "danger"
            });
            if (!confirmedAction) {
              return;
            }
          }
          isActionPending = true;
          renderActionButton(getExtensionEntityState(relatedEntityId));
          try {
            await this.callEntityService("button", "press", relatedEntityId);
          } catch (actionRequestError) {
            this.options.onError?.(actionRequestError);
          } finally {
            isActionPending = false;
            renderActionButton(getExtensionEntityState(relatedEntityId));
          }
        });
        renderActionButton(getExtensionEntityState(relatedEntityId));
        registerExtensionStateHandler(relatedEntityId, renderActionButton);
        extensionGridElement.append(actionButtonElement);
      } else if (["sensor", "binary_sensor"].includes(relatedEntityDomain)) {
        const readonlyControlElement: any = document.createElement("div");
        readonlyControlElement.className = "hb-water-heater-extension-readonly";
        const readonlyLabelElement: any = document.createElement("strong");
        readonlyLabelElement.textContent = relatedEntityLabelText;
        const readonlyValueElement: any = document.createElement("small");
        /**
         * 渲染扩展区的只读数值（sensor / binary_sensor）。
         */
        const renderReadonlyValue = (readonlySourceState: any) => {
          const readonlyStateText: any = String(readonlySourceState?.state || "unknown");
          const isReadonlyUnavailable = ["unknown", "unavailable"].includes(
            readonlyStateText.toLowerCase()
          );
          const readonlyUnit = String(readonlySourceState?.attributes?.unit_of_measurement || "");
          if (isReadonlyUnavailable) {
            readonlyValueElement.textContent = "不可用";
          } else if (relatedEntityDomain === "binary_sensor") {
            readonlyValueElement.textContent = readonlyStateText === "on" ? "已触发" : "正常";
          } else {
            readonlyValueElement.textContent =
              "" + readonlyStateText + (readonlyUnit ? " " + readonlyUnit : "");
          }
          readonlyControlElement.classList.toggle("is-unavailable", isReadonlyUnavailable);
        };
        readonlyControlElement.append(readonlyLabelElement, readonlyValueElement);
        renderReadonlyValue(getExtensionEntityState(relatedEntityId));
        registerExtensionStateHandler(relatedEntityId, renderReadonlyValue);
        extensionGridElement.append(readonlyControlElement);
      }
    }
    if (extensionGridElement.childElementCount) {
      const extensionTitleElement: any = document.createElement("strong");
      extensionTitleElement.className = "hb-water-heater-extension-title";
      extensionTitleElement.textContent = "扩展功能";
      extensionsElement.dataset.controlCount = String(extensionGridElement.childElementCount);
      extensionGridElement.dataset.controlCount = String(extensionGridElement.childElementCount);
      extensionsElement.append(extensionTitleElement, extensionGridElement);
    }
    extensionsElement.stateHandlers = stateHandlersByEntityId;
    extensionsElement.relatedEntityIds = extensionRelatedEntities.map(
      extensionEntityEntry => extensionEntityEntry.entityId
    );
    return extensionsElement;
  }
};
