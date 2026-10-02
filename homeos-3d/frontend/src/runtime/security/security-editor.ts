import { appendBackgroundOpacityControl } from "../core/label-appearance";
import {
  openBatchApply,
  copyBatchFields,
} from "../editor/batch-apply";
import {
  PRESENCE_TRIGGER_MODES,
  presenceTriggerIsTimed,
} from "../presence/presence-motion";
import {
  doorModels,
  identifyLockEntities,
  lockEntityRole,
} from "@app/bridge/lock-state-runtime";
import { CARD_TEXT_SIZE_PX, migrateCardTextSize } from "@app/bridge/card-text-size";
import { DEFAULT_BUTTON_SIZE, buttonIconSize } from "@app/bridge/button-icon-size";
const LOCK_ENTITY_FIELDS = ["doorEntityId", "batteryEntityId"],
  LEGACY_LOCK_FIELDS = [
    "doorSource",
    "doorEventEntityId",
    "doorOpenEntityId",
    "doorCloseEntityId",
    "doorEventAttribute",
    "doorOpenValue",
    "doorCloseValue",
  ],
  LOCK_BATCH_APPEARANCE_FIELDS = [
    ["icon", "图标"],
    ["size", "卡片大小"],
    ["fontSize", "文字大小"],
    ["labelMode", "标签显示"],
  ];
import { mountInteraction3d } from "../core/runtime";
import { openPresenceEditor } from "../presence/presence-editor";
import { randomUuid } from "@app/utils/random-id";
import {
  requestInteraction3dAccess,
  subscribeInteraction3dAccess,
} from "@app/bridge/bridge";
import { interaction3dPreviewSize } from "@app/bridge/preview-layout";
export async function openSecurityEditor({
  component: component,
  panelDocument: documentApi,
  entities: entities = [],
  pickers: pickers,
  onSave: onSaveConfig,
}) {
  await requestInteraction3dAccess();
  const draftProperties = structuredClone(component.properties || {});
  draftProperties.security = {
    ...draftProperties.security,
    locks: draftProperties.security?.locks || [],
    cameras: draftProperties.security?.cameras || [],
    presenceSensors: draftProperties.security?.presenceSensors || [],
  };
  for (const lockItem of draftProperties.security.locks)
    for (const legacyKey of LEGACY_LOCK_FIELDS) delete lockItem[legacyKey];
  for (const normalizedLockItem of draftProperties.security.locks)
    ((normalizedLockItem.labelMode =
      normalizedLockItem.labelMode === "hidden" ||
      normalizedLockItem.labelMode === "open" ||
      normalizedLockItem.labelMode === "always"
        ? normalizedLockItem.labelMode
        : normalizedLockItem.labelHidden === true
          ? "hidden"
          : "always"),
      delete normalizedLockItem.labelHidden);
  for (const cameraItem of draftProperties.security.cameras)
    (delete cameraItem.buttonHidden, delete cameraItem.hiddenClickable);
  // 历史默认字号 12 → 统一字号：编辑器的显示值必须与场景渲染同口径，
  // 否则会出现「面板写 12、场景却是 21」的错位。迁移值随保存回写，那之后即幂等。
  for (const cardTextItem of [
    ...draftProperties.security.locks,
    ...draftProperties.security.cameras,
  ])
    Object.assign(cardTextItem, migrateCardTextSize(cardTextItem));
  const createElement = (tagName, className = "", textContent = "") => {
      const createdElement = document.createElement(tagName);
      return (
        (createdElement.className = className),
        (createdElement.textContent = textContent),
        createdElement
      );
    },
    createButton = (buttonLabel, onClick) => {
      const buttonElement = createElement("button", "", buttonLabel);
      return (
        (buttonElement.type = "button"),
        buttonElement.addEventListener("click", onClick),
        buttonElement
      );
    },
    styleSheetLinkElement = createElement("link");
  ((styleSheetLinkElement.rel = "stylesheet"),
    (styleSheetLinkElement.href =
      "/api/v1/modules/interaction3d/core/runtime.css"));
  const editorDialogElement = createElement("dialog", "i3d-editor");
  (editorDialogElement.setAttribute("aria-label", "3D 安防配置"),
    (editorDialogElement.dataset.i3dPreviewScope = "security"));
  const headerElement = createElement("header"),
    bodyElement = createElement("div", "i3d-editor-body"),
    viewElement = createElement("div", "i3d-editor-view"),
    panelElement = createElement("aside");
  let currentContainerElement = panelElement;
  const aspectBoxElement = createElement("div", "i3d-editor-aspect"),
    stageHostElement = createElement("div", "i3d-editor-stage"),
    errorMessageElement = createElement("p", "i3d-error");
  (errorMessageElement.setAttribute("role", "status"),
    aspectBoxElement.append(stageHostElement),
    viewElement.append(aspectBoxElement),
    bodyElement.append(viewElement, panelElement));
  const setSaveResultMessage = (messageText) => {
    ((errorMessageElement.textContent = messageText || ""),
      (errorMessageElement.hidden = !errorMessageElement.textContent));
  };
  setSaveResultMessage("");
  let sceneMetadata = null,
    selectedFloorId =
      draftProperties.floorSelection === "all" ? "" : draftProperties.floorSelection || "",
    securityKind = "camera",
    selectedItemId = "",
    editorRuntime = null,
    isDisposed = false,
    isAccessAllowed = true,
    isSaving = false,
    isCameraEditing = false,
    pendingCameraDraft = null,
    cameraCommandQueue = Promise.resolve();
  const expandedDisclosureKeySet = new Set();
  let activePickerHandle = null,
    pickerGeneration = 0,
    presenceEditorHandle = null,
    isPresenceEditorOpen = false,
    batchDialogHandle = null;
  const previouslyFocusedElement = document.activeElement,
    deviceEntitiesByItemId = new Map();
  let renderedPanelSignature = "";
  const getCollectionKey = () =>
      securityKind === "lock" ? "locks" : securityKind === "camera" ? "cameras" : "presenceSensors",
    getKindLabel = () =>
      securityKind === "lock" ? "门" : securityKind === "camera" ? "摄像头" : "人体传感器",
    getItemList = () => draftProperties.security[getCollectionKey()],
    findSelectedItem = () =>
      getItemList().find(
        (candidateItem) =>
          candidateItem.id === selectedItemId && candidateItem.floorId === selectedFloorId,
      ),
    findSelectedFloor = () =>
      sceneMetadata?.floors.find((candidateFloor) => candidateFloor.id === selectedFloorId),
    getFloorDoorModels = () => doorModels(findSelectedFloor() || {}),
    getCandidateModelId = (candidateModel) => candidateModel?.modelId || candidateModel?.id || "";
  function normalizeDoorModelIds() {
    for (const lockConfigItem of draftProperties.security.locks) {
      if (!lockConfigItem?.modelId || String(lockConfigItem.modelId).startsWith("door:")) continue;
      const matchingFloor = (sceneMetadata?.floors || []).find(
          (lockFloorMatch) => lockFloorMatch.id === lockConfigItem.floorId,
        ),
        matchingDoorModel = (
          matchingFloor?.scene?.doors?.length
            ? matchingFloor.scene.doors
            : matchingFloor?.doors || []
        ).find((candidateDoorRecord) => {
          const doorModelIdText = String(
            candidateDoorRecord?.id || candidateDoorRecord?.modelId || "",
          );
          return (
            doorModelIdText === String(lockConfigItem.modelId) ||
            doorModelIdText === "door:" + lockConfigItem.modelId
          );
        }),
        normalizedDoorId = String(
          matchingDoorModel?.id || matchingDoorModel?.modelId || "",
        ).replace(/^door:/, "");
      normalizedDoorId && (lockConfigItem.modelId = "door:" + normalizedDoorId);
    }
  }
  const getFloorModelList = () =>
      securityKind === "lock"
        ? getFloorDoorModels().filter((doorModel) => doorModel.doorType !== "frame-only")
        : findSelectedFloor()?.[getCollectionKey()] || [],
    toItemKey = (configItem) => securityKind + ":" + configItem.id,
    buildEditorProperties = () => ({
      ...draftProperties,
      floorSelection: selectedFloorId,
      camera:
        draftProperties.floorCameras?.[selectedFloorId] ||
        (draftProperties.floorSelection === selectedFloorId ? draftProperties.camera : null),
    }),
    showError = (error) => {
      isDisposed || setSaveResultMessage(error?.message || String(error));
    };
  function syncEditorRuntime() {
    !isDisposed &&
      !isPresenceEditorOpen &&
      isAccessAllowed &&
      editorRuntime?.update(
        buildEditorProperties(),
        selectedItemId ? securityKind + ":" + selectedItemId : "",
        {
          module: "security",
          securityKind: securityKind,
        },
      );
  }
  function markPropertiesDirty() {
    (setSaveResultMessage("配置已修改，请保存配置。"), syncEditorRuntime());
  }
  function closeActivePicker() {
    (pickerGeneration++, activePickerHandle?.close(), (activePickerHandle = null));
  }
  function createSelectField(labelText, optionEntries, selectedValue, onValueChange) {
    const selectElement = createElement("select");
    (selectElement.setAttribute("aria-label", labelText),
      optionEntries.length || (optionEntries = [["", sceneMetadata ? "暂无可选项" : "正在加载…"]]));
    for (const [optionValue, optionLabel] of optionEntries) {
      const optionElement = createElement("option", "", optionLabel);
      ((optionElement.value = optionValue), selectElement.append(optionElement));
    }
    ((selectElement.value = selectedValue),
      selectElement.addEventListener("change", () => onValueChange(selectElement.value)));
    const labelElement = createElement("label");
    return (
      labelElement.append(createElement("span", "", labelText), selectElement),
      currentContainerElement.append(labelElement),
      selectElement
    );
  }
  function createNumberField(
    fieldLabel,
    currentValue,
    minValue,
    maxValue,
    onValueCommit,
    stepSize = 0.1,
    shouldCommitWhileTyping = false,
  ) {
    const isHeightField = fieldLabel.endsWith("高度（米）"),
      formatFieldValue = (inputValue) =>
        isHeightField ? Number(inputValue).toFixed(1) : inputValue,
      inputElement = createElement("input");
    (Object.assign(inputElement, {
      type: "number",
      value: formatFieldValue(currentValue),
      min: minValue,
      max: maxValue,
      step: isHeightField ? 0.1 : stepSize,
    }),
      inputElement.setAttribute("aria-label", fieldLabel),
      shouldCommitWhileTyping &&
        inputElement.addEventListener("input", () => {
          const typedValue = Number(inputElement.value);
          inputElement.value.trim() &&
            Number.isFinite(typedValue) &&
            typedValue >= minValue &&
            typedValue <= maxValue &&
            ((currentValue = isHeightField ? Number(typedValue.toFixed(1)) : typedValue),
            onValueCommit(currentValue),
            markPropertiesDirty());
        }),
      inputElement.addEventListener("change", () => {
        const changedValue = Number(inputElement.value);
        if (
          !inputElement.value.trim() ||
          !Number.isFinite(changedValue) ||
          changedValue < minValue ||
          changedValue > maxValue
        ) {
          inputElement.value = formatFieldValue(currentValue);
          return;
        }
        ((currentValue = isHeightField ? Number(changedValue.toFixed(1)) : changedValue),
          (inputElement.value = formatFieldValue(currentValue)),
          onValueCommit(currentValue),
          markPropertiesDirty());
      }));
    const fieldLabelElement = createElement("label");
    (fieldLabelElement.append(createElement("span", "", fieldLabel), inputElement),
      currentContainerElement.append(fieldLabelElement));
  }
  const saveButtonElement = createButton("保存配置", async () => {
    if (!(isSaving || !isAccessAllowed || isCameraEditing || isPresenceEditorOpen)) {
      ((isSaving = true), renderPanel());
      try {
        if ((await requestInteraction3dAccess(), isDisposed || !isAccessAllowed)) return;
        (await onSaveConfig(structuredClone(draftProperties)),
          isDisposed || setSaveResultMessage("已应用到编辑器，请保存仪表盘。"));
      } catch (saveError) {
        showError(saveError);
      } finally {
        ((isSaving = false), isDisposed || renderPanel());
      }
    }
  });
  saveButtonElement.className = "primary";
  function closeEditor() {
    isDisposed ||
      ((isDisposed = true),
      closeActivePicker(),
      presenceEditorHandle?.close(),
      editorRuntime?.(),
      previewResizeObserver.disconnect(),
      unsubscribeAccessChange(),
      batchDialogHandle?.close(),
      batchDialogHandle?.remove(),
      (batchDialogHandle = null),
      editorDialogElement.close(),
      editorDialogElement.remove(),
      styleSheetLinkElement.remove(),
      document.dispatchEvent(new Event("hb-i3d-preview-scope")),
      previouslyFocusedElement instanceof HTMLElement && previouslyFocusedElement.focus());
  }
  (headerElement.append(
    createElement("strong", "", "3D 安防配置"),
    saveButtonElement,
    createButton("退出", closeEditor),
  ),
    editorDialogElement.append(headerElement, bodyElement),
    editorDialogElement.addEventListener("cancel", (cancelEvent) => {
      (cancelEvent.preventDefault(), closeEditor());
    }));
  function updatePreviewSize() {
    const previewSize = interaction3dPreviewSize(
      component,
      documentApi,
      viewElement.clientWidth,
      viewElement.clientHeight,
    );
    ((aspectBoxElement.style.width = previewSize.width + "px"),
      (aspectBoxElement.style.height = previewSize.height + "px"));
  }
  const previewResizeObserver = new ResizeObserver(updatePreviewSize);
  previewResizeObserver.observe(viewElement);
  let unsubscribeAccessChange = () => {};
  const handleAccessState = (accessState) => {
    const isAllowed = accessState.allowed === true;
    if (!isAllowed && accessState.status === "denied") {
      ((isAccessAllowed = false),
        (isCameraEditing = false),
        closeActivePicker(),
        presenceEditorHandle?.close(),
        editorRuntime?.setAuthorized?.(false),
        editorRuntime?.(),
        (editorRuntime = null),
        setSaveResultMessage(accessState.message || "3D 使用权限已失效。"),
        isDisposed || renderPanel());
      return;
    }
    isAllowed !== isAccessAllowed &&
      ((isAccessAllowed = isAllowed),
      isAccessAllowed
        ? (editorRuntime?.setAuthorized?.(true), setSaveResultMessage(""))
        : ((isCameraEditing = false),
          closeActivePicker(),
          presenceEditorHandle?.close(),
          editorRuntime?.setAuthorized?.(false),
          setSaveResultMessage("")),
      isDisposed ||
        (renderPanel(), isAccessAllowed && editorDialogElement.open && mountEditorRuntime()));
  };
  async function runCameraCommand(commandName, commandPayload = undefined) {
    const commandTargetItem = findSelectedItem();
    if (!commandTargetItem || isSaving || !isAccessAllowed || isDisposed) return;
    const isFocalLengthCommand = commandName === "focus-focal-length",
      previousQueuePromise = cameraCommandQueue;
    let releaseQueueGate;
    ((cameraCommandQueue = new Promise((resolveQueueGate) => {
      releaseQueueGate = resolveQueueGate;
    })),
      isFocalLengthCommand || ((isSaving = true), renderPanel()));
    try {
      if (
        (await previousQueuePromise,
        isDisposed || !isAccessAllowed || findSelectedItem() !== commandTargetItem)
      )
        return;
      const commandResult = await editorRuntime.focusCommand(
        commandName,
        toItemKey(commandTargetItem),
        commandPayload,
      );
      if (isDisposed || !isAccessAllowed || findSelectedItem() !== commandTargetItem) return;
      (commandResult?.camera && (pendingCameraDraft = commandResult.camera),
        commandName === "save-light-camera"
          ? ((commandTargetItem.focusCamera = commandResult.camera),
            (isCameraEditing = false),
            markPropertiesDirty())
          : commandName === "cancel-light-camera"
            ? ((isCameraEditing = false), (pendingCameraDraft = null))
            : commandName === "edit-light-camera" && (isCameraEditing = true));
    } catch (commandError) {
      isDisposed || showError(commandError);
    } finally {
      (releaseQueueGate(),
        isFocalLengthCommand || ((isSaving = false), isDisposed || renderPanel()));
    }
  }
  async function openPresenceSubEditor() {
    if (!(isSaving || isCameraEditing || isPresenceEditorOpen || !isAccessAllowed)) {
      ((isPresenceEditorOpen = true), editorRuntime?.(), (editorRuntime = null));
      try {
        const openedPresenceEditor = await openPresenceEditor({
          component: {
            ...component,
            properties: structuredClone(draftProperties),
          },
          panelDocument: documentApi,
          floors: sceneMetadata?.floors || [],
          entities: entities,
          pickers: pickers,
          initialSelectedId: selectedItemId,
          editingFloorId: selectedFloorId,
          manageBindings: false,
          onSave: async (presenceDraft) => {
            !isDisposed &&
              isAccessAllowed &&
              ((draftProperties.security = structuredClone(presenceDraft.security)),
              setSaveResultMessage("路线已应用，请保存配置。"));
          },
          onClose: () => {
            ((presenceEditorHandle = null),
              (isPresenceEditorOpen = false),
              !isDisposed && isAccessAllowed && (mountEditorRuntime(), renderPanel()));
          },
        });
        isDisposed || !isAccessAllowed || !isPresenceEditorOpen
          ? openedPresenceEditor?.close()
          : (presenceEditorHandle = openedPresenceEditor);
      } catch (presenceEditorError) {
        ((isPresenceEditorOpen = false),
          showError(presenceEditorError),
          !isDisposed && isAccessAllowed && mountEditorRuntime());
      }
    }
  }
  function createSectionHeading(sectionTitle) {
    const sectionElement = createElement("section", "i3d-focus-settings i3d-security-settings");
    return (
      sectionElement.append(createElement("h4", "", sectionTitle)),
      panelElement.append(sectionElement),
      (currentContainerElement = sectionElement),
      sectionElement
    );
  }
  function createDisclosure(summaryText, disclosureKey, hostElement = currentContainerElement) {
    const detailsElement = createElement("details", "i3d-security-disclosure");
    ((detailsElement.open = expandedDisclosureKeySet.has(disclosureKey)),
      detailsElement.append(createElement("summary", "", summaryText)),
      detailsElement.addEventListener("toggle", () => {
        detailsElement.open
          ? expandedDisclosureKeySet.add(disclosureKey)
          : expandedDisclosureKeySet.delete(disclosureKey);
      }));
    const disclosureBodyElement = createElement("div", "i3d-security-disclosure-body");
    return (
      detailsElement.append(disclosureBodyElement),
      hostElement.append(detailsElement),
      disclosureBodyElement
    );
  }
  function openBatchApplyDialog(sourceItem) {
    if (
      isDisposed ||
      !isAccessAllowed ||
      isSaving ||
      isCameraEditing ||
      isPresenceEditorOpen ||
      batchDialogHandle
    )
      return;
    const doorTypeOf = (doorTypeCandidateItem) =>
        getFloorDoorModels().find(
          (candidateDoorModel) =>
            getCandidateModelId(candidateDoorModel) === doorTypeCandidateItem.modelId,
        )?.doorType || "solid",
      sourceModelEntry = getFloorModelList().find(
        (sourceModelMatch) => getCandidateModelId(sourceModelMatch) === sourceItem.modelId,
      ),
      batchSource = {
        ...sourceItem,
        height:
          sourceItem.height ?? sourceModelEntry?.height ?? (securityKind === "camera" ? 0.15 : 1.1),
      };
    let batchFields;
    if (securityKind === "lock") {
      (Object.assign(batchSource, {
        icon: sourceItem.icon || "mdi:door-closed",
        size: sourceItem.size ?? DEFAULT_BUTTON_SIZE,
        fontSize: sourceItem.fontSize ?? CARD_TEXT_SIZE_PX,
        labelMode: sourceItem.labelMode || (sourceItem.labelHidden ? "hidden" : "always"),
        duration: sourceItem.duration ?? 0.7,
        openAngle: sourceItem.openAngle ?? 80,
        openDirection: sourceItem.openDirection ?? 1,
        hinge: sourceItem.hinge || "left",
      }),
        (batchFields = LOCK_BATCH_APPEARANCE_FIELDS.map(([batchFieldKey, batchFieldLabel]) => ({
          key: batchFieldKey,
          label: batchFieldLabel,
          ...(batchFieldKey === "labelMode"
            ? {
                write: (writeTargetItem, writeLabelModeValue) => {
                  ((writeTargetItem.labelMode = writeLabelModeValue),
                    delete writeTargetItem.labelHidden);
                },
              }
            : {}),
        }))),
        batchFields.push({
          key: "duration",
          label: "动画时长",
          unit: " 秒",
          optional: true,
        }));
      const sourceDoorType = doorTypeOf(sourceItem),
        isHingeDoorType = ["solid", "entry", "glass"].includes(sourceDoorType);
      ((isHingeDoorType || sourceDoorType === "double") &&
        batchFields.push({
          key: "openAngle",
          label: "开门角度",
          optional: true,
          compatible: (angleCandidateItem) => doorTypeOf(angleCandidateItem) === sourceDoorType,
        }),
        (isHingeDoorType || ["double", "sliding-glass"].includes(sourceDoorType)) &&
          batchFields.push({
            key: "openDirection",
            label: "开门方向",
            optional: true,
            compatible: (directionCandidateItem) =>
              doorTypeOf(directionCandidateItem) === sourceDoorType,
          }),
        isHingeDoorType &&
          batchFields.push({
            key: "hinge",
            label: "铰链方向",
            optional: true,
            compatible: (hingeCandidateItem) => doorTypeOf(hingeCandidateItem) === sourceDoorType,
          }));
    } else
      securityKind === "camera"
        ? (batchFields = [
            ["icon", "图标", "mdi:cctv"],
            ["size", "标签大小", DEFAULT_BUTTON_SIZE],
            ["iconSize", "图标大小", buttonIconSize(DEFAULT_BUTTON_SIZE)],
            ["fontSize", "文字大小", CARD_TEXT_SIZE_PX],
            ["hitSize", "触控范围", DEFAULT_BUTTON_SIZE],
          ].map(([cameraFieldKey, cameraFieldLabel, cameraFieldFallback]) => ({
            key: cameraFieldKey,
            label: cameraFieldLabel,
            fallback: cameraFieldFallback,
          })))
        : (batchFields = [
            ["waveEnabled", "显示感应光圈", true],
            ["waveScale", "光圈缩放", 1],
            ["waveOpacity", "光圈不透明度（%）", 68],
            ["character", "人物方案", "traveler"],
            ["color", "人物颜色", "cyan"],
            ["size", "人物缩放", 1],
            ["speed", "行走速度（米/秒）", 0.45],
            ["clickToFocus", "点击人物聚焦", false],
            ["hitPadding", "触控范围扩展（px）", 8],
          ].map(([presenceFieldKey, presenceFieldLabel, presenceFieldFallback]) => ({
            key: presenceFieldKey,
            label: presenceFieldLabel,
            fallback: presenceFieldFallback,
            optional: ["speed", "clickToFocus", "hitPadding"].includes(String(presenceFieldKey)),
          })));
    (securityKind !== "presence" &&
      batchFields.push({
        key: "backgroundOpacity",
        label: "背景不透明度",
        unit: "%",
        fallback: 1,
        format: (opacityRatio) => Math.round(opacityRatio * 100),
      }),
      securityKind !== "presence" &&
        batchFields.push({
          key: "height",
          label: "高度",
          unit: " 米",
          optional: true,
          format: (heightValue) => Number(heightValue).toFixed(1),
        }),
      (batchDialogHandle = openBatchApply({
        title: "应用" + getKindLabel() + "设置",
        source: batchSource,
        fields: batchFields,
        targets: getItemList().filter(
          (targetCandidateItem) =>
            targetCandidateItem.id !== sourceItem.id &&
            targetCandidateItem.floorId === sourceItem.floorId,
        ),
        onClose: () => {
          batchDialogHandle = null;
        },
        onApply: async (selectedTargetItems, selectedFieldDefs) => {
          if (
            (await requestInteraction3dAccess(),
            isDisposed || !isAccessAllowed || !batchDialogHandle?.open)
          )
            throw new Error("配置已关闭或授权不可用");
          for (const targetItem of selectedTargetItems)
            copyBatchFields(targetItem, batchSource, selectedFieldDefs);
          (markPropertiesDirty(),
            renderPanel(),
            setSaveResultMessage(
              "已应用到 " + selectedTargetItems.length + " 个目标，请保存配置。",
            ));
        },
      })));
  }
  function renderPanel() {
    (panelElement.replaceChildren(),
      (saveButtonElement.disabled =
        isSaving || isCameraEditing || !isAccessAllowed || !sceneMetadata || isPresenceEditorOpen));
    const scopeSectionElement = createSectionHeading("配置范围"),
      scopeGridElement = createElement("div", "i3d-security-scope-grid");
    (scopeSectionElement.append(scopeGridElement),
      (currentContainerElement = scopeGridElement),
      createSelectField(
        "配置楼层",
        (sceneMetadata?.floors || []).map((floorItem) => [floorItem.id, floorItem.name]),
        selectedFloorId,
        (nextFloorId) => {
          (closeActivePicker(),
            (selectedFloorId = nextFloorId),
            (selectedItemId = ""),
            syncEditorRuntime(),
            renderPanel());
        },
      ),
      createSelectField(
        "安防类别",
        [
          ["camera", "摄像头"],
          ["presence", "人体传感器"],
          ["lock", "门"],
        ],
        securityKind,
        (nextSecurityKind) => {
          (closeActivePicker(),
            (securityKind = nextSecurityKind),
            (selectedItemId = ""),
            syncEditorRuntime(),
            renderPanel());
        },
      ));
    const modelListSectionElement = createSectionHeading("模型列表");
    ((modelListSectionElement.className += " i3d-security-model-list"),
      (currentContainerElement = modelListSectionElement));
    const itemsInSelectedFloor = getItemList().filter(
      (floorBoundItem) => floorBoundItem.floorId === selectedFloorId,
    );
    (itemsInSelectedFloor.some((itemProbe) => itemProbe.id === selectedItemId) ||
      (selectedItemId = itemsInSelectedFloor[0]?.id || ""),
      createSelectField(
        getKindLabel() + "列表",
        itemsInSelectedFloor.map((itemOption) => [
          itemOption.id,
          itemOption.label || itemOption.entityId || getKindLabel(),
        ]),
        selectedItemId,
        (nextSelectedItemId) => {
          (closeActivePicker(),
            (selectedItemId = nextSelectedItemId),
            syncEditorRuntime(),
            renderPanel());
        },
      ),
      (currentContainerElement = createDisclosure(
        "添加" + getKindLabel(),
        "add:" + securityKind + ":" + selectedFloorId,
        modelListSectionElement,
      )));
    const addableModelList = getFloorModelList().filter(
        (modelProbe) =>
          !getItemList().some(
            (boundItemProbe) =>
              boundItemProbe.floorId === selectedFloorId &&
              boundItemProbe.modelId === getCandidateModelId(modelProbe),
          ),
      ),
      addModelSelectElement = createSelectField(
        "待添加" + getKindLabel() + "模型",
        addableModelList.map((modelOption) => [getCandidateModelId(modelOption), modelOption.name]),
        getCandidateModelId(addableModelList[0]),
        () => {},
      ),
      addItemButtonElement = createButton("添加" + getKindLabel(), () => {
        const addableModel = getFloorModelList().find(
          (addableModelMatch) =>
            getCandidateModelId(addableModelMatch) === addModelSelectElement.value,
        );
        if (
          !addableModel ||
          getItemList().some(
            (existingItemProbe) =>
              existingItemProbe.floorId === selectedFloorId &&
              existingItemProbe.modelId === getCandidateModelId(addableModel),
          )
        )
          return;
        const newItem = {
          id: randomUuid(),
          floorId: selectedFloorId,
          modelId: getCandidateModelId(addableModel),
          entityId: "",
          label: addableModel.name || getKindLabel(),
          ...(securityKind === "lock"
            ? {
                openAngle: 80,
                openDirection: 1,
                duration: 0.7,
                hinge: addableModel.hinge === "right" ? "right" : "left",
                size: DEFAULT_BUTTON_SIZE,
                fontSize: CARD_TEXT_SIZE_PX,
                labelMode: "always",
                icon: "mdi:door-closed",
              }
            : securityKind === "camera"
              ? {
                  size: DEFAULT_BUTTON_SIZE,
                  visible: true,
                  icon: "mdi:cctv",
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
                  hitPadding: 8,
                }),
        };
        (getItemList().push(newItem),
          (selectedItemId = newItem.id),
          expandedDisclosureKeySet.delete("add:" + securityKind + ":" + selectedFloorId),
          markPropertiesDirty(),
          renderPanel());
      });
    ((addItemButtonElement.disabled = !addableModelList.length),
      currentContainerElement.append(addItemButtonElement),
      getFloorModelList().length ||
        currentContainerElement.append(
          createElement(
            "p",
            "i3d-note",
            "本层没有" + getKindLabel() + "模型，请先在 3D 户型图绘制中增加模型。",
          ),
        ),
      (currentContainerElement = modelListSectionElement));
    const selectedItem = findSelectedItem();
    if (selectedItem) {
      const bindingSectionElement = createSectionHeading("基础绑定"),
        bindingGridElement = createElement("div", "i3d-security-scope-grid");
      (bindingSectionElement.append(bindingGridElement),
        (currentContainerElement = bindingGridElement));
      const nameInputElement = createElement("input");
      ((nameInputElement.value = selectedItem.label || ""),
        (nameInputElement.maxLength = 128),
        nameInputElement.setAttribute("aria-label", "名称"),
        nameInputElement.addEventListener("input", () => {
          ((selectedItem.label = nameInputElement.value), markPropertiesDirty());
        }));
      const nameFieldElement = createElement("label");
      (nameFieldElement.append(createElement("span", "", "名称"), nameInputElement),
        currentContainerElement.append(nameFieldElement));
      const modelChoices = getFloorModelList().filter(
          (modelCandidate) =>
            !getItemList().some(
              (otherBoundItem) =>
                otherBoundItem !== selectedItem &&
                otherBoundItem.floorId === selectedFloorId &&
                otherBoundItem.modelId === getCandidateModelId(modelCandidate),
            ),
        ),
        modelOptionList = modelChoices.map((availableModel) => [
          getCandidateModelId(availableModel),
          availableModel.name,
        ]);
      if (
        (modelChoices.some(
          (matchedModel) => getCandidateModelId(matchedModel) === selectedItem.modelId,
        ) ||
          modelOptionList.unshift([
            selectedItem.modelId || "",
            selectedItem.modelId ? "原模型已移除，请重新选择" : "未关联模型（保留原人在路线）",
          ]),
        createSelectField(
          "关联" + getKindLabel() + "模型",
          modelOptionList,
          selectedItem.modelId || "",
          (nextModelId) => {
            (nextModelId ? (selectedItem.modelId = nextModelId) : delete selectedItem.modelId,
              (securityKind === "camera" || securityKind === "lock") &&
                delete selectedItem.focusCamera,
              markPropertiesDirty(),
              renderPanel());
          },
        ),
        (currentContainerElement = bindingSectionElement),
        securityKind === "lock")
      ) {
        currentContainerElement = createSectionHeading("实体来源");
        const deviceButtonElement = createButton(
          selectedItem.deviceName || "选择设备",
          async () => {
            const devicePickerGeneration = ++pickerGeneration;
            activePickerHandle?.close();
            try {
              const devicePickerHandle = await pickers.device({
                trigger: deviceButtonElement,
                current: selectedItem.deviceId || "",
                deviceIcon: "mdi:door-closed",
                title: "选择门设备",
                onSelect(pickedDevice) {
                  if (!(
                    isDisposed ||
                    !isAccessAllowed ||
                    devicePickerGeneration !== pickerGeneration ||
                    findSelectedItem() !== selectedItem
                  )) {
                    ((selectedItem.deviceId = pickedDevice?.deviceId || ""),
                      (selectedItem.deviceName = pickedDevice?.name || ""),
                      Object.assign(
                        selectedItem,
                        identifyLockEntities(pickedDevice?.entities || []),
                      ),
                      delete selectedItem.entityId,
                      delete selectedItem.lowBatteryEntityId,
                      delete selectedItem.tamperEntityId);
                    for (const staleEntityField of [
                      "doorEventEntityId",
                      "doorOpenEntityId",
                      "doorCloseEntityId",
                    ])
                      delete selectedItem[staleEntityField];
                    (markPropertiesDirty(), renderPanel());
                  }
                },
              });
              isDisposed || devicePickerGeneration !== pickerGeneration
                ? devicePickerHandle?.close()
                : (activePickerHandle = devicePickerHandle);
            } catch (devicePickerError) {
              showError(devicePickerError);
            }
          },
        );
        currentContainerElement.append(deviceButtonElement);
        const entitySlotFields = LOCK_ENTITY_FIELDS,
          entityFieldLabels = {
            doorEntityId: "开关门检测",
            batteryEntityId: "电量",
          };
        for (const entityField of entitySlotFields) {
          const entityButtonElement = createButton(
            entityFieldLabels[entityField] +
              "：" +
              (entities.find(
                (slotEntityMatch) => slotEntityMatch.entityId === selectedItem[entityField],
              )?.name ||
                selectedItem[entityField] ||
                "未选择"),
            async () => {
              const slotPickerGeneration = ++pickerGeneration;
              activePickerHandle?.close();
              try {
                const slotDeviceKind =
                    entityField === "doorEntityId" ? "lock-door" : "lock-battery",
                  slotPickerHandle = await pickers.entity({
                    trigger: entityButtonElement,
                    current: selectedItem[entityField] || "",
                    deviceKind: slotDeviceKind,
                    title: "选择" + entityFieldLabels[entityField] + "实体",
                    entityFilter: (candidateEntity) => {
                      const candidateEntityId =
                        candidateEntity.entityId || candidateEntity.entity_id || "";
                      if (candidateEntityId === selectedItem[entityField]) return true;
                      if (
                        !selectedItem.deviceId ||
                        (candidateEntity.deviceId || candidateEntity.device_id) !==
                          selectedItem.deviceId
                      )
                        return false;
                      if (lockEntityRole(candidateEntity, entityField)) return true;
                      const candidateEntityDomain = candidateEntityId.split(".")[0];
                      return entityField === "doorEntityId"
                        ? ["binary_sensor", "sensor"].includes(candidateEntityDomain)
                        : entityField === "batteryEntityId" && candidateEntityDomain === "sensor";
                    },
                    onSelect(slotPickedEntityId) {
                      isDisposed ||
                        !isAccessAllowed ||
                        slotPickerGeneration !== pickerGeneration ||
                        findSelectedItem() !== selectedItem ||
                        ((selectedItem[entityField] = slotPickedEntityId),
                        markPropertiesDirty(),
                        renderPanel());
                    },
                  });
                isDisposed || slotPickerGeneration !== pickerGeneration
                  ? slotPickerHandle?.close()
                  : (activePickerHandle = slotPickerHandle);
              } catch (slotPickerError) {
                showError(slotPickerError);
              }
            },
          );
          ((entityButtonElement.disabled = !selectedItem.deviceId),
            (entityButtonElement.className = "i3d-picker-button i3d-lock-entity-picker"),
            currentContainerElement.append(entityButtonElement));
        }
        const doorType =
            getFloorDoorModels().find(
              (matchedDoorModel) => getCandidateModelId(matchedDoorModel) === selectedItem.modelId,
            )?.doorType || "solid",
          motionSectionElement = createSectionHeading("门扇动作"),
          motionGridElement = createElement("div", "i3d-security-grid i3d-lock-motion-grid");
        (motionSectionElement.append(motionGridElement),
          (currentContainerElement = motionGridElement));
        const commitMotionChange = () => {
            (markPropertiesDirty(),
              editorRuntime?.previewLockMotion?.(toItemKey(selectedItem), true));
          },
          isHingeDoor = ["solid", "entry", "glass"].includes(doorType),
          isDoubleDoor = doorType === "double",
          isSlidingDoor = doorType === "sliding-glass";
        (isHingeDoor &&
          createSelectField(
            "铰链方向",
            [
              ["left", "左开"],
              ["right", "右开"],
            ],
            selectedItem.hinge || "left",
            (nextHinge) => {
              ((selectedItem.hinge = nextHinge), commitMotionChange());
            },
          ),
          (isHingeDoor || isDoubleDoor) &&
            createSelectField(
              isDoubleDoor ? "双扇开启方向" : "开门方向",
              [
                ["1", "内开"],
                ["-1", "外开"],
              ],
              String(selectedItem.openDirection ?? 1),
              (nextDirection) => {
                ((selectedItem.openDirection = Number(nextDirection)), commitMotionChange());
              },
            ),
          isSlidingDoor &&
            createSelectField(
              "滑动方向",
              [
                ["1", "向右收起"],
                ["-1", "向左收起"],
              ],
              String(selectedItem.openDirection ?? 1),
              (nextSlideDirection) => {
                ((selectedItem.openDirection = Number(nextSlideDirection)), commitMotionChange());
              },
            ),
          doorType === "roller-shutter" &&
            motionGridElement.append(
              createElement("p", "i3d-note", "卷帘门按上下卷收，不使用左右铰链或内外开方向。"),
            ),
          (isHingeDoor || isDoubleDoor) &&
            createNumberField(
              "开门角度",
              selectedItem.openAngle ?? 80,
              10,
              110,
              (nextAngle) => {
                selectedItem.openAngle = nextAngle;
              },
              1,
            ),
          createNumberField(
            "动画时长（秒）",
            selectedItem.duration ?? 0.7,
            0.2,
            3,
            (nextDuration) => {
              selectedItem.duration = nextDuration;
            },
            0.1,
          ));
        const appearanceSectionElement = createSectionHeading("标签外观"),
          appearanceGridElement = createElement(
            "div",
            "i3d-security-grid i3d-lock-appearance-grid",
          );
        (appearanceSectionElement.append(appearanceGridElement),
          (currentContainerElement = appearanceGridElement));
        const iconPickerButtonElement = createButton(
          selectedItem.icon || "mdi:door-closed",
          async () => {
            const iconPickerGeneration = ++pickerGeneration;
            activePickerHandle?.close();
            try {
              const iconPickerHandle = await pickers.icon({
                trigger: iconPickerButtonElement,
                current: selectedItem.icon || "mdi:door-closed",
                deviceKind: "lock",
                onSelect(pickedIconId) {
                  isDisposed ||
                    !isAccessAllowed ||
                    iconPickerGeneration !== pickerGeneration ||
                    findSelectedItem() !== selectedItem ||
                    ((selectedItem.icon = pickedIconId || "mdi:door-closed"),
                    markPropertiesDirty(),
                    renderPanel());
                },
              });
              isDisposed || iconPickerGeneration !== pickerGeneration
                ? iconPickerHandle?.close()
                : (activePickerHandle = iconPickerHandle);
            } catch (iconPickerError) {
              showError(iconPickerError);
            }
          },
        );
        iconPickerButtonElement.className = "i3d-picker-button i3d-icon-picker-button";
        const lockIconMaskElement = createElement("i");
        lockIconMaskElement.setAttribute("aria-hidden", "true");
        const iconId = selectedItem.icon || "mdi:door-closed";
        ((lockIconMaskElement.style.maskImage =
          "url('/static/vendor/mdi/7.4.47/svg/" + iconId.slice(4) + ".svg')"),
          (lockIconMaskElement.style.webkitMaskImage = lockIconMaskElement.style.maskImage),
          (iconPickerButtonElement.textContent = ""),
          iconPickerButtonElement.append(lockIconMaskElement, createElement("span", "", iconId)),
          iconPickerButtonElement.setAttribute("aria-label", "门图标"));
        const iconFieldElement = createElement("label");
        iconFieldElement.append(createElement("span", "", "图标"), iconPickerButtonElement);
        const currentLabelMode =
            selectedItem.labelMode === "hidden" ||
            selectedItem.labelMode === "open" ||
            selectedItem.labelMode === "always"
              ? selectedItem.labelMode
              : selectedItem.labelHidden === true
                ? "hidden"
                : "always",
          labelModeSelectElement = createElement("select");
        labelModeSelectElement.setAttribute("aria-label", "标签显示");
        for (const [labelModeValue, labelModeLabel] of [
          ["hidden", "隐藏标签"],
          ["always", "常驻显示"],
          ["open", "打开时显示"],
        ]) {
          const labelModeOptionElement = createElement("option", "", labelModeLabel);
          ((labelModeOptionElement.value = labelModeValue),
            labelModeSelectElement.append(labelModeOptionElement));
        }
        ((labelModeSelectElement.value = currentLabelMode),
          labelModeSelectElement.addEventListener("change", () => {
            ((selectedItem.labelMode = labelModeSelectElement.value),
              delete selectedItem.labelHidden,
              markPropertiesDirty(),
              renderPanel());
          }));
        const labelModeFieldElement = createElement("label");
        labelModeFieldElement.append(createElement("span", "", "标签显示"), labelModeSelectElement);
        const appearanceRowElement = createElement("div", "i3d-lock-appearance-row");
        (appearanceRowElement.append(iconFieldElement, labelModeFieldElement),
          appearanceGridElement.append(appearanceRowElement),
          createNumberField(
            "卡片大小（px）",
            selectedItem.size ?? DEFAULT_BUTTON_SIZE,
            20,
            500,
            (nextSize) => {
              selectedItem.size = nextSize;
            },
            1,
          ),
          createNumberField(
            "文字大小（px）",
            selectedItem.fontSize ?? CARD_TEXT_SIZE_PX,
            8,
            100,
            (nextLockFontSize) => {
              selectedItem.fontSize = nextLockFontSize;
            },
            1,
          ),
          appendBackgroundOpacityControl(
            appearanceSectionElement,
            selectedItem,
            "backgroundOpacity",
            markPropertiesDirty,
          ));
        const labelPositionSectionElement = createSectionHeading("标签位置"),
          labelPositionGridElement = createElement("div", "i3d-coordinate-grid");
        (labelPositionSectionElement.append(labelPositionGridElement),
          (currentContainerElement = labelPositionGridElement),
          createNumberField(
            "位置 X",
            selectedItem.x ??
              getFloorModelList().find(
                (xModelMatch) => getCandidateModelId(xModelMatch) === selectedItem.modelId,
              )?.x ??
              0,
            -1000000,
            1000000,
            (nextX) => {
              selectedItem.x = nextX;
            },
            0.01,
          ),
          createNumberField(
            "位置 Y",
            selectedItem.y ??
              getFloorModelList().find(
                (yModelMatch) => getCandidateModelId(yModelMatch) === selectedItem.modelId,
              )?.y ??
              0,
            -1000000,
            1000000,
            (nextY) => {
              selectedItem.y = nextY;
            },
            0.01,
          ),
          createNumberField(
            "离地高度（米）",
            selectedItem.height ??
              getFloorModelList().find(
                (heightModelMatch) =>
                  getCandidateModelId(heightModelMatch) === selectedItem.modelId,
              )?.height ??
              1.1,
            -1000,
            1000,
            (nextHeight) => {
              selectedItem.height = nextHeight;
            },
            0.1,
          ));
        const doorBatchSectionElement = createSectionHeading("批量设置"),
          doorBatchApplyButtonElement = createButton("一键应用到其他门", () =>
            openBatchApplyDialog(selectedItem),
          );
        ((doorBatchApplyButtonElement.className = "i3d-batch-apply-button"),
          (doorBatchApplyButtonElement.disabled =
            getItemList().filter(
              (otherItem) => otherItem !== selectedItem && otherItem.floorId === selectedFloorId,
            ).length === 0),
          doorBatchSectionElement.append(
            doorBatchApplyButtonElement,
            createElement(
              "p",
              "i3d-note",
              "选择外观、高度或兼容门型的动作设置；保留模型、实体、坐标和视角。",
            ),
          ));
      }
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
                  isDisposed ||
                    !isAccessAllowed ||
                    pickerRequestGeneration !== pickerGeneration ||
                    findSelectedItem() !== selectedItem ||
                    (selectedSensor
                      ? ((selectedItem.deviceId = selectedSensor.deviceId),
                        (selectedItem.deviceName = selectedSensor.name),
                        deviceEntitiesByItemId.set(selectedItem.id, selectedSensor.entities),
                        selectedSensor.entities.some(
                          (entityProbe) => entityProbe.entityId === selectedItem.entityId,
                        ) || (selectedItem.entityId = selectedSensor.entities[0]?.entityId || ""),
                        selectedItem.entityId.startsWith("event.") &&
                          !(selectedItem.displayDuration > 0) &&
                          (selectedItem.displayDuration = 30))
                      : (delete selectedItem.deviceId,
                        delete selectedItem.deviceName,
                        (selectedItem.entityId = ""),
                        deviceEntitiesByItemId.delete(selectedItem.id)),
                    markPropertiesDirty(),
                    renderPanel());
                },
              });
              isDisposed || pickerRequestGeneration !== pickerGeneration
                ? sensorPickerHandle?.close()
                : (activePickerHandle = sensorPickerHandle);
            } catch (sensorPickerError) {
              showError(sensorPickerError);
            }
          },
        );
        ((sensorPickerButtonElement.className = "i3d-picker-button"),
          sensorPickerButtonElement.setAttribute("aria-label", "选择人体传感器设备"));
        const deviceFieldElement = createElement("label");
        (deviceFieldElement.append(
          createElement("span", "", "绑定设备"),
          sensorPickerButtonElement,
        ),
          currentContainerElement.append(deviceFieldElement),
          currentContainerElement.append(
            createElement("p", "i3d-note", "选择设备后自动关联检测来源，通常无需再设置。"),
          ),
          (detectionSourceBodyElement = createDisclosure(
            "检测来源（高级）",
            "detection:" + selectedItem.id,
          )));
        const previousContainerElement = currentContainerElement;
        if (((currentContainerElement = detectionSourceBodyElement), selectedItem.deviceId)) {
          const entityOptionList = (
            deviceEntitiesByItemId.get(selectedItem.id) ||
            pickers.presenceEntities?.(selectedItem.deviceId) ||
            []
          ).map((detectionEntity) => [
            detectionEntity.entityId,
            detectionEntity.name || detectionEntity.entityId,
          ]);
          (selectedItem.entityId &&
            !entityOptionList.some(
              ([optionEntityId]) => optionEntityId === selectedItem.entityId,
            ) &&
            entityOptionList.unshift([
              selectedItem.entityId,
              selectedItem.entityId + "（当前绑定）",
            ]),
            entityOptionList.length > 1
              ? createSelectField(
                  "有人状态来源",
                  entityOptionList,
                  selectedItem.entityId || "",
                  (nextEntityId) => {
                    ((selectedItem.entityId = nextEntityId),
                      nextEntityId.startsWith("event.") &&
                        !(selectedItem.displayDuration > 0) &&
                        (selectedItem.displayDuration = 30),
                      markPropertiesDirty());
                  },
                )
              : currentContainerElement.append(
                  createElement(
                    "p",
                    "i3d-note",
                    entityOptionList.length
                      ? "检测实体：" + entityOptionList[0][1]
                      : "设备暂无可用检测实体，请重新选择设备。",
                  ),
                ));
        }
        currentContainerElement = previousContainerElement;
      }
      const entityPickerButtonElement = createButton(
        entities.find((entityMatch) => entityMatch.entityId === selectedItem.entityId)?.name ||
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
                isDisposed ||
                  !isAccessAllowed ||
                  entityPickerGeneration !== pickerGeneration ||
                  findSelectedItem() !== selectedItem ||
                  ((selectedItem.entityId = pickedEntityId),
                  securityKind === "presence" &&
                    (delete selectedItem.deviceId,
                    delete selectedItem.deviceName,
                    deviceEntitiesByItemId.delete(selectedItem.id)),
                  securityKind === "presence" &&
                    pickedEntityId.startsWith("event.") &&
                    !(selectedItem.displayDuration > 0) &&
                    (selectedItem.displayDuration = 30),
                  markPropertiesDirty(),
                  renderPanel());
              },
            });
            isDisposed || entityPickerGeneration !== pickerGeneration
              ? entityPickerHandle?.close()
              : (activePickerHandle = entityPickerHandle);
          } catch (entityPickerError) {
            showError(entityPickerError);
          }
        },
      );
      securityKind === "presence" &&
        (entityPickerButtonElement.textContent = selectedItem.entityId
          ? "手动绑定：" + selectedItem.entityId
          : "手动选择实体（无设备归属）");
      const entityLabelText = entityPickerButtonElement.textContent;
      entityPickerButtonElement.textContent = "";
      const entityLabelElement = createElement(
        "span",
        "i3d-security-entity-label",
        entityLabelText,
      );
      if (
        (entityPickerButtonElement.append(entityLabelElement),
        (entityPickerButtonElement.title = entityLabelText),
        (entityPickerButtonElement.className = "i3d-picker-button"),
        entityPickerButtonElement.setAttribute("aria-label", "选择" + getKindLabel() + "实体"),
        securityKind === "presence")
      ) {
        if (
          (detectionSourceBodyElement.append(
            createElement(
              "p",
              "i3d-note",
              "可选择摄像头检测、人体传感器或自定义实体，按检测结果触发。",
            ),
            entityPickerButtonElement,
          ),
          (currentContainerElement = detectionSourceBodyElement),
          createSelectField(
            "触发方式",
            PRESENCE_TRIGGER_MODES,
            selectedItem.triggerMode || "auto",
            (nextTriggerMode) => {
              ((selectedItem.triggerMode = nextTriggerMode),
                nextTriggerMode === "equals" && (selectedItem.triggerValue ||= "on"),
                nextTriggerMode === "threshold" && (selectedItem.triggerThreshold ??= 0),
                presenceTriggerIsTimed(selectedItem) &&
                  !(selectedItem.displayDuration > 0) &&
                  (selectedItem.displayDuration = 30),
                markPropertiesDirty(),
                renderPanel());
            },
          ),
          selectedItem.triggerMode === "threshold" &&
            createNumberField(
              "数值大于",
              selectedItem.triggerThreshold ?? 0,
              -1000000,
              1000000,
              (nextThreshold) => {
                selectedItem.triggerThreshold = nextThreshold;
              },
              0.1,
              true,
            ),
          selectedItem.triggerMode === "equals")
        ) {
          const triggerValueInputElement = createElement("input");
          ((triggerValueInputElement.value = selectedItem.triggerValue ?? "on"),
            (triggerValueInputElement.maxLength = 128),
            triggerValueInputElement.setAttribute("aria-label", "触发值"),
            triggerValueInputElement.addEventListener("input", () => {
              triggerValueInputElement.value.trim() &&
                ((selectedItem.triggerValue = triggerValueInputElement.value.trim().slice(0, 128)),
                markPropertiesDirty());
            }),
            triggerValueInputElement.addEventListener("change", () => {
              triggerValueInputElement.value = selectedItem.triggerValue ?? "on";
            }));
          const triggerValueFieldElement = createElement("label");
          (triggerValueFieldElement.append(
            createElement("span", "", "触发值"),
            triggerValueInputElement,
          ),
            currentContainerElement.append(triggerValueFieldElement));
        }
        const isTimedTrigger = presenceTriggerIsTimed(selectedItem);
        (createNumberField(
          "触发后显示（秒）",
          selectedItem.displayDuration ?? (isTimedTrigger ? 30 : 0),
          isTimedTrigger ? 1 : 0,
          3600,
          (nextDisplayDuration) => {
            selectedItem.displayDuration = nextDisplayDuration;
          },
          1,
          true,
        ),
          currentContainerElement.append(
            createElement(
              "p",
              "i3d-note",
              selectedItem.triggerMode === "change" || selectedItem.triggerMode === "equals"
                ? "只比较状态值，属性刷新不触发；首次加载和离线恢复不触发。再次触发重新计时。"
                : isTimedTrigger
                  ? "按检测事件发生时间计时，再次检测重新计时；到时隐藏。"
                  : "0 秒：满足条件时持续显示，不满足时隐藏。其他值：达到时长后隐藏。自动识别开关状态、检测事件及名称明确的人数；其他数值请设置阈值。",
            ),
          ),
          (currentContainerElement = bindingSectionElement),
          currentContainerElement.append(
            createElement(
              "p",
              "i3d-note",
              "配置时点击标签选择传感器；正式页面仅展示模型和感应效果。",
            ),
          ));
      } else securityKind !== "lock" && currentContainerElement.append(entityPickerButtonElement);
      if (securityKind === "camera") {
        currentContainerElement.append(
          createElement(
            "p",
            "i3d-note",
            "标签显示设备状态；仅点击聚焦后连接视频，退出时断开。可拖动标签调整位置。",
          ),
        );
        const labelSettingsSectionElement = createSectionHeading("标签设置"),
          labelSettingsGridElement = createElement("div", "i3d-security-scope-grid");
        (labelSettingsSectionElement.append(labelSettingsGridElement),
          (currentContainerElement = labelSettingsGridElement));
        const cameraIconPickerButtonElement = createButton(
          selectedItem.icon || "mdi:cctv",
          async () => {
            const cameraIconPickerGeneration = ++pickerGeneration;
            activePickerHandle?.close();
            try {
              const cameraIconPickerHandle = await pickers.icon({
                trigger: cameraIconPickerButtonElement,
                current: selectedItem.icon || "mdi:cctv",
                deviceKind: "camera",
                onSelect(pickedCameraIconId) {
                  isDisposed ||
                    !isAccessAllowed ||
                    cameraIconPickerGeneration !== pickerGeneration ||
                    findSelectedItem() !== selectedItem ||
                    ((selectedItem.icon = pickedCameraIconId),
                    markPropertiesDirty(),
                    renderPanel());
                },
              });
              isDisposed || cameraIconPickerGeneration !== pickerGeneration
                ? cameraIconPickerHandle?.close()
                : (activePickerHandle = cameraIconPickerHandle);
            } catch (cameraIconPickerError) {
              showError(cameraIconPickerError);
            }
          },
        );
        cameraIconPickerButtonElement.className = "i3d-picker-button i3d-icon-picker-button";
        const iconMaskElement = createElement("i");
        ((iconMaskElement.style.maskImage =
          "url('/static/vendor/mdi/7.4.47/svg/" +
          (selectedItem.icon || "mdi:cctv").slice(4) +
          ".svg')"),
          (iconMaskElement.style.webkitMaskImage = iconMaskElement.style.maskImage),
          (cameraIconPickerButtonElement.textContent = ""),
          cameraIconPickerButtonElement.append(
            iconMaskElement,
            createElement("span", "", selectedItem.icon || "mdi:cctv"),
          ),
          cameraIconPickerButtonElement.setAttribute("aria-label", "摄像头图标"));
        const cameraIconFieldElement = createElement("label");
        (cameraIconFieldElement.append(
          createElement("span", "", "图标"),
          cameraIconPickerButtonElement,
        ),
          currentContainerElement.append(cameraIconFieldElement),
          createNumberField(
            "标签缩放（%）",
            // 百分比以 DEFAULT_BUTTON_SIZE 为 100%（= 新建时的默认大小）。渲染侧的缩放
            // 基准仍是设计单位 44（stage.ts 的 --i3d-security-scale），两者语义不同。
            Math.round(((selectedItem.size ?? DEFAULT_BUTTON_SIZE) / DEFAULT_BUTTON_SIZE) * 100),
            10,
            500,
            (nextScalePercent) => {
              selectedItem.size = (nextScalePercent / 100) * DEFAULT_BUTTON_SIZE;
            },
            1,
          ),
          appendBackgroundOpacityControl(
            labelSettingsSectionElement,
            selectedItem,
            "backgroundOpacity",
            markPropertiesDirty,
          ));
        const sizeDisclosureBodyElement = createDisclosure(
            "更多尺寸设置",
            "camera-sizes",
            labelSettingsSectionElement,
          ),
          sizeGridElement = createElement("div", "i3d-coordinate-grid i3d-security-size-grid");
        (sizeDisclosureBodyElement.append(sizeGridElement),
          (currentContainerElement = sizeGridElement),
          createNumberField(
            "图标大小（px）",
            selectedItem.iconSize ?? buttonIconSize(selectedItem.size ?? DEFAULT_BUTTON_SIZE),
            4,
            200,
            (nextIconSize) => {
              selectedItem.iconSize = nextIconSize;
            },
            1,
          ),
          createNumberField(
            "文字大小（px）",
            selectedItem.fontSize ?? CARD_TEXT_SIZE_PX,
            8,
            100,
            (nextFontSize) => {
              selectedItem.fontSize = nextFontSize;
            },
            1,
          ),
          createNumberField(
            "触控范围（px）",
            selectedItem.hitSize ?? DEFAULT_BUTTON_SIZE,
            1,
            1000,
            (nextHitSize) => {
              selectedItem.hitSize = nextHitSize;
            },
            1,
          ));
        const cameraLabelPositionSectionElement = createSectionHeading("标签位置"),
          cameraLabelPositionGridElement = createElement("div", "i3d-coordinate-grid");
        (cameraLabelPositionSectionElement.append(cameraLabelPositionGridElement),
          (currentContainerElement = cameraLabelPositionGridElement));
        const modelDefaults = getFloorModelList().find(
          (modelMatch) => getCandidateModelId(modelMatch) === selectedItem.modelId,
        );
        for (const axisName of ["x", "y"])
          createNumberField(
            "位置 " + axisName.toUpperCase(),
            selectedItem[axisName] ?? modelDefaults?.[axisName] ?? 0,
            -1000000,
            1000000,
            (nextAxisValue) => {
              selectedItem[axisName] = nextAxisValue;
            },
          );
        (createNumberField(
          "离地高度（米）",
          selectedItem.height ?? modelDefaults?.height ?? 0.15,
          -1000,
          1000,
          (nextCameraHeight) => {
            selectedItem.height = nextCameraHeight;
          },
        ),
          (currentContainerElement = cameraLabelPositionSectionElement));
        const resetToModelButtonElement = createButton("恢复跟随模型", () => {
          (delete selectedItem.x,
            delete selectedItem.y,
            delete selectedItem.height,
            markPropertiesDirty(),
            renderPanel());
        });
        ((resetToModelButtonElement.disabled = !["x", "y", "height"].some((axisKey) =>
          Number.isFinite(selectedItem[axisKey]),
        )),
          (resetToModelButtonElement.className = "i3d-focus-reset"),
          currentContainerElement.append(resetToModelButtonElement),
          currentContainerElement.append(
            createElement("p", "i3d-note", "仅调整标签，不移动摄像头模型。也可在预览中拖动标签。"),
          ),
          createSectionHeading("聚焦视角"));
        const focusActionsElement = createElement("div", "i3d-focus-actions");
        if (
          (isCameraEditing
            ? focusActionsElement.append(
                createButton("保存视角", () => runCameraCommand("save-light-camera")),
                createButton("取消调整", () => runCameraCommand("cancel-light-camera")),
              )
            : focusActionsElement.append(
                createButton(selectedItem.focusCamera ? "调整视角" : "设置视角", () =>
                  runCameraCommand("edit-light-camera"),
                ),
                createButton("预览聚焦", () => runCameraCommand("preview-light-camera")),
              ),
          currentContainerElement.append(focusActionsElement),
          isCameraEditing)
        ) {
          const projectionGroupElement = createElement("div", "i3d-focus-actions");
          (projectionGroupElement.setAttribute("role", "group"),
            projectionGroupElement.setAttribute("aria-label", "聚焦投影"));
          for (const [projectionMode, projectionLabel] of [
            ["orthographic", "正交"],
            ["perspective", "透视"],
          ]) {
            const projectionButtonElement = createButton(projectionLabel, () =>
              runCameraCommand("focus-projection", projectionMode),
            );
            (projectionButtonElement.setAttribute(
              "aria-pressed",
              String((pendingCameraDraft?.mode || "orthographic") === projectionMode),
            ),
              projectionGroupElement.append(projectionButtonElement));
          }
          const focalLengthInputElement = createElement("input");
          (Object.assign(focalLengthInputElement, {
            type: "number",
            min: "18",
            max: "120",
            step: "1",
            value: String(Math.round(pendingCameraDraft?.focalLength || 50)),
          }),
            focalLengthInputElement.setAttribute("aria-label", "焦段（mm）"),
            (focalLengthInputElement.dataset.focusFocal = "true"),
            focalLengthInputElement.addEventListener("change", () => {
              const nextFocalLength = Number(focalLengthInputElement.value);
              if (!focalLengthInputElement.value.trim() || !Number.isFinite(nextFocalLength)) {
                focalLengthInputElement.value = String(pendingCameraDraft?.focalLength || 50);
                return;
              }
              ((focalLengthInputElement.value = String(
                Math.max(18, Math.min(120, nextFocalLength)),
              )),
                runCameraCommand("focus-focal-length", Number(focalLengthInputElement.value)));
            }));
          const focalLengthFieldElement = createElement("label");
          (focalLengthFieldElement.append(
            createElement("span", "", "焦段（mm）"),
            focalLengthInputElement,
          ),
            currentContainerElement.append(projectionGroupElement, focalLengthFieldElement));
        }
        if (!isCameraEditing) {
          const resetFocusButtonElement = createButton("恢复自动聚焦", async () => {
            if (!(isSaving || !isAccessAllowed)) {
              ((isSaving = true), renderPanel());
              try {
                if (
                  (await editorRuntime.focusCommand("cancel-light-camera", toItemKey(selectedItem)),
                  isDisposed || !isAccessAllowed)
                )
                  return;
                (delete selectedItem.focusCamera, markPropertiesDirty());
              } catch (resetFocusError) {
                showError(resetFocusError);
              } finally {
                ((isSaving = false), isDisposed || renderPanel());
              }
            }
          });
          ((resetFocusButtonElement.disabled = !selectedItem.focusCamera),
            (resetFocusButtonElement.className = "i3d-focus-reset"),
            currentContainerElement.append(resetFocusButtonElement));
        }
      }
      if (securityKind === "presence") {
        if (selectedItem.modelId) {
          const waveSectionElement = createSectionHeading("感应光圈");
          createSelectField(
            "显示光圈",
            [
              ["on", "开启"],
              ["off", "关闭"],
            ],
            selectedItem.waveEnabled === false ? "off" : "on",
            (nextWaveEnabled) => {
              ((selectedItem.waveEnabled = nextWaveEnabled === "on"),
                markPropertiesDirty(),
                renderPanel());
            },
          );
          const waveGridElement = createElement("div", "i3d-security-scope-grid");
          if (
            (waveSectionElement.append(waveGridElement),
            (currentContainerElement = waveGridElement),
            createNumberField(
              "光圈大小（%）",
              Math.round((selectedItem.waveScale ?? 1) * 100),
              25,
              300,
              (nextWaveScalePercent) => {
                selectedItem.waveScale = nextWaveScalePercent / 100;
              },
              1,
            ),
            createNumberField(
              "光圈透明度（%）",
              100 - (selectedItem.waveOpacity ?? 68),
              0,
              100,
              (nextWaveOpacityPercent) => {
                selectedItem.waveOpacity = 100 - nextWaveOpacityPercent;
              },
              1,
            ),
            selectedItem.waveEnabled === false)
          ) {
            for (const waveInputElement of waveGridElement.querySelectorAll("input"))
              waveInputElement.disabled = true;
          }
        }
        (createSectionHeading("人物展示"),
          currentContainerElement.append(createButton("配置人物与行走路线", openPresenceSubEditor)),
          currentContainerElement.append(
            createElement(
              "p",
              "i3d-note",
              "按需设置人物、显示时长与行走路线。设备绑定在上方统一管理。",
            ),
          ));
      }
      securityKind !== "lock" &&
        createSectionHeading("批量设置").append(
          createButton("一键应用到其他" + getKindLabel(), () => openBatchApplyDialog(selectedItem)),
        );
      const bindingManagementSectionElement = createSectionHeading("绑定管理"),
        removeBindingButtonElement = createButton("移除" + getKindLabel() + "绑定", () => {
          (closeActivePicker(),
            (draftProperties.security[getCollectionKey()] = getItemList().filter(
              (remainingItem) => remainingItem !== selectedItem,
            )),
            (selectedItemId = ""),
            markPropertiesDirty(),
            renderPanel());
        });
      ((removeBindingButtonElement.className = "i3d-remove-light"),
        bindingManagementSectionElement.append(removeBindingButtonElement));
    }
    const currentPanelSignature = securityKind + ":" + selectedFloorId + ":" + selectedItemId;
    if (
      (currentPanelSignature !== renderedPanelSignature &&
        ((renderedPanelSignature = currentPanelSignature), (panelElement.scrollTop = 0)),
      (currentContainerElement = panelElement),
      currentContainerElement.append(errorMessageElement),
      isSaving || isCameraEditing || !isAccessAllowed || isPresenceEditorOpen)
    ) {
      for (const disabledControlElement of panelElement.querySelectorAll("button,input,select"))
        disabledControlElement.disabled = true;
      if (isCameraEditing && !isSaving && isAccessAllowed) {
        for (const focusActionButtonElement of panelElement.querySelectorAll(
          ".i3d-focus-actions button",
        ))
          focusActionButtonElement.disabled = false;
      }
      for (const panelInputElement of panelElement.querySelectorAll("input"))
        panelInputElement.dataset.focusFocal &&
          (panelInputElement.disabled =
            isSaving || !isAccessAllowed || pendingCameraDraft?.mode !== "perspective");
    }
  }
  function mountEditorRuntime() {
    isDisposed ||
      !isAccessAllowed ||
      editorRuntime ||
      isPresenceEditorOpen ||
      ((editorRuntime = mountInteraction3d(stageHostElement, {
        component: {
          ...component,
          properties: buildEditorProperties(),
        },
        context: {
          document: documentApi,
          editable: true,
        },
        editing: true,
        editingModule: "security",
        editingSecurityKind: securityKind,
        onReady(readyMetadata?) {
          ((sceneMetadata = readyMetadata),
            normalizeDoorModelIds(),
            sceneMetadata.floors.some((floorMatch) => floorMatch.id === selectedFloorId) ||
              (selectedFloorId = sceneMetadata.floors[0]?.id || ""),
            renderPanel(),
            syncEditorRuntime());
        },
        onEdit(editEvent) {
          if (!(isDisposed || !isAccessAllowed)) {
            if (editEvent.action === "position") {
              const positionTargetMatch = /^(camera|lock):(.+)$/.exec(editEvent.id || ""),
                positionTargetList =
                  positionTargetMatch?.[1] === "lock"
                    ? "locks"
                    : positionTargetMatch?.[1] === "camera"
                      ? "cameras"
                      : "",
                editedPositionItem =
                  positionTargetList &&
                  draftProperties.security[positionTargetList].find(
                    (positionMatch) => positionMatch.id === positionTargetMatch[2],
                  );
              editedPositionItem &&
                Number.isFinite(editEvent.x) &&
                Number.isFinite(editEvent.y) &&
                ((editedPositionItem.x = editEvent.x),
                (editedPositionItem.y = editEvent.y),
                markPropertiesDirty());
            }
            if (
              (editEvent.action === "focus-exited" && ((isCameraEditing = false), renderPanel()),
              editEvent.action === "select" && /^(camera|presence|lock):/.test(editEvent.id || ""))
            ) {
              const separatorIndex = editEvent.id.indexOf(":");
              ((securityKind = editEvent.id.slice(0, separatorIndex)),
                (selectedItemId = editEvent.id.slice(separatorIndex + 1)),
                renderPanel());
            }
          }
        },
        onLoadError: showError,
      })),
      document.dispatchEvent(new Event("hb-i3d-preview-scope")));
  }
  return (
    document.head.append(styleSheetLinkElement),
    document.body.append(editorDialogElement),
    editorDialogElement.showModal(),
    renderPanel(),
    updatePreviewSize(),
    // 先订阅授权、后挂载运行时：授权监控订阅时会同步派发当前状态（通常是 checking、
    // allowed=false），若此时运行时已挂载，会立即 setAuthorized(false) 掐断刚建立的
    // 实时 WebSocket 连接（出现 “WebSocket is closed before the connection is established”
    // 与 fetch 的 AbortError）。订阅在前时该回调里运行时还不存在，等授权真正通过后
    // handleAccessState 再调用 mountEditorRuntime 挂载。
    (unsubscribeAccessChange = subscribeInteraction3dAccess(handleAccessState)),
    mountEditorRuntime(),
    {
      close: closeEditor,
    }
  );
}
