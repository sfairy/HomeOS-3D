/** - 支持时钟/天气两种模式，响应缩放布局与点击/触摸唤醒； */
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
import { useScreensaver } from '@/composables/ui/screensaver/useScreensaver'
import ScreensaverBackground from '@/components/common/screensaver/Background.vue'
import ScreensaverBrand from '@/components/common/screensaver/Brand.vue'
import ScreensaverClockPanel from '@/components/common/screensaver/ClockPanel.vue'
import ScreensaverWeatherPanel from '@/components/common/screensaver/WeatherPanel.vue'
import './base.css'
import './clock.css'
import './weather.css'
import './responsive.css'
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
