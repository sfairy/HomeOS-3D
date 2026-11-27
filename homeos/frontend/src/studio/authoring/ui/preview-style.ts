import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import { baseLightingForCurrentStyle } from '../lights/lighting'
import { normalizeSceneStyle, sceneStyleLabel, type SceneStyleId } from '../../app/shared/scene-styles'
import * as three from '/static/vendor/three/0.187.0/three.module.min.js'
import { type StudioAppContext } from '../app-context'
import { createNaturalWoodMaterials, type NaturalWoodMaterialLibrary } from '../materials/natural-wood/natural-wood-materials'
import { createNaturalWoodEnvironment } from '../materials/natural-wood/natural-wood-environment'
import { reportDegradation } from '../../app/shared/diagnostics/degradation'
import { setActiveNaturalWoodLibrary } from '../materials/natural-wood/natural-wood-model-theme'

/**
 * 预览风格（0.8.7 `#editor-scene-style`）的读写与应用。
 *
 * 为什么是 localStorage 而不是写进草稿：风格是**这台设备上预览用什么材质**的偏好，
 * 不是户型数据。0.8.7 用 `ha-bridge:studio:preview-style` 存裸字符串，
 * 换设备 / 清存储就回到默认，不会把「我在别的机器上选的木纹」写进共享草稿。
 *
 * 与草稿里 `project.sceneStyle` 的关系：草稿里那一份供导出与嵌入舞台使用；
 * 编辑器里的预览偏好优先级更高。没选过时回落到草稿值，再回落到默认。
 */

export const PREVIEW_STYLE_STORAGE_KEY = 'ha-bridge:studio:preview-style'

/** 读取预览风格；未设置或不可用时返回 `null`（调用方决定回落到草稿还是默认）。 */
export function readPreviewStyle(): SceneStyleId | null {
  try {
    const raw = localStorage.getItem(PREVIEW_STYLE_STORAGE_KEY)
    if (!raw) return null
    // 允许历史值带引号（曾按 JSON 写入过），两种都认。
    return normalizeSceneStyle(raw.replace(/^"|"$/g, ''))
  } catch {
    return null
  }
}

function persistPreviewStyle(style: SceneStyleId): void {
  try {
    localStorage.setItem(PREVIEW_STYLE_STORAGE_KEY, style)
  } catch {
    /* 存储不可用时仅本次生效 */
  }
}

/** 编辑器预览用的风格：本机偏好优先，其次草稿，最后默认。 */
export function previewStyleOrDefault(draftStyle: unknown): SceneStyleId {
  return readPreviewStyle() ?? normalizeSceneStyle(draftStyle)
}

/** 切换风格时要保持不动的相机状态（重建楼层会把机位重置成「适配视图」）。 */
interface CameraHold {
  position: { x: number; y: number; z: number; clone: () => unknown; copy: (v: unknown) => void }
  target: { clone: () => unknown; copy: (v: unknown) => void }
  upClone: unknown
  zoom: number
  near: number
  far: number
}

function holdCamera(runtime: StudioAppRuntime): CameraHold | null {
  const camera = runtime.appCtx.threeCamera
  const controls = runtime.appCtx.orbitControls
  if (!camera || !controls?.target) return null
  return {
    position: {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      clone: () => camera.position.clone(),
      copy: (value) => camera.position.copy(value),
    },
    target: { clone: () => controls.target.clone(), copy: (value) => controls.target.copy(value) },
    upClone: camera.up.clone(),
    zoom: camera.zoom,
    near: camera.near,
    far: camera.far,
  }
}

function restoreCamera(runtime: StudioAppRuntime, held: CameraHold | null): void {
  const camera = runtime.appCtx.threeCamera
  const controls = runtime.appCtx.orbitControls
  if (!held || !camera || !controls?.target) return
  camera.position.copy(held.position.clone())
  camera.up.copy(held.upClone as never)
  camera.zoom = held.zoom
  camera.near = held.near
  camera.far = held.far
  controls.target.copy(held.target.clone())
  camera.lookAt(controls.target)
  camera.updateProjectionMatrix()
  controls.update()
}

/**
 * 应用风格：光照按主题取一份、场景材质重建、相机保持不动。
 *
 * 顺序不能反：`applyBaseLighting` 内部会 `refreshSceneRender`，必须在 `appCtx.sceneStyle`
 * 已改成新值之后调用，否则会先用旧风格的光照重画一遍（画面闪一下旧材质）。
 */
export function applyPreviewStyle(runtime: StudioAppRuntime, requested: unknown): void {
  const style = normalizeSceneStyle(requested)
  const appCtx = runtime.appCtx
  if (style === normalizeSceneStyle(appCtx.sceneStyle)) return
  const heldCamera = holdCamera(runtime)
  appCtx.sceneStyle = style
  // 暴露给 CSS / 诊断：画布外的壳层文字与提示会按风格微调配色，也便于在控制台确认当前档位。
  globalThis.document.documentElement.dataset.studioStyle = style
  appCtx.regionLightController?.setSceneStyle?.(style)
  runtime.applyBaseLighting(baseLightingForCurrentStyle(runtime))
  runtime.rebuildFloorLayers()
  restoreCamera(runtime, heldCamera)
  runtime.refreshSceneRender({ scene: true, shadows: true })
  persistPreviewStyle(style)
  runtime.refreshStudioUi()
  runtime.refreshStudioView()
  // 自然木语：预载贴图并开关 PMREM 环境（背景主题决定白天/傍晚档）。
  runtime.naturalWoodSync?.(style, runtime.backgroundSettings?.()?.warmBackgroundTheme)
  syncExportSceneStyleLabel(runtime, style)
}

/** 导出面板标题里的「当前风格」。 */
export function syncExportSceneStyleLabel(runtime: StudioAppRuntime, requested?: unknown): void {
  const label = globalThis.document.getElementById('export-scene-style')
  if (label) label.textContent = sceneStyleLabel(requested ?? runtime.appCtx.sceneStyle)
}

/**
 * 绑定 `#editor-scene-style`：进入时同步选中值，变更时应用并持久化。
 * 选择器是每次 boot 重新渲染的 DOM，所以每次都要重新绑定。
 */
/** 只需读取风格与只读标志：草稿加载完也要用它把选择器拉回当前实际值。 */
type PreviewStyleState = { appCtx: { sceneStyle: string }; isEmbeddedStage?: boolean }

/**
 * 把选择器与 `<html data-studio-style>` 同步到当前 `appCtx.sceneStyle`。
 *
 * 草稿是异步读回来的：boot 阶段绑定选择器时还是默认值，加载完成后必须再同步一次，
 * 否则会出现「上次选了自然木语、打开后选择器却显示默认」。
 */
export function syncPreviewStyleSelect(runtime: PreviewStyleState): void {
  const select = globalThis.document.getElementById('editor-scene-style') as HTMLSelectElement | null
  if (!select) return
  select.value = normalizeSceneStyle(runtime.appCtx.sceneStyle)
  globalThis.document.documentElement.dataset.studioStyle = select.value
  // `isEmbeddedStage` 下不允许改：嵌入舞台的风格由宿主组件决定。
  select.disabled = Boolean(runtime.isEmbeddedStage)
  syncExportSceneStyleLabel(runtime as StudioAppRuntime)
}

export function bindPreviewStyleSelect(runtime: StudioAppRuntime): void {
  const select = globalThis.document.getElementById('editor-scene-style') as HTMLSelectElement | null
  if (!select) return
  syncPreviewStyleSelect(runtime)
  select.addEventListener('change', () => {
    if (runtime.isEmbeddedStage) return
    applyPreviewStyle(runtime, select.value)
  })
}

/**
 * 自然木语主题的运行时装配（贴图预载 + 材质库 + PMREM 环境）。
 *
 * 为什么单独一层：这三个对象有**共同的生命周期**（进场景时预载、切风格时启停、卸载时释放），
 * 而 boot 已经贴着行数预算。集中在这里之后，boot 只需要 `createNaturalWoodRuntime(...)`
 * 一行创建、一行 `dispose()`。
 *
 * 与 `applyPreviewStyle` 的关系：风格切换时由它调用 `sync(style)`，本模块只负责
 * 「自然木语开着就加载 / 关掉就释放」这一个判断，不参与 UI 状态。
 */

export interface NaturalWoodRuntime {
  /** 材质库；未启用时为 `null`（调用方用可选链）。 */
  readonly library: NaturalWoodMaterialLibrary | null
  /** 按当前风格启停：`natural-wood` 时预载贴图并打开环境反射。 */
  sync: (sceneStyle: string, backgroundTheme?: string) => void
  dispose: () => void
}

export function createNaturalWoodRuntime(appCtx: StudioAppContext): NaturalWoodRuntime {
  let library: NaturalWoodMaterialLibrary | null = null
  let environment: ReturnType<typeof createNaturalWoodEnvironment> | null = null
  let activeStyle: string | null = null
  let textureLoading = false

  function ensureLibrary(): NaturalWoodMaterialLibrary {
    library ??= createNaturalWoodMaterials(three as never)
    setActiveNaturalWoodLibrary(library)
    return library
  }

  function loadTextures(): void {
    if (textureLoading || !library) return
    textureLoading = true
    const anisotropy = Math.min(8, appCtx.threeRenderer?.capabilities?.getMaxAnisotropy?.() || 4)
    // 贴图加载失败不阻塞场景：程序化分支仍能出细节（见 natural-wood-materials 的 catch）。
    void library.loadTextures({ anisotropy }).catch((loadError: unknown) => {
      reportDegradation(
        {
          code: 'STUDIO_NATURAL_WOOD_TEXTURE_FALLBACK',
          category: '3D 图形',
          phase: 'studio-natural-wood-textures',
          message: '自然木语贴图加载失败，已改用程序化纹理。',
          hint: '木纹与皮革会缺少真实纹理细节；检查静态资源是否可访问后重新打开编辑器。',
          recoveredMessage: '自然木语贴图已就绪。',
        },
        loadError,
      )
    })
  }

  return {
    get library() {
      return library
    },
    sync(sceneStyle, backgroundTheme) {
      const isNatural = sceneStyle === 'natural-wood'
      if (isNatural === (activeStyle === 'natural-wood')) {
        // 同一风格下只更新背景主题（白天 / 傍晚影响环境强度）。
        if (isNatural) environment?.configure(true, { phase: backgroundTheme })
        return
      }
      activeStyle = sceneStyle
      if (!isNatural) {
        environment?.configure(false)
        return
      }
      ensureLibrary()
      loadTextures()
      const scene = appCtx.threeScene
      const renderer = appCtx.threeRenderer
      if (!scene || !renderer) return
      environment ??= createNaturalWoodEnvironment(three as never, renderer, scene)
      environment.configure(true, { phase: backgroundTheme })
    },
    dispose() {
      environment?.dispose()
      environment = null
      setActiveNaturalWoodLibrary(null)
      library?.dispose()
      library = null
      activeStyle = null
    },
  }
}

/**
 * 按 `appCtx` 取（或首次创建）自然木语运行时。
 *
 * 用 WeakMap 而不是在 boot 里持有 `const`：boot 已贴着行数预算，
 * 且「一份运行时对应一个 appCtx」本来就是它的真实语义（SPA 内可能重建舞台）。
 */
const runtimesByAppCtx = new WeakMap<object, NaturalWoodRuntime>()

export function naturalWoodRuntimeFor(appCtx: StudioAppContext): NaturalWoodRuntime {
  const existing = runtimesByAppCtx.get(appCtx)
  if (existing) return existing
  const created = createNaturalWoodRuntime(appCtx)
  runtimesByAppCtx.set(appCtx, created)
  return created
}

/** 载入草稿后按当前风格补一次启停（风格在载入时就已经是自然木语的情形）。 */
export function syncNaturalWoodForAppCtx(appCtx: StudioAppContext, sceneStyle: string, backgroundTheme?: string): void {
  naturalWoodRuntimeFor(appCtx).sync(sceneStyle, backgroundTheme)
}
