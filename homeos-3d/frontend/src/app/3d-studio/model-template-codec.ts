// v7：餐边柜玻璃柜继续收口 —— 门框整块前移到柜体前脸之外（原来和柜体顶面 / 右侧面共面，
// 会 z-fighting 闪色）、顶板与内衬铺满整格到前脸、内腔层板从 `body` 槽挪进 `interior` 槽
// （白柜体风格下玻璃后面不再是两块白层板）、内衬整体缩进 0.4mm 避免任何共面。
// v6：餐边柜玻璃柜的门框挪进**门**槽（`sideboard-material-3`），门框铺到柜顶与柜体右缘 ——
// 上一版把上 / 右外轮廓退到门框后面之后，柜体（`body` 槽）的前脸就露在门框外侧，正面看
// 就是「顶部一条白柜体」；内腔另铺 `interior` 槽内衬，玻璃后面不再是裸柜体色。
// v5：餐边柜「最右吊柜改玻璃柜」改成玻璃与内腔都铺满**整格柜体**（门缝 → 柜体右缘、
// 壁龛顶 → 柜顶），不再补 `door` 槽木门框。模板缓存里存的就是补完门的场景，不升版本的话
// 旧模板会继续把「带木框、只占门洞」的玻璃门塞回来，几何改动等于没生效。
// v4：台盆（basin）的 `top` 从「1.2cm 竖收边」改判为真正的**台面**薄板并接上石材档位，
// 加载器要为这个槽位补石材板平面 UV —— 不升版本的话，旧模板缓存会继续用立方体六面 UV，
// 大理石整图在台面上会糊成六份。
// 指纹串里必须留住 `stone-slab-uv` 这段：`verify:material` 的 L6f 用它断言「石材板平面 UV
// 的补丁挂在模板缓存指纹上」，改名会把那条闸门弄红（石材整图又会糊回立方体 UV）。
export const MODEL_TEMPLATE_REVISION =
  "20261002-stone-slab-uv-sideboard-glass-double-door-v9";

/**
 * 模板里一个打包属性的最小结构。
 * `array` 故意留宽类型：打包侧来自 three 的 BufferAttribute，解包侧还会做一次运行时校验，
 * 所以不在这里锁死具体视图类型。
 */
type PackedAttribute = {
  array: unknown;
  itemSize: number;
  normalized?: boolean;
  name?: string;
  usage?: number;
};

/**
 * 模板里一个打包几何体的结构（落盘格式）。
 * box / sphere 存的是 toArray() 的结果、解包时原样喂给 Vector3.fromArray，因此只声明「数组」
 * 而不锁定长度，免得把本该由运行时校验兜底的规则搬到类型上。
 */
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

/** 判定「材质是否还挂着贴图」所需的最小结构。 */
type TextureLike = { isTexture?: boolean };


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
          Object.values(material as Record<string, TextureLike>).some((value) => value?.isTexture)
        )
          throw Error("Material needs the original loader");
        packedMaterialColors[material.uuid] = Object.fromEntries(
          Object.entries(material as Record<string, ColorLike>)
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
  const geometryByUuid: Record<string, { dispose: () => void }> = {},
    materialByUuid: Record<string, { dispose: () => void }> = {},
    unpackAttribute = (packed) => {
      const sourceArray = packed?.array,
        // 长度必须在 ArrayBuffer.isView 把 sourceArray 收窄成 ArrayBufferView 之前取出来：
        // 收窄后的类型上没有 length，而 DataView 恰好也没有 length —— 正好用它区分「非定长视图」。
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
