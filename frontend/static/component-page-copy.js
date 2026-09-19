/**
 * 跨页面 / 跨项目复制组件（含「复制到指定页面」与「复制到侧边栏共享区」）。
 *
 * 位置：编辑器图层树的复制菜单与画布右键菜单调用，是「复制组件」的纯逻辑层。
 * 职责：找到源组件、克隆并整棵子树换新 ID、生成不重名的副本名、校验导航与
 *   弹窗引用是否仍然有效，必要时按画布比例缩放，最后插入目标集合。
 * 约定：① 复制到共享区时，所有页面都要引用这批新共享组件；
 *   ② 副作用是直接修改 targetDocument（就地插入），调用方负责进历史栈；
 *   ③ 坐标缩放公式与 dashboard-resize.js 保持一致（顶层按中心对齐）。
 */
function findComponentInTree(componentTree, targetComponentId) {
  for (const childComponent of componentTree || []) {
    if (childComponent.id === targetComponentId) return childComponent;
    const nestedMatch = findComponentInTree(childComponent.children, targetComponentId);
    if (nestedMatch) return nestedMatch;
  }
  return null;
}
// 定位组件并标注来源作用域，共享区的 page 固定为 null。
function locateComponentWithScope(scopedDocument, locatedComponentId) {
  const sharedScopeComponent = findComponentInTree(
    scopedDocument?.sharedComponents,
    locatedComponentId
  );
  if (sharedScopeComponent) return { component: sharedScopeComponent, scope: "shared", page: null };
  for (const scannedPage of scopedDocument?.pages || []) {
    const locatedComponent = findComponentInTree(scannedPage.components, locatedComponentId);
    if (locatedComponent) return { component: locatedComponent, scope: "page", page: scannedPage };
  }
  return null;
}
// 按 ID 集合收集组件（保持其在文档中的遍历顺序），结果用于批量复制。
function collectComponentsByIds(documentTree, wantedComponentIds) {
  const wantedIdSet = new Set(wantedComponentIds || []),
    collectedComponents = [],
    walkComponents = walkComponentList => {
      for (const candidateComponent of walkComponentList || [])
        (wantedIdSet.has(candidateComponent.id) && collectedComponents.push(candidateComponent),
          walkComponents(candidateComponent.children));
    };
  walkComponents(documentTree?.sharedComponents);
  for (const documentTreePage of documentTree?.pages || [])
    walkComponents(documentTreePage.components);
  return collectedComponents;
}
/**
 * 列出可作为复制目标的页面。
 *
 * 源组件在共享区时任何页面都能引用它，因此全部页面入选；
 * 源组件属于某个页面时排除它自己所在的页面，避免同页重复。
 *
 * @param {object} originDocument 源文档模型（只读）。
 * @param {string} copiedComponentId 被复制的组件 ID。
 * @returns {Array<object>} 目标页面列表；源组件不存在时为空数组。
 */
export function copyComponentTargetPages(originDocument, copiedComponentId) {
  const locatedTarget = locateComponentWithScope(originDocument, copiedComponentId);
  // 源组件在共享区时所有页面都可作为目标；否则排除它自己所在的页面。
  return locatedTarget
    ? (originDocument?.pages || []).filter(
        otherPage => locatedTarget.scope === "shared" || otherPage !== locatedTarget.page
      )
    : [];
}
/**
 * 构造「复制到…」下拉的候选项列表。
 *
 * 先按页面生成 key 为 "page:<path>" 的目标；只有源组件本身属于某个页面时，
 * 才在最前面插入共享区（侧边栏）这一项 —— 共享组件不允许再复制到共享区。
 *
 * @param {object} pageSourceDocument 源文档模型（只读）。
 * @param {string} sourceComponentId 被复制的组件 ID。
 * @returns {Array<{key: string, name: string, scope: string, page?: object}>} 候选项列表。
 */
export function copyComponentTargets(pageSourceDocument, sourceComponentId) {
  const targetLocation = locateComponentWithScope(pageSourceDocument, sourceComponentId);
  if (!targetLocation) return [];
  // key 采用 "page:<path>" 形式，选择器与调用方据此回到具体页面。
  const pageTargets = copyComponentTargetPages(pageSourceDocument, sourceComponentId).map(page => ({
    key: `page:${page.path}`,
    name: page.name,
    scope: "page",
    page: page
  }));
  // 源组件属于某个页面时才允许复制到共享侧边栏，避免共享组件自我复制。
  return targetLocation.scope === "page"
    ? [{ key: "shared", name: "侧边栏", scope: "shared" }, ...pageTargets]
    : pageTargets;
}
// 递归给组件及其子树换新 ID；createComponentId 由调用方注入（便于测试）。
function assignFreshComponentIds(componentNode, createComponentId) {
  componentNode.id = createComponentId();
  for (const nestedChildComponent of componentNode.children || [])
    assignFreshComponentIds(nestedChildComponent, createComponentId);
  return componentNode;
}
// 生成不重名的副本名：先剥掉旧的后缀，再依次尝试 _副本、_副本2、_副本3……
function uniqueCopyLabel(labelSourceComponent, siblingComponents, labelOf) {
  const baseLabel =
      String(labelOf(labelSourceComponent) || "控件")
        .trim()
        .replace(/_副本\d*$/, "") || "控件",
    existingLabels = new Set(
      (siblingComponents || []).map(existingComponent => String(labelOf(existingComponent)).trim())
    );
  let candidateLabel = `${baseLabel}_副本`,
    copyIndex = 2;
  // 只有 init / test 两段，自增放在循环体里。
  for (; existingLabels.has(candidateLabel);)
    ((candidateLabel = `${baseLabel}_副本${copyIndex}`), (copyIndex += 1));
  return candidateLabel;
}
// 按数组顺序重排 zIndex：数组越靠后层级越高。
function applyLayerOrder(components) {
  for (let layerIndex = 0; layerIndex < (components || []).length; layerIndex += 1) {
    const layeredComponent = components[layerIndex];
    layeredComponent.position = {
      ...(layeredComponent.position || {}),
      zIndex: components.length - layerIndex
    };
  }
}
// 保留 6 位小数，压掉浮点误差。
function roundSixDecimals(numericValue) {
  return Math.round(Number(numericValue) * 1e6) / 1e6;
}
// 正数兜底：非有限数或非正数一律用默认值。
function positiveNumberOr(rawValue, fallbackValue) {
  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallbackValue;
}
// 递归缩放组件几何：顶层按画布比例定位，子层级整体等比缩放。
function scaleComponentGeometry(geometryComponent, scaleX, scaleY, childScale, isRoot = !0) {
  if (!geometryComponent || typeof geometryComponent != "object") return;
  const position = geometryComponent.position || {},
    width = positiveNumberOr(position.width, 100),
    height = positiveNumberOr(position.height, 100),
    positionX = Number.isFinite(Number(position.x)) ? Number(position.x) : 0,
    positionY = Number.isFinite(Number(position.y)) ? Number(position.y) : 0,
    // 3D 控件按目标画布的横纵比例各自伸缩，其余组件用统一的子级缩放：
    // 3D 内部画面是铺满外框渲染的，横纵同比例会让外框与渲染口径不一致。
    scaledWidth = width * (geometryComponent.type === "interaction3d" ? scaleX : childScale),
    scaledHeight = height * (geometryComponent.type === "interaction3d" ? scaleY : childScale);
  // 顶层按中心缩放（与目标画布比例对齐），子组件只随父级缩放。
  geometryComponent.position = {
    ...position,
    x: roundSixDecimals(
      isRoot ? (positionX + width / 2) * scaleX - scaledWidth / 2 : positionX * childScale
    ),
    y: roundSixDecimals(
      isRoot ? (positionY + height / 2) * scaleY - scaledHeight / 2 : positionY * childScale
    ),
    width: roundSixDecimals(scaledWidth),
    height: roundSixDecimals(scaledHeight)
  };
  for (const childNode of geometryComponent.children || [])
    scaleComponentGeometry(childNode, childScale, childScale, childScale, !1);
}
// 按源 / 目标画布尺寸把组件缩放到目标画布，用于跨分辨率项目复制。
function fitComponentToCanvas(componentToFit, sourceCanvas, targetCanvas) {
  const sourceWidth = positiveNumberOr(sourceCanvas?.width, 2778),
    sourceHeight = positiveNumberOr(sourceCanvas?.height, 1940),
    targetWidth = positiveNumberOr(targetCanvas?.width, sourceWidth),
    targetHeight = positiveNumberOr(targetCanvas?.height, sourceHeight),
    widthRatio = targetWidth / sourceWidth,
    heightRatio = targetHeight / sourceHeight;
  return (
    // 内容缩放取两个方向的较小值，保证组件完整落在画布内。
    scaleComponentGeometry(
      componentToFit,
      widthRatio,
      heightRatio,
      Math.min(widthRatio, heightRatio)
    ),
    componentToFit
  );
}
// 递归清理失效引用：目标页面 / 弹窗在新的文档里不存在时，删除对应的动作配置。
function pruneInvalidReferences(componentToPrune, pruneDocument, handleInvalidReference) {
  if (!componentToPrune || typeof componentToPrune != "object") return;
  const pagePaths = new Set((pruneDocument?.pages || []).map(existingPage => existingPage.path)),
    popupIds = new Set((pruneDocument?.customPopups || []).map(existingPopup => existingPopup.id));
  // 组件自身 properties.targetPage 指向的页面若不存在，直接删掉该属性。
  componentToPrune.properties?.targetPage &&
    !pagePaths.has(componentToPrune.properties.targetPage) &&
    (delete componentToPrune.properties.targetPage, handleInvalidReference?.("navigate"));
  for (const [actionKey, action] of Object.entries(componentToPrune.actions || {})) {
    const hasInvalidTarget = action?.type === "navigate" && !pagePaths.has(action.target),
      hasInvalidPopup =
        action?.type === "more-info" &&
        action.data?.popupSource === "custom" &&
        !popupIds.has(action.data?.popupId);
    // 失效动作整条删除（而不是留一个不可用的占位），并回调通知调用方提示用户。
    (hasInvalidTarget || hasInvalidPopup) &&
      (delete componentToPrune.actions[actionKey],
      handleInvalidReference?.(hasInvalidTarget ? "navigate" : "popup"));
  }
  for (const childComponentToPrune of componentToPrune.children || [])
    pruneInvalidReferences(childComponentToPrune, pruneDocument, handleInvalidReference);
}
// 把作用域标识解析成可写的组件数组；"shared" 或 "page:<path>" 两种写法。
function resolveTargetComponentList(listDocument, scopeKey) {
  if (scopeKey === "shared")
    // 首次复制到共享区时懒创建数组，避免文档里出现多余的空数组字段。
    return listDocument.sharedComponents || (listDocument.sharedComponents = []);
  const targetPagePath = String(scopeKey || "").replace(/^page:/, ""),
    matchedPage = (listDocument.pages || []).find(
      pageCandidate => pageCandidate.path === targetPagePath
    );
  return matchedPage ? matchedPage.components || (matchedPage.components = []) : null;
}
// 把新共享组件 ID 前置进每个页面的引用列表（用 Set 去重，保持已有顺序）。
function addSharedComponentRefsToPages(refDocument, sharedComponentIds) {
  if (sharedComponentIds.length)
    for (const updatedPage of refDocument.pages || [])
      updatedPage.sharedComponentIds = [
        ...new Set([...sharedComponentIds, ...(updatedPage.sharedComponentIds || [])])
      ];
}
/**
 * 批量把组件复制到目标文档的指定作用域。
 *
 * @param {object} sourceDocumentToCopy 源文档。
 * @param {object} targetDocumentToCopy 目标文档，函数会就地插入副本。
 * @param {Array<string>} componentIdsToCopy 待复制的组件 ID 列表，自动去重。
 * @param {string} targetScopeToCopy 目标作用域："shared" 或 "page:<页面路径>"。
 * @param {object} [options] 可选依赖与行为开关。
 * @param {function(*): *} [options.cloneValue] 克隆实现，默认 structuredClone。
 * @param {function(): string} [options.createId] 生成新组件 ID（必需）。
 * @param {function(object): string} [options.componentLabel] 取显示名。
 * @param {string} [options.scaleMode] 传 "proportional" 时按画布比例缩放。
 * @param {function(string): void} [options.onInvalidAction] 失效引用回调。
 * @returns {Array<object>} 新插入的组件数组；参数不合法或找不到源组件时返回空数组。
 */
export function copyComponentsAcrossDocuments(
  sourceDocumentToCopy,
  targetDocumentToCopy,
  componentIdsToCopy,
  targetScopeToCopy,
  {
    cloneValue: cloneValue = clonedValue => structuredClone(clonedValue),
    createId: createId,
    componentLabel: componentLabelOf = labelComponent =>
      labelComponent?.properties?.label || labelComponent?.type || "控件",
    scaleMode: scaleMode = "none",
    onInvalidAction: handleInvalidAction
  } = {}
) {
  const requestedIds = [...new Set(componentIdsToCopy || [])].filter(Boolean);
  // createId 必须由调用方提供（ID 生成策略属于编辑器层，不在这里硬编码）。
  if (
    !sourceDocumentToCopy ||
    !targetDocumentToCopy ||
    !requestedIds.length ||
    typeof createId != "function"
  )
    return [];
  const sourceComponents = collectComponentsByIds(sourceDocumentToCopy, requestedIds),
    targetComponents = resolveTargetComponentList(targetDocumentToCopy, targetScopeToCopy);
  // 有 ID 找不到组件，或目标作用域不存在，整体放弃（避免复制出半个结果）。
  if (sourceComponents.length !== requestedIds.length || !targetComponents) return [];
  const copiedComponents = [];
  for (const sourceComponent of sourceComponents) {
    const copiedComponent = assignFreshComponentIds(cloneValue(sourceComponent), createId);
    ((copiedComponent.properties = {
      ...(copiedComponent.properties || {}),
      // 与「已插队的副本」一起参与重名判断，连续复制多个不会撞名。
      label: uniqueCopyLabel(
        sourceComponent,
        [...targetComponents, ...copiedComponents],
        componentLabelOf
      )
    }),
      // previewState 是源组件当时的预览快照，复制后必须丢弃以免展示旧内容。
      delete copiedComponent.properties.previewState,
      pruneInvalidReferences(copiedComponent, targetDocumentToCopy, handleInvalidAction),
      // 3D 控件即使调用方声明 scaleMode: "none" 也要适配目标画布：
      // 它的外框尺寸直接决定渲染画布大小，不缩放就会在跨分辨率复制后错位。
      (scaleMode === "proportional" || copiedComponent.type === "interaction3d") &&
        fitComponentToCanvas(
          copiedComponent,
          sourceDocumentToCopy.canvas,
          targetDocumentToCopy.canvas
        ),
      copiedComponents.push(copiedComponent));
  }
  return (
    // 插到最前面即层级最底，不会盖住目标位置已有的组件。
    targetComponents.unshift(...copiedComponents),
    applyLayerOrder(targetComponents),
    // 共享组件必须让每个页面都引用，否则复制完看不到。
    targetScopeToCopy === "shared" &&
      addSharedComponentRefsToPages(
        targetDocumentToCopy,
        copiedComponents.map(copiedChildId => copiedChildId.id)
      ),
    copiedComponents
  );
}
/**
 * 批量把组件复制到同一文档的目标作用域（不缩放坐标）。
 *
 * @param {object} batchCopySourceDocument 文档。
 * @param {Array<string>} batchCopyComponentIds 源组件 ID 列表。
 * @param {string} batchCopyTargetScope 目标作用域。
 * @param {object} [batchCopyOptions] 可选依赖。
 * @returns {Array<object>} 新组件数组。
 */
export function copyComponentsToTarget(
  batchCopySourceDocument,
  batchCopyComponentIds,
  batchCopyTargetScope,
  batchCopyOptions = {}
) {
  return copyComponentsAcrossDocuments(
    batchCopySourceDocument,
    batchCopySourceDocument,
    batchCopyComponentIds,
    batchCopyTargetScope,
    // 同文档内复制不需要换算画布比例，强制 none 覆盖调用方传入的值。
    { ...batchCopyOptions, scaleMode: "none" }
  );
}
