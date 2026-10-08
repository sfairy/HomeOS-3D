/** 晾衣架方向：位置显示与按钮语义可分别反向。
 * HomeOS 字段：positionInverted / commandInverted
 * 官方 0.7.1 字段：positionReversed / liftReversed
 * 旧字段：animationReversed → 仅迁移为位置反向
 */
export function normalizeAirerDirection(binding: any = {}) {
  let positionInverted = binding.positionInverted;
  if (positionInverted === undefined && typeof binding.positionReversed === "boolean")
    positionInverted = binding.positionReversed;
  let commandInverted = binding.commandInverted;
  if (commandInverted === undefined && typeof binding.liftReversed === "boolean")
    commandInverted = binding.liftReversed;
  if (positionInverted === undefined && binding.animationReversed === true) {
    positionInverted = true;
    if (commandInverted === undefined) commandInverted = false;
  }
  return {
    positionInverted: positionInverted === true,
    commandInverted: commandInverted === true,
  };
}
export function airerVisualPosition(rawPosition: any, binding: any = {}) {
  const position = Number(rawPosition);
  if (!Number.isFinite(position)) return null;
  const clamped = Math.max(0, Math.min(100, position));
  const { positionInverted } = normalizeAirerDirection(binding);
  return positionInverted ? 100 - clamped : clamped;
}
export function airerMapControlService(serviceName: any, binding: any = {}) {
  const { commandInverted } = normalizeAirerDirection(binding);
  if (!commandInverted) return serviceName;
  if (serviceName === "open_cover") return "close_cover";
  if (serviceName === "close_cover") return "open_cover";
  return serviceName;
}
/** 滑块展示用视觉高度时，下发 HA 前把目标位置映回设备坐标系。 */
export function airerMapControlPosition(visualPosition: any, binding: any = {}) {
  const position = Number(visualPosition);
  if (!Number.isFinite(position)) return visualPosition;
  const clamped = Math.max(0, Math.min(100, position));
  const { positionInverted } = normalizeAirerDirection(binding);
  return positionInverted ? 100 - clamped : clamped;
}
export function migrateAirerDirectionFields(binding: any) {
  if (!binding || typeof binding != "object") return binding;
  const normalized = normalizeAirerDirection(binding);
  if (binding.positionInverted === undefined && normalized.positionInverted)
    binding.positionInverted = true;
  if (binding.commandInverted === undefined && normalized.commandInverted)
    binding.commandInverted = true;
  // 写出官方字段，便于与 0.7.1 配置互读
  binding.positionReversed = normalized.positionInverted;
  binding.liftReversed = normalized.commandInverted;
  return binding;
}
