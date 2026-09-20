/**
 * 虚拟实体的 ID 生成与解析规则。
 *
 * 位置：编辑器实体选择器与展示页运行时共用的纯逻辑模块。
 * 职责：定义 virtual.<kind>.<scope> 形式的虚拟实体 ID，并产出「图标·显示隐藏」
 *   这类由前端合成、并不存在于 HA 的实体。
 * 约定：虚拟实体没有对应 HA 设备；其 ID 必须能被 parseVirtualEntityId 还原出
 *   kind 与 scope，展示页据此走本地逻辑而不是调用 HA 服务。
 */
export const VIRTUAL_ENTITY_PREFIX = "virtual.";
export const ICON_VISIBILITY_VIRTUAL_KIND = "icon_visibility";
export const ICON_VISIBILITY_VIRTUAL_NAME = "图标·显示隐藏";
// scope 固定为当前页面：图标显隐状态按页维护，不跨页共享。
export const ICON_VISIBILITY_VIRTUAL_SCOPE = "current_page";

/**
 * 生成图标显隐虚拟实体的 ID。
 */
export function iconVisibilityVirtualEntityId() {
  return (
    "" + VIRTUAL_ENTITY_PREFIX + ICON_VISIBILITY_VIRTUAL_KIND + "." + ICON_VISIBILITY_VIRTUAL_SCOPE
  );
}

/**
 * 解析虚拟实体 ID。
 */
export function parseVirtualEntityId(entityId) {
  const entityIdString = String(entityId || "");
  if (!entityIdString.startsWith(VIRTUAL_ENTITY_PREFIX)) {
    return null;
  }
  // 只在前缀之后找第一个点号，scope 里允许再出现点号。
  const separatorIndex = entityIdString.indexOf(".", VIRTUAL_ENTITY_PREFIX.length);
  if (separatorIndex < 0) {
    return null;
  }
  const kind = entityIdString.slice(VIRTUAL_ENTITY_PREFIX.length, separatorIndex);
  const scope = entityIdString.slice(separatorIndex + 1);
  if (kind && scope) {
    return {
      kind: kind,
      scope: scope
    };
  } else {
    // 缺 kind 或 scope 都算非法，防止空串被当成合法虚拟实体。
    return null;
  }
}

/**
 * 判断是否为合法的虚拟实体 ID。
 */
export function isVirtualEntityId(candidateEntityId) {
  return !!parseVirtualEntityId(candidateEntityId);
}

/**
 * 构造一个「图标·显示隐藏」虚拟实体，供实体选择器展示与绑定。
 */
export function createIconVisibilityVirtualEntity(pagePath = "") {
  // virtual 标记让下游跳过 HA 调用；virtualKind 供运行时区分具体虚拟实体。
  return {
    entityId: iconVisibilityVirtualEntityId(),
    domain: "virtual",
    name: ICON_VISIBILITY_VIRTUAL_NAME,
    originalName: ICON_VISIBILITY_VIRTUAL_NAME,
    virtual: true,
    virtualKind: ICON_VISIBILITY_VIRTUAL_KIND,
    pagePath: String(pagePath || "")
  };
}
