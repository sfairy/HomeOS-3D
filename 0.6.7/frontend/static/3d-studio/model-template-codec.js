export const MODEL_TEMPLATE_REVISION = "20260923-prepared-v2";
export function modelTemplateKey(arg1, arg2, arg3) {
  return JSON.stringify([MODEL_TEMPLATE_REVISION, arg1.REVISION, arg2, arg3]);
}
function d(arg4) {
  if (arg4.isInstancedBufferAttribute || arg4.isFloat16BufferAttribute)
    throw Error("Unsupported attribute");
  let value1 = arg4.array;
  if (arg4.isInterleavedBufferAttribute) {
    value1 = new arg4.data.array.constructor(arg4.count * arg4.itemSize);
    for (let value2 = 0; value2 < arg4.count; value2++)
      for (let value3 = 0; value3 < arg4.itemSize; value3++)
        value1[value2 * arg4.itemSize + value3] =
          arg4.data.array[value2 * arg4.data.stride + arg4.offset + value3];
  }
  return {
    array: value1,
    itemSize: arg4.itemSize,
    normalized: arg4.normalized,
    name: arg4.name,
    usage: arg4.usage ?? arg4.data?.usage,
  };
}
export function packModelTemplate(arg5, { source: arg6, size: arg7 }) {
  const object1 = {},
    object2 = {},
    object3 = {
      geometries: {},
      materials: {},
      textures: {},
      images: {},
      shapes: {},
      skeletons: {},
      animations: {},
      nodes: {},
    };
  let value4 = 0;
  arg6.traverse((arg8) => {
    if (
      !["Group", "Object3D", "Mesh"].includes(arg8.type) ||
      arg8.animations?.length ||
      arg8.isSkinnedMesh ||
      arg8.isInstancedMesh ||
      arg8.isBatchedMesh
    )
      throw Error("Not a static template");
    if (arg8.material)
      for (const value9 of [].concat(arg8.material)) {
        if (
          !["MeshStandardMaterial", "MeshPhysicalMaterial", "MeshBasicMaterial"].includes(
            value9.type,
          ) ||
          Object.values(value9).some((arg9) => arg9?.isTexture)
        )
          throw Error("Material needs the original loader");
        object2[value9.uuid] = Object.fromEntries(
          Object.entries(value9)
            .filter(([, arg10]) => arg10?.isColor)
            .map(([arg11, arg12]) => [arg11, arg12.toArray()]),
        );
      }
    const value6 = arg8.geometry;
    if (!value6 || object1[value6.uuid]) return;
    if (Object.keys(value6.morphAttributes || {}).length)
      throw Error("Morphs need the original loader");
    const value7 = Object.fromEntries(
        Object.entries(value6.attributes).map(([arg13, arg14]) => [arg13, d(arg14)]),
      ),
      value8 = value6.index ? d(value6.index) : null;
    for (const value10 of [...Object.values(value7), value8].filter(Boolean))
      value4 += value10.array.byteLength;
    ((object1[value6.uuid] = {
      attributes: value7,
      index: value8,
      groups: value6.groups,
      drawRange: value6.drawRange,
      name: value6.name,
      userData: value6.userData,
      box: value6.boundingBox
        ? [value6.boundingBox.min.toArray(), value6.boundingBox.max.toArray()]
        : null,
      sphere: value6.boundingSphere
        ? [value6.boundingSphere.center.toArray(), value6.boundingSphere.radius]
        : null,
    }),
      (object3.geometries[value6.uuid] = {}));
  });
  const value5 = arg6.toJSON(object3).object;
  if (Object.keys(object3.textures).length || Object.keys(object3.animations).length)
    throw Error("Non-static template");
  return {
    revision: MODEL_TEMPLATE_REVISION,
    three: arg5.REVISION,
    size: arg7.toArray(),
    object: value5,
    materials: Object.values(object3.materials),
    materialColors: object2,
    geometries: object1,
    bytes: value4,
  };
}
export function unpackModelTemplate(arg15, arg16) {
  if (
    arg16?.revision !== MODEL_TEMPLATE_REVISION ||
    arg16.three !== arg15.REVISION ||
    arg16.size?.length !== 3 ||
    !arg16.size.every((arg17) => Number.isFinite(arg17) && arg17 > 0.001)
  )
    throw Error("Invalid template");
  const object4 = {},
    object5 = {},
    fn1 = (arg18) => {
      const value11 = arg18?.array;
      if (
        !ArrayBuffer.isView(value11) ||
        value11 instanceof DataView ||
        !value11.length ||
        !Number.isInteger(arg18.itemSize) ||
        arg18.itemSize < 1 ||
        arg18.itemSize > 4 ||
        value11.length % arg18.itemSize
      )
        throw Error("Invalid attribute");
      const value12 = new arg15.BufferAttribute(value11, arg18.itemSize, arg18.normalized);
      return (
        (value12.name = arg18.name || ""),
        arg18.usage !== undefined && value12.setUsage(arg18.usage),
        value12
      );
    };
  try {
    for (const [value15, value16] of Object.entries(arg16.geometries)) {
      const value17 = (object4[value15] = new arg15.BufferGeometry());
      ((value17.uuid = value15),
        (value17.name = value16.name),
        (value17.userData = value16.userData));
      for (const [value18, value19] of Object.entries(value16.attributes))
        value17.setAttribute(value18, fn1(value19));
      if (!value17.attributes.position) throw Error("Missing positions");
      value16.index && value17.setIndex(fn1(value16.index));
      for (const value20 of value16.groups)
        value17.addGroup(value20.start, value20.count, value20.materialIndex);
      (value17.setDrawRange(value16.drawRange.start, value16.drawRange.count),
        value16.box &&
          (value17.boundingBox = new arg15.Box3(
            new arg15.Vector3().fromArray(value16.box[0]),
            new arg15.Vector3().fromArray(value16.box[1]),
          )),
        value16.sphere &&
          (value17.boundingSphere = new arg15.Sphere(
            new arg15.Vector3().fromArray(value16.sphere[0]),
            value16.sphere[1],
          )));
    }
    const value13 = new arg15.ObjectLoader();
    Object.assign(object5, value13.parseMaterials(arg16.materials, {}));
    for (const [value21, value22] of Object.entries(arg16.materialColors || {}))
      for (const [value23, value24] of Object.entries(value22))
        object5[value21][value23].fromArray(value24);
    const fn2 = (arg19) => {
      if (
        !arg19 ||
        !["Group", "Object3D", "Mesh"].includes(arg19.type) ||
        arg19.matrix?.length !== 16 ||
        !arg19.matrix.every(Number.isFinite)
      )
        throw Error("Invalid node");
      if (
        arg19.type === "Mesh" &&
        (!object4[arg19.geometry] || ![].concat(arg19.material).every((arg20) => object5[arg20]))
      )
        throw Error("Missing mesh data");
      for (const value25 of arg19.children || []) fn2(value25);
    };
    fn2(arg16.object);
    const value14 = value13.parseObject(arg16.object, object4, object5, {}, {});
    return (
      value14.updateMatrixWorld(true),
      {
        source: value14,
        size: new arg15.Vector3().fromArray(arg16.size),
      }
    );
  } catch (error1) {
    throw (
      Object.values(object4).forEach((arg21) => arg21.dispose()),
      Object.values(object5).forEach((arg22) => arg22.dispose()),
      error1
    );
  }
}
