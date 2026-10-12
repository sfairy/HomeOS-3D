/** 洁具（马桶）**压型轮廓**几何：由分节断面 + 圆弧扫掠出盆体。
 *
 * 从 `../studio/studio-app.ts` 的巨型闭包中抽出（P4 拆单体）：纯函数（只读入参 → 新几何），无闭包依赖。
 */
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";

export function buildPressProfile(pressWidth: any, pressDepth: any, pressHeight: any) {
  const pressProfileSections = [
      {
        y: 0,
        halfWidth: pressWidth * 0.31,
        backZ: -pressDepth * 0.16,
        sideZ: pressDepth * 0.08,
        frontZ: pressDepth * 0.46,
      },
      {
        y: pressHeight * 0.42,
        halfWidth: pressWidth * 0.43,
        backZ: -pressDepth * 0.34,
        sideZ: pressDepth * 0.08,
        frontZ: pressDepth * 0.47,
      },
      {
        y: pressHeight * 0.72,
        halfWidth: pressWidth * 0.49,
        backZ: -pressDepth * 0.47,
        sideZ: pressDepth * 0.08,
        frontZ: pressDepth * 0.47,
      },
    ],
    mapPressSection = (pressSection: any) => {
      const pressSectionPoints = [
        new threeModuleMin.Vector3(-pressSection.halfWidth, pressSection.y, pressSection.backZ),
        new threeModuleMin.Vector3(pressSection.halfWidth, pressSection.y, pressSection.backZ),
        new threeModuleMin.Vector3(pressSection.halfWidth, pressSection.y, pressSection.sideZ),
      ];
      for (let arcPointIndex = 1; arcPointIndex <= 18; arcPointIndex += 1) {
        const arcAngleRad = (arcPointIndex / 18) * Math.PI;
        pressSectionPoints.push(
          new threeModuleMin.Vector3(
            Math.cos(arcAngleRad) * pressSection.halfWidth,
            pressSection.y,
            pressSection.sideZ + Math.sin(arcAngleRad) * (pressSection.frontZ - pressSection.sideZ),
          ),
        );
      }
      return pressSectionPoints;
    },
    pressProfilePoints = pressProfileSections.map(mapPressSection),
    sectionPointCount = pressProfilePoints[0].length,
    flatMap = pressProfilePoints.flatMap((profileSection) =>
      profileSection.flatMap((profilePoint) => [profilePoint.x, profilePoint.y, profilePoint.z]),
    ),
    pressProfileIndices: any[] = [];
  for (
    let profileRowIndex = 0;
    profileRowIndex < pressProfilePoints.length - 1;
    profileRowIndex += 1
  ) {
    const rowStartIndex = profileRowIndex * sectionPointCount,
      nextRowStartIndex = (profileRowIndex + 1) * sectionPointCount;
    for (
      let profileColumnIndex = 0;
      profileColumnIndex < sectionPointCount;
      profileColumnIndex += 1
    ) {
      const nextColumnIndex = (profileColumnIndex + 1) % sectionPointCount,
        quadIndexA = rowStartIndex + profileColumnIndex,
        quadIndexB = rowStartIndex + nextColumnIndex,
        quadIndexC = nextRowStartIndex + profileColumnIndex,
        quadIndexD = nextRowStartIndex + nextColumnIndex;
      pressProfileIndices.push(
        quadIndexA,
        quadIndexD,
        quadIndexB,
        quadIndexA,
        quadIndexC,
        quadIndexD,
      );
    }
  }
  const capStartIndex = flatMap.length / 3;
  flatMap.push(0, pressProfileSections[0].y, pressDepth * 0.08);
  const capEndIndex = flatMap.length / 3;
  flatMap.push(0, pressProfileSections.at(-1)!.y, pressDepth * 0.08);
  const capEndOffset = (pressProfilePoints.length - 1) * sectionPointCount;
  for (let capIndex = 0; capIndex < sectionPointCount; capIndex += 1) {
    const capNextIndex = (capIndex + 1) % sectionPointCount;
    (pressProfileIndices.push(capStartIndex, capIndex, capNextIndex),
      pressProfileIndices.push(capEndIndex, capEndOffset + capNextIndex, capEndOffset + capIndex));
  }
  const pressGeometry = new threeModuleMin.BufferGeometry();
  return (
    pressGeometry.setAttribute("position", new threeModuleMin.Float32BufferAttribute(flatMap, 3)),
    pressGeometry.setIndex(pressProfileIndices),
    pressGeometry.computeVertexNormals(),
    pressGeometry.computeBoundingSphere(),
    pressGeometry
  );
}
