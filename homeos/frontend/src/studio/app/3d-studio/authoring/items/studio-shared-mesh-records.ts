/**
 * 共享网格批处理记录采集 —— 从 studio-app.ts 单体切出。
 *
 * 判据：一组网格能否整体批处理 —— 全部 mesh 共享几何、非透明、非蒙皮、无变形目标，
 * 且材质签名一致；任一条件被打破即整组放弃（返回 null）。纯函数，无闭包捕获。
 */

import { finite as finite2 } from "../../loaders/studio-normalization";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";

export function buildMaterialSignature(signatureMesh: any) {
  const signatureMaterial = signatureMesh.material;
  return Array.isArray(signatureMaterial) || !signatureMaterial?.isMeshStandardMaterial
    ? ""
    : JSON.stringify([
        signatureMaterial.color?.getHex(),
        signatureMaterial.roughness,
        signatureMaterial.metalness,
        signatureMaterial.emissive?.getHex(),
        signatureMaterial.emissiveIntensity,
        signatureMaterial.side,
        signatureMaterial.transparent,
        signatureMaterial.opacity,
        signatureMaterial.depthWrite,
        signatureMaterial.depthTest,
        signatureMaterial.depthFunc,
        signatureMaterial.blending,
        signatureMaterial.polygonOffset,
        signatureMaterial.polygonOffsetFactor,
        signatureMaterial.polygonOffsetUnits,
        signatureMaterial.map?.uuid || "",
        signatureMaterial.userData?.plan2SurfaceContact !== false,
        signatureMaterial.userData?.plan2SurfaceSlope === true,
      ]);
}

export function collectSharedMeshRecords(modelRootGroup: any) {
  if (
    (modelRootGroup.updateMatrixWorld(true),
    modelRootGroup.updateMatrix(),
    modelRootGroup.matrix.determinant() < 0)
  )
    return null;
  const invert2 = modelRootGroup.matrixWorld.clone().invert(),
    sharedMeshRecords: any = [];
  let isBatchable = true;
  return (
    modelRootGroup.traverseVisible((candidateMesh: any) => {
      if (!isBatchable || !candidateMesh.isMesh) return;
      const candidateMaterial = candidateMesh.material;
      if (
        !candidateMesh.userData.externalModelSharedGeometry ||
        Array.isArray(candidateMaterial) ||
        !candidateMaterial ||
        candidateMaterial.transparent === true ||
        finite2(candidateMaterial.opacity, 1) < 0.999 ||
        candidateMesh.isSkinnedMesh ||
        candidateMesh.morphTargetInfluences
      ) {
        isBatchable = false;
        return;
      }
      const multiplyMatrices2 = new ns2.Matrix4().multiplyMatrices(
          invert2,
          candidateMesh.matrixWorld,
        ),
        tg3 = buildMaterialSignature(candidateMesh);
      if (!tg3) {
        isBatchable = false;
        return;
      }
      sharedMeshRecords.push({
        mesh: candidateMesh,
        relativeMatrix: multiplyMatrices2,
        signature: JSON.stringify([
          candidateMesh.geometry.uuid,
          tg3,
          multiplyMatrices2.elements.map(
            (roundedCoordinate: any) => Math.round(roundedCoordinate * 1000000) / 1000000,
          ),
          candidateMesh.castShadow,
          candidateMesh.receiveShadow,
          candidateMesh.renderOrder,
        ]),
      });
    }),
    isBatchable && sharedMeshRecords.length ? sharedMeshRecords : null
  );
}
