/**
 * weather（天气 / 天气效果）域 —— `src/shared/` 共享域。
 *
 * ## 为什么是 `shared/` 而不是 `features/`
 *
 * 本域在依赖图上是**被下层反向依赖**的，实测入边（`python3 ops/frontend_domain_classify.py --domain weather`）：
 *
 * | 消费者层 | 例子 |
 * |----------|------|
 * | `composables/` | `composables/ui/useScreensaver.ts`、`composables/life/useLifeIndices.ts`、`composables/shell/useFloatingHub.ts` |
 * | `types/` | 迁移前的 `types/weather-canvas.ts`（现已并入本域） |
 * | 根入口 | `workers/weather-particle.worker.ts` |
 *
 * 放进 `features/weather/` 会立刻造成 `composables → features` 的分层倒置。
 *
 * ## 域内分层
 *
 * - `constants/` —— 天气状态 → 视觉键 / 中文标签（`weather-labels`）
 * - `types/` —— 画布与粒子 Worker 的消息/句柄契约（`weather-canvas`）
 * - `utils/` —— 纯函数：质量决策、展示路由、日出日落、气象指标、生活指数、效果预设、
 *   粒子绘制与离屏画布
 *
 * ## 本 barrel 刻意「薄」：粒子 / 画布重图不从这里出
 *
 * `utils/{effect-presets, particle-classes, background-canvas, background-particles,
 * background-precip, particle-offscreen}` 互相引用成一张**重且互相纠缠**的图。
 * 若把它们并进 barrel，任何只想拿一个「该不该显示天气背景」判定的调用方，
 * 都会被迫把这整张图（含 Worker 入口）拉进自己的 chunk。
 *
 * 所以本 barrel 只导出**决策面** API；展示面与效果/粒子实现一律走深路径
 * `@/shared/weather/utils/...`，由真正的使用者（`components/widgets/weather/SunInfo.vue`、
 * `composables/ui/useWeatherEffectConfig.ts`、`composables/ui/useScreensaver.ts`、
 * `composables/life/useLifeIndices.ts`、`composables/ui/useWeatherBackgroundAnimation.ts`、
 * `workers/weather-particle.worker.ts`）按需深引用。
 *
 * **实测补充（本批收敛）**：迁移初期这里曾按「决策级 / 展示级」两层写，展示面那一批
 * （日出日落、气象指标、生活指数、状态标签共 25 条：22 个值 + 3 个类型）写完就发现
 * **没有任何跨域消费者从 barrel 取** —— 它们全都直连源 `utils/*`，因为那正是本域
 * 「避免拖重图」的既定做法。于是整批删除，本 barrel 现在只剩 2 条决策面导出。
 * 判定口径是 `bun run knip`：`export` 无人 import 即报错，归位批次收尾必跑 ——
 * 别靠「文档说要出展示面」来维护接口表。
 *
 * ## 两层访问规则
 *
 * - **上层消费者**（`views` / `layouts` / `features` / `components` / `composables`）→ 可走本 barrel
 * - **叶子 / 下层消费者**（`stores` / `constants` / `types` / `utils` / `shared/utils`）→ 必须走深路径
 *
 * 依赖 store 的天气组合式逻辑**不在此处**，留在 `@/composables/{ui,entity}/useWeather*.ts` 与
 * `composables/entity/useWeatherEntity.ts` —— `shared/` 不允许反向依赖 `stores/`。
 */

// ── 决策面：是否显示背景、以什么质量渲染 ──
// 这是本 barrel 的**全部**内容（理由见上「实测补充」）。
export { resolveWeatherQuality } from './utils/quality.util'
export { shouldShowWeatherBackground } from './utils/display-routes.util'

// ── 展示面 / 实现面：一律深路径 `@/shared/weather/utils/*` ──
// 已收敛的 25 条导出（22 个值 + 3 个类型）及其真实消费者（全部直连源模块，不经 barrel）：
//   日出日落 / 昼夜相位   → `utils/sun-times.util`（`components/widgets/weather/SunInfo.vue`、`composables/ui/useWeatherEffectConfig.ts`）
//   气象指标（体感/AQI/风速）→ `utils/weather-metric.util`（`components/widgets/weather/Widget.vue`、`composables/ui/useScreensaver.ts`、`composables/shell/useFloatingHub.ts`）
//   生活指数 / 天气站 / 预警 → `utils/life-indices.util`（`components/widgets/weather/LifeIndices.vue`、`composables/life/useLifeIndices.ts`）
//   展示路由分组          → `utils/display-routes.util`（`features/settings/composables/hub-backup-orchestrator.internals.ts`）
//   状态 → 视觉键 / 标签   → `constants/weather-labels`（`components/widgets/weather/{Forecast,Widget}.vue`、`composables/ui/useMainLayoutWeatherNav.ts`、`composables/ui/useScreensaver.ts`）
