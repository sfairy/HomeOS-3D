/**
 * 自然木语的 PMREM 环境贴图（0.8.7 `natural-wood-environment.js` 的对应实现）。
 *
 * 为什么需要它：自然木语是「纸感浅色 + 低对比」的基调，只调灯光会得到一片灰白 ——
 * 反射环境里必须有**带方向的亮面**（窗侧偏亮、地面偏暖），材质才显得有体积。
 *
 * 做法：搭一个只有几块发光平面的临时 Scene，用 `PMREMGenerator.fromScene` 烘成
 * 环境贴图。比加载 HDR 资源便宜（无额外下载），也比纯色环境有层次。
 *
 * 生命周期：`configure()` 幂等；关闭时把 `scene.environment` / `toneMapping` 还原成
 * 进入前的值 —— 否则切回默认风格会残留一层暖白反射。
 */

type ThreeLike = {
  Scene: new () => any
  Mesh: new (geometry: any, material: any) => any
  PlaneGeometry: new (width: number, height: number) => any
  MeshBasicMaterial: new (params: Record<string, unknown>) => any
  PMREMGenerator: new (
    renderer: any,
  ) => { fromScene: (scene: any, sigma: number, near: number, far: number) => any; dispose: () => void }
  ACESFilmicToneMapping: number
  DoubleSide: number
}

import { NATURAL_WOOD_RENDER_PROFILE, naturalWoodPhase } from '../../../shared/scene/natural-wood-render-profile'

/** 环境贴图的烘焙参数：与渲染档位同一份来源，避免两处数值漂移。 */
export const NATURAL_WOOD_ENVIRONMENT = Object.freeze({
  background: NATURAL_WOOD_RENDER_PROFILE.environment.background,
  blur: NATURAL_WOOD_RENDER_PROFILE.environment.blur,
  near: NATURAL_WOOD_RENDER_PROFILE.environment.near,
  far: NATURAL_WOOD_RENDER_PROFILE.environment.far,
  intensity: NATURAL_WOOD_RENDER_PROFILE.day.environmentIntensity,
})

export interface NaturalWoodEnvironment {
  /** 开启 / 关闭环境反射；`enabled=false` 时还原进入前的状态。 */
  configure: (enabled: boolean, options?: { intensity?: number; phase?: string }) => void
  dispose: () => void
  /** 是否已烘好并挂到场景上。 */
  readonly active: boolean
}

export function createNaturalWoodEnvironment(three: ThreeLike, renderer: any, scene: any): NaturalWoodEnvironment {
  let environmentTexture: any = null
  let previous: { environment: any; environmentIntensity: number; toneMapping: number } | null = null
  let active = false

  function build(): any {
    if (environmentTexture) return environmentTexture
    const environmentScene = new three.Scene()
    const disposable: any[] = []
    for (const panel of NATURAL_WOOD_RENDER_PROFILE.environment.panels) {
      const geometry = new three.PlaneGeometry(panel.size[0], panel.size[1])
      const material = new three.MeshBasicMaterial({
        color: panel.color,
        side: three.DoubleSide,
      })
      // 用色值强度模拟发光面亮度（BasicMaterial 无光照，直接乘色）。
      material.color.multiplyScalar(panel.intensity)
      const mesh = new three.Mesh(geometry, material)
      mesh.position.set(...panel.at)
      mesh.rotation.set(panel.rotation[0], panel.rotation[1], 0)
      environmentScene.add(mesh)
      disposable.push(geometry, material)
    }
    const generator = new three.PMREMGenerator(renderer)
    try {
      environmentTexture = generator.fromScene(
        environmentScene,
        NATURAL_WOOD_ENVIRONMENT.blur,
        NATURAL_WOOD_ENVIRONMENT.near,
        NATURAL_WOOD_ENVIRONMENT.far,
      )
    } finally {
      generator.dispose()
      for (const item of disposable) item.dispose()
      environmentScene.clear?.()
    }
    return environmentTexture
  }

  function restore(): void {
    if (!previous) return
    scene.environment = previous.environment
    scene.environmentIntensity = previous.environmentIntensity
    renderer.toneMapping = previous.toneMapping
    previous = null
    active = false
  }

  return {
    configure(enabled, options = {}) {
      if (!enabled) {
        restore()
        return
      }
      previous ??= {
        environment: scene.environment,
        environmentIntensity: scene.environmentIntensity,
        toneMapping: renderer.toneMapping,
      }
      const baked = build()
      scene.environment = baked?.texture ?? null
      // 相位（白天 / 傍晚）决定环境强度：傍晚必须压暗，否则浅色墙会继续发亮。
      const phase = naturalWoodPhase(options.phase)
      scene.environmentIntensity = options.intensity ?? NATURAL_WOOD_RENDER_PROFILE[phase].environmentIntensity
      renderer.toneMapping = three.ACESFilmicToneMapping
      active = true
    },
    dispose() {
      restore()
      environmentTexture?.dispose?.()
      environmentTexture = null
    },
    get active() {
      return active
    },
  }
}
