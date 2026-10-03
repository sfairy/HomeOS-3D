/**
 * @file CameraControlPopup.vue
 * @module components/entities/popups
 *
 * 摄像头控制弹窗
 *
 * 职责：
 * - 以门铃弹窗同级尺寸（hos-modal-panel--doorbell）居中展示摄像头画面
 * - 户型图锚点场景：自带 Teleport + 遮罩，页面居中
 * - EntityControlHost 居中场景：仅渲染面板，由宿主提供遮罩与居中
 * - 内嵌 HaCameraStream 实时画面（低延迟优先）
 * - 提供启用/停用（若实体支持）
 */
<template>
  <!-- 户型图等锚点场景：全屏遮罩 + 居中大面板（尺寸对齐门铃弹窗） -->
  <Teleport v-if="!hostCentered" :to="teleportTarget" :disabled="teleportDisabled">
    <div class="hos-modal-root ccp-modal-root" @click.self="emit('close')">
      <div class="hos-modal-backdrop" @click="emit('close')" />
      <div
        ref="panelRef"
        class="hos-modal-panel hos-modal-panel--doorbell hos-modal-panel--pink ccp-panel pointer-events-auto flex flex-col"
        role="dialog"
        aria-modal="true"
        :aria-label="entityName"
        @click.stop
      >
        <CameraControlPopupBody
          v-bind="bodyProps"
          @close="emit('close')"
          @toggle="toggleCamera"
        />
      </div>
    </div>
  </Teleport>

  <!-- 列表/详情宿主已居中：只渲染同尺寸面板 -->
  <div
    v-else
    ref="panelRef"
    class="hos-modal-panel hos-modal-panel--doorbell hos-modal-panel--pink ccp-panel pointer-events-auto flex flex-col"
    role="dialog"
    aria-modal="true"
    :aria-label="entityName"
    @click.stop
  >
    <CameraControlPopupBody
      v-bind="bodyProps"
      @close="emit('close')"
      @toggle="toggleCamera"
    />
  </div>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 CameraControlPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { ref, computed, inject } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { notifyError } from '@/services/notify'
import CameraControlPopupBody from '@/components/entities/popups/CameraControlPopupBody.vue'
import { defineEntityPopupProps, useEntityPopupBase } from '@/composables/entity/useEntityPopupBase'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'

const props = defineProps(defineEntityPopupProps())
const emit = defineEmits(['close'])

/** EntityControlHost 已提供居中遮罩时跳过自建 modal root */
const hostCentered = inject('entityPopupCentered', false)
const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = shellTeleportPending

const panelRef = ref(null)
useFocusTrap(
  panelRef,
  computed(() => true),
)

const es = useEntitiesStore()
const layoutStore = useLayoutStore()
const { liveEntity } = useEntityPopupBase(props)

const haUrl = computed(() => layoutStore.layoutConfig?.haConfig?.url || '')

const entityName = computed(() =>
  getEntityDisplayName(liveEntity.value?.entity_id ?? '', liveEntity.value),
)
const s = computed(() => liveEntity.value?.state)
const isStreaming = computed(() => s.value === 'streaming')
const isRecording = computed(() => s.value === 'recording')
const isActive = computed(() => isStreaming.value || isRecording.value)
/** 弹窗即实时预览：关闭态除外统一显示「实时」 */
const stateLabel = computed(() => (s.value === 'off' ? '已关闭' : '实时'))
const isLiveStatus = computed(() => s.value !== 'off')

const canToggleCamera = computed(() => {
  const sf = liveEntity.value?.attributes?.supported_features
  if (typeof sf === 'number') return (sf & 1) !== 0
  return ['on', 'off', 'idle', 'streaming', 'recording'].includes(s.value)
})

const bodyProps = computed(() => ({
  entityName: entityName.value,
  stateLabel: stateLabel.value,
  isLiveStatus: isLiveStatus.value,
  isActive: isActive.value,
  liveEntity: liveEntity.value,
  haUrl: haUrl.value,
  canToggleCamera: canToggleCamera.value,
}))

async function toggleCamera() {
  const svc = isActive.value ? 'turn_off' : 'turn_on'
  try {
    await es.callService('camera', svc, liveEntity.value.entity_id)
  } catch (e) {
    notifyError(e, '摄像头操作')
  }
}
</script>

<style>
.ccp-panel {
  overflow: hidden;
}
</style>
