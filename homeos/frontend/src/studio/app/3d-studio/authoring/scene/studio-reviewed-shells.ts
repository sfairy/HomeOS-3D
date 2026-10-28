/**
 * 复核外壳剔除（上游 `studio-reviewed-shells.js`，0.8.1 新增）。
 *
 * 部分机型（风扇 / 音箱 / 晾衣架 / 摄像头 / 存在传感器）的 glb 里带**看不见但会挡点击**
 * 的壳层三角形：内壁、卡扣、隐藏的电机罩。它们在视觉上没有存在感，但射线检测会先打到
 * 它们，表现为「点面板中间没反应，点边角才有」。
 *
 * 处理办法不是缩小包围盒（会把正常外壳也挡掉），而是**按三角形下标精确剔除**：
 *
 * 1. `shellScopes` 把模型拆成若干「作用域」：遇到 `fanPart` / `vacuumPart` /
 *    `contactShadowRestMatrix` 就从该节点重新起算路径，这样同一份掩码在部件增删后仍能对齐；
 * 2. `shellSignature` 给每个作用域算 FNV-1a 指纹（路径 + 矩阵 + 材质透明度 + 顶点 + 索引）；
 * 3. `applyReviewedShells` 只在指纹**命中**时才动几何体 —— 换过模型（或换了 glb 烘焙）
 *    必然对不上，于是什么都不做，不会误删正常三角形。
 *
 * 剔除时会重建顶点缓冲并把没用到的顶点压紧（否则索引里全是空洞，显存不降反升），
 * 同时按三角形保留情况重算 `groups`，保证多材质子网格的材质边界不错位。
 *
 * 本项目的 three 是浏览器直载的外部模块，编译期只有宽泛的影子声明，所以这里用最小
 * 结构化接口描述用到的部分。
 */
import {
  REVIEWED_SHELL_MASKS,
  type ReviewedShellMaskSet,
} from "./studio-reviewed-shell-data";

/** `THREE.BufferAttribute` 的最小契约。 */
export interface ShellAttribute {
  array: {
    length: number;
    [index: number]: number;
    subarray(start: number, end: number): unknown;
    forEach(callback: (value: number) => void): void;
  };
  itemSize: number;
  normalized?: boolean;
  count: number;
  needsUpdate?: boolean;
}

/** `THREE.BufferGeometry` 的最小契约（只覆盖裁剪与重建用到的部分）。 */
export interface ShellGeometry {
  index: ({ count: number; array: { length: number; [index: number]: number }; needsUpdate?: boolean } ) | null;
  attributes: Record<string, ShellAttribute>;
  groups: Array<{ start: number; count: number; materialIndex: number }>;
  type: string;
  setAttribute(name: string, attribute: ShellAttribute): unknown;
  setIndex(index: ArrayLike<number>): unknown;
  clearGroups(): void;
  addGroup(start: number, count: number, materialIndex: number): void;
  computeBoundingBox(): void;
  computeBoundingSphere(): void;
}

/** `THREE.Mesh` / `THREE.Object3D` 的最小契约。 */
export interface ShellNode {
  children: ShellNode[];
  matrix: { elements: Float32Array };
  userData: Record<string, unknown>;
  geometry?: ShellGeometry;
  material?: { transparent?: boolean; opacity?: number };
  updateMatrixWorld(force: boolean): void;
  forEachChild?(callback: (child: ShellNode) => void): void;
}

/** 调用方注入的 three 构造器（只有 `BufferAttribute`）。 */
export interface ShellThree {
  BufferAttribute: new (
    array: unknown,
    itemSize: number,
    normalized?: boolean,
  ) => ShellAttribute;
}

export interface ShellScopeNode {
  node: ShellNode;
  /** 相对作用域根节点的子节点路径，形如 `/0/3`。 */
  path: string;
}

/** FNV-1a 32 位常量；用 `Math.imul` 保证不被浮点截断。 */
const FNV_OFFSET_BASIS = 2166136261,
  FNV_PRIME = 16777619;

/**
 * 按「作用域」分组模型节点。
 *
 * `fanPart` / `vacuumPart` / `contactShadowRestMatrix` 是上游用来标记「独立部件」的
 * userData：这类节点会重新成为作用域根，路径归零。这样风扇的扇叶、扫地机的刷盘在
 * 模型增删子节点时不会让路径整体错位。
 */
export function shellScopes(modelRoot: ShellNode): Map<ShellNode, ShellScopeNode[]> {
  modelRoot.updateMatrixWorld(true);
  const scopes = new Map<ShellNode, ShellScopeNode[]>();
  const visitNode = (node: ShellNode, scopeRoot: ShellNode, path: string) => {
    const userData = node.userData || {};
    if (
      node !== modelRoot &&
      (userData.fanPart || userData.vacuumPart || userData.contactShadowRestMatrix)
    ) {
      ((scopeRoot = node), (path = ""));
    }
    if (!scopes.has(scopeRoot)) scopes.set(scopeRoot, []);
    scopes.get(scopeRoot)!.push({ node, path });
    node.children.forEach((childNode, childIndex) =>
      visitNode(childNode, scopeRoot, path + "/" + childIndex),
    );
  };
  visitNode(modelRoot, modelRoot, "");
  return scopes;
}

/**
 * 作用域内容指纹。
 *
 * 统计顺序与上游一致（路径字符 → 矩阵 → 材质透明度 → 顶点 → 索引）。顺序就是契约：
 * 改顺序会让所有已有掩码失效，等价于「全部不生效」，所以别动。
 */
export function shellSignature(scopeNodes: ReadonlyArray<ShellScopeNode>): string {
  let hash = FNV_OFFSET_BASIS;
  const floatView = new Float32Array(1),
    uintView = new Uint32Array(floatView.buffer);
  const mix = (value: number) => {
    hash = Math.imul(hash ^ (value >>> 0), FNV_PRIME) >>> 0;
  };
  for (const { node, path } of scopeNodes) {
    for (const pathCharacter of path) mix(pathCharacter.charCodeAt(0));
    if (path) {
      for (const matrixElement of node.matrix.elements) {
        ((floatView[0] = matrixElement), mix(uintView[0]));
      }
    }
    if (!node.geometry) continue;
    const material = node.material || {};
    (mix(material.transparent ? 1 : 0), (floatView[0] = Number(material.opacity ?? 1)), mix(uintView[0]));
    const positionAttribute = node.geometry.attributes.position;
    mix(positionAttribute.count);
    for (let componentIndex = 0; componentIndex < positionAttribute.count * positionAttribute.itemSize; componentIndex++) {
      ((floatView[0] = positionAttribute.array[componentIndex]), mix(uintView[0]));
    }
    const indexAttribute = node.geometry.index;
    (mix(indexAttribute?.count || 0),
      indexAttribute &&
        Array.from({ length: indexAttribute.count }, (_unused, indexOffset) =>
          mix(indexAttribute.array[indexOffset]),
        ));
  }
  return hash.toString(16);
}

/**
 * 剔除复核过的壳层三角形，返回剔除的三角形数量。
 *
 * 返回 0 表示「没命中任何掩码」——模型没被改动，调用方可以安全地当成 no-op。
 */
export function applyReviewedShells(
  three: ShellThree,
  modelRoot: ShellNode,
  reviewedKind: string,
  /** 掩码集覆盖（默认取内置数据）：给测试和「临时复核」留的注入点。 */
  maskSetsOverride?: ReviewedShellMaskSet[],
): number {
  const maskSets: ReviewedShellMaskSet[] | undefined =
    maskSetsOverride || REVIEWED_SHELL_MASKS[reviewedKind];
  if (!maskSets) return 0;
  const matchedEntries: Array<ShellScopeNode & { mask: number[] }> = [];
  for (const scopeNodes of shellScopes(modelRoot).values()) {
    const matchedMaskSet = maskSets.find(
      (maskSet) => maskSet.signature === shellSignature(scopeNodes),
    );
    if (!matchedMaskSet) continue;
    for (const scopeNode of scopeNodes) {
      const mask = matchedMaskSet.masks[scopeNode.path];
      mask?.length && matchedEntries.push({ ...scopeNode, mask });
    }
  }
  const processedGeometrySet = new Set<ShellGeometry>();
  let removedTriangleCount = 0;
  for (const { node, mask } of matchedEntries) {
    const geometry = node.geometry;
    if (!geometry || processedGeometrySet.has(geometry)) continue;
    processedGeometrySet.add(geometry);
    const indexAttribute = geometry.index,
      sourceIndices: ArrayLike<number> =
        indexAttribute?.array ||
        Array.from(
          { length: geometry.attributes.position.count },
          (_unused, vertexIndex) => vertexIndex,
        ),
      maskedTriangleSet = new Set(mask),
      keptIndices: number[] = [],
      // 三角形边界 → 剔除后的索引长度；用来重算 groups，保证材质边界不错位。
      keptLengthByTriangleBoundary: number[] = [0];
    for (let triangleOffset = 0; triangleOffset < sourceIndices.length; triangleOffset += 3) {
      maskedTriangleSet.has(triangleOffset / 3) ||
        keptIndices.push(
          sourceIndices[triangleOffset],
          sourceIndices[triangleOffset + 1],
          sourceIndices[triangleOffset + 2],
        );
      keptLengthByTriangleBoundary.push(keptIndices.length);
    }
    const remappedGroups = geometry.groups
      .map((group) => {
        const startLength =
            keptLengthByTriangleBoundary[
              Math.min(keptLengthByTriangleBoundary.length - 1, Math.floor(group.start / 3))
            ],
          endLength =
            keptLengthByTriangleBoundary[
              Math.min(
                keptLengthByTriangleBoundary.length - 1,
                Math.floor((group.start + group.count) / 3),
              )
            ];
        return {
          start: startLength,
          count: endLength - startLength,
          materialIndex: group.materialIndex,
        };
      })
      .filter((group) => group.count > 0);
    if (!keptIndices.length) continue;
    // 压紧顶点：只保留仍被索引引用的顶点，避免「删了三角形但显存没降」。
    const usedVertexIndices = [...new Set(keptIndices)],
      vertexRemap = new Map(
        usedVertexIndices.map((vertexIndex, newVertexIndex) => [vertexIndex, newVertexIndex]),
      );
    for (const [attributeName, sourceAttribute] of Object.entries(geometry.attributes)) {
      const compactedArray = new (
        sourceAttribute.array.constructor as new (length: number) => unknown
      )(usedVertexIndices.length * sourceAttribute.itemSize) as {
        set(source: unknown, offset: number): void;
      };
      usedVertexIndices.forEach((vertexIndex, compactedIndex) =>
        compactedArray.set(
          sourceAttribute.array.subarray(
            vertexIndex * sourceAttribute.itemSize,
            (vertexIndex + 1) * sourceAttribute.itemSize,
          ),
          compactedIndex * sourceAttribute.itemSize,
        ),
      );
      geometry.setAttribute(
        attributeName,
        new three.BufferAttribute(
          compactedArray,
          sourceAttribute.itemSize,
          sourceAttribute.normalized,
        ),
      );
    }
    geometry.setIndex(keptIndices.map((vertexIndex) => vertexRemap.get(vertexIndex)!));
    geometry.clearGroups();
    for (const remappedGroup of remappedGroups)
      geometry.addGroup(remappedGroup.start, remappedGroup.count, remappedGroup.materialIndex);
    // `parameters` 是原始构造参数（例如 BoxGeometry 的宽高），留着会让 three 认为
    // 它还是那个参数化几何体，后续 `type` 判定与序列化都会出错。
    delete (geometry as ShellGeometry & { parameters?: unknown }).parameters;
    geometry.type = "BufferGeometry";
    ((geometry.attributes.position as ShellAttribute).needsUpdate = true),
      geometry.index && (geometry.index.needsUpdate = true);
    (geometry.computeBoundingBox(), geometry.computeBoundingSphere());
    removedTriangleCount += (sourceIndices.length - keptIndices.length) / 3;
  }
  return removedTriangleCount;
}
