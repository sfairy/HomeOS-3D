import { isVirtualEntityId } from "./virtual-entities";
export const ACTION_TYPES = Object.freeze(["toggle", "more-info", "navigate"]),
  POPUP_SOURCES = Object.freeze(["current", "entity", "custom"]),
  TOGGLE_ENTITY_DOMAINS = new Set([
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
    "water_heater",
  ]);
function actionPopupSource(sourceAction) {
  const sourceName = String(sourceAction?.data?.popupSource || "current");
  return POPUP_SOURCES.includes(sourceName) ? sourceName : "current";
}
export function actionPopupData(popupAction) {
  return {
    source: actionPopupSource(popupAction),
    entityId: String(popupAction?.data?.entityId || ""),
    popupId: String(popupAction?.data?.popupId || ""),
  };
}
export function actionNeedsCurrentEntity(toggleAction) {
  return (
    toggleAction?.type === "toggle" ||
    (toggleAction?.type === "more-info" && actionPopupSource(toggleAction) === "current")
  );
}
export function entityIdSupportsToggle(entityId) {
  const entityText = String(entityId || "");
  return isVirtualEntityId(entityText) || TOGGLE_ENTITY_DOMAINS.has(entityText.split(".", 1)[0]);
}
export function componentActionIsSupported(
  component,
  action,
  { pagePaths: allowedPagePaths = null, popupIds: allowedPopupIds = null } = {},
) {
  if (
    !ACTION_TYPES.includes(action?.type) ||
    ["presence-sensor", "flow-line", "percentage-bar"].includes(component?.type)
  )
    return false;
  const targetEntityId = String(component?.bindings?.entity?.entityId || "");
  if (action.type === "toggle") return entityIdSupportsToggle(targetEntityId);
  if (action.type === "navigate") {
    const targetPath = String(action.target || "");
    return !!targetPath && (!allowedPagePaths || allowedPagePaths.has(targetPath));
  }
  const popupSource = actionPopupSource(action);
  if (popupSource === "current") return !!targetEntityId;
  if (popupSource === "entity") return !!action.data?.entityId;
  const popupId = String(action.data?.popupId || "");
  return !!popupId && (!allowedPopupIds || allowedPopupIds.has(popupId));
}
