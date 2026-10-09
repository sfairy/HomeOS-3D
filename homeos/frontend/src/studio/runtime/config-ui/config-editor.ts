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
  subscribeInteraction3dAccess as subscribeInteraction3dAccess2,
} from "@app/bridge/bridge";
import { openInteraction3dAppearanceEditor } from "./config-editor/appearance-editor";
export { openInteraction3dAppearanceEditor } from "./config-editor/appearance-editor";
import { attachEditorPanelRendering } from './config-editor/panel-rendering';
import { readNestedPath } from "./config-editor/_shared";
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
} from "../device/generic-device-catalog";
import { domElement } from "@app/utils/dom-factory";
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
}: any) {
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
  let isVacuumShortcutMode: any,
    isVacuumMode: any,
    usesStatusPanel: any,
    isTelevisionMode: any,
    isSpeakerMode: any,
    isGenericDeviceMode: any,
    isClimateMode: any,
    isCoverMode: any,
    isAirerMode: any,
    isNasMode: any,
    isTemperatureHumidityMode: any,
    usesModelBinding: any,
    kindLabel: any,
    editorKindTitle: any,
    collectionKey: any,
    defaultIcon: any,
    modelIdKey: any;
  function applyKindFlags(nextKind: any) {
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
  const describeItem = (describableItem: any) =>
      describableItem.name || describableItem.label || kindLabel,
    normalizeClickAction = (rawClickAction: any) =>
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
  const createElement = (tagName: any, className = "", textContent = "") =>
      domElement(document, tagName, className, textContent),
    createButton = (buttonLabel: any, handleButtonClick: any) => {
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
    sceneMetadata: any = null,
    editorRuntime: any = null,
    isDisposed = false,
    isAccessAllowed = true,
    floorSelection =
      editingFloorId ||
      (structuredClone2.floorSelection !== "all" ? structuredClone2.floorSelection : "");
  structuredClone2.environment?.temperatureHumidity &&
    (structuredClone2.environment.temperatureHumidity =
      structuredClone2.environment.temperatureHumidity.map(normalizeTemperatureHumidity2));
  let isRangeEditorOpen = false,
    subEditorHandle: any = null,
    vacuumCameraMode = "focus",
    isCameraEditing = false,
    isCameraCommandPending = false,
    pendingCameraDraft: any = null,
    num = 0,
    cameraCommandQueue = Promise.resolve(),
    addDialogState: any = null,
    pickerHandle: any = null,
    pickerGeneration = 0,
    isSaving = false,
    isDirty = 0,
    latestStates: any = null,
    refreshEffectSettings = () => {},
    bathEffectEditorHandle = () => {},
    redrawBathEffects = () => {},
    refreshAirflowStatus = () => {},
    renderAirflowSection = () => {};
  const map = new Map(),
    findVacuumModel = () =>
      structuredClone2.devices?.vacuums?.find(
        (vacuumModelProbe: any) => vacuumModelProbe.id === vacuumId,
      ),
    getItemList = () =>
      isVacuumShortcutMode
        ? findVacuumModel()?.shortcuts || []
        : usesStatusPanel
          ? structuredClone2.devices[collectionKey]
          : usesModelBinding || isTemperatureHumidityMode
            ? structuredClone2.environment[collectionKey]
            : structuredClone2.lights,
    setItemList = (nextItemList: any) => {
      isVacuumShortcutMode
        ? findVacuumModel() && (findVacuumModel().shortcuts = nextItemList)
        : usesStatusPanel
          ? (structuredClone2.devices[collectionKey] = nextItemList)
          : usesModelBinding || isTemperatureHumidityMode
            ? (structuredClone2.environment[collectionKey] = nextItemList)
            : (structuredClone2.lights = nextItemList);
    },
    getCurtainGroupList = () => structuredClone2.environment?.curtainGroups || [],
    findCurtainGroupOf = (curtainId: any) =>
      getCurtainGroupList().find((curtainGroupEntry: any) =>
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
  const __editorHost: any = {};
  const __linkEditorHost = () => {
    Object.assign(__editorHost, {
      applyKindFlags,
      describeItem,
      normalizeClickAction,
      createElement,
      createButton,
      editorDialogElement,
      headerElement,
      bodyElement,
      viewElement,
      panelElement,
      aspectBoxElement,
      stageHostElement,
      statusElement,
      errorMessageElement,
      element,
      map,
      findVacuumModel,
      getItemList,
      setItemList,
      getCurtainGroupList,
      findCurtainGroupOf,
      describeGroupFieldValue,
      component,
      documentApi,
      entities,
      states,
      pickers,
      onSaveConfig,
      shouldStartAdding,
      vacuumId,
      editingFloorId,
      includes,
      isDeviceKind,
    });
    const __gs = (k: string, g: () => any, s: (v: any) => void) =>
      Object.defineProperty(__editorHost, k, { get: g, set: s, enumerable: true, configurable: true });
    __gs('deviceKind', () => deviceKind, (v) => { deviceKind = v; });
    __gs('isVacuumShortcutMode', () => isVacuumShortcutMode, (v) => { isVacuumShortcutMode = v; });
    __gs('isVacuumMode', () => isVacuumMode, (v) => { isVacuumMode = v; });
    __gs('usesStatusPanel', () => usesStatusPanel, (v) => { usesStatusPanel = v; });
    __gs('isTelevisionMode', () => isTelevisionMode, (v) => { isTelevisionMode = v; });
    __gs('isSpeakerMode', () => isSpeakerMode, (v) => { isSpeakerMode = v; });
    __gs('isGenericDeviceMode', () => isGenericDeviceMode, (v) => { isGenericDeviceMode = v; });
    __gs('isClimateMode', () => isClimateMode, (v) => { isClimateMode = v; });
    __gs('isCoverMode', () => isCoverMode, (v) => { isCoverMode = v; });
    __gs('isAirerMode', () => isAirerMode, (v) => { isAirerMode = v; });
    __gs('isNasMode', () => isNasMode, (v) => { isNasMode = v; });
    __gs('isTemperatureHumidityMode', () => isTemperatureHumidityMode, (v) => { isTemperatureHumidityMode = v; });
    __gs('usesModelBinding', () => usesModelBinding, (v) => { usesModelBinding = v; });
    __gs('kindLabel', () => kindLabel, (v) => { kindLabel = v; });
    __gs('editorKindTitle', () => editorKindTitle, (v) => { editorKindTitle = v; });
    __gs('collectionKey', () => collectionKey, (v) => { collectionKey = v; });
    __gs('defaultIcon', () => defaultIcon, (v) => { defaultIcon = v; });
    __gs('modelIdKey', () => modelIdKey, (v) => { modelIdKey = v; });
    __gs('structuredClone2', () => structuredClone2, (v) => { structuredClone2 = v; });
    __gs('text', () => text, (v) => { text = v; });
    __gs('selectedCurtainGroupId', () => selectedCurtainGroupId, (v) => { selectedCurtainGroupId = v; });
    __gs('sceneMetadata', () => sceneMetadata, (v) => { sceneMetadata = v; });
    __gs('editorRuntime', () => editorRuntime, (v) => { editorRuntime = v; });
    __gs('isDisposed', () => isDisposed, (v) => { isDisposed = v; });
    __gs('isAccessAllowed', () => isAccessAllowed, (v) => { isAccessAllowed = v; });
    __gs('floorSelection', () => floorSelection, (v) => { floorSelection = v; });
    __gs('isRangeEditorOpen', () => isRangeEditorOpen, (v) => { isRangeEditorOpen = v; });
    __gs('subEditorHandle', () => subEditorHandle, (v) => { subEditorHandle = v; });
    __gs('vacuumCameraMode', () => vacuumCameraMode, (v) => { vacuumCameraMode = v; });
    __gs('isCameraEditing', () => isCameraEditing, (v) => { isCameraEditing = v; });
    __gs('isCameraCommandPending', () => isCameraCommandPending, (v) => { isCameraCommandPending = v; });
    __gs('pendingCameraDraft', () => pendingCameraDraft, (v) => { pendingCameraDraft = v; });
    __gs('num', () => num, (v) => { num = v; });
    __gs('cameraCommandQueue', () => cameraCommandQueue, (v) => { cameraCommandQueue = v; });
    __gs('addDialogState', () => addDialogState, (v) => { addDialogState = v; });
    __gs('pickerHandle', () => pickerHandle, (v) => { pickerHandle = v; });
    __gs('pickerGeneration', () => pickerGeneration, (v) => { pickerGeneration = v; });
    __gs('isSaving', () => isSaving, (v) => { isSaving = v; });
    __gs('isDirty', () => isDirty, (v) => { isDirty = v; });
    __gs('latestStates', () => latestStates, (v) => { latestStates = v; });
    __gs('refreshEffectSettings', () => refreshEffectSettings, (v) => { refreshEffectSettings = v; });
    __gs('bathEffectEditorHandle', () => bathEffectEditorHandle, (v) => { bathEffectEditorHandle = v; });
    __gs('redrawBathEffects', () => redrawBathEffects, (v) => { redrawBathEffects = v; });
    __gs('refreshAirflowStatus', () => refreshAirflowStatus, (v) => { refreshAirflowStatus = v; });
    __gs('renderAirflowSection', () => renderAirflowSection, (v) => { renderAirflowSection = v; });
  };
  __linkEditorHost();
  attachEditorPanelRendering(__editorHost);
  const saveButtonElement = __editorHost.saveButtonElement;
  const saveStatusElement = __editorHost.saveStatusElement;
  let accessUnsubscribe = () => {};
  __editorHost.accessUnsubscribe = () => accessUnsubscribe();
  const {
    buildCurtainGroupOptions,
    ensureItemCollections,
    buildEditableFieldList,
    buildItemPayload,
    listChangedFields,
    closeAuxDialog,
    openMetricsDialog,
    openCurtainGroupBatchApplyDialog,
    syncPreviewSize,
    disposeEditor,
    buildRuntimeProperties,
    refreshEditorPreview,
    createSettingRow,
    createSelectRow,
    createNumberRow,
    createSizeRow,
    syncLinkedIconSize,
    listAddableModels,
    switchEditorKind,
    closeAddDialog,
    openAddDialog,
    openVacuumRoomPicker,
    renderVacuumShortcutPanel,
    createConfigSection,
    createConfigRow,
    renderStatusRuleSection,
    openCurtainGroupDialog,
    renderCurtainGroupSection,
    renderExtraControlsSection,
    renderAirPurifierBindingSection,
    openLabelBatchApplyDialog,
    renderPanel,
  } = __editorHost;
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
          entities.map((statesSnapshot: any) => [statesSnapshot.entityId, statesSnapshot]),
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
      onStates(statusListItem: any) {
        isDisposed ||
          ((latestStates = statusListItem),
          subEditorHandle?.syncMap?.(),
          refreshEffectSettings(),
          bathEffectEditorHandle(),
          refreshAirflowStatus());
      },
      onReady(sceneMetadataPayload: any = undefined) {
        (num++,
          (isCameraEditing = false),
          (isCameraCommandPending = false),
          (pendingCameraDraft = null),
          (sceneMetadata = sceneMetadataPayload),
          sceneMetadata.floors.some((sceneFloorLookup: any) => sceneFloorLookup.id === floorSelection) ||
            (floorSelection = sceneMetadata.floors[0]?.id || ""),
          renderPanel(),
          refreshEditorPreview(),
          shouldStartAdding && ((shouldStartAdding = false), queueMicrotask(openAddDialog)));
      },
      onEdit(editEvent: any) {
        if (!(isDisposed || !isAccessAllowed || addDialogState || __editorHost.auxDialogElement)) {
          if (
            ["purifier-layout", "device-layout"].includes(editEvent.action) &&
            (["climate", "airer", "fan", "purifier", "water-heater"].includes(deviceKind) ||
              isGenericDeviceMode)
          ) {
            const matchedItem = getItemList().find(
                (editMatchedItemProbe: any) => editMatchedItemProbe.id === editEvent.id,
              ),
              controlByEntityId = new Map(
                (matchedItem?.extraControls || []).map((extraControlEntry: any) => [
                  extraControlEntry.entityId,
                  extraControlEntry,
                ]),
              );
            if (
              !matchedItem ||
              !Array.isArray(editEvent.extraControls) ||
              editEvent.extraControls.length !== controlByEntityId.size ||
              new Set(editEvent.extraControls.map((controlIdProbe: any) => controlIdProbe.entityId))
                .size !== controlByEntityId.size ||
              editEvent.extraControls.some(
                (incomingControlProbe: any) =>
                  !controlByEntityId.has(incomingControlProbe.entityId) ||
                  ![1, 2, 3, 4].includes(incomingControlProbe.columns) ||
                  ![1, 2].includes(incomingControlProbe.rows),
              )
            )
              return;
            ((matchedItem.extraControls = editEvent.extraControls.map((incomingExtraControl: any) => ({
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
              (roomShortcutProbe: any) =>
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
            const shortcutOwner = getItemList().find((shortcutOwnerProbe: any) =>
                (shortcutOwnerProbe.shortcuts || []).some(
                  (ownerShortcutProbe: any) =>
                    "vacuum-room:" + shortcutOwnerProbe.id + ":" + ownerShortcutProbe.id ===
                    editEvent.id,
                ),
              ),
              matchedShortcutItem = shortcutOwner?.shortcuts.find(
                (matchedOwnerShortcutProbe: any) =>
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
                (floorItemProbe: any) =>
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
                  (positionCandidateProbe: any) =>
                    curtainGroupEntryId2(positionCandidateProbe) === editEvent.id,
                )) ||
              getItemList().find(
                (layoutCandidateProbe: any) => layoutCandidateProbe.id === editEvent.id,
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
  accessUnsubscribe = subscribeInteraction3dAccess2((accessState: any) => {
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
