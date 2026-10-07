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
              (isWarmWood ? "0.92" : "0.85") +
              ", 1.0, wallHeightBlend);\n      diffuseColor.a += diffuseColor.a * (1.0 - diffuseColor.a) * " +
              (isWarmWood ? "0.0" : "0.65") +
              " * (1.0 - wallHeightBlend);\n      #include <opaque_fragment>",
          )));
      }),


      (material.customProgramCacheKey = () =>
        isWarmWood ? "hb-wall-warm-clean-v1" : "hb-wall-height-gradient-v4")),
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
