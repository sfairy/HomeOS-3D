/**
 * 实体与控件的活动态判定、状态文案格式化。
 *
 * 所有「从状态对象里取出可比较文本」的动作都走 `utils/state-entry.js` 的 `stateTextOf()`，
 * 不要在本文件里再写一遍 `String(state?.newState?.state ?? state?.state ?? "")`。
 * 各域的活动词表刻意保持各自一份（默认域 on/open/true/home、图层另加 opening/active/playing），
 * 词表不同是知识不同，不合并。
 */
import { entityPowerIsOn } from "../entity-power.js?v=20260921151446";
// 状态条目归一与小写状态文本统一走 utils/state-entry.js，全仓库只有这一份实现。
import { resolveStateEntry, stateTextOf } from "../../../utils/state-entry.js?v=20260921151446";
// 「按 ID 取域」的回退路径走 `entityDomainFromId`；`元数据.domain ||` 那半截刻意保留
// —— 它**不切点号**，换掉会改变「域里带点号」时的取值（那是另一个知识，见 `entityDomainOf` 的说明）。
import { entityDomainFromId } from "../../../utils/entities.js?v=20260921151446";
// 电机方向的两份知识（读控件配置 / 反转时的四态互换）在叶子模块 cover-direction.js：
// 它不 import 任何东西，避免 cover-runtime.js 与本文件反向 import 成环。
import { coverMotorIsReversedForComponent } from "../../controls/cover-direction.js?v=20260921151446";
import { formatNumericValue } from "../../controls/line-chart-runtime.js?v=20260921151446";
import {
  climateEffectMode,
  climateIsPoweredOn,
  climateModeLabel,
  climatePresentationMode,
  normalizeClimateCapabilities,
  resolveClimateDeviceType
} from "../../controls/climate.js?v=20260921151446";
// 同门分片：cover-state
import { coverComponentIsActive } from "./cover-state.js?v=20260921151446";

/**
 * 控件「是否为活动态」的统一入口：cover 域走窗帘逻辑（活动定义与普通开关不同）。
 * 其余域先看 properties.runtimePowerEntityId（浴霸等开关状态由另一实体承载），
 * 该属性缺失或与自身相同时才用控件绑定的实体与状态。
 */
export function isComponentEntityActive(
  powerAwareComponent,
  powerAwareEntityId,
  powerAwareState,
  powerAwareContext = {}
) {
  if (String(powerAwareEntityId || "").startsWith("cover.")) {
    return coverComponentIsActive(
      powerAwareComponent,
      powerAwareEntityId,
      powerAwareState,
      powerAwareContext
    );
  }
  const runtimePowerEntityId = String(
    powerAwareComponent?.properties?.runtimePowerEntityId || powerAwareEntityId
  );
  const runtimePowerState =
    runtimePowerEntityId === powerAwareEntityId
      ? powerAwareState
      : powerAwareContext.states?.get(runtimePowerEntityId);
  return entityPowerIsOn(runtimePowerEntityId, runtimePowerState, powerAwareComponent);
}

/**
 * 取实体状态的图标名：优先用实体自身上报的 icon 属性，否则按域给默认 mdi 图标，
 * 认不出的域用 mdi:devices 兜底。
 */
export function resolveStateIcon(stateIconEntityId, stateIconEntityState) {
  const stateIconName = String(
    resolveStateEntry(stateIconEntityState)?.attributes?.icon || ""
  ).trim();
  if (stateIconName) {
    return stateIconName;
  }
  const entityDomainName = entityDomainFromId(stateIconEntityId);
  return (
    {
      binary_sensor: "mdi:radiobox-marked",
      button: "mdi:gesture-tap-button",
      climate: "mdi:thermostat",
      cover: "mdi:window-shutter",
      fan: "mdi:fan",
      input_boolean: "mdi:toggle-switch",
      light: "mdi:lightbulb-outline",
      lock: "mdi:lock-outline",
      media_player: "mdi:play-circle-outline",
      number: "mdi:numeric",
      remote: "mdi:remote",
      sensor: "mdi:gauge",
      switch: "mdi:toggle-switch-outline",
      water_heater: "mdi:water-boiler"
    }[entityDomainName] || "mdi:devices"
  );
}

/**
 * 把实体状态格式化成展示文案，优先级：数值（纯数字才格式化，精度取 properties.statePrecision）→
 * 窗帘电机反接时的状态互换文案 → HA 翻译（实体状态键与组件状态键两级）→ 内置中英文对照表 →
 * 原始状态值 → 「未知」；最后按需拼单位，状态为「不可用 / 未知」时不拼。
 */
export function formatEntityState(rawState, formattedEntityId = "", formatContext = {}) {
  const resolvedStateEntry = resolveStateEntry(rawState);
  if (!resolvedStateEntry) {
    return "等待实体状态";
  }
  const stateValueText = String(resolvedStateEntry.state ?? "").trim();
  const entityMetadataEntry = formatContext.entityMetadata?.get?.(formattedEntityId) || {};
  const integrationPlatform = String(entityMetadataEntry.platform || "").trim();
  const entityDomainName = String(
    entityMetadataEntry.domain || entityDomainFromId(formattedEntityId) || ""
  ).trim();
  const translationKey = String(entityMetadataEntry.translationKey || "").trim();
  const stateTranslationKey =
    integrationPlatform && entityDomainName && translationKey && stateValueText
      ? "component." +
        integrationPlatform +
        ".entity." +
        entityDomainName +
        "." +
        translationKey +
        ".state." +
        stateValueText
      : "";
  const deviceClass = String(resolvedStateEntry.attributes?.device_class || "").trim();
  const componentTranslationKey =
    entityDomainName && deviceClass && stateValueText
      ? "component." +
        entityDomainName +
        ".entity_component." +
        deviceClass +
        ".state." +
        stateValueText
      : "";
  const translatedStateText = String(
    (stateTranslationKey ? formatContext.entityTranslations?.[stateTranslationKey] : "") ||
      (componentTranslationKey
        ? formatContext.entityTranslations?.[componentTranslationKey]
        : "") ||
      ""
  ).trim();
  const defaultStateLabels =
    {
      on: "开启",
      off: "关闭",
      open: "打开",
      closed: "关闭",
      locked: "已上锁",
      unlocked: "已解锁",
      home: "在家",
      not_home: "离家",
      unavailable: "不可用",
      unknown: "未知",
      idle: "待机",
      sweeping: "扫地中",
      charging: "充电中",
      docked: "已停靠",
      partlycloudy: "晴间多云",
      "power off": "已关闭",
      playing: "播放中",
      paused: "已暂停"
    }[stateValueText.toLowerCase()] ||
    stateValueText ||
    "未知";
  const coverStateOverride =
    String(formattedEntityId || "").startsWith("cover.") &&
    coverMotorIsReversedForComponent(formatContext.component)
      ? {
          open: "关闭",
          closed: "打开",
          opening: "正在关闭",
          closing: "正在打开"
        }[stateValueText.toLowerCase()]
      : "";
  const numericStateValue = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(stateValueText)
    ? Number(stateValueText)
    : Number.NaN;
  // 只有整串都是数字时才当数值格式化，避免把 on / off 或带单位的字符串当数字处理。
  const displayState = Number.isFinite(numericStateValue)
    ? formatNumericValue(numericStateValue, formatContext.component?.properties?.statePrecision)
    : coverStateOverride || translatedStateText || defaultStateLabels;
  const unitOfMeasurement = String(resolvedStateEntry.attributes?.unit_of_measurement || "").trim();
  if (unitOfMeasurement && !["不可用", "未知"].includes(displayState)) {
    return displayState + " " + unitOfMeasurement;
  } else {
    return displayState;
  }
}

/**
 * 灯光类控件的活动态判定。
 *
 * 编辑器里直接采用预览开关；运行时按绑定实体是否处于开启态判断。
 */
export function isLightVisualActive(visualComponent, visualContext) {
  if (visualContext.editable && visualContext.previewState === "on") {
    return true;
  }
  if (visualContext.editable && visualContext.previewState === "off") {
    return false;
  }
  const visualEntityId = visualComponent.bindings?.entity?.entityId || "";
  return (
    !!visualEntityId &&
    !!isComponentEntityActive(
      visualComponent,
      visualEntityId,
      visualContext.states?.get(visualEntityId),
      visualContext
    )
  );
}

/**
 * 设备按钮的活动态判定（逻辑与灯光一致，编辑器走预览、运行时看实体）。
 */
export function isDeviceButtonVisualActive(buttonPreviewComponent, buttonPreviewContext) {
  if (buttonPreviewContext.editable && buttonPreviewContext.previewState === "on") {
    return true;
  }
  if (buttonPreviewContext.editable && buttonPreviewContext.previewState === "off") {
    return false;
  }
  const buttonPreviewEntityId = buttonPreviewComponent.bindings?.entity?.entityId || "";
  return (
    !!buttonPreviewEntityId &&
    !!isComponentEntityActive(
      buttonPreviewComponent,
      buttonPreviewEntityId,
      buttonPreviewContext.states?.get(buttonPreviewEntityId),
      buttonPreviewContext
    )
  );
}

/**
 * 取温控控件用于渲染的模式名：编辑态预览开机给示例模式（浴霸 heat、空调 cool），关机给 off。
 * 运行时走 climate.js 的展示模式推导，统一转小写便于类名拼接。
 */
function resolveClimatePresentationMode(climateComponent, climateContext) {
  const climateEntityId = climateComponent.bindings?.entity?.entityId || "";
  const climateState = resolveStateEntry(climateContext.states?.get(climateEntityId));
  const climateDeviceType = resolveClimateDeviceType(
    climateComponent,
    climateState,
    climateEntityId
  );
  if (climateContext.editable && climateContext.previewState === "on") {
    if (climateDeviceType === "bath-heater") {
      return "heat";
    } else {
      return "cool";
    }
  } else if (climateContext.editable && climateContext.previewState === "off") {
    return "off";
  } else {
    return climatePresentationMode(climateState, climateDeviceType).toLowerCase();
  }
}

/**
 * 温控设备的开关态判定。
 */
export function isClimateDeviceActive(poweredComponent, poweredContext) {
  if (poweredContext.editable && poweredContext.previewState === "on") {
    return true;
  }
  if (poweredContext.editable && poweredContext.previewState === "off") {
    return false;
  }
  const poweredEntityId = poweredComponent.bindings?.entity?.entityId || "";
  const poweredState = resolveStateEntry(poweredContext.states?.get(poweredEntityId));
  return climateIsPoweredOn(
    poweredState,
    resolveClimateDeviceType(poweredComponent, poweredState, poweredEntityId)
  );
}

/**
 * 取温控设备出风特效的模式（编辑态预览开机统一按 cool 展示）。
 */
export function resolveClimateEffectMode(effectModeComponent, effectModeContext) {
  const effectModeEntityId = effectModeComponent.bindings?.entity?.entityId || "";
  const effectModeState = resolveStateEntry(effectModeContext.states?.get(effectModeEntityId));
  const effectModeDeviceType = resolveClimateDeviceType(
    effectModeComponent,
    effectModeState,
    effectModeEntityId
  );
  if (effectModeContext.editable && effectModeContext.previewState === "on") {
    return "cool";
  } else if (effectModeContext.editable && effectModeContext.previewState === "off") {
    return "off";
  } else {
    return climateEffectMode(effectModeState, effectModeDeviceType);
  }
}

/**
 * 取温控控件的模式标签：关机只显示模式名；开机有目标温度则追加，
 * 否则退回当前温度，都没有就只显示模式名。
 */
export function resolveClimateLabel(modeLabelComponent, modeLabelContext) {
  const modeLabelEntityId = modeLabelComponent.bindings?.entity?.entityId || "";
  const modeLabelState = resolveStateEntry(modeLabelContext.states?.get(modeLabelEntityId));
  const climateMode = resolveClimatePresentationMode(modeLabelComponent, modeLabelContext);
  const modeLabelDeviceType = resolveClimateDeviceType(
    modeLabelComponent,
    modeLabelState,
    modeLabelEntityId
  );
  const climateModeText = climateModeLabel(climateMode, modeLabelDeviceType);
  if (!isClimateDeviceActive(modeLabelComponent, modeLabelContext)) {
    return climateModeText;
  }
  const climateCapabilities = normalizeClimateCapabilities(modeLabelState);
  if (climateCapabilities.targetTemperature !== null) {
    return climateModeText + " · " + climateCapabilities.targetTemperature + "°C";
  } else if (climateCapabilities.currentTemperature !== null) {
    return climateModeText + " · " + climateCapabilities.currentTemperature + "°C";
  } else {
    return climateModeText;
  }
}

/**
 * 判断户型图图层是否应点亮。比通用活动态更宽：opening / active / playing 也算，
 * 因为图层绑定的可能是窗帘、媒体播放器这类语义不同的实体。
 */
export function isLayerEntityActive(diagramLayerEntityId, layerContext) {
  if (!diagramLayerEntityId) {
    return false;
  }
  const layerState = layerContext?.states?.get?.(String(diagramLayerEntityId));
  const layerStateText = stateTextOf(layerState);
  return ["on", "true", "1", "open", "opening", "active", "playing"].includes(layerStateText);
}
