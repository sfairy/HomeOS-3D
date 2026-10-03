<!--
组件：HomeModePresetCards.vue
所属模块：frontend / src / views / settings / automate / home-mode
职责：家庭模式预设包卡片网格。手风琴式展开预设详情，支持实体映射覆盖、覆盖已有模式
      勾选与一键安装；展示动作/触发统计与未解析实体计数。
关键依赖：
  - EntityInput：实体映射输入
  - useEntitiesStore：校验实体是否已解析
  - collectPresetActionTags / entityDomainLabel：动作标签聚合与域文案
  - isHomeModeEmojiIcon / resolveHomeModeIcon：预设图标渲染
数据来源：父级透传的 presets / installing + 本地 localOverrides / mergeFlags
-->
<template>
  <div :class="['hm-preset-grid', stacked && 'hm-preset-grid--stack']">
    <article
      v-for="preset in presets"
      :key="preset.id"
      class="hm-preset-card"
      :class="{ 'hm-preset-card--open': openPresetId === preset.id }"
      :style="{ '--preset-accent': presetAccent(preset.id) }"
    >
      <div class="hm-preset-card__glow" aria-hidden="true" />
      <button
        type="button"
        class="hm-preset-card__head hm-preset-card__trigger"
        :aria-expanded="openPresetId === preset.id"
        :aria-controls="`hm-preset-panel-${preset.id}`"
        @click="togglePreset(preset.id)"
      >
        <div class="hm-preset-card__icon" aria-hidden="true">
          <span v-if="isHomeModeEmojiIcon(preset.icon)" class="hm-preset-card__emoji">{{
            preset.icon
          }}</span>
          <component v-else :is="resolveHomeModeIcon(preset.icon)" class="hm-preset-card__lucide" />
        </div>
        <div class="hm-preset-card__meta">
          <div class="hm-preset-card__title-row">
            <h4 class="hm-preset-card__name">{{ preset.name }}</h4>
            <span
              v-if="unresolvedCount(preset) > 0"
              class="hm-preset-card__unresolved"
              :title="`未解析 ${unresolvedCount(preset)} 项`"
            >
              <span class="hm-preset-card__unresolved-num">{{ unresolvedCount(preset) }}</span>
              <span class="hm-preset-card__unresolved-full">{{
                `未解析 ${unresolvedCount(preset)} 项`
              }}</span>
            </span>
          </div>
        </div>
        <ChevronDown class="hm-preset-card__chev" aria-hidden="true" />
      </button>

      <div
        v-show="openPresetId === preset.id"
        :id="`hm-preset-panel-${preset.id}`"
        class="hm-preset-card__body"
      >
        <p class="hm-preset-card__desc">{{ preset.description }}</p>
        <div class="hm-preset-card__stats">
          <span class="hm-preset-stat">
            <Zap class="w-3 h-3" />
            {{ `${preset.actions?.length || 0} 个动作` }}
          </span>
          <span v-if="preset.triggers?.length" class="hm-preset-stat">
            <Clock class="w-3 h-3" />
            {{ `${preset.triggers.length} 个触发` }}
          </span>
          <span
            v-for="tag in presetActionTags(preset)"
            :key="tag"
            class="hm-preset-stat hm-preset-stat--domain"
          >
            {{ actionTagLabel(tag) }}
          </span>
        </div>

        <details v-if="preset.entityKeys?.length" class="hm-preset-card__map">
          <summary class="hm-preset-card__map-toggle">
            <span>{{ '映射实体' }}</span>
            <span class="hm-preset-card__map-count">{{ preset.entityKeys.length }}</span>
          </summary>
          <div class="hm-preset-card__map-body">
            <div v-for="ek in preset.entityKeys" :key="ek.key" class="hm-preset-field">
              <label class="hm-preset-field__label">{{ ek.label }}</label>
              <EntityInput
                v-model="localOverrides[preset.id][ek.key]"
                :placeholder="ek.placeholder"
                wrapper-class="hm-entity-input"
              />
            </div>
          </div>
        </details>

        <label v-if="preset.existingModeId" class="hm-preset-card__merge">
          <input
            v-model="mergeFlags[preset.id]"
            type="checkbox"
            class="hm-preset-card__merge-input"
          />
          <span>{{ `覆盖已有「${preset.name}」模式（不新建副本）` }}</span>
        </label>

        <button
          type="button"
          class="hm-preset-card__install"
          :disabled="installing === preset.id"
          @click="onInstall(preset)"
        >
          <Loader2 v-if="installing === preset.id" class="w-4 h-4 animate-spin" />
          <Sparkles v-else class="w-4 h-4" />
          <span>{{ installing === preset.id ? '安装中…' : '一键安装' }}</span>
        </button>
      </div>
    </article>
  </div>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { Zap, Clock, Loader2, Sparkles, ChevronDown } from '@lucide/vue'
import EntityInput from '@/components/common/EntityInput.vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { isHomeModeEmojiIcon, resolveHomeModeIcon } from '@/utils/home/mode-icon.util'
import { collectPresetActionTags } from '@/utils/home/mode-preset-meta.util'
import { entityDomainLabel } from '@/constants/entity-domain-meta'

// 入参：预设列表、正在安装的预设 id、是否单列堆叠
const props = defineProps({
  presets: { type: Array, default: () => [] },
  installing: { type: String, default: null },
  /** 侧栏单列堆叠 */
  stacked: { type: Boolean, default: false },
})

const emit = defineEmits(['install'])

const entitiesStore = useEntitiesStore()
// 各预设的实体映射覆盖值：{ [presetId]: { [entityKey]: entityId } }
const localOverrides = reactive({})
// 各预设是否勾选「覆盖已有模式」
const mergeFlags = reactive({})
// 当前手风琴展开的预设 id
const openPresetId = ref(null)

// 预设主题色映射，用于卡片强调色
const PRESET_ACCENTS = {
  preset_home: '#34d399',
  preset_away: '#fbbf24',
  preset_sleep: '#818cf8',
  preset_cinema: '#f472b6',
  preset_guest: '#60a5fa',
  preset_cleaning: '#22d3ee',
}

// 预设列表变化时初始化各预设的实体覆盖默认值（优先取建议值，回退占位符）
watch(
  () => props.presets,
  (list) => {
    for (const p of list || []) {
      if (!localOverrides[p.id]) {
        localOverrides[p.id] = {}
        for (const ek of p.entityKeys || []) {
          localOverrides[p.id][ek.key] = p.suggestedOverrides?.[ek.key] || ek.placeholder || ''
        }
      }
    }
  },
  { immediate: true },
)

/** 手风琴：同时最多展开一个，再次点击已展开项则收起 */
function togglePreset(id) {
  openPresetId.value = openPresetId.value === id ? null : id
}

// 统计预设中未解析的实体数量；优先取预设自带的 unresolvedCount，否则按格式与实体存在性判定
function unresolvedCount(preset) {
  if (preset.unresolvedCount != null) return preset.unresolvedCount
  let n = 0
  for (const ek of preset.entityKeys || []) {
    const val = localOverrides[preset.id]?.[ek.key] || ek.placeholder || ''
    if (!val.includes('.') || !entitiesStore.entities[val]) n++
  }
  return n
}

// 聚合预设涉及的动作域/类型标签
function presetActionTags(preset) {
  return collectPresetActionTags(preset)
}

// 将动作标签转为展示文案：内置类型直接返回，其余按域取文案
function actionTagLabel(tag) {
  if (['通知', '安防', '场景', '脚本'].includes(tag)) return tag
  return entityDomainLabel(tag)
}

// 取预设主题色，缺失时回退到默认紫
function presetAccent(id) {
  return PRESET_ACCENTS[id] || '#818cf8'
}

// 安装预设：向上透传预设 id、实体覆盖与是否覆盖已有模式
function onInstall(preset) {
  const overrides = { ...localOverrides[preset.id] }
  emit('install', {
    presetId: preset.id,
    entityOverrides: overrides,
    merge: Boolean(mergeFlags[preset.id] && preset.existingModeId),
  })
}
</script>

<style scoped src="./styles/home-mode-preset-cards.css"></style>
