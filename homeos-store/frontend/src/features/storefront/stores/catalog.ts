/** 商店前台的商品目录与功能码目录。 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "@store/shared/api/http";
import { useSessionStore } from "@store/shared/stores/session";
import { reportBestEffort } from "@store/shared/utils/best-effort";
import type {
  StoreFeature,
  StoreFeatureCatalog,
  StoreFeatureGroup,
  StoreProduct,
} from "@store/shared/types/store";

/** 主授权：决定基础能力的那一份授权。 */
const PRIMARY_TYPES: readonly string[] = ["base", "bundle", "edition_full", "package"];
/** 增量商品：模块包与 UI 方案包。 */
const ADDON_TYPES: readonly string[] = ["template", "module"];

export const useCatalogStore = defineStore("catalog", () => {
  const products = ref<StoreProduct[]>([]);
  const features = ref<StoreFeature[]>([]);
  const featureGroups = ref<StoreFeatureGroup[]>([]);
  const productFilter = ref("all");
  const loaded = ref(false);
  /** 功能码目录单独记状态：它失败不该让商品目录也当成「没上架」。 */
  const featuresLoaded = ref(false);

  const session = useSessionStore();

  const featureByCode = computed(() => {
    const map = new Map<string, StoreFeature>();
    for (const item of features.value) map.set(item.code, item);
    return map;
  });

  /** 增量模块（`group === "module"`），顺序沿用 `ops/check/feature_codes.json`。 */
  const moduleFeatures = computed(() =>
    features.value.filter((item) => item.group === "module"),
  );

  const primaryProducts = computed(() =>
    products.value.filter((item) => PRIMARY_TYPES.includes(item.productType || "")),
  );

  const addonProducts = computed(() =>
    products.value.filter((item) => ADDON_TYPES.includes(item.productType || "")),
  );

  const availableAddonProducts = computed(() =>
    addonProducts.value.filter((product) => {
      const codes = product.featureCodes || [];
      return session.eligiblePermanentLicenses.some((license) => {
        const owned = new Set(
          session.entitlements
            .filter((item) => item.active && item.licenseId === license.activationCodeId)
            .map((item) => item.featureCode as string)
            .filter(Boolean),
        );
        return !codes.length || codes.some((code) => !owned.has(code));
      });
    }),
  );

  /**
   * 功能码 → 可单独购买它的商品。
   *
   * 一个增量包只对应一个模块码是当前运营口径；同一码被多个商品覆盖时取目录顺序里
   * 第一个**在售**的，保证「首页价格」与「商品列表第一张卡」永远一致。
   */
  const addonByFeatureCode = computed(() => {
    const map = new Map<string, StoreProduct>();
    for (const product of addonProducts.value) {
      if (product.soldOut) continue;
      for (const code of product.featureCodes || []) {
        if (!map.has(code)) map.set(code, product);
      }
    }
    return map;
  });

  function isAddonProduct(product: StoreProduct | null | undefined) {
    return ADDON_TYPES.includes(product?.productType || "");
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

  function featureLabel(code: string) {
    return featureByCode.value.get(code)?.label || code;
  }

  function featureDescription(code: string) {
    return featureByCode.value.get(code)?.description || "";
  }

  /** 某个功能码是否已在当前账号的权益里。游客恒为 false。 */
  function ownsFeature(code: string) {
    return session.ownedFeatureCodes.has(code);
  }

  /** 某个功能码对应的可加购商品（没有单独售卖时返回 null）。 */
  function productForFeature(code: string) {
    return addonByFeatureCode.value.get(code) || null;
  }

  function addonSoldForFeature(product: StoreProduct | null | undefined) {
    return Boolean(product?.soldOut);
  }

  async function loadProducts() {
    const data = await api<{ items?: StoreProduct[] }>("/products");
    products.value = data.items || [];
    loaded.value = true;
    return products.value;
  }

  async function loadFeatures() {
    const data = await api<StoreFeatureCatalog>("/features");
    features.value = data.items || [];
    featureGroups.value = data.groups || [];
    featuresLoaded.value = true;
    return features.value;
  }

  /** 商品是页面主数据；功能码目录失败只降级文案，不阻断商品。 */
  async function load() {
    const [productsResult, featuresResult] = await Promise.allSettled([
      loadProducts(),
      loadFeatures(),
    ]);
    if (featuresResult.status === "rejected") {
      // 目录没拉到时模块卡会退化成商品自带的码（原始 code），页面仍可用但可读性变差 —— 留痕。
      reportBestEffort("功能码目录 /features（本次沿用商品自带的码）", featuresResult.reason);
    }
    if (productsResult.status === "rejected") throw productsResult.reason;
    return products.value;
  }

  async function ensureLoaded() {
    if (!loaded.value) await load();
  }

  return {
    products,
    features,
    featureGroups,
    productFilter,
    loaded,
    featuresLoaded,
    moduleFeatures,
    featureByCode,
    primaryProducts,
    addonProducts,
    availableAddonProducts,
    addonByFeatureCode,
    isAddonProduct,
    isTrialProduct,
    addonTypeLabel,
    productGroup,
    primaryProductUnavailable,
    packageContentsText,
    findProduct,
    featureLabel,
    featureDescription,
    ownsFeature,
    productForFeature,
    addonSoldForFeature,
    load,
    ensureLoaded,
  };
});
