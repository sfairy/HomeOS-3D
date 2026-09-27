/**
 * 窗帘组合（一拖多）的配置归一：把配置里的 curtainGroups 收敛成「真正可用」的组合集合，
 */

type CurtainItem = {
  id: string;
  floorId?: string;
  coverKind?: string;
  entityId?: string;
  size?: number;
  iconSize?: number;
  hitSize?: number;
  clickAction?: string;
  visible?: boolean;
  hiddenClickable?: boolean;
  buttonHidden?: boolean;
  x?: unknown;
  y?: unknown;
  height?: unknown;
  focusCamera?: unknown;
  [key: string]: unknown;
};

type CurtainGroup = {
  id: string;
  label?: string;
  floorId?: string;
  memberIds?: string[];
  size?: number;
  iconSize?: number;
  hitSize?: number;
  clickAction?: string;
  panelLayout?: string;
  visible?: boolean;
  hiddenClickable?: boolean;
  buttonHidden?: boolean;
  [key: string]: unknown;
};

type CoverConfig = {
  curtains?: CurtainItem[];
  curtainGroups?: CurtainGroup[];
  [key: string]: unknown;
};

/**
 * 组合在舞台上的稳定条目 id。
 */
export const curtainGroupEntryId = (group: { id: string }) => "curtain-group:" + group.id;

/**
 * 从配置里筛出有效的窗帘组合。
 */
export function validCurtainGroups(config: CoverConfig = {}) {
  const curtainById = new Map((config.curtains || []).map(curtain => [curtain.id, curtain]));
  const usedMemberIds = new Set<string>();
  return (config.curtainGroups || []).filter(group => {
    const memberIds = group.memberIds;
    // 组合必须有自己的 id、恰好两名成员，且两名成员不是同一个配置项。
    if (
      !group.id ||
      !Array.isArray(memberIds) ||
      memberIds.length !== 2 ||
      memberIds[0] === memberIds[1]
    ) {
      return false;
    }
    const members = memberIds.map(memberId => curtainById.get(memberId));
    // 只要有一名成员找不到 / 跨楼层 / 是梦幻帘 / 已被别的组合占用，或两名成员指向同一实体，
    const first = members[0];
    const second = members[1];
    const invalid =
      members.some(
        member =>
          !member ||
          member.floorId !== group.floorId ||
          member.coverKind === "dream" ||
          usedMemberIds.has(member.id)
      ) ||
      !!(first?.entityId && first.entityId === second?.entityId);
    if (invalid) {
      return false;
    }
    memberIds.forEach(memberId => usedMemberIds.add(memberId));
    return true;
  });
}

/**
 * 列出可用来与指定窗帘组成新组合的候选成员。
 */
export function curtainGroupCandidates(config: CoverConfig | null | undefined, curtainId: string) {
  const curtain = config?.curtains?.find(candidate => candidate.id === curtainId);
  const groupedMemberIds = new Set(
    validCurtainGroups(config || {}).flatMap(group => group.memberIds || [])
  );
  if (!curtain?.floorId || curtain.coverKind === "dream" || groupedMemberIds.has(curtain.id)) {
    return [];
  }
  return (config?.curtains || []).filter(
    candidate =>
      candidate.id !== curtain.id &&
      candidate.floorId === curtain.floorId &&
      candidate.coverKind !== "dream" &&
      !groupedMemberIds.has(candidate.id) &&
      // 第一副帘没有 entityId 时不做实体去重（成员可能是尚未绑定实体的配置项）。
      (!curtain.entityId || candidate.entityId !== curtain.entityId)
  );
}

/**
 * 以一副已有窗帘为模板创建新组合。
 */
export function createCurtainGroup(
  config: CoverConfig,
  firstCurtainId: string,
  secondCurtainId: string,
  groupId: string,
  groupLabel: string,
) {
  const template = config.curtains?.find(curtain => curtain.id === firstCurtainId);
  if (!template) {
    throw new Error("请选择同楼层未组合、实体不同的普通窗帘。");
  }
  if (
    !curtainGroupCandidates(config, firstCurtainId).some(
      candidate => candidate.id === secondCurtainId
    )
  ) {
    throw new Error("请选择同楼层未组合、实体不同的普通窗帘。");
  }
  const group: CurtainGroup = {
    id: groupId,
    label: groupLabel || "双层窗帘",
    floorId: template.floorId,
    memberIds: [firstCurtainId, secondCurtainId],
    size: template.size ?? 44,
    iconSize: template.iconSize ?? 26,
    hitSize: template.hitSize ?? Math.max(44, template.size ?? 44),
    clickAction: template.clickAction === "panel" ? "panel" : "focus",
    // 新组合显式带上排布方式：后端会校验 panelLayout 的取值，缺省（undefined）虽能过校验，
    panelLayout: "horizontal",
    visible: template.visible !== false,
    hiddenClickable: template.hiddenClickable === true,
    buttonHidden: template.buttonHidden === true
  };
  for (const key of ["x", "y", "height", "focusCamera"] as const) {
    if (template[key] !== undefined) {
      group[key] = structuredClone(template[key]);
    }
  }
  return group;
}
