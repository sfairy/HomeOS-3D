<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import { useRoute } from "vue-router";
import AdminToastHost from "@store/shared/components/AdminToastHost.vue";
import ConfirmDialog from "@store/shared/components/ConfirmDialog.vue";
import { useStoreToast } from "@store/shared/stores/toast";
import { ensureAdminStylesheet, releaseAdminStylesheet } from "@store/shared/utils/styles-ready";

const route = useRoute();
const storeToast = useStoreToast();

const isAdmin = computed(() => route.path === "/admin" || route.path.startsWith("/admin/"));
const isStore = computed(
  () =>
    !isAdmin.value &&
    route.path !== "/setup",
);

/**
 * 后台样式表的挂/摘。
 *
 * 挂载点与等待逻辑都搬到了 `shared/utils/styles-ready.ts`：
 * `main.ts` 在首屏是后台路由时**先 await 它再 mount**（否则后台登录屏会先画一帧裸 DOM），
 * 这里只负责按路由增删。两处共用同一个 `link[data-admin-stylesheet]`，不会挂出第二份。
 *
 * 注入是异步的，但这里不需要等：首屏那一份由 main.ts 提前保证；后续从后台切走/切回
 * 都是同一张已缓存的表，浏览器不会重排一次「无样式」的中间态。
 */
function setAdminStylesheet(enabled: boolean) {
  if (enabled) void ensureAdminStylesheet();
  else releaseAdminStylesheet();
}

function applyBodyClasses() {
  document.body.classList.toggle("hb-store-body", isStore.value);
  document.body.classList.toggle("hb-admin-body", isAdmin.value);
  setAdminStylesheet(isAdmin.value);
}

watch(() => route.path, applyBodyClasses, { immediate: true });

onBeforeUnmount(() => setAdminStylesheet(false));
</script>

<template>
  <router-view />
  <AdminToastHost />
  <ConfirmDialog :variant="isAdmin ? 'admin' : 'store'" />
  <!-- 轻提示挂在这里（应用根），而不是 `StoreLayout` 里：全局错误兜底
       （`main.ts` 的 `errorHandler` / `unhandledrejection`）在登录页、`/setup`
       这些**不经过 StoreLayout** 的页面上也要能说话，否则最该报错的路径恰好没有嘴。
       元素位置对这层提示没有影响：`.hb-toast` 是 `position: fixed`。 -->
  <div
    id="store-toast"
    class="hb-toast"
    :class="{ show: storeToast.visible, 'is-err': storeToast.tone === 'err' }"
    :role="storeToast.tone === 'err' ? 'alert' : 'status'"
    :aria-live="storeToast.tone === 'err' ? 'assertive' : 'polite'"
  >
    {{ storeToast.message }}
  </div>
</template>
