/**
 * 控件注册表与内置控件渲染器的**唯一入口**（barrel）。
 *
 * 实现已按职责拆进 `registry/`：`registry-core.js` 持有唯一的 `componentsByType`，
 * `components/<类型>.js` 各自注册一个控件类型，其余分片按域拆开。本文件只负责
 * 「引入全部分片（注册是 import 副作用）+ 转发页面脚本真正用到的导出名」，勿在此再写实现。
 *
 * 约定：与 home.js、renderer.js 共用同一条 `registry.js?v=` 版本戳，分片之间也必须同戳，
 * 否则同一模块会被当成两份分别求值、出现两份互不相认的 `componentsByType`。
 */
// 注册是 import 副作用：漏一个分片，对应控件类型会静默变成「控件尚未实现」；
// tools/check_registry_split.mjs 核对分片都被引入。这里只转出确有消费方的导出名：
// 实测无人从本 barrel 导入的入口已随本次清理删去（分片之间的消费按分片路径直接导入）。
import "./registry/components/air-conditioner.js?v=20260921152526";
import "./registry/components/camera.js?v=20260921152526";
import "./registry/components/date.js?v=20260921152526";
import "./registry/components/floorplan-auto-diagram.js?v=20260921152526";
import "./registry/components/icon-button.js?v=20260921152526";
import "./registry/components/icon-button-effect.js?v=20260921152526";
import "./registry/components/image.js?v=20260921152526";
import "./registry/components/interaction3d.js?v=20260921152526";
import "./registry/components/light-statistics.js?v=20260921152526";
import "./registry/components/line-chart.js?v=20260921152526";
import "./registry/components/navigation-button.js?v=20260921152526";
import "./registry/components/panel-frame.js?v=20260921152526";
import "./registry/components/presence-sensor.js?v=20260921152526";
import "./registry/components/time.js?v=20260921152526";
import "./registry/components/title-button.js?v=20260921152526";
import "./registry/components/vacuum-map.js?v=20260921152526";
import "./registry/components/weather.js?v=20260921152526";

// 分片：airflow
export {
  renderAirConditionerAirflowLayer
} from "./registry/airflow.js?v=20260921152526";
// 分片：builtin-assets
export {
  setBuiltinAssetVersions,
  staticAssetImageSource,
  vacuumMapImageSource
} from "./registry/builtin-assets.js?v=20260921152526";
// 分片：camera
export {
  mountCameraMedia,
  prewarmCameraMedia
} from "./registry/camera.js?v=20260921152526";
// 分片：cover-state
export {
  COVER_CLOSED_POSITION_EPSILON,
  coverComponentIsDream
} from "./registry/cover-state.js?v=20260921152526";
// 分片：effect-visuals
export {
  iconButtonEffectLightVisualAwaiting,
  iconButtonEffectLightVisualState,
  renderIconButtonEffectLayer
} from "./registry/effect-visuals.js?v=20260921152526";
// 分片：history-chart
export {
  renderLineChartDetails
} from "./registry/history-chart.js?v=20260921152526";
// 分片：registry-core
export {
  renderRegisteredComponent
} from "./registry/registry-core.js?v=20260921152526";

// ── 各 runtime 纯函数的统一再导出（原样保留）──
import {
  lightStatisticsEntityStateStatus,
  lightStatisticsEntitySupport
} from "../controls/light-statistics-runtime.js?v=20260921152526";
import { formatLineChartValue } from "../controls/line-chart-runtime.js?v=20260921152526";
import {
  doorWindowPerspectiveCorners,
  doorWindowPerspectiveMatrix
} from "../controls/door-window-runtime.js?v=20260921152526";
// 统一再导出下面这几个 runtime 纯函数：页面脚本从 registry.js 一处取用，
// 也保证注册表与这些工具用的是同一份模块实例（版本戳不一致会出现两份）。
// 这里曾经把各 runtime 的纯函数**全量**转出，其中实测已无消费方的随本次清理删去 ——
// 它们各自的实现模块仍在（分片之间直接按分片路径导入），删掉的只是 barrel 上的重复入口。
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
} from "../controls/presence-runtime.js?v=20260921152526";
export {
  formatPresenceDuration as formatPresenceDuration,
  presenceHistoryBuckets as presenceHistoryBuckets,
  presenceMotionEventConfig as presenceMotionEventConfig,
  presenceSensorPresentation as presenceSensorPresentation,
  presenceStateTimestamp as presenceStateTimestamp
};
