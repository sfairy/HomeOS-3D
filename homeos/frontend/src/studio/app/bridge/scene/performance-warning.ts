import { normalizeGroundReflection as normalizeGroundReflection } from './reflection-settings'
import { shellConfirm } from '@/studio/platform/shell-chrome'

export function performanceWarnings(currentProperties: any, nextProperties: any) {
  const warningMessages: any[] = []
  if (
    (nextProperties.renderScale > 1 &&
      nextProperties.renderScale > (currentProperties.renderScale ?? 1) &&
      warningMessages.push('高清渲染需要处理更多画面像素。'),
    nextProperties.motionRenderScale >= 0.8 &&
      nextProperties.motionRenderScale > (currentProperties.motionRenderScale ?? 0) &&
      warningMessages.push('较高的转动分辨率会增加旋转和聚焦过渡时的绘制开销。'),
    nextProperties.groundReflection)
  ) {
    const currentReflection = normalizeGroundReflection(currentProperties.groundReflection),
      nextReflection = normalizeGroundReflection(nextProperties.groundReflection),
      resolveReflectionLevel = (reflectionSettings: any) =>
        reflectionSettings.strength === 0 || reflectionSettings.mode === 'off'
          ? 0
          : reflectionSettings.mode === 'all'
            ? 2
            : 1,
      currentReflectionLevel = resolveReflectionLevel(currentReflection),
      nextReflectionLevel = resolveReflectionLevel(nextReflection)
    nextReflectionLevel > currentReflectionLevel &&
      warningMessages.push(
        nextReflectionLevel === 2 ? '室内和室外同时反射，需要额外绘制两组倒影。' : '地面反射需要额外绘制倒影。',
      ),
      nextReflectionLevel &&
        nextReflection.resolution > 512 &&
        (nextReflection.resolution > currentReflection.resolution || !currentReflectionLevel) &&
        warningMessages.push('高反射清晰度会增加倒影的绘制开销和显存占用。')
  }
  return warningMessages
}

export async function confirmPerformanceWarning(
  warningLines: string[],
  { signal: abortSignal }: { document?: Document; signal?: AbortSignal } = {},
) {
  if (!warningLines.length) return true
  if (abortSignal?.aborted) return false
  const confirmed = await shellConfirm({
    title: '画质与流畅度提示',
    message:
      warningLines.join('\n') +
      '\n\n手机、iPad 或性能较低的设备可能出现掉帧、发热或耗电增加。如果不够流畅，可以降低画质或关闭反射。',
    confirmLabel: '继续应用',
    cancelLabel: '取消',
  })
  return !abortSignal?.aborted && confirmed
}
