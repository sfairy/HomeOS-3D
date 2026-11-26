/**
 * 平面画布的 2D 上下文（0.8.9 起从 `boot.ts` 切出）。
 *
 * 嵌入舞台可能只挂一个隐藏 stub，缺节点时用离屏 canvas —— 否则 `bootStudio` 会在
 * 同步阶段抛异常，表现为「永不出图且没有报错」。
 */
export function planCanvasContext(canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  return (canvas || document.createElement('canvas')).getContext('2d')
}
