export function createReflectionCulling(arg1, arg2 = 0) {
  const weakMap1 = new WeakMap(),
    weakMap2 = new WeakMap(),
    weakMap3 = new WeakMap(),
    list1 = [],
    map1 = new Map(),
    list2 = [],
    value1 = new arg1.Vector4(),
    value2 = new arg1.Matrix4(),
    value3 = new arg1.Matrix4(),
    value4 = new arg1.Frustum(),
    value5 = new arg1.Matrix4(),
    value6 = new arg1.Box3();
  let value7 = null;
  const object1 = {
      tested: 0,
      culled: 0,
      skippedCaptures: 0,
    },
    fn1 = (arg3) => !arg3 || arg3.isShaderMaterial || arg3.displacementMap;
  function fn2(arg4) {
    const value8 = arg4.attributes.position,
      value9 = weakMap1.get(arg4);
    return (
      (!value9 ||
        value9.attribute !== value8 ||
        value9.version !== value8?.version ||
        value9.dataVersion !== value8?.data?.version) &&
        (arg4.computeBoundingBox(),
        weakMap1.set(arg4, {
          attribute: value8,
          version: value8?.version,
          dataVersion: value8?.data?.version,
        })),
      arg4.boundingBox
    );
  }
  function fn3(arg5) {
    const value10 = fn2(arg5.geometry);
    if (!value10 || value10.isEmpty()) return null;
    let value11 = weakMap2.get(arg5);
    value11 ||
      ((value11 = {
        box: new arg1.Box3(),
        local: new arg1.Box3(),
        matrix: new arg1.Matrix4(),
        ready: false,
      }),
      weakMap2.set(arg5, value11));
    const value12 =
      arg5.isInstancedMesh &&
      (value11.instanceAttribute !== arg5.instanceMatrix ||
        value11.instanceVersion !== arg5.instanceMatrix.version ||
        value11.instanceCount !== arg5.count);
    if (
      !value11.ready ||
      !value11.local.equals(value10) ||
      !value11.matrix.equals(arg5.matrixWorld) ||
      value12
    ) {
      if (
        (value11.local.copy(value10), value11.matrix.copy(arg5.matrixWorld), arg5.isInstancedMesh)
      ) {
        value11.box.makeEmpty();
        for (let value13 = 0; value13 < arg5.count; value13++)
          (arg5.getMatrixAt(value13, value5),
            value11.box.union(value6.copy(value10).applyMatrix4(value5)));
        (value11.box.applyMatrix4(arg5.matrixWorld),
          (value11.instanceAttribute = arg5.instanceMatrix),
          (value11.instanceVersion = arg5.instanceMatrix.version),
          (value11.instanceCount = arg5.count));
      } else value11.box.copy(value10).applyMatrix4(arg5.matrixWorld);
      value11.ready = true;
    }
    return value11.box;
  }
  function fn4() {
    (fn10(),
      (list1.length = 0),
      map1.clear(),
      (object1.tested = object1.culled = object1.skippedCaptures = 0));
  }
  function fn5(arg6, arg7 = false, arg8 = "") {
    if (
      !arg6.isMesh ||
      !arg6.visible ||
      !arg6.frustumCulled ||
      (arg7 && arg6.castShadow) ||
      arg6.children.length ||
      arg6.isSkinnedMesh ||
      arg6.isBatchedMesh ||
      arg6.morphTexture ||
      arg6.morphTargetInfluences?.length ||
      !arg6.geometry?.attributes.position ||
      (Array.isArray(arg6.material) ? arg6.material.some(fn1) : fn1(arg6.material))
    )
      return;
    const value14 = fn3(arg6);
    if (
      value14 &&
      Number.isFinite(
        value14.min.x +
          value14.min.y +
          value14.min.z +
          value14.max.x +
          value14.max.y +
          value14.max.z,
      )
    ) {
      let value15 = weakMap3.get(arg6);
      (value15 ||
        ((value15 = {
          object: arg6,
          box: value14,
        }),
        weakMap3.set(arg6, value15)),
        list1.push(value15),
        map1.has(arg8) || map1.set(arg8, []),
        map1.get(arg8).push(value15));
    }
  }
  function fn6(arg9, arg10) {
    (fn10(), (value7 = arg9.plane));
    const value16 = fn3(arg9.source);
    let value17 = Infinity,
      value18 = Infinity,
      value19 = -Infinity,
      value20 = -Infinity,
      value21 = !!value16;
    if (value16)
      for (let value22 = 0; value22 < 8; value22++) {
        if (
          (value1
            .set(
              value22 & 1 ? value16.max.x : value16.min.x,
              value22 & 2 ? value16.max.y : value16.min.y,
              value22 & 4 ? value16.max.z : value16.min.z,
              1,
            )
            .applyMatrix4(arg9.matrix),
          value1.w <= 0.00001)
        ) {
          value21 = false;
          break;
        }
        const value23 = value1.x / value1.w,
          value24 = value1.y / value1.w;
        ((value17 = Math.min(value17, value23)),
          (value19 = Math.max(value19, value23)),
          (value18 = Math.min(value18, value24)),
          (value20 = Math.max(value20, value24)));
      }
    if ((value3.copy(arg10.projectionMatrix), value21)) {
      const value25 = 0.013671875 + 2 / arg9.map.width;
      if (
        ((value17 = Math.max(0, value17 - value25)),
        (value18 = Math.max(0, value18 - value25)),
        (value19 = Math.min(1, value19 + value25)),
        (value20 = Math.min(1, value20 + value25)),
        value19 <= value17 || value20 <= value18)
      )
        return (object1.skippedCaptures++, false);
      const value26 = value19 - value17,
        value27 = value20 - value18;
      (value2.set(
        1 / value26,
        0,
        0,
        -(value17 + value19 - 1) / value26,
        0,
        1 / value27,
        0,
        -(value18 + value20 - 1) / value27,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
      ),
        value3.premultiply(value2));
    }
    return (value4.setFromProjectionMatrix(value3.multiply(arg10.matrixWorldInverse)), true);
  }
  function fn7(arg11) {
    for (const { object: value28, box: value29 } of arg11 || []) {
      object1.tested++;
      const value30 = value7?.normal;
      ((arg2 > 0 &&
        value30 &&
        value30.x * (value30.x >= 0 ? value29.min.x : value29.max.x) +
          value30.y * (value30.y >= 0 ? value29.min.y : value29.max.y) +
          value30.z * (value30.z >= 0 ? value29.min.z : value29.max.z) +
          value7.constant >
          arg2 + 0.0001) ||
        !value4.intersectsBox(value29)) &&
        (list2.push(value28), (value28.visible = false), object1.culled++);
    }
  }
  function fn8(arg12 = null) {
    return (
      arg12 === null ? fn7(list1) : (fn7(map1.get("")), arg12 !== "" && fn7(map1.get(arg12))),
      true
    );
  }
  function fn9(arg13, arg14, arg15 = null) {
    return fn6(arg13, arg14) && fn8(arg15);
  }
  function fn10() {
    for (const value31 of list2) value31.visible = true;
    list2.length = 0;
  }
  return {
    reset: fn4,
    add: fn5,
    prepare: fn6,
    apply: fn8,
    begin: fn9,
    restore: fn10,
    stats: object1,
  };
}
