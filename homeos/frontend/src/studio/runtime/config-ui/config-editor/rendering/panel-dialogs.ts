/**
 * 配置编辑器「面板弹窗」：新增条目（`openAddDialog`，含可新增模型清单与种类切换）、
 * 吸尘器房间选择器（`openVacuumRoomPicker`）、幕布分组（`openCurtainGroupDialog`）。
 *
 * 从 panel-rendering.ts 单体切出（P4 6d-2 / 6d-3）。正文逐字复制，只依赖上下文对象 `e` 与
 * 若干兄弟函数，经 `PanelDialogsDeps` 显式传入。
 *
 * 6d-3 新增的三条（`openMetricsDialog` / `openCurtainGroupBatchApplyDialog` /
 * `openLabelBatchApplyDialog`）原本带 `auxDialogElement` / `baselineItemsById` 可变捕获，现按：
 * `auxDialogElement` 改写为 `e.auxDialogElement`（宿主尾部本就有同名访问器，`config-editor.ts`
 * 已在读它 → 零新增 deps）；`baselineItemsById` 收进 `editorSession` 单元。
 */

import { CARD_TEXT_SIZE_PX } from "@app/bridge/presets/card-text-size";
import { DEFAULT_BUTTON_SIZE, buttonIconSize } from "@app/bridge/presets/button-icon-size";
import { openConfigurationPicker } from "../../configuration-picker";
import { bindPickerRow, openDeviceCategoryPicker } from "./picker-row";
import { resolveDeviceCategoryProfile } from "./device-category-choices";
import { configurationProgress } from "../../configuration-progress";
import { createCurtainGroup as createCurtainGroup2, curtainGroupCandidates as curtainGroupCandidates2, curtainGroupEntryId as curtainGroupEntryId2 } from "../../../cover/cover-groups";
import { randomUuid as randomUuid2 } from "@app/shared/util/random-id";
import { withFixedLightEffects as withFixedLightEffects2 } from "@app/bridge/presets/light-effect-policy";
import { DEFAULT_LABEL_ICON_SIZE as DEFAULT_LABEL_ICON_SIZE2, DEFAULT_LABEL_SIZE as DEFAULT_LABEL_SIZE2 } from "@app/bridge/temperature-humidity";
import { copyBatchFields as copyBatchFields2, openBatchApply as openBatchApply2 } from "../../batch-apply";
import { nasGroups as nasGroups2 } from "../../../nas/nas-panel";
import { requestInteraction3dAccess as requestInteraction3dAccess2 } from "@app/bridge/bridge";

/**
 * 面板弹窗需要的外部句柄（**只读**，无 `let` 捕获、无重赋值）。
 *
 * `e` 是 `attachEditorPanelRendering(e)` 的入参；另 7 项是宿主里的兄弟函数，同时挂在宿主末尾
 * `Object.assign(e, {...})` 的公开面上 —— 按 deps 注入与闭包捕获等价。
 */
export interface PanelDialogsDeps {
  /** 配置编辑器上下文对象（`editorHost.panelElement` / `editorHost.createElement` 等）。 */
  editorHost: any;
  /** 关闭「新增」确认弹窗。 */
  closeAddDialog: () => any;
  /** 下拉行（参数较多，按不透明回调注入）。 */
  createSelectRow: (...args: any[]) => any;
  /** 局部重绘编辑器预览。 */
  refreshEditorPreview: (markChanged?: boolean) => any;
  /** 整面板重绘。 */
  renderPanel: () => any;
  /** 可新增的模型清单。 */
  listAddableModels: () => any[];
  /** 按设备种类切换编辑会话（参数较多，按不透明回调注入）。 */
  switchEditorKind: (...args: any[]) => any;
  /** 行控件工厂（标签 + 控件 → 一行元素）。 */
  createSettingRow: (rowContainer: any, rowLabel: any, rowControl: any) => any;
  /**
   * 关闭「辅助弹窗」（宿主里那个 3 行小函数：`close` + `remove` + 置空）。
   * **故意留在宿主**：它既被当函数调用、也被当回调直接传（`e.createButton("取消", closeAuxDialog)`），
   * 带参化会把点击事件当成 deps，所以按依赖注入而不是一起搬走。
   */
  closeAuxDialog: () => any;
  /**
   * 编辑会话基线（**可变单元**）：字段清单 + 条目基线快照。必须是宿主那同一个对象引用
   * （`switchEditorKind` 会重建整份、`renderVacuumShortcutPanel` 会清空）。
   */
  editorSession: { fieldDefs: any[][]; baselineItemsById: Map<any, any> };
  /** 「保存中… / 已保存」状态元素（宿主建面板 chrome 时一次性创建，只读快照等价）。 */
  saveStatusElement: any;
  /** 可编辑字段清单构造器（`switchEditorKind` 重建 `editorSession.fieldDefs` 时用）。 */
  buildEditableFieldList: () => any[][];
  /** 按设备种类把条目拍成「可持久化形状」。 */
  buildItemPayload: (item: any) => any;
  /** 与基线比对，列出改动过的字段名。 */
  listChangedFields: (changedItem: any) => any[][];
}

/** 选择器里读到的条目 / 模型字段（配置编辑器内部形状）。 */
interface PickerChoiceRecord {
  id?: string;
  label?: string;
  icon?: string;
  modelId?: string;
  floorId?: string;
  name?: string;
  [key: string]: unknown;
}

interface AddDialogProgressHost {  sceneMetadata?: { floors?: ReadonlyArray<Record<string, unknown>> } | null;
  floorSelection?: string;
  collectionKey: string;
  modelIdKey: string;
  usesModelBinding?: boolean;
  getItemList: () => ReadonlyArray<Record<string, unknown>>;
}

/**
 * 当前分类 / 当前楼层的配置进度（0.8.1）。
 * 模型库取自场景元数据（按当前楼层收口），已配置取自编辑中的条目列表；
 * 灯组等场景项不需要选模型，只统计「已配置」。
 */
function currentConfigurationProgress(editorHost: AddDialogProgressHost) {
  const floorRecords = editorHost.sceneMetadata?.floors ?? [],
    floorSelection = editorHost.floorSelection,
    scopedFloors =
      floorSelection && floorSelection !== "all"
        ? floorRecords.filter((floorRecord) => floorRecord.id === floorSelection)
        : floorRecords,
    models = scopedFloors.flatMap((floorRecord) => {
      const modelList = editorHost.usesModelBinding
        ? floorRecord[editorHost.collectionKey]
        : floorRecord["groups"];
      return Array.isArray(modelList) ? (modelList as Array<{ id?: unknown }>) : [];
    });
  return configurationProgress({
    models,
    bindings: editorHost.getItemList(),
    modelKey: (model) => model?.id as string | number | null | undefined,
    bindingKey: (binding) => binding[editorHost.modelIdKey] as string | number | null | undefined,
    requiresModel: Boolean(editorHost.usesModelBinding),
  });
}

/**
 * 新增条目选择器（上游 `v475('add')`）：0.8.1 起不再是自建 `i3d-add-dialog`，
 * 改用统一的 `openConfigurationPicker`；已配置的模型留在列表里但禁用，
 * 失败的文案写回弹窗而不是关窗。
 */
export function openAddDialog(deps: PanelDialogsDeps, addDialogTriggerEvent: any = undefined) {
  // 只解构本函数用到的子集（解构全集会被 no-unused-vars 判红）。
  const { editorHost, createSelectRow, createSettingRow, refreshEditorPreview, renderPanel, listAddableModels, switchEditorKind } = deps;
  if (
    editorHost.isDisposed ||
    !editorHost.isAccessAllowed ||
    editorHost.isCameraEditing ||
    editorHost.isCameraCommandPending ||
    editorHost.isRangeEditorOpen ||
    editorHost.addDialogState
  )
    return;
  if (editorHost.isVacuumShortcutMode) {
    openVacuumRoomPicker(deps, addDialogTriggerEvent?.currentTarget || addDialogTriggerEvent?.target);
    return;
  }
  const addableModels = listAddableModels() as ReadonlyArray<{ key: string }>,
    addableModelKeySet = new Set(addableModels.map((addableModelEntry) => addableModelEntry.key)),
    currentFloorRecord = (
      editorHost.sceneMetadata?.floors as ReadonlyArray<Record<string, unknown>> | undefined
    )?.find((floorProbe) => floorProbe.id === editorHost.floorSelection),
    floorModelList = (currentFloorRecord
      ? (editorHost.usesModelBinding
          ? currentFloorRecord[editorHost.collectionKey]
          : currentFloorRecord.groups) || []
      : []) as ReadonlyArray<PickerChoiceRecord>,
    pickerUnit = editorHost.usesModelBinding ? editorHost.kindLabel : "灯组",
    configuredModelKeySet = new Set(
      (editorHost.getItemList() as ReadonlyArray<PickerChoiceRecord>).map((configuredItemProbe) =>
        JSON.stringify([configuredItemProbe.floorId, configuredItemProbe[editorHost.modelIdKey as string]]),
      ),
    );
  let selectedModelKind = "air-conditioner";
  const pickerControlsElement = editorHost.createElement("div"),
    createPickerRow = bindPickerRow(editorHost, createSettingRow);
  editorHost.isDeviceKind &&
    createPickerRow({
      rowContainer: pickerControlsElement,
      rowLabel: "设备类别",
      currentLabel: resolveDeviceCategoryProfile(editorHost.deviceKind).label,
      onOpen: () =>
        openDeviceCategoryPicker(editorHost, {
          environmentCategory: false,
          onPicked: (pickedDeviceKind: string) => switchEditorKind(pickedDeviceKind, true),
        }),
    });
  editorHost.deviceKind === "climate" &&
    createSelectRow(
      pickerControlsElement,
      "设备类型",
      [
        ["air-conditioner", "空调"],
        ["bath-heater", "浴霸"],
      ],
      selectedModelKind,
      (addDialogModelLabel: any) => {
        selectedModelKind = addDialogModelLabel;
      },
    );
  const pickerChoices = floorModelList.map((floorModelEntry) => {
      const modelKey = JSON.stringify([currentFloorRecord?.id, floorModelEntry.id]),
        isConfigured = configuredModelKeySet.has(modelKey) || !addableModelKeySet.has(modelKey);
      return {
        id: modelKey,
        label: editorHost.describeItem(floorModelEntry),
        icon: floorModelEntry.icon || editorHost.defaultIcon,
        wrapLabel: true,
        disabled: isConfigured,
        state: isConfigured ? ("configured" as const) : ("remaining" as const),
        detail: isConfigured ? "已配置" : "未配置 · 点击选择",
      };
    }),
    addGeneration = ++editorHost.pickerGeneration;
  editorHost.pickerHandle?.close();
  let isAdding = false;
  const pickerHandle = openConfigurationPicker({
    document: editorHost.editorDialogElement.ownerDocument,
    title: editorHost.isDeviceKind ? "添加设备" : "添加" + editorHost.kindLabel,
    kicker: "MODEL SELECTION",
    unit: pickerUnit,
    description:
      (currentFloorRecord?.name ? "当前楼层：" + currentFloorRecord.name + "。" : "") +
      "已配置的对象不可重复添加；名称后显示户型备注。最后点击“保存配置”应用修改。",
    summary: currentConfigurationProgress(editorHost),
    controls: pickerControlsElement,
    emptyMessage: "本层没有" + pickerUnit + "，请先在 3D 户型图中添加。",
    sections: [{ options: pickerChoices }],
    async onSelect(chosenModelKey: string) {
      if (
        isAdding ||
        editorHost.isDisposed ||
        !editorHost.isAccessAllowed ||
        editorHost.isCameraEditing ||
        editorHost.isCameraCommandPending ||
        editorHost.isRangeEditorOpen ||
        addGeneration !== editorHost.pickerGeneration
      )
        throw new Error("该配置已变更，请重新选择。");
      isAdding = true;
      try {
        await requestInteraction3dAccess2();
        if (
          editorHost.isDisposed ||
          !editorHost.isAccessAllowed ||
          addGeneration !== editorHost.pickerGeneration
        )
          throw new Error("该配置已变更，请重新选择。");
        const chosenModel = listAddableModels().find(
          (modelCandidateMatch: any) => modelCandidateMatch.key === chosenModelKey,
        );
        if (!chosenModel) throw new Error("该对象已添加或不再可用，请重新选择。");
        const newItem = {
          id: randomUuid2(),
          floorId: chosenModel.floor.id,
          [editorHost.modelIdKey]: chosenModel.group.id,
          entityId: "",
          label: editorHost.describeItem(chosenModel.group),
          ...(editorHost.usesModelBinding
            ? {}
            : {
                x: chosenModel.group.x,
                y: chosenModel.group.y,
                height: chosenModel.group.height ?? chosenModel.floor.wallHeight ?? 2.8,
                fadeDuration: 0.3,
              }),
          ...(editorHost.isCoverMode
            ? {
                coverDirection: "auto",
                curtainFabric: "cloth",
                unboundPosition: 0,
              }
            : {}),
          size: DEFAULT_BUTTON_SIZE,
          iconSize: buttonIconSize(DEFAULT_BUTTON_SIZE),
          visible: true,
          icon:
            editorHost.deviceKind === "fan" && chosenModel.group?.type === "ceiling-fan"
              ? "mdi:ceiling-fan"
              : editorHost.defaultIcon,
          clickAction: editorHost.usesStatusPanel ? "focus-panel" : "focus",
          ...(editorHost.deviceKind === "climate" ? { climateType: selectedModelKind } : {}),
          ...(editorHost.deviceKind === "fan" && chosenModel.group?.type === "ceiling-fan"
            ? { visualMode: "ceiling" }
            : editorHost.deviceKind === "fan"
              ? { visualMode: "tower" }
              : {}),
        };
        (editorHost.usesModelBinding || Object.assign(newItem, withFixedLightEffects2(newItem)),
          editorHost.getItemList().push(newItem),
          (editorHost.text = newItem.id),
          refreshEditorPreview(),
          renderPanel());
      } finally {
        isAdding = false;
      }
    },
    onClose() {
      editorHost.pickerHandle === pickerHandle && (editorHost.pickerHandle = null);
    },
  });
  editorHost.isDisposed || !editorHost.isAccessAllowed || addGeneration !== editorHost.pickerGeneration
    ? pickerHandle.close()
    : (editorHost.pickerHandle = pickerHandle);
}

export async function openVacuumRoomPicker(deps: PanelDialogsDeps, roomPickerTriggerEvent: any) {
  // 只解构本函数用到的子集（解构全集会被 no-unused-vars 判红）。
  const { editorHost, refreshEditorPreview, renderPanel } = deps;
      const vacuumModelRecord = editorHost.findVacuumModel();
      if (!vacuumModelRecord) {
        // 别再静默 return：宿主 `vacuumId` 与模型对不上时（例如切到「快捷指令」后没同步），
        // 之前的表现就是「点了添加快捷指令完全没反应」。
        editorHost.errorMessageElement.textContent =
          "未找到所属扫地机，请先回到「配置内容 - 设备与地图」添加并绑定扫地机。";
        return;
      }
      const vacuumPickerGeneration = ++editorHost.pickerGeneration;
      editorHost.pickerHandle?.close();
      try {
        const entity = await editorHost.pickers.entity({
          trigger: roomPickerTriggerEvent, deviceKind: "vacuum-room",
          current: "",
          onSelect(pickedRoomEntityId: any) {
            if (
              editorHost.isDisposed ||
              !editorHost.isAccessAllowed ||
              vacuumPickerGeneration !== editorHost.pickerGeneration ||
              editorHost.findVacuumModel() !== vacuumModelRecord ||
              !pickedRoomEntityId
            )
              return;
            const entityMetadataEntry = editorHost.entities.find(
                (entityMetadataProbe: any) => entityMetadataProbe.entityId === pickedRoomEntityId,
              ),
              entityStateRecord = editorHost.states?.get?.(pickedRoomEntityId),
              entityStateSnapshot = entityStateRecord?.newState || entityStateRecord,
              roomModelFloor = editorHost.sceneMetadata.floors.find(
                (roomFloorRecord: any) => roomFloorRecord.id === vacuumModelRecord.floorId,
              ),
              roomVacuumModel = roomModelFloor?.vacuums?.find(
                (roomVacuumModelProbe: any) => roomVacuumModelProbe.id === vacuumModelRecord.modelId,
              ),
              flatMap = (roomModelFloor?.plan?.walls || []).flatMap((wallSegment: any) => [
                wallSegment.start,
                wallSegment.end,
              ]),
              averageWallCoordinate = (axisKey: any) =>
                flatMap.length
                  ? flatMap.reduce(
                      (coordinateSum: any, wallPoint: any) => coordinateSum + wallPoint[axisKey],
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
            (editorHost.setItemList([...editorHost.getItemList(), roomShortcutItem]),
              (editorHost.text = roomShortcutItem.id),
              editorHost.pickerGeneration++,
              editorHost.pickerHandle?.close(),
              (editorHost.pickerHandle = null),
              renderPanel(),
              refreshEditorPreview());
          },
        });
        editorHost.isDisposed || vacuumPickerGeneration !== editorHost.pickerGeneration
          ? entity?.close()
          : (editorHost.pickerHandle = entity);
      } catch (roomPickerError: any) {
        editorHost.isDisposed || (editorHost.errorMessageElement.textContent = roomPickerError.message);
      }
    }

export function openCurtainGroupDialog(deps: PanelDialogsDeps, onCancel: any) {
  // 只解构本函数用到的子集（解构全集会被 no-unused-vars 判红）。
  const { editorHost, closeAddDialog, createSelectRow, refreshEditorPreview, renderPanel, createSettingRow } = deps;
      if (
        editorHost.isDisposed ||
        !editorHost.isAccessAllowed ||
        editorHost.isCameraEditing ||
        editorHost.isCameraCommandPending ||
        editorHost.addDialogState
      )
        return;
      const curtainGroupCandidates: { id?: string; entityId?: string; label?: string }[] =
        curtainGroupCandidates2(
        editorHost.structuredClone2.environment,
        onCancel.id,
      );
      if (!curtainGroupCandidates.length) return;
      const curtainGroupDialogElement = editorHost.createElement("dialog", "settings-dialog i3d-add-dialog");
      ((editorHost.addDialogState = curtainGroupDialogElement),
        curtainGroupDialogElement.setAttribute("aria-label", "组合窗帘"));
      const curtainGroupDialogBodyElement = editorHost.createElement("div", "i3d-add-dialog-body"),
        statusHeadingElement = editorHost.createElement("p", "i3d-error");
      curtainGroupDialogBodyElement.append(
        editorHost.createElement("h2", "", "组合窗帘"),
        editorHost.createElement(
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
        statusEntityInputElement = editorHost.createElement("input");
      ((statusEntityInputElement.value = "双层窗帘"),
        (statusEntityInputElement.maxLength = 128),
        createSettingRow(curtainGroupDialogBodyElement, "组合名称", statusEntityInputElement),
        curtainGroupDialogBodyElement.append(
          editorHost.createElement(
            "p",
            "i3d-note",
            "3D 画面只显示双图标，无文字；两个模型仍各自动画。不会移动模型或发送设备命令。",
          ),
        ));
      const confirmStatusButton = editorHost.createButton("确定组合", () => {
        if (!(!editorHost.isAccessAllowed || editorHost.isDisposed || editorHost.addDialogState !== curtainGroupDialogElement))
          try {
            const trimmedStatusValues = createCurtainGroup2(
              editorHost.structuredClone2.environment,
              onCancel.id,
              statusBodyElement.value,
              randomUuid2(),
            );
            ((trimmedStatusValues.label = statusEntityInputElement.value.trim() || "双层窗帘"),
              (editorHost.structuredClone2.environment.curtainGroups = [
                ...editorHost.getCurtainGroupList(),
                trimmedStatusValues,
              ]),
              (editorHost.text = curtainGroupEntryId2(trimmedStatusValues)),
              closeAddDialog(),
              refreshEditorPreview(),
              renderPanel());
          } catch (trimmedStatusValue: any) {
            statusHeadingElement.textContent = trimmedStatusValue.message;
          }
      });
      confirmStatusButton.className = "primary";
      const statusActionsElement = editorHost.createElement("div", "dialog-actions");
      (statusActionsElement.append(editorHost.createButton("取消", closeAddDialog), confirmStatusButton),
        curtainGroupDialogBodyElement.append(statusHeadingElement, statusActionsElement),
        curtainGroupDialogElement.append(curtainGroupDialogBodyElement),
        document.body.append(curtainGroupDialogElement),
        curtainGroupDialogElement.addEventListener("cancel", (statusCancelEvent: any) => {
          (statusCancelEvent.preventDefault(), closeAddDialog());
        }),
        curtainGroupDialogElement.showModal());
    }

export function openMetricsDialog(deps: PanelDialogsDeps, metricsTargetEntry: any) {
  // 只解构本函数用到的子集（解构全集会被 no-unused-vars 判红）。
  const { editorHost, closeAuxDialog, refreshEditorPreview, renderPanel } = deps;
      const statusSource = metricsTargetEntry.statusSource;
      if (
        !statusSource ||
        editorHost.isDisposed ||
        !editorHost.isAccessAllowed ||
        editorHost.isCameraEditing ||
        editorHost.isCameraCommandPending ||
        editorHost.auxDialogElement
      )
        return;
      const set = new Set(
          statusSource.visibleMetrics ||
            statusSource.metrics.map((metricEntry: any) => metricEntry.entityId),
        ),
        list: any = [],
        metricsDialogElement = editorHost.createElement(
          "dialog",
          "settings-dialog i3d-add-dialog i3d-nas-fields-dialog",
        );
      ((editorHost.auxDialogElement = metricsDialogElement),
        metricsDialogElement.setAttribute("aria-label", "选择 NAS 显示内容"));
      const metricsHeadingElement = editorHost.createElement("div", "dialog-heading"),
        metricsTitleElement = editorHost.createElement("h2", "", "选择显示内容"),
        metricsCloseButton = editorHost.createButton("×", closeAuxDialog);
      ((metricsCloseButton.className = "icon-button"),
        metricsCloseButton.setAttribute("aria-label", "关闭显示内容选择"),
        metricsHeadingElement.append(metricsTitleElement, metricsCloseButton));
      const metricsBodyElement = editorHost.createElement("div", "i3d-add-dialog-body"),
        metricsActionsElement = editorHost.createElement("div", "dialog-actions"),
        selectionSummaryElement = editorHost.createElement("span", "i3d-note"),
        syncMetricsSelection = () => {
          selectionSummaryElement.textContent = "已选 " + set.size + " 项";
          for (const metricVisibilityCheckboxElement of list)
            metricVisibilityCheckboxElement.checked = set.has(metricVisibilityCheckboxElement.value);
        };
      metricsActionsElement.append(
        editorHost.createButton("全选", () => {
          (statusSource.metrics.forEach((selectableMetric: any) => set.add(selectableMetric.entityId)),
            syncMetricsSelection());
        }),
        editorHost.createButton("全不选", () => {
          (set.clear(), syncMetricsSelection());
        }),
        selectionSummaryElement,
      );
      const nasFieldsContainerElement = editorHost.createElement("div", "i3d-nas-fields"),
        filter = nasGroups2(statusSource).filter(([nasGroupKey]) =>
          statusSource.metrics.some((nasGroupProbe: any) => nasGroupProbe.group === nasGroupKey),
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
            (fieldGroupProbe: any) => fieldGroupProbe.group === fieldGroupKey,
          ),
          fieldGroupSectionElement = editorHost.createElement("section"),
          fieldGroupHeadingElement = editorHost.createElement("div", "i3d-nas-fields-heading"),
          moveFieldGroup = (groupOffset: any) => {
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
          groupUpButtonElement = editorHost.createButton("↑", () => moveFieldGroup(-1)),
          groupDownButtonElement = editorHost.createButton("↓", () => moveFieldGroup(1));
        (groupUpButtonElement.setAttribute("aria-label", "上移" + fieldGroupLabel + "分组"),
          groupDownButtonElement.setAttribute("aria-label", "下移" + fieldGroupLabel + "分组"),
          (groupUpButtonElement.title = "上移分组"),
          (groupDownButtonElement.title = "下移分组"),
          fieldGroupHeadingElement.append(
            editorHost.createElement("h4", "", fieldGroupLabel),
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
            groupMetrics.forEach((metricItem: any, metricIndex: any) => {
              const metricControl = metricControlsByEntityId.get(metricItem.entityId);
              ((metricControl.up.disabled = metricIndex === 0),
                (metricControl.down.disabled = metricIndex === groupMetrics.length - 1),
                fieldGroupSectionElement.append(metricControl.row));
            });
        for (const nasMetric of groupMetrics) {
          const metricRowElement = editorHost.createElement("div", "i3d-nas-fields-row"),
            metricLabelElement = editorHost.createElement("label"),
            metricCheckboxElement = editorHost.createElement("input");
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
          const moveNasMetric = (metricOffset: any) => {
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
            metricUpButtonElement = editorHost.createButton("↑", () => moveNasMetric(-1)),
            metricDownButtonElement = editorHost.createButton("↓", () => moveNasMetric(1));
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
              editorHost.createElement("span", "", nasMetric.label),
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
      const metricsDialogActionsElement = editorHost.createElement("div", "dialog-actions"),
        confirmMetricsButton = editorHost.createButton("确定", () => {
          if (
            editorHost.isDisposed ||
            !editorHost.isAccessAllowed ||
            metricsTargetEntry.statusSource !== statusSource ||
            !editorHost.getItemList().includes(metricsTargetEntry)
          )
            return closeAuxDialog();
          ((statusSource.metrics = filter.flatMap(
            ([flatGroupKey]) => groupControlsByKey.get(flatGroupKey).metrics,
          )),
            (statusSource.visibleMetrics = statusSource.metrics
              .filter((metricVisibleProbe: any) => set.has(metricVisibleProbe.entityId))
              .map((metricVisibleEntry: any) => metricVisibleEntry.entityId)),
            (statusSource.groupOrder = filter.map(([mapGroupKey]) => mapGroupKey)),
            closeAuxDialog(),
            refreshEditorPreview(),
            renderPanel(),
            editorHost.configurationFeedback?.changed());
        });
      ((confirmMetricsButton.className = "primary"),
        metricsDialogActionsElement.append(
          editorHost.createButton("取消", closeAuxDialog),
          confirmMetricsButton,
        ),
        metricsBodyElement.append(
          metricsActionsElement,
          nasFieldsContainerElement,
          editorHost.createElement("p", "i3d-note", "用 ↑ ↓ 调整分组和组内内容顺序；确定后点击“保存配置”保存。"),
          metricsDialogActionsElement,
        ),
        metricsDialogElement.append(metricsHeadingElement, metricsBodyElement),
        document.body.append(metricsDialogElement),
        syncMetricsSelection(),
        metricsDialogElement.addEventListener("cancel", (metricsCancelEvent: any) => {
          (metricsCancelEvent.preventDefault(), closeAuxDialog());
        }),
        metricsDialogElement.showModal());
    }

export function openCurtainGroupBatchApplyDialog(
  deps: PanelDialogsDeps,
  sourceGroup: any,
  linkedFieldProbe = false,
) {
  // 只解构本函数用到的子集（解构全集会被 no-unused-vars 判红）。
  const { editorHost, editorSession, refreshEditorPreview, renderPanel, buildEditableFieldList, buildItemPayload, listChangedFields } = deps;
      if (
        editorHost.isDisposed ||
        !editorHost.isAccessAllowed ||
        editorHost.isCameraEditing ||
        editorHost.isCameraCommandPending ||
        editorHost.isRangeEditorOpen ||
        editorHost.auxDialogElement
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
      !editorHost.usesModelBinding &&
        !linkedFieldProbe &&
        (displayFieldValue.push(["icon", "图标", ""], ["buttonVisibility", "按钮显示", ""]),
        (options.icon = sourceGroup.icon || editorHost.defaultIcon),
        (options.buttonVisibility = sourceGroup.buttonHidden
          ? "隐藏（不可点击）"
          : sourceGroup.hiddenClickable
            ? "隐藏（可点击）"
            : "显示"));
      const itemFloorId = editorHost.sceneMetadata?.floors
        .find((floorOtherItems: any) => floorOtherItems.id === sourceGroup.floorId)
        ?.[editorHost.collectionKey]?.find((targetFloorRecord: any) => targetFloorRecord.id === sourceGroup.modelId);
      if (
        ((options.height =
          sourceGroup.height ??
          (editorHost.isVacuumShortcutMode
            ? 0.08
            : editorHost.isVacuumMode
              ? (Number(itemFloorId?.elevation) || 0) + (Number(itemFloorId?.height) || 0.85) + 0.25
              : itemFloorId?.height)),
        displayFieldValue.push(["height", "高度", " 米"]),
        !editorHost.isVacuumShortcutMode &&
          editorHost.deviceKind !== "smallcar" &&
          displayFieldValue.push(["clickAction", "点击行为", ""]),
        editorHost.isCoverMode &&
          !linkedFieldProbe &&
          displayFieldValue.push(
            ["iconStateReversed", "图标状态反向", ""],
            ["curtainFabric", "帘布类型", ""],
            ["coverKind", "窗帘类型", ""],
            ["coverDirection", "开合方向", ""],
            ["unboundPosition", "未绑定时展示状态", "%"],
          ),
        editorHost.isVacuumMode &&
          ((options.motionEnabled = sourceGroup.motionEnabled !== false),
          (options.funMessages = sourceGroup.funMessages !== false),
          displayFieldValue.push(
            ["motionEnabled", "跟随真实位置移动", ""],
            ["funMessages", "工作时趣味短句", ""],
          )),
        linkedFieldProbe)
      ) {
        const floorOptionsElement = editorHost.getItemList().find(
            (floorTargetItem: any) => floorTargetItem.id === sourceGroup.memberIds?.[0],
          ),
          checkedTargetCount = editorHost.sceneMetadata?.floors
            .find((checkedFieldProbe: any) => checkedFieldProbe.id === sourceGroup.floorId)
            ?.curtains?.find(
              (checkedFieldCheckbox: any) => checkedFieldCheckbox.id === floorOptionsElement?.modelId,
            );
        ((options.height =
          sourceGroup.height ?? floorOptionsElement?.height ?? checkedTargetCount?.height),
          (options.clickAction = sourceGroup.clickAction || "focus"),
          (options.panelLayout = sourceGroup.panelLayout || "horizontal"),
          displayFieldValue.push(["panelLayout", "弹窗布局", ""]));
      }
      editorHost.isCoverMode &&
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
                  format: (formattedPercentValue: any) => Math.round(formattedPercentValue * 100),
                }
              : {}),
            ...(memberFieldKey === "height"
              ? {
                  format: (formattedSizeLabel: any) =>
                    Number.isFinite(formattedSizeLabel)
                      ? formattedSizeLabel.toFixed(1)
                      : "跟随各自模型",
                }
              : {}),
            ...(memberFieldKey === "buttonVisibility"
              ? {
                  write: (optionHint: any, optionCheckboxList: any) => {
                    ((optionHint.buttonHidden = optionCheckboxList === "隐藏（不可点击）"),
                      (optionHint.hiddenClickable = optionCheckboxList === "隐藏（可点击）"));
                  },
                }
              : {}),
            ...(memberFieldKey === "curtainFabric"
              ? {
                  write: (writeFieldKey: any, writeFieldValue: any) => {
                    ((writeFieldKey.curtainFabric = writeFieldValue),
                      (writeFieldKey.curtainFabricOverride = true));
                  },
                }
              : {}),
            ...(memberFieldKey === "coverKind"
              ? {
                  write: (groupFieldLabel: any, groupFieldUnit: any) => {
                    ((groupFieldLabel.coverKind = groupFieldUnit),
                      (groupFieldLabel.coverKindOverride = true));
                  },
                }
              : {}),
            ...(memberFieldKey === "unboundPosition"
              ? {
                  compatible: (otherCurtainGroup: any) => !otherCurtainGroup.entityId,
                }
              : {}),
          }),
        ),
        selectedFieldKeys = (
          linkedFieldProbe ? editorHost.structuredClone2.environment.curtainGroups : editorHost.getItemList()
        ).filter(
          (batchCancelEvent: any) =>
            batchCancelEvent.id !== sourceGroup.id &&
            (editorHost.isVacuumShortcutMode || batchCancelEvent.floorId === sourceGroup.floorId),
        );
      editorHost.auxDialogElement = openBatchApply2({
        title: linkedFieldProbe ? "应用组合窗帘设置" : "应用" + editorHost.kindLabel + "设置",
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
                      (editorSession.baselineItemsById.get(sourceGroup.id) as any)?.[sourceItem.key],
                  )
                  .map((candidateEntry) => candidateEntry.key),
              ]),
            ],
        onClose: () => {
          editorHost.auxDialogElement = null;
        },
        onApply: async (nextMemberId: any, createGroupError: any) => {
          if (
            (await requestInteraction3dAccess2(),
            editorHost.isDisposed || !editorHost.isAccessAllowed || !editorHost.auxDialogElement?.open)
          )
            throw new Error("配置已关闭或授权不可用");
          for (const batchTargetItem of nextMemberId)
            copyBatchFields2(batchTargetItem, options, createGroupError);
          (refreshEditorPreview(),
            renderPanel(),
            editorHost.configurationFeedback?.changed());
        },
      });
    }

export function openLabelBatchApplyDialog(deps: PanelDialogsDeps, sourceLabelItem: any) {
  // 只解构本函数用到的子集（解构全集会被 no-unused-vars 判红）。
  const { editorHost, refreshEditorPreview, renderPanel } = deps;
      editorHost.isDisposed ||
        !editorHost.isAccessAllowed ||
        editorHost.auxDialogElement ||
        (editorHost.auxDialogElement = openBatchApply2({
          title: "应用环境标签设置",
          source: sourceLabelItem,
          targets: editorHost.getItemList().filter(
            (labelTargetProbe: any) =>
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
              format: (formattedHeightValue: any) => Number(formattedHeightValue).toFixed(1),
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
              format: (opacityPercentValue: any) => Math.round(opacityPercentValue * 100),
            },
            {
              key: "columns",
              label: "排列方式",
              fallback: 0,
              format: (columnCountText: any) =>
                columnCountText ? "每行 " + columnCountText + " 项" : "自动",
            },
            {
              key: "showMetricNames",
              label: "显示指标名称",
              fallback: true,
              format: (resetGroupFocusError: any) => (resetGroupFocusError ? "显示" : "隐藏"),
            },
          ],
          onClose: () => {
            editorHost.auxDialogElement = null;
          },
          onApply: (appliedTargets: any, appliedValues: any) => {
            if (editorHost.isDisposed || !editorHost.isAccessAllowed) throw new Error("配置不可用");
            for (const _args of appliedTargets)
              copyBatchFields2(_args, sourceLabelItem, appliedValues);
            (refreshEditorPreview(),
              renderPanel(),
              editorHost.configurationFeedback?.changed());
          },
        }));
    }
