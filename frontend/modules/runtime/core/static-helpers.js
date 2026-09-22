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
  : import("/static/utils/state-entry.js?v=2609221226"));
const { entityDomainFromId } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/entities.js", import.meta.url))
  : import("/static/utils/entities.js?v=2609221226"));
// 窗帘能力位与「有没有叶片证据」的判定：舞台（cover-state）与仪表盘注册表共用同一份口径。
const {
  COVER_FEATURE_CLOSE,
  COVER_FEATURE_OPEN,
  COVER_FEATURE_SET_POSITION,
  COVER_FEATURE_SET_TILT_POSITION,
  COVER_FEATURE_STOP,
  coverFeaturesOf,
  coverReportsTilt
} = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/cover-features.js", import.meta.url))
  : import("/static/utils/cover-features.js?v=2609221226"));
const { apiErrorMessage } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/api-error.js", import.meta.url))
  : import("/static/utils/api-error.js?v=2609221226"));
const { INTERACTION_PAGE_OPTIONS } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/interaction-pages.js", import.meta.url))
  : import("/static/utils/interaction-pages.js?v=2609221226"));
// DOM 工厂：显示路径上的四个面板（气候 / 窗帘 / NAS / 电视）+ 弹窗示意预览都要造元素、
// 按钮与 replaceChildren 兜底，实现统一在 /static/shared/dom-factory.js。
const { createDomFactory } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/shared/dom-factory.js", import.meta.url))
  : import("/static/shared/dom-factory.js?v=2609221226"));
// 数字输入的步进：编辑器侧（home.js）与平面光区编辑器共用一份实现，策略经参数传入。
const { stepNumberInput } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/shared/number-input-stepper.js", import.meta.url))
  : import("/static/shared/number-input-stepper.js?v=2609221226"));
// 数值换算与夹取（唯一实现仍在 utils/numbers.js）：运行侧大量几何 / 光照 / 面板字段都要过它，
// 缺了这条桥，各模块就会各自再造一份口径不同的夹取与换算。
const {
  clampNumber,
  coercedFiniteNumberOr,
  finiteNumberOr,
  finiteNumberOrNull
} = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/numbers.js", import.meta.url))
  : import("/static/utils/numbers.js?v=2609221226"));
// 指针捕获：`stage.js` 的标记拖拽（显示路径）与编辑器的平面图拖拽都要用，且实现零依赖。
const { capturePointer, releasePointer } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/pointer-capture.js", import.meta.url))
  : import("/static/utils/pointer-capture.js?v=2609221226"));
// 浮动菜单定位：编辑器里 11 处下拉 + 平面光区编辑器的自定义下拉共用一份算术，差异走参数。
const { positionFloatingMenu } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/shared/menu-positioning.js", import.meta.url))
  : import("/static/shared/menu-positioning.js?v=2609221226"));
// mdi 遮罩：舞台标记（显示路径）与编辑器两侧的图标按钮都造遮罩，版本号与白名单只此一份。
const { applyMdiMask, mdiIconUrl } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/icon-url.js", import.meta.url))
  : import("/static/utils/icon-url.js?v=2609221226"));
// 调色板取色：光区编辑器的 SVG 手柄与画布上的吸附 / 量测标记读不到 CSS 变量，
// 必须把令牌值取成具体色再画（唯一的 paletteColor 实现在 utils/colors.js，
// 它自身只依赖已经在上面登记过的 numbers.js）。
const { paletteColor } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/colors.js", import.meta.url))
  : import("/static/utils/colors.js?v=2609221226"));

export {
  COVER_FEATURE_CLOSE,
  COVER_FEATURE_OPEN,
  COVER_FEATURE_SET_POSITION,
  COVER_FEATURE_SET_TILT_POSITION,
  COVER_FEATURE_STOP,
  INTERACTION_PAGE_OPTIONS,
  apiErrorMessage,
  applyMdiMask,
  capturePointer,
  clampNumber,
  coercedFiniteNumberOr,
  coverFeaturesOf,
  coverReportsTilt,
  createDomFactory,
  entityDomainFromId,
  finiteNumberOr,
  finiteNumberOrNull,
  mdiIconUrl,
  normalizedTextOf,
  paletteColor,
  positionFloatingMenu,
  readFromMapOrRecord,
  releasePointer,
  resolveStateEntry,
  stateTextOf,
  stepNumberInput
};
