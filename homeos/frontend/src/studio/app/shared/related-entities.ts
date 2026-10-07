import { resolveXiaomiDeviceProfile } from "../renderer/core/device-profiles";
const RELATED_ENTITY_MODE_SELECTED = "selected",
  RELATED_POPUP_LABELS = Object.freeze({
    "water-heater": "热水器",
    "air-purifier": "空气净化器",
    "bath-heater": "浴霸",
    "air-conditioner": "空调",
    vacuum: "扫地机器人",
  }),
  RELATED_POPUP_SELECTION_LIMITS = Object.freeze({
    "water-heater": 12,
    "air-purifier": 12,
    "bath-heater": 12,
    "air-conditioner": 12,
    vacuum: 12,
  });
export function relatedPopupSelectionLimit(deviceOrType: any) {
  const normalizedDeviceType =
    typeof deviceOrType == "string" ? deviceOrType : deviceOrType?.deviceType;
  return Number((RELATED_POPUP_SELECTION_LIMITS as any)[normalizedDeviceType] || 0);
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
      "binary_sensor",
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
      "binary_sensor",
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
      "binary_sensor",
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
      "binary_sensor",
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
      "binary_sensor",
    ]),
  }),
  domainSortOrderMap = new Map([
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
    ["button", 7],
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
  binary_sensor: "状态",
});
function entityDomainOf(entity: any) {
  return String(entity?.domain || entity?.entityId || "").split(".", 1)[0];
}
export function relatedEntityIsAvailable(entityValue: any) {
  return (
    !!entityValue?.entityId &&
    !entityValue.disabledBy &&
    entityValue.status !== "missing" &&
    entityValue.status !== "disabled"
  );
}
function entitiesForDevice(entityCollection: any, deviceId: any) {
  return deviceId
    ? [...(entityCollection?.values?.() || [])].filter(
        (candidateEntity) => candidateEntity.deviceId === deviceId,
      )
    : [];
}
function findEntityByDomain(entities: any, domain: any) {
  return (
    entities.find(
      (matchedEntity: any) =>
        entityDomainOf(matchedEntity) === domain && relatedEntityIsAvailable(matchedEntity),
    ) || null
  );
}
function findVacuumEntity(siblingEntities: any) {
  return findEntityByDomain(siblingEntities, "vacuum");
}
function findWaterHeaterEntity(waterHeaterCandidates: any) {
  return findEntityByDomain(waterHeaterCandidates, "water_heater");
}
export function relatedPopupContext(
  component: any,
  entitiesByEntityId = new Map(),
  devicesByDeviceId = new Map(),
  statesByEntityId = new Map(),
) {
  const isPopupTriggerComponent = [
      "icon-button-effect",
      "icon-button",
      "device-button",
      "air-conditioner",
      "water-heater",
      "air-purifier",
      "vacuum-control",
    ].includes(component?.type),
    hasExternalPopupAction = Object.values(component?.actions || {}).some(
      (action: any) =>
        action?.type === "more-info" &&
        !["entity", "custom"].includes(String(action?.data?.popupSource || "current")),
    );
  if (!isPopupTriggerComponent && !hasExternalPopupAction) return null;
  const configuredEntityId = String(component?.bindings?.entity?.entityId || ""),
    sourceEntity = entitiesByEntityId.get(configuredEntityId) || null;
  if (!configuredEntityId || !sourceEntity) return null;
  const popupSiblingEntities = entitiesForDevice(entitiesByEntityId, sourceEntity.deviceId),
    deviceProfile = resolveXiaomiDeviceProfile(
      configuredEntityId,
      entitiesByEntityId,
      devicesByDeviceId,
      statesByEntityId,
    ),
    configuredDeviceType = String(component?.properties?.deviceType || ""),
    configuredDomain = entityDomainOf(sourceEntity),
    climateEntityId = deviceProfile?.roles?.climate || deviceProfile?.roles?.fan || "",
    isClimatePrimary = !!(climateEntityId && configuredEntityId === climateEntityId),
    waterHeaterEntity =
      configuredDomain === "water_heater"
        ? sourceEntity
        : findWaterHeaterEntity(popupSiblingEntities),
    vacuumEntity =
      configuredDomain === "vacuum" ? sourceEntity : findVacuumEntity(popupSiblingEntities);
  let deviceType = "",
    primaryEntityId = configuredEntityId;
  return (
    component?.type === "water-heater" || waterHeaterEntity
      ? ((deviceType = "water-heater"),
        (primaryEntityId = waterHeaterEntity?.entityId || configuredEntityId))
      : component?.type === "air-purifier" ||
          configuredDeviceType === "air-purifier" ||
          deviceProfile?.deviceType === "air-purifier"
        ? ((deviceType = "air-purifier"),
          (primaryEntityId = deviceProfile?.roles?.fan || configuredEntityId))
        : component?.type === "vacuum-control" || vacuumEntity
          ? ((deviceType = "vacuum"),
            (primaryEntityId = vacuumEntity?.entityId || configuredEntityId))
          : configuredDeviceType === "bath-heater" ||
              (deviceProfile?.deviceType === "bath-heater" && isClimatePrimary)
            ? ((deviceType = "bath-heater"),
              (primaryEntityId =
                deviceProfile?.roles?.climate || deviceProfile?.roles?.fan || configuredEntityId))
            : (configuredDeviceType === "air-conditioner" ||
                deviceProfile?.deviceType === "air-conditioner" ||
                configuredDomain === "climate") &&
              ((deviceType = "air-conditioner"),
              (primaryEntityId = deviceProfile?.roles?.climate || configuredEntityId)),
    !deviceType || !sourceEntity.deviceId
      ? null
      : {
          deviceType: deviceType,
          deviceLabel: (RELATED_POPUP_LABELS as any)[deviceType],
          configuredEntityId: configuredEntityId,
          primaryEntityId: primaryEntityId,
          deviceId: sourceEntity.deviceId,
          source: sourceEntity,
          primary: entitiesByEntityId.get(primaryEntityId) || sourceEntity,
          profile: deviceProfile,
          siblings: popupSiblingEntities,
        }
  );
}
export function selectedRelatedEntityIds(componentConfig: any) {
  const relatedConfig = componentConfig?.properties?.relatedEntities;
  return relatedConfig?.mode !== RELATED_ENTITY_MODE_SELECTED ||
    !Array.isArray(relatedConfig.entityIds)
    ? null
    : [
        ...new Set(
          relatedConfig.entityIds.map((entityId: any) => String(entityId || "").trim()).filter(Boolean),
        ),
      ];
}
export function relatedPopupCandidates(
  popupComponent: any,
  entityCatalog = new Map(),
  deviceCatalog = new Map(),
  stateCatalog = new Map(),
) {
  const popupDescriptor = relatedPopupContext(
    popupComponent,
    entityCatalog,
    deviceCatalog,
    stateCatalog,
  );
  if (!popupDescriptor) return [];
  const allowedDomainsSet = (DEVICE_TYPE_ALLOWED_DOMAINS as any)[popupDescriptor.deviceType] || new Set(),
    selectedEntityIdSet = new Set(selectedRelatedEntityIds(popupComponent) || []);
  return popupDescriptor.siblings
    .filter(
      (candidate) =>
        candidate.entityId !== popupDescriptor.primaryEntityId &&
        allowedDomainsSet.has(entityDomainOf(candidate)) &&
        (relatedEntityIsAvailable(candidate) || selectedEntityIdSet.has(candidate.entityId)),
    )
    .sort((left, right) => {
      const leftUnavailable = relatedEntityIsAvailable(left) ? 0 : 1,
        rightUnavailable = relatedEntityIsAvailable(right) ? 0 : 1;
      return (
        leftUnavailable - rightUnavailable ||
        (domainSortOrderMap.get(entityDomainOf(left)) ?? 99) -
          (domainSortOrderMap.get(entityDomainOf(right)) ?? 99) ||
        String(left.entityId || "").localeCompare(String(right.entityId || ""))
      );
    });
}
export function relatedEntityLabel(labelPopupDescriptor: any, entityTarget: any) {
  let label = String(entityTarget?.name || entityTarget?.originalName || "")
    .replace(/\s+/g, " ")
    .trim();
  const sourceNames = [
    ...new Set(
      [
        labelPopupDescriptor?.source?.originalName,
        labelPopupDescriptor?.source?.name,
        labelPopupDescriptor?.primary?.originalName,
        labelPopupDescriptor?.primary?.name,
      ]
        .map((name) =>
          String(name || "")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter(Boolean),
    ),
  ].sort((leftName, rightName) => rightName.length - leftName.length);
  for (const prefix of sourceNames)
    for (; label !== prefix && label.startsWith(prefix + " ");)
      label = label.slice(prefix.length).trim();
  return (
    label ||
    (String(entityTarget?.entityId || "").split(".", 2)[1] || "关联功能").replace(/_/g, " ")
  );
}
export function relatedEntityNeedsConfirmation(confirmationCandidate: any) {
  if (entityDomainOf(confirmationCandidate) !== "button") return false;
  const searchText = [
    confirmationCandidate?.entityId,
    confirmationCandidate?.name,
    confirmationCandidate?.originalName,
    confirmationCandidate?.translationKey,
  ]
    .map((field) => String(field || ""))
    .join(" ");
  return /清空|清除|删除|重置|恢复出厂|格式化|解绑|empty|clear|delete|remove|reset|factory|wipe|format|unbind|purge/i.test(
    searchText,
  );
}
export function relatedEntityOptions(componentSpec: any, entityState: any) {
  const attributes = entityState?.attributes || {},
    optionSources =
      [
        attributes.options,
        attributes.option_list,
        componentSpec?.options,
        componentSpec?.attributes?.options,
        componentSpec?.capabilities?.options,
      ].find((source) => Array.isArray(source)) || [],
    stateValue = String(entityState?.state || "").trim(),
    options = optionSources.map((option) => String(option ?? "").trim()).filter(Boolean);
  return (
    stateValue &&
      !["unknown", "unavailable"].includes(stateValue.toLowerCase()) &&
      options.push(stateValue),
    [...new Set(options)]
  );
}
export function relatedEntitySelectService(domainOrEntity: any) {
  const resolvedDomain =
    typeof domainOrEntity == "string" ? domainOrEntity : entityDomainOf(domainOrEntity);
  return ["select", "input_select"].includes(resolvedDomain)
    ? {
        domain: resolvedDomain,
        service: "select_option",
      }
    : null;
}
export function selectedRelatedEntities(
  selectionComponent: any,
  entityMap = new Map(),
  deviceMap = new Map(),
  stateMap = new Map(),
) {
  const configuredIds = selectedRelatedEntityIds(selectionComponent);
  if (configuredIds === null) return null;
  const limitPopupDescriptor = relatedPopupContext(
      selectionComponent,
      entityMap,
      deviceMap,
      stateMap,
    ),
    selectionLimit = relatedPopupSelectionLimit(limitPopupDescriptor),
    candidatesById = new Map(
      relatedPopupCandidates(selectionComponent, entityMap, deviceMap, stateMap).map(
        (candidateRecord) => [candidateRecord.entityId, candidateRecord],
      ),
    ),
    selectedCandidates = configuredIds
      .map((selectedEntityId) => candidatesById.get(selectedEntityId))
      .filter(Boolean);
  return selectionLimit > 0 ? selectedCandidates.slice(0, selectionLimit) : selectedCandidates;
}
export function manualRelatedEntityConfig(entityIds: any[] = []) {
  return {
    mode: RELATED_ENTITY_MODE_SELECTED,
    entityIds: [
      ...new Set(entityIds.map((rawEntityId) => String(rawEntityId || "").trim()).filter(Boolean)),
    ],
  };
}
