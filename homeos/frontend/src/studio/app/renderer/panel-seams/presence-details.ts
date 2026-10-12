import type { PanelRenderer } from "../panel-renderer";
import { componentDialogTitle } from "../renderer-helpers";
import { formatPresenceDuration as formatPresenceDuration2, presenceHistoryBuckets as presenceHistoryBuckets2, presenceMotionEventConfig as presenceMotionEventConfig2, presenceSensorPresentation as presenceSensorPresentation2, presenceStateTimestamp as presenceStateTimestamp2, renderRegisteredComponent as renderRegisteredComponent2 } from "../registry";

export function showPresenceDetails(this: PanelRenderer, presenceComponent: any, { preview: _isPresencePreview = false } = {}) {
    const presenceEntityId = presenceComponent.bindings?.entity?.entityId;
    if (!presenceEntityId) throw new Error("该控件没有关联实体。");
    this.closeRuntimeDialog();
    const sensorKind = ["presence", "door-window", "water-leak", "smoke", "natural-gas"].includes(
        presenceComponent.properties?.sensorKind,
      )
        ? presenceComponent.properties.sensorKind
        : "presence",
      presencePresentationConfig = ({
        presence: {
          title: "人在检测",
          occupied: "有人",
          clear: "无人",
          unavailable: "传感器离线",
          unknown: "—",
          hintOccupied: "空间内检测到人",
          hintClear: "当前空间无人",
        },
        "door-window": {
          title: "门窗状态",
          occupied: "打开",
          clear: "关闭",
          unavailable: "传感器离线",
          unknown: "—",
          hintOccupied: "门窗当前已打开",
          hintClear: "门窗当前已关闭",
        },
        "water-leak": {
          title: "水浸检测",
          occupied: "检测到水浸",
          clear: "正常",
          unavailable: "传感器离线",
          unknown: "—",
          hintOccupied: "传感器检测到水浸",
          hintClear: "当前未检测到水浸",
        },
        smoke: {
          title: "烟雾检测",
          occupied: "检测到烟雾",
          clear: "正常",
          unavailable: "传感器离线",
          unknown: "—",
          hintOccupied: "传感器检测到烟雾",
          hintClear: "当前未检测到烟雾",
        },
        "natural-gas": {
          title: "天然气检测",
          occupied: "检测到天然气",
          clear: "正常",
          unavailable: "传感器离线",
          unknown: "—",
          hintOccupied: "传感器检测到天然气",
          hintClear: "当前未检测到天然气",
        },
      } as any)[sensorKind];
    let presenceState = this.states.get(presenceEntityId)?.newState ||
      this.states.get(presenceEntityId) || {
        entityId: presenceEntityId,
        state: "unknown",
        attributes: {} as Record<string, any>,
      };
    const historyHours = Math.max(
        1,
        Math.min(168, Number(presenceComponent.properties?.historyHours || 24)),
      ),
      historyPoints = this.historySeries.get(presenceEntityId)?.points || [],
      occupiedColor =
        presenceComponent.properties?.iconOnColor ||
        presenceComponent.properties?.occupiedColor ||
        "#ffffff",
      clearColor =
        presenceComponent.properties?.iconColor ||
        presenceComponent.properties?.clearColor ||
        "#758189",
      resolvePresencePresentation = (presenceStateInput: any, nowTimestamp = Date.now()) =>
        presenceSensorPresentation2(presenceStateInput, "auto", {
          ...presenceMotionEventConfig2(
            presenceEntityId,
            presenceStateInput,
            this.entityMetadata,
            this.states,
            presenceComponent.properties,
          ),
          now: nowTimestamp,
        }),
      presenceDialog = document.createElement("dialog");
    ((presenceDialog.className = "hb-entity-details-dialog presence-details"),
      (presenceDialog.dataset.sensorKind = sensorKind),
      presenceDialog.style.setProperty("--hb-presence-occupied", occupiedColor),
      presenceDialog.style.setProperty("--hb-presence-clear", clearColor));
    const presenceCard = document.createElement("div");
    presenceCard.className = "hb-entity-details-card";
    const presenceHeading = document.createElement("div");
    presenceHeading.className = "hb-entity-details-heading";
    const presenceTitleRow = document.createElement("div"),
      presenceTitle = document.createElement("strong");
    presenceTitle.textContent = componentDialogTitle(
      presenceComponent,
      presenceState.attributes?.friendly_name || presencePresentationConfig.title,
    );
    const presenceStateLabel = document.createElement("span");
    presenceTitleRow.append(presenceTitle, presenceStateLabel);
    const presenceCloseButton = document.createElement("button");
    ((presenceCloseButton.type = "button"),
      (presenceCloseButton.textContent = "×"),
      presenceCloseButton.setAttribute("aria-label", "关闭弹窗"),
      presenceHeading.append(presenceTitleRow, presenceCloseButton));
    const presenceBody = document.createElement("div");
    presenceBody.className = "hb-presence-details-body";
    const presenceVisualElement = document.createElement("section");
    presenceVisualElement.className = "hb-presence-details-visual";
    let presenceSensorElement: any = null;
    if (sensorKind === "presence") {
      const presenceSpaceElement = document.createElement("span");
      presenceSpaceElement.className = "hb-presence-sensor-space";
      for (let spaceLayerIndex = 0; spaceLayerIndex < 3; spaceLayerIndex += 1)
        presenceSpaceElement.append(document.createElement("i"));
      const presenceFloorElement = document.createElement("span");
      presenceFloorElement.className = "hb-presence-sensor-floor";
      const presencePersonElement = document.createElement("span");
      presencePersonElement.className = "hb-presence-sensor-person";
      const personHeadElement = document.createElement("i"),
        personTorsoElement = document.createElement("b"),
        personArmLeftElement = document.createElement("span");
      personArmLeftElement.className = "arm left";
      const personArmRightElement = document.createElement("span");
      personArmRightElement.className = "arm right";
      const personLegLeftElement = document.createElement("span");
      personLegLeftElement.className = "leg left";
      const personLegRightElement = document.createElement("span");
      ((personLegRightElement.className = "leg right"),
        presencePersonElement.append(
          personHeadElement,
          personTorsoElement,
          personArmLeftElement,
          personArmRightElement,
          personLegLeftElement,
          personLegRightElement,
        ),
        presenceVisualElement.append(
          presenceSpaceElement,
          presenceFloorElement,
          presencePersonElement,
        ));
    } else
      ((presenceSensorElement = renderRegisteredComponent2(
        {
          ...presenceComponent,
          position: {
            ...(presenceComponent.position || {}),
            width: 100,
            height: 100,
          },
        },
        {
          states: new Map([[presenceEntityId, presenceState]]),
          entityMetadata: this.entityMetadata,
          editable: false,
          previewState: "auto",
          document: this.document,
        },
      )),
        presenceSensorElement.classList.add("hb-presence-details-sensor"),
        presenceVisualElement.append(presenceSensorElement));
    const presenceStateLabelElement = document.createElement("strong"),
      presenceStateHint = document.createElement("small");
    presenceVisualElement.append(presenceStateLabelElement, presenceStateHint);
    const presenceMetricsSection = document.createElement("section");
    presenceMetricsSection.className = "hb-presence-details-metrics";
    const createPresenceMetric = (metricLabel: any) => {
        const presenceMetricElement = document.createElement("div"),
          presenceMetricLabel = document.createElement("small");
        presenceMetricLabel.textContent = metricLabel;
        const presenceMetricValueLabel = document.createElement("strong");
        return (
          presenceMetricElement.append(presenceMetricLabel, presenceMetricValueLabel),
          presenceMetricsSection.append(presenceMetricElement),
          presenceMetricValueLabel
        );
      },
      presenceDurationMetricElement = createPresenceMetric("当前状态持续"),
      presenceLastDetectedMetricElement = createPresenceMetric("最近检测到人"),
      presenceOccupiedDurationMetricElement = createPresenceMetric(historyHours + " 小时有人时长"),
      presenceTimelineSection = document.createElement("section");
    presenceTimelineSection.className = "hb-presence-details-timeline";
    const presenceTimelineHeading = document.createElement("div"),
      presenceTimelineTitle = document.createElement("strong");
    presenceTimelineTitle.textContent = historyHours + " 小时在家时间轴";
    const presenceTimelineHint = document.createElement("span");
    ((presenceTimelineHint.textContent = "亮色为有人"),
      presenceTimelineHeading.append(presenceTimelineTitle, presenceTimelineHint));
    const presenceTimelineTrack = document.createElement("div"),
      presenceTimelineLabelsRow = document.createElement("div");
    ((presenceTimelineLabelsRow.innerHTML =
      "<span>" + historyHours + " 小时前</span><span>现在</span>"),
      presenceTimelineSection.append(
        presenceTimelineHeading,
        presenceTimelineTrack,
        presenceTimelineLabelsRow,
      ),
      presenceBody.append(presenceVisualElement, presenceMetricsSection, presenceTimelineSection),
      presenceCard.append(presenceHeading, presenceBody),
      presenceDialog.append(presenceCard));
    const formatPresenceTime = (timestamp: any) => {
        if (!Number.isFinite(timestamp)) return "--";
        const date = new Date(timestamp),
          todayDate = new Date(),
          formattedTime =
            date.getFullYear() === todayDate.getFullYear() &&
            date.getMonth() === todayDate.getMonth() &&
            date.getDate() === todayDate.getDate(),
          format = new Intl.DateTimeFormat("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(date);
        return formattedTime
          ? "今天 " + format
          : new Intl.DateTimeFormat("zh-CN", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
              .format(date)
              .replace(/\//g, "-");
      },
      refreshPresence = () => {
        const historyBuckets = presenceHistoryBuckets2(
          historyPoints,
          presenceState,
          Date.now(),
          historyHours,
          48,
          presenceMotionEventConfig2(
            presenceEntityId,
            presenceState,
            this.entityMetadata,
            this.states,
            presenceComponent.properties,
          ),
        );
        presenceTimelineTrack.replaceChildren(
          ...historyBuckets.map((bucketState, bucketIndex) => {
            const timelineBucketElement = document.createElement("i");
            timelineBucketElement.className = "is-" + bucketState;
            const round3 = Math.round(
              (historyHours * 60 * (historyBuckets.length - bucketIndex - 1)) /
                historyBuckets.length,
            );
            return (
              (timelineBucketElement.title =
                (round3 ? round3 + " 分钟前" : "现在") +
                "：" +
                ({
                  occupied: "有人",
                  clear: "无人",
                  unavailable: "离线",
                  unknown: "未知",
                } as any)[bucketState]),
              timelineBucketElement
            );
          }),
        );
        const occupiedBucketCount = historyBuckets.filter(
            (bucketValue) => bucketValue === "occupied",
          ).length,
          round4 = Math.round(
            (historyHours * 60 * occupiedBucketCount) / Math.max(1, historyBuckets.length),
          );
        presenceOccupiedDurationMetricElement.textContent =
          round4 >= 60
            ? Math.floor(round4 / 60) + " 小时 " + (round4 % 60) + " 分钟"
            : round4 + " 分钟";
      },
      resolveLastDetected = () => {
        const presenceMotionEventConfig = presenceMotionEventConfig2(
            presenceEntityId,
            presenceState,
            this.entityMetadata,
            this.states,
            presenceComponent.properties,
          ),
          presencePoints = historyPoints
            .map((rawHistoryPoint: any) => ({
              timestamp: Date.parse(rawHistoryPoint?.timestamp),
              state: {
                state: rawHistoryPoint?.value,
              },
            }))
            .filter(
              (historyPoint: any) =>
                Number.isFinite(historyPoint.timestamp) &&
                presenceSensorPresentation2(
                  {
                    state: historyPoint?.state?.state,
                    lastChanged: new Date(historyPoint.timestamp).toISOString(),
                  },
                  "auto",
                  {
                    ...presenceMotionEventConfig,
                    now: historyPoint.timestamp,
                    noMotionSeconds: null as any,
                    noMotionStateTimestamp: null as any,
                  },
                ).key === "occupied",
            ),
          lastDetectedTimestamp = presenceStateTimestamp2(presenceState);
        return (
          resolvePresencePresentation(presenceState).key === "occupied" &&
            Number.isFinite(lastDetectedTimestamp) &&
            presencePoints.push({
              timestamp: lastDetectedTimestamp,
            }),
          presencePoints.length
            ? Math.max(...presencePoints.map((presencePoint: any) => presencePoint.timestamp))
            : null
        );
      },
      applyPresenceState = (presenceStateValue: any) => {
        presenceState = presenceStateValue || presenceState;
        const presencePresentation = resolvePresencePresentation(presenceState),
          stateTimestamp = presenceStateTimestamp2(presenceState);
        ((presenceDialog.dataset.presenceState = presencePresentation.key),
          (presenceVisualElement.className =
            "hb-presence-details-visual is-" + presencePresentation.key));
        const unknown =
          presencePresentationConfig[presencePresentation.key] ||
          presencePresentationConfig.unknown;
        if (
          ((presenceStateLabel.textContent = unknown),
          presenceStateLabel.classList.toggle("is-on", presencePresentation.key === "occupied"),
          (presenceStateLabelElement.textContent = unknown),
          (presenceStateHint.textContent =
            presencePresentation.key === "occupied"
              ? presencePresentationConfig.hintOccupied
              : presencePresentation.key === "clear"
                ? presencePresentationConfig.hintClear
                : presencePresentation.key === "unavailable"
                  ? "设备当前不可用"
                  : ""),
          presenceSensorElement)
        ) {
          const sensorClassName = ({
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
              (presencePresentation.key === "occupied" ? "alert" : presencePresentation.key),
          } as any)[sensorKind];
          ((presenceSensorElement.className = sensorClassName + " hb-presence-details-sensor"),
            (presenceSensorElement.dataset.sensorState = presencePresentation.key),
            presenceSensorElement.setAttribute(
              "aria-label",
              presencePresentationConfig.title + "：" + unknown,
            ));
        }
        ((presenceDurationMetricElement.textContent = ["unknown", "unavailable"].includes(
          presencePresentation.key,
        )
          ? "--"
          : formatPresenceDuration2(stateTimestamp)),
          (presenceLastDetectedMetricElement.textContent =
            formatPresenceTime(resolveLastDetected())),
          refreshPresence());
      };
    applyPresenceState(presenceState);
    const motionEventConfig = presenceMotionEventConfig2(
        presenceEntityId,
        presenceState,
        this.entityMetadata,
        this.states,
        presenceComponent.properties,
      ),
      presenceHandlersByEntityId = new Map([[presenceEntityId, [applyPresenceState]]]);
    for (const companionEntityId of motionEventConfig.companionEntityIds)
      presenceHandlersByEntityId.set(companionEntityId, [() => applyPresenceState(presenceState)]);
    const setInterval3 = motionEventConfig.motionEvent
        ? window.setInterval(() => applyPresenceState(presenceState), 1000)
        : null,
      presenceOverlay = document.createElement("div");
    ((presenceOverlay.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (presenceOverlay.tabIndex = -1),
      presenceOverlay.append(presenceDialog),
      this.container.append(presenceOverlay),
      (this.detailsDialog = presenceDialog),
      (this.detailsStateSync = {
        dialog: presenceDialog,
        handlers: presenceHandlersByEntityId,
      }),
      this.registerRuntimeDialogScale(presenceOverlay, presenceDialog, 760, 560),
      presenceCloseButton.addEventListener("click", () => presenceDialog.close()),
      this.bindRuntimeDialogOutsideDismiss(presenceOverlay, presenceDialog, presenceCard),
      presenceOverlay.addEventListener("keydown", (presenceOverlayKeyEvent) => {
        presenceOverlayKeyEvent.key === "Escape" && presenceDialog.close();
      }),
      presenceDialog.addEventListener(
        "close",
        () => {
          (setInterval3 && window.clearInterval(setInterval3),
            this.clearRuntimeDialogScale(presenceDialog),
            this.detailsDialog === presenceDialog && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === presenceDialog && (this.detailsStateSync = null),
            presenceOverlay.remove());
        },
        {
          once: true,
        },
      ),
      presenceDialog.show());
  }
