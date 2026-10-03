<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import { useRoute } from "vue-router";
import AdminToastHost from "./components/AdminToastHost.vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";

const route = useRoute();

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
</template>
