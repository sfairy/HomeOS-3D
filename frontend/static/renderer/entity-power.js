/**
 * 实体开关状态的统一判定与命令构造。
 *
 * 职责：把「这个控件现在是开还是关」「点一下要发给 Home Assistant 什么服务」
 * 「乐观更新时先把界面改成什么样」这三件事收敛到一处，
 * 覆盖 light / switch / fan / climate / water_heater / media_player / button / script 等域，
 * 避免每个控件 runtime 各写一套。
 *
 * 位置：渲染体系的公共服务模块，被 climate、cover、light、vacuum 等 runtime 以及
 * 控件注册表里的通用开关逻辑复用。
 *
 * 约定：从 climate.js 引入的三个函数用于空调 / 热水器的开关语义，
 * 导入路径上的 `?v=` 版本戳必须与 home.js、renderer.js 保持一致，
 * 否则同一模块会被加载两份，产生互不相认的函数引用。
 */

import {
  climateIsPoweredOn,
  climatePowerCommand,
  resolveClimateDeviceType
} from "./climate.js?v=20260919111150";
// 状态条目归一（变更对象 / 状态对象两种形态）统一走 utils/state-entry.js：
// 本文件原先那份 unwrapStateChange 与另外四处是同一份知识，只是缺失时的兜底不同。
import { resolveStateEntry } from "../utils/state-entry.js?v=20260919111150";
// 「按 ID 取域」只有一份实现（P12 收口 B 类末尾那一项）：本文件原先自带两份
// `String(id || "").split(".", 1)[0]`（`entityPowerIsOn` 与 `entityToggleCommand` 各一处）。
import { entityDomainFromId } from "../utils/entities.js?v=20260919111150";

// 兜底占位状态：本文件的下游要直接读 `.state` 与 `.attributes`（还有 `delete attributes.x`），
// 传 null 会让「状态还没到」变成页面上的 TypeError。三处调用点都只读或 spread 出去，不修改它。
const EMPTY_ENTITY_STATE = { state: "", attributes: {} };
/**
 * 解析控件「开关」语义真正落在哪个实体上。
 *
 * 绝大多数控件就是自己的绑定实体；唯一的例外是浴霸（bath-heater）：
 * 当它没有独立空调控件时，用户看到的开关状态实际由 deviceProfile.roles.light 指定的
 * 照明实体承载，此时必须把命令与状态都改派到那个实体，否则界面与设备会不一致。
 *
 * @param {string} runtimeEntityId 运行时绑定的实体 ID。
 * @param {object} [component] 控件对象，读取 type 以判断是否已有空调控件。
 * @param {object} [deviceProfile] 设备档案，含 deviceType 与 roles。
 * @returns {string} 实际用于开关操作的实体 ID。
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
 * 判断实体当前是否处于「开」状态。
 *
 * 各域口径不同，逐域列举就是这里的全部意义：
 * - climate / water_heater：交给 climate.js 按设备类型判定（可能是 hvac_action 或 preset_mode）；
 * - fan：只要有具体风速值（非 off / unknown / unavailable）就算开；
 * - media_player：playing 与 buffering 都算开，paused 算关；
 * - 其余（light / switch / input_boolean / cover 等）：on / open / true 以及
 *   device_tracker 的 home 都算开。
 *
 * @param {string} entityId 实体 ID，取点号前的域。
 * @param {object} stateInput 状态对象或变更对象。
 * @param {object} [ownerComponent] 所属控件，用于 climate 判断设备类型。
 * @returns {boolean} 是否处于开启状态。
 */
export function entityPowerIsOn(entityId, stateInput, ownerComponent = {}) {
  const stateObject = resolveStateEntry(stateInput, EMPTY_ENTITY_STATE);
  const domain = entityDomainFromId(entityId);
  // 状态统一小写去空格再比较，HA 侧偶发带空格或大小写不一致时不会误判。
  const normalizedState = String(stateObject.state || "")
    .trim()
    .toLowerCase();
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
 * 构造「切换开关」要调用的 HA 服务。
 *
 * 特例说明：
 * - button 域没有开关概念，只能调用 button.press 触发一次；
 * - script 用 script.turn_on 启动；
 * - media_player 用 media_play_pause 做播放 / 暂停切换；
 * - climate / fan / water_heater 不能走通用 toggle，必须交给 climatePowerCommand，
 *   并把「取反」后的目标状态显式传进去（该函数需要知道要开还是要关）；
 * - 其余域统一走 homeassistant.toggle。
 *
 * @param {string} targetEntityId 目标实体 ID（可能已被 entityPowerTarget 改派）。
 * @param {object} stateSource 当前状态对象或变更对象，用于推算取反后的目标状态。
 * @param {object} [toggleComponent] 所属控件，用于 climate 判断设备类型。
 * @returns {{domain: string, service: string, data: object}} 可直接发给后端的服务调用描述。
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
 * 生成乐观更新用的「下一个状态」。
 *
 * 目的：命令发出到 HA 状态回推之间有延迟，先把界面按预期状态画出来，避免按钮看起来没反应。
 *
 * 细节：
 * - media_player 在 playing / buffering 时切到 paused，其余情况切到 playing；
 * - climate 关闭时会把 preset_mode 与 mode 两个属性删掉——否则界面会继续显示
 *   「制热 / 送风」等模式，与已关机的事实矛盾；开机时统一落到 auto 由设备自行决定；
 * - 其余域在 off / on 之间翻转。
 *
 * @param {string} sourceEntityId 目标实体 ID。
 * @param {object} stateValue 当前状态对象或变更对象。
 * @param {object} [sourceComponent] 所属控件，用于 climate 判断设备类型。
 * @returns {object} 推测出的新状态对象（未与后端确认真伪）。
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
