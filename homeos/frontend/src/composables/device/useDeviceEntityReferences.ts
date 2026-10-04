/**
 * 设备实体引用 Composable
 *
 * 模块：设备详情 / 实体引用关系
 * 职责：
 *   - 根据 entity_id 拉取该实体被哪些功能引用（告警规则、布局、系统配置等）。
 *   - 提供移除引用（unlink）能力：管理员或成人角色可移除，需二次确认。
 *   - 移除后按需联动刷新 UI 布局配置与系统配置，保持前端状态一致。
 *   - 通过 createFetchSequence 串行化请求，过滤过期响应。
 *
 * 依赖：
 *   - @/services/api/entities.fetchEntityReferences / unlinkEntityReference：引用查询 / 移除接口。
 *   - @/utils/core/error-message.getApiErrorMessage：错误信息归一化。
 *   - @/utils/core/misc.util.createFetchSequence：请求序号守卫。
 *   - @/stores/auth.store.useAuthStore：用于判断角色权限。
 *   - @/stores/chrome.store.useChromeStore：通知 / 确认弹窗。
 *   - @/stores/layout.store：布局配置加载。
 *   - @/types/entity-references：引用类型与常量（kind 标签 / 受影响的系统配置 / 布局 kind 集合）。
 *   - @/views/settings/system/composables/system-config.internals.useSystemConfig：系统配置加载。
 */
import { ref, watch, type Ref } from 'vue'
import { fetchEntityReferences, unlinkEntityReference } from '@/services/api/entities'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { createFetchSequence } from '@/utils/core/misc.util'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import {
  ENTITY_REFERENCE_KIND_LABELS,
  LAYOUT_ENTITY_REFERENCE_KINDS,
  SYSTEM_CONFIG_ENTITY_REFERENCE_KINDS,
  UNLINKABLE_ENTITY_REFERENCE_KINDS,
  type EntityReferenceItem,
  type EntityReferencesResponse,
} from '@/types/entity-references'
import { computed } from 'vue'
import { useSystemConfig } from '@/composables/config/system-config-core.internals'

/**
 * 设备实体引用 Composable。
 *
 * @param entityId 目标实体 ID（响应式），变化时自动重新加载。
 * @param visible  可选的可见性开关；为 false 时跳过请求与 watch 自动触发。
 * @returns canUnlink / loading / unlinkingId / error / total / items / counts / refresh / unlink。
 */
export function useDeviceEntityReferences(entityId: Ref<string>, visible?: Ref<boolean>) {
  const authStore = useAuthStore()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const { load: loadSystemConfig } = useSystemConfig()
  // 是否允许移除：仅 admin 或 adult 角色可操作
  const canUnlink = computed(() => authStore.role === 'admin' || authStore.role === 'adult')

  function canUnlinkItem(item: EntityReferenceItem) {
    return canUnlink.value && UNLINKABLE_ENTITY_REFERENCE_KINDS.has(item.kind)
  }

  function unlinkDisabledReason(item: EntityReferenceItem) {
    if (!canUnlink.value) return '需要管理员或成人权限'
    if (!UNLINKABLE_ENTITY_REFERENCE_KINDS.has(item.kind)) {
      return '此类引用暂不支持在此移除，请到对应设置页编辑'
    }
    return ''
  }

  const loading = ref(false)
  // 正在移除中的引用标识（kind:id），用于 UI 显示 loading 态
  const unlinkingId = ref('')
  const error = ref('')
  const total = ref(0)
  const items = ref<EntityReferenceItem[]>([])
  // 按 kind 分类的引用计数
  const counts = ref<EntityReferencesResponse['counts']>({})
  // 请求序号守卫，确保只有最新一次请求的结果会写入状态
  const seqGuard = createFetchSequence()

  /**
   * 将接口返回写入响应式状态。
   *
   * @param data 引用查询响应；为空时清空状态。
   */
  function applyPayload(data: EntityReferencesResponse | undefined) {
    items.value = data?.items || []
    total.value = Number(data?.total) || items.value.length
    counts.value = data?.counts || {}
  }

  /**
   * 刷新实体引用列表。
   *
   * 副作用：修改 loading / error / items / total / counts；过期序号的响应会被丢弃。
   * 调用场景：
   *   - watch 监听 entityId / visible 时自动调用。
   *   - 外部组件通过返回的 refresh 手动刷新。
   */
  async function refresh() {
    if (visible && !visible.value) return
    const id = entityId.value?.trim()
    const seq = seqGuard.next()

    if (!id) {
      items.value = []
      total.value = 0
      counts.value = {}
      error.value = ''
      return
    }

    loading.value = true
    error.value = ''
    try {
      const { data } = await fetchEntityReferences(id)
      if (!seqGuard.isCurrent(seq)) return
      applyPayload(data)
    } catch (e) {
      if (!seqGuard.isCurrent(seq)) return
      items.value = []
      total.value = 0
      counts.value = {}
      // 翻译：错误提示文案（getApiErrorMessage 默认值）
      error.value = getApiErrorMessage(e, '加载实体引用失败')
    } finally {
      if (seqGuard.isCurrent(seq)) loading.value = false
    }
  }

  /**
   * 移除指定引用。
   *
   * 流程：
   *   1) 权限校验：非 admin / adult 直接告警并返回 false。
   *   2) 弹窗二次确认（告警规则与其他类型文案不同）。
   *   3) 调用 unlinkEntityReference；服务端返回 remaining 时直接应用，否则刷新整列表。
   *   4) 联动刷新布局配置 / 系统配置（依据 kind 判断是否需要）。
   *   5) 通知用户结果。
   *
   * @param item 待移除的引用项。
   * @returns 是否成功移除。
   * 副作用：修改 unlinkingId / items / total / counts；可能触发 layoutStore.loadConfig / loadSystemConfig；chrome.notify / chrome.confirm。
   */
  async function unlink(item: EntityReferenceItem) {
    if (!canUnlink.value) {
      // 翻译：Toast 文案
      chrome.notify('需要管理员或成人权限才能移除引用', 'warning')
      return false
    }
    const id = entityId.value?.trim()
    if (!id) return false

    const kindLabel = ENTITY_REFERENCE_KIND_LABELS[item.kind] || item.kind
    // 二次确认：告警规则文案单独定制，其他类型走通用模板
    const ok = await chrome.confirm(
      item.kind === 'alert_rule'
        ? `确定删除告警规则「${item.name}」？此操作不可恢复。`
        : `确定从「${kindLabel} · ${item.name}」中移除对该实体的引用？`,
      '移除功能引用',
      { confirmText: '移除', type: 'danger' },
    )
    if (!ok) return false

    unlinkingId.value = `${item.kind}:${item.id}`
    try {
      const { data } = await unlinkEntityReference(id, {
        kind: item.kind,
        id: item.id,
        detail: item.detail,
      })
      if (!data?.ok) {
        // 翻译：Toast 文案（服务端 message 优先）
        chrome.notify(data?.message || '移除失败', 'error')
        return false
      }
      // 服务端若返回 remaining 直接应用，避免一次额外查询
      if (data.remaining) applyPayload(data.remaining)
      else await refresh()
      // 引用移除后，受影响的布局配置需要重新加载
      if (LAYOUT_ENTITY_REFERENCE_KINDS.has(item.kind)) {
        try {
          await layoutStore.loadConfig()
        } catch {
          // 布局刷新失败不阻断主流程，静默忽略
        }
      }
      // 引用移除后，受影响的系统配置需要重新加载
      if (SYSTEM_CONFIG_ENTITY_REFERENCE_KINDS.has(item.kind)) {
        try {
          await loadSystemConfig({ force: true })
        } catch {
          // 系统配置刷新失败不阻断主流程，静默忽略
        }
      }
      // 翻译：Toast 文案（服务端 message 优先）
      chrome.notify(data.message || '已移除引用', 'success')
      return true
    } catch (e) {
      // 翻译：Toast 文案（getApiErrorMessage 默认值）
      chrome.notify(getApiErrorMessage(e, '移除引用失败'), 'error')
      return false
    } finally {
      unlinkingId.value = ''
    }
  }

  // 监听 entityId / visible；immediate 保证初始化即拉取一次
  watch(
    [entityId, () => visible?.value],
    () => {
      void refresh()
    },
    { immediate: true },
  )

  return {
    canUnlink,
    canUnlinkItem,
    unlinkDisabledReason,
    loading,
    unlinkingId,
    error,
    total,
    items,
    counts,
    refresh,
    unlink,
  }
}