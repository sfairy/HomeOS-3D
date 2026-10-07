<template>
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="hos-modal">
      <div v-if="isOpen" class="hos-modal-root">
        <!-- 背景遮罩，点击关闭 -->
        <div class="hos-modal-backdrop" @click="$emit('close')" />
        <div class="hos-modal-panel hos-modal-panel--lg hos-modal-panel--asset">
          <!-- 头部：图标 + 标题/副标题 + 关闭按钮 -->
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
                <h3 class="hos-modal-title">{{ title }}</h3>
                <p v-if="description" class="hos-modal-subtitle">{{ description }}</p>
              </div>
            </div>
            <button type="button" class="hos-modal-close" aria-label="关闭" @click="$emit('close')">
              <X class="w-5 h-5" />
            </button>
          </div>

          <!-- 主体：异步加载的 AssetManager（非拾取器模式） -->
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

<script setup>
/**
 * @file AssetManagerModal.vue
 * @module common/AssetManagerModal
 * @description 资源管理器模态弹窗
 *  职责：以模态形式承载 AssetManager，用于在设置页等场景中浏览/管理素材与图标。
 *  依赖：vue defineAsyncComponent/watch，@lucide/vue 图标，useKeepAliveGate 控制传送门。
 *  注意：AssetManager 以异步组件方式引入，降低首屏体积；开启 keep-alive 网关时关闭弹窗。
 */
import { defineAsyncComponent, computed, watch } from 'vue'
import { X, Images, Sparkles } from '@lucide/vue'
import { useKeepAliveGate } from '@/composables/ui/useKeepAliveGate'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'

// 异步加载 AssetManager，避免首屏打包体积过大
const AssetManager = defineAsyncComponent(() => import('@/components/common/AssetManager.vue'))

const props = defineProps({
  /** 是否打开 */
  isOpen: { type: Boolean, default: false },
  /** 资源类型：'icon' / 'background' */
  type: { type: String, default: 'background' },
  /** 弹窗标题 */
  title: { type: String, required: true },
  /** 副标题描述 */
  description: { type: String, default: '' },
})

const emit = defineEmits(['close'])
const { teleportDisabled: keepAliveTeleportDisabled } = useKeepAliveGate()
const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = computed(
  () => keepAliveTeleportDisabled.value || shellTeleportPending.value,
)

watch(keepAliveTeleportDisabled, (disabled) => {
  if (disabled && props.isOpen) emit('close')
})
</script>

<style scoped src="./asset-manager/styles/asset-manager.css"></style>