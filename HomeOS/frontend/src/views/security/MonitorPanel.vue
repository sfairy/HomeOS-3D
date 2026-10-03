<!--
组件：SecurityMonitorPanel.vue
所属模块：frontend / src / views / security
职责：安防「监控」面板。提供单路 / 多路切换、轮巡间隔选择、绑定摄像头入口，
      单路模式展示主路实时流与门铃画中画；多路模式以网格 + 快照缩略图方式呈现。
关键依赖：
  - HaCameraStream / SecurityCameraTile：实时流与单格摄像头组件
  - useEntitiesStore / useLayoutStore / useChromeStore：实体、布局与门铃弹窗状态
  - schedulePoll：全局轮巡调度（页面隐藏时暂停）
  - primaryDoorbellCameraId：派生门铃主摄像头 ID
数据来源：layoutStore 的 securityCameras 配置、entitiesStore 的 camera 实体
-->
<template>
  <div v-if="active" class="flex-1 flex flex-col overflow-hidden animate-fade-in">
    <div class="sec-monitor-toolbar shrink-0">
      <div class="sec-segment">
        <button
          type="button"
          :class="['sec-segment-btn', viewMode === 'detail' && 'sec-segment-btn--active']"
          @click="viewMode = 'detail'"
        >
          {{ '单路' }}
        </button>
        <button
          type="button"
          :class="['sec-segment-btn', viewMode === 'grid' && 'sec-segment-btn--active']"
          @click="viewMode = 'grid'"
        >
          {{ '多路' }}
        </button>
      </div>
      <div v-if="viewMode === 'grid'" class="sec-segment ml-2">
        <HosSelect
          variant="inline"
          trigger-class="sec-carousel-select"
          v-model="carouselSec"
          title="轮巡间隔"
        >
          <option :value="0">{{ '轮巡关' }}</option>
          <option :value="5">{{ '5 秒' }}</option>
          <option :value="10">{{ '10 秒' }}</option>
          <option :value="20">{{ '20 秒' }}</option>
        </HosSelect>
      </div>
      <div class="flex-1" />
      <button
        type="button"
        class="sec-config-btn"
        @click="router.push({ path: '/settings', query: { tab: 'bindings' } })"
      >
        <SettingsIcon class="w-3.5 h-3.5" /> {{ '绑定摄像头' }}
      </button>
      <div v-if="alertCount > 0" class="sec-toolbar-alert">
        <AlertTriangle class="w-3.5 h-3.5 animate-pulse" />
        {{ '{n} 传感器告警'.replace('{n}', String(alertCount)) }}
      </div>
      <button type="button" class="sec-toolbar-link" @click="emit('back')">
        <Shield class="w-3.5 h-3.5" /> {{ '返回总览' }}
      </button>
    </div>

    <div class="flex-1 relative flex bg-black overflow-hidden">
      <div
        v-if="viewMode === 'grid'"
        class="absolute inset-0 grid p-4 gap-4 overflow-y-auto auto-rows-min animate-scale-in"
        :class="monitorGridCols"
      >
        <SecurityCameraTile
          v-for="camId in allCameras"
          :key="camId"
          :cam-id="camId"
          :ha-url="haUrl"
          :stream-errors="streamErrors"
          :active-slot="gridActiveSlots[camId] ?? -1"
          :focused="viewMode === 'grid' && carouselSec > 0 && allCameras[carouselIndex] === camId"
          :streams-enabled="true"
          :prefer-webrtc="false"
          @select="onGridSelect"
          @stream-error="onStreamError"
          @retry="retryStream"
          @visibility="onGridTileVisibility"
        />
      </div>

      <div v-else class="flex-1 flex relative">
        <div class="flex-1 relative flex items-center justify-center overflow-hidden">
          <div class="absolute inset-0 pointer-events-none z-10 scanline-overlay opacity-[0.03]" />
          <HaCameraStream
            v-if="mainCameraEntity && !streamErrors[mainCameraId]"
            :entity="mainCameraEntity"
            :ha-url="haUrl"
            :active="true"
            object-fit="contain"
            class="w-full h-full"
            @error="onStreamError(mainCameraId)"
          />
          <div v-if="pipCameraEntity && chrome.isDoorbellModalOpen" class="sec-monitor-pip">
            <HaCameraStream
              :entity="pipCameraEntity"
              :ha-url="haUrl"
              :active="true"
              object-fit="cover"
              class="w-full h-full"
            />
            <span class="sec-monitor-pip__label">{{ '门铃' }}</span>
          </div>
          <div
            v-if="mainCameraEntity && !streamErrors[mainCameraId]"
            class="sec-rec-indicator absolute top-6 right-6 px-3 py-1.5 rounded-full text-[12px] font-bold text-white uppercase tracking-widest z-20"
          >
            <div class="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block mr-1.5" />
            REC
          </div>
          <div
            v-else-if="mainCameraEntity && streamErrors[mainCameraId]"
            class="flex-1 flex flex-col items-center justify-center gap-3 p-8 z-20"
          >
            <VEmptyState
              icon=""
              compact
              tone="rose"
              :title="'视频流不可用'"
              :description="'WebRTC/HLS/MJPEG 均已尝试失败，请检查摄像头与 HA 连接'"
            />
            <button type="button" class="sec-config-btn" @click="retryStream(mainCameraId)">
              {{ '点击重试' }}
            </button>
          </div>
          <div v-else-if="!mainCameraEntity" class="flex-1 flex items-center justify-center p-8">
            <VEmptyState
              icon=""
              compact
              tone="rose"
              :title="monitorOfflineReason"
              :description="monitorOfflineHint"
            />
          </div>
        </div>
        <div
          v-if="allCameras.length > 1"
          class="w-44 h-full bg-[#0d1017] border-l border-white/5 flex flex-col gap-3 p-3 overflow-y-auto hidden-scrollbar"
        >
          <div
            v-for="cam in allCameras"
            :key="cam"
            :class="[
              'relative aspect-video rounded-xl overflow-hidden border-2 transition-all cursor-pointer flex-shrink-0',
              activeCameraId === cam
                ? 'sec-camera-thumb--active scale-[1.02]'
                : 'border-white/5 opacity-30 hover:opacity-100 hover:border-white/20',
            ]"
            @click="activeCameraId = cam"
          >
            <!-- 仅当前选中路拉实时流，其余侧栏缩略图用单帧快照，避免同时打开多路 MJPEG 流压垮平板/HA -->
            <img :src="getSnapshotUrl(cam)" class="w-full h-full object-cover" loading="lazy" />
            <div
              class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black to-transparent p-1.5"
            >
              <p class="text-[12px] text-white font-bold truncate">{{ getCameraName(cam) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import HosSelect from '@/components/common/base/HosSelect.vue'
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Shield, AlertTriangle, Settings as SettingsIcon } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useEntityDisplayEpoch } from '@/composables/entity/useEntityDisplayEpoch'
import SecurityCameraTile from '@/views/security/CameraTile.vue'
import HaCameraStream from '@/components/HaCameraStream.vue'
import { getCameraSnapshotUrl } from '@/utils/ha/camera-stream.util'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { primaryDoorbellCameraId } from '@/utils/layout/doorbell.util'
import { schedulePoll } from '@/utils/core/poll-scheduler'

// 入参：面板是否激活、当前告警传感器数量
defineProps({
  active: { type: Boolean, default: true },
  alertCount: { type: Number, default: 0 },
})

// 对外事件：返回安防总览
const emit = defineEmits(['back'])

const router = useRouter()
const entitiesStore = useEntitiesStore()
const layoutStore = useLayoutStore()
const chrome = useChromeStore()
const cameraDisplayEpoch = useEntityDisplayEpoch('camera')

// 已绑定的摄像头实体 ID 列表（来自布局配置 haConfig.securityCameras）
const allCameras = computed(() => layoutStore.layoutConfig.haConfig.securityCameras || [])
// HA 实例地址，用于拼接摄像头快照 URL
const haUrl = computed(() => layoutStore.layoutConfig.haConfig.url)
// 视图模式：detail 单路 / grid 多路
const viewMode = ref('detail')
// 轮巡间隔（秒），0 表示关闭轮巡
const carouselSec = ref(0)
// 当前轮巡聚焦的摄像头索引
const carouselIndex = ref(0)
// 摄像头轮巡轮询任务的取消函数
let carouselCancel = null
// 当前单路模式选中的摄像头 ID
const activeCameraId = ref('')
// 记录每个摄像头是否发生过流错误，决定是否显示重试占位
const streamErrors = reactive({})
// 网格模式下按可见顺序排列的摄像头 ID，用于限制同时拉流的槽位
const gridVisibleOrder = ref([])

// 判断摄像头实体是否处于离线态（不存在 / unavailable / unknown）
function isCameraOffline(camId) {
  void cameraDisplayEpoch.value
  if (!camId) return true
  const entity = entitiesStore.entities[camId]
  return !entity || entity.state === 'unavailable' || entity.state === 'unknown'
}

// 单路模式无可用流时的主标题：未绑定 / HA 断连 / 实体离线 / 拉流失败
const monitorOfflineReason = computed(() => {
  const camId =
    activeCameraId.value || allCameras.value[0] || layoutStore.layoutConfig.haConfig.securityCamera
  if (!camId) return '未绑定监控摄像头'
  if (!entitiesStore.connected) return 'HA 断连 · 监控不可用'
  if (isCameraOffline(camId)) return '摄像头实体离线'
  return '无法获取视频流'
})

// 配合主标题的副提示，引导用户检查配置或重连
const monitorOfflineHint = computed(() => {
  const camId =
    activeCameraId.value || allCameras.value[0] || layoutStore.layoutConfig.haConfig.securityCamera
  if (!camId) return '请在「设置 → 集成绑定 → 安防」中配置 securityCameras'
  if (!entitiesStore.connected) return '连接恢复后将自动重试拉流；也可点击顶部「重试连接」'
  if (isCameraOffline(camId))
    return '请检查 camera 实体是否在 HA 中可用（Frigate/集成离线时属正常现象）'
  return '请确认 HA Token 有效且 camera 支持 proxy_stream'
})

// 按摄像头数量自适应网格列数（1/2/3/4 列）
const monitorGridCols = computed(() => {
  const n = allCameras.value.length
  if (n <= 1) return 'grid-cols-1'
  if (n <= 4) return 'grid-cols-2'
  if (n <= 8) return 'grid-cols-3'
  return 'grid-cols-4'
})

// 取前 4 个可见摄像头分配拉流槽位，超出部分仅展示快照以保护性能
const gridActiveSlots = computed(() => {
  const slots = {}
  gridVisibleOrder.value.slice(0, 4).forEach((camId, idx) => {
    slots[camId] = idx
  })
  return slots
})

// 拼接摄像头单帧快照 URL，供网格缩略图与离线占位使用
function getSnapshotUrl(camId) {
  void cameraDisplayEpoch.value
  if (!camId || !haUrl.value) return ''
  const entity = entitiesStore.entities[camId]
  if (!entity) return ''
  return getCameraSnapshotUrl(haUrl.value, entity)
}

// 单路模式当前主摄像头 ID：优先用户选择，其次首路，再次全局配置兜底
const mainCameraId = computed(
  () => activeCameraId.value || allCameras.value[0] || layoutStore.layoutConfig.haConfig.securityCamera,
)

// 当前主摄像头实体（依赖 camera 域 epoch 以响应实体更新）
const mainCameraEntity = computed(() => {
  void cameraDisplayEpoch.value
  const camId = mainCameraId.value
  if (!camId || !haUrl.value) return null
  return entitiesStore.entities[camId] || null
})

// 门铃主摄像头 ID（来自布局配置派生）
const pipCameraId = computed(() => primaryDoorbellCameraId(layoutStore.layoutConfig.haConfig))
// 门铃画中画实体，仅在门铃弹窗打开时挂载拉流
const pipCameraEntity = computed(() => {
  void cameraDisplayEpoch.value
  const id = pipCameraId.value
  if (!id || !haUrl.value) return null
  return entitiesStore.entities[id] || null
})

// 启动轮巡：仅在多路模式、≥2 路且间隔 > 0 时生效
function startCarousel() {
  stopCarousel()
  if (!carouselSec.value || viewMode.value !== 'grid' || allCameras.value.length < 2) return
  // 摄像头轮巡经全局调度器驱动（页面隐藏时暂停，恢复可见后继续轮巡）
  carouselCancel = schedulePoll('security:monitor-carousel', () => {
    carouselIndex.value = (carouselIndex.value + 1) % allCameras.value.length
  }, carouselSec.value * 1000)
}

// 停止轮巡并释放调度器任务
function stopCarousel() {
  if (carouselCancel) {
    carouselCancel()
    carouselCancel = null
  }
}

// 间隔 / 视图模式 / 摄像头列表变化时重启轮巡任务
watch([carouselSec, viewMode, allCameras], () => startCarousel(), { deep: true })
onMounted(startCarousel)
onUnmounted(stopCarousel)

// 取摄像头可读名称（依赖 camera 域 epoch 以响应显示名更新）
function getCameraName(camId) {
  void cameraDisplayEpoch.value
  return getEntityDisplayName(camId, entitiesStore.entities[camId])
}

// 接收子组件可见性变化，维护可见顺序列表以分配拉流槽位
function onGridTileVisibility({ camId, visible }) {
  const list = [...gridVisibleOrder.value]
  const idx = list.indexOf(camId)
  if (visible && idx < 0) list.push(camId)
  else if (!visible && idx >= 0) list.splice(idx, 1)
  gridVisibleOrder.value = list
}

// 网格中点击某格：切到单路模式并聚焦该摄像头
function onGridSelect(camId) {
  activeCameraId.value = camId
  viewMode.value = 'detail'
}

// 记录流错误，触发对应摄像头显示重试占位
function onStreamError(camId) {
  if (camId) streamErrors[camId] = true
}

// 用户点击重试：清除错误标记以重新挂载流
function retryStream(camId) {
  if (camId) delete streamErrors[camId]
}
</script>

<style scoped src="./styles/MonitorPanel.css"></style>
