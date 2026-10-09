<!--
组件：SettingsSidebar.vue
所属模块：frontend / src / views / settings / shared / layout
职责：设置页桌面端侧栏。分组折叠导航 + 搜索过滤 + 未保存快捷入口（pendingTray），
      顶部含保存/取消按钮与版本号。搜索、分组展开等逻辑由 useSettingsSidebar 提供。
Props：
  - groups：导航分组列表
  - activeTab：当前激活 Tab id
  - saving / showSave / usesIndependentSave：保存按钮状态
  - pendingChanges：未保存修改数
  - searchQuery：搜索关键词
  - appVersion：应用版本号
Emits：
  - navigate / save / cancel / toggle-collapse / update:searchQuery
关键依赖：
  - useSettingsSidebar：分组展开、搜索、未保存快捷入口
  - @lucide/vue 的 Loader2 / Save / ChevronDown / PanelLeftClose / Search / X
数据来源：父级透传的 groups / activeTab 等
-->
<template>
  <aside class="settings-sidebar">
    <div class="sidebar-header px-4 pt-6 pb-4">
      <div class="sidebar-header__row">
        <div class="sidebar-brand">
          <div class="sidebar-brand-icon">⚙️</div>
          <div>
            <h2 class="sidebar-brand-title">{{ '设置' }}</h2>
            <p class="sidebar-brand-sub">{{ headerSubtitle }}</p>
          </div>
        </div>
        <button
          type="button"
          class="sidebar-collapse-btn"
          :title="'隐藏侧栏'"
          :aria-label="'隐藏侧栏'"
          @click="emit('toggle-collapse')"
        >
          <PanelLeftClose class="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div v-if="showSearch" class="sidebar-search px-3 pb-2">
      <div class="sidebar-search__wrap">
        <Search class="sidebar-search__icon" aria-hidden="true" />
        <input
          ref="searchRef"
          v-model="searchQuery"
          type="text"
          role="searchbox"
          inputmode="search"
          class="sidebar-search__input"
          :placeholder="'搜索设置页…'"
          :aria-label="'搜索设置页'"
          autocomplete="off"
          spellcheck="false"
          @keydown.escape="searchQuery = ''"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="sidebar-search__clear"
          :aria-label="'清除搜索'"
          @click="searchQuery = ''"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <div v-if="pendingTrayItems.length" class="sidebar-dirty-tray">
      <div class="sidebar-dirty-tray__card">
        <div class="sidebar-dirty-tray__head">
          <span class="sidebar-dirty-tray__dot" aria-hidden="true" />
          <span class="sidebar-dirty-tray__title">待保存</span>
          <span class="sidebar-dirty-tray__count">{{ pendingTrayItems.length }}</span>
        </div>
        <div class="sidebar-dirty-tray__list">
          <button
            v-for="item in pendingTrayItems"
            :key="item.id"
            type="button"
            class="sidebar-dirty-tray__item"
            :class="activeTab === item.id && 'sidebar-dirty-tray__item--active'"
            :title="`跳转到${item.label}`"
            @click="jumpToPending(item.id)"
          >
            <span class="sidebar-dirty-tray__item-label">{{ item.label }}</span>
            <span class="sidebar-dirty-tray__item-go" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>

    <nav class="flex-1 px-3 overflow-y-auto pb-2">
      <template v-if="isSearchMode">
        <p v-if="!searchResults.length" class="sidebar-search-empty">{{ '无匹配设置项' }}</p>
        <button
          v-for="item in searchResults"
          :key="item.id"
          type="button"
          :class="[
            'sidebar-tab sidebar-search-result',
            `sidebar-group--${item.groupId}`,
            activeTab === item.id && 'sidebar-tab--active',
          ]"
          @click="handleNavigate(item.id, item.groupId)"
        >
          <component :is="item.icon" class="w-4 h-4 shrink-0" />
          <span class="sidebar-search-result__body">
            <span class="truncate">
              <template
                v-for="(part, hi) in highlightSearchParts(item.label, searchQuery)"
                :key="hi"
              >
                <mark v-if="part.match" class="sidebar-search-mark">{{ part.text }}</mark>
                <template v-else>{{ part.text }}</template>
              </template>
            </span>
            <span class="sidebar-search-result__group">
              <template
                v-for="(part, hi) in highlightSearchParts(item.groupLabel, searchQuery)"
                :key="'g' + hi"
              >
                <mark v-if="part.match" class="sidebar-search-mark">{{ part.text }}</mark>
                <template v-else>{{ part.text }}</template>
              </template>
            </span>
          </span>
          <span
            v-if="item.independentSave"
            class="sidebar-tab-save-dot"
            :class="pendingTabIds.includes(item.id) && 'sidebar-tab-save-dot--dirty'"
            :title="pendingTabIds.includes(item.id) ? '有未保存修改' : '本页单独保存'"
          />
        </button>
      </template>

      <template v-else>
        <p v-if="!displayGroups.length" class="sidebar-search-empty">{{ '无设置项' }}</p>
        <div
          v-for="group in displayGroups"
          :key="group.id"
          :class="['sidebar-group', `sidebar-group--${group.id}`]"
        >
          <button
            type="button"
            :class="[
              'sidebar-group-header',
              isGroupActive(group) && 'sidebar-group-header--active',
              isExpanded(group.id) && 'sidebar-group-header--open',
            ]"
            @click="toggleGroup(group.id)"
          >
            <component :is="group.icon" class="w-[18px] h-[18px] shrink-0 opacity-70" />
            <span class="flex-1 text-left truncate">{{ group.label }}</span>
            <span
              v-if="group.tabs.some((t) => pendingTabIds.includes(t.id))"
              class="sidebar-group-dirty"
              :title="'本组有未保存修改'"
              aria-hidden="true"
            />
            <span class="sidebar-group-count">{{ group.tabs.length }}</span>
            <ChevronDown
              :class="['sidebar-chevron', isExpanded(group.id) && 'sidebar-chevron--open']"
            />
          </button>

          <div
            class="sidebar-submenu"
            :class="isExpanded(group.id) ? 'sidebar-submenu--open' : 'sidebar-submenu--closed'"
          >
            <div class="sidebar-submenu-inner">
              <button
                v-for="tab in group.tabs"
                :key="tab.id"
                type="button"
                :class="[
                  'sidebar-tab sidebar-tab--child',
                  activeTab === tab.id && 'sidebar-tab--active',
                ]"
                @click="handleNavigate(tab.id, group.id)"
              >
                <component :is="tab.icon" class="w-4 h-4 shrink-0" />
                <span class="truncate">{{ tab.label }}</span>
                <span
                  v-if="tab.independentSave || pendingTabIds.includes(tab.id)"
                  class="sidebar-tab-save-dot"
                  :class="pendingTabIds.includes(tab.id) && 'sidebar-tab-save-dot--dirty'"
                  :title="pendingTabIds.includes(tab.id) ? '有未保存修改' : '面板内保存'"
                />
              </button>
            </div>
          </div>
        </div>
      </template>
    </nav>

    <div class="sidebar-footer">
      <div v-if="showSave" class="sidebar-footer__inner">
        <p class="sidebar-footer__hint">
          {{
            usesIndependentSave
              ? '本页请在面板内保存，侧栏「保存所有配置」不会写入此页。'
              : '房间、语音、联动编排等页请在面板内保存。'
          }}
        </p>
        <div v-if="pendingChanges > 0 && !usesIndependentSave" class="sidebar-footer__pending">
          <span class="sidebar-footer__pending-dot" />
          <span class="sidebar-footer__pending-text">{{
            '{n} 项已修改'.replace('{n}', String(pendingChanges))
          }}</span>
        </div>
        <div v-if="!usesIndependentSave" class="sidebar-footer__actions">
          <button
            v-if="pendingChanges > 0"
            type="button"
            class="sidebar-footer__cancel-btn"
            :disabled="saving"
            @click="$emit('cancel')"
          >
            {{ '取消' }}
          </button>
          <button
            type="button"
            :disabled="saving || pendingChanges === 0"
            class="sidebar-footer__save-btn"
            @click="$emit('save')"
          >
            <Loader2 v-if="saving" class="w-4 h-4 animate-spin" />
            <Save v-else class="w-4 h-4" />
            <span>{{ saving ? '同步中...' : '保存所有配置' }}</span>
          </button>
        </div>
      </div>
      <footer class="sidebar-footer__copy">
        <p>版权所有：一埖一丗堺</p>
        <p>程序开发：方长鑫</p>
        <p class="sidebar-footer__copy-ver">HomeOS v{{ appVersion }}</p>
      </footer>
    </div>
  </aside>
</template>

<script setup>
import { computed, toRef } from 'vue'
import { Loader2, Save, ChevronDown, PanelLeftClose, Search, X } from '@lucide/vue'
import { useSettingsSidebar } from '@/features/settings/shared/layout/useSettingsSidebar'

const props = defineProps({
  groups: { type: Array, required: true },
  activeTab: { type: String, required: true },
  saving: { type: Boolean, default: false },
  showSave: { type: Boolean, default: true },
  usesIndependentSave: { type: Boolean, default: false },
  pendingChanges: { type: Number, default: 0 },
  searchQuery: { type: String, default: '' },
  appVersion: { type: String, default: '' },
})

const emit = defineEmits(['navigate', 'save', 'cancel', 'toggle-collapse', 'update:searchQuery'])

const searchQuery = computed({
  get: () => props.searchQuery,
  set: (value) => emit('update:searchQuery', value),
})

const {
  showSearch,
  headerSubtitle,
  displayGroups,
  isSearchMode,
  searchResults,
  searchRef,
  pendingTabIds,
  pendingTrayItems,
  isExpanded,
  isGroupActive,
  toggleGroup,
  onNavigate,
  highlightSearchParts,
} = useSettingsSidebar(toRef(props, 'groups'), toRef(props, 'activeTab'), searchQuery)

function handleNavigate(tabId, groupId) {
  onNavigate(tabId, groupId, emit)
}

function jumpToPending(tabId) {
  const group = props.groups.find((g) => g.tabs.some((t) => t.id === tabId))
  onNavigate(tabId, group?.id || '', emit)
}
</script>
