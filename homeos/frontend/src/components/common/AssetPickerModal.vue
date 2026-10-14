<template>
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="hos-modal">
      <div v-if="isOpen" ref="rootRef" class="hos-modal-root">
        <div class="hos-modal-backdrop" @click="$emit('close')" />
        <div
          ref="panelRef"
          class="hos-modal-panel hos-modal-panel--lg"
          role="dialog"
          aria-modal="true"
          aria-labelledby="asset-picker-title"
        >
          <!-- 头部 -->
          <div class="hos-modal-head">
            <div class="hos-modal-head-left">
              <div
                class="hos-modal-head-icon"
                :class="
                  type === 'icon' ? 'hos-modal-head-icon--accent' : 'hos-modal-head-icon--blue'
                "
              >
                <Images v-if="type !== 'icon'" class="w-5 h-5" />
                <Sparkles v-else class="w-5 h-5" />
              </div>
              <div>
                <h3 id="asset-picker-title" class="hos-modal-title">{{
                  type === 'icon' ? '图标拾取器' : type === 'background' ? '背景图拾取器' : '素材拾取器'
                }}</h3>
                <p class="hos-modal-subtitle">
                  {{
                    type === 'icon'
                      ? '从 icons 目录点选 SVG 状态图标'
                      : type === 'background'
                        ? '浏览并点选仪表盘背景图素材'
                        : '浏览并点选您想要配置的素材文件'
                  }}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <!-- 已选数量徽标 -->
              <span v-if="selectedCount > 0" class="selected-badge">
                {{ `已选 ${selectedCount} 项` }}
              </span>
              <button
                type="button"
                class="hos-modal-close"
                :aria-label="'关闭'"
                @click="$emit('close')"
              >
                <X class="w-5 h-5" />
              </button>
            </div>
          </div>

          <!-- 主体 -->
          <div class="hos-modal-body hos-modal-body--flush hos-modal-body--no-scroll picker-body">
            <AssetManager
              v-if="isOpen"
              ref="assetManagerRef"
              :is-picker="true"
              :type="type"
              @select="onSelect"
            />
          </div>

          <!-- 底部提示 -->
          <div class="hos-modal-footer picker-footer">
            <div class="picker-footer-hint">
              <MousePointer2 class="w-4 h-4" />
              <span>{{
                type === 'icon' ? '选择一个 SVG 图标来更新状态' : '选择图片自动填充路径'
              }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/** - 以模态形式承载 AssetManager（拾取器模式）； */
import { ref, computed, defineAsyncComponent, watch } from 'vue'
import { X, Images, Sparkles, MousePointer2 } from '@lucide/vue'
import { useKeepAliveGate } from '@/composables/ui/useKeepAliveGate'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'
import { useEscLayer } from '@/composables/ui/useEscStack'
import { useBackgroundInert } from '@/composables/ui/useBackgroundInert'
import { useBodyScrollLock } from '@/composables/ui/useBodyScrollLock'

// 异步加载 AssetManager，避免首屏打包体积过大
const AssetManager = defineAsyncComponent(() => import('@/components/common/AssetManager.vue'))
const props = defineProps({
  /** 是否打开 */
  isOpen: { type: Boolean },
  /** 资源类型：'icon' 拾取图标，其它拾取素材图片 */
  type: { default: 'background' },
})

const emit = defineEmits(['close', 'select'])
const { teleportDisabled: keepAliveTeleportDisabled } = useKeepAliveGate()
const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = computed(
  () => keepAliveTeleportDisabled.value || shellTeleportPending.value,
)

watch(keepAliveTeleportDisabled, (disabled) => {
  if (disabled && props.isOpen) emit('close')
})

/** 浮层最外层节点与面板：焦点陷阱管面板，背景隔离要的是整层（含背板）。 */
const rootRef = ref(null)
const panelRef = ref(null)
/** 浮层可见性：焦点陷阱 / Esc 层级 / 背景隔离 / 滚动锁共用同一判据。 */
const isActive = computed(() => !!props.isOpen)

useFocusTrap(panelRef, isActive)
// Esc 关掉拾取器：它是「选素材」的中途步骤，取消入口只有右上角那个关闭按钮。
useEscLayer(isActive, '素材拾取器', () => emit('close'))
useBackgroundInert(rootRef, isActive, '素材拾取器')
useBodyScrollLock(isActive, '素材拾取器')

/** 已选项目数量（每次 AssetManager 触发 select 时累加） */
const selectedCount = ref(0)
/** AssetManager 组件实例引用 */
const assetManagerRef = ref(null)

/**
 * 拾取回调：累加已选计数并向上 emit select 事件
 * @param {*} value 选中的资源值（路径或对象）
 */
function onSelect(value) {
  selectedCount.value++
  emit('select', value)
}
</script>

<style scoped src="./styles/AssetPickerModal.css"></style>