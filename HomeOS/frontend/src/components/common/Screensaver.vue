/**
 * @file Screensaver.vue
 * @module common/Screensaver
 * @description 全屏屏保 overlay
 *  职责：
 *    - 支持时钟/天气两种模式，响应缩放布局与点击/触摸唤醒；
 *    - 渲染背景、品牌、时钟/天气面板；
 *    - 通过 useScreensaver 统一管理可见性、模式、布局度量与 dismissing。
 *  依赖：composables/ui/useScreensaver，screensaver 子目录下的 Background/Brand/ClockPanel/WeatherPanel。
 */
<template>
  <Teleport to="body">
    <Transition name="ss-overlay">
      <div
        v-if="visible"
        class="ss-overlay"
        :class="[
          'ss-mode--' + mode,
          layoutMetrics.layoutMode === 'scaled' ? 'ss-overlay--scaled' : 'ss-overlay--fluid',
          {
            'ss-overlay--instant': overlayClass.instant,
            'ss-overlay--instant-leave': overlayClass.instantLeave,
          },
        ]"
        :style="[ssStyle, overlayDimStyle]"
        @click="dismiss"
        @touchstart="dismiss"
        @keydown="dismiss"
      >
        <div class="ss-dim" aria-hidden="true" />
        <div
          class="ss-shell"
          :class="{ 'ss-shell--scaled': layoutMetrics.layoutMode === 'scaled' }"
          :style="shellStyle"
        >
          <ScreensaverBackground />

          <div class="ss-shell__content" :style="contentShellStyle">
            <ScreensaverBrand v-if="ssCfg.showBrand" :site-title="siteTitle" />

            <div class="ss-stage">
              <ScreensaverClockPanel
                v-if="mode === 'clock'"
                :ss-cfg="ssCfg"
                :time-hour="timeHour"
                :time-min="timeMin"
                :time-sec="timeSec"
                :date-week="dateWeek"
                :date-m-d="dateMD"
                :date-year="dateYear"
                :lunar-full-line="lunarFullLine"
              />

              <ScreensaverWeatherPanel
                v-else-if="mode === 'weather'"
                :ss-cfg="ssCfg"
                :weather-icon="weatherIcon"
                :weather-temp="weatherTemp"
                :weather-desc="weatherDesc"
                :weather-extra="weatherExtra"
                :date-week="dateWeek"
                :date-m-d="dateMD"
                :time-hour="timeHour"
                :time-min="timeMin"
                :time-sec="timeSec"
                :lunar-month-day-line="lunarMonthDayLine"
              />
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 Screensaver 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { useScreensaver } from '@/composables/ui/useScreensaver'
import ScreensaverBackground from '@/components/common/screensaver/Background.vue'
import ScreensaverBrand from '@/components/common/screensaver/Brand.vue'
import ScreensaverClockPanel from '@/components/common/screensaver/ClockPanel.vue'
import ScreensaverWeatherPanel from '@/components/common/screensaver/WeatherPanel.vue'
import './screensaver/base.css'
import './screensaver/clock.css'
import './screensaver/weather.css'
import './screensaver/responsive.css'
// 屏保后台 idle 样式（html[data-screensaver-idle] 暂停被遮挡层动画），随组件按需加载
import '@/assets/styles/screensaver-idle.css'

const {
  visible,
  mode,
  ssCfg,
  overlayClass,
  overlayDimStyle,
  layoutMetrics,
  ssStyle,
  shellStyle,
  contentShellStyle,
  siteTitle,
  timeHour,
  timeMin,
  timeSec,
  dateWeek,
  dateMD,
  dateYear,
  lunarFullLine,
  lunarMonthDayLine,
  weatherIcon,
  weatherTemp,
  weatherDesc,
  weatherExtra,
  dismiss,
} = useScreensaver()
</script>
