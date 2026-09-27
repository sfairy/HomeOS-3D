/**
 * 3D 运行时树（编辑器侧）→ `/static/` 共享助手的桥梁：纯转出口，本身不实现任何逻辑。
 */

// 开发态（file:）走相对路径，生产走 /static 绝对路径；两条都不能省。
const { randomUuid } = await (import("@app/utils/random-id.js"));
const { interaction3dPreviewSize } = await (import("@app/bridge/preview-layout.js"));
const { normalizeInteraction3dLightingMode } = await (import("@app/bridge/definition.js"));
// DOM 工厂：编辑器侧的配置编辑器 / 量程对话框 / 三个设备编辑器都要造元素、按钮与 SVG。
const { createDomFactory } = await (import("@app/shared/dom-factory.js"));
const {
  requestInteraction3dAccess,
  getInteraction3dEditorView,
  subscribeInteraction3dAccess
} = await (import("@app/bridge/bridge.js"));
const { DEFAULT_BASE_LIGHTING, normalizeBaseLighting } = await (import("@app/3d-studio/loaders/studio-normalization.js"));
const { toSvgPoint } = await (import("@app/shared/svg-point.js"));
// 门锁口径的编辑侧入口：安防配置页要「列出场景里所有的门」来给用户挑（doorModels）、
const { doorModels, doorOpenFromText, identifyLockEntities, lockEntityRole } = await (import("@app/bridge/lock-state-runtime.js"));
// 温湿度计配置页：新增条目要按楼层几何中心落点（temperatureHumidityFloorCenter），
const { normalizeTemperatureHumidity, temperatureHumidityFloorCenter } = await (import("@app/bridge/temperature-humidity.js"));

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
