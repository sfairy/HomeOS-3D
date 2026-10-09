function outlineHull(hullInput: any) {
  const sortedPoints = hullInput
      .slice()
      .sort(
        (leftPoint: any, rightPoint: any) => leftPoint[0] - rightPoint[0] || leftPoint[1] - rightPoint[1],
      ),
    crossProduct = (originPoint: any, secondPoint: any, thirdPoint: any) =>
      (secondPoint[0] - originPoint[0]) * (thirdPoint[1] - originPoint[1]) -
      (secondPoint[1] - originPoint[1]) * (thirdPoint[0] - originPoint[0]),
    buildHullSide = (sortedInput: any) => {
      const stack: any[] = [];
      for (const stackPoint of sortedInput) {
        for (; stack.length > 1 && crossProduct(stack.at(-2), stack.at(-1), stackPoint) <= 0;)
          stack.pop();
        stack.push(stackPoint);
      }
      return stack;
    };
  return [
    ...buildHullSide(sortedPoints).slice(0, -1),
    ...buildHullSide(sortedPoints.reverse()).slice(0, -1),
  ];
}
export function createScreenOutlines({
  THREE: three,
  container: containerElement,
  camera: camera,
  getCamera: getCamera,
  getObjectCamera: getObjectCamera,
  color: outlineColor = "#d5dedb",
  pulse: isPulseEnabled = true,
  editorSelection: isEditorSelection = false,
}: any) {
  const svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
    solidOutlineElement = document.createElementNS("http://www.w3.org/2000/svg", "path"),
    outerGlowElement = document.createElementNS("http://www.w3.org/2000/svg", "path"),
    innerGlowElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
  (svgElement.setAttribute("class", "i3d-model-outlines"),
    svgElement.setAttribute("aria-hidden", "true"));

  const outlineLayers: [SVGPathElement, number, number][] = [
    [outerGlowElement, 10, 0.14],
    [innerGlowElement, 6, 0.22],
    [solidOutlineElement, 2.6, 0.48],
  ];
  for (const [outlinePathElement, outlineWidth, outlineOpacity] of outlineLayers)
    (outlinePathElement.setAttribute("fill", "none"),
      outlinePathElement.setAttribute("stroke", outlineColor),
      outlinePathElement.setAttribute("stroke-width", String(outlineWidth)),
      outlinePathElement.setAttribute("stroke-opacity", String(outlineOpacity)),
      outlinePathElement.setAttribute("stroke-linejoin", "round"),
      outlinePathElement.setAttribute("stroke-linecap", "round"));
  ((outerGlowElement.style.filter = "blur(2px)"),
    (innerGlowElement.style.filter = "blur(.8px)"),
    svgElement.append(outerGlowElement),
    svgElement.append(innerGlowElement),
    svgElement.append(solidOutlineElement),
    containerElement.append(svgElement));
  let cachedModelRoot: any,
    cachedSceneRevision: any,
    cachedModelKey = "",
    outlineModels: any = [],
    isOutlineActive = false,
    isOutlineAvailable = true,
    isDisposed = false,
    cachedRenderKey = "",
    resumeAtTimestamp = 0,
    cachedCameraKey = "",
    pointsByModel = new WeakMap();
  const pulseAnimations =
    globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true ||
    !isPulseEnabled
      ? []
      : [outerGlowElement, innerGlowElement, solidOutlineElement]
          .map((animatedElement) =>
            animatedElement.animate?.(
              [
                {
                  opacity: 1,
                },
                {
                  opacity: 0.3,
                },
                {
                  opacity: 1,
                },
              ],
              {
                duration: 2200,
                iterations: Infinity,
                easing: "ease-in-out",
              },
            ),
          )
          .filter(Boolean);
  let isPulsing = false;
  pulseAnimations.forEach((pulseAnimation) => pulseAnimation.pause());
  function setPulseActive(shouldPulse: any) {
    if (isPulsing !== shouldPulse) {
      isPulsing = shouldPulse;
      for (const animationInstance of pulseAnimations)
        shouldPulse
          ? ((animationInstance.currentTime = 0), animationInstance.play())
          : animationInstance.pause();
    }
  }
  const buildModelKey = (modelRef: any) => JSON.stringify([modelRef.floorId, modelRef.modelId]),
    directionVectors: any = [];
  for (const xIndex of [-1, 0, 1])
    for (const yIndex of [-1, 0, 1])
      for (const zIndex of [-1, 0, 1])
        (xIndex || yIndex || zIndex) &&
          directionVectors.push(new three.Vector3(xIndex, yIndex, zIndex));
  function computeSilhouettePoints(modelRoot: any) {
    const extremePoints = directionVectors.map(() => ({
        score: -Infinity,
        point: null as any,
      })),
      scratchVector = new three.Vector3();
    function walkMeshes(object3d: any, parentMatrix: any) {
      if (
        object3d.userData?.environmentEffect ||
        object3d === modelRoot.userData?.vacuumMobileRoot ||
        (object3d !== modelRoot && object3d.visible === false) ||
        (object3d !== modelRoot && object3d.userData?.fanPart === "yaw") ||
        (object3d !== modelRoot && object3d.userData?.environmentModelId != null)
      )
        return;
      const positionAttribute = object3d.isMesh && object3d.geometry?.attributes?.position;
      if (positionAttribute) {
        for (let vertexIndex = 0; vertexIndex < positionAttribute.count; vertexIndex++)
          (scratchVector
            .fromBufferAttribute(positionAttribute, vertexIndex)
            .applyMatrix4(parentMatrix),
            directionVectors.forEach((direction: any, directionIndex: any) => {
              const projectionDot = scratchVector.dot(direction);
              projectionDot > extremePoints[directionIndex].score &&
                (extremePoints[directionIndex] = {
                  score: projectionDot,
                  point: scratchVector.clone(),
                });
            }));
      }
      for (const childObject of object3d.children || [])
        (childObject.matrixAutoUpdate && childObject.updateMatrix(),
          walkMeshes(
            childObject,
            new three.Matrix4().multiplyMatrices(parentMatrix, childObject.matrix),
          ));
    }
    return (
      walkMeshes(modelRoot, new three.Matrix4()),
      extremePoints
        .filter((candidatePoint: any) => candidatePoint.point)
        .map((extremePoint: any) => extremePoint.point)
    );
  }
  function syncOutlines(syncModelRoot: any, sceneRevision: any, modelList: any, shouldShowOutlines: any) {
    if (isDisposed) return;
    isOutlineActive = shouldShowOutlines;
    const shouldShow =
      shouldShowOutlines && isOutlineAvailable && performance.now() >= resumeAtTimestamp;
    ((svgElement.style.opacity = shouldShow ? "1" : "0"), setPulseActive(shouldShow));
    const modelKeySignature = JSON.stringify(modelList.map(buildModelKey));
    if (
      cachedModelRoot === syncModelRoot &&
      cachedSceneRevision === sceneRevision &&
      cachedModelKey === modelKeySignature
    )
      return;
    ((cachedModelRoot !== syncModelRoot || cachedSceneRevision !== sceneRevision) &&
      (pointsByModel = new WeakMap()),
      (cachedModelRoot = syncModelRoot),
      (cachedSceneRevision = sceneRevision),
      (cachedModelKey = modelKeySignature),
      (cachedRenderKey = ""));
    const modelsByKey = new Map();
    (cachedModelRoot?.traverse((traversedObject: any) => {
      if (isEditorSelection) {
        const editorModelId =
            traversedObject.userData?.editorModelId ?? traversedObject.userData?.environmentModelId,
          editorFloorId =
            traversedObject.userData?.editorFloorId ?? traversedObject.userData?.environmentFloorId;
        editorModelId != null &&
          modelsByKey.set(
            buildModelKey({
              floorId: editorFloorId,
              modelId: editorModelId,
            }),
            traversedObject,
          );
        return;
      }
      if (
        ![
          "door",
          "airer",
          "fan",
          "storagewaterheater",
          "gaswaterheater",
          "airpurifier",
          "wallac",
          "floorac",
          "airoutlet",
          "curtain",
          "nas",
          "fridge",
          "freezer",
          "dishwasher",
          "washer",
          "dryer",
          "plant",
          "speaker",
          "tv",
          "robotvacuum",
          "camera",
          "presence",
        ].includes(traversedObject.userData?.environmentModelType)
      )
        return;
      let floorId = traversedObject.userData.environmentFloorId;
      for (
        let ancestor = traversedObject.parent;
        floorId == null && ancestor;
        ancestor = ancestor.parent
      )
        floorId = ancestor.userData.environmentFloorId;
      modelsByKey.set(
        buildModelKey({
          floorId: floorId,
          modelId: traversedObject.userData.environmentModelId,
        }),
        traversedObject,
      );
    }),
      (outlineModels = modelList.flatMap((outlineModelRef: any) => {
        const outlineModelObject = modelsByKey.get(buildModelKey(outlineModelRef));
        return outlineModelObject ? [outlineModelObject] : [];
      })));
  }
  function collectOutlineRoots(sceneModelRoot: any) {
    if (
      sceneModelRoot.userData.environmentModelType === "fan" ||
      sceneModelRoot.userData.environmentModelType === "ceiling-fan"
    ) {
      const fanParts: any = [];
      return (
        sceneModelRoot.traverse((fanPartObject: any) => {
          fanPartObject.userData?.fanPart === "yaw" && fanParts.push(fanPartObject);
        }),
        [sceneModelRoot, ...fanParts]
      );
    }
    if (sceneModelRoot.userData.environmentModelType === "curtain") {
      const curtainPanels: any = [];
      if (
        (sceneModelRoot.traverse((panel: any) => {
          panel.userData?.curtainMotionPanel && curtainPanels.push(panel);
        }),
        curtainPanels.length)
      )
        return curtainPanels;
    }
    return sceneModelRoot.userData.vacuumMobileRoot
      ? [sceneModelRoot, sceneModelRoot.userData.vacuumMobileRoot]
      : [sceneModelRoot];
  }
  function resolveSilhouettePoints(targetModel: any) {
    const geometry = targetModel.geometry,
      vacuumMobileRoot = targetModel.userData?.vacuumMobileRoot,
      outlineRevision = targetModel.userData?.environmentOutlineRevision;
    if (isEditorSelection && targetModel.userData?.environmentModelType === "door")
      return computeSilhouettePoints(targetModel);
    const cachedEntry = pointsByModel.get(targetModel);
    if (
      cachedEntry &&
      cachedEntry.geometry === geometry &&
      cachedEntry.mobile === vacuumMobileRoot &&
      cachedEntry.pose === outlineRevision
    )
      return cachedEntry.points;
    const silhouettePoints = computeSilhouettePoints(targetModel);
    return (
      pointsByModel.set(targetModel, {
        geometry: geometry,
        mobile: vacuumMobileRoot,
        pose: outlineRevision,
        points: silhouettePoints,
      }),
      silhouettePoints
    );
  }
  function renderOutlines() {
    if (
      isDisposed ||
      !isOutlineActive ||
      !isOutlineAvailable ||
      performance.now() < resumeAtTimestamp
    )
      return;
    ((svgElement.style.transition = "opacity .18s linear"),
      (svgElement.style.opacity = "1"),
      setPulseActive(true));
    const activeCamera = getCamera?.() || camera;
    activeCamera.updateMatrixWorld();
    const widthPx = containerElement.clientWidth,
      heightPx = containerElement.clientHeight,

      outlineEntries: { model: any; points: any; camera?: any }[] = outlineModels
        .filter(
          (outlineCandidate: any) =>
            isEditorSelection || !outlineCandidate.userData?.environmentOutlineMoving,
        )
        .flatMap(collectOutlineRoots)
        .filter((outlineRoot: any) => {
          for (
            let visibleAncestor = outlineRoot;
            visibleAncestor;
            visibleAncestor = visibleAncestor.parent
          )
            if (visibleAncestor.visible === false) return false;
          return true;
        })
        .map((outlineModel: any) => ({
          model: outlineModel,
          points: resolveSilhouettePoints(outlineModel),
        }));
    for (const outlineEntry of outlineEntries)
      (outlineEntry.model.updateWorldMatrix(true, false),
        (outlineEntry.camera = getObjectCamera?.(outlineEntry.model) || activeCamera));
    const renderKey =
      widthPx +
      ":" +
      heightPx +
      ":" +
      activeCamera.matrixWorld.elements +
      ":" +
      activeCamera.projectionMatrix.elements +
      ":" +
      outlineEntries
        .map(
          (entryForKey) =>
            (isEditorSelection && entryForKey.model.userData?.environmentModelType === "door"
              ? entryForKey.points.map((silhouettePoint: any) => silhouettePoint.toArray()).join(",")
              : "") +
            ":" +
            (entryForKey.model.userData?.environmentOutlineRevision ?? "") +
            ":" +
            entryForKey.model.uuid +
            ":" +
            (entryForKey.model.geometry?.uuid || "") +
            ":" +
            entryForKey.model.matrixWorld.elements +
            ":" +
            entryForKey.camera.projectionMatrix.elements,
        )
        .join("|");
    if (renderKey === cachedRenderKey) return;
    ((cachedRenderKey = renderKey),
      svgElement.setAttribute("viewBox", "0 0 " + widthPx + " " + heightPx));
    const projectedVector = new three.Vector3(),
      outlinePathString = outlineEntries
        .map((outlineRecord) => {
          const projectedPoints = outlineRecord.points.map(
            (screenPoint: any) => (
              projectedVector
                .copy(screenPoint)
                .applyMatrix4(outlineRecord.model.matrixWorld)
                .project(outlineRecord.camera),
              [
                ((projectedVector.x + 1) * widthPx) / 2,
                ((1 - projectedVector.y) * heightPx) / 2,
                projectedVector.z,
              ]
            ),
          );
          if (
            projectedPoints.some(
              (projectedPoint: any) => projectedPoint[2] < -1 || projectedPoint[2] > 1,
            )
          )
            return "";
          const hullPoints = outlineHull(projectedPoints);
          return hullPoints.length > 2
            ? "M" +
                hullPoints
                  .map((hullPoint) => hullPoint[0].toFixed(1) + "," + hullPoint[1].toFixed(1))
                  .join("L") +
                "Z"
            : "";
        })
        .join("");
    for (const pathElement of [outerGlowElement, innerGlowElement, solidOutlineElement])
      pathElement.setAttribute("d", outlinePathString);
  }
  function pauseOutlines() {
    isEditorSelection ||
      (setPulseActive(false),
      (resumeAtTimestamp = performance.now() + 120),
      (svgElement.style.transition = "none"),
      (svgElement.style.opacity = "0"));
  }
  return {
    sync: syncOutlines,
    update: renderOutlines,
    pause: pauseOutlines,
    setAvailable(isAvailable: any) {
      isDisposed ||
        isOutlineAvailable === !!isAvailable ||
        ((isOutlineAvailable = !!isAvailable),
        setPulseActive(false),
        (svgElement.style.opacity = "0"),
        isOutlineAvailable && (cachedRenderKey = ""));
    },
    cameraChanged() {
      if (isDisposed || !isOutlineActive || !isOutlineAvailable) return false;
      const cameraRef = getCamera?.() || camera,
        cameraKey = cameraRef.matrixWorld.elements + ":" + cameraRef.projectionMatrix.elements;
      return cameraKey === cachedCameraKey
        ? false
        : ((cachedCameraKey = cameraKey), pauseOutlines(), true);
    },
    nextDelay() {
      return !isDisposed &&
        isOutlineAvailable &&
        isOutlineActive &&
        performance.now() < resumeAtTimestamp
        ? Math.max(1, resumeAtTimestamp - performance.now())
        : Infinity;
    },
    dispose() {
      ((isDisposed = true),
        (isOutlineActive = false),
        pulseAnimations.forEach((animation) => animation.cancel()),
        svgElement.remove(),
        (outlineModels = []));
    },
  };
}
export function createEnvironmentHalos({ THREE: haloThree, modeAmount: modeAmount }: any) {
  const halosById = new Map();
  let cachedHaloRoot: any,
    cachedHaloRevision: any,
    cachedHalosKey: any,
    isHaloActive = false;
  const buildFloorModelKey = (keyFloorId: any, keyModelId: any) =>
      JSON.stringify([String(keyFloorId ?? ""), String(keyModelId ?? "")]),
    planeGeometry = new haloThree.PlaneGeometry(1, 1);
  function computeModelBounds(boundsModel: any) {
    const boundsBox = new haloThree.Box3();
    function walkBounds(boundsObject: any, boundsMatrix: any) {
      if (
        !(boundsObject.userData?.environmentEffect || boundsObject.userData?.curtainMotionRig) &&
        !(boundsObject !== boundsModel && boundsObject.userData?.environmentModelId != null)
      ) {
        boundsObject.isMesh &&
          boundsObject.geometry?.attributes?.position &&
          (boundsObject.geometry.boundingBox || boundsObject.geometry.computeBoundingBox(),
          boundsBox.union(boundsObject.geometry.boundingBox.clone().applyMatrix4(boundsMatrix)));
        for (const boundsChild of boundsObject.children || [])
          (boundsChild.matrixAutoUpdate && boundsChild.updateMatrix(),
            walkBounds(
              boundsChild,
              new haloThree.Matrix4().multiplyMatrices(boundsMatrix, boundsChild.matrix),
            ));
      }
    }
    return (
      walkBounds(boundsModel, new haloThree.Matrix4()),
      boundsBox.isEmpty() ? null : boundsBox
    );
  }
  function disposeHalo(haloRecord: any) {
    (haloRecord.mesh.removeFromParent(), haloRecord.mesh.material.dispose());
  }
  function syncHalos(haloModelRoot: any, haloItems: any, haloSceneRevision: any, modelMap: any) {
    const haloKey = JSON.stringify(
      haloItems.map((haloItem: any) => [
        haloItem.id,
        haloItem.floorId,
        haloItem.modelId,
        haloItem.visible,
        haloItem.deviceKind,
      ]),
    );
    if (
      cachedHaloRoot === haloModelRoot &&
      cachedHaloRevision === haloSceneRevision &&
      cachedHalosKey === haloKey
    )
      return;
    ((cachedHaloRoot = haloModelRoot),
      (cachedHaloRevision = haloSceneRevision),
      (cachedHalosKey = haloKey));
    const resolvedModelByKey = modelMap || new Map();
    !modelMap &&
      haloItems.length &&
      cachedHaloRoot?.traverse((object3dEntry: any) => {
        if (object3dEntry.userData?.environmentModelId == null) return;
        let haloFloorId = object3dEntry.userData.environmentFloorId;
        for (
          let haloAncestor = object3dEntry.parent;
          haloFloorId == null && haloAncestor;
          haloAncestor = haloAncestor.parent
        )
          haloFloorId = haloAncestor.userData.environmentFloorId;
        resolvedModelByKey.set(
          buildFloorModelKey(haloFloorId, object3dEntry.userData.environmentModelId),
          object3dEntry,
        );
      });
    const visibleHaloIdSet = new Set();
    for (const syncHaloItem of haloItems) {
      if (syncHaloItem.visible === false) continue;
      const haloModel = resolvedModelByKey.get(
        buildFloorModelKey(syncHaloItem.floorId, syncHaloItem.modelId),
      );
      if (
        !haloModel ||
        ["smallcar", "fan", "airpurifier", "floorac", "airer"].includes(
          haloModel.userData?.environmentModelType,
        )
      )
        continue;
      const modelBounds = computeModelBounds(haloModel);
      if (!modelBounds) continue;
      const modelSize = modelBounds.getSize(new haloThree.Vector3()),
        modelCenter = modelBounds.getCenter(new haloThree.Vector3()),
        isVerticalHalo =
          haloModel.userData.environmentModelType === "airoutlet" && modelSize.z > modelSize.x,
        haloWidth = isVerticalHalo ? modelSize.z : modelSize.x,
        haloHeight = modelSize.y;
      if (!(haloWidth > 0 && haloHeight > 0)) continue;
      visibleHaloIdSet.add(syncHaloItem.id);
      let halo = halosById.get(syncHaloItem.id);
      if (
        (halo &&
          halo.model !== haloModel &&
          (disposeHalo(halo), halosById.delete(syncHaloItem.id), (halo = null)),
        !halo)
      ) {
        const haloMaterial = new haloThree.ShaderMaterial({
            uniforms: {
              haloMode: modeAmount,
              haloColor: {
                value: new haloThree.Color(0, 0, 0),
              },
              haloSize: {
                value: new haloThree.Vector2(),
              },
              haloFeather: {
                value: 0,
              },
              haloRects: {
                value: Array.from(
                  {
                    length: 3,
                  },
                  () => new haloThree.Vector4(),
                ),
              },
              haloRectCount: {
                value: 1,
              },
            },
            vertexShader:
              "varying vec2 vHaloUv; void main(){ vHaloUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
            fragmentShader:
              "varying vec2 vHaloUv;\n            uniform float haloMode, haloFeather;\n            uniform vec2 haloSize;\n            uniform vec3 haloColor;\n            uniform vec4 haloRects[3];\n            uniform int haloRectCount;\n            void main() {\n              vec2 p = (vHaloUv - 0.5) * (haloSize + vec2(haloFeather * 2.0));\n              float d = 10000.0;\n              for (int i = 0; i < 3; i++) {\n                if (i >= haloRectCount) break;\n                vec4 rect = haloRects[i];\n                float radius = min(rect.z, rect.w) * 0.18;\n                vec2 q = abs(p - rect.xy) - rect.zw + vec2(radius);\n                d = min(d, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius);\n              }\n              float outer = 1.0 - smoothstep(0.0, haloFeather, max(d, 0.0));\n              float alpha = outer * outer * haloMode * 0.025;\n              if (alpha < 0.001) discard;\n              gl_FragColor = vec4(haloColor, alpha);\n              #include <colorspace_fragment>\n            }",
            transparent: true,
            blending: haloThree.AdditiveBlending,
            depthTest: true,
            depthWrite: false,
            side: haloThree.DoubleSide,
            forceSinglePass: true,
            toneMapped: false,
          }),
          haloMesh = new haloThree.Mesh(planeGeometry, haloMaterial);
        ((haloMesh.name = "environment-halo-" + syncHaloItem.id),
          Object.assign(haloMesh.userData, {
            environmentEffect: true,
            environmentHalo: true,
            externalModelSharedGeometry: true,
            externalModelSharedMaterial: true,
          }),
          (haloMesh.raycast = () => {}),
          (haloMesh.visible = false),
          haloModel.add(haloMesh),
          (halo = {
            model: haloModel,
            mesh: haloMesh,
          }),
          halosById.set(syncHaloItem.id, halo));
      }
      const haloFeather = Math.max(0.025, Math.min(0.07, Math.min(haloWidth, haloHeight) * 0.15));
      (halo.mesh.material.uniforms.haloSize.value.set(haloWidth, haloHeight),
        (halo.mesh.material.uniforms.haloFeather.value = haloFeather),
        halo.mesh.scale.set(haloWidth + haloFeather * 2, haloHeight + haloFeather * 2, 1),
        halo.mesh.position.copy(modelCenter),
        (halo.mesh.rotation.y = isVerticalHalo ? Math.PI / 2 : 0),
        isVerticalHalo
          ? (halo.mesh.position.x = modelBounds.max.x + 0.006)
          : (halo.mesh.position.z = modelBounds.max.z + 0.006),
        halo.mesh.updateMatrix(),
        (halo.center = modelCenter),
        (halo.bounds = modelBounds),
        (halo.width = haloWidth),
        (halo.height = haloHeight),
        (halo.panels = []),
        haloModel.userData.environmentModelType === "curtain" &&
          haloModel.traverse((curtainPanel: any) => {
            curtainPanel.userData.curtainMotionPanel && halo.panels.push(curtainPanel);
          }),
        (halo.pose = null),
        updateHaloPanels(halo));
    }
    for (const [staleHaloId, staleHalo] of halosById)
      visibleHaloIdSet.has(staleHaloId) || (disposeHalo(staleHalo), halosById.delete(staleHaloId));
  }
  function updateHaloPanels(targetHalo: any) {
    const panelPoseKey = targetHalo.panels
      .map((panelRef: any) => panelRef.visible + ":" + panelRef.scale.x)
      .join("|");
    if (panelPoseKey === targetHalo.pose) return;
    targetHalo.pose = panelPoseKey;
    const uniforms = targetHalo.mesh.material.uniforms,
      haloRects = uniforms.haloRects.value,
      visiblePanels = targetHalo.panels.filter((visiblePanel: any) => visiblePanel.visible);
    if (!visiblePanels.length) {
      ((uniforms.haloRectCount.value = 1),
        haloRects[0].set(0, 0, targetHalo.width / 2, targetHalo.height / 2));
      return;
    }
    let rectIndex = 0;
    for (const panelNode of visiblePanels.slice(0, 2)) {
      const panelAncestry: any[] = [];
      for (
        let panelAncestor = panelNode;
        panelAncestor && panelAncestor !== targetHalo.model;
        panelAncestor = panelAncestor.parent
      )
        panelAncestry.unshift(panelAncestor);
      const panelMatrix = new haloThree.Matrix4();
      for (const ancestryNode of panelAncestry)
        (ancestryNode.matrixAutoUpdate && ancestryNode.updateMatrix(),
          panelMatrix.multiply(ancestryNode.matrix));
      panelNode.geometry.boundingBox || panelNode.geometry.computeBoundingBox();
      const panelBounds = panelNode.geometry.boundingBox.clone().applyMatrix4(panelMatrix),
        panelCenter = panelBounds.getCenter(new haloThree.Vector3()),
        panelSize = panelBounds.getSize(new haloThree.Vector3());
      haloRects[rectIndex++].set(
        panelCenter.x - targetHalo.center.x,
        panelCenter.y - targetHalo.center.y,
        panelSize.x / 2,
        panelSize.y / 2,
      );
    }
    uniforms.haloRectCount.value = rectIndex;
  }
  function updateHalos() {
    if (isHaloActive) {
      for (const updatedHalo of halosById.values())
        updatedHalo.panels.length && updateHaloPanels(updatedHalo);
    }
  }
  function setHaloColor(itemId: any, color: any) {
    const colorHalo = halosById.get(itemId);
    colorHalo &&
      (colorHalo.mesh.material.uniforms.haloColor.value.copy(color),
      (colorHalo.mesh.visible = isHaloActive && color.r + color.g + color.b > 0));
  }
  function setHalosVisible(shouldShowHalos: any) {
    isHaloActive = shouldShowHalos;
    for (const visibilityHalo of halosById.values()) {
      const haloColor = visibilityHalo.mesh.material.uniforms.haloColor.value;
      visibilityHalo.mesh.visible = isHaloActive && haloColor.r + haloColor.g + haloColor.b > 0;
    }
  }
  function clearHalos() {
    for (const clearedHalo of halosById.values()) disposeHalo(clearedHalo);
    (halosById.clear(),
      (cachedHaloRoot = null),
      (cachedHaloRevision = undefined),
      (cachedHalosKey = undefined));
  }
  return {
    sync: syncHalos,
    setColor: setHaloColor,
    setVisible: setHalosVisible,
    clear: clearHalos,
    update: updateHalos,
    dispose() {
      (clearHalos(), planeGeometry.dispose());
    },
  };
}
