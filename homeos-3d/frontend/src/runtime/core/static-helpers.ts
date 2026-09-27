/**
 * 3D 运行时树 → `/static/` 共享助手的唯一桥梁：纯转出口，本身不实现任何逻辑。
 */

// 开发态（file:）走相对路径，生产走 /static 绝对路径；两条都不能省。
const {
  readFromMapOrRecord,
  resolveStateEntry,
  stateTextOf,
  normalizedTextOf
} = await (import("@app/utils/state-entry.js"));
const { entityDomainFromId } = await (import("@app/utils/entities.js"));
// 窗帘能力位与「有没有叶片证据」的判定：舞台（cover-state）与仪表盘注册表共用同一份口径；
const {
  COVER_DEFAULT_PREVIEW_POSITION,
  COVER_FEATURE_CLOSE,
  COVER_FEATURE_OPEN,
  COVER_FEATURE_SET_POSITION,
  COVER_FEATURE_SET_TILT_POSITION,
  COVER_FEATURE_STOP,
  coverFeaturesOrInferred,
  coverPanelWidthPercent,
  coverReportsTilt,
  coverSinglePanelWidthPercent,
  resolveCoverDirection
} = await (import("@app/utils/cover-features.js"));
const { apiErrorMessage } = await (import("@app/utils/api-error.js"));
const { INTERACTION_PAGE_OPTIONS } = await (import("@app/utils/interaction-pages.js"));
// DOM 工厂：显示路径上的四个面板（气候 / 窗帘 / NAS / 电视）+ 弹窗示意预览都要造元素、
const { createDomFactory } = await (import("@app/shared/dom-factory.js"));
// 数字输入的步进：编辑器侧（home.js）与平面光区编辑器共用一份实现，策略经参数传入。
const { stepNumberInput } = await (import("@app/shared/number-input-stepper.js"));
// 数值换算与夹取（唯一实现仍在 utils/numbers.js）：运行侧大量几何 / 光照 / 面板字段都要过它，
const {
  clampNumber,
  coercedFiniteNumberOr,
  finiteNumberOr,
  finiteNumberOrNull
} = await (import("@app/utils/numbers.js"));
// 指针捕获：`stage.js` 的标记拖拽（显示路径）与编辑器的平面图拖拽都要用，且实现零依赖。
const { capturePointer, releasePointer } = await (import("@app/utils/pointer-capture.js"));
// 浮动菜单定位：编辑器里 11 处下拉 + 平面光区编辑器的自定义下拉共用一份算术，差异走参数。
const { positionFloatingMenu } = await (import("@app/shared/menu-positioning.js"));
// mdi 遮罩：舞台标记（显示路径）与编辑器两侧的图标按钮都造遮罩，版本号与白名单只此一份。
const { applyMdiMask, mdiIconUrl } = await (import("@app/utils/icon-url.js"));
// 调色板取色：光区编辑器的 SVG 手柄与画布上的吸附 / 量测标记读不到 CSS 变量，
const { paletteColor } = await (import("@app/utils/colors.js"));
// 「其它」档气流的中性灰：控件渲染兜底（renderer/core/registry/airflow.js）、组件模板、
const { AIRFLOW_OTHER_COLOR } = await (import("@app/utils/airflow-colors.js"));
// 三组「固定观感」常量：灯光效果区间、轻量柔光光照参数、分页观感。
const { withFixedLightEffects } = await (import("@app/bridge/light-effect-policy.js"));
const { withRegionLightingPreset } = await (import("@app/bridge/region-lighting-presets.js"));
const { withPageAppearancePreset } = await (import("@app/bridge/page-appearance-presets.js"));
// 门锁口径：锁本体 / 门磁 / 电量 / 低电量 / 防拆五个槽位的识别规则、三种门磁口径
const {
  LOCK_ENTITY_FIELDS,
  doorModels,
  doorOpenState,
  entryDoorModels,
  identifyLockEntities,
  lockEntityRole,
  lockHinge,
  lockState
} = await (import("@app/bridge/lock-state-runtime.js"));
// 温湿度计的公共助手：配置归一、楼层缺省落点、一帧状态折算读数、订阅实体抽取与
const {
  matchesTemperatureHumidityEntity,
  normalizeTemperatureHumidity,
  temperatureHumidityEntities,
  temperatureHumidityFloorCenter,
  temperatureHumidityReading
} = await (import("@app/bridge/temperature-humidity.js"));

export {
  AIRFLOW_OTHER_COLOR,
  COVER_DEFAULT_PREVIEW_POSITION,
  COVER_FEATURE_CLOSE,
  COVER_FEATURE_OPEN,
  COVER_FEATURE_SET_POSITION,
  COVER_FEATURE_SET_TILT_POSITION,
  COVER_FEATURE_STOP,
  INTERACTION_PAGE_OPTIONS,
  LOCK_ENTITY_FIELDS,
  apiErrorMessage,
  applyMdiMask,
  capturePointer,
  clampNumber,
  coercedFiniteNumberOr,
  coverFeaturesOrInferred,
  coverPanelWidthPercent,
  coverReportsTilt,
  coverSinglePanelWidthPercent,
  createDomFactory,
  doorModels,
  doorOpenState,
  entityDomainFromId,
  entryDoorModels,
  finiteNumberOr,
  finiteNumberOrNull,
  identifyLockEntities,
  lockEntityRole,
  lockHinge,
  lockState,
  matchesTemperatureHumidityEntity,
  mdiIconUrl,
  normalizedTextOf,
  normalizeTemperatureHumidity,
  paletteColor,
  positionFloatingMenu,
  readFromMapOrRecord,
  releasePointer,
  resolveCoverDirection,
  resolveStateEntry,
  stateTextOf,
  stepNumberInput,
  temperatureHumidityEntities,
  temperatureHumidityFloorCenter,
  temperatureHumidityReading,
  withFixedLightEffects,
  withPageAppearancePreset,
  withRegionLightingPreset
};
