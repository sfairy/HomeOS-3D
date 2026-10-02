export function findComponentInItems(items, targetId) {
  for (const item of items || []) {
    if (item.id === targetId) return item;
    const matchedChild = findComponentInItems(item.children, targetId);
    if (matchedChild) return matchedChild;
  }
  return null;
}
export function findComponent(project, componentId) {
  if (!project || !componentId) return null;
  const sharedMatch = findComponentInItems(project.sharedComponents, componentId);
  if (sharedMatch)
    return {
      component: sharedMatch,
      scope: "shared",
    };
  for (const page of project.pages || []) {
    const pageMatch = findComponentInItems(page.components, componentId);
    if (pageMatch)
      return {
        component: pageMatch,
        scope: "page",
        page: page,
      };
  }
  return null;
}
export function findComponentLocation(projectTree, lookupId) {
  if (!projectTree || !lookupId) return null;
  const locateInItems = (siblings, scopeName, ownerPage = null, isRoot = false) => {
      for (let itemIndex = 0; itemIndex < (siblings || []).length; itemIndex += 1) {
        const childItem = siblings[itemIndex];
        if (childItem.id === lookupId)
          return {
            component: childItem,
            collection: siblings,
            index: itemIndex,
            scope: scopeName,
            page: ownerPage,
            root: isRoot,
          };
        const nestedMatch = locateInItems(childItem.children, scopeName, ownerPage, false);
        if (nestedMatch) return nestedMatch;
      }
      return null;
    },
    sharedLocation = locateInItems(projectTree.sharedComponents, "shared", null, true);
  if (sharedLocation) return sharedLocation;
  for (const listedPage of projectTree.pages || []) {
    const pageLocation = locateInItems(listedPage.components, "page", listedPage, true);
    if (pageLocation) return pageLocation;
  }
  return null;
}
export function componentDirectLocation(sourceProject, wantedId) {
  const location = findComponentLocation(sourceProject, wantedId);
  return location?.root ? location : null;
}
