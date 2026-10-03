<template>
  <!-- ChecklistBanner 首装任务条：展示首装后续待办任务并跳转设置 -->
  <div v-if="showBanner && checklist" class="setup-checklist-bar" role="status">
    <span class="setup-checklist-bar__text">
      {{ `首装后续任务 ${progressText}：` }}
      <template v-for="(item, idx) in pendingItems" :key="item.id">
        <RouterLink
          v-if="item.route"
          :to="hashRoute(item.route)"
          class="setup-checklist-bar__link"
          >{{ item.label }}</RouterLink
        >
        <span v-else>{{ item.label }}</span>
        <span v-if="idx < pendingItems.length - 1">{{ ' · ' }}</span>
      </template>
    </span>
    <div class="setup-checklist-bar__actions">
      <RouterLink :to="hashRoute('/settings?tab=setup-wizard')" class="setup-checklist-bar__btn">{{
        '查看清单'
      }}</RouterLink>
      <button
        type="button"
        class="setup-checklist-bar__btn setup-checklist-bar__btn--ghost"
        @click="dismiss"
      >
        {{ '7 天内不再提示' }}
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * ChecklistBanner - 首装任务条组件
 * 职责：在主界面顶部展示首装后续待办任务的进度，提供快捷跳转与 7 天内不再提示。
 * 关键依赖：useSetupChecklist 提供清单数据、进度文案与 dismiss 关闭逻辑。
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useSetupChecklist } from '@/composables/settings/useSetupChecklist'

const { checklist, showBanner, progressText, dismiss } = useSetupChecklist()

const pendingItems = computed(() =>
  // 取前 3 条未完成任务，控制条目数避免溢出
  (checklist.value?.items || []).filter((i) => !i.done).slice(0, 3),
)

function hashRoute(path) {
  // 将普通路径包装为 hash 路由路径（适配旧版 hash router）
  const p = String(path || '').replace(/^\//, '')
  return p.startsWith('#') ? p : `#/${p}`
}
</script>

<style scoped src="./styles/setup-banners.css"></style>
