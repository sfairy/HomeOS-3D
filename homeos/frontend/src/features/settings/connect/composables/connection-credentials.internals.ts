/**
 * @file connection-credentials.internals.ts
 * @module frontend/src/features/settings/connect/composables
 */
import { testHaConnection } from '@/services/api/ha'
import { useEntitiesStore } from '@/stores/entities.store'
import { useHaConnectionStore } from '@/stores/ha-connection.store'
import { useChromeStore } from '@/stores/chrome.store'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { validateHaUrlForDeploy } from '@/shared/utils/ha/url'
import { copyTextWithNotify } from '@/services/notify'
import { useSettingsHubPending } from '@/composables/settings-kernel/pending.internals'
import { useSettingsSave } from '@/composables/settings-kernel/save.internals'
import { onBeforeUnmount, ref } from 'vue'

export function useConnectionCredentials(onReconnectSuccess?: () => void | Promise<void>) {
  const haStore = useHaConnectionStore()
  const chrome = useChromeStore()
  const entitiesStore = useEntitiesStore()
  const showTokenInput = ref(false)
  const testing = ref(false)
  const testResult = ref<{ ok: boolean; message: string; ha_version?: string } | null>(null)
  const { saving, runSave } = useSettingsSave()
  const saveFeedback = ref<{ ok?: boolean; message: string } | null>(null)

  /** 表单草稿：令牌输入框留空表示「沿用服务端已保存的令牌」。 */
  const draft = ref({ url: '', fallbackUrl: '', token: '' })
  const draftVerifyTls = ref(true)
  const initialHaConfig = ref<unknown>(null)

  let reconnectPollTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectStopped = false
  let reconnectResolve: (() => void) | null = null

  const {
    pendingCount: pendingChanges,
    pendingLabel,
    takeSnapshot: snapshotHaConfig,
    confirmAndRevert,
  } = useSettingsHubPending<unknown>({
    snapshot: initialHaConfig,
    current: () => ({
      url: draft.value.url.trim(),
      fallbackUrl: draft.value.fallbackUrl.trim(),
      token: draft.value.token.trim(),
    }),
    fieldKeys: ['url', 'fallbackUrl', 'token'],
    ready: () => haStore.loaded,
  })

  /** 用服务端快照重置草稿与「未保存」基线。 */
  function snapshotHaConfigFromStore() {
    const status = haStore.status
    draft.value = {
      url: status?.baseUrl || '',
      fallbackUrl: status?.externalBaseUrl || '',
      token: '',
    }
    draftVerifyTls.value = status?.verifyTls !== false
    showTokenInput.value = !status?.hasToken
    snapshotHaConfig({
      url: draft.value.url.trim(),
      fallbackUrl: draft.value.fallbackUrl.trim(),
      token: '',
    })
  }

  async function copyHaUrl() {
    await copyTextWithNotify(draft.value.url, {
      successMessage: 'HA 局域网地址已复制',
      emptyMessage: '暂无 HA 局域网地址可复制',
    })
  }

  async function copyHaFallbackUrl() {
    await copyTextWithNotify(draft.value.fallbackUrl, {
      successMessage: 'HA 外网地址已复制',
      emptyMessage: '暂无 HA 外网地址可复制',
    })
  }

  /** 校验表单地址；返回错误文案，通过则返回 null。 */
  function validateDraft(): string | null {
    if (!draft.value.url.trim()) return '请先填写局域网 HA 地址'
    const urlErr = validateHaUrlForDeploy(draft.value.url.trim())
    if (urlErr) return urlErr
    if (draft.value.fallbackUrl.trim()) {
      const fallbackErr = validateHaUrlForDeploy(draft.value.fallbackUrl.trim())
      if (fallbackErr) return `外网地址：${fallbackErr}`
    }
    if (!haStore.hasToken && !draft.value.token.trim()) return '请先填写 HA 访问令牌'
    return null
  }

  /** 收窄后的保存载荷：令牌留空表示沿用服务端已保存的令牌。 */
  function buildPayload(reuseToken = false) {
    return {
      baseUrl: draft.value.url.trim(),
      externalBaseUrl: draft.value.fallbackUrl.trim() || null,
      accessToken: draft.value.token.trim() || null,
      verifyTls: draftVerifyTls.value,
      reuseTokenForNewUrl: reuseToken,
    }
  }

  /** 后端要求显式确认「地址变了仍复用旧令牌」时，弹确认后重发。 */
  function isTokenReuseConflict(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false
    const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
    return Boolean(
      detail &&
        typeof detail === 'object' &&
        (detail as { code?: string }).code === 'HA_URL_CHANGED_TOKEN_REUSE',
    )
  }

  async function saveAndReconnect() {
    const invalid = validateDraft()
    if (invalid) {
      saveFeedback.value = { ok: false, message: invalid }
      return
    }
    saveFeedback.value = { message: '配置已保存，正在重连…' }
    await runSave(
      async () => {
        let saved
        try {
          saved = await haStore.save(buildPayload())
        } catch (error) {
          if (!isTokenReuseConflict(error)) throw error
          const reuse = await chrome.confirm(
            'HA 地址已变更：确认继续沿用已保存的访问令牌？仅在新地址可信时这么做。',
            '地址已变更',
            { type: 'danger', confirmText: '沿用令牌', cancelText: '取消' },
          )
          if (!reuse) {
            saveFeedback.value = { ok: false, message: '已取消保存：请重新输入新地址对应的令牌' }
            return
          }
          saved = await haStore.save(buildPayload(true))
        }
        // 令牌已交给服务端，草稿里不再保留明文。
        draft.value.token = ''
        snapshotHaConfigFromStore()
        reconnectStopped = false
        for (let i = 0; i < 15; i++) {
          await new Promise<void>((r) => {
            reconnectResolve = r
            reconnectPollTimer = setTimeout(() => {
              reconnectResolve = null
              r()
            }, 1000)
          })
          if (reconnectStopped) return
          if (entitiesStore.connected) {
            saveFeedback.value = {
              ok: true,
              message: `HA 已重新连接（${entitiesStore.totalCount} 个实体）`,
            }
            await onReconnectSuccess?.()
            return
          }
        }
        if (reconnectStopped) return
        saveFeedback.value = {
          ok: false,
          message: `保存成功，但 15 秒内未检测到 HA 连接，请检查地址与令牌${
            saved?.lastError ? `（${saved.lastError}）` : ''
          }`,
        }
      },
      {
        onError: (e: unknown) => {
          saveFeedback.value = { ok: false, message: getApiErrorMessage(e, '保存失败') }
        },
      },
    )
  }

  async function testConnection() {
    const invalid = validateDraft()
    if (invalid) {
      testResult.value = { ok: false, message: invalid }
      if (!haStore.hasToken) showTokenInput.value = true
      return
    }
    testing.value = true
    testResult.value = null
    try {
      // 探测由 HomeOS 后端发起（Docker/容器内视角），不是浏览器本机可达性。
      // 后端会自行对局域网/外网两路各测一次，并把需要换地址续试的提示写进 lastError。
      const { data } = await testHaConnection(buildPayload())
      const failed = (data.endpoints || []).filter((item) => !item.ok)
      testResult.value = {
        ok: Boolean(data.ok),
        message: data.ok
          ? data.version
            ? `连接成功：HA ${data.version}`
            : '连接成功'
          : `地址不可达：${failed.map((item) => `${item.label}（${item.baseUrl}）`).join('；') || '请检查地址与网络'}`,
        ha_version: data.version || undefined,
      }
    } catch (e) {
      testResult.value = { ok: false, message: getApiErrorMessage(e, '探测失败') }
    } finally {
      testing.value = false
    }
  }

  async function cancelChanges() {
    await confirmAndRevert(
      chrome,
      () => {
        snapshotHaConfigFromStore()
        testResult.value = null
        saveFeedback.value = null
      },
      { title: '放弃更改' },
    )
  }

  onBeforeUnmount(() => {
    reconnectStopped = true
    if (reconnectPollTimer) clearTimeout(reconnectPollTimer)
    if (reconnectResolve) reconnectResolve()
  })

  return {
    haStore,
    draft,
    draftVerifyTls,
    showTokenInput,
    testing,
    testResult,
    saving,
    saveFeedback,
    pendingChanges,
    pendingLabel,
    snapshotHaConfigFromStore,
    copyHaUrl,
    copyHaFallbackUrl,
    saveAndReconnect,
    testConnection,
    cancelChanges,
  }
}
