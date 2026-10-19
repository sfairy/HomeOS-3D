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
    carbon_monoxide: ["有一氧化碳", "无一氧化碳"],
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
/** 实体描述来自 Home Assistant 的实体注册表，字段既有 camelCase 也有 snake_case，且 attributes 是自由字典，所以这里显式声明两个命名变体。 */
type EntityDescriptor = {
  entityId?: unknown;
  entity_id?: unknown;
  deviceClass?: unknown;
  device_class?: unknown;
  attributes?: Record<string, any>;
};
export function deviceStatusChoices(entityDescriptor: EntityDescriptor = {}, stateUpdate: any) {
  const newState = stateUpdate?.newState || stateUpdate,

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
        ? (deviceClassLabels as any)[deviceClass] || ["开启", "关闭"]
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
          label: (stateLabels as any)[optionValue] || optionValue,
        })),
        reminderValue: optionValues[0],
      };
}
export function defaultDeviceStatusRule(entityRule: any, currentState: any, ruleKind: any) {
  const statusChoices = deviceStatusChoices(entityRule, currentState);
  if (!statusChoices) return null;
  const activeValue =
    ruleKind === "health" ? statusChoices.reminderValue : statusChoices.options[0].value;
  return {
    entityId: entityRule.entityId,
    active: [activeValue],
    inactive: [
      statusChoices.options.find((choiceOption) => choiceOption.value !== activeValue)!.value,
    ],
  };
}
export function deviceStatus(device: any, entityStates: Record<string, any> = {}) {
  const statusRules = device?.statusRules,
    healthRules = Array.isArray(statusRules?.health)
      ? statusRules.health
      : statusRules?.health
        ? [statusRules.health]
        : [];
  if (!statusRules?.power?.entityId && !healthRules.some((healthRule: any) => healthRule?.entityId))
    return {
      visible: false,
      available: true,
      on: false,
      status: "none",
    };
  const resolveRuleStatus = (statusRule: any) => {
      if (!statusRule?.entityId) return null;
      const stateEntry =
          entityStates instanceof Map
            ? entityStates.get(statusRule.entityId)
            : (entityStates as any)[statusRule.entityId],
        entityState = stateEntry?.newState || stateEntry,
        stateValue = String(entityState?.state ?? "");
      return !entityState ||
        entityState.available === false ||
        ["", "unknown", "unavailable"].includes(stateValue)
        ? "unknown"
        : toList(statusRule.active).includes(stateValue)
          ? "active"
          : toList(statusRule.inactive).includes(stateValue)
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
export function deviceEntityIds(device: any) {
  const healthRules = Array.isArray(device?.statusRules?.health)
    ? device.statusRules.health
    : [device?.statusRules?.health];
  return [
    ...new Set(
      [
        ...(device?.extraControls || []).map((control: any) => control.entityId),
        device?.statusRules?.power?.entityId,
        ...healthRules.map((healthRule: any) => healthRule?.entityId),
      ].filter(Boolean),
    ),
  ];
}

const toList = (value: any) => (Array.isArray(value) ? value : [value]);

/** 状态指示可选项：优先按实体自身能力，其次按域内置状态表（门锁/扫地机/空调模式等）。 */
export function deviceIndicatorChoices(entityDescriptor: EntityDescriptor = {}, stateUpdate: any) {
  const binaryChoices = deviceStatusChoices(entityDescriptor, stateUpdate);
  if (binaryChoices) return binaryChoices;
  const domain = String(entityDescriptor.entityId || entityDescriptor.entity_id || "").split(".")[0],
    newState = stateUpdate?.newState || stateUpdate,
    attributes = {
      ...entityDescriptor.attributes,
      ...newState?.attributes,
    },
    domainStates: Record<string, string[]> = {
      camera: ["off", "idle", "recording", "streaming"],
      cover: ["open", "closed", "opening", "closing"],
      valve: ["open", "closed", "opening", "closing"],
      vacuum: ["cleaning", "docked", "idle", "paused", "returning", "error"],
      lawn_mower: ["mowing", "docked", "paused", "returning", "error"],
      lock: ["locked", "unlocked", "locking", "unlocking", "open", "opening", "jammed"],
      alarm_control_panel: [
        "disarmed",
        "armed_home",
        "armed_away",
        "armed_night",
        "armed_vacation",
        "armed_custom_bypass",
        "pending",
        "arming",
        "disarming",
        "triggered",
      ],
      media_player: ["off", "on", "idle", "playing", "paused", "buffering", "standby"],
      calendar: ["on", "off"],
      update: ["on", "off"],
    },
    values =
      domain === "climate"
        ? attributes.hvac_modes
        : domain === "water_heater"
          ? attributes.operation_list
          : Array.isArray(attributes.options)
            ? attributes.options
            : domainStates[domain];
  if (!Array.isArray(values) || values.length < 2) return null;
  const labels: Record<string, string> = {
      ...stateLabels,
      idle: "待机",
      recording: "录像中",
      streaming: "播放画面",
      opening: "正在打开",
      closing: "正在关闭",
      cleaning: "清扫中",
      docked: "已停靠",
      paused: "已暂停",
      returning: "返回中",
      mowing: "割草中",
      locked: "已上锁",
      unlocked: "已解锁",
      locking: "上锁中",
      unlocking: "解锁中",
      jammed: "锁已卡住",
      disarmed: "已撤防",
      armed_home: "在家布防",
      armed_away: "离家布防",
      armed_night: "夜间布防",
      armed_vacation: "假期布防",
      armed_custom_bypass: "自定义布防",
      pending: "等待触发",
      arming: "布防中",
      disarming: "撤防中",
      triggered: "已触发警报",
      playing: "播放中",
      buffering: "缓冲中",
      standby: "待机",
      heat: "制热",
      cool: "制冷",
      auto: "自动",
      dry: "除湿",
      fan_only: "送风",
      heat_cool: "制冷/制热",
    },
    options = [...new Set(values)]
      .filter(
        (value) =>
          typeof value === "string" &&
          value.trim() &&
          !["unknown", "unavailable"].includes(value),
      )
      .map((value) => ({ value, label: labels[value] || value }));
  return options.length ? { options } : null;
}

