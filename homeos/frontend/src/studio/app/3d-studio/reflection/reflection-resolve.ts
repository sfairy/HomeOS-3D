/**
 * 地面反射的捕获目标与解析：所有记录共用一张带深度的 MSAA 捕获目标，捕获完再拷贝
 * （或双向高斯模糊）进各记录自己的无 MSAA、无深度贴图。
 *
 * 捕获是串行的（一次只渲染一条记录），每条记录各持一张 MSAA + 深度目标纯属浪费：
 * 按画布比例分配、4× MSAA 时单条约 26MB（512 档）/ 57MB（768 档），十几个房间的地面
 * 就能把 GPU 显存顶到上下文丢失，浏览器随后会拒绝再创建 WebGL 上下文。
 */
import { ensureReflectionTargetSize, type ReflectionTargetSize } from './reflection-overlay'

/**
 * 步长写在 UV 空间，实际模糊半径 = step × 贴图边长，因此「固定 /512」等价于
 * 「视觉模糊半径与捕获分辨率无关」（256/512/768 档看到的是同一档模糊）。
 * 非正方形贴图按短边换算两个方向的步长，保持横纵半径一致。
 */
const BLUR_REFERENCE_RESOLUTION = 512,
  BLUR_TEXEL_RADIUS = 2

const QUAD_VERTEX_SHADER = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}'
const COPY_FRAGMENT_SHADER =
  'uniform sampler2D source; varying vec2 vUv; void main(){ gl_FragColor=texture2D(source,vUv); }'
const BLUR_FRAGMENT_SHADER = `uniform sampler2D source; uniform vec2 step; varying vec2 vUv;
void main(){ gl_FragColor=texture2D(source,vUv)*.227027;
gl_FragColor+=(texture2D(source,vUv+step*1.384615)+texture2D(source,vUv-step*1.384615))*.316216;
gl_FragColor+=(texture2D(source,vUv+step*3.230769)+texture2D(source,vUv-step*3.230769))*.070270; }`

type ResolveTarget = {
  width: number
  height: number
  texture: unknown
  setSize: (width: number, height: number) => void
  dispose: () => void
}

type QuadMaterial = {
  uniforms: { source: { value: unknown }; step?: { value: { set: (x: number, y: number) => unknown } } }
  dispose: () => void
}

type ResolveNamespace = {
  Scene: new () => { add: (object: unknown) => unknown }
  OrthographicCamera: new (...bounds: number[]) => unknown
  ShaderMaterial: new (parameters: Record<string, unknown>) => QuadMaterial
  Vector2: new () => unknown
  Mesh: new (geometry: unknown, material: unknown) => { geometry: { dispose: () => void }; material: unknown }
  PlaneGeometry: new (width: number, height: number) => unknown
}

type ResolveRenderer = {
  setRenderTarget: (target: unknown) => void
  clear: () => void
  render: (scene: unknown, camera: unknown) => void
}

export function createReflectionResolve(
  three: ResolveNamespace,
  renderer: ResolveRenderer,
  createTarget: (size: ReflectionTargetSize, options: { capture: boolean }) => ResolveTarget,
) {
  const scene = new three.Scene(),
    camera = new three.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    quadMaterial = (fragmentShader: string, uniforms: Record<string, unknown>) =>
      new three.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: { source: { value: null }, ...uniforms },
        vertexShader: QUAD_VERTEX_SHADER,
        fragmentShader,
      }),
    copyMaterial = quadMaterial(COPY_FRAGMENT_SHADER, {}),
    blurMaterial = quadMaterial(BLUR_FRAGMENT_SHADER, { step: { value: new three.Vector2() } }),
    mesh = new three.Mesh(new three.PlaneGeometry(2, 2), copyMaterial)
  scene.add(mesh)
  let captureTarget: ResolveTarget | null = null,
    blurScratch: ResolveTarget | null = null
  const sizedTarget = (target: ResolveTarget | null, size: ReflectionTargetSize, capture: boolean) => {
    if (!target) return createTarget(size, { capture })
    ensureReflectionTargetSize(target, size)
    return target
  }
  function draw(material: QuadMaterial, source: ResolveTarget, destination: ResolveTarget) {
    material.uniforms.source.value = source.texture
    mesh.material = material
    renderer.setRenderTarget(destination)
    renderer.clear()
    renderer.render(scene, camera)
  }
  return {
    /** 本轮捕获要渲染进去的共享 MSAA 目标（带深度）。 */
    captureTarget(size: ReflectionTargetSize) {
      return (captureTarget = sizedTarget(captureTarget, size, true))
    },
    /** 把共享捕获目标解析进记录贴图；blur 时走横、纵两趟高斯。调用方负责事后恢复渲染目标。 */
    resolve(destination: ResolveTarget, size: ReflectionTargetSize, blur: boolean) {
      if (!captureTarget) return
      if (!blur) {
        draw(copyMaterial, captureTarget, destination)
        return
      }
      blurScratch = sizedTarget(blurScratch, size, false)
      const shortSide = Math.min(size.width, size.height),
        baseStep = BLUR_TEXEL_RADIUS / BLUR_REFERENCE_RESOLUTION
      for (const [source, target, horizontal] of [
        [captureTarget, blurScratch, 1],
        [blurScratch, destination, 0],
      ] as const) {
        blurMaterial.uniforms.step?.value.set(
          horizontal * baseStep * (shortSide / size.width),
          (1 - horizontal) * baseStep * (shortSide / size.height),
        )
        draw(blurMaterial, source, target)
      }
    },
    dispose() {
      mesh.geometry.dispose()
      copyMaterial.dispose()
      blurMaterial.dispose()
      captureTarget?.dispose()
      blurScratch?.dispose()
      captureTarget = blurScratch = null
    },
  }
}
