import { resolveXiaomiDeviceProfile } from "./renderer/device-profiles.js?v=20260916013557";
export const RELATED_ENTITY_MODE_SELECTED = "selected";
export const RELATED_POPUP_LABELS = Object.freeze({
  "water-heater": "热水器",
  "air-purifier": "空气净化器",
  "bath-heater": "浴霸",
  "air-conditioner": "空调",
  vacuum: "扫地机器人"
});
export const RELATED_POPUP_SELECTION_LIMITS = Object.freeze({
  "water-heater": 12,
  "air-purifier": 12,
  "bath-heater": 12,
  "air-conditioner": 12,
  vacuum: 12
});
export function relatedPopupSelectionLimit(deviceOrType) {
  const normalizedDeviceType =
    typeof deviceOrType == "string" ? deviceOrType : deviceOrType?.deviceType;
  return Number(RELATED_POPUP_SELECTION_LIMITS[normalizedDeviceType] || 0);
}
const DEVICE_TYPE_ALLOWED_DOMAINS = Object.freeze({
  "water-heater": new Set([
    "light",
    "switch",
    "input_boolean",
    "fan",
    "select",
    "input_select",
    "number",
    "input_number",
    "button",
    "sensor",
    "binary_sensor"
  ]),
  "air-purifier": new Set([
    "light",
    "switch",
    "input_boolean",
    "select",
    "input_select",
    "number",
    "input_number",
    "button",
    "sensor",
    "binary_sensor"
  ]),
  "bath-heater": new Set([
    "light",
    "switch",
    "input_boolean",
    "fan",
    "select",
    "input_select",
    "number",
    "input_number",
    "button",
    "sensor",
    "binary_sensor"
  ]),
  "air-conditioner": new Set([
    "light",
    "switch",
    "input_boolean",
    "fan",
    "select",
    "input_select",
    "number",
    "input_number",
    "button",
    "sensor",
    "binary_sensor"
  ]),
  vacuum: new Set([
    "light",
    "switch",
    "input_boolean",
    "select",
    "input_select",
    "number",
    "input_number",
    "button",
    "sensor",
    "binary_sensor"
  ])
});
const DOMAIN_SORT_ORDER = new Map([
  ["light", 0],
  ["switch", 1],
  ["input_boolean", 1],
  ["fan", 2],
  ["select", 3],
  ["input_select", 3],
  ["number", 4],
  ["input_number", 4],
  ["sensor", 5],
  ["binary_sensor", 6],
  ["button", 7]
]);
export const RELATED_ENTITY_DOMAIN_LABELS = Object.freeze({
  light: "灯光",
  switch: "开关",
  input_boolean: "开关",
  fan: "风扇",
  select: "选项",
  input_select: "选项",
  number: "数值",
  input_number: "数值",
  button: "按钮",
  sensor: "数据",
  binary_sensor: "状态"
});
function entityDomain(entity) {
  return String(entity?.domain || entity?.entityId || "").split(".", 1)[0];
}
export function relatedEntityIsAvailable(entityValue) {
  return (
    !!entityValue?.entityId &&
    !entityValue.disabledBy &&
    entityValue.status !== "missing" &&
    entityValue.status !== "disabled"
  );
}
function entitiesForDevice(entityCollection, deviceId) {
  if (deviceId) {
    return [...(entityCollection?.values?.() || [])].filter(
      candidateEntity => candidateEntity.deviceId === deviceId
    );
  } else {
    return [];
  }
}
function findEntityByDomain(entities, domain) {
  return (
    entities.find(
      matchedEntity =>
        entityDomain(matchedEntity) === domain && relatedEntityIsAvailable(matchedEntity)
    ) || null
  );
}
function findVacuumEntity(siblingEntities) {
  return findEntityByDomain(siblingEntities, "vacuum");
}
function findWaterHeaterEntity(waterHeaterCandidates) {
  return findEntityByDomain(waterHeaterCandidates, "water_heater");
}
export function relatedPopupContext(
  component,
  entitiesByEntityId = new Map(),
  devicesByDeviceId = new Map(),
  statesByEntityId = new Map()
) {
  const isPopupTriggerComponent = [
    "icon-button-effect",
    "icon-button",
    "device-button",
    "air-conditioner",
    "water-heater",
    "air-purifier",
    "vacuum-control"
  ].includes(component?.type);
  const hasExternalPopupAction = Object.values(component?.actions || {}).some(
    action =>
      action?.type === "more-info" &&
      !["entity", "custom"].includes(String(action?.data?.popupSource || "current"))
  );
  if (!isPopupTriggerComponent && !hasExternalPopupAction) {
    return null;
  }
  const configuredEntityId = String(component?.bindings?.entity?.entityId || "");
  const sourceEntity = entitiesByEntityId.get(configuredEntityId) || null;
  if (!configuredEntityId || !sourceEntity) {
    return null;
  }
  const popupSiblingEntities = entitiesForDevice(entitiesByEntityId, sourceEntity.deviceId);
  const deviceProfile = resolveXiaomiDeviceProfile(
    configuredEntityId,
    entitiesByEntityId,
    devicesByDeviceId,
    statesByEntityId
  );
  const configuredDeviceType = String(component?.properties?.deviceType || "");
  const configuredDomain = entityDomain(sourceEntity);
  const climateEntityId = deviceProfile?.roles?.climate || deviceProfile?.roles?.fan || "";
  const isClimatePrimary = !!climateEntityId && configuredEntityId === climateEntityId;
  const waterHeaterEntity =
    configuredDomain === "water_heater"
      ? sourceEntity
      : findWaterHeaterEntity(popupSiblingEntities);
  const vacuumEntity =
    configuredDomain === "vacuum" ? sourceEntity : findVacuumEntity(popupSiblingEntities);
  let deviceType = "";
  let primaryEntityId = configuredEntityId;
  if (component?.type === "water-heater" || waterHeaterEntity) {
    deviceType = "water-heater";
    primaryEntityId = waterHeaterEntity?.entityId || configuredEntityId;
  } else if (
    component?.type === "air-purifier" ||
    configuredDeviceType === "air-purifier" ||
    deviceProfile?.deviceType === "air-purifier"
  ) {
    deviceType = "air-purifier";
    primaryEntityId = deviceProfile?.roles?.fan || configuredEntityId;
  } else if (component?.type === "vacuum-control" || vacuumEntity) {
    deviceType = "vacuum";
    primaryEntityId = vacuumEntity?.entityId || configuredEntityId;
  } else if (
    configuredDeviceType === "bath-heater" ||
    (deviceProfile?.deviceType === "bath-heater" && isClimatePrimary)
  ) {
    deviceType = "bath-heater";
    primaryEntityId =
      deviceProfile?.roles?.climate || deviceProfile?.roles?.fan || configuredEntityId;
  } else if (
    configuredDeviceType === "air-conditioner" ||
    deviceProfile?.deviceType === "air-conditioner" ||
    configuredDomain === "climate"
  ) {
    deviceType = "air-conditioner";
    primaryEntityId = deviceProfile?.roles?.climate || configuredEntityId;
  }
  if (!deviceType || !sourceEntity.deviceId) {
    return null;
  } else {
    return {
      deviceType: deviceType,
      deviceLabel: RELATED_POPUP_LABELS[deviceType],
      configuredEntityId: configuredEntityId,
      primaryEntityId: primaryEntityId,
      deviceId: sourceEntity.deviceId,
      source: sourceEntity,
      primary: entitiesByEntityId.get(primaryEntityId) || sourceEntity,
      profile: deviceProfile,
      siblings: popupSiblingEntities
    };
  }
}
export function selectedRelatedEntityIds(componentConfig) {
  const relatedConfig = componentConfig?.properties?.relatedEntities;
  if (
    relatedConfig?.mode !== RELATED_ENTITY_MODE_SELECTED ||
    !Array.isArray(relatedConfig.entityIds)
  ) {
    return null;
  } else {
    return [
      ...new Set(
        relatedConfig.entityIds.map(entityId => String(entityId || "").trim()).filter(Boolean)
      )
    ];
  }
}
export function relatedPopupCandidates(
  popupComponent,
  entityCatalog = new Map(),
  deviceCatalog = new Map(),
  stateCatalog = new Map()
) {
  const context = relatedPopupContext(popupComponent, entityCatalog, deviceCatalog, stateCatalog);
  if (!context) {
    return [];
  }
  const allowedDomains = DEVICE_TYPE_ALLOWED_DOMAINS[context.deviceType] || new Set();
  const selectedEntityIdSet = new Set(selectedRelatedEntityIds(popupComponent) || []);
  return context.siblings
    .filter(
      candidate =>
        candidate.entityId !== context.primaryEntityId &&
        allowedDomains.has(entityDomain(candidate)) &&
        (relatedEntityIsAvailable(candidate) || selectedEntityIdSet.has(candidate.entityId))
    )
    .sort((left, right) => {
      const leftUnavailable = relatedEntityIsAvailable(left) ? 0 : 1;
      const rightUnavailable = relatedEntityIsAvailable(right) ? 0 : 1;
      return (
        leftUnavailable - rightUnavailable ||
        (DOMAIN_SORT_ORDER.get(entityDomain(left)) ?? 99) -
          (DOMAIN_SORT_ORDER.get(entityDomain(right)) ?? 99) ||
        String(left.entityId || "").localeCompare(String(right.entityId || ""))
      );
    });
}
export function legacyRelatedEntityIds(
  popupComponentInput,
  entityLookup = new Map(),
  deviceLookup = new Map(),
  stateLookup = new Map()
) {
  const relatedContext = relatedPopupContext(
    popupComponentInput,
    entityLookup,
    deviceLookup,
    stateLookup
  );
  if (!relatedContext) {
    return [];
  }
  const candidates = relatedPopupCandidates(
    popupComponentInput,
    entityLookup,
    deviceLookup,
    stateLookup
  );
  if (relatedContext.deviceType === "water-heater") {
    return candidates
      .filter(
        legacyCandidate =>
          ["switch", "select", "number", "button"].includes(entityDomain(legacyCandidate)) &&
          relatedEntityIsAvailable(legacyCandidate)
      )
      .map(pickedCandidate => pickedCandidate.entityId);
  }
  if (relatedContext.deviceType === "air-purifier") {
    const roleIds = relatedContext.profile?.roles || {};
    return [
      ...new Set(
        [
          "pm25",
          "pm10",
          "filterLife",
          "filterLeftTime",
          "hcho",
          "temperature",
          "humidity",
          "airQuality"
        ]
          .map(roleName => roleIds[roleName])
          .filter(Boolean)
      )
    ];
  }
  if (relatedContext.deviceType === "bath-heater") {
    const lightEntityId =
      relatedContext.profile?.roles?.light ||
      candidates.find(
        lightCandidate =>
          entityDomain(lightCandidate) === "light" && relatedEntityIsAvailable(lightCandidate)
      )?.entityId;
    if (lightEntityId) {
      return [lightEntityId];
    } else {
      return [];
    }
  }
  if (relatedContext.deviceType === "vacuum") {
    const modeCandidate = candidates.find(
      modeOptionCandidate =>
        entityDomain(modeOptionCandidate) === "select" &&
        (/cleaning_mode/i.test(String(modeOptionCandidate.entityId || "")) ||
          modeOptionCandidate.translationKey === "cleaning_mode")
    );
    if (modeCandidate?.entityId) {
      return [modeCandidate.entityId];
    } else {
      return [];
    }
  }
  return [];
}
export function relatedEntityLabel(popupContext, entityTarget) {
  let label = String(entityTarget?.name || entityTarget?.originalName || "")
    .replace(/\s+/g, " ")
    .trim();
  const sourceNames = [
    ...new Set(
      [
        popupContext?.source?.originalName,
        popupContext?.source?.name,
        popupContext?.primary?.originalName,
        popupContext?.primary?.name
      ]
        .map(name =>
          String(name || "")
            .replace(/\s+/g, " ")
            .trim()
        )
        .filter(Boolean)
    )
  ].sort((leftName, rightName) => rightName.length - leftName.length);
  for (const prefix of sourceNames) {
    while (label !== prefix && label.startsWith(prefix + " ")) {
      label = label.slice(prefix.length).trim();
    }
  }
  return (
    label ||
    (String(entityTarget?.entityId || "").split(".", 2)[1] || "关联功能").replace(/_/g, " ")
  );
}
export function relatedEntityNeedsConfirmation(confirmationCandidate) {
  if (entityDomain(confirmationCandidate) !== "button") {
    return false;
  }
  const searchText = [
    confirmationCandidate?.entityId,
    confirmationCandidate?.name,
    confirmationCandidate?.originalName,
    confirmationCandidate?.translationKey
  ]
    .map(field => String(field || ""))
    .join(" ");
  return /清空|清除|删除|重置|恢复出厂|格式化|解绑|empty|clear|delete|remove|reset|factory|wipe|format|unbind|purge/i.test(
    searchText
  );
}
export function relatedEntityOptions(componentSpec, entityState) {
  const attributes = entityState?.attributes || {};
  const optionSources =
    [
      attributes.options,
      attributes.option_list,
      componentSpec?.options,
      componentSpec?.attributes?.options,
      componentSpec?.capabilities?.options
    ].find(source => Array.isArray(source)) || [];
  const stateValue = String(entityState?.state || "").trim();
  const options = optionSources.map(option => String(option ?? "").trim()).filter(Boolean);
  if (stateValue && !["unknown", "unavailable"].includes(stateValue.toLowerCase())) {
    options.push(stateValue);
  }
  return [...new Set(options)];
}
export function relatedEntitySelectService(domainOrEntity) {
  const resolvedDomain =
    typeof domainOrEntity == "string" ? domainOrEntity : entityDomain(domainOrEntity);
  if (["select", "input_select"].includes(resolvedDomain)) {
    return {
      domain: resolvedDomain,
      service: "select_option"
    };
  } else {
    return null;
  }
}
export function selectedRelatedEntities(
  selectionComponent,
  entityMap = new Map(),
  deviceMap = new Map(),
  stateMap = new Map()
) {
  const configuredIds = selectedRelatedEntityIds(selectionComponent);
  if (configuredIds === null) {
    return null;
  }
  const popupContextInfo = relatedPopupContext(selectionComponent, entityMap, deviceMap, stateMap);
  const selectionLimit = relatedPopupSelectionLimit(popupContextInfo);
  const candidatesById = new Map(
    relatedPopupCandidates(selectionComponent, entityMap, deviceMap, stateMap).map(
      candidateRecord => [candidateRecord.entityId, candidateRecord]
    )
  );
  const selectedCandidates = configuredIds
    .map(selectedEntityId => candidatesById.get(selectedEntityId))
    .filter(Boolean);
  if (selectionLimit > 0) {
    return selectedCandidates.slice(0, selectionLimit);
  } else {
    return selectedCandidates;
  }
}
export function manualRelatedEntityConfig(entityIds = []) {
  return {
    mode: RELATED_ENTITY_MODE_SELECTED,
    entityIds: [
      ...new Set(entityIds.map(rawEntityId => String(rawEntityId || "").trim()).filter(Boolean))
    ]
  };
}
