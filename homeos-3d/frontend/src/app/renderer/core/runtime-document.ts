import { percentageBarSeries } from "../../shared/percentage-bar-model";
import { selectedRelatedEntityIds } from "../../shared/related-entities";
import { isVirtualEntityId } from "../../shared/virtual-entities";
/**
 * 运行期组件的最小可用形状：只描述本文件真正读到的字段，
 * 具体页面组件的完整定义在别处（这里刻意保持宽松）。
 */
type RuntimeComponentLike = {
  /** 组件实例 id（视图事件按它派发）。 */
  id?: string;
  type?: string;
  /** 数据绑定：绑定名 → { entityId, ... }。 */
  bindings?: Record<string, any>;
  /** 动作配置：动作名 → { type, data }。 */
  actions?: Record<string, any>;
  /** 组件属性（设备清单、实体列表等）。 */
  properties?: any;
  /** 子组件。 */
  children?: RuntimeComponentLike[];
};

export function lineChartRuntimeStateNeedsHydration(runtimeState) {
  const resolvedState = runtimeState?.newState || runtimeState;
  if (!resolvedState) return true;
  const normalizedState = String(resolvedState.state ?? "")
    .trim()
    .toLowerCase();
  return (
    normalizedState === "" || normalizedState === "unknown" || normalizedState === "unavailable"
  );
}
export function collectEntityIds(
  components: RuntimeComponentLike[] | null,
  entityIdSet: Set<string> = new Set<string>(),
) {
  for (const component of components || []) {
    for (const binding of Object.values(component.bindings || {}))
      binding?.entityId &&
        !isVirtualEntityId(binding.entityId) &&
        entityIdSet.add(binding.entityId);
    if (component.type === "interaction3d") {
      for (const vacuumDevice of component.properties?.devices?.vacuums || [])
        for (const vacuumEntityId of [
          vacuumDevice.entityId,
          vacuumDevice.map?.entityId,
          ...(vacuumDevice.relatedEntityIds || []),
          ...(vacuumDevice.shortcuts || []).map((shortcut) => shortcut.entityId),
        ])
          vacuumEntityId && !isVirtualEntityId(vacuumEntityId) && entityIdSet.add(vacuumEntityId);
    }
    if (component.type === "interaction3d") {
      for (const presenceSensor of component.properties?.security?.presenceSensors || [])
        presenceSensor.entityId &&
          !isVirtualEntityId(presenceSensor.entityId) &&
          entityIdSet.add(presenceSensor.entityId);
    }
    if (component.type === "light-statistics") {
      for (const statisticsEntityId of Array.isArray(component.properties?.entityIds)
        ? component.properties.entityIds
        : [])
        statisticsEntityId &&
          !isVirtualEntityId(statisticsEntityId) &&
          entityIdSet.add(String(statisticsEntityId));
    }
    if (component.type === "percentage-bar") {
      for (const { entityId: seriesEntityId } of percentageBarSeries(component))
        seriesEntityId &&
          !isVirtualEntityId(seriesEntityId) &&
          entityIdSet.add(String(seriesEntityId));
    }
    component.type === "weather" && entityIdSet.add(component.bindings?.sun?.entityId || "sun.sun");
    for (const actionConfig of Object.values(component.actions || {}))
      actionConfig?.type === "more-info" &&
        actionConfig.data?.popupSource === "entity" &&
        actionConfig.data?.entityId &&
        !isVirtualEntityId(actionConfig.data.entityId) &&
        entityIdSet.add(actionConfig.data.entityId);
    for (const relatedEntityId of (selectedRelatedEntityIds(component) || []) as string[])
      entityIdSet.add(relatedEntityId);
    collectEntityIds(component.children, entityIdSet);
  }
  return entityIdSet;
}
export function collectComponents(
  componentList: RuntimeComponentLike[] | null,
  matchesComponent: (component: RuntimeComponentLike) => boolean,
  matchedComponents: RuntimeComponentLike[] = [],
) {
  for (const childComponent of componentList || [])
    (matchesComponent(childComponent) && matchedComponents.push(childComponent),
      collectComponents(childComponent.children, matchesComponent, matchedComponents));
  return matchedComponents;
}
function matchingLineChartComponent(runtimeDocument, activePage, targetEntityId) {
  const matchesTargetComponent = (candidateComponent) =>
      candidateComponent.type === "line-chart" &&
      candidateComponent.bindings?.entity?.entityId === targetEntityId,
    matchedPageComponent = collectComponents(
      activePage?.components || [],
      matchesTargetComponent,
    )[0];
  if (matchedPageComponent) return matchedPageComponent;
  const sharedComponentsById = new Map(
      (runtimeDocument?.sharedComponents || []).map((sharedComponent) => [
        sharedComponent.id,
        sharedComponent,
      ]),
    ),
    sharedComponentList = (activePage?.sharedComponentIds || [])
      .map((sharedComponentId) => sharedComponentsById.get(sharedComponentId))
      .filter(Boolean),
    matchedSharedComponent = collectComponents(sharedComponentList, matchesTargetComponent)[0];
  if (matchedSharedComponent) return matchedSharedComponent;
  for (const otherPage of runtimeDocument?.pages || []) {
    if (otherPage === activePage) continue;
    const matchedOtherPageComponent = collectComponents(
      otherPage.components || [],
      matchesTargetComponent,
    )[0];
    if (matchedOtherPageComponent) return matchedOtherPageComponent;
  }
  return (
    collectComponents(runtimeDocument?.sharedComponents || [], matchesTargetComponent)[0] || null
  );
}
export function syncedLineChartProperties(
  sourceDocument,
  sourcePage,
  sourceEntityId,
  propertyOverrides = {},
) {
  return {
    ...(matchingLineChartComponent(sourceDocument, sourcePage, sourceEntityId)?.properties || {}),
    ...(propertyOverrides || {}),
  };
}
