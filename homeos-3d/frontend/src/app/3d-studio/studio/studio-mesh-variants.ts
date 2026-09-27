/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import { finite } from "../loaders/studio-normalization.js";
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";
import { addBoxMesh } from "./studio-mesh-geometry.js";

/**
 * 构建窗帘曲面几何：三条宽度不同的水平圈（导轨）沿高度张开成裙摆状。每条圈自后向前分三段：背面直线 → 侧面 →
 */
export function buildCurtainGeometry(curtainWidth: any, curtainDepth: any, curtainHeight: any) {
  const curtainRails = [
    {
      y: 0,
      halfWidth: curtainWidth * 0.31,
      backZ: -curtainDepth * 0.16,
      sideZ: curtainDepth * 0.08,
      frontZ: curtainDepth * 0.46
    },
    {
      y: curtainHeight * 0.42,
      halfWidth: curtainWidth * 0.43,
      backZ: -curtainDepth * 0.34,
      sideZ: curtainDepth * 0.08,
      frontZ: curtainDepth * 0.47
    },
    {
      y: curtainHeight * 0.72,
      halfWidth: curtainWidth * 0.49,
      backZ: -curtainDepth * 0.47,
      sideZ: curtainDepth * 0.08,
      frontZ: curtainDepth * 0.47
    }
  ];
  /**
   * @returns {Array<THREE.Vector3>} 该圈的顶点列表。
   */
  const buildRailPoints = (railSpec: any) => {
    const railPoints = [
      new threeModuleMin.Vector3(-railSpec.halfWidth, railSpec.y, railSpec.backZ),
      new threeModuleMin.Vector3(railSpec.halfWidth, railSpec.y, railSpec.backZ),
      new threeModuleMin.Vector3(railSpec.halfWidth, railSpec.y, railSpec.sideZ)
    ];
    for (let arcStep = 1; arcStep <= 18; arcStep += 1) {
      const arcAngleRad = (arcStep / 18) * Math.PI;
      railPoints.push(
        new threeModuleMin.Vector3(
          Math.cos(arcAngleRad) * railSpec.halfWidth,
          railSpec.y,
          railSpec.sideZ + Math.sin(arcAngleRad) * (railSpec.frontZ - railSpec.sideZ)
        )
      );
    }
    return railPoints;
  };
  const railPointLists = curtainRails.map(buildRailPoints);
  const railPointCount = railPointLists[0].length;
  const curtainPositions = railPointLists.flatMap(railPointsList =>
    railPointsList.flatMap(railPoint => [railPoint.x, railPoint.y, railPoint.z])
  );
  const curtainIndices = [];
  for (let railIndex = 0; railIndex < railPointLists.length - 1; railIndex += 1) {
    const lowerRingStart = railIndex * railPointCount;
    const upperRingStart = (railIndex + 1) * railPointCount;
    for (let pointIndex = 0; pointIndex < railPointCount; pointIndex += 1) {
      const nextPointIndex = (pointIndex + 1) % railPointCount;
      const lowerCurrentIndex = lowerRingStart + pointIndex;
      const lowerNextIndex = lowerRingStart + nextPointIndex;
      const upperCurrentIndex = upperRingStart + pointIndex;
      const upperNextIndex = upperRingStart + nextPointIndex;
      curtainIndices.push(
        lowerCurrentIndex,
        upperNextIndex,
        lowerNextIndex,
        lowerCurrentIndex,
        upperCurrentIndex,
        upperNextIndex
      );
    }
  }
  const centerBottomIndex = curtainPositions.length / 3;
  curtainPositions.push(0, curtainRails[0].y, curtainDepth * 0.08);
  const centerTopIndex = curtainPositions.length / 3;
  curtainPositions.push(0, curtainRails.at(-1)!.y, curtainDepth * 0.08);
  const topRingStart = (railPointLists.length - 1) * railPointCount;
  for (let capPointIndex = 0; capPointIndex < railPointCount; capPointIndex += 1) {
    const capNextIndex = (capPointIndex + 1) % railPointCount;
    curtainIndices.push(centerBottomIndex, capPointIndex, capNextIndex);
    curtainIndices.push(centerTopIndex, topRingStart + capNextIndex, topRingStart + capPointIndex);
  }
  const curtainGeometry = new threeModuleMin.BufferGeometry();
  curtainGeometry.setAttribute(
    "position",
    new threeModuleMin.Float32BufferAttribute(curtainPositions, 3)
  );
  curtainGeometry.setIndex(curtainIndices);
  curtainGeometry.computeVertexNormals();
  curtainGeometry.computeBoundingSphere();
  return curtainGeometry;
}

export function addChairModel(
  chairParent: any,
  chairWidth: any,
  chairDepth: any,
  chairHeight: any,
  chairX: any,
  chairZ: any,
  chairRotation: any,
  chairSeatColor: any,
  chairLegColor: any
) {
  const chairGroup = new threeModuleMin.Group();
  const seatCenterY = chairHeight * 0.49;
  const seatThickness = chairHeight * 0.12;
  const backOffsetZ = -chairDepth * 0.39;
  addBoxMesh(
    chairGroup,
    chairWidth * 0.9,
    seatThickness,
    chairDepth * 0.82,
    0,
    seatCenterY,
    chairDepth * 0.02,
    chairSeatColor,
    {
      radius: Math.min(chairWidth, chairDepth) * 0.06,
      roughness: 0.72
    }
  );
  addBoxMesh(
    chairGroup,
    chairWidth * 0.78,
    chairHeight * 0.34,
    chairDepth * 0.09,
    0,
    chairHeight * 0.78,
    backOffsetZ,
    chairSeatColor,
    {
      radius: Math.min(chairWidth, chairDepth) * 0.045,
      roughness: 0.72
    }
  );
  for (const legOffsetRatio of [-0.38, 0.38]) {
    addBoxMesh(
      chairGroup,
      0.05,
      chairHeight * 0.47,
      0.05,
      chairWidth * legOffsetRatio,
      chairHeight * 0.235,
      chairDepth * 0.34,
      chairLegColor,
      {
        rounded: false
      }
    );
    addBoxMesh(
      chairGroup,
      0.05,
      chairHeight * 0.94,
      0.05,
      chairWidth * legOffsetRatio,
      chairHeight * 0.47,
      backOffsetZ,
      chairLegColor,
      {
        rounded: false
      }
    );
  }
  chairGroup.position.set(chairX, 0, chairZ);
  chairGroup.rotation.y = chairRotation;
  chairParent.add(chairGroup);
}

/**
 * @returns {number} 纹理单元数量。
 */
export function countMaterialTextures(countedMaterial: any) {
  if (!countedMaterial || countedMaterial.isMeshBasicMaterial || countedMaterial.isShadowMaterial) {
    return 0;
  }
  let textureCount = Object.values(countedMaterial).filter(
    (materialTexture: any) => materialTexture?.isTexture === true
  ).length;
  if (countedMaterial.isMeshPhysicalMaterial && finite(countedMaterial.transmission, 0) > 0) {
    textureCount += 1;
  }
  return textureCount;
}

/**
 * 按安装方式算出电视机身高度与垂直中心相对总高的比例。
 * @returns {{bodyHeight: number, centerY: number}} 机身高度与中心高度（米）。
 */
export function computeTelevisionBodyMetrics(televisionMetricsItem: any, televisionBodyHeight: any) {
  const isMobileMount = televisionMetricsItem.tvMountStyle === "mobile";
  const isTabletopMount = televisionMetricsItem.tvMountStyle === "tabletop";
  return {
    bodyHeight: televisionBodyHeight * (isMobileMount ? 0.43 : isTabletopMount ? 0.56 : 1),
    centerY: televisionBodyHeight * (isMobileMount ? 0.76 : isTabletopMount ? 0.72 : 0.5)
  };
}

/**
 * 量出「机身高度带」里最靠前的那个面，屏幕贴它往前 3mm。
 */
export function measureTelevisionBodyFrontZ(parentObject: any, bodyMinY: any, bodyMaxY: any) {
  const externalModelRoot = parentObject.children.find(
    (modelChild: any) => modelChild.userData.externalModelRoot === true
  );
  if (!externalModelRoot) {
    // 顶上还是占位几何：它的机身厚度与偏移是照经验公式画的，交给调用方走同一条公式。
    return null;
  }
  parentObject.updateMatrixWorld(true);
  const parentInverse = new threeModuleMin.Matrix4().copy(parentObject.matrixWorld).invert();
  const meshMatrix = new threeModuleMin.Matrix4();
  const corner = new threeModuleMin.Vector3();
  const meshBounds = new threeModuleMin.Box3();
  let frontZ = -Infinity;
  externalModelRoot.traverse((televisionChild: any) => {
    if (!televisionChild.isMesh || !televisionChild.geometry) {
      return;
    }
    if (televisionChild.userData.televisionScreen || televisionChild.userData.televisionGlow) {
      return;
    }
    if (!televisionChild.geometry.boundingBox) {
      televisionChild.geometry.computeBoundingBox();
    }
    const geometryBounds = televisionChild.geometry.boundingBox;
    meshMatrix.multiplyMatrices(parentInverse, televisionChild.matrixWorld);
    meshBounds.makeEmpty();
    for (let cornerIndex = 0; cornerIndex < 8; cornerIndex += 1) {
      corner
        .set(
          cornerIndex & 1 ? geometryBounds.max.x : geometryBounds.min.x,
          cornerIndex & 2 ? geometryBounds.max.y : geometryBounds.min.y,
          cornerIndex & 4 ? geometryBounds.max.z : geometryBounds.min.z
        )
        .applyMatrix4(meshMatrix);
      meshBounds.expandByPoint(corner);
    }
    if (meshBounds.max.y < bodyMinY || meshBounds.min.y > bodyMaxY) {
      return;
    }
    frontZ = Math.max(frontZ, meshBounds.max.z);
  });
  return Number.isFinite(frontZ) ? frontZ : null;
}

export function addVehicleChargingEffect(
  chargingParent: any,
  chargingItem: any,
  chargingWidth: any,
  chargingDepth: any,
  chargingY: any
) {
  if (chargingItem.chargingEnabled !== true) {
    return;
  }
  const chargingCanvasElement = document.createElement("canvas");
  chargingCanvasElement.width = 256;
  chargingCanvasElement.height = 256;
  const chargingContext: any = chargingCanvasElement.getContext("2d");
  const glowCenter = chargingCanvasElement.width / 2;
  const glowGradient = chargingContext.createRadialGradient(
    glowCenter,
    glowCenter,
    0,
    glowCenter,
    glowCenter,
    glowCenter
  );
  glowGradient.addColorStop(0, "rgba(79, 239, 183, .48)");
  glowGradient.addColorStop(0.46, "rgba(79, 239, 183, .23)");
  glowGradient.addColorStop(1, "rgba(79, 239, 183, 0)");
  chargingContext.fillStyle = glowGradient;
  chargingContext.fillRect(0, 0, chargingCanvasElement.width, chargingCanvasElement.height);
  for (let glowPixelY = 18; glowPixelY < chargingCanvasElement.height - 18; glowPixelY += 10) {
    for (let glowPixelX = 18; glowPixelX < chargingCanvasElement.width - 18; glowPixelX += 10) {
      const glowDistanceRatio =
        Math.hypot(glowPixelX - glowCenter, glowPixelY - glowCenter) / glowCenter;
      const glowAlpha = Math.max(0, 1 - glowDistanceRatio) * 0.32;
      if (!(glowAlpha <= 0.01)) {
        chargingContext.fillStyle = "rgba(116, 255, 202, " + glowAlpha + ")";
        chargingContext.beginPath();
        chargingContext.arc(glowPixelX, glowPixelY, 1.45, 0, Math.PI * 2);
        chargingContext.fill();
      }
    }
  }
  const glowTexture = new threeModuleMin.CanvasTexture(chargingCanvasElement);
  glowTexture.colorSpace = threeModuleMin.SRGBColorSpace;
  glowTexture.needsUpdate = true;
  const chargingGlowMesh = new threeModuleMin.Mesh(
    new threeModuleMin.PlaneGeometry(chargingWidth * 1.72, chargingDepth * 1.42),
    new threeModuleMin.MeshBasicMaterial({
      map: glowTexture,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      toneMapped: false,
      side: threeModuleMin.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -3
    })
  );
  chargingGlowMesh.rotation.x = -Math.PI / 2;
  chargingGlowMesh.position.y = 0.014;
  chargingGlowMesh.renderOrder = 2;
  chargingGlowMesh.castShadow = false;
  chargingGlowMesh.receiveShadow = false;
  // 特效叠层，不是占位几何：小车模型加载完成时，finishItemModel 会把「此刻挂在模型组上的
  chargingGlowMesh.userData.homeosModelOverlay = true;
  chargingParent.add(chargingGlowMesh);
  const boltShape = new threeModuleMin.Shape();
  boltShape.moveTo(0.08, 0.5);
  boltShape.lineTo(-0.22, 0.04);
  boltShape.lineTo(-0.03, 0.04);
  boltShape.lineTo(-0.13, -0.5);
  boltShape.lineTo(0.25, -0.02);
  boltShape.lineTo(0.05, -0.02);
  boltShape.closePath();
  const chargingBoltMesh = new threeModuleMin.Mesh(
    new threeModuleMin.ShapeGeometry(boltShape),
    new threeModuleMin.MeshBasicMaterial({
      color: 8257488,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: threeModuleMin.AdditiveBlending,
      toneMapped: false,
      side: threeModuleMin.DoubleSide
    })
  );
  const boltScale = Math.max(Math.min(chargingWidth, chargingDepth) * 0.22, 0.18);
  chargingBoltMesh.scale.setScalar(boltScale);
  chargingBoltMesh.rotation.x = -Math.PI / 2;
  chargingBoltMesh.position.set(0, chargingY + 0.04, 0);
  chargingBoltMesh.renderOrder = 9;
  chargingBoltMesh.castShadow = false;
  chargingBoltMesh.receiveShadow = false;
  // 与光晕同理：闪电也是特效叠层，换模型时要留下（见上面 chargingGlowMesh 的说明）。
  chargingBoltMesh.userData.homeosModelOverlay = true;
  chargingParent.add(chargingBoltMesh);
}

export const LIGHT_PRECOMPILE_TIMEOUT_MS = 4500;

export function waitForShaderCompilation(targetRenderer: any, sceneToCompile: any, cameraToCompile: any, isStillCurrent: any) {
  const rendererGlContext = targetRenderer.getContext();
  if (
    !isStillCurrent() ||
    rendererGlContext.isContextLost() ||
    targetRenderer.extensions?.has("KHR_parallel_shader_compile") === false
  ) {
    return Promise.resolve(false);
  }
  targetRenderer.compile(sceneToCompile, cameraToCompile);
  let hasTransmission = false;
  sceneToCompile.traverse?.((compiledNode: any) => {
    if (
      (Array.isArray(compiledNode.material) ? compiledNode.material : [compiledNode.material]).some(
        (transmissiveMaterial: any) => transmissiveMaterial?.transmission > 0
      )
    ) {
      hasTransmission = true;
    }
  });
  if (hasTransmission) {
    const previousRenderTarget = targetRenderer.getRenderTarget();
    const previousActiveCubeFace = targetRenderer.getActiveCubeFace();
    const previousActiveMipmapLevel = targetRenderer.getActiveMipmapLevel();
    const compileRenderTarget = new threeModuleMin.WebGLRenderTarget(1, 1);
    try {
      targetRenderer.setRenderTarget(compileRenderTarget);
      targetRenderer.compile(sceneToCompile, cameraToCompile);
    } finally {
      targetRenderer.setRenderTarget(
        previousRenderTarget,
        previousActiveCubeFace,
        previousActiveMipmapLevel
      );
      compileRenderTarget.dispose();
    }
  }
  const shaderPrograms = [...targetRenderer.info.programs];
  const compileDeadline = performance.now() + LIGHT_PRECOMPILE_TIMEOUT_MS;
  return new Promise((resolveCompile, rejectCompile) => {
    const scheduleCompilePoll = () => {
      try {
        if (
          !isStillCurrent() ||
          targetRenderer.getContext() !== rendererGlContext ||
          rendererGlContext.isContextLost()
        ) {
          resolveCompile(false);
          return;
        }
        const compiledPrograms = new Set(targetRenderer.info.programs);
        /**
         * @returns {boolean} 是否有效。
         */
        const isProgramCompiled = (trackedProgram: any) =>
          compiledPrograms.has(trackedProgram) &&
          trackedProgram.program &&
          rendererGlContext.isProgram(trackedProgram.program);
        if (shaderPrograms.some(checkedProgram => !isProgramCompiled(checkedProgram))) {
          resolveCompile(false);
          return;
        }
        if (shaderPrograms.every(readyProgram => readyProgram.isReady())) {
          for (const waitingProgram of shaderPrograms) {
            if (!isProgramCompiled(waitingProgram)) {
              resolveCompile(false);
              return;
            }
            waitingProgram.getUniforms();
            if (!isProgramCompiled(waitingProgram)) {
              resolveCompile(false);
              return;
            }
            waitingProgram.getAttributes();
          }
          resolveCompile(true);
        } else if (performance.now() >= compileDeadline) {
          resolveCompile(false);
        } else {
          window.setTimeout(scheduleCompilePoll, 32);
        }
      } catch (compileError) {
        rejectCompile(compileError);
      }
    };
    window.setTimeout(scheduleCompilePoll, 0);
  });
}
