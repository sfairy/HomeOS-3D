<template>
  <!-- 模板库条目：支持标准卡片与紧凑列表两种布局 -->
  <article class="wr-tpl-item" :class="{ 'wr-tpl-item--compact': compact }" :title="tooltipText">
    <!-- 紧凑模式：横向单行布局，名称/来源/标签 + 操作按钮 -->
    <template v-if="compact">
      <div class="wr-tpl-item__compact-body">
        <div class="wr-tpl-item__row">
          <div class="wr-tpl-item__main">
            <span class="wr-tpl-item-name">{{ name }}</span>
            <span v-if="sourceLabel" class="wr-tpl-item__source">{{ sourceLabel }}</span>
            <span v-for="tag in displayTags" :key="tag" class="wr-tpl-tag wr-tpl-tag--inline">{{
              tag
            }}</span>
            <span
              v-if="placeholderCount > 0"
              class="wr-tpl-tag wr-tpl-tag--warn wr-tpl-tag--inline"
            >
              {{ `${placeholderCount} 处待映射` }}
            </span>
          </div>
          <button
            type="button"
            class="wr-tpl-item__action"
            :disabled="disabled"
            @click="$emit('install')"
          >
            {{ disabled ? '…' : actionLabel }}
          </button>
        </div>
        <p v-if="description" class="wr-tpl-item-desc wr-tpl-item-desc--compact">
          {{ description }}
        </p>
      </div>
    </template>
    <!-- 标准模式：标题 + 描述 + 标签卡片 -->
    <template v-else>
      <div class="wr-tpl-item__head">
        <h4 class="wr-tpl-item-name">{{ name }}</h4>
        <button
          type="button"
          class="wr-tpl-item__action"
          :disabled="disabled"
          @click="$emit('install')"
        >
          {{ disabled ? '…' : actionLabel }}
        </button>
      </div>
      <p v-if="description" class="wr-tpl-item-desc">{{ description }}</p>
      <div v-if="displayTags.length || placeholderCount > 0" class="wr-tpl-item-tags">
        <span v-for="tag in displayTags" :key="tag" class="wr-tpl-tag">{{ tag }}</span>
        <span v-if="placeholderCount > 0" class="wr-tpl-tag wr-tpl-tag--warn">
          {{ `${placeholderCount} 处待映射` }}
        </span>
      </div>
    </template>
  </article>
</template>

<script setup>
/**
 * OrchestratorTemplateItem.vue
 *
 * 所属模块：dashboard / Orchestrator（联动编排器）
 * 职责：模板库列表的单条模板卡片。展示名称、描述、来源、标签、待映射占位数量，
 *      提供“安装”按钮触发模板套用流程。支持紧凑与标准两种布局。
 * 依赖：vue（computed）。
 */
import { computed } from 'vue'

/**
 * 组件 Props
 * @property {string}   name             - 模板名称
 * @property {string}   description      - 模板描述
 * @property {string[]} tags             - 标签列表
 * @property {string[]} domains          - 涉及的 HA domain 列表（无标签时作为标签补充）
 * @property {string}   sourceLabel      - 来源标签（如“内置”“社区”）
 * @property {number}   placeholderCount - 待映射的占位实体数量（>0 时显示警告 chip）
 * @property {boolean}  disabled         - 是否禁用安装按钮（如安装中）
 * @property {string}   actionLabel      - 操作按钮文案（默认“安装”）
 * @property {boolean}  compact          - 是否使用紧凑模式
 */
const props = defineProps({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  tags: { type: Array, default: () => [] },
  domains: { type: Array, default: () => [] },
  sourceLabel: { type: String, default: '' },
  placeholderCount: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
  actionLabel: { type: String, default: '安装' },
  compact: { type: Boolean, default: false },
})

/** 事件：点击安装按钮时触发 */
defineEmits(['install'])

/**
 * 展示用标签集合
 * - 紧凑模式：优先取 tags 前 2 个，否则 domains 前 2 个
 * - 标准模式：优先取 tags 前 5 个，否则 domains 前 4 个
 * @returns {string[]} 标签数组
 */
const displayTags = computed(() => {
  if (props.compact) {
    if (props.tags?.length) return props.tags.slice(0, 2)
    return (props.domains || []).slice(0, 2)
  }
  if (props.tags?.length) return props.tags.slice(0, 5)
  return (props.domains || []).slice(0, 4)
})

/**
 * 卡片 title 属性（hover 提示）
 * - 紧凑模式且有 description 时返回 undefined（避免与下方描述重复）
 * - 标准模式：拼接 description + tags + domains
 * @returns {string|undefined}
 */
const tooltipText = computed(() => {
  if (props.compact && props.description) return undefined
  const parts = [props.description, ...(props.tags ?? []), ...(props.domains ?? [])].filter(Boolean)
  return parts.join(' · ') || undefined
})
</script>