/**
 * 编辑器壳层里「挂 DOM」的三件事，集中在一个入口完成：
 * 3D 视口编辑叠层、预览风格选择器、工作区主视图切换。
 *
 * 为什么抽出来：`boot.ts` 触到行数预算（4200）。这三者都属于「绑定页面元素」，
 * 与引导流程本身无关；合成一个 `bindStudioChrome` 后 boot 只留一行，
 * 回收也只有一行，不会再因为加一个绑定就顶破预算。
 */
import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { armEditor3D, disposeEditor3D } from './editor-3d-wiring'
import { bindPreviewStyleSelect } from './studio-preview-style'
import { bindWorkspaceView } from './studio-workspace-view'

export interface StudioChromeBindings {
  dispose: () => void
}

export function bindStudioChrome(runtime: StudioAppRuntime): StudioChromeBindings {
  armEditor3D(runtime)
  bindPreviewStyleSelect(runtime)
  const workspaceView = bindWorkspaceView(runtime)
  return {
    dispose: () => {
      disposeEditor3D(runtime.appCtx)
      workspaceView.dispose()
    },
  }
}
