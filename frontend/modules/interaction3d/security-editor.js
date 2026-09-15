import {
  PRESENCE_TRIGGER_MODES,
  presenceTriggerIsTimed
} from "./presence-motion.js?v=20260916013557";
import { mountInteraction3d } from "./runtime.js?v=20260916013557";
import { openPresenceEditor } from "./presence-editor.js?v=20260916013557";
import {
  EDITOR_SAVE_STATUS,
  serializeEditorDraft
} from "./editor-save-status.js?v=20260916013557";
import { randomUuid } from "/static/utils/random-id.js";
import {
  requestInteraction3dAccess,
  subscribeInteraction3dAccess
} from "/static/modules/interaction3d/bridge.js?v=20260916013557";
import { interaction3dPreviewSize } from "/static/modules/interaction3d/preview-layout.js";
export async function openSecurityEditor({
  component: component,
  panelDocument: documentApi,
  entities: entities = [],
  pickers: pickers,
  onSave: onSaveConfig
}) {
  await requestInteraction3dAccess();
  const draftProperties = structuredClone(component.properties || {});
  draftProperties.security = {
    ...draftProperties.security,
    cameras: draftProperties.security?.cameras || [],
    presenceSensors: draftProperties.security?.presenceSensors || []
  };
  for (const cameraItem of draftProperties.security.cameras) {
    delete cameraItem.buttonHidden;
    delete cameraItem.hiddenClickable;
  }
  let savedDraftSignature = serializeEditorDraft(draftProperties);
  const createElement = (tagName, classNames = "", initialText = "") => {
    const createdElement = document.createElement(tagName);
    createdElement.className = classNames;
    createdElement.textContent = initialText;
    return createdElement;
  };
  const createButton = (buttonLabel, onButtonClick) => {
    const buttonElement = createElement("button", "", buttonLabel);
    buttonElement.type = "button";
    buttonElement.addEventListener("click", onButtonClick);
    return buttonElement;
  };
  const styleSheetLinkElement = createElement("link");
  styleSheetLinkElement.rel = "stylesheet";
  styleSheetLinkElement.href =
    "/api/v1/modules/interaction3d/runtime.css?v=20260916013557";
  const editorDialogElement = createElement("dialog", "i3d-editor");
  editorDialogElement.setAttribute("aria-label", "3D 安防配置");
  editorDialogElement.dataset.i3dPreviewScope = "security";
  const headerElement = createElement("header");
  const bodyElement = createElement("div", "i3d-editor-body");
  const viewElement = createElement("div", "i3d-editor-view");
  const panelElement = createElement("aside");
  let currentContainerElement = panelElement;
  const aspectBoxElement = createElement("div", "i3d-editor-aspect");
  const stageHostElement = createElement("div", "i3d-editor-stage");
  const errorMessageElement = createElement("p", "i3d-error");
  errorMessageElement.setAttribute("role", "status");
  const saveStatusElement = createElement("span", "i3d-save-status");
  saveStatusElement.setAttribute("role", "status");
  let isDirty = false;
  aspectBoxElement.append(stageHostElement);
  viewElement.append(aspectBoxElement);
  bodyElement.append(viewElement, panelElement);
  let sceneMetadata = null;
  let selectedFloorId =
    draftProperties.floorSelection === "all" ? "" : draftProperties.floorSelection || "";
  let securityKind = "camera";
  let selectedItemId = "";
  let editorRuntime = null;
  let isDisposed = false;
  let isAccessAllowed = true;
  let isSaving = false;
  let isCameraEditing = false;
  let pendingCameraDraft = null;
  let cameraCommandQueue = Promise.resolve();
  const expandedDisclosureKeySet = new Set();
  let activePickerHandle = null;
  let pickerGeneration = 0;
  let presenceEditorHandle = null;
  let isPresenceEditorOpen = false;
  const previouslyFocusedElement = document.activeElement;
  const deviceEntitiesByItemId = new Map();
  const getCollectionKey = () => (securityKind === "camera" ? "cameras" : "presenceSensors");
  const getKindLabel = () => (securityKind === "camera" ? "摄像头" : "人体传感器");
  const getItemList = () => draftProperties.security[getCollectionKey()];
  const findSelectedItem = () =>
    getItemList().find(
      candidateItem =>
        candidateItem.id === selectedItemId && candidateItem.floorId === selectedFloorId
    );
  const findSelectedFloor = () =>
    sceneMetadata?.floors.find(candidateFloor => candidateFloor.id === selectedFloorId);
  const getFloorModelList = () => findSelectedFloor()?.[getCollectionKey()] || [];
  const toItemKey = item => securityKind + ":" + item.id;
  const buildEditorProperties = () => ({
    ...draftProperties,
    floorSelection: selectedFloorId,
    camera:
      draftProperties.floorCameras?.[selectedFloorId] ||
      (draftProperties.floorSelection === selectedFloorId ? draftProperties.camera : null)
  });
  const showError = error => {
    if (!isDisposed) {
      setSaveResultMessage(error?.message || String(error), {
        isError: true
      });
    }
  };
  function syncEditorRuntime() {
    if (!isDisposed && !isPresenceEditorOpen && isAccessAllowed) {
      editorRuntime?.update(
        buildEditorProperties(),
        selectedItemId ? securityKind + ":" + selectedItemId : ""
      );
    }
  }
  function markPropertiesDirty() {
    syncDraftDirtyState();
    errorMessageElement.textContent = "";
    syncEditorRuntime();
  }
  function syncDraftDirtyState() {
    isDirty = serializeEditorDraft(draftProperties) !== savedDraftSignature;
    if (!isSaving) {
      saveStatusElement.textContent = isDirty ? EDITOR_SAVE_STATUS.dirty : "";
    }
    syncSaveButtonState();
  }
  function syncSaveButtonState() {
    if (!isDisposed) {
      saveButtonElement.disabled =
        isSaving ||
        !isDirty ||
        isCameraEditing ||
        !isAccessAllowed ||
        !sceneMetadata ||
        isPresenceEditorOpen;
    }
  }
  function setSaveResultMessage(messageText, { isError = false } = {}) {
    if (isDisposed) {
      return;
    }
    if (isError) {
      saveStatusElement.textContent = "";
      errorMessageElement.textContent = messageText;
      return;
    }
    errorMessageElement.textContent = "";
    saveStatusElement.textContent = messageText;
  }
  function closeActivePicker() {
    pickerGeneration++;
    activePickerHandle?.close();
    activePickerHandle = null;
  }
  function createSelectField(labelText, optionEntries, selectedValue, onValueChange) {
    const selectElement = createElement("select");
    selectElement.setAttribute("aria-label", labelText);
    if (!optionEntries.length) {
      optionEntries = [["", sceneMetadata ? "暂无可选项" : "正在加载…"]];
    }
    for (const [optionValue, optionLabel] of optionEntries) {
      const optionElement = createElement("option", "", optionLabel);
      optionElement.value = optionValue;
      selectElement.append(optionElement);
    }
    selectElement.value = selectedValue;
    selectElement.addEventListener("change", () => onValueChange(selectElement.value));
    const labelElement = createElement("label");
    labelElement.append(createElement("span", "", labelText), selectElement);
    currentContainerElement.append(labelElement);
    return selectElement;
  }
  function createNumberField(
    fieldLabel,
    currentValue,
    minValue,
    maxValue,
    onValueCommit,
    stepSize = 0.1,
    shouldCommitWhileTyping = false
  ) {
    const inputElement = createElement("input");
    Object.assign(inputElement, {
      type: "number",
      value: currentValue,
      min: minValue,
      max: maxValue,
      step: stepSize
    });
    inputElement.setAttribute("aria-label", fieldLabel);
    if (shouldCommitWhileTyping) {
      inputElement.addEventListener("input", () => {
        const typedValue = Number(inputElement.value);
        if (
          inputElement.value.trim() &&
          Number.isFinite(typedValue) &&
          typedValue >= minValue &&
          typedValue <= maxValue
        ) {
          currentValue = typedValue;
          onValueCommit(typedValue);
          markPropertiesDirty();
        }
      });
    }
    inputElement.addEventListener("change", () => {
      const changedValue = Number(inputElement.value);
      if (
        !inputElement.value.trim() ||
        !Number.isFinite(changedValue) ||
        changedValue < minValue ||
        changedValue > maxValue
      ) {
        inputElement.value = currentValue;
        return;
      }
      currentValue = changedValue;
      onValueCommit(changedValue);
      markPropertiesDirty();
    });
    const fieldLabelElement = createElement("label");
    fieldLabelElement.append(createElement("span", "", fieldLabel), inputElement);
    currentContainerElement.append(fieldLabelElement);
  }
  const saveButtonElement = createButton("保存配置", async () => {
    if (isSaving || !isDirty || !isAccessAllowed || isCameraEditing || isPresenceEditorOpen) {
      if (!isAccessAllowed && !isDisposed) {
        setSaveResultMessage(EDITOR_SAVE_STATUS.accessDenied, {
          isError: true
        });
      }
      return;
    }
    isSaving = true;
    saveStatusElement.textContent = EDITOR_SAVE_STATUS.saving;
    errorMessageElement.textContent = "";
    renderPanel();
    try {
      await requestInteraction3dAccess();
      if (isDisposed) {
        return;
      }
      if (!isAccessAllowed) {
        setSaveResultMessage(EDITOR_SAVE_STATUS.accessDenied, {
          isError: true
        });
        return;
      }
      await onSaveConfig(structuredClone(draftProperties));
      if (!isDisposed) {
        savedDraftSignature = serializeEditorDraft(draftProperties);
        isDirty = false;
        setSaveResultMessage(EDITOR_SAVE_STATUS.saved);
      }
    } catch (saveError) {
      setSaveResultMessage(saveError?.message || EDITOR_SAVE_STATUS.failed, {
        isError: true
      });
    } finally {
      isSaving = false;
      if (!isDisposed) {
        if (saveStatusElement.textContent === EDITOR_SAVE_STATUS.saving) {
          saveStatusElement.textContent = "";
        }
        renderPanel();
      }
    }
  });
  saveButtonElement.className = "primary";
  saveButtonElement.disabled = true;
  function closeEditor() {
    if (!isDisposed) {
      if (isDirty && !window.confirm(EDITOR_SAVE_STATUS.dirtyExitConfirm)) {
        return;
      }
      isDisposed = true;
      closeActivePicker();
      presenceEditorHandle?.close();
      editorRuntime?.();
      previewResizeObserver.disconnect();
      unsubscribeAccessChange();
      editorDialogElement.close();
      editorDialogElement.remove();
      styleSheetLinkElement.remove();
      document.dispatchEvent(new Event("hb-i3d-preview-scope"));
      previouslyFocusedElement?.focus?.();
    }
  }
  headerElement.append(
    createElement("strong", "", "3D 安防配置"),
    saveStatusElement,
    saveButtonElement,
    createButton("退出", closeEditor)
  );
  editorDialogElement.append(headerElement, bodyElement);
  editorDialogElement.addEventListener("cancel", cancelEvent => {
    cancelEvent.preventDefault();
    closeEditor();
  });
  function updatePreviewSize() {
    const previewSize = interaction3dPreviewSize(
      component,
      documentApi,
      viewElement.clientWidth,
      viewElement.clientHeight
    );
    aspectBoxElement.style.width = previewSize.width + "px";
    aspectBoxElement.style.height = previewSize.height + "px";
  }
  const previewResizeObserver = new ResizeObserver(updatePreviewSize);
  previewResizeObserver.observe(viewElement);
  const unsubscribeAccessChange = subscribeInteraction3dAccess(accessState => {
    const isAllowed = accessState.allowed === true;
    if (isAllowed !== isAccessAllowed) {
      isAccessAllowed = isAllowed;
      if (!isAccessAllowed) {
        isCameraEditing = false;
        closeActivePicker();
        presenceEditorHandle?.close();
        editorRuntime?.();
        editorRuntime = null;
        setSaveResultMessage(accessState.message || "3D 使用权限已失效。", {
          isError: true
        });
      }
      if (!isDisposed) {
        renderPanel();
        if (isAccessAllowed && editorDialogElement.open) {
          mountEditorRuntime();
        }
      }
    }
  });
  async function runCameraCommand(commandName, commandPayload) {
    const commandTargetItem = findSelectedItem();
    if (!commandTargetItem || isSaving || !isAccessAllowed || isDisposed) {
      return;
    }
    const isFocalLengthCommand = commandName === "focus-focal-length";
    const previousQueuePromise = cameraCommandQueue;
    let releaseQueueGate;
    cameraCommandQueue = new Promise(resolveQueueGate => {
      releaseQueueGate = resolveQueueGate;
    });
    if (!isFocalLengthCommand) {
      isSaving = true;
      renderPanel();
    }
    try {
      await previousQueuePromise;
      if (isDisposed || !isAccessAllowed || findSelectedItem() !== commandTargetItem) {
        return;
      }
      const commandResult = await editorRuntime.focusCommand(
        commandName,
        toItemKey(commandTargetItem),
        commandPayload
      );
      if (isDisposed || !isAccessAllowed || findSelectedItem() !== commandTargetItem) {
        return;
      }
      if (commandResult?.camera) {
        pendingCameraDraft = commandResult.camera;
      }
      if (commandName === "save-light-camera") {
        commandTargetItem.focusCamera = commandResult.camera;
        isCameraEditing = false;
        markPropertiesDirty();
      } else if (commandName === "cancel-light-camera") {
        isCameraEditing = false;
        pendingCameraDraft = null;
      } else if (commandName === "edit-light-camera") {
        isCameraEditing = true;
      }
    } catch (commandError) {
      if (!isDisposed) {
        showError(commandError);
      }
    } finally {
      releaseQueueGate();
      if (!isFocalLengthCommand) {
        isSaving = false;
        if (!isDisposed) {
          renderPanel();
        }
      }
    }
  }
  async function openPresenceSubEditor() {
    if (!isSaving && !isCameraEditing && !isPresenceEditorOpen && !!isAccessAllowed) {
      isPresenceEditorOpen = true;
      editorRuntime?.();
      editorRuntime = null;
      try {
        const openedPresenceEditor = await openPresenceEditor({
          component: {
            ...component,
            properties: structuredClone(draftProperties)
          },
          panelDocument: documentApi,
          floors: sceneMetadata?.floors || [],
          entities: entities,
          pickers: pickers,
          initialSelectedId: selectedItemId,
          editingFloorId: selectedFloorId,
          manageBindings: false,
          onSave: async presenceDraft => {
            if (!isDisposed && isAccessAllowed) {
              draftProperties.security = structuredClone(presenceDraft.security);
              syncDraftDirtyState();
              if (isDirty) {
                errorMessageElement.textContent = "";
                saveStatusElement.textContent = "路线已应用，请保存配置";
              }
            }
          },
          onClose: () => {
            presenceEditorHandle = null;
            isPresenceEditorOpen = false;
            if (!isDisposed && isAccessAllowed) {
              mountEditorRuntime();
              renderPanel();
            }
          }
        });
        if (isDisposed || !isAccessAllowed || !isPresenceEditorOpen) {
          openedPresenceEditor?.close();
        } else {
          presenceEditorHandle = openedPresenceEditor;
        }
      } catch (presenceEditorError) {
        isPresenceEditorOpen = false;
        showError(presenceEditorError);
        if (!isDisposed && isAccessAllowed) {
          mountEditorRuntime();
        }
      }
    }
  }
  function createSectionHeading(sectionTitle) {
    const sectionElement = createElement("section", "i3d-focus-settings i3d-security-settings");
    sectionElement.append(createElement("h4", "", sectionTitle));
    panelElement.append(sectionElement);
    currentContainerElement = sectionElement;
    return sectionElement;
  }
  function createDisclosure(summaryText, disclosureKey, hostElement = currentContainerElement) {
    const detailsElement = createElement("details", "i3d-security-disclosure");
    detailsElement.open = expandedDisclosureKeySet.has(disclosureKey);
    detailsElement.append(createElement("summary", "", summaryText));
    detailsElement.addEventListener("toggle", () => {
      if (detailsElement.open) {
        expandedDisclosureKeySet.add(disclosureKey);
      } else {
        expandedDisclosureKeySet.delete(disclosureKey);
      }
    });
    const disclosureBodyElement = createElement("div", "i3d-security-disclosure-body");
    detailsElement.append(disclosureBodyElement);
    hostElement.append(detailsElement);
    return disclosureBodyElement;
  }
  function renderPanel() {
    panelElement.replaceChildren();
    syncSaveButtonState();
    const scopeSectionElement = createSectionHeading("配置范围");
    const scopeGridElement = createElement("div", "i3d-security-scope-grid");
    scopeSectionElement.append(scopeGridElement);
    currentContainerElement = scopeGridElement;
    createSelectField(
      "配置楼层",
      (sceneMetadata?.floors || []).map(floorItem => [floorItem.id, floorItem.name]),
      selectedFloorId,
      nextFloorId => {
        closeActivePicker();
        selectedFloorId = nextFloorId;
        selectedItemId = "";
        syncEditorRuntime();
        renderPanel();
      }
    );
    createSelectField(
      "安防类别",
      [
        ["camera", "摄像头"],
        ["presence", "人体传感器"]
      ],
      securityKind,
      nextSecurityKind => {
        closeActivePicker();
        securityKind = nextSecurityKind;
        selectedItemId = "";
        syncEditorRuntime();
        renderPanel();
      }
    );
    const modelListSectionElement = createSectionHeading("模型列表");
    modelListSectionElement.className += " i3d-security-model-list";
    currentContainerElement = modelListSectionElement;
    const itemsInSelectedFloor = getItemList().filter(
      floorBoundItem => floorBoundItem.floorId === selectedFloorId
    );
    if (!itemsInSelectedFloor.some(itemProbe => itemProbe.id === selectedItemId)) {
      selectedItemId = itemsInSelectedFloor[0]?.id || "";
    }
    createSelectField(
      getKindLabel() + "列表",
      itemsInSelectedFloor.map(itemOption => [
        itemOption.id,
        itemOption.label || itemOption.entityId || getKindLabel()
      ]),
      selectedItemId,
      nextSelectedItemId => {
        closeActivePicker();
        selectedItemId = nextSelectedItemId;
        syncEditorRuntime();
        renderPanel();
      }
    );
    currentContainerElement = createDisclosure(
      "添加" + getKindLabel(),
      "add:" + securityKind + ":" + selectedFloorId,
      modelListSectionElement
    );
    const addableModelList = getFloorModelList().filter(
      modelProbe =>
        !getItemList().some(
          boundItemProbe =>
            boundItemProbe.floorId === selectedFloorId && boundItemProbe.modelId === modelProbe.id
        )
    );
    const addModelSelectElement = createSelectField(
      "待添加" + getKindLabel() + "模型",
      addableModelList.map(modelOption => [modelOption.id, modelOption.name]),
      addableModelList[0]?.id || "",
      () => {}
    );
    const addItemButtonElement = createButton("添加" + getKindLabel(), () => {
      const addableModel = getFloorModelList().find(
        candidateModel => candidateModel.id === addModelSelectElement.value
      );
      if (
        !addableModel ||
        getItemList().length >= 128 ||
        getItemList().some(
          existingItemProbe =>
            existingItemProbe.floorId === selectedFloorId &&
            existingItemProbe.modelId === addableModel.id
        )
      ) {
        return;
      }
      const newItem = {
        id: randomUuid(),
        floorId: selectedFloorId,
        modelId: addableModel.id,
        entityId: "",
        label: addableModel.name || getKindLabel(),
        ...(securityKind === "camera"
          ? {
              size: 44,
              visible: true,
              icon: "mdi:cctv"
            }
          : {
              route: [],
              routeClosed: false,
              size: 1,
              speed: 0.45,
              displayDuration: 0,
              character: "traveler",
              color: "cyan",
              clickToFocus: false,
              hitPadding: 8
            })
      };
      getItemList().push(newItem);
      selectedItemId = newItem.id;
      expandedDisclosureKeySet.delete("add:" + securityKind + ":" + selectedFloorId);
      markPropertiesDirty();
      renderPanel();
    });
    addItemButtonElement.disabled = !addableModelList.length || getItemList().length >= 128;
    currentContainerElement.append(addItemButtonElement);
    if (!getFloorModelList().length) {
      currentContainerElement.append(
        createElement(
          "p",
          "i3d-note",
          "本层没有" + getKindLabel() + "模型，请先在 3D 户型图绘制中增加模型。"
        )
      );
    }
    currentContainerElement = modelListSectionElement;
    const selectedItem = findSelectedItem();
    if (selectedItem) {
      const bindingSectionElement = createSectionHeading("基础绑定");
      const bindingGridElement = createElement("div", "i3d-security-scope-grid");
      bindingSectionElement.append(bindingGridElement);
      currentContainerElement = bindingGridElement;
      const nameInputElement = createElement("input");
      nameInputElement.value = selectedItem.label || "";
      nameInputElement.maxLength = 128;
      nameInputElement.setAttribute("aria-label", "名称");
      nameInputElement.addEventListener("input", () => {
        selectedItem.label = nameInputElement.value;
        markPropertiesDirty();
      });
      const nameFieldElement = createElement("label");
      nameFieldElement.append(createElement("span", "", "名称"), nameInputElement);
      currentContainerElement.append(nameFieldElement);
      const modelChoices = getFloorModelList().filter(
        modelCandidate =>
          !getItemList().some(
            otherBoundItem =>
              otherBoundItem !== selectedItem &&
              otherBoundItem.floorId === selectedFloorId &&
              otherBoundItem.modelId === modelCandidate.id
          )
      );
      const modelOptionList = modelChoices.map(availableModel => [
        availableModel.id,
        availableModel.name
      ]);
      if (!modelChoices.some(matchedModel => matchedModel.id === selectedItem.modelId)) {
        modelOptionList.unshift([
          selectedItem.modelId || "",
          selectedItem.modelId ? "原模型已移除，请重新选择" : "未关联模型（保留原人在路线）"
        ]);
      }
      createSelectField(
        "关联" + getKindLabel() + "模型",
        modelOptionList,
        selectedItem.modelId || "",
        nextModelId => {
          if (nextModelId) {
            selectedItem.modelId = nextModelId;
          } else {
            delete selectedItem.modelId;
          }
          if (securityKind === "camera") {
            delete selectedItem.focusCamera;
          }
          markPropertiesDirty();
          renderPanel();
        }
      );
      currentContainerElement = bindingSectionElement;
      let detectionSourceBodyElement = null;
      if (securityKind === "presence") {
        const sensorPickerButtonElement = createButton(
          selectedItem.deviceName || "选择人体传感器设备",
          async () => {
            const pickerRequestGeneration = ++pickerGeneration;
            activePickerHandle?.close();
            try {
              const sensorPickerHandle = await pickers.presence({
                trigger: sensorPickerButtonElement,
                current: selectedItem.deviceId || "",
                onSelect(selectedSensor) {
                  if (
                    !isDisposed &&
                    !!isAccessAllowed &&
                    pickerRequestGeneration === pickerGeneration &&
                    findSelectedItem() === selectedItem
                  ) {
                    if (selectedSensor) {
                      selectedItem.deviceId = selectedSensor.deviceId;
                      selectedItem.deviceName = selectedSensor.name;
                      deviceEntitiesByItemId.set(selectedItem.id, selectedSensor.entities);
                      if (
                        !selectedSensor.entities.some(
                          entityProbe => entityProbe.entityId === selectedItem.entityId
                        )
                      ) {
                        selectedItem.entityId = selectedSensor.entities[0]?.entityId || "";
                      }
                      if (
                        selectedItem.entityId.startsWith("event.") &&
                        !(selectedItem.displayDuration > 0)
                      ) {
                        selectedItem.displayDuration = 30;
                      }
                    } else {
                      delete selectedItem.deviceId;
                      delete selectedItem.deviceName;
                      selectedItem.entityId = "";
                      deviceEntitiesByItemId.delete(selectedItem.id);
                    }
                    markPropertiesDirty();
                    renderPanel();
                  }
                }
              });
              if (isDisposed || pickerRequestGeneration !== pickerGeneration) {
                sensorPickerHandle?.close();
              } else {
                activePickerHandle = sensorPickerHandle;
              }
            } catch (sensorPickerError) {
              showError(sensorPickerError);
            }
          }
        );
        sensorPickerButtonElement.className = "i3d-picker-button";
        sensorPickerButtonElement.setAttribute("aria-label", "选择人体传感器设备");
        const deviceFieldElement = createElement("label");
        deviceFieldElement.append(createElement("span", "", "绑定设备"), sensorPickerButtonElement);
        currentContainerElement.append(deviceFieldElement);
        currentContainerElement.append(
          createElement("p", "i3d-note", "选择设备后自动关联检测来源，通常无需再设置。")
        );
        detectionSourceBodyElement = createDisclosure(
          "检测来源（高级）",
          "detection:" + selectedItem.id
        );
        const previousContainerElement = currentContainerElement;
        currentContainerElement = detectionSourceBodyElement;
        if (selectedItem.deviceId) {
          const entityOptionList = (
            deviceEntitiesByItemId.get(selectedItem.id) ||
            pickers.presenceEntities?.(selectedItem.deviceId) ||
            []
          ).map(detectionEntity => [
            detectionEntity.entityId,
            detectionEntity.name || detectionEntity.entityId
          ]);
          if (
            selectedItem.entityId &&
            !entityOptionList.some(([optionEntityId]) => optionEntityId === selectedItem.entityId)
          ) {
            entityOptionList.unshift([
              selectedItem.entityId,
              selectedItem.entityId + "（当前绑定）"
            ]);
          }
          if (entityOptionList.length > 1) {
            createSelectField(
              "有人状态来源",
              entityOptionList,
              selectedItem.entityId || "",
              nextEntityId => {
                selectedItem.entityId = nextEntityId;
                if (nextEntityId.startsWith("event.") && !(selectedItem.displayDuration > 0)) {
                  selectedItem.displayDuration = 30;
                }
                markPropertiesDirty();
              }
            );
          } else {
            currentContainerElement.append(
              createElement(
                "p",
                "i3d-note",
                entityOptionList.length
                  ? "检测实体：" + entityOptionList[0][1]
                  : "设备暂无可用检测实体，请重新选择设备。"
              )
            );
          }
        }
        currentContainerElement = previousContainerElement;
      }
      const entityPickerButtonElement = createButton(
        entities.find(entityMatch => entityMatch.entityId === selectedItem.entityId)?.name ||
          selectedItem.entityId ||
          "选择" + getKindLabel() + "实体",
        async () => {
          const entityPickerGeneration = ++pickerGeneration;
          activePickerHandle?.close();
          try {
            const entityPickerHandle = await pickers.entity({
              trigger: entityPickerButtonElement,
              current: selectedItem.entityId,
              deviceKind: securityKind,
              onSelect(pickedEntityId) {
                if (
                  !isDisposed &&
                  !!isAccessAllowed &&
                  entityPickerGeneration === pickerGeneration &&
                  findSelectedItem() === selectedItem
                ) {
                  selectedItem.entityId = pickedEntityId;
                  if (securityKind === "presence") {
                    delete selectedItem.deviceId;
                    delete selectedItem.deviceName;
                    deviceEntitiesByItemId.delete(selectedItem.id);
                  }
                  if (
                    securityKind === "presence" &&
                    pickedEntityId.startsWith("event.") &&
                    !(selectedItem.displayDuration > 0)
                  ) {
                    selectedItem.displayDuration = 30;
                  }
                  markPropertiesDirty();
                  renderPanel();
                }
              }
            });
            if (isDisposed || entityPickerGeneration !== pickerGeneration) {
              entityPickerHandle?.close();
            } else {
              activePickerHandle = entityPickerHandle;
            }
          } catch (entityPickerError) {
            showError(entityPickerError);
          }
        }
      );
      if (securityKind === "presence") {
        entityPickerButtonElement.textContent = selectedItem.entityId
          ? "手动绑定：" + selectedItem.entityId
          : "手动选择实体（无设备归属）";
      }
      const entityLabelText = entityPickerButtonElement.textContent;
      entityPickerButtonElement.textContent = "";
      const entityLabelElement = createElement(
        "span",
        "i3d-security-entity-label",
        entityLabelText
      );
      entityPickerButtonElement.append(entityLabelElement);
      entityPickerButtonElement.title = entityLabelText;
      entityPickerButtonElement.className = "i3d-picker-button";
      entityPickerButtonElement.setAttribute("aria-label", "选择" + getKindLabel() + "实体");
      if (securityKind === "presence") {
        detectionSourceBodyElement.append(
          createElement(
            "p",
            "i3d-note",
            "可选择摄像头检测、人体传感器或自定义实体，按检测结果触发。"
          ),
          entityPickerButtonElement
        );
        currentContainerElement = detectionSourceBodyElement;
        createSelectField(
          "触发方式",
          PRESENCE_TRIGGER_MODES,
          selectedItem.triggerMode || "auto",
          nextTriggerMode => {
            selectedItem.triggerMode = nextTriggerMode;
            if (nextTriggerMode === "equals") {
              selectedItem.triggerValue ||= "on";
            }
            if (nextTriggerMode === "threshold") {
              selectedItem.triggerThreshold ??= 0;
            }
            if (presenceTriggerIsTimed(selectedItem) && !(selectedItem.displayDuration > 0)) {
              selectedItem.displayDuration = 30;
            }
            markPropertiesDirty();
            renderPanel();
          }
        );
        if (selectedItem.triggerMode === "threshold") {
          createNumberField(
            "数值大于",
            selectedItem.triggerThreshold ?? 0,
            -1000000,
            1000000,
            nextThreshold => {
              selectedItem.triggerThreshold = nextThreshold;
            },
            0.1,
            true
          );
        }
        if (selectedItem.triggerMode === "equals") {
          const triggerValueInputElement = createElement("input");
          triggerValueInputElement.value = selectedItem.triggerValue ?? "on";
          triggerValueInputElement.maxLength = 128;
          triggerValueInputElement.setAttribute("aria-label", "触发值");
          triggerValueInputElement.addEventListener("input", () => {
            if (triggerValueInputElement.value.trim()) {
              selectedItem.triggerValue = triggerValueInputElement.value.trim().slice(0, 128);
              markPropertiesDirty();
            }
          });
          triggerValueInputElement.addEventListener("change", () => {
            triggerValueInputElement.value = selectedItem.triggerValue ?? "on";
          });
          const triggerValueFieldElement = createElement("label");
          triggerValueFieldElement.append(
            createElement("span", "", "触发值"),
            triggerValueInputElement
          );
          currentContainerElement.append(triggerValueFieldElement);
        }
        const isTimedTrigger = presenceTriggerIsTimed(selectedItem);
        createNumberField(
          "触发后显示（秒）",
          selectedItem.displayDuration ?? (isTimedTrigger ? 30 : 0),
          isTimedTrigger ? 1 : 0,
          3600,
          nextDisplayDuration => {
            selectedItem.displayDuration = nextDisplayDuration;
          },
          1,
          true
        );
        currentContainerElement.append(
          createElement(
            "p",
            "i3d-note",
            selectedItem.triggerMode === "change" || selectedItem.triggerMode === "equals"
              ? "只比较状态值，属性刷新不触发；首次加载和离线恢复不触发。再次触发重新计时。"
              : isTimedTrigger
                ? "按检测事件发生时间计时，再次检测重新计时；到时隐藏。"
                : "0 秒：满足条件时持续显示，不满足时隐藏。其他值：达到时长后隐藏。自动识别开关状态、检测事件及名称明确的人数；其他数值请设置阈值。"
          )
        );
        currentContainerElement = bindingSectionElement;
        currentContainerElement.append(
          createElement("p", "i3d-note", "配置时点击标签选择传感器；正式页面仅展示模型和感应效果。")
        );
      } else {
        currentContainerElement.append(entityPickerButtonElement);
      }
      if (securityKind === "camera") {
        currentContainerElement.append(
          createElement(
            "p",
            "i3d-note",
            "标签显示设备状态；仅点击聚焦后连接视频，退出时断开。可拖动标签调整位置。"
          )
        );
        const labelSettingsSectionElement = createSectionHeading("标签设置");
        const labelSettingsGridElement = createElement("div", "i3d-security-scope-grid");
        labelSettingsSectionElement.append(labelSettingsGridElement);
        currentContainerElement = labelSettingsGridElement;
        const iconPickerButtonElement = createButton(selectedItem.icon || "mdi:cctv", async () => {
          const iconPickerGeneration = ++pickerGeneration;
          activePickerHandle?.close();
          try {
            const iconPickerHandle = await pickers.icon({
              trigger: iconPickerButtonElement,
              current: selectedItem.icon || "mdi:cctv",
              deviceKind: "camera",
              onSelect(pickedIconId) {
                if (
                  !isDisposed &&
                  !!isAccessAllowed &&
                  iconPickerGeneration === pickerGeneration &&
                  findSelectedItem() === selectedItem
                ) {
                  selectedItem.icon = pickedIconId;
                  markPropertiesDirty();
                  renderPanel();
                }
              }
            });
            if (isDisposed || iconPickerGeneration !== pickerGeneration) {
              iconPickerHandle?.close();
            } else {
              activePickerHandle = iconPickerHandle;
            }
          } catch (iconPickerError) {
            showError(iconPickerError);
          }
        });
        iconPickerButtonElement.className = "i3d-picker-button i3d-icon-picker-button";
        const iconMaskElement = createElement("i");
        iconMaskElement.style.maskImage =
          "url('/static/vendor/mdi/7.4.47/svg/" +
          (selectedItem.icon || "mdi:cctv").slice(4) +
          ".svg')";
        iconMaskElement.style.webkitMaskImage = iconMaskElement.style.maskImage;
        iconPickerButtonElement.textContent = "";
        iconPickerButtonElement.append(
          iconMaskElement,
          createElement("span", "", selectedItem.icon || "mdi:cctv")
        );
        iconPickerButtonElement.setAttribute("aria-label", "摄像头图标");
        const iconFieldElement = createElement("label");
        iconFieldElement.append(createElement("span", "", "图标"), iconPickerButtonElement);
        currentContainerElement.append(iconFieldElement);
        createNumberField(
          "标签缩放（%）",
          Math.round(((selectedItem.size ?? 44) / 44) * 100),
          10,
          500,
          nextScalePercent => {
            selectedItem.size = (nextScalePercent / 100) * 44;
          },
          1
        );
        const sizeDisclosureBodyElement = createDisclosure(
          "更多尺寸设置",
          "camera-sizes",
          labelSettingsSectionElement
        );
        const sizeGridElement = createElement("div", "i3d-coordinate-grid i3d-security-size-grid");
        sizeDisclosureBodyElement.append(sizeGridElement);
        currentContainerElement = sizeGridElement;
        createNumberField(
          "图标大小（px）",
          selectedItem.iconSize ?? 26,
          4,
          200,
          nextIconSize => {
            selectedItem.iconSize = nextIconSize;
          },
          1
        );
        createNumberField(
          "文字大小（px）",
          selectedItem.fontSize ?? 12,
          8,
          100,
          nextFontSize => {
            selectedItem.fontSize = nextFontSize;
          },
          1
        );
        createNumberField(
          "触控范围（px）",
          selectedItem.hitSize ?? 44,
          1,
          1000,
          nextHitSize => {
            selectedItem.hitSize = nextHitSize;
          },
          1
        );
        const labelPositionSectionElement = createSectionHeading("标签位置");
        const labelPositionGridElement = createElement("div", "i3d-coordinate-grid");
        labelPositionSectionElement.append(labelPositionGridElement);
        currentContainerElement = labelPositionGridElement;
        const modelDefaults = getFloorModelList().find(
          modelMatch => modelMatch.id === selectedItem.modelId
        );
        for (const axisName of ["x", "y"]) {
          createNumberField(
            "位置 " + axisName.toUpperCase(),
            selectedItem[axisName] ?? modelDefaults?.[axisName] ?? 0,
            -1000000,
            1000000,
            nextAxisValue => {
              selectedItem[axisName] = nextAxisValue;
            }
          );
        }
        createNumberField(
          "离地高度（米）",
          selectedItem.height ?? modelDefaults?.height ?? 0.15,
          -1000,
          1000,
          nextHeight => {
            selectedItem.height = nextHeight;
          }
        );
        currentContainerElement = labelPositionSectionElement;
        const resetToModelButtonElement = createButton("恢复跟随模型", () => {
          delete selectedItem.x;
          delete selectedItem.y;
          delete selectedItem.height;
          markPropertiesDirty();
          renderPanel();
        });
        resetToModelButtonElement.disabled = !["x", "y", "height"].some(axisKey =>
          Number.isFinite(selectedItem[axisKey])
        );
        resetToModelButtonElement.className = "i3d-focus-reset";
        currentContainerElement.append(resetToModelButtonElement);
        currentContainerElement.append(
          createElement("p", "i3d-note", "仅调整标签，不移动摄像头模型。也可在预览中拖动标签。")
        );
        createSectionHeading("聚焦视角");
        const focusActionsElement = createElement("div", "i3d-focus-actions");
        if (isCameraEditing) {
          const saveCameraButtonElement = createButton("保存摄像头视角", () =>
            runCameraCommand("save-light-camera")
          );
          saveCameraButtonElement.className = "primary";
          focusActionsElement.append(
            saveCameraButtonElement,
            createButton("取消调整", () => runCameraCommand("cancel-light-camera"))
          );
        } else {
          focusActionsElement.append(
            createButton(selectedItem.focusCamera ? "调整视角" : "设置视角", () =>
              runCameraCommand("edit-light-camera")
            ),
            createButton("预览聚焦", () => runCameraCommand("preview-light-camera"))
          );
        }
        currentContainerElement.append(focusActionsElement);
        if (isCameraEditing) {
          const projectionGroupElement = createElement("div", "i3d-focus-actions");
          projectionGroupElement.setAttribute("role", "group");
          projectionGroupElement.setAttribute("aria-label", "聚焦投影");
          for (const [projectionMode, projectionLabel] of [
            ["orthographic", "正交"],
            ["perspective", "透视"]
          ]) {
            const projectionButtonElement = createButton(projectionLabel, () =>
              runCameraCommand("focus-projection", projectionMode)
            );
            projectionButtonElement.setAttribute(
              "aria-pressed",
              String((pendingCameraDraft?.mode || "orthographic") === projectionMode)
            );
            projectionGroupElement.append(projectionButtonElement);
          }
          const focalLengthInputElement = createElement("input");
          Object.assign(focalLengthInputElement, {
            type: "number",
            min: "18",
            max: "120",
            step: "1",
            value: String(Math.round(pendingCameraDraft?.focalLength || 50))
          });
          focalLengthInputElement.setAttribute("aria-label", "焦段（mm）");
          focalLengthInputElement.dataset.focusFocal = "true";
          focalLengthInputElement.addEventListener("change", () => {
            const nextFocalLength = Number(focalLengthInputElement.value);
            if (!focalLengthInputElement.value.trim() || !Number.isFinite(nextFocalLength)) {
              focalLengthInputElement.value = String(pendingCameraDraft?.focalLength || 50);
              return;
            }
            focalLengthInputElement.value = String(Math.max(18, Math.min(120, nextFocalLength)));
            runCameraCommand("focus-focal-length", Number(focalLengthInputElement.value));
          });
          const focalLengthFieldElement = createElement("label");
          focalLengthFieldElement.append(
            createElement("span", "", "焦段（mm）"),
            focalLengthInputElement
          );
          currentContainerElement.append(projectionGroupElement, focalLengthFieldElement);
        }
        if (!isCameraEditing) {
          const resetFocusButtonElement = createButton("恢复自动聚焦", async () => {
            if (!isSaving && !!isAccessAllowed) {
              isSaving = true;
              renderPanel();
              try {
                await editorRuntime.focusCommand("cancel-light-camera", toItemKey(selectedItem));
                if (isDisposed || !isAccessAllowed) {
                  return;
                }
                delete selectedItem.focusCamera;
                markPropertiesDirty();
              } catch (resetFocusError) {
                showError(resetFocusError);
              } finally {
                isSaving = false;
                if (!isDisposed) {
                  renderPanel();
                }
              }
            }
          });
          resetFocusButtonElement.disabled = !selectedItem.focusCamera;
          resetFocusButtonElement.className = "i3d-focus-reset";
          currentContainerElement.append(resetFocusButtonElement);
        }
      }
      if (securityKind === "presence") {
        if (selectedItem.modelId) {
          const waveSectionElement = createSectionHeading("感应光圈");
          createSelectField(
            "显示光圈",
            [
              ["on", "开启"],
              ["off", "关闭"]
            ],
            selectedItem.waveEnabled === false ? "off" : "on",
            nextWaveEnabled => {
              selectedItem.waveEnabled = nextWaveEnabled === "on";
              markPropertiesDirty();
              renderPanel();
            }
          );
          const waveGridElement = createElement("div", "i3d-security-scope-grid");
          waveSectionElement.append(waveGridElement);
          currentContainerElement = waveGridElement;
          createNumberField(
            "光圈大小（%）",
            Math.round((selectedItem.waveScale ?? 1) * 100),
            25,
            300,
            nextWaveScalePercent => {
              selectedItem.waveScale = nextWaveScalePercent / 100;
            },
            1
          );
          createNumberField(
            "光圈透明度（%）",
            100 - (selectedItem.waveOpacity ?? 68),
            0,
            100,
            nextWaveOpacityPercent => {
              selectedItem.waveOpacity = 100 - nextWaveOpacityPercent;
            },
            1
          );
          if (selectedItem.waveEnabled === false) {
            for (const waveInputElement of waveGridElement.querySelectorAll("input")) {
              waveInputElement.disabled = true;
            }
          }
        }
        createSectionHeading("人物展示");
        currentContainerElement.append(createButton("配置人物与行走路线", openPresenceSubEditor));
        currentContainerElement.append(
          createElement(
            "p",
            "i3d-note",
            "按需设置人物、显示时长与行走路线。设备绑定在上方统一管理。"
          )
        );
      }
      const bindingManagementSectionElement = createSectionHeading("绑定管理");
      const removeBindingButtonElement = createButton("移除" + getKindLabel() + "绑定", () => {
        closeActivePicker();
        draftProperties.security[getCollectionKey()] = getItemList().filter(
          remainingItem => remainingItem !== selectedItem
        );
        selectedItemId = "";
        markPropertiesDirty();
        renderPanel();
      });
      removeBindingButtonElement.className = "i3d-remove-light";
      bindingManagementSectionElement.append(removeBindingButtonElement);
    }
    currentContainerElement = panelElement;
    currentContainerElement.append(errorMessageElement);
    if (isSaving || isCameraEditing || !isAccessAllowed || isPresenceEditorOpen) {
      for (const disabledControlElement of panelElement.querySelectorAll("button,input,select")) {
        disabledControlElement.disabled = true;
      }
      if (isCameraEditing && !isSaving && isAccessAllowed) {
        for (const focusActionButtonElement of panelElement.querySelectorAll(
          ".i3d-focus-actions button"
        )) {
          focusActionButtonElement.disabled = false;
        }
      }
      for (const panelInputElement of panelElement.querySelectorAll("input")) {
        if (panelInputElement.dataset.focusFocal) {
          panelInputElement.disabled =
            isSaving || !isAccessAllowed || pendingCameraDraft?.mode !== "perspective";
        }
      }
    }
  }
  function mountEditorRuntime() {
    if (!isDisposed && !!isAccessAllowed && !editorRuntime && !isPresenceEditorOpen) {
      editorRuntime = mountInteraction3d(stageHostElement, {
        component: {
          ...component,
          properties: buildEditorProperties()
        },
        context: {
          document: documentApi,
          editable: true
        },
        editing: true,
        editingModule: "security",
        onReady(readyMetadata) {
          sceneMetadata = readyMetadata;
          if (!sceneMetadata.floors.some(floorMatch => floorMatch.id === selectedFloorId)) {
            selectedFloorId = sceneMetadata.floors[0]?.id || "";
          }
          renderPanel();
          syncEditorRuntime();
        },
        onEdit(editEvent) {
          if (!isDisposed && !!isAccessAllowed) {
            if (editEvent.action === "position" && editEvent.id?.startsWith("camera:")) {
              const editedCameraItem = draftProperties.security.cameras.find(
                cameraMatch => "camera:" + cameraMatch.id === editEvent.id
              );
              if (
                editedCameraItem &&
                Number.isFinite(editEvent.x) &&
                Number.isFinite(editEvent.y)
              ) {
                editedCameraItem.x = editEvent.x;
                editedCameraItem.y = editEvent.y;
                markPropertiesDirty();
              }
            }
            if (editEvent.action === "focus-exited") {
              isCameraEditing = false;
              renderPanel();
            }
            if (editEvent.action === "select" && /^(camera|presence):/.test(editEvent.id || "")) {
              const separatorIndex = editEvent.id.indexOf(":");
              securityKind = editEvent.id.slice(0, separatorIndex);
              selectedItemId = editEvent.id.slice(separatorIndex + 1);
              renderPanel();
            }
          }
        },
        onLoadError: showError
      });
      document.dispatchEvent(new Event("hb-i3d-preview-scope"));
    }
  }
  document.head.append(styleSheetLinkElement);
  document.body.append(editorDialogElement);
  editorDialogElement.showModal();
  renderPanel();
  updatePreviewSize();
  mountEditorRuntime();
  return {
    close: closeEditor
  };
}
