/** 通用远程校验 composable */
import { ref } from 'vue'
import { apiGet, apiPost } from '@/services/api/index'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'

/**
 * 统一远程校验状态。
 */
export function useYamlValidation({
  method = 'post',
  endpoint,
  buildBody = (yaml: string) => ({ yaml }),
  buildParams,
  request,
  mapMessage = (data: Record<string, unknown>, ok: boolean) => {
    if (data?.message) return String(data.message)
    if (data?.error) return String(data.error)
    const errs = data?.errors
    if (Array.isArray(errs) && errs.length) {
      const first = errs[0]
      if (typeof first === 'string') return first
      if (first && typeof first === 'object' && 'message' in first) {
        return String((first as { message: unknown }).message)
      }
    }
    return ok ? '校验通过' : '校验未通过'
  },
}: {
  method?: 'get' | 'post'
  endpoint?: string
  buildBody?: (yaml: string) => Record<string, unknown>
  buildParams?: (yaml: string) => Record<string, unknown>
  request?: (yaml: string) => Promise<Record<string, unknown>>
  mapMessage?: (data: Record<string, unknown>, ok: boolean) => string
} = {}) {
  /** 校验请求进行中 */
  const validating = ref(false)
  /** 校验结果：true 通过、false 未通过、null 未校验过 */
  const valid = ref<boolean | null>(null)
  /** 校验结果消息（成功/失败描述） */
  const message = ref<string>('')

  /**
   * 调用后端校验端点
   */
  async function validate(yamlText: string) {
    if (!endpoint && !request) return { valid: false, message: '未配置校验端点' }
    validating.value = true
    valid.value = null
    message.value = ''
    try {
      let row: Record<string, unknown>
      if (request) {
        row = (await request(yamlText)) || {}
      } else {
        const requestPromise =
          method === 'get'
            ? apiGet(endpoint!, { params: buildParams?.(yamlText) ?? {} })
            : apiPost(endpoint!, buildBody(yamlText))
        const { data } = await requestPromise
        row = (data || {}) as Record<string, unknown>
      }
      const ok = Boolean(row.valid ?? row.ok)
      valid.value = ok
      message.value = mapMessage(row, ok)
      return { valid: ok, message: message.value, data: row }
    } catch (e) {
      valid.value = false
      message.value = getApiErrorMessage(e, '校验请求失败')
      return { valid: false, message: message.value }
    } finally {
      validating.value = false
    }
  }

  /** 重置校验状态 */
  function reset() {
    validating.value = false
    valid.value = null
    message.value = ''
  }

  return { validating, valid, message, validate, reset }
}
