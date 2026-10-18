<script setup lang="ts">
import { computed, ref } from "vue";
import { useHomeView } from "@store/features/storefront/composables/useHomeView";

const { capabilityDomains, capabilityCount } = useHomeView();

const activeId = ref(capabilityDomains.value[0]?.id || "");
const active = computed(
  () => capabilityDomains.value.find((item) => item.id === activeId.value) || capabilityDomains.value[0],
);
</script>

<template>
  <section id="home-capability" class="hm-section" aria-labelledby="home-capability-title">
    <div class="hb-container">
      <header class="hm-head" data-tone="cool">
        <span class="hm-head__label">能力</span>
        <div class="hm-head__main">
          <h2 id="home-capability-title">一个界面，接管全屋</h2>
          <p>
            从户型图到每一盏灯、每一度温度、每一路摄像头，都在同一套界面里编排与操作。基础授权已经能跑通整条链路。
          </p>
        </div>
        <span class="hm-head__aside">
          六类能力 · 共 {{ capabilityCount }} 项<template v-if="!capabilityCount">，按功能目录更新</template>
        </span>
      </header>

      <div class="hm-cap">
        <div class="hm-cap__nav" role="group" aria-label="能力分类">
          <button
            v-for="domain in capabilityDomains"
            :key="domain.id"
            type="button"
            class="hm-cap__tab"
            :data-tone="domain.tone"
            :class="{ 'is-active': domain.id === active?.id }"
            :aria-pressed="domain.id === active?.id"
            @click="activeId = domain.id"
          >
            <i class="fa-duotone fa-regular" :class="domain.icon" aria-hidden="true"></i>
            <span class="hm-cap__tab-body">
              <strong>{{ domain.label }}</strong>
              <small>{{ domain.summary }}</small>
            </span>
            <em class="hb-mono">{{ domain.cards.length }}</em>
          </button>
        </div>

        <div v-if="active" class="hm-cap__panel" :data-tone="active.tone">
          <div class="hm-cap__intro">
            <span class="hm-cap__kicker">{{ active.kicker }}</span>
            <p>{{ active.blurb }}</p>
          </div>

          <ul class="hm-cap__list">
            <li v-for="card in active.cards" :key="card.title" class="hm-cap__row" :data-tone="card.tone">
              <span class="hm-cap__icon" aria-hidden="true">
                <i class="fa-duotone fa-regular" :class="card.icon"></i>
              </span>
              <div class="hm-cap__body">
                <div class="hm-cap__title">
                  <h3>{{ card.title }}</h3>
                  <span class="hb-chip" :data-tone="card.requirementTone === 'owned' ? 'eco' : undefined">
                    {{ card.requirement }}
                  </span>
                </div>
                <p>{{ card.description }}</p>
              </div>
              <RouterLink
                v-if="card.href && card.linkLabel"
                class="hm-cap__go"
                :to="card.href"
                :aria-label="`${card.linkLabel}：${card.title}`"
              >
                <span>{{ card.linkLabel }}</span>
                <i class="fa-duotone fa-regular fa-arrow-right" aria-hidden="true"></i>
              </RouterLink>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>
