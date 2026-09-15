import { selectedRelatedEntityIds } from "../related-entities.js?v=20260915211726";
import { isVirtualEntityId } from "../virtual-entities.js?v=20260915211726";
export function lineChartRuntimeStateNeedsHydration(stateOrChange) {
  const stateObject = stateOrChange?.newState || stateOrChange;
  if (!stateObject) {
    return true;
  }
  const normalizedState = String(stateObject.state ?? "")
    .trim()
    .toLowerCase();
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
    collectEntityIds(component.children, entityIdSet);
  }
  return entityIdSet;
}
export function collectComponents(inputComponents, predicate, matches = []) {
  for (const currentComponent of inputComponents || []) {
    if (predicate(currentComponent)) {
      matches.push(currentComponent);
    }
    collectComponents(currentComponent.children, predicate, matches);
  }
  return matches;
}
export function matchingLineChartComponent(documentModel, page, entityId) {
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
