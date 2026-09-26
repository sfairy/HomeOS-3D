/**
 * 3D 运行时树 → `/static/` 共享助手的唯一桥梁：纯转出口，本身不实现任何逻辑。
 *
 * 树里有「编辑侧写裸 /static/ 静态 import」与「运行侧按 import.meta.url 分流」两种写法，
 * 本文件消费方两侧都有（舞台页能以 file: 打开），故取运行侧口径：是 file: 走相对路径，否则走 /static/。
 *
 * 纪律：只许出现「条件动态 import + 命名导出」，不许出现实现（否则会多出一份实现）；
 * 导出名必须与登记表逐字相同，动态 import 目标也只许是这些名字所属的模块，否则会退化成通用通道。
 *
 * 本文件在**显示热路径**上（`stage.js` → 这里），所以只登记「显示路径真的要用的零依赖工具」。
 * 只在编辑器打开时才用得到的助手放 `static-helpers-editor.js` —— 那个文件会拖进 `bridge/bridge.js`，
 * 而它有模块级状态（授权监视器 + 两张按组件 ID 索引的 Map），放进这里等于让纯展示页也付这份开销。
 */

// 开发态（file:）走相对路径，生产走 /static 绝对路径；两条都不能省。
const {
  readFromMapOrRecord,
  resolveStateEntry,
  stateTextOf,
  normalizedTextOf
} = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/state-entry.js", import.meta.url))
  : import("/static/utils/state-entry.js?v=2609260946"));
const { entityDomainFromId } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/entities.js", import.meta.url))
  : import("/static/utils/entities.js?v=2609260946"));
// 窗帘能力位与「有没有叶片证据」的判定：舞台（cover-state）与仪表盘注册表共用同一份口径；
// 默认预览开合度（COVER_DEFAULT_PREVIEW_POSITION）也在这里，工作室与运行时的未绑定兜底必须同值。
const {
  COVER_DEFAULT_PREVIEW_POSITION,
  COVER_FEATURE_CLOSE,
  COVER_FEATURE_OPEN,
  COVER_FEATURE_SET_POSITION,
  COVER_FEATURE_SET_TILT_POSITION,
  COVER_FEATURE_STOP,
  coverFeaturesOrInferred,
  coverReportsTilt
} = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/cover-features.js", import.meta.url))
  : import("/static/utils/cover-features.js?v=2609260946"));
const { apiErrorMessage } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/api-error.js", import.meta.url))
  : import("/static/utils/api-error.js?v=2609260946"));
const { INTERACTION_PAGE_OPTIONS } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/interaction-pages.js", import.meta.url))
  : import("/static/utils/interaction-pages.js?v=2609260946"));
// DOM 工厂：显示路径上的四个面板（气候 / 窗帘 / NAS / 电视）+ 弹窗示意预览都要造元素、
// 按钮与 replaceChildren 兜底，实现统一在 /static/shared/dom-factory.js。
const { createDomFactory } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/shared/dom-factory.js", import.meta.url))
  : import("/static/shared/dom-factory.js?v=2609260946"));
// 数字输入的步进：编辑器侧（home.js）与平面光区编辑器共用一份实现，策略经参数传入。
const { stepNumberInput } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/shared/number-input-stepper.js", import.meta.url))
  : import("/static/shared/number-input-stepper.js?v=2609260946"));
// 数值换算与夹取（唯一实现仍在 utils/numbers.js）：运行侧大量几何 / 光照 / 面板字段都要过它，
// 缺了这条桥，各模块就会各自再造一份口径不同的夹取与换算。
const {
  clampNumber,
  coercedFiniteNumberOr,
  finiteNumberOr,
  finiteNumberOrNull
} = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/numbers.js", import.meta.url))
  : import("/static/utils/numbers.js?v=2609260946"));
// 指针捕获：`stage.js` 的标记拖拽（显示路径）与编辑器的平面图拖拽都要用，且实现零依赖。
const { capturePointer, releasePointer } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/pointer-capture.js", import.meta.url))
  : import("/static/utils/pointer-capture.js?v=2609260946"));
// 浮动菜单定位：编辑器里 11 处下拉 + 平面光区编辑器的自定义下拉共用一份算术，差异走参数。
const { positionFloatingMenu } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/shared/menu-positioning.js", import.meta.url))
  : import("/static/shared/menu-positioning.js?v=2609260946"));
// mdi 遮罩：舞台标记（显示路径）与编辑器两侧的图标按钮都造遮罩，版本号与白名单只此一份。
const { applyMdiMask, mdiIconUrl } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/icon-url.js", import.meta.url))
  : import("/static/utils/icon-url.js?v=2609260946"));
// 调色板取色：光区编辑器的 SVG 手柄与画布上的吸附 / 量测标记读不到 CSS 变量，
// 必须把令牌值取成具体色再画（唯一的 paletteColor 实现在 utils/colors.js，
// 它自身只依赖已经在上面登记过的 numbers.js）。
const { paletteColor } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/colors.js", import.meta.url))
  : import("/static/utils/colors.js?v=2609260946"));
// 「其它」档气流的中性灰：控件渲染兜底（renderer/core/registry/airflow.js）、组件模板、
// 属性描述符与运行时气流（runtime/environment/environment-airflow.js）共用同一枚定义。
// 它刻意**不是**令牌（四束可配置光里没有「其它」这个语义槽），所以这里只桥这一个常量。
//
// 之所以绕这座桥而不是让 runtime 各模块直接 import：runtime 资源挂在
// /api/v1/modules/interaction3d/ 下 —— URL 比磁盘路径（frontend/modules/runtime/）**深一层**，
// 因此 "../../../static/utils/x.js" 解析到 /api/v1/static/utils/x.js 只会 404。
// 桥内部走绝对路径 /static/...，层数与前缀都无关，是 runtime 取 /static 的唯一正确姿势。
const { AIRFLOW_OTHER_COLOR } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/airflow-colors.js", import.meta.url))
  : import("/static/utils/airflow-colors.js?v=2609260946"));
// 三组「固定观感」常量：灯光效果区间、轻量柔光光照参数、分页观感。
// 显示路径（stage.js 的场景归一）与编辑器（config-editor.js 的灯光面板）必须读同一份，
// 否则编辑器显示的量程与舞台实际采用的会对不上（这正是收敛成常量要解决的问题）。
// 三者都是纯函数 + 冻结常量，零依赖，放在显示热路径上不会带来额外开销。
const { withFixedLightEffects } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/bridge/light-effect-policy.js", import.meta.url))
  : import("/static/bridge/light-effect-policy.js?v=2609260946"));
const { withRegionLightingPreset } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/bridge/region-lighting-presets.js", import.meta.url))
  : import("/static/bridge/region-lighting-presets.js?v=2609260946"));
const { withPageAppearancePreset } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/bridge/page-appearance-presets.js", import.meta.url))
  : import("/static/bridge/page-appearance-presets.js?v=2609260946"));
// 门锁口径：锁本体 / 门磁 / 电量 / 低电量 / 防拆五个槽位的识别规则、三种门磁口径
// （传感器 / 单事件 / 双事件）折算成的开合、以及把场景配置里的门展开成门模型清单。
// 显示路径（lock-panel 的文案、lock-motion 的门动画）要它，编辑器的安防配置页也要它 ——
// 两侧共用同一份实现才是重点，实现在 bridge/lock-state-runtime.js，这里是运行侧那层薄桥。
// 导出的是八个名字（不含 doorEventState）：单 / 双事件的细节由 lockState 内部消化，
// 消费方只看 doorOpen，所以不必把事件语义漏到桥上。lockHinge 是「取门轴」的唯一口径，
// 舞台动画与绑定收集共用它，避免两侧各写一份兜底后悄悄漂移。
const {
  LOCK_ENTITY_FIELDS,
  doorModels,
  doorOpenState,
  entryDoorModels,
  identifyLockEntities,
  lockEntityRole,
  lockHinge,
  lockState
} = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/bridge/lock-state-runtime.js", import.meta.url))
  : import("/static/bridge/lock-state-runtime.js?v=2609260946"));
// 温湿度计的公共助手：配置归一、楼层缺省落点、一帧状态折算读数、订阅实体抽取与
// 温度 / 湿度传感器的识别规则。显示路径（舞台标记的温湿度卡）与编辑器（配置页的实体选择器）
// 必须共用同一份实现，实现在 bridge/temperature-humidity.js，这里是运行侧那层薄桥。
const {
  matchesTemperatureHumidityEntity,
  normalizeTemperatureHumidity,
  temperatureHumidityEntities,
  temperatureHumidityFloorCenter,
  temperatureHumidityReading
} = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/bridge/temperature-humidity.js", import.meta.url))
  : import("/static/bridge/temperature-humidity.js?v=2609260946"));

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
  coverReportsTilt,
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
