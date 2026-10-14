<script setup lang="ts">
/**
 * 媒体类检查器（图片 / 摄像头）。
 *
 * 从 `entries/EditorView.vue` 模板整段切出（`ops/studio/studio_template_seam.mjs`）。
 * 这些段落是**引擎命令式填充的静态 DOM 契约**（`getElementById` / `querySelector`），
 * 零 Vue 指令，故无需 props / emits；用多根模板渲染，DOM 结构与切片前一致（不新增包裹元素）。
 *
 * 改动约束：元素 id 属于对外契约，重命名/删除必须同步 `app/editor/**` 里的取值方。
 */
</script>

<template>
            <form id="image-inspector" class="inspector-form" hidden>
                <section class="inspector-section">
                    <h3>基础</h3>
                    <div class="inspector-grid two-columns"> <label>类型<input id="image-type" value="图片"
                                readonly></label> <label>备注<input id="image-label" maxlength="128"></label>
                    </div>
                    <div id="image-entity-picker" class="inspector-picker"> <span
                            class="inspector-picker-title">关联实体（可选）</span> <button id="image-entity-button"
                            class="inspector-picker-button" type="button" aria-haspopup="listbox"
                            aria-expanded="false">不使用实体</button>
                        <div id="image-entity-menu" class="inspector-picker-menu" hidden> <input
                                id="image-entity-search" type="search" placeholder="搜索实体名称或 ID" autocomplete="off">
                            <div id="image-entity-options" class="inspector-entity-options" role="listbox"></div>
                        </div>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>内容</h3>
                    <div id="image-asset-picker" class="inspector-picker inspector-image-picker"> <span
                            class="inspector-picker-title">选择控件图片</span> <button id="image-asset-button"
                            class="inspector-picker-button" type="button" aria-haspopup="listbox"
                            aria-expanded="false">选择图片</button>
                        <div id="image-asset-menu" class="inspector-picker-menu" hidden>
                            <div class="asset-picker-toolbar">
                                <div class="asset-source-tabs" role="tablist" aria-label="图片来源"><button type="button"
                                        data-image-asset-source="user">我的图片</button><button type="button"
                                        data-image-asset-source="builtin">HomeOS素材</button></div><button
                                    id="image-asset-upload" class="asset-upload-button" type="button">上传</button><input
                                    id="image-asset-upload-input" type="file"
                                    accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple hidden>
                            </div>
                            <p id="image-asset-upload-hint" class="asset-upload-hint" hidden>位图不限制文件大小；SVG 最大 5
                                MB。过大图片会增加加载时间，并可能导致中控操作卡顿。</p> <select id="image-asset-folder"
                                aria-label="选择图片文件夹"></select> <input id="image-asset-search" type="search"
                                placeholder="搜索图片名称" autocomplete="off">
                            <div id="image-asset-options" class="inspector-asset-options" role="listbox"></div>
                        </div>
                    </div>
                    <div class="inspector-grid two-columns image-content-options"> <label>透明度（%）<input
                                id="image-opacity" type="number" min="0" max="100" step="1"></label>
                        <div class="image-layout-control"> <span>图片布局</span>
                            <div id="image-layout-options" class="image-layout-options" role="group" aria-label="图片布局">
                                <button type="button" data-image-layout="free">自由</button> <button type="button"
                                    data-image-layout="fill">铺满</button> </div>
                        </div>
                    </div>
                </section>
                <section class="inspector-section">
                    <h3>位置</h3>
                    <div class="inspector-grid two-columns"> <label>左侧（%）<input id="image-left" type="number" min="0"
                                max="100" step="0.1"></label> <label>顶部（%）<input id="image-top" type="number" min="0"
                                max="100" step="0.1"></label> </div>
                </section>
                <section class="inspector-section">
                    <h3>尺寸与变换</h3>
                    <div class="inspector-grid two-columns"> <label>缩放（%）<input id="image-scale" type="number" min="1"
                                max="500" step="0.1"></label> <label>旋转（°）<input id="image-rotation" type="number"
                                min="-360" max="360" step="0.1"></label> </div>
                </section>
                <section class="inspector-section">
                    <h3>动作</h3>
                    <div id="component-action-controls" class="component-action-controls">
                        <div class="component-action-control" data-action-trigger="tap"> <span>点按</span>
                            <div class="component-action-options" role="group" aria-label="点按动作"> <button type="button"
                                    data-action-type="none">无动作</button> <button type="button"
                                    data-action-type="toggle">切换</button> <button type="button"
                                    data-action-type="more-info">显示详情</button> <button type="button"
                                    data-action-type="navigate">跳转页面</button> </div> <label
                                class="component-action-target" hidden><span>跳转到</span><select data-action-target
                                    aria-label="点按跳转页面"></select></label>
                        </div>
                        <div class="component-action-control" data-action-trigger="doubleTap"> <span>双击</span>
                            <div class="component-action-options" role="group" aria-label="双击动作"> <button type="button"
                                    data-action-type="none">无动作</button> <button type="button"
                                    data-action-type="toggle">切换</button> <button type="button"
                                    data-action-type="more-info">显示详情</button> <button type="button"
                                    data-action-type="navigate">跳转页面</button> </div> <label
                                class="component-action-target" hidden><span>跳转到</span><select data-action-target
                                    aria-label="双击跳转页面"></select></label>
                        </div>
                        <div class="component-action-control" data-action-trigger="hold"> <span>长按</span>
                            <div class="component-action-options" role="group" aria-label="长按动作"> <button type="button"
                                    data-action-type="none">无动作</button> <button type="button"
                                    data-action-type="toggle">切换</button> <button type="button"
                                    data-action-type="more-info">显示详情</button> <button type="button"
                                    data-action-type="navigate">跳转页面</button> </div> <label
                                class="component-action-target" hidden><span>跳转到</span><select data-action-target
                                    aria-label="长按跳转页面"></select></label>
                        </div>
                    </div>
                </section>
            </form>

            <form id="camera-inspector" class="inspector-form" hidden>
                <section class="inspector-section">
                    <h3>基础</h3>
                    <div class="inspector-grid two-columns"><label>类型<input id="camera-type" value="摄像头实时预览"
                                readonly></label><label>备注<input id="camera-label" maxlength="128"></label>
                    </div>
                    <div class="navigation-property-control"><span>摄像头来源</span>
                        <div id="camera-source-options" class="navigation-segmented-options" role="group"
                            aria-label="摄像头来源"><button type="button"
                                data-camera-source="entity">HA 实体</button><button type="button"
                                data-camera-source="go2rtc">go2rtc</button></div>
                    </div>
                    <div id="camera-entity-picker" class="inspector-picker"><span
                            class="inspector-picker-title">摄像头实体</span><button id="camera-entity-button"
                            class="inspector-picker-button" type="button" aria-haspopup="listbox"
                            aria-expanded="false">不使用实体</button>
                        <div id="camera-entity-menu" class="inspector-picker-menu" hidden><input
                                id="camera-entity-search" type="search" placeholder="搜索实体名称或 ID" autocomplete="off">
                            <div id="camera-entity-options" class="inspector-entity-options" role="listbox"></div>
                        </div>
                    </div>
                    <label id="camera-go2rtc-url-field" hidden>go2rtc 网页播放地址<input id="camera-go2rtc-url" type="url"
                            maxlength="512" aria-label="go2rtc 网页播放地址"
                            placeholder="http://192.168.1.100:1984/stream.html?src=camera1"></label>
                    <p id="camera-go2rtc-note" class="inspector-section-note" hidden>请填写 go2rtc 的 stream.html
                        网页播放地址。将示例 IP 换成 go2rtc 所在设备的局域网 IP，camera1 换成 go2rtc 中配置的流名称。视频经 HA Bridge
                        中转，保存仪表盘后播放。</p>
                </section>
                <section class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>画面</h3><button id="camera-media-visible" class="inspector-visibility-toggle compact"
                            type="button" aria-pressed="true">显示</button>
                    </div>
                    <div class="navigation-property-control"><span>显示方式</span>
                        <div id="camera-display-mode-options" class="navigation-segmented-options" role="group"
                            aria-label="摄像头显示方式"><button type="button"
                                data-camera-display-mode="live">实时</button><button type="button"
                                data-camera-display-mode="snapshot">快照</button></div>
                    </div> <label id="camera-refresh-interval-field">快照更新时间（秒）<input id="camera-refresh-interval"
                            type="number" min="6" step="1" inputmode="numeric"></label>
                    <div class="navigation-property-control"><span>画面比例</span>
                        <div id="camera-fit-options" class="navigation-segmented-options" role="group"
                            aria-label="摄像头弹窗画面比例"><button type="button" data-camera-fit="contain">原始比例</button><button
                                type="button" data-camera-fit="fill">压缩 16:9</button></div>
                    </div>
                </section>
                <section class="inspector-section">
                    <div class="navigation-property-heading section-heading">
                        <h3>外框</h3><button id="camera-frame-visible" class="inspector-visibility-toggle compact"
                            type="button" aria-pressed="true">显示</button>
                    </div>
                    <div class="inspector-grid two-columns"><label>颜色<input id="camera-frame-color"
                                type="color"></label><label>粗细<input id="camera-frame-width" type="number" min="0"
                                max="20" step="0.1"></label><label>圆角大小（%）<input id="camera-radius" type="number"
                                min="0" max="50" step="0.5"></label><label>渐变角度（°）<input id="camera-frame-angle"
                                type="number" min="0" max="360" step="1"></label><label>透明度（%）<input
                                id="camera-frame-opacity" type="number" min="0" max="100" step="1"></label></div>
                </section>
                <section class="inspector-section">
                    <h3>位置</h3>
                    <div class="inspector-grid two-columns"><label>左侧（%）<input id="camera-left" type="number" min="0"
                                max="100" step="0.1"></label><label>顶部（%）<input id="camera-top" type="number" min="0"
                                max="100" step="0.1"></label></div>
                </section>
                <section class="inspector-section">
                    <h3>尺寸与变换</h3>
                    <div class="inspector-grid two-columns"><label>宽度（%）<input id="camera-width" type="number" min="0.1"
                                max="100" step="0.1"></label><label>高度（%）<input id="camera-height" type="number"
                                min="0.1" max="100" step="0.1"></label><label>缩放（%）<input id="camera-scale"
                                type="number" min="1" max="500" step="0.1"></label><label>旋转（°）<input
                                id="camera-rotation" type="number" min="-360" max="360" step="0.1"></label></div>
                </section>
                <section class="inspector-section">
                    <h3>动作</h3>
                    <div id="camera-action-controls" class="component-action-controls">
                        <div class="component-action-control" data-action-trigger="tap"><span>点按</span>
                            <div class="component-action-options" role="group"><button type="button"
                                    data-action-type="none">无动作</button><button type="button"
                                    data-action-type="toggle">切换</button><button type="button"
                                    data-action-type="more-info">打开弹窗</button><button type="button"
                                    data-action-type="navigate">跳转页面</button></div><label
                                class="component-action-target" hidden><span>跳转到</span><select
                                    data-action-target></select></label>
                        </div>
                        <div class="component-action-control" data-action-trigger="doubleTap"><span>双击</span>
                            <div class="component-action-options" role="group"><button type="button"
                                    data-action-type="none">无动作</button><button type="button"
                                    data-action-type="toggle">切换</button><button type="button"
                                    data-action-type="more-info">打开弹窗</button><button type="button"
                                    data-action-type="navigate">跳转页面</button></div><label
                                class="component-action-target" hidden><span>跳转到</span><select
                                    data-action-target></select></label>
                        </div>
                        <div class="component-action-control" data-action-trigger="hold"><span>长按</span>
                            <div class="component-action-options" role="group"><button type="button"
                                    data-action-type="none">无动作</button><button type="button"
                                    data-action-type="toggle">切换</button><button type="button"
                                    data-action-type="more-info">打开弹窗</button><button type="button"
                                    data-action-type="navigate">跳转页面</button></div><label
                                class="component-action-target" hidden><span>跳转到</span><select
                                    data-action-target></select></label>
                        </div>
                    </div>
                </section>
                <section class="inspector-section navigation-batch-section">
                    <h3>批量应用 <span id="camera-apply-count">0 项修改</span></h3><button id="camera-apply-style"
                        type="button">一键应用到同类型控件</button>
                </section>
            </form>
</template>
