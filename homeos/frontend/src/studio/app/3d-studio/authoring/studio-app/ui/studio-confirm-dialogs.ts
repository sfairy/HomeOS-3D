/** 户型绘制里走外壳 shellConfirm 的确认 / 提示框文案。 */
import { shellConfirm } from '@/studio/platform/shell-chrome'

export function confirmFloorDeletion(floorName: string): Promise<boolean> {
  return shellConfirm({
    title: '删除这个楼层？',
    message: '确定删除“' + floorName + '”吗？这一层的绘图数据不会保留，此操作无法撤销。',
    confirmLabel: '删除楼层',
    cancelLabel: '取消',
    tone: 'danger',
  })
}

export async function showDrawingLightNotice(litLightCount: number): Promise<void> {
  await shellConfirm({
    title: '灯光开启较多',
    message: '同时开启较多灯光可能导致卡顿，建议配置完成后关闭，需要时再开启。\n\n当前已开启：' + litLightCount + ' 盏',
    confirmLabel: '知道了',
    cancelLabel: '关闭',
  })
}
