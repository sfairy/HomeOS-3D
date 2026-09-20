/**
 * 组件树的查找与定位工具。
 *
 * 在「共享组件 + 各页面组件」两层结构里按 ID 找组件，并给出它在哪个集合、第几个位置、属于哪个
 * 页面，供插入 / 删除 / 拖拽复用。组件树为递归结构，children 可缺省；scope 取 "shared" /
 * "page"，root 表示命中项直接位于 sharedComponents 或某个 page.components 顶层。
 */

/**
 * 递归在组件数组中查找指定 ID 的组件。
 */
export function findComponentInItems(componentTree, componentId) {
  for (const itemComponent of componentTree || []) {
    if (itemComponent.id === componentId) {
      return itemComponent;
    }
    const childComponent = findComponentInItems(itemComponent.children, componentId);
    if (childComponent) {
      return childComponent;
    }
  }
  return null;
}

/**
 * 在整份文档模型中查找组件，并标注来源作用域。
 */
export function findComponent(dashboardDocument, targetComponentId) {
  if (!dashboardDocument || !targetComponentId) {
    return null;
  }
  // 先查共享组件：共享组件在多个页面同时存在，命中即返回，不再看页面。
  const sharedComponent = findComponentInItems(
    dashboardDocument.sharedComponents,
    targetComponentId
  );
  if (sharedComponent) {
    return {
      component: sharedComponent,
      scope: "shared"
    };
  }
  for (const pageEntry of dashboardDocument.pages || []) {
    const pageComponent = findComponentInItems(pageEntry.components, targetComponentId);
    if (pageComponent) {
      return {
        component: pageComponent,
        scope: "page",
        page: pageEntry
      };
    }
  }
  return null;
}

/**
 * 定位组件并给出可写的容器与下标，用于就地修改组件树。
 */
export function findComponentLocation(documentModel, searchedComponentId) {
  if (!documentModel || !searchedComponentId) {
    return null;
  }
  // isRoot 表示这一层直接挂在 sharedComponents / page.components 上，
  // 决定调用方能否直接增删该节点。
  const locateComponent = (items, scope, page = null, isRoot = false) => {
    for (let index = 0; index < (items || []).length; index += 1) {
      const component = items[index];
      if (component.id === searchedComponentId) {
        return {
          component: component,
          collection: items,
          index: index,
          scope: scope,
          page: page,
          root: isRoot
        };
      }
      // 子层级继续沿用同一 scope 与 page，但 root 一律为 false。
      const childLocation = locateComponent(component.children, scope, page, false);
      if (childLocation) {
        return childLocation;
      }
    }
    return null;
  };
  const sharedLocation = locateComponent(documentModel.sharedComponents, "shared", null, true);
  if (sharedLocation) {
    return sharedLocation;
  }
  for (const pageRecord of documentModel.pages || []) {
    const pageLocation = locateComponent(pageRecord.components, "page", pageRecord, true);
    if (pageLocation) {
      return pageLocation;
    }
  }
  return null;
}

/**
 * 取得组件的直接位置：只有位于顶层（root）才返回，嵌套子组件视为不可直接操作。
 */
export function componentDirectLocation(sourceDocument, componentIdToLocate) {
  const location = findComponentLocation(sourceDocument, componentIdToLocate);
  if (location?.root) {
    return location;
  } else {
    return null;
  }
}
