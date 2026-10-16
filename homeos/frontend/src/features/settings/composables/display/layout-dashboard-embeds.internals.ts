/**
 * @file layout-dashboard-embeds.internals.ts
 * @module frontend/src/views
 */
/** 设置：嵌入页 Hub */
import { useDropdownPosition } from '@/composables/ui/useDropdownPosition'
import { useClickOutside } from '@/composables/ui/useClickOutside'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { EMBED_ICON_LABELS, embedIconMap, embedLucidIcons, resolveEmbedIconByIndex } from '@/shared/utils/layout/embed-icons.util'
import { EMBED_TAB_ACCENTS, resolveEmbedIconAccent, resolveEmbedTabAccent } from '@/shared/utils/layout/embed-nav-theme.util'
import { getEmbedBlockReason } from '@/shared/utils/layout/embed-url.util'
import { pruneNavTabsForRemovedEmbed } from '@/shared/utils/layout/nav-tabs.util'
import { copyTextWithNotify } from '@/services/notify'
import { useSettingsHubRouteSection } from '@/features/settings/composables/hub-ui.internals'
import { computed, ref, watch } from 'vue'

// ── useSettingsEmbeds ──
export function useSettingsEmbeds(activeTabProp: () => string) {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const activeEmbedId = ref('')
  const iconPickerOpen = ref(false)
  const iconPickerRef = ref<HTMLElement | null>(null)
  const iconPickerPanelRef = ref<HTMLElement | null>(null)

  const {
    dropdownStyle: iconPickerDropdownStyle,
    teleportTarget: iconPickerTeleportTarget,
    placement: iconPickerPlacement,
    teleportDisabled: iconPickerTeleportDisabled,
  } = useDropdownPosition(iconPickerRef, iconPickerOpen, {
    minWidth: 248,
    maxHeight: 280,
    chromeHeight: 0,
    minListHeight: 96,
    dropdownRef: iconPickerPanelRef,
  })

  useClickOutside(
    () =>
      [iconPickerRef.value, iconPickerPanelRef.value].filter((el): el is HTMLElement => el != null),
    () => {
      iconPickerOpen.value = false
    },
  )

  const embedCount = computed(() => layoutStore.layoutConfig.customEmbeds?.length || 0)

  function embedIconAccent(icon: string) {
    return resolveEmbedIconAccent(icon)
  }

  function embedIconLabel(icon: string) {
    return EMBED_ICON_LABELS[icon || 'MonitorPlay'] || '图标'
  }

  const embedTabsKey = computed(() =>
    (layoutStore.layoutConfig.customEmbeds || []).map((e) => e.id).join('|'),
  )

  const embedTabs = computed(() =>
    (layoutStore.layoutConfig.customEmbeds || []).map((e, idx) => ({
      id: e.id,
      label: (e.name || `页面 ${idx + 1}`).slice(0, 14),
      icon: embedIconMap[e.icon || 'MonitorPlay'],
      accent: resolveEmbedTabAccent(e, idx),
    })),
  )

  useSettingsHubRouteSection(activeEmbedId, embedTabs, {
    tabId: 'embeds',
    activeTab: activeTabProp,
  })

  const activeEmbed = computed(
    () => layoutStore.layoutConfig.customEmbeds?.find((e) => e.id === activeEmbedId.value) ?? null,
  )

  const activeEmbedAccent = computed(() => {
    if (!activeEmbed.value) return EMBED_TAB_ACCENTS[0]
    const idx = (layoutStore.layoutConfig.customEmbeds || []).findIndex(
      (e) => e.id === activeEmbedId.value,
    )
    return resolveEmbedTabAccent(activeEmbed.value, Math.max(0, idx))
  })

  const activeEmbedIconAccent = computed(
    () => embedIconAccent(activeEmbed.value?.icon || '') || activeEmbedAccent.value,
  )

  watch(
    embedTabs,
    (tabs) => {
      if (!tabs.length) {
        activeEmbedId.value = ''
        return
      }
      if (!tabs.some((t) => t.id === activeEmbedId.value)) {
        activeEmbedId.value = tabs[tabs.length - 1].id
      }
    },
    { immediate: true },
  )

  function embedUrlWarning(url: string) {
    return getEmbedBlockReason(url)
  }

  function pickEmbedIcon(iconName: string) {
    if (activeEmbed.value) activeEmbed.value.icon = iconName
    iconPickerOpen.value = false
  }

  async function copyEmbedUrl(url: string) {
    await copyTextWithNotify(url, {
      successMessage: '内嵌 URL 已复制',
      emptyMessage: '请先填写内嵌地址',
    })
  }

  function addEmbed() {
    if (!layoutStore.layoutConfig.customEmbeds) layoutStore.layoutConfig.customEmbeds = []
    const nextIdx = layoutStore.layoutConfig.customEmbeds.length
    // 裸时间戳 id；顶栏 Tab id 由 embedNavTabId 统一加 embed- 前缀，避免 embed-embed-* 双前缀
    const id = String(Date.now())
    layoutStore.layoutConfig.customEmbeds.push({
      id,
      name: '新网页',
      url: '',
      icon: resolveEmbedIconByIndex(nextIdx),
    })
    activeEmbedId.value = id
  }

  async function removeEmbed(id: string) {
    const embed = layoutStore.layoutConfig.customEmbeds?.find((e) => e.id === id)
    const ok = await chrome.confirm(
      embed?.name ? `确定删除内嵌页「${embed.name}」？` : '确定删除该内嵌页？',
      '删除内嵌页',
      { confirmText: '删除', type: 'danger' },
    )
    if (!ok) return
    if (layoutStore.layoutConfig.customEmbeds) {
      layoutStore.layoutConfig.customEmbeds = layoutStore.layoutConfig.customEmbeds.filter(
        (e) => e.id !== id,
      )
    }
    pruneNavTabsForRemovedEmbed(layoutStore.layoutConfig, id)
  }

  function onEmbedReorder({ fromIndex, toIndex }: { fromIndex: number; toIndex: number }) {
    const list = layoutStore.layoutConfig.customEmbeds
    if (!list || fromIndex === toIndex) return
    const item = list.splice(fromIndex, 1)[0]
    list.splice(toIndex, 0, item)
    layoutStore.layoutConfig.customEmbeds = [...list]
  }

  const moviePilotUrl = computed({
    get: () => layoutStore.layoutConfig.moviePilotUrl || '',
    set: (v: string) => {
      layoutStore.layoutConfig.moviePilotUrl = v.trim()
    },
  })
  const moviePilotConfigured = computed(() => Boolean(String(moviePilotUrl.value || '').trim()))

  return {
    embedIconMap,
    embedLucidIcons,
    embedCount,
    activeEmbedId,
    iconPickerOpen,
    iconPickerRef,
    iconPickerPanelRef,
    iconPickerDropdownStyle,
    iconPickerTeleportTarget,
    iconPickerTeleportDisabled,
    iconPickerPlacement,
    embedTabsKey,
    embedTabs,
    activeEmbed,
    activeEmbedAccent,
    activeEmbedIconAccent,
    moviePilotUrl,
    moviePilotConfigured,
    embedIconLabel,
    embedIconAccent,
    embedUrlWarning,
    pickEmbedIcon,
    copyEmbedUrl,
    addEmbed,
    removeEmbed,
    onEmbedReorder,
  }
}

