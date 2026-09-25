/*
 * 设备控件区块：空气净化器详情（含空气质量四档读色与滤芯读数）。
 */

import { resolveStateEntry } from "../../../../utils/state-entry.js?v=2609252218";
import { selectedRelatedEntityIds } from "../../../../shared/related-entities.js?v=2609252218";
import { entityMetadataIsAvailable } from "../../entity-metadata.js?v=2609252218";
import {
  airQualityAccent,
  airQualityAccentSoft,
  componentDialogTitle
} from "../primitives.js?v=2609252218";

export const airPurifierDetailsMethods = {
  /**
   * 打开空气净化器详情弹窗（含风量、滤芯寿命、空气质量等专有区块）。
   *
   * @throws {Error} 组件没有绑定实体。
   */
  showAirPurifierDetails(
    purifierComponent,
    { preview: purifierPreview = false, title: purifierTitle = "" } = {}
  ) {
    const purifierEntityId = purifierComponent.bindings?.entity?.entityId;
    if (!purifierEntityId) {
      throw new Error("该控件没有关联实体。");
    }
    this.closeRuntimeDialog();
    const purifierDeviceProfile = this.deviceProfile(purifierEntityId);
    const purifierRelatedEntityIds = selectedRelatedEntityIds(purifierComponent);
    let purifierState = resolveStateEntry(this.states.get(purifierEntityId), {
      entityId: purifierEntityId,
      state: "unknown",
      attributes: {}
    });
    const purifierDialogElement = document.createElement("dialog");
    purifierDialogElement.className =
      "hb-entity-details-dialog air-purifier-details capability-details";
    const purifierCardElement = document.createElement("div");
    purifierCardElement.className = "hb-entity-details-card";
    const purifierHeadingElement = document.createElement("div");
    purifierHeadingElement.className = "hb-entity-details-heading";
    const purifierTitleRowElement = document.createElement("div");
    const purifierTitleElement = document.createElement("strong");
    purifierTitleElement.textContent =
      purifierTitle ||
      componentDialogTitle(
        purifierComponent,
        purifierState.attributes?.friendly_name || "空气净化器"
      );
    const purifierStatusElement = document.createElement("span");
    purifierTitleRowElement.append(purifierTitleElement, purifierStatusElement);
    const purifierPowerButton = document.createElement("button");
    purifierPowerButton.type = "button";
    purifierPowerButton.className = "hb-air-purifier-visual";
    purifierPowerButton.inert = purifierPreview;
    purifierPowerButton.setAttribute("aria-label", "切换空气净化器电源");
    const purifierAuraElement = document.createElement("i");
    purifierAuraElement.className = "hb-air-purifier-visual-aura";
    const purifierAirflowElement = document.createElement("span");
    purifierAirflowElement.className = "hb-air-purifier-visual-airflow";
    for (let purifierAirflowIndex = 0; purifierAirflowIndex < 4; purifierAirflowIndex += 1) {
      purifierAirflowElement.append(document.createElement("i"));
    }
    const purifierBodyElement = document.createElement("span");
    purifierBodyElement.className = "hb-air-purifier-visual-body";
    const purifierTopElement = document.createElement("i");
    purifierTopElement.className = "hb-air-purifier-visual-top";
    const purifierVentElement = document.createElement("i");
    purifierVentElement.className = "hb-air-purifier-visual-vent";
    const purifierDisplayElement = document.createElement("span");
    purifierDisplayElement.className = "hb-air-purifier-visual-display";
    const purifierDisplayTextElement = document.createElement("strong");
    purifierDisplayElement.append(purifierDisplayTextElement);
    purifierBodyElement.append(purifierTopElement, purifierVentElement, purifierDisplayElement);
    purifierPowerButton.append(purifierAuraElement, purifierAirflowElement, purifierBodyElement);
    const purifierCloseButton = document.createElement("button");
    purifierCloseButton.type = "button";
    purifierCloseButton.textContent = "×";
    purifierCloseButton.setAttribute("aria-label", "关闭弹窗");
    purifierHeadingElement.append(
      purifierTitleRowElement,
      purifierPowerButton,
      purifierCloseButton
    );
    const purifierLayoutElement = document.createElement("div");
    purifierLayoutElement.className = "hb-air-purifier-layout";
    const purifierSummaryElement = document.createElement("section");
    purifierSummaryElement.className = "hb-air-purifier-summary";
    const purifierGaugeWrapElement = document.createElement("div");
    purifierGaugeWrapElement.className = "hb-air-purifier-gauge-wrap";
    const purifierGaugeElement = document.createElement("div");
    purifierGaugeElement.className = "hb-air-purifier-gauge is-quality";
    const purifierGaugeOrbitElement = document.createElement("i");
    purifierGaugeOrbitElement.className = "hb-air-purifier-gauge-orbit";
    const purifierArcCapStartElement = document.createElement("i");
    purifierArcCapStartElement.className = "hb-air-purifier-arc-cap start";
    const purifierArcCapEndElement = document.createElement("i");
    purifierArcCapEndElement.className = "hb-air-purifier-arc-cap end";
    const purifierGaugeContentElement = document.createElement("div");
    purifierGaugeContentElement.className = "hb-air-purifier-gauge-content";
    const purifierGaugeLabelElement = document.createElement("small");
    purifierGaugeLabelElement.textContent = "室内空气质量";
    const purifierGaugeValueRowElement = document.createElement("strong");
    const purifierGaugeValueElement = document.createElement("span");
    const purifierGaugeUnitElement = document.createElement("small");
    purifierGaugeUnitElement.textContent = "";
    const purifierDeviceStatusElement = document.createElement("span");
    purifierDeviceStatusElement.textContent = "设备状态 --";
    purifierGaugeValueRowElement.append(purifierGaugeValueElement, purifierGaugeUnitElement);
    purifierGaugeContentElement.append(
      purifierGaugeLabelElement,
      purifierGaugeValueRowElement,
      purifierDeviceStatusElement
    );
    purifierGaugeElement.append(
      purifierArcCapStartElement,
      purifierArcCapEndElement,
      purifierGaugeContentElement
    );
    purifierGaugeWrapElement.append(purifierGaugeOrbitElement, purifierGaugeElement);
    const purifierSecondaryMetricsElement = document.createElement("div");
    purifierSecondaryMetricsElement.className = "hb-air-purifier-secondary-metrics";
    purifierSummaryElement.append(purifierGaugeWrapElement, purifierSecondaryMetricsElement);
    const purifierControls = this.createCapabilityDetailsControls(purifierEntityId, purifierState, {
      interactive: !purifierPreview,
      variant: "air-purifier"
    });
    const purifierControlsPaneElement = document.createElement("section");
    purifierControlsPaneElement.className = "hb-air-purifier-controls-pane";
    purifierControlsPaneElement.append(purifierControls);
    purifierLayoutElement.append(purifierSummaryElement, purifierControlsPaneElement);
    purifierCardElement.append(purifierHeadingElement, purifierLayoutElement);
    purifierDialogElement.append(purifierCardElement);
    const purifierMetricDefinitions = [
      {
        key: "pm25",
        label: "PM2.5",
        roles: ["pm25"]
      },
      {
        key: "pm10",
        label: "PM10",
        roles: ["pm10"]
      },
      {
        key: "hcho",
        label: "甲醛",
        roles: ["hcho"]
      },
      {
        key: "filter",
        label: "滤芯寿命",
        roles: ["filterLife", "filterLeftTime"]
      },
      {
        key: "temperature",
        label: "温度",
        roles: ["temperature"]
      },
      {
        key: "humidity",
        label: "湿度",
        roles: ["humidity"]
      }
    ]
      .map(rawMetricDefinition => ({
        ...rawMetricDefinition,
        candidates: rawMetricDefinition.roles
          .map(metricRoleToResolve => ({
            role: metricRoleToResolve,
            id: purifierDeviceProfile?.roles?.[metricRoleToResolve]
          }))
          .filter(
            ({ id: candidateId }, candidateIndex, candidateList) =>
              candidateId &&
              candidateList.findIndex(candidateEntry => candidateEntry.id === candidateId) ===
                candidateIndex
          )
          .map(candidateWithMetadata => ({
            ...candidateWithMetadata,
            item: this.entityMetadata.get(candidateWithMetadata.id)
          }))
          .filter(
            ({ item: candidateMetadataRecord }) =>
              candidateMetadataRecord?.domain === "sensor" &&
              entityMetadataIsAvailable(candidateMetadataRecord)
          )
      }))
      .filter(({ candidates: metricCandidates }) => metricCandidates.length);
    /**
     * 把实体状态解析成有限数值；unknown/unavailable 或非数值时返回 null。
     * 净化器指标离线时 state 可能是字符串 "unknown"，Number() 会得到 NaN，所以必须显式排除这两个哨兵值，
     * 不能只靠 isFinite。@returns {number|null} 解析出的数值；不可用或非数值时为 null。
     */
    const numericStateValue = purifierEntityState => {
      const parsedStateValue = Number(purifierEntityState?.state);
      if (
        ["unknown", "unavailable"].includes(
          String(purifierEntityState?.state || "").toLowerCase()
        ) ||
        !Number.isFinite(parsedStateValue)
      ) {
        return null;
      } else {
        return parsedStateValue;
      }
    };
    /**
     * 取候选实体当前的状态对象：优先取状态更新里的 newState，退回直接缓存的状态。
     */
    const entityStateForCandidate = candidateForMetric =>
      resolveStateEntry(this.states.get(candidateForMetric?.id));
    /**
     * 从指标的多个候选实体中挑出当前有可用数值的一个，全都不可用时退回第一个。
     * 同一角色常绑定多个实体（不同型号的 PM2.5 传感器），优先选真在上报数据的那个。
     */
    const selectMetricCandidate = metricDefinitionInput =>
      metricDefinitionInput.candidates.find(
        selectedCandidate => numericStateValue(entityStateForCandidate(selectedCandidate)) != null
      ) ||
      metricDefinitionInput.candidates[0] ||
      null;
    const secondaryMetricSlots = Array.from(
      {
        length: 3
      },
      () => {
        const secondaryMetricElement = document.createElement("div");
        secondaryMetricElement.className = "hb-air-purifier-secondary-metric";
        const secondaryMetricLabelElement = document.createElement("small");
        const secondaryMetricValueElement = document.createElement("strong");
        secondaryMetricElement.append(secondaryMetricLabelElement, secondaryMetricValueElement);
        purifierSecondaryMetricsElement.append(secondaryMetricElement);
        return {
          item: secondaryMetricElement,
          label: secondaryMetricLabelElement,
          value: secondaryMetricValueElement
        };
      }
    );
    purifierSecondaryMetricsElement.hidden = true;
    const metricUnitLabels = {
      pm25: "μg/m³",
      pm10: "μg/m³",
      hcho: "mg/m³",
      filterLife: "%",
      filterLeftTime: "h",
      temperature: "°C",
      humidity: "%"
    };
    /**
     * 把净化器指标状态格式化成「数值 + 单位」的展示文本。
     * 单位优先取实体自带 unit_of_measurement，缺失时回退内置单位表；hours / days 显示为
     * 中文「小时 / 天」；unknown / unavailable 一律显示 "--"，不透传原始状态词。
     */
    const formatMetricDisplay = (metricEntityState, metricUnitRole) => {
      if (
        ["unknown", "unavailable"].includes(String(metricEntityState?.state || "").toLowerCase())
      ) {
        return "--";
      }
      const timeUnitLabels = {
        hours: "小时",
        hour: "小时",
        days: "天",
        day: "天"
      };
      const rawUnitLabel =
        metricEntityState?.attributes?.unit_of_measurement ||
        metricUnitLabels[metricUnitRole] ||
        "";
      const displayUnitLabel = timeUnitLabels[String(rawUnitLabel).toLowerCase()] || rawUnitLabel;
      return (
        "" + (metricEntityState?.state ?? "--") + (displayUnitLabel ? " " + displayUnitLabel : "")
      );
    };
    const purifierHandlersByEntityId = new Map();
    /**
     * 注册净化器弹窗的状态回调。
     * 同一实体可能被电源、指标、空气质量等多处订阅，因此按实体 ID 聚合成数组而非相互覆盖。
     */
    const registerPurifierHandler = (purifierHandlerEntityId, purifierStateHandler) => {
      if (purifierHandlerEntityId) {
        if (!purifierHandlersByEntityId.has(purifierHandlerEntityId)) {
          purifierHandlersByEntityId.set(purifierHandlerEntityId, []);
        }
        purifierHandlersByEntityId.get(purifierHandlerEntityId).push(purifierStateHandler);
      }
    };
    const purifierMetricEntityIds = purifierMetricDefinitions.flatMap(metricDefinition =>
      metricDefinition.candidates.map(metricCandidateItem => metricCandidateItem.id)
    );
    const airQualityEntityId = purifierDeviceProfile?.roles?.airQuality || "";
    const purifierExtensionControls =
      purifierRelatedEntityIds !== null
        ? this.createWaterHeaterExtensionControls(purifierEntityId, {
            component: purifierComponent,
            interactive: !purifierPreview,
            excludedEntityIds: [
              ...purifierMetricEntityIds,
              ...(airQualityEntityId ? [airQualityEntityId] : [])
            ]
          })
        : null;
    if (purifierExtensionControls) {
      purifierCardElement.append(purifierExtensionControls);
      purifierDialogElement.classList.add("has-related-extensions");
      for (const [
        extensionEntityId,
        extensionHandlers
      ] of purifierExtensionControls.stateHandlers || []) {
        purifierHandlersByEntityId.set(extensionEntityId, extensionHandlers);
      }
    }
    const airQualityStateLabels = {
      excellent: "空气优",
      good: "空气良",
      moderate: "一般",
      fair: "一般",
      poor: "较差",
      unhealthy: "较差",
      very_poor: "很差"
    };
    let airQualityState = airQualityEntityId
      ? resolveStateEntry(this.states.get(airQualityEntityId))
      : null;
    const pm25MetricDefinition = purifierMetricDefinitions.find(
      pm25MetricDefinitionEntry => pm25MetricDefinitionEntry.key === "pm25"
    );
    /**
     * 没有专用空气质量实体时，用 PM2.5 读数反推空气质量等级与文案。
     * 阈值按国内 PM2.5 分档：≤35 优、≤75 良、≤115 轻度污染，再高较差；读数缺失返回 unknown。
     */
    const resolvePm25Quality = () => {
      const pm25Candidate = pm25MetricDefinition
        ? selectMetricCandidate(pm25MetricDefinition)
        : null;
      const pm25NumericValue = numericStateValue(entityStateForCandidate(pm25Candidate));
      if (pm25NumericValue == null) {
        return {
          text: "--",
          level: "unknown"
        };
      } else if (pm25NumericValue <= 35) {
        return {
          text: "空气优",
          level: "excellent"
        };
      } else if (pm25NumericValue <= 75) {
        return {
          text: "空气良",
          level: "good"
        };
      } else if (pm25NumericValue <= 115) {
        return {
          text: "轻度污染",
          level: "warning"
        };
      } else {
        return {
          text: "空气较差",
          level: "poor"
        };
      }
    };
    /**
     * 渲染净化器空气质量表盘：主文案、进度弧长度与整卡主题色。
     * 有专用空气质量实体时按中英文关键词归类等级（厂商用词差异大，用正则同时匹配
     * very_poor / 严重 等写法），没有就退回 PM2.5 推算；等级同时驱动进度弧与两级主题色。
     */
    const renderPurifierAirQuality = () => {
      const airQualityRawText = String(airQualityState?.state || "").trim();
      const airQualityNormalizedText = airQualityRawText.toLowerCase();
      let airQualityDisplayText = ["unknown", "unavailable", ""].includes(airQualityNormalizedText)
        ? ""
        : airQualityStateLabels[airQualityNormalizedText] || airQualityRawText;
      let airQualityLevel = "good";
      if (airQualityDisplayText) {
        if (
          /very.?poor|severe|很差|重度|严重/.test(airQualityNormalizedText) ||
          /poor|unhealthy|较差|中度/.test(airQualityNormalizedText)
        ) {
          airQualityLevel = "poor";
        } else if (/moderate|fair|一般|轻度|污染/.test(airQualityNormalizedText)) {
          airQualityLevel = "warning";
        } else if (/excellent|优/.test(airQualityNormalizedText)) {
          airQualityLevel = "excellent";
        }
      } else {
        ({ text: airQualityDisplayText, level: airQualityLevel } = resolvePm25Quality());
      }
      purifierGaugeValueElement.textContent = airQualityDisplayText || "--";
      purifierGaugeUnitElement.textContent = "";
      purifierGaugeElement.style.setProperty(
        "--hb-air-purifier-progress",
        {
          excellent: 72,
          good: 58,
          warning: 42,
          poor: 26,
          unknown: 0
        }[airQualityLevel] + "%"
      );
      purifierGaugeElement.classList.toggle("is-warning", airQualityLevel === "warning");
      purifierGaugeElement.classList.toggle("is-poor", airQualityLevel === "poor");
      const airQualityAccentColor = airQualityAccent(airQualityLevel);
      const airQualityAccentSoftColor = airQualityAccentSoft(airQualityLevel, 0.14);
      purifierDialogElement.style.setProperty("--hb-air-purifier-accent", airQualityAccentColor);
      purifierDialogElement.style.setProperty(
        "--hb-air-purifier-accent-soft",
        airQualityAccentSoftColor
      );
    };
    /**
     * 缓存空气质量实体的最新状态，并重绘净化器弹窗的空气质量视觉。
     */
    const setAirQualityState = nextAirQualityState => {
      airQualityState = nextAirQualityState;
      renderPurifierAirQuality();
    };
    /**
     * 同步净化器的开关状态：刷新文案、按钮态、仪表动画，并转发给能力控件。
     * 只有明确 unknown/unavailable 才算不可用；其余状态里只要不是 off 都视为运行中
     * —— 净化器还有 auto/favorite 等档位，不能只认 "on"。
     */
    const syncPurifierPowerState = nextPurifierState => {
      purifierState = nextPurifierState || purifierState;
      const purifierNormalizedState = String(purifierState?.state || "").toLowerCase();
      const isPurifierUnavailable = ["unknown", "unavailable"].includes(purifierNormalizedState);
      const isPurifierActive = !isPurifierUnavailable && purifierNormalizedState !== "off";
      purifierDisplayTextElement.textContent = isPurifierActive ? "ON" : "OFF";
      purifierStatusElement.textContent = isPurifierUnavailable
        ? "当前不可用"
        : isPurifierActive
          ? "已开启"
          : "已关闭";
      purifierDeviceStatusElement.textContent = isPurifierUnavailable
        ? "设备不可用"
        : isPurifierActive
          ? "净化中"
          : "已关闭";
      purifierStatusElement.classList.toggle("is-on", isPurifierActive);
      purifierPowerButton.classList.toggle("is-on", isPurifierActive);
      purifierPowerButton.classList.toggle("is-unavailable", isPurifierUnavailable);
      purifierGaugeElement.classList.toggle("is-running", isPurifierActive);
      purifierGaugeOrbitElement.classList.toggle("is-running", isPurifierActive);
      purifierPowerButton.setAttribute("aria-pressed", String(isPurifierActive));
      purifierControls.syncCapabilityState?.(purifierState);
    };
    /**
     * 渲染净化器次要指标槽位（PM2.5 / 甲醛 / 滤芯寿命 / 温湿度中最多取三个）。
     * 只展示能解析出数值的指标，每个指标可能对应多个候选实体（厂商命名不同），取第一个
     * 有读数的；槽位是固定三个的复用节点，只改文案与类名，不重建 DOM。
     */
    const renderPurifierMetrics = () => {
      const resolvedMetricSelections = purifierMetricDefinitions
        .map(metricDefinitionItem => ({
          metric: metricDefinitionItem,
          selected: selectMetricCandidate(metricDefinitionItem)
        }))
        .filter(
          ({ selected: selectedMetricCandidate }) =>
            numericStateValue(entityStateForCandidate(selectedMetricCandidate)) != null
        )
        .slice(0, secondaryMetricSlots.length);
      secondaryMetricSlots.forEach((metricSlot, metricSlotIndex) => {
        const metricSelection = resolvedMetricSelections[metricSlotIndex];
        metricSlot.item.hidden = !metricSelection;
        metricSlot.item.className =
          "hb-air-purifier-secondary-metric" +
          (metricSelection
            ? " hb-air-purifier-secondary-metric--" + metricSelection.metric.key
            : "");
        if (!metricSelection) {
          metricSlot.label.textContent = "";
          metricSlot.value.textContent = "";
          return;
        }
        const resolvedMetricRole = metricSelection.selected?.role || metricSelection.metric.key;
        metricSlot.label.textContent =
          metricSelection.metric.key === "filter" && resolvedMetricRole === "filterLeftTime"
            ? "滤芯剩余时间"
            : metricSelection.metric.label;
        metricSlot.value.textContent = formatMetricDisplay(
          entityStateForCandidate(metricSelection.selected),
          resolvedMetricRole
        );
      });
      purifierSecondaryMetricsElement.hidden = resolvedMetricSelections.length === 0;
    };
    syncPurifierPowerState(purifierState);
    registerPurifierHandler(purifierEntityId, syncPurifierPowerState);
    for (const refreshedMetricDefinition of purifierMetricDefinitions) {
      /**
       * 单个指标实体的状态回调：重算次要指标槽位。
       *
       * PM2.5 会同时影响表盘，所以额外触发一次空气质量渲染（此时不查表，直接看 key）。
       */
      const refreshPurifierMetric = () => {
        renderPurifierMetrics();
        if (refreshedMetricDefinition.key === "pm25") {
          renderPurifierAirQuality();
        }
      };
      refreshPurifierMetric();
      for (const refreshMetricCandidate of refreshedMetricDefinition.candidates) {
        registerPurifierHandler(refreshMetricCandidate.id, refreshPurifierMetric);
      }
    }
    setAirQualityState(airQualityState);
    registerPurifierHandler(airQualityEntityId, setAirQualityState);
    purifierPowerButton.addEventListener("click", () =>
      purifierControls.querySelector(".hb-capability-power")?.click()
    );
    const purifierLayerElement = document.createElement("div");
    purifierLayerElement.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select");
    purifierLayerElement.tabIndex = -1;
    purifierLayerElement.append(purifierDialogElement);
    this.container.append(purifierLayerElement);
    this.detailsDialog = purifierDialogElement;
    this.detailsStateSync = {
      dialog: purifierDialogElement,
      handlers: purifierHandlersByEntityId
    };
    this.registerRuntimeDialogScale(
      purifierLayerElement,
      purifierDialogElement,
      920,
      purifierExtensionControls ? 620 : 540
    );
    purifierCloseButton.addEventListener("click", () => purifierDialogElement.close());
    this.bindRuntimeDialogOutsideDismiss(
      purifierLayerElement,
      purifierDialogElement,
      purifierCardElement
    );
    this.bindRuntimeDialogEscapeClose(purifierLayerElement, purifierDialogElement);
    purifierDialogElement.addEventListener(
      "close",
      () => {
        purifierControls.cleanupCapabilityDetails?.();
        this.clearRuntimeDialogScale(purifierDialogElement);
        if (this.detailsDialog === purifierDialogElement) {
          this.detailsDialog = null;
        }
        if (this.detailsStateSync?.dialog === purifierDialogElement) {
          this.detailsStateSync = null;
        }
        purifierLayerElement.remove();
      },
      {
        once: true
      }
    );
    this.presentRuntimeDialog(purifierLayerElement, purifierDialogElement);
  }
};
