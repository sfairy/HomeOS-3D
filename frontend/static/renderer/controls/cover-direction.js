/**
 * 窗帘「电机方向」唯一实现：registry 与 cover-runtime 不能互相 import，故收成这个无依赖叶模块。
 *
 * 契约（判定口径）：
 *   | property.coverMotorDirection | 结果 |
 *   | --- | --- |
 *   | `"reversed"` / `"normal"` | `true` / `false` |
 *   | 其它任何值 / 缺字段 / 非对象 | `false` |
 * 严格相等判定：宽松写法会把「字段缺失」当成反转，而那是多数控件的状态。
 */

/**
 * 取控件级的电机方向设置：是否反转。
 */
export function coverMotorIsReversedForComponent(directionComponent) {
  return directionComponent?.properties?.coverMotorDirection === "reversed";
}

/**
 * 反转时把展示状态还原成物理状态：open/closed/opening/closing 两两互换，认不出的原样返回。
 * 认不出的必须原样返回：输入可能是任何固件怪值，顺手归一会连带改变 physicalCoverState 的行为。
 */
export function coverPhysicalStateForReversedMotor(stateName) {
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
