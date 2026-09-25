/**
 * 门锁 / 门磁的共用口径：实体归一、安防实体识别、开合折算、门模型展开。
 *
 * 为什么这个文件在 `static/bridge/` 而不是 `modules/runtime/security/`：
 * 运行时的门锁面板与 3D 门动画要用它，**编辑器的安防配置页也要用它** —— 编辑器的
 * 「门模型选择器」靠 doorModels 列出所有门，「实体识别」靠 identifyLockEntities /
 * lockEntityRole 把用户从 HA 拉回来的实体清单归到五个槽位上。两侧必须是同一份实现，
 * 否则编辑器认得出来的实体、运行时认不出来（或反过来），用户会看到「配置里明明绑上了、
 * 舞台上却没反应」。而编辑器是 `/static/` 下的模块，import 不到 runtime 树
 * （runtime 挂在 /api/v1/modules/interaction3d/ 下，URL 比磁盘路径深一层），
 * 所以唯一的正确位置是两侧都能到达的 /static/bridge/。
 *
 * 两侧的到达方式不同，故各有一层薄桥：
 *   - 运行时：modules/runtime/security/lock-state.js 从 core/static-helpers.js 转出口；
 *   - 编辑器：modules/runtime/security/security-editor.js 从 core/static-helpers-editor.js 转出口。
 * 两侧都只是转出口，实现只有这一份。
 *
 * 本文件零依赖（不 import 任何东西），也刻意不持有状态：所有函数都是纯函数，
 * 状态从参数进来、结果从返回值出去，这样两侧调用不会互相干扰。
 *
 * 一扇门牵扯若干实体（锁本体、门磁、电量、低电量、防拆），门磁又可能来自三种口径：
 *   - doorSource === "sensor"       门磁就是一个 binary_sensor（door / opening），直接读 on / off；
 *   - doorSource === "single-event" 一个 event 实体，属性里的某个字段（默认 event_type）
 *     等于配置的开门值 / 关门值来区分开合；
 *   - doorSource === "dual-event"   两个 event 实体分别记「开门」「关门」，谁的时间戳更晚谁说了算。
 * 三种形态最终统一收敛成 doorOpen（true 开 / false 关 / null 未知），动画与文案只看它
 * —— 多出来的 doorSource 分支只在 doorEventState 里出现一次，消费方不需要知道门磁是哪一种。
 *
 * 本模块还把「场景配置里的门」展开成 doorModels —— 每扇门一个带 modelId / 平面坐标的条目，
 * 供 lock-motion 拿去与 3D 场景里的门模型做匹配。
 */

// 一扇门可以绑定的全部实体槽位；identifyLockEntities 严格按这个顺序产出键。
// 顺序即公开展示顺序（安防编辑器、门锁面板读的都是它），不要随意调换。
export const LOCK_ENTITY_FIELDS = [
  "entityId",
  "doorEntityId",
  "batteryEntityId",
  "lowBatteryEntityId",
  "tamperEntityId"
];

/**
 * 状态条目归一：HA 推送有两种形态 —— 直接的状态对象，或带 newState 的变更对象。
 * 统一取到「有新状态就用新的」这一层，后面的判断就只面对状态对象。
 */
const normalizeStateEntry = entry => entry?.newState || entry;

/**
 * 判断一个状态条目是否「可用」。
 *
 * 不可用的口径有三条：条目缺失、实体自报 available === false、或 state 落在空串 /
 * unknown / unavailable 这几个空值里。三者任一命中就不该参与门锁判断，否则一个掉线的
 * 门磁会把「未知」伪装成「关闭」。
 */
const isEntityUsable = entry =>
  entry &&
  entry.available !== false &&
  !["", "unknown", "unavailable"].includes(String(entry.state ?? ""));

/**
 * 把一个状态条目里所有「可能表示事件」的字段拼成一段可搜索的文本。
 *
 * HA 的 event 实体把事件名放在哪一层并不统一：有的用 state，有的用 attributes.event_type /
 * event / action，还有的塞在 event_data 里。这里把它们全部收集、去空、小写，交给下面的
 * 正则一次性匹配，避免为每种设备各写一套判断。
 */
const entityStateSignature = entry => {
  const attributes = entry?.attributes || {};
  const eventData = attributes.event_data || attributes.eventData || {};
  return [
    entry?.state,
    attributes.event_type,
    attributes.event,
    attributes.action,
    eventData.event_type,
    eventData.event,
    eventData.action
  ]
    .filter(value => value != null)
    .join(" ")
    .trim()
    .toLowerCase();
};

/**
 * 从单个实体状态推断门磁开合：true 打开 / false 关闭 / null 未知。
 *
 * 用带边界的中英文词表匹配（open / 开门 / 打开…），必须在词与词的分隔处才算命中，
 * 否则 "unopened" 这类词也会被误判成「打开」。实体不可用时一律返回 null。
 */
export function doorOpenState(entry) {
  if (!isEntityUsable(entry)) {
    return null;
  }
  const signature = entityStateSignature(entry);
  return /(^|[\s_.-])(open|opened|opening|door_open|opened_door|开门|打开|开启)(?=$|[\s_.-])/.test(
    signature
  )
    ? true
    : /(^|[\s_.-])(close|closed|closing|door_close|closed_door|关门|关闭)(?=$|[\s_.-])/.test(
        signature
      )
      ? false
      : null;
}

/**
 * 判断某个实体是否适合填某个门锁槽位（实体识别）。
 *
 * 先排除被禁用 / 已缺失的条目，再按「域 + device_class」判定：锁本体必须落在 lock 域；
 * 门磁是 binary_sensor 的 door / opening；电量分传感器（sensor.battery）与
 * 低电量开关（binary_sensor.battery）两种；防拆是 binary_sensor.tamper。
 */
export function lockEntityRole(entity, field) {
  if (
    entity.disabledBy != null ||
    entity.disabled_by != null ||
    entity.enabled === false ||
    ["missing", "disabled"].includes(entity.status)
  ) {
    return false;
  }
  const entityId = entity.entityId || entity.entity_id || "";
  const domain = entityId.split(".")[0];
  const deviceClass =
    entity.deviceClass || entity.device_class || entity.attributes?.device_class;
  return field === "entityId"
    ? domain === "lock"
    : field === "doorEntityId"
      ? domain === "binary_sensor" && ["door", "opening"].includes(deviceClass)
      : field === "batteryEntityId"
        ? domain === "sensor" && deviceClass === "battery"
        : field === "lowBatteryEntityId"
          ? domain === "binary_sensor" && deviceClass === "battery"
          : field === "tamperEntityId"
            ? domain === "binary_sensor" && deviceClass === "tamper"
            : false;
}

/**
 * 从一份实体清单里，按槽位唯一地挑出各角色的实体 ID。
 *
 * 每个槽位只在「恰好命中一个」时才回填它的 entityId：命中零个说明没配，命中多个说明配置
 * 有歧义 —— 两种都宁可留空，让上层显示「未绑定」，也好过随便选一个造成错绑。
 */
export function identifyLockEntities(entities) {
  return Object.fromEntries(
    LOCK_ENTITY_FIELDS.map(field => {
      const matched = entities.filter(entity => lockEntityRole(entity, field));
      return [
        field,
        matched.length === 1 ? matched[0].entityId || matched[0].entity_id : ""
      ];
    })
  );
}

/**
 * 事件型门磁的开合折算（single-event / dual-event 共用）。
 *
 * readState(entityId) 由调用方注入：lockState 支持 states 传 Map 或普通对象，把「怎么取
 * 一条状态」收敛在调用方，这里只关心事件语义。
 *
 * dual-event：两个事件实体各带一个时间戳（state 就是 ISO 时间），谁更晚谁说了算；只要有一
 * 条读不出时间或不可用就返回 null（宁可知不道，也不猜）。
 * single-event：读事件的属性值，与配置的开门值 / 关门值比对，两个配置值缺失或相等时视为无效。
 */
export function doorEventState(item, readState) {
  const eventTimestamp = entityId => {
    const entry = readState(entityId);
    if (!entityId?.startsWith("event.") || !isEntityUsable(entry)) {
      return null;
    }
    const timestamp = /^\d{4}-\d{2}-\d{2}T/.test(String(entry.state))
      ? Date.parse(entry.state)
      : NaN;
    return Number.isFinite(timestamp) ? timestamp : null;
  };
  if (item.doorSource === "dual-event") {
    if (
      !item.doorOpenEntityId ||
      !item.doorCloseEntityId ||
      item.doorOpenEntityId === item.doorCloseEntityId
    ) {
      return null;
    }
    const openTime = eventTimestamp(item.doorOpenEntityId);
    const closeTime = eventTimestamp(item.doorCloseEntityId);
    // 时间完全相同说明两条事件指向同一次触发，无法判断先后；任一实体不可用同理。
    return (
      openTime === closeTime ||
      [readState(item.doorOpenEntityId), readState(item.doorCloseEntityId)].some(
        entry => !entry || entry.available === false || entry.state === "unavailable"
      )
        ? null
        : openTime === null
          ? false
          : closeTime === null
            ? true
            : openTime > closeTime
    );
  }
  if (eventTimestamp(item.doorEventEntityId) === null) {
    return null;
  }
  const entry = readState(item.doorEventEntityId);
  const eventValue = String(
    entry.attributes?.[item.doorEventAttribute || "event_type"] ?? ""
  ).trim();
  const openValue = (item.doorOpenValue || "").trim();
  const closeValue = (item.doorCloseValue || "").trim();
  return !openValue || !closeValue || openValue === closeValue
    ? null
    : eventValue === openValue
      ? true
      : eventValue === closeValue
        ? false
        : null;
}

// 锁本体 state → 中文文案；同时充当「哪些 state 认识」的白名单。
const LOCK_STATE_LABELS = {
  locked: "已上锁",
  unlocked: "已解锁",
  locking: "正在上锁",
  unlocking: "正在解锁",
  open: "锁舌已释放",
  opening: "正在释放锁舌",
  jammed: "门锁卡住",
  unavailable: "门锁状态不可用"
};

// 门磁状态文本的可读白名单：true 侧与 false 侧分开写，两边都不命中才算「未知」。
const DOOR_OPEN_STATES = ["on", "open", "opened", "打开", "已打开", "开启"];
const DOOR_CLOSED_STATES = ["off", "closed", "close", "关闭", "已关闭"];

/**
 * 把一条安防「锁」配置折算成完整状态。
 *
 * states 允许传 Map 或普通对象（运行时有两条数据通路），内部只经 readState 取用，保证
 * 「哪种形态的状态条目」这件事只判断一次。
 *
 * 返回值是门锁面板与门外动画的共享契约：doorOpen 是门磁开合（null 表示未知，动画据此保持
 * 原姿态），canOpen 由 supported_features 的最低位决定「是否支持释放锁舌」，busy 覆盖
 * locking / unlocking / opening 三种进行态，低电量与防拆则只取 binary_sensor 的 on。
 */
export function lockState(item, states = {}) {
  const readState = entityId =>
    normalizeStateEntry(states instanceof Map ? states.get(entityId) : states[entityId]);
  const lockEntry = readState(item.entityId);
  const doorEntry = readState(item.doorEntityId);
  const batteryEntry = readState(item.batteryEntityId);
  // 事件型门磁没有独立的门磁实体，开合只能从事件里推断。
  const isEventSource = ["single-event", "dual-event"].includes(item.doorSource);
  const eventState = isEventSource ? doorEventState(item, readState) : null;
  // 只要有任何一个绑定的实体还在线上，这扇门整体就算「可用」。
  const available = !!(
    isEntityUsable(lockEntry) ||
    (isEventSource ? eventState !== null : isEntityUsable(doorEntry)) ||
    isEntityUsable(batteryEntry)
  );
  const state = isEntityUsable(lockEntry) ? lockEntry.state : "unavailable";
  const doorStateText = isEntityUsable(doorEntry)
    ? String(doorEntry.state).trim().toLowerCase()
    : "";
  const doorOpen = isEventSource
    ? eventState
    : DOOR_OPEN_STATES.includes(doorStateText)
      ? true
      : DOOR_CLOSED_STATES.includes(doorStateText)
        ? false
        : null;
  const isOn = entityId => {
    const entry = readState(entityId);
    return isEntityUsable(entry) && entry.state === "on";
  };
  // 文案优先级：锁本体在 → 锁状态文案；否则看门磁；再否则只剩电量这一条线索。
  const label = lockEntry
    ? LOCK_STATE_LABELS[state] || "门锁状态未知"
    : doorOpen === true
      ? "门已打开"
      : doorOpen === false
        ? "门已关闭"
        : item.doorEntityId
          ? "门状态未知"
          : "仅电量";
  return {
    state,
    available,
    label,
    doorOpen,
    doorLabel: item.doorEntityId
      ? doorOpen === null
        ? "门状态未知"
        : doorOpen
          ? "门已打开"
          : "门已关闭"
      : "未绑定门磁",
    busy: ["locking", "unlocking", "opening"].includes(state),
    // supported_features 最低位 = HA 的「支持开锁（释放锁舌）」，见 LockEntityFeature.OPEN。
    canOpen:
      !!isEntityUsable(lockEntry) &&
      ((Number(lockEntry?.attributes?.supported_features) || 0) & 1) !== 0,
    codeRequired: !!lockEntry?.attributes?.code_format,
    battery: isEntityUsable(batteryEntry)
      ? "" + batteryEntry.state + (batteryEntry.attributes?.unit_of_measurement || "%")
      : "—",
    lowBattery: isOn(item.lowBatteryEntityId),
    tamper: isOn(item.tamperEntityId)
  };
}

/**
 * 门型 → 中文名。既是 doorModels 生成默认名称 / 门牌文案的词表，也是「合法 doorType」的白名单：
 * 配置里写了表外的值一律回落到 solid（木门），避免出现没有名字的门。
 *
 * 各门型的差异（决定 lock-motion 用哪套 rig 动画）：
 *   - entry          入户门，最重的平开门，常带 entryDoorPivot / 独立门扇枢轴；
 *   - solid          普通木门，标准平开门，绕铰链旋转；
 *   - double         双开门，两扇对开，每扇各自绕自己的铰链；
 *   - glass          玻璃门，多为平开，rig 与木门相同只是材质不同；
 *   - sliding-glass  推拉门，沿导轨平移（doorSlidePivot），不平开；
 *   - roller-shutter 卷帘门，沿竖直方向收放（doorRollerPivot），位移同时压扁门片；
 *   - frame-only     只有门框、没有可动门扇，等价于 static，不参与动画。
 */
const DOOR_TYPE_LABELS = {
  entry: "入户门",
  solid: "木门",
  double: "双开门",
  glass: "玻璃门",
  "sliding-glass": "推拉门",
  "roller-shutter": "卷帘门",
  "frame-only": "门框"
};

/**
 * 把场景配置里的门展开成「与 3D 模型一一对应」的门模型清单。
 *
 * 两种门来源：直接带 modelId 的（工作室导出的门模型）原样透传；只给了 wallId 的（画在墙上的
 * 户型门）按 t（0–1）在墙段上插值出平面坐标，并补一个 "door:<id>" 的合成 modelId —— 与
 * 场景构建侧给门的命名保持同一口径，lock-motion 才能用 modelId + floorId 匹配到网格。
 *
 * 名称 / 门牌文案都缺省时按「门型中文名 + 序号」补齐（序号从 1 起），保证面板有可读标题。
 */
export function doorModels(config) {
  return (
    config?.scene?.doors?.length ? config.scene.doors : config?.doors || []
  ).flatMap((door, index) => {
    const modelId =
      door?.modelId ||
      (String(door?.id || "").startsWith("door:") ? door.id : "");
    if (modelId && !door?.wallId) {
      const doorType = DOOR_TYPE_LABELS[door.doorType] ? door.doorType : "solid";
      return [
        {
          ...door,
          modelId,
          name: door.name || DOOR_TYPE_LABELS[doorType] + " " + (index + 1),
          doorType,
          doorLabel: door.doorLabel || DOOR_TYPE_LABELS[doorType]
        }
      ];
    }
    const wall = (config.scene?.walls || []).find(wallEntry => wallEntry.id === door.wallId);
    if (!wall) {
      return [];
    }
    const t = Math.max(0, Math.min(1, Number(door.t) || 0));
    const doorType = DOOR_TYPE_LABELS[door.doorType] ? door.doorType : "solid";
    return [
      {
        ...door,
        modelId: "door:" + door.id,
        name: door.name || DOOR_TYPE_LABELS[doorType] + " " + (index + 1),
        doorLabel: DOOR_TYPE_LABELS[doorType],
        x: wall.start.x + (wall.end.x - wall.start.x) * t,
        y: wall.start.y + (wall.end.y - wall.start.y) * t
      }
    ];
  });
}

// 入户门模型与全部门模型同源：早期版本只渲染入户门，别名保留下来给旧调用点使用。
export const entryDoorModels = doorModels;
