/**
 * 户型绘制里走**页面内对话框**的确认 / 提示（0.8.7 `#floor-delete-dialog` / `#drawing-light-notice-dialog`）。
 *
 * 为什么不用外壳的 `shellConfirm`：0.8.7 这两个提示是 studio 自己的 `<dialog>`，
 * 带 `DELETE FLOOR` / `LIGHTING NOTICE` 的英文小标与专用配色；换成外壳通用确认框后
 * 弹窗位置、宽度、按钮层级都和参考站不一致（同一句文案、两套外观）。
 * 页面里找不到对应 dialog 时（例如被嵌入到别的页面）才回落到 `shellConfirm`，保证功能不丢。
 */
import { shellConfirm } from '@/studio/platform/shell-chrome'
import { elementsById, openDialogPromise } from './studio-dialog-promise'

export function confirmFloorDeletion(floorName: string): Promise<boolean> {
  const documentNode = globalThis.document
  const dialog = documentNode.getElementById('floor-delete-dialog') as HTMLDialogElement | null
  const nameElement = documentNode.getElementById('floor-delete-name')
  const confirmButton = documentNode.getElementById('floor-delete-confirm')
  if (!dialog || !nameElement || !confirmButton) {
    return shellConfirm({
      title: '删除这个楼层？',
      message: '确定删除“' + floorName + '”吗？这一层的绘图数据不会保留，此操作无法撤销。',
      confirmLabel: '删除楼层',
      cancelLabel: '取消',
      tone: 'danger',
    })
  }
  return openDialogPromise({
    dialog,
    confirm: confirmButton,
    cancels: elementsById(['floor-delete-cancel', 'floor-delete-close']),
    prepare: () => {
      nameElement.textContent = floorName
    },
  })
}

export function showDrawingLightNotice(litLightCount: number): Promise<void> {
  const documentNode = globalThis.document
  const dialog = documentNode.getElementById('drawing-light-notice-dialog') as HTMLDialogElement | null
  const countElement = documentNode.getElementById('drawing-light-notice-count')
  if (!dialog || !countElement) {
    return shellConfirm({
      title: '灯光开启较多',
      message:
        '同时开启较多灯光可能导致卡顿，建议配置完成后关闭，需要时再开启。\n\n当前已开启：' + litLightCount + ' 盏',
      confirmLabel: '知道了',
      cancelLabel: '关闭',
    }).then(() => undefined)
  }
  return openDialogPromise({
    dialog,
    // 提示只有一个按钮：确认就够，ESC / 点遮罩同样关闭。
    confirm: dialog.querySelector('.primary-action'),
    cancels: [],
    prepare: () => {
      countElement.textContent = `${litLightCount} 盏`
    },
  }).then(() => undefined)
}
