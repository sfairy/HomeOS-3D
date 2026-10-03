import { newId } from "./editor-utils";
export function componentLabel(component) {
  const typeLabel =
      component.type === "image"
        ? "图片"
        : component.type === "time"
          ? "时间"
          : component.type === "date"
            ? "日期"
            : component.type === "weather"
              ? "天气"
              : component.type === "percentage-bar"
                ? "百分比柱状图"
                : component.type === "line-chart"
                  ? "折线图"
                  : component.type === "event-log-wall"
                    ? "即时消息墙"
                    : component.type === "flow-line"
                    ? "流水线条"
                    : component.type === "panel-frame"
                      ? "底图框"
                      : component.type === "navigation-button"
                        ? "导航按钮"
                        : component.type === "scene-mode"
                          ? "情景模式"
                          : component.type === "title-button"
                            ? "标题按钮"
                            : component.type === "light-statistics"
                              ? "数量统计"
                              : component.type === "icon-button"
                                ? "图标按钮"
                                : component.type === "device-button"
                                  ? "设备按钮"
                                  : component.type === "presence-sensor"
                                    ? "传感器"
                                    : component.type === "air-conditioner"
                                      ? "空调"
                                      : component.type === "vacuum-map"
                                        ? "扫地机器人实时地图"
                                        : component.type === "camera"
                                          ? "摄像头实时预览"
                                          : component.type === "icon-button-effect"
                                            ? "图标按钮（效果）"
                                            : component.type === "group"
                                              ? "组合"
                                              : component.type,
    instanceName = component.properties?.instanceName,
    instanceNameMatch =
      component.type === "light-statistics"
        ? /^(?:灯光统计|开灯统计)(_副本\d*)?$/.exec(String(instanceName || ""))
        : null,
    computedLabel =
      component.type === "light-statistics" && instanceName === "图片"
        ? typeLabel
        : instanceNameMatch
          ? "" + typeLabel + (instanceNameMatch[1] || "")
          : (component.type === "vacuum-map" && instanceName === "扫地机地图") ||
              (component.type === "camera" && instanceName === "摄像头画面")
            ? typeLabel
            : instanceName;
  return component.properties?.label || computedLabel || component.properties?.title || typeLabel;
}
export function nextTemplateInstanceName(existingComponents, candidateName) {
  const labelSet = new Set(
    (existingComponents || []).map((mappedComponent) => componentLabel(mappedComponent)),
  );
  if (!labelSet.has(candidateName)) return candidateName;
  let deduplicatedName = candidateName + "_副本",
    dedupIndex = 2;
  for (; labelSet.has(deduplicatedName);)
    ((deduplicatedName = candidateName + "_副本" + dedupIndex), (dedupIndex += 1));
  return deduplicatedName;
}
export function groupNameForCollection(groupComponents, baseGroupName = "组合") {
  const groupLabelSet = new Set(
    (groupComponents || []).map((groupComponent) => componentLabel(groupComponent)),
  );
  if (!groupLabelSet.has(baseGroupName)) return baseGroupName;
  let groupIndex = 2;
  for (; groupLabelSet.has(baseGroupName + " " + groupIndex);) groupIndex += 1;
  return baseGroupName + " " + groupIndex;
}
export function refreshComponentIds(rootComponent, assignedId = null) {
  rootComponent.id = assignedId || newId("component");
  for (const childComponent of rootComponent.children || []) refreshComponentIds(childComponent);
  return rootComponent;
}
export function copiedComponentLabel(sourceComponent, siblingComponents) {
  const cleanedLabel =
      String(componentLabel(sourceComponent) || "控件")
        .trim()
        .replace(/_副本\d*$/, "") || "控件",
    siblingLabelSet = new Set(
      (siblingComponents || []).map((siblingComponent) =>
        String(componentLabel(siblingComponent)).trim(),
      ),
    );
  let copiedName = cleanedLabel + "_副本",
    copyIndex = 2;
  for (; siblingLabelSet.has(copiedName);)
    ((copiedName = cleanedLabel + "_副本" + copyIndex), (copyIndex += 1));
  return copiedName;
}
export function applyCollectionLayerOrder(orderedComponents) {
  for (
    let componentIndex = 0;
    componentIndex < (orderedComponents || []).length;
    componentIndex += 1
  ) {
    const currentComponent = orderedComponents[componentIndex];
    currentComponent.position = {
      ...(currentComponent.position || {}),
      zIndex: orderedComponents.length - componentIndex,
    };
  }
}
export function syncSharedComponentReferenceOrder(dashboardConfig) {
  const sharedComponentIds = (dashboardConfig.sharedComponents || []).map(
    (sharedComponent) => sharedComponent.id,
  );
  for (const currentPage of dashboardConfig.pages || []) {
    const sharedIdSet = new Set(currentPage.sharedComponentIds || []);
    currentPage.sharedComponentIds = sharedComponentIds.filter((referencedId) =>
      sharedIdSet.has(referencedId),
    );
  }
}
export function ensureSharedComponentReference(collectionConfig, sharedComponentId, pagePath) {
  const targetPage = (collectionConfig?.pages || []).find(
      (pageRecord) => pageRecord.path === pagePath,
    ),
    hasSharedComponent = (collectionConfig?.sharedComponents || []).some(
      (sharedComponentRecord) => sharedComponentRecord.id === sharedComponentId,
    );
  if (!targetPage || !hasSharedComponent) return false;
  const pageSharedIds = targetPage.sharedComponentIds || [];
  return pageSharedIds.includes(sharedComponentId)
    ? false
    : ((targetPage.sharedComponentIds = [
        sharedComponentId,
        ...pageSharedIds.filter((otherSharedId) => otherSharedId !== sharedComponentId),
      ]),
      true);
}
