<!--
组件：HomeModeBasicSection.vue
所属模块：frontend / src / views / settings / automate / home-mode
职责：家庭模式编辑器「基础信息」分区。编辑模式名称、图标、互斥组与触发优先级，
      并展示推荐动作模板卡片供快速加入动作列表。
关键依赖：
  - HosSelect：图标/互斥组下拉
  - ENTITY_DOMAIN_COLORS：域配色，用于模板卡片着色
  - isHomeModeEmojiIcon / resolveHomeModeIcon：图标为 emoji 或 lucide 组件的判定与解析
数据来源：父级透传的 activeDraft（双向）+ 图标/互斥组/动作模板选项
-->
<template>
  <div class="hm-panel__section hm-panel__section--fill hm-basic-section">
    <div class="hm-section-body">
      <div class="hm-form-grid hm-form-grid--basic">
        <div class="hm-field hm-field--name">
          <label class="hm-field__label">{{ '模式名称' }}</label>
          <input
            v-model="activeDraft.name"
            type="text"
            class="hm-field__input"
            :placeholder="'如：回家模式'"
          />
        </div>
        <div class="hm-field hm-field--icon">
          <label class="hm-field__label">{{ '图标' }}</label>
          <div class="hm-icon-picker">
            <div class="hm-icon-picker__preview" aria-hidden="true">
              <span
                v-if="isHomeModeEmojiIcon(activeDraft.icon || '🏠')"
                class="hm-icon-picker__emoji"
                >{{ activeDraft.icon || '🏠' }}</span
              >
              <component
                v-else
                :is="resolveHomeModeIcon(activeDraft.icon)"
                class="hm-icon-picker__lucide"
              />
            </div>
            <HosSelect
              variant="home-mode"
              block
              v-model="activeDraft.icon"
              class="hm-icon-picker__select"
            >
              <option v-for="opt in homeModeIconOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </HosSelect>
          </div>
        </div>
        <div class="hm-field">
          <label class="hm-field__label">{{ '互斥组' }}</label>
          <HosSelect variant="home-mode" block v-model="activeDraft.exclusiveGroup">
            <option v-for="opt in exclusiveGroupOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </HosSelect>
          <p class="hm-field__hint">{{ '同组切换时先恢复上一模式设备快照' }}</p>
        </div>
        <div class="hm-field hm-field--priority">
          <label class="hm-field__label">{{ '触发优先级' }}</label>
          <input
            v-model.number="activeDraft.priority"
            type="number"
            min="0"
            max="100"
            step="1"
            class="hm-field__input"
            :placeholder="'50'"
          />
          <p class="hm-field__hint">{{ '数值越高，自动触发时越优先覆盖同组模式' }}</p>
        </div>
      </div>

      <section v-if="actionTemplates.length" class="hm-template-section">
        <header class="hm-template-section__head">
          <div>
            <h5 class="hm-subsection__title">{{ '推荐动作' }}</h5>
            <p class="hm-subsection__desc">{{ '点选加入动作列表，保存前补全实体 ID' }}</p>
          </div>
          <span class="hm-template-section__count">{{ actionTemplates.length }}</span>
        </header>

        <div class="hm-template-grid">
          <button
            v-for="tpl in templateCards"
            :key="tpl.id"
            type="button"
            class="hm-template-card"
            :style="domainChipStyle(tpl.domain)"
            :title="tpl.placeholder || tpl.label"
            @click="$emit('apply-template', tpl)"
          >
            <div class="hm-template-card__icon" aria-hidden="true">
              <component :is="domainIcon(tpl.domain)" class="w-3.5 h-3.5" />
            </div>
            <div class="hm-template-card__body">
              <span v-if="tpl.parts.context" class="hm-template-card__context">
                {{ tpl.parts.context }}
              </span>
              <span class="hm-template-card__label">{{ tpl.parts.action }}</span>
            </div>
            <Plus class="hm-template-card__add" aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Bell, Bot, Clapperboard, Cloud, Lightbulb, Plus, Sparkles } from '@lucide/vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import { ENTITY_DOMAIN_COLORS } from '@/constants/entity-domain-meta'
import { isHomeModeEmojiIcon, resolveHomeModeIcon } from '@/utils/home/mode-icon.util'

// 入参：图标选项、互斥组选项、推荐动作模板列表
const props = defineProps({
  homeModeIconOptions: { type: Array, default: () => [] },
  exclusiveGroupOptions: { type: Array, default: () => [] },
  actionTemplates: { type: Array, default: () => [] },
})

// 双向绑定：当前编辑的家庭模式草稿
const activeDraft = defineModel('activeDraft', { type: Object, required: true })

// 对外事件：点击推荐动作模板时向上透传，由父级追加到动作列表
defineEmits(['apply-template'])

// 模板卡片数据：将模板 label 按「上下文 · 动作」拆分，便于卡片分层展示
const templateCards = computed(() =>
  props.actionTemplates.map((tpl) => ({
    ...tpl,
    parts: splitTemplateLabel(tpl.label),
  })),
)

// 未在 ENTITY_DOMAIN_COLORS 中定义的域回退配色
const DOMAIN_FALLBACK_COLORS = {
  notify: '#38bdf8',
  script: '#2dd4bf',
  automation: '#f59e0b',
}

// 域到 lucide 图标的映射，用于模板卡片左侧图标
const DOMAIN_LUCIDE_ICONS = {
  light: Lightbulb,
  climate: Cloud,
  scene: Clapperboard,
  notify: Bell,
  vacuum: Bot,
}

// 将「上下文 · 动作」格式的模板标签拆分为上下文与动作两部分
function splitTemplateLabel(label) {
  const text = String(label || '')
  const sep = text.indexOf(' · ')
  if (sep === -1) return { context: '', action: text }
  return { context: text.slice(0, sep), action: text.slice(sep + 3) }
}

// 取域对应的 lucide 图标，缺失时回退到 Sparkles
function domainIcon(domain) {
  return DOMAIN_LUCIDE_ICONS[domain] || Sparkles
}

// 生成模板卡片的 CSS 变量样式（主色 + RGB 三通道），供卡片着色
function domainChipStyle(domain) {
  const hex = ENTITY_DOMAIN_COLORS[domain] || DOMAIN_FALLBACK_COLORS[domain]
  if (!hex) return {}
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return {
    '--chip-color': hex,
    '--chip-rgb': `${r}, ${g}, ${b}`,
  }
}
</script>

