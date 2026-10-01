export function enlargeWarmLeaves(arg1, arg2, arg3 = 1.85) {
  const value1 = arg1.attributes.position;
  if (!value1) return arg1;
  const value2 = arg1.index,
    value3 = arg1.groups.length
      ? arg1.groups
      : [
          {
            start: 0,
            count: value2?.count ?? value1.count,
            materialIndex: 0,
          },
        ],
    map1 = new Map(),
    fn1 = (arg4) => {
      let value7 = arg4;
      for (; map1.get(value7) !== value7;) value7 = map1.get(value7);
      for (; arg4 !== value7;) {
        const value8 = map1.get(arg4);
        (map1.set(arg4, value7), (arg4 = value8));
      }
      return value7;
    },
    fn2 = (arg5, arg6) => {
      map1.set(fn1(arg5), fn1(arg6));
    },
    map2 = new Map();
  for (const value9 of value3)
    if (/foliage/i.test(arg2[value9.materialIndex]?.name ?? ""))
      for (let value10 = value9.start; value10 < value9.start + value9.count; value10 += 3) {
        const list1 = [];
        for (let value11 = 0; value11 < 3; value11++) {
          const value12 = value2 ? value2.getX(value10 + value11) : value10 + value11;
          if (!map1.has(value12)) {
            map1.set(value12, value12);
            const value13 = [value1.getX(value12), value1.getY(value12), value1.getZ(value12)]
              .map((arg7) => Math.round(arg7 * 10000))
              .join(",");
            map2.has(value13) ? fn2(value12, map2.get(value13)) : map2.set(value13, value12);
          }
          list1.push(value12);
        }
        (fn2(list1[0], list1[1]), fn2(list1[1], list1[2]));
      }
  if (!map1.size) return arg1;
  const map3 = new Map();
  for (const value14 of map1.keys()) {
    const value15 = fn1(value14);
    (map3.has(value15) || map3.set(value15, []), map3.get(value15).push(value14));
  }
  const value4 = arg1.clone(),
    value5 = value4.attributes.position;
  let value6 = 0;
  for (const value16 of map3.values()) {
    const list2 = [Infinity, Infinity, Infinity],
      list3 = [-Infinity, -Infinity, -Infinity];
    for (const value21 of value16) {
      const list4 = [value1.getX(value21), value1.getY(value21), value1.getZ(value21)];
      for (let value22 = 0; value22 < 3; value22++)
        ((list2[value22] = Math.min(list2[value22], list4[value22])),
          (list3[value22] = Math.max(list3[value22], list4[value22])));
    }
    const value17 = list2.map((arg8, arg9) => (arg8 + list3[arg9]) * 0.5),
      value18 = (((value6++ % 3) - 1) * Math.PI) / 3,
      value19 = Math.cos(value18),
      value20 = Math.sin(value18);
    for (const value23 of value16) {
      const value24 = (value1.getX(value23) - value17[0]) * arg3,
        value25 = (value1.getZ(value23) - value17[2]) * arg3;
      value5.setXYZ(
        value23,
        value17[0] + value24 * value19 - value25 * value20,
        value17[1] + (value1.getY(value23) - value17[1]) * arg3,
        value17[2] + value24 * value20 + value25 * value19,
      );
    }
  }
  return (
    (value5.needsUpdate = true),
    value4.computeVertexNormals(),
    value4.computeBoundingBox(),
    value4.computeBoundingSphere(),
    (value4.userData.warmLeafCount = map3.size),
    value4
  );
}
