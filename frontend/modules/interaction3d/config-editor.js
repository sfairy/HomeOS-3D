/**
 * 3D 控件的配置编辑器（弹窗形态，挂着在宿主页上）。
 *
 * 位置：interaction3d 子系统的「编辑侧」。它不直接操作 three.js，而是复用
 * runtime.js 的 mountInteraction3d 在弹窗里挂一个 editing=true 的预览舞台，
 * 用户在舞台上点选 / 拖拽标记，编辑器把结果写进草稿（draftProperties）。
 *
 * 职责划分：
 *   - 草稿：所有编辑都只改 draftProperties；保存时把整份快照交给 onSave 回调
 *     （真正的落库与 revision 冲突处理在宿主侧，本模块不直接发保存请求）；
 *   - 脏标记：isDirty = 草稿签名 ≠ 已保存签名，退出前用站内确认框拦一次；
 *   - 权限：通过 bridge 的 requestInteraction3dAccess / subscribeInteraction3dAccess 取
 *     编辑授权，未授权时面板 inert 且不可保存。
 *
 * 对外导出：
 *   - openInteraction3dEditor(options)：配置编辑器（灯光 / 空调 / 窗帘 / 电视 / NAS / 扫地机等）；
 *   - openInteraction3dAppearanceEditor(options)：整体外观（baseLighting）编辑器。
 *
 * 字段约定：草稿结构与后端下发的 component.properties 完全一致（camelCase），
 * 落库后由后端的面板文档校验层把关；本模块只负责收集、不做合法性兜底。
 */
import { vacuumMapIdentity } from "./vacuum-map.js?v=20260918233037";
import { openInteraction3dRangeEditor } from "./range-dialog.js?v=20260918233037";
import { mountInteraction3d } from "./runtime.js?v=20260918233037";
import { lightState } from "./light-state.js?v=20260918233037";
import { openVacuumMapEditor } from "./vacuum-map-editor.js?v=20260918233037";
import { nasGroups } from "./nas-panel.js";
import { randomUuid } from "/static/utils/random-id.js?v=20260918233037";
import { interaction3dPreviewSize } from "/static/modules/interaction3d/preview-layout.js?v=20260918233037";
import {
  requestInteraction3dAccess,
  getInteraction3dEditorView,
  subscribeInteraction3dAccess
} from "/static/modules/interaction3d/bridge.js?v=20260918233037";
import { normalizeInteraction3dLightingMode } from "/static/modules/interaction3d/definition.js?v=20260918233037";
import {
  DEFAULT_BASE_LIGHTING,
  normalizeBaseLighting
} from "/static/3d-studio/studio-normalization.js?v=20260918233037";
import {
  EDITOR_SAVE_STATUS,
  editorDraftHasChanges,
  serializeEditorDraft
} from "./editor-save-status.js?v=20260918233037";
import { confirmAction } from "/static/ui-confirm.js?v=20260918233037";
// 外观编辑器的分组定义：每组为 [分组名, [字段名, 中文标签, 最小值, 最大值, 步进]]，
// 字段名与 studio 的 baseLighting 一一对应，范围取值对应真实可用光照区间。
const APPEARANCE_GROUPS = [
  [
    "整体",
    [
      ["曝光", "exposure", 0.5, 2, 0.05],
      ["半球光", "hemisphereIntensity", 0, 3, 0.05],
      ["环境光", "ambientIntensity", 0, 2, 0.05]
    ]
  ],
  [
    "主光与阴影",
    [
      ["强度", "mainIntensity", 0, 5, 0.05],
      ["水平角", "mainAzimuth", -180, 180, 5],
      ["高度角", "mainElevation", 5, 89, 5],
      ["阴影浓度", "mainShadowIntensity", 0, 1, 0.05]
    ]
  ],
  [
    "侧面补光",
    [
      ["强度", "fillIntensity", 0, 3, 0.05],
      ["水平角", "fillAzimuth", -180, 180, 5],
      ["高度角", "fillElevation", 0, 89, 5]
    ]
  ],
  [
    "顶部补光",
    [
      ["强度", "topIntensity", 0, 3, 0.05],
      ["水平角", "topAzimuth", -180, 180, 5],
      ["高度角", "topElevation", 0, 89, 5]
    ]
  ]
];
/**
 * 打开 3D 控件配置编辑器。
 *
 * 流程：先取编辑授权 → 建弹窗骨架 → 挂预览舞台运行时 → 等舞台 ready 后渲染面板。
 * 弹窗以 dialog.showModal() 打开，关闭时整体释放（含舞台 iframe）。
 *
 * @param {object} options 配置项：
 *     component 控件描述（properties 为被编辑的 3D 配置，草稿从它克隆）；
 *     document 户型文档 API；entities / states 实体与状态；pickers 选择器工厂；
 *     onSave 保存回调，收到整份草稿快照；
 *     deviceKind 编辑对象类型（light / climate / cover / nas / television / vacuum…）；
 *     startAdding 打开后是否直接进「添加模型」弹窗；
 *     vacuumId 扫地机模式下要编辑的扫地机 ID；
 *     editingFloorId 初始楼层。
 * @returns {Promise<void>} 弹窗关闭后 resolve。
 */
export async function openInteraction3dEditor({
  component: component,
  document: documentApi,
  entities: entities = [],
  states: states,
  pickers: pickers,
  onSave: onSaveConfig,
  deviceKind: deviceKind = "light",
  startAdding: shouldStartAdding = false,
  vacuumId: vacuumId = "",
  editingFloorId: editingFloorId = ""
}) {
  await requestInteraction3dAccess();
  const isEnvironmentKind = ["environment", "climate", "cover"].includes(deviceKind);
  if (deviceKind === "environment") {
    deviceKind = "climate";
  }
  const isDeviceKind =
    deviceKind === "devices" || deviceKind === "nas" || deviceKind === "television";
  if (deviceKind === "devices") {
    deviceKind = "nas";
  }
  let isVacuumShortcutMode;
  let isVacuumMode;
  let usesStatusPanel;
  let isTelevisionMode;
  let isClimateMode;
  let isCoverMode;
  let isNasMode;
  let usesModelBinding;
  let kindLabel;
  let editorKindTitle;
  let collectionKey;
  let defaultIcon;
  let modelIdKey;
  // 由 deviceKind 集中推导所有模式开关与文案（kindLabel / collectionKey / defaultIcon /
  // modelIdKey 等），避免这些判断散落到各处导致新增类型时漏改。
  function applyKindFlags(nextKind) {
    deviceKind = nextKind;
    isVacuumShortcutMode = deviceKind === "vacuum-shortcut";
    isVacuumMode = deviceKind === "vacuum";
    usesStatusPanel = isDeviceKind || isVacuumMode || isVacuumShortcutMode;
    isTelevisionMode = deviceKind === "television";
    isClimateMode = deviceKind === "climate";
    isCoverMode = deviceKind === "cover";
    isNasMode = deviceKind === "nas";
    usesModelBinding =
      isClimateMode ||
      isCoverMode ||
      isNasMode ||
      isTelevisionMode ||
      isVacuumMode ||
      isVacuumShortcutMode;
    kindLabel = isVacuumShortcutMode
      ? "快捷指令"
      : isVacuumMode
        ? "扫地机"
        : isDeviceKind
          ? "设备"
          : isCoverMode
            ? "窗帘"
            : isClimateMode
              ? "空调"
              : "灯光";
    editorKindTitle = isEnvironmentKind ? "环境" : isVacuumShortcutMode ? "扫地机" : kindLabel;
    collectionKey =
      isVacuumMode || isVacuumShortcutMode
        ? "vacuums"
        : isTelevisionMode
          ? "televisions"
          : isNasMode
            ? "nas"
            : isCoverMode
              ? "curtains"
              : "airConditioners";
    defaultIcon = isVacuumShortcutMode
      ? "mdi:broom"
      : isVacuumMode
        ? "mdi:robot-vacuum"
        : isTelevisionMode
          ? "mdi:television"
          : isNasMode
            ? "mdi:nas"
            : isCoverMode
              ? "mdi:curtains"
              : isClimateMode
                ? "mdi:air-conditioner"
                : "mdi:lightbulb-outline";
    modelIdKey = usesModelBinding ? "modelId" : "groupId";
  }
  applyKindFlags(deviceKind);
  // 列表里显示某个配置项的名字：没有名字就退回类型名，保证列表不留空白。
  const describeItem = describableItem =>
    describableItem.name || describableItem.label || kindLabel;
  // 点击行为白名单化：不同模块允许的动作集合不同，非法值一律回落到该模块的默认动作
  // （带状态面板的模块默认 focus-panel），这样旧配置也能安全打开。
  const normalizeClickAction = rawClickAction =>
    usesStatusPanel
      ? ["focus", "focus-panel", "panel"].includes(rawClickAction)
        ? rawClickAction
        : "focus-panel"
      : isCoverMode
        ? rawClickAction === "panel"
          ? "panel"
          : "focus"
        : ["turn-on-focus", "turn-on", "turn-on-panel"].includes(rawClickAction)
          ? rawClickAction
          : "focus";
  // 编辑器样式直接引运行时的 runtime.css：编辑器只在打开时注入这一份样式，
  // 展示页就不必为了弹窗多加载一个 CSS 文件；关闭时随弹窗一起移除。
  const styleSheetLinkElement = document.createElement("link");
  styleSheetLinkElement.rel = "stylesheet";
  styleSheetLinkElement.href =
    "/api/v1/modules/interaction3d/runtime.css?v=20260918233037";
  document.head.append(styleSheetLinkElement);
  // 建元素小工具，文本一律走 textContent，不拼 HTML。
  const createElement = (tagName, classNames, initialText) => {
    const createdElement = document.createElement(tagName);
    createdElement.className = classNames || "";
    if (initialText) {
      createdElement.textContent = initialText;
    }
    return createdElement;
  };
  // 按钮一律显式 type="button"：弹窗内的按钮不写 type 会默认 submit，
  // 回车键就会误触发第一个按钮。
  const createButton = (buttonLabel, onButtonClick) => {
    const buttonElement = createElement("button", "", buttonLabel);
    buttonElement.type = "button";
    buttonElement.addEventListener("click", onButtonClick);
    return buttonElement;
  };
  const editorDialogElement = createElement("dialog", "i3d-editor");
  editorDialogElement.setAttribute("aria-label", "3D " + editorKindTitle + "配置");
  editorDialogElement.setAttribute("data-i3d-preview-scope", "");
  editorDialogElement.className += " i3d-unified-settings";
  const headerElement = createElement("header");
  const bodyElement = createElement("div", "i3d-editor-body");
  const viewElement = createElement("div", "i3d-editor-view");
  const panelElement = createElement("aside");
  const aspectBoxElement = createElement("div", "i3d-editor-aspect");
  const stageHostElement = createElement("div", "i3d-editor-stage");
  const statusElement = createElement("p", "i3d-editor-status");
  statusElement.setAttribute("role", "status");
  aspectBoxElement.append(stageHostElement);
  viewElement.append(aspectBoxElement, statusElement);
  const errorMessageElement = createElement("p", "i3d-error");
  errorMessageElement.setAttribute("role", "status");
  // 草稿副本：编辑器只改它，组件本体直到保存成功才被宿主更新。
  // 深拷贝是必要的 —— 直接改 component.properties 会让「取消编辑」无法回退。
  let draftProperties = structuredClone(component.properties || {});
  let selectedItemId = "";
  let sceneMetadata = null;
  let editorRuntime = null;
  let isDisposed = false;
  // 默认先放行：真正的授权结果由 bridge 的回调异步确认；
  // 在拿到结果前面板是 inert 的，因此默认值不会造成越权操作。
  let isAccessAllowed = true;
  let selectedFloorId =
    editingFloorId ||
    (draftProperties.floorSelection !== "all" ? draftProperties.floorSelection : "");
  draftProperties.lightingMode = normalizeInteraction3dLightingMode(draftProperties.lightingMode);
  let isRangeEditorOpen = false;
  let subEditorHandle = null;
  let vacuumCameraMode = "focus";
  // 正在调整视角：此时草稿里的相机还是旧的，所以禁止保存（见保存按钮的前置条件）。
  let isCameraEditing = false;
  // 有相机指令在途：期间禁止保存与再次下发，避免把中间视角存进草稿。
  let isCameraCommandPending = false;
  // 等待回写的视角草稿：舞台回传 camera 事件后写入 floorCameras。
  let pendingCameraDraft = null;
  // 场景就绪代次：舞台重载或权限收回时自增，用于作废在途的回调。
  let sceneReadyGeneration = 0;
  // 相机指令串行队列：舞台一次只处理一条视角指令，串起来才能保证先后顺序，
  // 否则并发下发会让视角互相覆盖。
  let cameraCommandQueue = Promise.resolve();
  let addDialogState = null;
  let pickerHandle = null;
  // 选择器代次：选择器关闭 / 重开时自增，用于丢弃过期选择回调。
  let pickerGeneration = 0;
  let isEffectDetailsOpen = false;
  // 保存中：防重复提交，也让状态文案不被其它流程覆盖。
  let isSaving = false;
  // 是否有未保存改动；退出确认与保存按钮可用性都看它。
  let isDirty = false;
  // 变更代次：每次草稿实质性变化自增，异步回调据此判断自己处理的是否仍是最新一轮，
  // 避免（例如）上一轮场景就绪的渲染覆盖掉刚做的编辑。
  let changeRevisionCount = 0;
  // 最近一次实体状态：面板上的只读状态展示与能力探测（色温上下限等）都从这里取。
  let latestStates = null;
  // 先占位成空函数，稍后由 renderPanel 按当前编辑类型赋上真实实现
  // （没有选中项时会再被打回空函数），因此任何时刻调用都必须安全。
  let refreshEffectSettings = () => {};
  // 设备 → 实体列表索引：状态面板要按设备聚合实体（同设备的多个实体合并展示），
  // 预建索引避免每次渲染都重新遍历。
  const devicesByDeviceId = new Map();
  // 找到当前编辑的扫地机配置项（快捷指令模式下它的 shortcuts 才是编辑对象）。
  const findVacuumModel = () =>
    draftProperties.devices?.vacuums?.find(vacuumModelProbe => vacuumModelProbe.id === vacuumId);
  // 当前编辑对象的配置数组。四种编辑模式各取一处：扫地机快捷指令、状态面板类设备、
  // 模型绑定类设备、灯光；其余代码只认这一份列表，不再各自判断模式。
  const getItemList = () =>
    isVacuumShortcutMode
      ? findVacuumModel()?.shortcuts || []
      : usesStatusPanel
        ? draftProperties.devices[collectionKey]
        : usesModelBinding
          ? draftProperties.environment[collectionKey]
          : draftProperties.lights;
  // getItemList 的写入侧：把（可能整组替换的）列表写回同一处。
  // 每层都先确认容器存在，避免在旧配置上凭空补出一个新字段。
  const setItemList = nextItemList => {
    if (isVacuumShortcutMode) {
      if (findVacuumModel()) {
        findVacuumModel().shortcuts = nextItemList;
      }
    } else if (usesStatusPanel) {
      draftProperties.devices[collectionKey] = nextItemList;
    } else if (usesModelBinding) {
      draftProperties.environment[collectionKey] = nextItemList;
    } else {
      draftProperties.lights = nextItemList;
    }
  };
  // 补齐各配置集合（旧版本的配置可能缺 devices / environment 等），
  // 让后续代码不必到处写可选链兜底。
  function ensureItemCollections() {
    if (usesStatusPanel) {
      draftProperties.devices = {
        ...draftProperties.devices,
        [collectionKey]: draftProperties.devices?.[collectionKey] || []
      };
    }
    if (usesModelBinding && !usesStatusPanel) {
      draftProperties.environment = {
        ...draftProperties.environment,
        dimStrength: Number.isFinite(draftProperties.environment?.dimStrength)
          ? Math.max(0, Math.min(100, draftProperties.environment.dimStrength))
          : 70,
        [collectionKey]: draftProperties.environment?.[collectionKey] || []
      };
    }
    if (isVacuumShortcutMode) {
      for (const vacuumModelItem of draftProperties.devices.vacuums) {
        vacuumModelItem.shortcuts = (vacuumModelItem.shortcuts || []).map(vacuumShortcutItem =>
          vacuumShortcutItem.visible === false
            ? {
                ...vacuumShortcutItem,
                visible: true,
                buttonHidden: true,
                hiddenClickable: false
              }
            : vacuumShortcutItem
        );
      }
    }
    vacuumId ||= draftProperties.devices?.vacuums?.[0]?.id || "";
    if (isVacuumMode) {
      selectedItemId = vacuumId;
    }
    setItemList(
      (getItemList() || [])
        .filter(visibleItemProbe => isVacuumShortcutMode || visibleItemProbe.visible !== false)
        .map(normalizedItem => {
          const resolvedButtonSize =
            Number.isFinite(normalizedItem.size) && normalizedItem.size > 0
              ? normalizedItem.size
              : 44;
          return {
            ...normalizedItem,
            size: resolvedButtonSize,
            visible: isVacuumShortcutMode ? normalizedItem.visible !== false : true,
            icon: normalizedItem.icon || defaultIcon,
            ...(usesModelBinding
              ? {}
              : {
                  fadeDuration: normalizedItem.fadeDuration ?? 0.3
                }),
            ...(isCoverMode
              ? {
                  coverKind: ["standard", "dream"].includes(normalizedItem.coverKind)
                    ? normalizedItem.coverKind
                    : "standard",
                  coverDirection: ["left", "right", "split"].includes(normalizedItem.coverDirection)
                    ? normalizedItem.coverDirection
                    : "auto",
                  curtainFabric: normalizedItem.curtainFabric === "sheer" ? "sheer" : "cloth",
                  unboundPosition: Number.isFinite(normalizedItem.unboundPosition)
                    ? Math.max(0, Math.min(100, normalizedItem.unboundPosition))
                    : 0
                }
              : {}),
            ...(isVacuumShortcutMode
              ? {}
              : {
                  clickAction: normalizeClickAction(normalizedItem.clickAction)
                }),
            iconSize:
              Number.isFinite(normalizedItem.iconSize) && normalizedItem.iconSize > 0
                ? normalizedItem.iconSize
                : Math.min(resolvedButtonSize, Math.max(4, resolvedButtonSize - 18))
          };
        })
    );
  }
  ensureItemCollections();
  // 已保存的草稿签名：脏标记的唯一参照物，保存成功后刷新。
  let savedDraftSignature = serializeEditorDraft(draftProperties);
  // 可批量套用的字段清单：[字段路径, 中文名, 单位]；路径支持 "a.b" 形式，
  // 由 readNestedPath 解析。清单随模块不同（状态面板类与灯光类字段完全不同）。
  const buildEditableFieldList = () =>
    usesModelBinding
      ? [
          ...(isVacuumMode ? [] : [["icon", "图标", ""]]),
          ["size", isVacuumMode ? "状态框缩放" : "按钮大小", isVacuumMode ? "%" : "px"],
          ["iconSize", isVacuumMode ? "文字大小" : "图标大小", "px"],
          ["hitSize", "点击范围", "px"],
          ["buttonVisibility", "按钮显示", ""],
          ...(isVacuumShortcutMode
            ? [
                ["fontSize", "文字大小", "px"],
                ["iconHidden", "隐藏图标", ""],
                ["labelHidden", "隐藏名称", ""]
              ]
            : [])
        ]
      : [
          ["size", "按钮大小", "px"],
          ["iconSize", "图标大小", "px"],
          ["hitSize", "点击范围", "px"],
          ["fadeDuration", "缓开缓灭", "秒"],
          ["effectDefaults.brightness", "默认亮度", "%"],
          ["effectDefaults.kelvin", "默认色温", "K"],
          ["effectRange.brightnessMin", "最暗亮度", "%"],
          ["effectRange.brightnessMax", "最亮亮度", "%"],
          ["effectRange.temperatureMin", "最低色温", "K"],
          ["effectRange.temperatureMax", "最高色温", "K"]
        ];
  let fieldDefs = buildEditableFieldList();
  // 基线快照：批量套用与「相对基线改了哪些字段」的提示都以它为参照，
  // 切换编辑类型或重新打开时会重建。
  let baselineItemsById = new Map(
    getItemList().map(baselinedItem => [baselinedItem.id, structuredClone(baselinedItem)])
  );
  const kindSessionsByKind = new Map();
  let auxDialogElement = null;
  // 同上，占位回调：真正实现由各类型面板在渲染时挂上，用于刷新批量操作按钮的可用性。
  let refreshBatchButtons = () => {};
  // 把配置项归一化成可比较的字段快照：缺省值都在这里补齐
  // （例如点击范围默认不小于按钮大小 44px），批量套用与脏字段比较都以这份快照为准。
  function buildItemPayload(item, lightStatus = getLightStatus(item)) {
    if (usesModelBinding) {
      return {
        icon: item.icon || defaultIcon,
        size: item.size ?? 44,
        iconSize: item.iconSize ?? 26,
        hitSize: item.hitSize ?? Math.max(44, item.size ?? 44),
        ...(isVacuumShortcutMode
          ? {
              fontSize: item.fontSize ?? 12,
              iconHidden: item.iconHidden === true,
              labelHidden: item.labelHidden === true
            }
          : {}),
        buttonVisibility:
          item.buttonHidden === true
            ? "隐藏（不可点击）"
            : item.hiddenClickable === true
              ? "隐藏（可点击）"
              : "显示"
      };
    } else {
      return {
        size: item.size ?? 44,
        iconSize: item.iconSize ?? 26,
        hitSize: item.hitSize ?? Math.max(44, item.size ?? 44),
        fadeDuration: item.fadeDuration ?? 0.3,
        effectDefaults: item.effectDefaults || {},
        effectRange: {
          brightnessMin: 1,
          brightnessMax: 100,
          temperatureMin: lightStatus.minimum,
          temperatureMax: lightStatus.maximum,
          ...item.effectRange
        }
      };
    }
  }
  // 按 "a.b.c" 取嵌套值，任一层缺失即返回 undefined。
  const readNestedPath = (targetObject, dottedPath) =>
    dottedPath
      .split(".")
      .reduce((pathAccumulator, pathSegment) => pathAccumulator?.[pathSegment], targetObject);
  // 列出相对基线发生变化的字段：基线在首次比较时惰性建立，
  // 用作「用户改了什么」的参照，也用于批量套用前的提示。
  function listChangedFields(changedItem) {
    if (!baselineItemsById.has(changedItem.id)) {
      baselineItemsById.set(changedItem.id, structuredClone(changedItem));
    }
    const changedStatus = getLightStatus(changedItem);
    const baselinePayload = buildItemPayload(baselineItemsById.get(changedItem.id), changedStatus);
    const currentPayload = buildItemPayload(changedItem, changedStatus);
    return fieldDefs.filter(
      ([payloadFieldName]) =>
        readNestedPath(baselinePayload, payloadFieldName) !==
        readNestedPath(currentPayload, payloadFieldName)
    );
  }
  // 把快照里选中的字段写回目标任务项。写空时要顺手删掉空壳对象，
  // 否则草稿里会残留 effectRange: {} 这种脏结构，落库后影响后端校验。
  function applyFieldValues(targetItem, sourcePayload, fieldNames) {
    for (const fieldKey of fieldNames) {
      if (fieldKey === "buttonVisibility") {
        targetItem.buttonHidden = sourcePayload.buttonVisibility === "隐藏（不可点击）";
        targetItem.hiddenClickable = sourcePayload.buttonVisibility === "隐藏（可点击）";
        continue;
      }
      const [parentFieldKey, nestedFieldKey] = fieldKey.split(".");
      if (!nestedFieldKey) {
        targetItem[parentFieldKey] = sourcePayload[parentFieldKey];
        continue;
      }
      targetItem[parentFieldKey] = {
        ...(parentFieldKey === "effectRange"
          ? buildItemPayload(targetItem).effectRange
          : targetItem[parentFieldKey])
      };
      if (sourcePayload[parentFieldKey][nestedFieldKey] === undefined) {
        delete targetItem[parentFieldKey][nestedFieldKey];
      } else {
        targetItem[parentFieldKey][nestedFieldKey] = sourcePayload[parentFieldKey][nestedFieldKey];
      }
      if (!Object.keys(targetItem[parentFieldKey]).length) {
        delete targetItem[parentFieldKey];
      }
    }
  }
  // 关闭辅助弹窗。指标选择与批量应用共用一个插槽，因此同时只允许存在一个。
  function closeAuxDialog() {
    auxDialogElement?.close();
    auxDialogElement?.remove();
    auxDialogElement = null;
  }
  // 打开「显示内容」弹窗（状态面板类模块）：勾选要展示的指标并允许调整顺序。
  // 前置条件里带 auxDialogElement 判空，保证同一时刻只有一个辅助弹窗。
  function openMetricsDialog(metricsTargetEntry) {
    const statusSource = metricsTargetEntry.statusSource;
    if (
      !statusSource ||
      isDisposed ||
      !isAccessAllowed ||
      isCameraEditing ||
      isCameraCommandPending ||
      auxDialogElement
    ) {
      return;
    }
    const visibleMetricIds = new Set(
      statusSource.visibleMetrics || statusSource.metrics.map(metricEntry => metricEntry.entityId)
    );
    const metricCheckboxes = [];
    const metricsDialogElement = createElement(
      "dialog",
      "settings-dialog i3d-add-dialog i3d-nas-fields-dialog"
    );
    auxDialogElement = metricsDialogElement;
    metricsDialogElement.setAttribute("aria-label", "选择 NAS 显示内容");
    const metricsHeadingElement = createElement("div", "dialog-heading");
    const metricsTitleElement = createElement("h2", "", "选择显示内容");
    const metricsCloseButton = createButton("×", closeAuxDialog);
    metricsCloseButton.className = "icon-button";
    metricsCloseButton.setAttribute("aria-label", "关闭显示内容选择");
    metricsHeadingElement.append(metricsTitleElement, metricsCloseButton);
    const metricsBodyElement = createElement("div", "i3d-add-dialog-body");
    const metricsActionsElement = createElement("div", "dialog-actions");
    const selectionSummaryElement = createElement("span", "i3d-note");
    // 勾选状态与「已选 N 项」摘要统一刷新，避免两处各写一遍不同步。
    const syncMetricsSelection = () => {
      selectionSummaryElement.textContent = "已选 " + visibleMetricIds.size + " 项";
      for (const metricCheckboxItem of metricCheckboxes) {
        metricCheckboxItem.checked = visibleMetricIds.has(metricCheckboxItem.value);
      }
    };
    metricsActionsElement.append(
      createButton("全选", () => {
        statusSource.metrics.forEach(selectableMetric =>
          visibleMetricIds.add(selectableMetric.entityId)
        );
        syncMetricsSelection();
      }),
      createButton("全不选", () => {
        visibleMetricIds.clear();
        syncMetricsSelection();
      }),
      selectionSummaryElement
    );
    const nasFieldsContainerElement = createElement("div", "i3d-nas-fields");
    const nasFieldGroups = nasGroups(statusSource).filter(([nasGroupKey]) =>
      statusSource.metrics.some(nasGroupProbe => nasGroupProbe.group === nasGroupKey)
    );
    const groupControlsByKey = new Map();
    // 分组顺序与组内顺序直接写回 statusSource：弹窗里的调整先落在草稿上，
    // 仍需要用户点「保存配置」才会落库。
    const syncNasGroupOrder = () => {
      nasFieldGroups.forEach(([orderedGroupKey], groupIndex) => {
        const {
          section: mappedGroupSection,
          up: mappedUpButton,
          down: mappedDownButton
        } = groupControlsByKey.get(orderedGroupKey);
        mappedUpButton.disabled = groupIndex === 0;
        mappedDownButton.disabled = groupIndex === nasFieldGroups.length - 1;
        nasFieldsContainerElement.append(mappedGroupSection);
      });
    };
    for (const [fieldGroupKey, fieldGroupLabel] of nasFieldGroups) {
      const groupMetrics = statusSource.metrics.filter(
        fieldGroupProbe => fieldGroupProbe.group === fieldGroupKey
      );
      const fieldGroupSectionElement = createElement("section");
      const fieldGroupHeadingElement = createElement("div", "i3d-nas-fields-heading");
      // 上移 / 下移一个分组：就地交换数组中的位置，再重排这一块的 DOM。
      // 越界直接返回（首尾按钮本该禁用，这里再兜一层）。
      const moveFieldGroup = groupOffset => {
        const groupCurrentIndex = nasFieldGroups.findIndex(
          ([candidateGroupKey]) => candidateGroupKey === fieldGroupKey
        );
        const groupTargetIndex = groupCurrentIndex + groupOffset;
        if (!(groupTargetIndex < 0) && !(groupTargetIndex >= nasFieldGroups.length)) {
          [nasFieldGroups[groupCurrentIndex], nasFieldGroups[groupTargetIndex]] = [
            nasFieldGroups[groupTargetIndex],
            nasFieldGroups[groupCurrentIndex]
          ];
          syncNasGroupOrder();
        }
      };
      const groupUpButtonElement = createButton("↑", () => moveFieldGroup(-1));
      const groupDownButtonElement = createButton("↓", () => moveFieldGroup(1));
      groupUpButtonElement.setAttribute("aria-label", "上移" + fieldGroupLabel + "分组");
      groupDownButtonElement.setAttribute("aria-label", "下移" + fieldGroupLabel + "分组");
      groupUpButtonElement.title = "上移分组";
      groupDownButtonElement.title = "下移分组";
      fieldGroupHeadingElement.append(
        createElement("h4", "", fieldGroupLabel),
        groupUpButtonElement,
        groupDownButtonElement
      );
      fieldGroupSectionElement.append(fieldGroupHeadingElement);
      groupControlsByKey.set(fieldGroupKey, {
        section: fieldGroupSectionElement,
        up: groupUpButtonElement,
        down: groupDownButtonElement,
        metrics: groupMetrics
      });
      const metricControlsByEntityId = new Map();
      // 按 groupMetrics 的当前顺序把每行重新 append 一遍（append 已存在的节点等于移动），
      // 因此这一句既是重排 DOM，也是刷新首 / 尾行的上下移按钮禁用态。
      const syncNasMetricOrder = () =>
        groupMetrics.forEach((metricItem, metricIndex) => {
          const metricControl = metricControlsByEntityId.get(metricItem.entityId);
          metricControl.up.disabled = metricIndex === 0;
          metricControl.down.disabled = metricIndex === groupMetrics.length - 1;
          fieldGroupSectionElement.append(metricControl.row);
        });
      for (const nasMetric of groupMetrics) {
        const metricRowElement = createElement("div", "i3d-nas-fields-row");
        const metricLabelElement = createElement("label");
        const metricCheckboxElement = createElement("input");
        metricCheckboxElement.type = "checkbox";
        metricCheckboxElement.value = nasMetric.entityId;
        metricCheckboxElement.setAttribute("aria-label", nasMetric.label);
        metricLabelElement.title = nasMetric.entityId;
        metricCheckboxElement.addEventListener("change", () => {
          if (metricCheckboxElement.checked) {
            visibleMetricIds.add(metricCheckboxElement.value);
          } else {
            visibleMetricIds.delete(metricCheckboxElement.value);
          }
          syncMetricsSelection();
        });
        // 在同一分组内把指标上移 / 下移：交换顺序后调一次重排，越界直接返回。
        const moveNasMetric = metricOffset => {
          const metricCurrentIndex = groupMetrics.indexOf(nasMetric);
          const metricTargetIndex = metricCurrentIndex + metricOffset;
          if (!(metricTargetIndex < 0) && !(metricTargetIndex >= groupMetrics.length)) {
            [groupMetrics[metricCurrentIndex], groupMetrics[metricTargetIndex]] = [
              groupMetrics[metricTargetIndex],
              groupMetrics[metricCurrentIndex]
            ];
            syncNasMetricOrder();
          }
        };
        const metricUpButtonElement = createButton("↑", () => moveNasMetric(-1));
        const metricDownButtonElement = createButton("↓", () => moveNasMetric(1));
        metricUpButtonElement.setAttribute("aria-label", "上移" + nasMetric.label);
        metricDownButtonElement.setAttribute("aria-label", "下移" + nasMetric.label);
        metricUpButtonElement.title = "上移内容";
        metricDownButtonElement.title = "下移内容";
        metricControlsByEntityId.set(nasMetric.entityId, {
          row: metricRowElement,
          up: metricUpButtonElement,
          down: metricDownButtonElement
        });
        metricCheckboxes.push(metricCheckboxElement);
        metricLabelElement.append(
          metricCheckboxElement,
          createElement("span", "", nasMetric.label)
        );
        metricRowElement.append(metricLabelElement, metricUpButtonElement, metricDownButtonElement);
        fieldGroupSectionElement.append(metricRowElement);
      }
      syncNasMetricOrder();
      nasFieldsContainerElement.append(fieldGroupSectionElement);
    }
    syncNasGroupOrder();
    const metricsDialogActionsElement = createElement("div", "dialog-actions");
    const confirmMetricsButton = createButton("确定", () => {
      if (
        isDisposed ||
        !isAccessAllowed ||
        metricsTargetEntry.statusSource !== statusSource ||
        !getItemList().includes(metricsTargetEntry)
      ) {
        return closeAuxDialog();
      }
      statusSource.metrics = nasFieldGroups.flatMap(
        ([flatGroupKey]) => groupControlsByKey.get(flatGroupKey).metrics
      );
      statusSource.visibleMetrics = statusSource.metrics
        .filter(metricVisibleProbe => visibleMetricIds.has(metricVisibleProbe.entityId))
        .map(metricVisibleEntry => metricVisibleEntry.entityId);
      statusSource.groupOrder = nasFieldGroups.map(([mapGroupKey]) => mapGroupKey);
      closeAuxDialog();
      refreshEditorPreview();
      renderPanel();
      saveStatusElement.textContent = "显示内容已调整，请保存配置";
    });
    confirmMetricsButton.className = "primary";
    metricsDialogActionsElement.append(createButton("取消", closeAuxDialog), confirmMetricsButton);
    metricsBodyElement.append(
      metricsActionsElement,
      nasFieldsContainerElement,
      createElement("p", "i3d-note", "用 ↑ ↓ 调整分组和组内内容顺序；确定后点击“保存配置”保存。"),
      metricsDialogActionsElement
    );
    metricsDialogElement.append(metricsHeadingElement, metricsBodyElement);
    document.body.append(metricsDialogElement);
    syncMetricsSelection();
    metricsDialogElement.addEventListener("cancel", metricsCancelEvent => {
      metricsCancelEvent.preventDefault();
      closeAuxDialog();
    });
    metricsDialogElement.showModal();
  }
  // 打开批量应用弹窗：把源灯 / 源设备的字段值套用到勾选出来的其它项，
  // 只覆盖被勾选的字段，其余保持各自的绑定与位置。
  function openBatchApplyDialog(sourceItem) {
    if (
      isDisposed ||
      !isAccessAllowed ||
      isCameraEditing ||
      isCameraCommandPending ||
      isRangeEditorOpen ||
      auxDialogElement
    ) {
      return;
    }
    const itemKindLabel = usesModelBinding ? kindLabel : "灯光";
    const settingsTitle = usesModelBinding ? "图标设置" : "灯光设置";
    const changedFieldDefs = listChangedFields(sourceItem);
    const otherItems = getItemList().filter(
      otherItemProbe =>
        otherItemProbe.id !== sourceItem.id &&
        (isVacuumShortcutMode || otherItemProbe.floorId === sourceItem.floorId)
    );
    if (!changedFieldDefs.length) {
      return;
    }
    const baselinePayloadSnapshot = structuredClone(buildItemPayload(sourceItem));
    const batchDialogElement = createElement(
      "dialog",
      "settings-dialog navigation-style-apply-dialog i3d-batch-dialog"
    );
    batchDialogElement.setAttribute("aria-label", "应用" + settingsTitle);
    auxDialogElement = batchDialogElement;
    const batchHeadingElement = createElement("div", "dialog-heading");
    const batchTitleWrapperElement = createElement("div");
    batchTitleWrapperElement.append(
      createElement("span", "", "BATCH APPLY"),
      createElement("h2", "", "应用" + settingsTitle)
    );
    const batchDialogCloseButton = createButton("×", closeAuxDialog);
    batchDialogCloseButton.className = "icon-button";
    batchDialogCloseButton.setAttribute("aria-label", "关闭应用设置窗口");
    batchHeadingElement.append(batchTitleWrapperElement, batchDialogCloseButton);
    const batchBodyElement = createElement("div", "navigation-style-apply-body");
    const batchColumnsElement = createElement("div", "navigation-style-apply-columns");
    const changedColumnElement = createElement("section");
    const targetsColumnElement = createElement("section");
    // 批量应用表格的列头（带说明性提示文案）。
    const createBatchColumnHeading = (headingTitle, headingHint) => {
      const columnHeadingElement = createElement("div", "navigation-style-apply-heading");
      columnHeadingElement.append(
        createElement("strong", "", headingTitle),
        createElement("span", "", headingHint)
      );
      return columnHeadingElement;
    };
    const changedOptionsElement = createElement("div", "navigation-style-apply-options");
    const targetGroupsElement = createElement(
      "div",
      "navigation-style-apply-options grouped-by-page"
    );
    const batchFieldCheckboxes = [];
    const batchTargetCheckboxes = [];
    // 批量应用表格的一行选项，并把复选框登记进收集列表供后续批量读写。
    const createBatchOption = (optionValue, optionLabel, optionHint, optionCheckboxList) => {
      const optionLabelElement = createElement("label", "navigation-style-apply-option");
      const optionCheckboxElement = createElement("input");
      const optionHintElement = createElement("span", "", optionLabel);
      optionCheckboxElement.type = "checkbox";
      optionCheckboxElement.checked = true;
      optionCheckboxElement.value = optionValue;
      optionCheckboxElement.setAttribute("aria-label", optionLabel);
      optionCheckboxList.push(optionCheckboxElement);
      optionHintElement.append(createElement("small", "", optionHint));
      optionLabelElement.append(optionCheckboxElement, optionHintElement);
      return optionLabelElement;
    };
    const changedFieldNames = new Set(
      changedFieldDefs.map(([changedFieldEntry]) => changedFieldEntry)
    );
    const linkedFieldNames = new Set(changedFieldNames);
    for (const changedFieldName of changedFieldNames) {
      if (changedFieldName.startsWith("effectRange.")) {
        linkedFieldNames.add(
          changedFieldName.endsWith("Min")
            ? changedFieldName.replace(/Min$/, "Max")
            : changedFieldName.replace(/Max$/, "Min")
        );
      }
    }
    for (const [applyFieldKey, applyFieldLabel, applyFieldUnit] of fieldDefs.filter(
      ([linkedFieldProbe]) => linkedFieldNames.has(linkedFieldProbe)
    )) {
      const existingFieldValue = readNestedPath(baselinePayloadSnapshot, applyFieldKey);
      const displayFieldValue =
        isVacuumMode && applyFieldKey === "size"
          ? Math.round((existingFieldValue / 44) * 100)
          : isVacuumMode && applyFieldKey === "iconSize"
            ? existingFieldValue / 2
            : existingFieldValue;
      const isInChangedSet = changedFieldNames.has(applyFieldKey);
      changedOptionsElement.append(
        createBatchOption(
          applyFieldKey,
          applyFieldLabel,
          typeof displayFieldValue == "boolean"
            ? displayFieldValue
              ? "是"
              : "否"
            : displayFieldValue === undefined
              ? "跟随模型"
              : "" +
                (isInChangedSet ? "" : "配套上/下限 · ") +
                (typeof displayFieldValue == "number"
                  ? Math.round(displayFieldValue * 1000) / 1000
                  : displayFieldValue) +
                " " +
                applyFieldUnit,
          batchFieldCheckboxes
        )
      );
      batchFieldCheckboxes.at(-1).checked = isInChangedSet;
    }
    const otherItemsByFloorId = new Map();
    for (const otherFloorItem of otherItems) {
      const itemFloorId = isVacuumShortcutMode
        ? findVacuumModel()?.floorId
        : otherFloorItem.floorId;
      if (!otherItemsByFloorId.has(itemFloorId)) {
        otherItemsByFloorId.set(itemFloorId, []);
      }
      otherItemsByFloorId.get(itemFloorId).push(otherFloorItem);
    }
    for (const [floorIdKey, floorOtherItems] of otherItemsByFloorId) {
      const floorGroupElement = createElement("section", "navigation-style-apply-page-group");
      const floorGroupHeadingElement = createElement("div", "navigation-style-apply-page-heading");
      const floorDisplayName =
        sceneMetadata?.floors.find(targetFloorRecord => targetFloorRecord.id === floorIdKey)
          ?.name || "原楼层";
      const floorGroupControlsElement = createElement(
        "div",
        "navigation-style-apply-page-controls"
      );
      const floorSelectionCountElement = createElement("span");
      const floorOptionsElement = createElement("div", "navigation-style-apply-page-options");
      const floorTargetCheckboxes = [];
      for (const floorTargetItem of floorOtherItems) {
        floorOptionsElement.append(
          createBatchOption(
            floorTargetItem.id,
            floorTargetItem.label || itemKindLabel,
            usesModelBinding ? "图标设置" : "灯光设置",
            floorTargetCheckboxes
          )
        );
      }
      batchTargetCheckboxes.push(...floorTargetCheckboxes);
      // 刷新「已选 N/M 个…」计数与全选 / 取消全选按钮的文案；
      // itemKindLabel 是当前编辑类型的中文名（灯、窗帘…），随类型变化。
      const refreshFloorSelection = () => {
        const checkedTargetCount = floorTargetCheckboxes.filter(
          checkedTargetProbe => checkedTargetProbe.checked
        ).length;
        floorSelectionCountElement.textContent =
          checkedTargetCount + "/" + floorTargetCheckboxes.length + " 个" + itemKindLabel;
        floorToggleButton.textContent =
          checkedTargetCount === floorTargetCheckboxes.length ? "取消全选" : "全选";
      };
      const floorToggleButton = createButton("", () => {
        const shouldSelectAllTargets = !floorTargetCheckboxes.every(
          selectableTargetProbe => selectableTargetProbe.checked
        );
        floorTargetCheckboxes.forEach(targetCheckbox => {
          targetCheckbox.checked = shouldSelectAllTargets;
        });
        refreshFloorSelection();
      });
      floorToggleButton.className = "navigation-style-apply-page-toggle";
      floorToggleButton.setAttribute(
        "aria-label",
        "全选或取消 " + floorDisplayName + " 的" + itemKindLabel
      );
      floorOptionsElement.addEventListener("change", refreshFloorSelection);
      floorGroupControlsElement.append(floorSelectionCountElement, floorToggleButton);
      floorGroupHeadingElement.append(
        createElement("strong", "", floorDisplayName),
        floorGroupControlsElement
      );
      floorGroupElement.append(floorGroupHeadingElement, floorOptionsElement);
      targetGroupsElement.append(floorGroupElement);
      refreshFloorSelection();
    }
    changedColumnElement.append(
      createBatchColumnHeading("要应用的修改", "可单独取消"),
      changedOptionsElement
    );
    targetsColumnElement.append(
      createBatchColumnHeading("应用到其他" + itemKindLabel, "按楼层区分"),
      targetGroupsElement
    );
    batchColumnsElement.append(changedColumnElement, targetsColumnElement);
    const batchMessageElement = createElement("p", "navigation-style-apply-message");
    batchMessageElement.hidden = otherItems.length > 0;
    if (!otherItems.length) {
      batchMessageElement.textContent = "当前配置中没有其他" + itemKindLabel + "可应用。";
    }
    batchMessageElement.setAttribute("role", "status");
    const batchActionsElement = createElement("div", "dialog-actions");
    const applyBatchButton = createButton("应用所选", async () => {
      const selectedFieldKeys = batchFieldCheckboxes
        .filter(checkedFieldProbe => checkedFieldProbe.checked)
        .map(checkedFieldCheckbox => checkedFieldCheckbox.value);
      const selectedTargetIds = new Set(
        batchTargetCheckboxes
          .filter(targetCheckboxProbe => targetCheckboxProbe.checked)
          .map(targetCheckboxEntry => targetCheckboxEntry.value)
      );
      if (!selectedFieldKeys.length || !selectedTargetIds.size) {
        batchMessageElement.textContent = "请至少选择一项修改和一个目标" + itemKindLabel + "。";
        batchMessageElement.hidden = false;
        return;
      }
      applyBatchButton.disabled = true;
      try {
        await requestInteraction3dAccess();
        if (isDisposed || !isAccessAllowed || auxDialogElement !== batchDialogElement) {
          return;
        }
        const updatedTargetItems = getItemList()
          .filter(
            candidateTargetProbe =>
              selectedTargetIds.has(candidateTargetProbe.id) &&
              candidateTargetProbe.id !== sourceItem.id &&
              (isVacuumShortcutMode || candidateTargetProbe.floorId === sourceItem.floorId)
          )
          .map(targetItemEntry => {
            const targetItemClone = structuredClone(targetItemEntry);
            applyFieldValues(targetItemClone, baselinePayloadSnapshot, selectedFieldKeys);
            const targetEffectRange = targetItemClone.effectRange;
            if (
              targetEffectRange &&
              (targetEffectRange.brightnessMin > targetEffectRange.brightnessMax ||
                targetEffectRange.temperatureMin > targetEffectRange.temperatureMax)
            ) {
              throw new Error(
                "“" +
                  (targetItemEntry.label || "灯光") +
                  "”的上下限会冲突，请同时勾选对应的最小值与最大值。"
              );
            }
            return targetItemClone;
          });
        if (!updatedTargetItems.length) {
          throw new Error("目标" + itemKindLabel + "已不存在，请重新选择。");
        }
        const updatedTargetsById = new Map(
          updatedTargetItems.map(clonedTargetProbe => [clonedTargetProbe.id, clonedTargetProbe])
        );
        setItemList(
          getItemList().map(
            existingTargetItem =>
              updatedTargetsById.get(existingTargetItem.id) || existingTargetItem
          )
        );
        for (const affectedItem of [sourceItem, ...updatedTargetItems]) {
          const affectedBaseline =
            baselineItemsById.get(affectedItem.id) || structuredClone(affectedItem);
          applyFieldValues(affectedBaseline, baselinePayloadSnapshot, selectedFieldKeys);
          baselineItemsById.set(affectedItem.id, affectedBaseline);
        }
        closeAuxDialog();
        refreshEditorPreview();
        renderPanel();
        saveStatusElement.textContent =
          "已应用到 " + updatedTargetItems.length + " 个" + itemKindLabel + "，请保存配置";
      } catch (batchApplyError) {
        if (auxDialogElement === batchDialogElement) {
          batchMessageElement.textContent = batchApplyError.message;
          batchMessageElement.hidden = false;
        }
      } finally {
        applyBatchButton.disabled = false;
      }
    });
    applyBatchButton.className = "primary";
    applyBatchButton.disabled = !otherItems.length;
    batchActionsElement.append(createButton("取消", closeAuxDialog), applyBatchButton);
    batchBodyElement.append(
      createElement(
        "p",
        "navigation-style-apply-summary",
        isVacuumShortcutMode
          ? "将“" +
              (sourceItem.label || kindLabel) +
              "”的图标修改应用到勾选的快捷按钮，保留各自的指令绑定、名称、位置和高度。应用后点击“保存配置”。"
          : usesModelBinding
            ? "将“" +
              (sourceItem.label || kindLabel) +
              "”的图标修改应用到勾选的" +
              kindLabel +
              "。保留各自的模型、实体、位置、高度、点击行为、聚焦视角和状态内容。应用后点击“保存配置”完成保存。"
            : "将“" +
              (sourceItem.label || "灯光") +
              "”中选定的修改应用到勾选的灯光。保留各灯的实体、名称、位置、聚焦视角与照射范围。应用后点击“保存配置”完成保存。"
      ),
      batchColumnsElement,
      batchMessageElement,
      batchActionsElement
    );
    batchDialogElement.append(batchHeadingElement, batchBodyElement);
    document.body.append(batchDialogElement);
    batchDialogElement.addEventListener("cancel", batchCancelEvent => {
      batchCancelEvent.preventDefault();
      closeAuxDialog();
    });
    batchDialogElement.showModal();
  }
  // 预览区按 16:9 等比适配：尺寸由 interaction3dPreviewSize 统一算，
  // 保证编辑器里的取景与展示页一致（否则拖拽定位会看不出偏差）。
  const syncPreviewSize = () => {
    const previewSize = interaction3dPreviewSize(
      component,
      documentApi,
      viewElement.clientWidth,
      viewElement.clientHeight
    );
    Object.assign(aspectBoxElement.style, {
      width: previewSize.width + "px",
      height: previewSize.height + "px"
    });
  };
  const previewResizeObserver = new ResizeObserver(syncPreviewSize);
  previewResizeObserver.observe(viewElement);
  // 释放编辑器：关掉所有子弹窗、断开尺寸观察、卸载预览运行时、移除 DOM 与样式，
  // 最后广播 preview-scope 事件，通知舞台相关的挂起逻辑重新计算。
  const disposeEditor = () => {
    if (!isDisposed) {
      isDisposed = true;
      closeAddDialog();
      closeAuxDialog();
      subEditorHandle?.close();
      previewResizeObserver.disconnect();
      pickerGeneration++;
      pickerHandle?.close();
      editorRuntime?.();
      accessUnsubscribe();
      editorDialogElement.remove();
      styleSheetLinkElement.remove();
      document.dispatchEvent(new Event("hb-i3d-preview-scope"));
    }
  };
  // 关闭前拦截未保存改动；确认文案取自 EDITOR_SAVE_STATUS，
  // 与保存状态提示共用一套措辞。
  const requestCloseEditor = async () => {
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
    disposeEditor();
  };
  const saveStatusElement = createElement("span", "i3d-save-status");
  saveStatusElement.setAttribute("role", "status");
  // 保存：先冻结草稿快照再提交，提交期间禁止重复点击；
  // 相机编辑中 / 指令在途时也不允许保存，避免把中间态写进配置。
  // 保存成功后重新比较脏状态：用户在等待期间又改了东西就提示「已保存，仍有改动」。
  const saveButtonElement = createButton("保存配置", async () => {
    if (
      isSaving ||
      isDisposed ||
      !isDirty ||
      !isAccessAllowed ||
      isCameraEditing ||
      isCameraCommandPending
    ) {
      if (!isAccessAllowed && !isDisposed) {
        saveStatusElement.textContent = "";
        errorMessageElement.textContent = EDITOR_SAVE_STATUS.accessDenied;
      }
      return;
    }
    const propertiesSnapshot = structuredClone(draftProperties);
    isSaving = true;
    saveStatusElement.textContent = EDITOR_SAVE_STATUS.saving;
    syncSaveButtonState();
    errorMessageElement.textContent = "";
    try {
      await requestInteraction3dAccess();
      if (isDisposed) {
        return;
      }
      if (!isAccessAllowed) {
        errorMessageElement.textContent = EDITOR_SAVE_STATUS.accessDenied;
        saveStatusElement.textContent = "";
        return;
      }
      await onSaveConfig(propertiesSnapshot);
      if (!isDisposed) {
        savedDraftSignature = serializeEditorDraft(propertiesSnapshot);
        isDirty = editorDraftHasChanges(draftProperties, propertiesSnapshot);
        saveStatusElement.textContent = isDirty
          ? EDITOR_SAVE_STATUS.savedWithMoreChanges
          : EDITOR_SAVE_STATUS.saved;
      }
    } catch (saveError) {
      if (!isDisposed) {
        errorMessageElement.textContent = saveError.message || EDITOR_SAVE_STATUS.failed;
        saveStatusElement.textContent = "";
      }
    } finally {
      isSaving = false;
      if (!isDisposed) {
        if (saveStatusElement.textContent === EDITOR_SAVE_STATUS.saving) {
          saveStatusElement.textContent = "";
        }
        syncSaveButtonState();
      }
    }
  });
  saveButtonElement.className = "primary";
  saveButtonElement.disabled = true;
  headerElement.append(
    createElement("strong", "", "3D " + editorKindTitle + "配置"),
    saveStatusElement,
    saveButtonElement,
    createButton("退出", requestCloseEditor)
  );
  bodyElement.append(viewElement, panelElement);
  editorDialogElement.append(headerElement, bodyElement);
  document.body.append(editorDialogElement);
  editorDialogElement.addEventListener("cancel", editorCancelEvent => {
    editorCancelEvent.preventDefault();
    requestCloseEditor();
  });
  // 交给预览运行时的属性：扫地机快捷指令模式下预览必须跟着快捷项所在楼层，
  // 所以这里临时改写 floorSelection 与 camera（不改草稿本身）。
  const buildRuntimeProperties = () => {
    const runtimeFloorId =
      isVacuumShortcutMode && findVacuumModel() ? findVacuumModel().floorId : selectedFloorId;
    const runtimeCamera =
      draftProperties.floorCameras?.[runtimeFloorId] ||
      (runtimeFloorId === draftProperties.floorSelection ? draftProperties.camera : null);
    return {
      ...draftProperties,
      floorSelection: runtimeFloorId,
      ...(runtimeCamera === undefined
        ? {}
        : {
            camera: runtimeCamera
          })
    };
  };
  // 刷新预览舞台。markDirty 为 false 用于「只切换选中项」这类不改变配置的操作，
  // 否则每次点选都会被记成一次改动，退出时白弹一次确认框。
  function refreshEditorPreview({ markDirty = true } = {}) {
    if (markDirty) {
      changeRevisionCount++;
      syncDraftDirtyState();
    }
    editorRuntime?.update(
      buildRuntimeProperties(),
      isVacuumShortcutMode && selectedItemId
        ? "vacuum-room:" + vacuumId + ":" + selectedItemId
        : selectedItemId,
      {
        module: deviceKind,
        vacuumId: isVacuumShortcutMode ? vacuumId : ""
      }
    );
    refreshBatchButtons();
    if (!markDirty) {
      syncSaveButtonState();
    }
  }
  // 脏标记 = 草稿签名 ≠ 已保存签名；保存进行中不覆盖状态文案，
  // 免得把「保存中…」冲掉。
  function syncDraftDirtyState() {
    isDirty = serializeEditorDraft(draftProperties) !== savedDraftSignature;
    if (!isSaving) {
      saveStatusElement.textContent = isDirty ? EDITOR_SAVE_STATUS.dirty : "";
    }
    syncSaveButtonState();
  }
  // 保存按钮的可用性收敛到这一处判断，避免多处各写一套条件。
  function syncSaveButtonState() {
    if (!isDisposed) {
      saveButtonElement.disabled =
        isSaving ||
        !isDirty ||
        !isAccessAllowed ||
        isCameraEditing ||
        isCameraCommandPending;
    }
  }
  // 设置行小工厂：统一「标签 + 控件」的结构，三行区分控件类型。
  function createSettingRow(rowContainer, rowLabel, rowControl) {
    rowControl.name = "i3d-" + deviceKind + "-" + (selectedItemId || "scene") + "-" + rowLabel;
    const settingRowElement = createElement(
      "label",
      rowControl.type === "checkbox" ? "i3d-setting-toggle" : ""
    );
    settingRowElement.append(createElement("span", "", rowLabel), rowControl);
    rowContainer.append(settingRowElement);
    return rowControl;
  }
  // 下拉选择行：选项变化即写回草稿。
  function createSelectRow(
    selectContainer,
    selectLabel,
    selectOptions,
    selectValue,
    onSelectChange
  ) {
    const selectElement = createElement("select");
    for (const [optionValueKey, optionLabelText] of selectOptions) {
      const optionElement = createElement("option", "", optionLabelText);
      optionElement.value = optionValueKey;
      selectElement.append(optionElement);
    }
    selectElement.value = selectValue;
    selectElement.addEventListener("change", () => onSelectChange(selectElement.value));
    return createSettingRow(selectContainer, selectLabel, selectElement);
  }
  // 数字输入行：解析失败时保留原值，不把 NaN 写进草稿。
  function createNumberRow(
    numberContainer,
    numberLabel,
    numberValue,
    numberMin,
    numberMax,
    numberStep,
    onNumberChange,
    inputType = "number"
  ) {
    const numberInputElement = createElement("input");
    Object.assign(numberInputElement, {
      type: inputType,
      min: String(numberMin),
      max: String(numberMax),
      step: String(numberStep),
      value: String(numberValue)
    });
    numberInputElement.addEventListener(inputType === "range" ? "input" : "change", () => {
      const parsedInputValue =
        numberInputElement.value.trim() === "" ? NaN : Number(numberInputElement.value);
      if (Number.isFinite(parsedInputValue)) {
        onNumberChange(Math.max(numberMin, Math.min(numberMax, parsedInputValue)));
      }
    });
    return createSettingRow(numberContainer, numberLabel, numberInputElement);
  }
  // 尺寸行：当前值由调用方通过 readCurrentSize 提供（按钮大小与状态框缩放的语义不同），
  // 因此这里只负责读取与回写。
  function createSizeRow(sizeContainer, sizeLabel, readCurrentSize, onSizeChange) {
    const sizeInputElement = createElement("input");
    Object.assign(sizeInputElement, {
      type: "number",
      step: "any",
      value: String(Number(readCurrentSize().toPrecision(12)))
    });
    sizeInputElement.addEventListener("change", () => {
      const parsedSizeValue =
        sizeInputElement.value.trim() === "" ? NaN : Number(sizeInputElement.value);
      if (Number.isFinite(parsedSizeValue) && parsedSizeValue > 0) {
        sizeInputElement.value = String(parsedSizeValue);
        onSizeChange(parsedSizeValue);
      } else {
        sizeInputElement.value = String(readCurrentSize());
      }
    });
    return createSettingRow(sizeContainer, sizeLabel, sizeInputElement);
  }
  // 取灯具能力：色温上下限、是否支持亮度 / 色温。优先读实体属性，
  // 取不到时用编辑器兜底范围，保证滑杆在离线或状态未到时不至于不可用。
  function getLightStatus(statusItem) {
    const entityId = statusItem.entityId || "";
    const entityState = latestStates === null ? states?.get?.(entityId) : latestStates[entityId];
    const cachedStatus = devicesByDeviceId.get(entityId);
    const stateAttributes = (entityState?.newState || entityState)?.attributes || {};
    const supportedFeatures = stateAttributes.supported_features;
    const hasNumericSupportedFeatures =
      supportedFeatures != null &&
      supportedFeatures !== "" &&
      typeof supportedFeatures != "boolean" &&
      Number.isFinite(Number(supportedFeatures));
    const resolvedLightStatus = lightState(entityId, entityState, cachedStatus);
    resolvedLightStatus.known =
      entityId.startsWith("switch.") ||
      cachedStatus?.known === true ||
      (Array.isArray(stateAttributes.supported_color_modes) &&
        stateAttributes.supported_color_modes.some(colorMode => colorMode !== "unknown")) ||
      hasNumericSupportedFeatures ||
      resolvedLightStatus.brightnessSupported ||
      resolvedLightStatus.temperatureSupported;
    if (entityId && resolvedLightStatus.known) {
      devicesByDeviceId.set(entityId, resolvedLightStatus);
    }
    return resolvedLightStatus;
  }
  // 渲染「灯光效果」设置：默认亮度 / 色温、缓开缓灭时长与亮度、色温范围。
  // 校验口径是「上下限不能交叉」：交叉时给提示且不写回草稿。
  function renderEffectSettings(containerElement, lightItem, lightCapabilities) {
    containerElement.replaceChildren();
    if (lightItem.entityId && !lightCapabilities.known) {
      const probingNoteElement = createElement("p", "i3d-note", "正在识别灯具能力…");
      probingNoteElement.setAttribute("role", "status");
      containerElement.append(probingNoteElement);
    }
    if (
      lightItem.entityId &&
      lightCapabilities.known &&
      (!lightCapabilities.brightnessSupported || !lightCapabilities.temperatureSupported)
    ) {
      const defaultsSectionElement = createElement("section", "i3d-focus-settings");
      defaultsSectionElement.append(createElement("h4", "", "默认效果"));
      const defaultsGridElement = createElement("div", "i3d-coordinate-grid");
      defaultsSectionElement.append(defaultsGridElement);
      for (const [
        defaultSettingLabel,
        defaultSettingKey,
        isUnsupportedSetting,
        settingMin,
        settingMax,
        settingStep
      ] of [
        ["默认亮度（%）", "brightness", lightCapabilities.brightnessSupported, 0, 150, 1],
        ["默认色温（K）", "kelvin", lightCapabilities.temperatureSupported, 1000, 20000, 100]
      ]) {
        if (isUnsupportedSetting) {
          continue;
        }
        const defaultSettingInput = createElement("input");
        Object.assign(defaultSettingInput, {
          type: "number",
          min: String(settingMin),
          max: String(settingMax),
          step: String(settingStep),
          value: Number.isFinite(lightItem.effectDefaults?.[defaultSettingKey])
            ? String(lightItem.effectDefaults[defaultSettingKey])
            : "",
          placeholder: "跟随模型"
        });
        defaultSettingInput.addEventListener("change", () => {
          const rawDefaultText = defaultSettingInput.value.trim();
          const parsedDefaultValue = Number(rawDefaultText);
          const nextEffectDefaults = {
            ...lightItem.effectDefaults
          };
          if (rawDefaultText) {
            if (Number.isFinite(parsedDefaultValue)) {
              nextEffectDefaults[defaultSettingKey] = Math.max(
                settingMin,
                Math.min(settingMax, parsedDefaultValue)
              );
            }
          } else {
            delete nextEffectDefaults[defaultSettingKey];
          }
          defaultSettingInput.value = Number.isFinite(nextEffectDefaults[defaultSettingKey])
            ? String(nextEffectDefaults[defaultSettingKey])
            : "";
          if (Object.keys(nextEffectDefaults).length) {
            lightItem.effectDefaults = nextEffectDefaults;
          } else {
            delete lightItem.effectDefaults;
          }
          refreshEditorPreview();
        });
        createSettingRow(defaultsGridElement, defaultSettingLabel, defaultSettingInput);
      }
      const defaultsPreviewActions = createElement("div", "i3d-focus-actions");
      defaultsSectionElement.append(defaultsPreviewActions);
      defaultsPreviewActions.append(
        createButton("预览默认效果", async () => {
          try {
            await editorRuntime.focusCommand("preview-light-effect", lightItem.id, "defaults");
          } catch (previewDefaultsError) {
            errorMessageElement.textContent = previewDefaultsError.message;
          }
        }),
        createButton("跟随模型", () => {
          delete lightItem.effectDefaults;
          refreshEditorPreview();
          renderPanel();
        })
      );
      containerElement.append(defaultsSectionElement);
    }
    const effectRangeDetailsElement = createElement("details", "i3d-effect-settings");
    effectRangeDetailsElement.open = isEffectDetailsOpen;
    effectRangeDetailsElement.addEventListener("toggle", () => {
      isEffectDetailsOpen = effectRangeDetailsElement.open;
    });
    effectRangeDetailsElement.append(createElement("summary", "", "效果范围"));
    const effectRangeDraft = {
      brightnessMin: 1,
      brightnessMax: 100,
      temperatureMin: lightCapabilities.minimum,
      temperatureMax: lightCapabilities.maximum,
      ...lightItem.effectRange
    };
    const effectRangeGridElement = createElement("div", "i3d-effect-grid");
    effectRangeDetailsElement.append(effectRangeGridElement);
    for (const [
      rangeSettingLabel,
      rangeSettingKey,
      rangeCounterKey,
      rangeSettingMin,
      rangeSettingMax,
      rangeSettingStep
    ] of [
      ["最暗亮度（%）", "brightnessMin", "brightnessMax", 0, 150, 1],
      ["最亮亮度（%）", "brightnessMax", "brightnessMin", 0, 150, 1],
      ["最低色温（K）", "temperatureMin", "temperatureMax", 1000, 20000, 100],
      ["最高色温（K）", "temperatureMax", "temperatureMin", 1000, 20000, 100]
    ]) {
      const rangeOptionElement = createElement("div", "i3d-effect-option");
      effectRangeGridElement.append(rangeOptionElement);
      const rangeInputElement = createNumberRow(
        rangeOptionElement,
        rangeSettingLabel,
        effectRangeDraft[rangeSettingKey],
        rangeSettingMin,
        rangeSettingMax,
        rangeSettingStep,
        rangeSettingValue => {
          effectRangeDraft[rangeSettingKey] = rangeSettingKey.endsWith("Min")
            ? Math.min(rangeSettingValue, effectRangeDraft[rangeCounterKey])
            : Math.max(rangeSettingValue, effectRangeDraft[rangeCounterKey]);
          rangeInputElement.value = String(effectRangeDraft[rangeSettingKey]);
          lightItem.effectRange = {
            ...effectRangeDraft
          };
          refreshEditorPreview();
        }
      );
      const previewEffectButton = createButton("预览", async () => {
        try {
          await editorRuntime.focusCommand("preview-light-effect", lightItem.id, rangeSettingKey);
        } catch (previewEffectError) {
          errorMessageElement.textContent = previewEffectError.message;
        }
      });
      previewEffectButton.disabled = !lightItem.entityId;
      if (!lightItem.entityId) {
        previewEffectButton.title = "绑定实体后预览效果";
      }
      previewEffectButton.setAttribute("aria-label", "预览" + rangeSettingLabel);
      rangeOptionElement.append(previewEffectButton);
    }
    effectRangeDetailsElement.append(
      createButton("恢复默认效果", () => {
        delete lightItem.effectRange;
        refreshEditorPreview();
        renderPanel();
      })
    );
    containerElement.append(effectRangeDetailsElement);
  }
  // 列出还可添加的模型：已被绑定的模型不再出现，避免同一模型重复绑定。
  function listAddableModels() {
    return (sceneMetadata?.floors || [])
      .filter(candidateFloorEntry => candidateFloorEntry.id === selectedFloorId)
      .flatMap(floorWithModels =>
        (usesModelBinding ? floorWithModels[collectionKey] || [] : floorWithModels.groups || [])
          .filter(
            modelInFloor =>
              !getItemList().some(
                existingModelItem =>
                  existingModelItem.floorId === floorWithModels.id &&
                  existingModelItem[modelIdKey] === modelInFloor.id
              )
          )
          .map(addableModel => ({
            floor: floorWithModels,
            group: addableModel,
            key: JSON.stringify([floorWithModels.id, addableModel.id])
          }))
      );
  }
  // 切换编辑对象类型（灯光 ↔ 空调 ↔ 窗帘 ↔ 设备 …）：重建字段定义与基线，
  // 并按需重挂预览运行时，因为不同类型在舞台上的可编辑内容不同。
  async function switchEditorKind(nextDeviceKind, shouldOpenAddDialog = false) {
    if (
      isDisposed ||
      isSaving ||
      !isAccessAllowed ||
      isCameraEditing ||
      isCameraCommandPending ||
      isRangeEditorOpen ||
      nextDeviceKind === deviceKind ||
      !(
        isEnvironmentKind
          ? ["climate", "cover"]
          : isDeviceKind
            ? ["nas", "television"]
            : ["vacuum", "vacuum-shortcut"]
      ).includes(nextDeviceKind)
    ) {
      return;
    }
    kindSessionsByKind.set(deviceKind, {
      selectedId: selectedItemId,
      scrollTop: panelElement.scrollTop,
      baselines: baselineItemsById
    });
    if (isVacuumMode) {
      vacuumId = selectedItemId || vacuumId;
    }
    closeAddDialog();
    closeAuxDialog();
    pickerGeneration++;
    pickerHandle?.close();
    pickerHandle = null;
    sceneReadyGeneration++;
    isCameraEditing = false;
    isCameraCommandPending = false;
    pendingCameraDraft = null;
    vacuumCameraMode = "focus";
    applyKindFlags(nextDeviceKind);
    ensureItemCollections();
    const savedKindSession = kindSessionsByKind.get(nextDeviceKind);
    selectedItemId = isVacuumMode ? vacuumId : savedKindSession?.selectedId || "";
    if (isVacuumMode && findVacuumModel()) {
      selectedFloorId = findVacuumModel().floorId;
    }
    fieldDefs = buildEditableFieldList();
    baselineItemsById =
      savedKindSession?.baselines ||
      new Map(
        getItemList().map(baselineListItem => [
          baselineListItem.id,
          structuredClone(baselineListItem)
        ])
      );
    errorMessageElement.textContent = "";
    renderPanel();
    refreshEditorPreview({
      markDirty: false
    });
    panelElement.scrollTop = savedKindSession?.scrollTop || 0;
    if (shouldOpenAddDialog) {
      openAddDialog();
    }
  }
  // 关闭「添加模型」弹窗并清掉状态。
  function closeAddDialog() {
    if (addDialogState) {
      pickerGeneration++;
      pickerHandle?.close();
      pickerHandle = null;
    }
    addDialogState?.close();
    addDialogState?.remove();
    addDialogState = null;
  }
  // 添加模型弹窗：按楼层列出尚未绑定的模型（部分模型带尺寸），选中即写入草稿
  // 并把新项设为当前选中项。
  function openAddDialog(addDialogTriggerEvent) {
    if (
      isDisposed ||
      !isAccessAllowed ||
      isCameraEditing ||
      isCameraCommandPending ||
      isRangeEditorOpen ||
      addDialogState
    ) {
      return;
    }
    if (isVacuumShortcutMode) {
      openVacuumRoomPicker(addDialogTriggerEvent?.currentTarget || addDialogTriggerEvent?.target);
      return;
    }
    const addableModels = listAddableModels();
    if (!addableModels.length || getItemList().length >= 128) {
      return;
    }
    pickerGeneration++;
    pickerHandle?.close();
    const addDialogElement = createElement("dialog", "settings-dialog i3d-add-dialog");
    addDialogState = addDialogElement;
    addDialogElement.setAttribute(
      "aria-label",
      isDeviceKind ? "添加设备" : "添加" + kindLabel + "按钮"
    );
    const addDialogHeadingElement = createElement("div", "dialog-heading");
    const addDialogTitleWrapperElement = createElement("div");
    addDialogTitleWrapperElement.append(
      createElement("span", "", "ADD BUTTON"),
      createElement("h2", "", isDeviceKind ? "添加设备" : "添加" + kindLabel + "按钮")
    );
    const addDialogCloseButton = createButton("×", closeAddDialog);
    addDialogCloseButton.className = "icon-button";
    addDialogCloseButton.setAttribute("aria-label", "关闭添加按钮窗口");
    addDialogHeadingElement.append(addDialogTitleWrapperElement, addDialogCloseButton);
    const addDialogBodyElement = createElement("div", "i3d-add-dialog-body");
    const addDialogErrorElement = createElement("p", "i3d-error");
    addDialogErrorElement.setAttribute("role", "status");
    if (isDeviceKind) {
      createSelectRow(
        addDialogBodyElement,
        "设备类型",
        [
          ["nas", "NAS"],
          ["television", "电视"]
        ],
        deviceKind,
        pickedDeviceKind => {
          if (pickedDeviceKind !== deviceKind) {
            switchEditorKind(pickedDeviceKind, true);
          }
        }
      ).setAttribute("aria-label", "设备类型");
    }
    const modelSelectElement = createSelectRow(
      addDialogBodyElement,
      usesModelBinding ? "关联" + kindLabel + "模型" : "关联灯组",
      addableModels.map(addableModelEntry => [
        addableModelEntry.key,
        describeItem(addableModelEntry.group)
      ]),
      addableModels[0].key,
      () => {
        addDialogErrorElement.textContent = "";
      }
    );
    modelSelectElement.setAttribute(
      "aria-label",
      usesModelBinding ? "关联" + kindLabel + "模型" : "关联灯组"
    );
    const addDialogActionsElement = createElement("div", "dialog-actions");
    let isAdding = false;
    const confirmAddButton = createButton("确定添加", async () => {
      if (isAdding || isDisposed || !isAccessAllowed || addDialogState !== addDialogElement) {
        return;
      }
      isAdding = true;
      confirmAddButton.disabled = true;
      modelSelectElement.disabled = true;
      addDialogErrorElement.textContent = "";
      const chosenModelKey = modelSelectElement.value;
      try {
        await requestInteraction3dAccess();
        if (isDisposed || !isAccessAllowed || addDialogState !== addDialogElement) {
          return;
        }
        const chosenModel = listAddableModels().find(
          modelCandidateMatch => modelCandidateMatch.key === chosenModelKey
        );
        if (!chosenModel || getItemList().length >= 128) {
          throw new Error("该对象已添加或不再可用，请关闭窗口后重新选择。");
        }
        const newItem = {
          id: randomUuid(),
          floorId: chosenModel.floor.id,
          [modelIdKey]: chosenModel.group.id,
          entityId: "",
          label: describeItem(chosenModel.group),
          ...(usesModelBinding
            ? {}
            : {
                x: chosenModel.group.x,
                y: chosenModel.group.y,
                height: chosenModel.group.height ?? chosenModel.floor.wallHeight ?? 2.8,
                fadeDuration: 0.3
              }),
          ...(isCoverMode
            ? {
                coverDirection: "auto",
                curtainFabric: "cloth",
                unboundPosition: 0
              }
            : {}),
          size: 44,
          iconSize: 26,
          visible: true,
          icon: defaultIcon,
          clickAction: usesStatusPanel ? "focus-panel" : "focus"
        };
        getItemList().push(newItem);
        selectedItemId = newItem.id;
        closeAddDialog();
        refreshEditorPreview();
        renderPanel();
      } catch (addItemError) {
        if (addDialogState === addDialogElement) {
          addDialogErrorElement.textContent = addItemError.message;
        }
      } finally {
        isAdding = false;
        confirmAddButton.disabled = false;
        modelSelectElement.disabled = false;
      }
    });
    confirmAddButton.className = "primary";
    addDialogActionsElement.append(createButton("取消", closeAddDialog), confirmAddButton);
    addDialogBodyElement.append(
      createElement(
        "p",
        "i3d-note",
        "添加后可继续设置" + kindLabel + "按钮，最后点击“保存配置”完成保存。"
      ),
      addDialogErrorElement,
      addDialogActionsElement
    );
    addDialogElement.append(addDialogHeadingElement, addDialogBodyElement);
    document.body.append(addDialogElement);
    addDialogElement.addEventListener("cancel", addDialogCancelEvent => {
      addDialogCancelEvent.preventDefault();
      closeAddDialog();
    });
    addDialogElement.showModal();
  }
  // 扫地机房间选择：房间数据不在配置里，需要从平面图的墙体端点推算候选区域，
  // 因此这里的逻辑比其它选择器重一些。
  async function openVacuumRoomPicker(roomPickerTriggerEvent) {
    const vacuumModelRecord = findVacuumModel();
    if (!vacuumModelRecord || getItemList().length >= 64) {
      return;
    }
    const vacuumPickerGeneration = ++pickerGeneration;
    pickerHandle?.close();
    try {
      const vacuumRoomPickerHandle = await pickers.entity({
        trigger: roomPickerTriggerEvent,
        deviceKind: "vacuum-room",
        current: "",
        onSelect(pickedRoomEntityId) {
          if (
            isDisposed ||
            !isAccessAllowed ||
            vacuumPickerGeneration !== pickerGeneration ||
            findVacuumModel() !== vacuumModelRecord ||
            getItemList().length >= 64 ||
            !pickedRoomEntityId
          ) {
            return;
          }
          const entityMetadataEntry = entities.find(
            entityMetadataProbe => entityMetadataProbe.entityId === pickedRoomEntityId
          );
          const pickedEntityState = states?.get?.(pickedRoomEntityId);
          const normalizedEntityState = pickedEntityState?.newState || pickedEntityState;
          const roomModelFloor = sceneMetadata.floors.find(
            roomFloorRecord => roomFloorRecord.id === vacuumModelRecord.floorId
          );
          const roomVacuumModelData = roomModelFloor?.vacuums?.find(
            roomVacuumModelProbe => roomVacuumModelProbe.id === vacuumModelRecord.modelId
          );
          const wallEndpoints = (roomModelFloor?.plan?.walls || []).flatMap(wallSegment => [
            wallSegment.start,
            wallSegment.end
          ]);
          // 房间快捷入口的落点：房间实体在平面数据里没有自己的几何，只能用该楼层
          // 全部墙端点的坐标均值近似房间中心；没有墙数据时退回扫地机模型坐标。
          const averageWallCoordinate = axisKey =>
            wallEndpoints.length
              ? wallEndpoints.reduce(
                  (coordinateSum, wallPoint) => coordinateSum + wallPoint[axisKey],
                  0
                ) / wallEndpoints.length
              : roomVacuumModelData?.[axisKey] || 0;
          const roomShortcutItem = {
            id: randomUuid(),
            entityId: pickedRoomEntityId,
            label:
              entityMetadataEntry?.name ||
              normalizedEntityState?.attributes?.friendly_name ||
              pickedRoomEntityId,
            x: averageWallCoordinate("x"),
            y: averageWallCoordinate("y"),
            height: 0.08,
            size: 44,
            iconSize: 26,
            fontSize: 12,
            hitSize: 44,
            icon: "mdi:broom",
            visible: true
          };
          setItemList([...getItemList(), roomShortcutItem]);
          selectedItemId = roomShortcutItem.id;
          pickerGeneration++;
          pickerHandle?.close();
          pickerHandle = null;
          renderPanel();
          refreshEditorPreview();
        }
      });
      if (isDisposed || vacuumPickerGeneration !== pickerGeneration) {
        vacuumRoomPickerHandle?.close();
      } else {
        pickerHandle = vacuumRoomPickerHandle;
      }
    } catch (roomPickerError) {
      if (!isDisposed) {
        errorMessageElement.textContent = roomPickerError.message;
      }
    }
  }
  // 扫地机快捷指令面板：每条指令 = 绑定实体 + 图标 + 位置；
  // 位置在舞台上拖动后由 onEdit 回写。
  function renderVacuumShortcutPanel() {
    const scopeSectionElement = createConfigRow(createConfigSection("配置范围"));
    createSelectRow(
      scopeSectionElement,
      "配置内容",
      [
        ["vacuum", "设备与地图"],
        ["vacuum-shortcut", "快捷指令"]
      ],
      deviceKind,
      pickedScopeKey => {
        if (pickedScopeKey !== deviceKind) {
          switchEditorKind(pickedScopeKey);
        }
      }
    );
    if (!sceneMetadata) {
      return;
    }
    const vacuumModels = draftProperties.devices?.vacuums || [];
    if (!vacuumModels.length) {
      panelElement.append(createElement("p", "i3d-note", "请先在扫地机配置中添加并绑定扫地机。"));
      return;
    }
    createSelectRow(
      scopeSectionElement,
      "所属扫地机",
      vacuumModels.map(vacuumModelOption => [
        vacuumModelOption.id,
        vacuumModelOption.label || vacuumModelOption.deviceName || "扫地机"
      ]),
      vacuumId,
      pickedVacuumId => {
        vacuumId = pickedVacuumId;
        selectedItemId = "";
        baselineItemsById.clear();
        renderPanel();
        refreshEditorPreview({
          markDirty: false
        });
      }
    );
    const shortcutSectionElement = createConfigSection("快捷按钮");
    shortcutSectionElement.className += " i3d-compact-list";
    const shortcutHeaderRowElement = createElement("div", "i3d-config-list-row");
    const addShortcutButton = createButton("添加快捷指令", openAddDialog);
    addShortcutButton.disabled = getItemList().length >= 64;
    shortcutHeaderRowElement.append(addShortcutButton);
    shortcutSectionElement.append(shortcutHeaderRowElement);
    if (!getItemList().some(existingShortcutProbe => existingShortcutProbe.id === selectedItemId)) {
      selectedItemId = getItemList()[0]?.id || "";
    }
    if (!selectedItemId) {
      panelElement.append(
        createElement(
          "p",
          "i3d-note",
          "添加按钮后，选择全部实体中的清扫指令，在户型中拖动按钮放置。"
        )
      );
      return;
    }
    createSelectRow(
      shortcutHeaderRowElement,
      "当前按钮",
      getItemList().map(shortcutOptionItem => [shortcutOptionItem.id, shortcutOptionItem.label]),
      selectedItemId,
      pickedShortcutId => {
        selectedItemId = pickedShortcutId;
        pickerGeneration++;
        pickerHandle?.close();
        renderPanel();
        refreshEditorPreview({
          markDirty: false
        });
      }
    );
    const selectedShortcut = getItemList().find(
      matchedShortcut => matchedShortcut.id === selectedItemId
    );
    const removeShortcutButton = createButton("删除此快捷按钮", () => {
      pickerGeneration++;
      pickerHandle?.close();
      setItemList(
        getItemList().filter(removedShortcutProbe => removedShortcutProbe !== selectedShortcut)
      );
      selectedItemId = "";
      renderPanel();
      refreshEditorPreview();
    });
    removeShortcutButton.className = "i3d-remove-light";
    const bindingSectionElement = createConfigRow(createConfigSection("基础绑定"));
    const shortcutNameInput = createElement("input");
    shortcutNameInput.value = selectedShortcut.label;
    shortcutNameInput.maxLength = 128;
    shortcutNameInput.onchange = () => {
      selectedShortcut.label = shortcutNameInput.value.trim() || "房间清扫";
      renderPanel();
      refreshEditorPreview();
    };
    createSettingRow(bindingSectionElement, "名称", shortcutNameInput);
    // 快捷指令的实体选择器：选择器异步打开，用 pickerGeneration 作废过期回调，
    // 避免快速连点后把旧选择写进新字段。
    const openShortcutPicker = (pickerName, shortcutPickerTrigger) => {
      const shortcutPickerGeneration = ++pickerGeneration;
      Promise.resolve(
        pickers[pickerName]({
          trigger: shortcutPickerTrigger,
          deviceKind: "vacuum-room",
          current: pickerName === "icon" ? selectedShortcut.icon : selectedShortcut.entityId,
          onSelect(pickedShortcutValue) {
            if (
              !isDisposed &&
              !!isAccessAllowed &&
              shortcutPickerGeneration === pickerGeneration &&
              !!getItemList().includes(selectedShortcut)
            ) {
              if (pickerName === "icon") {
                selectedShortcut.icon = pickedShortcutValue;
              } else {
                selectedShortcut.entityId = pickedShortcutValue;
              }
              renderPanel();
              refreshEditorPreview();
            }
          }
        })
      )
        .then(shortcutPickerHandle => {
          if (isDisposed || shortcutPickerGeneration !== pickerGeneration) {
            shortcutPickerHandle?.close();
          } else {
            pickerHandle = shortcutPickerHandle;
          }
        })
        .catch(shortcutPickerError => {
          errorMessageElement.textContent = shortcutPickerError.message;
        });
    };
    const entityPickerButton = createButton(selectedShortcut.entityId || "选择实体（全部）", () =>
      openShortcutPicker("entity", entityPickerButton)
    );
    entityPickerButton.className = "i3d-picker-button";
    entityPickerButton.title = selectedShortcut.entityId || "";
    createSettingRow(bindingSectionElement, "指令实体", entityPickerButton);
    const shortcutAppearanceSectionElement = createConfigSection("按钮外观");
    const shortcutAppearanceRowElement = createConfigRow(shortcutAppearanceSectionElement);
    const iconPickerButton = createButton("", () => openShortcutPicker("icon", iconPickerButton));
    iconPickerButton.className = "i3d-picker-button i3d-icon-picker-button";
    const iconPreviewElement = createElement("i");
    iconPreviewElement.style.maskImage =
      "url('/static/vendor/mdi/7.4.47/svg/" +
      (selectedShortcut.icon || defaultIcon).slice(4) +
      ".svg')";
    iconPreviewElement.style.webkitMaskImage = iconPreviewElement.style.maskImage;
    iconPickerButton.append(
      iconPreviewElement,
      createElement("span", "", selectedShortcut.icon || defaultIcon)
    );
    createSettingRow(shortcutAppearanceRowElement, "图标", iconPickerButton);
    const shortcutVisibilityRowElement = createElement(
      "div",
      "i3d-button-visibility-row i3d-shortcut-visibility"
    );
    shortcutAppearanceSectionElement.append(shortcutVisibilityRowElement);
    for (const [visibilityPropertyKey, visibilityToggleLabel] of [
      ["hiddenClickable", "隐藏（可点击）"],
      ["buttonHidden", "隐藏（不可点击）"]
    ]) {
      const visibilityCheckboxElement = createElement("input");
      visibilityCheckboxElement.type = "checkbox";
      visibilityCheckboxElement.checked = selectedShortcut[visibilityPropertyKey] === true;
      visibilityCheckboxElement.onchange = () => {
        selectedShortcut[visibilityPropertyKey] = visibilityCheckboxElement.checked;
        if (visibilityCheckboxElement.checked) {
          selectedShortcut[
            visibilityPropertyKey === "buttonHidden" ? "hiddenClickable" : "buttonHidden"
          ] = false;
        }
        renderPanel();
        refreshEditorPreview();
      };
      createSettingRow(
        shortcutVisibilityRowElement,
        visibilityToggleLabel,
        visibilityCheckboxElement
      );
    }
    for (const [hiddenPropertyKey, hiddenToggleLabel] of [
      ["iconHidden", "隐藏图标"],
      ["labelHidden", "隐藏名称"]
    ]) {
      const hiddenCheckboxElement = createElement("input");
      hiddenCheckboxElement.type = "checkbox";
      hiddenCheckboxElement.checked = selectedShortcut[hiddenPropertyKey] === true;
      hiddenCheckboxElement.onchange = () => {
        selectedShortcut[hiddenPropertyKey] = hiddenCheckboxElement.checked;
        refreshEditorPreview();
      };
      createSettingRow(shortcutVisibilityRowElement, hiddenToggleLabel, hiddenCheckboxElement);
    }
    const shortcutSizeGridElement = createElement(
      "div",
      "i3d-coordinate-grid i3d-size-grid i3d-shortcut-size-grid"
    );
    const shortcutAdvancedDetailsElement = createElement("details");
    shortcutAdvancedDetailsElement.append(
      createElement("summary", "", "更多尺寸设置"),
      shortcutSizeGridElement
    );
    shortcutAppearanceSectionElement.append(shortcutAdvancedDetailsElement);
    for (const [sizePropertyKey, sizeSettingLabel, sizeDefaultValue] of [
      ["size", "按钮大小（px）", 44],
      ["iconSize", "图标大小（px）", 26],
      ["fontSize", "文字大小（px）", 12],
      ["hitSize", "触控范围（px）", 44]
    ]) {
      createSizeRow(
        sizePropertyKey === "size" ? shortcutAppearanceRowElement : shortcutSizeGridElement,
        sizeSettingLabel,
        () => selectedShortcut[sizePropertyKey] || sizeDefaultValue,
        updatedShortcutSize => {
          selectedShortcut[sizePropertyKey] = updatedShortcutSize;
          refreshEditorPreview();
        }
      );
    }
    const shortcutPositionSectionElement = createConfigSection("按钮位置");
    const shortcutPositionGridElement = createElement("div", "i3d-coordinate-grid");
    shortcutPositionSectionElement.append(shortcutPositionGridElement);
    for (const positionAxis of ["x", "y"]) {
      createNumberRow(
        shortcutPositionGridElement,
        "位置 " + positionAxis.toUpperCase(),
        selectedShortcut[positionAxis],
        -1000000,
        1000000,
        1,
        updatedShortcutPosition => {
          selectedShortcut[positionAxis] = updatedShortcutPosition;
          refreshEditorPreview();
        }
      );
    }
    createNumberRow(
      shortcutPositionGridElement,
      "高度（米）",
      selectedShortcut.height ?? 0.08,
      0,
      20,
      0.1,
      updatedShortcutHeight => {
        selectedShortcut.height = updatedShortcutHeight;
        refreshEditorPreview();
      }
    );
    shortcutPositionSectionElement.append(
      createElement(
        "p",
        "i3d-note",
        "拖动按钮调整位置，拖动空白处旋转户型。点击只执行绑定指令，不弹窗、不聚焦。"
      )
    );
    const shortcutBatchSectionElement = createElement(
      "section",
      "navigation-batch-section i3d-light-batch"
    );
    const shortcutBatchApplyButton = createButton("一键应用到其他快捷按钮", () =>
      openBatchApplyDialog(selectedShortcut)
    );
    shortcutBatchSectionElement.append(
      createElement("h4", "", "图标设置一键应用"),
      shortcutBatchApplyButton
    );
    panelElement.append(shortcutBatchSectionElement);
    refreshBatchButtons = () => {
      shortcutBatchApplyButton.disabled =
        !listChangedFields(selectedShortcut).length || !isAccessAllowed;
    };
    refreshBatchButtons();
    createConfigSection("绑定管理").append(removeShortcutButton);
  }
  // 配置面板的分区容器（标题 + 内容）。
  function createConfigSection(sectionTitle) {
    const configSectionElement = createElement("section", "i3d-config-section");
    configSectionElement.append(createElement("h4", "", sectionTitle));
    panelElement.append(configSectionElement);
    return configSectionElement;
  }
  // 配置行容器：一行一个字段，标签与控件左右排布。
  function createConfigRow(parentSectionElement) {
    const configRowElement = createElement("div", "i3d-config-row");
    parentSectionElement.append(configRowElement);
    return configRowElement;
  }
  // 右侧面板的总渲染：按当前编辑类型与选中项重建全部字段。
  // 这里是全量重绘（点选、拖拽结束都会触发），所以不要在内部做重活。
  function renderPanel() {
    refreshEffectSettings = () => {};
    refreshBatchButtons = () => {};
    panelElement.replaceChildren();
    let currentContainer = panelElement;
    if (isVacuumShortcutMode) {
      renderVacuumShortcutPanel();
      return;
    }
    if (sceneMetadata) {
      currentContainer = createConfigRow(createConfigSection("配置范围"));
      createSelectRow(
        currentContainer,
        "配置楼层",
        sceneMetadata.floors.map(floorOptionEntry => [floorOptionEntry.id, floorOptionEntry.name]),
        selectedFloorId,
        pickedFloorId => {
          selectedFloorId = pickedFloorId;
          refreshEditorPreview({
            markDirty: false
          });
          renderPanel();
        }
      );
      if (isDeviceKind) {
        createSelectRow(
          currentContainer,
          "设备类别",
          [
            ["nas", "NAS"],
            ["television", "电视"]
          ],
          deviceKind,
          pickedDeviceCategory => {
            if (pickedDeviceCategory !== deviceKind) {
              switchEditorKind(pickedDeviceCategory);
            }
          }
        );
      }
      if (isEnvironmentKind) {
        createSelectRow(
          currentContainer,
          "环境类别",
          [
            ["climate", "空调"],
            ["cover", "窗帘"]
          ],
          deviceKind,
          pickedEnvironmentCategory => {
            if (pickedEnvironmentCategory !== deviceKind) {
              switchEditorKind(pickedEnvironmentCategory);
            }
          }
        );
      }
      if (isVacuumMode) {
        createSelectRow(
          currentContainer,
          "配置内容",
          [
            ["vacuum", "设备与地图"],
            ["vacuum-shortcut", "快捷指令"]
          ],
          deviceKind,
          pickedVacuumCategory => {
            if (pickedVacuumCategory !== deviceKind) {
              switchEditorKind(pickedVacuumCategory);
            }
          }
        );
      }
      if (!usesModelBinding && draftProperties.lightingMode === "region") {
        const rangeSectionElement = createConfigSection("照射范围");
        const rangeEditorButton = createButton("编辑照射范围", async () => {
          if (!isRangeEditorOpen) {
            isRangeEditorOpen = true;
            rangeEditorButton.disabled = true;
            try {
              const rangeEditorHandle = await openInteraction3dRangeEditor({
                component: {
                  ...component,
                  properties: structuredClone(buildRuntimeProperties())
                },
                document: documentApi,
                states: states,
                onSave(savedLightRegion) {
                  if (isDisposed || !isAccessAllowed) {
                    throw new Error("灯光配置已关闭，请重新打开。");
                  }
                  draftProperties.lightRegionOverrides = structuredClone(savedLightRegion);
                  refreshEditorPreview();
                },
                onClose() {
                  subEditorHandle = null;
                  isRangeEditorOpen = false;
                  if (!isDisposed) {
                    renderPanel();
                  }
                }
              });
              if (isDisposed || !isAccessAllowed) {
                rangeEditorHandle.close();
                return;
              }
              subEditorHandle = rangeEditorHandle;
            } catch (rangeEditorError) {
              isRangeEditorOpen = false;
              if (!isDisposed) {
                errorMessageElement.textContent = rangeEditorError.message;
              }
            } finally {
              if (!isDisposed) {
                renderPanel();
              }
            }
          }
        });
        rangeEditorButton.dataset.interaction3dRangeEditor = "true";
        rangeEditorButton.disabled = isRangeEditorOpen || !draftProperties.sceneId;
        rangeSectionElement.append(
          rangeEditorButton,
          createElement(
            "p",
            "i3d-note",
            "在独立弹窗中拖动范围；保存范围后，再点击“保存配置”保存到当前控件。"
          )
        );
      }
      currentContainer = createConfigSection(usesModelBinding ? "模型列表" : "灯光列表");
      currentContainer.className += " i3d-compact-list";
      const listHeadingElement = createElement("div", "i3d-light-heading");
      const floorModels = listAddableModels();
      const addItemButton = createButton("添加" + kindLabel, openAddDialog);
      addItemButton.disabled = !floorModels.length || getItemList().length >= 128;
      listHeadingElement.className = "i3d-config-list-row";
      currentContainer.append(listHeadingElement);
      listHeadingElement.append(addItemButton);
      const floorItems = getItemList().filter(
        floorItemProbe =>
          floorItemProbe.floorId === selectedFloorId ||
          (usesModelBinding &&
            !sceneMetadata.floors.some(
              sceneFloorProbe => sceneFloorProbe.id === floorItemProbe.floorId
            ))
      );
      if (
        !floorItems.some(existingFloorItemProbe => existingFloorItemProbe.id === selectedItemId)
      ) {
        selectedItemId = floorItems[0]?.id || "";
      }
      if (floorItems.length) {
        createSelectRow(
          listHeadingElement,
          isDeviceKind ? "当前设备" : "当前按钮",
          floorItems.map(itemOptionEntry => [itemOptionEntry.id, itemOptionEntry.label]),
          selectedItemId,
          pickedItemId => {
            pickerGeneration++;
            pickerHandle?.close();
            selectedItemId = pickedItemId;
            refreshEditorPreview({
              markDirty: false
            });
            renderPanel();
          }
        );
      }
      const selectedItem = getItemList().find(
        matchedItemProbe => matchedItemProbe.id === selectedItemId
      );
      if (selectedItem) {
        const removeItemButton = createButton(
          isDeviceKind ? "删除此设备" : "删除此" + kindLabel + "按钮",
          () => {
            pickerGeneration++;
            pickerHandle?.close();
            setItemList(
              getItemList().filter(removedItemProbe => removedItemProbe.id !== selectedItem.id)
            );
            selectedItemId = "";
            refreshEditorPreview();
            renderPanel();
          }
        );
        removeItemButton.className = "i3d-remove-light";
        currentContainer = createConfigSection("基础绑定");
        const bindingContainer = currentContainer;
        const bindingRowElement = createConfigRow(bindingContainer);
        const nameInputElement = createElement("input");
        nameInputElement.value = selectedItem.label;
        nameInputElement.maxLength = 128;
        nameInputElement.addEventListener("change", () => {
          selectedItem.label = nameInputElement.value.trim() || kindLabel;
          refreshEditorPreview();
        });
        createSettingRow(bindingRowElement, "名称", nameInputElement);
        if (usesModelBinding) {
          const modelCandidates = sceneMetadata.floors
            .filter(candidateFloorProbe => candidateFloorProbe.id === selectedFloorId)
            .flatMap(candidateFloor =>
              (candidateFloor[collectionKey] || [])
                .filter(
                  candidateModel =>
                    !getItemList().some(
                      existingModelProbe =>
                        existingModelProbe !== selectedItem &&
                        existingModelProbe.floorId === candidateFloor.id &&
                        existingModelProbe.modelId === candidateModel.id
                    )
                )
                .map(modelCandidateEntry => ({
                  floor: candidateFloor,
                  model: modelCandidateEntry,
                  key: candidateFloor.id + "/" + modelCandidateEntry.id
                }))
            );
          const currentModelKey = selectedItem.floorId + "/" + selectedItem.modelId;
          const hasCurrentModel = modelCandidates.some(
            candidateKeyProbe => candidateKeyProbe.key === currentModelKey
          );
          const modelSelectOptions = modelCandidates.map(modelKeyEntry => [
            modelKeyEntry.key,
            describeItem(modelKeyEntry.model)
          ]);
          if (!hasCurrentModel) {
            modelSelectOptions.unshift([currentModelKey, "原模型已移除，请重新选择"]);
          }
          createSelectRow(
            bindingRowElement,
            "关联" + kindLabel + "模型",
            modelSelectOptions,
            currentModelKey,
            pickedModelKey => {
              const matchedModel = modelCandidates.find(
                matchedModelCandidate => matchedModelCandidate.key === pickedModelKey
              );
              if (!!matchedModel && pickedModelKey !== currentModelKey) {
                selectedItem.floorId = matchedModel.floor.id;
                selectedItem.modelId = matchedModel.model.id;
                delete selectedItem.focusCamera;
                delete selectedItem.followCamera;
                refreshEditorPreview();
                renderPanel();
              }
            }
          );
          if (!hasCurrentModel) {
            currentContainer.append(
              createElement(
                "p",
                "i3d-note",
                "原模型已移除，请重新选择。已保存的实体绑定和按钮设置仍然保留。"
              )
            );
          }
        }
        currentContainer = bindingContainer;
        // 通用实体 / 模型选择器入口，选择结果写回指定字段（支持嵌套路径）。
        const openItemPicker = async (targetField, itemPickerTrigger) => {
          const itemPickerGeneration = ++pickerGeneration;
          errorMessageElement.textContent = "";
          try {
            const pickerMethod = pickers?.[targetField === "powerEntity" ? "entity" : targetField];
            if (!pickerMethod) {
              throw new Error("选择器尚未准备好，请保存后刷新页面。");
            }
            const itemPickerHandle = await pickerMethod({
              trigger: itemPickerTrigger,
              deviceKind: targetField === "powerEntity" ? "television-power" : deviceKind,
              current:
                targetField === "vacuum"
                  ? selectedItem.deviceId
                  : targetField === "powerEntity"
                    ? selectedItem.powerEntityId
                    : targetField === "nas"
                      ? selectedItem.statusSource?.deviceId
                      : targetField === "icon"
                        ? selectedItem.icon
                        : selectedItem.entityId,
              onSelect(pickedFieldValue) {
                if (
                  !isDisposed &&
                  !!isAccessAllowed &&
                  itemPickerGeneration === pickerGeneration &&
                  !!getItemList().includes(selectedItem)
                ) {
                  if (targetField === "vacuum") {
                    selectedItem.deviceId = pickedFieldValue?.deviceId || "";
                    selectedItem.deviceName = pickedFieldValue?.name || "";
                    selectedItem.entityId =
                      pickedFieldValue?.entities.length === 1
                        ? pickedFieldValue.entities[0].entityId
                        : "";
                    selectedItem.relatedEntityIds = pickedFieldValue?.relatedEntityIds || [];
                    selectedItem.map = {
                      entityId:
                        pickedFieldValue?.maps.length === 1 ? pickedFieldValue.maps[0].entityId : ""
                    };
                    if (pickedFieldValue) {
                      selectedItem.label = pickedFieldValue.name;
                      devicesByDeviceId.set(pickedFieldValue.deviceId, pickedFieldValue);
                    }
                  } else if (targetField === "powerEntity") {
                    if (pickedFieldValue) {
                      selectedItem.powerEntityId = pickedFieldValue;
                    } else {
                      delete selectedItem.powerEntityId;
                    }
                  } else if (targetField === "nas") {
                    if (pickedFieldValue) {
                      if (selectedItem.statusSource?.deviceId === pickedFieldValue.deviceId) {
                        const metricOrderByEntityId = new Map(
                          selectedItem.statusSource.metrics.map(
                            (orderedMetricEntry, metricOrderIndex) => [
                              orderedMetricEntry.entityId,
                              metricOrderIndex
                            ]
                          )
                        );
                        pickedFieldValue.metrics.sort(
                          (comparedMetricEntry, otherMetricEntry) =>
                            (metricOrderByEntityId.get(comparedMetricEntry.entityId) ?? Infinity) -
                            (metricOrderByEntityId.get(otherMetricEntry.entityId) ?? Infinity)
                        );
                      }
                      if (
                        selectedItem.statusSource?.deviceId === pickedFieldValue.deviceId &&
                        Array.isArray(selectedItem.statusSource.groupOrder)
                      ) {
                        pickedFieldValue.groupOrder = [...selectedItem.statusSource.groupOrder];
                      }
                      if (
                        selectedItem.statusSource?.deviceId === pickedFieldValue.deviceId &&
                        Array.isArray(selectedItem.statusSource.visibleMetrics)
                      ) {
                        const previouslyVisibleMetrics = new Set(
                          selectedItem.statusSource.visibleMetrics
                        );
                        pickedFieldValue.visibleMetrics = pickedFieldValue.metrics
                          .filter(visibleMetricProbe =>
                            previouslyVisibleMetrics.has(visibleMetricProbe.entityId)
                          )
                          .map(visibleMetricEntry => visibleMetricEntry.entityId);
                      }
                      selectedItem.statusSource = pickedFieldValue;
                      selectedItem.entityId = "";
                      selectedItem.clickAction = "focus-panel";
                    } else {
                      delete selectedItem.statusSource;
                    }
                  } else if (targetField === "icon") {
                    selectedItem.icon = pickedFieldValue;
                  } else {
                    selectedItem.entityId = pickedFieldValue;
                  }
                  refreshEditorPreview();
                  renderPanel();
                }
              }
            });
            if (isDisposed || !isAccessAllowed || itemPickerGeneration !== pickerGeneration) {
              itemPickerHandle?.close();
            } else {
              pickerHandle = itemPickerHandle;
            }
          } catch (itemPickerError) {
            if (!isDisposed && itemPickerGeneration === pickerGeneration) {
              errorMessageElement.textContent = itemPickerError.message;
            }
          }
        };
        const itemEntityMetadata = entities.find(
          metadataLookupProbe => metadataLookupProbe.entityId === selectedItem.entityId
        );
        if (isNasMode) {
          const nasSourceButton = createButton(
            selectedItem.statusSource?.name || "选择飞牛或群晖",
            () => void openItemPicker("nas", nasSourceButton)
          );
          nasSourceButton.className = "i3d-picker-button";
          createSettingRow(currentContainer, "NAS 数据来源", nasSourceButton);
          if (selectedItem.statusSource) {
            const visibleMetricCount =
              selectedItem.statusSource.visibleMetrics?.length ??
              selectedItem.statusSource.metrics.length;
            const openMetricsButton = createButton(
              "选择显示内容（" + visibleMetricCount + " 项）",
              () => openMetricsDialog(selectedItem)
            );
            openMetricsButton.className = "i3d-picker-button";
            if (selectedItem.statusSource.metrics.length) {
              currentContainer.append(openMetricsButton);
            }
          }
          currentContainer.append(
            createElement(
              "p",
              "i3d-note",
              selectedItem.statusSource
                ? selectedItem.statusSource.metrics.length
                  ? "已匹配 " +
                    selectedItem.statusSource.metrics.length +
                    " 项状态。点击数据来源可重新匹配；弹窗只展示状态。"
                  : "已关联 NAS，暂未找到启用的状态指标。请在 Home Assistant 启用指标并同步目录，再点击数据来源重新匹配。"
                : "选择整台 NAS，自动匹配 CPU、内存、温度、存储和网络。无需逐个选择传感器。"
            )
          );
        }
        const boundEntityButton = createButton(
          "",
          () => void openItemPicker("entity", boundEntityButton)
        );
        boundEntityButton.className = "i3d-picker-button";
        boundEntityButton.title =
          selectedItem.entityId ||
          (usesModelBinding ? "选择" + kindLabel + "实体" : "选择灯或开关");
        boundEntityButton.append(
          createElement(
            "span",
            "",
            itemEntityMetadata?.name ||
              selectedItem.entityId ||
              (usesModelBinding ? "选择" + kindLabel + "实体" : "选择灯或开关")
          )
        );
        if (
          !isVacuumMode &&
          (!isNasMode || (!selectedItem.statusSource && selectedItem.entityId))
        ) {
          createSettingRow(
            currentContainer,
            isNasMode ? "指示灯状态实体（旧版兼容）" : "绑定实体",
            boundEntityButton
          );
        }
        if (isCoverMode) {
          currentContainer = createConfigSection("帘布外观");
          const curtainAppearanceRowElement = createConfigRow(currentContainer);
          const curtainKindSelect = createSelectRow(
            curtainAppearanceRowElement,
            "窗帘类型",
            [
              ["standard", "普通窗帘"],
              ["dream", "梦幻帘"]
            ],
            selectedItem.coverKind,
            pickedCurtainKind => {
              selectedItem.coverKind = pickedCurtainKind === "dream" ? "dream" : "standard";
              refreshEditorPreview();
            }
          );
          const curtainFabricRowElement = createConfigRow(currentContainer);
          const floorCurtainModel = sceneMetadata.floors
            .find(curtainFloorProbe => curtainFloorProbe.id === selectedItem.floorId)
            ?.curtains?.find(curtainModelProbe => curtainModelProbe.id === selectedItem.modelId);
          const curtainFabricSelect = createSelectRow(
            curtainFabricRowElement,
            "帘布类型",
            [
              ["cloth", "布帘"],
              ["sheer", "纱帘"]
            ],
            floorCurtainModel?.curtainFabric || selectedItem.curtainFabric,
            pickedCurtainFabric => {
              selectedItem.curtainFabric = pickedCurtainFabric === "sheer" ? "sheer" : "cloth";
              refreshEditorPreview();
            }
          );
          curtainFabricSelect.disabled = !!floorCurtainModel?.curtainFabric;
          if (floorCurtainModel?.curtainFabric) {
            curtainFabricSelect.title = "帘布类型继承户型模型，请在3D户型图绘制中调整";
          }
          if (floorCurtainModel?.curtainTrack && floorCurtainModel.curtainTrack !== "straight") {
            currentContainer.append(
              createElement(
                "p",
                "i3d-note",
                (floorCurtainModel.curtainTrack === "u" ? "U" : "L") +
                  " 型轨道，尺寸和合拢位置继承户型模型。"
              )
            );
          }
          createSelectRow(
            curtainFabricRowElement,
            "开合方向",
            [
              ["auto", "继承模型"],
              ["left", "向左收拢"],
              ["right", "向右收拢"],
              ["split", "双向收拢"]
            ],
            selectedItem.coverDirection,
            pickedCurtainDirection => {
              selectedItem.coverDirection = ["left", "right", "split"].includes(
                pickedCurtainDirection
              )
                ? pickedCurtainDirection
                : "auto";
              refreshEditorPreview();
            }
          );
          if (selectedItem.entityId) {
            currentContainer.append(
              createElement("p", "i3d-note", "开合状态跟随绑定实体；解除绑定后恢复预设的展示状态。")
            );
          } else {
            const unboundPositionOptions = [
              ["0", "关闭"],
              ["50", "半开"],
              ["100", "全开"]
            ];
            if (![0, 50, 100].includes(selectedItem.unboundPosition)) {
              unboundPositionOptions.push([
                String(selectedItem.unboundPosition),
                "打开 " + selectedItem.unboundPosition + "%"
              ]);
            }
            createSelectRow(
              currentContainer,
              "未绑定时显示",
              unboundPositionOptions,
              String(selectedItem.unboundPosition),
              pickedUnboundPosition => {
                selectedItem.unboundPosition = Number(pickedUnboundPosition);
                refreshEditorPreview();
              }
            );
            currentContainer.append(
              createElement(
                "p",
                "i3d-note",
                "仅设置 3D 帘布的展示状态；绑定实体后自动跟随实际开合。"
              )
            );
          }
        }
        if (isVacuumMode) {
          const vacuumDeviceButton = createButton(
            selectedItem.deviceName || "选择扫地机设备",
            () => void openItemPicker("vacuum", vacuumDeviceButton)
          );
          vacuumDeviceButton.className = "i3d-picker-button";
          createSettingRow(currentContainer, "绑定设备", vacuumDeviceButton);
          const cachedDeviceInfo = devicesByDeviceId.get(selectedItem.deviceId) || {
            entities: entities.filter(
              vacuumEntityProbe =>
                /^vacuum\./.test(vacuumEntityProbe.entityId) &&
                (vacuumEntityProbe.deviceId === selectedItem.deviceId ||
                  vacuumEntityProbe.entityId === selectedItem.deviceId)
            ),
            maps: entities.filter(
              mapEntityProbe =>
                /^(camera|image)\./.test(mapEntityProbe.entityId) &&
                mapEntityProbe.deviceId === selectedItem.deviceId
            )
          };
          if (cachedDeviceInfo?.entities.length > 1) {
            createSelectRow(
              currentContainer,
              "扫地机主实体",
              [
                ["", "请选择主实体"],
                ...cachedDeviceInfo.entities.map(deviceEntityOption => [
                  deviceEntityOption.entityId,
                  deviceEntityOption.name || deviceEntityOption.entityId
                ])
              ],
              selectedItem.entityId,
              pickedMainEntity => {
                selectedItem.entityId = pickedMainEntity;
                refreshEditorPreview();
              }
            );
          } else if (selectedItem.entityId) {
            currentContainer.append(
              createElement("p", "i3d-note", "已识别：" + selectedItem.entityId)
            );
          }
          currentContainer = createConfigSection("地图与移动");
          const followOffsetInput = createElement("input");
          Object.assign(followOffsetInput, {
            type: "number",
            min: "0",
            max: "300",
            step: "1",
            value: String(draftProperties.navigation?.followOffset ?? 16),
            title: "所有扫地机共用此标签偏移"
          });
          followOffsetInput.addEventListener("change", () => {
            if (!isAccessAllowed || isDisposed) {
              return;
            }
            const parsedOffsetValue =
              followOffsetInput.value.trim() === "" ? NaN : Number(followOffsetInput.value);
            if (Number.isFinite(parsedOffsetValue)) {
              draftProperties.navigation = {
                ...draftProperties.navigation,
                followOffset: Math.max(0, Math.min(300, parsedOffsetValue))
              };
              refreshEditorPreview();
            }
            followOffsetInput.value = String(draftProperties.navigation?.followOffset ?? 16);
          });
          createSettingRow(currentContainer, "跟随标签上移（px）", followOffsetInput);
          for (const [vacuumToggleKey, vacuumToggleLabel] of [
            ["motionEnabled", "跟随真实位置移动"],
            ["funMessages", "工作时显示趣味短句"]
          ]) {
            const vacuumToggleCheckbox = createElement("input");
            Object.assign(vacuumToggleCheckbox, {
              type: "checkbox",
              checked: selectedItem[vacuumToggleKey] !== false
            });
            vacuumToggleCheckbox.addEventListener("change", () => {
              selectedItem[vacuumToggleKey] = vacuumToggleCheckbox.checked;
              refreshEditorPreview();
            });
            createSettingRow(currentContainer, vacuumToggleLabel, vacuumToggleCheckbox);
          }
          if (cachedDeviceInfo?.maps.length > 1) {
            createSelectRow(
              currentContainer,
              "已识别的地图",
              [
                ["", "请选择地图"],
                ...cachedDeviceInfo.maps.map(mapOptionEntry => [
                  mapOptionEntry.entityId,
                  mapOptionEntry.name || mapOptionEntry.entityId
                ])
              ],
              selectedItem.map?.entityId || "",
              pickedMapEntityId => {
                selectedItem.map = {
                  ...selectedItem.map,
                  entityId: pickedMapEntityId
                };
                refreshEditorPreview();
                renderPanel();
              }
            );
          }
          const mapPickerButton = createButton(
            selectedItem.map?.entityId || "选择扫地机地图",
            async () => {
              const mapPickerGeneration = ++pickerGeneration;
              try {
                pickerHandle = await pickers.entity({
                  trigger: mapPickerButton,
                  deviceKind: "vacuum-map",
                  current: selectedItem.map?.entityId || "",
                  onSelect(pickedMapEntity) {
                    if (
                      !isDisposed &&
                      !!isAccessAllowed &&
                      mapPickerGeneration === pickerGeneration &&
                      !!getItemList().includes(selectedItem)
                    ) {
                      selectedItem.map = {
                        ...selectedItem.map,
                        entityId: pickedMapEntity
                      };
                      refreshEditorPreview();
                      renderPanel();
                    }
                  }
                });
              } catch (mapPickerError) {
                errorMessageElement.textContent = mapPickerError.message;
              }
            }
          );
          mapPickerButton.className = "i3d-picker-button";
          createSettingRow(currentContainer, "地图来源", mapPickerButton);
          const alignMapButton = createButton("底图对齐", () => {
            const mapEntityState =
              latestStates === null
                ? states?.get?.(selectedItem.map?.entityId)
                : latestStates[selectedItem.map?.entityId];
            const itemEntityState =
              latestStates === null
                ? states?.get?.(selectedItem.entityId)
                : latestStates[selectedItem.entityId];
            const mapIdentity = vacuumMapIdentity(mapEntityState, itemEntityState);
            const editableItemForMapEditor = {
              ...selectedItem,
              map: {
                ...selectedItem.map
              }
            };
            if (mapIdentity) {
              editableItemForMapEditor.map.sourceMapId = mapIdentity;
            } else {
              delete editableItemForMapEditor.map.sourceMapId;
            }
            subEditorHandle = openVacuumMapEditor({
              item: editableItemForMapEditor,
              floor: sceneMetadata.floors.find(
                mapFloorProbe => mapFloorProbe.id === selectedItem.floorId
              ),
              document: documentApi,
              pickers: pickers,
              onSave(savedMapData) {
                if (!isDisposed && isAccessAllowed && getItemList().includes(selectedItem)) {
                  selectedItem.map = savedMapData.map;
                  refreshEditorPreview();
                  renderPanel();
                }
              }
            });
          });
          currentContainer.append(alignMapButton);
        }
        if (isTelevisionMode) {
          const powerEntityButton = createButton(
            selectedItem.powerEntityId || "不单独绑定",
            () => void openItemPicker("powerEntity", powerEntityButton)
          );
          powerEntityButton.className = "i3d-picker-button";
          createSettingRow(currentContainer, "电视电源实体（可选）", powerEntityButton);
          currentContainer.append(
            createElement(
              "p",
              "i3d-note",
              "可绑定任意能提供开关状态的实体：开启显示 HOMEOS 海报，关闭黑屏。上方绑定媒体播放器后，有节目封面时优先显示封面；不单独绑定电源时，跟随媒体播放器的开关状态。"
            )
          );
        }
        if (isNasMode && !selectedItem.statusSource && selectedItem.entityId) {
          currentContainer.append(
            createElement(
              "p",
              "i3d-note",
              "旧版绑定仅按 on/off 控制指示灯，不会开关 NAS 或关联整台设备。安全状态表示告警，不应作为开机依据；选择 NAS 数据来源后将替换旧绑定。"
            )
          );
        }
        if (isNasMode) {
          currentContainer.append(
            createElement(
              "p",
              "i3d-note",
              selectedItem.statusSource
                ? "已选择 NAS 自身状态数据作为呼吸灯依据。安全状态只用于告警。"
                : "请先选择 NAS 数据来源，缺少 CPU 等个别指标也可绑定。"
            )
          );
        }
        currentContainer = createConfigSection("交互行为");
        createSelectRow(
          currentContainer,
          "点击" + kindLabel,
          usesStatusPanel
            ? [
                ["focus-panel", "聚焦并显示状态"],
                ["panel", "仅显示状态"],
                ["focus", "仅聚焦"]
              ]
            : isCoverMode
              ? [
                  ["focus", "聚焦并显示控制"],
                  ["panel", "仅显示控制"]
                ]
              : isClimateMode
                ? [
                    ["focus", "聚焦并显示控制"],
                    ["turn-on-focus", "聚焦并开启"],
                    ["turn-on", "仅开关空调"],
                    ["turn-on-panel", "开启并显示控制"]
                  ]
                : [
                    ["focus", "仅聚焦"],
                    ["turn-on-focus", "聚焦并开灯"],
                    ["turn-on", "仅开关灯"],
                    ["turn-on-panel", "开灯并弹窗"]
                  ],
          selectedItem.clickAction,
          pickedClickAction => {
            selectedItem.clickAction = normalizeClickAction(pickedClickAction);
            refreshEditorPreview();
          }
        );
        const clickActionVisibilityRow = createElement("div", "i3d-button-visibility-row");
        currentContainer.append(clickActionVisibilityRow);
        const hiddenClickableCheckbox = createElement("input");
        Object.assign(hiddenClickableCheckbox, {
          type: "checkbox",
          checked: selectedItem.hiddenClickable === true && selectedItem.buttonHidden !== true
        });
        hiddenClickableCheckbox.addEventListener("change", () => {
          selectedItem.hiddenClickable = hiddenClickableCheckbox.checked;
          if (hiddenClickableCheckbox.checked) {
            selectedItem.buttonHidden = false;
            buttonHiddenCheckbox.checked = false;
          }
          refreshEditorPreview();
        });
        createSettingRow(
          clickActionVisibilityRow,
          "隐藏（可点击）",
          hiddenClickableCheckbox
        ).parentElement.className += " i3d-hidden-clickable-setting";
        const buttonHiddenCheckbox = createElement("input");
        Object.assign(buttonHiddenCheckbox, {
          type: "checkbox",
          checked: selectedItem.buttonHidden === true
        });
        buttonHiddenCheckbox.addEventListener("change", () => {
          selectedItem.buttonHidden = buttonHiddenCheckbox.checked;
          if (buttonHiddenCheckbox.checked) {
            selectedItem.hiddenClickable = false;
            hiddenClickableCheckbox.checked = false;
          }
          refreshEditorPreview();
        });
        createSettingRow(
          clickActionVisibilityRow,
          "隐藏（不可点击）",
          buttonHiddenCheckbox
        ).parentElement.className += " i3d-hidden-clickable-setting";
        currentContainer = createConfigSection(isVacuumMode ? "状态标签" : "按钮外观");
        if (isCoverMode) {
          const iconStateReversedCheckbox = createElement("input");
          Object.assign(iconStateReversedCheckbox, {
            type: "checkbox",
            checked: selectedItem.iconStateReversed === true
          });
          iconStateReversedCheckbox.addEventListener("change", () => {
            selectedItem.iconStateReversed = iconStateReversedCheckbox.checked;
            refreshEditorPreview();
          });
          createSettingRow(currentContainer, "图标状态反向", iconStateReversedCheckbox);
        }
        const itemAppearanceRowElement = createConfigRow(currentContainer);
        if (!isVacuumMode) {
          const itemIconPickerButton = createButton(
            "",
            () => void openItemPicker("icon", itemIconPickerButton)
          );
          itemIconPickerButton.className = "i3d-picker-button i3d-icon-picker-button";
          const itemIconPreviewElement = createElement("i");
          itemIconPreviewElement.setAttribute("aria-hidden", "true");
          const iconMaskUrl =
            "/static/vendor/mdi/7.4.47/svg/" +
            selectedItem.icon.replace(/^mdi:/, "") +
            ".svg";
          itemIconPreviewElement.style.maskImage = 'url("' + iconMaskUrl + '")';
          itemIconPreviewElement.style.webkitMaskImage = 'url("' + iconMaskUrl + '")';
          itemIconPickerButton.append(
            itemIconPreviewElement,
            createElement("span", "", selectedItem.icon)
          );
          createSettingRow(itemAppearanceRowElement, "图标", itemIconPickerButton);
        }
        const sizeGridElement = createElement("div", "i3d-coordinate-grid i3d-size-grid");
        const sizeDetailsElement = createElement("details");
        sizeDetailsElement.append(createElement("summary", "", "更多尺寸设置"), sizeGridElement);
        currentContainer.append(sizeDetailsElement);
        // 触控范围（px）：显式配置过就用它，否则取「按钮大小」兜底，
        // 且不小于 44 —— 44px 是移动端可点区域的最小推荐尺寸（与 buildItemPayload 一致）。
        const readHitSize = () =>
          Number.isFinite(selectedItem.hitSize) && selectedItem.hitSize > 0
            ? selectedItem.hitSize
            : Math.max(44, selectedItem.size);
        createSizeRow(
          itemAppearanceRowElement,
          isVacuumMode ? "状态框缩放（%）" : "按钮大小（px）",
          () => (isVacuumMode ? Math.round((selectedItem.size / 44) * 100) : selectedItem.size),
          pickedSizeValue => {
            selectedItem.size = isVacuumMode ? (pickedSizeValue / 100) * 44 : pickedSizeValue;
            hitSizeInputElement.value = String(Number(readHitSize().toPrecision(12)));
            refreshEditorPreview();
          }
        );
        createSizeRow(
          sizeGridElement,
          isVacuumMode ? "文字大小（px）" : "图标大小（px）",
          () => (isVacuumMode ? selectedItem.iconSize / 2 : selectedItem.iconSize),
          pickedIconSizeValue => {
            selectedItem.iconSize = isVacuumMode ? pickedIconSizeValue * 2 : pickedIconSizeValue;
            refreshEditorPreview();
          }
        );
        const hitSizeInputElement = createSizeRow(
          sizeGridElement,
          "触控范围（px）",
          readHitSize,
          pickedHitSizeValue => {
            selectedItem.hitSize = pickedHitSizeValue;
            refreshEditorPreview();
          }
        );
        if (usesModelBinding) {
          currentContainer = createConfigSection(isVacuumMode ? "标签位置" : "按钮位置");
          const modelBindingEntry = sceneMetadata.floors
            .find(modelBindingFloorProbe => modelBindingFloorProbe.id === selectedItem.floorId)
            ?.[collectionKey]?.find(
              modelBindingModelProbe => modelBindingModelProbe.id === selectedItem.modelId
            );
          const positionGridElement = createElement("div", "i3d-coordinate-grid");
          currentContainer.append(positionGridElement);
          const resetPositionButton = createButton("恢复跟随模型", () => {
            delete selectedItem.x;
            delete selectedItem.y;
            delete selectedItem.height;
            refreshEditorPreview();
            renderPanel();
          });
          resetPositionButton.disabled = !["x", "y", "height"].some(positionKeyProbe =>
            Number.isFinite(selectedItem[positionKeyProbe])
          );
          for (const [
            coordinateKey,
            coordinateLabel,
            coordinateMin,
            coordinateMax,
            coordinateStep
          ] of [
            ["x", "位置 X", -1000000, 1000000, 1],
            ["y", "位置 Y", -1000000, 1000000, 1],
            ["height", "高度（米）", 0, 20, 0.1]
          ]) {
            const coordinateValue = Number.isFinite(selectedItem[coordinateKey])
              ? selectedItem[coordinateKey]
              : isVacuumMode && coordinateKey === "height"
                ? (Number(modelBindingEntry?.elevation) || 0) +
                  (Number(modelBindingEntry?.height) || 0.85) +
                  0.25
                : Number.isFinite(modelBindingEntry?.[coordinateKey])
                  ? modelBindingEntry[coordinateKey]
                  : 0;
            createNumberRow(
              positionGridElement,
              isVacuumMode && coordinateKey === "height" ? "离地高度（米）" : coordinateLabel,
              coordinateValue,
              coordinateMin,
              coordinateMax,
              coordinateStep,
              pickedCoordinateValue => {
                selectedItem[coordinateKey] = pickedCoordinateValue;
                resetPositionButton.disabled = false;
                refreshEditorPreview();
              }
            );
          }
          currentContainer.append(resetPositionButton);
          const lightBatchSectionElement = createElement(
            "section",
            "navigation-batch-section i3d-light-batch"
          );
          const batchTitleElement = createElement("h4");
          const batchCountElement = createElement("span");
          batchTitleElement.append(
            createElement("span", "", "图标设置一键应用"),
            batchCountElement
          );
          const lightBatchApplyButton = createButton("一键应用到其他" + kindLabel, () =>
            openBatchApplyDialog(selectedItem)
          );
          refreshBatchButtons = () => {
            const lightChangeCount = listChangedFields(selectedItem).length;
            batchCountElement.textContent = lightChangeCount + " 项修改";
            lightBatchApplyButton.disabled =
              !lightChangeCount || !isAccessAllowed || isCameraEditing || isCameraCommandPending;
          };
          refreshBatchButtons();
          lightBatchSectionElement.append(batchTitleElement, lightBatchApplyButton);
          currentContainer.append(lightBatchSectionElement);
        } else {
          currentContainer = createConfigSection("按钮位置");
          const lightPositionGridElement = createElement("div", "i3d-coordinate-grid");
          currentContainer.append(lightPositionGridElement);
          for (const lightPositionAxis of ["x", "y"]) {
            createNumberRow(
              lightPositionGridElement,
              "位置 " + lightPositionAxis.toUpperCase(),
              selectedItem[lightPositionAxis],
              -1000000,
              1000000,
              1,
              pickedLightX => {
                selectedItem[lightPositionAxis] = pickedLightX;
                refreshEditorPreview();
              }
            );
          }
          createNumberRow(
            lightPositionGridElement,
            "高度（米）",
            selectedItem.height,
            0,
            20,
            0.1,
            pickedLightHeight => {
              selectedItem.height = pickedLightHeight;
              refreshEditorPreview();
            }
          );
          createNumberRow(
            currentContainer,
            "缓开缓灭（秒）",
            selectedItem.fadeDuration,
            0,
            10,
            0.1,
            pickedFadeDuration => {
              selectedItem.fadeDuration = pickedFadeDuration;
              refreshEditorPreview();
            }
          );
          currentContainer = createConfigSection("灯光效果");
          const lightEffectContainerElement = createElement("div");
          currentContainer.append(lightEffectContainerElement);
          // 把影响效果面板渲染的字段压成一个签名（JSON 字符串）：这些值没变就整体跳过重绘，
          // 免得状态每上报一次就把用户正在操作的控件重建一遍。
          const lightStatusSignature = statusSnapshot =>
            JSON.stringify([
              statusSnapshot.known,
              statusSnapshot.brightnessSupported,
              statusSnapshot.temperatureSupported,
              statusSnapshot.minimum,
              statusSnapshot.maximum
            ]);
          const initialLightStatus = getLightStatus(selectedItem);
          let initialStatusSignature = lightStatusSignature(initialLightStatus);
          refreshEffectSettings = () => {
            if (
              isDisposed ||
              !isAccessAllowed ||
              isCameraEditing ||
              isCameraCommandPending ||
              lightEffectContainerElement.contains?.(document.activeElement)
            ) {
              return;
            }
            const refreshedLightStatus = getLightStatus(selectedItem);
            const refreshedStatusSignature = lightStatusSignature(refreshedLightStatus);
            if (refreshedStatusSignature !== initialStatusSignature) {
              initialStatusSignature = refreshedStatusSignature;
              renderEffectSettings(lightEffectContainerElement, selectedItem, refreshedLightStatus);
            }
          };
          lightEffectContainerElement.addEventListener("focusout", () =>
            queueMicrotask(refreshEffectSettings)
          );
          renderEffectSettings(lightEffectContainerElement, selectedItem, initialLightStatus);
          const lightEffectBatchSectionElement = createElement(
            "section",
            "navigation-batch-section i3d-light-batch"
          );
          const effectBatchTitleElement = createElement("h4");
          const effectBatchCountElement = createElement("span");
          effectBatchTitleElement.append(
            createElement("span", "", "灯光设置一键应用"),
            effectBatchCountElement
          );
          const effectBatchApplyButton = createButton("一键应用到其他灯光", () =>
            openBatchApplyDialog(selectedItem)
          );
          refreshBatchButtons = () => {
            const effectChangeCount = listChangedFields(selectedItem).length;
            effectBatchCountElement.textContent = effectChangeCount + " 项修改";
            effectBatchApplyButton.disabled =
              !effectChangeCount ||
              !isAccessAllowed ||
              isCameraEditing ||
              isCameraCommandPending ||
              isRangeEditorOpen;
          };
          refreshBatchButtons();
          lightEffectBatchSectionElement.append(effectBatchTitleElement, effectBatchApplyButton);
          currentContainer.append(lightEffectBatchSectionElement);
        }
        const focusSectionElement = createElement(
          "section",
          "i3d-focus-settings i3d-config-section"
        );
        panelElement.append(focusSectionElement);
        const cameraPropertyKey =
          isVacuumMode && vacuumCameraMode === "follow" ? "followCamera" : "focusCamera";
        focusSectionElement.append(
          createElement("h4", "", cameraPropertyKey === "followCamera" ? "跟随视角" : "聚焦视角")
        );
        if (isVacuumMode && !isCameraEditing) {
          const cameraModeActionsElement = createElement("div", "i3d-focus-actions");
          for (const [cameraModeKey, cameraModeLabel] of [
            ["focus", "聚焦视角"],
            ["follow", "跟随视角"]
          ]) {
            const cameraModeButton = createButton(cameraModeLabel, () => {
              vacuumCameraMode = cameraModeKey;
              renderPanel();
            });
            cameraModeButton.setAttribute(
              "aria-pressed",
              String(vacuumCameraMode === cameraModeKey)
            );
            cameraModeButton.disabled = isCameraCommandPending;
            cameraModeActionsElement.append(cameraModeButton);
          }
          focusSectionElement.append(cameraModeActionsElement);
        }
        if (cameraPropertyKey === "followCamera") {
          focusSectionElement.append(
            createElement(
              "p",
              "i3d-note",
              "固定鸟瞰角度跟随机器人平移，不随机器人转向。调整角度和远近后保存；跟随时不弹出控制面板。"
            )
          );
        }
        // 相机指令统一入队：同时只允许一条在途指令，队列保证先后的视角操作不会互相覆盖。
        const runCameraCommand = async (cameraCommand, cameraPayload) => {
          const sceneReadySnapshot = sceneReadyGeneration;
          const isFocalLengthCommand = cameraCommand === "focus-focal-length";
          const previousCameraQueue = cameraCommandQueue;
          let cameraQueueResolve;
          cameraCommandQueue = new Promise(resolveCameraQueuePromise => {
            cameraQueueResolve = resolveCameraQueuePromise;
          });
          if (!isFocalLengthCommand) {
            isCameraCommandPending = true;
            errorMessageElement.textContent = "";
            renderPanel();
          }
          try {
            await previousCameraQueue;
            if (isDisposed || sceneReadySnapshot !== sceneReadyGeneration) {
              return;
            }
            const cameraCommandResult = await editorRuntime.focusCommand(
              cameraPropertyKey === "followCamera" && cameraCommand === "edit-light-camera"
                ? "edit-follow-camera"
                : cameraCommand,
              selectedItem.id,
              cameraPayload
            );
            if (isDisposed || sceneReadySnapshot !== sceneReadyGeneration) {
              return;
            }
            if (cameraCommand === "save-light-camera") {
              selectedItem[cameraPropertyKey] = cameraCommandResult.camera;
              isCameraEditing = false;
              pendingCameraDraft = null;
              refreshEditorPreview();
            } else if (cameraCommand === "cancel-light-camera") {
              isCameraEditing = false;
              pendingCameraDraft = null;
            } else if (cameraCommand !== "preview-light-camera") {
              isCameraEditing = true;
              pendingCameraDraft = cameraCommandResult.camera;
            }
          } catch (cameraCommandError) {
            if (!isDisposed && sceneReadySnapshot === sceneReadyGeneration) {
              errorMessageElement.textContent = cameraCommandError.message;
            }
          } finally {
            cameraQueueResolve();
            if (
              !isDisposed &&
              sceneReadySnapshot === sceneReadyGeneration &&
              !isFocalLengthCommand
            ) {
              isCameraCommandPending = false;
              renderPanel();
            }
          }
        };
        const cameraActionsElement = createElement("div", "i3d-focus-actions");
        focusSectionElement.append(cameraActionsElement);
        if (isCameraEditing) {
          const saveCameraButton = createButton(
            usesModelBinding ? "保存此" + kindLabel + "视角" : "保存此灯视角",
            () => void runCameraCommand("save-light-camera")
          );
          saveCameraButton.className = "primary";
          cameraActionsElement.append(
            saveCameraButton,
            createButton("取消调整", () => void runCameraCommand("cancel-light-camera"))
          );
          const projectionGroupElement = createElement("div", "i3d-focus-actions");
          projectionGroupElement.setAttribute("role", "group");
          projectionGroupElement.setAttribute("aria-label", "聚焦投影");
          focusSectionElement.append(projectionGroupElement);
          for (const [projectionKey, projectionLabel] of [
            ["orthographic", "正交"],
            ["perspective", "透视"]
          ]) {
            const projectionButton = createButton(
              projectionLabel,
              () => void runCameraCommand("focus-projection", projectionKey)
            );
            projectionButton.setAttribute(
              "aria-pressed",
              String((pendingCameraDraft?.mode || "orthographic") === projectionKey)
            );
            projectionGroupElement.append(projectionButton);
          }
          const focalLengthInput = createNumberRow(
            focusSectionElement,
            "焦段（mm）",
            Math.round(pendingCameraDraft?.focalLength || 50),
            18,
            120,
            1,
            pickedFocalLength => void runCameraCommand("focus-focal-length", pickedFocalLength)
          );
          focalLengthInput.disabled = pendingCameraDraft?.mode !== "perspective";
        } else {
          cameraActionsElement.append(
            createButton(
              selectedItem[cameraPropertyKey] ? "调整视角" : "设置视角",
              () => void runCameraCommand("edit-light-camera")
            ),
            ...(cameraPropertyKey === "followCamera"
              ? []
              : [createButton("预览聚焦", () => void runCameraCommand("preview-light-camera"))])
          );
          const resetCameraButton = createButton(
            cameraPropertyKey === "followCamera"
              ? "恢复默认鸟瞰"
              : selectedItem[cameraPropertyKey]
                ? "恢复自动聚焦"
                : "自动聚焦",
            async () => {
              try {
                await editorRuntime.focusCommand("cancel-light-camera", selectedItem.id);
                delete selectedItem[cameraPropertyKey];
                refreshEditorPreview();
                renderPanel();
              } catch (resetCameraError) {
                errorMessageElement.textContent = resetCameraError.message;
              }
            }
          );
          resetCameraButton.disabled = !selectedItem[cameraPropertyKey];
          resetCameraButton.className = "i3d-focus-reset";
          focusSectionElement.append(resetCameraButton);
        }
        if (isCameraCommandPending) {
          for (const focusSettingControl of focusSectionElement.querySelectorAll("button, input")) {
            focusSettingControl.disabled = true;
          }
        }
        createConfigSection("绑定管理").append(removeItemButton);
      } else {
        currentContainer.append(
          createElement(
            "p",
            "i3d-note",
            isVacuumMode
              ? floorModels.length
                ? "点击“添加扫地机”，选择模型后绑定扫地机设备。"
                : "当前楼层暂无扫地机模型，请先在 3D 户型图绘制中添加扫地机器人后更新户型。"
              : isTelevisionMode
                ? floorModels.length
                  ? "点击“添加设备”，选择电视模型并绑定媒体播放器实体。"
                  : "当前楼层暂无电视模型，请先在 3D 户型图绘制中添加电视后更新户型。"
                : isNasMode
                  ? floorModels.length
                    ? "点击“添加设备”，选择设备类型和模型，再绑定开启实体。"
                    : "当前楼层暂无 NAS 模型，请先在 3D 户型图绘制中添加 NAS 模型后更新户型。"
                  : isCoverMode
                    ? floorModels.length
                      ? "点击“添加窗帘”，选择需要控制的窗帘模型。"
                      : "当前楼层暂无窗帘模型，请先在 3D 户型图绘制中添加普通窗帘后更新户型。"
                    : isClimateMode
                      ? floorModels.length
                        ? "点击“添加空调”，选择需要控制的空调模型。"
                        : "当前楼层暂无空调模型，请先在 3D 户型图绘制中添加壁挂空调、柜机或出风口后更新户型。"
                      : floorModels.length
                        ? "点击“添加灯光”，选择需要控制的灯组。"
                        : "当前楼层暂无灯组，请先在 3D 户型图绘制中添加灯组后更新户型。"
          )
        );
      }
    }
    panelElement.append(errorMessageElement);
    syncSaveButtonState();
    if (isCameraEditing || isCameraCommandPending) {
      for (const focusLockedControl of panelElement.querySelectorAll("input, select, button")) {
        if (!focusLockedControl.closest(".i3d-focus-settings")) {
          focusLockedControl.disabled = true;
        }
      }
    }
    if (isRangeEditorOpen) {
      for (const rangeLockedControl of panelElement.querySelectorAll("input, select, button")) {
        if (rangeLockedControl.dataset.interaction3dRangeEditor !== "true") {
          rangeLockedControl.disabled = true;
        }
      }
    }
  }
  // 挂载编辑器内的预览舞台：editing=true，并接管 onReady（渲染面板）、
  // onEdit（点选 / 拖拽 / 相机回写）、onStates（状态刷新）三个回调。
  function mountEditorRuntime() {
    editorRuntime = mountInteraction3d(stageHostElement, {
      component: {
        ...component,
        properties: buildRuntimeProperties()
      },
      context: {
        document: documentApi,
        states: states,
        entityMetadata: new Map(
          entities.map(metadataEntryItem => [metadataEntryItem.entityId, metadataEntryItem])
        )
      },
      editing: true,
      editingVacuumId: isVacuumShortcutMode ? vacuumId : "",
      editingModule: usesStatusPanel
        ? deviceKind
        : isCoverMode
          ? "cover"
          : isClimateMode
            ? "climate"
            : "light",
      onStates(statesSnapshot) {
        if (!isDisposed) {
          latestStates = statesSnapshot;
          if (!usesModelBinding) {
            for (const statusListItem of getItemList()) {
              getLightStatus(statusListItem);
            }
          }
          refreshEffectSettings();
        }
      },
      onReady(sceneMetadataPayload) {
        sceneReadyGeneration++;
        isCameraEditing = false;
        isCameraCommandPending = false;
        pendingCameraDraft = null;
        sceneMetadata = sceneMetadataPayload;
        if (
          !sceneMetadata.floors.some(sceneFloorLookup => sceneFloorLookup.id === selectedFloorId)
        ) {
          selectedFloorId = sceneMetadata.floors[0]?.id || "";
        }
        renderPanel();
        refreshEditorPreview({
          markDirty: false
        });
        if (shouldStartAdding) {
          shouldStartAdding = false;
          queueMicrotask(openAddDialog);
        }
      },
      onEdit(editEvent) {
        if (!isDisposed && !!isAccessAllowed && !addDialogState && !auxDialogElement) {
          if (editEvent.action === "light-region-overrides") {
            draftProperties.lightRegionOverrides = structuredClone(editEvent.overrides || {});
            changeRevisionCount++;
            syncDraftDirtyState();
          }
          if (isVacuumShortcutMode) {
            const roomShortcut = getItemList().find(
              roomShortcutProbe =>
                "vacuum-room:" + vacuumId + ":" + roomShortcutProbe.id === editEvent.id
            );
            if (roomShortcut) {
              selectedItemId = roomShortcut.id;
              if (editEvent.action === "position") {
                roomShortcut.x = editEvent.x;
                roomShortcut.y = editEvent.y;
                refreshEditorPreview();
              }
              renderPanel();
              if (editEvent.action === "select") {
                refreshEditorPreview({
                  markDirty: false
                });
              }
            }
            return;
          }
          if (isVacuumMode && editEvent.id?.startsWith("vacuum-room:")) {
            const shortcutOwner = getItemList().find(shortcutOwnerProbe =>
              (shortcutOwnerProbe.shortcuts || []).some(
                ownerShortcutProbe =>
                  "vacuum-room:" + shortcutOwnerProbe.id + ":" + ownerShortcutProbe.id ===
                  editEvent.id
              )
            );
            const matchedShortcutItem = shortcutOwner?.shortcuts.find(
              matchedOwnerShortcutProbe =>
                "vacuum-room:" + shortcutOwner.id + ":" + matchedOwnerShortcutProbe.id ===
                editEvent.id
            );
            if (matchedShortcutItem) {
              selectedItemId = shortcutOwner.id;
              if (editEvent.action === "position") {
                matchedShortcutItem.x = editEvent.x;
                matchedShortcutItem.y = editEvent.y;
                refreshEditorPreview();
              }
              if (editEvent.action === "select") {
                renderPanel();
              }
            }
            return;
          }
          if (editEvent.action === "focus-exited") {
            isCameraEditing = false;
            pendingCameraDraft = null;
            renderPanel();
          }
          if (editEvent.action === "select") {
            selectedItemId = editEvent.id;
            renderPanel();
            refreshEditorPreview({
              markDirty: false
            });
          }
          if (editEvent.action === "position") {
            const positionedItem = getItemList().find(
              positionCandidateProbe => positionCandidateProbe.id === editEvent.id
            );
            if (positionedItem) {
              positionedItem.x = editEvent.x;
              positionedItem.y = editEvent.y;
              refreshEditorPreview();
            }
          }
          if (editEvent.action === "camera") {
            draftProperties.floorCameras = {
              ...draftProperties.floorCameras,
              [selectedFloorId]: editEvent.camera
            };
            if (selectedFloorId === draftProperties.floorSelection) {
              draftProperties.camera = editEvent.camera;
            }
            changeRevisionCount++;
            syncDraftDirtyState();
            errorMessageElement.textContent = isDirty
              ? "默认视角已记录，保存配置后生效。"
              : "";
          }
        }
      }
    });
  }
  // 订阅编辑授权：未授权时面板 inert、关掉所有子弹窗并作废在途回调；
  // 授权恢复后重新挂载（或恢复）预览运行时；被明确拒绝时直接卸载运行时。
  const accessUnsubscribe = subscribeInteraction3dAccess(accessState => {
    if (!isDisposed) {
      isAccessAllowed = accessState.allowed;
      syncSaveButtonState();
      panelElement.inert = !isAccessAllowed;
      statusElement.hidden =
        isAccessAllowed || (!!editorRuntime && accessState.status !== "denied");
      statusElement.textContent =
        accessState.status === "denied" || accessState.status === "unavailable"
          ? accessState.message
          : "正在准备户型…";
      if (isAccessAllowed) {
        if (editorRuntime) {
          editorRuntime.setAuthorized(true);
        } else {
          mountEditorRuntime();
        }
      } else {
        closeAddDialog();
        closeAuxDialog();
        subEditorHandle?.close();
        pickerGeneration++;
        pickerHandle?.close();
        sceneReadyGeneration++;
        isCameraEditing = false;
        isCameraCommandPending = false;
        pendingCameraDraft = null;
        renderPanel();
        editorRuntime?.setAuthorized(false);
        if (accessState.status === "denied") {
          editorRuntime?.();
          editorRuntime = null;
          renderPanel();
        }
      }
    }
  });
  renderPanel();
  // 先渲染面板再 showModal：反过来会出现弹窗先以空面板亮相、随后跳动一下的观感。
  editorDialogElement.showModal();
  document.dispatchEvent(new Event("hb-i3d-preview-scope"));
  syncPreviewSize();
}
/**
 * 打开「整体外观」编辑器（曝光 / 主光 / 补光与阴影等 baseLighting 参数）。
 *
 * 与配置编辑器的区别：它改的是整份户型文档层面的光照，保存回调收到的也是
 * baseLighting 草稿；复用同一套授权门禁与脏标记口径。
 *
 * @param {object} options 配置项：component 控件描述、onSave 保存回调。
 * @returns {Promise<void>} 弹窗关闭后 resolve。
 */
export async function openInteraction3dAppearanceEditor({
  component: appearanceComponent,
  onSave: onAppearanceSave
}) {
  await requestInteraction3dAccess();
  const editorView = getInteraction3dEditorView(appearanceComponent.id);
  if (!editorView?.metadata) {
    throw new Error("户型还在加载，请稍候再打开进阶设置。");
  }
  const appearanceProperties = structuredClone(appearanceComponent.properties || {});
  const isRegionLighting =
    normalizeInteraction3dLightingMode(appearanceProperties.lightingMode) === "region";
  const sourceBaseLighting = {
    ...editorView.metadata.defaults,
    ...structuredClone(appearanceProperties.baseLighting || editorView.metadata.baseLighting || {})
  };
  if (isRegionLighting && sourceBaseLighting.floorBrightness === undefined) {
    sourceBaseLighting.floorBrightness =
      editorView.metadata.baseLighting?.floorBrightness ?? 100;
  }
  let baseLightingDraft = normalizeBaseLighting(sourceBaseLighting);
  const openLightingSnapshot = structuredClone(baseLightingDraft);
  let isAppearanceClosed = false;
  let isAppearanceDirty = false;
  const appearanceStyleLinkElement = document.createElement("link");
  appearanceStyleLinkElement.rel = "stylesheet";
  appearanceStyleLinkElement.href =
    "/api/v1/modules/interaction3d/runtime.css?v=20260918233037";
  document.head.append(appearanceStyleLinkElement);
  // 建「纯」元素的小工具（可选带文本）：外观弹窗里的节点不需要类名，
  // 与上面带类名的 createElement 区分开，避免传一堆空字符串。
  const createPlainElement = (plainTagName, plainText = "") => {
    const plainElement = document.createElement(plainTagName);
    plainElement.textContent = plainText;
    return plainElement;
  };
  const appearanceDialogElement = createPlainElement("dialog");
  appearanceDialogElement.className = "i3d-editor i3d-appearance-editor";
  appearanceDialogElement.setAttribute("aria-label", "户型进阶设置");
  const appearanceHeaderElement = createPlainElement("header");
  const appearanceBodyElement = createPlainElement("div");
  appearanceBodyElement.className = "i3d-appearance-body";
  const appearanceErrorElement = createPlainElement("p");
  appearanceErrorElement.className = "i3d-error";
  appearanceErrorElement.setAttribute("role", "status");
  let dragState;
  // 按锚点坐标摆放外观弹窗（相对宿主控件的左侧 / 顶部对齐）。
  const positionAppearanceDialog = (targetLeft, targetTop) => {
    const dialogRect = appearanceDialogElement.getBoundingClientRect();
    Object.assign(appearanceDialogElement.style, {
      margin: "0",
      right: "auto",
      bottom: "auto",
      left: Math.max(8, Math.min(targetLeft, window.innerWidth - dialogRect.width - 8)) + "px",
      top: Math.max(8, Math.min(targetTop, window.innerHeight - dialogRect.height - 8)) + "px"
    });
  };
  // 跟随目标控件重新定位：窗口尺寸变化、祖先滚动都会触发，
  // 所以位置是现算的而不是缓存的。
  const repositionAppearanceDialog = () => {
    const currentRect = appearanceDialogElement.getBoundingClientRect();
    positionAppearanceDialog(currentRect.left, currentRect.top);
  };
  appearanceHeaderElement.title = "按住标题栏拖动";
  appearanceHeaderElement.addEventListener("pointerdown", pointerDownEvent => {
    if (pointerDownEvent.button !== 0 || pointerDownEvent.target.closest("button")) {
      return;
    }
    pointerDownEvent.preventDefault();
    const dragStartRect = appearanceDialogElement.getBoundingClientRect();
    dragState = {
      id: pointerDownEvent.pointerId,
      x: pointerDownEvent.clientX,
      y: pointerDownEvent.clientY,
      left: dragStartRect.left,
      top: dragStartRect.top
    };
    appearanceHeaderElement.setPointerCapture(pointerDownEvent.pointerId);
  });
  appearanceHeaderElement.addEventListener("pointermove", pointerMoveEvent => {
    if (!!dragState && dragState.id === pointerMoveEvent.pointerId) {
      positionAppearanceDialog(
        dragState.left + pointerMoveEvent.clientX - dragState.x,
        dragState.top + pointerMoveEvent.clientY - dragState.y
      );
    }
  });
  for (const pointerEndEventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    appearanceHeaderElement.addEventListener(pointerEndEventName, () => {
      dragState = null;
    });
  }
  window.addEventListener("resize", repositionAppearanceDialog);
  // 外观保存按钮只在草稿与快照有差异时可用 —— 复用 editorDraftHasChanges，
  // 与配置编辑器保持同一套「是否有改动」的判断口径。
  const syncAppearanceSaveButton = () => {
    if (!isAppearanceClosed) {
      appearanceSaveButton.disabled = !isAppearanceDirty;
    }
  };
  // 把光照草稿即时应用到舞台（所见即所得）；
  // 真正落库仍要走保存按钮，这里只做预览。
  const applyAppearanceLighting = () => {
    isAppearanceDirty = editorDraftHasChanges(baseLightingDraft, openLightingSnapshot);
    syncAppearanceSaveButton();
    editorView.update({
      ...appearanceProperties,
      baseLighting: baseLightingDraft
    });
  };
  // 关闭外观弹窗；shouldKeepLighting 为 true 表示保留当前预览光照
  // （保存流程会用到，避免关闭瞬间画面闪回旧光照）。
  const closeAppearanceEditor = (shouldKeepLighting = false) => {
    if (!isAppearanceClosed) {
      isAppearanceClosed = true;
      if (!shouldKeepLighting) {
        editorView.update({
          ...appearanceProperties,
          baseLighting: structuredClone(openLightingSnapshot)
        });
      }
      window.removeEventListener("resize", repositionAppearanceDialog);
      appearanceDialogElement.close();
      appearanceDialogElement.remove();
      appearanceStyleLinkElement.remove();
    }
  };
  const appearanceSaveButton = createPlainElement("button", "完成");
  appearanceSaveButton.type = "button";
  appearanceSaveButton.className = "primary";
  appearanceSaveButton.disabled = true;
  appearanceSaveButton.addEventListener("click", async () => {
    if (!isAppearanceClosed && isAppearanceDirty && !appearanceSaveButton.disabled) {
      appearanceSaveButton.disabled = true;
      appearanceErrorElement.textContent = "";
      try {
        await requestInteraction3dAccess();
        if (isAppearanceClosed) {
          return;
        }
        const normalizedLighting = normalizeBaseLighting(baseLightingDraft);
        await onAppearanceSave(normalizedLighting);
        baseLightingDraft = normalizedLighting;
        isAppearanceDirty = false;
        closeAppearanceEditor(true);
      } catch (appearanceSaveError) {
        if (!isAppearanceClosed) {
          appearanceErrorElement.textContent =
            appearanceSaveError.message || "保存失败，请重试。";
          syncAppearanceSaveButton();
        }
      }
    }
  });
  const appearanceCancelButton = createPlainElement("button", "取消");
  appearanceCancelButton.type = "button";
  appearanceCancelButton.addEventListener("click", () => closeAppearanceEditor());
  const dragHintElement = createPlainElement("span", "拖动");
  dragHintElement.className = "i3d-drag-hint";
  appearanceHeaderElement.append(
    createPlainElement("strong", "户型进阶设置"),
    dragHintElement,
    appearanceSaveButton,
    appearanceCancelButton
  );
  const appearanceInputsByKey = new Map();
  const floorBrightnessResetters = [];
  const appearanceSections = isRegionLighting
    ? [
        [
          "整体画面",
          APPEARANCE_GROUPS[0][1].filter(
            ([, appearanceFieldKey]) => appearanceFieldKey === "exposure"
          )
        ]
      ]
    : APPEARANCE_GROUPS;
  for (const [sectionTitleText, sectionFields] of appearanceSections) {
    const appearanceGroupSectionElement = createPlainElement("section");
    const appearanceGridElement = createPlainElement("div");
    appearanceGridElement.className = "i3d-appearance-grid";
    appearanceGroupSectionElement.append(
      createPlainElement("h4", sectionTitleText),
      appearanceGridElement
    );
    for (const [
      fieldLabelText,
      appearanceFieldName,
      fieldMinValue,
      fieldMaxValue,
      fieldStepValue
    ] of sectionFields) {
      const inputLabelElement = createPlainElement("label");
      const fieldInputElement = createPlainElement("input");
      Object.assign(fieldInputElement, {
        name: "i3d-base-light-" + appearanceFieldName,
        type: "number",
        min: String(fieldMinValue),
        max: String(fieldMaxValue),
        step: String(fieldStepValue),
        value: String(baseLightingDraft[appearanceFieldName])
      });
      fieldInputElement.addEventListener("input", () => {
        if (Number.isFinite(fieldInputElement.valueAsNumber)) {
          baseLightingDraft[appearanceFieldName] = Math.max(
            fieldMinValue,
            Math.min(fieldMaxValue, fieldInputElement.valueAsNumber)
          );
          applyAppearanceLighting();
        }
      });
      inputLabelElement.append(createPlainElement("span", fieldLabelText), fieldInputElement);
      appearanceGridElement.append(inputLabelElement);
      appearanceInputsByKey.set(appearanceFieldName, fieldInputElement);
    }
    appearanceBodyElement.append(appearanceGroupSectionElement);
  }
  if (isRegionLighting) {
    const floorColorSectionElement = createPlainElement("section");
    const floorColorLabelElement = createPlainElement("label");
    const floorColorControlsElement = createPlainElement("div");
    floorColorSectionElement.append(createPlainElement("h4", "地面颜色"));
    floorColorControlsElement.className = "i3d-floor-brightness";
    const floorBrightnessRangeInput = createPlainElement("input");
    const floorBrightnessNumberInput = createPlainElement("input");
    Object.assign(floorBrightnessRangeInput, {
      type: "range",
      min: "50",
      max: "150",
      step: "1",
      value: String(baseLightingDraft.floorBrightness)
    });
    Object.assign(floorBrightnessNumberInput, {
      type: "number",
      name: "i3d-base-light-floorBrightness",
      min: "50",
      max: "150",
      step: "1",
      value: floorBrightnessRangeInput.value
    });
    floorBrightnessRangeInput.setAttribute("aria-label", "地面颜色深浅");
    floorBrightnessNumberInput.setAttribute("aria-label", "地面亮度百分比");
    // 落定地面亮度：非有限输入（空串、粘贴的脏值）直接忽略；有效值夹到 50~150，
    // 与滑杆的 min/max 一致（100 为原色），再把滑杆与数字框同步成同一个值。
    const commitFloorBrightness = floorBrightnessInput => {
      if (Number.isFinite(floorBrightnessInput.valueAsNumber)) {
        baseLightingDraft.floorBrightness = Math.max(
          50,
          Math.min(150, floorBrightnessInput.valueAsNumber)
        );
        floorBrightnessRangeInput.value = floorBrightnessNumberInput.value = String(
          baseLightingDraft.floorBrightness
        );
        applyAppearanceLighting();
      }
    };
    floorBrightnessRangeInput.addEventListener("input", () =>
      commitFloorBrightness(floorBrightnessRangeInput)
    );
    floorBrightnessNumberInput.addEventListener("input", () =>
      commitFloorBrightness(floorBrightnessNumberInput)
    );
    floorColorControlsElement.append(
      createPlainElement("span", "深"),
      floorBrightnessRangeInput,
      createPlainElement("span", "浅"),
      floorBrightnessNumberInput,
      createPlainElement("span", "%")
    );
    floorColorLabelElement.append(floorColorControlsElement);
    floorColorSectionElement.append(
      floorColorLabelElement,
      createPlainElement("p", "100% 为原色，仅调整户型地面，保留纹理与阴影。")
    );
    appearanceBodyElement.insertBefore(
      floorColorSectionElement,
      appearanceBodyElement.children[1] || null
    );
    appearanceInputsByKey.set("floorBrightness", floorBrightnessNumberInput);
    floorBrightnessResetters.push(() => {
      floorBrightnessRangeInput.value = "100";
    });
  }
  const restoreDefaultsButton = createPlainElement("button", "恢复默认");
  restoreDefaultsButton.type = "button";
  restoreDefaultsButton.addEventListener("click", () => {
    baseLightingDraft = normalizeBaseLighting({
      ...DEFAULT_BASE_LIGHTING,
      ...(isRegionLighting
        ? {
            floorBrightness: 100
          }
        : {})
    });
    for (const [defaultSettingName, appearanceInputElement] of appearanceInputsByKey) {
      appearanceInputElement.value = String(baseLightingDraft[defaultSettingName]);
    }
    floorBrightnessResetters.forEach(resetFloorBrightness => resetFloorBrightness());
    applyAppearanceLighting();
  });
  const appearanceNoteElement = createPlainElement(
    "p",
    isRegionLighting
      ? "曝光影响整体画面，地面颜色深浅独立调整。完成后点击页面上方保存。"
      : "调整当前户型的整体光照与阴影。完成后点击页面上方保存，仅保存至当前 3D 控件。"
  );
  appearanceNoteElement.className = "i3d-note";
  appearanceBodyElement.append(
    restoreDefaultsButton,
    appearanceNoteElement,
    appearanceErrorElement
  );
  appearanceDialogElement.append(appearanceHeaderElement, appearanceBodyElement);
  document.body.append(appearanceDialogElement);
  appearanceDialogElement.addEventListener("cancel", appearanceCancelEvent => {
    appearanceCancelEvent.preventDefault();
    closeAppearanceEditor();
  });
  appearanceDialogElement.showModal();
}
