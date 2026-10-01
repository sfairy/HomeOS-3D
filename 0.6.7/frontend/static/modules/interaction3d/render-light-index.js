export function createRenderLightIndex() {
  let value1 = null,
    value2 = true,
    value3 = false,
    list1 = [],
    list2 = [],
    list3 = [],
    list4 = [],
    list5 = [];
  const map1 = new Map(),
    object1 = {
      builds: 0,
      sorts: 0,
      reads: 0,
      checkedLights: 0,
    },
    fn1 = () => {
      value2 = true;
    };
  function fn2() {
    for (const value4 of list1)
      (value4.removeEventListener("childadded", fn1),
        value4.removeEventListener("childremoved", fn1));
    ((list1 = []), (list2 = []));
  }
  function fn3() {
    (fn2(),
      (list4 = []),
      (list5 = []),
      (list3 = []),
      value1.traverse((arg1) => {
        if (
          (list1.push(arg1),
          arg1.addEventListener("childadded", fn1),
          arg1.addEventListener("childremoved", fn1),
          !arg1.isSpotLight)
        )
          return;
        const list6 = [];
        for (
          let value5 = arg1;
          value5 && (list6.push(value5), value5 !== value1);
          value5 = value5.parent
        );
        list2.push({
          object: arg1,
          path: list6,
        });
      }),
      (value2 = false),
      object1.builds++);
  }
  return {
    stats: object1,
    read(arg2, arg3) {
      if (value3) return [];
      (value1 !== arg2 && ((value1 = arg2), (value2 = true)),
        value2 && fn3(),
        object1.reads++,
        map1.clear());
      let value6 = 0,
        value7 = false;
      for (const { object: value8, path: value9 } of list2) {
        object1.checkedLights++;
        let value10 = true;
        for (const value12 of value9) {
          let value13 = map1.get(value12);
          if (
            (value13 === undefined &&
              ((value13 = value12.visible !== false), map1.set(value12, value13)),
            !value13)
          ) {
            value10 = false;
            break;
          }
        }
        if (!value10 || !value8.layers.test(arg3.layers)) continue;
        const value11 = (value8.castShadow ? 2 : 0) + (value8.map ? 1 : 0);
        ((list4[value6] !== value8 || list5[value6] !== value11) && (value7 = true),
          (list4[value6] = value8),
          (list5[value6] = value11),
          value6++);
      }
      if (
        (list4.length !== value6 && (value7 = true), (list4.length = list5.length = value6), value7)
      ) {
        list3.length = 0;
        for (const value14 of list4) list3.push(value14);
        (list3.sort(
          (arg4, arg5) =>
            (arg5.castShadow ? 2 : 0) +
            (arg5.map ? 1 : 0) -
            ((arg4.castShadow ? 2 : 0) + (arg4.map ? 1 : 0)),
        ),
          object1.sorts++);
      }
      return list3;
    },
    invalidate: fn1,
    dispose() {
      ((value3 = true), fn2(), map1.clear(), (value1 = null), (list3 = list4 = list5 = []));
    },
  };
}
