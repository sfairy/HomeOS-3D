import { mergeGeometries } from "../vendor/three/0.182.0/BufferGeometryUtils.js";
const q = new Set([
    "drawer-chest",
    "bunk-bed",
    "wardrobe",
    "office-chair",
    "router",
    "humidifier",
    "dehumidifier",
    "heater",
    "pool-table",
    "tea-table-set",
    "bed",
    "chair",
    "coffeetable",
    "rounddiningtable",
    "rounddiningtable_turntable",
    "sofa",
    "squarecoffeetable",
    "table",
    "tvstand",
  ]),
  D = new Set([
    "drawer-chest",
    "steelstairs",
    "tea_bar_machine",
    "pipelinewaterpurifier",
    "bunk-bed",
    "wardrobe",
    "office-chair",
    "router",
    "humidifier",
    "dehumidifier",
    "heater",
    "pool-table",
    "tea-table-set",
    "bed",
    "coffeetable",
    "rounddiningtable",
    "rounddiningtable_turntable",
    "squarecoffeetable",
    "table",
    "plant",
    "nightstand",
    "vanity",
    "desk",
    "bookcase",
    "piano",
    "bar",
    "sideboard",
    "shoecabinet",
    "cabinet",
    "glasscabinet",
    "shelf",
    "wallcabinet",
    "kitchenbase",
    "kitchensink",
    "kitchencooktop",
    "basin",
    "toilet",
    "squattoilet",
    "urinal",
    "shower",
    "bathtub",
    "floorac",
    "airpurifier",
    "fridge",
    "rangehood",
    "dishwasher",
    "steamoven",
    "microwave",
    "ricecooker",
    "washer",
    "dryer",
    "desktop",
    "laptop",
  ]);
export function compactFurnitureIndices(arg1, arg2, arg3) {
  q.has(arg3) &&
    arg2?.traverse?.((arg4) => {
      const value1 = arg4.geometry,
        value2 = value1?.index;
      value2?.array instanceof Uint32Array &&
        value1.attributes.position.count <= 65536 &&
        value1.setIndex(new arg1.BufferAttribute(new Uint16Array(value2.array), 1));
    });
}
export function createFurnitureBatchCache(arg5) {
  let weakMap1 = new WeakMap();
  const set1 = new Set();
  function fn1(arg6, arg7, arg8, arg9, arg10 = true) {
    if (!D.has(arg8) || !arg9) return false;
    arg6.updateMatrixWorld(true);
    const value3 = arg6.matrixWorld.clone().invert(),
      list1 = [],
      set2 = new Set();
    let value4 = false;
    if (
      (arg6.traverse((arg11) => {
        if (!arg11.isMesh) return;
        const value8 = arg9(arg11),
          value9 = arg10 ? arg9(arg11, false, true) : value8;
        for (let value10 = arg11; value10; value10 = value10.parent) if (!value10.visible) return;
        !value8 ||
          !value9 ||
          !arg11.userData.externalModelSharedGeometry ||
          !arg11.geometry.attributes.normal ||
          arg11.geometry.drawRange.start !== 0 ||
          arg11.geometry.drawRange.count !== Infinity ||
          arg11.children.length ||
          !Number.isFinite(arg11.matrixWorld.determinant()) ||
          arg11.matrixWorld.determinant() === 0 ||
          (arg11.matrixWorld.determinant() < 0 && arg8 !== "steelstairs") ||
          (set2.has(value8) && (value4 = true),
          set2.add(value8),
          list1.push({
            object: arg11,
            exact: value8,
            tinted: value9,
            matrix: new arg5.Matrix4().multiplyMatrices(value3, arg11.matrixWorld),
          }));
      }),
      !value4 &&
        arg10 &&
        list1.some((arg12) => arg12.object.material.userData?.plan2SurfaceSlope) &&
        (value4 = new Set(list1.map((arg13) => arg13.tinted)).size < list1.length),
      !value4)
    )
      return false;
    const value5 = JSON.stringify([
      arg10,
      list1.map((arg14) => [arg14.object.geometry.uuid, arg14.exact, arg14.matrix.elements]),
    ]);
    let value6 = weakMap1.get(arg7);
    value6 || ((value6 = new Map()), weakMap1.set(arg7, value6));
    let value7 = value6.get(value5);
    if (!value7) {
      const map1 = new Map();
      for (const value11 of list1)
        (map1.has(value11.tinted) || map1.set(value11.tinted, []),
          map1.get(value11.tinted).push(value11));
      value7 = [];
      for (const value12 of map1.values()) {
        const value13 = value12.map(({ object: arg15, matrix: arg16 }) => {
            const value17 = arg15.geometry,
              value18 = new arg5.BufferGeometry();
            for (const value22 of ["position", "normal"]) {
              const value23 = value17.attributes[value22],
                float32Array1 = new Float32Array(value23.count * 3);
              for (let value24 = 0; value24 < value23.count; value24++)
                ((float32Array1[value24 * 3] = value23.getX(value24)),
                  (float32Array1[value24 * 3 + 1] = value23.getY(value24)),
                  (float32Array1[value24 * 3 + 2] = value23.getZ(value24)));
              value18.setAttribute(value22, new arg5.BufferAttribute(float32Array1, 3));
            }
            const value19 = value17.attributes.position.count;
            if (arg10) {
              const value25 = arg15.material.color,
                value26 = value17.attributes.color,
                float32Array2 = new Float32Array(value19 * 3);
              for (let value27 = 0; value27 < value19; value27++)
                ((float32Array2[value27 * 3] =
                  value25.r * (arg15.material.vertexColors ? value26.getX(value27) : 1)),
                  (float32Array2[value27 * 3 + 1] =
                    value25.g * (arg15.material.vertexColors ? value26.getY(value27) : 1)),
                  (float32Array2[value27 * 3 + 2] =
                    value25.b * (arg15.material.vertexColors ? value26.getZ(value27) : 1)));
              value18.setAttribute("color", new arg5.BufferAttribute(float32Array2, 3));
            } else
              arg15.material.vertexColors &&
                value18.setAttribute("color", value17.attributes.color.clone());
            const value20 = value17.index?.count ?? value19,
              value21 = value19 <= 65536 ? new Uint16Array(value20) : new Uint32Array(value20);
            for (let value28 = 0; value28 < value20; value28++)
              value21[value28] = value17.index ? value17.index.getX(value28) : value28;
            if (arg16.determinant() < 0)
              for (let value29 = 0; value29 < value21.length; value29 += 3) {
                const value30 = value21[value29 + 1];
                ((value21[value29 + 1] = value21[value29 + 2]), (value21[value29 + 2] = value30));
              }
            return (
              value18.setIndex(new arg5.BufferAttribute(value21, 1)),
              value18.applyMatrix4(arg16)
            );
          }),
          value14 = mergeGeometries(value13);
        if ((value13.forEach((arg17) => arg17.dispose()), !value14)) {
          for (const value31 of value7) (value31.geometry.dispose(), value31.material.dispose());
          return false;
        }
        const value15 = value12[0].object,
          value16 = value15.material.clone();
        (arg10 && (value16.color.setRGB(1, 1, 1), (value16.vertexColors = true)),
          value7.push({
            geometry: value14,
            material: value16,
            castShadow: value15.castShadow,
            receiveShadow: value15.receiveShadow,
            renderOrder: value15.renderOrder,
            layers: value15.layers.mask,
          }));
      }
      value6.set(value5, value7);
      for (const value32 of value7) (set1.add(value32.geometry), set1.add(value32.material));
    }
    for (const { object: value33 } of list1) value33.removeFromParent();
    for (const value34 of value7) {
      const value35 = new arg5.Mesh(value34.geometry, value34.material);
      ((value35.castShadow = value34.castShadow),
        (value35.receiveShadow = value34.receiveShadow),
        (value35.renderOrder = value34.renderOrder),
        (value35.layers.mask = value34.layers),
        Object.assign(value35.userData, {
          furnitureBatchCompiled: true,
          externalModelSharedGeometry: true,
          externalModelSharedMaterial: true,
          externalModelSharedTextures: true,
        }),
        arg6.add(value35));
    }
    return true;
  }
  return {
    prepare: fn1,
    dispose() {
      for (const value36 of set1) value36.dispose();
      (set1.clear(), (weakMap1 = new WeakMap()));
    },
  };
}
