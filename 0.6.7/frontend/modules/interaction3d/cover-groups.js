export const curtainGroupEntryId = (arg1) => "curtain-group:" + arg1.id;
export function validCurtainGroups(arg2 = {}) {
  const map1 = new Map((arg2.curtains || []).map((arg3) => [arg3.id, arg3])),
    set1 = new Set();
  return (arg2.curtainGroups || []).filter((arg4) => {
    const value1 = arg4.memberIds;
    if (!arg4.id || !Array.isArray(value1) || value1.length !== 2 || value1[0] === value1[1])
      return false;
    const value2 = value1.map((arg5) => map1.get(arg5));
    return value2.some(
      (arg6) =>
        !arg6 || arg6.floorId !== arg4.floorId || arg6.coverKind === "dream" || set1.has(arg6.id),
    ) ||
      (value2[0].entityId && value2[0].entityId === value2[1].entityId)
      ? false
      : (value1.forEach((arg7) => set1.add(arg7)), true);
  });
}
export function curtainGroupCandidates(arg8, arg9) {
  const value3 = arg8?.curtains?.find((arg10) => arg10.id === arg9),
    set2 = new Set(validCurtainGroups(arg8).flatMap((arg11) => arg11.memberIds));
  return !value3?.floorId || value3.coverKind === "dream" || set2.has(value3.id)
    ? []
    : arg8.curtains.filter(
        (arg12) =>
          arg12.id !== value3.id &&
          arg12.floorId === value3.floorId &&
          arg12.coverKind !== "dream" &&
          !set2.has(arg12.id) &&
          (!value3.entityId || arg12.entityId !== value3.entityId),
      );
}
export function createCurtainGroup(arg13, arg14, arg15, arg16) {
  const value4 = arg13.curtains.find((arg17) => arg17.id === arg14);
  if (!curtainGroupCandidates(arg13, arg14).some((arg18) => arg18.id === arg15))
    throw new Error("请选择同楼层未组合、实体不同的普通窗帘。");
  const object1 = {
    id: arg16,
    label: "双层窗帘",
    floorId: value4.floorId,
    memberIds: [arg14, arg15],
    size: value4.size ?? 44,
    iconSize: value4.iconSize ?? 26,
    hitSize: value4.hitSize ?? Math.max(44, value4.size ?? 44),
    clickAction: ["panel", "turn-on-focus", "turn-on", "turn-on-panel"].includes(value4.clickAction)
      ? value4.clickAction
      : "focus",
    visible: value4.visible !== false,
    hiddenClickable: value4.hiddenClickable === true,
    buttonHidden: value4.buttonHidden === true,
  };
  for (const value5 of ["x", "y", "height", "focusCamera"])
    value4[value5] !== undefined && (object1[value5] = structuredClone(value4[value5]));
  return object1;
}
