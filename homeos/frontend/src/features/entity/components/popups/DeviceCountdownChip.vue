<script setup lang="ts">
/**
 * 设备定时芯片：「15 / 30 / 60 分钟后关闭或开启」+ 剩余时间 + 取消。
 *
 * 剩余时间**以服务端为准**：组件只做本地倒计时插值（每秒减 1），并在每次设置/取消后
 * 重新拉取。浏览器切后台、平板息屏会让本地的 `setInterval` 漂移，若完全靠本地计时，
 * 用户回来会出现「显示还剩 2 分钟，灯其实早灭了」的错觉。挂载时先问一次服务端，
 * 得到的剩余秒数就是唯一基准。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Timer, X } from '@lucide/vue'
import { cancelDeviceTimer, listDeviceTimers, setDeviceTimer } from '@/domain/api/device-timer'
import '@/kernel/ui/styles/hos-icon-btn.css'

const props = defineProps({
  /** 目标实体（如 light.ke_ting） */
  entityId: { type: String, required: true },
  /** 到点执行的服务；默认关闭类。``action="on"`` 时由后端换成对应的开启服务。 */
  service: { type: String, default: 'turn_off' },
})

const PRESETS = [15, 30, 60]

/** 定时方向：关闭 / 开启（同一设备只保留一条定时，见后端 ``_upsert``）。 */
const action = ref<'off' | 'on'>('off')

/** 域 → 开启类服务名（与后端 ``OPENING_SERVICES`` 同语义，只用于展示与入参）。 */
const OPENING_SERVICE: Record<string, string> = {
  light: 'turn_on',
  switch: 'turn_on',
  fan: 'turn_on',
  climate: 'turn_on',
  media_player: 'turn_on',
  humidifier: 'turn_on',
  cover: 'open_cover',
  valve: 'open_valve',
  water_heater: 'turn_on',
}

const resolvedService = computed(() => {
  if (action.value === 'off') return props.service
  const domain = props.entityId.split('.', 1)[0]
  return OPENING_SERVICE[domain] || 'turn_on'
})
const remaining = ref(0)
const busy = ref(false)
const error = ref('')
let tick: ReturnType<typeof setInterval> | null = null

const active = computed(() => remaining.value > 0)
/** 进行中的定时是「开启」还是「关闭」（由服务名反推，用于文案）。 */
const activeService = ref('')
const activeServiceIsOpen = computed(() => /turn_on|open_cover|open_valve|media_play$/.test(activeService.value))
const label = computed(() => {
  const total = Math.max(0, remaining.value)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`
})

async function refresh() {
  try {
    const response = await listDeviceTimers()
    const items = response.data?.items ?? []
    const mine = items.find((item) => item.entityId === props.entityId)
    remaining.value = mine ? Math.max(0, Number(mine.remainingSeconds) || 0) : 0
    activeService.value = mine ? String(mine.service || '') : ''

    error.value = ''
  } catch {
    // 服务不可用（未登录 / 未启用）时静默隐藏：这是增强功能，不该打断弹窗。
    remaining.value = 0
  }
}

async function start(minutes: number) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const response = await setDeviceTimer({
      entityId: props.entityId,
      seconds: minutes * 60,
      service: resolvedService.value,
    })
    remaining.value = Number(response.data?.seconds) || minutes * 60
    activeService.value = String(response.data?.service || '')
  } catch (err) {
    error.value = (err as { message?: string })?.message || '设置倒计时失败'
  } finally {
    busy.value = false
  }
}

async function cancel() {
  if (busy.value) return
  busy.value = true
  try {
    await cancelDeviceTimer(props.entityId)
    remaining.value = 0
    error.value = ''
  } catch (err) {
    error.value = (err as { message?: string })?.message || '取消失败'
  } finally {
    busy.value = false
  }
}

function startTicker() {
  if (tick) return
  tick = setInterval(() => {
    if (remaining.value > 0) remaining.value -= 1
    if (remaining.value === 0 && tick) {
      clearInterval(tick)
      tick = null
    }
  }, 1000)
}

function stopTicker() {
  if (!tick) return
  clearInterval(tick)
  tick = null
}

watch(
  () => remaining.value,
  (value) => {
    if (value > 0) startTicker()
    else stopTicker()
  },
)

onMounted(() => {
  void refresh()
})
onBeforeUnmount(stopTicker)
</script>

<template>
  <div class="device-countdown">
    <div class="device-countdown__head">
      <Timer class="device-countdown__icon" />
      <span class="device-countdown__title">{{ active ? '将在' : '定时' }}</span>
      <span v-if="active" class="device-countdown__remaining">{{ label }}</span>
      <span v-if="active" class="device-countdown__unit">{{ activeServiceIsOpen ? '后开启' : '后关闭' }}</span>
      <button
        v-if="active"
        type="button"
        class="hos-icon-btn device-countdown__cancel"
        :disabled="busy"
        aria-label="取消倒计时"
        @click="cancel"
      >
        <X class="hos-icon-btn__icon" />
      </button>
    </div>
    <div v-if="!active" class="device-countdown__mode" role="group" aria-label="定时动作">
      <button
        type="button"
        class="device-countdown__mode-btn"
        :class="{ 'is-on': action === 'off' }"
        :aria-pressed="action === 'off'"
        @click="action = 'off'"
      >
        关闭
      </button>
      <button
        type="button"
        class="device-countdown__mode-btn"
        :class="{ 'is-on': action === 'on' }"
        :aria-pressed="action === 'on'"
        @click="action = 'on'"
      >
        开启
      </button>
    </div>
    <div v-if="!active" class="device-countdown__presets">
      <button
        v-for="minutes in PRESETS"
        :key="minutes"
        type="button"
        class="device-countdown__preset"
        :disabled="busy"
        @click="start(minutes)"
      >
        {{ minutes }} 分钟
      </button>
    </div>
    <p v-if="error" class="device-countdown__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.device-countdown {
  display: flex;
  flex-direction: column;
  gap: var(--hos-space-xs);
  padding: var(--hos-space-sm) 10px;
  border-radius: var(--hos-radius-control);
  border: var(--hos-hairline) solid var(--hos-border-hairline);
  background: var(--hos-surface-1);
}

.device-countdown__head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  color: var(--hos-text-secondary);
}

.device-countdown__icon {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  color: var(--hos-text-tertiary);
}

.device-countdown__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-countdown__remaining {
  flex: 0 0 auto;
  padding: 1px 8px;
  border-radius: var(--hos-radius-pill);
  background: color-mix(in srgb, var(--hos-color-accent) 16%, transparent);
  border: var(--hos-hairline) solid color-mix(in srgb, var(--hos-color-accent) 40%, transparent);
  color: var(--hos-color-accent);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.device-countdown__unit {
  flex: 0 0 auto;
  color: var(--hos-text-tertiary);
}

.device-countdown__cancel {
  /* 共享按钮已给几何/交互态；这里只把尺寸压到 20px 以适配弹窗内的小行高 */
  --hos-icon-btn-size: 20px;
  margin-left: auto;
}

.device-countdown__mode {
  display: flex;
  gap: 4px;
  padding: 2px;
  border-radius: var(--hos-radius-pill);
  background: var(--hos-surface-1);
  align-self: flex-start;
}

.device-countdown__mode-btn {
  padding: 2px 12px;
  border: none;
  border-radius: var(--hos-radius-pill);
  background: transparent;
  color: var(--hos-text-tertiary);
  font-size: 11px;
  cursor: pointer;
  transition:
    color var(--hos-dur-base) var(--hos-ease-out),
    background var(--hos-dur-base) var(--hos-ease-out);
}

.device-countdown__mode-btn.is-on {
  background: var(--hos-surface-3);
  color: var(--hos-text-primary);
  font-weight: 600;
}

.device-countdown__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.device-countdown__preset {
  flex: 0 0 auto;
  padding: 4px 10px;
  border-radius: var(--hos-radius-pill);
  border: var(--hos-hairline) solid var(--hos-border-hairline);
  background: var(--hos-surface-2);
  color: var(--hos-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition:
    color var(--hos-dur-base) var(--hos-ease-out),
    background var(--hos-dur-base) var(--hos-ease-out),
    border-color var(--hos-dur-base) var(--hos-ease-out);
}

.device-countdown__preset:hover:not(:disabled) {
  border-color: var(--hos-border-strong);
  background: var(--hos-surface-3);
  color: var(--hos-text-primary);
}

.device-countdown__preset:disabled {
  cursor: default;
  opacity: 0.55;
}

.device-countdown__error {
  margin: 0;
  font-size: 11px;
  color: var(--hos-color-danger);
}
</style>
