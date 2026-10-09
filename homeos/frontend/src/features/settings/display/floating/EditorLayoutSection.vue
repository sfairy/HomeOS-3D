<!--
组件：EditorLayoutSection.vue
所属模块：frontend / src / views / settings / display / floating
职责：浮动组件编辑器 - 布局区段。配置组件在户型图上的锚点位置（X/Y 百分比）、
      尺寸（宽高，支持步进与方向键微调）与主题色。
关键依赖：
  - SettingsRangeField：百分比滑块
  - useDraftObjectField：草稿字段双向绑定（afhConfig 与 fw 两个对象）
  - AFH_THEMES / clampPct / formatPct：主题列表与百分比工具
数据来源：父级透传的 afhConfig（双向，含 width/height/theme）/ fw（含 xPct/yPct）
-->
<script setup>
/**
 * 职责：渲染 views/EditorLayoutSection 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { ChevronUp, ChevronDown } from '@lucide/vue'
import SettingsRangeField from '@/features/settings/shared/layout/SettingsRangeField.vue'
import { AFH_THEMES, clampPct, formatPct } from '@/features/settings/composables/display/layout-floating.internals'
import { useDraftObjectField } from '@/features/settings/composables/hub-ui.internals'
import './styles/floating.css'

// 尺寸步进值（px）
const SIZE_STEP_PX = 5

const props = defineProps({
  fw: { type: Object, required: true },
})

// 双向绑定：AFH 编辑器草稿配置（含 width / height / theme）
const afhConfig = defineModel('afhConfig', { type: Object, required: true })

const { field } = useDraftObjectField(() => afhConfig.value)
const { field: fwField } = useDraftObjectField(() => props.fw)

const widthModel = field('width')
const heightModel = field('height')
const themeModel = field('theme')
const xPctModel = fwField('xPct')
const yPctModel = fwField('yPct')

// 解析尺寸字符串为像素数值（如 "260px" → 260）
function parseSizePx(raw) {
  const match = String(raw ?? '')
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)/)
  return match ? Number(match[1]) : null
}

// 步进调整尺寸：按 direction 加减 SIZE_STEP_PX，结果非负
function stepSize(key, direction) {
  const model = key === 'width' ? widthModel : heightModel
  const current = parseSizePx(model.value)
  const next = Math.max(0, (current ?? 0) + SIZE_STEP_PX * direction)
  model.value = `${Math.round(next)}px`
}

// 卡片类组件类型集合（用于主题默认值判定）
const CARD_TYPES = new Set(['entity', 'temp', 'humidity', 'battery', 'power', 'aqi'])

// 判断某主题是否激活：卡片类默认 auto，非卡片类默认 neutral，否则按当前值
function isThemeActive(id) {
  const current = themeModel.value || 'glass'
  const isCard = CARD_TYPES.has(props.fw.type)
  if (isCard && (current === 'glass' || current === 'auto')) return id === 'auto'
  if (!isCard && (current === 'glass' || current === 'neutral')) return id === 'neutral'
  return current === id
}

// 尺寸输入框键盘事件：方向键上下微调
function onSizeKeydown(e, key) {
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    stepSize(key, 1)
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    stepSize(key, -1)
  }
}
</script>

<template>
  <div class="afh-section afh-section--layout">
    <div class="afh-layout-top">
      <p class="afh-layout-top__hint">{{ '拖动预览点或在滑块上微调组件在平面图上的锚点' }}</p>
      <span class="afh-coord-chip afh-coord-chip--mint">
        X {{ formatPct(fw.xPct) }} · Y {{ formatPct(fw.yPct) }}
      </span>
    </div>

    <div class="afh-layout-blocks">
      <section class="afh-layout-block">
        <h5 class="afh-layout-block__title">{{ '锚点位置' }}</h5>
        <div class="afh-pos-card">
          <div class="afh-pos-card__preview" aria-hidden="true">
            <div class="afh-pos-card__grid">
              <span class="afh-pos-card__corner afh-pos-card__corner--tl" />
              <span class="afh-pos-card__corner afh-pos-card__corner--tr" />
              <span class="afh-pos-card__corner afh-pos-card__corner--bl" />
              <span class="afh-pos-card__corner afh-pos-card__corner--br" />
              <span class="afh-pos-card__cross-h" :style="{ top: `${clampPct(fw.yPct)}%` }" />
              <span class="afh-pos-card__cross-v" :style="{ left: `${clampPct(fw.xPct)}%` }" />
              <span
                class="afh-pos-card__dot"
                :style="{ left: `${clampPct(fw.xPct)}%`, top: `${clampPct(fw.yPct)}%` }"
              />
            </div>
          </div>

          <div class="afh-pos-card__sliders">
            <SettingsRangeField
              v-model="xPctModel"
              label="水平位置 X"
              :min="0"
              :max="100"
              :step="0.1"
              unit="%"
              variant="plain"
              value-accent="green"
            />
            <SettingsRangeField
              v-model="yPctModel"
              label="垂直位置 Y"
              :min="0"
              :max="100"
              :step="0.1"
              unit="%"
              variant="plain"
              value-accent="purple"
            />
          </div>
        </div>
      </section>

      <section class="afh-layout-block">
        <h5 class="afh-layout-block__title">{{ '尺寸与主题' }}</h5>
        <p class="afh-form__hint">{{ '语义色：电金 / 气橙 / 水青 / 讯紫，其它按设备域；选色板可锁定' }}</p>
        <div class="afh-layout-size-row">
          <label class="afh-form__field">
            <span class="afh-form__label">{{ '宽度' }}</span>
            <div class="settings-range-field__stepper afh-size-stepper">
              <button
                type="button"
                class="settings-range-field__spin-btn settings-range-field__spin-btn--dec"
                :aria-label="'宽度 减少'"
                @click="stepSize('width', -1)"
              >
                <ChevronDown class="settings-range-field__spin-icon" aria-hidden="true" />
              </button>
              <input
                v-model="widthModel"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                spellcheck="false"
                class="settings-range-field__input afh-size-stepper__input"
                :placeholder="'260px'"
                :aria-label="'宽度'"
                @keydown="onSizeKeydown($event, 'width')"
              />
              <button
                type="button"
                class="settings-range-field__spin-btn settings-range-field__spin-btn--inc"
                :aria-label="'宽度 增加'"
                @click="stepSize('width', 1)"
              >
                <ChevronUp class="settings-range-field__spin-icon" aria-hidden="true" />
              </button>
            </div>
          </label>
          <label class="afh-form__field">
            <span class="afh-form__label">{{ '高度' }}</span>
            <div class="settings-range-field__stepper afh-size-stepper">
              <button
                type="button"
                class="settings-range-field__spin-btn settings-range-field__spin-btn--dec"
                :aria-label="'高度 减少'"
                @click="stepSize('height', -1)"
              >
                <ChevronDown class="settings-range-field__spin-icon" aria-hidden="true" />
              </button>
              <input
                v-model="heightModel"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                spellcheck="false"
                class="settings-range-field__input afh-size-stepper__input"
                :placeholder="'auto'"
                :aria-label="'高度'"
                @keydown="onSizeKeydown($event, 'height')"
              />
              <button
                type="button"
                class="settings-range-field__spin-btn settings-range-field__spin-btn--inc"
                :aria-label="'高度 增加'"
                @click="stepSize('height', 1)"
              >
                <ChevronUp class="settings-range-field__spin-icon" aria-hidden="true" />
              </button>
            </div>
          </label>
        </div>

        <div class="afh-theme-grid">
          <button
            v-for="theme in AFH_THEMES"
            :key="theme.id"
            type="button"
            :class="['afh-theme-chip', isThemeActive(theme.id) && 'afh-theme-chip--active']"
            :style="{ '--theme-accent': theme.accent }"
            @click="themeModel = theme.id"
          >
            <span class="afh-theme-chip__ring">
              <span class="afh-theme-chip__swatch" :style="{ background: theme.gradient }" />
            </span>
            <span class="afh-theme-chip__label">{{ theme.label }}</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
