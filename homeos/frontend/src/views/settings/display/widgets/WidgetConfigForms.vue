<!--
  组件文件：WidgetConfigForms.vue
  所属模块：frontend/src/views/settings/display/widgets
  组件职责：多变体微件配置聚合子面板，根据 variant 值渲染不同类型的配置表单：
    hubTabs（Hub Tab 视图）、security（安防面板 Tab）、mediaMini（媒体播放器）、
    height（高度微调滑块）。各自使用 WidgetConfigShell 外壳包裹并复用
    HubTabsConfigField 与 SettingsRangeField 组件。
  主要 props / emits：
    - props variant：变体类型字符串（必填，决定渲染哪个分支）
    - props tabSet / title / description：Hub Tab 类分支的元信息与标题描述
    - props heightDraft / heightPreset / currentHeight：高度变体的数值参数
    - emit save：所有变体底部保存按钮触发
    - emit reset：高度变体的「重置为默认」按钮
    - emit update-height-draft：高度滑块变化时触发
  依赖关系：inject(WIDGET_PANEL_CONFIG_KEY) 读写各变体字段（playerEntities 等）。
  注意事项：variant 必须匹配其中一个分支，否则无内容渲染；实体字符串字段在内部桥接为
    多选数组方便与 EntityMultiSelect 对接。
-->
<script setup>
/**
 * 职责：渲染 views/WidgetConfigForms 页面视图，整合子组件与业务数据。
 */
import { LayoutGrid, Music2, Ruler, Shield } from '@lucide/vue'
import { computed, inject } from 'vue'
import EntityMultiSelect from '@/components/common/EntityMultiSelect.vue'
import HubTabsConfigField from './HubTabsConfigField.vue'
import SettingsRangeField from '@/views/settings/shared/layout/SettingsRangeField.vue'
import { WIDGET_PANEL_CONFIG_KEY } from '@/composables/settings/display/layout-panel-widgets.internals'
import { joinCommaEntityIds, parseCommaEntityIds } from '@/utils/entity/comma-entity-ids.util'
import WidgetConfigShell from './WidgetConfigShell.vue'
import WidgetConfigFooter from './WidgetConfigFooter.vue'

defineProps({
  /** hubTabs | security | mediaMini | height */
  variant: { type: String, required: true },
  tabSet: { type: Array, default: () => [] },
  title: { type: String, default: 'Hub Tab 配置' },
  description: {
    type: String,
    default: '选择侧栏/面板中显示的 Tab 视图与默认打开页。',
  },
  heightDraft: { type: Number, default: 0 },
  heightPreset: { type: Number, default: 0 },
  currentHeight: { type: Number, default: 0 },
})

defineEmits(['save', 'reset', 'update-height-draft'])

const widgetConfig = inject(WIDGET_PANEL_CONFIG_KEY)

const playerEntitiesList = computed({
  get: () => parseCommaEntityIds(widgetConfig.playerEntities),
  set: (ids) => {
    widgetConfig.playerEntities = joinCommaEntityIds(ids)
  },
})
</script>

<template>
  <!-- Hub / security -->
  <WidgetConfigShell
    v-if="variant === 'hubTabs'"
    :icon="LayoutGrid"
    tone="sky"
    eyebrow="Tab 视图"
    :title="title"
    :description="description"
  >
    <HubTabsConfigField v-model="widgetConfig.hubTabs" :tab-set="tabSet" />
    <template #footer>
      <WidgetConfigFooter @save="$emit('save')" />
    </template>
  </WidgetConfigShell>

  <WidgetConfigShell
    v-else-if="variant === 'security'"
    :icon="Shield"
    tone="rose"
    eyebrow="安防面板"
    title="Tab 与默认视图"
    description="安防区域在运行时面板配置；此处可指定默认 Tab 与可见视图。"
  >
    <HubTabsConfigField v-model="widgetConfig.hubTabs" :tab-set="tabSet" />
    <template #footer>
      <WidgetConfigFooter @save="$emit('save')" />
    </template>
  </WidgetConfigShell>

  <!-- Media mini -->
  <WidgetConfigShell
    v-else-if="variant === 'mediaMini'"
    :icon="Music2"
    tone="purple"
    eyebrow="媒体迷你"
    title="播放器与 Tab"
    description="配置侧栏媒体控制面板默认视图与播放器实体列表。"
  >
    <HubTabsConfigField v-model="widgetConfig.hubTabs" :tab-set="tabSet" />
    <div class="widget-config-shell__section">
      <label class="settings-form-label mb-1">{{ '播放器实体列表' }}</label>
      <EntityMultiSelect
        v-model="playerEntitiesList"
        :allowed-domains="['media_player']"
        placeholder="选择播放器实体（可多选，留空自动发现）"
      />
    </div>
    <template #footer>
      <WidgetConfigFooter @save="$emit('save')" />
    </template>
  </WidgetConfigShell>

  <!-- Height -->
  <WidgetConfigShell
    v-else-if="variant === 'height'"
    :icon="Ruler"
    tone="sky"
    eyebrow="布局"
    title="卡片高度"
    :description="`类型预设 ${heightPreset}px。「恢复预设」与保存该数值使用同一高度，主页显示一致。`"
  >
    <SettingsRangeField
      :model-value="heightDraft"
      label="卡片高度"
      :min="60"
      :max="600"
      :step="1"
      unit="px"
      variant="inline"
      value-accent="sky"
      input-wide
      @update:model-value="$emit('update-height-draft', $event)"
    />
    <template #head-actions>
      <span v-if="currentHeight" class="widget-config-shell__chip widget-config-shell__chip--sky">{{
        `${currentHeight}px`
      }}</span>
    </template>
    <template #footer>
      <WidgetConfigFooter save-label="保存高度" @save="$emit('save')">
        <button type="button" class="settings-btn-ghost text-xs" @click="$emit('reset')">
          {{ '恢复预设' }}
        </button>
      </WidgetConfigFooter>
    </template>
  </WidgetConfigShell>
</template>

<style scoped src="../styles/layout-panels.css"></style>
