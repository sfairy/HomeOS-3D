/**
 * 设置未保存更改管理组合式函数
 * 
 * 职责：统一管理设置页面中各类未保存更改的检测、提示和同步逻辑
 * 依赖：
 *   - @/stores/chrome.store - 确认弹窗、通知
 *   - @/stores/layout.store - 布局配置与保存
 *   - @/types/layout - 布局配置类型
 *   - @/utils/core/count-json-leaf-diff.util - JSON 差异计算
 *   - vue - 响应式系统
 * 
 * 功能模块：
 *   - 全局布局快照管理
 *   - 独立 Tab 未保存状态管理
 *   - Hub 面板未保存检测
 *   - 布局保存/取消同步
 */
import type { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import type { UILayoutConfig } from '@/types/layout'
import { countJsonLeafDiff, countObjectFieldDiff } from '@/utils/core/count-json-leaf-diff.util'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { computed, onMounted, onScopeDispose, reactive, ref, unref, watch } from 'vue'

type UiConfirmNotify = Pick<ReturnType<typeof useChromeStore>, 'confirm' | 'notify'>

// ── settings-pending ──
type LayoutSnapshotFn = (source: unknown) => void
type PauseFn = () => void
type ResumeFn = () => void

let globalLayoutSnapshot: LayoutSnapshotFn | null = null
let globalPause: PauseFn | null = null
let globalResume: ResumeFn | null = null

/**
 * 注册全局布局待更改快照函数
 * 
 * 功能描述：注册一个用于创建布局配置快照的函数，用于后续比较是否有未保存更改。
 * 
 * @param fn - 快照函数，接收当前数据源作为参数
 * @returns 无返回值
 * @调用场景 布局设置面板初始化时调用
 * @副作用 设置全局快照函数引用
 */
export function registerGlobalLayoutPendingSnapshot(fn: LayoutSnapshotFn) {
  globalLayoutSnapshot = fn
}

/**
 * 同步全局布局待更改快照
 * 
 * 功能描述：触发全局快照函数，用当前数据更新快照基线。
 * 
 * @param source - 数据源对象，将被传递给快照函数
 * @returns 无返回值
 * @调用场景 保存成功或取消修改后调用
 * @副作用 更新全局快照基线
 */
export function syncGlobalLayoutPendingSnapshot(source: unknown) {
  globalLayoutSnapshot?.(source)
}

/**
 * 注册全局暂停/恢复函数
 * 
 * 功能描述：注册用于暂停和恢复未保存更改检测的函数对。
 * 
 * @param pause - 暂停检测的函数
 * @param resume - 恢复检测的函数
 * @returns 无返回值
 * @调用场景 初始化时注册暂停/恢复机制
 * @副作用 设置全局暂停/恢复函数引用
 */
export function registerGlobalPendingPause(pause: PauseFn, resume: ResumeFn) {
  globalPause = pause
  globalResume = resume
}

/**
 * 暂停全局未保存更改检测
 * 
 * 功能描述：暂时禁用未保存更改检测，用于初始化或批量更新时避免误报。
 * 
 * @returns 无返回值
 * @调用场景 数据加载、批量更新前调用
 * @副作用 暂停脏数据检测
 */
export function pauseGlobalPendingChanges() {
  globalPause?.()
}

/**
 * 恢复全局未保存更改检测
 * 
 * 功能描述：恢复之前暂停的未保存更改检测。
 * 
 * @returns 无返回值
 * @调用场景 数据加载、批量更新完成后调用
 * @副作用 恢复脏数据检测
 */
export function resumeGlobalPendingChanges() {
  globalResume?.()
}

// ── settings-independent-pending ──
/** 独立保存 Tab 脏标记（reactive，供侧栏「未完成」筛选订阅） */
const pendingByTab = reactive<Record<string, boolean>>({})

/**
 * 设置指定 Tab 的未保存状态
 * 
 * 功能描述：标记或清除某个独立保存 Tab 的未保存更改状态。
 * 
 * @param tabId - Tab 唯一标识
 * @param pending - 是否有未保存更改
 * @returns 无返回值
 * @调用场景 独立保存面板的内容发生变化时调用
 * @副作用 更新 pendingByTab 状态映射
 */
function setSettingsTabPending(tabId: string, pending: boolean) {
  if (pending) {
    pendingByTab[tabId] = true
  } else {
    delete pendingByTab[tabId]
  }
}

/**
 * 检查是否存在独立保存的未保存更改
 * 
 * 功能描述：判断当前是否有任何独立保存的 Tab 存在未保存更改。
 * 
 * @returns true 表示有未保存更改，false 表示没有
 * @调用场景 离开设置页面前的确认检查
 */
export function hasIndependentSettingsPending() {
  return Object.keys(pendingByTab).length > 0
}

/** 指定独立保存 tab 是否有未保存改动 */
export function isSettingsTabPending(tabId: string) {
  return !!pendingByTab[tabId]
}

/** 当前有未保存改动的独立保存 tab id 列表 */
export function getIndependentPendingTabIds() {
  return Object.keys(pendingByTab).filter((id) => pendingByTab[id])
}

/**
 * 将面板 dirty 状态同步到设置页离开确认（独立 Tab 与旁路表单均可注册）。
 * 非独立 Tab（如 general / access）注册后，切 Tab 时也会被 hasUnsavedForCurrentTab 感知。
 * @param {string} tabId
 * @param {import('vue').MaybeRefOrGetter<boolean>} pendingSource
 */
export function useRegisterSettingsTabPending(tabId: string, pendingSource: MaybeRefOrGetter<boolean> | (() => boolean)) {
  function readPending() {
    return typeof pendingSource === 'function' ? pendingSource() : !!unref(pendingSource)
  }

  watch(
    () => readPending(),
    (pending) => setSettingsTabPending(tabId, pending),
    { immediate: true },
  )

  onScopeDispose(() => setSettingsTabPending(tabId, false))
}

// ── settings-cancel-sync.util ──
/** 取消修改后同步全局 layout pending 基线 */
export function afterLayoutCancelSync(layout: UILayoutConfig) {
  syncGlobalLayoutPendingSnapshot(layout)
}

// ── useSettingsHubPending ──
interface SettingsHubPendingOptions<TCurrent = unknown> {
  snapshot: Ref<unknown>
  current: () => TCurrent
  ready?: () => boolean
  label?: string
  fieldKeys?: string[] | null
}

interface SettingsHubMountOptions {
  init?: () => void | Promise<void>
  /** true = 每次挂载同步；'first-only' = 同 mountKey 仅首次同步 */
  syncLayout?: boolean | 'first-only'
  mountKey?: string
  afterMount?: () => void
}

const hubMountCounts = new Map<string, number>()

/**
 * Hub 面板未保存更改检测组合式函数
 * 
 * 功能描述：为设置面板中的 Hub 组件提供统一的未保存更改检测、
 * 离开确认和保存/取消处理逻辑。
 * 
 * @param options - 配置选项
 * @param options.snapshot - 快照数据的响应式引用
 * @param options.current - 获取当前数据的函数
 * @param options.ready - 判断数据是否已就绪的函数（可选）
 * @param options.label - 面板标签，用于提示消息（可选）
 * @param options.fieldKeys - 需要比较的字段列表，为 null 时比较全部（可选）
 * @returns 包含 pending、dirtyCount、onSave、onCancel 等状态和方法的对象
 * @调用场景 所有带保存/取消功能的 Hub 面板
 * @副作用 注册全局离开确认监听
 */
export function useSettingsHubPending<TCurrent = unknown>(
  options: SettingsHubPendingOptions<TCurrent>,
) {
  const layoutStore = useLayoutStore()
  const pending = useSettingsPendingChanges(options)

  function runHubMount(mountOptions: SettingsHubMountOptions = {}) {
    const { init, syncLayout = false, mountKey = 'default', afterMount } = mountOptions

    onMounted(async () => {
      const count = (hubMountCounts.get(mountKey) ?? 0) + 1
      hubMountCounts.set(mountKey, count)
      const isFirstMount = count === 1

      pauseGlobalPendingChanges()
      try {
        await init?.()
        if (syncLayout === true || (syncLayout === 'first-only' && isFirstMount)) {
          syncGlobalLayoutPendingSnapshot(layoutStore.layoutConfig)
        }
      } finally {
        resumeGlobalPendingChanges()
      }
      afterMount?.()
    })
  }

  return {
    layoutStore,
    ...pending,
    runHubMount,
  }
}

// ── useSettingsPendingChanges ──
/**
 * 设置页未保存变更计数：对比 snapshot 与 current。
 * @param {{ snapshot: import('vue').Ref, current: () => unknown, label?: string, fieldKeys?: string[] }} options
 */
export function useSettingsPendingChanges(options: SettingsHubPendingOptions) {
  const {
    snapshot,
    current,
    label = '{n} 项已修改',
    fieldKeys = null,
    ready = () => true,
  } = options
  const pendingCount = ref(0)
  const paused = ref(false)

  function recompute() {
    if (paused.value) return
    if (!ready()) {
      pendingCount.value = 0
      return
    }
    if (snapshot.value == null || snapshot.value === '') {
      pendingCount.value = 0
      return
    }
    const cur = current()
    if (fieldKeys?.length) {
      let baseline
      try {
        baseline = typeof snapshot.value === 'string' ? JSON.parse(snapshot.value) : snapshot.value
      } catch {
        pendingCount.value = 0
        return
      }
      pendingCount.value = countObjectFieldDiff(
        baseline as Record<string, unknown>,
        cur as Record<string, unknown> | null | undefined,
        fieldKeys,
      )
      return
    }
    pendingCount.value = countJsonLeafDiff(snapshot.value, cur)
  }

  function takeSnapshot(source: unknown) {
    if (source == null) {
      snapshot.value = ''
      pendingCount.value = 0
      return
    }
    snapshot.value = typeof source === 'string' ? source : JSON.stringify(source)
    pendingCount.value = 0
  }

  function pause() {
    paused.value = true
  }

  function resume() {
    paused.value = false
    recompute()
  }

  watch(snapshot, recompute)
  /**
   * `current()` 必须返回 store / 草稿的**活引用**，禁止 clone / pick*Slice(clone)。
   * 否则 deep-watch 只盯着断开的副本，嵌套字段修改不会抬升 pendingCount，保存按钮永远不出现。
   */
  watch(() => current(), recompute, { deep: true })
  watch(() => (typeof ready === 'function' ? ready() : true), recompute)

  const pendingLabel = computed(() => label.replace('{n}', String(pendingCount.value)))

  function parseSnapshot<T = unknown>(): T | null {
    if (snapshot.value == null || snapshot.value === '') return null
    try {
      return (typeof snapshot.value === 'string' ? JSON.parse(snapshot.value) : snapshot.value) as T
    } catch {
      return null
    }
  }

  async function confirmAndRevert(
    chrome: UiConfirmNotify,
    apply: (baseline: unknown) => void,
    options?: { message?: string; title?: string; onReverted?: () => void },
  ) {
    if (pendingCount.value === 0) return false
    const ok = await chrome.confirm(
      options?.message ?? '确定放弃未保存的更改？此操作不可撤销。',
      options?.title ?? '放弃更改',
      { type: 'danger', confirmText: '放弃更改', cancelText: '继续编辑' },
    )
    if (!ok) return false
    const baseline = parseSnapshot()
    if (baseline == null) {
      chrome.notify('无法恢复：缺少基线快照，请刷新页面后重试', 'error')
      return false
    }
    apply(baseline)
    pendingCount.value = 0
    options?.onReverted?.()
    chrome.notify('已取消修改', 'info')
    return true
  }

  return {
    pendingCount,
    pendingLabel,
    takeSnapshot,
    recompute,
    pause,
    resume,
    parseSnapshot,
    confirmAndRevert,
  }
}
