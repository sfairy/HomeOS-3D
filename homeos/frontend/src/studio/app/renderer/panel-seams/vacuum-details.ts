import type { ComponentDialogElement } from "../renderer-types";
import type { PanelRenderer } from "../panel-renderer";
import { componentDialogTitle } from "../renderer-helpers";
import { popupPlacement as popupPlacement2 } from "../../bridge/presets/popup-placement";
import { relatedDeviceEntity as relatedDeviceEntity2 } from "../controls/cover-runtime";
import { relatedVacuumBatteryEntity as relatedVacuumBatteryEntity2, relatedVacuumStatusEntities as relatedVacuumStatusEntities2, vacuumActionService as vacuumActionService2, vacuumBatteryPercent as vacuumBatteryPercent2, vacuumStatus as vacuumStatus2, vacuumSupportedActions as vacuumSupportedActions2 } from "../controls/vacuum-runtime";
import { selectedRelatedEntityIds as selectedRelatedEntityIds2 } from "../../shared/related-entities";

export function showVacuumDetails(this: PanelRenderer, 
    vacuumComponent: any,
    { preview: isVacuumPreview = false, interaction3d: interaction3dInstance = null }: any = {},
  ) {
    const vacuumEntityId = vacuumComponent.bindings?.entity?.entityId;
    if (!vacuumEntityId) throw new Error("该扫地机器人控件没有关联实体。");
    const selectedRelatedEntityIds = selectedRelatedEntityIds2(vacuumComponent);
    this.closeRuntimeDialog();
    const vacuumState = this.states.get(vacuumEntityId);
    let vacuumStateOptions = vacuumState?.newState ||
      vacuumState || {
        state: "unknown",
        attributes: {} as Record<string, any>,
      };
    const vacuumDialog: ComponentDialogElement = document.createElement("dialog");
    ((vacuumDialog.className = "hb-entity-details-dialog vacuum-details"),
      interaction3dInstance && vacuumDialog.classList.add("i3d-vacuum-details"));
    const vacuumCard = document.createElement("div");
    ((vacuumCard.className = "hb-entity-details-card"),
      vacuumCard.classList.add("hb-vacuum-details-card"));
    const vacuumHeading = document.createElement("div");
    vacuumHeading.className = "hb-entity-details-heading";
    const vacuumTitleRow = document.createElement("div"),
      vacuumTitle = document.createElement("strong"),
      vacuumTitleText =
        String(vacuumStateOptions.attributes?.friendly_name || "扫地机器人").replace(/^\d+/, "") ||
        "扫地机器人";
    vacuumTitle.textContent = componentDialogTitle(vacuumComponent, vacuumTitleText);
    const vacuumSubtitleLabel = document.createElement("span");
    vacuumSubtitleLabel.className = "hb-vacuum-details-subtitle";
    const vacuumCloseButton = document.createElement("button");
    ((vacuumCloseButton.type = "button"),
      vacuumCloseButton.setAttribute("aria-label", "关闭扫地机器人详情"),
      (vacuumCloseButton.textContent = "×"),
      vacuumTitleRow.append(vacuumTitle, vacuumSubtitleLabel),
      vacuumHeading.append(vacuumTitleRow, vacuumCloseButton));
    const vacuumLayout = document.createElement("div");
    vacuumLayout.className = "hb-vacuum-details-layout";
    const vacuumOverviewSection = document.createElement("section");
    vacuumOverviewSection.className = "hb-vacuum-details-overview";
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
    const vacuumMopLeftElement = document.createElement("i");
    vacuumMopLeftElement.className = "hb-vacuum-robot-mop left";
    const vacuumMopRightElement = document.createElement("i");
    ((vacuumMopRightElement.className = "hb-vacuum-robot-mop right"),
      vacuumRobotElement.append(
        vacuumLidarElement,
        vacuumSensorElement,
        vacuumBumperElement,
        vacuumBrushElement,
        vacuumMopLeftElement,
        vacuumMopRightElement,
      ));
    const vacuumBatteryElement = document.createElement("div");
    vacuumBatteryElement.className = "hb-vacuum-battery";
    const vacuumBatteryPercentLabel = document.createElement("strong"),
      vacuumBatteryCaption = document.createElement("small");
    ((vacuumBatteryCaption.textContent = "电量"),
      vacuumBatteryElement.append(vacuumBatteryPercentLabel, vacuumBatteryCaption),
      vacuumBatteryRingElement.append(vacuumRobotElement));
    const vacuumStatusLabel = document.createElement("span");
    vacuumStatusLabel.className = "hb-vacuum-visual-status";
    // 栈 D（3D）：标题右上角只挂机器人+电量角标；加专用 class，避免标题 > div 样式误套。
    if (interaction3dInstance) {
      (vacuumVisualElement.classList.add("i3d-vacuum-visual"),
        vacuumVisualElement.append(vacuumBatteryRingElement, vacuumBatteryElement),
        vacuumHeading.append(vacuumVisualElement));
    } else {
      (vacuumVisualElement.append(vacuumBatteryRingElement, vacuumStatusLabel),
        vacuumHeading.append(vacuumBatteryElement),
        vacuumOverviewSection.append(vacuumVisualElement));
    }
    const vacuumStatsElement = document.createElement("div");
    vacuumStatsElement.className = "hb-vacuum-details-stats";
    const createVacuumStat = (statLabel: any, statIcon: any) => {
        const vacuumStatElement = document.createElement("div"),
          vacuumStatValueLabel = document.createElement("span");
        vacuumStatValueLabel.className = "hb-vacuum-details-stat-value";
        const vacuumStatIcon = document.createElement("i");
        ((vacuumStatIcon.textContent = statIcon),
          vacuumStatIcon.setAttribute("aria-hidden", "true"));
        const vacuumStatNumberLabel = document.createElement("strong"),
          vacuumStatLabel = document.createElement("small");
        return (
          (vacuumStatLabel.textContent = statLabel),
          vacuumStatValueLabel.append(vacuumStatIcon, vacuumStatNumberLabel),
          vacuumStatElement.append(vacuumStatValueLabel, vacuumStatLabel),
          vacuumStatsElement.append(vacuumStatElement),
          vacuumStatNumberLabel
        );
      },
      vacuumAreaStatElement = createVacuumStat("本次面积", "◇"),
      vacuumTimeStatElement = createVacuumStat("清扫时长", "◷");
    vacuumOverviewSection.append(vacuumStatsElement);
    const vacuumControlsSection = document.createElement("section");
    vacuumControlsSection.className = "hb-vacuum-details-controls";
    const vacuumActions = document.createElement("div");
    vacuumActions.className = "hb-vacuum-details-actions";
    const createVacuumAction = (
        actionTitle: any,
        descriptionText: any,
        actionIconValue: any,
        actionServiceName: any,
      ) => {
        const vacuumActionButton = document.createElement("button");
        ((vacuumActionButton.type = "button"),
          (vacuumActionButton.dataset.service = actionServiceName),
          (vacuumActionButton.disabled = isVacuumPreview));
        const vacuumActionIcon = document.createElement("i");
        ((vacuumActionIcon.textContent = actionIconValue),
          vacuumActionIcon.setAttribute("aria-hidden", "true"));
        const vacuumActionContentWrapper = document.createElement("span"),
          vacuumActionNameLabel = document.createElement("strong");
        vacuumActionNameLabel.textContent = actionTitle;
        const vacuumActionDescriptionLabel = document.createElement("small");
        return (
          (vacuumActionDescriptionLabel.textContent = descriptionText),
          vacuumActionContentWrapper.append(vacuumActionNameLabel, vacuumActionDescriptionLabel),
          vacuumActionButton.append(vacuumActionIcon, vacuumActionContentWrapper),
          vacuumActions.append(vacuumActionButton),
          {
            button: vacuumActionButton,
            name: vacuumActionNameLabel,
            description: vacuumActionDescriptionLabel,
          }
        );
      },
      vacuumActionDefs = [
        ["start", "开始清扫", "启动全屋任务", "▶"],
        ["pause", "暂停", "保留当前进度", "Ⅱ"],
        ["stop", "停止", "结束当前任务", "■"],
        ["return_to_base", "回充", "返回充电座", "⌂"],
        ["locate", "定位", "让设备发出声音", "◎"],
        ["clean_spot", "局部清扫", "清扫当前位置", "⌖"],
      ],
      vacuumActionsByService = new Map(
        vacuumActionDefs.map(([actionKey, actionLabel, actionGlyph, actionDescription]) => [
          actionKey,
          createVacuumAction(actionLabel, actionGlyph, actionDescription, actionKey),
        ]),
      ),
      startAction = vacuumActionsByService.get("start"),
      pauseAction = vacuumActionsByService.get("pause"),
      stopAction = vacuumActionsByService.get("stop"),
      returnToBaseAction = vacuumActionsByService.get("return_to_base"),
      locateAction = vacuumActionsByService.get("locate"),
      cleanSpotAction = vacuumActionsByService.get("clean_spot");
    vacuumControlsSection.append(vacuumActions);
    const normalizeActionKey = (rawActionValue: any) =>
        String(rawActionValue || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, ""),
      fanSpeedLabels = {
        sweeping: "扫地",
        mopping: "拖地",
        sweeping_and_mopping: "扫拖同步",
        mopping_after_sweeping: "先扫后拖",
      },
      suctionLevelLabels = {
        silent: "静音",
        quiet: "静音",
        standard: "标准",
        strong: "强力",
        turbo: "超强",
      },
      createVacuumOption = ({
        label: optionLabelText,
        detail: optionDetailText,
        labels: optionLabelMap,
        onSelect: onOptionSelect,
      }: any) => {
        const vacuumOptionGroupSection = document.createElement("section");
        vacuumOptionGroupSection.className = "hb-vacuum-details-option-group";
        const vacuumOptionHeading = document.createElement("div"),
          vacuumOptionTitle = document.createElement("strong");
        vacuumOptionTitle.textContent = optionLabelText;
        const vacuumOptionDetailLabel = document.createElement("small");
        ((vacuumOptionDetailLabel.textContent = optionDetailText),
          vacuumOptionHeading.append(vacuumOptionTitle, vacuumOptionDetailLabel));
        const vacuumOptionsContainer = document.createElement("div");
        vacuumOptionsContainer.className = "hb-vacuum-details-options";
        let vacuumOptionEntries: any = [],
          cachedOptionSignature = "";
        const syncVacuumOptions = (currentValueText: any, optionItems: any, isOptionSupported = true) => {
          const optionSignature = JSON.stringify(optionItems);
          (cachedOptionSignature !== optionSignature &&
            ((cachedOptionSignature = optionSignature),
            (vacuumOptionEntries = optionItems.map((optionItem: any) => {
              const optionKey = normalizeActionKey(optionItem),
                vacuumOptionButton = document.createElement("button");
              return (
                (vacuumOptionButton.type = "button"),
                (vacuumOptionButton.textContent = optionLabelMap[optionKey] || String(optionItem)),
                vacuumOptionButton.addEventListener("click", () => onOptionSelect(optionItem)),
                {
                  button: vacuumOptionButton,
                  key: optionKey,
                }
              );
            })),
            vacuumOptionsContainer.replaceChildren(
              ...vacuumOptionEntries.map((optionEntryItem: any) => optionEntryItem.button),
            )),
            (vacuumOptionGroupSection.hidden = !vacuumOptionEntries.length));
          const currentOptionKey = normalizeActionKey(currentValueText);
          for (const { button: optionButtonElement, key: optionButtonKey } of vacuumOptionEntries)
            (optionButtonElement.classList.toggle("active", optionButtonKey === currentOptionKey),
              (optionButtonElement.dataset.unsupported = String(!isOptionSupported)),
              (optionButtonElement.disabled =
                isVacuumPreview ||
                isVacuumBusy ||
                !vacuumStatus2(vacuumStateOptions).available ||
                !isOptionSupported));
        };
        return (
          vacuumOptionGroupSection.append(vacuumOptionHeading, vacuumOptionsContainer),
          vacuumControlsSection.append(vacuumOptionGroupSection),
          {
            group: vacuumOptionGroupSection,
            sync: syncVacuumOptions,
          }
        );
      },
      candidateCleaningModeEntityId =
        "select." + vacuumEntityId.slice(vacuumEntityId.indexOf(".") + 1) + "_cleaning_mode",
      cleaningModeEntityRecord = relatedDeviceEntity2(
        this.entityMetadata,
        vacuumEntityId,
        "select",
        "cleaning_mode",
        candidateCleaningModeEntityId,
      ),
      cleaningModeEntityId = String(cleaningModeEntityRecord?.entityId || ""),
      cleaningModeState = cleaningModeEntityId ? this.states.get(cleaningModeEntityId) : null;
    let cleaningModeStateValue = cleaningModeState?.newState || cleaningModeState || null;
    const vacuumBatteryEntity = relatedVacuumBatteryEntity2(
        this.entityMetadata,
        this.states,
        vacuumEntityId,
      ),
      batteryEntityId = String(vacuumBatteryEntity?.entityId || ""),
      batteryState = batteryEntityId ? this.states.get(batteryEntityId) : null;
    let batteryStateValue = batteryState?.newState || batteryState || null,
      modeOptionSync: any = null;
    const syncCleaningMode = (cleaningModeStateArg: any) => {
      cleaningModeStateArg &&
        ((cleaningModeStateValue = cleaningModeStateArg.newState || cleaningModeStateArg),
        syncCleaningModeOptions());
    };
    let isVacuumBusy = false,
      isVacuumActioning = false;
    const setVacuumPending = (interaction3dInstanceIsPending: any) => {
        ((isVacuumBusy = interaction3dInstanceIsPending),
          vacuumControlsSection.classList.toggle("is-pending", interaction3dInstanceIsPending));
        for (const controlButton of vacuumControlsSection.querySelectorAll<HTMLButtonElement>(
          ":scope > .hb-vacuum-details-actions button, :scope > .hb-vacuum-details-option-group button",
        ))
          controlButton.disabled =
            isVacuumPreview ||
            interaction3dInstanceIsPending ||
            !vacuumStatus2(vacuumStateOptions).available ||
            controlButton.dataset.unsupported === "true";
      },
      callVacuumService = async (
        targetDomain: any,
        targetService: any,
        targetEntityId: any,
        callVacuumServiceServicePayload: any,
        pendingError: any = null,
        stateApplier = applyVacuumState,
        appliedState = vacuumStateOptions,
      ) => {
        if (
          isVacuumActioning ||
          isVacuumPreview ||
          isVacuumBusy ||
          !vacuumStatus2(vacuumStateOptions).available
        )
          return false;
        (pendingError && stateApplier(pendingError), setVacuumPending(true));
        try {
          return (
            await this.callEntityService(
              targetDomain,
              targetService,
              targetEntityId,
              callVacuumServiceServicePayload,
            ),
            true
          );
        } catch (vacuumServiceError: any) {
          return (
            isVacuumActioning ||
              (pendingError && stateApplier(appliedState),
              this.options.onError?.(vacuumServiceError)),
            false
          );
        } finally {
          isVacuumActioning || setVacuumPending(false);
        }
      },
      hasCleaningModeEntity = !!cleaningModeEntityId;
    modeOptionSync = createVacuumOption({
      label: "清洁模式",
      detail: hasCleaningModeEntity ? "选择本次任务方式" : "当前设备未提供模式切换实体",
      labels: fanSpeedLabels,
      onSelect: async (selectedModeValue: any) => {
        const confirmedCleaningMode = cleaningModeStateValue;
        if (
          !hasCleaningModeEntity ||
          !confirmedCleaningMode ||
          ["unknown", "unavailable"].includes(confirmedCleaningMode.state)
        )
          return;
        const cleaningModeOptions = {
          ...confirmedCleaningMode,
          state: selectedModeValue,
        };
        await callVacuumService(
          "select",
          "select_option",
          cleaningModeEntityId,
          {
            option: selectedModeValue,
          },
          cleaningModeOptions,
          syncCleaningMode,
          confirmedCleaningMode,
        );
      },
    });
    const fanSpeedOptionElement = createVacuumOption({
        label: "吸力",
        detail: "按地面情况调节",
        labels: suctionLevelLabels,
        onSelect: async (selectedFanSpeed: any) => {
          const vacuumAttributesSource = vacuumStateOptions,
            suctionLevelOptions = {
              ...vacuumAttributesSource,
              attributes: {
                ...(vacuumAttributesSource.attributes || {}),
                fan_speed: selectedFanSpeed,
                suction_level: selectedFanSpeed,
              },
            };
          await callVacuumService(
            "vacuum",
            "set_fan_speed",
            vacuumEntityId,
            {
              fan_speed: selectedFanSpeed,
            },
            suctionLevelOptions,
          );
        },
      }),
      syncCleaningModeOptions = () => {
        const vacuumAttributes = vacuumStateOptions.attributes || {},
          cleaningModeList =
            cleaningModeStateValue?.attributes?.options ?? vacuumAttributes.cleaning_mode_list;
        modeOptionSync.sync(
          cleaningModeStateValue?.state || vacuumAttributes.cleaning_mode,
          Array.isArray(cleaningModeList) ? cleaningModeList : [],
          hasCleaningModeEntity &&
            !!cleaningModeStateValue &&
            !["unknown", "unavailable"].includes(cleaningModeStateValue.state),
        );
        const fanSpeedList = vacuumAttributes.fan_speed_list?.length
          ? vacuumAttributes.fan_speed_list
          : vacuumAttributes.suction_level_list;
        fanSpeedOptionElement.sync(
          vacuumAttributes.fan_speed || vacuumAttributes.suction_level,
          Array.isArray(fanSpeedList) ? fanSpeedList : [],
        );
      },
      waterHeaterExtensionControls2 =
        selectedRelatedEntityIds !== null
          ? this.createWaterHeaterExtensionControls(vacuumEntityId, {
              component: vacuumComponent,
              interactive: !isVacuumPreview,
              excludedEntityIds: [cleaningModeEntityId, batteryEntityId].filter(Boolean),
            })
          : null,
      vacuumWarningNote = document.createElement("p");
    ((vacuumWarningNote.className = "hb-vacuum-details-warning"),
      vacuumControlsSection.append(vacuumWarningNote),
      vacuumLayout.append(vacuumOverviewSection, vacuumControlsSection),
      vacuumCard.append(vacuumHeading, vacuumLayout),
      waterHeaterExtensionControls2 &&
        (vacuumCard.append(waterHeaterExtensionControls2),
        vacuumDialog.classList.add("has-related-extensions")),
      vacuumDialog.append(vacuumCard));
    const statusEntities =
        interaction3dInstance?.statusEntities ||
        relatedVacuumStatusEntities2(this.entityMetadata, vacuumEntityId),
      statesByEntityId = new Map(
        statusEntities.map((statusEntity: any) => [
          statusEntity.entityId,
          this.states.get(statusEntity.entityId),
        ]),
      ),
      resolveVacuumStatus = (vacuumStateInput: any) =>
        vacuumStatus2(
          vacuumStateInput,
          statusEntities.map((statusEntityEntry: any) => ({
            ...statusEntityEntry,
            state: statesByEntityId.get(statusEntityEntry.entityId),
          })),
        ),
      formatVacuumNumber = (numericValue: any, fallbackValue = "--") =>
        numericValue != null &&
        String(numericValue).trim() !== "" &&
        Number.isFinite(Number(numericValue))
          ? Number(numericValue)
          : fallbackValue,
      syncBatteryValue = () => {
        const batteryPercent = resolveVacuumStatus(vacuumStateOptions).available
          ? vacuumBatteryPercent2(vacuumStateOptions, batteryStateValue)
          : null;
        vacuumBatteryPercentLabel.textContent =
          batteryPercent === null ? "--" : Math.round(batteryPercent) + "%";
      },
      syncBatteryState = (batteryStateArg: any) => {
        ((batteryStateValue = batteryStateArg || batteryStateValue), syncBatteryValue());
      };
    function applyVacuumState(nextVacuumState: any) {
      if (!nextVacuumState) return;
      ((nextVacuumState = nextVacuumState.newState || nextVacuumState),
        (vacuumStateOptions = nextVacuumState),
        setVacuumPending(isVacuumBusy));
      const vacuumStateAttributes = nextVacuumState.attributes || {},
        vacuumStatus = resolveVacuumStatus(nextVacuumState),
        vacuumStatusText = vacuumStatus.status === "等待状态" ? "—" : vacuumStatus.status,
        active = vacuumStatus.active,
        paused = vacuumStatus.paused,
        returning = vacuumStatus.returning,
        cleaningModeKey = normalizeActionKey(vacuumStateAttributes.cleaning_mode),
        isSweepingMode = ["sweeping", "sweeping_and_mopping", "mopping_after_sweeping"].includes(
          cleaningModeKey,
        ),
        isMoppingMode = ["mopping", "sweeping_and_mopping", "mopping_after_sweeping"].includes(
          cleaningModeKey,
        ),
        supportedActionSet = new Set(vacuumSupportedActions2(nextVacuumState));
      for (const [actionKeyName, actionRecord] of vacuumActionsByService)
        actionRecord.button.hidden =
          !supportedActionSet.has(actionKeyName) ||
          !!(interaction3dInstance && actionKeyName === "clean_spot");
      const visibleActions = [...vacuumActionsByService.values()].filter(
          (filteredAction) => !filteredAction.button.hidden,
        ),
        visibleActionCount = visibleActions.length;
      ((vacuumActions.hidden = visibleActionCount === 0),
        vacuumActions.classList.toggle("has-many-actions", visibleActionCount > 3));
      for (const actionItem of vacuumActionsByService.values())
        actionItem.button.classList.remove("is-last-row-pair", "is-last-row-single");
      const lastRowActionCount = visibleActionCount % 3 || Math.min(visibleActionCount, 3);
      if (lastRowActionCount === 2) {
        for (const lastRowAction of visibleActions.slice(-2))
          lastRowAction.button.classList.add("is-last-row-pair");
      } else
        lastRowActionCount === 1 &&
          visibleActions.at(-1)?.button.classList.add("is-last-row-single");
      ((vacuumSubtitleLabel.textContent = vacuumStatusText),
        vacuumSubtitleLabel.classList.toggle("is-active", active && !paused),
        (vacuumStatusLabel.textContent = vacuumStatusText),
        syncBatteryValue(),
        vacuumVisualElement.classList.toggle("is-working", vacuumStatus.moving),
        vacuumVisualElement.classList.toggle("is-paused", paused),
        vacuumVisualElement.classList.toggle("is-returning", returning),
        vacuumVisualElement.classList.toggle("is-sweeping", isSweepingMode),
        vacuumVisualElement.classList.toggle("is-mopping", isMoppingMode),
        (vacuumAreaStatElement.textContent =
          formatVacuumNumber(vacuumStateAttributes.cleaned_area) + " m²"),
        (vacuumTimeStatElement.textContent =
          formatVacuumNumber(vacuumStateAttributes.cleaning_time) + " min"),
        startAction!.button.classList.toggle("active", vacuumStatus.moving && !returning),
        pauseAction!.button.classList.toggle("active", paused),
        stopAction!.button.classList.toggle("active", false),
        returnToBaseAction!.button.classList.toggle("active", returning),
        locateAction!.button.classList.toggle("active", false),
        cleanSpotAction!.button.classList.toggle(
          "active",
          active && !paused && !returning && nextVacuumState.state === "cleaning",
        ),
        (startAction!.name.textContent = paused ? "继续清扫" : "开始清扫"),
        syncCleaningModeOptions());
      const errorText = String(vacuumStateAttributes.error || "").trim(),
        warningText = String(vacuumStateAttributes.low_water_warning || "").trim(),
        vacuumWarnings: any[] = [];
      (errorText && !/^no error$/i.test(errorText) && vacuumWarnings.push(errorText),
        warningText && !/^no warning$/i.test(warningText) && vacuumWarnings.push(warningText),
        (vacuumWarningNote.textContent = vacuumWarnings.length
          ? "注意：" + vacuumWarnings.join(" · ")
          : ""),
        (vacuumWarningNote.hidden = !vacuumWarnings.length));
    }
    (startAction!.button.addEventListener("click", () =>
      callVacuumService(
        "vacuum",
        vacuumActionService2(vacuumStateOptions, "start"),
        vacuumEntityId,
        {},
        {
          ...vacuumStateOptions,
          state: "cleaning",
          attributes: {
            ...(vacuumStateOptions.attributes || {}),
            status: "cleaning",
            vacuum_state: "cleaning",
            paused: false,
            returning: false,
          },
        },
      ),
    ),
      pauseAction!.button.addEventListener("click", () =>
        callVacuumService(
          "vacuum",
          "pause",
          vacuumEntityId,
          {},
          {
            ...vacuumStateOptions,
            state: "paused",
            attributes: {
              ...(vacuumStateOptions.attributes || {}),
              status: "paused",
              vacuum_state: "paused",
              paused: true,
              returning: false,
            },
          },
        ),
      ),
      returnToBaseAction!.button.addEventListener("click", () =>
        callVacuumService(
          "vacuum",
          "return_to_base",
          vacuumEntityId,
          {},
          {
            ...vacuumStateOptions,
            state: "returning",
            attributes: {
              ...(vacuumStateOptions.attributes || {}),
              status: "returning",
              vacuum_state: "returning",
              paused: false,
              returning: true,
            },
          },
        ),
      ),
      stopAction!.button.addEventListener("click", () =>
        callVacuumService(
          "vacuum",
          vacuumActionService2(vacuumStateOptions, "stop"),
          vacuumEntityId,
          {},
          {
            ...vacuumStateOptions,
            state: "idle",
            attributes: {
              ...(vacuumStateOptions.attributes || {}),
              status: "idle",
              vacuum_state: "idle",
              paused: false,
              returning: false,
            },
          },
        ),
      ),
      locateAction!.button.addEventListener("click", () =>
        callVacuumService("vacuum", "locate", vacuumEntityId, {}),
      ),
      cleanSpotAction!.button.addEventListener("click", () =>
        callVacuumService(
          "vacuum",
          "clean_spot",
          vacuumEntityId,
          {},
          {
            ...vacuumStateOptions,
            state: "cleaning",
            attributes: {
              ...(vacuumStateOptions.attributes || {}),
              status: "cleaning",
              vacuum_state: "cleaning",
              paused: false,
              returning: false,
            },
          },
        ),
      ),
      applyVacuumState(vacuumStateOptions));
    const vacuumOverlay = document.createElement("div");
    ((vacuumOverlay.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (vacuumOverlay.tabIndex = -1),
      vacuumOverlay.append(vacuumDialog),
      this.container.append(vacuumOverlay),
      (this.detailsDialog = vacuumDialog));
    const vacuumHandlersByEntityId = new Map([[vacuumEntityId, [applyVacuumState]]]);
    (cleaningModeEntityId && vacuumHandlersByEntityId.set(cleaningModeEntityId, [syncCleaningMode]),
      batteryEntityId && vacuumHandlersByEntityId.set(batteryEntityId, [syncBatteryState]));
    for (const [handlerEntityId, handler] of waterHeaterExtensionControls2?.stateHandlers || [])
      vacuumHandlersByEntityId.set(handlerEntityId, handler);
    for (const vacuumStatusEntity of statusEntities) {
      const entityHandlers = vacuumHandlersByEntityId.get(vacuumStatusEntity.entityId) || [];
      (entityHandlers.push((interaction3dInstanceStateHandlerFunction) => {
        (statesByEntityId.set(
          vacuumStatusEntity.entityId,
          interaction3dInstanceStateHandlerFunction,
        ),
          applyVacuumState(vacuumStateOptions));
      }),
        vacuumHandlersByEntityId.set(vacuumStatusEntity.entityId, entityHandlers));
    }
    this.detailsStateSync = {
      dialog: vacuumDialog,
      handlers: vacuumHandlersByEntityId,
    };
    let vacuumResizeObserver: any = null;
    if (interaction3dInstance) {
      (vacuumOverlay.classList.add("i3d-vacuum-dialog-layer"),
        (interaction3dInstance.root || this.container).append(vacuumOverlay),
        vacuumDialog.style.setProperty(
          "--i3d-panel-opacity",
          String(
            Math.max(
              0,
              Math.min(
                100,
                Number.isFinite(interaction3dInstance.popupOpacity)
                  ? interaction3dInstance.popupOpacity
                  : 74,
              ),
            ) / 100,
          ),
        ));
      const resizeVacuumDialog = () => {
        const container2 = interaction3dInstance.root || this.container,
          presentationLayout = interaction3dInstance.getPresentationLayout?.(),
          isFixedUiLayout =
            presentationLayout?.fixedUi === true &&
            presentationLayout?.sourceWidth > 0 &&
            presentationLayout?.sourceHeight > 0,
          clientWidth = container2.clientWidth,
          clientHeight = container2.clientHeight,
          sourceWidth2 = isFixedUiLayout
            ? presentationLayout.sourceWidth
            : presentationLayout?.width > 0
              ? presentationLayout.width
              : clientWidth,
          sourceHeight2 = isFixedUiLayout
            ? presentationLayout.sourceHeight
            : presentationLayout?.height > 0
              ? presentationLayout.height
              : clientHeight,
          scaleX = clientWidth / Math.max(1, sourceWidth2),
          scaleY = clientHeight / Math.max(1, sourceHeight2),
          dialogMaxHeight = Math.max(12, Math.min(sourceHeight2 * 0.56 - 400, sourceHeight2 - 812)),
          popupPlacement = popupPlacement2({
            width: sourceWidth2,
            height: sourceHeight2,
            panelWidth: 360,
            panelHeight:
              Math.max(
                vacuumDialog.scrollHeight ? vacuumDialog.scrollHeight + 2 : 0,
                vacuumDialog.offsetHeight || 0,
              ) || 400,
            defaultScale: 2,
            defaultTop: dialogMaxHeight,
            settings: interaction3dInstance.getPopupLayout?.(),
          }),
          renderedScaleX = popupPlacement.scale * scaleX,
          renderedScaleY = popupPlacement.scale * scaleY,
          renderedTop = popupPlacement.top * scaleY;
        ((vacuumDialog.style.top = renderedTop + "px"),
          (vacuumDialog.style.right = popupPlacement.right * scaleX + "px"),
          (vacuumDialog.style.transform = "scale(" + renderedScaleX + "," + renderedScaleY + ")"),
          (vacuumDialog.style.maxHeight = "none"));
      };
      ((vacuumDialog.resizeInteraction3d = resizeVacuumDialog),
        (vacuumResizeObserver = new ResizeObserver(resizeVacuumDialog)),
        vacuumResizeObserver.observe(interaction3dInstance.root || this.container),
        vacuumResizeObserver.observe(vacuumDialog),
        interaction3dInstance.frame && vacuumResizeObserver.observe(interaction3dInstance.frame),
        resizeVacuumDialog());
    } else
      this.registerRuntimeDialogScale(
        vacuumOverlay,
        vacuumDialog,
        840,
        waterHeaterExtensionControls2 ? 560 : 458,
      );
    (vacuumCloseButton.addEventListener("click", () => vacuumDialog.close()),
      this.bindRuntimeDialogOutsideDismiss(vacuumOverlay, vacuumDialog, vacuumCard),
      vacuumOverlay.addEventListener("keydown", (vacuumOverlayKeyEvent) => {
        vacuumOverlayKeyEvent.key === "Escape" && vacuumDialog.close();
      }),
      vacuumDialog.addEventListener(
        "close",
        () => {
          ((isVacuumActioning = true),
            vacuumResizeObserver?.disconnect(),
            this.clearRuntimeDialogScale(vacuumDialog),
            this.detailsDialog === vacuumDialog && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === vacuumDialog && (this.detailsStateSync = null),
            vacuumOverlay.remove());
        },
        {
          once: true,
        },
      ),
      vacuumDialog.show(),
      vacuumDialog.resizeInteraction3d?.());
  }
