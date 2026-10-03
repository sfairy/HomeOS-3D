/** 场景树查询原语：沿父链回答「这个节点属于哪一层」「是否在离场的旧楼层里」「祖先链上可见吗」。 */

type SceneNodeLike = {
  parent?: SceneNodeLike | null;

  visible: boolean;
  userData?: {
    floorId?: unknown;
    regionFloorId?: unknown;
    environmentFloorId?: unknown;
    lightFloorId?: unknown;
    floorTransitionLeaving?: unknown;
  };
};

/** 只读节点「自身」挂的楼层 ID，不爬父链（兼容四种字段名：文档楼层、区域、环境层、灯光层）。 */
export function readOwnFloorId(ownNode: SceneNodeLike | null | undefined): string {
  return String(
    ownNode?.userData?.floorId ||
      ownNode?.userData?.regionFloorId ||
      ownNode?.userData?.environmentFloorId ||
      ownNode?.userData?.lightFloorId ||
      "",
  );
}

/** 沿父链向上找最近的楼层 ID。 */
export function resolveFloorId(startObject: SceneNodeLike | null | undefined): string {
  for (let currentObject = startObject; currentObject; currentObject = currentObject.parent) {
    const userDataFloorId = readOwnFloorId(currentObject);
    if (userDataFloorId) return userDataFloorId;
  }
  return "";
}

/** 判断节点是否处于「正在离场的旧楼层」下（楼层过渡动画）。 */
export function isFloorTransitionLeaving(
  transitionSource: SceneNodeLike | null | undefined,
): boolean {
  for (let transitionNode = transitionSource; transitionNode; transitionNode = transitionNode.parent)
    if (transitionNode.userData?.floorTransitionLeaving) return true;
  return false;
}

/** 判断节点自身及全部祖先是否可见。 */
export function isVisibleWithin(startNode: SceneNodeLike | null | undefined): boolean {
  for (let checkedNode = startNode; checkedNode; checkedNode = checkedNode.parent)
    if (!checkedNode.visible) return false;
  return true;
}
