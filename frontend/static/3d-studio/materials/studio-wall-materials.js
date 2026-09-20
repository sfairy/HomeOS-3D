/**
 * 墙体材质与墙带几何属性工具。
 *
 * 位置：3D 工作室生成墙体（含门窗上下的墙带）时使用，决定墙面的着色方式与
 *   「墙脚偏暗、越高越亮」的渐变效果；同一套材质也会被平面二期的光照函数复用。
 * 对外：createWallSideMaterial（墙体材质）、createDedicatedWallMaterial 为内部实现，
 *   setWallCornerDistances / setWallGradientHeight / mergeWallBands 三个几何工具。
 * 约定：材质通过自定义顶点属性与几何绑定 —— hbWallHeight 为归一化的墙高，
 *   hbWallCornerDistance 为顶点到最近墙体棱边的沿边距离；wallFeatures 是逗号分隔的
 *   特性串（shader / single / depth），由调用方按渲染需要拼出。
 * 注意：注入的 GLSL 字符串里保留了原有英文注释 —— 它们属于字符串内容，改动即改变
 *   着色器源码，因此按原文保留。
 */

/**
 * 创建一面墙的材质。
 */
export function createWallSideMaterial(
  THREE,
  materialParams,
  enhance = true,
  wallFeatures = "",
  isWarmWood = false
) {
  // 特性串用 Set 查询：下面每个特性都要判断一次，线性查找会随特性数退化。
  const featureSet = new Set(wallFeatures.split(","));
  const material =
    enhance && featureSet.has("shader")
      ? createDedicatedWallMaterial(THREE, materialParams, isWarmWood)
      : new THREE.MeshPhysicalMaterial(materialParams);
  // 强制单遍渲染：three.js 对半透明双面材质默认会渲染两遍（正、背面各一次），
  // 墙面色块重叠时会出现颜色加倍，这里显式关掉。
  if (enhance && featureSet.has("single")) {
    material.forceSinglePass = true;
  }
  // 强制写深度：墙体参与遮挡关系，若沿用半透明的默认设置会导致后面的物件透出来。
  if (enhance && featureSet.has("depth")) {
    material.depthWrite = true;
  }
  // 专用墙体材质已自带渐变与背面处理，无需再注入；只有通用 PBR 材质才需要这段包装。
  if (!material.userData.hbDedicatedWall && !!enhance) {
    // 注入墙高渐变：顶点属性 hbWallHeight 透传到片元，用于压暗墙脚。
    material.onBeforeCompile = shaderObject => {
      shaderObject.vertexShader =
        "attribute float hbWallHeight; varying float vHbWallHeight;\n" + shaderObject.vertexShader;
      shaderObject.vertexShader = shaderObject.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvHbWallHeight = hbWallHeight;"
      );
      shaderObject.fragmentShader = "varying float vHbWallHeight;\n" + shaderObject.fragmentShader;
      // 闭合的半透明体：把背面丢弃，否则当调用方把 side 留作 DoubleSide 时，
      // 它会透过离观察者更近的那个表面显出来。
      shaderObject.fragmentShader = shaderObject.fragmentShader.replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif (!gl_FrontFacing) discard;"
      );
      shaderObject.fragmentShader = shaderObject.fragmentShader.replace(
        "#include <opaque_fragment>",
        // 暖阳下墙面提亮到几乎不压暗（0.92），且完全不做透明度补偿 ——
        // 墙脚被压暗会让浅色木调显得脏；默认主题沿用 0.70 与 0.65 的补偿。
        "\n      float wallHeightBlend = smoothstep(0.0, 0.65, vHbWallHeight);\n      outgoingLight *= mix(" +
          (isWarmWood ? "0.92" : "0.70") +
          ", 1.0, wallHeightBlend);\n      diffuseColor.a += diffuseColor.a * (1.0 - diffuseColor.a) * " +
          (isWarmWood ? "0.0" : "0.65") +
          " * (1.0 - wallHeightBlend);\n      #include <opaque_fragment>"
      );
    };
    // 着色器源码一变就要换缓存键，否则升级后浏览器仍会复用旧编译结果。
    // 两个键都带 -frontface：本仓库的注入比上游多一句正面剔除（见上面的修复）；
    // 暖色分支因此不能直接沿用上游的 hb-wall-warm-clean-v1，否则含义对不上源码。
    material.customProgramCacheKey = () =>
      isWarmWood ? "hb-wall-warm-clean-v1-frontface" : "hb-wall-height-gradient-v4-frontface";
  }
  return material;
}
/**
 * 创建专用墙体材质（自定义 ShaderMaterial）。
 *
 * 相比通用 PBR 材质的注入方案，这里可以直接调用平面二期的表面光照函数
 * （plan2SurfaceLight / plan2Gain），让墙面与其他二期物件共用同一套光照口径，
 * 代价是必须自己接管法线、裁剪面与色彩空间等全部流程。
 */
function createDedicatedWallMaterial(three, wallParams, isWarmWood = false) {
  // 顶点侧只需要透传墙高与角距，法线在世界空间里算好传给片元；
  // 片元侧按「天光 + key 光 + 墙脚/墙角压暗」组合出墙面亮度。
  const shaderMaterial = new three.ShaderMaterial({
    uniforms: {
      diffuse: {
        value: new three.Color(wallParams.color)
      },
      opacity: {
        value: wallParams.opacity
      }
    },
    vertexShader:
      "\n      attribute float hbWallHeight;\n      attribute vec2 hbWallCornerDistance;\n      varying float vHbWallHeight;\n      varying vec2 vHbWallCornerDistance;\n      varying vec3 vHbNormal;\n      #include <common>\n      #include <clipping_planes_pars_vertex>\n      void main() {\n        vHbWallHeight = hbWallHeight;\n        vHbWallCornerDistance = hbWallCornerDistance;\n        vHbNormal = normalize(normalMatrix * normal);\n        #include <begin_vertex>\n        #include <project_vertex>\n        #include <clipping_planes_vertex>\n      }",
    fragmentShader:
      "\n      uniform vec3 diffuse;\n      uniform float opacity;\n      uniform mat4 plan2ViewToWorld;\n      varying float vHbWallHeight;\n      varying vec2 vHbWallCornerDistance;\n      varying vec3 vHbNormal;\n      #include <common>\n      #include <clipping_planes_pars_fragment>\n      void main() {\n        #include <clipping_planes_fragment>\n        // These are closed wall volumes. Their opposite surface would show\n        // its displaced bottom edge through the nearer translucent surface.\n        // Keep the camera-facing surface from either side of the wall.\n        if (!gl_FrontFacing) discard;\n        vec3 normal = normalize(vHbNormal) * (gl_FrontFacing ? 1.0 : -1.0);\n        vec3 worldNormal = normalize(mat3(plan2MotionToLayout) * mat3(plan2ViewToWorld) * normal);\n        float up = worldNormal.y * 0.5 + 0.5;\n        float key = max(dot(worldNormal, normalize(vec3(-0.4, 0.85, 0.32))), 0.0);\n        vec3 outgoingLight = diffuse * " +
      // 暖阳下墙面整体提亮：天光基色更接近白、权重更高，key 光只留一点方向感。
      (isWarmWood
        ? "mix(vec3(0.98, 0.98, 0.97), vec3(1.0), up) * (0.66 + 0.16 * up + 0.10 * key)"
        : "mix(vec3(0.82, 0.85, 0.91), vec3(1.0), up) * (0.30 + 0.40 * up + 0.18 * key)") +
      ";\n        outgoingLight += mix(diffuse, sqrt(max(diffuse, vec3(0.0))), 0.6) * plan2SurfaceLight(vPlan2WorldPosition) * plan2Gain;\n        // Height changes colour only. Changing coverage as well accentuates\n        // the draw-order boundaries between translucent door/window bands.\n        float wallRootShade = 1.0 - smoothstep(0.0, 0.55, vHbWallHeight);\n        // Retain the wall/light hue with a gentler neutral root tint.\n        outgoingLight *= 1.0 - " +
      // 暖阳下墙脚几乎不压暗（0.14 对 0.54），否则浅色墙面底部会拖出一条灰带。
      (isWarmWood ? "0.14" : "0.54") +
      " * wallRootShade;\n        float cornerDistance = min(vHbWallCornerDistance.x, vHbWallCornerDistance.y);\n        float cornerShade = 1.0 - smoothstep(0.0, 0.24, cornerDistance);\n        outgoingLight *= 1.0 - " +
      // 墙角同理：0.08 只保留一点转折暗示。
      (isWarmWood ? "0.08" : "0.28") +
      " * cornerShade;\n        gl_FragColor = vec4(outgoingLight, opacity);\n        #include <tonemapping_fragment>\n        #include <colorspace_fragment>\n      }",
    transparent: wallParams.transparent,
    depthWrite: wallParams.depthWrite ?? true,
    depthFunc: wallParams.depthFunc ?? three.LessEqualDepth,
    side: three.FrontSide,
    forceSinglePass: false
  });
  // 额外挂上 color / opacity 字段：上层可能按普通材质的方式读改颜色，
  // 这里保持同一套字段名以免出现「改了不生效」。
  shaderMaterial.color = new three.Color(wallParams.color);
  shaderMaterial.opacity = wallParams.opacity;
  shaderMaterial.userData.hbDedicatedWall = true;
  // 未提供 hbWallCornerDistance 的几何（例如简易墙面）用 [100, 100] 兜底，
  // 两个分量都远大于生效区间，等价于「离所有墙角都很远」，不产生墙角阴影。
  shaderMaterial.defaultAttributeValues.hbWallCornerDistance = [100, 100];
  // 固定缓存键：专用墙体着色器源码唯一，所有墙面共用一份已编译的程序。
  // 暖色分支的源码与默认分支不同（见上面的条件拼接），必须各用各的键。
  shaderMaterial.customProgramCacheKey = () =>
    isWarmWood ? "hb-dedicated-wall-warm-clean-v1" : "hb-dedicated-wall-front-corner-balanced-v9";
  return shaderMaterial;
}
/**
 * 为墙面几何写入 hbWallCornerDistance 属性（到墙角的两个方向距离）。
 *
 * 输入是墙体的平面闭合环（设计图坐标，米），函数把它们拆成边段后，
 * 为每个「竖直面」顶点找出最近的棱边，记下沿边距离与剩余距离，
 * 片元着色器据此在墙角附近压暗，让墙体的转折关系更清楚。
 */
export function setWallCornerDistances(threeNamespace, geometry, loops) {
  // 先把所有环化成「带方向的边段」列表，后面逐顶点找最近边时直接线性遍历。
  const edgeSegments = [];
  for (const loop of loops) {
    // 相邻重复点（距离小于 1e-7）在后续算方向向量时会除零，先剔掉。
    let vertices = loop.filter(
      (point, pointIndex) =>
        !pointIndex ||
        Math.hypot(point.x - loop[pointIndex - 1].x, point.y - loop[pointIndex - 1].y) > 1e-7
    );
    // 环的写法可能首尾重合，去掉末点避免生成一条零长度边。
    if (
      vertices.length > 1 &&
      Math.hypot(vertices[0].x - vertices.at(-1).x, vertices[0].y - vertices.at(-1).y) < 1e-7
    ) {
      vertices = vertices.slice(0, -1);
    }
    // 去掉共线点，只保留真正的拐角：共线点会把一段直墙拆成多条边，
    // 让后面按「沿边距离」算出的墙角阴影出现假的边界。
    vertices = vertices.filter((currentVertex, vertexIndex, vertexList) => {
      const previousVertex = vertexList[(vertexIndex + vertexList.length - 1) % vertexList.length];
      const nextVertex = vertexList[(vertexIndex + 1) % vertexList.length];
      const edgeToCurrentX = currentVertex.x - previousVertex.x;
      const edgeToCurrentY = currentVertex.y - previousVertex.y;
      const edgeToNextX = nextVertex.x - currentVertex.x;
      const edgeToNextY = nextVertex.y - currentVertex.y;
      return (
        edgeToCurrentX * edgeToNextX + edgeToCurrentY * edgeToNextY <= 0 ||
        Math.abs(edgeToCurrentX * edgeToNextY - edgeToCurrentY * edgeToNextX) >
          Math.hypot(edgeToCurrentX, edgeToCurrentY) *
            0.000001 *
            Math.hypot(edgeToNextX, edgeToNextY)
      );
    });
    // 逐边记录起点与单位方向向量，另外带上长度以便把「沿边距离」夹在边内。
    for (let loopIndex = 0; loopIndex < vertices.length; loopIndex++) {
      const vertex = vertices[loopIndex];
      const followingVertex = vertices[(loopIndex + 1) % vertices.length];
      const edgeLength = Math.hypot(followingVertex.x - vertex.x, followingVertex.y - vertex.y);
      if (edgeLength > 1e-7) {
        edgeSegments.push({
          x: vertex.x,
          y: vertex.y,
          tx: (followingVertex.x - vertex.x) / edgeLength,
          ty: (followingVertex.y - vertex.y) / edgeLength,
          length: edgeLength
        });
      }
    }
  }
  const positionAttribute = geometry.attributes.position;
  const normalAttribute = geometry.attributes.normal;
  // 默认填 100：属性是「离角多远」，没有匹配到任何边的顶点应当没有角部阴影。
  const cornerDistanceBuffer = new Float32Array(positionAttribute.count * 2).fill(100);
  for (let vertexCursor = 0; vertexCursor < positionAttribute.count; vertexCursor++) {
    // 只处理竖直面：|法线 Z| 大于 0.5 说明是顶面或底面，谈不上墙角。
    if (!normalAttribute || Math.abs(normalAttribute.getZ(vertexCursor)) > 0.5) {
      continue;
    }
    let bestDistance = Infinity;
    // 打分由三部分组成：到该边所在直线的垂距、落在边外时的越界距离、
    // 以及顶点法线与边方向的夹角项（法线垂直于该边的顶点更可能属于这条墙）。
    for (const edge of edgeSegments) {
      const offsetX = positionAttribute.getX(vertexCursor) - edge.x;
      const offsetY = positionAttribute.getY(vertexCursor) - edge.y;
      const alongEdge = offsetX * edge.tx + offsetY * edge.ty;
      const distanceScore =
        Math.abs(offsetX * edge.ty - offsetY * edge.tx) +
        Math.max(-alongEdge, 0, alongEdge - edge.length) +
        Math.abs(
          normalAttribute.getX(vertexCursor) * edge.tx +
            normalAttribute.getY(vertexCursor) * edge.ty
        );
      if (distanceScore < bestDistance) {
        bestDistance = distanceScore;
        cornerDistanceBuffer[vertexCursor * 2] = Math.max(0, Math.min(edge.length, alongEdge));
        cornerDistanceBuffer[vertexCursor * 2 + 1] =
          edge.length - cornerDistanceBuffer[vertexCursor * 2];
      }
    }
  }
  // 两个分量分别是「沿边到本边起点的距离」与「到终点的距离」，着色器取较小者判断离角远近。
  geometry.setAttribute(
    "hbWallCornerDistance",
    new threeNamespace.BufferAttribute(cornerDistanceBuffer, 2)
  );
}
/**
 * 合并可批量处理的墙带网格。
 *
 * 「墙带」指门窗上下那两段墙体条带：它们数量多、形状规则，但每个都是独立网格。
 * 这里把材质与渲染状态完全一致的墙带合到一个网格里，只保留墙带自身那段几何
 * （多材质网格里 materialIndex 为 1 的 group），从而大幅减少绘制批次。
 */
export function mergeWallBands(threeApi, bandRoot, mergeGeometries) {
  // 分组键是「材质与渲染状态」的完整签名：只有全都一致才能安全合并，
  // 否则合并后会丢掉某个网格特有的透明 / 深度 / 图层设置。
  const bandBySignature = new Map();
  for (const child of bandRoot.children) {
    if (!child.userData.hbMergeWallBand || !Array.isArray(child.material)) {
      continue;
    }
    // 多材质网格里第 1 个材质才是墙带本身的材质（第 0 个给墙体的其它部分用）。
    const bandMaterial = child.material[1];
    const bandSignature = JSON.stringify([
      bandMaterial.type,
      bandMaterial.color.getHex(),
      bandMaterial.opacity,
      bandMaterial.depthWrite,
      bandMaterial.depthFunc,
      bandMaterial.side,
      bandMaterial.forceSinglePass,
      bandMaterial.transparent,
      child.layers.mask,
      child.castShadow,
      child.receiveShadow,
      child.renderOrder
    ]);
    if (!bandBySignature.has(bandSignature)) {
      bandBySignature.set(bandSignature, []);
    }
    bandBySignature.get(bandSignature).push(child);
  }
  for (const bandChildren of bandBySignature.values()) {
    if (bandChildren.length < 2) {
      continue;
    }
    // 每个墙带只抽出自己那段 group 的顶点，再合并成一个整体几何。
    const mergedGeometries = [];
    // 合并前刷新局部矩阵：下面要把它烘进顶点坐标，用到的是 matrix 而非 matrixWorld。
    for (const bandChild of bandChildren) {
      bandChild.updateMatrix();
      const sourceGeometry = bandChild.geometry.index
        ? bandChild.geometry.toNonIndexed()
        : bandChild.geometry;
      // 逐 group 切片：属性按 itemSize 换算成元素区间后复制，保留 normalized 标记。
      for (const geometryGroup of sourceGeometry.groups.filter(
        groupEntry => groupEntry.materialIndex === 1
      )) {
        const mergedPiece = new threeApi.BufferGeometry();
        for (const [attributeName, attribute] of Object.entries(sourceGeometry.attributes)) {
          mergedPiece.setAttribute(
            attributeName,
            new threeApi.BufferAttribute(
              attribute.array.slice(
                geometryGroup.start * attribute.itemSize,
                (geometryGroup.start + geometryGroup.count) * attribute.itemSize
              ),
              attribute.itemSize,
              attribute.normalized
            )
          );
        }
        mergedPiece.applyMatrix4(bandChild.matrix);
        mergedGeometries.push(mergedPiece);
      }
      // toNonIndexed 生成的是临时几何，用完要释放；原几何则留给调用方继续使用。
      if (sourceGeometry !== bandChild.geometry) {
        sourceGeometry.dispose();
      }
    }
    const mergedGeometry = mergedGeometries.length
      ? mergeGeometries(mergedGeometries, false)
      : null;
    for (const pieceGeometry of mergedGeometries) {
      pieceGeometry.dispose();
    }
    if (!mergedGeometry) {
      continue;
    }
    mergedGeometry.computeBoundingBox();
    mergedGeometry.computeBoundingSphere();
    const firstChild = bandChildren[0];
    const mergedMaterial = firstChild.material[1];
    const mergedMesh = new threeApi.Mesh(mergedGeometry, mergedMaterial);
    mergedMesh.userData = {
      ...firstChild.userData,
      hbMergedWallCount: bandChildren.length,
      regionReceiverKind: "wall"
    };
    mergedMesh.layers.mask = firstChild.layers.mask;
    mergedMesh.renderOrder = firstChild.renderOrder;
    mergedMesh.castShadow = firstChild.castShadow;
    mergedMesh.receiveShadow = firstChild.receiveShadow;
    // 被移除的墙带共用的材质只释放一次：同一个材质对象会出现在多个网格的材质数组里。
    const disposedMaterials = new Set();
    for (const removedChild of bandChildren) {
      bandRoot.remove(removedChild);
      removedChild.geometry.dispose();
      for (const childMaterial of removedChild.material) {
        if (childMaterial !== mergedMaterial && !disposedMaterials.has(childMaterial)) {
          disposedMaterials.add(childMaterial);
          childMaterial.dispose();
        }
      }
    }
    bandRoot.add(mergedMesh);
  }
}
/**
 * 为墙体几何写入 hbWallHeight 属性（归一化墙高）。
 *
 * 高度按「沿某根轴的线性映射」再除以墙高求出，结果夹在 0~1；
 * 轴为 z 时取 Z 分量，否则取 Y —— 因为不同来源的墙体几何其「向上」轴并不一致。
 */
export function setWallGradientHeight(threeModule, meshGeometry, axis, offset, scale, heightSpan) {
  const wallPositionAttribute = meshGeometry.attributes.position;
  const heightBuffer = new Float32Array(wallPositionAttribute.count);
  // 墙高下限 0.01 米：极小的 heightSpan 会在归一化时放大成无穷大或 NaN。
  const clampedHeightSpan = Math.max(0.01, heightSpan);
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
      Math.min(1, (offset + scale * axisValue) / clampedHeightSpan)
    );
  }
  meshGeometry.setAttribute("hbWallHeight", new threeModule.BufferAttribute(heightBuffer, 1));
}
