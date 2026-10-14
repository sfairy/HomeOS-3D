<script setup lang="ts">
/**
 * 编辑器浮层壳（右键菜单 / 大图预览 / 全局取色器 / 户型图自动灯光面板）。
 *
 * 从 `entries/EditorView.vue` 模板整段切出（`ops/studio/studio_template_seam.mjs`）。
 * 这些段落是**引擎命令式填充的静态 DOM 契约**（`getElementById` / `querySelector`），
 * 零 Vue 指令，故无需 props / emits；用多根模板渲染，DOM 结构与切片前一致（不新增包裹元素）。
 *
 * 改动约束：元素 id 属于对外契约，重命名/删除必须同步 `app/editor/**` 里的取值方。
 */
</script>

<template>
    <div id="component-context-menu" class="component-context-menu" role="menu" hidden>
        <div class="component-context-actions"> <button type="button" data-component-action="group" hidden>成组</button>
            <button type="button" data-component-action="ungroup" hidden>解组</button> <button type="button"
                data-component-action="rename-group" hidden>重命名组合</button> <button type="button"
                data-component-action="copy">复制控件</button> <button type="button"
                data-component-action="visibility">隐藏控件</button> <button class="danger" type="button"
                data-component-action="delete">删除控件</button> <button type="button"
                data-component-action="copy-to-page">复制到其他页面</button> </div> <strong>颜色标签</strong>
        <div class="component-label-options"> <button type="button" data-label-color="#ef5350"><span></span>红色</button>
            <button type="button" data-label-color="#ff9800"><span></span>橙色</button> <button type="button"
                data-label-color="#f4c542"><span></span>黄色</button> <button type="button"
                data-label-color="#45b86b"><span></span>绿色</button> <button type="button"
                data-label-color="#26b6b6"><span></span>青色</button> <button type="button"
                data-label-color="#4f8df7"><span></span>蓝色</button> <button type="button"
                data-label-color="#5c6bc0"><span></span>靛蓝</button> <button type="button"
                data-label-color="#9b6cf0"><span></span>紫色</button> <button type="button"
                data-label-color="#ec6fa9"><span></span>粉色</button> <button type="button"
                data-label-color="#78909c"><span></span>灰色</button> <button class="clear-label" type="button"
                data-label-color="">清除标签</button> </div>
    </div>

    <div id="image-asset-large-preview" class="image-asset-large-preview" hidden> <img
            id="image-asset-large-preview-image" alt="图片大图预览"> <span id="image-asset-large-preview-name"></span> </div>

    <div id="global-color-picker" class="global-color-picker" role="dialog" aria-label="颜色选择器" hidden>
        <div id="global-color-picker-sv" class="global-color-picker-sv" aria-label="选择颜色饱和度和亮度"><i
                id="global-color-picker-marker"></i></div> <input id="global-color-picker-hue"
            class="global-color-picker-hue" type="range" min="0" max="360" step="1" aria-label="色相">
        <div class="global-color-picker-value-row"> <i id="global-color-picker-swatch" aria-hidden="true"></i> <input
                id="global-color-picker-hex" maxlength="7" spellcheck="false" autocomplete="off" aria-label="十六进制颜色值">
            <button id="global-color-picker-copy" type="button" title="复制颜色值" aria-label="复制颜色值"><svg
                    viewBox="0 0 16 16" aria-hidden="true">
                    <rect x="5" y="5" width="8" height="8" rx="1.3"></rect>
                    <path d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9A1.5 1.5 0 0 0 3.5 10.5H5"></path>
                </svg><span aria-hidden="true">✓</span></button> <button id="global-color-picker-paste" type="button"
                title="粘贴颜色值" aria-label="从剪贴板粘贴颜色值"><svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M5 3.5h6M6 2h4a1 1 0 0 1 1 1v1H5V3a1 1 0 0 1 1-1Z"></path>
                    <path
                        d="M4 3.5H3.5A1.5 1.5 0 0 0 2 5v8a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 14 13V5a1.5 1.5 0 0 0-1.5-1.5H12">
                    </path>
                    <path d="M8 6.5v5M6 9.5l2 2 2-2"></path>
                </svg><span aria-hidden="true">✓</span></button> </div>
        <div class="global-color-picker-rgb"> <label><input id="global-color-picker-r" type="number" min="0" max="255"
                    step="1"><span>R</span></label> <label><input id="global-color-picker-g" type="number" min="0"
                    max="255" step="1"><span>G</span></label> <label><input id="global-color-picker-b" type="number"
                    min="0" max="255" step="1"><span>B</span></label> </div>
    </div>

    <section id="floorplan-auto-lighting-panel" class="floorplan-auto-lighting-panel" aria-label="自动导图基础光调节" hidden>
        <header id="floorplan-auto-lighting-handle" class="floorplan-auto-lighting-header">
            <strong>基础光调节</strong><span>按住拖动</span><button id="floorplan-auto-lighting-close" type="button">关闭</button>
        </header>
        <div class="floorplan-auto-lighting-body">
            <section>
                <h3>整体</h3>
                <div class="floorplan-auto-lighting-grid"> <label><span>曝光</span><input
                            data-floorplan-base-light="exposure" name="floorplan-base-light-exposure" type="number"
                            min="0.5" max="2" step="0.05"></label> <label><span>半球光</span><input
                            data-floorplan-base-light="hemisphereIntensity"
                            name="floorplan-base-light-hemisphereIntensity" type="number" min="0" max="3"
                            step="0.05"></label> <label><span>环境光</span><input
                            data-floorplan-base-light="ambientIntensity" name="floorplan-base-light-ambientIntensity"
                            type="number" min="0" max="2" step="0.05"></label> </div>
            </section>
            <section>
                <h3>主光与阴影</h3>
                <div class="floorplan-auto-lighting-grid"> <label><span>强度</span><input
                            data-floorplan-base-light="mainIntensity" name="floorplan-base-light-mainIntensity"
                            type="number" min="0" max="5" step="0.05"></label> <label><span>水平角</span><input
                            data-floorplan-base-light="mainAzimuth" name="floorplan-base-light-mainAzimuth"
                            type="number" min="-180" max="180" step="5"></label> <label><span>高度角</span><input
                            data-floorplan-base-light="mainElevation" name="floorplan-base-light-mainElevation"
                            type="number" min="5" max="89" step="5"></label> <label><span>阴影浓度</span><input
                            data-floorplan-base-light="mainShadowIntensity"
                            name="floorplan-base-light-mainShadowIntensity" type="number" min="0" max="1"
                            step="0.05"></label> </div>
            </section>
            <section>
                <h3>侧面补光</h3>
                <div class="floorplan-auto-lighting-grid"> <label><span>强度</span><input
                            data-floorplan-base-light="fillIntensity" name="floorplan-base-light-fillIntensity"
                            type="number" min="0" max="3" step="0.05"></label> <label><span>水平角</span><input
                            data-floorplan-base-light="fillAzimuth" name="floorplan-base-light-fillAzimuth"
                            type="number" min="-180" max="180" step="5"></label> <label><span>高度角</span><input
                            data-floorplan-base-light="fillElevation" name="floorplan-base-light-fillElevation"
                            type="number" min="0" max="89" step="5"></label> </div>
            </section>
            <section>
                <h3>顶部补光</h3>
                <div class="floorplan-auto-lighting-grid"> <label><span>强度</span><input
                            data-floorplan-base-light="topIntensity" name="floorplan-base-light-topIntensity"
                            type="number" min="0" max="3" step="0.05"></label> <label><span>水平角</span><input
                            data-floorplan-base-light="topAzimuth" name="floorplan-base-light-topAzimuth" type="number"
                            min="-180" max="180" step="5"></label> <label><span>高度角</span><input
                            data-floorplan-base-light="topElevation" name="floorplan-base-light-topElevation"
                            type="number" min="0" max="89" step="5"></label> </div>
            </section>
            <p id="floorplan-auto-lighting-status" class="floorplan-auto-lighting-status">修改会实时同步到当前3D预览。</p>
            <div class="floorplan-auto-lighting-actions"><button id="floorplan-auto-lighting-reset"
                    type="button">恢复默认</button><button id="floorplan-auto-lighting-save" class="primary"
                    type="button">保存设置</button></div>
        </div>
    </section>
</template>
