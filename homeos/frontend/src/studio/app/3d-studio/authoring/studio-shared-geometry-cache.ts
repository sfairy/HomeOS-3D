/**
 * 共享几何缓存修剪（0.7.8 `studio-shared-geometry-cache`）。
 *
 * 编辑器会跨楼层/预览共享同一份几何体；离开的楼层不会立刻释放，
 * 这里按「未引用条目数 + 未引用字节数」双阈值回收，避免显存无限增长。
 */

type SharedGeometryCacheStats = {
  unusedEntries: number;
  unusedBytes: number;
  evicted: number;
};

/** 估算几何体占用的字节数（索引 + 全部属性数组）。 */
function geometryByteSize(geometry: any) {
  const bufferSet = new Set<ArrayBufferLike>();
  for (const attribute of [geometry.index, ...Object.values(geometry.attributes || {})]) {
    const bufferArray = (attribute as any)?.isInterleavedBufferAttribute
      ? (attribute as any).data?.array
      : (attribute as any)?.array;
    bufferArray && bufferSet.add(bufferArray);
  }
  return [...bufferSet].reduce((total, bufferArray) => total + bufferArray.byteLength, 0);
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
    visitedNodeSet = new Set<any>();
  for (const sceneRoot of sceneRoots) {
    if (!sceneRoot || visitedNodeSet.has(sceneRoot)) continue;
    sceneRoot.traverse((sceneNode: any) => {
      (visitedNodeSet.add(sceneNode), sceneNode.geometry && liveGeometrySet.add(sceneNode.geometry));
    });
  }

  const unusedRecords: { key: any; geometry: any; size: number }[] = [],
    referenceCountByGeometry = new Map<any, number>();
  let unusedBytes = 0;
  for (const [cacheKey, geometry] of cache) {
    referenceCountByGeometry.set(
      geometry,
      (referenceCountByGeometry.get(geometry) || 0) + 1,
    );
    if (liveGeometrySet.has(geometry)) continue;
    const size = geometryByteSize(geometry);
    unusedRecords.push({ key: cacheKey, geometry, size });
    unusedBytes += size;
  }

  let unusedEntries = unusedRecords.length,
    evicted = 0;
  for (const record of unusedRecords) {
    if (unusedEntries <= maxUnusedEntries && unusedBytes <= maxUnusedBytes) break;
    (cache.delete(record.key),
      unusedEntries--,
      (unusedBytes -= record.size),
      evicted++,
      referenceCountByGeometry.set(
        record.geometry,
        (referenceCountByGeometry.get(record.geometry) || 0) - 1,
      ),
      referenceCountByGeometry.get(record.geometry) || record.geometry.dispose());
  }
  return { unusedEntries, unusedBytes, evicted };
}
