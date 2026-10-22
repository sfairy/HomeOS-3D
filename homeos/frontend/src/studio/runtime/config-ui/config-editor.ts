



import { mountInteraction3d as mountInteraction3d2 } from "../core/runtime";
import {
  extraTypes as extraTypes2,
} from "../climate/purifier-extras";
import {
  curtainGroupEntryId as curtainGroupEntryId2,
} from "../cover/cover-groups";
import {
  requestInteraction3dAccess as requestInteraction3dAccess2,
  subscribeInteraction3dAccess as subscribeInteraction3dAccess2,
} from "@app/bridge/bridge";
export { openInteraction3dAppearanceEditor } from "./config-editor/appearance-editor";
import { attachEditorPanelRendering } from './config-editor/panel-rendering';
import {
  normalizeTemperatureHumidity as normalizeTemperatureHumidity2,
} from "@app/bridge/temperature-humidity";




import {
  GENERIC_DEVICE_KINDS as GENERIC_DEVICE_KINDS2,
  genericDeviceProfile as genericDeviceProfile2,
  isGenericDeviceKind as isGenericDeviceKind2,
} from "../device/generic-device-catalog";
import { domElement } from "@app/shared/util/dom-factory";
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
    "exhaust-fan",
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
      (isClimateMode = ["climate", "fan", "exhaust-fan", "purifier", "water-heater"].includes(deviceKind)),
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
                            ? "风扇 / 吊扇"
                            : deviceKind === "exhaust-fan"
                              ? "排气扇"
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
                          : deviceKind === "exhaust-fan"
                            ? "exhaustFans"
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
                          : deviceKind === "exhaust-fan"
                            ? "mdi:fan"
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
    editingShowAllLabels = false,
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
      editingFloorId,
      includes,
      isDeviceKind,
    });
    const __gs = (k: string, getValue: () => any, setValue: (value: any) => void) =>
      Object.defineProperty(__editorHost, k, { get: getValue, set: setValue, enumerable: true, configurable: true });
    __gs('deviceKind', () => deviceKind, (value) => { deviceKind = value; });
    __gs('isVacuumShortcutMode', () => isVacuumShortcutMode, (value) => { isVacuumShortcutMode = value; });
    __gs('isVacuumMode', () => isVacuumMode, (value) => { isVacuumMode = value; });
    // 必须走 getter/setter：`findVacuumModel()` 闭包读的是这个变量，而各 panel 渲染器会写 `e.vacuumId`。
    // 若只 `Object.assign` 一份快照，写入落在宿主属性上、闭包里的 vacuumId 永远是初始值，
    // `findVacuumModel()` 返回 undefined → 「添加快捷指令」静默 return（点了没反应）。
    __gs('vacuumId', () => vacuumId, (value) => { vacuumId = value; });
    __gs('usesStatusPanel', () => usesStatusPanel, (value) => { usesStatusPanel = value; });
    __gs('isTelevisionMode', () => isTelevisionMode, (value) => { isTelevisionMode = value; });
    __gs('isSpeakerMode', () => isSpeakerMode, (value) => { isSpeakerMode = value; });
    __gs('isGenericDeviceMode', () => isGenericDeviceMode, (value) => { isGenericDeviceMode = value; });
    __gs('isClimateMode', () => isClimateMode, (value) => { isClimateMode = value; });
    __gs('isCoverMode', () => isCoverMode, (value) => { isCoverMode = value; });
    __gs('isAirerMode', () => isAirerMode, (value) => { isAirerMode = value; });
    __gs('isNasMode', () => isNasMode, (value) => { isNasMode = value; });
    __gs('isTemperatureHumidityMode', () => isTemperatureHumidityMode, (value) => { isTemperatureHumidityMode = value; });
    __gs('usesModelBinding', () => usesModelBinding, (value) => { usesModelBinding = value; });
    __gs('kindLabel', () => kindLabel, (value) => { kindLabel = value; });
    __gs('editorKindTitle', () => editorKindTitle, (value) => { editorKindTitle = value; });
    __gs('collectionKey', () => collectionKey, (value) => { collectionKey = value; });
    __gs('defaultIcon', () => defaultIcon, (value) => { defaultIcon = value; });
    __gs('modelIdKey', () => modelIdKey, (value) => { modelIdKey = value; });
    __gs('structuredClone2', () => structuredClone2, (value) => { structuredClone2 = value; });
    __gs('text', () => text, (value) => { text = value; });
    __gs('selectedCurtainGroupId', () => selectedCurtainGroupId, (value) => { selectedCurtainGroupId = value; });
    __gs('sceneMetadata', () => sceneMetadata, (value) => { sceneMetadata = value; });
    __gs('editorRuntime', () => editorRuntime, (value) => { editorRuntime = value; });
    __gs('isDisposed', () => isDisposed, (value) => { isDisposed = value; });
    __gs('isAccessAllowed', () => isAccessAllowed, (value) => { isAccessAllowed = value; });
    __gs('floorSelection', () => floorSelection, (value) => { floorSelection = value; });
    __gs('isRangeEditorOpen', () => isRangeEditorOpen, (value) => { isRangeEditorOpen = value; });
    __gs('subEditorHandle', () => subEditorHandle, (value) => { subEditorHandle = value; });
    __gs('vacuumCameraMode', () => vacuumCameraMode, (value) => { vacuumCameraMode = value; });
    __gs('isCameraEditing', () => isCameraEditing, (value) => { isCameraEditing = value; });
    __gs('editingShowAllLabels', () => editingShowAllLabels, (value) => { editingShowAllLabels = value; });
    __gs('isCameraCommandPending', () => isCameraCommandPending, (value) => { isCameraCommandPending = value; });
    __gs('pendingCameraDraft', () => pendingCameraDraft, (value) => { pendingCameraDraft = value; });
    __gs('num', () => num, (value) => { num = value; });
    __gs('cameraCommandQueue', () => cameraCommandQueue, (value) => { cameraCommandQueue = value; });
    __gs('addDialogState', () => addDialogState, (value) => { addDialogState = value; });
    __gs('pickerHandle', () => pickerHandle, (value) => { pickerHandle = value; });
    __gs('pickerGeneration', () => pickerGeneration, (value) => { pickerGeneration = value; });
    __gs('isSaving', () => isSaving, (value) => { isSaving = value; });
    __gs('isDirty', () => isDirty, (value) => { isDirty = value; });
    __gs('latestStates', () => latestStates, (value) => { latestStates = value; });
    __gs('refreshEffectSettings', () => refreshEffectSettings, (value) => { refreshEffectSettings = value; });
    __gs('bathEffectEditorHandle', () => bathEffectEditorHandle, (value) => { bathEffectEditorHandle = value; });
    __gs('redrawBathEffects', () => redrawBathEffects, (value) => { redrawBathEffects = value; });
    __gs('refreshAirflowStatus', () => refreshAirflowStatus, (value) => { refreshAirflowStatus = value; });
    __gs('renderAirflowSection', () => renderAirflowSection, (value) => { renderAirflowSection = value; });
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
  /**
   * 「显示本类全部标签」点击预览标记：把编辑对象切到被点的设备（0.7.8 `_0x59a404`）。
   *
   * - 同类：只换选中项，不重建会话；
   * - 跨类：先 `switchEditorKind` 切会话，再用第三参把选中项带过去；
   * - 扫地机快捷指令：传入的是 `vacuum-room:<vacuumId>:<shortcutId>`，要还原出 shortcutId。
   */
  function selectPreviewReferenceItem(previewEditEvent: any) {
    if (
      isDisposed ||
      !isAccessAllowed ||
      !editingShowAllLabels ||
      isCameraEditing ||
      isCameraCommandPending ||
      isRangeEditorOpen ||
      previewEditEvent.action !== "select" ||
      previewEditEvent.previewReference !== true ||
      (previewEditEvent.floorId && previewEditEvent.floorId !== floorSelection)
    )
      return;
    const nextModule = previewEditEvent.module,
      nextSelectedId = previewEditEvent.id;
    if (!nextModule || !nextSelectedId) return;
    if (nextModule !== deviceKind) {
      void switchEditorKind(nextModule, false, {
        id: nextSelectedId,
        vacuumId: previewEditEvent.vacuumId || "",
      });
      return;
    }
    let resolvedSelectedId = nextSelectedId;
    if (isVacuumShortcutMode) {
      const vacuumDeviceId = previewEditEvent.vacuumId || vacuumId,
        vacuumModel = structuredClone2.devices?.vacuums?.find(
          (vacuumCandidate: any) => vacuumCandidate.id === vacuumDeviceId,
        ),
        matchedShortcut = (vacuumModel?.shortcuts || []).find(
          (shortcutCandidate: any) =>
            // 同类点击传来的是标识 id；跨类切换（vacuum → vacuum-shortcut）传来的是裸 shortcutId。
            shortcutCandidate.id === nextSelectedId ||
            "vacuum-room:" + vacuumModel.id + ":" + shortcutCandidate.id === nextSelectedId,
        );
      if (!matchedShortcut) return;
      ((vacuumId = vacuumModel.id), (resolvedSelectedId = matchedShortcut.id));
    } else {
      const matchedItem = getItemList().find(
          (previewItemCandidate: any) =>
            previewItemCandidate.id === nextSelectedId &&
            (!previewItemCandidate.floorId || previewItemCandidate.floorId === floorSelection),
        ),
        // 窗帘组合在预览里是独立的「组」条目，id 是 `curtainGroupEntryId`，不在 environment.curtains 里。
        matchedCoverGroup =
          !matchedItem && isCoverMode
            ? getCurtainGroupList().find(
                (groupCandidate: any) => curtainGroupEntryId2(groupCandidate) === nextSelectedId,
              )
            : null;
      if (!matchedItem && !matchedCoverGroup) return;
      matchedCoverGroup && (selectedCurtainGroupId = "");
    }
    (isVacuumMode && (vacuumId = resolvedSelectedId),
      (text = resolvedSelectedId),
      renderPanel(),
      refreshEditorPreview());
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
          entities.map((statesSnapshot: any) => [statesSnapshot.entityId, statesSnapshot]),
        ),
      },
      editing: true,
      editingVacuumId: isVacuumShortcutMode ? vacuumId : "",
      editingShowAllLabels: editingShowAllLabels,
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
          if (editEvent.action === "select" && editEvent.previewReference === true) {
            selectPreviewReferenceItem(editEvent);
            return;
          }
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
