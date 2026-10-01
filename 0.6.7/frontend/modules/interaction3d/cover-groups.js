export const curtainGroupEntryId = (curtainGroup) => "curtain-group:" + curtainGroup.id;
export function validCurtainGroups(environment = {}) {
  const curtainsById = new Map(
      (environment.curtains || []).map((curtain) => [curtain.id, curtain]),
    ),
    usedMemberIdSet = new Set();
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
        usedMemberIdSet.has(memberCurtain.id),
    ) ||
      (memberCurtains[0].entityId && memberCurtains[0].entityId === memberCurtains[1].entityId)
      ? false
      : (groupMemberIds.forEach((acceptedMemberId) => usedMemberIdSet.add(acceptedMemberId)), true);
  });
}
export function curtainGroupCandidates(curtainEnvironment, curtainId) {
  const anchorCurtain = curtainEnvironment?.curtains?.find(
      (matchingCurtain) => matchingCurtain.id === curtainId,
    ),
    groupedCurtainIdSet = new Set(
      validCurtainGroups(curtainEnvironment).flatMap((existingGroup) => existingGroup.memberIds),
    );
  return !anchorCurtain?.floorId ||
    anchorCurtain.coverKind === "dream" ||
    groupedCurtainIdSet.has(anchorCurtain.id)
    ? []
    : curtainEnvironment.curtains.filter(
        (candidateCurtain) =>
          candidateCurtain.id !== anchorCurtain.id &&
          candidateCurtain.floorId === anchorCurtain.floorId &&
          candidateCurtain.coverKind !== "dream" &&
          !groupedCurtainIdSet.has(candidateCurtain.id) &&
          (!anchorCurtain.entityId || candidateCurtain.entityId !== anchorCurtain.entityId),
      );
}
export function createCurtainGroup(groupEnvironment, firstMemberId, secondMemberId, groupId) {
  const primaryCurtain = groupEnvironment.curtains.find(
    (selectedCurtain) => selectedCurtain.id === firstMemberId,
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
    size: primaryCurtain.size ?? 44,
    iconSize: primaryCurtain.iconSize ?? 26,
    hitSize: primaryCurtain.hitSize ?? Math.max(44, primaryCurtain.size ?? 44),
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
      (createdGroup[propertyName] = structuredClone(primaryCurtain[propertyName]));
  return createdGroup;
}
