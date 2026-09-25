/*
 * 设备控件区块：电动床详情（升降姿态、预设位与加载中的占位弹窗）。
 */

// 「按 ID / 按实体取域」只有一份实现（唯一一处与内联旧写法有行为差异的是组合弹窗里
// `moduleResolvedEntityId` 可能整个缺席（`undefined`）的那条 —— 旧写法抛 `TypeError`，
// 现在归一成 `""`，渲染得更稳，不改变「是不是 button」的判定）。
import { entityDomainFromId, entityDomainOf } from "../../../../utils/entities.js?v=2609251851";
import { resolveStateEntry } from "../../../../utils/state-entry.js?v=2609251851";
import { entityMetadataIsAvailable } from "../../entity-metadata.js?v=2609251851";
import { componentDialogTitle } from "../primitives.js?v=2609251851";

export const electricBedDetailsMethods = {
  /**
   * 打开电动床详情弹窗（靠背 / 腿部 / 整体升降与预设姿态）。
   *
   * @throws {Error} 组件没有绑定实体。
   */
  showElectricBedDetails(bedDetailsComponent, { preview: bedDetailsPreview = false } = {}) {
    const bedEntityId = bedDetailsComponent.bindings?.entity?.entityId;
    if (!bedEntityId) {
      throw new Error("该电动床控件没有关联实体。");
    }
    const bedDeviceProfileEntry = this.deviceProfile(bedEntityId);
    const electricBedRoles = bedDeviceProfileEntry?.roles || {};
    const bedControlRoles = [
      ["backrest", "靠背角度"],
      ["leg", "腿部角度"],
      ["waist", "腰部角度"]
    ]
      .map(([bedRole, bedRoleLabel]) => ({
        role: bedRole,
        label: bedRoleLabel,
        entityId: String(electricBedRoles[bedRole] || "")
      }))
      .filter(bedRoleEntry => bedRoleEntry.entityId);
    const bedModeRoleEntityId = String(electricBedRoles.mode || "");
    const bedEntityMetadata = this.entityMetadata.get(bedEntityId);
    const bedControlEntityIds = bedEntityMetadata?.deviceId
      ? [...this.entityMetadata.values()]
          .filter(
            bedMetadataEntry =>
              bedMetadataEntry.deviceId === bedEntityMetadata.deviceId &&
              ["button", "select"].includes(entityDomainOf(bedMetadataEntry)) &&
              bedMetadataEntry.entityId !== electricBedRoles.mode &&
              entityMetadataIsAvailable(bedMetadataEntry)
          )
          .sort((leftBedEntry, rightBedEntry) =>
            String(leftBedEntry.entityId || "").localeCompare(String(rightBedEntry.entityId || ""))
          )
          .map(bedControlMetadata => bedControlMetadata.entityId)
      : [];
    const electricBedMemoryEntityIds = [
      ...new Set(
        [
          String(electricBedRoles.memory1 || ""),
          String(electricBedRoles.memory2 || ""),
          ...bedControlEntityIds
        ].filter(Boolean)
      )
    ].slice(0, 2);
    this.closeRuntimeDialog();
    const bedDetailsDialog = document.createElement("dialog");
    bedDetailsDialog.className = "hb-entity-details-dialog electric-bed-details";
    const bedDetailsCard = document.createElement("div");
    bedDetailsCard.className = "hb-entity-details-card";
    const bedDetailsHeading = document.createElement("div");
    bedDetailsHeading.className = "hb-entity-details-heading";
    const bedTitleRow = document.createElement("div");
    const bedTitleText = document.createElement("strong");
    bedTitleText.textContent = componentDialogTitle(
      bedDetailsComponent,
      bedDeviceProfileEntry?.deviceName || "电动床"
    );
    const bedStatusText = document.createElement("span");
    bedTitleRow.append(bedTitleText, bedStatusText);
    const bedCloseButton = document.createElement("button");
    bedCloseButton.type = "button";
    bedCloseButton.textContent = "×";
    bedCloseButton.setAttribute("aria-label", "关闭电动床详情");
    bedDetailsHeading.append(bedTitleRow, bedCloseButton);
    const bedDetailsBody = document.createElement("div");
    bedDetailsBody.className = "hb-electric-bed-details-body";
    const bedVisualPanel = document.createElement("section");
    bedVisualPanel.className = "hb-electric-bed-visual";
    const bedModelFigure = document.createElement("div");
    bedModelFigure.className = "hb-electric-bed-model";
    const bedMattressShape = document.createElement("i");
    bedMattressShape.className = "hb-electric-bed-mattress";
    const bedBackShape = document.createElement("i");
    bedBackShape.className = "hb-electric-bed-back";
    const bedWaistShape = document.createElement("i");
    bedWaistShape.className = "hb-electric-bed-waist";
    const bedLegsShape = document.createElement("i");
    bedLegsShape.className = "hb-electric-bed-legs";
    const bedBaseShape = document.createElement("i");
    bedBaseShape.className = "hb-electric-bed-base";
    bedModelFigure.append(
      bedMattressShape,
      bedBackShape,
      bedWaistShape,
      bedLegsShape,
      bedBaseShape
    );
    /**
     * 创建电动床详情里的一个角度读数块（数值 + 说明）。
     */
    const createElectricBedReadout = (readoutModifierClass, readoutCaption) => {
      const readoutElement = document.createElement("span");
      readoutElement.className = "hb-electric-bed-angle-readout " + readoutModifierClass;
      const readoutValueElement = document.createElement("strong");
      const readoutCaptionElement = document.createElement("small");
      readoutCaptionElement.textContent = readoutCaption;
      readoutElement.append(readoutValueElement, readoutCaptionElement);
      return {
        readout: readoutElement,
        value: readoutValueElement
      };
    };
    const backrestReadout = createElectricBedReadout("back", "靠背");
    const waistReadout = createElectricBedReadout("waist", "腰部");
    const legReadout = createElectricBedReadout("legs", "腿部");
    const bedPrimaryStatusText = document.createElement("strong");
    const bedSecondaryStatusText = document.createElement("small");
    bedVisualPanel.append(
      bedModelFigure,
      backrestReadout.readout,
      waistReadout.readout,
      legReadout.readout,
      bedPrimaryStatusText,
      bedSecondaryStatusText
    );
    const bedUtilitiesPanel = document.createElement("section");
    bedUtilitiesPanel.className = "hb-electric-bed-utilities";
    const bedMainPanel = document.createElement("section");
    bedMainPanel.className = "hb-electric-bed-main";
    const bedAngleControlsPanel = document.createElement("section");
    bedAngleControlsPanel.className = "hb-electric-bed-angle-controls";
    const bedStateHandlers = new Map();
    const bedControlBindings = [];
    /**
     * 读电动床某个实体的状态，缺失时返回 unknown 占位对象。
     *
     * 占位对象让能力控件可以直接按状态对象渲染首帧，不必在控件内部再判空。
     */
    const readBedEntityState = electricBedEntityId => {
      const bedEntityState = this.states.get(electricBedEntityId);
      return (
        resolveStateEntry(bedEntityState, {
          entityId: electricBedEntityId,
          state: "unknown",
          attributes: {}
        })
      );
    };
    /**
     * 往电动床详情弹窗追加某个角色的能力控件，并登记状态回调与清理函数。
     * bedStateHandlers 把该实体的后续推送转给控件；bedControlBindings 记下清理函数与角色名，
     * 弹窗关闭时统一解绑，避免内部监听随弹窗泄漏。
     */
    const addBedRoleControl = (
      roleLabel,
      bedControlRoleEntityId,
      bedControlVariant = "",
      controlHost = bedAngleControlsPanel
    ) => {
      const roleEntityState = readBedEntityState(bedControlRoleEntityId);
      const roleControlElement = document.createElement("section");
      roleControlElement.className = "hb-electric-bed-control";
      if (roleLabel === "模式") {
        roleControlElement.classList.add("hb-electric-bed-mode");
      }
      const roleControlLabel = document.createElement("strong");
      roleControlLabel.textContent = roleLabel;
      const bedRoleCapabilityControls = this.createCapabilityDetailsControls(
        bedControlRoleEntityId,
        roleEntityState,
        {
          interactive: !bedDetailsPreview,
          variant: bedControlVariant
        }
      );
      bedRoleCapabilityControls.classList.add("hb-electric-bed-capability");
      roleControlElement.append(roleControlLabel, bedRoleCapabilityControls);
      controlHost.append(roleControlElement);
      /**
       * 把角色实体的最新状态转给对应的能力控件。
       */
      const syncRoleCapability = roleCapabilityState =>
        bedRoleCapabilityControls.syncCapabilityState?.(roleCapabilityState);
      bedStateHandlers.set(bedControlRoleEntityId, [syncRoleCapability]);
      bedControlBindings.push({
        role: roleLabel,
        entityId: bedControlRoleEntityId,
        sync: syncRoleCapability,
        cleanup: () => bedRoleCapabilityControls.cleanupCapabilityDetails?.()
      });
    };
    for (const electricBedRoleEntry of bedControlRoles) {
      addBedRoleControl(electricBedRoleEntry.label, electricBedRoleEntry.entityId);
    }
    if (bedModeRoleEntityId) {
      addBedRoleControl("模式", bedModeRoleEntityId, "electric-bed", bedUtilitiesPanel);
    } else {
      const modeControlElement = document.createElement("section");
      modeControlElement.className = "hb-electric-bed-control hb-electric-bed-mode is-unavailable";
      const modeControlLabel = document.createElement("strong");
      modeControlLabel.textContent = "模式";
      const modeSelectElement = document.createElement("select");
      modeSelectElement.className = "hb-capability-select";
      modeSelectElement.disabled = true;
      modeSelectElement.setAttribute("aria-label", "模式");
      const modePlaceholderOption = document.createElement("option");
      modePlaceholderOption.textContent = "未识别到模式实体";
      modeSelectElement.append(modePlaceholderOption);
      modeControlElement.append(modeControlLabel, modeSelectElement);
      bedUtilitiesPanel.append(modeControlElement);
    }
    const bedMemoryPanel = document.createElement("section");
    bedMemoryPanel.className = "hb-electric-bed-memory";
    const bedMemoryTitle = document.createElement("strong");
    bedMemoryTitle.textContent = "记忆姿势";
    const bedMemoryList = document.createElement("div");
    bedMemoryList.className = "hb-electric-bed-memory-list";
    for (let memorySlotIndex = 0; memorySlotIndex < 2; memorySlotIndex += 1) {
      const memorySlotEntityId = electricBedMemoryEntityIds[memorySlotIndex] || "";
      const memorySlotMetadata = memorySlotEntityId
        ? this.entityMetadata.get(memorySlotEntityId)
        : null;
      if (entityDomainFromId(memorySlotEntityId) === "select") {
        const memorySlotElement = document.createElement("section");
        memorySlotElement.className = "hb-electric-bed-memory-control hb-electric-bed-control";
        const memorySlotLabel = document.createElement("strong");
        memorySlotLabel.textContent = "记忆姿势 " + (memorySlotIndex + 1);
        const memorySlotControls = this.createCapabilityDetailsControls(
          memorySlotEntityId,
          readBedEntityState(memorySlotEntityId),
          {
            interactive: !bedDetailsPreview,
            variant: "electric-bed-memory",
            selectLabel: "姿势"
          }
        );
        memorySlotControls.classList.add("hb-electric-bed-capability");
        memorySlotElement.append(memorySlotLabel, memorySlotControls);
        bedMemoryList.append(memorySlotElement);
        /**
         * 把「记忆姿势」槽位实体的最新状态转给对应的能力控件。
         */
        const syncMemorySlotCapability = memorySlotState =>
          memorySlotControls.syncCapabilityState?.(memorySlotState);
        bedStateHandlers.set(memorySlotEntityId, [syncMemorySlotCapability]);
        bedControlBindings.push({
          role: "memory" + (memorySlotIndex + 1),
          entityId: memorySlotEntityId,
          sync: syncMemorySlotCapability,
          cleanup: () => memorySlotControls.cleanupCapabilityDetails?.()
        });
        continue;
      }
      const memoryButton = document.createElement("button");
      memoryButton.type = "button";
      memoryButton.className = "hb-electric-bed-memory-button";
      memoryButton.textContent =
        memorySlotMetadata?.name ||
        memorySlotMetadata?.originalName ||
        "记忆姿势 " + (memorySlotIndex + 1);
      memoryButton.disabled = bedDetailsPreview || !memorySlotEntityId;
      memoryButton.classList.toggle("is-unavailable", !memorySlotEntityId);
      memoryButton.addEventListener("click", async () => {
        if (!bedDetailsPreview && !!memorySlotEntityId && !memoryButton.disabled) {
          memoryButton.disabled = true;
          memoryButton.classList.add("is-pending");
          try {
            await this.callEntityService("button", "press", memorySlotEntityId);
            memoryButton.classList.add("is-success");
            window.setTimeout(() => memoryButton.classList.remove("is-success"), 900);
          } catch (memoryButtonError) {
            this.options.onError?.(memoryButtonError);
          } finally {
            memoryButton.classList.remove("is-pending");
            memoryButton.disabled = bedDetailsPreview || !memorySlotEntityId;
          }
        }
      });
      bedMemoryList.append(memoryButton);
    }
    bedMemoryPanel.append(bedMemoryTitle, bedMemoryList);
    bedUtilitiesPanel.append(bedMemoryPanel);
    if (!bedControlRoles.length) {
      const bedEmptyHint = document.createElement("p");
      bedEmptyHint.className = "hb-electric-bed-empty";
      bedEmptyHint.textContent = "暂未识别到角度实体";
      bedAngleControlsPanel.append(bedEmptyHint);
    }
    bedMainPanel.append(bedVisualPanel, bedAngleControlsPanel);
    bedDetailsBody.append(bedUtilitiesPanel, bedMainPanel);
    bedDetailsCard.append(bedDetailsHeading, bedDetailsBody);
    bedDetailsDialog.append(bedDetailsCard);
    /**
     * 把角度实体的状态换算成 0~100 的百分比，用于驱动床模型的倾斜幅度。
     * 有 min/max 时按区间归一化；缺失或区间非法（max ≤ min）时把状态值当百分比用 ——
     * 有些床的角度实体本就是 0~100 的无量纲数值；取不到数值时返回 0，让模型回到平躺。
     */
    const bedAnglePercent = (angleRoleId, angleEntityState) => {
      const angleStateValue = Number(angleEntityState?.state);
      const angleMinValue = Number(angleEntityState?.attributes?.min);
      const angleMaxValue = Number(angleEntityState?.attributes?.max);
      if (Number.isFinite(angleStateValue)) {
        if (
          !Number.isFinite(angleMinValue) ||
          !Number.isFinite(angleMaxValue) ||
          angleMaxValue <= angleMinValue
        ) {
          return Math.max(0, Math.min(100, angleStateValue));
        } else {
          return Math.max(
            0,
            Math.min(
              100,
              ((angleStateValue - angleMinValue) / (angleMaxValue - angleMinValue)) * 100
            )
          );
        }
      } else {
        return 0;
      }
    };
    /**
     * 刷新电动床详情的三个角度读数、模型倾角与状态文案。
     * 模型倾角 = 百分比 × 负系数（靠背 -0.42、腿部 -0.28、腰部 -0.1，单位 deg）：
     * 系数是视觉标定值，让各部位活动幅度协调、并非真实角度；取负因 CSS 旋转正方向与抬起相反。
     */
    const refreshBedReadouts = () => {
      const backrestEntityState = readBedEntityState(electricBedRoles.backrest);
      const legEntityState = readBedEntityState(electricBedRoles.leg);
      const waistEntityState = readBedEntityState(electricBedRoles.waist);
      /**
       * 把角度实体的状态格式化成读数文本（数值 + 单位）。
       *
       * 单位取实体自带的 unit_of_measurement，缺省为度；状态不是数值时显示 "--"。
       */
      const formatAngleReading = angleReadingState => {
        const angleReadingValue = Number(angleReadingState?.state);
        if (!Number.isFinite(angleReadingValue)) {
          return "--";
        }
        const angleUnit = String(angleReadingState?.attributes?.unit_of_measurement || "°");
        return "" + angleReadingValue + angleUnit;
      };
      backrestReadout.value.textContent = formatAngleReading(backrestEntityState);
      waistReadout.value.textContent = formatAngleReading(waistEntityState);
      legReadout.value.textContent = formatAngleReading(legEntityState);
      bedVisualPanel.style.setProperty(
        "--hb-bed-backrest-angle",
        bedAnglePercent(electricBedRoles.backrest, backrestEntityState) * -0.42 + "deg"
      );
      bedVisualPanel.style.setProperty(
        "--hb-bed-leg-angle",
        bedAnglePercent(electricBedRoles.leg, legEntityState) * -0.28 + "deg"
      );
      bedVisualPanel.style.setProperty(
        "--hb-bed-waist-angle",
        bedAnglePercent(electricBedRoles.waist, waistEntityState) * -0.1 + "deg"
      );
      const electricBedAngleStates = [backrestEntityState, legEntityState, waistEntityState].map(
        angleStateEntry => String(angleStateEntry?.state || "").toLowerCase()
      );
      const hasUnavailableAngle = electricBedAngleStates.some(
        angleStateText => angleStateText === "unavailable"
      );
      const isReadingAngles =
        !hasUnavailableAngle &&
        electricBedAngleStates.some(
          angleStateCandidate => angleStateCandidate === "unknown" || !angleStateCandidate
        );
      bedPrimaryStatusText.textContent = hasUnavailableAngle
        ? "部分实体不可用"
        : isReadingAngles
          ? "正在读取实体"
          : "设备在线";
      bedSecondaryStatusText.textContent =
        bedControlRoles.length === 3 ? "三个角度独立控制" : "正在读取电动床实体";
      bedStatusText.textContent = hasUnavailableAngle ? "部分功能不可用" : "";
    };
    refreshBedReadouts();
    for (const bedControlRoleEntry of bedControlRoles) {
      bedStateHandlers.get(bedControlRoleEntry.entityId)?.push(() => {
        refreshBedReadouts();
      });
    }
    if (bedModeRoleEntityId) {
      bedStateHandlers.get(bedModeRoleEntityId)?.push(() => refreshBedReadouts());
    }
    this.detailsStateSync = {
      dialog: bedDetailsDialog,
      handlers: bedStateHandlers
    };
    const bedDialogLayer = document.createElement("div");
    bedDialogLayer.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    bedDialogLayer.tabIndex = -1;
    bedDialogLayer.append(bedDetailsDialog);
    this.container.append(bedDialogLayer);
    this.detailsDialog = bedDetailsDialog;
    this.registerRuntimeDialogScale(bedDialogLayer, bedDetailsDialog, 760, 560);
    bedCloseButton.addEventListener("click", () => bedDetailsDialog.close());
    this.bindRuntimeDialogOutsideDismiss(bedDialogLayer, bedDetailsDialog, bedDetailsCard);
    this.bindRuntimeDialogEscapeClose(bedDialogLayer, bedDetailsDialog);
    bedDetailsDialog.addEventListener(
      "close",
      () => {
        for (const bedControlBinding of bedControlBindings) {
          bedControlBinding.cleanup?.();
        }
        this.clearRuntimeDialogScale(bedDetailsDialog);
        if (this.detailsDialog === bedDetailsDialog) {
          this.detailsDialog = null;
        }
        if (this.detailsStateSync?.dialog === bedDetailsDialog) {
          this.detailsStateSync = null;
        }
        bedDialogLayer.remove();
      },
      {
        once: true
      }
    );
    this.presentRuntimeDialog(bedDialogLayer, bedDetailsDialog);
  },
  /**
   * 打开电动床的「加载中」占位弹窗。
   * 电动床的能力要靠设备画像判断，画像未到时先给占位以免用户以为点击没反应；
   * 组件未绑定实体时静默返回 —— 连占位都没法定位。
   */
  showElectricBedLoadingDetails(bedLoadingComponent, { preview: bedLoadingPreview = false } = {}) {
    if (!bedLoadingComponent.bindings?.entity?.entityId) {
      return;
    }
    this.closeRuntimeDialog();
    const bedDialogElement = document.createElement("dialog");
    bedDialogElement.className =
      "hb-entity-details-dialog electric-bed-details electric-bed-loading-details";
    bedDialogElement.tabIndex = -1;
    const bedCardElement = document.createElement("div");
    bedCardElement.className = "hb-entity-details-card";
    const bedHeadingElement = document.createElement("div");
    bedHeadingElement.className = "hb-entity-details-heading";
    const bedTitleElement = document.createElement("strong");
    bedTitleElement.textContent = componentDialogTitle(bedLoadingComponent, "电动床");
    bedHeadingElement.append(bedTitleElement);
    const bedDialogBodyElement = document.createElement("section");
    bedDialogBodyElement.className = "hb-electric-bed-loading-body";
    const bedLoadingSectionElement = document.createElement("section");
    bedLoadingSectionElement.className = "hb-climate-details-loading is-loading";
    const bedLoadingIconElement = document.createElement("i");
    bedLoadingIconElement.setAttribute("aria-hidden", "true");
    const bedLoadingTitleElement = document.createElement("strong");
    bedLoadingTitleElement.textContent = "正在加载设备状态…";
    const bedLoadingHintElement = document.createElement("span");
    bedLoadingHintElement.textContent = "状态到达后会自动显示，无需重新打开弹窗";
    bedLoadingSectionElement.append(
      bedLoadingIconElement,
      bedLoadingTitleElement,
      bedLoadingHintElement
    );
    bedDialogBodyElement.append(bedLoadingSectionElement);
    bedCardElement.append(bedHeadingElement, bedDialogBodyElement);
    bedDialogElement.append(bedCardElement);
    const bedDialogLayerElement = document.createElement("div");
    bedDialogLayerElement.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    bedDialogLayerElement.tabIndex = -1;
    bedDialogLayerElement.append(bedDialogElement);
    this.container.append(bedDialogLayerElement);
    this.detailsDialog = bedDialogElement;
    this.registerRuntimeDialogScale(bedDialogLayerElement, bedDialogElement, 760, 420);
    this.bindRuntimeDialogOutsideDismiss(bedDialogLayerElement, bedDialogElement, bedCardElement);
    this.bindRuntimeDialogEscapeClose(bedDialogLayerElement, bedDialogElement);
    bedDialogElement.addEventListener(
      "close",
      () => {
        this.clearRuntimeDialogScale(bedDialogElement);
        if (this.detailsDialog === bedDialogElement) {
          this.detailsDialog = null;
        }
        bedDialogLayerElement.remove();
      },
      {
        once: true
      }
    );
    this.presentRuntimeDialog(bedDialogLayerElement, bedDialogElement);
    bedDialogElement.focus({
      preventScroll: true
    });
  }
};
