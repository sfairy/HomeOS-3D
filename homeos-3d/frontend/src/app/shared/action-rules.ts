/**
 * 组件动作规则（Action Rule）的取值与合法性判定。
 */

type AnyObj = Record<string, any>;
import { isVirtualEntityId } from "./virtual-entities.js";
// 「按 ID 切域」只有一份实现，走 utils/entities.js 的 entityDomainFromId。
import { entityDomainFromId } from "../utils/entities.js";

// 动作类型固定三种：开关、打开更多信息、跳转页面。
export const ACTION_TYPES = Object.freeze(["toggle", "more-info", "navigate"]);

// 「更多信息」弹窗的数据来源：当前实体 / 指定实体 / 指定弹窗。
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
  "water_heater"
]);

/**
 * 读取动作配置里的弹窗来源，做白名单收敛。
 */
function actionPopupSource(action: any) {
  // 旧文档里没有 popupSource 字段，默认按「当前实体」处理，保证向后兼容。
  const popupSource = String(action?.data?.popupSource || "current");
  if (POPUP_SOURCES.includes(popupSource)) {
    return popupSource;
  } else {
    return "current";
  }
}

/**
 * 把动作配置里的弹窗相关字段归一成运行时可直接使用的结构。
 */
export function actionPopupData(actionSpec: any) {
  return {
    source: actionPopupSource(actionSpec),
    entityId: String(actionSpec?.data?.entityId || ""),
    popupId: String(actionSpec?.data?.popupId || "")
  };
}

/**
 * 判断动作是否依赖「当前组件所绑定的实体」。
 */
export function actionNeedsCurrentEntity(actionRule: any) {
  return (
    actionRule?.type === "toggle" ||
    (actionRule?.type === "more-info" && actionPopupSource(actionRule) === "current")
  );
}

/**
 * 判断给定实体 ID 是否支持 toggle 动作。
 */
export function entityIdSupportsToggle(entityId: any) {
  const normalizedEntityId = String(entityId || "");
  return (
    isVirtualEntityId(normalizedEntityId) ||
    TOGGLE_ENTITY_DOMAINS.has(entityDomainFromId(normalizedEntityId))
  );
}

/**
 * 校验组件的动作配置是否成立。
 */
export function componentActionIsSupported(
  component: any,
  actionConfig: any,
  { pagePaths: pagePaths = null, popupIds: popupIds = null }: AnyObj = {}
) {
  // presence-sensor 是只读的在场探测组件，任何动作都不挂。
  if (!ACTION_TYPES.includes(actionConfig?.type) || component?.type === "presence-sensor") {
    return false;
  }
  const boundEntityId = String(component?.bindings?.entity?.entityId || "");
  if (actionConfig.type === "toggle") {
    return entityIdSupportsToggle(boundEntityId);
  }
  if (actionConfig.type === "navigate") {
    // 目标页面必须存在；pagePaths 为 null 时只要求非空，多为编辑器加载早期。
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
  // 走到这里只剩 custom：弹窗必须存在，popupIds 为 null 时只要求填了 ID。
  const popupId = String(actionConfig.data?.popupId || "");
  return !!popupId && (!popupIds || popupIds.has(popupId));
}
