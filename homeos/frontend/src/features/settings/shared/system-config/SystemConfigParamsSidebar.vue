<!--
组件：SystemConfigParamsSidebar.vue
所属模块：frontend / src / views / settings / shared / system-config
职责：高级参数侧栏。展示分区列表、全局搜索、分类切换、专家模式与开发 key 开关，
      搜索命中高亮与分区未保存标记；底部提供分区委派入口与媒体播放列表设置。
Props：
  - sectionList：分区列表
  - searchResultCount / searchMatchMap：搜索命中数与映射
  - globalSearch / activeSection / activeCategory：搜索词与当前分区/分类
  - expertMode / showDevKeys：专家模式与开发 key 开关
  - sectionPendingMap：分区未保存标记
Emits：
  - update:globalSearch / update:activeSection / update:activeCategory / update:expertMode / update:showDevKeys
关键依赖：
  - SECTION_LINK_LABELS / DELEGATED_* / useSystemConfigParamsSidebar：侧栏常量与逻辑
  - MediaPlaylistSettingsModal：媒体播放列表设置弹窗
数据来源：父级透传的 sectionList 与各类状态
-->
<template>
  <aside class="params-sidebar">
    <div class="params-sidebar__search">
      <Search class="w-4 h-4 shrink-0 opacity-40" aria-hidden="true" />
      <input
        ref="searchRef"
        :value="globalSearch"
        type="text"
        role="searchbox"
        inputmode="search"
        :aria-label="'搜索运行参数'"
        :placeholder="'搜索参数… 按 / 聚焦'"
        class="params-sidebar__search-input"
        @input="emit('update:globalSearch', $event.target.value)"
        @keydown.escape="emit('update:globalSearch', '')"
      />
      <button
        v-if="globalSearch"
        type="button"
        class="params-sidebar__search-clear"
        :aria-label="'清除搜索'"
        @click="emit('update:globalSearch', '')"
      >
        <X class="w-3.5 h-3.5" />
      </button>
    </div>

    <p v-if="globalSearch.trim()" class="params-sidebar__search-meta">
      {{ '{n} 项匹配'.replace('{n}', String(searchResultCount)) }}
    </p>

    <nav ref="navRef" class="params-sidebar__nav" :aria-label="'参数分区'">
      <div v-for="cat in categoryNav" :key="cat.id" class="params-sidebar__group">
        <button
          type="button"
          class="params-sidebar__group-head"
          :aria-expanded="isCategoryExpanded(cat.id)"
          @click="toggleCategory(cat.id)"
        >
          <component :is="cat.icon" class="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span class="params-sidebar__group-label">{{ cat.label }}</span>
          <span class="params-sidebar__group-count">
            <span v-if="categoryPendingCount(cat)" class="params-sidebar__pending-dot" />
            {{ cat.fieldCount }}
          </span>
          <ChevronDown
            :class="[
              'params-sidebar__group-chev',
              !isCategoryExpanded(cat.id) && 'params-sidebar__group-chev--closed',
            ]"
          />
        </button>
        <div v-show="isCategoryExpanded(cat.id)" class="params-sidebar__items">
          <button
            v-for="section in cat.sections"
            :key="section.key"
            type="button"
            :class="[
              'params-sidebar__item',
              activeSection === section.key && 'params-sidebar__item--active',
              globalSearch.trim() && sectionMatchCount(section.key) === 0 && 'params-sidebar__item--dim',
            ]"
            :style="{ '--item-accent': sectionMeta(section.key).accent }"
            :disabled="!!globalSearch.trim() && sectionMatchCount(section.key) === 0"
            :aria-disabled="!!globalSearch.trim() && sectionMatchCount(section.key) === 0"
            @click="onSelectSection(section.key)"
          >
            <component
              :is="sectionMeta(section.key).icon"
              class="w-3.5 h-3.5 shrink-0 opacity-70"
              aria-hidden="true"
            />
            <span class="params-sidebar__item-label" :title="section.label">{{ section.label }}</span>
            <span
              v-if="globalSearch.trim() && sectionMatchCount(section.key)"
              class="params-sidebar__item-match"
              >{{ sectionMatchCount(section.key) }}</span
            >
            <span v-else-if="sectionPendingMap[section.key]" class="params-sidebar__item-pending">{{
              sectionPendingMap[section.key]
            }}</span>
            <span v-else class="params-sidebar__item-count">{{ section.fields.length }}</span>
          </button>
        </div>
      </div>
    </nav>

    <div class="params-sidebar__foot">
      <details class="params-sidebar__links">
        <summary>{{ '专用设置页' }} · {{ delegatedCount }}</summary>
        <div class="params-sidebar__links-row">
          <RouterLink
            v-for="link in delegatedPanelLinks"
            :key="link.id"
            :to="link.to"
            class="params-sidebar__link"
          >
            {{ SECTION_LINK_LABELS[link.id] ?? link.id }}
          </RouterLink>
          <button
            v-for="item in delegatedActionItems"
            :key="item.id"
            type="button"
            class="params-sidebar__link params-sidebar__link--btn"
            @click="onDelegatedAction(item.id)"
          >
            {{ SECTION_LINK_LABELS[item.id] ?? item.id }}
          </button>
        </div>
      </details>
      <div class="params-sidebar__toggles">
        <button
          type="button"
          :class="['params-sidebar__toggle', expertMode && 'params-sidebar__toggle--on']"
          :aria-pressed="expertMode"
          :title="expertMode ? '当前：专家模式（显示运维细调分区）' : '当前：标准模式'"
          @click="emit('update:expertMode', !expertMode)"
        >
          {{ expertMode ? '专家 · 开' : '专家 · 关' }}
        </button>
        <button
          type="button"
          :class="['params-sidebar__toggle', showDevKeys && 'params-sidebar__toggle--on']"
          :aria-pressed="showDevKeys"
          :title="showDevKeys ? '隐藏配置键名' : '显示配置键名'"
          @click="emit('update:showDevKeys', !showDevKeys)"
        >
          {{ showDevKeys ? '键名 · 开' : '键名 · 关' }}
        </button>
      </div>
    </div>

    <MediaPlaylistSettingsModal :open="mediaPlaylistOpen" @close="mediaPlaylistOpen = false" />
  </aside>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import { Search, X, ChevronDown } from '@lucide/vue'
import { SECTION_LINK_LABELS, DELEGATED_PANEL_LINKS, DELEGATED_ACTION_ITEMS, DELEGATED_COUNT, useSystemConfigParamsSidebar } from '@/features/settings/composables/system/system-config-sidebar.internals'
import MediaPlaylistSettingsModal from '@/features/settings/shared/system-config/MediaPlaylistSettingsModal.vue'

const delegatedPanelLinks = DELEGATED_PANEL_LINKS
const delegatedActionItems = DELEGATED_ACTION_ITEMS
const delegatedCount = DELEGATED_COUNT

const props = defineProps({
  sectionList: { type: Array, default: () => [] },
  searchResultCount: { type: Number, default: 0 },
  searchMatchMap: { type: Object, default: () => ({}) },
  globalSearch: { type: String, default: '' },
  activeSection: { type: String, default: '' },
  activeCategory: { type: String, default: 'display' },
  expertMode: { type: Boolean, default: false },
  showDevKeys: { type: Boolean, default: false },
  sectionPendingMap: { type: Object, default: () => ({}) },
})

const emit = defineEmits([
  'update:globalSearch',
  'update:activeSection',
  'update:activeCategory',
  'update:expertMode',
  'update:showDevKeys',
])

const {
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
} = useSystemConfigParamsSidebar(props, emit)

function sectionMatchCount(sectionKey) {
  return Number(props.searchMatchMap?.[sectionKey] || 0)
}

function onSelectSection(sectionKey) {
  // 搜索态点侧栏：直接打开该分区（退出搜索），符合「菜单」语义
  if (props.globalSearch.trim()) {
    if (sectionMatchCount(sectionKey) === 0) return
    emit('update:globalSearch', '')
  }
  selectSection(sectionKey)
}

defineExpose({ selectSection })
</script>
<style src="./styles/system-config-params-sidebar.css"></style>
