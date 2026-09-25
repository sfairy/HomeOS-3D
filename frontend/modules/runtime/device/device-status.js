/**
 * 通用设备的状态判定与「提醒条件」词表。
 *
 * 通用设备（冰箱 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）没有专属状态模块，它们的顶部状态灯
 * 与弹窗头部完全由配置里的 statusRules 决定：
 *
 *   statusRules.power   —— 开关类实体，{ entityId, active, inactive }，决定「开 / 关」
 *   statusRules.health  —— 提醒条件，单个或数组，命中 active 就让状态灯转成警告色
 *
 * 两件事必须成对:一是 `deviceStatus` 把规则 + 实时状态折算成一枚状态灯（颜色 / 是否可用），
 * 二是 `deviceStatusChoices` 从实体自身推出「这个实体有哪两种状态、中文叫什么」——
 * 编辑器的提醒条件下拉就靠它，否则用户得手写 on / off 这类原始字符串。
 *
 * 词表按 device_class 分：binary_sensor 的 26 个 class 各有各的说法（door 是「打开 / 关闭」，
 * moisture 是「有漏水 / 无漏水」），普通实体则只有一组通用的 on / off / open / closed 词。
 */

// binary_sensor 各 device_class 的 [真, 假] 中文名。顺序即「第一个是异常态」。
const BINARY_SENSOR_LABELS = {
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
  update: ["有更新", "无更新"]
};

// 非传感器实体的状态词：这些是 HA 的通用状态字面量，不随 device_class 变。
const STATE_LABELS = {
  on: "开启",
  off: "关闭",
  open: "打开",
  closed: "关闭",
  online: "在线",
  offline: "离线",
  normal: "正常",
  fault: "故障",
  error: "错误"
};

// 这些域的状态就是 on / off 两种取值，不必再看实体有没有 options 属性。
const SWITCH_LIKE_DOMAINS = [
  "binary_sensor",
  "switch",
  "input_boolean",
  "light",
  "fan",
  "remote",
  "siren",
  "humidifier"
];

// 「默认值就是正常」的三个 device_class：它们的 on 表示一切正常（在线 / 已插电 / 有电），
// 提醒条件必须取 off，否则一配好就常亮警告灯。
const NORMALLY_ON_DEVICE_CLASSES = ["connectivity", "plug", "power"];

const STATUS_COLORS = {
  normal: "#43ce82",
  warning: "#efa33d",
  unknown: "#89929b",
  off: "#89929b"
};

/**
 * 推出某个实体可选的两种状态及其中文名；推不出来（比如湿度这种连续量）返回 null。
 *
 * 三种来源按优先级：on / off 类域 → binary_sensor 的 device_class 词表 → 实体自带的
 * 两值 options。最后一种要求「恰好两个、互不相同、都是非空字符串、且不是 unknown /
 * unavailable」—— 少了任何一条，编辑器就会给用户一个选不出有效状态的下拉。
 */
export function deviceStatusChoices(entity = {}, state) {
  const liveState = state?.newState || state;
  const domain = (entity.entityId || entity.entity_id || "").split(".")[0];
  const attributes = { ...entity.attributes, ...liveState?.attributes };
  const deviceClass = attributes.device_class || entity.deviceClass || entity.device_class;
  if (SWITCH_LIKE_DOMAINS.includes(domain)) {
    const labels =
      domain === "binary_sensor"
        ? BINARY_SENSOR_LABELS[deviceClass] || ["开启", "关闭"]
        : ["开启", "关闭"];
    return {
      options: ["on", "off"].map((value, index) => ({ value, label: labels[index] })),
      reminderValue:
        domain === "binary_sensor" && NORMALLY_ON_DEVICE_CLASSES.includes(deviceClass)
          ? "off"
          : "on"
    };
  }
  const options = attributes.options;
  if (
    !Array.isArray(options) ||
    options.length !== 2 ||
    new Set(options).size !== 2 ||
    options.some(
      option =>
        typeof option !== "string" ||
        !option.trim() ||
        ["unknown", "unavailable"].includes(option)
    )
  ) {
    return null;
  }
  return {
    options: options.map(option => ({ value: option, label: STATE_LABELS[option] || option })),
    // 两值选项（HA 的 select / input_select）没有「哪个算正常」的约定，取第一个——
    // 与用户在下拉里看到的顺序一致，改起来最直观。
    reminderValue: options[0]
  };
}

/**
 * 新建一条状态规则时的缺省值。
 *
 * power 取第一个选项（on / 打开 / 在线…），health 取 reminderValue —— 后者的存在
 * 正是为了让「提醒条件」的缺省值落在真会出事的那一侧。
 */
export function defaultDeviceStatusRule(entity, state, role) {
  const choices = deviceStatusChoices(entity, state);
  if (!choices) {
    return null;
  }
  const active = role === "health" ? choices.reminderValue : choices.options[0].value;
  return {
    entityId: entity.entityId,
    active,
    inactive: choices.options.find(option => option.value !== active).value
  };
}

/**
 * 把 statusRules + 实时状态折算成一枚状态灯。
 *
 * status 四态：
 *   warning —— 任一 health 规则命中 active（有漏水 / 有故障…），优先级最高
 *   unknown —— 任一规则读到 unknown 或 unavailable，或 power 未知
 *   off     —— power 命中 inactive
 *   normal  —— 其余
 *
 * 规则全为空时返回 visible:false —— 没配规则的设备不该在场景里挂一盏永远绿色的灯。
 */
export function deviceStatus(item, states = {}) {
  const statusRules = item?.statusRules;
  const healthRules = Array.isArray(statusRules?.health)
    ? statusRules.health
    : statusRules?.health
      ? [statusRules.health]
      : [];
  if (!statusRules?.power?.entityId && !healthRules.some(rule => rule?.entityId)) {
    return { visible: false, available: true, on: false, status: "none" };
  }
  const readRule = rule => {
    if (!rule?.entityId) {
      return null;
    }
    const entry = states instanceof Map ? states.get(rule.entityId) : states[rule.entityId];
    const liveState = entry?.newState || entry;
    const stateText = String(liveState?.state ?? "");
    return !liveState ||
      liveState.available === false ||
      ["", "unknown", "unavailable"].includes(stateText)
      ? "unknown"
      : stateText === rule.active
        ? "active"
        : stateText === rule.inactive
          ? "inactive"
          : "unknown";
  };
  const healthResults = healthRules.map(readRule);
  const powerResult = readRule(statusRules.power);
  const status = healthResults.includes("active")
    ? "warning"
    : healthResults.includes("unknown") || powerResult === "unknown"
      ? "unknown"
      : powerResult === "inactive"
        ? "off"
        : "normal";
  return {
    visible: true,
    available: status !== "unknown",
    on: status === "normal",
    status,
    color: STATUS_COLORS[status]
  };
}

/**
 * 这台设备牵扯到的全部实体 ID（附加控件 + power + health）。
 *
 * 用来决定「哪些实体要订阅」以及「删除设备时要回收哪些订阅」——漏一个就会让状态
 * 灯停在旧值上。顺序按 Set 去重后保留首次出现，保证订阅顺序稳定。
 */
export function deviceEntityIds(item) {
  const healthRules = Array.isArray(item?.statusRules?.health)
    ? item.statusRules.health
    : [item?.statusRules?.health];
  return [
    ...new Set(
      [
        ...(item?.extraControls || []).map(control => control.entityId),
        item?.statusRules?.power?.entityId,
        ...healthRules.map(rule => rule?.entityId)
      ].filter(Boolean)
    )
  ];
}
