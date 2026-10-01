import { createReflectionDetail } from "./studio-reflection-detail.js?v=20260929-runtime-surface-v1-20260928-overview-detail-v1";
function T(arg1) {
  return {
    matrix: new arg1.Matrix4(),
    sphere: new arg1.Sphere(),
    lengths: [0, 0],
    wr: 0,
  };
}
function H(arg2, arg3) {
  const value1 = arg2.matrix.multiplyMatrices(
    arg3.projectionMatrix,
    arg3.matrixWorldInverse,
  ).elements;
  arg2.wr = Math.hypot(value1[3], value1[7], value1[11]);
  for (let value2 = 0; value2 < 2; value2++)
    arg2.lengths[value2] = Math.hypot(value1[value2], value1[value2 + 4], value1[value2 + 8]);
  return arg2;
}
function I(arg4, arg5, arg6, arg7, arg8) {
  const value3 = arg4.geometry;
  value3.boundingSphere || value3.computeBoundingSphere();
  const value4 = arg5.sphere.copy(value3.boundingSphere).applyMatrix4(arg4.matrixWorld),
    value5 = arg5.matrix.elements,
    value6 = value4.center,
    value7 = arg5.wr,
    value8 = value5[3] * value6.x + value5[7] * value6.y + value5[11] * value6.z + value5[15],
    value9 = Math.abs(value8) - value4.radius * value7;
  if (value9 <= 0.001) return Infinity;
  const fn1 = (arg9, arg10) => {
    const value10 = arg5.lengths[arg9],
      value11 =
        Math.abs(
          value5[arg9] * value6.x +
            value5[arg9 + 4] * value6.y +
            value5[arg9 + 8] * value6.z +
            value5[arg9 + 12],
        ) +
        value4.radius * value10;
    return arg10 * 0.5 * arg8 * (value10 / value9 + (value11 * value7) / (value9 * value9));
  };
  return Math.max(fn1(0, arg6), fn1(1, arg7));
}
export function detailPixelError(arg11, arg12, arg13, arg14, arg15, arg16) {
  return I(arg12, H(T(arg11), arg13), arg14, arg15, arg16);
}
export function createOverviewDetail({
  THREE: arg17,
  renderer: arg18,
  scene: arg19,
  getCamera: arg20,
  getFloorCamera: arg23 = (arg26, arg27) => arg27,
  getFloorId: arg24 = () => "",
  enabled: arg21,
  requestFrame: arg25 = () => {},
  detail: arg22,
}) {
  const value12 =
      arg22 ||
      createReflectionDetail({
        THREE: arg17,
        worldError: 0.003,
        ratio: 0.55,
        maxBytes: 8388608,
        requestFrame: arg25,
      }),
    value13 = arg18.render,
    value14 = arg18.renderBufferDirect;
  let weakSet1 = new WeakSet();
  const map1 = new Map(),
    fn2 = () => {
      weakSet1 = new WeakSet();
    };
  arg18.domElement?.addEventListener?.("webglcontextlost", fn2);
  let list1 = [],
    value15,
    value16,
    value17 = false;
  const object1 = {
      active: false,
      meshes: 0,
      savedTriangles: 0,
      cache: value12.stats,
    },
    value18 = new arg17.Vector2(),
    map2 = new Map();
  let value19 = 0;
  function fn3() {
    for (const [value20, value21] of map1) value20.geometry = value21;
    map1.clear();
  }
  return (
    (arg18.render = function (...arg28) {
      const value22 = [...map1].map(([arg29, arg30]) => [arg29, arg30, arg29.geometry]);
      fn3();
      try {
        return value13.apply(this, arg28);
      } finally {
        fn3();
        for (const [value23, value24, value25] of value22)
          (map1.set(value23, value24), (value23.geometry = value25));
      }
    }),
    (arg18.renderBufferDirect = function (arg31, arg32, arg33, arg34, arg35, arg36) {
      const value26 = map1.get(arg35);
      value26 && (arg34.isMeshDepthMaterial || arg34.isMeshDistanceMaterial) && (arg33 = value26);
      const value27 = value14.call(this, arg31, arg32, arg33, arg34, arg35, arg36);
      return (!value26 && arg35.geometry === arg33 && weakSet1.add(arg33), value27);
    }),
    {
      stats: object1,
      prepare(arg37, arg38) {
        value17 ||
          (arg37 === value15 && arg38 === value16) ||
          ((value15 = arg37),
          (value16 = arg38),
          (list1 = []),
          map2.clear(),
          arg37?.traverse((arg39) => {
            arg39.userData?.reflectionSimplifiable &&
              arg39.isMesh &&
              list1.push({
                mesh: arg39,
                floor: arg24(arg39),
              });
          }),
          arg37 && value12.prepare(arg37));
      },
      begin(arg40) {
        if (
          (fn3(),
          (object1.active = false),
          (object1.meshes = object1.savedTriangles = 0),
          (object1.ready = 0),
          (object1.near = 0),
          (object1.enabled = arg21()),
          !(value17 || arg40 !== arg20() || !object1.enabled))
        ) {
          (arg18.getDrawingBufferSize(value18), value19++);
          for (const { mesh: value28, floor: value29 } of list1) {
            if (!weakSet1.has(value28.geometry)) continue;
            let value30 = true;
            for (let value34 = value28; value34; value34 = value34.parent)
              if (!value34.visible) {
                value30 = false;
                break;
              }
            if (!value30) continue;
            const value31 = value12.get(value28);
            if (!value31) continue;
            object1.ready++;
            let value32 = map2.get(value29);
            if (
              (value32 || ((value32 = T(arg17)), map2.set(value29, value32)),
              value32.frame !== value19 &&
                (H(value32, arg23(value28, arg40)), (value32.frame = value19)),
              I(value28, value32, value18.x, value18.y, 0.003) > 0.55)
            ) {
              object1.near++;
              continue;
            }
            const value33 = value28.geometry;
            (map1.set(value28, value33),
              (value28.geometry = value31),
              object1.meshes++,
              (object1.savedTriangles += (value33.index.count - value31.index.count) / 3));
          }
          object1.active = object1.meshes > 0;
        }
      },
      dispose() {
        ((value17 = true),
          fn3(),
          value12.dispose(),
          (list1 = []),
          map2.clear(),
          arg18.domElement?.removeEventListener?.("webglcontextlost", fn2),
          (arg18.render = value13),
          (arg18.renderBufferDirect = value14));
      },
    }
  );
}
