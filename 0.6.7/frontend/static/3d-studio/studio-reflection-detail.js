function J(arg1) {
  if (globalThis.requestIdleCallback) {
    const value2 = requestIdleCallback(arg1, {
      timeout: 250,
    });
    return () => cancelIdleCallback(value2);
  }
  const value1 = setTimeout(arg1, 0);
  return () => clearTimeout(value1);
}
export function createReflectionDetail({
  THREE: arg2,
  requestFrame: arg3 = () => {},
  makeWorker: arg4 = () =>
    new Worker(
      new URL(
        "./studio-reflection-detail-worker.js?v=20260928-overview-detail-v1",
        import.meta.url,
      ),
      {
        type: "module",
      },
    ),
  scheduleWork: arg5 = J,
  maxBytes: arg6 = 16 * 1024 * 1024,
  worldError: arg7 = 0.02,
  ratio: arg8 = 0.35,
  includeRuntime: arg9 = true,
  runtimeWorldError: arg10 = arg7,
}) {
  const map1 = new Map(),
    list1 = [],
    value3 = new arg2.Vector3();
  let value4,
    value5 = null,
    value6 = null,
    value7 = 0,
    value8 = false,
    value9 = false,
    value10 = false;
  const object1 = {
      prepared: 0,
      pending: 0,
      failed: 0,
      sourceTriangles: 0,
      detailTriangles: 0,
      bytes: 0,
    },
    fn1 = (arg11) =>
      [["index", arg11.index], ...Object.entries(arg11.attributes)].map(([arg12, arg13]) => ({
        name: arg12,
        attribute: arg13,
        version: arg13.version,
        dataVersion: arg13.data?.version,
        count: arg13.count,
      })),
    fn2 = (arg14) =>
      Object.keys(arg14.source.attributes).length + 1 === arg14.signature.length &&
      arg14.signature.every((arg15) => {
        const value11 =
          arg15.name === "index" ? arg14.source.index : arg14.source.attributes[arg15.name];
        return (
          value11 === arg15.attribute &&
          value11.version === arg15.version &&
          value11.data?.version === arg15.dataVersion &&
          value11.count === arg15.count
        );
      }),
    fn3 = (arg16) => {
      const value12 = arg16.material,
        value13 = arg16.geometry;
      return (
        arg16.isMesh &&
        arg16.userData?.reflectionSimplifiable &&
        (arg9 || !arg16.userData.runtimeDetail) &&
        !arg16.isSkinnedMesh &&
        !arg16.isInstancedMesh &&
        !arg16.isBatchedMesh &&
        !arg16.morphTargetInfluences?.length &&
        !Object.keys(value13?.morphAttributes || {}).length &&
        value12?.isMeshStandardMaterial &&
        !value12.transparent &&
        !value12.alphaTest &&
        !value12.displacementMap &&
        !(value12.transmission > 0) &&
        !arg16.customDepthMaterial &&
        !arg16.customDistanceMaterial &&
        value13?.drawRange.start === 0 &&
        value13.drawRange.count === Infinity
      );
    },
    fn4 = (arg17) =>
      [...new Set(Object.values(arg17.attributes).map((arg18) => arg18.array))].reduce(
        (arg19, arg20) => arg19 + arg20.byteLength,
        0,
      ),
    fn5 = () => {
      object1.pending = list1.length + (value5 && map1.get(value5.source) === value5 ? 1 : 0);
    };
  function fn6(arg21) {
    const value14 = map1.get(arg21);
    if (!value14) return;
    (arg21.removeEventListener("dispose", value14.release), map1.delete(arg21));
    const value15 = list1.indexOf(value14);
    (value15 !== -1 && list1.splice(value15, 1),
      value14.geometry &&
        (value14.geometry.dispose(),
        (object1.bytes -= value14.bytes),
        object1.prepared--,
        (object1.sourceTriangles -= value14.sourceTriangles),
        (object1.detailTriangles -= value14.detailTriangles)),
      fn5());
  }
  function fn7() {
    ((value9 = true),
      (object1.failed += list1.length + (value5 ? 1 : 0)),
      (list1.length = 0),
      (value5 = null),
      fn5(),
      value4?.terminate(),
      (value4 = null),
      value10 && !value8 && ((value10 = false), arg3()));
  }
  function fn8() {
    if ((fn5(), !(value8 || value9 || value5 || value6))) {
      if (!list1.length) {
        value10 && ((value10 = false), arg3());
        return;
      }
      value6 = arg5(() => {
        ((value6 = null), fn10());
      });
    }
  }
  function fn9() {
    if (!(value4 || value9))
      try {
        ((value4 = arg4()),
          (value4.onerror = fn7),
          (value4.onmessage = ({ data: arg22 }) => {
            if (value8 || !value5 || arg22.id !== value5.id) return;
            const value16 = value5;
            ((value5 = null), fn5());
            try {
              if (map1.get(value16.source) !== value16) return;
              if (!fn2(value16)) {
                fn6(value16.source);
                return;
              }
              if (arg22.failed) {
                object1.failed++;
                return;
              }
              if (
                !arg22.indices?.length ||
                arg22.indices.length >= value16.source.index.count * 0.9
              )
                return;
              const value17 = fn4(value16.source) + arg22.indices.byteLength;
              if (object1.bytes + value17 > arg6) return;
              const value18 = value16.source.clone();
              (value18.setIndex(new arg2.BufferAttribute(arg22.indices, 1)),
                (value16.geometry = value18),
                (value16.bytes = value17),
                (object1.bytes += value17),
                object1.prepared++,
                (value16.sourceTriangles = value16.source.index.count / 3),
                (value16.detailTriangles = arg22.indices.length / 3),
                (object1.sourceTriangles += value16.sourceTriangles),
                (object1.detailTriangles += value16.detailTriangles),
                (value10 = true));
            } finally {
              fn8();
            }
          }));
      } catch {
        fn7();
      }
  }
  function fn10() {
    if (value8 || value9 || value5) return;
    const value19 = list1.shift();
    if ((fn5(), !value19)) {
      fn8();
      return;
    }
    const value20 = value19.source;
    if (!fn2(value19)) {
      (fn6(value20), fn8());
      return;
    }
    if (object1.bytes + fn4(value20) + value20.index.count * 4 > arg6) {
      fn8();
      return;
    }
    if (((value5 = value19), fn5(), fn9(), !!value4))
      try {
        const value21 = ["position", "normal", "color", "uv", "runtimeSurface"].filter(
            (arg23) => value20.attributes[arg23],
          ),
          value22 = Object.fromEntries(
            value21.map((arg24) => {
              const value27 = value20.attributes[arg24],
                float32Array2 = new Float32Array(value27.count * value27.itemSize),
                list3 = ["getX", "getY", "getZ", "getW"];
              for (let value28 = 0; value28 < value27.count; value28++)
                for (let value29 = 0; value29 < value27.itemSize; value29++)
                  float32Array2[value28 * value27.itemSize + value29] =
                    value27[list3[value29]](value28);
              return [arg24, float32Array2];
            }),
          ),
          value23 = value21.filter((arg25) => arg25 !== "position"),
          value24 = value23.reduce((arg26, arg27) => arg26 + value20.attributes[arg27].itemSize, 0),
          float32Array1 = new Float32Array(value20.attributes.position.count * value24),
          list2 = [];
        let value25 = 0;
        for (const value30 of value23) {
          const value31 = value20.attributes[value30].itemSize;
          for (let value32 = 0; value32 < value31; value32++)
            list2.push(value30 === "normal" ? 0.2 : value30 === "color" ? 1 : 2);
          for (let value33 = 0; value33 < value20.attributes.position.count; value33++)
            float32Array1.set(
              value22[value30].subarray(value33 * value31, (value33 + 1) * value31),
              value33 * value24 + value25,
            );
          value25 += value31;
        }
        const uint32Array1 = new Uint32Array(value20.index.array),
          value26 = value22.position;
        value4.postMessage(
          {
            id: value19.id,
            indices: uint32Array1,
            positions: value26,
            attributes: float32Array1,
            stride: value24,
            weights: list2,
            error: value19.error,
            ratio: arg8,
          },
          [uint32Array1.buffer, value26.buffer, float32Array1.buffer],
        );
      } catch {
        (object1.failed++, (value5 = null), fn8());
      }
  }
  function fn11(arg28) {
    if (value8 || value9) return;
    const set1 = new Set();
    arg28.traverse((arg29) => {
      fn3(arg29) && set1.add(arg29.geometry);
    });
    for (const value34 of map1.keys()) set1.has(value34) || fn6(value34);
    (arg28.traverse((arg30) => {
      const value35 = arg30.geometry;
      if (
        !fn3(arg30) ||
        !value35.index ||
        !value35.attributes.position ||
        value35.index.count < 900
      )
        return;
      const value36 = map1.get(value35);
      value36 && !fn2(value36) && fn6(value35);
      const value37 = new arg2.Vector3();
      arg30.getWorldScale(value37);
      const value38 = Math.max(
          Math.abs(value37.x),
          Math.abs(value37.y),
          Math.abs(value37.z),
          0.001,
        ),
        value39 = (arg30.userData.runtimeDetail ? arg10 : arg7) / value38;
      if (
        (map1.has(value35) && map1.get(value35).error > value39 * 1.000001 && fn6(value35),
        map1.has(value35))
      )
        return;
      const object2 = {
        id: ++value7,
        source: value35,
        signature: fn1(value35),
        geometry: null,
        bytes: 0,
        maxScale: value38,
        error: value39,
        release: () => fn6(value35),
      };
      (value35.addEventListener("dispose", object2.release),
        map1.set(value35, object2),
        list1.push(object2));
    }),
      fn8());
  }
  return {
    stats: object1,
    prepare: fn11,
    get(arg31) {
      if (!fn3(arg31)) return null;
      const value40 = map1.get(arg31.geometry);
      if (!value40 || !fn2(value40)) return null;
      const value41 = value3.setFromMatrixScale(arg31.matrixWorld);
      return Math.max(Math.abs(value41.x), Math.abs(value41.y), Math.abs(value41.z)) *
        value40.error <=
        (arg31.userData.runtimeDetail ? arg10 : arg7) * 1.000001
        ? value40.geometry
        : null;
    },
    dispose() {
      ((value8 = true), value6?.(), (value6 = null), value4?.terminate(), (value5 = null));
      for (const value42 of [...map1.keys()]) fn6(value42);
      ((list1.length = 0), fn5());
    },
  };
}
