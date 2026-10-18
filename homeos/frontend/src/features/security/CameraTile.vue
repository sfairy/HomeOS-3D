<!--
  安防监控「单格摄像头」组件。按需挂载 HaCameraStream 实时流，并通过
  IntersectionObserver 仅在视口内拉流；流失败时显示重试占位。
-->
<template>
  <div
    ref="rootRef"
    :class="[
      'security-camera-tile relative rounded-3xl overflow-hidden bg-[#0d1017] border cursor-pointer transition-all hover:scale-[1.01] hover:z-10 shadow-2xl aspect-video min-h-[120px]',
      focused
        ? 'sct-focused-border ring-2 sct-focused-ring scale-[1.02] z-10'
        : 'border-white/5 sct-hover-border',
    ]"
  >
    <HaCameraStream
      v-if="active && hasSource && !streamErrors[camId]"
      :entity="entity"
      :ha-url="haUrl"
      :active="active"
      :prefer-webrtc="preferWebrtc"
      :camera-source="cameraSource"
      :go2rtc-url="go2rtcUrl"
      :project-id="projectId"
      :component-id="componentId"
      :camera-id="camId"
      object-fit="cover"
      @error="emit('stream-error', camId)"
    />
    <!--
      键盘可达性：整格点击（select）与「点击加载/重试」互斥，各自必须是真 <button>：
        · 拉流中 → 覆盖整格的透明按钮 = 选中该摄像头
        · 未拉流 / 流失败 → 占位按钮本身即操作（加载 / 重试）
      覆盖层不会挡住下面已挂载的流：HaCameraStream 内部没有任何可交互元素。
    -->
    <button
      v-if="active && !streamErrors[camId]"
      type="button"
      class="sct-select-layer"
      :aria-label="`查看摄像头 ${cameraName}`"
      @click="emit('select', camId)"
    ></button>
    <button
      v-else
      type="button"
      class="w-full h-full flex flex-col items-center justify-center gap-1 bg-[#111] text-[12px] sct-text-muted sct-placeholder-btn"
      :aria-label="
        streamErrors[camId]
          ? `重试加载摄像头 ${cameraName}`
          : `加载摄像头 ${cameraName}`
      "
      @click="emit('retry', camId)"
    >
      <template v-if="streamErrors[camId]"
        >{{ '流离线' }} <span class="text-[12px] sct-text-info">{{ '点击重试' }}</span></template
      >
      <template v-else>{{ '点击加载' }}</template>
    </button>
    <!-- 名称条：装饰层，pointer-events:none 让点击落到上面的按钮；键盘聚焦时同样显形 -->
    <div
      class="sct-name-bar absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-4 opacity-0 transition-opacity"
    >
      <span class="text-xs text-white font-bold">{{ cameraName }}</span>
    </div>
    <div
      v-if="active && hasSource && !streamErrors[camId]"
      class="pointer-events-none absolute top-4 left-4 px-3 py-1 rounded-full sct-live-bg text-[12px] font-bold text-white uppercase tracking-widest shadow-lg"
    >
      <div class="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block mr-1.5" />
      {{ '直播' }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import HaCameraStream from '@/components/HaCameraStream.vue'
import { getEntityDisplayName } from '@/shared/entity/utils/derived.util'

// 多路网格默认最多 2 路实时流（WebRTC/HLS），超出部分仅快照占位，避免平板/HA 过载
const GRID_MAX_ACTIVE = 2

const props = defineProps({
  camId: { type: String, required: true },
  haUrl: { type: String, default: '' },
  streamErrors: { type: Object, required: true },
  activeSlot: { type: Number, default: -1 },
  focused: { type: Boolean, default: false },
  streamsEnabled: { type: Boolean, default: true },
  /** 默认关 WebRTC，走 HLS → MJPEG → 快照 */
  preferWebrtc: { type: Boolean, default: false },
  /** 摄像头来源：`entity` 走 HA 实体通路，`go2rtc` 走局域网 MSE 中继 */
  cameraSource: { type: String, default: 'entity' },
  go2rtcUrl: { type: String, default: '' },
  projectId: { type: String, default: '' },
  componentId: { type: String, default: '' },
  /** 仅 go2rtc 来源（没有 HA 实体）时的显示名 */
  label: { type: String, default: '' },
})

const emit = defineEmits(['select', 'stream-error', 'retry', 'visibility'])

const entitiesStore = useEntitiesStore()
const rootRef = ref(null)
const visible = ref(false)
let observer = null

// 仅在启用拉流、可见且占用前 N 个槽位之一时才真正挂载实时流
const active = computed(
  () =>
    props.streamsEnabled &&
    visible.value &&
    props.activeSlot >= 0 &&
    props.activeSlot < GRID_MAX_ACTIVE,
)
const entity = computed(() => {
  // 读取 camera 域 epoch 以建立依赖，实体更新时触发重新计算
  void entitiesStore.getDomainEpoch('camera')
  return entitiesStore.entities[props.camId] || null
})
// go2rtc 来源可以没有 HA 实体：只要地址或实体任一可用就算有画面来源
const hasSource = computed(() => !!entity.value || !!String(props.go2rtcUrl || '').trim())
const cameraName = computed(() => {
  void entitiesStore.getDomainEpoch('camera')
  if (props.label) return props.label
  if (!entity.value) return 'go2rtc 摄像头'
  return getEntityDisplayName(props.camId ?? '', entity.value)
})

onMounted(() => {
  // 通过 IntersectionObserver 懒加载，仅在摄像头进入视口（含 80px 提前量）时拉流
  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      visible.value = entry?.isIntersecting ?? false
      emit('visibility', { camId: props.camId, visible: visible.value })
    },
    { rootMargin: '80px', threshold: 0.15 },
  )
  if (rootRef.value) observer.observe(rootRef.value)
})

onUnmounted(() => {
  // 组件卸载时断开观察者，避免内存泄漏与回调对已销毁组件的写入
  observer?.disconnect()
  observer = null
})
</script>

<style scoped>
.sct-focused-border {
  border-color: var(--set-info, var(--hos-color-info-text));
}
.sct-focused-ring {
  --tw-ring-color: rgba(var(--set-info-rgb), 0.6);
}
.sct-hover-border:hover {
  border-color: rgba(var(--set-info-rgb), 0.5);
}
.sct-text-muted {
  color: var(--set-text-secondary, rgba(255, 255, 255, 0.55));
}
.sct-text-info {
  color: var(--set-info, var(--hos-color-info-text));
}
.sct-live-bg {
  background: rgba(var(--set-danger-rgb), 0.9);
}

/* 整格选中按钮：透明覆盖层，保持「点整格即选中」的既有行为 */
.sct-select-layer {
  position: absolute;
  inset: 0;
  z-index: 1;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.sct-select-layer:focus-visible {
  outline: 2px solid rgba(var(--set-info-rgb), 0.85);
  outline-offset: -3px;
  border-radius: inherit;
}

/* 名称条与直播徽标是装饰层：z-index 抬到按钮之上只影响绘制，点击仍穿透到按钮 */
.sct-name-bar {
  z-index: 2;
  pointer-events: none;
}
.sct-name-bar > span {
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
/* 触屏没有 hover：只在真有指针悬停能力时才挂 hover 规则，避免「点了之后卡住显示」 */
@media (hover: hover) {
  .security-camera-tile:hover .sct-name-bar {
    opacity: 1;
  }
}
/* 键盘用户靠这一条：焦点进到整格按钮 / 占位按钮时同样显示名称 */
.security-camera-tile:focus-within .sct-name-bar {
  opacity: 1;
}

/* 占位按钮（点击加载 / 点击重试）：重置原生按钮外观，视觉与改造前的 div 一致 */
.sct-placeholder-btn {
  border: none;
  font: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.sct-placeholder-btn:hover {
  background: #16181d;
}
</style>
