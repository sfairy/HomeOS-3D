/**
 * 电脑（computer）电源与屏幕状态（0.7.8 `computer-state`）。
 *
 * 电脑的主实体由普通开关类实体驱动：`switch` / `input_boolean` 才支持
 * 开关机；其它域只读取状态，不提供控制入口。
 */

export type ComputerState = {
  entityId: string;
  domain: string;
  on: boolean;
  available: boolean;
  supported: boolean;
  service: "turn_on" | "turn_off";
  reason: string;
  command: {
    entityId: string;
    domain: string;
    service: "turn_on" | "turn_off";
    data: Record<string, unknown>;
    deviceKind: "computer";
  };
  name: string;
  status: string;
};

const readEntityState = (states: any, entityId: string) =>
  states instanceof Map ? states.get(entityId) : states?.[entityId];
const OFF_STATES = new Set(["off", "standby", "false", "0"]);

/** 屏幕图资源 → `/api/v1/assets/user/<hash>`；非法 assetId 返回空串。 */
export function computerScreenImage(device: any) {
  const assetId = device?.screenImage?.assetId;
  return typeof assetId == "string" && /^user:[0-9a-f]{32}$/.test(assetId)
    ? "/api/v1/assets/user/" + assetId.slice(5)
    : "";
}

export function computerPower(
  device: any,
  states: any = {},
  requestedOn?: boolean,
): Omit<ComputerState, "name" | "status"> {
  const entityId = device?.powerEntityId || "",
    domain = entityId.split(".")[0],
    rawState = readEntityState(states, entityId),
    entityState = rawState?.newState || rawState || {},
    available =
      !!entityId &&
      entityState.available !== false &&
      typeof entityState.state == "string" &&
      !["unknown", "unavailable", ""].includes(entityState.state),
    on = available && !OFF_STATES.has(String(entityState.state).toLowerCase()),
    targetOn = typeof requestedOn == "boolean" ? requestedOn : !on,
    supported = domain === "switch" || domain === "input_boolean";
  return {
    entityId,
    domain,
    on,
    available,
    supported,
    service: targetOn ? "turn_on" : "turn_off",
    reason: available ? (supported ? "" : "此实体不支持开关机") : "电源状态不可用",
    command: {
      entityId,
      domain,
      service: targetOn ? "turn_on" : "turn_off",
      data: {},
      deviceKind: "computer",
    },
  };
}

export function computerState(device: any, states: any = {}): ComputerState {
  const power = computerPower(device, states);
  return {
    ...power,
    name: device?.label || device?.deviceName || "电脑",
    status: device?.powerEntityId
      ? power.available
        ? power.on
          ? "已开启"
          : "已关闭"
        : "设备不可用"
      : "尚未绑定电源实体",
  };
}
