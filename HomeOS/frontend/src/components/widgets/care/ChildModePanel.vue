<!--
  ChildModePanel.vue / components/widgets/care
  儿童模式面板：关爱中心下的独立配置卡片，负责开关启用态、每日媒体时长
  限制、设备白名单增删以及按工作日/周末/每天维度配置多段允许使用时段。
  Props: embedded 是否嵌入 Hub（隐藏标题头）/ dense 紧凑布局开关
         / poll-interval-ms 轮询刷新间隔
  依赖：Pinia — useChromeStore 全局弹窗上下文；
        services/api/system 儿童模式读写接口；
        EntityInput 实体选择输入（白名单设备）；ApiQueryState 加载态包装。
  注意：白名单 + 时段双条件生效时拦截非白名单设备；override 按钮用于家长临时解禁。
-->
<template>
  <div
    class="cm2-root"
    :class="{
      'cm2-root--dense': dense,
      'cm2-root--embedded': embedded,
      'cm2-root--disabled': !cfg.enabled,
    }"
  >
    <div v-if="embedded" class="cm2-embed-bar">
      <div class="cm2-embed-bar__main">
        <Baby :class="['cm2-header-icon', cfg.enabled ? 'cm2-icon-active' : 'cm2-icon-muted']" />
        <div class="cm2-header-text">
          <span class="cm2-title">{{ '儿童模式' }}</span>
          <em class="cm2-status" :class="statusClass">{{ statusLabel }}</em>
        </div>
      </div>
      <button
        type="button"
        :class="['cm2-switch', cfg.enabled ? 'cm2-switch--on' : '']"
        :disabled="busy"
        :aria-label="cfg.enabled ? '关闭儿童模式' : '启用儿童模式'"
        @click="toggleEnabled"
      >
        <span class="cm2-knob" />
      </button>
    </div>

    <div v-else class="cm2-header" :class="{ 'cm2-header--dense': dense }">
      <div class="cm2-header-left">
        <Baby :class="['cm2-header-icon', cfg.enabled ? 'cm2-icon-active' : 'cm2-icon-muted']" />
        <div class="cm2-header-text">
          <span class="cm2-title">{{ '儿童模式' }}</span>
          <em class="cm2-status" :class="statusClass">{{ statusLabel }}</em>
        </div>
      </div>
      <button
        type="button"
        :class="['cm2-switch', cfg.enabled ? 'cm2-switch--on' : '']"
        :disabled="busy"
        :aria-label="cfg.enabled ? '关闭儿童模式' : '启用儿童模式'"
        @click="toggleEnabled"
      >
        <span class="cm2-knob" />
      </button>
    </div>

    <div class="cm2-body">
      <ApiQueryState
        :loading="loading"
        :error="loadError"
        error-title="儿童模式加载失败"
        @retry="fetchCfg"
      >
        <template>
          <p v-if="embedded && !cfg.enabled" class="cm2-idle-tip">
            {{ '开启开关后即可编辑白名单设备、允许使用时段与媒体限时；下方为当前预设预览' }}
          </p>

          <div v-if="cfg.enabled && whitelistActive" class="cm2-window-now">
            <Moon class="cm2-window-icon" />
            {{ cfg.inAllowedWindow ? '当前处于允许时段' : '当前不在允许时段' }}
          </div>

          <div class="cm2-form" :class="{ 'cm2-form--idle': !cfg.enabled }">
          <div class="cm2-grid">
            <label class="cm2-field">
              <span>{{ '媒体限时' }}</span>
              <div class="cm2-media">
                <input
                  v-model.number="cfg.dailyMediaLimitMin"
                  type="number"
                  min="0"
                  class="cm2-num"
                  @change="markDirty"
                />
                <span class="cm2-hour-unit">{{ '分/日' }}</span>
              </div>
            </label>
          </div>

          <div v-if="cfg.enabled && (cfg.mediaUsedMin ?? 0) > 0" class="cm2-usage-row">
            <span>{{ '今日已用' }}</span>
            <strong>{{ `${cfg.mediaUsedMin ?? 0} 分` }}</strong>
            <div v-if="mediaPct != null" class="cm2-usage-track">
              <i :class="mediaPct >= 90 && 'is-warn'" :style="{ width: `${mediaPct}%` }" />
            </div>
          </div>

          <!-- 白名单 + 时间窗模式：设备白名单（非空时启用） -->
          <div class="cm2-field cm2-field--col">
            <span>{{ `白名单设备 · ${(cfg.deviceWhitelist || []).length}` }}</span>
            <p class="cm2-wl-hint">
              {{ '添加设备后启用「白名单 + 时段」模式：仅白名单设备可在下方时段内使用' }}
            </p>
            <div class="cm2-restricted">
              <span v-for="e in cfg.deviceWhitelist || []" :key="e" class="cm2-chip cm2-chip--wl">
                {{ shortName(e) }}
                <X class="cm2-chip-x" @click="removeWhitelistEntity(e)" />
              </span>
              <span v-if="!(cfg.deviceWhitelist || []).length" class="cm2-restricted-empty">
                {{ '未添加' }}
              </span>
            </div>
            <EntityInput
              :model-value="whitelistPick"
              placeholder="选择或输入白名单设备"
              input-class="cm2-wl-input"
              wrapper-class="cm2-wl-wrap"
              @update:model-value="onWhitelistPick"
            />
          </div>

          <!-- 允许使用时段：每天 / 工作日 / 周末，支持跨午夜 -->
          <div class="cm2-field cm2-field--col">
            <span>{{ `允许使用时段 · ${(cfg.timeWindows || []).length}` }}</span>
            <p class="cm2-wl-hint">
              {{ '白名单设备仅在这些时段内可用；未配置时段时白名单设备将被拦截' }}
            </p>
            <div v-if="!(cfg.timeWindows || []).length" class="cm2-restricted-empty">
              {{ '未配置时段' }}
            </div>
            <div v-for="(w, i) in cfg.timeWindows || []" :key="i" class="cm2-window">
              <select v-model="w.days" class="cm2-window__days" @change="markDirty">
                <option value="weekday">{{ '工作日' }}</option>
                <option value="weekend">{{ '周末' }}</option>
                <option value="daily">{{ '每天' }}</option>
              </select>
              <input
                v-model="w.start"
                type="time"
                class="cm2-window__time"
                @change="markDirty"
              />
              <span class="cm2-window__sep">—</span>
              <input v-model="w.end" type="time" class="cm2-window__time" @change="markDirty" />
              <button
                type="button"
                class="cm2-window__del"
                :aria-label="'删除时段'"
                @click="removeWindow(i)"
              >
                <X class="cm2-chip-x" />
              </button>
            </div>
            <button type="button" class="cm2-window-add" @click="addWindow">
              {{ '+ 添加时段' }}
            </button>
          </div>

          <div v-if="cfg.overrideActive" class="cm2-override">
            {{ `家长 override 至 ${formatOverrideUntil(cfg.overrideUntil)}` }}
          </div>
          <div class="cm2-actions">
            <button
              v-if="cfg.enabled && canOverride"
              type="button"
              class="cm2-override-btn"
              :disabled="busy"
              @click="requestOverride"
            >
              {{ CHILD_MODE_OVERRIDE_ACTION }}
            </button>
            <button v-if="dirty" type="button" class="cm2-save" :disabled="busy" @click="save">
              {{ '保存' }}
            </button>
          </div>
          </div>
        </template>
      </ApiQueryState>
    </div>
  </div>
</template>

<script setup>
/**
 * @file ChildModePanel.vue
 * @module widgets/care
 * @description 儿童模式面板：展示与编辑儿童模式状态、每日媒体时长限制、设备白名单与时间窗。
 *              白名单模式：deviceWhitelist 非空时启用「白名单 + 时间窗」。
 * API: GET /system/child-mode
 *      PUT /system/child-mode { enabled, dailyMediaLimitMin, deviceWhitelist, timeWindows }
 * @dependencies
 *  - vue: ref/reactive/computed/onMounted/onUnmounted/watch 响应式与生命周期
 *  - @lucide/vue: Baby / Moon / X 图标
 *  - @/components/common/EntityInput.vue: 实体输入
 *  - @/components/common/ApiQueryState.vue: 查询状态容器
 *  - @/composables/widget/useScheduledPoll: 定时轮询
 *  - @/services/api/system: 儿童模式接口
 *  - @/utils/format/locale-format.util: 本地时间格式化
 *  - @/stores/entities.store: 实体状态
 *  - @/stores/chrome.store: 全局通知
 *  - @/stores/auth.store: 鉴权状态
 *  - @/utils/core/error-message: 错误信息提取
 *  - @/utils/care/child-mode-copy: 儿童模式覆盖文案常量
 */
import EntityInput from '@/components/common/EntityInput.vue'
import { getApiErrorMessage } from '@/utils/core/error-message'
import {
  CHILD_MODE_OVERRIDE_ACTION,
  CHILD_MODE_OVERRIDE_STATUS,
  CHILD_MODE_OVERRIDE_TOAST,
} from '@/utils/care/child-mode-copy'
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useScheduledPoll } from '@/composables/widget/useScheduledPoll'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { Baby, Moon, X } from '@lucide/vue'

import { fetchChildMode, overrideChildMode, updateChildMode } from '@/services/api/system'
import { formatLocaleTime } from '@/utils/format/locale-format.util'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useAuthStore } from '@/stores/auth.store'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

const props = defineProps({
  embedded: { type: Boolean, default: false },
  /** 紧凑卡片：用于关爱主舞台底部，避免整页只剩一个开关 */
  dense: { type: Boolean, default: false },
  /** 轮询间隔（嵌入同屏时可拉长，减轻双面板负载） */
  pollIntervalMs: { type: Number, default: 60_000 },
})

const es = useEntitiesStore()
const chrome = useChromeStore()
const auth = useAuthStore()
const canOverride = computed(() => ['admin', 'adult'].includes(auth.role))
const loading = ref(true)
const loadError = ref('')
const busy = ref(false)
const dirty = ref(false)
/** 白名单设备输入（EntityInput 双向绑定） */
const whitelistPick = ref('')
const emit = defineEmits(['update:dirty'])

watch(dirty, (v) => emit('update:dirty', v), { immediate: true })

const cfg = reactive({
  enabled: false,
  dailyMediaLimitMin: 0,
  deviceWhitelist: [],
  timeWindows: [],
  inAllowedWindow: false,
  mediaUsedMin: 0,
  overrideActive: false,
  overrideUntil: null,
})

/** 白名单模式是否启用（白名单非空） */
const whitelistActive = computed(() => (cfg.deviceWhitelist || []).length > 0)

const statusLabel = computed(() => {
  if (!cfg.enabled) return '未启用'
  if (cfg.overrideActive) return CHILD_MODE_OVERRIDE_STATUS
  if (whitelistActive.value) return cfg.inAllowedWindow ? '允许时段中' : '非允许时段'
  return '已启用'
})

const statusClass = computed(() => {
  if (!cfg.enabled) return 'is-off'
  if (cfg.overrideActive) return 'is-warn'
  if (whitelistActive.value && !cfg.inAllowedWindow) return 'is-warn'
  return 'is-on'
})

const mediaPct = computed(() => {
  const limit = Number(cfg.dailyMediaLimitMin) || 0
  if (limit <= 0) return null
  return Math.max(0, Math.min(100, Math.round(((cfg.mediaUsedMin ?? 0) / limit) * 100)))
})

function formatOverrideUntil(iso) {
  if (!iso) return '—'
  try {
    return formatLocaleTime(iso, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

async function requestOverride() {
  busy.value = true
  try {
    const { data } = await overrideChildMode(30)
    if (data) Object.assign(cfg, data)
    chrome.notify(CHILD_MODE_OVERRIDE_TOAST, 'success')
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '需要家长权限'), 'error')
  } finally {
    busy.value = false
  }
}

function shortName(e) {
  const ent = es.entities[e]
  return getEntityDisplayName(e, ent)
}
function markDirty() {
  dirty.value = true
}

// ── 白名单 + 时间窗 ──

/** 将后端 days 转为 UI 维度（'weekday' / 'weekend' / 'daily'） */
function toUiDays(d) {
  if (d === 'weekday' || d === 'weekend') return d
  if (Array.isArray(d) && d.length === 7) return 'daily'
  return 'weekday'
}

/** 将 UI 维度转为后端 days（'daily' 展开为 0-6 数组） */
function toApiDays(d) {
  if (d === 'daily') return [0, 1, 2, 3, 4, 5, 6]
  return d
}

function onWhitelistPick(v) {
  const val = String(v || '')
  whitelistPick.value = ''
  if (!val || cfg.deviceWhitelist.includes(val)) return
  cfg.deviceWhitelist.push(val)
  dirty.value = true
}

function removeWhitelistEntity(e) {
  cfg.deviceWhitelist = cfg.deviceWhitelist.filter((x) => x !== e)
  dirty.value = true
}

function addWindow() {
  cfg.timeWindows.push({ days: 'weekday', start: '19:00', end: '21:00' })
  dirty.value = true
}

function removeWindow(i) {
  cfg.timeWindows.splice(i, 1)
  dirty.value = true
}

async function fetchCfg() {
  loadError.value = ''
  try {
    const { data } = await fetchChildMode()
    if (data) {
      Object.assign(cfg, data)
      cfg.deviceWhitelist = Array.isArray(data.deviceWhitelist) ? [...data.deviceWhitelist] : []
      cfg.timeWindows = (Array.isArray(data.timeWindows) ? data.timeWindows : []).map((w) => ({
        days: toUiDays(w.days),
        start: w.start || '19:00',
        end: w.end || '21:00',
      }))
    }
  } catch {
    loadError.value = '请检查网络连接后重试'
    chrome.notify('加载失败', 'error')
  } finally {
    loading.value = false
  }
}

async function persist() {
  busy.value = true
  try {
    const { data } = await updateChildMode({
      enabled: cfg.enabled,
      dailyMediaLimitMin: cfg.dailyMediaLimitMin,
      deviceWhitelist: cfg.deviceWhitelist,
      timeWindows: (cfg.timeWindows || []).map((w) => ({
        days: toApiDays(w.days),
        start: w.start,
        end: w.end,
      })),
    })
    if (data) {
      Object.assign(cfg, data)
      cfg.deviceWhitelist = Array.isArray(data.deviceWhitelist) ? [...data.deviceWhitelist] : []
      cfg.timeWindows = (Array.isArray(data.timeWindows) ? data.timeWindows : []).map((w) => ({
        days: toUiDays(w.days),
        start: w.start || '19:00',
        end: w.end || '21:00',
      }))
    }
    dirty.value = false
    return true
  } catch (e) {
    chrome.notify(e?.response?.status === 403 ? '需要管理员权限' : '保存失败', 'error')
    return false
  } finally {
    busy.value = false
  }
}

async function toggleEnabled() {
  const prev = cfg.enabled
  cfg.enabled = !cfg.enabled
  const ok = await persist()
  if (ok) {
    chrome.notify(cfg.enabled ? '儿童模式已启用' : '儿童模式已停用', 'success')
  } else {
    cfg.enabled = prev
  }
}

async function save() {
  const ok = await persist()
  if (ok) chrome.notify('设置已保存', 'success')
}

let offChildModeWs = null

onMounted(() => {
  fetchCfg()
  offChildModeWs = es.onChildModeEvent(() => {
    fetchCfg()
  })
})
useScheduledPoll(fetchCfg, () => Number(props.pollIntervalMs) || 60_000, {
  key: 'widget:ChildModePanel',
})
onUnmounted(() => {
  if (offChildModeWs) offChildModeWs()
})
</script>

<style scoped src="./styles/ChildModePanel.css"></style>
