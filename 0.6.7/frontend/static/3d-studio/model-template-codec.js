export const MODEL_TEMPLATE_REVISION = "20260923-prepared-v2";
export function modelTemplateKey(THREE, modelType, modelDefinition) {
  return JSON.stringify([MODEL_TEMPLATE_REVISION, THREE.REVISION, modelType, modelDefinition]);
}
function packAttribute(attribute) {
  if (attribute.isInstancedBufferAttribute || attribute.isFloat16BufferAttribute)
    throw Error("Unsupported attribute");
  let packedArray = attribute.array;
  if (attribute.isInterleavedBufferAttribute) {
    packedArray = new attribute.data.array.constructor(attribute.count * attribute.itemSize);
    for (let index = 0; index < attribute.count; index++)
      for (let component = 0; component < attribute.itemSize; component++)
        packedArray[index * attribute.itemSize + component] =
          attribute.data.array[index * attribute.data.stride + attribute.offset + component];
  }
  return {
    array: packedArray,
    itemSize: attribute.itemSize,
    normalized: attribute.normalized,
    name: attribute.name,
    usage: attribute.usage ?? attribute.data?.usage,
  };
}
export function packModelTemplate(threeApi, { source: source, size: size }) {
  const packedGeometries = {},
    packedMaterialColors = {},
    serializationMeta = {
      geometries: {},
      materials: {},
      textures: {},
      images: {},
      shapes: {},
      skeletons: {},
      animations: {},
      nodes: {},
    };
  let totalAttributeBytes = 0;
  source.traverse((node) => {
    if (
      !["Group", "Object3D", "Mesh"].includes(node.type) ||
      node.animations?.length ||
      node.isSkinnedMesh ||
      node.isInstancedMesh ||
      node.isBatchedMesh
    )
      throw Error("Not a static template");
    if (node.material)
      for (const material of [].concat(node.material)) {
        if (
          !["MeshStandardMaterial", "MeshPhysicalMaterial", "MeshBasicMaterial"].includes(
            material.type,
          ) ||
          Object.values(material).some((value) => value?.isTexture)
        )
          throw Error("Material needs the original loader");
        packedMaterialColors[material.uuid] = Object.fromEntries(
          Object.entries(material)
            .filter(([, propertyValue]) => propertyValue?.isColor)
            .map(([key, colorValue]) => [key, colorValue.toArray()]),
        );
      }
    const geometry = node.geometry;
    if (!geometry || packedGeometries[geometry.uuid]) return;
    if (Object.keys(geometry.morphAttributes || {}).length)
      throw Error("Morphs need the original loader");
    const packedAttributes = Object.fromEntries(
        Object.entries(geometry.attributes).map(([name, geometryAttribute]) => [
          name,
          packAttribute(geometryAttribute),
        ]),
      ),
      packedIndex = geometry.index ? packAttribute(geometry.index) : null;
    for (const packedAttribute of [...Object.values(packedAttributes), packedIndex].filter(Boolean))
      totalAttributeBytes += packedAttribute.array.byteLength;
    ((packedGeometries[geometry.uuid] = {
      attributes: packedAttributes,
      index: packedIndex,
      groups: geometry.groups,
      drawRange: geometry.drawRange,
      name: geometry.name,
      userData: geometry.userData,
      box: geometry.boundingBox
        ? [geometry.boundingBox.min.toArray(), geometry.boundingBox.max.toArray()]
        : null,
      sphere: geometry.boundingSphere
        ? [geometry.boundingSphere.center.toArray(), geometry.boundingSphere.radius]
        : null,
    }),
      (serializationMeta.geometries[geometry.uuid] = {}));
  });
  const serializedObject = source.toJSON(serializationMeta).object;
  if (
    Object.keys(serializationMeta.textures).length ||
    Object.keys(serializationMeta.animations).length
  )
    throw Error("Non-static template");
  return {
    revision: MODEL_TEMPLATE_REVISION,
    three: threeApi.REVISION,
    size: size.toArray(),
    object: serializedObject,
    materials: Object.values(serializationMeta.materials),
    materialColors: packedMaterialColors,
    geometries: packedGeometries,
    bytes: totalAttributeBytes,
  };
}
export function unpackModelTemplate(threeModule, template) {
  if (
    template?.revision !== MODEL_TEMPLATE_REVISION ||
    template.three !== threeModule.REVISION ||
    template.size?.length !== 3 ||
    !template.size.every((sizeValue) => Number.isFinite(sizeValue) && sizeValue > 0.001)
  )
    throw Error("Invalid template");
  const geometryByUuid = {},
    materialByUuid = {},
    unpackAttribute = (packed) => {
      const sourceArray = packed?.array;
      if (
        !ArrayBuffer.isView(sourceArray) ||
        sourceArray instanceof DataView ||
        !sourceArray.length ||
        !Number.isInteger(packed.itemSize) ||
        packed.itemSize < 1 ||
        packed.itemSize > 4 ||
        sourceArray.length % packed.itemSize
      )
        throw Error("Invalid attribute");
      const unpackedAttribute = new threeModule.BufferAttribute(
        sourceArray,
        packed.itemSize,
        packed.normalized,
      );
      return (
        (unpackedAttribute.name = packed.name || ""),
        packed.usage !== undefined && unpackedAttribute.setUsage(packed.usage),
        unpackedAttribute
      );
    };
  try {
    for (const [uuid, packedGeometry] of Object.entries(template.geometries)) {
      const restoredGeometry = (geometryByUuid[uuid] = new threeModule.BufferGeometry());
      ((restoredGeometry.uuid = uuid),
        (restoredGeometry.name = packedGeometry.name),
        (restoredGeometry.userData = packedGeometry.userData));
      for (const [attributeName, packedGeometryAttribute] of Object.entries(
        packedGeometry.attributes,
      ))
        restoredGeometry.setAttribute(attributeName, unpackAttribute(packedGeometryAttribute));
      if (!restoredGeometry.attributes.position) throw Error("Missing positions");
      packedGeometry.index && restoredGeometry.setIndex(unpackAttribute(packedGeometry.index));
      for (const group of packedGeometry.groups)
        restoredGeometry.addGroup(group.start, group.count, group.materialIndex);
      (restoredGeometry.setDrawRange(
        packedGeometry.drawRange.start,
        packedGeometry.drawRange.count,
      ),
        packedGeometry.box &&
          (restoredGeometry.boundingBox = new threeModule.Box3(
            new threeModule.Vector3().fromArray(packedGeometry.box[0]),
            new threeModule.Vector3().fromArray(packedGeometry.box[1]),
          )),
        packedGeometry.sphere &&
          (restoredGeometry.boundingSphere = new threeModule.Sphere(
            new threeModule.Vector3().fromArray(packedGeometry.sphere[0]),
            packedGeometry.sphere[1],
          )));
    }
    const objectLoader = new threeModule.ObjectLoader();
    Object.assign(materialByUuid, objectLoader.parseMaterials(template.materials, {}));
    for (const [materialUuid, colors] of Object.entries(template.materialColors || {}))
      for (const [colorKey, color] of Object.entries(colors))
        materialByUuid[materialUuid][colorKey].fromArray(color);
    const validateNode = (validatedNode) => {
      if (
        !validatedNode ||
        !["Group", "Object3D", "Mesh"].includes(validatedNode.type) ||
        validatedNode.matrix?.length !== 16 ||
        !validatedNode.matrix.every(Number.isFinite)
      )
        throw Error("Invalid node");
      if (
        validatedNode.type === "Mesh" &&
        (!geometryByUuid[validatedNode.geometry] ||
          ![]
            .concat(validatedNode.material)
            .every((meshMaterialUuid) => materialByUuid[meshMaterialUuid]))
      )
        throw Error("Missing mesh data");
      for (const child of validatedNode.children || []) validateNode(child);
    };
    validateNode(template.object);
    const loadedSource = objectLoader.parseObject(
      template.object,
      geometryByUuid,
      materialByUuid,
      {},
      {},
    );
    return (
      loadedSource.updateMatrixWorld(true),
      {
        source: loadedSource,
        size: new threeModule.Vector3().fromArray(template.size),
      }
    );
  } catch (unpackError) {
    throw (
      Object.values(geometryByUuid).forEach((cachedGeometry) => cachedGeometry.dispose()),
      Object.values(materialByUuid).forEach((cachedMaterial) => cachedMaterial.dispose()),
      unpackError
    );
  }
}
