/**
 * 控件注册表与内置控件渲染器的**唯一入口**（barrel）。
 *
 * 实现已按职责拆进 `registry/`：`registry-core.js` 持有唯一的 `componentsByType`，
 * `components/<类型>.js` 各自注册一个控件类型，其余分片按域拆开。本文件只负责
 * 「引入全部分片（注册是 import 副作用）+ 保持原有导出名不变」，勿在此再写实现。
 *
 * 约定：与 home.js、renderer.js 共用同一条 `registry.js?v=` 版本戳，分片之间也必须同戳，
 * 否则同一模块会被当成两份分别求值、出现两份互不相认的 `componentsByType`。
 */
// 注册是 import 副作用：漏一个分片，对应控件类型会静默变成「控件尚未实现」；
// tools/check_registry_split.mjs 核对分片都被引入，tools/smoke_registry.mjs 带 DOM 桩
// 真实加载一遍、逐个类型确认注册成功。公开导出名与顺序保持拆分前不变。
import "./registry/components/air-conditioner.js?v=20260921090405";
import "./registry/components/camera.js?v=20260921090405";
import "./registry/components/date.js?v=20260921090405";
import "./registry/components/floorplan-auto-diagram.js?v=20260921090405";
import "./registry/components/icon-button.js?v=20260921090405";
import "./registry/components/icon-button-effect.js?v=20260921090405";
import "./registry/components/image.js?v=20260921090405";
import "./registry/components/interaction3d.js?v=20260921090405";
import "./registry/components/light-statistics.js?v=20260921090405";
import "./registry/components/line-chart.js?v=20260921090405";
import "./registry/components/navigation-button.js?v=20260921090405";
import "./registry/components/panel-frame.js?v=20260921090405";
import "./registry/components/presence-sensor.js?v=20260921090405";
import "./registry/components/time.js?v=20260921090405";
import "./registry/components/title-button.js?v=20260921090405";
import "./registry/components/vacuum-map.js?v=20260921090405";
import "./registry/components/weather.js?v=20260921090405";

// 分片：airflow
export {
  renderAirConditionerAirflowLayer
} from "./registry/airflow.js?v=20260921090405";
// 分片：builtin-assets
export {
  setBuiltinAssetVersions,
  staticAssetImageSource,
  vacuumMapImageSource
} from "./registry/builtin-assets.js?v=20260921090405";
// 分片：camera
export {
  appendCameraFrame,
  cameraRadiusRatio,
  mountCameraMedia,
  mountCameraSnapshot,
  prewarmCameraMedia
} from "./registry/camera.js?v=20260921090405";
// 分片：cover-state
export {
  COVER_CLOSED_POSITION_EPSILON,
  coverComponentIsActive,
  coverComponentIsDream
} from "./registry/cover-state.js?v=20260921090405";
// 分片：effect-visuals
export {
  ICON_BUTTON_EFFECT_BASE_TEMPERATURE_KELVIN,
  iconButtonEffectLightVisualAwaiting,
  iconButtonEffectLightVisualState,
  renderIconButtonEffectLayer
} from "./registry/effect-visuals.js?v=20260921090405";
// 分片：entity-state
export {
  formatEntityState
} from "./registry/entity-state.js?v=20260921090405";
// 分片：history-chart
export {
  renderLineChartDetails
} from "./registry/history-chart.js?v=20260921090405";
// 分片：navigation-effects
export {
  navigationButtonIsActive
} from "./registry/navigation-effects.js?v=20260921090405";
// 分片：registry-core
export {
  registerComponent,
  renderRegisteredComponent
} from "./registry/registry-core.js?v=20260921090405";
// 分片：registry-visuals
export {
  componentContentUnitsPx,
  navigationContentUnitPx
} from "./registry/registry-visuals.js?v=20260921090405";

// ── 各 runtime 纯函数的统一再导出（原样保留）──
import {
  lightStatisticsEntityStateStatus,
  lightStatisticsEntitySupport,
  lightStatisticsSummary
} from "../controls/light-statistics-runtime.js?v=20260921090405";
import {
  automaticNumericPrecision,
  formatLineChartValue,
  formatNumericValue,
  lineChartGeometry,
  normalizedStatePrecision
} from "../controls/line-chart-runtime.js?v=20260921090405";
import {
  doorWindowPerspectiveCorners,
  doorWindowPerspectiveMatrix
} from "../controls/door-window-runtime.js?v=20260921090405";
import {
  automaticThresholds,
  meteoconUrl,
  normalizedThresholds,
  resolvedThresholds,
  smoothChartPath,
  thresholdColor,
  weatherVisual
} from "../controls/weather-chart-runtime.js?v=20260921090405";
import {
  formatLocalDate,
  formatLocalTime,
  formatLunarDate
} from "../controls/date-time-runtime.js?v=20260921090405";
// 统一再导出各 runtime 的纯函数：页面脚本只 import registry.js 一处即可，
// 也保证注册表与这些工具用的是同一份模块实例（版本戳不一致会出现两份）。
export {
  lightStatisticsEntityStateStatus as lightStatisticsEntityStateStatus,
  lightStatisticsEntitySupport as lightStatisticsEntitySupport,
  lightStatisticsSummary as lightStatisticsSummary,
  automaticNumericPrecision as automaticNumericPrecision,
  formatLineChartValue as formatLineChartValue,
  formatNumericValue as formatNumericValue,
  lineChartGeometry as lineChartGeometry,
  normalizedStatePrecision as normalizedStatePrecision,
  doorWindowPerspectiveCorners as doorWindowPerspectiveCorners,
  doorWindowPerspectiveMatrix as doorWindowPerspectiveMatrix,
  meteoconUrl as meteoconUrl,
  automaticThresholds as automaticThresholds,
  normalizedThresholds as normalizedThresholds,
  resolvedThresholds as resolvedThresholds,
  smoothChartPath as smoothChartPath,
  thresholdColor as thresholdColor,
  weatherVisual as weatherVisual,
  formatLocalDate as formatLocalDate,
  formatLocalTime as formatLocalTime,
  formatLunarDate as formatLunarDate
};
import {
  formatPresenceDuration,
  presenceAnimationPhase,
  presenceHistoryBuckets,
  presenceMotionEventConfig,
  presenceSensorPresentation,
  presenceStateTimestamp
} from "../controls/presence-runtime.js?v=20260921090405";
export {
  formatPresenceDuration as formatPresenceDuration,
  presenceAnimationPhase as presenceAnimationPhase,
  presenceHistoryBuckets as presenceHistoryBuckets,
  presenceMotionEventConfig as presenceMotionEventConfig,
  presenceSensorPresentation as presenceSensorPresentation,
  presenceStateTimestamp as presenceStateTimestamp
};
