/** 晾衣架方向：对齐 0.7.2
 * 规范字段：positionReversed / liftReversed / animationReversed
 * 兼容旧 HomeOS：positionInverted / commandInverted
 * animationReversed 仅反转 3D 动画，不参与位置/指令语义
 */
export function normalizeAirerDirection(binding: any = {}) {
  let positionReversed = binding.positionReversed;
  if (positionReversed === undefined && typeof binding.positionInverted === "boolean")
    positionReversed = binding.positionInverted;
  let liftReversed = binding.liftReversed;
  if (liftReversed === undefined && typeof binding.commandInverted === "boolean")
    liftReversed = binding.commandInverted;
  return {
    positionReversed: positionReversed === true,
    liftReversed: liftReversed === true,
    animationReversed: binding.animationReversed === true,
    // 兼容旧调用方属性名
    positionInverted: positionReversed === true,
    commandInverted: liftReversed === true,
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

/** 3D 模型 pose 高度：仅 animationReversed，对齐 0.7.2 airer-motion */
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

/** 规范化为 0.7.2 字段，并去掉会令后端拒存的旧别名 */
export function migrateAirerDirectionFields(binding: any) {
  if (!binding || typeof binding != "object") return binding;
  const normalized = normalizeAirerDirection(binding);
  binding.positionReversed = normalized.positionReversed;
  binding.liftReversed = normalized.liftReversed;
  if (typeof binding.animationReversed === "boolean")
    binding.animationReversed = binding.animationReversed === true;
  delete binding.positionInverted;
  delete binding.commandInverted;
  return binding;
}
