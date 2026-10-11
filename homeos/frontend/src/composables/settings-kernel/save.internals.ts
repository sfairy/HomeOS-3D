/**
 * 设置编排内核 · 保存编排
 *
 * 职责：把调用方传入的保存动作包进统一三件套 —— saving 忙态、系统配置补丁错误识别
 *       （handleSystemConfigPatchError，用于「需要重启/需改配置文件」等特殊错误）、
 *       兜底 toast（notifyError）。
 *
 * 归属说明：本文件原先内嵌在 features/settings 的 hub-ui.internals 中，因它绑定
 *          useLayoutStore.saveConfig() 而无法下沉到 shared/（shared 禁反向依赖 stores），
 *          故落在跨层池 composables/settings-kernel/，供 features/settings 与
 *          features/home-mode 等「内嵌编辑面板」的域平等共用，避免域间伪依赖方向。
 *
 * 依赖：
 *   - @/stores/layout.store - saveConfig()
 *   - @/stores/chrome.store - 通知
 *   - @/composables/config/system-config-core.internals - 系统配置补丁错误识别
 *   - @/services/notify - 兜底错误提示
 *   - vue - 响应式
 */
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
