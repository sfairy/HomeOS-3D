/**
 * 3d-studio 内沿场景树父链向上遍历的共享小工具。
 * plan（接触阴影 / 区域灯）与 reflection（地面反射）两侧复用同一份实现。
 */

/**
 * 沿父链向上查找某个 userData 字段：从 startObject 自身开始，返回第一个
 * 「!== undefined」的字段值；整条父链（含起点）都没有时返回 undefined。
 */
export function findUserDataInAncestors(startObject: any, userDataKey: any) {
  for (let ancestorObject = startObject; ancestorObject; ancestorObject = ancestorObject.parent) {
    if (ancestorObject.userData?.[userDataKey] !== undefined) {
      return ancestorObject.userData[userDataKey];
    }
  }
}

/**
 * 判断从 startNode（含自身）向上的父链是否「沿途可见」，可选 rootNode 夹取边界。
 *
 * - 不传 rootNode（无边界）：沿父链一直查到场景根，沿途没有 visible === false
 *   的节点即返回 true；startNode 为 null / undefined（空链）也返回 true。
 * - 传入 rootNode（有边界）：必须在父链走到尽头之前遇到 rootNode（即 startNode
 *   位于 rootNode 子树内）、且沿途 visible !== false 才返回 true；边界节点自身
 *   的可见性先于相等性参与判断（rootNode 被隐藏时仍判 false）。走完整条链未遇
 *   rootNode 则返回 false——显式传 null 时永远匹配不到，结果恒为 false（保留
 *   历史调用方在场景根尚未就绪时的行为）。
 */
export function isVisibleWithin(startNode: any, rootNode?: any) {
  for (let currentNode = startNode; currentNode; currentNode = currentNode.parent) {
    if (currentNode.visible === false) {
      return false;
    }
    if (rootNode !== undefined && currentNode === rootNode) {
      return true;
    }
  }
  return rootNode === undefined;
}
