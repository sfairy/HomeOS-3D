<script setup lang="ts">
import { computed } from "vue";
import { useHomeView } from "@store/features/storefront/composables/useHomeView";

const { startingPrice, hero, authenticated, loaded, showCatalogEmpty } = useHomeView();

const canBuy = computed(() => !loaded.value || !showCatalogEmpty.value);
const primaryLabel = computed(() => (authenticated.value ? "购买或升级授权" : "选购授权"));
</script>

<template>
  <section class="hm-section hm-section--cta" aria-labelledby="home-cta-title">
    <div class="hb-container">
      <div class="hm-cta" data-tone="accent">
        <div class="hm-cta__copy">
          <h2 id="home-cta-title">让整个家，回到一块屏里</h2>
          <p v-if="startingPrice" class="hm-cta__price">
            <strong>{{ startingPrice }}</strong> {{ hero.priceNote }}
          </p>
          <p v-else class="hm-cta__price">先在自己的机器上跑通，再决定买哪一版。</p>
        </div>

        <div class="hm-cta__actions">
          <RouterLink
            v-if="canBuy"
            class="hb-button hb-button--primary hb-button--lg"
            to="/products"
          >
            {{ primaryLabel }}
            <i class="fa-duotone fa-regular fa-arrow-right" aria-hidden="true"></i>
          </RouterLink>
          <a class="hb-button hb-button--secondary hb-button--lg" href="#home-journey">部署方式</a>
        </div>
      </div>
    </div>
  </section>
</template>
