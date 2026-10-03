/**
 * @file 访问控制 — 用户列表 CRUD Composable
 * @module composables/access/useAccessUsers
 * @description
 *   负责家庭成员（Auth 用户）的列表加载、创建、编辑、删除，
 *   以及按角色筛选的标签页构建。仅管理员可操作，非管理员直接跳过。
 *   依赖：@/services/api/auth 下的用户管理接口、AccessAdminContext（chrome/isAdmin）。
 */
import { ref, computed } from 'vue'
import { fetchAuthUsers, createAuthUser, updateAuthUser, deleteAuthUser } from '@/services/api/auth'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { notifyError } from '@/services/notify'
import { logger } from '@/utils/core/logger'
import type { AccessAdminContext, AccessRole, AccessUser, AccessUserEdit } from '@/types/access'

/** 成员角色筛选标签项 */
interface MemberRoleTab {
  /** 角色 id（all / admin / adult / child） */
  id: string
  /** 标签显示文案 */
  label: string
  /** 该角色下的用户数量 */
  count: number
}
/** 访问控制：用户列表 CRUD */
export function useAccessUsers({ chrome, isAdmin }: AccessAdminContext) {
  /** 用户列表 */
  const users = ref<AccessUser[]>([])
  /** 列表加载中标志 */
  const loading = ref(false)
  const loadError = ref('')
  /** 当前编辑中的用户表单（null 表示未编辑） */
  const editing = ref<AccessUserEdit | null>(null)
  /** 成员保存中标志 */
  const memberSaving = ref(false)
  /** 角色筛选值（all 表示全部） */
  const memberRoleFilter = ref<'all' | AccessRole>('all')

  /**
   * 角色筛选标签列表（含全部 + 各角色）
   * @returns 每项附带该角色下的用户数量
   */
  const memberRoleTabs = computed((): MemberRoleTab[] => [
    { id: 'all', label: '全部', count: users.value.length },
    {
      id: 'admin',
      label: '管理员',
      count: users.value.filter((u) => u.role === 'admin').length,
    },
    {
      id: 'adult',
      label: '成人',
      count: users.value.filter((u) => u.role === 'adult').length,
    },
    {
      id: 'child',
      label: '儿童',
      count: users.value.filter((u) => u.role === 'child').length,
    },
  ])

  /** 按当前角色筛选后的用户列表 */
  const filteredUsers = computed(() => {
    if (memberRoleFilter.value === 'all') return users.value
    return users.value.filter((u) => u.role === memberRoleFilter.value)
  })

  /**
   * 加载用户列表
   * @sideEffect 非 admin 直接返回；失败时 warn 日志并 error toast
   */
  async function loadUsers() {
    if (!isAdmin?.value) return
    loading.value = true
    loadError.value = ''
    try {
      const res = await fetchAuthUsers()
      users.value = res.data || []
    } catch (e) {
      logger.warn('加载用户列表失败', e)
      loadError.value = getApiErrorMessage(e, '加载成员列表失败')
      chrome.notify(loadError.value, 'error')
    } finally {
      loading.value = false
    }
  }

  /**
   * 打开新建用户表单
   * @param setSection 可选的分区切换回调（切到 members）
   */
  function openCreate(setSection?: (section: string) => void) {
    setSection?.('members')
    editing.value = { username: '', password: '', role: 'adult', restrictionsStr: '' }
  }

  /**
   * 打开编辑用户表单
   * @param u 目标用户
   */
  function openEdit(u: AccessUser) {
    editing.value = {
      id: u.id,
      username: u.username,
      password: '',
      role: u.role,
      restrictionsStr: (u.entityRestrictions || []).join(','),
    }
  }

  /**
   * 保存用户（创建或更新）
   * @param member 表单数据，默认使用 editing
   * @sideEffect 校验用户名/密码；成功后关闭表单、刷新列表并 toast；失败 notifyError
   */
  async function saveUser(member?: AccessUserEdit | null) {
    const data = member || editing.value
    if (!data?.username?.trim()) {
      chrome.notify('请填写用户名', 'error')
      return
    }
    // 新建用户必须设置初始密码
    if (!data.id && !data.password?.trim()) {
      chrome.notify('请设置初始密码', 'error')
      return
    }
    memberSaving.value = true
    // 解析实体限制字符串为数组
    const restrictions = data.restrictionsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    try {
      if (data.id) {
        // 更新已有用户：密码为空则不提交
        const body: Record<string, unknown> = {
          username: data.username,
          role: data.role,
          entityRestrictions: restrictions,
        }
        if (data.password) body.password = data.password
        await updateAuthUser(data.id, body)
      } else {
        await createAuthUser({
          username: data.username,
          password: data.password,
          role: data.role,
          entityRestrictions: restrictions,
        })
      }
      editing.value = null
      await loadUsers()
      chrome.notify('成员已保存', 'success')
    } catch (e) {
      notifyError(e, '保存失败')
    } finally {
      memberSaving.value = false
    }
  }

  /**
   * 删除用户（带二次确认）
   * @param id 用户 id
   * @sideEffect 成功后刷新列表并 toast；失败 error toast
   */
  async function removeUser(id: string) {
    const ok = await chrome.confirm('确定删除此用户？', '删除成员', {
      confirmText: '删除',
      type: 'danger',
    })
    if (!ok) return
    try {
      await deleteAuthUser(id)
      await loadUsers()
      chrome.notify('成员已删除', 'success')
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '删除失败'), 'error')
    }
  }

  return {
    users,
    loading,
    loadError,
    editing,
    memberSaving,
    memberRoleFilter,
    memberRoleTabs,
    filteredUsers,
    loadUsers,
    openCreate,
    openEdit,
    saveUser,
    removeUser,
  }
}