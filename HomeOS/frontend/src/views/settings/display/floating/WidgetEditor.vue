<!--
组件：WidgetEditor.vue
所属模块：frontend / src / views / settings / display / floating
职责：浮动组件编辑器主体。按组件类型动态展示分区（位置与样式 / 数据绑定 / HTML 代码 /
      标签页视图 / 安防区域），并提供保存与取消底部操作。
关键依赖：
  - WidgetConfigStudioNav / WidgetConfigFooter：导航与底部操作
  - EditorLayoutSection / EditorDataSection / EditorHubTabsSection：各分区子组件
  - SecurityZoneEditorList：安防区域编辑
  - useDraftObjectField：草稿字段双向绑定
  - isEntityFloatType / canonicalizeWidgetType / hasConfigurableTabs：类型判定
数据来源：父级透传的 fw / afhConfig / afhHubTabs（双向）+ 各类回调
-->
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/WidgetEditor 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed } from 'vue'
import {
  Crosshair,
  Zap,
  Code,
  Settings2,
  Shield,
  Info,
} from '@lucide/vue'
import { hasConfigurableTabs } from '@/utils/registry/hub-tabs-options'
import { canonicalizeWidgetType } from '@/utils/registry/widget-catalog'
import { isEntityFloatType } from '@/composables/settings/display/layout-floating.internals'
import { useDraftObjectField } from '@/composables/settings/hub-ui.internals'
import WidgetConfigStudioNav from '@/views/settings/display/widgets/WidgetConfigStudioNav.vue'
import WidgetConfigFooter from '@/views/settings/display/widgets/WidgetConfigFooter.vue'
import SecurityZoneEditorList from '@/views/security/ZoneEditorList.vue'
import FloatingEditorLayoutSection from './EditorLayoutSection.vue'
import FloatingEditorDataSection from './EditorDataSection.vue'
import FloatingEditorHubTabsSection from './EditorHubTabsSection.vue'
import './styles/floating.css'

// 双向绑定：当前展开的分区 id
const openSection = defineModel('openSection', { type: [String, null], default: 'layout' })
// 双向绑定：AFH 编辑器草稿配置
const afhConfig = defineModel('afhConfig', { type: Object, required: true })
// 双向绑定：Hub Tabs 配置
const afhHubTabs = defineModel('afhHubTabs', { type: Object, required: true })

// 入参：浮动组件对象、是否脏、安防区域/安防场景/保存/取消回调
const props = defineProps({
  fw: { type: Object, required: true },
  isAfhEditorDirty: { type: Boolean, required: true },
  addSecurityZone: { type: Function, required: true },
  goSecurityModes: { type: Function, required: true },
  saveAfhConfig: { type: Function, required: true },
  cancelAfhEditor: { type: Function, required: true },
})

const { field } = useDraftObjectField(() => afhConfig.value)
const rawHtmlModel = field('rawHtml')
const showZonesModel = field('showZones')

// 可用分区列表：按组件类型动态追加（位置与样式 / 数据绑定 / HTML 代码 / 标签页视图 / 安防区域）
const sections = computed(() => {
  const list = [{ id: 'layout', label: '位置与样式', icon: Crosshair, tone: 'mint' }]
  if (isEntityFloatType(props.fw.type)) {
    list.push({ id: 'data', label: '数据绑定', icon: Zap, tone: 'sky' })
  }
  if (canonicalizeWidgetType(props.fw.type) === 'customHtml') {
    list.push({ id: 'html', label: 'HTML 代码', icon: Code, tone: 'fuchsia' })
  }
  if (hasConfigurableTabs(props.fw.type)) {
    list.push({ id: 'tabs', label: '标签页视图', icon: Settings2, tone: 'amber' })
  }
  if (props.fw.type === 'securityPanel') {
    list.push({ id: 'security', label: '安防区域', icon: Shield, tone: 'rose' })
  }
  return list
})

// 当前激活分区：优先取 openSection，否则取首个
const activeSection = computed(() => {
  const ids = sections.value.map((s) => s.id)
  if (openSection.value && ids.includes(openSection.value)) return openSection.value
  return ids[0] || 'layout'
})

// 当前激活分区的色调
const activeTone = computed(() => {
  return sections.value.find((s) => s.id === activeSection.value)?.tone ?? 'mint'
})
</script>

<template>
  <div class="widget-config-studio">
    <WidgetConfigStudioNav
      :model-value="activeSection"
      :sections="sections"
      @update:model-value="openSection = $event"
    />

    <div
      :class="['widget-config-studio__surface', `widget-config-studio__surface--${activeTone}`]"
      role="tabpanel"
    >
      <Transition name="afh-section" mode="out-in">
        <FloatingEditorLayoutSection
          v-if="activeSection === 'layout'"
          key="layout"
          :fw="fw"
          v-model:afh-config="afhConfig"
        />
        <FloatingEditorDataSection
          v-else-if="activeSection === 'data'"
          key="data"
          :fw="fw"
          v-model:afh-config="afhConfig"
        />
        <div v-else-if="activeSection === 'html'" key="html" class="afh-section afh-section--html">
          <header class="afh-section__head">
            <div class="afh-section__lead">
              <span class="afh-section__badge afh-section__badge--fuchsia"><Code /></span>
              <div>
                <h4 class="afh-section__title">{{ 'HTML 代码' }}</h4>
                <p class="afh-section__desc">{{ '注入自定义 HTML 片段，支持内联样式与 Tailwind 类名' }}</p>
              </div>
            </div>
          </header>

          <label class="afh-form__field">
            <span class="afh-form__label">{{ '源码' }}</span>
            <textarea
              v-model="rawHtmlModel"
              rows="10"
              class="afh-input afh-input--mono afh-input--area"
              :placeholder="'<div class=&quot;p-4 rounded-xl bg-white/10&quot;>...</div>'"
            />
          </label>

          <div class="widget-config-shell__note afh-html-note">
            <Info class="widget-config-shell__note-icon" aria-hidden="true" />
            <p class="widget-config-shell__note-text">
              {{ '面板 customHtml 微件可使用全屏编辑器实时预览；浮动 HTML 组件在此编辑后保存并同步到平面图布局。' }}
            </p>
          </div>
        </div>
        <FloatingEditorHubTabsSection
          v-else-if="activeSection === 'tabs'"
          key="tabs"
          :fw="fw"
          v-model:afh-config="afhConfig"
          v-model:afh-hub-tabs="afhHubTabs"
        />
        <div
          v-else-if="activeSection === 'security'"
          key="security"
          class="afh-section afh-section--security"
        >
          <header class="afh-section__head">
            <div class="afh-section__lead">
              <span class="afh-section__badge afh-section__badge--rose"><Shield /></span>
              <div>
                <h4 class="afh-section__title">{{ '安防区域' }}</h4>
                <p class="afh-section__desc">{{ '管理布防区域列表与展示方式' }}</p>
              </div>
            </div>
            <span v-if="afhConfig.zones?.length" class="afh-status-chip afh-status-chip--rose">
              {{ `${afhConfig.zones.length} 区` }}
            </span>
          </header>

          <div class="afh-form__field">
            <span class="afh-form__label">{{ '区域列表展示' }}</span>
            <div class="afh-toggle">
              <button
                type="button"
                :class="['afh-toggle__opt', showZonesModel !== false && 'afh-toggle__opt--active']"
                @click="showZonesModel = true"
              >
                {{ '显示' }}
              </button>
              <button
                type="button"
                :class="['afh-toggle__opt', showZonesModel === false && 'afh-toggle__opt--active']"
                @click="showZonesModel = false"
              >
                {{ '隐藏' }}
              </button>
            </div>
            <p class="afh-form__hint">
              {{ '仅控制布防 Tab 区域明细是否展示；布防、撤防与区域配置同步不受影响。' }}
            </p>
          </div>

          <SecurityZoneEditorList v-model="afhConfig.zones" variant="widget" show-hint show-toolbar />

          <p class="afh-form__hint afh-form__hint--inline">
            <span>{{ '保存浮动组件时将同步安防区域到后端，并镜像到所有楼层的全屋安防组件；场景联动在' }}</span>
            <button type="button" class="afh-link-btn" @click="goSecurityModes">{{ '安防场景' }}</button>
            <span>{{ '配置。清空全部区域不会覆盖后端已有配置。' }}</span>
          </p>
        </div>
      </Transition>
    </div>

    <WidgetConfigFooter
      :dirty="isAfhEditorDirty"
      layout-hint="应用当前分区配置到编辑态；需点击页头「保存布局」才会持久化到平面图。"
      @save="saveAfhConfig"
    >
      <button
        v-if="isAfhEditorDirty"
        type="button"
        class="widget-config-footer__ghost"
        @click="cancelAfhEditor"
      >
        {{ '取消' }}
      </button>
    </WidgetConfigFooter>
  </div>
</template>
