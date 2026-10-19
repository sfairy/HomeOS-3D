<script setup lang="ts">
/**
 * creator 对话框壳（缩放 / 灯组 / 楼层 / 导出预设 / 材质 / 导出流程 / 退出与保存冲突）。
 *
 * 从 `entries/StudioView.vue` 模板整段切出（`ops/studio/studio_template_seam.mjs`）。
 * 这些段落是**引擎命令式填充的静态 DOM 契约**（`getElementById` / `querySelector`），
 * 零 Vue 指令，故无需 props / emits；用多根模板渲染，DOM 结构与切片前一致（不新增包裹元素）。
 *
 * 改动约束：元素 id 属于对外契约，重命名/删除必须同步 `app/editor/**` 里的取值方。
 */
</script>

<template>
    <dialog id="scale-dialog" class="scale-dialog">
        <form id="scale-form" method="dialog"> <button id="scale-close" class="dialog-close" type="button"
                aria-label="关闭">×</button> <span class="dialog-index">02 · SCALE REFERENCE</span>
            <h2>这条参考线实际有多长？</h2>
            <p>请填写图纸上这段距离的真实尺寸。之后墙长、窗宽和家具大小都会按这个比例计算。</p>
            <div class="measurement-preview"><span id="reference-pixels">0 px</span><i>→</i><label><input
                        id="reference-meters" type="number" min="0.1" max="100" step="0.01" value="3"> 米</label></div>
            <div class="dialog-actions"><button id="scale-cancel" type="button">重新画线</button><button
                    class="primary-action" type="submit">确认比例</button></div>
        </form>
    </dialog>

    <!-- 设置灯组所属区域：区域来自 HA，只能从已有区域中选择。 -->
    <dialog id="light-group-area-dialog" class="scale-dialog light-group-rename-dialog">
        <form id="light-group-area-form" method="dialog"> <button id="light-group-area-close" class="dialog-close"
                type="button" aria-label="关闭">×</button> <span class="dialog-index">LIGHT GROUP AREA</span>
            <h2>设置区域</h2>
            <p>为“<strong id="light-group-area-name"></strong>”选择所属区域，选择“未分类”可移出区域。</p> <label
                class="light-group-rename-field">所属区域<select id="light-group-area-select"></select></label>
            <div class="dialog-actions"><button id="light-group-area-cancel" type="button">取消</button><button
                    class="primary-action" type="submit">确认</button></div>
        </form>
    </dialog>

    <dialog id="light-group-rename-dialog" class="scale-dialog light-group-rename-dialog">
        <form id="light-group-rename-form" method="dialog"> <button id="light-group-rename-close" class="dialog-close"
                type="button" aria-label="关闭">×</button> <span class="dialog-index">LIGHT GROUP</span>
            <h2>重命名灯组</h2>
            <p>输入新的灯组名称，组内灯具不会发生变化。</p> <label class="light-group-rename-field">灯组名称<input id="light-group-rename-input"
                    maxlength="24" autocomplete="off" required></label>
            <div class="dialog-actions"><button id="light-group-rename-cancel" type="button">取消</button><button
                    class="primary-action" type="submit">确认</button></div>
        </form>
    </dialog>

    <dialog id="floor-rename-dialog" class="scale-dialog light-group-rename-dialog">
        <form id="floor-rename-form" method="dialog"> <button id="floor-rename-close" class="dialog-close" type="button"
                aria-label="关闭">×</button> <span class="dialog-index">FLOOR</span>
            <h2>重命名楼层</h2>
            <p>名称会用于楼层列表、视角和多层导出。</p> <label class="light-group-rename-field">楼层名称<input id="floor-rename-input"
                    maxlength="24" autocomplete="off" required></label>
            <div class="dialog-actions"><button id="floor-rename-cancel" type="button">取消</button><button
                    class="primary-action" type="submit">确认</button></div>
        </form>
    </dialog>

    <dialog id="floor-delete-dialog" class="scale-dialog floor-delete-dialog">
        <form id="floor-delete-form" method="dialog"> <button id="floor-delete-close" class="dialog-close" type="button"
                aria-label="关闭删除楼层提示">×</button> <span class="dialog-index">DELETE FLOOR</span>
            <h2>删除这个楼层？</h2>
            <p>确定删除“<strong id="floor-delete-name"></strong>”吗？这一层的绘图数据不会保留，此操作无法撤销。</p>
            <div class="dialog-actions"><button id="floor-delete-cancel" type="button">取消</button><button
                    id="floor-delete-confirm" class="floor-delete-confirm" type="submit">删除楼层</button></div>
        </form>
    </dialog>

    <dialog id="export-preset-rename-dialog" class="scale-dialog light-group-rename-dialog">
        <form id="export-preset-rename-form" method="dialog"> <button id="export-preset-rename-close"
                class="dialog-close" type="button" aria-label="关闭">×</button> <span class="dialog-index">EXPORT
                PRESET</span>
            <h2>重命名导出存档</h2>
            <p>可以按楼层命名，例如“一层视角”或“二层顶视”。</p> <label class="light-group-rename-field">存档名称<input
                    id="export-preset-rename-input" maxlength="24" autocomplete="off" required></label>
            <div class="dialog-actions"><button id="export-preset-rename-cancel" type="button">取消</button><button
                    class="primary-action" type="submit">确认</button></div>
        </form>
    </dialog>

    <dialog id="export-preset-delete-dialog" class="scale-dialog floor-delete-dialog">
        <form id="export-preset-delete-form" method="dialog"> <button id="export-preset-delete-close"
                class="dialog-close" type="button" aria-label="关闭删除存档提示">×</button> <span class="dialog-index">DELETE
                PRESET</span>
            <h2>删除这个导出存档？</h2>
            <p>确定删除“<strong id="export-preset-delete-name"></strong>”吗？只会删除保存的导出视角和设置，不会删除楼层或户型。</p>
            <div class="dialog-actions"><button id="export-preset-delete-cancel" type="button">取消</button><button
                    id="export-preset-delete-confirm" class="floor-delete-confirm" type="submit">删除存档</button></div>
        </form>
    </dialog>

    <dialog id="drawing-light-notice-dialog" class="scale-dialog export-notice-dialog"
        aria-labelledby="drawing-light-notice-title" @keydown.stop>
        <form method="dialog"> <button class="dialog-close" type="submit" aria-label="关闭灯光性能提示">×</button>
            <span class="dialog-index">LIGHTING NOTICE</span>
            <h2 id="drawing-light-notice-title">灯光开启较多</h2>
            <p>同时开启较多灯光可能导致卡顿，建议配置完成后关闭，需要时再开启。</p>
            <div class="export-notice-summary"><span>当前已开启</span><strong
                    id="drawing-light-notice-count"></strong></div>
            <div class="dialog-actions"><button class="primary-action" type="submit" autofocus>知道了</button></div>
        </form>
    </dialog>

    <dialog id="studio-exit-dialog" class="scale-dialog export-notice-dialog studio-exit-dialog"
        aria-labelledby="studio-exit-title">
        <form method="dialog"> <span class="dialog-index">SAVE BEFORE LEAVING</span>
            <h2 id="studio-exit-title">退出户型绘制？</h2>
            <p id="studio-exit-message" role="status"></p>
            <div class="dialog-actions"><button id="studio-exit-discard" type="button">不保存并退出</button><button
                    id="studio-exit-continue" type="button" autofocus>继续编辑</button><button id="studio-exit-save"
                    class="primary-action" type="button">保存并退出</button></div>
        </form>
    </dialog>

    <dialog id="save-conflict-dialog" class="scale-dialog export-notice-dialog save-conflict-dialog">
        <form method="dialog"> <span class="dialog-index">SAVE CONFLICT</span>
            <h2>其他页面已经修改了户型</h2>
            <p>为避免覆盖另一处修改，自动保存已暂停。请选择加载服务器版本，或明确使用当前页面覆盖。</p>
            <div class="export-notice-summary"><span>当前页面内容</span><strong>仍保留，尚未丢失</strong></div>
            <div class="dialog-actions"><button id="save-conflict-load" type="button">加载服务器版本</button><button
                    id="save-conflict-overwrite" class="primary-action" type="button">使用当前页面覆盖</button></div>
        </form>
    </dialog>

    <dialog id="light-property-apply-dialog" class="scale-dialog light-group-rename-dialog light-property-apply-dialog">
        <form id="light-property-apply-form" method="dialog"> <button id="light-property-apply-close"
                class="dialog-close" type="button" aria-label="关闭">×</button> <span class="dialog-index">APPLY TO
                LIGHTS</span>
            <h2 id="light-property-apply-title">应用灯光属性</h2>
            <p><strong id="light-property-apply-value"></strong> 将应用到下方选中的灯具，其他属性不会改变。</p>
            <section class="light-property-targets">
                <div class="light-property-targets-heading"><strong>应用到灯具</strong><span
                        id="light-property-selection-count"></span><button id="light-property-toggle-all"
                        type="button">取消全选</button></div>
                <div id="light-property-target-list" class="light-property-target-list"></div>
            </section>
            <div class="dialog-actions"><button id="light-property-apply-cancel" type="button">取消</button><button
                    class="primary-action" type="submit">应用所选</button></div>
        </form>
    </dialog>

    <dialog id="material-preset-dialog" class="scale-dialog light-group-rename-dialog">
        <form id="material-preset-form" method="dialog"> <button id="material-preset-close" class="dialog-close"
                type="button" aria-label="关闭">×</button> <span class="dialog-index">CUSTOM STYLE</span>
            <h2>存为我的预设</h2>
            <p>把当前物件的整套配色与表面参数存成一个个人预设。之后在同类物件的「材质风格」里就能直接选用，换项目也还在。</p>
            <label class="light-group-rename-field">预设名称<input id="material-preset-name" maxlength="16"
                    autocomplete="off" required></label>
            <div class="dialog-actions"><button id="material-preset-cancel" type="button">取消</button><button
                    class="primary-action" type="submit">保存预设</button></div>
        </form>
    </dialog>

    <dialog id="material-apply-dialog" class="scale-dialog light-group-rename-dialog">
        <form id="material-apply-form" method="dialog"> <button id="material-apply-close" class="dialog-close"
                type="button" aria-label="关闭">×</button> <span class="dialog-index">APPLY TO SAME MODEL</span>
            <h2>应用到同类物件</h2>
            <p>会把当前物件的材质风格、逐槽颜色与表面参数复制给 <strong id="material-apply-count"></strong>，覆盖它们原有的材质改动。此操作可以用撤销回退。</p>
            <label class="material-apply-option"><input id="material-apply-include-hidden" type="checkbox"
                    checked><span>同时应用到其它楼层被隐藏的物件</span></label>
            <div class="dialog-actions"><button id="material-apply-cancel" type="button">取消</button><button
                    class="primary-action" type="submit">应用</button></div>
        </form>
    </dialog>

    <dialog id="export-overwrite-dialog" class="scale-dialog export-notice-dialog">
        <form method="dialog"> <button id="export-overwrite-close" class="dialog-close" type="button"
                aria-label="关闭同名导图提示">×</button> <span class="dialog-index">EXPORT EXISTS</span>
            <h2>同名导图已经存在</h2>
            <p>导图“<strong id="export-overwrite-name"></strong>”已经保存在 NAS 中。覆盖会整体替换原文件夹，原来存在但本次未勾选的文件也会删除。</p>
            <div class="export-notice-summary"><span>已有仪表盘引用</span><strong>同名图片将自动更新</strong></div>
            <div class="dialog-actions"><button id="export-overwrite-cancel" type="button">取消</button><button
                    id="export-overwrite-rename" type="button">修改名称</button><button id="export-overwrite-confirm"
                    class="primary-action" type="button">覆盖更新</button></div>
        </form>
    </dialog>

    <dialog id="export-complete-dialog" class="scale-dialog export-notice-dialog export-complete-dialog">
        <form method="dialog"> <button id="export-complete-close" class="dialog-close" type="button"
                aria-label="关闭导图完成提示">×</button> <span class="dialog-index">EXPORT COMPLETE</span>
            <h2 id="export-complete-title">导图保存完成</h2>
            <p id="export-complete-message">导出的图片和数据已经保存到 NAS。</p>
            <div class="export-notice-summary"><span>保存位置</span><strong id="export-complete-path"></strong></div>
            <div class="dialog-actions"><button id="export-complete-confirm" class="primary-action"
                    type="button">完成</button></div>
        </form>
    </dialog>

    <dialog id="export-dialog" class="export-dialog">
        <div class="export-workspace">
            <header class="export-heading">
                <div><span class="dialog-index">EXPORT WORKSPACE</span>
                    <h2>导出3D户型图</h2>
                    <p>先确定图像比例，再拖动、缩放和旋转户型，所有导出层将使用完全相同的视角。</p>
                </div><button id="export-close" type="button" aria-label="关闭导图工作区">×</button>
            </header>
            <aside class="export-controls">
                <div id="export-busy-notice" class="export-busy-notice" role="status" aria-live="polite" hidden>
                    <strong>请勿操作</strong><span>正在处理导图，请等待操作完成…</span></div>
                <section class="export-preset-section">
                    <div class="export-preset-heading"><strong>设置存档</strong>
                        <div class="export-preset-actions"><button id="export-preset-add"
                                type="button">新增</button><button id="export-preset-rename"
                                type="button">重命名</button><button id="export-preset-delete" type="button">删除</button>
                        </div>
                    </div>
                    <div id="export-preset-slots" class="export-preset-slots" role="tablist" aria-label="导出设置存档"> </div>
                </section>
                <section>
                    <div class="export-section-heading"><span>01</span>
                        <div><strong>输出尺寸</strong><small>HomeOS默认 · WebP · sRGB</small></div>
                    </div>
                    <div class="export-size-control-row">
                        <div class="export-size-fields"><label>宽度<input id="export-width" type="number" min="320"
                                    max="4096" step="1" value="1852"></label><i>×</i><label>高度<input id="export-height"
                                    type="number" min="320" max="4096" step="1" value="1293"></label></div><label
                            class="export-ratio-lock"><input id="export-lock-ratio" type="checkbox"
                                checked><span>锁定当前比例</span><output id="export-aspect-label">1852 :
                                1293</output></label>
                    </div>
                </section>
                <section class="export-composition-section">
                    <div class="export-section-heading export-composition-heading"><span>02</span>
                        <div><strong>户型构图</strong><small>楼层与相机</small></div><label
                            class="export-floor-select-control"><select id="export-floor-select"
                                aria-label="导出楼层"></select></label>
                    </div>
                    <div class="export-floor-fields"> <label id="export-floor-gap-control"
                            class="export-floor-gap-control" hidden><span>层间距</span><input id="export-floor-gap"
                                type="number" min="0" max="20" step="0.1" value="3"><i>m</i></label> </div>
                    <div class="export-camera-controls">
                        <div class="export-camera-row"><span>视角</span>
                            <div class="preview-view-switch" role="group" aria-label="导出相机视角"><button class="active"
                                    type="button" data-camera-view="free">自由</button><button type="button"
                                    data-camera-view="top">顶视</button><button id="rotate-top-view"
                                    data-camera-rotate-top type="button" title="将顶视顺时针旋转 90°"
                                    disabled>旋转90°</button></div><button id="export-open-base-lighting"
                                class="export-open-base-lighting" type="button">进阶设置</button>
                        </div>
                        <div class="export-camera-row"><span>投影</span>
                            <div class="preview-camera-switch" role="group" aria-label="导出相机投影"><button class="active"
                                    type="button" data-camera-mode="orthographic">正交</button><button type="button"
                                    data-camera-mode="perspective">透视</button></div><label class="camera-focal-control"
                                title="仅在透视模式下生效"><span>焦段</span><input id="camera-focal-length"
                                    data-camera-focal-length type="number" min="18" max="120" step="1" value="50"
                                    inputmode="numeric"><i>mm</i></label>
                        </div>
                    </div>
                    <div class="export-view-actions">
                        <div class="fixed-camera-actions export-fixed-camera-actions" role="group" aria-label="导图已存视角">
                            <button id="export-save-view" type="button" title="记录当前导图的角度、缩放和投影方式">保存视角</button><button
                                id="export-use-fixed" type="button" title="恢复当前导图已保存的视角"
                                disabled>恢复视角</button></div>
                    </div>
                </section>
                <section>
                    <div class="export-section-heading"><span>03</span>
                        <div><strong>文件夹名</strong><small>保存到 NAS data/exports</small></div><button id="export-package"
                            class="export-section-action primary-action" type="button">保存导图</button>
                    </div><label class="export-folder-field"><span>名称</span><input id="export-folder-name"
                            maxlength="60" autocomplete="off" placeholder="例如：一楼户型"></label>
                </section>
                <section>
                    <div class="export-section-heading"><span>04</span>
                        <div><strong>导出内容</strong><small>勾选需要保存的图片、设备图层和数据</small></div>
                    </div>
                    <ul id="export-file-list" class="export-file-list">
                        <li><label><input type="checkbox" data-export-file="background" name="export-file-background"
                                    checked><span>00底图.webp</span></label><small>背景与网格</small></li>
                        <li><label><input type="checkbox" data-export-file="backgroundWithPlan"
                                    name="export-file-backgroundWithPlan"
                                    checked><span>00底图带户型.webp</span></label><small>背景与关灯户型合成图</small></li>
                        <li><label><input type="checkbox" data-export-file="floorPlan" name="export-file-floorPlan"
                                    checked><span>00户型图.webp</span></label><small>透明背景户型、铭牌与描边</small></li>
                        <div id="export-group-files"></div>
                        <li><label><input type="checkbox" data-export-file="dataLights" name="export-file-dataLights"
                                    checked><span>lights.json</span></label><small>灯光配置</small></li>
                        <li><label><input type="checkbox" data-export-file="dataScene" name="export-file-dataScene"
                                    checked><span>scene.json</span></label><small>完整户型数据</small></li>
                    </ul>
                </section>
                <div class="export-footer">
                    <p id="export-status">准备保存到 NAS</p>
                </div>
            </aside>
            <main class="export-preview">
                <div id="export-preview-frame" class="export-preview-frame">
                    <div id="export-preview-stage" class="export-preview-stage"></div>
                    <div class="export-safe-area" aria-hidden="true"></div>
                    <div id="export-preset-empty-state" class="export-preset-empty-state" role="status" hidden>
                        <span>EMPTY PRESET</span><strong id="export-preset-empty-title">存档 02 尚未设置</strong>
                        <p>调整任意参数或移动画面后自动建立</p>
                    </div>
                </div>
                <div class="export-preview-meta"><span id="export-resolution-label">1852 × 1293
                        px</span><span>透明灯光层与底图严格对齐</span></div>
            </main>
        </div>
    </dialog>
</template>
