/**
 * 离屏绘制前后保存 / 还原渲染器的目标与视口状态。
 *
 * 还原顺序固定为 viewport → scissor → scissorTest → target：`setViewport` 会立即作用于
 * 当前绑定的 framebuffer，先还原视口再切回原目标，才不会把默认画布的视口写进离屏目标。
 */

type Ctor<T> = new () => T

type TargetStateRenderer<V> = {
  getRenderTarget(): unknown
  getActiveCubeFace(): number
  getActiveMipmapLevel(): number
  getViewport(target: V): V
  getScissor(target: V): V
  getScissorTest(): boolean
  setViewport(viewport: V): void
  setScissor(scissor: V): void
  setScissorTest(enabled: boolean): void
  setRenderTarget(target: unknown, face?: number, mip?: number): void
}

export type RendererTargetState<V> = {
  target: unknown
  face: number
  mip: number
  viewport: V
  scissor: V
  scissorTest: boolean
}

export function captureRendererTargetState<V>(
  renderer: TargetStateRenderer<V>,
  Vector4: Ctor<V>,
): RendererTargetState<V> {
  return {
    target: renderer.getRenderTarget(),
    face: renderer.getActiveCubeFace(),
    mip: renderer.getActiveMipmapLevel(),
    viewport: renderer.getViewport(new Vector4()),
    scissor: renderer.getScissor(new Vector4()),
    scissorTest: renderer.getScissorTest(),
  }
}

export function restoreRendererTargetState<V>(renderer: TargetStateRenderer<V>, state: RendererTargetState<V>): void {
  renderer.setViewport(state.viewport)
  renderer.setScissor(state.scissor)
  renderer.setScissorTest(state.scissorTest)
  renderer.setRenderTarget(state.target, state.face, state.mip)
}
