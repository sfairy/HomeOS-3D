export function trimRetainedFloors(
  arg1,
  arg2,
  { maxEntries: arg3 = 8, maxBytes: arg4 = 32 * 1024 * 1024 } = {},
) {
  const map1 = new Map(),
    map2 = new Map();
  let value1 = 0;
  for (const [value2, value3] of arg1) {
    const set1 = new Set(),
      fn1 = (arg5) => {
        const value4 = arg5?.isInterleavedBufferAttribute ? arg5.data : arg5;
        value4?.array?.byteLength && set1.add(value4);
      };
    (value3.node.traverse((arg6) => {
      const value5 = arg6.geometry;
      if (value5) {
        fn1(value5.index);
        for (const value6 of Object.values(value5.attributes)) fn1(value6);
        for (const value7 of Object.values(value5.morphAttributes))
          for (const value8 of value7) fn1(value8);
      }
      (fn1(arg6.instanceMatrix), fn1(arg6.instanceColor));
    }),
      map2.set(value2, set1));
    for (const value9 of set1) {
      const value10 = map1.get(value9) || 0;
      (value10 || (value1 += value9.array.byteLength), map1.set(value9, value10 + 1));
    }
  }
  for (const [value11, value12] of arg1) {
    if (arg1.size <= arg3 && value1 <= arg4) break;
    arg1.delete(value11);
    for (const value13 of map2.get(value11)) {
      const value14 = map1.get(value13) - 1;
      (map1.set(value13, value14), value14 || (value1 -= value13.array.byteLength));
    }
    arg2(value12);
  }
  return value1;
}
