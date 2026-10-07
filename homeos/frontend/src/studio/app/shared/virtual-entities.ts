const VIRTUAL_ENTITY_PREFIX = "virtual.",
  ICON_VISIBILITY_VIRTUAL_NAME = "图标·显示隐藏",
  ICON_VISIBILITY_VIRTUAL_SCOPE = "current_page";
export const ICON_VISIBILITY_VIRTUAL_KIND = "icon_visibility";
function iconVisibilityVirtualEntityId() {
  return (
    "" + VIRTUAL_ENTITY_PREFIX + ICON_VISIBILITY_VIRTUAL_KIND + "." + ICON_VISIBILITY_VIRTUAL_SCOPE
  );
}
export function parseVirtualEntityId(entityId: any) {
  const text = String(entityId || "");
  if (!text.startsWith(VIRTUAL_ENTITY_PREFIX)) return null;
  const separatorIndex = text.indexOf(".", VIRTUAL_ENTITY_PREFIX.length);
  if (separatorIndex < 0) return null;
  const kind = text.slice(VIRTUAL_ENTITY_PREFIX.length, separatorIndex),
    scope = text.slice(separatorIndex + 1);
  return kind && scope
    ? {
        kind: kind,
        scope: scope,
      }
    : null;
}
export function isVirtualEntityId(candidateId: any) {
  return !!parseVirtualEntityId(candidateId);
}
export function createIconVisibilityVirtualEntity(pagePath = "") {
  return {
    entityId: iconVisibilityVirtualEntityId(),
    domain: "virtual",
    name: ICON_VISIBILITY_VIRTUAL_NAME,
    originalName: ICON_VISIBILITY_VIRTUAL_NAME,
    virtual: true,
    virtualKind: ICON_VISIBILITY_VIRTUAL_KIND,
    pagePath: String(pagePath || ""),
  };
}
