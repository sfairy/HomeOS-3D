<script setup lang="ts">
/**
 * 「已放置」面板的静态壳（0.8.7）。
 *
 * 与平面图栏同类：这些 id 是**引擎命令式填充的契约**（`ui/placed-items-wiring.ts` 按 id 取节点），
 * 因此模板里零 Vue 指令、零 props —— 面板内容由引擎在每次画布刷新时重建。
 *
 * 0.8.7 的结构：本面板与 `.asset-library-card` **互为兄弟**（都在 `.library-panel` 下），
 * 切换只看 `hidden` —— 所以这里不能嵌进卡片里，否则「已放置」永远显示不出来。
 */
</script>

<template>
    <section id="placed-items-panel" hidden>
        <div class="placed-heading">
            <h2>当前楼层物品</h2>
            <button id="show-all-items" type="button">显示全部</button>
        </div>
        <input id="placed-search" type="search" placeholder="搜索名称或备注" aria-label="搜索已放置物品"
            autocomplete="off" spellcheck="false">
        <p class="placed-session-note">隐藏与锁定仅本次编辑有效</p>
        <div id="placed-items-list" class="placed-items-list"></div>
    </section>
</template>
