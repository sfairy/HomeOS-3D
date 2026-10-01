const clampOptionalNumber = (rawValue, fallback, minimum, maximum) => {
  const parsedValue = rawValue == null || rawValue === "" ? NaN : Number(rawValue);
  return Number.isFinite(parsedValue)
    ? Math.max(minimum, Math.min(maximum, parsedValue))
    : fallback;
};
export function normalizeCurtainTrack(inputOptions = {}) {
  return {
    ...(inputOptions.curtainForm === "roller"
      ? {
          curtainForm: "roller",
        }
      : {}),
    curtainTrack:
      inputOptions.curtainForm === "roller"
        ? "straight"
        : ["straight", "l", "u"].includes(inputOptions.curtainTrack)
          ? inputOptions.curtainTrack
          : "straight",
    curtainCorner: inputOptions.curtainCorner === "left" ? "left" : "right",
    curtainLeftLength: clampOptionalNumber(inputOptions.curtainLeftLength, 1.2, 0.2, 7.8),
    curtainRightLength: clampOptionalNumber(inputOptions.curtainRightLength, 1.2, 0.2, 7.8),
    curtainMeet: clampOptionalNumber(inputOptions.curtainMeet, 50, 5, 95),
    curtainPreview: clampOptionalNumber(inputOptions.curtainPreview, 0, 0, 100),
    ...(inputOptions.curtainFabric === "cloth" || inputOptions.curtainFabric === "sheer"
      ? {
          curtainFabric: inputOptions.curtainFabric,
        }
      : {}),
  };
}
export function curtainFootprintDepth(trackConfig) {
  const trackModel = normalizeCurtainTrack(trackConfig);
  return trackModel.curtainTrack === "straight"
    ? clampOptionalNumber(trackConfig.depth, 0.18, 0.05, 8)
    : 0.18 +
        (trackModel.curtainTrack === "u"
          ? Math.max(trackModel.curtainLeftLength, trackModel.curtainRightLength)
          : trackModel.curtainCorner === "left"
            ? trackModel.curtainLeftLength
            : trackModel.curtainRightLength);
}
export function createCurtainTrack(options = {}) {
  const normalizedTrack = normalizeCurtainTrack(options),
    width = clampOptionalNumber(options.width ?? options.curtainWidth, 1.8, 0.2, 8),
    leftReturnLength =
      normalizedTrack.curtainTrack === "u" ||
      (normalizedTrack.curtainTrack === "l" && normalizedTrack.curtainCorner === "left")
        ? normalizedTrack.curtainLeftLength
        : 0,
    rightReturnLength =
      normalizedTrack.curtainTrack === "u" ||
      (normalizedTrack.curtainTrack === "l" && normalizedTrack.curtainCorner === "right")
        ? normalizedTrack.curtainRightLength
        : 0,
    baseZ = -Math.max(leftReturnLength, rightReturnLength) / 2,
    vertices = [
      ...(leftReturnLength
        ? [
            {
              x: -width / 2,
              z: baseZ + leftReturnLength,
            },
          ]
        : []),
      {
        x: -width / 2,
        z: baseZ,
      },
      {
        x: width / 2,
        z: baseZ,
      },
      ...(rightReturnLength
        ? [
            {
              x: width / 2,
              z: baseZ + rightReturnLength,
            },
          ]
        : []),
    ],
    segments = [];
  let totalLength = 0;
  const addStraightSegment = (fromPoint, toPoint) => {
    const segmentLength = Math.hypot(toPoint.x - fromPoint.x, toPoint.z - fromPoint.z);
    if (segmentLength < 1e-8) return;
    const directionX = (toPoint.x - fromPoint.x) / segmentLength,
      directionZ = (toPoint.z - fromPoint.z) / segmentLength;
    (segments.push({
      start: totalLength,
      length: segmentLength,
      sample: (distanceAlong) => ({
        x: fromPoint.x + directionX * distanceAlong,
        z: fromPoint.z + directionZ * distanceAlong,
        tx: directionX,
        tz: directionZ,
      }),
    }),
      (totalLength += segmentLength));
  };
  let cursorPoint = vertices[0];
  for (let vertexIndex = 1; vertexIndex < vertices.length - 1; vertexIndex++) {
    const previousPoint = vertices[vertexIndex - 1],
      cornerPoint = vertices[vertexIndex],
      nextPoint = vertices[vertexIndex + 1],
      previousLength = Math.hypot(cornerPoint.x - previousPoint.x, cornerPoint.z - previousPoint.z),
      nextLength = Math.hypot(nextPoint.x - cornerPoint.x, nextPoint.z - cornerPoint.z),
      filletRadius = Math.min(0.08, previousLength / 3, nextLength / 3),
      previousDirectionX = (cornerPoint.x - previousPoint.x) / previousLength,
      previousDirectionZ = (cornerPoint.z - previousPoint.z) / previousLength,
      nextDirectionX = (nextPoint.x - cornerPoint.x) / nextLength,
      nextDirectionZ = (nextPoint.z - cornerPoint.z) / nextLength,
      arcStartPoint = {
        x: cornerPoint.x - previousDirectionX * filletRadius,
        z: cornerPoint.z - previousDirectionZ * filletRadius,
      };
    addStraightSegment(cursorPoint, arcStartPoint);
    const arcCenter = {
        x: arcStartPoint.x + nextDirectionX * filletRadius,
        z: arcStartPoint.z + nextDirectionZ * filletRadius,
      },
      startAngle = Math.atan2(arcStartPoint.z - arcCenter.z, arcStartPoint.x - arcCenter.x),
      turnSign = Math.sign(
        previousDirectionX * nextDirectionZ - previousDirectionZ * nextDirectionX,
      ),
      arcLength = (filletRadius * Math.PI) / 2;
    (segments.push({
      start: totalLength,
      length: arcLength,
      sample: (arcDistance) => {
        const arcAngle = startAngle + (turnSign * arcDistance) / filletRadius;
        return {
          x: arcCenter.x + filletRadius * Math.cos(arcAngle),
          z: arcCenter.z + filletRadius * Math.sin(arcAngle),
          tx: -turnSign * Math.sin(arcAngle),
          tz: turnSign * Math.cos(arcAngle),
        };
      },
    }),
      (totalLength += arcLength),
      (cursorPoint = {
        x: cornerPoint.x + nextDirectionX * filletRadius,
        z: cornerPoint.z + nextDirectionZ * filletRadius,
      }));
  }
  return (
    addStraightSegment(cursorPoint, vertices.at(-1)),
    {
      ...normalizedTrack,
      width: width,
      length: totalLength,
      vertices: vertices,
      sample(distance) {
        const clampedDistance = clampOptionalNumber(distance, 0, 0, totalLength),
          activeSegment =
            segments.find((segment) => clampedDistance <= segment.start + segment.length) ||
            segments.at(-1);
        return activeSegment.sample(
          Math.max(0, Math.min(activeSegment.length, clampedDistance - activeSegment.start)),
        );
      },
    }
  );
}
export function curtainPanelRanges(panelTrack, previewPercent = 0, position = "split") {
  const coverageScale = 1 - (0.88 * clampOptionalNumber(previewPercent, 0, 0, 100)) / 100,
    trackLength = panelTrack.length,
    meetOffset = (trackLength * panelTrack.curtainMeet) / 100;
  return [
    {
      visible: position !== "right",
      start: 0,
      end: (position === "split" ? meetOffset : trackLength) * coverageScale,
    },
    {
      visible: position !== "left",
      start:
        trackLength -
        (position === "split" ? trackLength - meetOffset : trackLength) * coverageScale,
      end: trackLength,
    },
  ];
}
export function createTrackClothGeometry(THREE, clothTrack, clothHeight, fabric = "cloth") {
  const folds = Math.max(
      4,
      Math.min(160, Math.round(clothTrack.length / (fabric === "sheer" ? 0.1 : 0.15))),
    ),
    segmentCount = Math.max(64, folds * 8),
    geometry = new THREE.PlaneGeometry(1, 1, segmentCount, 1);
  return (
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(new Float32Array((segmentCount + 1) * 6).fill(1), 3),
    ),
    (geometry.userData.curtainCloth = {
      segments: segmentCount,
      height: clothHeight,
      folds: folds,
      fabric: fabric,
      amplitude: fabric === "sheer" ? 0.023 : 0.046,
    }),
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage),
    geometry
  );
}
export function poseTrackCloth(clothGeometry, posedTrack, panel) {
  const {
      segments: meshSegments,
      height: height,
      folds: foldCount,
      fabric: fabricKind,
      amplitude: amplitude,
    } = clothGeometry.userData.curtainCloth,
    positionAttribute = clothGeometry.attributes.position,
    foldRatio = panel.side === 0 ? posedTrack.curtainMeet / 100 : 1 - posedTrack.curtainMeet / 100,
    panelFoldCount = Math.max(2, Math.round(foldCount * (panel.split ? foldRatio : 1)));
  for (let segmentIndex = 0; segmentIndex <= meshSegments; segmentIndex++) {
    const foldFraction = segmentIndex / meshSegments,
      trackPoint = posedTrack.sample(panel.start + (panel.end - panel.start) * foldFraction),
      waveOffset = amplitude * Math.sin(foldFraction * panelFoldCount * Math.PI * 2),
      foldDarkness = 0.5 - 0.5 * Math.sin(foldFraction * panelFoldCount * Math.PI * 2),
      foldShade = 1 - (fabricKind === "sheer" ? 0.16 : 0.34) * foldDarkness * foldDarkness;
    for (let colorRowIndex = 0; colorRowIndex < 2; colorRowIndex++)
      clothGeometry.attributes.color.setXYZ(
        colorRowIndex * (meshSegments + 1) + segmentIndex,
        foldShade,
        foldShade,
        foldShade,
      );
    for (let positionRowIndex = 0; positionRowIndex < 2; positionRowIndex++)
      positionAttribute.setXYZ(
        positionRowIndex * (meshSegments + 1) + segmentIndex,
        trackPoint.x - trackPoint.tz * waveOffset,
        0.06 + (positionRowIndex === 0 ? Math.max(0.1, height - 0.12) : 0),
        trackPoint.z + trackPoint.tx * waveOffset,
      );
  }
  ((positionAttribute.needsUpdate = true),
    (clothGeometry.attributes.color.needsUpdate = true),
    clothGeometry.computeVertexNormals(),
    clothGeometry.computeBoundingBox(),
    clothGeometry.computeBoundingSphere());
}
export function addTrackCurtain(three, rigRoot, curtainOptions, colorOverrides = {}) {
  if (curtainOptions.curtainForm === "roller") {
    const rollerRig = createRollerCurtain(three, curtainOptions, colorOverrides);
    return (
      (rigRoot.userData.curtainRigRoot = true),
      (rigRoot.userData.curtainRigBasis = [
        rollerRig.width,
        rollerRig.height,
        curtainFootprintDepth(curtainOptions),
      ]),
      (rigRoot.userData.curtainRollerModel = true),
      rigRoot.add(rollerRig.group),
      rollerRig.pose(curtainOptions.curtainPreview),
      rigRoot
    );
  }
  const curtainTrack = createCurtainTrack(curtainOptions),
    curtainHeight = clampOptionalNumber(curtainOptions.height, 2.4, 0.2, 6),
    curtainFabric = curtainOptions.curtainFabric || "cloth";
  ((rigRoot.userData.curtainRigRoot = true),
    (rigRoot.userData.curtainTrackModel = true),
    (rigRoot.userData.curtainRigBasis = [
      curtainTrack.width,
      curtainHeight,
      curtainFootprintDepth(curtainOptions),
    ]));
  class CurtainTrackCurve extends three.Curve {
    ["getPoint"](curveT, target = new three.Vector3()) {
      const curvePoint = curtainTrack.sample(curveT * curtainTrack.length);
      return target.set(curvePoint.x, curtainHeight - 0.025, curvePoint.z);
    }
  }
  const rodMaterial = new three.MeshStandardMaterial({
      color: colorOverrides.dark ?? 6647932,
      roughness: 0.38,
      metalness: 0.5,
    }),
    rodMesh = new three.Mesh(
      new three.TubeGeometry(
        new CurtainTrackCurve(),
        Math.max(32, Math.ceil(curtainTrack.length * 24)),
        0.015,
        8,
        false,
      ),
      rodMaterial,
    );
  ((rodMesh.userData.curtainPart = "rod"), rigRoot.add(rodMesh));
  const clothMaterial = new three.MeshStandardMaterial({
    color: curtainFabric === "sheer" ? 16118766 : (colorOverrides.light ?? 13094354),
    roughness: 0.94,
    vertexColors: true,
    side: three.DoubleSide,
    transparent: curtainFabric === "sheer",
    opacity: curtainFabric === "sheer" ? 0.48 : 1,
    depthWrite: curtainFabric !== "sheer",
  });
  clothMaterial.forceSinglePass = true;
  const panelPosition = ["left", "right", "split"].includes(curtainOptions.curtainPosition)
    ? curtainOptions.curtainPosition
    : "split";
  return (
    curtainPanelRanges(curtainTrack, curtainTrack.curtainPreview, panelPosition).forEach(
      (panelRange, sideIndex) => {
        const clothPieceGeometry = createTrackClothGeometry(
          three,
          curtainTrack,
          curtainHeight,
          curtainFabric,
        );
        poseTrackCloth(clothPieceGeometry, curtainTrack, {
          ...panelRange,
          side: sideIndex,
          split: panelPosition === "split",
        });
        const clothMesh = new three.Mesh(clothPieceGeometry, clothMaterial);
        ((clothMesh.visible = panelRange.visible),
          (clothMesh.userData.curtainPart = "cloth"),
          (clothMesh.castShadow = curtainFabric !== "sheer"),
          (clothMesh.receiveShadow = true),
          rigRoot.add(clothMesh));
      },
    ),
    rigRoot
  );
}
export function createRollerCurtain(rollerThree, rollerOptions = {}, rollerColorOverrides = {}) {
  const rollerWidth = clampOptionalNumber(
      rollerOptions.width ?? rollerOptions.curtainWidth,
      1.8,
      0.2,
      8,
    ),
    rollerHeight = clampOptionalNumber(rollerOptions.height, 2.4, 0.2, 6),
    rollerTubeRadius = Math.min(0.045, rollerHeight * 0.12),
    rollerFabricThickness = 0.0016,
    rollerTopY =
      rollerHeight -
      Math.sqrt(
        rollerTubeRadius * rollerTubeRadius + (rollerHeight * rollerFabricThickness) / Math.PI,
      ),
    rollerPanelHeight = Math.max(0.04, rollerTopY - 0.035),
    rollerGroup = new rollerThree.Group(),
    rollerParts = [],
    isRollerSheer = rollerOptions.curtainFabric === "sheer",
    rollerClothMaterial =
      rollerColorOverrides.material ||
      new rollerThree.MeshStandardMaterial({
        color: rollerColorOverrides.light ?? 13094354,
        roughness: 0.94,
        side: rollerThree.DoubleSide,
        transparent: isRollerSheer,
        opacity: isRollerSheer ? 0.48 : 1,
        depthWrite: !isRollerSheer,
      });
  rollerClothMaterial.vertexColors = false;
  const rollerMetalMaterial = new rollerThree.MeshStandardMaterial({
      color: rollerColorOverrides.dark ?? 8884634,
      roughness: 0.4,
      metalness: 0.45,
    }),
    addRollerPart = (rollerGeometry, rollerMaterial, rollerPartName) => {
      const rollerMesh = new rollerThree.Mesh(rollerGeometry, rollerMaterial);
      return (
        (rollerMesh.userData.curtainPart = rollerPartName),
        (rollerMesh.castShadow = !isRollerSheer),
        (rollerMesh.receiveShadow = true),
        rollerParts.push(rollerMesh),
        rollerGroup.add(rollerMesh),
        rollerMesh
      );
    },
    rollerPanelMesh = addRollerPart(
      new rollerThree.PlaneGeometry(rollerWidth, rollerPanelHeight),
      rollerClothMaterial,
      "cloth",
    ),
    rollerTubeMesh = addRollerPart(
      new rollerThree.CylinderGeometry(1, 1, rollerWidth, 32),
      rollerClothMaterial,
      "cloth",
    );
  ((rollerTubeMesh.rotation.z = Math.PI / 2), (rollerTubeMesh.position.y = rollerTopY));
  const rollerBottomBarMesh = addRollerPart(
    new rollerThree.BoxGeometry(rollerWidth + 0.018, 0.025, 0.028),
    rollerMetalMaterial,
    "band",
  );
  for (const rollerEndX of [-rollerWidth / 2 - 0.018, rollerWidth / 2 + 0.018])
    addRollerPart(
      new rollerThree.BoxGeometry(0.025, rollerTubeRadius * 2.5, rollerTubeRadius * 2.5),
      rollerMetalMaterial,
      "cap",
    ).position.set(rollerEndX, rollerTopY, 0);
  function poseRollerCurtain(rollerPreviewPercent = 0) {
    const rolledFraction = clampOptionalNumber(rollerPreviewPercent, 0, 0, 100) / 100,
      rolledLength = rollerPanelHeight * rolledFraction,
      hangingLength = rollerPanelHeight - rolledLength,
      currentTubeRadius = Math.sqrt(
        rollerTubeRadius * rollerTubeRadius + (rolledLength * rollerFabricThickness) / Math.PI,
      ),
      rollerPositionAttribute = rollerPanelMesh.geometry.attributes.position,
      rollerUvAttribute = rollerPanelMesh.geometry.attributes.uv;
    for (let rollerVertexIndex = 0; rollerVertexIndex < 4; rollerVertexIndex++) {
      const isTopVertex = rollerVertexIndex < 2;
      (rollerPositionAttribute.setXYZ(
        rollerVertexIndex,
        rollerVertexIndex % 2 ? rollerWidth / 2 : -rollerWidth / 2,
        isTopVertex ? rollerTopY : rollerTopY - hangingLength,
        currentTubeRadius,
      ),
        rollerUvAttribute.setY(rollerVertexIndex, isTopVertex ? 1 - rolledFraction : 0));
    }
    return (
      (rollerPositionAttribute.needsUpdate = true),
      (rollerUvAttribute.needsUpdate = true),
      rollerPanelMesh.geometry.computeBoundingBox(),
      rollerPanelMesh.geometry.computeBoundingSphere(),
      (rollerPanelMesh.visible = hangingLength > 0.0001),
      rollerTubeMesh.scale.set(currentTubeRadius, 1, currentTubeRadius),
      (rollerTubeMesh.rotation.x =
        (-2 * Math.PI * (currentTubeRadius - rollerTubeRadius)) / rollerFabricThickness),
      rollerBottomBarMesh.position.set(0, rollerTopY - hangingLength, currentTubeRadius),
      {
        top: rollerTopY,
        bottom: rollerTopY - hangingLength,
        radius: currentTubeRadius,
        hanging: hangingLength,
      }
    );
  }
  return (
    poseRollerCurtain(rollerOptions.curtainPreview),
    {
      group: rollerGroup,
      meshes: rollerParts,
      material: rollerClothMaterial,
      width: rollerWidth,
      height: rollerHeight,
      pose: poseRollerCurtain,
      dispose({ keepMaterial: keepMaterial = false } = {}) {
        for (const rollerPart of rollerParts) rollerPart.geometry.dispose();
        (rollerMetalMaterial.dispose(), keepMaterial || rollerClothMaterial.dispose());
      },
    }
  );
}
export function createDreamBladeGeometry(bladeThree, bladeTrack, bladeHeight) {
  const bladeCount = Math.max(4, Math.min(160, Math.ceil(bladeTrack.length / 0.12))),
    bladeGeometry = new bladeThree.BufferGeometry();
  bladeGeometry.setAttribute(
    "position",
    new bladeThree.Float32BufferAttribute(new Float32Array(bladeCount * 12), 3),
  );
  const bladeColorValues = [];
  for (let bladeIndex = 0; bladeIndex < bladeCount; bladeIndex++)
    for (const bladeShade of [0.72, 1, 0.72, 1])
      bladeColorValues.push(bladeShade, bladeShade, bladeShade);
  (bladeGeometry.setAttribute("color", new bladeThree.Float32BufferAttribute(bladeColorValues, 3)),
    bladeGeometry.attributes.position.setUsage(bladeThree.DynamicDrawUsage));
  const indices = [];
  for (let bladeQuadIndex = 0; bladeQuadIndex < bladeCount; bladeQuadIndex++) {
    const vertexOffset = bladeQuadIndex * 4;
    indices.push(
      vertexOffset,
      vertexOffset + 1,
      vertexOffset + 2,
      vertexOffset + 2,
      vertexOffset + 1,
      vertexOffset + 3,
    );
  }
  return (
    bladeGeometry.setIndex(indices),
    (bladeGeometry.userData.dreamBlades = {
      count: bladeCount,
      height: bladeHeight,
      width: (bladeTrack.length / bladeCount) * 1.08,
    }),
    bladeGeometry
  );
}
export function poseDreamBlades(bladeStripGeometry, dreamTrack, dreamPanel, tiltPercent = 50) {
  const {
      count: bladeTotal,
      height: bladeTopY,
      width: bladeWidth,
    } = bladeStripGeometry.userData.dreamBlades,
    bladePositions = bladeStripGeometry.attributes.position,
    activeBladeCount = Math.max(
      2,
      Math.round(
        bladeTotal *
          (dreamPanel.split
            ? dreamPanel.side === 0
              ? dreamTrack.curtainMeet / 100
              : 1 - dreamTrack.curtainMeet / 100
            : 1),
      ),
    ),
    tiltEpsilon = 0.02,
    tiltAngle = Math.max(
      tiltEpsilon,
      Math.min(
        Math.PI - tiltEpsilon,
        (clampOptionalNumber(tiltPercent, 50, 0, 100) * Math.PI) / 100,
      ),
    );
  for (let bladeCursor = 0; bladeCursor < bladeTotal; bladeCursor++) {
    const bladeTrackPoint = dreamTrack.sample(
        dreamPanel.start +
          ((dreamPanel.end - dreamPanel.start) *
            (Math.min(bladeCursor, activeBladeCount - 1) + 0.5)) /
            activeBladeCount,
      ),
      halfSpan = bladeCursor < activeBladeCount ? bladeWidth / 2 : 0,
      offsetX =
        (bladeTrackPoint.tx * Math.cos(tiltAngle) - bladeTrackPoint.tz * Math.sin(tiltAngle)) *
        halfSpan,
      offsetZ =
        (bladeTrackPoint.tz * Math.cos(tiltAngle) + bladeTrackPoint.tx * Math.sin(tiltAngle)) *
        halfSpan;
    (bladePositions.setXYZ(
      bladeCursor * 4,
      bladeTrackPoint.x - offsetX,
      0.06,
      bladeTrackPoint.z - offsetZ,
    ),
      bladePositions.setXYZ(
        bladeCursor * 4 + 1,
        bladeTrackPoint.x + offsetX,
        0.06,
        bladeTrackPoint.z + offsetZ,
      ),
      bladePositions.setXYZ(
        bladeCursor * 4 + 2,
        bladeTrackPoint.x - offsetX,
        bladeTopY - 0.06,
        bladeTrackPoint.z - offsetZ,
      ),
      bladePositions.setXYZ(
        bladeCursor * 4 + 3,
        bladeTrackPoint.x + offsetX,
        bladeTopY - 0.06,
        bladeTrackPoint.z + offsetZ,
      ));
  }
  ((bladePositions.needsUpdate = true),
    bladeStripGeometry.computeVertexNormals(),
    bladeStripGeometry.computeBoundingBox(),
    bladeStripGeometry.computeBoundingSphere());
}
