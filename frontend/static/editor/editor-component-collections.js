/**
 * 编辑器组件集合操作：命名、层级排序与共享组件引用维护。
 *
 * 位置：左侧图层树与画布右键菜单的「复制 / 组合 / 引用共享组件」等操作。
 * 职责：为控件推导中文显示名、生成不重名的实例名与副本名、刷新组件 ID、
 *   按图层顺序写回 zIndex，以及维护页面对共享组件的引用顺序。
 * 约定：命名规则与界面显示强相关（「_副本」「组合 2」等后缀），修改会影响
 *   既有文档的显示名，需与后端校验逻辑保持一致。
 */
import { newId } from "./editor-utils.js?v=20260920103845";

/**
 * 推导组件的显示名。
 */
export function componentLabel(component) {
  // typeLabel 是「类型默认名」；instanceName 是用户可改的实例名，两者优先级不同。
  const typeLabel =
    component.type === "image"
      ? "图片"
      : component.type === "time"
        ? "时间"
        : component.type === "date"
          ? "日期"
          : component.type === "weather"
            ? "天气"
            : component.type === "line-chart"
              ? "折线图"
              : component.type === "panel-frame"
                ? "底图框"
                : component.type === "navigation-button"
                  ? "导航按钮"
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
                                      : component.type;
  const instanceName = component.properties?.instanceName;
  // 历史版本把数量统计的实例名写成「灯光统计」「开灯统计」，这里识别出来
  // 以便沿用类型名而不是显示这些内部命名。
  const statisticsNameMatch =
    component.type === "light-statistics"
      ? /^(?:灯光统计|开灯统计)(_副本\d*)?$/.exec(String(instanceName || ""))
      : null;
  const resolvedLabel =
    component.type === "light-statistics" && instanceName === "图片"
      ? typeLabel
      : statisticsNameMatch
        ? "" + typeLabel + (statisticsNameMatch[1] || "")
        : (component.type === "vacuum-map" && instanceName === "扫地机地图") ||
            (component.type === "camera" && instanceName === "摄像头画面")
          ? typeLabel
          : instanceName;
  return component.properties?.label || resolvedLabel || component.properties?.title || typeLabel;
}

/**
 * 生成不与现有组件重名的实例名。
 */
export function nextTemplateInstanceName(components, requestedName) {
  const existingLabels = new Set(
    (components || []).map(templateComponent => componentLabel(templateComponent))
  );
  if (!existingLabels.has(requestedName)) {
    return requestedName;
  }
  let candidateName = requestedName + "_副本";
  let suffixIndex = 2;
  while (existingLabels.has(candidateName)) {
    candidateName = requestedName + "_副本" + suffixIndex;
    suffixIndex += 1;
  }
  return candidateName;
}

/**
 * 为一个「组合」生成可用名称。
 */
export function groupNameForCollection(collectionComponents, baseName = "组合") {
  const existingNames = new Set(
    (collectionComponents || []).map(collectionComponent => componentLabel(collectionComponent))
  );
  if (!existingNames.has(baseName)) {
    return baseName;
  }
  let nameSuffix = 2;
  while (existingNames.has(baseName + " " + nameSuffix)) {
    nameSuffix += 1;
  }
  return baseName + " " + nameSuffix;
}

/**
 * 递归刷新组件及其所有子组件的 ID。
 *
 * 复制 / 粘贴时必须整体换 ID，否则会与源组件在文档里「同 ID 双份」。
 */
export function refreshComponentIds(targetComponent, componentId = null) {
  targetComponent.id = componentId || newId("component");
  for (const childComponent of targetComponent.children || []) {
    refreshComponentIds(childComponent);
  }
  return targetComponent;
}

/**
 * 生成复制后的组件显示名。
 */
export function copiedComponentLabel(sourceComponent, siblingComponents) {
  // 先剥掉源名称里已有的副本后缀，避免出现「_副本_副本」。
  const baseLabel =
    String(componentLabel(sourceComponent) || "控件")
      .trim()
      .replace(/_副本\d*$/, "") || "控件";
  const siblingLabels = new Set(
    (siblingComponents || []).map(siblingComponent =>
      String(componentLabel(siblingComponent)).trim()
    )
  );
  let candidateLabel = baseLabel + "_副本";
  let labelSuffix = 2;
  while (siblingLabels.has(candidateLabel)) {
    candidateLabel = baseLabel + "_副本" + labelSuffix;
    labelSuffix += 1;
  }
  return candidateLabel;
}

/**
 * 按数组顺序写回 zIndex。
 */
export function applyCollectionLayerOrder(orderedComponents) {
  for (let layerIndex = 0; layerIndex < (orderedComponents || []).length; layerIndex += 1) {
    const layeredComponent = orderedComponents[layerIndex];
    // 数组越靠后层级越高；zIndex 用「总数 - 下标」表示，避免出现 0 或负值。
    layeredComponent.position = {
      ...(layeredComponent.position || {}),
      zIndex: orderedComponents.length - layerIndex
    };
  }
}

/**
 * 同步各页面对共享组件的引用顺序，使其跟随 sharedComponents 的排列。
 *
 * 删除某个共享组件后，残留的引用要一并清掉；顺序也要与图层面板一致。
 */
export function syncSharedComponentReferenceOrder(editorDocument) {
  // 全局共享组件顺序是唯一权威：各页面只保留自己确实引用过的那些，并按此顺序重排。
  const sharedComponentIds = (editorDocument.sharedComponents || []).map(
    sharedComponent => sharedComponent.id
  );
  for (const scannedPage of editorDocument.pages || []) {
    const referencedIds = new Set(scannedPage.sharedComponentIds || []);
    // 以全局顺序为准过滤：不存在的引用被丢弃，顺序与全局保持一致。
    scannedPage.sharedComponentIds = sharedComponentIds.filter(referencedComponentId =>
      referencedIds.has(referencedComponentId)
    );
  }
}

/**
 * 确保指定页面对某个共享组件建立了引用。
 */
export function ensureSharedComponentReference(sourceDocument, sharedComponentId, pagePath) {
  // 页面不存在时不能凭空建页：调用方（面板按钮）会据此判断这次操作未生效。
  const targetPage = (sourceDocument?.pages || []).find(
    documentPage => documentPage.path === pagePath
  );
  // 组件必须真实存在于 sharedComponents，避免页面上留下指向不存在组件的悬空引用。
  const hasSharedComponent = (sourceDocument?.sharedComponents || []).some(
    sharedComponentEntry => sharedComponentEntry.id === sharedComponentId
  );
  if (!targetPage || !hasSharedComponent) {
    return false;
  }
  const pageSharedComponentIds = targetPage.sharedComponentIds || [];
  if (pageSharedComponentIds.includes(sharedComponentId)) {
    return false;
  } else {
    // 新引用的共享组件放在最前，即渲染层级最低，不会盖住页面自有组件。
    targetPage.sharedComponentIds = [
      sharedComponentId,
      ...pageSharedComponentIds.filter(remainingId => remainingId !== sharedComponentId)
    ];
    return true;
  }
}
