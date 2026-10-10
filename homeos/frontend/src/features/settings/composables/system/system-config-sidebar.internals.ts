/**
 * 系统配置参数侧边栏组合式函数。
 *
 * 职责：
 *   - 声明系统配置分区的中文标签与委托面板跳转链接（语音 / 天气特效 / 能源预算等）；
 *   - 提供侧边栏分类导航（按 category 折叠展开、搜索过滤、活跃高亮）；
 *   - 维护全局搜索输入框与导航容器的 DOM 引用，支持滚动定位到当前分区。
 * 依赖：
 *   - vue（computed / nextTick / onMounted / onUnmounted / ref / watch）
 *   - @/composables/config/system-config-core.internals（分区分类与元信息）
 *   - @/utils/registry/settings-route.util（设置路由）
 */
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { categoryForSection, getSectionCategories, sectionMeta } from '@/composables/config/system-config-core.internals'

/** SECTION_LINK_LABELS：对象常量，字段 / 方法语义见定义处。 */
export const SECTION_LINK_LABELS: Record<string, string> = {
  access: '访问控制',
  envSensorMap: '环境与健康',
  clientPower: '智能充放电',
  mediaPlaylists: '播放列表',
  profiles: '方案备份',
  voice: '语音中心',
  weatherEffects: '天气特效',
}

/** DELEGATED_PANEL_LINKS：常量集合，成员语义见定义处。 */
export const DELEGATED_PANEL_LINKS = [
  { id: 'voice', to: SETTINGS_ROUTES.voice() },
  { id: 'weatherEffects', to: SETTINGS_ROUTES.general('weather-effects') },
  { id: 'envSensorMap', to: SETTINGS_ROUTES.envHealth() },
  { id: 'clientPower', to: SETTINGS_ROUTES.smartCharge() },
  { id: 'profiles', to: SETTINGS_ROUTES.profiles() },
]

/** DELEGATED_ACTION_ITEMS：常量集合，成员语义见定义处。 */
export const DELEGATED_ACTION_ITEMS = [{ id: 'mediaPlaylists' }]
/** DELEGATED_COUNT：常量，取值语义见定义处。 */
export const DELEGATED_COUNT = DELEGATED_PANEL_LINKS.length + DELEGATED_ACTION_ITEMS.length

interface SystemConfigSectionRow {
  key: string
  label: string
  fields: unknown[]
}

interface SystemConfigParamsSidebarProps {
  sectionList: SystemConfigSectionRow[]
  searchResultCount: number
  searchMatchMap?: Record<string, number>
  globalSearch: string
  activeSection: string
  activeCategory: string
  expertMode: boolean
  showDevKeys: boolean
  sectionPendingMap: Record<string, number>
}

type SidebarEmit = {
  (event: 'update:globalSearch', value: string): void
  (event: 'update:activeSection', value: string): void
  (event: 'update:activeCategory', value: string): void
  (event: 'update:expertMode', value: boolean): void
  (event: 'update:showDevKeys', value: boolean): void
}

/** 系统配置参数侧边栏：派生分类导航、搜索过滤与活跃分区滚动定位，供 SystemConfigParamsSidebar 组件使用 */
export function useSystemConfigParamsSidebar(
  props: SystemConfigParamsSidebarProps,
  emit: SidebarEmit,
) {
  const searchRef = ref<HTMLInputElement | null>(null)
  const navRef = ref<HTMLElement | null>(null)
  const mediaPlaylistOpen = ref(false)

  const expandedCategoryId = ref<string | null>(
    props.activeSection ? categoryForSection(props.activeSection) : 'display',
  )

  const sectionCategories = computed(() => getSectionCategories())

  const categoryNav = computed(() =>
    sectionCategories.value
      .map((cat) => {
        const order = cat.sections
        const sections = props.sectionList
          .filter((s) => order.includes(s.key))
          .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
        return {
          ...cat,
          sections,
          fieldCount: sections.reduce((n, s) => n + s.fields.length, 0),
        }
      })
      .filter((cat) => cat.sections.length > 0),
  )

  function isCategoryExpanded(catId: string) {
    // 搜索态：有匹配的分类全部展开，避免匹配项被手风琴藏掉
    if (String(props.globalSearch || '').trim()) {
      const cat = categoryNav.value.find((c) => c.id === catId)
      if (!cat) return false
      const matchMap = props.searchMatchMap || {}
      return cat.sections.some((s) => (matchMap[s.key] || 0) > 0)
    }
    return expandedCategoryId.value === catId
  }

  function expandCategory(catId: string) {
    expandedCategoryId.value = catId
  }

  function ensureCategoryExpanded(catId: string) {
    expandCategory(catId)
  }

  function categoryPendingCount(cat: { sections: SystemConfigSectionRow[] }) {
    return cat.sections.some((s) => (props.sectionPendingMap[s.key] ?? 0) > 0)
  }

  function toggleCategory(catId: string) {
    // 搜索态不切手风琴，避免藏掉匹配项
    if (String(props.globalSearch || '').trim()) return
    // 再点已展开分类 → 收起
    if (expandedCategoryId.value === catId) {
      expandedCategoryId.value = null
      return
    }
    expandedCategoryId.value = catId
    // 展开其它分类时：若当前分区不在该分类，同步打开该分类第一项
    const cat = categoryNav.value.find((c) => c.id === catId)
    const first = cat?.sections?.[0]
    if (!first) return
    if (cat.sections.some((s) => s.key === props.activeSection)) return
    selectSection(first.key)
  }

  function scrollActiveIntoView() {
    const container = navRef.value
    const el = container?.querySelector('.params-sidebar__item--active') as HTMLElement | null
    if (!container || !el) return

    // 只滚动侧栏自身，避免 scrollIntoView 牵动主内容区 / 页面
    const cRect = container.getBoundingClientRect()
    const eRect = el.getBoundingClientRect()
    const pad = 6
    if (eRect.top < cRect.top + pad) {
      container.scrollTop -= cRect.top + pad - eRect.top
    } else if (eRect.bottom > cRect.bottom - pad) {
      container.scrollTop += eRect.bottom - (cRect.bottom - pad)
    }

    // 窄屏横向分类条：把当前项所属分组滚入视野
    if (container.scrollWidth > container.clientWidth) {
      const group = el.closest('.params-sidebar__group') as HTMLElement | null
      if (!group) return
      const gRect = group.getBoundingClientRect()
      if (gRect.left < cRect.left + pad) {
        container.scrollLeft -= cRect.left + pad - gRect.left
      } else if (gRect.right > cRect.right - pad) {
        container.scrollLeft += gRect.right - (cRect.right - pad)
      }
    }
  }

  function selectSection(key: string) {
    const catId = categoryForSection(key)
    ensureCategoryExpanded(catId)
    emit('update:activeCategory', catId)
    emit('update:activeSection', key)
    nextTick(scrollActiveIntoView)
  }

  function onDelegatedAction(id: string) {
    if (id === 'mediaPlaylists') mediaPlaylistOpen.value = true
  }

  function onGlobalKeydown(e: KeyboardEvent) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
    const target = e.target as HTMLElement | null
    const tag = target?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable)
      return
    e.preventDefault()
    searchRef.value?.focus()
  }

  watch(
    categoryNav,
    (cats) => {
      if (!cats.length) return
      if (cats.some((c) => c.id === expandedCategoryId.value)) return
      expandedCategoryId.value = cats[0].id
    },
    { immediate: true },
  )

  watch(
    () => props.activeSection,
    (key) => {
      if (!key) return
      // 搜索态由 isCategoryExpanded 自行展开匹配分类，勿把手风琴拽回单一分类
      if (String(props.globalSearch || '').trim()) return
      const catId = categoryForSection(key)
      ensureCategoryExpanded(catId)
      emit('update:activeCategory', catId)
      nextTick(scrollActiveIntoView)
    },
    { immediate: true },
  )

  onMounted(() => {
    window.addEventListener('keydown', onGlobalKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onGlobalKeydown)
  })

  return {
    searchRef,
    navRef,
    mediaPlaylistOpen,
    categoryNav,
    isCategoryExpanded,
    categoryPendingCount,
    toggleCategory,
    selectSection,
    onDelegatedAction,
    sectionMeta,
  }
}
