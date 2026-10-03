/** 功能码词表（后台多个面板共用：选择器 + 表格里的中文名）。 */

import { defineStore } from "pinia";
import { ref } from "vue";
import { adminApi } from "../api/http.js";
import { errorMessage } from "../store-types.js";

export interface FeatureCatalogItem {
  code: string;
  label?: string;
  description?: string;
  group?: string;
  groupLabel?: string;
  [key: string]: unknown;
}

export interface FeatureGroup {
  key: string;
  label: string;
  [key: string]: unknown;
}

export const useFeatureCatalogStore = defineStore("featureCatalog", () => {
  const items = ref<FeatureCatalogItem[]>([]);
  const groups = ref<FeatureGroup[]>([]);
  const loading = ref(false);
  let inflight: Promise<void> | null = null;

  function label(code: string): string {
    const found = items.value.find((item) => item.code === code);
    return found ? found.label || code : code;
  }

  function cell(codes: string[]): string {
    if (!codes.length) return "—";
    return codes.map(label).join("、");
  }

  async function load(): Promise<void> {
    if (inflight) return inflight;
    loading.value = true;
    inflight = adminApi<{ items?: FeatureCatalogItem[]; groups?: FeatureGroup[] }>("/feature-codes")
      .then((data) => {
        items.value = data.items || [];
        groups.value = data.groups || [];
      })
      .catch((error) => {
        throw new Error(errorMessage(error, "功能码词表读取失败"));
      })
      .finally(() => {
        loading.value = false;
        inflight = null;
      });
    return inflight;
  }

  return { items, groups, loading, label, cell, load };
});
