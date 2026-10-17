<!--
  安防「监控」面板。提供单路 / 多路切换、轮巡间隔选择、绑定摄像头入口，
  单路模式展示主路实时流与门铃画中画；多路模式以网格 + 快照缩略图方式呈现。
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
          v-for="cam in cameraItems"
          :key="cam.key"
          :cam-id="cam.key"
          :label="getCameraName(cam.key)"
          :ha-url="haUrl"
          :camera-source="cam.cameraSource"
          :go2rtc-url="cam.go2rtcUrl"
          :project-id="activeProjectId"
          :stream-errors="streamErrors"
          :active-slot="gridActiveSlots[cam.key] ?? -1"
          :focused="
            viewMode === 'grid' && carouselSec > 0 && cameraItems[carouselIndex]?.key === cam.key
          "
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
            v-if="mainCameraItem && !streamErrors[mainCameraKey]"
            :entity="mainCameraEntity"
            :ha-url="haUrl"
            :active="true"
            :prefer-webrtc="false"
            :camera-source="mainCameraItem.cameraSource"
            :go2rtc-url="mainCameraItem.go2rtcUrl"
            :project-id="activeProjectId"
            :camera-id="mainCameraKey"
            object-fit="contain"
            class="w-full h-full"
            @error="onStreamError(mainCameraKey)"
          />
          <div v-if="pipCameraItem && chrome.isDoorbellModalOpen" class="sec-monitor-pip">
            <HaCameraStream
              :entity="pipCameraEntity"
              :ha-url="haUrl"
              :active="true"
              :prefer-webrtc="false"
              :camera-source="pipCameraItem.cameraSource"
              :go2rtc-url="pipCameraItem.go2rtcUrl"
              :project-id="activeProjectId"
              :camera-id="pipCameraItem.key"
              object-fit="cover"
              class="w-full h-full"
            />
            <span class="sec-monitor-pip__label">{{ '门铃' }}</span>
          </div>
          <div
            v-if="mainCameraItem && !streamErrors[mainCameraKey]"
            class="sec-rec-indicator absolute top-6 right-6 px-3 py-1.5 rounded-full text-[12px] font-bold text-white uppercase tracking-widest z-20"
          >
            <div class="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block mr-1.5" />
            REC
          </div>
          <div
            v-else-if="mainCameraItem && streamErrors[mainCameraKey]"
            class="flex-1 flex flex-col items-center justify-center gap-3 p-8 z-20"
          >
            <VEmptyState
              icon=""
              compact
              tone="rose"
              :title="'视频流不可用'"
              :description="'go2rtc / HLS / MJPEG 均已尝试失败，请检查摄像头与 HA 连接'"
            />
            <button type="button" class="sec-config-btn" @click="retryStream(mainCameraKey)">
              {{ '点击重试' }}
            </button>
          </div>
          <div v-else-if="!mainCameraItem" class="flex-1 flex items-center justify-center p-8">
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
          v-if="cameraItems.length > 1"
          class="w-44 h-full bg-[#0d1017] border-l border-white/5 flex flex-col gap-3 p-3 overflow-y-auto hidden-scrollbar"
        >
          <!-- 摄像头缩略图原先也是可点击的 <div>：鼠标可用但不可聚焦、无键盘激活。
               改成 button 后获得原生键盘语义与焦点环。内部叠层只能用 span：
               button 的内容模型是 phrasing content，塞 div/p 属于非法 HTML。
               名称由 aria-label 承载，图片转为装饰性，避免读屏把名字念两遍。 -->
          <button
            v-for="cam in cameraItems"
            :key="cam.key"
            type="button"
            :class="[
              'relative aspect-video rounded-xl overflow-hidden border-2 transition-all cursor-pointer shrink-0 bg-transparent p-0',
              activeCameraId === cam.key
                ? 'sec-camera-thumb--active scale-[1.02]'
                : 'border-white/5 opacity-30 hover:opacity-100 hover:border-white/20',
            ]"
            :aria-label="`切换到 ${getCameraName(cam.key)} 画面`"
            :aria-current="activeCameraId === cam.key ? 'true' : undefined"
            @click="activeCameraId = cam.key"
          >
            <!-- 仅当前选中路拉实时流，其余侧栏缩略图用单帧快照，避免同时打开多路 MJPEG 流压垮平板/HA -->
            <span class="block w-full h-full bg-[#111]" aria-hidden="true" />
            <span
              class="absolute inset-x-0 bottom-0 block bg-gradient-to-t from-black to-transparent p-1.5"
            >
              <span class="block text-[12px] text-white font-bold truncate">{{
                getCameraName(cam.key)
              }}</span>
            </span>
          </button>
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
import { useHaConnectionStore } from '@/stores/ha-connection.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useEntityDisplayEpoch } from '@/composables/entity/useEntityDisplayEpoch'
import SecurityCameraTile from '@/features/security/CameraTile.vue'
import HaCameraStream from '@/components/HaCameraStream.vue'
import { getEntityDisplayName } from '@/shared/entity/utils/derived.util'
import { primaryDoorbellCameraId } from '@/shared/utils/layout/doorbell.util'
import { normalizeSecurityCameras } from '@/shared/utils/layout/security-cameras.util'
import { schedulePoll } from '@/shared/utils/core/poll-scheduler'

defineProps({
  active: { type: Boolean, default: true },
  alertCount: { type: Number, default: 0 },
})

const emit = defineEmits(['back'])

const router = useRouter()
const entitiesStore = useEntitiesStore()
const layoutStore = useLayoutStore()
const chrome = useChromeStore()
const cameraDisplayEpoch = useEntityDisplayEpoch('camera')

// 已绑定的摄像头列表（haConfig.securityCameras 为 `[{entityId, go2rtcUrl?}]`）。
// 每项带稳定 key：绑定实体时直接用实体 ID，只填 go2rtc 地址时用索引占位键。
const cameraItems = computed(() =>
  normalizeSecurityCameras(layoutStore.layoutConfig.haConfig.securityCameras)
    .map((binding, index) => {
      const entityId = String(binding.entityId || '').trim(),
        go2rtcUrl = String(binding.go2rtcUrl || '').trim()
      return {
        key: entityId || `go2rtc:${index}`,
        entityId,
        go2rtcUrl,
        cameraSource: go2rtcUrl ? 'go2rtc' : 'entity',
      }
    })
    .filter((item) => item.entityId || item.go2rtcUrl),
)
// 当前布局方案的 ID：go2rtc 中继按「方案 + 摄像头」在服务端权威取址
const activeProjectId = computed(() => String(layoutStore.activeProfileId || ''))
// HA 实例地址（跟随 failover；连接地址单源在 stores/ha-connection.store.ts）
const haConnectionStore = useHaConnectionStore()
const haUrl = computed(() => haConnectionStore.baseUrl)
// 视图模式：detail 单路 / grid 多路
const viewMode = ref('detail')
// 轮巡间隔（秒），0 表示关闭轮巡
const carouselSec = ref(0)
// 当前轮巡聚焦的摄像头索引
const carouselIndex = ref(0)
// 摄像头轮巡轮询任务的取消函数
let carouselCancel = null
// 当前单路模式选中的摄像头 key（绑定实体时即实体 ID，纯 go2rtc 时为索引占位键）
const activeCameraId = ref('')
// 记录每个摄像头是否发生过流错误，决定是否显示重试占位
const streamErrors = reactive({})
// 网格模式下按可见顺序排列的摄像头 key，用于限制同时拉流的槽位
const gridVisibleOrder = ref([])

// 摄像头 key → 绑定项索引，渲染与轮巡统一按 key 取源
const cameraByKey = computed(() => new Map(cameraItems.value.map((item) => [item.key, item])))
/** 按 key 取摄像头绑定项（不存在时返回 null）。 */
function cameraOf(key) {
  return cameraByKey.value.get(key) || null
}
/** 从 go2rtc 地址里取 src 名称，作为纯 go2rtc 摄像头的显示名。 */
function go2rtcSrcLabel(go2rtcUrl) {
  try {
    return new URL(go2rtcUrl).searchParams.get('src')?.trim() || 'go2rtc 摄像头'
  } catch {
    return 'go2rtc 摄像头'
  }
}

// 判断摄像头是否处于离线态（不存在 / unavailable / unknown）。
// go2rtc 来源走同源 MSE 中继，不依赖 HA 实体状态，地址配好即视为可用。
function isCameraOffline(cameraKey) {
  void cameraDisplayEpoch.value
  const item = cameraOf(cameraKey)
  if (!item) return true
  if (item.go2rtcUrl) return false
  if (!item.entityId) return true
  const entity = entitiesStore.entities[item.entityId]
  return !entity || entity.state === 'unavailable' || entity.state === 'unknown'
}

// 单路模式无可用流时的主标题：未绑定 / HA 断连 / 实体离线 / 拉流失败
const monitorOfflineReason = computed(() => {
  if (!mainCameraItem.value) return '未绑定监控摄像头'
  if (!entitiesStore.connected) return 'HA 断连 · 监控不可用'
  if (isCameraOffline(mainCameraKey.value)) return '摄像头实体离线'
  return '无法获取视频流'
})

// 配合主标题的副提示，引导用户检查配置或重连
const monitorOfflineHint = computed(() => {
  if (!mainCameraItem.value)
    return '请在「设置 → 集成绑定 → 安防」中配置 securityCameras'
  if (!entitiesStore.connected) return '连接恢复后将自动重试拉流；也可点击顶部「重试连接」'
  if (isCameraOffline(mainCameraKey.value))
    return '请检查 camera 实体是否在 HA 中可用（Frigate/集成离线时属正常现象）'
  return '请确认 HA Token 有效且 camera 支持 proxy_stream'
})

// 按摄像头数量自适应网格列数（1/2/3/4 列）
const monitorGridCols = computed(() => {
  const n = cameraItems.value.length
  if (n <= 1) return 'grid-cols-1'
  if (n <= 4) return 'grid-cols-2'
  if (n <= 8) return 'grid-cols-3'
  return 'grid-cols-4'
})

// 取前 4 个可见摄像头分配拉流槽位，超出部分仅展示快照以保护性能
const gridActiveSlots = computed(() => {
  const slots = {}
  gridVisibleOrder.value.slice(0, 4).forEach((camKey, idx) => {
    slots[camKey] = idx
  })
  return slots
})

// 单路模式当前主摄像头 key：优先用户选择，其次首路，再次全局配置兜底
const mainCameraKey = computed(() => {
  const explicit =
    activeCameraId.value ||
    cameraItems.value[0]?.key ||
    String(layoutStore.layoutConfig.haConfig.securityCamera || '').trim()
  if (!explicit) return ''
  return cameraItems.value.find((item) => item.key === explicit || item.entityId === explicit)?.key || explicit
})

// 当前主摄像头绑定项：纯 go2rtc 来源没有 HA 实体，只按 key 取地址
const mainCameraItem = computed(() => cameraOf(mainCameraKey.value))

// 当前主摄像头实体（依赖 camera 域 epoch 以响应实体更新）。
// 拉流走同源 /api/camera_hls，不依赖 haUrl；haUrl 空时仍应挂载播放器。
const mainCameraEntity = computed(() => {
  void cameraDisplayEpoch.value
  const entityId = mainCameraItem.value?.entityId
  if (!entityId) return null
  return entitiesStore.entities[entityId] || null
})

// 门铃画中画绑定项：门铃路由给的是实体 ID，据此回查该摄像头的来源配置
const pipCameraItem = computed(() => {
  const entityId = String(primaryDoorbellCameraId(layoutStore.layoutConfig.haConfig) || '').trim()
  if (!entityId) return null
  return (
    cameraItems.value.find((item) => item.entityId === entityId) || {
      key: entityId,
      entityId,
      go2rtcUrl: '',
      cameraSource: 'entity',
    }
  )
})
// 门铃画中画实体，仅在门铃弹窗打开时挂载拉流
const pipCameraEntity = computed(() => {
  void cameraDisplayEpoch.value
  const entityId = pipCameraItem.value?.entityId
  if (!entityId) return null
  return entitiesStore.entities[entityId] || null
})

// 启动轮巡：仅在多路模式、≥2 路且间隔 > 0 时生效
function startCarousel() {
  stopCarousel()
  if (!carouselSec.value || viewMode.value !== 'grid' || cameraItems.value.length < 2) return
  // 摄像头轮巡经全局调度器驱动（页面隐藏时暂停，恢复可见后继续轮巡）
  carouselCancel = schedulePoll('security:monitor-carousel', () => {
    carouselIndex.value = (carouselIndex.value + 1) % cameraItems.value.length
  }, carouselSec.value * 1000)
}

// 停止轮巡并释放调度器任务
function stopCarousel() {
  if (carouselCancel) {
    carouselCancel()
    carouselCancel = null
  }
}

// 间隔 / 视图模式 / 摄像头 key 列表变化时重启轮巡任务
watch(
  [carouselSec, viewMode, () => cameraItems.value.map((item) => item.key).join('|')],
  () => startCarousel(),
)
onMounted(() => {
  // 连接地址是拼 HA 绝对 URL 的前提；store 内部对失败做了兜底，不阻塞页面渲染。
  void haConnectionStore.load()
})
onMounted(startCarousel)
onUnmounted(stopCarousel)

// 取摄像头可读名称（依赖 camera 域 epoch 以响应显示名更新）。
// 纯 go2rtc 来源没有 HA 实体，退化成地址里的 src 名。
function getCameraName(cameraKey) {
  void cameraDisplayEpoch.value
  const item = cameraOf(cameraKey)
  if (!item) return ''
  if (!item.entityId) return go2rtcSrcLabel(item.go2rtcUrl)
  return getEntityDisplayName(item.entityId, entitiesStore.entities[item.entityId])
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
function onGridSelect(cameraKey) {
  activeCameraId.value = cameraKey
  viewMode.value = 'detail'
}

// 记录流错误，触发对应摄像头显示重试占位
function onStreamError(cameraKey) {
  if (cameraKey) streamErrors[cameraKey] = true
}

// 用户点击重试：清除错误标记以重新挂载流
function retryStream(cameraKey) {
  if (cameraKey) delete streamErrors[cameraKey]
}
</script>

<style scoped src="./styles/MonitorPanel.css"></style>
