/** 「保存并退出」/ 删除前的交互收尾确认：走外壳 chrome.confirm / VConfirmModal，
 * 与设备页、离开确认同一套主题，不再手写一套 scale-dialog。
 */

import { shellConfirm } from '@/studio/platform/shell-chrome'

/**
 * @param interactionImpact 保存失败详情（`null` 表示只是普通交互收尾）
 * @param undoDeletion 撤销本次待保存的删除（同宿主助手，显式传入）
 * @param showToast 提示气泡（同宿主助手，显式传入）
 */
export async function resolveInteractionCleanup(
  interactionImpact: any,
  undoDeletion: () => Promise<any> | any,
  showToast: (message: string, kind?: string) => void,
): Promise<boolean> {
  const affectedProjects: string[] = Array.isArray(interactionImpact?.projects)
    ? interactionImpact.projects.map((project: any) => String(project))
    : []
  const affectedImpacts: number = Array.isArray(interactionImpact?.impacts)
    ? interactionImpact.impacts.length
    : 0

  const projectSummary = affectedProjects.length ? affectedProjects.join('、') : '未记录'
  const message = [
    '确认后会移除仪表盘里对应的入口，并清理这些交互绑定；组合中的另一成员会保留。',
    '',
    `受影响仪表盘：${affectedProjects.length} 个（${projectSummary}）`,
    `交互绑定：${affectedImpacts} 项`,
    '',
    '不删除 HA 实体，也不发送设备指令。',
    '撤销删除会恢复本次移除的楼层、模型和灯组，并保留其他修改。',
  ].join('\n')

  const confirmed = await shellConfirm({
    title: '删除关联的 3D 交互配置？',
    message,
    confirmLabel: '确认删除并保存',
    cancelLabel: '撤销删除',
    tone: 'danger',
  })

  if (confirmed) return true

  /* 取消 / Esc / 关闭：与「撤销删除」同义，恢复本次删除后再拦下保存。 */
  try {
    await undoDeletion()
  } catch (cleanupRestoreFailure: any) {
    showToast(cleanupRestoreFailure?.message || '恢复删除失败，请重试。', 'error')
  }
  return false
}
