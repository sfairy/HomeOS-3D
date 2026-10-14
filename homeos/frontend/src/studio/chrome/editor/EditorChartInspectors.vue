<script setup lang="ts">
/**
 * 数据与图表类检查器（灯光统计 / 折线图 / 事件流 / 时间 / 日期 / 天气）。
 *
 * 从 `entries/EditorView.vue` 模板整段切出（`ops/studio/studio_template_seam.mjs`）。
 * 这些段落是**引擎命令式填充的静态 DOM 契约**（`getElementById` / `querySelector`），
 * 零 Vue 指令，故无需 props / emits；用多根模板渲染，DOM 结构与切片前一致（不新增包裹元素）。
 *
 * 改动约束：元素 id 属于对外契约，重命名/删除必须同步 `app/editor/**` 里的取值方。
 */
</script>

<template>
            <form id="light-statistics-inspector" class="inspector-form" hidden>
                <section class="inspector-section">
                    <h3>基础</h3>
                    <div class="inspector-grid two-columns"><label>类型<input id="light-statistics-type" value="数量统计"
                                readonly></label><label>备注<input id="light-statistics-label"
                                maxlength="128"></label></div> <label>文字内容<input id="light-statistics-title"
                            maxlength="64" placeholder="数量"></label>
                    <p class="inspector-section-note">统计实体只参与计数；支持灯光、开关、空调等具有明确开启/关闭或运行状态的设备，以及蓝牙在线状态实体（在线计入数量）。</p>
                </section>
                <section class="inspector-section">
                    <h3>统计实体 <span id="light-statistics-entity-count">0 个</span></h3>
                    <p class="inspector-section-note">选择实体后会直接加入列表。每个设备或群组按 1 个数量统计。</p>
                    <div id="light-statistics-entity-picker" class="inspector-picker"> <span
                            class="inspector-picker-title">添加或更换实体</span> <button id="light-statistics-entity-button"
                            class="inspector-picker-button" type="button" aria-haspopup="listbox"
                            aria-expanded="false">选择一个实体</button>
                        <div id="light-statistics-entity-menu" class="inspector-picker-menu" hidden> <input
                                id="light-statistics-entity-search" type="search" placeholder="搜索实体名称或 ID"
                                autocomplete="off">
                            <div id="light-statistics-entity-options" class="inspector-entity-options" role="listbox">
                            </div>
                        </div>
                    </div>
                    <div id="light-statistics-entity-pending" class="light-statistics-entity-pending" hidden>
                        <div><strong id="light-statistics-pending-name"></strong><small
                                id="light-statistics-pending-detail"></small></div> <button
                            id="light-statistics-entity-confirm" type="button">确认添加</button>
                    </div>
                    <p id="light-statistics-entity-message"
                        class="inspector-section-note light-statistics-entity-message" hidden></p>
                    <div id="light-statistics-entity-list" class="light-statistics-entity-list"></div>
                </section>
                <section class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>图标</h3><button id="light-statistics-icon-visible"
                            class="inspector-visibility-toggle compact" type="button" aria-pressed="true">隐藏</button>
                    </div>
                    <div id="light-statistics-icon-picker" class="inspector-picker navigation-icon-picker"><span
                            class="inspector-picker-title">选择 MDI 图标</span>
                        <div class="navigation-icon-field-row"><button id="light-statistics-icon-button"
                                class="inspector-picker-button navigation-icon-button" type="button"
                                aria-haspopup="listbox" aria-expanded="false"><i
                                    aria-hidden="true"></i><span>mdi:lightbulb-group-outline</span></button><button
                                id="light-statistics-icon-copy" class="navigation-icon-copy" type="button"
                                title="复制图标名称" aria-label="复制图标名称"><svg viewBox="0 0 16 16" aria-hidden="true">
                                    <rect x="5" y="5" width="8" height="8" rx="1.3"></rect>
                                    <path
                                        d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9A1.5 1.5 0 0 0 3.5 10.5H5">
                                    </path>
                                </svg><span aria-hidden="true">✓</span></button></div>
                        <div id="light-statistics-icon-menu" class="inspector-picker-menu" hidden><input
                                id="light-statistics-icon-search" type="search" placeholder="搜索 MDI 图标"
                                autocomplete="off">
                            <div id="light-statistics-icon-options" class="navigation-icon-options" role="listbox">
                            </div>
                        </div>
                    </div>
                    <div class="inspector-grid two-columns"><label>关闭颜色<input id="light-statistics-icon-color"
                                type="color"></label><label>开启颜色<input id="light-statistics-icon-active-color"
                                type="color"></label><label>大小<input id="light-statistics-icon-size" type="number"
                                min="8" max="100" step="1"></label></div>
                </section>
                <section class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>文字</h3><button id="light-statistics-title-visible"
                            class="inspector-visibility-toggle compact" type="button" aria-pressed="true">隐藏</button>
                    </div>
                    <div class="inspector-grid two-columns"><label>颜色<input id="light-statistics-title-color"
                                type="color"></label><label>大小<input id="light-statistics-title-size" type="number"
                                min="8" max="100" step="1"></label><label>粗细<input id="light-statistics-title-weight"
                                type="number" min="0" max="1" step="0.01"></label><label>字间距<input
                                id="light-statistics-title-spacing" type="number" min="-20" max="100"
                                step="0.1"></label></div>
                </section>
                <section class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>数字</h3><button id="light-statistics-count-visible"
                            class="inspector-visibility-toggle compact" type="button" aria-pressed="true">隐藏</button>
                    </div>
                    <div class="inspector-grid two-columns"><label>关闭颜色<input id="light-statistics-count-color"
                                type="color"></label><label>开启颜色<input id="light-statistics-count-active-color"
                                type="color"></label><label>大小<input id="light-statistics-count-size" type="number"
                                min="8" max="140" step="1"></label><label>粗细<input id="light-statistics-count-weight"
                                type="number" min="0" max="1" step="0.01"></label><label>字间距<input
                                id="light-statistics-count-spacing" type="number" min="-20" max="100"
                                step="0.1"></label></div>
                </section>
                <section class="inspector-section">
                    <h3>布局与间距</h3>
                    <div class="inspector-grid two-columns"><label>图标与文字（%）<input id="light-statistics-icon-gap"
                                type="number" min="0" max="40" step="0.1"></label><label>文字与数字（%）<input
                                id="light-statistics-count-gap" type="number" min="0" max="40" step="0.1"></label></div>
                </section>
                <section class="inspector-section">
                    <h3>位置</h3>
                    <div class="inspector-grid two-columns"><label>左侧（%）<input id="light-statistics-left" type="number"
                                min="0" max="100" step="0.1"></label><label>顶部（%）<input id="light-statistics-top"
                                type="number" min="0" max="100" step="0.1"></label></div>
                </section>
                <section class="inspector-section">
                    <h3>尺寸与变换</h3>
                    <div class="inspector-grid two-columns"><label>宽度（%）<input id="light-statistics-width" type="number"
                                min="0.1" max="100" step="0.1"></label><label>高度（%）<input id="light-statistics-height"
                                type="number" min="0.1" max="100" step="0.1"></label><label>缩放（%）<input
                                id="light-statistics-scale" type="number" min="1" max="500"
                                step="0.1"></label><label>旋转（°）<input id="light-statistics-rotation" type="number"
                                min="-360" max="360" step="0.1"></label></div>
                </section>
                <section class="inspector-section">
                    <h3>点击动作（可选）</h3>
                    <p class="inspector-section-note">
                        切换和“当前实体”弹窗作用于单独绑定的动作实体；其它实体弹窗、组合弹窗和跳转页面不需要绑定动作实体。动作实体不参与数量统计，也不改变控件的颜色和数字。</p>
                    <div id="light-statistics-action-entity-picker" class="inspector-picker"><span
                            class="inspector-picker-title">动作实体</span><button id="light-statistics-action-entity-button"
                            class="inspector-picker-button" type="button" aria-haspopup="listbox"
                            aria-expanded="false">不使用实体</button>
                        <div id="light-statistics-action-entity-menu" class="inspector-picker-menu" hidden><input
                                id="light-statistics-action-entity-search" type="search" placeholder="搜索实体名称或 ID"
                                autocomplete="off">
                            <div id="light-statistics-action-entity-options" class="inspector-entity-options"
                                role="listbox"></div>
                        </div>
                    </div>
                    <p id="light-statistics-action-note" class="inspector-section-note">未绑定动作实体时仍可使用其它实体弹窗、组合弹窗和跳转页面。
                    </p>
                    <div id="light-statistics-action-controls" class="component-action-controls">
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
            </form>

            <form id="time-inspector" class="inspector-form" hidden>
                <section class="inspector-section">
                    <h3>基础</h3>
                    <div class="inspector-grid two-columns"> <label>类型<input id="time-type" value="时间"
                                readonly></label> <label>备注<input id="time-label" maxlength="128"></label>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>时间格式</h3>
                    <div class="time-format-options">
                        <div class="navigation-property-control"> <span>小时制</span>
                            <div id="time-hour-format" class="navigation-segmented-options" role="group"
                                aria-label="时间小时制"> <button type="button" data-time-hour-format="24">24 小时</button>
                                <button type="button" data-time-hour-format="12">12 小时</button> </div>
                        </div>
                        <div class="navigation-property-control"> <span>秒钟</span>
                            <div id="time-seconds" class="navigation-segmented-options" role="group"
                                aria-label="是否显示秒钟"> <button type="button" data-time-seconds="off">不显示</button> <button
                                    type="button" data-time-seconds="on">显示</button> </div>
                        </div>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>文字</h3>
                    <div class="inspector-grid two-columns"> <label>颜色<input id="time-color" type="color"></label>
                        <label>字体大小<input id="time-font-size" type="number" min="12" max="500" step="1"></label>
                        <label>字体粗细<input id="time-font-weight" type="number" min="0" max="1" step="0.01"></label>
                        <label>字间距<input id="time-letter-spacing" type="number" min="-20" max="100" step="0.1"></label>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>透明度</h3>
                    <div class="inspector-grid two-columns"> <label>整体透明度（%）<input id="time-opacity" type="number"
                                min="0" max="100" step="1"></label> </div>
                </section>
                <section class="inspector-section">
                    <h3>位置</h3>
                    <div class="inspector-grid two-columns"> <label>左侧（%）<input id="time-left" type="number" min="0"
                                max="100" step="0.1"></label> <label>顶部（%）<input id="time-top" type="number" min="0"
                                max="100" step="0.1"></label> </div>
                </section>
                <section class="inspector-section">
                    <h3>变换</h3>
                    <div class="inspector-grid two-columns"> <label>缩放（%）<input id="time-scale" type="number" min="1"
                                max="500" step="0.1"></label> <label>旋转（°）<input id="time-rotation" type="number"
                                min="-360" max="360" step="0.1"></label> </div>
                </section>
            </form>

            <form id="date-inspector" class="inspector-form" hidden>
                <section class="inspector-section">
                    <h3>基础</h3>
                    <div class="inspector-grid two-columns"> <label>类型<input id="date-type" value="日期"
                                readonly></label> <label>备注<input id="date-label" maxlength="128"></label>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>显示内容</h3>
                    <div class="date-display-options">
                        <div class="navigation-property-control"> <span>星期</span>
                            <div id="date-weekday" class="navigation-segmented-options" role="group"
                                aria-label="是否显示星期"> <button type="button" data-date-weekday="off">不显示</button> <button
                                    type="button" data-date-weekday="on">显示</button> </div>
                        </div>
                        <div class="navigation-property-control"> <span>农历</span>
                            <div id="date-lunar" class="navigation-segmented-options" role="group" aria-label="是否显示农历">
                                <button type="button" data-date-lunar="off">不显示</button> <button type="button"
                                    data-date-lunar="on">显示</button> </div>
                        </div>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>年月日与星期</h3>
                    <div class="inspector-grid two-columns"> <label>颜色<input id="date-primary-color"
                                type="color"></label> <label>字体大小<input id="date-primary-size" type="number" min="12"
                                max="500" step="1"></label> <label>字体粗细<input id="date-primary-weight" type="number"
                                min="0" max="1" step="0.01"></label> <label>阳历字间距<input id="date-primary-spacing"
                                type="number" min="-20" max="100" step="0.1"></label> </div>
                </section>
                <section class="inspector-section">
                    <h3>农历</h3>
                    <div class="inspector-grid two-columns"> <label>颜色<input id="date-lunar-color" type="color"></label>
                        <label>字体大小<input id="date-lunar-size" type="number" min="10" max="500" step="1"></label>
                        <label>字体粗细<input id="date-lunar-weight" type="number" min="0" max="1" step="0.01"></label>
                        <label>农历字间距<input id="date-lunar-spacing" type="number" min="-20" max="100" step="0.1"></label>
                        <label>行间距<input id="date-line-gap" type="number" min="0" max="200" step="1"></label> </div>
                </section>
                <section class="inspector-section">
                    <h3>透明度</h3>
                    <div class="inspector-grid two-columns"> <label>整体透明度（%）<input id="date-opacity" type="number"
                                min="0" max="100" step="1"></label> </div>
                </section>
                <section class="inspector-section">
                    <h3>位置</h3>
                    <div class="inspector-grid two-columns"> <label>左侧（%）<input id="date-left" type="number" min="0"
                                max="100" step="0.1"></label> <label>顶部（%）<input id="date-top" type="number" min="0"
                                max="100" step="0.1"></label> </div>
                </section>
                <section class="inspector-section">
                    <h3>变换</h3>
                    <div class="inspector-grid two-columns"> <label>缩放（%）<input id="date-scale" type="number" min="1"
                                max="500" step="0.1"></label> <label>旋转（°）<input id="date-rotation" type="number"
                                min="-360" max="360" step="0.1"></label> </div>
                </section>
            </form>

            <form id="weather-inspector" class="inspector-form" hidden>
                <section class="inspector-section">
                    <h3>基础</h3>
                    <div class="inspector-grid two-columns"> <label>类型<input id="weather-type" value="天气"
                                readonly></label> <label>备注<input id="weather-label" maxlength="128"></label>
                    </div>
                    <div id="weather-entity-picker" class="inspector-picker"> <span
                            class="inspector-picker-title">天气实体</span> <button id="weather-entity-button"
                            class="inspector-picker-button" type="button" aria-haspopup="listbox"
                            aria-expanded="false">不使用实体</button>
                        <div id="weather-entity-menu" class="inspector-picker-menu" hidden> <input
                                id="weather-entity-search" type="search" placeholder="搜索实体名称或 ID" autocomplete="off">
                            <div id="weather-entity-options" class="inspector-entity-options" role="listbox"></div>
                        </div>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>显示内容</h3>
                    <div class="date-display-options">
                        <div class="navigation-property-control"> <span>天气图标</span>
                            <div id="weather-icon-visible" class="navigation-segmented-options" role="group"
                                aria-label="是否显示天气图标"> <button type="button"
                                    data-weather-icon-visible="off">不显示</button> <button type="button"
                                    data-weather-icon-visible="on">显示</button> </div>
                        </div>
                        <div class="navigation-property-control"> <span>温度</span>
                            <div id="weather-temperature-visible" class="navigation-segmented-options" role="group"
                                aria-label="是否显示温度"> <button type="button"
                                    data-weather-temperature-visible="off">不显示</button> <button type="button"
                                    data-weather-temperature-visible="on">显示</button> </div>
                        </div>
                    </div>
                    <div class="date-display-options">
                        <div class="navigation-property-control"> <span>天气状态</span>
                            <div id="weather-condition-visible" class="navigation-segmented-options" role="group"
                                aria-label="是否显示天气状态"> <button type="button"
                                    data-weather-condition-visible="off">不显示</button> <button type="button"
                                    data-weather-condition-visible="on">显示</button> </div>
                        </div>
                        <div class="navigation-property-control"> <span>湿度</span>
                            <div id="weather-humidity-visible" class="navigation-segmented-options" role="group"
                                aria-label="是否显示湿度"> <button type="button"
                                    data-weather-humidity-visible="off">不显示</button> <button type="button"
                                    data-weather-humidity-visible="on">显示</button> </div>
                        </div>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>图标</h3>
                    <div class="inspector-grid two-columns"> <label>图标大小<input id="weather-icon-size" type="number"
                                min="12" max="500" step="1"></label> <label>图标文字间距<input id="weather-icon-gap"
                                type="number" min="0" max="300" step="1"></label> </div>
                </section>
                <section class="inspector-section">
                    <h3>温度</h3>
                    <div class="inspector-grid two-columns"> <label>颜色<input id="weather-temperature-color"
                                type="color"></label> <label>字体大小<input id="weather-temperature-size" type="number"
                                min="12" max="500" step="1"></label> <label>字体粗细<input id="weather-temperature-weight"
                                type="number" min="0" max="1" step="0.01"></label> <label>字间距<input
                                id="weather-temperature-spacing" type="number" min="-20" max="100" step="0.1"></label>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>天气状态与湿度</h3>
                    <div class="inspector-grid two-columns"> <label>颜色<input id="weather-secondary-color"
                                type="color"></label> <label>字体大小<input id="weather-secondary-size" type="number"
                                min="10" max="500" step="1"></label> <label>字体粗细<input id="weather-secondary-weight"
                                type="number" min="0" max="1" step="0.01"></label> <label>字间距<input
                                id="weather-secondary-spacing" type="number" min="-20" max="100" step="0.1"></label>
                        <label>行间距<input id="weather-line-gap" type="number" min="0" max="200" step="1"></label> </div>
                </section>
                <section class="inspector-section">
                    <h3>透明度</h3>
                    <div class="inspector-grid two-columns"> <label>整体透明度（%）<input id="weather-opacity" type="number"
                                min="0" max="100" step="1"></label> </div>
                </section>
                <section class="inspector-section">
                    <h3>位置</h3>
                    <div class="inspector-grid two-columns"> <label>左侧（%）<input id="weather-left" type="number" min="0"
                                max="100" step="0.1"></label> <label>顶部（%）<input id="weather-top" type="number" min="0"
                                max="100" step="0.1"></label> </div>
                </section>
                <section class="inspector-section">
                    <h3>变换</h3>
                    <div class="inspector-grid two-columns"> <label>缩放（%）<input id="weather-scale" type="number" min="1"
                                max="500" step="0.1"></label> <label>旋转（°）<input id="weather-rotation" type="number"
                                min="-360" max="360" step="0.1"></label> </div>
                </section>
            </form>

            <form id="line-chart-inspector" class="inspector-form" hidden>
                <section class="inspector-section">
                    <h3>基础</h3>
                    <div class="inspector-grid two-columns"> <label>类型<input id="line-chart-type" value="折线图"
                                readonly></label> <label>备注<input id="line-chart-label"
                                maxlength="128"></label> </div>
                    <div id="line-chart-entity-picker" class="inspector-picker"> <span
                            class="inspector-picker-title">数值实体</span> <button id="line-chart-entity-button"
                            class="inspector-picker-button" type="button" aria-haspopup="listbox"
                            aria-expanded="false">不使用实体</button>
                        <div id="line-chart-entity-menu" class="inspector-picker-menu" hidden> <input
                                id="line-chart-entity-search" type="search" placeholder="搜索实体名称或 ID" autocomplete="off">
                            <div id="line-chart-entity-options" class="inspector-entity-options" role="listbox"></div>
                        </div>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>内容</h3>
                    <div class="inspector-grid two-columns">
                        <div class="navigation-property-control"> <span>当前数值</span>
                            <div id="line-chart-value-visible" class="navigation-segmented-options" role="group"
                                aria-label="是否显示当前数值"> <button type="button"
                                    data-line-chart-value-visible="off">不显示</button> <button type="button"
                                    data-line-chart-value-visible="on">显示</button> </div>
                        </div> <label>圆角大小（%）<input id="line-chart-curve-radius" type="number" min="0" max="50"
                                step="0.5"></label>
                    </div>
                    <div class="inspector-grid two-columns"> <label>文字大小（%）<input id="line-chart-value-scale"
                                type="number" min="10" max="500" step="1"></label> <label>文字颜色<input
                                id="line-chart-value-color" type="color"></label> <label>数值小数位<select
                                id="line-chart-state-precision">
                                <option value="auto">自动</option>
                                <option value="0">0 位</option>
                                <option value="1">1 位</option>
                                <option value="2">2 位</option>
                                <option value="3">3 位</option>
                                <option value="4">4 位</option>
                            </select></label> <label>X 偏移（%）<input id="line-chart-value-offset-x" type="number"
                                min="-100" max="100" step="0.1"></label> <label>Y 偏移（%）<input
                                id="line-chart-value-offset-y" type="number" min="-100" max="100" step="0.1"></label>
                        <label>刷新间隔（秒）<input id="line-chart-update-interval" type="number" min="30" max="86400"
                                step="1"></label> <label>历史范围（小时）<input id="line-chart-hours" type="number" min="1"
                                max="168" step="1"></label> </div>
                </section>
                <section class="inspector-section">
                    <h3>折线颜色</h3>
                    <div class="line-chart-threshold-mode-row"> <label>阈值模式<select id="line-chart-threshold-mode">
                                <option value="auto">自动（按历史范围）</option>
                                <option value="manual">手动设置</option>
                            </select></label>
                        <p class="inspector-help">自动模式按当前实体的历史数值范围分色；手动模式可按实体单位自行填写。</p>
                    </div>
                    <div class="line-chart-thresholds">
                        <div><label>阈值 1<input id="line-chart-threshold-1-value" type="number"
                                    step="any"></label><label>颜色<input id="line-chart-threshold-1-color"
                                    type="color"></label></div>
                        <div><label>阈值 2<input id="line-chart-threshold-2-value" type="number"
                                    step="any"></label><label>颜色<input id="line-chart-threshold-2-color"
                                    type="color"></label></div>
                        <div><label>阈值 3<input id="line-chart-threshold-3-value" type="number"
                                    step="any"></label><label>颜色<input id="line-chart-threshold-3-color"
                                    type="color"></label></div>
                        <div><label>阈值 4<input id="line-chart-threshold-4-value" type="number"
                                    step="any"></label><label>颜色<input id="line-chart-threshold-4-color"
                                    type="color"></label></div>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>位置</h3>
                    <div class="inspector-grid two-columns"> <label>左侧（%）<input id="line-chart-left" type="number"
                                min="0" max="100" step="0.1"></label> <label>顶部（%）<input id="line-chart-top"
                                type="number" min="0" max="100" step="0.1"></label> </div>
                </section>
                <section class="inspector-section">
                    <h3>尺寸与变换</h3>
                    <div class="inspector-grid two-columns"> <label>宽度（%）<input id="line-chart-width" type="number"
                                min="0.1" max="100" step="0.1"></label> <label>高度（%）<input id="line-chart-height"
                                type="number" min="0.1" max="100" step="0.1"></label> <label>缩放（%）<input
                                id="line-chart-scale" type="number" min="1" max="500" step="0.1"></label>
                        <label>旋转（°）<input id="line-chart-rotation" type="number" min="-360" max="360"
                                step="0.1"></label> </div>
                </section>
                <section class="inspector-section">
                    <h3>动作</h3>
                    <div id="line-chart-action-controls" class="component-action-controls">
                        <div class="component-action-control" data-action-trigger="tap"><span>点按</span>
                            <div class="component-action-options" role="group" aria-label="点按动作"><button type="button"
                                    data-action-type="none">无动作</button><button type="button"
                                    data-action-type="toggle">切换</button><button type="button"
                                    data-action-type="more-info">显示详情</button><button type="button"
                                    data-action-type="navigate">跳转页面</button></div><label
                                class="component-action-target" hidden><span>跳转到</span><select data-action-target
                                    aria-label="点按跳转页面"></select></label>
                        </div>
                        <div class="component-action-control" data-action-trigger="doubleTap"><span>双击</span>
                            <div class="component-action-options" role="group" aria-label="双击动作"><button type="button"
                                    data-action-type="none">无动作</button><button type="button"
                                    data-action-type="toggle">切换</button><button type="button"
                                    data-action-type="more-info">显示详情</button><button type="button"
                                    data-action-type="navigate">跳转页面</button></div><label
                                class="component-action-target" hidden><span>跳转到</span><select data-action-target
                                    aria-label="双击跳转页面"></select></label>
                        </div>
                        <div class="component-action-control" data-action-trigger="hold"><span>长按</span>
                            <div class="component-action-options" role="group" aria-label="长按动作"><button type="button"
                                    data-action-type="none">无动作</button><button type="button"
                                    data-action-type="toggle">切换</button><button type="button"
                                    data-action-type="more-info">显示详情</button><button type="button"
                                    data-action-type="navigate">跳转页面</button></div><label
                                class="component-action-target" hidden><span>跳转到</span><select data-action-target
                                    aria-label="长按跳转页面"></select></label>
                        </div>
                    </div>
                </section>
                <section class="inspector-section navigation-batch-section">
                    <h3>批量应用 <span id="line-chart-apply-count">0 项修改</span></h3> <button id="line-chart-apply-style"
                        type="button">一键应用到同类型控件</button>
                </section>
            </form>

            <form id="event-log-wall-inspector" class="inspector-form" hidden>
                <section class="inspector-section">
                    <h3>基础</h3>
                    <div class="inspector-grid two-columns">
                        <label>类型<input id="event-log-wall-type" value="即时消息墙"
                                readonly></label>
                        <label>备注<input id="event-log-wall-label" maxlength="128"></label>
                    </div>
                    <div class="inspector-grid two-columns">
                        <div class="navigation-property-control">
                            <span>启用</span>
                            <div id="event-log-wall-enabled" class="navigation-segmented-options" role="group"
                                aria-label="是否启用消息墙">
                                <button type="button" data-event-log-wall-enabled="on">启用</button>
                                <button type="button" data-event-log-wall-enabled="off">停用</button>
                            </div>
                        </div>
                        <label>条目点击<select id="event-log-wall-click-mode">
                                <option value="details">打开设备详情</option>
                                <option value="none">无动作</option>
                            </select></label>
                    </div>
                    <div class="inspector-grid two-columns">
                        <label>条目上限<input id="event-log-wall-max-entries" type="number" min="1" max="200"
                                step="1"></label>
                        <label>停留时长（秒）<input id="event-log-wall-display-duration" type="number" min="1"
                                max="120" step="1"></label>
                    </div>
                    <p class="inspector-section-note">设备状态变化时面板自动出现，停留时长内没有新事件会淡出；隐藏期间已记录的事件仍会保留。</p>
                </section>
                <section class="inspector-section">
                    <h3>监听范围</h3>
                    <label>范围<select id="event-log-wall-watch-scope">
                            <option value="auto">自动（全部控制类设备）</option>
                            <option value="manual">手动指定实体</option>
                        </select></label>
                    <p class="inspector-section-note">自动模式订阅灯光、开关、窗帘、空调等控制类设备（最多 400 个）；切换到手动后仅监听下方实体。</p>
                    <label>实体 ID（每行一个）<textarea id="event-log-wall-entity-ids" rows="3"
                            placeholder="light.living_room&#10;switch.air_purifier"></textarea></label>
                </section>
                <section class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>标题</h3><button id="event-log-wall-title-visible"
                            class="inspector-visibility-toggle compact" type="button"
                            aria-pressed="false">显示</button>
                    </div>
                    <div class="inspector-grid two-columns">
                        <label>内容<input id="event-log-wall-title" maxlength="64"
                                placeholder="即时消息墙"></label>
                        <label>大小（%）<input id="event-log-wall-title-size" type="number" min="40" max="300"
                                step="1"></label>
                    </div>
                    <div class="inspector-grid two-columns">
                        <label>颜色<input id="event-log-wall-title-color" type="color"></label>
                        <div class="navigation-property-control">
                            <span>对齐</span>
                            <div id="event-log-wall-title-align"
                                class="navigation-segmented-options three-columns" role="group"
                                aria-label="标题对齐方式">
                                <button type="button" data-event-log-wall-title-align="left">左</button>
                                <button type="button" data-event-log-wall-title-align="center">中</button>
                                <button type="button" data-event-log-wall-title-align="right">右</button>
                            </div>
                        </div>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>外观</h3>
                    <div class="inspector-grid two-columns">
                        <label>字号（%）<input id="event-log-wall-font-size" type="number" min="8" max="200"
                                step="1"></label>
                        <label>圆角<input id="event-log-wall-radius" type="number" min="0" max="50"
                                step="1"></label>
                        <label>背景不透明度<input id="event-log-wall-bg-opacity" type="number" min="0" max="1"
                                step="0.05"></label>
                        <label>毛玻璃模糊<input id="event-log-wall-blur" type="number" min="0" max="40"
                                step="1"></label>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>状态配色</h3>
                    <div class="inspector-grid three-columns">
                        <label>开启<input id="event-log-wall-on-color" type="color"></label>
                        <label>关闭<input id="event-log-wall-off-color" type="color"></label>
                        <label>属性变化<input id="event-log-wall-attr-color" type="color"></label>
                        <label>空调<input id="event-log-wall-climate-color" type="color"></label>
                        <label>警示<input id="event-log-wall-alert-color" type="color"></label>
                        <label>其它<input id="event-log-wall-muted-color" type="color"></label>
                    </div>
                    <p class="inspector-section-note">按事件类型着色：开启/关闭、属性变化（如“目标温度 26°C → 28°C”）、空调模式与异常状态。</p>
                </section>
                <section class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>底部提示</h3><button id="event-log-wall-show-footer"
                            class="inspector-visibility-toggle compact" type="button"
                            aria-pressed="false">显示</button>
                    </div>
                    <label>文案<input id="event-log-wall-footer-text" maxlength="64"
                            placeholder="查看全部事件历史"></label>
                </section>
            </form>
</template>
