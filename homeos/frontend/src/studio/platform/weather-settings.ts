/**
 * 天气特效的纯函数层：实体 ID 校验 + 实体显示名 + HA 状态 → 可渲染的天气态。
 *
 * 从 0.7.6 `static/modules/interaction3d/weather-settings.js` 语义重实现。
 * 放在 platform 而不是 `runtime/environment/weather-settings.ts`：**配置面板**
 * （`app/bridge/editor.ts` 的天气预览按钮组）与运行时特效（`runtime/environment/weather-effects.ts`）
 * 都要用同一张「哪些 HA 状态有对应 3D 效果」的表，而 app ↛ runtime 是硬边界
 * 。运行时入口
 * `runtime/environment/weather-settings.ts` 保留为再导出，构建产物与清单路径不变。
 */

/** 可预览/可渲染的天气态与中文名。顺序即预览面板的按钮顺序。 */
export const WEATHER_PREVIEWS = Object.freeze([
  ["rainy", "雨"],
  ["snowy", "雪"],
  ["lightning-rainy", "雷雨"],
  ["snowy-rainy", "雨夹雪"],
]);

/** HA 的 `pouring`（大雨）在 3D 里按普通下雨处理，不单独出效果。 */
const POURING_ALIAS = "pouring";
const POURING_STATE = "rainy";

/** 天气实体必须是 `weather.<...>`；长度上限 200 与后端 `config_sections_core` 保持一致。 */
const WEATHER_ENTITY_PATTERN = /^weather\.[a-z0-9_]{1,200}$/;

/**
 * 从场景配置的 `weather` 段取天气实体 ID。
 *
 * 非法值（缺省、域名写成了别的域、超长）一律返回空串，调用方据此判定「未绑定」。
 */
export function weatherEntityId(properties: any): string {
  const entityId = properties?.entityId;
  return typeof entityId === "string" && WEATHER_ENTITY_PATTERN.test(entityId) ? entityId : "";
}

/**
 * 读一个实体状态。状态中枢（`renderer.states`）是 `Map`，而配置草稿 / 序列化快照里
 * 是普通对象，两种形状都要能吃下 —— 否则绑定按钮就只能显示实体 ID。
 */
export function weatherEntityState(states: any, entityId: string): any {
  if (!entityId || !states) return null;
  return states instanceof Map ? states.get(entityId) : states[entityId];
}

/**
 * 天气绑定按钮的显示文案：优先 HA 实时 `friendly_name`，其次实体目录里的 `name`，
 * 最后才回落到实体 ID。
 *
 * 0.7.6 的按钮直接把 `entityId` 印在按钮上（`weather.wulumuqi`），对用户没有任何
 * 语义；这里改成显示名，ID 退到按钮的 `title`（悬停可见），排障时仍拿得到。
 */
export function weatherEntityLabel(entityId: string, entity?: any, state?: any): string {
  // 空 ID 就是「未绑定」：哪怕调用方顺手塞了实体对象，也不能把名字当成已绑定。
  if (!entityId) return "";
  const source = state?.newState || state;
  for (const candidate of [
    source?.attributes?.friendly_name,
    entity?.attributes?.friendly_name,
    entity?.name,
    entityId,
  ]) {
    const text = typeof candidate === "string" ? candidate.trim() : "";
    if (text) return text;
  }
  return "";
}

/**
 * 把 HA 的天气实体状态翻译成可渲染的天气态，无法渲染时返回空串。
 *
 * 入参既可以是状态对象，也可以是带 `newState` 的事件载荷。`available: false`
 * （实体不可用）不算天气态 —— 否则离线实体也会一直下雪。
 */
export function weatherEffectState(input: any): string {
  const source = input?.newState || input;
  if (!source || source.available === false || typeof source.state !== "string") return "";
  const state = source.state === POURING_ALIAS ? POURING_STATE : source.state;
  return WEATHER_PREVIEWS.some(([key]) => key === state) ? state : "";
}
