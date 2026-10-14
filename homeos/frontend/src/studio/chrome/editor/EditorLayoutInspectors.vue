<script setup lang="ts">
/**
 * 布局类检查器（导航 / 面板框 / 户型图自动导图）。
 *
 * 从 `entries/EditorView.vue` 模板整段切出（`ops/studio/studio_template_seam.mjs`）。
 * 这些段落是**引擎命令式填充的静态 DOM 契约**（`getElementById` / `querySelector`），
 * 零 Vue 指令，故无需 props / emits；用多根模板渲染，DOM 结构与切片前一致（不新增包裹元素）。
 *
 * 改动约束：元素 id 属于对外契约，重命名/删除必须同步 `app/editor/**` 里的取值方。
 */
</script>

<template>
            <form id="floorplan-auto-diagram-inspector" class="inspector-form" hidden>
                <section class="inspector-section">
                    <h3>户型图自动导图</h3>
                    <div class="inspector-grid two-columns"> <label>备注<input id="floorplan-auto-diagram-label"
                                maxlength="128"></label> <label>文件夹名称<input id="floorplan-auto-diagram-folder"
                                maxlength="60" placeholder="例如：一楼户型"></label> </div>
                    <p id="floorplan-auto-diagram-status" class="inspector-section-note">尚未生成导图。</p> <button
                        id="floorplan-auto-diagram-view-toggle" type="button" hidden>调整3D视角</button> <button
                        id="floorplan-auto-diagram-open-studio" class="primary" type="button">确定位置大小并后台生成</button>
                    <p class="inspector-section-note">先在画布中确定控件位置和大小，再切换到“调整3D视角”；确认后系统会在后台生成图片与灯组绑定。</p>
                </section>
                <section class="inspector-section">
                    <h3>布局与位置</h3>
                    <div id="floorplan-auto-diagram-layout" class="image-layout-options" role="group"
                        aria-label="户型图自动导图布局"><button type="button" data-floorplan-layout="free">自由</button><button
                            type="button" data-floorplan-layout="fill">铺满</button></div>
                    <div class="inspector-grid two-columns"> <label>左侧（%）<input id="floorplan-auto-diagram-left"
                                type="number" min="0" max="100" step="0.1"></label> <label>顶部（%）<input
                                id="floorplan-auto-diagram-top" type="number" min="0" max="100" step="0.1"></label>
                        <label>宽度（%）<input id="floorplan-auto-diagram-width" type="number" min="0.1" max="100"
                                step="0.1"></label> <label>高度（%）<input id="floorplan-auto-diagram-height" type="number"
                                min="0.1" max="100" step="0.1"></label> <label>缩放（%）<input
                                id="floorplan-auto-diagram-scale" type="number" min="1" max="500" step="0.1"></label>
                        <label>旋转（°）<input id="floorplan-auto-diagram-rotation" type="number" min="-360" max="360"
                                step="0.1"></label> </div>
                </section>
                <section class="inspector-section">
                    <h3>3D视角</h3>
                    <div class="navigation-property-control"><span>导图楼层</span><select id="floorplan-auto-diagram-floor"
                            aria-label="导图楼层">
                            <option value="">载入3D画面后选择</option>
                        </select></div>
                    <div class="navigation-property-control"><span>视图</span>
                        <div id="floorplan-auto-diagram-camera-view" class="navigation-segmented-options" role="group"
                            aria-label="3D视图"><button type="button" data-floorplan-camera-view="free">自由</button><button
                                type="button" data-floorplan-camera-view="top">顶视</button></div>
                    </div>
                    <div class="navigation-property-control"><span>投影</span>
                        <div id="floorplan-auto-diagram-camera-mode" class="navigation-segmented-options" role="group"
                            aria-label="3D投影"><button type="button"
                                data-floorplan-camera-mode="orthographic">正交</button><button type="button"
                                data-floorplan-camera-mode="perspective">透视</button></div>
                    </div>
                    <div class="inspector-grid two-columns"> <label>焦段（mm）<input
                                id="floorplan-auto-diagram-focal-length" type="number" min="18" max="120"
                                step="1"></label> <button id="floorplan-auto-diagram-rotate-top" type="button">顶视旋转
                            90°</button> </div> <button id="floorplan-auto-diagram-open-base-lighting"
                        type="button">进阶设置</button>
                    <p class="inspector-section-note">调整完成后直接点击“确定位置大小并后台生成”，当前视角就是最终导图视角。</p>
                </section>
                <section id="floorplan-auto-diagram-bindings" class="inspector-section" hidden>
                    <h3>灯组实体</h3>
                    <div id="floorplan-auto-diagram-binding-list" class="inspector-grid"></div>
                </section>
            </form>

            <form id="panel-frame-inspector" class="inspector-form" hidden>
                <section class="inspector-section">
                    <h3>基础</h3>
                    <div class="inspector-grid two-columns"><label>类型<input id="panel-frame-type" value="底图框"
                                readonly></label><label>备注<input id="panel-frame-label"
                                maxlength="128"></label></div>
                </section>
                <section class="inspector-section">
                    <h3>内容</h3>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>主文字</strong><button
                                id="panel-frame-main-visible" class="inspector-visibility-toggle compact" type="button"
                                aria-pressed="true">显示</button></div> <label>内容<input id="panel-frame-main-text"
                                maxlength="128"></label>
                        <div class="inspector-grid two-columns"><label>颜色<input id="panel-frame-main-color"
                                    type="color"></label><label>大小<input id="panel-frame-main-size" type="number"
                                    min="8" max="500" step="1"></label><label>笔画粗细<input id="panel-frame-main-weight"
                                    type="number" min="0" max="3" step="0.1"></label><label>字间距<input
                                    id="panel-frame-main-spacing" type="number" min="-20" max="100"
                                    step="0.1"></label><label>左右位置（%）<input id="panel-frame-main-left" type="number"
                                    min="-100" max="200" step="0.1"></label><label>上下位置（%）<input
                                    id="panel-frame-main-top" type="number" min="-100" max="200"
                                    step="0.1"></label><label>透明度（%）<input id="panel-frame-main-opacity" type="number"
                                    min="0" max="100" step="1"></label></div>
                    </div>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>副文字</strong><button
                                id="panel-frame-secondary-visible" class="inspector-visibility-toggle compact"
                                type="button" aria-pressed="true">显示</button></div> <label>内容<input
                                id="panel-frame-secondary-text" maxlength="128"></label>
                        <div class="inspector-grid two-columns"><label>颜色<input id="panel-frame-secondary-color"
                                    type="color"></label><label>大小<input id="panel-frame-secondary-size" type="number"
                                    min="6" max="500" step="1"></label><label>笔画粗细<input
                                    id="panel-frame-secondary-weight" type="number" min="0" max="3"
                                    step="0.1"></label><label>字间距<input id="panel-frame-secondary-spacing" type="number"
                                    min="-20" max="100" step="0.1"></label><label>左右位置（%）<input
                                    id="panel-frame-secondary-left" type="number" min="-100" max="200"
                                    step="0.1"></label><label>上下位置（%）<input id="panel-frame-secondary-top" type="number"
                                    min="-100" max="200" step="0.1"></label><label>透明度（%）<input
                                    id="panel-frame-secondary-opacity" type="number" min="0" max="100" step="1"></label>
                        </div>
                    </div>
                </section>
                <section class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>外框</h3><button id="panel-frame-edge-visible" class="inspector-visibility-toggle compact"
                            type="button" aria-pressed="true">显示</button>
                    </div>
                    <div class="inspector-grid two-columns"><label>颜色<input id="panel-frame-edge-color"
                                type="color"></label><label>粗细<input id="panel-frame-edge-width" type="number" min="0"
                                max="20" step="0.1"></label><label>圆角大小（%）<input id="panel-frame-radius" type="number"
                                min="0" max="50" step="0.5"></label><label>渐变角度（°）<input id="panel-frame-edge-angle"
                                type="number" min="0" max="360" step="1"></label><label>透明度（%）<input
                                id="panel-frame-edge-opacity" type="number" min="0" max="100" step="1"></label></div>
                </section>
                <section class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>柔光</h3><button id="panel-frame-glow-visible" class="inspector-visibility-toggle compact"
                            type="button" aria-pressed="true">显示</button>
                    </div>
                    <div class="inspector-grid two-columns"><label>颜色<input id="panel-frame-glow-color"
                                type="color"></label><label>强度（%）<input id="panel-frame-glow-strength" type="number"
                                min="0" max="500" step="1"></label><label>大小（%）<input id="panel-frame-glow-size"
                                type="number" min="0" max="300" step="1"></label><label>角度（°）<input
                                id="panel-frame-glow-angle" type="number" min="0" max="360" step="1"></label></div>
                </section>
                <section class="inspector-section">
                    <h3>位置</h3>
                    <div class="inspector-grid two-columns"><label>左侧（%）<input id="panel-frame-left" type="number"
                                min="0" max="100" step="0.1"></label><label>顶部（%）<input id="panel-frame-top"
                                type="number" min="0" max="100" step="0.1"></label></div>
                </section>
                <section class="inspector-section">
                    <h3>尺寸与变换</h3>
                    <div class="inspector-grid two-columns"><label>宽度（%）<input id="panel-frame-width" type="number"
                                min="0.1" max="100" step="0.1"></label><label>高度（%）<input id="panel-frame-height"
                                type="number" min="0.1" max="100" step="0.1"></label><label>缩放（%）<input
                                id="panel-frame-scale" type="number" min="1" max="500"
                                step="0.1"></label><label>旋转（°）<input id="panel-frame-rotation" type="number" min="-360"
                                max="360" step="0.1"></label></div>
                </section>
                <section class="inspector-section navigation-batch-section">
                    <h3>批量应用 <span id="panel-frame-apply-count">0 项修改</span></h3> <button id="panel-frame-apply-style"
                        type="button">一键应用到同类型控件</button>
                </section>
            </form>

            <form id="navigation-inspector" class="inspector-form" hidden>
                <section class="inspector-section">
                    <h3>基础</h3>
                    <div class="inspector-grid two-columns"> <label>类型<input id="navigation-type" value="导航按钮"
                                readonly></label> <label>备注<input id="navigation-label"
                                maxlength="128"></label> </div>
                    <div id="navigation-entity-picker" class="inspector-picker"><span
                            class="inspector-picker-title">关联实体（可选）</span><button id="navigation-entity-button"
                            class="inspector-picker-button" type="button" aria-haspopup="listbox"
                            aria-expanded="false">不使用实体</button>
                        <div id="navigation-entity-menu" class="inspector-picker-menu" hidden><input
                                id="navigation-entity-search" type="search" placeholder="搜索实体名称或 ID" autocomplete="off">
                            <div id="navigation-entity-options" class="inspector-entity-options" role="listbox"></div>
                        </div>
                    </div>
                    <div class="navigation-property-control"> <span>编辑器预览状态</span>
                        <div id="navigation-preview-state" class="navigation-segmented-options three-columns"
                            role="group" aria-label="编辑器预览状态"> <button type="button"
                                data-navigation-preview="auto">自动跟随</button> <button type="button"
                                data-navigation-preview="off">选择前</button> <button type="button"
                                data-navigation-preview="on">选择后</button> </div>
                    </div>
                </section>
                <section id="scene-mode-settings" class="inspector-section" hidden>
                    <h3>控制模式</h3>
                    <div id="scene-mode-control" class="navigation-segmented-options" role="group" aria-label="控制模式">
                        <button type="button" data-scene-control-mode="switch" aria-pressed="false">开关模式</button>
                        <button type="button" data-scene-control-mode="scene" aria-pressed="false">情景模式</button> </div>
                    <p id="scene-mode-hint" class="scene-mode-hint">点击执行，轻弹反馈。</p>
                </section>
                <section class="inspector-section">
                    <h3>文字</h3>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>主文字</strong><button
                                id="navigation-main-visible" class="inspector-visibility-toggle compact" type="button"
                                aria-pressed="true">显示</button></div> <label>内容<input id="navigation-main-text"
                                maxlength="128"></label>
                        <div class="inspector-grid two-columns"> <label>颜色<input id="navigation-main-color"
                                    type="color"></label> <label>大小<input id="navigation-main-size" type="number"
                                    min="1" max="500" step="1"></label> <label>笔画粗细<input id="navigation-main-weight"
                                    type="number" min="0" max="3" step="0.1"></label> <label>字间距<input
                                    id="navigation-main-spacing" type="number" min="-20" max="100" step="0.1"></label>
                            <label>左右位置（%）<input id="navigation-main-text-left" type="number" min="-100" max="200"
                                    step="0.1"></label> <label>上下位置（%）<input id="navigation-main-text-top" type="number"
                                    min="-100" max="200" step="0.1"></label> </div>
                    </div>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>副文字</strong><button
                                id="navigation-secondary-visible" class="inspector-visibility-toggle compact"
                                type="button" aria-pressed="true">显示</button></div> <label>内容<input
                                id="navigation-secondary-text" maxlength="128"></label>
                        <div class="inspector-grid two-columns"> <label>颜色<input id="navigation-secondary-color"
                                    type="color"></label> <label>大小<input id="navigation-secondary-size" type="number"
                                    min="1" max="500" step="1"></label> <label>笔画粗细<input
                                    id="navigation-secondary-weight" type="number" min="0" max="3" step="0.1"></label>
                            <label>字间距<input id="navigation-secondary-spacing" type="number" min="-20" max="100"
                                    step="0.1"></label> <label>左右位置（%）<input id="navigation-secondary-text-left"
                                    type="number" min="-100" max="200" step="0.1"></label> <label>上下位置（%）<input
                                    id="navigation-secondary-text-top" type="number" min="-100" max="200"
                                    step="0.1"></label> </div>
                    </div>
                    <div class="inspector-grid two-columns"> <label>选择前透明度（%）<input id="navigation-text-idle-opacity"
                                type="number" min="0" max="100" step="1"></label> <label>选择后透明度（%）<input
                                id="navigation-text-active-opacity" type="number" min="0" max="100" step="1"></label>
                    </div>
                </section>
                <section class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>图标</h3><button id="navigation-icon-visible" class="inspector-visibility-toggle compact"
                            type="button" aria-pressed="true">显示</button>
                    </div>
                    <div id="navigation-icon-picker" class="inspector-picker navigation-icon-picker"> <span
                            class="inspector-picker-title">选择 MDI 图标</span>
                        <div class="navigation-icon-field-row"> <button id="navigation-icon-button"
                                class="inspector-picker-button navigation-icon-button" type="button"
                                aria-haspopup="listbox" aria-expanded="false"> <i
                                    aria-hidden="true"></i><span>mdi:home-lightbulb-outline</span> </button> <button
                                id="navigation-icon-copy" class="navigation-icon-copy" type="button" title="复制图标名称"
                                aria-label="复制图标名称"> <svg viewBox="0 0 16 16" aria-hidden="true">
                                    <rect x="5" y="5" width="8" height="8" rx="1.3"></rect>
                                    <path
                                        d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9A1.5 1.5 0 0 0 3.5 10.5H5">
                                    </path>
                                </svg> <span aria-hidden="true">✓</span> </button> </div>
                        <div id="navigation-icon-menu" class="inspector-picker-menu" hidden> <input
                                id="navigation-icon-search" type="search" placeholder="搜索 MDI 图标" autocomplete="off">
                            <div id="navigation-icon-options" class="navigation-icon-options" role="listbox"></div>
                        </div>
                    </div>
                    <div class="inspector-grid two-columns"> <label>颜色<input id="navigation-icon-color"
                                type="color"></label> <label>大小<input id="navigation-icon-size" type="number" min="1"
                                max="500" step="1"></label> <label>左右位置（%）<input id="navigation-icon-left" type="number"
                                min="-100" max="200" step="0.1"></label> <label>上下位置（%）<input id="navigation-icon-top"
                                type="number" min="-100" max="200" step="0.1"></label> <label>选择前透明度（%）<input
                                id="navigation-icon-idle-opacity" type="number" min="0" max="100" step="1"></label>
                        <label>选择后透明度（%）<input id="navigation-icon-active-opacity" type="number" min="0" max="100"
                                step="1"></label> </div>
                </section>
                <section class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>外框</h3><button id="navigation-frame-visible" class="inspector-visibility-toggle compact"
                            type="button" aria-pressed="true">显示</button>
                    </div>
                    <div class="inspector-grid two-columns"> <label>颜色<input id="navigation-frame-color"
                                type="color"></label> <label>粗细<input id="navigation-frame-width" type="number" min="0"
                                max="20" step="0.1"></label> <label>选择前透明度（%）<input id="navigation-frame-idle-opacity"
                                type="number" min="0" max="100" step="1"></label> <label>选择后透明度（%）<input
                                id="navigation-frame-active-opacity" type="number" min="0" max="100" step="1"></label>
                        <label>圆角大小（%）<input id="navigation-radius" type="number" min="0" max="50" step="0.5"></label>
                        <label>渐变角度（°）<input id="navigation-frame-angle" type="number" min="0" max="360"
                                step="1"></label> </div>
                </section>
                <section class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>背景光晕</h3><button id="navigation-glow-visible" class="inspector-visibility-toggle compact"
                            type="button" aria-pressed="true">显示</button>
                    </div>
                    <div class="inspector-grid two-columns"> <label>颜色<input id="navigation-glow-color"
                                type="color"></label> <label>角度（°）<input id="navigation-glow-angle" type="number"
                                min="0" max="360" step="1"></label> <label>选择前强度（%）<input
                                id="navigation-glow-idle-strength" type="number" min="0" max="500" step="1"></label>
                        <label>选择后强度（%）<input id="navigation-glow-active-strength" type="number" min="0" max="500"
                                step="1"></label> <label>选择前大小（%）<input id="navigation-glow-idle-size" type="number"
                                min="0" max="300" step="1"></label> <label>选择后大小（%）<input
                                id="navigation-glow-active-size" type="number" min="0" max="300" step="1"></label>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>位置</h3>
                    <div class="inspector-grid two-columns"> <label>左侧（%）<input id="navigation-left" type="number"
                                min="0" max="100" step="0.1"></label> <label>顶部（%）<input id="navigation-top"
                                type="number" min="0" max="100" step="0.1"></label> </div>
                </section>
                <section class="inspector-section">
                    <h3>尺寸与变换</h3>
                    <div class="inspector-grid two-columns"> <label>宽度（%）<input id="navigation-width" type="number"
                                min="0.1" max="100" step="0.1"></label> <label>高度（%）<input id="navigation-height"
                                type="number" min="0.1" max="100" step="0.1"></label> <label>缩放（%）<input
                                id="navigation-scale" type="number" min="1" max="500" step="0.1"></label>
                        <label>旋转（°）<input id="navigation-rotation" type="number" min="-360" max="360"
                                step="0.1"></label> </div>
                </section>
                <section class="inspector-section">
                    <h3>动作</h3>
                    <div id="navigation-action-controls" class="component-action-controls">
                        <div class="component-action-control" data-action-trigger="tap"> <span>点按</span>
                            <div class="component-action-options" role="group" aria-label="点按动作"> <button type="button"
                                    data-action-type="none">无动作</button> <button type="button"
                                    data-action-type="toggle">切换</button> <button type="button"
                                    data-action-type="more-info">打开弹窗</button> <button type="button"
                                    data-action-type="navigate">跳转页面</button> </div> <label
                                class="component-action-target" hidden><span>跳转到</span><select data-action-target
                                    aria-label="点按跳转页面"></select></label>
                        </div>
                        <div class="component-action-control" data-action-trigger="doubleTap"> <span>双击</span>
                            <div class="component-action-options" role="group" aria-label="双击动作"> <button type="button"
                                    data-action-type="none">无动作</button> <button type="button"
                                    data-action-type="toggle">切换</button> <button type="button"
                                    data-action-type="more-info">打开弹窗</button> <button type="button"
                                    data-action-type="navigate">跳转页面</button> </div> <label
                                class="component-action-target" hidden><span>跳转到</span><select data-action-target
                                    aria-label="双击跳转页面"></select></label>
                        </div>
                        <div class="component-action-control" data-action-trigger="hold"> <span>长按</span>
                            <div class="component-action-options" role="group" aria-label="长按动作"> <button type="button"
                                    data-action-type="none">无动作</button> <button type="button"
                                    data-action-type="toggle">切换</button> <button type="button"
                                    data-action-type="more-info">打开弹窗</button> <button type="button"
                                    data-action-type="navigate">跳转页面</button> </div> <label
                                class="component-action-target" hidden><span>跳转到</span><select data-action-target
                                    aria-label="长按跳转页面"></select></label>
                        </div>
                    </div>
                </section>
                <section class="inspector-section navigation-batch-section">
                    <h3>批量应用 <span id="navigation-apply-count">0 项修改</span></h3> <button id="navigation-apply-style"
                        type="button">一键应用到同类型控件</button>
                </section>
            </form>
</template>
