import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import type { CylinderMeshOptions } from "../../types/studio-app-types";

export function addCylinderMesh(
  cylinderParent: any,
  cylinderRadiusTop: any,
  cylinderRadiusBottom: any,
  cylinderHeight: any,
  cylinderX: any,
  cylinderY: any,
  cylinderZ: any,
  cylinderColor: any,
  cylinderOptions: CylinderMeshOptions = {},
) {
  const cylinderMaterial = new ns2.MeshStandardMaterial({
      color: cylinderColor,
      roughness: cylinderOptions.roughness ?? 0.62,
      metalness: cylinderOptions.metalness ?? 0.03,
      transparent: !!cylinderOptions.transparent,
      opacity: cylinderOptions.opacity ?? 1,
      depthWrite: cylinderOptions.depthWrite ?? true,
    }),
    cylinderMesh = new ns2.Mesh(
      new ns2.CylinderGeometry(
        cylinderRadiusTop,
        cylinderRadiusBottom,
        cylinderHeight,
        cylinderOptions.segments ?? 24,
      ),
      cylinderMaterial,
    );
  return (
    cylinderMesh.position.set(cylinderX, cylinderY, cylinderZ),
    cylinderOptions.rotationX && (cylinderMesh.rotation.x = cylinderOptions.rotationX),
    cylinderOptions.rotationZ && (cylinderMesh.rotation.z = cylinderOptions.rotationZ),
    (cylinderMesh.castShadow = cylinderOptions.castShadow !== false),
    (cylinderMesh.receiveShadow = cylinderOptions.receiveShadow !== false),
    cylinderParent.add(cylinderMesh),
    cylinderMesh
  );
}
