<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import { useRoute } from "vue-router";
import AdminToastHost from "@store/shared/components/AdminToastHost.vue";
import ConfirmDialog from "@store/shared/components/ConfirmDialog.vue";
import { useStoreToast } from "@store/shared/stores/toast";

const route = useRoute();
const storeToast = useStoreToast();

const isAdmin = computed(() => route.path === "/admin" || route.path.startsWith("/admin/"));
const isStore = computed(
  () =>
    !isAdmin.value &&
    route.path !== "/setup",
);

let adminStylesheet: HTMLLinkElement | null = null;

function setAdminStylesheet(enabled: boolean) {
  if (enabled && !adminStylesheet) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/store-static/admin.css";
    link.dataset.adminStylesheet = "1";
    document.head.appendChild(link);
    adminStylesheet = link;
  } else if (!enabled && adminStylesheet) {
    adminStylesheet.remove();
    adminStylesheet = null;
  }
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
