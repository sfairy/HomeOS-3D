import { entityMetadataIsAvailable } from "./entity-metadata.js?v=20260916013557";
const VACUUM_FEATURE_FLAGS = Object.freeze({
  turn_on: 1,
  turn_off: 2,
  pause: 4,
  stop: 8,
  return_to_base: 16,
  locate: 512,
  clean_spot: 1024,
  start: 8192
});
export function vacuumSupportedActions(vacuumState) {
  const supportedFeatures = vacuumState?.attributes?.supported_features;
  if (supportedFeatures == null || supportedFeatures === "") {
    return ["start", "pause", "return_to_base"];
  }
  const numericFeatures = Number(supportedFeatures);
  if (!Number.isFinite(numericFeatures)) {
    return ["start", "pause", "return_to_base"];
  }
  const actions = [];
  if (
    numericFeatures & VACUUM_FEATURE_FLAGS.start ||
    numericFeatures & VACUUM_FEATURE_FLAGS.turn_on
  ) {
    actions.push("start");
  }
  if (numericFeatures & VACUUM_FEATURE_FLAGS.pause) {
    actions.push("pause");
  }
  if (
    numericFeatures & VACUUM_FEATURE_FLAGS.stop ||
    numericFeatures & VACUUM_FEATURE_FLAGS.turn_off
  ) {
    actions.push("stop");
  }
  if (numericFeatures & VACUUM_FEATURE_FLAGS.return_to_base) {
    actions.push("return_to_base");
  }
  if (numericFeatures & VACUUM_FEATURE_FLAGS.locate) {
    actions.push("locate");
  }
  if (numericFeatures & VACUUM_FEATURE_FLAGS.clean_spot) {
    actions.push("clean_spot");
  }
  return actions;
}
export function vacuumActionService(vacuumEntity, actionName) {
  const featureFlags = Number(vacuumEntity?.attributes?.supported_features);
  if (Number.isFinite(featureFlags)) {
    if (
      actionName === "start" &&
      !(featureFlags & VACUUM_FEATURE_FLAGS.start) &&
      featureFlags & VACUUM_FEATURE_FLAGS.turn_on
    ) {
      return "turn_on";
    } else if (
      actionName === "stop" &&
      !(featureFlags & VACUUM_FEATURE_FLAGS.stop) &&
      featureFlags & VACUUM_FEATURE_FLAGS.turn_off
    ) {
      return "turn_off";
    } else {
      return actionName;
    }
  } else {
    return actionName;
  }
}
function unwrapStateChange(stateOrChange) {
  return stateOrChange?.newState || stateOrChange || null;
}
function parsePercent(rawPercent) {
  if (rawPercent == null || String(rawPercent).trim() === "") {
    return null;
  }
  const parsedPercent = Number.parseFloat(String(rawPercent));
  if (Number.isFinite(parsedPercent)) {
    return Math.max(0, Math.min(100, parsedPercent));
  } else {
    return null;
  }
}
export function vacuumBatteryPercent(vacuumStateOrChange, batterySensor = null) {
  const attributes = unwrapStateChange(vacuumStateOrChange)?.attributes || {};
  for (const batteryAttribute of [
    attributes.battery_level,
    attributes.battery_percentage,
    attributes.battery
  ]) {
    const batteryPercent = parsePercent(batteryAttribute);
    if (batteryPercent !== null) {
      return batteryPercent;
    }
  }
  return parsePercent(unwrapStateChange(batterySensor)?.state);
}
export function relatedVacuumBatteryEntity(metadataByEntityId, statesByEntityId, vacuumEntityId) {
  const vacuumMetadata = metadataByEntityId.get(vacuumEntityId);
  return (
    (vacuumMetadata?.deviceId &&
      [...metadataByEntityId.values()]
        .filter(
          sensorMetadata =>
            sensorMetadata.deviceId === vacuumMetadata.deviceId &&
            sensorMetadata.domain === "sensor" &&
            entityMetadataIsAvailable(sensorMetadata)
        )
        .map(candidateMetadata => {
          const candidateState = unwrapStateChange(
            statesByEntityId.get(candidateMetadata.entityId)
          );
          const candidateAttributes = candidateState?.attributes || {};
          const searchText = (
            (candidateMetadata.entityId || "") +
            " " +
            (candidateMetadata.name || "") +
            " " +
            (candidateMetadata.originalName || "") +
            " " +
            (candidateMetadata.translationKey || "") +
            " " +
            (candidateMetadata.icon || "")
          ).toLowerCase();
          const deviceClass = String(candidateAttributes.device_class || "").toLowerCase();
          const unit = String(candidateAttributes.unit_of_measurement || "").trim();
          let score = 0;
          if (deviceClass === "battery") {
            score += 240;
          }
          if (String(candidateMetadata.translationKey || "").toLowerCase() === "battery") {
            score += 210;
          }
          if (
            /(?:^|[._\s-])battery(?:_level|_percentage)?(?:$|[._\s-])|电池电量|剩余电量|电量/.test(
              searchText
            )
          ) {
            score += 150;
          }
          if (/mdi:battery/.test(searchText)) {
            score += 60;
          }
          if (unit === "%") {
            score += 25;
          }
          if (/filter|brush|mop|consumable|life|尘袋|滤芯|主刷|边刷|拖布|耗材/.test(searchText)) {
            score -= 260;
          }
          if (parsePercent(candidateState?.state) === null) {
            score -= 40;
          }
          return {
            item: candidateMetadata,
            score: score
          };
        })
        .filter(({ score: candidateScore }) => candidateScore > 0)
        .sort(
          (leftCandidate, rightCandidate) =>
            rightCandidate.score - leftCandidate.score ||
            String(leftCandidate.item.entityId || "").length -
              String(rightCandidate.item.entityId || "").length ||
            String(leftCandidate.item.entityId || "").localeCompare(
              String(rightCandidate.item.entityId || "")
            )
        )[0]?.item) ||
    null
  );
}
