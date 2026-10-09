import { createApp } from "vue";
import { createPinia } from "pinia";
import { nextTick } from "vue";
import App from "./App.vue";
import router from "./router/index.js";
import "./scene/scene-depth.js";

const app = createApp(App);
app.use(createPinia());
app.use(router);

await router.isReady();
app.mount("#app");

// 首屏路由已落到 DOM 后再揭掉占位壳，避免空 #app 闪帧。
await nextTick();
document.getElementById("store-boot-shell")?.remove();
