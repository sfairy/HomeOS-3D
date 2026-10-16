/**
 * 静态物品网格合批（`mergeStaticItemMeshes`）—— 从 studio-app.ts 单体整体切出（P4）。
 *
 * 做的事：把「材质键 + 几何签名」一致、且各自都不可实例化的物品网格压成一个合批网格，
 * 顺手回收被吃掉的几何与材质，最后把批次数 / 省下的 draw call 写进渲染器 dataset。
 *
 * 依赖面只有 4 项、且全是**只读**读取（切片区间内无一处重新赋值）：
 * - `appCtx` 按引用传入（本文件只读它的 `threeRenderer`：3 处 dataset 统计写入）；
 * - `isEmbeddedStage` / `instanceTestTypeSet` / `createSelectionRef` 是宿主闭包里的常量与两个判定句柄。
 * 除函数名加了 `Core` 后缀、正文首行解构 deps 之外，函数体与迁出前**逐字一致**。
 */

import { buildGeometryKey } from "./studio-furniture-batching";
import { buildStaticMaterialKey } from "../../materials/studio-static-material-key";
import { mergeGeometries as mergeGeometries2 } from "/static/vendor/three/0.186.1/BufferGeometryUtils.js";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";

/** 静态合批需要的外部句柄（全部只读；`appCtx` 只用到 `threeRenderer`）。 */
export interface StudioStaticItemMeshesDeps {
  /** 宿主的应用上下文对象（按引用传入，只读 `threeRenderer`）。 */
  appCtx: any;
  /** 内嵌舞台模式：属性集裁剪与顶点色模拟只在这一模式下生效。 */
  isEmbeddedStage: boolean;
  /** 走实例化渲染的物品类型集合：命中的组不进合批（实例化那份更省）。 */
  instanceTestTypeSet: Set<string>;
  /** 选中态判定（由选中种类 + id 生成 `userData` 引用）：有选中引用的一律不参与合批。 */
  createSelectionRef: (selectionKind: any, selectionId: any) => any;
}

export function mergeStaticItemMeshesCore(
  deps: StudioStaticItemMeshesDeps,
  mergeSceneRoot: any,
  mergeItemEntries: any,
) {
  const { appCtx, isEmbeddedStage, instanceTestTypeSet, createSelectionRef } = deps,
    staticGroupsBySignature = new Map(),
    attributeNamesOf = (mergeItemEntriesSourceMesh: any) => {
      const sort3 = Object.keys(mergeItemEntriesSourceMesh.geometry.attributes)
        .filter(
          (mergeItemEntriesSourceMeshAttributeName) =>
            mergeItemEntriesSourceMeshAttributeName !== "color" ||
            mergeItemEntriesSourceMesh.material.vertexColors,
        )
        .sort();
      return !isEmbeddedStage ||
        Object.values(mergeItemEntriesSourceMesh.material).some(
          (mergeItemEntriesSourceMeshMaterialValue: any) =>
            mergeItemEntriesSourceMeshMaterialValue?.isTexture,
        )
        ? sort3
        : sort3.filter(
            (textureAttributeName) =>
              textureAttributeName === "position" ||
              textureAttributeName === "normal" ||
              (textureAttributeName === "color" &&
                mergeItemEntriesSourceMesh.material.vertexColors),
          );
    };
  mergeSceneRoot.updateMatrixWorld(true);
  for (const { item: staticItem, group: staticItemGroup } of mergeItemEntries)
    staticItemGroup.parent !== mergeSceneRoot ||
      staticItemGroup.userData?.courtyardSurface === true ||
      instanceTestTypeSet.has(staticItem.type) ||
      (isEmbeddedStage &&
        [
          "airer",
          "fan",
          "storagewaterheater",
          "gaswaterheater",
          "airpurifier",
          "wallac",
          "floorac",
          "airoutlet",
          "curtain",
          "nas",
          "fridge",
          "freezer",
          "dishwasher",
          "washer",
          "dryer",
          "plant",
          "camera",
          "presence",
          "speaker",
          "tv",
          "robotvacuum",
          "smallcar",
          "suv",
          "scooter",
        ].includes(staticItem.type)) ||
      createSelectionRef("item", staticItem.id) ||
      staticItemGroup.traverse((staticMesh: any) => {
        if (
          !staticMesh.isMesh ||
          staticMesh.isInstancedMesh ||
          staticMesh.geometry.drawRange.start !== 0 ||
          staticMesh.geometry.drawRange.count !== Infinity
        )
          return;
        for (
          let ancestorNode = staticMesh;
          ancestorNode && ancestorNode !== mergeSceneRoot;
          ancestorNode = ancestorNode.parent
        )
          if (!ancestorNode.visible) return;
        const isEmulatedVertexColor = isEmbeddedStage && !staticMesh.material?.vertexColors,
          ra3 = buildStaticMaterialKey(staticMesh, isEmbeddedStage, isEmulatedVertexColor);
        if (!ra3 || staticMesh.matrixWorld.determinant() < 0) return;
        const attributeSizePairs = attributeNamesOf(staticMesh).map((signatureAttributeName) => [
          signatureAttributeName,
          staticMesh.geometry.attributes[signatureAttributeName].itemSize,
        ]);
        isEmulatedVertexColor && attributeSizePairs.push(["color", 3]);
        const attributeSignatureJson = isEmbeddedStage
            ? JSON.stringify(attributeSizePairs)
            : buildGeometryKey(staticMesh),
          staticBatchKey = ra3 + ":" + attributeSignatureJson + ":" + isEmulatedVertexColor;
        (staticGroupsBySignature.has(staticBatchKey) ||
          staticGroupsBySignature.set(staticBatchKey, []),
          staticGroupsBySignature.get(staticBatchKey).push(staticMesh));
      });
  const invert4 = mergeSceneRoot.matrixWorld.clone().invert(),
    staticBatchStats: any[] = [],
    /** 只用来 `dispose()` 的被吃掉材质；显式写清「只需要 dispose」比 `Set<unknown>` + 使用点强转更准。 */
    disposableMaterialSet = new Set<{ dispose?: () => void }>();
  for (const staticGroup of staticGroupsBySignature.values()) {
    if (staticGroup.length < 2) continue;
    const clonedGeometries = staticGroup.map((mergedSourceMesh: any) => {
        const multiplyMatrices4 = new ns2.Matrix4().multiplyMatrices(
            invert4,
            mergedSourceMesh.matrixWorld,
          ),
          clone5 = mergedSourceMesh.geometry.clone();
        if (isEmbeddedStage) {
          const keptAttributeNames = attributeNamesOf(mergedSourceMesh);
          for (const mergedAttributeName of Object.keys(clone5.attributes))
            keptAttributeNames.includes(mergedAttributeName) ||
              clone5.deleteAttribute(mergedAttributeName);
          for (const keptAttribute of keptAttributeNames) {
            const sourceAttribute = mergedSourceMesh.geometry.attributes[keptAttribute];
            if (
              !sourceAttribute.isInterleavedBufferAttribute &&
              !sourceAttribute.normalized &&
              sourceAttribute.array instanceof Float32Array
            )
              continue;
            const float32Array = new Float32Array(sourceAttribute.count * sourceAttribute.itemSize),
              componentAccessors = ["getX", "getY", "getZ", "getW"];
            for (let vertexIndex = 0; vertexIndex < sourceAttribute.count; vertexIndex++)
              for (
                let componentIndex = 0;
                componentIndex < sourceAttribute.itemSize;
                componentIndex++
              )
                float32Array[vertexIndex * sourceAttribute.itemSize + componentIndex] =
                  componentIndex < 4
                    ? sourceAttribute[componentAccessors[componentIndex]](vertexIndex)
                    : sourceAttribute.getComponent(vertexIndex, componentIndex);
            clone5.setAttribute(
              keptAttribute,
              new ns2.BufferAttribute(float32Array, sourceAttribute.itemSize),
            );
          }
          if (!mergedSourceMesh.material.vertexColors) {
            const count2 = clone5.attributes.position.count,
              componentArray = new Float32Array(count2 * 3),
              color2 = mergedSourceMesh.material.color;
            for (let colorVertexIndex = 0; colorVertexIndex < count2; colorVertexIndex++)
              ((componentArray[colorVertexIndex * 3] = color2.r),
                (componentArray[colorVertexIndex * 3 + 1] = color2.g),
                (componentArray[colorVertexIndex * 3 + 2] = color2.b));
            clone5.setAttribute("color", new ns2.BufferAttribute(componentArray, 3));
          }
          if (!clone5.index) {
            const count3 = clone5.attributes.position.count,
              uint16Array = count3 <= 65536 ? new Uint16Array(count3) : new Uint32Array(count3);
            for (let indexVertex = 0; indexVertex < count3; indexVertex++)
              uint16Array[indexVertex] = indexVertex;
            clone5.setIndex(new ns2.BufferAttribute(uint16Array, 1));
          }
        }
        return clone5.applyMatrix4(multiplyMatrices4);
      }),
      mergedGeometry = mergeGeometries2(clonedGeometries);
    if ((clonedGeometries.forEach((clonedGeometry: any) => clonedGeometry.dispose()), !mergedGeometry))
      continue;
    const representativeMesh = staticGroup[0],
      isVertexColorInjected = isEmbeddedStage && !representativeMesh.material.vertexColors,
      clone6 = isVertexColorInjected
        ? representativeMesh.material.clone()
        : representativeMesh.material;
    isVertexColorInjected && (clone6.color.setRGB(1, 1, 1), (clone6.vertexColors = true));
    const mergedMesh = new ns2.Mesh(mergedGeometry, clone6);
    (isEmbeddedStage && (mergedMesh.matrixAutoUpdate = false),
      (mergedMesh.castShadow = representativeMesh.castShadow),
      (mergedMesh.receiveShadow = representativeMesh.receiveShadow),
      (mergedMesh.renderOrder = representativeMesh.renderOrder),
      (mergedMesh.layers.mask = representativeMesh.layers.mask),
      (mergedMesh.userData.externalModelSharedTextures =
        representativeMesh.userData.externalModelSharedTextures === true),
      (mergedMesh.userData.externalModelSharedMaterial =
        !isVertexColorInjected && representativeMesh.userData.externalModelSharedMaterial === true),
      (mergedMesh.userData.reflectionSimplifiable = isEmbeddedStage),
      (mergedMesh.userData.modelLayer = "items"),
      (mergedMesh.userData.exportRole = "plan"));
    for (const consumedMesh of staticGroup)
      (consumedMesh.parent?.remove(consumedMesh),
        consumedMesh.userData.externalModelSharedGeometry || consumedMesh.geometry.dispose(),
        consumedMesh.userData.externalModelSharedMaterial ||
          disposableMaterialSet.add(consumedMesh.material));
    (mergeSceneRoot.add(mergedMesh),
      staticBatchStats.push({
        before: staticGroup.length,
        after: 1,
      }));
  }
  for (const { group: leftoverGroup } of mergeItemEntries) {
    let hasRenderableChild = false;
    (leftoverGroup.traverse((leftoverChild: any) => {
      (leftoverChild.isMesh ||
        leftoverChild.isLine ||
        leftoverChild.isPoints ||
        leftoverChild.isSprite) &&
        (hasRenderableChild = true);
    }),
      leftoverGroup.parent === mergeSceneRoot &&
        !hasRenderableChild &&
        mergeSceneRoot.remove(leftoverGroup));
  }
  const retainedMaterialSet = new Set();
  mergeSceneRoot.traverse((materialHolder: any) => {
    for (const retainedMaterial of Array.isArray(materialHolder.material)
      ? materialHolder.material
      : materialHolder.material
        ? [materialHolder.material]
        : [])
      retainedMaterialSet.add(retainedMaterial);
  });
  for (const disposableMaterial of disposableMaterialSet)
    retainedMaterialSet.has(disposableMaterial) || disposableMaterial.dispose?.();
  return (
    (mergeSceneRoot.userData.staticItemBatchStats = staticBatchStats),
    appCtx.threeRenderer?.domElement &&
      ((appCtx.threeRenderer.domElement.dataset.staticItemBatchCount = String(staticBatchStats.length)),
      (appCtx.threeRenderer.domElement.dataset.staticItemDrawCallsSaved = String(
        staticBatchStats.reduce(
          (savedAccumulator, staticBatchStat) =>
            savedAccumulator + staticBatchStat.before - staticBatchStat.after,
          0,
        ),
      ))),
    staticBatchStats
  );
}
