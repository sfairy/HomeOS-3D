import type { ComponentControllerElement } from "../renderer-types";
import type { PanelRenderer } from "../panel-renderer";
import { clickFocusedElement } from "../renderer-helpers";
import { climateModeLabel as climateModeLabel2 } from "../controls/climate";
import { relatedEntityLabel as relatedEntityLabel2, relatedEntityNeedsConfirmation as relatedEntityNeedsConfirmation2, relatedEntityOptions as relatedEntityOptions2, relatedEntitySelectService as relatedEntitySelectService2, relatedPopupContext as relatedPopupContext2, selectedRelatedEntities as selectedRelatedEntities2 } from "../../shared/related-entities";
import { relatedWaterHeaterEntities as relatedWaterHeaterEntities2, waterHeaterRelatedEntityLabel as waterHeaterRelatedEntityLabel2 } from "../controls/cover-runtime";
import { shellConfirm } from "@/studio/platform/shell-chrome";

export function createWaterHeaterExtensionControls(this: PanelRenderer, 
    primaryEntityId: any,
    {
      component: componentRecord = null,
      interactive: createWaterHeaterExtensionControlsIsInteractive = true,
      excludedEntityIds: excludedEntityIdsInput = [],
    }: any = {},
  ): ComponentControllerElement | null {
    const relatedPopupEntities = componentRecord
        ? relatedPopupContext2(
            componentRecord,
            this.entityMetadata,
            this.deviceMetadata,
            this.states,
          )
        : null,
      selectedRelatedEntities = componentRecord
        ? selectedRelatedEntities2(
            componentRecord,
            this.entityMetadata,
            this.deviceMetadata,
            this.states,
          )
        : null,
      excludedEntityIdSet = new Set(excludedEntityIdsInput),
      relatedEntityControls = (
        selectedRelatedEntities === null
          ? relatedWaterHeaterEntities2(this.entityMetadata, primaryEntityId)
          : selectedRelatedEntities
      ).filter((relatedEntityControl) => !excludedEntityIdSet.has(relatedEntityControl.entityId)),
      primaryEntity = relatedPopupEntities?.primary || this.entityMetadata.get(primaryEntityId);
    if (!relatedEntityControls.length) return null;
    const waterHeaterExtensionSection: ComponentControllerElement = document.createElement("section");
    ((waterHeaterExtensionSection.className =
      "hb-related-entity-extensions hb-water-heater-extensions" +
      (relatedPopupEntities?.deviceType ? " is-" + relatedPopupEntities.deviceType : "")),
      (waterHeaterExtensionSection.dataset.controlSource =
        selectedRelatedEntities === null ? "automatic-device" : "user-selected"));
    const stateHandlersByEntityId = new Map(),
      resolveEntityState = (stateEntityId: any) => {
        const resolvedEntityState = this.states.get(stateEntityId);
        return (
          resolvedEntityState?.newState ||
          resolvedEntityState || {
            entityId: stateEntityId,
            state: "unknown",
            attributes: {} as Record<string, any>,
          }
        );
      },
      registerStateHandler = (
        createWaterHeaterExtensionControlsHandledEntityId: any,
        registeredStateHandler: any,
      ) => {
        (stateHandlersByEntityId.has(createWaterHeaterExtensionControlsHandledEntityId) ||
          stateHandlersByEntityId.set(createWaterHeaterExtensionControlsHandledEntityId, []),
          stateHandlersByEntityId
            .get(createWaterHeaterExtensionControlsHandledEntityId)
            .push(registeredStateHandler));
      },
      extensionGrid = document.createElement("div");
    extensionGrid.className = "hb-water-heater-extension-grid";
    for (const relatedEntity of relatedEntityControls) {
      const entityId2 = relatedEntity.entityId,
        controlEntityDomain = String(relatedEntity.domain || ""),
        entityLabel = relatedPopupEntities
          ? relatedEntityLabel2(relatedPopupEntities, relatedEntity)
          : waterHeaterRelatedEntityLabel2(primaryEntity, relatedEntity);
      if (["light", "switch", "input_boolean", "fan"].includes(controlEntityDomain)) {
        const extensionToggleButton = document.createElement("button");
        ((extensionToggleButton.type = "button"),
          (extensionToggleButton.className = "hb-water-heater-extension-toggle"));
        const extensionToggleIcon = document.createElement("i");
        extensionToggleIcon.setAttribute("aria-hidden", "true");
        const extensionToggleWrapper = document.createElement("span"),
          extensionToggleLabel = document.createElement("strong");
        extensionToggleLabel.textContent = entityLabel;
        const extensionToggleStateLabel = document.createElement("small");
        (extensionToggleWrapper.append(extensionToggleLabel, extensionToggleStateLabel),
          extensionToggleButton.append(extensionToggleIcon, extensionToggleWrapper));
        let relatedEntityState = resolveEntityState(entityId2),
          isToggleBusy = false;
        const syncExtensionToggle = (nextToggleState = relatedEntityState) => {
          relatedEntityState = nextToggleState || relatedEntityState;
          const lowerCase9 = String(relatedEntityState?.state || "").toLowerCase(),
            isEntityUnavailable = ["unknown", "unavailable"].includes(lowerCase9),
            isEntityOn = lowerCase9 === "on";
          (extensionToggleButton.classList.toggle("is-on", isEntityOn && !isEntityUnavailable),
            extensionToggleButton.classList.toggle("is-unavailable", isEntityUnavailable),
            (extensionToggleButton.disabled =
              !createWaterHeaterExtensionControlsIsInteractive ||
              isToggleBusy ||
              isEntityUnavailable),
            extensionToggleButton.setAttribute("aria-pressed", String(isEntityOn)),
            extensionToggleButton.setAttribute("aria-busy", String(isToggleBusy)),
            (extensionToggleStateLabel.textContent = isEntityUnavailable
              ? "不可用"
              : isEntityOn
                ? "已开启"
                : "已关闭"));
        };
        (extensionToggleButton.addEventListener("click", async () => {
          if (
            !createWaterHeaterExtensionControlsIsInteractive ||
            isToggleBusy ||
            extensionToggleButton.classList.contains("is-unavailable")
          )
            return;
          const confirmedEntityState = relatedEntityState,
            isNextStateOn = String(relatedEntityState?.state || "").toLowerCase() !== "on";
          ((isToggleBusy = true),
            syncExtensionToggle({
              ...(relatedEntityState || {}),
              state: isNextStateOn ? "on" : "off",
            }));
          try {
            await this.callEntityService("homeassistant", "toggle", entityId2);
          } catch (toggleStateError: any) {
            (syncExtensionToggle(confirmedEntityState), this.options.onError?.(toggleStateError));
          } finally {
            ((isToggleBusy = false), syncExtensionToggle(relatedEntityState));
          }
        }),
          syncExtensionToggle(relatedEntityState),
          registerStateHandler(entityId2, syncExtensionToggle),
          extensionGrid.append(extensionToggleButton));
      } else {
        if (["select", "input_select"].includes(controlEntityDomain)) {
          const extensionSelectWrapper = document.createElement("div");
          extensionSelectWrapper.className = "hb-water-heater-extension-select";
          const extensionSelectLabel = document.createElement("span");
          ((extensionSelectLabel.textContent = entityLabel),
            (extensionSelectLabel.title = entityLabel));
          const relatedSelectTriggerButton = document.createElement("button");
          ((relatedSelectTriggerButton.type = "button"),
            (relatedSelectTriggerButton.className = "hb-related-select-trigger"),
            relatedSelectTriggerButton.setAttribute("aria-label", entityLabel),
            relatedSelectTriggerButton.setAttribute("aria-haspopup", "listbox"),
            relatedSelectTriggerButton.setAttribute("aria-expanded", "false"));
          const relatedSelectValueLabel = document.createElement("span"),
            relatedSelectCaretIcon = document.createElement("i");
          (relatedSelectCaretIcon.setAttribute("aria-hidden", "true"),
            relatedSelectTriggerButton.append(relatedSelectValueLabel, relatedSelectCaretIcon));
          const relatedSelectMenu = document.createElement("div");
          ((relatedSelectMenu.className = "hb-related-select-menu"),
            (relatedSelectMenu.id =
              "hb-related-select-" +
              String(this.renderNamespace || "runtime").replace(/[^a-z0-9_-]/gi, "-") +
              "-" +
              entityId2.replace(/[^a-z0-9_-]/gi, "-")),
            relatedSelectMenu.setAttribute("role", "listbox"),
            relatedSelectMenu.setAttribute("popover", "auto"),
            (relatedSelectMenu.hidden = true),
            relatedSelectTriggerButton.setAttribute("aria-controls", relatedSelectMenu.id));
          let selectEntityState = resolveEntityState(entityId2),
            selectStateValue = String(selectEntityState?.state || ""),
            isSelectBusy = false,
            cachedOptionsSignature = "",
            relatedEntityOptions: any = [];
          const bathHeaterLabelOptions = {
              entityId: entityId2,
              entityMetadata: this.entityMetadata,
              entityTranslations: this.entityTranslations,
              attributes: ["options", "option"],
            },
            relatedOptionLabel = (optionDisplayValue: any) =>
              relatedPopupEntities?.deviceType === "bath-heater"
                ? climateModeLabel2(optionDisplayValue, "bath-heater", bathHeaterLabelOptions)
                : String(optionDisplayValue || ""),
            isRelatedMenuVisible = () => {
              try {
                return relatedSelectMenu.matches(":popover-open");
              } catch {
                return relatedSelectMenu.dataset.open === "true";
              }
            },
            positionRelatedMenu = () => {
              if (!isRelatedMenuVisible() && relatedSelectMenu.hidden) return;
              const relatedTriggerBounds = relatedSelectTriggerButton.getBoundingClientRect(),
                innerWidth3 = window.innerWidth,
                innerHeight3 = window.innerHeight,
                relatedMenuWidth = Math.min(
                  Math.max(relatedTriggerBounds.width, 132),
                  Math.max(132, innerWidth3 - 16),
                );
              ((relatedSelectMenu.style.width = relatedMenuWidth + "px"),
                (relatedSelectMenu.style.maxHeight =
                  Math.min(216, Math.max(88, innerHeight3 - 16)) + "px"));
              const relatedMenuHeight = Math.min(relatedSelectMenu.scrollHeight || 0, 216),
                relatedSpaceBelow = innerHeight3 - relatedTriggerBounds.bottom - 8,
                relatedSpaceAbove = relatedTriggerBounds.top - 8,
                relatedMenuTop =
                  relatedSpaceBelow < Math.min(relatedMenuHeight, 140) &&
                  relatedSpaceAbove > relatedSpaceBelow
                    ? Math.max(8, relatedTriggerBounds.top - relatedMenuHeight - 4)
                    : Math.min(
                        innerHeight3 - relatedMenuHeight - 8,
                        relatedTriggerBounds.bottom + 4,
                      );
              ((relatedSelectMenu.style.left =
                Math.max(
                  8,
                  Math.min(relatedTriggerBounds.left, innerWidth3 - relatedMenuWidth - 8),
                ) + "px"),
                (relatedSelectMenu.style.top = Math.max(8, relatedMenuTop) + "px"));
            },
            openRelatedMenu = () => {
              (isRelatedMenuVisible() &&
                typeof relatedSelectMenu.hidePopover == "function" &&
                relatedSelectMenu.hidePopover(),
                (relatedSelectMenu.hidden = true),
                (relatedSelectMenu.dataset.open = "false"),
                relatedSelectTriggerButton.setAttribute("aria-expanded", "false"));
            },
            closeRelatedMenu = (shouldFocusRelatedTrigger = false) => {
              relatedSelectTriggerButton.disabled ||
                ((relatedSelectMenu.hidden = false),
                typeof relatedSelectMenu.showPopover == "function"
                  ? relatedSelectMenu.showPopover()
                  : (relatedSelectMenu.dataset.open = "true"),
                relatedSelectTriggerButton.setAttribute("aria-expanded", "true"),
                positionRelatedMenu(),
                shouldFocusRelatedTrigger &&
                  (
                    relatedSelectMenu.querySelector<HTMLElement>('[aria-selected="true"]') ||
                    relatedSelectMenu.querySelector<HTMLElement>('[role="option"]')
                  )?.focus());
            },
            selectRelatedOption = async (optionStateValue: any) => {
              if (
                !createWaterHeaterExtensionControlsIsInteractive ||
                isSelectBusy ||
                !optionStateValue
              )
                return;
              const previousSelectState = selectEntityState;
              ((isSelectBusy = true),
                openRelatedMenu(),
                syncRelatedSelect({
                  ...(selectEntityState || {}),
                  state: optionStateValue,
                  attributes: {
                    ...(selectEntityState?.attributes || {}),
                    options: relatedEntityOptions,
                  },
                }));
              try {
                const selectService = relatedEntitySelectService2(controlEntityDomain);
                if (!selectService) throw new Error("实体 " + entityId2 + " 不支持选项服务。");
                (await this.callEntityService(
                  selectService.domain,
                  selectService.service,
                  entityId2,
                  {
                    option: optionStateValue,
                  },
                ),
                  (selectStateValue = optionStateValue));
              } catch (selectServiceError: any) {
                (syncRelatedSelect(previousSelectState),
                  this.options.onError?.(selectServiceError));
              } finally {
                ((isSelectBusy = false), syncRelatedSelect(selectEntityState));
              }
            },
            renderRelatedOptions = (optionEntries: any, selectedOptionValue: any) => {
              relatedSelectMenu.replaceChildren(
                ...optionEntries.map((optionEntry: any) => {
                  const relatedSelectOptionButton = document.createElement("button");
                  ((relatedSelectOptionButton.type = "button"),
                    (relatedSelectOptionButton.className = "hb-related-select-option"),
                    relatedSelectOptionButton.setAttribute("role", "option"),
                    (relatedSelectOptionButton.dataset.value = optionEntry),
                    (relatedSelectOptionButton.textContent = relatedOptionLabel(optionEntry)),
                    (relatedSelectOptionButton.title = relatedSelectOptionButton.textContent));
                  const isRelatedOptionActive = optionEntry === selectedOptionValue;
                  return (
                    relatedSelectOptionButton.classList.toggle("active", isRelatedOptionActive),
                    relatedSelectOptionButton.setAttribute(
                      "aria-selected",
                      String(isRelatedOptionActive),
                    ),
                    relatedSelectOptionButton.addEventListener("click", () =>
                      selectRelatedOption(optionEntry),
                    ),
                    relatedSelectOptionButton
                  );
                }),
              );
            },
            syncRelatedSelect = (nextSelectState = selectEntityState) => {
              selectEntityState = nextSelectState || selectEntityState;
              const selectStateText = String(selectEntityState?.state || ""),
                availableOptions = relatedEntityOptions2(relatedEntity, selectEntityState);
              relatedEntityOptions = availableOptions;
              const stringify = JSON.stringify(availableOptions);
              if (stringify !== cachedOptionsSignature)
                ((cachedOptionsSignature = stringify),
                  renderRelatedOptions(availableOptions, selectStateText));
              else
                for (const relatedOptionElement of relatedSelectMenu.querySelectorAll<HTMLElement>(
                  '[role="option"]',
                )) {
                  const isRelatedOptionSelected =
                    relatedOptionElement.dataset.value === selectStateText;
                  (relatedOptionElement.classList.toggle("active", isRelatedOptionSelected),
                    relatedOptionElement.setAttribute(
                      "aria-selected",
                      String(isRelatedOptionSelected),
                    ));
                }
              (selectStateText &&
                !["unknown", "unavailable"].includes(selectStateText.toLowerCase()) &&
                (selectStateValue = selectStateText),
                (relatedSelectValueLabel.textContent = selectStateValue
                  ? relatedOptionLabel(selectStateValue)
                  : availableOptions.length
                    ? relatedOptionLabel(availableOptions[0])
                    : "无选项"),
                (relatedSelectValueLabel.title = relatedSelectValueLabel.textContent),
                (relatedSelectTriggerButton.disabled =
                  !createWaterHeaterExtensionControlsIsInteractive ||
                  isSelectBusy ||
                  !availableOptions.length ||
                  selectStateText.toLowerCase() === "unavailable"));
            };
          (relatedSelectTriggerButton.addEventListener("click", () => {
            isRelatedMenuVisible() || relatedSelectMenu.dataset.open === "true"
              ? openRelatedMenu()
              : closeRelatedMenu();
          }),
            relatedSelectTriggerButton.addEventListener("keydown", (relatedTriggerKeyEvent) => {
              ["ArrowDown", "ArrowUp", "Enter", " "].includes(relatedTriggerKeyEvent.key) &&
                (relatedTriggerKeyEvent.preventDefault(), closeRelatedMenu(true));
            }),
            relatedSelectMenu.addEventListener("keydown", (relatedMenuKeyEvent) => {
              const relatedMenuOptions = [
                  ...relatedSelectMenu.querySelectorAll<HTMLElement>('[role="option"]'),
                ],
                indexOf3 = relatedMenuOptions.findIndex(
                  (relatedOptionElement) => relatedOptionElement === document.activeElement,
                );
              if (relatedMenuKeyEvent.key === "Escape")
                (relatedMenuKeyEvent.preventDefault(),
                  openRelatedMenu(),
                  relatedSelectTriggerButton.focus());
              else {
                if (
                  relatedMenuKeyEvent.key === "ArrowDown" ||
                  relatedMenuKeyEvent.key === "ArrowUp"
                ) {
                  relatedMenuKeyEvent.preventDefault();
                  const relatedKeyDirection = relatedMenuKeyEvent.key === "ArrowDown" ? 1 : -1;
                  relatedMenuOptions[
                    (indexOf3 + relatedKeyDirection + relatedMenuOptions.length) %
                      relatedMenuOptions.length
                  ]?.focus();
                } else
                  (relatedMenuKeyEvent.key === "Enter" || relatedMenuKeyEvent.key === " ") &&
                    (relatedMenuKeyEvent.preventDefault(), clickFocusedElement());
              }
            }),
            relatedSelectMenu.addEventListener("toggle", (relatedToggleEvent) => {
              const isRelatedMenuExpanded = relatedToggleEvent.newState === "open";
              ((relatedSelectMenu.hidden = !isRelatedMenuExpanded),
                (relatedSelectMenu.dataset.open = String(isRelatedMenuExpanded)),
                relatedSelectTriggerButton.setAttribute(
                  "aria-expanded",
                  String(isRelatedMenuExpanded),
                ),
                isRelatedMenuExpanded && positionRelatedMenu());
            }),
            extensionSelectWrapper.append(
              extensionSelectLabel,
              relatedSelectTriggerButton,
              relatedSelectMenu,
            ),
            syncRelatedSelect(selectEntityState),
            registerStateHandler(entityId2, syncRelatedSelect),
            extensionGrid.append(extensionSelectWrapper));
        } else {
          if (["number", "input_number"].includes(controlEntityDomain)) {
            const extensionNumberWrapper = document.createElement("div");
            extensionNumberWrapper.className = "hb-water-heater-extension-number";
            const extensionNumberLabel = document.createElement("span");
            extensionNumberLabel.textContent = entityLabel;
            const extensionNumberControlsBox = document.createElement("span"),
              decrementButton = document.createElement("button");
            ((decrementButton.type = "button"), (decrementButton.textContent = "−"));
            const numberValueBadge = document.createElement("output"),
              incrementButton = document.createElement("button");
            ((incrementButton.type = "button"),
              (incrementButton.textContent = "+"),
              extensionNumberControlsBox.append(decrementButton, numberValueBadge, incrementButton),
              extensionNumberWrapper.append(extensionNumberLabel, extensionNumberControlsBox));
            let numberEntityState = resolveEntityState(entityId2),
              numberValue = Number(numberEntityState?.state),
              isNumberBusy = false;
            const resolveNumberCapabilities = () => {
                const numberAttributes = numberEntityState?.attributes || {},
                  numberMinimum = Number(numberAttributes.min),
                  numberMaximum = Number(numberAttributes.max),
                  numberStep = Math.max(0.001, Number(numberAttributes.step) || 1);
                return {
                  minimum: Number.isFinite(numberMinimum) ? numberMinimum : 0,
                  maximum: Number.isFinite(numberMaximum) ? numberMaximum : 100,
                  step: numberStep,
                };
              },
              syncNumberState = (nextNumberState = numberEntityState) => {
                numberEntityState = nextNumberState || numberEntityState;
                const currentNumberValue = Number(numberEntityState?.state),
                  isNumberUnavailable =
                    !Number.isFinite(currentNumberValue) ||
                    ["unknown", "unavailable"].includes(
                      String(numberEntityState?.state || "").toLowerCase(),
                    );
                isNumberUnavailable || (numberValue = currentNumberValue);
                const numberUnit = String(numberEntityState?.attributes?.unit_of_measurement || "");
                ((numberValueBadge.textContent = isNumberUnavailable
                  ? "--"
                  : "" + currentNumberValue + numberUnit),
                  (decrementButton.disabled =
                    !createWaterHeaterExtensionControlsIsInteractive ||
                    isNumberBusy ||
                    isNumberUnavailable),
                  (incrementButton.disabled =
                    !createWaterHeaterExtensionControlsIsInteractive ||
                    isNumberBusy ||
                    isNumberUnavailable));
              },
              stepNumberValue = async (numberStepDirection: any) => {
                if (
                  !createWaterHeaterExtensionControlsIsInteractive ||
                  isNumberBusy ||
                  !Number.isFinite(numberValue)
                )
                  return;
                const {
                    minimum: minimumValue,
                    maximum: maximumValue,
                    step: stepValue,
                  } = resolveNumberCapabilities(),
                  numberStepDecimals = String(stepValue).split(".")[1]?.length || 0,
                  nextNumberValue = Number(
                    Math.max(
                      minimumValue,
                      Math.min(maximumValue, numberValue + numberStepDirection * stepValue),
                    ).toFixed(numberStepDecimals),
                  );
                if (nextNumberValue === numberValue) return;
                const previousNumberState = numberEntityState;
                ((isNumberBusy = true),
                  syncNumberState({
                    ...(numberEntityState || {}),
                    state: String(nextNumberValue),
                  }));
                try {
                  (await this.callEntityService(controlEntityDomain, "set_value", entityId2, {
                    value: nextNumberValue,
                  }),
                    (numberValue = nextNumberValue));
                } catch (numberUpdateError: any) {
                  (syncNumberState(previousNumberState), this.options.onError?.(numberUpdateError));
                } finally {
                  ((isNumberBusy = false), syncNumberState(numberEntityState));
                }
              };
            (decrementButton.addEventListener("click", () => stepNumberValue(-1)),
              incrementButton.addEventListener("click", () => stepNumberValue(1)),
              syncNumberState(numberEntityState),
              registerStateHandler(entityId2, syncNumberState),
              extensionGrid.append(extensionNumberWrapper));
          } else {
            if (controlEntityDomain === "button") {
              const extensionActionButton = document.createElement("button");
              ((extensionActionButton.type = "button"),
                (extensionActionButton.className = "hb-water-heater-extension-action"),
                (extensionActionButton.textContent = entityLabel));
              let isActionBusy = false;
              const syncActionButton = (actionEntityState: any) => {
                const isActionUnavailable =
                  String(actionEntityState?.state || "").toLowerCase() === "unavailable";
                extensionActionButton.disabled =
                  !createWaterHeaterExtensionControlsIsInteractive ||
                  isActionBusy ||
                  isActionUnavailable;
              };
              (extensionActionButton.addEventListener("click", async () => {
                if (
                  !createWaterHeaterExtensionControlsIsInteractive ||
                  isActionBusy ||
                  extensionActionButton.disabled
                )
                  return;
                if (relatedEntityNeedsConfirmation2(relatedEntity)) {
                  const accepted = await shellConfirm({
                    title: "确认执行",
                    message: "确认执行“" + entityLabel + "”吗？",
                    confirmLabel: "执行",
                    cancelLabel: "取消",
                    tone: "warning",
                  });
                  if (!accepted) return;
                }
                ((isActionBusy = true), syncActionButton(resolveEntityState(entityId2)));
                try {
                  await this.callEntityService("button", "press", entityId2);
                } catch (actionUpdateError: any) {
                  this.options.onError?.(actionUpdateError);
                } finally {
                  ((isActionBusy = false), syncActionButton(resolveEntityState(entityId2)));
                }
              }),
                syncActionButton(resolveEntityState(entityId2)),
                registerStateHandler(entityId2, syncActionButton),
                extensionGrid.append(extensionActionButton));
            } else {
              if (["sensor", "binary_sensor"].includes(controlEntityDomain)) {
                const readonlyValueRow = document.createElement("div");
                readonlyValueRow.className = "hb-water-heater-extension-readonly";
                const readonlyValueLabel = document.createElement("strong");
                readonlyValueLabel.textContent = entityLabel;
                const readonlyValueStateLabel = document.createElement("small"),
                  syncReadonlyValue = (readonlyEntityState: any) => {
                    const readonlyStateValue = String(readonlyEntityState?.state || "unknown"),
                      isReadonlyUnavailable = ["unknown", "unavailable"].includes(
                        readonlyStateValue.toLowerCase(),
                      ),
                      readonlyUnit = String(
                        readonlyEntityState?.attributes?.unit_of_measurement || "",
                      );
                    (isReadonlyUnavailable
                      ? (readonlyValueStateLabel.textContent = "不可用")
                      : controlEntityDomain === "binary_sensor"
                        ? (readonlyValueStateLabel.textContent =
                            readonlyStateValue === "on" ? "已触发" : "正常")
                        : (readonlyValueStateLabel.textContent =
                            "" + readonlyStateValue + (readonlyUnit ? " " + readonlyUnit : "")),
                      readonlyValueRow.classList.toggle("is-unavailable", isReadonlyUnavailable));
                  };
                (readonlyValueRow.append(readonlyValueLabel, readonlyValueStateLabel),
                  syncReadonlyValue(resolveEntityState(entityId2)),
                  registerStateHandler(entityId2, syncReadonlyValue),
                  extensionGrid.append(readonlyValueRow));
              }
            }
          }
        }
      }
    }
    if (extensionGrid.childElementCount) {
      const extensionTitleLabel = document.createElement("strong");
      ((extensionTitleLabel.className = "hb-water-heater-extension-title"),
        (extensionTitleLabel.textContent = "扩展功能"),
        (waterHeaterExtensionSection.dataset.controlCount = String(
          extensionGrid.childElementCount,
        )),
        (extensionGrid.dataset.controlCount = String(extensionGrid.childElementCount)),
        waterHeaterExtensionSection.append(extensionTitleLabel, extensionGrid));
    }
    return (
      (waterHeaterExtensionSection.stateHandlers = stateHandlersByEntityId),
      (waterHeaterExtensionSection.relatedEntityIds = relatedEntityControls.map(
        (relatedEntityEntry) => relatedEntityEntry.entityId,
      )),
      waterHeaterExtensionSection
    );
  }
