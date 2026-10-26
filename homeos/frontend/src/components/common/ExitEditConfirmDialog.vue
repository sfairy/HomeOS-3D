<template>
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="hos-modal">
      <div
        v-if="layoutStore.showExitEditConfirm"
        ref="rootRef"
        class="hos-modal-root"
        @click.self="layoutStore.cancelExitEditMode()"
      >
        <div class="hos-modal-backdrop" />

        <!-- alertdialog 而不是 dialog：这是「继续就会丢数据」的确认框，读屏应立刻打断当前播报。 -->
        <div
          ref="panelRef"
          class="hos-modal-panel hos-modal-panel--sm hos-modal-panel--amber"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="exit-edit-title"
          aria-describedby="exit-edit-desc"
        >
          <!-- 头部：警告图标、标题、说明 -->
          <div class="hos-modal-head hos-modal-head--center">
            <div class="hos-modal-head-icon hos-modal-head-icon--round" aria-hidden="true">⚠️</div>

            <h3 id="exit-edit-title" class="hos-modal-title">{{ '有未保存的更改' }}</h3>

            <p id="exit-edit-desc" class="hos-modal-subtitle">
              {{ '退出编辑模式将丢失当前所有热区与坐标修改，是否继续？' }}
            </p>
          </div>

          <!-- 底部：留在编辑 / 放弃修改 -->
          <div class="hos-modal-footer hos-modal-footer--center hos-modal-footer--split">
            <button
              type="button"
              class="hos-modal-btn hos-modal-btn--ghost"
              @click="layoutStore.cancelExitEditMode()"
            >
              {{ '留在编辑模式' }}
            </button>

            <button
              type="button"
              class="hos-modal-btn hos-modal-btn--danger"
              @click="layoutStore.confirmExitEditMode()"
            >
              {{ '放弃修改并退出' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/** 避免误触退出导致修改丢失。 */
import { computed, ref } from 'vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'
import { useEscLayer } from '@/composables/ui/useEscStack'
import { useBackgroundInert } from '@/composables/ui/useBackgroundInert'
import { useBodyScrollLock } from '@/composables/ui/useBodyScrollLock'
const layoutStore = useLayoutStore()
const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = shellTeleportPending

const rootRef = ref(null)
const panelRef = ref(null)
/** 浮层可见性：焦点陷阱 / Esc 层级 / 背景隔离 / 滚动锁共用同一判据。 */
const isActive = computed(() => !!layoutStore.showExitEditConfirm)

useFocusTrap(panelRef, isActive)
// Esc = 留在编辑模式（保守选择）：这个弹窗的存在意义就是「别把改动弄丢」，
// 让 Esc 走「放弃修改」会与用户意图相反。
useEscLayer(isActive, '退出编辑确认', () => layoutStore.cancelExitEditMode())
useBackgroundInert(rootRef, isActive, '退出编辑确认')
useBodyScrollLock(isActive, '退出编辑确认')
</script>
