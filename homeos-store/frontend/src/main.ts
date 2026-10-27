import { createApp } from "vue";
import { createPinia } from "pinia";
import { nextTick } from "vue";
import App from "./App.vue";
import router from "@store/router/index";
import { errorMessage } from "@store/shared/types/store";
import { useToastStore, useStoreToast } from "@store/shared/stores/toast";
import {
  ensureAdminStylesheet,
  needsAdminStyles,
  nextFrame,
  waitForDeferredStyles,
} from "@store/shared/utils/styles-ready";
import "@store/shared/scene/scene-depth";

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);

/**
 * 全局兜底：**任何**没被 catch 的渲染异常 / 未处理的 Promise 拒绝，都要给用户一句话。
 *
 * 原先两条都没有：组件里一处抛错（后台某个面板、场景渲染、支付回调解析）就是整块白屏，
 * 控制台有栈、页面上什么都没有，用户只能刷新碰运气。这里刻意不 `throw` 也不吞掉 ——
 * 记一条 `console.error` 供排障，同时用既有 toast 把「出错了」明确说出来。
 *
 * 取 store 实例必须显式传 `pinia`：这两个回调运行在组件树之外，没有 active pinia。
 */
const adminToast = useToastStore(pinia);
const storeToast = useStoreToast(pinia);

function reportGlobal(kind: string, error: unknown) {
  console.error(`[store] ${kind}`, error);
  const message = errorMessage(error, "页面出现异常，请重试或刷新。");
  // 两套提示是**两棵不同的 DOM**（后台栈式 `#admin-toast` / 前台单条 `#store-toast`，
  // 后者挂在 App.vue 根上、每个页面都在），按当前区域投放，别让错误提示落到看不见的那一套里。
  if (router.currentRoute.value.path.startsWith("/admin")) adminToast.push(message, "danger");
  else storeToast.show(message, "err");
}

app.config.errorHandler = (error) => {
  reportGlobal("渲染或生命周期异常", error);
};

// 启动时挂一次的全局兜底上报（应用级单例监听），进程结束前不需要摘除。
window.addEventListener("unhandledrejection", (event) => {
  reportGlobal("未处理的 Promise 拒绝", event.reason);
});

await router.isReady();

/**
 * 揭遮罩的三个前置条件，缺一都会让用户看见「半成品 → 成品」的重排：
 *
 * 1. **首屏样式已一次性揭幕**（`index.html` 的原子切 `all`，见 styles-ready.ts）；
 * 2. 首屏是后台时，`admin.css` 已就位 —— 它是 App.vue 在挂载时才注入的，后台登录屏
 *    的 `.admin-*` 与坞体配色都靠它；不等就会先画一帧裸 DOM；
 * 3. 再等一个渲染帧，让上面两件事的样式计算真正落到屏幕上。
 *
 * 两处等待都带 3s 硬上限：样式 404 / 网关拦截时宁可带旧样式渲染，也不能把首屏锁死。
 */
await waitForDeferredStyles();
if (needsAdminStyles(location.pathname)) await ensureAdminStylesheet();

app.mount("#app");

// 首屏路由已落到 DOM 后再揭掉占位壳，避免空 #app 闪帧。
await nextTick();
await nextFrame();
document.getElementById("store-boot-shell")?.remove();
