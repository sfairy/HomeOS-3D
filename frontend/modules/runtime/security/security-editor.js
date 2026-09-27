/**
 * 3D 安防配置编辑器（摄像头、人体传感器与门锁共用一个弹窗）：与 config-editor.js 同构 —— 弹窗 +
 */
import {
  PRESENCE_TRIGGER_MODES,
  presenceTriggerIsTimed
} from "../presence/presence-motion.js?v=2609271508";
import { mountInteraction3d } from "../core/runtime.js?v=2609271508";
import { openPresenceEditor } from "../presence/presence-editor.js?v=2609271508";
import { DESIGNS } from "../presence/presence-character.js?v=2609271508";
// 跨域批量应用对话框：config-editor 与本编辑器共用同一实现（本文件只提供字段描述表与目标集合）。
import { copyBatchFields, openBatchApply } from "../editor/batch-apply.js?v=2609271508";
import {
  EDITOR_SAVE_STATUS,
  serializeEditorDraft
} from "../core/editor-save-status.js?v=2609271508";
import { applyMdiMask } from "../core/static-helpers.js?v=2609271508";
// 门锁状态与槽位顺序从 lock-state.js 取（它本身只是运行侧的薄转出口）：面板上的「当前状态」
import { LOCK_ENTITY_FIELDS, lockState } from "./lock-state.js?v=2609271508";
import {
  createDomFactory,
  doorOpenFromText,
  identifyLockEntities,
  interaction3dPreviewSize,
  lockEntityRole,
  randomUuid,
  requestInteraction3dAccess,
  subscribeInteraction3dAccess
} from "../core/static-helpers-editor.js?v=2609271508";

const LOCK_DOOR_SOURCE_OPTIONS = [
  ["sensor", "门磁传感器"],
  ["single-event", "单事件门磁"],
  ["dual-event", "双事件门磁"]
];
const LOCK_DOOR_SOURCE_VALUES = LOCK_DOOR_SOURCE_OPTIONS.map(([doorSourceValue]) => doorSourceValue);
// 绑定里的门模型 ID 一律写成 door:<id>：后端 lock.py 会剥掉前缀再写回，舞台也按这个前缀把绑定
const normalizeDoorModelId = modelId => {
  const rawModelId = String(modelId || "").replace(/^(?:door:)+/, "");
  return rawModelId ? "door:" + rawModelId : "";
};
// 各实体槽位在「device_class 未知」时的兜底域白名单：HA 目录条目本身不带 device_class
const LOCK_FIELD_DOMAINS = {
  entityId: ["lock"],
  // 门磁槽位放两个域：binary_sensor 是标准门磁；sensor 是「门状态做成枚举传感器」的那一族
  doorEntityId: ["binary_sensor", "sensor"],
  batteryEntityId: ["sensor"],
  lowBatteryEntityId: ["binary_sensor"],
  tamperEntityId: ["binary_sensor"],
  doorEventEntityId: ["event"],
  doorOpenEntityId: ["event"],
  doorCloseEntityId: ["event"]
};
// 门型 → 用哪套「动作」控件（与 lock-motion.js 的 rig 划分一致）：
const LOCK_HINGE_DOOR_TYPES = ["entry", "solid", "glass"];
// 「批量设置」的字段描述表：与 0.6.5 参考实现同一张表 —— 摄像头走图标 / 尺寸组，
const CAMERA_BATCH_FIELDS = [
  ["icon", "图标", "mdi:cctv"],
  ["size", "标签大小", 44],
  ["iconSize", "图标大小", 26],
  ["fontSize", "文字大小", 12],
  ["hitSize", "触控范围", 44]
].map(([fieldKey, fieldLabel, fallbackValue]) => ({
  key: fieldKey,
  label: fieldLabel,
  fallback: fallbackValue
}));
// 门锁的批量外观字段：与门锁面板实际渲染的四个外观项一一对应（图标 / 卡片大小 / 文字大小 /
const LOCK_BATCH_APPEARANCE_FIELDS = [
  { key: "icon", label: "图标", fallback: "mdi:door-closed" },
  { key: "size", label: "卡片大小", fallback: 44 },
  { key: "fontSize", label: "文字大小", fallback: 12 },
  {
    key: "labelMode",
    label: "标签显示",
    fallback: "always",
    write: (targetItem, labelModeValue) => {
      targetItem.labelMode = labelModeValue;
      delete targetItem.labelHidden;
    }
  }
];
// 「兼容门型」= 门型逐字相等：参考实现里动作字段的 compatible 是
const PRESENCE_BATCH_FIELDS = [
  ["waveEnabled", "显示感应光圈", true],
  ["waveScale", "光圈缩放", 1],
  ["waveOpacity", "光圈不透明度（%）", 68],
  ["character", "人物方案", "traveler"],
  ["color", "人物颜色", "cyan"],
  ["size", "人物缩放", 1],
  ["speed", "行走速度（米/秒）", 0.45],
  ["clickToFocus", "点击人物聚焦", false],
  ["hitPadding", "触控范围扩展（px）", 8]
].map(([fieldKey, fieldLabel, fallbackValue]) => ({
  key: fieldKey,
  label: fieldLabel,
  fallback: fallbackValue,
  optional: ["speed", "clickToFocus", "hitPadding"].includes(fieldKey),
  format:
    fieldKey === "character"
      ? characterKey => DESIGNS[characterKey]?.name || characterKey
      : fieldKey === "color"
        ? colorKey => (colorKey === "orange" ? "橙色" : colorKey === "cyan" ? "青色" : colorKey)
        : undefined
}));
/**
 * 打开 3D 安防配置编辑器。
 */
export async function openSecurityEditor({
  component: component,
  panelDocument: documentApi,
  entities: entities = [],
  // 实时状态：门锁面板的「门锁状态」要用它折算。宿主不一定传（传了才有实时读数；没传时
  states: states = {},
  pickers: pickers,
  onSave: onSaveConfig
}) {
  await requestInteraction3dAccess();
  const draftProperties = structuredClone(component.properties || {});
  // 补齐 security 结构：旧配置可能整个缺失，面板各处都直接按下标取，先兜住。
  draftProperties.security = {
    ...draftProperties.security,
    locks: draftProperties.security?.locks || [],
    cameras: draftProperties.security?.cameras || [],
    presenceSensors: draftProperties.security?.presenceSensors || []
  };
  // 门锁字段归一：门型（doorType）/ 门牌 / 墙体这些字段现在已经属于户型图模型，
  for (const lockItem of draftProperties.security.locks) {
    for (const legacyKey of ["doorType", "doorLabel", "wallId", "t"]) {
      delete lockItem[legacyKey];
    }
    if (lockItem.doorSource != null && !LOCK_DOOR_SOURCE_VALUES.includes(lockItem.doorSource)) {
      delete lockItem.doorSource;
    }
    lockItem.labelMode =
      lockItem.labelMode === "hidden" ||
      lockItem.labelMode === "open" ||
      lockItem.labelMode === "always"
        ? lockItem.labelMode
        : lockItem.labelHidden === true
          ? "hidden"
          : "always";
    delete lockItem.labelHidden;
    const normalizedLockModelId = normalizeDoorModelId(lockItem.modelId);
    if (normalizedLockModelId) {
      lockItem.modelId = normalizedLockModelId;
    }
  }
  for (const cameraItem of draftProperties.security.cameras) {
    delete cameraItem.buttonHidden;
    delete cameraItem.hiddenClickable;
  }
  // 已保存的草稿签名：脏标记与「是否有改动」判断的唯一参照。
  let savedDraftSignature = serializeEditorDraft(draftProperties);
  const { el: createElement, button: createButton } = createDomFactory(document);
  // 编辑器样式复用运行时的 runtime.css，打开时注入、关闭时移除，
  const styleSheetLinkElement = createElement("link");
  styleSheetLinkElement.rel = "stylesheet";
  styleSheetLinkElement.href =
    "/api/v1/modules/interaction3d/core/runtime.css?v=2609271508";
  // 门锁编辑面板的专属样式（实体选择器行、动作 / 外观栅格）单独一张表：它只服务本编辑器，
  const securityStyleLinkElement = createElement("link");
  securityStyleLinkElement.rel = "stylesheet";
  securityStyleLinkElement.href =
    "/api/v1/modules/interaction3d/security/security-editor.css?v=2609271508";
  const editorDialogElement = createElement("dialog", "i3d-editor");
  editorDialogElement.setAttribute("aria-label", "3D 安防配置");
  // 标记预览作用域：宿主据此识别「哪些弹窗会遮挡 3D 预览」，
  editorDialogElement.dataset.i3dPreviewScope = "security";
  const headerElement = createElement("header");
  const bodyElement = createElement("div", "i3d-editor-body");
  const viewElement = createElement("div", "i3d-editor-view");
  const panelElement = createElement("aside");
  // 「当前容器」游标：字段创建函数把控件挂到它上面，分区 / 折叠块只需切换这个游标，
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
  let sceneMetadata = null;
  let selectedFloorId =
    draftProperties.floorSelection === "all" ? "" : draftProperties.floorSelection || "";
  // 当前编辑的安防类型：摄像头 / 人体传感器 / 门锁，三者共用同一套面板逻辑。
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
  let batchDialogHandle = null;
  // 人体传感器子编辑器是否打开：打开期间本编辑器不占用预览运行时，也禁止保存。
  let isPresenceEditorOpen = false;
  // 记下打开编辑器前的焦点：关闭时还回去，键盘用户不会被丢回页面开头。
  const previouslyFocusedElement = document.activeElement;
  // 配置项 → 同设备实体列表：实体选择框要按「这台设备上有哪些可用实体」给候选。
  const deviceEntitiesByItemId = new Map();
  // 三种类型的取值口径集中在这两个小函数上：面板、脏标记、预览都靠它们区分对象。
  const getCollectionKey = () =>
    securityKind === "camera" ? "cameras" : securityKind === "lock" ? "locks" : "presenceSensors";
  // 三类安防设备在界面上的中文名，面板标题与提示统一从这里取，不散落字符串。
  const getKindLabel = () =>
    securityKind === "camera" ? "摄像头" : securityKind === "lock" ? "门" : "人体传感器";
  // 当前编辑类型对应的配置数组（摄像头 / 人体传感器 / 门锁三选一）。
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
  // 本层可选的门模型：舞台快照里的 doors 已经是 doorModels 展开后的清单（带 modelId 与平面坐标，
  const getFloorDoorModels = () =>
    (findSelectedFloor()?.doors || []).filter(doorModel => doorModel.doorType !== "frame-only");
  // 该楼层上可用的同类型场景模型（映射用的候选）；找不到楼层时给空数组。
  const getFloorModelList = () =>
    securityKind === "lock" ? getFloorDoorModels() : findSelectedFloor()?.[getCollectionKey()] || [];
  // 模型候选的稳定 ID：摄像头 / 传感器用场景项 id，门模型用 doorModels 给的 modelId。
  const getCandidateModelId = candidateModel =>
    securityKind === "lock"
      ? normalizeDoorModelId(candidateModel?.modelId)
      : candidateModel?.id || "";
  // 按 modelId 回查本层的门模型：门型（用哪套动画控件）与缺省坐标都从它取。
  const findDoorModelForItem = item =>
    getFloorDoorModels().find(
      doorModel => normalizeDoorModelId(doorModel.modelId) === item?.modelId
    );
  // 配置项的稳定标识：三类设备的 id 可能重名，拼上类型前缀后作为 3D 侧命令的目标 ID
  const toItemKey = item => securityKind + ":" + item.id;
  // 预览用属性：楼层固定为当前编辑楼层，相机取该楼层已保存的视角，
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
  // 布尔开关行（存在感应外观的「点击人物聚焦」）：与 presence-editor.js 的开关同构 ——
  function createToggleField(fieldLabel, currentValue, onValueCommit) {
    const toggleInputElement = createElement("input");
    toggleInputElement.type = "checkbox";
    toggleInputElement.checked = currentValue === true;
    toggleInputElement.setAttribute("aria-label", fieldLabel);
    toggleInputElement.addEventListener("change", () => {
      onValueCommit(toggleInputElement.checked);
      markPropertiesDirty();
    });
    const toggleFieldElement = createElement("label", "i3d-setting-toggle");
    toggleFieldElement.append(createElement("span", "", fieldLabel), toggleInputElement);
    currentContainerElement.append(toggleFieldElement);
    return toggleInputElement;
  }
  /**
   * 打开「批量设置」弹窗：把当前项的外观字段套用到同楼层的其他同类项。
   */
  function openBatchApplyDialog(sourceItem) {
    if (isDisposed || !isAccessAllowed || isSaving || isCameraEditing || isPresenceEditorOpen) {
      return;
    }
    // 源快照：把「高度」这类未显式落库的字段先按各自面板的默认值补齐，
    const sourceModelEntry = getFloorModelList().find(
      modelMatch => getCandidateModelId(modelMatch) === sourceItem.modelId
    );
    const sourceDefaultHeight =
      securityKind === "lock"
        ? (sourceModelEntry?.height ?? 2.2) * 0.5
        : securityKind === "camera"
          ? (sourceModelEntry?.height ?? 0.15)
          : 1.1;
    const batchSource = {
      ...sourceItem,
      height: sourceItem.height ?? sourceDefaultHeight
    };
    let batchFields;
    if (securityKind === "lock") {
      // 门锁：外观 + 高度无条件复制；动作类字段按「兼容门型」出现并过滤。
      const doorTypeOf = candidateItem =>
        findDoorModelForItem(candidateItem)?.doorType || "solid";
      const sourceDoorType = doorTypeOf(sourceItem);
      // 字段是否出现由源门型决定（逐条硬条件）：
      const isHingeDoorType = LOCK_HINGE_DOOR_TYPES.includes(sourceDoorType);
      const isDoubleDoorType = sourceDoorType === "double";
      const isSlidingDoorType = sourceDoorType === "sliding-glass";
      // compatible 谓词：目标门与源门门型逐字相等才允许写入动作类字段（跨门型没有对应参数语义）。
      const sameDoorType = candidateItem => doorTypeOf(candidateItem) === sourceDoorType;
      batchFields = LOCK_BATCH_APPEARANCE_FIELDS.map(fieldEntry => ({ ...fieldEntry }));
      // 动画时长与门型无关，属于通用动作项。
      batchFields.push({ key: "duration", label: "动画时长", unit: " 秒", optional: true });
      if (isHingeDoorType || isDoubleDoorType) {
        batchFields.push({
          key: "openAngle",
          label: "开门角度",
          optional: true,
          compatible: sameDoorType
        });
      }
      if (isHingeDoorType || isDoubleDoorType || isSlidingDoorType) {
        batchFields.push({
          key: "openDirection",
          label: "开门方向",
          optional: true,
          compatible: sameDoorType
        });
      }
      if (isHingeDoorType) {
        batchFields.push({
          key: "hinge",
          label: "铰链方向",
          optional: true,
          compatible: sameDoorType
        });
      }
      batchFields.push({
        key: "height",
        label: "高度",
        unit: " 米",
        optional: true,
        format: heightValue => Number(heightValue).toFixed(1)
      });
    } else if (securityKind === "camera") {
      batchFields = CAMERA_BATCH_FIELDS.map(fieldEntry => ({ ...fieldEntry }));
      // 摄像头额外提供「高度」：可选字段，展示成一位小数（米）。
      batchFields.push({
        key: "height",
        label: "高度",
        unit: " 米",
        optional: true,
        format: heightValue => Number(heightValue).toFixed(1)
      });
    } else {
      batchFields = PRESENCE_BATCH_FIELDS.map(fieldEntry => ({ ...fieldEntry }));
    }
    batchDialogHandle = openBatchApply({
      title: "应用" + getKindLabel() + "设置",
      source: batchSource,
      fields: batchFields,
      targets: getItemList().filter(
        candidateItem => candidateItem !== sourceItem && candidateItem.floorId === selectedFloorId
      ),
      onClose: () => {
        batchDialogHandle = null;
      },
      onApply: async (selectedTargetItems, selectedFieldDefs) => {
        await requestInteraction3dAccess();
        if (isDisposed || !isAccessAllowed) {
          throw new Error("配置已关闭或授权不可用。");
        }
        for (const targetItem of selectedTargetItems) {
          // 「兼容门型」必须在**目标**上判定：batch-apply.js 的 copyBatchFields 本身已按目标求值
          const applicableFields = selectedFieldDefs.filter(
            fieldEntry => !fieldEntry.compatible || fieldEntry.compatible(targetItem)
          );
          copyBatchFields(targetItem, batchSource, applicableFields);
        }
        markPropertiesDirty();
        renderPanel();
        setSaveResultMessage(
          "已应用到 " + selectedTargetItems.length + " 个目标，请保存配置。"
        );
      }
    });
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
        // 与 0.6.5 dist 的门锁保存回执逐字一致：这一步只把改动落到编辑器草稿，
        setSaveResultMessage("已应用到编辑器，请保存仪表盘。");
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
  // 关闭编辑器：直接释放子编辑器、选择器、预览运行时与观察者，移除注入的样式，
  function closeEditor() {
    if (!isDisposed) {
      isDisposed = true;
      closeActivePicker();
      presenceEditorHandle?.close();
      batchDialogHandle?.remove();
      batchDialogHandle = null;
      editorRuntime?.();
      previewResizeObserver.disconnect();
      unsubscribeAccessChange();
      editorDialogElement.close();
      editorDialogElement.remove();
      styleSheetLinkElement.remove();
      securityStyleLinkElement.remove();
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
  const unsubscribeAccessChange = subscribeInteraction3dAccess(accessState => {
    const isAllowed = accessState.allowed === true;
    if (isAllowed !== isAccessAllowed) {
      isAccessAllowed = isAllowed;
      if (!isAccessAllowed) {
        isCameraEditing = false;
        closeActivePicker();
        presenceEditorHandle?.close();
        batchDialogHandle?.remove();
        batchDialogHandle = null;
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
  // 打开人体传感器子编辑器。它会接管预览：这里先卸载自己的运行时（一个容器只挂一个），
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
                saveStatusElement.textContent = "路线已应用，请保存配置。";
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
  // ---------------------------------------------------------------------------
  // 门锁编辑：实体槽位、门磁来源、门扇动作与标签。字段口径全部来自 lock-state.js / lock.py，
  // 本段只负责把它们摆成控件，不新增语义。
  // ---------------------------------------------------------------------------

  // 从运行时状态表里取一条状态：states 允许 Map（运行时下发）或普通对象（编辑器直接注入）。
  const readLockStateEntry = entityId =>
    entityId ? (states instanceof Map ? states.get(entityId) : states?.[entityId]) : null;
  // 目录条目自带 device_class 时优先用它，没有就看实时状态的 attributes ——
  const lockEntityDeviceClass = entity =>
    entity?.deviceClass ||
    entity?.device_class ||
    entity?.attributes?.device_class ||
    readLockStateEntry(entity?.entityId)?.attributes?.device_class ||
    "";
  // 与 lockEntityRole 相同的「不可用」判定：禁用 / 缺失的实体不进候选。
  const isLockEntityDisabled = entity =>
    entity?.disabledBy != null ||
    entity?.disabled_by != null ||
    entity?.enabled === false ||
    ["missing", "disabled"].includes(entity?.status);
  // 单个实体能不能填某个槽位：逐条对应上游 0.6.5 安防编辑器里那段 entityFilter 的收口部分 ——
  const lockEntityMatchesField = (entity, field) => {
    if (isLockEntityDisabled(entity)) {
      return false;
    }
    const entityId = entity?.entityId || entity?.entity_id || "";
    if (
      lockEntityDeviceClass(entity) &&
      lockEntityRole({ ...entity, entityId, deviceClass: lockEntityDeviceClass(entity) }, field)
    ) {
      return true;
    }
    return (LOCK_FIELD_DOMAINS[field] || []).includes(String(entityId).split(".")[0]);
  };
  // 把实体清单补成 lockEntityRole 能吃的形状，供「自动识别」一键回填五个槽位。
  const lockCandidateEntities = () =>
    entities.map(entity => ({ ...entity, deviceClass: lockEntityDeviceClass(entity) }));
  const isSensorDoorStateEntity = entity => {
    const entityId = entity?.entityId || entity?.entity_id || "";
    if (String(entityId).split(".")[0] !== "sensor") {
      return false;
    }
    if (["door", "opening"].includes(lockEntityDeviceClass(entity))) {
      return true;
    }
    const readableName = [entity?.name, entity?.originalName, entity?.translationKey, entityId]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (
      /门|door/.test(readableName) &&
      doorOpenFromText(readLockStateEntry(entityId)?.state) !== null
    );
  };
  // 自动回填门磁槽位：只在「槽位为空 + 这台设备名下恰好一支枚举门状态」时写入。
  const autoFillSensorDoorState = (item, candidateEntities) => {
    if (item.doorEntityId || item.doorSource === "single-event" || item.doorSource === "dual-event") {
      return false;
    }
    const matchedDoorStateSensors = candidateEntities.filter(entity =>
      isSensorDoorStateEntity(entity)
    );
    if (matchedDoorStateSensors.length !== 1) {
      return false;
    }
    item.doorEntityId =
      matchedDoorStateSensors[0].entityId || matchedDoorStateSensors[0].entity_id;
    return true;
  };
  // 「选择设备」入口：与上游 0.6.5 「实体来源」里那一行同一条契约（pickers.device，
  function createLockDevicePickerButton(item) {
    const deviceButtonElement = createButton(item.deviceName || "选择设备", async () => {
      const devicePickerGeneration = ++pickerGeneration;
      activePickerHandle?.close();
      try {
        const devicePickerHandle = await pickers.device({
          trigger: deviceButtonElement,
          current: item.deviceId || "",
          deviceIcon: "mdi:door-closed",
          title: "选择门设备",
          onSelect(pickedDevice) {
            if (
              isDisposed ||
              !isAccessAllowed ||
              devicePickerGeneration !== pickerGeneration ||
              findSelectedItem() !== item
            ) {
              return;
            }
            item.deviceId = pickedDevice?.deviceId || "";
            item.deviceName = pickedDevice?.name || "";
            if (pickedDevice) {
              const deviceEntityIdSet = new Set(
                (pickedDevice.entities || []).map(deviceEntity => deviceEntity.entityId)
              );
              const pickedDeviceEntities = (pickedDevice.entities || []).map(deviceEntity => ({
                ...deviceEntity,
                deviceClass: lockEntityDeviceClass(deviceEntity)
              }));
              const detectedRoles = identifyLockEntities(pickedDeviceEntities);
              for (const entityField of LOCK_ENTITY_FIELDS) {
                if (detectedRoles[entityField]) {
                  item[entityField] = detectedRoles[entityField];
                } else if (item[entityField] && !deviceEntityIdSet.has(item[entityField])) {
                  // 旧槽位不属于这台设备了：留着只会让运行时去订阅一台已解绑设备的实体。
                  delete item[entityField];
                }
              }
              // identifyLockEntities 只认 binary_sensor 门磁，枚举型门状态（小米 S2）要再补一档。
              autoFillSensorDoorState(item, pickedDeviceEntities);
            }
            markPropertiesDirty();
            renderPanel();
          }
        });
        if (isDisposed || devicePickerGeneration !== pickerGeneration) {
          devicePickerHandle?.close();
        } else {
          activePickerHandle = devicePickerHandle;
        }
      } catch (devicePickerError) {
        showError(devicePickerError);
      }
    });
    // 上游这里不挂任何类名：按钮走宿主页全局 button 基线（居中、圆角 5、30px 高），
    deviceButtonElement.setAttribute("aria-label", "选择门设备");
    return deviceButtonElement;
  }
  // 槽位候选的第二道闸（第一道是实体选择器按 deviceKind 给的域白名单）：与上游 0.6.5 的
  const lockSlotEntityFilter = (field, item) => candidateEntity => {
    const candidateEntityId = candidateEntity?.entityId || candidateEntity?.entity_id || "";
    if (candidateEntityId === item[field]) {
      return true;
    }
    if (
      item.deviceId &&
      (candidateEntity?.deviceId || candidateEntity?.device_id) !== item.deviceId
    ) {
      return false;
    }
    return lockEntityMatchesField(candidateEntity, field);
  };
  // 槽位选择按钮：与上游 0.6.5 的「开关门检测：<实体>」「电量：<实体>」同款 —— 按钮文字是
  function createLockEntityPickerButton(
    labelText,
    field,
    item,
    { deviceKind, disabled = false, ariaLabel = "选择" + labelText + "实体" } = {}
  ) {
    const entityButtonElement = createButton("", async () => {
      const entityPickerGeneration = ++pickerGeneration;
      activePickerHandle?.close();
      try {
        const entityPickerHandle = await pickers.entity({
          trigger: entityButtonElement,
          current: item[field] || "",
          deviceKind,
          // 弹层标题与触发按钮的无障碍名同一份口径：槽位名改一处就够，不会出现
          title: ariaLabel,
          entityFilter: lockSlotEntityFilter(field, item),
          onSelect(pickedEntityId) {
            if (
              isDisposed ||
              !isAccessAllowed ||
              entityPickerGeneration !== pickerGeneration ||
              findSelectedItem() !== item
            ) {
              return;
            }
            // 上游这里无条件赋值（清空即写空串）；本仓槽位一律「空值即删除」，后端按缺省
            if (pickedEntityId) {
              item[field] = pickedEntityId;
            } else {
              delete item[field];
            }
            markPropertiesDirty();
            renderPanel();
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
    });
    // 文字与实体名同宽：长实体名走省略号（.i3d-security-entity-label 与面板里其他实体
    const entityLabelText =
      labelText +
      "：" +
      (entities.find(entity => entity.entityId === item[field])?.name || item[field] || "未选择");
    entityButtonElement.append(
      createElement("span", "i3d-security-entity-label", entityLabelText)
    );
    entityButtonElement.title = entityLabelText;
    entityButtonElement.className = "i3d-picker-button i3d-lock-entity-picker";
    // 无障碍名跟着槽位走（默认「选择<槽位>实体」）；锁本体这一路沿用本仓既有的「选择门实体」，
    entityButtonElement.setAttribute("aria-label", ariaLabel);
    entityButtonElement.disabled = disabled;
    // 与 createLockTextField 同一约定：造完直接落进当前容器，调用方不用再 append 一次。
    currentContainerElement.append(entityButtonElement);
    return entityButtonElement;
  }
  // 纯文本字段（事件属性 / 开合读数）：空值即删除，后端把缺省按空串处理。
  function createLockTextField(labelText, field, item, placeholderText) {
    const inputElement = createElement("input");
    inputElement.value = item[field] ?? "";
    inputElement.maxLength = 128;
    inputElement.placeholder = placeholderText || "";
    inputElement.setAttribute("aria-label", labelText);
    inputElement.addEventListener("input", () => {
      if (inputElement.value.trim()) {
        item[field] = inputElement.value.trim().slice(0, 128);
      } else {
        delete item[field];
      }
      markPropertiesDirty();
    });
    const fieldElement = createElement("label", "i3d-lock-text-field");
    fieldElement.append(createElement("span", "", labelText), inputElement);
    currentContainerElement.append(fieldElement);
  }
  // 切换门磁来源时清掉不属于该来源的字段：lock.py 对事件实体的域、双事件的两实体不同、
  function applyLockDoorSource(item, nextSource) {
    const clearFields = fieldNames => fieldNames.forEach(fieldName => delete item[fieldName]);
    if (!nextSource) {
      clearFields([
        "doorSource",
        "doorEntityId",
        "doorEventEntityId",
        "doorEventAttribute",
        "doorOpenValue",
        "doorCloseValue",
        "doorOpenEntityId",
        "doorCloseEntityId"
      ]);
      return;
    }
    item.doorSource = nextSource;
    if (nextSource === "sensor") {
      clearFields([
        "doorEventEntityId",
        "doorEventAttribute",
        "doorOpenValue",
        "doorCloseValue",
        "doorOpenEntityId",
        "doorCloseEntityId"
      ]);
    } else if (nextSource === "single-event") {
      clearFields(["doorEntityId", "doorOpenEntityId", "doorCloseEntityId"]);
      if (!item.doorEventAttribute) {
        item.doorEventAttribute = "event_type";
      }
    } else if (nextSource === "dual-event") {
      clearFields([
        "doorEntityId",
        "doorEventEntityId",
        "doorEventAttribute",
        "doorOpenValue",
        "doorCloseValue"
      ]);
    }
  }
  // 实时状态行：与舞台动画共用 lockState（同一个 doorOpen 口径），不在这里重算文案。
  function renderLockStatus(item) {
    const viewState = lockState(item, states);
    const statusParts = ["锁状态：" + viewState.label + " · " + viewState.doorLabel];
    if (item.batteryEntityId) {
      statusParts.push("电量 " + viewState.battery);
    }
    if (item.lowBatteryEntityId) {
      statusParts.push(viewState.lowBattery ? "电量低" : "电量正常");
    }
    if (item.tamperEntityId && viewState.tamper) {
      statusParts.push("被拆动");
    }
    currentContainerElement.append(
      createElement("p", "i3d-note i3d-lock-editor-status", statusParts.join(" · "))
    );
  }
  // 门锁的面板主体：实体来源 → 门扇动作 → 标签外观 / 位置。门型只从选中的门模型读，
  function renderLockBindingPanel(item) {
    const doorModel = findDoorModelForItem(item);
    const doorType = doorModel?.doorType || "solid";
    // 实体来源：与上游 0.6.5 逐行同构 —— 分区标题 + 「选择设备 / <门设备名>」整台设备入口，
    createSectionHeading("实体来源");
    currentContainerElement.append(createLockDevicePickerButton(item));
    createLockEntityPickerButton("开关门检测", "doorEntityId", item, {
      deviceKind: "lock-door",
      disabled: !item.deviceId
    });
    createLockEntityPickerButton("电量", "batteryEntityId", item, {
      deviceKind: "lock-battery",
      disabled: !item.deviceId
    });
    const slotBodyElement = createDisclosure("更多槽位与门磁来源", "lock-slots:" + item.id);
    const previousContainerElement = currentContainerElement;
    currentContainerElement = slotBodyElement;
    // 实时状态行（本仓额外能力）：面板上不占位时，槽位是否真的可用只能靠它看。
    renderLockStatus(item);
    if (!item.deviceId) {
      currentContainerElement.append(
        createElement(
          "p",
          "i3d-note",
          "先选择门设备，开关门检测 / 电量会自动填好；也可以在这里逐槽位手动指定。"
        )
      );
    }
    createLockEntityPickerButton("锁本体", "entityId", item, {
      deviceKind: "lock",
      ariaLabel: "选择门实体"
    });
    currentContainerElement.append(
      createElement("p", "i3d-note", "锁本体须为 lock.* 域；门磁、电量、防拆都可选。")
    );
    // 门磁来源：选项就是 LOCK_DOOR_SOURCE_OPTIONS（后端 lock.py 的合法取值）；
    createSelectField(
      "门磁来源",
      [["", "不绑定门磁"], ...LOCK_DOOR_SOURCE_OPTIONS],
      item.doorSource || "",
      nextDoorSource => {
        applyLockDoorSource(item, nextDoorSource);
        markPropertiesDirty();
        renderPanel();
      }
    );
    const doorSource = item.doorSource || "";
    if (doorSource === "sensor") {
      // 门磁传感器来源用的就是上方那个「开关门检测」槽位：这里只说明去哪改，不再摆第二个
      currentContainerElement.append(
        createElement("p", "i3d-note", "门磁传感器来源直接使用上方的「开关门检测」槽位。")
      );
    } else if (doorSource === "single-event") {
      createLockEntityPickerButton("事件实体", "doorEventEntityId", item, {
        deviceKind: "lock-event"
      });
      createLockTextField("事件属性", "doorEventAttribute", item, "event_type");
      createLockTextField("开门读数", "doorOpenValue", item, "open");
      createLockTextField("关门读数", "doorCloseValue", item, "closed");
      currentContainerElement.append(
        createElement("p", "i3d-note", "单事件需同时填写开门 / 关门读数且两者不同，否则无法保存。")
      );
    } else if (doorSource === "dual-event") {
      createLockEntityPickerButton("开门事件实体", "doorOpenEntityId", item, {
        deviceKind: "lock-event"
      });
      createLockEntityPickerButton("关门事件实体", "doorCloseEntityId", item, {
        deviceKind: "lock-event"
      });
      currentContainerElement.append(
        createElement("p", "i3d-note", "双事件需绑定两个不同的事件实体，否则无法保存。")
      );
    }
    createLockEntityPickerButton("低电量", "lowBatteryEntityId", item, { deviceKind: "lock-aux" });
    createLockEntityPickerButton("防拆", "tamperEntityId", item, { deviceKind: "lock-aux" });
    // 自动识别：identifyLockEntities 只在「每个槽位恰好命中一个」时回填，命中多个宁可留空，
    currentContainerElement.append(
      createButton("自动识别实体", () => {
        const candidateEntities = lockCandidateEntities();
        const detectedRoles = identifyLockEntities(candidateEntities);
        let filledCount = 0;
        for (const entityField of LOCK_ENTITY_FIELDS) {
          if (detectedRoles[entityField]) {
            item[entityField] = detectedRoles[entityField];
            filledCount += 1;
          }
        }
        if (autoFillSensorDoorState(item, candidateEntities)) {
          filledCount += 1;
        }
        if (!filledCount) {
          errorMessageElement.textContent =
            "未识别到可用实体，请确认设备已上报 device_class，或手动选择。";
          return;
        }
        markPropertiesDirty();
        renderPanel();
      })
    );
    currentContainerElement = previousContainerElement;
    // 门扇动作：按门型选 rig，与 lock-motion.js 的三类骨架一一对应。
    createSectionHeading("门扇动作");
    const motionGridElement = createElement("div", "i3d-security-grid i3d-lock-motion-grid");
    currentContainerElement.append(motionGridElement);
    currentContainerElement = motionGridElement;
    const isHingeDoor = LOCK_HINGE_DOOR_TYPES.includes(doorType);
    const isDoubleDoor = doorType === "double";
    const isSlidingDoor = doorType === "sliding-glass";
    if (isHingeDoor) {
      createSelectField(
        "铰链方向",
        [
          ["left", "左开"],
          ["right", "右开"]
        ],
        // 没写过 hinge 时显示门模型的设置（舞台就是按「绑定值 → 门模型 → 左开」三级兜底的），
        item.hinge || doorModel?.hinge || "left",
        nextHinge => {
          item.hinge = nextHinge;
          markPropertiesDirty();
        }
      );
    }
    if (isHingeDoor || isDoubleDoor) {
      createSelectField(
        isDoubleDoor ? "双扇开启方向" : "开门方向",
        [
          ["1", "内开"],
          ["-1", "外开"]
        ],
        String(item.openDirection ?? 1),
        nextDirection => {
          item.openDirection = Number(nextDirection);
          markPropertiesDirty();
        }
      );
    }
    if (isSlidingDoor) {
      createSelectField(
        "滑动方向",
        [
          ["1", "向右收起"],
          ["-1", "向左收起"]
        ],
        String(item.openDirection ?? 1),
        nextDirection => {
          item.openDirection = Number(nextDirection);
          markPropertiesDirty();
        }
      );
    }
    if (isHingeDoor || isDoubleDoor) {
      createNumberField(
        "开门角度",
        item.openAngle ?? 80,
        10,
        110,
        nextAngle => {
          item.openAngle = nextAngle;
        },
        1
      );
    }
    if (doorType === "roller-shutter") {
      currentContainerElement.append(
        createElement("p", "i3d-note", "卷帘门按上下卷收，不使用左右铰链或内外开方向。")
      );
    }
    createNumberField(
      "动画时长（秒）",
      item.duration ?? 0.7,
      0.2,
      3,
      nextDuration => {
        item.duration = nextDuration;
      },
      0.1
    );
    // 标签外观：图标 / 标签显示为一行，尺寸另起。
    const appearanceSectionElement = createSectionHeading("标签外观");
    const appearanceGridElement = createElement(
      "div",
      "i3d-security-grid i3d-lock-appearance-grid"
    );
    appearanceSectionElement.append(appearanceGridElement);
    const appearanceRowElement = createElement("div", "i3d-lock-appearance-row");
    appearanceGridElement.append(appearanceRowElement);
    currentContainerElement = appearanceRowElement;
    const iconPickerButtonElement = createButton(item.icon || "mdi:door-closed", async () => {
      const iconPickerGeneration = ++pickerGeneration;
      activePickerHandle?.close();
      try {
        const iconPickerHandle = await pickers.icon({
          trigger: iconPickerButtonElement,
          current: item.icon || "mdi:door-closed",
          deviceKind: "lock",
          onSelect(pickedIconId) {
            if (
              !isDisposed &&
              !!isAccessAllowed &&
              iconPickerGeneration === pickerGeneration &&
              findSelectedItem() === item
            ) {
              item.icon = pickedIconId || "mdi:door-closed";
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
    // 遮罩地址与 mdi 版本号只此一份（utils/icon-url.js）。
    applyMdiMask(iconMaskElement, item.icon || "mdi:door-closed");
    iconPickerButtonElement.textContent = "";
    iconPickerButtonElement.append(
      iconMaskElement,
      createElement("span", "", item.icon || "mdi:door-closed")
    );
    iconPickerButtonElement.setAttribute("aria-label", "门图标");
    const iconFieldElement = createElement("label");
    iconFieldElement.append(createElement("span", "", "图标"), iconPickerButtonElement);
    currentContainerElement.append(iconFieldElement);
    const labelModeFieldElement = createSelectField(
      "标签显示",
      [
        ["hidden", "隐藏标签"],
        ["always", "常驻显示"],
        ["open", "打开时显示"]
      ],
      item.labelMode || "always",
      nextLabelMode => {
        item.labelMode = nextLabelMode;
        delete item.labelHidden;
        markPropertiesDirty();
        renderPanel();
      }
    ).parentElement;
    labelModeFieldElement?.classList.add("i3d-lock-label-toggle");
    currentContainerElement = appearanceGridElement;
    createNumberField(
      "卡片大小（px）",
      item.size ?? 44,
      20,
      500,
      nextSize => {
        item.size = nextSize;
      },
      1
    );
    createNumberField(
      "文字大小（px）",
      item.fontSize ?? 12,
      8,
      100,
      nextFontSize => {
        item.fontSize = nextFontSize;
      },
      1
    );
    // 标签位置：缺省跟随门模型，数值一旦写入就覆盖模型坐标。
    const labelPositionSectionElement = createSectionHeading("标签位置");
    const labelPositionGridElement = createElement("div", "i3d-coordinate-grid");
    labelPositionSectionElement.append(labelPositionGridElement);
    currentContainerElement = labelPositionGridElement;
    for (const axisName of ["x", "y"]) {
      createNumberField(
        "位置 " + axisName.toUpperCase(),
        item[axisName] ?? doorModel?.[axisName] ?? 0,
        -1000000,
        1000000,
        nextAxisValue => {
          item[axisName] = nextAxisValue;
        },
        // 与上游 0.6.5 逐字一致：坐标按 0.01 步进（离地高度仍 0.1）。
        0.01
      );
    }
    createNumberField(
      "离地高度（米）",
      item.height ?? (doorModel?.height ?? 2.2) * 0.5,
      -1000,
      1000,
      nextHeight => {
        item.height = nextHeight;
      }
    );
    currentContainerElement = labelPositionSectionElement;
    const resetToModelButtonElement = createButton("恢复跟随模型", () => {
      delete item.x;
      delete item.y;
      delete item.height;
      markPropertiesDirty();
      renderPanel();
    });
    resetToModelButtonElement.disabled = !["x", "y", "height"].some(axisKey =>
      Number.isFinite(item[axisKey])
    );
    resetToModelButtonElement.className = "i3d-focus-reset";
    currentContainerElement.append(resetToModelButtonElement);
    currentContainerElement.append(
      createElement("p", "i3d-note", "仅调整门标记，不移动门模型。也可在预览中拖动标记。")
    );
    // 批量设置（门锁）：把外观 / 高度 / 同门型的动作设置套用到同楼层的其他门；
    const doorBatchSectionElement = createSectionHeading("批量设置");
    const doorBatchApplyButtonElement = createButton("一键应用到其他门", () =>
      openBatchApplyDialog(item)
    );
    doorBatchApplyButtonElement.className = "i3d-batch-apply-button";
    doorBatchApplyButtonElement.disabled = !getItemList().filter(
      otherItem => otherItem !== item && otherItem.floorId === selectedFloorId
    ).length;
    doorBatchSectionElement.append(
      doorBatchApplyButtonElement,
      createElement(
        "p",
        "i3d-note",
        "选择外观、高度或兼容门型的动作设置；保留模型、实体、坐标和视角。"
      )
    );
  }
  // 面板总渲染：整块替换子节点。选中项、折叠状态等界面状态都存在闭包变量里，
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
        ["presence", "人体传感器"],
        ["lock", "门"]
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
            boundItemProbe.floorId === selectedFloorId &&
            boundItemProbe.modelId === getCandidateModelId(modelProbe)
        )
    );
    const addModelSelectElement = createSelectField(
      "待添加" + getKindLabel() + "模型",
      addableModelList.map(modelOption => [
        getCandidateModelId(modelOption),
        modelOption.name
      ]),
      getCandidateModelId(addableModelList[0]),
      () => {}
    );
    const addItemButtonElement = createButton("添加" + getKindLabel(), () => {
      const addableModel = getFloorModelList().find(
        candidateModel => getCandidateModelId(candidateModel) === addModelSelectElement.value
      );
      if (
        !addableModel ||
        getItemList().some(
          existingItemProbe =>
            existingItemProbe.floorId === selectedFloorId &&
            existingItemProbe.modelId === getCandidateModelId(addableModel)
        )
      ) {
        return;
      }
      const newItem = {
        id: randomUuid(),
        floorId: selectedFloorId,
        modelId: getCandidateModelId(addableModel),
        entityId: "",
        label: addableModel.name || getKindLabel(),
        ...(securityKind === "camera"
          ? {
              size: 44,
              visible: true,
              icon: "mdi:cctv"
            }
          : securityKind === "lock"
            ? {
                // 门锁默认给一套「平开门」的合法动作参数（都在 lock.py 的区间内），
                doorSource: "sensor",
                // 不写 hinge：舞台取门轴是「绑定值 → 门模型自带 → 缺省左开」三级兜底
                openDirection: 1,
                openAngle: 80,
                duration: 0.7,
                size: 44,
                fontSize: 12,
                labelMode: "always",
                icon: "mdi:door-closed"
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
          securityKind === "lock"
            ? "本层没有可用的门模型，请先在 3D 户型图绘制中画门，或放置非「门框」的门模型。"
            : "本层没有" + getKindLabel() + "模型，请先在 3D 户型图绘制中增加模型。"
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
              otherBoundItem.modelId === getCandidateModelId(modelCandidate)
          )
      );
      const modelOptionList = modelChoices.map(availableModel => [
        getCandidateModelId(availableModel),
        availableModel.name
      ]);
      if (
        !modelChoices.some(
          matchedModel => getCandidateModelId(matchedModel) === selectedItem.modelId
        )
      ) {
        modelOptionList.unshift([
          selectedItem.modelId || "",
          selectedItem.modelId
            ? securityKind === "lock"
              ? "门模型已移除，请重新配置。"
              : "原模型已移除，请重新选择"
            : securityKind === "lock"
              ? "未关联门模型"
              : "未关联模型（保留原人在路线）"
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
          // 换模型后原聚焦视角多半已失效：摄像头与门锁都一并清掉，等用户重新设置。
          if (securityKind === "camera" || securityKind === "lock") {
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
      } else if (securityKind !== "lock") {
        // 门锁不挂这里的单实体选择器：它有「选择门设备」+ 五个槽位（锁 / 门磁 / 电量 /
        currentContainerElement.append(entityPickerButtonElement);
      }
      if (securityKind === "lock") {
        // 门锁面板自成一体（实体来源 → 门扇动作 → 标签外观 / 位置）：槽位按钮沿用同一套
        renderLockBindingPanel(selectedItem);
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
        // 遮罩地址与 mdi 版本号只此一份（utils/icon-url.js）。
        applyMdiMask(iconMaskElement, selectedItem.icon || "mdi:cctv");
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
          // 感应光圈：wave* 三项控制舞台地面感应光圈（presence-scene.js 的
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
          createSelectField(
            "人物方案",
            Object.entries(DESIGNS).map(([designKey, design]) => [designKey, design.name]),
            selectedItem.character || "traveler",
            nextCharacter => {
              selectedItem.character = nextCharacter;
              markPropertiesDirty();
              renderPanel();
            }
          );
          createSelectField(
            "人物颜色",
            [
              ["cyan", "青色"],
              ["orange", "橙色"]
            ],
            selectedItem.color || "cyan",
            nextColor => {
              selectedItem.color = nextColor;
              markPropertiesDirty();
              renderPanel();
            }
          );
          createNumberField(
            "人物缩放",
            selectedItem.size ?? 1,
            0.25,
            3,
            nextSize => {
              selectedItem.size = nextSize;
            },
            0.05,
            true
          );
          // 行走速度 / 点击聚焦 / 触控范围扩展归入「更多设置」折叠块：这三项属于可选参数，
          const advancedSettingsBodyElement = createDisclosure(
            "更多设置",
            "presence-extra:" + selectedItem.id,
            waveSectionElement
          );
          const appearanceContainerElement = currentContainerElement;
          currentContainerElement = advancedSettingsBodyElement;
          createNumberField(
            "行走速度（米/秒）",
            selectedItem.speed ?? 0.45,
            0.1,
            2,
            nextSpeed => {
              selectedItem.speed = nextSpeed;
            },
            0.05,
            true
          );
          createToggleField(
            "点击人物聚焦",
            selectedItem.clickToFocus === true,
            nextClickToFocus => {
              selectedItem.clickToFocus = nextClickToFocus;
            }
          );
          createNumberField(
            "触控范围扩展（px）",
            selectedItem.hitPadding ?? 8,
            0,
            80,
            nextHitPadding => {
              selectedItem.hitPadding = nextHitPadding;
            },
            1,
            true
          );
          currentContainerElement = appearanceContainerElement;
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
      // 批量设置：与参考实现同一入口 —— 摄像头 / 人体传感器把当前项的外观字段套用到同楼层的
      if (securityKind !== "lock") {
        const batchSectionElement = createSectionHeading("批量设置");
        const batchTargetItemCount = getItemList().filter(
          candidateItem =>
            candidateItem !== selectedItem && candidateItem.floorId === selectedFloorId
        ).length;
        const batchApplyButtonElement = createButton("一键应用到其他" + getKindLabel(), () =>
          openBatchApplyDialog(selectedItem)
        );
        batchApplyButtonElement.className = "i3d-batch-apply-button";
        batchApplyButtonElement.disabled = !batchTargetItemCount;
        batchSectionElement.append(batchApplyButtonElement);
        batchSectionElement.append(
          createElement(
            "p",
            "i3d-note",
            "把当前" + getKindLabel() + "的外观设置套用到同楼层的其他" + getKindLabel() + "。"
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
            // 舞台上拖动标记写回坐标：摄像头的 "camera:<id>" 与门锁的 "lock:<id>"
            if (editEvent.action === "position") {
              const positionTargetMatch = /^(camera|lock):(.+)$/.exec(editEvent.id || "");
              const positionTargetList =
                positionTargetMatch?.[1] === "lock"
                  ? draftProperties.security.locks
                  : draftProperties.security.cameras;
              const editedPositionItem = positionTargetMatch
                ? positionTargetList.find(
                    positionMatch => positionMatch.id === positionTargetMatch[2]
                  )
                : null;
              if (
                editedPositionItem &&
                Number.isFinite(editEvent.x) &&
                Number.isFinite(editEvent.y)
              ) {
                editedPositionItem.x = editEvent.x;
                editedPositionItem.y = editEvent.y;
                markPropertiesDirty();
              }
            }
            if (editEvent.action === "focus-exited") {
              isCameraEditing = false;
              renderPanel();
            }
            if (
              editEvent.action === "select" &&
              /^(camera|presence|lock):/.test(editEvent.id || "")
            ) {
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
  document.head.append(styleSheetLinkElement, securityStyleLinkElement);
  document.body.append(editorDialogElement);
  editorDialogElement.showModal();
  renderPanel();
  updatePreviewSize();
  mountEditorRuntime();
  return {
    close: closeEditor
  };
}
