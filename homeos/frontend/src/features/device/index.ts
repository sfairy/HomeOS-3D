/**
 * device（设备域）域根 barrel —— 域的唯一对外出口。
 *
 * 域内细节不外借：跨域引用只允许 `import ... from '@/features/device'`
 * （门禁见 ops/checks/frontend/check_frontend_deps.mjs）。
 *
 * ## 薄 barrel 原则
 *
 * 只导出被跨域**真正**用到的成员，不做「整域再导出」。device 是 30+ 文件的功能域，
 * 全量 barrel 会把设备列表 / 画像 / 图表面板整片拖进任何引用方的 chunk
 * （最典型的是设置页只想要一个取流组件，却连带拉走设备页的 analytics 与 CSS）。
 *
 * 纯域内使用的实现（`DeviceRow.vue`、`devices-view.ts`、`device-analytics-dashboard.ts` …）
 * 一律不在此列出；它们的落位见 `domain/device/labels.ts` 与
 * `domain/device/device-profile-kind-cache.ts` 这两个已下沉的域设施。
 */

// ── 摄像头取流（features/security 的 MonitorPanel / CameraTile 复用）──
// 安防页与设备页都要渲染同一路 MJPEG 流：取流、重连预算、错误态必须共用一份实现，
// 各写一份会导致「设备页能看、安防页黑屏」这类只在特定入口复现的差异。
export { default as HaCameraStream } from './HaCameraStream.vue'
