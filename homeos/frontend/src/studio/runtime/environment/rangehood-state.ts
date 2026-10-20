/**
 * 油烟机吸风动画状态（0.7.8 `rangehood-state`）。
 *
 * 只有 `animationEntityId` 出现在附加控件里、且域受支持时才认为动画可用，
 * 避免配置了实体但没在面板上暴露导致动画自己转起来。
 */

export const RANGEHOOD_ANIMATION_DOMAINS = Object.freeze([
  "switch",
  "input_boolean",
  "fan",
  "binary_sensor",
]);

export type RangehoodState = {
  entityId: string;
  available: boolean;
  on: boolean;
  running: boolean;
  label: string;
};

export function rangehoodState(device: any = {}, states: any = {}): RangehoodState {
  const entityId = device?.animationEntityId || "",
    hasAnimationControl =
      !!device?.deviceId &&
      RANGEHOOD_ANIMATION_DOMAINS.includes(entityId.split(".")[0]) &&
      !!device?.extraControls?.some?.((control: any) => control.entityId === entityId),
    rawState = states instanceof Map ? states.get(entityId) : states?.[entityId],
    entityState = rawState?.newState || rawState,
    available =
      hasAnimationControl &&
      rawState?.available !== false &&
      entityState?.available !== false &&
      ["on", "off"].includes(entityState?.state),
    isOn = available && entityState.state === "on",
    running = device?.animationEnabled !== false && isOn,
    label =
      device?.animationEnabled === false
        ? "动画已隐藏"
        : entityId
          ? available
            ? running
              ? "吸风中"
              : "已停止"
            : "状态不可用，已停止"
          : "未绑定运行实体";
  return { entityId, available, on: isOn, running, label };
}
