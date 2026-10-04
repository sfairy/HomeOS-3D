<!--
组件：ClientPowerPendingSection.vue
所属模块：frontend / src / views / settings / home / client-power
职责：待配对终端区段。展示已发现但未配置策略的终端列表，每台含设备类型/在线状态/电量条/规格 chip，
      提供「添加设备」与「清除」（仅离线可清除），并支持批量清除所有离线终端。
关键依赖：
  - SettingsCard / SettingsCardIntro：卡片与头部
  - ClientPowerBatteryBar：电量条
  - lucide 图标
数据来源：父级透传的 pending / 各类派生函数 / 离线计数
-->
<script setup>
/**
 * 职责：渲染 views/ClientPowerPendingSection 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { Monitor, Plus, Smartphone, Tablet, Trash2 } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/page-shell/SettingsCardIntro.vue'
import ClientPowerBatteryBar from './ClientPowerBatteryBar.vue'

// 入参：待配对列表、设备类型/标题/实时行/电量/规格派生函数、添加/清除/批量清除回调
defineProps({
  pending: { type: Array, required: true },
  deviceKind: { type: Function, required: true },
  pendingCardTitle: { type: Function, required: true },
  pendingLiveRow: { type: Function, required: true },
  pendingBatteryRow: { type: Function, required: true },
  pendingOffline: { type: Function, required: true },
  batteryState: { type: Function, required: true },
  batteryPercent: { type: Function, required: true },
  specChips: { type: Function, required: true },
  addClientFromPending: { type: Function, required: true },
  dismissPending: { type: Function, required: true },
  pendingOfflineCount: { type: Number, default: 0 },
  dismissAllOfflinePending: { type: Function, required: true },
})
</script>

<template>
  <SettingsCard full static extra-class="charge-section-card charge-section-card--pending">
    <SettingsCardIntro
      :icon="Smartphone"
      icon-class="cpp-icon-warn"
      orb-class="cpp-orb-warn"
      eyebrow="待配对终端"
      :description="'已发现新设备，添加后即可配置充电器开关与电量阈值。'"
    >
      <template #desc>
        <p class="charge-section-kicker">
          <span class="charge-section-kicker__dot" />
          {{ pending.length }}{{ ' 台等待接入' }}
        </p>
      </template>
      <template #actions>
        <button
          v-if="pendingOfflineCount > 0"
          type="button"
          class="charge-pending-clear-btn"
          :title="'清除所有离线终端的发现记录'"
          @click="dismissAllOfflinePending(pending.filter((p) => pendingOffline(p)))"
        >
          <Trash2 class="w-3.5 h-3.5" />
          {{ `清除离线 (${pendingOfflineCount})` }}
        </button>
      </template>
    </SettingsCardIntro>
    <div class="charge-device-list charge-device-list--pending">
      <article
        v-for="p in pending"
        :key="p.clientId"
        :class="[
          'charge-device-card',
          'charge-device-card--pending',
          `charge-device-card--kind-${deviceKind(p)}`,
        ]"
      >
        <div class="charge-device-card__alerts charge-device-card__alerts--discovery">
          <p class="charge-device-card__alert">{{ '新发现终端 · 添加后可配置充电器与电量阈值' }}</p>
        </div>

        <header class="charge-device-card__head">
          <div class="charge-device-card__identity">
            <div
              :class="[
                'charge-device-card__avatar',
                `charge-device-card__avatar--${deviceKind(p)}`,
              ]"
            >
              <Tablet v-if="deviceKind(p) === 'tablet'" class="w-4 h-4" />
              <Smartphone v-else-if="deviceKind(p) === 'phone'" class="w-4 h-4" />
              <Monitor v-else class="w-4 h-4" />
            </div>
            <div class="charge-device-card__meta">
              <div class="charge-device-card__title-row">
                <h4 class="charge-device-card__name">{{ pendingCardTitle(p) }}</h4>
                <span class="charge-device-card__badge">{{ '新发现' }}</span>
              </div>
              <p v-if="pendingLiveRow(p)" class="charge-device-card__status">
                <span
                  :class="[
                    'charge-online-dot',
                    pendingLiveRow(p).online && 'charge-online-dot--on',
                  ]"
                />
                {{ pendingLiveRow(p).online ? '在线' : '离线' }}
                <template v-if="batteryState(pendingBatteryRow(p)).percent != null">
                  · {{ batteryState(pendingBatteryRow(p)).percent }}%
                  <span
                    v-if="batteryState(pendingBatteryRow(p)).charging"
                    class="charge-status-charging"
                    >{{ '充电中' }}</span
                  >
                </template>
              </p>
              <p v-else class="charge-device-card__status charge-device-card__status--muted">
                {{ '等待终端上报' }}
              </p>
              <div v-if="specChips(p).length" class="charge-device-card__chips">
                <span
                  v-for="chip in specChips(p)"
                  :key="chip.key"
                  :class="[
                    'charge-metric-pill',
                    chip.tone === 'emerald' && 'charge-metric-pill--accent',
                  ]"
                >
                  {{ chip.label }}
                </span>
              </div>
            </div>
          </div>

          <div class="charge-device-card__actions">
            <button
              v-if="pendingOffline(p)"
              type="button"
              class="charge-pending-clear-btn"
              :title="'清除该离线终端的发现记录'"
              @click="dismissPending(p, pendingCardTitle(p))"
            >
              <Trash2 class="w-3.5 h-3.5" />
              {{ '清除' }}
            </button>
            <button
              type="button"
              class="charge-pending-add-btn settings-btn-accent text-xs"
              @click="addClientFromPending(p)"
            >
              <Plus class="w-3.5 h-3.5" />
              {{ '添加设备' }}
            </button>
          </div>
        </header>

        <ClientPowerBatteryBar
          v-if="batteryPercent(pendingBatteryRow(p)) != null"
          :percent="batteryPercent(pendingBatteryRow(p))"
          :charging="batteryState(pendingBatteryRow(p)).charging"
        />
      </article>
    </div>
  </SettingsCard>
</template>

<style scoped src="./styles/client-power.css"></style>
