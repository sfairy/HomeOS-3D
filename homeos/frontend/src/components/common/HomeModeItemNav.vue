<!--
  家庭模式设置子页的侧边条目导航子组件，以按钮行列出全部模式条目并高亮当前
  选中项，支持激活切换后将对应行平滑滚入可视区。头部显示条目计数与单位文案。
  注意事项：激活索引变化后通过 scrollIntoView 平滑滚动；placeholder 条目样式会弱化。
-->
<template>
  <nav class="hm-item-nav" role="tablist" :aria-label="ariaLabel">
    <p class="hm-item-nav__head">
      <span class="hm-item-nav__count">{{ items.length }}</span>
      <span class="hm-item-nav__head-label">{{ headLabel }}</span>
    </p>
    <div ref="listRef" class="hm-item-nav__list">
      <button
        v-for="item in items"
        :key="item.index"
        :ref="(el) => setRowRef(item.index, el)"
        type="button"
        role="tab"
        :class="[
          'hm-item-nav__row',
          activeIndex === item.index && 'hm-item-nav__row--active',
          item.placeholder && 'hm-item-nav__row--placeholder',
        ]"
        :aria-selected="activeIndex === item.index"
        :title="item.meta ? `${item.label} · ${item.meta}` : item.label"
        @click="$emit('select', item.index)"
      >
        <span class="hm-item-nav__index">{{ item.index + 1 }}</span>
        <span class="hm-item-nav__text">
          <span class="hm-item-nav__label">{{ item.label }}</span>
          <span v-if="item.meta" class="hm-item-nav__meta">{{ item.meta }}</span>
        </span>
      </button>
    </div>
  </nav>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  activeIndex: { type: [Number, null], default: null },
  ariaLabel: { type: String, default: '条目导航' },
  headLabel: { type: String, default: '条' },
})

defineEmits(['select'])

const listRef = ref(null)
const rowRefs = ref({})

// 收集每行 DOM 引用，便于激活项滚入可视区
function setRowRef(index, el) {
  if (el) rowRefs.value[index] = el
  else delete rowRefs.value[index]
}

// 激活索引变化时，等待 DOM 更新后将对应行平滑滚入可视区
watch(
  () => props.activeIndex,
  async (idx) => {
    if (idx == null) return
    await nextTick()
    rowRefs.value[idx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  },
)
</script>
