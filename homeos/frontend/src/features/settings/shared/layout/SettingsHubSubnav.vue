<!--
  设置 Hub 子导航。横向 Tab 按钮列表，支持图标、emoji 与徽章，按 accent 着色激活项。
  scrollable：Tab 超出宽度时保持单行横向滚动，并把激活项自动滚到中间；
  键盘 ← / → / Home / End 可在 Tab 之间移动并即时切换。
-->
<template>
  <nav
    ref="navEl"
    :class="['settings-hub-subnav', navClass, scrollable && 'settings-hub-subnav--scroll']"
    role="tablist"
    :aria-label="ariaLabel || undefined"
  >
    <button
      v-for="(sec, index) in sections"
      :key="sec.id"
      :ref="(el) => setButton(sec.id, el)"
      type="button"
      role="tab"
      :aria-selected="modelValue === sec.id"
      :tabindex="modelValue === sec.id ? 0 : -1"
      class="settings-hub-subnav__btn"
      :class="{ 'settings-hub-subnav__btn--active': modelValue === sec.id }"
      :style="sec.accent ? { '--hub-accent': sec.accent } : undefined"
      @click="$emit('update:modelValue', sec.id)"
      @keydown="onKeydown($event, index)"
    >
      <span v-if="sec.emoji" class="settings-hub-subnav__emoji">{{ sec.emoji }}</span>
      <component v-else-if="sec.icon" :is="sec.icon" class="w-3.5 h-3.5 shrink-0" />
      <span>{{ sec.label }}</span>
      <span v-if="sec.badge != null && sec.badge !== ''" class="settings-hub-subnav__badge">{{
        sec.badge
      }}</span>
    </button>
  </nav>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, required: true },
  sections: { type: Array, required: true },
  navClass: { type: String, default: '' },
  /** 单行横向滚动：Tab 不换行，激活项自动居中；窄屏默认由全局样式兜底 */
  scrollable: { type: Boolean, default: false },
  /** 无障碍名称（多条子导航在同一页时用于区分） */
  ariaLabel: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const navEl = ref(null)
/** id → 按钮元素，供居中与键盘焦点复用 */
const buttons = new Map()

function setButton(id, el) {
  if (el) buttons.set(id, el)
  else buttons.delete(id)
}

/** 只滚导航自身，避免带动页面纵向滚动 */
function centerActive(id) {
  const nav = navEl.value
  const el = buttons.get(id)
  if (!props.scrollable || !nav || !el) return
  const target = el.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2
  nav.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
}

watch(
  () => props.modelValue,
  (id) => {
    void nextTick(() => centerActive(id))
  },
  { immediate: true },
)

function onKeydown(event, index) {
  const ids = props.sections.map((sec) => sec.id)
  let next = -1
  if (event.key === 'ArrowRight') next = (index + 1) % ids.length
  else if (event.key === 'ArrowLeft') next = (index - 1 + ids.length) % ids.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = ids.length - 1
  if (next < 0) return
  event.preventDefault()
  if (props.modelValue !== ids[next]) emit('update:modelValue', ids[next])
  void nextTick(() => buttons.get(ids[next])?.focus())
}
</script>
