/** 合并墙带时切分属性数据只需要这三样：原始数组、每顶点分量数、是否归一化。 */
type SlicedAttribute = {
  array: { slice: (start: number, end: number) => ArrayLike<number> };
  itemSize: number;
  normalized: boolean;
};

export function createWallSideMaterial(
  THREE: any,
  materialParams: any,
  enhance = true,
  wallFeatures = "",
  isWarmWood = false,
) {
  const featureSet = new Set(wallFeatures.split(",")),
    material =
      enhance && featureSet.has("shader")
        ? createDedicatedWallMaterial(THREE, materialParams, isWarmWood)
        : new THREE.MeshPhysicalMaterial(materialParams);
  return (
    enhance && featureSet.has("single") && (material.forceSinglePass = true),
    enhance && featureSet.has("depth") && (material.depthWrite = true),
    material.userData.hbDedicatedWall ||
      !enhance ||
      ((material.onBeforeCompile = (shaderObject: any) => {
        ((shaderObject.vertexShader =
          "attribute float hbWallHeight; varying float vHbWallHeight;\n" +
          shaderObject.vertexShader),
          (shaderObject.vertexShader = shaderObject.vertexShader.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvHbWallHeight = hbWallHeight;",
          )),
          (shaderObject.fragmentShader =
            "varying float vHbWallHeight;\n" + shaderObject.fragmentShader),
          (shaderObject.fragmentShader = shaderObject.fragmentShader.replace(
            "#include <opaque_fragment>",


            "\n      float wallHeightBlend = smoothstep(0.0, 0.65, vHbWallHeight);\n      outgoingLight *= mix(" +
              (isWarmWood ? "0.92" : "0.70") +
              ", 1.0, wallHeightBlend);\n      diffuseColor.a += diffuseColor.a * (1.0 - diffuseColor.a) * " +
              (isWarmWood ? "0.0" : "0.65") +
              " * (1.0 - wallHeightBlend);\n      #include <opaque_fragment>",
          )));
      }),


      (material.customProgramCacheKey = () =>
        isWarmWood ? "hb-wall-warm-clean-v1" : "hb-wall-height-gradient-v3")),
    material
  );
}
function createDedicatedWallMaterial(three: any, wallParams: any, isWarmWoodTone = false) {
  const shaderMaterial = new three.ShaderMaterial({
    uniforms: {
      diffuse: {
        value: new three.Color(wallParams.color),
      },
      opacity: {
        value: wallParams.opacity,
      },
    },
    vertexShader:
      "\n      attribute float hbWallHeight;\n      attribute vec2 hbWallCornerDistance;\n      varying float vHbWallHeight;\n      varying vec2 vHbWallCornerDistance;\n      varying vec3 vHbNormal;\n      #include <common>\n      #include <clipping_planes_pars_vertex>\n      void main() {\n        vHbWallHeight = hbWallHeight;\n        vHbWallCornerDistance = hbWallCornerDistance;\n        vHbNormal = normalize(normalMatrix * normal);\n        #include <begin_vertex>\n        #include <project_vertex>\n        #include <clipping_planes_vertex>\n      }",
    fragmentShader:
      "\n      uniform vec3 diffuse;\n      uniform float opacity;\n      uniform mat4 plan2ViewToWorld;\n      varying float vHbWallHeight;\n      varying vec2 vHbWallCornerDistance;\n      varying vec3 vHbNormal;\n      #include <common>\n      #include <clipping_planes_pars_fragment>\n      void main() {\n        #include <clipping_planes_fragment>\n        // These are closed wall volumes. Their opposite surface would show\n        // its displaced bottom edge through the nearer translucent surface.\n        // Keep the camera-facing surface from either side of the wall.\n        if (!gl_FrontFacing) discard;\n        vec3 normal = normalize(vHbNormal) * (gl_FrontFacing ? 1.0 : -1.0);\n        vec3 worldNormal = normalize(mat3(plan2MotionToLayout) * mat3(plan2ViewToWorld) * normal);\n        float up = worldNormal.y * 0.5 + 0.5;\n        float key = max(dot(worldNormal, normalize(vec3(-0.4, 0.85, 0.32))), 0.0);\n        vec3 outgoingLight = diffuse * " +
      (isWarmWoodTone
        ? "mix(vec3(0.98, 0.98, 0.97), vec3(1.0), up) * (0.66 + 0.16 * up + 0.10 * key)"
        : "mix(vec3(0.82, 0.85, 0.91), vec3(1.0), up) * (0.30 + 0.40 * up + 0.18 * key)") +
      ";\n        outgoingLight += mix(diffuse, sqrt(max(diffuse, vec3(0.0))), 0.6) * plan2SurfaceLight(vPlan2WorldPosition) * plan2Gain;\n        // Height changes colour only. Changing coverage as well accentuates\n        // the draw-order boundaries between translucent door/window bands.\n        float wallRootShade = 1.0 - smoothstep(0.0, 0.55, vHbWallHeight);\n        // Retain the wall/light hue with a gentler neutral root tint.\n        outgoingLight *= 1.0 - " +
      (isWarmWoodTone ? "0.14" : "0.54") +
      " * wallRootShade;\n        float cornerDistance = min(vHbWallCornerDistance.x, vHbWallCornerDistance.y);\n        float cornerShade = 1.0 - smoothstep(0.0, 0.24, cornerDistance);\n        outgoingLight *= 1.0 - " +
      (isWarmWoodTone ? "0.08" : "0.28") +
      " * cornerShade;\n        gl_FragColor = vec4(outgoingLight, opacity);\n        #include <tonemapping_fragment>\n        #include <colorspace_fragment>\n      }",
    transparent: wallParams.transparent,
    depthWrite: wallParams.depthWrite ?? true,
    depthFunc: wallParams.depthFunc ?? three.LessEqualDepth,
    side: three.FrontSide,
    forceSinglePass: false,
  });
  return (
    (shaderMaterial.color = new three.Color(wallParams.color)),
    (shaderMaterial.opacity = wallParams.opacity),
    (shaderMaterial.userData.hbDedicatedWall = true),
    (shaderMaterial.defaultAttributeValues.hbWallCornerDistance = [100, 100]),
    (shaderMaterial.customProgramCacheKey = () =>
      isWarmWoodTone
        ? "hb-dedicated-wall-warm-clean-v1"
        : "hb-dedicated-wall-front-corner-balanced-v9"),
    shaderMaterial
  );
}
export function setWallCornerDistances(threeAttributeApi: any, geometry: any, loops: any) {
  const edgeSegments: any[] = [];
  for (const loop of loops) {
    let vertices = loop.filter(
      (point: any, pointIndex: any) =>
        !pointIndex ||
        Math.hypot(point.x - loop[pointIndex - 1].x, point.y - loop[pointIndex - 1].y) > 1e-7,
    );
    (vertices.length > 1 &&
      Math.hypot(vertices[0].x - vertices.at(-1).x, vertices[0].y - vertices.at(-1).y) < 1e-7 &&
      (vertices = vertices.slice(0, -1)),
      (vertices = vertices.filter((currentVertex: any, vertexIndex: any, vertexList: any) => {
        const previousVertex =
            vertexList[(vertexIndex + vertexList.length - 1) % vertexList.length],
          nextVertex = vertexList[(vertexIndex + 1) % vertexList.length],
          edgeToCurrentX = currentVertex.x - previousVertex.x,
          edgeToCurrentY = currentVertex.y - previousVertex.y,
          edgeToNextX = nextVertex.x - currentVertex.x,
          edgeToNextY = nextVertex.y - currentVertex.y;
        return (
          edgeToCurrentX * edgeToNextX + edgeToCurrentY * edgeToNextY <= 0 ||
          Math.abs(edgeToCurrentX * edgeToNextY - edgeToCurrentY * edgeToNextX) >
            0.000001 *
              Math.hypot(edgeToCurrentX, edgeToCurrentY) *
              Math.hypot(edgeToNextX, edgeToNextY)
        );
      })));
    for (let loopIndex = 0; loopIndex < vertices.length; loopIndex++) {
      const vertex = vertices[loopIndex],
        followingVertex = vertices[(loopIndex + 1) % vertices.length],
        edgeLength = Math.hypot(followingVertex.x - vertex.x, followingVertex.y - vertex.y);
      edgeLength > 1e-7 &&
        edgeSegments.push({
          x: vertex.x,
          y: vertex.y,
          tx: (followingVertex.x - vertex.x) / edgeLength,
          ty: (followingVertex.y - vertex.y) / edgeLength,
          length: edgeLength,
        });
    }
  }
  const positionAttribute = geometry.attributes.position,
    normalAttribute = geometry.attributes.normal,
    cornerDistanceBuffer = new Float32Array(positionAttribute.count * 2).fill(100);
  for (let vertexCursor = 0; vertexCursor < positionAttribute.count; vertexCursor++) {
    if (!normalAttribute || Math.abs(normalAttribute.getZ(vertexCursor)) > 0.5) continue;
    let bestDistance = Infinity;
    for (const edge of edgeSegments) {
      const offsetX = positionAttribute.getX(vertexCursor) - edge.x,
        offsetY = positionAttribute.getY(vertexCursor) - edge.y,
        alongEdge = offsetX * edge.tx + offsetY * edge.ty,
        distanceScore =
          Math.abs(offsetX * edge.ty - offsetY * edge.tx) +
          Math.max(-alongEdge, 0, alongEdge - edge.length) +
          Math.abs(
            normalAttribute.getX(vertexCursor) * edge.tx +
              normalAttribute.getY(vertexCursor) * edge.ty,
          );
      distanceScore < bestDistance &&
        ((bestDistance = distanceScore),
        (cornerDistanceBuffer[vertexCursor * 2] = Math.max(0, Math.min(edge.length, alongEdge))),
        (cornerDistanceBuffer[vertexCursor * 2 + 1] =
          edge.length - cornerDistanceBuffer[vertexCursor * 2]));
    }
  }
  geometry.setAttribute(
    "hbWallCornerDistance",
    new threeAttributeApi.BufferAttribute(cornerDistanceBuffer, 2),
  );
}
export function mergeWallBands(threeApi: any, wallBandNode: any, mergeGeometries: any) {
  const meshesBySignature = new Map();
  for (const bandMesh of wallBandNode.children) {
    if (!bandMesh.userData.hbMergeWallBand || !Array.isArray(bandMesh.material)) continue;
    const bandMaterial = bandMesh.material[1],
      materialSignature = JSON.stringify([
        bandMaterial.type,
        bandMaterial.color.getHex(),
        bandMaterial.opacity,
        bandMaterial.depthWrite,
        bandMaterial.depthFunc,
        bandMaterial.side,
        bandMaterial.forceSinglePass,
        bandMaterial.transparent,
        bandMesh.layers.mask,
        bandMesh.castShadow,
        bandMesh.receiveShadow,
        bandMesh.renderOrder,
      ]);
    (meshesBySignature.has(materialSignature) || meshesBySignature.set(materialSignature, []),
      meshesBySignature.get(materialSignature).push(bandMesh));
  }
  for (const bandMeshGroup of meshesBySignature.values()) {
    if (bandMeshGroup.length < 2) continue;
    const geometryParts: any[] = [];
    for (const sourceMesh of bandMeshGroup) {
      sourceMesh.updateMatrix();
      const nonIndexedGeometry = sourceMesh.geometry.index
        ? sourceMesh.geometry.toNonIndexed()
        : sourceMesh.geometry;
      for (const geometryGroup of nonIndexedGeometry.groups.filter(
        (groupEntry: any) => groupEntry.materialIndex === 1,
      )) {
        const sliceGeometry = new threeApi.BufferGeometry();
        for (const [attributeName, attributeEntry] of Object.entries(
          nonIndexedGeometry.attributes,
        )) {
          const attribute = attributeEntry as SlicedAttribute;
          sliceGeometry.setAttribute(
            attributeName,
            new threeApi.BufferAttribute(
              attribute.array.slice(
                geometryGroup.start * attribute.itemSize,
                (geometryGroup.start + geometryGroup.count) * attribute.itemSize,
              ),
              attribute.itemSize,
              attribute.normalized,
            ),
          );
        }
        (sliceGeometry.applyMatrix4(sourceMesh.matrix), geometryParts.push(sliceGeometry));
      }
      nonIndexedGeometry !== sourceMesh.geometry && nonIndexedGeometry.dispose();
    }
    const mergedGeometry = geometryParts.length ? mergeGeometries(geometryParts, false) : null;
    for (const partGeometry of geometryParts) partGeometry.dispose();
    if (!mergedGeometry) continue;
    (mergedGeometry.computeBoundingBox(), mergedGeometry.computeBoundingSphere());
    const representativeMesh = bandMeshGroup[0],
      sharedMaterial = representativeMesh.material[1],
      mergedMesh = new threeApi.Mesh(mergedGeometry, sharedMaterial);
    ((mergedMesh.userData = {
      ...representativeMesh.userData,
      hbMergedWallCount: bandMeshGroup.length,
      regionReceiverKind: "wall",
    }),
      (mergedMesh.layers.mask = representativeMesh.layers.mask),
      (mergedMesh.renderOrder = representativeMesh.renderOrder),
      (mergedMesh.castShadow = representativeMesh.castShadow),
      (mergedMesh.receiveShadow = representativeMesh.receiveShadow));
    const disposedMaterialSet = new Set();
    for (const oldBandMesh of bandMeshGroup) {
      (wallBandNode.remove(oldBandMesh), oldBandMesh.geometry.dispose());
      for (const meshMaterial of oldBandMesh.material)
        meshMaterial !== sharedMaterial &&
          !disposedMaterialSet.has(meshMaterial) &&
          (disposedMaterialSet.add(meshMaterial), meshMaterial.dispose());
    }
    wallBandNode.add(mergedMesh);
  }
}
export function setWallGradientHeight(threeModule: any, meshGeometry: any, axis: any, offset: any, scale: any, heightSpan: any) {
  const wallPositionAttribute = meshGeometry.attributes.position,
    heightBuffer = new Float32Array(wallPositionAttribute.count),
    clampedHeightSpan = Math.max(0.01, heightSpan);
  for (
    let heightVertexIndex = 0;
    heightVertexIndex < wallPositionAttribute.count;
    heightVertexIndex++
  ) {
    const axisValue =
      axis === "z"
        ? wallPositionAttribute.getZ(heightVertexIndex)
        : wallPositionAttribute.getY(heightVertexIndex);
    heightBuffer[heightVertexIndex] = Math.max(
      0,
      Math.min(1, (offset + scale * axisValue) / clampedHeightSpan),
    );
  }
  meshGeometry.setAttribute("hbWallHeight", new threeModule.BufferAttribute(heightBuffer, 1));
}

/** 墙面侧序用到的 three 构造器/常量（只列用到的成员，避免把整包 three 类型引进材质层）。 */
type WallSideThreeApi = {
  Vector3: new () => WallSideVector;
  Vector4: new (x?: number, y?: number, z?: number, w?: number) => WallSideVector;
  Matrix4: new () => WallSideMatrix;
  BufferAttribute: new (array: Float32Array | Uint16Array | Uint32Array, itemSize: number) => WallSideIndexAttribute;
  DynamicDrawUsage: unknown;
  DoubleSide: number;
  BackSide: number;
};
type WallSideVector = {
  x: number;
  y: number;
  z: number;
  w: number;
  fromBufferAttribute(attribute: WallSidePositionAttribute, index: number): WallSideVector;
  sub(vector: WallSideVector): WallSideVector;
  cross(vector: WallSideVector): WallSideVector;
  dot(vector: WallSideVector): number;
  copy(vector: WallSideVector): WallSideVector;
  set(x: number, y: number, z: number, w: number): WallSideVector;
  applyMatrix4(matrix: WallSideMatrix): WallSideVector;
  multiplyScalar(scale: number): WallSideVector;
  equals(vector: WallSideVector): boolean;
};
type WallSideMatrix = {
  elements: ArrayLike<number>;
  equals(matrix: WallSideMatrix): boolean;
  copy(matrix: WallSideMatrix): WallSideMatrix;
  invert(): WallSideMatrix;
};
type WallSideIndexAttribute = {
  array: Float32Array | Uint16Array | Uint32Array;
  byteLength: number;
  needsUpdate: boolean;
  setUsage(usage: unknown): WallSideIndexAttribute;
};
type WallSidePositionAttribute = {
  count: number;
  version: number;
  isInterleavedBufferAttribute?: boolean;
  getX(index: number): number;
  getY(index: number): number;
  getZ(index: number): number;
};
type WallSideCamera = {
  matrixWorld: WallSideMatrix;
  projectionMatrixInverse: WallSideMatrix;
  isOrthographicCamera?: boolean;
};
type WallSideSideMaterial = {
  isMeshPhysicalMaterial?: boolean;
  transparent?: boolean;
  normalMap?: unknown;
  bumpMap?: unknown;
  displacementMap?: unknown;
  wireframe?: boolean;
  side?: number;
  forceSinglePass?: boolean;
};
type WallSideGroup = { materialIndex: number; start: number; count: number };
type WallSideOrderGeometry = {
  index: unknown;
  attributes: { position: WallSidePositionAttribute };
  groups: WallSideGroup[];
  drawRange: { start: number; count: number };
  setIndex(index: unknown): void;
  addEventListener(type: "dispose", listener: () => void): void;
  removeEventListener(type: "dispose", listener: () => void): void;
};
type WallSideOrderMesh = {
  geometry: WallSideOrderGeometry;
  material?: WallSideSideMaterial[];
  userData: Record<string, unknown>;
  matrixWorld: WallSideMatrix;
  onBeforeRender?: (
    renderer: unknown,
    scene: unknown,
    camera: WallSideCamera,
    geometry: WallSideOrderGeometry,
    material: WallSideSideMaterial,
    group?: WallSideGroup,
  ) => void;
};
type WallSideOrderStats = { sorts: number; checks: number; bytes: number };
type WallSideCameraSpace = {
  world: WallSideMatrix;
  projection: WallSideMatrix;
  point: WallSideVector;
  ready: boolean;
};

/** 相机空间的缓存键：默认就是相机本身（上游 `M2` 的同义实现）。 */
const wallSideCameraSpaces = new WeakMap<object, WallSideCameraSpace>();

/**
 * 墙面侧序（0.8.1 `prepareWallSideOrder`）。
 *
 * 合并后的墙带把左右两侧的三角形放在**同一个 geometry** 里；半透明时谁先画由
 * 相机决定，而三角形顺序是固定的 —— 站到墙背面看，近侧的墙会被远侧的墙挡住，
 * 表现为「墙面一层雾」。上游的做法是每帧按相机侧写重排 index buffer：
 *
 * - 用三角形平面方程判断该面朝向相机还是背向相机；
 * - 背向的先写、朝向的后写（半透明走 back-to-front）；
 * - 相机位置没变且朝向集合没变时直接返回，只有真正需要时才 `needsUpdate`；
 * - 只要进入重排就必须同时把材质的 `forceSinglePass` 打开（否则 three 会再画一遍
 *   背面，重排就失去意义），离开时恢复。
 *
 * 返回 `null` 表示这个网格不满足条件（不透明 / 非合并墙带 / 已有索引），调用方
 * 不需要记录状态。
 */
export function prepareWallSideOrder(
  threeApi: WallSideThreeApi,
  mesh: WallSideOrderMesh,
  sorter: (
    mesh: WallSideOrderMesh,
    camera: WallSideCamera,
    renderer: unknown,
  ) => WallSideCamera = (_mesh, camera) => camera,
): WallSideOrderStats | null {
  const geometry = mesh.geometry,
    sideMaterial = mesh.material?.[1],
    positionAttribute = geometry?.attributes?.position,
    sideGroup = geometry?.groups?.find((group) => group.materialIndex === 1);
  if (
    !mesh.userData.hbMergeWallBand ||
    !sideMaterial?.isMeshPhysicalMaterial ||
    !sideMaterial.transparent ||
    sideMaterial.side !== threeApi.DoubleSide ||
    sideMaterial.forceSinglePass ||
    geometry.index ||
    !positionAttribute ||
    positionAttribute.isInterleavedBufferAttribute ||
    !sideGroup ||
    sideGroup.start % 3 ||
    sideGroup.count % 3 ||
    sideGroup.start + sideGroup.count > positionAttribute.count
  )
    return null;
  const positionVersion = positionAttribute.version,
    triangleCount = sideGroup.count / 3,
    groupStart = sideGroup.start,
    groupEnd = groupStart + sideGroup.count;
  let planeCoefficients = new Float64Array(triangleCount * 4),
    frontFacing = new Uint8Array(triangleCount);
  const firstCorner = new threeApi.Vector3(),
    edgeA = new threeApi.Vector3(),
    edgeB = new threeApi.Vector3();
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
    const vertexStart = groupStart + triangleIndex * 3,
      coefficientStart = triangleIndex * 4;
    (firstCorner.fromBufferAttribute(positionAttribute, vertexStart),
      edgeA.fromBufferAttribute(positionAttribute, vertexStart + 1).sub(firstCorner),
      edgeB.fromBufferAttribute(positionAttribute, vertexStart + 2).sub(firstCorner),
      edgeA.cross(edgeB),
      (planeCoefficients[coefficientStart] = edgeA.x),
      (planeCoefficients[coefficientStart + 1] = edgeA.y),
      (planeCoefficients[coefficientStart + 2] = edgeA.z),
      (planeCoefficients[coefficientStart + 3] = -edgeA.dot(firstCorner)));
  }
  const indexArray =
      positionAttribute.count > 65535
        ? new Uint32Array(positionAttribute.count)
        : new Uint16Array(positionAttribute.count);
  for (let index = 0; index < indexArray.length; index++) indexArray[index] = index;
  const indexAttribute = new threeApi.BufferAttribute(indexArray, 1).setUsage(
    threeApi.DynamicDrawUsage,
  );
  geometry.setIndex(indexAttribute);
  const previousOnBeforeRender = mesh.onBeforeRender,
    worldToLocal = new threeApi.Matrix4(),
    cameraPoint = new threeApi.Vector4(1 / 0, 1 / 0, 1 / 0, 1 / 0),
    lastCameraPoint = new threeApi.Vector4(1 / 0, 1 / 0, 1 / 0, 1 / 0),
    stats: WallSideOrderStats = {
      sorts: 0,
      checks: 0,
      bytes: indexArray.byteLength + planeCoefficients.byteLength + frontFacing.byteLength,
    };
  let firstRun = true,
    reordered = false,
    disposed = false;

  function restoreOrder(material: WallSideSideMaterial) {
    if (((material.forceSinglePass = false), reordered)) {
      for (let index = groupStart; index < groupEnd; index++) indexArray[index] = index;
      indexAttribute.needsUpdate = true;
    }
    ((reordered = false), (firstRun = true));
  }

  function handleBeforeRender(
    this: unknown,
    renderer: unknown,
    scene: unknown,
    camera: WallSideCamera,
    renderedGeometry: WallSideOrderGeometry,
    material: WallSideSideMaterial,
    group?: WallSideGroup,
  ) {
    previousOnBeforeRender?.call(mesh, renderer, scene, camera, renderedGeometry, material, group);
    if (disposed || group?.materialIndex !== 1) return;
    if (
      renderedGeometry !== geometry ||
      geometry.index !== indexAttribute ||
      geometry.attributes.position !== positionAttribute ||
      positionAttribute.version !== positionVersion ||
      group.start !== groupStart ||
      group.count !== groupEnd - groupStart ||
      geometry.drawRange.start !== 0 ||
      geometry.drawRange.count !== 1 / 0 ||
      !material.isMeshPhysicalMaterial ||
      !material.transparent ||
      material.normalMap ||
      material.bumpMap ||
      material.displacementMap ||
      material.wireframe ||
      (material.side !== threeApi.DoubleSide && material.side !== threeApi.BackSide)
    ) {
      restoreOrder(material);
      return;
    }
    const cameraSpaceKey = sorter(mesh, camera, renderer);
    let cameraSpace = wallSideCameraSpaces.get(cameraSpaceKey);
    if (!cameraSpace) {
      ((cameraSpace = {
        world: new threeApi.Matrix4(),
        projection: new threeApi.Matrix4(),
        point: new threeApi.Vector4(),
        ready: false,
      }),
        wallSideCameraSpaces.set(cameraSpaceKey, cameraSpace));
    }
    if (
      !cameraSpace.ready ||
      !cameraSpace.world.equals(cameraSpaceKey.matrixWorld) ||
      !cameraSpace.projection.equals(cameraSpaceKey.projectionMatrixInverse)
    ) {
      (cameraSpace.world.copy(cameraSpaceKey.matrixWorld),
        cameraSpace.projection.copy(cameraSpaceKey.projectionMatrixInverse),
        (cameraSpace.ready = true),
        cameraSpace.point
          .set(0, 0, 1, 0)
          .applyMatrix4(cameraSpaceKey.projectionMatrixInverse)
          .applyMatrix4(cameraSpaceKey.matrixWorld),
        cameraSpaceKey.isOrthographicCamera
          ? cameraSpace.point.multiplyScalar(-1)
          : cameraSpace.point.w && cameraSpace.point.multiplyScalar(1 / cameraSpace.point.w));
    }
    cameraPoint
      .copy(cameraSpace.point)
      .applyMatrix4(worldToLocal.copy(mesh.matrixWorld).invert());
    if (
      !Number.isFinite(cameraPoint.x) ||
      !Number.isFinite(cameraPoint.y) ||
      !Number.isFinite(cameraPoint.z) ||
      !Number.isFinite(cameraPoint.w)
    ) {
      restoreOrder(material);
      return;
    }
    if (((material.forceSinglePass = true), (reordered = true), !firstRun && lastCameraPoint.equals(cameraPoint)))
      return;
    (lastCameraPoint.copy(cameraPoint), stats.checks++);
    let facingChanged = firstRun,
      backFacingCount = 0;
    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
      const coefficientStart = triangleIndex * 4,
        isFrontFacing =
          planeCoefficients[coefficientStart] * cameraPoint.x +
            planeCoefficients[coefficientStart + 1] * cameraPoint.y +
            planeCoefficients[coefficientStart + 2] * cameraPoint.z +
            planeCoefficients[coefficientStart + 3] * cameraPoint.w >
          0
            ? 1
            : 0;
      (isFrontFacing !== frontFacing[triangleIndex] && (facingChanged = true),
        (frontFacing[triangleIndex] = isFrontFacing),
        isFrontFacing || backFacingCount++);
    }
    if (((firstRun = false), !facingChanged)) return;
    let backWrite = groupStart,
      frontWrite = groupStart + backFacingCount * 3;
    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
      let writeIndex = frontFacing[triangleIndex] ? frontWrite : backWrite;
      const sourceIndex = groupStart + triangleIndex * 3;
      ((indexArray[writeIndex++] = sourceIndex),
        (indexArray[writeIndex++] = sourceIndex + 1),
        (indexArray[writeIndex] = sourceIndex + 2),
        frontFacing[triangleIndex] ? (frontWrite += 3) : (backWrite += 3));
    }
    ((indexAttribute.needsUpdate = true), stats.sorts++);
  }

  function handleDispose() {
    ((disposed = true),
      mesh.onBeforeRender === handleBeforeRender &&
        (mesh.onBeforeRender = previousOnBeforeRender),
      geometry.removeEventListener("dispose", handleDispose),
      sideMaterial && (sideMaterial.forceSinglePass = false),
      (planeCoefficients = new Float64Array(0)),
      (frontFacing = new Uint8Array(0)));
  }

  ((mesh.onBeforeRender = handleBeforeRender),
    geometry.addEventListener("dispose", handleDispose));
  return stats;
}
