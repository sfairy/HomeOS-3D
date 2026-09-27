
/** 模板信封版本。序列化字段一变就动它，旧条目会自动因版本不符而失效。 */
export const MODEL_TEMPLATE_REVISION = "20260923-prepared-v2";

/** 允许进缓存的节点类型。这三种足以覆盖全部静态家具 / 家电模型。 */
const STATIC_NODE_TYPES = ["Group", "Object3D", "Mesh"];
/** 允许进缓存的材质类型。 */
const STATIC_MATERIAL_TYPES = ["MeshStandardMaterial", "MeshPhysicalMaterial", "MeshBasicMaterial"];

/**
 * 生成模板缓存键：版本 + three 版本 + 模型类型 + 模型定义。
 */
export function modelTemplateKey(THREE: any, modelType: any, modelDefinition: any) {
  return JSON.stringify([MODEL_TEMPLATE_REVISION, THREE.REVISION, modelType, modelDefinition]);
}

/**
 * 把 `BufferAttribute` 压成可结构化克隆的普通对象。
 */
function packAttribute(attribute: any) {
  if (attribute.isInstancedBufferAttribute || attribute.isFloat16BufferAttribute) {
    throw Error("Unsupported attribute");
  }
  let packedArray = attribute.array;
  if (attribute.isInterleavedBufferAttribute) {
    packedArray = new attribute.data.array.constructor(attribute.count * attribute.itemSize);
    for (let index = 0; index < attribute.count; index++) {
      for (let component = 0; component < attribute.itemSize; component++) {
        packedArray[index * attribute.itemSize + component] =
          attribute.data.array[index * attribute.data.stride + attribute.offset + component];
      }
    }
  }
  return {
    array: packedArray,
    itemSize: attribute.itemSize,
    normalized: attribute.normalized,
    name: attribute.name,
    usage: attribute.usage ?? attribute.data?.usage
  };
}

/**
 * 打包一份静态模型模板。
 * @param {object} THREE three.js 命名空间（注入而非 import，便于测试替身）。
 * @param {{source: object, size: object}} model `{source, size}` —— 与加载缓存同一形状：
 */
export function packModelTemplate(THREE: any, { source, size }: any) {
  const packedGeometries: Record<string, any> = {};
  const packedMaterialColors: Record<string, any> = {};
  const serializationMeta: Record<string, any> = {
    geometries: {},
    materials: {},
    textures: {},
    images: {},
    shapes: {},
    skeletons: {},
    animations: {},
    nodes: {}
  };
  let totalAttributeBytes = 0;
  source.traverse((node: any) => {
    if (
      !STATIC_NODE_TYPES.includes(node.type) ||
      node.animations?.length ||
      node.isSkinnedMesh ||
      node.isInstancedMesh ||
      node.isBatchedMesh
    ) {
      throw Error("Not a static template");
    }
    if (node.material) {
      for (const material of [].concat(node.material) as any[]) {
        if (
          !STATIC_MATERIAL_TYPES.includes(material.type) ||
          Object.values(material).some((value: any) => value?.isTexture)
        ) {
          throw Error("Material needs the original loader");
        }
        // 颜色单独立一份：three.js 的材质 JSON 只写 16 进制整数，会丢掉工作色彩空间里的
        packedMaterialColors[material.uuid] = Object.fromEntries(
          Object.entries(material)
            .filter(([, value]: [string, any]) => value?.isColor)
            .map(([key, value]: [string, any]) => [key, value.toArray()])
        );
      }
    }
    const geometry = node.geometry;
    if (!geometry || packedGeometries[geometry.uuid]) {
      return;
    }
    if (Object.keys(geometry.morphAttributes || {}).length) {
      throw Error("Morphs need the original loader");
    }
    const packedAttributes = Object.fromEntries(
      Object.entries(geometry.attributes).map(([name, attribute]) => [name, packAttribute(attribute)])
    );
    const packedIndex = geometry.index ? packAttribute(geometry.index) : null;
    for (const attribute of [...Object.values(packedAttributes), packedIndex].filter(Boolean)) {
      totalAttributeBytes += attribute!.array.byteLength;
    }
    packedGeometries[geometry.uuid] = {
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
        : null
    };
    serializationMeta.geometries[geometry.uuid] = {};
  });
  const serializedObject = source.toJSON(serializationMeta).object;
  if (Object.keys(serializationMeta.textures).length || Object.keys(serializationMeta.animations).length) {
    throw Error("Non-static template");
  }
  // 配额计量：顶点属性只占真实占用的一部分 —— 节点树 / 材质 / 颜色的 JSON 同样进 IndexedDB。
  const envelopeText = JSON.stringify({
    object: serializedObject,
    materials: Object.values(serializationMeta.materials),
    materialColors: packedMaterialColors
  });
  const envelopeBytes =
    typeof TextEncoder === "function" ? new TextEncoder().encode(envelopeText).length : envelopeText.length;
  return {
    revision: MODEL_TEMPLATE_REVISION,
    three: THREE.REVISION,
    size: size.toArray(),
    object: serializedObject,
    materials: Object.values(serializationMeta.materials),
    materialColors: packedMaterialColors,
    geometries: packedGeometries,
    bytes: totalAttributeBytes + envelopeBytes
  };
}

/**
 * 还原一份模板。
 * @param {object} THREE three.js 命名空间。
 * @param {object} template `packModelTemplate` 的产物。
 * @returns {{source: object, size: object}} 与真实加载器同形状的 `{source, size}`。
 */
export function unpackModelTemplate(THREE: any, template: any) {
  if (
    template?.revision !== MODEL_TEMPLATE_REVISION ||
    template.three !== THREE.REVISION ||
    template.size?.length !== 3 ||
    !template.size.every((value: any) => Number.isFinite(value) && value > 0.001)
  ) {
    throw Error("Invalid template");
  }
  const geometryByUuid: Record<string, any> = {};
  const materialByUuid: Record<string, any> = {};
  const unpackAttribute = (packed: any) => {
    const packedArray = packed?.array;
    if (
      !ArrayBuffer.isView(packedArray) ||
      packedArray instanceof DataView ||
      !(packedArray as any).length ||
      !Number.isInteger(packed.itemSize) ||
      packed.itemSize < 1 ||
      packed.itemSize > 4 ||
      (packedArray as any).length % packed.itemSize
    ) {
      throw Error("Invalid attribute");
    }
    const attribute = new THREE.BufferAttribute(packedArray, packed.itemSize, packed.normalized);
    attribute.name = packed.name || "";
    if (packed.usage !== undefined) {
      attribute.setUsage(packed.usage);
    }
    return attribute;
  };
  try {
    for (const [uuid, packedGeometry] of Object.entries(template.geometries) as [string, any][]) {
      const geometry = (geometryByUuid[uuid] = new THREE.BufferGeometry());
      geometry.uuid = uuid;
      geometry.name = packedGeometry.name;
      geometry.userData = packedGeometry.userData;
      for (const [name, packedAttribute] of Object.entries(packedGeometry.attributes)) {
        geometry.setAttribute(name, unpackAttribute(packedAttribute));
      }
      if (!geometry.attributes.position) {
        throw Error("Missing positions");
      }
      if (packedGeometry.index) {
        geometry.setIndex(unpackAttribute(packedGeometry.index));
      }
      for (const group of packedGeometry.groups) {
        geometry.addGroup(group.start, group.count, group.materialIndex);
      }
      geometry.setDrawRange(packedGeometry.drawRange.start, packedGeometry.drawRange.count);
      if (packedGeometry.box) {
        geometry.boundingBox = new THREE.Box3(
          new THREE.Vector3().fromArray(packedGeometry.box[0]),
          new THREE.Vector3().fromArray(packedGeometry.box[1])
        );
      }
      if (packedGeometry.sphere) {
        geometry.boundingSphere = new THREE.Sphere(
          new THREE.Vector3().fromArray(packedGeometry.sphere[0]),
          packedGeometry.sphere[1]
        );
      }
    }
    // 材质与节点树交给 three.js 自己的解析器：与真实加载器产出同一套几何 / 材质实例语义。
    const objectLoader = new THREE.ObjectLoader();
    Object.assign(materialByUuid, objectLoader.parseMaterials(template.materials, {}));
    for (const [materialUuid, colors] of Object.entries(template.materialColors || {}) as [string, any][]) {
      for (const [key, color] of Object.entries(colors) as [string, any][]) {
        materialByUuid[materialUuid][key].fromArray(color);
      }
    }
    /** 递归校验节点树：类型 / 矩阵 / Mesh 的几何与材质引用，任一缺失就整份作废。 */
    const validateNode = (node: any) => {
      if (
        !node ||
        !STATIC_NODE_TYPES.includes(node.type) ||
        node.matrix?.length !== 16 ||
        !node.matrix.every(Number.isFinite)
      ) {
        throw Error("Invalid node");
      }
      if (node.type === "Mesh" && (!geometryByUuid[node.geometry] || ![].concat(node.material).every(uuid => materialByUuid[uuid]))) {
        throw Error("Missing mesh data");
      }
      for (const child of node.children || []) {
        validateNode(child);
      }
    };
    validateNode(template.object);
    const loadedSource = objectLoader.parseObject(template.object, geometryByUuid, materialByUuid, {}, {});
    loadedSource.updateMatrixWorld(true);
    return { source: loadedSource, size: new THREE.Vector3().fromArray(template.size) };
  } catch (unpackError) {
    // 半途失败时把已经建出来的几何与材质显式释放：它们还没进入场景，没人会替我们 dispose。
    Object.values(geometryByUuid).forEach((geometry: any) => geometry.dispose());
    Object.values(materialByUuid).forEach((material: any) => material.dispose());
    throw unpackError;
  }
}
