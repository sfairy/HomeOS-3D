<!--
组件：SecurityZoneMonitor.vue
所属模块：frontend / src / views / security
职责：安防「区域运行监控」面板。展示区域总数/已布防/告警/当前模式参与统计，
      支持管理员选择布防区域（全选/清空/单选）；卡片可展开查看传感器状态。
关键依赖：
  - useSecurityZoneMonitor：派生区域增强信息（armed / alertCount / modeHint 等）
  - sensorStateLabel：传感器状态文案
  - useAuthStore：判断是否可编辑（admin）
  - LayoutGrid / Shield 图标来自 @lucide/vue
数据来源：父级透传的 liveZones / layoutZones / secCurrentMode + useSecurityZoneMonitor
-->
<template>
  <div class="szm">
    <div class="szm-summary">
      <article class="szm-stat">
        <span class="szm-stat__val">{{ summary.total }}</span>
        <span class="szm-stat__label">{{ '区域总数' }}</span>
      </article>
      <article :class="['szm-stat', summary.armed > 0 && 'szm-stat--armed']">
        <span class="szm-stat__val">{{ summary.armed }}</span>
        <span class="szm-stat__label">{{ '已布防' }}</span>
      </article>
      <article :class="['szm-stat', summary.alerts > 0 && 'szm-stat--alert']">
        <span class="szm-stat__val">{{ summary.alerts }}</span>
        <span class="szm-stat__label">{{ '传感器告警' }}</span>
      </article>
      <article class="szm-stat">
        <span class="szm-stat__val">{{ summary.activeInMode }}</span>
        <span class="szm-stat__label">{{ '当前模式参与' }}</span>
      </article>
    </div>

    <div v-if="canSelect && liveZones.length" class="szm-select-bar">
      <p class="szm-select-bar__hint">
        <Shield class="w-3.5 h-3.5 shrink-0 opacity-60" />
        <span v-if="armSelection.length">{{
          `已选 ${armSelection.length}/${liveZones.length} 个区域，切换模式时仅布防所选区域`
        }}</span>
        <span v-else>{{ '未选择时将布防全部区域；勾选后可选择性布防' }}</span>
      </p>
      <div class="szm-select-bar__actions">
        <button type="button" class="szm-link-btn" @click="selectAll">{{ '全选' }}</button>
        <button type="button" class="szm-link-btn" @click="clearSelection">{{ '清空' }}</button>
      </div>
    </div>

    <div v-if="panelLoading && !panelReady" class="szm-loading">
      <div v-for="i in 3" :key="i" class="szm-loading-card" />
    </div>

    <div v-else-if="liveZones.length === 0" class="szm-empty">
      <LayoutGrid class="szm-empty__icon" />
      <p class="szm-empty__title">{{ '暂无安防区域' }}</p>
      <p class="szm-empty__desc">{{ '切换到「区域配置」添加区域，或从 HA 房间一键生成' }}</p>
      <button type="button" class="sec-dash-btn sec-dash-btn--primary" @click="$emit('go-config')">
        {{ '去配置区域' }}
      </button>
    </div>

    <div v-else class="szm-grid">
      <article
        v-for="zone in enrichedZones"
        :key="zone.id"
        :class="[
          'szm-card',
          zone.armed && 'szm-card--armed',
          zone.alertCount > 0 && 'szm-card--alert',
          !zone.activeInMode && secCurrentMode !== 'disarmed' && 'szm-card--muted',
        ]"
      >
        <header class="szm-card__head">
          <label v-if="canSelect" class="szm-card__check">
            <input type="checkbox" :checked="isSelected(zone.id)" @change="toggleSelect(zone.id)" />
          </label>
          <div class="szm-card__title-wrap">
            <h4 class="szm-card__title">{{ zone.name }}</h4>
            <p v-if="zone.roomLabel" class="szm-card__room">{{ zone.roomLabel }}</p>
          </div>
          <div class="szm-card__badges">
            <span :class="['szm-badge', `szm-badge--${zone.zoneType}`]">{{
              zone.zoneTypeLabel
            }}</span>
            <span :class="['szm-badge', zone.armed ? 'szm-badge--armed' : 'szm-badge--idle']">
              {{ zone.armed ? '布防中' : '未布防' }}
            </span>
          </div>
        </header>

        <p :class="['szm-card__mode-hint', !zone.activeInMode && 'is-muted']">
          {{ zone.modeHint }}
        </p>

        <div class="szm-card__metrics">
          <span>{{ `${zone.sensorTotal} 传感器` }}</span>
          <button
            v-if="zone.alertCount"
            type="button"
            class="szm-metric-link is-alert"
            @click="$emit('filter-audit', zone.id)"
          >
            {{ `${zone.alertCount} 告警` }}
          </button>
          <span v-if="zone.offlineCount" class="is-offline">{{ `${zone.offlineCount} 离线` }}</span>
        </div>

        <details v-if="zone.sensors.length" class="szm-card__sensors">
          <summary>{{ '查看传感器状态' }}</summary>
          <ul class="szm-sensor-list">
            <li
              v-for="s in zone.sensors"
              :key="s.entity_id"
              :class="['szm-sensor-row', s.alert && 'is-alert', s.offline && 'is-offline']"
            >
              <span class="szm-sensor-row__type">{{ s.label }}</span>
              <span class="szm-sensor-row__name" :title="s.entity_id">{{ s.name }}</span>
              <span class="szm-sensor-row__state">{{
                sensorStateLabel(s.state, s.alert, s.offline)
              }}</span>
            </li>
          </ul>
        </details>

        <footer v-if="canSelect" class="szm-card__foot">
          <button type="button" class="szm-link-btn" @click="$emit('edit-zone', zone.id)">
            {{ '编辑此区域' }}
          </button>
        </footer>
      </article>
    </div>
  </div>
</template>

<script setup>
import { computed, toRef } from 'vue'
import { LayoutGrid, Shield } from '@lucide/vue'
import { useSecurityZoneMonitor } from '@/composables/security/useSecurityZoneMonitor'
import { sensorStateLabel } from '@/utils/security/zone-mode.util'
import { useAuthStore } from '@/stores/auth.store'
import './styles/security.css'

// 入参：实时区域、布局区域、当前安防模式、面板加载/就绪态
const props = defineProps({
  liveZones: { type: Array, default: () => [] },
  layoutZones: { type: Array, default: () => [] },
  secCurrentMode: { type: String, default: 'disarmed' },
  panelLoading: Boolean,
  panelReady: Boolean,
})

// 对外事件：跳转配置、编辑某区域、按区域筛选审计
defineEmits(['go-config', 'edit-zone', 'filter-audit'])

// 双向绑定：布防区域选择（用于选择性布防）
const armSelection = defineModel('armSelection', { type: Array, default: () => [] })

const authStore = useAuthStore()
// 仅管理员可勾选区域进行选择性布防
const canSelect = computed(() => authStore.role === 'admin')

// 转为 ref 传入 composable，保证响应式追踪
const liveRef = toRef(props, 'liveZones')
const layoutRef = toRef(props, 'layoutZones')
const modeRef = toRef(props, 'secCurrentMode')

// 复用 composable 派生区域增强信息与汇总统计
const { enrichedZones, summary } = useSecurityZoneMonitor(liveRef, layoutRef, modeRef)

// 判断指定区域是否在布防选择中
function isSelected(id) {
  return armSelection.value.includes(id)
}

// 切换某区域的选中态（去重保持稳定顺序）
function toggleSelect(id) {
  const set = new Set(armSelection.value)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  armSelection.value = [...set]
}

// 全选所有实时区域
function selectAll() {
  armSelection.value = props.liveZones.map((z) => z.id)
}

// 清空布防区域选择
function clearSelection() {
  armSelection.value = []
}
</script>
