export function overviewFloorId(arg1) {
  for (let value1 = arg1; value1; value1 = value1.parent) {
    const value2 =
      value1.userData?.floorId ||
      value1.userData?.regionFloorId ||
      value1.userData?.environmentFloorId ||
      value1.userData?.lightFloorId;
    if (value2) return String(value2);
  }
  return "";
}
export function stackProjection(arg2, arg3, arg4, arg5, arg6 = new arg2.Matrix4()) {
  const value3 = new arg2.Matrix4().makeTranslation(0, arg5, 0);
  return arg6
    .copy(value3)
    .multiply(arg3.projectionMatrix)
    .multiply(arg3.matrixWorldInverse)
    .multiply(new arg2.Matrix4().makeTranslation(0, -arg4, 0))
    .multiply(arg3.matrixWorld);
}
export function createOverviewStack({
  THREE: arg7,
  renderer: arg8,
  scene: arg9,
  getCamera: arg10,
  getLayout: arg11,
}) {
  const value4 = arg8.renderBufferDirect,
    value5 = arg8.render,
    map1 = new Map(),
    map2 = new Map();
  let value6 = null,
    text1 = "",
    value7 = null,
    value8 = 0,
    value9 = -1,
    value10 = null,
    value11 = 0;
  const value12 = new arg7.Matrix4(),
    value13 = new arg7.Matrix4(),
    value14 = new arg7.Vector3(),
    value15 = new arg7.Matrix4(),
    object1 = {
      active: false,
      floorCount: 0,
      preparations: 0,
    };
  let value16 = 1,
    value17 = 1;
  const map3 = new Map(),
    map4 = new Map(),
    value18 = new arg7.Matrix4();
  function fn1() {
    const value19 = arg11();
    if (!value19.enabled || value19.floors.length < 2 || value19.amount <= 0) return null;
    const value20 = JSON.stringify([
      value19.gap,
      value19.amount,
      value19.center,
      value19.floors.map((arg12) => [arg12.id, arg12.elevation]),
    ]);
    return (value20 !== text1 && ((text1 = value20), (value9 = -1)), (value7 = value19), value19);
  }
  function fn2() {
    for (const [value21, value22] of map2) value21.frustumCulled = value22;
    map2.clear();
  }
  function fn3(arg13) {
    if (
      !value7 ||
      (value9 === value8 &&
        value12.equals(arg13.projectionMatrix) &&
        value13.equals(arg13.matrixWorldInverse))
    )
      return;
    (value12.copy(arg13.projectionMatrix),
      value13.copy(arg13.matrixWorldInverse),
      (value9 = value8));
    const value23 = [...value7.floors].sort((arg14, arg15) => arg14.elevation - arg15.elevation);
    if (value10 !== value7.bounds) {
      ((value10 = value7.bounds), (value11 = 0));
      for (const value35 of value7.bounds?.values() || [])
        for (const value36 of value35) value11 = Math.max(value11, value36[1]);
    }
    const value24 = new arg7.Vector3(value7.center[0], value11 / 2, value7.center[2]),
      value25 = value24.clone();
    ((value25.y += (value23.at(-1).elevation - value23[0].elevation) / 2),
      value14.copy(value25).applyMatrix4(arg13.matrixWorldInverse));
    const value26 = arg13.projectionMatrix.elements,
      value27 =
        value26[3] * value14.x + value26[7] * value14.y + value26[11] * value14.z + value26[15],
      value28 = value26[5] / Math.max(Math.abs(value27), 0.001),
      set1 = new Set();
    for (const [value37, value38] of value23.entries()) {
      set1.add(value38.id);
      let value39 = map1.get(value38.id);
      ((!value39 || value39.camera.type !== arg13.type) &&
        ((value39 = {
          camera: arg13.clone(false),
          reflection: arg13.clone(false),
        }),
        map1.set(value38.id, value39)),
        (value39.height = value37 * value7.gap * value7.amount),
        value39.camera.copy(arg13, false),
        stackProjection(arg7, arg13, value39.height, 0, value39.camera.projectionMatrix),
        value39.camera.projectionMatrixInverse.copy(value39.camera.projectionMatrix).invert(),
        value39.reflection.copy(arg13, false),
        (value39.reflection.position.y += value39.height),
        value39.reflection.updateMatrixWorld(true));
    }
    const value29 = Math.max(0, value7.gap) * Math.abs(value28),
      value30 = (value23.length - 1) / 2,
      value31 = value24.project(arg13),
      value32 = value25.project(arg13),
      value33 = (value32.x - value31.x) * value7.amount,
      value34 = (value32.y - value31.y) * value7.amount;
    for (const [value40, value41] of value23.entries()) {
      const value42 = map1.get(value41.id),
        value43 = (value40 - value30) * value29 * value7.amount;
      (value42.camera.projectionMatrix.premultiply(
        value15.makeTranslation(value33, value34 + value43, 0),
      ),
        value42.camera.projectionMatrixInverse.copy(value42.camera.projectionMatrix).invert());
    }
    for (const value44 of map1.keys()) set1.has(value44) || map1.delete(value44);
    (object1.preparations++, (object1.floorCount = map1.size));
  }
  function fn4(arg16, arg17 = arg10()) {
    return fn1()
      ? (arg17.updateWorldMatrix(true, false), fn3(arg17), map1.get(arg16)?.camera || arg17)
      : arg17;
  }
  return (
    (arg8.render = function (arg18, arg19, ...arg20) {
      const value45 = value6,
        value46 = arg18 === arg9 && arg19 === arg10(),
        value47 = arg9.onBeforeRender;
      let value48;
      if (value46) {
        if (value16 < 1) {
          const value49 = arg11(),
            value50 = [...value49.floors].sort((arg21, arg22) => arg21.elevation - arg22.elevation),
            value51 = value49.amount > 0 && value50.length > 1;
          ((value17 = value51 ? 1 : 0.96 + 0.04 * value16),
            map3.clear(),
            value50.forEach((arg23, arg24) =>
              map3.set(
                String(arg23.id),
                value51 ? (arg24 - (value50.length - 1) / 2) * 0.035 * (1 - value16) : 0,
              ),
            ));
        }
        ((object1.active = !!fn1()),
          value8++,
          object1.active
            ? ((value48 = function (...arg25) {
                (value47?.apply(this, arg25),
                  arg25[2] === arg19 &&
                    (fn3(arg19),
                    arg9.traverse((arg26) => {
                      !(arg26.isMesh || arg26.isLine || arg26.isPoints || arg26.isSprite) ||
                        !overviewFloorId(arg26) ||
                        (map2.has(arg26) || map2.set(arg26, arg26.frustumCulled),
                        (arg26.frustumCulled = false));
                    })));
              }),
              (arg9.onBeforeRender = value48))
            : fn2());
      }
      value6 = value46 ? arg19 : null;
      try {
        return value5.call(this, arg18, arg19, ...arg20);
      } finally {
        ((value6 = value45),
          value46 && (arg9.onBeforeRender === value48 && (arg9.onBeforeRender = value47), fn2()));
      }
    }),
    (arg8.renderBufferDirect = function (arg27, arg28, arg29, arg30, arg31, arg32) {
      if (
        value6 === arg27 &&
        arg28 === arg9 &&
        (object1.active &&
          (fn3(arg27), (arg27 = map1.get(overviewFloorId(arg31))?.camera || arg27)),
        value16 < 1 && overviewFloorId(arg31))
      ) {
        const value52 = overviewFloorId(arg31);
        let value53 = map4.get(value52);
        ((!value53 || value53.camera.type !== arg27.type) &&
          ((value53 = {
            camera: arg27.clone(false),
            frame: -1,
          }),
          map4.set(value52, value53)),
          value53.frame !== value8 &&
            (value53.camera.copy(arg27, false),
            (value53.frame = value8),
            value18.makeScale(value17, value17, 1),
            (value18.elements[13] = map3.get(value52) || 0),
            value53.camera.projectionMatrix.premultiply(value18),
            value53.camera.projectionMatrixInverse.copy(value53.camera.projectionMatrix).invert()),
          (arg27 = value53.camera));
      }
      return value4.call(this, arg27, arg28, arg29, arg30, arg31, arg32);
    }),
    {
      stats: object1,
      cameraForFloor: fn4,
      setEntryProgress(arg33) {
        ((value16 = Math.max(0, Math.min(1, arg33))), value16 === 1 && map4.clear());
      },
      rayForFloor(arg34, arg35, arg36) {
        const value54 = arg10(),
          value55 = fn4(arg34, value54);
        if (value55 === value54) return (arg36.setFromCamera(arg35, value54), arg36);
        const value56 = new arg7.Vector3(arg35.x, arg35.y, -1).unproject(value55),
          value57 = new arg7.Vector3(arg35.x, arg35.y, 1)
            .unproject(value55)
            .sub(value56)
            .normalize();
        return (arg36.set(value56, value57), (arg36.camera = value55), arg36);
      },
      reflectionCamera(arg37, arg38) {
        return arg37 !== arg10() || !fn1()
          ? arg37
          : (fn3(arg37), map1.get(overviewFloorId(arg38))?.reflection || arg37);
      },
      presentationPoint(arg39, arg40) {
        const value58 = arg10(),
          value59 = fn4(arg39, value58);
        return value59 === value58 ? arg40 : arg40.project(value59).unproject(value58);
      },
      dispose() {
        (fn2(), map1.clear(), (arg8.render = value5), (arg8.renderBufferDirect = value4));
      },
    }
  );
}
