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
import * as three from '/static/vendor/three/0.187.0/three.module.min.js'
import type { StudioAppContext } from '../studio-app-context'
import {
  createNaturalWoodMaterials,
  type NaturalWoodMaterialLibrary,
} from '../../../materials/natural-wood/natural-wood-materials'
import { createNaturalWoodEnvironment } from '../../../materials/natural-wood/natural-wood-environment'
import { reportDegradation } from '../../../../shared/diagnostics/degradation'
import { setActiveNaturalWoodLibrary } from '../../../materials/natural-wood/natural-wood-model-theme'

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
