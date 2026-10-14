<script setup lang="ts">
/**
 * Vue 壳层（顶栏 / 分栏折叠 / 缩放 / 快捷键）+ 既有 DOM 契约供 bootEditor 操作。
 */
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { loadClassicScript } from "@/studio/platform/useLegacyPage";
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
import { SETTINGS_ROUTES } from "@/shared/utils/registry/settings-route.util";
import EditorMediaInspectors from "@/studio/chrome/editor/EditorMediaInspectors.vue";
import EditorChartInspectors from "@/studio/chrome/editor/EditorChartInspectors.vue";
import EditorDeviceInspectors from "@/studio/chrome/editor/EditorDeviceInspectors.vue";
import EditorButtonInspectors from "@/studio/chrome/editor/EditorButtonInspectors.vue";
import EditorLayoutInspectors from "@/studio/chrome/editor/EditorLayoutInspectors.vue";
import EditorDialogs from "@/studio/chrome/editor/EditorDialogs.vue";
import EditorOverlays from "@/studio/chrome/editor/EditorOverlays.vue";

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
  await import("@app/shared/update-notice");
  const storeLinks = await import("@/shared/utils/store-links.util");
  void storeLinks.applyStoreLinks();
  const editor = await import("@app/editor/boot");
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
          :disabled="!editorStore.dirty || editorStore.saveState === 'saving'"
          @click="editorStore.command({ type: 'save' })"
        >
          保存
        </button>
      </template>
    </StudioTopBar>

    <StudioShortcutsOverlay
      :open="editorStore.showShortcuts"
      title="仪表盘编辑器快捷键"
      :rows="EDITOR_SHORTCUT_ROWS"
      @close="editorStore.showShortcuts = false"
    />

    <!-- 保留旧 header / #save 供引擎查询，视觉由 Vue 顶栏接管 -->
    <header class="editor-header sc-legacy-hidden" aria-hidden="true">
        <div class="brand-lockup"><img class="brand-icon"
                src="/static/assets/icons/homeos-mark-white-orange.svg" alt=""><strong>HomeOS</strong><span
                class="version">0.7.5</span></div>
        <button id="save" class="primary editor-save" type="button" disabled>保存</button>
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
            <EditorMediaInspectors />
            <EditorLayoutInspectors />
            <EditorButtonInspectors />
            <EditorChartInspectors />
            <EditorDeviceInspectors />
        </aside>
    </main>
    <EditorDialogs />
    <EditorOverlays />
  </div>
</template>
