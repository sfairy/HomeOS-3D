/**
 * 接触阴影的地面支撑层探测。
 *
 * 从 `studio-plan2-contact-shadows.ts` 拆出来的纯几何部分：把一层楼里所有可作
 * 投影接收面的三角形按高度聚成若干「支撑层」，供接触阴影选最近的落地高度。
 * 只吃 threeApi 与 mesh 列表，不碰渲染器状态，拆开之后那边就只剩生命周期了。
 */

export function findUserFieldInAncestors(startObject: any, userFieldKey: any) {
  for (let ancestorObject = startObject; ancestorObject; ancestorObject = ancestorObject.parent)
    if (ancestorObject.userData?.[userFieldKey] !== undefined) return ancestorObject.userData[userFieldKey]
}
export function isVisibleWithAncestors(rootObject3d: any) {
  for (let ancestorNode = rootObject3d; ancestorNode; ancestorNode = ancestorNode.parent)
    if (!ancestorNode.visible) return false
  return true
}
export function isContactCasterMaterial(candidateMaterial: any) {
  return !!(
    candidateMaterial &&
    candidateMaterial.visible !== false &&
    candidateMaterial.opacity >= 0.98 &&
    !(candidateMaterial.transmission > 0) &&
    (!candidateMaterial.transparent || candidateMaterial.alphaTest > 0)
  )
}

export function computeSurfaceLevels(threeApi: any, meshList: any, floorY: any, levelLimit = 32) {
  const map = new Map(),
    vector = new threeApi.Vector3(),
    vertexB = new threeApi.Vector3(),
    vertexC = new threeApi.Vector3(),
    edgeAB = new threeApi.Vector3(),
    edgeAC = new threeApi.Vector3(),
    faceNormal = new threeApi.Vector3(),
    meshMatrix = new threeApi.Matrix4(),
    instanceMatrix = new threeApi.Matrix4()
  for (const mesh of meshList) {
    const material = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (
      material.length &&
      material.every((materialEntry: any) => materialEntry?.userData?.plan2SurfaceContact === false)
    )
      continue
    const geometry = mesh.geometry,
      positionAttribute = geometry?.attributes?.position
    if (!positionAttribute) continue
    const index = geometry.index,
      count = index?.count ?? positionAttribute.count,
      start = geometry.drawRange.start,
      min = Math.min(count, start + geometry.drawRange.count)
    for (let num = 0; num < (mesh.isInstancedMesh ? mesh.count : 1); num++) {
      meshMatrix.copy(mesh.matrixWorld),
        mesh.isInstancedMesh && (mesh.getMatrixAt(num, instanceMatrix), meshMatrix.multiply(instanceMatrix))
      for (let vertexCursor = start; vertexCursor + 2 < min; vertexCursor += 3) {
        vector
          .fromBufferAttribute(positionAttribute, index ? index.getX(vertexCursor) : vertexCursor)
          .applyMatrix4(meshMatrix),
          vertexB
            .fromBufferAttribute(positionAttribute, index ? index.getX(vertexCursor + 1) : vertexCursor + 1)
            .applyMatrix4(meshMatrix),
          vertexC
            .fromBufferAttribute(positionAttribute, index ? index.getX(vertexCursor + 2) : vertexCursor + 2)
            .applyMatrix4(meshMatrix),
          faceNormal.crossVectors(edgeAB.subVectors(vertexB, vector), edgeAC.subVectors(vertexC, vector))
        const triangleArea = faceNormal.length() * 0.5,
          surfaceHeight = (vector.y + vertexB.y + vertexC.y) / 3 - floorY,
          minSurfaceHeight = mesh.userData?.regionReceiverKind === 'floor' ? 0.015 : 0.12
        if (triangleArea < 0.004 || faceNormal.y < triangleArea * 1.9998 || surfaceHeight <= minSurfaceHeight) continue
        const round = Math.round(surfaceHeight * 100),
          options = map.get(round) || {
            height: 0,
            area: 0,
            top: -Infinity,
          }
        ;(options.height += surfaceHeight * triangleArea),
          (options.area += triangleArea),
          (options.top = Math.max(options.top, vector.y - floorY, vertexB.y - floorY, vertexC.y - floorY)),
          map.set(round, options)
      }
    }
  }
  return [...map.values()]
    .sort((levelA, levelB) => levelB.area - levelA.area)
    .slice(0, levelLimit)
    .map((levelEntry) => ({
      height: levelEntry.height / levelEntry.area,
      top: levelEntry.top,
    }))
    .sort((levelLeft, levelRight) => levelLeft.height - levelRight.height)
}
