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
import { createDeviceCategoryRow } from "./device-category-dialog";
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
  /** 配置编辑器上下文对象（`e.panelElement` / `e.createElement` 等）。 */
  e: any;
  /** 关闭「新增」确认弹窗。 */
  closeAddDialog: () => any;
  /** 下拉行（参数较多，按不透明回调注入）。 */
  createSelectRow: (...args: any[]) => any;
  /** 局部重绘编辑器预览。 */
  refreshEditorPreview: () => any;
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

export function openAddDialog(deps: PanelDialogsDeps, addDialogTriggerEvent: any = undefined) {
  // 只解构本函数用到的子集（解构全集会被 no-unused-vars 判红）。
  const { e, closeAddDialog, createSelectRow, createSettingRow, refreshEditorPreview, renderPanel, listAddableModels, switchEditorKind } = deps;
      if (
        e.isDisposed ||
        !e.isAccessAllowed ||
        e.isCameraEditing ||
        e.isCameraCommandPending ||
        e.isRangeEditorOpen ||
        e.addDialogState
      )
        return;
      if (e.isVacuumShortcutMode) {
        openVacuumRoomPicker(deps, addDialogTriggerEvent?.currentTarget || addDialogTriggerEvent?.target);
        return;
      }
      const addableModels = listAddableModels();
      if (!addableModels.length) return;
      (e.pickerGeneration++, e.pickerHandle?.close());
      const addDialogElement = e.createElement("dialog", "settings-dialog i3d-add-dialog");
      ((e.addDialogState = addDialogElement),
        addDialogElement.setAttribute(
          "aria-label",
          e.isDeviceKind ? "添加设备" : "添加" + e.kindLabel + "按钮",
        ));
      const addDialogHeadingElement = e.createElement("div", "dialog-heading"),
        addDialogTitleWrapperElement = e.createElement("div");
      addDialogTitleWrapperElement.append(
        e.createElement("span", "", "ADD BUTTON"),
        e.createElement("h2", "", e.isDeviceKind ? "添加设备" : "添加" + e.kindLabel + "按钮"),
      );
      const addDialogCloseButton = e.createButton("×", closeAddDialog);
      ((addDialogCloseButton.className = "icon-button"),
        addDialogCloseButton.setAttribute("aria-label", "关闭添加按钮窗口"),
        addDialogHeadingElement.append(addDialogTitleWrapperElement, addDialogCloseButton));
      const addDialogBodyElement = e.createElement("div", "i3d-add-dialog-body"),
        addDialogErrorElement = e.createElement("p", "i3d-error");
      (addDialogErrorElement.setAttribute("role", "status"),
        e.isDeviceKind &&
          createDeviceCategoryRow(
            e,
            addDialogBodyElement,
            "设备类型",
            e.deviceKind,
            (pickedDeviceKind: any) => {
              pickedDeviceKind !== e.deviceKind && switchEditorKind(pickedDeviceKind, true);
            },
            createSettingRow,
          ));
      let selectedModelKind = "air-conditioner";
      e.deviceKind === "climate" &&
        createSelectRow(
          addDialogBodyElement,
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
      const modelSelectElement = createSelectRow(
        addDialogBodyElement,
        e.usesModelBinding ? "关联" + e.kindLabel + "模型" : "关联灯组",
        addableModels.map((addableModelEntry: any) => [
          addableModelEntry.key,
          e.describeItem(addableModelEntry.group),
        ]),
        addableModels[0].key,
        () => {
          addDialogErrorElement.textContent = "";
        },
      );
      modelSelectElement.setAttribute(
        "aria-label",
        e.usesModelBinding ? "关联" + e.kindLabel + "模型" : "关联灯组",
      );
      const addDialogActionsElement = e.createElement("div", "dialog-actions");
      let isAdding = false;
      const confirmAddButton = e.createButton("确定添加", async () => {
        if (isAdding || e.isDisposed || !e.isAccessAllowed || e.addDialogState !== addDialogElement) return;
        ((isAdding = true),
          (confirmAddButton.disabled = true),
          (modelSelectElement.disabled = true),
          (addDialogErrorElement.textContent = ""));
        const chosenModelKey = modelSelectElement.value;
        try {
          if (
            (await requestInteraction3dAccess2(),
            e.isDisposed || !e.isAccessAllowed || e.addDialogState !== addDialogElement)
          )
            return;
          const chosenModel = listAddableModels().find(
            (modelCandidateMatch: any) => modelCandidateMatch.key === chosenModelKey,
          );
          if (!chosenModel) throw new Error("该对象已添加或不再可用，请关闭窗口后重新选择。");
          const newItem = {
            id: randomUuid2(),
            floorId: chosenModel.floor.id,
            [e.modelIdKey]: chosenModel.group.id,
            entityId: "",
            label: e.describeItem(chosenModel.group),
            ...(e.usesModelBinding
              ? {}
              : {
                  x: chosenModel.group.x,
                  y: chosenModel.group.y,
                  height: chosenModel.group.height ?? chosenModel.floor.wallHeight ?? 2.8,
                  fadeDuration: 0.3,
                }),
            ...(e.isCoverMode
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
              e.deviceKind === "fan" && chosenModel.group?.type === "ceiling-fan"
                ? "mdi:ceiling-fan"
                : e.defaultIcon,
            clickAction: e.usesStatusPanel ? "focus-panel" : "focus",
            ...(e.deviceKind === "climate" ? { climateType: selectedModelKind } : {}),
            ...(e.deviceKind === "fan" && chosenModel.group?.type === "ceiling-fan"
              ? { visualMode: "ceiling" }
              : e.deviceKind === "fan"
                ? { visualMode: "tower" }
                : {}),
          };
          (e.usesModelBinding || Object.assign(newItem, withFixedLightEffects2(newItem)),
            e.getItemList().push(newItem),
            (e.text = newItem.id),
            closeAddDialog(),
            refreshEditorPreview(),
            renderPanel());
        } catch (addItemError: any) {
          e.addDialogState === addDialogElement &&
            (addDialogErrorElement.textContent = addItemError.message);
        } finally {
          ((isAdding = false),
            (confirmAddButton.disabled = false),
            (modelSelectElement.disabled = false));
        }
      });
      ((confirmAddButton.className = "primary"),
        addDialogActionsElement.append(e.createButton("取消", closeAddDialog), confirmAddButton),
        addDialogBodyElement.append(
          e.createElement(
            "p",
            "i3d-note",
            "添加后可继续设置" + e.kindLabel + "按钮，最后点击“保存配置”完成保存。",
          ),
          addDialogErrorElement,
          addDialogActionsElement,
        ),
        addDialogElement.append(addDialogHeadingElement, addDialogBodyElement),
        document.body.append(addDialogElement),
        addDialogElement.addEventListener("cancel", (addDialogCancelEvent: any) => {
          (addDialogCancelEvent.preventDefault(), closeAddDialog());
        }),
        addDialogElement.showModal());
    }

export async function openVacuumRoomPicker(deps: PanelDialogsDeps, roomPickerTriggerEvent: any) {
  // 只解构本函数用到的子集（解构全集会被 no-unused-vars 判红）。
  const { e, refreshEditorPreview, renderPanel } = deps;
      const vacuumModelRecord = e.findVacuumModel();
      if (!vacuumModelRecord) {
        // 别再静默 return：宿主 `vacuumId` 与模型对不上时（例如切到「快捷指令」后没同步），
        // 之前的表现就是「点了添加快捷指令完全没反应」。
        e.errorMessageElement.textContent =
          "未找到所属扫地机，请先回到「配置内容 - 设备与地图」添加并绑定扫地机。";
        return;
      }
      const vacuumPickerGeneration = ++e.pickerGeneration;
      e.pickerHandle?.close();
      try {
        const entity = await e.pickers.entity({
          trigger: roomPickerTriggerEvent, deviceKind: "vacuum-room",
          current: "",
          onSelect(pickedRoomEntityId: any) {
            if (
              e.isDisposed ||
              !e.isAccessAllowed ||
              vacuumPickerGeneration !== e.pickerGeneration ||
              e.findVacuumModel() !== vacuumModelRecord ||
              !pickedRoomEntityId
            )
              return;
            const entityMetadataEntry = e.entities.find(
                (entityMetadataProbe: any) => entityMetadataProbe.entityId === pickedRoomEntityId,
              ),
              entityStateRecord = e.states?.get?.(pickedRoomEntityId),
              entityStateSnapshot = entityStateRecord?.newState || entityStateRecord,
              roomModelFloor = e.sceneMetadata.floors.find(
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
            (e.setItemList([...e.getItemList(), roomShortcutItem]),
              (e.text = roomShortcutItem.id),
              e.pickerGeneration++,
              e.pickerHandle?.close(),
              (e.pickerHandle = null),
              renderPanel(),
              refreshEditorPreview());
          },
        });
        e.isDisposed || vacuumPickerGeneration !== e.pickerGeneration
          ? entity?.close()
          : (e.pickerHandle = entity);
      } catch (roomPickerError: any) {
        e.isDisposed || (e.errorMessageElement.textContent = roomPickerError.message);
      }
    }

export function openCurtainGroupDialog(deps: PanelDialogsDeps, onCancel: any) {
  // 只解构本函数用到的子集（解构全集会被 no-unused-vars 判红）。
  const { e, closeAddDialog, createSelectRow, refreshEditorPreview, renderPanel, createSettingRow } = deps;
      if (
        e.isDisposed ||
        !e.isAccessAllowed ||
        e.isCameraEditing ||
        e.isCameraCommandPending ||
        e.addDialogState
      )
        return;
      const curtainGroupCandidates: { id?: string; entityId?: string; label?: string }[] =
        curtainGroupCandidates2(
        e.structuredClone2.environment,
        onCancel.id,
      );
      if (!curtainGroupCandidates.length) return;
      const curtainGroupDialogElement = e.createElement("dialog", "settings-dialog i3d-add-dialog");
      ((e.addDialogState = curtainGroupDialogElement),
        curtainGroupDialogElement.setAttribute("aria-label", "组合窗帘"));
      const curtainGroupDialogBodyElement = e.createElement("div", "i3d-add-dialog-body"),
        statusHeadingElement = e.createElement("p", "i3d-error");
      curtainGroupDialogBodyElement.append(
        e.createElement("h2", "", "组合窗帘"),
        e.createElement(
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
        statusEntityInputElement = e.createElement("input");
      ((statusEntityInputElement.value = "双层窗帘"),
        (statusEntityInputElement.maxLength = 128),
        createSettingRow(curtainGroupDialogBodyElement, "组合名称", statusEntityInputElement),
        curtainGroupDialogBodyElement.append(
          e.createElement(
            "p",
            "i3d-note",
            "3D 画面只显示双图标，无文字；两个模型仍各自动画。不会移动模型或发送设备命令。",
          ),
        ));
      const confirmStatusButton = e.createButton("确定组合", () => {
        if (!(!e.isAccessAllowed || e.isDisposed || e.addDialogState !== curtainGroupDialogElement))
          try {
            const trimmedStatusValues = createCurtainGroup2(
              e.structuredClone2.environment,
              onCancel.id,
              statusBodyElement.value,
              randomUuid2(),
            );
            ((trimmedStatusValues.label = statusEntityInputElement.value.trim() || "双层窗帘"),
              (e.structuredClone2.environment.curtainGroups = [
                ...e.getCurtainGroupList(),
                trimmedStatusValues,
              ]),
              (e.text = curtainGroupEntryId2(trimmedStatusValues)),
              closeAddDialog(),
              refreshEditorPreview(),
              renderPanel());
          } catch (trimmedStatusValue: any) {
            statusHeadingElement.textContent = trimmedStatusValue.message;
          }
      });
      confirmStatusButton.className = "primary";
      const statusActionsElement = e.createElement("div", "dialog-actions");
      (statusActionsElement.append(e.createButton("取消", closeAddDialog), confirmStatusButton),
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
  const { e, closeAuxDialog, refreshEditorPreview, renderPanel, saveStatusElement } = deps;
      const statusSource = metricsTargetEntry.statusSource;
      if (
        !statusSource ||
        e.isDisposed ||
        !e.isAccessAllowed ||
        e.isCameraEditing ||
        e.isCameraCommandPending ||
        e.auxDialogElement
      )
        return;
      const set = new Set(
          statusSource.visibleMetrics ||
            statusSource.metrics.map((metricEntry: any) => metricEntry.entityId),
        ),
        list: any = [],
        metricsDialogElement = e.createElement(
          "dialog",
          "settings-dialog i3d-add-dialog i3d-nas-fields-dialog",
        );
      ((e.auxDialogElement = metricsDialogElement),
        metricsDialogElement.setAttribute("aria-label", "选择 NAS 显示内容"));
      const metricsHeadingElement = e.createElement("div", "dialog-heading"),
        metricsTitleElement = e.createElement("h2", "", "选择显示内容"),
        metricsCloseButton = e.createButton("×", closeAuxDialog);
      ((metricsCloseButton.className = "icon-button"),
        metricsCloseButton.setAttribute("aria-label", "关闭显示内容选择"),
        metricsHeadingElement.append(metricsTitleElement, metricsCloseButton));
      const metricsBodyElement = e.createElement("div", "i3d-add-dialog-body"),
        metricsActionsElement = e.createElement("div", "dialog-actions"),
        selectionSummaryElement = e.createElement("span", "i3d-note"),
        syncMetricsSelection = () => {
          selectionSummaryElement.textContent = "已选 " + set.size + " 项";
          for (const metricVisibilityCheckboxElement of list)
            metricVisibilityCheckboxElement.checked = set.has(metricVisibilityCheckboxElement.value);
        };
      metricsActionsElement.append(
        e.createButton("全选", () => {
          (statusSource.metrics.forEach((selectableMetric: any) => set.add(selectableMetric.entityId)),
            syncMetricsSelection());
        }),
        e.createButton("全不选", () => {
          (set.clear(), syncMetricsSelection());
        }),
        selectionSummaryElement,
      );
      const nasFieldsContainerElement = e.createElement("div", "i3d-nas-fields"),
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
          fieldGroupSectionElement = e.createElement("section"),
          fieldGroupHeadingElement = e.createElement("div", "i3d-nas-fields-heading"),
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
          groupUpButtonElement = e.createButton("↑", () => moveFieldGroup(-1)),
          groupDownButtonElement = e.createButton("↓", () => moveFieldGroup(1));
        (groupUpButtonElement.setAttribute("aria-label", "上移" + fieldGroupLabel + "分组"),
          groupDownButtonElement.setAttribute("aria-label", "下移" + fieldGroupLabel + "分组"),
          (groupUpButtonElement.title = "上移分组"),
          (groupDownButtonElement.title = "下移分组"),
          fieldGroupHeadingElement.append(
            e.createElement("h4", "", fieldGroupLabel),
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
          const metricRowElement = e.createElement("div", "i3d-nas-fields-row"),
            metricLabelElement = e.createElement("label"),
            metricCheckboxElement = e.createElement("input");
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
            metricUpButtonElement = e.createButton("↑", () => moveNasMetric(-1)),
            metricDownButtonElement = e.createButton("↓", () => moveNasMetric(1));
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
              e.createElement("span", "", nasMetric.label),
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
      const metricsDialogActionsElement = e.createElement("div", "dialog-actions"),
        confirmMetricsButton = e.createButton("确定", () => {
          if (
            e.isDisposed ||
            !e.isAccessAllowed ||
            metricsTargetEntry.statusSource !== statusSource ||
            !e.getItemList().includes(metricsTargetEntry)
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
            (saveStatusElement.textContent = "显示内容已调整，待保存配置"));
        });
      ((confirmMetricsButton.className = "primary"),
        metricsDialogActionsElement.append(
          e.createButton("取消", closeAuxDialog),
          confirmMetricsButton,
        ),
        metricsBodyElement.append(
          metricsActionsElement,
          nasFieldsContainerElement,
          e.createElement("p", "i3d-note", "用 ↑ ↓ 调整分组和组内内容顺序；确定后点击“保存配置”保存。"),
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
  const { e, editorSession, refreshEditorPreview, renderPanel, saveStatusElement, buildEditableFieldList, buildItemPayload, listChangedFields } = deps;
      if (
        e.isDisposed ||
        !e.isAccessAllowed ||
        e.isCameraEditing ||
        e.isCameraCommandPending ||
        e.isRangeEditorOpen ||
        e.auxDialogElement
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
      !e.usesModelBinding &&
        !linkedFieldProbe &&
        (displayFieldValue.push(["icon", "图标", ""], ["buttonVisibility", "按钮显示", ""]),
        (options.icon = sourceGroup.icon || e.defaultIcon),
        (options.buttonVisibility = sourceGroup.buttonHidden
          ? "隐藏（不可点击）"
          : sourceGroup.hiddenClickable
            ? "隐藏（可点击）"
            : "显示"));
      const itemFloorId = e.sceneMetadata?.floors
        .find((floorOtherItems: any) => floorOtherItems.id === sourceGroup.floorId)
        ?.[e.collectionKey]?.find((targetFloorRecord: any) => targetFloorRecord.id === sourceGroup.modelId);
      if (
        ((options.height =
          sourceGroup.height ??
          (e.isVacuumShortcutMode
            ? 0.08
            : e.isVacuumMode
              ? (Number(itemFloorId?.elevation) || 0) + (Number(itemFloorId?.height) || 0.85) + 0.25
              : itemFloorId?.height)),
        displayFieldValue.push(["height", "高度", " 米"]),
        !e.isVacuumShortcutMode &&
          e.deviceKind !== "smallcar" &&
          displayFieldValue.push(["clickAction", "点击行为", ""]),
        e.isCoverMode &&
          !linkedFieldProbe &&
          displayFieldValue.push(
            ["iconStateReversed", "图标状态反向", ""],
            ["curtainFabric", "帘布类型", ""],
            ["coverKind", "窗帘类型", ""],
            ["coverDirection", "开合方向", ""],
            ["unboundPosition", "未绑定时展示状态", "%"],
          ),
        e.isVacuumMode &&
          ((options.motionEnabled = sourceGroup.motionEnabled !== false),
          (options.funMessages = sourceGroup.funMessages !== false),
          displayFieldValue.push(
            ["motionEnabled", "跟随真实位置移动", ""],
            ["funMessages", "工作时趣味短句", ""],
          )),
        linkedFieldProbe)
      ) {
        const floorOptionsElement = e.getItemList().find(
            (floorTargetItem: any) => floorTargetItem.id === sourceGroup.memberIds?.[0],
          ),
          checkedTargetCount = e.sceneMetadata?.floors
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
      e.isCoverMode &&
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
          linkedFieldProbe ? e.structuredClone2.environment.curtainGroups : e.getItemList()
        ).filter(
          (batchCancelEvent: any) =>
            batchCancelEvent.id !== sourceGroup.id &&
            (e.isVacuumShortcutMode || batchCancelEvent.floorId === sourceGroup.floorId),
        );
      e.auxDialogElement = openBatchApply2({
        title: linkedFieldProbe ? "应用组合窗帘设置" : "应用" + e.kindLabel + "设置",
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
          e.auxDialogElement = null;
        },
        onApply: async (nextMemberId: any, createGroupError: any) => {
          if (
            (await requestInteraction3dAccess2(),
            e.isDisposed || !e.isAccessAllowed || !e.auxDialogElement?.open)
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

export function openLabelBatchApplyDialog(deps: PanelDialogsDeps, sourceLabelItem: any) {
  // 只解构本函数用到的子集（解构全集会被 no-unused-vars 判红）。
  const { e, refreshEditorPreview, renderPanel, saveStatusElement } = deps;
      e.isDisposed ||
        !e.isAccessAllowed ||
        e.auxDialogElement ||
        (e.auxDialogElement = openBatchApply2({
          title: "应用环境标签设置",
          source: sourceLabelItem,
          targets: e.getItemList().filter(
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
            e.auxDialogElement = null;
          },
          onApply: (appliedTargets: any, appliedValues: any) => {
            if (e.isDisposed || !e.isAccessAllowed) throw new Error("配置不可用");
            for (const _args of appliedTargets)
              copyBatchFields2(_args, sourceLabelItem, appliedValues);
            (refreshEditorPreview(),
              renderPanel(),
              (saveStatusElement.textContent =
                "已应用到 " + appliedTargets.length + " 个环境标签，待保存配置"));
          },
        }));
    }
