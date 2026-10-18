<script setup lang="ts">
import { computed } from "vue";
import { useHomeView } from "@store/features/storefront/composables/useHomeView";

const { tiers, trial, loaded, paymentBadges } = useHomeView();
const channels = computed(() => paymentBadges.value.join(" / "));
</script>

<template>
  <section id="home-tiers" class="hm-section hm-section--well" aria-labelledby="home-tiers-title">
    <div class="hb-container">
      <header class="hm-head" data-tone="accent">
        <span class="hm-head__label">授权</span>
        <div class="hm-head__main">
          <h2 id="home-tiers-title">按需定档，一次买断</h2>
          <p>
            主授权决定基础能力，增量包挂在同一张永久激活码上。价格、包含模块与可售状态都直接来自在售商品。
          </p>
        </div>
        <span class="hm-head__aside">
          买断 · 一次付费<template v-if="channels"> · {{ channels }}</template>
        </span>
      </header>

      <div v-if="tiers.length" class="hm-plans">
        <article
          v-for="tier in tiers"
          :key="tier.id"
          class="hm-plan"
          :class="{ 'is-featured': tier.featured, 'is-owned': tier.owned }"
          :data-tone="tier.tone"
        >
          <span v-if="tier.featured" class="hm-plan__flag">推荐</span>
          <span v-if="tier.owned" class="hm-plan__owned hb-chip" data-tone="eco">已拥有</span>

          <p class="hm-plan__hint">{{ tier.hint }}</p>
          <h3>{{ tier.name }}</h3>
          <p v-if="tier.description" class="hm-plan__desc">{{ tier.description }}</p>

          <p class="hm-plan__price">
            <strong>{{ tier.price }}</strong>
            <span>{{ tier.priceNote }}</span>
          </p>

          <ul class="hm-plan__list">
            <li v-if="tier.baseCount">
              <i class="fa-duotone fa-regular fa-check" aria-hidden="true"></i>
              基础能力 {{ tier.baseCount }} 项
            </li>

            <li v-if="tier.containsAll">
              <i class="fa-duotone fa-regular fa-check" aria-hidden="true"></i>
              全部 {{ tier.totalModules }} 个增量模块
            </li>
            <template v-else>
              <li v-for="label in tier.includedModules.slice(0, 2)" :key="label">
                <i class="fa-duotone fa-regular fa-check" aria-hidden="true"></i>
                {{ label }}
              </li>
              <li v-if="tier.includedModules.length > 2" class="is-quiet">
                另含 {{ tier.includedModules.length - 2 }} 个增量模块
              </li>
            </template>

            <li v-if="tier.excludedModules.length" class="is-quiet">
              不含 {{ tier.excludedModules.slice(0, 2).join("、")
              }}<template v-if="tier.excludedModules.length > 2">
                等 {{ tier.excludedModules.length }} 项</template
              >
            </li>

            <li v-if="!tier.baseCount && !tier.includedModules.length" class="is-quiet">
              以商品详情页的「包含能力」为准
            </li>
          </ul>

          <RouterLink
            v-if="tier.href"
            class="hb-button hm-plan__cta"
            :class="tier.featured ? 'hb-button--primary' : 'hb-button--secondary'"
            :to="tier.href"
          >
            {{ tier.ctaLabel }}
          </RouterLink>

          <p v-if="tier.stockNote" class="hm-plan__stock">{{ tier.stockNote }}</p>
        </article>
      </div>

      <div v-else class="hm-empty">
        <i class="fa-duotone fa-regular fa-box-open" aria-hidden="true"></i>
        <template v-if="loaded">
          <strong>当前暂无授权上架</strong>
          <p>可以先注册账号，上架后这里会显示档位与价格。</p>
        </template>
        <template v-else>
          <strong>正在读取在售授权</strong>
          <p>商品目录加载完成后，这里会显示档位、价格与包含模块。</p>
        </template>
      </div>

      <div v-if="trial" class="hm-trial">
        <span class="hm-trial__tag">试用授权 · 一生一次</span>
        <p>先在自己的设备上跑通，再决定买哪一版。到期后数据保留，升级不用重新配置。</p>
        <RouterLink class="hm-trial__link" :to="trial.href">
          了解试用
          <i class="fa-duotone fa-regular fa-arrow-right" aria-hidden="true"></i>
        </RouterLink>
      </div>

      <p class="hm-note">
        价格与包含内容以商品详情页为准；增量包挂到已有永久授权上，不影响原授权有效期。
      </p>
    </div>
  </section>
</template>
