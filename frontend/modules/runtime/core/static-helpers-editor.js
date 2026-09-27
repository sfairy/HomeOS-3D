/**
 * 3D 运行时树（编辑器侧）→ `/static/` 共享助手的桥梁：纯转出口，本身不实现任何逻辑。
 */

// 开发态（file:）走相对路径，生产走 /static 绝对路径；两条都不能省。
const { randomUuid } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/utils/random-id.js", import.meta.url))
  : import("/static/utils/random-id.js?v=2609271508"));
const { interaction3dPreviewSize } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/bridge/preview-layout.js", import.meta.url))
  : import("/static/bridge/preview-layout.js?v=2609271508"));
const { normalizeInteraction3dLightingMode } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/bridge/definition.js", import.meta.url))
  : import("/static/bridge/definition.js?v=2609271508"));
// DOM 工厂：编辑器侧的配置编辑器 / 量程对话框 / 三个设备编辑器都要造元素、按钮与 SVG。
const { createDomFactory } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/shared/dom-factory.js", import.meta.url))
  : import("/static/shared/dom-factory.js?v=2609271508"));
const {
  requestInteraction3dAccess,
  getInteraction3dEditorView,
  subscribeInteraction3dAccess
} = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/bridge/bridge.js", import.meta.url))
  : import("/static/bridge/bridge.js?v=2609271508"));
const { DEFAULT_BASE_LIGHTING, normalizeBaseLighting } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/3d-studio/loaders/studio-normalization.js", import.meta.url))
  : import("/static/3d-studio/loaders/studio-normalization.js?v=2609271508"));
const { toSvgPoint } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/shared/svg-point.js", import.meta.url))
  : import("/static/shared/svg-point.js?v=2609271508"));
// 门锁口径的编辑侧入口：安防配置页要「列出场景里所有的门」来给用户挑（doorModels）、
const { doorModels, doorOpenFromText, identifyLockEntities, lockEntityRole } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/bridge/lock-state-runtime.js", import.meta.url))
  : import("/static/bridge/lock-state-runtime.js?v=2609271508"));
// 温湿度计配置页：新增条目要按楼层几何中心落点（temperatureHumidityFloorCenter），
const { normalizeTemperatureHumidity, temperatureHumidityFloorCenter } = await (import.meta.url.startsWith("file:")
  ? import(new URL("../../../static/bridge/temperature-humidity.js", import.meta.url))
  : import("/static/bridge/temperature-humidity.js?v=2609271508"));

export {
  DEFAULT_BASE_LIGHTING,
  createDomFactory,
  doorModels,
  doorOpenFromText,
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
