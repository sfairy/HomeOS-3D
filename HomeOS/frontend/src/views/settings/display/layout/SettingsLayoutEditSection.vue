<!--
组件：SettingsLayoutEditSection.vue
所属模块：frontend / src / views / settings / display / layout
职责：布局编辑区段。展示编辑模式状态（LIVE/DEV），提供开启/退出编辑按钮，
      并以流程概览展示编辑流程（开启编辑 → 放置热区 → 保存布局）。
关键依赖：
  - SettingsCard / SettingsFlowBand / SettingsFlowStat：卡片与流程概览
数据来源：父级透传的 isEditMode
-->
<template>
  <div class="settings-hub-section">
    <SettingsCard full static>
      <SettingsFlowBand
        :steps="layoutEditFlowSteps"
        class="layout-edit-flow-band"
        band-class="layout-edit-flow-band__shell"
        collapsible
        default-collapsed
        toggle-label="编辑流程"
        :collapsed-summary="layoutEditFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'编辑层'"
            :value="isEditMode ? '开启' : '关闭'"
            :tone="isEditMode ? 'emerald' : 'secondary'"
            :val-tone="isEditMode ? 'emerald' : 'secondary'"
          />
        </template>
      </SettingsFlowBand>

      <div :class="['layout-edit-hero', isEditMode && 'layout-edit-hero--live']">
        <div class="layout-edit-hero__mesh" aria-hidden="true" />
        <div class="layout-edit-hero__glow" aria-hidden="true" />
        <div class="layout-edit-hero__body">
          <div class="layout-edit-hero__info">
            <div
              :class="['layout-edit-hero__badge', isEditMode && 'layout-edit-hero__badge--live']"
            >
              <span class="layout-edit-hero__badge-dot" />
              {{ isEditMode ? 'LIVE' : 'DEV' }}
            </div>
            <div class="min-w-0">
              <p class="layout-edit-hero__title">
                {{ isEditMode ? '编辑模式已激活' : '一键进入户型热区编辑' }}
              </p>
              <p class="layout-edit-hero__hint">
                {{
                  isEditMode
                    ? '主页顶部指挥台可保存或退出编辑'
                    : '开启后跳转主页，拖拽实体并微调热区坐标'
                }}
              </p>
            </div>
          </div>
          <button
            type="button"
            :class="['layout-edit-hero__cta', isEditMode && 'layout-edit-hero__cta--live']"
            @click.stop="$emit('toggle-edit-mode')"
          >
            <component :is="isEditMode ? Square : PenLine" class="w-4 h-4" />
            {{ isEditMode ? '退出编辑' : '开启编辑' }}
          </button>
        </div>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { PenLine, Square, ToggleRight, MousePointerClick, CloudUpload } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'

// 入参：是否处于编辑模式
const props = defineProps({
  isEditMode: { type: Boolean, default: false },
})

// 对外事件：切换编辑模式
defineEmits(['toggle-edit-mode'])

// 编辑流程步骤：开启编辑 → 放置热区 → 保存布局
const layoutEditFlowSteps = computed(() => [
  {
    label: '开启编辑',
    meta: props.isEditMode ? '已激活' : '待开启',
    icon: ToggleRight,
    tone: 'in',
  },
  {
    label: '放置热区',
    meta: '拖入实体 / 微调',
    icon: MousePointerClick,
    tone: 'sky',
  },
  {
    label: '保存布局',
    meta: '指挥台写入',
    icon: CloudUpload,
    tone: 'out',
  },
])

// 编辑流程折叠态摘要文案
const layoutEditFlowSummary = computed(() =>
  props.isEditMode ? '编辑层开启 · 主页户型图' : '编辑层关闭 · 点击下方开启',
)
</script>

<style scoped src="./styles/settings-layout-edit-section.css"></style>
