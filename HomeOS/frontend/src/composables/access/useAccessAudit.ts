/**
 * @file 访问控制 — 命令审计与登录审计 Composable
 * @module composables/access/useAccessAudit
 * @description
 *   负责命令审计（Command Audit）与登录审计（Login Audit）两类日志的
 *   拉取、分页、筛选、导出 CSV、清除以及用户/角色选项构建。
 *   依赖：Vue 3 composition API、@/services/api 下的审计接口、
 *   AccessAdminContext（chrome/isAdmin）、entitiesStore 与 roleMeta。
 */
import { ref, computed, type ComputedRef, type Ref } from 'vue'
import { fetchLoginAudit } from '@/services/api/auth'
import { apiGet, apiDelete } from '@/services/api'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { downloadBlob } from '@/utils/core/misc.util'
import { logger } from '@/utils/core/logger'
import type {
  AccessAdminContext,
  AccessEntitiesStore,
  AuditDeleteResult,
  AuditUserOption,
  CommandAuditLog,
  LoginAuditLog,
  PaginatedItems,
  RoleMeta,
} from '@/types/access'
import {
  LOGIN_AUDIT_PAGE_SIZE,
  formatAuditTime,
  buildAuditFilterParams as buildAuditFilterParamsBase,
  buildAuditQuery as buildAuditQueryBase,
} from '@/composables/access/useAccessAuditHelpers'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

/**
 * useAccessAudit 的依赖注入参数
 * @extends AccessAdminContext 提供 chrome 与 isAdmin
 */
interface UseAccessAuditDeps extends AccessAdminContext {
  /** 当前用户列表，用于构建审计用户选项 */
  users: Ref<
    {
      username?: string
      role?: string
    }[]
  >
  /** 实体存储，用于校验筛选实体是否存在 */
  entitiesStore: AccessEntitiesStore
  /** 根据角色 id 返回角色元信息（label/desc） */
  roleMeta: (role: string) => RoleMeta
}
/** 访问控制：命令审计与登录审计 */
export function useAccessAudit({
  chrome,
  isAdmin,
  users,
  entitiesStore,
  roleMeta,
}: UseAccessAuditDeps) {
  // ===== 命令审计相关状态 =====
  /** 命令审计日志列表 */
  const auditLogs = ref<CommandAuditLog[]>([])
  /** 命令审计加载中标志 */
  const auditLoading = ref(false)
  /** 当前审计页码 */
  const auditPage = ref(1)
  /** 审计总页数 */
  const auditTotalPages = ref(1)
  /** 实体筛选条件（entity_id） */
  const auditEntityFilter = ref<string>('')
  /** 用户筛选条件（username） */
  const auditUserFilter = ref<string>('')
  /** 审计 CSV 导出进行中标志 */
  const auditExporting = ref(false)
  /** 审计清除进行中标志 */
  const auditClearing = ref(false)

  // ===== 登录审计相关状态 =====
  /** 登录审计日志列表 */
  const loginAudits = ref<LoginAuditLog[]>([])
  /** 登录审计加载中标志 */
  const loginAuditLoading = ref(false)
  /** 登录审计错误消息（用于内联展示） */
  const loginAuditError = ref<string>('')
  /** 当前登录审计页码 */
  const loginAuditPage = ref(1)
  /** 登录审计总页数 */
  const loginAuditTotalPages = ref(1)

  /** 成功命令数量（基于当前页） */
  const auditSuccessCount = computed(() => auditLogs.value.filter((r) => r.success).length)
  /** 失败命令数量（基于当前页） */
  const auditFailCount = computed(() => auditLogs.value.filter((r) => !r.success).length)

  /**
   * 审计用户下拉选项
   * @returns 包含"全部用户"占位项 + 已知用户列表 + 历史日志中出现的用户
   */
  const auditUserOptions: ComputedRef<AuditUserOption[]> = computed(() => {
    const opts: AuditUserOption[] = [{ value: '', label: '全部用户', hint: '' }]
    const seen = new Set([''])
    // 先从用户列表补充选项，附带角色 hint
    for (const u of users.value) {
      if (u.username && !seen.has(u.username)) {
        seen.add(u.username)
        opts.push({ value: u.username, label: u.username, hint: roleMeta(u.role ?? '').label })
      }
    }
    // 再从审计日志中补充历史用户（可能用户已被删除）
    for (const row of auditLogs.value) {
      if (row.username && !seen.has(row.username)) {
        seen.add(row.username)
        opts.push({ value: row.username, label: row.username, hint: row.role || '' })
      }
    }
    return opts
  })

  /**
   * 构建审计筛选 URLSearchParams
   * @returns 包含 entityId / username 的查询参数
   */
  function buildAuditFilterParams() {
    return buildAuditFilterParamsBase(auditEntityFilter.value, auditUserFilter.value)
  }

  /**
   * 构建审计查询 URL（含分页与 limit）
   * @param opts.limit 单页条数，默认走 helpers 内部常量
   * @param opts.page  页码
   * @returns 形如 `/audit/commands?...` 的查询 URL
   */
  function buildAuditQuery(
    opts: {
      limit?: number
      page?: number
    } = {},
  ) {
    return buildAuditQueryBase(auditEntityFilter.value, auditUserFilter.value, opts)
  }

  /**
   * 实体选择回调：选中实体且存在时重置到第 1 页并加载
   * @param value 选中的 entity_id
   */
  function onAuditEntityPick(value: string) {
    if (value && entitiesStore.getEntity(value)) {
      auditPage.value = 1
      loadAudit(1)
    }
  }

  /**
   * 加载命令审计日志
   * @param page 页码，默认当前页
   * @sideEffect 更新 auditLogs / auditTotalPages / auditPage，失败时清空并 toast
   */
  async function loadAudit(page: number = auditPage.value) {
    if (!isAdmin?.value) return
    auditLoading.value = true
    try {
      const res = await apiGet<PaginatedItems<CommandAuditLog>>(buildAuditQuery({ page }))
      const data = res.data
      // 后端稳定返回分页对象 { items, totalPages, page }
      auditLogs.value = data?.items ?? []
      auditTotalPages.value = data?.totalPages || 1
      auditPage.value = data?.page || page
    } catch (e) {
      logger.warn('加载审计日志失败', e)
      auditLogs.value = []
      auditTotalPages.value = 1
      chrome.notify(getApiErrorMessage(e, '加载审计日志失败'), 'error')
    } finally {
      auditLoading.value = false
    }
  }
  /**
   * 跳转到指定审计页（带边界与去重判断）
   * @param page 目标页码
   */
  function goAuditPage(page: number) {
    if (page < 1 || page > auditTotalPages.value || page === auditPage.value) return
    loadAudit(page)
  }

  /**
   * 触发审计查询：重置页码到 1 后加载
   * @returns loadAudit 的 Promise
   */
  function queryAudit() {
    auditPage.value = 1
    return loadAudit(1)
  }

  /**
   * 下载 CSV 文件（带 UTF-8 BOM 头，避免 Excel 乱码）
   * @param filename 文件名
   * @param csv CSV 文本内容
   */
  function downloadCsv(filename: string, csv: string) {
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    downloadBlob(blob, filename)
  }

  /**
   * 清除审计记录
   * @sideEffect 带筛选时仅清除匹配项，否则清除全部；成功后重新加载首页
   */
  async function clearAuditLogs() {
    if (!isAdmin?.value) return
    const hasFilter = !!(auditUserFilter.value.trim() || auditEntityFilter.value.trim())
    // 根据是否有筛选条件展示不同确认文案
    const ok = await chrome.confirm(
      hasFilter
        ? '确定清除符合当前筛选条件的审计记录？此操作不可恢复。'
        : '确定清除全部审计记录？此操作不可恢复。',
      '清除审计记录',
      { confirmText: '清除', type: 'danger' },
    )
    if (!ok) return
    auditClearing.value = true
    try {
      const qs = buildAuditFilterParams().toString()
      const url = qs ? `/audit/commands?${qs}` : '/audit/commands'
      const res = await apiDelete<AuditDeleteResult>(url)
      const n = res.data?.deleted ?? 0
      auditLogs.value = []
      chrome.notify(`已清除 ${n} 条审计记录`, 'success')
      await loadAudit()
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '清除失败'), 'error')
    } finally {
      auditClearing.value = false
    }
  }

  /**
   * 导出当前筛选下的命令审计为 CSV（最多 500 条）
   * @sideEffect 下载 CSV 文件并 toast 结果
   */
  async function exportAuditCsv() {
    if (!isAdmin?.value) return
    auditExporting.value = true
    try {
      const res = await apiGet<PaginatedItems<CommandAuditLog>>(
        buildAuditQuery({ limit: 500 }),
      )
      const data = res.data
      // 后端稳定返回分页对象 { items, ... }
      const rows = data?.items ?? []
      const header = ['时间', '用户', '角色', '服务', '实体名', '实体ID', '结果', '错误']
      const lines = [header.join(',')]
      for (const row of rows) {
        const entityId = row.entityId || ''
        const entity = entityId ? entitiesStore.getEntity(entityId) : undefined
        const entityName = entityId
          ? getEntityDisplayName(
              entityId,
              entity && typeof entity === 'object' ? entity : undefined,
            ) || entityId
          : ''
        const cols = [
          formatAuditTime(row.createdAt),
          row.username || '',
          row.role || '',
          `${row.domain ?? ''}.${row.service ?? ''}`,
          entityName,
          entityId,
          row.success ? '成功' : '失败',
          (row.error || '').replace(/"/g, '""'),
        ]
        lines.push(cols.map((c) => `"${c}"`).join(','))
      }
      downloadCsv(`command-audit-${new Date().toISOString().slice(0, 10)}.csv`, lines.join('\n'))
      chrome.notify('审计 CSV 已导出', 'success')
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '导出失败'), 'error')
    } finally {
      auditExporting.value = false
    }
  }

  /**
   * 加载登录审计日志
   * @param page 页码，默认当前页
   * @sideEffect 更新 loginAudits / loginAuditPage / loginAuditTotalPages，失败设置 loginAuditError
   */
  async function loadLoginAudits(page: number = loginAuditPage.value) {
    if (!isAdmin?.value) return
    loginAuditLoading.value = true
    loginAuditError.value = ''
    try {
      const res = await fetchLoginAudit({ limit: LOGIN_AUDIT_PAGE_SIZE, page })
      const data = res.data
      // 后端稳定返回分页对象 { items, totalPages, page }
      loginAudits.value = data?.items ?? []
      loginAuditPage.value = data?.page || page
      loginAuditTotalPages.value = data?.totalPages || 1
    } catch (e) {
      loginAudits.value = []
      loginAuditError.value = getApiErrorMessage(e, '加载登录审计失败')
    } finally {
      loginAuditLoading.value = false
    }
  }

  /**
   * 跳转到指定登录审计页（带边界与去重判断）
   * @param page 目标页码
   */
  function goLoginAuditPage(page: number) {
    if (page < 1 || page > loginAuditTotalPages.value || page === loginAuditPage.value) return
    return loadLoginAudits(page)
  }

  return {
    auditLogs,
    auditLoading,
    auditPage,
    auditTotalPages,
    auditEntityFilter,
    auditUserFilter,
    auditExporting,
    auditClearing,
    loginAudits,
    loginAuditLoading,
    loginAuditError,
    loginAuditPage,
    loginAuditTotalPages,
    auditSuccessCount,
    auditFailCount,
    auditUserOptions,
    onAuditEntityPick,
    loadAudit,
    goAuditPage,
    queryAudit,
    clearAuditLogs,
    exportAuditCsv,
    loadLoginAudits,
    goLoginAuditPage,
    formatAuditTime,
  }
}