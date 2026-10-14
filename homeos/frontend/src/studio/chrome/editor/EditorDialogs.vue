<script setup lang="ts">
/**
 * 编辑器对话框壳（弹出模块 / 项目 / 页面 / 复制 / 删除 / 错误与恢复）。
 *
 * 从 `entries/EditorView.vue` 模板整段切出（`ops/studio/studio_template_seam.mjs`）。
 * 这些段落是**引擎命令式填充的静态 DOM 契约**（`getElementById` / `querySelector`），
 * 零 Vue 指令，故无需 props / emits；用多根模板渲染，DOM 结构与切片前一致（不新增包裹元素）。
 *
 * 改动约束：元素 id 属于对外契约，重命名/删除必须同步 `app/editor/**` 里的取值方。
 */
</script>

<template>
    <dialog id="popup-name-dialog" class="settings-dialog popup-name-dialog">
        <div class="dialog-heading">
            <div><span>COMBO POPUP</span>
                <h2 id="popup-name-dialog-title">新建组合弹窗</h2>
            </div><button id="popup-name-close" class="icon-button" type="button" aria-label="关闭">&times;</button>
        </div>
        <form id="popup-name-form" class="settings-form"> <label><span>组合弹窗名称</span><input name="name" value="新建组合弹窗"
                    maxlength="128" required></label>
            <div class="dialog-actions"><button id="popup-name-cancel" type="button">取消</button><button class="primary"
                    type="submit">确定</button></div>
        </form>
    </dialog>

    <dialog id="popup-module-dialog" class="settings-dialog popup-module-dialog">
        <div class="dialog-heading">
            <div><span>POPUP MODULE</span>
                <h2 id="popup-module-dialog-title">添加弹窗模块</h2>
            </div><button id="popup-module-close" class="icon-button" type="button" aria-label="关闭">&times;</button>
        </div>
        <form id="popup-module-form" class="settings-form"> <label><span>模块类型</span><select name="type">
                    <option value="light">灯光</option>
                    <option value="climate">空调 / 浴霸</option>
                    <option value="air-purifier">空气净化器</option>
                    <option value="water-heater">热水器</option>
                    <option value="media-player">媒体</option>
                    <option value="electric-bed">电动床</option>
                    <option value="switch">开关 / 按钮</option>
                    <option value="cover">窗帘</option>
                    <option value="camera">摄像头</option>
                    <option value="line-chart">折线图</option>
                    <option value="generic">通用设备</option>
                </select></label>
            <div id="popup-module-entity-picker" class="inspector-picker popup-module-entity-picker"> <span
                    class="inspector-picker-title">实体</span> <button id="popup-module-entity-button"
                    class="inspector-picker-button" type="button" aria-haspopup="listbox"
                    aria-expanded="false">选择实体</button>
                <div id="popup-module-entity-menu" class="inspector-picker-menu" hidden> <input
                        id="popup-module-entity-search" type="search" placeholder="搜索实体名称或 ID" autocomplete="off">
                    <div id="popup-module-entity-options" class="inspector-entity-options" role="listbox"></div>
                </div> <input name="entityId" type="hidden">
            </div>
            <div id="popup-module-climate-device-type" class="popup-module-device-type" hidden> <span>设备类型</span>
                <div class="navigation-segmented-options three-columns" role="group" aria-label="空调或浴霸设备类型"> <button
                        type="button" data-popup-module-device-type="auto">自动识别</button> <button type="button"
                        data-popup-module-device-type="air-conditioner">空调</button> <button type="button"
                        data-popup-module-device-type="bath-heater">浴霸</button> </div> <input name="deviceType"
                    type="hidden" value="auto">
            </div> <label><span>模块标题（可选）</span><input name="title" maxlength="128" placeholder="默认使用实体备注"></label>
            <div class="dialog-actions"><button id="popup-module-cancel" type="button">取消</button><button
                    class="primary" type="submit">确认</button></div>
        </form>
    </dialog>

    <dialog id="delete-popup-dialog" class="settings-dialog delete-dialog">
        <div class="dialog-heading">
            <div><span>DANGER ZONE</span>
                <h2>删除组合弹窗</h2>
            </div><button id="delete-popup-close" class="icon-button" type="button" aria-label="关闭删除弹窗">&times;</button>
        </div>
        <div class="settings-form">
            <div class="delete-warning"><strong>确认删除 <b id="delete-popup-name"></b>？</strong>
                <p>删除后，所有仪表盘中打开该弹窗的单击、双击和长按动作都会自动改为“无动作”。</p>
            </div>
            <div class="dialog-actions"><button id="delete-popup-cancel" type="button">取消</button><button
                    id="delete-popup-confirm" class="danger" type="button">确认删除</button></div>
        </div>
    </dialog>

    <dialog id="component-template-dialog" class="settings-dialog component-template-dialog">
        <div class="dialog-heading">
            <div><span>COMPONENT LIBRARY</span>
                <h2>控件模板</h2>
            </div><button id="component-template-close" class="icon-button" type="button"
                aria-label="关闭控件模板">&times;</button>
        </div>
        <div class="component-template-body">
            <p id="component-template-scope">所有控件均可添加到侧边栏或当前主页面。</p>
            <div id="component-template-list" class="component-template-list"></div>
        </div>
    </dialog>

    <dialog id="floorplan-auto-diagram-dialog" class="settings-dialog floorplan-auto-diagram-dialog">
        <div class="dialog-heading">
            <div><span>AUTO FLOOR PLAN</span>
                <h2>户型图自动导图</h2>
            </div><button id="floorplan-auto-diagram-close" class="icon-button" type="button"
                aria-label="关闭户型图自动导图">&times;</button>
        </div>
        <div id="floorplan-auto-diagram-guide" class="floorplan-auto-diagram-guide"> <strong>开始前请确认</strong>
            <p>户型图、家具、灯光和灯组是否已经绘制完成？完成后将按当前仪表盘的分辨率和比例进入视角调整。</p>
            <div class="dialog-actions"><button id="floorplan-auto-diagram-later" type="button">取消添加</button><button
                    id="floorplan-auto-diagram-continue" class="primary" type="button">已完成，开始设置</button></div>
        </div>
    </dialog>

    <dialog id="navigation-style-apply-dialog" class="settings-dialog navigation-style-apply-dialog">
        <div class="dialog-heading">
            <div><span>BATCH APPLY</span>
                <h2 id="navigation-style-apply-title">应用导航按钮设置</h2>
            </div> <button id="navigation-style-apply-close" class="icon-button" type="button"
                aria-label="关闭应用设置窗口">&times;</button>
        </div>
        <div class="navigation-style-apply-body">
            <p id="navigation-style-apply-summary" class="navigation-style-apply-summary"></p>
            <div class="navigation-style-apply-columns">
                <section>
                    <div class="navigation-style-apply-heading"><strong>要应用的修改</strong><span>可单独取消</span></div>
                    <div id="navigation-style-apply-properties" class="navigation-style-apply-options"></div>
                </section>
                <section>
                    <div class="navigation-style-apply-heading"><strong
                            id="navigation-style-apply-target-heading">应用到导航按钮</strong><span
                            id="navigation-style-apply-target-scope">按区域与页面区分</span></div>
                    <div id="navigation-style-apply-targets" class="navigation-style-apply-options"></div>
                </section>
            </div>
            <p id="navigation-style-apply-message" class="navigation-style-apply-message" hidden></p>
            <div class="dialog-actions"> <button id="navigation-style-apply-cancel" type="button">取消</button> <button
                    id="navigation-style-apply-confirm" class="primary" type="button">应用所选</button> </div>
        </div>
    </dialog>

    <dialog id="effect-image-align-dialog" class="settings-dialog effect-image-align-dialog">
        <div class="dialog-heading">
            <div><span>ALIGN EFFECT IMAGE</span>
                <h2>选择本页对齐图片</h2>
            </div><button id="effect-image-align-close" class="icon-button" type="button"
                aria-label="关闭对齐图片窗口">&times;</button>
        </div>
        <div class="effect-image-align-body">
            <p>选择一张本页面的普通图片。确认后将同步图片布局、左右位置、上下位置、缩放和旋转。</p>
            <div id="effect-image-align-options" class="effect-image-align-options" role="radiogroup"
                aria-label="选择本页对齐图片"></div>
            <p id="effect-image-align-message" class="navigation-style-apply-message" hidden></p>
            <div class="dialog-actions"><button id="effect-image-align-cancel" type="button">取消</button><button
                    id="effect-image-align-confirm" class="primary" type="button">确认对齐</button></div>
        </div>
    </dialog>

    <dialog id="project-dialog" class="settings-dialog project-dialog">
        <div class="dialog-heading">
            <div><span id="project-dialog-kicker">NEW PROJECT</span>
                <h2 id="project-dialog-title">创建仪表盘项目</h2>
            </div><button id="project-close" class="icon-button" type="button" aria-label="关闭仪表盘窗口">×</button>
        </div>
        <form id="project-form" class="settings-form">
            <div id="project-template-fields" class="project-template-fields"> <span>创建方式</span>
                <div id="project-template-options" class="project-template-options" role="radiogroup"
                    aria-label="选择仪表盘模板"></div>
            </div>
            <div id="project-canvas-fields" class="project-canvas-fields">
                <div class="project-details-grid"> <label class="project-name-field"><span>仪表盘名称</span><input
                            name="name" value="我的仪表盘" maxlength="128" required></label> <label
                        class="project-canvas-control"><span>宽度（px）</span><input id="project-canvas-width"
                            name="canvasWidth" type="number" value="2778" min="320" max="7680" step="1"
                            inputmode="numeric" required></label> <label
                        class="project-canvas-control"><span>高度（px）</span><input id="project-canvas-height"
                            name="canvasHeight" type="number" value="1940" min="240" max="4320" step="1"
                            inputmode="numeric" required></label>
                    <div class="project-aspect-field project-canvas-control"><span>画布比例</span><button
                            id="project-aspect-lock" class="project-aspect-lock" type="button" aria-pressed="false"
                            title="锁定当前画布比例"><svg viewBox="0 0 20 20" aria-hidden="true">
                                <path d="M6.5 8V6.3a3.5 3.5 0 0 1 7 0V8" />
                                <rect x="4.5" y="8" width="11" height="8.5" rx="2" />
                            </svg><span id="project-aspect-lock-label">锁定</span><output id="project-aspect-ratio"
                                for="project-canvas-width project-canvas-height">1389 : 970</output></button></div>
                </div> <small id="project-canvas-hint"
                    class="project-canvas-control">编辑器和仪表盘将共用该分辨率与比例，显示时只做等比缩放。</small>
                <div id="project-content-lock-fields" class="project-content-lock-fields" hidden> <label
                        class="check-row"><input id="project-content-lock" name="lockContent"
                            type="checkbox"><span>锁定控件大小及位置</span></label> <small>锁定后普通控件保持原尺寸和位置，3D
                        交互外框仍按画布宽高适配。</small> </div>
            </div>
            <div id="project-message" class="settings-message" hidden></div>
            <div class="dialog-actions"><button id="project-cancel" type="button">取消</button><button id="project-submit"
                    class="primary" type="submit">创建项目</button></div>
        </form>
    </dialog>

    <dialog id="project-resize-warning-dialog" class="settings-dialog project-resize-warning-dialog">
        <div class="dialog-heading">
            <div><span>CONTENT OUTSIDE CANVAS</span>
                <h2>控件可能超出画布</h2>
            </div><button id="project-resize-warning-close" class="icon-button" type="button"
                aria-label="取消分辨率修改">×</button>
        </div>
        <div class="project-resize-warning-body">
            <p id="project-resize-warning-text"></p>
            <p>继续后，锁定的控件不会自动缩放或移动。你可以在编辑器中手动把它们移回画布范围内。</p>
            <div class="dialog-actions"><button id="project-resize-warning-cancel" type="button">返回修改</button><button
                    id="project-resize-warning-confirm" class="primary" type="button">继续修改</button></div>
        </div>
    </dialog>

    <dialog id="project-preview-dialog" class="settings-dialog project-preview-dialog">
        <div class="project-preview-heading">
            <div><span>QI GUANG PREVIEW</span>
                <h2 id="project-preview-title">HomeOS预览</h2>
            </div>
            <div class="project-preview-heading-actions"><span id="project-preview-count">1 / 9</span><button
                    id="project-preview-close" class="icon-button" type="button" aria-label="关闭HomeOS预览">×</button></div>
        </div>
        <div class="project-preview-stage"><button id="project-preview-previous" class="project-preview-arrow previous"
                type="button" aria-label="上一张">‹</button><img id="project-preview-image" alt=""><button
                id="project-preview-next" class="project-preview-arrow next" type="button" aria-label="下一张">›</button>
        </div>
    </dialog>

    <dialog id="page-dialog" class="settings-dialog page-dialog">
        <div class="dialog-heading">
            <div><span id="page-dialog-kicker">NEW PAGE</span>
                <h2 id="page-dialog-title">新建页面</h2>
            </div><button id="page-close" class="icon-button" type="button" aria-label="关闭页面窗口">×</button>
        </div>
        <form id="page-form" class="settings-form"> <label><span>页面名称</span><input name="name" maxlength="128"
                    required></label>
            <div id="page-message" class="settings-message" hidden></div>
            <div class="dialog-actions"><button id="page-cancel" type="button">取消</button><button id="page-submit"
                    class="primary" type="submit">创建页面</button></div>
        </form>
    </dialog>

    <dialog id="component-group-rename-dialog" class="settings-dialog page-dialog">
        <div class="dialog-heading">
            <div><span>EDIT GROUP</span>
                <h2>重命名组合</h2>
            </div><button id="component-group-rename-close" class="icon-button" type="button"
                aria-label="关闭组合重命名窗口">×</button>
        </div>
        <form id="component-group-rename-form" class="settings-form"> <label><span>组合名称</span><input
                    id="component-group-rename-input" name="name" maxlength="128" autocomplete="off" required></label>
            <div id="component-group-rename-message" class="settings-message" hidden></div>
            <div class="dialog-actions"><button id="component-group-rename-cancel" type="button">取消</button><button
                    class="primary" type="submit">保存修改</button></div>
        </form>
    </dialog>

    <dialog id="delete-project-dialog" class="settings-dialog delete-dialog">
        <div class="dialog-heading">
            <div><span>DANGER ZONE</span>
                <h2>删除仪表盘项目</h2>
            </div><button id="delete-project-close" class="icon-button" type="button" aria-label="关闭删除项目">×</button>
        </div>
        <form id="delete-project-form" class="settings-form">
            <div class="delete-warning"><strong>该操作会删除项目及当前草稿</strong>
                <p>Home Assistant 连接、实体目录、账号和其他项目不会受影响。当前阶段删除后无法在系统内恢复。</p>
            </div> <label><span>请输入完整项目名称 <b id="delete-project-name"></b></span><input name="confirmation"
                    maxlength="128" autocomplete="off" required></label>
            <div id="delete-project-message" class="settings-message" hidden></div>
            <div class="dialog-actions"><button id="delete-project-cancel" type="button">取消</button><button
                    class="danger" type="submit">确认删除</button></div>
        </form>
    </dialog>

    <dialog id="delete-page-dialog" class="settings-dialog delete-dialog">
        <div class="dialog-heading">
            <div><span>DANGER ZONE</span>
                <h2>删除页面</h2>
            </div><button id="delete-page-close" class="icon-button" type="button" aria-label="关闭删除页面">×</button>
        </div>
        <div class="settings-form">
            <div class="delete-warning"><strong>确认删除页面 <b id="delete-page-name"></b>？</strong>
                <p>页面内的主页面控件会一并删除。删除最后一个页面后，可以从左侧重新新建页面。</p>
            </div>
            <div id="delete-page-message" class="settings-message" hidden></div>
            <div class="dialog-actions"><button id="delete-page-cancel" type="button">取消</button><button
                    id="delete-page-confirm" class="danger" type="button">确认删除</button></div>
        </div>
    </dialog>

    <dialog id="delete-component-dialog" class="settings-dialog delete-dialog">
        <div class="dialog-heading">
            <div><span>DANGER ZONE</span>
                <h2>删除控件</h2>
            </div><button id="delete-component-close" class="icon-button" type="button" aria-label="关闭删除控件窗口">×</button>
        </div>
        <div class="settings-form">
            <div class="delete-warning"><strong>确认删除控件 <b id="delete-component-name"></b>？</strong>
                <p>删除后可在保存前通过顶部撤销按钮恢复。</p>
            </div>
            <div class="dialog-actions"><button id="delete-component-cancel" type="button">取消</button><button
                    id="delete-component-confirm" class="danger" type="button">确认删除</button></div>
        </div>
    </dialog>

    <dialog id="copy-component-page-dialog" class="settings-dialog copy-component-page-dialog">
        <div class="dialog-heading">
            <div><span>COPY COMPONENT</span>
                <h2>复制控件到其他区域</h2>
            </div><button id="copy-component-page-close" class="icon-button" type="button"
                aria-label="关闭复制控件窗口">×</button>
        </div>
        <form id="copy-component-page-form" class="settings-form"> <small><b id="copy-component-page-name"></b> <span
                    data-copy-component-description>将当前控件完整复制到目标区域。</span></small> <label><span>复制范围</span><select
                    id="copy-component-page-scope" name="targetScope" required>
                    <option value="current">本仪表盘</option>
                    <option value="other">其他仪表盘</option>
                </select></label> <label id="copy-component-page-project-field" hidden><span>目标仪表盘</span><select
                    id="copy-component-page-project" name="targetProject"></select></label> <label
                id="copy-component-page-target-field"><span id="copy-component-page-target-label">本仪表盘目标页面</span><select
                    id="copy-component-page-target" name="targetPage" required></select></label>
            <section id="copy-component-scale-options" class="copy-component-scale-options" hidden>
                <div><strong>目标仪表盘分辨率不同</strong><span id="copy-component-resolution-summary"></span></div> <label><input
                        type="radio" name="copyScaleMode" value="proportional"
                        checked><span><strong>等比缩放（推荐）</strong><small>按目标画布调整位置和尺寸，不拉伸控件。</small></span></label>
                <label><input type="radio" name="copyScaleMode"
                        value="none"><span><strong>不缩放</strong><small>保留原位置和尺寸，控件可能超出目标画布。</small></span></label>
                <small>3D 交互外框始终按目标画布宽高适配，内部户型保持自身比例。</small>
            </section>
            <div id="copy-component-page-message" class="settings-message" hidden></div>
            <div class="dialog-actions"><button id="copy-component-page-cancel" type="button">取消</button><button
                    id="copy-component-page-submit" class="primary" type="submit">复制并前往</button></div>
        </form>
    </dialog>

    <dialog id="copy-component-success-dialog" class="settings-dialog copy-component-success-dialog">
        <div class="dialog-heading">
            <div><span>COPY COMPLETE</span>
                <h2>复制成功</h2>
            </div>
        </div>
        <div class="settings-form">
            <div id="copy-component-success-message" class="settings-message success"></div>
            <p class="settings-help">复制结果已经保存。是否现在前往目标位置查看？</p>
            <div class="dialog-actions"><button id="copy-component-success-stay" type="button">留在当前页面</button><button
                    id="copy-component-success-go" class="primary" type="button">前往查看</button></div>
        </div>
    </dialog>

    <dialog id="delete-asset-dialog" class="settings-dialog delete-dialog">
        <div class="dialog-heading">
            <div><span>DELETE IMAGE</span>
                <h2>删除上传图片</h2>
            </div><button id="delete-asset-close" class="icon-button" type="button" aria-label="关闭删除图片">×</button>
        </div>
        <div class="settings-form">
            <div class="delete-warning"><strong>确认删除 <b id="delete-asset-name"></b>？</strong>
                <p>正在被仪表盘或弹窗使用的图片不能删除。</p>
            </div>
            <div class="dialog-actions"><button id="delete-asset-cancel" type="button">取消</button><button
                    id="delete-asset-confirm" class="danger" type="button">确认删除</button></div>
        </div>
    </dialog>

    <dialog id="delete-asset-folder-dialog" class="settings-dialog delete-dialog">
        <div class="dialog-heading">
            <div><span>DELETE FOLDER</span>
                <h2>删除自动导图文件夹</h2>
            </div><button id="delete-asset-folder-close" class="icon-button" type="button"
                aria-label="关闭删除文件夹">×</button>
        </div>
        <div class="settings-form">
            <div class="delete-warning"><strong>确认删除 <b id="delete-asset-folder-name"></b>？</strong>
                <p>该文件夹中的 <b id="delete-asset-folder-count"></b> 张导图会一起删除，且无法恢复。正在被仪表盘或弹窗使用时不会删除。</p>
            </div>
            <div class="dialog-actions"><button id="delete-asset-folder-cancel" type="button">取消</button><button
                    id="delete-asset-folder-confirm" class="danger" type="button">确认删除</button></div>
        </div>
    </dialog>

    <dialog id="error-dialog" class="settings-dialog error-dialog">
        <div class="dialog-heading">
            <div><span>OPERATION FAILED</span>
                <h2>操作没有完成</h2>
            </div><button id="error-dialog-close" class="icon-button" type="button" aria-label="关闭错误提示">×</button>
        </div>
        <div class="settings-form">
            <div id="error-dialog-message" class="settings-message error"></div>
            <div class="dialog-actions"><button id="error-dialog-confirm" class="primary" type="button">知道了</button>
            </div>
        </div>
    </dialog>

    <dialog id="recovery-dialog" class="settings-dialog recovery-dialog">
        <div class="dialog-heading">
            <div><span>UNSAVED CHANGES</span>
                <h2>恢复未保存修改</h2>
            </div>
        </div>
        <div class="settings-form">
            <div class="recovery-message"><strong>检测到刷新前的编辑内容</strong>
                <p>这些修改尚未保存到仪表盘。可以继续编辑，或丢弃并使用上次已保存的内容。</p>
            </div>
            <div class="dialog-actions"><button id="recovery-discard" type="button">丢弃修改</button><button
                    id="recovery-restore" class="primary" type="button">恢复修改</button></div>
        </div>
    </dialog>
</template>
