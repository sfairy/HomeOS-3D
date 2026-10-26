<script setup lang="ts">
/**
 * 平面图栏（`main.studio-shell` 中栏，静态壳）。
 *
 * 从 `entries/StudioView.vue` 模板整段切出（`ops/studio/studio_template_seam.mjs`）。
 * 这些段落是**引擎命令式填充的静态 DOM 契约**（`getElementById` / `querySelector`），
 * 零 Vue 指令，故无需 props / emits；用多根模板渲染，DOM 结构与切片前一致（不新增包裹元素）。
 *
 * 改动约束：元素 id 属于对外契约，重命名/删除必须同步 `app/editor/**` 里的取值方。
 *
 * 例外：工具栏「撤销 / 重做」不走引擎直接操作 DOM —— 它读的是 facade 里的
 * `history.canUndo / canRedo`（引擎每次落历史都会 patch），所以这里保留 Vue 绑定：
 * 按钮禁用态必须跟历史栈同步，命令式改 `disabled` 会在 facade patch 与 DOM 之间留一份影子状态。
 * 命令仍走 `floorplanStore.command({ type: "undo" | "redo" })`，与顶栏按钮同一条链路。
 */
import { useStudioFloorplanStore } from "@/stores/studio-floorplan.store";

const floorplanStore = useStudioFloorplanStore();
</script>

<template>
        <section class="plan-panel panel-surface">
            <div class="plan-toolbar">
                <div class="tool-group" role="toolbar" aria-label="绘图工具">
                    <div class="drawing-tool-section drawing-tool-section--common">
                        <button class="drawing-tool-toggle" type="button" aria-haspopup="true" aria-expanded="false"
                            aria-controls="drawing-tools-common" title="通用工具">
                            <span class="drawing-tool-toggle-label">通用工具</span>
                            <span class="drawing-tool-active" hidden></span>
                            <span class="drawing-tool-caret" aria-hidden="true">▾</span>
                        </button>
                        <div class="drawing-tool-buttons" id="drawing-tools-common" hidden>
                            <button class="tool-button active" type="button" data-tool="select" aria-pressed="true"
                                title="选择与移动"><i>⌁</i><span>选择</span><small>选择与移动</small></button>
                            <button class="tool-button" type="button" data-tool="pan" aria-pressed="false"
                                title="按住左键拖动平移画布"><i>✥</i><span>平移</span><small>按住左键拖动</small></button>
                            <button class="tool-button" type="button" data-tool="scale" aria-pressed="false"
                                title="绘制参考线"><i>↔</i><span>参考线</span><small>绘制参考线</small></button>
                            <button class="tool-button" type="button" data-tool="label" aria-pressed="false"
                                title="放置户型铭牌"><i>T</i><span>铭牌</span><small>放置户型铭牌</small></button>
                        </div>
                    </div>
                    <div class="drawing-tool-section drawing-tool-section--indoor">
                        <button class="drawing-tool-toggle" type="button" aria-haspopup="true" aria-expanded="false"
                            aria-controls="drawing-tools-indoor" title="室内工具">
                            <span class="drawing-tool-toggle-label">室内工具</span>
                            <span class="drawing-tool-active" hidden></span>
                            <span class="drawing-tool-caret" aria-hidden="true">▾</span>
                        </button>
                        <div class="drawing-tool-buttons" id="drawing-tools-indoor" hidden>
                            <button class="tool-button" type="button" data-tool="wall" aria-pressed="false"
                                title="连续画墙"><i>╱</i><span>墙体</span><small>连续画墙</small></button>
                            <button class="tool-button" type="button" data-tool="window" aria-pressed="false"
                                title="将窗户吸附到墙上"><i>▣</i><span>窗户</span><small>吸附到墙上</small></button>
                            <button class="tool-button" type="button" data-tool="door" aria-pressed="false"
                                title="将门吸附到墙上"><i>◧</i><span>门</span><small>吸附到墙上</small></button>
                            <button class="tool-button" type="button" data-tool="railing" aria-pressed="false"
                                title="将玻璃栏杆吸附到墙上"><i>▥</i><span>栏杆</span><small>玻璃栏杆吸附到墙上</small></button>
                            <button class="tool-button" type="button" data-tool="flooropening" aria-pressed="false"
                                title="拖出矩形，仅切除当前层楼板"><i>▣</i><span>楼板洞口</span><small>仅切除当前层楼板</small></button>
                        </div>
                    </div>
                    <div class="drawing-tool-section drawing-tool-section--courtyard">
                        <button class="drawing-tool-toggle" type="button" aria-haspopup="true" aria-expanded="false"
                            aria-controls="drawing-tools-courtyard" title="庭院工具">
                            <span class="drawing-tool-toggle-label">庭院工具</span>
                            <span class="drawing-tool-active" hidden></span>
                            <span class="drawing-tool-caret" aria-hidden="true">▾</span>
                        </button>
                        <div class="drawing-tool-buttons" id="drawing-tools-courtyard" hidden>
                            <button class="tool-button" type="button" data-tool="courtyard-area" aria-pressed="false"
                                title="绘制庭院地面"><i>▧</i><span>地面</span><small>绘制庭院地面</small></button>
                            <button class="tool-button" type="button" data-tool="courtyard-path" aria-pressed="false"
                                title="沿路径铺设汀步"><i>◌</i><span>汀步</span><small>沿路径铺设汀步</small></button>
                            <button class="tool-button" type="button" data-tool="courtyard-fence" aria-pressed="false"
                                title="绘制庭院围挡"><i>▥</i><span>围挡</span><small>绘制庭院围挡</small></button>
                            <button class="tool-button" type="button" data-tool="courtyard-gate" aria-pressed="false"
                                title="沿围挡放置庭院门"><i>◧</i><span>庭院门</span><small>沿围挡放置庭院门</small></button>
                        </div>
                    </div>
                </div>
                <div class="toolbar-actions">
                    <div class="plan-history-actions" role="group" aria-label="编辑历史">
                        <button id="plan-undo" class="plan-history-button" type="button"
                            aria-label="撤销" :disabled="!floorplanStore.canUndo"
                            @click="floorplanStore.command({ type: 'undo' })">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M10 5 4 10l6 5" />
                                <path d="M4 10h10a5 5 0 0 1 0 10H9" />
                            </svg>
                        </button>
                        <button id="plan-redo" class="plan-history-button" type="button"
                            aria-label="重做" :disabled="!floorplanStore.canRedo"
                            @click="floorplanStore.command({ type: 'redo' })">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="m14 5 6 5-6 5" />
                                <path d="M20 10H10a5 5 0 0 0 0 10h5" />
                            </svg>
                        </button>
                    </div>
                    <div class="plan-clipboard-actions" role="group" aria-label="复制粘贴">
                        <button id="plan-copy" class="plan-history-button" type="button"
                            aria-label="复制" :disabled="!floorplanStore.canCopy"
                            @click="floorplanStore.command({ type: 'copy' })">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <rect x="9" y="9" width="11" height="11" rx="2" />
                                <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6a2 2 0 0 0-2 2v7.5A2.5 2.5 0 0 0 6.5 15" />
                            </svg>
                        </button>
                        <button id="plan-paste" class="plan-history-button" type="button"
                            aria-label="粘贴" :disabled="!floorplanStore.canPaste"
                            @click="floorplanStore.command({ type: 'paste' })">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" />
                                <path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                                <path d="M9 12h6" />
                                <path d="M9 16h4" />
                            </svg>
                        </button>
                    </div>
                    <!--
                      删除 / 旋转画布的 **id 与 class 是对外契约**：`studio-app.ts` 用
                      `#delete-selection` 挂 clearSelection、用 `#rotate-plan-view` 挂 rotatePlanView，
                      `refreshStudioUiInner` 还会直接写 `#delete-selection.disabled`。
                      所以这里保留 id、禁用态交给引擎（不加 :disabled 绑定，避免两处抢着写）。
                    -->
                    <div class="plan-edit-actions" role="group" aria-label="删除与画布旋转">
                        <button id="delete-selection" class="plan-history-button danger-action" type="button"
                            aria-label="删除" disabled>
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M3 6h18" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                            </svg>
                        </button>
                        <button id="rotate-plan-view" class="plan-history-button" type="button"
                            aria-label="旋转">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 5H6a2 2 0 0 0-2 2v3" />
                                <path d="m9 8 3-3-3-3" />
                                <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                            </svg>
                        </button>
                    </div>
                    <div class="snap-control"> <button id="snap-toggle" class="snap-toggle active" type="button"
                            aria-pressed="true" title="开启或关闭绘图吸附"><span>吸附</span><small
                                id="snap-toggle-state">开</small></button> <button id="snap-settings-toggle"
                            class="snap-settings-toggle" type="button" aria-label="吸附设置" aria-expanded="false"
                            title="吸附设置">⌔</button>
                        <div id="snap-settings-panel" class="snap-settings-panel" hidden>
                            <header><strong>吸附设置</strong><small>按住 S 临时关闭</small></header>
                            <div class="snap-option-grid"> <label><input type="checkbox"
                                        data-snap-setting="snapEndpoints" name="snap-setting-snapEndpoints"
                                        checked><span>端点</span></label> <label><input type="checkbox"
                                        data-snap-setting="snapIntersections" name="snap-setting-snapIntersections"
                                        checked><span>交点</span></label> <label><input type="checkbox"
                                        data-snap-setting="snapSegments" name="snap-setting-snapSegments"
                                        checked><span>墙线</span></label> <label><input type="checkbox"
                                        data-snap-setting="snapOrthogonal" name="snap-setting-snapOrthogonal"
                                        checked><span>垂直优先</span></label> <label><input type="checkbox"
                                        data-snap-setting="snapAngles" name="snap-setting-snapAngles"
                                        checked><span>15° 角度</span></label> <label><input type="checkbox"
                                        data-snap-setting="snapGrid" name="snap-setting-snapGrid"
                                        checked><span>网格</span></label> <label
                                    title="新增或单独拖动桌面物件时自动贴合台面"><input type="checkbox" data-snap-setting="snapSurfaces"
                                        name="snap-setting-snapSurfaces" checked><span>台面</span></label>
                            </div> <label class="snap-distance"><span>吸附距离</span><input id="snap-tolerance"
                                    class="hos-range-ui" type="range" min="6" max="24" step="1" value="13"><output
                                    id="snap-tolerance-value">13
                                    px</output></label>
                        </div>
                    </div> <button id="finish-wall" type="button" title="未闭合的墙线不会生成地面" hidden>结束绘制</button>
                    <button id="fit-view" type="button">适应画布</button>
                </div>
            </div>
            <div id="plan-stage" class="plan-stage"> <canvas id="plan-canvas" tabindex="0" aria-label="户型描摹画布"></canvas>
                <div id="canvas-empty" class="canvas-empty">
                    <div><span>01</span><strong>先导入一张户型图</strong>
                        <p>支持 PNG、JPG 和 WebP，随后画参考线确定真实比例。</p>
                    </div>
                </div>
                <div class="canvas-hud top-left"><span id="active-tool-label">选择工具</span><small
                        id="tool-help">单击精确选择，空白处拖拽框选；滚轮缩放，空格拖动画布</small></div>
                <div class="canvas-hud bottom-left"><span id="cursor-position">X 0.00 m · Y 0.00 m</span><span
                        id="snap-indicator">吸附：开启</span></div>
                <div class="canvas-hud bottom-right"><button id="zoom-out" type="button">−</button><span
                        id="zoom-value">100%</span><button id="zoom-in" type="button">＋</button></div>
                <div id="drop-hint" class="drop-hint">松开即可放置</div>
            </div>
        </section>
</template>
