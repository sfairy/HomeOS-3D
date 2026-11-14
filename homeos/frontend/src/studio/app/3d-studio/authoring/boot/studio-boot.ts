/**
 * 引导序列（原 `studio-app.ts` 里的顶层 `startupStudio()`）：建渲染器 → 拉草稿 → 净化文档 →
 * 应用草稿 → 按嵌入与否挂载舞台 / 打开导出面板，失败时按嵌入契约向宿主报错。
 *
 * 从 `studio-app.ts` 单体切出（P4）。它是**编排**，不是实现：15 个外部依赖全部按 deps 显式传入，
 * 其中 `stageLoadTiming` 是文件顶层的计时器单例（必须与宿主共用同一个实例，新建一个会把耗时算丢）。
 * 只有一个调用点（宿主闭包末尾的 `startupStudio();`），所以不需要源侧薄绑定。
 */

import { ensureRegistryComponents } from '../../../renderer/registry'
import {
  createDashboardFonts,
  reportDashboardFontError,
  type DashboardFontsController,
} from '../../../shared/dashboard-fonts'
import { prepareSceneDocument as prepareSceneDocument2 } from '../../cache/scene-persistent-cache'
import { stageStartup as stageStartup2 } from '../../stage-startup'
import { STUDIO_COMPAT_NOTICE, studioCompatModeSource } from '../../studio-gpu-compat'
import {
  studioStartupActive,
  studioStartupFail,
  studioStartupPhase,
  studioStartupReady,
  studioStartupWait,
} from '@/shared/utils/ui/studio-startup'

/** 引导序列需要的外部状态：入口判定 / 取数 / 渲染器与舞台挂载 / 状态提示 / 嵌入契约。 */
interface StudioBootDeps {
  isStudioEntry: boolean
  isEmbeddedStage: boolean
  isAutoDiagramEmbed: boolean
  autoDiagramComponentId: any
  projectNameElement: any
  stageLoadTiming: (label: string) => void
  showSaveState: (text: string, state: string) => void
  showToast: (text: string, state: string) => void
  fetchStudioApi: (path: string, options: any, response: any) => Promise<any>
  createStudioRenderer: () => void
  resizePlanStage: () => void
  applyLoadedDraft: (payload: any, sceneDocument: any) => Promise<any>
  runStudioRenderLoop: () => any
  openExportPanel: () => void
  normalizeDocument: (rawDocument: any) => any
}

/** `/3d-studio?fontChinese=…` 打开时的仪表盘字体；SPA 内离开户型图时由 `disposeStudioFonts` 撤掉。 */
let studioFonts: DashboardFontsController | null = null

/**
 * 编辑器「户型图绘制」带上当前仪表盘字体（0.8.6）：独立户型图只写 `--hb-dashboard-font`
 * 供 canvas 名牌 / 标注使用，不改编辑界面字体；自动导图嵌入页整页跟随。
 */
async function applyStudioFontsFromQuery(applyToDom: boolean) {
  const searchParams = new URLSearchParams(window.location.search)
  if (!searchParams.has('fontChinese')) return
  disposeStudioFonts()
  studioFonts = createDashboardFonts(document.documentElement, {
    applyToDom,
    onError: reportDashboardFontError('studio-fonts'),
  })
  await studioFonts.apply({
    chinese: searchParams.get('fontChinese') || 'device',
    latin: searchParams.get('fontLatin') || 'device',
  })
}

/** 走 stage 预热时字体已随草稿并行加载；否则（独立户型图 / 自动导图）在这里按查询串加载。 */
function waitForStudioFonts(applyToDom: boolean) {
  return stageStartup2 ? stageStartup2.fontReady : applyStudioFontsFromQuery(applyToDom)
}

export function disposeStudioFonts() {
  studioFonts?.dispose()
  studioFonts = null
}

/**
 * 兼容模式是**自动**触发的（近期反复出现 GPU 故障），必须让用户知道画质为什么变低、
 * 以及怎么退出 —— 否则「怎么突然糊了」会被当成又一个 bug。
 * 抽出成函数是为了不给 `startupStudio` 增加复杂度（前端复杂度是棘轮门禁）。
 */
function announceStudioCompatMode(deps: StudioBootDeps): void {
  const source = studioCompatModeSource()
  if (!source) return
  deps.showToast(STUDIO_COMPAT_NOTICE, 'warning')
  window.HomeOSLog?.warn?.(STUDIO_COMPAT_NOTICE, {
    phase: 'studio-gpu-compat',
    source,
  })
}

export async function startupStudio(deps: StudioBootDeps) {
  if (!deps.isStudioEntry) {
    deps.showSaveState('地址无效', 'error')
    return
  }
  // 首屏遮罩（`/static/3d-studio/studio-loading.js`）是否在管这一屏。为 false 时下面所有
  // 阶段调用都是 no-op —— 嵌入态 / 自动导图 / 直接 vite dev 都没有遮罩。
  const overlayActive = studioStartupActive()
  try {
    // 阶段①：先把「正在准备户型模型…」这一帧真正画出来，再开始初始化渲染器与等组件 chunk。
    // 少了这一帧等待，浏览器会一口气把主线程占满，用户看到的永远是初始文案。
    if (overlayActive) {
      studioStartupPhase('正在准备户型模型…')
      await studioStartupWait(new Promise(requestAnimationFrame))
    }
    // 组件族是动态 chunk：先等注册表就绪，否则面板会先画成「控件尚未实现」再被替换。
    // 与建渲染器并行等待，避免串行化这两段互不依赖的启动工作。
    // 注册表与草稿往返、文档准备互不依赖：先发起，在应用草稿（首次可能画面板）之前再等它。
    const registryReady = ensureRegistryComponents()
    registryReady.catch(() => {})
    deps.createStudioRenderer(), deps.stageLoadTiming('renderer-created'), deps.resizePlanStage()
    announceStudioCompatMode(deps)
    // 阶段②：渲染器就位，接下来是一次草稿往返 —— 这时说「读取户型」才是用户真正在等的事。
    studioStartupPhase('正在读取户型…')
    const draftRequest = deps.fetchStudioApi(stageStartup2?.path || '/studio3d', {}, stageStartup2?.response)
    // 草稿请求与遮罩共用中止信号：用户点重试 / 关页面时不再白等一次往返。
    const xa3 = await (overlayActive ? studioStartupWait(draftRequest) : draftRequest)
    ;(deps.projectNameElement.textContent = '户型图绘制'),
      deps.stageLoadTiming('draft-fetched'),
      (document.title = '户型图绘制')
    let sceneDocument: any = null
    if (stageStartup2) {
      const { cache: startupCache, key: startupKey } = stageStartup2,
        preparedDocument = prepareSceneDocument2(xa3, startupCache.peek(startupKey), deps.normalizeDocument)
      ;(sceneDocument = preparedDocument.document),
        deps.stageLoadTiming(preparedDocument.reused ? 'scene-preparation-reused' : 'scene-preparation-built'),
        preparedDocument.reused || startupCache.schedule(startupKey, xa3, sceneDocument)
    }
    await waitForStudioFonts(deps.isAutoDiagramEmbed)
    // 阶段③：整篇草稿落进文档模型后，真正的建场景在下一帧的 rAF 里跑（requestSceneRebuild）。
    // 文案在这里换成「构建」，用户才不会以为还卡在网络请求上。
    studioStartupPhase('正在构建户型…')
    await registryReady
    if ((await deps.applyLoadedDraft(xa3, sceneDocument), deps.stageLoadTiming('draft-loaded'), deps.isEmbeddedStage)) {
      const module = await stageStartup2!.module
      await new Promise(requestAnimationFrame),
        module.mountStage(deps.runStudioRenderLoop()),
        deps.stageLoadTiming('stage-mounted')
      return
    }
    deps.showSaveState('已自动保存', 'saved'),
      deps.autoDiagramComponentId &&
        (deps.isAutoDiagramEmbed ? deps.openExportPanel() : window.setTimeout(() => deps.openExportPanel(), 180))
    // 阶段④：等建场景那一帧落地再撤遮罩。这里等的两帧不是凑数——第一帧跑 rebuild，
    // 第二帧才有真实画面；提前撤掉会让用户看见一帧空壳。
    if (overlayActive) {
      studioStartupPhase('正在准备预览画面…')
      await studioStartupWait(new Promise(requestAnimationFrame))
      await studioStartupWait(new Promise(requestAnimationFrame))
      studioStartupReady()
    }
  } catch (startupError: any) {
    // 失败优先交给遮罩：它负责「暂时无法打开 + 原因 + 重新加载」，比擦肩而过的 toast 有用得多。
    // 遮罩不在管这一屏（嵌入态 / 直接 dev）时下面照样按原契约报错。
    studioStartupFail(startupError?.message)
    if (deps.isEmbeddedStage) {
      window.parent.postMessage(
        {
          channel: 'hb-i3d-v1',
          type: 'error',
          message: startupError.message || '无法载入3D户型。',
        },
        window.location.origin,
      )
    }
    deps.showSaveState('载入失败', 'error'), deps.showToast(startupError.message || '无法载入项目。', 'error')
  }
}
