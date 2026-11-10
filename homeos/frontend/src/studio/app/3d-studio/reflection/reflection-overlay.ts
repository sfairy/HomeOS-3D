/**
 * 地面反射的「贴回地面」一侧：渲染目标尺寸、overlay 材质与采样参数、受体是否在主相机视锥内。
 *
 * 反射贴图在屏幕空间里采样（textureMatrix = 镜像相机投影），所以：
 * - 贴图应跟随画布宽高比，否则正方形贴图铺满宽屏时横向纹素密度远低于纵向（发糊）；
 * - 贴图内容是预乘色（清屏 alpha=0 + 常规混合 + MSAA resolve），overlay 必须按预乘输出，
 *   否则低 alpha 边缘的 rgb/a 会被放大成亮锯齿。
 */

export type ReflectionTargetSize = { width: number; height: number }

type SizedTarget = { width: number; height: number; setSize: (width: number, height: number) => void }

type Vector2Like = { x: number; y: number; set: (x: number, y: number) => Vector2Like }

type TargetRenderer = {
  capabilities?: { maxTextureSize?: number }
  getDrawingBufferSize?: (target: Vector2Like) => Vector2Like
}

type OverlayUniforms = {
  reflection: { value: { image?: { width?: number; height?: number } } | null }
  texelSize: { value: Vector2Like }
  smoothTaps: { value: number }
}

/** 256 档贴图本身已足够软，只做单次采样；更高档在 overlay 里做 4 点旋转网格平滑。 */
const SMOOTH_TAPS_MIN_SHORT_SIDE = 256

/** 短边 = 清晰度档，长边跟随画布宽高比，且不超过绘制缓冲 / 最大纹理尺寸。 */
export function resolveReflectionTargetSize(
  renderer: TargetRenderer,
  resolutionPx: number,
  scratch: Vector2Like,
): ReflectionTargetSize {
  const maxTextureSize = renderer.capabilities?.maxTextureSize || 4096,
    bufferSize = renderer.getDrawingBufferSize?.(scratch),
    bufferWidth = bufferSize?.x || 0,
    bufferHeight = bufferSize?.y || 0
  if (!(bufferWidth > 0 && bufferHeight > 0)) return { width: resolutionPx, height: resolutionPx }
  const shortSide = Math.max(1, Math.min(resolutionPx, bufferWidth, bufferHeight)),
    aspect = bufferWidth / bufferHeight,
    longSide = (limit: number, ratio: number) =>
      Math.max(1, Math.min(limit, maxTextureSize, Math.round(shortSide * ratio)))
  return aspect >= 1
    ? { width: longSide(bufferWidth, aspect), height: shortSide }
    : { width: shortSide, height: longSide(bufferHeight, 1 / aspect) }
}

export function isReflectionTargetStale(target: SizedTarget, size: ReflectionTargetSize): boolean {
  return target.width !== size.width || target.height !== size.height
}

/** 只看屏幕内的记录：屏幕外记录尺寸过期不触发刷新（它们回到视野时会随位姿变化重捕）。 */
export function hasStaleOnScreenTarget(
  records: readonly { onScreen?: boolean; map: SizedTarget }[],
  size: ReflectionTargetSize,
): boolean {
  return records.some((record) => record.onScreen && isReflectionTargetStale(record.map, size))
}

/** setSize 会释放 GL 纹理：只在这条记录马上要重画（或本来就不显示）时调用。 */
export function ensureReflectionTargetSize(target: SizedTarget, size: ReflectionTargetSize): void {
  if (isReflectionTargetStale(target, size)) target.setSize(size.width, size.height)
}

export function snapshotMatchesTarget(
  snapshot: { width?: number; height?: number } | null | undefined,
  size: ReflectionTargetSize,
): boolean {
  return snapshot?.width === size.width && snapshot.height === size.height
}

export function resolveSmoothTaps(shortSidePx: number): number {
  return shortSidePx > SMOOTH_TAPS_MIN_SHORT_SIDE ? 1 : 0
}

/** 采样参数跟随当前实际绑定的贴图（可能是尚未重捕的旧尺寸，或持久缓存还原的快照）。 */
export function syncReflectionOverlaySampling(uniforms: OverlayUniforms, fallback: ReflectionTargetSize): void {
  const boundImage = uniforms.reflection.value?.image,
    boundWidth = boundImage?.width || fallback.width,
    boundHeight = boundImage?.height || fallback.height
  uniforms.texelSize.value.set(1 / boundWidth, 1 / boundHeight)
  uniforms.smoothTaps.value = resolveSmoothTaps(Math.min(boundWidth, boundHeight))
}

const OVERLAY_VERTEX_SHADER = `uniform mat4 reflectionMatrix; varying vec4 reflected; varying float up;
void main(){vec4 world=modelMatrix*vec4(position,1.);reflected=reflectionMatrix*world;
up=normalize(mat3(modelMatrix)*normal).y;vec4 mvPosition=modelViewMatrix*vec4(position,1.);
gl_Position=projectionMatrix*mvPosition;}`

const OVERLAY_FRAGMENT_SHADER = `uniform sampler2D reflection; uniform float strength; uniform vec2 texelSize; uniform float smoothTaps;
varying vec4 reflected; varying float up;
void main(){if(up<.9||reflected.w<=0.)discard;vec2 uv=reflected.xy/reflected.w;
if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)discard;
vec4 value;
if(smoothTaps>.5){
  value=.25*(texture2D(reflection,uv+texelSize*vec2(.25,.75))+texture2D(reflection,uv+texelSize*vec2(-.75,.25))
    +texture2D(reflection,uv+texelSize*vec2(-.25,-.75))+texture2D(reflection,uv+texelSize*vec2(.75,-.25)));
}else value=texture2D(reflection,uv);
float alphaOut=clamp(value.a*strength,0.,.7);
gl_FragColor=vec4(value.rgb/max(value.a,.02),alphaOut);
#include <tonemapping_fragment>
#include <colorspace_fragment>
gl_FragColor.rgb*=gl_FragColor.a;
}`

type OverlayNamespace = {
  ShaderMaterial: new (parameters: Record<string, unknown>) => unknown
  Vector2: new (x: number, y: number) => Vector2Like
}

/** 地面上那层把反射贴图按屏幕空间投影贴回去的透明网格材质。 */
export function createReflectionOverlayMaterial(
  three: OverlayNamespace,
  {
    texture,
    matrix,
    strength,
    size,
  }: { texture: unknown; matrix: unknown; strength: number; size: ReflectionTargetSize },
) {
  return new three.ShaderMaterial({
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    uniforms: {
      reflection: { value: texture },
      reflectionMatrix: { value: matrix },
      strength: { value: strength },
      texelSize: { value: new three.Vector2(1 / size.width, 1 / size.height) },
      smoothTaps: { value: resolveSmoothTaps(Math.min(size.width, size.height)) },
    },
    vertexShader: OVERLAY_VERTEX_SHADER,
    fragmentShader: OVERLAY_FRAGMENT_SHADER,
  })
}

/** 反射记录里与「贴回地面」相关的那部分字段。 */
type OverlayRecord = {
  map: SizedTarget & { texture: unknown }
  overlay: { material: { uniforms: OverlayUniforms } }
  restoredTexture?: { dispose: () => void } | null
  pendingSnapshot?: unknown
}

export function syncRecordOverlaySampling(record: OverlayRecord): void {
  syncReflectionOverlaySampling(record.overlay.material.uniforms, record.map)
}

/** 记录刚完成一次真实捕获：丢掉持久缓存还原的旧快照，改显示实时贴图（否则倒影停在冷启动位姿）。 */
export function adoptLiveCapture(record: OverlayRecord): void {
  if (!record.restoredTexture || record.pendingSnapshot) return
  record.restoredTexture.dispose()
  record.restoredTexture = null
  record.overlay.material.uniforms.reflection.value = record.map.texture as OverlayUniforms['reflection']['value']
}

type SphereLike = { applyMatrix4: (matrix: unknown) => SphereLike; copy: (sphere: unknown) => SphereLike }

type FrustumNamespace = {
  Frustum: new () => {
    setFromProjectionMatrix: (matrix: unknown, coordinateSystem?: unknown) => unknown
    intersectsSphere: (sphere: SphereLike) => boolean
  }
  Matrix4: new () => { multiplyMatrices: (a: unknown, b: unknown) => unknown }
  Sphere: new () => SphereLike
}

type ReceiverMesh = {
  matrixWorld: unknown
  geometry: { boundingSphere: unknown | null; computeBoundingSphere: () => void }
}

/** 受体地面是否落在主相机视锥内：屏幕外的倒影画了也看不到，不必整场景重捕。 */
export function createReceiverViewTest(three: FrustumNamespace) {
  const frustum = new three.Frustum(),
    viewProjection = new three.Matrix4(),
    sphere = new three.Sphere()
  return {
    update(camera: { projectionMatrix: unknown; matrixWorldInverse: unknown; coordinateSystem?: unknown }) {
      frustum.setFromProjectionMatrix(
        viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
        camera.coordinateSystem,
      )
    },
    /** 记录可显示且受体在视锥内。 */
    includes(record: { eligible?: boolean; source: ReceiverMesh }) {
      return !!record.eligible && this.contains(record.source)
    },
    contains(receiver: ReceiverMesh) {
      const receiverGeometry = receiver.geometry
      receiverGeometry.boundingSphere || receiverGeometry.computeBoundingSphere()
      return (
        !receiverGeometry.boundingSphere ||
        frustum.intersectsSphere(sphere.copy(receiverGeometry.boundingSphere).applyMatrix4(receiver.matrixWorld))
      )
    },
  }
}
