/**
 * 3D 安防配置编辑器（摄像头、人体传感器与门锁共用一个弹窗）：与 config-editor.js 同构 —— 弹窗 +
 * 预览舞台（mountInteraction3d，editing=true）+ 草稿。
 *
 * 三种编辑对象共用同一面板，只靠 getCollectionKey / getKindLabel 区分：摄像头（位置、朝向、焦距、
 * 点击行为等）、人体传感器（触发模式与探测路线；路线编辑会打开 presence-editor.js 子编辑器，
 * 期间本编辑器主动卸载预览运行时，一个容器只挂一个）与门锁（把 HA 的门锁 / 门磁实体绑到场景里
 * 一扇已经画好的门上，再调门扇开合与标签）。
 * 约定：保存通过 onSave 交给宿主落库（本模块不发保存请求），脏标记沿用 editor-save-status 的签名
 * 比较口径，退出前用同一套文案确认。对外只导出 openSecurityEditor。
 *
 * 门锁的字段口径一律不自造：五个实体槽位（锁 / 门磁 / 电量 / 低电量 / 防拆）、三种门磁来源
 * （sensor / single-event / dual-event）与开合折算全部来自 lock-state.js（实现只有 bridge 那一份），
 * 后端再按 lock.py 复核。三处必须逐字一致，否则会出现「编辑器能填、保存被拒」或「配好了、舞台不动」。
 * 可选的门模型同样不自造：舞台快照的 doors 就是 lock-state.js 的 doorModels 展开的清单（与舞台
 * 收集门锁绑定同一份），本文件只过滤掉不能承载动画的 frame-only 门。
 * 注意 lock.py 会把门型（doorType）等已挪到户型图模型上的字段从绑定里丢弃，所以门型只从选中的
 * 门模型读取，绝不写回绑定。
 */
import {
  PRESENCE_TRIGGER_MODES,
  presenceTriggerIsTimed
} from "../presence/presence-motion.js?v=2609260929";
import { mountInteraction3d } from "../core/runtime.js?v=2609260929";
import { openPresenceEditor } from "../presence/presence-editor.js?v=2609260929";
// 人物方案表（traveler / bean / glow）与 3D 侧 createWalker 用的是同一份：批量设置里的
// 「人物方案」选项与展示文案都从这里取，绝不另抄一份。
import { DESIGNS } from "../presence/presence-character.js?v=2609260929";
// 跨域批量应用对话框：config-editor 与本编辑器共用同一实现（本文件只提供字段描述表与目标集合）。
import { copyBatchFields, openBatchApply } from "../editor/batch-apply.js?v=2609260929";
import {
  EDITOR_SAVE_STATUS,
  serializeEditorDraft
} from "../core/editor-save-status.js?v=2609260929";
import { applyMdiMask } from "../core/static-helpers.js?v=2609260929";
// 门锁状态与槽位顺序从 lock-state.js 取（它本身只是运行侧的薄转出口）：面板上的「当前状态」
// 与舞台动画必须同一口径，所以绝不在本文件里重写状态映射。
import { LOCK_ENTITY_FIELDS, lockState } from "./lock-state.js?v=2609260929";
import {
  confirmAction,
  createDomFactory,
  identifyLockEntities,
  interaction3dPreviewSize,
  lockEntityRole,
  randomUuid,
  requestInteraction3dAccess,
  subscribeInteraction3dAccess
} from "../core/static-helpers-editor.js?v=2609260929";

// doorSource 的取值与中文名，逐字对照 lock.py 的 `("sensor", "single-event", "dual-event")`。
// 参考实现里的 `always` 在本项目后端会被判非法，故不提供。面板选项与打开时的归一都用这一份表。
const LOCK_DOOR_SOURCE_OPTIONS = [
  ["sensor", "门磁传感器"],
  ["single-event", "单事件门磁"],
  ["dual-event", "双事件门磁"]
];
const LOCK_DOOR_SOURCE_VALUES = LOCK_DOOR_SOURCE_OPTIONS.map(([doorSourceValue]) => doorSourceValue);
// 绑定里的门模型 ID 一律写成 door:<id>：后端 lock.py 会剥掉前缀再写回，舞台也按这个前缀把绑定
// 匹配回门模型。lock-state.js 的 doorModels 给出的 modelId 理论上已经是这个形式（早期配置可能
// 写成 door:door:x），这里统一兜一次前缀 —— 少了它就会出现「编辑器里选得中、保存被判非法」。
const normalizeDoorModelId = modelId => {
  const rawModelId = String(modelId || "").replace(/^(?:door:)+/, "");
  return rawModelId ? "door:" + rawModelId : "";
};
// 各实体槽位在「device_class 未知」时的兜底域白名单：HA 目录条目本身不带 device_class
// （要实时状态才有），没有状态时至少按域把候选框到可能的范围。
const LOCK_FIELD_DOMAINS = {
  entityId: ["lock"],
  doorEntityId: ["binary_sensor"],
  batteryEntityId: ["sensor"],
  lowBatteryEntityId: ["binary_sensor"],
  tamperEntityId: ["binary_sensor"],
  doorEventEntityId: ["event"],
  doorOpenEntityId: ["event"],
  doorCloseEntityId: ["event"]
};
// 门型 → 用哪套「动作」控件（与 lock-motion.js 的 rig 划分一致）：
// 平开门用铰链 + 内外开 / 开角；双开门用开合方向 + 开角；推拉门用滑动方向；
// 卷帘门按上下卷收，不用左右铰链或内外开方向；frame-only 不能承载门锁动画（后端也拒绝）。
const LOCK_HINGE_DOOR_TYPES = ["entry", "solid", "glass"];
// 「批量设置」的字段描述表：与 0.6.5 参考实现同一张表 —— 摄像头走图标 / 尺寸组，
// 人体传感器（存在感应）走感应光圈 + 人物外观组。key 一律用本仓运行时既有字段名
// （presence-scene.js / presence-editor.js 的读法），值交给 batch-apply 的 copyBatchFields 原样写入。
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
// 标签显示），labelMode 沿用面板的写入口径 —— 写三态的 labelMode 同时清掉旧的 labelHidden。
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
// doorTypeOf(target) === doorTypeOf(source)，不是「同族」—— 平开门（solid/entry/glass）只与
// 同一种平开门兼容，双开门 / 推拉门 / 卷帘门 / 仅门框同理；跨门型时动作参数没有对应关系，
// compatible 一律返回 false，绝不无条件写入。哪些动作字段出现则由源门型决定（见 openBatchApplyDialog）。
// optional 的三项（行走速度 / 点击人物聚焦 / 触控范围扩展）在批量弹窗里默认不勾选，
// 避免把某台传感器个性化的行走参数误套到其它传感器上。
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
 * 先取编辑授权，再建弹窗与预览舞台；舞台回报场景元数据后才渲染面板
 * （可选项来自场景，未就绪时面板只能显示加载态）。
 */
export async function openSecurityEditor({
  component: component,
  panelDocument: documentApi,
  entities: entities = [],
  // 实时状态：门锁面板的「门锁状态」要用它折算。宿主不一定传（传了才有实时读数；没传时
  // lockState 会按「一条可用实体都没有」折算成未知态，绝不编造读数）。运行时状态表允许 Map
  // 或普通对象，lockState 两种都收。
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
  // 后端 lock.py 保存时也会直接丢弃；这里打开就清掉，免得它们跟着草稿签名反复「变脏」。
  // labelHidden 是旧字段，新配置统一写三态的 labelMode。modelId 统一成 door:<id>
  // （舞台按这个前缀把绑定匹配回门模型，老配置可能没写前缀，甚至写成 door:door:<id>）。
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
    "/api/v1/modules/interaction3d/core/runtime.css?v=2609260929";
  // 门锁编辑面板的专属样式（实体选择器行、动作 / 外观栅格）单独一张表：它只服务本编辑器，
  // 不进 stage.css —— 那是舞台的样式，展示页与工作室都会加载，编辑器专属规则混进去会外溢。
  const securityStyleLinkElement = createElement("link");
  securityStyleLinkElement.rel = "stylesheet";
  securityStyleLinkElement.href =
    "/api/v1/modules/interaction3d/security/security-editor.css?v=2609260929";
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
  // 「批量设置」弹窗句柄：编辑器关闭时要一并摘掉，否则会留下一个脱离弹窗的模态层。
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
    securityKind === "camera" ? "摄像头" : securityKind === "lock" ? "门锁" : "人体传感器";
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
  // 与舞台收集门锁绑定用的是同一份），这里只做一次「frame-only 不能承载门锁动画」的过滤
  // （后端 require_lock_model 也会拒绝这种门）。快照没带 doors 时退化成空清单，不会误报可选门。
  const getFloorDoorModels = () =>
    (findSelectedFloor()?.doors || []).filter(doorModel => doorModel.doorType !== "frame-only");
  // 该楼层上可用的同类型场景模型（映射用的候选）；找不到楼层时给空数组。
  // 门锁的候选不是 scene.items，而是上面的门模型清单，故单独走一条。
  const getFloorModelList = () =>
    securityKind === "lock" ? getFloorDoorModels() : findSelectedFloor()?.[getCollectionKey()] || [];
  // 模型候选的稳定 ID：摄像头 / 传感器用场景项 id，门模型用 doorModels 给的 modelId。
  // 绑定里 `modelId` 一律存这个值，与后端 lock.py 要求的 `door:` 前缀口径一致。
  const getCandidateModelId = candidateModel =>
    securityKind === "lock"
      ? normalizeDoorModelId(candidateModel?.modelId)
      : candidateModel?.id || "";
  // 按 modelId 回查本层的门模型：门型（用哪套动画控件）与缺省坐标都从它取。
  // 两边都过一遍 normalizeDoorModelId：绑定里存的是带前缀的形式，快照给的门模型 ID 理论上
  // 也是，但老场景可能少了前缀 —— 少这一步就会把「门模型还在」误判成「已移除」。
  const findDoorModelForItem = item =>
    getFloorDoorModels().find(
      doorModel => normalizeDoorModelId(doorModel.modelId) === item?.modelId
    );
  // 配置项的稳定标识：三类设备的 id 可能重名，拼上类型前缀后作为 3D 侧命令的目标 ID
  // （门锁与 binding-collectors.js 的 "lock:" + id 逐字一致）。
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
  // 布尔开关行（存在感应外观的「点击人物聚焦」）：与 presence-editor.js 的开关同构 ——
  // label 内放「文字 + checkbox」，改动即写回草稿并标脏。
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
   * 字段描述表按安防类别取（摄像头 / 人体传感器 / 门锁各一组）；目标集合 = 当前楼层、同集合里的
   * 其他项，只覆盖勾选的字段 —— 实体 / 模型 / 名称 / 路线 / 坐标（门锁另加视角 focusCamera）
   * 一律保留（batch-apply 只写描述表里列出的 key）。门锁的动作类字段另带 compatible 谓词，
   * 仅在目标门与源门「门型逐字相等」时写入（doorTypeOf(target) === doorTypeOf(source)；按目标判定）。
   */
  function openBatchApplyDialog(sourceItem) {
    if (isDisposed || !isAccessAllowed || isSaving || isCameraEditing || isPresenceEditorOpen) {
      return;
    }
    // 源快照：把「高度」这类未显式落库的字段先按各自面板的默认值补齐，
    // 批量弹窗展示的当前值才与面板所见一致（摄像头 0.15 米；门锁 = 门高的一半）。
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
      // 门型逐字读取（读不到门模型时按平开门 "solid" 处理，与门锁面板同一缺省）。
      const doorTypeOf = candidateItem =>
        findDoorModelForItem(candidateItem)?.doorType || "solid";
      const sourceDoorType = doorTypeOf(sourceItem);
      // 字段是否出现由源门型决定（逐条硬条件）：
      //   平开门 solid / entry / glass → 开门角度 + 开门方向 + 铰链方向
      //   双开门 double               → 开门角度 + 开门方向
      //   玻璃推拉门 sliding-glass     → 开门方向
      //   卷帘门 roller-shutter / 仅门框 frame-only → 三个动作字段都不出现
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
          // compatible（`field.compatible(target)`），这里再按目标筛一遍是幂等的（无 compatible 的
          // 摄像头 / 人体传感器字段表筛完仍是原表，行为不变），只为把「逐目标过滤」的语义写在明面上。
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
  // 没有权限就不应继续渲染或编辑；此时不自动重挂，等用户重新获取授权。
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
  // ---------------------------------------------------------------------------
  // 门锁编辑：实体槽位、门磁来源、门扇动作与标签。字段口径全部来自 lock-state.js / lock.py，
  // 本段只负责把它们摆成控件，不新增语义。
  // ---------------------------------------------------------------------------

  // 从运行时状态表里取一条状态：states 允许 Map（运行时下发）或普通对象（编辑器直接注入）。
  const readLockStateEntry = entityId =>
    entityId ? (states instanceof Map ? states.get(entityId) : states?.[entityId]) : null;
  // 目录条目自带 device_class 时优先用它，没有就看实时状态的 attributes ——
  // 与 lockEntityRole 读取这三个字段的顺序保持一致。
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
  // 某个槽位的候选实体：device_class 已知时交给 lockEntityRole（唯一权威口径）；
  // 未知时退回域白名单，至少不把完全无关的实体塞进下拉。
  const lockFieldCandidates = field =>
    entities.filter(entity => {
      if (isLockEntityDisabled(entity)) {
        return false;
      }
      return lockEntityDeviceClass(entity)
        ? lockEntityRole(entity, field)
        : (LOCK_FIELD_DOMAINS[field] || []).includes(String(entity.entityId || "").split(".")[0]);
    });
  // 把实体清单补成 lockEntityRole 能吃的形状，供「自动识别」一键回填五个槽位。
  const lockCandidateEntities = () =>
    entities.map(entity => ({ ...entity, deviceClass: lockEntityDeviceClass(entity) }));
  // 实体下拉：候选 + 当前绑定（当前值已失效时也要能看见，否则用户以为配置丢了）。
  function createLockEntitySelect(labelText, field, item) {
    const optionEntries = lockFieldCandidates(field).map(entity => [
      entity.entityId,
      entity.name || entity.entityId
    ]);
    const currentValue = item[field] || "";
    if (currentValue && !optionEntries.some(([optionEntityId]) => optionEntityId === currentValue)) {
      optionEntries.unshift([currentValue, currentValue + "（当前绑定）"]);
    }
    const entitySelectElement = createSelectField(
      labelText,
      [["", "未绑定"], ...optionEntries],
      currentValue,
      nextEntityId => {
        if (nextEntityId) {
          item[field] = nextEntityId;
        } else {
          delete item[field];
        }
        markPropertiesDirty();
        renderPanel();
      }
    );
    // 门锁槽位下拉在窄栏里要占满一整行（标签 + 长实体名），单独打个类给 CSS 定位。
    entitySelectElement.parentElement?.classList.add("i3d-lock-entity-picker");
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
  // 单事件的两读数不同都有复核，残留字段会直接导致保存被拒。
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
    const statusParts = ["门锁状态：" + viewState.label + " · " + viewState.doorLabel];
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
  // 门锁的面板主体：实体 → 门扇动作 → 标签外观 / 位置。门型只从选中的门模型读，
  // 不写回绑定（lock.py 会把绑定里的 doorType 丢弃）。
  function renderLockBindingPanel(item) {
    const doorModel = findDoorModelForItem(item);
    const doorType = doorModel?.doorType || "solid";
    renderLockStatus(item);
    createLockEntitySelect("选择门锁实体", "entityId", item);
    currentContainerElement.append(
      createElement("p", "i3d-note", "锁实体须为 lock.* 域；门磁、电量、防拆都可选。")
    );
    // 自动识别：identifyLockEntities 只在「每个槽位恰好命中一个」时回填，命中多个宁可留空，
    // 避免把实体错绑到不确定的槽位。
    currentContainerElement.append(
      createButton("自动识别实体", () => {
        const detectedRoles = identifyLockEntities(lockCandidateEntities());
        let filledCount = 0;
        for (const entityField of LOCK_ENTITY_FIELDS) {
          if (detectedRoles[entityField]) {
            item[entityField] = detectedRoles[entityField];
            filledCount += 1;
          }
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
    // 门磁来源：选项就是 LOCK_DOOR_SOURCE_OPTIONS（后端 lock.py 的合法取值）；
    // 「不绑定门磁」= 删除 doorSource，后端按缺省 sensor 处理，但门磁实体为空时门开合就是未知。
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
      createLockEntitySelect("门磁实体", "doorEntityId", item);
    } else if (doorSource === "single-event") {
      createLockEntitySelect("事件实体", "doorEventEntityId", item);
      createLockTextField("事件属性", "doorEventAttribute", item, "event_type");
      createLockTextField("开门读数", "doorOpenValue", item, "open");
      createLockTextField("关门读数", "doorCloseValue", item, "closed");
      currentContainerElement.append(
        createElement("p", "i3d-note", "单事件需同时填写开门 / 关门读数且两者不同，否则无法保存。")
      );
    } else if (doorSource === "dual-event") {
      createLockEntitySelect("开门事件实体", "doorOpenEntityId", item);
      createLockEntitySelect("关门事件实体", "doorCloseEntityId", item);
      currentContainerElement.append(
        createElement("p", "i3d-note", "双事件需绑定两个不同的事件实体，否则无法保存。")
      );
    }
    // 辅助实体收进折叠块：不绑也能用，绑了面板更完整。
    const auxiliaryBodyElement = createDisclosure(
      "辅助实体（电量 / 防拆）",
      "lock-aux:" + item.id
    );
    const previousContainerElement = currentContainerElement;
    currentContainerElement = auxiliaryBodyElement;
    createLockEntitySelect("电量实体", "batteryEntityId", item);
    createLockEntitySelect("低电量实体", "lowBatteryEntityId", item);
    createLockEntitySelect("防拆实体", "tamperEntityId", item);
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
        // 用户不动它就不落进绑定，门模型改了也跟着改。
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
        }
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
      createElement("p", "i3d-note", "仅调整门锁标记，不移动门模型。也可在预览中拖动标记。")
    );
    // 批量设置（门锁）：把外观 / 高度 / 同门型的动作设置套用到同楼层的其他门；
    // 没有其他门时禁用，避免点开一个必然为空的弹窗。
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
        ["presence", "人体传感器"],
        ["lock", "门锁"]
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
                // 用户随后可按实际门型调整；门型本身不写进绑定。
                doorSource: "sensor",
                // 不写 hinge：舞台取门轴是「绑定值 → 门模型自带 → 缺省左开」三级兜底
                // （binding-collectors.js），门模型的 hinge 才是真正的来源。写死一个值
                // 反而会把户型图上的设置盖掉，用户只在面板里改过才该落进绑定。
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
        // 门锁不用单实体选择器：它有一整套槽位（锁 / 门磁 / 电量 / 低电量 / 防拆）与三种
        // 门磁来源，且本项目的实体选择器不认 lock 域。门锁面板在下面单独渲染。
        currentContainerElement.append(entityPickerButtonElement);
      }
      if (securityKind === "lock") {
        // 门锁没有 pickers 的 lock 分支可用：槽位候选由域过滤 + lockEntityRole 构造，
        // 因此这里调自成一体的门锁面板（实体来源 → 门扇动作 → 标签）。
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
          // 存在感应外观：wave* 三项控制舞台地面感应光圈（presence-scene.js 的
          // createPresenceWaves 直接读 waveEnabled / waveScale / waveOpacity），其余五项与
          // presence-editor.js 共用 character / color / size / speed / clickToFocus / hitPadding。
          const waveSectionElement = createSectionHeading("存在感应外观");
          createSelectField(
            "显示感应光圈",
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
            "光圈缩放",
            selectedItem.waveScale ?? 1,
            0.25,
            3,
            nextWaveScale => {
              selectedItem.waveScale = nextWaveScale;
            },
            0.05,
            true
          );
          createNumberField(
            "光圈不透明度（%）",
            selectedItem.waveOpacity ?? 68,
            0,
            100,
            nextWaveOpacity => {
              selectedItem.waveOpacity = nextWaveOpacity;
            },
            1,
            true
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
          // 与批量弹窗里的 optional 字段一一对应。
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
      // 其他同类项。门锁不走这里（其绑定字段与门模型强相关，无法脱离门型复制），面板保持原样。
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
  // 因此舞台上只有摄像头、人体传感器与门锁可交互（门锁标记可拖动，拖完写回绑定坐标）。
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
            // （与 binding-collectors.js 的 id 口径一致）都落在同一处理里。
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
