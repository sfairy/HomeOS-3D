import { mergeGeometries } from "../vendor/three/0.182.0/BufferGeometryUtils.js";
const w = new Set([
  "camera",
  "presence",
  "speaker",
  "fan",
  "airer",
  "plant",
  "wallac",
  "floorac",
  "airpurifier",
  "nas",
  "storagewaterheater",
  "gaswaterheater",
  "fridge",
  "dishwasher",
  "washer",
  "dryer",
]);
export function compactStaticDeviceParts(arg1, arg2, arg3, arg4) {
  const object1 = {
    before: 0,
    after: 0,
  };
  if (!w.has(arg3)) return object1;
  const list1 = [],
    set1 = new Set(),
    set2 = new Set();
  arg2.traverse((arg5) => {
    !arg5.isMesh && (arg3 !== "airer" || arg5.name === "moving-rack") && list1.push(arg5);
  });
  for (const value1 of list1) {
    const map1 = new Map();
    for (const value2 of value1.children) {
      const value3 = value2.geometry;
      if (
        !value2.isMesh ||
        value2.isInstancedMesh ||
        value2.children.length ||
        !value2.visible ||
        !value3?.attributes.position ||
        Object.keys(value3.morphAttributes).length ||
        value3.drawRange.start !== 0 ||
        value3.drawRange.count !== Infinity ||
        value2.customDepthMaterial ||
        value2.customDistanceMaterial ||
        value2.onAfterRender !== arg1.Object3D.prototype.onAfterRender ||
        Object.keys(value2.userData).some(
          (arg6) => !/^externalModelShared(Geometry|Material|Textures)$/.test(arg6),
        ) ||
        (value2.updateMatrix(), value2.matrix.determinant() <= 0)
      )
        continue;
      const value4 = !value2.material?.vertexColors,
        value5 = arg4(value2, true, value4);
      if (!value5) continue;
      const value6 = Object.entries(value3.attributes)
          .sort(([arg7], [arg8]) => arg7.localeCompare(arg8))
          .map(([arg9, arg10]) => [
            arg9,
            arg10.itemSize,
            arg10.normalized,
            arg10.array?.constructor.name,
          ]),
        value7 = JSON.stringify([value5, !!value3.index, value6, value2.frustumCulled, value4]);
      (map1.has(value7) || map1.set(value7, []), map1.get(value7).push(value2));
    }
    for (const value8 of map1.values()) {
      if (value8.length < 2) continue;
      const value9 = !value8[0].material.vertexColors,
        value10 = value8.map((arg11) => {
          const value15 = arg11.geometry.clone().applyMatrix4(arg11.matrix);
          if (value9) {
            const value16 = value15.attributes.position.count,
              float32Array1 = new Float32Array(value16 * 3),
              value17 = arg11.material.color;
            for (let value18 = 0; value18 < value16; value18++)
              float32Array1.set([value17.r, value17.g, value17.b], value18 * 3);
            value15.setAttribute("color", new arg1.BufferAttribute(float32Array1, 3));
          }
          return value15;
        }),
        value11 = mergeGeometries(value10);
      if ((value10.forEach((arg12) => arg12.dispose()), !value11)) continue;
      const value12 = value8[0],
        value13 = value9 ? value12.material.clone() : value12.material;
      value9 && (value13.color.setRGB(1, 1, 1), (value13.vertexColors = true));
      const value14 = new arg1.Mesh(value11, value13);
      ((value14.name = "static-device-parts"),
        (value14.userData.reflectionSimplifiable = true),
        (value14.userData.runtimeDetail = true),
        (value14.castShadow = value12.castShadow),
        (value14.receiveShadow = value12.receiveShadow),
        (value14.renderOrder = value12.renderOrder),
        (value14.layers.mask = value12.layers.mask),
        (value14.frustumCulled = value12.frustumCulled),
        (value14.userData.externalModelSharedMaterial =
          !value9 && value12.userData.externalModelSharedMaterial === true),
        (value14.userData.externalModelSharedTextures =
          value12.userData.externalModelSharedTextures === true));
      for (const value19 of value8)
        (value1.remove(value19),
          value19.userData.externalModelSharedGeometry || set1.add(value19.geometry),
          value19.userData.externalModelSharedMaterial || set2.add(value19.material));
      (value1.add(value14), (object1.before += value8.length), object1.after++);
    }
  }
  arg2.traverse((arg13) => {
    set1.delete(arg13.geometry);
    for (const value20 of Array.isArray(arg13.material) ? arg13.material : [arg13.material])
      set2.delete(value20);
  });
  for (const value21 of set1) value21.dispose();
  for (const value22 of set2) value22.dispose();
  return (
    arg2.traverse((arg14) => {
      arg14.isMesh &&
        arg14.userData.externalModelSharedGeometry &&
        !arg14.children.length &&
        Object.keys(arg14.userData).every(
          (arg15) =>
            /^externalModelShared(Geometry|Material|Textures)$/.test(arg15) ||
            arg15 === "furnitureBatchCompiled",
        ) &&
        !arg14.customDepthMaterial &&
        !arg14.customDistanceMaterial &&
        arg14.onBeforeRender === arg1.Object3D.prototype.onBeforeRender &&
        Object.assign(arg14.userData, {
          reflectionSimplifiable: true,
          runtimeDetail: true,
        });
    }),
    (arg2.userData.staticDeviceBatchStats = object1),
    object1
  );
}
