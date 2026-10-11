/** - 展示阶梯电价档位（一档/二档）的用量与单价，高亮当前所处档位 */
<template>
  <section class="um-tier-section">
    <div class="um-tier-head">
      <h3 class="um-section-title">{{ title }}</h3>
      <span class="um-tier-badge">{{ tierLabel }}</span>
    </div>
    <div class="um-tiers">
      <div :class="['um-tier', 'um-tier--1', { 'um-tier--cur': activeTier === 1 }]">
        <div class="um-tier-block"><span>第一阶梯</span></div>
        <div class="um-tier-info">
          <span class="um-tier-range">{{ `≤ ${t1l} ${unit}` }}</span>
          <span class="um-tier-price"
            ><b>{{ t1p }}</b
            >{{ ` ${priceUnit}` }}</span
          >
        </div>
      </div>
      <div :class="['um-tier', 'um-tier--2', { 'um-tier--cur': activeTier === 2 }]">
        <div class="um-tier-block"><span>第二阶梯</span></div>
        <div class="um-tier-info">
          <span class="um-tier-range">{{ `${t1l} - ${t2l} ${unit}` }}</span>
          <span class="um-tier-price"
            ><b>{{ t2p }}</b
            >{{ ` ${priceUnit}` }}</span
          >
        </div>
      </div>
      <div :class="['um-tier', 'um-tier--3', { 'um-tier--cur': activeTier === 3 }]">
        <div class="um-tier-block"><span>第三阶梯</span></div>
        <div class="um-tier-info">
          <span class="um-tier-range">{{ `> ${t2l} ${unit}` }}</span>
          <span class="um-tier-price"
            ><b>{{ t3p }}</b
            >{{ ` ${priceUnit}` }}</span
          >
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  tierLabel: { type: String, default: '' },
  activeTier: { type: Number, default: 1 },
  t1l: { type: [String, Number], default: '--' },
  t2l: { type: [String, Number], default: '--' },
  t1p: { type: [String, Number], default: '--' },
  t2p: { type: [String, Number], default: '--' },
  t3p: { type: [String, Number], default: '--' },
  unit: { type: String, required: true },
  priceUnit: { type: String, required: true },
})
</script>

<style scoped src="./styles/UtilityMeterTierSection.css"></style>
