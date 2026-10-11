/** 设置编排内核 · 保存编排 */
import { handleSystemConfigPatchError } from '@/composables/config/system-config-core.internals'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { notifyError } from '@/services/notify'
import { ref } from 'vue'

// ── useSettingsSave ──
export function useSettingsSave() {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const saving = ref(false)

  async function runSave(
    fn: () => unknown | Promise<unknown>,
    {
      errorContext,
      onError,
    }: { errorContext?: string; onError?: (error: unknown) => unknown | Promise<unknown> } = {},
  ) {
    saving.value = true
    try {
      return await fn()
    } catch (e) {
      if (await handleSystemConfigPatchError(e, chrome)) {
        if (onError) await onError(e)
        return false
      }
      if (onError) {
        await onError(e)
        return false
      }
      notifyError(e, errorContext || '保存设置')
      return false
    } finally {
      saving.value = false
    }
  }

  async function onSave(options?: { errorContext?: string; onError?: (error: unknown) => void }) {
    return runSave(async () => {
      const ok = await layoutStore.saveConfig()
      // saveConfig 失败时已 toast 并返回 false（不抛异常）
      return ok
    }, options)
  }

  return { saving, onSave, runSave }
}
