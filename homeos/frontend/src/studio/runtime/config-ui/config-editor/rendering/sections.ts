/**
 * 配置面板「补充分区」的统一出口（barrel）。
 *
 * ## 为什么要这一层
 *
 * `panel-assembly` 已经很大，直接 import 这些碎片会把「总装」与「片段实现」继续绑在一起。
 * 开窗器段、游戏机主实体段与本轮新增的列表空态文案拆成三个文件后，如果直接 import 会各占一行。
 * 这里显式列出 4 个转发（不用 `export *`：运行时产物契约要求导出面可静态枚举），
 * 总装只保留一行 import。
 */
export { createExtraSourcesSection } from './extra-sources-section'
export { modelListHint } from './config-list-hint'
export {
  appendGameConsoleSection,
  appendStatusOrGameMainSection,
  autoPickGameMainEntity,
  openGameMainEntityPicker,
} from './game-console-section'
export { floorWindowContacts, renderWindowOpenerSection, windowContactNote } from './window-opener-section'
export {
  doorContactNote,
  floorDoorContacts,
  normalizeDoorSwitchMode,
  renderDoorOpenerSection,
} from './door-opener-section'
export {
  CAR_OPENING_EMPTY_NOTE,
  CAR_OPENING_PART_LABELS,
  CAR_PRESENCE_KEYS,
  CAR_REBIND_WARNING,
  carOpeningHint,
  carPresenceHint,
  formatCarStateLines,
  parseCarStateLines,
  renderCarMotionSections,
  renderCarOpeningSection,
  renderCarPresenceBlock,
} from './car-motion-section'
