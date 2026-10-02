import { entityMetadataIsAvailable } from "../core/entity-metadata";
import type { HaEntityAttributes, HaEntityEntry } from "@app/utils/ha-entity";
const VACUUM_FEATURE_FLAGS = Object.freeze({
  turn_on: 1,
  turn_off: 2,
  pause: 4,
  stop: 8,
  return_to_base: 16,
  locate: 512,
  clean_spot: 1024,
  start: 8192,
});
export function vacuumSupportedActions(vacuumState) {
  const supportedFeatures = vacuumState?.attributes?.supported_features;
  if (supportedFeatures == null || supportedFeatures === "")
    return ["start", "pause", "return_to_base"];
  const numericFeatures = Number(supportedFeatures);
  if (!Number.isFinite(numericFeatures)) return ["start", "pause", "return_to_base"];
  const actions = [];
  return (
    (numericFeatures & VACUUM_FEATURE_FLAGS.start ||
      numericFeatures & VACUUM_FEATURE_FLAGS.turn_on) &&
      actions.push("start"),
    numericFeatures & VACUUM_FEATURE_FLAGS.pause && actions.push("pause"),
    (numericFeatures & VACUUM_FEATURE_FLAGS.stop ||
      numericFeatures & VACUUM_FEATURE_FLAGS.turn_off) &&
      actions.push("stop"),
    numericFeatures & VACUUM_FEATURE_FLAGS.return_to_base && actions.push("return_to_base"),
    numericFeatures & VACUUM_FEATURE_FLAGS.locate && actions.push("locate"),
    numericFeatures & VACUUM_FEATURE_FLAGS.clean_spot && actions.push("clean_spot"),
    actions
  );
}
export function vacuumActionService(vacuumEntity, actionName) {
  const featureFlags = Number(vacuumEntity?.attributes?.supported_features);
  return Number.isFinite(featureFlags)
    ? actionName === "start" &&
      !(featureFlags & VACUUM_FEATURE_FLAGS.start) &&
      featureFlags & VACUUM_FEATURE_FLAGS.turn_on
      ? "turn_on"
      : actionName === "stop" &&
          !(featureFlags & VACUUM_FEATURE_FLAGS.stop) &&
          featureFlags & VACUUM_FEATURE_FLAGS.turn_off
        ? "turn_off"
        : actionName
    : actionName;
}
function resolveStateEntry(stateEntryOrChange) {
  return stateEntryOrChange?.newState || stateEntryOrChange || null;
}
const statusLabels = {
    cleaning: "清扫中",
    sweeping: "扫地中",
    mopping: "拖地中",
    sweeping_and_mopping: "扫拖中",
    mopping_after_sweeping: "先扫后拖中",
    spot_cleaning: "局部清扫中",
    zone_cleaning: "区域清扫中",
    segment_cleaning: "房间清扫中",
    auto_cleaning: "自动清扫中",
    second_cleaning: "二次清洁中",
    extra_cleaning: "加强清洁中",
    heading_to_extra_cleaning: "前往加强清洁",
    initial_deep_cleaning: "深度清洁中",
    returning: "回充中",
    returning_to_wash: "返回清洗拖布",
    returning_to_wash_paused: "返回清洗已暂停",
    returning_paused: "回充已暂停",
    returning_auto_empty: "返回集尘",
    returning_install_mop: "返回安装拖布",
    returning_remove_mop: "返回拆卸拖布",
    returning_to_drain: "返回排水",
    washing: "清洗拖布",
    washing_paused: "清洗已暂停",
    drying: "烘干拖布",
    drying_paused: "烘干已暂停",
    auto_emptying: "集尘中",
    station_cleaning: "基站自清洁",
    station_reset: "基站复位中",
    clean_add_water: "补水中",
    water_check: "水路检查中",
    draining: "排水中",
    auto_water_draining: "自动排水中",
    emptying: "排空水箱中",
    dust_bag_drying: "尘袋烘干中",
    dust_bag_drying_paused: "尘袋烘干已暂停",
    installing_mop: "安装拖布中",
    uninstalling_mop: "拆卸拖布中",
    changing_mop: "更换拖布中",
    changing_mop_paused: "更换拖布已暂停",
    sanitizing: "消毒中",
    sanitizing_with_dry: "消毒烘干中",
    charging: "充电中",
    charging_completed: "充电完成",
    smart_charging: "智能充电",
    intelligent_recharging: "智能回充中",
    docked: "已回充",
    idle: "待机",
    paused: "已暂停",
    stopped: "已停止",
    sleeping: "休眠中",
    waiting_for_task: "等待任务",
    upgrading: "固件升级中",
    mapping: "建图中",
    remote_control: "遥控中",
    monitoring: "巡航中",
    monitoring_paused: "巡航已暂停",
    finding_pet: "寻找宠物中",
    finding_pet_paused: "寻找宠物已暂停",
    human_following: "跟随中",
    pet_guarding: "宠物看护中",
    pet_guarding_paused: "宠物看护已暂停",
    clean_summon: "前往指定位置清洁",
    shortcut: "快捷任务中",
    floor_maintaining: "地板养护中",
    floor_maintaining_paused: "地板养护已暂停",
    initial_deep_cleaning_paused: "深度清洁已暂停",
    remote_pickup: "遥控拾取中",
    arranging_items: "整理物品中",
    assisted_cleaning: "辅助清洁中",
    entering_dock: "进入基站",
    leaving_dock: "离开基站",
    navigating_to_climber: "前往爬楼装置",
    docking_to_climber: "连接爬楼装置",
    climber_docked: "已连接爬楼装置",
    climber_navigating: "爬楼装置移动中",
    climbing_stairs: "爬楼中",
    climbing_stairs_completed: "爬楼完成",
    climber_at_dock: "爬楼装置已停靠",
    climber_leaving_dock: "爬楼装置离站中",
    error: "设备异常",
    unavailable: "设备离线",
    unknown: "等待状态",
  },
  statusAliases = {
    vacuuming: "cleaning",
    standby: "idle",
    ready: "idle",
    off: "stopped",
    returning_to_base: "returning",
    returning_home: "returning",
    back_home: "returning",
    return_to_charge: "returning",
    returning_to_washing: "returning_to_wash",
    mop_washing: "washing",
    self_washing: "washing",
    cleaning_mop: "washing",
    mop_drying: "drying",
    drying_mop: "drying",
    building: "mapping",
    fast_mapping: "mapping",
    automatic: "auto_cleaning",
    zone: "zone_cleaning",
    segment: "segment_cleaning",
    spot: "spot_cleaning",
    cleaning_paused: "paused",
    docking_paused: "returning_paused",
    auto_docking_paused: "returning_paused",
    segment_docking_paused: "returning_paused",
    zone_docking_paused: "returning_paused",
    auto_cleaning_paused: "paused",
    segment_cleaning_paused: "paused",
    zone_cleaning_paused: "paused",
    spot_cleaning_paused: "paused",
    mopping_paused: "paused",
    zone_mopping_paused: "paused",
    segment_mopping_paused: "paused",
    auto_mopping_paused: "paused",
    map_cleaning_paused: "paused",
    adding_water: "clean_add_water",
    room_cleaning: "segment_cleaning",
    follow_wall_cleaning: "cleaning",
    cruising_path: "monitoring",
    cruising_point: "monitoring",
    cruising_path_paused: "monitoring_paused",
    cruising_point_paused: "monitoring_paused",
    summon_clean: "clean_summon",
    person_follow: "human_following",
    ota: "upgrading",
    power_off: "stopped",
    pet_finding: "finding_pet",
  },
  movingStatusSet = new Set(
    "cleaning sweeping mopping sweeping_and_mopping mopping_after_sweeping spot_cleaning zone_cleaning segment_cleaning auto_cleaning second_cleaning extra_cleaning heading_to_extra_cleaning initial_deep_cleaning returning returning_to_wash returning_auto_empty returning_install_mop returning_remove_mop returning_to_drain intelligent_recharging mapping remote_control monitoring finding_pet human_following pet_guarding clean_summon shortcut floor_maintaining remote_pickup arranging_items assisted_cleaning entering_dock leaving_dock navigating_to_climber docking_to_climber climber_navigating climbing_stairs climber_leaving_dock".split(
      " ",
    ),
  ),
  stationWorkingStatusSet = new Set(
    "washing drying auto_emptying station_cleaning station_reset clean_add_water water_check draining auto_water_draining emptying dust_bag_drying installing_mop uninstalling_mop changing_mop sanitizing sanitizing_with_dry".split(
      " ",
    ),
  ),
  dockedStatusSet = new Set(["docked", "charging", "charging_completed", "smart_charging"]),
  statusRoleFields = [
    "self_wash_base_status",
    "auto_empty_status",
    "charging_status",
    "task_status",
    "state",
    "status",
  ],
  normalizeStatusKey = (rawStatus) => {
    const normalizedStatus = String(rawStatus ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    return statusAliases[normalizedStatus] || normalizedStatus;
  },
  isTruthyFlag = (rawFlagValue) =>
    rawFlagValue === true ||
    rawFlagValue === 1 ||
    ["true", "on", "1"].includes(String(rawFlagValue).toLowerCase());
function vacuumStatusRole(entity: HaEntityEntry = {}) {
  if ((entity.domain || entity.entityId?.split(".")[0]) !== "sensor") return "";
  const translationKey = entity.translationKey || entity.translation_key;
  return translationKey
    ? statusRoleFields.includes(translationKey)
      ? translationKey
      : ""
    : statusRoleFields.find((roleCandidate) =>
        new RegExp("(?:^|_)" + roleCandidate + "(?:_\\d+)?$").test(
          entity.entityId?.split(".")[1] || "",
        ),
      ) || "";
}
export function relatedVacuumStatusEntities(metadataByEntityId, vacuumEntityId) {
  const vacuumMetadata = metadataByEntityId?.get(vacuumEntityId);
  return vacuumMetadata?.deviceId
    ? [...metadataByEntityId.values()].filter(
        (sensorMetadata) =>
          sensorMetadata.deviceId === vacuumMetadata.deviceId &&
          entityMetadataIsAvailable(sensorMetadata) &&
          !sensorMetadata.disabled_by &&
          sensorMetadata.enabled !== false &&
          vacuumStatusRole(sensorMetadata),
      )
    : [];
}
export function vacuumStatusBinding(binding, relatedMetadataByEntityId) {
  const relatedStatusEntities = relatedVacuumStatusEntities(
    relatedMetadataByEntityId,
    binding.entityId,
  );
  return !relatedStatusEntities.length &&
    !relatedMetadataByEntityId?.get(binding.entityId)?.deviceId
    ? binding
    : {
        ...binding,
        relatedEntityIds: [
          ...new Set([
            ...(binding.relatedEntityIds || []),
            ...relatedStatusEntities.map((relatedMetadata) => relatedMetadata.entityId),
          ]),
        ],
        statusEntityRoles: Object.fromEntries(
          relatedStatusEntities.map((relatedEntity) => [
            relatedEntity.entityId,
            vacuumStatusRole(relatedEntity),
          ]),
        ),
      };
}
export function vacuumStatus(vacuumStateOrChange, relatedEntities = []) {
  const stateEntry = resolveStateEntry(vacuumStateOrChange),
    stateAttributes: HaEntityAttributes = stateEntry?.attributes || {},
    entityStatusKey = normalizeStatusKey(stateEntry?.state || "unknown"),
    isAvailable = !["unknown", "unavailable"].includes(entityStatusKey),
    statusByRole: Record<string, string> = {},
    conflictingRoleSet = new Set<string>();
  for (const relatedEntityEntry of relatedEntities) {
    const relatedRole =
        relatedEntityEntry.role === undefined
          ? vacuumStatusRole(relatedEntityEntry)
          : relatedEntityEntry.role,
      relatedStateEntry = resolveStateEntry(relatedEntityEntry.state),
      relatedStatusKey = normalizeStatusKey(relatedStateEntry?.state);
    !relatedRole ||
      !relatedStatusKey ||
      ["unknown", "unavailable"].includes(relatedStatusKey) ||
      (["state", "status", "task_status"].includes(relatedRole) &&
        !statusLabels[relatedStatusKey] &&
        !/[\u3400-\u9fff]/.test(relatedStatusKey)) ||
      (statusByRole[relatedRole] && statusByRole[relatedRole] !== relatedStatusKey
        ? conflictingRoleSet.add(relatedRole)
        : (statusByRole[relatedRole] = relatedStatusKey));
  }
  for (const conflictingRole of conflictingRoleSet) delete statusByRole[conflictingRole];
  const normalizeKnownStatus = (candidateStatus) => {
      const knownStatus = normalizeStatusKey(candidateStatus);
      return !["unknown", "unavailable"].includes(knownStatus) &&
        (statusLabels[knownStatus] || /[\u3400-\u9fff]/.test(knownStatus))
        ? knownStatus
        : "";
    },
    vacuumStateKey = normalizeKnownStatus(stateAttributes.vacuum_state) || statusByRole.state,
    resolvedStatusKey =
      vacuumStateKey ||
      normalizeKnownStatus(stateAttributes.status) ||
      statusByRole.status ||
      statusByRole.task_status;
  let statusKey = resolvedStatusKey || entityStatusKey;
  const selfWashBaseStatus =
      statusByRole.self_wash_base_status ||
      normalizeStatusKey(stateAttributes.self_wash_base_status),
    isTaskRunning =
      !!resolvedStatusKey &&
      (stationWorkingStatusSet.has(statusKey) ||
        statusKey === "paused" ||
        statusKey.endsWith("_paused") ||
        (movingStatusSet.has(statusKey) && !["cleaning", "returning"].includes(statusKey)) ||
        (vacuumStateKey &&
          [
            "idle",
            "stopped",
            "sleeping",
            "waiting_for_task",
            "charging_completed",
            "smart_charging",
            "upgrading",
          ].includes(statusKey))),
    isPauseApplicable = !isTaskRunning || entityStatusKey === "paused",
    isReturningForWashBase = ["returning", "returning_for_wash", "returning_for_dry_mop"].includes(
      selfWashBaseStatus,
    ),
    isReturningToWash =
      statusKey === "returning_to_wash" ||
      (!isTaskRunning &&
        (isTruthyFlag(stateAttributes.returning_to_wash) || isReturningForWashBase)),
    isReturningToWashPaused =
      isPauseApplicable && isTruthyFlag(stateAttributes.returning_to_wash_paused),
    isWashingPaused =
      statusKey === "washing_paused" ||
      (isPauseApplicable &&
        (isTruthyFlag(stateAttributes.washing_paused) || selfWashBaseStatus === "paused")),
    isPaused =
      entityStatusKey === "paused" ||
      statusKey === "paused" ||
      isWashingPaused ||
      statusKey.endsWith("_paused") ||
      (isPauseApplicable &&
        (isTruthyFlag(stateAttributes.paused) ||
          isReturningToWashPaused ||
          isTruthyFlag(stateAttributes.returning_paused)));
  isAvailable
    ? entityStatusKey === "error" ||
      statusKey === "error" ||
      isTruthyFlag(stateAttributes.has_error)
      ? (statusKey = "error")
      : isReturningToWashPaused || (isPaused && isReturningToWash)
        ? (statusKey = "returning_to_wash_paused")
        : isWashingPaused
          ? (statusKey = "washing_paused")
          : isPaused
            ? (statusKey =
                statusKey.endsWith("_paused") && statusLabels[statusKey]
                  ? statusKey
                  : isTruthyFlag(stateAttributes.returning_paused)
                    ? "returning_paused"
                    : "paused")
            : !isTaskRunning && isReturningToWash
              ? (statusKey = "returning_to_wash")
              : !isTaskRunning && isTruthyFlag(stateAttributes.draining)
                ? (statusKey = "draining")
                : isTaskRunning ||
                  (isTruthyFlag(stateAttributes.washing) || selfWashBaseStatus === "washing"
                    ? (statusKey = "washing")
                    : isTruthyFlag(stateAttributes.drying) || selfWashBaseStatus === "drying"
                      ? (statusKey = "drying")
                      : stationWorkingStatusSet.has(selfWashBaseStatus)
                        ? (statusKey = selfWashBaseStatus)
                        : ["active", "emptying", "auto_emptying"].includes(
                              statusByRole.auto_empty_status ||
                                normalizeStatusKey(stateAttributes.auto_empty_status),
                            )
                          ? (statusKey = "auto_emptying")
                          : isTruthyFlag(stateAttributes.mapping)
                            ? (statusKey = "mapping")
                            : isTruthyFlag(stateAttributes.returning) &&
                                (!resolvedStatusKey || statusKey === "returning")
                              ? (statusKey = "returning")
                              : dockedStatusSet.has(entityStatusKey) &&
                                (!resolvedStatusKey || dockedStatusSet.has(statusKey)) &&
                                dockedStatusSet.has(statusByRole.charging_status) &&
                                (statusKey = statusByRole.charging_status))
    : (statusKey = entityStatusKey);
  const isPausedOrError =
      !isAvailable ||
      statusKey === "error" ||
      statusKey === "paused" ||
      statusKey.endsWith("_paused"),
    isMoving = !isPausedOrError && movingStatusSet.has(statusKey),
    isStationWorking = !isPausedOrError && stationWorkingStatusSet.has(statusKey),
    isDocked =
      isAvailable &&
      !isMoving &&
      (dockedStatusSet.has(statusKey) ||
        isStationWorking ||
        [
          "washing_paused",
          "drying_paused",
          "dust_bag_drying_paused",
          "changing_mop_paused",
        ].includes(statusKey) ||
        dockedStatusSet.has(entityStatusKey) ||
        (!isPaused &&
          (isTruthyFlag(stateAttributes.docked) || isTruthyFlag(stateAttributes.charging))));
  return {
    key: statusKey,
    status:
      statusLabels[statusKey] ||
      (/[\u3400-\u9fff]/.test(statusKey)
        ? String(resolvedStatusKey || stateEntry?.state).trim()
        : "状态更新中"),
    available: isAvailable,
    active: !isPausedOrError && (isMoving || isStationWorking),
    moving: isMoving,
    stationWorking: isStationWorking,
    docked: isDocked,
    paused:
      isAvailable &&
      statusKey !== "error" &&
      (statusKey === "paused" || statusKey.endsWith("_paused")),
    returning:
      isMoving && (statusKey.startsWith("returning") || statusKey === "intelligent_recharging"),
  };
}
function parsePercent(rawPercent) {
  if (rawPercent == null || String(rawPercent).trim() === "") return null;
  const parsedPercent = Number.parseFloat(String(rawPercent));
  return Number.isFinite(parsedPercent) ? Math.max(0, Math.min(100, parsedPercent)) : null;
}
export function vacuumBatteryPercent(batterySourceState, batterySensor = null) {
  const batteryAttributes = resolveStateEntry(batterySourceState)?.attributes || {};
  for (const batteryAttribute of [
    batteryAttributes.battery_level,
    batteryAttributes.battery_percentage,
    batteryAttributes.battery,
  ]) {
    const batteryPercent = parsePercent(batteryAttribute);
    if (batteryPercent !== null) return batteryPercent;
  }
  return parsePercent(resolveStateEntry(batterySensor)?.state);
}
export function relatedVacuumBatteryEntity(
  batteryMetadataByEntityId,
  statesByEntityId,
  batteryVacuumEntityId,
) {
  const batteryVacuumMetadata = batteryMetadataByEntityId.get(batteryVacuumEntityId);
  return (
    (batteryVacuumMetadata?.deviceId &&
      [...batteryMetadataByEntityId.values()]
        .filter(
          (candidateSensorMetadata) =>
            candidateSensorMetadata.deviceId === batteryVacuumMetadata.deviceId &&
            candidateSensorMetadata.domain === "sensor" &&
            entityMetadataIsAvailable(candidateSensorMetadata),
        )
        .map((candidateEntityMetadata) => {
          const candidateStateEntry = resolveStateEntry(
              statesByEntityId.get(candidateEntityMetadata.entityId),
            ),
            candidateAttributes = candidateStateEntry?.attributes || {},
            searchText = (
              (candidateEntityMetadata.entityId || "") +
              " " +
              (candidateEntityMetadata.name || "") +
              " " +
              (candidateEntityMetadata.originalName || "") +
              " " +
              (candidateEntityMetadata.translationKey || "") +
              " " +
              (candidateEntityMetadata.icon || "")
            ).toLowerCase(),
            deviceClass = String(candidateAttributes.device_class || "").toLowerCase(),
            measurementUnit = String(candidateAttributes.unit_of_measurement || "").trim();
          let batteryScore = 0;
          return (
            deviceClass === "battery" && (batteryScore += 240),
            String(candidateEntityMetadata.translationKey || "").toLowerCase() === "battery" &&
              (batteryScore += 210),
            /(?:^|[._\s-])battery(?:_level|_percentage)?(?:$|[._\s-])|电池电量|剩余电量|电量/.test(
              searchText,
            ) && (batteryScore += 150),
            /mdi:battery/.test(searchText) && (batteryScore += 60),
            measurementUnit === "%" && (batteryScore += 25),
            /filter|brush|mop|consumable|life|尘袋|滤芯|主刷|边刷|拖布|耗材/.test(searchText) &&
              (batteryScore -= 260),
            parsePercent(candidateStateEntry?.state) === null && (batteryScore -= 40),
            {
              item: candidateEntityMetadata,
              score: batteryScore,
            }
          );
        })
        .filter(({ score: candidateScore }) => candidateScore > 0)
        .sort(
          (leftCandidate, rightCandidate) =>
            rightCandidate.score - leftCandidate.score ||
            String(leftCandidate.item.entityId || "").length -
              String(rightCandidate.item.entityId || "").length ||
            String(leftCandidate.item.entityId || "").localeCompare(
              String(rightCandidate.item.entityId || ""),
            ),
        )[0]?.item) ||
    null
  );
}
