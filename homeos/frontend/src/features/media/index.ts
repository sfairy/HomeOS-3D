/**
 * media（媒体域）域根 barrel —— 域的唯一对外出口。
 *
 * 域内细节不外借：跨域引用只允许 `import ... from '@/features/media'`
 * （跨域只走域根 barrel，属项目约定）。
 *
 * ## 薄 barrel 原则
 *
 * 播放器主体（`player/`、`lifestyle/`）只在媒体页与全屏播放里装配。跨域唯一需要的是
 * 歌单编辑器 —— 设置页的「媒体与入库」面板要就地编辑歌单，而不能把整个播放器拖进来。
 */

// ── 歌单编辑器（features/settings 的媒体面板复用）──
export { default as PlaylistWidget } from './PlaylistWidget.vue'
