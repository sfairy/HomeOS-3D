/**
 * 失效配置检查与修复（0.8.4）。
 *
 * 复制控件 / 删除模型后，文档里会残留指向已不存在模型的绑定。后端
 * `POST /projects/{id}/binding-check` 返回可移除的失效项；这里负责
 * 「先列清单 → 用户确认 → 再检查一次（防止期间户型已改）→ 返回清理后的文档」。
 */

import { shellConfirm } from '@/studio/platform/shell-chrome'

export interface BindingRepairIssue {
  componentLabel?: string
  label?: string
  reason?: string
  [key: string]: any
}

export function hasInteractionBindings(bindingTree: any): boolean {
  if (!bindingTree || typeof bindingTree !== 'object') return true
  if (bindingTree.type === 'interaction3d') return false
  return Object.values(bindingTree).some(hasInteractionBindings)
}

export async function confirmBindingRepair(
  issues: BindingRepairIssue[],
  { mode, signal }: any,
): Promise<boolean> {
  if (signal?.aborted) return false
  const issueLines = issues
    .map(
      (issue) =>
        String(issue.componentLabel || '') + ' · ' + String(issue.label || '') + '：' + String(issue.reason || ''),
    )
    .join('\n')
  const title = mode === 'copy' ? '待复制控件中有失效配置' : '检查失效配置'
  const lead =
    mode === 'copy'
      ? '发现 ' +
        issues.length +
        ' 项失效配置。确认后从待复制的副本中移除，源控件保持原样。也可以取消后重新关联模型。'
      : '发现 ' +
        issues.length +
        ' 项失效配置。确认后移除以下配置，保留其他设置和 HA 实体。完成后请点击顶部“保存”；也可以取消后重新关联模型。'
  const confirmed = await shellConfirm({
    title,
    message: lead + (issueLines ? '\n\n' + issueLines : ''),
    confirmLabel: mode === 'copy' ? '移除失效项并继续复制' : '移除列出的失效配置',
    cancelLabel: '取消，保留配置',
    tone: 'danger',
  })
  return !signal?.aborted && confirmed
}

export function createBindingRepair({
  api,
  confirm = confirmBindingRepair,
}: {
  api: (path: string, options?: Record<string, any>) => Promise<any>
  confirm?: typeof confirmBindingRepair
}) {
  let activeRequest: AbortController | null = null
  const cancel = () => {
    activeRequest?.abort(), (activeRequest = null)
  }

  async function prepare({
    panelDocument,
    componentIds = [],
    mode = 'repair',
    isCurrent = () => true,
  }: any): Promise<any> {
    cancel()
    if (!hasInteractionBindings(panelDocument)) return { document: panelDocument, issues: [] }
    const requestController = new AbortController()
    activeRequest = requestController
    const { signal } = requestController,
      isStillCurrent = () => !signal.aborted && isCurrent(),
      requestBody = JSON.stringify({ document: panelDocument, componentIds }),
      checkBindings = async () => {
        const timeoutId = setTimeout(() => requestController.abort(), 15000)
        try {
          return await api('/projects/' + encodeURIComponent(panelDocument.projectId) + '/binding-check', {
            method: 'POST',
            body: requestBody,
            signal,
          })
        } finally {
          clearTimeout(timeoutId)
        }
      }
    try {
      const firstCheck = await checkBindings()
      if (!isStillCurrent()) return null
      if (!firstCheck.issues.length) return firstCheck
      if (!(await confirm(firstCheck.issues, { mode, signal })) || !isStillCurrent()) return null
      const repairedCheck = await checkBindings()
      if (!isStillCurrent()) return null
      if (JSON.stringify(repairedCheck.issues) !== JSON.stringify(firstCheck.issues))
        throw new Error('户型已更新，失效项已变化，未清理任何配置。请重新检查。')
      return repairedCheck
    } catch (repairError: any) {
      if (!isCurrent() || activeRequest !== requestController) return null
      throw signal.aborted ? new Error('检查已取消或超时，配置保持不变，请重试。') : repairError
    } finally {
      activeRequest === requestController && (activeRequest = null), requestController.abort()
    }
  }

  return { prepare, cancel }
}
