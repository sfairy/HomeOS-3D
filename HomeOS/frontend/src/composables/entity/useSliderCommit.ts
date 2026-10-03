/**
 * @file useSliderCommit.ts
 * @module frontend/src/composables
 */
import { ref, watch, unref, computed, type MaybeRefOrGetter } from 'vue'
import { snapToSliderStep, sliderTrackStyle } from '@/utils/ui/progress-bar.util'

type SliderTrackOpts = {
  min?: number
  max?: number
  step?: number
  value?: number
  variant?: string
  color?: string
  colorEnd?: string
  trackColor?: string
  colorValue?: number
  [key: string]: unknown
}

type SliderCommitOptions = {
  onCommit?: (val: number) => void
  parse?: (v: unknown) => number
  track?: SliderTrackOpts | (() => SliderTrackOpts) | null
  /** 回调入参使用双变（bivariant），便于调用方解构必填的 min/max/step */
  buildTrackStyle?: {
    bivarianceHack(
      value: number,
      trackOpts: SliderTrackOpts,
    ): Record<string, string | number | undefined>
  }['bivarianceHack'] | null
}

/**
 * 拖拽本地滑块值并在释放/变更时提交。
 * 拖拽期间忽略外部源更新。
 *
 * @param {import('vue').MaybeRefOrGetter<number>} source
 * @param {{
 *   onCommit?: (val: number) => void
 *   parse?: (v: unknown) => number
 *   track?: Record<string, unknown> | (() => Record<string, unknown>) — 轨道样式选项（不含 value）；传函数以便读取动态 min/max/step
 *   buildTrackStyle?: (value: number, trackOpts: Record<string, unknown>) => Record<string, unknown> — 自定义轨道 CSS 变量
 * }} [options]
 */
export function useSliderCommit(
  source: MaybeRefOrGetter<number>,
  { onCommit, parse = (v: unknown) => Number(v), track = null, buildTrackStyle = null }: SliderCommitOptions = {},
) {
  const localValue = ref(parse(unref(source)))
  const isDragging = ref(false)
  function resolveTrackOpts(): SliderTrackOpts {
    return typeof track === 'function' ? track() : track || {}
  }
  function alignToStep(value: unknown) {
    const opts = resolveTrackOpts()
    const { step, min, max } = opts
    if (step != null && step > 0 && min != null && max != null) {
      return snapToSliderStep(Number(value), min, max, step)
    }
    return Number(value)
  }
  watch(
    () => unref(source),
    (v) => {
      if (!isDragging.value && v != null && !Number.isNaN(parse(v))) {
        localValue.value = alignToStep(parse(v))
      }
    },
    { immediate: true },
  )
  const rangeValue = computed(() => alignToStep(localValue.value))
  const trackStyle =
    track || buildTrackStyle
      ? computed(() => {
          const opts = resolveTrackOpts()
          const val = rangeValue.value
          if (buildTrackStyle) return buildTrackStyle(val, opts)
          return sliderTrackStyle({ ...opts, value: val, step: opts.step })
        })
      : undefined
  function onInput(e: Event | { target?: { value?: string } } | number | string) {
    isDragging.value = true
    const raw =
      typeof e === 'object' && e != null && 'target' in e ? (e.target as { value?: string })?.value : e
    localValue.value = alignToStep(parse(raw))
  }
  function commit() {
    if (!isDragging.value) return
    isDragging.value = false
    onCommit?.(localValue.value)
  }
  function onChange(e: Event | { target?: { value?: string } } | number | string) {
    const raw =
      typeof e === 'object' && e != null && 'target' in e
        ? (e.target as { value?: string })?.value
        : localValue.value
    localValue.value = alignToStep(parse(raw))
    isDragging.value = false
    onCommit?.(localValue.value)
  }
  return { localValue, rangeValue, trackStyle, isDragging, onInput, onChange, commit }
}
