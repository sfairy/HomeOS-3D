const deviceClassLabels = {
    door: ["打开", "关闭"],
    garage_door: ["打开", "关闭"],
    window: ["打开", "关闭"],
    opening: ["打开", "关闭"],
    moisture: ["有漏水", "无漏水"],
    problem: ["有故障", "无故障"],
    safety: ["不安全", "安全"],
    smoke: ["有烟雾", "无烟雾"],
    gas: ["有气体", "无气体"],
    tamper: ["被拆动", "未拆动"],
    connectivity: ["在线", "离线"],
    plug: ["已插电", "未插电"],
    power: ["有电", "无电"],
    battery: ["电量低", "电量正常"],
    battery_charging: ["充电", "未充电"],
    lock: ["未锁定", "已锁定"],
    running: ["运行", "停止"],
    moving: ["移动", "静止"],
    occupancy: ["有人", "无人"],
    presence: ["有人", "无人"],
    motion: ["有移动", "无移动"],
    vibration: ["有振动", "无振动"],
    sound: ["有声音", "无声音"],
    light: ["有光", "无光"],
    heat: ["过热", "正常"],
    cold: ["过冷", "正常"],
    update: ["有更新", "无更新"],
  },
  stateLabels = {
    on: "开启",
    off: "关闭",
    open: "打开",
    closed: "关闭",
    online: "在线",
    offline: "离线",
    normal: "正常",
    fault: "故障",
    error: "错误",
  };
/**
 * 实体描述来自 Home Assistant 的实体注册表，字段既有 camelCase 也有 snake_case，
 * 且 attributes 是自由字典，所以这里显式声明两个命名变体。
 */
type EntityDescriptor = {
  entityId?: unknown;
  entity_id?: unknown;
  deviceClass?: unknown;
  device_class?: unknown;
  attributes?: Record<string, any>;
};
export function deviceStatusChoices(entityDescriptor: EntityDescriptor = {}, stateUpdate) {
  const newState = stateUpdate?.newState || stateUpdate,
    // entityId 可能是字符串或数字，统一先转字符串再取 domain 段。
    entityDomain = String(entityDescriptor.entityId || entityDescriptor.entity_id || "").split(
      ".",
    )[0],
    stateAttributes = {
      ...entityDescriptor.attributes,
      ...newState?.attributes,
    },
    deviceClass =
      stateAttributes.device_class || entityDescriptor.deviceClass || entityDescriptor.device_class;
  if (
    [
      "binary_sensor",
      "switch",
      "input_boolean",
      "light",
      "fan",
      "remote",
      "siren",
      "humidifier",
    ].includes(entityDomain)
  ) {
    const choiceLabels =
      entityDomain === "binary_sensor"
        ? deviceClassLabels[deviceClass] || ["开启", "关闭"]
        : ["开启", "关闭"];
    return {
      options: ["on", "off"].map((choiceValue, choiceIndex) => ({
        value: choiceValue,
        label: choiceLabels[choiceIndex],
      })),
      reminderValue:
        entityDomain === "binary_sensor" && ["connectivity", "plug", "power"].includes(deviceClass)
          ? "off"
          : "on",
    };
  }
  const optionValues = stateAttributes.options;
  return !Array.isArray(optionValues) ||
    optionValues.length !== 2 ||
    new Set(optionValues).size !== 2 ||
    optionValues.some(
      (candidateOption) =>
        typeof candidateOption != "string" ||
        !candidateOption.trim() ||
        ["unknown", "unavailable"].includes(candidateOption),
    )
    ? null
    : {
        options: optionValues.map((optionValue) => ({
          value: optionValue,
          label: stateLabels[optionValue] || optionValue,
        })),
        reminderValue: optionValues[0],
      };
}
export function defaultDeviceStatusRule(entityRule, currentState, ruleKind) {
  const statusChoices = deviceStatusChoices(entityRule, currentState);
  if (!statusChoices) return null;
  const activeValue =
    ruleKind === "health" ? statusChoices.reminderValue : statusChoices.options[0].value;
  return {
    entityId: entityRule.entityId,
    active: activeValue,
    inactive: statusChoices.options.find((choiceOption) => choiceOption.value !== activeValue)
      .value,
  };
}
export function deviceStatus(device, entityStates = {}) {
  const statusRules = device?.statusRules,
    healthRules = Array.isArray(statusRules?.health)
      ? statusRules.health
      : statusRules?.health
        ? [statusRules.health]
        : [];
  if (!statusRules?.power?.entityId && !healthRules.some((healthRule) => healthRule?.entityId))
    return {
      visible: false,
      available: true,
      on: false,
      status: "none",
    };
  const resolveRuleStatus = (statusRule) => {
      if (!statusRule?.entityId) return null;
      const stateEntry =
          entityStates instanceof Map
            ? entityStates.get(statusRule.entityId)
            : entityStates[statusRule.entityId],
        entityState = stateEntry?.newState || stateEntry,
        stateValue = String(entityState?.state ?? "");
      return !entityState ||
        entityState.available === false ||
        ["", "unknown", "unavailable"].includes(stateValue)
        ? "unknown"
        : stateValue === statusRule.active
          ? "active"
          : stateValue === statusRule.inactive
            ? "inactive"
            : "unknown";
    },
    healthRuleStatuses = healthRules.map(resolveRuleStatus),
    powerRuleStatus = resolveRuleStatus(statusRules.power),
    overallStatus = healthRuleStatuses.includes("active")
      ? "warning"
      : healthRuleStatuses.includes("unknown") || powerRuleStatus === "unknown"
        ? "unknown"
        : powerRuleStatus === "inactive"
          ? "off"
          : "normal";
  return {
    visible: true,
    available: overallStatus !== "unknown",
    on: overallStatus === "normal",
    status: overallStatus,
    color: {
      normal: "#43ce82",
      warning: "#efa33d",
      unknown: "#89929b",
      off: "#89929b",
    }[overallStatus],
  };
}
export function deviceEntityIds(component) {
  const healthRuleEntries = Array.isArray(component?.statusRules?.health)
    ? component.statusRules.health
    : [component?.statusRules?.health];
  return [
    ...new Set(
      [
        ...(component?.extraControls || []).map((extraControl) => extraControl.entityId),
        component?.statusRules?.power?.entityId,
        ...healthRuleEntries.map((healthRuleEntry) => healthRuleEntry?.entityId),
      ].filter(Boolean),
    ),
  ];
}
