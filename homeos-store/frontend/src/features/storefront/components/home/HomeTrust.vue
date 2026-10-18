<script setup lang="ts">
import { ref } from "vue";
import { useHomeView } from "@store/features/storefront/composables/useHomeView";

const { assurances, faq, supportEmail } = useHomeView();

const faqTones = ["accent", "cool", "eco", "lumen", "heat", "sensor"] as const;
const openFaq = ref(0);

function toggleFaq(index: number) {
  openFaq.value = openFaq.value === index ? -1 : index;
}
</script>

<template>
  <section id="home-assurance" class="hm-section hm-section--well" aria-labelledby="home-assurance-title">
    <div class="hb-container">
      <header class="hm-head" data-tone="aura">
        <span class="hm-head__label">保障</span>
        <div class="hm-head__main">
          <h2 id="home-assurance-title">授权落定，去向可查</h2>
          <p>到账即签发，数据留在本机。换机与订单，账号中心可查。</p>
        </div>
        <span class="hm-head__aside">查询请带订单号</span>
      </header>

      <ul class="hm-trust">
        <li v-for="item in assurances" :key="item.title" :data-tone="item.tone">
          <span class="hm-trust__icon" aria-hidden="true">
            <i class="fa-duotone fa-regular" :class="item.icon"></i>
          </span>
          <strong>{{ item.title }}</strong>
          <p>{{ item.description }}</p>
        </li>
      </ul>

      <div class="hm-faq" data-tone="aura">
        <div class="hm-faq__side">
          <h3>常见问题</h3>
          <p>没有找到答案？直接联系客服，带上订单号会快很多。</p>
          <a v-if="supportEmail" class="hm-faq__mail" :href="`mailto:${supportEmail}`">
            {{ supportEmail }}
          </a>
        </div>

        <div class="hm-faq__list">
          <details
            v-for="(entry, index) in faq"
            :key="entry.question"
            class="hm-faq__item"
            :data-tone="faqTones[index % faqTones.length]"
            :open="openFaq === index"
          >
            <summary @click.prevent="toggleFaq(index)">{{ entry.question }}</summary>
            <p>{{ entry.answer }}</p>
          </details>
        </div>
      </div>
    </div>
  </section>
</template>
