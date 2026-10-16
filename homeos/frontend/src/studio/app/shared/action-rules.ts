import { isVirtualEntityId } from "./virtual-entities";
export const ACTION_TYPES = Object.freeze(["toggle", "more-info", "navigate"]);
const POPUP_SOURCES = Object.freeze(["current", "entity", "custom"]);
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
    "water_heater",
  ]);
function actionPopupSource(sourceAction: any) {
  const sourceName = String(sourceAction?.data?.popupSource || "current");
  return POPUP_SOURCES.includes(sourceName) ? sourceName : "current";
}
export function actionPopupData(popupAction: any) {
  return {
    source: actionPopupSource(popupAction),
    entityId: String(popupAction?.data?.entityId || ""),
    popupId: String(popupAction?.data?.popupId || ""),
  };
}
export function actionNeedsCurrentEntity(toggleAction: any) {
  return (
    toggleAction?.type === "toggle" ||
    (toggleAction?.type === "more-info" && actionPopupSource(toggleAction) === "current")
  );
}
export function entityIdSupportsToggle(entityId: any) {
  const entityText = String(entityId || "");
  return isVirtualEntityId(entityText) || TOGGLE_ENTITY_DOMAINS.has(entityText.split(".", 1)[0]);
}
/**
 * 组件是否配了 go2rtc 摄像头来源。
 *
 * 这类摄像机可以完全不绑 HA 实体，靠 `properties.go2rtcUrl` 出画，所以「有没有当前实体」
 * 的旧判据（只看 `bindings.entity.entityId`）会把它们的弹窗动作误判为不支持。
 */
function componentHasGo2rtcCameraSource(component: any) {
  return (
    component?.properties?.cameraSource === "go2rtc" &&
    !!String(component?.properties?.go2rtcUrl || "").trim()
  );
}
export function componentActionIsSupported(
  component: any,
  action: any,
  { pagePaths: allowedPagePaths = null, popupIds: allowedPopupIds = null }: any = {},
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
  if (popupSource === "current")
    return !!targetEntityId || componentHasGo2rtcCameraSource(component);
  if (popupSource === "entity") return !!action.data?.entityId;
  const popupId = String(action.data?.popupId || "");
  return !!popupId && (!allowedPopupIds || allowedPopupIds.has(popupId));
}
