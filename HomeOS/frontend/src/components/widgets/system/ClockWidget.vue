<template>
  <div class="clock">
    <!-- 左侧：数字时钟 + 公历日期 -->
    <div class="clock__left">
      <div class="clock__time">
        <span class="clock__time-main">{{ timeMain }}</span>
        <span class="clock__time-second">{{ timeSecond }}</span>
      </div>
      <div class="clock__date">{{ dateStr }}</div>
    </div>
    <!-- 右侧：农历年份（干支纪年）+ 农历月日（含节气） -->
    <div class="clock__right">
      <div class="clock__lunar-year">{{ lunarYear }}</div>
      <div class="clock__lunar-date">{{ lunarDate }}</div>
    </div>
  </div>
</template>

<script setup>
/**
 * @file ClockWidget.vue
 * @module widgets/system
 * @description 时钟部件：展示当前时间、日期、星期与 24 节气，
 *              支持模拟时钟与数字时钟两种展示形态。
 * @dependencies
 *  - vue: computed/ref/onMounted/onUnmounted 响应式与生命周期
 *  - @/utils/format/locale-format.util: 本地时间与节气格式化
 */
/**
 * 24 节气名称索引表
 * 索引 0-23 对应 SOLAR_TERM_INFO 中的节气编码偏移量。
 * @type {Object<number, string>}
 */
const WEEKDAY_LABELS = {
  0: '小寒',
  1: '大寒',
  10: '芒种',
  11: '夏至',
  12: '小暑',
  13: '大暑',
  14: '立秋',
  15: '处暑',
  16: '白露',
  17: '秋分',
  18: '寒露',
  19: '霜降',
  2: '立春',
  20: '立冬',
  21: '小雪',
  22: '大雪',
  23: '冬至',
  3: '雨水',
  4: '惊蛰',
  5: '春分',
  6: '清明',
  7: '谷雨',
  8: '立夏',
  9: '小满',
}

/**
 * 时钟部件
 * 支持数字时钟 + 农历显示。
 *
 * 侧栏时钟始终显示秒、每秒对齐墙钟刷新。性能档位不再隐藏秒数
 * （平板默认中档 / 智能降档曾把秒裁掉）。屏保空闲时暂停以省电。
 *
 * 农历数据通过计算得出（无需外部依赖），
 * 显示农历年份（干支纪年）和农历月日。
 */
import { computed, onMounted, onUnmounted } from 'vue'
import { usePerfClock } from '@/composables/ui/usePerfClock'
import { onScreensaverBackgroundIdle } from '@/utils/ui/screensaver-background-idle.util'
import { solarToLunar } from '@/utils/format/lunar-calendar'
import { formatLunarMonthDayLine, formatLunarYearLine } from '@/utils/format/lunar-display.util'
import { pad2 } from '@/utils/format/locale-format.util'
import { getZonedParts } from '@/utils/format/locale-time'

const { now, start, stop } = usePerfClock({ autoStart: false, forceIntervalMs: 1000 })
/** 屏保空闲订阅取消函数 */
let unsubScreensaverIdle = null

onMounted(() => {
  start()
  unsubScreensaverIdle = onScreensaverBackgroundIdle((idle) => {
    if (idle) stop()
    else start()
  })
})
onUnmounted(() => {
  unsubScreensaverIdle?.()
})

const timeParts = computed(() => getZonedParts(now.value, { hour12: false }))
/** 时间主显示：HH:mm（不依赖 locale 字符串拆分） */
const timeMain = computed(
  () => `${pad2(timeParts.value.hour)}:${pad2(timeParts.value.minute)}`,
)
/** 秒显示：ss */
const timeSecond = computed(() => pad2(timeParts.value.second))

/** 公历日期字符串（含年月日与星期） */
const dateStr = computed(() =>
  now.value.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }),
)

// ==================== 节气计算（ClockWidget 独有） ====================

/** 24 节气对应的编码偏移量（用于推算每个节气的公历日期） */
const SOLAR_TERM_INFO = [
  0, 21208, 42467, 63836, 85337, 107014, 128867, 150921, 173149, 195551, 218072, 240693, 263343,
  285989, 308563, 331033, 353350, 375494, 397447, 419210, 440795, 462224, 483532, 504758,
]

/** 节气计算的基准年（1900） */
const BASE_YEAR = 1900
/** 节气计算的基准日期（1900-01-31） */
const BASE_DATE = new Date(1900, 0, 31)

/** 农历年份显示（干支纪年，如「甲辰龙年」） */
const lunarYear = computed(() => formatLunarYearLine(solarToLunar(now.value)))

/**
 * 农历月日显示（含节气标注）。
 * 格式：农历月日 · 节气（若当日恰为节气）。
 * @returns {string} 农历月日 + 可选节气
 */
const lunarDate = computed(() => {
  const lunar = solarToLunar(now.value)
  const monthDay = formatLunarMonthDayLine(lunar)
  const term = getSolarTerm(now.value)
  const termPart = term ? ` · ${term}` : ''
  return `${monthDay}${termPart}`
})

/**
 * 检测给定日期是否为 24 节气之一，若是则返回对应节气名称。
 * 算法：基于 1900 基准年与节气编码偏移量推算节气公历日期，逐个比对。
 * @param {Date} date - 待检测日期
 * @returns {string|null} 节气名称（如「立春」）或 null
 */
function getSolarTerm(date) {
  const year = date.getFullYear()
  const y = year - BASE_YEAR
  for (let i = 0; i < 24; i++) {
    const termDay = Math.floor((SOLAR_TERM_INFO[i] + y * 365.2422) / 1000) - 62
    const termDate = new Date(BASE_DATE.getTime() + termDay * 86400000)
    if (
      termDate.getFullYear() === date.getFullYear() &&
      termDate.getMonth() === date.getMonth() &&
      termDate.getDate() === date.getDate()
    ) {
      return WEEKDAY_LABELS[i] ?? i
    }
  }
  return null
}
</script>

<style scoped src="./styles/ClockWidget.css"></style>
