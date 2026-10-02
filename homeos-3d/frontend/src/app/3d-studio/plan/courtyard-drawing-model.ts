import { courtyardPalette } from "./courtyard-models";
import { decorateWarmFloor } from "../studio/studio-scene-style";
import {
  localPoints,
  pathPoints,
  samplePath,
  clippedLine,
  validLoop,
  validHole,
  surfaceRegions,
  hedgeSamples,
  courtyardSurfaceRise,
} from "./courtyard-drawing";
export function createCourtyardDrawingModel(
  three,
  mergeGeometries,
  courtyardNode,
  options,
  surfaceExclusions = [],
) {
  const drawingGroup = new three.Group(),
    drawing = courtyardNode.drawing,
    paletteVariant = options.warmWood ? "warm" : "default",
    paletteKey =
      courtyardNode.type === "courtyard-area"
        ? "garden-" + drawing.style
        : courtyardNode.type === "courtyard-path"
          ? "garden-stepping"
          : drawing.style === "hedge"
            ? "garden-hedge"
            : ["wall", "brick"].includes(drawing.style)
              ? "garden-low-wall"
              : drawing.style === "metal"
                ? "garden-gate"
                : "garden-fence",
    palette = courtyardPalette(paletteKey, paletteVariant),
    geometriesByColor = new Map();
  function addGeometryByColor(geometry, colorKey) {
    (geometriesByColor.has(colorKey) || geometriesByColor.set(colorKey, []),
      geometriesByColor.get(colorKey).push(geometry.index ? geometry.toNonIndexed() : geometry),
      geometry.index && geometry.dispose());
  }
  function addBox(centerX, centerY, centerZ, width, height, depth, boxColor, yawRad = 0) {
    if (width <= 0 || height <= 0 || depth <= 0) return;
    const boxGeometry = new three.BoxGeometry(width, height, depth);
    (boxGeometry.rotateY(-yawRad),
      boxGeometry.translate(centerX, centerY, centerZ),
      addGeometryByColor(boxGeometry, boxColor));
  }
  function addBeam(beamStartPoint, beamEndPoint, beamCenterY, beamThickness, beamColor) {
    const beamLength = Math.hypot(
      beamEndPoint.x - beamStartPoint.x,
      beamEndPoint.y - beamStartPoint.y,
    );
    addBox(
      (beamStartPoint.x + beamEndPoint.x) / 2,
      beamCenterY,
      (beamStartPoint.y + beamEndPoint.y) / 2,
      beamLength,
      beamThickness,
      beamThickness,
      beamColor,
      Math.atan2(beamEndPoint.y - beamStartPoint.y, beamEndPoint.x - beamStartPoint.x),
    );
  }
  function createShape(shapeOutlinePoints, shapeHoleLoops = []) {
    const shape = new three.Shape(
      shapeOutlinePoints.map(
        (shapeOutlinePoint) => new three.Vector2(shapeOutlinePoint.x, -shapeOutlinePoint.y),
      ),
    );
    for (const holeLoop of shapeHoleLoops)
      shape.holes.push(
        new three.Path(
          holeLoop.map((holeLoopPoint) => new three.Vector2(holeLoopPoint.x, -holeLoopPoint.y)),
        ),
      );
    return shape;
  }
  function addExtrusion(
    extrudeOutlinePoints,
    extrudeHoleLoops,
    extrudeDepth,
    extrudeColor,
    extrudeYOffset = 0,
  ) {
    const extrudeGeometry = new three.ExtrudeGeometry(
      createShape(extrudeOutlinePoints, extrudeHoleLoops),
      {
        depth: extrudeDepth,
        bevelEnabled: false,
        steps: 1,
        curveSegments: 1,
      },
    );
    (extrudeGeometry.rotateX(-Math.PI / 2),
      extrudeGeometry.translate(0, extrudeYOffset, 0),
      addGeometryByColor(extrudeGeometry, extrudeColor));
  }
  if (courtyardNode.type === "courtyard-area") {
    const areaOutlinePoints = localPoints(courtyardNode);
    if (!validLoop(areaOutlinePoints)) return drawingGroup;
    const validHoleLoops = [];
    for (const holeOutlinePoints of drawing.holes.map((hole) => localPoints(courtyardNode, hole)))
      validHole(holeOutlinePoints, areaOutlinePoints, validHoleLoops) &&
        validHoleLoops.push(holeOutlinePoints);
    const surfaceColor =
        drawing.style === "lawn"
          ? palette.leaf
          : drawing.style === "deck"
            ? palette.base
            : palette.light,
      regions = surfaceRegions(courtyardNode, surfaceExclusions),
      surfaceTopY = -0.006 + courtyardSurfaceRise(courtyardNode);
    for (const region of regions) {
      const regionGeometry = new three.ShapeGeometry(createShape(region.outline, region.holes));
      (regionGeometry.rotateX(-Math.PI / 2),
        regionGeometry.translate(0, surfaceTopY, 0),
        addGeometryByColor(regionGeometry, surfaceColor));
      const extrusionDepth =
        Math.max(0, Number(courtyardNode.elevation) || 0) + courtyardSurfaceRise(courtyardNode);
      if (extrusionDepth > 0) {
        const regionExtrudeGeometry = new three.ExtrudeGeometry(
            createShape(region.outline, region.holes),
            {
              depth: extrusionDepth,
              bevelEnabled: false,
              steps: 1,
            },
          ),
          sideGroup = regionExtrudeGeometry.groups.find(
            (extrusionGroup) => extrusionGroup.materialIndex === 1,
          );
        if (sideGroup) {
          const positionAttribute = regionExtrudeGeometry.getAttribute("position"),
            sideGeometry = new three.BufferGeometry();
          (sideGeometry.setAttribute(
            "position",
            new three.Float32BufferAttribute(
              positionAttribute.array.slice(
                sideGroup.start * 3,
                (sideGroup.start + sideGroup.count) * 3,
              ),
              3,
            ),
          ),
            sideGeometry.computeVertexNormals(),
            sideGeometry.rotateX(-Math.PI / 2),
            sideGeometry.translate(0, surfaceTopY - extrusionDepth, 0),
            addGeometryByColor(sideGeometry, options.floor ?? palette.light));
        }
        regionExtrudeGeometry.dispose();
      }
    }
    if (drawing.style !== "lawn") {
      const patternAngleRad = (drawing.angle * Math.PI) / 180,
        patternCos = Math.cos(patternAngleRad),
        patternSin = Math.sin(patternAngleRad),
        diagonalLength = Math.hypot(courtyardNode.width, courtyardNode.depth),
        lineVertices = [],
        rotatePatternPoint = (patternPoint) => ({
          x: patternPoint.x * patternCos - patternPoint.y * patternSin,
          y: patternPoint.x * patternSin + patternPoint.y * patternCos,
        }),
        traceClippedSegment = (clipStartPoint, clipEndPoint) => {
          for (const [segmentStart, segmentEnd] of regions.flatMap((clipRegion) =>
            clippedLine(rotatePatternPoint(clipStartPoint), rotatePatternPoint(clipEndPoint), [
              clipRegion.outline,
              ...clipRegion.holes,
            ]),
          ))
            lineVertices.push(
              segmentStart.x,
              surfaceTopY + 0.002,
              segmentStart.y,
              segmentEnd.x,
              surfaceTopY + 0.002,
              segmentEnd.y,
            );
        },
        patternWidth = Math.max(drawing.patternWidth, diagonalLength / 180),
        patternLength = Math.max(drawing.patternLength, diagonalLength / 100);
      for (
        let rowIndex = Math.ceil(-diagonalLength / patternWidth);
        rowIndex <= diagonalLength / patternWidth;
        rowIndex++
      ) {
        const rowOffset = rowIndex * patternWidth;
        if (
          (traceClippedSegment(
            {
              x: -diagonalLength,
              y: rowOffset,
            },
            {
              x: diagonalLength,
              y: rowOffset,
            },
          ),
          drawing.style === "paving")
        ) {
          for (
            let columnOffset = -diagonalLength + ((rowIndex % 2) * patternLength) / 2;
            columnOffset <= diagonalLength;
            columnOffset += patternLength
          )
            traceClippedSegment(
              {
                x: columnOffset,
                y: rowOffset,
              },
              {
                x: columnOffset,
                y: rowOffset + patternWidth,
              },
            );
        }
      }
      const lineGeometry = new three.BufferGeometry();
      lineGeometry.setAttribute("position", new three.Float32BufferAttribute(lineVertices, 3));
      const lineSegments = new three.LineSegments(
        lineGeometry,
        new three.LineBasicMaterial({
          color: drawing.style === "deck" ? palette.dark : palette.base,
        }),
      );
      drawingGroup.add(lineSegments);
    }
  } else {
    if (courtyardNode.type === "courtyard-path") {
      const pathSamples = samplePath(
        pathPoints(courtyardNode),
        Math.max(drawing.spacing, drawing.stoneDepth + 0.05),
      );
      for (const pathSample of pathSamples) {
        let stoneOutline;
        drawing.style === "square"
          ? (stoneOutline = [
              [-0.5, -0.5],
              [0.5, -0.5],
              [0.5, 0.5],
              [-0.5, 0.5],
            ])
          : (stoneOutline = Array.from(
              {
                length: drawing.style === "round" ? 12 : 7,
              },
              (unusedValue, stoneIndex) => {
                const stoneAngleRad =
                    (stoneIndex * Math.PI * 2) / (drawing.style === "round" ? 12 : 7),
                  radiusFactor =
                    drawing.style === "round" ? 1 : [1, 0.88, 1, 0.9, 0.94, 1, 0.85][stoneIndex];
                return [
                  Math.cos(stoneAngleRad) * 0.5 * radiusFactor,
                  Math.sin(stoneAngleRad) * 0.5 * radiusFactor,
                ];
              },
            ));
        const stoneRotationRad = pathSample.angle - Math.PI / 2,
          stoneCos = Math.cos(stoneRotationRad),
          stoneSin = Math.sin(stoneRotationRad);
        addExtrusion(
          stoneOutline.map(([outlineX, outlineY]) => ({
            x:
              pathSample.x +
              outlineX * drawing.stoneWidth * stoneCos -
              outlineY * drawing.stoneDepth * stoneSin,
            y:
              pathSample.y +
              outlineX * drawing.stoneWidth * stoneSin +
              outlineY * drawing.stoneDepth * stoneCos,
          })),
          [],
          courtyardNode.height,
          palette.light,
        );
      }
    } else {
      if (drawing.style === "hedge")
        for (const hedgeSample of hedgeSamples(courtyardNode, drawing.openings || [])) {
          const hedgeSphereGeometry = new three.SphereGeometry(1, 8, 6);
          (hedgeSphereGeometry.scale(
            drawing.thickness * 1.5,
            courtyardNode.height / 2,
            drawing.thickness * 1.5,
          ),
            hedgeSphereGeometry.translate(hedgeSample.x, courtyardNode.height / 2, hedgeSample.y),
            addGeometryByColor(hedgeSphereGeometry, palette.leaf));
        }
      else {
        let addPost = function (postPoint) {
          const pointKey = postPoint.x.toFixed(4) + ":" + postPoint.y.toFixed(4);
          seenPointKeysSet.has(pointKey) ||
            postCount++ > 3000 ||
            (seenPointKeysSet.add(pointKey),
            addBox(
              postPoint.x,
              (slatBottomY + wallHeight) / 2,
              postPoint.y,
              wallThickness,
              wallHeight - slatBottomY,
              wallThickness,
              railColor,
            ),
            addBox(
              postPoint.x,
              wallHeight + 0.015,
              postPoint.y,
              wallThickness * 1.18,
              0.03,
              wallThickness * 1.18,
              railColor,
            ));
        };
        const outlinePathPoints = pathPoints(courtyardNode),
          wallHeight = courtyardNode.height,
          wallThickness = drawing.thickness,
          isWallStyle = ["wall", "brick", "slatwall"].includes(drawing.style),
          isMetalStyle = drawing.style === "metal",
          railColor = isMetalStyle ? palette.dark : palette.base,
          capHeight = drawing.style === "slatwall" ? Math.min(0.05, wallHeight * 0.08) : 0.05,
          slatBottomY = drawing.style === "slatwall" ? wallHeight * 0.4 + capHeight : 0,
          seenPointKeysSet = new Set();
        let distanceAlong = 0,
          postCount = 0;
        const openings = [
          ...(drawing.openings || []),
          ...(drawing.gateWidth > 0
            ? [
                {
                  offset: drawing.gateOffset,
                  width: drawing.gateWidth,
                },
              ]
            : []),
        ];
        for (let segmentIndex = 1; segmentIndex < outlinePathPoints.length; segmentIndex++) {
          const segmentStartPoint = outlinePathPoints[segmentIndex - 1],
            segmentEndPoint = outlinePathPoints[segmentIndex],
            segmentLength = Math.hypot(
              segmentEndPoint.x - segmentStartPoint.x,
              segmentEndPoint.y - segmentStartPoint.y,
            );
          if (segmentLength < 0.001) continue;
          const directionX = (segmentEndPoint.x - segmentStartPoint.x) / segmentLength,
            directionY = (segmentEndPoint.y - segmentStartPoint.y) / segmentLength,
            pointAtDistance = (distance) => ({
              x: segmentStartPoint.x + directionX * distance,
              y: segmentStartPoint.y + directionY * distance,
            }),
            cutDistances = [0, segmentLength];
          for (const opening of openings)
            for (const openingEdge of [opening.offset, opening.offset + opening.width])
              openingEdge > distanceAlong &&
                openingEdge < distanceAlong + segmentLength &&
                cutDistances.push(openingEdge - distanceAlong);
          cutDistances.sort((leftDistance, rightDistance) => leftDistance - rightDistance);
          for (let cutIndex = 1; cutIndex < cutDistances.length; cutIndex++) {
            const cutStart = cutDistances[cutIndex - 1],
              cutEnd = cutDistances[cutIndex],
              cutMidpoint = distanceAlong + (cutStart + cutEnd) / 2;
            if (
              openings.some(
                (checkedOpening) =>
                  cutMidpoint > checkedOpening.offset &&
                  cutMidpoint < checkedOpening.offset + checkedOpening.width,
              )
            )
              continue;
            const isAlignedToOpeningEnd = openings.some(
                (endMatchOpening) =>
                  Math.abs(
                    distanceAlong + cutStart - endMatchOpening.offset - endMatchOpening.width,
                  ) < 0.000001,
              ),
              isAlignedToOpeningStart = openings.some(
                (startMatchOpening) =>
                  Math.abs(distanceAlong + cutEnd - startMatchOpening.offset) < 0.000001,
              ),
              panelStart = cutStart + (isAlignedToOpeningEnd ? 0.002 : 0),
              panelEnd = cutEnd - (isAlignedToOpeningStart ? 0.002 : 0);
            if (panelEnd - panelStart < 0.001) continue;
            const panelStartPoint = pointAtDistance(panelStart),
              panelEndPoint = pointAtDistance(panelEnd),
              panelLength = panelEnd - panelStart,
              panelAngleRad = Math.atan2(directionY, directionX);
            if (isWallStyle) {
              const slatHeight = drawing.style === "slatwall" ? wallHeight * 0.4 : wallHeight;
              if (
                (addBox(
                  (panelStartPoint.x + panelEndPoint.x) / 2,
                  slatHeight / 2,
                  (panelStartPoint.y + panelEndPoint.y) / 2,
                  panelLength,
                  slatHeight,
                  wallThickness,
                  palette.light,
                  panelAngleRad,
                ),
                addBox(
                  (panelStartPoint.x + panelEndPoint.x) / 2,
                  slatHeight + capHeight / 2,
                  (panelStartPoint.y + panelEndPoint.y) / 2,
                  panelLength,
                  capHeight,
                  wallThickness * 1.15,
                  palette.base,
                  panelAngleRad,
                ),
                drawing.style === "brick")
              )
                for (
                  let brickRowIndex = 0;
                  brickRowIndex < Math.min(25, wallHeight / 0.2);
                  brickRowIndex++
                ) {
                  const brickRowPoint = pointAtDistance((panelStart + panelEnd) / 2);
                  brickRowIndex &&
                    addBox(
                      brickRowPoint.x,
                      brickRowIndex * 0.2,
                      brickRowPoint.y,
                      panelLength,
                      0.012,
                      wallThickness * 1.02,
                      palette.base,
                      panelAngleRad,
                    );
                  for (
                    let brickOffset = 0.4 + (brickRowIndex % 2) * 0.25;
                    brickOffset < panelLength;
                    brickOffset += 0.5
                  ) {
                    const brickPoint = pointAtDistance(panelStart + brickOffset);
                    addBox(
                      brickPoint.x,
                      brickRowIndex * 0.2 + 0.1,
                      brickPoint.y,
                      0.012,
                      Math.min(0.19, wallHeight - brickRowIndex * 0.2),
                      wallThickness * 1.02,
                      palette.base,
                      panelAngleRad,
                    );
                  }
                }
              if (drawing.style !== "slatwall") continue;
            }
            const slatCount = Math.min(150, Math.max(1, Math.ceil(panelLength / drawing.spacing))),
              cornerInset =
                ((wallThickness * 1.18) / 2) * (Math.abs(directionX) + Math.abs(directionY)),
              insetStart = panelStart + (isAlignedToOpeningEnd ? cornerInset : 0),
              insetEnd = panelEnd - (isAlignedToOpeningStart ? cornerInset : 0);
            if (insetEnd >= insetStart) {
              for (let slatIndex = 0; slatIndex <= slatCount; slatIndex++)
                addPost(
                  pointAtDistance(insetStart + ((insetEnd - insetStart) * slatIndex) / slatCount),
                );
            }
            if (drawing.style === "horizontal") {
              for (let railIndex = 1; railIndex <= 4; railIndex++)
                addBeam(
                  panelStartPoint,
                  panelEndPoint,
                  (wallHeight * railIndex) / 5,
                  Math.min(0.12, wallThickness * 0.75),
                  railColor,
                );
            } else {
              if (drawing.style === "lattice") {
                for (const latticeRailY of [0.1, wallHeight - 0.1])
                  addBeam(panelStartPoint, panelEndPoint, latticeRailY, 0.06, railColor);
                for (let latticeIndex = 0; latticeIndex < slatCount; latticeIndex++) {
                  const cellStart =
                      panelStart +
                      (panelLength * latticeIndex) / slatCount +
                      (latticeIndex === 0 && isAlignedToOpeningEnd ? 0.045 : 0),
                    cellEnd =
                      panelStart +
                      (panelLength * (latticeIndex + 1)) / slatCount -
                      (latticeIndex === slatCount - 1 && isAlignedToOpeningStart ? 0.045 : 0);
                  if (!(cellEnd <= cellStart))
                    for (const isTopRail of [false, true]) {
                      const cellStartPoint = pointAtDistance(cellStart),
                        cellEndPoint = pointAtDistance(cellEnd),
                        cellStartVector = new three.Vector3(
                          cellStartPoint.x,
                          isTopRail ? wallHeight - 0.12 : 0.12,
                          cellStartPoint.y,
                        ),
                        cellEndVector = new three.Vector3(
                          cellEndPoint.x,
                          isTopRail ? 0.12 : wallHeight - 0.12,
                          cellEndPoint.y,
                        ),
                        barDirection = cellEndVector.clone().sub(cellStartVector),
                        barGeometry = new three.BoxGeometry(0.045, barDirection.length(), 0.045);
                      (barGeometry.applyQuaternion(
                        new three.Quaternion().setFromUnitVectors(
                          new three.Vector3(0, 1, 0),
                          barDirection.normalize(),
                        ),
                      ),
                        barGeometry.translate(
                          ...cellStartVector.add(cellEndVector).multiplyScalar(0.5).toArray(),
                        ),
                        addGeometryByColor(barGeometry, railColor));
                    }
                }
              } else {
                const railingBottomY =
                    drawing.style === "slatwall" ? Math.max(slatBottomY, wallHeight * 0.44) : 0.12,
                  railThickness = Math.min(0.055, (wallHeight - railingBottomY) / 4),
                  railOffset = Math.min(0.12, (wallHeight - railingBottomY) / 4);
                for (const railHeight of [railingBottomY + railOffset, wallHeight - railOffset])
                  addBeam(panelStartPoint, panelEndPoint, railHeight, railThickness, railColor);
                const spindleCount = Math.min(
                  220,
                  Math.max(1, Math.ceil(panelLength / (isMetalStyle ? 0.13 : 0.18))),
                );
                for (let spindleIndex = 1; spindleIndex < spindleCount; spindleIndex++) {
                  const spindleDistance = panelStart + (panelLength * spindleIndex) / spindleCount,
                    spindleThickness = (isMetalStyle ? 0.025 : 0.075) / 2;
                  if (
                    (isAlignedToOpeningEnd && spindleDistance - spindleThickness < panelStart) ||
                    (isAlignedToOpeningStart && spindleDistance + spindleThickness > panelEnd)
                  )
                    continue;
                  const spindlePoint = pointAtDistance(spindleDistance);
                  addBox(
                    spindlePoint.x,
                    (railingBottomY + wallHeight) / 2,
                    spindlePoint.y,
                    spindleThickness * 2,
                    wallHeight - railingBottomY,
                    isMetalStyle ? 0.025 : 0.05,
                    railColor,
                    panelAngleRad,
                  );
                }
              }
            }
          }
          distanceAlong += segmentLength;
        }
      }
    }
  }
  for (const [color, colorGeometries] of geometriesByColor) {
    if (!colorGeometries.length) continue;
    const mergedGeometry = mergeGeometries(colorGeometries, false);
    if (
      (colorGeometries.forEach((disposedGeometry) => disposedGeometry.dispose()), !mergedGeometry)
    )
      continue;
    const isWarmFloor = courtyardNode.type === "courtyard-area" && color === options.floor,
      meshMaterial = new three.MeshStandardMaterial({
        color: color,
        roughness: isWarmFloor ? 0.96 : 0.92,
        metalness: 0,
        emissive: color,
        emissiveIntensity: isWarmFloor ? 0.025 : options.warmWood ? 0.045 : 0.025,
      });
    isWarmFloor && decorateWarmFloor(meshMaterial, options);
    const mesh = new three.Mesh(mergedGeometry, meshMaterial);
    ((mesh.castShadow = true),
      (mesh.receiveShadow = true),
      (courtyardNode.type === "courtyard-area" || courtyardNode.type === "courtyard-path") &&
        (mesh.userData.regionReceiverKind = "floor"),
      drawingGroup.add(mesh));
  }
  return (
    (drawingGroup.userData.courtyardSurface = ["courtyard-area", "courtyard-path"].includes(
      courtyardNode.type,
    )),
    (drawingGroup.userData.squareEdges = true),
    drawingGroup
  );
}
