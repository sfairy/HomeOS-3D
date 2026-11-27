import { createIdleSnapshotCache } from '../cache/idle-snapshot-cache'
import { readTexturePixels, yieldToMain } from '../render-kit/fullscreen-copy'

/** 地面反射的持久缓存：把第一帧反射的浮点贴图（半精度）落盘，热启动时先还原再逐帧校正。 */
const REFLECTION_CACHE_VERSION = '20261110-v2'
/** float → half 转换每处理 2^18 个分量让出一次主线程。 */
const HALF_FLOAT_SLICE_MASK = (1 << 18) - 1
const MIN_SNAPSHOT_SIDE = 128,
  MAX_SNAPSHOT_SIDE = 2048
const isSnapshotSide = (side: unknown) =>
  Number.isInteger(side) && (side as number) >= MIN_SNAPSHOT_SIDE && (side as number) <= MAX_SNAPSHOT_SIDE
/** 反射快照：宽高各 128..2048（贴图按画布宽高比分配），像素为 width*height*4 的半精度 RGBA，矩阵 16 个有限数。 */
function validReflectionSnapshot(snapshot: any) {
  return (
    !!snapshot &&
    isSnapshotSide(snapshot.width) &&
    isSnapshotSide(snapshot.height) &&
    snapshot.pixels instanceof Uint16Array &&
    snapshot.pixels.length === snapshot.width * snapshot.height * 4 &&
    Array.isArray(snapshot.matrix) &&
    snapshot.matrix.length === 16 &&
    snapshot.matrix.every(Number.isFinite)
  )
}
const snapshotBytes = (snapshot: any) => snapshot.pixels.byteLength + 128
export function createReflectionPersistentCache({ env = globalThis, key = '' } = {}) {
  return createIdleSnapshotCache({
    env,
    key,
    version: REFLECTION_CACHE_VERSION,
    databaseName: 'homeos-first-reflections',
    logPrefix: '[3D-reflection-cache]',
    validate: validReflectionSnapshot,
    snapshotBytes,
    maxPersistedBytes: 67108864,
    maxPersistedEntries: 4,
    sizeStatKey: 'receivers',
  })
}
/** 抓取当前反射贴图为半精度快照（要求 EXT_color_buffer_float，宽高各 128..2048）。 */
export async function captureReflectionSnapshot(three: any, renderer: any, source: any, canCapture: any) {
  if (
    !renderer.readRenderTargetPixelsAsync ||
    !canCapture() ||
    (renderer.extensions?.has && !renderer.extensions.has('EXT_color_buffer_float'))
  )
    return null
  const width = source.map.width,
    height = source.map.height
  if (!isSnapshotSide(width) || !isSnapshotSide(height)) return null
  const matrixArray = source.matrix.toArray(),
    floatPixels = new Float32Array(width * height * 4)
  await readTexturePixels(three, renderer, source.map.texture, {
    width,
    height,
    channel: 'rgba',
    type: three.FloatType,
    pixels: floatPixels,
  })
  if (!canCapture()) return null
  const halfFloatPixels = new Uint16Array(floatPixels.length)
  for (let pixelIndex = 0; pixelIndex < floatPixels.length; pixelIndex++) {
    if (!Number.isFinite(floatPixels[pixelIndex]) || Math.abs(floatPixels[pixelIndex]) > 65504) return null
    halfFloatPixels[pixelIndex] = three.DataUtils.toHalfFloat(floatPixels[pixelIndex])
    // 2048² 的快照有 1600 万个分量：分片让出主线程，避免一次几百毫秒的长任务。
    if ((pixelIndex & HALF_FLOAT_SLICE_MASK) === HALF_FLOAT_SLICE_MASK) {
      await yieldToMain()
      if (!canCapture()) return null
    }
  }
  return {
    width: width,
    height: height,
    pixels: halfFloatPixels,
    matrix: matrixArray,
  }
}
/** 用快照重建可贴回地面的半精度 DataTexture。 */
export function restoreReflectionSnapshot(three: any, snapshot: any) {
  if (!validReflectionSnapshot(snapshot)) return null
  const dataTexture = new three.DataTexture(
    snapshot.pixels.slice(),
    snapshot.width,
    snapshot.height,
    three.RGBAFormat,
    three.HalfFloatType,
  )
  return (
    (dataTexture.minFilter = dataTexture.magFilter = three.LinearFilter),
    (dataTexture.generateMipmaps = false),
    (dataTexture.needsUpdate = true),
    dataTexture
  )
}
