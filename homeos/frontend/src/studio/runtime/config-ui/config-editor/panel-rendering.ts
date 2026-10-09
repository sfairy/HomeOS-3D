import { purifierState as purifierState2 } from "../../purifier/purifier-state";
import { bathEffectEditor as bathEffectEditor2 } from "../../bath-heater/bath-heater-editor";
import { appendBackgroundOpacityControl as appendBackgroundOpacityControl2 } from "../../core/label-appearance";
import {
  openBatchApply as openBatchApply2,
  copyBatchFields as copyBatchFields2,
} from "../batch-apply";
import { withFixedLightEffects as withFixedLightEffects2 } from "@app/bridge/light-effect-policy";
import {
  DEFAULT_BUTTON_SIZE,
  buttonIconSize,
} from "@app/bridge/button-icon-size";
import { CARD_TEXT_SIZE_PX } from "@app/bridge/card-text-size";
import { vacuumMapIdentity as vacuumMapIdentity2 } from "../../vacuum/vacuum-map";
import { openInteraction3dRangeEditor as openInteraction3dRangeEditor2 } from "../range-dialog";
import { openVacuumMapEditor as openVacuumMapEditor2 } from "../../vacuum/vacuum-map-editor";
import { nasGroups as nasGroups2 } from "../../nas/nas-panel";
import {
  extraTypes as extraTypes2,
  extraLabels as extraLabels2,
  purifierRelatedEntities as purifierRelatedEntities2,
  purifierDeviceChanged as purifierDeviceChanged2,
} from "../../climate/purifier-extras";
import {
  validCurtainGroups as validCurtainGroups2,
  curtainGroupEntryId as curtainGroupEntryId2,
  curtainGroupCandidates as curtainGroupCandidates2,
  createCurtainGroup as createCurtainGroup2,
} from "../../cover/cover-groups";
import { randomUuid as randomUuid2 } from "@app/utils/random-id";
import { interaction3dPreviewSize as interaction3dPreviewSize2 } from "@app/bridge/preview-layout";
import {
  requestInteraction3dAccess as requestInteraction3dAccess2,
} from "@app/bridge/bridge";
import { readNestedPath } from "./_shared";
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
} from "../../vehicle/car-state";
import { deviceEntityCatalog as deviceEntityCatalog2 } from "../device-entity-config";
import {
  deviceStatusChoices as deviceStatusChoices2,
  defaultDeviceStatusRule as defaultDeviceStatusRule2,
} from "../../device/device-status";
import {
  GENERIC_DEVICE_KINDS as GENERIC_DEVICE_KINDS2,
  genericDeviceProfile as genericDeviceProfile2,
} from "../../device/generic-device-catalog";
import {
  fanSourceAllowed,
  fanReverseStateOptions,
  resolveFanBindingState,
} from "../../fan/fan-state";

export function attachEditorPanelRendering(e: any) {
    function buildCurtainGroupOptions() {
      e.structuredClone2.environment?.curtainGroups &&
        (e.structuredClone2.environment.curtainGroups = validCurtainGroups2(
          e.structuredClone2.environment,
        ));
    }
    function ensureItemCollections() {
      if (
        (e.usesStatusPanel &&
          (e.structuredClone2.devices = {
            ...e.structuredClone2.devices,
            [e.collectionKey]: e.structuredClone2.devices?.[e.collectionKey] || [],
          }),
        e.isTemperatureHumidityMode)
      ) {
        e.structuredClone2.environment = {
          ...e.structuredClone2.environment,
          temperatureHumidity: (e.structuredClone2.environment?.temperatureHumidity || []).map(
            normalizeTemperatureHumidity2,
          ),
        };
        return;
      }
      if (
        (e.usesModelBinding &&
          !e.usesStatusPanel &&
          (e.structuredClone2.environment = {
            ...e.structuredClone2.environment,
            dimStrength: Number.isFinite(e.structuredClone2.environment?.dimStrength)
              ? Math.max(0, Math.min(100, e.structuredClone2.environment.dimStrength))
              : 70,
            [e.collectionKey]: e.structuredClone2.environment?.[e.collectionKey] || [],
            ...(e.isCoverMode
              ? {
                  curtainGroups: (e.structuredClone2.environment?.curtainGroups || []).map(
                    (curtainGroupItem: any) => ({
                      ...curtainGroupItem,
  
                      iconSize: buttonIconSize(curtainGroupItem.size),
                    }),
                  ),
                }
              : {}),
          }),
        e.isVacuumShortcutMode)
      ) {
        for (const vacuumModelItem of e.structuredClone2.devices.vacuums)
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
      ((e.vacuumId ||= e.structuredClone2.devices?.vacuums?.[0]?.id || ""),
        e.isVacuumMode && (e.text = e.vacuumId),
        e.setItemList(
          (e.getItemList() || [])
            .filter(
              (visibleItemProbe: any) =>
                e.isVacuumShortcutMode || e.isCoverMode || visibleItemProbe.visible !== false,
            )
            .map((normalizedItem: any) => {
              const size =
                Number.isFinite(normalizedItem.size) && normalizedItem.size > 0
                  ? normalizedItem.size
                  : DEFAULT_BUTTON_SIZE;
              return {
                ...(e.usesModelBinding || e.isTemperatureHumidityMode
                  ? normalizedItem
                  : withFixedLightEffects2(normalizedItem)),
                size: size,
                visible:
                  e.isVacuumShortcutMode || e.isCoverMode ? normalizedItem.visible !== false : true,
                icon: normalizedItem.icon || e.defaultIcon,
                ...(e.usesModelBinding || e.isTemperatureHumidityMode
                  ? {}
                  : {
                      fadeDuration: normalizedItem.fadeDuration ?? 0.3,
                    }),
                ...(e.isCoverMode
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
                ...(e.isVacuumShortcutMode
                  ? {}
                  : {
                      clickAction: e.normalizeClickAction(normalizedItem.clickAction),
                    }),
  
  
                iconSize: e.isVacuumMode
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
      ...(e.structuredClone2.environment?.airConditioners || []),
      ...(e.structuredClone2.environment?.airers || []),
      ...(e.structuredClone2.environment?.fans || []),
      ...(e.structuredClone2.environment?.airPurifiers || []),
      ...(e.structuredClone2.environment?.waterHeaters || []),
    ])
      normalizedBatchItem.extraControls = (normalizedBatchItem.extraControls || []).map(
        ({ label: batchControlLabel, ...batchControlRest }: any) => ({
          ...batchControlRest,
          type: extraTypes2(batchControlRest.entityId)[0],
        }),
      );
    const buildEditableFieldList = () =>
      e.deviceKind === "smallcar"
        ? [
            ["cardWidth", "信息框宽度", "px"],
            ["cardFontSize", "文字大小", "px"],
            ["cardOpacity", "背景不透明度", "%"],
            ["buttonVisibility", "卡片显示", ""],
          ]
        : e.usesModelBinding
          ? [
              ...(e.isVacuumMode ? [] : [["icon", "图标", ""]]),
              ["size", e.isVacuumMode ? "状态框缩放" : "按钮大小", e.isVacuumMode ? "%" : "px"],
  
              ...(e.isVacuumMode ? [["iconSize", "文字大小", "px"]] : []),
              ["hitSize", "点击范围", "px"],
              ["buttonVisibility", "按钮显示", ""],
              ...(e.isVacuumMode ? [["backgroundOpacity", "背景不透明度", "%"]] : []),
              ...(e.isVacuumShortcutMode
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
        e.getItemList().map((baselinedItem: any) => [baselinedItem.id, structuredClone(baselinedItem)]),
      );
    const kindSessionsByKind = new Map();
    let auxDialogElement: any = null,
      refreshBatchButtons = () => {};
    function buildItemPayload(item: any) {
      return e.deviceKind === "smallcar"
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
        : e.usesModelBinding
          ? {
              icon: item.icon || e.defaultIcon,
              size: item.size ?? DEFAULT_BUTTON_SIZE,
              iconSize: item.iconSize ?? buttonIconSize(item.size ?? DEFAULT_BUTTON_SIZE),
              hitSize: item.hitSize ?? Math.max(DEFAULT_BUTTON_SIZE, item.size ?? DEFAULT_BUTTON_SIZE),
              ...(e.isVacuumMode
                ? {
                    backgroundOpacity: item.backgroundOpacity ?? 1,
                  }
                : {}),
              ...(e.isVacuumShortcutMode
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
    function listChangedFields(changedItem: any) {
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
    function openMetricsDialog(metricsTargetEntry: any) {
      const statusSource = metricsTargetEntry.statusSource;
      if (
        !statusSource ||
        e.isDisposed ||
        !e.isAccessAllowed ||
        e.isCameraEditing ||
        e.isCameraCommandPending ||
        auxDialogElement
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
      ((auxDialogElement = metricsDialogElement),
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
    function openCurtainGroupBatchApplyDialog(sourceGroup: any, linkedFieldProbe = false) {
      if (
        e.isDisposed ||
        !e.isAccessAllowed ||
        e.isCameraEditing ||
        e.isCameraCommandPending ||
        e.isRangeEditorOpen ||
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
      auxDialogElement = openBatchApply2({
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
                      (baselineItemsById.get(sourceGroup.id) as any)?.[sourceItem.key],
                  )
                  .map((candidateEntry) => candidateEntry.key),
              ]),
            ],
        onClose: () => {
          auxDialogElement = null;
        },
        onApply: async (nextMemberId: any, createGroupError: any) => {
          if (
            (await requestInteraction3dAccess2(),
            e.isDisposed || !e.isAccessAllowed || !auxDialogElement?.open)
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
          e.component,
          e.documentApi,
          e.viewElement.clientWidth,
          e.viewElement.clientHeight,
        );
        Object.assign(e.aspectBoxElement.style, {
          width: previewSize.width + "px",
          height: previewSize.height + "px",
        });
      },
      resizeObserver = new ResizeObserver(syncPreviewSize);
    resizeObserver.observe(e.viewElement);
    const disposeEditor = () => {
        e.isDisposed ||
          ((e.isDisposed = true),
          closeAddDialog(),
          closeAuxDialog(),
          e.subEditorHandle?.close(),
          resizeObserver.disconnect(),
          e.pickerGeneration++,
          e.pickerHandle?.close(),
          e.editorRuntime?.(),
          e.accessUnsubscribe?.(),
          e.editorDialogElement.remove(),
          e.element.remove(),
          document.dispatchEvent(new Event("hb-i3d-preview-scope")));
      },
      saveStatusElement = e.createElement("span", "i3d-save-status");
    saveStatusElement.setAttribute("role", "status");
    const saveButtonElement = e.createButton("保存配置", async () => {
      if (e.isSaving || e.isDisposed || !e.isAccessAllowed || e.isCameraEditing || e.isCameraCommandPending)
        return;
      for (const carRecord of e.structuredClone2.devices?.cars || []) {
        if (!carRecord.chargingStates) continue;
        const chargingMappingError = carChargingMappingError2(carRecord.chargingStates);
        if (chargingMappingError) {
          e.errorMessageElement.textContent =
            (carRecord.label || carRecord.deviceName || "汽车") + "：" + chargingMappingError;
          return;
        }
      }
      const structuredClone3 = structuredClone(e.structuredClone2);
      const runtimeCamera = e.isDirty;
      ((e.isSaving = true),
        (saveStatusElement.textContent = "保存中…"),
        (saveButtonElement.disabled = true),
        (e.errorMessageElement.textContent = ""));
      try {
        if ((await requestInteraction3dAccess2(), e.isDisposed)) return;
        (await e.onSaveConfig(structuredClone3),
          e.isDisposed ||
            (saveStatusElement.textContent =
              runtimeCamera === e.isDirty ? "已保存" : "已保存，另有新修改"));
      } catch (saveError: any) {
        e.isDisposed ||
          ((e.errorMessageElement.textContent = saveError.message),
          (saveStatusElement.textContent = ""));
      } finally {
        ((e.isSaving = false),
          e.isDisposed ||
            (saveButtonElement.disabled =
              !e.isAccessAllowed || e.isCameraEditing || e.isCameraCommandPending));
      }
    });
    ((saveButtonElement.className = "primary"),
      e.headerElement.append(
        e.createElement("strong", "", "3D " + e.editorKindTitle + "配置"),
        saveStatusElement,
        saveButtonElement,
        e.createButton("退出", disposeEditor),
      ),
      e.bodyElement.append(e.viewElement, e.panelElement),
      e.editorDialogElement.append(e.headerElement, e.bodyElement),
      document.body.append(e.editorDialogElement),
      e.editorDialogElement.addEventListener("cancel", (editorCancelEvent: any) => {
        (editorCancelEvent.preventDefault(), disposeEditor());
      }));
    const buildRuntimeProperties = () => {
      const floorId =
          e.isVacuumShortcutMode && e.findVacuumModel() ? e.findVacuumModel().floorId : e.floorSelection,
        camera =
          e.structuredClone2.floorCameras?.[floorId] ||
          (floorId === e.structuredClone2.floorSelection ? e.structuredClone2.camera : null);
      return {
        ...e.structuredClone2, floorSelection: floorId,
        ...(camera === undefined
          ? {}
          : {
              camera: camera,
            }),
      };
    };
    function refreshEditorPreview() {
      (buildCurtainGroupOptions(),
        e.isDirty++,
        e.isSaving || (saveStatusElement.textContent = ""),
        e.editorRuntime?.update(
          buildRuntimeProperties(),
          e.isVacuumShortcutMode && e.text
            ? "vacuum-room:" + e.vacuumId + ":" + e.text
            : e.describeGroupFieldValue(),
          {
            module: e.deviceKind, vacuumId: e.isVacuumShortcutMode ? e.vacuumId : "",
          },
        ),
        refreshBatchButtons());
    }
    function createSettingRow(rowContainer: any, rowLabel: any, rowControl: any) {
      rowControl.name = "i3d-" + e.deviceKind + "-" + (e.text || "scene") + "-" + rowLabel;
      const settingRowElement = e.createElement(
        "label",
        rowControl.type === "checkbox" ? "i3d-setting-toggle" : "",
      );
      return (
        settingRowElement.append(e.createElement("span", "", rowLabel), rowControl),
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
      const selectElement = e.createElement("select");
      for (const [optionValueKey, optionLabelText] of selectOptions) {
        const optionElement = e.createElement("option", "", optionLabelText);
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
        numberInputElement = e.createElement("input");
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
      const sizeInputElement = e.createElement("input");
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
      return (e.sceneMetadata?.floors || [])
        .filter((candidateFloorEntry: any) => candidateFloorEntry.id === e.floorSelection)
        .flatMap((floorWithModels: any) =>
          (e.usesModelBinding ? floorWithModels[e.collectionKey] || [] : floorWithModels.groups || [])
            .filter(
              (modelInFloor: any) =>
                !e.getItemList().some(
                  (existingModelItem: any) =>
                    existingModelItem.floorId === floorWithModels.id &&
                    existingModelItem[e.modelIdKey] === modelInFloor.id,
                ),
            )
            .map((addableModel: any) => ({
              floor: floorWithModels,
              group: addableModel,
              key: JSON.stringify([floorWithModels.id, addableModel.id]),
            })),
        );
    }
    async function switchEditorKind(nextDeviceKind: any, shouldOpenAddDialog = false) {
      if (
        e.isDisposed ||
        e.isSaving ||
        !e.isAccessAllowed ||
        e.isCameraEditing ||
        e.isCameraCommandPending ||
        e.isRangeEditorOpen ||
        nextDeviceKind === e.deviceKind ||
        !(
          e.includes
            ? ["climate", "fan", "purifier", "cover", "temperature-humidity"]
            : e.isDeviceKind
              ? ["nas", "television", "speaker", "water-heater", "airer", ...GENERIC_DEVICE_KINDS2]
              : ["vacuum", "vacuum-shortcut"]
        ).includes(nextDeviceKind)
      )
        return;
      (kindSessionsByKind.set(e.deviceKind, {
        selectedId: e.text,
        scrollTop: e.panelElement.scrollTop,
        baselines: baselineItemsById,
      }),
        e.isVacuumMode && (e.vacuumId = e.text || e.vacuumId),
        closeAddDialog(),
        closeAuxDialog(),
        e.pickerGeneration++,
        e.pickerHandle?.close(),
        (e.pickerHandle = null),
        e.num++,
        (e.isCameraEditing = false),
        (e.isCameraCommandPending = false),
        (e.pendingCameraDraft = null),
        (e.vacuumCameraMode = "focus"),
        e.applyKindFlags(nextDeviceKind),
        ensureItemCollections());
      const savedKindSession = kindSessionsByKind.get(nextDeviceKind);
      ((e.text = e.isVacuumMode ? e.vacuumId : savedKindSession?.selectedId || ""),
        e.isVacuumMode && e.findVacuumModel() && (e.floorSelection = e.findVacuumModel().floorId),
        (fieldDefs = buildEditableFieldList()),
        (baselineItemsById =
          savedKindSession?.baselines ||
          new Map(
            e.getItemList().map((baselineListItem: any) => [
              baselineListItem.id,
              structuredClone(baselineListItem),
            ]),
          )),
        (e.errorMessageElement.textContent = ""),
        renderPanel(),
        refreshEditorPreview(),
        (e.panelElement.scrollTop = savedKindSession?.scrollTop || 0),
        shouldOpenAddDialog && openAddDialog());
    }
    function closeAddDialog() {
      (e.addDialogState && (e.pickerGeneration++, e.pickerHandle?.close(), (e.pickerHandle = null)),
        e.addDialogState?.close(),
        e.addDialogState?.remove(),
        (e.addDialogState = null));
    }
    function openAddDialog(addDialogTriggerEvent: any = undefined) {
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
        openVacuumRoomPicker(addDialogTriggerEvent?.currentTarget || addDialogTriggerEvent?.target);
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
            e.deviceKind,
            (pickedDeviceKind: any) => {
              pickedDeviceKind !== e.deviceKind && switchEditorKind(pickedDeviceKind, true);
            },
          ).setAttribute("aria-label", "设备类型"));
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
    async function openVacuumRoomPicker(roomPickerTriggerEvent: any) {
      const vacuumModelRecord = e.findVacuumModel();
      if (!vacuumModelRecord) return;
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
          e.deviceKind,
          (pickedScopeKey: any) => {
            pickedScopeKey !== e.deviceKind && switchEditorKind(pickedScopeKey);
          },
        ),
        !e.sceneMetadata)
      )
        return;
      const vacuumModels = e.structuredClone2.devices?.vacuums || [];
      if (!vacuumModels.length) {
        e.panelElement.append(e.createElement("p", "i3d-note", "请先在扫地机配置中添加并绑定扫地机。"));
        return;
      }
      createSelectRow(
        scopeSectionElement,
        "所属扫地机",
        vacuumModels.map((vacuumModelOption: any) => [
          vacuumModelOption.id,
          vacuumModelOption.label || vacuumModelOption.deviceName || "扫地机",
        ]),
        e.vacuumId,
        (pickedVacuumId: any) => {
          ((e.vacuumId = pickedVacuumId),
            (e.text = ""),
            baselineItemsById.clear(),
            renderPanel(),
            refreshEditorPreview());
        },
      );
      const shortcutSectionElement = createConfigSection("快捷按钮");
      shortcutSectionElement.className += " i3d-compact-list";
      const shortcutHeaderRowElement = e.createElement("div", "i3d-config-list-row"),
        addShortcutButton = e.createButton("添加快捷指令", openAddDialog);
      if (
        (shortcutHeaderRowElement.append(addShortcutButton),
        shortcutSectionElement.append(shortcutHeaderRowElement),
        e.getItemList().some((existingShortcutProbe: any) => existingShortcutProbe.id === e.text) ||
          (e.text = e.getItemList()[0]?.id || ""),
        !e.text)
      ) {
        e.panelElement.append(
          e.createElement(
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
        e.getItemList().map((shortcutOptionItem: any) => [shortcutOptionItem.id, shortcutOptionItem.label]),
        e.text,
        (pickedShortcutId: any) => {
          ((e.text = pickedShortcutId),
            e.pickerGeneration++,
            e.pickerHandle?.close(),
            renderPanel(),
            refreshEditorPreview());
        },
      );
      const selectedShortcut = e.getItemList().find((matchedShortcut: any) => matchedShortcut.id === e.text),
        removeShortcutButton = e.createButton("删除此快捷按钮", () => {
          (e.pickerGeneration++,
            e.pickerHandle?.close(),
            e.setItemList(
              e.getItemList().filter(
                (removedShortcutProbe: any) => removedShortcutProbe !== selectedShortcut,
              ),
            ),
            (e.text = ""),
            renderPanel(),
            refreshEditorPreview());
        });
      removeShortcutButton.className = "i3d-remove-light";
      const bindingSectionElement = createConfigRow(createConfigSection("基础绑定")),
        shortcutNameInput = e.createElement("input");
      ((shortcutNameInput.value = selectedShortcut.label),
        (shortcutNameInput.maxLength = 128),
        (shortcutNameInput.onchange = () => {
          ((selectedShortcut.label = shortcutNameInput.value.trim() || "房间清扫"),
            renderPanel(),
            refreshEditorPreview());
        }),
        createSettingRow(bindingSectionElement, "名称", shortcutNameInput));
      const openShortcutPicker = (pickerName: any, shortcutPickerTrigger: any) => {
          const shortcutPickerGeneration = ++e.pickerGeneration;
          Promise.resolve(
            e.pickers[pickerName]({
              trigger: shortcutPickerTrigger, deviceKind: "vacuum-room",
              current: pickerName === "icon" ? selectedShortcut.icon : selectedShortcut.entityId,
              onSelect(pickedShortcutValue: any) {
                e.isDisposed ||
                  !e.isAccessAllowed ||
                  shortcutPickerGeneration !== e.pickerGeneration ||
                  !e.getItemList().includes(selectedShortcut) ||
                  (pickerName === "icon"
                    ? (selectedShortcut.icon = pickedShortcutValue)
                    : (selectedShortcut.entityId = pickedShortcutValue),
                  renderPanel(),
                  refreshEditorPreview());
              },
            }),
          )
            .then((shortcutPickerHandle) => {
              e.isDisposed || shortcutPickerGeneration !== e.pickerGeneration
                ? shortcutPickerHandle?.close()
                : (e.pickerHandle = shortcutPickerHandle);
            })
            .catch((shortcutPickerError) => {
              e.errorMessageElement.textContent = shortcutPickerError.message;
            });
        },
        entityPickerButton = e.createButton(selectedShortcut.entityId || "选择实体（全部）", () =>
          openShortcutPicker("entity", entityPickerButton),
        );
      ((entityPickerButton.className = "i3d-picker-button"),
        (entityPickerButton.title = selectedShortcut.entityId || ""),
        createSettingRow(bindingSectionElement, "指令实体", entityPickerButton));
      const shortcutAppearanceSectionElement = createConfigSection("按钮外观"),
        shortcutAppearanceRowElement = createConfigRow(shortcutAppearanceSectionElement),
        iconPickerButton = e.createButton("", () => openShortcutPicker("icon", iconPickerButton));
      iconPickerButton.className = "i3d-picker-button i3d-icon-picker-button";
      const iconPreviewElement = e.createElement("i");
      ((iconPreviewElement.style.maskImage =
        "url('/static/vendor/mdi/7.4.47/svg/" +
        (selectedShortcut.icon || e.defaultIcon).slice(4) +
        ".svg')"),
        (iconPreviewElement.style.webkitMaskImage = iconPreviewElement.style.maskImage),
        iconPickerButton.append(
          iconPreviewElement,
          e.createElement("span", "", selectedShortcut.icon || e.defaultIcon),
        ),
        createSettingRow(shortcutAppearanceRowElement, "图标", iconPickerButton));
      const shortcutVisibilityRowElement = e.createElement(
        "div",
        "i3d-button-visibility-row i3d-shortcut-visibility",
      );
      shortcutAppearanceSectionElement.append(shortcutVisibilityRowElement);
      for (const [visibilityPropertyKey, visibilityToggleLabel] of [
        ["hiddenClickable", "隐藏（可点击）"],
        ["buttonHidden", "隐藏（不可点击）"],
      ]) {
        const shortcutVisibilityCheckboxElement = e.createElement("input");
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
        const hiddenCheckboxElement = e.createElement("input");
        ((hiddenCheckboxElement.type = "checkbox"),
          (hiddenCheckboxElement.checked = selectedShortcut[hiddenPropertyKey] === true),
          (hiddenCheckboxElement.onchange = () => {
            ((selectedShortcut[hiddenPropertyKey] = hiddenCheckboxElement.checked),
              refreshEditorPreview());
          }),
          createSettingRow(shortcutVisibilityRowElement, hiddenToggleLabel, hiddenCheckboxElement));
      }
      const shortcutSizeGridElement = e.createElement(
          "div",
          "i3d-coordinate-grid i3d-size-grid i3d-shortcut-size-grid",
        ),
        shortcutAdvancedDetailsElement = e.createElement("details");
      (shortcutAdvancedDetailsElement.append(
        e.createElement("summary", "", "更多尺寸设置"),
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
        shortcutPositionGridElement = e.createElement("div", "i3d-coordinate-grid");
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
          e.createElement(
            "p",
            "i3d-note",
            "拖动按钮调整位置，拖动空白处旋转户型。点击只执行绑定指令，不弹窗、不聚焦。",
          ),
        ));
      const shortcutBatchSectionElement = e.createElement(
          "section",
          "navigation-batch-section i3d-light-batch",
        ),
        shortcutBatchApplyButton = e.createButton("一键应用到其他快捷按钮", () =>
          openCurtainGroupBatchApplyDialog(selectedShortcut),
        );
      (shortcutBatchSectionElement.append(
        e.createElement("h4", "", e.deviceKind === "smallcar" ? "卡片设置一键应用" : "图标设置一键应用"),
        shortcutBatchApplyButton,
      ),
        e.panelElement.append(shortcutBatchSectionElement),
        (refreshBatchButtons = () => {
          shortcutBatchApplyButton.disabled = !e.isAccessAllowed;
        }),
        refreshBatchButtons(),
        createConfigSection("绑定管理").append(removeShortcutButton));
    }
    function createConfigSection(sectionTitle: any) {
      const configSectionElement = e.createElement("section", "i3d-config-section");
      return (
        configSectionElement.append(e.createElement("h4", "", sectionTitle)),
        e.panelElement.append(configSectionElement),
        configSectionElement
      );
    }
    function createConfigRow(parentSectionElement: any) {
      const configRowElement = e.createElement("div", "i3d-config-row");
      return (parentSectionElement.append(configRowElement), configRowElement);
    }
    function renderStatusRuleSection(
      statusSettingsSectionElement: any,
      statusItem: any,
      { deviceId: statusDeviceId = statusItem.deviceId, standardOnly: isStandardOnly = false } = {},
    ) {
      ((statusSettingsSectionElement.className += " i3d-status-settings"),
        statusSettingsSectionElement.append(
          e.createElement(
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
                  active: reminderValue,
                  inactive: statusChoiceDefinition.options.find(
                    (nonReminderChoice) => nonReminderChoice.value !== reminderValue,
                  )!.value,
                };
              },
        readHealthRules = () =>
          Array.isArray(statusItem.statusRules?.health)
            ? statusItem.statusRules.health
            : statusItem.statusRules?.health
              ? [statusItem.statusRules.health]
              : [],
        resolveCatalogEntry = (probedEntityId: any) =>
          e.entities.find((entityProbe: any) => entityProbe.entityId === probedEntityId) || {
            entityId: probedEntityId,
          },
        resolveEntityState = (stateEntityId: any) =>
          e.latestStates?.get?.(stateEntityId) ??
          e.latestStates?.[stateEntityId] ??
          e.states?.get?.(stateEntityId) ??
          e.states?.[stateEntityId],
        refreshStatusRules = () => {
          const scrollTop = e.panelElement.scrollTop;
          (refreshEditorPreview(), renderPanel(), (e.panelElement.scrollTop = scrollTop));
        },
        canRefreshItem = (itemGeneration: any) =>
          !e.isDisposed &&
          e.isAccessAllowed &&
          itemGeneration === e.pickerGeneration &&
          e.getItemList().includes(statusItem),
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
          if (!canRefreshItem(dialogGeneration) || e.addDialogState) return;
          const statusDialogElement = e.createElement("dialog", "settings-dialog i3d-add-dialog");
          ((e.addDialogState = statusDialogElement),
            statusDialogElement.setAttribute("aria-label", "设置指示灯条件"));
          const statusDialogHeadingElement = e.createElement("div", "dialog-heading");
          statusDialogHeadingElement.append(e.createElement("h2", "", "设置指示灯条件"));
          const statusDialogBodyElement = e.createElement("div", "i3d-add-dialog-body"),
            catalogEntry = resolveCatalogEntry(statusEntity.entityId),
            entityState = resolveEntityState(statusEntity.entityId),
            entityStateText = (entityState?.newState || entityState)?.state;
          (statusDialogBodyElement.append(
            e.createElement("strong", "", catalogEntry.name || statusEntity.entityId),
            e.createElement(
              "p",
              "i3d-note",
              "此实体使用自定义状态。指定两个匹配值，其他值显示为未知。",
            ),
          ),
            entityStateText != null &&
              statusDialogBodyElement.append(
                e.createElement("p", "i3d-note", "HA 当前值：" + entityStateText),
              ));
          const activeValueInputElement = e.createElement("input"),
            inactiveValueInputElement = e.createElement("input");
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
          const statusDialogErrorElement = e.createElement("p", "i3d-error");
          (statusDialogErrorElement.setAttribute("role", "status"),
            statusDialogBodyElement.append(statusDialogErrorElement));
          const confirmStatusValuesButton = e.createButton("确定", () => {
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
          const statusDialogActionsElement = e.createElement("div", "dialog-actions");
          (statusDialogActionsElement.append(
            e.createButton("取消", closeAddDialog),
            confirmStatusValuesButton,
          ),
            statusDialogElement.append(
              statusDialogHeadingElement,
              statusDialogBodyElement,
              statusDialogActionsElement,
            ),
            e.editorDialogElement.append(statusDialogElement),
            statusDialogElement.addEventListener("cancel", (statusDialogCancelEvent: any) => {
              (statusDialogCancelEvent.preventDefault(), closeAddDialog());
            }),
            statusDialogElement.showModal());
        },
        openStatusEntityPicker = async (pickerRuleKind: any, pickerRuleIndex: any, statusPickerGeneration: any) => {
          if (!e.isAccessAllowed || e.isDisposed || !statusDeviceId) return;
          const ruleRefreshGeneration = ++e.pickerGeneration;
          (e.pickerHandle?.close(), (e.errorMessageElement.textContent = ""));
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
            if (!e.pickers?.entity) throw new Error("实体选择器尚未准备好，请刷新页面。");
            const entity2 = await e.pickers.entity({
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
                  (e.entities = [
                    ...e.entities.filter(
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
            canRefreshItem(ruleRefreshGeneration) ? (e.pickerHandle = entity2) : entity2?.close();
          } catch (statusPickerError: any) {
            canRefreshItem(ruleRefreshGeneration) &&
              (e.errorMessageElement.textContent = statusPickerError.message);
          }
        },
        writeRuleRow = (rowRuleKind: any, rowRuleIndex: any, ruleEntity: any) => {
          const ruleCatalogEntry = resolveCatalogEntry(ruleEntity?.entityId),
            statusEntityIdText = ruleCatalogEntry.name || ruleEntity?.entityId || "未选择实体",
            statusRuleRowElement = e.createElement("div", "i3d-status-rule"),
            ruleValueInputElement = e.createButton(
              "",
              () => void openStatusEntityPicker(rowRuleKind, rowRuleIndex, ruleValueInputElement),
            );
          if (
            ((ruleValueInputElement.className = "i3d-picker-button"),
            ruleValueInputElement.append(
              e.createElement("span", "", ruleEntity ? statusEntityIdText : "不设置 · 选择实体"),
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
            const ruleDefaultButton = e.createElement("select");
            ruleDefaultButton.setAttribute(
              "aria-label",
              rowRuleKind === "power"
                ? statusEntityIdText + "亮灯条件"
                : statusEntityIdText + "提醒条件",
            );
            for (const { value: optionValue, label: optionLabel } of choiceDefinition.options) {
              const reminderOptionElement = e.createElement(
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
                e.createElement("span", "i3d-note", "状态暂不可识别，请重新选择实体。"),
              );
            else {
              const ruleActionsElement = e.createButton("设置匹配条件", () =>
                openCustomStatusDialog(rowRuleKind, rowRuleIndex, ruleEntity, ++e.pickerGeneration),
              );
              (ruleActionsElement.setAttribute(
                "aria-label",
                "设置" + statusEntityIdText + "匹配条件",
              ),
                statusRuleRowElement.append(ruleActionsElement));
            }
          }
          const pickerCloseButton = e.createButton("×", () => {
            (e.pickerGeneration++,
              e.pickerHandle?.close(),
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
        e.createElement("p", "i3d-status-label", "电源状态（可选）"),
      ),
        writeRuleRow("power", 0, statusItem.statusRules?.power),
        statusSettingsSectionElement.append(e.createElement("p", "i3d-status-label", "提醒条件")),
        readHealthRules().forEach((healthRuleEntity: any, healthRuleIndex: any) =>
          writeRuleRow("health", healthRuleIndex, healthRuleEntity),
        ));
      const addRuleButtonElement = e.createButton(
        "＋ 添加提醒",
        () => void openStatusEntityPicker("health", readHealthRules().length, addRuleButtonElement),
      );
      ((addRuleButtonElement.disabled = !statusDeviceId),
        (addRuleButtonElement.className = "i3d-status-add"),
        statusSettingsSectionElement.append(addRuleButtonElement),
        statusSettingsSectionElement.append(
          e.createElement(
            "p",
            "i3d-note",
            "任一提醒条件触发时优先亮橙灯；没有提醒时，按电源状态亮灯或熄灭。不设置电源状态则只看提醒条件。",
          ),
        ));
    }
    function openCurtainGroupDialog(onCancel: any) {
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
    function renderCurtainGroupSection(curtainGroup: any) {
      const groupEntrySectionElement = createConfigSection("组合入口"),
        groupNameRowElement = createConfigRow(groupEntrySectionElement),
        groupNameInputElement = e.createElement("input");
      ((groupNameInputElement.value = curtainGroup.label || "双层窗帘"),
        (groupNameInputElement.maxLength = 128),
        groupNameInputElement.addEventListener("change", () => {
          ((curtainGroup.label = groupNameInputElement.value.trim() || "双层窗帘"),
            refreshEditorPreview());
        }),
        createSettingRow(groupNameRowElement, "组合名称", groupNameInputElement),
        groupEntrySectionElement.append(
          e.createElement(
            "p",
            "i3d-note",
            "双图标各自显示状态，共用点击范围。名称只用于配置和弹窗，不在户型上显示。",
          ),
        ));
      const memberItemList = curtainGroup.memberIds.map((memberId: any) =>
          e.getItemList().find((memberItemProbe: any) => memberItemProbe.id === memberId),
        ),
        memberSectionElement = createConfigSection("组合成员"),
        memberActionsElement = e.createElement("div", "i3d-group-member-actions");
      (memberSectionElement.append(memberActionsElement),
        memberItemList.forEach((memberItem: any, memberIndex: any) =>
          memberActionsElement.append(
            e.createButton(
              (memberIndex === 0 ? "左图标 / 上控制区" : "右图标 / 下控制区") +
                "：" +
                (memberItem.label || "窗帘") +
                " · 编辑",
              () => {
                ((e.text = memberItem.id),
                  (e.selectedCurtainGroupId = memberItem.id),
                  refreshEditorPreview(),
                  renderPanel());
              },
            ),
          ),
        ),
        memberActionsElement.append(
          e.createButton("交换两层顺序", () => {
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
          e.createElement(
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
          e.createElement(
            "p",
            "i3d-note",
            "开关类行为：任一窗帘打开或半开时关闭两层，全部关闭时打开两层；运动中点击先停止。仅打开时执行所选聚焦或弹窗。",
          ),
        ));
      const visibilityRowElement = e.createElement("div", "i3d-button-visibility-row");
      behaviorSectionElement.append(visibilityRowElement);
      for (const [visibilityFieldKey, visibilityFieldLabel, oppositeVisibilityKey] of [
        ["hiddenClickable", "隐藏（可点击）", "buttonHidden"],
        ["buttonHidden", "隐藏（不可点击）", "hiddenClickable"],
      ]) {
        const visibilityCheckboxElement = e.createElement("input");
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
        sizeGridElement = e.createElement("div", "i3d-coordinate-grid i3d-size-grid"),
        sizeDetailsElement = e.createElement("details");
      (sizeDetailsElement.append(e.createElement("summary", "", "更多尺寸设置"), sizeGridElement),
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
        buttonPositionGridElement = e.createElement("div", "i3d-coordinate-grid");
      buttonPositionSectionElement.append(buttonPositionGridElement);
      const anchorMemberItem = memberItemList[0],
        anchorCurtainModel = e.sceneMetadata.floors
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
        e.createButton("一键应用到其他组合窗帘", () =>
          openCurtainGroupBatchApplyDialog(curtainGroup, true),
        ),
      ),
        buttonPositionSectionElement.append(
          e.createButton("恢复跟随第一层入口", () => {
            for (const positionFieldName of ["x", "y", "height"])
              delete curtainGroup[positionFieldName];
            (refreshEditorPreview(), renderPanel());
          }),
        ));
      const focusSectionElement = createConfigSection("聚焦视角");
      focusSectionElement.className += " i3d-focus-settings";
      const focusActionsElement = e.createElement("div", "i3d-focus-actions");
      focusSectionElement.append(focusActionsElement);
      const runGroupCameraCommand = async (cameraCommandName: any, cameraCommandPayload: any = undefined) => {
        const cameraCommandGeneration = ++e.num,
          isFocalLengthCommand = cameraCommandName === "focus-focal-length",
          previousCameraQueue = e.cameraCommandQueue;
        let resolveCameraCommand;
        ((e.cameraCommandQueue = new Promise((finishCameraCommand) => {
          resolveCameraCommand = finishCameraCommand;
        })),
          isFocalLengthCommand || ((e.isCameraCommandPending = true), renderPanel()));
        try {
          if ((await previousCameraQueue, e.isDisposed || cameraCommandGeneration !== e.num)) return;
          const focusCommand = await e.editorRuntime.focusCommand(
            cameraCommandName,
            curtainGroupEntryId2(curtainGroup),
            cameraCommandPayload,
          );
          if (e.isDisposed || cameraCommandGeneration !== e.num) return;
          cameraCommandName === "save-light-camera"
            ? ((curtainGroup.focusCamera = focusCommand.camera),
              (e.isCameraEditing = false),
              (e.pendingCameraDraft = null),
              refreshEditorPreview())
            : cameraCommandName === "cancel-light-camera"
              ? ((e.isCameraEditing = false), (e.pendingCameraDraft = null))
              : ((e.isCameraEditing = true), (e.pendingCameraDraft = focusCommand.camera));
        } catch (cameraError: any) {
          e.isDisposed || (e.errorMessageElement.textContent = cameraError.message);
        } finally {
          (resolveCameraCommand!(),
            !e.isDisposed &&
              cameraCommandGeneration === e.num &&
              !isFocalLengthCommand &&
              ((e.isCameraCommandPending = false), renderPanel()));
        }
      };
      if (e.isCameraEditing) {
        const entrySectionElement = e.createButton(
          "保存视角",
          () => void runGroupCameraCommand("save-light-camera"),
        );
        ((entrySectionElement.className = "primary"),
          focusActionsElement.append(
            entrySectionElement,
            e.createButton("取消调整", () => void runGroupCameraCommand("cancel-light-camera")),
          ));
        const projectionGroupElement = e.createElement("div", "i3d-focus-actions");
        (projectionGroupElement.setAttribute("role", "group"),
          projectionGroupElement.setAttribute("aria-label", "聚焦投影"),
          focusSectionElement.append(projectionGroupElement));
        for (const [projectionMode, projectionModeLabel] of [
          ["orthographic", "正交"],
          ["perspective", "透视"],
        ]) {
          const projectionButtonElement = e.createButton(
            projectionModeLabel,
            () => void runGroupCameraCommand("focus-projection", projectionMode),
          );
          (projectionButtonElement.setAttribute(
            "aria-pressed",
            String((e.pendingCameraDraft?.mode || "orthographic") === projectionMode),
          ),
            projectionGroupElement.append(projectionButtonElement));
        }
        const focalLengthInputElement = createNumberRow(
          focusSectionElement,
          "焦段（mm）",
          Math.round(e.pendingCameraDraft?.focalLength || 50),
          18,
          120,
          1,
          (nextFocalLength: any) => void runGroupCameraCommand("focus-focal-length", nextFocalLength),
        );
        focalLengthInputElement.disabled = e.pendingCameraDraft?.mode !== "perspective";
      } else {
        focusActionsElement.append(
          e.createButton(
            curtainGroup.focusCamera ? "调整视角" : "设置视角",
            () => void runGroupCameraCommand("edit-light-camera"),
          ),
          e.createButton("预览聚焦", () => void runGroupCameraCommand("preview-light-camera")),
        );
        const resetFocusButtonElement = e.createButton("恢复自动聚焦", async () => {
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
        e.createElement(
          "p",
          "i3d-note",
          "解除组合仅移除组合关系，恢复两层各自的入口、位置、聚焦视角与图标；不会删除模型或设备。",
        ),
        e.createButton("解除组合", () => {
          ((e.structuredClone2.environment.curtainGroups = e.getCurtainGroupList().filter(
            (remainingGroupProbe: any) => remainingGroupProbe.id !== curtainGroup.id,
          )),
            (e.text = curtainGroup.memberIds[0]),
            (e.selectedCurtainGroupId = ""),
            refreshEditorPreview(),
            renderPanel());
        }),
      );
      for (const lockedControlElement of e.panelElement.querySelectorAll("input, select, button"))
        (e.isCameraCommandPending ||
          (e.isCameraEditing && !lockedControlElement.closest(".i3d-focus-settings"))) &&
          (lockedControlElement.disabled = true);
    }
    function renderExtraControlsSection() {
      const labelListSectionElement = createConfigSection("环境标签列表"),
        labelListRowElement = createConfigRow(labelListSectionElement),
        floorLabelList = e.getItemList().filter(
          (floorLabelProbe: any) => floorLabelProbe.floorId === e.floorSelection,
        ),
        currentFloor = e.sceneMetadata.floors.find((labelFloor: any) => labelFloor.id === e.floorSelection);
      floorLabelList.some((existingLabelProbe: any) => existingLabelProbe.id === e.text) ||
        (e.text = floorLabelList[0]?.id || "");
      const addLabelButtonElement = e.createButton("添加环境标签", () => {
        if (!currentFloor || !e.isAccessAllowed) return;
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
        (e.getItemList().push(newLabelDraft),
          (e.text = newLabelDraft.id),
          renderPanel(),
          refreshEditorPreview());
      });
      ((addLabelButtonElement.className = "primary"),
        (addLabelButtonElement.disabled = !e.isAccessAllowed),
        labelListRowElement.append(addLabelButtonElement),
        labelListSectionElement.append(
          e.createElement(
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
            e.text,
            (pickedLabelId: any) => {
              ((e.text = pickedLabelId), refreshEditorPreview(), renderPanel());
            },
          ));
      const selectedFloorLabel = floorLabelList.find((matchedLabel: any) => matchedLabel.id === e.text);
      if (!selectedFloorLabel) {
        e.panelElement.append(
          labelListSectionElement,
          e.createElement("p", "i3d-note", "当前楼层还没有环境标签，请点击“添加环境标签”。"),
        );
        return;
      }
      const groupHiddenClickableCheckbox = createConfigSection("显示内容（含文字）"),
        groupButtonHiddenCheckbox = e.createElement("input");
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
      const showMetricNamesCheckboxElement = e.createElement("input");
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
          e.createElement("p", "i3d-note", "关闭后只显示图标、数值和单位。"),
        ));
      const renderEntityBindingRow = ({ key: entityFieldKey, label: entityFieldLabel }: any) => {
        const entityIdFieldName = entityFieldKey + "EntityId",
          groupSizeDetailsElement = e.createButton(
            e.entities.find(
              (catalogEntryProbe: any) =>
                catalogEntryProbe.entityId === selectedFloorLabel[entityIdFieldName],
            )?.name ||
              selectedFloorLabel[entityIdFieldName] ||
              "选择" + entityFieldLabel + "实体",
            async () => {
              const groupSizeGridElement = ++e.pickerGeneration;
              e.errorMessageElement.textContent = "";
              try {
                if (!e.pickers?.entity) throw new Error("实体选择器尚未准备好，请刷新页面。");
                e.pickerHandle?.close?.();
                const entity3 = await e.pickers.entity({
                  trigger: groupSizeDetailsElement,
                  current: selectedFloorLabel[entityIdFieldName] || "", deviceKind: "temperature-humidity",
                  domain: entityFieldKey,
                  title: "选择" + entityFieldLabel + "实体",
                  onSelect(pickedEntityId: any) {
                    e.isDisposed ||
                      !e.isAccessAllowed ||
                      groupSizeGridElement !== e.pickerGeneration ||
                      !e.getItemList().includes(selectedFloorLabel) ||
                      ((selectedFloorLabel[entityIdFieldName] = pickedEntityId || ""),
                      refreshEditorPreview(),
                      renderPanel());
                  },
                });
                e.isDisposed || !e.isAccessAllowed || groupSizeGridElement !== e.pickerGeneration
                  ? entity3?.close()
                  : (e.pickerHandle = entity3);
              } catch (pickedGroupIconSizeValue: any) {
                e.isDisposed || (e.errorMessageElement.textContent = pickedGroupIconSizeValue.message);
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
          e.createElement("p", "i3d-note", "电量显示在名称右侧；传感器均可选，未绑定的项目不显示。"),
        ));
      for (const pickedGroupHitSizeValue of ENVIRONMENT_METRICS2)
        renderEntityBindingRow(pickedGroupHitSizeValue);
      const labelPositionSectionElement = createConfigSection("位置与大小"),
        groupPositionGridElement = e.createElement("div", "i3d-coordinate-grid");
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
      renderAirPurifierBindingSection(labelPositionSectionElement, selectedFloorLabel, {
        width: "size",
        font: "iconSize",
        opacity: "opacity",
      });
      const labelBatchSectionElement = e.createElement(
          "section",
          "navigation-batch-section i3d-light-batch",
        ),
        labelBatchHeadingElement = e.createElement("h4"),
        targetCountElement = e.createElement("span"),
        renderEntityList = () =>
          e.getItemList().filter(
            (sameFloorLabelProbe: any) =>
              sameFloorLabelProbe !== selectedFloorLabel &&
              sameFloorLabelProbe.floorId === selectedFloorLabel.floorId,
          );
      labelBatchHeadingElement.append(
        e.createElement("span", "", "环境标签设置一键应用"),
        targetCountElement,
      );
      const applyToLabelGroupButton = e.createButton("一键应用到其他环境标签", () =>
        openLabelBatchApplyDialog(selectedFloorLabel),
      );
      ((targetCountElement.textContent = renderEntityList().length + " 个同层目标"),
        labelBatchSectionElement.append(labelBatchHeadingElement, applyToLabelGroupButton));
      const manageSectionElement = createConfigSection("绑定管理");
      (manageSectionElement.append(
        e.createButton("删除此环境标签", () => {
          (e.setItemList(
            e.getItemList().filter((otherLabelProbe: any) => otherLabelProbe.id !== selectedFloorLabel.id),
          ),
            (e.text = ""),
            refreshEditorPreview(),
            renderPanel());
        }),
      ),
        e.panelElement.append(
          labelListSectionElement,
          groupHiddenClickableCheckbox,
          labelPositionSectionElement,
          labelBatchSectionElement,
          manageSectionElement,
        ));
    }
    function renderAirPurifierBindingSection(sizeFieldContainer: any, sizeFieldTarget: any, sizeFieldOptions: any) {
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
          e.isTemperatureHumidityMode,
        );
      const layoutRowElement = e.isTemperatureHumidityMode ? createConfigRow(sizeFieldContainer) : null;
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
          e.createElement("p", "i3d-note", "自动随宽度排列；固定每行项数时，窄框内容会自动换行适配。"),
        ));
    }
    function openLabelBatchApplyDialog(sourceLabelItem: any) {
      e.isDisposed ||
        !e.isAccessAllowed ||
        auxDialogElement ||
        (auxDialogElement = openBatchApply2({
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
            auxDialogElement = null;
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
    function renderPanel() {
      ((e.refreshEffectSettings = () => {}),
        (e.bathEffectEditorHandle = () => {}),
        (e.redrawBathEffects = () => {}),
        (e.refreshAirflowStatus = () => {}),
        (e.renderAirflowSection = () => {}),
        (refreshBatchButtons = () => {}),
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
            ((refreshBatchButtons = () => {
              const lightChangeCount = listChangedFields(vector).length;
              ((batchCountElement.textContent = lightChangeCount + " 项修改"),
                (lightBatchApplyButton.disabled =
                  !e.isAccessAllowed || e.isCameraEditing || e.isCameraCommandPending));
            }),
              refreshBatchButtons(),
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
            ((refreshBatchButtons = () => {
              const effectChangeCount = listChangedFields(vector).length;
              ((effectBatchCountElement.textContent = effectChangeCount + " 项修改"),
                (effectBatchApplyButton.disabled =
                  !e.isAccessAllowed ||
                  e.isCameraEditing ||
                  e.isCameraCommandPending ||
                  e.isRangeEditorOpen));
            }),
              refreshBatchButtons(),
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
  e.saveButtonElement = saveButtonElement;
  e.saveStatusElement = saveStatusElement;
  Object.assign(e, {
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
  Object.defineProperty(e, "auxDialogElement", {
    get: () => auxDialogElement,
    set: (value: any) => {
      auxDialogElement = value;
    },
    enumerable: true,
    configurable: true,
  });
}
