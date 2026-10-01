export const RUNTIME_FURNITURE_TYPES = new Set([
  "bed",
  "sofa",
  "cabinet",
  "desk",
  "nightstand",
  "bookcase",
  "tvstand",
  "sideboard",
  "wallcabinet",
  "shoecabinet",
  "table",
  "chair",
  "coffeetable",
  "squarecoffeetable",
  "wardrobe",
  "drawer-chest",
  "shelf",
  "bar",
  "piano",
  "rounddiningtable",
  "vanity",
  "kitchenbase",
]);
export function compactRuntimeFurniture(
  arg1,
  arg2,
  { THREE: arg3, mergeGeometries: arg4, materialKey: arg5 },
) {
  const map1 = new Map(),
    map2 = new Map(),
    set1 = new Set(),
    set2 = new Set(),
    object1 = {
      before: 0,
      after: 0,
      triangles: 0,
      vertexBytes: 0,
      types: [],
    },
    set3 = new Set();
  arg1.updateMatrixWorld(true);
  const value1 = arg1.matrixWorld.clone().invert();
  for (const { item: value2, group: value3 } of arg2)
    !RUNTIME_FURNITURE_TYPES.has(value2.type) ||
      value3.parent !== arg1 ||
      value3.traverse((arg6) => {
        const value4 = arg6.material,
          value5 = arg6.geometry,
          value6 = (value5?.index?.count ?? value5?.attributes.position?.count ?? 0) / 3;
        if (
          !arg6.isMesh ||
          arg6.isInstancedMesh ||
          arg6.children.length ||
          !value5?.attributes.position ||
          !value5.attributes.normal ||
          value6 > 512 ||
          value5.drawRange.start !== 0 ||
          value5.drawRange.count !== Infinity ||
          arg6.matrixWorld.determinant() <= 0 ||
          arg6.customDepthMaterial ||
          arg6.customDistanceMaterial ||
          Object.keys(value5.morphAttributes).length ||
          arg6.onAfterRender !== arg3.Object3D.prototype.onAfterRender ||
          value4?.anisotropy > 0 ||
          !arg5(arg6, true, true) ||
          Object.values(value4).some((arg7) => arg7?.isTexture) ||
          (value4.vertexColors && value5.attributes.color?.itemSize !== 3)
        )
          return;
        for (let value10 = arg6; value10 && value10 !== arg1; value10 = value10.parent)
          if (!value10.visible) return;
        let value7 = map2.get(value4);
        value7 ||
          ((value7 = value4.clone()),
          value7.color.setRGB(1, 1, 1),
          (value7.vertexColors = true),
          (value7.roughness = value7.metalness = 1),
          map2.set(value4, value7));
        const value8 = Object.create(arg6);
        value8.material = value7;
        const value9 = arg5(value8, true, false);
        value9 &&
          (map1.has(value9) || map1.set(value9, []),
          map1.get(value9).push({
            mesh: arg6,
            type: value2.type,
            id: value2.id,
          }));
      });
  for (const value11 of map1.values()) {
    if (value11.length < 2) continue;
    const value12 = value11.map(({ mesh: arg8 }) => {
        const value17 = arg8.geometry,
          value18 = new arg3.BufferGeometry(),
          value19 = value17.attributes.position.count;
        for (const value22 of ["position", "normal"]) {
          const value23 = value17.attributes[value22],
            float32Array3 = new Float32Array(value19 * 3);
          for (let value24 = 0; value24 < value19; value24++)
            ((float32Array3[value24 * 3] = value23.getX(value24)),
              (float32Array3[value24 * 3 + 1] = value23.getY(value24)),
              (float32Array3[value24 * 3 + 2] = value23.getZ(value24)));
          value18.setAttribute(value22, new arg3.BufferAttribute(float32Array3, 3));
        }
        const float32Array1 = new Float32Array(value19 * 3),
          float32Array2 = new Float32Array(value19 * 2),
          value20 = arg8.material,
          value21 = value17.attributes.color;
        for (let value25 = 0; value25 < value19; value25++)
          ((float32Array1[value25 * 3] =
            value20.color.r * (value20.vertexColors ? value21.getX(value25) : 1)),
            (float32Array1[value25 * 3 + 1] =
              value20.color.g * (value20.vertexColors ? value21.getY(value25) : 1)),
            (float32Array1[value25 * 3 + 2] =
              value20.color.b * (value20.vertexColors ? value21.getZ(value25) : 1)),
            (float32Array2[value25 * 2] = value20.roughness),
            (float32Array2[value25 * 2 + 1] = value20.metalness));
        (value18.setAttribute("color", new arg3.BufferAttribute(float32Array1, 3)),
          value18.setAttribute("runtimeSurface", new arg3.BufferAttribute(float32Array2, 2)));
        const uint32Array1 = new Uint32Array(value17.index ? value17.index.count : value19);
        for (let value26 = 0; value26 < uint32Array1.length; value26++)
          uint32Array1[value26] = value17.index ? value17.index.getX(value26) : value26;
        return (
          value18.setIndex(new arg3.BufferAttribute(uint32Array1, 1)),
          value18.applyMatrix4(new arg3.Matrix4().multiplyMatrices(value1, arg8.matrixWorld))
        );
      }),
      value13 = arg4(value12);
    if ((value12.forEach((arg9) => arg9.dispose()), !value13)) continue;
    const value14 = value11[0].mesh,
      value15 = map2.get(value14.material).clone();
    ((value15.onBeforeCompile = (arg10) => {
      ((arg10.vertexShader =
        "attribute vec2 runtimeSurface;\nvarying vec2 vRuntimeSurface;\n" + arg10.vertexShader),
        (arg10.vertexShader = arg10.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvRuntimeSurface = runtimeSurface;",
        )),
        (arg10.fragmentShader = "varying vec2 vRuntimeSurface;\n" + arg10.fragmentShader),
        (arg10.fragmentShader = arg10.fragmentShader.replace(
          "#include <roughnessmap_fragment>",
          "#include <roughnessmap_fragment>\nroughnessFactor *= vRuntimeSurface.x;",
        )),
        (arg10.fragmentShader = arg10.fragmentShader.replace(
          "#include <metalnessmap_fragment>",
          "#include <metalnessmap_fragment>\nmetalnessFactor *= vRuntimeSurface.y;",
        )));
    }),
      (value15.customProgramCacheKey = () => "runtime-furniture-surface-v1"));
    const value16 = new arg3.Mesh(value13, value15);
    ((value16.name = "runtime-compact-furniture"),
      (value16.matrixAutoUpdate = false),
      (value16.castShadow = value14.castShadow),
      (value16.receiveShadow = value14.receiveShadow),
      (value16.renderOrder = value14.renderOrder),
      (value16.layers.mask = value14.layers.mask),
      (value16.userData.modelLayer = "items"),
      (value16.userData.exportRole = "plan"),
      (value16.userData.reflectionSimplifiable = true),
      (value16.userData.runtimeFurnitureItemIds = value11.map((arg11) => arg11.id)),
      (value16.userData.runtimeFurnitureStats = {
        before: value11.length,
        after: 1,
        triangles: value13.index.count / 3,
      }));
    for (const { mesh: value27, type: value28 } of value11)
      (set3.add(value28),
        value27.removeFromParent(),
        Object.entries(value27.userData).some(
          ([arg12, arg13]) => arg12.endsWith("SharedGeometry") && arg13,
        ) || set1.add(value27.geometry),
        Object.entries(value27.userData).some(
          ([arg14, arg15]) => arg14.endsWith("SharedMaterial") && arg15,
        ) || set2.add(value27.material));
    ((object1.before += value11.length),
      object1.after++,
      (object1.triangles += value13.index.count / 3),
      (object1.vertexBytes += Object.values(value13.attributes).reduce(
        (arg16, arg17) => arg16 + arg17.array.byteLength,
        value13.index.array.byteLength,
      )),
      arg1.add(value16));
  }
  for (const value29 of map2.values()) value29.dispose();
  arg1.traverse((arg18) => {
    arg18.geometry && set1.delete(arg18.geometry);
    for (const value30 of Array.isArray(arg18.material)
      ? arg18.material
      : arg18.material
        ? [arg18.material]
        : [])
      set2.delete(value30);
  });
  for (const value31 of set1) value31.dispose();
  for (const value32 of set2) value32.dispose();
  return (
    (object1.types = [...set3]),
    (arg1.userData.runtimeFurnitureBatchStats = object1),
    object1
  );
}
