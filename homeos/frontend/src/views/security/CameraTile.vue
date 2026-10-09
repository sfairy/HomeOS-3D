<!--
组件：SecurityCameraTile.vue
所属模块：frontend / src / views / security
职责：安防监控「单格摄像头」组件。按需挂载 HaCameraStream 实时流，并通过
      IntersectionObserver 仅在视口内拉流；流失败时显示重试占位。
关键依赖：
  - HaCameraStream：HA 摄像头实时流（HLS → MJPEG → 快照，与 3D 总览同序）
  - useEntitiesStore：读取 camera 实体与域级 epoch（驱动显示名/快照刷新）
  - getEntityDisplayName：从实体派生可读名称
数据来源：entitiesStore 中的 camera 实体、父级透传的 camId / streamErrors / activeSlot
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
    @click="emit('select', camId)"
  >
    <HaCameraStream
      v-if="active && entity && !streamErrors[camId]"
      :entity="entity"
      :ha-url="haUrl"
      :active="active"
      :prefer-webrtc="preferWebrtc"
      object-fit="cover"
      @error="emit('stream-error', camId)"
    />
    <div
      v-else-if="!active || streamErrors[camId]"
      class="w-full h-full flex flex-col items-center justify-center gap-1 bg-[#111] text-[12px] sct-text-muted"
      @click.stop="emit('retry', camId)"
    >
      <template v-if="streamErrors[camId]"
        >{{ '流离线' }} <span class="text-[12px] sct-text-info">{{ '点击重试' }}</span></template
      >
      <template v-else>{{ '点击加载' }}</template>
    </div>
    <div
      class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-4 opacity-0 hover:opacity-100 transition-opacity"
    >
      <span class="text-xs text-white font-bold">{{ cameraName }}</span>
    </div>
    <div
      v-if="active && entity && !streamErrors[camId]"
      class="absolute top-4 left-4 px-3 py-1 rounded-full sct-live-bg text-[12px] font-bold text-white uppercase tracking-widest shadow-lg"
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
import { getEntityDisplayName } from '@/utils/entity/derived.util'

// 多路网格默认最多 2 路实时流（WebRTC/HLS），超出部分仅快照占位，避免平板/HA 过载
const GRID_MAX_ACTIVE = 2

// 入参：摄像头实体 ID、HA 地址、流错误映射、网格槽位、聚焦态、是否启用拉流、是否优先 WebRTC
const props = defineProps({
  camId: { type: String, required: true },
  haUrl: { type: String, default: '' },
  streamErrors: { type: Object, required: true },
  activeSlot: { type: Number, default: -1 },
  focused: { type: Boolean, default: false },
  streamsEnabled: { type: Boolean, default: true },
  /** 与 0.7.2 / 3D 一致：默认关 WebRTC，走 HLS → MJPEG → 快照 */
  preferWebrtc: { type: Boolean, default: false },
})

// 对外事件：选中摄像头、流错误、重试流、可见性变化（供父级调度同时拉流的槽位）
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
const cameraName = computed(() => {
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
  border-color: var(--set-info, #7dd3fc);
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
  color: var(--set-info, #7dd3fc);
}
.sct-live-bg {
  background: rgba(var(--set-danger-rgb), 0.9);
}
</style>
