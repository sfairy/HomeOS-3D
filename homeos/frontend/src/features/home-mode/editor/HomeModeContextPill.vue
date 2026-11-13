<script setup>
/**
 * 家庭模式编辑页的单个「上下文 pill」（图标 + 标签 + 值）。
 *
 * 抽出来的原因：`HomeModeContextBar` 的折叠分支（`<details>` 内）与展开分支里，这段标记
 * 曾经逐字写了两遍 —— 22 行模板，改一处就漏另一处。键盘可达性尤其容易只改一边：
 * `role` / `tabindex` / 三个键位事件必须与 `@click` 同时出现，拆开写时漏一个就成了
 * 「鼠标能点、键盘到不了」。
 *
 * 有 `section` 的 pill 才可交互：点击 / 回车 / 空格都会把 section 抛给父级用于跳转；
 * 没有 section 的 pill 只是展示，不给 `role` / `tabindex`（不给读屏器制造假按钮）。
 */
const props = defineProps({
  pill: { type: Object, required: true },
})

const emit = defineEmits(['pill-click'])

function activate() {
  if (props.pill.section) emit('pill-click', props.pill.section)
}
</script>

<template>
  <div
    :class="[
      'hm-context-pill',
      pill.tone && `hm-context-pill--${pill.tone}`,
      pill.section && 'hm-context-pill--clickable',
    ]"
    :role="pill.section ? 'button' : undefined"
    :tabindex="pill.section ? 0 : undefined"
    @click="activate"
    @keydown.enter.prevent="activate"
    @keydown.space.prevent="activate"
  >
    <div class="hm-context-pill__icon">
      <component :is="pill.icon" class="w-3.5 h-3.5" />
    </div>
    <div class="hm-context-pill__body">
      <span class="hm-context-pill__label">{{ pill.label }}</span>
      <span class="hm-context-pill__val">{{ pill.value }}</span>
    </div>
  </div>
</template>
