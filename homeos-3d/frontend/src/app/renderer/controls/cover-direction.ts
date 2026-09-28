

/**
 * 取控件级的电机方向设置：是否反转。
 */
export function coverMotorIsReversedForComponent(directionComponent: any) {
  return directionComponent?.properties?.coverMotorDirection === "reversed";
}

/**
 * 反转时把展示状态还原成物理状态：open/closed/opening/closing 两两互换，认不出的原样返回。
 */
export function coverPhysicalStateForReversedMotor(stateName: any) {
  const normalizedStateName = String(stateName ?? "");
  return (
    {
      open: "closed",
      closed: "open",
      opening: "closing",
      closing: "opening"
    }[normalizedStateName] || normalizedStateName
  );
}
