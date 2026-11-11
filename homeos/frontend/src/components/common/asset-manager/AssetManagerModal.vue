<template>
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="hos-modal">
      <div v-if="isOpen" ref="rootRef" class="hos-modal-root">
        <div class="hos-modal-backdrop" @click="$emit('close')" />
        <div
          ref="panelRef"
          class="hos-modal-panel hos-modal-panel--lg hos-modal-panel--asset"
          role="dialog"
          aria-modal="true"
          aria-labelledby="asset-manager-title"
        >
          <div class="hos-modal-head">
            <div class="hos-modal-head-left">
              <div
                class="hos-modal-head-icon"
                :class="
                  type === 'icon' ? 'hos-modal-head-icon--accent' : 'hos-modal-head-icon--blue'
                "
              >
                <Sparkles v-if="type === 'icon'" class="w-5 h-5" />
                <Images v-else class="w-5 h-5" />
              </div>
              <div>
                <h3 id="asset-manager-title" class="hos-modal-title">{{ title }}</h3>
                <p v-if="description" class="hos-modal-subtitle">{{ description }}</p>
              </div>
            </div>
            <button type="button" class="hos-modal-close" aria-label="关闭" @click="$emit('close')">
              <X class="w-5 h-5" />
            </button>
          </div>

          <div
            class="hos-modal-body hos-modal-body--flush hos-modal-body--no-scroll asset-manager-modal__body"
          >
            <AssetManager v-if="isOpen" :type="type" :is-picker="false" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { defineAsyncComponent, computed, ref, watch } from 'vue'
import { X, Images, Sparkles } from '@lucide/vue'
import { useKeepAliveGate } from '@/composables/ui/useKeepAliveGate'
import { useShellTeleportTarget } from '@/composables/ui/shell/useShellTeleportTarget'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'
import { useEscLayer } from '@/composables/ui/useEscStack'
import { useBackgroundInert } from '@/composables/ui/useBackgroundInert'
import { useBodyScrollLock } from '@/composables/ui/useBodyScrollLock'

// 异步加载 AssetManager，避免首屏打包体积过大
const AssetManager = defineAsyncComponent(() => import('@/components/common/asset-manager/AssetManager.vue'))

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  /** 资源类型：'icon' / 'background' */
  type: { type: String, default: 'background' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
})

const emit = defineEmits(['close'])
const { teleportDisabled: keepAliveTeleportDisabled } = useKeepAliveGate()
const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = computed(() => keepAliveTeleportDisabled.value || shellTeleportPending.value)

// keep-alive 网关把宿主页冻结成快照时，弹窗的 Teleport 目标会失效：直接关闭，避免挂在失效节点上。
watch(keepAliveTeleportDisabled, (disabled) => {
  if (disabled && props.isOpen) emit('close')
})

/** 浮层最外层节点与面板：焦点陷阱管面板，背景隔离要的是整层（含背板）。 */
const rootRef = ref(null)
const panelRef = ref(null)
/** 浮层可见性：焦点陷阱 / Esc 层级 / 背景隔离 / 滚动锁共用同一判据。 */
const isActive = computed(() => !!props.isOpen)

useFocusTrap(panelRef, isActive)
// Esc 关掉素材管理器：它是一个独立的全屏工作区，没有 Esc 就只能点右上角关闭。
useEscLayer(isActive, '素材管理器', () => emit('close'))
useBackgroundInert(rootRef, isActive, '素材管理器')
useBodyScrollLock(isActive, '素材管理器')
</script>

<style scoped src="./styles/asset-manager.css"></style>