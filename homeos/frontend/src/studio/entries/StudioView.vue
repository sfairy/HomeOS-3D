<script setup lang="ts">
/**
 * Vue 壳层（顶栏 / 工作流 / 平面聚焦 / 撤销）+ 既有 DOM 契约供 bootStudio 操作。
 */
import { computed, onBeforeUnmount, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useStudioFloorplanStore } from "@/stores/studio-floorplan.store";
import {
  STUDIO_SHORTCUT_ROWS,
  StudioShortcutsOverlay,
  StudioTopBar,
} from "@/studio/chrome";
import "@/studio/chrome/studio-chrome.css";
import { Undo2, Redo2, Focus, PanelsTopLeft } from "@lucide/vue";
import StudioPlanPanel from "@/studio/chrome/creator/StudioPlanPanel.vue";
import StudioDialogs from "@/studio/chrome/creator/StudioDialogs.vue";
import StudioOverlays from "@/studio/chrome/creator/StudioOverlays.vue";

const WORKFLOW_STEPS = [
  { id: "background", label: "导入底图" },
  { id: "scale", label: "标定比例" },
  { id: "walls", label: "绘制空间" },
  { id: "items", label: "摆放物件" },
  { id: "lights", label: "放置灯光" },
  { id: "export", label: "保存图片" },
] as const;

const route = useRoute();
const router = useRouter();
const floorplanStore = useStudioFloorplanStore();

/** 舞台 iframe / 自动导图嵌入态：不挂创作顶栏，避免步骤条叠进 3D 画布 */
const showCreatorChrome = computed(
  () =>
    route.meta.bodyClass !== "interaction3d-stage" &&
    route.query["auto-diagram-embed"] !== "1",
);

const rootClass = computed(() => [
  "studio-chrome-root",
  !showCreatorChrome.value ? "sc-embed-stage" : "",
  floorplanStore.libraryCollapsed ? "sc-shell--library-rail" : "",
  floorplanStore.planFocus ? "sc-shell--plan-focus" : "",
]);

let teardownStudio: (() => void) | null = null;
let disposed = false;

function goBack() {
  router.push("/studio/editor").catch(() => {
    router.push("/settings").catch(() => undefined);
  });
}

function jumpStep(step: string) {
  floorplanStore.command({ type: "setWorkflowStep", step });
}

onMounted(async () => {
  floorplanStore.bindFacade();
  await import("@app/3d-studio/stage-startup");
  const studio = await import("@app/3d-studio/authoring/lifecycle");
  if (disposed) return;
  studio.bootStudio();
  teardownStudio = studio.teardownStudio;
  floorplanStore.command({
    type: "setLibraryCollapsed",
    collapsed: floorplanStore.libraryCollapsed,
  });
  floorplanStore.command({ type: "setPlanFocus", focus: floorplanStore.planFocus });
  // 嵌入舞台：壳层裁成全屏后再催一次 resize，避免首帧按错误视口框相机
  if (!showCreatorChrome.value) {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }
});

onBeforeUnmount(() => {
  disposed = true;
  floorplanStore.unbindFacade();
  const dispose = teardownStudio;
  teardownStudio = null;
  dispose?.();
});
</script>

<template>
  <div :class="rootClass">
    <StudioTopBar
      v-if="showCreatorChrome"
      title="户型图绘制"
      eyebrow="HOMEOS · 3D STUDIO"
      back-label="返回编辑器"
      :dirty="floorplanStore.dirty"
      :save-state="floorplanStore.saveState"
      show-left-toggle
      :left-collapsed="floorplanStore.libraryCollapsed"
      @back="goBack"
      @toggle-left="floorplanStore.toggleLibrary()"
      @shortcuts="floorplanStore.showShortcuts = true"
    >
      <template #center>
        <ol class="sc-workflow" aria-label="制作步骤">
          <li v-for="(step, index) in WORKFLOW_STEPS" :key="step.id">
            <button
              type="button"
              class="sc-workflow__step"
              :class="{
                'is-active': floorplanStore.workflowStep === step.id,
              }"
              :data-step="step.id"
              @click="jumpStep(step.id)"
            >
              <i>{{ index + 1 }}</i>{{ step.label }}
            </button>
          </li>
        </ol>
      </template>
      <template #actions>
        <button
          type="button"
          class="sc-btn sc-btn--icon"
          title="撤销"
          :disabled="!floorplanStore.canUndo"
          @click="floorplanStore.command({ type: 'undo' })"
        >
          <Undo2 class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          class="sc-btn sc-btn--icon"
          title="重做"
          :disabled="!floorplanStore.canRedo"
          @click="floorplanStore.command({ type: 'redo' })"
        >
          <Redo2 class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          class="sc-btn"
          :class="{ 'sc-btn--active': floorplanStore.planFocus }"
          title="平面聚焦"
          @click="floorplanStore.togglePlanFocus()"
        >
          <Focus class="w-3.5 h-3.5" />
          平面聚焦
        </button>
        <button
          type="button"
          class="sc-btn"
          :class="{ 'sc-btn--active': !floorplanStore.libraryCollapsed }"
          title="资源库"
          @click="floorplanStore.toggleLibrary()"
        >
          <PanelsTopLeft class="w-3.5 h-3.5" />
          资源库
        </button>
      </template>
    </StudioTopBar>

    <StudioShortcutsOverlay
      v-if="showCreatorChrome"
      :open="floorplanStore.showShortcuts"
      title="户型图绘制快捷键"
      :rows="STUDIO_SHORTCUT_ROWS"
      @close="floorplanStore.showShortcuts = false"
    />

    <!-- 保留旧 header 供引擎查询 id（project-name / save-state / studio-back-link / workflow） -->
    <header class="studio-header sc-legacy-hidden" aria-hidden="true">
        <div class="header-leading"> <img class="brand-logo"
                src="/static/assets/icons/homeos-mark-white-orange.svg" alt="HomeOS">
            <div class="header-title">
                <p>HOMEOS · DESKTOP CREATOR</p>
                <div class="header-title-row">
                    <h1 id="project-name">户型图绘制</h1> <a id="studio-back-link" class="back-link" href="/"
                        aria-label="返回编辑器">← <span>返回编辑器</span></a>
                </div>
            </div>
        </div>
        <div class="workflow-center">
            <ol class="workflow-steps" aria-label="制作步骤">
                <li data-step="background"><i>1</i>导入底图</li>
                <li data-step="scale"><i>2</i>标定比例</li>
                <li data-step="walls"><i>3</i>绘制空间</li>
                <li data-step="items"><i>4</i>摆放物件</li>
                <li data-step="lights"><i>5</i>放置灯光</li>
                <li data-step="export"><i>6</i>保存图片</li>
            </ol>
        </div>
        <div class="header-actions"> <span id="save-state" class="save-state"><i></i>正在载入…</span> </div>
    </header>
    <main class="studio-shell">
        <aside
          class="library-panel panel-surface"
          :class="{ 'is-collapsed': floorplanStore.libraryCollapsed }"
          :aria-hidden="floorplanStore.libraryCollapsed"
        >
            <section class="start-card">
                <div class="start-card-row">
                    <h2>户型底图</h2>
                    <div class="background-actions"><button id="import-plan" class="primary-action"
                            type="button">导入</button><button id="toggle-background" type="button"
                            disabled>隐藏</button><button id="remove-plan" type="button"
                            disabled>移除</button></div>
                </div> <input id="plan-file" type="file"
                    accept=".png,.jpg,.jpeg,.webp,.svg,.bmp,.gif,image/png,image/jpeg,image/webp,image/svg+xml,image/bmp,image/gif"
                    hidden>
                <div id="background-import-error" class="background-import-error" hidden>
                    <p id="background-import-message" role="alert"></p> <button id="background-import-copy"
                        type="button">复制诊断信息</button>
                    <details>
                        <summary>查看详情</summary><textarea id="background-import-details" aria-label="底图导入诊断信息"
                            readonly rows="10"></textarea>
                    </details>
                </div>
            </section>
            <section class="floor-manager-card">
                <div class="start-card-row">
                    <h2>楼层</h2>
                    <div class="floor-heading-actions"><button id="align-floor" type="button" hidden
                            disabled>对齐楼层</button><button id="add-floor" type="button">新增楼层</button></div>
                </div>
                <div id="floor-list" class="floor-list" aria-label="楼层列表"></div>
            </section>
            <section class="model-settings-card">
                <div class="model-settings-row">
                    <h2>墙体</h2><label title="墙高（m）"><span>高</span><input id="global-wall-height" aria-label="墙高（米）"
                            type="number" min="0.01" max="6" step="0.01" value="2.4"></label><label
                        title="墙厚（m）"><span>厚</span><input id="global-wall-thickness" aria-label="墙厚（米）" type="number"
                            min="0.01" max="3" step="0.01" value="0.15"></label>
                </div>
                <div class="model-settings-option-row"><label title="通用墙体透明度"><span>透明度</span><input
                            id="global-wall-opacity" aria-label="通用墙体透明度（百分比）" type="number" min="0" max="100" step="1"
                            value="25"></label><span class="floor-edge-label">橙边</span><button id="toggle-floor-edge"
                        type="button" aria-pressed="true">显示</button></div>
            </section>
            <section class="asset-library-card">
                <div class="section-heading">
                    <div><span class="eyebrow">OBJECTS</span>
                        <h2>模型库</h2>
                    </div><input id="asset-search" class="asset-search" type="search" placeholder="搜索模型"
                        aria-label="搜索当前分类模型" autocomplete="off" spellcheck="false">
                </div>
                <div class="asset-category-tabs" role="group" aria-label="模型分类"><button class="active" type="button"
                        data-asset-category="home" aria-pressed="true">家居</button><button type="button"
                        data-asset-category="appliance" aria-pressed="false">电器</button><button type="button"
                        data-asset-category="courtyard" aria-pressed="false">庭院</button><button type="button"
                        data-asset-category="light" aria-pressed="false">灯光</button></div>
                <p id="asset-search-empty" class="asset-search-empty" role="status" hidden>当前分类没有匹配的模型</p>
                <div id="light-asset-row" class="light-asset-row" aria-label="灯具模板" hidden><button
                        class="asset-card light-asset-card" type="button" draggable="true" data-item-type="downlight"
                        aria-label="筒射灯" title="筒射灯"><span class="light-asset-icon light-asset-icon-downlight"
                            aria-hidden="true"></span></button><button class="asset-card light-asset-card" type="button"
                        draggable="true" data-item-type="ceilinglight" aria-label="吸顶灯" title="吸顶灯"><span
                            class="light-asset-icon light-asset-icon-ceiling" aria-hidden="true"></span></button><button
                        class="asset-card light-asset-card" type="button" draggable="true" data-item-type="striplight"
                        aria-label="灯带" title="灯带"><span class="light-asset-icon light-asset-icon-strip"
                            aria-hidden="true"></span></button></div>
                <section id="light-layer-panel" class="light-layer-panel" hidden>
                    <div class="light-layer-heading">
                        <div><button id="light-groups-off" type="button">全关</button><button id="add-light-group"
                                type="button" title="新建灯组">新建灯组</button></div>
                    </div>
                    <div id="light-group-list" class="light-group-list"></div>
                </section>
                <div id="asset-grid" class="asset-grid" aria-label="模型库">
                    <div class="asset-group-heading" data-asset-heading-category="home">客厅常用</div> <button
                        class="asset-card" type="button" draggable="true" data-item-type="sofa"
                        data-asset-subcategory="living"><i>▰</i><span>沙发</span><small>2.20 × 0.90m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="sofa-single"
                        data-asset-subcategory="living"><i>▰</i><span>单人沙发</span><small>1.05 × 0.90m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="sofa-l"
                        data-asset-subcategory="living"><i>▰</i><span>L 型沙发</span><small>2.80 × 1.60m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="coffeetable"
                        data-asset-subcategory="living"><i>▭</i><span>组合茶几</span><small>1.90 × 1.05m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="squarecoffeetable"
                        data-asset-subcategory="living"><i>▦</i><span>方茶几</span><small>1.40 × 0.70m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="tea-table-set"
                        data-asset-subcategory="living"><i>▦</i><span>组合茶桌</span><small>1.61 × 1.40m ·
                            含圈椅</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="tvstand" data-asset-subcategory="living"><i>▬</i><span>电视柜</span><small>1.80 ×
                            0.42m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="piano" data-asset-subcategory="living"><i>▰</i><span>钢琴</span><small>1.80 ×
                            1.80m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="pool-table" data-asset-subcategory="living"><i>▤</i><span>台球桌</span><small>2.54
                            × 1.42m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="guitar-stand"
                        data-asset-subcategory="living"><i>▤</i><span>吉他＋支架</span><small>0.46 × 0.48m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="cat-tree"
                        data-asset-subcategory="living"><i>▤</i><span>猫爬架</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="pet-bed-bowls"
                        data-asset-subcategory="living"><i>▤</i><span>宠物窝＋食盆</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="side-table"
                        data-asset-subcategory="living"><i>▤</i><span>边几</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="rocking-chair"
                        data-asset-subcategory="living"><i>▤</i><span>摇椅</span><small>0.62 × 1.15m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="drum-kit"
                        data-asset-subcategory="living"><i>▤</i><span>架子鼓</span><small>1.83 × 1.44m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="keyboard-stand"
                        data-asset-subcategory="living"><i>▤</i><span>电子琴＋支架</span><small>1.03 × 0.36m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="bicycle-rack"
                        data-asset-subcategory="living"><i>▤</i><span>自行车＋停放架</span><small>0.64 × 1.77m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="mahjong-table"
                        data-asset-subcategory="living"><i>▤</i><span>麻将桌</span><small>0.94 × 0.94m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="ping-pong-table"
                        data-asset-subcategory="living"><i>▤</i><span>乒乓球桌</span><small>1.68 × 2.74m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="cello-stand"
                        data-asset-subcategory="living"><i>▤</i><span>大提琴＋支架</span><small>0.55 × 0.55m</small></button>
                    <div class="asset-group-heading" data-asset-heading-category="home">装饰</div> <button
                        class="asset-card" type="button" draggable="true" data-item-type="decor-books"
                        data-asset-subcategory="decor"><i>▤</i><span>书本组合</span><small>0.28 × 0.21m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="decor-vase"
                        data-asset-subcategory="decor"><i>⚘</i><span>陶瓷花瓶</span><small>0.23 × 0.15m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="decor-tea-tray"
                        data-asset-subcategory="decor"><i>☕</i><span>托盘杯子</span><small>0.34 × 0.23m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="decor-tissue-box"
                        data-asset-subcategory="decor"><i>▱</i><span>纸巾盒</span><small>0.23 × 0.13m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="decor-small-plant"
                        data-asset-subcategory="decor"><i>✦</i><span>小盆栽</span><small>0.24 × 0.22m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="plant"
                        data-asset-subcategory="decor"><i>✦</i><span>绿植</span><small>0.75 × 0.75m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="rug"
                        data-asset-subcategory="decor"><i>▨</i><span>地毯</span><small>2.00 × 1.40m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="aquarium"
                        data-asset-subcategory="decor"><i>▣</i><span>鱼缸</span><small>1.50 × 0.55m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="full-length-mirror"
                        data-asset-subcategory="decor"><i>▤</i><span>穿衣镜</span><small>0.52 × 0.35m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="round-rug"
                        data-asset-subcategory="decor"><i>▤</i><span>圆形地毯</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="wall-art"
                        data-asset-subcategory="decor"><i>▤</i><span>挂画</span><small>0.64 × 0.04m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="wall-clock"
                        data-asset-subcategory="decor"><i>▤</i><span>挂钟</span><small>0.36 × 0.06m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="desktop-frame"
                        data-asset-subcategory="decor"><i>▤</i><span>桌面相框</span><small>0.22 × 0.13m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="dartboard"
                        data-asset-subcategory="decor"><i>▤</i><span>飞镖靶</span><small>0.47 × 0.20m</small></button>
                    <div class="asset-group-heading" data-asset-heading-category="home">卧室与书房</div> <button
                        class="asset-card" type="button" draggable="true" data-item-type="bed"
                        data-asset-subcategory="bedroom"><i>▤</i><span>双人床</span><small>1.92 × 2.18m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="bunk-bed"
                        data-asset-subcategory="bedroom"><i>▤</i><span>上下铺</span><small>1.18 × 2.06m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="wardrobe"
                        data-asset-subcategory="bedroom"><i>▤</i><span>衣柜</span><small>1.80 × 0.64m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="drawer-chest"
                        data-asset-subcategory="bedroom"><i>▤</i><span>斗柜</span><small>1.05 × 0.45m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="nightstand"
                        data-asset-subcategory="bedroom"><i>▣</i><span>床头柜</span><small>0.50 × 0.42m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="curtain"
                        data-asset-subcategory="bedroom"><i>▥</i><span>窗帘</span><small>1.80 × 0.18m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="vanity"
                        data-asset-subcategory="bedroom"><i>◫</i><span>梳妆台</span><small>1.20 × 0.50m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="desk"
                        data-asset-subcategory="bedroom"><i>▱</i><span>桌子</span><small>1.40 × 0.65m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="office-chair"
                        data-asset-subcategory="bedroom"><i>▤</i><span>办公椅</span><small>0.64 × 0.66m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="bookcase"
                        data-asset-subcategory="bedroom"><i>▥</i><span>书架</span><small>1.20 × 0.32m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="baby-crib"
                        data-asset-subcategory="bedroom"><i>▤</i><span>婴儿床</span><small>0.83 × 1.43m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="rocking-horse"
                        data-asset-subcategory="bedroom"><i>▤</i><span>玩具木马</span><small>0.56 × 1.08m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="yoga-set"
                        data-asset-subcategory="bedroom"><i>▤</i><span>瑜伽垫＋健身球</span><small>1.36 × 1.80m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="easel-board"
                        data-asset-subcategory="bedroom"><i>▤</i><span>画架＋画板</span><small>0.75 × 0.83m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="dumbbell-rack"
                        data-asset-subcategory="bedroom"><i>▤</i><span>哑铃架＋哑铃</span><small>1.05 × 0.60m</small></button>
                    <div class="asset-group-heading" data-asset-heading-category="home">餐厅与收纳</div> <button
                        class="asset-card" type="button" draggable="true" data-item-type="table"
                        data-asset-subcategory="dining"><i>▦</i><span>餐桌组合</span><small>2.40 × 1.80m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="rounddiningtable"
                        data-asset-subcategory="dining"><i>◉</i><span>圆形餐桌</span><small>2.20 × 2.20m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="chair"
                        data-asset-subcategory="dining"><i>◇</i><span>椅子</span><small>0.50 × 0.50m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="bar"
                        data-asset-subcategory="dining"><i>▰</i><span>吧台</span><small>2.20 × 0.65m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="sideboard"
                        data-asset-subcategory="dining"><i>▤</i><span>餐边柜</span><small>1.60 × 0.45m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="shoecabinet"
                        data-asset-subcategory="dining"><i>▥</i><span>鞋柜</span><small>1.80 × 0.42m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="cabinet"
                        data-asset-subcategory="dining"><i>▥</i><span>储物柜</span><small>1.60 × 0.45m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="glasscabinet"
                        data-asset-subcategory="dining"><i>▧</i><span>玻璃柜</span><small>1.20 × 0.40m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="shelf"
                        data-asset-subcategory="dining"><i>▤</i><span>货架</span><small>1.20 × 0.45m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="mural"
                        data-asset-subcategory="living"><i>❐</i><span>壁画</span><small>1.20 × 0.80m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="featurewall"
                        data-asset-subcategory="living"><i>❏</i><span>背景墙</span><small>3.00 × 2.40m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="wallcabinet"
                        data-asset-subcategory="dining"><i>▧</i><span>吊柜</span><small>1.50 × 0.35m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="coat-rack"
                        data-asset-subcategory="dining"><i>▤</i><span>衣帽架</span><small>0.45 × 0.43m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="bar-stool"
                        data-asset-subcategory="dining"><i>▤</i><span>吧台椅</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="laundry-basket"
                        data-asset-subcategory="dining"><i>▤</i><span>洗衣篮</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="single-rail-rack"
                        data-asset-subcategory="dining"><i>▤</i><span>单杆晾衣架</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="drying-rack"
                        data-asset-subcategory="dining"><i>▤</i><span>落地晾衣架</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="storage-cart"
                        data-asset-subcategory="dining"><i>▤</i><span>三层收纳推车</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="storage-box"
                        data-asset-subcategory="dining"><i>▤</i><span>收纳箱</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="trash-bin"
                        data-asset-subcategory="dining"><i>▤</i><span>垃圾桶</span><small>0.32 × 0.34m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="child-highchair"
                        data-asset-subcategory="dining"><i>▤</i><span>儿童餐椅</span><small>0.59 × 0.70m</small></button>
                    <div class="asset-group-heading" data-asset-heading-category="home">厨房固定家具</div> <button
                        class="asset-card" type="button" draggable="true" data-item-type="kitchenbase"
                        data-asset-subcategory="kitchen-bath"><i>▤</i><span>厨房地柜</span><small>2.40 ×
                            0.60m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="kitchensink"
                        data-asset-subcategory="kitchen-bath"><i>▣</i><span>地柜带水盆</span><small>1.20 ×
                            0.60m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="kitchencooktop"
                        data-asset-subcategory="kitchen-bath"><i>▦</i><span>地柜带燃气灶</span><small>1.20 ×
                            0.60m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="kitchenisland"
                        data-asset-subcategory="kitchen-bath"><i>▭</i><span>岛台</span><small>2.40 ×
                            0.80m</small></button>
                    <div class="asset-group-heading" data-asset-heading-category="home">卫浴</div> <button
                        class="asset-card" type="button" draggable="true" data-item-type="basin"
                        data-asset-subcategory="kitchen-bath"><i>◉</i><span>台盆</span><small>0.90 ×
                            0.50m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="toilet" data-asset-subcategory="kitchen-bath"><i>◒</i><span>马桶</span><small>0.42
                            × 0.70m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="squattoilet"
                        data-asset-subcategory="kitchen-bath"><i>▱</i><span>蹲便</span><small>0.45 ×
                            0.65m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="urinal"
                        data-asset-subcategory="kitchen-bath"><i>◖</i><span>小便斗</span><small>0.38 ×
                            0.34m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="shower" data-asset-subcategory="kitchen-bath"><i>♨</i><span>花洒</span><small>0.90
                            × 0.90m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="bathtub"
                        data-asset-subcategory="kitchen-bath"><i>▱</i><span>浴缸</span><small>1.70 ×
                            0.78m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="glasspartition"
                        data-asset-subcategory="kitchen-bath"><i>▥</i><span>玻璃隔断</span><small>1.20 ×
                            0.08m</small></button>
                    <div class="asset-group-heading" data-asset-heading-category="home">结构与特殊物件</div> <button
                        class="asset-card" type="button" draggable="true" data-item-type="stairs"
                        data-asset-subcategory="structure"><i>⇧</i><span>楼梯</span><small>1.00 × 2.80m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="steelstairs"
                        data-asset-subcategory="structure"><i>⇧</i><span>钢楼梯</span><small>1.86 × 2.93m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="glassstairs"
                        data-asset-subcategory="structure"><i>⇧</i><span>玻璃楼梯</span><small>2.51 × 2.84m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="floatingstairs"
                        data-asset-subcategory="structure"><i>⇧</i><span>悬空楼梯</span><small>0.97 × 2.25m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="pillar"
                        data-asset-subcategory="structure"><i>▣</i><span>柱子</span><small>0.45 × 0.45m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="smallcar"
                        data-asset-subcategory="structure"><i>◆</i><span>小汽车</span><small>2.19 × 5.01m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="suv"
                        data-asset-subcategory="structure"><i>◆</i><span>SUV</span><small>2.09 × 4.76m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="scooter"
                        data-asset-subcategory="structure"><i>◆</i><span>踏板车</span><small>0.77 × 1.90m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="elevator"
                        data-asset-subcategory="structure"><i>⇧</i><span>电梯</span><small>1.40 × 1.52m</small></button>
                    <div class="asset-group-heading" data-asset-heading-category="courtyard">乔木与绿植</div> <button
                        class="asset-card" type="button" draggable="true" data-item-type="garden-tree"
                        data-asset-subcategory="courtyard-0"><i>♣</i><span>庭院乔木</span><small>2.20 ×
                            2.10m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-tree-rounded"
                        data-asset-subcategory="courtyard-0"><i>♣</i><span>圆冠乔木</span><small>2.10 ×
                            2.10m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-tree-columnar"
                        data-asset-subcategory="courtyard-0"><i>♠</i><span>柱形乔木</span><small>1.00 ×
                            1.00m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-tree-multistem"
                        data-asset-subcategory="courtyard-0"><i>♣</i><span>多干小乔木</span><small>2.10 ×
                            1.80m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-conifer"
                        data-asset-subcategory="courtyard-0"><i>♠</i><span>景观松树</span><small>1.50 ×
                            1.50m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-conifer-layered"
                        data-asset-subcategory="courtyard-0"><i>♠</i><span>层叠景松</span><small>2.00 ×
                            1.65m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-bamboo-dense"
                        data-asset-subcategory="courtyard-0"><i>♧</i><span>浓密竹丛</span><small>1.20 ×
                            1.00m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-shrub"
                        data-asset-subcategory="courtyard-0"><i>♣</i><span>灌木丛</span><small>0.95 ×
                            0.85m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-shrub-low"
                        data-asset-subcategory="courtyard-0"><i>♣</i><span>低矮圆灌木</span><small>1.10 ×
                            0.90m</small></button>
                    <div class="asset-group-heading" data-asset-heading-category="courtyard">花坛与花器</div> <button
                        class="asset-card" type="button" draggable="true" data-item-type="garden-planter"
                        data-asset-subcategory="courtyard-1"><i>❀</i><span>长条花箱</span><small>1.50 ×
                            0.50m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-planter-trough"
                        data-asset-subcategory="courtyard-1"><i>▤</i><span>石质长花槽</span><small>1.60 ×
                            0.55m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-flowerbed"
                        data-asset-subcategory="courtyard-1"><i>✿</i><span>花坛</span><small>1.40 × 0.80m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="garden-flowers"
                        data-asset-subcategory="courtyard-1"><i>✿</i><span>花朵组团</span><small>0.90 ×
                            0.75m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-flowers-wild"
                        data-asset-subcategory="courtyard-1"><i>✿</i><span>野花组团</span><small>1.10 ×
                            0.90m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-round-planter"
                        data-asset-subcategory="courtyard-1"><i>♣</i><span>圆形灌木花盆</span><small>0.75 ×
                            0.75m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-planter-square"
                        data-asset-subcategory="courtyard-1"><i>▣</i><span>方形花盆</span><small>0.70 ×
                            0.70m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-large-planter"
                        data-asset-subcategory="courtyard-1"><i>✧</i><span>高盆观叶植物</span><small>0.70 ×
                            0.70m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-vegetable-bed"
                        data-asset-subcategory="courtyard-1"><i>✿</i><span>菜圃模块</span><small>1.50 ×
                            1.00m</small></button>
                    <div class="asset-group-heading" data-asset-heading-category="courtyard">休闲家具</div> <button
                        class="asset-card" type="button" draggable="true" data-item-type="garden-bench"
                        data-asset-subcategory="courtyard-2"><i>▰</i><span>户外长椅</span><small>1.60 ×
                            0.60m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-bench-backless"
                        data-asset-subcategory="courtyard-2"><i>▬</i><span>无靠背长凳</span><small>1.50 ×
                            0.44m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-bench-curved"
                        data-asset-subcategory="courtyard-2"><i>⌒</i><span>弧形景观长凳</span><small>1.80 ×
                            0.68m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-chair"
                        data-asset-subcategory="courtyard-2"><i>▱</i><span>户外扶手椅</span><small>0.72 ×
                            0.76m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-chair-bistro"
                        data-asset-subcategory="courtyard-2"><i>♧</i><span>圆背庭院椅</span><small>0.55 ×
                            0.58m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-table"
                        data-asset-subcategory="courtyard-2"><i>▦</i><span>户外餐桌</span><small>1.60 ×
                            0.85m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-table-round"
                        data-asset-subcategory="courtyard-2"><i>◉</i><span>圆形庭院桌</span><small>1.05 ×
                            1.05m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-table-picnic"
                        data-asset-subcategory="courtyard-2"><i>▦</i><span>连体野餐桌</span><small>1.80 ×
                            1.60m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-lounger"
                        data-asset-subcategory="courtyard-2"><i>◩</i><span>日光躺椅</span><small>0.72 ×
                            1.95m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-outdoor-sofa"
                        data-asset-subcategory="courtyard-2"><i>▰</i><span>户外双人沙发</span><small>1.70 ×
                            0.82m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-outdoor-coffee-table"
                        data-asset-subcategory="courtyard-2"><i>▦</i><span>户外茶几</span><small>0.95 ×
                            0.55m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-hanging-chair"
                        data-asset-subcategory="courtyard-2"><i>♧</i><span>鸟巢吊椅</span><small>1.10 ×
                            1.15m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-hammock"
                        data-asset-subcategory="courtyard-2"><i>∽</i><span>支架吊床</span><small>1.05 ×
                            3.30m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-swing"
                        data-asset-subcategory="courtyard-2"><i>♧</i><span>庭院秋千</span><small>2.20 ×
                            1.50m</small></button>
                    <div class="asset-group-heading" data-asset-heading-category="courtyard">凉亭与遮阳</div> <button
                        class="asset-card" type="button" draggable="true" data-item-type="garden-pergola"
                        data-asset-subcategory="courtyard-3"><i>⌂</i><span>庭院廊架</span><small>3.20 ×
                            3.20m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-pergola-shade"
                        data-asset-subcategory="courtyard-3"><i>⌂</i><span>遮阳布廊架</span><small>3.20 ×
                            3.20m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-gazebo"
                        data-asset-subcategory="courtyard-3"><i>⌂</i><span>四角凉亭</span><small>3.20 ×
                            3.20m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-gazebo-hex"
                        data-asset-subcategory="courtyard-3"><i>⬡</i><span>六角凉亭</span><small>3.30 ×
                            3.00m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-umbrella"
                        data-asset-subcategory="courtyard-3"><i>☂</i><span>遮阳伞</span><small>2.60 ×
                            2.60m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-umbrella-square"
                        data-asset-subcategory="courtyard-3"><i>☂</i><span>方形遮阳伞</span><small>2.60 ×
                            2.60m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-carport"
                        data-asset-subcategory="courtyard-3"><i>⌂</i><span>庭院车棚</span><small>3.20 ×
                            5.20m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-arch"
                        data-asset-subcategory="courtyard-3"><i>∩</i><span>花园拱门</span><small>1.65 ×
                            0.55m</small></button>
                    <div class="asset-group-heading" data-asset-heading-category="courtyard">水景与景石</div> <button
                        class="asset-card" type="button" draggable="true" data-item-type="garden-pond"
                        data-asset-subcategory="courtyard-4"><i>◉</i><span>景观水池</span><small>2.60 ×
                            1.70m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-pond-round"
                        data-asset-subcategory="courtyard-4"><i>◉</i><span>圆形景观池</span><small>1.80 ×
                            1.80m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-fountain"
                        data-asset-subcategory="courtyard-4"><i>♧</i><span>庭院喷泉</span><small>1.25 ×
                            1.25m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-fountain-wall"
                        data-asset-subcategory="courtyard-4"><i>▣</i><span>壁泉水景</span><small>1.10 ×
                            0.60m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-pool"
                        data-asset-subcategory="courtyard-4"><i>▱</i><span>庭院泳池</span><small>5.00 ×
                            3.00m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-rock-water"
                        data-asset-subcategory="courtyard-4"><i>◆</i><span>假山水景</span><small>2.10 ×
                            1.60m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-rocks"
                        data-asset-subcategory="courtyard-4"><i>◆</i><span>景石组合</span><small>1.30 ×
                            0.90m</small></button>
                    <div class="asset-group-heading" data-asset-heading-category="courtyard">庭院门与设施</div> <button
                        class="asset-card" type="button" draggable="true" data-item-type="garden-gate"
                        data-asset-subcategory="courtyard-5"><i>▣</i><span>庭院门</span><small>1.40 ×
                            0.22m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-gate-solid"
                        data-asset-subcategory="courtyard-5"><i>▣</i><span>双扇实木院门</span><small>1.80 ×
                            0.25m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-gate-arch"
                        data-asset-subcategory="courtyard-5"><i>∩</i><span>拱形铁艺院门</span><small>1.60 ×
                            0.23m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-gate-post"
                        data-asset-subcategory="courtyard-5"><i>▯</i><span>独立门柱</span><small>0.46 ×
                            0.46m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-bollard"
                        data-asset-subcategory="courtyard-5"><i>▯</i><span>草坪灯</span><small>0.20 ×
                            0.20m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-lantern"
                        data-asset-subcategory="courtyard-5"><i>♧</i><span>庭院灯柱</span><small>0.42 ×
                            0.42m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-barbecue"
                        data-asset-subcategory="courtyard-5"><i>▣</i><span>户外烧烤台</span><small>1.25 ×
                            0.60m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-outdoor-sink"
                        data-asset-subcategory="courtyard-5"><i>▣</i><span>户外水槽台</span><small>1.30 ×
                            0.60m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-storage-shed"
                        data-asset-subcategory="courtyard-5"><i>⌂</i><span>户外储物屋</span><small>1.60 ×
                            1.30m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="garden-firepit"
                        data-asset-subcategory="courtyard-5"><i>◉</i><span>庭院火盆</span><small>0.95 ×
                            0.95m</small></button>
                    <div class="asset-group-heading" data-asset-heading-category="appliance">客厅与环境</div> <button
                        class="asset-card" type="button" draggable="true" data-item-type="tv"
                        data-asset-subcategory="media"><i>▭</i><span>电视</span><small>1.50 × 0.18m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="speaker"
                        data-asset-subcategory="media"><i>◉</i><span>智能音响</span><small>0.17 × 0.17m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="camera"
                        data-asset-subcategory="media"><i>◉</i><span>摄像头</span><small>0.12 × 0.12m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="presence"
                        data-asset-subcategory="media"><i>◌</i><span>人体传感器</span><small>0.065 × 0.065m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="wallac"
                        data-asset-subcategory="environment"><i>▬</i><span>挂机空调</span><small>0.90 ×
                            0.22m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="floorac"
                        data-asset-subcategory="environment"><i>◉</i><span>柜机空调</span><small>0.42 ×
                            0.42m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="airer"
                        data-asset-subcategory="environment"><i>↕</i><span>电动晾衣架</span><small>安装与伸展可调</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="fan"
                        data-asset-subcategory="environment"><i>◉</i><span>电风扇</span><small>杆高可调</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="ceiling-fan"
                        data-asset-subcategory="environment"><i>◉</i><span>吊扇</span><small>1.32 × 1.32m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="table-lamp"
                        data-asset-subcategory="environment"><i>⌁</i><span>台灯</span><small>0.28 × 0.28m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="up-down-wall-lamp"
                        data-asset-subcategory="environment"><i>◒</i><span>上下出光壁灯</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="aroma-diffuser"
                        data-asset-subcategory="environment"><i>▤</i><span>香氛机</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="pet-dryer"
                        data-asset-subcategory="environment"><i>▤</i><span>宠物烘干机</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="electric-valve"
                        data-asset-subcategory="environment"><i>▤</i><span>电动阀门</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="treadmill"
                        data-asset-subcategory="environment"><i>▤</i><span>跑步机</span><small>0.82 × 1.78m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="elliptical"
                        data-asset-subcategory="environment"><i>▤</i><span>椭圆机</span><small>0.82 × 1.32m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="airpurifier"
                        data-asset-subcategory="environment"><i>◌</i><span>空气净化器</span><small>0.34 ×
                            0.34m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="humidifier"
                        data-asset-subcategory="environment"><i>▤</i><span>加湿器</span><small>0.21 ×
                            0.22m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="dehumidifier"
                        data-asset-subcategory="environment"><i>▤</i><span>除湿机</span><small>0.34 ×
                            0.26m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="heater" data-asset-subcategory="environment"><i>▤</i><span>取暖器</span><small>0.52
                            × 0.29m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="robotvacuum"
                        data-asset-subcategory="environment"><i>◎</i><span>扫地机器人</span><small>0.55 ×
                            0.50m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="floorlamp"
                        data-asset-subcategory="environment"><i>⌁</i><span>落地灯</span><small>1.35 ×
                            0.50m</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="walllamp"
                        data-asset-subcategory="environment"><i>◒</i><span>壁灯</span><small>0.30 × 0.22m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="airoutlet"
                        data-asset-subcategory="environment"><i>▥</i><span>出风口</span><small>0.19 ×
                            2.00m</small></button>
                    <div class="asset-group-heading" data-asset-heading-category="appliance">厨房电器</div> <button
                        class="asset-card" type="button" draggable="true" data-item-type="fridge"
                        data-asset-subcategory="kitchen"><i>▯</i><span>冰箱</span><small>0.75 × 0.72m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="freezer"
                        data-asset-subcategory="kitchen"><i>▭</i><span>冰柜</span><small>1.05 × 0.60m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="rangehood"
                        data-asset-subcategory="kitchen"><i>◢</i><span>油烟机</span><small>0.90 × 0.45m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="dishwasher"
                        data-asset-subcategory="kitchen"><i>▤</i><span>洗碗机</span><small>0.60 × 0.60m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="steamoven"
                        data-asset-subcategory="kitchen"><i>▣</i><span>蒸烤箱</span><small>0.60 × 0.55m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="microwave"
                        data-asset-subcategory="kitchen"><i>▭</i><span>微波炉</span><small>0.52 × 0.42m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="ricecooker"
                        data-asset-subcategory="kitchen"><i>◉</i><span>电饭煲</span><small>0.28 × 0.32m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="disinfection-cabinet"
                        data-asset-subcategory="kitchen"><i>▤</i><span>消毒柜</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="water-purifier"
                        data-asset-subcategory="kitchen"><i>▤</i><span>净水器主机</span><small>独立模型</small></button>
                    <div class="asset-group-heading" data-asset-heading-category="appliance">洗护</div> <button
                        class="asset-card" type="button" draggable="true" data-item-type="washer"
                        data-asset-subcategory="laundry"><i>◉</i><span>洗衣机</span><small>0.60 × 0.65m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="dryer"
                        data-asset-subcategory="laundry"><i>◎</i><span>烘干机</span><small>0.60 × 0.65m</small></button>
                    <div class="asset-group-heading" data-asset-heading-category="appliance">热水与饮水</div> <button
                        class="asset-card" type="button" draggable="true" data-item-type="storagewaterheater"
                        data-asset-subcategory="water"><i>◉</i><span>储水式热水器</span><small>0.86 × 0.46m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="gaswaterheater"
                        data-asset-subcategory="water"><i>▯</i><span>燃气热水器</span><small>0.42 × 0.22m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="pipelinewaterpurifier"
                        data-asset-subcategory="water"><i>▥</i><span>管线机</span><small>0.62 × 0.20m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="tea_bar_machine"
                        data-asset-subcategory="water"><i>▤</i><span>茶吧机</span><small>0.62 × 0.48m</small></button>
                    <div class="asset-group-heading" data-asset-heading-category="appliance">办公与设备</div> <button
                        class="asset-card" type="button" draggable="true" data-item-type="desktop"
                        data-asset-subcategory="office"><i>▣</i><span>台式电脑</span><small>0.72 × 0.32m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="printer"
                        data-asset-subcategory="office"><i>▤</i><span>打印机</span><small>0.44 × 0.36m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="laptop"
                        data-asset-subcategory="office"><i>⌨</i><span>笔记本电脑</span><small>0.36 × 0.28m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="nas"
                        data-asset-subcategory="office"><i>▦</i><span>NAS</span><small>0.28 × 0.24m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="home-network-cabinet"
                        data-asset-subcategory="office"><i>▤</i><span>家用网络机柜</span><small>0.55 × 0.46m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="smart-display"
                        data-asset-subcategory="office"><i>▤</i><span>智慧屏</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="ps5"
                        data-asset-subcategory="office"><i>▤</i><span>PS5</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="xbox-series-x"
                        data-asset-subcategory="office"><i>▤</i><span>Xbox Series X</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="switch-console"
                        data-asset-subcategory="office"><i>▤</i><span>Switch 游戏机</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="arcade-machine"
                        data-asset-subcategory="office"><i>▤</i><span>游戏街机</span><small>0.75 × 0.80m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="3d-printer"
                        data-asset-subcategory="office"><i>▤</i><span>3D 打印机</span><small>0.46 × 0.46m</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="smart-display-wall"
                        data-asset-subcategory="media"><i>▤</i><span>智慧屏上墙</span><small>独立模型</small></button>
                    <button class="asset-card" type="button" draggable="true" data-item-type="smart-socket-86"
                        data-asset-subcategory="office"><i>▣</i><span>86 型智能插座</span><small>86 × 86 ×
                            12mm</small></button> <button class="asset-card" type="button" draggable="true"
                        data-item-type="router" data-asset-subcategory="office"><i>▤</i><span>路由器</span><small>0.29 ×
                            0.18m</small></button>
                </div>
            </section>
        </aside>
        <StudioPlanPanel />
        <aside
          class="details-panel"
          :class="{ 'is-collapsed': floorplanStore.planFocus }"
          :aria-hidden="floorplanStore.planFocus"
        >
            <section class="preview-card panel-surface">
                <div class="preview-heading">
                    <div class="preview-heading-copy"><span class="eyebrow">LIVE MODEL</span>
                        <div class="preview-title-row">
                            <h2>3D 实时预览</h2><button id="refresh-preview" class="refresh-preview" type="button" hidden
                                disabled>已更新</button><span id="preview-quality-status"
                                class="preview-quality-status" hidden></span>
                        </div>
                    </div>
                    <div class="preview-heading-actions">
                        <div class="preview-primary-controls"> <span class="preview-control-label">预览</span>
                            <div class="preview-scope-controls">
                                <div class="preview-sync-switch" role="group" aria-label="3D 预览同步方式"><button
                                        class="active" type="button" data-preview-sync="live">实时</button><button
                                        type="button" data-preview-sync="manual">手动</button></div>
                                <div class="preview-floor-switch" role="group" aria-label="3D 楼层显示"><button
                                        class="active" type="button" data-preview-floor="active">当前层</button><button
                                        type="button" data-preview-floor="all">全楼</button></div> <label
                                    id="preview-floor-gap-control" class="floor-gap-control" hidden
                                    title="等比例叠加开启后，调小间距可继续靠近，允许重叠"><span>层间距</span><input id="preview-floor-gap"
                                        type="number" min="0" max="20" step="0.1" value="3"><i>m</i></label> <label
                                    id="preview-floor-uniform-control" class="floor-gap-control"
                                    hidden><span>等比例叠加</span><input id="preview-floor-uniform"
                                        type="checkbox"><i>各层同视图</i></label>
                            </div> <span class="preview-control-spacer"></span>
                            <div id="floor-camera-actions" class="fixed-camera-actions" role="group"
                                aria-label="当前楼层视角"> <button id="save-camera-view" type="button"
                                    title="记录当前楼层的角度、缩放和投影方式">保存视角</button> <button id="fixed-camera-view" type="button"
                                    title="恢复当前楼层保存的视角" disabled>恢复视角</button> </div>
                            <div id="overview-camera-actions" class="fixed-camera-actions" role="group"
                                aria-label="全楼总览视角" hidden> <button id="save-overview-view" type="button"
                                    title="保存当前全楼角度和投影方式">保存总览</button> <button id="fixed-overview-view" type="button"
                                    title="恢复上次保存的全楼视角" disabled>恢复总览</button> </div> <button
                                id="open-export" class="open-export" type="button">导图</button>
                        </div>
                        <div class="preview-secondary-controls"> <span class="preview-control-label">相机</span>
                            <div class="preview-camera-settings" aria-label="3D 实时预览视角设置">
                                <div class="preview-view-switch" role="group" aria-label="3D 实时预览视角"><button
                                        class="active" type="button" data-camera-view="free">自由</button><button
                                        type="button" data-camera-view="top">顶视</button><button type="button"
                                        data-camera-rotate-top title="将顶视顺时针旋转 90°" disabled>旋转90°</button>
                                </div>
                                <div class="preview-camera-switch" role="group" aria-label="3D 实时预览投影"><button
                                        class="active" type="button" data-camera-mode="orthographic">正交</button><button
                                        type="button" data-camera-mode="perspective">透视</button></div> <label
                                    class="camera-focal-control" title="仅在透视模式下生效"><span>焦段</span><input
                                        id="preview-camera-focal-length" data-camera-focal-length type="number" min="18"
                                        max="120" step="1" value="50" inputmode="numeric"><i>mm</i></label>
                            </div> <span class="preview-control-spacer"></span> <button id="reset-camera"
                                type="button">重置视角</button>
                        </div>
                    </div>
                    <div class="preview-heading-tip"><small id="preview-control-tip" class="preview-control-tip">左键旋转 ·
                            右键平移 · 滚轮缩放</small><button id="open-base-lighting" class="open-base-lighting"
                            type="button">进阶设置</button></div>
                </div>
                <div id="preview-3d" class="preview-3d" data-style="night">
                    <div id="base-light-controls" class="base-light-controls" hidden>
                        <div class="base-light-controls-header"><strong>基础光调节</strong><span
                                class="base-light-drag-hint">按住拖动</span><button id="close-base-lighting"
                                type="button">关闭</button></div>
                        <div class="base-light-controls-body">
                            <section>
                                <h3>整体</h3>
                                <div class="base-light-control-grid"> <label><span>曝光</span><input
                                            data-base-light-control="exposure" name="base-light-control-exposure"
                                            type="number" min="0.5" max="2" step="0.05" value="1.05"></label>
                                    <label><span>半球光</span><input data-base-light-control="hemisphereIntensity"
                                            name="base-light-control-hemisphereIntensity" type="number" min="0" max="3"
                                            step="0.05" value="0.58"></label> <label><span>环境光</span><input
                                            data-base-light-control="ambientIntensity"
                                            name="base-light-control-ambientIntensity" type="number" min="0" max="2"
                                            step="0.05" value="0.16"></label> </div>
                            </section>
                            <section>
                                <h3>主光与阴影</h3>
                                <div class="base-light-control-grid"> <label><span>强度</span><input
                                            data-base-light-control="mainIntensity"
                                            name="base-light-control-mainIntensity" type="number" min="0" max="5"
                                            step="0.05" value="2.05"></label> <label><span>水平角</span><input
                                            data-base-light-control="mainAzimuth" name="base-light-control-mainAzimuth"
                                            type="number" min="-180" max="180" step="5" value="139"></label>
                                    <label><span>高度角</span><input data-base-light-control="mainElevation"
                                            name="base-light-control-mainElevation" type="number" min="5" max="89"
                                            step="5" value="55"></label> <label><span>阴影浓度</span><input
                                            data-base-light-control="mainShadowIntensity"
                                            name="base-light-control-mainShadowIntensity" type="number" min="0" max="1"
                                            step="0.05" value="0.18"></label> </div>
                            </section>
                            <section>
                                <h3>侧面补光</h3>
                                <div class="base-light-control-grid"> <label><span>强度</span><input
                                            data-base-light-control="fillIntensity"
                                            name="base-light-control-fillIntensity" type="number" min="0" max="3"
                                            step="0.05" value="0.16"></label> <label><span>水平角</span><input
                                            data-base-light-control="fillAzimuth" name="base-light-control-fillAzimuth"
                                            type="number" min="-180" max="180" step="5" value="-48"></label>
                                    <label><span>高度角</span><input data-base-light-control="fillElevation"
                                            name="base-light-control-fillElevation" type="number" min="0" max="89"
                                            step="5" value="28"></label> </div>
                            </section>
                            <section>
                                <h3>顶部补光</h3>
                                <div class="base-light-control-grid"> <label><span>强度</span><input
                                            data-base-light-control="topIntensity"
                                            name="base-light-control-topIntensity" type="number" min="0" max="3"
                                            step="0.05" value="0.12"></label> <label><span>水平角</span><input
                                            data-base-light-control="topAzimuth" name="base-light-control-topAzimuth"
                                            type="number" min="-180" max="180" step="5" value="90"></label>
                                    <label><span>高度角</span><input data-base-light-control="topElevation"
                                            name="base-light-control-topElevation" type="number" min="0" max="89"
                                            step="5" value="86"></label> </div>
                            </section>
                            <div class="base-light-actions"><button id="reset-base-lighting" class="reset-base-lighting"
                                    type="button">恢复默认光照</button><button id="save-base-lighting"
                                    class="save-base-lighting" type="button">保存设置</button></div>
                        </div>
                    </div> <canvas id="preview-light-cache" class="preview-light-cache" hidden></canvas><canvas
                        id="preview-render-shield" class="preview-render-shield" hidden></canvas>
                    <div id="webgl-message" class="webgl-message" hidden>当前浏览器无法创建 3D 画面。</div>
                    <div id="model-loading-status" class="model-loading-status" role="status" aria-live="polite" hidden>
                        <span class="model-loading-spinner" aria-hidden="true"></span><span>正在加载模型…</span></div>
                </div>
            </section>
            <div class="details-divider"> <button id="details-resizer" class="details-resizer" type="button"
                    role="separator" aria-label="拖动调整画布宽度和 3D 预览高度"></button> </div>
            <section class="inspector-card panel-surface">
                <div class="section-heading">
                    <div><span class="eyebrow">PROPERTIES</span>
                        <h2>属性</h2>
                    </div><span id="scene-counts" class="scene-counts">0 墙 · 0 窗 · 0 门 · 0 栏杆 · 0 物件</span>
                </div>
                <div id="inspector-empty" class="inspector-empty"><span>⌁</span><strong>选择画布中的对象</strong>
                    <p>选中墙体、窗户、门或家具后，可在这里精确调整。</p>
                </div>
                <form id="selection-inspector" class="selection-inspector" hidden>
                    <div class="selection-heading"><strong id="selection-title">未选择</strong><span
                            id="selection-id"></span><span id="light-preview-note" class="light-preview-note"
                            title="推荐色温 3500K">推荐色温 3500K</span><label id="item-light-source-visibility-field"
                            class="light-source-visibility-control" title="按最终出光方向显示，导图不会显示" hidden><input
                                id="item-light-source-visible" type="checkbox"
                                checked><span>显示光效范围</span></label></div>
                    <!-- 属性检查器按语义分组：组标题粘性吸顶、可折叠、组内无可见字段时整组自动隐藏
                         （见 studio-app 的 syncInspectorGroups），所以每组都能安全地常驻在标记里。 -->
                    <section class="inspector-group" data-inspector-group="geometry">
                        <button class="inspector-group-header" type="button" aria-expanded="true"><span
                                class="inspector-group-caret" aria-hidden="true"></span><span
                                class="inspector-group-title">尺寸与开口</span><span
                                class="inspector-group-count" hidden></span></button>
                        <div class="inspector-group-body">
                            <div id="wall-fields" class="field-section" hidden> <label>墙长<input id="wall-length"
                                readonly></label>
                        <div class="field-grid"><label>墙高（m）<input id="wall-height" type="number" min="0.01" max="6"
                                    step="0.01"></label><label>厚度（m）<input id="wall-thickness" type="number" min="0.01"
                                    max="3" step="0.01"></label></div>
                        <div class="field-grid wall-opacity-fields"><label>透明度设置<select id="wall-opacity-mode">
                                    <option value="global">跟随通用</option>
                                    <option value="custom">单独设置</option>
                                </select></label><label>透明度（%）<input id="wall-opacity" type="number" min="0" max="100"
                                    step="1"></label></div> <label class="door-type-field"><span>开放端点提醒</span><select
                                id="wall-open-end-mode">
                                <option value="auto">自动判断</option>
                                <option value="allowed">允许开放端点</option>
                            </select></label>
                    </div>
                    <div id="window-fields" class="field-section" hidden>
                        <div class="field-grid"><label>窗宽（m）<input id="window-width" type="number" min="0.3" max="20"
                                    step="0.05"></label><label>窗高（m）<input id="window-height" type="number" min="0.3"
                                    max="20" step="0.05"></label><label>离地（m）<input id="window-sill" type="number"
                                    min="0" max="20" step="0.05"></label><label>墙上位置<input id="window-position"
                                    readonly></label></div> <label
                            class="door-type-field"><span>窗框样式</span><select id="window-divider">
                                <option value="with">显示中间分割</option>
                                <option value="without">不显示中间分割</option>
                            </select></label>
                    </div>
                    <div id="door-fields" class="field-section" hidden> <label class="door-type-field">门类型<select
                                id="door-type">
                                <option value="solid">普通平开门</option>
                                <option value="double">双开门</option>
                                <option value="entry">入户门（常闭）</option>
                                <option value="glass">玻璃平开门</option>
                                <option value="sliding-glass">玻璃推拉门（常开）</option>
                                <option value="roller-shutter">卷帘门</option>
                                <option value="frame-only">仅门框</option>
                            </select></label>
                        <div class="field-grid"><label>门宽（m）<input id="door-width" type="number" min="0.55" max="20"
                                    step="0.05"></label><label>门高（m）<input id="door-height" type="number" min="1.8"
                                    max="20" step="0.05"></label><label>墙上位置<input id="door-position"
                                    readonly></label></div>
                        <div class="door-actions"><button id="door-hinge" type="button">左右换边</button><button
                                id="door-swing" type="button">内外翻转</button></div>
                    </div>
                    <div id="railing-fields" class="field-section" hidden>
                        <div class="field-grid"><label>栏杆宽（m）<input id="railing-width" type="number" min="0.3" max="20"
                                    step="0.05"></label><label>栏杆高（m）<input id="railing-height" type="number" min="0.5"
                                    max="3" step="0.05"></label><label>墙上位置<input id="railing-position"
                                    readonly></label></div>
                            </div>
                        </div>
                    </section>
                    <div id="item-fields" class="field-section" hidden>
                        <section class="inspector-group" data-inspector-group="style">
                            <button class="inspector-group-header" type="button" aria-expanded="true"><span
                                    class="inspector-group-caret" aria-hidden="true"></span><span
                                    class="inspector-group-title">类型与样式</span><span
                                    class="inspector-group-count" hidden></span></button>
                            <div class="inspector-group-body"> <label id="courtyard-gate-style-field"
                            class="door-type-field" hidden>庭院门款式<select id="courtyard-gate-style">
                                <option value="garden-gate">庭院木栅门</option>
                                <option value="garden-gate-solid">双扇实木院门</option>
                                <option value="garden-gate-arch">拱形铁艺院门</option>
                            </select></label>
                        <fieldset id="fridge-style-fields" class="fridge-style-fields" hidden>
                            <legend>冰箱款式</legend> <label><input type="radio" name="fridge-style" value="standard"
                                    checked><span>原款</span></label> <label><input type="radio"
                                    name="fridge-style" value="double"><span>左右双开门</span></label>
                        </fieldset>
                        <div id="curtain-track-fields" hidden> <label class="door-type-field"><span>窗帘形态</span><select
                                    id="curtain-form">
                                    <option value="standard">普通窗帘</option>
                                    <option value="roller">卷帘</option>
                                </select></label> <label class="door-type-field"
                                id="curtain-track-field"><span>轨道形状</span><select id="curtain-track">
                                    <option value="straight">直线型</option>
                                    <option value="l">L 型</option>
                                    <option value="u">U 型</option>
                                </select></label> <label id="curtain-corner-field" class="door-type-field"
                                hidden><span>转角位置</span><select id="curtain-corner">
                                    <option value="left">主边左侧</option>
                                    <option value="right">主边右侧</option>
                                </select></label>
                            <div class="field-grid"> <label id="curtain-left-length-field" hidden>左侧长度（m）<input
                                        id="curtain-left-length" type="number" min="0.2" max="7.8" step="0.05"></label>
                                <label id="curtain-right-length-field" hidden>右侧长度（m）<input id="curtain-right-length"
                                        type="number" min="0.2" max="7.8" step="0.05"></label> <label
                                    id="curtain-meet-field">合拢位置（%）<input id="curtain-meet" type="number" min="5"
                                        max="95" step="1" title="从轨道左端沿轨道计算，50%为总长度的一半"></label> <label>预览打开（%）<input
                                        id="curtain-preview" type="number" min="0" max="100" step="5"
                                        title="0为关闭，100为全开；仅调整模型预览，不控制设备"></label> </div> <label
                                class="door-type-field"><span>帘布类型</span><select id="curtain-fabric">
                                    <option value="cloth">布帘</option>
                                    <option value="sheer">纱帘</option>
                                </select></label>
                            <p class="inspector-note">预览打开：0% 为关闭，100% 为完全收拢。主边长度在下方调整，旋转可改变开口朝向；合拢位置沿整条轨道计算。</p>
                        </div> <label id="curtain-position-field" class="door-type-field"
                            hidden><span>收拢方式</span><select id="curtain-position">
                                <option value="left">向左侧收拢</option>
                                <option value="right">向右侧收拢</option>
                                <option value="split">中开（向两侧收拢）</option>
                            </select></label> <label id="round-table-turntable-field" class="door-type-field"
                            hidden><span>中心转盘</span><select id="round-table-turntable">
                                <option value="without">不带转盘</option>
                                <option value="with">带转盘</option>
                            </select></label> <label id="sofa-chaise-side-field" class="door-type-field"
                            hidden><span>贵妃位（面向沙发）</span><select id="sofa-chaise-side">
                                <option value="right">右侧</option>
                                <option value="left">左侧</option>
                            </select></label> <label id="stair-direction-field" class="door-type-field"
                            hidden><span>楼梯方向</span><select id="stair-direction">
                                <option value="right">向右上行</option>
                                <option value="left">向左上行</option>
                            </select></label> <label id="tv-mount-style-field" class="door-type-field"
                            hidden><span>安装方式</span><select id="tv-mount-style">
                                <option value="standard">壁挂电视</option>
                                <option value="tabletop">桌面底座</option>
                                <option value="mobile">移动支架</option>
                            </select></label> <label id="mural-style-field" class="door-type-field" hidden><span>画作风格</span><select
                                id="mural-style">
                                <option value="bauhaus">包豪斯</option>
                                <option value="colorfield">色域</option>
                                <option value="linework">线条</option>
                                <option value="blocks">色块</option>
                                <option value="ink">水墨</option>
                                <option value="terrazzo">水磨石</option>
                            </select></label> <label id="featurewall-style-field" class="door-type-field"
                            hidden><span>饰面材质</span><select id="featurewall-style">
                                <option value="marble">大理石</option>
                                <option value="wood">木饰面</option>
                                <option value="slat">木格栅</option>
                                <option value="stone">石材</option>
                                <option value="concrete">清水混凝土</option>
                                <option value="fabric">织物</option>
                                <option value="metal">金属</option>
                            </select></label> <label id="pillar-shape-field" class="door-type-field"
                            hidden><span>形状</span><select id="pillar-shape">
                                <option value="square">方形</option>
                                <option value="round">圆形</option>
                                <option value="semicircle">半圆形</option>
                                <option value="quarter">1/4 圆形</option>
                                <option value="quarterinner">1/4 圆形（内弧）</option>
                            </select></label> <label id="pillar-axis-field" class="door-type-field"
                            hidden><span>布置方向</span><select id="pillar-axis">
                                <option value="vertical">垂直（站立）</option>
                                <option value="horizontal">水平（躺放）</option>
                            </select></label> <label id="strip-axis-field" class="door-type-field"
                            hidden><span>布置方向</span><select id="strip-axis">
                                <option value="vertical">垂直（站立）</option>
                                <option value="horizontal">水平（躺放）</option>
                            </select></label>
                            </div>
                        </section>
                        <section class="inspector-group" data-inspector-group="mount">
                            <button class="inspector-group-header" type="button" aria-expanded="true"><span
                                    class="inspector-group-caret" aria-hidden="true"></span><span
                                    class="inspector-group-title">安装参数</span><span
                                    class="inspector-group-count" hidden></span></button>
                            <div class="inspector-group-body">
                        <div id="airer-model-fields" class="field-grid" hidden><label>结构款式<select id="airer-style"><option value="double">电动晾衣架（双杆剪叉）</option><option value="single">电动单杆晾衣架（吊线）</option></select></label><label>最大伸展距离（m）<input
                                    id="airer-extension" type="number" min="0.3" max="2.4" step="0.05" value="1.2"
                                    title="从顶部安装面到晾杆；会限制在地面以上"></label><label>预览升降（%）<input id="airer-preview"
                                    type="number" min="0" max="100" step="5" value="55"
                                    title="100为最高，0为最低；不控制设备"></label></div>
                        <div id="fan-model-fields" class="field-grid" hidden><label>整体大小（%）<input id="fan-model-scale"
                                    type="number" min="60" max="160" step="5" value="100"></label><label>调杆高度（整机
                                m）<input id="fan-model-height" type="number" min="0.65" max="1.8" step="0.05"
                                    value="1.23"></label></div>
                            </div>
                        </section>
                        <section class="inspector-group" data-inspector-group="text">
                            <button class="inspector-group-header" type="button" aria-expanded="true"><span
                                    class="inspector-group-caret" aria-hidden="true"></span><span
                                    class="inspector-group-title">文字标注</span><span
                                    class="inspector-group-count" hidden></span></button>
                            <div class="inspector-group-body">
                                <div id="label-text-fields" class="label-text-fields" hidden><label>中文标题<input
                                            id="label-title" maxlength="24"
                                            autocomplete="off"></label><label>中文字间距（%）<input id="label-title-spacing"
                                            type="number" min="0" max="180" step="5"></label><label>英文标题<input
                                            id="label-subtitle" maxlength="36"
                                            autocomplete="off"></label><label>英文字间距（%）<input id="label-subtitle-spacing"
                                            type="number" min="0" max="60" step="2"></label><label>底线长度（%）<input
                                            id="label-line-length" type="number" min="30" max="100"
                                            step="5"></label><label class="label-color-field">铭牌颜色<input
                                            id="label-color" type="color" value="#e8eef6"
                                            title="字幕、箭头与底线的基准色；底线会自动跟随取半透明"></label></div>
                            </div>
                        </section>
                        <section class="inspector-group" data-inspector-group="light">
                            <button class="inspector-group-header" type="button" aria-expanded="true"><span
                                    class="inspector-group-caret" aria-hidden="true"></span><span
                                    class="inspector-group-title">灯光</span><span class="inspector-group-count"
                                    hidden></span></button>
                            <div class="inspector-group-body">
                                <div id="light-fields" class="light-fields" hidden><label>所属灯组<select
                                            id="light-group"></select></label>
                                    <div class="field-grid">
                                        <div class="light-batch-control">
                                            <div><label for="light-temperature">色温（K）</label><button
                                                    class="light-apply-button" type="button"
                                                    data-apply-light-property="lightTemperature">应用到所有</button>
                                            </div><input id="light-temperature" type="number" min="2200" max="6500"
                                                step="100">
                                        </div>
                                        <div class="light-batch-control">
                                            <div><label for="light-brightness">亮度（%）</label><button
                                                    class="light-apply-button" type="button"
                                                    data-apply-light-property="lightBrightness">应用到所有</button>
                                            </div><input id="light-brightness" type="number" min="0" max="100"
                                                step="5">
                                        </div>
                                        <div class="light-batch-control">
                                            <div><label for="light-range">照射范围（m）</label><button
                                                    class="light-apply-button" type="button"
                                                    data-apply-light-property="lightRange">应用到所有</button></div>
                                            <input id="light-range" type="number" min="0.5" max="10" step="0.1">
                                        </div>
                                        <div class="light-batch-control">
                                            <div><label for="light-angle">光束角（°）</label><button
                                                    class="light-apply-button" type="button"
                                                    data-apply-light-property="lightAngle">应用到所有</button></div>
                                            <input id="light-angle" type="number" min="15" max="150" step="5">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                        <section class="inspector-group" data-inspector-group="pose">
                            <button class="inspector-group-header" type="button" aria-expanded="true"><span
                                    class="inspector-group-caret" aria-hidden="true"></span><span
                                    class="inspector-group-title">摆放与尺寸</span><span
                                    class="inspector-group-count" hidden></span></button>
                            <div class="inspector-group-body">
                                <div class="field-grid"><label>X（m）<input id="item-x" type="number"
                                    step="0.05"></label><label>Y（m）<input id="item-y" type="number"
                                    step="0.05"></label><label><span id="item-width-label">宽（m）</span><input
                                    id="item-width" type="number" min="0.1" max="8" step="0.05"></label><label
                                id="item-height-field"><span id="item-height-label">高（m）</span><input id="item-height"
                                    type="number" min="0.05" max="6"
                                    step="0.05"></label><label><span id="item-depth-label">深（m）</span><input
                                    id="item-depth" type="number" min="0.1" max="8" step="0.05"></label>
                            <div id="shoe-cabinet-actions" class="shoe-cabinet-actions" hidden><button
                                    id="shoe-cabinet-mirror" type="button" aria-pressed="false">左右对调</button></div>
                        </div>
                        <div class="field-grid item-transform-fields">
                            <div id="item-elevation-field" class="light-batch-control">
                                <div><label for="item-elevation">离地（m）</label><button class="light-apply-button"
                                        type="button" data-apply-light-property="elevation">应用到所有</button></div><input
                                    id="item-elevation" type="number" min="0" max="6" step="0.05">
                            </div><label id="item-rotation-field"><span id="item-rotation-label">旋转角度（°）</span><input
                                    id="item-rotation" type="number" min="-360" max="360" step="1"></label>
                            <div id="item-strip-orientation-heading" class="strip-orientation-heading" hidden><strong>3D
                                    安装与出光</strong><small>角度与上方发光尺寸独立调整</small></div><label
                                id="item-vertical-rotation-field" title="灯带以自身中心调整横向、竖向或任意斜向；其他灯具保持原有出光角度" hidden><span
                                    id="item-vertical-rotation-label">出光角度（°）</span><input id="item-vertical-rotation"
                                    type="number" min="-90" max="90" step="1" value="0"></label><label
                                id="item-strip-roll-field" title="灯带围绕自身长度轴调整照射方向，支持完整 360°" hidden>出光方向（°）<input
                                    id="item-strip-roll" type="number" min="0" max="360" step="1" value="0"></label>
                        </div>
                        <div id="item-rotation-actions" class="rotation-actions"><button type="button"
                                data-rotate="-15">−15°</button><button type="button"
                                data-rotate="-90">−90°</button><button type="button"
                                data-rotate="90">＋90°</button><button type="button" data-rotate="15">＋15°</button></div>
                            </div>
                        </section>
                    </div>
                    <section class="inspector-group" data-inspector-group="material">
                        <button class="inspector-group-header" type="button" aria-expanded="true"><span
                                class="inspector-group-caret" aria-hidden="true"></span><span
                                class="inspector-group-title">材质属性</span><span class="inspector-group-count"
                                hidden></span></button>
                        <div class="inspector-group-body">
                            <!-- 这一组在 #item-fields 之外：门（户型洞口）是程序化几何、没有 GLB 槽位，
                                 但它同样要有「材质属性」（门框 / 门扇 / 玻璃 / 五金 / 卷帘…）。
                                 组内是否有可见字段由 studio-app 决定，空组会被 syncInspectorGroups 整组隐藏。 -->
                            <fieldset id="material-fields" class="material-fields" hidden>
                                <legend>材质属性</legend>
                                <!-- 材质风格：档位随模型类型变化（沙发是布艺 / 皮革组、柜类是木作组、门是一组门…），
                                     色卡条由 studio-app 按模型类型重建，不写死在标记里。 -->
                                <div id="material-style-field" class="material-style-field" hidden>
                                    <div class="material-style-heading"><span>材质风格</span><button
                                            id="material-style-delete" class="material-style-delete" type="button"
                                            hidden title="删除这个自定义预设">删除预设</button></div>
                                    <div id="material-style-strip" class="material-style-strip" role="radiogroup"
                                        aria-label="材质风格"></div>
                                </div>
                                <p id="material-summary" class="material-summary">—</p>
                                <div id="material-slot-groups" class="material-slot-groups" hidden></div>
                                <div id="material-slot-list" class="material-slot-list"></div>
                                <div class="material-actions"><button id="material-apply-same" type="button"
                                        title="把当前档位与逐槽改动复制给同模型的其它物件">应用到同类</button><button
                                        id="material-save-preset" type="button"
                                        title="把当前配色与表面参数存成个人预设，跨项目复用">存为我的预设</button><button
                                        id="material-reset-all" type="button">全部跟随主题</button></div>
                                <details class="material-help"><summary>材质属性怎么用</summary>
                                    <p class="inspector-note">先选「材质风格」预设（一次换掉这个物件的整套材质），再按槽位微调：色块可点开取色器，也可以直接改十六进制值；粗糙 / 金属度用右侧滑块单独调。改动只影响当前这个物件，「全部跟随主题」可整体复位。门的材质按「门框 / 门扇 / 玻璃 / 五金」等部件分开调，选中时画面会带一层选中高亮色，点空白处取消选中即可看到实际颜色。</p>
                                </details>
                            </fieldset>
                        </div>
                    </section>
                </form>
            </section>
        </aside>
    </main>
    <StudioDialogs />
    <StudioOverlays />
  </div>
</template>
