import { purifierState as purifierState2 } from "../purifier/purifier-state";
import { bathEffectEditor as bathEffectEditor2 } from "../bath-heater/bath-heater-editor";
import { appendBackgroundOpacityControl as appendBackgroundOpacityControl2 } from "../core/label-appearance";
import {
  openBatchApply as openBatchApply2,
  copyBatchFields as copyBatchFields2,
} from "./batch-apply";
import { withFixedLightEffects as withFixedLightEffects2 } from "@app/bridge/light-effect-policy";
import {
  DEFAULT_BUTTON_SIZE,
  buttonIconSize,
} from "@app/bridge/button-icon-size";
import { CARD_TEXT_SIZE_PX } from "@app/bridge/card-text-size";
import { vacuumMapIdentity as vacuumMapIdentity2 } from "../vacuum/vacuum-map";
import { openInteraction3dRangeEditor as openInteraction3dRangeEditor2 } from "./range-dialog";
import { mountInteraction3d as mountInteraction3d2 } from "../core/runtime";
import { openVacuumMapEditor as openVacuumMapEditor2 } from "../vacuum/vacuum-map-editor";
import { nasGroups as nasGroups2 } from "../nas/nas-panel";
import {
  extraTypes as extraTypes2,
  extraLabels as extraLabels2,
  purifierRelatedEntities as purifierRelatedEntities2,
  purifierDeviceChanged as purifierDeviceChanged2,
} from "../climate/purifier-extras";
import {
  validCurtainGroups as validCurtainGroups2,
  curtainGroupEntryId as curtainGroupEntryId2,
  curtainGroupCandidates as curtainGroupCandidates2,
  createCurtainGroup as createCurtainGroup2,
} from "../cover/cover-groups";
import { randomUuid as randomUuid2 } from "@app/utils/random-id";
import { interaction3dPreviewSize as interaction3dPreviewSize2 } from "@app/bridge/preview-layout";
import {
  requestInteraction3dAccess as requestInteraction3dAccess2,
  getInteraction3dEditorView as getInteraction3dEditorView2,
  subscribeInteraction3dAccess as subscribeInteraction3dAccess2,
} from "@app/bridge/bridge";
import { normalizeInteraction3dLightingMode as normalizeInteraction3dLightingMode2 } from "@app/bridge/definition";
import {
  normalizeTemperatureHumidity as normalizeTemperatureHumidity2,
  temperatureHumidityFloorCenter as temperatureHumidityFloorCenter2,
  ENVIRONMENT_METRICS as ENVIRONMENT_METRICS2,
  ENVIRONMENT_BATTERY as ENVIRONMENT_BATTERY2,
  DEFAULT_LABEL_SIZE as DEFAULT_LABEL_SIZE2,
  DEFAULT_LABEL_ICON_SIZE as DEFAULT_LABEL_ICON_SIZE2,
  MIN_LABEL_SIZE as MIN_LABEL_SIZE2,
  MIN_LABEL_ICON_SIZE as MIN_LABEL_ICON_SIZE2,
  MAX_LABEL_SIZE as MAX_LABEL_SIZE2,
  MAX_LABEL_ICON_SIZE as MAX_LABEL_ICON_SIZE2,
} from "@app/bridge/temperature-humidity";
import {
  carState as carState2,
  carChargingMappingError as carChargingMappingError2,
  standardCarBindings as standardCarBindings2,
} from "../vehicle/car-state";
import { deviceEntityCatalog as deviceEntityCatalog2 } from "./device-entity-config";
import {
  deviceStatusChoices as deviceStatusChoices2,
  defaultDeviceStatusRule as defaultDeviceStatusRule2,
} from "../device/device-status";
import {
  GENERIC_DEVICE_KINDS as GENERIC_DEVICE_KINDS2,
  genericDeviceProfile as genericDeviceProfile2,
  isGenericDeviceKind as isGenericDeviceKind2,
} from "../device/device-profiles";
import { domElement } from "@app/utils/dom-factory";
const APPEARANCE_GROUPS: [string, [string, string, number, number, number][]][] = [
  [
    "整体",
    [
      ["曝光", "exposure", 0.5, 2, 0.05],
      ["半球光", "hemisphereIntensity", 0, 3, 0.05],
      ["环境光", "ambientIntensity", 0, 2, 0.05],
    ],
  ],
  [
    "主光与阴影",
    [
      ["强度", "mainIntensity", 0, 5, 0.05],
      ["水平角", "mainAzimuth", -180, 180, 5],
      ["高度角", "mainElevation", 5, 89, 5],
      ["阴影浓度", "mainShadowIntensity", 0, 1, 0.05],
    ],
  ],
  [
    "侧面补光",
    [
      ["强度", "fillIntensity", 0, 3, 0.05],
      ["水平角", "fillAzimuth", -180, 180, 5],
      ["高度角", "fillElevation", 0, 89, 5],
    ],
  ],
  [
    "顶部补光",
    [
      ["强度", "topIntensity", 0, 3, 0.05],
      ["水平角", "topAzimuth", -180, 180, 5],
      ["高度角", "topElevation", 0, 89, 5],
    ],
  ],
];
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
  editingFloorId: editingFloorId = "",
}) {
  (await requestInteraction3dAccess2(),
    pickers?.loadEntities && (entities = await pickers.loadEntities()));
  const includes = [
    "environment",
    "climate",
    "fan",
    "purifier",
    "cover",
    "temperature-humidity",
  ].includes(deviceKind);
  deviceKind === "environment" && (deviceKind = "climate");
  const isDeviceKind =
    deviceKind === "airer" ||
    deviceKind === "water-heater" ||
    deviceKind === "devices" ||
    deviceKind === "nas" ||
    deviceKind === "television" ||
    deviceKind === "speaker" ||
    GENERIC_DEVICE_KINDS2.includes(deviceKind);
  deviceKind === "devices" && (deviceKind = "nas");
  let isVacuumShortcutMode,
    isVacuumMode,
    usesStatusPanel,
    isTelevisionMode,
    isSpeakerMode,
    isGenericDeviceMode,
    isClimateMode,
    isCoverMode,
    isAirerMode,
    isNasMode,
    isTemperatureHumidityMode,
    usesModelBinding,
    kindLabel,
    editorKindTitle,
    collectionKey,
    defaultIcon,
    modelIdKey;
  function applyKindFlags(nextKind) {
    ((deviceKind = nextKind),
      (isVacuumShortcutMode = deviceKind === "vacuum-shortcut"),
      (isVacuumMode = deviceKind === "vacuum"),
      (usesStatusPanel =
        (isDeviceKind && !["water-heater", "airer"].includes(deviceKind)) ||
        isVacuumMode ||
        isVacuumShortcutMode),
      (isTelevisionMode = deviceKind === "television"),
      (isSpeakerMode = deviceKind === "speaker"),
      (isGenericDeviceMode = isGenericDeviceKind2(deviceKind)),
      (isAirerMode = deviceKind === "airer"),
      (isClimateMode = ["climate", "fan", "purifier", "water-heater"].includes(deviceKind)),
      (isCoverMode = deviceKind === "cover"),
      (isNasMode = deviceKind === "nas"),
      (isTemperatureHumidityMode = deviceKind === "temperature-humidity"),
      (usesModelBinding =
        isAirerMode ||
        isClimateMode ||
        isCoverMode ||
        isNasMode ||
        isTelevisionMode ||
        isSpeakerMode ||
        isGenericDeviceMode ||
        isVacuumMode ||
        isVacuumShortcutMode),
      (kindLabel = isAirerMode
        ? "晾衣架"
        : isSpeakerMode
          ? "智能音响"
          : isTemperatureHumidityMode
            ? "环境标签"
            : isVacuumShortcutMode
              ? "快捷指令"
              : isVacuumMode
                ? "扫地机"
                : isGenericDeviceMode
                  ? genericDeviceProfile2(deviceKind).label
                  : isDeviceKind && deviceKind !== "water-heater"
                    ? "设备"
                    : isCoverMode
                      ? "窗帘"
                      : isClimateMode
                        ? deviceKind === "water-heater"
                          ? "热水器"
                          : deviceKind === "fan"
                            ? "电风扇"
                            : deviceKind === "purifier"
                              ? "空气净化器"
                              : "空调/浴霸"
                        : "灯光"),
      (editorKindTitle = includes
        ? "环境"
        : isDeviceKind
          ? "设备"
          : isVacuumShortcutMode
            ? "扫地机"
            : kindLabel),
      (collectionKey = isAirerMode
        ? "airers"
        : isSpeakerMode
          ? "speakers"
          : isGenericDeviceMode
            ? genericDeviceProfile2(deviceKind).collection
            : isTemperatureHumidityMode
              ? "temperatureHumidity"
              : isVacuumMode || isVacuumShortcutMode
                ? "vacuums"
                : isTelevisionMode
                  ? "televisions"
                  : isNasMode
                    ? "nas"
                    : isCoverMode
                      ? "curtains"
                      : deviceKind === "water-heater"
                        ? "waterHeaters"
                        : deviceKind === "fan"
                          ? "fans"
                          : deviceKind === "purifier"
                            ? "airPurifiers"
                            : "airConditioners"),
      (defaultIcon = isAirerMode
        ? "mdi:hanger"
        : isSpeakerMode
          ? "mdi:speaker"
          : isGenericDeviceMode
            ? genericDeviceProfile2(deviceKind).icon
            : isVacuumShortcutMode
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
                        ? deviceKind === "water-heater"
                          ? "mdi:water-boiler"
                          : deviceKind === "fan"
                            ? "mdi:fan"
                            : deviceKind === "purifier"
                              ? "mdi:air-purifier"
                              : "mdi:air-conditioner"
                        : "mdi:lightbulb-outline"),
      (modelIdKey = usesModelBinding ? "modelId" : "groupId"));
  }
  applyKindFlags(deviceKind);
  const describeItem = (describableItem) =>
      describableItem.name || describableItem.label || kindLabel,
    normalizeClickAction = (rawClickAction) =>
      isTelevisionMode
        ? ["focus", "focus-panel", "panel", "turn-on-focus", "turn-on", "turn-on-panel"].includes(
            rawClickAction,
          )
          ? rawClickAction
          : "focus-panel"
        : usesStatusPanel
          ? ["focus", "focus-panel", "panel"].includes(rawClickAction)
            ? rawClickAction
            : "focus-panel"
          : isCoverMode || isAirerMode
            ? ["panel", "turn-on-focus", "turn-on", "turn-on-panel"].includes(rawClickAction)
              ? rawClickAction
              : "focus"
            : ["turn-on-focus", "turn-on", "turn-on-panel"].includes(rawClickAction)
              ? rawClickAction
              : "focus",
    element = document.createElement("link");
  ((element.rel = "stylesheet"),
    (element.href =
      "/api/v1/modules/interaction3d/core/runtime.css"),
    document.head.append(element));
  const createElement = (tagName, className = "", textContent = "") =>
      domElement(document, tagName, className, textContent),
    createButton = (buttonLabel, handleButtonClick) => {
      const buttonElement = createElement("button", "", buttonLabel);
      return (
        (buttonElement.type = "button"),
        buttonElement.addEventListener("click", handleButtonClick),
        buttonElement
      );
    },
    editorDialogElement = createElement("dialog", "i3d-editor");
  (editorDialogElement.setAttribute("aria-label", "3D " + editorKindTitle + "配置"),
    editorDialogElement.setAttribute("data-i3d-preview-scope", ""),
    (editorDialogElement.className += " i3d-unified-settings"));
  const headerElement = createElement("header"),
    bodyElement = createElement("div", "i3d-editor-body"),
    viewElement = createElement("div", "i3d-editor-view"),
    panelElement = createElement("aside"),
    aspectBoxElement = createElement("div", "i3d-editor-aspect"),
    stageHostElement = createElement("div", "i3d-editor-stage"),
    statusElement = createElement("p", "i3d-editor-status");
  (statusElement.setAttribute("role", "status"),
    aspectBoxElement.append(stageHostElement),
    viewElement.append(aspectBoxElement, statusElement));
  const errorMessageElement = createElement("p", "i3d-error");
  errorMessageElement.setAttribute("role", "status");
  let structuredClone2 = structuredClone(component.properties || {}),
    text = "",
    selectedCurtainGroupId = "",
    sceneMetadata = null,
    editorRuntime = null,
    isDisposed = false,
    isAccessAllowed = true,
    floorSelection =
      editingFloorId ||
      (structuredClone2.floorSelection !== "all" ? structuredClone2.floorSelection : "");
  structuredClone2.environment?.temperatureHumidity &&
    (structuredClone2.environment.temperatureHumidity =
      structuredClone2.environment.temperatureHumidity.map(normalizeTemperatureHumidity2));
  let isRangeEditorOpen = false,
    subEditorHandle = null,
    vacuumCameraMode = "focus",
    isCameraEditing = false,
    isCameraCommandPending = false,
    pendingCameraDraft = null,
    num = 0,
    cameraCommandQueue = Promise.resolve(),
    addDialogState = null,
    pickerHandle = null,
    pickerGeneration = 0,
    isSaving = false,
    isDirty = 0,
    latestStates = null,
    refreshEffectSettings = () => {},
    bathEffectEditorHandle = () => {},
    redrawBathEffects = () => {},
    refreshAirflowStatus = () => {},
    renderAirflowSection = () => {};
  const map = new Map(),
    findVacuumModel = () =>
      structuredClone2.devices?.vacuums?.find(
        (vacuumModelProbe) => vacuumModelProbe.id === vacuumId,
      ),
    getItemList = () =>
      isVacuumShortcutMode
        ? findVacuumModel()?.shortcuts || []
        : usesStatusPanel
          ? structuredClone2.devices[collectionKey]
          : usesModelBinding || isTemperatureHumidityMode
            ? structuredClone2.environment[collectionKey]
            : structuredClone2.lights,
    setItemList = (nextItemList) => {
      isVacuumShortcutMode
        ? findVacuumModel() && (findVacuumModel().shortcuts = nextItemList)
        : usesStatusPanel
          ? (structuredClone2.devices[collectionKey] = nextItemList)
          : usesModelBinding || isTemperatureHumidityMode
            ? (structuredClone2.environment[collectionKey] = nextItemList)
            : (structuredClone2.lights = nextItemList);
    },
    getCurtainGroupList = () => structuredClone2.environment?.curtainGroups || [],
    findCurtainGroupOf = (curtainId) =>
      getCurtainGroupList().find((curtainGroupEntry) =>
        curtainGroupEntry.memberIds.includes(curtainId),
      ),
    describeGroupFieldValue = () => {
      const selectedCurtainGroup =
        selectedCurtainGroupId && findCurtainGroupOf(selectedCurtainGroupId);
      return selectedCurtainGroup
        ? curtainGroupEntryId2(selectedCurtainGroup)
        : ((selectedCurtainGroupId = ""),
          isCoverMode && findCurtainGroupOf(text)
            ? curtainGroupEntryId2(findCurtainGroupOf(text))
            : text);
    };
  function buildCurtainGroupOptions() {
    structuredClone2.environment?.curtainGroups &&
      (structuredClone2.environment.curtainGroups = validCurtainGroups2(
        structuredClone2.environment,
      ));
  }
  function ensureItemCollections() {
    if (
      (usesStatusPanel &&
        (structuredClone2.devices = {
          ...structuredClone2.devices,
          [collectionKey]: structuredClone2.devices?.[collectionKey] || [],
        }),
      isTemperatureHumidityMode)
    ) {
      structuredClone2.environment = {
        ...structuredClone2.environment,
        temperatureHumidity: (structuredClone2.environment?.temperatureHumidity || []).map(
          normalizeTemperatureHumidity2,
        ),
      };
      return;
    }
    if (
      (usesModelBinding &&
        !usesStatusPanel &&
        (structuredClone2.environment = {
          ...structuredClone2.environment,
          dimStrength: Number.isFinite(structuredClone2.environment?.dimStrength)
            ? Math.max(0, Math.min(100, structuredClone2.environment.dimStrength))
            : 70,
          [collectionKey]: structuredClone2.environment?.[collectionKey] || [],
          ...(isCoverMode
            ? {
                curtainGroups: (structuredClone2.environment?.curtainGroups || []).map(
                  (curtainGroupItem) => ({
                    ...curtainGroupItem,
                    // 组合的两个成员图标同样按固定比例跟随组合按钮大小。
                    iconSize: buttonIconSize(curtainGroupItem.size),
                  }),
                ),
              }
            : {}),
        }),
      isVacuumShortcutMode)
    ) {
      for (const vacuumModelItem of structuredClone2.devices.vacuums)
        vacuumModelItem.shortcuts = (vacuumModelItem.shortcuts || []).map((vacuumShortcutItem) =>
          vacuumShortcutItem.visible === false
            ? {
                ...vacuumShortcutItem,
                visible: true,
                buttonHidden: true,
                hiddenClickable: false,
              }
            : vacuumShortcutItem,
        );
    }
    ((vacuumId ||= structuredClone2.devices?.vacuums?.[0]?.id || ""),
      isVacuumMode && (text = vacuumId),
      setItemList(
        (getItemList() || [])
          .filter(
            (visibleItemProbe) =>
              isVacuumShortcutMode || isCoverMode || visibleItemProbe.visible !== false,
          )
          .map((normalizedItem) => {
            const size =
              Number.isFinite(normalizedItem.size) && normalizedItem.size > 0
                ? normalizedItem.size
                : DEFAULT_BUTTON_SIZE;
            return {
              ...(usesModelBinding || isTemperatureHumidityMode
                ? normalizedItem
                : withFixedLightEffects2(normalizedItem)),
              size: size,
              visible:
                isVacuumShortcutMode || isCoverMode ? normalizedItem.visible !== false : true,
              icon: normalizedItem.icon || defaultIcon,
              ...(usesModelBinding || isTemperatureHumidityMode
                ? {}
                : {
                    fadeDuration: normalizedItem.fadeDuration ?? 0.3,
                  }),
              ...(isCoverMode
                ? {
                    coverKind: ["standard", "dream", "roller"].includes(normalizedItem.coverKind)
                      ? normalizedItem.coverKind
                      : "standard",
                    coverDirection: ["left", "right", "split"].includes(
                      normalizedItem.coverDirection,
                    )
                      ? normalizedItem.coverDirection
                      : "auto",
                    curtainFabric: normalizedItem.curtainFabric === "sheer" ? "sheer" : "cloth",
                    unboundPosition: Number.isFinite(normalizedItem.unboundPosition)
                      ? Math.max(0, Math.min(100, normalizedItem.unboundPosition))
                      : 0,
                  }
                : {}),
              ...(isVacuumShortcutMode
                ? {}
                : {
                    clickAction: normalizeClickAction(normalizedItem.clickAction),
                  }),
              // 普通按钮的图标按固定比例跟随按钮（@app/bridge/button-icon-size，与
              // stage.ts resolveMarkerIconSize 同口径），旧的按 size-18 写死的值不再沿用；
              // 扫地机把 iconSize 当字号，保持原值。
              iconSize: isVacuumMode
                ? Number.isFinite(normalizedItem.iconSize) && normalizedItem.iconSize > 0
                  ? normalizedItem.iconSize
                  : buttonIconSize(size)
                : buttonIconSize(size),
            };
          }),
      ));
  }
  ensureItemCollections();
  for (const normalizedBatchItem of [
    ...(structuredClone2.environment?.airConditioners || []),
    ...(structuredClone2.environment?.airers || []),
    ...(structuredClone2.environment?.fans || []),
    ...(structuredClone2.environment?.airPurifiers || []),
    ...(structuredClone2.environment?.waterHeaters || []),
  ])
    normalizedBatchItem.extraControls = (normalizedBatchItem.extraControls || []).map(
      ({ label: batchControlLabel, ...batchControlRest }) => ({
        ...batchControlRest,
        type: extraTypes2(batchControlRest.entityId)[0],
      }),
    );
  const buildEditableFieldList = () =>
    deviceKind === "smallcar"
      ? [
          ["cardWidth", "信息框宽度", "px"],
          ["cardFontSize", "文字大小", "px"],
          ["cardOpacity", "背景不透明度", "%"],
          ["buttonVisibility", "卡片显示", ""],
        ]
      : usesModelBinding
        ? [
            ...(isVacuumMode ? [] : [["icon", "图标", ""]]),
            ["size", isVacuumMode ? "状态框缩放" : "按钮大小", isVacuumMode ? "%" : "px"],
            // 图标始终铺满按钮，只有扫地机把 iconSize 当字号用，才需要单独暴露。
            ...(isVacuumMode ? [["iconSize", "文字大小", "px"]] : []),
            ["hitSize", "点击范围", "px"],
            ["buttonVisibility", "按钮显示", ""],
            ...(isVacuumMode ? [["backgroundOpacity", "背景不透明度", "%"]] : []),
            ...(isVacuumShortcutMode
              ? [
                  ["fontSize", "文字大小", "px"],
                  ["iconHidden", "隐藏图标", ""],
                  ["labelHidden", "隐藏名称", ""],
                ]
              : []),
          ]
        : [
            ["size", "按钮大小", "px"],
            ["hitSize", "点击范围", "px"],
            ["fadeDuration", "缓开缓灭", "秒"],
          ];
  let fieldDefs = buildEditableFieldList(),
    baselineItemsById = new Map(
      getItemList().map((baselinedItem) => [baselinedItem.id, structuredClone(baselinedItem)]),
    );
  const kindSessionsByKind = new Map();
  let auxDialogElement = null,
    refreshBatchButtons = () => {};
  function buildItemPayload(item) {
    return deviceKind === "smallcar"
      ? {
          cardWidth: item.cardWidth ?? 180,
          cardFontSize: item.cardFontSize ?? CARD_TEXT_SIZE_PX,
          cardOpacity: item.cardOpacity ?? 1,
          buttonVisibility: item.buttonHidden
            ? "隐藏（不可点击）"
            : item.hiddenClickable
              ? "隐藏（可点击）"
              : "显示",
        }
      : usesModelBinding
        ? {
            icon: item.icon || defaultIcon,
            size: item.size ?? DEFAULT_BUTTON_SIZE,
            iconSize: item.iconSize ?? buttonIconSize(item.size ?? DEFAULT_BUTTON_SIZE),
            hitSize: item.hitSize ?? Math.max(DEFAULT_BUTTON_SIZE, item.size ?? DEFAULT_BUTTON_SIZE),
            ...(isVacuumMode
              ? {
                  backgroundOpacity: item.backgroundOpacity ?? 1,
                }
              : {}),
            ...(isVacuumShortcutMode
              ? {
                  fontSize: item.fontSize ?? CARD_TEXT_SIZE_PX,
                  iconHidden: item.iconHidden === true,
                  labelHidden: item.labelHidden === true,
                }
              : {}),
            buttonVisibility:
              item.buttonHidden === true
                ? "隐藏（不可点击）"
                : item.hiddenClickable === true
                  ? "隐藏（可点击）"
                  : "显示",
          }
        : {
            size: item.size ?? DEFAULT_BUTTON_SIZE,
            iconSize: item.iconSize ?? buttonIconSize(item.size ?? DEFAULT_BUTTON_SIZE),
            hitSize: item.hitSize ?? Math.max(DEFAULT_BUTTON_SIZE, item.size ?? DEFAULT_BUTTON_SIZE),
            fadeDuration: item.fadeDuration ?? 0.3,
          };
  }
  const readNestedPath = (targetObject, dottedPath) =>
    dottedPath
      .split(".")
      .reduce((pathAccumulator, pathSegment) => pathAccumulator?.[pathSegment], targetObject);
  function listChangedFields(changedItem) {
    baselineItemsById.has(changedItem.id) ||
      baselineItemsById.set(changedItem.id, structuredClone(changedItem));
    const baselinePayload = buildItemPayload(baselineItemsById.get(changedItem.id)),
      currentPayload = buildItemPayload(changedItem);
    return fieldDefs.filter(
      ([payloadFieldName]) =>
        readNestedPath(baselinePayload, payloadFieldName) !==
        readNestedPath(currentPayload, payloadFieldName),
    );
  }
  function closeAuxDialog() {
    (auxDialogElement?.close(), auxDialogElement?.remove(), (auxDialogElement = null));
  }
  function openMetricsDialog(metricsTargetEntry) {
    const statusSource = metricsTargetEntry.statusSource;
    if (
      !statusSource ||
      isDisposed ||
      !isAccessAllowed ||
      isCameraEditing ||
      isCameraCommandPending ||
      auxDialogElement
    )
      return;
    const set = new Set(
        statusSource.visibleMetrics ||
          statusSource.metrics.map((metricEntry) => metricEntry.entityId),
      ),
      list = [],
      metricsDialogElement = createElement(
        "dialog",
        "settings-dialog i3d-add-dialog i3d-nas-fields-dialog",
      );
    ((auxDialogElement = metricsDialogElement),
      metricsDialogElement.setAttribute("aria-label", "选择 NAS 显示内容"));
    const metricsHeadingElement = createElement("div", "dialog-heading"),
      metricsTitleElement = createElement("h2", "", "选择显示内容"),
      metricsCloseButton = createButton("×", closeAuxDialog);
    ((metricsCloseButton.className = "icon-button"),
      metricsCloseButton.setAttribute("aria-label", "关闭显示内容选择"),
      metricsHeadingElement.append(metricsTitleElement, metricsCloseButton));
    const metricsBodyElement = createElement("div", "i3d-add-dialog-body"),
      metricsActionsElement = createElement("div", "dialog-actions"),
      selectionSummaryElement = createElement("span", "i3d-note"),
      syncMetricsSelection = () => {
        selectionSummaryElement.textContent = "已选 " + set.size + " 项";
        for (const metricVisibilityCheckboxElement of list)
          metricVisibilityCheckboxElement.checked = set.has(metricVisibilityCheckboxElement.value);
      };
    metricsActionsElement.append(
      createButton("全选", () => {
        (statusSource.metrics.forEach((selectableMetric) => set.add(selectableMetric.entityId)),
          syncMetricsSelection());
      }),
      createButton("全不选", () => {
        (set.clear(), syncMetricsSelection());
      }),
      selectionSummaryElement,
    );
    const nasFieldsContainerElement = createElement("div", "i3d-nas-fields"),
      filter = nasGroups2(statusSource).filter(([nasGroupKey]) =>
        statusSource.metrics.some((nasGroupProbe) => nasGroupProbe.group === nasGroupKey),
      ),
      groupControlsByKey = new Map(),
      syncNasGroupOrder = () => {
        filter.forEach(([orderedGroupKey], groupIndex) => {
          const {
            section: mappedGroupSection,
            up: mappedUpButton,
            down: mappedDownButton,
          } = groupControlsByKey.get(orderedGroupKey);
          ((mappedUpButton.disabled = groupIndex === 0),
            (mappedDownButton.disabled = groupIndex === filter.length - 1),
            nasFieldsContainerElement.append(mappedGroupSection));
        });
      };
    for (const [fieldGroupKey, fieldGroupLabel] of filter) {
      const groupMetrics = statusSource.metrics.filter(
          (fieldGroupProbe) => fieldGroupProbe.group === fieldGroupKey,
        ),
        fieldGroupSectionElement = createElement("section"),
        fieldGroupHeadingElement = createElement("div", "i3d-nas-fields-heading"),
        moveFieldGroup = (groupOffset) => {
          const index = filter.findIndex(
              ([candidateGroupKey]) => candidateGroupKey === fieldGroupKey,
            ),
            groupTargetIndex = index + groupOffset;
          groupTargetIndex < 0 ||
            groupTargetIndex >= filter.length ||
            (([filter[index], filter[groupTargetIndex]] = [
              filter[groupTargetIndex],
              filter[index],
            ]),
            syncNasGroupOrder());
        },
        groupUpButtonElement = createButton("↑", () => moveFieldGroup(-1)),
        groupDownButtonElement = createButton("↓", () => moveFieldGroup(1));
      (groupUpButtonElement.setAttribute("aria-label", "上移" + fieldGroupLabel + "分组"),
        groupDownButtonElement.setAttribute("aria-label", "下移" + fieldGroupLabel + "分组"),
        (groupUpButtonElement.title = "上移分组"),
        (groupDownButtonElement.title = "下移分组"),
        fieldGroupHeadingElement.append(
          createElement("h4", "", fieldGroupLabel),
          groupUpButtonElement,
          groupDownButtonElement,
        ),
        fieldGroupSectionElement.append(fieldGroupHeadingElement),
        groupControlsByKey.set(fieldGroupKey, {
          section: fieldGroupSectionElement,
          up: groupUpButtonElement,
          down: groupDownButtonElement,
          metrics: groupMetrics,
        }));
      const metricControlsByEntityId = new Map(),
        syncNasMetricOrder = () =>
          groupMetrics.forEach((metricItem, metricIndex) => {
            const metricControl = metricControlsByEntityId.get(metricItem.entityId);
            ((metricControl.up.disabled = metricIndex === 0),
              (metricControl.down.disabled = metricIndex === groupMetrics.length - 1),
              fieldGroupSectionElement.append(metricControl.row));
          });
      for (const nasMetric of groupMetrics) {
        const metricRowElement = createElement("div", "i3d-nas-fields-row"),
          metricLabelElement = createElement("label"),
          metricCheckboxElement = createElement("input");
        ((metricCheckboxElement.type = "checkbox"),
          (metricCheckboxElement.value = nasMetric.entityId),
          metricCheckboxElement.setAttribute("aria-label", nasMetric.label),
          (metricLabelElement.title = nasMetric.entityId),
          metricCheckboxElement.addEventListener("change", () => {
            (metricCheckboxElement.checked
              ? set.add(metricCheckboxElement.value)
              : set.delete(metricCheckboxElement.value),
              syncMetricsSelection());
          }));
        const moveNasMetric = (metricOffset) => {
            const indexOf = groupMetrics.indexOf(nasMetric),
              metricTargetIndex = indexOf + metricOffset;
            metricTargetIndex < 0 ||
              metricTargetIndex >= groupMetrics.length ||
              (([groupMetrics[indexOf], groupMetrics[metricTargetIndex]] = [
                groupMetrics[metricTargetIndex],
                groupMetrics[indexOf],
              ]),
              syncNasMetricOrder());
          },
          metricUpButtonElement = createButton("↑", () => moveNasMetric(-1)),
          metricDownButtonElement = createButton("↓", () => moveNasMetric(1));
        (metricUpButtonElement.setAttribute("aria-label", "上移" + nasMetric.label),
          metricDownButtonElement.setAttribute("aria-label", "下移" + nasMetric.label),
          (metricUpButtonElement.title = "上移内容"),
          (metricDownButtonElement.title = "下移内容"),
          metricControlsByEntityId.set(nasMetric.entityId, {
            row: metricRowElement,
            up: metricUpButtonElement,
            down: metricDownButtonElement,
          }),
          list.push(metricCheckboxElement),
          metricLabelElement.append(
            metricCheckboxElement,
            createElement("span", "", nasMetric.label),
          ),
          metricRowElement.append(
            metricLabelElement,
            metricUpButtonElement,
            metricDownButtonElement,
          ),
          fieldGroupSectionElement.append(metricRowElement));
      }
      (syncNasMetricOrder(), nasFieldsContainerElement.append(fieldGroupSectionElement));
    }
    syncNasGroupOrder();
    const metricsDialogActionsElement = createElement("div", "dialog-actions"),
      confirmMetricsButton = createButton("确定", () => {
        if (
          isDisposed ||
          !isAccessAllowed ||
          metricsTargetEntry.statusSource !== statusSource ||
          !getItemList().includes(metricsTargetEntry)
        )
          return closeAuxDialog();
        ((statusSource.metrics = filter.flatMap(
          ([flatGroupKey]) => groupControlsByKey.get(flatGroupKey).metrics,
        )),
          (statusSource.visibleMetrics = statusSource.metrics
            .filter((metricVisibleProbe) => set.has(metricVisibleProbe.entityId))
            .map((metricVisibleEntry) => metricVisibleEntry.entityId)),
          (statusSource.groupOrder = filter.map(([mapGroupKey]) => mapGroupKey)),
          closeAuxDialog(),
          refreshEditorPreview(),
          renderPanel(),
          (saveStatusElement.textContent = "显示内容已调整，待保存配置"));
      });
    ((confirmMetricsButton.className = "primary"),
      metricsDialogActionsElement.append(
        createButton("取消", closeAuxDialog),
        confirmMetricsButton,
      ),
      metricsBodyElement.append(
        metricsActionsElement,
        nasFieldsContainerElement,
        createElement("p", "i3d-note", "用 ↑ ↓ 调整分组和组内内容顺序；确定后点击“保存配置”保存。"),
        metricsDialogActionsElement,
      ),
      metricsDialogElement.append(metricsHeadingElement, metricsBodyElement),
      document.body.append(metricsDialogElement),
      syncMetricsSelection(),
      metricsDialogElement.addEventListener("cancel", (metricsCancelEvent) => {
        (metricsCancelEvent.preventDefault(), closeAuxDialog());
      }),
      metricsDialogElement.showModal());
  }
  function openCurtainGroupBatchApplyDialog(sourceGroup, linkedFieldProbe = false) {
    if (
      isDisposed ||
      !isAccessAllowed ||
      isCameraEditing ||
      isCameraCommandPending ||
      isRangeEditorOpen ||
      auxDialogElement
    )
      return;
    const displayFieldValue = linkedFieldProbe
        ? [
            ["size", "按钮大小", "px"],
            ["hitSize", "触控范围", "px"],
            ["buttonVisibility", "按钮显示", ""],
          ]
        : buildEditableFieldList(),
      options = {
        ...sourceGroup,
        ...buildItemPayload(sourceGroup),
      };
    !usesModelBinding &&
      !linkedFieldProbe &&
      (displayFieldValue.push(["icon", "图标", ""], ["buttonVisibility", "按钮显示", ""]),
      (options.icon = sourceGroup.icon || defaultIcon),
      (options.buttonVisibility = sourceGroup.buttonHidden
        ? "隐藏（不可点击）"
        : sourceGroup.hiddenClickable
          ? "隐藏（可点击）"
          : "显示"));
    const itemFloorId = sceneMetadata?.floors
      .find((floorOtherItems) => floorOtherItems.id === sourceGroup.floorId)
      ?.[collectionKey]?.find((targetFloorRecord) => targetFloorRecord.id === sourceGroup.modelId);
    if (
      ((options.height =
        sourceGroup.height ??
        (isVacuumShortcutMode
          ? 0.08
          : isVacuumMode
            ? (Number(itemFloorId?.elevation) || 0) + (Number(itemFloorId?.height) || 0.85) + 0.25
            : itemFloorId?.height)),
      displayFieldValue.push(["height", "高度", " 米"]),
      !isVacuumShortcutMode &&
        deviceKind !== "smallcar" &&
        displayFieldValue.push(["clickAction", "点击行为", ""]),
      isCoverMode &&
        !linkedFieldProbe &&
        displayFieldValue.push(
          ["iconStateReversed", "图标状态反向", ""],
          ["curtainFabric", "帘布类型", ""],
          ["coverKind", "窗帘类型", ""],
          ["coverDirection", "开合方向", ""],
          ["unboundPosition", "未绑定时展示状态", "%"],
        ),
      isVacuumMode &&
        ((options.motionEnabled = sourceGroup.motionEnabled !== false),
        (options.funMessages = sourceGroup.funMessages !== false),
        displayFieldValue.push(
          ["motionEnabled", "跟随真实位置移动", ""],
          ["funMessages", "工作时趣味短句", ""],
        )),
      linkedFieldProbe)
    ) {
      const floorOptionsElement = getItemList().find(
          (floorTargetItem) => floorTargetItem.id === sourceGroup.memberIds?.[0],
        ),
        checkedTargetCount = sceneMetadata?.floors
          .find((checkedFieldProbe) => checkedFieldProbe.id === sourceGroup.floorId)
          ?.curtains?.find(
            (checkedFieldCheckbox) => checkedFieldCheckbox.id === floorOptionsElement?.modelId,
          );
      ((options.height =
        sourceGroup.height ?? floorOptionsElement?.height ?? checkedTargetCount?.height),
        (options.clickAction = sourceGroup.clickAction || "focus"),
        (options.panelLayout = sourceGroup.panelLayout || "horizontal"),
        displayFieldValue.push(["panelLayout", "弹窗布局", ""]));
    }
    isCoverMode &&
      !linkedFieldProbe &&
      ((options.curtainFabric = sourceGroup.curtainFabricOverride
        ? sourceGroup.curtainFabric
        : itemFloorId?.curtainFabric || sourceGroup.curtainFabric || "cloth"),
      (options.coverKind = sourceGroup.coverKindOverride
        ? sourceGroup.coverKind
        : itemFloorId?.curtainForm === "roller"
          ? "roller"
          : sourceGroup.coverKind || "standard"),
      (options.iconStateReversed = sourceGroup.iconStateReversed === true));
    const changedFieldNameSet = new Set([
        "height",
        "clickAction",
        "coverKind",
        "coverDirection",
        "unboundPosition",
        "motionEnabled",
        "panelLayout",
      ]),
      updatedTargetItems = displayFieldValue.map(
        ([memberFieldKey, memberFieldLabel, memberFieldUnit]) => ({
          key: memberFieldKey,
          label: memberFieldLabel,
          unit: memberFieldUnit,
          optional: changedFieldNameSet.has(memberFieldKey),
          ...(["cardOpacity", "backgroundOpacity"].includes(memberFieldKey)
            ? {
                format: (formattedPercentValue) => Math.round(formattedPercentValue * 100),
              }
            : {}),
          ...(memberFieldKey === "height"
            ? {
                format: (formattedSizeLabel) =>
                  Number.isFinite(formattedSizeLabel)
                    ? formattedSizeLabel.toFixed(1)
                    : "跟随各自模型",
              }
            : {}),
          ...(memberFieldKey === "buttonVisibility"
            ? {
                write: (optionHint, optionCheckboxList) => {
                  ((optionHint.buttonHidden = optionCheckboxList === "隐藏（不可点击）"),
                    (optionHint.hiddenClickable = optionCheckboxList === "隐藏（可点击）"));
                },
              }
            : {}),
          ...(memberFieldKey === "curtainFabric"
            ? {
                write: (writeFieldKey, writeFieldValue) => {
                  ((writeFieldKey.curtainFabric = writeFieldValue),
                    (writeFieldKey.curtainFabricOverride = true));
                },
              }
            : {}),
          ...(memberFieldKey === "coverKind"
            ? {
                write: (groupFieldLabel, groupFieldUnit) => {
                  ((groupFieldLabel.coverKind = groupFieldUnit),
                    (groupFieldLabel.coverKindOverride = true));
                },
              }
            : {}),
          ...(memberFieldKey === "unboundPosition"
            ? {
                compatible: (otherCurtainGroup) => !otherCurtainGroup.entityId,
              }
            : {}),
        }),
      ),
      selectedFieldKeys = (
        linkedFieldProbe ? structuredClone2.environment.curtainGroups : getItemList()
      ).filter(
        (batchCancelEvent) =>
          batchCancelEvent.id !== sourceGroup.id &&
          (isVacuumShortcutMode || batchCancelEvent.floorId === sourceGroup.floorId),
      );
    auxDialogElement = openBatchApply2({
      title: linkedFieldProbe ? "应用组合窗帘设置" : "应用" + kindLabel + "设置",
      source: options,
      targets: selectedFieldKeys,
      fields: updatedTargetItems,
      changed: linkedFieldProbe
        ? []
        : [
            ...new Set([
              ...listChangedFields(sourceGroup).map(([changedFieldKey]) => changedFieldKey),
              ...updatedTargetItems
                .filter(
                  (sourceItem) =>
                    sourceGroup[sourceItem.key] !==
                    baselineItemsById.get(sourceGroup.id)?.[sourceItem.key],
                )
                .map((candidateEntry) => candidateEntry.key),
            ]),
          ],
      onClose: () => {
        auxDialogElement = null;
      },
      onApply: async (nextMemberId, createGroupError) => {
        if (
          (await requestInteraction3dAccess2(),
          isDisposed || !isAccessAllowed || !auxDialogElement?.open)
        )
          throw new Error("配置已关闭或授权不可用");
        for (const batchTargetItem of nextMemberId)
          copyBatchFields2(batchTargetItem, options, createGroupError);
        (refreshEditorPreview(),
          renderPanel(),
          (saveStatusElement.textContent =
            "已应用到 " + nextMemberId.length + " 个目标，待保存配置"));
      },
    });
  }
  const syncPreviewSize = () => {
      const previewSize = interaction3dPreviewSize2(
        component,
        documentApi,
        viewElement.clientWidth,
        viewElement.clientHeight,
      );
      Object.assign(aspectBoxElement.style, {
        width: previewSize.width + "px",
        height: previewSize.height + "px",
      });
    },
    resizeObserver = new ResizeObserver(syncPreviewSize);
  resizeObserver.observe(viewElement);
  const disposeEditor = () => {
      isDisposed ||
        ((isDisposed = true),
        closeAddDialog(),
        closeAuxDialog(),
        subEditorHandle?.close(),
        resizeObserver.disconnect(),
        pickerGeneration++,
        pickerHandle?.close(),
        editorRuntime?.(),
        accessUnsubscribe(),
        editorDialogElement.remove(),
        element.remove(),
        document.dispatchEvent(new Event("hb-i3d-preview-scope")));
    },
    saveStatusElement = createElement("span", "i3d-save-status");
  saveStatusElement.setAttribute("role", "status");
  const saveButtonElement = createButton("保存配置", async () => {
    if (isSaving || isDisposed || !isAccessAllowed || isCameraEditing || isCameraCommandPending)
      return;
    for (const carRecord of structuredClone2.devices?.cars || []) {
      if (!carRecord.chargingStates) continue;
      const chargingMappingError = carChargingMappingError2(carRecord.chargingStates);
      if (chargingMappingError) {
        errorMessageElement.textContent =
          (carRecord.label || carRecord.deviceName || "汽车") + "：" + chargingMappingError;
        return;
      }
    }
    const structuredClone3 = structuredClone(structuredClone2);
    const runtimeCamera = isDirty;
    ((isSaving = true),
      (saveStatusElement.textContent = "保存中…"),
      (saveButtonElement.disabled = true),
      (errorMessageElement.textContent = ""));
    try {
      if ((await requestInteraction3dAccess2(), isDisposed)) return;
      (await onSaveConfig(structuredClone3),
        isDisposed ||
          (saveStatusElement.textContent =
            runtimeCamera === isDirty ? "已保存" : "已保存，另有新修改"));
    } catch (saveError) {
      isDisposed ||
        ((errorMessageElement.textContent = saveError.message),
        (saveStatusElement.textContent = ""));
    } finally {
      ((isSaving = false),
        isDisposed ||
          (saveButtonElement.disabled =
            !isAccessAllowed || isCameraEditing || isCameraCommandPending));
    }
  });
  ((saveButtonElement.className = "primary"),
    headerElement.append(
      createElement("strong", "", "3D " + editorKindTitle + "配置"),
      saveStatusElement,
      saveButtonElement,
      createButton("退出", disposeEditor),
    ),
    bodyElement.append(viewElement, panelElement),
    editorDialogElement.append(headerElement, bodyElement),
    document.body.append(editorDialogElement),
    editorDialogElement.addEventListener("cancel", (editorCancelEvent) => {
      (editorCancelEvent.preventDefault(), disposeEditor());
    }));
  const buildRuntimeProperties = () => {
    const floorId =
        isVacuumShortcutMode && findVacuumModel() ? findVacuumModel().floorId : floorSelection,
      camera =
        structuredClone2.floorCameras?.[floorId] ||
        (floorId === structuredClone2.floorSelection ? structuredClone2.camera : null);
    return {
      ...structuredClone2,
      floorSelection: floorId,
      ...(camera === undefined
        ? {}
        : {
            camera: camera,
          }),
    };
  };
  function refreshEditorPreview() {
    (buildCurtainGroupOptions(),
      isDirty++,
      isSaving || (saveStatusElement.textContent = ""),
      editorRuntime?.update(
        buildRuntimeProperties(),
        isVacuumShortcutMode && text
          ? "vacuum-room:" + vacuumId + ":" + text
          : describeGroupFieldValue(),
        {
          module: deviceKind,
          vacuumId: isVacuumShortcutMode ? vacuumId : "",
        },
      ),
      refreshBatchButtons());
  }
  function createSettingRow(rowContainer, rowLabel, rowControl) {
    rowControl.name = "i3d-" + deviceKind + "-" + (text || "scene") + "-" + rowLabel;
    const settingRowElement = createElement(
      "label",
      rowControl.type === "checkbox" ? "i3d-setting-toggle" : "",
    );
    return (
      settingRowElement.append(createElement("span", "", rowLabel), rowControl),
      rowContainer.append(settingRowElement),
      rowControl
    );
  }
  function createSelectRow(
    selectContainer,
    selectLabel,
    selectOptions,
    selectValue,
    onSelectChange,
  ) {
    const selectElement = createElement("select");
    for (const [optionValueKey, optionLabelText] of selectOptions) {
      const optionElement = createElement("option", "", optionLabelText);
      ((optionElement.value = optionValueKey), selectElement.append(optionElement));
    }
    return (
      (selectElement.value = selectValue),
      selectElement.addEventListener("change", () => onSelectChange(selectElement.value)),
      createSettingRow(selectContainer, selectLabel, selectElement)
    );
  }
  function createNumberRow(
    numberFieldContainer,
    numberFieldLabel,
    numberFieldValue,
    numberFieldMin,
    numberFieldMax,
    numberFieldStep,
    onNumberFieldChange,
    numberInputMode = "number",
    isCheckboxMode = false,
  ) {
    const endsWith = numberFieldLabel.endsWith("高度（米）"),
      formatNumberValue = (value) => (endsWith ? Number(value).toFixed(1) : String(value)),
      numberInputElement = createElement("input");
    return (
      Object.assign(numberInputElement, {
        type: numberInputMode,
        min: String(numberFieldMin),
        max: String(numberFieldMax),
        step: String(endsWith ? 0.1 : numberFieldStep),
        value: formatNumberValue(numberFieldValue),
      }),
      isCheckboxMode &&
        numberInputMode === "number" &&
        numberInputElement.addEventListener("input", () => {
          const NaN2 =
            numberInputElement.value.trim() === "" ? NaN : Number(numberInputElement.value);
          !Number.isFinite(NaN2) ||
            NaN2 < numberFieldMin ||
            NaN2 > numberFieldMax ||
            NaN2 === numberFieldValue ||
            ((numberFieldValue = NaN2), onNumberFieldChange(numberFieldValue));
        }),
      numberInputElement.addEventListener(numberInputMode === "range" ? "input" : "change", () => {
        const NaN3 =
          numberInputElement.value.trim() === "" ? NaN : Number(numberInputElement.value);
        if (!Number.isFinite(NaN3)) {
          numberInputElement.value = formatNumberValue(numberFieldValue);
          return;
        }
        const hasNumericSupportedFeatures = numberFieldValue;
        ((numberFieldValue = Math.max(numberFieldMin, Math.min(numberFieldMax, NaN3))),
          endsWith && (numberFieldValue = Number(numberFieldValue.toFixed(1))),
          (numberInputElement.value = formatNumberValue(numberFieldValue)),
          (!isCheckboxMode || numberFieldValue !== hasNumericSupportedFeatures) &&
            onNumberFieldChange(numberFieldValue));
      }),
      createSettingRow(numberFieldContainer, numberFieldLabel, numberInputElement)
    );
  }
  function createSizeRow(sizeRowContainer, sizeRowLabel, readSizeValue, onSizeValueChange) {
    const sizeInputElement = createElement("input");
    return (
      Object.assign(sizeInputElement, {
        type: "number",
        step: "any",
        value: String(Number(readSizeValue().toPrecision(12))),
      }),
      sizeInputElement.addEventListener("change", () => {
        const NaN4 = sizeInputElement.value.trim() === "" ? NaN : Number(sizeInputElement.value);
        Number.isFinite(NaN4) && NaN4 > 0
          ? ((sizeInputElement.value = String(NaN4)), onSizeValueChange(NaN4))
          : (sizeInputElement.value = String(readSizeValue()));
      }),
      createSettingRow(sizeRowContainer, sizeRowLabel, sizeInputElement)
    );
  }
  // 按钮大小与图标大小联动：图标按固定比例（BUTTON_ICON_SIZE_RATIO = 0.6）跟随按钮，
  // 避免旧的「按钮放大、图标不动」以及「图标和按钮等大、顶到圆形描边」。stage.ts 的
  // resolveMarkerIconSize 用同一个常量，所以即使这里没保存也渲染一致。
  function syncLinkedIconSize(targetConfig, nextButtonSize) {
    const resolvedIconSize = buttonIconSize(nextButtonSize);
    targetConfig.iconSize = resolvedIconSize;
    return resolvedIconSize;
  }
  function listAddableModels() {
    return (sceneMetadata?.floors || [])
      .filter((candidateFloorEntry) => candidateFloorEntry.id === floorSelection)
      .flatMap((floorWithModels) =>
        (usesModelBinding ? floorWithModels[collectionKey] || [] : floorWithModels.groups || [])
          .filter(
            (modelInFloor) =>
              !getItemList().some(
                (existingModelItem) =>
                  existingModelItem.floorId === floorWithModels.id &&
                  existingModelItem[modelIdKey] === modelInFloor.id,
              ),
          )
          .map((addableModel) => ({
            floor: floorWithModels,
            group: addableModel,
            key: JSON.stringify([floorWithModels.id, addableModel.id]),
          })),
      );
  }
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
        includes
          ? ["climate", "fan", "purifier", "cover", "temperature-humidity"]
          : isDeviceKind
            ? ["nas", "television", "speaker", "water-heater", "airer", ...GENERIC_DEVICE_KINDS2]
            : ["vacuum", "vacuum-shortcut"]
      ).includes(nextDeviceKind)
    )
      return;
    (kindSessionsByKind.set(deviceKind, {
      selectedId: text,
      scrollTop: panelElement.scrollTop,
      baselines: baselineItemsById,
    }),
      isVacuumMode && (vacuumId = text || vacuumId),
      closeAddDialog(),
      closeAuxDialog(),
      pickerGeneration++,
      pickerHandle?.close(),
      (pickerHandle = null),
      num++,
      (isCameraEditing = false),
      (isCameraCommandPending = false),
      (pendingCameraDraft = null),
      (vacuumCameraMode = "focus"),
      applyKindFlags(nextDeviceKind),
      ensureItemCollections());
    const savedKindSession = kindSessionsByKind.get(nextDeviceKind);
    ((text = isVacuumMode ? vacuumId : savedKindSession?.selectedId || ""),
      isVacuumMode && findVacuumModel() && (floorSelection = findVacuumModel().floorId),
      (fieldDefs = buildEditableFieldList()),
      (baselineItemsById =
        savedKindSession?.baselines ||
        new Map(
          getItemList().map((baselineListItem) => [
            baselineListItem.id,
            structuredClone(baselineListItem),
          ]),
        )),
      (errorMessageElement.textContent = ""),
      renderPanel(),
      refreshEditorPreview(),
      (panelElement.scrollTop = savedKindSession?.scrollTop || 0),
      shouldOpenAddDialog && openAddDialog());
  }
  function closeAddDialog() {
    (addDialogState && (pickerGeneration++, pickerHandle?.close(), (pickerHandle = null)),
      addDialogState?.close(),
      addDialogState?.remove(),
      (addDialogState = null));
  }
  function openAddDialog(addDialogTriggerEvent = undefined) {
    if (
      isDisposed ||
      !isAccessAllowed ||
      isCameraEditing ||
      isCameraCommandPending ||
      isRangeEditorOpen ||
      addDialogState
    )
      return;
    if (isVacuumShortcutMode) {
      openVacuumRoomPicker(addDialogTriggerEvent?.currentTarget || addDialogTriggerEvent?.target);
      return;
    }
    const addableModels = listAddableModels();
    if (!addableModels.length) return;
    (pickerGeneration++, pickerHandle?.close());
    const addDialogElement = createElement("dialog", "settings-dialog i3d-add-dialog");
    ((addDialogState = addDialogElement),
      addDialogElement.setAttribute(
        "aria-label",
        isDeviceKind ? "添加设备" : "添加" + kindLabel + "按钮",
      ));
    const addDialogHeadingElement = createElement("div", "dialog-heading"),
      addDialogTitleWrapperElement = createElement("div");
    addDialogTitleWrapperElement.append(
      createElement("span", "", "ADD BUTTON"),
      createElement("h2", "", isDeviceKind ? "添加设备" : "添加" + kindLabel + "按钮"),
    );
    const addDialogCloseButton = createButton("×", closeAddDialog);
    ((addDialogCloseButton.className = "icon-button"),
      addDialogCloseButton.setAttribute("aria-label", "关闭添加按钮窗口"),
      addDialogHeadingElement.append(addDialogTitleWrapperElement, addDialogCloseButton));
    const addDialogBodyElement = createElement("div", "i3d-add-dialog-body"),
      addDialogErrorElement = createElement("p", "i3d-error");
    (addDialogErrorElement.setAttribute("role", "status"),
      isDeviceKind &&
        createSelectRow(
          addDialogBodyElement,
          "设备类型",
          [
            ["nas", "NAS"],
            ["television", "电视"],
            ["speaker", "智能音响"],
            ["water-heater", "热水器"],
            ["airer", "晾衣架"],
            ...GENERIC_DEVICE_KINDS2.map((genericDeviceKind) => [
              genericDeviceKind,
              genericDeviceProfile2(genericDeviceKind).label,
            ]),
          ],
          deviceKind,
          (pickedDeviceKind) => {
            pickedDeviceKind !== deviceKind && switchEditorKind(pickedDeviceKind, true);
          },
        ).setAttribute("aria-label", "设备类型"));
    let selectedModelKind = "air-conditioner";
    deviceKind === "climate" &&
      createSelectRow(
        addDialogBodyElement,
        "设备类型",
        [
          ["air-conditioner", "空调"],
          ["bath-heater", "浴霸"],
        ],
        selectedModelKind,
        (addDialogModelLabel) => {
          selectedModelKind = addDialogModelLabel;
        },
      );
    const modelSelectElement = createSelectRow(
      addDialogBodyElement,
      usesModelBinding ? "关联" + kindLabel + "模型" : "关联灯组",
      addableModels.map((addableModelEntry) => [
        addableModelEntry.key,
        describeItem(addableModelEntry.group),
      ]),
      addableModels[0].key,
      () => {
        addDialogErrorElement.textContent = "";
      },
    );
    modelSelectElement.setAttribute(
      "aria-label",
      usesModelBinding ? "关联" + kindLabel + "模型" : "关联灯组",
    );
    const addDialogActionsElement = createElement("div", "dialog-actions");
    let isAdding = false;
    const confirmAddButton = createButton("确定添加", async () => {
      if (isAdding || isDisposed || !isAccessAllowed || addDialogState !== addDialogElement) return;
      ((isAdding = true),
        (confirmAddButton.disabled = true),
        (modelSelectElement.disabled = true),
        (addDialogErrorElement.textContent = ""));
      const chosenModelKey = modelSelectElement.value;
      try {
        if (
          (await requestInteraction3dAccess2(),
          isDisposed || !isAccessAllowed || addDialogState !== addDialogElement)
        )
          return;
        const chosenModel = listAddableModels().find(
          (modelCandidateMatch) => modelCandidateMatch.key === chosenModelKey,
        );
        if (!chosenModel) throw new Error("该对象已添加或不再可用，请关闭窗口后重新选择。");
        const newItem = {
          id: randomUuid2(),
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
                fadeDuration: 0.3,
              }),
          ...(isCoverMode
            ? {
                coverDirection: "auto",
                curtainFabric: "cloth",
                unboundPosition: 0,
              }
            : {}),
          size: DEFAULT_BUTTON_SIZE,
          iconSize: buttonIconSize(DEFAULT_BUTTON_SIZE),
          visible: true,
          icon: defaultIcon,
          clickAction: usesStatusPanel ? "focus-panel" : "focus",
          ...(deviceKind === "climate" ? { climateType: selectedModelKind } : {}),
        };
        (usesModelBinding || Object.assign(newItem, withFixedLightEffects2(newItem)),
          getItemList().push(newItem),
          (text = newItem.id),
          closeAddDialog(),
          refreshEditorPreview(),
          renderPanel());
      } catch (addItemError) {
        addDialogState === addDialogElement &&
          (addDialogErrorElement.textContent = addItemError.message);
      } finally {
        ((isAdding = false),
          (confirmAddButton.disabled = false),
          (modelSelectElement.disabled = false));
      }
    });
    ((confirmAddButton.className = "primary"),
      addDialogActionsElement.append(createButton("取消", closeAddDialog), confirmAddButton),
      addDialogBodyElement.append(
        createElement(
          "p",
          "i3d-note",
          "添加后可继续设置" + kindLabel + "按钮，最后点击“保存配置”完成保存。",
        ),
        addDialogErrorElement,
        addDialogActionsElement,
      ),
      addDialogElement.append(addDialogHeadingElement, addDialogBodyElement),
      document.body.append(addDialogElement),
      addDialogElement.addEventListener("cancel", (addDialogCancelEvent) => {
        (addDialogCancelEvent.preventDefault(), closeAddDialog());
      }),
      addDialogElement.showModal());
  }
  async function openVacuumRoomPicker(roomPickerTriggerEvent) {
    const vacuumModelRecord = findVacuumModel();
    if (!vacuumModelRecord) return;
    const vacuumPickerGeneration = ++pickerGeneration;
    pickerHandle?.close();
    try {
      const entity = await pickers.entity({
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
          )
            return;
          const entityMetadataEntry = entities.find(
              (entityMetadataProbe) => entityMetadataProbe.entityId === pickedRoomEntityId,
            ),
            entityStateRecord = states?.get?.(pickedRoomEntityId),
            entityStateSnapshot = entityStateRecord?.newState || entityStateRecord,
            roomModelFloor = sceneMetadata.floors.find(
              (roomFloorRecord) => roomFloorRecord.id === vacuumModelRecord.floorId,
            ),
            roomVacuumModel = roomModelFloor?.vacuums?.find(
              (roomVacuumModelProbe) => roomVacuumModelProbe.id === vacuumModelRecord.modelId,
            ),
            flatMap = (roomModelFloor?.plan?.walls || []).flatMap((wallSegment) => [
              wallSegment.start,
              wallSegment.end,
            ]),
            averageWallCoordinate = (axisKey) =>
              flatMap.length
                ? flatMap.reduce(
                    (coordinateSum, wallPoint) => coordinateSum + wallPoint[axisKey],
                    0,
                  ) / flatMap.length
                : roomVacuumModel?.[axisKey] || 0,
            roomShortcutItem = {
              id: randomUuid2(),
              entityId: pickedRoomEntityId,
              label:
                entityMetadataEntry?.name ||
                entityStateSnapshot?.attributes?.friendly_name ||
                pickedRoomEntityId,
              x: averageWallCoordinate("x"),
              y: averageWallCoordinate("y"),
              height: 0.08,
              size: DEFAULT_BUTTON_SIZE,
              iconSize: buttonIconSize(DEFAULT_BUTTON_SIZE),
              fontSize: CARD_TEXT_SIZE_PX,
              hitSize: DEFAULT_BUTTON_SIZE,
              icon: "mdi:broom",
              visible: true,
            };
          (setItemList([...getItemList(), roomShortcutItem]),
            (text = roomShortcutItem.id),
            pickerGeneration++,
            pickerHandle?.close(),
            (pickerHandle = null),
            renderPanel(),
            refreshEditorPreview());
        },
      });
      isDisposed || vacuumPickerGeneration !== pickerGeneration
        ? entity?.close()
        : (pickerHandle = entity);
    } catch (roomPickerError) {
      isDisposed || (errorMessageElement.textContent = roomPickerError.message);
    }
  }
  function renderVacuumShortcutPanel() {
    const scopeSectionElement = createConfigRow(createConfigSection("配置范围"));
    if (
      (createSelectRow(
        scopeSectionElement,
        "配置内容",
        [
          ["vacuum", "设备与地图"],
          ["vacuum-shortcut", "快捷指令"],
        ],
        deviceKind,
        (pickedScopeKey) => {
          pickedScopeKey !== deviceKind && switchEditorKind(pickedScopeKey);
        },
      ),
      !sceneMetadata)
    )
      return;
    const vacuumModels = structuredClone2.devices?.vacuums || [];
    if (!vacuumModels.length) {
      panelElement.append(createElement("p", "i3d-note", "请先在扫地机配置中添加并绑定扫地机。"));
      return;
    }
    createSelectRow(
      scopeSectionElement,
      "所属扫地机",
      vacuumModels.map((vacuumModelOption) => [
        vacuumModelOption.id,
        vacuumModelOption.label || vacuumModelOption.deviceName || "扫地机",
      ]),
      vacuumId,
      (pickedVacuumId) => {
        ((vacuumId = pickedVacuumId),
          (text = ""),
          baselineItemsById.clear(),
          renderPanel(),
          refreshEditorPreview());
      },
    );
    const shortcutSectionElement = createConfigSection("快捷按钮");
    shortcutSectionElement.className += " i3d-compact-list";
    const shortcutHeaderRowElement = createElement("div", "i3d-config-list-row"),
      addShortcutButton = createButton("添加快捷指令", openAddDialog);
    if (
      (shortcutHeaderRowElement.append(addShortcutButton),
      shortcutSectionElement.append(shortcutHeaderRowElement),
      getItemList().some((existingShortcutProbe) => existingShortcutProbe.id === text) ||
        (text = getItemList()[0]?.id || ""),
      !text)
    ) {
      panelElement.append(
        createElement(
          "p",
          "i3d-note",
          "添加按钮后，选择全部实体中的清扫指令，在户型中拖动按钮放置。",
        ),
      );
      return;
    }
    createSelectRow(
      shortcutHeaderRowElement,
      "当前按钮",
      getItemList().map((shortcutOptionItem) => [shortcutOptionItem.id, shortcutOptionItem.label]),
      text,
      (pickedShortcutId) => {
        ((text = pickedShortcutId),
          pickerGeneration++,
          pickerHandle?.close(),
          renderPanel(),
          refreshEditorPreview());
      },
    );
    const selectedShortcut = getItemList().find((matchedShortcut) => matchedShortcut.id === text),
      removeShortcutButton = createButton("删除此快捷按钮", () => {
        (pickerGeneration++,
          pickerHandle?.close(),
          setItemList(
            getItemList().filter(
              (removedShortcutProbe) => removedShortcutProbe !== selectedShortcut,
            ),
          ),
          (text = ""),
          renderPanel(),
          refreshEditorPreview());
      });
    removeShortcutButton.className = "i3d-remove-light";
    const bindingSectionElement = createConfigRow(createConfigSection("基础绑定")),
      shortcutNameInput = createElement("input");
    ((shortcutNameInput.value = selectedShortcut.label),
      (shortcutNameInput.maxLength = 128),
      (shortcutNameInput.onchange = () => {
        ((selectedShortcut.label = shortcutNameInput.value.trim() || "房间清扫"),
          renderPanel(),
          refreshEditorPreview());
      }),
      createSettingRow(bindingSectionElement, "名称", shortcutNameInput));
    const openShortcutPicker = (pickerName, shortcutPickerTrigger) => {
        const shortcutPickerGeneration = ++pickerGeneration;
        Promise.resolve(
          pickers[pickerName]({
            trigger: shortcutPickerTrigger,
            deviceKind: "vacuum-room",
            current: pickerName === "icon" ? selectedShortcut.icon : selectedShortcut.entityId,
            onSelect(pickedShortcutValue) {
              isDisposed ||
                !isAccessAllowed ||
                shortcutPickerGeneration !== pickerGeneration ||
                !getItemList().includes(selectedShortcut) ||
                (pickerName === "icon"
                  ? (selectedShortcut.icon = pickedShortcutValue)
                  : (selectedShortcut.entityId = pickedShortcutValue),
                renderPanel(),
                refreshEditorPreview());
            },
          }),
        )
          .then((shortcutPickerHandle) => {
            isDisposed || shortcutPickerGeneration !== pickerGeneration
              ? shortcutPickerHandle?.close()
              : (pickerHandle = shortcutPickerHandle);
          })
          .catch((shortcutPickerError) => {
            errorMessageElement.textContent = shortcutPickerError.message;
          });
      },
      entityPickerButton = createButton(selectedShortcut.entityId || "选择实体（全部）", () =>
        openShortcutPicker("entity", entityPickerButton),
      );
    ((entityPickerButton.className = "i3d-picker-button"),
      (entityPickerButton.title = selectedShortcut.entityId || ""),
      createSettingRow(bindingSectionElement, "指令实体", entityPickerButton));
    const shortcutAppearanceSectionElement = createConfigSection("按钮外观"),
      shortcutAppearanceRowElement = createConfigRow(shortcutAppearanceSectionElement),
      iconPickerButton = createButton("", () => openShortcutPicker("icon", iconPickerButton));
    iconPickerButton.className = "i3d-picker-button i3d-icon-picker-button";
    const iconPreviewElement = createElement("i");
    ((iconPreviewElement.style.maskImage =
      "url('/static/vendor/mdi/7.4.47/svg/" +
      (selectedShortcut.icon || defaultIcon).slice(4) +
      ".svg')"),
      (iconPreviewElement.style.webkitMaskImage = iconPreviewElement.style.maskImage),
      iconPickerButton.append(
        iconPreviewElement,
        createElement("span", "", selectedShortcut.icon || defaultIcon),
      ),
      createSettingRow(shortcutAppearanceRowElement, "图标", iconPickerButton));
    const shortcutVisibilityRowElement = createElement(
      "div",
      "i3d-button-visibility-row i3d-shortcut-visibility",
    );
    shortcutAppearanceSectionElement.append(shortcutVisibilityRowElement);
    for (const [visibilityPropertyKey, visibilityToggleLabel] of [
      ["hiddenClickable", "隐藏（可点击）"],
      ["buttonHidden", "隐藏（不可点击）"],
    ]) {
      const shortcutVisibilityCheckboxElement = createElement("input");
      ((shortcutVisibilityCheckboxElement.type = "checkbox"),
        (shortcutVisibilityCheckboxElement.checked =
          selectedShortcut[visibilityPropertyKey] === true),
        (shortcutVisibilityCheckboxElement.onchange = () => {
          ((selectedShortcut[visibilityPropertyKey] = shortcutVisibilityCheckboxElement.checked),
            shortcutVisibilityCheckboxElement.checked &&
              (selectedShortcut[
                visibilityPropertyKey === "buttonHidden" ? "hiddenClickable" : "buttonHidden"
              ] = false),
            renderPanel(),
            refreshEditorPreview());
        }),
        createSettingRow(
          shortcutVisibilityRowElement,
          visibilityToggleLabel,
          shortcutVisibilityCheckboxElement,
        ));
    }
    for (const [hiddenPropertyKey, hiddenToggleLabel] of [
      ["iconHidden", "隐藏图标"],
      ["labelHidden", "隐藏名称"],
    ]) {
      const hiddenCheckboxElement = createElement("input");
      ((hiddenCheckboxElement.type = "checkbox"),
        (hiddenCheckboxElement.checked = selectedShortcut[hiddenPropertyKey] === true),
        (hiddenCheckboxElement.onchange = () => {
          ((selectedShortcut[hiddenPropertyKey] = hiddenCheckboxElement.checked),
            refreshEditorPreview());
        }),
        createSettingRow(shortcutVisibilityRowElement, hiddenToggleLabel, hiddenCheckboxElement));
    }
    const shortcutSizeGridElement = createElement(
        "div",
        "i3d-coordinate-grid i3d-size-grid i3d-shortcut-size-grid",
      ),
      shortcutAdvancedDetailsElement = createElement("details");
    (shortcutAdvancedDetailsElement.append(
      createElement("summary", "", "更多尺寸设置"),
      shortcutSizeGridElement,
    ),
      shortcutAppearanceSectionElement.append(shortcutAdvancedDetailsElement));
    for (const [sizePropertyKey, sizeSettingLabel, shortcutSizeDefaultValue] of [
      ["size", "按钮大小（px）", DEFAULT_BUTTON_SIZE],
      ["fontSize", "文字大小（px）", 12],
      ["hitSize", "触控范围（px）", DEFAULT_BUTTON_SIZE],
    ]) {
      createSizeRow(
        sizePropertyKey === "size" ? shortcutAppearanceRowElement : shortcutSizeGridElement,
        sizeSettingLabel,
        () => selectedShortcut[sizePropertyKey] || shortcutSizeDefaultValue,
        (updatedShortcutSize) => {
          (selectedShortcut[sizePropertyKey] = updatedShortcutSize),
            sizePropertyKey === "size" &&
              syncLinkedIconSize(selectedShortcut, updatedShortcutSize),
            refreshEditorPreview();
        },
      );
    }
    const shortcutPositionSectionElement = createConfigSection("按钮位置"),
      shortcutPositionGridElement = createElement("div", "i3d-coordinate-grid");
    shortcutPositionSectionElement.append(shortcutPositionGridElement);
    for (const positionAxis of ["x", "y"])
      createNumberRow(
        shortcutPositionGridElement,
        "位置 " + positionAxis.toUpperCase(),
        selectedShortcut[positionAxis],
        -1000000,
        1000000,
        1,
        (updatedShortcutPosition) => {
          ((selectedShortcut[positionAxis] = updatedShortcutPosition), refreshEditorPreview());
        },
      );
    (createNumberRow(
      shortcutPositionGridElement,
      "高度（米）",
      selectedShortcut.height ?? 0.08,
      0,
      20,
      0.1,
      (updatedShortcutHeight) => {
        ((selectedShortcut.height = updatedShortcutHeight), refreshEditorPreview());
      },
    ),
      shortcutPositionSectionElement.append(
        createElement(
          "p",
          "i3d-note",
          "拖动按钮调整位置，拖动空白处旋转户型。点击只执行绑定指令，不弹窗、不聚焦。",
        ),
      ));
    const shortcutBatchSectionElement = createElement(
        "section",
        "navigation-batch-section i3d-light-batch",
      ),
      shortcutBatchApplyButton = createButton("一键应用到其他快捷按钮", () =>
        openCurtainGroupBatchApplyDialog(selectedShortcut),
      );
    (shortcutBatchSectionElement.append(
      createElement("h4", "", deviceKind === "smallcar" ? "卡片设置一键应用" : "图标设置一键应用"),
      shortcutBatchApplyButton,
    ),
      panelElement.append(shortcutBatchSectionElement),
      (refreshBatchButtons = () => {
        shortcutBatchApplyButton.disabled = !isAccessAllowed;
      }),
      refreshBatchButtons(),
      createConfigSection("绑定管理").append(removeShortcutButton));
  }
  function createConfigSection(sectionTitle) {
    const configSectionElement = createElement("section", "i3d-config-section");
    return (
      configSectionElement.append(createElement("h4", "", sectionTitle)),
      panelElement.append(configSectionElement),
      configSectionElement
    );
  }
  function createConfigRow(parentSectionElement) {
    const configRowElement = createElement("div", "i3d-config-row");
    return (parentSectionElement.append(configRowElement), configRowElement);
  }
  function renderStatusRuleSection(
    statusSettingsSectionElement,
    statusItem,
    { deviceId: statusDeviceId = statusItem.deviceId, standardOnly: isStandardOnly = false } = {},
  ) {
    ((statusSettingsSectionElement.className += " i3d-status-settings"),
      statusSettingsSectionElement.append(
        createElement(
          "p",
          "i3d-note",
          "正常绿灯、提醒橙灯，均为呼吸效果；未知状态显示稳定灰灯。未设置任何规则时不显示指示灯。",
        ),
      ));
    const deviceStatusChoicesProvider =
        typeof deviceStatusChoices2 == "function"
          ? deviceStatusChoices2
          : (statusEntityRecord: { entityId?: string } = {}) => {
              const entityDomain = String(statusEntityRecord.entityId || "").split(".")[0];
              return ["binary_sensor", "switch", "input_boolean", "light", "fan"].includes(
                entityDomain,
              )
                ? {
                    options: [
                      {
                        value: "on",
                        label: "开启",
                      },
                      {
                        value: "off",
                        label: "关闭",
                      },
                    ],
                    reminderValue: "on",
                  }
                : null;
            },
      statusRuleProvider =
        typeof defaultDeviceStatusRule2 == "function"
          ? defaultDeviceStatusRule2
          : (statusFallbackEntity, statusRuleKey, statusRuleMode) => {
              const statusChoiceDefinition = deviceStatusChoicesProvider(
                statusFallbackEntity,
                statusRuleKey,
              );
              if (!statusChoiceDefinition) return null;
              const reminderValue =
                statusRuleMode === "health"
                  ? statusChoiceDefinition.reminderValue
                  : statusChoiceDefinition.options[0].value;
              return {
                entityId: statusFallbackEntity.entityId,
                active: reminderValue,
                inactive: statusChoiceDefinition.options.find(
                  (nonReminderChoice) => nonReminderChoice.value !== reminderValue,
                ).value,
              };
            },
      readHealthRules = () =>
        Array.isArray(statusItem.statusRules?.health)
          ? statusItem.statusRules.health
          : statusItem.statusRules?.health
            ? [statusItem.statusRules.health]
            : [],
      resolveCatalogEntry = (probedEntityId) =>
        entities.find((entityProbe) => entityProbe.entityId === probedEntityId) || {
          entityId: probedEntityId,
        },
      resolveEntityState = (stateEntityId) =>
        latestStates?.get?.(stateEntityId) ??
        latestStates?.[stateEntityId] ??
        states?.get?.(stateEntityId) ??
        states?.[stateEntityId],
      refreshStatusRules = () => {
        const scrollTop = panelElement.scrollTop;
        (refreshEditorPreview(), renderPanel(), (panelElement.scrollTop = scrollTop));
      },
      canRefreshItem = (itemGeneration) =>
        !isDisposed &&
        isAccessAllowed &&
        itemGeneration === pickerGeneration &&
        getItemList().includes(statusItem),
      writeStatusRule = (ruleKind, ruleIndex, ruleValue) => {
        const statusRulesDraft = {
          ...statusItem.statusRules,
        };
        if (ruleKind === "power")
          ruleValue ? (statusRulesDraft.power = ruleValue) : delete statusRulesDraft.power;
        else {
          const slice = readHealthRules().slice();
          (ruleValue ? (slice[ruleIndex] = ruleValue) : slice.splice(ruleIndex, 1),
            slice.length ? (statusRulesDraft.health = slice) : delete statusRulesDraft.health);
        }
        (Object.keys(statusRulesDraft).length
          ? (statusItem.statusRules = statusRulesDraft)
          : delete statusItem.statusRules,
          refreshStatusRules());
      },
      openCustomStatusDialog = (
        dialogRuleKind,
        dialogRuleIndex,
        statusEntity,
        dialogGeneration,
      ) => {
        if (!canRefreshItem(dialogGeneration) || addDialogState) return;
        const statusDialogElement = createElement("dialog", "settings-dialog i3d-add-dialog");
        ((addDialogState = statusDialogElement),
          statusDialogElement.setAttribute("aria-label", "设置指示灯条件"));
        const statusDialogHeadingElement = createElement("div", "dialog-heading");
        statusDialogHeadingElement.append(createElement("h2", "", "设置指示灯条件"));
        const statusDialogBodyElement = createElement("div", "i3d-add-dialog-body"),
          catalogEntry = resolveCatalogEntry(statusEntity.entityId),
          entityState = resolveEntityState(statusEntity.entityId),
          entityStateText = (entityState?.newState || entityState)?.state;
        (statusDialogBodyElement.append(
          createElement("strong", "", catalogEntry.name || statusEntity.entityId),
          createElement(
            "p",
            "i3d-note",
            "此实体使用自定义状态。指定两个匹配值，其他值显示为未知。",
          ),
        ),
          entityStateText != null &&
            statusDialogBodyElement.append(
              createElement("p", "i3d-note", "HA 当前值：" + entityStateText),
            ));
        const activeValueInputElement = createElement("input"),
          inactiveValueInputElement = createElement("input");
        ((activeValueInputElement.value = statusEntity.active || ""),
          (inactiveValueInputElement.value = statusEntity.inactive || ""),
          (activeValueInputElement.maxLength = inactiveValueInputElement.maxLength = 120),
          createSettingRow(
            statusDialogBodyElement,
            dialogRuleKind === "health" ? "提醒时的状态值" : "亮灯时的状态值",
            activeValueInputElement,
          ),
          createSettingRow(
            statusDialogBodyElement,
            dialogRuleKind === "health" ? "恢复时的状态值" : "灭灯时的状态值",
            inactiveValueInputElement,
          ));
        const statusDialogErrorElement = createElement("p", "i3d-error");
        (statusDialogErrorElement.setAttribute("role", "status"),
          statusDialogBodyElement.append(statusDialogErrorElement));
        const confirmStatusValuesButton = createButton("确定", () => {
          if (!canRefreshItem(dialogGeneration)) {
            closeAddDialog();
            return;
          }
          const statusValuePair = [
            activeValueInputElement.value.trim(),
            inactiveValueInputElement.value.trim(),
          ];
          if (
            statusValuePair.some(
              (statusValueProbe) =>
                !statusValueProbe ||
                statusValueProbe.length > 120 ||
                ["unknown", "unavailable"].includes(statusValueProbe),
            ) ||
            statusValuePair[0] === statusValuePair[1]
          ) {
            statusDialogErrorElement.textContent =
              "请填写两个不同的有效状态值；未知或不可用不能作为匹配条件。";
            return;
          }
          (closeAddDialog(),
            writeStatusRule(dialogRuleKind, dialogRuleIndex, {
              entityId: statusEntity.entityId,
              active: statusValuePair[0],
              inactive: statusValuePair[1],
            }));
        });
        confirmStatusValuesButton.className = "primary";
        const statusDialogActionsElement = createElement("div", "dialog-actions");
        (statusDialogActionsElement.append(
          createButton("取消", closeAddDialog),
          confirmStatusValuesButton,
        ),
          statusDialogElement.append(
            statusDialogHeadingElement,
            statusDialogBodyElement,
            statusDialogActionsElement,
          ),
          editorDialogElement.append(statusDialogElement),
          statusDialogElement.addEventListener("cancel", (statusDialogCancelEvent) => {
            (statusDialogCancelEvent.preventDefault(), closeAddDialog());
          }),
          statusDialogElement.showModal());
      },
      openStatusEntityPicker = async (pickerRuleKind, pickerRuleIndex, statusPickerGeneration) => {
        if (!isAccessAllowed || isDisposed || !statusDeviceId) return;
        const ruleRefreshGeneration = ++pickerGeneration;
        (pickerHandle?.close(), (errorMessageElement.textContent = ""));
        const existingRule =
            pickerRuleKind === "power"
              ? statusItem.statusRules?.power
              : readHealthRules()[pickerRuleIndex],
          usedEntityIds = (entryProbe) =>
            (entryProbe.deviceId || entryProbe.device_id) === statusDeviceId &&
            !entryProbe.disabledBy &&
            !entryProbe.disabled_by &&
            entryProbe.enabled !== false &&
            !["disabled", "missing"].includes(entryProbe.status) &&
            (!isStandardOnly ||
              !!deviceStatusChoicesProvider(entryProbe, resolveEntityState(entryProbe.entityId))) &&
            (pickerRuleKind !== "health" ||
              !readHealthRules().some(
                (pickedEntity, pickedEntry) =>
                  pickedEntry !== pickerRuleIndex && pickedEntity.entityId === entryProbe.entityId,
              ));
        let isRefreshingRules = false;
        try {
          if (!pickers?.entity) throw new Error("实体选择器尚未准备好，请刷新页面。");
          const entity2 = await pickers.entity({
            trigger: statusPickerGeneration,
            current: existingRule?.entityId || "",
            deviceKind: "device-status",
            title: pickerRuleKind === "health" ? "选择提醒实体" : "选择亮灭依据",
            entityFilter: usedEntityIds,
            onSelect(selectedEntity, selectedEntry) {
              if (isRefreshingRules || !canRefreshItem(ruleRefreshGeneration)) return;
              if (!selectedEntity) {
                ((isRefreshingRules = true),
                  existingRule && writeStatusRule(pickerRuleKind, pickerRuleIndex, null));
                return;
              }
              const resolvedCatalogEntry =
                selectedEntry?.entityId === selectedEntity
                  ? selectedEntry
                  : resolveCatalogEntry(selectedEntity);
              if (
                !usedEntityIds(resolvedCatalogEntry) ||
                ((isRefreshingRules = true),
                (entities = [
                  ...entities.filter(
                    (catalogEntityProbe) => catalogEntityProbe.entityId !== selectedEntity,
                  ),
                  resolvedCatalogEntry,
                ]),
                existingRule?.entityId === selectedEntity)
              )
                return;
              const healthRuleRecord = statusRuleProvider(
                resolvedCatalogEntry,
                resolveEntityState(selectedEntity),
                pickerRuleKind,
              );
              healthRuleRecord
                ? writeStatusRule(pickerRuleKind, pickerRuleIndex, healthRuleRecord)
                : isStandardOnly ||
                  openCustomStatusDialog(
                    pickerRuleKind,
                    pickerRuleIndex,
                    {
                      entityId: selectedEntity,
                    },
                    ruleRefreshGeneration,
                  );
            },
          });
          canRefreshItem(ruleRefreshGeneration) ? (pickerHandle = entity2) : entity2?.close();
        } catch (statusPickerError) {
          canRefreshItem(ruleRefreshGeneration) &&
            (errorMessageElement.textContent = statusPickerError.message);
        }
      },
      writeRuleRow = (rowRuleKind, rowRuleIndex, ruleEntity) => {
        const ruleCatalogEntry = resolveCatalogEntry(ruleEntity?.entityId),
          statusEntityIdText = ruleCatalogEntry.name || ruleEntity?.entityId || "未选择实体",
          statusRuleRowElement = createElement("div", "i3d-status-rule"),
          ruleValueInputElement = createButton(
            "",
            () => void openStatusEntityPicker(rowRuleKind, rowRuleIndex, ruleValueInputElement),
          );
        if (
          ((ruleValueInputElement.className = "i3d-picker-button"),
          ruleValueInputElement.append(
            createElement("span", "", ruleEntity ? statusEntityIdText : "不设置 · 选择实体"),
          ),
          ruleValueInputElement.setAttribute(
            "aria-label",
            rowRuleKind === "power" ? "电源状态实体" : "提醒实体 " + (rowRuleIndex + 1),
          ),
          (ruleValueInputElement.title = statusEntityIdText),
          (ruleValueInputElement.disabled = !statusDeviceId),
          statusRuleRowElement.append(ruleValueInputElement),
          !ruleEntity)
        ) {
          ((statusRuleRowElement.className += " is-empty"),
            statusSettingsSectionElement.append(statusRuleRowElement));
          return;
        }
        const choiceDefinition = deviceStatusChoicesProvider(
          ruleCatalogEntry,
          resolveEntityState(ruleEntity.entityId),
        );
        if (
          ruleEntity.active !== ruleEntity.inactive &&
          choiceDefinition?.options.some(
            (activeChoiceProbe) => activeChoiceProbe.value === ruleEntity.active,
          ) &&
          choiceDefinition.options.some(
            (inactiveChoiceProbe) => inactiveChoiceProbe.value === ruleEntity.inactive,
          )
        ) {
          const ruleDefaultButton = createElement("select");
          ruleDefaultButton.setAttribute(
            "aria-label",
            rowRuleKind === "power"
              ? statusEntityIdText + "亮灯条件"
              : statusEntityIdText + "提醒条件",
          );
          for (const { value: optionValue, label: optionLabel } of choiceDefinition.options) {
            const reminderOptionElement = createElement(
              "option",
              "",
              optionLabel + "时" + (rowRuleKind === "power" ? "亮灯" : "提醒"),
            );
            ((reminderOptionElement.value = optionValue),
              ruleDefaultButton.append(reminderOptionElement));
          }
          ((ruleDefaultButton.value = ruleEntity.active),
            ruleDefaultButton.addEventListener("change", () => {
              const inactiveOptionValue = ruleDefaultButton.value,
                inactiveOption = choiceDefinition.options.find(
                  (otherOptionProbe) => otherOptionProbe.value !== inactiveOptionValue,
                )?.value;
              !inactiveOption ||
                !choiceDefinition.options.some(
                  (matchingOptionProbe) => matchingOptionProbe.value === inactiveOptionValue,
                ) ||
                (Object.assign(ruleEntity, {
                  active: inactiveOptionValue,
                  inactive: inactiveOption,
                }),
                refreshEditorPreview());
            }),
            statusRuleRowElement.append(ruleDefaultButton));
        } else {
          if (isStandardOnly)
            statusRuleRowElement.append(
              createElement("span", "i3d-note", "状态暂不可识别，请重新选择实体。"),
            );
          else {
            const ruleActionsElement = createButton("设置匹配条件", () =>
              openCustomStatusDialog(rowRuleKind, rowRuleIndex, ruleEntity, ++pickerGeneration),
            );
            (ruleActionsElement.setAttribute(
              "aria-label",
              "设置" + statusEntityIdText + "匹配条件",
            ),
              statusRuleRowElement.append(ruleActionsElement));
          }
        }
        const pickerCloseButton = createButton("×", () => {
          (pickerGeneration++,
            pickerHandle?.close(),
            writeStatusRule(rowRuleKind, rowRuleIndex, null));
        });
        ((pickerCloseButton.className = "i3d-status-remove"),
          (pickerCloseButton.title =
            rowRuleKind === "power" ? "移除亮灭依据" : "删除" + statusEntityIdText + "提醒"),
          pickerCloseButton.setAttribute("aria-label", pickerCloseButton.title),
          statusRuleRowElement.append(pickerCloseButton),
          statusSettingsSectionElement.append(statusRuleRowElement));
      };
    (statusSettingsSectionElement.append(
      createElement("p", "i3d-status-label", "电源状态（可选）"),
    ),
      writeRuleRow("power", 0, statusItem.statusRules?.power),
      statusSettingsSectionElement.append(createElement("p", "i3d-status-label", "提醒条件")),
      readHealthRules().forEach((healthRuleEntity, healthRuleIndex) =>
        writeRuleRow("health", healthRuleIndex, healthRuleEntity),
      ));
    const addRuleButtonElement = createButton(
      "＋ 添加提醒",
      () => void openStatusEntityPicker("health", readHealthRules().length, addRuleButtonElement),
    );
    ((addRuleButtonElement.disabled = !statusDeviceId),
      (addRuleButtonElement.className = "i3d-status-add"),
      statusSettingsSectionElement.append(addRuleButtonElement),
      statusSettingsSectionElement.append(
        createElement(
          "p",
          "i3d-note",
          "任一提醒条件触发时优先亮橙灯；没有提醒时，按电源状态亮灯或熄灭。不设置电源状态则只看提醒条件。",
        ),
      ));
  }
  function openCurtainGroupDialog(onCancel) {
    if (
      isDisposed ||
      !isAccessAllowed ||
      isCameraEditing ||
      isCameraCommandPending ||
      addDialogState
    )
      return;
    const curtainGroupCandidates: { id?: string; entityId?: string; label?: string }[] =
      curtainGroupCandidates2(
      structuredClone2.environment,
      onCancel.id,
    );
    if (!curtainGroupCandidates.length) return;
    const curtainGroupDialogElement = createElement("dialog", "settings-dialog i3d-add-dialog");
    ((addDialogState = curtainGroupDialogElement),
      curtainGroupDialogElement.setAttribute("aria-label", "组合窗帘"));
    const curtainGroupDialogBodyElement = createElement("div", "i3d-add-dialog-body"),
      statusHeadingElement = createElement("p", "i3d-error");
    curtainGroupDialogBodyElement.append(
      createElement("h2", "", "组合窗帘"),
      createElement(
        "p",
        "i3d-note",
        "以“" +
          (onCancel.label || "当前窗帘") +
          "”为第一层，继承其入口位置、尺寸、点击行为和聚焦视角。请选择同一位置的另一层窗帘。",
      ),
    );
    const statusBodyElement = createSelectRow(
        curtainGroupDialogBodyElement,
        "另一层窗帘",
        curtainGroupCandidates.map((curtainGroupOptionEntry) => [
          curtainGroupOptionEntry.id,
          curtainGroupOptionEntry.label ||
            curtainGroupOptionEntry.entityId ||
            curtainGroupOptionEntry.id,
        ]),
        curtainGroupCandidates[0].id,
        () => {},
      ),
      statusEntityInputElement = createElement("input");
    ((statusEntityInputElement.value = "双层窗帘"),
      (statusEntityInputElement.maxLength = 128),
      createSettingRow(curtainGroupDialogBodyElement, "组合名称", statusEntityInputElement),
      curtainGroupDialogBodyElement.append(
        createElement(
          "p",
          "i3d-note",
          "3D 画面只显示双图标，无文字；两个模型仍各自动画。不会移动模型或发送设备命令。",
        ),
      ));
    const confirmStatusButton = createButton("确定组合", () => {
      if (!(!isAccessAllowed || isDisposed || addDialogState !== curtainGroupDialogElement))
        try {
          const trimmedStatusValues = createCurtainGroup2(
            structuredClone2.environment,
            onCancel.id,
            statusBodyElement.value,
            randomUuid2(),
          );
          ((trimmedStatusValues.label = statusEntityInputElement.value.trim() || "双层窗帘"),
            (structuredClone2.environment.curtainGroups = [
              ...getCurtainGroupList(),
              trimmedStatusValues,
            ]),
            (text = curtainGroupEntryId2(trimmedStatusValues)),
            closeAddDialog(),
            refreshEditorPreview(),
            renderPanel());
        } catch (trimmedStatusValue) {
          statusHeadingElement.textContent = trimmedStatusValue.message;
        }
    });
    confirmStatusButton.className = "primary";
    const statusActionsElement = createElement("div", "dialog-actions");
    (statusActionsElement.append(createButton("取消", closeAddDialog), confirmStatusButton),
      curtainGroupDialogBodyElement.append(statusHeadingElement, statusActionsElement),
      curtainGroupDialogElement.append(curtainGroupDialogBodyElement),
      document.body.append(curtainGroupDialogElement),
      curtainGroupDialogElement.addEventListener("cancel", (statusCancelEvent) => {
        (statusCancelEvent.preventDefault(), closeAddDialog());
      }),
      curtainGroupDialogElement.showModal());
  }
  function renderCurtainGroupSection(curtainGroup) {
    const groupEntrySectionElement = createConfigSection("组合入口"),
      groupNameRowElement = createConfigRow(groupEntrySectionElement),
      groupNameInputElement = createElement("input");
    ((groupNameInputElement.value = curtainGroup.label || "双层窗帘"),
      (groupNameInputElement.maxLength = 128),
      groupNameInputElement.addEventListener("change", () => {
        ((curtainGroup.label = groupNameInputElement.value.trim() || "双层窗帘"),
          refreshEditorPreview());
      }),
      createSettingRow(groupNameRowElement, "组合名称", groupNameInputElement),
      groupEntrySectionElement.append(
        createElement(
          "p",
          "i3d-note",
          "双图标各自显示状态，共用点击范围。名称只用于配置和弹窗，不在户型上显示。",
        ),
      ));
    const memberItemList = curtainGroup.memberIds.map((memberId) =>
        getItemList().find((memberItemProbe) => memberItemProbe.id === memberId),
      ),
      memberSectionElement = createConfigSection("组合成员"),
      memberActionsElement = createElement("div", "i3d-group-member-actions");
    (memberSectionElement.append(memberActionsElement),
      memberItemList.forEach((memberItem, memberIndex) =>
        memberActionsElement.append(
          createButton(
            (memberIndex === 0 ? "左图标 / 上控制区" : "右图标 / 下控制区") +
              "：" +
              (memberItem.label || "窗帘") +
              " · 编辑",
            () => {
              ((text = memberItem.id),
                (selectedCurtainGroupId = memberItem.id),
                refreshEditorPreview(),
                renderPanel());
            },
          ),
        ),
      ),
      memberActionsElement.append(
        createButton("交换两层顺序", () => {
          (curtainGroup.memberIds.reverse(), refreshEditorPreview(), renderPanel());
        }),
      ));
    const behaviorSectionElement = createConfigSection("交互行为");
    (createSelectRow(
      behaviorSectionElement,
      "弹窗布局",
      [
        ["horizontal", "左右布局"],
        ["vertical", "上下布局"],
      ],
      curtainGroup.panelLayout || "horizontal",
      (pickedPanelLayout) => {
        ((curtainGroup.panelLayout = pickedPanelLayout), refreshEditorPreview());
      },
    ),
      behaviorSectionElement.append(
        createElement(
          "p",
          "i3d-note",
          "左右布局保持普通弹窗大小；上下布局增加高度。均跟随自定义弹窗缩放与位置。",
        ),
      ),
      createSelectRow(
        behaviorSectionElement,
        "点击组合入口",
        [
          ["focus", "聚焦并显示控制"],
          ["panel", "仅显示控制"],
          ["turn-on-focus", "开合窗帘（打开时聚焦）"],
          ["turn-on", "仅开合窗帘"],
          ["turn-on-panel", "开合窗帘（打开时显示控制）"],
        ],
        curtainGroup.clickAction || "focus",
        (pickedClickAction) => {
          ((curtainGroup.clickAction = pickedClickAction), refreshEditorPreview());
        },
      ),
      behaviorSectionElement.append(
        createElement(
          "p",
          "i3d-note",
          "开关类行为：任一窗帘打开或半开时关闭两层，全部关闭时打开两层；运动中点击先停止。仅打开时执行所选聚焦或弹窗。",
        ),
      ));
    const visibilityRowElement = createElement("div", "i3d-button-visibility-row");
    behaviorSectionElement.append(visibilityRowElement);
    for (const [visibilityFieldKey, visibilityFieldLabel, oppositeVisibilityKey] of [
      ["hiddenClickable", "隐藏（可点击）", "buttonHidden"],
      ["buttonHidden", "隐藏（不可点击）", "hiddenClickable"],
    ]) {
      const visibilityCheckboxElement = createElement("input");
      ((visibilityCheckboxElement.type = "checkbox"),
        (visibilityCheckboxElement.checked =
          curtainGroup[visibilityFieldKey] === true &&
          (visibilityFieldKey === "buttonHidden" || curtainGroup.buttonHidden !== true)),
        visibilityCheckboxElement.addEventListener("change", () => {
          ((curtainGroup.visible = true),
            (curtainGroup[visibilityFieldKey] = visibilityCheckboxElement.checked),
            visibilityCheckboxElement.checked && (curtainGroup[oppositeVisibilityKey] = false),
            refreshEditorPreview(),
            renderPanel());
        }),
        (createSettingRow(
          visibilityRowElement,
          visibilityFieldLabel,
          visibilityCheckboxElement,
        ).parentElement.className += " i3d-hidden-clickable-setting"));
    }
    const appearanceSectionElement = createConfigSection("按钮外观"),
      buttonSizeRowElement = createConfigRow(appearanceSectionElement),
      sizeGridElement = createElement("div", "i3d-coordinate-grid i3d-size-grid"),
      sizeDetailsElement = createElement("details");
    (sizeDetailsElement.append(createElement("summary", "", "更多尺寸设置"), sizeGridElement),
      appearanceSectionElement.append(sizeDetailsElement));
    for (const [buttonSizeFieldKey, buttonSizeFieldLabel, buttonSizeDefaultValue] of [
      ["size", "按钮大小（px）", DEFAULT_BUTTON_SIZE],
      ["hitSize", "触控范围（px）", DEFAULT_BUTTON_SIZE],
    ]) {
      createSizeRow(
        buttonSizeFieldKey === "size" ? buttonSizeRowElement : sizeGridElement,
        buttonSizeFieldLabel,
        () => curtainGroup[buttonSizeFieldKey] ?? buttonSizeDefaultValue,
        (nextSizeValue) => {
          (curtainGroup[buttonSizeFieldKey] = nextSizeValue),
            buttonSizeFieldKey === "size" &&
              syncLinkedIconSize(curtainGroup, nextSizeValue),
            refreshEditorPreview();
        },
      );
    }
    const buttonPositionSectionElement = createConfigSection("按钮位置"),
      buttonPositionGridElement = createElement("div", "i3d-coordinate-grid");
    buttonPositionSectionElement.append(buttonPositionGridElement);
    const anchorMemberItem = memberItemList[0],
      anchorCurtainModel = sceneMetadata.floors
        .find((matchedFloor) => matchedFloor.id === curtainGroup.floorId)
        ?.curtains?.find(
          (matchedCurtainModel) => matchedCurtainModel.id === anchorMemberItem.modelId,
        );
    for (const [positionFieldKey, positionFieldLabel, positionMin, positionMax, positionStep] of [
      ["x", "位置 X", -1000000, 1000000, 1],
      ["y", "位置 Y", -1000000, 1000000, 1],
      ["height", "高度（米）", 0, 20, 0.1],
    ])
      createNumberRow(
        buttonPositionGridElement,
        positionFieldLabel,
        curtainGroup[positionFieldKey] ??
          anchorMemberItem[positionFieldKey] ??
          anchorCurtainModel?.[positionFieldKey] ??
          0,
        positionMin,
        positionMax,
        positionStep,
        (nextPositionValue) => {
          ((curtainGroup[positionFieldKey] = nextPositionValue), refreshEditorPreview());
        },
      );
    (buttonPositionSectionElement.append(
      createButton("一键应用到其他组合窗帘", () =>
        openCurtainGroupBatchApplyDialog(curtainGroup, true),
      ),
    ),
      buttonPositionSectionElement.append(
        createButton("恢复跟随第一层入口", () => {
          for (const positionFieldName of ["x", "y", "height"])
            delete curtainGroup[positionFieldName];
          (refreshEditorPreview(), renderPanel());
        }),
      ));
    const focusSectionElement = createConfigSection("聚焦视角");
    focusSectionElement.className += " i3d-focus-settings";
    const focusActionsElement = createElement("div", "i3d-focus-actions");
    focusSectionElement.append(focusActionsElement);
    const runGroupCameraCommand = async (cameraCommandName, cameraCommandPayload = undefined) => {
      const cameraCommandGeneration = ++num,
        isFocalLengthCommand = cameraCommandName === "focus-focal-length",
        previousCameraQueue = cameraCommandQueue;
      let resolveCameraCommand;
      ((cameraCommandQueue = new Promise((finishCameraCommand) => {
        resolveCameraCommand = finishCameraCommand;
      })),
        isFocalLengthCommand || ((isCameraCommandPending = true), renderPanel()));
      try {
        if ((await previousCameraQueue, isDisposed || cameraCommandGeneration !== num)) return;
        const focusCommand = await editorRuntime.focusCommand(
          cameraCommandName,
          curtainGroupEntryId2(curtainGroup),
          cameraCommandPayload,
        );
        if (isDisposed || cameraCommandGeneration !== num) return;
        cameraCommandName === "save-light-camera"
          ? ((curtainGroup.focusCamera = focusCommand.camera),
            (isCameraEditing = false),
            (pendingCameraDraft = null),
            refreshEditorPreview())
          : cameraCommandName === "cancel-light-camera"
            ? ((isCameraEditing = false), (pendingCameraDraft = null))
            : ((isCameraEditing = true), (pendingCameraDraft = focusCommand.camera));
      } catch (cameraError) {
        isDisposed || (errorMessageElement.textContent = cameraError.message);
      } finally {
        (resolveCameraCommand(),
          !isDisposed &&
            cameraCommandGeneration === num &&
            !isFocalLengthCommand &&
            ((isCameraCommandPending = false), renderPanel()));
      }
    };
    if (isCameraEditing) {
      const entrySectionElement = createButton(
        "保存视角",
        () => void runGroupCameraCommand("save-light-camera"),
      );
      ((entrySectionElement.className = "primary"),
        focusActionsElement.append(
          entrySectionElement,
          createButton("取消调整", () => void runGroupCameraCommand("cancel-light-camera")),
        ));
      const projectionGroupElement = createElement("div", "i3d-focus-actions");
      (projectionGroupElement.setAttribute("role", "group"),
        projectionGroupElement.setAttribute("aria-label", "聚焦投影"),
        focusSectionElement.append(projectionGroupElement));
      for (const [projectionMode, projectionModeLabel] of [
        ["orthographic", "正交"],
        ["perspective", "透视"],
      ]) {
        const projectionButtonElement = createButton(
          projectionModeLabel,
          () => void runGroupCameraCommand("focus-projection", projectionMode),
        );
        (projectionButtonElement.setAttribute(
          "aria-pressed",
          String((pendingCameraDraft?.mode || "orthographic") === projectionMode),
        ),
          projectionGroupElement.append(projectionButtonElement));
      }
      const focalLengthInputElement = createNumberRow(
        focusSectionElement,
        "焦段（mm）",
        Math.round(pendingCameraDraft?.focalLength || 50),
        18,
        120,
        1,
        (nextFocalLength) => void runGroupCameraCommand("focus-focal-length", nextFocalLength),
      );
      focalLengthInputElement.disabled = pendingCameraDraft?.mode !== "perspective";
    } else {
      focusActionsElement.append(
        createButton(
          curtainGroup.focusCamera ? "调整视角" : "设置视角",
          () => void runGroupCameraCommand("edit-light-camera"),
        ),
        createButton("预览聚焦", () => void runGroupCameraCommand("preview-light-camera")),
      );
      const resetFocusButtonElement = createButton("恢复自动聚焦", async () => {
        (await runGroupCameraCommand("cancel-light-camera"),
          delete curtainGroup.focusCamera,
          refreshEditorPreview(),
          renderPanel());
      });
      ((resetFocusButtonElement.className = "i3d-focus-reset"),
        (resetFocusButtonElement.disabled = !curtainGroup.focusCamera),
        focusSectionElement.append(resetFocusButtonElement));
    }
    createConfigSection("组合管理").append(
      createElement(
        "p",
        "i3d-note",
        "解除组合仅移除组合关系，恢复两层各自的入口、位置、聚焦视角与图标；不会删除模型或设备。",
      ),
      createButton("解除组合", () => {
        ((structuredClone2.environment.curtainGroups = getCurtainGroupList().filter(
          (remainingGroupProbe) => remainingGroupProbe.id !== curtainGroup.id,
        )),
          (text = curtainGroup.memberIds[0]),
          (selectedCurtainGroupId = ""),
          refreshEditorPreview(),
          renderPanel());
      }),
    );
    for (const lockedControlElement of panelElement.querySelectorAll("input, select, button"))
      (isCameraCommandPending ||
        (isCameraEditing && !lockedControlElement.closest(".i3d-focus-settings"))) &&
        (lockedControlElement.disabled = true);
  }
  function renderExtraControlsSection() {
    const labelListSectionElement = createConfigSection("环境标签列表"),
      labelListRowElement = createConfigRow(labelListSectionElement),
      floorLabelList = getItemList().filter(
        (floorLabelProbe) => floorLabelProbe.floorId === floorSelection,
      ),
      currentFloor = sceneMetadata.floors.find((labelFloor) => labelFloor.id === floorSelection);
    floorLabelList.some((existingLabelProbe) => existingLabelProbe.id === text) ||
      (text = floorLabelList[0]?.id || "");
    const addLabelButtonElement = createButton("添加环境标签", () => {
      if (!currentFloor || !isAccessAllowed) return;
      const newLabelDraft = {
        id: randomUuid2(),
        floorId: currentFloor.id,
        label: "环境标签",
        temperatureEntityId: "",
        humidityEntityId: "",
        ...temperatureHumidityFloorCenter2(currentFloor),
        height: 1.8,
        size: DEFAULT_LABEL_SIZE2,
        iconSize: DEFAULT_LABEL_ICON_SIZE2,
        hitSize: 44,
      };
      (getItemList().push(newLabelDraft),
        (text = newLabelDraft.id),
        renderPanel(),
        refreshEditorPreview());
    });
    ((addLabelButtonElement.className = "primary"),
      (addLabelButtonElement.disabled = !isAccessAllowed),
      labelListRowElement.append(addLabelButtonElement),
      labelListSectionElement.append(
        createElement(
          "p",
          "i3d-note",
          "环境标签是独立信息框，不绑定户型模型，不聚焦，不发送控制指令。",
        ),
      ),
      floorLabelList.length &&
        createSelectRow(
          labelListSectionElement,
          "当前环境标签",
          floorLabelList.map((labelOption) => [labelOption.id, labelOption.label || "环境标签"]),
          text,
          (pickedLabelId) => {
            ((text = pickedLabelId), refreshEditorPreview(), renderPanel());
          },
        ));
    const selectedFloorLabel = floorLabelList.find((matchedLabel) => matchedLabel.id === text);
    if (!selectedFloorLabel) {
      panelElement.append(
        labelListSectionElement,
        createElement("p", "i3d-note", "当前楼层还没有环境标签，请点击“添加环境标签”。"),
      );
      return;
    }
    const groupHiddenClickableCheckbox = createConfigSection("显示内容（含文字）"),
      groupButtonHiddenCheckbox = createElement("input");
    ((groupButtonHiddenCheckbox.value = selectedFloorLabel.label ?? "环境标签"),
      (groupButtonHiddenCheckbox.maxLength = 120),
      groupButtonHiddenCheckbox.addEventListener("change", () => {
        ((selectedFloorLabel.label = groupButtonHiddenCheckbox.value.trim()),
          refreshEditorPreview());
      }),
      createSettingRow(
        groupHiddenClickableCheckbox,
        "名称（留空隐藏）",
        groupButtonHiddenCheckbox,
      ));
    const showMetricNamesCheckboxElement = createElement("input");
    ((showMetricNamesCheckboxElement.type = "checkbox"),
      (showMetricNamesCheckboxElement.checked = selectedFloorLabel.showMetricNames !== false),
      showMetricNamesCheckboxElement.addEventListener("change", () => {
        ((selectedFloorLabel.showMetricNames = showMetricNamesCheckboxElement.checked),
          refreshEditorPreview());
      }),
      createSettingRow(
        groupHiddenClickableCheckbox,
        "显示指标名称",
        showMetricNamesCheckboxElement,
      ),
      groupHiddenClickableCheckbox.append(
        createElement("p", "i3d-note", "关闭后只显示图标、数值和单位。"),
      ));
    const renderEntityBindingRow = ({ key: entityFieldKey, label: entityFieldLabel }) => {
      const entityIdFieldName = entityFieldKey + "EntityId",
        groupSizeDetailsElement = createButton(
          entities.find(
            (catalogEntryProbe) =>
              catalogEntryProbe.entityId === selectedFloorLabel[entityIdFieldName],
          )?.name ||
            selectedFloorLabel[entityIdFieldName] ||
            "选择" + entityFieldLabel + "实体",
          async () => {
            const groupSizeGridElement = ++pickerGeneration;
            errorMessageElement.textContent = "";
            try {
              if (!pickers?.entity) throw new Error("实体选择器尚未准备好，请刷新页面。");
              pickerHandle?.close?.();
              const entity3 = await pickers.entity({
                trigger: groupSizeDetailsElement,
                current: selectedFloorLabel[entityIdFieldName] || "",
                deviceKind: "temperature-humidity",
                domain: entityFieldKey,
                title: "选择" + entityFieldLabel + "实体",
                onSelect(pickedEntityId) {
                  isDisposed ||
                    !isAccessAllowed ||
                    groupSizeGridElement !== pickerGeneration ||
                    !getItemList().includes(selectedFloorLabel) ||
                    ((selectedFloorLabel[entityIdFieldName] = pickedEntityId || ""),
                    refreshEditorPreview(),
                    renderPanel());
                },
              });
              isDisposed || !isAccessAllowed || groupSizeGridElement !== pickerGeneration
                ? entity3?.close()
                : (pickerHandle = entity3);
            } catch (pickedGroupIconSizeValue) {
              isDisposed || (errorMessageElement.textContent = pickedGroupIconSizeValue.message);
            }
          },
        );
      ((groupSizeDetailsElement.className = "i3d-picker-button"),
        createSettingRow(
          groupHiddenClickableCheckbox,
          entityFieldLabel + "实体",
          groupSizeDetailsElement,
        ));
    };
    (renderEntityBindingRow(ENVIRONMENT_BATTERY2),
      groupHiddenClickableCheckbox.append(
        createElement("p", "i3d-note", "电量显示在名称右侧；传感器均可选，未绑定的项目不显示。"),
      ));
    for (const pickedGroupHitSizeValue of ENVIRONMENT_METRICS2)
      renderEntityBindingRow(pickedGroupHitSizeValue);
    const labelPositionSectionElement = createConfigSection("位置与大小"),
      groupPositionGridElement = createElement("div", "i3d-coordinate-grid");
    labelPositionSectionElement.append(groupPositionGridElement);
    for (const [coordinateKey, coordinateLabel, coordinateMin, coordinateMax, coordinateStep] of [
      ["x", "位置 X", -1000000, 1000000, 1],
      ["y", "位置 Y", -1000000, 1000000, 1],
      ["height", "高度（米）", 0, 20, 0.1],
    ])
      createNumberRow(
        groupPositionGridElement,
        coordinateLabel,
        selectedFloorLabel[coordinateKey] ?? 0,
        coordinateMin,
        coordinateMax,
        coordinateStep,
        (pickedGroupCoordinateValue) => {
          ((selectedFloorLabel[coordinateKey] = pickedGroupCoordinateValue),
            refreshEditorPreview());
        },
      );
    renderAirPurifierBindingSection(labelPositionSectionElement, selectedFloorLabel, {
      width: "size",
      font: "iconSize",
      opacity: "opacity",
    });
    const labelBatchSectionElement = createElement(
        "section",
        "navigation-batch-section i3d-light-batch",
      ),
      labelBatchHeadingElement = createElement("h4"),
      targetCountElement = createElement("span"),
      renderEntityList = () =>
        getItemList().filter(
          (sameFloorLabelProbe) =>
            sameFloorLabelProbe !== selectedFloorLabel &&
            sameFloorLabelProbe.floorId === selectedFloorLabel.floorId,
        );
    labelBatchHeadingElement.append(
      createElement("span", "", "环境标签设置一键应用"),
      targetCountElement,
    );
    const applyToLabelGroupButton = createButton("一键应用到其他环境标签", () =>
      openLabelBatchApplyDialog(selectedFloorLabel),
    );
    ((targetCountElement.textContent = renderEntityList().length + " 个同层目标"),
      labelBatchSectionElement.append(labelBatchHeadingElement, applyToLabelGroupButton));
    const manageSectionElement = createConfigSection("绑定管理");
    (manageSectionElement.append(
      createButton("删除此环境标签", () => {
        (setItemList(
          getItemList().filter((otherLabelProbe) => otherLabelProbe.id !== selectedFloorLabel.id),
        ),
          (text = ""),
          refreshEditorPreview(),
          renderPanel());
      }),
    ),
      panelElement.append(
        labelListSectionElement,
        groupHiddenClickableCheckbox,
        labelPositionSectionElement,
        labelBatchSectionElement,
        manageSectionElement,
      ));
  }
  function renderAirPurifierBindingSection(sizeFieldContainer, sizeFieldTarget, sizeFieldOptions) {
    const sizeFieldRowElement = createConfigRow(sizeFieldContainer);
    for (const [
      labelSizeFieldKey,
      labelSizeFieldLabel,
      labelSizeDefaultValue,
      labelSizeMin,
      labelSizeMax,
    ] of [
      [sizeFieldOptions.width, "信息框宽度（px）", DEFAULT_LABEL_SIZE2, MIN_LABEL_SIZE2, MAX_LABEL_SIZE2],
      [sizeFieldOptions.font, "文字大小（px）", DEFAULT_LABEL_ICON_SIZE2, MIN_LABEL_ICON_SIZE2, MAX_LABEL_ICON_SIZE2],
    ])
      createNumberRow(
        sizeFieldRowElement,
        labelSizeFieldLabel,
        sizeFieldTarget[labelSizeFieldKey] ?? labelSizeDefaultValue,
        labelSizeMin,
        labelSizeMax,
        "any",
        (nextSizeFieldValue) => {
          ((sizeFieldTarget[labelSizeFieldKey] = nextSizeFieldValue), refreshEditorPreview());
        },
        "number",
        isTemperatureHumidityMode,
      );
    const layoutRowElement = isTemperatureHumidityMode ? createConfigRow(sizeFieldContainer) : null;
    layoutRowElement &&
      createSelectRow(
        layoutRowElement,
        "排列方式",
        [
          ["0", "自动"],
          ...[1, 2, 3, 4].map((columnCountProbe) => [
            String(columnCountProbe),
            "每行 " + columnCountProbe + " 项",
          ]),
        ],
        String(sizeFieldTarget.columns ?? 0),
        (pickedColumnCount) => {
          ((sizeFieldTarget.columns = Number(pickedColumnCount)), refreshEditorPreview());
        },
      );
    const opacityControlElement = appendBackgroundOpacityControl2(
      sizeFieldContainer,
      sizeFieldTarget,
      sizeFieldOptions.opacity,
      refreshEditorPreview,
    );
    layoutRowElement &&
      (layoutRowElement.append(opacityControlElement.parentElement),
      sizeFieldContainer.append(
        createElement("p", "i3d-note", "自动随宽度排列；固定每行项数时，窄框内容会自动换行适配。"),
      ));
  }
  function openLabelBatchApplyDialog(sourceLabelItem) {
    isDisposed ||
      !isAccessAllowed ||
      auxDialogElement ||
      (auxDialogElement = openBatchApply2({
        title: "应用环境标签设置",
        source: sourceLabelItem,
        targets: getItemList().filter(
          (labelTargetProbe) =>
            labelTargetProbe.id !== sourceLabelItem.id &&
            labelTargetProbe.floorId === sourceLabelItem.floorId,
        ),
        fields: [
          {
            key: "height",
            label: "高度",
            unit: " 米",
            fallback: 1.8,
            optional: true,
            format: (formattedHeightValue) => Number(formattedHeightValue).toFixed(1),
          },
          {
            key: "size",
            label: "信息框宽度",
            unit: " px",
            fallback: DEFAULT_LABEL_SIZE2,
          },
          {
            key: "iconSize",
            label: "文字大小",
            unit: " px",
            fallback: DEFAULT_LABEL_ICON_SIZE2,
          },
          {
            key: "opacity",
            label: "背景不透明度",
            unit: "%",
            fallback: 1,
            format: (opacityPercentValue) => Math.round(opacityPercentValue * 100),
          },
          {
            key: "columns",
            label: "排列方式",
            fallback: 0,
            format: (columnCountText) =>
              columnCountText ? "每行 " + columnCountText + " 项" : "自动",
          },
          {
            key: "showMetricNames",
            label: "显示指标名称",
            fallback: true,
            format: (resetGroupFocusError) => (resetGroupFocusError ? "显示" : "隐藏"),
          },
        ],
        onClose: () => {
          auxDialogElement = null;
        },
        onApply: (appliedTargets, appliedValues) => {
          if (isDisposed || !isAccessAllowed) throw new Error("配置不可用");
          for (const _args of appliedTargets)
            copyBatchFields2(_args, sourceLabelItem, appliedValues);
          (refreshEditorPreview(),
            renderPanel(),
            (saveStatusElement.textContent =
              "已应用到 " + appliedTargets.length + " 个环境标签，待保存配置"));
        },
      }));
  }
  function renderPanel() {
    ((refreshEffectSettings = () => {}),
      (bathEffectEditorHandle = () => {}),
      (redrawBathEffects = () => {}),
      (refreshAirflowStatus = () => {}),
      (renderAirflowSection = () => {}),
      (refreshBatchButtons = () => {}),
      panelElement.replaceChildren());
    let currentContainer = panelElement;
    if (isVacuumShortcutMode) {
      renderVacuumShortcutPanel();
      return;
    }
    if (sceneMetadata) {
      if (
        ((currentContainer = createConfigRow(createConfigSection("配置范围"))),
        createSelectRow(
          currentContainer,
          "配置楼层",
          sceneMetadata.floors.map((floorOptionEntry) => [
            floorOptionEntry.id,
            floorOptionEntry.name,
          ]),
          floorSelection,
          (pickedFloorId) => {
            (pickerGeneration++,
              pickerHandle?.close(),
              (floorSelection = pickedFloorId),
              renderPanel(),
              refreshEditorPreview());
          },
        ),
        isDeviceKind &&
          createSelectRow(
            currentContainer,
            "设备类别",
            [
              ["nas", "NAS"],
              ["television", "电视"],
              ["speaker", "智能音响"],
              ["water-heater", "热水器"],
              ["airer", "晾衣架"],
              ...GENERIC_DEVICE_KINDS2.map((listedGenericKind) => [
                listedGenericKind,
                genericDeviceProfile2(listedGenericKind).label,
              ]),
            ],
            deviceKind,
            (pickedDeviceCategory) => {
              pickedDeviceCategory !== deviceKind && switchEditorKind(pickedDeviceCategory);
            },
          ),
        includes &&
          createSelectRow(
            currentContainer,
            "环境类别",
            [
              ["climate", "空调/浴霸"],
              ["cover", "窗帘"],
              ["fan", "电风扇"],
              ["purifier", "空气净化器"],
              ["temperature-humidity", "环境标签"],
            ],
            deviceKind,
            (pickedEnvironmentCategory) => {
              pickedEnvironmentCategory !== deviceKind &&
                switchEditorKind(pickedEnvironmentCategory);
            },
          ),
        isVacuumMode &&
          createSelectRow(
            currentContainer,
            "配置内容",
            [
              ["vacuum", "设备与地图"],
              ["vacuum-shortcut", "快捷指令"],
            ],
            deviceKind,
            (pickedVacuumCategory) => {
              pickedVacuumCategory !== deviceKind && switchEditorKind(pickedVacuumCategory);
            },
          ),
        isTemperatureHumidityMode)
      ) {
        (renderExtraControlsSection(),
          panelElement.append(errorMessageElement),
          (saveButtonElement.disabled = isSaving || !isAccessAllowed));
        return;
      }
      if (!usesModelBinding && structuredClone2.lightingMode === "region") {
        const rangeSectionElement = createConfigSection("照射范围"),
          rangeEditorButton = createButton("编辑照射范围", async () => {
            if (!isRangeEditorOpen) {
              ((isRangeEditorOpen = true), (rangeEditorButton.disabled = true));
              try {
                const rangeEditorHandle = await openInteraction3dRangeEditor2({
                  component: {
                    ...component,
                    properties: structuredClone(buildRuntimeProperties()),
                  },
                  document: documentApi,
                  states: states,
                  onSave(savedLightRegion) {
                    if (isDisposed || !isAccessAllowed)
                      throw new Error("灯光配置已关闭，请重新打开。");
                    ((structuredClone2.lightRegionOverrides = structuredClone(savedLightRegion)),
                      refreshEditorPreview());
                  },
                  onClose() {
                    ((subEditorHandle = null),
                      (isRangeEditorOpen = false),
                      isDisposed || renderPanel());
                  },
                });
                if (isDisposed || !isAccessAllowed) {
                  rangeEditorHandle.close();
                  return;
                }
                subEditorHandle = rangeEditorHandle;
              } catch (rangeEditorError) {
                ((isRangeEditorOpen = false),
                  isDisposed || (errorMessageElement.textContent = rangeEditorError.message));
              } finally {
                isDisposed || renderPanel();
              }
            }
          });
        if (!rangeEditorButton) return;
        ((rangeEditorButton.dataset ||= {}),
          (rangeEditorButton.dataset.interaction3dRangeEditor = "true"),
          (rangeEditorButton.disabled = isRangeEditorOpen || !structuredClone2.sceneId),
          rangeSectionElement.append(
            rangeEditorButton,
            createElement(
              "p",
              "i3d-note",
              "在独立弹窗中拖动范围；保存范围后，再点击“保存配置”保存到当前控件。",
            ),
          ));
      }
      ((currentContainer = createConfigSection(usesModelBinding ? "模型列表" : "灯光列表")),
        (currentContainer.className += " i3d-compact-list"));
      const lightHeadingElement = createElement("div", "i3d-light-heading"),
        addItemButton = listAddableModels(),
        addEntryButton = createButton("添加" + kindLabel, openAddDialog);
      ((addEntryButton.disabled = !addItemButton.length),
        (lightHeadingElement.className = "i3d-config-list-row"),
        currentContainer.append(lightHeadingElement),
        lightHeadingElement.append(addEntryButton));
      const groupedCurtainModelIdSet = new Set(
          isCoverMode
            ? getCurtainGroupList().flatMap((sceneFloorProbe) => sceneFloorProbe.memberIds)
            : [],
        ),
        floorItems = (
          isCoverMode
            ? [
                ...getCurtainGroupList().map((groupCandidateEntry) => ({
                  ...groupCandidateEntry,
                  id: curtainGroupEntryId2(groupCandidateEntry),
                  label: (groupCandidateEntry.label || "双层窗帘") + "（组合）",
                })),
                ...getItemList().filter(
                  (unboundItemProbe) => !groupedCurtainModelIdSet.has(unboundItemProbe.id),
                ),
              ]
            : getItemList()
        ).filter(
          (optionEntry) =>
            optionEntry.floorId === floorSelection ||
            (usesModelBinding &&
              !sceneMetadata.floors.some(
                (existingFloorItemProbe) => existingFloorItemProbe.id === optionEntry.floorId,
              )),
        ),
        curtainGroupOptions = selectedCurtainGroupId
          ? curtainGroupEntryId2(findCurtainGroupOf(selectedCurtainGroupId))
          : describeGroupFieldValue();
      (!floorItems.some((itemProbe) => itemProbe.id === curtainGroupOptions) &&
        !selectedCurtainGroupId &&
        (text = floorItems[0]?.id || ""),
        floorItems.length &&
          createSelectRow(
            lightHeadingElement,
            isDeviceKind ? "当前设备" : "当前按钮",
            floorItems.map((itemOptionEntry) => [itemOptionEntry.id, itemOptionEntry.label]),
            curtainGroupOptions,
            (pickedItemId) => {
              (pickerGeneration++,
                pickerHandle?.close(),
                (text = pickedItemId),
                (selectedCurtainGroupId = ""),
                refreshEditorPreview(),
                renderPanel());
            },
          ));
      const activeCurtainGroup =
        isCoverMode &&
        getCurtainGroupList().find(
          (curtainGroupProbe) => curtainGroupEntryId2(curtainGroupProbe) === text,
        );
      if (activeCurtainGroup) {
        (renderCurtainGroupSection(activeCurtainGroup),
          panelElement.append(errorMessageElement),
          (saveButtonElement.disabled =
            isSaving || !isAccessAllowed || isCameraEditing || isCameraCommandPending));
        return;
      }
      const vector = getItemList().find((matchedItemProbe) => matchedItemProbe.id === text);
      if (vector) {
        const removeItemButton = createButton(
          isDeviceKind ? "删除此设备" : "删除此" + kindLabel + "按钮",
          () => {
            (pickerGeneration++,
              pickerHandle?.close(),
              setItemList(
                getItemList().filter((removedItemProbe) => removedItemProbe.id !== vector.id),
              ),
              isCoverMode &&
                findCurtainGroupOf(vector.id) &&
                (structuredClone2.environment.curtainGroups = getCurtainGroupList().filter(
                  (groupMemberProbe) => !groupMemberProbe.memberIds.includes(vector.id),
                )),
              (text = ""),
              (selectedCurtainGroupId = ""),
              refreshEditorPreview(),
              renderPanel());
          },
        );
        removeItemButton.className = "i3d-remove-light";
        const matchedCurtainGroup = isCoverMode && findCurtainGroupOf(vector.id);
        (matchedCurtainGroup &&
          createConfigSection("组合成员").append(
            createElement(
              "p",
              "i3d-note",
              "这里只调整成员模型、实体、图标和帘布；入口位置、大小、隐藏方式和聚焦视角由组合统一管理。",
            ),
            createButton("返回组合入口设置", () => {
              ((text = curtainGroupEntryId2(matchedCurtainGroup)),
                (selectedCurtainGroupId = ""),
                refreshEditorPreview(),
                renderPanel());
            }),
          ),
          (currentContainer = createConfigSection("基础绑定")));
        const isBathHeaterMode = deviceKind === "climate" && vector.climateType === "bath-heater",
          isPurifierMode = deviceKind === "purifier",
          isWaterHeaterMode = deviceKind === "water-heater",
          bindingContainer = isBathHeaterMode || isPurifierMode || isWaterHeaterMode;
        (bindingContainer && !vector.entityId && (vector.clickAction = "focus"),
          deviceKind === "climate" &&
            createSelectRow(
              currentContainer,
              "设备类型",
              [
                ["air-conditioner", "空调"],
                ["bath-heater", "浴霸"],
              ],
              vector.climateType || "air-conditioner",
              (pickedClimateType) => {
                ((vector.climateType = pickedClimateType),
                  pickedClimateType === "air-conditioner" &&
                    (vector.entityId?.startsWith("fan.") && (vector.entityId = ""),
                    delete vector.bathEffects,
                    delete vector.deviceId,
                    delete vector.deviceName),
                  refreshEditorPreview(),
                  renderPanel());
              },
            ));
        const bindingRowElement = currentContainer,
          nameRowElement = createConfigRow(bindingRowElement),
          nameInputElement = createElement("input");
        if (
          ((nameInputElement.value = vector.label),
          (nameInputElement.maxLength = 128),
          nameInputElement.addEventListener("change", () => {
            ((vector.label = nameInputElement.value.trim() || kindLabel), refreshEditorPreview());
          }),
          createSettingRow(nameRowElement, "名称", nameInputElement),
          usesModelBinding)
        ) {
          const flatMap2 = sceneMetadata.floors
              .filter((candidateFloorProbe) => candidateFloorProbe.id === floorSelection)
              .flatMap((candidateFloor) =>
                (candidateFloor[collectionKey] || [])
                  .filter(
                    (candidateModel) =>
                      !getItemList().some(
                        (existingModelProbe) =>
                          existingModelProbe !== vector &&
                          existingModelProbe.floorId === candidateFloor.id &&
                          existingModelProbe.modelId === candidateModel.id,
                      ),
                  )
                  .map((modelCandidateEntry) => ({
                    floor: candidateFloor,
                    model: modelCandidateEntry,
                    key: candidateFloor.id + "/" + modelCandidateEntry.id,
                  })),
              ),
            currentModelKey = vector.floorId + "/" + vector.modelId,
            some = flatMap2.some((candidateKeyProbe) => candidateKeyProbe.key === currentModelKey),
            modelSelectOptions = flatMap2.map((modelKeyEntry) => [
              modelKeyEntry.key,
              describeItem(modelKeyEntry.model),
            ]);
          (some || modelSelectOptions.unshift([currentModelKey, "原模型已移除，请重新选择"]),
            createSelectRow(
              nameRowElement,
              "关联" + kindLabel + "模型",
              modelSelectOptions,
              currentModelKey,
              (pickedModelKey) => {
                const matchedModel = flatMap2.find(
                  (matchedModelCandidate) => matchedModelCandidate.key === pickedModelKey,
                );
                !matchedModel ||
                  pickedModelKey === currentModelKey ||
                  ((vector.floorId = matchedModel.floor.id),
                  (vector.modelId = matchedModel.model.id),
                  delete vector.focusCamera,
                  delete vector.followCamera,
                  refreshEditorPreview(),
                  renderPanel());
              },
            ),
            some ||
              currentContainer.append(
                createElement(
                  "p",
                  "i3d-note",
                  "原模型已移除，请重新选择。已保存的实体绑定和按钮设置仍然保留。",
                ),
              ));
        }
        currentContainer = bindingRowElement;
        const deviceIdOfEntity = (entityId) => {
            const boundCatalogEntry = entities.find(
              (catalogProbe) => catalogProbe.entityId === entityId,
            );
            return boundCatalogEntry?.deviceId || boundCatalogEntry?.device_id || "";
          },
          temperatureHumidityPickerKinds = () =>
            vector.deviceId || deviceIdOfEntity(vector.entityId),
          openDeviceChangeDialog = (onConfirm, bodyHint) => {
            const deviceChangeDialogElement = createElement(
              "dialog",
              "settings-dialog i3d-add-dialog i3d-device-change-dialog",
            );
            ((addDialogState = deviceChangeDialogElement),
              deviceChangeDialogElement.setAttribute("aria-label", "更换设备"));
            const deviceChangeHeadingElement = createElement("div", "dialog-heading");
            deviceChangeHeadingElement.append(createElement("h2", "", "更换设备"));
            const deviceChangeBodyElement = createElement("div", "i3d-add-dialog-body", bodyHint),
              deviceChangeActionsElement = createElement("div", "dialog-actions"),
              confirmDeviceChangeButton = createButton("确定更换", () => {
                (closeAddDialog(),
                  !isDisposed && isAccessAllowed && getItemList().includes(vector) && onConfirm());
              });
            ((confirmDeviceChangeButton.className = "primary"),
              deviceChangeActionsElement.append(
                createButton("取消", closeAddDialog),
                confirmDeviceChangeButton,
              ),
              deviceChangeDialogElement.append(
                deviceChangeHeadingElement,
                deviceChangeBodyElement,
                deviceChangeActionsElement,
              ),
              editorDialogElement.append(deviceChangeDialogElement),
              deviceChangeDialogElement.addEventListener("cancel", (deviceChangeCancelEvent) => {
                (deviceChangeCancelEvent.preventDefault(), closeAddDialog());
              }),
              deviceChangeDialogElement.showModal());
          },
          openItemPicker = async (targetField, itemPickerTrigger) => {
            const isEntityField = ++pickerGeneration;
            errorMessageElement.textContent = "";
            try {
              const pickerMethod =
                pickers?.[targetField === "powerEntity" ? "entity" : targetField];
              if (!pickerMethod) throw new Error("选择器尚未准备好，请保存后刷新页面。");
              const itemPickerHandle = await pickerMethod({
                trigger: itemPickerTrigger,
                deviceIcon: defaultIcon,
                deviceKind:
                  targetField === "powerEntity"
                    ? "television-power"
                    : isBathHeaterMode
                      ? "bath-heater"
                      : deviceKind,
                entityFilter:
                  bindingContainer && targetField === "entity" && vector.deviceId
                    ? (deviceIdFilterProbe) =>
                        (deviceIdFilterProbe.deviceId || deviceIdFilterProbe.device_id) ===
                        vector.deviceId
                    : undefined,
                current:
                  targetField === "device"
                    ? bindingContainer
                      ? temperatureHumidityPickerKinds()
                      : vector.deviceId
                    : targetField === "vacuum"
                      ? vector.deviceId
                      : targetField === "powerEntity"
                        ? vector.powerEntityId
                        : targetField === "nas"
                          ? vector.statusSource?.deviceId
                          : targetField === "icon"
                            ? vector.icon
                            : vector.entityId,
                onSelect(pickedDevice, pickedDeviceEntity) {
                  if (!(
                    isDisposed ||
                    !isAccessAllowed ||
                    isEntityField !== pickerGeneration ||
                    !getItemList().includes(vector)
                  )) {
                    if (
                      ((targetField === "entity" || targetField === "powerEntity") &&
                        ((entities = pickers.entityCatalog?.() || entities),
                        pickedDeviceEntity?.entityId === pickedDevice &&
                          (entities = [
                            ...entities.filter(
                              (newCatalogEntryProbe) =>
                                newCatalogEntryProbe.entityId !== pickedDevice,
                            ),
                            pickedDeviceEntity,
                          ])),
                      targetField === "device")
                    ) {
                      const deviceId2 = bindingContainer
                          ? temperatureHumidityPickerKinds()
                          : vector.deviceId,
                        pickedDeviceId = pickedDevice?.deviceId || "",
                        hasBoundExtras =
                          bindingContainer &&
                          !!(
                            vector.entityId ||
                            vector.extraControls?.length ||
                            vector.bathEffects?.length ||
                            vector.airflowEntityId ||
                            vector.workingState ||
                            vector.statusRules
                          ),
                        hasDeviceChanged =
                          deviceId2 !== pickedDeviceId || (!pickedDeviceId && hasBoundExtras),
                        clearDeviceExtras = () => {
                          hasDeviceChanged &&
                            ((vector.extraControls = []),
                            delete vector.bathEffects,
                            delete vector.airflowEntityId,
                            delete vector.workingState,
                            delete vector.statusRules,
                            delete vector.batteryEntityId,
                            delete vector.chargingEntityId,
                            delete vector.chargingStates);
                          const isSameDeviceId =
                            bindingContainer && !!pickedDeviceId && deviceId2 === pickedDeviceId;
                          if (
                            ((vector.deviceId = pickedDevice?.deviceId || ""),
                            (vector.deviceName = pickedDevice?.name || ""),
                            isSameDeviceId || (vector.entityId = ""),
                            pickedDevice &&
                              (map.set(pickedDevice.deviceId, pickedDevice),
                              (entities = [
                                ...entities.filter(
                                  (deviceEntityProbe) =>
                                    (deviceEntityProbe.deviceId || deviceEntityProbe.device_id) !==
                                    pickedDevice.deviceId,
                                ),
                                ...pickedDevice.entities,
                              ])),
                            deviceKind === "smallcar")
                          ) {
                            const defaultCarBinding = standardCarBindings2(
                              deviceEntityCatalog2(
                                entities,
                                vector.deviceId,
                                latestStates || states,
                              ),
                            );
                            for (const carBindingFieldName of [
                              "batteryEntityId",
                              "chargingEntityId",
                            ])
                              vector[carBindingFieldName] ||
                                (vector[carBindingFieldName] =
                                  defaultCarBinding[carBindingFieldName]);
                          }
                          (refreshEditorPreview(), renderPanel());
                        };
                      (deviceId2 || hasBoundExtras) && hasDeviceChanged
                        ? openDeviceChangeDialog(
                            clearDeviceExtras,
                            bindingContainer
                              ? "更换或解绑设备将清空原主实体、附加功能和" +
                                  (isWaterHeaterMode ? "指示灯" : "效果") +
                                  "规则。取消保留原配置，保存后生效。"
                              : "更换或解绑设备将清空弹窗内容及状态灯规则，保存后生效。",
                          )
                        : clearDeviceExtras();
                      return;
                    } else {
                      if (targetField === "vacuum")
                        ((vector.deviceId = pickedDevice?.deviceId || ""),
                          (vector.deviceName = pickedDevice?.name || ""),
                          (vector.entityId =
                            pickedDevice?.entities.length === 1
                              ? pickedDevice.entities[0].entityId
                              : ""),
                          (vector.relatedEntityIds = pickedDevice?.relatedEntityIds || []),
                          (vector.map = {
                            entityId:
                              pickedDevice?.maps.length === 1 ? pickedDevice.maps[0].entityId : "",
                          }),
                          pickedDevice &&
                            ((vector.label = pickedDevice.name),
                            map.set(pickedDevice.deviceId, pickedDevice)));
                      else {
                        if (targetField === "powerEntity")
                          pickedDevice
                            ? (vector.powerEntityId = pickedDevice)
                            : delete vector.powerEntityId;
                        else {
                          if (targetField === "nas") {
                            if (pickedDevice) {
                              if (vector.statusSource?.deviceId === pickedDevice.deviceId) {
                                const metricOrderByEntityId = new Map<string, number>(
                                  vector.statusSource.metrics.map(
                                    (orderedMetricEntry, metricOrderIndex) => [
                                      orderedMetricEntry.entityId,
                                      metricOrderIndex,
                                    ],
                                  ),
                                );
                                pickedDevice.metrics.sort(
                                  (comparedMetricEntry, otherMetricEntry) =>
                                    (metricOrderByEntityId.get(comparedMetricEntry.entityId) ??
                                      Infinity) -
                                    (metricOrderByEntityId.get(otherMetricEntry.entityId) ??
                                      Infinity),
                                );
                              }
                              if (
                                (vector.statusSource?.deviceId === pickedDevice.deviceId &&
                                  Array.isArray(vector.statusSource.groupOrder) &&
                                  (pickedDevice.groupOrder = [...vector.statusSource.groupOrder]),
                                vector.statusSource?.deviceId === pickedDevice.deviceId &&
                                  Array.isArray(vector.statusSource.visibleMetrics))
                              ) {
                                const previouslyVisibleMetricSet = new Set(
                                  vector.statusSource.visibleMetrics,
                                );
                                pickedDevice.visibleMetrics = pickedDevice.metrics
                                  .filter((visibleMetricProbe) =>
                                    previouslyVisibleMetricSet.has(visibleMetricProbe.entityId),
                                  )
                                  .map((visibleMetricEntry) => visibleMetricEntry.entityId);
                              }
                              ((vector.statusSource = pickedDevice),
                                (vector.entityId = ""),
                                (vector.clickAction = "focus-panel"));
                            } else delete vector.statusSource;
                          } else {
                            if (targetField === "icon") vector.icon = pickedDevice;
                            else {
                              if (bindingContainer) {
                                const currentDeviceId = temperatureHumidityPickerKinds(),
                                  nextDeviceId = pickedDevice
                                    ? deviceIdOfEntity(pickedDevice)
                                    : currentDeviceId;
                                if (
                                  pickedDevice &&
                                  vector.deviceId &&
                                  nextDeviceId !== vector.deviceId
                                ) {
                                  errorMessageElement.textContent =
                                    "主实体必须属于已绑定的设备；如需更换，请先更换绑定设备。";
                                  return;
                                }
                                const hasEntityChanged = !!(
                                    pickedDevice &&
                                    pickedDevice !== vector.entityId &&
                                    (!currentDeviceId || currentDeviceId !== nextDeviceId)
                                  ),
                                  applyPickedPurifierEntity = () => {
                                    (hasEntityChanged
                                      ? ((vector.extraControls = []),
                                        delete vector.bathEffects,
                                        delete vector.airflowEntityId,
                                        delete vector.workingState,
                                        delete vector.statusRules,
                                        delete vector.deviceName)
                                      : isBathHeaterMode &&
                                        (vector.bathEffects = (vector.bathEffects || []).filter(
                                          (bathEffectFilterProbe) =>
                                            bathEffectFilterProbe.entityId !== vector.entityId ||
                                            bathEffectFilterProbe.entityId === pickedDevice ||
                                            vector.extraControls?.some(
                                              (keptExtraControlProbe) =>
                                                keptExtraControlProbe.entityId ===
                                                bathEffectFilterProbe.entityId,
                                            ),
                                        )),
                                      !pickedDevice &&
                                        currentDeviceId &&
                                        (vector.deviceId = currentDeviceId),
                                      (vector.entityId = pickedDevice),
                                      isPurifierMode &&
                                        vector.airflowEntityId === pickedDevice &&
                                        delete vector.airflowEntityId,
                                      (vector.extraControls = (vector.extraControls || []).filter(
                                        (removedExtraControlProbe) =>
                                          removedExtraControlProbe.entityId !== pickedDevice,
                                      )),
                                      refreshEditorPreview(),
                                      renderPanel());
                                  };
                                hasEntityChanged &&
                                (vector.extraControls?.length ||
                                  vector.bathEffects?.length ||
                                  vector.airflowEntityId ||
                                  vector.workingState ||
                                  vector.statusRules)
                                  ? openDeviceChangeDialog(
                                      applyPickedPurifierEntity,
                                      "更换为另一台设备的主实体将清空原附加功能和" +
                                        (isWaterHeaterMode ? "指示灯" : "效果") +
                                        "规则。取消保留原配置，保存后生效。",
                                    )
                                  : applyPickedPurifierEntity();
                                return;
                              } else {
                                if (
                                  ["climate", "airer", "fan", "purifier", "water-heater"].includes(
                                    deviceKind,
                                  ) &&
                                  (vector.extraControls?.length ||
                                    vector.workingState ||
                                    vector.statusRules) &&
                                  purifierDeviceChanged2(entities, vector.entityId, pickedDevice)
                                ) {
                                  const purifierChangeDialogElement = createElement(
                                    "dialog",
                                    "settings-dialog i3d-add-dialog i3d-device-change-dialog",
                                  );
                                  ((addDialogState = purifierChangeDialogElement),
                                    purifierChangeDialogElement.setAttribute(
                                      "aria-label",
                                      "更换" + kindLabel + "设备",
                                    ));
                                  const purifierChangeHeadingElement = createElement(
                                    "div",
                                    "dialog-heading",
                                  );
                                  purifierChangeHeadingElement.append(
                                    createElement("h2", "", "更换" + kindLabel + "设备"),
                                  );
                                  const purifierChangeTitleElement = createElement(
                                      "div",
                                      "i3d-add-dialog-body",
                                      "更换设备会清除当前附加功能和指示灯规则，避免使用旧设备状态。取消将保留原绑定；外层保存后才正式生效。",
                                    ),
                                    purifierChangeActionsElement = createElement(
                                      "div",
                                      "dialog-actions",
                                    ),
                                    confirmPurifierChangeButton = createButton("确定更换", () => {
                                      ((vector.entityId = pickedDevice),
                                        (vector.extraControls = []),
                                        delete vector.workingState,
                                        delete vector.statusRules,
                                        closeAddDialog(),
                                        refreshEditorPreview(),
                                        renderPanel());
                                    });
                                  ((confirmPurifierChangeButton.className = "primary"),
                                    purifierChangeActionsElement.append(
                                      createButton("取消", closeAddDialog),
                                      confirmPurifierChangeButton,
                                    ),
                                    purifierChangeDialogElement.append(
                                      purifierChangeHeadingElement,
                                      purifierChangeTitleElement,
                                      purifierChangeActionsElement,
                                    ),
                                    editorDialogElement.append(purifierChangeDialogElement),
                                    purifierChangeDialogElement.addEventListener(
                                      "cancel",
                                      (purifierDialogCancelEvent) => {
                                        (purifierDialogCancelEvent.preventDefault(),
                                          closeAddDialog());
                                      },
                                    ),
                                    purifierChangeDialogElement.showModal());
                                  return;
                                } else
                                  ((vector.entityId = pickedDevice),
                                    [
                                      "climate",
                                      "airer",
                                      "fan",
                                      "purifier",
                                      "water-heater",
                                    ].includes(deviceKind) &&
                                      (vector.extraControls = (vector.extraControls || []).filter(
                                        (otherControlProbe) =>
                                          otherControlProbe.entityId !== pickedDevice,
                                      )));
                              }
                            }
                          }
                        }
                      }
                    }
                    (refreshEditorPreview(), renderPanel());
                  }
                },
              });
              isDisposed || !isAccessAllowed || isEntityField !== pickerGeneration
                ? itemPickerHandle?.close()
                : (pickerHandle = itemPickerHandle);
            } catch (itemPickerError) {
              !isDisposed &&
                isEntityField === pickerGeneration &&
                (errorMessageElement.textContent = itemPickerError.message);
            }
          },
          itemEntityMetadata = entities.find(
            (metadataLookupProbe) => metadataLookupProbe.entityId === vector.entityId,
          );
        if (isNasMode) {
          const nasSourceButton = createButton(
            vector.statusSource?.name || "选择飞牛或群晖",
            () => void openItemPicker("nas", nasSourceButton),
          );
          if (
            ((nasSourceButton.className = "i3d-picker-button"),
            createSettingRow(currentContainer, "NAS 数据来源", nasSourceButton),
            vector.statusSource)
          ) {
            const visibleMetricCount =
                vector.statusSource.visibleMetrics?.length ?? vector.statusSource.metrics.length,
              openMetricsButton = createButton(
                "选择显示内容（" + visibleMetricCount + " 项）",
                () => openMetricsDialog(vector),
              );
            ((openMetricsButton.className = "i3d-picker-button"),
              vector.statusSource.metrics.length && currentContainer.append(openMetricsButton));
          }
          currentContainer.append(
            createElement(
              "p",
              "i3d-note",
              vector.statusSource
                ? vector.statusSource.metrics.length
                  ? "已匹配 " +
                    vector.statusSource.metrics.length +
                    " 项状态。点击数据来源可重新匹配；弹窗只展示状态。"
                  : "已关联 NAS，暂未找到启用的状态指标。请在 Home Assistant 启用指标并同步目录，再点击数据来源重新匹配。"
                : "选择整台 NAS，自动匹配 CPU、内存、温度、存储和网络。无需逐个选择传感器。",
            ),
          );
        }
        const boundEntityPickerButton = createButton(
          "",
          () => void openItemPicker("entity", boundEntityPickerButton),
        );
        if (
          ((boundEntityPickerButton.className = "i3d-picker-button"),
          (boundEntityPickerButton.title =
            vector.entityId || (usesModelBinding ? "选择" + kindLabel + "实体" : "选择灯或开关")),
          boundEntityPickerButton.append(
            createElement(
              "span",
              "",
              itemEntityMetadata?.name ||
                vector.entityId ||
                (usesModelBinding ? "选择" + kindLabel + "实体" : "选择灯或开关"),
            ),
          ),
          !isGenericDeviceMode &&
            !isVacuumMode &&
            !isNasMode &&
            createSettingRow(
              currentContainer,
              bindingContainer ? "主实体（选填）" : "绑定实体",
              boundEntityPickerButton,
            ),
          bindingContainer)
        ) {
          const deviceBindingButton = createButton(
            vector.deviceName ||
              vector.deviceId ||
              (temperatureHumidityPickerKinds()
                ? "跟随主实体所属设备"
                : "选择" +
                  (isWaterHeaterMode ? "热水器" : isPurifierMode ? "净化器" : "浴霸") +
                  "设备"),
            () => void openItemPicker("device", deviceBindingButton),
          );
          ((deviceBindingButton.className = "i3d-picker-button"),
            createSettingRow(currentContainer, "绑定设备", deviceBindingButton),
            currentContainer.append(
              createElement(
                "p",
                "i3d-note",
                isWaterHeaterMode
                  ? "有热水器主实体可直接选择；没有就绑定设备，在附加功能中选择开关、温度、模式和状态。各功能独立控制。"
                  : isPurifierMode
                    ? "有主实体可直接选择；没有就绑定设备，在附加功能中选择开关、模式和状态。各功能独立控制。"
                    : "有标准主实体时可直接选择；没有主实体时，绑定设备并在附加功能中 DIY 暖风、换气和照明等控制。两者同时选择时须属于同一设备。主实体开关只控制主实体。",
              ),
            ));
        }
        if (
          (isSpeakerMode &&
            currentContainer.append(
              createElement(
                "p",
                "i3d-note",
                "绑定 media_player 后，播放、音量、进度和媒体库等控制按实体能力自动显示。播放时顶部彩色呼吸，暂停时微亮，空闲或离线时熄灭。",
              ),
            ),
          isGenericDeviceMode)
        ) {
          const devicePickerButtonElement = createButton(
            vector.deviceName || "选择设备",
            () => void openItemPicker("device", devicePickerButtonElement),
          );
          if (
            ((devicePickerButtonElement.className = "i3d-picker-button"),
            createSettingRow(currentContainer, "绑定设备", devicePickerButtonElement),
            genericDeviceProfile2(deviceKind).statusIndicator !== false)
          ) {
            const statusLightSectionElement = createConfigSection("状态灯（可选）");
            renderStatusRuleSection(statusLightSectionElement, vector);
          } else delete vector.statusRules;
        }
        if (deviceKind === "smallcar") {
          const carStatusSectionElement = createConfigSection("车辆状态"),
            carEntityCatalog = deviceEntityCatalog2(
              entities,
              vector.deviceId,
              latestStates || states,
            );
          for (const [carBindingField, carBindingLabel, carBindingDomains] of [
            ["batteryEntityId", "电量实体（%）", ["sensor"]],
            ["chargingEntityId", "充电状态实体", ["binary_sensor", "sensor"]],
          ] as [string, string, string[]][]) {
            const carBindingOptions = carEntityCatalog
              .filter(
                (carEntityProbe) =>
                  carBindingDomains.includes(carEntityProbe.entityId.split(".")[0]) &&
                  carEntityProbe.enabled !== false &&
                  !["missing", "disabled"].includes(carEntityProbe.status),
              )
              .map((carEntityOptionEntry) => [
                carEntityOptionEntry.entityId,
                (carEntityOptionEntry.name || carEntityOptionEntry.entityId) +
                  " · " +
                  carEntityOptionEntry.entityId,
              ]);
            (vector[carBindingField] &&
              !carBindingOptions.some(
                ([carOptionEntityId]) => carOptionEntityId === vector[carBindingField],
              ) &&
              carBindingOptions.unshift([
                vector[carBindingField],
                vector[carBindingField] + "（失效或不属于当前设备）",
              ]),
              createSelectRow(
                carStatusSectionElement,
                carBindingLabel,
                [["", "未绑定"], ...carBindingOptions],
                vector[carBindingField] || "",
                (pickedCarEntityId) => {
                  ((vector[carBindingField] = pickedCarEntityId),
                    carBindingField === "chargingEntityId" && delete vector.chargingStates,
                    refreshEditorPreview(),
                    renderPanel());
                },
              ));
          }
          const carRawStatusElement = createElement("p", "i3d-note i3d-car-raw-state");
          (carRawStatusElement.setAttribute("aria-live", "polite"),
            carStatusSectionElement.append(carRawStatusElement));
          const chargingSettingsElement = createElement("details", "i3d-car-charging-settings");
          ((chargingSettingsElement.open = !!vector.chargingStates),
            chargingSettingsElement.append(createElement("summary", "", "自定义充电识别（可选）")),
            chargingSettingsElement.append(
              createElement(
                "p",
                "i3d-note",
                "在 HA 中查看充电状态实体，充电和不充电时显示什么文字，就分别填入对应输入框。两项都留空则自动识别。",
              ),
            ));
          const chargingInputsByKey: Record<string, HTMLInputElement> = {},
            chargingErrorElement = createElement("p", "i3d-error");
          chargingErrorElement.setAttribute("role", "status");
          const chargingSummaryElement = createElement("p", "i3d-note");
          for (const [chargingFieldKey, chargingFieldLabel, chargingFieldHint] of [
            ["inactive", "不充电状态值", "填写不充电时的文字"],
            ["active", "充电状态值", "填写充电时的文字"],
          ]) {
            const chargingValueInputElement = createElement("input");
            ((chargingValueInputElement.type = "text"),
              (chargingValueInputElement.maxLength = 120),
              (chargingValueInputElement.placeholder = chargingFieldHint),
              chargingValueInputElement.setAttribute("aria-label", chargingFieldLabel),
              (chargingValueInputElement.value =
                typeof vector.chargingStates?.[chargingFieldKey] == "string"
                  ? vector.chargingStates[chargingFieldKey]
                  : ""),
              (chargingValueInputElement.disabled = !vector.chargingEntityId),
              (chargingInputsByKey[chargingFieldKey] = chargingValueInputElement),
              createSettingRow(
                chargingSettingsElement,
                chargingFieldLabel,
                chargingValueInputElement,
              ),
              chargingValueInputElement.addEventListener("input", () => {
                const chargingValueDraft = {
                  inactive: chargingInputsByKey.inactive.value.trim(),
                  active: chargingInputsByKey.active.value.trim(),
                };
                (chargingValueDraft.active || chargingValueDraft.inactive
                  ? (vector.chargingStates = chargingValueDraft)
                  : delete vector.chargingStates,
                  (chargingErrorElement.textContent = vector.chargingStates
                    ? carChargingMappingError2(chargingValueDraft)
                    : ""));
                for (const chargingInputElement of Object.values(chargingInputsByKey))
                  chargingInputElement.setCustomValidity(chargingErrorElement.textContent);
                (refreshEditorPreview(), refreshEffectSettings());
              }));
          }
          (chargingSettingsElement.append(chargingErrorElement, chargingSummaryElement),
            carStatusSectionElement.append(chargingSettingsElement),
            (refreshEffectSettings = () => {
              const carStatusSnapshot = carState2(vector, latestStates || states),
                carRawStatusText = vector.chargingEntityId
                  ? carStatusSnapshot.chargingRaw
                    ? "当前原始状态：" + carStatusSnapshot.chargingRaw
                    : "当前原始状态：" + carStatusSnapshot.status + "，请等待实体恢复后再填写。"
                  : "当前原始状态：请先选择充电状态实体。";
              carRawStatusElement.textContent !== carRawStatusText &&
                (carRawStatusElement.textContent = carRawStatusText);
              const carChargingStatusText =
                "当前识别：" +
                (carStatusSnapshot.charging === true
                  ? "充电中"
                  : carStatusSnapshot.charging === false
                    ? "不充电"
                    : "未匹配") +
                "。";
              chargingSummaryElement.textContent !== carChargingStatusText &&
                (chargingSummaryElement.textContent = carChargingStatusText);
            }),
            refreshEffectSettings());
          const carStatusCardSectionElement = createConfigSection("汽车状态卡片");
          renderAirPurifierBindingSection(carStatusCardSectionElement, vector, {
            width: "cardWidth",
            font: "cardFontSize",
            opacity: "cardOpacity",
          });
        }
        if (isAirerMode) {
          currentContainer.append(
            createElement(
              "p",
              "i3d-note",
              "顶部安装高度和最大伸展距离在户型图中调整。100%为最高，0%为最低；模型跟随设备反馈。",
            ),
          );
          const carEntityInputElement = createElement("input");
          ((carEntityInputElement.type = "number"),
            (carEntityInputElement.min = "5"),
            (carEntityInputElement.max = "180"),
            (carEntityInputElement.step = "1"),
            (carEntityInputElement.value = String(vector.travelSeconds || 20)),
            carEntityInputElement.addEventListener("change", () => {
              ((vector.travelSeconds = Math.max(
                5,
                Math.min(180, Number(carEntityInputElement.value) || 20),
              )),
                refreshEditorPreview());
            }),
            createSettingRow(
              currentContainer,
              "无位置回传时全程耗时（秒）",
              carEntityInputElement,
            ));
        }
        if (deviceKind === "water-heater") {
          const statusRuleSectionElement = createConfigSection("指示灯规则（可选）"),
            curtainMemberGroup = temperatureHumidityPickerKinds();
          (renderStatusRuleSection(statusRuleSectionElement, vector, {
            deviceId: curtainMemberGroup,
            standardOnly: true,
          }),
            curtainMemberGroup ||
              statusRuleSectionElement.append(
                createElement(
                  "p",
                  "i3d-note",
                  vector.entityId
                    ? "当前实体没有可用的 HA 设备归属，请同步设备目录后重新打开配置，或更换绑定实体。"
                    : "先选择主实体或绑定设备，再选择指示灯状态。",
                ),
              ));
        }
        if (
          ["climate", "airer", "fan", "purifier", "water-heater"].includes(deviceKind) ||
          (isGenericDeviceMode && deviceKind !== "smallcar")
        ) {
          let syncExtraControlState = function () {
            const selectedControlEntityIdSet = new Set(
              (vector.extraControls || []).map(
                (extraControlEntityProbe) => extraControlEntityProbe.entityId,
              ),
            );
            extraControlsDetailsElement.querySelector("summary").textContent =
              "选择附加功能（已选 " + selectedControlEntityIdSet.size + "/12）";
            for (const [
              optionControlEntityId,
              { check: extraControlCheckboxElement, disabled: isExtraControlDisabled },
            ] of extraControlsByEntityId)
              ((extraControlCheckboxElement.checked =
                selectedControlEntityIdSet.has(optionControlEntityId)),
                (extraControlCheckboxElement.disabled =
                  !extraControlCheckboxElement.checked &&
                  (isExtraControlDisabled || selectedControlEntityIdSet.size >= 12)));
          };
          const boundMeterEntityId = vector.extraControls || [];
          currentContainer = createConfigSection("附加功能");
          const relatedEntityCatalog =
              isGenericDeviceMode || bindingContainer
                ? deviceEntityCatalog2(
                    entities,
                    vector.deviceId ||
                      itemEntityMetadata?.deviceId ||
                      itemEntityMetadata?.device_id,
                    latestStates || states,
                  ).filter((otherEntityProbe) => otherEntityProbe.entityId !== vector.entityId)
                : purifierRelatedEntities2(entities, vector.entityId),
            deviceId3 =
              isGenericDeviceMode || bindingContainer
                ? vector.deviceId || itemEntityMetadata?.deviceId || itemEntityMetadata?.device_id
                : itemEntityMetadata?.deviceId || itemEntityMetadata?.device_id,
            previewDevicePanel = async () => {
              try {
                await editorRuntime?.focusCommand("preview-device-panel", vector.id);
              } catch (meterMetadataProbe) {
                isDisposed || (errorMessageElement.textContent = meterMetadataProbe.message);
              }
            },
            previewDeviceButton = createButton("实时预览弹窗", previewDevicePanel);
          currentContainer.append(
            previewDeviceButton,
            createElement(
              "p",
              "i3d-note",
              "仅选择当前设备的附加实体，最多 12 项。预览随修改实时更新，不发送设备指令；保存后正式生效。",
            ),
          );
          const extraControlsDetailsElement = createElement("details");
          extraControlsDetailsElement.append(
            createElement(
              "summary",
              "",
              "选择附加功能（已选 " + boundMeterEntityId.length + "/12）",
            ),
          );
          const extraSearchInputElement = createElement("input");
          ((extraSearchInputElement.placeholder = "搜索本设备实体名称或 ID"),
            extraSearchInputElement.setAttribute("aria-label", "搜索附加实体"));
          const extraControlListElement = createElement("div", "i3d-extra-entity-list"),
            extraControlsByEntityId = new Map(),
            renderExtraControlList = () => {
              (extraControlListElement.replaceChildren(), extraControlsByEntityId.clear());
              const lowerCase = extraSearchInputElement.value.trim().toLowerCase(),
                staleExtraControlList = (vector.extraControls || [])
                  .filter(
                    (extraControlProbe) =>
                      !relatedEntityCatalog.some(
                        (knownCatalogProbe) =>
                          knownCatalogProbe.entityId === extraControlProbe.entityId,
                      ),
                  )
                  .map((staleExtraControlEntry) => ({
                    entityId: staleExtraControlEntry.entityId,
                    name: "已失效或不属于当前设备",
                    status: "missing",
                  })),
                visibleExtraControlList = [
                  ...relatedEntityCatalog,
                  ...staleExtraControlList,
                ].filter((visibleControlProbe) =>
                  ((visibleControlProbe.name || "") + " " + visibleControlProbe.entityId)
                    .toLowerCase()
                    .includes(lowerCase),
                );
              visibleExtraControlList.length ||
                extraControlListElement.append(
                  createElement(
                    "p",
                    "i3d-note",
                    deviceId3
                      ? lowerCase
                        ? "没有匹配的实体。"
                        : "该设备没有其他实体。"
                      : isGenericDeviceMode || bindingContainer
                        ? "请先绑定设备，再选择弹窗内容。"
                        : "主实体没有设备关联，无法获取所属设备实体。",
                  ),
                );
              for (const extraCandidateEntity of visibleExtraControlList) {
                const some2 = (vector.extraControls || []).some(
                    (extraControlMatchProbe) =>
                      extraControlMatchProbe.entityId === extraCandidateEntity.entityId,
                  ),
                  isExtraEntityDisabled = !!(
                    extraCandidateEntity.disabledBy ||
                    extraCandidateEntity.disabled_by ||
                    extraCandidateEntity.enabled === false ||
                    ["disabled", "missing"].includes(extraCandidateEntity.status)
                  ),
                  extraEntityState =
                    latestStates?.[extraCandidateEntity.entityId] ||
                    states?.get?.(extraCandidateEntity.entityId) ||
                    states?.[extraCandidateEntity.entityId],
                  extraEntitySnapshot = extraEntityState?.newState || extraEntityState,
                  extraEntityRowElement = createElement("label", "i3d-extra-entity-row"),
                  extraEntityCheckboxElement = createElement("input");
                ((extraEntityCheckboxElement.type = "checkbox"),
                  (extraEntityCheckboxElement.checked = some2),
                  (extraEntityCheckboxElement.disabled =
                    !some2 && (isExtraEntityDisabled || (vector.extraControls || []).length >= 12)),
                  extraControlsByEntityId.set(extraCandidateEntity.entityId, {
                    check: extraEntityCheckboxElement,
                    disabled: isExtraEntityDisabled,
                  }));
                const extraEntityDetailElement = createElement("span");
                ((extraEntityDetailElement.title =
                  (extraCandidateEntity.name || extraCandidateEntity.entityId) +
                  "\n" +
                  extraCandidateEntity.entityId),
                  extraEntityDetailElement.append(
                    createElement(
                      "strong",
                      "",
                      extraCandidateEntity.name || extraCandidateEntity.entityId,
                    ),
                    createElement("small", "", extraCandidateEntity.entityId),
                    createElement(
                      "small",
                      "",
                      extraLabels2[extraTypes2(extraCandidateEntity.entityId)[0]] +
                        " · " +
                        (isExtraEntityDisabled
                          ? "已禁用或移除"
                          : extraEntitySnapshot?.state || "暂无状态"),
                    ),
                  ),
                  extraEntityCheckboxElement.addEventListener("change", () => {
                    const currentExtraControls = vector.extraControls || [];
                    ((vector.extraControls = extraEntityCheckboxElement.checked
                      ? [
                          ...currentExtraControls,
                          {
                            entityId: extraCandidateEntity.entityId,
                            type: extraTypes2(extraCandidateEntity.entityId)[0],
                            label: "",
                          },
                        ]
                      : currentExtraControls.filter(
                          (removedControlProbe) =>
                            removedControlProbe.entityId !== extraCandidateEntity.entityId,
                        )),
                      !extraEntityCheckboxElement.checked &&
                        isPurifierMode &&
                        vector.airflowEntityId === extraCandidateEntity.entityId &&
                        delete vector.airflowEntityId,
                      !extraEntityCheckboxElement.checked &&
                        isBathHeaterMode &&
                        (vector.bathEffects = (vector.bathEffects || []).filter(
                          (removedBathEffectProbe) =>
                            removedBathEffectProbe.entityId !== extraCandidateEntity.entityId,
                        )),
                      refreshEditorPreview(),
                      syncExtraControlState(),
                      previewDevicePanel(),
                      isBathHeaterMode && redrawBathEffects(),
                      isPurifierMode && renderAirflowSection());
                  }),
                  extraEntityRowElement.append(
                    extraEntityCheckboxElement,
                    extraEntityDetailElement,
                  ),
                  extraControlListElement.append(extraEntityRowElement));
              }
            };
          ((extraControlsDetailsElement.className = "i3d-extra-chooser"),
            extraSearchInputElement.addEventListener("input", renderExtraControlList),
            renderExtraControlList(),
            extraControlsDetailsElement.append(extraSearchInputElement, extraControlListElement),
            currentContainer.append(extraControlsDetailsElement),
            extraControlsDetailsElement.addEventListener("toggle", () => {
              extraControlsDetailsElement.open && previewDevicePanel();
            }));
        }
        if (isBathHeaterMode) {
          const bathAirflowSectionElement = createConfigSection("出风动画"),
            bathEffectHostElement = createElement("div");
          (bathAirflowSectionElement.append(bathEffectHostElement),
            (redrawBathEffects = () => {
              (bathEffectHostElement.replaceChildren(),
                (bathEffectEditorHandle = bathEffectEditor2({
                  item: vector,
                  entities: entities,
                  states: () => latestStates || states,
                  host: bathEffectHostElement,
                  node: createElement,
                  select: createSelectRow,
                  update: refreshEditorPreview,
                  redraw: redrawBathEffects,
                })));
            }),
            redrawBathEffects());
        }
        if (isPurifierMode) {
          const purifierAirflowSectionElement = createConfigSection("出风动画");
          ((renderAirflowSection = () => {
            (purifierAirflowSectionElement.replaceChildren(createElement("h4", "", "出风动画")),
              purifierAirflowSectionElement.append(
                createElement(
                  "p",
                  "i3d-note",
                  "有主实体时默认自动跟随。DIY 选择运行开关，开启就出风，关闭就停止。",
                ),
              ));
            const controlEntityIdSet = new Set(
                (vector.extraControls || []).map(
                  (controlEntityProbe) => controlEntityProbe.entityId,
                ),
              ),
              airflowOptions = entities
                .filter(
                  (airflowCandidateProbe) =>
                    controlEntityIdSet.has(airflowCandidateProbe.entityId) &&
                    /^(switch|fan|binary_sensor|input_boolean)\./.test(
                      airflowCandidateProbe.entityId,
                    ),
                )
                .map((airflowOptionEntry) => [
                  airflowOptionEntry.entityId,
                  airflowOptionEntry.name || airflowOptionEntry.entityId,
                ]);
            (vector.airflowEntityId &&
              !airflowOptions.some(
                ([airflowOptionEntityId]) => airflowOptionEntityId === vector.airflowEntityId,
              ) &&
              airflowOptions.unshift([
                vector.airflowEntityId,
                vector.airflowEntityId + "（当前不可用）",
              ]),
              createSelectRow(
                purifierAirflowSectionElement,
                "出风跟随",
                [["", vector.entityId ? "主实体（自动）" : "请选择运行开关"], ...airflowOptions],
                vector.airflowEntityId || "",
                (pickedAirflowEntityId) => {
                  (pickedAirflowEntityId
                    ? (vector.airflowEntityId = pickedAirflowEntityId)
                    : delete vector.airflowEntityId,
                    refreshEditorPreview(),
                    refreshAirflowStatus());
                },
              ));
            const airflowStatusElement = createElement("p", "i3d-note");
            (purifierAirflowSectionElement.append(airflowStatusElement),
              (refreshAirflowStatus = () => {
                const purifierStatus = purifierState2(vector, latestStates || states);
                airflowStatusElement.textContent =
                  "出风状态：" +
                  (purifierStatus.available
                    ? purifierStatus.running
                      ? "出风中"
                      : "已停止"
                    : "状态未知");
              }),
              refreshAirflowStatus());
          }),
            renderAirflowSection());
        }
        if (isCoverMode) {
          if (!matchedCurtainGroup) {
            const combineCurtainButton = createButton("组合另一扇窗帘", () =>
              openCurtainGroupDialog(vector),
            );
            ((combineCurtainButton.disabled = !curtainGroupCandidates2(
              structuredClone2.environment,
              vector.id,
            ).length),
              currentContainer.append(
                combineCurtainButton,
                createElement(
                  "p",
                  "i3d-note",
                  "选择同楼层另一扇普通窗帘；仅组合入口与弹窗，保留两层模型和设备绑定。",
                ),
              ));
          }
          currentContainer = createConfigSection("帘布外观");
          const partnerCandidates = createConfigRow(currentContainer),
            curtainKindSelect = createSelectRow(
              partnerCandidates,
              "窗帘类型",
              [
                ["standard", "普通窗帘"],
                ["roller", "卷帘"],
                ["dream", "梦幻帘"],
              ],
              vector.coverKind,
              (pickedCurtainKind) => {
                ((vector.coverKind = ["dream", "roller"].includes(pickedCurtainKind)
                  ? pickedCurtainKind
                  : "standard"),
                  (vector.coverKindOverride = true),
                  refreshEditorPreview(),
                  renderPanel());
              },
            );
          ((curtainKindSelect.disabled = !!matchedCurtainGroup),
            matchedCurtainGroup && (curtainKindSelect.title = "请先解除组合，再切换为梦幻帘"));
          const vacuumDeviceRowElement = createConfigRow(currentContainer),
            curtainFabricRowElement = sceneMetadata.floors
              .find((pickedCurtainFabric) => pickedCurtainFabric.id === vector.floorId)
              ?.curtains?.find((vacuumEntityProbe) => vacuumEntityProbe.id === vector.modelId),
            curtainFabricSelect = createSelectRow(
              vacuumDeviceRowElement,
              "帘布类型",
              [
                ["cloth", "布帘"],
                ["sheer", "纱帘"],
              ],
              vector.curtainFabricOverride === true
                ? vector.curtainFabric
                : curtainFabricRowElement?.curtainFabric || vector.curtainFabric,
              (mapEntityProbe) => {
                ((vector.curtainFabric = mapEntityProbe === "sheer" ? "sheer" : "cloth"),
                  (vector.curtainFabricOverride = true),
                  refreshEditorPreview());
              },
            );
          curtainFabricSelect.title = "仅修改当前3D交互的帘布，不改变户型模型或2D导图";
          const coverKind =
            vector.coverKindOverride === true
              ? vector.coverKind
              : curtainFabricRowElement?.curtainForm === "roller"
                ? "roller"
                : vector.coverKind;
          curtainKindSelect.value = coverKind;
          const isRollerCover = coverKind === "roller";
          if (
            (!isRollerCover &&
              curtainFabricRowElement?.curtainTrack &&
              curtainFabricRowElement.curtainTrack !== "straight" &&
              currentContainer.append(
                createElement(
                  "p",
                  "i3d-note",
                  (curtainFabricRowElement.curtainTrack === "u" ? "U" : "L") +
                    " 型轨道，尺寸和合拢位置继承户型模型。",
                ),
              ),
            isRollerCover &&
              currentContainer.append(
                createElement(
                  "p",
                  "i3d-note",
                  "卷帘垂直升降，0% 完全放下、100% 完全卷起；控制沿用普通窗帘。",
                ),
              ),
            isRollerCover ||
              createSelectRow(
                vacuumDeviceRowElement,
                "开合方向",
                [
                  ["auto", "继承模型"],
                  ["left", "向左收拢"],
                  ["right", "向右收拢"],
                  ["split", "双向收拢"],
                ],
                vector.coverDirection,
                (deviceEntityOption) => {
                  ((vector.coverDirection = ["left", "right", "split"].includes(deviceEntityOption)
                    ? deviceEntityOption
                    : "auto"),
                    refreshEditorPreview());
                },
              ),
            vector.entityId)
          )
            currentContainer.append(
              createElement(
                "p",
                "i3d-note",
                "开合状态跟随绑定实体；解除绑定后恢复预设的展示状态。",
              ),
            );
          else {
            const unboundPositionOptions = [
              ["0", "关闭"],
              ["50", "半开"],
              ["100", "全开"],
            ];
            ([0, 50, 100].includes(vector.unboundPosition) ||
              unboundPositionOptions.push([
                String(vector.unboundPosition),
                "打开 " + vector.unboundPosition + "%",
              ]),
              createSelectRow(
                currentContainer,
                "未绑定时显示",
                unboundPositionOptions,
                String(vector.unboundPosition),
                (pickedUnboundPosition) => {
                  ((vector.unboundPosition = Number(pickedUnboundPosition)),
                    refreshEditorPreview());
                },
              ),
              currentContainer.append(
                createElement(
                  "p",
                  "i3d-note",
                  "仅设置 3D 帘布的展示状态；绑定实体后自动跟随实际开合。",
                ),
              ));
          }
        }
        if (isVacuumMode) {
          const vacuumDeviceButton = createButton(
            vector.deviceName || "选择扫地机设备",
            () => void openItemPicker("vacuum", vacuumDeviceButton),
          );
          ((vacuumDeviceButton.className = "i3d-picker-button"),
            createSettingRow(currentContainer, "绑定设备", vacuumDeviceButton));
          const cachedDeviceEntry = map.get(vector.deviceId) || {
            entities: entities.filter(
              (vacuumShortcutProbe) =>
                /^vacuum\./.test(vacuumShortcutProbe.entityId) &&
                (vacuumShortcutProbe.deviceId === vector.deviceId ||
                  vacuumShortcutProbe.entityId === vector.deviceId),
            ),
            maps: entities.filter(
              (shortcutEntityProbe) =>
                /^(camera|image)\./.test(shortcutEntityProbe.entityId) &&
                shortcutEntityProbe.deviceId === vector.deviceId,
            ),
          };
          (cachedDeviceEntry?.entities.length > 1
            ? createSelectRow(
                currentContainer,
                "扫地机主实体",
                [
                  ["", "请选择主实体"],
                  ...cachedDeviceEntry.entities.map((vacuumEntityOption) => [
                    vacuumEntityOption.entityId,
                    vacuumEntityOption.name || vacuumEntityOption.entityId,
                  ]),
                ],
                vector.entityId,
                (pickedMainEntity) => {
                  ((vector.entityId = pickedMainEntity), refreshEditorPreview());
                },
              )
            : vector.entityId &&
              currentContainer.append(createElement("p", "i3d-note", "已识别：" + vector.entityId)),
            (currentContainer = createConfigSection("地图与移动")));
          const followOffsetInput = createElement("input");
          (Object.assign(followOffsetInput, {
            type: "number",
            min: "0",
            max: "300",
            step: "1",
            value: String(structuredClone2.navigation?.followOffset ?? 16),
            title: "所有扫地机共用此标签偏移",
          }),
            followOffsetInput.addEventListener("change", () => {
              if (!isAccessAllowed || isDisposed) return;
              const NaN5 =
                followOffsetInput.value.trim() === "" ? NaN : Number(followOffsetInput.value);
              (Number.isFinite(NaN5) &&
                ((structuredClone2.navigation = {
                  ...structuredClone2.navigation,
                  followOffset: Math.max(0, Math.min(300, NaN5)),
                }),
                refreshEditorPreview()),
                (followOffsetInput.value = String(
                  structuredClone2.navigation?.followOffset ?? 16,
                )));
            }),
            createSettingRow(currentContainer, "跟随标签上移（px）", followOffsetInput));
          for (const [vacuumToggleKey, vacuumToggleLabel] of [
            ["motionEnabled", "跟随真实位置移动"],
            ["funMessages", "工作时显示趣味短句"],
          ]) {
            const vacuumToggleCheckbox = createElement("input");
            (Object.assign(vacuumToggleCheckbox, {
              type: "checkbox",
              checked: vector[vacuumToggleKey] !== false,
            }),
              vacuumToggleCheckbox.addEventListener("change", () => {
                ((vector[vacuumToggleKey] = vacuumToggleCheckbox.checked), refreshEditorPreview());
              }),
              createSettingRow(currentContainer, vacuumToggleLabel, vacuumToggleCheckbox));
          }
          cachedDeviceEntry?.maps.length > 1 &&
            createSelectRow(
              currentContainer,
              "已识别的地图",
              [
                ["", "请选择地图"],
                ...cachedDeviceEntry.maps.map((mapOptionEntry) => [
                  mapOptionEntry.entityId,
                  mapOptionEntry.name || mapOptionEntry.entityId,
                ]),
              ],
              vector.map?.entityId || "",
              (pickedMapEntityId) => {
                ((vector.map = {
                  ...vector.map,
                  entityId: pickedMapEntityId,
                }),
                  refreshEditorPreview(),
                  renderPanel());
              },
            );
          const mapPickerButton = createButton(
            vector.map?.entityId || "选择扫地机地图",
            async () => {
              const mapPickerGeneration = ++pickerGeneration;
              try {
                pickerHandle = await pickers.entity({
                  trigger: mapPickerButton,
                  deviceKind: "vacuum-map",
                  current: vector.map?.entityId || "",
                  onSelect(pickedMapEntity) {
                    isDisposed ||
                      !isAccessAllowed ||
                      mapPickerGeneration !== pickerGeneration ||
                      !getItemList().includes(vector) ||
                      ((vector.map = {
                        ...vector.map,
                        entityId: pickedMapEntity,
                      }),
                      refreshEditorPreview(),
                      renderPanel());
                  },
                });
              } catch (mapPickerError) {
                errorMessageElement.textContent = mapPickerError.message;
              }
            },
          );
          ((mapPickerButton.className = "i3d-picker-button"),
            createSettingRow(currentContainer, "地图来源", mapPickerButton));
          const alignMapButton = createButton("底图对齐", () => {
            const mapEntityState =
                latestStates === null
                  ? states?.get?.(vector.map?.entityId)
                  : latestStates[vector.map?.entityId],
              itemEntityState =
                latestStates === null
                  ? states?.get?.(vector.entityId)
                  : latestStates[vector.entityId],
              mapIdentity = vacuumMapIdentity2(mapEntityState, itemEntityState),
              editableItemForMapEditor = {
                ...vector,
                map: {
                  ...vector.map,
                },
              };
            (mapIdentity
              ? (editableItemForMapEditor.map.sourceMapId = mapIdentity)
              : delete editableItemForMapEditor.map.sourceMapId,
              (subEditorHandle = openVacuumMapEditor2({
                item: editableItemForMapEditor,
                floor: sceneMetadata.floors.find(
                  (mapFloorProbe) => mapFloorProbe.id === vector.floorId,
                ),
                getMapState: () =>
                  latestStates === null
                    ? states?.get?.(vector.map?.entityId)
                    : latestStates[vector.map?.entityId],
                onSave(savedMapRecord) {
                  !isDisposed &&
                    isAccessAllowed &&
                    getItemList().includes(vector) &&
                    ((vector.map = savedMapRecord.map), refreshEditorPreview(), renderPanel());
                },
              })));
          });
          currentContainer.append(alignMapButton);
        }
        if (isTelevisionMode) {
          const powerEntityButton = createButton(
            vector.powerEntityId || "不单独绑定",
            () => void openItemPicker("powerEntity", powerEntityButton),
          );
          ((powerEntityButton.className = "i3d-picker-button"),
            createSettingRow(currentContainer, "电视电源实体（可选）", powerEntityButton),
            currentContainer.append(
              createElement(
                "p",
                "i3d-note",
                "可绑定任意能提供开关状态的实体：开启显示 HOMEOS 海报，关闭黑屏。上方绑定媒体播放器后，有节目封面时优先显示封面；不单独绑定电源时，跟随媒体播放器的开关状态。",
              ),
            ));
        }
        if (
          isNasMode &&
            currentContainer.append(
              createElement(
                "p",
                "i3d-note",
                vector.statusSource
                  ? "已选择 NAS 自身状态数据作为呼吸灯依据。安全状态只用于告警。"
                  : "请先选择 NAS 数据来源，缺少 CPU 等个别指标也可绑定。",
              ),
            ),
          !matchedCurtainGroup && deviceKind !== "smallcar"
        ) {
          ((currentContainer = createConfigSection("交互行为")),
            createSelectRow(
              currentContainer,
              "点击" + kindLabel,
              bindingContainer && !vector.entityId
                ? [["focus", "聚焦并显示控制"]]
                : isAirerMode
                  ? [
                      ["focus", "聚焦并显示控制"],
                      ["panel", "仅显示控制"],
                    ]
                  : isSpeakerMode
                    ? [
                        ["focus-panel", "聚焦并显示控制"],
                        ["panel", "仅显示控制"],
                        ["focus", "仅聚焦"],
                      ]
                    : isTelevisionMode
                      ? [
                          ["focus-panel", "聚焦并显示控制"],
                          ["panel", "仅显示控制"],
                          ["focus", "仅聚焦"],
                          ["turn-on-focus", "开关电视（开机时聚焦）"],
                          ["turn-on", "仅开关电视"],
                          ["turn-on-panel", "开关电视（开机时显示控制）"],
                        ]
                      : usesStatusPanel
                        ? [
                            [
                              "focus-panel",
                              isGenericDeviceMode ? "聚焦并显示弹窗" : "聚焦并显示状态",
                            ],
                            ["panel", isGenericDeviceMode ? "仅显示弹窗" : "仅显示状态"],
                            ["focus", "仅聚焦"],
                          ]
                        : isCoverMode
                          ? [
                              ["focus", "聚焦并显示控制"],
                              ["panel", "仅显示控制"],
                              ["turn-on-focus", "开合窗帘（打开时聚焦）"],
                              ["turn-on", "仅开合窗帘"],
                              ["turn-on-panel", "开合窗帘（打开时显示控制）"],
                            ]
                          : isClimateMode
                            ? [
                                ["focus", "聚焦并显示控制"],
                                ["turn-on-focus", "开关" + kindLabel + "（开启时聚焦）"],
                                ["turn-on", "仅开关" + kindLabel],
                                ["turn-on-panel", "开关" + kindLabel + "（开启时显示控制）"],
                              ]
                            : [
                                ["focus", "聚焦并显示控制"],
                                ["turn-on-focus", "开关灯（开灯时聚焦）"],
                                ["turn-on", "仅开关灯"],
                                ["turn-on-panel", "开关灯（开灯时显示控制）"],
                              ],
              vector.clickAction,
              (pickedCoverClickAction) => {
                ((vector.clickAction = normalizeClickAction(pickedCoverClickAction)),
                  refreshEditorPreview());
              },
            ),
            isCoverMode
              ? currentContainer.append(
                  createElement(
                    "p",
                    "i3d-note",
                    "开关类行为：完全关闭时打开，已打开或半开时关闭，运动中点击先停止。仅打开时执行所选聚焦或弹窗。",
                  ),
                )
              : bindingContainer
                ? currentContainer.append(
                    createElement(
                      "p",
                      "i3d-note",
                      vector.entityId
                        ? "开关行为只操作主实体；独立功能分别在弹窗内控制。"
                        : "未绑定主实体，点击入口打开各功能控制。",
                    ),
                  )
                : !isAirerMode &&
                  (!usesStatusPanel || isTelevisionMode) &&
                  currentContainer.append(
                    createElement(
                      "p",
                      "i3d-note",
                      "开关类行为：已开启时直接关闭；已关闭时开启，并执行所选聚焦或弹窗。",
                    ),
                  ));
          const clickActionVisibilityRow = createElement("div", "i3d-button-visibility-row");
          currentContainer.append(clickActionVisibilityRow);
          const hiddenClickableCheckbox = createElement("input");
          (Object.assign(hiddenClickableCheckbox, {
            type: "checkbox",
            checked: vector.hiddenClickable === true && vector.buttonHidden !== true,
          }),
            hiddenClickableCheckbox.addEventListener("change", () => {
              ((vector.hiddenClickable = hiddenClickableCheckbox.checked),
                hiddenClickableCheckbox.checked &&
                  ((vector.buttonHidden = false), (buttonHiddenCheckbox.checked = false)),
                refreshEditorPreview());
            }),
            (createSettingRow(
              clickActionVisibilityRow,
              "隐藏（可点击）",
              hiddenClickableCheckbox,
            ).parentElement.className += " i3d-hidden-clickable-setting"));
          const buttonHiddenCheckbox = createElement("input");
          (Object.assign(buttonHiddenCheckbox, {
            type: "checkbox",
            checked: vector.buttonHidden === true,
          }),
            buttonHiddenCheckbox.addEventListener("change", () => {
              ((vector.buttonHidden = buttonHiddenCheckbox.checked),
                buttonHiddenCheckbox.checked &&
                  ((vector.hiddenClickable = false), (hiddenClickableCheckbox.checked = false)),
                refreshEditorPreview());
            }),
            (createSettingRow(
              clickActionVisibilityRow,
              "隐藏（不可点击）",
              buttonHiddenCheckbox,
            ).parentElement.className += " i3d-hidden-clickable-setting"));
        }
        if (deviceKind !== "smallcar") {
          if (
            ((currentContainer = createConfigSection(isVacuumMode ? "状态标签" : "按钮外观")),
            isCoverMode)
          ) {
            const iconStateReversedCheckbox = createElement("input");
            (Object.assign(iconStateReversedCheckbox, {
              type: "checkbox",
              checked: vector.iconStateReversed === true,
            }),
              iconStateReversedCheckbox.addEventListener("change", () => {
                ((vector.iconStateReversed = iconStateReversedCheckbox.checked),
                  refreshEditorPreview());
              }),
              createSettingRow(currentContainer, "图标状态反向", iconStateReversedCheckbox));
          }
          const itemAppearanceRowElement = createConfigRow(currentContainer);
          if (!isVacuumMode) {
            const itemIconPickerButton = createButton(
              "",
              () => void openItemPicker("icon", itemIconPickerButton),
            );
            itemIconPickerButton.className = "i3d-picker-button i3d-icon-picker-button";
            const itemIconPreviewElement = createElement("i");
            itemIconPreviewElement.setAttribute("aria-hidden", "true");
            const memberBindingManageSectionElement =
              "/static/vendor/mdi/7.4.47/svg/" + vector.icon.replace(/^mdi:/, "") + ".svg";
            ((itemIconPreviewElement.style.maskImage =
              'url("' + memberBindingManageSectionElement + '")'),
              (itemIconPreviewElement.style.webkitMaskImage =
                'url("' + memberBindingManageSectionElement + '")'),
              itemIconPickerButton.append(
                itemIconPreviewElement,
                createElement("span", "", vector.icon),
              ),
              createSettingRow(itemAppearanceRowElement, "图标", itemIconPickerButton));
          }
          if (matchedCurtainGroup) {
            (createConfigSection("绑定管理").append(
              createElement("p", "i3d-note", "删除此成员会自动解除组合，另一成员恢复原入口。"),
              removeItemButton,
            ),
              panelElement.append(errorMessageElement),
              (saveButtonElement.disabled = isSaving || !isAccessAllowed));
            return;
          }
          const coverSizeGridElement = createElement("div", "i3d-coordinate-grid i3d-size-grid"),
            coverSizeDetailsElement = createElement("details");
          (coverSizeDetailsElement.append(
            createElement("summary", "", "更多尺寸设置"),
            coverSizeGridElement,
          ),
            currentContainer.append(coverSizeDetailsElement));
          const readHitSize = () =>
            Number.isFinite(vector.hitSize) && vector.hitSize > 0
              ? vector.hitSize
              : Math.max(DEFAULT_BUTTON_SIZE, vector.size);
          createSizeRow(
            itemAppearanceRowElement,
            isVacuumMode ? "状态框缩放（%）" : "按钮大小（px）",
            // 百分比以 DEFAULT_BUTTON_SIZE 为 100%（= 新建时的默认大小）。渲染侧的
            // 缩放基准仍是设计单位 44（stage.ts 的 vacuumScale），两者语义不同：
            // 这里只是「相对默认多大」，改默认值不该改变已有按钮的实际像素。
            () =>
              isVacuumMode
                ? Math.round((vector.size / DEFAULT_BUTTON_SIZE) * 100)
                : vector.size,
            (pickedSizeValue) => {
              ((vector.size = isVacuumMode
                ? (pickedSizeValue / 100) * DEFAULT_BUTTON_SIZE
                : pickedSizeValue),
                !isVacuumMode && syncLinkedIconSize(vector, vector.size),
                (hitSizeInputElement.value = String(Number(readHitSize().toPrecision(12)))),
                refreshEditorPreview());
            },
          );
          // 普通按钮的图标始终铺满按钮，不再单独暴露「图标大小」；扫地机的
          // iconSize 是状态卡字号，仍然要能调。
          isVacuumMode &&
            createSizeRow(
              coverSizeGridElement,
              "文字大小（px）",
              () => vector.iconSize / 2,
              (pickedIconSizeValue) => {
                ((vector.iconSize = pickedIconSizeValue * 2), refreshEditorPreview());
              },
            );
          const hitSizeInputElement = createSizeRow(
            coverSizeGridElement,
            "触控范围（px）",
            readHitSize,
            (pickedHitSizeValue) => {
              ((vector.hitSize = pickedHitSizeValue), refreshEditorPreview());
            },
          );
          isVacuumMode &&
            appendBackgroundOpacityControl2(
              currentContainer,
              vector,
              "backgroundOpacity",
              refreshEditorPreview,
            );
        }
        if (usesModelBinding) {
          currentContainer = createConfigSection(
            isVacuumMode || deviceKind === "smallcar" ? "标签位置" : "按钮位置",
          );
          const modelBindingEntry = sceneMetadata.floors
              .find((modelBindingFloorProbe) => modelBindingFloorProbe.id === vector.floorId)
              ?.[collectionKey]?.find(
                (modelBindingModelProbe) => modelBindingModelProbe.id === vector.modelId,
              ),
            coverPositionGridElement = createElement("div", "i3d-coordinate-grid");
          currentContainer.append(coverPositionGridElement);
          const resetPositionButton = createButton("恢复跟随模型", () => {
            (delete vector.x,
              delete vector.y,
              delete vector.height,
              refreshEditorPreview(),
              renderPanel());
          });
          resetPositionButton.disabled = !["x", "y", "height"].some((positionKeyProbe) =>
            Number.isFinite(vector[positionKeyProbe]),
          );
          for (const [
            coverCoordinateLabel,
            coverCoordinateMin,
            coverCoordinateMax,
            coverCoordinateStep,
            coordinateValue,
          ] of [
            ["x", "位置 X", -1000000, 1000000, 1],
            ["y", "位置 Y", -1000000, 1000000, 1],
            ["height", "高度（米）", 0, 20, 0.1],
          ] as [string, string, number, number, number][]) {
            const coordinateNumericValue = Number.isFinite(vector[coverCoordinateLabel])
              ? vector[coverCoordinateLabel]
              : deviceKind === "smallcar" && coverCoordinateLabel !== "height"
                ? 0
                : isVacuumMode && coverCoordinateLabel === "height"
                  ? (Number(modelBindingEntry?.elevation) || 0) +
                    (Number(modelBindingEntry?.height) || 0.85) +
                    0.25
                  : Number.isFinite(modelBindingEntry?.[coverCoordinateLabel])
                    ? modelBindingEntry[coverCoordinateLabel]
                    : 0;
            createNumberRow(
              coverPositionGridElement,
              deviceKind === "smallcar" && coverCoordinateLabel !== "height"
                ? "相对汽车偏移 " + coverCoordinateLabel.toUpperCase()
                : isVacuumMode && coverCoordinateLabel === "height"
                  ? "离地高度（米）"
                  : coverCoordinateMin,
              coordinateNumericValue,
              coverCoordinateMax,
              coverCoordinateStep,
              coordinateValue,
              (pickedMeterIconSizeValue) => {
                ((vector[coverCoordinateLabel] = pickedMeterIconSizeValue),
                  (resetPositionButton.disabled = false),
                  refreshEditorPreview());
              },
            );
          }
          currentContainer.append(resetPositionButton);
          const lightBatchSectionElement = createElement(
              "section",
              "navigation-batch-section i3d-light-batch",
            ),
            batchTitleElement = createElement("h4"),
            batchCountElement = createElement("span");
          batchTitleElement.append(
            createElement(
              "span",
              "",
              deviceKind === "smallcar" ? "卡片设置一键应用" : "图标设置一键应用",
            ),
            batchCountElement,
          );
          const lightBatchApplyButton = createButton("一键应用到其他" + kindLabel, () =>
            openCurtainGroupBatchApplyDialog(vector),
          );
          ((refreshBatchButtons = () => {
            const lightChangeCount = listChangedFields(vector).length;
            ((batchCountElement.textContent = lightChangeCount + " 项修改"),
              (lightBatchApplyButton.disabled =
                !isAccessAllowed || isCameraEditing || isCameraCommandPending));
          }),
            refreshBatchButtons(),
            lightBatchSectionElement.append(batchTitleElement, lightBatchApplyButton),
            currentContainer.append(lightBatchSectionElement));
        } else {
          currentContainer = createConfigSection("按钮位置");
          const lightPositionGridElement = createElement("div", "i3d-coordinate-grid");
          currentContainer.append(lightPositionGridElement);
          for (const lightPositionAxis of ["x", "y"])
            createNumberRow(
              lightPositionGridElement,
              "位置 " + lightPositionAxis.toUpperCase(),
              vector[lightPositionAxis],
              -1000000,
              1000000,
              1,
              (pickedLightX) => {
                ((vector[lightPositionAxis] = pickedLightX), refreshEditorPreview());
              },
            );
          (createNumberRow(
            lightPositionGridElement,
            "高度（米）",
            vector.height,
            0,
            20,
            0.1,
            (pickedLightHeight) => {
              ((vector.height = pickedLightHeight), refreshEditorPreview());
            },
          ),
            createNumberRow(
              currentContainer,
              "缓开缓灭（秒）",
              vector.fadeDuration,
              0,
              10,
              0.1,
              (pickedFadeDuration) => {
                ((vector.fadeDuration = pickedFadeDuration), refreshEditorPreview());
              },
            ));
          const lightEffectBatchSectionElement = createElement(
              "section",
              "navigation-batch-section i3d-light-batch",
            ),
            effectBatchTitleElement = createElement("h4"),
            effectBatchCountElement = createElement("span");
          effectBatchTitleElement.append(
            createElement("span", "", "灯光设置一键应用"),
            effectBatchCountElement,
          );
          const effectBatchApplyButton = createButton("一键应用到其他灯光", () =>
            openCurtainGroupBatchApplyDialog(vector),
          );
          ((refreshBatchButtons = () => {
            const effectChangeCount = listChangedFields(vector).length;
            ((effectBatchCountElement.textContent = effectChangeCount + " 项修改"),
              (effectBatchApplyButton.disabled =
                !isAccessAllowed ||
                isCameraEditing ||
                isCameraCommandPending ||
                isRangeEditorOpen));
          }),
            refreshBatchButtons(),
            lightEffectBatchSectionElement.append(effectBatchTitleElement, effectBatchApplyButton),
            currentContainer.append(lightEffectBatchSectionElement));
        }
        if (deviceKind !== "smallcar") {
          const coverFocusSectionElement = createElement(
            "section",
            "i3d-focus-settings i3d-config-section",
          );
          panelElement.append(coverFocusSectionElement);
          const cameraPropertyKey =
            isVacuumMode && vacuumCameraMode === "follow" ? "followCamera" : "focusCamera";
          if (
            (coverFocusSectionElement.append(
              createElement(
                "h4",
                "",
                cameraPropertyKey === "followCamera" ? "跟随视角" : "聚焦视角",
              ),
            ),
            isVacuumMode && !isCameraEditing)
          ) {
            const cameraModeActionsElement = createElement("div", "i3d-focus-actions");
            for (const [cameraModeKey, cameraModeLabel] of [
              ["focus", "聚焦视角"],
              ["follow", "跟随视角"],
            ]) {
              const cameraModeButton = createButton(cameraModeLabel, () => {
                ((vacuumCameraMode = cameraModeKey), renderPanel());
              });
              (cameraModeButton.setAttribute(
                "aria-pressed",
                String(vacuumCameraMode === cameraModeKey),
              ),
                (cameraModeButton.disabled = isCameraCommandPending),
                cameraModeActionsElement.append(cameraModeButton));
            }
            coverFocusSectionElement.append(cameraModeActionsElement);
          }
          cameraPropertyKey === "followCamera" &&
            coverFocusSectionElement.append(
              createElement(
                "p",
                "i3d-note",
                "固定鸟瞰角度跟随机器人平移，不随机器人转向。调整角度和远近后保存；跟随时不弹出控制面板。",
              ),
            );
          const runCameraCommand = async (cameraCommand, cameraRangePayload = undefined) => {
              const sceneReadySnapshot = num,
                isFocalLengthRangeCommand = cameraCommand === "focus-focal-length",
                pendingCameraQueue = cameraCommandQueue;
              let cameraRangeResolve;
              ((cameraCommandQueue = new Promise((resolveCameraQueuePromise) => {
                cameraRangeResolve = resolveCameraQueuePromise;
              })),
                isFocalLengthRangeCommand ||
                  ((isCameraCommandPending = true),
                  (errorMessageElement.textContent = ""),
                  renderPanel()));
              try {
                if ((await pendingCameraQueue, isDisposed || sceneReadySnapshot !== num)) return;
                const focusCommand2 = await editorRuntime.focusCommand(
                  cameraPropertyKey === "followCamera" && cameraCommand === "edit-light-camera"
                    ? "edit-follow-camera"
                    : cameraCommand,
                  vector.id,
                  cameraRangePayload,
                );
                if (isDisposed || sceneReadySnapshot !== num) return;
                cameraCommand === "save-light-camera"
                  ? ((vector[cameraPropertyKey] = focusCommand2.camera),
                    (isCameraEditing = false),
                    (pendingCameraDraft = null),
                    refreshEditorPreview())
                  : cameraCommand === "cancel-light-camera"
                    ? ((isCameraEditing = false), (pendingCameraDraft = null))
                    : cameraCommand !== "preview-light-camera" &&
                      ((isCameraEditing = true), (pendingCameraDraft = focusCommand2.camera));
              } catch (cameraCommandError) {
                !isDisposed &&
                  sceneReadySnapshot === num &&
                  (errorMessageElement.textContent = cameraCommandError.message);
              } finally {
                (cameraRangeResolve(),
                  !isDisposed &&
                    sceneReadySnapshot === num &&
                    !isFocalLengthRangeCommand &&
                    ((isCameraCommandPending = false), renderPanel()));
              }
            },
            cameraActionsElement = createElement("div", "i3d-focus-actions");
          if ((coverFocusSectionElement.append(cameraActionsElement), isCameraEditing)) {
            const saveCameraButton = createButton(
              "保存视角",
              () => void runCameraCommand("save-light-camera"),
            );
            ((saveCameraButton.className = "primary"),
              cameraActionsElement.append(
                saveCameraButton,
                createButton("取消调整", () => void runCameraCommand("cancel-light-camera")),
              ));
            const coverProjectionGroupElement = createElement("div", "i3d-focus-actions");
            (coverProjectionGroupElement.setAttribute("role", "group"),
              coverProjectionGroupElement.setAttribute("aria-label", "聚焦投影"),
              coverFocusSectionElement.append(coverProjectionGroupElement));
            for (const [projectionKey, projectionLabel] of [
              ["orthographic", "正交"],
              ["perspective", "透视"],
            ]) {
              const projectionButton = createButton(
                projectionLabel,
                () => void runCameraCommand("focus-projection", projectionKey),
              );
              (projectionButton.setAttribute(
                "aria-pressed",
                String((pendingCameraDraft?.mode || "orthographic") === projectionKey),
              ),
                coverProjectionGroupElement.append(projectionButton));
            }
            const focalLengthInput = createNumberRow(
              coverFocusSectionElement,
              "焦段（mm）",
              Math.round(pendingCameraDraft?.focalLength || 50),
              18,
              120,
              1,
              (pickedFocalLength) => void runCameraCommand("focus-focal-length", pickedFocalLength),
            );
            focalLengthInput.disabled = pendingCameraDraft?.mode !== "perspective";
          } else {
            cameraActionsElement.append(
              createButton(
                vector[cameraPropertyKey] ? "调整视角" : "设置视角",
                () => void runCameraCommand("edit-light-camera"),
              ),
              ...(cameraPropertyKey === "followCamera"
                ? []
                : [createButton("预览聚焦", () => void runCameraCommand("preview-light-camera"))]),
            );
            const resetCameraButton = createButton(
              cameraPropertyKey === "followCamera" ? "恢复默认鸟瞰" : "恢复自动聚焦",
              async () => {
                try {
                  (await editorRuntime.focusCommand("cancel-light-camera", vector.id),
                    delete vector[cameraPropertyKey],
                    refreshEditorPreview(),
                    renderPanel());
                } catch (cameraSaveError) {
                  errorMessageElement.textContent = cameraSaveError.message;
                }
              },
            );
            ((resetCameraButton.disabled = !vector[cameraPropertyKey]),
              (resetCameraButton.className = "i3d-focus-reset"),
              coverFocusSectionElement.append(resetCameraButton));
          }
          if (isCameraCommandPending) {
            for (const focusLockedControl of coverFocusSectionElement.querySelectorAll(
              "button, input",
            ))
              focusLockedControl.disabled = true;
          }
        }
        createConfigSection("绑定管理").append(removeItemButton);
      } else
        currentContainer.append(
          createElement(
            "p",
            "i3d-note",
            isVacuumMode
              ? addItemButton.length
                ? "点击“添加扫地机”，选择模型后绑定扫地机设备。"
                : "当前楼层暂无扫地机模型，请先在 3D 户型图绘制中添加扫地机器人后更新户型。"
              : isGenericDeviceMode
                ? addItemButton.length
                  ? "点击“添加" + kindLabel + "”，选择模型并绑定 HA 设备。"
                  : "当前楼层暂无" +
                    kindLabel +
                    "模型，请先在 3D 户型图绘制中添加" +
                    kindLabel +
                    "后更新户型。"
                : isSpeakerMode
                  ? addItemButton.length
                    ? "点击“添加设备”，选择智能音响模型并绑定媒体播放器实体。"
                    : "当前楼层暂无智能音响模型，请先在 3D 户型图绘制中添加智能音响后更新户型。"
                  : isTelevisionMode
                    ? addItemButton.length
                      ? "点击“添加设备”，选择电视模型并绑定媒体播放器实体。"
                      : "当前楼层暂无电视模型，请先在 3D 户型图绘制中添加电视后更新户型。"
                    : isNasMode
                      ? addItemButton.length
                        ? "点击“添加设备”，选择设备类型和模型，再绑定开启实体。"
                        : "当前楼层暂无 NAS 模型，请先在 3D 户型图绘制中添加 NAS 模型后更新户型。"
                      : isCoverMode
                        ? addItemButton.length
                          ? "点击“添加窗帘”，选择需要控制的窗帘模型。"
                          : "当前楼层暂无窗帘模型，请先在 3D 户型图绘制中添加普通窗帘后更新户型。"
                        : deviceKind === "water-heater"
                          ? addItemButton.length
                            ? "点击“添加热水器”，选择需要控制的热水器模型。"
                            : "当前楼层暂无热水器模型，请先在 3D 户型图绘制中添加储水式或燃气式热水器后更新户型。"
                          : ["airer", "fan", "purifier"].includes(deviceKind)
                            ? addItemButton.length
                              ? "点击“添加" + kindLabel + "”，选择需要控制的" + kindLabel + "模型。"
                              : "当前楼层暂无" +
                                kindLabel +
                                "模型，请先在 3D 户型图绘制中添加" +
                                kindLabel +
                                "后更新户型。"
                            : isClimateMode
                              ? addItemButton.length
                                ? "点击“添加空调/浴霸”，选择设备类型和关联模型。"
                                : "当前楼层暂无可关联模型，请先在 3D 户型图绘制中添加壁挂空调、柜机或出风口后更新户型。"
                              : addItemButton.length
                                ? "点击“添加灯光”，选择需要控制的灯组。"
                                : "当前楼层暂无灯组，请先在 3D 户型图绘制中添加灯组后更新户型。",
          ),
        );
    }
    if (
      (panelElement.append(errorMessageElement),
      (saveButtonElement.disabled =
        isSaving || !isAccessAllowed || isCameraEditing || isCameraCommandPending),
      isCameraEditing || isCameraCommandPending)
    ) {
      for (const rangeLockedControl of panelElement.querySelectorAll("input, select, button"))
        rangeLockedControl.closest(".i3d-focus-settings") || (rangeLockedControl.disabled = true);
    }
    if (isRangeEditorOpen) {
      for (const rangeLockedControlElement of panelElement.querySelectorAll(
        "input, select, button",
      ))
        rangeLockedControlElement.dataset.interaction3dRangeEditor !== "true" &&
          (rangeLockedControlElement.disabled = true);
    }
  }
  function mountEditorRuntime() {
    editorRuntime = mountInteraction3d2(stageHostElement, {
      component: {
        ...component,
        properties: buildRuntimeProperties(),
      },
      context: {
        document: documentApi,
        states: states,
        entityMetadata: new Map(
          entities.map((statesSnapshot) => [statesSnapshot.entityId, statesSnapshot]),
        ),
      },
      editing: true,
      editingVacuumId: isVacuumShortcutMode ? vacuumId : "",
      editingModule: usesStatusPanel
        ? deviceKind
        : isCoverMode
          ? "cover"
          : isAirerMode || isClimateMode || isTemperatureHumidityMode
            ? deviceKind
            : "light",
      onStates(statusListItem) {
        isDisposed ||
          ((latestStates = statusListItem),
          subEditorHandle?.syncMap?.(),
          refreshEffectSettings(),
          bathEffectEditorHandle(),
          refreshAirflowStatus());
      },
      onReady(sceneMetadataPayload = undefined) {
        (num++,
          (isCameraEditing = false),
          (isCameraCommandPending = false),
          (pendingCameraDraft = null),
          (sceneMetadata = sceneMetadataPayload),
          sceneMetadata.floors.some((sceneFloorLookup) => sceneFloorLookup.id === floorSelection) ||
            (floorSelection = sceneMetadata.floors[0]?.id || ""),
          renderPanel(),
          refreshEditorPreview(),
          shouldStartAdding && ((shouldStartAdding = false), queueMicrotask(openAddDialog)));
      },
      onEdit(editEvent) {
        if (!(isDisposed || !isAccessAllowed || addDialogState || auxDialogElement)) {
          if (
            ["purifier-layout", "device-layout"].includes(editEvent.action) &&
            (["climate", "airer", "fan", "purifier", "water-heater"].includes(deviceKind) ||
              isGenericDeviceMode)
          ) {
            const matchedItem = getItemList().find(
                (editMatchedItemProbe) => editMatchedItemProbe.id === editEvent.id,
              ),
              controlByEntityId = new Map(
                (matchedItem?.extraControls || []).map((extraControlEntry) => [
                  extraControlEntry.entityId,
                  extraControlEntry,
                ]),
              );
            if (
              !matchedItem ||
              !Array.isArray(editEvent.extraControls) ||
              editEvent.extraControls.length !== controlByEntityId.size ||
              new Set(editEvent.extraControls.map((controlIdProbe) => controlIdProbe.entityId))
                .size !== controlByEntityId.size ||
              editEvent.extraControls.some(
                (incomingControlProbe) =>
                  !controlByEntityId.has(incomingControlProbe.entityId) ||
                  ![1, 2, 3, 4].includes(incomingControlProbe.columns) ||
                  ![1, 2].includes(incomingControlProbe.rows),
              )
            )
              return;
            ((matchedItem.extraControls = editEvent.extraControls.map((incomingExtraControl) => ({
              entityId: incomingExtraControl.entityId,
              type: extraTypes2(incomingExtraControl.entityId)[0],
              columns: incomingExtraControl.columns,
              rows: incomingExtraControl.rows,
            }))),
              refreshEditorPreview());
            return;
          }
          if (
            (editEvent.action === "light-region-overrides" &&
              ((structuredClone2.lightRegionOverrides = structuredClone(editEvent.overrides || {})),
              isDirty++,
              isSaving || (saveStatusElement.textContent = "")),
            isVacuumShortcutMode)
          ) {
            const roomShortcut = getItemList().find(
              (roomShortcutProbe) =>
                "vacuum-room:" + vacuumId + ":" + roomShortcutProbe.id === editEvent.id,
            );
            roomShortcut &&
              ((text = roomShortcut.id),
              editEvent.action === "position" &&
                ((roomShortcut.x = editEvent.x),
                (roomShortcut.y = editEvent.y),
                refreshEditorPreview()),
              renderPanel(),
              editEvent.action === "select" && refreshEditorPreview());
            return;
          }
          if (isVacuumMode && editEvent.id?.startsWith("vacuum-room:")) {
            const shortcutOwner = getItemList().find((shortcutOwnerProbe) =>
                (shortcutOwnerProbe.shortcuts || []).some(
                  (ownerShortcutProbe) =>
                    "vacuum-room:" + shortcutOwnerProbe.id + ":" + ownerShortcutProbe.id ===
                    editEvent.id,
                ),
              ),
              matchedShortcutItem = shortcutOwner?.shortcuts.find(
                (matchedOwnerShortcutProbe) =>
                  "vacuum-room:" + shortcutOwner.id + ":" + matchedOwnerShortcutProbe.id ===
                  editEvent.id,
              );
            matchedShortcutItem &&
              ((text = shortcutOwner.id),
              editEvent.action === "position" &&
                ((matchedShortcutItem.x = editEvent.x),
                (matchedShortcutItem.y = editEvent.y),
                refreshEditorPreview()),
              editEvent.action === "select" && renderPanel());
            return;
          }
          if (
            (editEvent.action === "focus-exited" &&
              ((isCameraEditing = false), (pendingCameraDraft = null), renderPanel()),
            editEvent.action === "select")
          ) {
            if (
              isTemperatureHumidityMode &&
              !getItemList().some(
                (floorItemProbe) =>
                  floorItemProbe.id === editEvent.id && floorItemProbe.floorId === floorSelection,
              )
            )
              return;
            ((text = editEvent.id), renderPanel(), refreshEditorPreview());
          }
          if (editEvent.action === "position") {
            const positionedItem =
              (isCoverMode &&
                getCurtainGroupList().find(
                  (positionCandidateProbe) =>
                    curtainGroupEntryId2(positionCandidateProbe) === editEvent.id,
                )) ||
              getItemList().find(
                (layoutCandidateProbe) => layoutCandidateProbe.id === editEvent.id,
              );
            positionedItem &&
              (!isTemperatureHumidityMode || positionedItem.floorId === floorSelection) &&
              Number.isFinite(editEvent.x) &&
              Number.isFinite(editEvent.y) &&
              ((positionedItem.x = editEvent.x),
              (positionedItem.y = editEvent.y),
              isTemperatureHumidityMode && renderPanel(),
              refreshEditorPreview());
          }
          editEvent.action === "camera" &&
            ((structuredClone2.floorCameras = {
              ...structuredClone2.floorCameras,
              [floorSelection]: editEvent.camera,
            }),
            floorSelection === structuredClone2.floorSelection &&
              (structuredClone2.camera = editEvent.camera),
            (errorMessageElement.textContent = "默认视角已记录，保存配置后生效。"));
        }
      },
    });
  }
  const accessUnsubscribe = subscribeInteraction3dAccess2((accessState) => {
    isDisposed ||
      ((isAccessAllowed = accessState.allowed),
      (saveButtonElement.disabled =
        isSaving || !isAccessAllowed || isCameraEditing || isCameraCommandPending),
      (panelElement.inert = !isAccessAllowed),
      (statusElement.hidden =
        isAccessAllowed || (!!editorRuntime && accessState.status !== "denied")),
      (statusElement.textContent =
        accessState.status === "denied" || accessState.status === "unavailable"
          ? accessState.message
          : "正在准备户型…"),
      isAccessAllowed
        ? editorRuntime
          ? editorRuntime.setAuthorized(true)
          : mountEditorRuntime()
        : (closeAddDialog(),
          closeAuxDialog(),
          subEditorHandle?.close(),
          pickerGeneration++,
          pickerHandle?.close(),
          num++,
          (isCameraEditing = false),
          (isCameraCommandPending = false),
          (pendingCameraDraft = null),
          renderPanel(),
          editorRuntime?.setAuthorized(false),
          accessState.status === "denied" &&
            (editorRuntime?.(), (editorRuntime = null), renderPanel())));
  });
  (renderPanel(),
    editorDialogElement.showModal(),
    document.dispatchEvent(new Event("hb-i3d-preview-scope")),
    syncPreviewSize());
}
export async function openInteraction3dAppearanceEditor({
  component: appearanceComponent,
  onSave: onAppearanceSave,
}) {
  if (
    normalizeInteraction3dLightingMode2(appearanceComponent.properties?.lightingMode) === "region"
  )
    return;
  await requestInteraction3dAccess2();
  const editorView = getInteraction3dEditorView2(appearanceComponent.id);
  if (!editorView?.metadata) throw new Error("户型还在加载，请稍候再打开进阶设置。");
  const structuredClone4 = structuredClone(appearanceComponent.properties || {});
  let sourceBaseLighting = {
      ...editorView.metadata.defaults,
      ...structuredClone(structuredClone4.baseLighting || editorView.metadata.baseLighting),
    },
    isAppearanceDirty = false;
  const appearanceStyleLinkElement = document.createElement("link");
  ((appearanceStyleLinkElement.rel = "stylesheet"),
    (appearanceStyleLinkElement.href =
      "/api/v1/modules/interaction3d/core/runtime.css"),
    document.head.append(appearanceStyleLinkElement));
  const createPlainElement = (plainTagName, plainText = "") => {
      const plainElement = document.createElement(plainTagName);
      return ((plainElement.textContent = plainText), plainElement);
    },
    appearanceDialogElement = createPlainElement("dialog");
  ((appearanceDialogElement.className = "i3d-editor i3d-appearance-editor"),
    appearanceDialogElement.setAttribute("aria-label", "户型进阶设置"));
  const appearanceHeaderElement = createPlainElement("header"),
    appearanceBodyElement = createPlainElement("div");
  appearanceBodyElement.className = "i3d-appearance-body";
  const appearanceErrorElement = createPlainElement("p");
  ((appearanceErrorElement.className = "i3d-error"),
    appearanceErrorElement.setAttribute("role", "status"));
  let dragState;
  const positionAppearanceDialog = (targetLeft, targetTop) => {
      const boundingClientRect = appearanceDialogElement.getBoundingClientRect();
      Object.assign(appearanceDialogElement.style, {
        margin: "0",
        right: "auto",
        bottom: "auto",
        left:
          Math.max(8, Math.min(targetLeft, window.innerWidth - boundingClientRect.width - 8)) +
          "px",
        top:
          Math.max(8, Math.min(targetTop, window.innerHeight - boundingClientRect.height - 8)) +
          "px",
      });
    },
    repositionAppearanceDialog = () => {
      const currentRect = appearanceDialogElement.getBoundingClientRect();
      positionAppearanceDialog(currentRect.left, currentRect.top);
    };
  ((appearanceHeaderElement.title = "按住标题栏拖动"),
    appearanceHeaderElement.addEventListener("pointerdown", (pointerDownEvent) => {
      if (pointerDownEvent.button !== 0 || pointerDownEvent.target.closest("button")) return;
      pointerDownEvent.preventDefault();
      const dragStartRect = appearanceDialogElement.getBoundingClientRect();
      ((dragState = {
        id: pointerDownEvent.pointerId,
        x: pointerDownEvent.clientX,
        y: pointerDownEvent.clientY,
        left: dragStartRect.left,
        top: dragStartRect.top,
      }),
        appearanceHeaderElement.setPointerCapture(pointerDownEvent.pointerId));
    }),
    appearanceHeaderElement.addEventListener("pointermove", (pointerMoveEvent) => {
      !dragState ||
        dragState.id !== pointerMoveEvent.pointerId ||
        positionAppearanceDialog(
          dragState.left + pointerMoveEvent.clientX - dragState.x,
          dragState.top + pointerMoveEvent.clientY - dragState.y,
        );
    }));
  for (const pointerEndEventName of ["pointerup", "pointercancel", "lostpointercapture"])
    appearanceHeaderElement.addEventListener(pointerEndEventName, () => {
      dragState = null;
    });
  window.addEventListener("resize", repositionAppearanceDialog);
  const applyAppearanceLighting = () =>
      editorView.update({
        ...structuredClone4,
        baseLighting: sourceBaseLighting,
      }),
    closeAppearanceEditor = (shouldKeepLighting = false) => {
      isAppearanceDirty ||
        ((isAppearanceDirty = true),
        shouldKeepLighting || editorView.update(structuredClone4),
        window.removeEventListener("resize", repositionAppearanceDialog),
        appearanceDialogElement.close(),
        appearanceDialogElement.remove(),
        appearanceStyleLinkElement.remove());
    },
    appearanceSaveButton = createPlainElement("button", "完成");
  ((appearanceSaveButton.type = "button"),
    appearanceSaveButton.addEventListener("click", async () => {
      if (!(isAppearanceDirty || appearanceSaveButton.disabled)) {
        appearanceSaveButton.disabled = true;
        try {
          if ((await requestInteraction3dAccess2(), isAppearanceDirty)) return;
          (await onAppearanceSave(sourceBaseLighting), closeAppearanceEditor(true));
        } catch (appearanceSaveError) {
          isAppearanceDirty ||
            ((appearanceErrorElement.textContent = appearanceSaveError.message),
            (appearanceSaveButton.disabled = false));
        }
      }
    }));
  const appearanceCancelButton = createPlainElement("button", "取消");
  ((appearanceCancelButton.type = "button"),
    appearanceCancelButton.addEventListener("click", () => closeAppearanceEditor()));
  const dragHintElement = createPlainElement("span", "拖动");
  ((dragHintElement.className = "i3d-drag-hint"),
    appearanceHeaderElement.append(
      createPlainElement("strong", "户型进阶设置"),
      dragHintElement,
      appearanceSaveButton,
      appearanceCancelButton,
    ));
  const appearanceInputsByKey = new Map(),
    Wi2 = APPEARANCE_GROUPS;
  for (const [sectionTitleText, sectionFields] of Wi2) {
    const appearanceGroupSectionElement = createPlainElement("section"),
      appearanceGridElement = createPlainElement("div");
    ((appearanceGridElement.className = "i3d-appearance-grid"),
      appearanceGroupSectionElement.append(
        createPlainElement("h4", sectionTitleText),
        appearanceGridElement,
      ));
    for (const [
      fieldLabelText,
      appearanceFieldName,
      fieldMinValue,
      fieldMaxValue,
      fieldStepValue,
    ] of sectionFields) {
      const floorBrightnessRangeInput = createPlainElement("label"),
        floorBrightnessNumberInput = createPlainElement("input");
      (Object.assign(floorBrightnessNumberInput, {
        name: "i3d-base-light-" + appearanceFieldName,
        type: "number",
        min: String(fieldMinValue),
        max: String(fieldMaxValue),
        step: String(fieldStepValue),
        value: String(sourceBaseLighting[appearanceFieldName]),
      }),
        floorBrightnessNumberInput.addEventListener("input", () => {
          Number.isFinite(floorBrightnessNumberInput.valueAsNumber) &&
            ((sourceBaseLighting[appearanceFieldName] = Math.max(
              fieldMinValue,
              Math.min(fieldMaxValue, floorBrightnessNumberInput.valueAsNumber),
            )),
            applyAppearanceLighting());
        }),
        floorBrightnessRangeInput.append(
          createPlainElement("span", fieldLabelText),
          floorBrightnessNumberInput,
        ),
        appearanceGridElement.append(floorBrightnessRangeInput),
        appearanceInputsByKey.set(appearanceFieldName, floorBrightnessNumberInput));
    }
    appearanceBodyElement.append(appearanceGroupSectionElement);
  }
  const restoreDefaultsButton = createPlainElement("button", "恢复默认");
  ((restoreDefaultsButton.type = "button"),
    restoreDefaultsButton.addEventListener("click", () => {
      for (const [appearanceInputElement, resetFloorBrightness] of appearanceInputsByKey)
        ((sourceBaseLighting[appearanceInputElement] =
          editorView.metadata.defaults[appearanceInputElement]),
          (resetFloorBrightness.value = String(sourceBaseLighting[appearanceInputElement])));
      applyAppearanceLighting();
    }));
  const appearanceNoteElement = createPlainElement(
    "p",
    "调整当前户型的整体光照与阴影。完成后点击页面上方保存，仅保存至当前 3D 控件。",
  );
  ((appearanceNoteElement.className = "i3d-note"),
    appearanceBodyElement.append(
      restoreDefaultsButton,
      appearanceNoteElement,
      appearanceErrorElement,
    ),
    appearanceDialogElement.append(appearanceHeaderElement, appearanceBodyElement),
    document.body.append(appearanceDialogElement),
    appearanceDialogElement.addEventListener("cancel", (appearanceCancelEvent) => {
      (appearanceCancelEvent.preventDefault(), closeAppearanceEditor());
    }),
    appearanceDialogElement.showModal());
}
