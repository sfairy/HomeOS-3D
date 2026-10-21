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
    active: activeValue,
    inactive: statusChoices.options.find((choiceOption) => choiceOption.value !== activeValue)!
      .value,
  };
}

/** 数值比较运算符 → 中文标签。顺序与 0.7.9 的下拉一致，便于逐项比对。 */
export const NUMERIC_OPERATORS = Object.freeze({
  gt: "大于 >",
  gte: "大于等于 ≥",
  lt: "小于 <",
  lte: "小于等于 ≤",
  eq: "等于 =",
  ne: "不等于 ≠",
});

/**
 * 反向比较：`gt↔lte`、`gte↔lt`、`eq↔ne`。
 *
 * 注意 `gt 30` 的反向是 `lte 30` 而不是 `lt 30`：两者合起来才对实数轴做无缝划分，
 * 所以「单阈值对称规则」放行的正是 `gt/lte`、`gte/lt`、`eq/ne` 这三种搭档。
 */
export const INVERSE_OPERATOR: Record<string, string> = Object.freeze({
  gt: "lte",
  gte: "lt",
  lt: "gte",
  lte: "gt",
  eq: "ne",
  ne: "eq",
});

/** 数值直取：数字须有限；字符串须是纯十进制（可带指数），不允许单位或比较符。 */
export function indicatorNumber(value: unknown): number | null {
  if (typeof value == "number") return Number.isFinite(value) ? value : null;
  if (
    typeof value != "string" ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())
  )
    return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 与后端 `validate_device_status_rules` 同口径的前端预检，返回错误文案（合法时为空串）。 */
export function numericIndicatorRuleError(rule: any) {
  for (const condition of [rule?.active, rule?.inactive])
    if (
      !condition ||
      !Object.hasOwn(NUMERIC_OPERATORS, condition.operator) ||
      typeof condition.value != "number" ||
      !Number.isFinite(condition.value)
    )
      return "请填写有效的比较条件和数值。";
  const activeCondition = rule.active,
    inactiveCondition = rule.inactive;
  if (
    inactiveCondition.operator === INVERSE_OPERATOR[activeCondition.operator] &&
    activeCondition.value === inactiveCondition.value
  )
    return "";
  const highCondition = ["gt", "gte"].includes(activeCondition.operator)
      ? activeCondition
      : ["gt", "gte"].includes(inactiveCondition.operator)
        ? inactiveCondition
        : null,
    lowCondition = ["lt", "lte"].includes(activeCondition.operator)
      ? activeCondition
      : ["lt", "lte"].includes(inactiveCondition.operator)
        ? inactiveCondition
        : null;
  return !highCondition ||
    !lowCondition ||
    lowCondition.value > highCondition.value ||
    (lowCondition.value === highCondition.value &&
      highCondition.operator === "gte" &&
      lowCondition.operator === "lte")
    ? "两组条件不能重叠；独立恢复条件需使用方向相反的大小比较，并留出恢复区间。"
    : "";
}

const toList = (value: any) => (Array.isArray(value) ? value : [value]);

const healthRulesOf = (statusRules: any): any[] =>
  Array.isArray(statusRules?.health)
    ? statusRules.health
    : statusRules?.health
      ? [statusRules.health]
      : [];

const compareIndicatorNumber = (value: number, condition: any) => {
  switch (condition.operator) {
    case "gt":
      return value > condition.value;
    case "gte":
      return value >= condition.value;
    case "lt":
      return value < condition.value;
    case "lte":
      return value <= condition.value;
    case "eq":
      return value === condition.value;
    case "ne":
      return value !== condition.value;
    default:
      return false;
  }
};

/**
 * 指示灯读取器：为每台设备维护一份规则快照 + 迟滞记忆。
 *
 * 记忆按设备隔离（不是按实体），键为 `power` / `health:<i>`；规则或机型签名变化时整份重建，
 * 避免「改完阈值仍沿用旧记忆」。设备数组刷新时用 {@link DeviceStatusReader.retain} 剪枝，
 * 实体被删除时用 {@link DeviceStatusReader.forgetEntities} 只清相关记忆。
 */
export type DeviceStatusReader = {
  (device: any, entityStates?: Record<string, any> | Map<string, any>): any;
  retain(devices: any[]): void;
  clear(): void;
  forgetEntities(entityIds: string[]): void;
};

export function createDeviceStatusReader(): DeviceStatusReader {
  const registry = new Map<string, { signature: string; rules: any; memory: Map<string, any> }>(),
    deviceKey = (device: any) =>
      JSON.stringify([
        device?.floorId,
        device?.modelId,
        device?.statusBindingId ?? device?.id,
      ]),
    ruleSignature = (device: any) =>
      JSON.stringify([device?.deviceId, device?.entityId, device?.statusRules]),
    ensureEntry = (device: any) => {
      const key = deviceKey(device),
        signature = ruleSignature(device);
      let entry = registry.get(key);
      if (!entry || entry.signature !== signature) {
        entry = { signature, rules: device?.statusRules, memory: new Map() };
        registry.set(key, entry);
      }
      return entry;
    },
    read = ((device: any, entityStates: any = {}) =>
      deviceStatus(device, entityStates, ensureEntry(device).memory)) as DeviceStatusReader;
  read.retain = (devices) => {
    const signatures = new Map(devices.map((device) => [deviceKey(device), ruleSignature(device)]));
    for (const [key, entry] of registry)
      if (signatures.get(key) !== entry.signature) registry.delete(key);
  };
  read.clear = () => registry.clear();
  read.forgetEntities = (entityIds) => {
    const targets = new Set(entityIds);
    for (const entry of registry.values()) {
      if (targets.has(entry.rules?.power?.entityId)) entry.memory.delete("power");
      healthRulesOf(entry.rules).forEach((rule: any, ruleIndex: number) => {
        if (targets.has(rule?.entityId)) entry.memory.delete("health:" + ruleIndex);
      });
    }
  };
  return read;
}

export function deviceStatus(
  device: any,
  entityStates: Record<string, any> | Map<string, any> = {},
  memory?: Map<string, any>,
) {
  const statusRules = device?.statusRules,
    healthRules = healthRulesOf(statusRules);
  if (!statusRules?.power?.entityId && !healthRules.some((healthRule: any) => healthRule?.entityId))
    return {
      visible: false,
      // 0.7.9 在「没有配置任何指示灯规则」时同样标记为不可用（而不是可用但不可见）。
      available: false,
      on: false,
      status: "none",
    };
  const resolveRuleStatus = (statusRule: any, memoryKey: string) => {
      if (!statusRule?.entityId) return null;
      const stateEntry =
          entityStates instanceof Map
            ? entityStates.get(statusRule.entityId)
            : (entityStates as any)[statusRule.entityId],
        entityState = stateEntry?.newState || stateEntry,
        stateValue = String(entityState?.state ?? "");
      const forgetMemory = () => (memory?.delete(memoryKey), "unknown");
      if (
        !entityState ||
        entityState.available === false ||
        ["", "unknown", "unavailable"].includes(stateValue)
      )
        return forgetMemory();
      if (statusRule.kind === "numeric") {
        const numericValue = indicatorNumber(entityState.state);
        if (numericValue === null || numericIndicatorRuleError(statusRule)) return forgetMemory();
        const ruleStatus = compareIndicatorNumber(numericValue, statusRule.active)
          ? "active"
          : compareIndicatorNumber(numericValue, statusRule.inactive)
            ? "inactive"
            : (memory?.get(memoryKey) ?? "unknown");
        if (ruleStatus !== "unknown") memory?.set(memoryKey, ruleStatus);
        return ruleStatus;
      }
      return toList(statusRule.active).includes(stateValue)
        ? "active"
        : toList(statusRule.inactive).includes(stateValue)
          ? "inactive"
          : "unknown";
    },
    healthRuleStatuses = healthRules.map((healthRule: any, healthIndex: number) =>
      resolveRuleStatus(healthRule, "health:" + healthIndex),
    ),
    powerRuleStatus = resolveRuleStatus(statusRules.power, "power"),
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
  const healthRules = healthRulesOf(device?.statusRules);
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
  // 0.7.9 在这里不额外判空：即便过滤后为空也返回 `{options: []}`。
  return { options };
}

