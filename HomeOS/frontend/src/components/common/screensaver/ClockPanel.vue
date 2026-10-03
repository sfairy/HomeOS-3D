<template>
  <!-- ScreensaverClockPanel 屏保时钟面板：显示当前时间和日期 -->
  <div class="ss-panel ss-panel--clock">
    <div class="ss-time-block ss-fade-1">
      <div class="ss-time-row">
        <span class="ss-time">{{ timeHour }}</span>
        <span class="ss-time-sep" :key="timeSec">:</span>
        <span class="ss-time">{{ timeMin }}</span>
      </div>
      <div v-if="ssCfg.showSeconds" class="ss-sec-row">
        <span class="ss-sec">{{ timeSec }}</span>
      </div>
    </div>

    <div v-if="ssCfg.showGregorianDate || ssCfg.showLunar" class="ss-meta ss-fade-2">
      <p v-if="ssCfg.showGregorianDate" class="ss-date-primary">{{ dateWeek }} · {{ dateMD }}</p>
      <p v-if="ssCfg.showGregorianDate || ssCfg.showLunar" class="ss-date-secondary">
        <template v-if="ssCfg.showGregorianDate">{{ dateYear }}</template>
        <span v-if="ssCfg.showGregorianDate && ssCfg.showLunar" class="ss-meta-gap">·</span>
        <template v-if="ssCfg.showLunar">{{ lunarFullLine }}</template>
      </p>
    </div>
  </div>
</template>

<script setup>
/**
 * ScreensaverClockPanel - 屏保时钟面板组件
 * 功能特性：
 * - 显示当前时间（时:分:秒）
 * - 显示日期和星期
 * - 实时更新
 * - 用于屏保界面
 */
defineProps({
  /** 屏保配置对象（含 showSeconds/showGregorianDate/showLunar 等开关） */
  ssCfg: { type: Object, required: true },
  /** 小时（已格式化为字符串） */
  timeHour: { type: String, required: true },
  /** 分钟（已格式化为字符串） */
  timeMin: { type: String, required: true },
  /** 秒（已格式化为字符串） */
  timeSec: { type: String, required: true },
  /** 星期（如「星期一」） */
  dateWeek: { type: String, required: true },
  /** 月-日（如「1 月 1 日」） */
  dateMD: { type: String, required: true },
  /** 年份（如「2026 年」） */
  dateYear: { type: String, required: true },
  /** 农历完整单行文案 */
  lunarFullLine: { type: String, required: true },
})
</script>
