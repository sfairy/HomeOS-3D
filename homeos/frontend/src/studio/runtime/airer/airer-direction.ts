/** 晾衣架方向：规范字段 positionReversed / liftReversed / animationReversed。
 * animationReversed 仅反转 3D 动画，不参与位置/指令语义。
 */
export function normalizeAirerDirection(binding: any = {}) {
  return {
    positionReversed: binding.positionReversed === true,
    liftReversed: binding.liftReversed === true,
    animationReversed: binding.animationReversed === true,
  };
}

/** 面板/图标用视觉高度（positionReversed） */
export function airerVisualPosition(rawPosition: any, binding: any = {}) {
  const position = Number(rawPosition);
  if (!Number.isFinite(position)) return null;
  const clamped = Math.max(0, Math.min(100, position));
  const { positionReversed } = normalizeAirerDirection(binding);
  return positionReversed ? 100 - clamped : clamped;
}

/** 3D 模型 pose 高度：仅 animationReversed */
export function airerAnimationPosePosition(rawPosition: any, binding: any = {}) {
  const position = Number(rawPosition);
  if (!Number.isFinite(position)) return null;
  const clamped = Math.max(0, Math.min(100, position));
  return binding?.animationReversed === true ? 100 - clamped : clamped;
}

export function airerMapControlService(serviceName: any, binding: any = {}) {
  const { liftReversed } = normalizeAirerDirection(binding);
  if (!liftReversed) return serviceName;
  if (serviceName === "open_cover") return "close_cover";
  if (serviceName === "close_cover") return "open_cover";
  return serviceName;
}

/** 滑块展示用视觉高度时，下发 HA 前把目标位置映回设备坐标系。 */
export function airerMapControlPosition(visualPosition: any, binding: any = {}) {
  const position = Number(visualPosition);
  if (!Number.isFinite(position)) return visualPosition;
  const clamped = Math.max(0, Math.min(100, position));
  const { positionReversed } = normalizeAirerDirection(binding);
  return positionReversed ? 100 - clamped : clamped;
}
