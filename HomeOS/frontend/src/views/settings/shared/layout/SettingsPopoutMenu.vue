<!--
组件：SettingsPopoutMenu.vue
所属模块：frontend / src / views / settings / shared / layout
职责：设置页弹出菜单。将内容 teleport 到 shell 容器，支持动态定位（防溢出/翻转/钳制）、
      点击外部收起、keep-alive 期间禁用 teleport。用于设置页二级弹出面板。
Props：
  - modelValue：是否展开
  - width / maxHeight / align：尺寸与对齐
Emits：
  - update:modelValue：展开/收起变更
关键依赖：
  - usePopupPosition：弹出定位计算
  - useKeepAliveGate / useExclusiveDropdown / useShellTeleportTarget：keep-alive 与互斥弹出
数据来源：父级透传的 props 与默认插槽内容
-->
<template>
  <div class="settings-popout-wrap">
    <div ref="triggerRef" class="settings-popout-trigger" @click.stop="toggle">
      <slot name="trigger" :open="open" />
    </div>

    <Teleport :to="teleportTarget" :disabled="teleportDisabled">
      <Transition name="settings-popout-fade">
        <div v-if="open" class="settings-popout-backdrop-layer" aria-hidden="true" @click="close" />
      </Transition>
      <Transition :name="dropTransition">
        <div
          v-if="open"
          ref="menuRef"
          class="settings-popout-menu-panel"
          :class="{ 'settings-popout-menu-panel--top': menuPlacement === 'top' }"
          :style="menuStyle"
          role="menu"
        >
          <slot />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  rectToDropdownPosition,
  buildDropdownFixedStyle,
  viewportPointToPopupAnchor,
} from '@/composables/ui/usePopupPosition'
import { useKeepAliveGate } from '@/composables/ui/useKeepAliveGate'
import { useExclusiveDropdown } from '@/composables/ui/useExclusiveDropdown'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
import { getTeleportContainerSize } from '@/utils/ui/popup-position-shared.util'
import { clampNum as clamp } from '@/utils/core/misc.util'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  width: { type: Number, default: 224 },
  maxHeight: { type: Number, default: 384 },
  align: { type: String, default: 'end' },
})

const emit = defineEmits(['update:modelValue'])
const { teleportDisabled: keepAliveTeleportDisabled } = useKeepAliveGate()
const { teleportTarget, shellTeleportPending, refreshShellTeleport } = useShellTeleportTarget()
const teleportDisabled = computed(
  () => keepAliveTeleportDisabled.value || shellTeleportPending.value,
)

const triggerRef = ref(null)
const menuRef = ref(null)
const menuPos = ref({
  left: 0,
  top: 0,
  bottom: null,
  width: 0,
  maxHeight: 384,
  placement: 'bottom',
})
const menuPlacement = ref('bottom')

const open = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

useExclusiveDropdown(open)

watch(keepAliveTeleportDisabled, (disabled) => {
  if (disabled && open.value) open.value = false
})

const menuStyle = computed(() => ({
  ...buildDropdownFixedStyle(menuPos.value),
  width: `${props.width}px`,
}))

const dropTransition = computed(() =>
  menuPlacement.value === 'top' ? 'settings-popout-drop-up' : 'settings-popout-drop',
)

function updatePosition() {
  const trigger = triggerRef.value
  if (!trigger) return

  const rect = trigger.getBoundingClientRect()
  const margin = 12
  const gap = 8
  const estimatedHeight = Math.min(menuRef.value?.offsetHeight || props.maxHeight, props.maxHeight)

  const pos = rectToDropdownPosition(rect, gap, props.width, {
    estimatedHeight,
    margin,
    chromeHeight: 0,
    minListHeight: 120,
  })

  const { cw } = getTeleportContainerSize()
  const { anchorX: anchorLeft } = viewportPointToPopupAnchor(rect.left, rect.top)
  const { anchorX: anchorRight } = viewportPointToPopupAnchor(rect.right, rect.top)
  let left = props.align === 'end' ? anchorRight - props.width : anchorLeft
  left = clamp(left, margin, Math.max(margin, cw - props.width - margin))

  menuPlacement.value = pos.placement
  menuPos.value = { ...pos, left, width: props.width }
}

function scheduleUpdate() {
  updatePosition()
  nextTick(() => {
    updatePosition()
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(updatePosition)
    }
  })
}

function openMenu() {
  refreshShellTeleport()
  open.value = true
  scheduleUpdate()
}

function close() {
  open.value = false
}

function toggle() {
  if (open.value) close()
  else openMenu()
}

function onViewportChange() {
  if (!open.value) return
  scheduleUpdate()
}

function onScrollCapture(event) {
  if (!open.value) return
  // 菜单内部滚动（如 VirtualList）不触发重定位
  if (menuRef.value && menuRef.value.contains(event.target)) return
  scheduleUpdate()
}

watch(open, (isOpen) => {
  if (isOpen) {
    refreshShellTeleport()
    scheduleUpdate()
  }
})

onMounted(() => {
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onScrollCapture, true)
  window.visualViewport?.addEventListener('resize', onViewportChange)
  window.visualViewport?.addEventListener('scroll', onViewportChange)
})

onUnmounted(() => {
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onScrollCapture, true)
  window.visualViewport?.removeEventListener('resize', onViewportChange)
  window.visualViewport?.removeEventListener('scroll', onViewportChange)
})
</script>

<style src="./styles/SettingsPopoutMenu.css"></style>
