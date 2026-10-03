<!--
  CareHubPanel.vue / components/widgets/care
  关爱中心 Hub 聚合面板：以页签（看护/儿童/访客）方式集成三个子面板，
  使用 HubPanelLayout 统一的页签布局与 tab 持久化令牌机制。
  Props: defaultTab 默认激活页签 key / tabSelectToken 外部强制切页令牌
         / config 布局配置透传给 HubPanelLayout
  子组件：MonitorPanel（看护）+ ChildModePanel（儿童模式 poll 90s）
          + GuestAccessPanel（访客通行）——按 v-show 切换避免重挂载。
  依赖：HubPanelLayout 通用容器 + HaStatusDegradeBanner HA 状态降级提示。
  注意：非首项子面板采用空闲时段 boot 策略，首屏不一次性加载全部数据。
-->
<template>
  <div class="care-hub-root">
    <HubPanelLayout
      title="关爱中心"
      accent="var(--premium-accent-red)"
      :icon-component="HeartHandshake"
      hub-type="careHub"
      :all-tabs="ALL_HUB_TABS"
      :default-tab="defaultTab"
      :tab-select-token="tabSelectToken"
      :config="config"
      @tab-change="onTabChange"
    >
      <template #default="{ activeTab }">
        <div class="care-hub-body care-hub-body--tabs">
          <HaStatusDegradeBanner title="看护数据" />

          <section
            v-show="activeTab === 'monitor'"
            class="care-hub-pane care-hub-pane--monitor"
          >
            <CareMonitorPanel class="widget-hub-panel ch-embed" embedded />
          </section>

          <section
            v-show="activeTab === 'child'"
            class="care-hub-pane care-hub-pane--child"
          >
            <ChildModePanel
              v-if="childReady || activeTab === 'child'"
              class="widget-hub-panel ch-embed ch-embed--pane"
              embedded
              :poll-interval-ms="90_000"
            />
            <p v-else class="care-hub-placeholder">{{ '儿童模式加载中…' }}</p>
          </section>

          <section
            v-show="activeTab === 'guest'"
            class="care-hub-pane care-hub-pane--guest"
          >
            <GuestAccessPanel
              v-if="guestReady || activeTab === 'guest'"
              class="widget-hub-panel ch-embed ch-embed--pane"
              embedded
            />
            <p v-else class="care-hub-placeholder">{{ '访客通行加载中…' }}</p>
          </section>
        </div>
      </template>
    </HubPanelLayout>
  </div>
</template>

<script setup>
/**
 * CareHubPanel - 关爱中心 Hub 面板组件
 * 职责：关爱中心页签式聚合页，集成看护、儿童模式与访客通行三个子面板。
 * 关键依赖：HubPanelLayout 提供统一的页签布局；HaStatusDegradeBanner 显示 HA 状态降级提示。
 * 懒加载策略：子面板按 v-show 切换 + 空闲时段 boot，避免首屏一次性加载全部。
 * Props:
 * - defaultTab/tabSelectToken：默认页签与外部强制切页令牌；
 * - config：Hub 配置对象，透传给 HubPanelLayout。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { HeartHandshake } from '@lucide/vue'
import CareMonitorPanel from './MonitorPanel.vue'
import ChildModePanel from './ChildModePanel.vue'
import GuestAccessPanel from './GuestAccessPanel.vue'
import HubPanelLayout from '@/components/widgets/shared/HubPanelLayout.vue'
import HaStatusDegradeBanner from '@/components/common/HaStatusDegradeBanner.vue'

defineProps({
  defaultTab: { type: String, default: '' },
  tabSelectToken: { type: Number, default: 0 },
  config: { type: Object, default: () => ({}) },
})

const ALL_HUB_TABS = [
  { key: 'monitor', label: '看护' },
  { key: 'child', label: '儿童' },
  { key: 'guest', label: '访客' },
]

const childReady = ref(false)
const guestReady = ref(false)
let idleHandle = 0
let idleTimer = 0

function onTabChange(tab) {
  // 切换到对应页签时再标记可加载，避免初始即渲染全部子面板
  if (tab === 'child') childReady.value = true
  if (tab === 'guest') guestReady.value = true
}

onMounted(() => {
  // 优先使用 requestIdleCallback 在空闲时段懒加载子面板，回退到 setTimeout
  const boot = () => {
    childReady.value = true
    guestReady.value = true
  }
  if (typeof requestIdleCallback === 'function') {
    idleHandle = requestIdleCallback(boot, { timeout: 1400 })
  } else {
    idleTimer = window.setTimeout(boot, 320)
  }
})

onUnmounted(() => {
  // 卸载时清理空闲回调和超时，避免组件销毁后仍触发状态变更
  if (idleHandle && typeof cancelIdleCallback === 'function') cancelIdleCallback(idleHandle)
  if (idleTimer) clearTimeout(idleTimer)
})
</script>

<style scoped src="../styles/widget-hub-embeds.css"></style>
<style scoped>
.care-hub-root {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.care-hub-root :deep(.widget-hub-root) {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.care-hub-body--tabs {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.care-hub-pane {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.care-hub-pane .ch-embed,
.care-hub-pane .ch-embed--pane {
  height: 100% !important;
  min-height: 100% !important;
}

.care-hub-placeholder {
  margin: 0;
  padding: 16px;
  font-size: var(--premium-fs-micro);
  color: var(--hos-text-secondary);
}
</style>
