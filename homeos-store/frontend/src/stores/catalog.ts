/** 商店前台的商品目录。 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "../api/http.js";
import { useSessionStore } from "./session.js";
import type { StoreProduct } from "../store-types.js";

export const storePageHref = (path: string) => path;

export const useCatalogStore = defineStore("catalog", () => {
  const products = ref<StoreProduct[]>([]);
  const productFilter = ref("all");
  const loaded = ref(false);

  const session = useSessionStore();

  const primaryProducts = computed(() =>
    products.value.filter((item) =>
      ["base", "bundle", "edition_full", "package"].includes(item.productType || ""),
    ),
  );

  const addonProducts = computed(() =>
    products.value.filter((item) => ["template", "module"].includes(item.productType || "")),
  );

  const availableAddonProducts = computed(() =>
    addonProducts.value.filter((product) =>
      session.eligiblePermanentLicenses.some((license) => {
        const owned = new Set(
          session.entitlements
            .filter((item) => item.active && item.licenseId === license.activationCodeId)
            .map((item) => item.featureCode as string)
            .filter(Boolean),
        );
        return (
          !(product.featureCodes || []).length ||
          (product.featureCodes || []).some((code) => !owned.has(code))
        );
      }),
    ),
  );

  function isAddonProduct(product: StoreProduct | null | undefined) {
    return ["template", "module"].includes(product?.productType || "");
  }

  function isTrialProduct(product: StoreProduct | null | undefined) {
    const kind = String(product?.productType || "")
      .trim()
      .toLowerCase();
    return kind === "trial" || kind === "试用";
  }

  function addonTypeLabel(product: StoreProduct | null | undefined) {
    if (product?.productType === "package") return "自定义套餐";
    return product?.productType === "module" ? "功能增量包" : "UI 方案包";
  }

  function productGroup(product: StoreProduct) {
    if (isAddonProduct(product)) return "addon";
    if (isTrialProduct(product)) return "trial";
    // 全功能版与全授权同属「一整份主授权」陈列位。
    if (product.productType === "bundle" || product.productType === "edition_full") {
      return "bundle";
    }
    return "base";
  }

  function primaryProductUnavailable(product: StoreProduct) {
    return isTrialProduct(product) && (session.hasPermanentLicense || session.hasUsedTrial);
  }

  function packageContentsText(product: StoreProduct) {
    return ["主授权", ...(product.packageItems || []).map((item) => item.name)].join(" + ");
  }

  function findProduct(id: string) {
    return products.value.find((item) => item.id === id) || null;
  }

  async function load() {
    const data = await api<{ items?: StoreProduct[] }>("/products");
    products.value = data.items || [];
    loaded.value = true;
    return products.value;
  }

  async function ensureLoaded() {
    if (!loaded.value) await load();
  }

  return {
    products,
    productFilter,
    loaded,
    primaryProducts,
    addonProducts,
    availableAddonProducts,
    isAddonProduct,
    isTrialProduct,
    addonTypeLabel,
    productGroup,
    primaryProductUnavailable,
    packageContentsText,
    findProduct,
    load,
    ensureLoaded,
  };
});
