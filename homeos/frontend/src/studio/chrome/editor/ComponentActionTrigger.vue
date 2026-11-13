<script setup>
/**
 * 检查器里的「一个触发方式 × 四个动作类型 + 跳转目标下拉」控制块。
 *
 * 为什么抽出来：这段标记在 5 个检查器文件里一共写了 **27 遍**（每个触发方式一份，
 * `tap` / `doubleTap` / `hold` 各一组，部分文件有多组控件）。同一份 11 行标记抄 27 次，
 * 改一个按钮文案或加一个动作类型要改 27 处，漏一处就是「这个控件的长按能跳转、
 * 那个不能」这种没人报的 bug。
 *
 * **这里不接管任何同步逻辑**。`inspector-sync.ts` 的 `syncComponentActionControlsCore`
 * 是纯 JS 的命令式同步：它按 `[data-action-trigger]` 找到本组件渲染的根节点，再在内部
 * query `[data-action-type]` / `.component-action-target` / `[data-action-target]`，
 * 并且会**直接改写**那个 `<select>` 的子节点与 `.component-action-target` 的 `hidden`。
 *
 * 因此本组件有两条硬约束，改它之前请先读这两条：
 *
 * 1. **props 必须是静态的**（这里也确实全是静态）。Vue 一旦重渲染，命令式同步塞进
 *    `<select>` 的选项和 `hidden` 状态就会被清掉 —— 而现在这些检查器模板本身没有任何
 *    响应式绑定，渲染一次即定型，所以行为与「手写静态 HTML」完全一致。
 * 2. **class / `data-*` 属性一个都不能改**。它们就是那套命令式 JS 与 CSS 的选择器契约：
 *    `.component-action-control` / `.component-action-options` / `.component-action-target`
 *    与 `data-action-trigger` / `data-action-type` / `data-action-target` 都被
 *    `inspector-sync.ts`、`popup-inspectors.ts`、`date-inspector-submit.ts`、
 *    `document-entity-picker-dismiss.ts` 按选择器读取。
 *
 * 顺带记两条**引擎会改这个组件内部**的事实（不是猜测，是运行时实测的 DOM）：
 *
 * - `initActionPopupConfig()` 会给每个 `.component-action-control` **追加一个**
 *   `div.component-popup-config`（作为第 4 个子元素）；本组件的模板里没有它，也不需要。
 * - 同一函数会把所有 `[data-action-type="more-info"]` 的文案统一改写成「打开弹窗」，
 *   因此 `moreInfoLabel` 只在引擎 init 之前可见 —— 见该 prop 的注释。
 *
 * 两个 aria-label 之所以是 prop 而不是常量：原模板里**并不统一** —— 有的检查器给了
 * 「点按动作」/「点按跳转页面」，有的什么也没给。抽组件时一律补齐会让「新增 aria-label」
 * 伪装成去重；一律删掉则是无障碍回退。所以按现状逐个传入，空串即不渲染该属性。
 */
defineProps({
  /** 触发方式，进 `data-action-trigger`：tap | doubleTap | hold */
  trigger: { type: String, required: true },
  /** 触发方式的中文标签，如「点按」 */
  label: { type: String, required: true },
  /** 四个动作按钮那一组的 aria-label；空串表示不渲染该属性（与原文一致） */
  groupAriaLabel: { type: String, default: '' },
  /** 跳转目标下拉的 aria-label；空串表示不渲染该属性（与原文一致） */
  selectAriaLabel: { type: String, default: '' },
  /**
   * `more-info` 那个按钮的文案。**默认「显示详情」，但 6 处原文写的是「打开弹窗」**
   * （`EditorLayoutInspectors` 全部 3 处 + `EditorMediaInspectors` 后 3 处）。
   *
   * 需要说清楚的是：**这个文案在实际运行时会被引擎覆盖**。
   * `app/editor/home/inspectors/popup-inspectors.ts` 的 `initActionPopupConfig()` 一上来就
   * `document.querySelectorAll('[data-action-type="more-info"]')` 然后统一
   * `textContent = '打开弹窗'`。所以它只在「Vue 渲染完成、引擎 init 之前」的那一瞬可见。
   *
   * 既然运行时无差别，为什么不干脆统一成一个值？因为统一属于**文案变更**：
   * 一旦将来引擎那行覆盖被去掉（它本来就该由组件负责文案），静态值就成了唯一真相，
   * 那时「谁原本写的是什么」已经无从追溯。保留差异 = 保留事实。
   */
  moreInfoLabel: { type: String, default: '显示详情' },
})
</script>

<template>
  <div class="component-action-control" :data-action-trigger="trigger">
    <span>{{ label }}</span>
    <div class="component-action-options" role="group" v-bind="groupAriaLabel ? { 'aria-label': groupAriaLabel } : {}">
      <button type="button" data-action-type="none">无动作</button>
      <button type="button" data-action-type="toggle">切换</button>
      <button type="button" data-action-type="more-info">{{ moreInfoLabel }}</button>
      <button type="button" data-action-type="navigate">跳转页面</button>
    </div>
    <label class="component-action-target" hidden>
      <span>跳转到</span>
      <select data-action-target v-bind="selectAriaLabel ? { 'aria-label': selectAriaLabel } : {}"></select>
    </label>
  </div>
</template>
