<template>
  <!-- ScreensaverWeatherPanel 屏保天气面板：显示天气信息 -->
  <div class="ss-panel ss-panel--weather">
    <div class="ss-wx-hero ss-fade-1">
      <div v-if="ssCfg.showWeatherIcon" class="ss-weather-glyph">{{ weatherIcon }}</div>
      <div class="ss-wx-temp-line">
        <span class="ss-wx-temp">{{ weatherTemp }}</span>
        <span class="ss-wx-unit">°</span>
      </div>
      <p v-if="ssCfg.showWeatherDesc" class="ss-wx-desc">{{ weatherDesc }}</p>
    </div>

    <p v-if="ssCfg.showWeatherStats && weatherExtra" class="ss-wx-stats ss-fade-2">
      <template v-for="(info, i) in weatherExtra" :key="i">
        <span v-if="i > 0" class="ss-wx-stat-sep">·</span>
        <span class="ss-wx-stat">{{ info.icon }} {{ info.val }}</span>
      </template>
    </p>

    <div v-if="ssCfg.showWeatherMeta" class="ss-meta ss-meta--wx ss-fade-3">
      <p v-if="ssCfg.showGregorianDate" class="ss-date-primary">{{ dateWeek }} · {{ dateMD }}</p>
      <p class="ss-date-secondary">
        <template v-if="ssCfg.showSeconds">{{ timeHour }}:{{ timeMin }}:{{ timeSec }}</template>
        <template v-else>{{ timeHour }}:{{ timeMin }}</template>
        <span v-if="ssCfg.showLunar" class="ss-meta-gap">·</span>
        <template v-if="ssCfg.showLunar">{{ lunarMonthDayLine }}</template>
      </p>
    </div>
  </div>
</template>

<script setup>
/**
 * ScreensaverWeatherPanel - 屏保天气面板组件
 * 功能特性：
 * - 显示当前天气温度和状态
 * - 显示天气图标
 * - 可能显示更多天气详情
 * - 用于屏保界面
 */
defineProps({
  /** 屏保配置对象（含 showWeatherIcon/showWeatherDesc/showWeatherMeta 等开关） */
  ssCfg: { type: Object, required: true },
  /** 天气图标（emoji 或字符） */
  weatherIcon: { type: String, required: true },
  /** 温度数值 */
  weatherTemp: { type: [String, Number], required: true },
  /** 天气描述文案 */
  weatherDesc: { type: String, required: true },
  /** 额外天气信息列表（每项含 icon/val） */
  weatherExtra: { type: [Array, null], default: null },
  /** 星期文案 */
  dateWeek: { type: String, required: true },
  /** 月-日文案 */
  dateMD: { type: String, required: true },
  /** 小时 */
  timeHour: { type: String, required: true },
  /** 分钟 */
  timeMin: { type: String, required: true },
  /** 秒 */
  timeSec: { type: String, required: true },
  /** 农历月日单行文案 */
  lunarMonthDayLine: { type: String, required: true },
})
</script>
