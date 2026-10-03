<!--
组件：SettingsLayoutEventlogSection.vue
所属模块：frontend / src / views / settings / display / layout
职责：即时消息墙区段。开关启用、配置显示锚点（预设四角或自定义坐标）、窗口宽高与消息停留时间。
关键依赖：
  - SettingsCard / SettingsCardIntro：卡片与头部
  - HosSelect：锚点预设下拉
  - SettingsRangeField：滑块输入
  - SETTINGS_RANGE_STEP：滑块步进常量
  - useLayoutStore：读写 eventLogConfig
数据来源：layoutStore.layoutConfig.eventLogConfig
-->
<template>
  <div class="settings-hub-section">
    <SettingsCard>
      <SettingsCardIntro
        :icon="ScrollText"
        icon-class="el-icon-accent"
        orb-class="el-orb-accent"
        :title="'即时消息墙'"
        :description="'在主页楼层图上显示实时的设备状态变更流。支持自由定位坐标。'"
      >
        <template #actions>
          <button
            type="button"
            :class="[
              'settings-btn-ghost shrink-0',
              eventLogConfig?.enabled && 'settings-btn-ghost--active',
            ]"
            @click="$emit('toggle-event-log')"
          >
            {{ eventLogConfig?.enabled ? '关闭消息墙' : '开启消息墙' }}
          </button>
        </template>
      </SettingsCardIntro>

      <div
        v-if="!eventLogConfig?.enabled"
        class="settings-premium-empty settings-premium-empty--violet mt-5"
      >
        <ScrollText class="settings-premium-empty__icon" />
        <p class="settings-premium-empty__title">{{ '消息墙已关闭' }}</p>
        <p class="settings-premium-empty__desc">{{ '开启后可在户型图上实时展示设备状态变更' }}</p>
        <div class="settings-premium-empty__actions">
          <button
            type="button"
            class="settings-premium-empty__btn settings-premium-empty__btn--accent"
            @click="$emit('toggle-event-log')"
          >
            {{ '开启消息墙' }}
          </button>
        </div>
      </div>

      <Transition name="fade">
        <div v-if="eventLogConfig?.enabled" class="mt-6 space-y-6 pl-4 border-l-2 el-border-accent">
          <div v-if="eventLogConfig" class="space-y-2">
            <label class="settings-form-label">{{ '显示锚点预设' }}</label>
            <HosSelect
              variant="inline"
              block
              trigger-class="w-full bg-[rgba(255,255,255,0.05)] border border-white/10 rounded-xl px-4 py-3 text-sm text-white el-focus-accent outline-none transition-all"
              v-model="eventLogConfig.position"
            >
              <option value="bottom-left">{{ '左下角 (默认)' }}</option>
              <option value="top-left">{{ '左上角' }}</option>
              <option value="top-right">{{ '右上角' }}</option>
              <option value="bottom-right">{{ '右下角' }}</option>
              <option value="custom">
                <SettingsIcon class="w-3 h-3 inline" /> {{ '自定义精确坐标' }}
              </option>
            </HosSelect>
          </div>
          <div
            v-if="eventLogConfig?.position === 'custom'"
            class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2"
          >
            <SettingsRangeField
              v-model="eventLogConfig.xPct"
              variant="plain"
              :label="'水平位移 (X)'"
              :min="0"
              :max="100"
              :step="SETTINGS_RANGE_STEP.percent"
              unit="%"
            />
            <SettingsRangeField
              v-model="eventLogConfig.yPct"
              variant="plain"
              :label="'垂直位移 (Y)'"
              :min="0"
              :max="100"
              :step="SETTINGS_RANGE_STEP.percent"
              unit="%"
            />
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/5">
            <SettingsRangeField
              v-model="eventLogConfig.width"
              variant="plain"
              :label="'显示窗口宽度'"
              :min="200"
              :max="600"
              :step="SETTINGS_RANGE_STEP.panelPx"
              unit="px"
            />
            <SettingsRangeField
              v-model="eventLogConfig.maxHeight"
              variant="plain"
              :label="'显示窗口高度'"
              :min="100"
              :max="500"
              :step="SETTINGS_RANGE_STEP.panelPx"
              unit="px"
            />
          </div>
          <div class="pt-4 border-t border-white/5">
            <SettingsRangeField
              v-model="eventLogConfig.displayDuration"
              variant="plain"
              :label="'消息停留时间 (秒)'"
              :min="1"
              :max="20"
              :step="SETTINGS_RANGE_STEP.seconds"
              unit="s"
            />
          </div>
        </div>
      </Transition>
    </SettingsCard>
  </div>
</template>

<script setup>
import HosSelect from '@/components/common/base/HosSelect.vue'

import { Settings as SettingsIcon, ScrollText } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/page-shell/SettingsCardIntro.vue'
import SettingsRangeField from '@/views/settings/shared/layout/SettingsRangeField.vue'
import { SETTINGS_RANGE_STEP } from '@/utils/settings/range-steps.util'
import { useLayoutStore } from '@/stores/layout.store'

const layoutStore = useLayoutStore()
// 消息墙配置（含 enabled / position / xPct / yPct / width / maxHeight / displayDuration）
const eventLogConfig = layoutStore.layoutConfig.eventLogConfig

// 对外事件：切换消息墙开关
defineEmits(['toggle-event-log'])
</script>

<style scoped src="./styles/settings-layout-edit-section.css"></style>
