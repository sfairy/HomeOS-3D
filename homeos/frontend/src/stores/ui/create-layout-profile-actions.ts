/**
 * @file 布局方案 CRUD 与切换
 * @module stores/ui/create-layout-profile-actions
 * @description
 *  布局显示方案（profile）的增删改查与切换：
 *  - fetchProfiles: 拉取服务端方案列表
 *  - createProfile: 以当前布局另存为新方案
 *  - deleteProfile: 删除指定方案（default 不可删）；删除当前方案时自动切回 default
 *  - switchProfile: 切换方案，写入本地存储、同步服务端激活态、重载配置，
 *    并按 profileHomeMode 绑定自动激活对应家庭模式
 *  - maybeActivateProfileHomeMode: 方案切换后按绑定自动激活家庭模式
 *  依赖 config / home-modes API、logger、终端标签推断与本地存储工具。
 */
import { ref, type Ref } from 'vue'
import { activateHomeMode } from '@/services/api/home-modes'
import {
  fetchConfigProfiles,
  saveProject,
  deleteProject,
  setActiveProject,
} from '@/services/api/config'
import { logger } from '@/utils/core/logger'
import { writeStoredProfileId } from './create-layout-state'
import { bindSelfTerminalProfile } from '@/utils/config/resolve-active-profile.util'
import { inferTerminalLabel } from '@/utils/client/infer-terminal-label.util'
import type { UILayoutConfig } from '@/types/layout'

/** 方案摘要信息 */
interface LayoutProfileSummary {
  /** 方案 ID */
  projectId: string
  /** 最后更新时间（可选） */
  updatedAt?: string
}

/** createLayoutProfileActions 的依赖注入参数 */
interface LayoutProfileActionsDeps {
  /** 布局配置 */
  layoutConfig: UILayoutConfig
  /** 当前激活方案 ID ref */
  activeProfileId: Ref<string>
  /** 方案列表加载中标志 ref */
  isProfilesLoading: Ref<boolean>
  /** 方案列表加载失败文案 */
  profilesLoadError: Ref<string>
  /** 配置是否已加载标志 ref */
  isConfigLoaded: Ref<boolean>
  /** 统一 API 错误处理回调 */
  handleApiError: (err: unknown, fallbackMsg: string) => void
  /** 重新加载配置的回调 */
  loadConfig: () => Promise<void>
}

/**
 * 布局方案 CRUD 与切换（layout 拆分模块）。
 *
 * @param deps 依赖注入参数
 * @returns availableProfiles / fetchProfiles / createProfile / deleteProfile / switchProfile / maybeActivateProfileHomeMode
 */
export function createLayoutProfileActions(deps: LayoutProfileActionsDeps) {
  const {
    layoutConfig,
    activeProfileId,
    isProfilesLoading,
    profilesLoadError,
    isConfigLoaded,
    handleApiError,
    loadConfig,
  } = deps

  /** 可用方案列表 */
  const availableProfiles = ref<LayoutProfileSummary[]>([])

  /**
   * 若当前方案绑定了自动激活家庭模式，则触发激活。
   * 仅在 autoActivate=true 且 onSwitch 非空时执行；失败仅警告不阻断流程。
   */
  async function maybeActivateProfileHomeMode() {
    const binding = layoutConfig.profileHomeMode
    if (!binding?.autoActivate || !String(binding.onSwitch || '').trim()) return
    try {
      await activateHomeMode(binding.onSwitch)
    } catch (err) {
      logger.warn('方案切换后家庭模式激活失败', err)
    }
  }

  /**
   * 拉取服务端方案列表并更新 availableProfiles。
   * 失败时通过 handleApiError 统一处理。
   */
  async function fetchProfiles() {
    isProfilesLoading.value = true
    profilesLoadError.value = ''
    try {
      const res = await fetchConfigProfiles()
      availableProfiles.value = res.data?.data || []
    } catch (err) {
      profilesLoadError.value = '获取显示方案列表失败'
      handleApiError(err, '获取显示方案列表失败')
    } finally {
      isProfilesLoading.value = false
    }
  }

  /**
   * 以当前布局创建新方案。
   * @param name 新方案名称
   * @returns 是否创建成功
   */
  async function createProfile(name: string): Promise<boolean> {
    try {
      await saveProject(name, { layout: { ...layoutConfig } })
      await fetchProfiles()
      return true
    } catch (err) {
      handleApiError(err, '创建方案失败')
      return false
    }
  }

  /**
   * 删除指定方案。default 方案不可删除。
   * 删除当前激活方案时自动切换回 default。
   * @param id 方案 ID
   * @returns 是否删除成功
   */
  async function deleteProfile(id: string): Promise<boolean> {
    if (id === 'default') return false
    try {
      await deleteProject(id)
      await fetchProfiles()
      if (activeProfileId.value === id) {
        await switchProfile('default')
      }
      return true
    } catch (err) {
      handleApiError(err, '删除方案失败')
      return false
    }
  }

  /**
   * 切换到指定方案。
   * 依次：更新本地 ID -> 写入存储 -> 标记配置未加载 -> 同步服务端激活态 ->
   * 重载配置 -> 按绑定激活家庭模式 -> 绑定当前终端到该方案。
   * @param id 目标方案 ID
   */
  async function switchProfile(id: string): Promise<void> {
    activeProfileId.value = id
    writeStoredProfileId(id)
    isConfigLoaded.value = false
    try {
      await setActiveProject(id)
    } catch (err) {
      logger.warn('同步激活配置方案到服务端失败', err)
    }
    await loadConfig()
    await maybeActivateProfileHomeMode()
    void bindSelfTerminalProfile(id, inferTerminalLabel())
  }

  return {
    availableProfiles,
    fetchProfiles,
    createProfile,
    deleteProfile,
    switchProfile,
    maybeActivateProfileHomeMode,
  }
}