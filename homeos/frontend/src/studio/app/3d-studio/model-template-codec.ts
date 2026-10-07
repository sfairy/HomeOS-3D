import { packModelTextures, restoreModelTextures } from "./model-texture-cache";

const MODEL_TEMPLATE_REVISION = "20260930-textures-v3";

/** 模板里一个打包属性的最小结构。 */
type PackedAttribute = {
  array: unknown;
  itemSize: number;
  normalized?: boolean;
  name?: string;
  usage?: number;
};

/** 模板里一个打包几何体的结构（落盘格式）。 */
type PackedGeometry = {
  attributes: Record<string, PackedAttribute>;
  index: PackedAttribute | null;
  groups: { start: number; count: number; materialIndex: number }[];
  drawRange: { start: number; count: number };
  name?: string;
  userData?: Record<string, unknown>;
  box?: unknown[] | null;
  sphere?: unknown[] | null;
};

/** 打包材质颜色时只挑 isColor 属性，并调用它的 toArray()。 */
type ColorLike = { isColor?: boolean; toArray: () => number[] };

export function modelTemplateKey(THREE: any, modelType: any, modelDefinition: any) {
  return JSON.stringify([MODEL_TEMPLATE_REVISION, THREE.REVISION, modelType, modelDefinition]);
}
function packAttribute(attribute: any) {
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
/** 只取几何体的包围盒/包围球，供模板落盘（可提前算好，避免 unpack 时再遍历）。 */
function describeGeometryBounds(geometry: any) {
  return {
    box: geometry.boundingBox
      ? [geometry.boundingBox.min.toArray(), geometry.boundingBox.max.toArray()]
      : null,
    sphere: geometry.boundingSphere
      ? [geometry.boundingSphere.center.toArray(), geometry.boundingSphere.radius]
      : null,
  };
}
/** 遍历模型，按几何体 uuid 收集包围盒/包围球。 */
export function captureModelTemplateBounds(source: any) {
  const boundsByUuid: Record<string, any> = {};
  return (
    source.traverse((node: any) => {
      node.geometry &&
        !(boundsByUuid as any)[node.geometry.uuid] &&
        ((boundsByUuid as any)[node.geometry.uuid] = describeGeometryBounds(node.geometry));
    }),
    boundsByUuid
  );
}
export function packModelTemplate(threeApi: any, { source: source, size: size, bounds: bounds }: any) {
  const packedGeometries: Record<string, any> = {},
    packedMaterialColors: Record<string, any> = {},
    serializationMeta = {
      geometries: {} as Record<string, any>,
      materials: {} as Record<string, any>,
      textures: {} as Record<string, any>,
      images: {} as Record<string, any>,
      shapes: {} as Record<string, any>,
      skeletons: {} as Record<string, any>,
      animations: {} as Record<string, any>,
      nodes: {} as Record<string, any>,
    };
  let totalAttributeBytes = 0;
  const textureSet = new Set(),
    packedTransforms: Record<string, any> = {},
    materialIdByUuid = new Map();
  source.traverse((node: any) => {
    if (
      !["Group", "Object3D", "Mesh"].includes(node.type) ||
      node.animations?.length ||
      node.isSkinnedMesh ||
      node.isInstancedMesh ||
      node.isBatchedMesh
    )
      throw Error("Not a static template");
    if (
      (((packedTransforms as any)[node.uuid] = {
        position: node.position.toArray(),
        quaternion: node.quaternion.toArray(),
        scale: node.scale.toArray(),
        order: node.rotation.order,
      }),
      node.material)
    )
      for (const material of ([] as any[]).concat(node.material)) {
        if (
          !["MeshStandardMaterial", "MeshPhysicalMaterial", "MeshBasicMaterial"].includes(
            material.type,
          )
        )
          throw Error("Material needs the original loader");
        materialIdByUuid.set(material.uuid, material.id);
        for (const materialValue of Object.values(material as Record<string, any>))
          materialValue?.isTexture && textureSet.add(materialValue);
        (packedMaterialColors as any)[material.uuid] = Object.fromEntries(
          Object.entries(material as Record<string, ColorLike>)
            .filter(([, propertyValue]) => propertyValue?.isColor)
            .map(([key, colorValue]) => [key, colorValue.toArray()]),
        );
      }
    const geometry = node.geometry;
    if (!geometry || (packedGeometries as any)[geometry.uuid]) return;
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
      totalAttributeBytes += packedAttribute!.array.byteLength;
    (((packedGeometries as any)[geometry.uuid] = {
      attributes: packedAttributes,
      index: packedIndex,
      groups: geometry.groups,
      drawRange: geometry.drawRange,
      name: geometry.name,
      userData: geometry.userData,
      ...(bounds?.[geometry.uuid] || describeGeometryBounds(geometry)),
    }),
      ((serializationMeta.geometries as any)[geometry.uuid] = {}));
  });
  const packedTextures = packModelTextures(textureSet, serializationMeta);
  totalAttributeBytes += packedTextures.bytes;
  const serializedObject = source.toJSON(serializationMeta).object;
  if (Object.keys(serializationMeta.animations).length) throw Error("Non-static template");
  return {
    revision: MODEL_TEMPLATE_REVISION,
    three: threeApi.REVISION,
    size: size.toArray(),
    object: serializedObject,
    materials: Object.values(serializationMeta.materials as Record<string, any>).sort(
      (materialA, materialB) => materialIdByUuid.get(materialA.uuid) - materialIdByUuid.get(materialB.uuid),
    ),
    materialColors: packedMaterialColors,
    geometries: packedGeometries,
    transforms: packedTransforms,
    bytes: totalAttributeBytes,
    textures: Object.values(serializationMeta.textures),
    textureImages: packedTextures.images,
    textureMatrices: packedTextures.matrices,
  };
}
export function unpackModelTemplate(threeModule: any, template: any, decodedTextures: Record<string, any> = {}) {
  if (
    template?.revision !== MODEL_TEMPLATE_REVISION ||
    template.three !== threeModule.REVISION ||
    template.size?.length !== 3 ||
    !template.size.every((sizeValue: any) => Number.isFinite(sizeValue) && sizeValue > 0.001)
  )
    throw Error("Invalid template");
  const geometryByUuid: Record<string, { dispose: () => void }> = {},
    materialByUuid: Record<string, { dispose: () => void }> = {},
    unpackAttribute = (packed: any) => {
      const sourceArray = packed?.array,
        sourceArrayLength = sourceArray?.length;
      if (
        !ArrayBuffer.isView(sourceArray) ||
        sourceArray instanceof DataView ||
        !sourceArrayLength ||
        !Number.isInteger(packed.itemSize) ||
        packed.itemSize < 1 ||
        packed.itemSize > 4 ||
        sourceArrayLength % packed.itemSize
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
    for (const [uuid, packedGeometry] of Object.entries(
      template.geometries as Record<string, PackedGeometry>,
    )) {
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
    if ((template.textures || []).some((texture: any) => !(decodedTextures as any)[texture.uuid]))
      throw Error("Textures must be decoded first");
    Object.assign(materialByUuid, objectLoader.parseMaterials(template.materials, decodedTextures));
    for (const [materialUuid, colors] of Object.entries(template.materialColors || {}))
      for (const [colorKey, color] of Object.entries(colors as Record<string, any>))
        (materialByUuid as any)[materialUuid][colorKey].fromArray(color);
    const validateNode = (validatedNode: any) => {
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
      loadedSource.traverse((restoredNode: any) => {
        const packedTransform = template.transforms?.[restoredNode.uuid];
        if (
          !packedTransform ||
          packedTransform.position?.length !== 3 ||
          packedTransform.quaternion?.length !== 4 ||
          packedTransform.scale?.length !== 3 ||
          ![
            ...packedTransform.position,
            ...packedTransform.quaternion,
            ...packedTransform.scale,
          ].every(Number.isFinite)
        )
          throw Error("Invalid transform");
        ((restoredNode.rotation.order = packedTransform.order),
          restoredNode.position.fromArray(packedTransform.position),
          restoredNode.quaternion.fromArray(packedTransform.quaternion),
          restoredNode.scale.fromArray(packedTransform.scale));
      }),
      loadedSource.updateMatrixWorld(true),
      {
        source: loadedSource,
        size: new threeModule.Vector3().fromArray(template.size),
        bounds: captureModelTemplateBounds(loadedSource),
      }
    );
  } catch (unpackError: any) {
    throw (
      Object.values(geometryByUuid).forEach((cachedGeometry) => cachedGeometry.dispose()),
      Object.values(materialByUuid).forEach((cachedMaterial) => cachedMaterial.dispose()),
      unpackError
    );
  }
}
export async function restoreModelTemplate(threeModule: any, template: any, options: any = {}) {
  if (template?.revision !== MODEL_TEMPLATE_REVISION || template.three !== threeModule.REVISION)
    throw Error("Invalid template");
  if (!template.textures?.length) return unpackModelTemplate(threeModule, template);
  const decodedTextures = await restoreModelTextures(threeModule, template, options);
  if (!decodedTextures) return null;
  try {
    return options.valid && !options.valid()
      ? (Object.values(decodedTextures).forEach((decodedTexture) => decodedTexture.dispose()), null)
      : unpackModelTemplate(threeModule, template, decodedTextures);
  } catch (unpackError: any) {
    throw (
      Object.values(decodedTextures).forEach((decodedTexture) => decodedTexture.dispose()),
      unpackError
    );
  }
}
