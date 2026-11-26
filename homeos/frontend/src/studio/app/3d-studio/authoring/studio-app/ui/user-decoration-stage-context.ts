/**
 * 把舞台上下文写入用户装饰的模型登记表（0.8.9）。
 *
 * 嵌入舞台时用户装饰必须走**场景内**的模型 URL：编辑器那条 `/studio3d/models/{id}`
 * 只判登录，而舞台只该拿到「这份户型真的引用的」模型。不设置的实际表现是
 * 仪表盘 3D 控件里装饰全部缺失（请求被 404 拒绝）。
 */
import { setUserDecorationStageContext } from './studio-chrome-bindings'

export function applyUserDecorationStageContext(isStage: boolean): void {
  if (!isStage) return
  const stageSearchParams = new URLSearchParams(window.location.search)
  setUserDecorationStageContext(stageSearchParams.get('sceneId') || '', stageSearchParams.get('projectId') || '')
}
