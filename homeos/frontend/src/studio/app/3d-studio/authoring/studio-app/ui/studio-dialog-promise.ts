/**
 * 把页面内 `<dialog>` 的「确认 / 取消 / ESC」收敛成一个 Promise。
 *
 * 为什么单独成模块：楼层删除、导出存档删除、灯光提示三处都是同一个模式 ——
 * 这些提示必须是 studio 自己的窄版弹窗（0.8.7 里有专用小标与配色），
 * 而 `openDialog` / `showModal` 的结算逻辑（含 ESC、点遮罩、重复打开）写三遍必然是复制粘贴。
 */

export interface DialogPromiseBinding {
  dialog: HTMLDialogElement
  /** 确认按钮；提示类弹窗可以传同一个「知道了」按钮。 */
  confirm: Element | null
  /** 取消 / 关闭按钮：点任意一个都按取消结算。 */
  cancels: Element[]
  /** 打开前的填充（把楼层名、存档名、灯数写进弹窗）。 */
  prepare?: () => void
}

/**
 * 打开并等待用户选择。
 *
 * @returns `true` = 确认，`false` = 取消 / ESC / 点遮罩关闭
 */
export function openDialogPromise(binding: DialogPromiseBinding): Promise<boolean> {
  binding.prepare?.()
  // 上一次没关干净时先关：`showModal()` 对已打开的 dialog 会抛 InvalidStateError。
  if (binding.dialog.open) binding.dialog.close()
  return new Promise<boolean>((resolve) => {
    const finish = (accepted: boolean) => {
      binding.dialog.removeEventListener('close', onClose)
      binding.confirm?.removeEventListener('click', onConfirm)
      for (const button of binding.cancels) button.removeEventListener('click', onCancel)
      if (binding.dialog.open) binding.dialog.close()
      resolve(accepted)
    }
    // ESC / 点遮罩都会派发 `close`，一律按取消处理。
    const onClose = () => finish(false)
    const onConfirm = (event: Event) => {
      event.preventDefault()
      finish(true)
    }
    const onCancel = (event: Event) => {
      event.preventDefault()
      finish(false)
    }
    binding.dialog.addEventListener('close', onClose)
    binding.confirm?.addEventListener('click', onConfirm)
    for (const button of binding.cancels) button.addEventListener('click', onCancel)
    binding.dialog.showModal()
  })
}

/** 按 id 取多个元素，滤掉不存在的（宿主页面可能没渲染全）。 */
export function elementsById(ids: string[]): HTMLElement[] {
  return ids.map((id) => globalThis.document.getElementById(id)).filter((element): element is HTMLElement => !!element)
}
