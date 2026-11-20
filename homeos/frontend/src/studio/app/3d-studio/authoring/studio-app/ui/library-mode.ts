/**
 * 素材库页签模式的只读镜像（0.8.7 的 `vo`）。
 *
 * 为什么单独一个文件：3D 叠层要按「选中灯具 / 已放置页签 / 灯光分类」决定画不画灯位圆点
 * （0.8.7 `createEditorLightGizmo` 调用方的门控），而页签状态活在 `placed-items-wiring` 的
 * 闭包里。若直接从那边导出读取口，`editor-light-toolbar-options → placed-items-wiring →
 * editor-3d-wiring → editor-light-toolbar-options` 就成环；这里只放一个 WeakMap，
 * 双方都只依赖它，环自然消失。
 *
 * 用 WeakMap 而不是往 `appCtx` 塞字段：引擎的状态形状不为一个只读判定而改动。
 */
export type LibraryMode = 'assets' | 'placed'

const modes = new WeakMap<object, LibraryMode>()

/** 当前素材库页签；未安装面板（嵌入舞台等）时按默认「素材库」算。 */
export function libraryModeOf(appCtx: object): LibraryMode {
  return modes.get(appCtx) ?? 'assets'
}

/** 页签模式变了才写镜像：让叠层下一次重投影读到的就是新值。 */
export function rememberLibraryMode(appCtx: object, mode: LibraryMode): void {
  modes.set(appCtx, mode)
}
