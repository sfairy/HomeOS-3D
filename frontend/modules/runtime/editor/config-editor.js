/**
 * 3D 控件的配置编辑器（弹窗形态，挂在宿主页上）。
 * 位置：interaction3d 的「编辑侧」，不直接操作 three.js，而是复用 runtime.js 的 mountInteraction3d
 * 在弹窗里挂 editing=true 的预览舞台，用户在舞台上点选 / 拖拽标记，结果写进草稿 draftProperties。
 * 职责：所有编辑只改草稿，保存时把整份快照交给 onSave（落库与 revision 冲突由宿主侧处理）；
 * 退出（点「退出」或 Esc）直接关闭弹窗，不弹未保存确认框；编辑授权经 bridge 的
 * requestInteraction3dAccess / subscribeInteraction3dAccess 获取，未授权时面板 inert 且不可保存。
 * 字段约定：草稿与后端下发的 component.properties 完全一致（camelCase），本模块只收集、不做兜底。
 */
// 状态条目归一与「按 ID 切域」只有一份实现（/static/utils/），这里经 static-helpers 桥取用。
// 桥分成两个：显示路径那份（static-helpers）只放零依赖工具，本模块是编辑器侧，其余走 editor 那份。
import {
  COVER_DEFAULT_PREVIEW_POSITION,
  applyMdiMask,
  capturePointer,
  resolveStateEntry,
  withFixedLightEffects
} from "../core/static-helpers.js?v=2609262312";
import {
  DEFAULT_BASE_LIGHTING,
  createDomFactory,
  getInteraction3dEditorView,
  interaction3dPreviewSize,
  normalizeBaseLighting,
  normalizeInteraction3dLightingMode,
  // 温湿度计落库前过一遍白名单归一，新建条目按楼层几何中心落点（bridge 的唯一口径）。
  normalizeTemperatureHumidity,
  randomUuid,
  requestInteraction3dAccess,
  subscribeInteraction3dAccess,
  temperatureHumidityFloorCenter
} from "../core/static-helpers-editor.js?v=2609262312";
import { vacuumMapIdentity } from "../vacuum/vacuum-map.js?v=2609262312";
import { openInteraction3dRangeEditor } from "./range-dialog.js?v=2609262312";
import { mountInteraction3d } from "../core/runtime.js?v=2609262312";
import { lightState } from "../light/light-state.js?v=2609262312";
import { openVacuumMapEditor } from "../vacuum/vacuum-map-editor.js?v=2609262312";
import { nasGroups } from "../nas/nas-panel.js?v=2609262312";
// 窗帘组合（一拖多）的纯配置运算：配对候选、新建组合、条目 id 口径与归一。
// 编辑器只改草稿里的 environment.curtainGroups，保存时与其余草稿一起交给宿主。
import {
  createCurtainGroup,
  curtainGroupCandidates,
  curtainGroupEntryId,
  validCurtainGroups
} from "../cover/cover-groups.js?v=2609262312";
// 通用设备（冰箱 / 冰柜 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）的品类表：与运行侧（舞台 / 设备弹窗）
// 共用同一份，编辑器的「设备类别」选项、模型类型过滤与缺省图标都从这里取，
// 避免两端各维护一份品类名。
import {
  GENERIC_DEVICE_KINDS,
  genericDeviceProfile,
  isGenericDeviceKind
} from "../device/device-profiles.js?v=2609262312";
// 通用设备的实体目录与能力位适配层：把一台设备的实体枚举成稳定清单，
// 附加功能卡片与状态灯规则的候选都从它取，不再各自遍历 entities。
import { deviceEntityCatalog, entityCapabilities } from "./device-entity-config.js?v=2609262312";
// 状态判定的「两种状态 + 中文名」词表（状态灯规则下拉的唯一来源）与规则缺省值。
import {
  defaultDeviceStatusRule,
  deviceStatusChoices
} from "../device/device-status.js?v=2609262312";
// 附加功能（额外控件）的形态词表：extraTypes 给出实体域对应的形态列表，extraLabels
// 把形态键翻成中文名（附加实体行第三行的「形态 · 状态」用它）。
// purifierRelatedEntities 用于按同一台设备带出净化器的兄弟实体。
import {
  extraLabels,
  extraTypes,
  // 换绑时判断「是不是换了一台设备」：同一台净化器下换实体不清空附加功能，换设备才清。
  purifierDeviceChanged,
  purifierRelatedEntities
} from "../climate/purifier-extras.js?v=2609262312";
import {
  EDITOR_SAVE_STATUS,
  editorDraftHasChanges,
  serializeEditorDraft
} from "../core/editor-save-status.js?v=2609262312";
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
 * 流程：先取编辑授权 → 建弹窗骨架 → 挂预览舞台运行时 → 等舞台 ready 后渲染面板；
 * 弹窗以 dialog.showModal() 打开，关闭时整体释放（含舞台 iframe）。
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
  // 环境编辑器用一个「环境类别」下拉在空调 / 空气净化器 / 窗帘 / 温湿度计之间切换，
  // 四者共用同一个弹窗，因此这里把温湿度计与净化器也算进环境类，标题统一显示「环境」。
  const isEnvironmentKind = [
    "environment",
    "climate",
    "air-purifier",
    "cover",
    "temperature-humidity"
  ].includes(deviceKind);
  if (deviceKind === "environment") {
    deviceKind = "climate";
  }
  // 「设备类别」下拉把 NAS / 电视与六个通用设备品类放在一起：它们同住 properties.devices，
  // 共用同一套坐标、尺寸、批量套用脚手架，差异只体现在实体怎么来（NAS 选整台设备、
  // 通用设备选一台 HA 设备）与弹窗内容（通用设备多了状态灯规则与附加功能）。
  const isDeviceKind =
    deviceKind === "devices" ||
    deviceKind === "nas" ||
    deviceKind === "television" ||
    isGenericDeviceKind(deviceKind);
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
  let isTemperatureHumidityMode;
  // 通用设备（冰箱 / 冰柜 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）：品类表见 device/device-profiles.js。
  // 与空调的差别在两处 —— 主实体由设备归属反查（因此必须写 deviceId / deviceName，
  // 且不许写 entityId），弹窗内容由 statusRules + extraControls 两块配置决定。
  let isGenericDeviceMode;
  // 空气净化器：与空调同住 environment，同绑一个空调外观模型，但主实体是 fan.*，
  // 并且多了 extraControls（净化器的开关 / 模式 / 滤芯寿命等附加实体）。
  let isAirPurifierMode;
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
    isTemperatureHumidityMode = deviceKind === "temperature-humidity";
    isGenericDeviceMode = isGenericDeviceKind(deviceKind);
    isAirPurifierMode = deviceKind === "air-purifier";
    usesModelBinding =
      isClimateMode ||
      isAirPurifierMode ||
      isCoverMode ||
      isNasMode ||
      isTelevisionMode ||
      isVacuumMode ||
      isVacuumShortcutMode ||
      // 通用设备与温湿度计同属「deviceKind 决定集合名」的一类：前者绑场景模型
      // （devices[品类集合] 里每条都带 floorId / modelId，模型配不上时运行侧不渲染），
      // 后者不绑模型、靠 x / y 落点。坐标、尺寸、批量套用这套脚手架整份复用，
      // 实体来源各自走自己的分支。
      isGenericDeviceMode ||
      isTemperatureHumidityMode;
    kindLabel = isVacuumShortcutMode
      ? "快捷指令"
      : isVacuumMode
        ? "扫地机"
        : isGenericDeviceMode
          ? genericDeviceProfile(deviceKind).label
          : isAirPurifierMode
            ? // 上游 0.6.5 的 kindLabel 用整名「空气净化器」：模型列表的「添加…」、
              // 「关联…模型」、「点击…」等处都拼这个词，与「环境类别」下拉里的取值一致。
              "空气净化器"
            : isDeviceKind
              ? "设备"
              : isTemperatureHumidityMode
                ? "温湿度计"
                : isCoverMode
                  ? "窗帘"
                  : isClimateMode
                    ? "空调"
                    : "灯光";
    // 弹窗标题按 0.6.5 的 value14 取值：环境（空调 / 空气净化器 / 窗帘 / 温湿度计）、
    // 设备（NAS / 电视 / 六个通用设备品类）、扫地机（含快捷指令），其余才用品类名。
    // 即：通用设备卡片标题是「3D 设备配置」，而不是「3D 洗衣机配置」——品类名只用在
    // 「关联〈品类〉模型」「一键应用到其他〈品类〉」这类句子和模型列表里（kindLabel）。
    editorKindTitle = isEnvironmentKind
      ? "环境"
      : isDeviceKind
        ? "设备"
        : isVacuumShortcutMode
          ? "扫地机"
          : kindLabel;
    collectionKey =
      isVacuumMode || isVacuumShortcutMode
        ? "vacuums"
        : isTelevisionMode
          ? "televisions"
          : isNasMode
            ? "nas"
            : isGenericDeviceMode
              ? genericDeviceProfile(deviceKind).collection
              : isCoverMode
                ? "curtains"
                : isTemperatureHumidityMode
                  ? "temperatureHumidity"
                  : isAirPurifierMode
                    ? "airPurifiers"
                    : "airConditioners";
    defaultIcon = isVacuumShortcutMode
      ? "mdi:broom"
      : isVacuumMode
        ? "mdi:robot-vacuum"
        : isTelevisionMode
          ? "mdi:television"
          : isNasMode
            ? "mdi:nas"
            : isGenericDeviceMode
              ? genericDeviceProfile(deviceKind).icon
              : isCoverMode
                ? "mdi:curtains"
                : isTemperatureHumidityMode
                  ? "mdi:thermometer"
                  : isAirPurifierMode
                    ? "mdi:air-purifier"
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
    "/api/v1/modules/interaction3d/core/runtime.css?v=2609262312";
  document.head.append(styleSheetLinkElement);
  // 通用设备 / 空气净化器那两块（状态灯规则、附加功能）的专属样式单独一张表：
  // 它们只在这两个编辑对象下渲染，塞进 runtime.css 会让展示页也背上这份字节。
  // 关弹窗时与 runtime.css 一起摘掉（见 disposeEditor）。
  const deviceStyleLinkElement = document.createElement("link");
  deviceStyleLinkElement.rel = "stylesheet";
  deviceStyleLinkElement.href =
    "/api/v1/modules/interaction3d/editor/device-editor.css?v=2609262312";
  document.head.append(deviceStyleLinkElement);
  // 附加功能的内联选择器不需要额外样式表：卡片网格随「实时预览弹窗」一起交给舞台渲染，
  // 那张表的样式在 climate-panel.css 里、由舞台自己的 stage.css @import，编辑器不再挂它。
  // 元素与按钮的唯一实现见 /static/shared/dom-factory.js：文本一律 textContent（设备名等来自
  // 用户输入），按钮一律显式 type="button"（dialog 里的按钮不写会按 submit 处理，回车即误触发）。
  const { el: createElement, button: createButton } = createDomFactory(document);
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
  // 舞台上被选中的窗帘**组合** id（不含 "curtain-group:" 前缀）。与 selectedItemId 并存：
  // 选中组合时仍把 selectedItemId 指到它的第一名成员，面板才有窗帘基础设置可渲染；
  // 这个变量只负责「把舞台高亮 / 拖拽回写落到组合而不是某副帘」。
  let selectedCurtainGroupId = "";
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
  // 保存中：防重复提交，也让状态文案不被其它流程覆盖。
  let isSaving = false;
  // 是否有未保存改动；顶部的状态文案与保存按钮可用性都看它（退出不再看它，见 disposeEditor）。
  let isDirty = false;
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
  // 模型绑定类设备、灯光；其余代码只认这一份列表。
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
  // ---- 窗帘组合（一拖多 / 双层帘）的读写 ----
  // 组合与 curtains 并列存在 environment.curtainGroups 下。读一律先过 validCurtainGroups：
  // 舞台只渲染有效组合，编辑器列表必须与舞台看到的一致，否则会出现「列表里有、舞台上没有」
  // 的幽灵条目；写则收敛到 setCurtainGroupList，避免每处都写 environment 的可选链。
  const getCurtainGroupList = () => draftProperties.environment?.curtainGroups || [];
  const setCurtainGroupList = nextCurtainGroupList => {
    draftProperties.environment = {
      ...draftProperties.environment,
      curtainGroups: nextCurtainGroupList
    };
  };
  // 当前选中窗帘所属的组合；它不是任何组合的成员时返回 undefined。
  const findCurtainGroupOf = curtainId =>
    validCurtainGroups(draftProperties.environment).find(curtainGroupEntry =>
      curtainGroupEntry.memberIds.includes(curtainId)
    );
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
          // 温湿度计的「大小」是卡片宽度：44px 是圆形按钮的尺寸，套在卡片上会被渲染侧
          // 的 100px 下限接住，因此缺省给 180（与运行侧 binding 的口径一致）。
          const resolvedButtonSize =
            Number.isFinite(normalizedItem.size) && normalizedItem.size > 0
              ? normalizedItem.size
              : isTemperatureHumidityMode
                ? 180
                : 44;
          return {
            ...normalizedItem,
            size: resolvedButtonSize,
            visible: isVacuumShortcutMode ? normalizedItem.visible !== false : true,
            // 图标与点击行为都只属于「按钮 / 模型」那一套：温湿度计的卡片自带两枚遮罩图标，
            // 点击也由展示态直接吞掉。这两个字段不在 bridge 白名单里，写进草稿会被后端拒收。
            ...(isTemperatureHumidityMode
              ? {}
              : {
                  icon: normalizedItem.icon || defaultIcon
                }),
            ...(usesModelBinding
              ? {}
              : {
                  fadeDuration: normalizedItem.fadeDuration ?? 0.3
                }),
            ...(isCoverMode
              ? {
                  coverKind: ["standard", "dream", "roller"].includes(normalizedItem.coverKind)
                    ? normalizedItem.coverKind
                    : "standard",
                  coverDirection: ["left", "right", "split"].includes(normalizedItem.coverDirection)
                    ? normalizedItem.coverDirection
                    : "auto",
                  curtainFabric: normalizedItem.curtainFabric === "sheer" ? "sheer" : "cloth",
                  // 帘型覆写标记：只有显式置 true 才会盖过户型模型自带的帘型（默认跟随模型）。
                  ...(normalizedItem.coverKindOverride === true
                    ? { coverKindOverride: true }
                    : {}),
                  // 帘布覆写标记：只有显式置 true 才会盖过户型模型自带的帘布（默认跟随模型）。
                  ...(normalizedItem.curtainFabricOverride === true
                    ? { curtainFabricOverride: true }
                    : {}),
                  unboundPosition: Number.isFinite(normalizedItem.unboundPosition)
                    ? Math.max(0, Math.min(100, normalizedItem.unboundPosition))
                    : COVER_DEFAULT_PREVIEW_POSITION
                }
              : {}),
            ...(isVacuumShortcutMode || isTemperatureHumidityMode
              ? {}
              : {
                  clickAction: normalizeClickAction(normalizedItem.clickAction)
                }),
            // 文字大小：温湿度计是整张卡片的统一字号（上游缺省 12、区间 9~24），与卡片宽度无关；
            // 其余控件沿用「按钮越大图标越大」的推导。
            // 只认编辑器写得出的区间；区间外的存量值（本仓曾把 26 当缺省写进所有卡片）当作
            // 「未配置」回落到 12 —— 与运行侧 marker-layer 同一判据，两边不会各显示一个数。
            iconSize: isTemperatureHumidityMode
              ? Number.isFinite(normalizedItem.iconSize) &&
                normalizedItem.iconSize >= 9 &&
                normalizedItem.iconSize <= 24
                ? normalizedItem.iconSize
                : 12
              : Number.isFinite(normalizedItem.iconSize) && normalizedItem.iconSize > 0
                ? normalizedItem.iconSize
                : Math.min(resolvedButtonSize, Math.max(4, resolvedButtonSize - 18))
          };
        })
    );
  }
  ensureItemCollections();
  // 已保存的草稿签名：脏标记的唯一参照物，保存成功后刷新。
  let savedDraftSignature = serializeEditorDraft(draftProperties);
  // 批量弹窗里「当前值」的中文标签表：只收录会在批量清单里出现的枚举字段，
  // 取值与面板下拉逐字一致（改了面板文案这里要跟着改，否则同一档位两处两个名字）。
  const BATCH_ENUM_VALUE_LABELS = {
    coverKind: { standard: "普通窗帘", roller: "卷帘", dream: "梦幻帘" },
    curtainFabric: { cloth: "布帘", sheer: "纱帘" },
    coverDirection: { auto: "继承模型", left: "向左收拢", right: "向右收拢", split: "双向收拢" }
  };
  // 可批量套用的字段清单：[字段路径, 中文名, 单位]；路径支持 "a.b" 形式，
  // 由 readNestedPath 解析。清单随模块不同（状态面板类与灯光类字段完全不同）。
  const buildEditableFieldList = () =>
    usesModelBinding
      ? [
          // ── 温湿度计走的是另一份清单（上游 fn43）：高度 / 信息框宽度 / 文字大小，且高度在首位。
          // 触控范围与按钮显隐在卡片上不暴露，故不进这张清单。
          ...(isTemperatureHumidityMode ? [["height", "高度", "米"]] : []),
          // 温湿度计不使用单枚图标（卡片自带两枚遮罩图标），也不写 icon 字段；扫地机的「标签」
          // 同样没有图标可挑 —— 上游 fn14 对 value4 就不 push 这一项。
          ...(isVacuumMode || isTemperatureHumidityMode ? [] : [["icon", "图标", ""]]),
          [
            "size",
            isVacuumMode ? "状态框缩放" : isTemperatureHumidityMode ? "信息框宽度" : "按钮大小",
            isVacuumMode ? "%" : "px"
          ],
          ["iconSize", isVacuumMode || isTemperatureHumidityMode ? "文字大小" : "图标大小", "px"],
          ...(isTemperatureHumidityMode
            ? []
            : [
                ["hitSize", "点击范围", "px"],
                ["buttonVisibility", "按钮显示", ""]
              ]),
          ...(isVacuumShortcutMode
            ? [
                ["fontSize", "文字大小", "px"],
                ["iconHidden", "隐藏图标", ""],
                ["labelHidden", "隐藏名称", ""]
              ]
            : []),
          // 「高度」是模型绑定类型共用的可套用字段：上游 fn22 是在 fn14()（图标/尺寸/显隐那一段）
          // **之后**才 push ["height","高度"," 米"]，所以这里不能提到前面去 —— 它是批量弹窗里的
          // 行序，排错了菜单顺序就和 0.6.5 不一样。温湿度计已在上面的 fn43 分支里单独排过。
          ...(isTemperatureHumidityMode ? [] : [["height", "高度", "米"]]),
          // 「点击行为」同样列进可套用字段（value3 || push(["clickAction","点击行为",""])）：
          // 扫地机快捷指令没有这一项；温湿度计也没有 —— 它走的是上面那份三字段清单。
          ...(isVacuumShortcutMode || isTemperatureHumidityMode
            ? []
            : [["clickAction", "点击行为", ""]]),
          // 窗帘专有：帘型 / 帘布 / 开合方向 / 未绑定时展示状态。与被覆写标记的关系在
          // applyFieldValues 里处理（写这三个字段时同时把 override 置 true，否则目标帘
          // 继承户型模型的取值会把刚套上的值盖回去）。
          ...(isCoverMode
            ? [
                ["iconStateReversed", "图标状态反向", ""],
                ["curtainFabric", "帘布类型", ""],
                ["coverKind", "窗帘类型", ""],
                ["coverDirection", "开合方向", ""],
                ["unboundPosition", "未绑定时展示状态", "%"]
              ]
            : []),
          // 扫地机专有：两项开关（默认开启，只有显式关掉才写进配置）。
          ...(isVacuumMode
            ? [
                ["motionEnabled", "跟随真实位置移动", ""],
                ["funMessages", "工作时趣味短句", ""]
              ]
            : [])
        ]
      : [
          ["size", "按钮大小", "px"],
          ["iconSize", "图标大小", "px"],
          ["hitSize", "点击范围", "px"],
          ["fadeDuration", "缓开缓灭", "秒"]
        ];
  // 注意：灯光的 effectRange / effectDefaults 刻意不在上表里。它们由
  // static/bridge/light-effect-policy.js 固定，各灯恒等，列进「可批量套用的字段」
  // 只会让「改了哪些字段」显示一批永远相同的伪差异。
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
  function buildItemPayload(item) {
    if (usesModelBinding) {
      return {
        icon: item.icon || defaultIcon,
        // 温湿度计的缺省与其它控件不同：卡片宽得多（180 而非 44），文字也小（12 而非 26）
        // —— 与上游同一份缺省，批量弹窗里的「当前值」才不会凭空多出一个假差异。
        size: item.size ?? (isTemperatureHumidityMode ? 180 : 44),
        iconSize: item.iconSize ?? (isTemperatureHumidityMode ? 12 : 26),
        hitSize: item.hitSize ?? Math.max(44, item.size ?? 44),
        // 「高度」对每个模型绑定类型都是真实字段（温湿度计缺省 1.8 米，其余跟随各自模型）：
        // 不进快照的话，批量弹窗里它永远显示成「跟随模型」，改了也永远算不出差异。
        height: isTemperatureHumidityMode ? (item.height ?? 1.8) : item.height,
        // 「点击行为」同理：不进快照，改了它就永远不进批量清单。缺省与面板同口径（focus）；
        // 扫地机快捷指令与温湿度计都没有这一项，不写。
        ...(isVacuumShortcutMode || isTemperatureHumidityMode
          ? {}
          : { clickAction: item.clickAction || "focus" }),
        ...(isVacuumShortcutMode
          ? {
              fontSize: item.fontSize ?? 12,
              iconHidden: item.iconHidden === true,
              labelHidden: item.labelHidden === true
            }
          : {}),
        // 窗帘专有字段进快照，批量弹窗才能列出「帘布类型 / 窗帘类型 / 开合方向 /
        // 未绑定时展示状态」四行并按基线算出差集。
        ...(isCoverMode
          ? {
              iconStateReversed: item.iconStateReversed === true,
              curtainFabric: item.curtainFabric === "sheer" ? "sheer" : "cloth",
              coverKind: ["dream", "roller"].includes(item.coverKind)
                ? item.coverKind
                : "standard",
              coverDirection: ["left", "right", "split"].includes(item.coverDirection)
                ? item.coverDirection
                : "auto",
              unboundPosition: Number.isFinite(item.unboundPosition)
                ? item.unboundPosition
                : COVER_DEFAULT_PREVIEW_POSITION
            }
          : {}),
        // 扫地机的两个开关缺省都是开：只有显式 false 才算差异，避免未写过的新配置报「改过」。
        ...(isVacuumMode
          ? {
              motionEnabled: item.motionEnabled !== false,
              funMessages: item.funMessages !== false
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
      // 灯光分支：effectRange / effectDefaults 取固定策略的值（恒等），
      // 这样批量套用与脏字段比较仍然能用同一份快照，不需要为它们开特例。
      const fixedLightItem = withFixedLightEffects(item);
      return {
        size: fixedLightItem.size ?? 44,
        iconSize: fixedLightItem.iconSize ?? 26,
        hitSize: fixedLightItem.hitSize ?? Math.max(44, fixedLightItem.size ?? 44),
        fadeDuration: fixedLightItem.fadeDuration ?? 0.3,
        effectDefaults: fixedLightItem.effectDefaults,
        effectRange: fixedLightItem.effectRange
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
    const baselinePayload = buildItemPayload(baselineItemsById.get(changedItem.id));
    const currentPayload = buildItemPayload(changedItem);
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
        // 帘型 / 帘布走「覆写」语义：面板上改这两项会同时置 override 标记，批量套用必须
        // 保持同一口径，否则目标帘若继承户型模型（模型是卷帘）会盖掉刚套上的普通窗帘。
        if (fieldKey === "coverKind") {
          targetItem.coverKindOverride = true;
        } else if (fieldKey === "curtainFabric") {
          targetItem.curtainFabricOverride = true;
        }
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
      saveStatusElement.textContent = "显示内容已调整，待保存配置";
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
    // 批量应用对话框标题：温湿度计走「应用温湿度计设置」，其余沿用「应用<图标/灯光>设置」，
    // 与 0.6.5 dist 的两处字面量逐字一致（见同文件里「温湿度计设置一键应用」那一节）。
    const settingsTitle = isTemperatureHumidityMode
      ? "温湿度计设置"
      : usesModelBinding
        ? "图标设置"
        : "灯光设置";
    const changedFieldDefs = listChangedFields(sourceItem);
    // 可套用字段集：温湿度计这颗按钮的语义是「把本台设置推给同层其它台」（面板上显示的就是
    // 同层台数），与「本台相对基线改没改」无关 —— 它不该在刚打开面板时就不可用。所以这一类
    // 把可套用字段全列出来（真正改过的项仍然预勾选）。其余类型维持「只列改动项」的口径。
    const listedFieldDefs = isTemperatureHumidityMode ? fieldDefs : changedFieldDefs;
    const otherItems = getItemList().filter(
      otherItemProbe =>
        otherItemProbe.id !== sourceItem.id &&
        (isVacuumShortcutMode || otherItemProbe.floorId === sourceItem.floorId)
    );
    if (!listedFieldDefs.length) {
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
    // 列表面（linkedFieldNames）以「可套用字段集」为底，预勾选（changedFieldNames）仍只看真
    // 正改动过的项。其余类型两者同源，口径不变。
    const linkedFieldNames = new Set(
      listedFieldDefs.map(([listedFieldEntry]) => listedFieldEntry)
    );
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
      // 枚举型字段的当前值写成面板上的中文标签，别把 cloth / left 这类后端字面量摊给用户；
      // 未收录的取值原样显示（后端随时可能加枚举）。
      const enumeratedFieldLabel = BATCH_ENUM_VALUE_LABELS[applyFieldKey]?.[displayFieldValue];
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
                (enumeratedFieldLabel ??
                  (typeof displayFieldValue == "number"
                    ? Math.round(displayFieldValue * 1000) / 1000
                    : displayFieldValue)) +
                (applyFieldUnit ? " " + applyFieldUnit : ""),
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
          // 弹窗还挂着的唯一可能是「授权在打开后被撤掉」（auxDialogElement 变了就是被别的
          // 弹窗顶掉，此时提示也没地方显示）。文案与 0.6.5 的两处守卫逐字一致：温湿度计那支
          // 说「配置不可用」，通用那支说「配置已关闭或授权不可用」。
          if (auxDialogElement === batchDialogElement) {
            batchMessageElement.textContent = isTemperatureHumidityMode
              ? "配置不可用"
              : "配置已关闭或授权不可用";
            batchMessageElement.hidden = false;
          }
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
        // 与 0.6.5 dist 的两处字面量逐字一致：温湿度计走「个温湿度计」，其余走「个目标」
        // （上游给温湿度计单开了一个批量弹窗，通用那个只说「目标」，不拼类型名）。
        saveStatusElement.textContent =
          "已应用到 " +
          updatedTargetItems.length +
          (isTemperatureHumidityMode ? " 个温湿度计，待保存配置" : " 个目标，待保存配置");
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
  // 「一键应用到其他组合窗帘」：把当前组合入口的字段批量套到同楼层的其它组合。
  //
  // 组合不在 getItemList() 里（它住在 environment.curtainGroups），所以不复用上面那份面向
  // 普通条目的 openBatchApplyDialog，而在本文件内做一份轻量实现 —— 结构、类名与它一致：
  // 左列勾选要应用的字段，右列勾选目标组合，应用后仍要点「保存配置」才落库。
  function openCurtainGroupBatchApplyDialog(sourceGroup) {
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
    const otherCurtainGroups = validCurtainGroups(draftProperties.environment).filter(
      curtainGroupEntry =>
        curtainGroupEntry.id !== sourceGroup.id &&
        curtainGroupEntry.floorId === sourceGroup.floorId
    );
    const groupFieldDefs = [
      ["x", "位置 X", ""],
      ["y", "位置 Y", ""],
      ["height", "高度（米）", "米"],
      ["size", "按钮大小（px）", "px"],
      ["iconSize", "图标大小（px）", "px"],
      ["hitSize", "触控范围（px）", "px"],
      ["clickAction", "点击行为", ""],
      ["panelLayout", "弹窗布局", ""],
      ["focusCamera", "聚焦视角", ""]
    ];
    const batchDialogElement = createElement(
      "dialog",
      "settings-dialog navigation-style-apply-dialog i3d-batch-dialog"
    );
    batchDialogElement.setAttribute("aria-label", "应用组合窗帘设置");
    auxDialogElement = batchDialogElement;
    const batchHeadingElement = createElement("div", "dialog-heading");
    const batchTitleWrapperElement = createElement("div");
    batchTitleWrapperElement.append(
      createElement("span", "", "BATCH APPLY"),
      createElement("h2", "", "应用组合窗帘设置")
    );
    const batchDialogCloseButton = createButton("×", closeAuxDialog);
    batchDialogCloseButton.className = "icon-button";
    batchDialogCloseButton.setAttribute("aria-label", "关闭应用设置窗口");
    batchHeadingElement.append(batchTitleWrapperElement, batchDialogCloseButton);
    const batchBodyElement = createElement("div", "navigation-style-apply-body");
    const batchColumnsElement = createElement("div", "navigation-style-apply-columns");
    const changedColumnElement = createElement("section");
    const targetsColumnElement = createElement("section");
    const createBatchColumnHeading = (headingTitle, headingHint) => {
      const columnHeadingElement = createElement("div", "navigation-style-apply-heading");
      columnHeadingElement.append(
        createElement("strong", "", headingTitle),
        createElement("span", "", headingHint)
      );
      return columnHeadingElement;
    };
    const batchFieldCheckboxes = [];
    const batchTargetCheckboxes = [];
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
    const describeGroupFieldValue = groupFieldKey => {
      const groupFieldValue = sourceGroup[groupFieldKey];
      if (groupFieldValue === undefined) {
        return "跟随第一层入口";
      }
      if (groupFieldKey === "focusCamera") {
        return groupFieldValue ? "已设置" : "跟随模型";
      }
      return "" + groupFieldValue;
    };
    const changedOptionsElement = createElement("div", "navigation-style-apply-options");
    for (const [groupFieldKey, groupFieldLabel, groupFieldUnit] of groupFieldDefs) {
      changedOptionsElement.append(
        createBatchOption(
          groupFieldKey,
          groupFieldLabel,
          describeGroupFieldValue(groupFieldKey) + " " + groupFieldUnit,
          batchFieldCheckboxes
        )
      );
    }
    const targetOptionsElement = createElement(
      "div",
      "navigation-style-apply-options grouped-by-page"
    );
    for (const otherCurtainGroup of otherCurtainGroups) {
      targetOptionsElement.append(
        createBatchOption(
          otherCurtainGroup.id,
          otherCurtainGroup.label || "双层窗帘",
          "组合入口",
          batchTargetCheckboxes
        )
      );
    }
    changedColumnElement.append(
      createBatchColumnHeading("要应用的修改", "可单独取消"),
      changedOptionsElement
    );
    targetsColumnElement.append(
      createBatchColumnHeading("应用到其他组合窗帘", "按楼层区分"),
      targetOptionsElement
    );
    batchColumnsElement.append(changedColumnElement, targetsColumnElement);
    const batchMessageElement = createElement("p", "navigation-style-apply-message");
    batchMessageElement.hidden = otherCurtainGroups.length > 0;
    if (!otherCurtainGroups.length) {
      batchMessageElement.textContent = "当前楼层没有其他组合窗帘可应用。";
    }
    batchMessageElement.setAttribute("role", "status");
    const batchActionsElement = createElement("div", "dialog-actions");
    const applyBatchButton = createButton("应用所选", () => {
      const selectedFieldKeys = batchFieldCheckboxes
        .filter(checkedFieldProbe => checkedFieldProbe.checked)
        .map(checkedFieldCheckbox => checkedFieldCheckbox.value);
      const selectedTargetIds = new Set(
        batchTargetCheckboxes
          .filter(targetCheckboxProbe => targetCheckboxProbe.checked)
          .map(targetCheckboxEntry => targetCheckboxEntry.value)
      );
      if (!selectedFieldKeys.length || !selectedTargetIds.size) {
        batchMessageElement.textContent = "请至少选择一项修改和一个目标组合。";
        batchMessageElement.hidden = false;
        return;
      }
      let appliedGroupCount = 0;
      // validCurtainGroups 返回的是配置对象的引用，就地改写这些字段即写回草稿。
      for (const targetCurtainGroup of validCurtainGroups(draftProperties.environment)) {
        if (!selectedTargetIds.has(targetCurtainGroup.id)) {
          continue;
        }
        for (const selectedFieldKey of selectedFieldKeys) {
          if (sourceGroup[selectedFieldKey] === undefined) {
            // 源组合没有显式设置（如 x / y / height 跟随第一层）时目标也删掉，两边口径一致。
            delete targetCurtainGroup[selectedFieldKey];
          } else {
            targetCurtainGroup[selectedFieldKey] = structuredClone(sourceGroup[selectedFieldKey]);
          }
        }
        appliedGroupCount++;
      }
      if (!appliedGroupCount) {
        batchMessageElement.textContent = "目标组合已不存在，请重新选择。";
        batchMessageElement.hidden = false;
        return;
      }
      closeAuxDialog();
      refreshEditorPreview();
      renderPanel();
      saveStatusElement.textContent =
        "已应用到 " + appliedGroupCount + " 个组合窗帘，请保存配置";
    });
    applyBatchButton.className = "primary";
    applyBatchButton.disabled = !otherCurtainGroups.length;
    batchActionsElement.append(createButton("取消", closeAuxDialog), applyBatchButton);
    batchBodyElement.append(
      createElement(
        "p",
        "navigation-style-apply-summary",
        "将“" +
          (sourceGroup.label || "双层窗帘") +
          "”组合入口的位置、大小、隐藏方式与聚焦视角应用到勾选的其它组合。各成员的模型、实体与帘布保持不变。应用后点击“保存配置”完成保存。"
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
  // 新建「双层帘」组合的弹窗。与 0.6.5 dist 的结构与文案逐字一致：一句继承说明、
  // 「另一层窗帘」下拉、可改的「组合名称」，确认后才真正建组合；候选为空时不弹窗
  // （面板上的入口按钮同时是禁用的，两处口径一致）。
  function openCurtainGroupDialog(sourceItem) {
    if (auxDialogElement || isDisposed || !isAccessAllowed) {
      return;
    }
    const candidateList = curtainGroupCandidates(draftProperties.environment, sourceItem.id);
    if (!candidateList.length) {
      return;
    }
    let pickedMemberId = candidateList[0].id;
    const dialogElement = createElement("dialog", "settings-dialog i3d-add-dialog");
    auxDialogElement = dialogElement;
    dialogElement.setAttribute("aria-label", "组合窗帘");
    // 0.6.5 这一支没有 dialog-heading（也没有右上角 ×）：标题就是正文容器里的第一个 h2，
    // 退出走底部「取消」或 Esc。别照「添加按钮」那类弹窗给它套一条标题栏。
    const dialogBodyElement = createElement("div", "i3d-add-dialog-body");
    dialogBodyElement.append(
      createElement("h2", "", "组合窗帘"),
      createElement(
        "p",
        "i3d-note",
        "以“" +
          (sourceItem.label || "当前窗帘") +
          "”为第一层，继承其入口位置、尺寸、点击行为和聚焦视角。请选择同一位置的另一层窗帘。"
      )
    );
    createSelectRow(
      dialogBodyElement,
      "另一层窗帘",
      candidateList.map(candidateEntry => [
        candidateEntry.id,
        candidateEntry.label || candidateEntry.entityId || candidateEntry.id
      ]),
      pickedMemberId,
      nextMemberId => {
        pickedMemberId = nextMemberId;
      }
    );
    const groupLabelInputElement = createElement("input");
    groupLabelInputElement.value = "双层窗帘";
    groupLabelInputElement.maxLength = 128;
    createSettingRow(dialogBodyElement, "组合名称", groupLabelInputElement);
    dialogBodyElement.append(
      createElement(
        "p",
        "i3d-note",
        "3D 画面只显示双图标，无文字；两个模型仍各自动画。不会移动模型或发送设备命令。"
      )
    );
    const dialogErrorElement = createElement("p", "i3d-error");
    dialogErrorElement.setAttribute("role", "status");
    dialogErrorElement.hidden = true;
    const dialogActionsElement = createElement("div", "dialog-actions");
    const confirmGroupButton = createButton("确定组合", () => {
      if (isDisposed || !isAccessAllowed || auxDialogElement !== dialogElement) {
        return;
      }
      try {
        const createdCurtainGroup = createCurtainGroup(
          draftProperties.environment,
          sourceItem.id,
          pickedMemberId,
          randomUuid(),
          groupLabelInputElement.value.trim() || "双层窗帘"
        );
        setCurtainGroupList([...getCurtainGroupList(), createdCurtainGroup]);
        selectedCurtainGroupId = createdCurtainGroup.id;
        closeAuxDialog();
        refreshEditorPreview();
        renderPanel();
      } catch (createGroupError) {
        // createCurtainGroup 对非法配对抛中文提示，原样展示给用户；草稿保持不动。
        dialogErrorElement.textContent = createGroupError.message || "无法创建窗帘组合。";
        dialogErrorElement.hidden = false;
      }
    });
    confirmGroupButton.className = "primary";
    dialogActionsElement.append(createButton("取消", closeAuxDialog), confirmGroupButton);
    dialogBodyElement.append(dialogErrorElement, dialogActionsElement);
    dialogElement.append(dialogBodyElement);
    document.body.append(dialogElement);
    dialogElement.addEventListener("cancel", cancelEvent => {
      cancelEvent.preventDefault();
      closeAuxDialog();
    });
    dialogElement.showModal();
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
      deviceStyleLinkElement.remove();
      document.dispatchEvent(new Event("hb-i3d-preview-scope"));
    }
  };
  // 退出：0.6.5 的「退出」（以及 dialog 的 cancel）就是直接释放编辑器，没有二次确认 ——
  // 本仓曾在这里拦一道「配置尚未保存，确定退出？」，已按原版删掉，避免和原版观感不一致。
  // 未保存的改动本来就靠「保存」按钮落库，退出即丢弃，与上游同口径（安防编辑器同理）。
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
    // 温湿度计在落库前过一遍白名单归一：草稿是通用编辑脚手架（会带上 size / visible 之类的
    // 缺省与临时字段），后端只白名单收 bridge normalizeTemperatureHumidity 里那几个字段，
    // 不归一就会在保存时被校验拒掉。有配置时才重写，避免给别的模块的文档塞一个空数组。
    if (Array.isArray(propertiesSnapshot.environment?.temperatureHumidity)) {
      propertiesSnapshot.environment = {
        ...propertiesSnapshot.environment,
        temperatureHumidity: propertiesSnapshot.environment.temperatureHumidity.map(
          normalizeTemperatureHumidity
        )
      };
    }
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
    createButton("退出", disposeEditor)
  );
  bodyElement.append(viewElement, panelElement);
  editorDialogElement.append(headerElement, bodyElement);
  document.body.append(editorDialogElement);
  editorDialogElement.addEventListener("cancel", editorCancelEvent => {
    editorCancelEvent.preventDefault();
    disposeEditor();
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
  // 交给舞台的选中 id：组合选中优先（组合条目的 id 带 "curtain-group:" 前缀），
  // 扫地机快捷指令有自己的一套前缀，其余情形就是裸条目 id。组合仍有效时才用它的 id，
  // 免得配置改坏后把一个不存在的条目 id 发给舞台。
  const resolveEditorSelectionId = () =>
    isCoverMode &&
    selectedCurtainGroupId &&
    getCurtainGroupList().some(curtainGroupEntry => curtainGroupEntry.id === selectedCurtainGroupId)
      ? curtainGroupEntryId({ id: selectedCurtainGroupId })
      : isVacuumShortcutMode && selectedItemId
        ? "vacuum-room:" + vacuumId + ":" + selectedItemId
        : selectedItemId;
  // 刷新预览舞台。markDirty 为 false 用于「只切换选中项」这类不改变配置的操作，
  // 否则每次点选都会被记成一次改动，退出时白弹一次确认框。
  function refreshEditorPreview({ markDirty = true } = {}) {
    if (markDirty) {
      syncDraftDirtyState();
    }
    editorRuntime?.update(
      buildRuntimeProperties(),
      resolveEditorSelectionId(),
      {
        // 与 mountStage 的 editingModule 同一口径：净化器归 climate 模块。送内部值
        // "air-purifier" 会落不进 runtime.js / host-messages.js 的白名单而被整条丢弃，
        // editingModuleKind 停在上一次的值（通常 "light"），预览随之停在错误的模块上。
        module: isAirPurifierMode ? "climate" : deviceKind,
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
    // 与 0.6.5 的 fn29 同一条特例：标签以「高度（米）」结尾的行（高度（米） / 离地高度（米））
    // 一律按米显示 1 位小数、步进固定 0.1。不这么做，「按钮位置」的高度会显示成从模型几何
    // 中心推出来的 0.425 这类原始值，和原版的 0.4 对不上。
    const isHeightRow = numberLabel.endsWith("高度（米）");
    const formatNumberValue = value =>
      isHeightRow && Number.isFinite(Number(value)) ? Number(value).toFixed(1) : String(value);
    const numberInputElement = createElement("input");
    Object.assign(numberInputElement, {
      type: inputType,
      min: String(numberMin),
      max: String(numberMax),
      step: String(isHeightRow ? 0.1 : numberStep),
      value: formatNumberValue(numberValue)
    });
    numberInputElement.addEventListener(inputType === "range" ? "input" : "change", () => {
      const parsedInputValue =
        numberInputElement.value.trim() === "" ? NaN : Number(numberInputElement.value);
      if (Number.isFinite(parsedInputValue)) {
        // 夹取后再归一到 1 位小数，并把输入框里的文字同步回去：用户手打 0.43 时，
        // 落库与显示都是 0.4，不会出现「看着 0.43、存着 0.4」的漂移。
        let nextValue = Math.max(numberMin, Math.min(numberMax, parsedInputValue));
        if (isHeightRow) {
          nextValue = Number(nextValue.toFixed(1));
        }
        numberInputElement.value = formatNumberValue(nextValue);
        onNumberChange(nextValue);
      }
    });
    return createSettingRow(numberContainer, numberLabel, numberInputElement);
  }
  // 尺寸行：当前值由调用方通过 readCurrentSize 提供（按钮大小与状态框缩放的语义不同），
  // 因此这里只负责读取与回写。
  // sizeMin / sizeMax 只在需要夹取的行上传（温湿度计的信息框宽度 100~600、文字大小 9~24）：
  // 夹取同时作用于「写回的值」与「输入框里显示的值」，两者不会各自漂移（上游只夹了前者，
  // 输入框里会短暂留下越界的数字）。
  function createSizeRow(
    sizeContainer,
    sizeLabel,
    readCurrentSize,
    onSizeChange,
    sizeMin = -Infinity,
    sizeMax = Infinity
  ) {
    const clampSizeValue = sizeValue => Math.max(sizeMin, Math.min(sizeMax, sizeValue));
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
        const boundedSizeValue = clampSizeValue(parsedSizeValue);
        sizeInputElement.value = String(boundedSizeValue);
        onSizeChange(boundedSizeValue);
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
    const stateAttributes = resolveStateEntry(entityState)?.attributes || {};
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
  // 固定灯光效果区间：亮度 / 色温的量程与默认值不再逐实体推算，也不再允许手调，
  // 统一取 static/bridge/light-effect-policy.js 的常量（「光影收敛」的一部分）。
  // 历史上这里有「默认效果」与「效果范围」两组输入控件，已随收敛一并移除：
  // 留着它们也只是改完就被下一次归一化覆盖，看起来像「保存失败」，比没有更糟。
  // 现在只负责把策略落到草稿项上（不产出任何 DOM）。
  function applyFixedLightEffects(lightItem) {
    Object.assign(lightItem, withFixedLightEffects(lightItem));
  }
  // 当前编辑类型允许绑定的场景模型类型（白名单）。其余类型返回 null，表示
  // 「候选来自舞台预建的集合」——灯组、窗帘、NAS 那些由元数据整份提供。
  function sceneModelTypes() {
    if (isGenericDeviceMode) {
      return [genericDeviceProfile(deviceKind).modelType];
    }
    if (isAirPurifierMode) {
      // 净化器在场景里有两副外观：空气净化器（airpurifier，studio 有专用构建器）与
      // 新风机（freshair，算作净化器的一种 —— HA 里两者都是 fan 域，能力位与面板同形）。
      // 两者都**不是**空调的挂机 / 柜机 / 出风口；借用空调那套白名单会让每一台净化器都
      // 绑不上模型（modelAvailable 恒为 false）。后端 purifier.py 的 require_purifier_model
      // 认的是同一份类型表，改这里必须一并改那里，否则配得上却控不了。
      return ["airpurifier", "freshair"];
    }
    return null;
  }
  // 某楼层里可绑定的场景模型清单。
  //
  // 舞台元数据（core/stage/config-metadata.js）只为空调 / 窗帘 / NAS / 电视 / 扫地机
  // 预建了同名集合，通用设备（冰箱…）在其中没有位置 —— 品类是后加的，元数据那一侧不加
  // 一份就得多维护一份；编辑器直接退回 plan.items 按模型类型筛，代价只是一次 O(n) 过滤，
  // 换来「新增品类时只改 device-profiles 与这里的一行白名单」。
  //
  // 退回 plan.items 的这一支要在这里把**标记锚点高度**补出来：那几张元数据集合
  // （airConditioners / curtains / televisions / nas / vacuums）都已经按「模型离地 + 机身
  // 高度的一半」算好了 height，而 plan.items 给的是机体原值（且只有它按类型筛）。
  // 不补这一步，「按钮位置」里「高度（米）」的缺省值会恒为 0 —— 净化器本体矮（0.7m）时
  // 只差 0.35m 不易察觉，新风机离地 2.2m，缺省落点会明显偏低；而运行时的绑定
  // （binding-collectors 的 collectEnvironmentClimateEntries 与通用设备那一支）用的正是
  // 「离地 + 半高」，于是编辑器显示的值与实际生效的值对不上。
  //
  // 同理，退回的这一支还得自己补**实例名**：上游那几张集合表都按序号兜底成「冰箱 1」
  // 「空气净化器 2」，而 plan.items 给的是没有 name 的原始条目（见下方命名那一段）。
  function floorSceneModels(floorEntry) {
    const modelTypes = sceneModelTypes();
    if (!modelTypes) {
      return floorEntry?.[collectionKey] || [];
    }
    // 户型的 items **从不写 name**（见 studio 的户型数据：一台冰箱只有 type / 几何 /
    // 颜色），素材库里的「冰箱」「绿植」是品类名而不是实例名。所以上游 0.6.5 的每一张
    // 集合表都自己按序号兜底命名 —— 通用设备走 genericDeviceMetadata 的
    // `label + " " + (i + 1)`，净化器走 `"空气净化器 " + (i + 1)`（见上游 stage.js）。
    // 少了这一步，「关联冰箱模型」里同层三台冰箱会全叫「冰箱」、四盆绿植全叫「绿植」，
    // 既认不出要绑哪一台，新建条目的 label 也会全部撞成同一个词。
    const fallbackModelName = isGenericDeviceMode
      ? genericDeviceProfile(deviceKind).label
      : "空气净化器";
    // 兜底高度也照同一份来源取：通用设备用品类表的高度，净化器用运行时 collectClimateBindings
    // 传给 collectEnvironmentClimateEntries 的那个缺省（0.7）—— 编辑器缺省值与实际生效值同源。
    const fallbackModelHeight = isGenericDeviceMode
      ? genericDeviceProfile(deviceKind).height
      : 0.7;
    return (floorEntry?.plan?.items || [])
      .filter(sceneItem => modelTypes.includes(sceneItem.type))
      .map((sceneItem, sceneItemIndex) => ({
        ...sceneItem,
        name: sceneItem.name || fallbackModelName + " " + (sceneItemIndex + 1),
        height:
          (Number(sceneItem.elevation) || 0) +
          (Number(sceneItem.height) || fallbackModelHeight) / 2
      }));
  }
  // 列出还可添加的模型：已被绑定的模型不再出现，避免同一模型重复绑定。
  function listAddableModels() {
    // 温湿度计不关联场景模型：一个「可添加项」就是当前楼层本身。同一层可以有多个温湿度计，
    // 因此这里不做「已添加就排除」的去重（其余类型靠 modelId 去重）。
    if (isTemperatureHumidityMode) {
      return (sceneMetadata?.floors || [])
        .filter(candidateFloorEntry => candidateFloorEntry.id === selectedFloorId)
        .map(floorEntry => ({
          floor: floorEntry,
          // name 用作下拉里的选项文案（楼层名），label 才是新建条目的缺省名称。
          group: {
            id: "",
            name: floorEntry.name,
            label: "温湿度计"
          },
          key: floorEntry.id
        }));
    }
    return (sceneMetadata?.floors || [])
      .filter(candidateFloorEntry => candidateFloorEntry.id === selectedFloorId)
      .flatMap(floorWithModels =>
        (usesModelBinding ? floorSceneModels(floorWithModels) : floorWithModels.groups || [])
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
          ? ["climate", "air-purifier", "cover", "temperature-humidity"]
          : isDeviceKind
            ? ["nas", "television", ...GENERIC_DEVICE_KINDS]
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
    // 组合选中不跨编辑类别保留：切回来时按成员的归属重新推导即可。
    selectedCurtainGroupId = "";
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
    if (!addableModels.length) {
      return;
    }
    pickerGeneration++;
    pickerHandle?.close();
    const addDialogElement = createElement("dialog", "settings-dialog i3d-add-dialog");
    addDialogState = addDialogElement;
    // 温湿度计不是「按钮」而是一块信息卡，文案单独给一份，别拼出「添加温湿度计按钮」。
    const addDialogTitle = isDeviceKind
      ? "添加设备"
      : isTemperatureHumidityMode
        ? "添加温湿度计"
        : isAirPurifierMode
          ? // 净化器没有「按钮」这一说，添加的是「哪台净化器绑在哪个模型上」。
            "添加净化器"
          : "添加" + kindLabel + "按钮";
    addDialogElement.setAttribute("aria-label", addDialogTitle);
    const addDialogHeadingElement = createElement("div", "dialog-heading");
    const addDialogTitleWrapperElement = createElement("div");
    addDialogTitleWrapperElement.append(
      createElement("span", "", "ADD BUTTON"),
      createElement("h2", "", addDialogTitle)
    );
    const addDialogCloseButton = createButton("×", closeAddDialog);
    addDialogCloseButton.className = "icon-button";
    addDialogCloseButton.setAttribute("aria-label", "关闭添加按钮窗口");
    addDialogHeadingElement.append(addDialogTitleWrapperElement, addDialogCloseButton);
    const addDialogBodyElement = createElement("div", "i3d-add-dialog-body");
    const addDialogErrorElement = createElement("p", "i3d-error");
    addDialogErrorElement.setAttribute("role", "status");
    if (isDeviceKind) {
      // NAS / 电视 / 六个通用设备品类合成一个下拉：它们的配置项同住 properties.devices，
      // 差别只在弹窗内容（通用设备多了状态灯规则与附加功能），用户可以就地切换再添加。
      createSelectRow(
        addDialogBodyElement,
        "设备类型",
        [
          ["nas", "NAS"],
          ["television", "电视"],
          ...GENERIC_DEVICE_KINDS.map(genericKind => [
            genericKind,
            genericDeviceProfile(genericKind).label
          ])
        ],
        deviceKind,
        pickedDeviceKind => {
          if (pickedDeviceKind !== deviceKind) {
            switchEditorKind(pickedDeviceKind, true);
          }
        }
      ).setAttribute("aria-label", "设备类型");
    }
    // 温湿度计的候选不是模型而是楼层，标签也跟着换（"放置楼层"）。
    const addDialogModelLabel = isTemperatureHumidityMode
      ? "放置楼层"
      : usesModelBinding
        ? "关联" + kindLabel + "模型"
        : "关联灯组";
    const modelSelectElement = createSelectRow(
      addDialogBodyElement,
      addDialogModelLabel,
      addableModels.map(addableModelEntry => [
        addableModelEntry.key,
        describeItem(addableModelEntry.group)
      ]),
      addableModels[0].key,
      () => {
        addDialogErrorElement.textContent = "";
      }
    );
    modelSelectElement.setAttribute("aria-label", addDialogModelLabel);
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
        if (!chosenModel) {
          throw new Error("该对象已添加或不再可用，请关闭窗口后重新选择。");
        }
        const newItem = isTemperatureHumidityMode
          ? {
              id: randomUuid(),
              floorId: chosenModel.floor.id,
              label: "温湿度计",
              // 两路实体先留空：用户可以先把卡片摆好，再回来绑传感器。
              temperatureEntityId: "",
              humidityEntityId: "",
              // 落点取楼层几何中心、高度取 1.8 米 —— 与运行侧 binding（bridge 的
              // temperatureHumidityFloorCenter / 1.8）同一份口径，新建即所见即所得。
              ...temperatureHumidityFloorCenter(chosenModel.floor),
              height: 1.8,
              // 卡片宽度缺省 180（卡片比圆形按钮宽得多），文字大小缺省 12、触控范围 44 ——
              // 与上游同一份缺省（上游 size 180 / iconSize 12 / hitSize 44）。
              size: 180,
              iconSize: 12,
              hitSize: 44,
              visible: true
            }
          : {
              id: randomUuid(),
              floorId: chosenModel.floor.id,
              [modelIdKey]: chosenModel.group.id,
              // 通用设备刻意不写 entityId：后端 device.py 把「控件自己存了主实体」判为非法
              // （主实体必须由 deviceId 反查，否则拿不到同一台设备的其它实体）；
              // 这两项先留空 —— 校验只要求它们是字符串，没绑设备只是弹窗取不到实体，
              // 编辑器里再用「请先绑定设备」把附加功能与状态灯规则按住。
              ...(isGenericDeviceMode
                ? { deviceId: "", deviceName: "" }
                : { entityId: "" }),
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
                    unboundPosition: COVER_DEFAULT_PREVIEW_POSITION
                  }
                : {}),
              size: 44,
              iconSize: 26,
              visible: true,
              icon: defaultIcon,
              clickAction: usesStatusPanel ? "focus-panel" : "focus"
            };
        // 新建的灯光项同样落到固定效果区间上（与 buildItemPayload / 归一化路径同一份策略），
        // 否则新建后的首帧会拿不到 effectRange/effectDefaults，滑杆量程要等一次归一化才对。
        usesModelBinding || applyFixedLightEffects(newItem);
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
        // 通用设备 / 净化器添加完只是「占住模型」，弹窗内容与实体绑定都在面板里继续配，
        // 别拼出「设置冰箱按钮」这种照抄按钮类设备的文案。
        isGenericDeviceMode
          ? "添加后请先选择这台设备的模型位置，再绑定 Home Assistant 设备，最后点击“保存配置”完成保存。"
          : isAirPurifierMode
            ? "添加后请绑定空气净化器实体，并可继续配置附加功能，最后点击“保存配置”完成保存。"
            : "添加后可继续设置" + kindLabel + "按钮，最后点击“保存配置”完成保存。"
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
    if (!vacuumModelRecord) {
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
            !pickedRoomEntityId
          ) {
            return;
          }
          const entityMetadataEntry = entities.find(
            entityMetadataProbe => entityMetadataProbe.entityId === pickedRoomEntityId
          );
          const pickedEntityState = states?.get?.(pickedRoomEntityId);
          const normalizedEntityState = resolveStateEntry(pickedEntityState);
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
    // 遮罩地址与 mdi 版本号只此一份（utils/icon-url.js）：名字不带 mdi: 前缀也能正确取图标。
    applyMdiMask(iconPreviewElement, selectedShortcut.icon || defaultIcon);
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
  // ---- 通用设备 / 净化器：实体目录、状态灯规则、附加功能 ----
  //
  // 这一段的配置形状由后端定死，本段只负责收集，字段名逐个对应：
  //   · device.py 的 statusRules —— 只有 power（单个 {entityId, active, inactive}）
  //     与 health（同一形状的单个或数组）两种；active 与 inactive 必须不同且非空。
  //   · device.py / purifier.py 的 extraControls —— 每项 {entityId, type, label?, columns?, rows?}，
  //     type 必须等于该域的默认能力（purifier.py 的 EXTRA_TYPES），同一实体只能出现一次，最多 12 项。
  // 两处都刻意不写角色 / 能力位：那些是前端折算用的中间量，后端会原样拒收。

  // 设备目录：编辑器只拿得到实体表（/ha/entities），拿不到 /ha/devices 的设备名，
  // 因此按 deviceId 归拢实体，用该设备下第一个实体的名称当可读文案。
  // 面板标题另有「名称」字段（写的是 label），deviceName 只是标题的兜底，不必是 HA 的原始设备名。
  function deviceCatalog() {
    const entitiesByDeviceId = new Map();
    for (const entityRecord of entities) {
      const deviceId = entityRecord.deviceId || entityRecord.device_id;
      if (!deviceId) {
        continue;
      }
      if (!entitiesByDeviceId.has(deviceId)) {
        entitiesByDeviceId.set(deviceId, []);
      }
      entitiesByDeviceId.get(deviceId).push(entityRecord);
    }
    return [...entitiesByDeviceId.entries()].map(([deviceId, deviceEntities]) => ({
      deviceId,
      name: deviceEntities[0].name || deviceEntities[0].entityId,
      entityCount: deviceEntities.length
    }));
  }
  // 某个实体属于哪台设备；查不到时返回空串。
  const deviceIdOfEntity = entityId =>
    (entities.find(entityRecord => entityRecord.entityId === entityId)?.deviceId ||
      entities.find(entityRecord => entityRecord.entityId === entityId)?.device_id ||
      "") + "";
  // 实体目录为空时的解释文案。净化器只有「主实体没有设备关联」时才真的枚举不到兄弟实体
  // （HA 里实体没有 device 归属，purifierRelatedEntities 就查不出同一台设备的其它实体）；
  // 其余情况是这台设备本身只有主实体一个 —— 两种原因给用户的话术必须分开，
  // 否则用户会去反复重绑实体，而问题其实出在 HA 的设备归属上。
  function emptyCatalogMessage(item, fallbackMessage) {
    if (isAirPurifierMode && !deviceIdOfEntity(item.entityId || "")) {
      return "主实体没有设备关联，无法获取所属设备实体。";
    }
    return fallbackMessage;
  }
  // 一台设备（或净化器主实体所在设备）的实体目录。两个来源刻意分开：
  //   · 通用设备用 deviceEntityCatalog —— 目录里含主实体，附加功能与状态灯都从这里挑；
  //   · 净化器用 purifierRelatedEntities —— 主实体是净化器自己，附加功能只该挑它的兄弟实体。
  function deviceCatalogOf(item) {
    if (isAirPurifierMode) {
      return purifierRelatedEntities(entities, item.entityId || "").map(relatedEntity =>
        entityCapabilities(relatedEntity, states?.get?.(relatedEntity.entityId))
      );
    }
    return deviceEntityCatalog(entities, item.deviceId || "", states);
  }
  // 状态灯规则的候选目录。净化器与通用设备在这里的唯一差别：净化器的主控就是它自己的
  // fan 实体（on / off 正好是一组状态），而 purifierRelatedEntities 有意把它排除在
  // 「兄弟实体」之外（那是附加功能的候选），所以状态灯这边单独补回主实体。
  function statusRuleCatalog(item) {
    const catalog = deviceCatalogOf(item);
    if (!isAirPurifierMode || !item.entityId) {
      return catalog;
    }
    const mainEntity = entities.find(entityRecord => entityRecord.entityId === item.entityId);
    if (!mainEntity || catalog.some(entry => entry.entityId === item.entityId)) {
      return catalog;
    }
    return [entityCapabilities(mainEntity, states?.get?.(item.entityId)), ...catalog];
  }
  // 状态判定的「两种状态 + 中文名」：下拉的唯一来源，用户不必手写 on / off。
  function statusChoicesOf(item, entityId) {
    const catalogEntry =
      statusRuleCatalog(item).find(candidate => candidate.entityId === entityId) ||
      entities.find(entityRecord => entityRecord.entityId === entityId) ||
      {};
    return deviceStatusChoices(catalogEntry, states?.get?.(entityId));
  }
  // 把 statusRules 归一成 {power, health: [...]}：health 允许后端下发的单个对象写法。
  function readStatusRules(item) {
    const rawRules = item.statusRules || {};
    return {
      power: rawRules.power || null,
      health: Array.isArray(rawRules.health)
        ? rawRules.health
        : rawRules.health
          ? [rawRules.health]
          : []
    };
  }
  // 规则写回草稿。两处刻意收紧：
  //   · 空的 power 写成 null 会被后端判成「不是对象」，所以空的整块直接不写；
  //   · 两块都空时删掉整个 statusRules —— 留着空壳会让「有没有配弹窗内容」变得含糊。
  function commitStatusRules(item, powerRule, healthRules) {
    const nextRules = {};
    if (powerRule) {
      nextRules.power = powerRule;
    }
    if (healthRules.length) {
      nextRules.health = healthRules;
    }
    if (Object.keys(nextRules).length) {
      item.statusRules = nextRules;
    } else {
      delete item.statusRules;
    }
  }
  // 单条规则的增 / 改 / 删。规则形状固定为 {entityId, active, inactive}，两端状态值必须不同，
  // 因此换实体 / 换 active 时都要把另一端顶到另一个合法值上。
  function writeStatusRule(item, ruleKey, ruleIndex, nextRule) {
    const existingRules = readStatusRules(item);
    if (ruleKey === "power") {
      commitStatusRules(item, nextRule, existingRules.health);
    } else {
      const healthRules = [...existingRules.health];
      if (nextRule) {
        healthRules[ruleIndex] = nextRule;
      } else {
        healthRules.splice(ruleIndex, 1);
      }
      commitStatusRules(item, existingRules.power, healthRules);
    }
    refreshEditorPreview();
    renderPanel();
  }
  // 状态灯规则的实体选择器（上游口径：规则行第一列是一个选择按钮，不是下拉）。
  // 候选只取这台设备名下的实体（deviceEntityCatalog），走 deviceKind=device-status ——
  // 状态判定允许任意域（sensor / binary_sensor / switch…），不能套灯光那套域白名单。
  // 净化器的提醒条件额外把主实体排掉：主实体命中 on 就是「净化器在开」，当提醒条件会让
  // 指示灯一开机就常亮警告色。
  async function openStatusEntityPicker(item, ruleKey, ruleIndex, triggerElement) {
    if (!pickers?.entity) {
      errorMessageElement.textContent = "实体选择器尚未准备好，请刷新页面。";
      return;
    }
    const statusPickerGeneration = ++pickerGeneration;
    const existingRules = readStatusRules(item);
    const existingRule =
      ruleKey === "power" ? existingRules.power : existingRules.health[ruleIndex];
    const usedEntityIds = new Set(
      existingRules.health.map(healthRule => healthRule.entityId)
    );
    try {
      pickerHandle = await pickers.entity({
        trigger: triggerElement,
        current: existingRule?.entityId || "",
        deviceKind: "device-status",
        title: ruleKey === "power" ? "选择亮灭依据" : "选择提醒实体",
        entityFilter: filteredEntity =>
          filteredEntity.disabledBy == null &&
          filteredEntity.disabled_by == null &&
          filteredEntity.enabled !== false &&
          !["disabled", "missing"].includes(filteredEntity.status) &&
          (ruleKey !== "health" || !usedEntityIds.has(filteredEntity.entityId)) &&
          (!isAirPurifierMode || filteredEntity.entityId !== item.entityId),
        onSelect(pickedEntityId, pickedEntityRecord) {
          if (
            statusPickerGeneration !== pickerGeneration ||
            isDisposed ||
            !isAccessAllowed
          ) {
            return;
          }
          // 清空选择 = 移除这条规则（与上游一致：没选实体就没有依据可判）。
          if (!pickedEntityId) {
            if (existingRule) {
              writeStatusRule(item, ruleKey, ruleIndex, null);
            }
            return;
          }
          const pickedCatalogEntry =
            statusRuleCatalog(item).find(
              catalogEntry => catalogEntry.entityId === pickedEntityId
            ) ||
            (pickedEntityRecord
              ? entityCapabilities(pickedEntityRecord, states?.get?.(pickedEntityId))
              : null);
          if (!pickedCatalogEntry) {
            return;
          }
          // 换实体就整体重建规则：沿用旧规则会留下「新实体 + 旧状态字面量」这种永远匹配不上的组合。
          const nextDefaultRule = defaultDeviceStatusRule(
            pickedCatalogEntry,
            states?.get?.(pickedEntityId),
            ruleKey === "health" ? "health" : "power"
          );
          if (nextDefaultRule) {
            writeStatusRule(item, ruleKey, ruleIndex, nextDefaultRule);
            return;
          }
          // 推不出固定两态的实体走自定义状态：先弹匹配值弹窗，确认前不写草稿 —— 后端要求
          // active / inactive 两个非空且不同，把空值写进草稿会在保存时被 422 拒收。
          openCustomStatusDialog(item, ruleKey, ruleIndex, { entityId: pickedEntityId });
        }
      });
    } catch (statusPickerError) {
      errorMessageElement.textContent = statusPickerError.message;
    }
  }
  // 一条规则的编辑行：实体选择按钮 + 单一「亮灯 / 提醒条件」下拉（或自定义匹配值入口）+ 移除。
  // 实体候选整份放宽成设备目录：deviceStatusChoices 推不出固定两态的实体（select / 多档位
  // 开关 / 传感器…）在 0.6.5 起走「自定义状态」—— 用户在弹窗里直接填两个匹配值。是否出
  // 条件下拉只看这个实体此刻能不能给出合法两态（见下方 hasFixedChoices），不再据此过滤候选。
  //
  // 条件下拉只列「<状态>时亮灯 / 提醒」：active 是命中的那一端，inactive 自动取另一个候选。
  // 后端要求两端不同且非空，所以这里不让用户分别选两端（上游同为单下拉）。
  function createStatusRuleRow(containerElement, item, ruleKey, ruleIndex, rule) {
    const ruleRowElement = createElement("div", "i3d-status-rule");
    const catalog = statusRuleCatalog(item);
    const ruleEntityDisplayName =
      catalog.find(catalogEntry => catalogEntry.entityId === rule?.entityId)?.name ||
      rule?.entityId ||
      "未选择实体";
    const ruleEntityButtonElement = createButton("", () =>
      void openStatusEntityPicker(item, ruleKey, ruleIndex, ruleEntityButtonElement)
    );
    ruleEntityButtonElement.className = "i3d-picker-button";
    ruleEntityButtonElement.append(
      createElement("span", "", rule ? ruleEntityDisplayName : "不设置 · 选择实体")
    );
    ruleEntityButtonElement.setAttribute(
      "aria-label",
      ruleKey === "power" ? "电源状态实体" : "提醒实体 " + (ruleIndex + 1)
    );
    ruleEntityButtonElement.title = ruleEntityDisplayName;
    // 实体候选来自这台设备（净化器是自己的 fan 实体），没绑定设备时列表必然是空的，
    // 按钮直接禁用比点开一个空选择器更好。
    ruleEntityButtonElement.disabled = !item.deviceId;
    ruleRowElement.append(ruleEntityButtonElement);
    if (!rule) {
      ruleRowElement.className += " is-empty";
      containerElement.append(ruleRowElement);
      return;
    }
    const choices = statusChoicesOf(item, rule.entityId);
    // 只有「这个实体能给出固定两态，且规则里存的两个值都还在选项里」时才出下拉；
    // 否则（自定义状态实体 / 选项变过）改出「设置匹配条件」入口，交给弹窗填两个匹配值。
    const hasFixedChoices =
      !!choices &&
      rule.active !== rule.inactive &&
      choices.options.some(choiceEntry => choiceEntry.value === rule.active) &&
      choices.options.some(choiceEntry => choiceEntry.value === rule.inactive);
    if (hasFixedChoices) {
      const activeSelectElement = createElement("select");
      activeSelectElement.className = "i3d-status-state";
      activeSelectElement.setAttribute(
        "aria-label",
        ruleEntityDisplayName + (ruleKey === "power" ? "亮灯条件" : "提醒条件")
      );
      for (const choiceEntry of choices.options) {
        const conditionOptionElement = createElement(
          "option",
          "",
          choiceEntry.label + "时" + (ruleKey === "power" ? "亮灯" : "提醒")
        );
        conditionOptionElement.value = choiceEntry.value;
        activeSelectElement.append(conditionOptionElement);
      }
      activeSelectElement.value = rule.active;
      activeSelectElement.addEventListener("change", () => {
        // 两端相同是后端明确拒绝的组合，这里先一步挡掉：inactive 直接顶到剩下的那个取值。
        const nextActive = activeSelectElement.value;
        const nextInactive = choices.options.find(
          choiceEntry => choiceEntry.value !== nextActive
        )?.value;
        if (
          !nextInactive ||
          !choices.options.some(choiceEntry => choiceEntry.value === nextActive)
        ) {
          return;
        }
        writeStatusRule(item, ruleKey, ruleIndex, {
          ...rule,
          active: nextActive,
          inactive: nextInactive
        });
      });
      ruleRowElement.append(activeSelectElement);
    } else {
      // 自定义状态：两个匹配值只有弹窗里填得下（maxLength 120、还要做「非空 / 互异 / 排除
      // unknown、unavailable」校验），所以规则行只做一个入口按钮。
      const customStatusButtonElement = createButton("设置匹配条件", () =>
        openCustomStatusDialog(item, ruleKey, ruleIndex, rule)
      );
      customStatusButtonElement.setAttribute(
        "aria-label",
        "设置" + ruleEntityDisplayName + "匹配条件"
      );
      ruleRowElement.append(customStatusButtonElement);
    }
    // 移除按钮：电源那条叫「移除亮灭依据」，提醒条件叫「删除<实体名>提醒」—— 两者语义不同
    // （前者是唯一的依据，后者是若干条之一），标题里说清楚。
    const removeRuleButtonElement = createButton("×", () =>
      writeStatusRule(item, ruleKey, ruleIndex, null)
    );
    removeRuleButtonElement.className = "i3d-status-remove";
    removeRuleButtonElement.title =
      ruleKey === "power" ? "移除亮灭依据" : "删除" + ruleEntityDisplayName + "提醒";
    removeRuleButtonElement.setAttribute("aria-label", removeRuleButtonElement.title);
    ruleRowElement.append(removeRuleButtonElement);
    containerElement.append(ruleRowElement);
  }
  // 自定义状态的匹配值弹窗：deviceStatusChoices 推不出固定两态的实体（select / 多档位开关 /
  // 传感器…）由用户直接填两个匹配值。确认前不写草稿 —— 后端要求 active / inactive 两个非空
  // 且不同，空值写进去会在保存时被 422 拒收；取消时通过 onCancel 把入口控件退回原状。
  //
  // 文案与 dist 逐字一致：标题 / 提示 / HA 当前值 / 两个标签 / 校验错误都按 0.6.5 原文。
  function openCustomStatusDialog(item, ruleKey, ruleIndex, rule, onCancel) {
    if (
      isDisposed ||
      !isAccessAllowed ||
      isCameraEditing ||
      isCameraCommandPending ||
      isRangeEditorOpen ||
      auxDialogElement
    ) {
      onCancel?.();
      return;
    }
    const role = ruleKey === "health" ? "health" : "power";
    const statusDialogElement = createElement("dialog", "settings-dialog i3d-add-dialog");
    auxDialogElement = statusDialogElement;
    statusDialogElement.setAttribute("aria-label", "设置指示灯条件");
    const statusHeadingElement = createElement("div", "dialog-heading");
    statusHeadingElement.append(createElement("h2", "", "设置指示灯条件"));
    const statusBodyElement = createElement("div", "i3d-add-dialog-body");
    const statusEntityName =
      statusRuleCatalog(item).find(catalogEntry => catalogEntry.entityId === rule.entityId)?.name ||
      entities.find(entityRecord => entityRecord.entityId === rule.entityId)?.name ||
      rule.entityId;
    statusBodyElement.append(
      createElement("strong", "", statusEntityName || rule.entityId),
      createElement("p", "i3d-note", "此实体使用自定义状态。指定两个匹配值，其他值显示为未知。")
    );
    // HA 当前值只在真拿到状态时展示；unknown / unavailable 也是「当前值」，原样透出更有助于
    // 用户判断该填什么，所以不做过滤。
    const liveStateEntry = states instanceof Map ? states.get(rule.entityId) : states?.[rule.entityId];
    const liveStateText = (liveStateEntry?.newState || liveStateEntry)?.state;
    if (liveStateText != null) {
      statusBodyElement.append(createElement("p", "i3d-note", "HA 当前值：" + liveStateText));
    }
    const activeValueInput = createElement("input");
    const inactiveValueInput = createElement("input");
    activeValueInput.value = rule.active || "";
    inactiveValueInput.value = rule.inactive || "";
    activeValueInput.maxLength = inactiveValueInput.maxLength = 120;
    createSettingRow(
      statusBodyElement,
      role === "health" ? "提醒时的状态值" : "亮灯时的状态值",
      activeValueInput
    );
    createSettingRow(
      statusBodyElement,
      role === "health" ? "恢复时的状态值" : "灭灯时的状态值",
      inactiveValueInput
    );
    const statusErrorElement = createElement("p", "i3d-error");
    statusErrorElement.setAttribute("role", "status");
    statusBodyElement.append(statusErrorElement);
    const confirmStatusButton = createButton("确定", () => {
      const trimmedStatusValues = [activeValueInput.value.trim(), inactiveValueInput.value.trim()];
      if (
        trimmedStatusValues.some(
          trimmedStatusValue =>
            !trimmedStatusValue ||
            trimmedStatusValue.length > 120 ||
            ["unknown", "unavailable"].includes(trimmedStatusValue)
        ) ||
        trimmedStatusValues[0] === trimmedStatusValues[1]
      ) {
        statusErrorElement.textContent =
          "请填写两个不同的有效状态值；未知或不可用不能作为匹配条件。";
        return;
      }
      closeAuxDialog();
      writeStatusRule(item, ruleKey, ruleIndex, {
        entityId: rule.entityId,
        active: trimmedStatusValues[0],
        inactive: trimmedStatusValues[1]
      });
    });
    confirmStatusButton.className = "primary";
    const statusActionsElement = createElement("div", "dialog-actions");
    statusActionsElement.append(
      createButton("取消", () => {
        closeAuxDialog();
        onCancel?.();
      }),
      confirmStatusButton
    );
    statusDialogElement.append(statusHeadingElement, statusBodyElement, statusActionsElement);
    document.body.append(statusDialogElement);
    statusDialogElement.addEventListener("cancel", statusCancelEvent => {
      statusCancelEvent.preventDefault();
      closeAuxDialog();
      onCancel?.();
    });
    statusDialogElement.showModal();
  }
  // 状态灯（可选）：电源状态一条、提醒条件若干条。没有绑定设备时不渲染控件，
  // 只给一句「请先绑定设备」—— 设备的实体目录是这两块的唯一来源。
  //
  // 参数 item 是「当前选中的配置项」：renderPanel 里那份 selectedItem 是渲染块自己的
  // 块级 const，本段这些辅助函数定义在更外层，取不到它，所以由调用方显式传进来。
  function renderStatusRuleSection(item) {
    // i3d-status-settings 是这块「指示灯设置」的标记类（与 0.6.5 同一口径），整块的纵向
    // 间距、标签与规则行的栅格都由它兜住。
    const statusSectionElement = createConfigSection("状态灯（可选）");
    statusSectionElement.className += " i3d-status-settings";
    // 与 0.6.5 dist 逐字一致：先讲清「有没有电源状态」对指示灯颜色的影响，再出控件。
    statusSectionElement.append(
      createElement(
        "p",
        "i3d-note",
        "未设置电源状态时，指示灯只看提醒条件：正常绿灯、异常橙灯；设置电源状态后，关闭时熄灭，未知时灰灯。"
      )
    );
    const rules = readStatusRules(item);
    // 目录为空且一条规则都没有：这里没有任何可配的东西，直接说清原因（而不是渲染一组
    // 按下去只会报错的「添加」按钮）。已有规则时不走这条 —— 那几条要以「已离线」占位显示出来。
    const hasCatalog = !!statusRuleCatalog(item).length;
    const nothingConfigured = !rules.power && !rules.health.length;
    if (!isAirPurifierMode && !item.deviceId) {
      // 通用设备的实体目录来自 deviceId，净化器来自它自己的 fan 实体 —— 两块都还没绑
      // 就没法列候选，这时只给一句提示，不出控件（出了也只能选到空列表）。
      statusSectionElement.append(
        createElement("p", "i3d-note is-empty", "请先绑定设备")
      );
      return;
    }
    // 净化器那支已不可达：0.6.5 的「状态灯（可选）」整块以「设备驱动」为条件，净化器走
    // 实体绑定，渲染侧不再调用本函数（见 renderPanel 里的挂载点）。保留分支只为让本函数
    // 单独复用时行为不变。
    if (isAirPurifierMode && !item.entityId) {
      statusSectionElement.append(
        createElement("p", "i3d-note is-empty", "请先绑定空气净化器实体")
      );
      return;
    }
    if (!hasCatalog && nothingConfigured) {
      statusSectionElement.append(
        createElement(
          "p",
          "i3d-note is-empty",
          emptyCatalogMessage(item, "当前设备没有可用于状态判定的实体")
        )
      );
      return;
    }
    // 电源状态（可选）：始终出一行，未设置时按钮显示「不设置 · 选择实体」。
    // 它是「亮灭依据」本身，因此不再额外给一个「添加主状态规则」按钮（上游同口径）。
    statusSectionElement.append(
      createElement("p", "i3d-status-label", "电源状态（可选）")
    );
    createStatusRuleRow(statusSectionElement, item, "power", 0, rules.power);
    statusSectionElement.append(createElement("p", "i3d-status-label", "提醒条件"));
    rules.health.forEach((healthRule, healthRuleIndex) =>
      createStatusRuleRow(statusSectionElement, item, "health", healthRuleIndex, healthRule)
    );
    // 候选实体不再按「能给出两种状态」过滤：推不出固定两态的实体走自定义状态弹窗。
    // 已经在提醒条件里的实体也不重复出现（同一实体配两条规则没有意义）。
    const healthCandidates = () => {
      const usedEntityIds = new Set(
        readStatusRules(item).health.map(healthRule => healthRule.entityId)
      );
      // 净化器的「提醒条件」不拿它自己的主实体当候选：主实体命中 on 就是「净化器在开」，
      // 拿它当提醒条件会让状态灯一开机就常亮警告色。
      return statusRuleCatalog(item)
        .filter(
          catalogEntry => !isAirPurifierMode || catalogEntry.entityId !== item.entityId
        )
        .filter(catalogEntry => !usedEntityIds.has(catalogEntry.entityId));
    };
    // 没有候选就不出按钮（按下去只会报错的控件比没有更糟）；候选被用光时按钮自然消失，
    // 而「点下去那一刻刚好被用光」这种竞态仍在回调里兜一句文案。
    if (healthCandidates().length) {
      const addHealthRuleButtonElement = createButton("＋ 添加提醒", () =>
        void openStatusEntityPicker(item, "health", rules.health.length, addHealthRuleButtonElement)
      );
      addHealthRuleButtonElement.className = "i3d-status-add";
      addHealthRuleButtonElement.disabled = !item.deviceId;
      statusSectionElement.append(addHealthRuleButtonElement);
    }
    // 与 0.6.5 dist 逐字一致（原文紧跟「＋ 添加提醒」之后）。
    statusSectionElement.append(
      createElement(
        "p",
        "i3d-note",
        "任一提醒条件触发就亮橙灯；未触发为绿灯。设置电源状态后，关闭才会熄灭。"
      )
    );
  }
  // 附加功能（额外控件）：0.6.5 的形态是「预览按钮 + 说明 + 内联 details 选择器」——
  // 勾选即时写回草稿（不弹框、不用点保存），勾完顺手刷新舞台上的实时预览弹窗；
  // 勾选顺序即弹窗里的显示顺序。
  function renderExtraControlsSection(item) {
    const extraSectionElement = createConfigSection("附加功能");
    // 目录的归属设备：通用设备就是绑定的 deviceId；净化器的主实体是它自己的 fan 实体，
    // 归属设备要从实体表里反查。查不到（HA 里实体没有设备归属）时目录必然是空的 ——
    // 空态文案据此分岔（见下面 renderEntityList 里的三岔）。
    const owningDeviceId = isAirPurifierMode
      ? deviceIdOfEntity(item.entityId || "")
      : item.deviceId || "";
    // 「实时预览弹窗」：只让舞台按面板模式打开这条绑定的弹窗 —— 不动相机、不发设备指令。
    // 失败原因写到编辑器顶部那行错误栏（与实体选择器 / 弹窗选择器的处理一致）。
    const previewDevicePanel = async () => {
      try {
        await editorRuntime?.focusCommand("preview-device-panel", item.id);
      } catch (previewPanelError) {
        if (!isDisposed) {
          errorMessageElement.textContent = previewPanelError.message;
        }
      }
    };
    extraSectionElement.append(
      createButton("实时预览弹窗", previewDevicePanel),
      createElement(
        "p",
        "i3d-note",
        "仅选择当前设备的附加实体，最多 12 项。预览随修改实时更新，不发送设备指令；保存后正式生效。"
      )
    );
    const chooserElement = createElement("details", "i3d-extra-chooser");
    const chooserSummaryElement = createElement(
      "summary",
      "",
      "选择附加功能（已选 " + (item.extraControls || []).length + "/12）"
    );
    chooserElement.append(chooserSummaryElement);
    const searchInputElement = createElement("input");
    searchInputElement.placeholder = "搜索本设备实体名称或 ID";
    searchInputElement.setAttribute("aria-label", "搜索附加实体");
    const entityListElement = createElement("div", "i3d-extra-entity-list");
    // entityId → {check, disabled} 登记表：勾选变化时不重建整表（重建会把搜索词与焦点一起
    // 丢掉，滚动位置也回到顶部），只按这张表回写勾选态与「满 12 项 / 实体不可用」的禁用态。
    const chooserCheckboxes = new Map();
    const syncChooserState = () => {
      const selectedEntityIds = new Set(
        (item.extraControls || []).map(extraEntry => extraEntry.entityId)
      );
      chooserSummaryElement.textContent =
        "选择附加功能（已选 " + selectedEntityIds.size + "/12）";
      for (const [entityId, checkboxEntry] of chooserCheckboxes) {
        checkboxEntry.check.checked = selectedEntityIds.has(entityId);
        checkboxEntry.check.disabled =
          !checkboxEntry.check.checked && (checkboxEntry.disabled || selectedEntityIds.size >= 12);
      }
    };
    const renderEntityList = () => {
      const catalog = deviceCatalogOf(item);
      entityListElement.replaceChildren();
      chooserCheckboxes.clear();
      const query = searchInputElement.value.trim().toLowerCase();
      // 已配置但不在目录里的实体（设备换过 / 实体被删）：照 0.6.5 的做法补一行
      // 「已失效或不属于当前设备」。它进不了目录，所以勾选框仍由登记表按「已选中」展示，
      // 取消勾选即把它从配置里摘掉。
      const missingEntries = (item.extraControls || [])
        .filter(
          extraEntry =>
            !catalog.some(catalogEntry => catalogEntry.entityId === extraEntry.entityId)
        )
        .map(extraEntry => ({
          entityId: extraEntry.entityId,
          name: "已失效或不属于当前设备",
          status: "missing"
        }));
      const visibleEntries = [...catalog, ...missingEntries].filter(catalogEntry =>
        ((catalogEntry.name || "") + " " + catalogEntry.entityId)
          .toLowerCase()
          .includes(query)
      );
      if (!visibleEntries.length) {
        // 三岔：有归属设备就说「没有」；没有归属设备时，通用设备是还没绑定（去绑设备），
        // 净化器是 HA 侧实体没有设备归属（重绑实体也没用）。
        entityListElement.append(
          createElement(
            "p",
            "i3d-note",
            owningDeviceId
              ? query
                ? "没有匹配的实体。"
                : "该设备没有其他实体。"
              : isAirPurifierMode
                ? "主实体没有设备关联，无法获取所属设备实体。"
                : "请先绑定设备，再选择弹窗内容。"
          )
        );
      }
      for (const catalogEntry of visibleEntries) {
        const isSelected = (item.extraControls || []).some(
          extraEntry => extraEntry.entityId === catalogEntry.entityId
        );
        const catalogEntryDisabled =
          catalogEntry.disabledBy != null ||
          catalogEntry.disabled_by != null ||
          catalogEntry.enabled === false ||
          ["disabled", "missing"].includes(catalogEntry.status);
        const catalogEntryStateRecord =
          latestStates?.[catalogEntry.entityId] ||
          states?.get?.(catalogEntry.entityId) ||
          states?.[catalogEntry.entityId];
        const catalogEntryState = catalogEntryStateRecord?.newState || catalogEntryStateRecord;
        const catalogEntryTypes = extraTypes(catalogEntry.entityId);
        const optionRowElement = createElement("label", "i3d-extra-entity-row");
        const optionCheckboxElement = createElement("input");
        Object.assign(optionCheckboxElement, {
          type: "checkbox",
          checked: isSelected,
          disabled:
            !isSelected &&
            (catalogEntryDisabled || (item.extraControls || []).length >= 12)
        });
        chooserCheckboxes.set(catalogEntry.entityId, {
          check: optionCheckboxElement,
          disabled: catalogEntryDisabled
        });
        // 三行式文本：名称 / 实体 ID / 「形态 · 状态」。第三行的状态是这一刻的读数，
        // 读不到就说「暂无状态」，实体不可用时换成 0.6.5 的「已禁用或移除」。
        const optionTextElement = createElement("span");
        optionTextElement.title =
          (catalogEntry.name || catalogEntry.entityId) + "\n" + catalogEntry.entityId;
        optionTextElement.append(
          createElement("strong", "", catalogEntry.name || catalogEntry.entityId),
          createElement("small", "", catalogEntry.entityId),
          createElement(
            "small",
            "",
            (extraLabels[catalogEntryTypes[0]] || catalogEntryTypes[0]) +
              " · " +
              (catalogEntryDisabled ? "已禁用或移除" : catalogEntryState?.state || "暂无状态")
          )
        );
        optionCheckboxElement.addEventListener("change", () => {
          const currentControls = item.extraControls || [];
          // 新勾的接在末尾（顺序即弹窗里的显示顺序），取消勾选直接摘掉。
          // label 留空字符串与 0.6.5 一致：它只影响无障碍名，不参与布局。
          item.extraControls = optionCheckboxElement.checked
            ? [
                ...currentControls,
                {
                  entityId: catalogEntry.entityId,
                  type: catalogEntryTypes[0],
                  label: ""
                }
              ]
            : currentControls.filter(
                extraEntry => extraEntry.entityId !== catalogEntry.entityId
              );
          refreshEditorPreview();
          syncChooserState();
          // 勾一下就把预览弹窗上的卡片增删跟上（0.6.5 同口径）。
          void previewDevicePanel();
        });
        optionRowElement.append(optionCheckboxElement, optionTextElement);
        entityListElement.append(optionRowElement);
      }
    };
    searchInputElement.addEventListener("input", renderEntityList);
    renderEntityList();
    chooserElement.append(searchInputElement, entityListElement);
    extraSectionElement.append(chooserElement);
    // 展开选择器本身就说明用户想看弹窗内容，顺手把预览打开（0.6.5 同口径）。
    chooserElement.addEventListener("toggle", () => {
      if (chooserElement.open) {
        void previewDevicePanel();
      }
    });
  }
  // 通用设备绑定：整台 HA 设备一个绑定，走设备选择器（与 0.6.5 的 pickers.device 同一契约）。
  // 按钮承载读数：未绑定时是「选择设备」，绑定后是设备名（与上游逐字一致）。
  //
  // 0.6.5 里这一行控件直接落在「基础绑定」里（不另起分区），所以由调用方把该分区传进来。
  // parentSectionElement 缺省时才自建分区，供单独复用。
  // 与净化器同口径：选择器只能由 renderPanel 那一层打开（openItemPicker 是它的局部函数），
  // 所以这里只负责画控件，「开选择器」由调用方以 openDevicePicker 回调传进来。
  // 换设备 / 解绑都要清空弹窗内容（旧附加实体与状态规则属于上一台设备），
  // 具体处置在 openItemPicker 的 device 分支里 —— 那里才拿得到选择器回传的设备。
  function renderGenericDeviceBindingSection(item, parentSectionElement, openDevicePicker) {
    const bindingSectionElement = parentSectionElement ?? createConfigSection("绑定设备");
    const deviceButtonElement = createButton(
      item.deviceName || "选择设备",
      () => void openDevicePicker(deviceButtonElement)
    );
    deviceButtonElement.className = "i3d-picker-button";
    deviceButtonElement.setAttribute("aria-label", "绑定设备");
    createSettingRow(bindingSectionElement, "绑定设备", deviceButtonElement);
    return bindingSectionElement;
  }
  // 净化器主实体：HA 里是 fan 域，但用的仍是编辑器的**统一实体选择器**
  // （.i3d-picker-button，与灯光 / 设备 / 窗帘同款控件），只是 deviceKind 带 "air-purifier"
  // 让选择器只列 fan.*（见 editor-pickers.js 的 isAirPurifierEntity，与上游 0.6.5 同一条白名单）。
  // 与通用设备同一口径：这一行也落在「基础绑定」里，行标题照 0.6.5 用「绑定实体」
  // （净化器的主实体就是它自己的 fan 实体，所以这里选的是实体而不是设备）。
  // 换绑的确认与清空逻辑在 openPurifierPicker 那层（renderPanel 里的 openItemPicker）——
  // 选择器开合只在那层拿得到，这里只负责画控件。
  function renderAirPurifierBindingSection(item, parentSectionElement, openPurifierPicker) {
    const purifierSectionElement = parentSectionElement ?? createConfigSection("绑定净化器");
    const purifierEntityButton = createButton(
      "",
      () => void openPurifierPicker(purifierEntityButton)
    );
    purifierEntityButton.className = "i3d-picker-button";
    const purifierEntityName = entities.find(
      purifierMetadataProbe => purifierMetadataProbe.entityId === item.entityId
    )?.name;
    purifierEntityButton.title = item.entityId || "选择空气净化器实体";
    purifierEntityButton.append(
      createElement("span", "", purifierEntityName || item.entityId || "选择空气净化器实体")
    );
    purifierEntityButton.setAttribute("aria-label", "选择空气净化器实体");
    createSettingRow(purifierSectionElement, "绑定实体", purifierEntityButton);
    // 只画这一行：0.6.5 的净化器绑定下面没有说明段落（本仓曾加过两句解释，已按原版删掉）。
    return purifierSectionElement;
  }
  // ---- 窗帘组合（一拖多）：组合入口的独立编辑面板 ----
  //
  // 组合在舞台上是一个**独立条目**（id 前缀 "curtain-group:"，见 cover-groups.js）：可以在
  // 舞台单独选中 / 拖动 / 隐藏 / 聚焦，运行时（binding-collectors / marker-layer）已按这个口径
  // 把入口当普通条目渲染。本面板只补「入口」的编辑侧：名称、成员入口、交互行为、尺寸、位置、
  // 聚焦视角与解除。成员的外观 / 实体仍回到各自的窗帘面板里调（见「组合成员」的「· 编辑」）。
  function renderCurtainGroupPanel(group) {
    const memberItems = group.memberIds.map(memberId =>
      getItemList().find(memberProbe => memberProbe.id === memberId)
    );
    const anchorMember = memberItems[0];
    // 入口未显式设置坐标 / 高度时，运行时沿用第一层成员的值（binding-collectors 的
    // collectCurtainGroupBindings）：那里的锚点是 collectCurtainBindings 解析后的绑定，
    // 坐标与高度都已由户型模型补全。面板初值必须取自同一来源 —— 直接读配置项的话，
    // 「跟随模型」的成员那三格恒显 0，而舞台把它画在模型位置；看着像坏了，且第一次输入
    // 会把整组钉到原点（对用户是一次没有提示的跳变）。
    const anchorModel = (sceneMetadata?.floors || [])
      .find(anchorFloorProbe => anchorFloorProbe.id === anchorMember?.floorId)
      ?.curtains?.find(anchorModelProbe => anchorModelProbe.id === anchorMember?.modelId);
    const readGroupNumber = groupKey =>
      Number.isFinite(group[groupKey])
        ? group[groupKey]
        : Number.isFinite(anchorMember?.[groupKey])
          ? anchorMember[groupKey]
          : Number.isFinite(anchorModel?.[groupKey])
            ? anchorModel[groupKey]
            : 0;

    // 组合入口：名称 + 两条说明。
    const entrySectionElement = createConfigSection("组合入口");
    const entryRowElement = createConfigRow(entrySectionElement);
    const groupLabelInput = createElement("input");
    groupLabelInput.value = group.label || "双层窗帘";
    groupLabelInput.maxLength = 128;
    groupLabelInput.addEventListener("change", () => {
      group.label = groupLabelInput.value.trim() || "双层窗帘";
      refreshEditorPreview();
      renderPanel();
    });
    createSettingRow(entryRowElement, "组合名称", groupLabelInput);
    entrySectionElement.append(
      createElement(
        "p",
        "i3d-note",
        "双图标各自显示状态，共用点击范围。名称只用于配置和弹窗，不在户型上显示。"
      ),
      createElement(
        "p",
        "i3d-note",
        "3D 画面只显示双图标，无文字；两个模型仍各自动画。不会移动模型或发送设备命令。"
      )
    );

    // 组合成员：第一个成员是左图标 / 上控制区，第二个是右图标 / 下控制区；点「· 编辑」回到
    // 该成员的窗帘面板（那里有模型 / 实体 / 图标 / 帘布）。
    const memberSectionElement = createConfigSection("组合成员");
    const memberActionsElement = createElement("div", "i3d-group-member-actions");
    memberSectionElement.append(memberActionsElement);
    memberItems.forEach((memberItem, memberIndex) => {
      if (!memberItem) {
        return;
      }
      memberActionsElement.append(
        createButton(
          (memberIndex === 0 ? "左图标 / 上控制区" : "右图标 / 下控制区") +
            "：" +
            (memberItem.label || "窗帘") +
            " · 编辑",
          () => {
            selectedItemId = memberItem.id;
            selectedCurtainGroupId = "";
            refreshEditorPreview({ markDirty: false });
            renderPanel();
          }
        )
      );
    });
    memberActionsElement.append(
      createButton("交换两层顺序", () => {
        group.memberIds.reverse();
        refreshEditorPreview();
        renderPanel();
      })
    );
    memberSectionElement.append(
      createElement(
        "p",
        "i3d-note",
        "这里只调整成员模型、实体、图标和帘布；入口位置、大小、隐藏方式和聚焦视角由组合统一管理。"
      )
    );

    // 交互行为：弹窗排布 + 点击入口的行为 + 两种隐藏方式。与单条窗帘面板同一套控件口径。
    const behaviorSectionElement = createConfigSection("交互行为");
    createSelectRow(
      behaviorSectionElement,
      "弹窗布局",
      [
        ["horizontal", "左右布局"],
        ["vertical", "上下布局"]
      ],
      group.panelLayout === "vertical" ? "vertical" : "horizontal",
      pickedGroupLayout => {
        group.panelLayout = pickedGroupLayout === "vertical" ? "vertical" : "horizontal";
        refreshEditorPreview();
      }
    );
    behaviorSectionElement.append(
      createElement(
        "p",
        "i3d-note",
        "左右布局保持普通弹窗大小；上下布局增加高度。均跟随自定义弹窗缩放与位置。"
      )
    );
    createSelectRow(
      behaviorSectionElement,
      "点击组合入口",
      [
        ["focus", "聚焦并显示控制"],
        ["panel", "仅显示控制"]
      ],
      group.clickAction === "panel" ? "panel" : "focus",
      pickedGroupClickAction => {
        group.clickAction = pickedGroupClickAction === "panel" ? "panel" : "focus";
        refreshEditorPreview();
      }
    );
    const groupVisibilityRowElement = createElement("div", "i3d-button-visibility-row");
    behaviorSectionElement.append(groupVisibilityRowElement);
    const groupHiddenClickableCheckbox = createElement("input");
    Object.assign(groupHiddenClickableCheckbox, {
      type: "checkbox",
      checked: group.hiddenClickable === true && group.buttonHidden !== true
    });
    groupHiddenClickableCheckbox.addEventListener("change", () => {
      group.visible = true;
      group.hiddenClickable = groupHiddenClickableCheckbox.checked;
      if (groupHiddenClickableCheckbox.checked) {
        group.buttonHidden = false;
        groupButtonHiddenCheckbox.checked = false;
      }
      refreshEditorPreview();
      renderPanel();
    });
    createSettingRow(
      groupVisibilityRowElement,
      "隐藏（可点击）",
      groupHiddenClickableCheckbox
    ).parentElement.className += " i3d-hidden-clickable-setting";
    const groupButtonHiddenCheckbox = createElement("input");
    Object.assign(groupButtonHiddenCheckbox, {
      type: "checkbox",
      checked: group.buttonHidden === true
    });
    groupButtonHiddenCheckbox.addEventListener("change", () => {
      group.visible = true;
      group.buttonHidden = groupButtonHiddenCheckbox.checked;
      if (groupButtonHiddenCheckbox.checked) {
        group.hiddenClickable = false;
        groupHiddenClickableCheckbox.checked = false;
      }
      refreshEditorPreview();
      renderPanel();
    });
    createSettingRow(
      groupVisibilityRowElement,
      "隐藏（不可点击）",
      groupButtonHiddenCheckbox
    ).parentElement.className += " i3d-hidden-clickable-setting";

    // 按钮外观：组合没有自己的图标，尺寸仍按入口的合成标记算（双图标并排）。
    const appearanceSectionElement = createConfigSection("按钮外观");
    const appearanceRowElement = createConfigRow(appearanceSectionElement);
    const groupSizeGridElement = createElement("div", "i3d-coordinate-grid i3d-size-grid");
    const groupSizeDetailsElement = createElement("details");
    groupSizeDetailsElement.append(
      createElement("summary", "", "更多尺寸设置"),
      groupSizeGridElement
    );
    appearanceSectionElement.append(groupSizeDetailsElement);
    createSizeRow(
      appearanceRowElement,
      "按钮大小（px）",
      () => group.size ?? 44,
      pickedGroupSizeValue => {
        group.size = pickedGroupSizeValue;
        refreshEditorPreview();
      }
    );
    createSizeRow(
      groupSizeGridElement,
      "图标大小（px）",
      () => group.iconSize ?? 26,
      pickedGroupIconSizeValue => {
        group.iconSize = pickedGroupIconSizeValue;
        refreshEditorPreview();
      }
    );
    createSizeRow(
      groupSizeGridElement,
      "触控范围（px）",
      () =>
        Number.isFinite(group.hitSize) && group.hitSize > 0
          ? group.hitSize
          : Math.max(44, group.size ?? 44),
      pickedGroupHitSizeValue => {
        group.hitSize = pickedGroupHitSizeValue;
        refreshEditorPreview();
      }
    );

    // 按钮位置：与单条窗帘的「按钮位置」同一量纲；未显式设置时跟随第一层入口。
    const positionSectionElement = createConfigSection("按钮位置");
    const groupPositionGridElement = createElement("div", "i3d-coordinate-grid");
    positionSectionElement.append(groupPositionGridElement);
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
      createNumberRow(
        groupPositionGridElement,
        coordinateLabel,
        readGroupNumber(coordinateKey),
        coordinateMin,
        coordinateMax,
        coordinateStep,
        pickedGroupCoordinateValue => {
          group[coordinateKey] = pickedGroupCoordinateValue;
          refreshEditorPreview();
        }
      );
    }
    positionSectionElement.append(
      createButton("一键应用到其他组合窗帘", () =>
        openCurtainGroupBatchApplyDialog(group)
      ),
      createButton("恢复跟随第一层入口", () => {
        for (const entryPositionKey of ["x", "y", "height"]) {
          delete group[entryPositionKey];
        }
        refreshEditorPreview();
        renderPanel();
      })
    );

    renderCurtainGroupFocusSection(group);

    // 组合管理：只解关系，不动两层的配置项。
    const manageSectionElement = createConfigSection("组合管理");
    manageSectionElement.append(
      createElement(
        "p",
        "i3d-note",
        "解除组合仅移除组合关系，恢复两层各自的入口、位置、聚焦视角与图标；不会删除模型或设备。"
      ),
      createButton("解除组合", () => {
        setCurtainGroupList(
          getCurtainGroupList().filter(curtainGroupEntry => curtainGroupEntry.id !== group.id)
        );
        selectedCurtainGroupId = "";
        selectedItemId = group.memberIds[0] || "";
        refreshEditorPreview();
        renderPanel();
      })
    );
  }
  // 组合入口的聚焦视角：复用单副帘同一套相机指令（edit-light-camera / save-light-camera /
  // preview-light-camera），只是目标 id 换成组合条目 id —— 舞台按 id 反查绑定，组合条目同样
  // 在绑定表里，因此无需为组合单开指令；相机队列与「调整中」状态与其余预览共用。
  function renderCurtainGroupFocusSection(group) {
    const focusSectionElement = createElement(
      "section",
      "i3d-focus-settings i3d-config-section"
    );
    focusSectionElement.append(createElement("h4", "", "聚焦视角"));
    panelElement.append(focusSectionElement);
    const focusActionsElement = createElement("div", "i3d-focus-actions");
    focusSectionElement.append(focusActionsElement);
    const groupEntryId = curtainGroupEntryId(group);
    const runGroupCameraCommand = async (cameraCommand, cameraPayload) => {
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
          cameraCommand,
          groupEntryId,
          cameraPayload
        );
        if (isDisposed || sceneReadySnapshot !== sceneReadyGeneration) {
          return;
        }
        if (cameraCommand === "save-light-camera") {
          group.focusCamera = cameraCommandResult.camera;
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
        if (!isDisposed && sceneReadySnapshot === sceneReadyGeneration && !isFocalLengthCommand) {
          isCameraCommandPending = false;
          renderPanel();
        }
      }
    };
    if (isCameraEditing) {
      const saveGroupCameraButton = createButton("保存视角", () =>
        void runGroupCameraCommand("save-light-camera")
      );
      saveGroupCameraButton.className = "primary";
      focusActionsElement.append(
        saveGroupCameraButton,
        createButton("取消调整", () => void runGroupCameraCommand("cancel-light-camera"))
      );
      const projectionGroupElement = createElement("div", "i3d-focus-actions");
      projectionGroupElement.setAttribute("role", "group");
      projectionGroupElement.setAttribute("aria-label", "聚焦投影");
      focusSectionElement.append(projectionGroupElement);
      for (const [projectionKey, projectionLabel] of [
        ["orthographic", "正交"],
        ["perspective", "透视"]
      ]) {
        const projectionButton = createButton(projectionLabel, () =>
          void runGroupCameraCommand("focus-projection", projectionKey)
        );
        projectionButton.setAttribute(
          "aria-pressed",
          String((pendingCameraDraft?.mode || "orthographic") === projectionKey)
        );
        projectionGroupElement.append(projectionButton);
      }
      const focalLengthInputElement = createNumberRow(
        focusSectionElement,
        "焦段（mm）",
        Math.round(pendingCameraDraft?.focalLength || 50),
        18,
        120,
        1,
        pickedFocalLength => void runGroupCameraCommand("focus-focal-length", pickedFocalLength)
      );
      focalLengthInputElement.disabled = pendingCameraDraft?.mode !== "perspective";
    } else {
      focusActionsElement.append(
        createButton(group.focusCamera ? "调整视角" : "设置视角", () =>
          void runGroupCameraCommand("edit-light-camera")
        ),
        createButton("预览聚焦", () => void runGroupCameraCommand("preview-light-camera"))
      );
      const resetGroupFocusButton = createButton("恢复自动聚焦", async () => {
        try {
          await editorRuntime.focusCommand("cancel-light-camera", groupEntryId);
          delete group.focusCamera;
          refreshEditorPreview();
          renderPanel();
        } catch (resetGroupFocusError) {
          errorMessageElement.textContent = resetGroupFocusError.message;
        }
      });
      resetGroupFocusButton.disabled = !group.focusCamera;
      resetGroupFocusButton.className = "i3d-focus-reset";
      focusSectionElement.append(resetGroupFocusButton);
    }
    if (isCameraCommandPending) {
      for (const focusSettingControl of focusSectionElement.querySelectorAll("button, input")) {
        focusSettingControl.disabled = true;
      }
    }
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
        // 六个通用设备品类与 NAS / 电视并列：它们在 properties.devices 里各有一个集合，
        // 但共用「绑定设备 + 状态灯规则 + 附加功能」这套面板。
        createSelectRow(
          currentContainer,
          "设备类别",
          [
            ["nas", "NAS"],
            ["television", "电视"],
            ...GENERIC_DEVICE_KINDS.map(genericKind => [
              genericKind,
              genericDeviceProfile(genericKind).label
            ])
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
          // 选项顺序与上游 0.6.5 逐字一致：空调 / 窗帘 / 空气净化器 / 温湿度计。
          // 本仓内部把净化器记作 "air-purifier"（上游是 "purifier"），值不改，只对齐顺序。
          [
            ["climate", "空调"],
            ["cover", "窗帘"],
            // 空气净化器与空调共用外观模型与实时面板（HA 里是 fan 域），但它是独立的
            // environment.airPurifiers 集合：实体、附加功能与状态灯都各配各的。
            ["air-purifier", "空气净化器"],
            ["temperature-humidity", "温湿度计"]
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
      currentContainer = createConfigSection(
        isTemperatureHumidityMode ? "温湿度计列表" : usesModelBinding ? "模型列表" : "灯光列表"
      );
      const floorModels = listAddableModels();
      const addItemButton = createButton("添加" + kindLabel, openAddDialog);
      // 列表选择器挂在哪：温湿度计照参考实现挂在分区上（标题 / 按钮 / 说明 / 列表各自独立成行）；
      // 其余类型沿用「标题占左列、控件占右列」的紧缩栅格。
      let listControlContainer = currentContainer;
      if (isTemperatureHumidityMode) {
        // 温湿度计不绑场景模型，「能不能加」就只该看权限。若照其它类型看本层有没有模型，
        // 一层没摆任何模型时这个按钮会被永久禁掉，温湿度计再也加不出来。
        addItemButton.disabled = !isAccessAllowed;
        // 按钮与参考实现同为强调态（琥珀底 + 深色字，见 app.css 的 button.primary），
        // 并且放在行容器里 —— .i3d-config-row 是两列栅格，单枚按钮因此只占半幅宽。
        addItemButton.className = "primary";
        createConfigRow(currentContainer).append(addItemButton);
        // 先讲清它的性质，省得用户去这一节里找它的模型绑定、点击行为和控制指令（这三样它都没有）。
        currentContainer.append(
          createElement(
            "p",
            "i3d-note",
            "温湿度计是独立信息框，不绑定户型模型，不聚焦，不发送控制指令。"
          )
        );
      } else {
        // 紧缩栅格：标题占左列、列表控件占右列（见 runtime.css 的 .i3d-compact-list）。
        currentContainer.className += " i3d-compact-list";
        const listHeadingElement = createElement("div", "i3d-config-list-row");
        addItemButton.disabled = !floorModels.length;
        currentContainer.append(listHeadingElement);
        listHeadingElement.append(addItemButton);
        listControlContainer = listHeadingElement;
      }
      const floorItems = getItemList().filter(
        floorItemProbe =>
          floorItemProbe.floorId === selectedFloorId ||
          (usesModelBinding &&
            !sceneMetadata.floors.some(
              sceneFloorProbe => sceneFloorProbe.id === floorItemProbe.floorId
            ))
      );
      // 窗帘组合在「当前按钮」里也作为一个可选项出现（label 带「（组合）」后缀）：选中它即进入
      // 「组合入口」面板。成员条目仍各自保留，方便直接进去调单层。
      const curtainGroupOptions = isCoverMode
        ? validCurtainGroups(draftProperties.environment)
            .filter(curtainGroupEntry => curtainGroupEntry.floorId === selectedFloorId)
            .map(curtainGroupEntry => [
              curtainGroupEntryId(curtainGroupEntry),
              (curtainGroupEntry.label || "双层窗帘") + "（组合）"
            ])
        : [];
      // 组合选中态只在「当前楼层确实有这个组合」时有效：切楼层、组合刚被删或刚变得不合法
      // 都要退出，否则面板会停在上一个楼层的组合入口上，而「当前按钮」里根本找不到它。
      if (
        selectedCurtainGroupId &&
        !curtainGroupOptions.some(
          optionEntry => optionEntry[0] === curtainGroupEntryId({ id: selectedCurtainGroupId })
        )
      ) {
        selectedCurtainGroupId = "";
      }
      if (
        !selectedCurtainGroupId &&
        !floorItems.some(existingFloorItemProbe => existingFloorItemProbe.id === selectedItemId)
      ) {
        selectedItemId = floorItems[0]?.id || "";
      }
      if (floorItems.length || curtainGroupOptions.length) {
        createSelectRow(
          listControlContainer,
          isDeviceKind
            ? "当前设备"
            : isAirPurifierMode
              ? "当前净化器"
              : isTemperatureHumidityMode
                ? "当前温湿度计"
                : "当前按钮",
          [
            ...curtainGroupOptions,
            ...floorItems.map(itemOptionEntry => [itemOptionEntry.id, itemOptionEntry.label])
          ],
          selectedCurtainGroupId
            ? curtainGroupEntryId({ id: selectedCurtainGroupId })
            : selectedItemId,
          pickedItemId => {
            pickerGeneration++;
            pickerHandle?.close();
            if (pickedItemId.startsWith("curtain-group:")) {
              const pickedCurtainGroup = validCurtainGroups(draftProperties.environment).find(
                curtainGroupEntry => curtainGroupEntryId(curtainGroupEntry) === pickedItemId
              );
              selectedCurtainGroupId = pickedCurtainGroup?.id || "";
              selectedItemId = pickedCurtainGroup?.memberIds[0] || selectedItemId;
            } else {
              selectedItemId = pickedItemId;
              // 换了一副帘就退出组合选中态，舞台高亮跟着走（组合编辑态由成员归属重新推导）。
              selectedCurtainGroupId = "";
            }
            refreshEditorPreview({
              markDirty: false
            });
            renderPanel();
          }
        );
      } else if (isTemperatureHumidityMode) {
        // 本层还没有温湿度计：给一句明确的下一步（参考实现同样只在这一种情况下提示）。
        // 往下不再渲染「显示内容 / 位置与大小」—— 此时没有选中的条目可配。
        currentContainer.append(
          createElement("p", "i3d-note", "当前楼层还没有温湿度计，请点击“添加温湿度计”。")
        );
      }
      // 选中组合条目时整块换成「组合入口」面板：入口本身是独立条目，不该再混进单副帘的
      // 基础绑定 / 帘布外观（那些回到「组合成员」的「· 编辑」里调）。
      if (isCoverMode && selectedCurtainGroupId) {
        const activeCurtainGroup = validCurtainGroups(draftProperties.environment).find(
          curtainGroupEntry => curtainGroupEntry.id === selectedCurtainGroupId
        );
        if (activeCurtainGroup) {
          renderCurtainGroupPanel(activeCurtainGroup);
          return;
        }
        selectedCurtainGroupId = "";
      }
      const selectedItem = getItemList().find(
        matchedItemProbe => matchedItemProbe.id === selectedItemId
      );
      if (selectedItem) {
        const removeItemButton = createButton(
          isDeviceKind
            ? "删除此设备"
            : isTemperatureHumidityMode
              ? "删除此温湿度计"
              : "删除此" + kindLabel + "按钮",
          () => {
            pickerGeneration++;
            pickerHandle?.close();
            setItemList(
              getItemList().filter(removedItemProbe => removedItemProbe.id !== selectedItem.id)
            );
            if (isCoverMode) {
              // 删掉的帘若是某组合的成员，组合也就不合法了：一并移除，避免留下一条
              // 舞台永远不渲染、编辑器也点不到的幽灵组合（后端校验同样会拒收）。
              setCurtainGroupList(
                getCurtainGroupList().filter(
                  curtainGroupEntry => !curtainGroupEntry.memberIds.includes(selectedItem.id)
                )
              );
              selectedCurtainGroupId = "";
            }
            selectedItemId = "";
            refreshEditorPreview();
            renderPanel();
          }
        );
        removeItemButton.className = "i3d-remove-light";
        // 「基础绑定」装的是这个控件要绑定的模型 / 主实体 / 名称。温湿度计三样都没有：
        // 卡片不跟随场景模型（靠 x / y 落点定位），标题与两路实体统一收在
        // 「显示内容（含文字）」一节 —— 与上游同序（上游该节：标题 → 温度实体 → 湿度实体，
        // 且整张卡片没有「基础绑定」这一节）。
        currentContainer = createConfigSection(
          isTemperatureHumidityMode ? "显示内容（含文字）" : "基础绑定"
        );
        const bindingContainer = currentContainer;
        // 温湿度计在这节里没有「名称」与「关联模型」，也就没有需要并排的半宽行
        // （标题与两路实体都是整宽单字段行），不为它建这个行容器。
        const bindingRowElement = isTemperatureHumidityMode
          ? null
          : createConfigRow(bindingContainer);
        if (!isTemperatureHumidityMode) {
          const nameInputElement = createElement("input");
          nameInputElement.value = selectedItem.label;
          nameInputElement.maxLength = 128;
          nameInputElement.addEventListener("change", () => {
            selectedItem.label = nameInputElement.value.trim() || kindLabel;
            refreshEditorPreview();
          });
          createSettingRow(bindingRowElement, "名称", nameInputElement);
        }
        // 温湿度计不绑场景模型，这条「关联模型」整段跳过（它靠 x / y 落点定位）。
        if (usesModelBinding && !isTemperatureHumidityMode) {
          const modelCandidates = sceneMetadata.floors
            .filter(candidateFloorProbe => candidateFloorProbe.id === selectedFloorId)
            .flatMap(candidateFloor =>
              floorSceneModels(candidateFloor)
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
        // 温湿度计的两路实体字段：都走实体选择器，但 deviceKind 上带出「哪一路」，
        // 选择器据此按 matchesTemperatureHumidityEntity 过滤出温度 / 湿度传感器。
        const temperatureHumidityPickerKinds = {
          temperatureEntityId: "temperature-humidity-temperature",
          humidityEntityId: "temperature-humidity-humidity"
        };
        // 通用实体 / 模型选择器入口，选择结果写回指定字段（支持嵌套路径）。
        const openItemPicker = async (targetField, itemPickerTrigger) => {
          const itemPickerGeneration = ++pickerGeneration;
          errorMessageElement.textContent = "";
          try {
            const isEntityField =
              targetField === "powerEntity" ||
              // 净化器主实体也走统一实体选择器（fan.* 白名单在 editor-pickers 里）。
              targetField === "purifier" ||
              Object.hasOwn(temperatureHumidityPickerKinds, targetField);
            const pickerMethod = pickers?.[isEntityField ? "entity" : targetField];
            if (!pickerMethod) {
              // 两条文案都在上游 0.6.5 里：实体选择器单独一条，其余选择器一条。
              throw new Error(
                isEntityField
                  ? "实体选择器尚未准备好，请刷新页面。"
                  : "选择器尚未准备好，请保存后刷新页面。"
              );
            }
            const itemPickerHandle = await pickerMethod({
              trigger: itemPickerTrigger,
              deviceKind:
                temperatureHumidityPickerKinds[targetField] ||
                (targetField === "powerEntity" ? "television-power" : deviceKind),
              current:
                targetField === "device" || targetField === "vacuum"
                  ? selectedItem.deviceId
                  : targetField === "powerEntity"
                    ? selectedItem.powerEntityId
                    : temperatureHumidityPickerKinds[targetField]
                      ? selectedItem[targetField]
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
                  if (targetField === "device") {
                    // 0.6.5 口径：换设备 / 解绑一律清掉附加功能与状态灯规则 —— 两者都挂在
                    // 旧设备的实体上，留着只会让弹窗去订阅一批不存在的实体。
                    const applyPickedDevice = () => {
                      if (selectedItem.deviceId !== (pickedFieldValue?.deviceId || "")) {
                        delete selectedItem.extraControls;
                        delete selectedItem.statusRules;
                      }
                      selectedItem.deviceId = pickedFieldValue?.deviceId || "";
                      // deviceName 只作弹窗标题的兜底（面板标题走「名称」字段），跟随所选设备。
                      selectedItem.deviceName = pickedFieldValue?.name || "";
                      // 后端 device.py 不接受通用设备控件存 entityId：清掉旧配置里可能残留的那一项。
                      delete selectedItem.entityId;
                      if (pickedFieldValue) {
                        devicesByDeviceId.set(pickedFieldValue.deviceId, pickedFieldValue);
                        // 实体表是打开弹窗那一刻的快照，刚绑的设备可能还不在里面 —— 目录空着
                        // 会让「附加功能 / 状态灯」立刻显示成「该设备没有其他实体」。就地把
                        // 这台设备的实体并进来（先摘掉旧的同设备记录，避免重绑后出现两份）。
                        entities = [
                          ...entities.filter(
                            entityRecord =>
                              (entityRecord.deviceId || entityRecord.device_id) !==
                              pickedFieldValue.deviceId
                          ),
                          ...(pickedFieldValue.entities || [])
                        ];
                      }
                      refreshEditorPreview();
                      renderPanel();
                    };
                    if (
                      selectedItem.deviceId &&
                      selectedItem.deviceId !== (pickedFieldValue?.deviceId || "")
                    ) {
                      // 换设备确认：0.6.5 用的是编辑器自己的 settings-dialog（h2 + p +
                      // 取消 / 确定更换），不是站内统一确认框 —— 弹窗本体与按钮类名都照上游，
                      // 别换回 confirmAction（那套 heading + × + 面板是另一个观感）。
                      const deviceChangeDialogElement = createElement(
                        "dialog",
                        "settings-dialog i3d-add-dialog"
                      );
                      auxDialogElement = deviceChangeDialogElement;
                      const deviceChangeActionsElement = createElement("div", "dialog-actions");
                      const confirmDeviceChangeButton = createButton("确定更换", () => {
                        if (
                          isDisposed ||
                          !isAccessAllowed ||
                          auxDialogElement !== deviceChangeDialogElement ||
                          !getItemList().includes(selectedItem)
                        ) {
                          return;
                        }
                        closeAuxDialog();
                        applyPickedDevice();
                      });
                      // 上游这一颗按钮没带 primary（净化器那条同款弹窗才带），照抄不加。
                      deviceChangeActionsElement.append(
                        createButton("取消", closeAuxDialog),
                        confirmDeviceChangeButton
                      );
                      deviceChangeDialogElement.append(
                        createElement("h2", "", "更换设备"),
                        createElement(
                          "p",
                          "",
                          "更换或解绑将清空弹窗内容和状态灯规则，保存后生效。"
                        ),
                        deviceChangeActionsElement
                      );
                      document.body.append(deviceChangeDialogElement);
                      deviceChangeDialogElement.addEventListener("cancel", cancelEvent => {
                        cancelEvent.preventDefault();
                        closeAuxDialog();
                      });
                      deviceChangeDialogElement.showModal();
                      return;
                    }
                    applyPickedDevice();
                  } else if (targetField === "vacuum") {
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
                  } else if (targetField === "purifier") {
                    // 净化器主实体（fan.*）。换到另一台净化器（HA 里是另一台设备）时先问一次：
                    // 附加功能与状态灯规则都挂在旧设备的兄弟实体上，直接换掉会让那两块配置
                    // 指向不存在的实体。同一台设备下换实体不算换设备，保留配置。
                    const applyPickedPurifierEntity = () => {
                      if (
                        selectedItem.entityId !== pickedFieldValue &&
                        purifierDeviceChanged(
                          entities,
                          selectedItem.entityId || "",
                          pickedFieldValue || ""
                        )
                      ) {
                        delete selectedItem.extraControls;
                        delete selectedItem.statusRules;
                      }
                      selectedItem.entityId = pickedFieldValue || "";
                    };
                    if (
                      selectedItem.entityId &&
                      selectedItem.entityId !== pickedFieldValue &&
                      purifierDeviceChanged(entities, selectedItem.entityId, pickedFieldValue || "") &&
                      ((selectedItem.extraControls || []).length || selectedItem.statusRules)
                    ) {
                      // 与通用设备换绑同款弹窗，但照 0.6.5 换净化器那一支的写法：
                      // aria-label + dialog-heading 里的 h2、正文写在 i3d-add-dialog-body 上
                      // （不是 <p>），确定按钮带 primary。
                      const purifierChangeDialogElement = createElement(
                        "dialog",
                        "settings-dialog i3d-add-dialog"
                      );
                      auxDialogElement = purifierChangeDialogElement;
                      purifierChangeDialogElement.setAttribute("aria-label", "更换净化器设备");
                      const purifierChangeHeadingElement = createElement("div", "dialog-heading");
                      purifierChangeHeadingElement.append(
                        createElement("h2", "", "更换净化器设备")
                      );
                      const purifierChangeActionsElement = createElement("div", "dialog-actions");
                      const confirmPurifierChangeButton = createButton("确定更换", () => {
                        if (
                          isDisposed ||
                          !isAccessAllowed ||
                          auxDialogElement !== purifierChangeDialogElement
                        ) {
                          return;
                        }
                        applyPickedPurifierEntity();
                        closeAuxDialog();
                        refreshEditorPreview();
                        renderPanel();
                      });
                      confirmPurifierChangeButton.className = "primary";
                      purifierChangeActionsElement.append(
                        createButton("取消", closeAuxDialog),
                        confirmPurifierChangeButton
                      );
                      purifierChangeDialogElement.append(
                        purifierChangeHeadingElement,
                        createElement(
                          "div",
                          "i3d-add-dialog-body",
                          "更换设备会清除当前附加功能配置，避免控制旧设备。取消将保留原绑定；外层保存后才正式生效。"
                        ),
                        purifierChangeActionsElement
                      );
                      document.body.append(purifierChangeDialogElement);
                      purifierChangeDialogElement.addEventListener("cancel", cancelEvent => {
                        cancelEvent.preventDefault();
                        closeAuxDialog();
                      });
                      purifierChangeDialogElement.showModal();
                      return;
                    }
                    applyPickedPurifierEntity();
                  } else if (Object.hasOwn(temperatureHumidityPickerKinds, targetField)) {
                    // 允许清空（"不使用实体"回调空串）：清空时删掉字段而不是留一个空串，
                    // 与 bridge 白名单的「显式清空 vs 从未设置」保持同一语义。
                    if (pickedFieldValue) {
                      selectedItem[targetField] = pickedFieldValue;
                    } else {
                      delete selectedItem[targetField];
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
        // 温湿度计：「显示内容（含文字）」一节的完整内容 —— 标题在前、两路实体在后
        // （上游就是这个顺序）。标题写的是 label，后端对它只校验字符串，空串合法，
        // 所以「留空隐藏」能存进草稿；两路实体各有专属字段，不走下面「绑定实体」那条
        // 单实体入口（那条入口只服务通用设备与净化器）。
        if (isTemperatureHumidityMode) {
          const temperatureLabelInputElement = createElement("input");
          temperatureLabelInputElement.value = selectedItem.label ?? "温湿度计";
          temperatureLabelInputElement.maxLength = 120;
          temperatureLabelInputElement.addEventListener("change", () => {
            selectedItem.label = temperatureLabelInputElement.value.trim();
            refreshEditorPreview();
          });
          createSettingRow(currentContainer, "标题（留空隐藏）", temperatureLabelInputElement);
          for (const [meterField, meterLabel] of [
            ["temperatureEntityId", "温度实体"],
            ["humidityEntityId", "湿度实体"]
          ]) {
            const meterEntityButton = createButton(
              "",
              () => void openItemPicker(meterField, meterEntityButton)
            );
            meterEntityButton.className = "i3d-picker-button";
            const boundMeterEntityId = selectedItem[meterField] || "";
            const meterEntityName = entities.find(
              meterMetadataProbe => meterMetadataProbe.entityId === boundMeterEntityId
            )?.name;
            meterEntityButton.title = boundMeterEntityId || "选择" + meterLabel;
            meterEntityButton.append(
              createElement("span", "", meterEntityName || boundMeterEntityId || "选择" + meterLabel)
            );
            createSettingRow(currentContainer, meterLabel, meterEntityButton);
          }
        }
        // 这一条通用实体选择器的「绑定实体」入口不服务下面三类：
        //   · 通用设备的主实体必须由 deviceId 反查，控件自己存 entityId 会被后端直接拒收；
        //   · 温湿度计要两路实体，走上面那两条专属字段；
        //   · 净化器虽是同样的实体选择器按钮（同款 .i3d-picker-button、同标题「绑定实体」），
        //     但换绑时要按 HA 设备清空附加功能 / 状态灯规则，所以它把开选择器交给
        //     targetField="purifier" 那条分支（见 renderAirPurifierBindingSection 与
        //     openItemPicker 的 purifier 分支），不吃这里的通用 else 分支。
        if (!isTemperatureHumidityMode && !isGenericDeviceMode && !isAirPurifierMode) {
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
          if (!isVacuumMode && (!isNasMode || (!selectedItem.statusSource && selectedItem.entityId))) {
            createSettingRow(
              currentContainer,
              isNasMode ? "指示灯状态实体（旧版兼容）" : "绑定实体",
              boundEntityButton
            );
          }
        }
        if (isCoverMode) {
          currentContainer = createConfigSection("帘布外观");
          const curtainAppearanceRowElement = createConfigRow(currentContainer);
          const curtainMemberGroup = findCurtainGroupOf(selectedItem.id);
          const floorCurtainModel = sceneMetadata.floors
            .find(curtainFloorProbe => curtainFloorProbe.id === selectedItem.floorId)
            ?.curtains?.find(curtainModelProbe => curtainModelProbe.id === selectedItem.modelId);
          // 展示「当前生效」的帘型：被覆写过就是配置值，否则户型模型是卷帘就显示卷帘；
          // 与帘布类型完全同一套口径，也与 0.6.5 的 coverKindOverride / curtainForm 派生一致。
          // 模型侧字段名照搬上游（curtainForm），历史草稿里的 curtainStyle 仍读得出来。
          const rollerCurtainModel =
            (floorCurtainModel?.curtainForm ?? floorCurtainModel?.curtainStyle) === "roller";
          const effectiveCoverKind =
            selectedItem.coverKindOverride === true
              ? selectedItem.coverKind
              : rollerCurtainModel
                ? "roller"
                : selectedItem.coverKind;
          // 卷帘没有轨道形态也没有开合方向，下面的说明与「开合方向」都要按生效帘型分支。
          const effectiveIsRollerCurtain = effectiveCoverKind === "roller";
          const curtainKindSelect = createSelectRow(
            curtainAppearanceRowElement,
            "窗帘类型",
            [
              ["standard", "普通窗帘"],
              ["roller", "卷帘"],
              ["dream", "梦幻帘"]
            ],
            effectiveCoverKind,
            pickedCurtainKind => {
              selectedItem.coverKind = ["dream", "roller"].includes(pickedCurtainKind)
                ? pickedCurtainKind
                : "standard";
              // 显式改过就钉住：不再被户型模型自带的帘型覆盖（见 geometry.js 的覆写分支）。
              selectedItem.coverKindOverride = true;
              refreshEditorPreview();
            }
          );
          // 组合成员只能是普通窗帘或卷帘（后端校验同样拒绝 dream 成员），所以组合存续期间
          // 整条窗帘类型都锁住；想改先解除组合。文案与 0.6.5 dist 逐字一致。
          curtainKindSelect.disabled = !!curtainMemberGroup;
          if (curtainMemberGroup) {
            curtainKindSelect.title = "请先解除组合，再切换为梦幻帘";
          }
          const curtainFabricRowElement = createConfigRow(currentContainer);
          const curtainFabricSelect = createSelectRow(
            curtainFabricRowElement,
            "帘布类型",
            [
              ["cloth", "布帘"],
              ["sheer", "纱帘"]
            ],
            // 展示「当前生效」的帘布：被覆写过就是配置值，否则跟随户型模型。
            floorCurtainModel?.curtainFabric && selectedItem.curtainFabricOverride !== true
              ? floorCurtainModel.curtainFabric
              : selectedItem.curtainFabric,
            pickedCurtainFabric => {
              selectedItem.curtainFabric = pickedCurtainFabric === "sheer" ? "sheer" : "cloth";
              // 显式改过就钉住：不再被户型模型自带的帘布覆盖（见 geometry.js 的覆写分支）。
              selectedItem.curtainFabricOverride = true;
              refreshEditorPreview();
            }
          );
          // 模型自带帘布时默认以模型为准，但仍允许在这里覆写 —— 与 0.6.5 的
          // curtainFabricOverride 语义一致：只改 3D 交互里的帘布，不动户型模型与 2D 导图。
          // 文案与 0.6.5 dist 逐字一致（上游挂在下拉框的 title 上）。
          curtainFabricSelect.title = "仅修改当前3D交互的帘布，不改变户型模型或2D导图";
          if (floorCurtainModel?.curtainFabric) {
            currentContainer.append(
              createElement(
                "p",
                "i3d-note",
                "仅修改当前3D交互的帘布，不改变户型模型或2D导图"
              )
            );
          }
          if (
            !effectiveIsRollerCurtain &&
            floorCurtainModel?.curtainTrack &&
            floorCurtainModel.curtainTrack !== "straight"
          ) {
            currentContainer.append(
              createElement(
                "p",
                "i3d-note",
                (floorCurtainModel.curtainTrack === "u" ? "U" : "L") +
                  " 型轨道，尺寸和合拢位置继承户型模型。"
              )
            );
          }
          // 卷帘没有轨道形态，说明换成卷收语义；「开合方向」整条不渲染。
          if (effectiveIsRollerCurtain) {
            currentContainer.append(
              createElement(
                "p",
                "i3d-note",
                "卷帘垂直升降，0% 完全放下、100% 完全卷起；控制沿用普通窗帘。"
              )
            );
          } else {
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
          }
          if (selectedItem.entityId) {
            currentContainer.append(
              createElement("p", "i3d-note", "开合状态跟随绑定实体；解除绑定后恢复预设的展示状态。")
            );
          } else {
            // 上游 0.6.5 的口径：基准只有「关闭 / 半开 / 全开」三档，**当前值不在这三档里**时
            // 才把它作为一项补进列表（前端只认这三档；换成别的档位后原值仍要能显示出来）。
            // 不能把默认值（COVER_DEFAULT_PREVIEW_POSITION）常驻在列表里：那样一旦改成 20%，
            // 下拉框会同时留着「打开 75%」和「打开 20%」两项，75 那一项已无任何意义。
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
          // ---- 窗帘组合（一拖多） ----
          // 组合本身（名称 / 成员 / 位置 / 隐藏 / 聚焦）在「组合入口」面板里统一管理：
          // 舞台上点组合标记，或在「当前按钮」里选「XX（组合）」即可进入。这里只处理两件事：
          // 已组合的成员给出「返回组合入口设置」；未组合的列出配对候选。
          const selectedCurtainGroup = findCurtainGroupOf(selectedItem.id);
          if (selectedCurtainGroup) {
            const groupMemberSectionElement = createConfigSection("组合成员");
            // 上游 0.6.5 把「组合成员」排在「基础绑定」**之前**（成员说明 + 返回入口按钮先出，
            // 再去配成员自己的模型/实体）。createConfigSection 一律追加到面板末尾，所以这里
            // 把它挪到「基础绑定」前面，而不是靠调整代码顺序去迁就（那段代码还兼着别的分支）。
            bindingContainer.before(groupMemberSectionElement);
            groupMemberSectionElement.append(
              createElement(
                "p",
                "i3d-note",
                "这里只调整成员模型、实体、图标和帘布；入口位置、大小、隐藏方式和聚焦视角由组合统一管理。"
              ),
              createButton("返回组合入口设置", () => {
                selectedCurtainGroupId = selectedCurtainGroup.id;
                selectedItemId = selectedCurtainGroup.memberIds[0];
                refreshEditorPreview({
                  markDirty: false
                });
                renderPanel();
              })
            );
          } else {
            // 未组合：与 0.6.5 一致，只留一个「组合另一扇窗帘」入口 + 一句说明，配对候选挪进
            // 弹窗里选。这一按钮同属上游的「基础绑定」分区（不另起分区），所以直接追加到
            // bindingContainer 末尾 —— 分区顺序不变，它自然落在「基础绑定」的最后一行。
            // 这里仍然算一次候选，只为决定按钮是否可点（梦幻帘 / 已被别的组合占用 /
            // 同楼层只剩它自己都会是空候选），与弹窗里的判空口径同源。
            const partnerCandidates = curtainGroupCandidates(
              draftProperties.environment,
              selectedItem.id
            );
            const openGroupDialogButton = createButton("组合另一扇窗帘", () =>
              openCurtainGroupDialog(selectedItem)
            );
            openGroupDialogButton.disabled = !partnerCandidates.length;
            bindingContainer.append(
              openGroupDialogButton,
              createElement(
                "p",
                "i3d-note",
                "选择同楼层另一扇普通窗帘；仅组合入口与弹窗，保留两层模型和设备绑定。"
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
        // 通用设备 / 净化器的绑定行与弹窗内容。与 0.6.5 同序：绑定行落在「基础绑定」里，
        // 状态灯 / 附加功能紧跟其后，整组都排在「交互行为」「按钮外观」之前
        // （上游这三节在渲染函数里就是紧挨 基础绑定 之后创建的）。
        if (isGenericDeviceMode) {
          // 同净化器：选择器只能在本层打开（openItemPicker 是本函数的局部函数），
          // 控件本身在 renderGenericDeviceBindingSection 里画。
          renderGenericDeviceBindingSection(
            selectedItem,
            bindingContainer,
            devicePickerTrigger => void openItemPicker("device", devicePickerTrigger)
          );
        }
        if (isAirPurifierMode) {
          // 控件是统一的实体选择器按钮，所以把「开选择器」这件事交回本层（openItemPicker
          // 只在这里可见），选择器里的 fan.* 白名单与换绑清空逻辑也都在这一层。
          renderAirPurifierBindingSection(
            selectedItem,
            bindingContainer,
            purifierPickerTrigger => void openItemPicker("purifier", purifierPickerTrigger)
          );
        }
        // 状态灯（可选）只属于通用设备：0.6.5 里「绑定设备 + 状态灯」整块以「设备驱动」为
        // 条件（_0x23272f 那段），净化器走实体绑定，不出这一节。品类自己可以声明不该有
        // 指示灯（绿植 statusIndicator === false），那时连草稿里残留的规则也一并删掉。
        if (isGenericDeviceMode) {
          if (genericDeviceProfile(deviceKind)?.statusIndicator === false) {
            delete selectedItem.statusRules;
          } else {
            renderStatusRuleSection(selectedItem);
          }
        }
        if (isGenericDeviceMode || isAirPurifierMode) {
          renderExtraControlsSection(selectedItem);
        }
        // 有两类对象没有「点击行为」这一节：
        //   · 温湿度计：卡片不聚焦、不弹窗、也不发控制指令，clickAction 与两种隐藏方式都不在它的
        //     bridge 白名单里（存下去也会被后端剔掉），摆出来只会让人以为改了有用；
        //   · 窗帘组合成员：上游 0.6.5 这一节以 !value307 为守卫（value307 就是「该帘属于某个
        //     组合」），成员的交互由组合入口统一管理。
        // 下面几行与其它品类共用同一套控件接线，为了不让它们分叉，这里把容器换成游离节点：
        // 控件照常构建，但整节不进入文档。
        const selectedCoverMemberGroup = isCoverMode
          ? findCurtainGroupOf(selectedItem.id)
          : null;
        currentContainer =
          isTemperatureHumidityMode || selectedCoverMemberGroup
            ? createElement("div")
            : createConfigSection("交互行为");
        createSelectRow(
          currentContainer,
          "点击" + kindLabel,
          usesStatusPanel
            ? isGenericDeviceMode
              ? [
                  // 通用设备（冰箱 / 冰柜 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）在上游走的是 value5 且 value7
                  // 的那一支：取值与其余设备同为 focus-panel / panel / focus，但文案说的是「弹窗」
                  // ——它们点开的是设备控制弹窗，不是状态面板。
                  ["focus-panel", "聚焦并显示弹窗"],
                  ["panel", "仅显示弹窗"],
                  ["focus", "仅聚焦"]
                ]
              : [
                  ["focus-panel", "聚焦并显示状态"],
                  ["panel", "仅显示状态"],
                  ["focus", "仅聚焦"]
                ]
            : isCoverMode
              ? [
                  ["focus", "聚焦并显示控制"],
                  ["panel", "仅显示控制"]
                ]
              : isAirPurifierMode
                ? [
                    // 净化器的点击行为白名单与空调同形（config.py 的 airPurifiers 校验：
                    // focus / turn-on-focus / turn-on / turn-on-panel），只是文案换成开净化器。
                    ["focus", "聚焦并显示控制"],
                    ["turn-on-focus", "聚焦并开启"],
                    ["turn-on", "仅开关净化器"],
                    ["turn-on-panel", "开启并显示控制"]
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
        // 温湿度计不上屏这一节：它的卡片没有可挑的图标、也没有圆形按钮那圈外框，
        // 「位置与大小」整体由下面的坐标段接管（与上游 0.6.5 的温湿度计分支同构）。
        if (!isTemperatureHumidityMode) {
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
            applyMdiMask(itemIconPreviewElement, selectedItem.icon);
            itemIconPickerButton.append(
              itemIconPreviewElement,
              createElement("span", "", selectedItem.icon)
            );
            createSettingRow(itemAppearanceRowElement, "图标", itemIconPickerButton);
          }
          // 组合成员到此为止：上游 0.6.5 在这里 `return`（渲染函数内），后面那一段全部不再出，
          // 成员的入口位置 / 大小 / 隐藏方式与聚焦视角由组合入口统一管理（本面板的「组合成员」
          // 说明也是这个口径）。所以成员只保留「图标状态反向 + 图标」，不出现「更多尺寸设置」
          // （按钮大小 / 图标大小 / 触控范围）、也不出「按钮位置」与「聚焦视角」。
          // return 前要补上渲染函数尾部那两句（状态提示与保存按钮可用性），否则面板会缺一块。
          if (isCoverMode && findCurtainGroupOf(selectedItem.id)) {
            const memberBindingManageSectionElement = createConfigSection("绑定管理");
            memberBindingManageSectionElement.append(
              createElement("p", "i3d-note", "删除此成员会自动解除组合，另一成员恢复原入口。"),
              removeItemButton
            );
            panelElement.append(errorMessageElement);
            syncSaveButtonState();
            return;
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
        }
        if (usesModelBinding) {
          currentContainer = createConfigSection(
            isVacuumMode
              ? "标签位置"
              : isTemperatureHumidityMode
                ? // 温湿度计把「摆在哪」和「多大」合成一节（上游同构）。它的卡片不跟随场景
                  // 模型，所以这一节只配锚点与尺寸，没有「跟随模型」这一说。
                  "位置与大小"
                : // 上游 0.6.5 的模型绑定分支只有卷帘机改叫「标签位置」，其余（含通用设备与
                  // 空气净化器）一律「按钮位置」——位置段配的就是这个点击按钮的锚点，
                  // 不另起「弹窗锚点位置」这个名字。
                  "按钮位置"
          );
          const modelBindingFloor = sceneMetadata.floors.find(
            modelBindingFloorProbe => modelBindingFloorProbe.id === selectedItem.floorId
          );
          const modelBindingEntry = isTemperatureHumidityMode
            ? null
            : floorSceneModels(modelBindingFloor).find(
                modelBindingModelProbe => modelBindingModelProbe.id === selectedItem.modelId
              );
          // 温湿度计没有场景模型可跟随：缺省落点取楼层几何中心（与运行侧 binding 同一份
          // bridge 实现），高度缺省 1.8 米，别显示成 0 —— 那会让用户以为卡片贴在地上。
          const meterDefaultPosition = isTemperatureHumidityMode
            ? temperatureHumidityFloorCenter(modelBindingFloor)
            : null;
          const positionGridElement = createElement("div", "i3d-coordinate-grid");
          currentContainer.append(positionGridElement);
          // 重置按钮只服务「跟随场景模型」那几类：它们的位置是从模型推出来的，需要一个脱钩的
          // 出口。温湿度计的坐标就是普通字段（参考实现里也是），没有这一颗。
          const resetPositionButton = isTemperatureHumidityMode
            ? null
            : createButton("恢复跟随模型", () => {
                delete selectedItem.x;
                delete selectedItem.y;
                delete selectedItem.height;
                refreshEditorPreview();
                renderPanel();
              });
          if (resetPositionButton) {
            resetPositionButton.disabled = !["x", "y", "height"].some(positionKeyProbe =>
              Number.isFinite(selectedItem[positionKeyProbe])
            );
          }
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
              : isTemperatureHumidityMode
                ? coordinateKey === "height"
                  ? 1.8
                  : meterDefaultPosition[coordinateKey]
                : isVacuumMode && coordinateKey === "height"
                  ? (Number(modelBindingEntry?.elevation) || 0) +
                    (Number(modelBindingEntry?.height) || 0.85) +
                    0.25
                  : Number.isFinite(modelBindingEntry?.[coordinateKey])
                    ? modelBindingEntry[coordinateKey]
                    : 0;
            createNumberRow(
              positionGridElement,
              // 「离地高度」是扫地机/标签那一套的说法（模型自带 elevation）；温湿度计与上游
              // 一致就叫「高度（米）」，坐标标签本身已经写好了，不再改写。
              isVacuumMode && coordinateKey === "height" ? "离地高度（米）" : coordinateLabel,
              coordinateValue,
              coordinateMin,
              coordinateMax,
              coordinateStep,
              pickedCoordinateValue => {
                selectedItem[coordinateKey] = pickedCoordinateValue;
                if (resetPositionButton) {
                  resetPositionButton.disabled = false;
                }
                refreshEditorPreview();
              }
            );
          }
          // 温湿度计的「大小」两项并进本节（上游同构）：坐标栅格之后紧跟一行两列。
          // 信息框宽度 100~600、文字大小 9~24 —— 与运行侧 bridge 的缺省与夹取同一口径。
          if (isTemperatureHumidityMode) {
            const temperatureSizeRowElement = createConfigRow(currentContainer);
            createSizeRow(
              temperatureSizeRowElement,
              "信息框宽度（px）",
              () => selectedItem.size,
              pickedMeterSizeValue => {
                selectedItem.size = pickedMeterSizeValue;
                refreshEditorPreview();
              },
              100,
              600
            );
            createSizeRow(
              temperatureSizeRowElement,
              "文字大小（px）",
              () => selectedItem.iconSize,
              pickedMeterIconSizeValue => {
                selectedItem.iconSize = pickedMeterIconSizeValue;
                refreshEditorPreview();
              },
              9,
              24
            );
          }
          if (resetPositionButton) {
            currentContainer.append(resetPositionButton);
          }
          const lightBatchSectionElement = createElement(
            "section",
            "navigation-batch-section i3d-light-batch"
          );
          const batchTitleElement = createElement("h4");
          const batchCountElement = createElement("span");
          batchTitleElement.append(
            createElement("span", "", isTemperatureHumidityMode ? "温湿度计设置一键应用" : "图标设置一键应用"),
            batchCountElement
          );
          const lightBatchApplyButton = createButton(
            // 温湿度计与 0.6.5 dist 的字面量逐字一致（其余类型仍按当前类型名拼）。
            isTemperatureHumidityMode ? "一键应用到其他温湿度计" : "一键应用到其他" + kindLabel,
            () => openBatchApplyDialog(selectedItem)
          );
          refreshBatchButtons = () => {
            const lightChangeCount = listChangedFields(selectedItem).length;
            // 温湿度计显示「N 个同层目标」（上游口径：同楼层其它温湿度计的台数），
            // 其余类型显示改了几项字段。
            batchCountElement.textContent = isTemperatureHumidityMode
              ? getItemList().filter(
                  temperatureSiblingProbe =>
                    temperatureSiblingProbe.id !== selectedItem.id &&
                    temperatureSiblingProbe.floorId === selectedItem.floorId
                ).length + " 个同层目标"
              : lightChangeCount + " 项修改";
            // 与 0.6.5 的 fn44 同口径：这颗按钮只受权限与相机忙两道闸约束，
            // **不看**本控件改了几项（哪怕显示「0 项修改」也可点 —— 它本来就是
            // 「把当前这台设置套给同类」的入口，不要求先改过）。上游两处分支
            // （设备 / 灯光）都是 `!value32 || value36 || value37`，没有改动数那一道。
            lightBatchApplyButton.disabled =
              !isAccessAllowed || isCameraEditing || isCameraCommandPending;
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
          // 效果区间已固定、不随实体能力变化，故没有需要跟随状态重绘的控件：
          // 一次性把策略落到草稿项上即可（「正在识别灯具能力」那类提示也不再需要）。
          applyFixedLightEffects(selectedItem);
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
            // 同设备分支：只看权限 / 相机忙 / 范围编辑器占用，不看改动数（0.6.5 的
            // `!value32 || value36 || value37 || value34`）。
            effectBatchApplyButton.disabled =
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
        // 温湿度计不出这一节：上面「温湿度计列表」的说明写的就是「不聚焦」，参考实现的温湿度计
        // 分支到「绑定管理」为止。控件仍照常构建（省得把下面上百行接线整块缩进），只是不进入
        // 文档；这一节本就不属于它，留着只会让人以为卡片能配聚焦视角。
        if (!isTemperatureHumidityMode) {
          panelElement.append(focusSectionElement);
        }
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
        const bindingManageSectionElement = createConfigSection("绑定管理");
        // 这里只剩「删除此<控件>」这一颗按钮（上游 0.6.5 的收尾「绑定管理」同样只有它）。
        // 窗帘组合成员那条「删除此成员会自动解除组合」的说明不在这里：成员在「按钮外观」
        // 之后就已经收尾返回（见上文 group-member 的 return），走不到这一段。
        bindingManageSectionElement.append(removeItemButton);
      } else {
        currentContainer.append(
          createElement(
            "p",
            "i3d-note",
            isTemperatureHumidityMode
              ? // 温湿度计的可添加项永远只有一个「当前楼层」，所以空态只可能是「这一层还没加过」。
                "当前楼层还没有温湿度计，请点击“添加温湿度计”。"
              : isVacuumMode
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
                  : isGenericDeviceMode
                    ? floorModels.length
                      ? "点击“添加" + kindLabel + "”，选择模型并绑定 HA 设备。"
                      : "当前楼层暂无" +
                        kindLabel +
                        "模型，请先在 3D 户型图绘制中添加" +
                        kindLabel +
                        "后更新户型。"
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
      // 净化器在舞台上与空调同属 climate 模块（见 README「运行时净化器与空调同属 climate 模块」，
      // 绑定由 collectClimateBindings 一起收集）。这里必须显式送 "climate"：落到兜底的 "light"
      // 会让舞台切到灯光模块 —— 净化器的标记根本不渲染，选中 / 拖拽 / 「实时预览弹窗」全部落空，
      // 而浏览器零报错。
      editingModule: usesStatusPanel
        ? deviceKind
        : isCoverMode
          ? "cover"
          : isClimateMode || isAirPurifierMode
            ? "climate"
            : isTemperatureHumidityMode
              ? "temperature-humidity"
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
          // 舞台上点选 / 拖动的是组合条目（id 带 "curtain-group:" 前缀）时，落到组合配置上：
          // selectedItemId 指到第一名成员（用于成员归属推导与顶栏标题），主面板则整块切到
          // 「组合入口」（名称 / 成员 / 位置 / 隐藏 / 聚焦），与单副帘的面板互斥。
          if (isCoverMode && editEvent.id?.startsWith("curtain-group:")) {
            const matchedCurtainGroup = getCurtainGroupList().find(
              curtainGroupEntry => curtainGroupEntryId(curtainGroupEntry) === editEvent.id
            );
            if (matchedCurtainGroup) {
              selectedCurtainGroupId = matchedCurtainGroup.id;
              selectedItemId = matchedCurtainGroup.memberIds[0];
              if (editEvent.action === "position") {
                matchedCurtainGroup.x = editEvent.x;
                matchedCurtainGroup.y = editEvent.y;
                refreshEditorPreview();
              }
              if (editEvent.action === "select") {
                renderPanel();
                refreshEditorPreview({
                  markDirty: false
                });
              }
            }
            return;
          }
          if (editEvent.action === "select") {
            selectedItemId = editEvent.id;
            // 直接点选某副帘（非组合）时清掉组合选中，舞台高亮才会跟着切换。
            selectedCurtainGroupId = "";
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
            syncDraftDirtyState();
            errorMessageElement.textContent = isDirty
              ? "默认视角已记录，保存配置后生效。"
              : "";
          }
          // 在「实时预览弹窗」里拖动排序 / 拉伸尺寸后的卡片布局：净化器（purifier-layout）
          // 与通用设备（device-layout）共用同一套卡片网格，只是 action 不同。整份布局直接
          // 覆盖草稿的 extraControls（顺序 + columns / rows），与勾选附加功能写的是同一个
          // 字段，所以外层「保存配置」会一并落盘，不需要另设保存入口。
          if (editEvent.action === "purifier-layout" || editEvent.action === "device-layout") {
            const layoutTargetItem = getItemList().find(
              layoutCandidateProbe => layoutCandidateProbe.id === editEvent.id
            );
            if (layoutTargetItem && Array.isArray(editEvent.extraControls)) {
              layoutTargetItem.extraControls = editEvent.extraControls;
              // 默认 markDirty：这次改动确实要保存，脏标记与「保存配置」按钮同步亮起。
              refreshEditorPreview();
            }
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
 * 与配置编辑器的区别：它改的是整份户型文档层面的光照，保存回调收到的也是
 * baseLighting 草稿；复用同一套授权门禁与脏标记口径。
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
    "/api/v1/modules/interaction3d/core/runtime.css?v=2609262312";
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
    capturePointer(appearanceHeaderElement, pointerDownEvent.pointerId);
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
