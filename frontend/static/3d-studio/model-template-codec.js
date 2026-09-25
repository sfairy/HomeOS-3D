/**
 * three.js 模型模板的序列化 / 反序列化（供 model-persistent-cache 落 IndexedDB）。
 *
 * 为什么需要自己写一套：`ObjectLoader` 的序列化信封（`toJSON`）把 `BufferAttribute` 的二进制
 * 展开成上百万元素的普通数组，JSON 化以后体积翻十几倍 —— 模型缓存的目的正是省掉重新加载与
 * 解析，用那套信封会把省下的时间全花在 JSON 解析上。这里改成只搬运 `TypedArray` 本身
 * （结构化克隆能原样存进 IndexedDB），几何 / 材质 / 节点树仍交给 three.js 自己的
 * `ObjectLoader.parseMaterials` 与 `parseObject` 还原，保证与真实加载器产出的对象一致。
 *
 * 能往返的只有「静态模板」：Group / Object3D / Mesh，材质限定为
 * MeshStandardMaterial / MeshPhysicalMaterial / MeshBasicMaterial 且不带贴图（贴图是真正的大头，
 * 也是跨会话最容易失效的部分，一并不缓存）。三类情况明确抛错并退回真实加载器：
 *   - `Invalid template`：模板信封本身不合法（版本 / three 版本 / 尺寸对不上，或属性数据畸形）。
 *   - `Non-static template`：模板带贴图、动画、蒙皮、实例化或阴影节点，缓存不可靠。
 *   - `Morphs need the original loader`：带 morph 目标（变形）的模板无法通过缓冲属性还原，
 *     必须交回真实加载器。
 *
 * 尺寸与坐标一律是场景米，本模块不做任何单位换算：缓存只是「搬运」，不参与建模。
 */

/** 模板信封版本。序列化字段一变就动它，旧条目会自动因版本不符而失效。 */
export const MODEL_TEMPLATE_REVISION = "20260923-prepared-v2";

/** 允许进缓存的节点类型。这三种足以覆盖全部静态家具 / 家电模型。 */
const STATIC_NODE_TYPES = ["Group", "Object3D", "Mesh"];
/** 允许进缓存的材质类型。 */
const STATIC_MATERIAL_TYPES = ["MeshStandardMaterial", "MeshPhysicalMaterial", "MeshBasicMaterial"];

/**
 * 生成模板缓存键：版本 + three 版本 + 模型类型 + 模型定义。
 * three 版本参与是因为几何信封依赖 three 的内部字段命名；模型定义（URL / 尺寸 / 覆盖项）
 * 变了意味着这是另一份几何，键必须跟着变，否则会端出旧模型的尺寸与朝向。
 */
export function modelTemplateKey(THREE, modelType, modelDefinition) {
  return JSON.stringify([MODEL_TEMPLATE_REVISION, THREE.REVISION, modelType, modelDefinition]);
}

/**
 * 把 `BufferAttribute` 压成可结构化克隆的普通对象。
 * 交错缓冲（InterleavedBufferAttribute）先拆包成独立连续数组 —— 缓存的值不该引用
 * 另一个缓冲（它可能来自别的几何，还原时会指向错误的数据）。
 */
function packAttribute(attribute) {
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
 *        source 是模型根节点，size 是实测尺寸（Vector3）。
 * @throws {Error} `Non-static template` / `Morphs need the original loader` / …
 */
export function packModelTemplate(THREE, { source, size }) {
  const packedGeometries = {};
  const packedMaterialColors = {};
  // 空场景壳：toJSON 会把材质写进 materials，把几何 uuid 写进 geometries —— 几何数据由我们
  // 自己搬（见文件头注释），所以这里预先占位成空对象，让 toJSON 只留 uuid 引用。
  const serializationMeta = {
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
  source.traverse(node => {
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
      for (const material of [].concat(node.material)) {
        if (
          !STATIC_MATERIAL_TYPES.includes(material.type) ||
          Object.values(material).some(value => value?.isTexture)
        ) {
          throw Error("Material needs the original loader");
        }
        // 颜色单独立一份：three.js 的材质 JSON 只写 16 进制整数，会丢掉工作色彩空间里的
        // 小数分量，往返之后颜色会有肉眼可见的偏差。
        packedMaterialColors[material.uuid] = Object.fromEntries(
          Object.entries(material)
            .filter(([, value]) => value?.isColor)
            .map(([key, value]) => [key, value.toArray()])
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
      totalAttributeBytes += attribute.array.byteLength;
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
  return {
    revision: MODEL_TEMPLATE_REVISION,
    three: THREE.REVISION,
    size: size.toArray(),
    object: serializedObject,
    materials: Object.values(serializationMeta.materials),
    materialColors: packedMaterialColors,
    geometries: packedGeometries,
    bytes: totalAttributeBytes
  };
}

/**
 * 还原一份模板。
 * @param {object} THREE three.js 命名空间。
 * @param {object} template `packModelTemplate` 的产物。
 * @returns {{source: object, size: object}} 与真实加载器同形状的 `{source, size}`。
 * @throws {Error} `Invalid template` / `Morphs need the original loader` 等（调用方据此回退加载器）。
 */
export function unpackModelTemplate(THREE, template) {
  if (
    template?.revision !== MODEL_TEMPLATE_REVISION ||
    template.three !== THREE.REVISION ||
    template.size?.length !== 3 ||
    !template.size.every(value => Number.isFinite(value) && value > 0.001)
  ) {
    throw Error("Invalid template");
  }
  const geometryByUuid = {};
  const materialByUuid = {};
  /** 由 `{array, itemSize, …}` 还原 `BufferAttribute`，带足校验以免半截数据变成畸形几何。 */
  const unpackAttribute = packed => {
    const packedArray = packed?.array;
    if (
      !ArrayBuffer.isView(packedArray) ||
      packedArray instanceof DataView ||
      !packedArray.length ||
      !Number.isInteger(packed.itemSize) ||
      packed.itemSize < 1 ||
      packed.itemSize > 4 ||
      packedArray.length % packed.itemSize
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
    for (const [uuid, packedGeometry] of Object.entries(template.geometries)) {
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
    for (const [materialUuid, colors] of Object.entries(template.materialColors || {})) {
      for (const [key, color] of Object.entries(colors)) {
        materialByUuid[materialUuid][key].fromArray(color);
      }
    }
    /** 递归校验节点树：类型 / 矩阵 / Mesh 的几何与材质引用，任一缺失就整份作废。 */
    const validateNode = node => {
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
    Object.values(geometryByUuid).forEach(geometry => geometry.dispose());
    Object.values(materialByUuid).forEach(material => material.dispose());
    throw unpackError;
  }
}
