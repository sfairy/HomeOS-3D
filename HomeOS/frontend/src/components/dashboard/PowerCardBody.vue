<template>
  <!-- PowerCardBody 能源卡片主体：展示能源使用数据和图表 -->
  <div class="power-card__icon-wrap" aria-hidden="true">
    <span class="power-card__icon">{{ item.icon }}</span>
  </div>
  <div class="power-card__col">
    <div class="power-card__row power-card__row--value">
      <span
        class="power-card__value"
        :class="{
          'power-card__value--date': item.isDate,
          'pcb-value-danger': item.showProgress && item.balanceNum != null && item.balanceNum < 50,
          'pcb-value-warn':
            item.showProgress &&
            item.balanceNum != null &&
            item.balanceNum >= 50 &&
            item.balanceNum < 100,
        }"
        >{{ item.value }}</span
      >
      <span v-if="item.unit" class="power-card__unit">{{ formatUnit(item.unit) }}</span>
    </div>
    <div v-if="item.label || item.secondary != null" class="power-card__meta">
      <span v-if="item.label" class="power-card__label">{{ item.label }}</span>
      <span
        v-if="item.secondary != null"
        class="power-card__secondary"
        :class="{ 'power-card__secondary--solo': !item.label }"
      >
        <span v-if="item.secondaryName" class="power-card__secondary-name">{{
          item.secondaryName
        }}</span>
        <span class="power-card__secondary-value"
          >{{ item.secondary }}<span class="power-card__unit">{{ formatUnit('¥') }}</span></span
        >
      </span>
    </div>
    <div v-if="item.showProgress" class="power-card__bar">
      <VProgressBar
        :value="item.progressValue"
        :color-value="item.balanceNum"
        variant="balance"
        size="xs"
        auto-glow
      />
    </div>
  </div>
</template>

<script setup>
/**
 * PowerCardBody.vue
 *
 * 所属模块：dashboard（仪表盘底栏能源卡片主体）
 * 职责：展示单张能源卡片主体内容。包含主数值（带单位）、副数值（如剩余金额）、
 *      标签与进度条（balance variant）。当余额 < 50 / 50-100 时为主数值附加
 *      danger / warn 样式。单位经 formatUnit 转换（¥ → 元）。
 * 依赖：vue、VProgressBar（balance variant 进度条）。
 */
import VProgressBar from '@/components/common/base/VProgressBar.vue'

/**
 * 组件 Props
 * @property {object} item        - 卡片数据对象（含 value/unit/label/secondary/secondaryName/
 *                                  showProgress/progressValue/balanceNum/isDate/color 等字段）
 * @property {Function} formatUnit - 单位格式化函数（如 ¥ → 元）
 */
defineProps({
  item: { type: Object, required: true },
  formatUnit: { type: Function, required: true },
})
</script>

<style scoped src="./styles/PowerCardBody.css"></style>
