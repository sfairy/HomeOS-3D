<!--
  QuickSwitchesWidget.vue / components/widgets/device
  快捷开关小部件：通用型多开关网格容器，内置搜索过滤、单条 on/off 切换、
  按 entityDomainColor 域色高亮图标，与外层切换在途态同步。
  Props: items 开关数组（每项含 entity_id、name、domain、on 态）
         / show-domain-color 是否启用域色图标
         / searchable 启用搜索输入框
  依赖：@homeos/shared getEntityDomain 域提取；
        composables: useTogglePending 在途态管理；
        Pinia: useEntitiesStore 实时状态回写；
        lucide: Search / Zap 图标；
        constants/entity-domain-meta entityDomainColor 调色板。
  注意：切换动作通过 HA callService domain.turn_on/off 调用。
-->
<template>
  <div class="quick-switches-widget">
    <div class="quick-switches-widget__head">
      <h3 class="quick-switches-widget__title">{{ '快捷开关' }}</h3>
      <button
        v-if="entityIds.length > 6"
        type="button"
        class="quick-switches-widget__collapse"
        @click="toggleCollapsed"
      >
        {{ collapsed ? '展开' : '收起' }}
      </button>
    </div>
    <div v-if="entityIds.length > 4" class="quick-switches-widget__search-wrap">
      <Search class="w-3.5 h-3.5 qsw-search-icon" />
      <input
        v-model="query"
        type="search"
        class="quick-switches-widget__search"
        :placeholder="'过滤开关…'"
      />
    </div>
    <div v-if="visibleIds.length" class="quick-switches-widget__grid">
      <button
        v-for="eid in visibleIds"
        :key="eid"
        type="button"
        :class="['quick-switch-chip', isOn(eid) && 'quick-switch-chip--on']"
        :style="{ '--chip-accent': chipAccent(eid) }"
        :disabled="entityPending(eid)"
        @click="toggle(eid)"
      >
        <span class="quick-switch-chip__glyph">
          <Zap class="quick-switch-chip__icon" />
        </span>
        <span class="quick-switch-chip__meta">
          <span class="quick-switch-chip__label">{{ labelFor(eid) }}</span>
          <span class="quick-switch-chip__state">{{ isOn(eid) ? '开启' : '关闭' }}</span>
        </span>
      </button>
    </div>
    <p v-else class="quick-switches-widget__empty">
      {{ '请在设置 → 微件管理 中配置 switch / input_boolean 实体' }}
    </p>
  </div>
</template>

<script setup>
import { readLocalStorageFlag, writeLocalStorage } from '@/utils/core/local-storage.util'
/**
 * @file QuickSwitchesWidget.vue
 * @module widgets/device
 * @description 快捷开关部件：从 config.entities 读取 switch/input_boolean 实体列表，
 *              以芯片网格形式提供一键切换，支持搜索过滤与超过 6 个时折叠收起。
 * @dependencies
 *  - @homeos/shared: getEntityDomain 实体域判断
 *  - vue: ref/computed/watch 响应式与监听
 *  - @lucide/vue: Search / Zap 图标
 *  - @/stores/entities.store: 实体状态与 HA 服务调用
 *  - @/utils/entity/derived.util: 实体友好名生成
 *  - @/constants/entity-domain-meta: 实体域配色
 *  - @/composables/entity/useTogglePending: 切换在途态管理
 */
import { getEntityDomain } from '@homeos/shared'
import { ref, computed, watch } from 'vue'
import { Search, Zap } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { entityDomainColor } from '@/constants/entity-domain-meta'
import { useTogglePending } from '@/composables/entity/useTogglePending'

const STORAGE_KEY = 'homeos_quick_switches_collapsed'

const props = defineProps({
  config: { type: Object, default: () => ({}) },
  panelVisible: { type: Boolean, default: true },
})

const entitiesStore = useEntitiesStore()
const { isPending: entityPending, withPending: withEntityPending } = useTogglePending()
const query = ref('')
const collapsed = ref(readLocalStorageFlag(STORAGE_KEY))

const entityIds = computed(() => {
  const list = props.config?.entities
  if (!Array.isArray(list)) return []
  return list.filter((id) => {
    if (typeof id !== 'string') return false
    const d = getEntityDomain(id)
    return d === 'switch' || d === 'input_boolean'
  })
})

const filteredIds = computed(() => {
  void entitiesStore.getDomainEpoch('switch')
  void entitiesStore.getDomainEpoch('input_boolean')
  const q = query.value.trim().toLowerCase()
  if (!q) return entityIds.value
  return entityIds.value.filter((eid) => {
    const ent = entitiesStore.entities[eid]
    const name = getEntityDisplayName(eid, ent).toLowerCase()
    return eid.toLowerCase().includes(q) || name.includes(q)
  })
})

const visibleIds = computed(() => {
  const list = filteredIds.value
  if (!collapsed.value || list.length <= 6) return list
  return list.slice(0, 6)
})

watch(
  () => props.panelVisible,
  (v) => {
    if (v && entityIds.value.length) {
      void Promise.all(entityIds.value.slice(0, 40).map((id) => entitiesStore.ensureEntity(id)))
    }
  },
  { immediate: true },
)

function labelFor(eid) {
  return getEntityDisplayName(eid, entitiesStore.entities[eid])
}

function chipAccent(eid) {
  return entityDomainColor(getEntityDomain(eid))
}

function isOn(eid) {
  return entitiesStore.entities[eid]?.state === 'on'
}

function toggleCollapsed() {
  collapsed.value = !collapsed.value
  try {
    writeLocalStorage(STORAGE_KEY, collapsed.value ? '1' : '0')
  } catch {
    /* 忽略 */
  }
}

async function toggle(eid) {
  const domain = getEntityDomain(eid)
  if (!domain) return
  await withEntityPending(eid, () => entitiesStore.callService(domain, 'toggle', eid))
}
</script>

<style scoped src="./styles/QuickSwitchesWidget.css"></style>
