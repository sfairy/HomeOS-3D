/**
 * 首页的数据聚合层。
 *
 * 组件不认识「商品类型」「功能码」「渠道可用性」这些概念，它们只拿这里算好的视图模型：
 * 每个档位该显示什么名字、价格、模块与 CTA；每张能力卡是基础版包含、需加购还是已拥有；
 * 哪些模块能单买、哪些只随全功能版提供。
 *
 * 三条硬规则：
 * 1. **价格 / 名称 / 包含模块**一律来自接口，文案只做兜底；
 * 2. 功能目录拉不到时降级到商品自带的代码，不把模块区整块藏掉；
 * 3. 拿不到的东西就不要编 —— 没有在售商品时首屏不显示起价，没有部署命令时不给复制按钮。
 */

import { computed } from "vue";
import {
  ASSURANCES,
  CAPABILITY_DOMAINS,
  FAQ,
  HERO,
  MODULE_META,
  SETUP,
  STAGE,
  type CapabilityCard,
  type CapabilityDomain,
  type FaqEntry,
  type ModuleMeta,
  type Tone,
} from "@store/features/storefront/content/home";
import { useCatalogStore } from "@store/features/storefront/stores/catalog";
import { useSessionStore } from "@store/shared/stores/session";
import { useSiteStore } from "@store/shared/stores/site";
import { formatCents } from "@store/shared/utils/money";
import type { StoreProduct } from "@store/shared/types/store";

/** 主授权档位的营销提示语。商品名与价格仍然来自接口。 */
const TIER_HINTS: Record<string, string> = {
  base: "先把全屋接起来",
  package: "在户型里直接操作",
  edition_full: "全部增量一次拿齐",
  bundle: "全部增量一次拿齐",
};

/**
 * 模块描述常常以「安防监控：」「3D 交互舞台与控件增量包：」开头，而标题就在它上面，
 * 直接渲染会出现「安防监控 安防监控：摄像头…」这种重复。这里只在开头确实复述了
 * 模块名时切掉前缀，描述本身的差异（比如 3D 那条写的是「舞台与控件增量包」）保留。
 */
function stripRepeatedLabel(label: string, description: string): string {
  const match = description.match(/^([^：:]{2,24})[：:]\s*/);
  if (!match) return description;
  const head = match[1];
  if (!head.includes(label) && !label.includes(head)) return description;
  const rest = description.slice(match[0].length).trim();
  return rest || description;
}

interface TierView {
  id: string;
  name: string;
  hint: string;
  description: string;
  price: string;
  priceNote: string;
  /** 本档包含的增量模块名（按目录顺序）。 */
  includedModules: string[];
  /** 本档不含、需要单独加购或升级才能拿到的模块名。 */
  excludedModules: string[];
  /** 是否一次拿齐全部增量模块：是则清单只写一行「全部 N 个」。 */
  containsAll: boolean;
  totalModules: number;
  baseCount: number;
  tone: Tone;
  featured: boolean;
  soldOut: boolean;
  owned: boolean;
  href: string | null;
  ctaLabel: string;
  stockNote: string;
}

interface TrialView {
  product: StoreProduct;
  href: string;
  price: string;
}

interface ModuleCardView extends ModuleMeta {
  label: string;
  description: string;
  price: string | null;
  href: string | null;
  ctaLabel: string;
  owned: boolean;
  soldOut: boolean;
  includedInFull: boolean;
}

interface CapabilityCardView extends CapabilityCard {
  requirement: string;
  requirementTone: "base" | "module" | "owned";
  href: string | null;
  /** 卡片右侧入口的文案：跟着跳转目标走，避免所有卡都写「查看详情」。 */
  linkLabel: string | null;
}

interface CapabilityDomainView extends Omit<CapabilityDomain, "cards"> {
  cards: CapabilityCardView[];
}

const TONES: Tone[] = ["accent", "lumen", "aura", "eco", "heat", "cool", "sensor"];

/** 把任意下标映射到语义色：避免每个档位手写 data-tone。 */
function toneAt(index: number): Tone {
  return TONES[index % TONES.length];
}

function productHref(product: StoreProduct) {
  return `/item/${encodeURIComponent(product.id)}`;
}

export function useHomeView() {
  const catalog = useCatalogStore();
  const session = useSessionStore();
  const site = useSiteStore();

  const authenticated = computed(() => Boolean(session.account));
  const hasPrimary = computed(() => catalog.primaryProducts.length > 0);
  const showCatalogEmpty = computed(() => catalog.loaded && !hasPrimary.value);

  /** 全功能版包含的模块码：没有这个商品时返回空集。 */
  const fullEditionProduct = computed(
    () =>
      catalog.primaryProducts.find(
        (item) => item.productType === "edition_full" || item.productType === "bundle",
      ) || null,
  );

  const fullEditionModuleCodes = computed(() => {
    const codes = new Set<string>();
    for (const code of fullEditionProduct.value?.featureCodes || []) {
      if (code.startsWith("module.")) codes.add(code);
    }
    return codes;
  });

  /**
   * 模块清单。优先用功能目录（有中文名与描述）；目录请求失败时退回「商品里出现过的
   * module.* 码」，此时标签就是码本身 —— 页面难看一点，但不至于整块消失。
   */
  const moduleSource = computed(() => {
    if (catalog.moduleFeatures.length) {
      return catalog.moduleFeatures.map((item) => ({
        code: item.code,
        label: item.label,
        description: item.description || "",
      }));
    }
    const seen = new Set<string>();
    for (const product of catalog.products) {
      for (const code of product.featureCodes || []) {
        if (code.startsWith("module.")) seen.add(code);
      }
    }
    return Array.from(seen).map((code) => ({ code, label: code, description: "" }));
  });

  const moduleCards = computed<ModuleCardView[]>(() =>
    moduleSource.value.map((item) => {
      const product = catalog.productForFeature(item.code);
      const meta: ModuleMeta = MODULE_META[item.code] || {
        code: item.code,
        tone: "accent",
        icon: "fa-puzzle-piece",
      };
      const owned = catalog.ownsFeature(item.code);
      const includedInFull = fullEditionModuleCodes.value.has(item.code);
      const href = owned
        ? "/user/dashboard/index"
        : product
          ? productHref(product)
          : fullEditionProduct.value
            ? productHref(fullEditionProduct.value)
            : null;
      const ctaLabel = owned
        ? "去账号中心"
        : product
          ? product.soldOut
            ? "已售罄"
            : "查看增量包"
          : includedInFull
            ? "了解全功能版"
            : "查看授权";
      return {
        ...meta,
        label: item.label,
        description: stripRepeatedLabel(item.label, item.description),
        price: product ? formatCents(product.priceCents) : null,
        href,
        ctaLabel,
        owned,
        soldOut: Boolean(product?.soldOut),
        includedInFull,
      };
    }),
  );

  /**
   * 模块区只分两组：**能单独买的**（带价格）与**只随全功能版提供的**（灰字）。
   * 旧版把两组混在一张九宫格里，只能靠一个 chip 区分，读者要逐张读才知道能不能买。
   */
  const moduleGroups = computed(() => ({
    purchasable: moduleCards.value.filter((item) => item.price !== null),
    included: moduleCards.value.filter((item) => item.price === null),
  }));

  const paymentBadges = computed(() =>
    site.availableChannels.map((channel) => channel.displayName || channel.provider),
  );

  /** 首屏的「¥xxx 起」：取在售主授权里最低的一档，含已售罄的兜底。 */
  const startingPrice = computed(() => {
    const priced = catalog.primaryProducts.filter((item) => !catalog.isTrialProduct(item));
    const available = priced.filter((item) => !item.soldOut);
    const pool = available.length ? available : priced;
    if (!pool.length) return null;
    return formatCents(Math.min(...pool.map((item) => item.priceCents)));
  });

  const tiers = computed<TierView[]>(() => {
    const products = catalog.primaryProducts
      .filter((item) => !catalog.isTrialProduct(item))
      .slice()
      .sort((a, b) => a.priceCents - b.priceCents);
    const packageIndex = products.findIndex((item) => item.productType === "package");
    const featuredIndex = packageIndex >= 0 ? packageIndex : Math.floor(products.length / 2);
    const allModules = moduleSource.value;
    const totalModules = allModules.length;

    return products.map((product, index) => {
      const codes = product.featureCodes || [];
      const included = allModules.filter((item) => codes.includes(item.code));
      const excluded = allModules.filter((item) => !codes.includes(item.code));
      // 只有真的把目录里的模块全拿到，才允许写「全部 N 个」；目录拉不到时不算。
      const containsAll = totalModules > 0 && excluded.length === 0;
      const owned = Boolean(session.ownedPermanentLicense(product));
      const soldOut = Boolean(product.soldOut);
      const stock = Number(product.availableStock ?? product.stockQuantity ?? 0);
      const description = (product.displayDescription || product.note || "").trim();
      return {
        id: product.id,
        name: product.name || product.edition || "授权版本",
        hint:
          TIER_HINTS[product.productType || ""] ||
          (typeof product.edition === "string" ? product.edition : "按需选择"),
        description:
          description ||
          (containsAll
            ? "含基础能力与全部增量模块"
            : included.length
              ? `含基础能力与「${included[0].label}」`
              : "仅基础能力，增量模块按需加购"),
        price: formatCents(product.priceCents),
        priceNote: product.validityDays ? `有效期 ${product.validityDays} 天` : "买断 · 永久",
        includedModules: included.map((item) => item.label),
        excludedModules: excluded.map((item) => item.label),
        containsAll,
        totalModules,
        baseCount: codes.filter((code) => !code.startsWith("module.")).length,
        tone: toneAt(index),
        featured: index === featuredIndex && !owned && !soldOut,
        soldOut,
        owned,
        href: owned ? "/user/dashboard/index" : productHref(product),
        ctaLabel: owned ? "去账号中心" : soldOut ? "查看商品" : "查看详情",
        stockNote:
          !soldOut && stock > 0 && stock <= 5 ? `仅剩 ${stock} 份` : soldOut ? "已售罄" : "",
      };
    });
  });

  const trialProduct = computed(
    () =>
      catalog.products.find(
        (item) => catalog.isTrialProduct(item) && !catalog.primaryProductUnavailable(item),
      ) || null,
  );

  const trial = computed<TrialView | null>(() => {
    const product = trialProduct.value;
    if (!product) return null;
    return {
      product,
      href: productHref(product),
      price: formatCents(product.priceCents),
    };
  });

  const capabilityDomains = computed<CapabilityDomainView[]>(() =>
    CAPABILITY_DOMAINS.map((domain) => ({
      ...domain,
      cards: domain.cards.map((card) => {
        if (!card.feature) {
          return {
            ...card,
            requirement: "基础授权包含",
            requirementTone: "base" as const,
            href: null,
            linkLabel: null,
          };
        }
        const label = catalog.featureLabel(card.feature);
        const product = catalog.productForFeature(card.feature);
        const owned = catalog.ownsFeature(card.feature);
        const includedInFull = fullEditionModuleCodes.value.has(card.feature);
        const href = owned
          ? null
          : product
            ? productHref(product)
            : fullEditionProduct.value
              ? productHref(fullEditionProduct.value)
              : null;
        return {
          ...card,
          requirement: owned
            ? "已拥有"
            : includedInFull && !product
              ? `含于全功能版 · ${label}`
              : `需 ${label}`,
          requirementTone: owned ? ("owned" as const) : ("module" as const),
          href,
          linkLabel: href
            ? product
              ? "查看增量包"
              : includedInFull
                ? "了解全功能版"
                : "查看授权"
            : null,
        };
      }),
    })),
  );

  const fullEditionHref = computed(() => {
    const product = fullEditionProduct.value;
    return product ? productHref(product) : null;
  });

  const capabilityCount = computed(() =>
    capabilityDomains.value.reduce((total, domain) => total + domain.cards.length, 0),
  );

  /** FAQ 里「全功能版包含哪些模块」按功能目录动态生成，不再手写一份会漂移的名单。 */
  const faq = computed<FaqEntry[]>(() => {
    const modules = Array.from(fullEditionModuleCodes.value).map((code) =>
      catalog.featureLabel(code),
    );
    const list = modules.length
      ? modules
      : catalog.moduleFeatures.map((item) => item.label);
    const entry: FaqEntry = {
      question: "全功能版包含哪些模块？",
      answer: list.length
        ? `全功能版 = 基础能力 + ${list.length} 个增量模块：${list.join("、")}。若只需其中几项，可以先买基础版，再单独加购对应增量包。`
        : "全功能版 = 基础能力 + 全部增量模块。当前商品目录尚未给出模块清单，请以商品详情页的「包含能力」为准。",
    };
    const anchor = FAQ.findIndex((item) => item.question.includes("墙屏"));
    const at = anchor >= 0 ? anchor + 1 : Math.min(3, FAQ.length);
    return [...FAQ.slice(0, at), entry, ...FAQ.slice(at)];
  });

  const deployScripts = computed(() => site.deployScripts);
  const deployCommand = computed(() => site.deployCommand);
  const deployLabel = computed(() => deployScripts.value[0]?.label || "官方 Compose");
  const hasDeploy = computed(() => Boolean(deployCommand.value));

  return {
    hero: HERO,
    stage: STAGE,
    setup: SETUP,
    assurances: ASSURANCES,
    faq,
    tiers,
    trial,
    startingPrice,
    moduleCards,
    moduleGroups,
    capabilityDomains,
    capabilityCount,
    fullEditionHref,
    paymentBadges,
    deployScripts,
    deployCommand,
    deployLabel,
    hasDeploy,
    supportEmail: computed(() => site.supportEmail),
    authenticated,
    loaded: computed(() => catalog.loaded),
    showCatalogEmpty,
  };
}
