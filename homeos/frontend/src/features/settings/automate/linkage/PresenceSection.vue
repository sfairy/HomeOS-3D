<!--
 * 组件：PresenceSection.vue
 *
 * 所属模块：frontend / src / features / settings / automate / linkage
 * 职责：全屋联动「人员在线判定」面板。展示人员在家汇总与模式提示，内嵌
 *      SettingsPresenceEntitiesSection 编辑人员列表，并提供刷新/保存操作。
 * 关键依赖：
 *  - SettingsSectionHead / SettingsPresenceEntitiesSection
 *  - usePresenceEntitiesDisplay：派生汇总文案与在家样式
 * 数据来源：父级透传的 presencePersons（双向）/ 状态 + composable 派生
-->
<script setup lang="ts">
/**
 * 所属模块：frontend/features/settings/automate/linkage
 * 职责：渲染全屋联动人员判定面板，整合子组件与业务数据。
 * 关键依赖：SettingsSectionHead / SettingsPresenceEntitiesSection / presence composable。
 * 约定：数据读写与保存动作经 emit 上抛，不在视图层内直接写业务逻辑。
 */
import { Users } from '@lucide/vue'
import SettingsSectionHead from '@/features/settings/shared/layout/SettingsSectionHead.vue'
import SettingsPresenceEntitiesSection from '@/features/settings/automate/SettingsPresenceEntitiesSection.vue'
import PresenceStatusMeta from '@/features/settings/automate/linkage/PresenceStatusMeta.vue'
import PresenceActions from '@/features/settings/automate/linkage/PresenceActions.vue'
import { usePresenceEntitiesDisplay } from '@/features/settings/automate/composables/presence-linkage.internals'

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
          '定义家庭成员并关联判定实体；默认需全部判定实体在家才算该人员在家（可配 presenceRequireAllAway），驱动在家人数统计与全员离家联动。'
        }}</span>
        <PresenceStatusMeta
          :loading="loading"
          :show-home-summary-style="showHomeSummaryStyle"
          :summary-text="summaryText"
          :mode-hint="modeHint"
        />
      </template>
      <template #actions>
        <PresenceActions :loading="loading" :saving="saving" @refresh="emit('refresh')" @save="emit('save')" />
      </template>
    </SettingsSectionHead>

    <div v-else class="linkage-pane-toolbar">
      <div class="linkage-pane-toolbar__copy">
        <p class="linkage-pane-toolbar__lead">
          {{ '定义家庭成员与判定实体，驱动在家统计与全员离家联动。' }}
        </p>
        <PresenceStatusMeta
          :loading="loading"
          :show-home-summary-style="showHomeSummaryStyle"
          :summary-text="summaryText"
          :mode-hint="modeHint"
        />
      </div>
      <PresenceActions :loading="loading" :saving="saving" @refresh="emit('refresh')" @save="emit('save')" />
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
