import {
  GAS_ENUM_STATES,
  SMOKE_ENUM_STATES,
  SMOKE_EVENT_TYPE,
  securityAlarmEntityMode,
} from "./security-alarm-profile";

const MDI_SVG = "/static/vendor/mdi/7.4.47/svg/";

export const SECURITY_ALARM_KINDS = ["moisture", "smoke", "gas"] as const;

export const SECURITY_ALARM_TYPES: Record<
  string,
  { label: string; icon: string; alarm: string; normal: string }
> = {
  moisture: {
    label: "水浸",
    icon: "water-alert",
    alarm: "检测到水浸",
    normal: "未检测到水浸",
  },
  smoke: {
    label: "烟雾",
    icon: "smoke-detector-alert",
    alarm: "检测到烟雾",
    normal: "未检测到烟雾",
  },
  gas: {
    label: "天然气",
    icon: "gas-cylinder",
    alarm: "检测到气体",
    normal: "未检测到气体",
  },
};

export const isSecurityAlarmKind = (kind: any) =>
  Object.prototype.hasOwnProperty.call(SECURITY_ALARM_TYPES, kind);

export function securityAlarmKindLabel(kind: any) {
  return SECURITY_ALARM_TYPES[String(kind || "")]?.label || "安防";
}

const readEntityState = (stateSource: any, entityId: any) =>
  stateSource instanceof Map ? stateSource.get(entityId) : stateSource?.[entityId];

function binaryAlarmStatus(entityState: any) {
  if (!entityState) return "unbound";
  const rawState = entityState.state;
  if (entityState.available === false || rawState === "unavailable") return "unavailable";
  if (rawState === "on") return "alarm";
  if (rawState === "off") return "normal";
  return "unknown";
}

function moistureSourceDetail(status: string) {
  if (status === "alarm") return "检测到水浸";
  if (status === "normal") return "干燥";
  if (status === "unavailable") return "设备不可用";
  if (status === "unbound") return "未绑定实体";
  return "状态未知";
}

/** 超过此时长的烟雾事件只作卡片「最近事件」，不再全屏弹窗 / 红卡报警 */
const SMOKE_EVENT_ALERT_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * 0.7.2：烟雾 event 实体的 state 本身是 ISO 时间戳。
 * 解析成功返回 { key, label, ms }；label 用 zh-CN 本地化（如 2026/10/3 09:13:19）。
 * HA event.* 会长期保留「最近一次」时间戳与 event_type，不能把历史记录当成正在报警。
 */

function parseSmokeEventTime(rawState: any) {
  if (typeof rawState !== "string") return null;
  const match =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      rawState,
    );
  if (!match) return null;
  const parsedMs = Date.parse(rawState);
  if (!Number.isFinite(parsedMs)) return null;
  return {
    key:
      new Date(parsedMs).toISOString().slice(0, 19) +
      "." +
      (match[2] || "").padEnd(9, "0") +
      "Z",
    label: new Date(parsedMs).toLocaleString("zh-CN", { hour12: false }),
    ms: parsedMs,
  };
}

function isFreshSmokeEvent(parsed: { ms: number } | null | undefined) {
  if (!parsed || !Number.isFinite(parsed.ms)) return false;
  const ageMs = Date.now() - parsed.ms;
  return ageMs >= 0 && ageMs <= SMOKE_EVENT_ALERT_MAX_AGE_MS;
}

export function securityAlarmReading(alarmConfig: any, stateSource: any = {}) {
  const kind = isSecurityAlarmKind(alarmConfig?.kind) ? alarmConfig.kind : "moisture";
  const typeProfile = SECURITY_ALARM_TYPES[kind] || SECURITY_ALARM_TYPES.moisture;
  const entityEntry = readEntityState(stateSource, alarmConfig?.entityId);
  const entityState = entityEntry?.newState || entityEntry;
  const rawState = entityState?.state;
  // event.* 烟雾源：即便当前 state 未带回 event_types，仍按 smoke-event 解读
  let mode =
    securityAlarmEntityMode(kind, alarmConfig, entityState) ||
    (kind === "smoke" && /^event\.[a-z0-9_]+$/.test(alarmConfig?.entityId || "")
      ? "smoke-event"
      : "");
  let status = "unbound";
  let eventStamp = "";
  let immersionStatus = "";
  let sprayStatus = "";
  let sources: { name: string; detail: string; status: string }[] | null = null;
  let smokeEventParsed: ReturnType<typeof parseSmokeEventTime> = null;

  if (kind === "moisture") {
    // 0.7.2：浸没 = entityId，淋水 = secondaryEntityId（可选）；任一个 on 即报警
    immersionStatus = alarmConfig?.entityId
      ? binaryAlarmStatus(entityState)
      : "unbound";
    const sprayEntry = readEntityState(stateSource, alarmConfig?.secondaryEntityId);
    const sprayState = sprayEntry?.newState || sprayEntry;
    sprayStatus = alarmConfig?.secondaryEntityId
      ? binaryAlarmStatus(sprayState)
      : "";
    const statuses = [immersionStatus, sprayStatus].filter(Boolean);
    if (!statuses.length) status = "unbound";
    else if (statuses.includes("alarm")) status = "alarm";
    else if (statuses.every((item) => item === "normal")) status = "normal";
    else if (statuses.includes("unavailable") && !statuses.includes("alarm"))
      status = statuses.includes("unknown") ? "unknown" : "unavailable";
    else if (statuses.includes("unknown")) status = "unknown";
    else status = immersionStatus !== "unbound" ? immersionStatus : sprayStatus || "unbound";

    sources = [];
    if (alarmConfig?.entityId || immersionStatus) {
      sources.push({
        name: "浸没状态",
        detail: moistureSourceDetail(immersionStatus || "unbound"),
        status: immersionStatus || "unbound",
      });
    }
    if (alarmConfig?.secondaryEntityId) {
      sources.push({
        name: "淋水状态",
        detail: moistureSourceDetail(sprayStatus || "unbound"),
        status: sprayStatus || "unbound",
      });
    }
    if (!sources.length) sources = null;
  } else if (alarmConfig?.entityId) {
    const eventType =
      entityState?.attributes?.event_type || entityState?.attributes?.eventType || null;
    smokeEventParsed =
      mode === "smoke-event" && eventType === SMOKE_EVENT_TYPE
        ? parseSmokeEventTime(rawState)
        : null;
    if (mode === "smoke-event") {
      // event.*：新鲜高浓度烟雾 → event（可弹窗）；过期/空闲 → event-idle。
      // HA 会长期保留上次事件时间戳，必须按年龄区分，否则几天前的事件会反复全屏报警。
      // HA / 小米常把空闲标成 state=unavailable 且不带 availabilityReason=event-idle，
      // 若按普通 unavailable 处理会误显示「设备不可用」（电量仍 100%）。
      if (smokeEventParsed) {
        eventStamp = smokeEventParsed.key;
        status = isFreshSmokeEvent(smokeEventParsed) ? "event" : "event-idle";
      } else {
        status = "event-idle";
      }
    } else if (entityState?.available === false || rawState === "unavailable") {
      status = "unavailable";
    } else if (mode) {
      if (mode === "gas-enum") {
        status = Object.prototype.hasOwnProperty.call(GAS_ENUM_STATES, rawState)
          ? GAS_ENUM_STATES[rawState]
          : "unknown";
      } else if (mode === "smoke-enum") {
        status = Object.prototype.hasOwnProperty.call(SMOKE_ENUM_STATES, rawState)
          ? SMOKE_ENUM_STATES[rawState]
          : "unknown";
      } else if (rawState === "on") status = "alarm";
      else if (rawState === "off") status = "normal";
      else status = "unknown";
    } else status = "unknown";
  }

  const gasEnumLabel =
    (mode === "gas-enum" || mode === "smoke-enum") &&
    Object.prototype.hasOwnProperty.call(
      mode === "smoke-enum" ? SMOKE_ENUM_STATES : GAS_ENUM_STATES,
      rawState,
    ) &&
    status !== "unavailable"
      ? String(rawState)
      : null;

  // 烟雾 event：有 event_type+时间戳时展示「最近事件」（含过期，卡片不标红）；否则「无最新事件」
  let detail: string | null = null;
  let detailLines: string[] | null = null;
  if (kind === "moisture" && sources?.length) {
    detail = sources.map((source) => source.name + "：" + source.detail).join("；");
  } else if (mode === "smoke-event" && smokeEventParsed) {
    detailLines = ["最近事件：" + SMOKE_EVENT_TYPE, smokeEventParsed.label];
    detail = detailLines.join("\n");
  } else if (mode === "smoke-event" && status === "event-idle") {
    detail = "无最新事件";
  } else if (gasEnumLabel) {
    detail = gasEnumLabel;
  }

  const detailMap: Record<string, string> = {
    alarm: typeProfile.alarm,
    event: typeProfile.alarm,
    normal: typeProfile.normal,
    unknown: "状态未知",
    unavailable: "设备不可用",
    unbound: "未绑定实体",
    warming: "预热",
    testing: "自检",
    expired: "传感器寿命到期",
    fault: "设备故障",
    dirty: "烟室积灰",
    "event-idle": "无最新事件",
  };
  const isEventSource =
    kind === "smoke" && /^event\.[a-z0-9_]+$/.test(alarmConfig?.entityId || "");
  return {
    status,
    // 0.7.2：reading.on 仅 binary/enum 报警；烟雾 event 由 overlay 按「新事件」置 on
    on: status === "alarm",
    available: [
      "alarm",
      "event",
      "normal",
      "warming",
      "testing",
      "expired",
      "fault",
      "dirty",
      "event-idle",
    ].includes(status),
    label: alarmConfig?.label || typeProfile.label,
    icon: typeProfile.icon,
    detail: detail || detailMap[status] || detailMap.unknown,
    detailLines,
    kind,
    mode,
    eventStamp,
    immersionStatus,
    sprayStatus,
    sources,
    ...(isEventSource
      ? {
          eventSource: true,
          // 过期事件也带上时间戳，供 overlay 建档；仅新鲜事件带 incidentKey 才会弹窗
          eventTimeKey: smokeEventParsed?.key || eventStamp || null,
          incidentKey:
            status === "event" && (smokeEventParsed?.key || eventStamp)
              ? (alarmConfig?.entityId || "") +
                ":" +
                (smokeEventParsed?.key || eventStamp)
              : null,
          alarmDetail:
            status === "event" && smokeEventParsed
              ? SMOKE_EVENT_TYPE + " · " + smokeEventParsed.label
              : null,
        }
      : {}),
  };
}

/** 工作状态实体 → 卡片右上角徽标（binary / 小米 enum） */
export function securityAlarmWorkState(
  kind: any,
  entityState: any = null,
  entityId = "",
) {
  if (!entityId) {
    return { status: "", label: "", available: false };
  }
  if (!entityState) {
    return { status: "unbound", label: "未绑定", available: false };
  }
  const rawState = entityState.state;
  if (entityState.available === false || rawState === "unavailable") {
    return { status: "unavailable", label: "不可用", available: false };
  }
  const alarmKind = isSecurityAlarmKind(kind) ? kind : "smoke";
  if (/^binary_sensor\./.test(entityId)) {
    if (rawState === "on")
      return { status: "alarm", label: "报警", available: true };
    if (rawState === "off")
      return { status: "normal", label: "正常", available: true };
    return { status: "unknown", label: "未知", available: false };
  }
  const enumMap =
    alarmKind === "gas"
      ? GAS_ENUM_STATES
      : alarmKind === "smoke"
        ? { ...SMOKE_ENUM_STATES, ...GAS_ENUM_STATES }
        : { ...SMOKE_ENUM_STATES, ...GAS_ENUM_STATES };
  if (enumMap && Object.prototype.hasOwnProperty.call(enumMap, rawState)) {
    const status = enumMap[rawState];
    return {
      status,
      label: String(rawState),
      available: ["alarm", "normal", "warming", "testing", "expired", "fault", "dirty"].includes(
        status,
      ),
    };
  }
  // 监测中 / monitoring 等同正常，右上角绿色
  if (
    typeof rawState === "string" &&
    /^(监测中|监测正常|monitoring|normal)$/i.test(rawState.trim())
  ) {
    return { status: "normal", label: String(rawState).trim(), available: true };
  }
  if (typeof rawState === "string" && rawState.trim()) {
    return { status: "unknown", label: String(rawState), available: false };
  }
  return { status: "unknown", label: "未知", available: false };
}

export function securityAlarmEntities(alarms: any[] = []) {
  return [
    ...new Set(
      alarms
        .flatMap((alarm) => [
          alarm?.entityId,
          alarm?.secondaryEntityId,
          alarm?.batteryEntityId,
          alarm?.workStateEntityId,
        ])
        .filter(Boolean),
    ),
  ].map((entityId) => ({ entityId }));
}

export function securityAlarmReadings(alarms: any[] = [], stateSource: any = {}) {
  return alarms.map((alarm) => ({
    ...securityAlarmReading(alarm, stateSource),
    id: alarm.id,
    entityId: alarm.entityId,
    floorId: alarm.floorId,
  }));
}

export function activeSecurityAlarms(alarms: any[] = [], stateSource: any = {}) {
  return securityAlarmReadings(alarms, stateSource).filter((reading) => reading.on);
}

/** 参与全屏/画布报警遮罩的卡片（隐藏卡片不弹遮罩；overlay:false 仅 HomOS 扩展）。 */
export function overlayEligibleAlarms(alarms: any[] = []) {
  return (alarms || []).filter(
    (alarm) => alarm?.visible !== false && alarm?.overlay !== false,
  );
}

export function renderSecurityAlarmCard(
  markerElement: HTMLElement,
  alarmConfig: any,
  stateSource: any = {},
) {
  const documentNode = markerElement.ownerDocument;
  const reading = securityAlarmReading(alarmConfig, stateSource);
  let cardElement = markerElement.querySelector<HTMLElement>(".i3d-alarm-card");
  if (!cardElement) {
    cardElement = documentNode.createElement("span");
    cardElement.className = "i3d-alarm-card";
    const iconElement = documentNode.createElement("i");
    iconElement.className = "i3d-alarm-icon";
    iconElement.setAttribute("aria-hidden", "true");
    const textElement = documentNode.createElement("span");
    textElement.className = "i3d-alarm-card-text";
    const titleElement = documentNode.createElement("strong");
    titleElement.className = "i3d-alarm-card-title";
    const detailElement = documentNode.createElement("span");
    detailElement.className = "i3d-alarm-card-detail";
    const batteryElement = documentNode.createElement("small");
    batteryElement.className = "i3d-alarm-card-battery";
    const workElement = documentNode.createElement("em");
    workElement.className = "i3d-alarm-card-work";
    textElement.append(titleElement, detailElement, batteryElement);
    cardElement.append(iconElement, textElement, workElement);
    markerElement.replaceChildren(cardElement);
  }
  let workElement = cardElement.querySelector<HTMLElement>(".i3d-alarm-card-work");
  if (!workElement) {
    workElement = documentNode.createElement("em");
    workElement.className = "i3d-alarm-card-work";
    cardElement.append(workElement);
  }
  // event 态卡片按 alarm 配色；event-idle / dirty 走对应 data-status 样式
  cardElement.dataset.status = reading.status === "event" ? "alarm" : reading.status;
  cardElement.style.width = (alarmConfig?.size ?? 340) + "px";
  cardElement.style.fontSize = (alarmConfig?.fontSize ?? 21) + "px";
  cardElement.style.setProperty(
    "--label-background-opacity",
    String(alarmConfig?.opacity ?? 1),
  );
  const iconElement = cardElement.querySelector<HTMLElement>(".i3d-alarm-icon")!;
  const maskUrl = "url('" + MDI_SVG + reading.icon + ".svg')";
  iconElement.style.maskImage = maskUrl;
  iconElement.style.webkitMaskImage = maskUrl;
  cardElement.querySelector("strong")!.textContent = reading.label;
  const detailElement = cardElement.querySelector<HTMLElement>(".i3d-alarm-card-detail")!;
  if (reading.sources?.length) {
    detailElement.replaceChildren(
      ...reading.sources.map((source: any) => {
        const sourceElement = documentNode.createElement("span");
        sourceElement.className = "i3d-alarm-source";
        sourceElement.dataset.status = source.status;
        sourceElement.textContent = source.name + "：" + source.detail;
        return sourceElement;
      }),
    );
  } else if (reading.detailLines?.length) {
    const detailLines = reading.detailLines;
    detailElement.replaceChildren(
      ...detailLines.map((line: string, lineIndex: number) => {
        const lineElement = documentNode.createElement("span");
        lineElement.className =
          "i3d-alarm-detail-line" +
          (lineIndex === detailLines.length - 1
            ? " is-event-time"
            : "");
        lineElement.textContent = line;
        return lineElement;
      }),
    );
  } else {
    detailElement.textContent = reading.detail;
  }
  const batteryElement = cardElement.querySelector<HTMLElement>(
    ".i3d-alarm-card-battery",
  )!;
  batteryElement.hidden = !alarmConfig?.batteryEntityId;
  const batteryEntry = readEntityState(stateSource, alarmConfig?.batteryEntityId);
  const batteryState = batteryEntry?.newState || batteryEntry;
  const batteryText =
    batteryState?.available !== false &&
    String(batteryState?.state ?? "").trim() &&
    Number.isFinite(Number(batteryState?.state))
      ? String(batteryState.state) +
        (batteryState?.attributes?.unit_of_measurement || "%")
      : "—";
  batteryElement.textContent = alarmConfig?.batteryEntityId ? "电量 " + batteryText : "";

  const workEntry = readEntityState(stateSource, alarmConfig?.workStateEntityId);
  const workState = securityAlarmWorkState(
    alarmConfig?.kind || reading.kind,
    workEntry?.newState || workEntry,
    alarmConfig?.workStateEntityId || "",
  );
  const showWork = !!alarmConfig?.workStateEntityId;
  workElement.hidden = !showWork;
  cardElement.classList.toggle("has-work-state", showWork);
  if (showWork) {
    workElement.dataset.status = workState.status || "unknown";
    workElement.textContent = workState.label || "—";
    workElement.title = "工作状态：" + (workState.label || "—");
  } else {
    workElement.textContent = "";
    delete workElement.dataset.status;
  }

  markerElement.setAttribute(
    "aria-label",
    reading.label +
      " · " +
      reading.detail +
      (showWork ? " · 工作状态 " + (workState.label || "—") : ""),
  );
  markerElement.style.width = (alarmConfig?.size ?? 340) + "px";
  markerElement.style.height = (cardElement.offsetHeight || 58) + "px";
}

const overlayRegistry = new WeakMap<HTMLElement, any>();

export function createSecurityAlarmOverlay(
  hostElement: HTMLElement,
  { onDismiss }: { onDismiss?: () => void } = {},
) {
  const documentNode = hostElement?.ownerDocument;
  if (!documentNode?.createElement) {
    return { update() {}, dispose() {} };
  }
  let shared = overlayRegistry.get(hostElement);
  if (!shared) {
    const root = documentNode.createElement("div");
    root.className = "i3d-alarm-overlay";
    root.hidden = true;
    root.dataset.scope = hostElement === documentNode.body ? "screen" : "preview";
    const glow = documentNode.createElement("div");
    glow.className = "i3d-alarm-glow";
    glow.setAttribute("aria-hidden", "true");
    const list = documentNode.createElement("div");
    list.className = "i3d-alarm-messages";
    list.setAttribute("role", "alert");
    list.setAttribute("aria-atomic", "true");
    const dismiss = documentNode.createElement("button");
    dismiss.type = "button";
    dismiss.className = "i3d-alarm-dismiss";
    dismiss.textContent = "关闭本次提示";
    dismiss.addEventListener("click", () => {
      const visible = new Set(shared.visibleKeys);
      for (const key of visible) shared.acknowledged.add(key);
      refresh();
      for (const [owner, readings] of shared.owners) {
        if (
          readings.some((reading: any) =>
            visible.has(reading.incidentKey || reading.entityId || reading.id),
          )
        ) {
          shared.dismissHandlers.get(owner)?.();
        }
      }
    });
    root.append(glow, list);
    hostElement.append(root);
    shared = {
      root,
      list,
      dismiss,
      owners: new Map(),
      eventSources: new Map(),
      events: new Map(),
      sceneStyles: new Map(),
      dismissHandlers: new Map(),
      acknowledged: new Set(),
      visibleKeys: [] as string[],
      signature: "",
      timer: null as any,
    };
    overlayRegistry.set(hostElement, shared);
  }
  if (shared.root.parentNode !== hostElement) hostElement.append(shared.root);
  const ownerKey = Symbol("alarm-owner");
  let disposed = false;
  shared.owners.set(ownerKey, []);
  if (onDismiss) shared.dismissHandlers.set(ownerKey, onDismiss);

  // 对齐 0.7.2：incidentKey 优先；烟雾 event 按「新事件」才弹，确认后同一次不重弹
  const readingKey = (reading: any) =>
    reading.incidentKey || reading.entityId || reading.id || "";
  const isAlerting = (reading: any) =>
    reading?.eventSource
      ? reading?.on === true
      : reading?.on === true || reading?.status === "alarm" || !reading?.status;

  function refresh() {
    // 追踪各 event 实体最新时间戳。
    // 历史/过期事件：reading.incidentKey 为空，只建档不弹。
    // 新鲜事件：首见或时间推进时带上 incidentKey，才会全屏报警。
    const latestByEntity = new Map<string, any>();
    for (const reading of [...shared.owners.values()].flat()) {
      if (
        !reading?.eventSource ||
        !["event", "event-idle"].includes(reading.status) ||
        !reading.entityId
      )
        continue;
      const previous = latestByEntity.get(reading.entityId);
      if (
        !previous ||
        (reading.eventTimeKey || "") > (previous.eventTimeKey || "")
      ) {
        latestByEntity.set(reading.entityId, reading);
      }
    }
    // 仅在仍有启用中的 event 源时裁剪已移除的实体；
    // 编辑态 / 未授权时的 update([], false) 会暂时清空 eventSources，不能因此丢掉追踪与已确认。
    const liveEntityIds = new Set(
      [...shared.eventSources.values()].flatMap((ids: Set<string>) => [...ids]),
    );
    if (liveEntityIds.size) {
      for (const [entityId, tracked] of shared.events) {
        if (!liveEntityIds.has(entityId)) {
          if (tracked.incidentKey) shared.acknowledged.delete(tracked.incidentKey);
          shared.events.delete(entityId);
        }
      }
    }
    for (const [entityId, reading] of latestByEntity) {
      const nextTime = reading.eventTimeKey || "";
      const tracked = shared.events.get(entityId);
      if (tracked) {
        if (nextTime > tracked.time) {
          if (tracked.incidentKey) shared.acknowledged.delete(tracked.incidentKey);
          tracked.time = nextTime;
          // 空闲→时间戳：过期事件 incidentKey 为空（只建档）；新鲜事件才会弹
          tracked.incidentKey = reading.incidentKey || null;
        }
      } else {
        // 首见：新鲜事件直接采用 incidentKey（进页时仍在报警窗口内应弹出）
        shared.events.set(entityId, {
          time: nextTime,
          incidentKey: reading.incidentKey || null,
        });
      }
    }

    const allReadings = [...shared.owners].flatMap(([, readings]) =>
      readings.map((reading: any) =>
        reading?.eventSource
          ? {
              ...reading,
              on:
                !!reading.incidentKey &&
                shared.events.get(reading.entityId)?.incidentKey ===
                  reading.incidentKey,
              detail: reading.alarmDetail || reading.detail,
            }
          : reading,
      ),
    );
    for (const reading of allReadings) {
      if (
        reading.status === "normal" &&
        !allReadings.some(
          (other) => readingKey(other) === readingKey(reading) && isAlerting(other),
        )
      ) {
        shared.acknowledged.delete(readingKey(reading));
      }
    }
    const active = [
      ...new Map(
        allReadings
          .filter(
            (reading) =>
              isAlerting(reading) && !shared.acknowledged.has(readingKey(reading)),
          )
          .map((reading) => [readingKey(reading), reading]),
      ).values(),
    ];
    shared.visibleKeys = active.map(readingKey);
    const styleOwner =
      active.length > 0
        ? [...shared.owners].find(([, readings]) => readings.includes(active[0]))?.[0]
        : null;
    shared.root.dataset.sceneStyle =
      shared.sceneStyles.get(styleOwner) || "default";
    const signature = JSON.stringify(
      active.map((reading) => [
        reading.entityId,
        reading.label,
        reading.detail,
        reading.icon,
      ]),
    );
    if (signature === shared.signature) return;
    shared.signature = signature;
    if (active.length) {
      clearTimeout(shared.timer);
      shared.timer = null;
      shared.list.replaceChildren(
        ...active.map((reading) => {
          const message = documentNode.createElement("div");
          message.className = "i3d-alarm-message";
          const icon = documentNode.createElement("i");
          icon.className = "i3d-alarm-icon";
          icon.setAttribute("aria-hidden", "true");
          const maskUrl = "url('" + MDI_SVG + reading.icon + ".svg')";
          icon.style.maskImage = maskUrl;
          icon.style.webkitMaskImage = maskUrl;
          const text = documentNode.createElement("span");
          const title = documentNode.createElement("strong");
          const detail = documentNode.createElement("span");
          title.textContent = reading.label;
          detail.textContent = reading.detail;
          text.append(title, detail);
          message.append(icon, text);
          return message;
        }),
        shared.dismiss,
      );
      shared.root.hidden = false;
      shared.root.classList.add("is-alarming");
    } else {
      shared.root.classList.remove("is-alarming");
      shared.list.replaceChildren();
      clearTimeout(shared.timer);
      shared.timer = setTimeout(() => {
        shared.root.hidden = true;
        shared.timer = null;
      }, 300);
    }
  }

  return {
    update(readings: any[] = [], enabled = true, sceneStyle = "default") {
      if (disposed) return;
      if (shared.root.parentNode !== hostElement) hostElement.append(shared.root);
      shared.sceneStyles.set(
        ownerKey,
        sceneStyle === "warm-wood" ? "warm-wood" : "default",
      );
      shared.eventSources.set(
        ownerKey,
        new Set(
          readings
            .filter((reading: any) => reading?.eventSource)
            .map((reading: any) => reading.entityId)
            .filter(Boolean),
        ),
      );
      shared.owners.set(ownerKey, enabled ? readings : []);
      refresh();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      shared.owners.delete(ownerKey);
      shared.eventSources.delete(ownerKey);
      shared.sceneStyles.delete(ownerKey);
      shared.dismissHandlers.delete(ownerKey);
      if (shared.owners.size) refresh();
      else {
        clearTimeout(shared.timer);
        shared.root.remove();
        overlayRegistry.delete(hostElement);
      }
    },
  };
}

/** 兼容旧调用名 */
export function securityAlarmPresentation(alarmConfig: any, stateSource: any = {}) {
  const reading = securityAlarmReading(alarmConfig, stateSource);
  return {
    ...reading,
    kindLabel: securityAlarmKindLabel(reading.kind),
    alerting: reading.on,
    statusLabel: reading.detail,
    battery: "",
    theme: "default",
    available: reading.available || reading.status === "unbound",
  };
}

export function mergeSecurityAlarmPresentations(presentations: any[] = []) {
  const list = presentations.filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const alerting = list.filter((entry) => entry.alerting || entry.on);
  const primary = alerting[0] || list[0];
  return {
    ...primary,
    merged: true,
    mergeCount: list.length,
    statusLabel: alerting.length
      ? alerting.map((entry) => entry.label + "：" + entry.detail).join(" · ")
      : list.map((entry) => entry.detail).join(" · "),
    alerting: alerting.length > 0,
    on: alerting.length > 0,
  };
}
