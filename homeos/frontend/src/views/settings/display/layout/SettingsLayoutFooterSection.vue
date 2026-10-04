<!--
组件：SettingsLayoutFooterSection.vue
所属模块：frontend / src / views / settings / display / layout
职责：底部信息栏区段。配置首页底栏显示项（账户绑定字段或 HA 实体），支持增删/排序、
      图标与配色、主副字段及单位覆盖，并提供与首页底栏一致的实时预览。
关键依赖：
  - SettingsCard / SettingsCardIntro / SettingsOrchTabs：卡片、头部与可排序标签
  - HosSelect：分类下拉
  - EntityInput：实体 ID 输入
  - FooterIconPicker / FooterColorPicker：图标与配色选择器（本目录子组件）
  - useLayoutStore / useEntitiesStore：读取 footer 配置与实体状态
  - resolveFooterItemValue / resolveFooterItemLabel 等：复用首页底栏取值/取标签逻辑
数据来源：layoutStore.layoutConfig.dashboardFooter + entitiesStore.entities（用于预览）
-->
<template>
  <div class="settings-hub-section">
    <SettingsCard full static>
      <SettingsCardIntro
        :icon="PanelBottom"
        icon-class="lf-icon-warn"
        orb-class="ef-intro-orb"
        eyebrow="底部信息栏"
        :description="'配置首页底部显示的数据卡片：账户绑定、模板实体、图标与配色。'"
      >
        <template #actions>
          <button
            type="button"
            :class="['ef-visibility-btn', footerCfg.enabled && 'ef-visibility-btn--on']"
            @click="$emit('toggle-dashboard-footer')"
          >
            <component :is="footerCfg.enabled ? Eye : EyeOff" class="w-3.5 h-3.5" />
            {{ footerCfg.enabled ? '隐藏底栏' : '显示底栏' }}
          </button>
        </template>
      </SettingsCardIntro>

      <Transition name="ef-fade">
        <div v-if="footerCfg.enabled" class="ef-panel">
          <div class="ef-command">
            <div class="ef-command__info">
              <span class="ef-command__badge">{{ footerCfg.items.length }} 项</span>
              <span v-if="footerCfg.items.length > 1" class="ef-command__hint">
                选中后 ← → 调整顺序
              </span>
            </div>
            <div class="ef-command__actions">
              <HosSelect
                variant="settings"
                trigger-class="ef-select--compact"
                v-model="presetToAdd"
              >
                <option value="">{{ '从预设添加…' }}</option>
                <option v-for="p in presetOptions" :key="p.key" :value="p.key">
                  {{ p.label }}
                </option>
              </HosSelect>
              <button
                type="button"
                class="ef-action ef-action--accent"
                :disabled="!presetToAdd"
                @click="$emit('add-preset')"
              >
                <Plus class="w-3.5 h-3.5" />
                {{ '添加' }}
              </button>
              <button type="button" class="ef-action" @click="$emit('add-custom-entity')">
                <Sparkles class="w-3.5 h-3.5" />
                {{ '模板实体' }}
              </button>
              <button
                type="button"
                class="ef-action ef-action--muted"
                @click="$emit('reset-dashboard-footer')"
              >
                <RotateCcw class="w-3.5 h-3.5" />
                {{ '恢复默认' }}
              </button>
            </div>
          </div>

          <div v-if="footerCfg.items.length" class="ef-item-tabs">
            <SettingsOrchTabs
              :key="footerItemsOrderKey"
              v-model="activeFooterItemId"
              :tabs="footerItemTabs"
              sortable
              @reorder="$emit('footer-items-reorder', $event)"
            />
          </div>

          <div
            v-if="activeFooterItem && activeFooterItemIdx >= 0"
            :key="activeFooterItemId"
            class="ef-editor"
          >
            <div
              :class="[
                'ef-preview',
                `ef-preview--${activeFooterItem.color || 'yellow'}`,
                !activeFooterItem.enabled && 'ef-preview--off',
              ]"
              :style="{ '--ef-accent': previewAccent }"
            >
              <div class="ef-preview__glow" aria-hidden="true" />
              <div class="ef-preview__icon-wrap">
                <span class="ef-preview__icon">{{ activeFooterItem.icon || '⚡' }}</span>
              </div>
              <div class="ef-preview__body">
                <div class="ef-preview__value-row">
                  <span class="ef-preview__value">{{ activeFooterPreviewValue }}</span>
                  <span v-if="activeFooterPreviewUnit" class="ef-preview__unit">{{
                    activeFooterPreviewUnit
                  }}</span>
                </div>
                <div class="ef-preview__meta">
                  <span class="ef-preview__label">{{ activeFooterPreviewLabel }}</span>
                  <span v-if="activeFooterItem.secondaryField" class="ef-preview__secondary">
                    {{ activeFooterSecondaryPreview }}
                  </span>
                </div>
              </div>
              <span class="ef-preview__tag">{{
                activeFooterItem.enabled ? '预览' : '已停用'
              }}</span>
            </div>

            <div class="ef-editor__bar">
              <button
                type="button"
                class="ef-switch"
                :class="{ 'ef-switch--on': activeFooterItem.enabled }"
                role="switch"
                :aria-checked="activeFooterItem.enabled ? 'true' : 'false'"
                @click="activeFooterItem.enabled = !activeFooterItem.enabled"
              >
                <span
                  class="ef-switch__thumb"
                  :class="{ 'ef-switch__thumb--on': activeFooterItem.enabled }"
                />
                <span class="ef-switch__label">{{
                  activeFooterItem.enabled ? '已启用' : '已停用'
                }}</span>
              </button>
              <div class="ef-editor__pickers">
                <FooterIconPicker v-model="activeFooterItem.icon" />
                <FooterColorPicker v-model="activeFooterItem.color" />
              </div>
              <button
                type="button"
                class="ef-remove"
                @click="$emit('remove-footer-item', activeFooterItemIdx)"
              >
                <Trash2 class="w-3.5 h-3.5" />
                {{ '移除' }}
              </button>
            </div>

            <div class="ef-sections">
              <section class="ef-section ef-section--display">
                <header class="ef-section__head">
                  <div class="ef-section__icon">
                    <Type class="w-3.5 h-3.5" />
                  </div>
                  <h4 class="ef-section__title">{{ '显示名称' }}</h4>
                </header>
                <div class="ef-grid ef-grid--2">
                  <div class="ef-field">
                    <label class="settings-form-label">{{ '主字段名称' }}</label>
                    <input
                      v-model="activeFooterItem.label"
                      class="settings-field"
                      :placeholder="activeFooterLabelPlaceholder"
                    />
                    <p v-if="activeFooterLabelPreview" class="ef-hint">
                      {{ `自动生成：${activeFooterLabelPreview}` }}
                    </p>
                  </div>
                  <div class="ef-field">
                    <label class="settings-form-label">{{ '数据来源' }}</label>
                    <HosSelect variant="settings" block v-model="activeFooterItem.kind">
                      <option value="binding">{{ '账户绑定字段' }}</option>
                      <option value="entity">{{ 'HA 实体' }}</option>
                    </HosSelect>
                  </div>
                </div>
              </section>

              <section
                v-if="activeFooterItem.kind === 'binding'"
                class="ef-section ef-section--binding"
              >
                <header class="ef-section__head">
                  <div class="ef-section__icon ef-section__icon--amber">
                    <Database class="w-3.5 h-3.5" />
                  </div>
                  <h4 class="ef-section__title">{{ '账户绑定' }}</h4>
                </header>
                <div class="ef-grid ef-grid--3">
                  <div class="ef-field">
                    <label class="settings-form-label">{{ '账户类别' }}</label>
                    <HosSelect variant="settings" block v-model="activeFooterItem.source">
                      <option v-for="s in sourceOptions" :key="s.value" :value="s.value">
                        {{ s.label }}
                      </option>
                    </HosSelect>
                  </div>
                  <div class="ef-field">
                    <label class="settings-form-label">{{ '数据账户' }}</label>
                    <HosSelect variant="settings" block v-model="activeFooterAccountSelect">
                      <option
                        v-for="opt in activeFooterAccountOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </option>
                    </HosSelect>
                    <p v-if="activeFooterAccountOptions.length <= 1" class="ef-hint">
                      {{ '请先在生活账户中配置该类别账户' }}
                    </p>
                  </div>
                  <div class="ef-field">
                    <label class="settings-form-label">{{ '主字段' }}</label>
                    <HosSelect variant="settings" block v-model="activeFooterItem.primaryField">
                      <option value="">{{ '选择字段' }}</option>
                      <option
                        v-for="f in fieldOptions(activeFooterItem.source)"
                        :key="f.value"
                        :value="f.value"
                      >
                        {{ f.label }}
                      </option>
                    </HosSelect>
                  </div>
                </div>

                <div class="ef-grid ef-grid--2 ef-grid--tight">
                  <div class="ef-field">
                    <label class="settings-form-label">{{ '副字段' }}</label>
                    <HosSelect variant="settings" block v-model="activeFooterItem.secondaryField">
                      <option value="">{{ '无' }}</option>
                      <option
                        v-for="f in fieldOptions(activeFooterItem.source)"
                        :key="'s-' + f.value"
                        :value="f.value"
                      >
                        {{ f.label }}
                      </option>
                    </HosSelect>
                  </div>
                  <div v-if="!activeFooterItem.secondaryField" class="ef-field">
                    <label class="settings-form-label">{{ '单位覆盖' }}</label>
                    <input
                      v-model="activeFooterItem.unit"
                      class="settings-field"
                      :placeholder="'留空用默认单位'"
                    />
                  </div>
                </div>

                <div
                  v-if="activeFooterItem.secondaryField"
                  class="ef-grid ef-grid--2 ef-grid--tight"
                >
                  <div class="ef-field">
                    <label class="settings-form-label">{{ '副字段名称' }}</label>
                    <input
                      v-model="activeFooterItem.secondaryLabel"
                      class="settings-field"
                      :placeholder="activeFooterSecondaryLabelPlaceholder"
                    />
                    <p v-if="activeFooterSecondaryLabelPreview" class="ef-hint">
                      {{ `默认：${activeFooterSecondaryLabelPreview}` }}
                    </p>
                  </div>
                  <div class="ef-field">
                    <label class="settings-form-label">{{ '单位覆盖' }}</label>
                    <input
                      v-model="activeFooterItem.unit"
                      class="settings-field"
                      :placeholder="'留空用默认单位'"
                    />
                  </div>
                </div>

                <div class="ef-options">
                  <label v-if="activeFooterItem.primaryField === 'balance'" class="ef-check">
                    <input v-model="activeFooterItem.showProgress" type="checkbox" />
                    <span>{{ '显示余额进度条' }}</span>
                  </label>
                  <div v-if="activeFooterItem.showProgress" class="ef-inline">
                    <span class="ef-inline__label">{{ '满刻度' }}</span>
                    <input
                      v-model.number="activeFooterItem.progressMax"
                      type="number"
                      min="10"
                      max="9999"
                      class="settings-field ef-inline__input"
                    />
                  </div>
                </div>
              </section>

              <section v-else class="ef-section ef-section--entity">
                <header class="ef-section__head">
                  <div class="ef-section__icon ef-section__icon--sky">
                    <Radio class="w-3.5 h-3.5" />
                  </div>
                  <h4 class="ef-section__title">{{ 'HA 实体' }}</h4>
                </header>
                <div class="ef-grid ef-grid--3">
                  <div class="ef-field ef-field--span2">
                    <label class="settings-form-label">{{ '实体 ID' }}</label>
                    <EntityInput
                      v-model="activeFooterItem.entityId"
                      input-class="settings-field"
                      wrapper-class=""
                    />
                  </div>
                  <div class="ef-field">
                    <label class="settings-form-label">{{ '属性名' }}</label>
                    <input
                      v-model="activeFooterItem.attrName"
                      class="settings-field"
                      :placeholder="'留空读 state'"
                    />
                  </div>
                </div>
                <div class="ef-inline">
                  <span class="ef-inline__label">{{ '单位覆盖' }}</span>
                  <input
                    v-model="activeFooterItem.unit"
                    class="settings-field ef-inline__input ef-inline__input--unit"
                  />
                </div>
              </section>
            </div>
          </div>

          <div
            v-else-if="!footerCfg.items.length"
            class="settings-premium-empty settings-premium-empty--amber"
          >
            <PanelBottom class="settings-premium-empty__icon" />
            <p class="settings-premium-empty__title">{{ '未配置显示项' }}</p>
            <p class="settings-premium-empty__desc">
              {{ '可从预设快速添加，或绑定自定义 HA 实体' }}
            </p>
            <div class="settings-premium-empty__actions">
              <button
                type="button"
                class="settings-premium-empty__btn settings-premium-empty__btn--accent"
                @click="$emit('add-custom-entity')"
              >
                {{ '模板实体' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </SettingsCard>
  </div>
</template>

<script setup>
import HosSelect from '@/components/common/base/HosSelect.vue'
import { computed } from 'vue'
import {
  PanelBottom,
  Eye,
  EyeOff,
  Plus,
  Sparkles,
  RotateCcw,
  Trash2,
  Type,
  Database,
  Radio,
} from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/page-shell/SettingsCardIntro.vue'
import SettingsOrchTabs from '@/views/settings/shared/layout/SettingsOrchTabs.vue'
import EntityInput from '@/components/common/EntityInput.vue'
import FooterIconPicker from '@/components/common/FooterIconPicker.vue'
import FooterColorPicker from './FooterColorPicker.vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useEntitiesStore } from '@/stores/entities.store'
import { resolveFooterItemValue } from '@/composables/ui/useDashboardFooter'
import {
  normalizeDashboardFooter,
  resolveFooterItemLabel,
  resolveFooterSecondaryLabel,
  resolveFooterAccountSelectOptions,
  footerAccountIndexToSelectValue,
  footerAccountSelectValueToIndex,
  DASHBOARD_FOOTER_COLOR_ACCENT,
} from '@/constants/dashboard-footer'

const layoutStore = useLayoutStore()
const entitiesStore = useEntitiesStore()

// 预览单位格式化：¥ 显示为「元」，其余原样返回
function formatPreviewUnit(unit) {
  if (unit === '¥') return '元'
  return unit
}
// 缺失 dashboardFooter 时回退为默认结构
if (!layoutStore.layoutConfig.dashboardFooter) {
  layoutStore.layoutConfig.dashboardFooter = normalizeDashboardFooter(null)
}
const footerCfg = computed(() => layoutStore.layoutConfig.dashboardFooter)

// 双向模型：待添加的预设 key、当前选中的底栏项 id
const presetToAdd = defineModel('presetToAdd', { type: String, default: '' })
const activeFooterItemId = defineModel('activeFooterItemId', { type: String, default: '' })

// 入参：预设/账户类别选项、底栏项标签、排序 key、字段选项取数函数
const props = defineProps({
  presetOptions: { type: Array, default: () => [] },
  sourceOptions: { type: Array, default: () => [] },
  footerItemTabs: { type: Array, default: () => [] },
  footerItemsOrderKey: { type: String, default: '' },
  fieldOptions: { type: Function, required: true },
})

// 当前选中的底栏项对象及其在数组中的索引
const activeFooterItem = computed(
  () => footerCfg.value.items?.find((it) => it.id === activeFooterItemId.value) || null,
)
const activeFooterItemIdx = computed(
  () => footerCfg.value.items?.findIndex((it) => it.id === activeFooterItemId.value) ?? -1,
)

// 当前项可用的账户选项（仅绑定类型且 source 已选时返回）
const activeFooterAccountOptions = computed(() => {
  const item = activeFooterItem.value
  if (!item || item.kind !== 'binding') return []
  return resolveFooterAccountSelectOptions(item.source, layoutStore.layoutConfig.statsSensors)
})

// 当前项账户选择值：内部存储 accountIndex，对外暴露为下拉字符串
const activeFooterAccountSelect = computed({
  get() {
    return footerAccountIndexToSelectValue(activeFooterItem.value?.accountIndex)
  },
  set(value) {
    const item = activeFooterItem.value
    if (!item) return
    const next = footerAccountSelectValueToIndex(String(value ?? ''))
    if (next === undefined) {
      delete item.accountIndex
    } else {
      item.accountIndex = next
    }
  },
})

// 主字段名称自动预览（仅当用户未自定义 label 时生成）
const activeFooterLabelPreview = computed(() => {
  const item = activeFooterItem.value
  if (!item || item.label?.trim()) return ''
  return resolveFooterItemLabel(
    item,
    activeFooterItemIdx.value,
    props.fieldOptions,
    props.sourceOptions,
    layoutStore.layoutConfig.statsSensors,
  )
})
// 主字段名称输入框 placeholder（基于当前项自动派生）
const activeFooterLabelPlaceholder = computed(() => {
  const item = activeFooterItem.value
  if (!item) return '自定义主字段名，如：日用量'
  const auto = resolveFooterItemLabel(
    { ...item, label: '' },
    activeFooterItemIdx.value,
    props.fieldOptions,
    props.sourceOptions,
    layoutStore.layoutConfig.statsSensors,
  )
  return auto || '自定义主字段名，如：日用量'
})
// 副字段名称自动预览（仅当存在副字段且未自定义时生成）
const activeFooterSecondaryLabelPreview = computed(() => {
  const item = activeFooterItem.value
  if (!item?.secondaryField || item.secondaryLabel?.trim()) return ''
  return resolveFooterSecondaryLabel({ ...item, secondaryLabel: '' }, props.fieldOptions)
})
// 副字段名称输入框 placeholder
const activeFooterSecondaryLabelPlaceholder = computed(() => {
  const item = activeFooterItem.value
  if (!item?.secondaryField) return '自定义副字段名，如：日费用'
  const auto = resolveFooterSecondaryLabel({ ...item, secondaryLabel: '' }, props.fieldOptions)
  return auto || '自定义副字段名，如：日费用'
})

// 预览卡片标题：优先自定义 → 自动派生 → placeholder
const activeFooterPreviewLabel = computed(() => {
  const item = activeFooterItem.value
  if (!item) return '卡片标题'
  return item.label?.trim() || activeFooterLabelPreview.value || activeFooterLabelPlaceholder.value
})

/** 与首页底栏相同逻辑：按当前项配置的字段/实体读取实时值（停用项也展示预览） */
const activeFooterPreviewData = computed(() => {
  const item = activeFooterItem.value
  if (!item) return null
  return resolveFooterItemValue(
    { ...item, enabled: true },
    layoutStore.layoutConfig.statsSensors,
    entitiesStore.entities,
    () => '',
  )
})

// 预览主值（无数据时显示 --）
const activeFooterPreviewValue = computed(() => activeFooterPreviewData.value?.value ?? '--')

// 预览单位（¥ 转为「元」）
const activeFooterPreviewUnit = computed(() => {
  const unit = activeFooterPreviewData.value?.unit
  return unit ? formatPreviewUnit(unit) : ''
})

// 预览副字段：名称 + 值（强制 ¥ 前缀，与首页底栏一致）
const activeFooterSecondaryPreview = computed(() => {
  const item = activeFooterItem.value
  if (!item?.secondaryField) return ''
  const data = activeFooterPreviewData.value
  const name =
    data?.secondaryName ||
    item.secondaryLabel?.trim() ||
    activeFooterSecondaryLabelPreview.value ||
    '副字段'
  const value = data?.secondary ?? '--'
  return `${name} ¥${value}`
})

// 预览强调色：按当前项 color 取色板，缺失回退 yellow
const previewAccent = computed(() => {
  const color = activeFooterItem.value?.color || 'yellow'
  return DASHBOARD_FOOTER_COLOR_ACCENT[color] || DASHBOARD_FOOTER_COLOR_ACCENT.yellow
})

// 对外事件：开关底栏、重置默认、添加预设、添加模板实体、底栏项排序、移除底栏项
defineEmits([
  'toggle-dashboard-footer',
  'reset-dashboard-footer',
  'add-preset',
  'add-custom-entity',
  'footer-items-reorder',
  'remove-footer-item',
])
</script>
<style src="../styles/layout-panels.css"></style>
