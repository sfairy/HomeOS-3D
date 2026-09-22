/**
 * 实体开关状态的统一判定与命令构造：覆盖 light / switch / fan / climate / water_heater /
 * media_player / button / script 等域，避免各控件 runtime 各写一套。
 *
 * 从 climate.js 引入的三个函数用于空调 / 热水器的开关语义，导入路径的 `?v=` 版本戳
 * 必须与 home.js、renderer.js 一致，否则同一模块会被加载两份、产生互不相认的函数引用。
 */

import {
  climateIsPoweredOn,
  climatePowerCommand,
  resolveClimateDeviceType
} from "../controls/climate.js?v=2609221226";
// 状态条目归一与小写状态文本统一走 utils/state-entry.js。
import { resolveStateEntry, stateTextOf } from "../../utils/state-entry.js?v=2609221226";
// 「按 ID 取域」只有一份实现，走 utils/entities.js 的 entityDomainFromId。
import { entityDomainFromId } from "../../utils/entities.js?v=2609221226";

// 兜底占位状态：本文件的下游要直接读 `.state` 与 `.attributes`（还有 `delete attributes.x`），
// 传 null 会让「状态还没到」变成页面上的 TypeError。三处调用点都只读或 spread 出去，不修改它。
const EMPTY_ENTITY_STATE = { state: "", attributes: {} };
/**
 * 解析控件「开关」语义真正落在哪个实体上。
 * 绝大多数控件就是自己的绑定实体，唯一例外是浴霸（bath-heater）：没有独立空调控件时，用户看到的开关状态
 * 实际由 deviceProfile.roles.light 指定的照明实体承载，此时命令与状态都要改派过去，否则界面与设备不一致。
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
/**
 * 判断实体当前是否处于「开」状态：climate / water_heater 交给 climate.js 按设备类型判定，
 * fan 只要有具体风速值即算开，media_player 的 playing / buffering 算开，
 * 其余域（light / switch / input_boolean / cover 等）的 on / open / true / home 算开。
 */
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
/**
 * 构造「切换开关」要调用的 HA 服务：button 用 button.press、script 用 script.turn_on、
 * media_player 用 media_play_pause；climate / fan / water_heater 必须交给 climatePowerCommand 并显式传入取反后的目标状态；
 * 其余域统一走 homeassistant.toggle。
 */
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
 * media_player 在 playing / buffering 时切 paused，其余切 playing；
 * climate 关机时删掉 preset_mode 与 mode（否则界面继续显示制热 / 送风），开机落 auto；其余域在 off / on 之间翻转。
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
      // 关机方向：清掉模式相关属性，避免残影。
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
