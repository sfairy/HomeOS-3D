/**
 * 反射探针 mesh + pagehide 回收（从 studio-render-loop 拆出）。
 */

import type { PageHideBinding } from './render-loop-idle-quality'
import { bindNamedPageHideOnce } from './render-loop-idle-quality'

type ProbeMesh = {
  name: string
  frustumCulled: boolean
  renderOrder: number
  layers: { enableAll: () => void }
  onBeforeRender: (...args: unknown[]) => void
  removeFromParent: () => void
  geometry: { dispose: () => void }
  material: { dispose: () => void }
}

type ProbeNs = {
  Mesh: new (geometry: unknown, material: unknown) => ProbeMesh
  BufferGeometry: new () => { setAttribute: (name: string, attr: unknown) => unknown }
  Float32BufferAttribute: new (array: number[], itemSize: number) => unknown
  MeshBasicMaterial: new (params: Record<string, unknown>) => unknown
}

/** 挂接 curtain-shadow 刷新探针，并登记 pagehide dispose。 */
export function attachReflectionProbeMesh(params: {
  THREE: ProbeNs
  threeScene: {
    add: (mesh: ProbeMesh) => void
    onBeforeRender?: (...args: unknown[]) => void
  }
  pageHideBindings: PageHideBinding[]
  shouldRefreshGeometry: () => boolean
  hasShadowBoost: () => boolean
  setShouldRefreshGeometry: (value: boolean) => void
  lightPrecompileController?: { refreshGeometry?: (root: unknown, boxes: unknown) => boolean } | null
  sceneRootNode: unknown
  geometryBoxes: unknown
}): {
  reflectionProbeMesh: ProbeMesh
  previousOnBeforeRender: ((...args: unknown[]) => void) | undefined
} {
  const { THREE: ns } = params
  const reflectionProbeMesh = new ns.Mesh(
    new ns.BufferGeometry().setAttribute('position', new ns.Float32BufferAttribute([], 3)),
    new ns.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
    }),
  )
  reflectionProbeMesh.name = 'interaction3d-curtain-shadow-refresh'
  reflectionProbeMesh.frustumCulled = false
  reflectionProbeMesh.renderOrder = -1000000000
  reflectionProbeMesh.layers.enableAll()
  reflectionProbeMesh.onBeforeRender = () => {
    params.shouldRefreshGeometry() &&
      !params.hasShadowBoost() &&
      params.setShouldRefreshGeometry(
        params.lightPrecompileController
          ? !params.lightPrecompileController.refreshGeometry?.(params.sceneRootNode, params.geometryBoxes)
          : false,
      )
  }
  const previousOnBeforeRender = params.threeScene.onBeforeRender
  params.threeScene.add(reflectionProbeMesh)
  bindNamedPageHideOnce(params.pageHideBindings, () => {
    reflectionProbeMesh.removeFromParent()
    reflectionProbeMesh.geometry.dispose()
    reflectionProbeMesh.material.dispose()
  })
  return { reflectionProbeMesh, previousOnBeforeRender }
}
