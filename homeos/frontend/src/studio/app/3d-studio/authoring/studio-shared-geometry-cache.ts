/**
 * 共享几何缓存修剪（0.7.8 `studio-shared-geometry-cache`）。
 *
 * 编辑器会跨楼层/预览共享同一份几何体；离开的楼层不会立刻释放，
 * 这里按「未引用条目数 + 未引用字节数」双阈值回收，避免显存无限增长。
 */

type SharedGeometryCacheStats = {
  unusedEntries: number
  unusedBytes: number
  evicted: number
}

/** 估算几何体占用的字节数（索引 + 全部属性数组）。 */
function geometryByteSize(geometry: any) {
  const bufferSet = new Set<ArrayBufferLike>()
  for (const attribute of [geometry.index, ...Object.values(geometry.attributes || {})]) {
    const bufferArray = (attribute as any)?.isInterleavedBufferAttribute
      ? (attribute as any).data?.array
      : (attribute as any)?.array
    bufferArray && bufferSet.add(bufferArray)
  }
  return [...bufferSet].reduce((total, bufferArray) => total + bufferArray.byteLength, 0)
}

/**
 * 修剪共享几何缓存。
 *
 * @param cache            `Map<key, geometry>`
 * @param sceneRoots       当前仍在用的场景根；其子树里的几何体一律保留
 * @param maxUnusedEntries 允许保留的未引用条目数（默认 32）
 * @param maxUnusedBytes   允许保留的未引用字节数（默认 2 MiB）
 */
export function trimSharedGeometryCache(
  cache: Map<any, any>,
  sceneRoots: any[],
  { maxUnusedEntries = 32, maxUnusedBytes = 2 * 1024 * 1024 } = {},
): SharedGeometryCacheStats {
  const liveGeometrySet = new Set<any>(),
    visitedNodeSet = new Set<any>()
  for (const sceneRoot of sceneRoots) {
    if (!sceneRoot || visitedNodeSet.has(sceneRoot)) continue
    sceneRoot.traverse((sceneNode: any) => {
      visitedNodeSet.add(sceneNode), sceneNode.geometry && liveGeometrySet.add(sceneNode.geometry)
    })
  }

  const unusedRecords: { key: any; geometry: any; size: number }[] = [],
    referenceCountByGeometry = new Map<any, number>()
  let unusedBytes = 0
  for (const [cacheKey, geometry] of cache) {
    referenceCountByGeometry.set(geometry, (referenceCountByGeometry.get(geometry) || 0) + 1)
    if (liveGeometrySet.has(geometry)) continue
    const size = geometryByteSize(geometry)
    unusedRecords.push({ key: cacheKey, geometry, size })
    unusedBytes += size
  }

  let unusedEntries = unusedRecords.length,
    evicted = 0
  for (const record of unusedRecords) {
    if (unusedEntries <= maxUnusedEntries && unusedBytes <= maxUnusedBytes) break
    cache.delete(record.key),
      unusedEntries--,
      (unusedBytes -= record.size),
      evicted++,
      referenceCountByGeometry.set(record.geometry, (referenceCountByGeometry.get(record.geometry) || 0) - 1),
      referenceCountByGeometry.get(record.geometry) || record.geometry.dispose()
  }
  return { unusedEntries, unusedBytes, evicted }
}

/**
 * 修剪「按规格共享」的材质缓存（`Map<key, material>`）。
 *
 * 与几何版同一套规则：**只淘汰当前场景没有引用到的条目**。材质对象本身只有几百字节，
 * 真正的成本是渲染器里的 program —— 淘汰时 `dispose()` 才能把 program 引用还回去。
 *
 * 为什么必须有上限：`textureCacheByKey` / `materialCacheByKey` 的 key 是「颜色 + 粗糙度 +
 * 透明度 …」的完整签名，同一实例里反复改墙色 / 换地毯会持续铸造新 key，而
 * `disposeObjectTree` 刻意跳过带 `architectureShared*` / `rugShared*` 标记的资源 ——
 * 也就是说这两张表在单次长编辑里只增不减。
 */
type SceneTraversableNode = {
  material?: unknown
  traverse(visit: (node: SceneTraversableNode) => void): void
}

type DisposableMaterial = { dispose?: () => void }

export function trimSharedMaterialCache(
  cache: Map<unknown, unknown>,
  sceneRoots: unknown[],
  { maxUnusedEntries = 64 } = {},
): { unusedEntries: number; evicted: number } {
  const liveMaterialSet = new Set<unknown>(),
    visitedNodeSet = new Set<unknown>()
  for (const sceneRoot of sceneRoots) {
    if (!sceneRoot || visitedNodeSet.has(sceneRoot)) continue
    ;(sceneRoot as SceneTraversableNode).traverse((sceneNode) => {
      visitedNodeSet.add(sceneNode)
      const nodeMaterials = Array.isArray(sceneNode.material)
        ? sceneNode.material
        : sceneNode.material
          ? [sceneNode.material]
          : []
      for (const nodeMaterial of nodeMaterials) if (nodeMaterial) liveMaterialSet.add(nodeMaterial)
    })
  }

  let unusedEntries = 0,
    evicted = 0
  for (const [cacheKey, material] of cache) {
    if (!material || liveMaterialSet.has(material)) continue
    if (unusedEntries < maxUnusedEntries) {
      unusedEntries += 1
      continue
    }
    cache.delete(cacheKey), (material as DisposableMaterial).dispose?.(), (evicted += 1)
  }
  return { unusedEntries, evicted }
}
