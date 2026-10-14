/** 跨面板刷新信号：某个面板改了数据，其它面板（若挂载着）跟着重拉。 */

import { defineStore } from "pinia";
import { ref } from "vue";
import { watch } from "vue";

export type AdminRefreshKey =
  | "overview"
  | "products"
  | "productCatalog"
  | "coupons"
  | "accounts"
  | "ledger"
  | "licenses"
  | "bindings"
  | "withdrawals"
  | "entitlements"
  | "customers"
  | "audits"
  | "diagnostics"
  | "settings";

export const useAdminRefreshStore = defineStore("adminRefresh", () => {
  const versions = ref<Record<string, number>>({});

  function bump(...keys: AdminRefreshKey[]) {
    for (const key of keys) versions.value[key] = (versions.value[key] || 0) + 1;
  }

  function version(key: AdminRefreshKey) {
    return versions.value[key] || 0;
  }

  return { versions, bump, version };
});

/** 监听若干刷新信号，触发时执行 `fn`（挂载时不触发）。 */
export function useRefreshOn(keys: AdminRefreshKey[], fn: () => void) {
  const store = useAdminRefreshStore();
  watch(
    () => keys.map((key) => store.version(key)).join(","),
    () => fn(),
  );
  return store;
}
