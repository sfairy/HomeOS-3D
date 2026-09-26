/**
 * 3D 运行时树（编辑器侧）→ `/static/` 共享助手的桥梁：纯转出口，本身不实现任何逻辑。
 *
 * 为什么与 `static-helpers.js` 分成两个文件，而不是合成一个：
 * 这里登记的名字里包含 `bridge/bridge.js` 的授权与视图登记接口，而那个模块**有模块级状态**
 * （一个授权监视器 + 两张按组件 ID 索引的 Map，注释里写明「挂载时插入 link / div / iframe」）。
 * `static-helpers.js` 在显示热路径上（`stage.js` 直接 import 它），把这边并进去等于让纯展示页
 * 也加载整套编辑器桥。所以按「谁在什么路径上加载」拆开：显示路径用 static-helpers.js，
 * 只有用户真的打开 3D 编辑器才会走到的模块用本文件。
 *
 * 消费方（全部是编辑器侧、由 /static/bridge/editor.js 懒加载进来）：
 * editor/config-editor.js · editor/range-dialog.js · security/security-editor.js ·
 * presence/presence-editor.js · presence/presence-focus-editor.js · vacuum/vacuum-map-editor.js
 * （light/light-range-editor.js 虽然同属编辑器侧，但它被 stage.js 静态 import、在显示路径上，
 *   所以按纪律登记在 static-helpers.js 里。）
 *
 * 纪律（与 static-helpers.js 完全一致）：只许出现「条件动态 import + 命名导出」，不许出现实现；
 * 导出名必须与登记表逐字相同，动态 import 目标也只许是这些名字所属的模块。
 * 加名字前后都要人工核对三件事：解构出的名字确实是目标的真实导出、两个分支指向同一个文件、
 * 末尾 `export { … }` 与解构出的名字集合逐字相同 —— 这三条都不会有任何静态报错，只有浏览器会炸。
 */

// 开发态（file:）走相对路径，生产走 /static 绝对路径；两条都不能省。
const { randomUuid } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/random-id.js", import.meta.url))
  : import("/static/utils/random-id.js?v=2609260929"));
const { interaction3dPreviewSize } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/bridge/preview-layout.js", import.meta.url))
  : import("/static/bridge/preview-layout.js?v=2609260929"));
const { normalizeInteraction3dLightingMode } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/bridge/definition.js", import.meta.url))
  : import("/static/bridge/definition.js?v=2609260929"));
const { confirmAction } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/shared/ui-confirm.js", import.meta.url))
  : import("/static/shared/ui-confirm.js?v=2609260929"));
// DOM 工厂：编辑器侧的配置编辑器 / 量程对话框 / 三个设备编辑器都要造元素、按钮与 SVG。
const { createDomFactory } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/shared/dom-factory.js", import.meta.url))
  : import("/static/shared/dom-factory.js?v=2609260929"));
// 授权 / 编辑器视图登记：这是本文件与 static-helpers.js 分家的原因，见文件头。
const {
  requestInteraction3dAccess,
  getInteraction3dEditorView,
  subscribeInteraction3dAccess
} = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/bridge/bridge.js", import.meta.url))
  : import("/static/bridge/bridge.js?v=2609260929"));
const { DEFAULT_BASE_LIGHTING, normalizeBaseLighting } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/3d-studio/loaders/studio-normalization.js", import.meta.url))
  : import("/static/3d-studio/loaders/studio-normalization.js?v=2609260929"));
const { toSvgPoint } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/shared/svg-point.js", import.meta.url))
  : import("/static/shared/svg-point.js?v=2609260929"));
// 门锁口径的编辑侧入口：安防配置页要「列出场景里所有的门」来给用户挑（doorModels）、
// 要「把从 HA 拉回来的实体清单归到五个槽位」来显示已绑定 / 可绑定（identifyLockEntities）、
// 还要「逐个实体问它能不能填这个槽位」来做候选过滤与灰显（lockEntityRole）。
// 实现在 bridge/lock-state-runtime.js，运行时侧另有 static-helpers.js 那一层桥，
// 两侧指向同一个文件 —— 这里只取编辑侧真正用到的三个名字，不多转。
const { doorModels, identifyLockEntities, lockEntityRole } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/bridge/lock-state-runtime.js", import.meta.url))
  : import("/static/bridge/lock-state-runtime.js?v=2609260929"));
// 温湿度计配置页：新增条目要按楼层几何中心落点（temperatureHumidityFloorCenter），
// 落库前要过一遍白名单归一（normalizeTemperatureHumidity）。实现在 bridge/temperature-humidity.js，
// 显示侧另有 static-helpers.js 那一层桥，两侧指向同一个文件。
const { normalizeTemperatureHumidity, temperatureHumidityFloorCenter } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/bridge/temperature-humidity.js", import.meta.url))
  : import("/static/bridge/temperature-humidity.js?v=2609260929"));

export {
  DEFAULT_BASE_LIGHTING,
  confirmAction,
  createDomFactory,
  doorModels,
  getInteraction3dEditorView,
  identifyLockEntities,
  interaction3dPreviewSize,
  lockEntityRole,
  normalizeBaseLighting,
  normalizeInteraction3dLightingMode,
  normalizeTemperatureHumidity,
  randomUuid,
  requestInteraction3dAccess,
  subscribeInteraction3dAccess,
  temperatureHumidityFloorCenter,
  toSvgPoint
};
