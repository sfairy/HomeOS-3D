/**
 * 灯带工具条的共享类型。
 *
 * 单独一个文件是为了避免 `editor-light-toolbar` ↔ `editor-light-toolbar-dom`
 * 互相 import 形成环：两边都只依赖类型定义。
 */
export type LightMode = 'move' | 'rotate'
export type LightSpace = 'world' | 'local'

/**
 * 吸附相关的读取口（工具条选项与拖动状态机共用同一组签名）。
 *
 * 单独抽出来是因为两份接口逐字重复会被 `check:duplicates` 拦下，
 * 而它们本来就该是同一个契约：状态机只读、装配层负责提供。
 */
export interface SnapSensingOptions {
  /** 轴向平移的贴墙 / 贴边吸附；用拖动中的探针位姿参与计算。 */
  placementSnap?: (
    pose: { x: number; y: number; elevation: number },
    freedom: { x: number; y: number },
  ) => { delta: { x: number; y: number }; keys: string[] } | null
  /** 吸附总开关（0.8.7 `Qt()`）。 */
  snapEnabled?: () => boolean
  /** 角度吸附开关（`settings.snapAngles`）。 */
  snapAngles?: () => boolean
  /** 网格量化开关（`settings.snapGrid`）。 */
  snapGrid?: () => boolean
}
