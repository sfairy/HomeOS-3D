/**
 * 运行时家具网格合并。
 *
 * 位置：3D 工作室加载完户型与家具之后、进入交互渲染之前调用一次，
 *   把「同类型家具里材质参数一致」的多个网格合并成一个网格，显著降低绘制批次。
 * 对外：RUNTIME_FURNITURE_TYPES 与 compactRuntimeFurniture。
 * 合并代价：材质里的颜色 / 粗糙度 / 金属度会被烘进顶点属性，因此合并后的网格
 *   必须换成一套走顶点属性的材质；带贴图的材质无法这样烘，故不参与合并。
 * 坐标与单位：长度单位米；合并后统一换算到根节点的局部坐标系（用根的世界矩阵求逆），
 *   合并结果挂在 root 下并按平面图层导出（exportRole 为 plan）。
 * 副作用：会移除原网格、替换材质，并释放确认无人再引用的几何与材质。
 */

// 只合并这几类批量出现且形态规则的家具；其余类型数量少，合并收益不及风险。
export const RUNTIME_FURNITURE_TYPES = new Set(["bed", "sofa", "cabinet", "desk", "nightstand"]);

/**
 * 合并同材质的家具网格。
 *
 * @param {object} root 场景根节点，合并结果与统计都会挂在它上面。
 * @param {Array<{item: object, group: object}>} furnitureEntries 家具条目
 *   （item 为文档里的物件记录，group 为它在场景中的分组节点）。
 * @param {object} options 依赖注入。
 * @param {object} options.THREE three.js 模块命名空间。
 * @param {function(Array<object>): object|null} options.mergeGeometries 几何合并函数
 *   （来自 three 的 BufferGeometryUtils）。
 * @param {function(object, boolean, boolean): (string|null)} options.materialKey
 *   材质分组键函数，参数为网格、是否用于分组、是否需要校验。
 * @returns {object} 统计信息（合并前后的网格数、三角形数、顶点字节数与涉及的类型）。
 */
export function compactRuntimeFurniture(
  root,
  furnitureEntries,
  { THREE: THREE, mergeGeometries: mergeGeometries, materialKey: materialKey }
) {
  // 待合并网格按分组键归拢；cloneByMaterial 缓存「原材质 → 烘焙用克隆材质」。
  const groupedMeshes = new Map();
  const cloneByMaterial = new Map();
  // 先收集候选待释放资源，最后统一剔除仍被引用的，避免误删共享几何 / 材质。
  const replacedGeometries = new Set();
  const replacedMaterials = new Set();
  const stats = {
    before: 0,
    after: 0,
    triangles: 0,
    vertexBytes: 0,
    types: []
  };
  const usedTypes = new Set();
  root.updateMatrixWorld(true);
  // 合并后的网格挂在 root 下，因此要把各网格的世界矩阵换算成相对 root 的矩阵。
  const rootInverseMatrix = root.matrixWorld.clone().invert();
  for (const { item: item, group: itemGroup } of furnitureEntries) {
    // 只处理「类型在名单内、且直接挂在根节点下」的分组：挂在别处的（例如预览层）不合并。
    if (!!RUNTIME_FURNITURE_TYPES.has(item.type) && itemGroup.parent === root) {
      itemGroup.traverse(node => {
        const material = node.material;
        const geometry = node.geometry;
        // 逐条排除不安全的情况：实例化网格与带子节点的网格可见性语义复杂；
        // 缺 position / normal、做过局部绘制范围裁剪的几何合并后会错位；
        // 世界矩阵行列式为负说明存在镜像缩放，合并会翻转绕序导致背面剔除；
        // 材质里有贴图无法烘进顶点属性；顶点色与几何 color 属性尺寸不匹配会取错值。
        if (
          !node.isMesh ||
          node.isInstancedMesh ||
          node.children.length ||
          !geometry?.attributes.position ||
          !geometry.attributes.normal ||
          geometry.drawRange.start !== 0 ||
          geometry.drawRange.count !== Infinity ||
          node.matrixWorld.determinant() <= 0 ||
          !materialKey(node, true, true) ||
          Object.values(material).some(materialValue => materialValue?.isTexture) ||
          (material.vertexColors && geometry.attributes.color?.itemSize !== 3)
        ) {
          return;
        }
        // 祖先链上任一层不可见就不合并：合并会丢失这层可见性控制。
        for (let ancestor = node; ancestor && ancestor !== root; ancestor = ancestor.parent) {
          if (!ancestor.visible) {
            return;
          }
        }
        let clonedMaterial = cloneByMaterial.get(material);
        if (!clonedMaterial) {
          // 克隆材质用于「量出」分组键，同时把颜色 / 粗糙度 / 金属度整体移到顶点属性：
          // 颜色置白、粗糙度与金属度置 1，最终由 runtimeSurface 属性乘回来。
          clonedMaterial = material.clone();
          clonedMaterial.color.setRGB(1, 1, 1);
          clonedMaterial.vertexColors = true;
          clonedMaterial.roughness = clonedMaterial.metalness = 1;
          cloneByMaterial.set(material, clonedMaterial);
        }
        // materialKey 需要一个带克隆材质的对象；用原型代理避免真的改动网格上的材质。
        const materialProxy = Object.create(node);
        materialProxy.material = clonedMaterial;
        const groupKey = materialKey(materialProxy, true, false);
        if (groupKey) {
          if (!groupedMeshes.has(groupKey)) {
            groupedMeshes.set(groupKey, []);
          }
          groupedMeshes.get(groupKey).push({
            mesh: node,
            type: item.type,
            id: item.id
          });
        }
      });
    }
  }
  for (const meshEntries of groupedMeshes.values()) {
    // 只有一块网格时合并无收益，反而多一份拷贝。
    if (meshEntries.length < 2) {
      continue;
    }
    const geometries = meshEntries.map(({ mesh: entry }) => {
      const sourceGeometry = entry.geometry;
      const preparedGeometry = new THREE.BufferGeometry();
      const vertexCount = sourceGeometry.attributes.position.count;
      // position 与 normal 逐分量拷进新的 Float32Array：
      // 合并要求各几何的属性布局完全一致，且不能与源几何共享底层 buffer。
      for (const attributeName of ["position", "normal"]) {
        const sourceAttribute = sourceGeometry.attributes[attributeName];
        const positionData = new Float32Array(vertexCount * 3);
        for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
          positionData[vertexIndex * 3] = sourceAttribute.getX(vertexIndex);
          positionData[vertexIndex * 3 + 1] = sourceAttribute.getY(vertexIndex);
          positionData[vertexIndex * 3 + 2] = sourceAttribute.getZ(vertexIndex);
        }
        preparedGeometry.setAttribute(attributeName, new THREE.BufferAttribute(positionData, 3));
      }
      // color 烘「材质色 × 顶点色」，runtimeSurface 烘「粗糙度, 金属度」。
      const colorData = new Float32Array(vertexCount * 3);
      const surfaceData = new Float32Array(vertexCount * 2);
      const sourceMaterial = entry.material;
      const vertexColorAttribute = sourceGeometry.attributes.color;
      for (let vertexCursor = 0; vertexCursor < vertexCount; vertexCursor++) {
        colorData[vertexCursor * 3] =
          sourceMaterial.color.r *
          (sourceMaterial.vertexColors ? vertexColorAttribute.getX(vertexCursor) : 1);
        colorData[vertexCursor * 3 + 1] =
          sourceMaterial.color.g *
          (sourceMaterial.vertexColors ? vertexColorAttribute.getY(vertexCursor) : 1);
        colorData[vertexCursor * 3 + 2] =
          sourceMaterial.color.b *
          (sourceMaterial.vertexColors ? vertexColorAttribute.getZ(vertexCursor) : 1);
        surfaceData[vertexCursor * 2] = sourceMaterial.roughness;
        surfaceData[vertexCursor * 2 + 1] = sourceMaterial.metalness;
      }
      preparedGeometry.setAttribute("color", new THREE.BufferAttribute(colorData, 3));
      preparedGeometry.setAttribute("runtimeSurface", new THREE.BufferAttribute(surfaceData, 2));
      // 索引统一升到 Uint32：合并后顶点数可能超过 65535，用 16 位索引会截断。
      // 源几何没有索引时按顺序生成一份（等价于非索引的三角形列表）。
      const indexData = new Uint32Array(
        sourceGeometry.index ? sourceGeometry.index.count : vertexCount
      );
      for (let indexCursor = 0; indexCursor < indexData.length; indexCursor++) {
        indexData[indexCursor] = sourceGeometry.index
          ? sourceGeometry.index.getX(indexCursor)
          : indexCursor;
      }
      preparedGeometry.setIndex(new THREE.BufferAttribute(indexData, 1));
      return preparedGeometry.applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(rootInverseMatrix, entry.matrixWorld)
      );
    });
    const mergedGeometry = mergeGeometries(geometries);
    // 合并函数会把数据拷进新缓冲，临时的分块几何可以立即释放。
    geometries.forEach(mergedPiece => mergedPiece.dispose());
    if (!mergedGeometry) {
      // 属性不一致等情况下合并可能失败，跳过这一组保持原样。
      continue;
    }
    const firstMesh = meshEntries[0].mesh;
    const mergedMaterial = cloneByMaterial.get(firstMesh.material).clone();
    // 注入 runtimeSurface 属性：顶点着色器透传，片元阶段乘到粗糙度与金属度上，
    // 于是「逐网格的材质差异」得以保留，同时整组只用一个材质与一次绘制。
    mergedMaterial.onBeforeCompile = shader => {
      shader.vertexShader =
        "attribute vec2 runtimeSurface;\nvarying vec2 vRuntimeSurface;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvRuntimeSurface = runtimeSurface;"
      );
      shader.fragmentShader = "varying vec2 vRuntimeSurface;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor *= vRuntimeSurface.x;"
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <metalnessmap_fragment>",
        "#include <metalnessmap_fragment>\nmetalnessFactor *= vRuntimeSurface.y;"
      );
    };
    // 所有合并网格的着色器源码完全相同，共用一个固定缓存键，
    // 让 three.js 只编译一份程序，而不是每个合并网格各编译一份。
    mergedMaterial.customProgramCacheKey = () => "runtime-furniture-surface-v1";
    const mergedMesh = new THREE.Mesh(mergedGeometry, mergedMaterial);
    mergedMesh.name = "runtime-compact-furniture";
    // 阴影、绘制顺序与图层掩码沿用组内第一个网格，保证合并前后渲染行为一致。
    mergedMesh.castShadow = firstMesh.castShadow;
    mergedMesh.receiveShadow = firstMesh.receiveShadow;
    mergedMesh.renderOrder = firstMesh.renderOrder;
    mergedMesh.layers.mask = firstMesh.layers.mask;
    mergedMesh.userData.modelLayer = "items";
    mergedMesh.userData.exportRole = "plan";
    // 保留来源物件 id，供选中 / 拾取时反查合并网格。
    mergedMesh.userData.runtimeFurnitureItemIds = meshEntries.map(itemId => itemId.id);
    mergedMesh.userData.runtimeFurnitureStats = {
      before: meshEntries.length,
      after: 1,
      triangles: mergedGeometry.index.count / 3
    };
    for (const { mesh: removedMesh, type: removedType } of meshEntries) {
      usedTypes.add(removedType);
      removedMesh.removeFromParent();
      // userData 里带 *SharedGeometry 标记说明几何是多个网格共用的，不能随本网格释放。
      if (
        !Object.entries(removedMesh.userData).some(
          ([userDataKey, userDataValue]) => userDataKey.endsWith("SharedGeometry") && userDataValue
        )
      ) {
        replacedGeometries.add(removedMesh.geometry);
      }
      // 材质同理，带 *SharedMaterial 标记的交给上层管理。
      if (
        !Object.entries(removedMesh.userData).some(
          ([sharedKey, sharedValue]) => sharedKey.endsWith("SharedMaterial") && sharedValue
        )
      ) {
        replacedMaterials.add(removedMesh.material);
      }
    }
    stats.before += meshEntries.length;
    stats.after++;
    stats.triangles += mergedGeometry.index.count / 3;
    stats.vertexBytes += Object.values(mergedGeometry.attributes).reduce(
      (totalBytes, attribute) => totalBytes + attribute.array.byteLength,
      mergedGeometry.index.array.byteLength
    );
    root.add(mergedMesh);
  }
  // 用于分组判断的临时克隆材质已经完成使命，全部释放。
  for (const cachedMaterial of cloneByMaterial.values()) {
    cachedMaterial.dispose();
  }
  // 复查场景：仍在使用的几何 / 材质要从待释放集合里摘掉（同一几何可能被别的网格继续引用）。
  root.traverse(traversedNode => {
    if (traversedNode.geometry) {
      replacedGeometries.delete(traversedNode.geometry);
    }
    for (const nodeMaterial of Array.isArray(traversedNode.material)
      ? traversedNode.material
      : traversedNode.material
        ? [traversedNode.material]
        : []) {
      replacedMaterials.delete(nodeMaterial);
    }
  });
  for (const unusedGeometry of replacedGeometries) {
    unusedGeometry.dispose();
  }
  for (const unusedMaterial of replacedMaterials) {
    unusedMaterial.dispose();
  }
  stats.types = [...usedTypes];
  root.userData.runtimeFurnitureBatchStats = stats;
  return stats;
}
