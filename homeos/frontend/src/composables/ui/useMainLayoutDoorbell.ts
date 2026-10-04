/**
 * @file useMainLayoutDoorbell.ts
 * @module composables/ui
 * @description 主布局门铃（Doorbell）状态聚合 composable。
 *
 * 职责：
 * - 解析当前布局配置中的门铃路由（摄像头/触发器/锁实体）；
 * - 监听门铃触发实体状态变化（普通 on/off 触发器与瞬时触发器 button/input_button）；
 * - 在检测到门铃触发时弹出全屏门铃模态框，并触发触觉反馈；
 * - 维护“已忽略”“已响铃”“已稳定”等集合，避免重复弹窗或漏报。
 *
 * 依赖：
 * - vue（computed/ref/watch/onMounted/onUnmounted）
 * - @homeos/shared（getEntityDomain 取实体 domain）
 * - haptics.util（触觉反馈）
 * - doorbell.util（解析门铃路由配置）
 * - entities.store / layout.store（布局）/ chrome.store（门铃模态）
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import { hapticAlert } from '@/utils/ui/haptics.util'
import { resolveDoorbellRoutes } from '@/utils/layout/doorbell.util'
import type { useEntitiesStore } from '@/stores/entities.store'
import type { useLayoutStore } from '@/stores/layout.store'
import type { useChromeStore } from '@/stores/chrome.store'

/**
 * 判断实体是否为“瞬时触发器”。
 * button / input_button 的状态为上次按下时间戳，没有 on/off 状态，
 * 因此通过对比前后状态值的变化来判定是否被按下。
 *
 * @param entityId 实体 ID（如 button.front_door）
 * @returns 是否为瞬时触发器
 */
function isMomentaryTrigger(entityId: string) {
  const domain = getEntityDomain(entityId)
  return domain === 'button' || domain === 'input_button'
}

/**
 * 判断瞬时触发器的状态值是否可用（非 unknown/unavailable/null）。
 * 只有可用状态才有意义参与“前后变化”比对。
 *
 * @param state 实体当前 state
 * @returns 状态值是否可参与比对
 */
function isUsableMomentaryState(state: string | null | undefined) {
  return state != null && state !== 'unknown' && state !== 'unavailable'
}

/**
 * 门铃布局 composable：聚合当前活跃门铃的摄像头/触发器/锁实体 ID 与显示标签。
 *
 * 调用场景：主布局组件在初始化时调用，监听门铃触发并联动 UI 模态框。
 *
 * @param options.layoutStore 布局 store（仅 layoutConfig）
 * @param options.chrome chrome store（门铃模态开关）
 * @param options.entitiesStore 实体 store（读取门铃触发实体状态）
 * @returns 门铃相关计算属性：摄像头/触发器/锁 ID 与标签
 */
export function useMainLayoutDoorbell(options: {
  layoutStore: Pick<ReturnType<typeof useLayoutStore>, 'layoutConfig'>
  chrome: Pick<
    ReturnType<typeof useChromeStore>,
    'isDoorbellModalOpen' | 'openDoorbellModal' | 'closeDoorbellModal'
  >
  entitiesStore: ReturnType<typeof useEntitiesStore>
}) {
  const { layoutStore, chrome, entitiesStore } = options
  // 当前布局配置解析出的所有门铃路由（按配置顺序）
  const doorbellRoutes = computed(() =>
    resolveDoorbellRoutes(layoutStore.layoutConfig.haConfig),
  )
  // 当前活跃的门铃路由（被触发的那一个），未触发时为 null
  const activeDoorbell = ref<ReturnType<typeof resolveDoorbellRoutes>[number] | null>(null)
  // 通知点击指定的摄像头覆盖（优先于门铃路由）；空串表示无覆盖
  const overrideCameraId = ref<string>('')
  // 门铃摄像头实体 ID：优先取通知覆盖，其次活跃门铃，最后回退到第一个路由
  const doorbellCameraId = computed(
    () =>
      overrideCameraId.value ||
      activeDoorbell.value?.cameraEntityId ||
      doorbellRoutes.value[0]?.cameraEntityId ||
      null,
  )
  // 门铃触发器实体 ID：通知覆盖场景无触发器（关闭弹窗时无需复位实体）
  const doorbellTriggerEntityId = computed(() =>
    overrideCameraId.value
      ? null
      : activeDoorbell.value?.triggerEntityId || doorbellRoutes.value[0]?.triggerEntityId || null,
  )
  // 门铃锁实体 ID：优先取活跃门铃，否则回退到第一个路由（可能为空字符串）
  const doorbellLockEntityId = computed(
    () => activeDoorbell.value?.lockEntityId || doorbellRoutes.value[0]?.lockEntityId || '',
  )
  // 当前活跃门铃的显示标签；通知覆盖场景不传 label，交由弹窗按实体名展示
  const doorbellLabel = computed(() =>
    overrideCameraId.value ? '' : activeDoorbell.value?.label || '',
  )
  // 已经“稳定”过的触发器 ID 集合：状态从 on 回到 off 后才认为稳定，避免初始化时即 on 的误报
  const seenSettledIds = new Set<string>()
  // 当前处于 on 状态的门铃触发器集合
  const ringingDoorbellIds = new Set<string>()
  /** 用户手动关闭后忽略，直到触发器重新空闲/再次按下 */
  const dismissedIds = new Set<string>()
  // 瞬时触发器上一帧状态值，用于检测按下事件（状态变化即视为按下）
  const prevMomentaryStates = new Map<string, string | undefined>()
  // 上一帧模态框是否打开，用于检测“由开到关”的边沿
  const wasModalOpen = ref(false)

  // 监听模态框关闭事件：用户主动关闭后，将该门铃加入 dismissedIds，避免持续 on 状态反复弹窗
  watch(
    () => chrome.isDoorbellModalOpen,
    (open) => {
      if (wasModalOpen.value && !open) {
        const id = activeDoorbell.value?.triggerEntityId
        if (id) dismissedIds.add(id)
      }
      wasModalOpen.value = open
      // 弹窗关闭后清空通知覆盖，恢复门铃路由驱动的摄像头
      if (!open) overrideCameraId.value = ''
    },
  )

  // 监听所有门铃触发器状态拼接串的变化（任一状态变化都会触发）
  watch(
    () =>
      doorbellRoutes.value
        .map((d) => `${d.triggerEntityId}:${entitiesStore.entities[d.triggerEntityId]?.state}`)
        .join('|'),
    () => {
      const onIds = new Set<string>()
      let momentaryHit: (typeof doorbellRoutes.value)[number] | null = null

      for (const d of doorbellRoutes.value) {
        const id = d.triggerEntityId
        const state = entitiesStore.entities[id]?.state

        if (isMomentaryTrigger(id)) {
          // 瞬时触发器：状态值变化即视为按下事件
          const prev = prevMomentaryStates.get(id)
          if (
            isUsableMomentaryState(state) &&
            prev !== undefined &&
            prev !== state
          ) {
            // 新按下：清除 dismissed，使该门铃可以再次弹窗
            dismissedIds.delete(id)
            if (!momentaryHit) momentaryHit = d
          }
          prevMomentaryStates.set(id, state)
          continue
        }

        // 普通触发器：on 表示门铃被按下，off/其他表示空闲
        if (state === 'on') {
          onIds.add(id)
        } else if (state != null) {
          // 状态回到非 on：清除 dismissed 并标记为已稳定
          dismissedIds.delete(id)
          seenSettledIds.add(id)
        }
      }

      // 清理已不在配置中的瞬时触发器历史状态，避免内存泄漏
      for (const id of [...prevMomentaryStates.keys()]) {
        if (!doorbellRoutes.value.some((d) => d.triggerEntityId === id)) {
          prevMomentaryStates.delete(id)
        }
      }

      // 查找新触发的普通门铃：on 且曾经稳定过，且未在响铃中，且未被忽略
      const newlyOn = doorbellRoutes.value.find(
        (d) =>
          onIds.has(d.triggerEntityId) &&
          seenSettledIds.has(d.triggerEntityId) &&
          !ringingDoorbellIds.has(d.triggerEntityId) &&
          !dismissedIds.has(d.triggerEntityId),
      )
      // 优先使用瞬时触发命中，否则使用普通 on 命中
      const newlyFiring =
        (momentaryHit && !dismissedIds.has(momentaryHit.triggerEntityId) ? momentaryHit : null) ||
        newlyOn

      if (newlyFiring) {
        activeDoorbell.value = newlyFiring
        if (!chrome.isDoorbellModalOpen) {
          // 触觉反馈 + 打开门铃模态框
          hapticAlert()
          chrome.openDoorbellModal()
        }
      } else if (chrome.isDoorbellModalOpen && onIds.size === 0) {
        // 所有门铃已恢复空闲：关闭模态框（但瞬时触发器保持打开由 dismiss 控制）
        const activeId = activeDoorbell.value?.triggerEntityId
        if (!activeId || !isMomentaryTrigger(activeId)) {
          chrome.closeDoorbellModal()
          activeDoorbell.value = null
        }
      }

      // 更新当前响铃集合为本帧的所有 on 状态门铃
      ringingDoorbellIds.clear()
      onIds.forEach((id) => ringingDoorbellIds.add(id))
    },
    { immediate: true },
  )

  // 监听原生（iOS/Android 伴侣端）派发的打开摄像头事件，弹出实时画面
  function onOpenCamera(e: Event) {
    const detail = (e as CustomEvent)?.detail
    const cameraId = String(detail?.cameraEntityId || '').trim()
    if (!cameraId) return
    overrideCameraId.value = cameraId
    if (!chrome.isDoorbellModalOpen) chrome.openDoorbellModal()
  }

  onMounted(() => window.addEventListener('homeos:open-camera', onOpenCamera))
  onUnmounted(() => window.removeEventListener('homeos:open-camera', onOpenCamera))

  return {
    doorbellCameraId,
    doorbellTriggerEntityId,
    doorbellLockEntityId,
    doorbellLabel,
  }
}
