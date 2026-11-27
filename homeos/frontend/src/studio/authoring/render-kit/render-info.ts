type RenderInfoLike = { calls: number; triangles: number; lines: number }

/** 上一次写进 data-* 的数值；初值 -1 保证第一帧必写。 */
export type RenderInfoSnapshot = RenderInfoLike

export function createRenderInfoSnapshot(): RenderInfoSnapshot {
  return { calls: -1, triangles: -1, lines: -1 }
}

/**
 * 把 `renderer.info.render` 同步到画布的 `data-render-*`（统计 HUD 与 publishRenderStats 从这里读）。
 * 只在数值变化时写：每帧无条件写属性会触发 DOM 属性变更并分配字符串。
 */
export function syncRenderInfoDataset(dataset: DOMStringMap, render: RenderInfoLike, last: RenderInfoSnapshot): void {
  if (render.calls !== last.calls) {
    last.calls = render.calls
    dataset.renderCalls = String(render.calls)
  }
  if (render.triangles !== last.triangles) {
    last.triangles = render.triangles
    dataset.renderTriangles = String(render.triangles)
  }
  if (render.lines !== last.lines) {
    last.lines = render.lines
    dataset.renderLines = String(render.lines)
  }
}
