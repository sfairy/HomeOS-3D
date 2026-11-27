import { patchStudioFacadeState } from '../../engine/index'
import { isCourtyardDrawing as isCourtyardDrawing2 } from '../loaders/studio-normalization'
import { lampItemTypeSet } from '../items/item-catalog'
import { type StudioControlElement } from '../studio-app-types'
import { type StudioAppContext } from '../app-context'

export function refreshStepChecklist(appCtx: StudioAppContext) {
  const stepCompletionFlags = {
      background: !!appCtx.studioState.background,
      scale: !!appCtx.studioState.calibration,
      walls: appCtx.studioState.walls.length > 0 || appCtx.studioState.items.some(isCourtyardDrawing2),
      items: appCtx.studioState.items.some((nonLampCheckItem) => !lampItemTypeSet.has(nonLampCheckItem.type)),
      lights: appCtx.studioState.items.some((lampCheckItem) => lampItemTypeSet.has(lampCheckItem.type)),
      export: appCtx.isExporting,
    },
    activeStepName =
      ['background', 'scale', 'walls', 'items', 'lights', 'export'].find(
        (stepKey) => !(stepCompletionFlags as any)[stepKey],
      ) || 'export'
  for (const stepElement of document.querySelectorAll<StudioControlElement>('[data-step]'))
    stepElement.classList.toggle('complete', (stepCompletionFlags as any)[stepElement.dataset.step!]),
      stepElement.classList.toggle('active', stepElement.dataset.step === activeStepName)
  patchStudioFacadeState({ workflowStep: activeStepName })
  for (const stepButton of document.querySelectorAll<HTMLElement>('.sc-workflow__step[data-step]')) {
    const stepId = stepButton.getAttribute('data-step') || ''
    stepButton.classList.toggle('is-complete', !!(stepCompletionFlags as any)[stepId])
    stepButton.classList.toggle('is-active', stepId === activeStepName)
  }
}

/**
 * 绘制工具的帮助文案表（0.8.9 的 `toolHelpMessages`）。
 *
 * 从 `boot.ts` 切出来：该文件在 studio split 预算（4200 行）上，而这张表是**纯数据**，
 * 与启动流程无关。留在 boot 里既让预算吃紧，也让「新增工具要同时补文案」这条规则
 * 埋在一个 4000 行文件的中间。
 *
 * ## 为什么必须有这一条
 *
 * `selectStudioTool` 按「有没有帮助文案」判定工具是否有效 —— 缺一条的表现是
 * 「点了按钮没反应」，且没有任何报错。新增工具时**必须**同时在这里加一行。
 */

export const toolHelpMessages: Record<string, [string, string]> = {
  'courtyard-area': ['庭院地面', '圈出区域或拖画矩形，选择草坪、木平台、铺装；靠近墙面吸附，Enter 完成'],
  'courtyard-path': ['汀步路径', '逐点画路线，自动排列汀步；Enter 完成，Esc 取消'],
  'courtyard-gate': ['庭院门', '靠近围挡预览门洞，点击放置；门款在右侧属性栏选择，Esc 退出'],
  'courtyard-fence': ['庭院围挡', '逐点画路线，选择矮墙、木栅或绿篱；Enter 完成'],
  flooropening: ['楼板洞口', '拖出矩形洞口；仅切除当前层楼板，楼梯通往上层时请在上层开洞。Esc 取消'],
  // 0.8.9 地面分区：点选一块室内地面 → 换铺面（跟随主题 / 原色 / 浅色）或画分割线切成两块。
  // 没有这条文案时 `selectStudioTool` 会**静默拒绝**（它按「有没有帮助文案」判定工具是否有效），
  // 表现为「点了按钮没反应」，所以新增工具必须同时补这里。
  'floor-region': ['地面分区', '点选有闭合墙体的室内地面：可换铺面、调深浅，或画一条线把它切成两块。Esc 退出'],
  select: [
    '选择工具',
    '移动时 Shift 锁轴；缩放时 Shift 等比例、拖多少就是多少（任意尺寸）；Option/Alt 拖动复制；⌘/Ctrl+C、V 复制粘贴',
  ],
  pan: ['平移画布', '按住左键拖动即可平移画布；滚轮缩放；中键或按住空格拖动同样可平移'],
  scale: ['参考线工具', '依次单击两个端点；按住 Shift 强制锁定水平或垂直轴线'],
  wall: ['连续画墙', '逐点绘制并回到起点闭合空间；未闭合不会生成地面，按住 Shift 锁轴，Esc 结束'],
  window: ['窗户工具', '靠近墙体单击，窗户会自动吸附并生成真实窗洞'],
  door: ['门工具', '靠近墙体单击，门会自动吸附并生成门洞；选中后可翻转开启方向'],
  railing: ['玻璃栏杆', '靠近墙体单击，栏杆会吸附到墙段并替换对应的实体墙'],
  label: ['户型铭牌', '单击画布放置；选中后可修改文字、拖动、缩放和旋转'],
}
