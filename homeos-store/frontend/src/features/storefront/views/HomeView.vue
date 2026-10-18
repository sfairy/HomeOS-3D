<script setup lang="ts">
import { nextTick, watch } from "vue";
import { useRoute } from "vue-router";
import HomeCapabilityIndex from "@store/features/storefront/components/home/HomeCapabilityIndex.vue";
import HomeCta from "@store/features/storefront/components/home/HomeCta.vue";
import HomeHero from "@store/features/storefront/components/home/HomeHero.vue";
import HomeModuleBoard from "@store/features/storefront/components/home/HomeModuleBoard.vue";
import HomePricing from "@store/features/storefront/components/home/HomePricing.vue";
import HomeSetup from "@store/features/storefront/components/home/HomeSetup.vue";
import HomeTrust from "@store/features/storefront/components/home/HomeTrust.vue";
import { useCatalogStore } from "@store/features/storefront/stores/catalog";
import { scrollToHash } from "@store/shared/utils/hash-scroll";

const route = useRoute();
const catalog = useCatalogStore();

/**
 * 商品目录是异步的：从别的页面点「授权对比」落到 `/#home-tiers` 时，路由滚动那一刻
 * 档位卡还没渲染，区块比最终高度矮一截，滚动位置就偏了。目录到位后按 hash 再对齐一次。
 *
 * 旧版靠首屏 `DeckTiles` 的 `@loaded` 兜这件事；首屏不再放异步甲板之后，这里接手。
 */
watch(
  () => catalog.loaded,
  async (loaded) => {
    if (!loaded || !route.hash) return;
    await nextTick();
    await nextTick();
    scrollToHash(route.hash);
  },
  { immediate: true },
);
</script>

<template>
  <!--
    首页只做组合：每个区块自己取 `useHomeView()` 的视图模型，文案在 `content/home.ts`。
    真正的数据加载在 StoreLayout（商品目录 / 站点配置 / 会话），这里不重复请求。

    幕序按**购买决策**排：先给价格，再给能力与模块证据，最后是部署与保障。
    锚点 `#home-tiers` / `#home-capability` / `#home-modules` / `#home-journey` /
    `#home-assurance` 是 StoreLayout 导航与页脚链接的契约，改名要同步改那边。
  -->
  <main class="hb-store-main hb-store-main--flush" data-store-page="home">
    <HomeHero />
    <HomePricing />
    <HomeCapabilityIndex />
    <HomeModuleBoard />
    <HomeSetup />
    <HomeTrust />
    <HomeCta />
  </main>
</template>
