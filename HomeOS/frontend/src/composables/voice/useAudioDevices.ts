/**
 * @file useAudioDevices.ts
 * @module composables/voice
 * @description 本机麦克风 / 扬声器枚举与每客户端偏好（localStorage）。
 *
 * 设备 ID 按浏览器本地存储，不进全局 app config（墙面板互不相同）。
 */
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from '@/utils/core/local-storage.util'

import { onMounted, onUnmounted, ref, computed } from 'vue'
import { logger } from '@/utils/core/logger'

const INPUT_KEY = 'homeos_audio_input_device_id'
const OUTPUT_KEY = 'homeos_audio_output_device_id'

type AudioDeviceInfo = {
  deviceId: string
  label: string
  groupId: string
  kind: 'audioinput' | 'audiooutput'
}

type MicPermissionState = 'unknown' | 'granted' | 'denied' | 'prompt' | 'unsupported'

function readStoredId(key: string): string {
  if (typeof localStorage === 'undefined') return ''
  return readLocalStorage(key) || ''
}

function writeStoredId(key: string, id: string) {
  if (typeof localStorage === 'undefined') return
  const v = String(id || '').trim()
  if (!v) removeLocalStorage(key)
  else writeLocalStorage(key, v)
}

/**
 * 同步读取本机输入设备偏好（HA STT 录音用）。
 */
export function getPreferredAudioInputDeviceId(): string {
  return readStoredId(INPUT_KEY)
}

/** 清除失效的本机麦克风偏好（设备拔出 / ID 过期）。 */
function clearPreferredAudioInputDeviceId() {
  writeStoredId(INPUT_KEY, '')
}

function isNoDeviceError(err: unknown) {
  const name = err instanceof DOMException ? err.name : ''
  return name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError'
}

/**
 * 打开一条麦克风流：先按本机偏好（ideal），失败再默认设备，再逐个枚举尝试。
 */
export async function openAudioInputStream(): Promise<MediaStream> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw Object.assign(new Error('需 HTTPS 安全上下文才能访问麦克风'), { name: 'SecurityError' })
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('浏览器不支持麦克风'), { name: 'NotSupportedError' })
  }

  const preferredId = getPreferredAudioInputDeviceId()
  const attempts: MediaStreamConstraints[] = []
  if (preferredId) {
    attempts.push({ audio: { deviceId: { ideal: preferredId } } })
  }
  attempts.push({ audio: true })

  let lastErr: unknown
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (e) {
      lastErr = e
      logger.debug('打开麦克风失败,尝试下一方案', e)
    }
  }

  if (preferredId && isNoDeviceError(lastErr)) {
    clearPreferredAudioInputDeviceId()
  }

  try {
    const list = await navigator.mediaDevices.enumerateDevices()
    const inputs = list.filter((d) => d.kind === 'audioinput' && d.deviceId)
    for (const device of inputs) {
      if (device.deviceId === preferredId) continue
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: device.deviceId } },
        })
      } catch (e) {
        lastErr = e
        logger.debug(`打开麦克风失败 [${device.deviceId.slice(0, 8)}]`, e)
      }
    }
  } catch (e) {
    logger.debug('枚举麦克风失败', e)
  }

  throw lastErr || Object.assign(new Error('未检测到麦克风'), { name: 'NotFoundError' })
}

type MicProbe = {
  secure: boolean
  host: string
  inputCount: number
  permission: string
  errorName: string
}

function mediaErrorName(err: unknown) {
  if (err instanceof DOMException && err.name) return err.name
  if (err && typeof err === 'object' && 'name' in err) return String((err as { name?: string }).name || '')
  return ''
}

/** 当前页面能否看到麦克风（失败时用于给出准确提示，不打开录音）。 */
export async function probeMicrophone(err?: unknown): Promise<MicProbe> {
  const secure = typeof window !== 'undefined' && window.isSecureContext
  const host = typeof window !== 'undefined' ? window.location.host || 'unknown' : ''
  let inputCount = 0
  let permission = 'unknown'
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      permission = status.state
    }
  } catch {
    /* permissions.query(microphone) 在部分浏览器不可用 */
  }
  try {
    if (navigator.mediaDevices?.enumerateDevices) {
      const list = await navigator.mediaDevices.enumerateDevices()
      inputCount = list.filter((d) => d.kind === 'audioinput').length
    }
  } catch {
    /* 枚举失败视为 0 */
  }
  return {
    secure,
    host,
    inputCount,
    permission,
    errorName: mediaErrorName(err),
  }
}

/** isEmbeddedBrowser：函数，按签名入参返回处理结果。 */
export function isEmbeddedBrowser() {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/Electron/i.test(ua)) return true
  try {
    return window.top !== window.self
  } catch {
    return true
  }
}

/**
 * 同步读取本机输出设备偏好（setSinkId 用）。
 */
function getPreferredAudioOutputDeviceId(): string {
  return readStoredId(OUTPUT_KEY)
}

/**
 * 将已选扬声器应用到 HTMLMediaElement（Chromium setSinkId）。
 */
async function applyOutputSink(el: HTMLMediaElement | null | undefined): Promise<boolean> {
  if (!el) return false
  const sinkId = getPreferredAudioOutputDeviceId()
  if (!sinkId) return false
  const anyEl = el as HTMLMediaElement & {
    setSinkId?: (id: string) => Promise<void>
  }
  if (typeof anyEl.setSinkId !== 'function') return false
  try {
    await anyEl.setSinkId(sinkId)
    return true
  } catch (e) {
    logger.debug('setSinkId 失败', e)
    return false
  }
}

/**
 * 本机音视频设备 composable。
 */
export function useAudioDevices() {
  const inputs = ref<AudioDeviceInfo[]>([])
  const outputs = ref<AudioDeviceInfo[]>([])
  const inputDeviceId = ref(getPreferredAudioInputDeviceId())
  const outputDeviceId = ref(getPreferredAudioOutputDeviceId())
  const permission = ref<MicPermissionState>('unknown')
  const loading = ref(false)
  const errorTip = ref('')
  const secureContext = typeof window !== 'undefined' ? window.isSecureContext : false
  const mediaSupported =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.enumerateDevices

  const inputOptions = computed(() =>
    inputs.value.map((d) => ({
      value: d.deviceId,
      label: d.label || `麦克风 ${d.deviceId.slice(0, 8)}`,
    })),
  )
  const outputOptions = computed(() =>
    outputs.value.map((d) => ({
      value: d.deviceId,
      label: d.label || `扬声器 ${d.deviceId.slice(0, 8)}`,
    })),
  )
  const selectedInputLabel = computed(() => {
    const id = inputDeviceId.value
    if (!id) return '系统默认'
    return inputOptions.value.find((o) => o.value === id)?.label || id.slice(0, 12)
  })
  const selectedOutputLabel = computed(() => {
    const id = outputDeviceId.value
    if (!id) return '系统默认'
    return outputOptions.value.find((o) => o.value === id)?.label || id.slice(0, 12)
  })
  const supportsSetSinkId = computed(() => {
    if (typeof HTMLMediaElement === 'undefined') return false
    return typeof (HTMLMediaElement.prototype as { setSinkId?: unknown }).setSinkId === 'function'
  })

  async function probePermission(): Promise<MicPermissionState> {
    if (!secureContext || !navigator.mediaDevices?.getUserMedia) {
      permission.value = 'unsupported'
      return permission.value
    }
    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        })
        const state = status.state as MicPermissionState
        permission.value = state === 'granted' || state === 'denied' || state === 'prompt' ? state : 'unknown'
        return permission.value
      }
    } catch {
      // permissions API 对 microphone 可能不可用
    }
    return permission.value
  }

  /**
   * 请求麦克风权限并刷新设备列表（拿到 label）。
   */
  async function ensureMicPermission(): Promise<boolean> {
    errorTip.value = ''
    if (!secureContext) {
      errorTip.value = '需 HTTPS 安全上下文才能访问麦克风'
      permission.value = 'unsupported'
      return false
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      errorTip.value = '浏览器不支持麦克风'
      permission.value = 'unsupported'
      return false
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      permission.value = 'granted'
      await refreshDevices()
      return true
    } catch (e) {
      permission.value = 'denied'
      errorTip.value = '麦克风权限被拒绝，请在浏览器设置中允许'
      logger.debug('麦克风权限失败', e)
      return false
    }
  }

  /**
   * 枚举本机音频设备。
   */
  async function refreshDevices() {
    if (!mediaSupported) {
      inputs.value = []
      outputs.value = []
      return
    }
    loading.value = true
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      inputs.value = list
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || '',
          groupId: d.groupId || '',
          kind: 'audioinput' as const,
        }))
      outputs.value = list
        .filter((d) => d.kind === 'audiooutput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || '',
          groupId: d.groupId || '',
          kind: 'audiooutput' as const,
        }))

      // 已选设备被拔掉时回退默认
      if (inputDeviceId.value && !inputs.value.some((d) => d.deviceId === inputDeviceId.value)) {
        setInputDeviceId('')
      }
      if (outputDeviceId.value && !outputs.value.some((d) => d.deviceId === outputDeviceId.value)) {
        setOutputDeviceId('')
      }
    } catch (e) {
      logger.debug('enumerateDevices 失败', e)
      errorTip.value = '无法枚举音频设备'
    } finally {
      loading.value = false
    }
  }

  function setInputDeviceId(id: string) {
    inputDeviceId.value = String(id || '').trim()
    writeStoredId(INPUT_KEY, inputDeviceId.value)
  }

  function setOutputDeviceId(id: string) {
    outputDeviceId.value = String(id || '').trim()
    writeStoredId(OUTPUT_KEY, outputDeviceId.value)
  }

  function onDeviceChange() {
    void refreshDevices()
  }

  onMounted(() => {
    void probePermission().then(() => refreshDevices())
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
    }
  })

  onUnmounted(() => {
    if (navigator.mediaDevices?.removeEventListener) {
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
    }
  })

  return {
    inputs,
    outputs,
    inputDeviceId,
    outputDeviceId,
    inputOptions,
    outputOptions,
    selectedInputLabel,
    selectedOutputLabel,
    permission,
    loading,
    errorTip,
    secureContext,
    mediaSupported,
    supportsSetSinkId,
    ensureMicPermission,
    refreshDevices,
    setInputDeviceId,
    setOutputDeviceId,
    applyOutputSink,
  }
}
