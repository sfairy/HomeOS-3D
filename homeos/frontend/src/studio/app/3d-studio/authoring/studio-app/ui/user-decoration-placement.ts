/**
 * 「我的装饰」放进户型（0.8.9）。
 *
 * 从 `boot.ts` 切出来：该文件在 studio split 预算（4200 行）上，而这段是封闭的一小块
 * （注册模型 URL → 在视图中心建物品 → 用占位尺寸）。依赖以显式参数传入、不回头读
 * boot 的闭包，因此它可以在 node 里单测。
 */
import { decorationPlacementFields, registerUserDecorationModel } from './studio-chrome-bindings'

/** 用户装饰的占位尺寸（米）：真实包围盒由加载后的 GLB 写回。 */
export const DECORATION_DEFAULT_SIZE = 0.4

export type UserDecorationPlacementDeps = {
  /** 屏幕坐标 → 平面坐标（宿主提供，含视图缩放与平移）。 */
  screenToPlan: (point: { x: number; y: number }) => { x: number; y: number }
  /** 视图中心（像素）。 */
  viewCenter: () => { x: number; y: number }
  /** 在平面上建一件物品。 */
  createSceneItem: (type: string, point: { x: number; y: number }, options: Record<string, unknown>) => void
  /** 提示。 */
  showToast: (message: string, tone: string) => void
}

/**
 * 把一件「我的装饰」放进户型中心。
 *
 * 三步顺序不能变：
 * 1. **先注册模型 URL**（`model:<assetId>`）—— 建场景时靠它把 `user-decoration`
 *    映射到真实 GLB；没注册会得到一件看不见的物品；
 * 2. 再在**当前视图中心**建物品（与资源库卡片点击放置同一套坐标口径）；
 * 3. 尺寸用保守占位，真实包围盒由加载后的模型写回。
 */
export function placeUserDecorationAtViewCenter(
  model: { assetId: string; name?: string },
  deps: UserDecorationPlacementDeps,
): void {
  const decorationModelKey = registerUserDecorationModel(model.assetId, {
    width: DECORATION_DEFAULT_SIZE,
    height: DECORATION_DEFAULT_SIZE,
    depth: DECORATION_DEFAULT_SIZE,
  })
  if (!decorationModelKey) {
    deps.showToast('这个装饰模型不可用，请重新上传。', 'error')
    return
  }
  const centerPoint = deps.screenToPlan(deps.viewCenter())
  deps.createSceneItem('user-decoration', centerPoint, {
    width: DECORATION_DEFAULT_SIZE,
    depth: DECORATION_DEFAULT_SIZE,
    // 与拖拽放置共用同一份字段构造（两条路径各写一份必然漂移）。
    extraFields: decorationPlacementFields(model.assetId, model.name),
  })
}
