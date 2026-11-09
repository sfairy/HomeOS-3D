/** F09：创作壳异步加载；嵌入 stage 不付费 creator chrome。 */
import { defineAsyncComponent } from 'vue'

export const StudioPlanPanel = defineAsyncComponent(() => import('@/studio/chrome/creator/StudioPlanPanel.vue'))
export const StudioDialogs = defineAsyncComponent(() => import('@/studio/chrome/creator/StudioDialogs.vue'))
export const StudioOverlays = defineAsyncComponent(() => import('@/studio/chrome/creator/StudioOverlays.vue'))

export const WORKFLOW_STEPS = [
  { id: 'background', label: '导入底图' },
  { id: 'scale', label: '标定比例' },
  { id: 'walls', label: '绘制空间' },
  { id: 'items', label: '摆放物件' },
  { id: 'lights', label: '放置灯光' },
  { id: 'export', label: '应用户型' },
] as const
