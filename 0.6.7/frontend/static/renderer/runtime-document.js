import { percentageBarSeries } from "../percentage-bar-model.js?v=20260930-percentage-text-offset-v1";
import { selectedRelatedEntityIds } from "../related-entities.js?v=20260825-bath-heater-primary-v1";
import { isVirtualEntityId } from "../virtual-entities.js?v=20260822-icon-visibility-v1";
export function lineChartRuntimeStateNeedsHydration(arg1) {
  const value1 = arg1?.newState || arg1;
  if (!value1) return true;
  const value2 = String(value1.state ?? "")
    .trim()
    .toLowerCase();
  return value2 === "" || value2 === "unknown" || value2 === "unavailable";
}
export function collectEntityIds(arg2, arg3 = new Set()) {
  for (const value3 of arg2 || []) {
    for (const value4 of Object.values(value3.bindings || {}))
      value4?.entityId && !isVirtualEntityId(value4.entityId) && arg3.add(value4.entityId);
    if (value3.type === "interaction3d") {
      for (const value5 of value3.properties?.devices?.vacuums || [])
        for (const value6 of [
          value5.entityId,
          value5.map?.entityId,
          ...(value5.relatedEntityIds || []),
          ...(value5.shortcuts || []).map((arg4) => arg4.entityId),
        ])
          value6 && !isVirtualEntityId(value6) && arg3.add(value6);
    }
    if (value3.type === "interaction3d") {
      for (const value7 of value3.properties?.security?.presenceSensors || [])
        value7.entityId && !isVirtualEntityId(value7.entityId) && arg3.add(value7.entityId);
    }
    if (value3.type === "light-statistics") {
      for (const value8 of Array.isArray(value3.properties?.entityIds)
        ? value3.properties.entityIds
        : [])
        value8 && !isVirtualEntityId(value8) && arg3.add(String(value8));
    }
    if (value3.type === "percentage-bar") {
      for (const { entityId: value9 } of percentageBarSeries(value3))
        value9 && !isVirtualEntityId(value9) && arg3.add(String(value9));
    }
    value3.type === "weather" && arg3.add(value3.bindings?.sun?.entityId || "sun.sun");
    for (const value10 of Object.values(value3.actions || {}))
      value10?.type === "more-info" &&
        value10.data?.popupSource === "entity" &&
        value10.data?.entityId &&
        !isVirtualEntityId(value10.data.entityId) &&
        arg3.add(value10.data.entityId);
    for (const value11 of selectedRelatedEntityIds(value3) || []) arg3.add(value11);
    collectEntityIds(value3.children, arg3);
  }
  return arg3;
}
export function collectComponents(arg5, arg6, arg7 = []) {
  for (const value12 of arg5 || [])
    (arg6(value12) && arg7.push(value12), collectComponents(value12.children, arg6, arg7));
  return arg7;
}
export function matchingLineChartComponent(arg8, arg9, arg10) {
  const fn1 = (arg11) => arg11.type === "line-chart" && arg11.bindings?.entity?.entityId === arg10,
    value13 = collectComponents(arg9?.components || [], fn1)[0];
  if (value13) return value13;
  const map1 = new Map((arg8?.sharedComponents || []).map((arg12) => [arg12.id, arg12])),
    value14 = (arg9?.sharedComponentIds || []).map((arg13) => map1.get(arg13)).filter(Boolean),
    value15 = collectComponents(value14, fn1)[0];
  if (value15) return value15;
  for (const value16 of arg8?.pages || []) {
    if (value16 === arg9) continue;
    const value17 = collectComponents(value16.components || [], fn1)[0];
    if (value17) return value17;
  }
  return collectComponents(arg8?.sharedComponents || [], fn1)[0] || null;
}
export function syncedLineChartProperties(arg14, arg15, arg16, arg17 = {}) {
  return {
    ...(matchingLineChartComponent(arg14, arg15, arg16)?.properties || {}),
    ...(arg17 || {}),
  };
}
