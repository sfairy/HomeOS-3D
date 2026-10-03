<!--
组件：SystemConfigWorkspace.vue
所属模块：frontend / src / views / settings / system / system-config
职责：高级参数工作区。按分区渲染开关字段与输入字段，内嵌 SystemConfigFieldCell 与 SystemConfigSectionDock，
      支持开发 key 显示与屏保预览。
Props：
  - section：当前分区对象
  - displayFieldCount / filteredFieldCount：显示/过滤后字段数
  - booleanFields / inputFields / inputFieldEntries：开关与输入字段
  - showDevKeys / screensaverPreviewActive：显示开关
  - fieldId / fieldLabel / fieldHint / isFieldPending：字段元数据函数
Emits：
  - field-value / field-masked：字段值与掩码变更
关键依赖：
  - SettingsCard：卡片容器
  - SystemConfigFieldCell / SystemConfigSectionDock：字段单元格与分区委派
  - sectionMeta：分区元数据
数据来源：父级 ConfigPanel 透传的分区与字段
-->
<template>
  <SettingsCard
    :key="section.key"
    flat
    static
    extra-class="!p-0 params-panel-card params-panel-card--body"
    :style="{ '--panel-accent': sectionMeta(section.key).accent }"
  >
    <SystemConfigSectionDock
      :section-key="section.key"
      :preview-active="screensaverPreviewActive"
      @preview="$emit('preview-screensaver', $event)"
      @close-preview="$emit('close-screensaver-preview')"
    />

    <div
      v-if="displayFieldCount === 0"
      class="settings-premium-empty settings-premium-empty--sky params-panel-empty"
    >
      <SlidersHorizontal class="settings-premium-empty__icon" />
      <p class="settings-premium-empty__title">{{ '本组暂无参数' }}</p>
      <p class="settings-premium-empty__desc">{{ '当前分组没有可编辑的运行参数，可尝试开启专家模式' }}</p>
    </div>
    <div
      v-else-if="filteredFieldCount === 0"
      class="settings-premium-empty settings-premium-empty--sky params-panel-empty"
    >
      <Search class="settings-premium-empty__icon" />
      <p class="settings-premium-empty__title">{{ '本组没有匹配项' }}</p>
      <p class="settings-premium-empty__desc">{{ '清除筛选词或调整搜索条件' }}</p>
    </div>

    <template v-else>
      <section v-if="booleanFields.length" class="params-field-section">
        <h4 class="params-field-section__title">{{ '功能开关' }}</h4>
        <div class="params-bool-grid">
          <SystemConfigFieldCell
            v-for="field in booleanFields"
            :key="field.key"
            :field="field"
            :input-id="fieldId(field)"
            :label="fieldLabel(field, section.key)"
            :hint="fieldHint(field)"
            :show-dev-key="showDevKeys"
            :modified="isFieldPending(section.key, field.key)"
            compact
            @update:value="$emit('field-value', field, $event)"
            @update:is-masked="$emit('field-masked', field, $event)"
          />
        </div>
      </section>

      <section v-if="inputFields.length" class="params-field-section">
        <div class="params-field-list">
          <template v-for="entry in inputFieldEntries" :key="entry.key">
            <div v-if="entry.kind === 'header'" class="params-group-label">{{ entry.label }}</div>
            <SystemConfigFieldCell
              v-else
              :field="entry.field"
              :input-id="fieldId(entry.field)"
              :label="fieldLabel(entry.field, section.key)"
              :hint="fieldHint(entry.field)"
              :show-dev-key="showDevKeys"
              :modified="isFieldPending(section.key, entry.field.key)"
              @update:value="$emit('field-value', entry.field, $event)"
              @update:is-masked="$emit('field-masked', entry.field, $event)"
            />
          </template>
        </div>
      </section>
    </template>
  </SettingsCard>
</template>

<script setup>
import { Search, SlidersHorizontal } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import { sectionMeta } from '@/composables/config/system-config-core.internals'
import SystemConfigFieldCell from '@/views/settings/shared/system-config/SystemConfigFieldCell.vue'
import SystemConfigSectionDock from '@/views/settings/shared/system-config/SystemConfigSectionDock.vue'

defineProps({
  section: { type: Object, required: true },
  displayFieldCount: { type: Number, default: 0 },
  filteredFieldCount: { type: Number, default: 0 },
  booleanFields: { type: Array, required: true },
  inputFields: { type: Array, required: true },
  inputFieldEntries: { type: Array, required: true },
  showDevKeys: { type: Boolean, default: false },
  screensaverPreviewActive: { type: Boolean, default: false },
  fieldId: { type: Function, required: true },
  fieldLabel: { type: Function, required: true },
  fieldHint: { type: Function, required: true },
  isFieldPending: { type: Function, required: true },
})

defineEmits([
  'field-value',
  'field-masked',
  'preview-screensaver',
  'close-screensaver-preview',
])
</script>
