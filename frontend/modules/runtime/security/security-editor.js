/**
 * 3D 安防配置编辑器（摄像头与人体传感器共用一个弹窗）：与 config-editor.js 同构 —— 弹窗 +
 * 预览舞台（mountInteraction3d，editing=true）+ 草稿。
 *
 * 两种编辑对象共用同一面板，只靠 getCollectionKey / getKindLabel 区分：摄像头（位置、朝向、焦距、
 * 点击行为等）与人体传感器（触发模式与探测路线；路线编辑会打开 presence-editor.js 子编辑器，
 * 期间本编辑器主动卸载预览运行时，一个容器只挂一个）。
 * 约定：保存通过 onSave 交给宿主落库（本模块不发保存请求），脏标记沿用 editor-save-status 的签名
 * 比较口径，退出前用同一套文案确认。对外只导出 openSecurityEditor。
 */
import {
  PRESENCE_TRIGGER_MODES,
  presenceTriggerIsTimed
} from "../presence/presence-motion.js?v=2609220023";
import { mountInteraction3d } from "../core/runtime.js?v=2609220023";
import { openPresenceEditor } from "../presence/presence-editor.js?v=2609220023";
import {
  EDITOR_SAVE_STATUS,
  serializeEditorDraft
} from "../core/editor-save-status.js?v=2609220023";
import {
  confirmAction,
  createDomFactory,
  interaction3dPreviewSize,
  randomUuid,
  requestInteraction3dAccess,
  subscribeInteraction3dAccess
} from "../core/static-helpers-editor.js?v=2609220023";
/**
 * 打开 3D 安防配置编辑器。
 * 先取编辑授权，再建弹窗与预览舞台；舞台回报场景元数据后才渲染面板
 * （可选项来自场景，未就绪时面板只能显示加载态）。
 */
export async function openSecurityEditor({
  component: component,
  panelDocument: documentApi,
  entities: entities = [],
  pickers: pickers,
  onSave: onSaveConfig
}) {
  await requestInteraction3dAccess();
  const draftProperties = structuredClone(component.properties || {});
  // 补齐 security 结构：旧配置可能整个缺失，面板各处都直接按下标取，先兜住。
  draftProperties.security = {
    ...draftProperties.security,
    cameras: draftProperties.security?.cameras || [],
    presenceSensors: draftProperties.security?.presenceSensors || []
  };
  for (const cameraItem of draftProperties.security.cameras) {
    // 摄像头没有「按钮」的概念：历史配置里可能残留按钮相关字段，
    // 打开时顺手清掉，免得保存后又把无效字段写回后端。
    delete cameraItem.buttonHidden;
    delete cameraItem.hiddenClickable;
  }
  // 已保存的草稿签名：脏标记与「是否有改动」判断的唯一参照。
  let savedDraftSignature = serializeEditorDraft(draftProperties);
  // 元素与按钮的唯一实现见 /static/shared/dom-factory.js：文本一律 textContent，按钮写死
  // type="button"（对话框里出现表单时，不写 type 的回车 / 点击都可能误提交）。
  // 类名一律带 i3d- 前缀，样式复用 runtime.css。
  const { el: createElement, button: createButton } = createDomFactory(document);
  // 编辑器样式复用运行时的 runtime.css，打开时注入、关闭时移除，
  // 展示页无需为编辑器额外加载样式。
  const styleSheetLinkElement = createElement("link");
  styleSheetLinkElement.rel = "stylesheet";
  styleSheetLinkElement.href =
    "/api/v1/modules/interaction3d/core/runtime.css?v=2609220023";
  const editorDialogElement = createElement("dialog", "i3d-editor");
  editorDialogElement.setAttribute("aria-label", "3D 安防配置");
  // 标记预览作用域：宿主据此识别「哪些弹窗会遮挡 3D 预览」，
  // 从而在弹窗盖住预览时挂起渲染（runtime.js 的挂起检测就是按这个属性找 dialog 的）。
  editorDialogElement.dataset.i3dPreviewScope = "security";
  const headerElement = createElement("header");
  const bodyElement = createElement("div", "i3d-editor-body");
  const viewElement = createElement("div", "i3d-editor-view");
  const panelElement = createElement("aside");
  // 「当前容器」游标：字段创建函数把控件挂到它上面，分区 / 折叠块只需切换这个游标，
  // 不必层层传参。
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
  // 舞台元数据（楼层、可用模型、摄像头 / 传感器列表）：面板的可选项完全由它决定，
  // 未就绪前所有下拉只能显示加载态。
  let sceneMetadata = null;
  let selectedFloorId =
    draftProperties.floorSelection === "all" ? "" : draftProperties.floorSelection || "";
  // 当前编辑的安防类型：摄像头或人体传感器，两者共用同一套面板逻辑。
  let securityKind = "camera";
  let selectedItemId = "";
  let editorRuntime = null;
  let isDisposed = false;
  let isAccessAllowed = true;
  let isSaving = false;
  let isCameraEditing = false;
  let pendingCameraDraft = null;
  let cameraCommandQueue = Promise.resolve();
  // 折叠块的展开状态：面板是全量重建的，靠这个 Set 按 key 记住展开过的分组。
  const expandedDisclosureKeySet = new Set();
  let activePickerHandle = null;
  // 选择器代次：关闭选择器时自增，作废它尚未返回的异步回调。
  let pickerGeneration = 0;
  let presenceEditorHandle = null;
  // 人体传感器子编辑器是否打开：打开期间本编辑器不占用预览运行时，也禁止保存。
  let isPresenceEditorOpen = false;
  // 记下打开编辑器前的焦点：关闭时还回去，键盘用户不会被丢回页面开头。
  const previouslyFocusedElement = document.activeElement;
  // 配置项 → 同设备实体列表：实体选择框要按「这台设备上有哪些可用实体」给候选。
  const deviceEntitiesByItemId = new Map();
  // 两种类型的取值口径集中在这两个小函数上：面板、脏标记、预览都靠它们区分对象。
  const getCollectionKey = () => (securityKind === "camera" ? "cameras" : "presenceSensors");
  // 两类安防设备在界面上的中文名，面板标题与提示统一从这里取，不散落字符串。
  const getKindLabel = () => (securityKind === "camera" ? "摄像头" : "人体传感器");
  // 当前编辑类型对应的配置数组（摄像头 / 人体传感器二选一）。
  const getItemList = () => draftProperties.security[getCollectionKey()];
  // 选中项必须同时匹配 ID 与楼层：同一个模型在不同楼层可能有不同配置项。
  const findSelectedItem = () =>
    getItemList().find(
      candidateItem =>
        candidateItem.id === selectedItemId && candidateItem.floorId === selectedFloorId
    );
  // 当前编辑楼层在场景元数据里的记录；楼层已被删除时返回 undefined。
  const findSelectedFloor = () =>
    sceneMetadata?.floors.find(candidateFloor => candidateFloor.id === selectedFloorId);
  // 该楼层上可用的同类型场景模型（映射用的候选）；找不到楼层时给空数组。
  const getFloorModelList = () => findSelectedFloor()?.[getCollectionKey()] || [];
  // 配置项的稳定标识：两类设备的 id 可能重名，拼上类型前缀后作为 3D 侧命令的目标 ID。
  const toItemKey = item => securityKind + ":" + item.id;
  // 预览用属性：楼层固定为当前编辑楼层，相机取该楼层已保存的视角，
  // 这样编辑器里的取景与展示页一致，拖出来的位置才有可比性。
  const buildEditorProperties = () => ({
    ...draftProperties,
    floorSelection: selectedFloorId,
    camera:
      draftProperties.floorCameras?.[selectedFloorId] ||
      (draftProperties.floorSelection === selectedFloorId ? draftProperties.camera : null)
  });
  // 错误统一走保存结果提示位，保证错误与成功不会同时占两个位置。
  const showError = error => {
    if (!isDisposed) {
      setSaveResultMessage(error?.message || String(error), {
        isError: true
      });
    }
  };
  // 把草稿推给预览运行时。人体传感器子编辑器打开期间跳过 ——
  // 那时预览运行时已被卸载，由子编辑器接管。
  function syncEditorRuntime() {
    if (!isDisposed && !isPresenceEditorOpen && isAccessAllowed) {
      editorRuntime?.update(
        buildEditorProperties(),
        selectedItemId ? securityKind + ":" + selectedItemId : ""
      );
    }
  }
  // 一次改动后的统一收尾：刷新脏标记、清掉上一次的错误提示、把草稿同步进预览。
  function markPropertiesDirty() {
    syncDraftDirtyState();
    errorMessageElement.textContent = "";
    syncEditorRuntime();
  }
  // 脏标记 = 草稿签名 ≠ 已保存签名；保存过程中不覆盖状态文案。
  function syncDraftDirtyState() {
    isDirty = serializeEditorDraft(draftProperties) !== savedDraftSignature;
    if (!isSaving) {
      saveStatusElement.textContent = isDirty ? EDITOR_SAVE_STATUS.dirty : "";
    }
    syncSaveButtonState();
  }
  // 保存按钮的禁用条件集中在这里：保存中 / 无改动 / 正在调视角 / 无授权 /
  // 场景未就绪 / 子编辑器打开，任一成立都不可保存。
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
  // 保存结果只占一个展示位：错误写错误行、成功写状态行，两者互斥，
  // 避免出现「保存失败」和「已保存」同时挂在界面上。
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
  // 关闭选择器并自增代次：选择器回调里会检查代次，过期结果直接丢弃。
  function closeActivePicker() {
    pickerGeneration++;
    activePickerHandle?.close();
    activePickerHandle = null;
  }
  // 下拉字段：候选为空时给出「正在加载… / 暂无可选项」占位，
  // 否则一个空白下拉会让人以为界面坏了。
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
  /**
   * 数字输入字段：shouldCommitWhileTyping 用于需边调边看效果的字段（焦距等），其余在 change 时提交。
   * 提交时若值非法（空 / 非数字 / 越界）就退回上一个合法值，而不是把 NaN 或越界值写进草稿。
   */
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
  // 关闭编辑器：有未保存改动先确认；随后释放子编辑器、选择器、预览运行时与观察者，
  // 移除注入的样式，并把焦点还给打开它的元素。
  async function closeEditor() {
    if (!isDisposed) {
      if (
        isDirty &&
        !(await confirmAction({
          kicker: "UNSAVED",
          title: "退出编辑",
          message: EDITOR_SAVE_STATUS.dirtyExitConfirm,
          detail: "未保存的改动会丢失。",
          confirmLabel: "退出",
          cancelLabel: "继续编辑",
          tone: "warning"
        }))
      ) {
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
  // 预览按 16:9 适配，与配置编辑器用同一套尺寸算法，保证两处观感一致。
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
  // 授权变化：失去授权时立即卸载预览运行时并关掉所有子弹窗 ——
  // 没有权限就不应继续渲染或编辑；此时不自动重挂，等用户重新获取授权。
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
  // 相机指令串行执行：队列保证先后顺序，避免并发指令把视角互相覆盖。
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
  // 打开人体传感器子编辑器。它会接管预览：这里先卸载自己的运行时（一个容器只挂一个），
  // 子编辑器的保存回调把草稿合并进 security；无论正常关闭还是异常，都要重新挂载预览并重绘面板，
  // 否则回到本编辑器会是一个空白舞台。
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
  // 新建分区并把「当前容器」切到它，后续创建的字段自然落进该分区。
  function createSectionHeading(sectionTitle) {
    const sectionElement = createElement("section", "i3d-focus-settings i3d-security-settings");
    sectionElement.append(createElement("h4", "", sectionTitle));
    panelElement.append(sectionElement);
    currentContainerElement = sectionElement;
    return sectionElement;
  }
  // 折叠分组：展开状态按 key 记在 Set 里，面板重绘后仍然保持展开。
  // 返回的是内容容器，调用方往里面塞字段。
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
  // 面板总渲染：整块替换子节点。选中项、折叠状态等界面状态都存在闭包变量里，
  // 所以这里不能把状态寄存在 DOM 节点上，否则每次重绘都会丢。
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
    addItemButtonElement.disabled = !addableModelList.length;
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
            // 焦距夹到 18~120mm：这是常见监控镜头的可用区间，越界值没有实际意义。
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
  // 挂载安防编辑器的预览运行时：editing=true 且模块固定为 security，
  // 因此舞台上只有摄像头与人体传感器可交互。
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
