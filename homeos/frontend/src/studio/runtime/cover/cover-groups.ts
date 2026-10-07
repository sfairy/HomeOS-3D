import { DEFAULT_BUTTON_SIZE, buttonIconSize } from "@app/bridge/button-icon-size";

/** 窗帘实例（后端 entity + 前端 kind 的混合形态，只用到这几个字段）。 */
type CurtainLike = {
  id?: string;
  /** 窗帘形态：dream 表示梦幻帘，不参与分组。 */
  coverKind?: string;
  /** 所属楼层。 */
  floorId?: string;
  /** 对应的 HA 实体 id。 */
  entityId?: string;
};

/** 窗帘分组（一组两台，成对控制）。 */
export type CurtainGroupLike = {
  id?: string;
  /** 成对的两台窗帘 id。 */
  memberIds?: string[];
  /** 分组所属楼层。 */
  floorId?: string;
};

/** 分组逻辑读到的环境快照。 */
type CurtainEnvironmentLike = {
  curtains?: CurtainLike[];
  curtainGroups?: CurtainGroupLike[];
};

export const curtainGroupEntryId = (curtainGroup: CurtainGroupLike) =>
  "curtain-group:" + curtainGroup.id;
export function validCurtainGroups(environment: CurtainEnvironmentLike = {}) {
  const curtainsById = new Map(
      (environment.curtains || []).map((curtain) => [curtain.id, curtain]),
    ),
    usedMemberIdSet = new Set<string>();
  return (environment.curtainGroups || []).filter((candidateGroup) => {
    const groupMemberIds = candidateGroup.memberIds;
    if (
      !candidateGroup.id ||
      !Array.isArray(groupMemberIds) ||
      groupMemberIds.length !== 2 ||
      groupMemberIds[0] === groupMemberIds[1]
    )
      return false;
    const memberCurtains = groupMemberIds.map((candidateMemberId) =>
      curtainsById.get(candidateMemberId),
    );
    return memberCurtains.some(
      (memberCurtain) =>
        !memberCurtain ||
        memberCurtain.floorId !== candidateGroup.floorId ||
        memberCurtain.coverKind === "dream" ||
        usedMemberIdSet.has(memberCurtain.id!),
    ) ||
      (memberCurtains[0]!.entityId && memberCurtains[0]!.entityId === memberCurtains[1]!.entityId!)
      ? false
      : (groupMemberIds.forEach((acceptedMemberId) => usedMemberIdSet.add(acceptedMemberId)), true);
  });
}
export function curtainGroupCandidates(curtainEnvironment: CurtainEnvironmentLike, curtainId: string) {
  const anchorCurtain = curtainEnvironment?.curtains?.find(
      (matchingCurtain) => matchingCurtain.id === curtainId,
    ),
    groupedCurtainIdSet = new Set<string>(
      validCurtainGroups(curtainEnvironment).flatMap(
        (existingGroup) => existingGroup.memberIds,
      ) as string[],
    );
  return !anchorCurtain?.floorId ||
    anchorCurtain.coverKind === "dream" ||
    groupedCurtainIdSet.has(anchorCurtain.id!)
    ? []
    : curtainEnvironment.curtains!.filter(
        (candidateCurtain) =>
          candidateCurtain.id !== anchorCurtain.id &&
          candidateCurtain.floorId === anchorCurtain.floorId &&
          candidateCurtain.coverKind !== "dream" &&
          !groupedCurtainIdSet.has(candidateCurtain.id!) &&
          (!anchorCurtain.entityId || candidateCurtain.entityId !== anchorCurtain.entityId),
      );
}
export function createCurtainGroup(groupEnvironment: any, firstMemberId: any, secondMemberId: any, groupId: any) {
  const primaryCurtain = groupEnvironment.curtains.find(
    (selectedCurtain: any) => selectedCurtain.id === firstMemberId,
  );
  if (
    !curtainGroupCandidates(groupEnvironment, firstMemberId).some(
      (eligibleCurtain) => eligibleCurtain.id === secondMemberId,
    )
  )
    throw new Error("请选择同楼层未组合、实体不同的普通窗帘。");
  const createdGroup = {
    id: groupId,
    label: "双层窗帘",
    floorId: primaryCurtain.floorId,
    memberIds: [firstMemberId, secondMemberId],
    size: primaryCurtain.size ?? DEFAULT_BUTTON_SIZE,
    iconSize: buttonIconSize(primaryCurtain.size ?? DEFAULT_BUTTON_SIZE),
    hitSize: primaryCurtain.hitSize ?? Math.max(DEFAULT_BUTTON_SIZE, primaryCurtain.size ?? DEFAULT_BUTTON_SIZE),
    clickAction: ["panel", "turn-on-focus", "turn-on", "turn-on-panel"].includes(
      primaryCurtain.clickAction,
    )
      ? primaryCurtain.clickAction
      : "focus",
    visible: primaryCurtain.visible !== false,
    hiddenClickable: primaryCurtain.hiddenClickable === true,
    buttonHidden: primaryCurtain.buttonHidden === true,
  };
  for (const propertyName of ["x", "y", "height", "focusCamera"])
    primaryCurtain[propertyName] !== undefined &&
      ((createdGroup as any)[propertyName] = structuredClone(primaryCurtain[propertyName]));
  return createdGroup;
}
