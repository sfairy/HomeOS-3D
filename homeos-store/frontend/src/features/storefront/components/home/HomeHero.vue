<script setup lang="ts">
import { computed } from "vue";
import HomeStageDemo from "@store/features/storefront/components/home/HomeStageDemo.vue";
import { useHomeView } from "@store/features/storefront/composables/useHomeView";

const { hero, startingPrice, authenticated, loaded, showCatalogEmpty, trial } = useHomeView();

const canBuy = computed(() => !loaded.value || !showCatalogEmpty.value);
const primaryLabel = computed(() => {
  if (authenticated.value) return "购买或升级授权";
  return trial.value ? "选购或先试用" : hero.primaryCta;
});
</script>

<template>
  <section class="hm-hero" aria-labelledby="home-hero-title">
    <div class="hm-hero__fx" aria-hidden="true">
      <span class="hm-hero__sky"></span>
      <span class="hm-hero__grid"></span>
    </div>

    <div class="hb-container hm-hero__inner">
      <div class="hm-hero__copy" data-tone="accent">
        <span class="hm-eyebrow">{{ hero.eyebrow }}</span>
        <h1 id="home-hero-title">
          {{ hero.titleLead }}<br />
          <strong>{{ hero.titleAccent }}</strong>
        </h1>
        <p class="hm-hero__lead">{{ hero.lead }}</p>

        <p v-if="startingPrice" class="hm-hero__price">
          <strong>{{ startingPrice }}</strong>
          <span>{{ hero.priceNote }}</span>
        </p>

        <div class="hm-hero__actions">
          <RouterLink
            v-if="canBuy"
            class="hb-button hb-button--primary hb-button--lg"
            to="/products"
          >
            {{ primaryLabel }}
            <i class="fa-duotone fa-regular fa-arrow-right" aria-hidden="true"></i>
          </RouterLink>
          <a class="hb-button hb-button--secondary hb-button--lg" href="#home-journey">
            {{ hero.secondaryCta }}
          </a>
          <RouterLink
            v-if="!authenticated"
            class="hb-button hb-button--lg"
            to="/user/authentication/login"
          >
            已有账号，登录
          </RouterLink>
          <RouterLink v-else class="hb-button hb-button--lg" to="/user/dashboard/index">
            账号中心
          </RouterLink>
        </div>

        <p v-if="showCatalogEmpty" class="hm-hero__empty">
          当前暂无授权上架。可以先注册账号，上架后这里会显示档位与价格。
        </p>
      </div>

      <div class="hm-hero__stage">
        <HomeStageDemo />
      </div>
    </div>
  </section>
</template>
