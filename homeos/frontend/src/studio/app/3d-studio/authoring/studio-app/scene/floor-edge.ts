import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import { mergeGeometries as mergeGeometries2 } from "/static/vendor/three/0.186.1/BufferGeometryUtils.js";
import type { StudioAppContext } from "../studio-app-context";

export function buildFloorEdgeOutline(appCtx: StudioAppContext, floorEdgePointList: any, floorEdgeColor: any, floorEdgeHeight: any) {
  const outlineBoxGeometries: any[] = [],
    shadowBoxGeometries: any[] = [];
  for (let floorEdgeIndex = 0; floorEdgeIndex < floorEdgePointList.length; floorEdgeIndex += 1) {
    const floorEdgeStartPoint = floorEdgePointList[floorEdgeIndex],
      floorEdgeEndPoint = floorEdgePointList[(floorEdgeIndex + 1) % floorEdgePointList.length],
      floorEdgeDeltaX = floorEdgeEndPoint.x - floorEdgeStartPoint.x,
      floorEdgeDeltaZ = floorEdgeEndPoint.z - floorEdgeStartPoint.z,
      hypot6 = Math.hypot(floorEdgeDeltaX, floorEdgeDeltaZ);
    if (hypot6 <= 0.001) continue;
    const floorEdgeMidX = (floorEdgeStartPoint.x + floorEdgeEndPoint.x) / 2,
      floorEdgeMidZ = (floorEdgeStartPoint.z + floorEdgeEndPoint.z) / 2,
      floorEdgeAngle = -Math.atan2(floorEdgeDeltaZ, floorEdgeDeltaX),
      compose2 = new ns2.Matrix4().compose(
        new ns2.Vector3(floorEdgeMidX, floorEdgeHeight + 0.021, floorEdgeMidZ),
        new ns2.Quaternion().setFromAxisAngle(new ns2.Vector3(0, 1, 0), floorEdgeAngle),
        new ns2.Vector3(1, 1, 1),
      ),
      compose3 = new ns2.Matrix4().compose(
        new ns2.Vector3(floorEdgeMidX, floorEdgeHeight + 0.026, floorEdgeMidZ),
        new ns2.Quaternion().setFromAxisAngle(new ns2.Vector3(0, 1, 0), floorEdgeAngle),
        new ns2.Vector3(1, 1, 1),
      );
    (outlineBoxGeometries.push(new ns2.BoxGeometry(hypot6, 0.042, 0.038).applyMatrix4(compose2)),
      shadowBoxGeometries.push(
        new ns2.BoxGeometry(hypot6 + 0.025, 0.066, 0.078).applyMatrix4(compose3),
      ));
  }
  const outlineMergedGeometry = outlineBoxGeometries.length
      ? mergeGeometries2(outlineBoxGeometries)
      : null,
    shadowMergedGeometry = shadowBoxGeometries.length
      ? mergeGeometries2(shadowBoxGeometries)
      : null;
  if (
    (outlineBoxGeometries.forEach((outlineBoxGeometry) => outlineBoxGeometry.dispose()),
    shadowBoxGeometries.forEach((shadowBoxGeometry) => shadowBoxGeometry.dispose()),
    outlineMergedGeometry)
  ) {
    const floorOutlineMesh = new ns2.Mesh(
      outlineMergedGeometry,
      new ns2.MeshBasicMaterial({
        color: floorEdgeColor,
        transparent: true,
        opacity: 0.82,
        toneMapped: false,
      }),
    );
    ((floorOutlineMesh.renderOrder = 3),
      (floorOutlineMesh.userData.exportRole = "outline"),
      (floorOutlineMesh.userData.batchedFloorEdgeCount = floorEdgePointList.length),
      appCtx.sceneRootNode.add(floorOutlineMesh));
  }
  if (shadowMergedGeometry) {
    const floorShadowMesh = new ns2.Mesh(
      shadowMergedGeometry,
      new ns2.MeshBasicMaterial({
        color: floorEdgeColor,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
        blending: ns2.AdditiveBlending,
        toneMapped: false,
      }),
    );
    ((floorShadowMesh.renderOrder = 2),
      (floorShadowMesh.userData.exportRole = "outline"),
      (floorShadowMesh.userData.batchedFloorEdgeCount = floorEdgePointList.length),
      appCtx.sceneRootNode.add(floorShadowMesh));
  }
}
