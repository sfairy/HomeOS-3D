<!--
  组件文件：WidgetConfigForms.vue
  所属模块：frontend/src/views/settings/display/widgets
  组件职责：多变体微件配置聚合子面板，根据 variant 值渲染不同类型的配置表单：
    hubTabs（Hub Tab 视图）、security（安防面板 Tab）、quickAutomation（快捷自动化
    实体多选）、cover（窗帘）、switch（开关）、mediaMini（媒体播放器）、
    energyDashboard（能源 Tab）、height（高度微调滑块）。各自使用 WidgetConfigShell
    外壳包裹并复用 HubTabsConfigField 与 SettingsRangeField 组件。
  主要 props / emits：
    - props variant：变体类型字符串（必填，决定渲染哪个分支）
    - props tabSet / title / description：Hub Tab 类分支的元信息与标题描述
    - props heightDraft / heightPreset / currentHeight：高度变体的数值参数
    - emit save：所有变体底部保存按钮触发
    - emit reset：高度变体的「重置为默认」按钮
    - emit update-height-draft：高度滑块变化时触发
  依赖关系：inject(WIDGET_PANEL_CONFIG_KEY) 读写各变体字段（playerEntities、
    coverEntityIds 等）；引用 SETTINGS_ROUTES 作为跳转到高级参数的链接；
    joinCommaEntityIds / parseCommaEntityIds 工具做逗号分隔实体 ID 转换。
  注意事项：variant 必须匹配其中一个分支，否则无内容渲染；实体字符串字段在内部桥接为
    多选数组方便与 EntityMultiSelect 对接。
-->
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/WidgetConfigForms 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { Blinds, LayoutGrid, Music2, Ruler, Shield, ToggleLeft, Workflow, Zap } from '@lucide/vue'
import { computed, inject } from 'vue'
import { RouterLink } from 'vue-router'
import EntityMultiSelect from '@/components/common/EntityMultiSelect.vue'
import HubTabsConfigField from './HubTabsConfigField.vue'
import SettingsRangeField from '@/views/settings/shared/layout/SettingsRangeField.vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { WIDGET_PANEL_CONFIG_KEY } from '@/composables/settings/display/layout-panel-widgets.internals'
import { joinCommaEntityIds, parseCommaEntityIds } from '@/utils/entity/comma-entity-ids.util'
import WidgetConfigShell from './WidgetConfigShell.vue'
import WidgetConfigFooter from './WidgetConfigFooter.vue'

defineProps({
  /** hubTabs | security | quickAutomation | cover | switch | mediaMini | energyDashboard | height */
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

const coverEntityIdsList = computed({
  get: () =>
    Array.isArray(widgetConfig.coverEntityIds)
      ? widgetConfig.coverEntityIds.map(String).filter(Boolean)
      : parseCommaEntityIds(widgetConfig.coverEntityIds),
  set: (ids) => {
    widgetConfig.coverEntityIds = Array.isArray(ids) ? [...ids] : []
  },
})
</script>

<template>
  <!-- Hub / security / quick automation -->
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

  <WidgetConfigShell
    v-else-if="variant === 'quickAutomation'"
    :icon="Workflow"
    tone="emerald"
    eyebrow="简易自动化"
    title="默认规则模板"
    description="可选：打开微件时预选一条规则模板 ID。"
  >
    <div class="widget-config-shell__section">
      <label class="settings-form-label mb-1">{{ '默认规则模板 ID（可选）' }}</label>
      <input
        v-model="widgetConfig.defaultTemplateId"
        class="settings-field font-mono text-xs"
        placeholder="motion_light"
      />
    </div>
    <template #footer>
      <WidgetConfigFooter @save="$emit('save')" />
    </template>
  </WidgetConfigShell>

  <!-- Cover / switch groups -->
  <WidgetConfigShell
    v-else-if="variant === 'cover'"
    :icon="Blinds"
    tone="sky"
    eyebrow="窗帘组"
    title="实体绑定"
    description="留空则自动按房间分组扫描 cover 实体。"
  >
    <div class="widget-config-shell__section">
      <label class="settings-form-label mb-1">{{ '窗帘实体' }}</label>
      <EntityMultiSelect
        v-model="coverEntityIdsList"
        :allowed-domains="['cover']"
        placeholder="搜索并选择窗帘实体（留空自动发现）"
      />
    </div>
    <template #footer>
      <WidgetConfigFooter @save="$emit('save')" />
    </template>
  </WidgetConfigShell>

  <WidgetConfigShell
    v-else-if="variant === 'switch'"
    :icon="ToggleLeft"
    tone="sky"
    eyebrow="开关控制"
    title="Tab 视图与快捷实体"
    description="侧栏以 3 列芯片展示，点击即可开关；状态通过 WebSocket 实时同步。"
  >
    <HubTabsConfigField v-model="widgetConfig.hubTabs" :tab-set="tabSet" />
    <div class="widget-config-shell__section">
      <p class="widget-config-shell__section-label">{{ '开关实体' }}</p>
      <p class="widget-config-shell__desc mt-1 mb-2">
        {{ '用于「快捷」页，支持 switch / input_boolean 实体。' }}
      </p>
      <EntityMultiSelect
        v-model="widgetConfig.quickSwitchEntities"
        :allowed-domains="['switch', 'input_boolean']"
        placeholder="搜索并选择快捷开关"
      />
    </div>
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

  <!-- Energy dashboard -->
  <WidgetConfigShell
    v-else-if="variant === 'energyDashboard'"
    :icon="Zap"
    tone="amber"
    eyebrow="能源看板"
    title="Tab 视图与账户数据源"
    description="电力、燃气、水务等账户在「生活账户」中统一绑定。"
  >
    <HubTabsConfigField v-model="widgetConfig.hubTabs" :tab-set="tabSet" />
    <div class="widget-config-shell__note">
      <Zap class="widget-config-shell__note-icon" aria-hidden="true" />
      <p class="widget-config-shell__note-text">
        {{ '账户与用量数据源在' }}
        <RouterLink :to="SETTINGS_ROUTES.lifeAccounts()" class="widget-config-shell__note-link">{{
          '生活账户'
        }}</RouterLink>
        {{ '中配置，此处仅控制 Tab 显隐与默认页。' }}
      </p>
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
