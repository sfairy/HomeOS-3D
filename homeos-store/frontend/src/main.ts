import { createApp } from "vue";
import { createPinia } from "pinia";
import { nextTick } from "vue";
import App from "./App.vue";
import router from "@store/router/index";
import { errorMessage } from "@store/shared/types/store";
import { useToastStore, useStoreToast } from "@store/shared/stores/toast";
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
app.mount("#app");

// 首屏路由已落到 DOM 后再揭掉占位壳，避免空 #app 闪帧。
await nextTick();
document.getElementById("store-boot-shell")?.remove();
