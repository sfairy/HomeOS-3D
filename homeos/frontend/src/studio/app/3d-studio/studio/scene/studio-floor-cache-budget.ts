export function trimRetainedFloors(
  retainedFloors: any,
  onFloorEvicted: any,
  { maxEntries: maxEntries = 8, maxBytes: maxBytes = 32 * 1024 * 1024 } = {},
) {
  const refCountByBuffer = new Map(),
    buffersByFloor = new Map();
  let totalBufferBytes = 0;
  for (const [floorKey, floorEntry] of retainedFloors) {
    const floorBufferSet = new Set<{ array: { byteLength: number } }>(),
      collectBufferRefs = (attribute: any) => {
        const buffer = attribute?.isInterleavedBufferAttribute ? attribute.data : attribute;
        buffer?.array?.byteLength && floorBufferSet.add(buffer);
      };
    (floorEntry.node.traverse((object: any) => {
      const geometry: {
        index?: any;
        attributes: Record<string, any>;
        morphAttributes: Record<string, any[]>;
      } = object.geometry;
      if (geometry) {
        collectBufferRefs(geometry.index);
        for (const geometryAttribute of Object.values(geometry.attributes))
          collectBufferRefs(geometryAttribute);
        for (const morphAttributes of Object.values(geometry.morphAttributes))
          for (const morphAttribute of morphAttributes) collectBufferRefs(morphAttribute);
      }
      (collectBufferRefs(object.instanceMatrix), collectBufferRefs(object.instanceColor));
    }),
      buffersByFloor.set(floorKey, floorBufferSet));
    for (const trackedBuffer of floorBufferSet) {
      const refCount = refCountByBuffer.get(trackedBuffer) || 0;
      (refCount || (totalBufferBytes += trackedBuffer.array.byteLength),
        refCountByBuffer.set(trackedBuffer, refCount + 1));
    }
  }
  for (const [evictedFloorKey, evictedFloorEntry] of retainedFloors) {
    if (retainedFloors.size <= maxEntries && totalBufferBytes <= maxBytes) break;
    retainedFloors.delete(evictedFloorKey);
    for (const releasedBuffer of buffersByFloor.get(evictedFloorKey)) {
      const remainingRefs = refCountByBuffer.get(releasedBuffer) - 1;
      (refCountByBuffer.set(releasedBuffer, remainingRefs),
        remainingRefs || (totalBufferBytes -= releasedBuffer.array.byteLength));
    }
    onFloorEvicted(evictedFloorEntry);
  }
  return totalBufferBytes;
}
