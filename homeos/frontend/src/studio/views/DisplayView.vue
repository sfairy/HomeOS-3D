<script setup lang="ts">
/**
 * 展示页视图（`/`、`/display/:projectId`、`/homeos/:name`）。
 *
 * 模板保留全部 id / class，供既有命令式引导逻辑按 DOM 契约操作。
 *
 * 生命周期：查看 `bootDisplay*` / `teardownDisplay*` 成对调用。视图是 shell 内的可重入路由，
 * 每次挂载/切换目标都重建 DOM 契约（`:key="bootKey"`）再重新引导，卸载时回收渲染循环、
 * WebSocket、全局监听与文档级残留 —— 不再用 `useHardExit()` 的整文档跳转。
 */
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRoute } from "vue-router";
import { loadClassicScript } from "../composables/useLegacyPage";

const route = useRoute();

/** 本视图负责的路由；keep-alive 失活后 `useRoute()` 会变成别的页，不能跟着改 DOM。 */
const DISPLAY_ROUTE_NAMES = new Set(["dashboard", "display", "homeos"]);

function isDisplayRouteName(name: unknown): boolean {
  return DISPLAY_ROUTE_NAMES.has(String(name ?? ""));
}

/**
 * 引导键：仅在本视图仍匹配展示路由时跟随路径；失活期间冻结。
 *
 * MainLayout 对子页 keep-alive。从 `/` 切到 `/devices` 时 DisplayView 仍存活，
 * 若 `bootKey` 跟着变成 `/devices`，`:key` 重挂 + watch 重引导会与失活 patch
 * 叠成 `insertBefore(null)`（ErrorBoundary「页面加载失败」）。
 */
const frozenBootKey = ref(route.fullPath);
watch(
  () => ({ name: route.name, fullPath: route.fullPath }),
  ({ name, fullPath }) => {
    if (isDisplayRouteName(name)) frozenBootKey.value = fullPath;
  },
  { immediate: true },
);
const bootKey = computed(() => frozenBootKey.value);

/**
 * splash 仍由本模板渲染时为 true。
 *
 * `display-boot` 进场结束后要卸掉 `#display-splash`。若只做原生 `.remove()`、不告诉 Vue，
 * 父树（MainLayout / keep-alive / App 过渡）任意一次重渲染都会对已脱离节点做
 * `insertBefore`。本仓库 Vue 构建不导出 `flushSync`，因此只靠 v-if 卸 vnode，
 * 命令式侧禁止再 `.remove()`。
 */
const splashPresent = ref(true);

/** display-boot 派发 `hb-display-splash-detach` 时调用：只改状态，由 v-if 卸 DOM。 */
function detachSplashFromVue() {
  splashPresent.value = false;
}

interface DisplayModules {
  bootDisplayBoot: () => void;
  teardownDisplayBoot: () => void;
  bootDisplayStartup: () => void;
  teardownDisplayStartup: () => void;
  bootDisplay: () => void;
  teardownDisplay: () => void;
  bootAppleInstallGuide: () => void;
  teardownAppleInstallGuide: () => void;
}

let modules: DisplayModules | null = null;
let isUnmounted = false;
/** keep-alive 失活：禁止异步引导在后台写回已冻结的 DOM 契约。 */
let isInactive = false;
/**
 * keep-alive 首次进入会先 `onMounted` 再 `onActivated`；用此标记避免双重引导。
 * 独立整屏路由不在 keep-alive 内，只有 `onMounted`。
 */
let bootedInActiveCycle = false;

/** 按原始依赖顺序加载引导模块（只求值一次）：boot → startup → hls → display → 安装引导。 */
async function ensureModules(): Promise<DisplayModules> {
  if (modules) return modules;
  const bootModule = await import("@app/display/display-boot");
  const startupModule = await import("@app/display/display-startup");
  // hls.min.js 必须在展示页模块之前就位（相机组件的 HLS 播放依赖它）。
  await loadClassicScript("/static/vendor/hls.js/1.7.3/hls.min.js");
  const displayModule = await import("@app/display/display");
  const guideModule = await import("@app/display/apple-install-guide");
  modules = {
    bootDisplayBoot: bootModule.bootDisplayBoot,
    teardownDisplayBoot: bootModule.teardownDisplayBoot,
    bootDisplayStartup: startupModule.bootDisplayStartup,
    teardownDisplayStartup: startupModule.teardownDisplayStartup,
    bootDisplay: displayModule.bootDisplay,
    teardownDisplay: displayModule.teardownDisplay,
    bootAppleInstallGuide: guideModule.bootAppleInstallGuide,
    teardownAppleInstallGuide: guideModule.teardownAppleInstallGuide,
  };
  return modules;
}

/** 引导顺序即依赖顺序：splash 契约 → 预取 → 展示页 → 安装引导（读 `display-booting` 类）。 */
async function startDisplay(): Promise<void> {
  const loaded = await ensureModules();
  if (isUnmounted || isInactive || !isDisplayRouteName(route.name)) return;
  loaded.bootDisplayBoot();
  loaded.bootDisplayStartup();
  loaded.bootDisplay();
  loaded.bootAppleInstallGuide();
}

function stopDisplay(): void {
  if (!modules) return;
  modules.teardownAppleInstallGuide();
  modules.teardownDisplay();
  modules.teardownDisplayStartup();
  modules.teardownDisplayBoot();
}

onMounted(() => {
  isInactive = false;
  bootedInActiveCycle = true;
  window.addEventListener("hb-display-splash-detach", detachSplashFromVue);
  void startDisplay();
});

onActivated(() => {
  // 与 onMounted 同一次进入：跳过，避免 boot×2。
  if (bootedInActiveCycle) return;
  isInactive = false;
  bootedInActiveCycle = true;
  if (!isDisplayRouteName(route.name)) return;
  // 从其它 Tab 回到总览：运行时已在 deactivated 里拆掉，需重新引导。
  splashPresent.value = true;
  void startDisplay();
});

onDeactivated(() => {
  isInactive = true;
  bootedInActiveCycle = false;
  stopDisplay();
});

onBeforeUnmount(() => {
  isUnmounted = true;
  isInactive = true;
  bootedInActiveCycle = false;
  window.removeEventListener("hb-display-splash-detach", detachSplashFromVue);
  stopDisplay();
});

watch(bootKey, async () => {
  if (isUnmounted || isInactive || !isDisplayRouteName(route.name)) return;
  stopDisplay();
  // 路径变化：重新挂上 splash 节点，再等 DOM 契约就绪后引导。
  splashPresent.value = true;
  await nextTick();
  if (isUnmounted || isInactive || !isDisplayRouteName(route.name)) return;
  void startDisplay();
});
</script>

<template>
  <div class="display-chrome-host" style="position: relative; width: 100%; height: 100%">
<main id="display-shell" :key="bootKey" tabindex="-1">
        <div id="display-root" tabindex="-1"></div>
    </main>
    <section
      v-if="splashPresent"
      id="display-splash"
      :key="`${bootKey}-splash`"
      aria-label="正在打开仪表盘"
      tabindex="-1"
    >
        <div class="display-splash-halo" aria-hidden="true"></div>
        <div class="display-splash-identity">
            <svg class="display-splash-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 168 168" role="img"
                aria-label="HomeOS">
                <title>HomeOS</title>
                <!-- 渐变与裁剪路径全在 defs 里定义，正文靠 fill="url(#id)" 引用；
                     这些 id 属于页面全局命名空间（都以 stmk 前缀避让），改名会同时打断所有引用点。 -->
                <defs>
                    <linearGradient id="stmkHouse" x1="12" y1="92" x2="90" y2="10" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="#16263C" />
                        <stop offset="24%" stop-color="#24395A" />
                        <stop offset="52%" stop-color="#4E6489" />
                        <stop offset="78%" stop-color="#D89A3C" />
                        <stop offset="100%" stop-color="#FFD9A0" />
                    </linearGradient>
                    <linearGradient id="stmkLife" x1="10" y1="48" x2="50" y2="48" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="#5FD0A8" stop-opacity="0.78" />
                        <stop offset="100%" stop-color="#5FD0A8" stop-opacity="0" />
                    </linearGradient>
                    <linearGradient id="stmkVoice" x1="90" y1="48" x2="50" y2="48" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="#C9A0FF" stop-opacity="0.76" />
                        <stop offset="100%" stop-color="#C9A0FF" stop-opacity="0" />
                    </linearGradient>
                    <linearGradient id="stmkRoof" x1="50" y1="8" x2="50" y2="44" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="#FFD9A0" stop-opacity="0.5" />
                        <stop offset="100%" stop-color="#FFC46A" stop-opacity="0" />
                    </linearGradient>
                    <radialGradient id="stmkWarm" cx="50" cy="70" r="34" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="#FF9D4D" stop-opacity="0.38" />
                        <stop offset="50%" stop-color="#FF9D4D" stop-opacity="0.12" />
                        <stop offset="100%" stop-color="#FF9D4D" stop-opacity="0" />
                    </radialGradient>
                    <linearGradient id="stmkScreen" x1="50" y1="48" x2="50" y2="92" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="#16263C" />
                        <stop offset="100%" stop-color="#081020" />
                    </linearGradient>
                    <radialGradient id="stmkScreenGlow" cx="50%" cy="38%" r="75%">
                        <stop offset="0%" stop-color="#FFC46A" stop-opacity="0.2" />
                        <stop offset="55%" stop-color="#FF9D4D" stop-opacity="0.08" />
                        <stop offset="100%" stop-color="#FFC46A" stop-opacity="0" />
                    </radialGradient>
                    <radialGradient id="stmkHubGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stop-color="#FFE9C9" stop-opacity="0.95" />
                        <stop offset="40%" stop-color="#FF9D4D" stop-opacity="0.42" />
                        <stop offset="100%" stop-color="#FF9D4D" stop-opacity="0" />
                    </radialGradient>
                    <clipPath id="stmkHouseClip">
                        <path d="M50 7.8 C51.8 7.8 53.4 8.6 54.6 10.1 L91.6 39.6 C93.2 41 92.3 43.6 90.1 43.6 H82.2 V82.4 C82.2 90.2 75.8 96.4 68 96.4 H32 C24.2 96.4 17.8 90.2 17.8 82.4 V43.6 H9.9 C7.7 43.6 6.8 41 8.4 39.6 L45.4 10.1 C46.6 8.6 48.2 7.8 50 7.8 Z" />
                    </clipPath>
                </defs>

                <g transform="scale(1.68)">
                    <path fill="url(#stmkHouse)"
                        d="M50 7.8 C51.8 7.8 53.4 8.6 54.6 10.1 L91.6 39.6 C93.2 41 92.3 43.6 90.1 43.6 H82.2 V82.4 C82.2 90.2 75.8 96.4 68 96.4 H32 C24.2 96.4 17.8 90.2 17.8 82.4 V43.6 H9.9 C7.7 43.6 6.8 41 8.4 39.6 L45.4 10.1 C46.6 8.6 48.2 7.8 50 7.8 Z" />
                    <g clip-path="url(#stmkHouseClip)">
                        <rect x="8" y="8" width="42" height="90" fill="url(#stmkLife)" />
                        <rect x="50" y="8" width="42" height="90" fill="url(#stmkVoice)" />
                        <path d="M50 8 L92 43 L8 43 Z" fill="url(#stmkRoof)" />
                        <ellipse cx="50" cy="72" rx="30" ry="24" fill="url(#stmkWarm)" />
                    </g>

                    <!-- 山墙信号：三道弧 + 源点（stmk-wifi-a/b/c 由 display-boot.css 做递增延迟的闪烁） -->
                    <g fill="none" stroke="#FFD9A0" stroke-linecap="round" stroke-linejoin="round">
                        <path class="stmk-wifi-a" d="M46.4 38.4 Q50 35 53.6 38.4" stroke-width="2.2" />
                        <path class="stmk-wifi-b" d="M43.4 33.6 Q50 27 56.6 33.6" stroke-width="2.1" />
                        <path class="stmk-wifi-c" d="M39.4 28.4 Q50 19.8 60.6 28.4" stroke-width="2" />
                    </g>
                    <circle cx="50" cy="41.6" r="1.7" fill="#FFD9A0" />

                    <!-- ===== 屏内示意：四向连线代表四类被控设备，配色与上方渐变一一对应 ===== -->
                    <rect x="28.5" y="49.5" width="43" height="39.2" rx="7.2" fill="url(#stmkScreen)" />
                    <rect x="28.5" y="49.5" width="43" height="39.2" rx="7.2" fill="url(#stmkScreenGlow)" />

                    <g stroke-width="1.85" stroke-linecap="round">
                        <line x1="50" y1="69" x2="50" y2="56.8" stroke="#FFC46A" />
                        <line x1="50" y1="69" x2="63" y2="69" stroke="#C9A0FF" />
                        <line x1="50" y1="69" x2="50" y2="81.2" stroke="#FF9D4D" />
                        <line x1="50" y1="69" x2="37" y2="69" stroke="#5FD0A8" />
                    </g>
                    <circle cx="50" cy="56.8" r="3" fill="#FFC46A" />
                    <circle cx="63" cy="69" r="3" fill="#C9A0FF" />
                    <circle cx="50" cy="81.2" r="3" fill="#FF9D4D" />
                    <circle cx="37" cy="69" r="3" fill="#5FD0A8" />

                    <!-- 中枢光晕：stmk-hub 由 display-boot.css 做 3.4 秒呼吸动画，
                         外面那圈柔光是叠加的径向渐变，不是滤镜，性能开销更低。 -->
                    <circle class="stmk-hub" cx="50" cy="69" r="8.4" fill="url(#stmkHubGlow)" />
                    <circle cx="50" cy="69" r="3.3" fill="#FFF6E4" />
                </g>
            </svg>
            <div class="display-splash-wordmark">HOMEOS</div>
            <p id="display-splash-message" role="status" aria-live="polite">正在连接你的家…</p>
            <div id="display-splash-actions" hidden> <button id="display-splash-retry" type="button">重新加载</button>
                <button id="display-splash-enter" type="button" hidden>先进入仪表盘</button> </div>
        </div>
        <div class="display-splash-footer" aria-hidden="true">让家，触手可及</div>
    </section>
  </div>
</template>
