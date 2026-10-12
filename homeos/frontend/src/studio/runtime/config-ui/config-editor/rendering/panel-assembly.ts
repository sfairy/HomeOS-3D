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
import { GENERIC_DEVICE_KINDS as GENERIC_DEVICE_KINDS2, genericDeviceProfile as genericDeviceProfile2 } from "../../../device/generic-device-catalog";
import { appendBackgroundOpacityControl as appendBackgroundOpacityControl2 } from "../../../core/label-appearance";
import { bathEffectEditor as bathEffectEditor2 } from "../../../bath-heater/bath-heater-editor";
import { carChargingMappingError as carChargingMappingError2, carState as carState2, standardCarBindings as standardCarBindings2 } from "../../../vehicle/car-state";
import { curtainGroupCandidates as curtainGroupCandidates2, curtainGroupEntryId as curtainGroupEntryId2 } from "../../../cover/cover-groups";
import { deviceEntityCatalog as deviceEntityCatalog2 } from "../../device-entity-config";
import { extraLabels as extraLabels2, extraTypes as extraTypes2, purifierDeviceChanged as purifierDeviceChanged2, purifierRelatedEntities as purifierRelatedEntities2 } from "../../../climate/purifier-extras";
import { fanReverseStateOptions, fanSourceAllowed, resolveFanBindingState } from "../../../fan/fan-state";
import { normalizeInteraction3dLightingMode as normalizeInteraction3dLightingMode2 } from "@app/bridge/definition";
import { openInteraction3dRangeEditor as openInteraction3dRangeEditor2 } from "../../range-dialog";
import { openVacuumMapEditor as openVacuumMapEditor2 } from "../../../vacuum/vacuum-map-editor";
import { purifierState as purifierState2 } from "../../../purifier/purifier-state";
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
export interface PanelAssemblyDeps {
  /** 配置编辑器上下文对象（`e.panelElement` / `e.createElement` / `e.structuredClone2` 等）。 */
  e: any;
  /** 批处理按钮重建器的可变单元（代理到宿主 `let refreshBatchButtons`）。 */
  refreshBatchButtonsCell: { current: () => any };
  /** 局部重绘编辑器预览。 */
  refreshEditorPreview: () => any;
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
  /** 打开指标弹窗。 */
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
    e,
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
    openMetricsDialog,
    renderAirPurifierBindingSection,
    openCurtainGroupDialog,
    syncLinkedIconSize,
    renderStatusRuleSection,
    saveButtonElement,
  } = deps;
      ((e.refreshEffectSettings = () => {}),
        (e.bathEffectEditorHandle = () => {}),
        (e.redrawBathEffects = () => {}),
        (e.refreshAirflowStatus = () => {}),
        (e.renderAirflowSection = () => {}),
        (refreshBatchButtonsCell.current = () => {}),
        e.panelElement.replaceChildren());
      let currentContainer = e.panelElement;
      if (e.isVacuumShortcutMode) {
        renderVacuumShortcutPanel();
        return;
      }
      if (e.sceneMetadata) {
        if (
          ((currentContainer = createConfigRow(createConfigSection("配置范围"))),
          createSelectRow(
            currentContainer,
            "配置楼层",
            e.sceneMetadata.floors.map((floorOptionEntry: any) => [
              floorOptionEntry.id,
              floorOptionEntry.name,
            ]),
            e.floorSelection,
            (pickedFloorId: any) => {
              (e.pickerGeneration++,
                e.pickerHandle?.close(),
                (e.floorSelection = pickedFloorId),
                renderPanel(),
                refreshEditorPreview());
            },
          ),
          e.isDeviceKind &&
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
              e.deviceKind,
              (pickedDeviceCategory: any) => {
                pickedDeviceCategory !== e.deviceKind && switchEditorKind(pickedDeviceCategory);
              },
            ),
          e.includes &&
            createSelectRow(
              currentContainer,
              "环境类别",
              [
                ["climate", "空调/浴霸"],
                ["cover", "窗帘"],
                ["fan", "风扇 / 吊扇"],
                ["purifier", "空气净化器"],
                ["temperature-humidity", "环境标签"],
              ],
              e.deviceKind,
              (pickedEnvironmentCategory: any) => {
                pickedEnvironmentCategory !== e.deviceKind &&
                  switchEditorKind(pickedEnvironmentCategory);
              },
            ),
          e.isVacuumMode &&
            createSelectRow(
              currentContainer,
              "配置内容",
              [
                ["vacuum", "设备与地图"],
                ["vacuum-shortcut", "快捷指令"],
              ],
              e.deviceKind,
              (pickedVacuumCategory: any) => {
                pickedVacuumCategory !== e.deviceKind && switchEditorKind(pickedVacuumCategory);
              },
            ),
          e.isTemperatureHumidityMode)
        ) {
          (renderExtraControlsSection(),
            e.panelElement.append(e.errorMessageElement),
            (saveButtonElement.disabled = e.isSaving || !e.isAccessAllowed));
          return;
        }
        if (
          !e.usesModelBinding &&
          normalizeInteraction3dLightingMode2(e.structuredClone2.lightingMode) === "region"
        ) {
          const rangeSectionElement = createConfigSection("照射范围"),
            rangeEditorButton = e.createButton("编辑照射范围", async () => {
              if (!e.isRangeEditorOpen) {
                ((e.isRangeEditorOpen = true), (rangeEditorButton.disabled = true));
                try {
                  const rangeEditorHandle = await openInteraction3dRangeEditor2({ component: {
                      ...e.component,
                      properties: structuredClone(buildRuntimeProperties()),
                    },
                    document: e.documentApi, states: e.states,
                    onSave(savedLightRegion: any) {
                      if (e.isDisposed || !e.isAccessAllowed)
                        throw new Error("灯光配置已关闭，请重新打开。");
                      ((e.structuredClone2.lightRegionOverrides = structuredClone(savedLightRegion)),
                        refreshEditorPreview());
                    },
                    onClose() {
                      ((e.subEditorHandle = null),
                        (e.isRangeEditorOpen = false),
                        e.isDisposed || renderPanel());
                    },
                  });
                  if (e.isDisposed || !e.isAccessAllowed) {
                    rangeEditorHandle.close();
                    return;
                  }
                  e.subEditorHandle = rangeEditorHandle;
                } catch (rangeEditorError: any) {
                  ((e.isRangeEditorOpen = false),
                    e.isDisposed || (e.errorMessageElement.textContent = rangeEditorError.message));
                } finally {
                  e.isDisposed || renderPanel();
                }
              }
            });
          if (!rangeEditorButton) return;
          ((rangeEditorButton.dataset ||= {}),
            (rangeEditorButton.dataset.interaction3dRangeEditor = "true"),
            (rangeEditorButton.disabled = e.isRangeEditorOpen || !e.structuredClone2.sceneId),
            rangeSectionElement.append(
              rangeEditorButton,
              e.createElement(
                "p",
                "i3d-note",
                "在独立弹窗中拖动范围；保存范围后，再点击“保存配置”保存到当前控件。",
              ),
            ));
        }
        ((currentContainer = createConfigSection(e.usesModelBinding ? "模型列表" : "灯光列表")),
          (currentContainer.className += " i3d-compact-list"));
        const lightHeadingElement = e.createElement("div", "i3d-light-heading"),
          addItemButton = listAddableModels(),
          addEntryButton = e.createButton("添加" + e.kindLabel, openAddDialog);
        ((addEntryButton.disabled = !addItemButton.length),
          (lightHeadingElement.className = "i3d-config-list-row"),
          currentContainer.append(lightHeadingElement),
          lightHeadingElement.append(addEntryButton));
        const groupedCurtainModelIdSet = new Set(
            e.isCoverMode
              ? e.getCurtainGroupList().flatMap((sceneFloorProbe: any) => sceneFloorProbe.memberIds)
              : [],
          ),
          floorItems = (
            e.isCoverMode
              ? [
                  ...e.getCurtainGroupList().map((groupCandidateEntry: any) => ({
                    ...groupCandidateEntry,
                    id: curtainGroupEntryId2(groupCandidateEntry),
                    label: (groupCandidateEntry.label || "双层窗帘") + "（组合）",
                  })),
                  ...e.getItemList().filter(
                    (unboundItemProbe: any) => !groupedCurtainModelIdSet.has(unboundItemProbe.id),
                  ),
                ]
              : e.getItemList()
          ).filter(
            (optionEntry: any) =>
              optionEntry.floorId === e.floorSelection ||
              (e.usesModelBinding &&
                !e.sceneMetadata.floors.some(
                  (existingFloorItemProbe: any) => existingFloorItemProbe.id === optionEntry.floorId,
                )),
          ),
          curtainGroupOptions = e.selectedCurtainGroupId
            ? curtainGroupEntryId2(e.findCurtainGroupOf(e.selectedCurtainGroupId))
            : e.describeGroupFieldValue();
        (!floorItems.some((itemProbe: any) => itemProbe.id === curtainGroupOptions) &&
          !e.selectedCurtainGroupId &&
          (e.text = floorItems[0]?.id || ""),
          floorItems.length &&
            createSelectRow(
              lightHeadingElement,
              e.isDeviceKind ? "当前设备" : "当前按钮",
              floorItems.map((itemOptionEntry: any) => [itemOptionEntry.id, itemOptionEntry.label]),
              curtainGroupOptions,
              (pickedItemId: any) => {
                (e.pickerGeneration++,
                  e.pickerHandle?.close(),
                  (e.text = pickedItemId),
                  (e.selectedCurtainGroupId = ""),
                  refreshEditorPreview(),
                  renderPanel());
              },
            ));
        const activeCurtainGroup =
          e.isCoverMode &&
          e.getCurtainGroupList().find(
            (curtainGroupProbe: any) => curtainGroupEntryId2(curtainGroupProbe) === e.text,
          );
        if (activeCurtainGroup) {
          (renderCurtainGroupSection(activeCurtainGroup),
            e.panelElement.append(e.errorMessageElement),
            (saveButtonElement.disabled =
              e.isSaving || !e.isAccessAllowed || e.isCameraEditing || e.isCameraCommandPending));
          return;
        }
        const vector = e.getItemList().find((matchedItemProbe: any) => matchedItemProbe.id === e.text);
        if (vector) {
          const removeItemButton = e.createButton(
            e.isDeviceKind ? "删除此设备" : "删除此" + e.kindLabel + "按钮",
            () => {
              (e.pickerGeneration++,
                e.pickerHandle?.close(),
                e.setItemList(
                  e.getItemList().filter((removedItemProbe: any) => removedItemProbe.id !== vector.id),
                ),
                e.isCoverMode &&
                  e.findCurtainGroupOf(vector.id) &&
                  (e.structuredClone2.environment.curtainGroups = e.getCurtainGroupList().filter(
                    (groupMemberProbe: any) => !groupMemberProbe.memberIds.includes(vector.id),
                  )),
                (e.text = ""),
                (e.selectedCurtainGroupId = ""),
                refreshEditorPreview(),
                renderPanel());
            },
          );
          removeItemButton.className = "i3d-remove-light";
          const matchedCurtainGroup = e.isCoverMode && e.findCurtainGroupOf(vector.id);
          (matchedCurtainGroup &&
            createConfigSection("组合成员").append(
              e.createElement(
                "p",
                "i3d-note",
                "这里只调整成员模型、实体、图标和帘布；入口位置、大小、隐藏方式和聚焦视角由组合统一管理。",
              ),
              e.createButton("返回组合入口设置", () => {
                ((e.text = curtainGroupEntryId2(matchedCurtainGroup)),
                  (e.selectedCurtainGroupId = ""),
                  refreshEditorPreview(),
                  renderPanel());
              }),
            ),
            (currentContainer = createConfigSection("基础绑定")));
          const isBathHeaterMode = e.deviceKind === "climate" && vector.climateType === "bath-heater",
            isPurifierMode = e.deviceKind === "purifier",
            isWaterHeaterMode = e.deviceKind === "water-heater",
            isFanMode = e.deviceKind === "fan",
            bindingContainer =
              isBathHeaterMode || isPurifierMode || isWaterHeaterMode || isFanMode;
          (bindingContainer && !vector.entityId && (vector.clickAction = "focus"),
            e.deviceKind === "climate" &&
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
            nameInputElement = e.createElement("input");
          if (
            ((nameInputElement.value = vector.label),
            (nameInputElement.maxLength = 128),
            nameInputElement.addEventListener("change", () => {
              ((vector.label = nameInputElement.value.trim() || e.kindLabel), refreshEditorPreview());
            }),
            createSettingRow(nameRowElement, "名称", nameInputElement),
            e.usesModelBinding)
          ) {
            const flatMap2 = e.sceneMetadata.floors
                .filter((candidateFloorProbe: any) => candidateFloorProbe.id === e.floorSelection)
                .flatMap((candidateFloor: any) =>
                  (candidateFloor[e.collectionKey] || [])
                    .filter(
                      (candidateModel: any) =>
                        !e.getItemList().some(
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
                e.describeItem(modelKeyEntry.model),
              ]);
            (some || modelSelectOptions.unshift([currentModelKey, "原模型已移除，请重新选择"]),
              createSelectRow(
                nameRowElement,
                "关联" + e.kindLabel + "模型",
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
                  e.createElement(
                    "p",
                    "i3d-note",
                    "原模型已移除，请重新选择。已保存的实体绑定和按钮设置仍然保留。",
                  ),
                ));
          }
          currentContainer = bindingRowElement;
          const deviceIdOfEntity = (entityId: any) => {
              const boundCatalogEntry = e.entities.find(
                (catalogProbe: any) => catalogProbe.entityId === entityId,
              );
              return boundCatalogEntry?.deviceId || boundCatalogEntry?.device_id || "";
            },
            temperatureHumidityPickerKinds = () =>
              vector.deviceId || deviceIdOfEntity(vector.entityId),
            openDeviceChangeDialog = (onConfirm: any, bodyHint: any) => {
              const deviceChangeDialogElement = e.createElement(
                "dialog",
                "settings-dialog i3d-add-dialog i3d-device-change-dialog",
              );
              ((e.addDialogState = deviceChangeDialogElement),
                deviceChangeDialogElement.setAttribute("aria-label", "更换设备"));
              const deviceChangeHeadingElement = e.createElement("div", "dialog-heading");
              deviceChangeHeadingElement.append(e.createElement("h2", "", "更换设备"));
              const deviceChangeBodyElement = e.createElement("div", "i3d-add-dialog-body", bodyHint),
                deviceChangeActionsElement = e.createElement("div", "dialog-actions"),
                confirmDeviceChangeButton = e.createButton("确定更换", () => {
                  (closeAddDialog(),
                    !e.isDisposed && e.isAccessAllowed && e.getItemList().includes(vector) && onConfirm());
                });
              ((confirmDeviceChangeButton.className = "primary"),
                deviceChangeActionsElement.append(
                  e.createButton("取消", closeAddDialog),
                  confirmDeviceChangeButton,
                ),
                deviceChangeDialogElement.append(
                  deviceChangeHeadingElement,
                  deviceChangeBodyElement,
                  deviceChangeActionsElement,
                ),
                e.editorDialogElement.append(deviceChangeDialogElement),
                deviceChangeDialogElement.addEventListener("cancel", (deviceChangeCancelEvent: any) => {
                  (deviceChangeCancelEvent.preventDefault(), closeAddDialog());
                }),
                deviceChangeDialogElement.showModal());
            },
            openItemPicker = async (targetField: any, itemPickerTrigger: any) => {
              const isEntityField = ++e.pickerGeneration;
              e.errorMessageElement.textContent = "";
              try {
                const pickerMethod =
                  e.pickers?.[targetField === "powerEntity" ? "entity" : targetField];
                if (!pickerMethod) throw new Error("选择器尚未准备好，请保存后刷新页面。");
                const itemPickerHandle = await pickerMethod({
                  trigger: itemPickerTrigger,
                  deviceIcon: e.defaultIcon, deviceKind:
                    targetField === "powerEntity"
                      ? "television-power"
                      : isBathHeaterMode
                        ? "bath-heater"
                        : e.deviceKind,
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
                      e.isDisposed ||
                      !e.isAccessAllowed ||
                      isEntityField !== e.pickerGeneration ||
                      !e.getItemList().includes(vector)
                    )) {
                      if (
                        ((targetField === "entity" || targetField === "powerEntity") &&
                          ((e.entities = e.pickers.entityCatalog?.() || e.entities),
                          pickedDeviceEntity?.entityId === pickedDevice &&
                            (e.entities = [
                              ...e.entities.filter(
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
                                (e.map.set(pickedDevice.deviceId, pickedDevice),
                                (e.entities = [
                                  ...e.entities.filter(
                                    (deviceEntityProbe: any) =>
                                      (deviceEntityProbe.deviceId || deviceEntityProbe.device_id) !==
                                      pickedDevice.deviceId,
                                  ),
                                  ...pickedDevice.entities,
                                ])),
                              e.deviceKind === "smallcar")
                            ) {
                              const defaultCarBinding = standardCarBindings2(
                                deviceEntityCatalog2(
                                  e.entities,
                                  vector.deviceId,
                                  e.latestStates || e.states,
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
                              e.map.set(pickedDevice.deviceId, pickedDevice)));
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
                                    e.errorMessageElement.textContent =
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
                                      e.deviceKind,
                                    ) &&
                                    (vector.extraControls?.length ||
                                      vector.workingState ||
                                      vector.statusRules) &&
                                    purifierDeviceChanged2(e.entities, vector.entityId, pickedDevice)
                                  ) {
                                    const purifierChangeDialogElement = e.createElement(
                                      "dialog",
                                      "settings-dialog i3d-add-dialog i3d-device-change-dialog",
                                    );
                                    ((e.addDialogState = purifierChangeDialogElement),
                                      purifierChangeDialogElement.setAttribute(
                                        "aria-label",
                                        "更换" + e.kindLabel + "设备",
                                      ));
                                    const purifierChangeHeadingElement = e.createElement(
                                      "div",
                                      "dialog-heading",
                                    );
                                    purifierChangeHeadingElement.append(
                                      e.createElement("h2", "", "更换" + e.kindLabel + "设备"),
                                    );
                                    const purifierChangeTitleElement = e.createElement(
                                        "div",
                                        "i3d-add-dialog-body",
                                        "更换设备会清除当前附加功能和指示灯规则，避免使用旧设备状态。取消将保留原绑定；外层保存后才正式生效。",
                                      ),
                                      purifierChangeActionsElement = e.createElement(
                                        "div",
                                        "dialog-actions",
                                      ),
                                      confirmPurifierChangeButton = e.createButton("确定更换", () => {
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
                                        e.createButton("取消", closeAddDialog),
                                        confirmPurifierChangeButton,
                                      ),
                                      purifierChangeDialogElement.append(
                                        purifierChangeHeadingElement,
                                        purifierChangeTitleElement,
                                        purifierChangeActionsElement,
                                      ),
                                      e.editorDialogElement.append(purifierChangeDialogElement),
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
                                      ].includes(e.deviceKind) &&
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
                e.isDisposed || !e.isAccessAllowed || isEntityField !== e.pickerGeneration
                  ? itemPickerHandle?.close()
                  : (e.pickerHandle = itemPickerHandle);
              } catch (itemPickerError: any) {
                !e.isDisposed &&
                  isEntityField === e.pickerGeneration &&
                  (e.errorMessageElement.textContent = itemPickerError.message);
              }
            },
            itemEntityMetadata = e.entities.find(
              (metadataLookupProbe: any) => metadataLookupProbe.entityId === vector.entityId,
            );
          if (e.isNasMode) {
            const nasSourceButton = e.createButton(
              vector.statusSource?.name || "选择飞牛、群晖或绿联",
              () => void openItemPicker("nas", nasSourceButton),
            );
            if (
              ((nasSourceButton.className = "i3d-picker-button"),
              createSettingRow(currentContainer, "NAS 数据来源", nasSourceButton),
              vector.statusSource)
            ) {
              const visibleMetricCount =
                  vector.statusSource.visibleMetrics?.length ?? vector.statusSource.metrics.length,
                openMetricsButton = e.createButton(
                  "选择显示内容（" + visibleMetricCount + " 项）",
                  () => openMetricsDialog(vector),
                );
              ((openMetricsButton.className = "i3d-picker-button"),
                vector.statusSource.metrics.length && currentContainer.append(openMetricsButton));
            }
            currentContainer.append(
              e.createElement(
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
                e.createElement(
                  "p",
                  "i3d-note",
                  "旧版绑定仅按 on/off 控制指示灯，不会开关 NAS 或关联整台设备。安全状态表示告警，不应作为开机依据；选择 NAS 数据来源后将替换旧绑定。",
                ),
              );
            }
          }
          const boundEntityPickerButton = e.createButton(
            "",
            () => void openItemPicker("entity", boundEntityPickerButton),
          );
          if (
            ((boundEntityPickerButton.className = "i3d-picker-button"),
            (boundEntityPickerButton.title =
              vector.entityId || (e.usesModelBinding ? "选择" + e.kindLabel + "实体" : "选择灯或开关")),
            boundEntityPickerButton.append(
              e.createElement(
                "span",
                "",
                itemEntityMetadata?.name ||
                  vector.entityId ||
                  (e.usesModelBinding ? "选择" + e.kindLabel + "实体" : "选择灯或开关"),
              ),
            ),
            !e.isGenericDeviceMode &&
              !e.isVacuumMode &&
              !e.isNasMode &&
              createSettingRow(
                currentContainer,
                bindingContainer ? "主实体（选填）" : "绑定实体",
                boundEntityPickerButton,
              ),
            bindingContainer)
          ) {
            const deviceBindingButton = e.createButton(
              vector.deviceName ||
                vector.deviceId ||
                (temperatureHumidityPickerKinds()
                  ? "跟随主实体所属设备"
                  : "选择" +
                    (isFanMode
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
                e.createElement(
                  "p",
                  "i3d-note",
                  isFanMode
                    ? "主实体选填。有 fan 主实体时读取标准能力；没有就绑定设备，在附加功能中选择开关、风速、正反转等。主实体与附加功能须属于同一设备，各功能独立控制。"
                    : isWaterHeaterMode
                      ? "有热水器主实体可直接选择；没有就绑定设备，在附加功能中选择开关、温度、模式和状态。各功能独立控制。"
                      : isPurifierMode
                        ? "有主实体可直接选择；没有就绑定设备，在附加功能中选择开关、模式和状态。各功能独立控制。"
                        : "有标准主实体时可直接选择；没有主实体时，绑定设备并在附加功能中 DIY 暖风、换气和照明等控制。两者同时选择时须属于同一设备。主实体开关只控制主实体。",
                ),
              ));
          }
          if (
            (e.isSpeakerMode &&
              currentContainer.append(
                e.createElement(
                  "p",
                  "i3d-note",
                  "绑定 media_player 后，播放、音量、进度和媒体库等控制按实体能力自动显示。播放时顶部彩色呼吸，暂停时微亮，空闲或离线时熄灭。",
                ),
              ),
            e.isGenericDeviceMode)
          ) {
            const devicePickerButtonElement = e.createButton(
              vector.deviceName || "选择设备",
              () => void openItemPicker("device", devicePickerButtonElement),
            );
            if (
              ((devicePickerButtonElement.className = "i3d-picker-button"),
              createSettingRow(currentContainer, "绑定设备", devicePickerButtonElement),
              genericDeviceProfile2(e.deviceKind).statusIndicator !== false)
            ) {
              const statusLightSectionElement = createConfigSection("状态灯（可选）");
              renderStatusRuleSection(statusLightSectionElement, vector);
            } else delete vector.statusRules;
          }
          if (e.deviceKind === "smallcar") {
            const carStatusSectionElement = createConfigSection("车辆状态"),
              carEntityCatalog = deviceEntityCatalog2(
                e.entities,
                vector.deviceId,
                e.latestStates || e.states,
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
            const carRawStatusElement = e.createElement("p", "i3d-note i3d-car-raw-state");
            (carRawStatusElement.setAttribute("aria-live", "polite"),
              carStatusSectionElement.append(carRawStatusElement));
            const chargingSettingsElement = e.createElement("details", "i3d-car-charging-settings");
            ((chargingSettingsElement.open = !!vector.chargingStates),
              chargingSettingsElement.append(e.createElement("summary", "", "自定义充电识别（可选）")),
              chargingSettingsElement.append(
                e.createElement(
                  "p",
                  "i3d-note",
                  "在 HA 中查看充电状态实体，充电和不充电时显示什么文字，就分别填入对应输入框。两项都留空则自动识别。",
                ),
              ));
            const chargingInputsByKey: Record<string, HTMLInputElement> = {},
              chargingErrorElement = e.createElement("p", "i3d-error");
            chargingErrorElement.setAttribute("role", "status");
            const chargingSummaryElement = e.createElement("p", "i3d-note");
            for (const [chargingFieldKey, chargingFieldLabel, chargingFieldHint] of [
              ["inactive", "不充电状态值", "填写不充电时的文字"],
              ["active", "充电状态值", "填写充电时的文字"],
            ]) {
              const chargingValueInputElement = e.createElement("input");
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
                  (refreshEditorPreview(), e.refreshEffectSettings());
                }));
            }
            (chargingSettingsElement.append(chargingErrorElement, chargingSummaryElement),
              carStatusSectionElement.append(chargingSettingsElement),
              (e.refreshEffectSettings = () => {
                const carStatusSnapshot = carState2(vector, e.latestStates || e.states),
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
              e.refreshEffectSettings());
            const carStatusCardSectionElement = createConfigSection("汽车状态卡片");
            renderAirPurifierBindingSection(carStatusCardSectionElement, vector, {
              width: "cardWidth",
              font: "cardFontSize",
              opacity: "cardOpacity",
            });
          }
          if (e.isAirerMode) {
            // 兼容旧 HomeOS Inverted 别名 → 0.7.2 Reversed
            if (vector.positionReversed === undefined && vector.positionInverted === true)
              vector.positionReversed = true;
            if (vector.liftReversed === undefined && vector.commandInverted === true)
              vector.liftReversed = true;
            delete vector.positionInverted;
            delete vector.commandInverted;

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
              e.createElement(
                "p",
                "i3d-note",
                "按实物选择。模型、图标和弹窗统一显示实际高低及升降；弹窗高度以 100% 为最高。位置方向与升降指令可分别设置。",
              ),
            );

            const airerMotionSectionElement = createConfigSection("升降动画");
            const animationReversedCheckbox = e.createElement("input");
            ((animationReversedCheckbox.type = "checkbox"),
              (animationReversedCheckbox.checked = vector.animationReversed === true),
              animationReversedCheckbox.addEventListener("change", () => {
                vector.animationReversed = animationReversedCheckbox.checked;
                refreshEditorPreview();
              }),
              createSettingRow(airerMotionSectionElement, "动画方向反向", animationReversedCheckbox));
            airerMotionSectionElement.append(
              e.createElement(
                "p",
                "i3d-note",
                "模型升降与实物相反时开启，仅反转动画，不改变升降按钮的控制方向。顶部安装高度和最大伸展距离在户型图中调整。",
              ),
            );
            const airerTravelSecondsInputElement = e.createElement("input");
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
          if (e.deviceKind === "fan") {
            const fanControlSection = createConfigSection("风扇控制（0.7.2）");
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
              (e.entities || []).find(
                (entityProbe: any) =>
                  (entityProbe.entityId || entityProbe.entity_id) === entityId,
              ) || {};
            const entityLiveState = (entityId: string) => {
              const states = e.latestStates || e.states;
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
              const button = e.createButton("", async () => {
                const generation = ++e.pickerGeneration;
                try {
                  const handle = await e.pickers?.entity?.({
                    trigger: button,
                    deviceKind: "fan",
                    current: vector[fieldKey] || "",
                    onSelect(_device: any, entity: any) {
                      if (
                        e.isDisposed ||
                        !e.isAccessAllowed ||
                        generation !== e.pickerGeneration ||
                        !e.getItemList().includes(vector)
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
                        e.errorMessageElement.textContent =
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
                  generation !== e.pickerGeneration
                    ? handle?.close()
                    : (e.activePickerHandle = handle);
                } catch (error: any) {
                  e.errorMessageElement.textContent = error?.message || String(error);
                }
              });
              button.className = "i3d-picker-button";
              button.append(e.createElement("span", "", vector[fieldKey] || emptyLabel));
              button.title = vector[fieldKey] || emptyLabel;
              return button;
            };
            const bladeSection = e.createElement("div", "i3d-config-row");
            bladeSection.append(e.createElement("h4", "", "扇叶动画"));
            bladeSection.append(
              e.createElement(
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
            const fanPreview = resolveFanBindingState(vector, e.latestStates || e.states || {});
            bladeSection.append(
              e.createElement(
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
          if (e.deviceKind === "water-heater") {
            const statusRuleSectionElement = createConfigSection("指示灯规则（可选）"),
              curtainMemberGroup = temperatureHumidityPickerKinds();
            (renderStatusRuleSection(statusRuleSectionElement, vector, {
              deviceId: curtainMemberGroup,
              standardOnly: true,
            }),
              curtainMemberGroup ||
                statusRuleSectionElement.append(
                  e.createElement(
                    "p",
                    "i3d-note",
                    vector.entityId
                      ? "当前实体没有可用的 HA 设备归属，请同步设备目录后重新打开配置，或更换绑定实体。"
                      : "先选择主实体或绑定设备，再选择指示灯状态。",
                  ),
                ));
          }
          if (
            ["climate", "airer", "fan", "purifier", "water-heater"].includes(e.deviceKind) ||
            (e.isGenericDeviceMode && e.deviceKind !== "smallcar")
          ) {
            let syncExtraControlState = function () {
              const selectedControlEntityIdSet = new Set(
                (vector.extraControls || []).map(
                  (extraControlEntityProbe: any) => extraControlEntityProbe.entityId,
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
                e.isGenericDeviceMode || bindingContainer
                  ? deviceEntityCatalog2(
                      e.entities,
                      vector.deviceId ||
                        itemEntityMetadata?.deviceId ||
                        itemEntityMetadata?.device_id,
                      e.latestStates || e.states,
                    ).filter((otherEntityProbe) => otherEntityProbe.entityId !== vector.entityId)
                  : purifierRelatedEntities2(e.entities, vector.entityId),
              deviceId3 =
                e.isGenericDeviceMode || bindingContainer
                  ? vector.deviceId || itemEntityMetadata?.deviceId || itemEntityMetadata?.device_id
                  : itemEntityMetadata?.deviceId || itemEntityMetadata?.device_id,
              previewDevicePanel = async () => {
                try {
                  await e.editorRuntime?.focusCommand("preview-device-panel", vector.id);
                } catch (meterMetadataProbe: any) {
                  e.isDisposed || (e.errorMessageElement.textContent = meterMetadataProbe.message);
                }
              },
              previewDeviceButton = e.createButton("实时预览弹窗", previewDevicePanel);
            currentContainer.append(
              previewDeviceButton,
              e.createElement(
                "p",
                "i3d-note",
                "仅选择当前设备的附加实体，最多 12 项。预览随修改实时更新，不发送设备指令；保存后正式生效。",
              ),
            );
            const extraControlsDetailsElement = e.createElement("details");
            extraControlsDetailsElement.append(
              e.createElement(
                "summary",
                "",
                "选择附加功能（已选 " + boundMeterEntityId.length + "/12）",
              ),
            );
            const extraSearchInputElement = e.createElement("input");
            ((extraSearchInputElement.placeholder = "搜索本设备实体名称或 ID"),
              extraSearchInputElement.setAttribute("aria-label", "搜索附加实体"));
            const extraControlListElement = e.createElement("div", "i3d-extra-entity-list"),
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
                    e.createElement(
                      "p",
                      "i3d-note",
                      deviceId3
                        ? lowerCase
                          ? "没有匹配的实体。"
                          : "该设备没有其他实体。"
                        : e.isGenericDeviceMode || bindingContainer
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
                      e.latestStates?.[extraCandidateEntity.entityId] ||
                      e.states?.get?.(extraCandidateEntity.entityId) ||
                      e.states?.[extraCandidateEntity.entityId],
                    extraEntitySnapshot = extraEntityState?.newState || extraEntityState,
                    extraEntityRowElement = e.createElement("label", "i3d-extra-entity-row"),
                    extraEntityCheckboxElement = e.createElement("input");
                  ((extraEntityCheckboxElement.type = "checkbox"),
                    (extraEntityCheckboxElement.checked = some2),
                    (extraEntityCheckboxElement.disabled =
                      !some2 && (isExtraEntityDisabled || (vector.extraControls || []).length >= 12)),
                    extraControlsByEntityId.set(extraCandidateEntity.entityId, {
                      check: extraEntityCheckboxElement,
                      disabled: isExtraEntityDisabled,
                    }));
                  const extraEntityDetailElement = e.createElement("span");
                  ((extraEntityDetailElement.title =
                    (extraCandidateEntity.name || extraCandidateEntity.entityId) +
                    "\n" +
                    extraCandidateEntity.entityId),
                    extraEntityDetailElement.append(
                      e.createElement(
                        "strong",
                        "",
                        extraCandidateEntity.name || extraCandidateEntity.entityId,
                      ),
                      e.createElement("small", "", extraCandidateEntity.entityId),
                      e.createElement(
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
                        syncExtraControlState(),
                        previewDevicePanel(),
                        isBathHeaterMode && e.redrawBathEffects(),
                        isPurifierMode && e.renderAirflowSection());
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
              bathEffectHostElement = e.createElement("div");
            (bathAirflowSectionElement.append(bathEffectHostElement),
              (e.redrawBathEffects = () => {
                (bathEffectHostElement.replaceChildren(),
                  (e.bathEffectEditorHandle = bathEffectEditor2({
                    item: vector,
                    entities: e.entities,
                    states: () => e.latestStates || e.states,
                    host: bathEffectHostElement,
                    node: e.createElement,
                    select: createSelectRow,
                    update: refreshEditorPreview,
                    redraw: e.redrawBathEffects,
                  })));
              }),
              e.redrawBathEffects());
          }
          if (isPurifierMode) {
            const purifierAirflowSectionElement = createConfigSection("出风动画");
            ((e.renderAirflowSection = () => {
              (purifierAirflowSectionElement.replaceChildren(e.createElement("h4", "", "出风动画")),
                purifierAirflowSectionElement.append(
                  e.createElement(
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
                airflowOptions = e.entities
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
                      e.refreshAirflowStatus());
                  },
                ));
              const airflowStatusElement = e.createElement("p", "i3d-note");
              (purifierAirflowSectionElement.append(airflowStatusElement),
                (e.refreshAirflowStatus = () => {
                  const purifierStatus = purifierState2(vector, e.latestStates || e.states);
                  airflowStatusElement.textContent =
                    "出风状态：" +
                    (purifierStatus.available
                      ? purifierStatus.running
                        ? "出风中"
                        : "已停止"
                      : "状态未知");
                }),
                e.refreshAirflowStatus());
            }),
              e.renderAirflowSection());
          }
          if (e.isCoverMode) {
            if (!matchedCurtainGroup) {
              const combineCurtainButton = e.createButton("组合另一扇窗帘", () =>
                openCurtainGroupDialog(vector),
              );
              ((combineCurtainButton.disabled = !curtainGroupCandidates2(
                e.structuredClone2.environment,
                vector.id,
              ).length),
                currentContainer.append(
                  combineCurtainButton,
                  e.createElement(
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
              curtainFabricRowElement = e.sceneMetadata.floors
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
                  e.createElement(
                    "p",
                    "i3d-note",
                    (curtainFabricRowElement.curtainTrack === "u" ? "U" : "L") +
                      " 型轨道，尺寸和合拢位置继承户型模型。",
                  ),
                ),
              isRollerCover &&
                currentContainer.append(
                  e.createElement(
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
                e.createElement(
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
                  e.createElement(
                    "p",
                    "i3d-note",
                    "仅设置 3D 帘布的展示状态；绑定实体后自动跟随实际开合。",
                  ),
                ));
            }
          }
          if (e.isVacuumMode) {
            const vacuumDeviceButton = e.createButton(
              vector.deviceName || "选择扫地机设备",
              () => void openItemPicker("vacuum", vacuumDeviceButton),
            );
            ((vacuumDeviceButton.className = "i3d-picker-button"),
              createSettingRow(currentContainer, "绑定设备", vacuumDeviceButton));
            const cachedDeviceEntry = e.map.get(vector.deviceId) || {
              entities: e.entities.filter(
                (vacuumShortcutProbe: any) =>
                  /^vacuum\./.test(vacuumShortcutProbe.entityId) &&
                  (vacuumShortcutProbe.deviceId === vector.deviceId ||
                    vacuumShortcutProbe.entityId === vector.deviceId),
              ),
              maps: e.entities.filter(
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
                currentContainer.append(e.createElement("p", "i3d-note", "已识别：" + vector.entityId)),
              (currentContainer = createConfigSection("地图与移动")));
            const followOffsetInput = e.createElement("input");
            (Object.assign(followOffsetInput, {
              type: "number",
              min: "0",
              max: "300",
              step: "1",
              value: String(e.structuredClone2.navigation?.followOffset ?? 16),
              title: "所有扫地机共用此标签偏移",
            }),
              followOffsetInput.addEventListener("change", () => {
                if (!e.isAccessAllowed || e.isDisposed) return;
                const NaN5 =
                  followOffsetInput.value.trim() === "" ? NaN : Number(followOffsetInput.value);
                (Number.isFinite(NaN5) &&
                  ((e.structuredClone2.navigation = {
                    ...e.structuredClone2.navigation,
                    followOffset: Math.max(0, Math.min(300, NaN5)),
                  }),
                  refreshEditorPreview()),
                  (followOffsetInput.value = String(
                    e.structuredClone2.navigation?.followOffset ?? 16,
                  )));
              }),
              createSettingRow(currentContainer, "跟随标签上移（px）", followOffsetInput));
            for (const [vacuumToggleKey, vacuumToggleLabel] of [
              ["motionEnabled", "跟随真实位置移动"],
              ["funMessages", "工作时显示趣味短句"],
            ]) {
              const vacuumToggleCheckbox = e.createElement("input");
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
            const mapPickerButton = e.createButton(
              vector.map?.entityId || "选择扫地机地图",
              async () => {
                const mapPickerGeneration = ++e.pickerGeneration;
                try {
                  e.pickerHandle = await e.pickers.entity({
                    trigger: mapPickerButton, deviceKind: "vacuum-e.map",
                    current: vector.map?.entityId || "",
                    onSelect(pickedMapEntity: any) {
                      e.isDisposed ||
                        !e.isAccessAllowed ||
                        mapPickerGeneration !== e.pickerGeneration ||
                        !e.getItemList().includes(vector) ||
                        ((vector.map = {
                          ...vector.map,
                          entityId: pickedMapEntity,
                        }),
                        refreshEditorPreview(),
                        renderPanel());
                    },
                  });
                } catch (mapPickerError: any) {
                  e.errorMessageElement.textContent = mapPickerError.message;
                }
              },
            );
            ((mapPickerButton.className = "i3d-picker-button"),
              createSettingRow(currentContainer, "地图来源", mapPickerButton));
            const alignMapButton = e.createButton("底图对齐", () => {
              const mapEntityState =
                  e.latestStates === null
                    ? e.states?.get?.(vector.map?.entityId)
                    : e.latestStates[vector.map?.entityId],
                itemEntityState =
                  e.latestStates === null
                    ? e.states?.get?.(vector.entityId)
                    : e.latestStates[vector.entityId],
                mapIdentity = vacuumMapIdentity2(mapEntityState, itemEntityState),
                editableItemForMapEditor = {
                  ...vector, map: {
                    ...vector.map,
                  },
                };
              (mapIdentity
                ? (editableItemForMapEditor.map.sourceMapId = mapIdentity)
                : delete editableItemForMapEditor.map.sourceMapId,
                (e.subEditorHandle = openVacuumMapEditor2({
                  item: editableItemForMapEditor,
                  floor: e.sceneMetadata.floors.find(
                    (mapFloorProbe: any) => mapFloorProbe.id === vector.floorId,
                  ),
                  getMapState: () =>
                    e.latestStates === null
                      ? e.states?.get?.(vector.map?.entityId)
                      : e.latestStates[vector.map?.entityId],
                  onSave(savedMapRecord: any) {
                    !e.isDisposed &&
                      e.isAccessAllowed &&
                      e.getItemList().includes(vector) &&
                      ((vector.map = savedMapRecord.map), refreshEditorPreview(), renderPanel());
                  },
                })));
            });
            currentContainer.append(alignMapButton);
          }
          if (e.isTelevisionMode) {
            const powerEntityButton = e.createButton(
              vector.powerEntityId || "不单独绑定",
              () => void openItemPicker("powerEntity", powerEntityButton),
            );
            ((powerEntityButton.className = "i3d-picker-button"),
              createSettingRow(currentContainer, "电视电源实体（可选）", powerEntityButton),
              currentContainer.append(
                e.createElement(
                  "p",
                  "i3d-note",
                  "可绑定能提供开关状态的实体；不单独绑定电源时跟随媒体播放器状态。电视开启时优先显示可用节目封面，没有封面时显示自定义图片；未上传图片则显示当前播放状态，关闭时显示深色玻璃。",
                ),
              ));
            // 兼容旧 posterAssetId → 0.7.2 screenImage
            if (!vector.screenImage?.assetId && vector.posterAssetId) {
              const legacyBare = String(vector.posterAssetId)
                .trim()
                .toLowerCase()
                .replace(/^user:/, "");
              if (/^[0-9a-f]{32}$/.test(legacyBare))
                vector.screenImage = { assetId: "user:" + legacyBare };
              delete vector.posterAssetId;
            }
            const posterAssetSection = createConfigSection("电视自定义图片"),
              posterAssetStatusElement = e.createElement("p", "i3d-note", "无封面时的图片"),
              posterAssetUploadInput = e.createElement("input");
            ((posterAssetUploadInput.type = "file"),
              (posterAssetUploadInput.accept =
                "image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/gif,image/bmp,image/tiff,image/avif,image/heic,image/heif,image/x-icon,.png,.jpg,.jpeg,.webp,.svg,.gif,.bmp,.tif,.tiff,.ico,.avif,.heic,.heif"),
              (posterAssetUploadInput.hidden = true));
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
                    ? "无封面时的图片（已设置）"
                    : "无封面时的图片";
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
                  const uploadedRaw = String(
                    uploadPayload.assetId || uploadPayload.data?.assetId || "",
                  )
                    .trim()
                    .toLowerCase();
                  const uploadedAssetId = uploadedRaw.startsWith("user:")
                    ? uploadedRaw
                    : /^[0-9a-f]{32}$/.test(uploadedRaw)
                      ? "user:" + uploadedRaw
                      : "";
                  if (!/^user:[0-9a-f]{32}$/.test(uploadedAssetId))
                    throw new Error("图片上传结果无效，请重试。");
                  vector.screenImage = { assetId: uploadedAssetId };
                  delete vector.posterAssetId;
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
            const posterActionsRow = e.createElement("div", "i3d-focus-actions");
            const rebuildPosterActions = () => {
              posterActionsRow.replaceChildren();
              const screenAssetId = currentScreenAssetId();
              const hasPoster = !!screenAssetId;
              const posterId = screenAssetId.slice(5);
              const uploadButton = e.createButton(hasPoster ? "替换图片" : "上传图片", () => {
                if (!isPosterUploading) posterAssetUploadInput.click();
              });
              uploadButton.className = "i3d-picker-button";
              uploadButton.disabled = isPosterUploading;
              posterActionsRow.append(uploadButton);
              if (hasPoster) {
                const deleteButton = e.createButton("删除图片", async () => {
                  if (isPosterUploading) return;
                  try {
                    await fetch("/api/v1/assets/user/" + posterId, {
                      method: "DELETE",
                      credentials: "same-origin",
                    });
                  } catch {}
                  delete vector.screenImage;
                  delete vector.posterAssetId;
                  refreshPosterAssetUi();
                  rebuildPosterActions();
                  refreshEditorPreview();
                });
                posterActionsRow.append(deleteButton);
              }
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
                e.createElement(
                  "p",
                  "i3d-note",
                  "支持 PNG、JPG/JPEG、WebP、SVG、GIF、BMP、TIFF、AVIF、HEIC/HEIF 和 ICO。动图使用第一帧；图片保持原比例。删除后恢复默认显示，保存配置后生效。",
                ),
              ),
              currentContainer.append(posterAssetSection));
          }
          if (
            e.isNasMode &&
              currentContainer.append(
                e.createElement(
                  "p",
                  "i3d-note",
                  vector.statusSource
                    ? "已选择 NAS 自身状态数据作为呼吸灯依据。安全状态只用于告警。"
                    : "请先选择 NAS 数据来源，缺少 CPU 等个别指标也可绑定。",
                ),
              ),
            !matchedCurtainGroup && e.deviceKind !== "smallcar"
          ) {
            ((currentContainer = createConfigSection("交互行为")),
              createSelectRow(
                currentContainer,
                "点击" + e.kindLabel,
                bindingContainer && !vector.entityId
                  ? [["focus", "聚焦并显示控制"]]
                  : e.isAirerMode
                    ? [
                        ["focus", "聚焦并显示控制"],
                        ["panel", "仅显示控制"],
                      ]
                    : e.isSpeakerMode
                      ? [
                          ["focus-panel", "聚焦并显示控制"],
                          ["panel", "仅显示控制"],
                          ["focus", "仅聚焦"],
                        ]
                      : e.isTelevisionMode
                        ? [
                            ["focus-panel", "聚焦并显示控制"],
                            ["panel", "仅显示控制"],
                            ["focus", "仅聚焦"],
                            ["turn-on-focus", "开关电视（开机时聚焦）"],
                            ["turn-on", "仅开关电视"],
                            ["turn-on-panel", "开关电视（开机时显示控制）"],
                          ]
                        : e.usesStatusPanel
                          ? [
                              [
                                "focus-panel",
                                e.isGenericDeviceMode ? "聚焦并显示弹窗" : "聚焦并显示状态",
                              ],
                              ["panel", e.isGenericDeviceMode ? "仅显示弹窗" : "仅显示状态"],
                              ["focus", "仅聚焦"],
                            ]
                          : e.isCoverMode
                            ? [
                                ["focus", "聚焦并显示控制"],
                                ["panel", "仅显示控制"],
                                ["turn-on-focus", "开合窗帘（打开时聚焦）"],
                                ["turn-on", "仅开合窗帘"],
                                ["turn-on-panel", "开合窗帘（打开时显示控制）"],
                              ]
                            : e.isClimateMode
                              ? [
                                  ["focus", "聚焦并显示控制"],
                                  ["turn-on-focus", "开关" + e.kindLabel + "（开启时聚焦）"],
                                  ["turn-on", "仅开关" + e.kindLabel],
                                  ["turn-on-panel", "开关" + e.kindLabel + "（开启时显示控制）"],
                                ]
                              : [
                                  ["focus", "聚焦并显示控制"],
                                  ["turn-on-focus", "开关灯（开灯时聚焦）"],
                                  ["turn-on", "仅开关灯"],
                                  ["turn-on-panel", "开关灯（开灯时显示控制）"],
                                ],
                vector.clickAction,
                (pickedCoverClickAction: any) => {
                  ((vector.clickAction = e.normalizeClickAction(pickedCoverClickAction)),
                    refreshEditorPreview());
                },
              ),
              e.isCoverMode
                ? currentContainer.append(
                    e.createElement(
                      "p",
                      "i3d-note",
                      "开关类行为：完全关闭时打开，已打开或半开时关闭，运动中点击先停止。仅打开时执行所选聚焦或弹窗。",
                    ),
                  )
                : bindingContainer
                  ? currentContainer.append(
                      e.createElement(
                        "p",
                        "i3d-note",
                        vector.entityId
                          ? "开关行为只操作主实体；独立功能分别在弹窗内控制。"
                          : "未绑定主实体，点击入口打开各功能控制。",
                      ),
                    )
                  : !e.isAirerMode &&
                    (!e.usesStatusPanel || e.isTelevisionMode) &&
                    currentContainer.append(
                      e.createElement(
                        "p",
                        "i3d-note",
                        "开关类行为：已开启时直接关闭；已关闭时开启，并执行所选聚焦或弹窗。",
                      ),
                    ));
            const clickActionVisibilityRow = e.createElement("div", "i3d-button-visibility-row");
            currentContainer.append(clickActionVisibilityRow);
            const hiddenClickableCheckbox = e.createElement("input");
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
            const buttonHiddenCheckbox = e.createElement("input");
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
          if (e.deviceKind !== "smallcar") {
            if (
              ((currentContainer = createConfigSection(e.isVacuumMode ? "状态标签" : "按钮外观")),
              e.isCoverMode)
            ) {
              const iconStateReversedCheckbox = e.createElement("input");
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
            if (!e.isVacuumMode) {
              const itemIconPickerButton = e.createButton(
                "",
                () => void openItemPicker("icon", itemIconPickerButton),
              );
              itemIconPickerButton.className = "i3d-picker-button i3d-icon-picker-button";
              const itemIconPreviewElement = e.createElement("i");
              itemIconPreviewElement.setAttribute("aria-hidden", "true");
              const memberBindingManageSectionElement =
                "/static/vendor/mdi/7.4.47/svg/" + vector.icon.replace(/^mdi:/, "") + ".svg";
              ((itemIconPreviewElement.style.maskImage =
                'url("' + memberBindingManageSectionElement + '")'),
                (itemIconPreviewElement.style.webkitMaskImage =
                  'url("' + memberBindingManageSectionElement + '")'),
                itemIconPickerButton.append(
                  itemIconPreviewElement,
                  e.createElement("span", "", vector.icon),
                ),
                createSettingRow(itemAppearanceRowElement, "图标", itemIconPickerButton));
            }
            if (matchedCurtainGroup) {
              (createConfigSection("绑定管理").append(
                e.createElement("p", "i3d-note", "删除此成员会自动解除组合，另一成员恢复原入口。"),
                removeItemButton,
              ),
                e.panelElement.append(e.errorMessageElement),
                (saveButtonElement.disabled = e.isSaving || !e.isAccessAllowed));
              return;
            }
            const coverSizeGridElement = e.createElement("div", "i3d-coordinate-grid i3d-size-grid"),
              coverSizeDetailsElement = e.createElement("details");
            (coverSizeDetailsElement.append(
              e.createElement("summary", "", "更多尺寸设置"),
              coverSizeGridElement,
            ),
              currentContainer.append(coverSizeDetailsElement));
            const readHitSize = () =>
              Number.isFinite(vector.hitSize) && vector.hitSize > 0
                ? vector.hitSize
                : Math.max(DEFAULT_BUTTON_SIZE, vector.size);
            createSizeRow(
              itemAppearanceRowElement,
              e.isVacuumMode ? "状态框缩放（%）" : "按钮大小（px）",
  
  
              () =>
                e.isVacuumMode
                  ? Math.round((vector.size / DEFAULT_BUTTON_SIZE) * 100)
                  : vector.size,
              (pickedSizeValue: any) => {
                ((vector.size = e.isVacuumMode
                  ? (pickedSizeValue / 100) * DEFAULT_BUTTON_SIZE
                  : pickedSizeValue),
                  !e.isVacuumMode && syncLinkedIconSize(vector, vector.size),
                  (hitSizeInputElement.value = String(Number(readHitSize().toPrecision(12)))),
                  refreshEditorPreview());
              },
            );
  
  
            e.isVacuumMode &&
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
            e.isVacuumMode &&
              appendBackgroundOpacityControl2(
                currentContainer,
                vector,
                "backgroundOpacity",
                refreshEditorPreview,
              );
          }
          if (e.usesModelBinding) {
            currentContainer = createConfigSection(
              e.isVacuumMode || e.deviceKind === "smallcar" ? "标签位置" : "按钮位置",
            );
            const modelBindingEntry = e.sceneMetadata.floors
                .find((modelBindingFloorProbe: any) => modelBindingFloorProbe.id === vector.floorId)
                ?.[e.collectionKey]?.find(
                  (modelBindingModelProbe: any) => modelBindingModelProbe.id === vector.modelId,
                ),
              coverPositionGridElement = e.createElement("div", "i3d-coordinate-grid");
            currentContainer.append(coverPositionGridElement);
            const resetPositionButton = e.createButton("恢复跟随模型", () => {
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
                : e.deviceKind === "smallcar" && coverCoordinateLabel !== "height"
                  ? 0
                  : e.isVacuumMode && coverCoordinateLabel === "height"
                    ? (Number(modelBindingEntry?.elevation) || 0) +
                      (Number(modelBindingEntry?.height) || 0.85) +
                      0.25
                    : Number.isFinite(modelBindingEntry?.[coverCoordinateLabel])
                      ? modelBindingEntry[coverCoordinateLabel]
                      : 0;
              createNumberRow(
                coverPositionGridElement,
                e.deviceKind === "smallcar" && coverCoordinateLabel !== "height"
                  ? "相对汽车偏移 " + coverCoordinateLabel.toUpperCase()
                  : e.isVacuumMode && coverCoordinateLabel === "height"
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
            const lightBatchSectionElement = e.createElement(
                "section",
                "navigation-batch-section i3d-light-batch",
              ),
              batchTitleElement = e.createElement("h4"),
              batchCountElement = e.createElement("span");
            batchTitleElement.append(
              e.createElement(
                "span",
                "",
                e.deviceKind === "smallcar" ? "卡片设置一键应用" : "图标设置一键应用",
              ),
              batchCountElement,
            );
            const lightBatchApplyButton = e.createButton("一键应用到其他" + e.kindLabel, () =>
              openCurtainGroupBatchApplyDialog(vector),
            );
            ((refreshBatchButtonsCell.current = () => {
              const lightChangeCount = listChangedFields(vector).length;
              ((batchCountElement.textContent = lightChangeCount + " 项修改"),
                (lightBatchApplyButton.disabled =
                  !e.isAccessAllowed || e.isCameraEditing || e.isCameraCommandPending));
            }),
              refreshBatchButtonsCell.current(),
              lightBatchSectionElement.append(batchTitleElement, lightBatchApplyButton),
              currentContainer.append(lightBatchSectionElement));
          } else {
            currentContainer = createConfigSection("按钮位置");
            const lightPositionGridElement = e.createElement("div", "i3d-coordinate-grid");
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
            const lightEffectBatchSectionElement = e.createElement(
                "section",
                "navigation-batch-section i3d-light-batch",
              ),
              effectBatchTitleElement = e.createElement("h4"),
              effectBatchCountElement = e.createElement("span");
            effectBatchTitleElement.append(
              e.createElement("span", "", "灯光设置一键应用"),
              effectBatchCountElement,
            );
            const effectBatchApplyButton = e.createButton("一键应用到其他灯光", () =>
              openCurtainGroupBatchApplyDialog(vector),
            );
            ((refreshBatchButtonsCell.current = () => {
              const effectChangeCount = listChangedFields(vector).length;
              ((effectBatchCountElement.textContent = effectChangeCount + " 项修改"),
                (effectBatchApplyButton.disabled =
                  !e.isAccessAllowed ||
                  e.isCameraEditing ||
                  e.isCameraCommandPending ||
                  e.isRangeEditorOpen));
            }),
              refreshBatchButtonsCell.current(),
              lightEffectBatchSectionElement.append(effectBatchTitleElement, effectBatchApplyButton),
              currentContainer.append(lightEffectBatchSectionElement));
          }
          if (e.deviceKind !== "smallcar") {
            const coverFocusSectionElement = e.createElement(
              "section",
              "i3d-focus-settings i3d-config-section",
            );
            e.panelElement.append(coverFocusSectionElement);
            const cameraPropertyKey =
              e.isVacuumMode && e.vacuumCameraMode === "follow" ? "followCamera" : "focusCamera";
            if (
              (coverFocusSectionElement.append(
                e.createElement(
                  "h4",
                  "",
                  cameraPropertyKey === "followCamera" ? "跟随视角" : "聚焦视角",
                ),
              ),
              e.isVacuumMode && !e.isCameraEditing)
            ) {
              const cameraModeActionsElement = e.createElement("div", "i3d-focus-actions");
              for (const [cameraModeKey, cameraModeLabel] of [
                ["focus", "聚焦视角"],
                ["follow", "跟随视角"],
              ]) {
                const cameraModeButton = e.createButton(cameraModeLabel, () => {
                  ((e.vacuumCameraMode = cameraModeKey), renderPanel());
                });
                (cameraModeButton.setAttribute(
                  "aria-pressed",
                  String(e.vacuumCameraMode === cameraModeKey),
                ),
                  (cameraModeButton.disabled = e.isCameraCommandPending),
                  cameraModeActionsElement.append(cameraModeButton));
              }
              coverFocusSectionElement.append(cameraModeActionsElement);
            }
            cameraPropertyKey === "followCamera" &&
              coverFocusSectionElement.append(
                e.createElement(
                  "p",
                  "i3d-note",
                  "固定鸟瞰角度跟随机器人平移，不随机器人转向。调整角度和远近后保存；跟随时不弹出控制面板。",
                ),
              );
            const runCameraCommand = async (cameraCommand: any, cameraRangePayload: any = undefined) => {
                const sceneReadySnapshot = e.num,
                  isFocalLengthRangeCommand = cameraCommand === "focus-focal-length",
                  pendingCameraQueue = e.cameraCommandQueue;
                let cameraRangeResolve;
                ((e.cameraCommandQueue = new Promise((resolveCameraQueuePromise) => {
                  cameraRangeResolve = resolveCameraQueuePromise;
                })),
                  isFocalLengthRangeCommand ||
                    ((e.isCameraCommandPending = true),
                    (e.errorMessageElement.textContent = ""),
                    renderPanel()));
                try {
                  if ((await pendingCameraQueue, e.isDisposed || sceneReadySnapshot !== e.num)) return;
                  const focusCommand2 = await e.editorRuntime.focusCommand(
                    cameraPropertyKey === "followCamera" && cameraCommand === "edit-light-camera"
                      ? "edit-follow-camera"
                      : cameraCommand,
                    vector.id,
                    cameraRangePayload,
                  );
                  if (e.isDisposed || sceneReadySnapshot !== e.num) return;
                  cameraCommand === "save-light-camera"
                    ? ((vector[cameraPropertyKey] = focusCommand2.camera),
                      (e.isCameraEditing = false),
                      (e.pendingCameraDraft = null),
                      refreshEditorPreview())
                    : cameraCommand === "cancel-light-camera"
                      ? ((e.isCameraEditing = false), (e.pendingCameraDraft = null))
                      : cameraCommand !== "preview-light-camera" &&
                        ((e.isCameraEditing = true), (e.pendingCameraDraft = focusCommand2.camera));
                } catch (cameraCommandError: any) {
                  !e.isDisposed &&
                    sceneReadySnapshot === e.num &&
                    (e.errorMessageElement.textContent = cameraCommandError.message);
                } finally {
                  (cameraRangeResolve!(),
                    !e.isDisposed &&
                      sceneReadySnapshot === e.num &&
                      !isFocalLengthRangeCommand &&
                      ((e.isCameraCommandPending = false), renderPanel()));
                }
              },
              cameraActionsElement = e.createElement("div", "i3d-focus-actions");
            if ((coverFocusSectionElement.append(cameraActionsElement), e.isCameraEditing)) {
              const saveCameraButton = e.createButton(
                "保存视角",
                () => void runCameraCommand("save-light-camera"),
              );
              ((saveCameraButton.className = "primary"),
                cameraActionsElement.append(
                  saveCameraButton,
                  e.createButton("取消调整", () => void runCameraCommand("cancel-light-camera")),
                ));
              const coverProjectionGroupElement = e.createElement("div", "i3d-focus-actions");
              (coverProjectionGroupElement.setAttribute("role", "group"),
                coverProjectionGroupElement.setAttribute("aria-label", "聚焦投影"),
                coverFocusSectionElement.append(coverProjectionGroupElement));
              for (const [projectionKey, projectionLabel] of [
                ["orthographic", "正交"],
                ["perspective", "透视"],
              ]) {
                const projectionButton = e.createButton(
                  projectionLabel,
                  () => void runCameraCommand("focus-projection", projectionKey),
                );
                (projectionButton.setAttribute(
                  "aria-pressed",
                  String((e.pendingCameraDraft?.mode || "orthographic") === projectionKey),
                ),
                  coverProjectionGroupElement.append(projectionButton));
              }
              const focalLengthInput = createNumberRow(
                coverFocusSectionElement,
                "焦段（mm）",
                Math.round(e.pendingCameraDraft?.focalLength || 50),
                18,
                120,
                1,
                (pickedFocalLength: any) => void runCameraCommand("focus-focal-length", pickedFocalLength),
              );
              focalLengthInput.disabled = e.pendingCameraDraft?.mode !== "perspective";
            } else {
              cameraActionsElement.append(
                e.createButton(
                  vector[cameraPropertyKey] ? "调整视角" : "设置视角",
                  () => void runCameraCommand("edit-light-camera"),
                ),
                ...(cameraPropertyKey === "followCamera"
                  ? []
                  : [e.createButton("预览聚焦", () => void runCameraCommand("preview-light-camera"))]),
              );
              const resetCameraButton = e.createButton(
                cameraPropertyKey === "followCamera" ? "恢复默认鸟瞰" : "恢复自动聚焦",
                async () => {
                  try {
                    (await e.editorRuntime.focusCommand("cancel-light-camera", vector.id),
                      delete vector[cameraPropertyKey],
                      refreshEditorPreview(),
                      renderPanel());
                  } catch (cameraSaveError: any) {
                    e.errorMessageElement.textContent = cameraSaveError.message;
                  }
                },
              );
              ((resetCameraButton.disabled = !vector[cameraPropertyKey]),
                (resetCameraButton.className = "i3d-focus-reset"),
                coverFocusSectionElement.append(resetCameraButton));
            }
            if (e.isCameraCommandPending) {
              for (const focusLockedControl of coverFocusSectionElement.querySelectorAll(
                "button, input",
              ))
                focusLockedControl.disabled = true;
            }
          }
          createConfigSection("绑定管理").append(removeItemButton);
        } else
          currentContainer.append(
            e.createElement(
              "p",
              "i3d-note",
              e.isVacuumMode
                ? addItemButton.length
                  ? "点击“添加扫地机”，选择模型后绑定扫地机设备。"
                  : "当前楼层暂无扫地机模型，请先在 3D 户型图绘制中添加扫地机器人后更新户型。"
                : e.isGenericDeviceMode
                  ? addItemButton.length
                    ? "点击“添加" + e.kindLabel + "”，选择模型并绑定 HA 设备。"
                    : "当前楼层暂无" +
                      e.kindLabel +
                      "模型，请先在 3D 户型图绘制中添加" +
                      e.kindLabel +
                      "后更新户型。"
                  : e.isSpeakerMode
                    ? addItemButton.length
                      ? "点击“添加设备”，选择智能音响模型并绑定媒体播放器实体。"
                      : "当前楼层暂无智能音响模型，请先在 3D 户型图绘制中添加智能音响后更新户型。"
                    : e.isTelevisionMode
                      ? addItemButton.length
                        ? "点击“添加设备”，选择电视模型并绑定媒体播放器实体。"
                        : "当前楼层暂无电视模型，请先在 3D 户型图绘制中添加电视后更新户型。"
                      : e.isNasMode
                        ? addItemButton.length
                          ? "点击“添加设备”，选择设备类型和模型，再绑定开启实体。"
                          : "当前楼层暂无 NAS 模型，请先在 3D 户型图绘制中添加 NAS 模型后更新户型。"
                        : e.isCoverMode
                          ? addItemButton.length
                            ? "点击“添加窗帘”，选择需要控制的窗帘模型。"
                            : "当前楼层暂无窗帘模型，请先在 3D 户型图绘制中添加普通窗帘后更新户型。"
                          : e.deviceKind === "water-heater"
                            ? addItemButton.length
                              ? "点击“添加热水器”，选择需要控制的热水器模型。"
                              : "当前楼层暂无热水器模型，请先在 3D 户型图绘制中添加储水式或燃气式热水器后更新户型。"
                            : ["airer", "fan", "purifier"].includes(e.deviceKind)
                              ? addItemButton.length
                                ? "点击“添加" + e.kindLabel + "”，选择需要控制的" + e.kindLabel + "模型。"
                                : "当前楼层暂无" +
                                  e.kindLabel +
                                  "模型，请先在 3D 户型图绘制中添加" +
                                  e.kindLabel +
                                  "后更新户型。"
                              : e.isClimateMode
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
        (e.panelElement.append(e.errorMessageElement),
        (saveButtonElement.disabled =
          e.isSaving || !e.isAccessAllowed || e.isCameraEditing || e.isCameraCommandPending),
        e.isCameraEditing || e.isCameraCommandPending)
      ) {
        for (const rangeLockedControl of e.panelElement.querySelectorAll("input, select, button"))
          rangeLockedControl.closest(".i3d-focus-settings") || (rangeLockedControl.disabled = true);
      }
      if (e.isRangeEditorOpen) {
        for (const rangeLockedControlElement of e.panelElement.querySelectorAll(
          "input, select, button",
        ))
          rangeLockedControlElement.dataset.interaction3dRangeEditor !== "true" &&
            (rangeLockedControlElement.disabled = true);
      }
    }
