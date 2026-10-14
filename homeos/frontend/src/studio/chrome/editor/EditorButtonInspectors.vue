<script setup lang="ts">
/**
 * 按钮与标题类检查器（图标按钮 / 图标特效 / 标题按钮）。
 *
 * 从 `entries/EditorView.vue` 模板整段切出（`ops/studio/studio_template_seam.mjs`）。
 * 这些段落是**引擎命令式填充的静态 DOM 契约**（`getElementById` / `querySelector`），
 * 零 Vue 指令，故无需 props / emits；用多根模板渲染，DOM 结构与切片前一致（不新增包裹元素）。
 *
 * 改动约束：元素 id 属于对外契约，重命名/删除必须同步 `app/editor/**` 里的取值方。
 */
</script>

<template>
            <form id="icon-button-effect-inspector" class="inspector-form" hidden>
                <section class="inspector-section">
                    <h3>基础</h3>
                    <div class="inspector-grid two-columns"> <label>类型<input id="ibe-type" value="图标按钮（效果）"
                                readonly></label> <label>备注<input id="ibe-label" maxlength="128"></label>
                    </div>
                    <div id="ibe-entity-picker" class="inspector-picker"> <span
                            class="inspector-picker-title">关联实体</span> <button id="ibe-entity-button"
                            class="inspector-picker-button" type="button" aria-haspopup="listbox"
                            aria-expanded="false">不使用实体</button>
                        <div id="ibe-entity-menu" class="inspector-picker-menu" hidden> <input id="ibe-entity-search"
                                type="search" placeholder="搜索实体名称或 ID" autocomplete="off">
                            <div id="ibe-entity-options" class="inspector-entity-options" role="listbox"></div>
                        </div>
                    </div>
                    <div class="navigation-property-control"> <span>灯光实时反馈</span>
                        <div class="navigation-segmented-options effect-realtime-options" role="group"
                            aria-label="灯光实时反馈"> <label class="check-row"><input id="ibe-color-temperature-realtime"
                                    type="checkbox"><span>色温实时</span></label> <label class="check-row"><input
                                    id="ibe-brightness-realtime" type="checkbox"><span>亮度实时</span></label> </div>
                        <p class="inspector-section-note">分别控制效果图片的色温和亮度反馈。</p>
                    </div>
                    <div class="navigation-property-control"> <span>编辑器预览状态</span>
                        <div id="ibe-preview-state" class="navigation-segmented-options three-columns" role="group"
                            aria-label="编辑器预览状态"> <button type="button" data-ibe-preview="auto">跟随实体</button> <button
                                type="button" data-ibe-preview="off">关闭</button> <button type="button"
                                data-ibe-preview="on">开启</button> </div>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>图层</h3>
                    <div id="ibe-layer-options" class="navigation-segmented-options" role="group" aria-label="选择要设置的图层">
                        <button type="button" data-ibe-layer="button">控制按钮</button> <button type="button"
                            data-ibe-layer="effect">效果图层</button> </div>
                </section>
                <section id="ibe-button-section" class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>按钮层</h3><button id="ibe-button-visible" class="inspector-visibility-toggle compact"
                            type="button" aria-pressed="true">隐藏</button>
                    </div>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>图标</strong></div>
                        <div id="ibe-icon-picker" class="inspector-picker navigation-icon-picker"> <span
                                class="inspector-picker-title">选择 MDI 图标</span>
                            <div class="navigation-icon-field-row"> <button id="ibe-icon-button"
                                    class="inspector-picker-button navigation-icon-button" type="button"
                                    aria-haspopup="listbox" aria-expanded="false"><i
                                        aria-hidden="true"></i><span>mdi:lightbulb-outline</span></button> <button
                                    id="ibe-icon-copy" class="navigation-icon-copy" type="button" title="复制图标名称"
                                    aria-label="复制图标名称"><svg viewBox="0 0 16 16" aria-hidden="true">
                                        <rect x="5" y="5" width="8" height="8" rx="1.3"></rect>
                                        <path
                                            d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9A1.5 1.5 0 0 0 3.5 10.5H5">
                                        </path>
                                    </svg><span aria-hidden="true">✓</span></button> </div>
                            <div id="ibe-icon-menu" class="inspector-picker-menu" hidden><input id="ibe-icon-search"
                                    type="search" placeholder="搜索 MDI 图标" autocomplete="off">
                                <div id="ibe-icon-options" class="navigation-icon-options" role="listbox"></div>
                            </div>
                        </div>
                        <div class="inspector-grid three-columns"> <label>关闭前颜色<input id="ibe-icon-on-color"
                                    type="color"></label> <label>关闭后颜色<input id="ibe-icon-off-color"
                                    type="color"></label> <label>大小（%）<input id="ibe-icon-size" type="number" min="1"
                                    max="100" step="1"></label> </div>
                    </div>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>按钮背景</strong></div>
                        <div class="inspector-grid three-columns"> <label>关闭前颜色<input id="ibe-button-on-color"
                                    type="color"></label> <label>关闭后颜色<input id="ibe-button-off-color"
                                    type="color"></label> <label>透明度（%）<input id="ibe-button-opacity" type="number"
                                    min="0" max="100" step="1"></label> </div>
                    </div>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>外框</strong></div>
                        <div class="inspector-grid two-columns"> <label>颜色<input id="ibe-frame-color"
                                    type="color"></label> <label>粗细<input id="ibe-frame-width" type="number" min="0"
                                    max="20" step="0.1"></label> <label>透明度（%）<input id="ibe-frame-opacity"
                                    type="number" min="0" max="100" step="1"></label> <label>圆角（%）<input id="ibe-radius"
                                    type="number" min="0" max="50" step="0.5"></label> </div>
                    </div>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>光晕</strong></div>
                        <div class="inspector-grid three-columns"> <label>颜色<input id="ibe-glow-color"
                                    type="color"></label> <label>关闭前（%）<input id="ibe-glow-on-strength" type="number"
                                    min="0" max="300" step="1"></label> <label>关闭后（%）<input id="ibe-glow-off-strength"
                                    type="number" min="0" max="300" step="1"></label> </div>
                    </div>
                </section>
                <section id="ibe-effect-section" class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>效果层</h3><button id="ibe-effect-visible" class="inspector-visibility-toggle compact"
                            type="button" aria-pressed="true">隐藏</button>
                    </div>
                    <div id="ibe-asset-picker" class="inspector-picker inspector-image-picker"> <span
                            class="inspector-picker-title">选择效果图片</span> <button id="ibe-asset-button"
                            class="inspector-picker-button" type="button" aria-haspopup="listbox"
                            aria-expanded="false">不使用图片</button>
                        <div id="ibe-asset-menu" class="inspector-picker-menu" hidden>
                            <div class="asset-picker-toolbar">
                                <div class="asset-source-tabs" role="tablist" aria-label="图片来源"><button type="button"
                                        data-ibe-asset-source="user">我的图片</button><button type="button"
                                        data-ibe-asset-source="builtin">HomeOS素材</button></div><button id="ibe-asset-upload"
                                    class="asset-upload-button" type="button">上传</button><input
                                    id="ibe-asset-upload-input" type="file"
                                    accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple hidden>
                            </div>
                            <p id="ibe-asset-upload-hint" class="asset-upload-hint" hidden>位图不限制文件大小；SVG 最大 5
                                MB。过大图片会增加加载时间，并可能导致中控操作卡顿。</p> <select id="ibe-asset-folder"
                                aria-label="选择图片文件夹"></select> <input id="ibe-asset-search" type="search"
                                placeholder="搜索图片名称" autocomplete="off">
                            <div id="ibe-asset-options" class="inspector-asset-options" role="listbox"></div>
                        </div>
                    </div>
                    <p id="ibe-effect-size-hint" class="inspector-section-note">效果图片将按原始尺寸等比缩放。</p>
                    <div class="inspector-grid two-columns image-content-options"> <label>透明度（%）<input
                                id="ibe-effect-opacity" type="number" min="0" max="100" step="1"></label>
                        <label>淡入淡出（秒）<input id="ibe-effect-fade-duration" type="number" min="0" max="3"
                                step="0.01"></label>
                        <div class="image-layout-control effect-image-layout-control"><span>图片布局</span>
                            <div class="effect-image-layout-row">
                                <div id="ibe-effect-layout-options" class="image-layout-options" role="group"><button
                                        type="button" data-ibe-layout="free">自由</button><button type="button"
                                        data-ibe-layout="fill">铺满</button></div><button id="ibe-effect-align-image"
                                    class="effect-image-align-trigger" type="button">对齐本页图片</button>
                            </div>
                        </div>
                    </div>
                    <div class="inspector-grid two-columns"> <label>左右位置（%）<input id="ibe-effect-left" type="number"
                                min="-100" max="200" step="0.1"></label> <label>上下位置（%）<input id="ibe-effect-top"
                                type="number" min="-100" max="200" step="0.1"></label> <label>缩放（%）<input
                                id="ibe-effect-scale" type="number" min="1" max="500" step="0.1"></label>
                        <label>旋转（°）<input id="ibe-effect-rotation" type="number" min="-360" max="360"
                                step="0.1"></label> </div>
                </section>
                <section id="ibe-button-transform-section" class="inspector-section">
                    <h3>按钮位置与变换</h3>
                    <div class="inspector-grid two-columns"> <label>左侧（%）<input id="ibe-left" type="number" min="0"
                                max="100" step="0.1"></label><label>顶部（%）<input id="ibe-top" type="number" min="0"
                                max="100" step="0.1"></label> <label>宽度（%）<input id="ibe-width" type="number" min="0.1"
                                max="100" step="0.1"></label><label>高度（%）<input id="ibe-height" type="number" min="0.1"
                                max="100" step="0.1"></label> <label>缩放（%）<input id="ibe-scale" type="number" min="1"
                                max="500" step="0.1"></label><label>旋转（°）<input id="ibe-rotation" type="number"
                                min="-360" max="360" step="0.1"></label> </div>
                </section>
                <section id="ibe-action-section" class="inspector-section">
                    <h3>动作</h3>
                    <div id="ibe-action-controls" class="component-action-controls">
                        <div class="navigation-property-control" data-hidden-content-clickable-control>
                            <span>内容隐藏后</span>
                            <div class="navigation-segmented-options" role="group" aria-label="内容隐藏后的点击行为"><button
                                    type="button" data-hidden-content-clickable="off">不可点击</button><button type="button"
                                    data-hidden-content-clickable="on">仍可点击</button></div>
                            <p class="inspector-section-note">控制按钮内容隐藏后是否还能点击。</p>
                        </div>
                        <div class="component-action-control" data-action-trigger="tap"><span>点按</span>
                            <div class="component-action-options" role="group"><button type="button"
                                    data-action-type="none">无动作</button><button type="button"
                                    data-action-type="toggle">切换</button><button type="button"
                                    data-action-type="more-info">显示详情</button><button type="button"
                                    data-action-type="navigate">跳转页面</button></div><label
                                class="component-action-target" hidden><span>跳转到</span><select
                                    data-action-target></select></label>
                        </div>
                        <div class="component-action-control" data-action-trigger="doubleTap"><span>双击</span>
                            <div class="component-action-options" role="group"><button type="button"
                                    data-action-type="none">无动作</button><button type="button"
                                    data-action-type="toggle">切换</button><button type="button"
                                    data-action-type="more-info">显示详情</button><button type="button"
                                    data-action-type="navigate">跳转页面</button></div><label
                                class="component-action-target" hidden><span>跳转到</span><select
                                    data-action-target></select></label>
                        </div>
                        <div class="component-action-control" data-action-trigger="hold"><span>长按</span>
                            <div class="component-action-options" role="group"><button type="button"
                                    data-action-type="none">无动作</button><button type="button"
                                    data-action-type="toggle">切换</button><button type="button"
                                    data-action-type="more-info">显示详情</button><button type="button"
                                    data-action-type="navigate">跳转页面</button></div><label
                                class="component-action-target" hidden><span>跳转到</span><select
                                    data-action-target></select></label>
                        </div>
                    </div>
                </section>
                <section class="inspector-section navigation-batch-section">
                    <h3>批量应用 <span id="ibe-apply-count">0 项修改</span></h3> <button id="ibe-apply-style"
                        type="button">一键应用到同类型控件</button>
                </section>
            </form>

            <form id="title-button-inspector" class="inspector-form" hidden>
                <section class="inspector-section">
                    <h3>基础</h3>
                    <div class="inspector-grid two-columns"><label>类型<input id="title-button-type" value="标题按钮"
                                readonly></label><label>备注<input id="title-button-label"
                                maxlength="128"></label></div>
                    <div id="title-button-entity-picker" class="inspector-picker"> <span
                            class="inspector-picker-title">关联实体</span> <button id="title-button-entity-button"
                            class="inspector-picker-button" type="button" aria-haspopup="listbox"
                            aria-expanded="false">不使用实体</button>
                        <div id="title-button-entity-menu" class="inspector-picker-menu" hidden> <input
                                id="title-button-entity-search" type="search" placeholder="搜索实体名称或 ID"
                                autocomplete="off">
                            <div id="title-button-entity-options" class="inspector-entity-options" role="listbox"></div>
                        </div>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>文字</h3>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>中文标题</strong><button
                                id="title-button-main-visible" class="inspector-visibility-toggle compact" type="button"
                                aria-pressed="true">隐藏</button></div> <label>内容<input id="title-button-main-text"
                                maxlength="64"></label>
                        <div class="inspector-grid two-columns"><label>颜色<input id="title-button-main-color"
                                    type="color"></label><label>大小<input id="title-button-main-size" type="number"
                                    min="8" max="200" step="1"></label><label>粗细<input id="title-button-main-weight"
                                    type="number" min="0" max="1" step="0.01"></label><label>字间距<input
                                    id="title-button-main-spacing" type="number" min="-20" max="100"
                                    step="0.1"></label><label>左右位置（%）<input id="title-button-main-left" type="number"
                                    min="-100" max="200" step="0.1"></label><label>上下位置（%）<input
                                    id="title-button-main-top" type="number" min="-100" max="200" step="0.1"></label>
                        </div>
                    </div>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>英文标题</strong><button
                                id="title-button-secondary-visible" class="inspector-visibility-toggle compact"
                                type="button" aria-pressed="true">隐藏</button></div> <label>内容<div
                                class="title-button-secondary-lines-field"><input id="title-button-secondary-line-1"
                                    maxlength="64" aria-label="英文标题第一行"><i aria-hidden="true"></i><input
                                    id="title-button-secondary-line-2" maxlength="64" aria-label="英文标题第二行"></div>
                            </label>
                        <div class="inspector-grid two-columns"><label>颜色<input id="title-button-secondary-color"
                                    type="color"></label><label>大小<input id="title-button-secondary-size" type="number"
                                    min="6" max="100" step="1"></label><label>粗细<input
                                    id="title-button-secondary-weight" type="number" min="0" max="1"
                                    step="0.01"></label><label>字间距<input id="title-button-secondary-spacing"
                                    type="number" min="-20" max="100" step="0.1"></label><label>左右位置（%）<input
                                    id="title-button-secondary-left" type="number" min="-100" max="200"
                                    step="0.1"></label><label>上下位置（%）<input id="title-button-secondary-top"
                                    type="number" min="-100" max="200" step="0.1"></label><label>行间距<input
                                    id="title-button-secondary-line-gap" type="number" min="0" max="100"
                                    step="0.1"></label></div>
                    </div>
                </section>
                <section class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>图标</h3><button id="title-button-icon-visible" class="inspector-visibility-toggle compact"
                            type="button" aria-pressed="false">显示</button>
                    </div>
                    <div id="title-button-icon-picker" class="inspector-picker navigation-icon-picker"><span
                            class="inspector-picker-title">选择 MDI 图标</span>
                        <div class="navigation-icon-field-row"><button id="title-button-icon-button"
                                class="inspector-picker-button navigation-icon-button" type="button"
                                aria-haspopup="listbox" aria-expanded="false"><i
                                    aria-hidden="true"></i><span>不使用图标</span></button><button
                                id="title-button-icon-copy" class="navigation-icon-copy" type="button" title="复制图标名称"
                                aria-label="复制图标名称" disabled><svg viewBox="0 0 16 16" aria-hidden="true">
                                    <rect x="5" y="5" width="8" height="8" rx="1.3"></rect>
                                    <path
                                        d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9A1.5 1.5 0 0 0 3.5 10.5H5">
                                    </path>
                                </svg><span aria-hidden="true">✓</span></button></div>
                        <div id="title-button-icon-menu" class="inspector-picker-menu" hidden><input
                                id="title-button-icon-search" type="search" placeholder="搜索 MDI 图标" autocomplete="off">
                            <div id="title-button-icon-options" class="navigation-icon-options" role="listbox"></div>
                        </div>
                    </div>
                    <div class="inspector-grid two-columns"><label>颜色<input id="title-button-icon-color"
                                type="color"></label><label>大小<input id="title-button-icon-size" type="number" min="1"
                                max="100" step="1"></label><label>左右位置（%）<input id="title-button-icon-left"
                                type="number" min="-100" max="200" step="0.1"></label><label>上下位置（%）<input
                                id="title-button-icon-top" type="number" min="-100" max="200" step="0.1"></label></div>
                </section>
                <section class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>括号</h3><button id="title-button-frame-visible" class="inspector-visibility-toggle compact"
                            type="button" aria-pressed="true">隐藏</button>
                    </div>
                    <div class="inspector-grid two-columns"><label>颜色<input id="title-button-frame-color"
                                type="color"></label><label>粗细<input id="title-button-frame-width" type="number" min="0"
                                max="12" step="0.1"></label><label>大小（%）<input id="title-button-frame-size"
                                type="number" min="10" max="300" step="1"></label><label>间距（%）<input
                                id="title-button-frame-spacing" type="number" min="0" max="300"
                                step="1"></label><label>左右位置（%）<input id="title-button-frame-offset-x" type="number"
                                min="-100" max="100" step="0.1"></label><label>上下位置（%）<input
                                id="title-button-frame-offset-y" type="number" min="-100" max="100" step="0.1"></label>
                    </div>
                </section>
                <section class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>三角指示</h3><button id="title-button-marker-visible"
                            class="inspector-visibility-toggle compact" type="button" aria-pressed="true">显示</button>
                    </div>
                    <div class="inspector-grid two-columns"><label>颜色<input id="title-button-marker-color"
                                type="color"></label><label>大小<input id="title-button-marker-size" type="number" min="2"
                                max="60" step="1"></label><label>左右位置（%）<input id="title-button-marker-left"
                                type="number" min="-100" max="200" step="0.1"></label><label>上下位置（%）<input
                                id="title-button-marker-top" type="number" min="-100" max="200" step="0.1"></label>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>位置</h3>
                    <div class="inspector-grid two-columns"><label>左侧（%）<input id="title-button-left" type="number"
                                min="0" max="100" step="0.1"></label><label>顶部（%）<input id="title-button-top"
                                type="number" min="0" max="100" step="0.1"></label></div>
                </section>
                <section class="inspector-section">
                    <h3>尺寸与变换</h3>
                    <div class="inspector-grid two-columns"><label>宽度（%）<input id="title-button-width" type="number"
                                min="0.1" max="100" step="0.1"></label><label>高度（%）<input id="title-button-height"
                                type="number" min="0.1" max="100" step="0.1"></label><label>缩放（%）<input
                                id="title-button-scale" type="number" min="1" max="500"
                                step="0.1"></label><label>旋转（°）<input id="title-button-rotation" type="number"
                                min="-360" max="360" step="0.1"></label></div>
                </section>
                <section class="inspector-section">
                    <h3>动作</h3>
                    <div id="title-button-action-controls" class="component-action-controls">
                        <div class="navigation-property-control" data-hidden-content-clickable-control>
                            <span>内容隐藏后</span>
                            <div class="navigation-segmented-options" role="group" aria-label="内容隐藏后的点击行为"><button
                                    type="button" data-hidden-content-clickable="off">不可点击</button><button type="button"
                                    data-hidden-content-clickable="on">仍可点击</button></div>
                            <p class="inspector-section-note">控制图标、文字或指示隐藏后是否还能点击。</p>
                        </div>
                        <div class="component-action-control" data-action-trigger="tap"><span>点按</span>
                            <div class="component-action-options" role="group"><button type="button"
                                    data-action-type="none">无动作</button><button type="button"
                                    data-action-type="toggle">切换</button><button type="button"
                                    data-action-type="more-info">显示详情</button><button type="button"
                                    data-action-type="navigate">跳转页面</button></div><label
                                class="component-action-target" hidden><span>跳转到</span><select
                                    data-action-target></select></label>
                        </div>
                        <div class="component-action-control" data-action-trigger="doubleTap"><span>双击</span>
                            <div class="component-action-options" role="group"><button type="button"
                                    data-action-type="none">无动作</button><button type="button"
                                    data-action-type="toggle">切换</button><button type="button"
                                    data-action-type="more-info">显示详情</button><button type="button"
                                    data-action-type="navigate">跳转页面</button></div><label
                                class="component-action-target" hidden><span>跳转到</span><select
                                    data-action-target></select></label>
                        </div>
                        <div class="component-action-control" data-action-trigger="hold"><span>长按</span>
                            <div class="component-action-options" role="group"><button type="button"
                                    data-action-type="none">无动作</button><button type="button"
                                    data-action-type="toggle">切换</button><button type="button"
                                    data-action-type="more-info">显示详情</button><button type="button"
                                    data-action-type="navigate">跳转页面</button></div><label
                                class="component-action-target" hidden><span>跳转到</span><select
                                    data-action-target></select></label>
                        </div>
                    </div>
                </section>
                <section class="inspector-section navigation-batch-section">
                    <h3>批量应用 <span id="title-button-apply-count">0 项修改</span></h3><button id="title-button-apply-style"
                        type="button">一键应用到同类型控件</button>
                </section>
            </form>

            <form id="icon-button-inspector" class="inspector-form" hidden>
                <section class="inspector-section">
                    <h3>基础</h3>
                    <div class="inspector-grid two-columns"><label id="icon-button-type-label">类型<input
                                id="icon-button-type" value="图标按钮" readonly></label><label>备注<input
                                id="icon-button-label" maxlength="128"></label><label id="presence-sensor-kind-label"
                            hidden>传感器类型<select id="presence-sensor-kind">
                                <option value="presence">人体/人在传感器</option>
                                <option value="door-window">门窗传感器</option>
                                <option value="water-leak">水浸传感器</option>
                                <option value="smoke">烟雾传感器</option>
                                <option value="natural-gas">天然气传感器</option>
                            </select></label></div>
                    <div id="icon-button-entity-picker" class="inspector-picker"><span
                            class="inspector-picker-title">关联实体</span><button id="icon-button-entity-button"
                            class="inspector-picker-button" type="button" aria-haspopup="listbox"
                            aria-expanded="false">不使用实体</button>
                        <div id="icon-button-entity-menu" class="inspector-picker-menu" hidden><input
                                id="icon-button-entity-search" type="search" placeholder="搜索实体名称或 ID"
                                autocomplete="off">
                            <div id="icon-button-entity-options" class="inspector-entity-options" role="listbox"></div>
                        </div>
                    </div>
                    <div class="inspector-grid two-columns"><label id="device-button-state-precision-label"
                            hidden>数值小数位<select id="device-button-state-precision">
                                <option value="auto">自动</option>
                                <option value="0">0 位</option>
                                <option value="1">1 位</option>
                                <option value="2">2 位</option>
                                <option value="3">3 位</option>
                                <option value="4">4 位</option>
                            </select></label></div>
                    <div id="icon-button-preview-control" class="navigation-property-control"><span>编辑器预览状态</span>
                        <div id="icon-button-preview-state" class="navigation-segmented-options three-columns"
                            role="group" aria-label="编辑器预览状态"><button type="button"
                                data-icon-button-preview="auto">跟随实体</button><button type="button"
                                data-icon-button-preview="off">关闭</button><button type="button"
                                data-icon-button-preview="on">开启</button></div>
                    </div>
                </section>
                <section class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>图标</h3><button id="device-button-icon-visible" class="inspector-visibility-toggle compact"
                            type="button" aria-pressed="true" hidden>隐藏</button>
                    </div>
                    <div id="icon-button-icon-picker" class="inspector-picker navigation-icon-picker"><span
                            class="inspector-picker-title">选择 MDI 图标</span>
                        <div class="navigation-icon-field-row"><button id="icon-button-icon-button"
                                class="inspector-picker-button navigation-icon-button" type="button"
                                aria-haspopup="listbox" aria-expanded="false"><i
                                    aria-hidden="true"></i><span>mdi:ceiling-light</span></button><button
                                id="icon-button-icon-copy" class="navigation-icon-copy" type="button" title="复制图标名称"
                                aria-label="复制图标名称"><svg viewBox="0 0 16 16" aria-hidden="true">
                                    <rect x="5" y="5" width="8" height="8" rx="1.3"></rect>
                                    <path
                                        d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9A1.5 1.5 0 0 0 3.5 10.5H5">
                                    </path>
                                </svg><span aria-hidden="true">✓</span></button></div>
                        <div id="icon-button-icon-menu" class="inspector-picker-menu" hidden><input
                                id="icon-button-icon-search" type="search" placeholder="搜索 MDI 图标" autocomplete="off">
                            <div id="icon-button-icon-options" class="navigation-icon-options" role="listbox"></div>
                        </div>
                    </div>
                    <div class="inspector-grid two-columns"><label id="icon-button-icon-color-label">颜色<input
                                id="icon-button-icon-color" type="color"></label><label
                            id="device-button-icon-on-color-label" hidden>开启颜色<input id="device-button-icon-on-color"
                                type="color"></label><label id="device-button-badge-color-label" hidden>底座颜色<input
                                id="device-button-badge-color" type="color"></label><label
                            id="device-button-badge-opacity-label" hidden>底座透明度（%）<input
                                id="device-button-badge-opacity" type="number" min="0" max="100" step="1"></label><label
                            id="icon-button-icon-size-label">大小（%）<input id="icon-button-icon-size" type="number"
                                min="1" max="100" step="1"></label><label id="device-button-symbol-size-label"
                            hidden>图标大小（%）<input id="device-button-symbol-size" type="number" min="1" max="100"
                                step="1"></label><label id="device-button-badge-size-label" hidden>底座大小（%）<input
                                id="device-button-badge-size" type="number" min="1" max="100"
                                step="1"></label><label>左右位置（%）<input id="icon-button-icon-left" type="number"
                                min="-100" max="200" step="0.1"></label><label>上下位置（%）<input id="icon-button-icon-top"
                                type="number" min="-100" max="200" step="0.1"></label><label
                            id="icon-button-icon-on-opacity-label">关闭前透明度（%）<input id="icon-button-icon-on-opacity"
                                type="number" min="0" max="100" step="1"></label><label
                            id="icon-button-icon-off-opacity-label">关闭后透明度（%）<input id="icon-button-icon-off-opacity"
                                type="number" min="0" max="100" step="1"></label></div>
                </section>
                <section id="presence-motion-section" class="inspector-section" hidden>
                    <h3>运动路径</h3>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>光环</strong><button id="presence-halo-visible"
                                class="inspector-visibility-toggle compact" type="button"
                                aria-pressed="true">隐藏</button></div>
                        <div class="inspector-grid two-columns"><label>宽度（%）<input id="presence-halo-scale-x"
                                    type="number" min="20" max="300" step="1"></label><label>高度（%）<input
                                    id="presence-halo-scale-y" type="number" min="20" max="300"
                                    step="1"></label><label>旋转（°）<input id="presence-halo-rotation" type="number"
                                    min="-360" max="360" step="1"></label><label>透明度（%）<input id="presence-halo-opacity"
                                    type="number" min="0" max="100" step="1"></label></div>
                    </div>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>小人</strong><button id="presence-person-visible"
                                class="inspector-visibility-toggle compact" type="button"
                                aria-pressed="true">隐藏</button></div>
                        <div class="inspector-grid two-columns"><label>缩放（%）<input id="presence-person-scale"
                                    type="number" min="20" max="300" step="1"></label><label>旋转（°）<input
                                    id="presence-person-rotation" type="number" min="-360" max="360"
                                    step="1"></label><label>透明度（%）<input id="presence-person-opacity" type="number"
                                    min="0" max="100" step="1"></label><label>循环一周（秒）<input id="presence-orbit-duration"
                                    type="number" min="2" max="60" step="0.5"></label></div>
                    </div>
                </section>
                <section id="door-window-perspective-section" class="inspector-section" hidden>
                    <h3>透视</h3>
                    <p class="inspector-section-note">拖动画布四角使门窗贴合墙面</p>
                    <div class="door-window-perspective-actions"><button id="door-window-perspective-edit"
                            class="door-window-perspective-action" type="button"
                            aria-pressed="false">编辑透视</button><button id="door-window-perspective-reset"
                            class="door-window-perspective-action" type="button">重置透视</button><button
                            id="door-window-perspective-save" class="door-window-perspective-action" type="button"
                            disabled>保存透视</button></div>
                </section>
                <section class="inspector-section">
                    <h3>文字</h3>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong
                                id="icon-button-main-heading">中文标题</strong><button id="device-button-main-visible"
                                class="inspector-visibility-toggle compact" type="button" aria-pressed="true"
                                hidden>隐藏</button></div><label><span id="icon-button-main-content-label">内容</span><input
                                id="icon-button-main-text" maxlength="64"></label>
                        <div class="inspector-grid two-columns"><label>颜色<input id="icon-button-main-color"
                                    type="color"></label><label>大小<input id="icon-button-main-size" type="number"
                                    min="6" max="120" step="1"></label><label>粗细<input id="icon-button-main-weight"
                                    type="number" min="0" max="1" step="0.01"></label><label>字间距<input
                                    id="icon-button-main-spacing" type="number" min="-20" max="100"
                                    step="0.1"></label><label>左右位置（%）<input id="icon-button-main-left" type="number"
                                    min="-100" max="200" step="0.1"></label><label>上下位置（%）<input
                                    id="icon-button-main-top" type="number" min="-100" max="200"
                                    step="0.1"></label><label id="icon-button-main-on-opacity-label">关闭前透明度（%）<input
                                    id="icon-button-main-on-opacity" type="number" min="0" max="100"
                                    step="1"></label><label id="icon-button-main-off-opacity-label">关闭后透明度（%）<input
                                    id="icon-button-main-off-opacity" type="number" min="0" max="100" step="1"></label>
                        </div>
                    </div>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong
                                id="icon-button-secondary-heading">英文标题</strong><button
                                id="device-button-secondary-visible" class="inspector-visibility-toggle compact"
                                type="button" aria-pressed="true" hidden>隐藏</button></div><label><span
                                id="icon-button-secondary-content-label">内容</span><input id="icon-button-secondary-text"
                                maxlength="64"></label>
                        <div class="inspector-grid two-columns"><label>颜色<input id="icon-button-secondary-color"
                                    type="color"></label><label>大小<input id="icon-button-secondary-size" type="number"
                                    min="5" max="80" step="1"></label><label>粗细<input id="icon-button-secondary-weight"
                                    type="number" min="0" max="1" step="0.01"></label><label>字间距<input
                                    id="icon-button-secondary-spacing" type="number" min="-20" max="100"
                                    step="0.1"></label><label>左右位置（%）<input id="icon-button-secondary-left"
                                    type="number" min="-100" max="200" step="0.1"></label><label>上下位置（%）<input
                                    id="icon-button-secondary-top" type="number" min="-100" max="200"
                                    step="0.1"></label><label
                                id="icon-button-secondary-on-opacity-label">关闭前透明度（%）<input
                                    id="icon-button-secondary-on-opacity" type="number" min="0" max="100"
                                    step="1"></label><label id="icon-button-secondary-off-opacity-label">关闭后透明度（%）<input
                                    id="icon-button-secondary-off-opacity" type="number" min="0" max="100"
                                    step="1"></label></div>
                    </div>
                </section>
                <section id="icon-button-fill-section" class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>状态填充</h3><button id="icon-button-on-fill-visible"
                            class="inspector-visibility-toggle compact" type="button" aria-pressed="true">隐藏</button>
                    </div>
                    <p class="inspector-section-note">关闭后无颜色填充</p>
                    <div class="inspector-grid two-columns"><label>关闭前填充颜色<input id="icon-button-on-fill-color"
                                type="color"></label><label>关闭前填充强度（%）<input id="icon-button-on-fill-strength"
                                type="number" min="0" max="100" step="1"></label><label>淡入淡出（秒）<input
                                id="icon-button-on-fill-fade-duration" type="number" min="0" max="3"
                                step="0.01"></label></div>
                </section>
                <section id="icon-button-frame-section" class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>外框</h3><button id="icon-button-frame-visible" class="inspector-visibility-toggle compact"
                            type="button" aria-pressed="true">隐藏</button>
                    </div>
                    <div class="inspector-grid two-columns"><label>切角大小（%）<input id="icon-button-cut-corner"
                                type="number" min="0" max="50" step="0.5"></label><label>外框粗细<input
                                id="icon-button-frame-width" type="number" min="0" max="12"
                                step="0.1"></label><label>关闭前透明度（%）<input id="icon-button-frame-on-opacity"
                                type="number" min="0" max="100" step="1"></label><label>关闭后透明度（%）<input
                                id="icon-button-frame-off-opacity" type="number" min="0" max="100"
                                step="1"></label><label>渐变角度（°）<input id="icon-button-frame-angle" type="number" min="0"
                                max="360" step="1"></label></div>
                </section>
                <section id="icon-button-soft-light-section" class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>柔光</h3><button id="icon-button-soft-light-visible"
                            class="inspector-visibility-toggle compact" type="button" aria-pressed="true">隐藏</button>
                    </div>
                    <div class="inspector-grid two-columns"><label>颜色<input id="icon-button-soft-light-color"
                                type="color"></label><label>大小（%）<input id="icon-button-soft-light-size" type="number"
                                min="0" max="300" step="1"></label><label>强度（%）<input
                                id="icon-button-soft-light-strength" type="number" min="0" max="500"
                                step="1"></label><label>角度（°）<input id="icon-button-soft-light-angle" type="number"
                                min="0" max="360" step="1"></label></div>
                </section>
                <section id="icon-button-glow-section" class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>泛光</h3><button id="icon-button-glow-visible" class="inspector-visibility-toggle compact"
                            type="button" aria-pressed="true">隐藏</button>
                    </div>
                    <div class="inspector-grid two-columns"><label>颜色<input id="icon-button-glow-color"
                                type="color"></label><label>大小（%）<input id="icon-button-glow-size" type="number" min="0"
                                max="300" step="1"></label><label>强度（%）<input id="icon-button-glow-strength"
                                type="number" min="0" max="500" step="1"></label><label>角度（°）<input
                                id="icon-button-glow-angle" type="number" min="0" max="360" step="1"></label></div>
                </section>
                <section class="inspector-section">
                    <h3>位置</h3>
                    <div class="inspector-grid two-columns"><label>左侧（%）<input id="icon-button-left" type="number"
                                min="0" max="100" step="0.1"></label><label>顶部（%）<input id="icon-button-top"
                                type="number" min="0" max="100" step="0.1"></label></div>
                </section>
                <section class="inspector-section">
                    <h3>尺寸与变换</h3>
                    <div class="inspector-grid two-columns"><label>宽度（%）<input id="icon-button-width" type="number"
                                min="0.1" max="100" step="0.1"></label><label>高度（%）<input id="icon-button-height"
                                type="number" min="0.1" max="100" step="0.1"></label><label>缩放（%）<input
                                id="icon-button-scale" type="number" min="1" max="500"
                                step="0.1"></label><label>旋转（°）<input id="icon-button-rotation" type="number" min="-360"
                                max="360" step="0.1"></label></div>
                </section>
                <section id="icon-button-action-section" class="inspector-section">
                    <div class="inspector-action-heading">
                        <h3>动作</h3><button id="icon-button-preview-details" class="inspector-action-preview"
                            type="button" hidden>预览灯光详情</button>
                    </div>
                    <div id="icon-button-action-controls" class="component-action-controls">
                        <div class="navigation-property-control" data-hidden-content-clickable-control>
                            <span>内容隐藏后</span>
                            <div class="navigation-segmented-options" role="group" aria-label="内容隐藏后的点击行为"><button
                                    type="button" data-hidden-content-clickable="off">不可点击</button><button type="button"
                                    data-hidden-content-clickable="on">仍可点击</button></div>
                            <p class="inspector-section-note">控制图标、标题或状态隐藏后是否还能点击。</p>
                        </div>
                        <div class="component-action-control" data-action-trigger="tap"><span>点按</span>
                            <div class="component-action-options" role="group"><button type="button"
                                    data-action-type="none">无动作</button><button type="button"
                                    data-action-type="toggle">切换</button><button type="button"
                                    data-action-type="more-info">显示详情</button><button type="button"
                                    data-action-type="navigate">跳转页面</button></div><label
                                class="component-action-target" hidden><span>跳转到</span><select
                                    data-action-target></select></label>
                        </div>
                        <div class="component-action-control" data-action-trigger="doubleTap"><span>双击</span>
                            <div class="component-action-options" role="group"><button type="button"
                                    data-action-type="none">无动作</button><button type="button"
                                    data-action-type="toggle">切换</button><button type="button"
                                    data-action-type="more-info">显示详情</button><button type="button"
                                    data-action-type="navigate">跳转页面</button></div><label
                                class="component-action-target" hidden><span>跳转到</span><select
                                    data-action-target></select></label>
                        </div>
                        <div class="component-action-control" data-action-trigger="hold"><span>长按</span>
                            <div class="component-action-options" role="group"><button type="button"
                                    data-action-type="none">无动作</button><button type="button"
                                    data-action-type="toggle">切换</button><button type="button"
                                    data-action-type="more-info">显示详情</button><button type="button"
                                    data-action-type="navigate">跳转页面</button></div><label
                                class="component-action-target" hidden><span>跳转到</span><select
                                    data-action-target></select></label>
                        </div>
                    </div>
                </section>
                <section class="inspector-section navigation-batch-section">
                    <h3>批量应用 <span id="icon-button-apply-count">0 项修改</span></h3><button id="icon-button-apply-style"
                        type="button">一键应用到同类型控件</button>
                </section>
            </form>
</template>
