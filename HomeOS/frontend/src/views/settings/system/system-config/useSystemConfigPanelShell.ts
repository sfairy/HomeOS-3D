/**
 * 文件：useSystemConfigPanelShell.ts
 * 所属模块：frontend / src / views / settings / system / system-config
 * 职责：高级参数面板 shell composable。管理分区导航（上一组/下一组）、搜索模式、
 *       字段分组（buildGroupedFieldEntries）、滚动定位与专家/开发 key 开关。
 * 关键依赖：
 *   - vue 的 ref / computed / watch / onMounted / onUnmounted / nextTick
 *   - useLayoutStore / useChromeStore：布局与通知
 *   - useRouter：路由
 *   - buildGroupedFieldEntries：字段分组
 *   - isDevBuild：开发构建判定
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { isDevBuild } from '@/utils/core/misc.util'
import { buildGroupedFieldEntries } from '@/views/settings/shared/system-config/field-groups.util'

type ConfigField = { value: unknown; isMasked?: boolean }
type InputFieldEntry = { key: string; value?: unknown; isMasked?: boolean }

/** useSystemConfigPanelShell：函数，按签名入参返回处理结果。 */
export function useSystemConfigPanelShell({
  activeTab,
  ensureLoaded,
  activeSection,
  currentSection,
  inputFields,
  goPrevSection,
  goNextSection,
  isSearchMode,
}: {
  activeTab: Ref<string>
  ensureLoaded: (tab: string) => void
  activeSection: Ref<string>
  currentSection: Ref<{ key?: string; fields?: unknown[] } | null>
  inputFields: Ref<InputFieldEntry[]>
  goPrevSection: () => void
  goNextSection: () => void
  isSearchMode?: Ref<boolean>
}) {
  const router = useRouter()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const mainScrollRef = ref<HTMLElement | null>(null)

  const screensaverPreviewActive = computed(() => !!chrome.screensaverPreview?.token)
  const displayFields = computed(() => currentSection.value?.fields || [])
  const inputFieldEntries = computed(() =>
    buildGroupedFieldEntries(String(currentSection.value?.key || activeSection.value || ''), inputFields.value),
  )

  function previewScreensaver(mode: string) {
    if (!isDevBuild) return
    requestAnimationFrame(() => chrome.previewScreensaver(mode))
  }

  function closeScreensaverPreview() {
    if (!isDevBuild) return
    chrome.closeScreensaverPreview()
  }

  function previewWeatherEffect(state: string) {
    if (!isDevBuild) return
    if (!layoutStore.layoutConfig.debugMode) {
      layoutStore.layoutConfig.debugMode = true
      chrome.notify('已自动开启调试模式以预览天气特效', 'info')
    }
    if (state === 'night') {
      chrome.setDebugWeather('night')
    } else {
      chrome.setDebugWeather(state)
    }
    router.push('/')
  }

  function onFieldValueUpdate(field: ConfigField, value: unknown) {
    field.value = value
  }

  function onFieldMaskedUpdate(field: ConfigField, isMasked: boolean) {
    field.isMasked = isMasked
  }

  watch(
    () => activeTab.value,
    (tab) => ensureLoaded(tab),
    { immediate: true },
  )
  watch(activeSection, () => {
    // 搜索态点侧栏会改 activeSection 做高亮，但主区仍是搜索结果，勿滚回顶部
    if (isSearchMode?.value) return
    nextTick(() => mainScrollRef.value?.scrollTo({ top: 0 }))
  })

  function onPanelKeydown(e: KeyboardEvent) {
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    if (isSearchMode?.value) return
    const t = e.target as HTMLElement | null
    if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return
    if (!document.querySelector('.params-shell')) return
    e.preventDefault()
    if (e.key === 'ArrowLeft') goPrevSection()
    else goNextSection()
  }

  onMounted(() => window.addEventListener('keydown', onPanelKeydown))
  onUnmounted(() => window.removeEventListener('keydown', onPanelKeydown))

  return {
    mainScrollRef,
    screensaverPreviewActive,
    displayFields,
    inputFieldEntries,
    previewScreensaver,
    closeScreensaverPreview,
    previewWeatherEffect,
    onFieldValueUpdate,
    onFieldMaskedUpdate,
  }
}
