<!--
组件：MobileDevicesView.vue
所属模块：frontend / src / views
职责：移动端「全部设备」页——按实体域分组浏览，点击行打开实体控制弹层。
数据来源：实体来自 useEntitiesStore（HA 实时状态缓存）；显示名经
         getEntityDisplayName 解析；域标签由 getDomainLabel 提供。
关键交互：
  - 顶部搜索框按 entity_id 或友好名过滤；
  - 过滤后按域分组、域内按 label 排序（localeCompare zh-CN）；
  - 点击行调用 chrome.openEntityControl 打开实体控制弹层。
-->
<script setup lang="ts">
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/MobileDevicesView 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
/**
 * 移动端「全部设备」页：按域分组浏览与控制全部实体。
 */
import { computed, ref } from 'vue'
import { Search } from '@lucide/vue'
import { getEntityDomain } from '@homeos/shared'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { getDomainLabel } from '@/utils/device/domain-labels.util'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import type { HaEntityState } from '@/types/entity-store'

const entitiesStore = useEntitiesStore()
const chrome = useChromeStore()

const keyword = ref('')

/** 实体行：eid + 对应实体状态对象（可能 undefined，用于无数据时显示占位）。 */
interface EntityRow {
  eid: string
  entity: HaEntityState | undefined
}

// 过滤结果：按关键字匹配 entity_id 或友好名（不区分大小写）
const filtered = computed<EntityRow[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  return Object.keys(entitiesStore.entities)
    .filter((eid) => {
      const ent = entitiesStore.entities[eid]
      const name = getEntityDisplayName(eid, ent)?.toLowerCase() || ''
      return !kw || eid.toLowerCase().includes(kw) || name.includes(kw)
    })
    .map((eid) => ({ eid, entity: entitiesStore.entities[eid] }))
})

/** 分组行：实体域 + 域标签 + 数量 + 实体列表，供模板按域渲染。 */
interface GroupRow {
  domain: string
  label: string
  count: number
  items: EntityRow[]
}

// 分组：按 getEntityDomain 划域，未命中归入 other；组内按域标签 localeCompare 排序
const groups = computed<GroupRow[]>(() => {
  const map = new Map<string, EntityRow[]>()
  for (const row of filtered.value) {
    const domain = getEntityDomain(row.eid) || 'other'
    const list = map.get(domain) || []
    list.push(row)
    map.set(domain, list)
  }
  return [...map.entries()]
    .map(([domain, items]) => ({
      domain,
      label: getDomainLabel(domain) || domain,
      count: items.length,
      items,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
})

const totalCount = computed(() => Object.keys(entitiesStore.entities).length)

/** 点击行：打开实体控制弹层（chrome 统一调度设备控制 UI）。 */
function openEntity(eid: string) {
  if (!eid) return
  chrome.openEntityControl(eid)
}

/** 取实体状态文本：无状态时显示「—」占位。 */
function stateText(entity: HaEntityState | undefined): string {
  return String(entity?.state ?? '—')
}
</script>

<template>
  <div class="m-page" style="--m-accent-rgb: 56, 189, 248">
    <header class="m-page__header">
      <p class="m-page__eyebrow">设备</p>
      <h1 class="m-page__title">全部设备</h1>
      <p class="m-page__sub">{{ totalCount }} 个实体 · 点击打开控制</p>
    </header>

    <div class="m-dev-search">
      <Search class="m-dev-search__icon" />
      <input
        v-model="keyword"
        class="m-dev-search__input"
        type="search"
        placeholder="搜索设备名称或 ID"
      />
    </div>

    <p v-if="!totalCount" class="m-page__hint">暂无设备</p>
    <p v-else-if="!filtered.length" class="m-page__hint">未找到匹配的设备</p>

    <section v-for="group in groups" :key="group.domain" class="m-dev-group">
      <div class="m-dev-group__head">
        <span class="m-page__card-label">{{ group.label }}</span>
        <span class="m-dev-group__count">{{ group.count }}</span>
      </div>
      <div class="m-dev-group__list">
        <button
          v-for="row in group.items"
          :key="row.eid"
          type="button"
          class="m-dev-row"
          @click="openEntity(row.eid)"
        >
          <span class="m-dev-row__name">{{ getEntityDisplayName(row.eid, row.entity) || row.eid }}</span>
          <span class="m-dev-row__state">{{ stateText(row.entity) }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.m-dev-search {
  position: relative;
  display: flex;
  align-items: center;
}

.m-dev-search__icon {
  position: absolute;
  left: 12px;
  width: 16px;
  height: 16px;
  color: var(--hos-text-secondary);
  pointer-events: none;
}

.m-dev-search__input {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px 12px 36px;
  border-radius: var(--hos-radius-card);
  border: var(--hos-hairline, 1px) solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.3);
  color: var(--set-text-primary, rgba(255, 255, 255, 0.92));
  font-size: var(--premium-fs-body);
  outline: none;
}

.m-dev-search__input:focus {
  border-color: rgba(56, 189, 248, 0.5);
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.12);
}

.m-dev-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.m-dev-group__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px;
}

.m-dev-group__head .m-page__card-label {
  margin: 0;
}

.m-dev-group__count {
  font-size: var(--premium-fs-micro);
  font-weight: 650;
  color: var(--hos-text-secondary);
}

.m-dev-group__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.m-dev-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 48px;
  padding: 10px 14px;
  border-radius: var(--hos-radius-card);
  border: var(--hos-hairline, 1px) solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.18);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.m-dev-row__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--premium-fs-body-sm);
  font-weight: 700;
}

.m-dev-row__state {
  flex-shrink: 0;
  font-size: var(--premium-fs-micro);
  font-weight: 650;
  color: var(--hos-text-secondary);
  text-transform: lowercase;
}
</style>
