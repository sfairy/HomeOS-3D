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
  resolveStateEntry,
  stateTextOf,
  normalizedTextOf
} = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/state-entry.js", import.meta.url))
  : import("/static/utils/state-entry.js?v=2609212100"));
const { entityDomainFromId } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/entities.js", import.meta.url))
  : import("/static/utils/entities.js?v=2609212100"));
const { apiErrorMessage } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/api-error.js", import.meta.url))
  : import("/static/utils/api-error.js?v=2609212100"));
const { INTERACTION_PAGE_OPTIONS } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/interaction-pages.js", import.meta.url))
  : import("/static/utils/interaction-pages.js?v=2609212100"));
// 数值换算与夹取（唯一实现仍在 utils/numbers.js）：运行侧大量几何 / 光照 / 面板字段都要过它，
// 缺了这条桥，各模块就会各自再造一份口径不同的夹取与换算。
const {
  clampNumber,
  coercedFiniteNumberOr,
  finiteNumberOr,
  finiteNumberOrNull
} = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/numbers.js", import.meta.url))
  : import("/static/utils/numbers.js?v=2609212100"));
// 指针捕获：`stage.js` 的标记拖拽（显示路径）与编辑器的平面图拖拽都要用，且实现零依赖。
const { capturePointer, releasePointer } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/pointer-capture.js", import.meta.url))
  : import("/static/utils/pointer-capture.js?v=2609212100"));

export {
  INTERACTION_PAGE_OPTIONS,
  apiErrorMessage,
  capturePointer,
  clampNumber,
  coercedFiniteNumberOr,
  entityDomainFromId,
  finiteNumberOr,
  finiteNumberOrNull,
  normalizedTextOf,
  releasePointer,
  resolveStateEntry,
  stateTextOf
};
