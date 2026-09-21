/**
 * 窗帘域的活动态判定。本文件是叶子：只依赖 `utils/*` 与 `controls/cover-direction.js`，
 * 因此 `controls/cover-runtime.js` 可以反向 import 它拿 `coverComponentIsDream`，不成环。
 *
 * `isEntityActiveState`（通用 on/open/true/home 判定）放在这里而不是 `entity-state.js`：
 * `isCoverActive` 需要它，而 `entity-state.js` 又需要 `coverComponentIsActive`，
 * 把这份判定留在叶子里，两个方向都不成环。
 */
// 状态条目归一与小写状态文本统一走 utils/state-entry.js，全仓库只有这一份实现。
import { resolveStateEntry, stateTextOf } from "../../../utils/state-entry.js?v=20260921142240";
// 电机方向的两份知识（读控件配置 / 反转时的四态互换）在叶子模块 cover-direction.js：
// 它不 import 任何东西，避免 cover-runtime.js 与本文件反向 import 成环。
import {
  coverMotorIsReversedForComponent,
  coverPhysicalStateForReversedMotor
} from "../../controls/cover-direction.js?v=20260921142240";

/**
 * 通用「活动态」判定：on / open / true / home 都算活动。
 */
function isEntityActiveState(entityStateEntry) {
  return ["on", "open", "true", "home"].includes(stateTextOf(entityStateEntry));
}

// 窗帘「已在关闭位」容差（%）：≤1% 视为关闭，避免设备残值（0.x%）让开合状态抖动；本文件与 renderer.js 都消费这份定义，cover-runtime.js 另有等值常量不便合并（互相 import 会成环）。
export const COVER_CLOSED_POSITION_EPSILON = 1;

/**
 * 判断窗帘控件是否应按梦幻帘渲染。
 * 优先级：coverKind 配置 → current_tilt_position 属性 → supported_features 的 240 位 → 名称关键词；
 * 前三者都是设备支持调叶片角度的证据，比名称可靠。
 */
export function coverComponentIsDream(
  coverDreamComponent,
  coverDreamEntityId = "",
  coverDreamState = null,
  coverDreamMetadataByEntityId = new Map()
) {
  const coverKind = coverDreamComponent?.properties?.coverKind;
  if (coverKind === "dream") {
    return true;
  }
  if (["standard", "airer"].includes(coverKind)) {
    return false;
  }
  const dreamResolvedState = resolveStateEntry(coverDreamState) || {};
  const supportedFeatures = Number(dreamResolvedState.attributes?.supported_features || 0);
  const dreamMetadataEntry = coverDreamMetadataByEntityId?.get?.(coverDreamEntityId) || {};
  const dreamSearchText =
    coverDreamEntityId +
    " " +
    (dreamResolvedState.attributes?.friendly_name || "") +
    " " +
    (dreamMetadataEntry.name || "") +
    " " +
    (dreamMetadataEntry.originalName || "");
  return (
    Number.isFinite(Number(dreamResolvedState.attributes?.current_tilt_position)) ||
    !!(supportedFeatures & 240) ||
    /梦幻|竖帘|垂直帘|百叶|(^|[._-])novo([._-]|$)/i.test(dreamSearchText)
  );
}

/**
 * 判断窗帘是否处于「打开」侧（registry 内部实现）。
 * 先按电机方向还原有效状态，opening / closing 直接定论；梦幻帘只看状态名；
 * 有位置属性时用位置（反转取 100 - 位置），否则回落状态名（反转时取反）。
 */
function isCoverActive(coverComponent, coverActiveEntityId, coverActiveState, coverActiveContext) {
  const coverResolvedState = resolveStateEntry(coverActiveState) || {};
  const coverStateText = stateTextOf(coverResolvedState);
  const isCoverReversed = coverMotorIsReversedForComponent(coverComponent);
  const coverEffectiveState = isCoverReversed
    ? coverPhysicalStateForReversedMotor(coverStateText)
    : coverStateText;
  if (coverEffectiveState === "opening") {
    return true;
  }
  if (coverEffectiveState === "closing") {
    return false;
  }
  if (
    coverComponentIsDream(
      coverComponent,
      coverActiveEntityId,
      coverResolvedState,
      coverActiveContext.entityMetadata
    )
  ) {
    return coverEffectiveState === "open";
  }
  const coverCurrentPosition = Number(coverResolvedState.attributes?.current_position);
  if (Number.isFinite(coverCurrentPosition)) {
    return (
      (isCoverReversed ? 100 - coverCurrentPosition : coverCurrentPosition) >
      COVER_CLOSED_POSITION_EPSILON
    );
  } else if (isCoverReversed) {
    return !isEntityActiveState(coverResolvedState);
  } else {
    return isEntityActiveState(coverResolvedState);
  }
}

/**
 * 判断窗帘控件是否处于活动（打开）状态，供控件渲染与图标按钮调用。
 */
export function coverComponentIsActive(
  activeCoverComponent,
  activeCoverEntityId,
  activeCoverState,
  activeCoverContext = {}
) {
  return isCoverActive(
    activeCoverComponent,
    activeCoverEntityId,
    activeCoverState,
    activeCoverContext
  );
}
