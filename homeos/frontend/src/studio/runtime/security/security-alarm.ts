import {
  GAS_ENUM_STATES,
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

export function securityAlarmReading(alarmConfig: any, stateSource: any = {}) {
  const kind = isSecurityAlarmKind(alarmConfig?.kind) ? alarmConfig.kind : "moisture";
  const typeProfile = SECURITY_ALARM_TYPES[kind] || SECURITY_ALARM_TYPES.moisture;
  const entityEntry = readEntityState(stateSource, alarmConfig?.entityId);
  const entityState = entityEntry?.newState || entityEntry;
  const rawState = entityState?.state;
  const mode = securityAlarmEntityMode(kind, alarmConfig, entityState);
  let status = "unbound";
  if (alarmConfig?.entityId) {
    if (entityState?.available === false || rawState === "unavailable") status = "unavailable";
    else if (mode) {
      if (mode === "gas-enum") {
        status = Object.prototype.hasOwnProperty.call(GAS_ENUM_STATES, rawState)
          ? GAS_ENUM_STATES[rawState]
          : "unknown";
      } else if (rawState === "on") status = "alarm";
      else if (rawState === "off") status = "normal";
      else status = "unknown";
    } else status = "unknown";
  }
  const gasEnumLabel =
    mode === "gas-enum" &&
    Object.prototype.hasOwnProperty.call(GAS_ENUM_STATES, rawState) &&
    status !== "unavailable"
      ? String(rawState)
      : null;
  const detailMap: Record<string, string> = {
    alarm: typeProfile.alarm,
    normal: typeProfile.normal,
    unknown: "状态未知",
    unavailable: "设备不可用",
    unbound: "未绑定实体",
    warming: "预热",
    testing: "自检",
    expired: "传感器寿命到期",
    fault: "设备故障",
  };
  return {
    status,
    on: status === "alarm",
    available: ["alarm", "normal", "warming", "testing", "expired", "fault"].includes(status),
    label: alarmConfig?.label || typeProfile.label,
    icon: typeProfile.icon,
    detail: gasEnumLabel || detailMap[status] || detailMap.unknown,
    kind,
  };
}

export function securityAlarmEntities(alarms: any[] = []) {
  return [
    ...new Set(
      alarms
        .flatMap((alarm) => [alarm?.entityId, alarm?.batteryEntityId])
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
    textElement.append(titleElement, detailElement, batteryElement);
    cardElement.append(iconElement, textElement);
    markerElement.replaceChildren(cardElement);
  }
  cardElement.dataset.status = reading.status;
  cardElement.style.width = (alarmConfig?.size ?? 180) + "px";
  cardElement.style.fontSize = (alarmConfig?.fontSize ?? 12) + "px";
  cardElement.style.setProperty(
    "--label-background-opacity",
    String(alarmConfig?.opacity ?? 1),
  );
  const iconElement = cardElement.querySelector<HTMLElement>("i")!;
  const maskUrl = "url('" + MDI_SVG + reading.icon + ".svg')";
  iconElement.style.maskImage = maskUrl;
  iconElement.style.webkitMaskImage = maskUrl;
  cardElement.querySelector("strong")!.textContent = reading.label;
  cardElement.querySelector(".i3d-alarm-card-detail")!.textContent = reading.detail;
  const batteryElement = cardElement.querySelector<HTMLElement>("small")!;
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
  markerElement.setAttribute("aria-label", reading.label + " · " + reading.detail);
  markerElement.style.width = (alarmConfig?.size ?? 180) + "px";
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
          readings.some(
            (reading: any) => visible.has(reading.entityId || reading.id),
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

  const readingKey = (reading: any) => reading.entityId || reading.id;
  // 无 status 的预览条目视为报警（对齐 0.7.1 createSecurityAlarmOverlay）
  const isAlerting = (reading: any) =>
    reading?.on === true || reading?.status === "alarm" || !reading?.status;

  function refresh() {
    const allReadings = [...shared.owners.values()].flat();
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
      shared.owners.set(ownerKey, enabled ? readings : []);
      refresh();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      shared.owners.delete(ownerKey);
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
