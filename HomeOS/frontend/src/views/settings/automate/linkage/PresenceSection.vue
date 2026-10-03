/**
 * 组件：PresenceSection.vue
 *
 * 所属模块：frontend / src / views / settings / automate / linkage
 * 职责：全屋联动「人员在线判定」面板。展示人员在家汇总与模式提示，内嵌
 *      SettingsPresenceEntitiesSection 编辑人员列表，并提供刷新/保存操作。
 * 关键依赖：
 *  - SettingsSectionHead / SettingsPresenceEntitiesSection
 *  - usePresenceEntitiesDisplay：派生汇总文案与在家样式
 * 数据来源：父级透传的 presencePersons（双向）/ 状态 + composable 派生
 */
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/PresenceSection 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { Home, MapPin, RefreshCw, Save, Users } from '@lucide/vue'
import SettingsSectionHead from '@/views/settings/shared/layout/SettingsSectionHead.vue'
import SettingsPresenceEntitiesSection from '@/views/settings/automate/SettingsPresenceEntitiesSection.vue'
import { usePresenceEntitiesDisplay } from '@/composables/advisor/hub-presence-advisor.internals'

// 入参：加载/保存态、自动模式、人员预览、是否隐藏标题
const props = defineProps({
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  autoMode: { type: Boolean, default: false },
  presencePreview: { type: Object, default: null },
  hideHead: { type: Boolean, default: false },
})

// 双向绑定：人员列表（person / device_tracker entity_id 集合）
const presencePersons = defineModel('presencePersons', { type: Array, default: () => [] })

// 对外事件：保存人员配置、刷新人员状态
const emit = defineEmits(['save', 'refresh'])

// 派生在家汇总文案、模式提示与在家高亮样式
const { summaryText, modeHint, showHomeSummaryStyle } = usePresenceEntitiesDisplay({
  presencePersons,
  autoMode: () => props.autoMode,
  presencePreview: () => props.presencePreview,
  loading: () => props.loading,
})
</script>

<template>
  <section class="linkage-workspace-block linkage-workspace-block--presence">
    <SettingsSectionHead
      v-if="!hideHead"
      :icon="Users"
      icon-class="linkage-workspace-head__icon--presence"
      orb-class="linkage-workspace-head__orb--presence"
      title="人员在线判定"
      bordered
    >
      <template #description>
        <span class="linkage-presence-desc">{{
          '定义家庭成员并关联判定实体；任一实体在家则视为该人员在家，驱动在家人数统计与全员离家联动。'
        }}</span>
        <div v-if="!loading" class="linkage-presence-meta">
          <span
            :class="[
              'linkage-presence-status',
              showHomeSummaryStyle && 'linkage-presence-status--home',
            ]"
          >
            <Home v-if="showHomeSummaryStyle" class="w-3.5 h-3.5 shrink-0" />
            <MapPin v-else class="w-3.5 h-3.5 shrink-0" />
            {{ summaryText }}
          </span>
          <span class="linkage-presence-mode">{{ modeHint }}</span>
        </div>
      </template>
      <template #actions>
        <div class="linkage-presence-actions">
          <button
            type="button"
            class="settings-btn-ghost linkage-presence-actions__refresh"
            :disabled="loading"
            :aria-label="'刷新人员状态'"
            @click="emit('refresh')"
          >
            <RefreshCw class="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            class="settings-btn-accent linkage-presence-actions__save"
            :disabled="saving"
            @click="emit('save')"
          >
            <Save class="w-3.5 h-3.5" />
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </template>
    </SettingsSectionHead>

    <div v-else class="linkage-pane-toolbar">
      <div class="linkage-pane-toolbar__copy">
        <p class="linkage-pane-toolbar__lead">
          {{ '定义家庭成员与判定实体，驱动在家统计与全员离家联动。' }}
        </p>
        <div v-if="!loading" class="linkage-presence-meta">
          <span
            :class="[
              'linkage-presence-status',
              showHomeSummaryStyle && 'linkage-presence-status--home',
            ]"
          >
            <Home v-if="showHomeSummaryStyle" class="w-3.5 h-3.5 shrink-0" />
            <MapPin v-else class="w-3.5 h-3.5 shrink-0" />
            {{ summaryText }}
          </span>
          <span class="linkage-presence-mode">{{ modeHint }}</span>
        </div>
      </div>
      <div class="linkage-presence-actions">
        <button
          type="button"
          class="settings-btn-ghost linkage-presence-actions__refresh"
          :disabled="loading"
          :aria-label="'刷新人员状态'"
          @click="emit('refresh')"
        >
          <RefreshCw class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          class="settings-btn-accent linkage-presence-actions__save"
          :disabled="saving"
          @click="emit('save')"
        >
          <Save class="w-3.5 h-3.5" />
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>

    <SettingsPresenceEntitiesSection
      v-model:presence-persons="presencePersons"
      :loading="loading"
      :saving="saving"
      :auto-mode="autoMode"
      :presence-preview="presencePreview"
      embedded
      hide-stats
      class="linkage-workspace-block__content"
      @save="emit('save')"
      @refresh="emit('refresh')"
    />
  </section>
</template>
