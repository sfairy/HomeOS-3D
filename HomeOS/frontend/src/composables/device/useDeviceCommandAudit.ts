/**
 * 设备调用审计 Composable
 *
 * 模块：设备详情 / 调用审计
 * 职责：
 *   - 根据 entity_id 分页拉取该实体的命令调用审计日志（CommandAuditLog）。
 *   - 仅管理员（role === 'admin'）可见，非管理员直接清空并跳过请求。
 *   - 暴露 loading / error / logs / page / totalPages / total / successCount / failCount。
 *   - 通过 createFetchSequence 串行化请求，过滤过期响应。
 *
 * 依赖：
 *   - @/services/api.apiGet：通用 GET 请求。
 *   - @/utils/core/error-message.getApiErrorMessage：错误信息归一化。
 *   - @/utils/core/misc.util.createFetchSequence：请求序号守卫。
 *   - @/composables/access/useAccessAuditHelpers.formatAuditTime / buildAuditQuery：审计查询参数与时间格式化。
 *   - @/stores/auth.store.useAuthStore：用于读取当前角色判断管理员权限。
 *   - @/types/access.CommandAuditLog / PaginatedItems：审计日志与分页类型。
 */
import { ref, computed, watch, type Ref } from 'vue'
import { apiGet } from '@/services/api'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { createFetchSequence } from '@/utils/core/misc.util'
import { formatAuditTime, buildAuditQuery } from '@/composables/access/useAccessAuditHelpers'
import { useAuthStore } from '@/stores/auth.store'
import type { CommandAuditLog, PaginatedItems } from '@/types/access'

// 单页条数；与后端分页约定保持一致
const DEVICE_COMMAND_AUDIT_PAGE_SIZE = 50

/**
 * 设备调用审计 Composable。
 *
 * @param entityId 目标实体 ID（响应式），变化时自动重新加载并重置到第 1 页。
 * @param visible  可选的可见性开关；为 false 时跳过请求与 watch 自动触发。
 * @returns isAdmin / loading / error / logs / page / totalPages / total / successCount / failCount / refresh / goPage / formatAuditTime。
 */
export function useDeviceCommandAudit(entityId: Ref<string>, visible?: Ref<boolean>) {
  const authStore = useAuthStore()
  // 当前用户是否为管理员；非管理员无法查看审计日志
  const isAdmin = computed(() => authStore.role === 'admin')

  const loading = ref(false)
  const error = ref('')
  const logs = ref<CommandAuditLog[]>([])
  // 当前页码（1-based）
  const page = ref(1)
  // 总页数
  const totalPages = ref(1)
  // 总条数
  const total = ref(0)
  // 请求序号守卫，确保只有最新一次请求的结果会写入状态
  const seqGuard = createFetchSequence()

  // 成功记录数
  const successCount = computed(() => logs.value.filter((r) => r.success).length)
  // 失败记录数
  const failCount = computed(() => logs.value.filter((r) => !r.success).length)

  /**
   * 刷新审计日志。
   *
   * @param nextPage 要加载的页码，默认当前页。
   * 副作用：修改 loading / error / logs / page / totalPages / total；过期序号的响应会被丢弃。
   * 调用场景：
   *   - watch 监听 entityId / isAdmin / visible 时自动调用（并重置到第 1 页）。
   *   - 外部组件通过返回的 refresh 手动刷新。
   *   - goPage 内部调用以切页。
   */
  async function refresh(nextPage: number = page.value) {
    if (visible && !visible.value) return
    const id = entityId.value?.trim()
    const seq = seqGuard.next()

    if (!id) {
      // 无 entity_id 时清空状态
      logs.value = []
      total.value = 0
      totalPages.value = 1
      page.value = 1
      error.value = ''
      return
    }

    if (!isAdmin.value) {
      // 非管理员：清空状态并直接返回，避免越权请求
      logs.value = []
      total.value = 0
      totalPages.value = 1
      page.value = 1
      error.value = ''
      loading.value = false
      return
    }

    loading.value = true
    error.value = ''
    try {
      const { data } = await apiGet<PaginatedItems<CommandAuditLog> & { total?: number }>(
        buildAuditQuery(id, '', {
          limit: DEVICE_COMMAND_AUDIT_PAGE_SIZE,
          page: nextPage,
        }),
      )
      if (!seqGuard.isCurrent(seq)) return

      // 后端稳定返回分页对象 { items, totalPages, page, total }
      logs.value = data?.items ?? []
      totalPages.value = data?.totalPages || 1
      page.value = data?.page || nextPage
      total.value = Number(data?.total) || data?.items?.length || 0
    } catch (e) {
      if (!seqGuard.isCurrent(seq)) return
      logs.value = []
      total.value = 0
      totalPages.value = 1
      // 翻译：错误提示文案（getApiErrorMessage 默认值）
      error.value = getApiErrorMessage(e, '加载调用记录失败')
    } finally {
      if (seqGuard.isCurrent(seq)) loading.value = false
    }
  }

  /**
   * 跳转到指定页（边界与防重入校验）。
   *
   * @param next 目标页码。
   * @returns refresh 的 Promise；越界或重复时返回 undefined。
   */
  function goPage(next: number) {
    if (next < 1 || next > totalPages.value || next === page.value || loading.value) return
    return refresh(next)
  }

  // 监听 entityId / isAdmin / visible；切换实体或权限变化时重置到第 1 页；immediate 保证初始化即拉取一次
  watch(
    [entityId, isAdmin, () => visible?.value],
    () => {
      page.value = 1
      void refresh(1)
    },
    { immediate: true },
  )

  return {
    isAdmin,
    loading,
    error,
    logs,
    page,
    totalPages,
    total,
    successCount,
    failCount,
    refresh,
    goPage,
    formatAuditTime,
  }
}