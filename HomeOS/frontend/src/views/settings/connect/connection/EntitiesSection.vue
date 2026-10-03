<!--
  组件文件：EntitiesSection.vue
  所属模块：frontend/src/views/settings/connect/connection
  组件职责：系统连接大类下的 HA 实体同步分区面板，顶部展示实体同步建议洞察卡（含刷新
    与修复动作），中部提供「仅同步已启用且未隐藏的实体」大开关，下方为实体总数、
    最后同步时间、缓存来源与离线设备数量的统计卡片。
  主要 props / emits：
    - props entitiesStore：实体缓存 store 对象（totalCount、entitiesCacheHydrated 等）
    - props syncOnlyEnabledEntities：是否已开启启用过滤开关（布尔）
    - props syncFilterSaving / syncFilterFeedback：过滤开关保存状态与反馈文案
    - props refreshingEntities / refreshFeedback：实体刷新状态与反馈
    - props saving / testing：保存与测试加载状态（联合禁用刷新按钮）
    - props toggleSyncFilter / refreshEntities / formatCacheTime：回调函数
  依赖关系：使用 buildEntitySyncRecommendations 工具生成实体同步推荐卡片；
    引用 DEVICES_ROUTES 生成设备列表/离线列表跳转链接。
  注意事项：切换「仅同步已启用…」开关后建议立即点「刷新实体」生效；同步过滤开关保存
    到后端需回调，期间按钮进入 loading 态。
-->
<template>
  <div>
    <RecommendInsightCard
      :title="entitySyncInsight.title || '实体同步建议'"
      :meta="entitySyncInsight.meta"
      :summary="entitySyncInsight.summary"
      :actionable="entitySyncInsight.hasActionable"
      :groups="entitySyncInsight.groups"
      :banners="entitySyncInsight.banners"
      :visible="entitySyncInsight.hasActionable || entitiesStore.totalCount > 0"
      :loading="refreshingEntities"
      loading-text="正在刷新实体…"
      @refresh="refreshEntities"
      @banner-action="handleBanner"
    />

    <div
      class="conn-entities-toggle"
      :class="syncOnlyEnabledEntities ? 'conn-entities-toggle--on' : 'conn-entities-toggle--off'"
    >
      <div class="conn-entities-toggle__main">
        <div class="flex items-start gap-3 min-w-0">
          <div
            class="conn-entities-toggle__icon"
            :class="
              syncOnlyEnabledEntities
                ? 'conn-entities-toggle__icon--on'
                : 'conn-entities-toggle__icon--off'
            "
          >
            <ListFilter class="w-4 h-4" />
          </div>
          <div class="min-w-0">
            <p class="conn-entities-toggle__title">{{ '仅同步已启用且未隐藏的实体' }}</p>
            <p class="conn-entities-toggle__desc">
              {{
                '依据 HA entity_registry 过滤禁用/隐藏实体；关闭后将同步全部状态实体。修改后建议点击「刷新实体」。'
              }}
            </p>
          </div>
        </div>
        <button
          type="button"
          class="toggle-btn disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
          :class="{ on: syncOnlyEnabledEntities }"
          :disabled="syncFilterSaving"
          :aria-label="'仅同步已启用且未隐藏的实体'"
          @click="toggleSyncFilter"
        >
          <div class="toggle-dot" :class="{ on: syncOnlyEnabledEntities }" />
        </button>
      </div>

      <p
        v-if="syncFilterFeedback"
        :class="[
          'conn-entities-feedback',
          syncFilterFeedback.ok
            ? 'conn-entities-feedback--ok'
            : syncFilterFeedback.ok === false
              ? 'conn-entities-feedback--err'
              : 'conn-entities-feedback--warn',
        ]"
      >
        <Loader2 v-if="syncFilterFeedback.ok === undefined" class="w-3 h-3 animate-spin shrink-0" />
        <CheckCircle2 v-else-if="syncFilterFeedback.ok" class="w-3 h-3 shrink-0" />
        <AlertCircle v-else class="w-3 h-3 shrink-0" />
        <span>{{ syncFilterFeedback.message }}</span>
      </p>

      <div class="conn-entities-toggle__actions">
        <button
          type="button"
          class="settings-btn-ghost conn-entities-toggle__refresh"
          :disabled="refreshingEntities || saving || testing"
          @click="refreshEntities"
        >
          <Loader2 v-if="refreshingEntities" class="w-3.5 h-3.5 animate-spin" />
          <RefreshCw v-else class="w-3.5 h-3.5" />
          {{ refreshingEntities ? '刷新中…' : '刷新实体' }}
        </button>
        <router-link :to="devicesOfflineLink" class="settings-btn-ghost">
          {{ '查看离线设备' }}
        </router-link>
        <router-link :to="devicesListLink" class="settings-btn-ghost">
          {{ '打开设备列表' }}
        </router-link>
        <div
          v-if="refreshFeedback"
          :class="[
            'settings-connection-feedback conn-entities-toggle__refresh-feedback',
            refreshFeedback.ok
              ? 'settings-connection-feedback--ok'
              : refreshFeedback.ok === false
                ? 'settings-connection-feedback--err'
                : 'settings-connection-feedback--warn',
          ]"
        >
          <CheckCircle2 v-if="refreshFeedback.ok" class="w-4 h-4 shrink-0 mt-0.5" />
          <AlertCircle v-else-if="refreshFeedback.ok === false" class="w-4 h-4 shrink-0 mt-0.5" />
          <Loader2 v-else class="w-4 h-4 shrink-0 mt-0.5 animate-spin" />
          <span>{{ refreshFeedback.message }}</span>
        </div>
      </div>
    </div>
    <div
      v-if="entitiesStore.entitiesCacheHydrated || entitiesStore.entitiesCacheSavedAt"
      class="settings-inline-hint settings-inline-hint--indigo mt-4"
    >
      <Database class="settings-inline-hint__icon" />
      <span>
        {{ '本地实体缓存：'
        }}{{
          entitiesStore.entitiesCacheHydrated
            ? '首屏来自 IndexedDB'
            : '写入 {time}'.replace('{time}', formatCacheTime(entitiesStore.entitiesCacheSavedAt))
        }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ListFilter,
  Database,
} from '@lucide/vue'
import RecommendInsightCard from '@/components/common/RecommendInsightCard.vue'
import { buildEntitySyncRecommendations } from '@/utils/recommend/entity-sync-recommend.util'
import { DEVICES_ROUTES } from '@/utils/device/devices-route.util'

const devicesListLink = DEVICES_ROUTES.list({ controllable: 0 })
const devicesOfflineLink = DEVICES_ROUTES.offline()

const props = defineProps({
  entitiesStore: { type: Object, required: true },
  syncOnlyEnabledEntities: { type: Boolean, required: true },
  syncFilterSaving: { type: Boolean, default: false },
  syncFilterFeedback: { type: Object, default: null },
  refreshingEntities: { type: Boolean, default: false },
  refreshFeedback: { type: Object, default: null },
  saving: { type: Boolean, default: false },
  testing: { type: Boolean, default: false },
  toggleSyncFilter: { type: Function, required: true },
  refreshEntities: { type: Function, required: true },
  formatCacheTime: { type: Function, required: true },
})

const entitySyncInsight = computed(() =>
  buildEntitySyncRecommendations({
    totalCount: props.entitiesStore.totalCount,
    syncOnlyEnabledEntities: props.syncOnlyEnabledEntities,
    cacheHydrated: props.entitiesStore.entitiesCacheHydrated,
  }),
)

function handleBanner(banner) {
  if (banner.id === 'enable-sync-filter' && !props.syncOnlyEnabledEntities) {
    props.toggleSyncFilter()
  } else if (banner.id === 'refresh-entities') {
    props.refreshEntities()
  }
}
</script>

<style scoped src="./styles/EntitiesSection.css"></style>
