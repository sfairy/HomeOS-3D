/**
 * 场景级不变量：窗洞必须完整落在墙体洞口里。
 *
 * 从 `layout.ts` 拆出来（文件大小门禁），但更重要的是这条边界本身：
 * `layout.ts` 负责**单扇**窗户的树结构与尺寸，这里负责**墙 → 窗**的跨对象约束，
 * 也就是「画面上会漏出窗框穿墙」的那一类错误。
 */
import { isCustomWindow, validateWindowRecord } from '@app/shared/scene/window/layout'

/** 场景里每一扇越界窗的「身份 → 带窗名的文案」。 */
function windowSceneErrors(scene: any, pixelsPerMeter: number): { id: string; message: string }[] {
  const errors: { id: string; message: string }[] = []
  for (const [index, window] of (scene.windows || []).entries()) {
    if (window.windowDesign === undefined) continue
    const label = window.remark ? `窗户「${window.remark}」` : `第 ${index + 1} 扇窗户`
    try {
      validateWindowRecord(window)
      if (!isCustomWindow(window)) continue
      const wall = scene.walls.find((candidate: any) => candidate.id === window.wallId)
      if (!wall) throw Error('缺少所在墙体。')
      const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) / pixelsPerMeter
      // 报错要带数字：用户量不出「多了 3 mm」，只看到「超出墙体」只会反复点应用。
      // 毫米取整后再判，避免 7.000 与 6.9966 在文案里都显示成 7 m。
      const mm = (value: number) => Math.round(value * 1000)
      if (window.width > length + 0.000001)
        throw Error(`超出墙体：窗宽 ${mm(window.width)} mm，墙长只有 ${mm(length)} mm。请先缩窄窗宽或加长墙体。`)
      if (window.sill < 0) throw Error('窗台高度不能为负，请先调整窗台。')
      if (window.sill + window.height > wall.height + 0.000001)
        throw Error(
          `超出墙体：窗顶 ${mm(window.sill + window.height)} mm，墙高只有 ${mm(wall.height)} mm。请先降低窗高或窗台。`,
        )
    } catch (error) {
      errors.push({ id: String(window.id ?? index), message: `${label}：${(error as Error).message}` })
    }
  }
  return errors
}

/** 场景级错误提示：自定义窗必须落在墙体洞口内。返回空串表示通过。
 *
 * 文案必须指名是**哪一扇**：一个户型十几扇窗，只说「自定义窗户超出墙体」时用户
 * 既不知道改哪扇，也不知道差多少毫米（0.8.4 的现场就是 7.000 m 窗塞 6.997 m 墙，
 * 差 3 mm，看上去完全像按钮坏了）。
 */
export function windowSceneError(scene: any, pixelsPerMeter: number): string {
  return windowSceneErrors(scene, pixelsPerMeter)[0]?.message ?? ''
}

/** 拓扑校验：墙体改动后不能有窗洞被新墙穿过。返回空串表示通过。 */
export function windowTopologyError(beforeScene: any, afterScene: any, pixelsPerMeter: number): string {
  // 只拦「本次改动新造出来的」越界。改动前就已经越界的窗（例如旧草稿）如果也算进来，
  // 用户连挪一下家具、改一堵无关的墙都会被回滚 —— 那时他既修不了那扇窗，也做不了别的，
  // 整个编辑器卡死。既存问题留给保存边界（后端 422）用带窗名的文案报。
  const beforeMessages = new Map(
    windowSceneErrors(beforeScene, pixelsPerMeter).map((entry) => [entry.id, entry.message]),
  )
  const freshError = windowSceneErrors(afterScene, pixelsPerMeter).find(
    (entry) => beforeMessages.get(entry.id) !== entry.message,
  )
  if (freshError) return freshError.message
  const anchorOf = (window: any, scene: any) => {
    const wall = scene.walls.find((candidate: any) => candidate.id === window.wallId)
    return (
      wall && {
        x: wall.start.x + (wall.end.x - wall.start.x) * window.t,
        y: wall.start.y + (wall.end.y - wall.start.y) * window.t,
      }
    )
  }
  for (const window of beforeScene.windows || []) {
    if (!isCustomWindow(window)) continue
    const afterWindow = afterScene.windows.find((candidate: any) => candidate.id === window.id)
    const before = anchorOf(window, beforeScene)
    const after = afterWindow && anchorOf(afterWindow, afterScene)
    if (!before || !after || Math.hypot(before.x - after.x, before.y - after.y) > pixelsPerMeter * 0.000001)
      return '新墙体穿过自定义窗洞，请调整墙体或窗户位置。'
  }
  return ''
}
