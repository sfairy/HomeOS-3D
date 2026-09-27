/**
 * 接触阴影的烘焙通道：高度级计算、布局签名、深度材质与表面烘焙。
 *
 * 从 studio-plan2-contact-shadows.js 拆出来：那一份只留控制器骨架（记录、渲染编排、对外接口），
 * 这一份是「怎么算出该烘哪些高度、用什么材质、怎么拼图集」的几趟独立工序。
 * 它们原本是工厂里的闭包，用到若干外层局部；外提时统一多一个 context 参数并在开头解构自己需要的
 * 那几个（依赖写在签名上），调用点传同一个上下文对象。
 */


import { roundToDecimals } from "../../utils/numbers.js?v=2609271208";

export function computeSurfaceLevels(threeLib, meshList, floorY, levelLimit = 32, ) {
  const levelsByHeightKey = new Map();
  const vertexA = new threeLib.Vector3();
  const vertexB = new threeLib.Vector3();
  const vertexC = new threeLib.Vector3();
  const edgeAB = new threeLib.Vector3();
  const edgeAC = new threeLib.Vector3();
  const faceNormal = new threeLib.Vector3();
  const meshMatrix = new threeLib.Matrix4();
  const instanceMatrix = new threeLib.Matrix4();
  for (const mesh of meshList) {
    const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // 材质上显式标记 plan2SurfaceContact === false 的网格是「主动退出」表面烘焙的
    // （比如被外部模型接管的家具），多材质时要求全部退出才跳过，避免误伤。
    if (
      materialList.length &&
      materialList.every(materialEntry => materialEntry?.userData?.plan2SurfaceContact === false)
    ) {
      continue;
    }
    const geometry = mesh.geometry;
    const positionAttribute = geometry?.attributes?.position;
    if (!positionAttribute) {
      continue;
    }
    const indexAttribute = geometry.index;
    // 尊重几何的 drawRange：外部模型常用它裁掉隐藏面，扫描时必须同步裁掉，
    // 否则会把不该出现的三角面统计进来。
    const vertexCount = indexAttribute?.count ?? positionAttribute.count;
    const drawStart = geometry.drawRange.start;
    const drawEnd = Math.min(vertexCount, drawStart + geometry.drawRange.count);
    for (
      let instanceIndex = 0;
      instanceIndex < (mesh.isInstancedMesh ? mesh.count : 1);
      instanceIndex++
    ) {
      meshMatrix.copy(mesh.matrixWorld);
      if (mesh.isInstancedMesh) {
        // InstancedMesh 的每个实例都有自己的矩阵，必须左乘到世界矩阵上才是最终位置。
        mesh.getMatrixAt(instanceIndex, instanceMatrix);
        meshMatrix.multiply(instanceMatrix);
      }
      for (let vertexCursor = drawStart; vertexCursor + 2 < drawEnd; vertexCursor += 3) {
        vertexA
          .fromBufferAttribute(
            positionAttribute,
            indexAttribute ? indexAttribute.getX(vertexCursor) : vertexCursor
          )
          .applyMatrix4(meshMatrix);
        vertexB
          .fromBufferAttribute(
            positionAttribute,
            indexAttribute ? indexAttribute.getX(vertexCursor + 1) : vertexCursor + 1
          )
          .applyMatrix4(meshMatrix);
        vertexC
          .fromBufferAttribute(
            positionAttribute,
            indexAttribute ? indexAttribute.getX(vertexCursor + 2) : vertexCursor + 2
          )
          .applyMatrix4(meshMatrix);
        faceNormal.crossVectors(
          edgeAB.subVectors(vertexB, vertexA),
          edgeAC.subVectors(vertexC, vertexA)
        );
        const triangleArea = faceNormal.length() * 0.5;
        // 三个顶点 Y 的均值即三角形重心的离地高度，作为这一级的代表高度。
        const surfaceHeight = (vertexA.y + vertexB.y + vertexC.y) / 3 - floorY;
        if (triangleArea < 0.004 || faceNormal.y < triangleArea * 1.98 || surfaceHeight <= 0.12) {
          continue;
        }
        const heightKey = Math.round(surfaceHeight * 100);
        // 同一 1cm 高度桶内累加「高度 × 面积」与面积，最后相除得到面积加权平均高度：
        // 面积大的面更能代表这一级的实际高度，避免被小碎面拉偏。
        const bundledLevel = levelsByHeightKey.get(heightKey) || {
          height: 0,
          area: 0,
          top: -Infinity
        };
        bundledLevel.height += surfaceHeight * triangleArea;
        bundledLevel.area += triangleArea;
        bundledLevel.top = Math.max(
          bundledLevel.top,
          vertexA.y - floorY,
          vertexB.y - floorY,
          vertexC.y - floorY
        );
        levelsByHeightKey.set(heightKey, bundledLevel);
      }
    }
  }
  return [...levelsByHeightKey.values()]
    .sort((levelA, levelB) => levelB.area - levelA.area)
    .slice(0, levelLimit)
    .map(levelEntry => ({
      height: levelEntry.height / levelEntry.area,
      top: levelEntry.top
    }))
    .sort((levelLeft, levelRight) => levelLeft.height - levelRight.height);
}

export function computeLayoutKey(layout, bakeFrame, context) {
  const { settings, THREE, receiverBoundsCacheByGeometry, isContactCasterMaterial, computeGeometryKey } = context;

    const bakeFrameInverse = bakeFrame.clone().invert();
    // 描述对象在世界矩阵 + 实例矩阵下的最终变换（已是烘焙坐标系）。
    const describeObjectMatrix = object => {
      const objectMatrix = bakeFrameInverse.clone().multiply(object.matrixWorld);
      // 矩阵元素抹到 1e-4：布局缓存靠字符串比对判断「是否还是同一份布局」，浮点尾数会随帧
      // 抖动，不抹平就会每帧都被判脏、缓存彻底失效。抹平实现只有一份（utils/numbers.js），
      // 这里的 4 是本调用方的精度契约（家具拖拽产生的 0.1mm 级抖动不该触发重烘）。
      const roundMatrixElements = matrix =>
        matrix.elements.map(element => roundToDecimals(element, 4));
      if (!object.isInstancedMesh) {
        return roundMatrixElements(objectMatrix);
      }
      const instanceWorldMatrix = new THREE.Matrix4();
      const instancedMatrices = [];
      for (let instanceCursor = 0; instanceCursor < object.count; instanceCursor++) {
        object.getMatrixAt(instanceCursor, instanceWorldMatrix);
        instancedMatrices.push(roundMatrixElements(instanceWorldMatrix.premultiply(objectMatrix)));
      }
      return instancedMatrices;
    };
    // 排序后再拼接：矩阵条目的产出顺序取决于场景遍历顺序，不排序会让内容相同的
    // 两份布局算出不同的键，从而误判为「已变化」。
    const normalizeEntries = matrixEntries =>
      matrixEntries.map(matrixValues => JSON.stringify(matrixValues)).sort();
    return JSON.stringify([
      settings,
      normalizeEntries(
        layout.receivers.map(receiver => {
          const receiverGeometry = receiver.geometry;
          const receiverPositionAttribute = receiverGeometry.attributes.position;
          // 包围盒按几何缓存：computeBoundingBox 会遍历全部顶点，
          // 每帧对每件家具重算会成为热点，所以用「位置属性对象 + 版本号」当缓存键。
          const cachedEntry = receiverBoundsCacheByGeometry.get(receiverGeometry);
          if (
            !cachedEntry ||
            cachedEntry.position !== receiverPositionAttribute ||
            cachedEntry.version !== receiverPositionAttribute?.version
          ) {
            receiverGeometry.computeBoundingBox();
            receiverBoundsCacheByGeometry.set(receiverGeometry, {
              position: receiverPositionAttribute,
              version: receiverPositionAttribute?.version,
              box: receiverGeometry.boundingBox?.clone()
            });
          }
          const receiverBounds = receiverBoundsCacheByGeometry
            .get(receiverGeometry)
            .box?.clone()
            .applyMatrix4(bakeFrameInverse.clone().multiply(receiver.matrixWorld));
          if (receiverBounds) {
            return [...receiverBounds.min.toArray(), ...receiverBounds.max.toArray()].map(
              boundValue => Math.round(boundValue * 10000)
            );
          } else {
            return null;
          }
        })
      ),
      normalizeEntries(
        layout.casters.map(caster => {
          // 逐材质生成签名：只有会影响深度通道输出的字段才进签名（见上文说明）。
          const casterMaterialSignatures = (
            Array.isArray(caster.material) ? caster.material : [caster.material]
          ).map(casterMaterial => {
            const materialAlphaTest = casterMaterial.alphaTest || 0;
            const displacementMap = casterMaterial.displacementMap;
            // 贴图签名用「uuid + version」：替换贴图会换 uuid，改内容会涨 version，
            // 两者都覆盖才能保证改图后重新烘焙。
            const describeTexture = texture => (texture ? [texture.uuid, texture.version] : null);
            return [
              isContactCasterMaterial(casterMaterial),
              materialAlphaTest,
              materialAlphaTest > 0 ? describeTexture(casterMaterial.map) : null,
              materialAlphaTest > 0 ? describeTexture(casterMaterial.alphaMap) : null,
              describeTexture(displacementMap),
              displacementMap ? (casterMaterial.displacementScale ?? 1) : 0,
              displacementMap ? (casterMaterial.displacementBias ?? 0) : 0
            ];
          });
          // 单材质网格占绝大多数，此时只留一份签名即可显著缩短字符串长度；
          // 多材质网格必须逐面保留，否则换了某个面组件的贴图会被漏掉。
          const hasUniformMaterial = casterMaterialSignatures.every(
            materialSignature =>
              JSON.stringify(materialSignature) === JSON.stringify(casterMaterialSignatures[0])
          );
          return [
            computeGeometryKey(caster.geometry),
            caster.isInstancedMesh ? caster.count : null,
            caster.morphTargetInfluences,
            describeObjectMatrix(caster),
            hasUniformMaterial ? casterMaterialSignatures.slice(0, 1) : casterMaterialSignatures
          ];
        })
      )
    ]);
  }

export function getDepthMaterial(sourceMaterial, isSurfaceBake = false, context) {
  const { settings, depthMaterialsByKey, THREE } = context;

    // 缓存键把「影响深度着色器输出的全部输入」都串起来：贴图 UUID、alphaTest、
    // 位移参数，以及当前 settings 里那几个注入值。少任何一项，改设置后就会拿到旧材质。
    const materialCacheKey = JSON.stringify([
      isSurfaceBake,
      sourceMaterial.map?.uuid,
      sourceMaterial.alphaMap?.uuid,
      sourceMaterial.alphaTest,
      sourceMaterial.displacementMap?.uuid,
      sourceMaterial.displacementScale,
      sourceMaterial.displacementBias,
      settings.maxHeight,
      settings.heightFalloff,
      settings.offsetX,
      settings.offsetZ
    ]);
    if (depthMaterialsByKey.has(materialCacheKey)) {
      const reusedMaterial = depthMaterialsByKey.get(materialCacheKey);
      // Map 的迭代顺序即插入顺序，删了再塞回去相当于「标记为最近使用」，
      // 配合 trimMaterialCache 的「从头淘汰」就得到了一份简易 LRU。
      depthMaterialsByKey.delete(materialCacheKey);
      depthMaterialsByKey.set(materialCacheKey, reusedMaterial);
      return reusedMaterial;
    }
    const depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.BasicDepthPacking,
      side: THREE.DoubleSide,
      map: sourceMaterial.map ?? null,
      alphaMap: sourceMaterial.alphaMap ?? null,
      alphaTest: sourceMaterial.alphaTest ?? 0,
      displacementMap: sourceMaterial.displacementMap ?? null,
      displacementScale: sourceMaterial.displacementScale ?? 1,
      displacementBias: sourceMaterial.displacementBias ?? 0
    });
    depthMaterial.onBeforeCompile = shader => {
      shader.uniforms.contactNear = {
        value: 0.001
      };
      // 远平面：地面通道取 maxHeight + 0.06（与相机远平面一致，多一点余量防裁剪）；
      // 表面通道只需覆盖 1.5m，够用且能让深度精度更好。
      shader.uniforms.contactFar = {
        value: isSurfaceBake ? 1.5 : settings.maxHeight + 0.06
      };
      shader.uniforms.contactFalloff = {
        value: isSurfaceBake ? 0.5 : settings.heightFalloff
      };
      shader.uniforms.contactOffset = {
        value: new THREE.Vector2(settings.offsetX, settings.offsetZ)
      };
      shader.vertexShader = "uniform vec2 contactOffset;\n" + shader.vertexShader;
      const projectVertexChunk = "#include <project_vertex>";
      // 注入点找不到就直接抛错：此时烘焙会静默产出「没有方向偏移的对称阴影」，
      // 现象很隐蔽，不如在开发期当场失败。多半是升级 three.js 后 chunk 改名了。
      if (!shader.vertexShader.includes(projectVertexChunk)) {
        throw new Error("接触阴影材质缺少 project_vertex");
      }
      shader.vertexShader = shader.vertexShader.replace(
        projectVertexChunk,
        projectVertexChunk +
          "\n        // The capture looks up from 6cm below this floor. project_vertex has\n        // already applied instancing, skinning and the mesh world transform.\n        // Ground contact stays fixed; elevated surfaces reveal a short shadow\n        // beside the furniture using the same cached map and depth falloff.\n        float contactHeight = max(-mvPosition.z - " +
          (isSurfaceBake ? "0.0" : "0.06") +
          ", 0.0);\n        gl_Position.xy += vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * contactHeight * contactOffset;"
      );
      shader.fragmentShader =
        "uniform float contactNear, contactFar, contactFalloff;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );",
        "float height = max(mix(contactNear, contactFar, fragCoordZ) - " +
          (isSurfaceBake ? "0.0" : "0.06") +
          ", 0.0);\n         float density = exp(-height / contactFalloff) * (1.0 - smoothstep(" +
          (isSurfaceBake ? 0.8 : 1.8) +
          ", " +
          (isSurfaceBake ? 1.5 : 2.5) +
          ", height));\n         gl_FragColor = vec4(vec3(density), 1.0);"
      );
    };
    // three.js 用这个键判断「同一份材质能否复用已编译程序」。注入代码随 isSurfaceBake
    // 变化，必须把两种形态区分开，否则地面/表面通道会拿到对方编译好的程序。
    depthMaterial.customProgramCacheKey = () =>
      isSurfaceBake ? "plan2-surface-bake-v1" : "plan2-contact-depth-v2-short-shadow";
    depthMaterialsByKey.set(materialCacheKey, depthMaterial);
    return depthMaterial;
  }

export function bakeSurfaceLevels(surfaceEntry, casterMeshes, overrideByCaster, renderScene, casterBounds, floorBaseY, fallbackMaterial, context) {
  const { THREE, settings, placeholderTexture, renderer, stats, trimMaterialCache, blurMaterial, isContactCasterMaterial, blurScene, blurCamera } = context;

    const levels = computeSurfaceLevels(THREE, casterMeshes, floorBaseY, settings.maxSurfaceLevels, context);
    const levelHeights = levels.map(levelInfo => levelInfo.height);
    // 先把浓度压到 0：烘焙期间旧图集可能正在被采样，若内容已对不上会出现闪烁，
    // 宁可短暂无阴影也不要错位阴影。烘焙成功后再恢复。
    surfaceEntry.uniforms.plan2SurfaceOpacity.value = 0;
    if (!levelHeights.length) {
      surfaceEntry.surface?.dispose();
      surfaceEntry.lookup?.dispose();
      surfaceEntry.surface = surfaceEntry.lookup = null;
      surfaceEntry.uniforms.plan2SurfaceMap.value = placeholderTexture;
      surfaceEntry.uniforms.plan2SurfaceLookup.value = placeholderTexture;
      return;
    }
    // 排成方阵：n 个格子取 ceil(sqrt(n)) 列，图集近似正方形，纹理利用率最高。
    const atlasColumns = Math.ceil(Math.sqrt(levelHeights.length));
    // 单格边长还要受设备上限约束：列数越多、图集越大，超过 maxTextureSize 会直接创建失败。
    const tileSizePx = Math.min(
      settings.surfaceResolution,
      Math.floor(renderer.capabilities.maxTextureSize / atlasColumns)
    );
    const atlasSizePx = atlasColumns * tileSizePx;
    if (surfaceEntry.surface?.width !== atlasSizePx) {
      surfaceEntry.surface?.dispose();
      surfaceEntry.surface = new THREE.WebGLRenderTarget(atlasSizePx, atlasSizePx, {
        format: THREE.RedFormat,
        depthBuffer: false,
        generateMipmaps: false
      });
    }
    const paddedBounds = casterBounds.clone();
    // 外扩 0.5m：模糊会把阴影向外推，边界贴太紧会在房间边缘出现硬切。
    paddedBounds.expandByVector(new THREE.Vector3(0.5, 0, 0.5));
    const surfaceWidth = paddedBounds.max.x - paddedBounds.min.x;
    const surfaceDepth = paddedBounds.max.z - paddedBounds.min.z;
    // 正交视景体的中心取外扩后包围盒的中心，保证所有接收面都在画面内。
    const surfaceCenterX = (paddedBounds.min.x + paddedBounds.max.x) / 2;
    // Z 向与 X 同理，两者共同构成视景体中心的水平位置。
    const surfaceCenterZ = (paddedBounds.min.z + paddedBounds.max.z) / 2;
    const bakeCamera = new THREE.OrthographicCamera(
      -surfaceWidth / 2,
      surfaceWidth / 2,
      surfaceDepth / 2,
      -surfaceDepth / 2,
      0.001,
      1.5
    );
    // 相机默认朝下（up = +Y），而我们要沿 Y 轴朝上拍，与 up 平行会让 lookAt 退化，
    // 因此把 up 改成 +Z，水平面内的朝向才稳定。
    bakeCamera.up.set(0, 0, 1);
    const bakeTarget = new THREE.WebGLRenderTarget(tileSizePx, tileSizePx, {
      format: THREE.RedFormat,
      generateMipmaps: false
    });
    const blurTarget = new THREE.WebGLRenderTarget(tileSizePx, tileSizePx, {
      format: THREE.RedFormat,
      depthBuffer: false,
      generateMipmaps: false
    });
    const surfaceMaterialsByCaster = new Map();
    // 材质不合格的投影源换成「不可见」的兜底材质：它会参与深度渲染但不写入任何像素，
    // 等价于把该物体从这一级里剔除，同时保留网格在场景里的位置（不能直接不加入场景，
    // 因为克隆体的矩阵、层级都是按原场景复制的）。
    const toSurfaceMaterial = surfaceSourceMaterial =>
      isContactCasterMaterial(surfaceSourceMaterial)
        ? (surfaceMaterialsByCaster.has(surfaceSourceMaterial) ||
            surfaceMaterialsByCaster.set(
              surfaceSourceMaterial,
              getDepthMaterial(surfaceSourceMaterial, true, context)
            ),
          surfaceMaterialsByCaster.get(surfaceSourceMaterial))
        : fallbackMaterial;
    try {
      overrideByCaster.forEach((overrideMaterial, casterIndex) => {
        const originalMaterial = casterMeshes[casterIndex].material;
        overrideMaterial.material = Array.isArray(originalMaterial)
          ? originalMaterial.map(toSurfaceMaterial)
          : toSurfaceMaterial(originalMaterial);
      });
      for (let levelIndex = 0; levelIndex < levelHeights.length; levelIndex++) {
        // 相机贴在该级最高点上方 3mm：3mm 是「不穿进面里」与「不漏掉细节」之间的折中，
        // 再高就会把低于该级的面拍成背景。
        bakeCamera.position.set(
          surfaceCenterX,
          floorBaseY + levels[levelIndex].top + 0.003,
          surfaceCenterZ
        );
        bakeCamera.lookAt(surfaceCenterX, bakeCamera.position.y + 1, surfaceCenterZ);
        bakeCamera.updateMatrixWorld(true);
        renderer.autoClear = true;
        renderer.setClearColor(0, 1);
        renderer.setRenderTarget(bakeTarget);
        renderer.render(renderScene, bakeCamera);
        stats.surfacePasses++;
        // 只在本级范围内做模糊：stepSize 用「米 / 世界宽高」换算成 UV，保证世界尺度一致。
        const blurPass = (sourceTarget, destTarget, stepX, stepY, spread = 0) => {
          blurMaterial.uniforms.source.value = sourceTarget.texture;
          blurMaterial.uniforms.stepSize.value.set(stepX, stepY);
          blurMaterial.uniforms.spread.value = spread;
          renderer.setRenderTarget(destTarget);
          renderer.render(blurScene, blurCamera);
        };
        // 4 轮由粗到细的分离式模糊：先 6mm 带膨胀（spread = 1）把阴影摊开，
        // 再 12mm 纯模糊收边，得到比单轮大半径模糊更干净的渐变。
        blurPass(bakeTarget, blurTarget, 0.006 / surfaceWidth, 0, 1);
        blurPass(blurTarget, bakeTarget, 0, 0.006 / surfaceDepth, 1);
        blurPass(bakeTarget, blurTarget, 0.012 / surfaceWidth, 0);
        blurPass(blurTarget, bakeTarget, 0, 0.012 / surfaceDepth);
        // 用 viewport 把这一级的结果只写进图集的一个格子；写完整张图集后由
        // renderer 自己按 viewport 复位，不需要额外拷贝。
        surfaceEntry.surface.viewport.set(
          (levelIndex % atlasColumns) * tileSizePx,
          Math.floor(levelIndex / atlasColumns) * tileSizePx,
          tileSizePx,
          tileSizePx
        );
        renderer.autoClear = false;
        blurPass(bakeTarget, surfaceEntry.surface, 0, 0);
      }
      surfaceEntry.surface.viewport.set(0, 0, atlasSizePx, atlasSizePx);
      // 查找表把「高度」映射到「图集格子的行列」，运行时着色器一次采样即可定位。
      // 2048 个采样点在 0 ~ 最高级 + 5cm 的区间上均分，纵向精度约 1mm 量级，足够。
      const maxLookupHeight = levelHeights.at(-1) + 0.05;
      const lookupSize = 2048;
      const lookupTextureData = new Uint8Array(lookupSize * 4);
      for (let lookupIndex = 0; lookupIndex < lookupSize; lookupIndex++) {
        // 采样点取格子中心（+0.5），把索引换算成 [0, maxLookupHeight) 上的实际高度。
        const lookupHeight = ((lookupIndex + 0.5) / lookupSize) * maxLookupHeight;
        let nearestLevelIndex = -1;
        // 容差 1.8cm：比一级高度桶（1cm）稍大，让相邻两级之间有平滑过渡，
        // 又不至于把差距明显的面误配到同一级。
        let nearestLevelDistance = 0.018;
        levelHeights.forEach((height, heightIndex) => {
          const heightDistance = Math.abs(height - lookupHeight);
          if (heightDistance < nearestLevelDistance) {
            nearestLevelDistance = heightDistance;
            nearestLevelIndex = heightIndex;
          }
        });
        if (!(nearestLevelIndex < 0)) {
          // 用 RG 两通道存格子坐标（各 0~255），BA 固定 255 用于判断「该高度有无遮蔽」。
          lookupTextureData[lookupIndex * 4] = nearestLevelIndex % atlasColumns;
          lookupTextureData[lookupIndex * 4 + 1] = Math.floor(nearestLevelIndex / atlasColumns);
          lookupTextureData[lookupIndex * 4 + 2] = 255;
          lookupTextureData[lookupIndex * 4 + 3] = 255;
        }
      }
      surfaceEntry.lookup?.dispose();
      surfaceEntry.lookup = new THREE.DataTexture(lookupTextureData, lookupSize, 1);
      surfaceEntry.lookup.needsUpdate = true;
      surfaceEntry.uniforms.plan2SurfaceMap.value = surfaceEntry.surface.texture;
      surfaceEntry.uniforms.plan2SurfaceLookup.value = surfaceEntry.lookup;
      surfaceEntry.uniforms.plan2SurfaceLayout.value.set(atlasColumns, maxLookupHeight);
      surfaceEntry.uniforms.plan2SurfaceBounds.value.set(
        paddedBounds.min.x,
        paddedBounds.min.z,
        surfaceWidth,
        surfaceDepth
      );
      surfaceEntry.uniforms.plan2SurfaceOpacity.value = settings.enabled
        ? settings.surfaceOpacity
        : 0;
      stats.surfaceCaptures++;
    } finally {
      bakeTarget.dispose();
      blurTarget.dispose();
      trimMaterialCache();
      blurMaterial.uniforms.source.value = placeholderTexture;
      blurMaterial.uniforms.spread.value = 0;
    }
  }
