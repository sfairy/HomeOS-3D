import { percentageBarSeries } from "../percentage-bar-model.js?v=20260930-percentage-text-offset-v1";
import { selectedRelatedEntityIds } from "../related-entities.js?v=20260825-bath-heater-primary-v1";
import { isVirtualEntityId } from "../virtual-entities.js?v=20260822-icon-visibility-v1";
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
export function collectEntityIds(components, entityIdSet = new Set()) {
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
    for (const relatedEntityId of selectedRelatedEntityIds(component) || [])
      entityIdSet.add(relatedEntityId);
    collectEntityIds(component.children, entityIdSet);
  }
  return entityIdSet;
}
export function collectComponents(componentList, matchesComponent, matchedComponents = []) {
  for (const childComponent of componentList || [])
    (matchesComponent(childComponent) && matchedComponents.push(childComponent),
      collectComponents(childComponent.children, matchesComponent, matchedComponents));
  return matchedComponents;
}
export function matchingLineChartComponent(runtimeDocument, activePage, targetEntityId) {
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
