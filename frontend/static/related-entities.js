/**
 * 弹窗「关联功能」实体：候选筛选、默认勾选、名称清洗与操作确认。
 *
 * 位置：编辑器弹窗设计器中「关联实体」选择器，以及展示页弹窗渲染时的取数层。
 * 职责：由被绑定的实体推导出所属设备（热水器 / 净化器 / 浴霸 / 空调 / 扫地机），
 *   从同一设备的兄弟实体里挑出可关联项、按域排序、限制勾选数量；同时提供
 *   去前缀显示名、危险操作确认、可选项列表与服务映射等辅助能力。
 * 约定：① mode 为 "selected" 的显式勾选优先；返回 null 表示「未配置过」，
 *   与「配置为空」区分开；② 各设备类型的可选域白名单与数量上限是产品约定，
 *   改动会影响既有弹窗的显示；③ 候选排序稳定：不可用项最后、再按域优先级、
 *   最后按实体 ID 字典序。
 */
import { resolveXiaomiDeviceProfile } from "./renderer/device-profiles.js?v=20260919135340";
import { entityDomainOf } from "./utils/entities.js?v=20260919135340";

// 显式勾选模式的标识值，与文档里 properties.relatedEntities.mode 对应。
export const RELATED_ENTITY_MODE_SELECTED = "selected";

// 各设备类型在界面上展示的名称。
export const RELATED_POPUP_LABELS = Object.freeze({
  "water-heater": "热水器",
  "air-purifier": "空气净化器",
  "bath-heater": "浴霸",
  "air-conditioner": "空调",
  vacuum: "扫地机器人"
});

// 每类设备最多可关联的功能数量；12 是单屏弹窗能排下的上限。
export const RELATED_POPUP_SELECTION_LIMITS = Object.freeze({
  "water-heater": 12,
  "air-purifier": 12,
  "bath-heater": 12,
  "air-conditioner": 12,
  vacuum: 12
});

/**
 * 取某设备类型的关联数量上限。
 *
 * @param {string|object} deviceOrType 设备类型字符串或含 deviceType 的对象。
 * @returns {number} 上限；未知类型返回 0（表示不限制，由调用方决定）。
 */
export function relatedPopupSelectionLimit(deviceOrType) {
  const normalizedDeviceType =
    typeof deviceOrType == "string" ? deviceOrType : deviceOrType?.deviceType;
  return Number(RELATED_POPUP_SELECTION_LIMITS[normalizedDeviceType] || 0);
}

// 各设备类型允许关联的 HA 域白名单：只放可控 / 可读的域，排除 automation 等。
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

// 候选列表的域展示优先级；未列出的域排到 99（即最后）。
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

// 域的中文标签，界面上显示在实体名前面的方括号里。
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

// 取实体域：统一走 utils/entities.js 的 entityDomainOf（P10 B 类收敛）。本文件原先那份
// 与 home.js 那份对「domain 带点号」「domain 不是字符串」两种输入的结果不同 —— 两边的
// 消费方都是拿去查标签表或与裸域名比较，所以这类输入下会静默认错域。

/**
 * 判断实体当前是否可用（未被禁用、未被删除）。
 *
 * @param {object} entityValue 实体对象。
 * @returns {boolean} 可用则为 true。
 */
export function relatedEntityIsAvailable(entityValue) {
  return (
    !!entityValue?.entityId &&
    !entityValue.disabledBy &&
    entityValue.status !== "missing" &&
    entityValue.status !== "disabled"
  );
}

// 取同一设备下的兄弟实体；没有 deviceId 时返回空数组（无法确定归属）。
function entitiesForDevice(entityCollection, deviceId) {
  if (deviceId) {
    return [...(entityCollection?.values?.() || [])].filter(
      candidateEntity => candidateEntity.deviceId === deviceId
    );
  } else {
    return [];
  }
}

// 在实体列表中按域找第一个可用实体。
function findEntityByDomain(entities, domain) {
  return (
    entities.find(
      matchedEntity =>
        entityDomainOf(matchedEntity) === domain && relatedEntityIsAvailable(matchedEntity)
    ) || null
  );
}

// 扫地机器人实体：域为 vacuum（上表未列 vacuum，单独判定）。
function findVacuumEntity(siblingEntities) {
  return findEntityByDomain(siblingEntities, "vacuum");
}

// 热水器主实体：域为 water_heater。
function findWaterHeaterEntity(waterHeaterCandidates) {
  return findEntityByDomain(waterHeaterCandidates, "water_heater");
}

/**
 * 由弹窗组件推导出「关联功能」的上下文（设备类型、主实体、兄弟实体等）。
 *
 * @param {object} component 组件文档。
 * @param {Map<string, object>} [entitiesByEntityId] 实体表。
 * @param {Map<string, object>} [devicesByDeviceId] 设备表。
 * @param {Map<string, object>} [statesByEntityId] 状态表。
 * @returns {object|null} 上下文对象；不是弹窗触发组件、缺少绑定实体或无法判定
 *   设备类型时返回 null。
 */
export function relatedPopupContext(
  component,
  entitiesByEntityId = new Map(),
  devicesByDeviceId = new Map(),
  statesByEntityId = new Map()
) {
  // 这些组件类型自带弹窗入口；另外只要挂了「非当前实体 / 非指定实体」的
  // more-info 动作，也算弹窗触发者。
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
  // 没有有效绑定实体就没有推导依据。
  if (!configuredEntityId || !sourceEntity) {
    return null;
  }
  // 兄弟实体限定在同一设备内，避免把别的设备的功能也列进来。
  const popupSiblingEntities = entitiesForDevice(entitiesByEntityId, sourceEntity.deviceId);
  // 小米设备档案给出各角色（climate / fan / light / pm25 等）对应的实体 ID。
  const deviceProfile = resolveXiaomiDeviceProfile(
    configuredEntityId,
    entitiesByEntityId,
    devicesByDeviceId,
    statesByEntityId
  );
  const configuredDeviceType = String(component?.properties?.deviceType || "");
  const configuredDomain = entityDomainOf(sourceEntity);
  const climateEntityId = deviceProfile?.roles?.climate || deviceProfile?.roles?.fan || "";
  // 只有绑定实体本身就是气候主实体时才按浴霸判断，防止附属实体误判。
  const isClimatePrimary = !!climateEntityId && configuredEntityId === climateEntityId;
  const waterHeaterEntity =
    configuredDomain === "water_heater"
      ? sourceEntity
      : findWaterHeaterEntity(popupSiblingEntities);
  const vacuumEntity =
    configuredDomain === "vacuum" ? sourceEntity : findVacuumEntity(popupSiblingEntities);
  let deviceType = "";
  let primaryEntityId = configuredEntityId;
  // 判定顺序即优先级：热水器 > 净化器 > 扫地机 > 浴霸 > 空调；
  // component.type 显式指定优先于设备档案推断。
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
  // 兄弟实体依赖 deviceId；没有设备归属的实体无法组织关联功能。
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
      // 主实体可能未同步到本地实体表，此时退化成源实体。
      primary: entitiesByEntityId.get(primaryEntityId) || sourceEntity,
      profile: deviceProfile,
      siblings: popupSiblingEntities
    };
  }
}

/**
 * 读取组件里显式勾选的关联实体 ID。
 *
 * @param {object} componentConfig 组件文档。
 * @returns {Array<string>|null} 去重后的 ID 列表；未按 selected 模式配置时为 null。
 */
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

/**
 * 计算弹窗可关联的候选实体列表（已过滤、已排序）。
 *
 * @param {object} popupComponent 弹窗组件。
 * @param {Map<string, object>} [entityCatalog] 实体表。
 * @param {Map<string, object>} [deviceCatalog] 设备表。
 * @param {Map<string, object>} [stateCatalog] 状态表。
 * @returns {Array<object>} 候选实体数组。
 */
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
        // 排除主实体自身；域必须在白名单内。
        candidate.entityId !== context.primaryEntityId &&
        allowedDomains.has(entityDomainOf(candidate)) &&
        // 已勾选的实体即使当前不可用也保留，否则用户会「看不到自己选过的东西」。
        (relatedEntityIsAvailable(candidate) || selectedEntityIdSet.has(candidate.entityId))
    )
    .sort((left, right) => {
      // 排序键依次为：不可用项靠后 → 域优先级 → 实体 ID 字典序（保证稳定）。
      const leftUnavailable = relatedEntityIsAvailable(left) ? 0 : 1;
      const rightUnavailable = relatedEntityIsAvailable(right) ? 0 : 1;
      return (
        leftUnavailable - rightUnavailable ||
        (DOMAIN_SORT_ORDER.get(entityDomainOf(left)) ?? 99) -
          (DOMAIN_SORT_ORDER.get(entityDomainOf(right)) ?? 99) ||
        String(left.entityId || "").localeCompare(String(right.entityId || ""))
      );
    });
}

/**
 * 生成旧版弹窗的默认关联实体（兼容未配置过 relatedEntities 的文档）。
 *
 * @param {object} popupComponentInput 弹窗组件。
 * @param {Map<string, object>} [entityLookup] 实体表。
 * @param {Map<string, object>} [deviceLookup] 设备表。
 * @param {Map<string, object>} [stateLookup] 状态表。
 * @returns {Array<string>} 默认关联的实体 ID 列表。
 */
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
    // 热水器旧版默认只带可控项（开关 / 选项 / 数值 / 按钮），不带传感器。
    return candidates
      .filter(
        legacyCandidate =>
          ["switch", "select", "number", "button"].includes(entityDomainOf(legacyCandidate)) &&
          relatedEntityIsAvailable(legacyCandidate)
      )
      .map(pickedCandidate => pickedCandidate.entityId);
  }
  if (relatedContext.deviceType === "air-purifier") {
    // 净化器按档案里的固定角色顺序（滤芯寿命、PM2.5、甲醛等）默认全选。
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
    // 浴霸只默认带灯光（照明开关）。
    const lightEntityId =
      relatedContext.profile?.roles?.light ||
      candidates.find(
        lightCandidate =>
          entityDomainOf(lightCandidate) === "light" && relatedEntityIsAvailable(lightCandidate)
      )?.entityId;
    if (lightEntityId) {
      return [lightEntityId];
    } else {
      return [];
    }
  }
  if (relatedContext.deviceType === "vacuum") {
    // 扫地机只默认带清扫模式（可选 select 或带 cleaning_mode 翻译键的实体）。
    const modeCandidate = candidates.find(
      modeOptionCandidate =>
        entityDomainOf(modeOptionCandidate) === "select" &&
        (/cleaning_mode/i.test(String(modeOptionCandidate.entityId || "")) ||
          modeOptionCandidate.translationKey === "cleaning_mode")
    );
    if (modeCandidate?.entityId) {
      return [modeCandidate.entityId];
    } else {
      return [];
    }
  }
  // 空调等类型没有旧版默认值。
  return [];
}

/**
 * 生成关联实体的展示名：去掉源 / 主实体名称前缀，避免界面重复。
 *
 * @param {object} popupContext 关联上下文（含 source / primary 实体）。
 * @param {object} entityTarget 目标实体。
 * @returns {string} 展示名；清洗后为空时退化为实体 ID 后缀（下划线转空格）。
 */
export function relatedEntityLabel(popupContext, entityTarget) {
  let label = String(entityTarget?.name || entityTarget?.originalName || "")
    .replace(/\s+/g, " ")
    .trim();
  // 收集源 / 主实体的两种名称并去重，按长度降序匹配，先剥掉更长的前缀。
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
    // 循环剥离：名称可能叠加了多个前缀（如「空调 空调 温度」）。
    while (label !== prefix && label.startsWith(prefix + " ")) {
      label = label.slice(prefix.length).trim();
    }
  }
  return (
    label ||
    // 退化成「实体 ID 去掉域前缀」并把下划线换成空格。
    (String(entityTarget?.entityId || "").split(".", 2)[1] || "关联功能").replace(/_/g, " ")
  );
}

/**
 * 判断关联功能是否需要二次确认（危险按钮）。
 *
 * @param {object} confirmationCandidate 候选实体。
 * @returns {boolean} 域为 button 且名称 / ID / 翻译键含危险词时为 true。
 */
export function relatedEntityNeedsConfirmation(confirmationCandidate) {
  if (entityDomainOf(confirmationCandidate) !== "button") {
    return false;
  }
  // 中英文危险词表；中文与英文都要覆盖，因为实体名可能来自 HA 或翻译资源。
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

/**
 * 计算实体可选的下拉选项（select / input_select 类功能用）。
 *
 * @param {object} componentSpec 组件文档。
 * @param {object} entityState 实体状态对象。
 * @returns {Array<string>} 去重后的选项列表，当前状态值会并入其中。
 */
export function relatedEntityOptions(componentSpec, entityState) {
  const attributes = entityState?.attributes || {};
  // 选项可能来自实体属性（多种字段名）或组件自身配置，取第一个数组形态的来源。
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
  // unknown / unavailable 是 HA 的占位状态，不能当成合法选项展示。
  if (stateValue && !["unknown", "unavailable"].includes(stateValue.toLowerCase())) {
    options.push(stateValue);
  }
  return [...new Set(options)];
}

/**
 * 取实体域对应的选择服务。
 *
 * @param {string|object} domainOrEntity 域字符串或实体对象。
 * @returns {{domain: string, service: string}|null} 服务描述；不支持的域返回 null。
 */
export function relatedEntitySelectService(domainOrEntity) {
  const resolvedDomain =
    typeof domainOrEntity == "string" ? domainOrEntity : entityDomainOf(domainOrEntity);
  if (["select", "input_select"].includes(resolvedDomain)) {
    return {
      domain: resolvedDomain,
      service: "select_option"
    };
  } else {
    return null;
  }
}

/**
 * 取当前实际生效的关联实体列表。
 *
 * @param {object} selectionComponent 组件文档。
 * @param {Map<string, object>} [entityMap] 实体表。
 * @param {Map<string, object>} [deviceMap] 设备表。
 * @param {Map<string, object>} [stateMap] 状态表。
 * @returns {Array<object>|null} 生效实体数组；未配置过（null）时返回 null 表示
 *   「请调用方使用默认值」。
 */
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
  // 用候选表做白名单：配置里残留的、已不属于本设备的实体 ID 会被自动丢弃。
  const candidatesById = new Map(
    relatedPopupCandidates(selectionComponent, entityMap, deviceMap, stateMap).map(
      candidateRecord => [candidateRecord.entityId, candidateRecord]
    )
  );
  const selectedCandidates = configuredIds
    .map(selectedEntityId => candidatesById.get(selectedEntityId))
    .filter(Boolean);
  // 超出上限时按配置顺序截断，保证与选择器里显示的顺序一致。
  if (selectionLimit > 0) {
    return selectedCandidates.slice(0, selectionLimit);
  } else {
    return selectedCandidates;
  }
}

/**
 * 构造显式勾选模式的关联实体配置。
 *
 * @param {Array<string>} [entityIds] 关联实体 ID 列表。
 * @returns {{mode: string, entityIds: Array<string>}} 可写入 properties.relatedEntities 的对象。
 */
export function manualRelatedEntityConfig(entityIds = []) {
  return {
    mode: RELATED_ENTITY_MODE_SELECTED,
    entityIds: [
      ...new Set(entityIds.map(rawEntityId => String(rawEntityId || "").trim()).filter(Boolean))
    ]
  };
}
