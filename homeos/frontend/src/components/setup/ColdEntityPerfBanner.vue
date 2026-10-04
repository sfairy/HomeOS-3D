<template>
  <!-- ColdEntityPerfBanner 冷实体性能提示条：实体数过多时建议启用按需 WS 推送 -->
  <div v-if="showBanner" class="cold-entity-perf-bar" role="status">
    <span class="cold-entity-perf-bar__text">
      当前约 {{ entityCount }} 个实体。建议启用「冷实体按需 WS」以降低实时推送负载（设置 → 专家/系统参数 →
      wsPush.coldEntityOnDemand）。
    </span>
    <div class="cold-entity-perf-bar__actions">
      <RouterLink
        :to="hashRoute('/settings?tab=params&section=wsPush')"
        class="cold-entity-perf-bar__btn"
        @click="dismiss"
      >
        去开启
      </RouterLink>
      <button
        type="button"
        class="cold-entity-perf-bar__btn cold-entity-perf-bar__btn--ghost"
        @click="dismiss"
      >
        不再提示
      </button>
    </div>
  </div>
</template>

<script setup>
import { readLocalStorage, writeLocalStorage } from '@/utils/core/local-storage.util'
/**
 * ColdEntityPerfBanner - 冷实体性能提示条组件
 * 职责：当实体总数超过阈值且未开启「冷实体按需 WS」时，提示用户开启以降低推送负载。
 * 关键依赖：
 * - useEntitiesStore：读取实体总数；
 * - getLargeEntityThreshold / getWsPushPublicConfig：判断是否需要提示。
 * 关闭状态：localStorage 中 STORAGE_KEY 标记，点击「不再提示」后持久化忽略。
 */
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useEntitiesStore } from '@/stores/entities.store'
import { getLargeEntityThreshold, getWsPushPublicConfig } from '@/utils/config/frontend-config'

const STORAGE_KEY = 'homeos:dismiss-cold-entity-hint'

const entitiesStore = useEntitiesStore()
const { totalCount } = storeToRefs(entitiesStore)
const dismissed = ref(
  typeof localStorage !== 'undefined' && readLocalStorage(STORAGE_KEY) === '1',
)

const entityCount = computed(() => totalCount.value || 0)

const showBanner = computed(() => {
  // 已忽略 / 未达阈值 / 已开启按需推送 时不展示
  if (dismissed.value) return false
  if (entityCount.value < getLargeEntityThreshold()) return false
  if (getWsPushPublicConfig()?.coldEntityOnDemand) return false
  return true
})

function dismiss() {
  // 标记忽略并持久化到 localStorage，避免下次再提示
  dismissed.value = true
  try {
    writeLocalStorage(STORAGE_KEY, '1')
  } catch {
    /* 忽略 */
  }
}

function hashRoute(path) {
  // 将普通路径包装为 hash 路由路径（适配旧版 hash router）
  const p = String(path || '').replace(/^\//, '')
  return p.startsWith('#') ? p : `#/${p}`
}
</script>

<style scoped src="./styles/setup-banners.css"></style>
