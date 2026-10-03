<!--
组件：LifeView.vue
所属模块：frontend / src / views
-->
<template>
  <div class="life-hub page-enter-stagger list-page life-view" :class="[`life-hub--${lifeTab}`]">
    <ListPageHero :title="tabMeta.label" :hint="tabMeta.hint" :tone="tabMeta.tone">
      <template #icon>
        <component :is="tabMeta.icon" class="w-5 h-5" />
      </template>
      <template #aside>
        <template v-if="lifeTab === 'overview' || lifeTab === 'env' || lifeTab === 'energy'">
          <RouterLink
            v-for="link in asideLinks"
            :key="link.to"
            :to="link.to"
            class="list-page__link-btn"
            >{{ link.label }}</RouterLink
          >
          <button
            type="button"
            class="list-page__btn list-page__btn--primary"
            :disabled="analytics.loading.value"
            @click="analytics.reload()"
          >
            <RefreshCw :class="['w-4 h-4', analytics.loading.value && 'animate-spin']" />
            {{ analytics.loading.value ? '刷新中…' : '刷新' }}
          </button>
        </template>
        <RouterLink v-else :to="tabMeta.settingsTo" class="list-page__link-btn">
          {{ tabMeta.settingsLabel }}
        </RouterLink>
      </template>
      <template #stats>
        <ListPageMetrics :cells="heroMetrics" />
      </template>
    </ListPageHero>

    <section class="list-page__panel life-hub__panel">
      <div class="list-page__panel-toolbar life-hub__panel-toolbar">
        <div class="life-hub__panel-toolbar-row">
          <div class="list-page__tabs life-hub__tabs" role="tablist" aria-label="生活中心视图">
            <button
              v-for="tab in hubTabs"
              :key="tab.id"
              type="button"
              role="tab"
              :aria-selected="lifeTab === tab.id"
              :class="['list-page__tab', lifeTab === tab.id && 'list-page__tab--on']"
              @click="setLifeTab(tab.id)"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>
      </div>

      <div class="list-page__panel-body life-hub__panel-body">
        <LifeOverview v-if="lifeTab === 'overview'" @navigate="setLifeTab" />
        <LifeEnvTab v-else-if="lifeTab === 'env'" />
        <LifeEnergyTab v-else-if="lifeTab === 'energy'" />
        <LifeCareTab v-else-if="lifeTab === 'care'" />
        <LifeSmartTab v-else-if="lifeTab === 'smart'" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { RefreshCw } from '@lucide/vue'
import ListPageHero from '@/components/common/list-page/ListPageHero.vue'
import ListPageMetrics from '@/components/common/list-page/ListPageMetrics.vue'
import LifeOverview from '@/views/life/Overview.vue'
import LifeEnvTab from '@/views/life/EnvTab.vue'
import LifeEnergyTab from '@/views/life/EnergyTab.vue'
import LifeCareTab from '@/views/life/CareTab.vue'
import LifeSmartTab from '@/views/life/SmartTab.vue'
import { useLifeView } from '@/composables/life/useLifeView'
import { useLifeOverview } from '@/composables/life/useLifeOverview'
import { useLifeOverviewAnalytics } from '@/composables/life/useLifeOverviewAnalytics'
import '@/views/styles/life-view.css'

const { lifeTab, hubTabs, tabMeta, configLinks, setLifeTab } = useLifeView()
const { heroStatCells, tabMetricCells } = useLifeOverview()
const analytics = useLifeOverviewAnalytics()

const asideLinks = computed(() => {
  if (lifeTab.value === 'overview') return configLinks.value
  return [{ label: tabMeta.value.settingsLabel, to: tabMeta.value.settingsTo }]
})

const heroMetrics = computed(() => {
  const id = lifeTab.value
  if (id === 'overview') return heroStatCells.value
  return tabMetricCells.value[id] || []
})
</script>
