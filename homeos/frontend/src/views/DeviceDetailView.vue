<!--
  单实体详情页**薄壳**。顶部 ListPageHero 展示设备友好名与 entity_id，返回按钮 +
  事件历史跳转 + 域/状态/房间/控制四项 Metrics；主体用 list-page__tabs 展示 7 个子面板 Tab：
  概览 DeviceOverviewPanel、状态历史 DeviceStateHistoryPanel、
  关联引用 DeviceEntityReferencesPanel、用量 DeviceUsageStats、分析 DeviceAnalyticsPanel、
  属性 DeviceAttrsPanel；空态分为「未指定 id」「HA 未连接」「实体不存在」三档 VEmptyState 兜底。
  视图模型：全部领域逻辑（路由 ?id= 解析、实体 hydrate、域/状态/房间派生、关联实体聚合、
  Tab 与 query 同步、复制/控制动作）已收敛到 `@/features/device` 的 useDeviceDetailView，
  本文件只保留模板与主题注入（--page-accent 为 devices sky 主题）。
  注意事项：Tab 切换不触发额外请求（按需 visible 控制子面板自更新）；
  当 HA 未连接但实体缺失时给出「等待连接」文案而非直接报错。
-->
<template>
  <div class="list-page device-detail-view" :style="pageAccentStyle">
    <ListPageHero v-if="entityId" :title="entityName" :hint="entityId" tone="sky">
      <template #icon>
        <Cpu class="w-5 h-5" />
      </template>
      <template #aside>
        <div class="device-detail-view__hero-aside">
          <button type="button" class="device-detail-view__back-btn" @click="goBack">
            <ChevronLeft class="device-detail-view__back-icon" aria-hidden="true" />
            <span>{{ '返回' }}</span>
          </button>
          <router-link
            :to="{ path: '/events', query: { entity_id: entityId } }"
            class="list-page__link-btn"
          >
            {{ '事件历史' }}
          </router-link>
        </div>
      </template>
      <template v-if="entity && !entityLoading" #stats>
        <ListPageMetrics :cells="detailStatCells" />
      </template>
    </ListPageHero>

    <VEmptyState
      v-if="!entityId"
      tone="sky"
      :title="'未指定设备'"
      :description="'请从设备列表进入，或访问 /device?id=light.xxx'"
    />

    <section v-else class="list-page__panel device-detail-view__panel">
      <ApiQueryState
        :loading="entityLoading"
        :error="entityFetchError"
        tone="sky"
        error-title="设备加载失败"
        @retry="hydrateEntity(entityId)"
      >
        <template v-if="entity">
          <div class="device-detail-view__panel-toolbar list-page__panel-toolbar">
            <div
              class="list-page__tabs device-detail-view__tabs"
              role="tablist"
              :aria-label="'设备详情视图'"
            >
              <button
                v-for="tab in detailTabs"
                :key="tab.id"
                type="button"
                role="tab"
                :aria-selected="detailTab === tab.id"
                :class="['list-page__tab', detailTab === tab.id && 'list-page__tab--on']"
                @click="setDetailTab(tab.id)"
              >
                {{ tab.label }}
                <span v-if="tab.count != null" class="list-page__tab-count">{{ tab.count }}</span>
              </button>
            </div>
          </div>

          <div class="list-page__panel-body device-detail-view__panel-body">
            <div v-show="detailTab === 'overview'" class="device-detail-view__tab-stack">
              <DeviceOverviewPanel
                :entity-id="entityId"
                :visible="detailTab === 'overview'"
                :controllable="!!controllable"
                :related-entities="relatedEntities"
                :related-entities-extra="relatedEntitiesExtra"
                :has-attrs="attrEntries.length > 0"
                @navigate="setDetailTab"
                @control="openControl"
                @copy-id="copyId"
              />
            </div>

            <div v-show="detailTab === 'history'" class="device-detail-view__tab-stack">
              <DeviceStateHistoryPanel :entity-id="entityId" :visible="detailTab === 'history'" />
            </div>

            <div v-show="detailTab === 'refs'" class="device-detail-view__tab-stack">
              <DeviceEntityReferencesPanel :entity-id="entityId" :visible="detailTab === 'refs'" />
            </div>

            <div v-show="detailTab === 'usage'" class="device-detail-view__tab-stack">
              <DeviceUsageStats :entity-id="entityId" :visible="detailTab === 'usage'" />
            </div>

            <div v-show="detailTab === 'analytics'" class="device-detail-view__tab-stack">
              <DeviceAnalyticsPanel :entity-id="entityId" :visible="detailTab === 'analytics'" />
            </div>

            <div
              v-show="detailTab === 'attrs' && attrTotalCount > 0"
              class="device-detail-view__tab-stack"
            >
              <DeviceAttrsPanel :entries="attrEntries" :total-count="attrTotalCount" />
            </div>
          </div>
        </template>
      </ApiQueryState>

      <VEmptyState
        v-if="!entityLoading && !entityFetchError && !entity && !entitiesStore.connected"
        tone="amber"
        :title="'等待连接'"
        :description="'Home Assistant 未连接，无法加载设备状态'"
      />
      <VEmptyState
        v-else-if="!entityLoading && !entityFetchError && !entity"
        tone="rose"
        :title="'设备不存在'"
        :description="'实体 {id} 未在 state-store 中找到'.replace('{id}', entityId)"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, Cpu } from '@lucide/vue'
import ListPageHero from '@/components/page-shell/ListPageHero.vue'
import ListPageMetrics from '@/components/page-shell/ListPageMetrics.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import {
  DeviceAnalyticsPanel,
  DeviceAttrsPanel,
  DeviceEntityReferencesPanel,
  DeviceOverviewPanel,
  DeviceStateHistoryPanel,
  DeviceUsageStats,
  useDeviceDetailView,
} from '@/features/device'

/**
 * 页面主色注入（Task 4：DeviceDetail 同步 Devices 的 sky 主题）
 * 通过 :style 在根元素注入 --page-accent / --page-accent-rgb，
 * 配合 list-page-views.css 与 devices-theme.css 中已有的 var(--page-accent) 引用，
 * 并在 scoped CSS 中派生 --page-accent-bg/border/glow/text 与 --set-* 语义色。
 */
const pageAccentStyle = {
  '--page-accent': 'var(--module-accent-devices)',
  '--page-accent-rgb': 'var(--module-accent-devices-rgb)',
  '--page-accent-secondary': 'var(--module-accent-devices-sub)',
  '--page-accent-secondary-rgb': 'var(--module-accent-devices-sub-rgb)',
} as Record<string, string>

const {
  entitiesStore,
  entityId,
  entity,
  entityLoading,
  entityFetchError,
  detailTab,
  entityName,
  detailStatCells,
  detailTabs,
  relatedEntities,
  relatedEntitiesExtra,
  attrEntries,
  attrTotalCount,
  controllable,
  setDetailTab,
  goBack,
  openControl,
  copyId,
  hydrateEntity,
} = useDeviceDetailView()
</script>

<style>
/* 与 DevicesView 共用：卡片/指标栅格/概览布局。两页是独立懒加载路由，
  只挂在列表页时，直达 /device 或刷新详情会出现「HTML 在、样式不在」。 */
@import '@/views/styles/devices-theme.css';
</style>
<style scoped src="./styles/DeviceDetailView.css"></style>
