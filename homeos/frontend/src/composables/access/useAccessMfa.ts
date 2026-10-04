/**
 * @file 访问控制 — MFA 双因素认证 Composable
 * @module composables/access/useAccessMfa
 * @description
 *   封装当前账户的 MFA（基于 TOTP 的一次性验证码）状态查询、启用、确认与关闭流程。
 *   依赖：@/services/api/auth 下的 MFA 接口、AccessAdminContext（chrome/isAdmin）。
 *   所有操作仅作用于当前登录账户，非管理员则直接跳过。
 */
import { ref } from 'vue'
import {
  getMfaStatus,
  setupMfa,
  confirmMfa,
  disableMfa as disableMfaApi,
} from '@/services/api/auth'
import { getApiErrorMessage } from '@/utils/core/error-message'
import type { AccessAdminContext } from '@/types/access'

/** MFA 状态查询响应 */
interface MfaStatusResponse {
  /** 是否已启用 MFA */
  enabled?: boolean
}

/** MFA 设置（发起）响应，返回用于扫码的二维码数据 URL */
interface MfaSetupResponse {
  /** data:image/png;base64,... 形式的二维码图片 */
  qrDataUrl?: string
}

/** 访问控制：MFA 双因素认证 */
export function useAccessMfa({ chrome, isAdmin }: AccessAdminContext) {
  /** 当前账户是否已启用 MFA */
  const mfaEnabled = ref(false)
  /** MFA 设置阶段返回的二维码 data URL */
  const mfaQr = ref<string>('')
  /** 用户在设置阶段输入的验证码 */
  const mfaConfirmCode = ref<string>('')
  /** 用户在关闭阶段输入的验证码 */
  const mfaDisableCode = ref<string>('')

  /**
   * 加载当前账户的 MFA 启用状态
   * @sideEffect 非 admin 直接返回；成功更新 mfaEnabled，失败静默忽略
   */
  async function loadMfaStatus() {
    if (!isAdmin?.value) return
    try {
      const res = await getMfaStatus<MfaStatusResponse>()
      mfaEnabled.value = !!res.data?.enabled
    } catch {
      /* 忽略 */
    }
  }

  /**
   * 发起 MFA 设置：请求后端生成二维码并提示用户扫码
   * @sideEffect 成功更新 mfaQr 并 info toast；失败 error toast
   */
  async function startMfaSetup() {
    try {
      const res = await setupMfa<MfaSetupResponse>()
      mfaQr.value = res.data?.qrDataUrl || ''
      chrome.notify('请用验证器扫描二维码并输入验证码', 'info')
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, 'MFA 设置失败'), 'error')
    }
  }

  /**
   * 确认 MFA 设置：提交验证码完成绑定
   * @sideEffect 成功后置位 mfaEnabled、清空二维码与验证码并 success toast；失败 error toast
   */
  async function confirmMfaSetup() {
    try {
      await confirmMfa(mfaConfirmCode.value)
      mfaEnabled.value = true
      mfaQr.value = ''
      mfaConfirmCode.value = ''
      chrome.notify('MFA 已启用', 'success')
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '验证码无效'), 'error')
    }
  }

  /**
   * 关闭 MFA：提交验证码解除绑定
   * @sideEffect 成功后重置 mfaEnabled、清空验证码并 success toast；失败 error toast
   */
  async function disableMfa() {
    try {
      await disableMfaApi(mfaDisableCode.value)
      mfaEnabled.value = false
      mfaDisableCode.value = ''
      chrome.notify('MFA 已关闭', 'success')
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '验证码无效'), 'error')
    }
  }

  return {
    mfaEnabled,
    mfaQr,
    mfaConfirmCode,
    mfaDisableCode,
    loadMfaStatus,
    startMfaSetup,
    confirmMfaSetup,
    disableMfa,
  }
}