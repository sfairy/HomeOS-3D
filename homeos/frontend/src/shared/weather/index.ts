/**
 * weather 域（`src/shared/`）决策面 barrel。
 *
 * 本域被下层（composables / types / 根入口）反向依赖，放 `features/` 会造成分层倒置，故落 `shared/`。
 * 粒子/画布重图不入 barrel，展示面与实现一律走深路径 `@/shared/weather/utils/*`。
 * 两层访问规则：上层消费者走本 barrel；叶子/下层（stores/constants/types/utils）走深路径。
 */

// 决策面：是否显示天气背景、以什么质量渲染（本 barrel 的全部内容）。
export { resolveWeatherQuality } from './utils/quality.util'
export { shouldShowWeatherBackground } from './utils/display-routes.util'
