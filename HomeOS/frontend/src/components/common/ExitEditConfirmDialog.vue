<template>
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="hos-modal">
      <div
        v-if="layoutStore.showExitEditConfirm"
        class="hos-modal-root"
        @click.self="layoutStore.cancelExitEditMode()"
      >
        <!-- 背景遮罩 -->
        <div class="hos-modal-backdrop" />

        <div class="hos-modal-panel hos-modal-panel--sm hos-modal-panel--amber">
          <!-- 头部：警告图标、标题、说明 -->
          <div class="hos-modal-head hos-modal-head--center">
            <div class="hos-modal-head-icon hos-modal-head-icon--round">⚠️</div>

            <h3 class="hos-modal-title">{{ '有未保存的更改' }}</h3>

            <p class="hos-modal-subtitle">
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
/**
 * @file ExitEditConfirmDialog.vue
 * @module common/ExitEditConfirmDialog
 * @description 退出编辑模式确认弹窗
 *  职责：当用户在编辑模式中存在未保存的热区/坐标修改时，弹出二次确认，
 *    避免误触退出导致修改丢失。
 *  依赖：stores/layout.store（showExitEditConfirm / cancelExitEditMode / confirmExitEditMode）。
 */
import { useLayoutStore } from '@/stores/layout.store'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
const layoutStore = useLayoutStore()
const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = shellTeleportPending
</script>