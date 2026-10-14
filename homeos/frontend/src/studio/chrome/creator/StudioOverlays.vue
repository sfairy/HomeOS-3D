<script setup lang="ts">
/**
 * creator 浮层壳（toast / 灯组右键菜单 / 楼层右键菜单）。
 *
 * 从 `entries/StudioView.vue` 模板整段切出（`ops/studio/studio_template_seam.mjs`）。
 * 这些段落是**引擎命令式填充的静态 DOM 契约**（`getElementById` / `querySelector`），
 * 零 Vue 指令，故无需 props / emits；用多根模板渲染，DOM 结构与切片前一致（不新增包裹元素）。
 *
 * 改动约束：元素 id 属于对外契约，重命名/删除必须同步 `app/editor/**` 里的取值方。
 */
</script>

<template>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>

    <div id="light-group-context-menu" class="light-group-context-menu" hidden><button type="button"
            data-light-group-action="area">设置区域</button><button type="button"
            data-light-group-action="rename">重命名</button><button type="button"
            data-light-group-action="duplicate">复制灯组</button><button type="button"
            data-light-group-action="delete">删除</button></div>

    <div id="floor-context-menu" class="light-group-context-menu" hidden><button type="button"
            data-floor-action="rename">重命名</button><button type="button" data-floor-action="delete">删除楼层</button></div>
</template>
