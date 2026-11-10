import { createIdleSnapshotCache } from '../cache/idle-snapshot-cache'
import { readTexturePixels } from '../render-kit/fullscreen-copy'

/** 接触阴影的持久缓存：把烘焙好的 target/surface 贴图 + 查询纹理 + 参数快照落盘，热启动时直接还原。 */
const CONTACT_SHADOW_CACHE_VERSION = '20261022-v1'

/** 长度为 length 的有限数元组。 */
const isFiniteTuple = (value: any, tupleLength: any) =>
  Array.isArray(value) && value.length === tupleLength && value.every(Number.isFinite)
/** 烘焙纹理载荷：尺寸在 4096 内、像素数是宽高乘积的 Uint8 灰度图。 */
const isValidBakedTexture = (bakedTexture: any) =>
  bakedTexture &&
  Number.isInteger(bakedTexture.width) &&
  Number.isInteger(bakedTexture.height) &&
  bakedTexture.width > 0 &&
  bakedTexture.height > 0 &&
  bakedTexture.width <= 4096 &&
  bakedTexture.height <= 4096 &&
  bakedTexture.pixels instanceof Uint8Array &&
  bakedTexture.pixels.length === bakedTexture.width * bakedTexture.height
/** 完整的接触阴影快照：target 必填，surface/lookup 要么都没有要么都合法。 */
function validContactShadowSnapshot(snapshot: any) {
  return (
    !!snapshot &&
    isValidBakedTexture(snapshot.target) &&
    (!snapshot.surface || isValidBakedTexture(snapshot.surface)) &&
    (!snapshot.surface || (snapshot.lookup instanceof Uint8Array && snapshot.lookup.length === 2048 * 4)) &&
    isFiniteTuple(snapshot.frame, 16) &&
    isFiniteTuple(snapshot.bounds, 4) &&
    snapshot.bounds[2] > 0 &&
    snapshot.bounds[3] > 0 &&
    Number.isFinite(snapshot.y) &&
    isFiniteTuple(snapshot.surfaceBounds, 4) &&
    isFiniteTuple(snapshot.layout, 2) &&
    (!snapshot.surface ||
      (snapshot.surfaceBounds[2] > 0 &&
        snapshot.surfaceBounds[3] > 0 &&
        Number.isInteger(snapshot.layout[0]) &&
        snapshot.layout[0] >= 1 &&
        snapshot.layout[0] <= 6 &&
        snapshot.layout[1] > 0))
  )
}
const snapshotBytes = (snapshot: any) =>
  snapshot.target.pixels.byteLength +
  (snapshot.surface?.pixels.byteLength || 0) +
  (snapshot.lookup?.byteLength || 0) +
  256
export function createContactShadowPersistentCache({ env = globalThis, key = '' } = {}) {
  return createIdleSnapshotCache({
    env,
    key,
    version: CONTACT_SHADOW_CACHE_VERSION,
    databaseName: 'homeos-contact-shadows',
    logPrefix: '[3D-shadow-cache]',
    validate: validContactShadowSnapshot,
    snapshotBytes,
    maxPersistedBytes: 100663296,
    maxPersistedEntries: 8,
    sizeStatKey: 'floors',
  })
}
/** 把当前接触阴影的贴图与 uniform 参数抓成可落盘的快照（读回像素用 red 通道）。 */
export async function captureContactShadowSnapshot(three: any, renderer: any, source: any, canCapture: any) {
  if (!renderer.readRenderTargetPixelsAsync || !canCapture()) return null
  const snapshot = {
    frame: source.bakedFrame.toArray(),
    bounds: source.uniforms.plan2ContactBounds.value.toArray(),
    y: source.uniforms.plan2ContactY.value,
    surfaceBounds: source.uniforms.plan2SurfaceBounds.value.toArray(),
    layout: source.uniforms.plan2SurfaceLayout.value.toArray(),
    lookup: source.lookup?.image.data.slice() || null,
  }
  for (const channelName of ['target', 'surface']) {
    const sourceTarget = source[channelName]
    if (!sourceTarget) {
      ;(snapshot as any)[channelName] = null
      continue
    }
    if (!canCapture() || sourceTarget.width > 4096 || sourceTarget.height > 4096) return null
    const pixelBuffer = new Uint8Array(sourceTarget.width * sourceTarget.height * 4)
    await readTexturePixels(three, renderer, sourceTarget.texture, {
      width: sourceTarget.width,
      height: sourceTarget.height,
      channel: 'red',
      pixels: pixelBuffer,
    })
    if (!canCapture()) return null
    const redChannelPixels = new Uint8Array(sourceTarget.width * sourceTarget.height)
    for (let pixelIndex = 0; pixelIndex < redChannelPixels.length; pixelIndex++)
      redChannelPixels[pixelIndex] = pixelBuffer[pixelIndex * 4]
    ;(snapshot as any)[channelName] = {
      width: sourceTarget.width,
      height: sourceTarget.height,
      pixels: redChannelPixels,
    }
  }
  return validContactShadowSnapshot(snapshot) ? snapshot : null
}
/** 把快照还原成可直接挂回 uniform 的贴图与参数（失败时释放已建纹理并返回 null）。 */
export function restoreContactShadowSnapshot(three: any, snapshot: any) {
  if (!validContactShadowSnapshot(snapshot)) return null
  const createdTextures: any[] = []
  try {
    const restoreBakedTexture = (bakedTexture: any) => {
        if (!bakedTexture) return null
        const dataTexture = new three.DataTexture(
          bakedTexture.pixels.slice(),
          bakedTexture.width,
          bakedTexture.height,
          three.RedFormat,
        )
        return (
          createdTextures.push(dataTexture),
          (dataTexture.minFilter = dataTexture.magFilter = three.LinearFilter),
          (dataTexture.needsUpdate = true),
          {
            width: bakedTexture.width,
            height: bakedTexture.height,
            texture: dataTexture,
            restored: true,
            dispose: () => dataTexture.dispose(),
          }
        )
      },
      restoredSnapshot: any = {
        target: restoreBakedTexture(snapshot.target),
        surface: restoreBakedTexture(snapshot.surface),
        lookup: null as any,
      }
    return (
      snapshot.surface &&
        ((restoredSnapshot.lookup = new three.DataTexture(snapshot.lookup.slice(), 2048, 1)),
        createdTextures.push(restoredSnapshot.lookup),
        (restoredSnapshot.lookup.needsUpdate = true)),
      (restoredSnapshot.bakedFrame = new three.Matrix4().fromArray(snapshot.frame)),
      (restoredSnapshot.values = {
        plan2ContactBounds: new three.Vector4().fromArray(snapshot.bounds),
        plan2ContactY: snapshot.y,
        plan2SurfaceBounds: new three.Vector4().fromArray(snapshot.surfaceBounds),
        plan2SurfaceLayout: new three.Vector2().fromArray(snapshot.layout),
      }),
      restoredSnapshot
    )
  } catch {
    for (const createdTexture of createdTextures) createdTexture.dispose()
    return null
  }
}
