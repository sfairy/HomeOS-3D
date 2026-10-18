<script setup lang="ts">
import { useHomeView } from "@store/features/storefront/composables/useHomeView";

const { moduleGroups, fullEditionHref } = useHomeView();
</script>

<template>
  <section id="home-modules" class="hm-section hm-section--well" aria-labelledby="home-modules-title">
    <div class="hb-container">
      <header class="hm-head" data-tone="lumen">
        <span class="hm-head__label">模块</span>
        <div class="hm-head__main">
          <h2 id="home-modules-title">按需增补，一次配齐</h2>
          <p>
            基础授权已经覆盖中控、编辑、设备与系统能力；三维交互、安防、能源、语音这些按需单独加购，也可以一次买全功能版。
          </p>
        </div>
        <span class="hm-head__aside">增量包 · 挂到已有授权上</span>
      </header>

      <div class="hm-mod">
        <div v-if="moduleGroups.purchasable.length" class="hm-group" data-tone="lumen">
          <div class="hm-group__head">
            <strong>可单独购买</strong>
            <em class="hb-mono">{{ moduleGroups.purchasable.length }}</em>
            <small>独立下单，激活后即刻挂到你的主授权</small>
          </div>

          <ul class="hm-group__list">
            <li
              v-for="item in moduleGroups.purchasable"
              :key="item.code"
              class="hm-mod__row"
              :data-tone="item.tone"
            >
              <span class="hm-mod__icon" aria-hidden="true">
                <i class="fa-duotone fa-regular" :class="item.icon"></i>
              </span>
              <div class="hm-mod__body">
                <strong>
                  {{ item.label }}
                  <span v-if="item.owned" class="hb-chip" data-tone="eco">已拥有</span>
                </strong>
                <p>{{ item.description || "独立增量模块，激活后即可在编辑器中使用。" }}</p>
              </div>
              <span class="hm-mod__price">
                {{ item.price }}
                <small>增量包</small>
              </span>
              <RouterLink
                v-if="item.href"
                class="hm-mod__go"
                :to="item.href"
                :aria-label="`${item.ctaLabel}：${item.label}`"
              >
                {{ item.ctaLabel }}
                <i class="fa-duotone fa-regular fa-arrow-right" aria-hidden="true"></i>
              </RouterLink>
            </li>
          </ul>
        </div>

        <div v-if="moduleGroups.included.length" class="hm-group hm-group--included" data-tone="eco">
          <div class="hm-group__head">
            <strong>含于全功能版</strong>
            <em class="hb-mono">{{ moduleGroups.included.length }}</em>
            <small>
              不单独拆卖
              <template v-if="fullEditionHref">
                ，升级全功能版即可一次拿齐
              </template>
            </small>
          </div>

          <ul class="hm-wall">
            <li v-for="item in moduleGroups.included" :key="item.code" :data-tone="item.tone">
              <RouterLink
                v-if="item.href"
                class="hm-wall__tile"
                :to="item.href"
                :title="item.description || '随全功能版提供。'"
                :aria-label="`${item.ctaLabel}：${item.label}`"
              >
                <span class="hm-wall__icon" aria-hidden="true">
                  <i class="fa-duotone fa-regular" :class="item.icon"></i>
                </span>
                <strong>{{ item.label }}</strong>
              </RouterLink>
              <span v-else class="hm-wall__tile" :title="item.description || '随全功能版提供。'">
                <span class="hm-wall__icon" aria-hidden="true">
                  <i class="fa-duotone fa-regular" :class="item.icon"></i>
                </span>
                <strong>{{ item.label }}</strong>
              </span>
            </li>
          </ul>
        </div>

        <p v-if="!moduleGroups.purchasable.length && !moduleGroups.included.length" class="hm-note">
          增量模块目录暂时读不到。可以先进商品页查看每档授权自带的能力清单。
        </p>
      </div>

      <div v-if="fullEditionHref" class="hm-mod__foot">
        <p>不想逐项挑？全功能版把所有增量模块一次配齐，之后新增的模块也不再另收费。</p>
        <RouterLink class="hb-button hb-button--secondary hb-button--sm" :to="fullEditionHref">
          查看全功能版
          <i class="fa-duotone fa-regular fa-arrow-right" aria-hidden="true"></i>
        </RouterLink>
      </div>
    </div>
  </section>
</template>
