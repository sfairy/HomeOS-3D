
import {
  buttonIconSize,
} from "@app/bridge/presets/button-icon-size";
import {
  extraTypes as extraTypes2,
} from "../../climate/purifier-extras";
import {
  validCurtainGroups as validCurtainGroups2,
} from "../../cover/cover-groups";
import { interaction3dPreviewSize as interaction3dPreviewSize2, observeInteraction3dPreview } from "@app/bridge/presets/preview-layout";
import {
  requestInteraction3dAccess as requestInteraction3dAccess2,
} from "@app/bridge/bridge";
import {
  carChargingMappingError as carChargingMappingError2,
} from "../../vehicle/car-state";
import {
  ensureItemCollections as ensureItemCollectionsCore,
  renderStatusRuleSection as renderStatusRuleSectionCore,
  renderCurtainGroupSection as renderCurtainGroupSectionCore,
  renderExtraControlsSection as renderExtraControlsSectionCore,
  renderAirPurifierBindingSection as renderAirPurifierBindingSectionCore,
  renderVacuumShortcutPanel as renderVacuumShortcutPanelCore,
} from "./rendering/panel-sections";
import { renderPanelImpl as renderPanelCore } from "./rendering/panel-assembly";
import {
  openAddDialog as openAddDialogCore,
  openVacuumRoomPicker as openVacuumRoomPickerCore,
  openCurtainGroupDialog as openCurtainGroupDialogCore,
  openMetricsDialog as openMetricsDialogCore,
  openCurtainGroupBatchApplyDialog as openCurtainGroupBatchApplyDialogCore,
  openLabelBatchApplyDialog as openLabelBatchApplyDialogCore,
} from "./rendering/panel-dialogs";
import {
  buildItemPayload as buildItemPayloadCore,
  listChangedFields as listChangedFieldsCore,
  switchEditorKind as switchEditorKindCore,
} from "./rendering/panel-session";

export function attachEditorPanelRendering(editorHost: any) {
  /**
   * 「一键应用」按钮重建器的**可变单元**（代理宿主的 `let refreshBatchButtons`）。
   *
   * 面板总装（`panel-assembly`）与吸尘器快捷面板（`panel-sections`）都会**重新赋值**它，
   * 宿主自己另有 3 处读写 —— 按值快照会把赋值留在切片局部、宿主看不到，所以两个域共用这一份
   * get/set 代理。对象本身在这里创建（只有 `.current` 被读时才碰到那个 `let`，不会撞 TDZ）。
   */
  const refreshBatchButtonsCell: { current: () => any } = {
    get current() {
      return refreshBatchButtons;
    },
    set current(next: any) {
      refreshBatchButtons = next;
    },
  };
  /**
   * 面板分区渲染的外部句柄（见 `rendering/panel-sections`）：上下文对象 `e` + 12 个兄弟函数
   * （6c 的 4 项 + 6d-2 新增 8 项；只被部分分区用到的那几项由各函数自行解构子集）。
   *
   * 这些兄弟都是本函数体内的**函数声明**（提升到函数体顶部；声明晚于本袋定义的那 6 个成员一律写成
   * 访问器，裸值简写 = 提前构造即 TDZ），放在函数体首行是为了让体内第一处调用也不撞 TDZ。
   */
  const panelSectionsDeps = () => ({
    editorHost,
    closeAddDialog,
    refreshEditorPreview,
    createSettingRow,
    renderPanel,
    createConfigSection,
    createConfigRow,
    createSelectRow,
    createNumberRow,
    createSizeRow,
    syncLinkedIconSize,
    openCurtainGroupBatchApplyDialog,
    openLabelBatchApplyDialog,
    switchEditorKind,
    openAddDialog,
    get editorSession() { return editorSession },
    refreshBatchButtonsCell,
  });
  /** 条目集合规整（原 panel-rendering 直系声明，P4 搬进 `rendering/panel-sections`）。 */
  function ensureItemCollections() {
    return ensureItemCollectionsCore(panelSectionsDeps());
  }
  /** 状态规则分区渲染（同上）。 */
  function renderStatusRuleSection(
    statusSettingsSectionElement: any,
    statusItem: any,
    statusOptions: any = {},
  ) {
    return renderStatusRuleSectionCore(panelSectionsDeps(), statusSettingsSectionElement, statusItem, statusOptions);
  }
  /** 幕布分组分区（同上）。 */
  function renderCurtainGroupSection(curtainGroup: any) {
    return renderCurtainGroupSectionCore(panelSectionsDeps(), curtainGroup);
  }
  /** 附加控件分区（同上）。 */
  function renderExtraControlsSection() {
    return renderExtraControlsSectionCore(panelSectionsDeps());
  }
  /** 净化器绑定分区（同上）。 */
  function renderAirPurifierBindingSection(sizeFieldContainer: any, sizeFieldTarget: any, sizeFieldOptions: any) {
    return renderAirPurifierBindingSectionCore(panelSectionsDeps(), sizeFieldContainer, sizeFieldTarget, sizeFieldOptions);
  }
  /** 吸尘器快捷模式面板（同上）。 */
  function renderVacuumShortcutPanel() {
    return renderVacuumShortcutPanelCore(panelSectionsDeps());
  }

  /**
   * 面板弹窗的外部句柄（见 `rendering/panel-dialogs`）：上下文对象 `e` + 13 个兄弟函数。
   * 7 条弹窗都无可变捕获（宿主 `let` 一个都不碰）；`editorSession` 是按引用注入的会话对象。
   */
  const panelDialogsDeps = () => ({
    editorHost,
    closeAddDialog,
    createSelectRow,
    refreshEditorPreview,
    renderPanel,
    listAddableModels,
    switchEditorKind,
    createSettingRow,
    closeAuxDialog,
    get editorSession() { return editorSession },
    get saveStatusElement() { return saveStatusElement },
    get buildEditableFieldList() { return buildEditableFieldList },
    buildItemPayload,
    listChangedFields,
  });
  /** 新增条目弹窗（原 panel-rendering 直系声明，P4 搬进 `rendering/panel-dialogs`）。 */
  function openAddDialog(addDialogTriggerEvent: any = undefined) {
    return openAddDialogCore(panelDialogsDeps(), addDialogTriggerEvent);
  }
  /** 吸尘器房间选择器（同上）。 */
  function openVacuumRoomPicker(roomPickerTriggerEvent: any) {
    return openVacuumRoomPickerCore(panelDialogsDeps(), roomPickerTriggerEvent);
  }
  /** 幕布分组弹窗（同上）。 */
  function openCurtainGroupDialog(onCancel: any) {
    return openCurtainGroupDialogCore(panelDialogsDeps(), onCancel);
  }
  /** 指标弹窗（同上）。 */
  function openMetricsDialog(metricsTargetEntry: any) {
    return openMetricsDialogCore(panelDialogsDeps(), metricsTargetEntry);
  }
  /** 「一键应用到其他」幕布分组批量弹窗（同上）。 */
  function openCurtainGroupBatchApplyDialog(sourceGroup: any, linkedFieldProbe = false) {
    return openCurtainGroupBatchApplyDialogCore(panelDialogsDeps(), sourceGroup, linkedFieldProbe);
  }
  /** 标签位批量弹窗（同上）。 */
  function openLabelBatchApplyDialog(sourceSection: any) {
    return openLabelBatchApplyDialogCore(panelDialogsDeps(), sourceSection);
  }

  /**
   * 编辑会话域的外部句柄（见 `rendering/panel-session`）：上下文对象 `e` + 两份**每实例一份**的
   * 会话状态（`editorSession` / `kindSessionsByKind`）+ 7 个兄弟函数。
   *
   * 这两份状态由宿主创建、按引用注入 —— 模块内只改字段（`editorSession.fieldDefs = …`）与
   * 增删改 Map 条目，不重新绑定，所以按对象引用传下去与闭包捕获等价。
   */
  const panelSessionDeps = () => ({
    editorHost,
    get editorSession() { return editorSession },
    get kindSessionsByKind() { return kindSessionsByKind },
    closeAddDialog,
    closeAuxDialog,
    ensureItemCollections,
    get buildEditableFieldList() { return buildEditableFieldList },
    renderPanel,
    refreshEditorPreview,
    openAddDialog,
  });
  /** 条目 → 可持久化形状（原 panel-rendering 直系声明，P4 搬进 `rendering/panel-session`）。 */
  function buildItemPayload(item: any) {
    return buildItemPayloadCore(panelSessionDeps(), item);
  }
  /** 与基线的字段差异（同上）。 */
  function listChangedFields(changedItem: any) {
    return listChangedFieldsCore(panelSessionDeps(), changedItem);
  }
  /** 切换设备种类的会话重建（同上；本身是 `async`，薄绑定只返回 Promise，不写成 `async`）。 */
  function switchEditorKind(
    nextDeviceKind: any,
    shouldOpenAddDialog = false,
    selection: any = null,
  ) {
    return switchEditorKindCore(panelSessionDeps(), nextDeviceKind, shouldOpenAddDialog, selection);
  }

  /**
   * 面板总装的外部句柄（见 `rendering/panel-assembly`）：上下文对象 `e` + 20 个兄弟函数 + 1 个可变单元。
   *
   * `refreshBatchButtonsCell` 用访问器代理到宿主的 `let refreshBatchButtons` —— 切片内会**重新赋值**它
   * （宿主另有 3 处读写），按快照解构注入会把赋值留在切片局部、宿主看不到，故走可变单元。
   */
  const panelAssemblyDeps = () => ({
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
    get buildRuntimeProperties() { return buildRuntimeProperties },
    listAddableModels,
    openAddDialog,
    renderCurtainGroupSection,
    openMetricsDialog,
    renderAirPurifierBindingSection,
    openCurtainGroupDialog,
    syncLinkedIconSize,
    renderStatusRuleSection,
    get saveButtonElement() { return saveButtonElement },});
  /** 面板总装（P4 搬进 `rendering/panel-assembly`，此处只转发句柄）。 */
  function renderPanel() {
    return renderPanelCore(panelAssemblyDeps());
  }
    function buildCurtainGroupOptions() {
      editorHost.structuredClone2.environment?.curtainGroups &&
        (editorHost.structuredClone2.environment.curtainGroups = validCurtainGroups2(
          editorHost.structuredClone2.environment,
        ));
    }
        ensureItemCollections();
    for (const normalizedBatchItem of [
      ...(editorHost.structuredClone2.environment?.airConditioners || []),
      ...(editorHost.structuredClone2.environment?.airers || []),
      ...(editorHost.structuredClone2.environment?.fans || []),
      ...(editorHost.structuredClone2.environment?.airPurifiers || []),
      ...(editorHost.structuredClone2.environment?.waterHeaters || []),
    ])
      normalizedBatchItem.extraControls = (normalizedBatchItem.extraControls || []).map(
        ({ label: batchControlLabel, ...batchControlRest }: any) => ({
          ...batchControlRest,
          type: extraTypes2(batchControlRest.entityId)[0],
        }),
      );
    const buildEditableFieldList = () =>
      editorHost.deviceKind === "smallcar"
        ? [
            ["cardWidth", "信息框宽度", "px"],
            ["cardFontSize", "文字大小", "px"],
            ["cardOpacity", "背景不透明度", "%"],
            ["buttonVisibility", "卡片显示", ""],
          ]
        : editorHost.usesModelBinding
          ? [
              ...(editorHost.isVacuumMode ? [] : [["icon", "图标", ""]]),
              ["size", editorHost.isVacuumMode ? "状态框缩放" : "按钮大小", editorHost.isVacuumMode ? "%" : "px"],
  
              ...(editorHost.isVacuumMode ? [["iconSize", "文字大小", "px"]] : []),
              ["hitSize", "点击范围", "px"],
              ["buttonVisibility", "按钮显示", ""],
              ...(editorHost.isVacuumMode ? [["backgroundOpacity", "背景不透明度", "%"]] : []),
              ...(editorHost.isVacuumShortcutMode
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
              // 灯光专属：这份清单同时决定「N 项修改」计数与「一键应用到其他灯光」的范围，
              // 漏掉它就会出现「下拉改了、计数不动、也同步不出去」。
              ...(editorHost.deviceKind === "light"
                ? ([["temperatureFallback", "不支持调色温时", ""]] as [string, string, string][])
                : []),
            ];
    /**
     * 编辑会话基线（**可变单元**）：可编辑字段清单 + 条目基线快照。
     *
     * 原先这两份是宿主 `let`，而搬出去的会话/弹窗函数必须**重新赋值**它们
     * （`switchEditorKind` 切换种类时重建两份；`renderVacuumShortcutPanel` 清空基线），
     * 快照解构不等价 —— 收进一个可变单元整体传下去，宿主自己的 `listChangedFields`
     * 也改成读这个单元（它随后一并搬进 `rendering/panel-session`）。
     */
    const editorSession = {
      fieldDefs: buildEditableFieldList(),
      baselineItemsById: new Map(
        editorHost.getItemList().map((baselinedItem: any) => [baselinedItem.id, structuredClone(baselinedItem)]),
      ),
    };
    const kindSessionsByKind = new Map();
    let auxDialogElement: any = null,
      refreshBatchButtons = () => {};
                        const syncPreviewSize = () => {
        const previewSize = interaction3dPreviewSize2(
          editorHost.component,
          editorHost.documentApi,
          editorHost.viewElement.clientWidth,
          editorHost.viewElement.clientHeight,
        );
        Object.assign(editorHost.aspectBoxElement.style, {
          width: previewSize.width + "px",
          height: previewSize.height + "px",
        });
      },
      resizeObserver = observeInteraction3dPreview(editorHost.viewElement, syncPreviewSize);
    const disposeEditor = () => {
        editorHost.isDisposed ||
          ((editorHost.isDisposed = true),
          closeAddDialog(),
          closeAuxDialog(),
          editorHost.subEditorHandle?.close(),
          resizeObserver.disconnect(),
          editorHost.pickerGeneration++,
          editorHost.pickerHandle?.close(),
          editorHost.editorRuntime?.(),
          editorHost.accessUnsubscribe?.(),
          editorHost.editorDialogElement.remove(),
          editorHost.element.remove(),
          document.dispatchEvent(new Event("hb-i3d-preview-scope")));
      },
      saveStatusElement = editorHost.createElement("span", "i3d-save-status");
    saveStatusElement.setAttribute("role", "status");
    const saveButtonElement = editorHost.createButton("保存配置", async () => {
      if (editorHost.isSaving || editorHost.isDisposed || !editorHost.isAccessAllowed || editorHost.isCameraEditing || editorHost.isCameraCommandPending)
        return;
      for (const carRecord of editorHost.structuredClone2.devices?.cars || []) {
        if (!carRecord.chargingStates) continue;
        const chargingMappingError = carChargingMappingError2(carRecord.chargingStates);
        if (chargingMappingError) {
          editorHost.errorMessageElement.textContent =
            (carRecord.label || carRecord.deviceName || "汽车") + "：" + chargingMappingError;
          return;
        }
      }
      const structuredClone3 = structuredClone(editorHost.structuredClone2);
      const runtimeCamera = editorHost.isDirty;
      ((editorHost.isSaving = true),
        (saveStatusElement.textContent = "保存中…"),
        (saveButtonElement.disabled = true),
        (editorHost.errorMessageElement.textContent = ""));
      try {
        if ((await requestInteraction3dAccess2(), editorHost.isDisposed)) return;
        (await editorHost.onSaveConfig(structuredClone3),
          editorHost.isDisposed ||
            (saveStatusElement.textContent =
              runtimeCamera === editorHost.isDirty ? "已保存" : "已保存，另有新修改"));
      } catch (saveError: any) {
        editorHost.isDisposed ||
          ((editorHost.errorMessageElement.textContent = saveError.message),
          (saveStatusElement.textContent = ""));
      } finally {
        ((editorHost.isSaving = false),
          editorHost.isDisposed ||
            (saveButtonElement.disabled =
              !editorHost.isAccessAllowed || editorHost.isCameraEditing || editorHost.isCameraCommandPending));
      }
    });
    ((saveButtonElement.className = "primary"),
      editorHost.headerElement.append(editorHost.createElement("strong", "", "3D " + editorHost.editorKindTitle + "配置")));
    if (
      editorHost.isClimateMode ||
      editorHost.isCoverMode ||
      editorHost.isTemperatureHumidityMode ||
      editorHost.isDeviceKind ||
      editorHost.isGenericDeviceMode ||
      editorHost.isVacuumMode ||
      editorHost.isVacuumShortcutMode
    ) {
      const showAllLabelsInput = editorHost.createElement("input");
      ((showAllLabelsInput.type = "checkbox"),
        (showAllLabelsInput.checked = editorHost.editingShowAllLabels === true),
        showAllLabelsInput.setAttribute("aria-label", "显示本类全部标签"),
        showAllLabelsInput.addEventListener("change", () => {
          if (editorHost.isDisposed || !editorHost.isAccessAllowed) return;
          ((editorHost.editingShowAllLabels = showAllLabelsInput.checked),
            editorHost.editorRuntime?.update(
              buildRuntimeProperties(),
              editorHost.isVacuumShortcutMode && editorHost.text
                ? "vacuum-room:" + editorHost.vacuumId + ":" + editorHost.text
                : editorHost.describeGroupFieldValue(),
              {
                module: editorHost.deviceKind,
                vacuumId: editorHost.isVacuumShortcutMode ? editorHost.vacuumId : "",
                showAllLabels: editorHost.editingShowAllLabels === true,
              },
            ));
        }));
      const showAllLabelsToggleElement = editorHost.createElement(
        "label",
        "i3d-setting-toggle i3d-preview-label-toggle",
      );
      (showAllLabelsToggleElement.append(
        editorHost.createElement("span", "", "显示本类全部标签"),
        showAllLabelsInput,
      ),
        editorHost.headerElement.append(showAllLabelsToggleElement));
    }
    (editorHost.headerElement.append(
      saveStatusElement,
      saveButtonElement,
      editorHost.createButton("退出", disposeEditor),
    ),
      editorHost.bodyElement.append(editorHost.viewElement, editorHost.panelElement),
      editorHost.editorDialogElement.append(editorHost.headerElement, editorHost.bodyElement),
      document.body.append(editorHost.editorDialogElement),
      editorHost.editorDialogElement.addEventListener("cancel", (editorCancelEvent: any) => {
        (editorCancelEvent.preventDefault(), disposeEditor());
      }));
    const buildRuntimeProperties = () => {
      const floorId =
          editorHost.isVacuumShortcutMode && editorHost.findVacuumModel() ? editorHost.findVacuumModel().floorId : editorHost.floorSelection,
        camera =
          editorHost.structuredClone2.floorCameras?.[floorId] ||
          (floorId === editorHost.structuredClone2.floorSelection ? editorHost.structuredClone2.camera : null);
      return {
        ...editorHost.structuredClone2, floorSelection: floorId,
        ...(camera === undefined
          ? {}
          : {
              camera: camera,
            }),
      };
    };
    function refreshEditorPreview() {
      (buildCurtainGroupOptions(),
        editorHost.isDirty++,
        editorHost.isSaving || (saveStatusElement.textContent = ""),
        editorHost.editorRuntime?.update(
          buildRuntimeProperties(),
          editorHost.isVacuumShortcutMode && editorHost.text
            ? "vacuum-room:" + editorHost.vacuumId + ":" + editorHost.text
            : editorHost.describeGroupFieldValue(),
          {
            module: editorHost.deviceKind,
            vacuumId: editorHost.isVacuumShortcutMode ? editorHost.vacuumId : "",
            showAllLabels: editorHost.editingShowAllLabels === true,
          },
        ),
        refreshBatchButtons());
    }
    function createSettingRow(rowContainer: any, rowLabel: any, rowControl: any) {
      rowControl.name = "i3d-" + editorHost.deviceKind + "-" + (editorHost.text || "scene") + "-" + rowLabel;
      const settingRowElement = editorHost.createElement(
        "label",
        rowControl.type === "checkbox" ? "i3d-setting-toggle" : "",
      );
      return (
        settingRowElement.append(editorHost.createElement("span", "", rowLabel), rowControl),
        rowContainer.append(settingRowElement),
        rowControl
      );
    }
    function createSelectRow(
      selectContainer: any,
      selectLabel: any,
      selectOptions: any,
      selectValue: any,
      onSelectChange: any,
    ) {
      const selectElement = editorHost.createElement("select");
      for (const [optionValueKey, optionLabelText] of selectOptions) {
        const optionElement = editorHost.createElement("option", "", optionLabelText);
        ((optionElement.value = optionValueKey), selectElement.append(optionElement));
      }
      return (
        (selectElement.value = selectValue),
        selectElement.addEventListener("change", () => onSelectChange(selectElement.value)),
        createSettingRow(selectContainer, selectLabel, selectElement)
      );
    }
    function createNumberRow(
      numberFieldContainer: any,
      numberFieldLabel: any,
      numberFieldValue: any,
      numberFieldMin: any,
      numberFieldMax: any,
      numberFieldStep: any,
      onNumberFieldChange: any,
      numberInputMode = "number",
      isCheckboxMode = false,
    ) {
      const endsWith = numberFieldLabel.endsWith("高度（米）"),
        formatNumberValue = (value: any) => (endsWith ? Number(value).toFixed(1) : String(value)),
        numberInputElement = editorHost.createElement("input");
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
    function createSizeRow(sizeRowContainer: any, sizeRowLabel: any, readSizeValue: any, onSizeValueChange: any) {
      const sizeInputElement = editorHost.createElement("input");
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
  
  
    function syncLinkedIconSize(targetConfig: any, nextButtonSize: any) {
      const resolvedIconSize = buttonIconSize(nextButtonSize);
      targetConfig.iconSize = resolvedIconSize;
      return resolvedIconSize;
    }
    function listAddableModels() {
      return (editorHost.sceneMetadata?.floors || [])
        .filter((candidateFloorEntry: any) => candidateFloorEntry.id === editorHost.floorSelection)
        .flatMap((floorWithModels: any) =>
          (editorHost.usesModelBinding ? floorWithModels[editorHost.collectionKey] || [] : floorWithModels.groups || [])
            .filter(
              (modelInFloor: any) =>
                !editorHost.getItemList().some(
                  (existingModelItem: any) =>
                    existingModelItem.floorId === floorWithModels.id &&
                    existingModelItem[editorHost.modelIdKey] === modelInFloor.id,
                ),
            )
            .map((addableModel: any) => ({
              floor: floorWithModels,
              group: addableModel,
              key: JSON.stringify([floorWithModels.id, addableModel.id]),
            })),
        );
    }
        function closeAuxDialog() {
      (auxDialogElement?.close(), auxDialogElement?.remove(), (auxDialogElement = null));
    }
    function closeAddDialog() {
      (editorHost.addDialogState && (editorHost.pickerGeneration++, editorHost.pickerHandle?.close(), (editorHost.pickerHandle = null)),
        editorHost.addDialogState?.close(),
        editorHost.addDialogState?.remove(),
        (editorHost.addDialogState = null));
    }
                function createConfigSection(sectionTitle: any) {
      const configSectionElement = editorHost.createElement("section", "i3d-config-section");
      return (
        configSectionElement.append(editorHost.createElement("h4", "", sectionTitle)),
        editorHost.panelElement.append(configSectionElement),
        configSectionElement
      );
    }
    function createConfigRow(parentSectionElement: any) {
      const configRowElement = editorHost.createElement("div", "i3d-config-row");
      return (parentSectionElement.append(configRowElement), configRowElement);
    }
                              editorHost.saveButtonElement = saveButtonElement;
  editorHost.saveStatusElement = saveStatusElement;
  Object.assign(editorHost, {
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
  });
  Object.defineProperty(editorHost, "auxDialogElement", {
    get: () => auxDialogElement,
    set: (value: any) => {
      auxDialogElement = value;
    },
    enumerable: true,
    configurable: true,
  });
}
