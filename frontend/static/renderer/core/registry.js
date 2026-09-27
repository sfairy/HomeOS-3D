/**
 * 控件注册表与内置控件渲染器的**唯一入口**（barrel）。
 */
// 注册是 import 副作用：漏一个分片，对应控件类型会静默变成「控件尚未实现」；
import "./registry/components/air-conditioner.js?v=2609271508";
import "./registry/components/camera.js?v=2609271508";
import "./registry/components/date.js?v=2609271508";
import "./registry/components/floorplan-auto-diagram.js?v=2609271508";
import "./registry/components/icon-button.js?v=2609271508";
import "./registry/components/icon-button-effect.js?v=2609271508";
import "./registry/components/image.js?v=2609271508";
import "./registry/components/interaction3d.js?v=2609271508";
import "./registry/components/light-statistics.js?v=2609271508";
import "./registry/components/line-chart.js?v=2609271508";
import "./registry/components/navigation-button.js?v=2609271508";
import "./registry/components/panel-frame.js?v=2609271508";
import "./registry/components/presence-sensor.js?v=2609271508";
import "./registry/components/time.js?v=2609271508";
import "./registry/components/title-button.js?v=2609271508";
import "./registry/components/vacuum-map.js?v=2609271508";
import "./registry/components/weather.js?v=2609271508";

// 分片：airflow
export {
  renderAirConditionerAirflowLayer
} from "./registry/airflow.js?v=2609271508";
// 分片：builtin-assets
export {
  setBuiltinAssetVersions,
  staticAssetImageSource,
  vacuumMapImageSource
} from "./registry/builtin-assets.js?v=2609271508";
// 分片：camera
export {
  mountCameraMedia,
  prewarmCameraMedia
} from "./registry/camera.js?v=2609271508";
// 分片：cover-state
export {
  COVER_POSITION_EPSILON_PERCENT,
  coverComponentIsDream
} from "./registry/cover-state.js?v=2609271508";
// 分片：effect-visuals
export {
  iconButtonEffectLightVisualAwaiting,
  iconButtonEffectLightVisualState,
  renderIconButtonEffectLayer
} from "./registry/effect-visuals.js?v=2609271508";
export {
  renderLineChartDetails
} from "./registry/history-chart.js?v=2609271508";
// 分片：registry-core
export {
  renderRegisteredComponent
} from "./registry/registry-core.js?v=2609271508";

// ── 各 runtime 纯函数的统一再导出（原样保留）──
import {
  lightStatisticsEntityStateStatus,
  lightStatisticsEntitySupport
} from "../controls/light-statistics-runtime.js?v=2609271508";
import { formatLineChartValue } from "../controls/line-chart-runtime.js?v=2609271508";
import {
  doorWindowPerspectiveCorners,
  doorWindowPerspectiveMatrix
} from "../controls/door-window-runtime.js?v=2609271508";
// 统一再导出下面这几个 runtime 纯函数：页面脚本从 registry.js 一处取用，
export {
  lightStatisticsEntityStateStatus as lightStatisticsEntityStateStatus,
  lightStatisticsEntitySupport as lightStatisticsEntitySupport,
  formatLineChartValue as formatLineChartValue,
  doorWindowPerspectiveCorners as doorWindowPerspectiveCorners,
  doorWindowPerspectiveMatrix as doorWindowPerspectiveMatrix
};
import {
  formatPresenceDuration,
  presenceHistoryBuckets,
  presenceMotionEventConfig,
  presenceSensorPresentation,
  presenceStateTimestamp
} from "../controls/presence-runtime.js?v=2609271508";
export {
  formatPresenceDuration as formatPresenceDuration,
  presenceHistoryBuckets as presenceHistoryBuckets,
  presenceMotionEventConfig as presenceMotionEventConfig,
  presenceSensorPresentation as presenceSensorPresentation,
  presenceStateTimestamp as presenceStateTimestamp
};
