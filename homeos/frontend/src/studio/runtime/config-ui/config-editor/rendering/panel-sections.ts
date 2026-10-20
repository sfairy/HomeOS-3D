/**
 * 配置编辑器「面板分区」渲染器集合：
 * - `renderStatusRuleSection` / `ensureItemCollections`（6c：状态规则分区 + 条目集合规整）；
 * - `renderCurtainGroupSection` / `renderExtraControlsSection` / `renderAirPurifierBindingSection`
 *   （6d-2：幕布分组 / 附加控件 / 净化器绑定三块分区）；
 * - `renderVacuumShortcutPanel`（6d-3：吸尘器快捷模式面板，带 `editorSession` / `refreshBatchButtonsCell`
 *   两个可变单元，见 `PanelSectionsDeps`）。
 *
 * 全部从 panel-rendering.ts 单体切出（P4），只依赖宿主传进来的上下文对象 `e` 与若干兄弟函数，
 * 经 `PanelSectionsDeps` 显式传入（宿主只建一个 `panelSectionsDeps()` 工厂）。
 * 正文逐字复制 —— 6d-2 的**唯一**非机械改动是 `renderExtraControlsSection` 体内那一处
 * 跨函数调用要透传 `deps`（`renderAirPurifierBindingSection(deps, ...)`）。
 */

import { DEFAULT_BUTTON_SIZE, buttonIconSize } from "@app/bridge/presets/button-icon-size";
import { defaultDeviceStatusRule as defaultDeviceStatusRule2, deviceStatusChoices as deviceStatusChoices2 } from "../../../device/device-status";
import { withFixedLightEffects as withFixedLightEffects2 } from "@app/bridge/presets/light-effect-policy";
import { normalizeTemperatureHumidity as normalizeTemperatureHumidity2, DEFAULT_LABEL_ICON_SIZE as DEFAULT_LABEL_ICON_SIZE2, DEFAULT_LABEL_SIZE as DEFAULT_LABEL_SIZE2, ENVIRONMENT_BATTERY as ENVIRONMENT_BATTERY2, ENVIRONMENT_METRICS as ENVIRONMENT_METRICS2, MAX_LABEL_ICON_SIZE as MAX_LABEL_ICON_SIZE2, MAX_LABEL_SIZE as MAX_LABEL_SIZE2, MIN_LABEL_ICON_SIZE as MIN_LABEL_ICON_SIZE2, MIN_LABEL_SIZE as MIN_LABEL_SIZE2, temperatureHumidityFloorCenter as temperatureHumidityFloorCenter2 } from "@app/bridge/temperature-humidity";
import { appendBackgroundOpacityControl as appendBackgroundOpacityControl2 } from "../../../core/label-appearance";
import { curtainGroupEntryId as curtainGroupEntryId2 } from "../../../cover/cover-groups";
import { randomUuid as randomUuid2 } from "@app/shared/util/random-id";

/**
 * 面板分区渲染需要的外部句柄（**只读**：`e` 只被读属性 / 写它自己的字段，不重新绑定）。
 *
 * `e` 是 `attachEditorPanelRendering(e)` 的入参（配置编辑器上下文对象）；
 * 另 4 项是宿主里的兄弟函数，同时挂在宿主末尾 `Object.assign(e, {...})` 的公开面上，
 * 所以按 deps 注入与闭包捕获等价。
 */
export interface PanelSectionsDeps {
  /** 配置编辑器上下文对象（`editorHost.panelElement` / `editorHost.structuredClone2` / `editorHost.createElement` 等）。 */
  editorHost: any;
  /** 关闭「新增」确认弹窗。 */
  closeAddDialog: () => any;
  /** 局部重绘编辑器预览。 */
  refreshEditorPreview: () => any;
  /** 行控件工厂（标签 + 控件 → 一行元素）。 */
  createSettingRow: (rowContainer: any, rowLabel: any, rowControl: any) => any;
  /** 整面板重绘。 */
  renderPanel: () => any;
  /** 建一个分区容器（标题 + section）。 */
  createConfigSection: (sectionTitle: any) => any;
  /** 建一个配置行容器。 */
  createConfigRow: (parentSectionElement: any) => any;
  /** 下拉行（参数较多，按不透明回调注入）。 */
  createSelectRow: (...args: any[]) => any;
  /** 数字输入行（参数较多，按不透明回调注入）。 */
  createNumberRow: (...args: any[]) => any;
  /** 尺寸行（宽 / 高 / 点击范围 / 缓动时长）。 */
  createSizeRow: (
    sizeRowContainer: any,
    sizeRowLabel: any,
    readSizeValue: any,
    onSizeValueChange: any,
  ) => any;
  /** 图标尺寸联动。 */
  syncLinkedIconSize: (targetConfig: any, nextButtonSize: any) => any;
  /** 「一键应用到其他」批量对话框（灯光 / 幕布分组共用）。 */
  openCurtainGroupBatchApplyDialog: (sourceGroup: any, linkedFieldProbe?: boolean) => any;
  /** 「一键应用到其他」的标签位批量对话框。 */
  openLabelBatchApplyDialog: (sourceSection: any) => any;
  /** 按设备种类切换编辑会话。 */
  switchEditorKind: (...args: any[]) => any;
  /** 新增条目弹窗。 */
  openAddDialog: (addDialogTriggerEvent?: any) => any;
  /**
   * 编辑会话基线（**可变单元**）：吸尘器快捷面板会 `clear()` 条目基线，快照解构不等价。
   */
  editorSession: { fieldDefs: any[][]; baselineItemsById: Map<any, any> };
  /**
   * 「一键应用」按钮重建器的**可变单元**（宿主 `let refreshBatchButtons`）：面板总装与
   * 吸尘器快捷面板都会**重新赋值**它，所以按单元注入而不是按值。
   */
  refreshBatchButtonsCell: { current: () => any };
}

export function ensureItemCollections(deps: PanelSectionsDeps) {
  const { editorHost } = deps;
      if (
        (editorHost.usesStatusPanel &&
          (editorHost.structuredClone2.devices = {
            ...editorHost.structuredClone2.devices,
            [editorHost.collectionKey]: editorHost.structuredClone2.devices?.[editorHost.collectionKey] || [],
          }),
        editorHost.isTemperatureHumidityMode)
      ) {
        editorHost.structuredClone2.environment = {
          ...editorHost.structuredClone2.environment,
          temperatureHumidity: (editorHost.structuredClone2.environment?.temperatureHumidity || []).map(
            normalizeTemperatureHumidity2,
          ),
        };
        return;
      }
      if (
        (editorHost.usesModelBinding &&
          !editorHost.usesStatusPanel &&
          (editorHost.structuredClone2.environment = {
            ...editorHost.structuredClone2.environment,
            dimStrength: Number.isFinite(editorHost.structuredClone2.environment?.dimStrength)
              ? Math.max(0, Math.min(100, editorHost.structuredClone2.environment.dimStrength))
              : 70,
            [editorHost.collectionKey]: editorHost.structuredClone2.environment?.[editorHost.collectionKey] || [],
            ...(editorHost.isCoverMode
              ? {
                  curtainGroups: (editorHost.structuredClone2.environment?.curtainGroups || []).map(
                    (curtainGroupItem: any) => ({
                      ...curtainGroupItem,
  
                      iconSize: buttonIconSize(curtainGroupItem.size),
                    }),
                  ),
                }
              : {}),
          }),
        editorHost.isVacuumShortcutMode)
      ) {
        for (const vacuumModelItem of editorHost.structuredClone2.devices.vacuums)
          vacuumModelItem.shortcuts = (vacuumModelItem.shortcuts || []).map((vacuumShortcutItem: any) =>
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
      ((editorHost.vacuumId ||= editorHost.structuredClone2.devices?.vacuums?.[0]?.id || ""),
        editorHost.isVacuumMode && (editorHost.text = editorHost.vacuumId),
        editorHost.setItemList(
          (editorHost.getItemList() || [])
            .filter(
              (visibleItemProbe: any) =>
                editorHost.isVacuumShortcutMode || editorHost.isCoverMode || visibleItemProbe.visible !== false,
            )
            .map((normalizedItem: any) => {
              const size =
                Number.isFinite(normalizedItem.size) && normalizedItem.size > 0
                  ? normalizedItem.size
                  : DEFAULT_BUTTON_SIZE;
              return {
                ...(editorHost.usesModelBinding || editorHost.isTemperatureHumidityMode
                  ? normalizedItem
                  : withFixedLightEffects2(normalizedItem)),
                size: size,
                visible:
                  editorHost.isVacuumShortcutMode || editorHost.isCoverMode ? normalizedItem.visible !== false : true,
                icon: normalizedItem.icon || editorHost.defaultIcon,
                ...(editorHost.usesModelBinding || editorHost.isTemperatureHumidityMode
                  ? {}
                  : {
                      fadeDuration: normalizedItem.fadeDuration ?? 0.3,
                    }),
                ...(editorHost.isCoverMode
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
                ...(editorHost.isVacuumShortcutMode
                  ? {}
                  : {
                      clickAction: editorHost.normalizeClickAction(normalizedItem.clickAction),
                    }),
  
  
                iconSize: editorHost.isVacuumMode
                  ? Number.isFinite(normalizedItem.iconSize) && normalizedItem.iconSize > 0
                    ? normalizedItem.iconSize
                    : buttonIconSize(size)
                  : buttonIconSize(size),
              };
            }),
        ));
    }

export function renderStatusRuleSection(
  deps: PanelSectionsDeps,
  statusSettingsSectionElement: any,
  statusItem: any,
  { deviceId: statusDeviceId = statusItem.deviceId, standardOnly: isStandardOnly = false } = {},
) {
  const { editorHost, closeAddDialog, refreshEditorPreview, createSettingRow, renderPanel } = deps;
      ((statusSettingsSectionElement.className += " i3d-status-settings"),
        statusSettingsSectionElement.append(
          editorHost.createElement(
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
            : (statusFallbackEntity: any, statusRuleKey: any, statusRuleMode: any) => {
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
                  active: [reminderValue],
                  inactive: [
                    statusChoiceDefinition.options.find(
                      (nonReminderChoice) => nonReminderChoice.value !== reminderValue,
                    )!.value,
                  ],
                };
              },
        readHealthRules = () =>
          Array.isArray(statusItem.statusRules?.health)
            ? statusItem.statusRules.health
            : statusItem.statusRules?.health
              ? [statusItem.statusRules.health]
              : [],
        resolveCatalogEntry = (probedEntityId: any) =>
          editorHost.entities.find((entityProbe: any) => entityProbe.entityId === probedEntityId) || {
            entityId: probedEntityId,
          },
        resolveEntityState = (stateEntityId: any) =>
          editorHost.latestStates?.get?.(stateEntityId) ??
          editorHost.latestStates?.[stateEntityId] ??
          editorHost.states?.get?.(stateEntityId) ??
          editorHost.states?.[stateEntityId],
        refreshStatusRules = () => {
          const scrollTop = editorHost.panelElement.scrollTop;
          (refreshEditorPreview(), renderPanel(), (editorHost.panelElement.scrollTop = scrollTop));
        },
        canRefreshItem = (itemGeneration: any) =>
          !editorHost.isDisposed &&
          editorHost.isAccessAllowed &&
          itemGeneration === editorHost.pickerGeneration &&
          editorHost.getItemList().includes(statusItem),
        writeStatusRule = (ruleKind: any, ruleIndex: any, ruleValue: any) => {
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
          dialogRuleKind: any,
          dialogRuleIndex: any,
          statusEntity: any,
          dialogGeneration: any,
        ) => {
          if (!canRefreshItem(dialogGeneration) || editorHost.addDialogState) return;
          const statusDialogElement = editorHost.createElement("dialog", "settings-dialog i3d-add-dialog");
          ((editorHost.addDialogState = statusDialogElement),
            statusDialogElement.setAttribute("aria-label", "设置指示灯条件"));
          const statusDialogHeadingElement = editorHost.createElement("div", "dialog-heading");
          statusDialogHeadingElement.append(editorHost.createElement("h2", "", "设置指示灯条件"));
          const statusDialogBodyElement = editorHost.createElement("div", "i3d-add-dialog-body"),
            catalogEntry = resolveCatalogEntry(statusEntity.entityId),
            entityState = resolveEntityState(statusEntity.entityId),
            entityStateText = (entityState?.newState || entityState)?.state;
          (statusDialogBodyElement.append(
            editorHost.createElement("strong", "", catalogEntry.name || statusEntity.entityId),
            editorHost.createElement(
              "p",
              "i3d-note",
              "分别填写亮灯/提醒与灭灯/恢复的状态；每行一个，可填写多个。其他值显示为未知。",
            ),
          ),
            entityStateText != null &&
              statusDialogBodyElement.append(
                editorHost.createElement("p", "i3d-note", "HA 当前值：" + entityStateText),
              ));
          const statusChoiceDefinition = deviceStatusChoicesProvider(catalogEntry, entityState);
          if (statusChoiceDefinition?.options.length) {
            statusDialogBodyElement.append(
              editorHost.createElement(
                "p",
                "i3d-note",
                "可用状态：" +
                  statusChoiceDefinition.options
                    .map((statusOption: any) => statusOption.label + "（" + statusOption.value + "）")
                    .join("、"),
              ),
            );
          }
          const readStatusValueLines = (statusValue: any) =>
              (Array.isArray(statusValue) ? statusValue.join("\n") : statusValue || ""),
            activeValueInputElement = editorHost.createElement("textarea"),
            inactiveValueInputElement = editorHost.createElement("textarea");
          ((activeValueInputElement.value = readStatusValueLines(statusEntity.active)),
            (inactiveValueInputElement.value = readStatusValueLines(statusEntity.inactive)),
            (activeValueInputElement.maxLength = inactiveValueInputElement.maxLength = 7800),
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
          const statusDialogErrorElement = editorHost.createElement("p", "i3d-error");
          (statusDialogErrorElement.setAttribute("role", "status"),
            statusDialogBodyElement.append(statusDialogErrorElement));
          const confirmStatusValuesButton = editorHost.createButton("确定", () => {
            if (!canRefreshItem(dialogGeneration)) {
              closeAddDialog();
              return;
            }
            const statusValueGroups = [
              activeValueInputElement.value,
              inactiveValueInputElement.value,
            ].map((statusValueText: string) => [
              ...new Set(
                statusValueText
                  .split("\n")
                  .map((statusLine) => statusLine.trim())
                  .filter(Boolean),
              ),
            ]);
            if (
              statusValueGroups.some(
                (statusGroup) =>
                  !statusGroup.length ||
                  statusGroup.length > 64 ||
                  statusGroup.some(
                    (statusValueProbe) =>
                      statusValueProbe.length > 120 ||
                      ["unknown", "unavailable"].includes(statusValueProbe),
                  ),
              ) ||
              statusValueGroups[0].some((statusValueProbe) =>
                statusValueGroups[1].includes(statusValueProbe),
              )
            ) {
              statusDialogErrorElement.textContent =
                "请填写两组不重叠的有效状态值；未知或不可用不能作为匹配条件。";
              return;
            }
            (closeAddDialog(),
              writeStatusRule(dialogRuleKind, dialogRuleIndex, {
                entityId: statusEntity.entityId,
                active: statusValueGroups[0],
                inactive: statusValueGroups[1],
              }));
          });
          confirmStatusValuesButton.className = "primary";
          const statusDialogActionsElement = editorHost.createElement("div", "dialog-actions");
          (statusDialogActionsElement.append(
            editorHost.createButton("取消", closeAddDialog),
            confirmStatusValuesButton,
          ),
            statusDialogElement.append(
              statusDialogHeadingElement,
              statusDialogBodyElement,
              statusDialogActionsElement,
            ),
            editorHost.editorDialogElement.append(statusDialogElement),
            statusDialogElement.addEventListener("cancel", (statusDialogCancelEvent: any) => {
              (statusDialogCancelEvent.preventDefault(), closeAddDialog());
            }),
            statusDialogElement.showModal());
        },
        openStatusEntityPicker = async (pickerRuleKind: any, pickerRuleIndex: any, statusPickerGeneration: any) => {
          if (!editorHost.isAccessAllowed || editorHost.isDisposed || !statusDeviceId) return;
          const ruleRefreshGeneration = ++editorHost.pickerGeneration;
          (editorHost.pickerHandle?.close(), (editorHost.errorMessageElement.textContent = ""));
          const existingRule =
              pickerRuleKind === "power"
                ? statusItem.statusRules?.power
                : readHealthRules()[pickerRuleIndex],
            usedEntityIds = (entryProbe: any) =>
              (entryProbe.deviceId || entryProbe.device_id) === statusDeviceId &&
              !entryProbe.disabledBy &&
              !entryProbe.disabled_by &&
              entryProbe.enabled !== false &&
              !["disabled", "missing"].includes(entryProbe.status) &&
              (!isStandardOnly ||
                !!deviceStatusChoicesProvider(entryProbe, resolveEntityState(entryProbe.entityId))) &&
              (pickerRuleKind !== "health" ||
                !readHealthRules().some(
                  (pickedEntity: any, pickedEntry: any) =>
                    pickedEntry !== pickerRuleIndex && pickedEntity.entityId === entryProbe.entityId,
                ));
          let isRefreshingRules = false;
          try {
            if (!editorHost.pickers?.entity) throw new Error("实体选择器尚未准备好，请刷新页面。");
            const entity2 = await editorHost.pickers.entity({
              trigger: statusPickerGeneration,
              current: existingRule?.entityId || "", deviceKind: "device-status",
              title: pickerRuleKind === "health" ? "选择提醒实体" : "选择亮灭依据",
              entityFilter: usedEntityIds,
              onSelect(selectedEntity: any, selectedEntry: any) {
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
                  (editorHost.entities = [
                    ...editorHost.entities.filter(
                      (catalogEntityProbe: any) => catalogEntityProbe.entityId !== selectedEntity,
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
            canRefreshItem(ruleRefreshGeneration) ? (editorHost.pickerHandle = entity2) : entity2?.close();
          } catch (statusPickerError: any) {
            canRefreshItem(ruleRefreshGeneration) &&
              (editorHost.errorMessageElement.textContent = statusPickerError.message);
          }
        },
        writeRuleRow = (rowRuleKind: any, rowRuleIndex: any, ruleEntity: any) => {
          const ruleCatalogEntry = resolveCatalogEntry(ruleEntity?.entityId),
            statusEntityIdText = ruleCatalogEntry.name || ruleEntity?.entityId || "未选择实体",
            statusRuleRowElement = editorHost.createElement("div", "i3d-status-rule"),
            ruleValueInputElement = editorHost.createButton(
              "",
              () => void openStatusEntityPicker(rowRuleKind, rowRuleIndex, ruleValueInputElement),
            );
          if (
            ((ruleValueInputElement.className = "i3d-picker-button"),
            ruleValueInputElement.append(
              editorHost.createElement("span", "", ruleEntity ? statusEntityIdText : "不设置 · 选择实体"),
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
            ),
            singleActive =
              Array.isArray(ruleEntity.active) && ruleEntity.active.length === 1
                ? ruleEntity.active[0]
                : null,
            singleInactive =
              Array.isArray(ruleEntity.inactive) && ruleEntity.inactive.length === 1
                ? ruleEntity.inactive[0]
                : null;
          if (
            choiceDefinition?.options.length === 2 &&
            singleActive !== null &&
            singleInactive !== null &&
            singleActive !== singleInactive &&
            choiceDefinition.options.some(
              (activeChoiceProbe) => activeChoiceProbe.value === singleActive,
            ) &&
            choiceDefinition.options.some(
              (inactiveChoiceProbe) => inactiveChoiceProbe.value === singleInactive,
            )
          ) {
            const ruleDefaultButton = editorHost.createElement("select");
            ruleDefaultButton.setAttribute(
              "aria-label",
              rowRuleKind === "power"
                ? statusEntityIdText + "亮灯条件"
                : statusEntityIdText + "提醒条件",
            );
            for (const { value: optionValue, label: optionLabel } of choiceDefinition.options) {
              const reminderOptionElement = editorHost.createElement(
                "option",
                "",
                optionLabel + "时" + (rowRuleKind === "power" ? "亮灯" : "提醒"),
              );
              ((reminderOptionElement.value = optionValue),
                ruleDefaultButton.append(reminderOptionElement));
            }
            ((ruleDefaultButton.value = singleActive),
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
                    active: [inactiveOptionValue],
                    inactive: [inactiveOption],
                  }),
                  refreshEditorPreview());
              }),
              statusRuleRowElement.append(ruleDefaultButton));
          } else {
            if (isStandardOnly && !choiceDefinition)
              statusRuleRowElement.append(
                editorHost.createElement("span", "i3d-note", "状态暂不可识别，请重新选择实体。"),
              );
            else {
              const ruleActionsElement = editorHost.createButton("设置匹配条件", () =>
                openCustomStatusDialog(rowRuleKind, rowRuleIndex, ruleEntity, ++editorHost.pickerGeneration),
              );
              (ruleActionsElement.setAttribute(
                "aria-label",
                "设置" + statusEntityIdText + "匹配条件",
              ),
                statusRuleRowElement.append(ruleActionsElement));
            }
          }
          const pickerCloseButton = editorHost.createButton("×", () => {
            (editorHost.pickerGeneration++,
              editorHost.pickerHandle?.close(),
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
        editorHost.createElement("p", "i3d-status-label", "电源状态（可选）"),
      ),
        writeRuleRow("power", 0, statusItem.statusRules?.power),
        statusSettingsSectionElement.append(editorHost.createElement("p", "i3d-status-label", "提醒条件")),
        readHealthRules().forEach((healthRuleEntity: any, healthRuleIndex: any) =>
          writeRuleRow("health", healthRuleIndex, healthRuleEntity),
        ));
      const addRuleButtonElement = editorHost.createButton(
        "＋ 添加提醒",
        () => void openStatusEntityPicker("health", readHealthRules().length, addRuleButtonElement),
      );
      ((addRuleButtonElement.disabled = !statusDeviceId),
        (addRuleButtonElement.className = "i3d-status-add"),
        statusSettingsSectionElement.append(addRuleButtonElement),
        statusSettingsSectionElement.append(
          editorHost.createElement(
            "p",
            "i3d-note",
            "任一提醒条件触发时优先亮橙灯；没有提醒时，按电源状态亮灯或熄灭。不设置电源状态则只看提醒条件。",
          ),
        ));
    }

export function renderCurtainGroupSection(deps: PanelSectionsDeps, curtainGroup: any) {
  // 只解构本函数用到的子集（解构全集会被 no-unused-vars 判红）。
  const { editorHost, refreshEditorPreview, renderPanel, createConfigSection, createConfigRow, createSettingRow, createSelectRow, createNumberRow, createSizeRow, syncLinkedIconSize, openCurtainGroupBatchApplyDialog } = deps;
      const groupEntrySectionElement = createConfigSection("组合入口"),
        groupNameRowElement = createConfigRow(groupEntrySectionElement),
        groupNameInputElement = editorHost.createElement("input");
      ((groupNameInputElement.value = curtainGroup.label || "双层窗帘"),
        (groupNameInputElement.maxLength = 128),
        groupNameInputElement.addEventListener("change", () => {
          ((curtainGroup.label = groupNameInputElement.value.trim() || "双层窗帘"),
            refreshEditorPreview());
        }),
        createSettingRow(groupNameRowElement, "组合名称", groupNameInputElement),
        groupEntrySectionElement.append(
          editorHost.createElement(
            "p",
            "i3d-note",
            "双图标各自显示状态，共用点击范围。名称只用于配置和弹窗，不在户型上显示。",
          ),
        ));
      const memberItemList = curtainGroup.memberIds.map((memberId: any) =>
          editorHost.getItemList().find((memberItemProbe: any) => memberItemProbe.id === memberId),
        ),
        memberSectionElement = createConfigSection("组合成员"),
        memberActionsElement = editorHost.createElement("div", "i3d-group-member-actions");
      (memberSectionElement.append(memberActionsElement),
        memberItemList.forEach((memberItem: any, memberIndex: any) =>
          memberActionsElement.append(
            editorHost.createButton(
              (memberIndex === 0 ? "左图标 / 上控制区" : "右图标 / 下控制区") +
                "：" +
                (memberItem.label || "窗帘") +
                " · 编辑",
              () => {
                ((editorHost.text = memberItem.id),
                  (editorHost.selectedCurtainGroupId = memberItem.id),
                  refreshEditorPreview(),
                  renderPanel());
              },
            ),
          ),
        ),
        memberActionsElement.append(
          editorHost.createButton("交换两层顺序", () => {
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
        (pickedPanelLayout: any) => {
          ((curtainGroup.panelLayout = pickedPanelLayout), refreshEditorPreview());
        },
      ),
        behaviorSectionElement.append(
          editorHost.createElement(
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
          (pickedClickAction: any) => {
            ((curtainGroup.clickAction = pickedClickAction), refreshEditorPreview());
          },
        ),
        behaviorSectionElement.append(
          editorHost.createElement(
            "p",
            "i3d-note",
            "开关类行为：任一窗帘打开或半开时关闭两层，全部关闭时打开两层；运动中点击先停止。仅打开时执行所选聚焦或弹窗。",
          ),
        ));
      const visibilityRowElement = editorHost.createElement("div", "i3d-button-visibility-row");
      behaviorSectionElement.append(visibilityRowElement);
      for (const [visibilityFieldKey, visibilityFieldLabel, oppositeVisibilityKey] of [
        ["hiddenClickable", "隐藏（可点击）", "buttonHidden"],
        ["buttonHidden", "隐藏（不可点击）", "hiddenClickable"],
      ]) {
        const visibilityCheckboxElement = editorHost.createElement("input");
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
        sizeGridElement = editorHost.createElement("div", "i3d-coordinate-grid i3d-size-grid"),
        sizeDetailsElement = editorHost.createElement("details");
      (sizeDetailsElement.append(editorHost.createElement("summary", "", "更多尺寸设置"), sizeGridElement),
        appearanceSectionElement.append(sizeDetailsElement));
      for (const [buttonSizeFieldKey, buttonSizeFieldLabel, buttonSizeDefaultValue] of [
        ["size", "按钮大小（px）", DEFAULT_BUTTON_SIZE],
        ["hitSize", "触控范围（px）", DEFAULT_BUTTON_SIZE],
      ]) {
        createSizeRow(
          buttonSizeFieldKey === "size" ? buttonSizeRowElement : sizeGridElement,
          buttonSizeFieldLabel,
          () => curtainGroup[buttonSizeFieldKey] ?? buttonSizeDefaultValue,
          (nextSizeValue: any) => {
            (curtainGroup[buttonSizeFieldKey] = nextSizeValue),
              buttonSizeFieldKey === "size" &&
                syncLinkedIconSize(curtainGroup, nextSizeValue),
              refreshEditorPreview();
          },
        );
      }
      const buttonPositionSectionElement = createConfigSection("按钮位置"),
        buttonPositionGridElement = editorHost.createElement("div", "i3d-coordinate-grid");
      buttonPositionSectionElement.append(buttonPositionGridElement);
      const anchorMemberItem = memberItemList[0],
        anchorCurtainModel = editorHost.sceneMetadata.floors
          .find((matchedFloor: any) => matchedFloor.id === curtainGroup.floorId)
          ?.curtains?.find(
            (matchedCurtainModel: any) => matchedCurtainModel.id === anchorMemberItem.modelId,
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
          (nextPositionValue: any) => {
            ((curtainGroup[positionFieldKey] = nextPositionValue), refreshEditorPreview());
          },
        );
      (buttonPositionSectionElement.append(
        editorHost.createButton("一键应用到其他组合窗帘", () =>
          openCurtainGroupBatchApplyDialog(curtainGroup, true),
        ),
      ),
        buttonPositionSectionElement.append(
          editorHost.createButton("恢复跟随第一层入口", () => {
            for (const positionFieldName of ["x", "y", "height"])
              delete curtainGroup[positionFieldName];
            (refreshEditorPreview(), renderPanel());
          }),
        ));
      const focusSectionElement = createConfigSection("聚焦视角");
      focusSectionElement.className += " i3d-focus-settings";
      const focusActionsElement = editorHost.createElement("div", "i3d-focus-actions");
      focusSectionElement.append(focusActionsElement);
      const queueGroupCameraCommand = async (cameraCommandName: any, cameraCommandPayload: any = undefined) => {
        const cameraCommandGeneration = ++editorHost.num,
          isFocalLengthCommand = cameraCommandName === "focus-focal-length",
          previousCameraQueue = editorHost.cameraCommandQueue;
        let resolveCameraCommand;
        ((editorHost.cameraCommandQueue = new Promise((finishCameraCommand) => {
          resolveCameraCommand = finishCameraCommand;
        })),
          isFocalLengthCommand || ((editorHost.isCameraCommandPending = true), renderPanel()));
        // 同设备面板：预览刷新后不能静默 return，否则按钮会卡在「保存视角 / 取消调整」。
        const isCommandStale = () =>
          !editorHost.isDisposed && cameraCommandGeneration !== editorHost.num;
        const reportStaleCommand = () => {
          editorHost.isDisposed || (editorHost.errorMessageElement.textContent = "预览已刷新，请重新调整视角。");
        };
        try {
          if ((await previousCameraQueue, editorHost.isDisposed)) return;
          if (isCommandStale()) return reportStaleCommand();
          const focusCommand = await editorHost.editorRuntime.focusCommand(
            cameraCommandName,
            curtainGroupEntryId2(curtainGroup),
            cameraCommandPayload,
          );
          if (editorHost.isDisposed) return;
          if (isCommandStale()) return reportStaleCommand();
          cameraCommandName === "save-light-camera"
            ? ((curtainGroup.focusCamera = focusCommand.camera),
              (editorHost.isCameraEditing = false),
              (editorHost.pendingCameraDraft = null),
              refreshEditorPreview())
            : cameraCommandName === "cancel-light-camera"
              ? ((editorHost.isCameraEditing = false), (editorHost.pendingCameraDraft = null))
              : ((editorHost.isCameraEditing = true), (editorHost.pendingCameraDraft = focusCommand.camera));
        } catch (cameraError: any) {
          editorHost.isDisposed || (editorHost.errorMessageElement.textContent = cameraError.message);
        } finally {
          // pending 标志必须清掉，否则相机按钮会永久禁用。
          (resolveCameraCommand!(),
            !editorHost.isDisposed &&
              !isFocalLengthCommand &&
              ((editorHost.isCameraCommandPending = false), renderPanel()));
        }
      };
      if (editorHost.isCameraEditing) {
        const entrySectionElement = editorHost.createButton(
          "保存视角",
          () => void queueGroupCameraCommand("save-light-camera"),
        );
        ((entrySectionElement.className = "primary"),
          focusActionsElement.append(
            entrySectionElement,
            editorHost.createButton("取消调整", () => void queueGroupCameraCommand("cancel-light-camera")),
          ));
        const projectionGroupElement = editorHost.createElement("div", "i3d-focus-actions");
        (projectionGroupElement.setAttribute("role", "group"),
          projectionGroupElement.setAttribute("aria-label", "聚焦投影"),
          focusSectionElement.append(projectionGroupElement));
        for (const [projectionMode, projectionModeLabel] of [
          ["orthographic", "正交"],
          ["perspective", "透视"],
        ]) {
          const projectionButtonElement = editorHost.createButton(
            projectionModeLabel,
            () => void queueGroupCameraCommand("focus-projection", projectionMode),
          );
          (projectionButtonElement.setAttribute(
            "aria-pressed",
            String((editorHost.pendingCameraDraft?.mode || "orthographic") === projectionMode),
          ),
            projectionGroupElement.append(projectionButtonElement));
        }
        const focalLengthInputElement = createNumberRow(
          focusSectionElement,
          "焦段（mm）",
          Math.round(editorHost.pendingCameraDraft?.focalLength || 50),
          18,
          120,
          1,
          (nextFocalLength: any) => void queueGroupCameraCommand("focus-focal-length", nextFocalLength),
        );
        focalLengthInputElement.disabled = editorHost.pendingCameraDraft?.mode !== "perspective";
      } else {
        focusActionsElement.append(
          editorHost.createButton(
            curtainGroup.focusCamera ? "调整视角" : "设置视角",
            () => void queueGroupCameraCommand("edit-light-camera"),
          ),
          editorHost.createButton("预览聚焦", () => void queueGroupCameraCommand("preview-light-camera")),
        );
        const resetFocusButtonElement = editorHost.createButton("恢复自动聚焦", async () => {
          (await queueGroupCameraCommand("cancel-light-camera"),
            delete curtainGroup.focusCamera,
            refreshEditorPreview(),
            renderPanel());
        });
        ((resetFocusButtonElement.className = "i3d-focus-reset"),
          (resetFocusButtonElement.disabled = !curtainGroup.focusCamera),
          focusSectionElement.append(resetFocusButtonElement));
      }
      createConfigSection("组合管理").append(
        editorHost.createElement(
          "p",
          "i3d-note",
          "解除组合仅移除组合关系，恢复两层各自的入口、位置、聚焦视角与图标；不会删除模型或设备。",
        ),
        editorHost.createButton("解除组合", () => {
          ((editorHost.structuredClone2.environment.curtainGroups = editorHost.getCurtainGroupList().filter(
            (remainingGroupProbe: any) => remainingGroupProbe.id !== curtainGroup.id,
          )),
            (editorHost.text = curtainGroup.memberIds[0]),
            (editorHost.selectedCurtainGroupId = ""),
            refreshEditorPreview(),
            renderPanel());
        }),
      );
      for (const lockedControlElement of editorHost.panelElement.querySelectorAll("input, select, button"))
        (editorHost.isCameraCommandPending ||
          (editorHost.isCameraEditing && !lockedControlElement.closest(".i3d-focus-settings"))) &&
          (lockedControlElement.disabled = true);
    }

export function renderExtraControlsSection(deps: PanelSectionsDeps) {
  // 只解构本函数用到的子集（解构全集会被 no-unused-vars 判红）。
  const { editorHost, refreshEditorPreview, renderPanel, createConfigSection, createConfigRow, createSettingRow, createSelectRow, createNumberRow, openLabelBatchApplyDialog } = deps;
      const labelListSectionElement = createConfigSection("环境标签列表"),
        labelListRowElement = createConfigRow(labelListSectionElement),
        floorLabelList = editorHost.getItemList().filter(
          (floorLabelProbe: any) => floorLabelProbe.floorId === editorHost.floorSelection,
        ),
        currentFloor = editorHost.sceneMetadata.floors.find((labelFloor: any) => labelFloor.id === editorHost.floorSelection);
      floorLabelList.some((existingLabelProbe: any) => existingLabelProbe.id === editorHost.text) ||
        (editorHost.text = floorLabelList[0]?.id || "");
      const addLabelButtonElement = editorHost.createButton("添加环境标签", () => {
        if (!currentFloor || !editorHost.isAccessAllowed) return;
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
        (editorHost.getItemList().push(newLabelDraft),
          (editorHost.text = newLabelDraft.id),
          renderPanel(),
          refreshEditorPreview());
      });
      ((addLabelButtonElement.className = "primary"),
        (addLabelButtonElement.disabled = !editorHost.isAccessAllowed),
        labelListRowElement.append(addLabelButtonElement),
        labelListSectionElement.append(
          editorHost.createElement(
            "p",
            "i3d-note",
            "环境标签是独立信息框，不绑定户型模型，不聚焦，不发送控制指令。",
          ),
        ),
        floorLabelList.length &&
          createSelectRow(
            labelListSectionElement,
            "当前环境标签",
            floorLabelList.map((labelOption: any) => [labelOption.id, labelOption.label || "环境标签"]),
            editorHost.text,
            (pickedLabelId: any) => {
              ((editorHost.text = pickedLabelId), refreshEditorPreview(), renderPanel());
            },
          ));
      const selectedFloorLabel = floorLabelList.find((matchedLabel: any) => matchedLabel.id === editorHost.text);
      if (!selectedFloorLabel) {
        editorHost.panelElement.append(
          labelListSectionElement,
          editorHost.createElement("p", "i3d-note", "当前楼层还没有环境标签，请点击“添加环境标签”。"),
        );
        return;
      }
      const groupHiddenClickableCheckbox = createConfigSection("显示内容（含文字）"),
        groupButtonHiddenCheckbox = editorHost.createElement("input");
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
      const showMetricNamesCheckboxElement = editorHost.createElement("input");
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
          editorHost.createElement("p", "i3d-note", "关闭后只显示图标、数值和单位。"),
        ));
      const renderEntityBindingRow = ({ key: entityFieldKey, label: entityFieldLabel }: any) => {
        const entityIdFieldName = entityFieldKey + "EntityId",
          groupSizeDetailsElement = editorHost.createButton(
            editorHost.entities.find(
              (catalogEntryProbe: any) =>
                catalogEntryProbe.entityId === selectedFloorLabel[entityIdFieldName],
            )?.name ||
              selectedFloorLabel[entityIdFieldName] ||
              "选择" + entityFieldLabel + "实体",
            async () => {
              const groupSizeGridElement = ++editorHost.pickerGeneration;
              editorHost.errorMessageElement.textContent = "";
              try {
                if (!editorHost.pickers?.entity) throw new Error("实体选择器尚未准备好，请刷新页面。");
                editorHost.pickerHandle?.close?.();
                const entity3 = await editorHost.pickers.entity({
                  trigger: groupSizeDetailsElement,
                  current: selectedFloorLabel[entityIdFieldName] || "", deviceKind: "temperature-humidity",
                  domain: entityFieldKey,
                  title: "选择" + entityFieldLabel + "实体",
                  onSelect(pickedEntityId: any) {
                    editorHost.isDisposed ||
                      !editorHost.isAccessAllowed ||
                      groupSizeGridElement !== editorHost.pickerGeneration ||
                      !editorHost.getItemList().includes(selectedFloorLabel) ||
                      ((selectedFloorLabel[entityIdFieldName] = pickedEntityId || ""),
                      refreshEditorPreview(),
                      renderPanel());
                  },
                });
                editorHost.isDisposed || !editorHost.isAccessAllowed || groupSizeGridElement !== editorHost.pickerGeneration
                  ? entity3?.close()
                  : (editorHost.pickerHandle = entity3);
              } catch (pickedGroupIconSizeValue: any) {
                editorHost.isDisposed || (editorHost.errorMessageElement.textContent = pickedGroupIconSizeValue.message);
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
          editorHost.createElement("p", "i3d-note", "电量显示在名称右侧；传感器均可选，未绑定的项目不显示。"),
        ));
      for (const pickedGroupHitSizeValue of ENVIRONMENT_METRICS2)
        renderEntityBindingRow(pickedGroupHitSizeValue);
      const labelPositionSectionElement = createConfigSection("位置与大小"),
        groupPositionGridElement = editorHost.createElement("div", "i3d-coordinate-grid");
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
          (pickedGroupCoordinateValue: any) => {
            ((selectedFloorLabel[coordinateKey] = pickedGroupCoordinateValue),
              refreshEditorPreview());
          },
        );
      renderAirPurifierBindingSection(deps, labelPositionSectionElement, selectedFloorLabel, {
        width: "size",
        font: "iconSize",
        opacity: "opacity",
      });
      const labelBatchSectionElement = editorHost.createElement(
          "section",
          "navigation-batch-section i3d-light-batch",
        ),
        labelBatchHeadingElement = editorHost.createElement("h4"),
        targetCountElement = editorHost.createElement("span"),
        renderEntityList = () =>
          editorHost.getItemList().filter(
            (sameFloorLabelProbe: any) =>
              sameFloorLabelProbe !== selectedFloorLabel &&
              sameFloorLabelProbe.floorId === selectedFloorLabel.floorId,
          );
      labelBatchHeadingElement.append(
        editorHost.createElement("span", "", "环境标签设置一键应用"),
        targetCountElement,
      );
      const applyToLabelGroupButton = editorHost.createButton("一键应用到其他环境标签", () =>
        openLabelBatchApplyDialog(selectedFloorLabel),
      );
      ((targetCountElement.textContent = renderEntityList().length + " 个同层目标"),
        labelBatchSectionElement.append(labelBatchHeadingElement, applyToLabelGroupButton));
      const manageSectionElement = createConfigSection("绑定管理");
      (manageSectionElement.append(
        editorHost.createButton("删除此环境标签", () => {
          (editorHost.setItemList(
            editorHost.getItemList().filter((otherLabelProbe: any) => otherLabelProbe.id !== selectedFloorLabel.id),
          ),
            (editorHost.text = ""),
            refreshEditorPreview(),
            renderPanel());
        }),
      ),
        editorHost.panelElement.append(
          labelListSectionElement,
          groupHiddenClickableCheckbox,
          labelPositionSectionElement,
          labelBatchSectionElement,
          manageSectionElement,
        ));
    }

export function renderAirPurifierBindingSection(
  deps: PanelSectionsDeps,
  sizeFieldContainer: any,
  sizeFieldTarget: any,
  sizeFieldOptions: any,
) {
  // 只解构本函数用到的子集（解构全集会被 no-unused-vars 判红）。
  const { editorHost, refreshEditorPreview, createConfigRow, createSelectRow, createNumberRow } = deps;
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
          (nextSizeFieldValue: any) => {
            ((sizeFieldTarget[labelSizeFieldKey] = nextSizeFieldValue), refreshEditorPreview());
          },
          "number",
          editorHost.isTemperatureHumidityMode,
        );
      const layoutRowElement = editorHost.isTemperatureHumidityMode ? createConfigRow(sizeFieldContainer) : null;
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
          (pickedColumnCount: any) => {
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
          editorHost.createElement("p", "i3d-note", "自动随宽度排列；固定每行项数时，窄框内容会自动换行适配。"),
        ));
    }

export function renderVacuumShortcutPanel(deps: PanelSectionsDeps) {
  // 只解构本函数用到的子集（解构全集会被 no-unused-vars 判红）。
  const { editorHost, editorSession, refreshBatchButtonsCell, refreshEditorPreview, renderPanel, createConfigSection, createConfigRow, createSettingRow, createSelectRow, createNumberRow, createSizeRow, syncLinkedIconSize, switchEditorKind, openAddDialog, openCurtainGroupBatchApplyDialog } = deps;
      const scopeSectionElement = createConfigRow(createConfigSection("配置范围"));
      if (
        (createSelectRow(
          scopeSectionElement,
          "配置内容",
          [
            ["vacuum", "设备与地图"],
            ["vacuum-shortcut", "快捷指令"],
          ],
          editorHost.deviceKind,
          (pickedScopeKey: any) => {
            pickedScopeKey !== editorHost.deviceKind && switchEditorKind(pickedScopeKey);
          },
        ),
        !editorHost.sceneMetadata)
      )
        return;
      const vacuumModels = editorHost.structuredClone2.devices?.vacuums || [];
      if (!vacuumModels.length) {
        editorHost.panelElement.append(editorHost.createElement("p", "i3d-note", "请先在扫地机配置中添加并绑定扫地机。"));
        return;
      }
      createSelectRow(
        scopeSectionElement,
        "所属扫地机",
        vacuumModels.map((vacuumModelOption: any) => [
          vacuumModelOption.id,
          vacuumModelOption.label || vacuumModelOption.deviceName || "扫地机",
        ]),
        editorHost.vacuumId,
        (pickedVacuumId: any) => {
          ((editorHost.vacuumId = pickedVacuumId),
            (editorHost.text = ""),
            editorSession.baselineItemsById.clear(),
            renderPanel(),
            refreshEditorPreview());
        },
      );
      const shortcutSectionElement = createConfigSection("快捷按钮");
      shortcutSectionElement.className += " i3d-compact-list";
      const shortcutHeaderRowElement = editorHost.createElement("div", "i3d-config-list-row"),
        addShortcutButton = editorHost.createButton("添加快捷指令", openAddDialog);
      if (
        (shortcutHeaderRowElement.append(addShortcutButton),
        shortcutSectionElement.append(shortcutHeaderRowElement),
        editorHost.getItemList().some((existingShortcutProbe: any) => existingShortcutProbe.id === editorHost.text) ||
          (editorHost.text = editorHost.getItemList()[0]?.id || ""),
        !editorHost.text)
      ) {
        editorHost.panelElement.append(
          editorHost.createElement(
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
        editorHost.getItemList().map((shortcutOptionItem: any) => [shortcutOptionItem.id, shortcutOptionItem.label]),
        editorHost.text,
        (pickedShortcutId: any) => {
          ((editorHost.text = pickedShortcutId),
            editorHost.pickerGeneration++,
            editorHost.pickerHandle?.close(),
            renderPanel(),
            refreshEditorPreview());
        },
      );
      const selectedShortcut = editorHost.getItemList().find((matchedShortcut: any) => matchedShortcut.id === editorHost.text),
        removeShortcutButton = editorHost.createButton("删除此快捷按钮", () => {
          (editorHost.pickerGeneration++,
            editorHost.pickerHandle?.close(),
            editorHost.setItemList(
              editorHost.getItemList().filter(
                (removedShortcutProbe: any) => removedShortcutProbe !== selectedShortcut,
              ),
            ),
            (editorHost.text = ""),
            renderPanel(),
            refreshEditorPreview());
        });
      removeShortcutButton.className = "i3d-remove-light";
      const bindingSectionElement = createConfigRow(createConfigSection("基础绑定")),
        shortcutNameInput = editorHost.createElement("input");
      ((shortcutNameInput.value = selectedShortcut.label),
        (shortcutNameInput.maxLength = 128),
        (shortcutNameInput.onchange = () => {
          ((selectedShortcut.label = shortcutNameInput.value.trim() || "房间清扫"),
            renderPanel(),
            refreshEditorPreview());
        }),
        createSettingRow(bindingSectionElement, "名称", shortcutNameInput));
      const openShortcutPicker = (pickerName: any, shortcutPickerTrigger: any) => {
          const shortcutPickerGeneration = ++editorHost.pickerGeneration;
          Promise.resolve(
            editorHost.pickers[pickerName]({
              trigger: shortcutPickerTrigger, deviceKind: "vacuum-room",
              current: pickerName === "icon" ? selectedShortcut.icon : selectedShortcut.entityId,
              onSelect(pickedShortcutValue: any) {
                editorHost.isDisposed ||
                  !editorHost.isAccessAllowed ||
                  shortcutPickerGeneration !== editorHost.pickerGeneration ||
                  !editorHost.getItemList().includes(selectedShortcut) ||
                  (pickerName === "icon"
                    ? (selectedShortcut.icon = pickedShortcutValue)
                    : (selectedShortcut.entityId = pickedShortcutValue),
                  renderPanel(),
                  refreshEditorPreview());
              },
            }),
          )
            .then((shortcutPickerHandle) => {
              editorHost.isDisposed || shortcutPickerGeneration !== editorHost.pickerGeneration
                ? shortcutPickerHandle?.close()
                : (editorHost.pickerHandle = shortcutPickerHandle);
            })
            .catch((shortcutPickerError) => {
              editorHost.errorMessageElement.textContent = shortcutPickerError.message;
            });
        },
        entityPickerButton = editorHost.createButton(selectedShortcut.entityId || "选择实体（全部）", () =>
          openShortcutPicker("entity", entityPickerButton),
        );
      ((entityPickerButton.className = "i3d-picker-button"),
        (entityPickerButton.title = selectedShortcut.entityId || ""),
        createSettingRow(bindingSectionElement, "指令实体", entityPickerButton));
      const shortcutAppearanceSectionElement = createConfigSection("按钮外观"),
        shortcutAppearanceRowElement = createConfigRow(shortcutAppearanceSectionElement),
        iconPickerButton = editorHost.createButton("", () => openShortcutPicker("icon", iconPickerButton));
      iconPickerButton.className = "i3d-picker-button i3d-icon-picker-button";
      const iconPreviewElement = editorHost.createElement("i");
      ((iconPreviewElement.style.maskImage =
        "url('/static/vendor/mdi/7.4.47/svg/" +
        (selectedShortcut.icon || editorHost.defaultIcon).slice(4) +
        ".svg')"),
        (iconPreviewElement.style.webkitMaskImage = iconPreviewElement.style.maskImage),
        iconPickerButton.append(
          iconPreviewElement,
          editorHost.createElement("span", "", selectedShortcut.icon || editorHost.defaultIcon),
        ),
        createSettingRow(shortcutAppearanceRowElement, "图标", iconPickerButton));
      const shortcutVisibilityRowElement = editorHost.createElement(
        "div",
        "i3d-button-visibility-row i3d-shortcut-visibility",
      );
      shortcutAppearanceSectionElement.append(shortcutVisibilityRowElement);
      for (const [visibilityPropertyKey, visibilityToggleLabel] of [
        ["hiddenClickable", "隐藏（可点击）"],
        ["buttonHidden", "隐藏（不可点击）"],
      ]) {
        const shortcutVisibilityCheckboxElement = editorHost.createElement("input");
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
        const hiddenCheckboxElement = editorHost.createElement("input");
        ((hiddenCheckboxElement.type = "checkbox"),
          (hiddenCheckboxElement.checked = selectedShortcut[hiddenPropertyKey] === true),
          (hiddenCheckboxElement.onchange = () => {
            ((selectedShortcut[hiddenPropertyKey] = hiddenCheckboxElement.checked),
              refreshEditorPreview());
          }),
          createSettingRow(shortcutVisibilityRowElement, hiddenToggleLabel, hiddenCheckboxElement));
      }
      const shortcutSizeGridElement = editorHost.createElement(
          "div",
          "i3d-coordinate-grid i3d-size-grid i3d-shortcut-size-grid",
        ),
        shortcutAdvancedDetailsElement = editorHost.createElement("details");
      (shortcutAdvancedDetailsElement.append(
        editorHost.createElement("summary", "", "更多尺寸设置"),
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
          (updatedShortcutSize: any) => {
            (selectedShortcut[sizePropertyKey] = updatedShortcutSize),
              sizePropertyKey === "size" &&
                syncLinkedIconSize(selectedShortcut, updatedShortcutSize),
              refreshEditorPreview();
          },
        );
      }
      const shortcutPositionSectionElement = createConfigSection("按钮位置"),
        shortcutPositionGridElement = editorHost.createElement("div", "i3d-coordinate-grid");
      shortcutPositionSectionElement.append(shortcutPositionGridElement);
      for (const positionAxis of ["x", "y"])
        createNumberRow(
          shortcutPositionGridElement,
          "位置 " + positionAxis.toUpperCase(),
          selectedShortcut[positionAxis],
          -1000000,
          1000000,
          1,
          (updatedShortcutPosition: any) => {
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
        (updatedShortcutHeight: any) => {
          ((selectedShortcut.height = updatedShortcutHeight), refreshEditorPreview());
        },
      ),
        shortcutPositionSectionElement.append(
          editorHost.createElement(
            "p",
            "i3d-note",
            "拖动按钮调整位置，拖动空白处旋转户型。点击只执行绑定指令，不弹窗、不聚焦。",
          ),
        ));
      const shortcutBatchSectionElement = editorHost.createElement(
          "section",
          "navigation-batch-section i3d-light-batch",
        ),
        shortcutBatchApplyButton = editorHost.createButton("一键应用到其他快捷按钮", () =>
          openCurtainGroupBatchApplyDialog(selectedShortcut),
        );
      (shortcutBatchSectionElement.append(
        editorHost.createElement("h4", "", editorHost.deviceKind === "smallcar" ? "卡片设置一键应用" : "图标设置一键应用"),
        shortcutBatchApplyButton,
      ),
        editorHost.panelElement.append(shortcutBatchSectionElement),
        (refreshBatchButtonsCell.current = () => {
          shortcutBatchApplyButton.disabled = !editorHost.isAccessAllowed;
        }),
        refreshBatchButtonsCell.current(),
        createConfigSection("绑定管理").append(removeShortcutButton));
    }
