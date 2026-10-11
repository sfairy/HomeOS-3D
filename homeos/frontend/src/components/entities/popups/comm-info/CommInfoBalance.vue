/** - 展示账户余额、本月消费、欠费、信用额度、积分与刷新时间 */
<script setup>
defineProps({
  balance: { type: String, default: '--' },
  monthlyFee: { type: String, default: '--' },
  arrear: { type: String, default: '--' },
  creditLimit: { type: String, default: '--' },
  points: { type: String, default: '--' },
  refreshTime: { type: String, default: '--' },
  relLabel: { type: String, default: '' },
  relClass: { type: String, default: '' },
})
</script>

<template>
  <!-- CommInfoBalance 通信信息余额：展示通信套餐余额和使用情况 -->
  <section class="comm-balance">
    <div class="comm-balance__row">
      <div class="comm-balance__primary">
        <span class="comm-balance__tag">{{ '账户余额' }}</span>
        <span class="comm-balance__amount"><em>¥</em>{{ balance }}</span>
      </div>
      <div class="comm-balance__chips">
        <span v-if="monthlyFee !== '--'" class="comm-balance__chip">
          <em>{{ '本月消费' }}</em>
          <strong>{{ monthlyFee }}</strong
          ><small>{{ '元' }}</small>
        </span>
        <span v-if="arrear !== '--'" class="comm-balance__chip comm-balance__chip--warn">
          <em>{{ '欠费' }}</em>
          <strong>{{ arrear }}</strong
          ><small>{{ '元' }}</small>
        </span>
        <span v-if="creditLimit !== '--'" class="comm-balance__chip">
          <em>{{ '信用额度' }}</em>
          <strong>{{ creditLimit }}</strong
          ><small>{{ '元' }}</small>
        </span>
        <span v-if="points !== '--'" class="comm-balance__chip">
          <em>{{ '积分' }}</em>
          <strong>{{ points }}</strong
          ><small>{{ '分' }}</small>
        </span>
      </div>
    </div>
    <footer class="comm-balance__foot">
      <span>{{ '最近刷新' }} {{ refreshTime || '--' }}</span>
      <span v-if="relLabel" :class="['um-rel-tag', relClass]">{{ relLabel }}</span>
    </footer>
  </section>
</template>
