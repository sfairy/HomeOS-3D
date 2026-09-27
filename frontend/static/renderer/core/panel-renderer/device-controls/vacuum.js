/*
 * 设备控件区块：扫地机详情（地图、清洁模式、耗材与交互式 3D 地图入口）。
 */

import { popupPlacement } from "../../../../bridge/popup-placement.js?v=2609271226";
import { vacuumMapImageSource } from "../../registry.js?v=2609271226";
import { resolveStateEntry } from "../../../../utils/state-entry.js?v=2609271226";
import { selectedRelatedEntityIds } from "../../../../shared/related-entities.js?v=2609271226";
import {
  relatedVacuumBatteryEntity,
  vacuumActionService,
  vacuumBatteryPercent,
  vacuumSupportedActions
} from "../../../controls/vacuum-runtime.js?v=2609271226";
import { relatedDeviceEntity } from "../../../controls/cover-runtime.js?v=2609271226";
import { componentDialogTitle } from "../primitives.js?v=2609271226";

export const vacuumDetailsMethods = {
  /**
   * 打开扫地机详情弹窗（地图、清扫控制、耗材与电量）。
   */
  showVacuumDetails(
    vacuumControlComponent,
    { preview: isPreview = false, interaction3d: interaction3dOptions = null } = {}
  ) {
    const vacuumPrimaryEntityId = vacuumControlComponent.bindings?.entity?.entityId;
    if (!vacuumPrimaryEntityId) {
      throw new Error("该扫地机器人控件没有关联实体。");
    }
    const selectedEntityIds = selectedRelatedEntityIds(vacuumControlComponent);
    this.closeRuntimeDialog();
    const vacuumPrimaryState = this.states.get(vacuumPrimaryEntityId);
    let vacuumState = resolveStateEntry(vacuumPrimaryState, {
      state: "unknown",
      attributes: {}
    });
    const vacuumDialogElement = document.createElement("dialog");
    vacuumDialogElement.className = "hb-entity-details-dialog vacuum-details";
    if (interaction3dOptions) {
      vacuumDialogElement.classList.add("i3d-vacuum-details");
    }
    const vacuumCardElement = document.createElement("div");
    vacuumCardElement.className = "hb-entity-details-card";
    vacuumCardElement.classList.add("hb-vacuum-details-card");
    const vacuumHeadingElement = document.createElement("div");
    vacuumHeadingElement.className = "hb-entity-details-heading";
    const vacuumTitleRow = document.createElement("div");
    const vacuumTitleText = document.createElement("strong");
    const vacuumDisplayName =
      String(vacuumState.attributes?.friendly_name || "扫地机器人").replace(/^\d+/, "") ||
      "扫地机器人";
    vacuumTitleText.textContent = componentDialogTitle(vacuumControlComponent, vacuumDisplayName);
    const vacuumSubtitleElement = document.createElement("span");
    vacuumSubtitleElement.className = "hb-vacuum-details-subtitle";
    const vacuumCloseButton = document.createElement("button");
    vacuumCloseButton.type = "button";
    vacuumCloseButton.setAttribute("aria-label", "关闭扫地机器人详情");
    vacuumCloseButton.textContent = "×";
    vacuumTitleRow.append(vacuumTitleText, vacuumSubtitleElement);
    vacuumHeadingElement.append(vacuumTitleRow, vacuumCloseButton);
    const vacuumLayoutElement = document.createElement("div");
    vacuumLayoutElement.className = "hb-vacuum-details-layout";
    const vacuumOverviewElement = document.createElement("section");
    vacuumOverviewElement.className = "hb-vacuum-details-overview";
    const vacuumVisualElement = document.createElement("div");
    vacuumVisualElement.className = "hb-vacuum-visual";
    const vacuumBatteryRingElement = document.createElement("div");
    vacuumBatteryRingElement.className = "hb-vacuum-battery-ring";
    const vacuumRobotElement = document.createElement("div");
    vacuumRobotElement.className = "hb-vacuum-robot";
    const vacuumLidarElement = document.createElement("i");
    vacuumLidarElement.className = "hb-vacuum-robot-lidar";
    const vacuumSensorElement = document.createElement("i");
    vacuumSensorElement.className = "hb-vacuum-robot-sensor";
    const vacuumBumperElement = document.createElement("i");
    vacuumBumperElement.className = "hb-vacuum-robot-bumper";
    const vacuumBrushElement = document.createElement("i");
    vacuumBrushElement.className = "hb-vacuum-robot-brush";
    const vacuumLeftMopElement = document.createElement("i");
    vacuumLeftMopElement.className = "hb-vacuum-robot-mop left";
    const vacuumRightMopElement = document.createElement("i");
    vacuumRightMopElement.className = "hb-vacuum-robot-mop right";
    vacuumRobotElement.append(
      vacuumLidarElement,
      vacuumSensorElement,
      vacuumBumperElement,
      vacuumBrushElement,
      vacuumLeftMopElement,
      vacuumRightMopElement
    );
    const vacuumBatteryElement = document.createElement("div");
    vacuumBatteryElement.className = "hb-vacuum-battery";
    const vacuumBatteryValueElement = document.createElement("strong");
    const vacuumBatteryLabelElement = document.createElement("small");
    vacuumBatteryLabelElement.textContent = "电量";
    vacuumBatteryElement.append(vacuumBatteryValueElement, vacuumBatteryLabelElement);
    vacuumBatteryRingElement.append(vacuumRobotElement);
    vacuumHeadingElement.append(vacuumBatteryElement);
    const vacuumVisualStatusElement = document.createElement("span");
    vacuumVisualStatusElement.className = "hb-vacuum-visual-status";
    vacuumVisualElement.append(vacuumBatteryRingElement, vacuumVisualStatusElement);
    const vacuumStatsElement = document.createElement("div");
    vacuumStatsElement.className = "hb-vacuum-details-stats";
    /**
     * 创建一行扫地机统计项（图标 + 数值 + 标签）并挂到统计容器上。
     */
    const createVacuumStat = (statLabel, statIcon) => {
      const statElement = document.createElement("div");
      const statValueRow = document.createElement("span");
      statValueRow.className = "hb-vacuum-details-stat-value";
      const statIconElement = document.createElement("i");
      statIconElement.textContent = statIcon;
      statIconElement.setAttribute("aria-hidden", "true");
      const statValueElement = document.createElement("strong");
      const statLabelElement = document.createElement("small");
      statLabelElement.textContent = statLabel;
      statValueRow.append(statIconElement, statValueElement);
      statElement.append(statValueRow, statLabelElement);
      vacuumStatsElement.append(statElement);
      return statValueElement;
    };
    const vacuumAreaValue = createVacuumStat("本次面积", "◇");
    const vacuumDurationValue = createVacuumStat("清扫时长", "◷");
    // 机器图形两处都画，只是排法不同：2D 详情弹窗里它与统计并排（左机器、右读数），
    vacuumOverviewElement.append(vacuumVisualElement, vacuumStatsElement);
    const vacuumControlsElement = document.createElement("section");
    vacuumControlsElement.className = "hb-vacuum-details-controls";
    const vacuumActionsElement = document.createElement("div");
    vacuumActionsElement.className = "hb-vacuum-details-actions";
    /**
     * 创建一个扫地机动作按钮（开始 / 暂停 / 回充 …）并挂到动作区。
     */
    const createVacuumActionButton = (
      actionLabel,
      actionDescription,
      actionIcon,
      actionService
    ) => {
      const actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.dataset.service = actionService;
      actionButton.disabled = isPreview;
      const actionIconElement = document.createElement("i");
      actionIconElement.textContent = actionIcon;
      actionIconElement.setAttribute("aria-hidden", "true");
      const actionTextElement = document.createElement("span");
      const actionLabelElement = document.createElement("strong");
      actionLabelElement.textContent = actionLabel;
      const actionDescriptionElement = document.createElement("small");
      actionDescriptionElement.textContent = actionDescription;
      actionTextElement.append(actionLabelElement, actionDescriptionElement);
      actionButton.append(actionIconElement, actionTextElement);
      vacuumActionsElement.append(actionButton);
      return {
        button: actionButton,
        name: actionLabelElement,
        description: actionDescriptionElement
      };
    };
    const vacuumActionDefinitions = [
      ["start", "开始清扫", "启动全屋任务", "▶"],
      ["pause", "暂停", "保留当前进度", "Ⅱ"],
      ["stop", "停止", "结束当前任务", "■"],
      ["return_to_base", "回充", "返回充电座", "⌂"],
      ["locate", "定位", "让设备发出声音", "◎"],
      ["clean_spot", "局部清扫", "清扫当前位置", "⌖"]
    ];
    const vacuumActionsByService = new Map(
      vacuumActionDefinitions.map(
        ([actionServiceKey, actionLabelText, actionDescriptionText, actionIconText]) => [
          actionServiceKey,
          createVacuumActionButton(
            actionLabelText,
            actionDescriptionText,
            actionIconText,
            actionServiceKey
          )
        ]
      )
    );
    const vacuumStartAction = vacuumActionsByService.get("start");
    const vacuumPauseAction = vacuumActionsByService.get("pause");
    const vacuumStopAction = vacuumActionsByService.get("stop");
    const vacuumReturnAction = vacuumActionsByService.get("return_to_base");
    const vacuumLocateAction = vacuumActionsByService.get("locate");
    const vacuumSpotAction = vacuumActionsByService.get("clean_spot");
    vacuumControlsElement.append(vacuumActionsElement);
    /**
     * 把设备返回的取值规范化成查表用的键。
     */
    const normalizeVacuumOptionKey = optionRawValue =>
      String(optionRawValue || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
    const cleaningModeLabels = {
      sweeping: "扫地",
      mopping: "拖地",
      sweeping_and_mopping: "扫拖同步",
      mopping_after_sweeping: "先扫后拖"
    };
    const fanSpeedLabels = {
      silent: "静音",
      quiet: "静音",
      standard: "标准",
      strong: "强力",
      turbo: "超强"
    };
    const vacuumOptionGroups = [];
    /**
     * 创建一个扫地机可选值分组（清洁模式 / 风速档 …）。
     */
    const createVacuumOptionGroup = ({
      label: groupLabel,
      detail: groupDetail,
      options: groupOptions,
      current: currentOption,
      labels: optionLabelMap,
      onSelect: onOptionSelect,
      enabled: isOptionGroupEnabled = true
    }) => {
      if (!groupOptions.length) {
        return null;
      }
      const vacuumOptionGroupElement = document.createElement("section");
      vacuumOptionGroupElement.className = "hb-vacuum-details-option-group";
      const optionGroupHeader = document.createElement("div");
      const optionGroupTitle = document.createElement("strong");
      optionGroupTitle.textContent = groupLabel;
      const optionGroupDetail = document.createElement("small");
      optionGroupDetail.textContent = groupDetail;
      optionGroupHeader.append(optionGroupTitle, optionGroupDetail);
      const optionGroupBody = document.createElement("div");
      optionGroupBody.className = "hb-vacuum-details-options";
      const optionEntries = groupOptions.map(optionChoice => {
        const optionKey = normalizeVacuumOptionKey(optionChoice);
        const optionButton = document.createElement("button");
        optionButton.type = "button";
        optionButton.textContent = optionLabelMap[optionKey] || String(optionChoice);
        optionButton.disabled = isPreview || !isOptionGroupEnabled;
        optionButton.addEventListener("click", () => onOptionSelect(optionChoice, optionButton));
        optionGroupBody.append(optionButton);
        return {
          button: optionButton,
          key: optionKey
        };
      });
      /**
       * 按当前取值高亮对应的选项按钮。
       */
      const syncOptionGroup = selectedOption => {
        const selectedOptionKey = normalizeVacuumOptionKey(selectedOption);
        for (const optionEntry of optionEntries) {
          optionEntry.button.classList.toggle("active", optionEntry.key === selectedOptionKey);
        }
      };
      syncOptionGroup(currentOption);
      vacuumOptionGroups.push({
        group: vacuumOptionGroupElement,
        sync: syncOptionGroup
      });
      vacuumOptionGroupElement.append(optionGroupHeader, optionGroupBody);
      vacuumControlsElement.append(vacuumOptionGroupElement);
      return {
        group: vacuumOptionGroupElement,
        sync: syncOptionGroup,
        entries: optionEntries
      };
    };
    const vacuumAttributes = vacuumState.attributes || {};
    const cleaningModeEntityIdCandidate =
      "select." +
      vacuumPrimaryEntityId.slice(vacuumPrimaryEntityId.indexOf(".") + 1) +
      "_cleaning_mode";
    const cleaningModeEntity = relatedDeviceEntity(
      this.entityMetadata,
      vacuumPrimaryEntityId,
      "select",
      "cleaning_mode",
      cleaningModeEntityIdCandidate
    );
    const cleaningModeEntityId = String(cleaningModeEntity?.entityId || "");
    const cleaningModeState = cleaningModeEntityId ? this.states.get(cleaningModeEntityId) : null;
    let cleaningModeCurrentState = resolveStateEntry(cleaningModeState);
    const vacuumBatteryEntity = relatedVacuumBatteryEntity(
      this.entityMetadata,
      this.states,
      vacuumPrimaryEntityId
    );
    const vacuumBatteryEntityId = String(vacuumBatteryEntity?.entityId || "");
    const vacuumBatteryState = vacuumBatteryEntityId
      ? this.states.get(vacuumBatteryEntityId)
      : null;
    let vacuumBatteryCurrentState = resolveStateEntry(vacuumBatteryState);
    let cleaningModeGroup = null;
    /**
     * 记录清洁模式实体的最新状态，并同步清洁模式分组的选中态。
     */
    const applyCleaningModeState = nextCleaningModeState => {
      if (nextCleaningModeState) {
        cleaningModeCurrentState = nextCleaningModeState;
        cleaningModeGroup?.sync(nextCleaningModeState.state);
      }
    };
    let isVacuumActionPending = false;
    /**
     * 切换扫地机弹窗的「动作进行中」态：整块标记 pending 并禁用所有动作 / 选项按钮。
     */
    const setVacuumActionPending = isPending => {
      isVacuumActionPending = isPending;
      vacuumControlsElement.classList.toggle("is-pending", isPending);
      for (const actionControl of vacuumControlsElement.querySelectorAll(
        ":scope > .hb-vacuum-details-actions button, :scope > .hb-vacuum-details-option-group button"
      )) {
        actionControl.disabled =
          isPreview || isPending || actionControl.dataset.unsupported === "true";
      }
    };
    /**
     * 统一调用扫地机相关服务，并集中处理乐观更新、回滚与错误上报。
     */
    const invokeVacuumService = async (
      vacuumServiceDomain,
      vacuumServiceName,
      vacuumServiceEntityId,
      vacuumServiceData,
      optimisticVacuumState = null,
      rollbackStateHandler = renderVacuumState,
      rollbackState = vacuumState
    ) => {
      if (isPreview || isVacuumActionPending) {
        return false;
      }
      if (optimisticVacuumState) {
        rollbackStateHandler(optimisticVacuumState);
      }
      setVacuumActionPending(true);
      try {
        await this.callEntityService(
          vacuumServiceDomain,
          vacuumServiceName,
          vacuumServiceEntityId,
          vacuumServiceData
        );
        return true;
      } catch (vacuumServiceError) {
        rollbackStateHandler(rollbackState);
        this.options.onError?.(vacuumServiceError);
        return false;
      } finally {
        setVacuumActionPending(false);
      }
    };
    const cleaningModeOptions = Array.isArray(cleaningModeCurrentState?.attributes?.options)
      ? cleaningModeCurrentState.attributes.options
      : Array.isArray(vacuumAttributes.cleaning_mode_list)
        ? vacuumAttributes.cleaning_mode_list
        : [];
    const hasCleaningModeEntity = !!cleaningModeEntityId;
    cleaningModeGroup = createVacuumOptionGroup({
      label: "清洁模式",
      detail: hasCleaningModeEntity ? "选择本次任务方式" : "当前设备未提供模式切换实体",
      options: cleaningModeOptions,
      current: cleaningModeCurrentState?.state || vacuumAttributes.cleaning_mode,
      labels: cleaningModeLabels,
      enabled: hasCleaningModeEntity,
      onSelect: async selectedCleaningMode => {
        const cleaningModeFallbackState = cleaningModeCurrentState || {
          state: vacuumAttributes.cleaning_mode || "unknown",
          attributes: {
            options: cleaningModeOptions
          }
        };
        const optimisticCleaningModeState = {
          ...cleaningModeFallbackState,
          state: selectedCleaningMode,
          attributes: {
            ...(cleaningModeFallbackState.attributes || {}),
            options: cleaningModeOptions
          }
        };
        await invokeVacuumService(
          "select",
          "select_option",
          cleaningModeEntityId,
          {
            option: selectedCleaningMode
          },
          optimisticCleaningModeState,
          applyCleaningModeState,
          cleaningModeFallbackState
        );
      }
    });
    if (cleaningModeGroup && !hasCleaningModeEntity) {
      for (const modeOptionEntry of cleaningModeGroup.entries) {
        modeOptionEntry.button.dataset.unsupported = "true";
      }
    }
    const fanSpeedOptions =
      Array.isArray(vacuumAttributes.fan_speed_list) && vacuumAttributes.fan_speed_list.length
        ? vacuumAttributes.fan_speed_list
        : Array.isArray(vacuumAttributes.suction_level_list)
          ? vacuumAttributes.suction_level_list
          : [];
    const fanSpeedGroup = createVacuumOptionGroup({
      label: "吸力",
      detail: "按地面情况调节",
      options: fanSpeedOptions,
      current: vacuumAttributes.fan_speed || vacuumAttributes.suction_level,
      labels: fanSpeedLabels,
      onSelect: async selectedFanSpeed => {
        const currentVacuumState = vacuumState;
        const optimisticFanSpeedState = {
          ...currentVacuumState,
          attributes: {
            ...(currentVacuumState.attributes || {}),
            fan_speed: selectedFanSpeed,
            suction_level: selectedFanSpeed
          }
        };
        await invokeVacuumService(
          "vacuum",
          "set_fan_speed",
          vacuumPrimaryEntityId,
          {
            fan_speed: selectedFanSpeed
          },
          optimisticFanSpeedState
        );
      }
    });
    const waterHeaterExtensions =
      selectedEntityIds !== null
        ? this.createWaterHeaterExtensionControls(vacuumPrimaryEntityId, {
            component: vacuumControlComponent,
            interactive: !isPreview,
            excludedEntityIds: [cleaningModeEntityId, vacuumBatteryEntityId].filter(Boolean)
          })
        : null;
    const vacuumWarningElement = document.createElement("p");
    vacuumWarningElement.className = "hb-vacuum-details-warning";
    vacuumControlsElement.append(vacuumWarningElement);
    vacuumLayoutElement.append(vacuumOverviewElement, vacuumControlsElement);
    vacuumCardElement.append(vacuumHeadingElement, vacuumLayoutElement);
    if (waterHeaterExtensions) {
      vacuumCardElement.append(waterHeaterExtensions);
      vacuumDialogElement.classList.add("has-related-extensions");
    }
    vacuumDialogElement.append(vacuumCardElement);
    /**
     * 把扫地机状态翻译成中文状态文案。
     */
    const vacuumStatusText = vacuumStatusState => {
      const vacuumStatusAttributes = vacuumStatusState?.attributes || {};
      if (vacuumStatusAttributes.washing) {
        if (vacuumStatusAttributes.washing_paused) {
          return "拖布清洗已暂停";
        } else {
          return "正在清洗拖布";
        }
      }
      if (vacuumStatusAttributes.drying) {
        return "正在烘干拖布";
      }
      if (vacuumStatusAttributes.draining) {
        return "正在排水";
      }
      if (vacuumStatusAttributes.returning) {
        return "正在返回充电座";
      }
      if (vacuumStatusAttributes.mapping) {
        return "正在绘制地图";
      }
      const vacuumStateKey = String(
        vacuumStatusAttributes.vacuum_state || vacuumStatusState?.state || ""
      ).toLowerCase();
      return (
        {
          cleaning: "正在清扫",
          sweeping: "正在扫地",
          mopping: "正在拖地",
          paused: "任务已暂停",
          returning: "正在返回充电座",
          docked: "已在充电座",
          charging: "正在充电",
          charging_completed: "充电完成",
          idle: "待机",
          error: "设备异常",
          unavailable: "设备不可用",
          unknown: "状态未知",
          washing: "正在清洗拖布",
          drying: "正在烘干拖布",
          mapping: "正在绘制地图"
        }[vacuumStateKey] || String(vacuumStatusState?.state || "状态未知")
      );
    };
    /**
     * 把统计数值格式化成可显示的数字；不是有限数时返回占位文本。
     * @param {string} [fallbackText="--"] 数值不可用时的占位文本。
     */
    const formatVacuumNumber = (numericMetric, fallbackText = "--") =>
      Number.isFinite(Number(numericMetric)) ? Number(numericMetric) : fallbackText;
    /**
     * 判断扫地机是否处于「工作中」，用于驱动动画与按钮高亮。
     */
    const isVacuumBusy = busyState => {
      const busyAttributes = busyState?.attributes || {};
      return (
        !!busyAttributes.running ||
        !!busyAttributes.returning ||
        !!busyAttributes.washing ||
        !!busyAttributes.drying ||
        !!busyAttributes.mapping ||
        ["cleaning", "returning"].includes(String(busyState?.state || "").toLowerCase())
      );
    };
    /**
     * 渲染扫地机电量文本。
     */
    const renderVacuumBattery = () => {
      const batteryPercent = vacuumBatteryPercent(vacuumState, vacuumBatteryCurrentState);
      vacuumBatteryValueElement.textContent =
        batteryPercent === null ? "--" : Math.round(batteryPercent) + "%";
    };
    /**
     * 缓存独立电量实体的最新状态，并刷新电量显示。
     */
    const applyVacuumBatteryState = nextBatteryState => {
      vacuumBatteryCurrentState = nextBatteryState || vacuumBatteryCurrentState;
      renderVacuumBattery();
    };
    /**
     * 按扫地机最新状态刷新详情弹窗的全部视觉与按钮态：状态文案、工作中 / 暂停 / 回充 / 扫地 / 拖地等视觉态、
     */
    function renderVacuumState(nextVacuumState) {
      if (!nextVacuumState) {
        return;
      }
      vacuumState = nextVacuumState;
      const vacuumStateAttributes = nextVacuumState.attributes || {};
      const vacuumStatusLabel = vacuumStatusText(nextVacuumState);
      const isVacuumActive = isVacuumBusy(nextVacuumState);
      const isVacuumPaused =
        !!vacuumStateAttributes.paused ||
        !!vacuumStateAttributes.washing_paused ||
        nextVacuumState.state === "paused";
      const isVacuumReturning =
        !!vacuumStateAttributes.returning || nextVacuumState.state === "returning";
      const cleaningModeKey = normalizeVacuumOptionKey(vacuumStateAttributes.cleaning_mode);
      const isSweepingMode = [
        "sweeping",
        "sweeping_and_mopping",
        "mopping_after_sweeping"
      ].includes(cleaningModeKey);
      const isMoppingMode = ["mopping", "sweeping_and_mopping", "mopping_after_sweeping"].includes(
        cleaningModeKey
      );
      const supportedVacuumActions = new Set(vacuumSupportedActions(nextVacuumState));
      for (const [actionServiceName, actionEntry] of vacuumActionsByService) {
        actionEntry.button.hidden =
          !supportedVacuumActions.has(actionServiceName) ||
          (!!interaction3dOptions && actionServiceName === "clean_spot");
      }
      const visibleVacuumActions = [...vacuumActionsByService.values()].filter(
        actionDescriptor => !actionDescriptor.button.hidden
      );
      const visibleActionCount = visibleVacuumActions.length;
      vacuumActionsElement.hidden = visibleActionCount === 0;
      vacuumActionsElement.classList.toggle("has-many-actions", visibleActionCount > 3);
      for (const actionControlEntry of vacuumActionsByService.values()) {
        actionControlEntry.button.classList.remove("is-last-row-pair", "is-last-row-single");
      }
      const lastRowActionCount = visibleActionCount % 3 || Math.min(visibleActionCount, 3);
      if (lastRowActionCount === 2) {
        for (const lastRowAction of visibleVacuumActions.slice(-2)) {
          lastRowAction.button.classList.add("is-last-row-pair");
        }
      } else if (lastRowActionCount === 1) {
        visibleVacuumActions.at(-1)?.button.classList.add("is-last-row-single");
      }
      vacuumSubtitleElement.textContent = vacuumStatusLabel;
      vacuumSubtitleElement.classList.toggle("is-active", isVacuumActive && !isVacuumPaused);
      vacuumVisualStatusElement.textContent = vacuumStatusLabel;
      renderVacuumBattery();
      vacuumVisualElement.classList.toggle("is-working", isVacuumActive && !isVacuumPaused);
      vacuumVisualElement.classList.toggle("is-paused", isVacuumPaused);
      vacuumVisualElement.classList.toggle("is-returning", isVacuumReturning);
      vacuumVisualElement.classList.toggle("is-sweeping", isSweepingMode);
      vacuumVisualElement.classList.toggle("is-mopping", isMoppingMode);
      vacuumAreaValue.textContent = formatVacuumNumber(vacuumStateAttributes.cleaned_area) + " m²";
      vacuumDurationValue.textContent =
        formatVacuumNumber(vacuumStateAttributes.cleaning_time) + " min";
      vacuumStartAction.button.classList.toggle(
        "active",
        isVacuumActive && !isVacuumPaused && !isVacuumReturning
      );
      vacuumPauseAction.button.classList.toggle("active", isVacuumPaused);
      vacuumStopAction.button.classList.toggle("active", false);
      vacuumReturnAction.button.classList.toggle("active", isVacuumReturning);
      vacuumLocateAction.button.classList.toggle("active", false);
      vacuumSpotAction.button.classList.toggle(
        "active",
        isVacuumActive &&
          !isVacuumPaused &&
          !isVacuumReturning &&
          nextVacuumState.state === "cleaning"
      );
      vacuumStartAction.name.textContent = isVacuumPaused ? "继续清扫" : "开始清扫";
      if (!cleaningModeEntityId) {
        cleaningModeGroup?.sync(vacuumStateAttributes.cleaning_mode);
      }
      fanSpeedGroup?.sync(vacuumStateAttributes.fan_speed || vacuumStateAttributes.suction_level);
      const vacuumErrorMessage = String(vacuumStateAttributes.error || "").trim();
      const vacuumWaterWarningMessage = String(
        vacuumStateAttributes.low_water_warning || ""
      ).trim();
      const vacuumAlerts = [];
      if (vacuumErrorMessage && !/^no error$/i.test(vacuumErrorMessage)) {
        vacuumAlerts.push(vacuumErrorMessage);
      }
      if (vacuumWaterWarningMessage && !/^no warning$/i.test(vacuumWaterWarningMessage)) {
        vacuumAlerts.push(vacuumWaterWarningMessage);
      }
      vacuumWarningElement.textContent = vacuumAlerts.length
        ? "注意：" + vacuumAlerts.join(" · ")
        : "";
      vacuumWarningElement.hidden = !vacuumAlerts.length;
    }
    vacuumStartAction.button.addEventListener("click", () =>
      invokeVacuumService(
        "vacuum",
        vacuumActionService(vacuumState, "start"),
        vacuumPrimaryEntityId,
        {},
        {
          ...vacuumState,
          state: "cleaning",
          attributes: {
            ...(vacuumState.attributes || {}),
            running: true,
            paused: false,
            returning: false
          }
        }
      )
    );
    vacuumPauseAction.button.addEventListener("click", () =>
      invokeVacuumService(
        "vacuum",
        "pause",
        vacuumPrimaryEntityId,
        {},
        {
          ...vacuumState,
          state: "paused",
          attributes: {
            ...(vacuumState.attributes || {}),
            running: false,
            paused: true
          }
        }
      )
    );
    vacuumReturnAction.button.addEventListener("click", () =>
      invokeVacuumService(
        "vacuum",
        "return_to_base",
        vacuumPrimaryEntityId,
        {},
        {
          ...vacuumState,
          state: "returning",
          attributes: {
            ...(vacuumState.attributes || {}),
            running: false,
            paused: false,
            returning: true
          }
        }
      )
    );
    vacuumStopAction.button.addEventListener("click", () =>
      invokeVacuumService(
        "vacuum",
        vacuumActionService(vacuumState, "stop"),
        vacuumPrimaryEntityId,
        {},
        {
          ...vacuumState,
          state: "idle",
          attributes: {
            ...(vacuumState.attributes || {}),
            running: false,
            paused: false,
            returning: false
          }
        }
      )
    );
    vacuumLocateAction.button.addEventListener("click", () =>
      invokeVacuumService("vacuum", "locate", vacuumPrimaryEntityId, {})
    );
    vacuumSpotAction.button.addEventListener("click", () =>
      invokeVacuumService(
        "vacuum",
        "clean_spot",
        vacuumPrimaryEntityId,
        {},
        {
          ...vacuumState,
          state: "cleaning",
          attributes: {
            ...(vacuumState.attributes || {}),
            running: true,
            paused: false,
            returning: false
          }
        }
      )
    );
    renderVacuumState(vacuumState);
    const vacuumDialogLayer = document.createElement("div");
    vacuumDialogLayer.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    vacuumDialogLayer.tabIndex = -1;
    vacuumDialogLayer.append(vacuumDialogElement);
    this.container.append(vacuumDialogLayer);
    this.detailsDialog = vacuumDialogElement;
    const vacuumStateHandlers = new Map([[vacuumPrimaryEntityId, [renderVacuumState]]]);
    if (cleaningModeEntityId) {
      vacuumStateHandlers.set(cleaningModeEntityId, [applyCleaningModeState]);
    }
    if (vacuumBatteryEntityId) {
      vacuumStateHandlers.set(vacuumBatteryEntityId, [applyVacuumBatteryState]);
    }
    for (const [extraHandlerEntityId, extraHandlerList] of waterHeaterExtensions?.stateHandlers ||
      []) {
      vacuumStateHandlers.set(extraHandlerEntityId, extraHandlerList);
    }
    this.detailsStateSync = {
      dialog: vacuumDialogElement,
      handlers: vacuumStateHandlers
    };
    let vacuumResizeObserver = null;
    // 已排程的重排帧句柄，关闭弹窗时连同观察器一起作废。
    let vacuumLayoutFrameId = 0;
    if (interaction3dOptions) {
      vacuumDialogLayer.classList.add("i3d-vacuum-dialog-layer");
      (interaction3dOptions.root || this.container).append(vacuumDialogLayer);
      vacuumDialogElement.style.setProperty(
        "--i3d-panel-opacity",
        String(
          Math.max(
            0,
            Math.min(
              100,
              Number.isFinite(interaction3dOptions.popupOpacity)
                ? interaction3dOptions.popupOpacity
                : 74
            )
          ) / 100
        )
      );
      /**
       * 按 3D 舞台的实际尺寸重算扫地机弹窗的位置、缩放与最大高度。
       */
      const layoutVacuumDialog = () => {
        const layoutRootElement = interaction3dOptions.root || this.container;
        const rootClientWidth = layoutRootElement.clientWidth;
        const rootClientHeight = layoutRootElement.clientHeight;
        const presentationLayoutInfo = interaction3dOptions.getPresentationLayout?.();
        const presentationWidth =
          presentationLayoutInfo?.width > 0 ? presentationLayoutInfo.width : rootClientWidth;
        const presentationHeight =
          presentationLayoutInfo?.height > 0 ? presentationLayoutInfo.height : rootClientHeight;
        const widthScaleFactor = rootClientWidth / Math.max(1, presentationWidth);
        const heightScaleFactor = rootClientHeight / Math.max(1, presentationHeight);
        const defaultDialogTop = Math.max(
          12,
          Math.min(presentationHeight * 0.56 - 400, presentationHeight - 812)
        );
        const dialogPlacement = popupPlacement({
          width: presentationWidth,
          height: presentationHeight,
          panelWidth: 360,
          panelHeight:
            Math.max(
              vacuumDialogElement.scrollHeight ? vacuumDialogElement.scrollHeight + 2 : 0,
              vacuumDialogElement.offsetHeight || 0
            ) || 400,
          defaultScale: 2,
          defaultTop: defaultDialogTop,
          settings: interaction3dOptions.getPopupLayout?.()
        });
        const dialogScaleX = dialogPlacement.scale * widthScaleFactor;
        const dialogScaleY = dialogPlacement.scale * heightScaleFactor;
        const dialogTop = dialogPlacement.top * heightScaleFactor;
        vacuumDialogElement.style.top = dialogTop + "px";
        vacuumDialogElement.style.right = dialogPlacement.right * widthScaleFactor + "px";
        vacuumDialogElement.style.transform = "scale(" + dialogScaleX + "," + dialogScaleY + ")";
        vacuumDialogElement.style.maxHeight =
          Math.max(
            dialogPlacement.custom ? 1 : 100,
            (rootClientHeight - dialogTop - heightScaleFactor * 12) / dialogScaleY
          ) + "px";
      };
      vacuumDialogElement.resizeInteraction3d = layoutVacuumDialog;
      // 观察器回调只排程：布局函数会把尺寸写回被观察的元素本身，投递过程中再触发会报
      const scheduleVacuumDialogLayout = () => {
        if (vacuumLayoutFrameId) {
          return;
        }
        vacuumLayoutFrameId = requestAnimationFrame(() => {
          vacuumLayoutFrameId = 0;
          layoutVacuumDialog();
        });
      };
      vacuumResizeObserver = new ResizeObserver(scheduleVacuumDialogLayout);
      vacuumResizeObserver.observe(interaction3dOptions.root || this.container);
      vacuumResizeObserver.observe(vacuumDialogElement);
      if (interaction3dOptions.frame) {
        vacuumResizeObserver.observe(interaction3dOptions.frame);
      }
      layoutVacuumDialog();
    } else {
      this.registerRuntimeDialogScale(
        vacuumDialogLayer,
        vacuumDialogElement,
        840,
        waterHeaterExtensions ? 560 : 458
      );
    }
    vacuumCloseButton.addEventListener("click", () => vacuumDialogElement.close());
    this.bindRuntimeDialogOutsideDismiss(vacuumDialogLayer, vacuumDialogElement, vacuumCardElement);
    this.bindRuntimeDialogEscapeClose(vacuumDialogLayer, vacuumDialogElement);
    vacuumDialogElement.addEventListener(
      "close",
      () => {
        vacuumResizeObserver?.disconnect();
        // 已排程未执行的那一帧要一并取消：弹窗层马上会被移除。
        if (vacuumLayoutFrameId) {
          cancelAnimationFrame(vacuumLayoutFrameId);
          vacuumLayoutFrameId = 0;
        }
        this.clearRuntimeDialogScale(vacuumDialogElement);
        if (this.detailsDialog === vacuumDialogElement) {
          this.detailsDialog = null;
        }
        if (this.detailsStateSync?.dialog === vacuumDialogElement) {
          this.detailsStateSync = null;
        }
        vacuumDialogLayer.remove();
      },
      {
        once: true
      }
    );
    this.presentRuntimeDialog(vacuumDialogLayer, vacuumDialogElement);
    vacuumDialogElement.resizeInteraction3d?.();
  },
  /**
   * 从 3D 舞台打开扫地机详情。
   */
  openInteraction3dVacuumDetails(
    vacuumComponentConfig,
    onDialogClose,
    {
      states: initialStates = {},
      root: presentationRoot,
      frame: presentationFrame,
      popupOpacity: popupOpacityPercent = 74,
      getPresentationLayout: getPresentationLayout,
      getPopupLayout: getPopupLayout
    } = {}
  ) {
    const vacuumEntityIds = new Set([
      vacuumComponentConfig.entityId,
      ...(vacuumComponentConfig.relatedEntityIds || [])
    ]);
    let vacuumDialog = null;
    let vacuumOptionsSignature = "";
    /**
     * 计算扫地机「可选值集合」的签名，用于判断详情弹窗是否需要重建。
     * @returns {string} 当前可选值集合的签名。
     */
    const computeVacuumOptionsSignature = () =>
      JSON.stringify(
        [...vacuumEntityIds]
          .filter(vacuumEntityId => /^(vacuum|select)\./.test(vacuumEntityId))
          .map(relatedVacuumEntityId => {
            const relatedEntityState = this.states.get(relatedVacuumEntityId);
            const relatedEntityAttributes =
              resolveStateEntry(relatedEntityState)?.attributes || {};
            return [
              relatedVacuumEntityId,
              relatedEntityAttributes.fan_speed_list,
              relatedEntityAttributes.suction_level_list,
              relatedEntityAttributes.cleaning_mode_list,
              relatedEntityAttributes.options
            ];
          })
      );
    /**
     * 写入扫地机相关实体的状态，并把状态分发给弹窗内的各个控件。
     */
    const applyVacuumStates = vacuumStates => {
      for (const vacuumEntityKey of vacuumEntityIds) {
        const vacuumEntitySnapshot = vacuumStates[vacuumEntityKey] || {
          entityId: vacuumEntityKey,
          state: "unavailable",
          attributes: {}
        };
        this.states.set(vacuumEntityKey, vacuumEntitySnapshot);
        if (this.detailsStateSync?.dialog === vacuumDialog) {
          for (const vacuumStateHandler of this.detailsStateSync.handlers.get(vacuumEntityKey) ||
            []) {
            vacuumStateHandler(vacuumEntitySnapshot);
          }
        }
      }
      if (vacuumDialog && computeVacuumOptionsSignature() !== vacuumOptionsSignature) {
        showVacuumDialog();
      }
    };
    applyVacuumStates(initialStates);
    /**
     * 在组件树里递归查找绑定到当前扫地机实体的 vacuum-control 组件。
     */
    const findVacuumControlComponent = componentList => {
      for (const componentEntry of componentList || []) {
        if (
          componentEntry.type === "vacuum-control" &&
          componentEntry.bindings?.entity?.entityId === vacuumComponentConfig.entityId
        ) {
          return componentEntry;
        }
        const nestedVacuumComponent = findVacuumControlComponent(componentEntry.children);
        if (nestedVacuumComponent) {
          return nestedVacuumComponent;
        }
      }
      return null;
    };
    const vacuumControlDefinition = (this.document?.pages || [])
      .map(page => findVacuumControlComponent(page.components))
      .find(Boolean);
    const relatedModeEntityIds =
      vacuumControlDefinition?.properties?.relatedEntities?.mode === "selected"
        ? (vacuumControlDefinition.properties.relatedEntities.entityIds || []).filter(
            relatedEntityIdentifier => vacuumEntityIds.has(relatedEntityIdentifier)
          )
        : [];
    const vacuumComponentDraft = {
      id: "vacuum:" + vacuumComponentConfig.id,
      type: "vacuum-control",
      properties: {
        label: vacuumComponentConfig.label,
        relatedEntities: {
          mode: "selected",
          entityIds: relatedModeEntityIds
        }
      },
      bindings: {
        entity: {
          entityId: vacuumComponentConfig.entityId
        }
      }
    };
    /**
     * 打开（或重建）扫地机详情的 3D 交互弹窗，并刷新可选值签名。
     */
    const showVacuumDialog = () => {
      vacuumDialog?.removeEventListener("close", onDialogClose);
      this.showVacuumDetails(vacuumComponentDraft, {
        preview: !!this.options.editable,
        interaction3d: {
          root: presentationRoot,
          frame: presentationFrame,
          popupOpacity: popupOpacityPercent,
          getPresentationLayout: getPresentationLayout,
          getPopupLayout: getPopupLayout
        }
      });
      vacuumDialog = this.detailsDialog;
      vacuumOptionsSignature = computeVacuumOptionsSignature();
      vacuumDialog?.addEventListener("close", onDialogClose, {
        once: true
      });
    };
    showVacuumDialog();
    return {
      updateStates: applyVacuumStates,
      updateLayout: () => vacuumDialog?.resizeInteraction3d?.(),
      close: () => {
        vacuumDialog?.removeEventListener("close", onDialogClose);
        vacuumDialog?.close();
      },
      contains: node => vacuumDialog?.contains(node)
    };
  },
  /**
   * 刷新扫地机地图图层（地图是 image 实体，地址随每次清扫变化）。
   */
  refreshVacuumMapEntity(vacuumEntityIdInput) {
    if (
      this.options.liveMedia === false ||
      !String(vacuumEntityIdInput || "").startsWith("image.")
    ) {
      return;
    }
    const vacuumEntityState = this.states.get(vacuumEntityIdInput);
    const mapImageSrc = vacuumMapImageSource(vacuumEntityIdInput, vacuumEntityState);
    let didUpdateImage = false;
    for (const [vacuumComponentId, vacuumComponentRecord] of this.componentRecords) {
      if (
        vacuumComponentRecord.type !== "vacuum-map" ||
        vacuumComponentRecord.bindings?.entity?.entityId !== vacuumEntityIdInput
      ) {
        continue;
      }
      const mapImageElement = this.componentHosts
        .get(vacuumComponentId)
        ?.querySelector(".hb-vacuum-map-image");
      if (mapImageElement) {
        didUpdateImage = true;
        if (mapImageElement.dataset.vacuumMapSource !== mapImageSrc) {
          mapImageElement.dataset.vacuumMapSource = mapImageSrc;
        }
        if (
          mapImageElement.dataset.vacuumMapSuspended !== "true" &&
          mapImageElement.getAttribute("src") !== mapImageSrc
        ) {
          mapImageElement.src = mapImageSrc;
        }
      }
    }
    if (
      !didUpdateImage &&
      this.options.liveMedia !== false &&
      this.vacuumMapEntityIds.has(vacuumEntityIdInput)
    ) {
      this.runtimeVacuumMapImagePreloader.enqueue(mapImageSrc);
    }
  }
};
