/**
 * @file system-config-panel-nav.internals.ts
 * @module frontend/src/views
 */
/** 高级参数：分区跳转 / 校验定位 */
import { categoryForSection } from '@/composables/config/system-config-core.internals'
import { nextTick, type Ref } from 'vue'
import type { EditableConfigSection } from '@/shared/types/system-config-editor'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

export function createSystemConfigPanelNav(opts: {
  route: RouteLocationNormalizedLoaded
  globalSearch: Ref<string>
  sectionList: Ref<EditableConfigSection[]>
  visibleSectionList: Ref<EditableConfigSection[]>
  expertMode: Ref<boolean>
  activeSection: Ref<string>
  activeCategory: Ref<string>
  setExpertMode: (on: boolean) => Promise<void>
}) {
  const {
    route,
    globalSearch,
    sectionList,
    visibleSectionList,
    expertMode,
    activeSection,
    activeCategory,
    setExpertMode,
  } = opts
  async function navigateToValidationError(err: { section: string; key: string }) {
    if (!err?.section || !err?.key) return
    globalSearch.value = ''
    await applyParamsSection(err.section)
    await nextTick()
    const el = document.querySelector(`[data-field-id="${err.section}-${err.key}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    if (el instanceof HTMLElement) {
      el.classList.add('params-cell--focus')
      setTimeout(() => el.classList.remove('params-cell--focus'), 2200)
    }
    const input = el?.querySelector('input, textarea, select, button.toggle-btn') as
      | HTMLElement
      | null
    input?.focus({ preventScroll: true })
  }

  async function applyParamsSection(section: string) {
    if (!sectionList.value.some((s) => s.key === section)) return
    if (!expertMode.value && !visibleSectionList.value.some((s) => s.key === section)) {
      await setExpertMode(true)
      // 用户取消切专家模式时，不要硬切到不可见分区
      if (!expertMode.value && !visibleSectionList.value.some((s) => s.key === section)) return
    }
    activeSection.value = section
    activeCategory.value = categoryForSection(section)
    // 不二次调用 paramsDock.selectSection：侧栏会通过 activeSection watch 展开分类；
    // 路由 onApply 再调 selectSection 会造成「展开又被拽回」的回环感
  }

  async function applySectionFromRoute() {
    const section = route.query.section
    if (typeof section === 'string' && section) await applyParamsSection(section)
  }


  return { navigateToValidationError, applyParamsSection, applySectionFromRoute }
}
