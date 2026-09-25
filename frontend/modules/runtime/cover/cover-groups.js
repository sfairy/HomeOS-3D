/**
 * 窗帘组合（一拖多）的配置归一：把配置里的 curtainGroups 收敛成「真正可用」的组合集合，
 * 并为每个组合生成稳定的舞台条目 id。
 *
 * 组合的语义是「同一楼层里两副普通窗帘被当成一个整体控制」（典型场景是双层帘）。本模块只做
 * 纯配置运算，不碰 DOM，对外四件事：
 *   validCurtainGroups      —— 逐条校验并顺带去重，任何一边不满足条件就整条丢弃；
 *   curtainGroupCandidates  —— 编辑器里据「已选中的第一副帘」列出可配对的第二副帘；
 *   createCurtainGroup      —— 以第一副帘为模板派生新组合；
 *   curtainGroupEntryId     —— 把组合 id 映射成舞台条目 id（前缀固定，便于反向识别）。
 *
 * 约束：一个组合恰好两名成员；成员必须存在、同楼层、非梦幻帘，且不能跨组合复用；
 * 两名成员的 entityId 不得相同（同一实体不能既当里帘又当外帘）。
 */

/**
 * 组合在舞台上的稳定条目 id。
 *
 * 前缀 "curtain-group:" 是舞台侧识别组合条目的唯一依据（普通窗帘条目的 id 就是配置里的原始
 * id，二者不会撞车），后续凡按 id 反查的地方都依赖它，必须原样保留。
 */
export const curtainGroupEntryId = group => "curtain-group:" + group.id;

/**
 * 从配置里筛出有效的窗帘组合。
 *
 * 之所以要「筛」而不只是「校验」：配置可能被手改或由旧版本迁移而来，坏组合（缺成员、跨楼层、
 * 成员是梦幻帘、同一副帘被两个组合抢用）若继续参与渲染，舞台会出现同一个实体被两处驱动的
 * 情况。这里就地过滤，并用 usedMemberIds 保证「一副帘只属于一个组合」。
 */
export function validCurtainGroups(config = {}) {
  const curtainById = new Map((config.curtains || []).map(curtain => [curtain.id, curtain]));
  // 已被前面有效组合占用的成员 id：后面的组合再引用到就判为无效，避免重复驱动。
  const usedMemberIds = new Set();
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
    // 整条组合就作废。梦幻帘必须排除：它的「整体 + 叶片」两段语义无法与普通窗帘归并成一个开关。
    // members.some 为真时短路，下面的 members[0] 才一定存在。
    const invalid =
      members.some(
        member =>
          !member ||
          member.floorId !== group.floorId ||
          member.coverKind === "dream" ||
          usedMemberIds.has(member.id)
      ) ||
      (members[0].entityId && members[0].entityId === members[1].entityId);
    if (invalid) {
      return false;
    }
    memberIds.forEach(memberId => usedMemberIds.add(memberId));
    return true;
  });
}

/**
 * 列出可用来与指定窗帘组成新组合的候选成员。
 *
 * 编辑器在用户选中一副帘后要即时给出「还能和谁配对」，判定条件与 validCurtainGroups 保持一致
 * （同楼层、非梦幻帘、未被占用），另外要求 entityId 不同。第一副帘本身不合法（没楼层 / 是
 * 梦幻帘 / 已在别的组合里）时直接返回空数组，让编辑器收起配对入口。
 */
export function curtainGroupCandidates(config, curtainId) {
  const curtain = config?.curtains?.find(candidate => candidate.id === curtainId);
  const groupedMemberIds = new Set(
    validCurtainGroups(config).flatMap(group => group.memberIds)
  );
  if (!curtain?.floorId || curtain.coverKind === "dream" || groupedMemberIds.has(curtain.id)) {
    return [];
  }
  return config.curtains.filter(
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
 *
 * 组合沿用第一副帘的外观与行为（尺寸、可见性、点击行为等），这样新建组合在舞台上的观感与
 * 它替换掉的那副帘一致；x / y / height / focusCamera 用 structuredClone 深拷贝，避免组合与
 * 成员共享引用后互相改坏。配对不合法时抛出与编辑器提示一致的中文错误。
 */
export function createCurtainGroup(config, firstCurtainId, secondCurtainId, groupId) {
  const template = config.curtains.find(curtain => curtain.id === firstCurtainId);
  if (
    !curtainGroupCandidates(config, firstCurtainId).some(
      candidate => candidate.id === secondCurtainId
    )
  ) {
    throw new Error("请选择同楼层未组合、实体不同的普通窗帘。");
  }
  const group = {
    id: groupId,
    label: "双层窗帘",
    floorId: template.floorId,
    memberIds: [firstCurtainId, secondCurtainId],
    size: template.size ?? 44,
    iconSize: template.iconSize ?? 26,
    hitSize: template.hitSize ?? Math.max(44, template.size ?? 44),
    clickAction: template.clickAction === "panel" ? "panel" : "focus",
    visible: template.visible !== false,
    hiddenClickable: template.hiddenClickable === true,
    buttonHidden: template.buttonHidden === true
  };
  for (const key of ["x", "y", "height", "focusCamera"]) {
    if (template[key] !== undefined) {
      group[key] = structuredClone(template[key]);
    }
  }
  return group;
}
