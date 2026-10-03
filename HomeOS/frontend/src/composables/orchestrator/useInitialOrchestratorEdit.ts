/**
 * 联动器 Builder 深度链接初始编辑组合式函数
 *
 * 所属模块：composables/orchestrator
 * 职责：支持通过路由查询参数 `?edit=<id>` 直接打开已保存的联动/场景/脚本项进入编辑态；
 *      监听初始编辑 ID 变更、已保存列表加载、以及 KeepAlive 组件重新激活三种时机，
 *      在列表中匹配对应 ID 并调用 editItem 打开编辑器。
 * 入参：
 *   - getInitialEditId：返回当前深度链接 ID 的 getter
 *   - savedList：已保存项的列表 ref
 *   - editingId：当前正在编辑的 ID ref
 *   - editItem：打开编辑器的异步回调
 * 返回 applyInitialEdit 手动触发函数。
 */
import { watch, onActivated, type Ref } from 'vue'
import type { OrchestratorSavedItem } from '@/types/orchestrator-builder'
/**
 * 深度链接支持：当 `initialEditId` 被设置时打开已保存的项（路由 ?edit=）。
 * 监听列表加载、ID 变更和 KeepAlive 重新激活。
 */
export function useInitialOrchestratorEdit(
  getInitialEditId: () => string | null | undefined,
  savedList: Ref<Array<{ id?: string | number; [key: string]: unknown }>>,
  editingId: Ref<string | null | undefined>,
  editItem: (item: OrchestratorSavedItem) => Promise<void> | void,
) {
  let lastAppliedId = ''
  async function applyInitialEdit() {
    const id = getInitialEditId()?.trim() || ''
    if (!id || !savedList.value.length) return
    if (lastAppliedId === id && editingId.value === id) return
    const item = savedList.value.find((i) => String(i.id) === id)
    if (!item) return
    await editItem(item as OrchestratorSavedItem)
    lastAppliedId = id
  }
  watch(getInitialEditId, (id, prev) => {
    const next = (id || '').trim()
    const old = (prev || '').trim()
    if (next !== old) {
      lastAppliedId = ''
      applyInitialEdit()
    }
  })
  watch(savedList, () => {
    const id = getInitialEditId()?.trim() || ''
    if (!id || lastAppliedId === id) return
    applyInitialEdit()
  })
  onActivated(() => {
    applyInitialEdit()
  })
  return { applyInitialEdit }
}
