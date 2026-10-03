<!--
组件：SettingsPresenceEntitiesSection.vue
所属模块：frontend / src / views / settings / automate
职责：「人员在线判定」面板。展示跟踪人员 / 在家 / 外出统计，工具栏展示当前汇总状态，
      并通过 PresencePersonListInput 编辑人员列表；支持自动模式提示与保存/刷新。
关键依赖：
  - PresencePersonListInput：人员列表输入子组件
  - usePresenceEntitiesDisplay：派生人员状态、在家计数与汇总文案
  - Loader2 / Home / MapPin / RefreshCw / Save / Sparkles 图标来自 @lucide/vue
数据来源：父级透传的 presencePersons / autoMode / presencePreview + composable 派生
-->
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/SettingsPresenceEntitiesSection 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { Loader2, Home, MapPin, RefreshCw, Save, Sparkles } from '@lucide/vue'
import PresencePersonListInput from '@/components/common/PresencePersonListInput.vue'
import { usePresenceEntitiesDisplay } from '@/composables/advisor/hub-presence-advisor.internals'

// 入参：加载/保存中、自动模式、人员预览、是否隐藏统计、是否嵌入
const props = defineProps({
  loading: Boolean,
  saving: Boolean,
  autoMode: Boolean,
  presencePreview: { type: Object, default: null },
  hideStats: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
})

// 双向绑定：人员列表（person / device_tracker entity_id 集合）
const presencePersons = defineModel('presencePersons', { type: Array, default: () => [] })

// 对外事件：保存人员配置、刷新人员状态
const emit = defineEmits(['save', 'refresh'])

const { previewMembers, personStatusMap, atHomeCount, showHomeSummaryStyle, summaryText, modeHint } =
  usePresenceEntitiesDisplay({
    presencePersons,
    autoMode: () => props.autoMode,
    presencePreview: () => props.presencePreview,
    loading: () => props.loading,
  })

// 工具栏「保存」按钮：向上触发 save 事件
function save() {
  emit('save')
}

// 工具栏「刷新」按钮：向上触发 refresh 事件
function refresh() {
  emit('refresh')
}
</script>

<template>
  <div :class="['presence-panel', embedded && 'presence-panel--embedded']">
    <div v-if="!hideStats && !embedded" class="presence-stats">
      <div class="presence-stat">
        <span class="presence-stat__val">{{ previewMembers.length }}</span>
        <span class="presence-stat__lbl">{{ '跟踪人员' }}</span>
      </div>
      <div class="presence-stat">
        <span :class="['presence-stat__val', atHomeCount > 0 && 'presence-stat__val--home']">{{
          atHomeCount
        }}</span>
        <span class="presence-stat__lbl">{{ '在家' }}</span>
      </div>
      <div class="presence-stat">
        <span class="presence-stat__val">{{
          Math.max(0, previewMembers.length - atHomeCount)
        }}</span>
        <span class="presence-stat__lbl">{{ '外出' }}</span>
      </div>
    </div>

    <div v-if="!embedded" class="presence-toolbar">
      <div
        :class="[
          'presence-toolbar__status',
          showHomeSummaryStyle
            ? 'presence-toolbar__status--home'
            : 'presence-toolbar__status--away',
        ]"
      >
        <Home v-if="showHomeSummaryStyle" class="w-3.5 h-3.5 shrink-0" />
        <MapPin v-else class="w-3.5 h-3.5 shrink-0" />
        <span>{{ summaryText }}</span>
      </div>
      <span class="presence-toolbar__mode">{{ modeHint }}</span>
      <div class="presence-toolbar__actions">
        <button
          type="button"
          class="presence-btn presence-btn--ghost"
          :disabled="loading"
          :aria-label="'刷新人员状态'"
          @click="refresh"
        >
          <RefreshCw class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          class="presence-btn presence-btn--primary"
          :disabled="saving"
          @click="save"
        >
          <Save class="w-3.5 h-3.5" />
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="settings-premium-empty settings-premium-empty--sky presence-loading">
      <Loader2 class="settings-premium-empty__icon animate-spin" />
      <p class="settings-premium-empty__title">{{ '加载人员状态…' }}</p>
      <p class="settings-premium-empty__desc">{{ '正在读取 person / device_tracker 实体状态' }}</p>
    </div>

    <template v-else>
      <div v-if="autoMode" class="presence-auto-tip">
        <Sparkles class="w-3.5 h-3.5 shrink-0 opacity-70" />
        <span>{{
          '当前自动跟踪全部 person / device_tracker。添加并保存人员后将切换为自定义聚合模式。'
        }}</span>
      </div>

      <PresencePersonListInput
        v-model="presencePersons"
        :status-map="personStatusMap"
        :embedded="embedded"
      />

      <p v-if="!embedded" class="presence-footnote">
        {{ '保存后顶部在家人数、离家联动将按上述规则生效' }}
      </p>
    </template>
  </div>
</template>

<style scoped src="./styles/SettingsPresenceEntitiesSection.css"></style>
