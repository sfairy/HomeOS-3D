<script setup lang="ts">
import { computed, ref } from "vue";
import { useCatalogStore, storePageHref } from "../../stores/catalog.js";
import { useSessionStore } from "../../stores/session.js";
import { formatCents as money } from "../../money.js";
import type { StoreProduct } from "../../store-types.js";

const catalog = useCatalogStore();
const session = useSessionStore();
const filter = ref("all");

interface Card {
  group: string;
  product: StoreProduct;
  kind: "primary" | "addon";
}

const cards = computed<Card[]>(() => {
  const list: Card[] = catalog.primaryProducts.map((product) => ({
    group: catalog.productGroup(product),
    product,
    kind: "primary",
  }));
  if (session.hasPermanentLicense) {
    catalog.addonProducts.forEach((product) =>
      list.push({ group: "addon", product, kind: "addon" }),
    );
  }
  return list;
});

const counts = computed(() => {
  const result: Record<string, number> = { all: cards.value.length, base: 0, bundle: 0, trial: 0, addon: 0 };
  for (const card of cards.value) result[card.group] = (result[card.group] || 0) + 1;
  return result;
});

const filters = computed(() =>
  [
    { key: "all", label: "全部" },
    { key: "base", label: "主授权" },
    { key: "bundle", label: "全授权" },
    { key: "trial", label: "试用" },
    { key: "addon", label: "增量包" },
  ].filter((item) => item.key === "all" || (counts.value[item.key] || 0) > 0),
);

const visibleCards = computed(() =>
  filter.value === "all" ? cards.value : cards.value.filter((card) => card.group === filter.value),
);

function upgradeId() {
  return new URLSearchParams(location.search).get("upgrade");
}

function productHref(product: StoreProduct) {
  const base = storePageHref(`/item/${encodeURIComponent(product.id)}`);
  const upgrade = upgradeId();
  return upgrade && !catalog.isTrialProduct(product)
    ? `${base}?upgrade=${encodeURIComponent(upgrade)}`
    : base;
}

function primaryUnavailable(product: StoreProduct) {
  return catalog.primaryProductUnavailable(product);
}

function primaryBadge(product: StoreProduct) {
  if (catalog.isTrialProduct(product)) return `${product.validityDays} 天试用`;
  if (product.productType === "bundle") return "全授权";
  if (product.productType === "package") return "自定义套餐";
  return "主授权";
}

function primarySummary(product: StoreProduct) {
  return product.productType === "package"
    ? catalog.packageContentsText(product)
    : product.displayDescription || product.note || "";
}

function addonDescription(product: StoreProduct) {
  return product.displayDescription || product.note || "购买后追加到现有激活码。";
}
</script>

<template>
  <main class="hb-store-main" data-store-page="products">
    <div class="hb-container">
      <div class="hb-page-head">
        <div>
          <div class="hb-page-head__eyebrow">
            <span class="hb-kicker">License Editions</span>
            <span class="hb-page-head__path">~/store/products</span>
          </div>
          <h1>选择 <strong>HomeOS</strong> 授权版本</h1>
          <p>主授权决定基础能力，增量包按需叠加到已有的永久激活码上。</p>
        </div>
        <div class="hb-page-head__feed">
          <div><small>交付</small><strong>支付确认后自动发码</strong></div>
          <div><small>归属</small><strong>激活码绑定下单账号</strong></div>
          <div><small>解绑</small><strong>每份授权独立计算冷却</strong></div>
        </div>
      </div>
      <div class="hb-filter" role="tablist" aria-label="按类型筛选商品">
        <button
          v-for="item in filters"
          :key="item.key"
          type="button"
          class="hb-filter__item"
          :class="{ 'is-active': filter === item.key }"
          role="tab"
          :aria-selected="filter === item.key"
          @click="filter = item.key"
        >
          {{ item.label }} <span class="hb-filter__count">{{ counts[item.key] || 0 }}</span>
        </button>
      </div>
      <div id="products-grid" class="hb-addons-grid">
        <article
          v-for="card in visibleCards"
          :key="card.product.id"
          class="hb-addon-card"
          :class="{ 'is-purchased': card.kind === 'primary' && primaryUnavailable(card.product) }"
        >
          <span class="hb-addon-card__badge">
            {{ card.kind === "primary" ? primaryBadge(card.product) : catalog.addonTypeLabel(card.product) }}
          </span>
          <h3>{{ card.product.name }}</h3>
          <p v-if="card.kind === 'primary' ? primarySummary(card.product) : true">
            {{ card.kind === "primary" ? primarySummary(card.product) : addonDescription(card.product) }}
          </p>
          <div class="hb-addon-card__footer">
            <strong>{{ money(card.product.priceCents) }}</strong>
            <template v-if="card.kind === 'primary'">
              <span v-if="primaryUnavailable(card.product)" class="hb-button hb-button--secondary hb-button--sm is-disabled">
                {{ session.hasPermanentLicense ? "已有永久授权" : "已购买试用" }}
              </span>
              <span v-else-if="card.product.soldOut" class="hb-button hb-button--secondary hb-button--sm is-disabled">已售罄</span>
              <RouterLink v-else class="hb-button hb-button--primary hb-button--sm" :to="productHref(card.product)">
                {{ session.account ? (upgradeId() && !catalog.isTrialProduct(card.product) ? "选择升级版本" : "选择此版本") : "查看详情" }}
              </RouterLink>
            </template>
            <template v-else>
              <span v-if="card.product.soldOut" class="hb-button hb-button--secondary hb-button--sm is-disabled">已售罄</span>
              <RouterLink v-else class="hb-button hb-button--primary hb-button--sm" :to="`/item/${encodeURIComponent(card.product.id)}`">
                {{ session.account ? "查看并购买" : "查看详情" }}
              </RouterLink>
            </template>
          </div>
        </article>
        <div v-if="!cards.length" class="hb-addons-empty">暂无主授权或全授权上架。</div>
      </div>
    </div>
  </main>
</template>
