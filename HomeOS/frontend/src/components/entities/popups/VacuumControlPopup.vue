/**
 * @file VacuumControlPopup.vue
 * @module components/entities/popups
 * @brief 扫地机器人控制弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染 vacuum 域控制面板
 * - 提供启动/暂停/停止/回充与房间清扫选择
 * - 渲染清扫地图（HaCameraStream + 坐标标定），展示已清扫房间
 *
 * 依赖：
 * - vue（computed/ref/watch）、@lucide/vue（Play/Pause/Home/Volume2/Square/Bot/Target）
 * - ./EntityPopupShell、./PopupHead、HaCameraStream
 * - @/composables/entity/useEntityPopupBase、vacuum 工具函数（地图坐标解析/标定）
 * - @/stores/chrome.store、layout.store、entities.store
 */
<template>
  <!-- VacuumControlPopup 扫地机器人控制弹窗：控制扫地机器人 -->
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="popupWidth"
    :height="popupHeight"
    accent="#c084fc"
    accent-rgb="192, 132, 252"
    @close="$emit('close')"
  >
    <PopupHead :title="entityName" :icon="Bot">
      <template #status>
        <span :class="isActive ? 'vcp-state-on' : 'vcp-state-off'">{{ stateLabel }}</span>
        <span
          v-if="isCleaning"
          class="popup-status-dot popup-status-dot--pulse vcp-state-dot vcp-state-dot--on"
        />
      </template>
    </PopupHead>

    <div v-if="mapMeta.twoFactorUrl" class="vcp-2fa">
      <p class="vcp-2fa__title">{{ '需要小米账号二次验证' }}</p>
      <a class="vcp-2fa__link" :href="mapMeta.twoFactorUrl" target="_blank" rel="noopener">{{
        '打开验证链接'
      }}</a>
    </div>

    <div class="vcp-map-wrap" v-if="mapCameraId">
      <div class="vcp-map-toolbar">
        <button
          type="button"
          :class="['vcp-map-mode', mapMode === 'view' && 'vcp-map-mode--on']"
          @click.stop="setMapMode('view')"
        >
          {{ '浏览' }}
        </button>
        <button
          type="button"
          :class="['vcp-map-mode', mapMode === 'rooms' && 'vcp-map-mode--on']"
          :disabled="!rooms.length"
          @click.stop="setMapMode('rooms')"
        >
          {{ '选房间' }}
        </button>
        <button
          type="button"
          :class="['vcp-map-mode', mapMode === 'goto' && 'vcp-map-mode--on']"
          :disabled="!hasCalibration"
          @click.stop="setMapMode('goto')"
        >
          {{ '指哪去' }}
        </button>
        <button
          type="button"
          :class="['vcp-map-mode', mapMode === 'zone' && 'vcp-map-mode--on']"
          :disabled="!hasCalibration"
          @click.stop="setMapMode('zone')"
        >
          {{ '划区' }}
        </button>
      </div>
      <div
        class="vcp-map-stage"
        :class="{
          'vcp-map-stage--goto': mapMode === 'goto',
          'vcp-map-stage--zone': mapMode === 'zone',
        }"
        @click.stop="onMapClick"
      >
        <HaCameraStream
          v-if="mapEntity && haUrl"
          :entity="mapEntity"
          :ha-url="haUrl"
          :active="true"
          object-fit="contain"
          :prefer-webrtc="false"
          :prefer-hls="false"
          :snapshot-interval-ms="snapshotMs"
        />
        <div v-else class="vcp-map-empty">{{ '地图加载中…' }}</div>
        <div
          v-if="zoneOverlay"
          class="vcp-zone-box"
          :style="{
            left: zoneOverlay.left + '%',
            top: zoneOverlay.top + '%',
            width: zoneOverlay.width + '%',
            height: zoneOverlay.height + '%',
          }"
        />
        <div v-if="mapMode === 'goto'" class="vcp-map-hint">{{ '点击地图前往该点' }}</div>
        <div v-else-if="mapMode === 'zone'" class="vcp-map-hint">
          {{ zoneCorner ? '再点对角完成划区' : '点击两点框选清扫区域' }}
        </div>
      </div>
      <div class="vcp-map-meta" v-if="mapMetaLine">
        <span>{{ mapMetaLine }}</span>
      </div>
      <p v-if="mapMeta.isEmpty" class="vcp-map-warn">{{ '地图数据为空，请确认扫地机已建图' }}</p>
    </div>
    <div v-else class="vcp-map-guide">
      <p class="vcp-map-guide__title">{{ '未绑定地图' }}</p>
      <p class="vcp-map-guide__desc">
        {{
          '请在 HA 安装 Xiaomi Cloud Map Extractor，并在「设置 → 集成绑定 → 扫地机地图」绑定 camera。'
        }}
      </p>
    </div>

    <div class="vcp-stats mb-3">
      <div v-if="batteryLevel != null" class="vcp-stat">
        <span :class="batteryLevel > 20 ? 'vcp-c-violet' : 'vcp-c-danger'"
          >🔋 {{ batteryLevel }}%</span
        >
      </div>
      <div v-if="currentRoomName" class="vcp-stat">
        <span class="vcp-c-violet">📍 {{ currentRoomName }}</span>
      </div>
      <div v-if="cleanedAreaText" class="vcp-stat">
        <span>{{ cleanedAreaText }}</span>
      </div>
      <div v-if="cleaningTimeText" class="vcp-stat">
        <span>{{ cleaningTimeText }}</span>
      </div>
    </div>

    <div class="vcp-actions mb-3">
      <button
        :class="['mode-card', isCleaning ? 'mode-card--active' : '']"
        @click.stop="callVacuum('start')"
      >
        <Play class="w-5 h-5 mb-1 vcp-ic-violet" />
        <span class="text-xs font-bold tracking-wider">{{ '开始' }}</span>
      </button>
      <button class="mode-card" @click.stop="callVacuum('pause')">
        <Pause class="w-5 h-5 mb-1 vcp-ic-warn" />
        <span class="text-xs font-bold tracking-wider">{{ '暂停' }}</span>
      </button>
      <button class="mode-card" @click.stop="callVacuum('stop')">
        <Square class="w-5 h-5 mb-1 vcp-ic-danger" />
        <span class="text-xs font-bold tracking-wider">{{ '停止' }}</span>
      </button>
      <button
        :class="['mode-card', isDocked ? 'mode-card--active' : '']"
        @click.stop="callVacuum('return_to_base')"
      >
        <Home class="w-5 h-5 mb-1 vcp-ic-success" />
        <span class="text-xs font-bold tracking-wider">{{ '回充' }}</span>
      </button>
      <button class="mode-card" @click.stop="callVacuum('locate')">
        <Volume2 class="w-5 h-5 mb-1 vcp-ic-cyan" />
        <span class="text-xs font-bold tracking-wider">{{ '寻找' }}</span>
      </button>
      <button class="mode-card" @click.stop="callVacuum('clean_spot')">
        <Target class="w-5 h-5 mb-1 vcp-ic-violet" />
        <span class="text-xs font-bold tracking-wider">{{ '定点' }}</span>
      </button>
    </div>

    <div v-if="rooms.length" class="vcp-rooms border-t border-white/[0.05] pt-3 mb-3">
      <div class="flex items-center justify-between mb-2 px-1">
        <span class="text-xs font-bold text-white/40 tracking-widest uppercase">{{
          '房间清扫'
        }}</span>
        <button
          type="button"
          class="vcp-rooms-go"
          :disabled="!selectedRooms.size"
          @click.stop="startRoomClean"
        >
          {{ selectedRooms.size ? `清扫 ${selectedRooms.size} 间` : '选择房间' }}
        </button>
      </div>
      <div class="flex flex-wrap justify-center gap-1.5">
        <button
          v-for="room in rooms"
          :key="room.id"
          type="button"
          :class="[
            'vac-room-chip',
            selectedRooms.has(room.id) && 'vac-room-chip--on',
            cleanedRoomIds.has(room.id) && 'vac-room-chip--done',
          ]"
          :title="cleanedRoomIds.has(room.id) ? '本轮已清扫' : ''"
          @click.stop="toggleRoom(room.id)"
        >
          {{ room.name }}
        </button>
      </div>
    </div>

    <div v-if="fanSpeeds.length > 0" class="vcp-fan border-t border-white/[0.05] pt-3 mb-3">
      <div class="flex items-center justify-between mb-2 px-1">
        <span class="text-xs font-bold text-white/40 tracking-widest uppercase">{{
          '吸力'
        }}</span>
        <span class="text-xs font-semibold vcp-c-violet">{{
          getFanLabel(liveEntity?.attributes?.fan_speed)
        }}</span>
      </div>
      <div class="vcp-fan__list">
        <button
          v-for="speed in fanSpeeds"
          :key="speed"
          :class="[
            'vac-mode-btn',
            liveEntity?.attributes?.fan_speed === speed ? 'vac-mode-btn--active' : '',
          ]"
          @click.stop="setFanSpeed(speed)"
        >
          {{ getFanLabel(speed) }}
        </button>
      </div>
    </div>

    <div class="flex items-center justify-between px-1">
      <div class="flex items-center gap-2">
        <div
          class="w-2 h-2 rounded-full"
          :class="isActive ? 'vcp-status-dot--on' : 'vcp-status-dot--off'"
        />
        <span class="text-xs font-semibold vcp-lbl">{{ statusText }}</span>
      </div>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 VacuumControlPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * VacuumControlPopup - 扫地机器人控制弹窗组件
 * 功能特性：
 * - 控制扫地机器人启动/暂停/回充
 * - 显示当前状态
 * - 可能支持房间选择
 * - 弹出式面板
 */
import { computed, ref, watch } from 'vue'
import { Play, Pause, Home, Volume2, Square, Bot, Target } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import HaCameraStream from '@/components/HaCameraStream.vue'
import {
  defineEntityPopupProps,
  useEntityPopupBase,
  useEntityPopupHeader,
} from '@/composables/entity/useEntityPopupBase'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useEntitiesStore } from '@/stores/entities.store'
import {
  resolveVacuumMapCameraId,
  parseVacuumRooms,
  parseCleanedRoomIds,
  parseVacuumMapMeta,
  parseCalibrationPoints,
  mapImageToVacuumCoords,
  clientPointToImagePixel,
  imagePixelToElementPercent,
} from '@/utils/vacuum/map.util'
import {
  buildSegmentCleanCommand,
  buildGotoTargetCommand,
  buildZonedCleanCommand,
} from '@/utils/vacuum/map-command.util'

const props = defineProps(defineEntityPopupProps())
defineEmits(['close'])

const chrome = useChromeStore()
const layoutStore = useLayoutStore()
const entitiesStore = useEntitiesStore()

const { liveEntity, entityRef, entityName, callService } = useEntityPopupBase(props)

const { stateLabel } = useEntityPopupHeader(entityRef, {
  stateLabelDomain: 'vacuum',
})

const mapMode = ref('view')
const selectedRooms = ref(new Set())
/** @type {import('vue').Ref<{ x: number, y: number } | null>} */
const zoneCorner = ref(null)
/** @type {import('vue').Ref<null | { left: number, top: number, width: number, height: number }>} */
const zoneOverlay = ref(null)

const s = computed(() => liveEntity.value?.state)
const isCleaning = computed(() => s.value === 'cleaning' || s.value === 'returning')
const isDocked = computed(() => s.value === 'docked')
const isActive = computed(
  () => s.value !== 'off' && s.value !== 'unavailable' && s.value !== 'idle' && s.value != null,
)
const batteryLevel = computed(() => liveEntity.value?.attributes?.battery_level ?? null)
const fanSpeeds = computed(() => liveEntity.value?.attributes?.fan_speed_list || [])
const vacAttrs = computed(() => liveEntity.value?.attributes || {})

const cleanedAreaText = computed(() => {
  const v = vacAttrs.value.cleaned_area
  if (v == null || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? `🧹 ${n} m²` : `🧹 ${v}`
})
const cleaningTimeText = computed(() => {
  const v = vacAttrs.value.cleaning_time
  if (v == null || v === '') return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return `⏱ ${v}`
  if (n >= 60) return `⏱ ${Math.floor(n / 60)}h${n % 60}m`
  return `⏱ ${n} min`
})

const haUrl = computed(() => layoutStore.layoutConfig?.haConfig?.url || '')
const vacuumEntityId = computed(() => String(liveEntity.value?.entity_id || '').trim())

const mapCameraId = computed(() =>
  resolveVacuumMapCameraId(
    vacuumEntityId.value,
    layoutStore.layoutConfig?.haConfig?.vacuumMaps,
    entitiesStore.entities,
  ),
)

const mapEntity = computed(() =>
  mapCameraId.value ? entitiesStore.entities[mapCameraId.value] || null : null,
)
const mapAttrs = computed(() => mapEntity.value?.attributes || null)
const rooms = computed(() => parseVacuumRooms(mapAttrs.value))
const cleanedRoomIds = computed(() => parseCleanedRoomIds(mapAttrs.value))
const mapMeta = computed(() => parseVacuumMapMeta(mapAttrs.value))
const calibration = computed(() => parseCalibrationPoints(mapAttrs.value))
const hasCalibration = computed(() => calibration.value.length >= 3)
const currentRoomName = computed(() => {
  const name = mapAttrs.value?.vacuum_room_name
  if (typeof name === 'string' && name.trim()) return name.trim()
  const id = mapAttrs.value?.vacuum_room
  if (id == null) return ''
  const hit = rooms.value.find((r) => r.id === Number(id))
  return hit?.name || `房间 ${id}`
})

const mapMetaLine = computed(() => {
  const parts = []
  if (mapMeta.value.mapName) parts.push(mapMeta.value.mapName)
  if (mapMeta.value.model) parts.push(mapMeta.value.model)
  if (mapMeta.value.usedApi) parts.push(mapMeta.value.usedApi)
  return parts.join(' · ')
})

const snapshotMs = computed(() => (isCleaning.value ? 2500 : 4000))
const popupWidth = computed(() => (mapCameraId.value ? 560 : 320))
const popupHeight = computed(() => {
  let h = 280
  // 地图区按 16:9 随宽度变化（560 内容宽约 288 高）
  if (mapCameraId.value) h += 350
  else h += 72
  if (mapMeta.value.twoFactorUrl) h += 56
  if (rooms.value.length) h += 88
  if (fanSpeeds.value.length) h += 72
  return Math.min(h, 820)
})

const statusText = computed(() => {
  if (s.value === 'cleaning') return '正在清扫'
  if (s.value === 'returning') return '正在回充'
  if (isDocked.value) return '已归位充电'
  if (s.value === 'paused') return '清扫已暂停'
  if (s.value === 'error') return '异常'
  return '待命中'
})

const FAN_LABELS = {
  max: '最大',
  medium: '中等',
  mop: '拖地',
  silent: '安静',
  standard: '标准',
  turbo: '强力',
  quiet: '安静',
  balanced: '标准',
  strong: '强力',
  low: '低',
  high: '高',
  soft: '轻柔',
  gentle: '轻柔',
  auto: '自动',
  off: '关闭',
}

function getFanLabel(speed) {
  const key = String(speed ?? '')
    .trim()
    .toLowerCase()
  return FAN_LABELS[key] ?? String(speed ?? '')
}

function resetZoneDraft() {
  zoneCorner.value = null
  zoneOverlay.value = null
}

function setMapMode(mode) {
  mapMode.value = mode
  resetZoneDraft()
}

watch(mapCameraId, () => {
  selectedRooms.value = new Set()
  setMapMode('view')
})

function toggleRoom(id) {
  const next = new Set(selectedRooms.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedRooms.value = next
  if (next.size) mapMode.value = 'rooms'
}

async function callVacuum(svc) {
  try {
    await callService('vacuum', svc, liveEntity.value.entity_id, undefined, '吸尘器操作失败')
  } catch {
    chrome.notify('操作失败', 'error')
  }
}

async function setFanSpeed(speed) {
  try {
    await callService(
      'vacuum',
      'set_fan_speed',
      liveEntity.value.entity_id,
      { fan_speed: speed },
      '设置模式失败',
    )
  } catch {
    chrome.notify('设置吸力失败', 'error')
  }
}

async function sendMiioCommand(payload, failMsg) {
  if (!payload) return
  try {
    await callService(
      'vacuum',
      'send_command',
      liveEntity.value.entity_id,
      { command: payload.command, params: payload.params },
      failMsg,
    )
    chrome.notify('指令已发送', 'success')
  } catch {
    chrome.notify(failMsg || '指令失败（需小米/石头 miio 集成）', 'error')
  }
}

async function startRoomClean() {
  const ids = [...selectedRooms.value]
  const payload = buildSegmentCleanCommand(ids)
  if (!payload) {
    chrome.notify('请先选择房间', 'warning')
    return
  }
  await sendMiioCommand(payload, '房间清扫失败')
}

function resolveClickVacuum(ev) {
  const img = ev.currentTarget?.querySelector?.('img')
  if (!img || !(img instanceof HTMLImageElement)) {
    chrome.notify('地图尚未就绪', 'warning')
    return null
  }
  const pixel = clientPointToImagePixel(img, ev.clientX, ev.clientY)
  if (!pixel) return null
  const vac = mapImageToVacuumCoords(pixel.x, pixel.y, calibration.value)
  if (!vac) {
    chrome.notify('缺少标定数据，请在 HA 开启 calibration_points', 'warning')
    return null
  }
  return { img, pixel, vac }
}

function onMapClick(ev) {
  if (mapMode.value === 'goto') {
    const hit = resolveClickVacuum(ev)
    if (!hit) return
    void sendMiioCommand(buildGotoTargetCommand(hit.vac.x, hit.vac.y), '前往目标失败')
    return
  }
  if (mapMode.value !== 'zone') return
  const hit = resolveClickVacuum(ev)
  if (!hit) return
  if (!zoneCorner.value) {
    zoneCorner.value = { x: hit.vac.x, y: hit.vac.y }
    const pct = imagePixelToElementPercent(hit.img, hit.pixel.x, hit.pixel.y)
    if (pct) {
      zoneOverlay.value = { left: pct.left, top: pct.top, width: 0.5, height: 0.5 }
    }
    return
  }
  const x1 = Math.min(zoneCorner.value.x, hit.vac.x)
  const y1 = Math.min(zoneCorner.value.y, hit.vac.y)
  const x2 = Math.max(zoneCorner.value.x, hit.vac.x)
  const y2 = Math.max(zoneCorner.value.y, hit.vac.y)
  if (Math.abs(x2 - x1) < 10 || Math.abs(y2 - y1) < 10) {
    chrome.notify('区域过小，请重新框选', 'warning')
    resetZoneDraft()
    return
  }
  const firstPct = zoneOverlay.value
  const secondPct = imagePixelToElementPercent(hit.img, hit.pixel.x, hit.pixel.y)
  if (firstPct && secondPct) {
    zoneOverlay.value = {
      left: Math.min(firstPct.left, secondPct.left),
      top: Math.min(firstPct.top, secondPct.top),
      width: Math.abs(secondPct.left - firstPct.left) || 1,
      height: Math.abs(secondPct.top - firstPct.top) || 1,
    }
  }
  void sendMiioCommand(buildZonedCleanCommand([[x1, y1, x2, y2]]), '划区清扫失败').finally(() => {
    resetZoneDraft()
    mapMode.value = 'view'
  })
}
</script>

<style scoped src="./styles/VacuumControlPopup.css"></style>
