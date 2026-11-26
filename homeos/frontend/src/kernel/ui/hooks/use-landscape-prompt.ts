/**
 * 「请横屏使用」提示层：只在**手机竖屏**出现。
 *
 * 项目定位是大屏 / 平板 / 手机横屏，不做竖屏排版。iOS Safari 没有
 * `screen.orientation.lock()`，浏览器内无法自动旋转系统 UI；所以：Android 用
 * 「全屏 + 方向锁」，iOS 只能提示用户旋转设备或「添加到主屏幕」（PWA 的 manifest
 * `orientation` 在已安装时才会真正锁横屏）。
 *
 * 刻意**不**用 CSS `rotate(90deg)` 伪横屏：那会让 3D 舞台的指针坐标、
 * `getBoundingClientRect`、软键盘定位、原生 dialog 全失真。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { isPhoneViewport } from '@/kernel/utils/layout/canvas-layout.util'

export function useLandscapePrompt() {
  const width = ref(typeof window !== 'undefined' ? window.innerWidth : 1366)
  const height = ref(typeof window !== 'undefined' ? window.innerHeight : 1024)
  /** 用户点了「继续竖屏使用」：本次竖屏期间不再打扰，转回横屏后重置。 */
  const dismissed = ref(false)
  const locking = ref(false)
  const hint = ref('')

  const portrait = computed(() => height.value > width.value)
  const phonePortrait = computed(() => portrait.value && isPhoneViewport(width.value, height.value))
  const visible = computed(() => phonePortrait.value && !dismissed.value)

  let raf: number | null = null
  function syncSize() {
    if (raf !== null) return
    raf = requestAnimationFrame(() => {
      raf = null
      width.value = window.innerWidth
      height.value = window.innerHeight
      if (!portrait.value) dismissed.value = false
    })
  }

  async function requestLandscape() {
    if (locking.value) return
    locking.value = true
    hint.value = ''
    try {
      const target = document.documentElement
      if (!document.fullscreenElement && target.requestFullscreen) {
        await target.requestFullscreen().catch(() => undefined)
      }
      const orientation = screen.orientation as
        | (ScreenOrientation & {
            lock?: (o: string) => Promise<void>
          })
        | undefined
      if (orientation?.lock) {
        await orientation.lock('landscape')
        hint.value = ''
        return
      }
      hint.value = '当前浏览器不支持自动横屏，请旋转设备或将本站「添加到主屏幕」后打开。'
    } catch {
      hint.value = '自动横屏不可用：请旋转设备，或将本站「添加到主屏幕」后打开。'
    } finally {
      locking.value = false
    }
  }

  function dismiss() {
    dismissed.value = true
  }

  onMounted(() => {
    window.addEventListener('resize', syncSize, { passive: true })
    window.addEventListener('orientationchange', syncSize, { passive: true })
  })
  onBeforeUnmount(() => {
    window.removeEventListener('resize', syncSize)
    window.removeEventListener('orientationchange', syncSize)
    if (raf !== null) cancelAnimationFrame(raf)
  })

  return { visible, locking, hint, requestLandscape, dismiss }
}
