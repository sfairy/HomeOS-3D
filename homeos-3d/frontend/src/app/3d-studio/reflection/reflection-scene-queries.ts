/**
 * 场景树查询原语：沿父链问「这块地面属于哪一层」「是否在离场的旧楼层里」「在祖先链上可见吗」，
 */

import { isVisibleWithin as isVisibleWithinSceneTree } from "../scene-tree-utils.js";

type SceneNodeLike = {
  parent?: SceneNodeLike | null;
  // 必填布尔：与 THREE.Object3D.visible 同构。这使「!visible」与「visible === false」
  // 两种谓词在类型域严格等价（boolean 二值真值表相同），共享实现统一用后者。
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
 * 沿父链向上找楼层 ID（兼容四种字段名：文档楼层、区域、环境层、灯光层）。
 */
export function resolveFloorId(startObject: SceneNodeLike | null | undefined): string {
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
export function isFloorTransitionLeaving(transitionSource: SceneNodeLike | null | undefined): boolean {
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
 * 无边界版的共享实现见 ../scene-tree-utils.js（区域灯侧以 rootNode 夹取边界复用同一份）。
 */
export function isVisibleWithin(startNode: SceneNodeLike | null | undefined): boolean {
  return isVisibleWithinSceneTree(startNode);
}
