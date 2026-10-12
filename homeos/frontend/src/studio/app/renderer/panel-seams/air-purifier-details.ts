import type { PanelRenderer } from "../panel-renderer";
import { componentDialogTitle } from "../renderer-helpers";
import { entityMetadataIsAvailable as entityMetadataIsAvailable2 } from "../entity-metadata";
import { selectedRelatedEntityIds as selectedRelatedEntityIds2 } from "../../shared/related-entities";

export function showAirPurifierDetails(this: PanelRenderer, 
    airPurifierComponent: any,
    { preview: isAirPurifierPreview = false, title: airPurifierTitle = "" } = {},
  ) {
    const airPurifierEntityId = airPurifierComponent.bindings?.entity?.entityId;
    if (!airPurifierEntityId) throw new Error("该控件没有关联实体。");
    this.closeRuntimeDialog();
    const airPurifierDeviceProfile = this.deviceProfile(airPurifierEntityId),
      relatedEntityIds = selectedRelatedEntityIds2(airPurifierComponent);
    let airPurifierStateSnapshot = this.states.get(airPurifierEntityId)?.newState ||
      this.states.get(airPurifierEntityId) || {
        entityId: airPurifierEntityId,
        state: "unknown",
        attributes: {} as Record<string, any>,
      };
    const airPurifierDialog = document.createElement("dialog");
    airPurifierDialog.className =
      "hb-entity-details-dialog air-purifier-details capability-details";
    const airPurifierDialogCard = document.createElement("div");
    airPurifierDialogCard.className = "hb-entity-details-card";
    const airPurifierDialogHeading = document.createElement("div");
    airPurifierDialogHeading.className = "hb-entity-details-heading";
    const airPurifierDialogTitleBox = document.createElement("div"),
      airPurifierDialogTitle = document.createElement("strong");
    airPurifierDialogTitle.textContent =
      airPurifierTitle ||
      componentDialogTitle(
        airPurifierComponent,
        airPurifierStateSnapshot.attributes?.friendly_name || "空气净化器",
      );
    const airPurifierDialogStatus = document.createElement("span");
    airPurifierDialogTitleBox.append(airPurifierDialogTitle, airPurifierDialogStatus);
    const airPurifierPowerButton = document.createElement("button");
    ((airPurifierPowerButton.type = "button"),
      (airPurifierPowerButton.className = "hb-air-purifier-visual"),
      (airPurifierPowerButton.inert = isAirPurifierPreview),
      airPurifierPowerButton.setAttribute("aria-label", "切换空气净化器电源"));
    const airPurifierAuraIcon = document.createElement("i");
    airPurifierAuraIcon.className = "hb-air-purifier-visual-aura";
    const airPurifierAirflowIcon = document.createElement("span");
    airPurifierAirflowIcon.className = "hb-air-purifier-visual-airflow";
    for (
      let purifierAirflowUnitIndex = 0;
      purifierAirflowUnitIndex < 4;
      purifierAirflowUnitIndex += 1
    )
      airPurifierAirflowIcon.append(document.createElement("i"));
    const airPurifierBodyIcon = document.createElement("span");
    airPurifierBodyIcon.className = "hb-air-purifier-visual-body";
    const airPurifierTopIcon = document.createElement("i");
    airPurifierTopIcon.className = "hb-air-purifier-visual-top";
    const airPurifierVentIcon = document.createElement("i");
    airPurifierVentIcon.className = "hb-air-purifier-visual-vent";
    const airPurifierDisplayIcon = document.createElement("span");
    airPurifierDisplayIcon.className = "hb-air-purifier-visual-display";
    const airPurifierDisplayLabel = document.createElement("strong");
    (airPurifierDisplayIcon.append(airPurifierDisplayLabel),
      airPurifierBodyIcon.append(airPurifierTopIcon, airPurifierVentIcon, airPurifierDisplayIcon),
      airPurifierPowerButton.append(
        airPurifierAuraIcon,
        airPurifierAirflowIcon,
        airPurifierBodyIcon,
      ));
    const airPurifierDialogCloseButton = document.createElement("button");
    ((airPurifierDialogCloseButton.type = "button"),
      (airPurifierDialogCloseButton.textContent = "×"),
      airPurifierDialogCloseButton.setAttribute("aria-label", "关闭弹窗"),
      airPurifierDialogHeading.append(
        airPurifierDialogTitleBox,
        airPurifierPowerButton,
        airPurifierDialogCloseButton,
      ));
    const airPurifierLayoutBox = document.createElement("div");
    airPurifierLayoutBox.className = "hb-air-purifier-layout";
    const airPurifierSummarySection = document.createElement("section");
    airPurifierSummarySection.className = "hb-air-purifier-summary";
    const airPurifierGaugeWrapElement = document.createElement("div");
    airPurifierGaugeWrapElement.className = "hb-air-purifier-gauge-wrap";
    const airPurifierGaugeBox = document.createElement("div");
    airPurifierGaugeBox.className = "hb-air-purifier-gauge is-quality";
    const airPurifierGaugeOrbitIcon = document.createElement("i");
    airPurifierGaugeOrbitIcon.className = "hb-air-purifier-gauge-orbit";
    const airPurifierArcStartIcon = document.createElement("i");
    airPurifierArcStartIcon.className = "hb-air-purifier-arc-cap start";
    const airPurifierArcEndIcon = document.createElement("i");
    airPurifierArcEndIcon.className = "hb-air-purifier-arc-cap end";
    const airPurifierGaugeContentElement = document.createElement("div");
    airPurifierGaugeContentElement.className = "hb-air-purifier-gauge-content";
    const airPurifierQualityCaption = document.createElement("small");
    airPurifierQualityCaption.textContent = "室内空气质量";
    const airPurifierQualityValueElement = document.createElement("strong"),
      airPurifierQualityNumberElement = document.createElement("span"),
      airPurifierQualityUnitElement = document.createElement("small");
    airPurifierQualityUnitElement.textContent = "";
    const airPurifierDeviceStatus = document.createElement("span");
    ((airPurifierDeviceStatus.textContent = "设备状态 --"),
      airPurifierQualityValueElement.append(
        airPurifierQualityNumberElement,
        airPurifierQualityUnitElement,
      ),
      airPurifierGaugeContentElement.append(
        airPurifierQualityCaption,
        airPurifierQualityValueElement,
        airPurifierDeviceStatus,
      ),
      airPurifierGaugeBox.append(
        airPurifierArcStartIcon,
        airPurifierArcEndIcon,
        airPurifierGaugeContentElement,
      ),
      airPurifierGaugeWrapElement.append(airPurifierGaugeOrbitIcon, airPurifierGaugeBox));
    const airPurifierSecondaryMetricsElement = document.createElement("div");
    ((airPurifierSecondaryMetricsElement.className = "hb-air-purifier-secondary-metrics"),
      airPurifierSummarySection.append(
        airPurifierGaugeWrapElement,
        airPurifierSecondaryMetricsElement,
      ));
    const capabilityDetailsControls2 = this.createCapabilityDetailsControls(
        airPurifierEntityId,
        airPurifierStateSnapshot,
        {
          interactive: !isAirPurifierPreview,
          variant: "air-purifier",
        },
      ),
      airPurifierControlsSection = document.createElement("section");
    ((airPurifierControlsSection.className = "hb-air-purifier-controls-pane"),
      airPurifierControlsSection.append(capabilityDetailsControls2),
      airPurifierLayoutBox.append(airPurifierSummarySection, airPurifierControlsSection),
      airPurifierDialogCard.append(airPurifierDialogHeading, airPurifierLayoutBox),
      airPurifierDialog.append(airPurifierDialogCard));
    const airPurifierMetricGroups = [
        {
          key: "pm25",
          label: "PM2.5",
          roles: ["pm25"],
        },
        {
          key: "pm10",
          label: "PM10",
          roles: ["pm10"],
        },
        {
          key: "hcho",
          label: "甲醛",
          roles: ["hcho"],
        },
        {
          key: "filter",
          label: "滤芯寿命",
          roles: ["filterLife", "filterLeftTime"],
        },
        {
          key: "temperature",
          label: "温度",
          roles: ["temperature"],
        },
        {
          key: "humidity",
          label: "湿度",
          roles: ["humidity"],
        },
      ]
        .map((metricGroupSource) => ({
          ...metricGroupSource,
          candidates: metricGroupSource.roles
            .map((metricRoleName) => ({
              role: metricRoleName,
              id: airPurifierDeviceProfile?.roles?.[metricRoleName],
            }))
            .filter(
              ({ id: matchedEntityId }, candidateIndex, candidateList) =>
                matchedEntityId &&
                candidateList.findIndex(
                  (candidateEntry) => candidateEntry.id === matchedEntityId,
                ) === candidateIndex,
            )
            .map((candidateSource) => ({
              ...candidateSource,
              item: this.entityMetadata.get(candidateSource.id),
            }))
            .filter(
              ({ item: metricSensorMetadata }) =>
                metricSensorMetadata?.domain === "sensor" &&
                entityMetadataIsAvailable2(metricSensorMetadata),
            ),
        }))
        .filter(({ candidates: groupCandidates }) => groupCandidates.length),
      isMetricValueValid = (metricStateArg: any) => {
        const numericMetricValue = Number(metricStateArg?.state);
        return ["unknown", "unavailable"].includes(
          String(metricStateArg?.state || "").toLowerCase(),
        ) || !Number.isFinite(numericMetricValue)
          ? null
          : numericMetricValue;
      },
      lookupEntityState = (stateLookupEntity: any) =>
        this.states.get(stateLookupEntity?.id)?.newState ||
        this.states.get(stateLookupEntity?.id) ||
        null,
      resolveSelectedCandidate = (metricGroupItem: any) =>
        metricGroupItem.candidates.find(
          (candidateItem: any) => isMetricValueValid(lookupEntityState(candidateItem)) != null,
        ) ||
        metricGroupItem.candidates[0] ||
        null,
      visibleMetricRows = Array.from(
        {
          length: 3,
        },
        () => {
          const secondaryMetricRow = document.createElement("div");
          secondaryMetricRow.className = "hb-air-purifier-secondary-metric";
          const secondaryMetricLabel = document.createElement("small"),
            secondaryMetricValueElement = document.createElement("strong");
          return (
            secondaryMetricRow.append(secondaryMetricLabel, secondaryMetricValueElement),
            airPurifierSecondaryMetricsElement.append(secondaryMetricRow),
            {
              item: secondaryMetricRow,
              label: secondaryMetricLabel,
              value: secondaryMetricValueElement,
            }
          );
        },
      );
    airPurifierSecondaryMetricsElement.hidden = true;
    const unitSuffixLabels = {
        pm25: "μg/m³",
        pm10: "μg/m³",
        hcho: "mg/m³",
        filterLife: "%",
        filterLeftTime: "h",
        temperature: "°C",
        humidity: "%",
      },
      formatMetricValue = (metricStateValue: any, metricKey: any) => {
        if (
          ["unknown", "unavailable"].includes(String(metricStateValue?.state || "").toLowerCase())
        )
          return "--";
        const unitSuffixAliases = {
            hours: "小时",
            hour: "小时",
            days: "天",
            day: "天",
          },
          unitSuffix =
            metricStateValue?.attributes?.unit_of_measurement || (unitSuffixLabels as any)[metricKey] || "",
          displayUnit = (unitSuffixAliases as any)[String(unitSuffix).toLowerCase()] || unitSuffix;
        return "" + (metricStateValue?.state ?? "--") + (displayUnit ? " " + displayUnit : "");
      },
      stateHandlerByEntityId = new Map(),
      registerEntityStateHandler = (registeredStateEntityId: any, handlerCallback: any) => {
        registeredStateEntityId &&
          (stateHandlerByEntityId.has(registeredStateEntityId) ||
            stateHandlerByEntityId.set(registeredStateEntityId, []),
          stateHandlerByEntityId.get(registeredStateEntityId).push(handlerCallback));
      },
      flatMap = airPurifierMetricGroups.flatMap((metricGroupEntry) =>
        metricGroupEntry.candidates.map((candidateRef) => candidateRef.id),
      ),
      airQualityIndexEntityId = airPurifierDeviceProfile?.roles?.airQuality || "",
      waterHeaterExtensionControls =
        relatedEntityIds !== null
          ? this.createWaterHeaterExtensionControls(airPurifierEntityId, {
              component: airPurifierComponent,
              interactive: !isAirPurifierPreview,
              excludedEntityIds: [
                ...flatMap,
                ...(airQualityIndexEntityId ? [airQualityIndexEntityId] : []),
              ],
            })
          : null;
    if (waterHeaterExtensionControls) {
      (airPurifierDialogCard.append(waterHeaterExtensionControls),
        airPurifierDialog.classList.add("has-related-extensions"));
      for (const [handlerKey, handlerValue] of waterHeaterExtensionControls.stateHandlers || [])
        stateHandlerByEntityId.set(handlerKey, handlerValue);
    }
    const qualityLevelLabels = {
      excellent: "空气优",
      good: "空气良",
      moderate: "一般",
      fair: "一般",
      poor: "较差",
      unhealthy: "较差",
      very_poor: "很差",
    };
    let airQualityState = airQualityIndexEntityId
        ? this.states.get(airQualityIndexEntityId)?.newState ||
          this.states.get(airQualityIndexEntityId)
        : null;
    const particulateMetricGroup = airPurifierMetricGroups.find(
        (particulateGroupItem) => particulateGroupItem.key === "pm25",
      ),
      resolveQualityLevel = () => {
        const particulateSelectedCandidate = particulateMetricGroup
            ? resolveSelectedCandidate(particulateMetricGroup)
            : null,
          particulateValue = isMetricValueValid(lookupEntityState(particulateSelectedCandidate));
        return particulateValue == null
          ? {
              text: "--",
              level: "unknown",
            }
          : particulateValue <= 35
            ? {
                text: "空气优",
                level: "excellent",
              }
            : particulateValue <= 75
              ? {
                  text: "空气良",
                  level: "good",
                }
              : particulateValue <= 115
                ? {
                    text: "轻度污染",
                    level: "warning",
                  }
                : {
                    text: "空气较差",
                    level: "poor",
                  };
      },
      refreshParticulate = () => {
        const trimmedStateText = String(airQualityState?.state || "").trim(),
          lowerCase2 = trimmedStateText.toLowerCase();
        let qualityDisplayValue = ["unknown", "unavailable", ""].includes(lowerCase2)
            ? ""
            : (qualityLevelLabels as any)[lowerCase2] || trimmedStateText,
          qualityLevel = "good";
        (qualityDisplayValue
          ? /very.?poor|severe|很差|重度|严重/.test(lowerCase2) ||
            /poor|unhealthy|较差|中度/.test(lowerCase2)
            ? (qualityLevel = "poor")
            : /moderate|fair|一般|轻度|污染/.test(lowerCase2)
              ? (qualityLevel = "warning")
              : /excellent|优/.test(lowerCase2) && (qualityLevel = "excellent")
          : ({ text: qualityDisplayValue, level: qualityLevel } = resolveQualityLevel()),
          (airPurifierQualityNumberElement.textContent = qualityDisplayValue || "--"),
          (airPurifierQualityUnitElement.textContent = ""),
          airPurifierGaugeBox.style.setProperty(
            "--hb-air-purifier-progress",
            {
              excellent: 72,
              good: 58,
              warning: 42,
              poor: 26,
              unknown: 0,
            }[qualityLevel] + "%",
          ),
          airPurifierGaugeBox.classList.toggle("is-warning", qualityLevel === "warning"),
          airPurifierGaugeBox.classList.toggle("is-poor", qualityLevel === "poor"));
        const accentColor =
            {
              excellent: "#76cfa1",
              good: "#76cfa1",
              warning: "#e4b15f",
              poor: "#db7770",
              unknown: "#7d8990",
            }[qualityLevel] || "#76cfa1",
          accentSoftColor =
            {
              excellent: "rgba(118,207,161,.13)",
              good: "rgba(118,207,161,.13)",
              warning: "rgba(228,177,95,.15)",
              poor: "rgba(219,119,112,.15)",
              unknown: "rgba(125,137,144,.13)",
            }[qualityLevel] || "rgba(118,207,161,.13)";
        (airPurifierDialog.style.setProperty("--hb-air-purifier-accent", accentColor),
          airPurifierDialog.style.setProperty("--hb-air-purifier-accent-soft", accentSoftColor));
      },
      syncAirQualityState = (airQualityStateArg: any) => {
        ((airQualityState = airQualityStateArg), refreshParticulate());
      },
      syncAirPurifierState = (nextAirPurifierState: any) => {
        airPurifierStateSnapshot = nextAirPurifierState || airPurifierStateSnapshot;
        const lowerCase3 = String(airPurifierStateSnapshot?.state || "").toLowerCase(),
          isPurifierUnavailable = ["unknown", "unavailable"].includes(lowerCase3),
          isAirPurifierOn = !isPurifierUnavailable && lowerCase3 !== "off";
        ((airPurifierDisplayLabel.textContent = isAirPurifierOn ? "ON" : "OFF"),
          (airPurifierDialogStatus.textContent = isPurifierUnavailable
            ? "当前不可用"
            : isAirPurifierOn
              ? "已开启"
              : "已关闭"),
          (airPurifierDeviceStatus.textContent = isPurifierUnavailable
            ? "设备不可用"
            : isAirPurifierOn
              ? "净化中"
              : "已关闭"),
          airPurifierDialogStatus.classList.toggle("is-on", isAirPurifierOn),
          airPurifierPowerButton.classList.toggle("is-on", isAirPurifierOn),
          airPurifierPowerButton.classList.toggle("is-unavailable", isPurifierUnavailable),
          airPurifierGaugeBox.classList.toggle("is-running", isAirPurifierOn),
          airPurifierGaugeOrbitIcon.classList.toggle("is-running", isAirPurifierOn),
          airPurifierPowerButton.setAttribute("aria-pressed", String(isAirPurifierOn)),
          capabilityDetailsControls2.syncCapabilityState?.(airPurifierStateSnapshot));
      },
      refreshQualityGauge = () => {
        const slice3 = airPurifierMetricGroups
          .map((metricCandidate) => ({
            metric: metricCandidate,
            selected: resolveSelectedCandidate(metricCandidate),
          }))
          .filter(
            ({ selected: selectedMetricCandidate }) =>
              isMetricValueValid(lookupEntityState(selectedMetricCandidate)) != null,
          )
          .slice(0, visibleMetricRows.length);
        (visibleMetricRows.forEach((metricRow, metricRowIndex) => {
          const metricEntry = slice3[metricRowIndex];
          if (
            ((metricRow.item.hidden = !metricEntry),
            (metricRow.item.className =
              "hb-air-purifier-secondary-metric" +
              (metricEntry ? " hb-air-purifier-secondary-metric--" + metricEntry.metric.key : "")),
            !metricEntry)
          ) {
            ((metricRow.label.textContent = ""), (metricRow.value.textContent = ""));
            return;
          }
          const metricLabelKey = metricEntry.selected?.role || metricEntry.metric.key;
          ((metricRow.label.textContent =
            metricEntry.metric.key === "filter" && metricLabelKey === "filterLeftTime"
              ? "滤芯剩余时间"
              : metricEntry.metric.label),
            (metricRow.value.textContent = formatMetricValue(
              lookupEntityState(metricEntry.selected),
              metricLabelKey,
            )));
        }),
          (airPurifierSecondaryMetricsElement.hidden = slice3.length === 0));
      };
    (syncAirPurifierState(airPurifierStateSnapshot),
      registerEntityStateHandler(airPurifierEntityId, syncAirPurifierState));
    for (const metricGroup of airPurifierMetricGroups) {
      const syncMetricGroup = () => {
        (refreshQualityGauge(), metricGroup.key === "pm25" && refreshParticulate());
      };
      syncMetricGroup();
      for (const metricCandidateRef of metricGroup.candidates)
        registerEntityStateHandler(metricCandidateRef.id, syncMetricGroup);
    }
    (syncAirQualityState(airQualityState),
      registerEntityStateHandler(airQualityIndexEntityId, syncAirQualityState),
      airPurifierPowerButton.addEventListener("click", () =>
        (capabilityDetailsControls2 as HTMLElement)
          .querySelector<HTMLElement>(".hb-capability-power")
          ?.click(),
      ));
    const airPurifierDialogOverlay = document.createElement("div");
    ((airPurifierDialogOverlay.className =
      "hb-renderer-runtime-dialog-layer" + (this.options.editable ? "" : " hb-runtime-no-select")),
      (airPurifierDialogOverlay.tabIndex = -1),
      airPurifierDialogOverlay.append(airPurifierDialog),
      this.container.append(airPurifierDialogOverlay),
      (this.detailsDialog = airPurifierDialog),
      (this.detailsStateSync = {
        dialog: airPurifierDialog,
        handlers: stateHandlerByEntityId,
      }),
      this.registerRuntimeDialogScale(
        airPurifierDialogOverlay,
        airPurifierDialog,
        920,
        waterHeaterExtensionControls ? 620 : 540,
      ),
      airPurifierDialogCloseButton.addEventListener("click", () => airPurifierDialog.close()),
      this.bindRuntimeDialogOutsideDismiss(
        airPurifierDialogOverlay,
        airPurifierDialog,
        airPurifierDialogCard,
      ),
      airPurifierDialogOverlay.addEventListener("keydown", (airPurifierKeyEvent) => {
        airPurifierKeyEvent.key === "Escape" && airPurifierDialog.close();
      }),
      airPurifierDialog.addEventListener(
        "close",
        () => {
          (capabilityDetailsControls2.cleanupCapabilityDetails?.(),
            this.clearRuntimeDialogScale(airPurifierDialog),
            this.detailsDialog === airPurifierDialog && (this.detailsDialog = null),
            this.detailsStateSync?.dialog === airPurifierDialog && (this.detailsStateSync = null),
            airPurifierDialogOverlay.remove());
        },
        {
          once: true,
        },
      ),
      airPurifierDialog.show());
  }
