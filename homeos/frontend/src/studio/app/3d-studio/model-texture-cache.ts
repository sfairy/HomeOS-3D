/**
 * 模型贴图的磁盘缓存：把 GLB 内嵌的图片（PNG/JPEG）从 bufferView 里抠出来，
 * 连同「这张纹理当时挂在哪个 ImageBitmap」一起记下来，
 * 之后模型模板落盘时可以只存图片原始字节，热启动时再解码还原。
 */
const MAX_TEXTURE_DATA_BYTES = 8 * 1024 * 1024,
  MAX_TEXTURE_PIXELS = 4 * 1024 * 1024,
  originalTextureRecord = new WeakMap();

/** 图片字节的 FNV-1a 双哈希指纹（mime/尺寸/长度 + 两个 32 位散列）。 */
function textureImageKey(textureImage: any) {
  let hashA = 2166136261,
    hashB = 3339675911;
  for (const byte of textureImage.data)
    ((hashA = Math.imul(hashA ^ byte, 16777619)), (hashB = Math.imul(hashB ^ byte, 2246822519)));
  return JSON.stringify([
    textureImage.mimeType,
    textureImage.width,
    textureImage.height,
    textureImage.data.length,
    hashA >>> 0,
    hashB >>> 0,
  ]);
}
/** 只接受体积/像素在预算内的 PNG/JPEG 内嵌图。 */
function isValidTextureImage(textureImage: any) {
  return (
    textureImage &&
    ["image/png", "image/jpeg"].includes(textureImage.mimeType) &&
    textureImage.data instanceof Uint8Array &&
    textureImage.data.length > 0 &&
    textureImage.data.length <= MAX_TEXTURE_DATA_BYTES &&
    Number.isInteger(textureImage.width) &&
    Number.isInteger(textureImage.height) &&
    textureImage.width > 0 &&
    textureImage.height > 0 &&
    textureImage.width * textureImage.height <= MAX_TEXTURE_PIXELS
  );
}
/** 记下「纹理 <-> 抠出的图片字节」的对应关系，供后续 pack 使用。 */
function rememberTexture(texture: any, textureImage: any) {
  originalTextureRecord.set(texture, {
    image: textureImage,
    version: texture.version,
    source: texture.source,
    sourceVersion: texture.source.version,
    pixels: texture.image,
    src: texture.image.src,
  });
}
/** 只有纹理仍指向当初记下的那些对象、且没被换成 DataTexture/压缩纹理时，记录才有效。 */
function originalTextureRecordFor(texture: any) {
  const record = originalTextureRecord.get(texture);
  return record &&
    texture.version === record.version &&
    texture.source === record.source &&
    texture.source.version === record.sourceVersion &&
    texture.image === record.pixels &&
    texture.image.src === record.src &&
    texture.image.complete &&
    texture.image.naturalWidth === record.image.width &&
    texture.image.naturalHeight === record.image.height &&
    !texture.isRenderTargetTexture &&
    !texture.isVideoTexture &&
    !texture.isDataTexture &&
    !texture.isCompressedTexture &&
    !texture.mipmaps.length
    ? record
    : null;
}
/** 遍历 GLTF，把可从 bufferView 直接取出的内嵌图片记下来（跳过扩展纹理/非 IMG）。 */
export async function prepareModelTextures(gltf: any) {
  const parser = gltf?.parser,
    scene = gltf?.scene;
  if (!parser?.json || !parser.associations || !scene) return;
  const textureSet = new Set<any>(),
    imagePromiseBySourceId = new Map();
  (scene.traverse((node: any) => {
    for (const material of [].concat(node.material || []))
      for (const materialValue of Object.values(material as Record<string, any>))
        materialValue?.isTexture && textureSet.add(materialValue);
  }),
    await Promise.all(
      [...textureSet].map(async (texture) => {
        try {
          const textureIndex = parser.associations.get(texture)?.textures,
            textureDefinition = parser.json.textures?.[textureIndex],
            imageDefinition = parser.json.images?.[textureDefinition?.source],
            image = texture.image;
          if (
            !imageDefinition ||
            !Number.isInteger(imageDefinition.bufferView) ||
            textureDefinition.extensions ||
            image?.tagName !== "IMG" ||
            !image.complete ||
            !image.naturalWidth
          )
            return;
          imagePromiseBySourceId.has(textureDefinition.source) ||
            imagePromiseBySourceId.set(
              textureDefinition.source,
              (async () => {
                const bufferViewData = await parser.getDependency(
                    "bufferView",
                    imageDefinition.bufferView,
                  ),
                  textureImage: any = {
                    mimeType: imageDefinition.mimeType,
                    width: image.naturalWidth,
                    height: image.naturalHeight,
                    data: new Uint8Array(bufferViewData).slice(),
                  };
                return isValidTextureImage(textureImage)
                  ? ((textureImage.key = textureImageKey(textureImage)), textureImage)
                  : null;
              })(),
            );
          const textureImage = await imagePromiseBySourceId.get(textureDefinition.source);
          textureImage && rememberTexture(texture, textureImage);
        } catch {}
      }),
    ));
}
/** 稳定贴图键：拿「图片指纹 + 采样/坐标参数」当键，引擎判定参数全都没变就能复用。 */
export function stableModelTextureKey(texture: any) {
  const record = originalTextureRecordFor(texture);
  return record
    ? [
        record.image.key,
        texture.mapping,
        texture.channel,
        texture.wrapS,
        texture.wrapT,
        texture.magFilter,
        texture.minFilter,
        texture.anisotropy,
        texture.format,
        texture.internalFormat,
        texture.type,
        texture.colorSpace,
        texture.flipY,
        texture.premultiplyAlpha,
        texture.unpackAlignment,
        texture.generateMipmaps,
        texture.offset.toArray(),
        texture.repeat.toArray(),
        texture.center.toArray(),
        texture.rotation,
        texture.matrixAutoUpdate,
        texture.matrixAutoUpdate ? null : texture.matrix.toArray(),
      ]
    : null;
}
/** 把一组纹理打成物理贴图：图片按 source.uuid 去重存字节，另存每张纹理的 UV 变换矩阵。 */
export function packModelTextures(textureSet: any, serializationMeta: any) {
  const textureImagesBySourceUuid: Record<string, any> = {},
    textureMatricesByTextureUuid: Record<string, any> = {};
  let totalTextureBytes = 0,
    totalTexturePixels = 0;
  if (textureSet.size > 32) throw Error("Too many textures");
  for (const texture of textureSet) {
    const record = originalTextureRecordFor(texture);
    if (!record) throw Error("Texture needs the original loader");
    const sourceUuid = texture.source.uuid;
    ((textureImagesBySourceUuid as any)[sourceUuid] ||
      (((textureImagesBySourceUuid as any)[sourceUuid] = record.image),
      (totalTextureBytes += record.image.data.byteLength),
      (totalTexturePixels += record.image.width * record.image.height)),
      (serializationMeta.images[sourceUuid] = {
        uuid: sourceUuid,
      }),
      ((textureMatricesByTextureUuid as any)[texture.uuid] = {
        autoUpdate: texture.matrixAutoUpdate,
        elements: texture.matrix.toArray(),
      }));
  }
  if (
    Object.keys(textureImagesBySourceUuid).length > 16 ||
    totalTextureBytes > MAX_TEXTURE_DATA_BYTES ||
    totalTexturePixels > MAX_TEXTURE_PIXELS
  )
    throw Error("Texture budget exceeded");
  for (const texture of textureSet) texture.toJSON(serializationMeta);
  return {
    images: textureImagesBySourceUuid,
    matrices: textureMatricesByTextureUuid,
    bytes: totalTextureBytes,
  };
}
/** 从字节解出一张可用的图片元素（带超时与取消校验）。 */
function decodeTextureImage(textureImage: any, env: any, valid: any, timeoutMs: any) {
  return new Promise((resolve, reject) => {
    let imageElement: any,
      objectUrl: any,
      timeoutHandle: any,
      isSettled = false;
    const settle = (decodeError: any) => {
      isSettled ||
        ((isSettled = true),
        env.clearTimeout(timeoutHandle),
        imageElement && (imageElement.onload = imageElement.onerror = null),
        objectUrl && env.URL.revokeObjectURL(objectUrl),
        decodeError ? (imageElement && (imageElement.src = ""), reject(decodeError)) : resolve(imageElement));
    };
    try {
      ((imageElement = new env.Image()),
        (objectUrl = env.URL.createObjectURL(
          new env.Blob([textureImage.data], {
            type: textureImage.mimeType,
          }),
        )),
        (timeoutHandle = env.setTimeout(() => settle(Error("Cached image decode timeout")), timeoutMs)),
        (imageElement.onload = () =>
          settle(
            !valid() ||
              imageElement.naturalWidth !== textureImage.width ||
              imageElement.naturalHeight !== textureImage.height
              ? Error("Cached image changed or cancelled")
              : null,
          )),
        (imageElement.onerror = () => settle(Error("Invalid cached image"))),
        (imageElement.src = objectUrl));
    } catch (decodeError: any) {
      settle(decodeError);
    }
  });
}
/** 解码模板里的贴图字节并还原贴图集合；预算/时效/取消校验任一不满足就整体失败。 */
export async function restoreModelTextures(
  three: any,
  template: any,
  { env: env = globalThis, valid: valid = () => true, timeoutMs: timeoutMs = 1000 } = {},
) {
  const sourceByImageUuid: Record<string, any> = {},
    textureImages = template.textureImages || {},
    restoredTextures: Record<string, any> = {},
    textureDefinitions = template.textures || [];
  if (!textureDefinitions.length && !Object.keys(textureImages).length) return restoredTextures;
  if (textureDefinitions.length > 32 || Object.keys(textureImages).length > 16)
    throw Error("Too many cached textures");
  let totalPixels = 0,
    totalBytes = 0;
  for (const textureImage of Object.values(textureImages as Record<string, any>)) {
    if (!isValidTextureImage(textureImage) || textureImage.key !== textureImageKey(textureImage))
      throw Error("Invalid cached image");
    ((totalPixels += textureImage.width * textureImage.height),
      (totalBytes += textureImage.data.byteLength));
  }
  if (totalPixels > MAX_TEXTURE_PIXELS || totalBytes > MAX_TEXTURE_DATA_BYTES)
    throw Error("Cached images exceed budget");
  for (const textureDefinition of textureDefinitions)
    if (!textureImages[textureDefinition.image] || !template.textureMatrices?.[textureDefinition.uuid])
      throw Error("Missing cached texture");
  try {
    for (const [imageUuid, textureImage] of Object.entries(textureImages)) {
      if (!valid()) return null;
      sourceByImageUuid[imageUuid] = new three.Source(
        await decodeTextureImage(textureImage, env, valid, timeoutMs),
      );
    }
    if (!valid()) return null;
    Object.assign(
      restoredTextures,
      new three.ObjectLoader().parseTextures(textureDefinitions, sourceByImageUuid),
    );
    for (const textureDefinition of textureDefinitions) {
      const restoredTexture = restoredTextures[textureDefinition.uuid],
        textureMatrix = template.textureMatrices[textureDefinition.uuid];
      if (textureMatrix.elements?.length !== 9 || !textureMatrix.elements.every(Number.isFinite))
        throw Error("Invalid texture matrix");
      ((restoredTexture.matrixAutoUpdate = textureMatrix.autoUpdate),
        restoredTexture.matrix.fromArray(textureMatrix.elements),
        (restoredTexture.needsUpdate = true),
        rememberTexture(restoredTexture, textureImages[textureDefinition.image]));
    }
    return restoredTextures;
  } catch (restoreError: any) {
    if (
      (Object.values(restoredTextures).forEach((restoredTexture) => restoredTexture.dispose()),
      !valid())
    )
      return null;
    throw restoreError;
  }
}
