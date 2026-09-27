/**
 * 场景树查询原语：沿父链问「这块地面属于哪一层」「是否在离场的旧楼层里」「在祖先链上可见吗」，
 * 以及网格的几何签名。
 *
 * 从 studio-ground-reflections.js 拆出来：那几个都是**只吃参数、不读闭包状态**的纯查询，
 * 反射控制器只需要「记录 + 镜像相机 + 渲染编排」，这些问法单独成篇也便于别处复用。
 */
/**
 * 沿父链向上找楼层 ID（兼容四种字段名：文档楼层、区域、环境层、灯光层）。
 * 任一命中即返回，保证反射能把「这块地面属于哪一层」判对，进而只拍本层的地面。
 */
export function resolveFloorId(startObject) {
  for (let currentObject = startObject; currentObject; currentObject = currentObject.parent) {
    const userDataFloorId =
      currentObject.userData?.floorId ||
      currentObject.userData?.regionFloorId ||
      currentObject.userData?.environmentFloorId ||
      currentObject.userData?.lightFloorId;
    if (userDataFloorId) {
      return String(userDataFloorId);
    }
  }
  return "";
}


/**
 * 判断节点是否处于「正在离场的旧楼层」下（楼层过渡动画）。
 */
export function isFloorTransitionLeaving(transitionSource) {
  for (
    let transitionNode = transitionSource;
    transitionNode;
    transitionNode = transitionNode.parent
  ) {
    if (transitionNode.userData?.floorTransitionLeaving) {
      return true;
    }
  }
  return false;
}

/**
 * 判断节点自身及全部祖先是否可见。
 */
export function isVisibleWithin(startNode) {
  for (let visibilityNode = startNode; visibilityNode; visibilityNode = visibilityNode.parent) {
    if (!visibilityNode.visible) {
      return false;
    }
  }
  return true;
}
