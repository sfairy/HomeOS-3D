/**
 * 交互几何烘焙（上游 `studio-interaction-geometry.js`，0.8.1 新增）。
 *
 * ## 它解决什么
 *
 * 3D 场景里「不挡视线但要点得到」的东西（楼层地面、可交互热区）不能直接参与渲染，
 * 否则会盖住家具；也不能只留一个盒子，否则点击判定和真实形状对不上。上游的做法是
 * 把这些源几何**烘焙成一份合并几何**，只用于射线检测（`interactionRenderProxy`）：
 *
 * 1. 同层的所有源几何按属性合并到一个 `BufferGeometry`；
 * 2. 顶点在烘焙时**一次性**乘上各自的局部矩阵（含透视除法），之后射线检测不必再逐节点算矩阵；
 * 3. 法线/切线用逆转置矩阵（`getNormalMatrix`）变换并归一化，否则 Non-uniform scale 下光照会错。
 *
 * ## 为什么是生成器
 *
 * 大户型合并上万个顶点会卡住主线程。`bakeIncrementally` 把工作切成「每 128 个顶点一 yielded
 * 帧」，调用方在每个 `yield` 处让出一帧，加载进度条因此能真实前进而不是假动画。
 *
 * `mergedBytes` 用来在烘焙**之前**估算显存占用，超预算就别烘焙，直接退回 AABB 检测。
 *
 * 本项目的 three 是浏览器直载的外部模块，编译期只有宽泛的影子声明，所以这里用最小结构化
 * 接口描述用到的部分。
 */

/** 三维向量 / 四维向量的最小字段面。 */
interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

interface Vec4Like extends Vec3Like {
  w: number;
}

/** `THREE.Box3` 的最小契约。 */
export interface BakedBox {
  min: Vec3Like;
  max: Vec3Like;
  isEmpty(): boolean;
  clone(): BakedBox;
  applyMatrix4(matrix: unknown): BakedBox;
  union(box: BakedBox): BakedBox;
  getBoundingSphere(target: unknown): unknown;
}

/** 顶点属性（`BufferAttribute`）的最小契约。 */
export interface BakedAttribute {
  array: {
    length: number;
    BYTES_PER_ELEMENT: number;
    set(source: unknown, offset: number): void;
    subarray(start: number, end: number): unknown;
    [index: number]: number;
  };
  itemSize: number;
  count: number;
  normalized?: boolean;
}

/** `THREE.BufferGeometry` 的最小契约。 */
export interface BakedGeometry {
  attributes: Record<string, BakedAttribute>;
  index: { count: number; array: { [index: number]: number } } | null;
  boundingBox: BakedBox | null;
  boundingSphere: unknown;
  setAttribute(name: string, attribute: BakedAttribute): unknown;
  setIndex(index: BakedAttribute): unknown;
  dispose(): void;
}

/** 一份待烘焙的源几何：几何本体 + 它的世界矩阵（以及可选的已知包围盒）。 */
export interface BakeSource {
  geometry: BakedGeometry;
  matrix: { elements: ArrayLike<number> };
  /** 已有包围盒时跳过逐顶点累加，省一遍遍历。 */
  box?: BakedBox | null;
}

/** 调用方注入的 three 构造器面。 */
export interface BakeThree {
  BufferGeometry: new () => BakedGeometry;
  BufferAttribute: new (array: unknown, itemSize: number, normalized?: boolean) => BakedAttribute;
  Box3: new () => BakedBox;
  Matrix3: new () => { getNormalMatrix(matrix: unknown): { elements: ArrayLike<number> } };
  Sphere: new () => unknown;
  // 数组构造器按 `attribute.array.constructor` 动态取，不在这里声明。
}

/** 顶点数组的构造器（`Float32Array` 等）。 */
type TypedArrayConstructor = new (length: number) => {
  set(source: unknown, offset: number): void;
  [index: number]: number;
};

/**
 * 增量烘焙合并几何。
 *
 * 每个 `yield` 就是一个「可以喘口气」的点：属性分配、索引分配、每 128 个顶点、每 1024 个
 * 索引各让出一次。调用方用 `for (const _ of build()) await nextFrame()` 推进即可。
 *
 * 中途被丢弃（`generator.return()`，例如切层/取消加载）时，`finally` 会 `dispose` 半成品，
 * 不会留下没有 owner 的几何体占显存。
 */
export function* bakeIncrementally(
  three: BakeThree,
  sources: ReadonlyArray<BakeSource>,
  chunkSize = 128,
): Generator<void, BakedGeometry, undefined> {
  const firstGeometry = sources[0].geometry;
  const attributeNames = Object.keys(firstGeometry.attributes);
  // 合并后的顶点总数决定每个属性的缓冲长度：这里只按 position 计数，其余属性必须与之等长
  // （glb 里出现不等长属性说明模型本身有问题，按 position 走至少不会越界）。
  const totalVertexCount = sources.reduce(
    (total, source) => total + source.geometry.attributes.position.count,
    0,
  );
  const mergedGeometry = new three.BufferGeometry();
  const boundingBox = new three.Box3();
  let completed = false;
  try {
    for (const attributeName of attributeNames) {
      const sourceAttribute = firstGeometry.attributes[attributeName];
      mergedGeometry.setAttribute(
        attributeName,
        new three.BufferAttribute(
          new (sourceAttribute.array.constructor as TypedArrayConstructor)(
            totalVertexCount * sourceAttribute.itemSize,
          ),
          sourceAttribute.itemSize,
          sourceAttribute.normalized,
        ),
      );
      yield;
    }

    const hasIndex = !!firstGeometry.index;
    const totalIndexCount = hasIndex
      ? sources.reduce((total, source) => total + source.geometry.index!.count, 0)
      : 0;
    // 超过 65535 个顶点必须换 32 位索引，否则索引会回绕成错误的三角形（画面上是乱刺的片）。
    const indexArray = hasIndex
      ? totalVertexCount > 0xffff
        ? new Uint32Array(totalIndexCount)
        : new Uint16Array(totalIndexCount)
      : null;
    if (indexArray) mergedGeometry.setIndex(new three.BufferAttribute(indexArray, 1));
    yield;

    let vertexOffset = 0,
      indexOffset = 0;
    for (const { geometry: sourceGeometry, matrix, box } of sources) {
      const vertexCount = sourceGeometry.attributes.position.count,
        matrixElements = matrix.elements,
        // 法线要用逆转置：直接用 `matrix` 会让非等比缩放的家具光照方向全错。
        normalMatrixElements = new three.Matrix3().getNormalMatrix(matrix).elements,
        partBox = box || new three.Box3();

      for (let chunkStart = 0; chunkStart < vertexCount; chunkStart += chunkSize) {
        const chunkEnd = Math.min(vertexCount, chunkStart + chunkSize);
        for (const attributeName of attributeNames) {
          const sourceAttribute = sourceGeometry.attributes[attributeName],
            itemSize = sourceAttribute.itemSize;
          mergedGeometry.attributes[attributeName].array.set(
            sourceAttribute.array.subarray(chunkStart * itemSize, chunkEnd * itemSize),
            (vertexOffset + chunkStart) * itemSize,
          );
        }

        const positionArray = mergedGeometry.attributes.position.array as unknown as Float32Array,
          normalArray = mergedGeometry.attributes.normal?.array as unknown as Float32Array | undefined,
          tangentArray = mergedGeometry.attributes.tangent?.array as unknown as Float32Array | undefined;
        for (let vertexIndex = vertexOffset + chunkStart; vertexIndex < vertexOffset + chunkEnd; vertexIndex++) {
          const componentOffset = vertexIndex * 3,
            localX = positionArray[componentOffset],
            localY = positionArray[componentOffset + 1],
            localZ = positionArray[componentOffset + 2];
          // 调用方给了 box 就说明它已知包围盒，逐顶点累加纯属浪费。
          if (!box) {
            ((partBox.min.x = Math.min(partBox.min.x, localX)),
              (partBox.max.x = Math.max(partBox.max.x, localX)),
              (partBox.min.y = Math.min(partBox.min.y, localY)),
              (partBox.max.y = Math.max(partBox.max.y, localY)),
              (partBox.min.z = Math.min(partBox.min.z, localZ)),
              (partBox.max.z = Math.max(partBox.max.z, localZ)));
          }
          // 与上游一致：带透视除法（`w` 归一），正交矩阵下 `w` 恒为 1，等价于普通变换。
          const inverseW =
            1 /
            (matrixElements[3] * localX +
              matrixElements[7] * localY +
              matrixElements[11] * localZ +
              matrixElements[15]);
          positionArray[componentOffset] =
            (matrixElements[0] * localX +
              matrixElements[4] * localY +
              matrixElements[8] * localZ +
              matrixElements[12]) *
            inverseW;
          positionArray[componentOffset + 1] =
            (matrixElements[1] * localX +
              matrixElements[5] * localY +
              matrixElements[9] * localZ +
              matrixElements[13]) *
            inverseW;
          positionArray[componentOffset + 2] =
            (matrixElements[2] * localX +
              matrixElements[6] * localY +
              matrixElements[10] * localZ +
              matrixElements[14]) *
            inverseW;

          if (normalArray) {
            const normalX = normalArray[componentOffset],
              normalY = normalArray[componentOffset + 1],
              normalZ = normalArray[componentOffset + 2],
              rotatedX =
                normalMatrixElements[0] * normalX +
                normalMatrixElements[3] * normalY +
                normalMatrixElements[6] * normalZ,
              rotatedY =
                normalMatrixElements[1] * normalX +
                normalMatrixElements[4] * normalY +
                normalMatrixElements[7] * normalZ,
              rotatedZ =
                normalMatrixElements[2] * normalX +
                normalMatrixElements[5] * normalY +
                normalMatrixElements[8] * normalZ,
              // 归一化必须防 0：退化三角形（面积为 0）的法线是零向量，除 0 会写出 NaN，
              // 而 NaN 顶点会让整块 boundingSphere 变成 NaN，射线检测直接失效。
              normalInverseLength = 1 / (Math.hypot(rotatedX, rotatedY, rotatedZ) || 1);
            ((normalArray[componentOffset] = rotatedX * normalInverseLength),
              (normalArray[componentOffset + 1] = rotatedY * normalInverseLength),
              (normalArray[componentOffset + 2] = rotatedZ * normalInverseLength));
          }

          if (tangentArray) {
            const tangentOffset = vertexIndex * 4,
              tangentX = tangentArray[tangentOffset],
              tangentY = tangentArray[tangentOffset + 1],
              tangentZ = tangentArray[tangentOffset + 2],
              rotatedTangentX =
                matrixElements[0] * tangentX + matrixElements[4] * tangentY + matrixElements[8] * tangentZ,
              rotatedTangentY =
                matrixElements[1] * tangentX + matrixElements[5] * tangentY + matrixElements[9] * tangentZ,
              rotatedTangentZ =
                matrixElements[2] * tangentX + matrixElements[6] * tangentY + matrixElements[10] * tangentZ,
              tangentInverseLength = 1 / (Math.hypot(rotatedTangentX, rotatedTangentY, rotatedTangentZ) || 1);
            // 切线的 `w` 是副切线手性（±1），不参与变换。
            ((tangentArray[tangentOffset] = rotatedTangentX * tangentInverseLength),
              (tangentArray[tangentOffset + 1] = rotatedTangentY * tangentInverseLength),
              (tangentArray[tangentOffset + 2] = rotatedTangentZ * tangentInverseLength));
          }
        }
        yield;
      }

      if (indexArray) {
        // 索引按 1024 一批搬：单批太大时会连续占用主线程十几毫秒，进度条会「跳」。
        for (let chunkStart = 0; chunkStart < sourceGeometry.index!.count; chunkStart += 0x400) {
          for (
            let index = chunkStart, chunkEnd = Math.min(sourceGeometry.index!.count, chunkStart + 0x400);
            index < chunkEnd;
            index += 1
          ) {
            indexArray[indexOffset++] = sourceGeometry.index!.array[index] + vertexOffset;
          }
          yield;
        }
      }

      // 包围盒必须用**变换后**的局部盒：`partBox` 是局部空间，乘上 `matrix` 才回到世界。
      boundingBox.union(partBox.clone().applyMatrix4(matrix));
      vertexOffset += vertexCount;
    }

    mergedGeometry.boundingBox = boundingBox;
    mergedGeometry.boundingSphere = boundingBox.getBoundingSphere(new three.Sphere());
    completed = true;
    return mergedGeometry;
  } finally {
    // 提前退出（切层/取消）时半成品没人回收，这里兜底。
    if (!completed) mergedGeometry.dispose();
  }
}

/**
 * 估算合并后的显存字节数（烘焙前调用）。
 *
 * 口径与上游一致：顶点属性按「总顶点数 × itemSize × 每元素字节」累加，索引按顶点数是否超过
 * 65535 选 2 字节或 4 字节。
 */
export function mergedBytes(sources: ReadonlyArray<BakeSource>): number {
  const firstGeometry = sources[0].geometry,
    totalVertexCount = sources.reduce(
      (total, source) => total + source.geometry.attributes.position.count,
      0,
    );
  return (
    Object.values(firstGeometry.attributes).reduce(
      (total, attribute) =>
        total + totalVertexCount * attribute.itemSize * attribute.array.BYTES_PER_ELEMENT,
      0,
    ) +
    (firstGeometry.index
      ? sources.reduce((total, source) => total + (source.geometry.index?.count || 0), 0) *
        (totalVertexCount > 0xffff ? 4 : 2)
      : 0)
  );
}
