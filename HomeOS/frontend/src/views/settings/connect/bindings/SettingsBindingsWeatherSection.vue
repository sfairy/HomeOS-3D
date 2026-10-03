<!--
组件：SettingsBindingsWeatherSection.vue
所属模块：frontend / src / views / settings / connect / bindings
职责：天气绑定分区。绑定 HA 气象实体（weather.*），大屏据此读取天气，并按同前缀自动
      匹配 AQI、生活指数与预警传感器；以流程概览展示绑定状态。
关键依赖：
  - EntityInput：weather 域实体选择
  - SettingsFlowBand / SettingsFlowStat：流程概览
数据来源：父级透传的 weatherEntityId（双向）
-->
<template>
  <div class="settings-hub-section weather-bind-hub">
    <SettingsCard static>
      <SettingsFlowBand
        :steps="weatherFlowSteps"
        class="weather-bind-flow"
        band-class="weather-bind-flow-band"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="weatherFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'绑定状态'"
            :value="weatherEntityId?.trim() ? '已绑定' : '未绑定'"
            :tone="weatherEntityId?.trim() ? 'emerald' : 'amber'"
            :val-tone="weatherEntityId?.trim() ? 'emerald' : 'amber'"
          />
          <SettingsFlowStat
            :label="'气象实体'"
            :value="weatherEntityId?.trim() ? weatherEntityId : '—'"
            tone="sky"
            val-tone="sky"
          />
        </template>
      </SettingsFlowBand>

      <div
        :class="['weather-bind-status', weatherEntityId?.trim() && 'weather-bind-status--bound']"
      >
        <component
          :is="weatherEntityId?.trim() ? CloudSun : CloudOff"
          class="weather-bind-status__icon"
        />
        <div class="weather-bind-status__copy">
          <span class="weather-bind-status__title">
            {{ weatherEntityId?.trim() ? '已绑定气象实体' : '尚未绑定' }}
          </span>
          <span class="weather-bind-status__entity">
            {{ weatherEntityId?.trim() || '请指定 weather.* 实体' }}
          </span>
        </div>
      </div>

      <div class="mt-2.5">
        <label class="settings-form-label mb-1.5">{{ 'HA 气象实体 ID' }}</label>
        <EntityInput
          v-model="weatherEntityId"
          :placeholder="'weather.home'"
          domain-filter="weather"
        />
      </div>
      <p class="settings-note-callout settings-note-callout--sky mt-4">
        <span class="settings-note-callout__label">{{ '提示' }}</span>
        <span>{{
          '指定大屏读取天气的实体。同前缀自动匹配 AQI（sensor.{城市}_aqi）、生活指数（sensor.{城市}_clothing 等）与预警（binary_sensor.{城市}_warning）。'
        }}</span>
      </p>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Cloud, CloudSun, CloudOff, Database, LineChart, Sun, Wind } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import EntityInput from '@/components/common/EntityInput.vue'

// 双向绑定：HA 气象实体 ID（weather.*）
const weatherEntityId = defineModel('weatherEntityId', { type: String, default: '' })

// 流程概览折叠态摘要文案：已绑定显示实体 id，未绑定显示提示
const weatherFlowSummary = computed(() =>
  weatherEntityId.value?.trim()
    ? `已绑定 · ${weatherEntityId.value.trim()}`
    : '尚未绑定气象实体',
)

// 流程概览步骤：HA 气象插件 → weather.* → 预报引擎 → 7 日预报 → AQI/生活指数
const weatherFlowSteps = computed(() => [
  { label: 'HA 气象插件', meta: 'tianqi / HeFeng', icon: Cloud, tone: 'in' },
  { label: 'weather.*', meta: weatherEntityId.value?.trim() || '待绑定', icon: Wind, tone: 'sky' },
  { label: '预报引擎', meta: 'HomeOS 渲染', icon: Database, tone: 'mid' },
  { label: '7 日预报', meta: '大屏展示', icon: Sun, tone: 'exec' },
  { label: 'AQI / 生活指数', meta: '同前缀传感器', icon: LineChart, tone: 'out' },
])
</script>

<style scoped src="./styles/SettingsBindingsWeatherSection.css"></style>
