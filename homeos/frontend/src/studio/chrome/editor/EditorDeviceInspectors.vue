<script setup lang="ts">
/**
 * 设备类检查器（空调 / 扫地机地图 / 窗帘设置）。
 *
 * 从 `entries/EditorView.vue` 模板整段切出（`ops/studio/studio_template_seam.mjs`）。
 * 这些段落是**引擎命令式填充的静态 DOM 契约**（`getElementById` / `querySelector`），
 * 零 Vue 指令，故无需 props / emits；用多根模板渲染，DOM 结构与切片前一致（不新增包裹元素）。
 *
 * 改动约束：元素 id 属于对外契约，重命名/删除必须同步 `app/editor/**` 里的取值方。
 */
</script>

<template>
            <form id="air-conditioner-inspector" class="inspector-form" hidden>
                <section class="inspector-section">
                    <h3>基础</h3>
                    <div class="inspector-grid two-columns"><label>控件类型<input id="air-conditioner-type" value="空调 / 浴霸"
                                readonly></label><label>备注<input id="air-conditioner-label"
                                maxlength="128"></label></div>
                    <div id="air-conditioner-entity-picker" class="inspector-picker"><span
                            class="inspector-picker-title">空调 / 浴霸实体</span><button id="air-conditioner-entity-button"
                            class="inspector-picker-button" type="button" aria-haspopup="listbox"
                            aria-expanded="false">不使用实体</button>
                        <div id="air-conditioner-entity-menu" class="inspector-picker-menu" hidden><input
                                id="air-conditioner-entity-search" type="search" placeholder="搜索 climate 或 fan 实体"
                                autocomplete="off">
                            <div id="air-conditioner-entity-options" class="inspector-entity-options" role="listbox">
                            </div>
                        </div>
                    </div>
                    <div class="navigation-property-control"><span>设备类型</span>
                        <div id="air-conditioner-device-type" class="navigation-segmented-options three-columns"
                            role="group" aria-label="空调或浴霸设备类型"><button type="button"
                                data-air-conditioner-device-type="auto">自动识别</button><button type="button"
                                data-air-conditioner-device-type="air-conditioner">空调</button><button type="button"
                                data-air-conditioner-device-type="bath-heater">浴霸</button></div>
                    </div>
                    <div class="navigation-property-control"><span>编辑器预览状态</span>
                        <div id="air-conditioner-preview-state" class="navigation-segmented-options three-columns"
                            role="group"><button type="button" data-air-conditioner-preview="auto">跟随实体</button><button
                                type="button" data-air-conditioner-preview="off">关闭</button><button type="button"
                                data-air-conditioner-preview="on">开启</button></div>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>图层</h3>
                    <div id="air-conditioner-layer-options" class="navigation-segmented-options" role="group"><button
                            type="button" data-air-conditioner-layer="button">控制按钮</button><button type="button"
                            data-air-conditioner-layer="airflow">出风效果</button></div>
                </section>
                <section id="air-conditioner-button-section" class="inspector-section">
                    <h3>按钮层</h3>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>图标</strong><button
                                id="air-conditioner-icon-visible" class="inspector-visibility-toggle compact"
                                type="button" aria-pressed="true">隐藏</button></div>
                        <div class="inspector-grid two-columns"><label>关闭颜色<input id="air-conditioner-icon-off-color"
                                    type="color"></label><label>开启颜色<input id="air-conditioner-icon-on-color"
                                    type="color"></label><label>底座颜色<input id="air-conditioner-badge-color"
                                    type="color"></label><label>图标大小（%）<input id="air-conditioner-symbol-size"
                                    type="number" min="1" max="100" step="1"></label><label>底座大小（%）<input
                                    id="air-conditioner-badge-size" type="number" min="1" max="100"
                                    step="1"></label><label>左右位置（%）<input id="air-conditioner-icon-left" type="number"
                                    min="-100" max="200" step="0.1"></label><label>上下位置（%）<input
                                    id="air-conditioner-icon-top" type="number" min="-100" max="200"
                                    step="0.1"></label><label>底座透明度（%）<input id="air-conditioner-badge-opacity"
                                    type="number" min="0" max="100" step="1"></label></div>
                    </div>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>标题</strong><button
                                id="air-conditioner-main-visible" class="inspector-visibility-toggle compact"
                                type="button" aria-pressed="true">隐藏</button></div><label>自定义标题<input
                                id="air-conditioner-main-text" maxlength="64" placeholder="留空跟随实体名称"></label>
                        <div class="inspector-grid two-columns"><label>颜色<input id="air-conditioner-main-color"
                                    type="color"></label><label>大小<input id="air-conditioner-main-size" type="number"
                                    min="6" max="120" step="1"></label><label>粗细<input id="air-conditioner-main-weight"
                                    type="number" min="0" max="1" step="0.01"></label><label>字间距<input
                                    id="air-conditioner-main-spacing" type="number" min="-20" max="100"
                                    step="0.1"></label><label>左右位置（%）<input id="air-conditioner-main-left" type="number"
                                    min="-100" max="200" step="0.1"></label><label>上下位置（%）<input
                                    id="air-conditioner-main-top" type="number" min="-100" max="200" step="0.1"></label>
                        </div>
                    </div>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>状态</strong><button
                                id="air-conditioner-secondary-visible" class="inspector-visibility-toggle compact"
                                type="button" aria-pressed="true">隐藏</button></div><label hidden>自定义状态<input
                                id="air-conditioner-secondary-text" maxlength="64"></label>
                        <div class="inspector-grid two-columns"><label>颜色<input id="air-conditioner-secondary-color"
                                    type="color"></label><label>大小<input id="air-conditioner-secondary-size"
                                    type="number" min="5" max="80" step="1"></label><label>粗细<input
                                    id="air-conditioner-secondary-weight" type="number" min="0" max="1"
                                    step="0.01"></label><label>字间距<input id="air-conditioner-secondary-spacing"
                                    type="number" min="-20" max="100" step="0.1"></label><label>左右位置（%）<input
                                    id="air-conditioner-secondary-left" type="number" min="-100" max="200"
                                    step="0.1"></label><label>上下位置（%）<input id="air-conditioner-secondary-top"
                                    type="number" min="-100" max="200" step="0.1"></label></div>
                    </div>
                </section>
                <section id="air-conditioner-airflow-section" class="inspector-section" hidden>
                    <div class="navigation-property-heading section-heading">
                        <h3>出风效果</h3><button id="air-conditioner-airflow-visible"
                            class="inspector-visibility-toggle compact" type="button" aria-pressed="true">隐藏</button>
                    </div>
                    <div class="navigation-property-control"><span>效果模式</span>
                        <div id="air-conditioner-airflow-motion" class="navigation-segmented-options" role="group">
                            <button type="button" data-airflow-motion="dynamic">动态</button><button type="button"
                                data-airflow-motion="static">静态</button></div>
                    </div>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>出风颜色</strong></div>
                        <div class="inspector-grid three-columns"><label>制冷<input
                                    id="air-conditioner-airflow-cool-color" type="color"></label><label>制热<input
                                    id="air-conditioner-airflow-heat-color" type="color"></label><label>其它<input
                                    id="air-conditioner-airflow-other-color" type="color"></label></div>
                    </div>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>形态</strong></div>
                        <div class="inspector-grid two-columns"><label>整体方向（°）<input id="air-conditioner-airflow-angle"
                                    type="number" min="-360" max="360" step="1"></label><label>弯曲程度（%）<input
                                    id="air-conditioner-airflow-curve" type="number" min="-200" max="200"
                                    step="1"></label><label>单股长度（%）<input id="air-conditioner-airflow-length"
                                    type="number" min="10" max="300" step="1"></label><label>渐变消失位置（%）<input
                                    id="air-conditioner-airflow-fade" type="number" min="15" max="100"
                                    step="1"></label><label>扩散宽度（%）<input id="air-conditioner-airflow-spread"
                                    type="number" min="10" max="300" step="1"></label><label>气流密度（%）<input
                                    id="air-conditioner-airflow-density" type="number" min="20" max="200"
                                    step="1"></label><label>错落程度（%）<input id="air-conditioner-airflow-irregularity"
                                    type="number" min="0" max="200" step="1"></label><label>整体粗细（%）<input
                                    id="air-conditioner-airflow-thickness" type="number" min="5" max="300"
                                    step="1"></label></div>
                    </div>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>动画</strong></div>
                        <div class="inspector-grid two-columns"><label>显示强度（%）<input
                                    id="air-conditioner-airflow-strength" type="number" min="0" max="500"
                                    step="1"></label><label>模糊大小<input id="air-conditioner-airflow-blur" type="number"
                                    min="0" max="30" step="0.5"></label><label>动画速度（秒）<input
                                    id="air-conditioner-airflow-speed" type="number" min="0.3" max="12"
                                    step="0.1"></label></div>
                    </div>
                    <div class="navigation-property-group">
                        <div class="navigation-property-heading"><strong>位置与变换</strong></div>
                        <div class="inspector-grid two-columns"><label>左右偏移（%）<input
                                    id="air-conditioner-airflow-offset-x" type="number" min="-500" max="500"
                                    step="0.1"></label><label>上下偏移（%）<input id="air-conditioner-airflow-offset-y"
                                    type="number" min="-500" max="500" step="0.1"></label><label>宽度（%）<input
                                    id="air-conditioner-airflow-width" type="number" min="1" max="500"
                                    step="0.1"></label><label>高度（%）<input id="air-conditioner-airflow-height"
                                    type="number" min="1" max="500" step="0.1"></label><label>缩放（%）<input
                                    id="air-conditioner-airflow-scale" type="number" min="1" max="500"
                                    step="0.1"></label><label>旋转（°）<input id="air-conditioner-airflow-rotation"
                                    type="number" min="-360" max="360" step="0.1"></label></div>
                    </div>
                </section>
                <section id="air-conditioner-transform-section" class="inspector-section">
                    <h3>按钮位置与变换</h3>
                    <div class="inspector-grid two-columns"><label>左侧（%）<input id="air-conditioner-left" type="number"
                                min="0" max="100" step="0.1"></label><label>顶部（%）<input id="air-conditioner-top"
                                type="number" min="0" max="100" step="0.1"></label><label hidden>宽度（%）<input
                                id="air-conditioner-width" type="number" min="0.1" max="100" step="0.1"></label><label
                            hidden>高度（%）<input id="air-conditioner-height" type="number" min="0.1" max="100"
                                step="0.1"></label><label>缩放（%）<input id="air-conditioner-scale" type="number" min="1"
                                max="500" step="0.1"></label><label>旋转（°）<input id="air-conditioner-rotation"
                                type="number" min="-360" max="360" step="0.1"></label></div>
                </section>
                <section id="air-conditioner-action-section" class="inspector-section">
                    <div class="inspector-action-heading">
                        <h3>动作</h3><button id="air-conditioner-preview-details" class="inspector-action-preview"
                            type="button" hidden>预览空调详情</button>
                    </div>
                    <div id="air-conditioner-action-controls" class="component-action-controls">
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
                    <h3>批量应用 <span id="air-conditioner-apply-count">0 项修改</span></h3><button
                        id="air-conditioner-apply-style" type="button">一键应用到同类型控件</button>
                </section>
            </form>

            <form id="vacuum-map-inspector" class="inspector-form" hidden>
                <section class="inspector-section">
                    <h3>基础</h3>
                    <div class="inspector-grid two-columns"><label>类型<input id="vacuum-map-type" value="扫地机器人实时地图"
                                readonly></label><label>备注<input id="vacuum-map-label"
                                maxlength="128"></label></div>
                    <div id="vacuum-map-entity-picker" class="inspector-picker"><span
                            class="inspector-picker-title">实时地图实体</span><button id="vacuum-map-entity-button"
                            class="inspector-picker-button" type="button" aria-haspopup="listbox"
                            aria-expanded="false">不使用实体</button>
                        <div id="vacuum-map-entity-menu" class="inspector-picker-menu" hidden><input
                                id="vacuum-map-entity-search" type="search" placeholder="搜索实体名称或 ID" autocomplete="off">
                            <div id="vacuum-map-entity-options" class="inspector-entity-options" role="listbox"></div>
                        </div>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>地图</h3>
                    <div class="inspector-grid two-columns"><label>透明度（%）<input id="vacuum-map-opacity" type="number"
                                min="0" max="100" step="1"></label></div>
                </section>
                <section class="inspector-section">
                    <h3>位置</h3>
                    <div class="inspector-grid two-columns"><label>左侧（%）<input id="vacuum-map-left" type="number"
                                min="0" max="100" step="0.1"></label><label>顶部（%）<input id="vacuum-map-top"
                                type="number" min="0" max="100" step="0.1"></label></div>
                </section>
                <section class="inspector-section">
                    <h3>尺寸与变换</h3>
                    <div class="inspector-grid two-columns"><label>缩放（%）<input id="vacuum-map-scale" type="number"
                                min="1" max="500" step="0.1"></label><label>旋转（°）<input id="vacuum-map-rotation"
                                type="number" min="-360" max="360" step="0.1"></label></div>
                </section>
            </form>

            <section id="cover-settings-inspector" class="inspector-section cover-settings-compact" hidden>
                <h3>窗帘</h3>
                <div class="cover-settings-compact-grid">
                    <div class="cover-settings-compact-row"><span>类型</span>
                        <div id="cover-settings-kind" class="navigation-segmented-options four-columns" role="group"
                            aria-label="窗帘或晾衣机类型"><button type="button" data-cover-kind="auto">自动识别</button><button
                                type="button" data-cover-kind="standard">普通窗帘</button><button type="button"
                                data-cover-kind="dream">梦幻帘</button><button type="button"
                                data-cover-kind="airer">晾衣机</button></div>
                    </div>
                    <div class="cover-settings-compact-row"><span>开合</span>
                        <div id="cover-settings-direction" class="navigation-segmented-options three-columns"
                            role="group" aria-label="窗帘开合方向"><button type="button"
                                data-cover-direction="split">双开</button><button type="button"
                                data-cover-direction="left">向左</button><button type="button"
                                data-cover-direction="right">向右</button></div>
                    </div>
                    <div class="cover-settings-compact-row"><span>电机</span>
                        <div id="cover-settings-motor-direction" class="navigation-segmented-options three-columns"
                            role="group" aria-label="窗帘电机方向"><button type="button" data-cover-motor-direction="auto">跟随
                                HA</button><button type="button" data-cover-motor-direction="normal">正常</button><button
                                type="button" data-cover-motor-direction="reversed">反向</button></div>
                    </div>
                </div>
            </section>
</template>
