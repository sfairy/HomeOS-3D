<script setup lang="ts">
/**
 * Vue 壳层（顶栏 / 分栏折叠 / 缩放 / 快捷键）+ 既有 DOM 契约供 bootEditor 操作。
 */
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { loadClassicScript } from "../composables/useLegacyPage";
import { useStudioEditorStore } from "@/stores/studio-editor.store";
import {
  EDITOR_SHORTCUT_ROWS,
  StudioShortcutsOverlay,
  StudioTopBar,
  StudioZoomBar,
} from "@/studio/chrome";
import EditorAlignBar from "@/studio/chrome/EditorAlignBar.vue";
import "@/studio/chrome/studio-chrome.css";
import { Undo2, Redo2, Shapes } from "@lucide/vue";
import { SETTINGS_ROUTES } from "@/utils/registry/settings-route.util";

const router = useRouter();
const editorStore = useStudioEditorStore();

const rootClass = computed(() => [
  "editor-chrome-root",
  editorStore.leftCollapsed ? "sc-shell--left-collapsed" : "",
  editorStore.rightCollapsed ? "sc-shell--right-collapsed" : "",
]);

const rootStyle = computed(() => ({
  // 折叠时内联变量必须归零，否则会盖过 .sc-shell--left-collapsed 的 --sc-left
  "--sc-left": editorStore.leftCollapsed ? "0px" : `${editorStore.leftWidth}px`,
  "--sc-right": editorStore.rightCollapsed ? "0px" : `${editorStore.rightWidth}px`,
  "--sc-canvas-zoom": String(editorStore.canvasZoom),
}));

let teardownEditor: (() => void) | null = null;
let disposed = false;

function goBack() {
  // 设置页深链是 /settings?tab=layout，不是 /settings/display（后者会命中 pathMatch 兜底）
  router.push(SETTINGS_ROUTES.layout()).catch(() => {
    router.push("/settings").catch(() => undefined);
  });
}

function openFloorplan() {
  editorStore.command({ type: "openFloorplan" });
  router.push("/3d-studio").catch(() => undefined);
}

onMounted(async () => {
  editorStore.bindFacade();
  document.documentElement.style.setProperty("--sc-canvas-zoom", String(editorStore.canvasZoom));
  await loadClassicScript("/static/vendor/hls.js/1.7.3/hls.min.js");
  await import("@app/logging/global-log-boot");
  const { setupBackupRestoreUi } = await import("@app/backup/backup-restore-ui");
  setupBackupRestoreUi({
    root: document.querySelector(".editor-chrome-root"),
    // 对齐 0.7.1：未保存或保存中禁止导出加密备份
    canExport: () => !editorStore.dirty && editorStore.saveState !== "saving",
  });
  await import("@app/updates/update-notice");
  const storeLinks = await import("@app/shared/store-links");
  void storeLinks.applyStoreLinks();
  const editor = await import("@app/editor/home");
  if (disposed) return;
  editor.bootEditor();
  teardownEditor = editor.teardownEditor;
  // 同步初始折叠态到引擎
  editorStore.command({ type: "setLeftCollapsed", collapsed: editorStore.leftCollapsed });
  editorStore.command({ type: "setRightCollapsed", collapsed: editorStore.rightCollapsed });
  editorStore.command({ type: "setZoom", zoom: editorStore.canvasZoom });
});

onBeforeUnmount(() => {
  disposed = true;
  editorStore.unbindFacade();
  const dispose = teardownEditor;
  teardownEditor = null;
  dispose?.();
});

watch(
  () => editorStore.canvasZoom,
  (zoom) => {
    document.documentElement.style.setProperty("--sc-canvas-zoom", String(zoom));
    document.getElementById("editor-canvas")?.classList.add("sc-canvas-zoom");
    document.getElementById("dashboard-preview")?.classList.add("sc-canvas-zoom");
  },
  { immediate: true },
);
</script>

<template>
  <div :class="rootClass" :style="rootStyle">
    <StudioTopBar
      :title="editorStore.projectName"
      eyebrow="仪表盘编辑器"
      back-label="返回后台"
      :dirty="editorStore.dirty"
      :save-state="editorStore.saveState"
      show-left-toggle
      show-right-toggle
      :left-collapsed="editorStore.leftCollapsed"
      :right-collapsed="editorStore.rightCollapsed"
      @back="goBack"
      @toggle-left="editorStore.toggleLeft()"
      @toggle-right="editorStore.toggleRight()"
      @shortcuts="editorStore.showShortcuts = true"
    >
      <template #center>
        <StudioZoomBar
          :zoom="editorStore.canvasZoom"
          @update:zoom="editorStore.setZoom($event)"
          @fit="editorStore.command({ type: 'fitZoom' })"
        />
        <EditorAlignBar />
      </template>
      <template #actions>
        <button
          type="button"
          class="sc-btn sc-btn--icon"
          title="撤销"
          :disabled="!editorStore.canUndo"
          @click="editorStore.command({ type: 'undo' })"
        >
          <Undo2 class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          class="sc-btn sc-btn--icon"
          title="重做"
          :disabled="!editorStore.canRedo"
          @click="editorStore.command({ type: 'redo' })"
        >
          <Redo2 class="w-3.5 h-3.5" />
        </button>
        <button type="button" class="sc-btn" @click="openFloorplan">
          <Shapes class="w-3.5 h-3.5" />
          户型图绘制
        </button>
        <button
          type="button"
          class="sc-btn sc-btn--primary"
          @click="editorStore.command({ type: 'save' })"
        >
          保存
        </button>
        <button
          id="backup-open"
          type="button"
          class="sc-btn sc-btn--icon global-log-open"
          title="备份与恢复"
          aria-label="备份与恢复"
        >
          备份
        </button>
      </template>
    </StudioTopBar>

    <StudioShortcutsOverlay
      :open="editorStore.showShortcuts"
      title="仪表盘编辑器快捷键"
      :rows="EDITOR_SHORTCUT_ROWS"
      @close="editorStore.showShortcuts = false"
    />

    <!-- 保留旧 header 节点供引擎查询，视觉由 Vue 顶栏接管 -->
    <header class="editor-header sc-legacy-hidden" aria-hidden="true">
        <div class="brand-lockup"><img class="brand-icon"
                src="/static/assets/icons/homeos-mark-white-orange.svg" alt=""><strong>HomeOS</strong><span
                class="version">1.0.0</span></div>
    </header>
    <main class="editor-shell">
        <aside
          class="panel navigator"
          :class="{ 'is-collapsed': editorStore.leftCollapsed }"
          :aria-hidden="editorStore.leftCollapsed"
        >
            <div class="panel-heading navigator-heading">
                <h2>控件图层</h2> <button id="project-floorplan-open" class="project-floorplan-open"
                    type="button">户型图绘制</button>
            </div>
            <div id="navigator-content">
                <div class="dashboard-control">
                    <div class="dashboard-control-heading"><span>仪表盘</span><button id="project-new"
                            type="button">新建</button></div>
                    <div class="page-select-row dashboard-select-row"> <select id="project-select" aria-label="选择仪表盘"
                            disabled>
                            <option value="">暂无仪表盘</option>
                        </select> <button id="project-actions-button" type="button" aria-label="仪表盘操作"
                            aria-expanded="false" disabled>···</button>
                        <div id="project-actions-menu" class="page-actions-menu" hidden> <button type="button"
                                data-project-action="edit">重命名</button> <button type="button"
                                data-project-action="resize">修改分辨率</button> <button type="button"
                                data-project-action="duplicate">复制</button> <button type="button" class="danger"
                                data-project-action="delete">删除</button> </div>
                    </div>
                </div>
                <div class="editor-content-tabs" role="tablist" aria-label="编辑内容"> <button id="show-page-editor"
                        class="active" type="button" role="tab" aria-selected="true">页面</button> <button
                        id="show-popup-editor" type="button" role="tab" aria-selected="false">组合弹窗</button> </div>
                <div class="page-control">
                    <div class="dashboard-control-heading"><span>选择页面</span><button id="page-new" type="button"
                            disabled>新建</button></div>
                    <div class="page-select-row"> <select id="page-select" aria-label="页面" disabled>
                            <option value="">暂无页面</option>
                        </select> <button id="page-actions-button" type="button" aria-label="页面操作" aria-expanded="false"
                            disabled>···</button>
                        <div id="page-actions-menu" class="page-actions-menu" hidden> <button id="default-page-action"
                                type="button" data-page-action="default">设为默认首屏</button> <button type="button"
                                data-page-action="rename">重命名</button> <button type="button"
                                data-page-action="duplicate">复制</button> <button type="button" class="danger"
                                data-page-action="delete">删除</button> </div>
                    </div>
                </div>
                <div class="popup-control" hidden>
                    <div class="dashboard-control-heading"><span>全局组合弹窗</span><button id="popup-new" type="button"
                            disabled>新建</button></div> <select id="popup-select" data-native-select="true"
                        aria-label="选择组合弹窗" hidden disabled>
                        <option value="">暂无组合弹窗</option>
                    </select> <button id="popup-actions-button" type="button" hidden disabled
                        aria-hidden="true"></button>
                    <div id="popup-list" class="popup-list" role="listbox" aria-label="已创建的组合弹窗"></div>
                    <div id="popup-actions-menu" class="page-actions-menu popup-list-context-menu" hidden> <button
                            type="button" data-popup-action="rename">重命名</button> <button type="button"
                            data-popup-action="duplicate">复制</button> <button type="button" class="danger"
                            data-popup-action="delete">删除</button> </div>
                </div>
                <div class="element-list-tabs" role="tablist" aria-label="控件分类"> <button id="show-shared-components"
                        class="active" type="button" role="tab">侧边栏</button> <button id="show-page-components"
                        type="button" role="tab">主页面</button> </div> <button id="add-component-button"
                    class="add-element-button" type="button" title="从模板库添加控件" disabled>＋ 添加控件</button>
                <div id="shared-component-list" class="element-list"></div>
                <div id="page-component-list" class="element-list" hidden></div>
            </div>
        </aside>
        <section class="workspace-panel">
            <div class="workspace-heading">
                <div class="workspace-heading-copy">
                    <h2 id="workspace-title">页面画布</h2><span id="workspace-resolution" class="workspace-resolution"
                        hidden></span>
                    <p id="dashboard-display-hint" class="dashboard-display-hint" hidden>展示地址 <a
                            id="dashboard-display-link" target="_blank" rel="noopener noreferrer"></a></p>
                </div>
                <div class="workspace-toolbar">
                    <div class="workspace-primary-actions">
                        <div class="history-toolbar-actions" aria-label="编辑历史"><button id="undo"
                                class="history-toolbar-button" type="button" title="撤销（最多 10 步）" aria-label="撤销"
                                disabled><svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M10 5 4 10l6 5" />
                                    <path d="M4 10h10a5 5 0 0 1 0 10H9" />
                                </svg></button><button id="redo" class="history-toolbar-button" type="button"
                                title="重做（最多 10 步）" aria-label="重做" disabled><svg viewBox="0 0 24 24"
                                    aria-hidden="true">
                                    <path d="m14 5 6 5-6 5" />
                                    <path d="M20 10H10a5 5 0 0 0 0 10h5" />
                                </svg></button></div>
                        <div class="workspace-modes" role="tablist" aria-label="中间区域显示内容"><button
                                id="show-editor-preview" class="active" type="button" role="tab"
                                aria-selected="true">编辑</button><button id="show-dashboard-preview" type="button"
                                role="tab" aria-selected="false">仪表盘</button></div>
                        <div class="workspace-save-actions"><button id="save" class="primary editor-save workspace-save"
                                type="button" disabled>保存</button></div>
                    </div>
                </div>
            </div>
            <div class="workspace empty">
                <div id="editor-canvas" class="workspace-empty-state">
                    <div class="canvas-message"><strong>请从左侧新建仪表盘。</strong></div>
                </div>
                <div id="dashboard-preview" class="workspace-mode-surface dashboard-preview canvas-placeholder" hidden>
                    <div class="canvas-message"><strong>请从左侧新建仪表盘。</strong></div>
                </div>
                <div id="custom-popup-editor" class="workspace-mode-surface custom-popup-editor" hidden></div>
            </div>
        </section>
        <aside
          class="panel inspector"
          :class="{ 'is-collapsed': editorStore.rightCollapsed }"
          :aria-hidden="editorStore.rightCollapsed"
        >
            <div class="panel-heading">
                <h2>属性</h2>
            </div>
            <div id="inspector-empty" class="property-section inspector-empty">
                <p>选择一个控件开始编辑。</p>
            </div>
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
            <form id="camera-inspector" class="inspector-form" hidden>
                <section class="inspector-section">
                    <h3>基础</h3>
                    <div class="inspector-grid two-columns"><label>类型<input id="camera-type" value="摄像头实时预览"
                                readonly></label><label>备注<input id="camera-label" maxlength="128"></label>
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
                            aria-label="摄像头实时预览比例"><button type="button" data-camera-fit="contain">原始比例</button><button
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
        </aside>
    </main>
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
  </div>
</template>
