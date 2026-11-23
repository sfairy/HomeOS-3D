<script setup lang="ts">
/**
 * 设备健康：离线设备与可用固件更新。
 *
 * 之所以单独做一个区块：``/system/device-health/summary`` 之前**没有任何前端消费者** ——
 * 后端算出了「离线 N 台 / 有 M 个更新」，界面上却无处可看。固件更新也只做了检测、
 * 没有安装入口，等于半个功能。
 *
 * 安装是**破坏性**动作：只逐个安装（不做批量），点击后二次确认，失败原样展示 HA 的错误。
 */
import { computed, onMounted, ref } from 'vue'
import { AlertTriangle, Cpu, Download, RefreshCw, WifiOff } from '@lucide/vue'
import { getDeviceHealthSummary, installFirmwareUpdate } from '@/services/api/device-health'
import type { DeviceHealthSample } from '@/services/api/device-health'
import '@/assets/styles/hos-icon-btn.css'

interface HealthBucket {
  count: number
  samples: DeviceHealthSample[]
}

const loading = ref(false)
const busyId = ref('')
const error = ref('')
const offline = ref<HealthBucket>({ count: 0, samples: [] })
const firmware = ref<HealthBucket>({ count: 0, samples: [] })

/** 全部正常时不摆两个空表格，只留一行「全部在线」。 */
const allHealthy = computed(
  () => !loading.value && !error.value && offline.value.count === 0 && firmware.value.count === 0,
)

async function refresh() {
  loading.value = true
  try {
    const response = await getDeviceHealthSummary()
    const data = response.data ?? {}
    offline.value = data.offline ?? { count: 0, samples: [] }
    firmware.value = data.firmwareUpdates ?? { count: 0, samples: [] }
    error.value = ''
  } catch (err) {
    error.value = (err as { message?: string })?.message || '读取设备健康失败'
  } finally {
    loading.value = false
  }
}

async function install(entityId: string) {
  if (busyId.value) return
  if (!window.confirm(`确认安装该设备的固件更新？\n${entityId}\n安装过程中设备可能短暂离线。`)) return
  busyId.value = entityId
  error.value = ''
  try {
    await installFirmwareUpdate(entityId)
    await refresh()
  } catch (err) {
    error.value = (err as { message?: string })?.message || '固件更新下发失败'
  } finally {
    busyId.value = ''
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <section class="device-health" aria-label="设备健康">
    <header class="device-health__head">
      <span class="device-health__badge" aria-hidden="true">
        <Cpu class="device-health__badge-icon" />
      </span>
      <div class="device-health__heading">
        <h3 class="device-health__title">设备健康</h3>
        <p class="device-health__sub">离线设备与可用固件更新（安装逐个执行）</p>
      </div>
      <button
        type="button"
        class="hos-icon-btn"
        :disabled="loading"
        aria-label="刷新设备健康"
        title="刷新"
        @click="refresh"
      >
        <RefreshCw class="hos-icon-btn__icon" :class="{ 'is-spinning': loading }" />
      </button>
    </header>

    <p v-if="allHealthy" class="device-health__ok">全部设备在线，没有待安装的更新。</p>

    <div v-else class="device-health__grid">
      <article class="device-health__group" :data-empty="offline.count === 0 ? 'true' : 'false'">
        <header class="device-health__group-head">
          <WifiOff class="device-health__group-icon" aria-hidden="true" />
          <span class="device-health__group-label">离线设备</span>
          <span class="device-health__count">{{ offline.count }}</span>
        </header>
        <ul v-if="offline.samples.length" class="device-health__list">
          <li v-for="item in offline.samples" :key="item.entityId" class="device-health__item">
            <span class="device-health__item-name" :title="item.entityId">{{ item.name }}</span>
            <span v-if="item.domain" class="device-health__item-meta">{{ item.domain }}</span>
          </li>
        </ul>
        <p v-else class="device-health__group-empty">无</p>
      </article>

      <article class="device-health__group" :data-empty="firmware.count === 0 ? 'true' : 'false'">
        <header class="device-health__group-head">
          <AlertTriangle class="device-health__group-icon" aria-hidden="true" />
          <span class="device-health__group-label">固件更新</span>
          <span class="device-health__count">{{ firmware.count }}</span>
        </header>
        <ul v-if="firmware.samples.length" class="device-health__list">
          <li v-for="item in firmware.samples" :key="item.entityId" class="device-health__item">
            <span class="device-health__item-name" :title="item.entityId">{{ item.name }}</span>
            <button
              type="button"
              class="device-health__install"
              :disabled="Boolean(busyId)"
              @click="install(item.entityId)"
            >
              <Download class="device-health__install-icon" aria-hidden="true" />
              {{ busyId === item.entityId ? '下发中…' : '安装' }}
            </button>
          </li>
        </ul>
        <p v-else class="device-health__group-empty">无</p>
      </article>
    </div>

    <p v-if="error" class="device-health__error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.device-health {
  display: flex;
  flex-direction: column;
  gap: var(--hos-space-md);
  margin-bottom: var(--hos-space-lg);
  padding: var(--hos-space-md) var(--hos-space-lg);
  border-radius: var(--hos-radius-card);
  border: var(--hos-hairline) solid var(--hos-border-hairline);
  background: var(--hos-surface-1);
}

/* ── 头部 ── */
.device-health__head {
  display: flex;
  align-items: center;
  gap: var(--hos-space-md);
  min-width: 0;
}

.device-health__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border-radius: var(--hos-radius-control);
  border: var(--hos-hairline) solid var(--hos-border-subtle);
  background: var(--hos-surface-2);
  color: var(--hos-text-secondary);
}

.device-health__badge-icon {
  width: 16px;
  height: 16px;
}

.device-health__heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.device-health__head .hos-icon-btn {
  margin-left: auto;
}

.device-health__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--hos-text-strong);
}

.device-health__sub {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--hos-text-tertiary);
}

.device-health__ok {
  margin: 0;
  font-size: 12px;
  color: var(--hos-color-success);
}

/* ── 两个分组瓦片 ── */
.device-health__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--hos-space-sm);
}

.device-health__group {
  display: flex;
  flex-direction: column;
  gap: var(--hos-space-xs);
  min-width: 0;
  padding: 10px var(--hos-space-md);
  border-radius: var(--hos-radius-control);
  border: var(--hos-hairline) solid var(--hos-border-hairline);
  background: var(--hos-surface-2);
  box-shadow: var(--hos-surface-inset);
}

.device-health__group[data-empty='true'] {
  background: transparent;
  box-shadow: none;
  border-style: dashed;
}

.device-health__group-head {
  display: flex;
  align-items: center;
  gap: var(--hos-space-xs);
  min-width: 0;
}

.device-health__group-icon {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  color: var(--hos-text-tertiary);
}

.device-health__group-label {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--hos-text-label);
}

.device-health__count {
  margin-left: auto;
  font-size: 15px;
  font-weight: 600;
  line-height: 1;
  color: var(--hos-text-strong);
  font-variant-numeric: tabular-nums;
}

/* 有离线设备时计数用警示色；0 台保持中性，避免整面板都在报警 */
.device-health__group[data-empty='false'] .device-health__count {
  color: var(--hos-color-warning);
}

.device-health__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.device-health__item {
  display: flex;
  align-items: center;
  gap: var(--hos-space-sm);
  min-width: 0;
  padding: 4px 0;
  font-size: 12px;
  color: var(--hos-text-body);
}

.device-health__item + .device-health__item {
  border-top: var(--hos-hairline) solid var(--hos-border-hairline);
}

.device-health__item-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-health__item-meta {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--hos-text-tertiary);
}

.device-health__group-empty {
  margin: 0;
  font-size: 11px;
  color: var(--hos-text-tertiary);
}

.device-health__install {
  margin-left: auto;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: var(--hos-radius-pill);
  border: var(--hos-hairline) solid var(--hos-border-subtle);
  background: var(--hos-surface-3);
  color: var(--hos-text-primary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--hos-dur-base) var(--hos-ease-out),
    border-color var(--hos-dur-base) var(--hos-ease-out);
}

.device-health__install:hover:not(:disabled) {
  border-color: var(--hos-border-strong);
  background: var(--hos-surface-panel-hover);
}

.device-health__install:disabled {
  cursor: default;
  opacity: 0.55;
}

.device-health__install-icon {
  width: 11px;
  height: 11px;
}

.device-health__error {
  margin: 0;
  font-size: 11px;
  color: var(--hos-color-danger);
}
</style>
