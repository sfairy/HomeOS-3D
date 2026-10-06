import { stableModelTextureKey } from "../model-texture-cache";

/**
 * 反射场景签名：把「场景图 + 材质 + 相机 + 环境」压成一个字符串。
 * 只有签名变了才需要重渲反射；材质/几何都按引用与版本号做缓存，避免每帧重算。
 * 遇到无法稳定描述的材质（自定义 shader、动态网格等）直接返回 null，表示放弃缓存。
 */
export function createReflectionSignature(three) {
  const geometrySignatureByGeometry = new WeakMap(),
    defaultProgramCacheKey = new three.Material().customProgramCacheKey(),
    hashBytes = (arrayBufferView) => {
      const bytes = new Uint8Array(
        arrayBufferView.buffer,
        arrayBufferView.byteOffset,
        arrayBufferView.byteLength,
      );
      let hashA = 2166136261,
        hashB = 3339675911;
      for (const byte of bytes)
        ((hashA = Math.imul(hashA ^ byte, 16777619)),
          (hashB = Math.imul(hashB ^ byte, 2246822519)));
      return [arrayBufferView.constructor.name, bytes.length, hashA >>> 0, hashB >>> 0];
    },
    describeAttribute = (attribute) =>
      attribute
        ? [
            attribute.itemSize,
            attribute.count,
            attribute.normalized,
            attribute.offset,
            attribute.data?.stride,
            hashBytes(attribute.array || attribute.data.array),
          ]
        : null;
  function describeGeometry(geometry) {
    if (!geometry?.attributes.position || Object.keys(geometry.morphAttributes || {}).length)
      throw Error("deformed geometry");
    const sortedAttributes = Object.entries(geometry.attributes).sort(([nameA], [nameB]) =>
        nameA.localeCompare(nameB),
      ),
      geometryAttributes = [geometry.index, ...sortedAttributes.map(([, attribute]) => attribute)],
      attributeVersions = geometryAttributes
        .map((attribute) => [
          attribute?.version,
          attribute?.data?.version,
          attribute?.array || attribute?.data?.array,
          attribute?.itemSize,
          attribute?.count,
          attribute?.gpuType,
          attribute?.normalized,
          attribute?.offset,
          attribute?.data?.stride,
        ])
        .flat(),
      attributeNames = sortedAttributes.map(([name]) => name).join("|"),
      cachedSignature = geometrySignatureByGeometry.get(geometry);
    if (
      cachedSignature &&
      cachedSignature.names === attributeNames &&
      cachedSignature.refs.length === geometryAttributes.length &&
      geometryAttributes.every((attribute, index) => attribute === cachedSignature.refs[index]) &&
      attributeVersions.every((version, index) => version === cachedSignature.versions[index])
    )
      return [cachedSignature.key, geometry.groups, geometry.drawRange];
    const signatureKey = [
      describeAttribute(geometry.index),
      sortedAttributes.map(([name, attribute]) => [name, describeAttribute(attribute)]),
    ];
    return (
      geometrySignatureByGeometry.set(geometry, {
        names: attributeNames,
        refs: geometryAttributes,
        versions: attributeVersions,
        key: signatureKey,
      }),
      [signatureKey, geometry.groups, geometry.drawRange]
    );
  }
  function describeTexture(texture) {
    if (!texture) return null;
    const stableKey = stableModelTextureKey(texture);
    if (stableKey) return stableKey;
    if (
      !texture.isDataTexture ||
      !ArrayBuffer.isView(texture.image?.data) ||
      texture.isRenderTargetTexture ||
      texture.mipmaps.length
    )
      throw Error("untracked texture");
    return [
      hashBytes(texture.image.data),
      texture.image.width,
      texture.image.height,
      texture.format,
      texture.type,
      texture.colorSpace,
      texture.flipY,
      texture.premultiplyAlpha,
      texture.wrapS,
      texture.wrapT,
      texture.minFilter,
      texture.magFilter,
      texture.channel,
      texture.offset.toArray(),
      texture.repeat.toArray(),
      texture.center.toArray(),
      texture.rotation,
      texture.matrixAutoUpdate,
      texture.matrix.toArray(),
    ];
  }
  const describeMaterialProperty = (propertyValue) =>
    propertyValue?.isTexture
      ? describeTexture(propertyValue)
      : propertyValue?.toArray
        ? propertyValue.toArray()
        : propertyValue;
  function describeMaterial(material, materialState) {
    if (!material || material.isShaderMaterial || material.displacementMap || material.clippingPlanes?.length)
      throw Error("custom material: " + material?.name + " " + material?.type);
    const programCacheKey = material.customProgramCacheKey(),
      normalizedProgramCacheKey = programCacheKey
        .replace(/\|hb-environment-saturation-v8:(?:ordinary|wall-top)/g, "")
        .replace(
          /\|plan2-baked-surface-v17-sloped-duvet\|[01]\|[01]\|[01]\|[01]\|[01]\|(?:floor|wall|furniture)\|\d+\|[01]\|(?:true|false)$/,
          "",
        );
    if (
      normalizedProgramCacheKey !== defaultProgramCacheKey &&
      normalizedProgramCacheKey !== defaultProgramCacheKey + ":warm-pale-oak-v1" &&
      !/^(?:runtime-furniture-surface-v1|warm-tv-glass-v1|warm-cabinet-door-returns-v1|warm-cabinet-door-returns-v2-[0-9a-f]{6}|warm-shoe-countertop-v1-[0-9a-f]{6}|warm-bed-runner-v1-[0-9a-f]{6})$/.test(
        normalizedProgramCacheKey,
      )
    )
      throw Error("custom shader: " + material.name + " " + programCacheKey);
    const materialStateSignature = programCacheKey.includes("|hb-environment-")
      ? materialState(material)
      : [];
    if (materialStateSignature == null) throw Error("untracked environment");
    return [
      programCacheKey,
      materialStateSignature,
      material.defines,
      material.extensions,
      Object.entries(material as Record<string, any>)
        .filter(
          ([propertyName, propertyValue]) =>
            !["id", "uuid", "name", "version", "userData"].includes(propertyName) &&
            (propertyValue == null ||
              ["string", "number", "boolean"].includes(typeof propertyValue) ||
              propertyValue.isTexture ||
              propertyValue.toArray),
        )
        .map(([propertyName, propertyValue]) => [propertyName, describeMaterialProperty(propertyValue)]),
      material.userData.plan2SurfaceContact,
      material.userData.plan2SurfaceSlope,
    ];
  }
  return function reflectionSignature({
    scene,
    renderer,
    camera,
    state,
    settings,
    insideOnly = false,
    scope = null,
    materialState = () => null,
    captureGeometry = (mesh) => mesh.geometry,
  }) {
    if (state == null) return null;
    const nodeEntries = [],
      materialIndexByMaterial = new Map(),
      materialSignatures = [];
    function collectNode(node, inheritedFloorId = "") {
      const floorId = String(
        node.userData.floorId ||
          node.userData.regionFloorId ||
          node.userData.environmentFloorId ||
          node.userData.lightFloorId ||
          inheritedFloorId,
      );
      if (
        !node.visible ||
        node.name === "interaction3d-curtain-shadow-refresh" ||
        node.userData.reflectionOverlay ||
        node.userData.environmentEffect ||
        node.userData.presenceId != null ||
        (scope !== null && floorId && floorId !== scope) ||
        ["background", "grid", "outline"].includes(node.userData.exportRole)
      )
        return;
      if (
        (node.isLight &&
          nodeEntries.push([
            "light",
            node.type,
            node.matrixWorld.toArray(),
            node.target?.matrixWorld.toArray(),
            node.color.toArray(),
            node.intensity,
            node.distance,
            node.decay,
            node.angle,
            node.penumbra,
            node.layers.mask,
            node.castShadow,
            node.shadow?.bias,
            node.shadow?.normalBias,
            node.shadow?.radius,
            node.shadow?.mapSize.toArray(),
            node.userData.regionFullIntensity,
          ]),
        node.isMesh &&
          node.userData.regionReceiverKind !== "floor" &&
          !(insideOnly && node.userData.reflectionRole === "wall"))
      ) {
        if (
          node.isSkinnedMesh ||
          node.isBatchedMesh ||
          node.morphTargetInfluences?.length ||
          node.onBeforeRender !== three.Object3D.prototype.onBeforeRender
        )
          throw Error("dynamic mesh: " + node.name);
        const meshMaterialIndices = []
          .concat(node.material)
          .map(
            (meshMaterial) => (
              materialIndexByMaterial.has(meshMaterial) ||
                (materialIndexByMaterial.set(meshMaterial, materialSignatures.length),
                materialSignatures.push(describeMaterial(meshMaterial, materialState))),
              materialIndexByMaterial.get(meshMaterial)
            ),
          );
        nodeEntries.push([
          "mesh",
          node.matrixWorld.toArray(),
          describeGeometry(captureGeometry(node)),
          meshMaterialIndices,
          node.layers.mask,
          node.renderOrder,
          node.castShadow,
          node.receiveShadow,
          node.frustumCulled,
          node.userData.floorId,
          node.userData.regionFloorId,
          node.isInstancedMesh
            ? [
                node.count,
                describeAttribute(node.instanceMatrix),
                describeAttribute(node.instanceColor),
              ]
            : null,
        ]);
      }
      for (const child of node.children) collectNode(child, floorId);
    }
    try {
      return (
        collectNode(scene),
        JSON.stringify([
          three.REVISION,
          renderer.capabilities.maxTextureSize,
          renderer.capabilities.maxSamples,
          renderer.capabilities.precision,
          renderer.outputColorSpace,
          renderer.toneMapping,
          renderer.toneMappingExposure,
          renderer.shadowMap.enabled,
          renderer.shadowMap.type,
          describeTexture(scene.environment),
          scene.environmentIntensity,
          scene.environmentRotation?.toArray(),
          scene.fog ? [scene.fog.color.toArray(), scene.fog.near, scene.fog.far, scene.fog.density] : null,
          camera.matrixWorld.toArray(),
          camera.projectionMatrix.toArray(),
          camera.layers.mask,
          state,
          settings,
          materialSignatures,
          nodeEntries,
        ])
      );
    } catch {
      return null;
    }
  };
}
