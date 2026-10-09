<!--
组件：WidgetRow.vue
所属模块：frontend / src / views / settings / display / floating
职责：浮动组件列表行。展示组件预览（点位、图标、标题、类型徽章、坐标）、显隐/配置/删除按钮，
      并在编辑态展开 FloatingWidgetEditor。
关键依赖：
  - FloatingWidgetEditor：编辑器主体
  - getAfhTypeTone / getFloatingCategoryLabel / clampPct / formatPct：类型色调与百分比工具
数据来源：父级透传的 fw / afhEditId / isAfhEditorDirty / 各类回调函数
-->
<script setup>
/**
 * 职责：渲染 views/WidgetRow 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed } from 'vue'
import { Settings as SettingsIcon, Trash2, Eye, EyeOff } from '@lucide/vue'
import { clampPct, formatPct, getAfhTypeTone, getFloatingCategoryLabel } from '@/features/settings/composables/display/layout-floating.internals'
import FloatingWidgetEditor from './WidgetEditor.vue'
import './styles/floating.css'

// 双向绑定：当前展开的分区 id（透传给编辑器）
const openSection = defineModel('openSection', { type: [String, null], default: 'layout' })
// 双向绑定：AFH 编辑器草稿配置
const afhConfig = defineModel('afhConfig', { type: Object, required: true })
// 双向绑定：Hub Tabs 配置
const afhHubTabs = defineModel('afhHubTabs', { type: Object, required: true })

// 入参：浮动组件对象、编辑 id、是否脏、图标/类型校验/切换/显隐/移除/安防等回调
const props = defineProps({
  fw: { type: Object, required: true },
  afhEditId: { type: [String, null], default: null },
  isAfhEditorDirty: { type: Boolean, required: true },
  getAfhIcon: { type: Function, required: true },
  isValidFloatingType: { type: Function, required: true },
  toggleAfhEditor: { type: Function, required: true },
  toggleFloatingVisible: { type: Function, required: true },
  removeFloatingWidgetById: { type: Function, required: true },
  addSecurityZone: { type: Function, required: true },
  goSecurityModes: { type: Function, required: true },
  saveAfhConfig: { type: Function, required: true },
  cancelAfhEditor: { type: Function, required: true },
})

// 当前组件类型色调
const tone = computed(() => getAfhTypeTone(props.fw.type))
// 是否处于编辑态（当前编辑 id 等于组件 id）
const isEditing = computed(() => props.afhEditId === props.fw.id)
</script>

<template>
  <article
    :class="[
      'afh-card',
      `afh-card--tone-${tone}`,
      isEditing && 'afh-card--editing',
    ]"
  >
    <header class="afh-card__head">
      <div class="afh-card__identity">
        <div class="afh-card__preview" aria-hidden="true">
          <span
            class="afh-card__preview-dot"
            :style="{ left: `${clampPct(fw.xPct)}%`, top: `${clampPct(fw.yPct)}%` }"
          />
        </div>
        <div :class="['afh-card__icon-wrap', `afh-card__icon-wrap--${tone}`]">
          <component :is="getAfhIcon(fw.type)" class="afh-card__icon" />
        </div>
        <div class="afh-card__copy">
          <div class="afh-card__title-row">
            <h3 class="afh-card__title">{{ fw.config?.title || '未命名组件' }}</h3>
            <span :class="['afh-type-chip', `afh-type-chip--${tone}`]">{{
              getFloatingCategoryLabel(fw.type)
            }}</span>
            <span v-if="!isValidFloatingType(fw.type)" class="afh-type-chip afh-type-chip--warn">{{
              '已废弃'
            }}</span>
            <span v-if="fw.visible === false" class="afh-type-chip afh-type-chip--warn">{{
              '已隐藏'
            }}</span>
            <span
              v-if="isAfhEditorDirty && isEditing"
              class="afh-type-chip afh-type-chip--warn"
            >{{ '未保存' }}</span>
            <span v-if="!isEditing" class="afh-card__coord">
              X {{ formatPct(fw.xPct) }} · Y {{ formatPct(fw.yPct) }}
            </span>
          </div>
        </div>
      </div>

      <div class="afh-card__actions widget-panel-row__actions">
        <button
          type="button"
          :class="[
            'afh-icon-btn',
            `afh-icon-btn--${tone}`,
            isEditing && 'afh-icon-btn--active',
          ]"
          @click="toggleAfhEditor(fw.id)"
        >
          <SettingsIcon class="w-3.5 h-3.5" />
          <span>{{ isEditing ? '收起' : '配置' }}</span>
        </button>

        <div class="widget-panel-row__group">
          <button
            type="button"
            class="afh-icon-btn"
            :class="fw.visible === false && 'afh-icon-btn--muted'"
            :aria-label="fw.visible === false ? '显示组件' : '隐藏组件'"
            @click="toggleFloatingVisible(fw)"
          >
            <Eye v-if="fw.visible !== false" class="w-4 h-4" />
            <EyeOff v-else class="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          class="afh-icon-btn afh-icon-btn--danger"
          aria-label="删除浮动组件"
          @click="removeFloatingWidgetById(fw.id)"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </header>

    <FloatingWidgetEditor
      v-if="isEditing"
      v-model:open-section="openSection"
      v-model:afh-config="afhConfig"
      v-model:afh-hub-tabs="afhHubTabs"
      :fw="fw"
      :is-afh-editor-dirty="isAfhEditorDirty"
      :add-security-zone="addSecurityZone"
      :go-security-modes="goSecurityModes"
      :save-afh-config="saveAfhConfig"
      :cancel-afh-editor="cancelAfhEditor"
    />
  </article>
</template>
