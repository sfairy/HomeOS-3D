<script setup lang="ts">
import type { SettingsForm, SettingsPlaceholders } from "./types.js";

defineProps<{ form: SettingsForm; ph: SettingsPlaceholders }>();
</script>

<template>
  <div class="admin-tab-pane" role="tabpanel" data-tone="eco">
    <div class="hb-check-group admin-grid__full">
      <label class="hb-check"><input v-model="form.referralEnabled" type="checkbox" /> 邀请有礼</label>
    </div>
    <label class="hb-field">
      <span>奖励比例 %</span>
      <input v-model="form.referralRatePercent" class="hb-input" type="number" step="0.01" />
    </label>
    <label class="hb-field">
      <span>提现手续费 %</span>
      <input v-model="form.referralWithdrawalFeePercent" class="hb-input" type="number" step="0.01" />
    </label>
    <label class="hb-field admin-grid__fill-2col">
      <span>最低提现积分</span>
      <input v-model="form.referralWithdrawalMinPoints" class="hb-input" type="number" step="0.01" />
    </label>
    <label class="hb-field admin-grid__full">
      <span>解绑冷却（秒）</span>
      <input
        v-model="form.deviceReleaseCooldownSeconds"
        class="hb-input"
        type="number"
        min="0"
        :placeholder="ph.deviceReleaseCooldownSeconds"
      />
      <small class="admin-field-hint">
        两次<b>解绑</b>之间的间隔。<b>留空 = 跟随环境变量</b>，填 0 = 不限间隔。解绑之后可以立即重新激活（同机或换机都行）；这个值只约束「下一次解绑」，不拦激活。
      </small>
    </label>
  </div>
</template>
