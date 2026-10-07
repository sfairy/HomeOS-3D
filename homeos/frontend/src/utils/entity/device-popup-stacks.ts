/**
 * 设备弹窗三栈职责边界（冻结约定）。
 *
 * 目标：职责清晰、同域体验一致、禁止再新增第四套「同域控制壳」。
 * 新域优先挂栈 A 注册表或栈 C renderer 分流；3D 仅新增 panel 模块。
 *
 * | 栈 | 入口 | 职责 |
 * |----|------|------|
 * | A  | EntityControlHost + popup-registry | 设备列表 / 详情「控制」/ Hub 水电通讯 |
 * | B  | chrome shell overlays | 门铃告警、设备组批量、媒体全屏（紧凑态仍走 A） |
 * | C  | PanelRenderer more-info / 组合弹窗 | 仪表盘控件详情、摄像/扫地机、自定义组合弹窗 |
 * | D  | interaction3d stage i3d-*-panel | 3D 聚焦后的场景内轻量控制 |
 *
 * media_player 两态：A = MediaPlayerPopup（紧凑锚定）；B = MediaPlayerModal（全屏）。
 * 画布 more-info 与 MiniWidget 统一打开 MediaPlayerModal，不再维护 renderer 手写 media dialog。
 */

/** 栈标识（文档与断言用） */
export const DEVICE_POPUP_STACK = {
  /** Vue 实体控制（列表 / 详情 / Hub） */
  ENTITY_CONTROL: 'A',
  /** Chrome 专用模态（门铃 / 设备组 / 媒体全屏） */
  CHROME_MODAL: 'B',
  /** 画布 PanelRenderer more-info / 组合弹窗 */
  CANVAS_DIALOG: 'C',
  /** 3D 场景内面板 */
  SCENE_PANEL: 'D',
} as const

export type DevicePopupStackId =
  (typeof DEVICE_POPUP_STACK)[keyof typeof DEVICE_POPUP_STACK]

/** 栈 A 注册表覆盖的 HA domain（与 popup-registry 保持同步） */
export const STACK_A_DOMAINS = [
  'light',
  'climate',
  'cover',
  'media_player',
] as const

/** 栈 B 设备组批量支持的 domain */
export const STACK_B_GROUP_DOMAINS = [
  'light',
  'climate',
  'battery',
  'offline',
  'cover',
  'media_player',
  'fan',
  'lock',
] as const
