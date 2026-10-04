<!--
组件：AlertRulesEarthquakeSection.vue
所属模块：frontend / src / views / settings / interact / alert-rules
职责：地震预警配置区段。整合主开关（EarthquakeHero）、数据连接状态（EarthquakeConnPanel）、
      家庭坐标录入/HA 同步/城市预设、震级·距离·烈度阈值、S 波倒计时演练与测试触发。
      进入该区段时轮询 Wolfx 状态，离开时停止；未保存时挂起保存条。
关键依赖：
  - AlertRulesEarthquakeHero / AlertRulesEarthquakeConnPanel：主开关与连接状态子组件
  - SettingsCard / SettingsSectionHead / SettingsPendingSaveAction：卡片与保存条
  - HosSelect：阈值/城市预设下拉
  - useLayoutStore：读写 layoutConfig.earthquakeConfig
  - useEarthquakeStatusQuery / schedulePoll：状态拉取与可见性调度轮询
  - syncEarthquakeHomeCoordsFromHa：从 HA 同步家庭坐标
  - triggerEarthquakeTest：测试触发
  - EEW_*_OPTIONS / createDefaultEarthquakeConfig：阈值选项与默认配置
数据来源：useLayoutStore 的 earthquakeConfig；useEarthquakeStatusQuery 的连接状态
-->
<template>
  <div class="settings-hub-section alert-eew-hub">
    <p v-if="earthquakePending > 0" class="settings-note-callout settings-note-callout--amber">
      <span class="settings-note-callout__label">未保存</span>
      <span>{{ earthquakePendingLabel }}，请点击下方「保存地震预警」使配置生效。</span>
    </p>
    <div v-if="earthquakePending > 0" class="alert-hub-save-bar alert-eew-save-bar">
      <SettingsPendingSaveAction
        :pending="earthquakePending"
        :saving="earthquakeSaving"
        :save-text="'保存地震预警'"
        saving-text="保存中…"
        :pending-label="earthquakePendingLabel"
        @save="saveEarthquake"
        @cancel="cancelEarthquakeChanges"
      />
    </div>
    <AlertRulesEarthquakeHero
      :enabled="cfg.enabled"
      :pending="earthquakePending > 0"
      :status-loading="statusLoading"
      :status-connected="statusConnected"
      :status-connecting="statusConnecting"
      :coords-configured="coordsConfigured"
      :enable-tts="cfg.enableTts"
      :wolfx-status-label="wolfxStatusLabel"
      :min-magnitude="cfg.minMagnitude"
      :max-distance="cfg.maxDistance"
      :min-local-intensity="cfg.minLocalIntensity"
      @refresh="refreshStatus"
      @update:enabled="cfg.enabled = $event"
    />

    <AlertRulesEarthquakeConnPanel
      :loading="statusLoading"
      :payload="statusPayload"
      @refresh="refreshStatus"
    />

    <!-- 家庭坐标 -->
    <SettingsCard static extra-class="alert-eew-card">
      <SettingsSectionHead
        icon-key="map-pin"
        icon-class="eew-ic-amber"
        orb-class="eew-orb-amber"
        eyebrow="位置"
        title="家庭地理坐标"
        description="计算震中距与 S 波倒计时；留空则从 Home Assistant 同步。"
        bordered
      />

      <div :class="['alert-eew-coord-status', coordsConfigured && 'alert-eew-coord-status--ok']">
        <component
          :is="coordsConfigured ? MapPinned : MapPinOff"
          class="alert-eew-coord-status__icon"
        />
        <div class="min-w-0 flex-1">
          <span class="alert-eew-coord-status__title">
            {{ coordsConfigured ? '坐标已就绪' : '尚未配置家庭坐标' }}
          </span>
          <span class="alert-eew-coord-status__meta">{{ coordsDisplay }}</span>
        </div>
      </div>

      <div class="alert-eew-coord-fields">
        <label>
          <span class="settings-form-label mb-1.5">纬度</span>
          <input
            v-model="cfg.latitude"
            type="text"
            class="settings-field font-mono"
            placeholder="30.5728"
            inputmode="decimal"
          />
        </label>
        <label>
          <span class="settings-form-label mb-1.5">经度</span>
          <input
            v-model="cfg.longitude"
            type="text"
            class="settings-field font-mono"
            placeholder="104.0668"
            inputmode="decimal"
          />
        </label>
      </div>

      <button type="button" class="alert-eew-sync-btn" :disabled="syncing" @click="syncFromHa">
        <Loader2 v-if="syncing" class="w-4 h-4 animate-spin" />
        <Download v-else class="w-4 h-4" />
        从 HA 同步坐标
      </button>

      <div class="alert-eew-city-block">
        <p class="alert-eew-city-block__label">常用城市</p>
        <div class="alert-eew-city-grid">
          <button
            v-for="city in cityPresets"
            :key="city.name"
            type="button"
            class="alert-eew-city-chip"
            :class="{
              'alert-eew-city-chip--on':
                String(cfg.latitude) === String(city.lat) &&
                String(cfg.longitude) === String(city.lon),
            }"
            @click="selectCity(city)"
          >
            {{ city.name }}
          </button>
        </div>
      </div>
    </SettingsCard>

    <!-- 预警阈值 -->
    <SettingsCard static extra-class="alert-eew-card">
      <SettingsSectionHead
        :icon="SlidersHorizontal"
        icon-class="eew-ic-warn-deep"
        orb-class="eew-orb-warn-deep"
        eyebrow="阈值"
        title="预警触发阈值"
        description="未达阈值的事件会静默过滤，并记录在上方「最近过滤」。"
        bordered
      />

      <div class="alert-eew-threshold-flow">
        <div class="alert-eew-threshold-card alert-eew-threshold-card--mag">
          <div class="alert-eew-threshold-card__head">
            <div class="alert-eew-threshold-card__icon">
              <Activity class="w-4 h-4" />
            </div>
            <div class="min-w-0">
              <span class="alert-eew-threshold-card__label">最低震级</span>
              <span class="alert-eew-threshold-card__value">M{{ cfg.minMagnitude }}</span>
            </div>
          </div>
          <HosSelect variant="settings" block v-model.number="cfg.minMagnitude">
            <option v-for="m in magnitudeOptions" :key="m" :value="m">M{{ m }} 级</option>
          </HosSelect>
          <p class="alert-eew-threshold-card__hint">三项同时满足才记入本地预警</p>
        </div>

        <div class="alert-eew-threshold-card alert-eew-threshold-card--dist">
          <div class="alert-eew-threshold-card__head">
            <div class="alert-eew-threshold-card__icon">
              <MapPin class="w-4 h-4" />
            </div>
            <div class="min-w-0">
              <span class="alert-eew-threshold-card__label">最大距离</span>
              <span class="alert-eew-threshold-card__value">{{ cfg.maxDistance }} km</span>
            </div>
          </div>
          <HosSelect variant="settings" block v-model.number="cfg.maxDistance">
            <option v-for="d in distanceOptions" :key="d" :value="d">{{ d }} km</option>
          </HosSelect>
          <p class="alert-eew-threshold-card__hint">三项同时满足才记入本地预警</p>
        </div>

        <div class="alert-eew-threshold-card alert-eew-threshold-card--int">
          <div class="alert-eew-threshold-card__head">
            <div class="alert-eew-threshold-card__icon">
              <Gauge class="w-4 h-4" />
            </div>
            <div class="min-w-0">
              <span class="alert-eew-threshold-card__label">最低烈度</span>
              <span class="alert-eew-threshold-card__value">{{ cfg.minLocalIntensity }} 度</span>
            </div>
          </div>
          <HosSelect variant="settings" block v-model.number="cfg.minLocalIntensity">
            <option v-for="i in intensityOptions" :key="i" :value="i">
              {{ i === 1 ? '1 度（几乎不限制）' : `${i} 度` }}
            </option>
          </HosSelect>
          <p class="alert-eew-threshold-card__hint">本地预估烈度；默认 2 度会显著收紧有效距离</p>
        </div>
      </div>
      <p class="alert-eew-threshold-footnote">
        震级、距离、烈度须同时满足：EEW 与台网「新震情」共用此规则，达标后会出现在本地预警。烈度参考：III
        少数有感 · V 室外多数有感。
      </p>
    </SettingsCard>

    <!-- TTS -->
    <SettingsCard static extra-class="alert-eew-card">
      <SettingsSectionHead
        :icon="Volume2"
        icon-class="eew-ic-rose"
        orb-class="eew-orb-rose"
        eyebrow="语音播报"
        title="浏览器语音播报"
        description="预警时用 Web Speech API 朗读；后端音箱走全局语音设置。"
        bordered
      />
      <div class="alert-eew-tts-row mt-4">
        <div class="min-w-0">
          <p class="alert-eew-tts-row__title">启用浏览器 TTS</p>
          <p class="alert-eew-tts-row__desc">朗读震级、倒计时与避险提示（仅本机大屏浏览器）。</p>
        </div>
        <label class="alert-eew-toggle shrink-0" title="启用浏览器 TTS">
          <input v-model="cfg.enableTts" type="checkbox" />
          <span
            class="alert-eew-toggle__track"
            :class="{ 'alert-eew-toggle__track--on': cfg.enableTts }"
          >
            <span class="alert-eew-toggle__thumb" />
          </span>
        </label>
      </div>
    </SettingsCard>

    <!-- 模拟演练 -->
    <SettingsCard static extra-class="alert-eew-card alert-eew-drill-shell">
      <SettingsSectionHead
        :icon="Zap"
        icon-class="eew-ic-danger"
        orb-class="eew-orb-danger"
        eyebrow="演练"
        title="模拟演练"
        description="验证全屏劫持、滑动解锁与 TTS，不影响真实预警。"
        bordered
      />

      <div class="alert-eew-drill mt-4">
        <div class="alert-eew-drill__body">
          <div
            class="alert-eew-drill__preview"
            :class="{
              'is-arming': testing,
              'is-arrived': !testing && cfg.countdownLeadSec === 0,
            }"
          >
            <div class="alert-eew-drill__preview-top">
              <span class="alert-eew-drill__sim">模拟</span>
              <span class="alert-eew-drill__preview-eyebrow">
                {{ testing ? '即将弹出' : '全屏预览' }}
              </span>
            </div>
            <p
              class="alert-eew-drill__preview-num"
              :class="{ 'is-arrived': !testing && cfg.countdownLeadSec === 0 }"
            >
              <template v-if="testing && armingSec > 0">{{ armingSec }}</template>
              <template v-else-if="cfg.countdownLeadSec === 0">已到达</template>
              <template v-else
                >{{ cfg.countdownLeadSec }}<span>s</span></template
              >
            </p>
            <div class="alert-eew-drill__preview-foot">
              <span>模拟 · M5.0</span>
              <span>{{
                testing
                  ? '启动中'
                  : cfg.countdownLeadSec === 0
                    ? '横波模式'
                    : `${cfg.countdownLeadSec}s 形态`
              }}</span>
            </div>
          </div>

          <div class="alert-eew-drill__main">
            <div>
              <p class="alert-eew-drill__label">倒计时形态</p>
              <div class="alert-eew-drill__seg" role="radiogroup" aria-label="演练倒计时形态">
                <button
                  v-for="sec in countdownLeadOptions"
                  :key="sec"
                  type="button"
                  role="radio"
                  class="alert-eew-drill__seg-btn"
                  :class="{ 'is-on': cfg.countdownLeadSec === sec }"
                  :aria-checked="cfg.countdownLeadSec === sec"
                  :aria-label="countdownLeadLabel(sec)"
                  :disabled="testing"
                  @click="cfg.countdownLeadSec = sec"
                >
                  <span class="alert-eew-drill__seg-primary">{{ drillSegPrimary(sec) }}</span>
                  <span class="alert-eew-drill__seg-sub">{{ drillSegSub(sec) }}</span>
                </button>
              </div>
            </div>

            <ul class="alert-eew-drill__checks" aria-label="演练将验证">
              <li>全屏劫持</li>
              <li>滑动解锁</li>
              <li>{{ cfg.enableTts ? '浏览器 TTS' : 'TTS 已关' }}</li>
            </ul>

            <div class="alert-eew-drill__foot">
              <p class="alert-eew-drill__hint">
                确认后约 3 秒弹出全屏；仅影响模拟，真实预警按推送倒计时。
              </p>
              <button
                type="button"
                class="alert-eew-drill-btn"
                :disabled="testing"
                @click="runTest"
              >
                <Loader2 v-if="testing" class="w-4 h-4 animate-spin" />
                <Zap v-else class="w-4 h-4" />
                {{ testing ? `${armingSec || '…'}s` : '开始演练' }}
              </button>
            </div>
            <p
              v-if="testTip"
              :class="['alert-eew-drill__tip', testOk ? 'is-ok' : 'is-err']"
              aria-live="polite"
            >
              {{ testTip }}
            </p>
          </div>
        </div>
      </div>

      <div class="alert-eew-wizard-row">
        <div class="min-w-0">
          <p class="alert-eew-wizard-row__title">配置向导</p>
          <p class="alert-eew-wizard-row__desc">分步配置 HA 连接、家庭坐标与启用状态</p>
        </div>
        <button type="button" class="settings-btn-ghost text-xs shrink-0" @click="openWizard">
          <Wand2 class="w-3.5 h-3.5" />
          重新运行向导
        </button>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup>
import HosSelect from '@/components/common/base/HosSelect.vue'
import { computed, ref, onUnmounted, watch } from 'vue'
import {
  Activity,
  Download,
  Gauge,
  Loader2,
  MapPin,
  MapPinOff,
  MapPinned,
  SlidersHorizontal,
  Volume2,
  Wand2,
  Zap,
} from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsSectionHead from '@/views/settings/shared/layout/SettingsSectionHead.vue'
import AlertRulesEarthquakeHero from './AlertRulesEarthquakeHero.vue'
import AlertRulesEarthquakeConnPanel from './AlertRulesEarthquakeConnPanel.vue'
import SettingsPendingSaveAction from '@/views/settings/shared/SettingsPendingSaveAction.vue'
import { useAlertRulesSection } from './context'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { triggerEarthquakeTest } from '@/services/api/earthquake'
import { useEarthquakeStatusQuery } from '@/composables/earthquake/useEarthquakeStatusQuery'
import { reopenEarthquakeWizard } from '@/composables/earthquake/useEarthquakeBootstrap'
import { syncEarthquakeHomeCoordsFromHa } from '@/utils/earthquake/ha-coords.util'
import { schedulePoll } from '@/utils/core/poll-scheduler'
import {
  EEW_CITY_PRESETS,
  EEW_DISTANCE_OPTIONS,
  EEW_INTENSITY_OPTIONS,
  EEW_MAGNITUDE_OPTIONS,
  EEW_COUNTDOWN_LEAD_OPTIONS,
  eewCountdownLeadLabel,
  createDefaultEarthquakeConfig,
} from '@/types/earthquake'

const layoutStore = useLayoutStore()
const chrome = useChromeStore()
const {
  earthquakePending,
  earthquakePendingLabel,
  earthquakeSaving,
  saveEarthquake,
  cancelEarthquakeChanges,
  alertSection,
} = useAlertRulesSection([
  'earthquakePending',
  'earthquakePendingLabel',
  'earthquakeSaving',
  'saveEarthquake',
  'cancelEarthquakeChanges',
  'alertSection',
])

if (!layoutStore.layoutConfig.earthquakeConfig) {
  layoutStore.layoutConfig.earthquakeConfig = createDefaultEarthquakeConfig()
}

const cfg = computed({
  get: () => layoutStore.layoutConfig.earthquakeConfig,
  set: (v) => {
    layoutStore.layoutConfig.earthquakeConfig = v
  },
})

const magnitudeOptions = EEW_MAGNITUDE_OPTIONS
const distanceOptions = EEW_DISTANCE_OPTIONS
const intensityOptions = EEW_INTENSITY_OPTIONS
const countdownLeadOptions = EEW_COUNTDOWN_LEAD_OPTIONS
const countdownLeadLabel = eewCountdownLeadLabel
const cityPresets = EEW_CITY_PRESETS

function drillSegPrimary(sec) {
  return sec === 0 ? '已到达' : `${sec}s`
}

function drillSegSub(sec) {
  return sec === 0 ? '横波' : '倒计时'
}

const syncing = ref(false)
const testing = ref(false)
const armingSec = ref(0)
const testTip = ref('')
const testOk = ref(true)
let armingTimer = null
const {
  loading: statusLoading,
  data: statusPayload,
  execute: refreshStatus,
  connected: statusConnected,
  connecting: statusConnecting,
} = useEarthquakeStatusQuery({ immediate: false })
let statusPollCancel = null
let statusRetryTimers = []

const coordsConfigured = computed(() =>
  Boolean(String(cfg.value?.latitude || '').trim() && String(cfg.value?.longitude || '').trim()),
)

const coordsDisplay = computed(() => {
  if (!coordsConfigured.value) return '留空则自动从 Home Assistant 同步'
  return `${cfg.value.latitude}, ${cfg.value.longitude}`
})

const wolfxStatusLabel = computed(() => {
  if (statusConnected.value) return '在线'
  if (statusConnecting.value) return '连接中'
  return '离线'
})

// 进入地震区段时按递增延迟（3s/8s/15s）安排多次状态重试，提升 Wolfx 首次连接成功率
function scheduleStatusRetries() {
  const delays = [3000, 8000, 15000]
  for (const delay of delays) {
    const t = setTimeout(() => {
      if (alertSection.value === 'earthquake') void refreshStatus()
    }, delay)
    statusRetryTimers.push(t)
  }
}

function startStatusPolling() {
  stopStatusPolling()
  // 经全局调度器轮询：页面隐藏时自动暂停，恢复可见时立即刷新
  statusPollCancel = schedulePoll(
    'alert-rules:earthquake-status',
    () => {
      if (alertSection.value === 'earthquake') void refreshStatus()
    },
    30_000,
  )
}

function stopStatusPolling() {
  if (statusPollCancel) {
    statusPollCancel()
    statusPollCancel = null
  }
  for (const t of statusRetryTimers) clearTimeout(t)
  statusRetryTimers = []
}

watch(
  alertSection,
  (sec) => {
    if (sec === 'earthquake') {
      void refreshStatus()
      scheduleStatusRetries()
      startStatusPolling()
    } else {
      stopStatusPolling()
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  stopStatusPolling()
  clearArmingTimer()
})

function selectCity(city) {
  cfg.value.latitude = String(city.lat)
  cfg.value.longitude = String(city.lon)
}

function openWizard() {
  reopenEarthquakeWizard()
  window.dispatchEvent(new CustomEvent('homeos:eew-wizard-open'))
}

async function syncFromHa() {
  syncing.value = true
  try {
    await syncEarthquakeHomeCoordsFromHa((lat, lon) => {
      cfg.value.latitude = lat
      cfg.value.longitude = lon
    })
  } catch {
    chrome.notify('同步失败', 'error')
  } finally {
    syncing.value = false
  }
}

function clearArmingTimer() {
  if (armingTimer) {
    clearInterval(armingTimer)
    armingTimer = null
  }
  armingSec.value = 0
}

async function runTest() {
  const ok = await chrome.confirm(
    '确认后约 3 秒触发模拟预警，全屏界面应马上弹出并播放 TTS。确定继续？',
    '模拟演练确认',
    { confirmText: '开始演练', type: 'danger' },
  )
  if (!ok) return
  testing.value = true
  testOk.value = true
  armingSec.value = 3
  testTip.value = '演练倒计时中…'
  clearArmingTimer()
  armingTimer = setInterval(() => {
    armingSec.value = Math.max(0, armingSec.value - 1)
    if (armingSec.value <= 0) clearArmingTimer()
  }, 1000)
  try {
    await triggerEarthquakeTest()
    testOk.value = true
    testTip.value = '演练已触发，全屏预警应已弹出'
  } catch {
    testOk.value = false
    testTip.value = '演练请求失败，请检查后端服务'
  } finally {
    clearArmingTimer()
    testing.value = false
  }
}
</script>

<style src="./styles/AlertRulesEarthquakeSection.css"></style>
