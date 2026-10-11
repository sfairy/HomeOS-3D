/** 家具 / 设备模型共用的网格原语（`addBoxMesh`）与柜体拼装（`addFurnitureAssembly`）。
 *
 * 从 `../studio-app.ts` 的巨型闭包抽出（P4 拆单体）：两者都是纯函数（入参 → 新网格），无闭包捕获、
 * 无对外部状态读写。`addBoxMesh` 在单体里被 270+ 处调用，回引**保持同名**，所以调用点零改写。
 */

import type { BoxMeshOptions } from "../studio-app-types";
import { RoundedBoxGeometry } from "/static/vendor/three/0.186.0/RoundedBoxGeometry.js";
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";

export function addBoxMesh(
  boxParent: any,
  boxWidth: any,
  boxHeight: any,
  boxDepth: any,
  boxX: any,
  boxY: any,
  boxZ: any,
  boxColor: any,
  boxOptions: BoxMeshOptions = {},
) {
  const boxMaterial = new threeModuleMin.MeshStandardMaterial({
      color: boxColor,
      roughness: boxOptions.roughness ?? 0.8,
      metalness: boxOptions.metalness ?? 0.01,
      transparent: !!boxOptions.transparent,
      opacity: boxOptions.opacity ?? 1,
      depthWrite: boxOptions.depthWrite ?? true,
      depthFunc: boxOptions.depthFunc ?? threeModuleMin.LessEqualDepth,
      side: boxOptions.side ?? threeModuleMin.FrontSide,
      emissive: boxOptions.emissive ?? 0,
      emissiveIntensity: boxOptions.emissiveIntensity ?? 0,
    }),
    smallestBoxDimension = Math.max(Math.min(boxWidth, boxHeight, boxDepth), 0.001),
    boxCornerRadius = Math.min(
      boxOptions.radius ?? smallestBoxDimension * 0.14,
      smallestBoxDimension * 0.45,
      0.08,
    ),
    boxGeometry =
      boxOptions.rounded === false || boxParent.userData.squareEdges
        ? new threeModuleMin.BoxGeometry(boxWidth, boxHeight, boxDepth)
        : new RoundedBoxGeometry(
            boxWidth,
            boxHeight,
            boxDepth,
            boxOptions.segments ?? 2,
            boxCornerRadius,
          ),
    boxMesh = new threeModuleMin.Mesh(boxGeometry, boxMaterial);
  return (
    boxMesh.position.set(boxX, boxY, boxZ),
    (boxMesh.castShadow = boxOptions.castShadow !== false),
    (boxMesh.receiveShadow = boxOptions.receiveShadow !== false),
    (boxMesh.renderOrder = boxOptions.renderOrder ?? 0),
    boxParent.add(boxMesh),
    boxMesh
  );
}

export function addFurnitureAssembly(
  assemblyParent: any,
  assemblyWidth: any,
  assemblyHeight: any,
  assemblyDepth: any,
  assemblyX: any,
  assemblyZ: any,
  assemblyRotationY: any,
  assemblyDarkColor: any,
  assemblyLightColor: any,
) {
  const assemblyGroup = new threeModuleMin.Group(),
    assemblyOffsetFront = assemblyDepth * 0.49,
    assemblyOffsetTop = assemblyDepth * 0.12,
    assemblyOffsetBack = -assemblyHeight * 0.39;
  (addBoxMesh(
    assemblyGroup,
    assemblyWidth * 0.9,
    assemblyOffsetTop,
    assemblyHeight * 0.82,
    0,
    assemblyOffsetFront,
    assemblyHeight * 0.02,
    assemblyDarkColor,
    {
      radius: Math.min(assemblyWidth, assemblyHeight) * 0.06,
      roughness: 0.72,
    },
  ),
    addBoxMesh(
      assemblyGroup,
      assemblyWidth * 0.78,
      assemblyDepth * 0.34,
      assemblyHeight * 0.09,
      0,
      assemblyDepth * 0.78,
      assemblyOffsetBack,
      assemblyDarkColor,
      {
        radius: Math.min(assemblyWidth, assemblyHeight) * 0.045,
        roughness: 0.72,
      },
    ));
  for (const assemblySideOffset of [-0.38, 0.38])
    (addBoxMesh(
      assemblyGroup,
      0.05,
      assemblyDepth * 0.47,
      0.05,
      assemblyWidth * assemblySideOffset,
      assemblyDepth * 0.235,
      assemblyHeight * 0.34,
      assemblyLightColor,
      {
        rounded: false,
      },
    ),
      addBoxMesh(
        assemblyGroup,
        0.05,
        assemblyDepth * 0.94,
        0.05,
        assemblyWidth * assemblySideOffset,
        assemblyDepth * 0.47,
        assemblyOffsetBack,
        assemblyLightColor,
        {
          rounded: false,
        },
      ));
  (assemblyGroup.position.set(assemblyX, 0, assemblyZ),
    (assemblyGroup.rotation.y = assemblyRotationY),
    assemblyParent.add(assemblyGroup));
}
