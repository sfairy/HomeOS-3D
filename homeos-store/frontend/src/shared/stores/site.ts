/** 站点级状态：版本号、站点配置（站点名/公告/维护模式/支付渠道）。 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "@store/shared/api/http";
import { logAndIgnore, reportBestEffort } from "@store/shared/utils/best-effort";
import type { PaymentChannel, StoreSiteConfig, StoreConfiguration } from "@store/shared/types/store";

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
    // 失败可降级（不显示版本号），记一条日志即可。
    await fetch("/healthz", { credentials: "same-origin" })
      .then((response) => response.json())
      .then((data: HealthPayload) => {
        if (data?.version) version.value = data.version;
      })
      .catch(logAndIgnore("站点版本号 /healthz"));
  }

  async function load(force = false) {
    if (loaded.value && !force) return;
    const [config] = await Promise.allSettled([
      api<StoreConfiguration>("/configuration"),
      loadVersion(),
    ]);
    if (config.status !== "fulfilled") {
      // 拉取失败时不能置 loaded：否则本次会话内 load() 会直接短路返回，
      // 站点名 / 公告 / 维护模式 / 支付渠道将一直停留在默认值，也不再重试。
      // 默认值能让页面继续跑（这就是可降级），但「配置没拿到」这件事必须留痕 ——
      // 支付渠道为空会静默退化成服务端默认渠道，排查时没有日志根本看不出来。
      reportBestEffort("站点配置 /configuration（本次沿用默认值）", config.reason);
      return;
    }
    configuration.value = config.value;
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
