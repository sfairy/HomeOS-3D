/**
 * 运行时文档的遍历与实体依赖收集。
 */

import { selectedRelatedEntityIds } from "../../shared/related-entities.js?v=2609271508";
import { isVirtualEntityId } from "../../shared/virtual-entities.js?v=2609271508";
// 状态条目归一与小写状态文本（变更对象 / 状态对象两种形态）走 `utils/state-entry.js`。
import { resolveStateEntry, stateTextOf } from "../../utils/state-entry.js?v=2609271508";
export function lineChartRuntimeStateNeedsHydration(stateOrChange) {
  const stateObject = resolveStateEntry(stateOrChange);
  if (!stateObject) {
    return true;
  }
  const normalizedState = stateTextOf(stateObject);
  return (
    normalizedState === "" || normalizedState === "unknown" || normalizedState === "unavailable"
  );
}
export function collectEntityIds(components, entityIdSet = new Set()) {
  for (const component of components || []) {
    for (const binding of Object.values(component.bindings || {})) {
      if (binding?.entityId && !isVirtualEntityId(binding.entityId)) {
        entityIdSet.add(binding.entityId);
      }
    }
    if (component.type === "interaction3d") {
      for (const vacuum of component.properties?.devices?.vacuums || []) {
        for (const entityIdCandidate of [
          vacuum.entityId,
          vacuum.map?.entityId,
          ...(vacuum.relatedEntityIds || []),
          ...(vacuum.shortcuts || []).map(shortcut => shortcut.entityId)
        ]) {
          if (entityIdCandidate && !isVirtualEntityId(entityIdCandidate)) {
            entityIdSet.add(entityIdCandidate);
          }
        }
      }
    }
    if (component.type === "interaction3d") {
      for (const presenceSensor of component.properties?.security?.presenceSensors || []) {
        if (presenceSensor.entityId && !isVirtualEntityId(presenceSensor.entityId)) {
          entityIdSet.add(presenceSensor.entityId);
        }
      }
    }
    if (component.type === "interaction3d") {
      // 门锁绑定和「人体感应的分区传感器」是同一类：实体不在 `bindings` 里，而在
      for (const lockEntry of component.properties?.security?.locks || []) {
        for (const lockEntityField of [
          "entityId",
          "doorEntityId",
          "doorEventEntityId",
          "doorOpenEntityId",
          "doorCloseEntityId",
          "batteryEntityId",
          "lowBatteryEntityId",
          "tamperEntityId"
        ]) {
          const lockEntityId = lockEntry?.[lockEntityField];
          if (lockEntityId && !isVirtualEntityId(lockEntityId)) {
            entityIdSet.add(lockEntityId);
          }
        }
      }
    }
    if (component.type === "light-statistics") {
      for (const configuredEntityId of Array.isArray(component.properties?.entityIds)
        ? component.properties.entityIds
        : []) {
        if (configuredEntityId && !isVirtualEntityId(configuredEntityId)) {
          entityIdSet.add(String(configuredEntityId));
        }
      }
    }
    if (component.type === "weather") {
      // 天气控件总能拿到太阳实体：用户未绑定时的缺省值就是 HA 内置的 sun.sun。
      entityIdSet.add(component.bindings?.sun?.entityId || "sun.sun");
    }
    for (const action of Object.values(component.actions || {})) {
      if (
        action?.type === "more-info" &&
        action.data?.popupSource === "entity" &&
        action.data?.entityId &&
        !isVirtualEntityId(action.data.entityId)
      ) {
        entityIdSet.add(action.data.entityId);
      }
    }
    for (const relatedEntityId of selectedRelatedEntityIds(component) || []) {
      entityIdSet.add(relatedEntityId);
    }
    // 子组件与兄弟组件一样可能带绑定，必须继续下钻。
    collectEntityIds(component.children, entityIdSet);
  }
  return entityIdSet;
}
/**
 * 递归收集满足条件的组件。
 */
export function collectComponents(inputComponents, predicate, matches = []) {
  for (const currentComponent of inputComponents || []) {
    if (predicate(currentComponent)) {
      matches.push(currentComponent);
    }
    collectComponents(currentComponent.children, predicate, matches);
  }
  return matches;
}
/**
 * 找出与指定实体绑定的折线图组件。
 */
function matchingLineChartComponent(documentModel, page, entityId) {
  // 判定组件是否为「绑定了目标实体」的折线图：类型与 entityId 都要匹配。它是纯判定
  const isLineChartForEntity = candidateComponent =>
    candidateComponent.type === "line-chart" &&
    candidateComponent.bindings?.entity?.entityId === entityId;
  const directMatch = collectComponents(page?.components || [], isLineChartForEntity)[0];
  if (directMatch) {
    return directMatch;
  }
  const sharedComponentsById = new Map(
    (documentModel?.sharedComponents || []).map(sharedComponent => [
      sharedComponent.id,
      sharedComponent
    ])
  );
  // 取出当前页真正挂载的共享组件；sharedComponentIds 里可能有已删除的悬空 ID，用 filter 剔除。
  const sharedComponents = (page?.sharedComponentIds || [])
    .map(sharedComponentId => sharedComponentsById.get(sharedComponentId))
    .filter(Boolean);
  const sharedMatch = collectComponents(sharedComponents, isLineChartForEntity)[0];
  if (sharedMatch) {
    return sharedMatch;
  }
  for (const candidatePage of documentModel?.pages || []) {
    if (candidatePage === page) {
      continue;
    }
    const pageMatch = collectComponents(candidatePage.components || [], isLineChartForEntity)[0];
    if (pageMatch) {
      return pageMatch;
    }
  }
  return collectComponents(documentModel?.sharedComponents || [], isLineChartForEntity)[0] || null;
}
/**
 * 生成折线图的属性：以别处同名图表的属性为底，再被显式覆盖项压过。
 */
export function syncedLineChartProperties(
  documentSnapshot,
  currentPage,
  targetEntityId,
  overrides = {}
) {
  return {
    ...(matchingLineChartComponent(documentSnapshot, currentPage, targetEntityId)?.properties ||
      {}),
    ...(overrides || {})
  };
}
