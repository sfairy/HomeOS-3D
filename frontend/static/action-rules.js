import { isVirtualEntityId } from "./virtual-entities.js?v=20260915211726";
export const ACTION_TYPES = Object.freeze(["toggle", "more-info", "navigate"]);
export const POPUP_SOURCES = Object.freeze(["current", "entity", "custom"]);
export const TOGGLE_ENTITY_DOMAINS = new Set([
  "automation",
  "button",
  "climate",
  "cover",
  "fan",
  "input_boolean",
  "light",
  "media_player",
  "remote",
  "script",
  "switch",
  "water_heater"
]);
export function actionPopupSource(action) {
  const popupSource = String(action?.data?.popupSource || "current");
  if (POPUP_SOURCES.includes(popupSource)) {
    return popupSource;
  } else {
    return "current";
  }
}
export function actionPopupData(actionSpec) {
  return {
    source: actionPopupSource(actionSpec),
    entityId: String(actionSpec?.data?.entityId || ""),
    popupId: String(actionSpec?.data?.popupId || "")
  };
}
export function actionNeedsCurrentEntity(actionRule) {
  return (
    actionRule?.type === "toggle" ||
    (actionRule?.type === "more-info" && actionPopupSource(actionRule) === "current")
  );
}
export function entityIdSupportsToggle(entityId) {
  const normalizedEntityId = String(entityId || "");
  return (
    isVirtualEntityId(normalizedEntityId) ||
    TOGGLE_ENTITY_DOMAINS.has(normalizedEntityId.split(".", 1)[0])
  );
}
export function componentActionIsSupported(
  component,
  actionConfig,
  { pagePaths: pagePaths = null, popupIds: popupIds = null } = {}
) {
  if (!ACTION_TYPES.includes(actionConfig?.type) || component?.type === "presence-sensor") {
    return false;
  }
  const boundEntityId = String(component?.bindings?.entity?.entityId || "");
  if (actionConfig.type === "toggle") {
    return entityIdSupportsToggle(boundEntityId);
  }
  if (actionConfig.type === "navigate") {
    const target = String(actionConfig.target || "");
    return !!target && (!pagePaths || pagePaths.has(target));
  }
  const resolvedPopupSource = actionPopupSource(actionConfig);
  if (resolvedPopupSource === "current") {
    return !!boundEntityId;
  }
  if (resolvedPopupSource === "entity") {
    return !!actionConfig.data?.entityId;
  }
  const popupId = String(actionConfig.data?.popupId || "");
  return !!popupId && (!popupIds || popupIds.has(popupId));
}
