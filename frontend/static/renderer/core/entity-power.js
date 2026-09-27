
import {
  climateIsPoweredOn,
  climatePowerCommand,
  resolveClimateDeviceType
} from "../controls/climate.js?v=2609271508";
// 状态条目归一与小写状态文本统一走 utils/state-entry.js。
import { resolveStateEntry, stateTextOf } from "../../utils/state-entry.js?v=2609271508";
// 「按 ID 取域」只有一份实现，走 utils/entities.js 的 entityDomainFromId。
import { entityDomainFromId } from "../../utils/entities.js?v=2609271508";

const EMPTY_ENTITY_STATE = { state: "", attributes: {} };
/**
 * 解析控件「开关」语义真正落在哪个实体上。
 */
export function entityPowerTarget(runtimeEntityId, component = {}, deviceProfile = null) {
  if (
    component?.type !== "air-conditioner" &&
    deviceProfile?.deviceType === "bath-heater" &&
    deviceProfile.roles?.light
  ) {
    return String(deviceProfile.roles.light);
  } else {
    return String(runtimeEntityId || "");
  }
}
export function entityPowerIsOn(entityId, stateInput, ownerComponent = {}) {
  const stateObject = resolveStateEntry(stateInput, EMPTY_ENTITY_STATE);
  const domain = entityDomainFromId(entityId);
  // 大小写与空格差异由 stateTextOf 统一处理，HA 侧偶发不规范时不会误判。
  const normalizedState = stateTextOf(stateObject);
  if (domain === "climate") {
    return climateIsPoweredOn(
      stateObject,
      resolveClimateDeviceType(ownerComponent, stateObject, entityId)
    );
  } else if (domain === "fan") {
    return !["", "off", "unknown", "unavailable"].includes(normalizedState);
  } else if (domain === "water_heater") {
    return climateIsPoweredOn(stateObject, "water-heater");
  } else if (domain === "media_player") {
    return ["playing", "buffering"].includes(normalizedState);
  } else {
    return ["on", "open", "true", "home"].includes(normalizedState);
  }
}
export function entityToggleCommand(targetEntityId, stateSource, toggleComponent = {}) {
  const entityState = resolveStateEntry(stateSource, EMPTY_ENTITY_STATE);
  const toggleDomain = entityDomainFromId(targetEntityId);
  if (toggleDomain === "button") {
    return {
      domain: "button",
      service: "press",
      data: {}
    };
  }
  if (toggleDomain === "script") {
    return {
      domain: "script",
      service: "turn_on",
      data: {}
    };
  }
  if (toggleDomain === "media_player") {
    return {
      domain: "media_player",
      service: "media_play_pause",
      data: {}
    };
  }
  if (["climate", "fan", "water_heater"].includes(toggleDomain)) {
    const deviceType =
      toggleDomain === "water_heater"
        ? "water-heater"
        : resolveClimateDeviceType(toggleComponent, entityState, targetEntityId);
    return climatePowerCommand(
      targetEntityId,
      entityState,
      !entityPowerIsOn(targetEntityId, entityState, toggleComponent),
      deviceType
    );
  }
  return {
    domain: "homeassistant",
    service: "toggle",
    data: {}
  };
}
/**
 * 生成乐观更新用的「下一个状态」：命令发出到 HA 回推之间有延迟，先按预期状态画界面。
 */
export function optimisticToggleState(sourceEntityId, stateValue, sourceComponent = {}) {
  const currentState = resolveStateEntry(stateValue, EMPTY_ENTITY_STATE);
  const entityDomainName = entityDomainFromId(sourceEntityId);
  const isPoweredOn = entityPowerIsOn(sourceEntityId, currentState, sourceComponent);
  if (entityDomainName === "media_player") {
    return {
      ...currentState,
      state: entityPowerIsOn(sourceEntityId, currentState, sourceComponent) ? "paused" : "playing"
    };
  }
  if (entityDomainName === "climate") {
    const nextAttributes = {
      ...(currentState.attributes || {})
    };
    if (!isPoweredOn) {
      delete nextAttributes.preset_mode;
      delete nextAttributes.mode;
    }
    return {
      ...currentState,
      state: isPoweredOn ? "off" : "auto",
      attributes: nextAttributes
    };
  }
  return {
    ...currentState,
    state: isPoweredOn ? "off" : "on"
  };
}
