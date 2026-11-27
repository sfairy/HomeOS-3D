/**
 * 全屏拷贝：把一张纹理画进临时渲染目标再异步读回像素。
 *
 * 反射与接触阴影的持久化快照以前各自每次 new 一份 Scene/Camera/ShaderMaterial/PlaneGeometry、
 * 用完即 dispose —— 着色器程序每次快照都重新编译链接一遍。这里按渲染器缓存拷贝通道，
 * 程序只编译一次；渲染目标尺寸随源纹理变化，仍按次创建和释放。
 */

import { captureRendererTargetState, restoreRendererTargetState } from './renderer-state'

export type CopyChannel = 'rgba' | 'red'

type CopyMaterial = { uniforms: { source: { value: unknown } } }
type CopyPass = { scene: object; camera: object; material: CopyMaterial }
type Ctor<T> = new (...args: never[]) => T

type CopyThree = {
  ShaderMaterial: new (options: object) => CopyMaterial
  Mesh: new (geometry: object, material: CopyMaterial) => { frustumCulled: boolean }
  PlaneGeometry: new (width: number, height: number) => object
  Scene: Ctor<{ add(object: object): void }>
  OrthographicCamera: new (l: number, r: number, t: number, b: number, near: number, far: number) => object
  WebGLRenderTarget: new (width: number, height: number, options: object) => { dispose(): void }
  Vector4: Ctor<object>
}

type CopyRenderer = {
  autoClear: boolean
  xr: { enabled: boolean }
  shadowMap: { enabled: boolean }
  getRenderTarget(): unknown
  getActiveCubeFace(): number
  getActiveMipmapLevel(): number
  getViewport(target: object): object
  getScissor(target: object): object
  getScissorTest(): boolean
  setViewport(viewport: object): void
  setScissor(scissor: object): void
  setScissorTest(enabled: boolean): void
  setRenderTarget(target: unknown, face?: number, mip?: number): void
  render(scene: object, camera: object): void
  readRenderTargetPixelsAsync(
    target: unknown,
    x: number,
    y: number,
    width: number,
    height: number,
    pixels: ArrayBufferView,
  ): Promise<unknown>
}

const VERTEX_SHADER = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}'
const FRAGMENT_SHADERS: Record<CopyChannel, string> = {
  rgba: 'uniform sampler2D source;varying vec2 vUv;void main(){gl_FragColor=texture2D(source,vUv);}',
  red: 'uniform sampler2D source;varying vec2 vUv;void main(){gl_FragColor=vec4(texture2D(source,vUv).r,0.,0.,1.);}',
}

const passesByRenderer = new WeakMap<object, Map<CopyChannel, CopyPass>>()

function copyPassFor(three: CopyThree, renderer: object, channel: CopyChannel): CopyPass {
  let passes = passesByRenderer.get(renderer)
  if (!passes) passesByRenderer.set(renderer, (passes = new Map()))
  let pass = passes.get(channel)
  if (!pass) {
    const material = new three.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: { source: { value: null } },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADERS[channel],
    })
    const mesh = new three.Mesh(new three.PlaneGeometry(2, 2), material)
    mesh.frustumCulled = false
    const scene = new three.Scene()
    scene.add(mesh)
    pass = { scene, camera: new three.OrthographicCamera(-1, 1, 1, -1, 0, 1), material }
    passes.set(channel, pass)
  }
  return pass
}

/**
 * 把 `texture` 拷进一张 `width × height` 的临时目标并读回到 `pixels`。
 * 渲染器状态（目标、视口、裁剪、autoClear、XR、阴影开关）在提交后立即还原；返回读回完成的 Promise。
 */
export async function readTexturePixels(
  three: CopyThree,
  renderer: CopyRenderer,
  texture: unknown,
  options: { width: number; height: number; channel: CopyChannel; type?: unknown; pixels: ArrayBufferView },
): Promise<void> {
  const { width, height, channel, type, pixels } = options
  const pass = copyPassFor(three, renderer, channel)
  const renderTarget = new three.WebGLRenderTarget(width, height, {
    depthBuffer: false,
    generateMipmaps: false,
    ...(type === undefined ? {} : { type }),
  })
  const targetState = captureRendererTargetState(renderer, three.Vector4)
  const saved = {
    autoClear: renderer.autoClear,
    xr: renderer.xr.enabled,
    shadow: renderer.shadowMap.enabled,
  }
  try {
    let readPromise: Promise<unknown>
    try {
      renderer.xr.enabled = renderer.shadowMap.enabled = false
      renderer.autoClear = false
      renderer.setScissorTest(false)
      renderer.setRenderTarget(renderTarget)
      pass.material.uniforms.source.value = texture
      renderer.render(pass.scene, pass.camera)
      readPromise = renderer.readRenderTargetPixelsAsync(renderTarget, 0, 0, width, height, pixels)
    } finally {
      pass.material.uniforms.source.value = null
      restoreRendererTargetState(renderer, targetState)
      renderer.autoClear = saved.autoClear
      renderer.xr.enabled = saved.xr
      renderer.shadowMap.enabled = saved.shadow
    }
    await readPromise
  } finally {
    renderTarget.dispose()
  }
}

/** 让出主线程：长循环（如 float → half 转换）分片执行，避免单个长任务。 */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
