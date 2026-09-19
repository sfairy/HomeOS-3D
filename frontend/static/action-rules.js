/**
 * 组件动作规则（Action Rule）的取值与合法性判定。
 *
 * 位置：编辑器「动作」检查器与展示页运行时共用的一份纯逻辑模块。
 * 职责：定义动作类型 / 弹窗来源 / 可开关实体域的允许取值，并提供动作配置
 *   与组件绑定是否匹配的校验。
 * 约定：本模块不碰 DOM，也不请求后端；校验所需的页面路径集合、弹窗 ID 集合
 *   由调用方（编辑器）以集合形式传入，传入 null 表示「暂不校验该维度」。
 */
import { isVirtualEntityId } from "./virtual-entities.js?v=20260919214245";
// 「按 ID 切域」只有一份实现（P12 收口 B 类末尾那一项的残留补齐）：本文件原先把域前缀
// 的切法直接写在 `entityIdSupportsToggle` 里。输入已经过 `String(entityId || "")` 守卫，
// 所以换成助手语义一字未变，只是把这份知识收回到 utils/entities.js。
import { entityDomainFromId } from "./utils/entities.js?v=20260919214245";

// 动作类型固定三种：开关、打开更多信息、跳转页面。
export const ACTION_TYPES = Object.freeze(["toggle", "more-info", "navigate"]);

// 「更多信息」弹窗的数据来源：当前实体 / 指定实体 / 指定弹窗。
export const POPUP_SOURCES = Object.freeze(["current", "entity", "custom"]);

// 这些 HA 域里的实体调用 toggle 才有意义；虚拟实体单独放行（见下方判定）。
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
 *
 * @param {object} action 动作配置，允许为空。
 * @returns {string} "current" / "entity" / "custom" 之一。
 */
export function actionPopupSource(action) {
  // 旧文档里没有 popupSource 字段，默认按「当前实体」处理，保证向后兼容。
  const popupSource = String(action?.data?.popupSource || "current");
  if (POPUP_SOURCES.includes(popupSource)) {
    return popupSource;
  } else {
    // 出现未知取值时统一回退，避免把脏数据带进运行时。
    return "current";
  }
}

/**
 * 把动作配置里的弹窗相关字段归一成运行时可直接使用的结构。
 *
 * @param {object} actionSpec 动作配置。
 * @returns {{source: string, entityId: string, popupId: string}} 弹窗来源与目标 ID。
 */
export function actionPopupData(actionSpec) {
  return {
    source: actionPopupSource(actionSpec),
    entityId: String(actionSpec?.data?.entityId || ""),
    popupId: String(actionSpec?.data?.popupId || "")
  };
}

/**
 * 判断动作是否依赖「当前组件所绑定的实体」。
 *
 * @param {object} actionRule 动作配置。
 * @returns {boolean} 需要当前绑定实体时为 true。
 */
export function actionNeedsCurrentEntity(actionRule) {
  return (
    actionRule?.type === "toggle" ||
    (actionRule?.type === "more-info" && actionPopupSource(actionRule) === "current")
  );
}

/**
 * 判断给定实体 ID 是否支持 toggle 动作。
 *
 * @param {string} entityId 实体 ID，形如 light.kitchen 或虚拟实体 ID。
 * @returns {boolean} 支持开关时为 true。
 */
export function entityIdSupportsToggle(entityId) {
  const normalizedEntityId = String(entityId || "");
  // 域前缀统一走 utils/entities.js 的 entityDomainFromId；实体名里再出现点号也不会干扰判断。
  return (
    isVirtualEntityId(normalizedEntityId) ||
    TOGGLE_ENTITY_DOMAINS.has(entityDomainFromId(normalizedEntityId))
  );
}

/**
 * 校验组件的动作配置是否成立。
 *
 * @param {object} component 组件文档，读取其 bindings.entity.entityId。
 * @param {object} actionConfig 动作配置。
 * @param {object} [options] 可选的校验上下文。
 * @param {Set<string>|null} [options.pagePaths] 已存在的页面路径集合；null 表示跳过校验。
 * @param {Set<string>|null} [options.popupIds] 已存在的弹窗 ID 集合；null 表示跳过校验。
 * @returns {boolean} 动作合法时为 true。
 */
export function componentActionIsSupported(
  component,
  actionConfig,
  { pagePaths: pagePaths = null, popupIds: popupIds = null } = {}
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
