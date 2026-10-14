/**
 * 天气特效的纯函数层（运行时入口）。
 *
 * 实现在 `platform/weather-settings.ts` —— 配置面板（app 层）与运行时特效都要用同一张
 * 「哪些 HA 状态有对应 3D 效果」的表，而 app ↛ runtime 是硬边界，所以事实放在 platform。
 * 这里保留同名模块只是为了让 `modules/runtime/environment/weather-settings.js`
 * 继续作为构建入口存在（清单白名单按文件生成，路径不能消失）。
 */
export { WEATHER_PREVIEWS, weatherEffectState, weatherEntityId } from "@/studio/platform/weather-settings";
