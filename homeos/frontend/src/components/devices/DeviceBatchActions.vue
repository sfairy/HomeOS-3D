<!--
  @file DeviceBatchActions.vue
  @module 设备列表/批量操作工具栏
  @description 设备列表选中设备后浮现的批量操作工具栏：展示已选数量、批量开关、移动到房间、复制 ID。
               仅 admin/adult 角色可移动设备到房间。批量开关按域分发 HA 服务（cover/lock/其余域），
               并对不可控、离线、无权限设备分别计数跳过。移动房间通过 batchAssignEntityArea API 提交。
  @dependencies vue（ref/computed）、@lucide/vue、entities.store、auth.store、chrome.store、
                useAreaOptions、copyTextWithNotify、batchAssignEntityArea API。
-->
<template>
  <div class="device-batch premium-backdrop" v-if="selectedIds.length > 0">
    <!-- 工具栏头部：已选数量与清除按钮 -->
    <div class="device-batch__header">
      <div class="device-batch__select-info">
        <CheckSquare class="w-4 h-4 dba-icon-info" />
        <span>{{ '已选择 {n} 个设备'.replace('{n}', String(selectedIds.length)) }}</span>
      </div>
      <button
        type="button"
        class="device-batch__clear"
        :aria-label="'清除选择'"
        @click="$emit('clear')"
      >
        <X class="w-3 h-3" />
      </button>
    </div>

    <!-- 批量操作按钮区：批量开关（含可控域时显示）/ 移动到房间（admin/adult）/ 复制 ID -->
    <div class="device-batch__actions">
      <button
        v-if="hasToggleable"
        type="button"
        class="list-page__btn list-page__btn--primary"
        :disabled="batchLoading"
        @click="handleBatchToggle"
      >
        <Power class="w-3.5 h-3.5" />
        <span>{{ batchLoading ? '操作中…' : '批量开关' }}</span>
      </button>

      <button
        v-if="canMoveToRoom"
        type="button"
        class="list-page__btn"
        :disabled="batchLoading"
        @click="
          () => {
            refreshShellTeleport()
            showMoveModal = true
          }
        "
      >
        <Move class="w-3.5 h-3.5" />
        <span>{{ '移动到房间' }}</span>
      </button>

      <button type="button" class="list-page__btn list-page__btn--ghost" @click="copyIds">
        <Copy class="w-3.5 h-3.5" />
        <span>{{ '复制 ID' }}</span>
      </button>
    </div>

    <Teleport :to="modalTeleportTo" :disabled="teleportDisabled">
      <!-- 移动到房间模态框：Teleport 至缩放画布，与主 UI 同比例 -->
      <div
        v-if="showMoveModal"
        class="device-batch__modal-overlay"
        role="presentation"
        @click="showMoveModal = false"
        @keydown="onMoveModalKeydown"
      >
        <div
          ref="moveModalRef"
          class="device-batch__modal"
          role="dialog"
          aria-modal="true"
          :aria-label="'移动到房间'"
          tabindex="-1"
          @click.stop
        >
          <div class="device-batch__modal-header">
            <span>{{ '移动到房间' }}</span>
            <button
              type="button"
              class="device-batch__modal-close"
              :aria-label="'关闭'"
              @click="showMoveModal = false"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
          <div class="device-batch__modal-body">
            <div class="device-batch__modal-section">
              <span class="device-batch__modal-label">{{ '目标房间' }}</span>
              <div v-if="!batchRoomOptions.length" class="device-batch__empty-hint">
                {{ '暂无可用房间，请检查 HA 区域配置' }}
              </div>
              <div v-else class="device-batch__room-list">
                <button
                  v-for="room in batchRoomOptions"
                  :key="room.id"
                  type="button"
                  :class="[
                    'list-page__chip list-page__chip--btn',
                    selectedRoom === room.id && 'list-page__chip--accent',
                  ]"
                  @click="selectedRoom = room.id"
                >
                  <Home class="w-3.5 h-3.5" />
                  <span>{{ room.name }}</span>
                </button>
              </div>
            </div>
          </div>
          <div class="device-batch__modal-footer">
            <button type="button" class="list-page__btn" @click="showMoveModal = false">
              {{ '取消' }}
            </button>
            <button
              type="button"
              class="list-page__btn list-page__btn--primary"
              :disabled="!selectedRoom || batchLoading"
              @click="handleMoveToRoom"
            >
              <Move class="w-3 h-3" />
              <span>{{ batchLoading ? '移动中…' : '确认移动' }}</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { getEntityDomain } from '@homeos/shared'
import { ref, computed } from 'vue'
import { CheckSquare, X, Power, Move, Copy, Home } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useAreaOptions } from '@/composables/entity/useAreaOptions'
import { copyTextWithNotify } from '@/services/notify'
import { batchAssignEntityArea } from '@/services/api/entities'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'

// 当前选中的实体 ID 数组；为空时整个工具栏不渲染。
const props = defineProps<{
  selectedIds: string[]
}>()

// 清除选择按钮触发的事件。
defineEmits(['clear'])

const { teleportTarget: modalTeleportTo, shellTeleportPending, refreshShellTeleport } =
  useShellTeleportTarget()
const teleportDisabled = shellTeleportPending

// 实体 store：用于批量调用服务、查询实体状态。
const entitiesStore = useEntitiesStore()
// 鉴权 store：用于角色判定与 canControl 权限校验。
const authStore = useAuthStore()
// UI store：用于操作结果 toast 通知。
const chrome = useChromeStore()
// 批量移动可选的房间选项列表。
const { batchRoomOptions } = useAreaOptions()

// 移动房间模态框可见性。
const showMoveModal = ref(false)
const moveModalRef = ref(null)
useFocusTrap(moveModalRef, showMoveModal)
// 模态框中当前选中的目标房间 id。
const selectedRoom = ref('')
// 批量操作进行中标志，用于禁用按钮与展示加载态。
const batchLoading = ref(false)

function onMoveModalKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    ev.preventDefault()
    showMoveModal.value = false
  }
}

// 支持开关切换的域集合；其余域在批量开关时跳过。
const TOGGLE_DOMAINS = new Set(['light', 'switch', 'fan', 'cover', 'lock', 'input_boolean'])

/**
 * 计算属性：选中设备中是否包含可控开关域设备，决定批量开关按钮是否显示。
 */
const hasToggleable = computed(() => {
  return props.selectedIds.some((id) => {
    const domain = getEntityDomain(id)
    return TOGGLE_DOMAINS.has(domain)
  })
})

/**
 * 计算属性：当前角色是否允许移动设备到房间，仅 admin/adult 返回 true。
 */
const canMoveToRoom = computed(() => {
  const role = authStore.role
  return role === 'admin' || role === 'adult'
})

/**
 * 判断实体是否不可用（unavailable/unknown 状态），批量操作时跳过此类实体。
 * @param entityId 实体 ID
 * @returns 是否不可用
 */
function isEntityUnavailable(entityId: string): boolean {
  const state = entitiesStore.entities[entityId]?.state
  return state === 'unavailable' || state === 'unknown'
}

/**
 * 批量开关：遍历选中设备，按域分发 HA 服务。
 * - cover 域根据开/关状态调用 close_cover/open_cover；
 * - lock 域根据锁定状态调用 lock/unlock；
 * - 其余域根据 on/playing 调用 turn_off/turn_on。
 * 不可控域、离线、无权限设备分别计数跳过，最后汇总成功/跳过/失败数并通知。
 */
async function handleBatchToggle() {
  // 预扫描：批量开关中若包含「解锁门锁」方向的操作，属高危，先二次确认
  let pendingUnlocks = 0
  for (const id of props.selectedIds) {
    if (getEntityDomain(id) !== 'lock') continue
    const state = entitiesStore.entities[id]?.state
    if (state && state !== 'unlocked' && state !== 'unavailable' && state !== 'unknown') {
      pendingUnlocks++
    }
  }
  if (pendingUnlocks > 0) {
    const ok = await chrome.confirm(
      `选中设备中包含 ${pendingUnlocks} 把处于锁定状态的门锁，批量操作将解锁它们。解锁后门将可直接打开，确定继续？`,
      '批量解锁确认',
      { type: 'danger', confirmText: '确认解锁' },
    )
    if (!ok) return
  }

  batchLoading.value = true
  let successCount = 0
  let skippedCount = 0
  const errors: string[] = []

  for (const id of props.selectedIds) {
    const domain = getEntityDomain(id)
    if (!TOGGLE_DOMAINS.has(domain)) {
      skippedCount++
      continue
    }

    try {
      await entitiesStore.ensureEntity(id)
      const entity = entitiesStore.entities[id]
      if (!entity) continue
      if (isEntityUnavailable(id)) {
        skippedCount++
        continue
      }
      if (!authStore.canControl(id)) {
        errors.push(id)
        continue
      }

      // 按域决定服务名：cover 与 lock 有独立开/关服务，其余域统一 turn_on/turn_off
      let service: string
      if (domain === 'cover') {
        // cover 域：开启态调用关闭服务，否则调用开启服务
        const openStates = new Set(['open', 'opening'])
        service = openStates.has(entity.state || '') ? 'close_cover' : 'open_cover'
      } else if (domain === 'lock') {
        // lock 域：未锁定调用 lock，已锁定调用 unlock
        service = entity.state === 'unlocked' ? 'lock' : 'unlock'
      } else {
        // 其余域：on/playing 调用 turn_off，否则 turn_on
        const onStates = new Set(['on', 'playing'])
        service = onStates.has(entity.state || '') ? 'turn_off' : 'turn_on'
      }

      await entitiesStore.callService(domain, service, id, null, false)
      successCount++
    } catch {
      errors.push(id)
    }
  }

  batchLoading.value = false

  if (successCount > 0) {
    chrome.notify(`成功操作 ${successCount} 个设备`, 'success')
  }
  if (skippedCount > 0) {
    chrome.notify(`已跳过 ${skippedCount} 个不可切换或离线设备`, 'warning')
  }
  if (errors.length > 0) {
    chrome.notify(`${errors.length} 个设备操作失败或无权限`, 'error')
  }
}

/**
 * 批量移动到房间：调用 batchAssignEntityArea API 提交，成功后通知并关闭模态框。
 * 无权限时直接通知错误。
 */
async function handleMoveToRoom() {
  if (!selectedRoom.value) return
  if (!canMoveToRoom.value) {
    chrome.notify('当前账号无权限移动设备到房间', 'error')
    return
  }

  const areaId = selectedRoom.value
  const roomLabel = batchRoomOptions.value.find((r) => r.id === areaId)?.name || areaId
  batchLoading.value = true
  let successCount = 0

  try {
    const { data } = await batchAssignEntityArea({
      entity_ids: props.selectedIds,
      area_id: areaId,
    })
    successCount = data?.updated ?? 0
  } catch {
    successCount = 0
  }

  batchLoading.value = false
  showMoveModal.value = false
  selectedRoom.value = ''

  if (successCount > 0) {
    chrome.notify(`成功移动 ${successCount} 个设备到「${roomLabel}」`, 'success')
  } else {
    chrome.notify('移动失败，请检查权限或 HA 连接', 'error')
  }
}

/**
 * 复制选中实体 ID 至剪贴板，换行分隔，并通知结果。
 */
async function copyIds() {
  await copyTextWithNotify(props.selectedIds.join('\n'), {
    successMessage: '已复制设备 ID',
    errorMessage: '复制失败',
  })
}
</script>

<style scoped src="./styles/DeviceBatchActions.css"></style>
