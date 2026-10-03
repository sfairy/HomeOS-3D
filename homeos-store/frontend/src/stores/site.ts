/** 站点级状态：版本号、站点配置（站点名/公告/维护模式/支付渠道）。 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "../api/http.js";
import type { PaymentChannel, StoreSiteConfig, StoreConfiguration } from "../store-types.js";

interface HealthPayload {
  version?: string;
}

export const useSiteStore = defineStore("site", () => {
  const version = ref("");
  const configuration = ref<StoreConfiguration | null>(null);
  const loaded = ref(false);

  const store = computed<StoreSiteConfig | undefined>(
    () => configuration.value?.store as StoreSiteConfig | undefined,
  );
  const siteName = computed(() => store.value?.siteName || "HomeOS");
  const siteTitle = computed(() => store.value?.siteTitle || "HomeOS 授权中心");
  const logoUrl = computed(() => store.value?.logoUrl || "/store-static/homeos-mark.svg");
  const announcement = computed(() => store.value?.announcement || "");
  const maintenanceMode = computed(() => Boolean(store.value?.maintenanceMode));
  const maintenanceMessage = computed(
    () => store.value?.maintenanceMessage || "系统正在升级维护，请稍后再试。",
  );
  const paymentChannels = computed<PaymentChannel[]>(
    () => (configuration.value?.payment?.channels as PaymentChannel[] | undefined) || [],
  );

  async function loadVersion() {
    // /healthz 不在 /store/v1 之下，单独取一次；版本号只用于展示。
    try {
      const response = await fetch("/healthz", { credentials: "same-origin" });
      const data = (await response.json()) as HealthPayload;
      if (data?.version) version.value = data.version;
    } catch {
      /* 忽略。 */
    }
  }

  async function load(force = false) {
    if (loaded.value && !force) return;
    const [config] = await Promise.allSettled([
      api<StoreConfiguration>("/configuration"),
      loadVersion(),
    ]);
    if (config.status === "fulfilled") {
      configuration.value = config.value;
    }
    loaded.value = true;
  }

  return {
    version,
    configuration,
    loaded,
    store,
    siteName,
    siteTitle,
    logoUrl,
    announcement,
    maintenanceMode,
    maintenanceMessage,
    paymentChannels,
    load,
    loadVersion,
  };
});
