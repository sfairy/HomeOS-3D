<!--
  小部件配置面板中的快捷操作（顶部快捷按钮）子面板，提供 1~4 个按钮的启用/
  禁用切换（已激活按钮按点击顺序排列显示序号），以及灯光/温控/电池/离线四个统计源
  汇总传感器的 EntityInput 绑定。
  注意事项：至少须保留 1 个按钮激活（满员时未选中按钮自动禁用）；保存仍须经过「保存布局」。
-->
<script setup>
import { Zap } from '@lucide/vue'
import { inject } from 'vue'
import EntityInput from '@/components/common/entity-input/EntityInput.vue'
import WidgetConfigShell from './WidgetConfigShell.vue'
import WidgetConfigFooter from './WidgetConfigFooter.vue'
import { WIDGET_PANEL_CONFIG_KEY } from '@/features/settings/display/composables/layout-panel-widgets.internals'

defineProps({
  quickButtonOptions: { type: Array, required: true },
  maxQuickButtons: { type: Number, required: true },
  quickSelectedCount: { type: Number, required: true },
  quickButtonsFull: { type: Boolean, default: false },
  isQuickButtonOn: { type: Function, required: true },
  quickButtonOrder: { type: Function, required: true },
})

defineEmits(['save', 'toggle-quick-button'])

const widgetConfig = inject(WIDGET_PANEL_CONFIG_KEY)
</script>

<template>
  <WidgetConfigShell
    :icon="Zap"
    tone="amber"
    eyebrow="快捷操作"
    title="统计源与显示按钮"
    description="配置顶栏快捷图标与 HA 汇总传感器；至少保留 1 个按钮，最多 4 个。"
  >
    <div class="widget-config-shell__section">
      <div class="flex items-center justify-between mb-1">
        <p class="widget-config-shell__section-label">{{ '显示按钮（固定一行）' }}</p>
        <span class="quick-btn-counter">{{ quickSelectedCount }} / {{ maxQuickButtons }}</span>
      </div>
      <div class="quick-btn-toggle-grid">
        <button
          v-for="opt in quickButtonOptions"
          :key="opt.id"
          type="button"
          :disabled="!isQuickButtonOn(opt.id) && quickButtonsFull"
          :class="[
            'quick-btn-toggle',
            {
              'quick-btn-toggle--on': isQuickButtonOn(opt.id),
              'quick-btn-toggle--disabled': !isQuickButtonOn(opt.id) && quickButtonsFull,
            },
          ]"
          @click="$emit('toggle-quick-button', opt.id)"
        >
          <span v-if="isQuickButtonOn(opt.id)" class="quick-btn-order">{{
            quickButtonOrder(opt.id)
          }}</span>
          <component v-else :is="opt.icon" class="w-4 h-4" />
          <span>{{ opt.label }}</span>
        </button>
      </div>
    </div>

    <div class="settings-widget-config__grid">
      <div>
        <label class="settings-form-label mb-1">{{ '灯光' }}</label>
        <EntityInput v-model="widgetConfig.lights" placeholder="sensor.lights" domain-filter="sensor" />
      </div>
      <div>
        <label class="settings-form-label mb-1">{{ '温控' }}</label>
        <EntityInput v-model="widgetConfig.climates" placeholder="sensor.climates" domain-filter="sensor" />
      </div>
      <div>
        <label class="settings-form-label mb-1">{{ '电池' }}</label>
        <EntityInput v-model="widgetConfig.battery" placeholder="sensor.battery" domain-filter="sensor" />
      </div>
      <div>
        <label class="settings-form-label mb-1">{{ '离线' }}</label>
        <EntityInput v-model="widgetConfig.offline" placeholder="sensor.offline" domain-filter="sensor" />
      </div>
    </div>

    <div class="quick-config-note">
      <Zap class="quick-config-note__icon" />
      <p>
        {{ '填写 HA template.yaml 中的汇总传感器 ID。绑定后弹窗从传感器属性提取实体列表；未绑定时按设备域全局统计。' }}
      </p>
    </div>

    <template #footer>
      <WidgetConfigFooter @save="$emit('save')" />
    </template>
  </WidgetConfigShell>
</template>
<style src="../styles/layout-panels.css"></style>
