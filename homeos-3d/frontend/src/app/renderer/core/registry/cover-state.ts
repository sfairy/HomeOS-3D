
// 状态条目归一与小写状态文本统一走 utils/state-entry.js，全仓库只有这一份实现。
import { resolveStateEntry, stateTextOf } from "../../../utils/state-entry.js";
import {
  COVER_POSITION_EPSILON_PERCENT,
  coverFeaturesOf,
  coverReportsTilt
} from "../../../utils/cover-features.js";
// 电机方向的两份知识（读控件配置 / 反转时的四态互换）在叶子模块 cover-direction.js：
import {
  coverMotorIsReversedForComponent,
  coverPhysicalStateForReversedMotor
} from "../../controls/cover-direction.js";

/**
 * 通用「活动态」判定：on / open / true / home 都算活动。
 */
function isEntityActiveState(entityStateEntry: any) {
  return ["on", "open", "true", "home"].includes(stateTextOf(entityStateEntry));
}

// 窗帘「已在关闭位」容差（%）与能力位、叶片证据的判定共用 utils/cover-features.js 那一份：
export { COVER_POSITION_EPSILON_PERCENT };

/**
 * 判断窗帘控件是否应按梦幻帘渲染。
 */
export function coverComponentIsDream(
  coverDreamComponent: any,
  coverDreamEntityId: any = "",
  coverDreamState: any = null,
  coverDreamMetadataByEntityId: any = new Map<any, any>()
) {
  const coverKind = coverDreamComponent?.properties?.coverKind;
  if (coverKind === "dream") {
    return true;
  }
  if (["standard", "airer"].includes(coverKind)) {
    return false;
  }
  const dreamResolvedState: any = resolveStateEntry(coverDreamState) || {};
  // 能力位与「有没有叶片证据」的口径唯一实现在 utils/cover-features.js：
  const dreamAttributes = dreamResolvedState.attributes || {};
  const dreamFeatures = coverFeaturesOf(dreamAttributes.supported_features);
  const dreamMetadataEntry = coverDreamMetadataByEntityId?.get?.(coverDreamEntityId) || {};
  const dreamSearchText =
    coverDreamEntityId +
    " " +
    (dreamAttributes.friendly_name || "") +
    " " +
    (dreamMetadataEntry.name || "") +
    " " +
    (dreamMetadataEntry.originalName || "");
  return (
    coverReportsTilt(dreamAttributes, dreamFeatures) ||
    /梦幻|竖帘|垂直帘|百叶|(^|[._-])novo([._-]|$)/i.test(dreamSearchText)
  );
}

/**
 * 判断窗帘是否处于「打开」侧（registry 内部实现）。
 */
function isCoverActive(coverComponent: any, coverActiveEntityId: any, coverActiveState: any, coverActiveContext: any) {
  const coverResolvedState: any = resolveStateEntry(coverActiveState) || {};
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
      COVER_POSITION_EPSILON_PERCENT
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
  activeCoverComponent: any,
  activeCoverEntityId: any,
  activeCoverState: any,
  activeCoverContext: any = {}
) {
  return isCoverActive(
    activeCoverComponent,
    activeCoverEntityId,
    activeCoverState,
    activeCoverContext
  );
}
