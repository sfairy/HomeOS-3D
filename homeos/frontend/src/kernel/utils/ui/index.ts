/**
 * `kernel/utils/ui` 公开面。
 *
 * 这些模块此前被合并成 `ui.ts`（1559 行），
 * 但它们各自职责不同（见各文件头注释），混在一个文件里无法按职责定位。
 * 拆回独立文件后由本桶维持既有 import 说明符不变。
 */
export * from './chart-resize.util'
export * from './color.util'
export * from './glass-effect.util'
export * from './haptics.util'
export * from './main-layout-nav.util'
export * from './notify-coalesce.util'
export * from './popup-placement.util'
export * from './progress-bar-color-temp.util'
export * from './progress-bar-gradient.util'
export * from './progress-bar.util'
export * from './screensaver-background-idle.util'
export * from './studio-loading-style'
export * from './studio-startup'
export * from './theme.util'
