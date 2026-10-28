/**
 * 配置编辑器面板总装（`renderPanel`）：按当前设备种类把条件区 / 快捷区 / 绑定管理 /
 * 批量应用等分区拼进面板容器，并在拼装过程中就地重建「一键应用」按钮的刷新器。
 *
 * 从 panel-rendering.ts 单体切出（P4，2,606 行）。24 个兄弟函数与上下文对象 `e`
 * 经 `PanelAssemblyDeps` 显式传入；唯一**可变**依赖 `refreshBatchButtons`（宿主 `let`，
 * 本切片会重新赋值、宿主另有 3 处读写）按可变单元 `refreshBatchButtonsCell` 注入 ——
 * 快照解构在这里不等价（本区间有 `await`，且赋值必须回写宿主）。
 */

import { DEFAULT_BUTTON_SIZE } from "@app/bridge/presets/button-icon-size";
import { genericDeviceProfile as genericDeviceProfile2 } from "../../../device/generic-device-catalog";
import { createDeviceCategoryRow } from "./device-category-dialog";
import { appendBackgroundOpacityControl as appendBackgroundOpacityControl2 } from "../../../core/label-appearance";
import { bathEffectEditor as bathEffectEditor2 } from "../../../bath-heater/bath-heater-editor";
import { carChargingMappingError as carChargingMappingError2, carClickAction as carClickAction2, carState as carState2, standardCarBindings as standardCarBindings2 } from "../../../vehicle/car-state";
import { carTireWheels as carTireWheelsFor, defaultCarTires, retargetCarTires as retargetCarTires2, supportsCarTires as supportsCarTires2 } from "../../../vehicle/car-tires";
import { curtainGroupCandidates as curtainGroupCandidates2, curtainGroupEntryId as curtainGroupEntryId2 } from "../../../cover/cover-groups";
import { deviceEntityCatalog as deviceEntityCatalog2 } from "../../device-entity-config";
import { extraLabels as extraLabels2, extraTypes as extraTypes2, purifierDeviceChanged as purifierDeviceChanged2, purifierRelatedEntities as purifierRelatedEntities2 } from "../../../climate/purifier-extras";
import { fanReverseStateOptions, fanSourceAllowed, resolveFanBindingState } from "../../../fan/fan-state";
import { normalizeInteraction3dLightingMode as normalizeInteraction3dLightingMode2 } from "@app/bridge/definition";
import { openInteraction3dRangeEditor as openInteraction3dRangeEditor2 } from "../../range-dialog";
import { openVacuumMapEditor as openVacuumMapEditor2 } from "../../../vacuum/vacuum-map-editor";
import { purifierState as purifierState2 } from "../../../purifier/purifier-state";
import { nasGroups as nasGroups2 } from "../../../nas/nas-panel";
import { lightState as lightState2 } from "../../../light/light-state";
import { deviceMistState as deviceMistState2, isDeviceMistSource as isDeviceMistSource2 } from "../../../environment/device-mist";
import { rangehoodState as rangehoodState2 } from "../../../environment/rangehood-state";
import { vacuumMapIdentity as vacuumMapIdentity2 } from "../../../vacuum/vacuum-map";

/**
 * 面板总装需要的外部句柄。24 个兄弟函数都是宿主 `attachEditorPanelRendering` 体内的函数声明
 * （提升到函数体顶部），`e` 是它的入参；`renderPanel` 被 `Object.assign(e, {..., renderPanel})`
 * 发布，薄绑定保持同名 → 发布面零改写。
 *
 * **唯一可变依赖**是 `refreshBatchButtons`：它在宿主是 `let`（第 150 行声明），`renderPanel`
 * 内部会**重新赋值**它 3 次（本区间还有 11 处 `await`），宿主另有 3 处读写。所以它不能按快照
 * 解构注入（快照会把赋值留在局部、宿主看不到），改按**可变单元** `refreshBatchButtonsCell`
 * 注入 —— 宿主那侧用访问器代理到同一个 `let`，读写始终落在宿主变量上。
 */
/** NAS 配置里的单个指标条目（`statusSource.metrics[]`）。 */
interface NasMetricEntry {
  entityId: string;
  label: string;
  group: string;
  columns?: number;
  rows?: number;
}

export interface PanelAssemblyDeps {
  /** 配置编辑器上下文对象（`editorHost.panelElement` / `editorHost.createElement` / `editorHost.structuredClone2` 等）。 */
  editorHost: any;
  /** 批处理按钮重建器的可变单元（代理到宿主 `let refreshBatchButtons`）。 */
  refreshBatchButtonsCell: { current: () => any };
  /** 局部重绘编辑器预览。 */
  refreshEditorPreview: (markChanged?: boolean) => any;
  /** 建一个分区容器（标题 + section）。 */
  createConfigSection: (sectionTitle: any) => any;
  /** 下拉行。参数较多（容器 / 标签 / 选项 / 回调），按不透明回调注入。 */
  createSelectRow: (...args: any[]) => any;
  /** 行控件工厂（标签 + 控件 → 一行元素）。 */
  createSettingRow: (rowContainer: any, rowLabel: any, rowControl: any) => any;
  /** 关闭「新增」确认弹窗。 */
  closeAddDialog: () => any;
  /** 建一个配置行容器。 */
  createConfigRow: (parentSectionElement: any) => any;
  /** 数字输入行。参数较多，按不透明回调注入。 */
  createNumberRow: (...args: any[]) => any;
  /** 按设备种类切换编辑会话（决定字段集与基线快照）。参数较多，按不透明回调注入。 */
  switchEditorKind: (...args: any[]) => any;
  /** 尺寸行（宽 / 高 / 点击范围 / 缓动时长）。 */
  createSizeRow: (
    sizeRowContainer: any,
    sizeRowLabel: any,
    readSizeValue: any,
    onSizeValueChange: any,
  ) => any;
  /** 「一键应用到其他」批量对话框（灯光 / 幕布分组共用）。 */
  openCurtainGroupBatchApplyDialog: (sourceGroup: any, linkedFieldProbe?: boolean) => any;
  /** 列出改动过的字段名（用于「N 项修改」计数）。 */
  listChangedFields: (changedItem: any) => any;
  /** 吸尘器快捷面板。 */
  renderVacuumShortcutPanel: () => any;
  /** 额外控制项分区（空调 / 晾衣架 / 风扇 / 净化器 / 热水器的附加控件）。 */
  renderExtraControlsSection: () => any;
  /** 运行时属性（供状态规则与持久化共用的形状）。参数较多，按不透明回调注入。 */
  buildRuntimeProperties: (...args: any[]) => any;
  /** 可新增的模型清单。 */
  listAddableModels: () => any[];
  /** 打开「新增」弹窗。 */
  openAddDialog: (addDialogTriggerEvent?: any) => any;
  /** 幕布分组分区。 */
  renderCurtainGroupSection: (curtainGroup: any) => any;
  /** 打开指标弹窗（0.8.1 起仅保留兼容句柄，NAS 指标选择已改为内联折叠面板）。 */
  openMetricsDialog: (metricsTargetEntry: any) => any;
  /** 空气净化器绑定分区。 */
  renderAirPurifierBindingSection: (
    sizeFieldContainer: any,
    sizeFieldTarget: any,
    sizeFieldOptions: any,
  ) => any;
  /** 打开幕布分组对话框。 */
  openCurtainGroupDialog: (onCancel: any) => any;
  /** 图标尺寸联动。 */
  syncLinkedIconSize: (targetConfig: any, nextButtonSize: any) => any;
  /** 状态规则分区渲染（已先搬入 `./panel-sections`，此处按宿主薄绑定注入）。 */
  renderStatusRuleSection: (
    statusSettingsSectionElement: any,
    statusItem: any,
    statusOptions?: any,
  ) => any;
  /** 保存按钮元素（宿主 `const`，第 615 行建）。 */
  saveButtonElement: any;
}

export function renderPanelImpl(deps: PanelAssemblyDeps) {
  // 切片内 24 处递归自调用 `renderPanel()`：复用同一 deps，调用方不必重复装配句柄。
  const renderPanel = () => renderPanelImpl(deps);
  // 解构成本地名；正文唯一改动是 refreshBatchButtons 的 3 处赋值 + 2 处读取改走可变单元。
  const {
    editorHost,
    refreshBatchButtonsCell,
    refreshEditorPreview,
    createConfigSection,
    createSelectRow,
    createSettingRow,
    closeAddDialog,
    createConfigRow,
    createNumberRow,
    switchEditorKind,
    createSizeRow,
    openCurtainGroupBatchApplyDialog,
    listChangedFields,
    renderVacuumShortcutPanel,
    renderExtraControlsSection,
    buildRuntimeProperties,
    listAddableModels,
    openAddDialog,
    renderCurtainGroupSection,
    // 0.8.1：NAS 指标选择改用内联折叠面板，弹窗句柄保留但此处不再使用。
    openMetricsDialog: _openMetricsDialog,
    renderAirPurifierBindingSection,
    openCurtainGroupDialog,
    syncLinkedIconSize,
    renderStatusRuleSection,
    saveButtonElement,
  } = deps;
      ((editorHost.refreshEffectSettings = () => {}),
        (editorHost.bathEffectEditorHandle = () => {}),
        (editorHost.redrawBathEffects = () => {}),
        (editorHost.refreshAirflowStatus = () => {}),
        (editorHost.renderAirflowSection = () => {}),
        (editorHost.redrawDeviceMistSection = () => {}),
        (editorHost.redrawRangehoodSection = () => {}),
        (refreshBatchButtonsCell.current = () => {}),
        editorHost.panelElement.replaceChildren());
      let currentContainer = editorHost.panelElement;
      if (editorHost.isVacuumShortcutMode) {
        renderVacuumShortcutPanel();
        return;
      }
      if (editorHost.sceneMetadata) {
        if (
          ((currentContainer = createConfigRow(createConfigSection("配置范围"))),
          createSelectRow(
            currentContainer,
            "配置楼层",
            editorHost.sceneMetadata.floors.map((floorOptionEntry: any) => [
              floorOptionEntry.id,
              floorOptionEntry.name,
            ]),
            editorHost.floorSelection,
            (pickedFloorId: any) => {
              (editorHost.pickerGeneration++,
                editorHost.pickerHandle?.close(),
                (editorHost.floorSelection = pickedFloorId),
                renderPanel(),
                refreshEditorPreview());
            },
          ),
          editorHost.isDeviceKind &&
            createDeviceCategoryRow(
              editorHost,
              currentContainer,
              "设备类别",
              editorHost.deviceKind,
              (pickedDeviceCategory: any) => {
                pickedDeviceCategory !== editorHost.deviceKind && switchEditorKind(pickedDeviceCategory);
              },
              createSettingRow,
            ),
          editorHost.includes &&
            createSelectRow(
              currentContainer,
              "环境类别",
              [
                ["climate", "空调/浴霸"],
                ["cover", "窗帘"],
                ["fan", "风扇 / 吊扇"],
                ["exhaust-fan", "排气扇"],
                ["purifier", "空气净化器"],
                ["temperature-humidity", "环境标签"],
              ],
              editorHost.deviceKind,
              (pickedEnvironmentCategory: any) => {
                pickedEnvironmentCategory !== editorHost.deviceKind &&
                  switchEditorKind(pickedEnvironmentCategory);
              },
            ),
          editorHost.isVacuumMode &&
            createSelectRow(
              currentContainer,
              "配置内容",
              [
                ["vacuum", "设备与地图"],
                ["vacuum-shortcut", "快捷指令"],
              ],
              editorHost.deviceKind,
              (pickedVacuumCategory: any) => {
                pickedVacuumCategory !== editorHost.deviceKind && switchEditorKind(pickedVacuumCategory);
              },
            ),
          editorHost.isTemperatureHumidityMode)
        ) {
          (renderExtraControlsSection(),
            editorHost.panelElement.append(editorHost.errorMessageElement),
            (saveButtonElement.disabled = editorHost.isSaving || !editorHost.isAccessAllowed));
          return;
        }
        if (
          !editorHost.usesModelBinding &&
          normalizeInteraction3dLightingMode2(editorHost.structuredClone2.lightingMode) === "region"
        ) {
          const rangeSectionElement = createConfigSection("照射范围"),
            rangeEditorButton = editorHost.createButton("编辑照射范围", async () => {
              if (!editorHost.isRangeEditorOpen) {
                ((editorHost.isRangeEditorOpen = true), (rangeEditorButton.disabled = true));
                try {
                  const rangeEditorHandle = await openInteraction3dRangeEditor2({ component: {
                      ...editorHost.component,
                      properties: structuredClone(buildRuntimeProperties()),
                    },
                    document: editorHost.documentApi, states: editorHost.states,
                    onSave(savedLightRegion: any) {
                      if (editorHost.isDisposed || !editorHost.isAccessAllowed)
                        throw new Error("灯光配置已关闭，请重新打开。");
                      ((editorHost.structuredClone2.lightRegionOverrides = structuredClone(savedLightRegion)),
                        refreshEditorPreview());
                    },
                    onClose() {
                      ((editorHost.subEditorHandle = null),
                        (editorHost.isRangeEditorOpen = false),
                        editorHost.isDisposed || renderPanel());
                    },
                  });
                  if (editorHost.isDisposed || !editorHost.isAccessAllowed) {
                    rangeEditorHandle.close();
                    return;
                  }
                  editorHost.subEditorHandle = rangeEditorHandle;
                } catch (rangeEditorError: any) {
                  ((editorHost.isRangeEditorOpen = false),
                    editorHost.isDisposed || (editorHost.errorMessageElement.textContent = rangeEditorError.message));
                } finally {
                  editorHost.isDisposed || renderPanel();
                }
              }
            });
          if (!rangeEditorButton) return;
          ((rangeEditorButton.dataset ||= {}),
            (rangeEditorButton.dataset.interaction3dRangeEditor = "true"),
            (rangeEditorButton.disabled = editorHost.isRangeEditorOpen || !editorHost.structuredClone2.sceneId),
            rangeSectionElement.append(
              rangeEditorButton,
              editorHost.createElement(
                "p",
                "i3d-note",
                "在独立弹窗中拖动范围；保存范围后，再点击“保存配置”保存到当前控件。",
              ),
            ));
        }
        ((currentContainer = createConfigSection(editorHost.usesModelBinding ? "模型列表" : "灯光列表")),
          (currentContainer.className += " i3d-compact-list"));
        const lightHeadingElement = editorHost.createElement("div", "i3d-light-heading"),
          addItemButton = listAddableModels(),
          addEntryButton = editorHost.createButton("添加" + editorHost.kindLabel, openAddDialog);
        ((addEntryButton.disabled = !addItemButton.length),
          (lightHeadingElement.className = "i3d-config-list-row"),
          currentContainer.append(lightHeadingElement),
          lightHeadingElement.append(addEntryButton));
        const groupedCurtainModelIdSet = new Set(
            editorHost.isCoverMode
              ? editorHost.getCurtainGroupList().flatMap((sceneFloorProbe: any) => sceneFloorProbe.memberIds)
              : [],
          ),
          floorItems = (
            editorHost.isCoverMode
              ? [
                  ...editorHost.getCurtainGroupList().map((groupCandidateEntry: any) => ({
                    ...groupCandidateEntry,
                    id: curtainGroupEntryId2(groupCandidateEntry),
                    label: (groupCandidateEntry.label || "双层窗帘") + "（组合）",
                  })),
                  ...editorHost.getItemList().filter(
                    (unboundItemProbe: any) => !groupedCurtainModelIdSet.has(unboundItemProbe.id),
                  ),
                ]
              : editorHost.getItemList()
          ).filter(
            (optionEntry: any) =>
              optionEntry.floorId === editorHost.floorSelection ||
              (editorHost.usesModelBinding &&
                !editorHost.sceneMetadata.floors.some(
                  (existingFloorItemProbe: any) => existingFloorItemProbe.id === optionEntry.floorId,
                )),
          ),
          curtainGroupOptions = editorHost.selectedCurtainGroupId
            ? curtainGroupEntryId2(editorHost.findCurtainGroupOf(editorHost.selectedCurtainGroupId))
            : editorHost.describeGroupFieldValue();
        // 「当前按钮」的初值必须和 `editorHost.text` 一起定：上面这一兜底会改写 text
        // （换楼层 / 条目被删 / 预览里选中的是别层设备），而下拉拿不到匹配项时会静默退回
        // 第一项 —— 看着就是「选中的灯被默认值顶掉了」。所以值在兜底之后再取一次。
        (!floorItems.some((itemProbe: any) => itemProbe.id === curtainGroupOptions) &&
          !editorHost.selectedCurtainGroupId &&
          (editorHost.text = floorItems[0]?.id || ""),
          floorItems.length &&
            createSelectRow(
              lightHeadingElement,
              editorHost.isDeviceKind ? "当前设备" : "当前按钮",
              floorItems.map((itemOptionEntry: any) => [itemOptionEntry.id, itemOptionEntry.label]),
              editorHost.describeGroupFieldValue(),
              (pickedItemId: any) => {
                (editorHost.pickerGeneration++,
                  editorHost.pickerHandle?.close(),
                  (editorHost.text = pickedItemId),
                  (editorHost.selectedCurtainGroupId = ""),
                  refreshEditorPreview(),
                  renderPanel());
              },
            ));
        const activeCurtainGroup =
          editorHost.isCoverMode &&
          editorHost.getCurtainGroupList().find(
            (curtainGroupProbe: any) => curtainGroupEntryId2(curtainGroupProbe) === editorHost.text,
          );
        if (activeCurtainGroup) {
          (renderCurtainGroupSection(activeCurtainGroup),
            editorHost.panelElement.append(editorHost.errorMessageElement),
            (saveButtonElement.disabled =
              editorHost.isSaving || !editorHost.isAccessAllowed || editorHost.isCameraEditing || editorHost.isCameraCommandPending));
          return;
        }
        const vector = editorHost.getItemList().find((matchedItemProbe: any) => matchedItemProbe.id === editorHost.text);
        if (vector) {
          const removeItemButton = editorHost.createButton(
            editorHost.isDeviceKind ? "删除此设备" : "删除此" + editorHost.kindLabel + "按钮",
            () => {
              (editorHost.pickerGeneration++,
                editorHost.pickerHandle?.close(),
                editorHost.setItemList(
                  editorHost.getItemList().filter((removedItemProbe: any) => removedItemProbe.id !== vector.id),
                ),
                editorHost.isCoverMode &&
                  editorHost.findCurtainGroupOf(vector.id) &&
                  (editorHost.structuredClone2.environment.curtainGroups = editorHost.getCurtainGroupList().filter(
                    (groupMemberProbe: any) => !groupMemberProbe.memberIds.includes(vector.id),
                  )),
                (editorHost.text = ""),
                (editorHost.selectedCurtainGroupId = ""),
                refreshEditorPreview(),
                renderPanel());
            },
          );
          removeItemButton.className = "i3d-remove-light";
          const matchedCurtainGroup = editorHost.isCoverMode && editorHost.findCurtainGroupOf(vector.id);
          (matchedCurtainGroup &&
            createConfigSection("组合成员").append(
              editorHost.createElement(
                "p",
                "i3d-note",
                "这里只调整成员模型、实体、图标和帘布；入口位置、大小、隐藏方式和聚焦视角由组合统一管理。",
              ),
              editorHost.createButton("返回组合入口设置", () => {
                ((editorHost.text = curtainGroupEntryId2(matchedCurtainGroup)),
                  (editorHost.selectedCurtainGroupId = ""),
                  refreshEditorPreview(),
                  renderPanel());
              }),
            ),
            (currentContainer = createConfigSection("基础绑定")));
          const isBathHeaterMode = editorHost.deviceKind === "climate" && vector.climateType === "bath-heater",
            isPurifierMode = editorHost.deviceKind === "purifier",
            isWaterHeaterMode = editorHost.deviceKind === "water-heater",
            isFanMode = editorHost.deviceKind === "fan",
            isExhaustFanMode = editorHost.deviceKind === "exhaust-fan",
            bindingContainer =
              isBathHeaterMode || isPurifierMode || isWaterHeaterMode || isFanMode || isExhaustFanMode;
          (bindingContainer && !vector.entityId && (vector.clickAction = "focus"),
            editorHost.deviceKind === "climate" &&
              createSelectRow(
                currentContainer,
                "设备类型",
                [
                  ["air-conditioner", "空调"],
                  ["bath-heater", "浴霸"],
                ],
                vector.climateType || "air-conditioner",
                (pickedClimateType: any) => {
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
            nameInputElement = editorHost.createElement("input");
          if (
            ((nameInputElement.value = vector.label),
            (nameInputElement.maxLength = 128),
            nameInputElement.addEventListener("change", () => {
              ((vector.label = nameInputElement.value.trim() || editorHost.kindLabel), refreshEditorPreview());
            }),
            createSettingRow(nameRowElement, "名称", nameInputElement),
            editorHost.usesModelBinding)
          ) {
            const flatMap2 = editorHost.sceneMetadata.floors
                .filter((candidateFloorProbe: any) => candidateFloorProbe.id === editorHost.floorSelection)
                .flatMap((candidateFloor: any) =>
                  (candidateFloor[editorHost.collectionKey] || [])
                    .filter(
                      (candidateModel: any) =>
                        !editorHost.getItemList().some(
                          (existingModelProbe: any) =>
                            existingModelProbe !== vector &&
                            existingModelProbe.floorId === candidateFloor.id &&
                            existingModelProbe.modelId === candidateModel.id,
                        ),
                    )
                    .map((modelCandidateEntry: any) => ({
                      floor: candidateFloor,
                      model: modelCandidateEntry,
                      key: candidateFloor.id + "/" + modelCandidateEntry.id,
                    })),
                ),
              currentModelKey = vector.floorId + "/" + vector.modelId,
              some = flatMap2.some((candidateKeyProbe: any) => candidateKeyProbe.key === currentModelKey),
              modelSelectOptions = flatMap2.map((modelKeyEntry: any) => [
                modelKeyEntry.key,
                editorHost.describeItem(modelKeyEntry.model),
              ]);
            (some || modelSelectOptions.unshift([currentModelKey, "原模型已移除，请重新选择"]),
              createSelectRow(
                nameRowElement,
                "关联" + editorHost.kindLabel + "模型",
                modelSelectOptions,
                currentModelKey,
                (pickedModelKey: any) => {
                  const matchedModel = flatMap2.find(
                    (matchedModelCandidate: any) => matchedModelCandidate.key === pickedModelKey,
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
                  editorHost.createElement(
                    "p",
                    "i3d-note",
                    "原模型已移除，请重新选择。已保存的实体绑定和按钮设置仍然保留。",
                  ),
                ));
          }
          currentContainer = bindingRowElement;
          const deviceIdOfEntity = (entityId: any) => {
              const boundCatalogEntry = editorHost.entities.find(
                (catalogProbe: any) => catalogProbe.entityId === entityId,
              );
              return boundCatalogEntry?.deviceId || boundCatalogEntry?.device_id || "";
            },
            temperatureHumidityPickerKinds = () =>
              vector.deviceId || deviceIdOfEntity(vector.entityId),
            openDeviceChangeDialog = (onConfirm: any, bodyHint: any) => {
              const deviceChangeDialogElement = editorHost.createElement(
                "dialog",
                "settings-dialog i3d-add-dialog i3d-device-change-dialog",
              );
              ((editorHost.addDialogState = deviceChangeDialogElement),
                deviceChangeDialogElement.setAttribute("aria-label", "更换设备"));
              const deviceChangeHeadingElement = editorHost.createElement("div", "dialog-heading");
              deviceChangeHeadingElement.append(editorHost.createElement("h2", "", "更换设备"));
              const deviceChangeBodyElement = editorHost.createElement("div", "i3d-add-dialog-body", bodyHint),
                deviceChangeActionsElement = editorHost.createElement("div", "dialog-actions"),
                confirmDeviceChangeButton = editorHost.createButton("确定更换", () => {
                  (closeAddDialog(),
                    !editorHost.isDisposed && editorHost.isAccessAllowed && editorHost.getItemList().includes(vector) && onConfirm());
                });
              ((confirmDeviceChangeButton.className = "primary"),
                deviceChangeActionsElement.append(
                  editorHost.createButton("取消", closeAddDialog),
                  confirmDeviceChangeButton,
                ),
                deviceChangeDialogElement.append(
                  deviceChangeHeadingElement,
                  deviceChangeBodyElement,
                  deviceChangeActionsElement,
                ),
                editorHost.editorDialogElement.append(deviceChangeDialogElement),
                deviceChangeDialogElement.addEventListener("cancel", (deviceChangeCancelEvent: any) => {
                  (deviceChangeCancelEvent.preventDefault(), closeAddDialog());
                }),
                deviceChangeDialogElement.showModal());
            },
            openItemPicker = async (targetField: any, itemPickerTrigger: any) => {
              const isEntityField = ++editorHost.pickerGeneration;
              editorHost.errorMessageElement.textContent = "";
              if (targetField === "entity" && isExhaustFanMode && !vector.deviceId) {
                editorHost.errorMessageElement.textContent =
                  "请先选择排气扇设备，再选择该设备下的主实体。";
                return;
              }
              try {
                const pickerMethod =
                  editorHost.pickers?.[targetField === "powerEntity" ? "entity" : targetField];
                if (!pickerMethod) throw new Error("选择器尚未准备好，请保存后刷新页面。");
                const itemPickerHandle = await pickerMethod({
                  trigger: itemPickerTrigger,
                  deviceIcon: editorHost.defaultIcon, deviceKind:
                    targetField === "powerEntity"
                      ? editorHost.deviceKind === "computer"
                        ? "computer-power"
                        : "television-power"
                      : isBathHeaterMode
                        ? "bath-heater"
                        : editorHost.deviceKind,
                  entityFilter:
                    bindingContainer && targetField === "entity" && vector.deviceId
                      ? (deviceIdFilterProbe: any) =>
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
                  onSelect(pickedDevice: any, pickedDeviceEntity: any) {
                    if (!(
                      editorHost.isDisposed ||
                      !editorHost.isAccessAllowed ||
                      isEntityField !== editorHost.pickerGeneration ||
                      !editorHost.getItemList().includes(vector)
                    )) {
                      if (
                        ((targetField === "entity" || targetField === "powerEntity") &&
                          ((editorHost.entities = editorHost.pickers.entityCatalog?.() || editorHost.entities),
                          pickedDeviceEntity?.entityId === pickedDevice &&
                            (editorHost.entities = [
                              ...editorHost.entities.filter(
                                (newCatalogEntryProbe: any) =>
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
                              vector.runEntityId ||
                              vector.speedEntityId ||
                              vector.directionEntityId ||
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
                              // 风扇/吊扇的动画来源：跟随实体与反转状态只属于原设备。
                              delete vector.runEntityId,
                              delete vector.speedEntityId,
                              delete vector.directionEntityId,
                              delete vector.reverseState,
                              delete vector.workingState,
                              delete vector.statusRules,
                              delete vector.batteryEntityId,
                              delete vector.chargingEntityId,
                              delete vector.chargingStates,
                              delete vector.animationEntityId,
                              // 胎压：解绑/换设备只关掉并清空轮位，样式字段保留。
                              vector.tirePressure &&
                                (vector.tirePressure = {
                                  ...vector.tirePressure,
                                  enabled: false,
                                  wheels: {},
                                }));
                            const isSameDeviceId =
                              bindingContainer && !!pickedDeviceId && deviceId2 === pickedDeviceId;
                            if (
                              ((vector.deviceId = pickedDevice?.deviceId || ""),
                              (vector.deviceName = pickedDevice?.name || ""),
                              isSameDeviceId || (vector.entityId = ""),
                              pickedDevice &&
                                (editorHost.map.set(pickedDevice.deviceId, pickedDevice),
                                (editorHost.entities = [
                                  ...editorHost.entities.filter(
                                    (deviceEntityProbe: any) =>
                                      (deviceEntityProbe.deviceId || deviceEntityProbe.device_id) !==
                                      pickedDevice.deviceId,
                                  ),
                                  ...pickedDevice.entities,
                                ])),
                              editorHost.deviceKind === "smallcar")
                            ) {
                              const defaultCarBinding = standardCarBindings2(
                                deviceEntityCatalog2(
                                  editorHost.entities,
                                  vector.deviceId,
                                  editorHost.latestStates || editorHost.states,
                                ),
                              );
                              for (const carBindingFieldName of [
                                "batteryEntityId",
                                "chargingEntityId",
                              ])
                                vector[carBindingFieldName] ||
                                  (vector[carBindingFieldName] =
                                    (defaultCarBinding as any)[carBindingFieldName]);
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
                                : editorHost.deviceKind === "smallcar"
                                  ? "更换或解绑设备将清空车辆状态、四轮胎压和附加功能绑定，胎压样式保留。取消保留原配置，保存后生效。"
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
                              editorHost.map.set(pickedDevice.deviceId, pickedDevice)));
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
                                      (orderedMetricEntry: any, metricOrderIndex: any) => [
                                        orderedMetricEntry.entityId,
                                        metricOrderIndex,
                                      ],
                                    ),
                                  );
                                  pickedDevice.metrics.sort(
                                    (comparedMetricEntry: any, otherMetricEntry: any) =>
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
                                    .filter((visibleMetricProbe: any) =>
                                      previouslyVisibleMetricSet.has(visibleMetricProbe.entityId),
                                    )
                                    .map((visibleMetricEntry: any) => visibleMetricEntry.entityId);
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
                                    editorHost.errorMessageElement.textContent =
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
                                            (bathEffectFilterProbe: any) =>
                                              bathEffectFilterProbe.entityId !== vector.entityId ||
                                              bathEffectFilterProbe.entityId === pickedDevice ||
                                              vector.extraControls?.some(
                                                (keptExtraControlProbe: any) =>
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
                                          (removedExtraControlProbe: any) =>
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
                                      editorHost.deviceKind,
                                    ) &&
                                    (vector.extraControls?.length ||
                                      vector.workingState ||
                                      vector.statusRules) &&
                                    purifierDeviceChanged2(editorHost.entities, vector.entityId, pickedDevice)
                                  ) {
                                    const purifierChangeDialogElement = editorHost.createElement(
                                      "dialog",
                                      "settings-dialog i3d-add-dialog i3d-device-change-dialog",
                                    );
                                    ((editorHost.addDialogState = purifierChangeDialogElement),
                                      purifierChangeDialogElement.setAttribute(
                                        "aria-label",
                                        "更换" + editorHost.kindLabel + "设备",
                                      ));
                                    const purifierChangeHeadingElement = editorHost.createElement(
                                      "div",
                                      "dialog-heading",
                                    );
                                    purifierChangeHeadingElement.append(
                                      editorHost.createElement("h2", "", "更换" + editorHost.kindLabel + "设备"),
                                    );
                                    const purifierChangeTitleElement = editorHost.createElement(
                                        "div",
                                        "i3d-add-dialog-body",
                                        "更换设备会清除当前附加功能和指示灯规则，避免使用旧设备状态。取消将保留原绑定；外层保存后才正式生效。",
                                      ),
                                      purifierChangeActionsElement = editorHost.createElement(
                                        "div",
                                        "dialog-actions",
                                      ),
                                      confirmPurifierChangeButton = editorHost.createButton("确定更换", () => {
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
                                        editorHost.createButton("取消", closeAddDialog),
                                        confirmPurifierChangeButton,
                                      ),
                                      purifierChangeDialogElement.append(
                                        purifierChangeHeadingElement,
                                        purifierChangeTitleElement,
                                        purifierChangeActionsElement,
                                      ),
                                      editorHost.editorDialogElement.append(purifierChangeDialogElement),
                                      purifierChangeDialogElement.addEventListener(
                                        "cancel",
                                        (purifierDialogCancelEvent: any) => {
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
                                      ].includes(editorHost.deviceKind) &&
                                        (vector.extraControls = (vector.extraControls || []).filter(
                                          (otherControlProbe: any) =>
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
                editorHost.isDisposed || !editorHost.isAccessAllowed || isEntityField !== editorHost.pickerGeneration
                  ? itemPickerHandle?.close()
                  : (editorHost.pickerHandle = itemPickerHandle);
              } catch (itemPickerError: any) {
                !editorHost.isDisposed &&
                  isEntityField === editorHost.pickerGeneration &&
                  (editorHost.errorMessageElement.textContent = itemPickerError.message);
              }
            },
            itemEntityMetadata = editorHost.entities.find(
              (metadataLookupProbe: any) => metadataLookupProbe.entityId === vector.entityId,
            );
          const renderDeviceScreenImageSection = (
            sectionTitle: string,
            imageAlt: string,
            uploadAriaLabel: string,
            emptyStatusText: string,
            noteText: string,
          ) => {
            const posterAssetSection = createConfigSection(sectionTitle),
              posterAssetStatusElement = editorHost.createElement("p", "i3d-note", emptyStatusText),
              posterAssetUploadInput = editorHost.createElement("input");
            ((posterAssetUploadInput.type = "file"),
              (posterAssetUploadInput.accept =
                "image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/gif,image/bmp,image/tiff,image/avif,image/heic,image/heif,image/x-icon,.png,.jpg,.jpeg,.webp,.svg,.gif,.bmp,.tif,.tiff,.ico,.avif,.heic,.heif"),
              (posterAssetUploadInput.hidden = true),
              posterAssetUploadInput.setAttribute("aria-label", uploadAriaLabel));
            let isPosterUploading = false;
            const currentScreenAssetId = () => {
                const assetId = vector.screenImage?.assetId;
                return typeof assetId == "string" && /^user:[0-9a-f]{32}$/i.test(assetId.trim())
                  ? assetId.trim().toLowerCase()
                  : "";
              },
              refreshPosterAssetUi = () => {
                const hasPoster = !!currentScreenAssetId();
                posterAssetStatusElement.textContent = isPosterUploading
                  ? "上传中…"
                  : hasPoster
                    ? emptyStatusText + "（已设置）"
                    : emptyStatusText;
              },
              uploadPosterAsset = async (selectedFile: any) => {
                if (!selectedFile || isPosterUploading) return;
                isPosterUploading = true;
                refreshPosterAssetUi();
                try {
                  const uploadResponse = await fetch("/api/v1/assets/user", {
                    method: "POST",
                    credentials: "same-origin",
                    body: selectedFile,
                    headers: {
                      "Content-Type": selectedFile.type || "application/octet-stream",
                      "X-File-Name": encodeURIComponent(selectedFile.name),
                    },
                  });
                  const uploadPayload = await uploadResponse.json().catch(() => ({}));
                  if (!uploadResponse.ok)
                    throw new Error(
                      uploadPayload.detail ||
                        uploadPayload.message ||
                        uploadPayload.error ||
                        "图片上传失败，请重试。",
                    );
                  const uploadedAssetId = String(
                    uploadPayload.assetId || uploadPayload.data?.assetId || "",
                  )
                    .trim()
                    .toLowerCase();
                  if (!/^user:[0-9a-f]{32}$/.test(uploadedAssetId))
                    throw new Error("图片上传结果无效，请重试。");
                  vector.screenImage = { assetId: uploadedAssetId };
                  refreshEditorPreview();
                } catch (uploadError: any) {
                  posterAssetStatusElement.textContent =
                    uploadError?.message || "图片上传失败，请重试。";
                  isPosterUploading = false;
                  return;
                }
                isPosterUploading = false;
                refreshPosterAssetUi();
                rebuildPosterActions();
              };
            const posterActionsRow = editorHost.createElement("div", "i3d-focus-actions"),
              posterPreviewElement = editorHost.createElement("img");
            posterPreviewElement.alt = imageAlt;
            Object.assign(posterPreviewElement.style, {
              width: "100%",
              maxHeight: "150px",
              objectFit: "contain",
            });
            const rebuildPosterActions = () => {
              posterActionsRow.replaceChildren();
              const screenAssetId = currentScreenAssetId();
              const hasPoster = !!screenAssetId;
              const posterId = screenAssetId.slice(5);
              posterPreviewElement.src = hasPoster ? "/api/v1/assets/user/" + posterId : "";
              const uploadButton = editorHost.createButton(hasPoster ? "替换图片" : "上传图片", () => {
                if (!isPosterUploading) posterAssetUploadInput.click();
              });
              uploadButton.className = "i3d-picker-button";
              uploadButton.disabled = isPosterUploading;
              posterActionsRow.append(uploadButton);
              if (hasPoster) {
                posterActionsRow.before(posterPreviewElement);
                const deleteButton = editorHost.createButton("删除图片", async () => {
                  if (isPosterUploading) return;
                  try {
                    await fetch("/api/v1/assets/user/" + posterId, {
                      method: "DELETE",
                      credentials: "same-origin",
                    });
                  } catch { /* 网络副作用失败不影响本地状态：调用方会在下一轮刷新或用户重试时收敛 */ }
                  delete vector.screenImage;
                  refreshPosterAssetUi();
                  rebuildPosterActions();
                  refreshEditorPreview();
                });
                posterActionsRow.append(deleteButton);
              } else posterPreviewElement.remove();
            };
            refreshPosterAssetUi();
            rebuildPosterActions();
            (posterAssetUploadInput.addEventListener("change", () => {
              const selectedPosterFile = posterAssetUploadInput.files?.[0];
              posterAssetUploadInput.value = "";
              uploadPosterAsset(selectedPosterFile);
            }),
              posterAssetSection.append(
                posterAssetStatusElement,
                posterActionsRow,
                posterAssetUploadInput,
                editorHost.createElement("p", "i3d-note", noteText),
              ),
              currentContainer.append(posterAssetSection));
          };
          if (editorHost.isNasMode) {
            // 0.8.1：NAS 指标选择改为内联折叠面板（原「选择显示内容」弹窗已移除）。
            // 组顺序用 ↑↓ 调整；组内顺序与卡片尺寸在实时预览里拖动/拖右下角调整。
            function appendNasMetricChooser(container: HTMLElement) {
              const nasStatusSource = vector.statusSource as {
                  groupOrder?: string[];
                  visibleMetrics?: string[];
                  metrics: NasMetricEntry[];
                },
                nasPreviewButton = editorHost.createButton("实时预览弹窗", async () => {
                  try {
                    await editorHost.editorRuntime?.focusCommand(
                      "preview-device-panel",
                      vector.id,
                    );
                  } catch (nasPreviewError) {
                    editorHost.isDisposed ||
                      (editorHost.errorMessageElement.textContent = (nasPreviewError as Error)?.message);
                  }
                });
              container.append(
                nasPreviewButton,
                editorHost.createElement(
                  "p",
                  "i3d-note",
                  "勾选显示内容；在预览中拖动卡片调整组内顺序、拖动右下角调整大小。修改实时预览，保存配置后生效。",
                ),
              );
              const nasChooserDetails = editorHost.createElement("details", "i3d-extra-chooser"),
                nasChooserSummary = editorHost.createElement("summary"),
                nasSearchInput = editorHost.createElement("input"),
                nasChooserActions = editorHost.createElement("div", "dialog-actions"),
                nasEntityList = editorHost.createElement("div", "i3d-extra-entity-list");
              ((nasSearchInput.placeholder = "搜索 NAS 指标名称或 ID"),
                nasSearchInput.setAttribute("aria-label", "搜索 NAS 指标"));
              const selectedMetricIds = () =>
                  new Set<string>(
                    nasStatusSource.visibleMetrics ||
                      nasStatusSource.metrics.map((metricProbe: NasMetricEntry) => metricProbe.entityId),
                  ),
                isChooserAlive = () =>
                  !editorHost.isDisposed &&
                  editorHost.isAccessAllowed &&
                  vector.statusSource === nasStatusSource,
                syncChooserSummary = () =>
                  (nasChooserSummary.textContent =
                    "选择显示内容（已选 " + selectedMetricIds().size + " 项）"),
                toggleAllMetrics = (selectAll: boolean) => {
                  isChooserAlive() &&
                    ((nasStatusSource.visibleMetrics = selectAll
                      ? nasStatusSource.metrics.map((metricProbe: NasMetricEntry) => metricProbe.entityId)
                      : []),
                    renderNasMetricList(),
                    refreshEditorPreview());
                };
              nasChooserActions.append(
                editorHost.createButton("全选", () => toggleAllMetrics(true)),
                editorHost.createButton("全不选", () => toggleAllMetrics(false)),
              );
              function renderNasMetricList() {
                (nasEntityList.replaceChildren(), syncChooserSummary());
                const selectedIds = selectedMetricIds(),
                  searchQuery = String(nasSearchInput.value).trim().toLowerCase(),
                  orderedGroups = nasGroups2(nasStatusSource).filter(([nasGroupProbe]) =>
                    nasStatusSource.metrics.some(
                      (groupMetricProbe: NasMetricEntry) => groupMetricProbe.group === nasGroupProbe,
                    ),
                  );
                for (const [groupIndex, groupEntry] of orderedGroups.entries()) {
                  const [metricGroupKey, metricGroupLabel] = groupEntry as [string, string],
                    groupMetrics = nasStatusSource.metrics.filter(
                      (groupMetricProbe: NasMetricEntry) =>
                        groupMetricProbe.group === metricGroupKey &&
                        (groupMetricProbe.label + " " + groupMetricProbe.entityId)
                          .toLowerCase()
                          .includes(searchQuery),
                    );
                  if (!groupMetrics.length) continue;
                  const groupSectionElement = editorHost.createElement("section"),
                    groupHeadingElement = editorHost.createElement(
                      "div",
                      "i3d-nas-fields-heading",
                    ),
                    moveMetricGroup = (groupOffset: number) => {
                      if (!isChooserAlive()) return;
                      const groupTargetIndex = groupIndex + groupOffset;
                      groupTargetIndex < 0 ||
                        groupTargetIndex >= orderedGroups.length ||
                        (([orderedGroups[groupIndex], orderedGroups[groupTargetIndex]] = [
                          orderedGroups[groupTargetIndex],
                          orderedGroups[groupIndex],
                        ]),
                        (nasStatusSource.groupOrder = orderedGroups.map(
                          (orderedGroupProbe) => orderedGroupProbe[0],
                        )),
                        renderNasMetricList(),
                        refreshEditorPreview());
                    },
                    groupUpButton = editorHost.createButton("↑", () => moveMetricGroup(-1)),
                    groupDownButton = editorHost.createButton("↓", () => moveMetricGroup(1));
                  ((groupUpButton.disabled = groupIndex === 0),
                    (groupDownButton.disabled = groupIndex === orderedGroups.length - 1),
                    groupUpButton.setAttribute("aria-label", "上移" + metricGroupLabel + "分组"),
                    groupDownButton.setAttribute("aria-label", "下移" + metricGroupLabel + "分组"),
                    groupHeadingElement.append(
                      editorHost.createElement("h4", "", metricGroupLabel),
                      groupUpButton,
                      groupDownButton,
                    ),
                    groupSectionElement.append(groupHeadingElement));
                  for (const nasMetricEntry of groupMetrics) {
                    const metricRowElement = editorHost.createElement(
                        "label",
                        "i3d-extra-entity-row",
                      ),
                      metricCheckboxElement = editorHost.createElement("input");
                    ((metricCheckboxElement.type = "checkbox"),
                      (metricCheckboxElement.checked = selectedIds.has(nasMetricEntry.entityId)),
                      metricCheckboxElement.setAttribute("aria-label", nasMetricEntry.label),
                      (metricRowElement.title = nasMetricEntry.entityId),
                      metricCheckboxElement.addEventListener("change", () => {
                        if (!isChooserAlive()) return;
                        const nextSelectedIds = selectedMetricIds();
                        (metricCheckboxElement.checked
                          ? nextSelectedIds.add(nasMetricEntry.entityId)
                          : nextSelectedIds.delete(nasMetricEntry.entityId),
                          // 保持 metrics 原顺序，只过滤可见项，避免预览里卡片顺序被打乱。
                          (nasStatusSource.visibleMetrics = nasStatusSource.metrics
                            .filter((visibleMetricProbe: NasMetricEntry) =>
                              nextSelectedIds.has(visibleMetricProbe.entityId),
                            )
                            .map((visibleMetricProbe: NasMetricEntry) => visibleMetricProbe.entityId)),
                          syncChooserSummary(),
                          refreshEditorPreview());
                      }));
                    const metricDetailElement = editorHost.createElement("span");
                    (metricDetailElement.append(
                      editorHost.createElement("strong", "", nasMetricEntry.label),
                      editorHost.createElement("small", "", nasMetricEntry.entityId),
                    ),
                      metricRowElement.append(metricCheckboxElement, metricDetailElement),
                      groupSectionElement.append(metricRowElement));
                  }
                  nasEntityList.append(groupSectionElement);
                }
                nasEntityList.children.length ||
                  nasEntityList.append(editorHost.createElement("p", "i3d-note", "没有匹配的指标。"));
              }
              (nasSearchInput.addEventListener("input", renderNasMetricList),
                nasChooserDetails.append(
                  nasChooserSummary,
                  nasSearchInput,
                  nasChooserActions,
                  nasEntityList,
                ),
                container.append(nasChooserDetails),
                renderNasMetricList());
            }
            const nasSourceButton = editorHost.createButton(
              vector.statusSource?.name || "选择飞牛、群晖或绿联",
              () => void openItemPicker("nas", nasSourceButton),
            );
            if (
              ((nasSourceButton.className = "i3d-picker-button"),
              createSettingRow(currentContainer, "NAS 数据来源", nasSourceButton),
              vector.statusSource)
            ) {
              appendNasMetricChooser(currentContainer);
            }
            currentContainer.append(
              editorHost.createElement(
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
            if (vector.entityId && !vector.statusSource) {
              currentContainer.append(
                editorHost.createElement(
                  "p",
                  "i3d-note",
                  "当前绑定仅按 on/off 控制指示灯，不会开关 NAS 或关联整台设备。安全状态表示告警，不应作为开机依据；选择 NAS 数据来源后将替换旧绑定。",
                ),
              );
            }
          }
          const boundEntityPickerButton = editorHost.createButton(
            "",
            () => void openItemPicker("entity", boundEntityPickerButton),
          );
          if (
            ((boundEntityPickerButton.className = "i3d-picker-button"),
            (boundEntityPickerButton.title =
              vector.entityId || (editorHost.usesModelBinding ? "选择" + editorHost.kindLabel + "实体" : "选择灯或开关")),
            boundEntityPickerButton.append(
              editorHost.createElement(
                "span",
                "",
                itemEntityMetadata?.name ||
                  vector.entityId ||
                  (editorHost.usesModelBinding ? "选择" + editorHost.kindLabel + "实体" : "选择灯或开关"),
              ),
            ),
            !editorHost.isGenericDeviceMode &&
              !editorHost.isVacuumMode &&
              // NAS 只在「旧版绑定」场景保留这一行：有 entityId 但还没选数据来源时，
              // 用户要能在这里改绑或清除那个旧指示灯实体（0.7.9 同口径）。
              (!editorHost.isNasMode || (!!vector.entityId && !vector.statusSource)) &&
              createSettingRow(
                currentContainer,
                editorHost.isNasMode
                  ? "指示灯状态实体（旧版兼容）"
                  : bindingContainer
                    ? "主实体（选填）"
                    : "绑定实体",
                boundEntityPickerButton,
              ),
            bindingContainer)
          ) {
            const deviceBindingButton = editorHost.createButton(
              vector.deviceName ||
                vector.deviceId ||
                (temperatureHumidityPickerKinds()
                  ? "跟随主实体所属设备"
                  : "选择" +
                    (isExhaustFanMode
                      ? "排气扇"
                      : isFanMode
                        ? "风扇"
                        : isWaterHeaterMode
                          ? "热水器"
                          : isPurifierMode
                            ? "净化器"
                            : "浴霸") +
                    "设备"),
              () => void openItemPicker("device", deviceBindingButton),
            );
            ((deviceBindingButton.className = "i3d-picker-button"),
              createSettingRow(currentContainer, "绑定设备", deviceBindingButton),
              currentContainer.append(
                editorHost.createElement(
                  "p",
                  "i3d-note",
                  isExhaustFanMode
                    ? "先选设备，再选择同设备下的 switch 或 fan 主实体。扇叶和吸入气流只随主实体启停，速度固定；附加功能独立控制。"
                    : isFanMode
                    ? "主实体选填。有 fan 主实体时读取标准能力；没有就绑定设备，在附加功能中选择开关、风速、正反转等。主实体与附加功能须属于同一设备，各功能独立控制。"
                    : isWaterHeaterMode
                      ? "有热水器主实体可直接选择；没有就绑定设备，在附加功能中选择开关、温度、模式和状态。各功能独立控制。"
                      : isPurifierMode
                        ? "有主实体可直接选择；没有就绑定设备，在附加功能中选择开关、模式和状态。各功能独立控制。"
                        : "有标准主实体时可直接选择；没有主实体时，绑定设备并在附加功能中 DIY 暖风、换气和照明等控制。两者同时选择时须属于同一设备。主实体开关只控制主实体。",
                ),
              ));
          }
          // 光效色温兜底（0.7.9 F4）：只有灯具/开关需要。设备能调色温时跟随设备；
          // 不能调色温（或 switch 实体）时给「默认暖白 / 跟随户型」二选一，仅影响 3D 光效。
          if (
            !editorHost.usesModelBinding &&
            !editorHost.isNasMode &&
            !editorHost.isVacuumMode &&
            !isFanMode &&
            !isWaterHeaterMode &&
            !isPurifierMode
          ) {
            const temperatureFallbackContainer = editorHost.createElement("div");
            currentContainer.append(temperatureFallbackContainer);
            const resolveLightCapabilityState = () => {
                const boundLightEntityId = vector.entityId || "",
                  lightStateStore = editorHost.latestStates || editorHost.states,
                  boundLightState =
                    lightStateStore?.get?.(boundLightEntityId) ??
                    lightStateStore?.[boundLightEntityId],
                  boundCatalogEntry =
                    editorHost.entities.find(
                      (catalogEntity: any) => catalogEntity.entityId === boundLightEntityId,
                    ) || { entityId: boundLightEntityId };
                return lightState2(boundLightEntityId, boundLightState, boundCatalogEntry);
              };
            let renderedTemperatureState: string | undefined;
            const syncTemperatureFallback = () => {
              const boundLightEntityId = vector.entityId || "",
                capabilityState = resolveLightCapabilityState(),
                temperatureState = boundLightEntityId
                  ? boundLightEntityId.startsWith("switch.")
                    ? "fallback"
                    : !boundLightEntityId.startsWith("light.") || !capabilityState.capabilitiesKnown
                      ? "unknown"
                      : capabilityState.temperatureSupported
                        ? "device"
                        : "fallback"
                  : "unbound";
              if (temperatureState === renderedTemperatureState) return;
              (renderedTemperatureState = temperatureState),
                temperatureFallbackContainer.replaceChildren();
              if (temperatureState === "unbound") return;
              if (temperatureState === "device") {
                temperatureFallbackContainer.append(
                  editorHost.createElement(
                    "p",
                    "i3d-note",
                    "该灯支持调色温，光效跟随设备当前模式与回报。",
                  ),
                );
                return;
              }
              if (temperatureState === "unknown") {
                temperatureFallbackContainer.append(
                  editorHost.createElement(
                    "p",
                    "i3d-note",
                    "暂未确认该实体的色温能力，读取到能力后显示对应设置。",
                  ),
                );
                return;
              }
              const temperatureFallbackRow = createSelectRow(
                temperatureFallbackContainer,
                "光效色温",
                [
                  ["default", "默认暖白（3500K）"],
                  ["floorplan", "跟随户型灯具色温"],
                ],
                vector.temperatureFallback === "floorplan" ? "floorplan" : "default",
                (nextTemperatureFallback: string) => {
                  ((vector.temperatureFallback = nextTemperatureFallback), refreshEditorPreview());
                },
              );
              const temperatureFallbackSelect = temperatureFallbackRow?.querySelector?.("select");
              temperatureFallbackSelect &&
                (temperatureFallbackSelect.disabled =
                  editorHost.isDisposed || !editorHost.isAccessAllowed);
              temperatureFallbackContainer.append(
                editorHost.createElement(
                  "p",
                  "i3d-note",
                  "该实体不支持调色温，此设置仅影响 3D 光效。跟随时使用各灯具在户型图中设置的色温；彩光和白光模式仍优先跟随设备颜色。",
                ),
              );
            };
            syncTemperatureFallback();
          }
          if (
            (editorHost.isSpeakerMode &&
              currentContainer.append(
                editorHost.createElement(
                  "p",
                  "i3d-note",
                  "绑定 media_player 后，播放、音量、进度和媒体库等控制按实体能力自动显示。播放时顶部彩色呼吸，暂停时微亮，空闲或离线时熄灭。",
                ),
              ),
            editorHost.isGenericDeviceMode)
          ) {
            const devicePickerButtonElement = editorHost.createButton(
              vector.deviceName || "选择设备",
              () => void openItemPicker("device", devicePickerButtonElement),
            );
            if (
              ((devicePickerButtonElement.className = "i3d-picker-button"),
              createSettingRow(currentContainer, "绑定设备", devicePickerButtonElement),
              editorHost.deviceKind === "computer")
            ) {
              const computerPowerButton = editorHost.createButton(
                vector.powerEntityId || "选择电脑电源开关",
                () => void openItemPicker("powerEntity", computerPowerButton),
              );
              ((computerPowerButton.className = "i3d-picker-button"),
                createSettingRow(currentContainer, "电脑开关实体", computerPowerButton),
                currentContainer.append(
                  editorHost.createElement(
                    "p",
                    "i3d-note",
                    "电源实体使用 switch 或 input_boolean。开关状态直接控制电脑屏幕明暗；不设置指示灯规则。",
                  ),
                ));
            }
            if (genericDeviceProfile2(editorHost.deviceKind).statusIndicator !== false) {
              const statusLightSectionElement = createConfigSection("状态灯（可选）");
              renderStatusRuleSection(statusLightSectionElement, vector);
            } else delete vector.statusRules;
            editorHost.deviceKind === "computer" &&
              renderDeviceScreenImageSection(
                "电脑开机屏幕图片",
                "电脑开机屏幕图片",
                "上传电脑屏幕图片",
                "开机时显示的图片",
                "开机时显示这张图片，关机时显示深色屏幕。支持 PNG、JPG/JPEG、WebP、SVG、GIF、BMP、TIFF、AVIF、HEIC/HEIF 和 ICO；图片保持原比例。",
              );
          }
          if (editorHost.deviceKind === "smallcar") {
            const carStatusSectionElement = createConfigSection("车辆状态"),
              carEntityCatalog = deviceEntityCatalog2(
                editorHost.entities,
                vector.deviceId,
                editorHost.latestStates || editorHost.states,
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
                  (pickedCarEntityId: any) => {
                    ((vector[carBindingField] = pickedCarEntityId),
                      carBindingField === "chargingEntityId" && delete vector.chargingStates,
                      refreshEditorPreview(),
                      renderPanel());
                  },
                ));
            }
            const carRawStatusElement = editorHost.createElement("p", "i3d-note i3d-car-raw-state");
            (carRawStatusElement.setAttribute("aria-live", "polite"),
              carStatusSectionElement.append(carRawStatusElement));
            const chargingSettingsElement = editorHost.createElement("details", "i3d-car-charging-settings");
            ((chargingSettingsElement.open = !!vector.chargingStates),
              chargingSettingsElement.append(editorHost.createElement("summary", "", "自定义充电识别（可选）")),
              chargingSettingsElement.append(
                editorHost.createElement(
                  "p",
                  "i3d-note",
                  "在 HA 中查看充电状态实体，充电和不充电时显示什么文字，就分别填入对应输入框。两项都留空则自动识别。",
                ),
              ));
            const chargingInputsByKey: Record<string, HTMLInputElement> = {},
              chargingErrorElement = editorHost.createElement("p", "i3d-error");
            chargingErrorElement.setAttribute("role", "status");
            const chargingSummaryElement = editorHost.createElement("p", "i3d-note");
            for (const [chargingFieldKey, chargingFieldLabel, chargingFieldHint] of [
              ["inactive", "不充电状态值", "填写不充电时的文字"],
              ["active", "充电状态值", "填写充电时的文字"],
            ]) {
              const chargingValueInputElement = editorHost.createElement("input");
              ((chargingValueInputElement.type = "e.text"),
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
                  (refreshEditorPreview(), editorHost.refreshEffectSettings());
                }));
            }
            (chargingSettingsElement.append(chargingErrorElement, chargingSummaryElement),
              carStatusSectionElement.append(chargingSettingsElement),
              (editorHost.refreshEffectSettings = () => {
                const carStatusSnapshot = carState2(vector, editorHost.latestStates || editorHost.states),
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
              editorHost.refreshEffectSettings());
            // 汽车状态卡片（0.8.0 顺序：车辆状态 → 汽车状态卡片 → 四轮胎压）。
            const carStatusCardSectionElement = createConfigSection("汽车状态卡片");
            renderAirPurifierBindingSection(carStatusCardSectionElement, vector, {
              width: "cardWidth",
              font: "cardFontSize",
              opacity: "cardOpacity",
            });
            // 轮胎压（0.8.1）：车型取景元数据里现成的 `type`，四轮车与电瓶车显示（轮位表不同）。
            const carModelEntry = editorHost.sceneMetadata?.floors
                ?.find((carFloorProbe: any) => carFloorProbe.id === vector.floorId)
                ?.cars?.find((carModelProbe: any) => carModelProbe.id === vector.modelId),
              carModelType = carModelEntry?.type,
              carSupportsTires = supportsCarTires2(carModelType);
            if (!carSupportsTires) delete vector.tirePressure;
            else {
              const tireSectionElement = createConfigSection(
                  carModelType === "scooter" ? "前后轮胎压" : "四轮胎压",
                ),
                tireWheelCatalog = deviceEntityCatalog2(
                  editorHost.entities,
                  vector.deviceId,
                  editorHost.latestStates || editorHost.states,
                ).filter(
                  (tireEntityProbe) =>
                    tireEntityProbe.entityId.startsWith("sensor.") &&
                    tireEntityProbe.enabled !== false &&
                    !["missing", "disabled"].includes(tireEntityProbe.status),
                ),
                tireWheelOptions = tireWheelCatalog.map((tireEntityOptionEntry) => [
                  tireEntityOptionEntry.entityId,
                  (tireEntityOptionEntry.name || tireEntityOptionEntry.entityId) +
                    " · " +
                    tireEntityOptionEntry.entityId,
                ]),
                tireShowInput = editorHost.createElement("input");
              // 0.8.1：车型切换（四轮 ↔ 双轮）时先按新轮位表收口 —— 上游是整块替换
              // `tirePressure`（开关随之关闭），所以这里的后续读写都要用收口后的对象。
              const retargetedTires = retargetCarTires2(
                vector.tirePressure || defaultCarTires(),
                carModelType,
              );
              vector.tirePressure = retargetedTires;
              const tireConfig = retargetedTires;
              ((tireShowInput.type = "checkbox"),
                (tireShowInput.checked = tireConfig.enabled === true),
                tireShowInput.addEventListener("change", () => {
                  (vector.tirePressure
                    ? (vector.tirePressure.enabled = tireShowInput.checked)
                    : (vector.tirePressure = {
                        ...defaultCarTires(),
                        enabled: tireShowInput.checked,
                      }),
                    refreshEditorPreview(),
                    renderPanel());
                }),
                createSettingRow(tireSectionElement, "显示胎压", tireShowInput));
              // 0.8.0 行顺序：显示胎压 → 轮位胎压实体 → 胎压显示方式 → 胎压字号（px） → 背景不透明度。
              for (const tireWheel of carTireWheelsFor(carModelType)) {
                const tireWheelValue = tireConfig.wheels[tireWheel.key] || "",
                  tireWheelRowOptions = [...tireWheelOptions];
                // 失效实体插在「未绑定」之后（0.8.0 用 splice(1, 0, …)），不顶到列表首位。
                tireWheelValue &&
                  !tireWheelRowOptions.some(
                    ([tireOptionEntityId]) => tireOptionEntityId === tireWheelValue,
                  ) &&
                  tireWheelRowOptions.splice(1, 0, [
                    tireWheelValue,
                    tireWheelValue + "（失效或不属于当前设备）",
                  ]);
                createSelectRow(
                  tireSectionElement,
                  tireWheel.label + "胎压实体",
                  [["", "未绑定"], ...tireWheelRowOptions],
                  tireWheelValue,
                  (pickedTireEntityId: string) => {
                    (pickedTireEntityId
                      ? (tireConfig.wheels[tireWheel.key] = pickedTireEntityId)
                      : delete tireConfig.wheels[tireWheel.key],
                      (vector.tirePressure = tireConfig),
                      refreshEditorPreview());
                  },
                );
              }
              createSelectRow(
                tireSectionElement,
                "胎压显示方式",
                [
                  ["compact", "简洁数值"],
                  ["named", "数值和轮位"],
                ],
                tireConfig.mode === "named" ? "named" : "compact",
                (nextTireMode: string) => {
                  (tireConfig.mode = nextTireMode === "named" ? "named" : "compact");
                  refreshEditorPreview();
                },
              );
              // 字号对齐 0.8.0 `_0x4e6a59(..., !0x0)`：step=any、只校验 > 0、无上下限、输入即预览。
              const tireFontInput = editorHost.createElement("input"),
                applyTireFontSize = (nextTireFontSize: number) => {
                  ((tireConfig.fontSize = nextTireFontSize), refreshEditorPreview());
                };
              ((tireFontInput.type = "number"),
                (tireFontInput.step = "any"),
                (tireFontInput.value = String(
                  Number.isFinite(tireConfig.fontSize) ? tireConfig.fontSize : 14,
                )),
                tireFontInput.addEventListener("input", () => {
                  const tireFontDraft =
                    tireFontInput.value.trim() === "" ? NaN : Number(tireFontInput.value);
                  (Number.isFinite(tireFontDraft) &&
                    tireFontDraft > 0 &&
                    tireFontDraft !== tireConfig.fontSize &&
                    applyTireFontSize(tireFontDraft));
                }),
                tireFontInput.addEventListener("change", () => {
                  const tireFontDraft =
                    tireFontInput.value.trim() === "" ? NaN : Number(tireFontInput.value);
                  Number.isFinite(tireFontDraft) && tireFontDraft > 0
                    ? ((tireFontInput.value = String(tireFontDraft)),
                      tireFontDraft !== tireConfig.fontSize && applyTireFontSize(tireFontDraft))
                    : (tireFontInput.value = String(tireConfig.fontSize));
                }),
                createSettingRow(tireSectionElement, "胎压字号（px）", tireFontInput));
              appendBackgroundOpacityControl2(
                tireSectionElement,
                tireConfig,
                "opacity",
                refreshEditorPreview,
              );
              tireSectionElement.append(
                editorHost.createElement(
                  "p",
                  "i3d-note",
                  "轮位以车辆朝前时为准。单位沿用实体；未绑定轮位不显示，读数不可用时显示 —。字号和背景不透明度只影响胎压，电量卡片独立设置。",
                ),
              );
            }
          }
          if (editorHost.isAirerMode) {
            const airerDirectionSectionElement = createConfigSection("实体升降方向");
            createSelectRow(
              airerDirectionSectionElement,
              "位置方向",
              [
                ["normal", "0% 最低，100% 最高"],
                ["reversed", "0% 最高，100% 最低"],
              ],
              vector.positionReversed === true ? "reversed" : "normal",
              (nextValue: string) => {
                vector.positionReversed = nextValue === "reversed";
                refreshEditorPreview();
              },
            );
            createSelectRow(
              airerDirectionSectionElement,
              "升降指令",
              [
                ["normal", "打开对应上升，关闭对应下降"],
                ["reversed", "打开对应下降，关闭对应上升"],
              ],
              vector.liftReversed === true ? "reversed" : "normal",
              (nextValue: string) => {
                vector.liftReversed = nextValue === "reversed";
                refreshEditorPreview();
              },
            );
            airerDirectionSectionElement.append(
              editorHost.createElement(
                "p",
                "i3d-note",
                "按实物选择。模型、图标和弹窗统一显示实际高低及升降；弹窗高度以 100% 为最高。位置方向与升降指令可分别设置。",
              ),
            );

            const airerMotionSectionElement = createConfigSection("升降动画");
            const animationReversedCheckbox = editorHost.createElement("input");
            ((animationReversedCheckbox.type = "checkbox"),
              (animationReversedCheckbox.checked = vector.animationReversed === true),
              animationReversedCheckbox.addEventListener("change", () => {
                vector.animationReversed = animationReversedCheckbox.checked;
                refreshEditorPreview();
              }),
              createSettingRow(airerMotionSectionElement, "动画方向反向", animationReversedCheckbox));
            airerMotionSectionElement.append(
              editorHost.createElement(
                "p",
                "i3d-note",
                "模型升降与实物相反时开启，仅反转动画，不改变升降按钮的控制方向。顶部安装高度和最大伸展距离在户型图中调整。",
              ),
            );
            const airerTravelSecondsInputElement = editorHost.createElement("input");
            ((airerTravelSecondsInputElement.type = "number"),
              (airerTravelSecondsInputElement.min = "5"),
              (airerTravelSecondsInputElement.max = "180"),
              (airerTravelSecondsInputElement.step = "1"),
              (airerTravelSecondsInputElement.value = String(vector.travelSeconds || 20)),
              airerTravelSecondsInputElement.addEventListener("change", () => {
                ((vector.travelSeconds = Math.max(
                  5,
                  Math.min(180, Number(airerTravelSecondsInputElement.value) || 20),
                )),
                  refreshEditorPreview());
              }),
              createSettingRow(
                airerMotionSectionElement,
                "无位置回传时全程耗时（秒）",
                airerTravelSecondsInputElement,
              ));
          }
          if (editorHost.deviceKind === "water-heater") {
            const statusRuleSectionElement = createConfigSection("指示灯规则（可选）"),
              curtainMemberGroup = temperatureHumidityPickerKinds();
            (renderStatusRuleSection(statusRuleSectionElement, vector, {
              deviceId: curtainMemberGroup,
              standardOnly: true,
            }),
              curtainMemberGroup ||
                statusRuleSectionElement.append(
                  editorHost.createElement(
                    "p",
                    "i3d-note",
                    vector.entityId
                      ? "当前实体没有可用的 HA 设备归属，请同步设备目录后重新打开配置，或更换绑定实体。"
                      : "先选择主实体或绑定设备，再选择指示灯状态。",
                  ),
                ));
          }
          if (
            ["climate", "airer", "fan", "purifier", "water-heater"].includes(editorHost.deviceKind) ||
            (editorHost.isGenericDeviceMode && editorHost.deviceKind !== "smallcar")
          ) {
            let syncExtraControls = function () {
              const selectedControlEntityIdSet = new Set(
                (vector.extraControls || []).map(
                  (extraControlEntityProbe: any) => extraControlEntityProbe.entityId,
                ),
              );
              extraControlsDetailsElement.querySelector("summary").textContent =
                "选择附加功能（已选 " + selectedControlEntityIdSet.size + " 项）";
              for (const [
                optionControlEntityId,
                { check: extraControlCheckboxElement, disabled: isExtraControlDisabled },
              ] of extraControlsByEntityId)
                ((extraControlCheckboxElement.checked =
                  selectedControlEntityIdSet.has(optionControlEntityId)),
                  (extraControlCheckboxElement.disabled =
                    !extraControlCheckboxElement.checked &&
                    isExtraControlDisabled));
            };
            const boundMeterEntityId = vector.extraControls || [];
            currentContainer = createConfigSection("附加功能");
            const relatedEntityCatalog =
                editorHost.isGenericDeviceMode || bindingContainer
                  ? deviceEntityCatalog2(
                      editorHost.entities,
                      vector.deviceId ||
                        itemEntityMetadata?.deviceId ||
                        itemEntityMetadata?.device_id,
                      editorHost.latestStates || editorHost.states,
                    ).filter((otherEntityProbe) => otherEntityProbe.entityId !== vector.entityId)
                  : purifierRelatedEntities2(editorHost.entities, vector.entityId),
              deviceId3 =
                editorHost.isGenericDeviceMode || bindingContainer
                  ? vector.deviceId || itemEntityMetadata?.deviceId || itemEntityMetadata?.device_id
                  : itemEntityMetadata?.deviceId || itemEntityMetadata?.device_id,
              previewDevicePanel = async () => {
                try {
                  await editorHost.editorRuntime?.focusCommand("preview-device-panel", vector.id);
                } catch (meterMetadataProbe: any) {
                  editorHost.isDisposed || (editorHost.errorMessageElement.textContent = meterMetadataProbe.message);
                }
              },
              previewDeviceButton = editorHost.createButton("实时预览弹窗", previewDevicePanel);
            currentContainer.append(
              previewDeviceButton,
              editorHost.createElement(
                "p",
                "i3d-note",
                "仅选择当前设备的附加实体，数量不限。预览随修改实时更新，不发送设备指令；保存后正式生效。",
              ),
            );
            const extraControlsDetailsElement = editorHost.createElement("details");
            extraControlsDetailsElement.append(
              editorHost.createElement(
                "summary",
                "",
                "选择附加功能（已选 " + boundMeterEntityId.length + " 项）",
              ),
            );
            const extraSearchInputElement = editorHost.createElement("input");
            ((extraSearchInputElement.placeholder = "搜索本设备实体名称或 ID"),
              extraSearchInputElement.setAttribute("aria-label", "搜索附加实体"));
            const extraControlListElement = editorHost.createElement("div", "i3d-extra-entity-list"),
              extraControlsByEntityId = new Map(),
              renderExtraControlList = () => {
                (extraControlListElement.replaceChildren(), extraControlsByEntityId.clear());
                const lowerCase = extraSearchInputElement.value.trim().toLowerCase(),
                  staleExtraControlList = (vector.extraControls || [])
                    .filter(
                      (extraControlProbe: any) =>
                        !relatedEntityCatalog.some(
                          (knownCatalogProbe: any) =>
                            knownCatalogProbe.entityId === extraControlProbe.entityId,
                        ),
                    )
                    .map((staleExtraControlEntry: any) => ({
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
                    editorHost.createElement(
                      "p",
                      "i3d-note",
                      deviceId3
                        ? lowerCase
                          ? "没有匹配的实体。"
                          : "该设备没有其他实体。"
                        : editorHost.isGenericDeviceMode || bindingContainer
                          ? "请先绑定设备，再选择弹窗内容。"
                          : "主实体没有设备关联，无法获取所属设备实体。",
                    ),
                  );
                for (const extraCandidateEntity of visibleExtraControlList) {
                  const some2 = (vector.extraControls || []).some(
                      (extraControlMatchProbe: any) =>
                        extraControlMatchProbe.entityId === extraCandidateEntity.entityId,
                    ),
                    isExtraEntityDisabled = !!(
                      extraCandidateEntity.disabledBy ||
                      extraCandidateEntity.disabled_by ||
                      extraCandidateEntity.enabled === false ||
                      ["disabled", "missing"].includes(extraCandidateEntity.status)
                    ),
                    extraEntityState =
                      editorHost.latestStates?.[extraCandidateEntity.entityId] ||
                      editorHost.states?.get?.(extraCandidateEntity.entityId) ||
                      editorHost.states?.[extraCandidateEntity.entityId],
                    extraEntitySnapshot = extraEntityState?.newState || extraEntityState,
                    extraEntityRowElement = editorHost.createElement("label", "i3d-extra-entity-row"),
                    extraEntityCheckboxElement = editorHost.createElement("input");
                  ((extraEntityCheckboxElement.type = "checkbox"),
                    (extraEntityCheckboxElement.checked = some2),
                    (extraEntityCheckboxElement.disabled =
                      !some2 && isExtraEntityDisabled),
                    extraControlsByEntityId.set(extraCandidateEntity.entityId, {
                      check: extraEntityCheckboxElement,
                      disabled: isExtraEntityDisabled,
                    }));
                  const extraEntityDetailElement = editorHost.createElement("span");
                  ((extraEntityDetailElement.title =
                    (extraCandidateEntity.name || extraCandidateEntity.entityId) +
                    "\n" +
                    extraCandidateEntity.entityId),
                    extraEntityDetailElement.append(
                      editorHost.createElement(
                        "strong",
                        "",
                        extraCandidateEntity.name || extraCandidateEntity.entityId,
                      ),
                      editorHost.createElement("small", "", extraCandidateEntity.entityId),
                      editorHost.createElement(
                        "small",
                        "",
                        (extraLabels2 as any)[extraTypes2(extraCandidateEntity.entityId)[0]] +
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
                            (removedControlProbe: any) =>
                              removedControlProbe.entityId !== extraCandidateEntity.entityId,
                          )),
                        !extraEntityCheckboxElement.checked &&
                          isPurifierMode &&
                          vector.airflowEntityId === extraCandidateEntity.entityId &&
                          delete vector.airflowEntityId,
                        !extraEntityCheckboxElement.checked &&
                          isBathHeaterMode &&
                          (vector.bathEffects = (vector.bathEffects || []).filter(
                            (removedBathEffectProbe: any) =>
                              removedBathEffectProbe.entityId !== extraCandidateEntity.entityId,
                          )),
                        refreshEditorPreview(),
                        syncExtraControls(),
                        previewDevicePanel(),
                        isBathHeaterMode && editorHost.redrawBathEffects(),
                        isPurifierMode && editorHost.renderAirflowSection(),
                        editorHost.redrawDeviceMistSection(),
                        editorHost.redrawRangehoodSection());
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
              bathEffectHostElement = editorHost.createElement("div");
            (bathAirflowSectionElement.append(bathEffectHostElement),
              (editorHost.redrawBathEffects = () => {
                (bathEffectHostElement.replaceChildren(),
                  (editorHost.bathEffectEditorHandle = bathEffectEditor2({
                    item: vector,
                    entities: editorHost.entities,
                    states: () => editorHost.latestStates || editorHost.states,
                    host: bathEffectHostElement,
                    node: editorHost.createElement,
                    select: createSelectRow,
                    update: refreshEditorPreview,
                    redraw: editorHost.redrawBathEffects,
                  })));
              }),
              editorHost.redrawBathEffects());
          }
          if (isPurifierMode) {
            const purifierAirflowSectionElement = createConfigSection("出风动画");
            ((editorHost.renderAirflowSection = () => {
              (purifierAirflowSectionElement.replaceChildren(editorHost.createElement("h4", "", "出风动画")),
                purifierAirflowSectionElement.append(
                  editorHost.createElement(
                    "p",
                    "i3d-note",
                    "有主实体时默认自动跟随。DIY 选择运行开关，开启就出风，关闭就停止。",
                  ),
                ));
              const controlEntityIdSet = new Set(
                  (vector.extraControls || []).map(
                    (controlEntityProbe: any) => controlEntityProbe.entityId,
                  ),
                ),
                airflowOptions = editorHost.entities
                  .filter(
                    (airflowCandidateProbe: any) =>
                      controlEntityIdSet.has(airflowCandidateProbe.entityId) &&
                      /^(switch|fan|binary_sensor|input_boolean)\./.test(
                        airflowCandidateProbe.entityId,
                      ),
                  )
                  .map((airflowOptionEntry: any) => [
                    airflowOptionEntry.entityId,
                    airflowOptionEntry.name || airflowOptionEntry.entityId,
                  ]);
              (vector.airflowEntityId &&
                !airflowOptions.some(
                  ([airflowOptionEntityId]: any) => airflowOptionEntityId === vector.airflowEntityId,
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
                  (pickedAirflowEntityId: any) => {
                    (pickedAirflowEntityId
                      ? (vector.airflowEntityId = pickedAirflowEntityId)
                      : delete vector.airflowEntityId,
                      refreshEditorPreview(),
                      editorHost.refreshAirflowStatus());
                  },
                ));
              const airflowStatusElement = editorHost.createElement("p", "i3d-note");
              (purifierAirflowSectionElement.append(airflowStatusElement),
                (editorHost.refreshAirflowStatus = () => {
                  const purifierStatus = purifierState2(vector, editorHost.latestStates || editorHost.states);
                  airflowStatusElement.textContent =
                    "出风状态：" +
                    (purifierStatus.available
                      ? purifierStatus.running
                        ? "出风中"
                        : "已停止"
                      : "状态未知");
                }),
                editorHost.refreshAirflowStatus());
            }),
              editorHost.renderAirflowSection());
          }
          if (["humidifier", "aroma-diffuser"].includes(editorHost.deviceKind)) {
            const mistSectionElement = createConfigSection("喷雾动画");
            ((editorHost.redrawDeviceMistSection = () => {
              (mistSectionElement.replaceChildren(editorHost.createElement("h4", "", "喷雾动画")));
              const extraControlEntityIdSet = new Set(
                  (vector.extraControls || []).map(
                    (controlEntityProbe: any) => controlEntityProbe.entityId,
                  ),
                ),
                mistSourceOptions = deviceEntityCatalog2(
                  editorHost.entities,
                  vector.deviceId,
                  editorHost.latestStates || editorHost.states,
                )
                  .filter(
                    (mistCandidateProbe: any) =>
                      isDeviceMistSource2(mistCandidateProbe.entityId) &&
                      extraControlEntityIdSet.has(mistCandidateProbe.entityId),
                  )
                  .map((mistOptionEntry: any) => [
                    mistOptionEntry.entityId,
                    (mistOptionEntry.name || mistOptionEntry.entityId) +
                      " · " +
                      mistOptionEntry.entityId,
                  ]);
              (vector.animationEntityId &&
                !mistSourceOptions.some(
                  ([mistOptionEntityId]: any) => mistOptionEntityId === vector.animationEntityId,
                ) &&
                mistSourceOptions.unshift([
                  vector.animationEntityId,
                  vector.animationEntityId + "（当前不可用）",
                ]),
                createSelectRow(
                  mistSectionElement,
                  "喷雾开关实体",
                  [["", "不绑定"], ...mistSourceOptions],
                  vector.animationEntityId || "",
                  (pickedMistEntityId: any) => {
                    (pickedMistEntityId
                      ? (vector.animationEntityId = pickedMistEntityId)
                      : delete vector.animationEntityId,
                      refreshEditorPreview(),
                      editorHost.redrawDeviceMistSection());
                  },
                ),
                mistSectionElement.append(
                  editorHost.createElement(
                    "p",
                    "i3d-note",
                    "从已选附加功能中选择开关。HA 回报开启时喷雾，关闭或不可用时停止；喷雾效果固定。",
                  ),
                ));
              const mistStatusElement = editorHost.createElement("p", "i3d-note");
              (mistStatusElement.setAttribute("aria-live", "polite"),
                mistSectionElement.append(mistStatusElement),
                (mistStatusElement.textContent =
                  "喷雾状态：" +
                  deviceMistState2(vector, editorHost.latestStates || editorHost.states).label));
            }),
              editorHost.redrawDeviceMistSection());
          }
          if (editorHost.deviceKind === "rangehood") {
            const rangehoodSectionElement = createConfigSection("吸风动画");
            ((editorHost.redrawRangehoodSection = () => {
              (rangehoodSectionElement.replaceChildren(editorHost.createElement("h4", "", "吸风动画")));
              const animationEnabledCheckbox = editorHost.createElement("input");
              ((animationEnabledCheckbox.type = "checkbox"),
                (animationEnabledCheckbox.checked = vector.animationEnabled !== false),
                animationEnabledCheckbox.addEventListener("change", () => {
                  (vector.animationEnabled = animationEnabledCheckbox.checked,
                    refreshEditorPreview(),
                    editorHost.redrawRangehoodSection());
                }),
                createSettingRow(rangehoodSectionElement, "显示吸风动画", animationEnabledCheckbox));
              const rangehoodSourceOptions = deviceEntityCatalog2(
                editorHost.entities,
                vector.deviceId,
                editorHost.latestStates || editorHost.states,
              )
                .filter((rangehoodCandidateProbe: any) =>
                  fanSourceAllowed("run", rangehoodCandidateProbe, vector, vector.deviceId),
                )
                .map((rangehoodOptionEntry: any) => [
                  rangehoodOptionEntry.entityId,
                  (rangehoodOptionEntry.name || rangehoodOptionEntry.entityId) +
                    " · " +
                    rangehoodOptionEntry.entityId,
                ]);
              (vector.animationEntityId &&
                !rangehoodSourceOptions.some(
                  ([rangehoodOptionEntityId]: any) =>
                    rangehoodOptionEntityId === vector.animationEntityId,
                ) &&
                rangehoodSourceOptions.unshift([
                  vector.animationEntityId,
                  vector.animationEntityId + "（当前不可用）",
                ]),
                createSelectRow(
                  rangehoodSectionElement,
                  "动画状态实体",
                  [["", "不绑定"], ...rangehoodSourceOptions],
                  vector.animationEntityId || "",
                  (pickedAnimationEntityId: any) => {
                    (pickedAnimationEntityId
                      ? (vector.animationEntityId = pickedAnimationEntityId)
                      : delete vector.animationEntityId,
                      refreshEditorPreview(),
                      editorHost.redrawRangehoodSection());
                  },
                ),
                rangehoodSectionElement.append(
                  editorHost.createElement(
                    "p",
                    "i3d-note",
                    "从已选附加功能中选择风机运行实体。HA 回报开启时吸风，关闭或不可用时停止；动画速度固定，照明不联动。",
                  ),
                ));
              const rangehoodStatusElement = editorHost.createElement("p", "i3d-note");
              (rangehoodStatusElement.setAttribute("aria-live", "polite"),
                rangehoodSectionElement.append(rangehoodStatusElement),
                (rangehoodStatusElement.textContent =
                  "吸风状态：" +
                  rangehoodState2(vector, editorHost.latestStates || editorHost.states).label));
            }),
              editorHost.redrawRangehoodSection());
          }
          if (editorHost.deviceKind === "fan") {
            const fanControlSection = createConfigSection("风扇控制");
            createSelectRow(
              fanControlSection,
              "外观模式",
              [
                ["tower", "电风扇 / 塔扇"],
                ["ceiling", "吊扇"],
              ],
              vector.visualMode === "ceiling" ? "ceiling" : "tower",
              (nextValue: string) => {
                vector.visualMode = nextValue === "ceiling" ? "ceiling" : "tower";
                refreshEditorPreview();
              },
            );
            const fanDeviceId =
              vector.deviceId ||
              itemEntityMetadata?.deviceId ||
              itemEntityMetadata?.device_id ||
              "";
            const entityRecord = (entityId: string) =>
              (editorHost.entities || []).find(
                (entityProbe: any) =>
                  (entityProbe.entityId || entityProbe.entity_id) === entityId,
              ) || {};
            const entityLiveState = (entityId: string) => {
              const states = editorHost.latestStates || editorHost.states;
              if (!entityId || !states) return null;
              const entry =
                states instanceof Map ? states.get(entityId) : states?.[entityId];
              return entry?.newState || entry || null;
            };
            const makeFanFollowButton = (
              fieldKey: "runEntityId" | "speedEntityId" | "directionEntityId",
              followKind: "run" | "speed" | "direction",
              emptyLabel: string,
            ) => {
              const button = editorHost.createButton("", async () => {
                const generation = ++editorHost.pickerGeneration;
                try {
                  const handle = await editorHost.pickers?.entity?.({
                    trigger: button,
                    deviceKind: "fan",
                    current: vector[fieldKey] || "",
                    onSelect(_device: any, entity: any) {
                      if (
                        editorHost.isDisposed ||
                        !editorHost.isAccessAllowed ||
                        generation !== editorHost.pickerGeneration ||
                        !editorHost.getItemList().includes(vector)
                      )
                        return;
                      const nextEntityId = entity?.entityId || "";
                      if (
                        nextEntityId &&
                        !fanSourceAllowed(
                          followKind,
                          entity || entityRecord(nextEntityId),
                          vector,
                          fanDeviceId,
                        )
                      ) {
                        editorHost.errorMessageElement.textContent =
                          "请选择当前设备已选附加功能中的有效实体。";
                        return;
                      }
                      if (nextEntityId) vector[fieldKey] = nextEntityId;
                      else delete vector[fieldKey];
                      if (followKind === "direction") delete vector.reverseState;
                      refreshEditorPreview();
                      renderPanel();
                    },
                  });
                  generation !== editorHost.pickerGeneration
                    ? handle?.close()
                    : (editorHost.activePickerHandle = handle);
                } catch (error: any) {
                  editorHost.errorMessageElement.textContent = error?.message || String(error);
                }
              });
              button.className = "i3d-picker-button";
              button.append(editorHost.createElement("span", "", vector[fieldKey] || emptyLabel));
              button.title = vector[fieldKey] || emptyLabel;
              return button;
            };
            const bladeSection = editorHost.createElement("div", "i3d-config-row");
            bladeSection.append(editorHost.createElement("h4", "", "扇叶动画"));
            bladeSection.append(
              editorHost.createElement(
                "p",
                "i3d-note",
                "默认跟随主实体；纯自定义时选择运行开关和风速。这里只指定动画来源，控制仍在附加功能中。风速 0 不代替关机。",
              ),
            );
            createSettingRow(
              bladeSection,
              "运行跟随",
              makeFanFollowButton("runEntityId", "run", "未选择（跟随主实体）"),
            );
            createSettingRow(
              bladeSection,
              "风速跟随",
              makeFanFollowButton("speedEntityId", "speed", "未选择（跟随主实体）"),
            );
            createSettingRow(
              bladeSection,
              "方向跟随",
              makeFanFollowButton(
                "directionEntityId",
                "direction",
                "未选择（跟随主实体）",
              ),
            );
            if (vector.directionEntityId) {
              const reverseOptions = fanReverseStateOptions(
                vector.directionEntityId,
                entityLiveState(vector.directionEntityId),
              );
              const reverseChoices: [string, string][] = [
                ["", "请选择设备的反转状态"],
                ...reverseOptions,
              ];
              if (
                vector.reverseState &&
                !reverseOptions.some(([value]) => value === vector.reverseState)
              ) {
                reverseChoices.unshift([
                  vector.reverseState,
                  vector.reverseState + "（当前未找到）",
                ]);
              }
              createSelectRow(
                bladeSection,
                "反转对应状态",
                reverseChoices,
                vector.reverseState || "",
                (nextValue: string) => {
                  if (nextValue) vector.reverseState = nextValue;
                  else delete vector.reverseState;
                  refreshEditorPreview();
                  renderPanel();
                },
              );
            }
            const fanPreview = resolveFanBindingState(vector, editorHost.latestStates || editorHost.states || {});
            bladeSection.append(
              editorHost.createElement(
                "p",
                "i3d-note",
                "扇叶状态：" +
                  (fanPreview.label || "状态未知") +
                  " · " +
                  (fanPreview.directionKnown
                    ? fanPreview.direction < 0
                      ? "反转"
                      : "正转"
                    : "方向未知"),
              ),
            );
            fanControlSection.append(bladeSection);
          }
          if (editorHost.isCoverMode) {
            if (!matchedCurtainGroup) {
              const combineCurtainButton = editorHost.createButton("组合另一扇窗帘", () =>
                openCurtainGroupDialog(vector),
              );
              ((combineCurtainButton.disabled = !curtainGroupCandidates2(
                editorHost.structuredClone2.environment,
                vector.id,
              ).length),
                currentContainer.append(
                  combineCurtainButton,
                  editorHost.createElement(
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
                (pickedCurtainKind: any) => {
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
              curtainFabricRowElement = editorHost.sceneMetadata.floors
                .find((pickedCurtainFabric: any) => pickedCurtainFabric.id === vector.floorId)
                ?.curtains?.find((vacuumEntityProbe: any) => vacuumEntityProbe.id === vector.modelId),
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
                (mapEntityProbe: any) => {
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
                  editorHost.createElement(
                    "p",
                    "i3d-note",
                    (curtainFabricRowElement.curtainTrack === "u" ? "U" : "L") +
                      " 型轨道，尺寸和合拢位置继承户型模型。",
                  ),
                ),
              isRollerCover &&
                currentContainer.append(
                  editorHost.createElement(
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
                  (deviceEntityOption: any) => {
                    ((vector.coverDirection = ["left", "right", "split"].includes(deviceEntityOption)
                      ? deviceEntityOption
                      : "auto"),
                      refreshEditorPreview());
                  },
                ),
              vector.entityId)
            )
              currentContainer.append(
                editorHost.createElement(
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
                  (pickedUnboundPosition: any) => {
                    ((vector.unboundPosition = Number(pickedUnboundPosition)),
                      refreshEditorPreview());
                  },
                ),
                currentContainer.append(
                  editorHost.createElement(
                    "p",
                    "i3d-note",
                    "仅设置 3D 帘布的展示状态；绑定实体后自动跟随实际开合。",
                  ),
                ));
            }
          }
          if (editorHost.isVacuumMode) {
            const vacuumDeviceButton = editorHost.createButton(
              vector.deviceName || "选择扫地机设备",
              () => void openItemPicker("vacuum", vacuumDeviceButton),
            );
            ((vacuumDeviceButton.className = "i3d-picker-button"),
              createSettingRow(currentContainer, "绑定设备", vacuumDeviceButton));
            const cachedDeviceEntry = editorHost.map.get(vector.deviceId) || {
              entities: editorHost.entities.filter(
                (vacuumShortcutProbe: any) =>
                  /^vacuum\./.test(vacuumShortcutProbe.entityId) &&
                  (vacuumShortcutProbe.deviceId === vector.deviceId ||
                    vacuumShortcutProbe.entityId === vector.deviceId),
              ),
              maps: editorHost.entities.filter(
                (shortcutEntityProbe: any) =>
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
                    ...cachedDeviceEntry.entities.map((vacuumEntityOption: any) => [
                      vacuumEntityOption.entityId,
                      vacuumEntityOption.name || vacuumEntityOption.entityId,
                    ]),
                  ],
                  vector.entityId,
                  (pickedMainEntity: any) => {
                    ((vector.entityId = pickedMainEntity), refreshEditorPreview());
                  },
                )
              : vector.entityId &&
                currentContainer.append(editorHost.createElement("p", "i3d-note", "已识别：" + vector.entityId)),
              (currentContainer = createConfigSection("地图与移动")));
            const followOffsetInput = editorHost.createElement("input");
            (Object.assign(followOffsetInput, {
              type: "number",
              min: "0",
              max: "300",
              step: "1",
              value: String(editorHost.structuredClone2.navigation?.followOffset ?? 16),
              title: "所有扫地机共用此标签偏移",
            }),
              followOffsetInput.addEventListener("change", () => {
                if (!editorHost.isAccessAllowed || editorHost.isDisposed) return;
                const NaN5 =
                  followOffsetInput.value.trim() === "" ? NaN : Number(followOffsetInput.value);
                (Number.isFinite(NaN5) &&
                  ((editorHost.structuredClone2.navigation = {
                    ...editorHost.structuredClone2.navigation,
                    followOffset: Math.max(0, Math.min(300, NaN5)),
                  }),
                  refreshEditorPreview()),
                  (followOffsetInput.value = String(
                    editorHost.structuredClone2.navigation?.followOffset ?? 16,
                  )));
              }),
              createSettingRow(currentContainer, "跟随标签上移（px）", followOffsetInput));
            for (const [vacuumToggleKey, vacuumToggleLabel] of [
              ["motionEnabled", "跟随真实位置移动"],
              ["funMessages", "工作时显示趣味短句"],
            ]) {
              const vacuumToggleCheckbox = editorHost.createElement("input");
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
                  ...cachedDeviceEntry.maps.map((mapOptionEntry: any) => [
                    mapOptionEntry.entityId,
                    mapOptionEntry.name || mapOptionEntry.entityId,
                  ]),
                ],
                vector.map?.entityId || "",
                (pickedMapEntityId: any) => {
                  ((vector.map = {
                    ...vector.map,
                    entityId: pickedMapEntityId,
                  }),
                    refreshEditorPreview(),
                    renderPanel());
                },
              );
            const mapPickerButton = editorHost.createButton(
              vector.map?.entityId || "选择扫地机地图",
              async () => {
                const mapPickerGeneration = ++editorHost.pickerGeneration;
                try {
                  editorHost.pickerHandle = await editorHost.pickers.entity({
                    trigger: mapPickerButton, deviceKind: "vacuum-e.map",
                    current: vector.map?.entityId || "",
                    onSelect(pickedMapEntity: any) {
                      editorHost.isDisposed ||
                        !editorHost.isAccessAllowed ||
                        mapPickerGeneration !== editorHost.pickerGeneration ||
                        !editorHost.getItemList().includes(vector) ||
                        ((vector.map = {
                          ...vector.map,
                          entityId: pickedMapEntity,
                        }),
                        refreshEditorPreview(),
                        renderPanel());
                    },
                  });
                } catch (mapPickerError: any) {
                  editorHost.errorMessageElement.textContent = mapPickerError.message;
                }
              },
            );
            ((mapPickerButton.className = "i3d-picker-button"),
              createSettingRow(currentContainer, "地图来源", mapPickerButton));
            const alignMapButton = editorHost.createButton("底图对齐", () => {
              const mapEntityState =
                  editorHost.latestStates === null
                    ? editorHost.states?.get?.(vector.map?.entityId)
                    : editorHost.latestStates[vector.map?.entityId],
                itemEntityState =
                  editorHost.latestStates === null
                    ? editorHost.states?.get?.(vector.entityId)
                    : editorHost.latestStates[vector.entityId],
                mapIdentity = vacuumMapIdentity2(mapEntityState, itemEntityState),
                editableItemForMapEditor = {
                  ...vector, map: {
                    ...vector.map,
                  },
                };
              (mapIdentity
                ? (editableItemForMapEditor.map.sourceMapId = mapIdentity)
                : delete editableItemForMapEditor.map.sourceMapId,
                (editorHost.subEditorHandle = openVacuumMapEditor2({
                  item: editableItemForMapEditor,
                  floor: editorHost.sceneMetadata.floors.find(
                    (mapFloorProbe: any) => mapFloorProbe.id === vector.floorId,
                  ),
                  getMapState: () =>
                    editorHost.latestStates === null
                      ? editorHost.states?.get?.(vector.map?.entityId)
                      : editorHost.latestStates[vector.map?.entityId],
                  onSave(savedMapRecord: any) {
                    !editorHost.isDisposed &&
                      editorHost.isAccessAllowed &&
                      editorHost.getItemList().includes(vector) &&
                      ((vector.map = savedMapRecord.map), refreshEditorPreview(), renderPanel());
                  },
                })));
            });
            currentContainer.append(alignMapButton);
          }
          if (editorHost.isTelevisionMode) {
            const powerEntityButton = editorHost.createButton(
              vector.powerEntityId || "不单独绑定",
              () => void openItemPicker("powerEntity", powerEntityButton),
            );
            ((powerEntityButton.className = "i3d-picker-button"),
              createSettingRow(currentContainer, "电视电源实体（可选）", powerEntityButton),
              currentContainer.append(
                editorHost.createElement(
                  "p",
                  "i3d-note",
                  "可绑定能提供开关状态的实体；不单独绑定电源时跟随媒体播放器状态。电视开启时优先显示可用节目封面，没有封面时显示自定义图片；未上传图片则显示当前播放状态，关闭时显示深色玻璃。",
                ),
              ));
            renderDeviceScreenImageSection(
              "电视自定义图片",
              "电视自定义图片",
              "上传电视自定义图片",
              "无封面时的图片",
              "支持 PNG、JPG/JPEG、WebP、SVG、GIF、BMP、TIFF、AVIF、HEIC/HEIF 和 ICO。动图使用第一帧；图片保持原比例。删除后恢复默认显示，保存配置后生效。",
            );
          }
          if (
            editorHost.isNasMode &&
              currentContainer.append(
                editorHost.createElement(
                  "p",
                  "i3d-note",
                  vector.statusSource
                    ? "已选择 NAS 自身状态数据作为呼吸灯依据。安全状态只用于告警。"
                    : "请先选择 NAS 数据来源，缺少 CPU 等个别指标也可绑定。",
                ),
              ),
            !matchedCurtainGroup
          ) {
            ((currentContainer = createConfigSection("交互行为")),
              createSelectRow(
                currentContainer,
                editorHost.deviceKind === "smallcar"
                  ? "点击标签或模型"
                  : "点击" + editorHost.kindLabel,
                // 车辆（0.8.1）：标签与车模共用同一设置，多一个「不响应点击」的空档。
                editorHost.deviceKind === "smallcar"
                  ? [
                      ["none", "不响应点击"],
                      ["focus", "仅聚焦"],
                      ["panel", "仅显示弹窗"],
                      ["focus-panel", "聚焦并显示弹窗"],
                    ]
                  : bindingContainer && !vector.entityId
                  ? [["focus", "聚焦并显示控制"]]
                  : editorHost.isAirerMode
                    ? [
                        ["focus", "聚焦并显示控制"],
                        ["panel", "仅显示控制"],
                      ]
                    : editorHost.isSpeakerMode
                      ? [
                          ["focus-panel", "聚焦并显示控制"],
                          ["panel", "仅显示控制"],
                          ["focus", "仅聚焦"],
                        ]
                      : editorHost.isTelevisionMode
                        ? [
                            ["focus-panel", "聚焦并显示控制"],
                            ["panel", "仅显示控制"],
                            ["focus", "仅聚焦"],
                            ["turn-on-focus", "开关电视（开机时聚焦）"],
                            ["turn-on", "仅开关电视"],
                            ["turn-on-panel", "开关电视（开机时显示控制）"],
                          ]
                        : editorHost.usesStatusPanel
                          ? [
                              [
                                "focus-panel",
                                editorHost.isGenericDeviceMode ? "聚焦并显示弹窗" : "聚焦并显示状态",
                              ],
                              ["panel", editorHost.isGenericDeviceMode ? "仅显示弹窗" : "仅显示状态"],
                              ["focus", "仅聚焦"],
                            ]
                          : editorHost.isCoverMode
                            ? [
                                ["focus", "聚焦并显示控制"],
                                ["panel", "仅显示控制"],
                                ["turn-on-focus", "开合窗帘（打开时聚焦）"],
                                ["turn-on", "仅开合窗帘"],
                                ["turn-on-panel", "开合窗帘（打开时显示控制）"],
                              ]
                            : editorHost.isClimateMode
                              ? [
                                  ["focus", "聚焦并显示控制"],
                                  ["turn-on-focus", "开关" + editorHost.kindLabel + "（开启时聚焦）"],
                                  ["turn-on", "仅开关" + editorHost.kindLabel],
                                  ["turn-on-panel", "开关" + editorHost.kindLabel + "（开启时显示控制）"],
                                ]
                              : [
                                  ["focus", "聚焦并显示控制"],
                                  ["turn-on-focus", "开关灯（开灯时聚焦）"],
                                  ["turn-on", "仅开关灯"],
                                  ["turn-on-panel", "开关灯（开灯时显示控制）"],
                                ],
                editorHost.deviceKind === "smallcar" ? carClickAction2(vector) : vector.clickAction,
                (pickedCoverClickAction: any) => {
                  (editorHost.deviceKind === "smallcar"
                    ? // 车辆：`interactionEnabled` 是开关本身，`clickAction` 只在打开时生效。
                      ((vector.interactionEnabled = pickedCoverClickAction !== "none"),
                      (vector.clickAction = pickedCoverClickAction))
                    : (vector.clickAction = editorHost.normalizeClickAction(pickedCoverClickAction)),
                    refreshEditorPreview());
                },
              ),
              editorHost.deviceKind === "smallcar"
                ? currentContainer.append(
                    editorHost.createElement(
                      "p",
                      "i3d-note",
                      "顶部状态标签和车辆模型共用此设置。聚焦时隐藏所有车辆的状态及胎压标签，退出后恢复。",
                    ),
                  )
                : editorHost.isCoverMode
                ? currentContainer.append(
                    editorHost.createElement(
                      "p",
                      "i3d-note",
                      "开关类行为：完全关闭时打开，已打开或半开时关闭，运动中点击先停止。仅打开时执行所选聚焦或弹窗。",
                    ),
                  )
                : bindingContainer
                  ? currentContainer.append(
                      editorHost.createElement(
                        "p",
                        "i3d-note",
                        vector.entityId
                          ? "开关行为只操作主实体；独立功能分别在弹窗内控制。"
                          : "未绑定主实体，点击入口打开各功能控制。",
                      ),
                    )
                  : !editorHost.isAirerMode &&
                    (!editorHost.usesStatusPanel || editorHost.isTelevisionMode) &&
                    currentContainer.append(
                      editorHost.createElement(
                        "p",
                        "i3d-note",
                        "开关类行为：已开启时直接关闭；已关闭时开启，并执行所选聚焦或弹窗。",
                      ),
                    ));
            const clickActionVisibilityRow = editorHost.createElement("div", "i3d-button-visibility-row");
            currentContainer.append(clickActionVisibilityRow);
            const hiddenClickableCheckbox = editorHost.createElement("input");
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
            const buttonHiddenCheckbox = editorHost.createElement("input");
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
          if (editorHost.deviceKind !== "smallcar") {
            if (
              ((currentContainer = createConfigSection(editorHost.isVacuumMode ? "状态标签" : "按钮外观")),
              editorHost.isCoverMode)
            ) {
              const iconStateReversedCheckbox = editorHost.createElement("input");
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
            if (!editorHost.isVacuumMode) {
              const itemIconPickerButton = editorHost.createButton(
                "",
                () => void openItemPicker("icon", itemIconPickerButton),
              );
              itemIconPickerButton.className = "i3d-picker-button i3d-icon-picker-button";
              const itemIconPreviewElement = editorHost.createElement("i");
              itemIconPreviewElement.setAttribute("aria-hidden", "true");
              const memberBindingManageSectionElement =
                "/static/vendor/mdi/7.4.47/svg/" + vector.icon.replace(/^mdi:/, "") + ".svg";
              ((itemIconPreviewElement.style.maskImage =
                'url("' + memberBindingManageSectionElement + '")'),
                (itemIconPreviewElement.style.webkitMaskImage =
                  'url("' + memberBindingManageSectionElement + '")'),
                itemIconPickerButton.append(
                  itemIconPreviewElement,
                  editorHost.createElement("span", "", vector.icon),
                ),
                createSettingRow(itemAppearanceRowElement, "图标", itemIconPickerButton));
            }
            if (matchedCurtainGroup) {
              (createConfigSection("绑定管理").append(
                editorHost.createElement("p", "i3d-note", "删除此成员会自动解除组合，另一成员恢复原入口。"),
                removeItemButton,
              ),
                editorHost.panelElement.append(editorHost.errorMessageElement),
                (saveButtonElement.disabled = editorHost.isSaving || !editorHost.isAccessAllowed));
              return;
            }
            const coverSizeGridElement = editorHost.createElement("div", "i3d-coordinate-grid i3d-size-grid"),
              coverSizeDetailsElement = editorHost.createElement("details");
            (coverSizeDetailsElement.append(
              editorHost.createElement("summary", "", "更多尺寸设置"),
              coverSizeGridElement,
            ),
              currentContainer.append(coverSizeDetailsElement));
            const readHitSize = () =>
              Number.isFinite(vector.hitSize) && vector.hitSize > 0
                ? vector.hitSize
                : Math.max(DEFAULT_BUTTON_SIZE, vector.size);
            createSizeRow(
              itemAppearanceRowElement,
              editorHost.isVacuumMode ? "状态框缩放（%）" : "按钮大小（px）",
  
  
              () =>
                editorHost.isVacuumMode
                  ? Math.round((vector.size / DEFAULT_BUTTON_SIZE) * 100)
                  : vector.size,
              (pickedSizeValue: any) => {
                ((vector.size = editorHost.isVacuumMode
                  ? (pickedSizeValue / 100) * DEFAULT_BUTTON_SIZE
                  : pickedSizeValue),
                  !editorHost.isVacuumMode && syncLinkedIconSize(vector, vector.size),
                  (hitSizeInputElement.value = String(Number(readHitSize().toPrecision(12)))),
                  refreshEditorPreview());
              },
            );
  
  
            editorHost.isVacuumMode &&
              createSizeRow(
                coverSizeGridElement,
                "文字大小（px）",
                () => vector.iconSize / 2,
                (pickedIconSizeValue: any) => {
                  ((vector.iconSize = pickedIconSizeValue * 2), refreshEditorPreview());
                },
              );
            const hitSizeInputElement = createSizeRow(
              coverSizeGridElement,
              "触控范围（px）",
              readHitSize,
              (pickedHitSizeValue: any) => {
                ((vector.hitSize = pickedHitSizeValue), refreshEditorPreview());
              },
            );
            editorHost.isVacuumMode &&
              appendBackgroundOpacityControl2(
                currentContainer,
                vector,
                "backgroundOpacity",
                refreshEditorPreview,
              );
          }
          if (editorHost.usesModelBinding) {
            currentContainer = createConfigSection(
              editorHost.isVacuumMode || editorHost.deviceKind === "smallcar" ? "标签位置" : "按钮位置",
            );
            const modelBindingEntry = editorHost.sceneMetadata.floors
                .find((modelBindingFloorProbe: any) => modelBindingFloorProbe.id === vector.floorId)
                ?.[editorHost.collectionKey]?.find(
                  (modelBindingModelProbe: any) => modelBindingModelProbe.id === vector.modelId,
                ),
              coverPositionGridElement = editorHost.createElement("div", "i3d-coordinate-grid");
            currentContainer.append(coverPositionGridElement);
            const resetPositionButton = editorHost.createButton("恢复跟随模型", () => {
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
                : editorHost.deviceKind === "smallcar" && coverCoordinateLabel !== "height"
                  ? 0
                  : editorHost.isVacuumMode && coverCoordinateLabel === "height"
                    ? (Number(modelBindingEntry?.elevation) || 0) +
                      (Number(modelBindingEntry?.height) || 0.85) +
                      0.25
                    : Number.isFinite(modelBindingEntry?.[coverCoordinateLabel])
                      ? modelBindingEntry[coverCoordinateLabel]
                      : 0;
              createNumberRow(
                coverPositionGridElement,
                editorHost.deviceKind === "smallcar" && coverCoordinateLabel !== "height"
                  ? "相对汽车偏移 " + coverCoordinateLabel.toUpperCase()
                  : editorHost.isVacuumMode && coverCoordinateLabel === "height"
                    ? "离地高度（米）"
                    : coverCoordinateMin,
                coordinateNumericValue,
                coverCoordinateMax,
                coverCoordinateStep,
                coordinateValue,
                (pickedMeterIconSizeValue: any) => {
                  ((vector[coverCoordinateLabel] = pickedMeterIconSizeValue),
                    (resetPositionButton.disabled = false),
                    refreshEditorPreview());
                },
              );
            }
            currentContainer.append(resetPositionButton);
            const lightBatchSectionElement = editorHost.createElement(
                "section",
                "navigation-batch-section i3d-light-batch",
              ),
              batchTitleElement = editorHost.createElement("h4"),
              batchCountElement = editorHost.createElement("span");
            batchTitleElement.append(
              editorHost.createElement(
                "span",
                "",
                editorHost.deviceKind === "smallcar" ? "卡片设置一键应用" : "图标设置一键应用",
              ),
              batchCountElement,
            );
            const lightBatchApplyButton = editorHost.createButton("一键应用到其他" + editorHost.kindLabel, () =>
              openCurtainGroupBatchApplyDialog(vector),
            );
            ((refreshBatchButtonsCell.current = () => {
              const lightChangeCount = listChangedFields(vector).length;
              ((batchCountElement.textContent = lightChangeCount + " 项修改"),
                (lightBatchApplyButton.disabled =
                  !editorHost.isAccessAllowed || editorHost.isCameraEditing || editorHost.isCameraCommandPending));
            }),
              refreshBatchButtonsCell.current(),
              lightBatchSectionElement.append(batchTitleElement, lightBatchApplyButton),
              currentContainer.append(lightBatchSectionElement));
          } else {
            currentContainer = createConfigSection("按钮位置");
            const lightPositionGridElement = editorHost.createElement("div", "i3d-coordinate-grid");
            currentContainer.append(lightPositionGridElement);
            for (const lightPositionAxis of ["x", "y"])
              createNumberRow(
                lightPositionGridElement,
                "位置 " + lightPositionAxis.toUpperCase(),
                vector[lightPositionAxis],
                -1000000,
                1000000,
                1,
                (pickedLightX: any) => {
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
              (pickedLightHeight: any) => {
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
                (pickedFadeDuration: any) => {
                  ((vector.fadeDuration = pickedFadeDuration), refreshEditorPreview());
                },
              ));
            const lightEffectBatchSectionElement = editorHost.createElement(
                "section",
                "navigation-batch-section i3d-light-batch",
              ),
              effectBatchTitleElement = editorHost.createElement("h4"),
              effectBatchCountElement = editorHost.createElement("span");
            effectBatchTitleElement.append(
              editorHost.createElement("span", "", "灯光设置一键应用"),
              effectBatchCountElement,
            );
            const effectBatchApplyButton = editorHost.createButton("一键应用到其他灯光", () =>
              openCurtainGroupBatchApplyDialog(vector),
            );
            ((refreshBatchButtonsCell.current = () => {
              const effectChangeCount = listChangedFields(vector).length;
              ((effectBatchCountElement.textContent = effectChangeCount + " 项修改"),
                (effectBatchApplyButton.disabled =
                  !editorHost.isAccessAllowed ||
                  editorHost.isCameraEditing ||
                  editorHost.isCameraCommandPending ||
                  editorHost.isRangeEditorOpen));
            }),
              refreshBatchButtonsCell.current(),
              lightEffectBatchSectionElement.append(effectBatchTitleElement, effectBatchApplyButton),
              currentContainer.append(lightEffectBatchSectionElement));
          }
          if (editorHost.deviceKind !== "smallcar") {
            const coverFocusSectionElement = editorHost.createElement(
              "section",
              "i3d-focus-settings i3d-config-section",
            );
            editorHost.panelElement.append(coverFocusSectionElement);
            // 设备大类以前没有挂错误提示节点，聚焦/保存视角失败时错误只写进了游离元素，界面完全没反馈。
            const cameraPropertyKey =
              editorHost.isVacuumMode && editorHost.vacuumCameraMode === "follow" ? "followCamera" : "focusCamera";
            if (
              (coverFocusSectionElement.append(
                editorHost.createElement(
                  "h4",
                  "",
                  cameraPropertyKey === "followCamera" ? "跟随视角" : "聚焦视角",
                ),
              ),
              editorHost.isVacuumMode && !editorHost.isCameraEditing)
            ) {
              const cameraModeActionsElement = editorHost.createElement("div", "i3d-focus-actions");
              for (const [cameraModeKey, cameraModeLabel] of [
                ["focus", "聚焦视角"],
                ["follow", "跟随视角"],
              ]) {
                const cameraModeButton = editorHost.createButton(cameraModeLabel, () => {
                  ((editorHost.vacuumCameraMode = cameraModeKey), renderPanel());
                });
                (cameraModeButton.setAttribute(
                  "aria-pressed",
                  String(editorHost.vacuumCameraMode === cameraModeKey),
                ),
                  (cameraModeButton.disabled = editorHost.isCameraCommandPending),
                  cameraModeActionsElement.append(cameraModeButton));
              }
              coverFocusSectionElement.append(cameraModeActionsElement);
            }
            cameraPropertyKey === "followCamera" &&
              coverFocusSectionElement.append(
                editorHost.createElement(
                  "p",
                  "i3d-note",
                  "固定鸟瞰角度跟随机器人平移，不随机器人转向。调整角度和远近后保存；跟随时不弹出控制面板。",
                ),
              );
            const queueCameraCommand = async (cameraCommand: any, cameraRangePayload: any = undefined) => {
                const sceneReadySnapshot = editorHost.num,
                  isFocalLengthRangeCommand = cameraCommand === "focus-focal-length",
                  pendingCameraQueue = editorHost.cameraCommandQueue;
                let cameraRangeResolve;
                ((editorHost.cameraCommandQueue = new Promise((resolveCameraQueuePromise) => {
                  cameraRangeResolve = resolveCameraQueuePromise;
                })),
                  isFocalLengthRangeCommand ||
                    ((editorHost.isCameraCommandPending = true),
                    (editorHost.errorMessageElement.textContent = ""),
                    renderPanel()));
                // 预览重载后旧的相机快照已失效：必须给出提示，不能静默 return，
                // 否则按钮会一直停在「保存视角 / 取消调整」。
                const isPreviewStale = () => !editorHost.isDisposed && sceneReadySnapshot !== editorHost.num;
                const reportStalePreview = () => {
                  editorHost.isDisposed ||
                    (editorHost.errorMessageElement.textContent = "预览已刷新，请重新调整视角。");
                };
                try {
                  if ((await pendingCameraQueue, editorHost.isDisposed)) return;
                  if (isPreviewStale()) return reportStalePreview();
                  const focusCommand2 = await editorHost.editorRuntime.focusCommand(
                    cameraPropertyKey === "followCamera" && cameraCommand === "edit-light-camera"
                      ? "edit-follow-camera"
                      : cameraCommand,
                    vector.id,
                    cameraRangePayload,
                  );
                  if (editorHost.isDisposed) return;
                  if (isPreviewStale()) return reportStalePreview();
                  cameraCommand === "save-light-camera"
                    ? ((vector[cameraPropertyKey] = focusCommand2.camera),
                      (editorHost.isCameraEditing = false),
                      (editorHost.pendingCameraDraft = null),
                      refreshEditorPreview())
                    : cameraCommand === "cancel-light-camera"
                      ? ((editorHost.isCameraEditing = false), (editorHost.pendingCameraDraft = null))
                      : cameraCommand !== "preview-light-camera" &&
                        ((editorHost.isCameraEditing = true), (editorHost.pendingCameraDraft = focusCommand2.camera));
                } catch (cameraCommandError: any) {
                  editorHost.isDisposed ||
                    (editorHost.errorMessageElement.textContent = cameraCommandError.message);
                } finally {
                  // 无论成功、失败还是预览已刷新都要清掉 pending 并重绘，
                  // 否则相机按钮会永久禁用、视角状态卡死。
                  (cameraRangeResolve!(),
                    !editorHost.isDisposed &&
                      !isFocalLengthRangeCommand &&
                      ((editorHost.isCameraCommandPending = false), renderPanel()));
                }
              },
              cameraActionsElement = editorHost.createElement("div", "i3d-focus-actions");
            if ((coverFocusSectionElement.append(cameraActionsElement), editorHost.isCameraEditing)) {
              const saveCameraButton = editorHost.createButton(
                "保存视角",
                () => void queueCameraCommand("save-light-camera"),
              );
              ((saveCameraButton.className = "primary"),
                cameraActionsElement.append(
                  saveCameraButton,
                  editorHost.createButton("取消调整", () => void queueCameraCommand("cancel-light-camera")),
                ));
              const coverProjectionGroupElement = editorHost.createElement("div", "i3d-focus-actions");
              (coverProjectionGroupElement.setAttribute("role", "group"),
                coverProjectionGroupElement.setAttribute("aria-label", "聚焦投影"),
                coverFocusSectionElement.append(coverProjectionGroupElement));
              for (const [projectionKey, projectionLabel] of [
                ["orthographic", "正交"],
                ["perspective", "透视"],
              ]) {
                const projectionButton = editorHost.createButton(
                  projectionLabel,
                  () => void queueCameraCommand("focus-projection", projectionKey),
                );
                (projectionButton.setAttribute(
                  "aria-pressed",
                  String((editorHost.pendingCameraDraft?.mode || "orthographic") === projectionKey),
                ),
                  coverProjectionGroupElement.append(projectionButton));
              }
              const focalLengthInput = createNumberRow(
                coverFocusSectionElement,
                "焦段（mm）",
                Math.round(editorHost.pendingCameraDraft?.focalLength || 50),
                18,
                120,
                1,
                (pickedFocalLength: any) => void queueCameraCommand("focus-focal-length", pickedFocalLength),
              );
              focalLengthInput.disabled = editorHost.pendingCameraDraft?.mode !== "perspective";
            } else {
              cameraActionsElement.append(
                editorHost.createButton(
                  vector[cameraPropertyKey] ? "调整视角" : "设置视角",
                  () => void queueCameraCommand("edit-light-camera"),
                ),
                ...(cameraPropertyKey === "followCamera"
                  ? []
                  : [editorHost.createButton("预览聚焦", () => void queueCameraCommand("preview-light-camera"))]),
              );
              const resetCameraButton = editorHost.createButton(
                cameraPropertyKey === "followCamera" ? "恢复默认鸟瞰" : "恢复自动聚焦",
                async () => {
                  try {
                    (await editorHost.editorRuntime.focusCommand("cancel-light-camera", vector.id),
                      delete vector[cameraPropertyKey],
                      refreshEditorPreview(),
                      renderPanel());
                  } catch (cameraSaveError: any) {
                    editorHost.errorMessageElement.textContent = cameraSaveError.message;
                  }
                },
              );
              ((resetCameraButton.disabled = !vector[cameraPropertyKey]),
                (resetCameraButton.className = "i3d-focus-reset"),
                coverFocusSectionElement.append(resetCameraButton));
            }
            if (editorHost.isCameraCommandPending) {
              for (const focusLockedControl of coverFocusSectionElement.querySelectorAll(
                "button, input",
              ))
                focusLockedControl.disabled = true;
            }
            // 相机命令的失败原因直接挂在聚焦视角下方；以前设备面板没挂这个节点，失败是完全静默的。
            editorHost.errorMessageElement.isConnected ||
              coverFocusSectionElement.append(editorHost.errorMessageElement);
          }
          createConfigSection("绑定管理").append(removeItemButton);
        } else
          currentContainer.append(
            editorHost.createElement(
              "p",
              "i3d-note",
              editorHost.isVacuumMode
                ? addItemButton.length
                  ? "点击“添加扫地机”，选择模型后绑定扫地机设备。"
                  : "当前楼层暂无扫地机模型，请先在 3D 户型图绘制中添加扫地机器人后更新户型。"
                : editorHost.isGenericDeviceMode
                  ? addItemButton.length
                    ? "点击“添加" + editorHost.kindLabel + "”，选择模型并绑定 HA 设备。"
                    : "当前楼层暂无" +
                      editorHost.kindLabel +
                      "模型，请先在 3D 户型图绘制中添加" +
                      editorHost.kindLabel +
                      "后更新户型。"
                  : editorHost.isSpeakerMode
                    ? addItemButton.length
                      ? "点击“添加设备”，选择智能音响模型并绑定媒体播放器实体。"
                      : "当前楼层暂无智能音响模型，请先在 3D 户型图绘制中添加智能音响后更新户型。"
                    : editorHost.isTelevisionMode
                      ? addItemButton.length
                        ? "点击“添加设备”，选择电视模型并绑定媒体播放器实体。"
                        : "当前楼层暂无电视模型，请先在 3D 户型图绘制中添加电视后更新户型。"
                      : editorHost.isNasMode
                        ? addItemButton.length
                          ? "点击“添加设备”，选择设备类型和模型，再绑定开启实体。"
                          : "当前楼层暂无 NAS 模型，请先在 3D 户型图绘制中添加 NAS 模型后更新户型。"
                        : editorHost.isCoverMode
                          ? addItemButton.length
                            ? "点击“添加窗帘”，选择需要控制的窗帘模型。"
                            : "当前楼层暂无窗帘模型，请先在 3D 户型图绘制中添加普通窗帘后更新户型。"
                          : editorHost.deviceKind === "water-heater"
                            ? addItemButton.length
                              ? "点击“添加热水器”，选择需要控制的热水器模型。"
                              : "当前楼层暂无热水器模型，请先在 3D 户型图绘制中添加储水式或燃气式热水器后更新户型。"
                            : ["airer", "fan", "purifier"].includes(editorHost.deviceKind)
                              ? addItemButton.length
                                ? "点击“添加" + editorHost.kindLabel + "”，选择需要控制的" + editorHost.kindLabel + "模型。"
                                : "当前楼层暂无" +
                                  editorHost.kindLabel +
                                  "模型，请先在 3D 户型图绘制中添加" +
                                  editorHost.kindLabel +
                                  "后更新户型。"
                              : editorHost.isClimateMode
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
        (editorHost.panelElement.append(editorHost.errorMessageElement),
        (saveButtonElement.disabled =
          editorHost.isSaving || !editorHost.isAccessAllowed || editorHost.isCameraEditing || editorHost.isCameraCommandPending),
        editorHost.isCameraEditing || editorHost.isCameraCommandPending)
      ) {
        for (const rangeLockedControl of editorHost.panelElement.querySelectorAll("input, select, button"))
          rangeLockedControl.closest(".i3d-focus-settings") || (rangeLockedControl.disabled = true);
      }
      if (editorHost.isRangeEditorOpen) {
        for (const rangeLockedControlElement of editorHost.panelElement.querySelectorAll(
          "input, select, button",
        ))
          rangeLockedControlElement.dataset.interaction3dRangeEditor !== "true" &&
            (rangeLockedControlElement.disabled = true);
      }
    }
