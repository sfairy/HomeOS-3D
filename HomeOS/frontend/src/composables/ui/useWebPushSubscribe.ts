/**
 * @file useWebPushSubscribe.ts
 * @module composables/ui
 * @description WebPush 订阅 composable：申请权限 → PushManager.subscribe → 上报后端。
 *
 * 职责：
 * - 申请浏览器通知权限并使用 VAPID 公钥创建推送订阅；
 * - 把订阅 endpoint/keys 上报后端，并提供测试推送能力；
 * - 在不支持 ServiceWorker / PushManager 的浏览器上友好降级提示。
 *
 * 依赖：
 * - vue（ref）
 * - @/services/api/notifications（VAPID 公钥拉取、订阅上报、测试推送）
 * - @/services/notify（异常文案兜底）
 * - @/stores/chrome.store（用户通知）
 */
import { ref } from 'vue'
import {
  fetchWebPushVapidPublicKey,
  subscribeWebPush,
  testWebPush,
} from '@/services/api/notifications'
import { notifyError } from '@/services/notify'
import { useChromeStore } from '@/stores/chrome.store'

/**
 * 把 VAPID 公钥的 base64url 字符串转为 Uint8Array，供 PushManager.subscribe 使用。
 *
 * @param base64String base64url 编码的公钥（可能省略 padding）
 * @returns 长度为 65 的 Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  // 补齐 base64 padding，并把 base64url 转换为 base64
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/**
 * WebPush 订阅 composable。
 *
 * @returns busy 订阅/测试中标志；subscribed 是否已订阅；subscribe 订阅方法；sendTest 测试推送方法
 */
export function useWebPushSubscribe() {
  const chrome = useChromeStore()
  const busy = ref(false)
  const subscribed = ref(false)

  /**
   * 确保 ServiceWorker 已就绪并返回 registration；浏览器不支持时返回 null。
   */
  async function ensureSw(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
    return navigator.serviceWorker.ready
  }

  /**
   * 申请权限并创建 WebPush 订阅，上报后端。
   *
   * @param label 订阅标签（默认"本机浏览器"）
   * @returns 是否订阅成功
   */
  async function subscribe(label?: string): Promise<boolean> {
    busy.value = true
    try {
      const reg = await ensureSw()
      if (!reg) {
        chrome.notify('当前浏览器不支持 Web Push', 'warning')
        return false
      }
      const { data } = await fetchWebPushVapidPublicKey()
      if (!data?.publicKey) {
        chrome.notify('WebPush 未配置 VAPID 公钥', 'warning')
        return false
      }
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        chrome.notify('未授予通知权限', 'warning')
        return false
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey) as BufferSource,
      })
      const json = sub.toJSON()
      // 校验订阅信息完整：endpoint 与 p256dh/auth keys 必须齐备
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('订阅信息不完整')
      }
      await subscribeWebPush({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        label: label || '本机浏览器',
      })
      subscribed.value = true
      chrome.notify('已订阅 WebPush 通知', 'success')
      return true
    } catch (e: unknown) {
      notifyError(e, '订阅 WebPush')
      return false
    } finally {
      busy.value = false
    }
  }

  /**
   * 发送一次测试推送，验证订阅链路可用。
   */
  async function sendTest(): Promise<void> {
    busy.value = true
    try {
      await testWebPush()
      chrome.notify('测试推送已发送', 'success')
    } catch (e: unknown) {
      notifyError(e, '测试推送')
    } finally {
      busy.value = false
    }
  }

  return { busy, subscribed, subscribe, sendTest }
}
