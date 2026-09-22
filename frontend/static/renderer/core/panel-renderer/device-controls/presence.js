/*
 * 设备控件区块：存在传感器详情（在场时长、最近触发与历史时间线）。
 */

import { formatZhDateTime } from "../../../../utils/datetime.js?v=2609221415";
import {
  formatPresenceDuration,
  presenceHistoryBuckets,
  presenceMotionEventConfig,
  presenceSensorPresentation,
  presenceStateTimestamp,
  renderRegisteredComponent
} from "../../registry.js?v=2609221415";
import { paletteColor } from "../../../../utils/colors.js?v=2609221415";
import { resolveStateEntry } from "../../../../utils/state-entry.js?v=2609221415";
import { componentDialogTitle } from "../primitives.js?v=2609221415";

export const presenceDetailsMethods = {
  /**
   * 打开人体存在传感器详情弹窗（活动曲线、停留时长、触发事件）。
   * 传感器种类由实体与设备画像判定，不同种类展示的区块不同，故先定种类再建控件。
   * @throws {Error} 组件没有绑定实体。
   */
  showPresenceDetails(presenceComponent, { preview: presencePreview = false } = {}) {
    const presenceEntityId = presenceComponent.bindings?.entity?.entityId;
    if (!presenceEntityId) {
      throw new Error("该控件没有关联实体。");
    }
    this.closeRuntimeDialog();
    const presenceSensorKind = [
      "presence",
      "door-window",
      "water-leak",
      "smoke",
      "natural-gas"
    ].includes(presenceComponent.properties?.sensorKind)
      ? presenceComponent.properties.sensorKind
      : "presence";
    const presenceCopy = {
      presence: {
        title: "人在检测",
        occupied: "有人",
        clear: "无人",
        unavailable: "传感器离线",
        unknown: "等待状态",
        hintOccupied: "空间内检测到人",
        hintClear: "当前空间无人"
      },
      "door-window": {
        title: "门窗状态",
        occupied: "打开",
        clear: "关闭",
        unavailable: "传感器离线",
        unknown: "等待状态",
        hintOccupied: "门窗当前已打开",
        hintClear: "门窗当前已关闭"
      },
      "water-leak": {
        title: "水浸检测",
        occupied: "检测到水浸",
        clear: "正常",
        unavailable: "传感器离线",
        unknown: "等待状态",
        hintOccupied: "传感器检测到水浸",
        hintClear: "当前未检测到水浸"
      },
      smoke: {
        title: "烟雾检测",
        occupied: "检测到烟雾",
        clear: "正常",
        unavailable: "传感器离线",
        unknown: "等待状态",
        hintOccupied: "传感器检测到烟雾",
        hintClear: "当前未检测到烟雾"
      },
      "natural-gas": {
        title: "天然气检测",
        occupied: "检测到天然气",
        clear: "正常",
        unavailable: "传感器离线",
        unknown: "等待状态",
        hintOccupied: "传感器检测到天然气",
        hintClear: "当前未检测到天然气"
      }
    }[presenceSensorKind];
    let presenceState = resolveStateEntry(this.states.get(presenceEntityId), {
      entityId: presenceEntityId,
      state: "unknown",
      attributes: {}
    });
    const presenceHistoryHours = Math.max(
      1,
      Math.min(168, Number(presenceComponent.properties?.historyHours || 24))
    );
    const presenceHistoryPoints = this.historySeries.get(presenceEntityId)?.points || [];
    const presenceOccupiedColor =
      presenceComponent.properties?.iconOnColor ||
      presenceComponent.properties?.occupiedColor ||
      "#ffffff";
    const presenceClearColor =
      presenceComponent.properties?.iconColor ||
      presenceComponent.properties?.clearColor ||
      paletteColor("--hos-sensor", "#9eb0c4");
    /**
     * 把存在感类实体的状态归一成展示所需的 key 与元数据。
     * 人体、门窗、水浸、烟雾、燃气几类传感器判定规则完全不同，统一交给 presenceSensorPresentation；
     * 这里只注入该实体的运动事件配置，并允许覆写「当前时间」以便按历史时间点回放判定。
     */
    const resolvePresencePresentation = (presenceInputState, presenceNow = Date.now()) =>
      presenceSensorPresentation(presenceInputState, "auto", {
        ...presenceMotionEventConfig(
          presenceEntityId,
          presenceInputState,
          this.entityMetadata,
          this.states,
          presenceComponent.properties
        ),
        now: presenceNow
      });
    const presenceDialog = document.createElement("dialog");
    presenceDialog.className = "hb-entity-details-dialog presence-details";
    presenceDialog.dataset.sensorKind = presenceSensorKind;
    presenceDialog.style.setProperty("--hb-presence-occupied", presenceOccupiedColor);
    presenceDialog.style.setProperty("--hb-presence-clear", presenceClearColor);
    const presenceCard = document.createElement("div");
    presenceCard.className = "hb-entity-details-card";
    const presenceHeading = document.createElement("div");
    presenceHeading.className = "hb-entity-details-heading";
    const presenceTitleRow = document.createElement("div");
    const presenceTitleText = document.createElement("strong");
    presenceTitleText.textContent = componentDialogTitle(
      presenceComponent,
      presenceState.attributes?.friendly_name || presenceCopy.title
    );
    const presenceStatusText = document.createElement("span");
    presenceTitleRow.append(presenceTitleText, presenceStatusText);
    const presenceCloseButton = document.createElement("button");
    presenceCloseButton.type = "button";
    presenceCloseButton.textContent = "×";
    presenceCloseButton.setAttribute("aria-label", "关闭弹窗");
    presenceHeading.append(presenceTitleRow, presenceCloseButton);
    const presenceBody = document.createElement("div");
    presenceBody.className = "hb-presence-details-body";
    const presenceVisual = document.createElement("section");
    presenceVisual.className = "hb-presence-details-visual";
    let presenceSensorVisual = null;
    if (presenceSensorKind === "presence") {
      const presenceSpaceElement = document.createElement("span");
      presenceSpaceElement.className = "hb-presence-sensor-space";
      for (let spaceLayerIndex = 0; spaceLayerIndex < 3; spaceLayerIndex += 1) {
        presenceSpaceElement.append(document.createElement("i"));
      }
      const presenceFloorElement = document.createElement("span");
      presenceFloorElement.className = "hb-presence-sensor-floor";
      const presencePersonElement = document.createElement("span");
      presencePersonElement.className = "hb-presence-sensor-person";
      const personHeadElement = document.createElement("i");
      const personBodyElement = document.createElement("b");
      const personLeftArmElement = document.createElement("span");
      personLeftArmElement.className = "arm left";
      const personRightArmElement = document.createElement("span");
      personRightArmElement.className = "arm right";
      const personLeftLegElement = document.createElement("span");
      personLeftLegElement.className = "leg left";
      const personRightLegElement = document.createElement("span");
      personRightLegElement.className = "leg right";
      presencePersonElement.append(
        personHeadElement,
        personBodyElement,
        personLeftArmElement,
        personRightArmElement,
        personLeftLegElement,
        personRightLegElement
      );
      presenceVisual.append(presenceSpaceElement, presenceFloorElement, presencePersonElement);
    } else {
      presenceSensorVisual = renderRegisteredComponent(
        {
          ...presenceComponent,
          position: {
            ...(presenceComponent.position || {}),
            width: 100,
            height: 100
          }
        },
        {
          states: new Map([[presenceEntityId, presenceState]]),
          entityMetadata: this.entityMetadata,
          editable: false,
          previewState: "auto",
          document: this.document
        }
      );
      presenceSensorVisual.classList.add("hb-presence-details-sensor");
      presenceVisual.append(presenceSensorVisual);
    }
    const presenceStateHeadline = document.createElement("strong");
    const presenceStateHint = document.createElement("small");
    presenceVisual.append(presenceStateHeadline, presenceStateHint);
    const presenceMetrics = document.createElement("section");
    presenceMetrics.className = "hb-presence-details-metrics";
    /**
     * 创建存在感弹窗里的一行指标（标签 + 加粗数值）并挂到指标区。
     */
    const createPresenceMetric = metricLabel => {
      const metricElement = document.createElement("div");
      const presenceMetricLabelElement = document.createElement("small");
      presenceMetricLabelElement.textContent = metricLabel;
      const presenceMetricValueElement = document.createElement("strong");
      metricElement.append(presenceMetricLabelElement, presenceMetricValueElement);
      presenceMetrics.append(metricElement);
      return presenceMetricValueElement;
    };
    const presenceCurrentDurationValue = createPresenceMetric("当前状态持续");
    const presenceLastDetectedValue = createPresenceMetric("最近检测到人");
    const presenceOccupiedHoursValue = createPresenceMetric(presenceHistoryHours + " 小时有人时长");
    const presenceTimelineSection = document.createElement("section");
    presenceTimelineSection.className = "hb-presence-details-timeline";
    const presenceTimelineHeader = document.createElement("div");
    const presenceTimelineTitle = document.createElement("strong");
    presenceTimelineTitle.textContent = presenceHistoryHours + " 小时在家时间轴";
    const presenceTimelineLegend = document.createElement("span");
    presenceTimelineLegend.textContent = "亮色为有人";
    presenceTimelineHeader.append(presenceTimelineTitle, presenceTimelineLegend);
    const presenceTimelineTrack = document.createElement("div");
    const presenceTimelineAxis = document.createElement("div");
    presenceTimelineAxis.innerHTML =
      "<span>" + presenceHistoryHours + " 小时前</span><span>现在</span>";
    presenceTimelineSection.append(
      presenceTimelineHeader,
      presenceTimelineTrack,
      presenceTimelineAxis
    );
    presenceBody.append(presenceVisual, presenceMetrics, presenceTimelineSection);
    presenceCard.append(presenceHeading, presenceBody);
    presenceDialog.append(presenceCard);
    /**
     * 把时间戳格式化成「今天 HH:MM」或「MM-DD HH:MM」。
     * 与今天同一天时省略日期以减少视觉噪音，否则补上月日，并把 Intl 默认的 "/" 换成 "-"。
     */
    const formatPresenceTimestamp = timestampMs => {
      if (!Number.isFinite(timestampMs)) {
        return "--";
      }
      const eventDate = new Date(timestampMs);
      const referenceDate = new Date();
      const isSameDay =
        eventDate.getFullYear() === referenceDate.getFullYear() &&
        eventDate.getMonth() === referenceDate.getMonth() &&
        eventDate.getDate() === referenceDate.getDate();
      if (isSameDay) {
        return "今天 " + formatZhDateTime(eventDate, { withDate: false });
      } else {
        return formatZhDateTime(eventDate);
      }
    };
    /**
     * 重绘存在感时间轴：把历史分桶渲染成一行色块，并汇总有人时长。
     * 分桶固定 48 段，色块宽度才稳定不跳动；每块 title 给出「多少分钟前 + 状态」。
     * 桶序号按剩余比例估算分钟数，有人时长按「有人桶数 × 每桶分钟数」折算，避免再遍历历史。
     */
    const renderPresenceTimeline = () => {
      const historyBuckets = presenceHistoryBuckets(
        presenceHistoryPoints,
        presenceState,
        Date.now(),
        presenceHistoryHours,
        48,
        presenceMotionEventConfig(
          presenceEntityId,
          presenceState,
          this.entityMetadata,
          this.states,
          presenceComponent.properties
        )
      );
      presenceTimelineTrack.replaceChildren(
        ...historyBuckets.map((bucketKey, bucketIndex) => {
          const bucketElement = document.createElement("i");
          bucketElement.className = "is-" + bucketKey;
          const minutesAgo = Math.round(
            (presenceHistoryHours * 60 * (historyBuckets.length - bucketIndex - 1)) /
              historyBuckets.length
          );
          bucketElement.title =
            (minutesAgo ? minutesAgo + " 分钟前" : "现在") +
            "：" +
            {
              occupied: "有人",
              clear: "无人",
              unavailable: "离线",
              unknown: "未知"
            }[bucketKey];
          return bucketElement;
        })
      );
      const occupiedBucketCount = historyBuckets.filter(
        bucketState => bucketState === "occupied"
      ).length;
      const occupiedMinutes = Math.round(
        (presenceHistoryHours * 60 * occupiedBucketCount) / Math.max(1, historyBuckets.length)
      );
      presenceOccupiedHoursValue.textContent =
        occupiedMinutes >= 60
          ? Math.floor(occupiedMinutes / 60) + " 小时 " + (occupiedMinutes % 60) + " 分钟"
          : occupiedMinutes + " 分钟";
    };
    /**
     * 求「最近一次检测到人」的时间戳。
     * 同时看两处：历史点里判定为 occupied 的记录，以及当前状态为 occupied 时的状态变更
     * 时间 —— 后者未必已写进历史（历史异步落库），漏掉会显示偏旧时间；都没有则返回 null。
     */
    const lastPresenceTimestamp = () => {
      const presenceMotionConfig = presenceMotionEventConfig(
        presenceEntityId,
        presenceState,
        this.entityMetadata,
        this.states,
        presenceComponent.properties
      );
      const motionTimestamps = presenceHistoryPoints
        .map(historyPoint => ({
          timestamp: Date.parse(historyPoint?.timestamp),
          state: {
            state: historyPoint?.value
          }
        }))
        .filter(
          candidateMotionPoint =>
            Number.isFinite(candidateMotionPoint.timestamp) &&
            presenceSensorPresentation(
              {
                state: candidateMotionPoint?.state?.state,
                lastChanged: new Date(candidateMotionPoint.timestamp).toISOString()
              },
              "auto",
              {
                ...presenceMotionConfig,
                now: candidateMotionPoint.timestamp,
                noMotionSeconds: null,
                noMotionStateTimestamp: null
              }
            ).key === "occupied"
        );
      const stateChangedAt = presenceStateTimestamp(presenceState);
      if (
        resolvePresencePresentation(presenceState).key === "occupied" &&
        Number.isFinite(stateChangedAt)
      ) {
        motionTimestamps.push({
          timestamp: stateChangedAt
        });
      }
      if (motionTimestamps.length) {
        return Math.max(...motionTimestamps.map(motionPoint => motionPoint.timestamp));
      } else {
        return null;
      }
    };
    /**
     * 按传感器最新状态刷新存在感弹窗：状态文案、图形态与各项指标。
     * 图形类名因传感器类型而异（门窗 open、水浸 wet、烟雾 / 燃气 alert），不能统一套
     * occupied，故按 kind 分别组装；本函数只按当前状态重算，持续时长推进由外层每秒触发。
     */
    const renderPresenceState = nextPresenceState => {
      presenceState = nextPresenceState || presenceState;
      const presencePresentation = resolvePresencePresentation(presenceState);
      const presenceStateChangedAt = presenceStateTimestamp(presenceState);
      presenceDialog.dataset.presenceState = presencePresentation.key;
      presenceVisual.className = "hb-presence-details-visual is-" + presencePresentation.key;
      const presenceStatusLabel = presenceCopy[presencePresentation.key] || presenceCopy.unknown;
      presenceStatusText.textContent = presenceStatusLabel;
      presenceStatusText.classList.toggle("is-on", presencePresentation.key === "occupied");
      presenceStateHeadline.textContent = presenceStatusLabel;
      presenceStateHint.textContent =
        presencePresentation.key === "occupied"
          ? presenceCopy.hintOccupied
          : presencePresentation.key === "clear"
            ? presenceCopy.hintClear
            : presencePresentation.key === "unavailable"
              ? "设备当前不可用"
              : "正在等待状态";
      if (presenceSensorVisual) {
        const presenceVisualClass = {
          "door-window":
            "hb-door-window-sensor is-" +
            (presencePresentation.key === "occupied" ? "open" : presencePresentation.key),
          "water-leak":
            "hb-water-leak-sensor is-" +
            (presencePresentation.key === "occupied" ? "wet" : presencePresentation.key),
          smoke:
            "hb-smoke-sensor is-" +
            (presencePresentation.key === "occupied" ? "alert" : presencePresentation.key),
          "natural-gas":
            "hb-natural-gas-sensor is-" +
            (presencePresentation.key === "occupied" ? "alert" : presencePresentation.key)
        }[presenceSensorKind];
        presenceSensorVisual.className = presenceVisualClass + " hb-presence-details-sensor";
        presenceSensorVisual.dataset.sensorState = presencePresentation.key;
        presenceSensorVisual.setAttribute(
          "aria-label",
          presenceCopy.title + "：" + presenceStatusLabel
        );
      }
      presenceCurrentDurationValue.textContent = ["unknown", "unavailable"].includes(
        presencePresentation.key
      )
        ? "--"
        : formatPresenceDuration(presenceStateChangedAt);
      presenceLastDetectedValue.textContent = formatPresenceTimestamp(lastPresenceTimestamp());
      renderPresenceTimeline();
    };
    renderPresenceState(presenceState);
    const presenceEventConfig = presenceMotionEventConfig(
      presenceEntityId,
      presenceState,
      this.entityMetadata,
      this.states,
      presenceComponent.properties
    );
    const presenceStateHandlers = new Map([[presenceEntityId, [renderPresenceState]]]);
    for (const companionEntityId of presenceEventConfig.companionEntityIds) {
      presenceStateHandlers.set(companionEntityId, [() => renderPresenceState(presenceState)]);
    }
    const presenceRefreshTimer = presenceEventConfig.motionEvent
      ? window.setInterval(() => renderPresenceState(presenceState), 1000)
      : null;
    const presenceDialogLayer = document.createElement("div");
    presenceDialogLayer.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    presenceDialogLayer.tabIndex = -1;
    presenceDialogLayer.append(presenceDialog);
    this.container.append(presenceDialogLayer);
    this.detailsDialog = presenceDialog;
    this.detailsStateSync = {
      dialog: presenceDialog,
      handlers: presenceStateHandlers
    };
    this.registerRuntimeDialogScale(presenceDialogLayer, presenceDialog, 760, 560);
    presenceCloseButton.addEventListener("click", () => presenceDialog.close());
    this.bindRuntimeDialogOutsideDismiss(presenceDialogLayer, presenceDialog, presenceCard);
    this.bindRuntimeDialogEscapeClose(presenceDialogLayer, presenceDialog);
    presenceDialog.addEventListener(
      "close",
      () => {
        if (presenceRefreshTimer) {
          window.clearInterval(presenceRefreshTimer);
        }
        this.clearRuntimeDialogScale(presenceDialog);
        if (this.detailsDialog === presenceDialog) {
          this.detailsDialog = null;
        }
        if (this.detailsStateSync?.dialog === presenceDialog) {
          this.detailsStateSync = null;
        }
        presenceDialogLayer.remove();
      },
      {
        once: true
      }
    );
    this.presentRuntimeDialog(presenceDialogLayer, presenceDialog);
  }
};
