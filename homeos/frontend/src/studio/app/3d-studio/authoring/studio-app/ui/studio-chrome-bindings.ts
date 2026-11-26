/**
 * 编辑器壳层里「挂 DOM」的几件事，集中在一个入口完成：
 * 3D 视口编辑叠层、预览风格选择器、工作区主视图切换、相机设置折叠面板。
 *
 * 为什么抽出来：`boot.ts` 触到行数预算（4200）。这三者都属于「绑定页面元素」，
 * 与引导流程本身无关；合成一个 `bindStudioChrome` 后 boot 只留一行，
 * 回收也只有一行，不会再因为加一个绑定就顶破预算。
 */
import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { armEditor3D, disposeEditor3D } from './editor-3d-wiring'
import { bindPreviewStyleSelect } from './studio-preview-style'
import { bindWorkspaceView } from './studio-workspace-view'
import { installPreviewCameraPanel } from './preview-camera-panel'
import { installLightingRow } from './lighting-row-install'

/**
 * 相机设置面板的焦段可用性同步（摄影模式切换时调用）。
 *
 * 从本模块转出而不是让 `boot.ts` 直接 import 新文件：boot 的 import 已经很多，
 * 「新增一个 UI 绑定」不该继续扩大它的扇出。
 */
export { syncCameraFocalAvailability } from './preview-camera-panel'

/**
 * 用户装饰模型的动态注册（0.8.9）。
 *
 * 从本模块转出而不是让 `boot.ts` 直接 import 新文件：boot 的 import 已经很多，
 * 「多一个加载期常量」不该继续扩大它的扇出。
 */
export {
  decorationPlacementFields,
  registerUserDecorationModel,
  setUserDecorationStageContext,
} from '../../../loaders/external-models/user-decoration-models'

export interface StudioChromeBindings {
  dispose: () => void
}

export function bindStudioChrome(runtime: StudioAppRuntime): StudioChromeBindings {
  armEditor3D(runtime)
  bindPreviewStyleSelect(runtime)
  // 0.8.9：相机设置折叠面板（点击 / Esc / aria-expanded 三处同步都在模块内）。
  installPreviewCameraPanel()
  // 0.8.9：标准光影 / 轻量柔光切换（换渲染管线 + 重建灯光层，见 lighting-row-install）。
  installLightingRow(runtime)
  const workspaceView = bindWorkspaceView(runtime)
  return {
    dispose: () => {
      disposeEditor3D(runtime.appCtx)
      workspaceView.dispose()
    },
  }
}
