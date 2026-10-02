/**
 * 场景树查询原语：沿父链回答「这个节点属于哪一层」「是否在离场的旧楼层里」「祖先链上可见吗」。
 *
 * 反射通道要在遍历场景时反复问这三个问题（每块地面、每盏灯、每次捕获都要问），
 * 因此单独成模块，让「楼层 ID 的四种字段名」这类口径只在一处维护。
 */

type SceneNodeLike = {
  parent?: SceneNodeLike | null;
  // 必须是布尔：与 THREE.Object3D.visible 同构，使「!visible」与「visible === false」两种谓词等价。
  visible: boolean;
  userData?: {
    floorId?: unknown;
    regionFloorId?: unknown;
    environmentFloorId?: unknown;
    lightFloorId?: unknown;
    floorTransitionLeaving?: unknown;
  };
};

/**
 * 只读节点「自身」挂的楼层 ID，不爬父链（兼容四种字段名：文档楼层、区域、环境层、灯光层）。
 * 找不到时返回空串而不是 null：调用方普遍拿它当 Map 的 key 与字符串比较。
 *
 * 反射通道遍历场景时会自顶向下缓存父节点的楼层 ID，所以那里必须只读自身——
 * 逐节点爬父链会让整趟遍历从 O(节点数) 退化成 O(节点数 × 深度)。
 */
export function readOwnFloorId(ownNode: SceneNodeLike | null | undefined): string {
  return String(
    ownNode?.userData?.floorId ||
      ownNode?.userData?.regionFloorId ||
      ownNode?.userData?.environmentFloorId ||
      ownNode?.userData?.lightFloorId ||
      "",
  );
}

/**
 * 沿父链向上找最近的楼层 ID。找不到时返回空串（口径同 readOwnFloorId）。
 */
export function resolveFloorId(startObject: SceneNodeLike | null | undefined): string {
  for (let currentObject = startObject; currentObject; currentObject = currentObject.parent) {
    const userDataFloorId = readOwnFloorId(currentObject);
    if (userDataFloorId) return userDataFloorId;
  }
  return "";
}

/**
 * 判断节点是否处于「正在离场的旧楼层」下（楼层过渡动画）。
 * 过渡中的旧楼层整体在往下掉，此时把它拍进倒影会得到一层残影。
 */
export function isFloorTransitionLeaving(
  transitionSource: SceneNodeLike | null | undefined,
): boolean {
  for (let transitionNode = transitionSource; transitionNode; transitionNode = transitionNode.parent)
    if (transitionNode.userData?.floorTransitionLeaving) return true;
  return false;
}

/**
 * 判断节点自身及全部祖先是否可见。
 * 室外背景面挂在父节点下、由父节点开关可见性，所以调用方对「室外」要传父节点（见 studio-ground-reflections）。
 */
export function isVisibleWithin(startNode: SceneNodeLike | null | undefined): boolean {
  for (let checkedNode = startNode; checkedNode; checkedNode = checkedNode.parent)
    if (!checkedNode.visible) return false;
  return true;
}
